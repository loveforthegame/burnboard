# spec — Phase 1: connect-and-core-dashboard

Source of truth: ROADMAP.md "Phase 1 — connect-and-core-dashboard" (scope/acceptance) + dump.md sections cited inline. Everything below is transcribed from those docs. Lines marked `ORIGINATED` are gaps the dump left open that I filled (none touch security/money/auth/data-integrity). Lines that touch data-integrity are raised as OPEN QUESTION below instead of guessed.

RESOLVED (re-sync dedup — was OPEN QUESTION, user-confirmed 2026-06-27): The `turns` keyPath stays `id` autoIncrement (13.1). To avoid double-counting when incremental sync re-reads a grown `.jsonl` (Claude Code appends to a session's file as it grows; Weekly Cap 15.2 and Today-vs-Avg 7.2 both read `turns`): **before inserting a re-read file's turns, delete that session's existing turns via the `by_session` index, then insert the freshly parsed turns.** Same for the session's `sessions` and `windows` records (delete-then-reinsert keyed by session_id). This keeps incremental sync (only files with `lastModified >= last_sync` are touched) and is idempotent. Mark the delete-before-insert step with a `ponytail:` comment noting it is the dedup guard.

- `turns`: delete-by-`by_session`-index, then insert freshly parsed turns for that session.
- `sessions`: keyPath is `session_id`, so just `put` the rebuilt session record — it overwrites cleanly, no delete needed.
- `windows`: keyed by `window_id` = hash of `window_start` and computed globally across all turns (14: gap > 5h starts a new window), so windows are NOT session-scoped. After the turn-level dedup for this sync's touched sessions, recompute windows from all turns in the store and `put` each (deterministic `window_id` overwrites). ponytail: full recompute of windows each sync — fine at single-user data volumes; if it ever gets slow, switch to incremental window patching.

---

## Scope guard (do NOT build in Phase 1)

Phase 1 is ONLY: Connect screen, Sync screen, nav/tab shell, Start Check, Mini Stats, Week Forecast, Settings overlay, IDB layer, folder picker + JSONL parsing. Explicitly OUT (later phases, do not build): charts/heatmap/breakdown (7.6–7.8), Insights (7.3), Filter bar (7.4), Sessions table (7.9), Cost/Summary (7.10), History tab (8), Tips tab (9), two-account sync prompt/selector (10), What's Coming (11), Reconnect screen (5.3), `recomputeMonthlyCache` (15.4), `getWeeklyBuckets` (15.5), toasts/favicon/reduced-motion polish (Phase 6).

Section 16 (API pricing) is listed in the planning brief but NO Phase 1 feature consumes it (no cost card in Phase 1) — do not add pricing constants. Deferred to Phase 3.

---

## File

Create exactly one file: `C:\Users\ue\Desktop\abhinav pending projects\burnboard\burnboard.html`. All HTML, CSS, JS inline in this single file. No build step, no other files. Load Google Fonts (Outfit, JetBrains Mono) via `<link>`. No Chart.js / GSAP needed in Phase 1 (no charts; entrance animations are optional CSS keyframes, not GSAP). Per CLAUDE.md: minimum code, no speculative abstractions, no new deps.

---

## Hard rules (quoted from project CLAUDE.md — build FAILS on violation)

- "Never invent a state, field, name, or requirement not in spec docs"
- "Mark intentional simplifications with a ponytail: comment"

Plus design-system non-negotiables from dump.md:
- 4.2: "Numbers are always mono. ... Every stat value, counter, and metric uses JetBrains Mono." Every number/timestamp/percent/duration value renders in JetBrains Mono.
- 4.7: lowercase where natural, direct, no filler. Copy strings below are exact — transcribe verbatim, do not rephrase or capitalize.

---

## 1. Design system (dump 4.1–4.6) — define as CSS first

CSS variables, exact values from 4.1:
```
--bg:#080706; --s1:#0F0D0B; --s2:#171411; --s3:#1E1A16; --s4:#252018; --s5:#2C261E;
--bdr:rgba(255,255,255,.055); --bdr2:rgba(255,255,255,.10); --bdr3:rgba(255,255,255,.16);
--accent:#F97316; --accent2:#FB923C; --accent3:#FDBA74;
--adim:rgba(249,115,22,.09); --abright:rgba(249,115,22,.16);
--green:#34D399; --gdim:rgba(52,211,153,.08);
--amber:#FBBF24; --amdim:rgba(251,191,36,.08);
--red:#F87171; --rdim:rgba(248,113,113,.08);
--text:#EDE8E3; --mu:#6B6460; --mu2:#4A4440; --mu3:#302C28;
```
Typography (4.2): Outfit for headings/labels/body (400/500/700/800/900); JetBrains Mono (400/500) for every number.

Atmospheric (4.3): orange radial glow top-left exactly `radial-gradient(ellipse 55% 40% at 0% 0%, rgba(249,115,22,.08), transparent 60%)`. Film grain via SVG `feTurbulence` on a `::before` pseudo-element at ~2.2% opacity. Scrollbar 3px wide, color `--mu3`, no track.

Card style (4.4): bg `--s1`, `1px solid var(--bdr)`, radius 14px, padding 20–24px. Interactive hover: `border-color:var(--bdr2)` + `translateY(-1px)`. State-colored cards: left border 2px in state color + bg tinted with the matching dim var (green→gdim, amber→amdim, red→rdim, orange→adim).

Buttons (4.5): Primary orange = bg `--accent`, color `#000`, radius 10px, padding `14px 28px`, Outfit 600 15px, hover `brightness(1.08)+translateY(-1px)+orange box-shadow`. Secondary/pill = bg `--s2`, `1px solid var(--bdr)`, color `--mu`, radius 8px, padding `6px 14px`, Outfit 500 13px, selected = border+color `--accent`. (Copy button style 4.5 not needed Phase 1 — no copy buttons here.)

Motion (4.6): nav fade-in 0.5s; stat cards stagger 80ms `translateY(6px)→0` + opacity. Keep as CSS only; full GSAP counters + `prefers-reduced-motion` handling are Phase 6 — do not block on them, but do not add motion that ignores reduced-motion if trivially avoidable.

---

## 2. Boot logic (dump 5.1, happy path only)

On load:
1. `openDB()`.
2. Load `dirHandle` from `kv`.
3. If no `dirHandle` → show Connect screen (5.2).
4. If `dirHandle` exists: `queryPermission({mode:'read'})`.
   - `'granted'` → run Sync (parse) → then Dashboard. (Acceptance: "reload reconnects from the saved handle without re-picking".)
   - not granted (`'prompt'`/`'denied'`) → ORIGINATED Phase-1 fallback: show Connect screen (re-pick). The Reconnect screen (5.3) that handles this branch is Phase 6; do NOT build it now. Add a `ponytail:` comment noting Reconnect replaces this fallback in Phase 6.
5. If `dirHandle` exists but IDB empty / first run with no turns, sync as above.

Browser support: File System Access API only. If `window.showDirectoryPicker` is undefined (Firefox/Safari), the Connect CTA is disabled and the amber warning bar (5.2) is shown. (Full error-table behaviors from section 18 are Phase 6 — only this minimal disable+bar is Phase 1.)

---

## 3. Connect screen (dump 5.2) — exact copy

Centered, max-width 460px:
- `🔥` icon + `BurnBoard` headline (Outfit 900, large).
- Tagline (verbatim): `your claude code is bleeding tokens somewhere. this tells you where.`
- Trust strip, 4 items horizontal: `✓ no prompts stored` · `✓ token counts only` · `✓ fully local` · `✓ free forever`
- Accordion titled `what can burnboard actually see?` — lists tracked (Claude Code sessions) vs not (web chat, Cowork, Desktop) per section 3. Collapsible.
- Numbered steps: `1 pick folder` · `2 browser reads locally` · `3 stop being surprised`
- Primary CTA (verbatim): `📂 select ~/.claude/projects`
- Helper notes below button: macOS `press ⌘ Shift . to show hidden folders`; Windows `usually at C:\Users\[you]\.claude\projects`
- Amber warning bar, hidden unless Firefox/Safari (verbatim): `folder sync needs Chrome or Edge`

CTA click → `showDirectoryPicker()` → on success run Sync. On `AbortError` (user cancelled) swallow silently, stay on Connect (section 18).

---

## 4. Sync screen (dump 5.4)

Shown during parsing:
- Spinning icon (CSS animation).
- Live status message, updates through these phases (verbatim strings, fill counts): `scanning .jsonl files...` → `found N turns...` → `writing to storage...` → `computing dashboard...`
- Progress bar: `--accent` fill, 0–100%, advance per file processed.
- Privacy note (verbatim): `only token counts and timestamps are being read. no conversation content.`

On completion → Dashboard. (Mid-sync failure retry UI = Phase 6.)

---

## 5. Nav + tab shell (dump section 6)

Header row:
- Logo `🔥 BurnBoard` (Outfit 800).
- Plan badge pill from settings, e.g. `Max 5x · $100` — bg `--s2`, text `--mu`. Label derives from `plan` (pro→`Pro · $20`, max5x→`Max 5x · $100`, max20x→`Max 20x · $200`, api→`API`).
- Lock icon + `no prompts stored` (small, muted, persistent).
- `synced N ago` — relative time from `bb_last_sync` (muted).
- `💬 tips` button — present in shell; inert placeholder in Phase 1 (Tips tab is Phase 6). ponytail comment.
- `↻ sync` button — triggers re-sync (re-run parse on saved handle, then re-render).
- `⚙ settings` button — opens Settings overlay.

Tab bar: `📊 dashboard` (active by default) · `📅 history` · `💬 token tips` · `✨ what's coming`. Active tab = `--accent` bottom border + `--text`; inactive `--mu`. Only the dashboard panel has content in Phase 1; the other three panels are empty placeholders (clicking switches active styling, shows empty container). ponytail comment that non-dashboard panels are built in later phases.

---

## 6. Dashboard panel — three Phase-1 sections, top to bottom

Container max-width 1200px, centered. Order: Start Check → Mini Stats row → Week Forecast.

### 6.1 Start Check (dump 7.1) — min 200px tall, above the fold

Left: pulsing 6px status dot (state color, `@keyframes pulse`) + headline + body. Right panel: large mono window-remaining number (~48px, `--text`) e.g. `4h 22m`; label `window remaining` (Outfit 500 12px, state color); subtext `started 38m ago` (muted).

State machine inputs: now (UTC), user timezone (settings), `opus_pct`, `sonnet_pct`, `window_remaining` (minutes). Peak hours = weekdays Mon–Fri, UTC hour 13–18 inclusive (matches `isPeakHour` in section 14; peak window ends at 19:00 UTC).

Evaluate in this order (ORIGINATED order, conditions verbatim from 7.1 table):
1. `no_data` — nothing synced (no turns). Border muted. Headline `sync your data to see this.` Body `connect your .claude folder to get window status and weekly forecast.`
2. `weekend` — Sat(6) or Sun(0) UTC. Border green. Headline `weekend — no peak hours.` Body `peak hours only apply weekdays. go as hard as you want.`
3. If peak hours:
   - `danger` if `opus_pct>80 || sonnet_pct>85`. Border red. Headline `not a great time.` Body `peak hours + running low on weekly budget. window burns faster right now. off-peak starts [local time]. resets [day].`
   - else `caution_peak`. Border amber. Headline `okay to start, but heads up.` Body `peak hours active until [local time]. window burns faster than usual. off-peak starts at [local time].`
4. If off-peak:
   - `caution_budget` if `opus_pct>70 || sonnet_pct>75`. Border amber. Headline `off-peak, but budget is getting thin.` Body `good time technically. you've used [X]% of opus cap. save the hard problems for when it matters.`
   - else `good`. Border green. Headline `good time to start.` Body `off-peak right now. [Xh Ym] left in window. [Z]% of weekly opus remaining. go build.`

Placeholder fills:
- `[Xh Ym] left in window` = formatted `window_remaining_ms`.
- `[Z]% of weekly opus remaining` = `100 - opus_pct` (rounded).
- `[X]% of opus cap` = `opus_pct` (rounded).
- `[local time]` = 19:00 UTC of today, formatted in user timezone via `Intl.DateTimeFormat(undefined,{timeZone, hour:'numeric', minute:'2-digit'})`.
- `[day]` / `resets [day]` = `monday` (caps reset Monday UTC).

### 6.2 Mini Stats row (dump 7.2) — three equal cards below Start Check

Card 1 — Current Window: label `CURRENT WINDOW`; value `[Xh Ym]` mono 28px; sub `started [N]m ago`; color green if >2h left / amber 1–2h / red <1h; tooltip verbatim `Time left in your 5-hour rolling window. Starts on your first message. Resets 5 hours later, not at midnight.`

Card 2 — Weekly Cap: label `WEEKLY CAP`; value `[N]%` mono 28px (= `weekly_cap_pct` = `max(opus_pct, sonnet_pct)` rounded); sub `of cap used · resets Monday`; color green <60 / amber 60–80 / red >80; tooltip verbatim `Estimated % of your 7-day model cap used. Community estimates — not official Anthropic numbers.`

Card 3 — Today vs Avg: label `TODAY VS AVG`; value `[X]×` mono 28px (= `today_vs_avg`, 1 decimal); sub `vs 30-day daily average`; color green ≤1.0× / amber 1.0–2.0× / red >2.0×; tooltip verbatim `Today's token total vs your 30-day daily average. Above 1.0× means you're burning harder than usual.`

`today_vs_avg` computation (ORIGINATED, dump leaves exact formula open): `todayTokens` = sum of `input_tokens+output_tokens` for turns whose `timestamp.substring(0,10)` equals today's UTC date. `avg` = (sum of `input_tokens+output_tokens` for turns in the last 30 days) / 30. `ratio = avg>0 ? todayTokens/avg : 0`. Use UTC date for "today" to match the UTC bucketing used everywhere else in dump (ponytail note the UTC choice).

### 6.3 Week Forecast (dump 7.5)

Header `📅 week forecast`, subtext `at your current pace`.

Forecast sentence (one line, colored by severity). State + sentence:
- `exhausted` (red): when `opus_pct >= 100`. Sentence: `opus cap hit. resets in [N] days ([day]).`
- `tight` (amber): see projection below. Sentence: `at your current pace, opus runs out [day] around [time].`
- `on_track` (green): otherwise. Sentence: `you're on track to finish the week with [X]% of opus remaining.`

State selection (ORIGINATED — dump gives sentences + severity colors but not the pace threshold; opus-driven per all dump examples):
```
mondayUTC = getMondayUTC()  // section 15.2
fractionElapsed = clamp((now - mondayUTC) / (7*86400000), 0.01, 1)
projectedOpusPct = opus_pct / fractionElapsed
if opus_pct >= 100            -> exhausted
else if projectedOpusPct >= 100 -> tight
else                          -> on_track
```
- on_track `[X]% remaining` = `round(100 - projectedOpusPct)` (clamp ≥0).
- tight `[day] around [time]`: `remainingHours = caps.opus - opus_hours_used`; `burnPerMs = opus_hours_used / (now - mondayUTC)`; `runout = new Date(now + remainingHours/burnPerMs)`; format day name + time in user timezone via `Intl.DateTimeFormat`.
- `[N] days` / resets `[day]` = days until next Monday 00:00 UTC; day name `monday`.

Progress bars — two rows, Opus and Sonnet:
- fill width = pct; fill color green <60 / amber 60–80 / red >80.
- row text: `[pct]%  ·  [used]h used of ~[total]h est.  ·  resets in [N] days`, where `used` = `opus_hours_used`/`sonnet_hours_used` (1 decimal), `total` = caps value (section 17).

Disclaimer (always visible, small, muted, verbatim): `cap estimates are community-reported, not official anthropic numbers.`

---

## 7. Settings overlay (dump section 12)

Slides in from right, full-height panel. Fields (table 12), persisted to `kv` key `bb_config` (shape 13.6):
- Plan — dropdown: `Pro · $20`(pro) / `Max 5x · $100`(max5x) / `Max 20x · $200`(max20x) / `API`(api). Default `max5x`.
- Billing start day — number input 1–28, default 1.
- Timezone — text input (IANA string), default auto-detected via `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Account 1 name — text, default `Primary`.
- Account 2 name — text, default empty.

(Account fields are present and saved in Phase 1 because Phase 5 explicitly depends on them already existing — but NO two-account behavior is built now: no sync prompt, no account selector, `account_label` is always `account_1_name || "Primary"`.)

Actions:
- Save → write `bb_config` to `kv`, close overlay, re-render dashboard (plan badge + computations reflect new plan/timezone).
- Wipe all data → `confirm()` → `clear()` all IDB stores → return to Connect screen.

---

## 8. IndexedDB layer (dump 13.1)

DB `burnboard_v2`, version 2. Object stores + indexes exactly:
- `kv` — explicit string keys (no keyPath). Holds: `dirHandle`, `bb_config`, `bb_last_sync`, `bb_visited`.
- `turns` — keyPath `id` autoIncrement. Indexes: `by_session`→`session_id`, `by_timestamp`→`timestamp`, `by_month`→`month_key`, `by_account`→`account_label`.
- `sessions` — keyPath `session_id`. Indexes: `by_project`→`project_name`, `by_start`→`first_timestamp`, `by_account`→`account_label`.
- `windows` — keyPath `window_id`. Index: `by_start`→`window_start`.
- `monthly_cache` — keyPath `[month_key, account_label]` (compound). Index: `by_month`→`month_key`. (Store created in Phase 1; populated only in Phase 4 — leave empty.)

Helpers (dump build step 2): `openDB()`, `put(store, value, key?)`, `get(store, key)`, `getAll(store, index?, query?)`, `clear()` (clears all stores). Settings save/load via `bb_config`.

Record shapes — transcribe fields exactly:
- Turn (13.2): `id, month_key("2026-06" = timestamp.substring(0,7)), account_label, session_id, timestamp, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, tool_name(null if none), cwd(max 300 chars), is_peak_hour(1|0)`.
- Session (13.3): `session_id, project_name(cwd.split('/').pop()), first_timestamp(min), last_timestamp(max), model(dominant by tokens), turn_count, total_input_tokens, total_output_tokens, total_cache_read, total_cache_creation, account_label`.
- Window (13.4): `window_id(hash of window_start), window_start, window_end, total_input_tokens, total_output_tokens, opus_tokens, sonnet_tokens, haiku_tokens, turn_count, is_peak_hour, is_complete(1 if >5h since window_start)`.

---

## 9. Folder picker + JSONL parsing (dump section 14)

`showDirectoryPicker()` → save handle to `kv.dirHandle`. Recursive walk of all subdirectories. For each `.jsonl` file:
- Skip if `file.lastModified < last_sync_timestamp` (incremental sync; first sync last_sync=0). (See OPEN QUESTION re re-read dedup.)
- Read as text, split by `\n`. Per line: skip empty; `JSON.parse` in try/catch, skip on error (count skipped lines); skip if `type !== "assistant"`; read `message.usage` (`input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens`); skip if input AND output both 0; read `sessionId`||`session_id` and `timestamp`, skip if either missing; read model from `message.model`||top-level `model`; read first `tool_use` block name from `message.content[]` (null if none); read `cwd` (truncate 300); compute `is_peak_hour`.

`isPeakHour(timestamp)`: parse as UTC Date; if UTC day is 6(Sat) or 0(Sun) → false; if UTC hour 13–18 inclusive → true; else false.

`buildWindows(turns)`: sort turns by timestamp asc; iterate, start a new window when gap between consecutive turns > 5h; per window aggregate token counts by model family (opus/sonnet/haiku via `model.includes(...)`), `window_id` = hash of `window_start`. Provide a tiny string-hash (e.g. djb2 → hex); ponytail note it is a non-crypto hash, collision risk negligible at this scale.

`buildSessions(turns)`: group by `session_id`; first/last timestamp = min/max; sum token fields; `project_name` = last path segment of `cwd`; `model` = dominant by token volume.

Write turns/sessions/windows to IDB (`writeTurnsToIDB`). After sync: set `kv.bb_last_sync` = now ISO, `kv.bb_visited` = true. If skipped-line count > 0, surface it in the sync summary (`skipped N malformed lines`) — minimal text only; full toast system is Phase 6.

`account_label` on all writes in Phase 1 = `bb_config.account_1_name || "Primary"`.

---

## 10. Computation constants (dump 15.2, 15.3, section 17)

CAPS (15.2 / 17): `{ pro:{opus:0,sonnet:60}, max5x:{opus:25,sonnet:210}, max20x:{opus:32,sonnet:360} }`. `TOKENS_PER_HOUR = 800000`.

Weekly cap (15.2): `getMondayUTC()` per dump code (day===0 ? -6 : 1-day). `weekTurns` = turns with `timestamp >= mondayTs`. `opusTokens`/`sonnetTokens` = sum `input+output` filtered by `model.includes('opus'|'sonnet')`. `opusHours = opusTokens/TOKENS_PER_HOUR`; same for sonnet. `caps = CAPS[plan] ?? CAPS.max5x`. `opusPct = caps.opus>0 ? opusHours/caps.opus*100 : 0`; `sonnetPct = caps.sonnet>0 ? sonnetHours/caps.sonnet*100 : 0`.

Current window (15.3): `WIN_MS = 5*3600*1000`. `currentWindow` = windows where `(now - new Date(window_start)) < WIN_MS`, sorted desc by `window_start`, first, else null. `windowRemainingMs = currentWindow ? WIN_MS - (now - start) : WIN_MS`.

`loadDataLocal()` builds only the Phase-1 subset of `d` (15.1): `user{plan,billing_start,timezone,last_synced_at}`, `start_check{...}`, `mini_stats{...}`, `forecast{...}`. Do NOT compute insights/daily_usage/heatmap/model_breakdown/top_projects/recent_sessions/turns_by_session/cost_by_model/summary — those belong to later phases.

---

## 11. Patterns / minimal-check

There is no existing code to copy from (greenfield single file). Follow dump.md formulas verbatim; do not introduce abstractions beyond the named helpers.

Per CLAUDE.md "non-trivial logic leaves ONE runnable check behind": add one self-check (an inline `console.assert` block runnable in-browser, no framework) covering the load-bearing pure logic — e.g. assert `isPeakHour('2026-06-15T14:00:00Z')===true` (Mon 14 UTC), `isPeakHour('2026-06-13T14:00:00Z')===false` (Sat), `isPeakHour('2026-06-15T20:00:00Z')===false` (off-peak), and one Start-Check state-selection case (peak + opus_pct 90 → `danger`). Trivial formatting helpers need no test.
