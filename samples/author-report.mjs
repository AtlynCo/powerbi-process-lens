import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { provenance } from "./prepare-transitions.mjs";

export const guid = "AtlynProcessLensA61D72B54E9F4B65A137E92DF84610C3";
export const version = "1.0.0.0";
export const reportRoot = fileURLToPath(new URL("./SupportTickets/SupportTickets.Report/", import.meta.url));
export const pageIds = ["SampleOverview", "VariantCycle", "RepeatedActivity", "Methodology"];
export const roleFields = {
  source: ["source"], target: ["target"], frequency: ["Prepared Frequency"],
  duration: ["Prepared Duration"], variant: ["variant"], rowKey: ["rowKey"],
  tooltip: ["statistic", "unit", "provenance"]
};
export const resourcePackage = {
  name: guid, type: "CustomVisual",
  items: [{ name: `${guid}.pbiviz.json`, path: `${guid}.pbiviz.json`, type: "CustomVisualMetadata" }]
};
const schema = (item, revision = "1.0.0") =>
  `https://developer.microsoft.com/json-schemas/fabric/item/report/definition/${item}/${revision}/schema.json`;
const literal = value => ({ expr: { Literal: { Value: typeof value === "string" ? `'${value.replaceAll("'", "''")}'` : String(value) } } });
const color = value => ({ solid: { color: literal(value) } });
const field = property => ({ [property.startsWith("Prepared ") ? "Measure" : "Column"]: {
  Expression: { SourceRef: { Entity: "Prepared Transitions" } }, Property: property
} });
const displayNames = {
  source: "Source", target: "Target", "Prepared Frequency": "Frequency", "Prepared Duration": "Mean (h)",
  variant: "Variant", rowKey: "Row ID", statistic: "Statistic", unit: "Unit", provenance: "Provenance"
};
const projection = property => ({
  field: field(property), queryRef: `Prepared Transitions.${property}`, nativeQueryRef: property, displayName: displayNames[property]
});
const position = (x, y, width, height, tabOrder) => ({ x, y, z: tabOrder, width, height, tabOrder });
const container = (title, description) => ({
  title: [{ properties: { show: literal(true), text: literal(title), fontSize: literal(12), fontColor: color("#172B4D") } }],
  background: [{ properties: { show: literal(true), color: color("#FFFFFF"), transparency: literal(0) } }],
  general: [{ properties: { altText: literal(description) } }]
});
function textbox(name, bounds, lines) {
  return {
    $schema: schema("visualContainer"), name, position: bounds,
    visual: {
      visualType: "textbox",
      objects: {
        general: [{ properties: { paragraphs: lines.map((line, index) => ({
          textRuns: [{ value: line, textStyle: {
            fontFamily: "Segoe UI", fontSize: index === 0 ? "22px" : "13px",
            fontWeight: index === 0 ? "bold" : "normal", color: "#172B4D"
          } }]
        })) } }]
      },
      visualContainerObjects: { general: [{ properties: { altText: literal(lines.join(" ")) } }] }
    }
  };
}
function processMap(name, overlay) {
  return {
    $schema: schema("visualContainer"), name, position: position(24, 128, 808, 568, 1),
    visual: {
      visualType: guid,
      query: {
        queryState: Object.fromEntries(Object.entries(roleFields).map(([role, properties]) =>
          [role, { projections: properties.map(projection) }])),
        sortDefinition: { sort: [{ field: field("rowKey"), direction: "Ascending" }], isDefaultSort: false }
      },
      objects: {
        metrics: [{ properties: { statistic: literal("mean"), unit: literal("hours"), provenance: literal(provenance) } }],
        appearance: [{ properties: {
          edgeColor: color("#27698C"), nodeColor: color("#27698C"), showLabels: literal(true)
        } }],
        navigation: [{ properties: { state: literal(JSON.stringify({
          query: "", focus: null, variant: null, mode: "all", overlay, zoom: 1, panel: "graph"
        })) } }]
      },
      visualContainerObjects: container(
        overlay === "frequency" ? "Prepared workflow · transition frequency" : "Prepared workflow · mean elapsed hours",
        "Synthetic prepared transition graph. Includes cycles and self-loops. See the adjacent native table and methodology page."
      ),
      drillFilterOtherVisuals: true
    }
  };
}
function table(name, bounds, properties, title) {
  return {
    $schema: schema("visualContainer"), name, position: bounds,
    visual: {
      visualType: "tableEx",
      query: {
        queryState: { Values: { projections: properties.map(projection) } },
        sortDefinition: { sort: [{ field: field(properties[0]), direction: "Ascending" }], isDefaultSort: false }
      },
      objects: {
        grid: [{ properties: { rowPadding: literal(5), textSize: literal(10) } }],
        total: [{ properties: { totals: literal(false) } }]
      },
      visualContainerObjects: container(title, "Native model-bound table for comparison with the custom visual. Duration is blank for model groups containing more than one prepared row."),
      drillFilterOtherVisuals: true
    }
  };
}
function page(name, displayName, variant, mapName, tableName) {
  const value = {
    $schema: schema("page"), name, displayName, displayOption: "FitToPage", height: 720, width: 1280,
    objects: { background: [{ properties: { color: color("#F4F7FB"), transparency: literal(0) } }] }
  };
  if (variant) value.filterConfig = { filters: [{
    name: `${name}VariantFilter`, displayName: "Supplied variant (model filter)", field: field("variant"),
    type: "Categorical", howCreated: "User", isLockedInViewMode: true,
    filter: {
      Version: 2, From: [{ Name: "t", Entity: "Prepared Transitions", Type: 0 }],
      Where: [{ Condition: { In: {
        Expressions: [{ Column: { Expression: { SourceRef: { Source: "t" } }, Property: "variant" } }],
        Values: [[{ Literal: { Value: `'${variant}'` } }]]
      } } }]
    }
  }] };
  if (mapName && tableName) value.visualInteractions = [
    { source: mapName, target: tableName, type: "DataFilter" },
    { source: tableName, target: mapName, type: "NoFilter" }
  ];
  return value;
}

