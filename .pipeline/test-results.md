# Test Results — Phase 2 filtered-charts

## Run

`node burnboard.test.js` — plain Node, no framework, no deps.

## Result: 123 tests, 123 passed, 0 failed

(Previously 100 Phase 1 + Phase 2 tests; 23 new assertions added.)

---

## What was exercised

### Carried forward (100 tests, all pass)
Phase 1 coverage of `isPeakHour`, `djb2hex`, `modelFamily`, `buildWindows` (gap logic + dedup simulation), `buildSessions`, `getMondayUTC`, `clamp`, the state machine, `today_vs_avg`, and `projOpusPct` / forecast state.

Phase 2 original 18 assertions: 7d/all range cutoff, model filter (opus/sonnet), daily_usage bucketing + session dedup, daily_usage ascending sort, top_projects desc sort + 8-slice, top_projects session count, empty-cwd → "unknown", days_with_data count, model_breakdown unknown mapping + order + pct sum, heatmap day/hour bucketing + cell token summation.

### New assertions (23, all pass)

**fmtTokens (7 assertions)**
Raw values under 1000, the 999/1000 boundary, 1500 → "2K" (rounds), 1.0M boundary, 1.5M, and the dump-7.9 example value of 284K.

**30d and 90d range cutoffs (4 assertions)**
31-day-old turn excluded from 30d range; 29-day-old included. 91-day-old excluded from 90d range; 89-day-old included. (Only 7d and all were tested previously.)

**Heatmap rowIndex→dow mapping (4 assertions)**
Monday turn (getUTCDay=1) stored as dow=1, which maps back to rowIndex=0 (Mon row) via `(rowIndex+1)%7`. Sunday turn (getUTCDay=0) stored as dow=0, maps to rowIndex=6 (Sun row, bottom). Saturday (dow=6) maps to rowIndex=5. Confirmed Mon and Sun turns land in distinct cells with the correct dow values, so the lookup key never collides.

**Heatmap under-3-days gate — data path (3 assertions)**
2 days → days_with_data < 3 (gate fires). Exactly 3 days → days_with_data = 3 (gate does not fire; grid renders). Filter-reduced case: 5 days of raw data cut to 2 by 7d range → days_with_data < 3 (filter-induced gate fires correctly).

**model_breakdown exclusion and edge cases (3 assertions)**
Single-family data → only that family appears (0-token families are excluded). Empty turns set → model_breakdown is empty (no division by zero). Single-family 100% case → pct is exactly 100.

**top_projects boundary (1 assertion)**
Exactly 8 projects → all 8 returned (slice(0,8) is non-destructive at boundary).

**model=haiku filter (1 assertion)**
Haiku filter keeps only haiku turns; opus turns are excluded from both daily_usage and model_breakdown.

---

## Static source inspection (browser/DOM — CANNOT-VERIFY-HEADLESS)

These three risks from changes.md were confirmed by source reading, not execution:

1. **Filter handler calls only renderFilteredSections (AC#1).** The delegated click handler at `burnboard.html` line 1436 calls `await renderFilteredSections()` at line 1446. The string `renderDashboard` does not appear in that handler body. Phase 1 sections (Start Check / Mini Stats / Forecast) are not touched on filter change.

2. **Chart destroy-before-recreate.** `renderDailyBurn` (line 969), `renderModelBreakdown` (line 1140), and `renderTopProjects` (line 1182) each call `.destroy()` and null the module-level handle before `new Chart(...)`. Pattern is consistent across all three functions.

3. **Heatmap rowIndex→dow lookup alignment.** Line 1069: `const dow = (rowIndex + 1) % 7`. Line 1075: lookup key `${dow}-${h}` matches the heatmap data key `${dow}-${hr}`. Mon=rowIndex 0→dow 1; Sun=rowIndex 6→dow 0. Correct per spec.

STATUS: PASS