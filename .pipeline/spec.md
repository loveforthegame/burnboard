# Spec — Phase 4: history-and-export

Source of truth: `ROADMAP.md` "Phase 4 — history-and-export" (goal/scope/criteria) + `dump.md` §8, §8.1–8.4, §13.5, §15.4, §15.5. Baseline: existing `burnboard.html` Phases 1–3. No `.pipeline/research.md` present — this is forward planning, not rework.

No open questions. (The known dump naming inconsistency `billing_start` vs `billing_start_day` is RESOLVED below — not an open question.)

---

## RESOLVED: billing key name

dump §15.1/§13.6 and the ROADMAP scope call it `billing_start_day`; dump §15.1's `d.user.billing_start` and the EXISTING code call it `billing_start`. The existing Phase 1 settings overlay ALREADY persists this field:
- Settings input `#s-billing` exists (burnboard.html:343-345, number, min 1 max 28, default 1).
- `saveSettings()` writes `billing_start` (burnboard.html:965).
- `loadConfig()` default key is `billing_start` (burnboard.html:524).
- `openSettings()` reads `_cfg.billing_start` (burnboard.html:949).

**Phase 4 reads the SAME key: `_cfg.billing_start`.** Do NOT introduce `billing_start_day`. Do NOT add a second settings field — the field already exists and is wired. No settings changes are needed in this phase.

---

## Goal (from ROADMAP)

User can switch to the History tab and review usage over time by month, week, and billing cycle, then export it as CSV.

## Scope (from ROADMAP)

`burnboard.html`. History tab (§8). Monthly view (§8.1: 12-card grid + comparison chart) backed by `recomputeMonthlyCache()` run post-sync (§15.4) and the `monthly_cache` store. Weekly view (§8.2: 12-week table + sparkline) via `getWeeklyBuckets()` (§15.5). Billing cycle view (§8.3) using `_cfg.billing_start`. Export CSV (§8.4: client-side Blob download). Extend `burnboard.test.js`.

## Acceptance criteria (from ROADMAP — verbatim)

1. History tab opens with Monthly / Weekly / Billing Cycle toggle and renders monthly cards newest-first with token totals, sessions, active days, dominant model, and vs-prior delta.
2. `recomputeMonthlyCache()` runs after sync and writes per-month records; the monthly comparison chart and rolling-average overlay render from them.
3. Weekly view shows the last 12 Mon–Sun weeks (zero-activity weeks faded, oldest week shows "—") plus the sparkline.
4. Billing cycle view uses `billing_start` to show the current cycle card and last-3-cycles table.
5. Export CSV downloads `burnboard-history-YYYY-MM-DD.csv` with the specified columns, fully client-side.

---

## Files to modify

- `C:\Users\ue\Desktop\abhinav pending projects\burnboard\burnboard.html` (only file; additive — do not touch Phases 1–3 logic except the two integration points listed under "Wiring")
- `C:\Users\ue\Desktop\abhinav pending projects\burnboard\burnboard.test.js` (extend with Phase 4 pure-function tests)

No new files. No new runtime deps (Chart.js v4 already loaded via CDN, burnboard.html:11).

---

## Established patterns to follow (copy from)