export function authoredFiles() {
  const files = new Map();
  const add = (path, value) => files.set(path, JSON.stringify(value, null, 2) + "\n");
  const csv = readFileSync(fileURLToPath(new URL("./prepared-transitions.csv", import.meta.url)), "utf8").replaceAll("\r\n", "\n");
  files.set("..\\SupportTickets.SemanticModel\\definition\\expressions.tmdl",
    `expression CsvPath = "" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=false]
\tlineageTag: d5d31160-7e61-442a-a18d-247eb974c11b

expression PreparedCsvBase64 = "${Buffer.from(csv).toString("base64")}"
\tlineageTag: 5afad788-523a-41cb-aeec-ff55b480c98b
`);
  add("definition\\report.json", {
    $schema: schema("report", "3.0.0"),
    themeCollection: { customTheme: {
      name: "ProcessLensTheme.json",
      reportVersionAtImport: { visual: "1.8.0", report: "3.0.0", page: "1.0.0" },
      type: "RegisteredResources"
    } },
    resourcePackages: [
      resourcePackage,
      { name: "RegisteredResources", type: "RegisteredResources", items: [
        { name: "ProcessLensTheme.json", path: "ProcessLensTheme.json", type: "CustomTheme" }
      ] }
    ],
    settings: {
      useStylableVisualContainerHeader: true, exportDataMode: "AllowSummarized",
      defaultFilterActionIsDataFilter: true, useEnhancedTooltips: true
    }
  });
  add("StaticResources\\RegisteredResources\\ProcessLensTheme.json", {
    name: "Atlyn Process Lens sample", dataColors: ["#27698C", "#258470", "#9364A6", "#BC7737"],
    background: "#F4F7FB", foreground: "#172B4D", tableAccent: "#27698C"
  });
  add("definition\\pages\\pages.json", {
    $schema: schema("pagesMetadata"), pageOrder: pageIds, activePageName: pageIds[0]
  });
  const graphPages = [
    {
      id: "SampleOverview", title: "01 · Workflow overview", variant: null, overlay: "frequency",
      heading: ["Atlyn Process Lens | Synthetic support tickets",
        "01 / ALL VARIANTS     •     Prepared workflow frequency     •     Source fixture: 6 cases / 30 events / 24 transitions"],
      notes: ["Read the overview",
        "All three supplied variants contribute to this map.",
        "Shared edges: frequency 6; combined duration unavailable.",
        "Variant-only cycle and self-loop edges: frequency 2.",
        "The native table groups by edge; its duration guard returns blank for shared edges.",
        "Local exploration is not a report filter. Use explicit report selection to filter the table.",
        "Counts above describe the complete fixture, not the current selection."]
    },
    {
      id: "VariantCycle", title: "02 · V02 cycle and duration", variant: "V02", overlay: "duration",
      heading: ["V02 | A waiting cycle, without invented causality",
        "02 / MODEL FILTER: V02     •     2 synthetic cases / 10 adjacent transitions / 5 prepared edges"],
      notes: ["Inspect the reciprocal cycle",
        "Triage → Waiting: mean 1.75 hours.",
        "Waiting → Triage: mean 2.50 hours.",
        "Triage → Resolved: mean 3.50 hours.",
        "Every edge has frequency 2. The page filter limits the model query to V02.",
        "Elapsed time is not hands-on work or a causal bottleneck.",
        "A cycle is observable here; its business meaning is not inferred."]
    },
    {
      id: "RepeatedActivity", title: "03 · V03 repeated activity", variant: "V03", overlay: "duration",
      heading: ["V03 | Consecutive triage events remain visible",
        "03 / MODEL FILTER: V03     •     2 synthetic cases / 8 adjacent transitions / 4 prepared edges"],
      notes: ["Inspect the self-loop",
        "Triage → Triage: frequency 2; mean 0.25 hours.",
        "One interval is zero; the other is 0.50 hours.",
        "Distinct sequence values order the equal-time events.",
        "The page filter limits the model query to V03.",
        "Repeated activity is not automatically rework, an error, or a reopened case.",
        "Prepared values are supplied statistics; the visual does not recompute them."]
    }
  ];
  for (const spec of graphPages) {
    const prefix = `definition\\pages\\${spec.id}`;
    const graphName = `${spec.id}ProcessMap`;
    const tableName = spec.id === "SampleOverview" ? "PreparedTransitionTable" : `${spec.id}Table`;
    add(`${prefix}\\page.json`, page(spec.id, spec.title, spec.variant, graphName, tableName));
    add(`${prefix}\\visuals\\${spec.id}Heading\\visual.json`, textbox(`${spec.id}Heading`, position(24, 16, 1232, 96, 0), spec.heading));
    add(`${prefix}\\visuals\\${graphName}\\visual.json`, processMap(graphName, spec.overlay));
    add(`${prefix}\\visuals\\${spec.id}Notes\\visual.json`, textbox(`${spec.id}Notes`, position(852, 128, 404, 302, 2), spec.notes));
    add(`${prefix}\\visuals\\${tableName}\\visual.json`, table(tableName, position(852, 446, 404, 250, 3),
      ["source", "target", "Prepared Frequency", "Prepared Duration"],
      spec.variant ? `${spec.variant} · model-bound edge values` : "All variants · guarded edge values"));
  }
  const method = "definition\\pages\\Methodology";
  add(`${method}\\page.json`, page("Methodology", "04 · Methodology and quality"));
  add(`${method}\\visuals\\MethodologyHeading\\visual.json`, textbox("MethodologyHeading", position(24, 16, 1232, 90, 0), [
    "Methodology | Know the grain before reading the graph",
    "04 / DATA QUALITY     •     All data is synthetic     •     Native table below preserves all 12 row identities"
  ]));
  add(`${method}\\visuals\\PreparationMethod\\visual.json`, textbox("PreparationMethod", position(24, 118, 604, 218, 1), [
    "Offline preparation",
    "Group events by case; order by unique positive sequence.",
    "Require canonical UTC timestamps and a matching supplied variant path.",
    "Count adjacent pairs; keep zero-hour ties; never bridge cases.",
    "Prepare one row per source / target / variant.",
    "Duration = arithmetic mean adjacent-event elapsed UTC hours.",
    "Embedded CSV default: no file-path edits or network refresh.",
    "Fixture checks: 30 − 6 = 24 transitions; elapsed intervals total 41 hours."
  ]));
  add(`${method}\\visuals\\QualityMethod\\visual.json`, textbox("QualityMethod", position(652, 118, 604, 218, 2), [
    "Interpretation boundaries",
    "Frequency sums; runtime duration statistics never aggregate.",
    "Multiple contributors to an edge make its duration unavailable.",
    "COUNTROWS = 1 guards the model's Prepared Duration measure.",
    "rowKey preserves contributor identity; tooltip fields describe provenance.",
    "No raw-log mining, inferred cases, discovered variants, or rework labels.",
    "This source report still requires native Desktop acceptance."
  ]));
  add(`${method}\\visuals\\QualityTable\\visual.json`, table("QualityTable", position(24, 352, 1232, 344, 3),
    ["rowKey", "variant", "source", "target", "Prepared Frequency", "Prepared Duration", "statistic", "unit", "provenance"],
    "Prepared grain audit · one row per edge and supplied variant"));
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = process.argv.slice(2);
  assert(flags.every(flag => flag === "--check"), "Usage: node samples\\author-report.mjs [--check]");
  for (const [relativePath, content] of authoredFiles()) {
    const path = resolve(reportRoot, relativePath);
    if (flags.includes("--check")) assert.equal(readFileSync(path, "utf8").replaceAll("\r\n", "\n"), content, `${relativePath} differs from authored source.`);
    else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
  }
  console.log(`${flags.includes("--check") ? "Verified" : "Authored"} four PBIR pages, three bound private custom visuals, four native tables and methodology text. Package synchronization and native Desktop acceptance are separate gates.`);
}
