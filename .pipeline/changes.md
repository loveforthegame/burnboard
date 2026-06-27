# Phase 4 Changes

## Files changed

### `burnboard.html`
- **CSS**: Added `/* Phase 4 — History (dump 8, 8.1-8.4) */` block with `.history-header-row`, `.history-views`, `.month-grid`, `.month-card`, `.month-delta-up/down`, `.history-table`, `.sparkline-wrap`, `.monthly-chart-wrap`, `.cycle-card`, and related helpers.
- **runSync** (wiring point 1): Added `try { await recomputeMonthlyCache(); } catch (e) { ... }` after windows write, before `renderDashboard`. Does not block sync on failure.
- **tab-bar handler** (wiring point 2): Added `if (btn.dataset.tab === 'history') renderHistory();` fire-and-forget call on tab switch.
- **New functions** (all additive, Phase 4 only):
  - `aggregateMonths(turns)` — pure, IDB-free. Groups turns by month_key, computes totals, top_model.
  - `recomputeMonthlyCache()` — async wrapper; reads all turns, calls aggregateMonths, writes under `account_label:'combined'`.
  - `getWeeklyBuckets(turns, n, now)` — pure. Returns n Mon–Sun UTC buckets, oldest-first. Reuses getMondayUTC.
  - `getBillingCycles(turns, billingStartDay, now)` — pure. Returns current + 3 prior billing cycles using `_cfg.billing_start`.
  - `buildCsvRows(records)` — pure. Returns full CSV string with exact spec columns.
  - `exportHistoryCsv()` — async. Reads monthly_cache, calls buildCsvRows, downloads via Blob+URL.createObjectURL.
  - `renderHistory()` — top-level. Binds delegated listener once, renders header + active view.
  - `renderMonthlyView()` — 12-card grid + comparison bar chart with rolling-average overlay.
  - `renderWeeklyView()` — 12-week table (newest-first) + sparkline (oldest-left).
  - `renderBillingView()` — current-cycle card + last-3-cycles table.

### `burnboard.test.js`
- Added 28 new tests (220 total, all pass). Four sections added:
  - `getWeeklyBuckets` — bucket assignment, boundary (Monday 00:00 UTC), empty input, token aggregation.
  - `aggregateMonths` — multi-month, sessions, active_days, top_model, tie-break.
  - `getBillingCycles` — billing_start=1 and 15, day_index, days_in_cycle, turn assignment.
  - `buildCsvRows` — header, empty, column order, cache_reads mapping, multi-row.

## Riskiest / least-obvious parts for the tester

1. **`recomputeMonthlyCache` try/catch in runSync** — if the recompute throws, sync and dashboard must still complete normally. The try/catch wraps only the recompute call; check that `renderDashboard` and `showScreen('app')` run even if recompute errors.

2. **`getBillingCycles` when `now` < `billingStartDay`** — the current cycle started in the prior month. The month-rollback logic (`curMonth--; if < 0 wrap`) must be correct. Test with billing_start=15, now on the 10th of a month.

3. **`getWeeklyBuckets` string-comparison timestamp bounds** — uses `ts < startIso || ts >= endIso` (ISO string lexicographic compare) rather than Date.getTime(). This is correct for ISO 8601 strings with UTC Z suffix (same byte-order) but would break for non-UTC formats. All timestamps in the app are stored as UTC ISO strings from `new Date().toISOString()`, so this is safe — but worth verifying on real sync data.

4. **Chart destroy-before-recreate on view switches** — `_monthlyChart` and `_weeklyChart` module vars must be destroyed before `new Chart(...)` on every renderMonthlyView/renderWeeklyView call. Repeated history tab clicks should not throw "Canvas is already in use".

5. **Delegated listener bound once** — `_historyBound` flag ensures the click listener on `#panel-history` is only attached once despite `renderHistory` being called on every tab switch. Verify no double-firing on second history tab click.
