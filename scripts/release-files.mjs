import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
export function sourceInputs() {
  const names = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0");
  return Object.fromEntries([...new Set(names)].filter(name =>
    name && name !== "README.md" && !name.startsWith("docs/") && existsSync(name.split("/").join(sep))
  ).sort().map(name => [name, sha256(readFileSync(name.split("/").join(sep)))]));
}
export function hashesUnder(directory, omit = []) {
  const hashes = {};
  function visit(current, prefix) {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (omit.includes(name)) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path, name);
      else {
        assert(entry.isFile(), "Release inputs must not contain filesystem links");
        hashes[name] = sha256(readFileSync(path));
      }
    }
  }
  visit(directory, "");
  return hashes;
}
