# Test Results — Phase 4 (history-and-export)

## Run

```
node burnboard.test.js
238 tests: 238 passed, 0 failed
```

Prior count: 220 (confirmed passing before changes). Added 18 new assertions.

## What was exercised

### Confirmed baseline (220 prior assertions, all pass)
All prior Phase 1–3 tests continue to pass unchanged.

### Phase 4 — original 28 assertions (already present)

**getWeeklyBuckets (7 tests)**
- `n` buckets returned, oldest-first ordering
- Empty turns → all buckets zero, length n
- Turn inside current week lands in newest bucket
- Turn 8 days before Monday lands in correct prior bucket
- Turn at exactly `thisMonday` 00:00 UTC lands in current week (>= startIso)
- Turn one ms before Monday lands in prior week (< startIso boundary)
- `opus_tokens` and `sonnet_tokens` aggregate correctly per bucket

**aggregateMonths (8 tests)**
- Empty turns → empty array
- Single month: `total_tokens = input + output`, `cache_read_tokens` correct
- Two months: separate records, correct per-month totals
- `sessions` = distinct `session_id` count (Set dedup)
- `active_days` = distinct UTC day count
- `top_model` = dominant family by token volume
- `top_model` tie → opus wins (stable sort order: opus > sonnet > haiku)
- `month_key` from turn's own field (not re-derived from timestamp when field present)

**getBillingCycles (8 tests)**
- `billing_start=1`, `now=Jun28`: current cycle starts Jun 1, `day_index=28`
- `billing_start=15`, `now=Jun10`: current cycle started May 15 (prior-month rollback)
- `day_index` correct (day 27 of 31-day May→Jun cycle)
- `days_in_cycle` correct across month boundary (Jan→Feb = 31 days)
- `day_index` clamped to `days_in_cycle`
- Turn inside cycle counted; turn in different cycle not counted
- Returns 4 cycles total

**buildCsvRows (5 tests)**
- Header row matches spec verbatim: `month,total_tokens,input_tokens,output_tokens,cache_reads,sessions,active_days,top_model`
- Empty records → header-only (no extra newline)
- One record: raw integer values, `cache_reads` maps from `cache_read_tokens`
- Column order matches spec exactly (8 columns confirmed by index)
- Multiple records produce correct row count (header + N rows)

### Phase 4 — extended boundary coverage (18 new assertions)

**getWeeklyBuckets**
- Monday 00:00 UTC turn counted exactly once — appears in current week, NOT in prior week (no double-count)
- Zero-activity week among non-zero weeks is present in bucket array (not dropped or skipped); length remains 12
- `n=1` returns exactly 1 bucket; its `start_iso` equals the computed Monday

**aggregateMonths**
- Absent `month_key` field falls back to `timestamp.substring(0,7)` (turn with timestamp `2026-05-20T...` and no `month_key` → `month_key: '2026-05'`)
- `top_model = 'haiku'` when haiku has most tokens
- Sonnet/haiku tie → sonnet wins (stable sort: sonnet before haiku in ranked array)
- `cache_read_tokens` sums correctly across multiple turns in same month

**getBillingCycles**
- Turn at exactly `startIso` (cycle start date 00:00 UTC) IS included (`>= startIso` half-open)
- Turn at `startIso - 1ms` is excluded from current cycle and counted in prior cycle
- Year-boundary rollback: `billing_start=15`, `now=Jan 5 2026` → current cycle started Dec 15 2025
- Feb 2026 cycle: `billing_start=1`, `now=Feb 15` → `days_in_cycle=28` (non-leap year)
- `billing_start=28`, `now=Feb 28 2026`: `Date.UTC(2026, 2, 28)` = Mar 28; `days_in_cycle=28` (Feb 28 → Mar 28)
- Cycles ordered newest-first: each `start_iso` is later than the next
- `day_index=1` when `now` is on the first day of the cycle
- Prior cycles (i>0) have `day_index=null`

**buildCsvRows**
- All three `top_model` values (`'opus'`, `'sonnet'`, `'haiku'`) produce exactly 7 commas per row (8 columns) — safe without escaping
- Large integer values (`1500000`) appear as raw strings with no thousands separators
- No trailing newline after the last row

### DOM/browser-only checks (CANNOT-VERIFY-HEADLESS, confirmed by static inspection)

11. `recomputeMonthlyCache` try/catch in `runSync` — catch does not re-throw; `renderDashboard()` and `showScreen('app')` run even if recompute throws. Confirmed at burnboard.html ~line 762.
12. `renderHistory()` called on history tab switch — tab-bar handler fires it after `panel.classList.add('active')`. Confirmed by source inspection.
13. `_historyBound` flag prevents double-binding — set to `true` after first listener attach; guard checked at start of `renderHistory`. Confirmed by grep.
14. Account dropdown omitted — no `[Account: All ▾]` control in `renderHistory()`. Phase 5 scope. Confirmed by absence in source.
15. CSV download via `Blob + URL.createObjectURL + <a download> + .click() + revokeObjectURL`. Confirmed in `exportHistoryCsv()`.
16. `_cfg.billing_start` used (not `billing_start_day`) — `getBillingCycles` reads `Number(_cfg.billing_start) || 1`. Confirmed by grep.

STATUS: PASS