# QA Report — Phases 5 + 6: two-account-tracking + tips-tab-and-final-polish
Date: 2026-06-28
Criteria source: `ROADMAP.md` Phase 5 and Phase 6 acceptance checklists; combined spec at `.pipeline/spec.md`

---

## Test Suite

`node burnboard.test.js` — **288 tests: 288 passed, 0 failed**

All test groups covered:
- twoAccountMode (4 tests)
- filterTurnsByAccount (5 tests)
- per-account monthly aggregation (3 tests)
- countMalformed (4 tests)
- faviconColorForState (7 tests)
- tipPersonalization (6 tests)
- Phase 5+6 extended boundary coverage (13 tests)
- toast priority selection (4 tests)
- promptAccount dismiss behavior (5 tests)
- All Phase 1-4 groups (237 tests)

---

## Phase 5 — two-account-tracking

### Results

| Criterion | Status | Evidence |
|-----------|--------|----------|
| With Account 2 empty, no account UI appears anywhere (single-account users see nothing new). | PASS | `twoAccountMode()` (line 2081) gates all account UI — sync prompt, account selector, combined card. Empty or whitespace `account_2_name` returns false. Verified by SC23/SC24 self-checks and 4 test cases. |
| With Account 2 named, clicking sync shows the account prompt; the chosen label is written to every turn from that sync, and "Both / Unsure" tags as "combined". | PASS (logic) / CANNOT-VERIFY-HEADLESS (modal click) | `pickFolder()` (line 3179) and `runResync()` (line 3168) call `promptAccount()` when `twoAccountMode()`. Modal has three buttons: acct1 name, acct2 name, `Both / Unsure` which resolves `'combined'` (line 2693). Label passed to `runSync(dh, label)` and written to `account_label` on every turn at line 867. |
| History tab shows the account selector (All / Primary / Alt) and filters all history views to the selection. | PASS | Account selector rendered in `renderHistory()` (line 2237) gated on `twoAccountMode()`. Uses real configured names, not hardcoded labels. `_historyAccount` drives `cacheLabel` in monthly (line 2306), `filterTurnsByAccount` in weekly (line 2456) and billing (line 2548). Delegated listener at line 2212 handles `[data-haccount]` clicks. |
| The combined-totals card shows per-account and combined tokens/sessions. | PASS | `renderHistory()` renders combined-totals card (lines 2254-2288) with three columns: acct1, acct2, Combined. Token and session values wrapped in `<span class="mono">`. Sourced from `monthly_cache` via `sumCache()` per label. |
| Dashboard tab (Start Check, Forecast, Mini Stats) keeps using all data regardless of account label. | PASS | `loadDataLocal()` (line 1153) calls `dbGetAll('turns')` with no account filter. No account-filtering code exists in the dashboard render path. Confirmed unchanged. |
| Clearing Account 2 reverts the UI to single-account view without losing already-tagged turns. | PASS | `saveSettings()` (line 3148) stores `account_2_name: ''`. On next render, `twoAccountMode()` returns false — account selector and combined card are hidden. No IDB data is wiped. Already-tagged turns remain untouched. |

---

## Phase 6 — tips-tab-and-final-polish

