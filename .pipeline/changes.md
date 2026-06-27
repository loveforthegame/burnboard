# Phase 3 Changes

## Files modified
1. `burnboard.html` — all Phase 3 code added inline (single-file convention)
2. `burnboard.test.js` — extended with 54 new assertions (123 → 177 total)

## What changed in burnboard.html

**CSS (added above `</style>`):**
- `.btn-copy` + `.copied` success state (dump 4.5)
- `.insight-card`, `.insight-title`, `.insight-body`, `.insight-copy-row` — insight card anatomy
- `.sessions-table`, `.session-row`, `.session-detail-row`, `.session-detail`, `.detail-table` — sessions table + expanded detail
- `.heavy-context` (background `--amdim`), `.heavy-label`, `.mini-bar-track`, `.mini-bar-fill`, `.chevron`
- `.kv-list`, `.kv-row`, `.kv-label`, `.cost-table`, `.cost-note` — cost/summary grid

**Constants block:**
- Added `PRICING` constant (dump 16) with `ponytail:` comment for unknown-model ceiling

**Pure compute helpers (before `loadDataLocal`):**
- `localPeakRange(tz)` — extracts 13:00-19:00 UTC to local TZ string for Peak trigger
- `fmtSessionDur(ms)` — dump 7.9 session duration format (distinct from `fmtDur`)
- `relWhen(iso)` — dump 7.9 relative session time (distinct from `relTime`)
- `computeInsights(allTurns, now)` — all 4 triggers, priority sort, max-3 slice

**Data layer:**
- `loadDataLocal()` — extended to call `computeInsights` and include `insights` in return (unfiltered path)
- `loadFilteredData()` — extended to produce `recent_sessions`, `turns_by_session`, `cost_by_model`, `summary`, `total_api_cost_usd` (filtered path)

**Render helpers added:**
- `renderSessionsShell()`, `renderCostShell()` — empty card containers (same pattern as `renderChartsShell`)
- `copyText(btn, text)` — clipboard with 1500ms revert
- `renderInsights(d)` — reads from unfiltered `d.insights`; writes `window._insightCopies` for copy buttons
- `renderSessions(fd)`, `renderTurnDetail(sessionId, fd)` — sessions table with lazy expand
- `renderCostSummary(fd)` — two-column cost-by-model + summary kv-list

**Wiring:**
- `renderFilteredSections()` — extended to call `renderSessions(fd)` and `renderCostSummary(fd)`
- `renderDashboard()` — extended to call `renderInsights(d)` and include shell placeholders
- Dashboard-content click handler — extended to handle `[data-session-row]` for expand/collapse (one open at a time via `_openSession`); filter-bar branch unchanged

**Self-check:**
- Added SC14 (empty turns → no insights) and SC15/SC16 (fmtSessionDur boundaries)

## What changed in burnboard.test.js
- Added `PRICING`, `fmtSessionDur`, `relWhen`, `localPeakRange`, `computeInsights`, `computeFilteredDataP3` (pure extractions matching the HTML)
- 54 new tests across: fmtSessionDur, relWhen, Spiral trigger (5 tests), Cache DANGER+WARNING (8 tests), Peak Penalty (3 tests), Opus Waste (5 tests), Priority/max-3 (2 tests), session aggregation (8 tests), context-growth/heavy-context (3 tests), cost_by_model (4 tests), summary (3 tests)

## Riskiest parts for the Tester

1. **Cache Alert boundary math** — the rate is `cache_read / (cache_read + input)`, not `cache_read / input`. The helper in tests uses exact integer values to hit 0.10/0.15/0.25 boundaries precisely. Any drift from the HTML implementation would cause boundary tests to fail. Verify tests pass against the HTML source, not just the test copy.

2. **`_openSession` one-open-at-a-time logic** — the click handler closes the previous row before opening the new one, and a second click on the same row closes it. DOM-only; cannot be unit tested. Manually click: open row A, open row B (A should close), click B again (B should close).

3. **Session row click handler vs filter-bar handler** — both are on `dashboard-content`. The session-row branch uses `return` after handling to prevent filter-bar code from running. Verify clicking a session row does not trigger a filter re-render.

4. **`window._insightCopies` global** — set inside `renderInsights`. Copy buttons reference it via `_insightCopies[i]`. Safe because `renderInsights(d)` runs synchronously with `d.insights` already populated, but worth checking in browser console that `window._insightCopies` is an array after render.

5. **`loadFilteredData` called twice on row expand** — once in `renderFilteredSections` (which renders the session table), and again lazily when a row is expanded to get `turns_by_session`. At single-user data volumes this is fine; the ponytail comment notes the upgrade path.
