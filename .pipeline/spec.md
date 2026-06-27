# Spec — Phase 2: filtered-charts

Source of truth: ROADMAP.md "Phase 2 — filtered-charts" + dump.md §7.4, §7.6, §7.7, §7.8, §15.1, and the EXISTING `burnboard.html` (Phase 1, merged). This is a forward-build phase extending Phase 1 in the same single self-contained file. No research.md exists (this is original planning, not rework).

No OPEN QUESTIONs. Range default (30d) and model default (all) are explicit in ROADMAP + dump 7.4. The one fuzzy spec detail (exact log-intensity formula in 7.7) is a visual default with no security/money/data risk — it is pinned below with a `ponytail:` ceiling note, not flagged.

---

## Goal (from ROADMAP)
User can filter by range and model and see daily burn, when-they-work heatmap, model split, and top projects update accordingly.

## Scope (from ROADMAP)
`burnboard.html`. Filter bar (7.4: range 7d/30d/90d/all, model all/opus/sonnet/haiku) wired to re-query IDB and re-render the affected sections only. Daily Burn bar chart (7.6, Chart.js). Peak Hour Heatmap (7.7, CSS grid 7x24, log intensity, peak tint, local-TZ peak note via `Intl.DateTimeFormat`). Model Breakdown doughnut (7.8 left, Chart.js). Top Projects horizontal bar (7.8 right). Builds the corresponding fields of the `d` object (15.1: daily_usage, heatmap, model_breakdown, top_projects).

## Acceptance criteria (from ROADMAP — what the build is graded on)
- Changing range or model re-renders the four sections in this phase but leaves Start Check, Mini Stats, and Forecast unchanged (per 7.4).
- Daily burn chart shows token bars per day in range, highlights today, and shows the empty state when the range has no usage.
- Heatmap renders 7x24 cells colored by token intensity, tints weekday peak columns (13-18 UTC), shows the local-timezone peak-hours note, and shows the "add more data" state under 3 days of data.
- Model breakdown doughnut shows opus/sonnet/haiku/unknown segments with center total and legend; top projects shows up to 8 folders by token volume.
- All four respect the active filter selection.

---

## File to modify
`C:\Users\ue\Desktop\abhinav pending projects\burnboard\burnboard.html` — the ONLY file. Single self-contained HTML. Edit in place. Do not create new product files.

---

