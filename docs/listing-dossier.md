# Atlyn Process Lens — listing dossier

**Human-review draft. Not a submitted offer, certification result, approval, commercial contract or release authorization.**

This dossier collects proposed listing copy, assets, evaluator steps and unresolved owner decisions for version **1.0.0.0**. It does not create an offer, sign into Partner Center, submit to Microsoft, publish a repository or change prices/licensing. Do not replace blocked fields with plausible-sounding invented details.

**Approved September 10, 2026:** acquisition through existing Atlyn storefront subscriptions, with **ungated visuals and free shared viewing**. The renderer is intended as-is; runtime licensing integration is not a blocker. Do not add paid-author enforcement, license keys, a new signer, AAD/API checks, feature gates, WebAccess or runtime license calls. The owner explicitly requires the **Power BI additional-purchase badge** in the listing. Main/certification advancement, merge and submission remain held for the coordinator's final native/PBIX/assets gate. Frozen bundles are not rewritten; no runtime rebuild or version bump is needed for this clarification.

## 1. Identity and current metadata

| Field | Current value / review status |
| --- | --- |
| Product name | **Atlyn Process Lens** |
| Publisher/author label in package | **Atlyn**; legal publishing entity and brand authority require owner confirmation |
| Visual GUID | `AtlynProcessLensA61D72B54E9F4B65A137E92DF84610C3` — frozen |
| Package version | `1.0.0.0` — frozen for this release |
| Current support email | `atlyn.help@gmail.com` — owner must confirm mailbox control and readiness |
| Current support URL | `https://www.atlynco.com/docs/faq` — owner must verify public access, relevant content and ongoing maintenance |
| Source repository metadata | `https://github.com/AtlynCo/powerbi-process-lens` — **private**; not a public customer support or download link |
| Proposed listing language | English; report narrative is English |
| Packaged localization | English/French resource files are included in current project metadata; final-package/native-host checks still apply |
| Offer ID, seller ID and product identifiers assigned by Microsoft | **BLOCKED — owner decisions / Partner Center creation**, not fabricated here |

The support email and URL above reproduce existing metadata; this dossier does not attest deliverability, uptime, response time or a service-level agreement.

## 2. Proposed customer-facing listing copy

### Name

Atlyn Process Lens

### Summary

Explore prepared workflows with frequency, supplied duration, cycles, and data-quality context.

### Description

Atlyn Process Lens displays prepared activity-to-activity transitions as an interactive process map in Power BI.

Use it to explore transition frequency, examine supplied duration statistics, and inspect cycles or repeated activities without removing them from the graph. Search activities, focus on nearby, upstream or downstream connections, and compare supplied variants. A tabular view provides another way to inspect visible transitions.

The visual consumes a prepared transition table: source activity, target activity and transition frequency are required. You can also supply a duration statistic, variant, stable prepared-row identifier and tooltip fields. Define the duration statistic, unit and preparation method in the visual's format settings so readers know what a displayed number means.

Frequency values can add across contributing rows. Duration statistics are shown only when the displayed edge has a single eligible prepared contributor; they become unavailable when duplicate or cross-variant contributors would require aggregation. The visual does not invent a combined mean, median or percentile. Use one prepared row per edge and variant and preserve row identity.

Acquisition is through existing Atlyn storefront subscriptions. The visual runtime is ungated, including free shared viewing: it does not verify paid-author seats, license keys or subscription ownership, and has no activation or feature locks. Power BI licensing, permissions and tenant policies still apply.

Graph processing is local to the visual and does not require an external process-analysis service or runtime entitlement call.

An included synthetic support-ticket sample demonstrates a waiting cycle, a repeated-activity self-loop, explicit duration provenance and a native reference table. The sample event-preparation script runs offline. It is an example for the supplied schema, not a general event-log mining product.

Atlyn Process Lens does not infer cases, discover full process variants, calculate conformance, determine root causes or classify rework. A cycle or self-loop shows supplied graph structure, not proof of case-level rework or an error. Adjacent-event elapsed time is not necessarily hands-on processing time.

