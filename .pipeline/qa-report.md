## QA Report — Phase 2: filtered-charts
Date: 2026-06-27
Criteria source: `ROADMAP.md` Phase 2 acceptance criteria (5 items) + `.pipeline/spec.md` detailed requirements

---

### Test Run: burnboard.test.js

```
123 tests: 123 passed, 0 failed
```

All assertions pass, including the 19 Phase 2 filter/aggregation tests and 23 extended coverage tests added by Phase 2.

---

### Results

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Changing range or model re-renders the four sections in this phase but leaves Start Check, Mini Stats, and Forecast unchanged (per 7.4). | PASS | Filter click handler at line 1436 is a delegated listener on `#dashboard-content`. It calls ONLY `renderFilteredSections()` (line 1446). `renderDashboard()` is never called from this handler. `renderFilteredSections()` calls `loadFilteredData()` then the four render helpers — none of which touch `#start-check`, `#mini-stats`, or `#forecast` DOM nodes. `loadDataLocal()` (the unfiltered Phase 1 source) is also not called. Comment at line 1435 explicitly documents this constraint. |
| Daily burn chart shows token bars per day in range, highlights today, and shows the empty state when the range has no usage. | PASS | `renderDailyBurn()` at line 956: empty state renders `no usage in this range` (exact copy) in a 240px container when `daily_usage.length === 0` and returns early. When data exists, today's bar gets `#FB923C` (--accent2) vs `#F97316` (--accent) for all other bars (line 974). Tooltip `title` callback appends `· today` for today's date (line 991). Y-axis ticks use `fmtTokens()` callback (K/M, line 1011). `if (!window.Chart) return` CDN guard at line 967. |
| Heatmap renders 7x24 cells colored by token intensity, tints weekday peak columns (13-18 UTC), shows the local-timezone peak-hours note, and shows the "add more data" state under 3 days of data. | PASS | `renderHeatmap()` at line 1020. Under-3-days gate at line 1042 (`fd.days_with_data < 3`) renders exact string `add more data to see your patterns` plus the TZ note and returns. Full grid: 7 rows x 24 columns via CSS grid class `heatmap-grid` (line 198 CSS). Row mapping `rowIndex = (dow + 6) % 7` correct: Mon(dow=1) to 0, Sun(dow=0) to 6 (line 1069, commented). Log intensity formula matches spec (lines 1080-1082). Peak tint (hours 13-18, weekday rows 0-4): `linear-gradient(rgba(249,115,22,intensity), rgba(249,115,22,intensity)), rgba(251,191,36,.08)` (line 1094). Non-peak cells: solid orange alpha or transparent (line 1096). TZ note computed via `Intl.DateTimeFormat` with `timeZoneName:'short'` formatToParts (lines 1032-1038); falls back to IANA string on error. Note shown in both under-3-days path (line 1044) and full-grid path (line 1103). Test `heatmap rowIndex mapping` suite (3 assertions) all PASS. |
| Model breakdown doughnut shows opus/sonnet/haiku/unknown segments with center total and legend; top projects shows up to 8 folders by token volume. | PASS | `renderModelBreakdown()` at line 1108: segment colors at line 1114 (opus `#A78BFA`, sonnet `#38BDF8`, haiku `#2DD4BF`, unknown `#4A4440`). Center total: absolutely-positioned `.doughnut-center` with `.mono` span (line 1128). Custom legend via `.chart-legend` / `.legend-row` / `.legend-swatch` (lines 1131-1138); Chart.js built-in legend disabled (line 1156). `renderTopProjects()` at line 1170: `indexAxis:'y'` for horizontal bar (line 1199). `top_projects` sliced to 8 in `loadFilteredData()` (line 906). Tooltip shows `tokens · N sessions` from project data (lines 1205-1207). Empty state for both: `no usage in this range` (lines 1119, 1177). `if (!window.Chart) return` CDN guards at lines 1122, 1180. Tests: `top_projects: exactly 8 projects → all 8 returned` PASS; `model_breakdown: order is opus, sonnet, haiku, unknown` PASS. |
| All four respect the active filter selection. | PASS | All four render functions receive `fd` from `loadFilteredData()` which applies `_filter.range` cutoff then `_filter.model` family filter before computing all four data fields. The filter state `_filter` is module-level and updated by the click handler before `renderFilteredSections()` is called. Tests confirm both range and model filters exclude/include correct turns: `7d range: excludes turn 8 days old` PASS, `model=opus: keeps only opus turns` PASS, `model=haiku: keeps only haiku turns` PASS, etc. |

---

### Critical Checks (beyond the five ACs)

**AC#1 deep check — filter never re-renders Start Check / Mini Stats / Forecast:**
Confirmed. Filter handler at line 1436 is on `#dashboard-content` (delegated). The only function it calls is `renderFilteredSections()` (line 1446). `renderDashboard()` is called only at line 719 (post-sync boot) and line 1476 (re-sync). `loadDataLocal()` is called only inside `renderDashboard()` (line 1236), never from `renderFilteredSections()` or `loadFilteredData()`. PASS.