## New dependency: Chart.js (allowed, named in dump §2)
Add ONE CDN script tag in `<head>`, after the Google Fonts `<link>` (line 9), before `<style>` (line 10):

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
```

- Use Chart.js v4 UMD global `Chart`. No other new deps. GSAP NOT required (Phase 1 uses CSS keyframes; keep that).
- ponytail: CDN-pinned to major v4. Offline use breaks charts; upgrade path = vendor the file inline if offline support is ever required. The rest of the dashboard (Start Check / Mini Stats / Forecast) must NOT depend on Chart.js — guard chart init with `if (window.Chart)` so a CDN failure never blanks those sections.

---

## State: filter selection
Add a module-level variable next to `_cfg` / `_db` (near line 345/452):

```javascript
let _filter = { range: '30d', model: 'all' };  // dump 7.4 defaults: 30d ●, all ●
```

- `range` ∈ `'7d' | '30d' | '90d' | 'all'`
- `model` ∈ `'all' | 'opus' | 'sonnet' | 'haiku'`

Filter is render-state only — do NOT persist it to IDB / kv (not in spec; resets to defaults on reload).

---

## Data computation

### Add a SEPARATE filtered builder `loadFilteredData()`
Phase 1's `loadDataLocal()` returns the unfiltered Start Check / Mini Stats / Forecast numbers — DO NOT touch it and DO NOT make it filter-aware (7.4: filters must not affect those). Add a new async function that reads `turns` from IDB, applies `_filter`, and returns ONLY the four Phase-2 `d` fields (dump 15.1 shape) plus a day-count:

```javascript
async function loadFilteredData() {
  // returns { daily_usage, heatmap, model_breakdown, top_projects, days_with_data }
}
```

Build from `await dbGetAll('turns')` (same source Phase 1 uses). Apply filters in this order:

1. **Range filter** — cutoff = `Date.now()` minus N days; `all` = no cutoff.
   - `7d` → `now - 7*86400000`, `30d` → `now - 30*86400000`, `90d` → `now - 90*86400000`, `all` → include all.
   - Keep turn if `new Date(t.timestamp).getTime() >= cutoff`. Compute `now` once at top.
2. **Model filter** — if `_filter.model !== 'all'`, keep only turns where `modelFamily(t.model) === _filter.model`. REUSE existing `modelFamily()` (line 498) → returns `'opus' | 'sonnet' | 'haiku' | 'other'`.

`tokens` everywhere in Phase 2 = `t.input_tokens + t.output_tokens` (same definition Phase 1 uses, e.g. lines 747, 771).

### Field shapes (dump 15.1 — match exactly)

**daily_usage** — one entry per UTC day with ≥1 filtered turn, ascending by day:
```
[ { day: "2026-06-15", total_tokens: 284000, sessions: 3 }, ... ]
```
- `day` = `t.timestamp.substring(0,10)` (UTC bucket, consistent with Phase 1 lines 766/771).
- `total_tokens` = sum of tokens that day. `sessions` = count of DISTINCT `session_id` that day (use a `Set`).

**heatmap** — sparse: one entry per (day_of_week, hour_utc) cell that has tokens; renderer fills the 7x24 grid:
```
[ { day_of_week: 1, hour_utc: 14, tokens: 48000 }, ... ]
```
- `day_of_week` = `new Date(t.timestamp).getUTCDay()` → 0=Sun..6=Sat (JS native).
- `hour_utc` = `new Date(t.timestamp).getUTCHours()` (0-23). `tokens` = sum.

**model_breakdown** — aggregate by family; dump 7.8 segments are opus / sonnet / haiku / unknown:
```
[ { model_family: "opus", tokens: 1200000, pct: 22 }, ... ]
```
- Bucket `modelFamily()` results: `'opus' | 'sonnet' | 'haiku'` as-is; map `'other'` → `"unknown"` (dump 7.8 fourth segment; 15.1 uses lowercase family strings).
- `pct` = round(tokens / total_tokens_in_range * 100). Total = sum across families.
- Include a family only if its tokens > 0. Order: opus, sonnet, haiku, unknown (matches 7.8 segment/legend order). With model filter set, only that family has tokens — correct.
- ponytail: pcts rounded independently and may not sum to exactly 100. Fine for a legend; upgrade = largest-remainder rounding if it ever looks off.

**top_projects** — group filtered turns by project, top 8 by tokens desc (dump 7.8 right):
```
[ { project_name: "reelforge", tokens: 2400000, sessions: 8 }, ... ]
```
- `project_name` = last path segment of `t.cwd`. REUSE Phase 1's exact derivation (line 512): `(t.cwd||'').replace(/\\/g,'/').split('/').filter(Boolean).pop() || ''`. If empty, label `"unknown"`.
- `tokens` = sum per project. `sessions` = distinct `session_id` per project. Sort by tokens desc, slice to 8.

**days_with_data** — integer = distinct UTC days in filtered set (= `daily_usage.length`). Gates the heatmap "under 3 days" state (7.7).

---

## Rendering

### Wire-up in `renderDashboard()` (lines 791-800)
Phase 1 sets `dashboard-content` innerHTML to `renderStartCheck(d) + renderMiniStats(d) + renderForecast(d)`. Phase 2:

1. Keep that line — APPEND the filter bar + four section CONTAINERS:
```
... + renderFilterBar() + renderChartsShell();
```
   `renderChartsShell()` returns the static section skeletons (headers + empty `<canvas>` / grid containers with stable ids) as mount points.
2. After setting innerHTML, call `await renderFilteredSections()` to populate the four sections. This is the function the filter bar re-calls.

This split is the mechanism that satisfies AC#1: the filter handler calls `renderFilteredSections()` ONLY — it never re-runs StartCheck/MiniStats/Forecast.

### `renderFilteredSections()`
```javascript
async function renderFilteredSections() {
  const fd = await loadFilteredData();
  renderDailyBurn(fd);       // 7.6
  renderHeatmap(fd);         // 7.7
  renderModelBreakdown(fd);  // 7.8 left
  renderTopProjects(fd);     // 7.8 right
}
```
Each Chart.js render destroys any prior Chart before creating a new one — keep module-level handles (`let _dailyChart, _modelChart, _projChart;`) and call `.destroy()` if set. Prevents canvas-reuse errors on re-filter.

### Filter bar — dump 7.4 (exact, lowercase)
```
RANGE   [7d]  [30d ●]  [90d]  [all]    |    MODEL   [all ●]  [opus]  [sonnet]  [haiku]
```
- Two groups of pill buttons reusing existing `.btn-secondary` (lines 52-53). Phase 1 lacks the selected state — add `.btn-secondary.sel{border-color:var(--accent);color:var(--accent)}` to `<style>` (dump 4.5 selected rule).
- Pill labels lowercase: `7d 30d 90d all` and `all opus sonnet haiku`. Group labels `range` / `model` lowercase, muted.
- Single delegated click handler (mirror tab-bar listener at lines 977-985). On click: update `_filter.range`/`_filter.model`, toggle `.sel` within that group, then `await renderFilteredSections()`. Do NOT call `renderDashboard()`.
- Default-selected pills `30d` and `all` carry `.sel` on first render (from `_filter` defaults).

### 7.6 Daily Burn — Chart.js bar
- Header: `🔥 daily burn rate` (no subtext in 7.6). Wrap in `.card`. Canvas in a 240px-tall container.
- X = `daily_usage[].day` (range-filtered). Y = `total_tokens`, ticks formatted K/M.
- Bars: `--accent` (#F97316). Today's bar (`day === new Date().toISOString().substring(0,10)`) gets brighter fill (`--accent2` #FB923C) + a `today` indication.
  - ponytail: simplest acceptable today-highlight = brighter today bar + the word `today` in its hover tooltip title; an always-on above-bar `today` label is a nice-to-have, ceiling noted.
- Hover tooltip (Chart.js `callbacks`): `date · tokens · N sessions that day` (sessions from `daily_usage[].sessions`).
- Empty state (AC#2): if `daily_usage.length === 0`, do NOT init a chart — show centered muted text `no usage in this range` (exact copy) in the canvas area.

### 7.7 Peak Hour Heatmap — CSS grid (NOT Chart.js)
- Header: `🌡 when you work` · subtext `amber = peak hours` (exact). Wrap in `.card`.
- Under-3-days gate FIRST (AC#3): if `fd.days_with_data < 3`, render only centered muted `add more data to see your patterns` (exact) — skip the grid.
- Grid: 7 rows (Mon,Tue,Wed,Thu,Fri,Sat,Sun) × 24 columns (hours 0-23 UTC). CSS grid + a small row-label column. Build a 7×24 lookup from `fd.heatmap` keyed `dow-hour`.
  - Row order Mon-Sun. JS `day_of_week` is 0=Sun..6=Sat → `rowIndex = (dow + 6) % 7` (Mon=0..Sun=6). State this mapping in a code comment.
- Cell color: transparent → `--accent` by LOG token intensity (dump 7.7).
  - ponytail: pinned formula — `maxTok` = max cell tokens in range; per cell `intensity = tokens>0 ? Math.log(1+tokens)/Math.log(1+maxTok) : 0`; background = `rgba(249,115,22, intensity)`; empty cells transparent. Ceiling: log base relative to range max; upgrade = quantile bucketing if a few huge cells wash out the rest.
- Peak-column tint: for hours 13-18 inclusive UTC on WEEKDAY rows only (rowIndex 0-4), add faint amber UNDERNEATH the token color (dump 7.7). Implement layered: cell `background: linear-gradient(rgba(249,115,22,intensity),rgba(249,115,22,intensity)), var(--amdim)`. Non-peak cells: orange alpha over transparent.
- Cell hover tooltip (dump 7.7 exact format): `[Day] [Hour]:00 [user TZ] · [X] tokens · peak / off-peak`. Use the existing `[data-tip]` CSS tooltip (lines 132-133) or `title`. Day = short name; Hour = the UTC hour; `[user TZ]` = `_cfg.timezone`; `peak` if `rowIndex<=4 && hour>=13 && hour<=18` else `off-peak` (inline check; do not fake a timestamp for isPeakHour).
- Below heatmap (small, muted) — local-TZ peak note (dump 7.7):
  `in your timezone (IST): peak hours = 6:30pm – 12:30am`
  - Computed from `_cfg.timezone` via `Intl.DateTimeFormat`. Peak window for the NOTE = 13:00-19:00 UTC; convert both bounds to local time and lowercase.
  - `(IST)` is the short TZ abbrev — derive via `Intl.DateTimeFormat(undefined,{timeZone:tz,timeZoneName:'short'})` formatToParts. Format the two local times with `{timeZone:tz,hour:'numeric',minute:'2-digit'}` (mirrors Phase 1 line 925).
  - ponytail: TZ short-name via formatToParts timeZoneName; if unavailable fall back to the IANA string. The literal `(IST)` / `6:30pm – 12:30am` in the dump is illustrative for Asia/Kolkata — compute real values from the saved tz; do NOT hard-code IST.

### 7.8 Model Breakdown (left) — Chart.js doughnut
- Two-column equal-width grid wrapping 7.8 left + right (dump: "Two-column equal-width grid"). Add `.charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}`; each column a `.card`.
- Left header: `model breakdown` (lowercase). Doughnut from `model_breakdown`.
  - Segment colors (dump 7.8): Opus purple, Sonnet sky blue, Haiku teal, Unknown muted. ORIGINATED hexes (mark `ponytail`): opus `#A78BFA`, sonnet `#38BDF8`, haiku `#2DD4BF`, unknown `#4A4440` (`--mu2`). ponytail: tints chosen to match dump's purple/sky/teal/muted wording; swap if a brand palette is later defined.
  - Center: total tokens in range, mono — overlay an absolutely-positioned mono `<div>` over the doughnut center (`--text`). Total = sum of `model_breakdown[].tokens`.
  - Legend below (dump 7.8): one row per segment `model name · tokens · %` (numbers mono) with a colored swatch matching the segment. Disable Chart.js built-in legend (`plugins.legend.display:false`); render the custom one.
  - Empty: if `model_breakdown` empty, centered muted `no usage in this range` in this card.

