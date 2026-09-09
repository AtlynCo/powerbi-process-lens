import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./SupportTickets/", import.meta.url));
const read = path => readFileSync(path, "utf8");
const json = path => JSON.parse(read(path));
let checkedJson = 0;
function checkJsonTree(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) checkJsonTree(path);
    else if (/\.(?:json|pbip|pbir|pbism)$/u.test(entry.name)) { json(path); checkedJson += 1; }
  }
}
checkJsonTree(root);
const project = json(join(root, "SupportTickets.pbip"));
const report = resolve(root, project.artifacts[0].report.path);
const binding = json(join(report, "definition.pbir"));
const model = resolve(report, binding.datasetReference.byPath.path);
assert(existsSync(join(model, "definition.pbism")), "Missing referenced semantic model.");
const tableText = read(join(model, "definition", "tables", "Prepared Transitions.tmdl"));
const columns = [...tableText.matchAll(/^\tcolumn (\w+)$/gmu)].map(match => match[1]);
assert.deepEqual(columns, ["source", "target", "frequency", "duration", "variant", "rowKey", "statistic", "unit", "provenance"]);
assert.equal((tableText.match(/summarizeBy: none/gu) ?? []).length, 9);
assert(tableText.includes("File.Contents(CsvPath)"));
assert(!tableText.includes("events.csv"));
assert(tableText.includes("COUNTROWS('Prepared Transitions') = 1"));
assert(read(join(model, "definition", "expressions.tmdl")).includes("IsParameterQuery=true"));
const pages = json(join(report, "definition", "pages", "pages.json"));
assert(pages.pageOrder.includes(pages.activePageName));
let nativeTables = 0;
for (const name of pages.pageOrder) {
  const pageDirectory = join(report, "definition", "pages", name);
  assert.equal(json(join(pageDirectory, "page.json")).name, name);
  for (const entry of readdirSync(join(pageDirectory, "visuals"))) {
    const visual = json(join(pageDirectory, "visuals", entry, "visual.json"));
    assert.equal(visual.visual.visualType, "tableEx", "Sample intentionally uses only a native table.");
    nativeTables += 1;
    for (const projection of visual.visual.query.queryState.Values.projections) {
      const field = projection.field.Column ?? projection.field.Measure;
      assert.equal(field.Expression.SourceRef.Entity, "Prepared Transitions");
      if (projection.field.Column) assert(columns.includes(field.Property));
      else assert(tableText.includes(`measure '${field.Property}' =`));
    }
  }
}
assert.equal(nativeTables, 1);
console.log(`Verified ${checkedJson} JSON documents, local report/model references, 9 source columns, guarded duration measure, and 1 native table. Native Desktop/PBIR-schema/TMDL-engine validation remains unverified.`);
