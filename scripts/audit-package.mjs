import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import JSZip from "jszip";

const config = JSON.parse(readFileSync("pbiviz.json", "utf8"));
const capabilities = JSON.parse(readFileSync("capabilities.json", "utf8"));
const names = readdirSync("dist").filter(name => name.endsWith(".pbiviz"));
assert.equal(names.length, 1, "Expected exactly one release package in dist");
const file = join("dist", names[0]);
const bytes = readFileSync(file);
const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
const entries = Object.keys(zip.files);
assert(entries.includes("package.json"), "Missing Power BI package manifest");
const resources = entries.filter(name => name.startsWith("resources/") && name.endsWith(".pbiviz.json"));
assert.equal(resources.length, 1, "Expected one packaged visual resource");
const payload = JSON.parse(await zip.file(resources[0]).async("string"));
assert.equal(payload.visual.guid, "AtlynProcessLensA61D72B54E9F4B65A137E92DF84610C3");
assert.equal(payload.visual.version, "1.0.0.0");
assert.equal(payload.visual.guid, config.visual.guid);
assert.equal(payload.visual.version, config.visual.version);
assert.deepEqual(payload.capabilities, capabilities);
assert.deepEqual(payload.capabilities.privileges, []);
assert.equal(payload.capabilities.supportsHighlight, false);
assert.equal(payload.capabilities.supportsKeyboardFocus, true);
assert.equal(payload.stringResources["en-US"].roleSource, "Source Activity ID");
assert.equal(payload.stringResources["fr-FR"].roleFrequency, "Frequence de transition");
assert(payload.content.js.length > 10000, "Scaffold/empty JS is not a product");
assert(payload.content.css.includes("process-lens"), "Missing visual CSS");
assert(payload.content.iconBase64.startsWith("data:image/png;base64,"), "Missing embedded PNG icon");
const png = Buffer.from(payload.content.iconBase64.split(",")[1], "base64");
assert.deepEqual(png, readFileSync("assets/icon.png"));
assert.equal(png.readUInt32BE(16), 20);
assert.equal(png.readUInt32BE(20), 20);
assert(payload.content.js.includes("renderingFinished"), "Render lifecycle absent");
assert(payload.content.js.includes("ATLYN PROCESS LENS - THIRD-PARTY NOTICES"), "Offline license text absent from actual package");
for (const [label, pattern] of [
  ["eval", /\beval\s*\(/],
  ["dynamic Function", /\bnew\s+Function\s*\(/],
  ["network fetch", /\bfetch\s*\(/],
  ["XHR", /\bXMLHttpRequest\b/],
  ["WebSocket", /\bWebSocket\b/],
  ["telemetry", /\btelemetry\s*\./],
  ["unsafe DOM", /\.innerHTML\s*=/],
  ["remote CSS", /@import\s|url\s*\(\s*["']?https?:/]
]) {
  assert(!pattern.test(payload.content.js + "\n" + payload.content.css), `Review required: ${label} signature in payload`);
}
const hash = createHash("sha256").update(bytes).digest("hex");
copyFileSync("THIRD-PARTY-NOTICES.txt", join("dist", "THIRD-PARTY-NOTICES.txt"));
const evidence = {
  package: resolve(file), guid: payload.visual.guid, version: payload.visual.version,
  apiVersion: payload.apiVersion, sha256: hash, bytes: bytes.length,
  javascriptBytes: Buffer.byteLength(payload.content.js), cssBytes: Buffer.byteLength(payload.content.css),
  entries, privileges: payload.capabilities.privileges,
  offlineSignatureAudit: "pass (heuristic; not Microsoft certification)",
  nativeHostGates: "Desktop, Service, export, assistive technology and publication review remain manual"
};
writeFileSync(join("dist", "package-audit.json"), JSON.stringify(evidence, null, 2) + "\n");
writeFileSync(join("dist", "SHA256SUMS.txt"), `${hash}  ${names[0]}\n`);
console.log(JSON.stringify(evidence, null, 2));