### 7.8 Top Projects (right) — Chart.js horizontal bar
- Right header: `top projects` (lowercase). Horizontal bar (`indexAxis:'y'`) from `top_projects` (already top-8 desc).
  - Y = `project_name`, X = tokens. Bar color `--accent`. Tooltip (dump 7.8): `project name · total tokens · N sessions` (from `top_projects[].sessions`).
  - Empty: if `top_projects` empty, centered muted `no usage in this range` in this card.

---

## Number formatting
- Every number uses JetBrains Mono (dump 4.2, non-negotiable). HTML legends/labels: wrap in `<span class="mono">`. For Chart.js, set `options.plugins`/scale tick `font.family:'JetBrains Mono'` so canvas ticks/tooltips render mono where the font is loaded. ponytail: Chart.js applies one font family per context; fine here.
- Add a token formatter (none exposed in Phase 1 for this):
```javascript
function fmtTokens(n){ if(n>=1e6) return (n/1e6).toFixed(1)+'M'; if(n>=1e3) return Math.round(n/1e3)+'K'; return String(n); }
```
  Use for axis ticks, tooltips, legend values, and doughnut center total (dump 7.6 "K/M"; 7.9 example `284K`).

---

## Patterns to follow (copy from existing file)
- Delegated click handler: tab-bar listener, lines 977-985 — mirror for the filter bar.
- `.btn-secondary` pill: lines 52-53; add `.sel` selected state.
- Helpers: `modelFamily` (498), `relTime` (718), `fmtDur` (712), `dbGetAll` (401).
- Section card + header markup: forecast card, lines 946-955 (`.card` + `.forecast-header h3/p`). Reuse `.forecast-header` for new section headers.
- Entrance classes `.au .d0..d4` (lines 173-179) — optional on new cards for consistency (not an AC).
- UTC day bucketing `t.timestamp.substring(0,10)` (line 766/771) — use the SAME so today-highlighting matches.

