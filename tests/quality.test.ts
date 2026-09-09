import { describe, expect, it } from "vitest";
import { activityRows, buildModel, graphView, type InputRow } from "../src/model";
import { layoutGraph, NODE_SIZE } from "../src/layout";
import { DEFAULT_NAVIGATION, parseNavigation } from "../src/navigation";

function build(rows: InputRow[]) {
  return buildModel(rows, { hasDuration: true, hasVariant: true, receivedRows: rows.length, hostPartial: false, metric: { statistic: "p95", unit: "hours", provenance: "Independently prepared" } });
}
describe("independent expected-value oracles", () => {
  for (let seed = 1; seed <= 12; seed++) {
    it(`matches exact edge frequency/grain oracle for seeded cyclic graph ${seed}`, () => {
      let state = seed;
      const next = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state; };
      const rows: InputRow[] = Array.from({ length: 120 }, (_, index) => ({
        index, source: `N${next() % 11}`, target: `N${next() % 11}`,
        variant: `V${next() % 3}`, frequency: next() % 100, duration: (next() % 300) / 10
      }));
      const model = build(rows);
      for (const variant of [null, "V0", "V1", "V2"]) {
        const view = graphView(model, variant, null, "all");
        const applicable = rows.filter(row => variant === null || row.variant === variant);
        const pairs = new Set(applicable.map(row => `${row.source}|${row.target}`));
        expect(view.edges.length).toBe(pairs.size);
        for (const edge of view.edges) {
          const contributing = applicable.filter(row => row.source === edge.source && row.target === edge.target);
          const expected = contributing.reduce((sum, row) => sum + BigInt(Number(row.frequency)), 0n);
          expect(BigInt(edge.frequency!)).toBe(expected);
          expect(edge.rows).toEqual(contributing.map(row => row.index));
          expect(edge.duration).toBe(contributing.length === 1 ? contributing[0]!.duration : null);
        }
      }
      const aggregate = graphView(model, null, null, "all");
      for (const origin of model.nodes) {
        const queue = [origin], reached = new Set(queue);
        for (let cursor = 0; cursor < queue.length; cursor++) {
          for (const row of rows.filter(row => row.source === queue[cursor])) {
            const target = String(row.target);
            if (!reached.has(target)) { reached.add(target); queue.push(target); }
          }
        }
        const actual = graphView(model, null, origin, "downstream");
        expect(actual.edges.map(edge => edge.key)).toEqual(aggregate.edges.filter(edge => reached.has(edge.source) && reached.has(edge.target)).map(edge => edge.key));
        expect(activityRows(aggregate.edges, origin)).toEqual(rows.filter(row => row.source === origin || row.target === origin).map(row => row.index));
      }
    });
  }
  it("keeps disjoint variant identities and cannot reconstruct paths from their union", () => {
    const rows = [
      { index: 0, source: "A", target: "B", variant: "V1", frequency: 2, duration: 1 },
      { index: 1, source: "B", target: "C", variant: "V2", frequency: 3, duration: 2 }
    ];
    const model = build(rows);
    expect(graphView(model, "V1", "A", "downstream").nodes).toEqual(["A", "B"]);
    expect(graphView(model, null, "A", "downstream").nodes).toEqual(["A", "B", "C"]);
    expect("paths" in model).toBe(false);
    expect("cases" in model).toBe(false);
  });
  it("does not mistake frequency for a duration weighting denominator", () => {
    const rows = [
      { index: 0, source: "A", target: "B", frequency: 1000, duration: 1, variant: "v" },
      { index: 1, source: "A", target: "B", frequency: 1, duration: 500, variant: "v" }
    ];
    expect(build(rows).edges[0]).toMatchObject({ frequency: 1001, duration: null, durationReason: "duplicateDuration" });
  });
});
describe("bounded ranked layout", () => {
  it("orders acyclic flow while retaining cycles, self-loops and disconnected activity bounds", () => {
    const model = build([
      { index: 0, source: "Open", target: "Triage", frequency: 2 },
      { index: 1, source: "Triage", target: "Wait", frequency: 1 },
      { index: 2, source: "Wait", target: "Triage", frequency: 1 },
      { index: 3, source: "Triage", target: "Triage", frequency: 1 },
      { index: 4, source: "Triage", target: "Closed", frequency: 2 }
    ]);
    const layout = layoutGraph(model.nodes, model.edges);
    const positions = new Map(layout.nodes.map(node => [node.id, node]));
    expect(positions.get("Open")!.x).toBeLessThan(positions.get("Triage")!.x);
    expect(positions.get("Triage")!.x).toBeLessThan(positions.get("Closed")!.x);
    expect(layout.edges).toHaveLength(5);
    for (const node of layout.nodes) {
      expect(node.x - NODE_SIZE.width / 2).toBeGreaterThan(0);
      expect(node.y - NODE_SIZE.height / 2).toBeGreaterThan(0);
      expect(node.x + NODE_SIZE.width / 2).toBeLessThan(layout.width);
      expect(node.y + NODE_SIZE.height / 2).toBeLessThan(layout.height);
    }
    expect(layoutGraph(model.nodes, model.edges.slice(0, 1), model.edges).nodes).toEqual(layout.nodes);
    expect(layoutGraph(model.nodes, model.edges.slice(0, 1), model.edges).height).toBe(layout.height);
  });
});
describe("bookmark input boundaries", () => {
  it("round-trips local navigation separately from report selections", () => {
    const navigation = { ...DEFAULT_NAVIGATION, focus: "Triage", variant: "", overlay: "duration", mode: "upstream", zoom: 3, panel: "table" };
    expect(parseNavigation(JSON.stringify(navigation))).toEqual({ value: navigation, invalid: false });
    expect("selection" in parseNavigation(JSON.stringify(navigation)).value).toBe(false);
  });
  it.each(["{", "null", "[]", '"state"', JSON.stringify({ ...DEFAULT_NAVIGATION, zoom: -1 }), JSON.stringify({ ...DEFAULT_NAVIGATION, mode: "causal" }), JSON.stringify({ ...DEFAULT_NAVIGATION, query: "x".repeat(121) })])("diagnoses invalid saved state %s", token => {
    expect(parseNavigation(token)).toEqual({ value: DEFAULT_NAVIGATION, invalid: true });
  });
});
