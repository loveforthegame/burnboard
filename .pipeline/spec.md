# Spec — Phases 5 + 6 (combined): two-account-tracking + tips-tab-and-final-polish

Single file: `C:\Users\ue\Desktop\abhinav pending projects\burnboard\burnboard.html`
Tests: `C:\Users\ue\Desktop\abhinav pending projects\burnboard\burnboard.test.js`

Sources of truth: `ROADMAP.md` "Phase 5 — two-account-tracking" + "Phase 6 — tips-tab-and-final-polish" (goal/scope/criteria), and `dump.md` §5.1, §5.3, §9, §10, §11, §15.4, §18, §4.6. No `.pipeline/research.md` — forward planning, not rework.

This is the FINAL phase pair. No later phase exists to defer to. Fill any genuine gap minimally and mark `ORIGINATED`. Mark intentional shortcuts with `ponytail:` comments naming ceiling + upgrade path (CLAUDE.md hard rule — a build FAILS without these).

No OPEN QUESTIONs. Nothing here touches auth, money, or data integrity beyond what is already specified and tested. `account_label` already exists end-to-end (turns + sessions written with it since Phase 1; index `by_account` exists on both stores; monthly_cache keyPath is `[month_key, account_label]`). This phase only wires the sync-chosen label through and adds the account dimension to the cache loop.

## Hard rules (CLAUDE.md, quoted — build FAILS on violation)
- "Never invent a state, field, name, or requirement not in spec docs"
- "Mark intentional simplifications with a ponytail: comment"
- Numbers always JetBrains Mono: wrap every numeric value in `<span class="mono">` or `.mono` (dump 4.2). Non-negotiable.
- Copy verbatim, lowercase where dump shows it (dump 4.7).
- Surgical changes: additive. Do not refactor or restyle Phase 1–4 code. Match existing style.

## Existing patterns to copy (named anchors, file:line)
- Toast/notification: NONE exists yet — build one (Part B).
- Tab switch wiring: delegated listener on `#tab-bar`, lines 2514–2526. History is wired via `if (btn.dataset.tab === 'history') renderHistory();` (line 2525). Add `tips` + `whats-coming` the same way.
- Settings save/load: `openSettings()` 2577, `saveSettings()` 2592, `loadConfig()` 545. Two-account fields `account_1_name`/`account_2_name` ALREADY exist in the config object (550–553), settings DOM (`#s-acc1` line 377, `#s-acc2` line 381), and save/load (2581–2582, 2597–2598). No new settings fields needed.
- Sync flow: `runSync(dirHandle)` line 693. `accountLabel` is currently hardcoded at line 700: `const accountLabel = _cfg.account_1_name || 'Primary';`. This is the single line to make account-prompt-driven.
- Boot: `boot()` line 2638. The `perm !== 'granted'` branch (line 2657) currently falls back to Connect with a Phase 1 ponytail (line 2658). THIS PHASE RESOLVES IT → Reconnect screen.
- Reconnect: NO screen exists. `showScreen()` line 2498 maps only connect/sync/app. Add `reconnect`.
- Tips header button: currently inert `<button class="btn-secondary" title="coming soon">💬 tips</button>` line 332, ponytail at 331. THIS PHASE RESOLVES IT → activate to switch to tips tab.
- Copy button + 1500ms revert: `copyText(btn, text)` line 1558; `.btn-copy` / `.btn-copy.copied` CSS lines 208–209.
- Card stagger: `.au` + `.d0`–`.d5` (lines 176–182), `@keyframes fadeUp` line 175. Inline `animation-delay` used for month cards (line 2025).
- Helpers: modelFamily 597, fmtTokens 1066, relTime 821, dbGetAll/dbGet/dbPut/dbBatchPut (475–511), recomputeMonthlyCache 1786, aggregateMonths 1738 (PURE), getWeeklyBuckets 1802 (PURE), getBillingCycles 1850 (PURE).
- History render: `renderHistory()` 1940, `renderMonthlyView` 1982, `renderWeeklyView` 2123, `renderBillingView` 2214, `exportHistoryCsv` 1922. All currently filter to `account_label === 'combined'` (monthly 1988, export 1925) or use all turns (weekly 2127, billing 2218).
- Browser-support amber bar: ALREADY built (Phase 1) — `#compat-warning` line 309, shown in boot 2643–2646 when `!window.showDirectoryPicker`; folder button disabled there. Part B only adds the missing "skip-to-dashboard link if IDB has data" (dump §18 row 1).
- AbortError swallow: ALREADY done in `pickFolder()` line 2630. Confirm only.
- Malformed-line count: ALREADY counted (`skippedLines`, declared 711, incremented 725) but only `console.log`'d (line 795). Part B surfaces it as a toast.