---

## Hard rules (from CLAUDE.md — build FAILS on violation; quoted)
- "Never invent a state, field, name, or requirement not in spec docs." → Only ORIGINATED values: chart segment hex tints + log-intensity formula; both pinned with `ponytail:` ceiling comments. Do not invent new filter options, ranges, `d` fields, or copy beyond dump 7.4/7.6/7.7/7.8.
- "Mark intentional simplifications with a ponytail: comment." → Every shortcut above (CDN pin, rounded pcts, log formula, today-label, tint hexes, TZ short-name) must carry a `ponytail:` comment naming the ceiling + upgrade path.
- Lowercase direct copy (dump 4.7) for all visible strings: `daily burn rate`, `when you work`, `amber = peak hours`, `model breakdown`, `top projects`, `no usage in this range`, `add more data to see your patterns`, filter labels.
- Surgical changes: do NOT modify `loadDataLocal`, `renderStartCheck`, `renderMiniStats`, `renderForecast`, the IDB layer, parsing, or boot. Only ADD the filter bar + four sections and the small CSS rules they need.

---

## Required check (CLAUDE.md: non-trivial logic leaves ONE runnable check)
Riskiest logic = `loadFilteredData()` filtering + aggregation. Extend the Phase-1 self-check block (lines 309-338) OR the worktree `burnboard.test.js` with assertions on a small fixed turns array:
- range `7d` excludes a turn 8 days old, includes one 2 days old.
- model `opus` keeps only opus-family turns (via `modelFamily`).
- `daily_usage` buckets two same-UTC-day turns into one entry with summed tokens and `sessions` = distinct session count.
- `top_projects` sorts by tokens desc and slices to 8.
- `days_with_data` equals distinct UTC day count.
Must FAIL if filter/aggregation breaks. No framework — plain `console.assert` (Phase 1 style) or extend the existing node test file.