- IDB reads/writes: `dbGetAll('turns')`, `dbBatchPut('monthly_cache', records)`, `dbGetAll('monthly_cache')`, `dbGet`/`dbPut` (burnboard.html:450-486). `monthly_cache` store already exists with compound keyPath `['month_key','account_label']` and `by_month` index (burnboard.html:439-443).
- `modelFamily(m)` (burnboard.html:572) — returns `'opus'|'sonnet'|'haiku'|'other'`.
- `fmtTokens(n)` (burnboard.html:1037) — K/M formatting for numbers.
- `getMondayUTC(now)` (burnboard.html:775) — Monday 00:00 UTC; the weekly bucket helper must use the SAME Monday math (dump §15.5 inlines it; reuse `getMondayUTC` to avoid divergence — see ponytail note in Weekly view).
- Number = JetBrains Mono: wrap every numeric value in `<span class="mono">…</span>` or apply `.mono` to the element (dump §4.2, non-negotiable).
- Card markup: `<div class="card au dN">…</div>`; section header pattern `<div class="forecast-header"><h3>…</h3><p>…</p></div>` (used by every Phase 2/3 section, e.g. burnboard.html:1330, 1608).
- Stagger classes `.au .d0`–`.d5` exist (burnboard.html:176-182). Monthly cards need 30ms stagger (dump §8.1) — see "New CSS" for the per-card delay approach.
- Chart.js usage: destroy-before-recreate via a module-level handle, guard `if (!window.Chart) return;`, mono tick/tooltip fonts, `responsive:true, maintainAspectRatio:false`, colors `#F97316`/`#FB923C`, grid `rgba(255,255,255,.04)`, tick color `#6B6460` (copy the exact options block from `renderDailyBurn`, burnboard.html:1246-1308).
- Secondary/pill buttons: `.btn-secondary` + `.sel` for selected (burnboard.html:185). Toggle pattern mirrors the filter bar (burnboard.html:1198-1203).
- Tab switching: the tab-bar delegated handler (burnboard.html:1888-1896) shows/hides `#panel-history`. History must render when its tab is shown — see "Wiring".
- Empty/secondary text styling: `color:var(--mu)` / `var(--mu2)`; `.chart-empty` for centered empty states.

---

## Naming convention for new code

