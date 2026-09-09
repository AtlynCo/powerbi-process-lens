import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { guid, version, reportRoot, resourcePackage, pageIds, roleFields } from "./author-report.mjs";

const sampleRoot = fileURLToPath(new URL("./SupportTickets/", import.meta.url));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const json = path => JSON.parse(readFileSync(path, "utf8"));
const packageName = `${guid}.${version}.pbiviz`;

export async function inspectArchive(bytes) {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const files = new Map();
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    assert.equal(entry.unsafeOriginalName ?? entry.name, entry.name, "Unsafe archive path.");
    assert(entry.name === "package.json" || /^resources\/[A-Za-z0-9_.-]+$/u.test(entry.name), "Unexpected archive entry.");
    assert(!files.has(entry.name), "Duplicate archive entry.");
    const content = await entry.async("nodebuffer");
    files.set(entry.name, content);
  }
  assert(files.has("package.json"), "Missing package.json.");
  const manifest = JSON.parse(files.get("package.json").toString("utf8"));
  assert.equal(manifest.visual.guid, guid, "Unexpected visual GUID.");
  assert.equal(manifest.visual.version, version, "Unexpected visual version.");
  assert.equal(manifest.version, version, "Unexpected archive version.");
  const resource = manifest.resources.find(item => item.resourceId === manifest.metadata.pbivizjson.resourceId);
  assert.equal(resource?.sourceType, 5, "Expected pbiviz JSON resource.");
  assert.equal(resource.file, `resources/${guid}.pbiviz.json`, "Unexpected visual resource path.");
  assert(files.has(resource.file), "Missing bundled visual resource.");
  assert.equal(files.size, manifest.resources.length + 1, "Unexpected unregistered archive files.");
  for (const item of manifest.resources) assert(files.has(item.file), `Missing resource ${item.file}.`);
  const visual = JSON.parse(files.get(resource.file).toString("utf8"));
  assert.equal(visual.visual.guid, guid);
  assert.equal(visual.visual.version, version);
  assert.equal(typeof visual.content.js, "string", "Missing packaged JavaScript.");
  assert(visual.content.js.length > 0);
  assert.equal(typeof visual.content.css, "string", "Missing packaged stylesheet.");
  assert.deepEqual(visual.capabilities.privileges, [], "Sample expects an offline visual without privileges.");
  assert.deepEqual(visual.externalJS ?? [], [], "Sample expects no external JavaScript.");
  const roles = new Set(visual.capabilities.dataRoles.map(role => role.name));
  for (const role of Object.keys(roleFields)) assert(roles.has(role), `Package lacks role ${role}.`);
  return { files, visual };
}

export function checkBindings(capabilities) {
  const report = json(join(reportRoot, "definition", "report.json"));
  assert.deepEqual(report.resourcePackages.filter(item => item.type === "CustomVisual"), [resourcePackage]);
  assert(!report.publicCustomVisuals?.includes(guid), "A private visual must not be registered as AppSource.");
  assert(!report.organizationCustomVisuals?.some(item => item.name === guid), "Do not invent an organizational approval.");
  let bound = 0;
  for (const pageId of pageIds) {
    const visuals = join(reportRoot, "definition", "pages", pageId, "visuals");
    for (const name of readdirSync(visuals)) {
      const definition = json(join(visuals, name, "visual.json")).visual;
      if (["textbox", "tableEx"].includes(definition.visualType)) continue;
      assert.equal(definition.visualType, guid, "Unexpected custom visual binding.");
      bound += 1;
      assert.deepEqual(Object.keys(definition.query.queryState).sort(), Object.keys(roleFields).sort());
      for (const [role, fields] of Object.entries(roleFields)) {
        assert.deepEqual(definition.query.queryState[role].projections.map(item => {
          const value = item.field.Column ?? item.field.Measure;
          assert.equal(value.Expression.SourceRef.Entity, "Prepared Transitions");
          return value.Property;
        }), fields, `Wrong field binding for ${role}.`);
      }
      if (capabilities) for (const [objectName, values] of Object.entries(definition.objects)) {
        assert(capabilities.objects[objectName], `Unknown formatting object ${objectName}.`);
        for (const value of values) for (const property of Object.keys(value.properties)) {
          assert(capabilities.objects[objectName].properties[property], `Unknown formatting property ${objectName}.${property}.`);
        }
      }
    }
  }
  assert.equal(bound, 3, "Expected three bound custom visuals.");
  return bound;
}

function treeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? treeFiles(path) : [path];
  });
}