---

## Scope guard — OUT of Phase 2 (do NOT build)
- Smart Insights (7.3) — Phase 3.
- Sessions table + per-turn expand (7.9) — Phase 3.
- Cost by model + Summary grid (7.10) — Phase 3.
- `d` fields insights, recent_sessions, turns_by_session, cost_by_model, summary, total_api_cost_usd — Phase 3 (build ONLY daily_usage, heatmap, model_breakdown, top_projects now).
- History tab + monthly_cache population + recomputeMonthlyCache + getWeeklyBuckets + billing cycle + Export CSV (section 8 / 15.4 / 15.5) — Phase 4. Leave the empty `#panel-history` placeholder as-is.
- Two-account tracking / sync prompt / account selector (section 10) — Phase 5.
- Token Tips tab (section 9), What's Coming (section 11) — Phase 6. Leave placeholders.
- Reconnect screen / requestPermission flow (5.3) — Phase 6.
- Toasts, favicon-by-state, prefers-reduced-motion sweep (section 18 / 4.6) — Phase 6.
- The filter bar's effect on Sessions table + Cost table (mentioned in 7.4) — those tables don't exist yet (Phase 3); wire them in Phase 3, not now.
- Do NOT make Start Check / Mini Stats / Forecast filter-aware (7.4 explicitly excludes them).
