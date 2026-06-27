# Review — Phase 5+6 (re-review after fixes)

Prior verdict: NEEDS WORK (1 required: mono hard-rule on tips badges/subtext; 2 non-blocking notes).
This pass confirms the fixes and checks for regressions only. Everything else was clean in the prior pass.

## Required fix — mono hard rule (Phase 3 pattern: numbers in `.mono`)

PASS. All four dynamic numbers in the tips personalisation path are now wrapped in `<span class="mono">`:

- burnboard.html:2142 — tip1: `your data: output ratio is <span class="mono">${ratio.toFixed(1)}×</span>`
- burnboard.html:2162 — tip2: `your data: <span class="mono">${spiralCount}</span> sessions spiraled this week`
- burnboard.html:2172 — tip5: `your data: <span class="mono">${opusWaste}</span> short opus sessions`
- burnboard.html:2801 — renderTips subtext: `<span class="mono">${7 - activeDays}</span> more active ${...} to personalise tips`

This now matches the established convention used everywhere else in the file (doughnut-center, table cells, stat-values, forecast sentence, etc.).

## Test copy parity

PASS. The verbatim `tipPersonalization` copy in burnboard.test.js (lines 2608/2627/2636) is byte-identical to the implementation, including the new mono spans. Assertions are substring-based and all target substrings survive the wrap:
- test:2692 `r[1].includes('3.0')` — string contains `3.0×` inside the span. OK.
- test:2964 `r[2].includes('sessions spiraled')` — text after the span. OK.
- test:2727 `r[5].includes('short opus sessions')` — text after the span. OK.
Test suite reported 288/288 pass (test-results.md:7).

## Non-blocking note 1 — restored billing comment

PASS. `// ORIGINATED: billing empty state` is present at burnboard.html:2553 in renderBillingView.

## Non-blocking note 2 — `_monthlyCacheStale` not reset on later recompute

Acknowledged as an intentional simplification documented in its ponytail comment. Left as-is by design. Not a hard-rule violation. No action required.

## Regression scan

PASS. Changes are confined to the four mono spans plus the one restored comment. No new fields, states, or logic introduced. Number values, gates, and tip-firing conditions are unchanged (the spans wrap the same expressions). No new network calls in the what's-coming/tips path.

## Hard rules

- "Never invent a state, field, name, or requirement not in spec docs" — PASS. No new identifiers; edits are presentational (mono wrap) plus a restored comment.
- "Mark intentional simplifications with a ponytail: comment" — PASS. The `_monthlyCacheStale` simplification carries its ponytail; no new un-annotated shortcuts added.

## Acceptance

All Phase 5+6 acceptance items confirmed present in the prior pass; this re-review found no regressions. Both hard rules pass, no stale ponytails, what's-coming has no network calls.

VERDICT: SHIP
