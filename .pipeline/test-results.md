# test-results — Phase 5+6

## Run

```
node burnboard.test.js
288 tests: 288 passed, 0 failed
```

Prior count: 267 (confirmed passing before changes). Added 21 new assertions.

## What was exercised

### Confirmed baseline (267 prior assertions, all pass)
All prior Phase 1-4 tests continue to pass unchanged.

### Phase 5+6 — extended boundary coverage (21 new assertions)

**Primary-in-combined-not-Alt invariant (5 tests)**
- A turn labeled `'Primary'` is included in combined aggregation (all-turns path) and in Primary-filtered aggregation; the Alt-filtered set is empty for a Primary turn.
- A `'combined'`-labeled turn (Both/Unsure sync) is included in combined (all-turns path) but returns 0 results from both `'Primary'` and `'Alt'` exact-match filters.
- When Primary + Alt + combined-labeled turns coexist, `combined.total_tokens > primaryOnly + altOnly` — the Both/Unsure tokens inflate only the combined total.

**recomputeMonthlyCache label resolution (4 tests)**
- Single-account mode (`account_2_name` empty) → labels array = `['combined']`.
- Two-account mode → labels = `[acct1, acct2, 'combined']` using real configured names.
- `account_1_name` empty in two-account mode → first label falls back to `'Primary'`.
- `account_2_name` with leading/trailing spaces → trimmed in the label list.

**tipPersonalization 7-day boundary (3 tests)**
- Exactly 7 active days → gate passes (`activeDays.size === 7`; condition is strict `< 7`); tip 1 fires when ratio > 2.0.
- Exactly 6 active days → gate fails; all tips generic regardless of ratio.
- Exactly 7 active days with 3 spiral sessions → tip 2 fires.

**toast priority selection (4 tests)**
- `skippedLines > 0` → skipped toast, regardless of `totalTurns` value.
- `skippedLines === 0 AND totalTurns === 0` → caught-up toast.
- `skippedLines === 0 AND totalTurns > 0` → no toast (null).
- Both conditions true (`skippedLines > 0 AND totalTurns === 0`) → skipped wins; caught-up is not returned.

**promptAccount dismiss → Primary default (5 tests)**
- `undefined` arg + configured `account_1_name` → resolves to `account_1_name`.
- `undefined` arg + empty `account_1_name` → resolves to literal `'Primary'`.
- `undefined` arg + null cfg → resolves to `'Primary'`.
- Explicit label passed → used as-is (fallback not applied).
- `'combined'` label passed → used as-is.

### DOM/browser-only items (CANNOT-VERIFY-HEADLESS, confirmed by static inspection)

Items 1-20 from the prior CANNOT-VERIFY-HEADLESS block are unchanged. New items:

21. **Dashboard always combined** — `loadDataLocal()` reads all turns via `dbGetAll('turns')` with no `account_label` filter. `_historyAccount` is never referenced inside `loadDataLocal`. Start Check / Forecast / Mini Stats use this unfiltered path. Confirmed by grep.
22. **Selector + combined card gated on twoAccountMode** — `renderHistory()` checks `twoAccountMode()` before rendering selector pills and combined-totals card HTML. When `account_2_name` is empty, both are skipped entirely. Confirmed by source inspection.
23. **Account 2 cleared → single-account view** — `twoAccountMode()` reads `_cfg.account_2_name` live on each call. Clearing it causes the next render to skip all two-account UI with no migration needed. Confirmed by source inspection.
24. **promptAccount dismiss → Primary** — backdrop click and Esc key both call `dismiss()` which resolves with `_cfg.account_1_name || 'Primary'`. The pure fallback chain is exercised by the new Node-runnable tests above.

STATUS: PASS