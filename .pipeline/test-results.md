# Test Results — Phase 3: insights-and-sessions

## Run

```
node burnboard.test.js
192 tests: 192 passed, 0 failed
```

Baseline confirmed at 177 before additions. 15 new assertions added.

---

## What was exercised

### Prior 177 assertions (verified still pass)
All Phase 1/2 assertions intact: isPeakHour, djb2hex, modelFamily, buildWindows (gap logic + dedup), buildSessions, getMondayUTC, clamp, state machine, forecast math, filtered data pipeline (range cutoffs, model filter, daily/heatmap/model_breakdown/top_projects bucketing).

Phase 3 prior 54: fmtSessionDur (8), relWhen (7), Spiral trigger (5), Cache DANGER+WARNING (8), Peak Penalty (3), Opus Waste (5), priority/max-3 (2), session aggregation (8), context-growth/heavy-context (3), cost_by_model (4), summary (3).

### 15 new assertions added

**relWhen boundaries:**
- Exactly 60m ago → "1h ago" (not "60m ago") — tests the `< 60` gate
- Exactly 59m ago → ends "m ago"
- Exactly 47h ago → "yesterday" (within the 48h window)
- Exactly 49h ago → MMM D format (past the 48h window)

**fmtSessionDur boundaries:**
- 3,599,999ms (59m 59s) → "59 min" — just under the 60-minute gate
- 3,600,001ms → "1h 0m" — just over the gate

**Spiral trigger:**
- Session with all turns >7 days ago → excluded from spiralCount (out-of-window guard)
- Exactly 6 turns → qualifies (>5 strict; confirms the `<= 5` continue is correct)

**Opus Waste trigger:**
- 5 sessions with all turns 10 days ago → excluded (out-of-window guard)

**Peak Penalty trigger:**
- All peak-hour tokens 10 days ago → totalTok7=0 → peakPct=0 → no fire

**Session aggregation:**
- Exactly 20 sessions → all 20 returned (slice(0,20) boundary)
- Session with two turns 2.5h apart → fmtSessionDur("2h 30m") from first/last_timestamp delta

**cost_by_model:**
- Sonnet cost: 2M input * $3/1M + 0.5M output * $15/1M = $13.50
- Order guarantee: opus appears before sonnet before haiku regardless of insertion order

**summary:**
- Zero turns → all fields zero (no division errors, no undefined)

---

## Threshold verification (spec §7.3 exact boundaries)

| Trigger | Boundary | Fire side | Silent side | Status |
|---|---|---|---|---|
| Spiral | ratio > 3.0 | 3.01 fires | 3.0 silent | PASS |
| Spiral | >5 turns | 6 fires | 5 silent | PASS |
| Spiral | >=3 sessions | 3 fires | 2 silent | PASS |
| Cache DANGER | rateNow < 0.10 | 0.05 fires | 0.10 silent | PASS |
| Cache DANGER | ratePrev > 0.25 | 0.30 fires | 0.25 silent | PASS |
| Cache DANGER | weekTotal > 50000 | 100k fires | 50k silent | PASS |
| Cache WARNING | rateNow < 0.15 | 0.10 fires | 0.15 silent | PASS |
| Cache WARNING | weekTotal > 100000 | 150k fires | 100k silent | PASS |
| Cache DANGER suppresses WARNING | one card max | danger only | no warning | PASS |
| Peak | peak_pct > 0.50 | 0.60 fires | 0.50 silent | PASS |
| Opus Waste | >=5 sessions | 5 fires | 4 silent | PASS |
| Opus Waste | turn_count < 4 | 3 qualifies | 4 excluded | PASS |

---

## CANNOT-VERIFY-HEADLESS (DOM-only behavior, confirmed by static inspection)

1. **copyText 1500ms revert** — `burnboard.html` `copyText()`: `navigator.clipboard.writeText(text)`, then `btn.textContent = 'copied!'`, `btn.classList.add('copied')`, `setTimeout(() => { restore original label + remove class }, 1500)`. 1500ms confirmed in the setTimeout call. Cannot test `navigator.clipboard` under Node.

2. **One-row-open-at-a-time** — module-level `let _openSession = null` toggled in the delegated click handler on `dashboard-content`. Clicking a new row calls `_openSession`'s detail `.remove()` before inserting the new detail row. A second click on the same row closes without re-opening. DOM-only; cannot unit test.

3. **Insights on unfiltered path** — `computeInsights` called inside `loadDataLocal` (HTML ~line 1019), result in `d.insights`. `renderInsights(d)` called from `renderDashboard()`. The filter-bar click handler calls only `renderFilteredSections()`, never `renderDashboard()`. Static inspection confirms insights are not re-computed on filter change.

4. **Sessions+Cost on filtered path** — `renderSessions` and `renderCostSummary` called only from `renderFilteredSections()`. Neither appears in `renderDashboard()` body. Confirmed by grep.

5. **`window._insightCopies` global** — set synchronously inside `renderInsights` before any copy button is clickable. Array is indexed by insight position. Cannot verify under Node (window not defined), but the pattern is safe given synchronous render.

---

STATUS: PASS