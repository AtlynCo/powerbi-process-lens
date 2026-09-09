# Original icon source

`icon.png` is a 20×20, 8-bit RGBA PNG. `icon.svg` represents the same original rectangular geometry: four activities, connecting edges, and direction marks on a dark background. It is not a screenshot or a third-party logo.

Regenerate from the repository root:

```powershell
node .\scripts\generate-icons.mjs
node .\scripts\generate-icons.mjs --check
```

The reviewed source generator uses Node built-ins only. It writes PNG signature/IHDR/IDAT/IEND chunks, computes CRC32 checksums, and compresses scanlines with `node:zlib`. Its checks include a known CRC32 reference value and a zlib round trip. PNG and SVG derive from one geometry list, with no fonts, downloads, embedded external content, image libraries, or screenshot substitution.

This icon does not supply publication screenshots, a store listing banner, legal terms, or brand approval. Those remain owner-controlled publication tasks.
