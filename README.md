# Atlyn Process Lens

A Power BI custom visual for **analysis of prepared process maps**. It displays supplied activity-to-activity transitions, additive transition frequencies, and explicitly described duration statistics. It is **not a process-mining engine**: it does not ingest case event logs at runtime, discover variants, reconstruct complete paths, infer case counts, or perform causal analysis.

| Identity | Value |
| --- | --- |
| Display name | Atlyn Process Lens |
| Frozen visual GUID | `AtlynProcessLensA61D72B54E9F4B65A137E92DF84610C3` |
| Visual version | `1.0.0.0` |

## What it shows

- A deterministic, bounded, synchronous directed layout: strongly connected activity groups retain reciprocal edges, cycles, and genuine self-loops. Obstacle-aware routes avoid misleading connections through unrelated activities.
- Frequency and, only where unambiguous, the supplied duration statistic. Duplicate prepared records retain additive frequency but make duration unavailable; no runtime averaging or weighted mode.
- Local activity search, focus, graph traversal, and supplied-variant filtering. These are navigation aids, not causal or path discovery.
- A keyboard-operable activity list and transition table, row-aware host selection, native tooltip integration, and context-menu actions.
- Received-subset and invalid-data diagnostics rather than silent claims of completeness.

Activity names are shown on the map. Clicking an activity changes **local focus**, never report selection. Use **Explore and select** for search, traversal, supplied variants, overlay and zoom; use **Activities and transitions** for keyboard-operable full labels and explicit native selections. Reciprocal metrics have separate labels. Dense maps retain their received topology but need zoom, focus or the table for readable detail. Tiny tiles offer **Expand** (a host focus-mode request) instead of a clipped, unreadable graph.

Local navigation is serialized in the hidden `navigation.state` property for host persistence/bookmarks. Native bookmark and focus-mode interoperability remains an explicit acceptance gate, not a browser-harness claim.

The accepted interaction contract supports host cross-filtering and local highlighting of selected rows and their represented items. The table data mapping **does not carry categorical incoming highlight measures** (`supportsHighlight: false`); do not describe this as incoming cross-highlight support.

## Prepare and bind data

Use **one row per source, target, and supplied variant**. The visual has a table mapping:

| Role | Required | Data / binding |
| --- | --- | --- |
| `source` | Yes | Source activity ID, text |
| `target` | Yes | Target activity ID, text |
| `frequency` | Yes | Nonnegative safe-integer transition frequency |
| `duration` | No | Finite nonnegative prepared statistic; never an event timestamp |
| `variant` | No | Supplied variant/group ID, text |
| `rowKey` | No | Stable prepared-row identifier used to preserve host grouping grain |
| `tooltip` | No | Up to six additional fields |

Activity IDs and nonblank supplied variant IDs must be text of at most 120 characters with no control characters. A null or empty variant is retained as an explicit blank group. Frequency counts transitions, **not distinct cases**. Frequency sums that exceed JavaScript's safe-integer range are unavailable, not silently rounded. A missing or invalid duration does not invalidate an otherwise valid frequency.

In the format pane set **Duration provenance**:

- `metrics.statistic`, for example `mean` or `p95`;
- `metrics.unit`, for example `hours`;
- `metrics.provenance`, explaining how the values were prepared.

Do not rely on a column's name to define a metric. No duration statistic is inferred. When duplicate rows contribute to an edge—including aggregation across variants—duration is unavailable with an explicit diagnostic, even if the supplied values happen to be equal.

**Power BI can coalesce source rows before the visual receives them.** Preserve prepared grain using appropriate model measures and `rowKey` where needed; use **Do not summarize** for prepared numeric columns where the host permits it. Never sum or average precomputed means or percentiles. The visual cannot diagnose duplicates or recover information already hidden by an upstream model aggregation. See [the data contract](docs/data-contract.md).

## Synthetic support-ticket example

The repository includes:

- [Prepared transition CSV](samples/prepared-transitions.csv): the **only** sample data the report/visual loads.
- [Synthetic ordered events](samples/events.csv) and [explicit variant paths](samples/variants.json): inputs to an **offline-only** Node preprocessing script, not visual data roles.
- [Power BI Project source](samples/SupportTickets/SupportTickets.pbip): source-authored offline TMDL/PBIR with bound Process Lens pages and native comparison data.

The example has 30 events, six synthetic tickets, three supplied variants, five activities, and 24 adjacent transitions prepared into 12 rows. It includes `Triage → Waiting → Triage` and `Triage → Triage`. Elapsed adjacent-event time totals 41 hours. Ticket counts come from the offline fixture, not graph inference.

The PBIP is source-authored and has **not been opened or refreshed in native Power BI Desktop**. The package synchronization command populates its generated custom-visual resources from the exact `.pbiviz`; the sealed release contains that fully populated report. Follow [the sample guide](samples/README.md) for preparation, bound fields and expected values. Source/schema checks do not substitute for actual Desktop import, rendering, offline refresh or conversion to the required `.pbix`.

## Development

Build prerequisites: **Node.js 24.17**, **npm 11**, and **PowerShell 7** on Windows; non-Windows packaging also requires **OpenSSL**. Run from the repository root:

```powershell
npm ci
npm run typecheck
npm run lint
npm run test
npm run notices
npm run package
npm run test:browser
npm run audit:package
npm run sample
```

All checks are **local-only**. This repository has no GitHub Actions workflow or hosted CI/CD dependency. Do not run cloud agents, Codespaces or hosted workflow runs as a release check. An installed Edge can run the isolated package harness without installing another browser: `$env:PROCESS_LENS_BROWSER_CHANNEL='msedge'`.

