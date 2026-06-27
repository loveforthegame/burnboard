# QA Report — Phase 4: history-and-export

Date: 2026-06-28
Criteria source: `ROADMAP.md` § "Phase 4 — history-and-export" (5 acceptance criteria) + `.pipeline/spec.md` (detailed implementation rules)

---

## Test Suite

`node burnboard.test.js` — **238 tests: 238 passed, 0 failed**

All Phase 4 pure-function tests pass: `getWeeklyBuckets` (7 + 4 extended), `aggregateMonths` (8 + 6 extended), `getBillingCycles` (8 + 9 extended), `buildCsvRows` (5 + 3 extended).

---

## Results

| Criterion | Status | Evidence |
|-----------|--------|----------|
| AC#1 — History tab opens with Monthly / Weekly / Billing Cycle toggle and renders monthly cards newest-first with token totals, sessions, active days, dominant model, and vs-prior delta | PASS (static + tests) | `renderHistory()` emits three `.btn-secondary` pills via `data-hview="monthly|weekly|billing"` (line 1960–1963). `renderMonthlyView()` reads `monthly_cache`, sorts `b.month_key DESC`, slices to 12 (line 1987–1990). Each card shows `total_tokens.toLocaleString()`, sessions, active_days, `top_model`, and delta (`↑/↓ +/-X% vs <month>`) with green/red class (lines 2007–2036). Single-month path shows `not enough history yet` (line 2019). Empty state shows `no monthly history yet` (line 1994). `aggregateMonths` tested: 8 + 6 cases all pass. |
| AC#2 — `recomputeMonthlyCache()` runs after sync and writes per-month records; the monthly comparison chart and rolling-average overlay render from them | PASS (static) | `recomputeMonthlyCache()` called inside `runSync` at line 792, wrapped in try/catch per spec. Writes `account_label:'combined'` records via `dbBatchPut('monthly_cache', ...)` (line 1794). Chart.js bar chart + dotted `type:'line'` rolling-average overlay (trailing window 3) rendered from `chartRecords` in `renderMonthlyView()` (lines 2067–2117). `if (!window.Chart) return` guard present (line 2064). Destroy-before-recreate on `_monthlyChart` (line 2065). |
| AC#3 — Weekly view shows the last 12 Mon–Sun weeks (zero-activity weeks faded, oldest week shows "—") plus the sparkline | PASS (static + tests) | `getWeeklyBuckets(allTurns, 12)` called in `renderWeeklyView()` (line 2128). Zero-activity rows: `fadedCls = b.total_tokens === 0 ? ' class="faded"' : ''` (line 2133) — rows kept, not skipped. Oldest week: `isOldest = i === buckets.length - 1` → `vsPrior` stays `'—'` unconditionally (lines 2132–2138). Zero-prior also stays `'—'` (lines 2141–2148). Sparkline: Chart.js `type:'line'`, `fill:true`, `backgroundColor:'rgba(249,115,22,.15)'`, `borderColor:'#F97316'`, oldest-left (lines 2177–2208). `getWeeklyBuckets` tests: Monday boundary, week-1 placement, oldest-first order, empty turns all pass. |
| AC#4 — Billing cycle view uses `billing_start` to show the current cycle card and last-3-cycles table | PASS (static + tests) | `renderBillingView()` reads `_cfg.billing_start` at line 2219 (`const bsd = Number(_cfg.billing_start) || 1`). No `billing_start_day` key present anywhere in the file (grep returned zero results). `getBillingCycles(allTurns, bsd, Date.now())` called at line 2220. Current-cycle card shows day/total/vs-same-point/progress-bar (lines 2261–2269). Last-3 table with `●` marker, `ongoing` label, `vs avg` column (lines 2282–2318). Empty state: `no billing history yet` when no turns (line 2224). `getBillingCycles` tests: billing_start=1 mid-month, billing_start=15 day<15 (prior-month start), day_index clamp, year-boundary rollback, Feb days_in_cycle, half-open interval — all pass. |
| AC#5 — Export CSV downloads `burnboard-history-YYYY-MM-DD.csv` with the specified columns, fully client-side | PASS (static + tests) | `exportHistoryCsv()` (line 1922): reads `monthly_cache`, filters `account_label==='combined'`, calls `buildCsvRows()`, creates `new Blob([csv],{type:'text/csv'})`, `URL.createObjectURL`, temporary `<a download="burnboard-history-YYYY-MM-DD.csv">`, `.click()`, `URL.revokeObjectURL` (lines 1923–1934). No network call. Header is exactly `month,total_tokens,input_tokens,output_tokens,cache_reads,sessions,active_days,top_model` (line 1908). `cache_reads` correctly maps from `cache_read_tokens` (line 1911). Empty records → header-only (line 1909). `buildCsvRows` tests: header exact, column order, raw integers, no trailing newline — all pass. |

---

## Four Pure Seams — Detailed Verification

| Seam | Key Checks | Status |
|------|-----------|--------|
| `getWeeklyBuckets(turns, n, now)` | Monday boundary: turn at `thisMonday 00:00 UTC` in week 0 (>=startIso, <endIso via ISO string comparison). Turn 1ms before Monday lands in week 1. Returns `n` buckets oldest-first after `.reverse()`. Empty turns → all-zero, length n. Zero-activity weeks included (not dropped). Cross-month label shows both months. | PASS |
| `aggregateMonths(turns)` | Two months produce separate records with correct `total_tokens`/`input_tokens`/`output_tokens`/`cache_read_tokens`/`sessions` (Set.size)/`active_days` (Set.size)/`top_model`. Tie-break: opus>sonnet>haiku stable (sort by value desc, fixed array order). Uses `t.month_key` with fallback to `t.timestamp.substring(0,7)`. | PASS |
| `getBillingCycles(turns, billingStartDay, now)` | `billing_start=1` mid-month: cycle is 1st to last day. `billing_start=15`, day 10: cycle starts prior month's 15th. `day_index` = 1 on first day; clamped to `days_in_cycle` when overrun. `days_in_cycle` correct across month boundary (Jan→Feb = 31, Feb→Mar non-leap = 28). Half-open `[start, nextStart)` interval. Returns 4 cycles newest-first. Year-boundary rollback (`billing_start=15`, Jan 5 → Dec 15 prior year). | PASS |
| `buildCsvRows(records)` | Header exactly `month,total_tokens,input_tokens,output_tokens,cache_reads,sessions,active_days,top_model`. `cache_reads` sourced from `cache_read_tokens`. Raw integers (no separators). No trailing newline. Empty → header-only. | PASS |

