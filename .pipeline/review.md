# Reviewer Verdict — Phase 2: filtered-charts

Branch: ship/20260627-202600-phase-2-filtered-charts
Base: f03c309e199c58867ba1f8537cb612732349c2b1 (Phase 1 merged)
Files reviewed: burnboard.html, burnboard.test.js
Diff: burnboard.html +463/-1, burnboard.test.js +402/-0. The single deletion is the
intended renderDashboard wire-up line (replaced with the appended filter bar + charts shell).
No Phase 1 function bodies appear in the diff.

---

## Step 2 — Hard rules (pass/fail)

### Rule 1: "Never invent a state, field, name, or requirement not in spec docs"
PASS.
- _filter = { range:'30d', model:'all' } — matches spec line 45 / dump 7.4 defaults. (html:816)
- d fields built are EXACTLY daily_usage, heatmap, model_breakdown, top_projects, days_with_data
  (html:910) — the four spec-pinned fields plus the day-count gate. No Phase-3 fields
  (insights / recent_sessions / cost_by_model / summary) introduced.
- Filter options are exactly 7d/30d/90d/all and all/opus/sonnet/haiku (html:918-919). No extras.
- All visible copy traces to dump: daily burn rate, when you work, amber = peak hours,
  model breakdown, top projects, no usage in this range, add more data to see your patterns,
  filter labels range/model — all lowercase, verbatim (html:961,1040,1116,1174,963/1119/1177,1043,928/933).
- The only ORIGINATED values (segment hexes, log-intensity formula) carry ponytail comments — Rule 2.

### Rule 2: "Mark intentional simplifications with a ponytail: comment" (ceiling + upgrade path)
PASS.
- Log-intensity formula: ponytail at html:1076-1079 names ceiling (log base relative to range max)
  AND upgrade path (quantile bucketing). Formula verbatim: Math.log(1+tokens)/Math.log(1+maxTok) (html:1081).
- Doughnut hex tints: ponytail at html:1112-1113 names upgrade path (swap if brand palette defined).
  Hexes match spec exactly: opus #A78BFA, sonnet #38BDF8, haiku #2DD4BF, unknown #4A4440 (html:1114).
- CDN pin ponytail in spec; CDN tag added at html:11 (after fonts, before style) with if(window.Chart)
  guard on every init. Rounded-pcts ponytail html:884-885. TZ short-name ponytail html:1028.
  fmtTokens/font-family ponytail html:821.

Both hard rules PASS. No BLOCK on hard rules.

---

## Step 3 — Acceptance criteria (from ROADMAP/spec)

AC#1 (critical) — filter changes leave Start Check / Mini Stats / Forecast untouched: PASS.
  Delegated handler (html:1437-1447) updates _filter, toggles .sel within the clicked group only,
  and calls await renderFilteredSections() ONLY. The string renderDashboard does not appear in the
  handler. renderFilteredSections (html:948-954) calls only the four Phase-2 renderers. Start Check /
  Mini Stats / Forecast are never re-invoked on filter change.

AC#2 — daily burn bars per day, today highlighted, empty state: PASS.
  Bars #F97316, today bar #FB923C (html:974), tooltip title appends today (html:991), empty state
  shows exact copy no usage in this range and does NOT init a chart (html:962-966).

AC#3 — heatmap 7x24, intensity color, weekday peak tint, local-TZ note, under-3-days gate: PASS.
  Gate fires first when days_with_data < 3 with exact copy (html:1042-1046). Grid 7 rows (Mon-Sun) x
  24 cols. rowIndex->dow mapping dow=(rowIndex+1)%7 (html:1069) is the correct inverse of spec's
  rowIndex=(dow+6)%7: rowIndex0->dow1 (Mon), rowIndex6->dow0 (Sun) — verified. Peak tint on weekday
  rows 0-4, hours 13-18, layered over amber (html:1091-1097). Local-TZ note via Intl.DateTimeFormat
  from _cfg.timezone, lowercased, not hard-coded IST (html:1024-1038,1103).

AC#4 — doughnut opus/sonnet/haiku/unknown + center total + legend; top projects up to 8: PASS.
  Order opus,sonnet,haiku,unknown; 0-token families excluded (html:886-892). Center total mono
  overlay (html:1128). Custom legend, built-in legend disabled (html:1131-1138,1157). top_projects
  sorted desc, sliced to 8 (html:903-906).

AC#5 — all four respect active filter: PASS. All four read from the single loadFilteredData(fd).

---

## Step 4 — Code quality

Scope guard: PASS. Scanned additions for every banned later-phase feature (insights, sessions table,
cost/summary, history/monthly_cache/billing/export, two-account, tips, what's-coming, reconnect,
toasts/favicon). None present.

Chart.js CDN + guards: PASS. CDN tag html:11. Every Chart init guarded by if(window.Chart)
(html:967,1122,1180). A CDN miss leaves the Phase-1 dashboard intact; canvases simply stay blank.

Destroy-before-recreate: PASS. _dailyChart/_modelChart/_projChart each .destroy()'d and nulled
before new Chart(...) (html:969,1140,1182). No canvas-reuse leak on re-filter.

Surgical changes: PASS. Only existing-code edit is the renderDashboard wire-up (html:1243-1246).
loadDataLocal / renderStartCheck / renderMiniStats / renderForecast / modelFamily / dbGetAll /
IDB layer untouched — confirmed by diff (no Phase-1 function signatures in the diff).

Numbers in JetBrains Mono: PASS. Canvas ticks/tooltips set font.family 'JetBrains Mono'; HTML legend
values and doughnut center wrapped in .mono (html:1128,1135).

Tests meaningful: PASS. The 23 new assertions hit the risky paths the Coder flagged — range cutoffs
at exact boundaries (8/2, 31/29, 91/89 days), model filter incl. haiku, session dedup, asc/desc
sorts, 8-slice boundary, days_with_data gate (2/3/filter-reduced), empty-set division-by-zero,
single-family 100%. Not happy-path-only.

Dead/irrelevant code: none found. Implementation is tight.

Notes (non-blocking):
- burnboard.test.js re-implements loadFilteredData as a pure computeFilteredData mirror (html:828 vs
  test:538) because IDB cannot run in Node. Confirmed the two are logic-identical line-for-line. This
  is the established Phase-1 pattern; carries the usual drift risk if loadFilteredData later changes.
- .filter-label uses font-weight:700/letter-spacing for a section-label look; spec said muted
  (color:var(--mu) satisfies that). Minor styling, within convention, not a divergence.
- Could not execute node burnboard.test.js (reviewer Bash is read-only). Relying on the Tester's
  reported 123/123 plus a full static read of every new assertion.

---

VERDICT: SHIP
