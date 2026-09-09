# Scoped comparison, not comparative marketing

Public sources reviewed **September 9, 2026**. This comparison concerns different scopes, not a reproduced competitor benchmark or a claim of superiority. Do not copy competitor names/logos or this table into Marketplace listing keywords or comparative marketing.

| Capability | Atlyn Process Lens v1 | Process.Science, vendor-described solution | Power Automate Process Mining, documented features |
| --- | --- | --- | --- |
| Input | Prepared source-target rows and additive transition frequency; no raw-event backend | Power BI solution with upstream event-log preparation, report templates and visuals, not merely one graph component [1] | Case ID, activity and timestamps; import/transform event or activity logs [2] |
| Graph | Retains supplied cycles, reciprocal links and self-loops; deterministic bounded layout | Interactive process graph and cross-filtering [1] | Directly-following-event map, recalculated from filtered process data [3] |
| Repeats | Supplied transition frequency, not inferred case-level rework | Vendor describes complex loop reconstruction; precise edition/formula behavior not established here [1] | Defined self/indirect loops, rework, loop inflow/outflow and net gain [4] |
| Variants | Filters supplied group labels; cannot reconstruct ordered paths from aggregated edges | Vendor describes variant drilldown [1] | Ordered case activity sequences, counts, DNA, cases and Gantt views [5] |
| Time | Explicitly supplied statistic, unit and provenance; suppresses ambiguous duplicate/cross-variant durations | Lead-time views/drilldown [1] | Activity duration distinguished from between-activity waiting time [3,5] |
| Conformance | No conformance engine or causal bottleneck proof | Current suite copy advertises BPMN target upload/deviation calculation; not independently tested or attributed to a particular visual edition [1] | Business-rule filters/formulas/thresholds and BPMN export documented [3,6,7]; this bounded research does not establish full reference-model trace alignment |

An aggregate `A -> B -> A` cycle could combine edges from different cases. A drawing cannot prove any case repeated an activity. Likewise, frequency is not necessarily distinct cases, supplied variants do not reveal original trace ordering, and elapsed time is not automatically service time or waiting time.

Atlyn's deliberate scope is a reviewable, offline **prepared-transition renderer**. Event ordering, case boundaries, variant derivation, weighted-statistic preparation and any conformance analysis remain upstream responsibilities. This smaller scope is a limitation as well as a clear integration contract.

## Sources and limitations

1. [Process.Science Power BI integration](https://www.process-science.com/products/power-bi-integration). Vendor claims, not product tests; public copy mixes older/newer material. No reliable edition entitlement, infrastructure guarantee or numerical performance comparison was established. The [Academy](https://academy.process-science.com/) exposes descriptions but participation requires registration; no account or gated access was used.
2. [Prepare processes and data](https://learn.microsoft.com/en-us/power-automate/process-mining-processes-and-data).
3. [Process map overview](https://learn.microsoft.com/en-us/power-automate/minit/process-map).
4. [Rework metrics](https://learn.microsoft.com/en-us/power-automate/minit/rework-metrics).
5. [Analyze processes with variants](https://learn.microsoft.com/en-us/power-automate/minit/variants).
6. [Business rules](https://learn.microsoft.com/en-us/power-automate/minit/business-rules).
7. [Business rules for process maps](https://learn.microsoft.com/en-us/power-automate/minit/business-rules-process-map).

Absence of evidence here is not evidence that a competitor lacks a feature. No legal fitness, certification, native-host acceptance or competitive superiority follows from this research.