function packageOutputs(fileName, bytes, files) {
  const outputs = new Map();
  for (const [name, content] of files) {
    outputs.set(`SupportTickets.Report/CustomVisuals/${guid}/${name}`, content);
  }
  outputs.set(`ReleasePackage/${packageName}`, bytes);
  const manifest = {
    schemaVersion: 1,
    visualGuid: guid,
    visualVersion: version,
    sourcePackage: { fileName, bytes: bytes.length, sha256: sha256(bytes) },
    registration: resourcePackage,
    files: [...outputs].map(([path, content]) => ({ path, bytes: content.length, sha256: sha256(content) })),
    verificationScope: "Exact local archive and extracted runtime bytes; schema/binding checks are separate from native Desktop or Service acceptance."
  };
  outputs.set("package-manifest.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
  return outputs;
}

export async function syncPackage(packagePath, mode = "write") {
  const bytes = readFileSync(packagePath);
  const { files, visual } = await inspectArchive(bytes);
  checkBindings(visual.capabilities);
  if (mode === "inspect") {
    console.log(`Inspected package ${basename(packagePath)}: GUID/version, CRCs, resource inventory, seven role bindings and formatting properties passed. SHA-256 ${sha256(bytes)}. No files written; not final-package synchronization.`);
    return;
  }
  const outputs = packageOutputs(basename(packagePath), bytes, files);
  const customRoot = join(reportRoot, "CustomVisuals", guid);
  if (existsSync(customRoot)) {
    const allowed = new Set([...outputs.keys()].map(path => resolve(sampleRoot, ...path.split("/"))));
    for (const path of treeFiles(customRoot)) assert(allowed.has(path), `Unexpected existing custom visual file: ${path}. Review it before replacing the package.`);
  }
  for (const [path, content] of outputs) {
    const destination = resolve(sampleRoot, ...path.split("/"));
    if (mode === "check") {
      assert(existsSync(destination), `Package is not synchronized: ${path}. Run sync-report-package.mjs --package <final package>.`);
      assert.deepEqual(readFileSync(destination), content, `Stale package content: ${path}.`);
    } else { mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, content); }
  }
  console.log(`${mode === "check" ? "Verified" : "Synchronized"} exact archive and ${files.size} extracted files; SHA-256 ${sha256(bytes)}. Three report visuals bind to the packaged GUID. Native-host acceptance remains unverified.`);
}

async function selfTest() {
  const fixture = async (mutate = () => {}) => {
    const zip = new JSZip();
    const resource = `resources/${guid}.pbiviz.json`;
    const manifest = {
      version, visual: { guid, version }, resources: [{ resourceId: "rId0", sourceType: 5, file: resource }],
      metadata: { pbivizjson: { resourceId: "rId0" } }
    };
    const visual = {
      visual: { guid, version }, content: { js: "/* inert test fixture */", css: "" },
      capabilities: { dataRoles: Object.keys(roleFields).map(name => ({ name })), privileges: [] }, externalJS: []
    };
    mutate({ manifest, visual, zip });
    zip.file("package.json", JSON.stringify(manifest));
    zip.file(resource, JSON.stringify(visual));
    return zip.generateAsync({ type: "nodebuffer" });
  };
  const firstBytes = await fixture();
  const secondBytes = await fixture(({ visual }) => { visual.content.js = "/* changed same-version inert fixture */"; });
  const first = packageOutputs(packageName, firstBytes, (await inspectArchive(firstBytes)).files);
  const second = packageOutputs(packageName, secondBytes, (await inspectArchive(secondBytes)).files);
  assert.deepEqual([...first.keys()], [...second.keys()], "Same-version rebuilds must overwrite the same output paths.");
  assert.deepEqual(second.get(`ReleasePackage/${packageName}`), secondBytes);
  const firstManifest = JSON.parse(first.get("package-manifest.json").toString("utf8"));
  const secondManifest = JSON.parse(second.get("package-manifest.json").toString("utf8"));
  assert.notEqual(firstManifest.sourcePackage.sha256, secondManifest.sourcePackage.sha256);
  assert.equal(secondManifest.sourcePackage.sha256, sha256(secondBytes));
  for (const file of secondManifest.files) {
    assert.equal(file.sha256, sha256(second.get(file.path)));
    assert.equal(file.bytes, second.get(file.path).length);
  }
  assert.deepEqual(second, packageOutputs(packageName, secondBytes, (await inspectArchive(secondBytes)).files),
    "Repeated synchronization of one archive must produce the same manifest and bytes.");
  await assert.rejects(inspectArchive(await fixture(({ manifest }) => { manifest.visual.guid = "Other"; })), /GUID/u);
  await assert.rejects(inspectArchive(await fixture(({ visual }) => { visual.visual.version = "9.9.9.9"; })));
  await assert.rejects(inspectArchive(await fixture(({ visual }) => { visual.capabilities.privileges = [{ name: "WebAccess" }]; })), /offline/u);
  await assert.rejects(inspectArchive(await fixture(({ visual }) => { visual.capabilities.dataRoles.pop(); })), /lacks role/u);
  await assert.rejects(inspectArchive(await fixture(({ zip }) => { zip.file("../outside.txt", "bad"); })), /Unsafe/u);
  await assert.rejects(inspectArchive(await fixture(({ zip }) => { zip.file("unexpected.txt", "bad"); })), /Unexpected/u);
  await assert.rejects(inspectArchive(Buffer.from("not a zip")));
  console.log("Package sync self-tests passed: deterministic same-version replacement bytes/hashes, valid inert package, wrong GUID/version, external privilege, missing role, traversal/unexpected entry and malformed archive. No files written.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--self-test") await selfTest();
  else {
    assert(args[0] === "--package" && args[1] && args.length <= 3 &&
      (args.length === 2 || ["--check", "--inspect"].includes(args[2])),
    "Usage: node samples\\sync-report-package.mjs --package <final.pbiviz> [--check|--inspect], or --self-test");
    await syncPackage(resolve(args[1]), args[2] === "--check" ? "check" : args[2] === "--inspect" ? "inspect" : "write");
  }
}
