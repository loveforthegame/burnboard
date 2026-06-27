# changes — phase 5+6 (two-account tracking + tips/polish)

## files changed

### burnboard.html
All changes are additive. Phase 1-4 code untouched except wiring points.

**CSS (before `</style>`):**
- Added `@media (prefers-reduced-motion)` global override block
- Added `#toast` + `#toast.show` styles
- Added `.modal-center` + `.modal-center.open` account prompt modal styles
- Added reconnect screen styles (`.reconnect-box`, `.reconnect-headline`, etc.)
- Added tips tab styles (`.tip-card`, `.tip-badge`, `.tip-body`, `.tip-code`, `.tip-copy-row`)
- Added what's-coming tab styles (`.wc-panel`, `.wc-hero`, `.wc-pills`, `.wc-email-*`)
- Added `#sync-error` display:none baseline
- Added account selector + combined card styles

**HTML:**
- Added `<link rel="icon" id="favicon">` in `<head>`
- Added `#connect-skip-wrap` div (hidden; shown when FSAPI unavailable + turns in IDB)
- Added connect hint `<p>` about re-syncing rebuilding history
- Added `#sync-error` div with retry button on sync screen
- Added `#reconnect-screen` (full screen; RESOLVED Phase 1 ponytail)
- Added `#toast` div
- Added `#account-backdrop` + `#account-modal` for account prompt
- Changed tips tab button `onclick` from inert to `switchToTab('tips')` (RESOLVED Phase 1 ponytail)

**JS - new module-level state:**
- `_historyAccount = 'all'`
- `_monthlyCacheStale = false`
- `_lastCheckState = 'no_data'`

**JS - new pure helpers (before `exportHistoryCsv`):**
- `twoAccountMode()` - returns bool; gates all two-account UI
- `filterTurnsByAccount(turns, label)` - PURE; `'all'` returns everything, else exact-match
- `countMalformed(lines)` - PURE test seam for `skippedLines` predicate
- `faviconColorForState(state)` - PURE; returns hex color for 6 states
- `setFavicon(state)` - sets `<link id="favicon">` to SVG data-URI dot
- `tipPersonalization(turns, now)` - PURE; keys 1-6; gates on >=7 active days; personalises tips 1, 2, 5

**JS - new functions (before RENDER section):**
- `showToast(msg)` - 3s auto-dismiss single toast
- `promptAccount()` - Promise<string> modal; dismiss resolves to Account-1 label
- `reconnectFolder()` - re-requests permission on stored handle; runs sync on grant
- `skipReconnect()` - loads dashboard from IDB without re-parsing
- `retrySync()` - clears sync-error, calls `runResync()`
- `switchToTab(name)` - clicks the named tab button
- `TIPS` constant - 6 tip cards with titles/badges/body/code/ponytails
- `renderTips()` - async; populates `#panel-tips`
- `renderWhatsComing()` - static; populates `#panel-whats-coming` once (cached via `data-rendered`)
- `wcSubmit()` - local-only email capture submit; no network call

**JS - wiring edits:**
- `runSync`: added `accountLabelArg` param; try/catch wrapper; dedup-relabel ponytail; toast calls; `_monthlyCacheStale = true` in monthly cache catch
- `recomputeMonthlyCache`: RESOLVED Phase 4 ponytail; now loops real labels in two-account mode
- `renderStartCheck`: stashes `_lastCheckState = state`
- `renderDashboard`: calls `setFavicon(_lastCheckState)` after innerHTML
- `showScreen`: added `reconnect:'reconnect-screen'` to map
- Tab listener: added `renderTips()` and `renderWhatsComing()` on tab switch
- `pickFolder`: calls `promptAccount()` before `runSync` when `twoAccountMode()`
- `runResync`: calls `promptAccount()` before `runSync` when `twoAccountMode()`
- `renderHistory`: now `async`; added account selector pills; added combined-totals card
- `renderMonthlyView`: filters by `_historyAccount` -> cache label; shows stale note
- `renderWeeklyView`: filters turns with `filterTurnsByAccount` before `getWeeklyBuckets`
- `renderBillingView`: filters turns with `filterTurnsByAccount` before `getBillingCycles`
- `exportHistoryCsv`: exports cache rows for selected account
- `boot()`: RESOLVED Phase 1 ponytail; permission revoked -> `showScreen('reconnect')`; FSAPI unavailable + turns exist -> shows skip link

**JS - self-check IIFE (SC17-SC26):**
- Added assertions for all 6 `faviconColorForState` states
- Added `twoAccountMode` assertions (empty/whitespace/non-empty)
- Added `tipPersonalization` empty-turns assertion

### burnboard.test.js
Added ~130 lines of new test sections (all before the summary):
- `twoAccountMode` - 4 tests
- `filterTurnsByAccount` - 5 tests
- per-account monthly aggregation - 3 tests
- `countMalformed` - 4 tests
- `faviconColorForState` - 7 tests (all 6 states + unknown default)
- `tipPersonalization` - 6 tests
- Added Phase 5+6 notes to CANNOT-VERIFY section (items 17-20)

Total tests: 267 (was 238; +29)

## what the tester should focus on

**Riskiest parts:**

1. `renderHistory` is now `async` and calls `dbGetAll` for the combined card. Combined card HTML depends on `_cfg.account_2_name.trim()` being non-empty. Test: enable account_2_name in settings and switch to history tab.

2. `runSync` try/catch wrapper - catch block loads IDB turns and auto-navigates to app if any exist. Confirm the `sync-error` div reappears on manual error injection. Confirm toast priority: skipped-lines > all-caught-up.

3. `recomputeMonthlyCache` label loop - in two-account mode writes 3 sets of cache rows. Verify that selecting "Alt" in the history account selector shows only rows with `account_label === 'Alt'` in monthly view.

4. `tipPersonalization` 7-day gate - uses UTC date strings (`timestamp.substring(0,10)`). Watch for timezone edge cases in browser.

5. `promptAccount()` dismiss path - backdrop click and Esc key both resolve to Account-1 label. Event listeners are cleaned up; verify no leak if user opens/dismisses multiple times.

6. `faviconColorForState` wiring - `_lastCheckState` set in `renderStartCheck` (sync, inside `renderDashboard`). `setFavicon` reads it after `innerHTML`. Order-sensitive: correct but fragile if renderStartCheck is ever made async.