---
# PART A — Phase 5: two-account-tracking (dump §10)

## A1. Two-account mode flag
ENABLED only when `account_2_name` is non-empty (dump 10.2: "disabled until Account 2 name is filled in"). One helper, used everywhere:
```js
function twoAccountMode() { return !!(_cfg && _cfg.account_2_name && _cfg.account_2_name.trim()); }
```
When false: NO account UI anywhere (sync prompt, history selector, combined card all hidden). Single-account users see nothing new (AC#1).

## A2. Sync prompt modal (dump 10.2)
Shown only if `twoAccountMode()`, BEFORE sync runs — on first folder pick AND on `↻ sync`.
- Choices and the `account_label` each writes:
  - `[Primary]` → `_cfg.account_1_name` (default "Primary")
  - `[Alt Account]` → `_cfg.account_2_name` (the user's Account 2 text)
  - `[Both / Unsure]` → `"combined"` (dump 10.2: "included in totals but not split")
- The chosen label is passed into `runSync(dirHandle, accountLabel)` and written as `account_label` on every turn AND session from that sync.
- Copy verbatim (dump 10.2): header `which account is this sync from?`.
- Button TEXT: use `_cfg.account_1_name` / `_cfg.account_2_name` as the first two button labels (a renamed account shows the user's own name); the third button text is literal `Both / Unsure`. ORIGINATED nuance: dump shows `Primary` / `Alt Account`, which are exactly the default values of those two fields — so this is consistent, not invented. Mark ORIGINATED in a comment.
- Dismissed (backdrop click / Esc / closed without choosing) → default to Account 1 / Primary, sync proceeds (dump §18 "Two-account prompt dismissed").

Implementation shape:
- `runSync(dirHandle, accountLabel)` — add a 2nd param. Replace line 700 with: `const accountLabel = accountLabelArg || _cfg.account_1_name || 'Primary';` (covers single-account path + dismissed prompt when arg is undefined).
- Turn record (line 742) already sets `account_label: accountLabel`. `buildSessions` already copies `t.account_label` (line 620). No change to buildSessions.
- New `promptAccount()` → Promise<string> resolving to the chosen label (or Account-1 label on dismiss). Called by `pickFolder()` and `runResync()` only when `twoAccountMode()`; single-account path calls `runSync(dh)` with no label arg.
- Modal markup: reuse `.overlay-backdrop` (line 152) + a NEW centered panel (`.modal-center`, see A8). One open at a time; remove/hide on choice or dismiss.

## A3. account_label on writes — confirm + wire
- Turns tagged at line 742; sessions tagged via buildSessions. No schema change.
- A single physical session_id re-synced under a different label gets fully relabeled because the dedup guard (`dbDeleteTurnsBySession`, line 516; call site ~770) wipes by session_id and reinserts under the latest chosen label.
- ADD a ponytail at the dedup call site: "a session re-synced under a different account label is fully relabeled to the latest choice (dedup wipes+reinserts by session_id). Ceiling: cannot split one session_id across accounts. Upgrade: composite [session_id, account_label] dedup key if mixed-account sessions ever matter."

## A4. Per-account monthly_cache (dump §15.4)
Modify `recomputeMonthlyCache()` (line 1786) to compute per configured account label AND `'combined'`:
- Labels: `const labels = twoAccountMode() ? [(_cfg.account_1_name||'Primary'), _cfg.account_2_name.trim(), 'combined'] : ['combined'];`
- `'combined'` → aggregate ALL turns (current behavior).
- specific label → aggregate only turns where `t.account_label === label`. `"combined"`-tagged turns (from a Both/Unsure sync) appear ONLY under combined, never under a single account — this falls out naturally since a specific-label query matches the exact string only (dump 10.2).
- Reuse PURE `aggregateMonths(turns)` (1738) per label; write each record with its `account_label` (current write already sets `account_label`, line 1791 — make it the loop variable).
- UPDATE the Phase 4 collapse ponytail (lines 1782–1784): it now loops real labels — THIS PHASE RESOLVES the "Upgrade path (Phase 5)" note. Rewrite the comment to describe current behavior.
- Stale-on-removal: if Account 2 is later cleared, old per-Alt cache rows remain but are never read (selector hidden). ponytail: "orphaned per-account cache rows are harmless (never queried in single-account mode); not pruned. Upgrade: prune on settings save if storage matters."

## A5. History tab account UI (dump 10.3) — all gated on `twoAccountMode()`

### A5a. Account selector
- Options: `All` | `<account_1_name>` | `<account_2_name>` (dump shows `All | Primary | Alt Account`; use the real configured names).
- Module state: `let _historyAccount = 'all';` (values: `'all'`, the Account-1 label, the Account-2 label).
- Place in the history header row (line 1966 area), between view toggle and Export CSV (dump §8: `[Monthly][Weekly][Billing Cycle]  [Account: All ▾]  [↓ Export CSV]`). Render as `.btn-secondary` pills matching the `[data-hview]` pattern; extend the existing delegated listener (line 1947) with a `[data-haccount]` branch that sets `_historyAccount` and re-renders.
- Hidden in single-account mode; `_historyAccount` stays `'all'`.

### A5b. Filter all history views to selection
Map `_historyAccount` → the cache/turn filter:
- `'all'` → `'combined'` cache rows / all turns (current behavior; dump: "All" = across both = combined).
- specific label → monthly view reads `monthly_cache` rows where `account_label === <label>`; weekly + billing filter turns to `t.account_label === <label>` before passing to `getWeeklyBuckets` / `getBillingCycles`.
- ADD a PURE helper `filterTurnsByAccount(turns, label)` returning all turns when `label==='all'` else exact-match turns; use it in weekly + billing. Monthly reads cache by the mapped label.
- `exportHistoryCsv` (1922): export the selected account's rows (`_historyAccount==='all' ? 'combined' : _historyAccount`). ORIGINATED: dump §8.4 doesn't say which account; exporting the visible selection is least-surprising. ponytail it.

### A5c. Combined totals card (dump 10.3)
- Top of History tab, ONLY if `twoAccountMode()`. Render inside `renderHistory` after the header, before `#history-body`.
- Copy verbatim (dump 10.3): header `🔀 across both accounts`; three columns `<acct1 name>` / `<acct2 name>` / `Combined`, each showing `X tokens` (fmtTokens) and `N sessions`.
- Source: read all `monthly_cache` rows; sum `total_tokens` and `sessions` per `account_label` across months. Per-account = rows matching that label; Combined = rows with `'combined'`.
- ponytail: "combined-card sessions = sum of per-month session COUNTS, which double-counts a session spanning two months (same trade-off already baked into monthly_cache). Ceiling: cross-month inflation. Upgrade: count distinct session_ids from the sessions store by account."
- Numbers in `.mono`.

## A6. Account-edge behaviors (dump §18)
- Prompt dismissed → Primary (A2 fallback).
- Account 2 cleared later → `twoAccountMode()` false → all account UI vanishes on next render; already-tagged turns/sessions/cache rows are UNTOUCHED in IDB, nothing lost (AC#6). No migration. `saveSettings()` already re-renders dashboard (2601); history re-renders on every tab click (2525), so switching back rebuilds it single-account. ORIGINATED: acceptable, no extra wiring.

## A7. Dashboard always combined (dump 10.3)
- Start Check / Forecast / Mini Stats use `loadDataLocal()` (998) which reads ALL turns with no account filter. CONFIRM unchanged — do NOT add account filtering to the dashboard path. This already satisfies AC#5; just don't break it.

## A8. CSS (Part A) — additive
- `.modal-center` — `position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:var(--s1); border:1px solid var(--bdr); border-radius:14px; padding:24px 28px; z-index:51; max-width:380px; width:90%`. Toggle visible via an `.open` class on the shared `.overlay-backdrop` plus the modal element (mirror settings overlay pattern, 152–155).
- Prompt buttons reuse `.btn-secondary` / `.btn-primary`.
- Combined-totals columns: `display:grid; grid-template-columns:repeat(3,1fr); gap:16px` (or reuse `.mini-stats`).

---
# PART B — Phase 6: tips-tab-and-final-polish

## B1. Token Tips tab (dump §9)
Render into `#panel-tips` (line 348) via `renderTips()`, wired in the tab listener (`if (btn.dataset.tab === 'tips') renderTips();`).

Section header: `💬 token tips`; subtext personalises (B1c).

Six cards (titles + savings VERBATIM, dump §9):
| # | Title | Saving badge |
|---|---|---|
| 1 | Tell Claude to talk less | 40–65% output |
| 2 | Use /compact in long sessions | 40–70% input |
| 3 | Ask for diffs, not full files | 50–80% on edits |
| 4 | Add a .claudeignore | 20–60% input |
| 5 | Use the right model | up to 80% on simple tasks |
| 6 | Trim your CLAUDE.md | 5–15% all input |

Card anatomy (dump §9): title (Outfit 600 `--text`); saving badge pill (`--adim` bg, `--accent` text); description (Outfit 400 `--mu`, 2–3 lines); copyable code block (JetBrains Mono, `--s2` bg, `--bdr` border); copy button bottom-right reusing `copyText` + 1500ms revert.

ORIGINATED (dump gives titles+savings only, not description/code body): write a concise accurate description and ONE copyable snippet per card, lowercase tone (4.7). REUSE the existing matching insight `copy_text` strings where they map: card 2 ↔ spiral copy_text (line 910), card 5 ↔ opus_waste copy_text (line 988), card 6 ↔ cache-warning copy_text (line 945). Mark the ORIGINATED descriptions in one leading comment block, not per-card. Copy-block code keeps real casing (`/compact`, `npm ...`).

Card stagger: `.au` + 60ms between cards (dump 4.6 "Tip cards: stagger 60ms") via inline `animation-delay:${i*60}ms` (month-card pattern, line 2025).

### B1c. Personalisation badges (dump §9, after 7+ days of data)
- "7+ days of data" trigger = distinct active days (`timestamp.substring(0,10)`) across all turns ≥ 7. ORIGINATED (matches the `active_days` notion in monthly_cache). ponytail with upgrade path (span-based alternative).
- When triggered AND the user's pattern matches a tip, the badge text shows the real figure, e.g. `your data: output ratio is 4.2×` instead of the generic saving (dump §9 example). Else generic.
- PURE seam `tipPersonalization(turns, now)` → object keyed by tip number, each value `null` (generic) or a badge string. Only metrics derivable from existing turn fields:
  - Tip 1 (talk less): output/input ratio over last 7d → `your data: output ratio is N.N×` if ratio > a defensible threshold (ORIGINATED + ponytail).
  - Tip 2 (/compact): reuse spiral signal (≥3 sessions >3× growth, last 7d) → `your data: N sessions spiraled this week`.
  - Tip 5 (right model): reuse opus-waste count (sessions <4 turns, opus, last 7d) → `your data: N short opus sessions`.
  - Tips 3, 4, 6: no per-turn signal → always generic (null). ponytail: name which tips can't personalise and why (no diff/ignore/CLAUDE.md signal in turn records); upgrade = none without new data.
- Gate: `< 7` active days → all-generic regardless. Subtext: before 7 days a generic line; after, `based on your actual patterns` (reuse insight subtext, 7.3). ORIGINATED for the personalised subtext.

RESOLVES the Phase 1 inert-tips-button ponytail (line 331): make the header tips button (332) switch to the tips tab (same effect as clicking its tab-btn). Remove `title="coming soon"`.

## B2. Reconnect screen + boot revoked branch (dump 5.1 / 5.3)
RESOLVES Phase 1 boot fallback ponytail (line 2658).
- Add `#reconnect-screen` (a `.screen`). Register in `showScreen()` map (2500): `reconnect:'reconnect-screen'`.
- Copy verbatim (dump 5.3): icon `🔌`; headline `browser forgot the folder`; explanation `this is chrome enforcing privacy, not a bug. your data is still here.`; primary CTA `📂 reconnect ~/.claude/projects`; secondary link `skip and show last data`.
- Primary CTA → `reconnectFolder()`: get saved `dirHandle` from kv; `await dh.requestPermission({ mode:'read' })`; if `'granted'` → run sync (with account prompt if two-account). NO new picker (dump 5.3: "one click"). If still not granted → stay on reconnect (ORIGINATED: no-op; no error toast).
- Secondary link → `skipReconnect()`: `await renderDashboard(); showScreen('app');` (load from IDB without re-parsing, dump 5.3).
- Boot change (2655–2661): when `perm !== 'granted'` AND a `dirHandle` exists → `showScreen('reconnect')` (was Connect). Keep Connect for the no-handle case (2649).

## B3. What's Coming tab (dump §11) — static, NO network calls
Render into `#panel-whats-coming` (349) via `renderWhatsComing()`, wired in tab listener.
- Content (dump §11): static/animated marketing panel teasing a future browser extension that tracks claude.ai web sessions; three feature pills; email-capture UI (input + button) that does nothing networked (local "thanks" state or no-op) — NO fetch/XHR (ROADMAP AC: "email-capture UI only (no network calls)").
- ORIGINATED (dump gives concept, not copy): minimal lowercase teaser copy, three short feature-pill labels, one email input + button. Mark ORIGINATED in a leading comment. Single render; build once.
- "Animation" = `.au` entrance fade only. GSAP is NOT loaded in this file (Phase 1 used CSS keyframes; dump mentions GSAP but it was never added). ponytail: "animations are CSS-only; GSAP never added; reduced-motion honored via B7."
- Email submit must NOT make a network call (assert-able: handler only touches DOM). ponytail: "no waitlist backend; submit is a local no-op/thanks. Upgrade: POST when an endpoint exists."

## B4. Toast system (dump §18)
- Container `#toast` (fixed, bottom-center or bottom-right) + `showToast(msg)`: show text, auto-dismiss ~3s (ORIGINATED duration; ponytail). Single toast at a time.
- `showToast('all caught up ✓')` when a re-sync processes 0 new turns (dump §18) — in `runSync`, after the parse loop, if `totalTurns === 0`. Verbatim `all caught up ✓`.
- `showToast('skipped N malformed lines')` when `skippedLines > 0` (dump §18; replaces the console.log at line 795). Verbatim with N substituted, N in `.mono`.
- ORIGINATED: if both 0-new AND skipped, show the skipped-lines toast (more actionable); ponytail.
- CSS `.toast`: fixed, `--s4` bg, `--bdr2` border, radius 10px, padding, `.au`-style fade; `.toast.show` toggles. Honor reduced-motion (B7).

## B5. Favicon by Start Check state (dump §11 build order / §7.1 states)
- After each `renderDashboard()` (2325), set a favicon reflecting the current Start Check state. Extract the state from `renderStartCheck`'s computation (the state machine is inline at 2352–2361) — recompute cheaply or have renderStartCheck return/stash the state.
- ORIGINATED asset (dump names requirement, not asset): tiny data-URI SVG = a filled circle in the state color. State→color: good/weekend→green, caution_peak/caution_budget→amber, danger→red, no_data→muted. Set `<link rel="icon" id="favicon">` href to the data URI (add the link to `<head>`).
- ponytail: "favicon = single state-colored dot SVG data-URI, not a designed icon. Upgrade: real multi-state PNGs."
- PURE seam `faviconColorForState(state)` → hex.

## B6. Remaining empty + error states (dump §18 table) — walk every row
1. Firefox/Safari bar — DONE (2643). ADD the missing "skip-to-dashboard link if IDB has data": on Connect, when `!window.showDirectoryPicker` AND a `dirHandle` (or turns) exist, show a `skip and show last data` link → `skipReconnect()`. ORIGINATED placement (under the warning bar).
2. User cancels picker — DONE (AbortError swallow, 2630). Confirm.
3. Malformed JSONL line — toast (B4).
4. Empty .jsonl file — skipped silently (loop continues on empty/whitespace; a whole-empty file = zero lines = no-op). Confirm; no change.
5. Directory permission denied — `walkDir` (685) has NO try/catch; a denied subdir throws and aborts the walk. ADD try/catch around the per-entry recursion so a denied directory is skipped + `console.error`'d, walk continues (dump §18: "Skip directory, continue. Log to console."). ponytail.
6. IDB wiped → no dirHandle → Connect (DONE, 2649). ADD the note copy on Connect: `if you had data previously, re-syncing rebuilds your full history.` (dump §18 exact). ORIGINATED placement (small muted line near the CTA).
7. Sync fails mid-way — `runSync` has NO top-level try/catch; an exception strands the user on the spinner. WRAP the sync body in try/catch: on failure show a retry button + error message ON the sync screen, and load the dashboard from existing IDB if turns exist (`renderDashboard(); showScreen('app')`). dump §18: "Error message on sync screen with retry button. Loads dashboard from whatever exists in IDB." Add minimal `#sync-error` markup (hidden by default) with a retry button re-invoking sync. ponytail the retry target.
8. Re-sync 0 new turns — toast (B4).
9. Monthly cache compute fails — already wrapped (792). ADD the stale note in History: set a module flag `_monthlyCacheStale = true` in that catch (792); in monthly view, when true, show `data may be stale — re-sync to refresh.` (dump §18 exact). ponytail the trigger.
10. Two-account prompt dismissed — A2.
11. Account 2 cleared — A6.
12. Plan cap numbers — disclaimer already shown (forecast 2491, mini-stats tooltips). Confirm; no change.

## B7. prefers-reduced-motion (dump 4.6)
ADD ONE global CSS block:
```css
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation:none !important;transition:none !important}
  .au{opacity:1 !important}
}
```
Disables all entrance/stagger/counter animations + pulse/spin/fade keyframes, and forces `.au` elements visible (they start at `opacity:0`, line 176). AC: "all entrance/stagger/counter animations are disabled." Sync spinner (87) just won't spin — decorative, acceptable (ORIGINATED). One block covers Phases 1–6 (fadeUp, fadeDown, pulse, spin, toast, what's-coming). ponytail: "one global reduced-motion override instead of per-keyframe guards; ceiling: also kills functional transitions (all currently decorative, fine). Upgrade: scope to decorative selectors if a functional transition is ever added."

---
## Integration points (exact edits)
1. `runSync(dirHandle)` → `runSync(dirHandle, accountLabelArg)` (693); use passed label at 700; dedup-relabel ponytail (~770); 0-new + skipped-lines toasts; top-level try/catch for mid-sync failure (B6.7).
2. `pickFolder()` (2624) + `runResync()` (2615): call `promptAccount()` first when `twoAccountMode()`, pass result to `runSync`.
3. `recomputeMonthlyCache()` (1786): loop real labels (A4); update the 1782–1784 ponytail.
4. `renderHistory()` (1940): combined-totals card + account selector when two-account; map `_historyAccount` into views; extend delegated listener with `[data-haccount]`.
5. `renderMonthlyView` / `renderWeeklyView` / `renderBillingView` / `exportHistoryCsv`: read selected account (A5b).
6. Tab listener (2514): add `tips` + `whats-coming` render calls.
7. Header tips button (332): activate (B1; RESOLVES line 331 ponytail).
8. `showScreen()` (2498): add `reconnect`.
9. `boot()` (2655): revoked branch → reconnect (B2; RESOLVES line 2658 ponytail).
10. `renderDashboard()` (2325): set favicon by state (B5).
11. `walkDir()` (685): per-entry try/catch (B6.5).
12. `<head>`: add `<link rel="icon" id="favicon">`; reduced-motion block; toast/modal/reconnect/whats-coming/tips CSS.
13. Connect markup: skip-to-data link (B6.1), IDB-wiped note (B6.6).
14. Sync markup: `#sync-error` + retry (B6.7).
15. `#app-screen` markup (323): add `#reconnect-screen` as a sibling `.screen`; add `#toast` + account modal elements (can live near the settings overlay block, ~353).

## Ponytails this phase RESOLVES (update/remove the old comment)
- Lines 331/332: inert tips button → activated (B1).
- Lines 2658–2659: boot revoked → Connect fallback → now Reconnect screen (B2).
- Lines 1782–1784: recomputeMonthlyCache single-account collapse → now loops real labels (A4).

## Self-check (extend the in-browser `selfCheck()` IIFE, line 394)
Add `console.assert` lines for: `faviconColorForState` mapping for all 6 states; `twoAccountMode()` false when acct2 empty; `tipPersonalization([], Date.now())` returns all-generic. Match existing assert style (415–428).

## Pure test seams to add in burnboard.test.js (copy fn verbatim from html, assert; lines 1–90 show the pattern)
1. **account-label filtering** — `filterTurnsByAccount(turns, label)`: `'all'` returns everything; a specific label returns only exact-match turns; `"combined"`-tagged turns excluded from a specific-label query.
2. **per-account monthly aggregation** — `aggregateMonths(filterTurnsByAccount(turns,'Alt'))` totals match only Alt turns; combined ≥ each split; Both/Unsure turns counted in combined only.
3. **tips personalisation trigger math** — `tipPersonalization(turns, now)`: <7 active days → all generic; ≥7 active days with matching pattern → correct badge string; fire/silent at the boundary.
4. **malformed-line counting** — extract a PURE `countMalformed(lines)` (or assert the existing skip predicate over a small array of valid/empty/garbage lines) returning the skipped count.
5. **faviconColorForState** — all 6 states → expected hex.
6. **twoAccountMode** — empty/whitespace acct2 → false; non-empty → true.

Assert-based, no framework, no fixtures (CLAUDE.md). Current count 238; this adds a handful.