### Results

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Token Tips tab shows all six cards with saving-badge pills and working copy buttons; personalisation badges replace generic text once 7+ days of data exist. | PASS | Six cards in `TIPS` const (lines 2742-2788) with verbatim titles and saving badges. `renderTips()` (line 2791) passes `tipPersonalization()` results to each card; when personalised, badge text replaces the generic saving. Copy buttons use `copyText()` (line 1707) with 1500ms revert. Card stagger: `animation-delay:${i * 60}ms`. |
| After a browser restart with a saved handle but revoked permission, the Reconnect screen appears and its CTA reconnects in one click without a new picker; the skip link loads the dashboard from IDB. | PASS (logic) / CANNOT-VERIFY-HEADLESS (requires revoked permission in browser) | Boot path (line 3215-3218): when `perm !== 'granted'` and `dh` exists, `showScreen('reconnect')` is called. `reconnectFolder()` (line 2704) calls `dh.requestPermission({ mode:'read' })` with no `showDirectoryPicker()` call. `skipReconnect()` (line 2718) calls `renderDashboard(); showScreen('app')`. Verbatim copy on reconnect screen matches spec exactly. |
| What's Coming tab renders the static teaser with feature pills and email-capture UI (no network calls). | PASS | `renderWhatsComing()` (line 2831) is pure DOM injection, no async. `wcSubmit()` (line 2857) only hides input/button and shows thanks text. Three feature pills present. Grep for fetch/XHR/WebSocket/sendBeacon returns zero results in `burnboard.html`. |
| Toasts fire for "all caught up ✓" (0 new turns) and malformed-line counts; favicon reflects the current Start Check state. | PASS (logic) / CANNOT-VERIFY-HEADLESS (visual display) | `runSync()` lines 924-929: skipped toast wins over caught-up when both conditions true (per spec priority). Malformed lines: `skipped <span class="mono">N</span> malformed lines`. `setFavicon(_lastCheckState)` at line 2880, called every `renderDashboard()`. All 6 states return correct hex colors. 7 favicon tests pass. |
| Firefox/Safari shows the amber browser-support bar with the folder button disabled; cancelling the picker is swallowed silently; mid-sync failure shows a retry and falls back to existing IDB data. | PASS (logic) / CANNOT-VERIFY-HEADLESS | Boot (3195-3203): `!window.showDirectoryPicker` disables `connect-btn`, adds `visible` to `#compat-warning`, shows skip link if turns exist. AbortError swallowed at line 3182. `runSync()` wrapped in try/catch (lines 818, 934-947): shows `#sync-error` and retry button on failure; calls `renderDashboard(); showScreen('app')` if saved turns exist. |
| With `prefers-reduced-motion` set, all entrance/stagger/counter animations are disabled. | PASS (CSS static) / CANNOT-VERIFY-HEADLESS | Single global block (lines 271-274): `@media (prefers-reduced-motion: reduce){ *,*::before,*::after{animation:none !important;transition:none !important} .au{opacity:1 !important} }`. Covers fadeUp, fadeDown, spin, toast, and all stagger delays. `.au` forced visible so elements are not left at `opacity:0`. |

---

## Additional Verification

### Account-label data flow

| Check | Status | Evidence |
|-------|--------|----------|
| Both/Unsure resolves to literal `'combined'` string on turns | PASS | `promptAccount()` line 2693 resolves `'combined'`. Written to `account_label` at line 867. |
| `'combined'`-tagged turns excluded from specific-label monthly cache | PASS | `recomputeMonthlyCache()` line 1946: exact-match filter `t.account_label === label` excludes `'combined'`-tagged turns from acct1/acct2 buckets. 3 test cases pass. |
| Dashboard uses all turns regardless of label | PASS | `loadDataLocal()` line 1153: `dbGetAll('turns')` with no filter. |
| `'all'` selector maps to combined cache / all turns | PASS | Monthly: `cacheLabel = _historyAccount === 'all' ? 'combined' : _historyAccount` (line 2306). Weekly/Billing: `filterTurnsByAccount(turns, 'all')` returns all turns (line 2090). |
| Account 2 cleared reverts without data loss | PASS | `twoAccountMode()` returns false, UI gates hide. IDB untouched. |

### Tips personalisation

| Check | Status | Evidence |
|-------|--------|----------|
| 7-day boundary: 6 active days forces generic | PASS | Line 2130: `if (activeDays.size < 7) return generic`. Test "exactly 6 active days: gate fails" passes. |
| 7-day boundary: 7 active days enables personalisation | PASS | Test "exactly 7 active days: gate passes (activeDays.size === 7, not < 7)" passes. |
| Numbers in `<span class="mono">` in personalised badges | PASS | Tip 1: `<span class="mono">${ratio.toFixed(1)}x</span>` (line 2142). Tip 2: `<span class="mono">${spiralCount}</span>` (line 2162). Tip 5: `<span class="mono">${opusWaste}</span>` (line 2172). |
| Tips 3, 4, 6 always generic (no signal in turn data) | PASS | `return { 1:tip1, 2:tip2, 3:null, 4:null, 5:tip5, 6:null }` (line 2174). Ponytail comment explains ceiling. Verified by test. |

