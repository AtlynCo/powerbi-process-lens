# Synthetic support-ticket walkthrough

All identifiers, dates, events, and values here were constructed for this repository. There are no customer tickets, names, email addresses, comments, or production extracts. “Sanitized” means this example contains only invented, minimal fields; the script is **not** a redaction tool for real data.

## Files

| File | Purpose |
| --- | --- |
| `events.csv` | Offline input: 30 invented ordered events across six cases |
| `variants.json` | Three explicitly supplied complete paths and labels |
| `prepare-transitions.mjs` | Local Node-only event preparation and fixture checks |
| `prepared-transitions.csv` | Visual/report input: 12 prepared transition rows |
| `preparation-summary.json` | Deterministic preparation metadata and expected totals |
| `SupportTickets/SupportTickets.pbip` | Source project: native table report + TMDL CSV model |
| `check-report-source.mjs` | Offline JSON/link/field consistency checks; not a Desktop/TMDL parser |

**Do not bind `events.csv` to the custom visual.** Raw event ordering exists only in the offline preparation example.

## Reproduce and validate

From the repository root, with Node available:

```powershell
npm run sample
node .\samples\prepare-transitions.mjs --check --self-test
node .\samples\check-report-source.mjs
```

No npm dependencies, external services, or network access are needed by these sample scripts. `npm run sample` writes the two prepared artifacts in this directory. `--check` is read-only and fails on stale output (normalizing checkout CRLF to LF); `--self-test` additionally checks all 12 expected counts/durations, deterministic ordering, CSV parsing, and invalid inputs.

The preparation script:

1. Requires exact event CSV headers and strict CSV syntax.
2. Validates text IDs and unique event IDs; requires positive safe-integer sequence values.
3. Accepts only canonical UTC timestamps with milliseconds. Calendar round-trip validation rejects impossible dates such as February 30, not just unparsable strings.
4. Groups by case, sorts by **sequence**, and rejects duplicate sequence values within a case. Physical CSV row order is not authoritative.
5. Rejects timestamps that move backwards in sequence order. Equal timestamps are allowed only with distinct sequence values, defining an unambiguous order and a zero-hour interval.
6. Checks that every case has exactly one supplied variant and that its ordered activity list matches that variant's supplied complete path.
7. Counts each adjacent event pair once and computes its elapsed UTC hours; it does not bridge case boundaries or invent start/end transitions.
8. Prepares the arithmetic mean elapsed hours per `(source, target, variant)`, preserving zero intervals, and assigns deterministic prepared row keys.
9. Rejects unsafe count or elapsed-millisecond totals. Output is sorted deterministically by variant, source, then target, independent of physical event record order.

This is an example preprocessor for this schema, not a general log-import pipeline. For other systems, define authoritative event order, tie handling, time zones, case completeness, and variant provenance before adapting it.

## Supplied paths and expected evidence

| Variant | Supplied path | Cases | Adjacent transitions |
| --- | --- | ---: | ---: |
| V01 | Opened → Triage → Resolved → Closed | 2 | 6 |
| V02 | Opened → Triage → Waiting → Triage → Resolved → Closed | 2 | 10 |
| V03 | Opened → Triage → Triage → Resolved → Closed | 2 | 8 |

The complete paths above come from `variants.json`, not reconstruction from the aggregate graph. V02 contains a real cycle/reciprocal pair; V03 contains two consecutive triage events and therefore a genuine self-loop. In SYN005 the two triage events share a timestamp but have sequences 2 and 3, so the self-loop contributes zero hours. SYN006 contributes 0.5 hours, yielding a prepared self-loop mean of 0.25 hours.

Every prepared row has frequency **2**:

| Variant | Transition | Mean adjacent-event elapsed hours |
| --- | --- | ---: |
| V01 | Opened → Triage | 1.50 |
| V01 | Triage → Resolved | 3.50 |
| V01 | Resolved → Closed | 1.50 |
| V02 | Opened → Triage | 0.75 |
| V02 | Triage → Waiting | 1.75 |
| V02 | Waiting → Triage | 2.50 |
| V02 | Triage → Resolved | 3.50 |
| V02 | Resolved → Closed | 1.00 |
| V03 | Opened → Triage | 1.00 |
| V03 | Triage → Triage | 0.25 |
| V03 | Triage → Resolved | 2.25 |
| V03 | Resolved → Closed | 1.00 |

Checks: 30 events − 6 cases = **24** adjacent transitions; frequencies sum to 24; adjacent-event elapsed hours sum to **41**. The validation reconstructs that offline elapsed total from each row's mean × frequency solely to check fixture arithmetic. The runtime visual does **not** use this as a duration aggregation mode. Elapsed intervals are not necessarily hands-on processing time.