### Proposed keywords

1. process map
2. workflow
3. transitions

Current visual-offer limits reviewed September 9, 2026: up to three keywords, summary at most 100 characters and description at most 3,000 characters. Recheck the edited copy against these limits before submission. The owner chooses up to two categories from the current offer UI; no industry claim is selected.

### Proposed audience and use cases

- Report authors with an existing prepared transition model.
- Operations analysts comparing supplied workflow variants and frequency.
- Analysts who need visible cycles, self-loops and explicit unavailable-statistic behavior.

**Not proposed:** broad event-log process mining, automated process discovery, causal bottleneck detection, predictive optimization or case-level compliance analysis. No comparative superiority or “best-in-class” claim is approved by this draft.

## 3. Feature and limitation disclosure

| Topic | Accurate disclosure for owner review |
| --- | --- |
| Input grain | Prepared transitions, preferably exactly one row per `(source, target, variant)` with a stable row key. Raw events are not the runtime input contract. |
| Frequency | Additive counts of supplied transitions, not inherently a distinct case count. |
| Duration | Independently supplied scalar with declared statistic/unit/provenance. No runtime weighted average, percentile merge or cross-variant recomputation. |
| Cycles and self-loops | Preserved as graph structure; business meaning is not inferred. |
| Variant | A supplied identifier/filter dimension; the visual does not reconstruct complete case paths from aggregate edges. |
| Data completeness | Host row windows, reduction/segmentation, invalid rows and render limits can affect visible data. Readers must inspect diagnostics; a visible subset is not proof of full-log coverage. |
| Local vs report scope | Local search/focus/variant controls explore the visual. Explicit host-selection actions are separate and depend on report interaction configuration. |
| Offline processing | Visual graph processing and the included preparation script do not require an external analysis service. This is not a promise that the entire Power BI host, tenant or model has no network activity. |
| Acquisition and viewing | Existing Atlyn storefront subscriptions handle acquisition; the renderer is ungated with free shared viewing, not paid-author enforcement. Host licensing/permissions still apply. |
| Required purchase badge | Include the owner-required Power BI additional-purchase badge and accurate external acquisition copy. This is a listing requirement, not a certification badge, runtime lock or Microsoft-managed entitlement integration. |
| Deployment | Tenant/organization policy may restrict private custom visuals. Desktop, Service, export, mobile and accessibility acceptance must be recorded separately; browser harness checks are not substitutes. |
| Security and privacy | Do not claim a legal privacy policy or complete compliance certification from an empty visual privilege list alone. Owner-approved terms and privacy notice are still required. |
| Publication status | Not represented as Microsoft-certified, AppSource-approved, submitted, generally available or commercially licensed by this dossier. |

## 4. Asset handoff

| Asset | Supplied material | Gate |
| --- | --- | --- |
| Visual icon | `assets/icon.png`, 20×20; matching SVG | Verify exact final package contains regenerated icon |
| Draft store logo | `assets/logo.png`, 300×300; matching SVG | Owner approves original design/brand usage |
| Screenshot evidence | 1–5 PNG screenshots, each exactly **1366×768**, no larger than **1024 KB** | Genuine final-package captures, final evidence attachment and human review required |
| Native sample report | Four-page PBIP/PBIR/TMDL in `samples/SupportTickets` | Final package sync, native Desktop acceptance and **mandatory Desktop-created sample PBIX** for certification |
| Runtime archive | Final `.pbiviz`, exact-byte sample copy and `package-manifest.json` | Rebuild, audit and hash comparison required after all code/asset changes |
| Sealed offline report archive | Complete populated `samples/SupportTickets` directory, including generated private visual resources and exact `.pbiviz` | Release owner seals and hashes it outside the certification source branch; a tracked-files-only archive omits required ignored runtime |
| Third-party notices | Generated notices from the repository's release tooling | Include reviewed final notices with distributed runtime |

The icon/logo are original geometric artwork, not screenshots or Microsoft certification badges. See [asset provenance](../assets/README.md).

