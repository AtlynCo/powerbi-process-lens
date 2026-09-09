import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Original lens surrounding a directed four-activity workflow. Both sizes share this geometry.
const colors = {
  background: [11, 22, 48, 255], lens: [237, 244, 252, 255],
  edge: [63, 213, 186, 255], node: [125, 238, 219, 255]
};
const shapes = [
  { type: "rect", x: 0, y: 0, width: 20, height: 20, radius: 3.2, color: "background" },
  { type: "line", x1: 13.8, y1: 13.8, x2: 17.1, y2: 17.1, width: 2.1, color: "lens" },
  { type: "ring", x: 9, y: 9, radius: 6.7, width: 1.15, color: "lens" },
  { type: "line", x1: 5.5, y1: 9, x2: 9, y2: 5.5, width: 0.75, color: "edge" },
  { type: "line", x1: 9, y1: 5.5, x2: 12.5, y2: 9, width: 0.75, color: "edge" },
  { type: "line", x1: 12.5, y1: 9, x2: 9, y2: 12.5, width: 0.75, color: "edge" },
  { type: "line", x1: 9, y1: 12.5, x2: 5.5, y2: 9, width: 0.75, color: "edge" },
  { type: "line", x1: 10.9, y1: 6.1, x2: 11, y2: 7.5, width: 0.6, color: "edge" },
  { type: "line", x1: 9.6, y1: 7.4, x2: 11, y2: 7.5, width: 0.6, color: "edge" },
  ...[[5.5, 9], [9, 5.5], [12.5, 9], [9, 12.5]].map(([x, y]) => ({
    type: "rect", x: x - 1.1, y: y - 1.1, width: 2.2, height: 2.2, radius: 0.45, color: "node"
  }))
];
const hex = name => `#${colors[name].slice(0, 3).map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
function contains(shape, x, y) {
  if (shape.type === "ring") return Math.abs(Math.hypot(x - shape.x, y - shape.y) - shape.radius) <= shape.width / 2;
  if (shape.type === "line") {
    const dx = shape.x2 - shape.x1, dy = shape.y2 - shape.y1;
    const t = Math.max(0, Math.min(1, ((x - shape.x1) * dx + (y - shape.y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - shape.x1 - t * dx, y - shape.y1 - t * dy) <= shape.width / 2;
  }
  const cx = Math.max(shape.x + shape.radius, Math.min(shape.x + shape.width - shape.radius, x));
  const cy = Math.max(shape.y + shape.radius, Math.min(shape.y + shape.height - shape.radius, y));
  return Math.hypot(x - cx, y - cy) <= shape.radius;
}
function rasterize(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = 4;
  for (let row = 0; row < size; row += 1) for (let column = 0; column < size; column += 1) {
    const sum = [0, 0, 0, 0];
    for (let sy = 0; sy < samples; sy += 1) for (let sx = 0; sx < samples; sx += 1) {
      const x = (column + (sx + 0.5) / samples) * 20 / size;
      const y = (row + (sy + 0.5) / samples) * 20 / size;
      for (let index = shapes.length - 1; index >= 0; index -= 1) {
        if (!contains(shapes[index], x, y)) continue;
        const value = colors[shapes[index].color];
        for (let channel = 0; channel < 4; channel += 1) sum[channel] += value[channel];
        break;
      }
    }
    const offset = (row * size + column) * 4;
    // Unpremultiplied PNG channels avoid dark fringes at transparent rounded corners.
    for (let channel = 0; channel < 3; channel += 1) pixels[offset + channel] = sum[3] ? Math.round(sum[channel] * 255 / sum[3]) : 0;
    pixels[offset + 3] = Math.round(sum[3] / (samples * samples));
  }
  return pixels;
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
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function png(size) {
  const pixels = rasterize(size), header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  const scanlines = Buffer.alloc(size * (size * 4 + 1));
  for (let row = 0; row < size; row += 1) pixels.copy(scanlines, row * (size * 4 + 1) + 1, row * size * 4, (row + 1) * size * 4);
  const compressed = deflateSync(scanlines, { level: 9 });
  const result = Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))]);
  assert.deepEqual(result.subarray(0, 8), signature);
  assert.equal(result.readUInt32BE(16), size); assert.equal(result.readUInt32BE(20), size);
  let offset = 8;
  const data = [];
  while (offset < result.length) {
    const length = result.readUInt32BE(offset);
    const type = result.toString("ascii", offset + 4, offset + 8);
    const content = result.subarray(offset + 8, offset + 8 + length);
    assert.equal(result.readUInt32BE(offset + 8 + length), crc32(result.subarray(offset + 4, offset + 8 + length)));
    if (type === "IDAT") data.push(content);
    offset += length + 12;
  }
  assert.equal(offset, result.length);
  assert.deepEqual(inflateSync(Buffer.concat(data)), scanlines);
  return result;
}
function svg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 20 20" role="img" aria-labelledby="title">
  <title id="title">Atlyn Process Lens: a lens around four connected activities</title>
${shapes.map(shape => {
    if (shape.type === "rect") return `  <rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="${shape.radius}" fill="${hex(shape.color)}"/>`;
    if (shape.type === "ring") return `  <circle cx="${shape.x}" cy="${shape.y}" r="${shape.radius}" fill="none" stroke="${hex(shape.color)}" stroke-width="${shape.width}"/>`;
    return `  <line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" stroke="${hex(shape.color)}" stroke-width="${shape.width}" stroke-linecap="round"/>`;
  }).join("\n")}
</svg>
`;
}
const directory = fileURLToPath(new URL("../assets/", import.meta.url));
const flags = process.argv.slice(2);
if (flags.some(flag => flag !== "--check")) throw new Error("Usage: node scripts\\generate-icons.mjs [--check]");
if (!flags.includes("--check")) mkdirSync(directory, { recursive: true });
for (const [stem, size] of [["icon", 20], ["logo", 300]]) {
  for (const [extension, content] of [["png", png(size)], ["svg", Buffer.from(svg(size))]]) {
    const name = `${stem}.${extension}`, path = resolve(directory, name);
    if (flags.includes("--check")) {
      const actual = readFileSync(path);
      assert.deepEqual(extension === "svg" ? Buffer.from(actual.toString("utf8").replaceAll("\r\n", "\n")) : actual, content, `${name} is stale.`);
    } else writeFileSync(path, content);
  }
}
console.log(`${flags.includes("--check") ? "Verified" : "Generated"} original 20x20 icon and 300x300 logo, PNG + SVG; all PNG chunk CRCs, dimensions and scanline round-trips passed.`);
