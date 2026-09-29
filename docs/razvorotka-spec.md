# Razvorotka search

The English customer document, *Pattern Documentation Razvorotka*, is the rule reference. The Russian copy describes the same pattern. The eleven annotated JPG examples were inspected as visual references: six valid short, two valid long, and three invalid short. They do not identify exact candle timestamps in this repository's Yahoo Finance history, so they cannot serve as exact OHLC regression fixtures.

## Recognition contract

Razvorotka is a **trend continuation** setup. A short setup has a downtrend, a source consolidation, a false breakout above it, and a return through at least 90% of the source range. Long is the mirror. The detector marks the first completed candle that reaches Phase 3. Entry is optional and cannot be used to decide whether Phases 1–3 exist.

The scanner requires at least 12 closed source candles; a breakout extreme at least 15% of source height beyond the boundary; at least two consecutive closes beyond the boundary; and cancellation by close or wick. Source candles must alternate between both sides of the range so a single rise and fall is not mistaken for consolidation. A clearly opposing or ranging preceding trend or higher timeframe is rejected. Missing or inconclusive context yields a candidate with an explicit warning. A possible 1:2 risk/reward is required at a boundary retest or source midpoint, using a stop just beyond the false breakout and a target at the opposite source boundary. This is a hypothetical calculation, not an executed entry.

Search evaluates source windows of 12–96 bars, a maximum 12-bar breakout hold, and cancellation within twice the source duration. The last two are implementation bounds for avoiding unrelated distant moves; the customer document does not specify them. Matches sharing an unfinished formation are collapsed to the first completed Phase 3 marker.

The 1H page uses prepared 4H candles for higher-timeframe context. The 4H page derives completed daily candles from prepared 1H history. Search respects known breaks in the traded timeframe and does not use any candle after the Phase 3 marker. The page reveals later candles separately. No volume exists in the saved datasets, so the 6–11 candle session exception and volume strengthening or weakening factors are not evaluated. Temporal symmetry of previous steps is shown as needing manual review because the screenshots do not provide a reliable numerical segmentation rule.

## Visual reference check

- Valid short examples show orange source, blue countertrend breakout, red cancellation, then optional purple entry. The scanner uses the first three phases only; this also covers the advanced fifth short example where the entry is delayed.
- Valid long examples mirror the phase order and stop/target positions.
- Invalid examples show a higher-timeframe range or an uptrend before an attempted short. Confirmed opposing context is rejected; inconclusive context is surfaced as uncertainty rather than claimed valid.

The scanner is a deterministic research tool over the available historical snapshots. Accuracy against the customer's screenshots cannot be measured until each image is paired with instrument, timeframe, and source candle times.

## Reviewing the sample

The page initially combines all nine saved instruments and both timeframes, ordered by the Phase 3 completion time. This exposes 103 candidates in the current snapshot (75 on 1H and 28 on 4H); the old count of two was only AAPL on 4H. Instrument and timeframe filters narrow the same results without changing recognition thresholds. The page labels every result as a candidate because some trend context remains uncertain and later price movement is not a completed trade.
