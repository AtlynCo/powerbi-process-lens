export const LIMITS = Object.freeze({ rows: 2000, nodes: 80, edges: 300, idLength: 120 });

export type IssueCode = "binding" | "invalidId" | "invalidVariant" | "invalidFrequency" |
  "invalidDuration" | "durationMetadata" | "duplicateDuration" | "variantDuration" |
  "overflow" | "rowLimit" | "graphLimit" | "hostPartial" | "identity" | "segment";

export interface Issue { code: IssueCode; count: number }
export interface MetricSpec { statistic: string; unit: string; provenance: string }
export interface InputRow {
  index: number;
  source: unknown;
  target: unknown;
  frequency: unknown;
  duration?: unknown;
  variant?: unknown;
}
export interface Edge {
  key: string;
  source: string;
  target: string;
  variant: string;
  frequency: number | null;
  duration: number | null;
  durationReason?: IssueCode;
  rows: number[];
}
export interface ProcessModel {
  edges: Edge[];
  nodes: string[];
  variants: string[];
  issues: Issue[];
  receivedRows: number;
  acceptedRows: number;
  hasDuration: boolean;
  hasVariant: boolean;
  partial: boolean;
  metric: MetricSpec;
}
export interface ModelOptions {
  receivedRows: number;
  hasDuration: boolean;
  hasVariant: boolean;
  hostPartial: boolean;
  metric: MetricSpec;
}

export function addIssue(issues: Issue[], code: IssueCode, count = 1): void {
  const existing = issues.find(issue => issue.code === code);
  if (existing) existing.count += count;
  else issues.push({ code, count });
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= LIMITS.idLength && !/\p{Cc}/u.test(value);
}

function frequency(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function duration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function edgeKey(source: string, target: string, variant = ""): string {
  return JSON.stringify([source, target, variant]);
}

export function buildModel(rows: InputRow[], options: ModelOptions): ProcessModel {
  const issues: Issue[] = [];
  const edges = new Map<string, Edge>();
  const nodes = new Set<string>();
  let acceptedRows = 0;
  const hasMetadata = !!options.metric.statistic.trim() && !!options.metric.unit.trim();
  if (options.hostPartial) addIssue(issues, "hostPartial");
  if (options.receivedRows > LIMITS.rows) addIssue(issues, "rowLimit", options.receivedRows - LIMITS.rows);
  if (options.hasDuration && !hasMetadata) addIssue(issues, "durationMetadata");
  for (const row of rows.slice(0, LIMITS.rows)) {
    if (!validId(row.source) || !validId(row.target)) {
      addIssue(issues, "invalidId");
      continue;
    }
    // Missing variant is an explicit blank group, distinct from any literal label.
    const variant = row.variant == null || row.variant === "" ? "" : row.variant;
    if (options.hasVariant && variant !== "" && !validId(variant)) {
      addIssue(issues, "invalidVariant");
      continue;
    }
    if (!frequency(row.frequency)) {
      addIssue(issues, "invalidFrequency");
      continue;
    }
    const group = options.hasVariant && typeof variant === "string" ? variant : "";
    const key = edgeKey(row.source, row.target, group);
    const existing = edges.get(key);
    const newNodes = new Set([row.source, row.target].filter(id => !nodes.has(id))).size;
    if (!existing && (edges.size >= LIMITS.edges || nodes.size + newNodes > LIMITS.nodes)) {
      addIssue(issues, "graphLimit");
      continue;
    }
    let durationValue: number | null = null;
    let durationReason: IssueCode | undefined;
    if (options.hasDuration) {
      if (!duration(row.duration)) {
        addIssue(issues, "invalidDuration");
        durationReason = "invalidDuration";
      } else if (!hasMetadata) durationReason = "durationMetadata";
      else durationValue = row.duration;
    }
    if (existing) {
      const sum = existing.frequency === null ? null : existing.frequency + row.frequency;
      if (sum !== null && !Number.isSafeInteger(sum)) addIssue(issues, "overflow");
      existing.frequency = sum !== null && Number.isSafeInteger(sum) ? sum : null;
      existing.rows.push(row.index);
      if (options.hasDuration) {
        if (existing.rows.length === 2) addIssue(issues, "duplicateDuration");
        existing.duration = null;
        existing.durationReason = "duplicateDuration";
      }
    } else {
      edges.set(key, {
        key, source: row.source, target: row.target, variant: group,
        frequency: row.frequency, duration: durationValue, durationReason, rows: [row.index]
      });
    }
    nodes.add(row.source);
    nodes.add(row.target);
    acceptedRows++;
  }
  return {
    edges: [...edges.values()].sort((a, b) => compareIds(a.key, b.key)),
    nodes: [...nodes].sort(compareIds),
    variants: [...new Set([...edges.values()].map(edge => edge.variant))].sort(compareIds),
    issues, receivedRows: options.receivedRows, acceptedRows,
    hasDuration: options.hasDuration, hasVariant: options.hasVariant,
    partial: issues.some(issue => ["hostPartial", "rowLimit", "graphLimit", "invalidId", "invalidFrequency", "invalidVariant"].includes(issue.code)),
    metric: options.metric
  };
}

export interface GraphView { edges: Edge[]; nodes: string[]; issues: Issue[] }
export type FocusMode = "all" | "neighbors" | "upstream" | "downstream";

export function graphView(model: ProcessModel, variant: string | null, focus: string | null, mode: FocusMode): GraphView {
  const issues: Issue[] = [];
  const aggregate = new Map<string, Edge>();
  for (const edge of model.edges) {
    if (variant !== null && edge.variant !== variant) continue;
    const key = edgeKey(edge.source, edge.target);
    const existing = aggregate.get(key);
    if (!existing) aggregate.set(key, { ...edge, key, rows: [...edge.rows] });
    else {
      const sum = existing.frequency === null || edge.frequency === null ? null : existing.frequency + edge.frequency;
      if (sum !== null && !Number.isSafeInteger(sum)) addIssue(issues, "overflow");
      existing.frequency = sum !== null && Number.isSafeInteger(sum) ? sum : null;
      existing.rows.push(...edge.rows);
      if (model.hasDuration) {
        if (existing.durationReason !== "variantDuration") addIssue(issues, "variantDuration");
        existing.duration = null;
        existing.durationReason = "variantDuration";
      }
    }
  }
  let edges = [...aggregate.values()];
  for (const edge of edges) edge.rows.sort((a, b) => a - b);
  if (focus && mode !== "all") {
    const included = new Set([focus]);
    if (mode === "neighbors") {
      for (const edge of edges) {
        if (edge.source === focus) included.add(edge.target);
        if (edge.target === focus) included.add(edge.source);
      }
    } else {
      // At most 80 activities: fixed-point traversal terminates even on cycles.
      for (let pass = 0; pass < LIMITS.nodes; pass++) {
        const previous = included.size;
        for (const edge of edges) {
          if (mode === "downstream" && included.has(edge.source)) included.add(edge.target);
          if (mode === "upstream" && included.has(edge.target)) included.add(edge.source);
        }
        if (included.size === previous) break;
      }
    }
    edges = edges.filter(edge => mode === "neighbors"
      ? edge.source === focus || edge.target === focus
      : included.has(edge.source) && included.has(edge.target));
  }
  return {
    edges,
    nodes: [...new Set(edges.flatMap(edge => [edge.source, edge.target]))].sort(compareIds),
    issues
  };
}

export function activityRows(edges: Edge[], activity: string): number[] {
  return [...new Set(edges.filter(edge => edge.source === activity || edge.target === activity).flatMap(edge => edge.rows))].sort((a, b) => a - b);
}
