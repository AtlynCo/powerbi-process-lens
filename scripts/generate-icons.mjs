import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Original pixel geometry: a branched, directed process on a dark square, not a screenshot.
// A single rectangle list produces both SVG source and the 20 x 20 RGBA PNG.
const size = 20;
const colors = {
  background: [17, 24, 39, 255],
  edge: [226, 232, 240, 255],
  node: [45, 212, 191, 255]
};
const rectangles = [
  [0, 0, 20, 20, "background"],
  [5, 4, 10, 2, "edge"], [14, 5, 2, 10, "edge"],
  [5, 14, 10, 2, "edge"], [4, 5, 2, 10, "edge"],
  [10, 2, 2, 2, "edge"], [12, 4, 2, 2, "edge"], [10, 6, 2, 2, "edge"],
  [16, 10, 2, 2, "edge"], [14, 12, 2, 2, "edge"], [12, 10, 2, 2, "edge"],
  [8, 12, 2, 2, "edge"], [6, 14, 2, 2, "edge"], [8, 16, 2, 2, "edge"],
  [2, 2, 5, 5, "node"], [13, 2, 5, 5, "node"],
  [13, 13, 5, 5, "node"], [2, 13, 5, 5, "node"]
];
const pixels = Buffer.alloc(size * size * 4);
for (const [x, y, width, height, color] of rectangles) {
  assert(x >= 0 && y >= 0 && x + width <= size && y + height <= size);
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      Buffer.from(colors[color]).copy(pixels, (row * size + column) * 4);
    }
  }
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
const scanlines = Buffer.alloc(size * (size * 4 + 1));
for (let row = 0; row < size; row += 1) pixels.copy(scanlines, row * (size * 4 + 1) + 1, row * size * 4, (row + 1) * size * 4);
const compressed = deflateSync(scanlines, { level: 9 });
assert.deepEqual(inflateSync(compressed), scanlines);
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))
]);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" role="img" aria-labelledby="title" shape-rendering="crispEdges">
  <title id="title">Atlyn Process Lens: connected process activities</title>
${rectangles.map(([x, y, width, height, color]) => `  <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#${colors[color].slice(0, 3).map(channel => channel.toString(16).padStart(2, "0")).join("")}"/>`).join("\n")}
</svg>
`;
const directory = fileURLToPath(new URL("../assets/", import.meta.url));
const flags = process.argv.slice(2);
if (flags.some(flag => flag !== "--check")) throw new Error("Usage: node scripts/generate-icons.mjs [--check]");
if (!flags.includes("--check")) mkdirSync(directory, { recursive: true });
for (const [name, content] of [["icon.png", png], ["icon.svg", Buffer.from(svg)]]) {
  const path = resolve(directory, name);
  if (flags.includes("--check")) assert.deepEqual(readFileSync(path), content, `${name} is stale.`);
  else writeFileSync(path, content);
}
console.log(`${flags.includes("--check") ? "Verified" : "Generated"} original 20x20 RGBA PNG and SVG icon; CRC32 reference and zlib round-trip passed.`);
