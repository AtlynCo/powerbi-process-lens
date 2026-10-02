import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const inputColumns = ["case_id", "event_id", "activity", "timestamp", "sequence", "variant"];
const outputColumns = ["source", "target", "frequency", "duration", "variant", "rowKey", "statistic", "unit", "provenance"];
export const provenance = "Synthetic support tickets; arithmetic mean of adjacent-event elapsed UTC hours within each supplied variant; includes zero-hour ties.";

function identifier(value, context) {
  // eslint-disable-next-line no-control-regex -- Identifiers must reject C0, DEL, and C1 controls.
  if (typeof value !== "string" || !value.trim() || value.length > 120 || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new Error(`${context}: expected nonblank text, at most 120 characters, without controls.`);
  }
  return value;
}

// Strict CSV reader: quoted commas/quotes and CRLF are supported; malformed quoting is rejected.
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", state = "plain", atStart = true;
  text = text.replace(/^\uFEFF/u, "");
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (state === "quoted") {
      if (character === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (character === '"') state = "closed";
      else cell += character;
      continue;
    }
    if (character === '"' && atStart && state === "plain") { state = "quoted"; atStart = false; continue; }
    if (character === '"' || (state === "closed" && ![",", "\r", "\n"].includes(character))) {
      throw new Error("Malformed CSV quoting.");
    }
    if (character === "," || character === "\r" || character === "\n") {
      row.push(cell); cell = ""; state = "plain"; atStart = true;
      if (character !== ",") {
        if (character === "\r") {
          if (text[i + 1] !== "\n") throw new Error("Bare CR is not an accepted CSV record separator.");
          i += 1;
        }
        rows.push(row); row = [];
      }
    } else { cell += character; atStart = false; }
  }
  if (state === "quoted") throw new Error("Unterminated quoted CSV field.");
  if (row.length || cell.length || !atStart) { row.push(cell); rows.push(row); }
  if (!rows.length) throw new Error("CSV has no header.");
  assert.deepEqual(rows.shift(), inputColumns, "Unexpected event CSV columns.");
  return rows.map((values, index) => {
    if (values.length !== inputColumns.length) throw new Error(`CSV record ${index + 2}: incorrect field count.`);
    return Object.fromEntries(inputColumns.map((name, column) => [name, values[column]]));
  });
}

function timestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    throw new Error("Timestamp must use canonical UTC YYYY-MM-DDTHH:mm:ss.sssZ.");
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`Invalid calendar timestamp: ${value}`);
  }
  return milliseconds;
}

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function prepare(events, suppliedVariants) {
  if (!events.length) throw new Error("No events supplied.");
  const variants = new Map();
  for (const variant of suppliedVariants) {
    identifier(variant.id, "Variant ID");
    if (variants.has(variant.id)) throw new Error("Duplicate supplied variant ID.");
    if (!Array.isArray(variant.path) || variant.path.length < 2) throw new Error("Variant requires at least two activities.");
    variant.path.forEach(activity => identifier(activity, "Variant activity"));
    variants.set(variant.id, variant);
  }
  const cases = new Map(), eventIds = new Set();
  for (const event of events) {
    for (const name of ["case_id", "event_id", "activity", "variant"]) identifier(event[name], name);
    if (eventIds.has(event.event_id)) throw new Error(`Duplicate event ID: ${event.event_id}`);
    eventIds.add(event.event_id);
    if (!/^[1-9]\d*$/u.test(event.sequence) || !Number.isSafeInteger(Number(event.sequence))) {
      throw new Error("Sequence must be a positive safe integer.");
    }
    if (!variants.has(event.variant)) throw new Error(`Unknown supplied variant: ${event.variant}`);
    const prepared = { ...event, time: timestamp(event.timestamp), order: Number(event.sequence) };
    if (!cases.has(event.case_id)) cases.set(event.case_id, []);
    cases.get(event.case_id).push(prepared);
  }
  const groups = new Map();
  let totalElapsedMilliseconds = 0, transitions = 0;
  for (const [caseId, ordered] of cases) {
    // Sequence is authoritative within a case and explicitly resolves equal timestamp ties.
    ordered.sort((a, b) => a.order - b.order);
    if (new Set(ordered.map(event => event.order)).size !== ordered.length) throw new Error(`Duplicate sequence in ${caseId}.`);
    if (new Set(ordered.map(event => event.variant)).size !== 1) throw new Error(`Mixed variants in ${caseId}.`);
    const variant = variants.get(ordered[0].variant);
    assert.deepEqual(ordered.map(event => event.activity), variant.path, `Supplied variant path mismatch in ${caseId}.`);
    for (let i = 1; i < ordered.length; i += 1) {
      const previous = ordered[i - 1], current = ordered[i];
      const elapsed = current.time - previous.time;
      if (elapsed < 0) throw new Error(`Timestamps move backwards in sequence order in ${caseId}.`);
      if (!Number.isSafeInteger(elapsed)) throw new Error("Elapsed milliseconds overflow.");
      const key = JSON.stringify([previous.activity, current.activity, variant.id]);
      const group = groups.get(key) ?? {
        source: previous.activity, target: current.activity, variant: variant.id, frequency: 0, elapsedMilliseconds: 0
      };
      group.frequency += 1;
      group.elapsedMilliseconds += elapsed;
      transitions += 1;
      totalElapsedMilliseconds += elapsed;
      if (![group.frequency, group.elapsedMilliseconds, transitions, totalElapsedMilliseconds].every(Number.isSafeInteger)) {
        throw new Error("Preparation count or elapsed-millisecond total overflow.");
      }
      groups.set(key, group);
    }
  }
  const rows = [...groups.values()]
    .sort((a, b) => compare(a.variant, b.variant) || compare(a.source, b.source) || compare(a.target, b.target))
    .map((group, index) => ({
      source: group.source, target: group.target, frequency: group.frequency,
      duration: group.elapsedMilliseconds / group.frequency / 3_600_000,
      variant: group.variant, rowKey: `transition-${String(index + 1).padStart(3, "0")}`,
      statistic: "mean", unit: "hours", provenance
    }));
  const summary = {
    synthetic: true, events: events.length, cases: cases.size,
    variants: new Set(rows.map(row => row.variant)).size,
    activities: new Set(events.map(event => event.activity)).size,
    preparedRows: rows.length, adjacentTransitions: transitions,
    elapsedAdjacentEventHours: totalElapsedMilliseconds / 3_600_000,
    statistic: "mean", unit: "hours", provenance,
    variantPaths: suppliedVariants.map(({ id, label, path }) => ({ id, label, path }))
  };
  return { rows, summary };
}