The **additional-purchase Power BI badge is explicitly required**. The coordinator owns the final offer configuration, storefront link and assets. Microsoft's [offer setup documentation](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/power-bi-visual-offer-setup), reviewed September 10, 2026, lists **My offer requires purchase of a service or offers additional in-app purchase** for independently managed transactions, separately from Microsoft-managed licensing and no-purchase offers. Configure the appropriate external-purchase disclosure at the final gate; do not invent a custom Microsoft badge image or add runtime checks. No live offer setting was changed here.

### Draft screenshot captions and capture plan

Three actual package-browser images are captured by the release gate and recorded with hashes in the sealed evidence: frequency overview, locally selected V02 duration, and accessible table/diagnostics. These do not claim native-host acceptance. The additional self-loop image below remains an optional native capture plan. Do not fabricate host chrome or label the local harness as Desktop/Service.

The visual-specific listing limit is **1–5 PNG screenshots**, each **exactly 1366×768 pixels** and **≤1024 KB**. The four-image plan below stays within that bound. The report's 1280×720 design canvas is a report layout choice, not the required screenshot output dimensions. Verify actual image dimensions, file sizes and final-package provenance before attaching them.

| Proposed image | Draft caption | Required state/evidence |
| --- | --- | --- |
| Workflow overview | “Explore supplied workflow transitions by frequency, with shared-edge duration explicitly unavailable.” | All-variant fixture; six edges; shared frequencies 6; unavailable duration explanation visible |
| Cycle duration | “Inspect a supplied variant with reciprocal waiting transitions and declared mean elapsed hours.” | Captured package uses the V02 local selector, not a model filter; 1.75/2.50 h edges. Native report instead uses its visible V02 page filter. |
| Repeated activity | “Keep repeated activities visible, including a self-loop with a prepared mean of 0.25 hours.” | V03; self-loop frequency 2; mean 0.25 h; no rework claim |
| Quality and provenance | “Check prepared row identity, source statistics and interpretation limits alongside the workflow.” | Genuine table/diagnostic view; statistic/unit/provenance; no cropped-away warnings that change interpretation |

Record for every retained image: path, exact pixel dimensions, capture host, host/browser version, final `.pbiviz` SHA-256, input fixture/filter/navigation state, command or manual capture steps, and any excluded surfaces. Browser captures may demonstrate the package renderer; they cannot satisfy a native-report acceptance claim. Use only synthetic data and approved non-sensitive UI.

## 5. Evaluator instructions

No credentials, customer tenant, external analysis endpoint or paid analysis service should be needed to inspect the default embedded synthetic fixture. Power BI itself must be installed/licensed and permit private visual files.

### Local source/package preflight

From the repository root, after the release owner builds and audits the final package:

```powershell
node .\scripts\generate-icons.mjs --check
node .\samples\prepare-transitions.mjs --check --self-test
node .\samples\author-report.mjs --check
node .\samples\sync-report-package.mjs --self-test
$package = ".\dist\AtlynProcessLensA61D72B54E9F4B65A137E92DF84610C3.1.0.0.0.pbiviz"
node .\samples\sync-report-package.mjs --package $package
node .\samples\sync-report-package.mjs --package $package --check
node .\samples\check-report-source.mjs
node .\samples\check-report-source.mjs --schemas
```

The last command fetches only public Microsoft JSON schemas for local validation. The fixture, report and package stay local. Schema checks do not prove DAX/M execution, Desktop acceptance, export behavior or certification. The explicit source-only `--allow-unsynced` flag is for development before final synchronization; it must not be substituted for release preflight.

### Native sample walkthrough — manual acceptance