When multiple variant rows are represented by one transition, frequency can add but duration must become unavailable. For example, all three `Opened → Triage` rows together have frequency 6; their combined duration is not a runtime mean. Local single-variant filtering lets the independently prepared variant values be examined without claiming a reconstructed path.

## Open the PBIP source

**Status:** source-authored PBIP/PBIR/TMDL, not a Desktop-saved or native-host-validated report. It contains a **native table** to make the prepared data inspectable. It contains no embedded custom visual, no fictional import metadata, no PBIX, and no screenshots.

1. Use a current Power BI Desktop build supporting Power BI Projects, TMDL semantic models, and enhanced PBIR. Enable relevant preview options if your Desktop version requires them.
2. Close the project in Desktop before editing source files. In `SupportTickets\SupportTickets.SemanticModel\definition\expressions.tmdl`, replace the placeholder `CsvPath` value with the absolute local path to `samples\prepared-transitions.csv`. Power Query M text uses literal backslashes; do not double them as JSON escaping.
3. Open `SupportTickets\SupportTickets.pbip`. If Desktop opens before you edit the source, use **Transform data → Manage parameters → CsvPath** to supply the path instead.
4. Refresh/import the CSV. The model uses only `File.Contents(CsvPath)`; it does not load raw events or call an external endpoint. Verify 12 rows, five activities, frequencies 2, and the values above in the native table.
5. Save using Desktop so the installed version can normalize project/report metadata. Record any compatibility conversion or source edits; the offline structural check is not proof that Desktop accepted the source.

If the native report source cannot open in your Desktop version, create a new Desktop report and **Get data → Text/CSV → prepared-transitions.csv**. Use the column types and measures from `Prepared Transitions.tmdl`, create the native table shown above, and save as a PBIP. This is a transparent fallback, not evidence that the supplied PBIR has been opened.

The placeholder path is intentional: the repository does not encode a developer username or local checkout location. It must be set on each machine. Publishing the report does not make a local file accessible to the Service; any refresh/gateway/data-source deployment is a separate owner-controlled task.

## Import and bind the actual custom visual

1. Have the parent repository's build/package workflow produce the real release `.pbiviz` under ignored `dist`. Inspect package-audit results and distribute the generated `THIRD-PARTY-NOTICES.txt` alongside it. See the root README for Node.js 24.17/npm 11 and platform prerequisites. Packaging uses the isolated certificate wrapper; no development server is required. Do not rename an archive or treat the PBIP as the visual package.
2. In Desktop's Visualizations pane choose **Import a visual from a file**, select that actual package, and follow your tenant/organization's custom-visual policy.
3. Add **Atlyn Process Lens** to the page next to the native table. Its GUID is `AtlynProcessLensA61D72B54E9F4B65A137E92DF84610C3`, version `1.0.0.0`.
4. Bind fields from `Prepared Transitions`:

   | Visual role | Model field |
   | --- | --- |
   | `source` | `source` |
   | `target` | `target` |
   | `frequency` | Measure `Prepared Frequency` |
   | `duration` | Measure `Prepared Duration` |
   | `variant` | `variant` |
   | `rowKey` | `rowKey` |
   | `tooltip` | Optional `statistic`, `unit`, `provenance` |

   The sample's guarded duration measure returns blank when a model group contains multiple rows. Keep `rowKey` to preserve contributor identities and grain. Prepared numeric columns also have `summarizeBy: none`; if using them directly instead of measures, choose **Do not summarize** wherever the host allows it and verify what the visual actually receives.

5. Set **Duration provenance** in the modern format pane:
   - `metrics.statistic`: `mean`
   - `metrics.unit`: `hours`
   - `metrics.provenance`: `Synthetic support tickets; arithmetic mean of adjacent-event elapsed UTC hours within each supplied variant; includes zero-hour ties.`
6. Verify the self-loop, reciprocal cycle, single-variant values, and explicit unavailable-duration diagnostics for duplicate/cross-variant contributors. Compare accepted frequencies with the native table.
7. Exercise local search/focus/traversal. Changing local variant is not a report filter. Use **Select variant rows in report** for host selection; check report interaction configuration against the native table.
8. Save the report in Desktop and, when authorized, validate in the Service and export paths. Only then capture genuine screenshots or save a PBIX if one is needed.

For publication/native-host acceptance gates, see [validation](../docs/validation.md) and [publication checklist](../docs/publication-checklist.md).
