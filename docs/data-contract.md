# Prepared transition data contract

## Scope and grain

Atlyn Process Lens analyzes an already prepared process map. Runtime input is a Power BI **table DataView**, not raw case events. Supply stable source/target activity identifiers and a transition frequency. Prepare and validate raw logs, ordering, case boundaries, path groups, and metric definitions before loading this visual.

Recommended grain: one record per `(source, target, variant)`, or per `(source, target)` when there is no variant field. A variant is a **supplied label**. Neither a variant label nor the union of its edges proves a unique complete path. The example's full paths are supplied separately and checked offline.

## Roles and values

| Role | Cardinality | Contract |
| --- | --- | --- |
| `source` | Exactly one | Text activity ID, nonblank, ≤120 characters, no control characters |
| `target` | Exactly one | Same as source |
| `frequency` | Exactly one | Nonnegative safe integer; valid range 0 through 9,007,199,254,740,991 |
| `duration` | Zero or one | Finite nonnegative numeric value with explicit statistic/unit; document preparation provenance |
| `variant` | Zero or one | Supplied grouping ID, ≤120 characters, no controls; null/empty values form a retained blank group |
| `rowKey` | Zero or one | Prepared-row grouping key; use a stable unique text key in the model |
| `tooltip` | Zero through six | Additional host-provided grouping or measure fields |

Text identifiers are not event timestamps, URLs, executable content, or HTML. Prefer short, human-readable IDs; use tooltips for explanatory attributes. Use numeric model types for metrics, not formatted strings. Nonfinite values, negatives, fractional frequencies, and unsafe integer frequencies are not accepted as valid frequency data.

Frequency is the supplied count of **transitions**. Incoming and outgoing counts can include repeats, cycles, and multiple visits by the same case. Do not relabel a frequency or node incident total as a distinct-case count. This sample's six cases are known only from offline event preparation.

## Duration availability

Supply statistic and unit to enable duration display, and document provenance:

| Setting | Example | Meaning |
| --- | --- | --- |
| `metrics.statistic` | `mean` | Which statistic was prepared |
| `metrics.unit` | `hours` | Unit of the supplied numeric value |
| `metrics.provenance` | `Mean adjacent-event elapsed UTC hours within supplied variant; includes zero-hour ties.` | Preparation, scope, and inclusion rules |

These format settings are author input; a tooltip column named `statistic` does not populate them automatically. Use a single consistent definition/unit within a visual. A percentile, median, or mean is not an additive measure. An elapsed adjacent-event interval is not necessarily processing effort, wait time, service-level performance, or total case duration.

Missing statistic or unit suppresses duration. An empty provenance description is displayed explicitly as **Not supplied** rather than silently inventing a preparation definition; it does not suppress an otherwise described duration.

Duration is unavailable when missing, invalid, undescribed, or represented by more than one contributing prepared record. **All duplicate contributors suppress duration**, including equal values and cross-variant aggregation. Frequencies remain additive where their sum is safe. There is no weighted aggregation mode, no naive average of averages, and no automatic conversion between units.

For example, if two prepared rows both describe `Triage → Resolved` with frequency 2 and duration 3.5, their combined frequency is 4 but their combined duration is **unavailable**, not 7 or 3.5. The same rule applies when one row belongs to V01 and another to V02. Independently valid single-variant rows can still display their supplied duration when considered separately.

## Host aggregation: author responsibility

Power BI performs query grouping and measure evaluation **before** sending a DataView. `Do not summarize` and a unique grouping `rowKey` help preserve prepared grain. Dropping numeric columns into a measure role can create implicit `Sum` or other aggregations; inspect the field-well aggregation instead of accepting defaults.

The sample model provides:

```dax
Prepared Frequency = SUM('Prepared Transitions'[frequency])
Prepared Duration =
    IF(
        COUNTROWS('Prepared Transitions') = 1,
        SELECTEDVALUE('Prepared Transitions'[duration]),
        BLANK()
    )
```

Use both measures with `source`, `target`, `variant`, and `rowKey`. The duration measure intentionally returns blank for a model group with multiple records—even when every duration is equal—rather than silently hiding duplication with `SELECTEDVALUE` alone. Frequency is additive only when the upstream source itself has valid, correctly scoped counts.

If you omit `rowKey`, confirm your model truly has one row at each displayed grain. If you remove `variant`, the host may coalesce cross-variant rows. A correctly defined duration measure returns blank in that case, but the visual cannot identify the missing raw contributors because it never received them. If duplicate detection matters, keep the contributor rows visible to the visual via `rowKey`. No runtime check can recover records removed or preaggregated by the host.

## Bounds, invalid records, and completeness

- Inspect at most the first 2,000 **received** rows.
- Retain at most 80 activities and 300 source-target-variant edges.
- Skip records that overflow graph limits, with received-subset warnings.
- Do not fetch further windows with `fetchMoreData`.
- Treat host segmentation/reduction, empty views, missing required roles, invalid rows, and unsafe frequency sums explicitly.

These are visual bounds, not promises about total source-model cardinality. A report filter can reduce the received set, and host grouping can make a small received table represent many original rows. Counts and totals describe only accepted data within the current received subset. An unavailable overflow total is not zero.

## Interaction semantics

- Search, activity focus, traversal, and the variant selector are local navigation/filtering.
- **Select variant rows in report** is a separate host action, not an automatic side effect of changing the local selector.
- An activity/transition selection encompasses all represented row identities, not an arbitrary representative edge. Missing host identity must not silently select a different row.
- Host selections can cross-filter other visuals according to report interaction settings. Local selected-state highlighting is separate from incoming categorical highlights.
- The accepted contract deliberately uses `supportsHighlight: false`: host cross-filtering and local selected-row highlighting are supported, but this table mapping does not expose incoming highlight measures.
- Cycles, reciprocal transitions, and self-loops are valid structure, not evidence of errors or causality.
