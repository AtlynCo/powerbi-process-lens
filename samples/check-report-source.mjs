import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { guid, version, pageIds, roleFields, resourcePackage, reportDefinitionVersion } from "./author-report.mjs";
import { parseCsv, prepare, serialize, provenance } from "./prepare-transitions.mjs";

const flags = process.argv.slice(2);
assert(flags.every(flag => ["--allow-unsynced", "--schemas", "--self-test"].includes(flag)), "Usage: node samples\\check-report-source.mjs [--allow-unsynced] [--schemas] [--self-test]");
function checkDefinitionPreflight(modelText, versionMetadata) {
  const references = modelText.replaceAll("\r\n", "\n").match(/^[\t ]*ref .+$/gmu) ?? [];
  assert.deepEqual(references, [
    "ref table 'Prepared Transitions'", "ref expression CsvPath", "ref expression PreparedCsvBase64"
  ], "References must be top-level TMDL declarations for the prepared table and expressions.");
  assert.deepEqual(versionMetadata, reportDefinitionVersion, "Required PBIR definition/version.json must declare the authored report version.");
}
if (flags.includes("--self-test")) {
  const valid = "model Model\n\tculture: en-US\n\nref table 'Prepared Transitions'\nref expression CsvPath\nref expression PreparedCsvBase64\n";
  checkDefinitionPreflight(valid, reportDefinitionVersion);
  assert.throws(() => checkDefinitionPreflight(valid.replace("\nref table", "\n\tref table"), reportDefinitionVersion), /References must be top-level/u);
  assert.throws(() => checkDefinitionPreflight(valid.replace("\nref expression", "\n\tref expression"), reportDefinitionVersion), /References must be top-level/u);
  assert.throws(() => checkDefinitionPreflight(valid, undefined), /Required PBIR/u);
  assert.throws(() => checkDefinitionPreflight(valid, { ...reportDefinitionVersion, version: "0.0.0" }), /Required PBIR/u);
  console.log("Definition preflight self-tests passed: indented table/expression references and missing/wrong PBIR version metadata are rejected.");
}
const root = fileURLToPath(new URL("./SupportTickets/", import.meta.url));
const read = path => readFileSync(path, "utf8");
const documents = [];
const json = path => JSON.parse(read(path));
function checkJsonTree(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) checkJsonTree(path);
    else if (/\.(?:json|pbip|pbir|pbism)$/u.test(entry.name)) documents.push({ path, value: json(path) });
  }
}
checkJsonTree(root);
const project = json(join(root, "SupportTickets.pbip"));
const report = resolve(root, project.artifacts[0].report.path);
const binding = json(join(report, "definition.pbir"));
assert(!binding.datasetReference.byConnection, "The sample must remain local/offline.");
const model = resolve(report, binding.datasetReference.byPath.path);
assert(existsSync(join(model, "definition.pbism")), "Missing referenced semantic model.");
const versionPath = join(report, "definition", "version.json");
assert(existsSync(versionPath), "Required PBIR definition/version.json is missing.");
checkDefinitionPreflight(read(join(model, "definition", "model.tmdl")), json(versionPath));
const tableText = read(join(model, "definition", "tables", "Prepared Transitions.tmdl"));
const columns = [...tableText.matchAll(/^\tcolumn (\w+)$/gmu)].map(match => match[1]);
assert.deepEqual(columns, ["source", "target", "frequency", "duration", "variant", "rowKey", "statistic", "unit", "provenance"]);
assert.equal((tableText.match(/summarizeBy: none/gu) ?? []).length, 9);
assert(tableText.includes("File.Contents(CsvPath)"));
assert(!tableText.includes("events.csv"));
assert(tableText.includes("IF(COUNTROWS('Prepared Transitions') = 1, SELECTEDVALUE('Prepared Transitions'[duration]), BLANK())"));
assert(tableText.includes("SUM('Prepared Transitions'[frequency])"));
const expressions = read(join(model, "definition", "expressions.tmdl"));
assert(expressions.includes('expression CsvPath = "" meta [IsParameterQuery=true'), "Default sample must not require a machine-specific file path.");
assert(tableText.includes('if Text.Trim(CsvPath) = "" then Binary.FromText(PreparedCsvBase64, BinaryEncoding.Base64) else File.Contents(CsvPath)'));
assert(read(join(model, "definition", "model.tmdl")).includes("ref expression PreparedCsvBase64"));
const pages = json(join(report, "definition", "pages", "pages.json"));
assert.deepEqual(pages.pageOrder, pageIds);
assert.equal(pages.activePageName, "SampleOverview");
const definition = json(join(report, "definition", "report.json"));
assert.deepEqual(definition.resourcePackages.filter(item => item.type === "CustomVisual"), [resourcePackage]);
assert(!definition.publicCustomVisuals?.includes(guid));
for (const resource of definition.resourcePackages.filter(item => item.type === "RegisteredResources")) {
  for (const item of resource.items) assert(existsSync(join(report, "StaticResources", resource.name, item.path)), "Missing registered resource.");
}
const graphInteractions = {
  SampleOverview: ["SampleOverviewProcessMap", "PreparedTransitionTable"],
  VariantCycle: ["VariantCycleProcessMap", "VariantCycleTable"],
  RepeatedActivity: ["RepeatedActivityProcessMap", "RepeatedActivityTable"]
};
let nativeTables = 0, customVisuals = 0, textboxes = 0;
for (const name of pages.pageOrder) {
  const pageDirectory = join(report, "definition", "pages", name);
  const page = json(join(pageDirectory, "page.json"));
  assert.equal(page.name, name);
  if (["VariantCycle", "RepeatedActivity"].includes(name)) {
    const expected = name === "VariantCycle" ? "V02" : "V03";
    const filters = page.filterConfig.filters;
    assert.equal(filters.length, 1);
    assert.equal(filters[0].field.Column.Property, "variant");
    assert.equal(filters[0].filter.From[0].Entity, "Prepared Transitions");
    assert.equal(filters[0].filter.Where[0].Condition.In.Values[0][0].Literal.Value, `'${expected}'`);
  } else assert(!page.filterConfig?.filters?.length, "Overview/methodology must show all variants initially.");
  const visualNames = readdirSync(join(pageDirectory, "visuals"));
  const pair = graphInteractions[name];
  assert.deepEqual(page.visualInteractions ?? [], pair ? [
    { source: pair[0], target: pair[1], type: "DataFilter" },
    { source: pair[1], target: pair[0], type: "NoFilter" }
  ] : [], `${name}: unexpected map/table interaction direction or type.`);
  for (const interaction of page.visualInteractions ?? []) {
    assert(visualNames.includes(interaction.source) && visualNames.includes(interaction.target), "Dangling visual interaction.");
  }
  const tabOrders = new Set();
  for (const entry of visualNames) {
    const document = json(join(pageDirectory, "visuals", entry, "visual.json"));
    assert.equal(document.name, entry);
    const p = document.position;
    assert(p.x >= 0 && p.y >= 0 && p.width > 0 && p.height > 0 && p.x + p.width <= page.width && p.y + p.height <= page.height);
    assert(!tabOrders.has(p.tabOrder), "Duplicate tab order.");
    tabOrders.add(p.tabOrder);
    const visual = document.visual;
    if (visual.visualType === "textbox") {
      textboxes += 1;
      assert(visual.objects.general[0].properties.paragraphs.length > 0);
      continue;
    }
    if (visual.visualType === "tableEx") nativeTables += 1;
    else {
      assert.equal(visual.visualType, guid, "Wrong custom visual identity.");
      customVisuals += 1;
      assert.deepEqual(Object.keys(visual.query.queryState).sort(), Object.keys(roleFields).sort());
      for (const [role, properties] of Object.entries(roleFields)) {
        assert.deepEqual(visual.query.queryState[role].projections.map(item => (item.field.Column ?? item.field.Measure).Property), properties);
      }
      for (const [property, expected] of Object.entries({ statistic: "mean", unit: "hours", provenance })) {
        assert.equal(visual.objects.metrics[0].properties[property].expr.Literal.Value, `'${expected.replaceAll("'", "''")}'`);
      }
      const token = visual.objects.navigation[0].properties.state.expr.Literal.Value;
      const navigation = JSON.parse(token.slice(1, -1).replaceAll("''", "'"));
      assert.equal(navigation.overlay, name === "SampleOverview" ? "frequency" : "duration");
      assert.equal(navigation.variant, null, "Page filter, not local navigation, defines the model variant.");
    }
    for (const role of Object.values(visual.query.queryState)) for (const projection of role.projections) {
      const field = projection.field.Column ?? projection.field.Measure;
      assert.equal(field.Expression.SourceRef.Entity, "Prepared Transitions");
      if (projection.field.Column) assert(columns.includes(field.Property));
      else assert(tableText.includes(`measure '${field.Property}' =`));
    }
  }
}
assert.deepEqual([customVisuals, nativeTables, textboxes], [3, 4, 9]);
const samples = fileURLToPath(new URL(".", import.meta.url));
const prepared = prepare(parseCsv(read(join(samples, "events.csv"))), json(join(samples, "variants.json")));
assert.equal(read(join(samples, "prepared-transitions.csv")).replaceAll("\r\n", "\n"), serialize(prepared.rows));
const embedded = expressions.match(/^expression PreparedCsvBase64 = "([A-Za-z0-9+/=]+)"$/mu);
assert(embedded, "Missing embedded prepared CSV.");
assert.equal(Buffer.from(embedded[1], "base64").toString("utf8"), serialize(prepared.rows), "Embedded sample differs from the canonical prepared CSV.");
const edges = new Map();
for (const row of prepared.rows) {
  const key = `${row.source}|${row.target}`;
  const edge = edges.get(key) ?? { frequency: 0, contributors: [] };
  edge.frequency += row.frequency;
  edge.contributors.push(row);
  edges.set(key, edge);
}
assert.equal(edges.size, 6);
assert.deepEqual([...edges.values()].map(edge => edge.frequency).sort((a, b) => a - b), [2, 2, 2, 6, 6, 6]);
assert.equal([...edges.values()].filter(edge => edge.contributors.length > 1).length, 3);
assert.deepEqual(prepared.rows.filter(row => row.variant === "V02").map(row => row.duration), [0.75, 1, 3.5, 1.75, 2.5]);
assert.equal(prepared.rows.find(row => row.source === "Triage" && row.target === "Triage").duration, 0.25);
const manifestPath = join(root, "package-manifest.json");
if (existsSync(manifestPath)) {
  const manifest = json(manifestPath);
  assert.equal(manifest.visualGuid, guid);
  assert.equal(manifest.visualVersion, version);
  assert.deepEqual(manifest.registration, resourcePackage);
  const archivePath = `ReleasePackage/${guid}.${version}.pbiviz`;
  const archive = readFileSync(join(root, ...archivePath.split("/")));
  assert.equal(archive.length, manifest.sourcePackage.bytes);
  assert.equal(createHash("sha256").update(archive).digest("hex"), manifest.sourcePackage.sha256);
  const { inspectArchive, checkBindings } = await import("./sync-report-package.mjs");
  const { files, visual } = await inspectArchive(archive);
  checkBindings(visual.capabilities);
  assert.deepEqual(manifest.files.map(file => file.path).sort(),
    [archivePath, ...files.keys()].map(path => path === archivePath ? path : `SupportTickets.Report/CustomVisuals/${guid}/${path}`).sort(),
    "Manifest must cover the exact archive and every extracted package file.");
  for (const file of manifest.files) {
    assert(!file.path.includes("..") && !file.path.includes("\\") && !file.path.startsWith("/"), "Unsafe manifest path.");
    const bytes = readFileSync(join(root, ...file.path.split("/")));
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, `Resource hash mismatch: ${file.path}.`);
    const archiveEntry = file.path.slice(`SupportTickets.Report/CustomVisuals/${guid}/`.length);
    if (file.path !== archivePath) assert.deepEqual(bytes, files.get(archiveEntry), `Extracted file differs from exact archive: ${file.path}.`);
  }
} else {
  assert(flags.includes("--allow-unsynced"), "Final package is not synchronized. Run sync-report-package.mjs --package <final.pbiviz>, or use --allow-unsynced for source-only validation.");
  console.log("SOURCE-ONLY: exact final package is not synchronized. The report is not yet a distributable offline bundle.");
}
if (flags.includes("--schemas")) {
  const { default: Ajv } = await import("ajv");
  let fetched = 0;
  const ajv = new Ajv({
    allErrors: true, schemaId: "auto",
    loadSchema: async url => {
      assert(url.startsWith("https://developer.microsoft.com/json-schemas/fabric/"), `Refusing non-Microsoft schema URL: ${url}`);
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      assert(response.ok, `Schema fetch failed: ${response.status} ${url}`);
      fetched += 1;
      return response.json();
    }
  });
  const validators = new Map();
  for (const { path, value } of documents.filter(document => document.value.$schema)) {
    if (!validators.has(value.$schema)) validators.set(value.$schema, await ajv.compileAsync({ $ref: value.$schema }));
    const validate = validators.get(value.$schema);
    assert(validate(value), `${path}: ${JSON.stringify(validate.errors, null, 2)}`);
  }
  console.log(`Public Microsoft draft-07 schema validation passed for ${documents.filter(document => document.value.$schema).length} documents (${fetched} schema resources fetched in memory; no report data uploaded).`);
}
console.log(`Verified ${documents.length} JSON documents, four pages, three custom visual bindings, four native tables, nine textboxes, V02/V03 model filters, guarded duration and fixture edge expectations. Native Desktop/TMDL-engine acceptance remains unverified.`);