**Chart.js CDN-miss safety (`if (window.Chart)`):**
- `renderDailyBurn`: guard at line 967, after the empty-state check and return, so empty state still renders on CDN miss. PASS.
- `renderModelBreakdown`: guard at line 1122, after empty-state check and return. PASS.
- `renderTopProjects`: guard at line 1180, after empty-state check and return. PASS.
- `renderHeatmap`: no Chart.js used — pure CSS grid. No guard needed. PASS.

**Chart destroy-before-recreate:**
- `_dailyChart` destroyed at line 969 before `new Chart()` at line 976. PASS.
- `_modelChart` destroyed at line 1140 before `new Chart()` at line 1142. PASS.
- `_projChart` destroyed at line 1182 before `new Chart()` at line 1190. PASS.
- All three handles declared at line 819, initialized to `null`. PASS.

**Heatmap dow/hour mapping:**
`dow = (rowIndex + 1) % 7` gives Mon=1, Tue=2, ..., Sat=6, Sun=0 (line 1069). Lookup key `${dow}-${h}` matches the key written in `loadFilteredData()` as `${dt.getUTCDay()}-${dt.getUTCHours()}` (line 869). Mapping is consistent. Tests `heatmap rowIndex mapping: Mon (dow=1) lands in row 0`, `Sun → rowIndex=6`, `Sat → rowIndex=5` all PASS.

**Range/model aggregation correctness:**
All 19 Phase 2 filter+aggregation tests pass. Key checks: range cutoff arithmetic, model family filtering via reused `modelFamily()`, `daily_usage` deduplication with `Set` for sessions, `top_projects` sort-desc-slice-8, `days_with_data = daily_usage.length`, `model_breakdown` family ordering and `other → unknown` remapping.

**Filter defaults:**
`_filter = { range: '30d', model: 'all' }` at line 816. `renderFilterBar()` marks the matching buttons with `.sel` on first render (lines 921, 924). Default-selected `30d` and `all` on load: PASS.

**Spec string compliance (exact lowercase copy):**
- `🔥 daily burn rate` — line 961. PASS.
- `🌡 when you work` with subtext `amber = peak hours` — line 1040. PASS.
- `model breakdown` — line 1116. PASS.
- `top projects` — line 1174. PASS.
- `no usage in this range` — lines 963, 1119, 1177. PASS.
- `add more data to see your patterns` — line 1043. PASS.
- Filter labels: `7d 30d 90d all` / `all opus sonnet haiku` lowercase rendered from arrays at lines 918-919. PASS.
- Group labels `range` / `model` lowercase (lines 928, 933). PASS.

**Surgical changes / scope guard:**
No modifications to `loadDataLocal`, `renderStartCheck`, `renderMiniStats`, `renderForecast`, the IDB layer, parsing, or boot. Phase 3+ items (insights, sessions table, cost/summary, history, reconnect) are not present. PASS.

**`ponytail:` comments on all spec-required simplifications:**
CDN pin (line 10), chart font (line 821), rounded pcts (line 884), TZ short-name fallback (line 1028), log-intensity formula (line 1076), segment hex tints (line 1112). All present. PASS.

**JetBrains Mono on numbers:**
Chart.js `font.family:'JetBrains Mono'` set on axis ticks and tooltip fonts in all three charts. Legend values wrapped in `<span class="mono">` (line 1135). Doughnut center uses `.mono` (line 1128). PASS.

**`fmtTokens()` correctness:**
Tests: `fmtTokens: 284000 → "284K"` PASS, `1000000 → "1.0M"` PASS, `1500 → "2K"` PASS, `999 → "999"` PASS. Function at line 822. PASS.

---

### Defects Found

**MINOR — `d5` animation class undefined.**
Chart section cards use class `au d5` (lines 940-944) but only `d0`-`d4` delay classes are defined in CSS (lines 177-181). `d5` falls through to no delay — all four chart cards animate in simultaneously with no stagger. This is cosmetic only; the spec marks entrance animations as "optional (not an AC)" and the cards still appear. No functional impact. Severity: cosmetic.

---

### Items Untestable Headless

- Actual chart canvas rendering (Chart.js draws to `<canvas>`; needs a browser with a rendering context).
- Live filter click interaction (requires a real DOM + IDB populated with turns data).
- `Intl.DateTimeFormat` TZ abbreviation output for user's configured timezone (output depends on OS locale and the saved `_cfg.timezone` value).
- Doughnut center overlay positioning (absolute CSS; visual verification only).

---

### Summary

All 5 ROADMAP acceptance criteria pass. All 123 automated assertions pass including the full Phase 2 filter/aggregation suite. The critical AC#1 isolation check passes cleanly: the filter handler is a single-line call to `renderFilteredSections()` with no path to re-rendering Start Check, Mini Stats, or Forecast. Chart.js CDN guards, chart-destroy-before-recreate, heatmap dow/hour mapping, and all required spec strings are correctly implemented. One cosmetic defect: the `d5` CSS animation delay class is missing, causing chart cards to animate without stagger. Not an AC violation.

QA: PASS
