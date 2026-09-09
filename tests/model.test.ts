import { describe, expect, it } from "vitest";
import type powerbi from "powerbi-visuals-api";
import { activityRows, buildModel, graphView, LIMITS, type InputRow, type ModelOptions } from "../src/model";
import { layoutGraph } from "../src/layout";
import { readDataView } from "../src/dataView";
import { DEFAULTS, formattingModel, readSettings } from "../src/settings";
import { isRtl, translator } from "../src/i18n";

const options: ModelOptions = {
  receivedRows: 1, hasDuration: true, hasVariant: true, hostPartial: false,
  metric: { statistic: "p95", unit: "hours", provenance: "Offline transition intervals" }
};
function row(index: number, source = "A", target = "B", frequency = 4, duration = 8, variant = "v1"): InputRow {
  return { index, source, target, frequency, duration, variant };
}
function model(rows: InputRow[], patch: Partial<ModelOptions> = {}) {
  return buildModel(rows, { ...options, receivedRows: rows.length, ...patch });
}
describe("prepared-transition semantics", () => {
  it("retains cycles, repeated edges, self-loops and zero-frequency topology", () => {
    const result = model([row(0), row(1, "B", "A"), row(2, "A", "A", 0)]);
    expect(result.edges).toHaveLength(3);
    expect(result.nodes).toEqual(["A", "B"]);
    expect(result.edges.find(edge => edge.source === edge.target)?.frequency).toBe(0);
  });
  it("adds duplicate frequencies but never sums or averages p95 duration", () => {
    const result = model([row(0), row(1, "A", "B", 6, 20)]);
    expect(result.edges[0]).toMatchObject({ frequency: 10, duration: null, durationReason: "duplicateDuration", rows: [0, 1] });
    expect(result.issues).toContainEqual({ code: "duplicateDuration", count: 1 });
  });
  it.each(["mean", "median", "p95", "total", "custom"])("never invents duplicate %s semantics", statistic => {
    const result = model([row(0), row(1)], { metric: { ...options.metric, statistic } });
    expect(result.edges[0]?.duration).toBeNull();
  });
  it("disables ambiguous cross-variant durations and exposes constituent identities", () => {
    const result = model([row(0), row(1, "A", "B", 6, 20, "v2")]);
    const aggregate = graphView(result, null, null, "all");
    expect(aggregate.edges[0]).toMatchObject({ frequency: 10, duration: null, durationReason: "variantDuration", rows: [0, 1] });
    expect(aggregate.issues).toContainEqual({ code: "variantDuration", count: 1 });
    expect(graphView(result, "v2", null, "all").edges[0]).toMatchObject({ frequency: 6, duration: 20, rows: [1] });
  });
  it.each([null, undefined, -1, Infinity, NaN, "7"])("retains valid frequency when duration %s is invalid", duration => {
    const result = model([{ ...row(0), duration }]);
    expect(result.edges[0]).toMatchObject({ frequency: 4, duration: null, durationReason: "invalidDuration" });
  });
  it.each(["statistic", "unit"] as const)("requires explicit duration %s", field => {
    const result = model([row(0)], { metric: { ...options.metric, [field]: "" } });
    expect(result.edges[0]).toMatchObject({ frequency: 4, duration: null, durationReason: "durationMetadata" });
  });
  it("does not diagnose duration when unbound", () => {
    expect(model([row(0)], { hasDuration: false }).issues).toEqual([]);
  });
  it.each([null, undefined, -1, NaN, Infinity, "4", 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid frequency %s", frequency => {
    const result = model([{ ...row(0), frequency }]);
    expect(result.edges).toEqual([]);
    expect(result.partial).toBe(true);
    expect(result.issues).toContainEqual({ code: "invalidFrequency", count: 1 });
  });
  it.each(["", "  ", "\nA", "x".repeat(121), 1, null, {}])("diagnoses invalid source %s", source => {
    const result = model([{ ...row(0), source }]);
    expect(result.edges).toEqual([]);
    expect(result.issues).toContainEqual({ code: "invalidId", count: 1 });
  });
  it("keeps distinct IDs safe from delimiter or prototype collisions", () => {
    const result = model([row(0, "a|b", "c"), row(1, "a", "b|c"), row(2, "__proto__", "constructor")]);
    expect(result.edges).toHaveLength(3);
  });
  it("retains topology when additive frequency overflows", () => {
    const result = model([row(0, "A", "B", Number.MAX_SAFE_INTEGER), row(1)]);
    expect(result.edges[0]?.frequency).toBeNull();
    expect(result.edges[0]?.rows).toEqual([0, 1]);
    expect(result.issues).toContainEqual({ code: "overflow", count: 1 });
  });
  it("diagnoses aggregate-variant overflow", () => {
    const result = graphView(model([row(0, "A", "B", Number.MAX_SAFE_INTEGER), row(1, "A", "B", 4, 8, "v2")]), null, null, "all");
    expect(result.edges[0]?.frequency).toBeNull();
    expect(result.issues).toContainEqual({ code: "overflow", count: 1 });
  });
  it("distinguishes blank and literal blank-label variants", () => {
    const result = model([row(0, "A", "B", 1, 1, ""), row(1, "A", "B", 1, 1, "(Blank variant)")]);
    expect(result.variants).toEqual(["", "(Blank variant)"]);
    expect(graphView(result, "", null, "all").edges[0]?.rows).toEqual([0]);
  });
  it("bounds received rows, nodes and variant edges with honest partial state", () => {
    const rowLimited = model(Array.from({ length: 2100 }, (_, i) => row(i)));
    expect(rowLimited.acceptedRows).toBe(2000);
    expect(rowLimited.partial).toBe(true);
    const nodeLimited = model(Array.from({ length: 100 }, (_, i) => row(i, `node${i}`, `node${i + 1}`)));
    expect(nodeLimited.nodes.length).toBeLessThanOrEqual(LIMITS.nodes);
    expect(nodeLimited.issues.some(issue => issue.code === "graphLimit")).toBe(true);
    const edgeLimited = model(Array.from({ length: 400 }, (_, i) => row(i, "A", "B", 1, 2, `v${i}`)));
    expect(edgeLimited.edges).toHaveLength(300);
    expect(edgeLimited.partial).toBe(true);
  });
  it("explicitly diagnoses host segments and resets to each supplied dataset", () => {
    expect(model([row(0)], { hostPartial: true }).partial).toBe(true);
    expect(model([]).edges).toEqual([]);
  });
});
describe("bounded local navigation and stable layout", () => {
  const result = model([row(0), row(1, "B", "C"), row(2, "C", "B"), row(3, "D", "A"), row(4, "X", "Y"), row(5, "A", "A")]);
  it("terminates directional traversal on cycles and does not include disconnected edges", () => {
    expect(graphView(result, null, "B", "downstream").nodes).toEqual(["B", "C"]);
    expect(graphView(result, null, "B", "upstream").nodes).toEqual(["A", "B", "C", "D"]);
    expect(graphView(result, null, "A", "neighbors").edges).toHaveLength(3);
  });
  it("maps activities to all represented incident rows, self-loop once", () => {
    expect(activityRows(result.edges, "A").sort()).toEqual([0, 3, 5]);
  });
  it("is deterministic under input permutation; retains all bounded topology", () => {
    const first = layoutGraph(result.nodes, result.edges);
    const reversed = model([...result.edges].reverse().map((edge, i) => row(i, edge.source, edge.target)));
    expect(layoutGraph(reversed.nodes, reversed.edges).nodes).toEqual(first.nodes);
    expect(first.edges).toHaveLength(result.edges.length);
    for (const edge of first.edges) expect(edge.path).not.toMatch(/NaN|Infinity/);
  });
  it("keeps activity positions stable when variants or focus filter edges", () => {
    const filtered = graphView(result, null, "A", "neighbors");
    expect(layoutGraph(result.nodes, filtered.edges, result.edges).nodes).toEqual(layoutGraph(result.nodes, result.edges).nodes);
  });
  it("uses distinct curves for opposite directions and a visible self-loop", () => {
    const layout = layoutGraph(["A", "B"], model([row(0), row(1, "B", "A"), row(2, "A", "A")]).edges);
    expect(new Set(layout.edges.map(edge => edge.path)).size).toBe(3);
    expect(layout.edges.some(edge => edge.path.includes(" C "))).toBe(true);
  });
});
describe("Power BI binding, formatting and locales", () => {
  it("diagnoses empty and ambiguous bindings", () => {
    expect(readDataView(undefined, DEFAULTS).issues).toContainEqual({ code: "binding", count: 1 });
    expect(readDataView({ metadata: { columns: [] }, table: { columns: [], rows: [] } }, DEFAULTS).edges).toEqual([]);
  });
  it("reads table fields by roles rather than column order", () => {
    const columns: powerbi.DataViewMetadataColumn[] = [
      { displayName: "f", roles: { frequency: true } },
      { displayName: "t", roles: { target: true } },
      { displayName: "s", roles: { source: true } }
    ];
    const result = readDataView({ metadata: { columns, segment: {} }, table: { columns, rows: [[12, "B", "A"]] } }, DEFAULTS);
    expect(result.edges[0]).toMatchObject({ source: "A", target: "B", frequency: 12 });
    expect(result.partial).toBe(true);
  });
  it("safely normalizes settings and exposes modern revert descriptors", () => {
    const settings = readSettings({ appearance: { edgeColor: { solid: { color: "url(https://bad.invalid)" } }, showLabels: false }, metrics: { statistic: " mean ", unit: "h" } });
    expect(settings.edgeColor).toBe(DEFAULTS.edgeColor);
    expect(settings.showLabels).toBe(false);
    expect(settings.metric.statistic).toBe("mean");
    const cards = formattingModel(settings, translator("en-US")).cards;
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveProperty("revertToDefaultDescriptors");
  });
  it("localizes French, falls back explicitly to English and chooses RTL independently", () => {
    expect(translator("fr-FR")("frequency")).toContain("Frequence");
    expect(translator("ar-SA")("frequency")).toBe(translator("en-US")("frequency"));
    expect(isRtl("he-IL")).toBe(true);
    expect(isRtl("fr-FR")).toBe(false);
  });
});
