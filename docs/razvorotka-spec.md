# Razvorotka search

The English *Pattern Documentation Razvorotka* is the rule reference; the Russian copy describes the same pattern. Eleven annotated JPGs are visual references: six valid short, two valid long, and three invalid short. They lack instrument and candle timestamps, so exact OHLC matching is unavailable. The later *razvorotka_AI_learning_1.docx* reviews ten timestamped 1H cases and provides actionable corrections.

## Recognition contract

Razvorotka continues the preceding trend. Short requires a downtrend, consolidation, false breakout above the source, and return through at least 90% of its range; long is mirrored. The marker appears on the first closed Phase 3 candle that reaches the 90% level. Entry is optional and does not determine whether Phases 1–3 exist.

The source has at least 12 closed candles and repeated touches of both sides. A broad accumulation of at least 48 candles may have one side transition if both sides have at least three touches. Phase 2 needs a breakout extreme at least 15% of source height beyond the boundary and two consecutive complete candle bodies beyond the original boundary. A single outlier wick may be excluded from the displayed price boundary of a broad source, while the original boundary remains the confirmation threshold.

Search evaluates source windows of 12–96 bars. Phase 2 may include shallow returns or a crossing candle whose wick still overlaps the breakout zone. Phase 3 begins with a complete candle on the inside of the source boundary whose close is at least 20% inside the range. It cannot revisit the breakout side of that boundary, even with a wick, and must cover 90% of the range within no more than the source duration. The 20% phase start threshold and source duration limit are implementation choices to separate contiguous phases; the latter is reinforced by the customer correction. Matches sharing an unfinished formation collapse to the first Phase 3 marker.

Local, longer (up to 160 bars), and higher timeframe trends are checked. Clearly opposing or ranging context is rejected. When the available context is inconclusive, the result is labelled a candidate with a specific uncertainty. A source nested inside a larger sideways range is rejected when the purported breakout only reaches its far edge. A false breakout penetrating more than half of a repeatedly tested previous level without clearing that zone by its full height is rejected. These market structure checks are approximations of the customer's marked boundaries.

A feasible 1:2 risk/reward at the source edge or midpoint is required for publication as a candidate. Stop is just beyond the false breakout and target is the opposite source boundary. This is a hypothetical estimate, not an executed trade. Volume does not exist in the saved datasets, so the 6–11 candle exception and volume factors are not evaluated. Symmetry of earlier consolidations remains flagged for manual review.

The 1H scanner uses completed prepared 4H candles for higher context; the 4H scanner uses completed daily bars derived from prepared 1H history. Search respects known data breaks and uses no candle after its Phase 3 marker. Later candles are shown by default for visual review, but remain excluded from recognition. They can be hidden and replayed independently.

## Customer review check

`razvorotka-feedback.test.ts` compares the ten timestamped corrections with the saved OHLC history. Examples 2 (BTC short), 5 (ETH short, corrected phase segmentation), and 10 (GLD short, extended source) are accepted at the marked candle. Examples 1, 3, 4, 6, 7, 8, and 9 are rejected near the reviewed timestamp. The tests assert specific phase endpoints and verify that appending future BTC candles does not change the earlier signal. The original eleven screenshots remain qualitative visual references because they lack candle timestamps.

## Reviewing the sample

The page combines all nine saved instruments and both timeframes, ordered by Phase 3 completion. The corrected rules expose 120 candidates in the current snapshot (91 on 1H and 29 on 4H). Filters narrow the same results without changing recognition thresholds. Every result is labelled a candidate because some context is uncertain and later price movement is not a completed trade.

The chart includes at least 160 available candles before the source, or three times the source length when greater. A known data break or the start of history may shorten this context; the page displays the actual count. It also shows the saved continuation after the marker (up to 80 hourly or 40 four-hour candles, or fewer when the dataset ends), and the page displays that count. A user can hide the continuation and replay later candles one at a time or together.

All 120 plotted candidates were visually reviewed as an overview against the supplied examples. This review found ambiguous wider-range and trend-context cases among the unlabelled results. They remain labelled as candidates, with explicit context uncertainty, because the customer's ten timestamped judgments do not establish ground truth for every historical event. The three accepted customer examples retain their corrected phase boundaries.

The scanner is a deterministic research tool over the available historical snapshots. Ten annotated examples are checked at the candle level; accuracy across unlabelled market history cannot be inferred from those alone.
