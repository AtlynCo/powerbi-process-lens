import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const temporary = resolve(".tmp");
mkdirSync(temporary, { recursive: true });
const home = mkdtempSync(join(temporary, "package-home-"));
const certificateDirectory = join(home, "pbiviz-certs");
mkdirSync(certificateDirectory);
const environment = { ...process.env, HOME: home, USERPROFILE: home };
const config = JSON.parse(readFileSync("pbiviz.json", "utf8"));
const artifact = resolve("dist", `${config.visual.guid}.${config.visual.version}.pbiviz`);
const started = Date.now();
function run(command, args, env = environment) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`);
}
try {
  if (process.platform === "win32") {
    run("pwsh", ["-NoProfile", "-File", resolve("scripts", "create-package-certificate.ps1"), "-OutputDirectory", certificateDirectory]);
  } else {
    run("openssl", ["req", "-newkey", "rsa:2048", "-nodes", "-x509", "-days", "7",
      "-keyout", join(certificateDirectory, "PowerBICustomVisualTest_private.key"),
      "-out", join(certificateDirectory, "PowerBICustomVisualTest_public.crt"), "-subj", "/CN=localhost"]);
  }
  run(process.execPath, [resolve("node_modules", "powerbi-visuals-tools", "bin", "pbiviz.js"), "package", "--all-locales", "--no-stats", ...process.argv.slice(2)]);
  if (!existsSync(artifact) || statSync(artifact).mtimeMs < started) throw new Error("Packager did not produce a fresh release artifact.");
} finally {
  // Only this invocation's locally generated credential directory is removed.
  rmSync(home, { recursive: true, force: true });
}