### No network calls in What's Coming

| Check | Status | Evidence |
|-------|--------|----------|
| No fetch/XHR/WebSocket/sendBeacon | PASS | Grep across full file returns only IDB `.get()` (line 588), which is IndexedDB, not a network call. `wcSubmit()` is purely DOM manipulation. |

### Previously-inert items resolved

| Item | Status | Evidence |
|------|--------|----------|
| Tips header button (was `title="coming soon"`) | PASS | Line 399: `onclick="switchToTab('tips')"`. Comment at line 398: "RESOLVED Phase 6". |
| Boot revoked-permission branch (was Connect fallback) | PASS | Line 3217: `showScreen('reconnect')`. Comment: "RESOLVED Phase 6: permission revoked -> show Reconnect screen (not Connect)." |
| Per-account monthly cache (was single-label collapse) | PASS | Lines 1942-1953: loops `[acct1, acct2, 'combined']` in two-account mode. Comment line 1933: "RESOLVED Phase 5". |

### Tip card titles and saving badges (verbatim from spec)

| Card | Title | Badge | Status |
|------|-------|-------|--------|
| 1 | Tell Claude to talk less | 40-65% output | PASS |
| 2 | Use /compact in long sessions | 40-70% input | PASS |
| 3 | Ask for diffs, not full files | 50-80% on edits | PASS |
| 4 | Add a .claudeignore | 20-60% input | PASS |
| 5 | Use the right model | up to 80% on simple tasks | PASS |
| 6 | Trim your CLAUDE.md | 5-15% all input | PASS |

---

## Defects Found

None. No correctness defects identified.

---

## Items Genuinely Untestable Without a Browser

1. Visual rendering of the account prompt modal (backdrop, button labels, dismiss on Esc/backdrop click)
2. Visual rendering and auto-dismiss of toast messages
3. Favicon appearing in the browser tab
4. Reconnect screen (requires browser restart + revoked file handle permission)
5. `prefers-reduced-motion` media query effect (requires OS accessibility setting)
6. Firefox/Safari compat warning and disabled button state (requires those browsers)
7. AbortError from picker cancellation (requires user cancelling the native picker dialog)
8. Copy-to-clipboard 1500ms revert (requires `navigator.clipboard` in browser context)
9. Chart.js canvas rendering
10. Mid-sync failure flow (requires a runtime exception during sync)

All of these are wired correctly at the logic level. None are logic defects.

---

## ROADMAP Coverage Confirmation

All 6 Phase 5 acceptance items: IMPLEMENTED
All 6 Phase 6 acceptance items: IMPLEMENTED
No acceptance item across any of Phases 1-6 is left unimplemented.

---

## Summary

All 288 tests pass with 0 failures. Every Phase 5 and Phase 6 ROADMAP acceptance criterion is implemented and verified statically. The account-label data flow is correct throughout: the Primary-in-combined-not-Alt invariant holds via exact-match filtering in both the monthly cache loop and `filterTurnsByAccount()`; the dashboard is always unfiltered; clearing Account 2 reverts the UI without touching IDB data. Tips personalisation uses the correct strictly-greater-than-or-equal-to-7 active-day gate with `<span class="mono">` wrapping on all numeric badge values. What's Coming has zero network calls confirmed by grep. All three previously-inert items (tips header button, reconnect screen branch, per-account monthly cache) are resolved and marked as such in code comments. The 10 items listed as untestable without a browser are all correctly wired at the code and DOM levels.

QA: PASS
