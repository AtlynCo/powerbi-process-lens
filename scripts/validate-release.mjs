import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256, sourceInputs, hashesUnder } from "./release-files.mjs";

const output = resolve("dist", "quality-evidence");
mkdirSync(join(output, "logs"), { recursive: true });
const config = JSON.parse(readFileSync("pbiviz.json", "utf8"));
const packageArtifact = `dist\\${config.visual.guid}.${config.visual.version}.pbiviz`;
const commands = [
  ["typecheck", "npm run typecheck"],
  ["eslint", "npm run eslint"],
  ["unit", "npm test"],
  ["sample", "node samples\\prepare-transitions.mjs --check --self-test"],
  ["report-authoring", "node samples\\author-report.mjs --check"],
  ["report-sync-self-test", "node samples\\sync-report-package.mjs --self-test"],
  ["assets", "node scripts\\generate-icons.mjs --check"],
  ["certification-audit-package", "npm run audit:certification"],
  ["package", "npm run package"],
  ["package-audit", "npm run audit:package"],
  ["bound-report-sync", `node samples\\sync-report-package.mjs --package ${packageArtifact}`],
  ["bound-report-exact-check", `node samples\\sync-report-package.mjs --package ${packageArtifact} --check`],
  ["bound-report-check", "node samples\\check-report-source.mjs --schemas"],
  ["package-browser", "npm run test:browser"],
  ["all-dependencies", "npm audit --json"],
  ["production-dependencies", "npm audit --omit=dev --json"]
];
const results = [];
for (const [name, windowsCommand] of commands) {
  const command = process.platform === "win32" ? windowsCommand : windowsCommand.replaceAll("\\", "/");
  const start = Date.now();
  const result = process.platform === "win32"
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
    : spawnSync("sh", ["-c", command], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const log = (result.stdout ?? "") + (result.stderr ?? "");
  writeFileSync(join(output, "logs", `${name}.txt`), log);
  results.push({ name, command, exitCode: result.status, elapsedMs: Date.now() - start });
  console.log(`${name}: ${result.status === 0 ? "PASS" : "FAIL"} (${Date.now() - start} ms)`);
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Local gate failed: ${name}. See ${join(output, "logs", `${name}.txt`)}`);
}
const audit = JSON.parse(readFileSync(join("dist", "package-audit.json")));
const performance = JSON.parse(readFileSync(join(output, "performance.json")));
assert.equal(performance.packageSha256, audit.sha256, "Performance measured a different package");
const packageBytes = readFileSync(audit.package);
assert.equal(sha256(packageBytes), audit.sha256);
const screenshots = readdirSync(join(output, "marketplace")).filter(name => name.endsWith(".png")).sort();
assert(screenshots.length >= 1 && screenshots.length <= 5);
const media = screenshots.map(name => {
  const bytes = readFileSync(join(output, "marketplace", name));
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(bytes.readUInt32BE(16), 1366);
  assert.equal(bytes.readUInt32BE(20), 768);
  assert(bytes.length <= 1024 * 1024, `${name} exceeds the visual-specific submission limit`);
  return { name, sha256: sha256(bytes), bytes: bytes.length, width: 1366, height: 768 };
});
writeFileSync(join(output, "validation.json"), JSON.stringify({
  completedAt: new Date().toISOString(), packageSha256: audit.sha256,
  payloadSha256: audit.payloadSha256, node: process.version,
  scope: "Local source, real packaged browser with simulated host, offline report source. Not native Power BI or Microsoft certification.",
  commands: results, media, sourceInputs: sourceInputs(),
  boundReportFiles: hashesUnder(join("samples", "SupportTickets")),
  evidenceFiles: hashesUnder(output, ["validation.json"])
}, null, 2) + "\n");
console.log(`Local evidence recorded for ${audit.sha256}`);
