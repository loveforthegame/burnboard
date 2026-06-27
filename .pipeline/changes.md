# Phase 2 — filtered-charts — changes

## Files changed

### `burnboard.html`
- Added Chart.js v4 CDN `<script>` tag in `<head>` (after Google Fonts link, before `<style>`).
- Added Phase 2 CSS rules: `.btn-secondary.sel`, `.filter-bar`, `.charts-grid`, `.chart-container-tall`, `.chart-empty`, `.doughnut-wrap`, `.doughnut-center`, `.chart-legend`, `.legend-row`, `.legend-swatch`, `.heatmap-*` classes.
- Added module-level `_filter` state, chart handles (`_dailyChart`, `_modelChart`, `_projChart`), and `fmtTokens()`.
- Added `loadFilteredData()` — reads all turns from IDB, applies range + model filters, returns `daily_usage`, `heatmap`, `model_breakdown`, `top_projects`, `days_with_data`.
- Added `renderFilterBar()`, `renderChartsShell()` — static HTML builders.
- Added `renderFilteredSections()` — calls `loadFilteredData()` then delegates to four render functions.
- Added `renderDailyBurn()`, `renderHeatmap()`, `renderModelBreakdown()`, `renderTopProjects()` — each destroys prior Chart instance before creating a new one.
- Extended `renderDashboard()` to append filter bar + chart shell containers, then `await renderFilteredSections()`. Phase 1 `renderStartCheck / renderMiniStats / renderForecast` lines are untouched.
- Added delegated filter-bar click handler on `#dashboard-content` — updates `_filter`, toggles `.sel`, calls `renderFilteredSections()` only (never `renderDashboard()`).

### `burnboard.test.js`
- Added `computeFilteredData()` (pure extraction of `loadFilteredData()` logic with turns array instead of IDB call).
- Added `daysAgo()` helper for time-relative turn fixtures.
- Added 18 Phase 2 assertions covering: 7d/all range cutoff, model filter, daily_usage bucketing + session dedup, daily_usage ascending sort, top_projects desc sort + 8-slice, top_projects session count, empty-cwd → "unknown", days_with_data count, model_breakdown unknown mapping + order + pct sum, heatmap day/hour bucketing + cell token summation.
- Total: 100 tests, 100 pass.

## Riskiest / least-obvious parts for the Tester

1. **Filter bar click handler scoping (AC#1).** The handler is attached to `#dashboard-content` via event delegation. It must update `_filter` and call `renderFilteredSections()` ONLY. If the handler accidentally called `renderDashboard()`, Start Check / Mini Stats / Forecast would re-render and flicker. Verify by clicking a filter pill and confirming the phase-1 sections do not re-render or lose state.

2. **Chart destroy-before-recreate on re-filter.** Each render function calls `.destroy()` on the module-level handle before `new Chart(...)`. If the canvas element is swapped (innerHTML reset before the canvas is referenced), the old Chart instance still holds a reference to the now-detached canvas — the destroy call is safe (Chart.js handles detached canvases), but the new chart must target the freshly inserted canvas. Tester should rapid-click filter pills and confirm no "Canvas is already in use" console error appears.

3. **Heatmap `rowIndex → dow` mapping.** `rowIndex = 0` is Mon; JS `getUTCDay()` returns `0=Sun..6=Sat`. The conversion is `dow = (rowIndex + 1) % 7`. A bug here shifts every row label one position and makes the peak-column tint (hours 13-18, weekday rows 0-4) misalign with actual weekday data. Verify Mon-Sun labels match actual token density visually with real data.

4. **Heatmap under-3-days gate.** If `days_with_data < 3`, the grid is skipped entirely and only the "add more data" message renders. With exactly 3 days the grid must appear. Edge case: if the user has data but the filter reduces it below 3 days, the gate must still fire.

5. **TZ peak-note computation.** The note derives `tzAbbr` via `Intl.DateTimeFormat.formatToParts` with a fixed reference date (`2026-01-05`). For timezones that observe DST, January may give a different abbrev than summer. The spec says to use `_cfg.timezone` and derive real values — do NOT hard-code IST. Verify with a non-IST timezone in settings.