If Chromium is missing, run `npm run browser:install`; browser installation and execution use this worktree's ignored `.tmp/browsers`, not a shared browser cache. `npm run package` invokes the official Power BI visual tools through `scripts/package.mjs`. The wrapper creates an ephemeral development certificate with .NET `CertificateRequest` on Windows or OpenSSL elsewhere, scopes `HOME`/`USERPROFILE` to ignored `.tmp/package-home-*`, and removes that invocation's directory afterward. It does not write to certificate stores or change trust settings. No development server is required. This tooling certificate is not publisher signing or Microsoft certification.

The wrapper uses the supported `--all-locales --no-stats` flags: tools 7.2.1's locale-pruning loader cannot parse formattingutils 7's ESM locale module. All numeric/date locales remain bundled offline; UI translations are still English/French. No dependency source is patched.

Packaging produces ignored `dist` artifacts. `npm run notices` generates root `THIRD-PARTY-NOTICES.txt` and a source module bundled into the actual visual's **Third-party notices (bundled offline)** disclosure. Required upstream license text therefore accompanies recipients of the `.pbiviz` itself, without relying on a dropped webpack sidecar. `npm run audit:package` also copies the notices into `dist` alongside package-audit metadata and checksums. Package-audit output is local evidence, not native-host validation or publication approval.

Additional checks:

```powershell
npm run audit:certification
npm audit
npm audit --omit=dev
```

`audit:certification` invokes the official tooling's certification-audit option through the same isolated wrapper; running or passing it is **not Microsoft certification**. Dependency-audit results describe the audited lockfile at that time and must be rechecked for release.

Regenerate and independently check the sample and original icon without adding dependencies:

```powershell
node .\samples\prepare-transitions.mjs --check --self-test
node .\samples\check-report-source.mjs
node .\scripts\generate-icons.mjs
node .\scripts\generate-icons.mjs --check
```

The [reviewable generator](scripts/generate-icons.mjs) uses only Node built-ins and produces original 20×20 icon and 300×300 logo PNG/SVG assets. Actual package-browser screenshots are captured at 1366×768 in ignored release evidence; they are not native Power BI screenshots.

## Boundaries and accessibility

The visual processes at most the first **2,000 received rows**, **80 activities**, and **300 source-target-variant edges**. Records exceeding graph limits are skipped with visible warnings. It does not call `fetchMoreData`; visible totals describe the accepted received subset. Empty/invalid data and host segmentation are diagnosed. Filters can change that subset.

Selection actions represent all contributing row identities rather than choosing an arbitrary first edge. Variant filtering is local; a separate **Select variant rows in report** action performs host selection. Aggregated transitions cannot reconstruct ordered paths.

Formatting exposes `appearance.edgeColor`, `appearance.nodeColor`, and `appearance.showLabels`. UI localization is English/French, with English fallback for other locales; text direction follows host locale, including RTL languages. The layout is not animated, including under reduced-motion preferences. Native Desktop/Service keyboard, screen-reader, high-contrast, RTL, and export behavior remain [manual acceptance gates](docs/publication-checklist.md), not accessibility certification claims.

## Runtime and publication status

The runtime is designed without external services, network requests, telemetry, authentication, or licensing checks; `privileges` is empty. The formatting dependency `powerbi-visuals-utils-formattingutils` is reviewable open-source code. This describes the custom visual runtime, not npm installation, Power BI's own services, the report's data source, or tenant policies.

**Owner-approved distribution, September 10, 2026:** acquisition uses existing Atlyn storefront subscriptions; the visual runtime is intentionally **ungated**, including free shared viewing. It does not enforce paid-author seats, subscription ownership or activation. No license keys, signer, AAD/API integration, feature gates or external runtime license calls are required. Runtime licensing integration is not a blocker. Power BI's own licensing, permissions and tenant policies remain separate.

The owner explicitly requires the **Power BI additional-purchase badge** for storefront acquisition. This is listing configuration/disclosure, not a Microsoft certification badge or an in-visual enforcement feature. The coordinator owns the live offer setting, acquisition link and final assets.

**Current first-party license record:** at main commit `d03b38ba89ac2729471e06306dc6789643178f63`, there is no first-party `LICENSE`/`LICENCE` file and no `package.json` license declaration. `THIRD-PARTY-NOTICES.txt` applies only to its named dependencies, not the Atlyn product as a whole. This update does not add or change a license grant. Free shared viewing describes the approved runtime/distribution behavior, not a new source-code license or a waiver of Power BI requirements.

The project is **not represented as Microsoft-certified or publication-ready**. Privacy/legal materials, existing subscription terms and listing accuracy, native-host validation, genuine PBIX conversion and final store-media approval remain owner gates. The coordinator alone manages Desktop/shared Service UI and live Marketplace submission. Main/certification advancement, merge and submission remain on hold until the coordinator's final gate. Frozen evidence is preserved; this documentation-only approval needs no runtime rebuild or version bump. No certification, service level, competitive superiority or business outcome is promised here.

Approved publisher/contact metadata: **Atlyn**, <atlyn.help@gmail.com>. Public support: <https://www.atlynco.com/docs/faq>; the coordinator verified its support content. Listing this contact does not promise mailbox monitoring or response times.

Collaborator-only issue tracking: <https://github.com/AtlynCo/powerbi-process-lens/issues>. The private repository remains the approved source-repository link, **not a public support endpoint**. See the [publication checklist](docs/publication-checklist.md) and [host validation plan](docs/validation.md).

See [the scoped comparison](docs/scoped-comparison.md), [current certification requirements](docs/certification-dossier.md), and [listing draft](docs/listing-dossier.md). Comparison research is not Marketplace listing copy.
