import type powerbi from "powerbi-visuals-api";
import { addIssue, buildModel, LIMITS, type ProcessModel } from "./model";
import type { Settings } from "./settings";

export function readDataView(dataView: powerbi.DataView | undefined, settings: Settings): ProcessModel {
  const table = dataView?.table;
  const columns = table?.columns ?? [];
  const role = (name: string) => columns.findIndex(column => column.roles?.[name]);
  const source = role("source"), target = role("target"), frequency = role("frequency");
  const duration = role("duration"), variant = role("variant");
  const cardinality = (name: string) => columns.filter(column => column.roles?.[name]).length;
  const valid = ["source", "target", "frequency"].every(name => cardinality(name) === 1) &&
    ["duration", "variant", "rowKey"].every(name => cardinality(name) <= 1) && cardinality("tooltip") <= 6;
  const rows = table?.rows ?? [];
  const model = buildModel(valid ? rows.slice(0, LIMITS.rows).map((row, index) => ({
    index, source: row[source], target: row[target], frequency: row[frequency],
    duration: duration >= 0 ? row[duration] : undefined,
    variant: variant >= 0 ? row[variant] : undefined
  })) : [], {
    receivedRows: rows.length, hasDuration: duration >= 0, hasVariant: variant >= 0,
    hostPartial: dataView?.metadata.segment !== undefined,
    metric: settings.metric
  });
  if (!valid) addIssue(model.issues, "binding");
  return model;
}
