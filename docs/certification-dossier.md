# Certification preparation dossier

**Not submitted; not Microsoft-certified.** Local packaging, audits and browser evidence do not grant certification. The coordinator/owner alone operates native Desktop, shared Service browser, Partner Center and review-access provisioning.

Public Microsoft requirements were reviewed September 9, 2026. Recheck the linked policies and actual offer UI before submission.

## Approved acquisition and runtime

On September 10, 2026 the owner approved **existing Atlyn storefront subscriptions with ungated visuals and free shared viewing**. The renderer is intended as-is; it does not enforce paid-author/subscription entitlements. Do not add license keys, signing infrastructure, AAD/API checks, feature gates, WebAccess or external runtime license calls. Runtime licensing integration is no longer a blocker.

The owner-required target is Microsoft's official **Power BI certified** badge. **Request and review are pending**; no certification is claimed. At the final submission gate, the coordinator selects Partner Center's **Request Power BI certification** checkbox and provides the additional source/function review materials. Microsoft awards the badge after approval. This is not a purchase/IAP badge, runtime gate or graphic to add to the visual, and it does not require badge artwork from the owner. No request or live setting was changed here.

The first-party source inventory contains no `LICENSE`/`LICENCE` file or `package.json` license declaration. Dependency notices do not license the whole Atlyn product. Preserve existing terms; this approval does not invent relicensing or override Power BI host licensing.

Frozen bundles retain their historical evidence/status. No repackage or version bump is needed for this documentation-only clarification. Native/PBIX completion and final assets remain coordinator-owned; hold main, certification-ref advancement, merge and submission until the final gate.

## Source and build

- One independent visual in this private repository. Frozen GUID and version are recorded in `pbiviz.json`.
- Exact lowercase **`certification`** source branch must match the submitted package and remain fixed until the next submission/resubmission. Never silently advance an existing branch. Final branch/commit and archive hashes belong in the sealed evidence.
- `node_modules`, `.tmp`, `dist`, generated embedded report runtime, credentials and development certificates are excluded from review source. Authored TypeScript and report-generation scripts remain reviewable.
- Manifest includes TypeScript, ESLint, `eslint-plugin-powerbi-visuals` and local `eslint`/`package` commands. The Power BI recommended lint rules apply to shipped TypeScript; test harness code is not shipped.
- Latest registry versions retrieved on the review date were API **5.11.1** and tools **7.2.1**, matching the lockfile. Metadata API **5.11.0** denotes the supported API compatibility version.
- Run install/build/lint/audits locally. No GitHub Actions, hosted CI, cloud coding or Codespaces. Package wrapper flags and isolated certificates are documented in `validation.md`.
- Official certification audit and emitted-bundle signature audit are distinct. Review production OSS notices in the actual runtime, empty privileges, network interception, safe DOM, lifecycle and package payload hash together; none alone proves certification.
- Source rebuild ZIP timestamps can differ; compare the audited payload hash as well as retaining the exact submitted ZIP/hash. Do not replace the reviewed package with an untested rebuild.

## Requirements and evidence ownership

| Gate | Local deliverable | Remaining native/owner gate |
| --- | --- | --- |
| Complete code/package | Real official `.pbiviz`, source archive, lockfile, notices and hash manifest | Reviewer source access; owner approval |
| Data behavior | Expected-value oracles, malformed/zero/large values, loops, duplicates, variants, partial limits; 20,000-row input bounded explicitly | Microsoft sample-report dataset plus actual host binding/conversion scenarios |
| Lifecycle | Synchronous finished/failed cycles; repeated update/destroy, isolation and no runtime requests in isolated package browser | Host export, page changes, pinning, tenant policies |
| Interactions | All represented row identities, local focus vs native selection, keyboard/touch/context/tooltips and persisted-state simulation | Actual cross-filtering, bookmarks/save/reopen, focus mode, screen reader and device/browser matrix |
| Performance | Raw samples and p50/p95/max, machine/browser/hash and contention caveats | Actual host developer-tools profile, query/IPC/paint behavior |
| Media | Original icon20/logo300; 1-5 actual package PNG captures at 1366x768, each <=1024 KB | Owner approval; native-host captures if required by reviewer |
| Sample | Fully authored offline bound PBIP plus exact generated runtime | Desktop open/refresh and real offline `.pbix` conversion required |
| Acquisition/runtime | Approved external Atlyn subscriptions, ungated renderer and free shared viewing; no runtime integration required | Approved storefront link and accurate existing subscription copy |
| Official certification badge | Required target: Microsoft **Power BI certified**; source/function review preparation | Coordinator selects **Request Power BI certification** at final gate; request/review pending; Microsoft alone awards the badge |
| Legal/commercial | Recorded first-party license-file absence; dependency notices preserved | Privacy policy, applicable EULA/terms and URL, support readiness and publisher permissions; no invented relicensing |

`supportsHighlight:false` is intentional: Microsoft documents that table mappings cannot carry categorical highlights. Incoming report filtering and local selected-state emphasis must not be marketed as incoming cross-highlight support.

## Submission details and ambiguities

Visual-specific pages require a **20x20 PNG icon**, **300x300 PNG logo**, and **1-5 PNG screenshots exactly1366x768, <=1024 KB each**, plus an offline sample PBIX containing the exact visual. The generic Marketplace image policy instead says1280x720. Use the Power BI-specific target locally but have the owner confirm the live offer upload rule; do not silently treat the discrepancy as resolved.

The publishing page describes an EULA file; the offer-properties page permits a standard contract choice or EULA URL. This is an owner/legal decision. Publishing under the standard contract can constrain later switching. Use HTTPS support/privacy links; no credentials or recovery codes belong in source/evidence. Private review access and Microsoft's validation-account procedures are owner-only.

Certification is an additional review, not endorsement of functionality. Microsoft recommends publication before a certification request, but publication itself is a separate approval. Updates to certified visuals also require review. No live offer, repository visibility, release, licensing or legal commitments are changed by this work.

## Required actual-host scenarios

Record build/hash, tester/date, dataset, steps, actual result and failure evidence for: native import/binding and field removal; stacked-column conversion and three-measure gauge conversion both directions; slicers/visual/page/report filters; outgoing and incoming selections; Ctrl/Alt/Shift/context menus/tooltips at actual-size/fit modes; reading/editing/focus views; multiple pages/instances; save/reopen/bookmarks; dashboard pinning; Publish and authorized tenant refresh; current Chrome/Edge/Firefox and supported touch devices; accessibility; PDF/PowerPoint/image/subscription scenarios. A policy-denied export is a blocker or unsupported scenario, not a pass.

## Microsoft sources

- [Certification requirements](https://learn.microsoft.com/en-us/power-bi/developer/visuals/power-bi-custom-visuals-certified)
- [Publishing requirements](https://learn.microsoft.com/en-us/power-bi/developer/visuals/office-store)
- [Submission tests](https://learn.microsoft.com/en-us/power-bi/developer/visuals/submission-testing)
- [Render events](https://learn.microsoft.com/en-us/power-bi/developer/visuals/event-service)
- [Highlight mapping limitation](https://learn.microsoft.com/en-us/power-bi/developer/visuals/highlight)
- [Offer listing assets](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/power-bi-visual-offer-listing)
- [Offer properties and legal/support](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/power-bi-visual-properties)
- [Marketplace policies, sections100,1180,1200](https://learn.microsoft.com/en-us/legal/marketplace/certification-policies)
