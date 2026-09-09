# Atlyn Process Lens

A Power BI custom visual for **analysis of prepared process maps**. It displays supplied activity-to-activity transitions, additive transition frequencies, and explicitly described duration statistics. It is **not a process-mining engine**: it does not ingest case event logs at runtime, discover variants, reconstruct complete paths, infer case counts, or perform causal analysis.

| Identity | Value |
| --- | --- |
| Display name | Atlyn Process Lens |
| Frozen visual GUID | `AtlynProcessLensA61D72B54E9F4B65A137E92DF84610C3` |
| Visual version | `1.0.0.0` |

## What it shows

- A deterministic, bounded, synchronous circular layout retaining reciprocal edges, cycles, and genuine self-loops.
- Frequency and, only where unambiguous, the supplied duration statistic. Duplicate prepared records retain additive frequency but make duration unavailable; no runtime averaging or weighted mode.
- Local activity search, focus, graph traversal, and supplied-variant filtering. These are navigation aids, not causal or path discovery.
- A keyboard-operable activity list and transition table, row-aware host selection, native tooltip integration, and context-menu actions.
- Received-subset and invalid-data diagnostics rather than silent claims of completeness.

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
- [Power BI Project source](samples/SupportTickets/SupportTickets.pbip): a local CSV semantic model in TMDL and a native table report in PBIR.

The example has 30 events, six synthetic tickets, three supplied variants, five activities, and 24 adjacent transitions prepared into 12 rows. It includes `Triage → Waiting → Triage` and `Triage → Triage`. Elapsed adjacent-event time totals 41 hours. Ticket counts come from the offline fixture, not graph inference.

The PBIP is source-authored and has **not been opened or refreshed in native Power BI Desktop**. It deliberately contains a native table, not fabricated custom-visual binding metadata. Change its local `CsvPath` parameter, open and refresh in Desktop, then import the **actual packaged `.pbiviz`** and bind its roles manually. Follow [the sample guide](samples/README.md) for exact fields, format settings, expected values, and fallback instructions. No PBIX or product screenshots are supplied.

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

The icon's [reviewable generator](scripts/generate-icons.mjs) uses only Node built-ins, including `zlib`, and produces an original 20×20 PNG and matching SVG. It is an icon, not a report screenshot.

## Boundaries and accessibility

The visual processes at most the first **2,000 received rows**, **80 activities**, and **300 source-target-variant edges**. Records exceeding graph limits are skipped with visible warnings. It does not call `fetchMoreData`; visible totals describe the accepted received subset. Empty/invalid data and host segmentation are diagnosed. Filters can change that subset.

Selection actions represent all contributing row identities rather than choosing an arbitrary first edge. Variant filtering is local; a separate **Select variant rows in report** action performs host selection. Aggregated transitions cannot reconstruct ordered paths.

Formatting exposes `appearance.edgeColor`, `appearance.nodeColor`, and `appearance.showLabels`. UI localization is English/French, with English fallback for other locales; text direction follows host locale, including RTL languages. The layout is not animated, including under reduced-motion preferences. Native Desktop/Service keyboard, screen-reader, high-contrast, RTL, and export behavior remain [manual acceptance gates](docs/publication-checklist.md), not accessibility certification claims.

## Runtime and publication status

The runtime is designed without external services, network requests, telemetry, authentication, or licensing checks; `privileges` is empty. The formatting dependency `powerbi-visuals-utils-formattingutils` is reviewable open-source code. This describes the custom visual runtime, not npm installation, Power BI's own services, the report's data source, or tenant policies.

The project is **not represented as Microsoft-certified or publication-ready**. Privacy/legal materials, distribution terms, native-host validation, and genuine store media must be supplied or approved by the owner before publication. Support accuracy and responsiveness remain manual release gates. No certification, service level, licensing entitlement, or business outcome is promised here.

Approved publisher/contact metadata: **Atlyn**, <atlyn.help@gmail.com>. Public support: <https://www.atlynco.com/docs/faq>; the coordinator verified its support content. Listing this contact does not promise mailbox monitoring or response times.

Collaborator-only issue tracking: <https://github.com/AtlynCo/powerbi-process-lens/issues>. The private repository remains the approved source-repository link, **not a public support endpoint**. See the [publication checklist](docs/publication-checklist.md) and [host validation plan](docs/validation.md).