function csvCell(value) {
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serialize(rows) {
  return [outputColumns.join(","), ...rows.map(row => outputColumns.map(column => csvCell(row[column])).join(","))].join("\n") + "\n";
}

function verifyFixture(events, variants) {
  const result = prepare(events, variants);
  assert.deepEqual(
    [result.summary.events, result.summary.cases, result.summary.variants, result.summary.activities,
      result.summary.preparedRows, result.summary.adjacentTransitions, result.summary.elapsedAdjacentEventHours],
    [30, 6, 3, 5, 12, 24, 41]
  );
  const expected = new Map([
    ["V01|Opened|Triage", [2, 1.5]], ["V01|Triage|Resolved", [2, 3.5]], ["V01|Resolved|Closed", [2, 1.5]],
    ["V02|Opened|Triage", [2, 0.75]], ["V02|Triage|Waiting", [2, 1.75]], ["V02|Waiting|Triage", [2, 2.5]],
    ["V02|Triage|Resolved", [2, 3.5]], ["V02|Resolved|Closed", [2, 1]],
    ["V03|Opened|Triage", [2, 1]], ["V03|Triage|Triage", [2, 0.25]],
    ["V03|Triage|Resolved", [2, 2.25]], ["V03|Resolved|Closed", [2, 1]]
  ]);
  for (const row of result.rows) assert.deepEqual([row.frequency, row.duration], expected.get(`${row.variant}|${row.source}|${row.target}`));
  assert.equal(result.rows.reduce((sum, row) => sum + row.frequency, 0), 24);
  assert.equal(result.rows.reduce((sum, row) => sum + row.frequency * row.duration, 0), 41);
  assert.equal(serialize(prepare([...events].reverse(), variants).rows), serialize(result.rows), "Physical record order must not affect preparation.");
  const reject = (mutate, pattern) => {
    const changed = events.map(event => ({ ...event }));
    mutate(changed);
    assert.throws(() => prepare(changed, variants), pattern);
  };
  reject(rows => { rows[1].event_id = rows[0].event_id; }, /Duplicate event ID/u);
  reject(rows => { rows[1].sequence = rows[0].sequence; }, /Duplicate sequence/u);
  reject(rows => { rows[22].sequence = rows[21].sequence; }, /Duplicate sequence/u);
  reject(rows => { rows[1].sequence = "1.5"; }, /Sequence/u);
  reject(rows => { rows[1].sequence = "9007199254740992"; }, /Sequence/u);
  reject(rows => { rows[1].timestamp = "2026-02-30T09:00:00.000Z"; }, /Invalid calendar/u);
  reject(rows => { rows[1].timestamp = "2026-01-05T09:00:00+01:00"; }, /canonical UTC/u);
  reject(rows => { rows[1].timestamp = "2026-01-05T07:00:00.000Z"; }, /backwards/u);
  reject(rows => { rows[0].activity = " "; }, /nonblank/u);
  reject(rows => { rows[0].activity = "x".repeat(121); }, /120 characters/u);
  reject(rows => { rows[0].activity = "Open\u0000ed"; }, /without controls/u);
  reject(rows => { rows[0].variant = "V99"; }, /Unknown supplied variant/u);
  reject(rows => { rows[1].variant = "V02"; }, /Mixed variants/u);
  reject(rows => { rows[1].activity = "Unexpected"; }, /path mismatch/u);
  assert.throws(() => prepare([], variants), /No events/u);
  assert.throws(() => prepare(events, [...variants, variants[0]]), /Duplicate supplied variant/u);
  const header = inputColumns.join(",");
  assert.equal(parseCsv(`${header}\r\nSYN001,E001,"Open, ""quoted""",2026-01-05T08:00:00.000Z,1,V01\r\n`)[0].activity, 'Open, "quoted"');
  assert.throws(() => parseCsv(`${header}\n"unterminated`), /Unterminated/u);
  assert.throws(() => parseCsv(`${header}\n"closed"x,a,b,c,d,e`), /Malformed/u);
  assert.throws(() => parseCsv(`${header}\na,b`), /field count/u);
  return result;
}

function main() {
  const flags = process.argv.slice(2);
  if (flags.some(flag => flag !== "--check" && flag !== "--self-test")) throw new Error("Usage: node samples/prepare-transitions.mjs [--check] [--self-test]");
  const directory = fileURLToPath(new URL(".", import.meta.url));
  const events = parseCsv(readFileSync(resolve(directory, "events.csv"), "utf8"));
  const variants = JSON.parse(readFileSync(resolve(directory, "variants.json"), "utf8"));
  const result = flags.includes("--self-test") ? verifyFixture(events, variants) : prepare(events, variants);
  const outputs = [
    ["prepared-transitions.csv", serialize(result.rows)],
    ["preparation-summary.json", JSON.stringify(result.summary, null, 2) + "\n"]
  ];
  for (const [name, content] of outputs) {
    const path = resolve(directory, name);
    if (flags.includes("--check")) {
      assert.equal(readFileSync(path, "utf8").replaceAll("\r\n", "\n"), content, `${name} is stale; run npm run sample.`);
    } else writeFileSync(path, content);
  }
  console.log(`${flags.includes("--check") ? "Verified" : "Prepared"} ${result.summary.preparedRows} rows, ${result.summary.adjacentTransitions} transitions, ${result.summary.elapsedAdjacentEventHours} adjacent-event hours.${flags.includes("--self-test") ? " Fixture assertions and invalid-input checks passed." : ""}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