All new functions/handlers are Phase-4-only and additive. Suggested names (match existing camelCase / `_`-prefixed-module-state style):
- `recomputeMonthlyCache()` — async, post-sync.
- `aggregateMonths(turns)` — PURE core of the recompute (extracted so it's IDB-free and testable).
- `getWeeklyBuckets(turns, n)` — pure.
- `getBillingCycles(turns, billingStartDay, now)` — pure (new; not in dump §15 but needed for §8.3).
- `buildCsvRows(records)` + `exportHistoryCsv()` — CSV (§8.4).
- `renderHistory()` — top-level; renders the active history view into `#panel-history`.
- `renderMonthlyView()`, `renderWeeklyView()`, `renderBillingView()`.
- Module state: `let _historyView = 'monthly';` (default per §8 `[Monthly ●]`). Chart handles: `let _monthlyChart = null, _weeklyChart = null;` (destroy-before-recreate).

---

## 1. Post-sync: `recomputeMonthlyCache()` (dump §15.4)

Transcribe dump §15.4 almost verbatim, adapted to the existing IDB helpers. Split into a PURE aggregator + a thin IDB wrapper so the aggregation is testable.

Pure core:
```
function aggregateMonths(turns)  // → array of monthly_cache records (without account_label/computed_at)
```
Wrapper:
```
async function recomputeMonthlyCache()
```

Behavior:
- `const turns = await dbGetAll('turns');`
- Account label for Phase 4 is always a single fixed label: write every `monthly_cache` record this phase under `account_label:'combined'`. (dump §13.5 shows `account_label` can be `"Primary"` or `"combined"`; Phase 4 is single-account, so write ONE record per month under a fixed label. Use `'combined'` so the History reader can always query `account_label === 'combined'` and Phase 5 can later add per-`Primary`/per-`Alt` records without colliding.)
  - ponytail: single-account collapse — all months written under `account_label:'combined'`. Ceiling: no per-account split yet. Upgrade path (Phase 5): loop over real account labels per dump §15.4's `for (const label of accountLabels)`.
- `aggregateMonths(turns)` groups per `t.month_key` exactly as dump §15.4: `total_tokens` (= input+output), `input_tokens`, `output_tokens`, `cache_read_tokens`, `sessions` (Set of `session_id` → `.size`), `active_days` (Set of `timestamp.substring(0,10)` → `.size`), and `opus`/`sonnet`/`haiku` token sums. dump uses `t.model.includes(...)`; use the existing `modelFamily()` instead so `'other'` is handled consistently — equivalent for opus/sonnet/haiku.
- `top_model` = whichever of `['opus','sonnet','haiku']` has the most tokens (dump §15.4 sort). Tie → first in that fixed order (stable, matches dump's `sort`).
- Each record (dump §13.5 shape): `{ month_key, account_label:'combined', total_tokens, input_tokens, output_tokens, cache_read_tokens, sessions, active_days, top_model, computed_at: new Date().toISOString() }`.
- Write via `dbBatchPut('monthly_cache', records)` (single transaction). Records with the same compound key overwrite (put semantics) — safe on every re-sync.
- **Edge: no turns** → write nothing; History monthly view shows the empty state (see §4 edge cases).

Error handling (dump §18 "Monthly cache compute fails"): wrap the recompute call in `runSync` in a `try/catch`; on failure `console.error` and continue (do not block sync or dashboard). The History tab falls back to whatever is already in `monthly_cache`. ponytail: stale-cache note (dump §18 `"data may be stale — re-sync to refresh."`) is deferred to Phase 6 polish — Phase 4 just doesn't crash. Mark with a ponytail comment naming Phase 6 as the upgrade path.

## 2. Wiring (integration points — the ONLY edits to existing code)

a. **Call recompute post-sync.** In `runSync` (burnboard.html:668-770), after windows are written (after `dbBatchPut('windows', …)`, ≈ burnboard.html:760) and around the `bb_last_sync` write (≈ burnboard.html:762), call:
```
try { await recomputeMonthlyCache(); } catch (e) { console.error('[BurnBoard] monthly cache:', e); }
```
Place it after all turns are committed. It may run before `renderDashboard()`; it does not block render.

b. **Render History on tab switch.** The tab-bar handler (burnboard.html:1888-1896) currently only toggles `.active`. Add: when the activated tab is `history`, call `renderHistory()`. Minimal edit — after `if (panel) panel.classList.add('active');` add `if (btn.dataset.tab === 'history') renderHistory();`. `renderHistory` is async; fire-and-forget is fine (no await in the click handler). ponytail: re-renders on every history-tab click (cheap; reads cache + turns). Upgrade path = cache rendered DOM if it ever feels slow.

c. **Account dropdown stays hidden.** The `[Account: All ▾]` control from dump §8 is Phase 5. In Phase 4 do NOT render it (single-account). Omit entirely. Do not add account filtering logic.

## 3. History tab header (dump §8)

Section header: `📅 your usage, over time.` (verbatim, lowercase).

View toggle + controls row (dump §8):
- Three pill buttons: `Monthly` `Weekly` `Billing Cycle` — `.btn-secondary`, active one gets `.sel`. `Monthly` selected by default (`_historyView === 'monthly'`).
- Account dropdown: omitted (Phase 5, see Wiring c).
- `↓ Export CSV` button (`.btn-secondary`), right-aligned, calls `exportHistoryCsv()`.

Toggle handler: clicking a view pill sets `_historyView`, updates `.sel`, and calls `renderHistory()`. Prefer a single delegated click listener on `#panel-history` (mirror the filter-bar delegated handler, burnboard.html:1932-1942); attach it ONCE (guard against double-binding on repeated `renderHistory` calls — bind it in boot or via a `_historyBound` flag).

Body container below the header swaps content per `_historyView`.

## 4. Monthly view (dump §8.1) — AC#1, AC#2

Data source: `await dbGetAll('monthly_cache')`, filter `account_label === 'combined'`, sort by `month_key` DESC (newest first). Take up to 12 (newest-first; top-left = most recent).

**12-card grid, newest first.** Each card (dump §8.1 layout, exact copy/casing):
- Month + year header, e.g. `June 2026` — Outfit 600, `--mu`. Derive from `month_key` (`"2026-06"` → `June 2026`) via `new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month_key+'-01T00:00:00Z'))`.
- Token total: `<span class="mono">` formatted with thousands separators per dump's `4,218,400` example → `total_tokens.toLocaleString('en-US')`, 28px (reuse `.stat-value` sizing). Label `tokens` below (Outfit 400, 12px, `--mu`).
- `N sessions` · `N active days` · `mostly <top_model>` (dump shows `mostly sonnet`) — Outfit 400, 12px, `--mu`. Numbers in `.mono`.
- vs-prior delta: compare this card's `total_tokens` to the chronologically-prior month's `total_tokens`. `↑ +X%` green if up, `↓ -X%` red if down (dump: green `↑` / red `↓`, Outfit 600, 12px). Pct = `round((cur - prev)/prev * 100)`. Format `↑ +12% vs May` (prior month's short name). If prev `total_tokens === 0` or no prior month, render no delta (avoid div-by-zero).

**Edge cases (dump §8.1):**
- No-data month: dump shows a card at 40% opacity with `no activity` centered. NOTE: `monthly_cache` only stores months that have turns, so true "gap" months between active months won't appear as records. ponytail: Phase 4 renders only months present in `monthly_cache` (no synthetic gap-filling). The `.no-data` faded-card CSS exists for completeness, applied only if a record has `total_tokens === 0`. Ceiling: gap months between active months are absent rather than shown faded. Upgrade path = synthesize empty month records for gaps in the last-12 window. Mark with a ponytail comment.
- Only 1 month of history: hide all deltas, show `not enough history yet` (dump §8.1 verbatim). Detect: monthly records length === 1.
- Zero months: empty state `no monthly history yet` (ORIGINATED — dump gives no all-empty copy; lowercase, terse, per §4.7). Flagged as originated.

Cards animate in with 30ms stagger on tab switch (dump §8.1) — see New CSS.

**Below grid — Monthly comparison chart (dump §8.1):**
- Bar chart (Chart.js): X = months (last 12, chronological/oldest-left — reverse the newest-first card order), Y = `total_tokens`.
- Bar tint per month: orange if `top_model === 'opus'`, blue/sky if `top_model === 'sonnet'` (dump: "orange-tinted for opus-heavy months, blue-tinted for sonnet-heavy months"). Use orange `#F97316`; sonnet sky-blue `#38BDF8` (same as the model doughnut, burnboard.html:1404). haiku/other-dominant → fall back to `#F97316`. ponytail: tint keyed off `top_model` only (not a true opus-vs-sonnet ratio); matches dump wording. Upgrade = ratio-based blend.
- Dotted line overlay: 30-day rolling average. On a months axis a literal 30-day window is impossible. **Decision: trailing rolling mean of `total_tokens` over the displayed months, window = min(3, i+1) months**, rendered as a Chart.js mixed `line` dataset (`type:'line'` on that dataset) with `borderDash:[4,4]`, no fill. ponytail: months-axis trailing rolling mean (window 3), not a literal 30-day window. Ceiling: coarse on a monthly axis. Upgrade = true 30-day rolling series from daily buckets. Mark the ceiling in a ponytail comment.
- Hover tooltip (dump §8.1): `month · total tokens · sessions · avg per day`. `avg per day` = `round(total_tokens / active_days)` (guard `active_days > 0`). Tokens via `fmtTokens`. Mono tooltip fonts.
- Empty state: if 0 monthly records, render `<div class="chart-empty">no monthly history yet</div>` instead of the canvas.

## 5. Weekly view (dump §8.2) — AC#3

`getWeeklyBuckets(turns, n=12)` — transcribe dump §15.5 with two adjustments:
- Reuse `getMondayUTC(now)` for `thisMonday` instead of re-inlining the Monday math (the §15.5 inline is identical; reuse avoids drift). ponytail comment: "Monday math reuses getMondayUTC (burnboard.html:775) — same result as dump §15.5 inline, single source of truth."
- `label` format `Jun 23–29` (dump §8.2 table): start formatted `Jun 23` via `Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',timeZone:'UTC'})`; end = inclusive Sunday `new Date(end.getTime() - 86400000)`, formatted day-only (`29`). If end month differs from start month, include the month on the end too (e.g. `Jun 30–Jul 6`). ponytail: cross-month label shows both months; same-month omits the second. Keep small.
- Returns buckets `.reverse()` to oldest-first (dump §15.5). For the TABLE render newest-first (dump §8.2 "newest first") by iterating the buckets array in reverse; for the SPARKLINE use oldest-first (chronological X).

Bucket fields (dump §15.5): `label, start_iso, total_tokens, opus_tokens, sonnet_tokens, sessions`.

**Table (dump §8.2), last 12 weeks, newest first.** Columns exactly:
`Week | Tokens | Opus hrs | Sonnet hrs | Sessions | vs prior`
- Week: `label` (e.g. `Jun 23–29`).
- Tokens: `total_tokens.toLocaleString('en-US')` in `.mono`.
- Opus hrs: `(opus_tokens / TOKENS_PER_HOUR).toFixed(1)` + `h` (dump shows `4.2h`). `TOKENS_PER_HOUR` constant exists (burnboard.html:553).
- Sonnet hrs: `(sonnet_tokens / TOKENS_PER_HOUR).toFixed(1)` + `h`.
- Sessions: `.mono`.
- vs prior: vs the chronologically-previous week's `total_tokens`. `↑ +X%` / `↓ -X%`, same green/red as monthly. **Oldest visible week shows `—`** (dump §8.2 verbatim). If prior week `total_tokens === 0`, show `—` (avoid div-by-zero).
- **Zero-activity weeks: faded row, not hidden** (dump §8.2). Apply `.faded` (opacity ~.4) to any row where `total_tokens === 0`. Do NOT skip them.

**Below table — sparkline (dump §8.2):**
- Chart.js `line`, X = 12 weeks (oldest-left), Y = `total_tokens`, orange area fill (dump: "orange area fill"): `fill:true`, `backgroundColor:'rgba(249,115,22,.15)'`, `borderColor:'#F97316'`, points hidden, small tension. Height ~120px. Mono ticks/tooltips. Tooltip: week label · tokens.
- All-zero weeks → still render table (faded rows) + flat sparkline; no special empty copy.

## 6. Billing cycle view (dump §8.3) — AC#4

Uses `_cfg.billing_start` (integer day-of-month, default 1; range 1–28 per the settings field). Fallback `Number(_cfg.billing_start) || 1`.

`getBillingCycles(turns, billingStartDay, now)` — NEW pure helper (dump §8.3 needs it; not in dump §15). Returns the current cycle plus the prior 3 (4 total), each:
```
{ start_iso, end_iso, label, day_index, days_in_cycle, total_tokens, sessions, is_current }
```
Cycle boundary math (UTC, consistent with all other bucketing in the app):
- A cycle starts on day `billingStartDay` at 00:00 UTC and runs until day `billingStartDay` of the next month (exclusive end).
- Current cycle contains `now`: if `now`'s UTC day-of-month `>= billingStartDay`, start = `billingStartDay` of current month; else `billingStartDay` of previous month.
- Build start via `Date.UTC(year, month, billingStartDay)`; next start = `Date.UTC(year, month+1, billingStartDay)` (JS Date normalizes month overflow). `days_in_cycle = round((nextStart - start)/86400000)`. `day_index` (current cycle only) = `floor((now - start)/86400000) + 1`, clamped to `days_in_cycle`.
- ponytail: `billingStartDay` capped at 28 by the settings input, so `Date.UTC(y,m,28)` never rolls into the next month — no clamping needed. Ceiling: days 29–31 unsupported (matches settings max). Upgrade = clamp to month length if the input ever allows >28. Mark with a ponytail comment.
- `total_tokens`/`sessions`: over turns with `start_iso <= t.timestamp < end_iso` (half-open). Sessions = Set of `session_id`.
- `label`: dump §8.3 `Jun 1 – Jun 30` (start day → last day inclusive = `new Date(nextStart - 86400000)`). `Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',timeZone:'UTC'})` for both ends.

**Current cycle card (dump §8.3 layout, verbatim copy):**
- `Cycle: Jun 1 – Jun 30  ·  day 26 of 30` — `day <day_index> of <days_in_cycle>`, numbers in `.mono`.
- `<total_tokens.toLocaleString> tokens` — 28px mono.
- `vs same point last cycle: ↑ +22%` — compare current cycle's `total_tokens` to the PRIOR cycle's tokens accumulated up to the SAME `day_index` elapsed days. ponytail: "same point" = prior-cycle tokens for turns within its first `day_index` days (`t.timestamp < priorStart + day_index*86400000`). Ceiling: day granularity. Upgrade = match by elapsed ms. Green ↑ / red ↓; if prior-at-point is 0, show `—`.
- Progress bar: `[████░░] 86% of last cycle's total` — `round(currentTotal / priorCycleTotal * 100)`; bar WIDTH capped at 100% but the LABEL shows the true %. Reuse `.progress-track`/`.progress-fill` (burnboard.html:144-145). Color: `--accent` (dump specifies no color rule here). ORIGINATED: bar accent color. Flagged. If prior cycle total is 0, hide this bar (no baseline).

**Last 3 cycles table (dump §8.3, verbatim columns):**
`Cycle | Total Tokens | Sessions | vs avg`
- Rows: current cycle marked `●`, tokens shown as `<n> ongoing` (dump `3,218,400 ongoing`), then prior cycles newest-first.
- `vs avg`: each cycle's total vs the average of the displayed completed (non-ongoing) cycles. dump shows oldest as `base`, others `+18%`/`+8%`. ponytail: "avg" = mean of completed cycles shown (exclude ongoing current); oldest completed shown as `base`. Ceiling: small-sample average. Upgrade = longer baseline window. Mark with a ponytail comment. Numbers `.mono`.
- ORIGINATED: dump's `vs avg` example is illustrative and doesn't fully specify the baseline; baseline defined here = mean of completed cycles in view. Flagged.

**Edge: no turns** → billing view empty state `no billing history yet` (ORIGINATED lowercase). Flagged.

## 7. Export CSV (dump §8.4) — AC#5

`exportHistoryCsv()` — fully client-side, no network.
- Source rows: `monthly_cache` records (`account_label === 'combined'`), sorted by `month_key` ascending/chronological (ORIGINATED order, flagged).
- Columns EXACTLY (dump §8.4 header verbatim, this order):
  `month, total_tokens, input_tokens, output_tokens, cache_reads, sessions, active_days, top_model`
  - Map: `month`=`month_key`, `total_tokens`, `input_tokens`, `output_tokens`, `cache_reads`=`cache_read_tokens`, `sessions`, `active_days`, `top_model`. Numeric values as raw integers (no separators, no `K`/`M` — CSV is data).
- `buildCsvRows(records)` — PURE helper returning the full CSV string (header + rows joined by `\n`, fields joined by `,`). ponytail: no CSV escaping — all values are integers or a single-word model family with no commas. Ceiling: a future field containing commas would break it. Upgrade = quote fields. Mark with a ponytail comment. This is the unit-testable seam.
- Download (dump §8.4 verbatim): `new Blob([csv], {type:'text/csv'})` → `URL.createObjectURL` → temporary `<a download="burnboard-history-YYYY-MM-DD.csv">` → `.click()` → `URL.revokeObjectURL`. Filename date = today UTC: `new Date().toISOString().substring(0,10)`.
- Edge: no records → download header-only CSV (button always does something predictable). ORIGINATED, flagged.

## 8. New CSS (add to the `<style>` block, after the Phase 3 section)

Add a commented `/* Phase 4 — History (dump 8, 8.1-8.4) */` block. Reuse existing where possible (`.card`, `.btn-secondary`, `.sel`, `.mono`, `.forecast-header`, `.progress-track`, `.progress-fill`, `.chart-empty`, color utils). New classes:
- `.history-header-row` — flex, space-between, align center, gap; view-toggle pills (left) + Export CSV (right). Wraps on small widths.
- `.history-views` — toggle pill group (flex, gap 8px).
- `.month-grid` — `display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:16px;`.
- `.month-card` — extends `.card`; internal layout for the dump §8.1 card. `.month-card.no-data{opacity:.4}`.
- `.month-delta-up{color:var(--green)}` / `.month-delta-down{color:var(--red)}` (Outfit 600, 12px).
- `.history-table` — reuse `.cost-table`/`.sessions-table` rules (share a selector or clone). `.history-table tr.faded{opacity:.4}` for zero-activity weeks.
- `.sparkline-wrap` (`position:relative;height:120px`), `.monthly-chart-wrap` (`position:relative;height:240px`) for canvases.
- `.cycle-card` — current-cycle layout (reuse `.card`); cycle bar reuses `.progress-track`/`.progress-fill`.
- Month-card stagger (dump §8.1, 30ms): reuse the `fadeUp` keyframe via `.au`; set per-card delay inline `style="animation-delay:${i*30}ms"` on each `.month-card.au` (avoids defining 12 new delay classes). ponytail: inline animation-delay for arbitrary card counts; matches `.au` fadeUp.

Match dump §4.1–4.5 vars/classes exactly. Do not introduce new colors beyond existing CSS vars and the already-used sonnet sky-blue `#38BDF8`.

## 9. Edge cases the implementation must handle (checklist)

- Empty `monthly_cache` (no turns) → monthly grid empty state + chart empty state; CSV downloads header-only.
- Exactly 1 month → no deltas, `not enough history yet`.
- vs-prior / vs-avg / vs-same-point with a 0 baseline → render `—`, never `Infinity`/`NaN`.
- Weeks with zero activity → faded row, kept (not skipped); oldest visible week vs-prior = `—`.
- Billing day missing/invalid → fallback `|| 1`.
- `billing_start` 1–28 only (settings caps it); no day-29+ month-overflow handling needed (ponytail noted).
- Chart re-render on repeated history-tab visits / view switches → destroy prior chart handle before `new Chart(...)` (avoid "Canvas is already in use").
- `window.Chart` missing (CDN fail) → guard each chart with `if (!window.Chart) return;` AFTER rendering the surrounding text/table (never blank the view).
- All dates/buckets UTC, consistent with Phases 1–3 (`getMondayUTC`, `month_key` = `timestamp.substring(0,7)`, day = `timestamp.substring(0,10)`).
- `recomputeMonthlyCache` failure must not break sync or dashboard (try/catch in `runSync`).
- History delegated click listener bound once (no double-binding on repeated `renderHistory`).

## 10. Tests — extend `burnboard.test.js`

The test file copies pure functions verbatim from the HTML and asserts with Node `assert` (no framework, no fixtures — CLAUDE.md). For each seam, copy the function verbatim into the test file (matching the convention at burnboard.test.js:13-60) and assert:

1. **`getWeeklyBuckets` bucketing:**
   - A turn dated inside week 0 lands in the newest bucket; a turn 8 days earlier lands in week 1; `total_tokens`/`sessions`/`opus_tokens`/`sonnet_tokens` aggregate correctly.
   - Boundary: a turn at exactly `thisMonday` 00:00 UTC is in the current week (>= start, < end); a turn one ms before Monday is in the prior week.
   - Returns `n` buckets, oldest-first after `.reverse()`.
   - Empty turns → all buckets zero, length `n`.
   - (Pass a fixed `now` — extract the helper so Monday is derived from a passed `now`, or stub `getMondayUTC` in the test.)

2. **Month aggregation (`aggregateMonths`):** turns across 2 months → assert per-month `total_tokens`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `sessions` (unique count), `active_days` (unique day count), and `top_model` (dominant family, tie → opus>sonnet>haiku order). This is why §1 extracts the pure `aggregateMonths(turns)` — it is testable without IDB.

3. **Billing-cycle boundary math (`getBillingCycles`):**
   - `billing_start=1`: current cycle for a mid-month `now` spans the 1st→last day; `day_index` correct.
   - `billing_start=15` with `now` on the 10th → current cycle started the 15th of the PRIOR month.
   - `day_index` clamps to `days_in_cycle`; `days_in_cycle` correct across a month boundary (e.g. Jan 31).
   - Turn assignment respects `[start, nextStart)` half-open interval.

4. **CSV row generation (`buildCsvRows`):** header row is exactly `month,total_tokens,input_tokens,output_tokens,cache_reads,sessions,active_days,top_model`; one record produces a row with raw integer values in the right column order; `cache_reads` maps from `cache_read_tokens`; empty records → header only.

Keep tests assert-based and deterministic (helpers take `now`/`turns` args, so pass fixed values rather than calling `Date.now()` in tests).

---

## SCOPE GUARD — do NOT build (later phases)

- NO account selector / `[Account: All ▾]` dropdown (Phase 5, dump §10.3). Omit it.
- NO combined-totals card at top of History (Phase 5, dump §10.3).
- NO per-account `monthly_cache` records — Phase 4 writes a single `account_label:'combined'` record per month only.
- NO sync-prompt account modal (Phase 5, dump §10.2).
- NO Token Tips tab content (Phase 6, dump §9).
- NO What's Coming tab content (Phase 6, dump §11).
- NO Reconnect screen / `requestPermission()` flow (Phase 6, dump §5.3).
- NO toast system, favicon-by-state, stale-cache note UI, browser-support bar work (Phase 6, dump §18) — except the required try/catch so a cache-compute failure doesn't crash.
- NO changes to Dashboard tab (Start Check, Mini Stats, Forecast, charts, insights, sessions, cost) beyond the two wiring edits (post-sync recompute call; tab-switch render call).
- NO new settings fields — `billing_start` already exists and is wired.
- NO new runtime dependency.
- Do NOT "improve"/refactor adjacent Phase 1–3 code (CLAUDE.md surgical-changes rule).

## Hard rules that apply (CLAUDE.md, quoted)

- "Never invent a state, field, name, or requirement not in spec docs" — every persisted field used (`month_key`, `total_tokens`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `sessions`, `active_days`, `top_model`, `computed_at`, `account_label`) comes from dump §13.5/§15.4. Items I had to ORIGINATE (no dump copy/rule): all-empty state copy strings (`no monthly history yet`, `no billing history yet`), billing-bar accent color, `vs avg` baseline definition, CSV sort order, header-only CSV on empty. All flagged inline above.
- "Mark intentional simplifications with a ponytail: comment" — every simplification above (single-account `combined` collapse, gap-month omission, rolling-mean overlay, top_model tint, billing day≤28 assumption, vs-avg baseline, vs-same-point granularity, CSV no-escape, stale-cache deferral) MUST carry a `ponytail:` comment naming the ceiling + upgrade path in the code.
- "Lazy code without its check is unfinished" — the four pure seams (`getWeeklyBuckets`, `aggregateMonths`, `getBillingCycles`, `buildCsvRows`) each get test coverage in `burnboard.test.js`.
- Numbers in JetBrains Mono (dump §4.2) — every numeric value wrapped in `.mono`.
- Copy verbatim/lowercase (dump §4.7) — all UI strings transcribed exactly from dump §8.
