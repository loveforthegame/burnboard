# QA Report — Phase 3: insights-and-sessions

Date: 2026-06-28
Criteria source: `ROADMAP.md` Phase 3 acceptance criteria + `.pipeline/spec.md` (detailed triggers, thresholds, field specs)

---

## Test Run

`node burnboard.test.js` — **192 tests: 192 passed, 0 failed**

All 192 assertions pass cleanly with no errors or warnings.

---

## Results

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Each of the four insight triggers fires on data matching its condition and stays silent otherwise; when none fire the single green "nothing alarming" card shows. | PASS | All four triggers verified by 20+ test assertions (`computeInsights — Spiral`, `Cache Alert`, `Peak Penalty`, `Opus Waste` suites). Green fallback: `if (insights.length === 0)` renders `card-green` with verbatim copy `nothing alarming — using claude code efficiently.` (`burnboard.html:1546–1549`). |
| 2 | When more than three insights qualify, only three render in danger > warning > info priority order. | PASS | `PRIO = { danger:0, warning:1, info:2 }`, `fired.sort(...)` ascending on PRIO, `return fired.slice(0,3)` (`burnboard.html:964–966`). Test `when >3 fire, exactly 3 returned in danger>warning>info order` passes. |
| 3 | Each insight card has the correct severity color and a working copy button that shows "copied!" then reverts after 1500ms. | PASS (logic); CANNOT-VERIFY-HEADLESS (DOM) | Severity classes: `danger→card-red`, `warning→card-amber`, `info→card-orange` (`burnboard.html:1542`). `copyText()` at lines 1529–1537: `navigator.clipboard.writeText` then `btn.textContent = 'copied!'` + `.copied` class, `setTimeout(() => restore, 1500)`. CSS `.btn-copy.copied` applies green bg/color (`burnboard.html:209`). 1500ms revert verified by source; live DOM interaction untestable headless. |
| 4 | Sessions table lists recent sessions with project, relative when, duration, short model name, turns, and formatted tokens; clicking a row expands per-turn detail and collapses the previously open row. | PASS (logic); CANNOT-VERIFY-HEADLESS (click) | Columns `Project · When · Duration · Model · Turns · Tokens · ›` at `burnboard.html:1611`. `relWhen`, `fmtSessionDur`, model family all tested. One-open-at-a-time via `_openSession` module var + delegated handler at `burnboard.html:1902–1929`: closes previous on different-row click, second click on same row closes it (`_openSession = null`). |
| 5 | Expanded rows show the context-growth mini-bar and mark turns whose input exceeds 3× turn 1 as "heavy context". | PASS (logic); CANNOT-VERIFY-HEADLESS (render) | Context bar: `barPct = Math.round(cumulative / totalCumul * 100)`, last turn = 100% (`burnboard.html:1629`). Heavy-context: `firstInput > 0 && t.input_tokens > 3 * firstInput` → `.heavy-context` row class + `.heavy-label` span (`burnboard.html:1631–1633`). Tests: strict `>`, exactly 3× not flagged, `turn1=0` guard, all pass. |
| 6 | Cost-by-model and Summary tables compute from filtered data and show the API-pricing-equivalent note. | PASS | `renderSessions` and `renderCostSummary` called only from `renderFilteredSections()` (`burnboard.html:1241–1243`). Filter click handler calls only `renderFilteredSections()`, never `renderDashboard()` (`burnboard.html:1941`). Pricing matches §16 exactly. Note verbatim: `api pricing equivalent — not what you paid. you're on a flat subscription.` (`burnboard.html:1688`). Summary kv rows match spec: Sessions, Turns, Input tokens, Output tokens, Cache reads, API equiv. |

---

## Insight Trigger Threshold Verification

| Trigger | Condition | Threshold check | Status |
|---------|-----------|-----------------|--------|
| Session Spiral | `turns.length <= 5 → skip` | `>5` strict per spec | PASS |
| Session Spiral | `avgLate / avgEarly > 3.0` | strict `>`, 3.0 exactly silent | PASS |
| Session Spiral | `spiralCount >= 3` | fires at 3+ | PASS |
| Cache DANGER | `rateNow < 0.10 && ratePrev > 0.25 && totalTokNow > 50000` | all strict | PASS |
| Cache WARNING | `rateNow < 0.15 && totalTokNow > 100000` | `else if` (DANGER suppresses) | PASS |
| DANGER suppresses WARNING | `else if` branch | one card max | PASS |
| Peak Penalty | `peakPct > 0.50` | strict `>`, exactly 0.50 silent | PASS |
| Opus Waste | `turns.length >= 4 → skip` | `<4` strict | PASS |
| Opus Waste | `opusWasteCount >= 5` | fires at 5+, silent at 4 | PASS |

