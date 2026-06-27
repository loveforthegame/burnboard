# Review — Phase 1: connect-and-core-dashboard

Reviewed: burnboard.html (1078 lines), burnboard.test.js (534 lines), against spec.md, changes.md, test-results.md, dump.md, and the project CLAUDE.md hard rules. Git diff vs base 278bfe7 adds only 4 files (burnboard.html, burnboard.test.js, .pipeline/spec.md, .pipeline/changes.md). No files touched outside the feature surface.

## Step 2 — Hard rules checklist

### Rule 1: "Never invent a state, field, name, or requirement not in spec docs"
PASS.
- Every Start Check state (good, caution_peak, caution_budget, danger, weekend, no_data) traces to dump.md 7.1 table (lines 314-319) and spec.md section 6.1.
- All copy strings verified verbatim against dump.md: tagline, trust strip, steps, CTA, compat warning (5.2); sync phase strings + privacy note (5.4); all 6 Start Check headline/body pairs (dump 314-319); 3 mini-stat tooltips (dump 340-361, transcribed with dump's own capitalization); forecast sentences and disclaimer (dump 470-482).
- IDB store names, keyPaths, indexes match dump 13.1 exactly (kv/turns/sessions/windows/monthly_cache; by_session/by_timestamp/by_month/by_account, etc.).
- Turn/Session/Window record fields match dump 13.2/13.3/13.4.
- Config field billing_start (burnboard.html lines 457/467/1008) — NOTE: dump 13.6 (line 937) names this billing_start_day, while dump 15.1 (line 1004) names it billing_start. dump.md is internally inconsistent; the coder picked the name dump uses in the dashboard data object. Not an invention (both names appear in dump). billing is not consumed by any Phase 1 computation, so behavior is unaffected. Flagged as a minor doc-consistency item, not a violation.

### Rule 2: "Mark intentional simplifications with a ponytail: comment"
PASS.
- dedup guard: line 423-424 and 666-669 (delete-before-insert).
- windows full recompute: line 681-683.
- djb2 non-crypto hash: line 491.
- today_vs_avg UTC choice: line 765.
- tips button inert: line 246.
- non-dashboard panels placeholder: line 253.
- Phase 6 Reconnect fallback: line 1071-1072.
All shortcuts that spec.md required a ponytail note for are present, several naming the upgrade path.

## Step 3 — Success metrics / acceptance

- Single self-contained file, no build step, no new runtime deps: PASS (one HTML file; only external refs are Google Fonts via <link>, allowed by spec section "File").
- Numbers render in JetBrains Mono: PASS. .mono / window-val / stat-value use JetBrains Mono; every interpolated number (window remaining, started Nm ago, weekly cap %, today-vs-avg x, opus/sonnet %, hours used, est. hours, days-until-reset, forecast remaining %) is wrapped in class="mono" or a mono element.
- Copy verbatim / lowercase: PASS (verified above).
- Re-sync dedup decision implemented as resolved in spec: PASS. dbDeleteTurnsBySession walks the by_session index cursor and deletes each entry in a single readwrite tx (line 425-437); the sync loop deletes-then-batch-inserts per touched session (line 671-676); sessions use put overwrite via keyPath; windows are fully recomputed from all stored turns each sync and put (deterministic window_id) (line 681-686).
- Boot reconnect from saved handle: PASS (boot() queries permission; granted -> runSync; else -> Connect fallback with ponytail note).
- Scope guard: PASS. No charts/heatmap/insights/filter bar/sessions table/history/tips/what's-coming/two-account/reconnect screen/recomputeMonthlyCache/getWeeklyBuckets/toasts/favicon/pricing constants. The non-dashboard tab panels are empty placeholders; the tips button is inert. Grep for forbidden terms returns only Array.filter usages and the ponytail comment naming the deferred Reconnect.

## Step 4 — Code quality

- State machine ordering (no_data -> weekend -> peak/off-peak) matches spec 6.1 and is mirrored in both the inline self-check and burnboard.test.js. Strict > boundaries (80/85, 70/75) implemented correctly and boundary-tested.
- Peak hours = weekday UTC hour 13-18 inclusive (19:00 off-peak). This matches spec.md's resolution of the dump.md inconsistency (dump line 309 says 13-19, line 508 says 13-18). Implementation follows the spec decision; off-peak [local time] correctly computed as 19:00 UTC.
- Current-window selection: filter (now - start) < WIN_MS, sort desc by window_start, take first — matches spec 15.3.
- Weekly cap, today_vs_avg (denominator fixed 30), forecast projection with fracElapsed clamp(0.01,1) — all match spec formulas and are unit-tested.
- Tests are meaningful, not happy-path-only: they cover the risky paths the coder flagged — the dedup double-count (proves the guard is load-bearing), window gap boundary at exactly 5h vs 5h+1s, cross-session windows, state-machine strict boundaries, fracElapsed clamp preventing Infinity, and dominant-model-by-volume. 82 assertions, structured around the documented risks.
- One acknowledged limitation (not a blocker, single-user scope): incremental dedup keys on session_id and assumes one .jsonl per session (true for Claude Code). The dbDeleteTurnsBySession cursor is browser-only and could not run under Node; the tester proved the computation side instead, which is a reasonable substitute given the constraint.

No security, correctness, or data-integrity issues found. The dedup guard correctly prevents the token double-counting that was the primary data-integrity risk.

## Minor (non-blocking) follow-ups
- dump.md 13.6 vs 15.1 disagree on billing_start_day vs billing_start. Implementation uses billing_start. Harmless in Phase 1 (unused), but reconcile before Phase 3/8 builds the billing cycle view so the persisted key matches whatever that phase reads.

VERDICT: SHIP
