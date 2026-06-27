# test-results — Phase 1

## Test file
`burnboard.test.js` — standalone Node script, no framework, no dependencies beyond `assert`.

## What was exercised (82 tests, 0 failures)

### isPeakHour (9 tests)
All 6 inline self-check cases (SC1–SC6) verified under Node. Additional: low-bound (13 UTC = peak), one-past-boundary (19 UTC = off-peak), Friday 18 UTC = peak.

### djb2hex (4 tests)
Determinism (same input → same output), collision resistance (different inputs → different outputs), hex output format, empty-string stability.

### modelFamily (6 tests)
opus/sonnet/haiku detection, null → other, unknown string → other, case-insensitivity.

### buildWindows — gap logic (15 tests)
- Empty input → 0 windows.
- Single turn → 1 window.
- Two turns < 5h apart → 1 window.
- Two turns exactly 5h apart → 1 window (boundary: condition is `> WIN_MS`, not `>=`).
- Two turns > 5h apart → 2 windows (5h 1s gap).
- Same session, multiple windows when gap > 5h (spec edge case).
- Cross-session gap > 5h → 2 windows.
- Unsorted input sorted before windowing; `window_start` = earliest timestamp.
- `window_id` = `djb2hex(window_start)` (deterministic).
- `window_end` = last turn timestamp in the window.
- `is_peak_hour` set from first turn's timestamp.
- `is_complete = 1` for windows older than 5h (tested with 2020 timestamp).
- Opus token accumulation across turns.
- Mixed model families bucket to independent counters (opus/sonnet/haiku).

### buildWindows — dedup simulation (3 tests)
IDB cursor (`dbDeleteTurnsBySession`) is browser-only; tested the computation side instead:
- Without dedup: same session turns inserted twice doubles `total_input_tokens` and `opus_tokens` (confirms the delete-before-insert guard is load-bearing for weekly cap).
- After dedup (clean single-turn set): weekly-cap `opusPct` computes correctly (~4% for 1h of opus on max5x).
- Double-inserted session yields ~8% opusPct, confirming double-count without the guard.

### buildSessions (7 tests)
Two-turn aggregation (input/output/cache totals, first/last timestamp, turn_count). Two sessions → two records. Dominant model by token volume (not turn count), including sonnet-wins case. `project_name` from last path segment for POSIX and Windows paths. Empty cwd → empty project_name.

### getMondayUTC (7 tests)
Monday (no-op), Tuesday, Wednesday, Friday (all → same Monday). Sunday (-6 days), Saturday (-5 days). Result always lands at midnight UTC.

### clamp (6 tests)
Below min, above max, in range, at min/max boundaries. Verified `fracElapsed` is clamped to 0.01 at Monday 00:01 UTC (natural value ~0.0001).

### State machine ordering + boundaries (16 tests)
SC7–SC13 (inline self-check cases re-verified). `no_data` checked before `weekend` (ordering guard). Exact strict-`>` boundaries: opus=80 → caution_peak, opus=81 → danger; sonnet=85 → caution_peak, sonnet=86 → danger; opus=70 off-peak → good, opus=71 → caution_budget; sonnet=75 → good, sonnet=76 → caution_budget.

### today_vs_avg denominator = 30 (3 tests)
Confirmed `avg = last30Tok / 30` (not distinct-days). Zero-avg guard prevents division by zero. Ratio > 1 when today exceeds 30-day average.

### projOpusPct + forecast state (6 tests)
Formula `opusPct / fracElapsed` verified. on_track (40%/0.5 = 80%), tight (60%/0.5 = 120%), exhausted (opusPct=100). Clamp at Monday 00:01 UTC prevents Infinity (5/0.01 = 500, finite). on_track remaining = `round(100 - proj)`, clamped ≥ 0.

STATUS: PASS