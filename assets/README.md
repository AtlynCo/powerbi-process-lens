# Original icon and listing logo

| Asset | Dimensions | Purpose |
| --- | --- | --- |
| `icon.png` / `icon.svg` | 20×20 | Packaged visual icon |
| `logo.png` / `logo.svg` | 300×300 | Draft listing logo, subject to owner brand approval |

All four assets share original geometric artwork: a light lens surrounding a directed four-activity workflow, with a mint process motif on a navy rounded square. PNGs are 8-bit RGBA. SVGs are editable vector sources. Neither is a screenshot, third-party logo, Microsoft mark, or certification badge.

Regenerate from the repository root:

```powershell
node .\scripts\generate-icons.mjs
node .\scripts\generate-icons.mjs --check
```

The generator uses Node built-ins only. A deterministic 4×4 subpixel sampler rasterizes the shared circles, rounded rectangles and lines. It writes PNG signature/IHDR/IDAT/IEND chunks, computes CRC32 checksums, and compresses scanlines with `node:zlib`. Checks cover a known CRC32 reference, every output chunk's CRC, exact dimensions, decompressed scanlines, and byte-for-byte regeneration. There are no fonts, downloads, embedded external content, image libraries, or screenshot substitutions.

## Screenshots are separate evidence

These assets do not supply publication screenshots or prove a report opened in Power BI. Do not present the logo, hand-drawn page, generated HTML, or graph mockup as a native report screenshot.

Actual packaged-browser captures, if produced by the release validation workflow, must be labelled as **packaged browser harness**, not Desktop or Service. Native-host screenshots require a genuine accepted report in that host. Their package hash, fixture, dimensions, capture command or manual steps, and limitations belong in the evidence record. The [listing dossier](../docs/listing-dossier.md) supplies draft captions and an acceptance checklist, not invented captures.

The visual-specific listing requires **1–5 PNG screenshots**, each **exactly 1366×768 pixels** and **≤1024 KB**. Check actual output files, not just a requested browser viewport. The original 300×300 logo and 20×20 icon are separate assets and do not count as screenshots.

Brand ownership approval, legal terms, pricing/licensing, submission authority, and live publication remain owner-controlled gates.