1. Keep the complete `samples/SupportTickets` folder together. Open `SupportTickets.pbip` in a supported current Power BI Desktop version with PBIP/TMDL/PBIR support. Do not rename source files to `.pbix`.
2. Refresh the model. Empty `CsvPath` loads the embedded exact prepared CSV; no machine-specific file edit is required. Confirm the methodology table has 12 rows and all row frequencies are 2.
3. On **Workflow overview**, confirm the exact packaged custom visual renders. Three shared edges have frequency 6; merged duration is unavailable rather than an invented mean. Three other edges have frequency 2.
4. On **V02 cycle and duration**, inspect the visible model-level V02 filter, five edges and reciprocal Triage/Waiting connections. Check 1.75 and 2.50 hours against the native table.
5. On **V03 repeated activity**, inspect the V03 model filter, four edges and self-loop. Confirm frequency 2 and mean 0.25 hours; the model includes a zero-hour source interval.
6. Exercise search, focus, traversal, overlay switching, zoom and graph/table inspection. Verify local exploration does not masquerade as a report filter. Test explicit report selection and clearing against the adjacent native table.
7. Check keyboard/focus behavior, supplied tooltips, provenance, high-contrast rendering and bookmark restoration in the actual host. Record observations; do not convert browser-harness results into native pass marks.
8. Save/reopen the PBIP. Record any source normalization, parse errors or host repairs. Certification requires a native sample **PBIX**: the authorized owner must create it through Desktop and separately reopen/verify that binary. The authored PBIP, schema results or a renamed archive do not satisfy this gate.
9. Complete authorized Service/export/mobile checks separately where required. No automated script in this dossier publishes anything.

Expected synthetic arithmetic: **30 events, 6 cases, 3 supplied variants, 5 activities, 12 prepared rows, 24 adjacent transitions and 41 adjacent-event elapsed hours**. The 41-hour total is an offline fixture arithmetic check, not a runtime duration aggregation feature.

## 6. Support and operational readiness

**Draft support routing:** use the current support email and FAQ URL in section 1 once the owner verifies they are usable for customers.

A useful report should include product/package version, host and version, reproduction steps, expected/actual behavior, field-role mapping, non-sensitive format settings, and the visible completeness/quality message. Prefer a minimal synthetic prepared-row example. Do not request credentials, bearer tokens, personal event logs or customer report contents by default.

**Owner tasks before publication:**

- Confirm who monitors the mailbox and maintains FAQ/support content.
- Define support scope, supported host/version policy and escalation/maintenance process.
- Approve wording on retention, handling and deletion of support attachments.
- Define a security-reporting route and response expectations, if any; none are invented here.
- Decide whether any public issue tracker or downloads will exist. The private GitHub repository is not currently a customer-accessible alternative.
- Approve any uptime/response-time commitments separately. This draft supplies **no mailbox SLA**.

## 7. First-party license record and owner decisions

At inspected main commit `d03b38ba89ac2729471e06306dc6789643178f63`, no first-party `LICENSE`/`LICENCE` file or `package.json` license declaration exists. `THIRD-PARTY-NOTICES.txt` explicitly applies to named dependencies, not to the Atlyn product as a whole. Those notices and all existing source terms are preserved; this update creates no new license, grant, signer or enforcement scheme. Free shared viewing describes the approved distribution/runtime behavior, not a new source-code license or waiver of Power BI requirements.

