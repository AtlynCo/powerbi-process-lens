import assert from "node:assert/strict";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { git, sha256, sourceInputs, hashesUnder } from "./release-files.mjs";
import JSZip from "jszip";

const argument = process.argv.indexOf("--output");
assert(argument >= 0 && process.argv[argument + 1], "Supply --output with a new absolute artifact directory");
const output = process.argv[argument + 1];
assert(isAbsolute(output), "Artifact output must be absolute");
assert(!existsSync(output), "Refusing to overwrite an existing sealed release");
assert.equal(git("status", "--porcelain"), "", "Commit the complete source baseline before sealing");
const evidence = JSON.parse(readFileSync(join("dist", "quality-evidence", "validation.json")));
assert.deepEqual(sourceInputs(), evidence.sourceInputs, "Validated source inputs changed; rerun local release validation");
assert.deepEqual(hashesUnder(join("samples", "SupportTickets")), evidence.boundReportFiles, "Bound report changed after validation");
assert.deepEqual(hashesUnder(join("dist", "quality-evidence"), ["validation.json"]), evidence.evidenceFiles, "Evidence changed after validation");
assert(evidence.commands.length >= 12 && evidence.commands.every(command => command.exitCode === 0));
const config = JSON.parse(readFileSync("pbiviz.json"));
const name = `${config.visual.guid}.${config.visual.version}.pbiviz`;
const artifact = join("dist", name);
assert.equal(sha256(readFileSync(artifact)), evidence.packageSha256, "Package changed after validation");
for (const item of evidence.media) {
  assert.equal(sha256(readFileSync(join("dist", "quality-evidence", "marketplace", item.name))), item.sha256);
}
mkdirSync(output);
copyFileSync(artifact, join(output, name));
copyFileSync(join("dist", "package-audit.json"), join(output, "package-audit.json"));
copyFileSync("THIRD-PARTY-NOTICES.txt", join(output, "THIRD-PARTY-NOTICES.txt"));
cpSync(join("dist", "quality-evidence"), join(output, "evidence"), { recursive: true });
cpSync("assets", join(output, "assets"), { recursive: true });
cpSync(join("samples", "SupportTickets"), join(output, "SupportTickets"), {
  recursive: true, filter: path => !relative(resolve("samples", "SupportTickets"), resolve(path)).split(/[\\/]/).includes(".pbi")
});
const reportArchive = new JSZip();
const reportDate = new Date(git("show", "-s", "--format=%cI", "HEAD"));
for (const name of Object.keys(hashesUnder(join(output, "SupportTickets")))) {
  reportArchive.file(`SupportTickets/${name}`, readFileSync(join(output, "SupportTickets", ...name.split("/"))), {
    date: reportDate, createFolders: false
  });
}
writeFileSync(join(output, "offline-report.zip"), await reportArchive.generateAsync({
  type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 }
}));
git("archive", "--format=zip", `--output=${join(output, "source.zip")}`, "HEAD");
const files = [];
function record(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) record(path);
    else {
      assert(entry.isFile(), "Release does not permit filesystem links");
      files.push({ path: relative(output, path), bytes: statSync(path).size, sha256: sha256(readFileSync(path)) });
    }
  }
}
record(output);
const manifest = {
  sealedAt: new Date().toISOString(), repository: "AtlynCo/powerbi-process-lens",
  sourceCommit: git("rev-parse", "HEAD"), sourceTree: git("rev-parse", "HEAD^{tree}"),
  sourceBranch: git("branch", "--show-current"), guid: config.visual.guid, version: config.visual.version,
  packageSha256: evidence.packageSha256, payloadSha256: evidence.payloadSha256,
  status: "Local release candidate; native Power BI, legal/commercial approval and Marketplace certification remain owner gates.",
  mediaOrigin: "Actual final package in an isolated browser with simulated Power BI host; not native Desktop/Service screenshots.",
  files
};
const content = JSON.stringify(manifest, null, 2) + "\n";
writeFileSync(join(output, "manifest.json"), content);
writeFileSync(join(output, "MANIFEST-SHA256.txt"), `${sha256(Buffer.from(content))}  manifest.json\n`);
console.log(JSON.stringify({ directory: output, sourceCommit: manifest.sourceCommit, packageSha256: manifest.packageSha256, manifestSha256: sha256(Buffer.from(content)), files: files.length }, null, 2));