---

## Cost Math Verification (§16 Pricing)

| Model | Input $/1M | Output $/1M | Verified |
|-------|-----------|------------|---------|
| opus | $15.00 | $75.00 | PASS — 1M+1M = $90 |
| sonnet | $3.00 | $15.00 | PASS — 1M+1M = $18 |
| haiku | $0.25 | $1.25 | PASS — 1M+1M = $1.50 |
| other/unknown | N/A | N/A | PASS — $0.00, zero-cost tested |

Heavy-context `>3×`: `firstInput > 0 && t.input_tokens > 3 * firstInput` — strict, correct.

---

## Filter-Scope Split Verification (dump 7.4)

| Section | Path | Filter affects? | Verified |
|---------|------|----------------|---------|
| Insights | `loadDataLocal()` → `computeInsights(allTurns, now)` → `renderDashboard()` | NO | PASS — receives all unfiltered turns, not in `loadFilteredData` |
| Sessions table | `loadFilteredData()` → `buildSessions(filteredTurns)` → `renderFilteredSections()` | YES | PASS — `renderSessions` only in `renderFilteredSections()` |
| Cost + Summary | `loadFilteredData()` → `renderFilteredSections()` | YES | PASS — `renderCostSummary` only in `renderFilteredSections()` |
| Filter click handler | calls `renderFilteredSections()` only | — | PASS — `burnboard.html:1941`, no `renderDashboard()` call |

---

## `d` Fields Verification

| Field | Location | Status |
|-------|----------|--------|
| `d.insights` | `loadDataLocal()` line 1019 | PASS |
| `fd.recent_sessions` | `loadFilteredData()` — filtered turns via `buildSessions`, sorted desc, sliced 20 | PASS |
| `fd.turns_by_session` | `loadFilteredData()` — top-20 only, 5 fields, ascending sort | PASS |
| `fd.cost_by_model` | `loadFilteredData()` — per-family, >0 tokens only, opus/sonnet/haiku/unknown order | PASS |
| `fd.summary` | `loadFilteredData()` — distinct sessions, turn count, field sums, cost sum | PASS |
| `fd.total_api_cost_usd` | `loadFilteredData()` — mirrors `summary.total_api_cost_usd` | PASS |

---

## Observations

**Minor deviation (not a defect):** The expanded turn-detail table renders 6 columns (`Time · Input · Output · Cache read · Tool used · Context`) where the spec lists 5. The 6th is a header for the context-growth mini-bar. The bar itself is correctly implemented per spec; the spec says the bar appears per row but does not specify a column header for it. This does not break criterion 5.

**Ponytail notes carried correctly:** All `ponytail:` comments are present where the spec required them — spiral boundary ambiguity, clipboard Chrome-only, `buildSessions` vs sessions store, cache token pricing omission, session-max-cumulative interpretation.

---

## Items Not Testable Without a Browser

1. Copy button 1500ms revert — `setTimeout(..., 1500)` confirmed in source; actual clipboard write and UI revert requires browser.
2. One-row-open-at-a-time interaction — `_openSession` logic verified correct by source; click events require browser.
3. Insights not re-rendering on filter change — source confirms `renderInsights` is absent from `renderFilteredSections`; observable only in browser.
4. Stagger entrance animations on insight cards — `.au .d1/.d2/.d3` CSS confirmed present.
5. Row hover styles on sessions table — CSS confirmed present (`burnboard.html:218`).

---

## Summary

All 6 ROADMAP Phase 3 acceptance criteria pass. All 192 automated tests pass with 0 failures. The four insight triggers implement their spec thresholds exactly (all strict-comparison boundaries confirmed by dedicated test cases). Priority/max-3 selection is correct, DANGER suppresses WARNING via `else if`, and the filter-scope split (insights on unfiltered path, sessions+cost on filtered path) is correctly wired at both the data and render layers. Cost math matches §16 pricing. No defects found.

**QA: PASS**