| Decision / artifact | Status | What the owner must provide |
| --- | --- | --- |
| Legal publisher and brand authority | **BLOCKED** | Legal entity, marketplace account ownership, required verified details and approval to use Atlyn branding |
| Submission authority / Partner Center access | **BLOCKED** | Authorized human owner and approved account; no live account activity performed here |
| Certification source branch | **FINAL HANDOFF RECORD** | The release handoff records the exact lowercase **`certification`** branch commit matching the sealed source/package. Generated `CustomVisuals` runtime and duplicate packages are excluded from source and included in the sealed offline report. Reviewer access and submission authority remain owner gates. |
| Public privacy notice URL | **BLOCKED** | Owner-approved applicable privacy policy, public URL and review of visual/support data practices |
| End-user terms / license agreement URL | **BLOCKED** | Approved terms, grants/restrictions, jurisdiction and public availability; not inferred from repository privacy |
| Acquisition / commercial model | **APPROVED — EXISTING STOREFRONT SUBSCRIPTIONS** | Use existing Atlyn acquisition/subscription terms and approved links. Numeric prices, plans and other existing storefront details must be accurately supplied, not invented here. |
| Runtime entitlement behavior | **APPROVED — UNGATED** | Free shared viewing; no paid-author/subscription checks, activation, keys, signer, AAD/API, feature gates, WebAccess or runtime license calls. No runtime integration blocker remains. |
| Additional-purchase Power BI badge | **REQUIRED — FINAL LISTING GATE** | Coordinator configures the external-purchase disclosure/badge, acquisition link and final approved assets; not a certification badge. |
| Microsoft/Power BI licensing wording | **HOST REQUIREMENTS REMAIN** | Free shared viewing adds no Atlyn runtime gate; it does not waive Power BI licensing, report permissions or tenant policies. |
| Support readiness | **BLOCKED** | Verified mailbox/URL ownership, content, staffing and approved service commitments, if any |
| Accessibility and host compatibility claims | **BLOCKED pending native evidence** | Actual tested hosts/versions, limitations and accessible-use results |
| Screenshots and sample binary | **LOCAL MEDIA / NATIVE BINARY BLOCKED** | Three final-package PNG captures are hashed in sealed evidence. Native-accepted PBIP, mandatory Desktop-created sample PBIX and owner media approval remain outstanding. |
| Certification / listing submission | **NOT PERFORMED** | Current requirement review, full evidence, human authorization and Microsoft's eventual result |
| Release package approval | **OWNER APPROVAL PENDING** | Sealed manifest binds one package to report resources, browser evidence and notices; owner approves the eventual submitted artifact |

The approved storefront/ungated-viewing pattern above is explicit. No unspecified sale price, source-code license grant, legal contact/address, certification status or Microsoft endorsement is invented by any blank or draft field.

## 8. Release review checklist

- [ ] Identity matches frozen GUID/version and approved publisher brand.
- [ ] Name/summary/description/keywords checked against current submission field limits.
- [ ] Capabilities, limitations, platform support and privacy wording match the final package.
- [ ] Original icon and 300×300 logo approved; final package contains the matching icon.
- [ ] Exact final `.pbiviz` synchronized into private `CustomVisuals` resources, and all SHA-256 checks pass.
- [ ] Generated runtime/package paths are ignored and absent from the certification source index; the separately sealed offline report archive includes those generated resources, exact package and hash manifest.
- [ ] Four authored sample pages accepted in native Desktop; no hidden repair/import gap represented as a pass.
- [ ] Mandatory native sample PBIX created by Desktop and separately reopened/verified.
- [ ] Genuine screenshots: 1–5 PNG files, exactly 1366×768 each, each ≤1024 KB, with truthful host labels.
- [ ] Public support, legal terms and privacy URLs verified by the owner.
- [x] Owner approved existing storefront subscriptions, ungated visuals and free shared viewing; no runtime licensing integration is pending.
- [ ] Final listing includes the required additional-purchase Power BI badge and accurate approved storefront links/terms, without paid-author enforcement claims.
- [ ] Final third-party notices and dependency/license review complete.
- [ ] Current Microsoft publication/certification requirements reviewed separately; no unsupported claims added.
- [ ] Release owner provides the required source branch named exactly lowercase `certification`; no branch publication is performed by this dossier.
- [ ] Authorized owner approves any future submission. **No live submission occurred in this work.**

Related local material: [sample walkthrough](../samples/README.md), [data contract](data-contract.md), [validation gates](validation.md), [publication checklist](publication-checklist.md), [original asset source](../assets/README.md).

Primary source entry points for the release owner's current requirements review: [Power BI visual publication](https://learn.microsoft.com/en-us/power-bi/developer/visuals/office-store), [certification](https://learn.microsoft.com/en-us/power-bi/developer/visuals/power-bi-custom-visuals-certified), and [PBIP/PBIR report format](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-report). These are references, not evidence of approval.
