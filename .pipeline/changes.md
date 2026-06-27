# changes — Phase 1

## Files changed

### `burnboard.html` (new)
Single self-contained file. All HTML/CSS/JS inline. No build step.

Sections implemented:
- Design system CSS vars, atmospheric glow, film grain, scrollbar, card/button styles (dump 4.1–4.6)
- Connect screen with accordion, trust strip, steps, CTA, compat warning (dump 5.2)
- Sync screen with spinner, live status, progress bar, privacy note (dump 5.4)
- App shell: sticky header, plan badge, sync time, tips/sync/settings buttons, tab bar (dump 6)
- Dashboard: Start Check, Mini Stats row, Week Forecast (dump 7.1/7.2/7.5)
- Settings overlay: plan dropdown, billing start, timezone, account names, save + wipe (dump 12)
- IDB layer: `burnboard_v2` v2, five stores with exact indexes (dump 13.1)
- Folder walker + JSONL parser (dump 14)
- Computation helpers: `getMondayUTC`, weekly cap, current window, today vs avg, forecast (dump 15.2/15.3)
- Self-check: inline `console.assert` block covering `isPeakHour` (6 cases) and state machine (7 cases)

---

## What the tester should focus on

### Highest risk: re-sync dedup (the `dbDeleteTurnsBySession` cursor loop)
- On a second sync of the same folder, turns for touched sessions must be deleted before reinserting. If this is broken, weekly cap percentages double-count.
- Test by syncing, then syncing again without changing files, and confirming token totals stay identical.
- The cursor walks `by_session` index and deletes each key in a single `readwrite` transaction.

### Second: window computation across sessions
- `buildWindows` operates on ALL stored turns (not just the current sync batch), sorted by timestamp. A gap > 5h starts a new window.
- Edge case: if all turns are from the same session, there should still be multiple windows if gaps exist.
- `window_id` is `djb2hex(window_start)` — a deterministic non-crypto hash. Full recompute each sync means `put` overwrites deterministically.

### Third: Start Check state machine ordering
- Evaluation order matters: `no_data` first, then `weekend`, then peak/off-peak branches.
- Self-check in browser console covers the key cases; open DevTools and verify "[BurnBoard] self-check passed" on load.

### Fourth: `today_vs_avg` denominator is always 30 (not distinct days with data)
- A user with only 3 days of data gets a very low average. This is per spec (ORIGINATED formula).

### Fifth: `projOpusPct` division by `fracElapsed` with clamp(0.01, 1)
- `fracElapsed` is clamped to 0.01 minimum so we never divide by zero at the start of Monday.
- At Monday 00:01 UTC this means projected pace is 100x actual — forecast will show `tight` or `on_track` based on actual opus_pct vs 100.

### Scope guard — confirmed NOT built
Charts, insights, filter bar, sessions table, history tab, tips tab, what's coming panel, two-account sync, reconnect screen, monthly cache population, toast system, favicon, reduced-motion handling.