---

## Critical Checks

| Check | Status | Evidence |
|-------|--------|----------|
| Billing key is `billing_start` only — no `billing_start_day` introduced | PASS | `grep "billing_start_day" burnboard.html` → zero results. All reads use `_cfg.billing_start` (lines 549, 2219, 2579, 2595). |
| `recomputeMonthlyCache` writes under `account_label:'combined'` | PASS | Line 1791: `account_label: 'combined'`. Filter in `renderMonthlyView` and `exportHistoryCsv` both use `r.account_label === 'combined'`. |
| Account dropdown hidden (Phase 5, not built) | PASS | No `[Account: All ▾]`, no account selector, no `data-account` attribute anywhere in history HTML. `renderHistory()` emits only the three view pills and Export CSV button. |
| `recomputeMonthlyCache` runs post-sync, failure does not crash | PASS | Lines 790–792: called after all turns committed, wrapped in `try { await recomputeMonthlyCache(); } catch (e) { console.error(...); }`. Sync and dashboard continue on failure. |
| Chart destroy-before-recreate guard | PASS | `_monthlyChart` (line 2065), `_weeklyChart` (line 2175) both destroyed and nulled before `new Chart(...)`. `if (!window.Chart) return` guard on both. |
| Delegated click listener bound once | PASS | `_historyBound` flag (line 1732) prevents re-binding. Listener is on `panel` (the persistent `#panel-history` div), not on `innerHTML` children, so it survives `panel.innerHTML = ...` reassignment. |
| vs-prior / vs-avg / vs-same-point with 0 baseline → `—` not NaN/Infinity | PASS | Monthly delta: `prior.total_tokens > 0` guard (line 2010). Weekly vs-prior: `prior.total_tokens > 0` guard (line 2141). Billing vs-same-point: `priorAtPoint > 0` guard (line 2243). Billing vs-avg: `avgTok > 0` guard (line 2288). |
| No-data month card at 40% opacity | PASS | `.month-card.no-data{opacity:.4}` (CSS line 246). Applied when `r.total_tokens === 0` (line 2021). |
| Ponytail comments on all spec-required simplifications | PASS | Present on: single-account collapse (line 1782), Monday math reuse (line 1799), cross-month label (line 1816), billing-day<=28 (line 1845), CSV no-escape (line 1903), CSV sort order (line 1918), gap-month omission (line 2022), top_model tint (line 2045), rolling-mean window-3 (line 2050), vs-same-point granularity (line 2232), bar accent color (line 2252), vs-avg baseline (line 2273), re-render-on-click (line 2523). |
| Numbers in JetBrains Mono | PASS | Monthly card tokens: `.month-card-tokens` class sets `font-family:'JetBrains Mono'` (CSS line 248). Sessions/active_days wrapped in `<span class="mono">` (lines 2030–2031). Weekly table cells use `.mono` class (lines 2151–2154). Billing card uses `.cycle-card-tokens` (CSS line 262). Chart tick/tooltip fonts set to JetBrains Mono throughout. |

---

## Browser-Only Items (Cannot Verify Headless)

| Item | Assessment |
|------|-----------|
| Monthly comparison chart visual render (bar colors, dotted line overlay) | Logic verified: bar tints mapped from `top_model` (line 2047), rolling avg computed in JS (lines 2052–2056), Chart.js `type:'line'` with `borderDash:[4,4]` configured (lines 2079–2087). Cannot pixel-verify without browser. |
| Weekly sparkline visual render | Logic verified: `fill:true`, `backgroundColor:'rgba(249,115,22,.15)'`, `borderColor:'#F97316'` (lines 2183–2186). Cannot pixel-verify. |
| CSV Blob download in browser | `Blob` + `createObjectURL` + anchor `.click()` + `revokeObjectURL` pattern at lines 1928–1934 matches spec exactly. Cannot trigger filesystem save headlessly. |
| Tab switch triggering `renderHistory()` | Wiring at line 2525: `if (btn.dataset.tab === 'history') renderHistory();` confirmed present. Cannot simulate user click. |
| Month-card 30ms stagger animation | `style="animation-delay:${i * 30}ms"` inline on each `.month-card.au` (line 2025). CSS `.au` keyframe exists. Cannot verify animation plays. |

---

## Defects Found

None.

---

## Summary

All 5 ROADMAP acceptance criteria pass. The test suite runs clean at 238/238. Static analysis confirms: `billing_start` (not `billing_start_day`) is the only key used; `monthly_cache` writes exclusively under `account_label:'combined'`; no account dropdown appears in Phase 4; all four pure seams pass their full test suites including boundary edges (Monday 00:00 UTC, billing year-rollback, Feb month-length, half-open intervals); all zero-baseline arithmetic guards are in place; all required ponytail comments are present with named ceilings and upgrade paths. Five browser-only items (chart visuals, CSV download, tab-click wiring, animation) cannot be verified headlessly but have correct logic and DOM wiring confirmed by source inspection.

**QA: PASS**
