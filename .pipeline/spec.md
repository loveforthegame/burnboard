# Spec — Phase 3: insights-and-sessions

No OPEN QUESTIONS. Forward-planning from ROADMAP.md Phase 3 + dump.md §§7.3, 7.9, 7.10, 15.1, 16, 4.5, 4.7. No `.pipeline/research.md` present, so this is not a rework. Builds on the existing `burnboard.html` (Phase 1+2). Source-of-truth precedence: ROADMAP owns goal/scope/criteria; dump owns exact trigger math, copy, and pricing — both used.

## Goal (from ROADMAP)
User sees plain-language insights about wasteful patterns with copyable fixes, and can drill into recent sessions turn-by-turn plus see cost/summary totals.

## Acceptance criteria (transcribed verbatim from ROADMAP Phase 3)
- [ ] Each of the four insight triggers fires on data matching its condition and stays silent otherwise; when none fire the single green "nothing alarming" card shows.
- [ ] When more than three insights qualify, only three render in danger > warning > info priority order.
- [ ] Each insight card has the correct severity color and a working copy button that shows "copied!" then reverts after 1500ms.
- [ ] Sessions table lists recent sessions with project, relative when, duration, short model name, turns, and formatted tokens; clicking a row expands per-turn detail and collapses the previously open row.
- [ ] Expanded rows show the context-growth mini-bar and mark turns whose input exceeds 3× turn 1 as "heavy context".
- [ ] Cost-by-model and Summary tables compute from filtered data and show the API-pricing-equivalent note.

---

## Files to modify
1. `C:\Users\ue\Desktop\abhinav pending projects\burnboard\burnboard.html` — single self-contained file. Add CSS, render functions, compute functions, the §16 pricing constant. No new files, no new runtime deps (Chart.js already loaded; Phase 3 uses no charts).
2. `C:\Users\ue\Desktop\abhinav pending projects\burnboard\burnboard.test.js` — extend with insight-trigger math and session/turn aggregation tests (the riskiest pure logic).

---

## CRITICAL: filter scope wiring (dump 7.4)

dump 7.4 lists exactly which sections the filter bar affects:
> Affects: Daily chart, Heatmap, Model breakdown, Top projects, **Sessions table, Cost table**.
> Does NOT affect: Start Check, Mini Stats, Week Forecast, **Insights**.

Therefore:
- **Sessions table** and **Cost + Summary grid** → wire into the **filtered** render path (`renderFilteredSections()`, alongside the four Phase 2 charts), so they re-render on every filter change and respect range/model selection. They read from `loadFilteredData()`'s filtered turn set.
- **Smart Insights** → wire into the **unfiltered dashboard** render path (`renderDashboard()`, like Start Check / Mini Stats / Forecast), computed from ALL turns over the trigger's own fixed windows (last 7 days / prior 7 days etc. per dump 7.3). Insights must NOT re-render when the filter changes, and must NOT respect range/model.

This matches the Phase 2 mechanism already in the file (the filter click handler at burnboard.html:1437 calls only `renderFilteredSections()` and never `renderDashboard()` — see Phase 2 AC#1). Do not change that handler's behavior; just make `renderFilteredSections()` also render Sessions + Cost, and make `renderDashboard()` also render Insights.

---

## Layout / DOM placement (dump section 7 top-to-bottom order)

dump 7 section order: 7.1 Start Check, 7.2 Mini Stats, 7.3 Insights, 7.4 Filter Bar, 7.5 Forecast, 7.6 Daily Burn, 7.7 Heatmap, 7.8 Model/Projects, 7.9 Sessions, 7.10 Cost+Summary.

Phase 1+2 currently renders (burnboard.html:1243): `StartCheck + MiniStats + Forecast + FilterBar + ChartsShell`. The existing build placed Forecast before the filter bar; that is a Phase 1/2 decision — do NOT reorder existing sections. Insert the new Phase 3 sections without disturbing existing ones.

In `renderDashboard()` (burnboard.html:1243), change the innerHTML assembly to:
```
renderStartCheck(d) + renderMiniStats(d) + renderInsights(d) +
renderForecast(d) + renderFilterBar() + renderChartsShell() +
renderSessionsShell() + renderCostShell()
```
- `renderInsights(d)` produces a self-contained block (computed in the unfiltered path).
- `renderSessionsShell()` and `renderCostShell()` produce empty `.card` containers (with stable ids) the same way `renderChartsShell()` does (burnboard.html:940). Their content is filled by `renderFilteredSections()`.

In `renderFilteredSections()` (burnboard.html:949), after the existing four chart renders, add:
```
renderSessions(fd);
renderCostSummary(fd);
```

`loadFilteredData()` (burnboard.html:829) must be extended to also return the data Sessions + Cost need (see below). Keep its existing return fields untouched; add new ones.

---

## §16 API pricing constant (deferred from Phase 1 — add now)

Add near the existing CONSTANTS block (burnboard.html:498). Transcribe dump §16 exactly:
```javascript
// dump §16 — API pricing equivalent (USD per 1M tokens). NOT what the user paid.
const PRICING = {
  opus:   { input: 15.00, output: 75.00 },
  sonnet: { input:  3.00, output: 15.00 },
  haiku:  { input:  0.25, output:  1.25 },
};
```
- Keys are model families (matching `modelFamily()` output: opus/sonnet/haiku). `other`/`unknown` family has no pricing → treat its cost as `$0.00`. Mark with a `ponytail:` comment naming the ceiling: unknown-model tokens are not priced; upgrade = add a fallback rate if a future model family appears.
- Note string (display verbatim, dump §16 / 7.10): `api pricing equivalent — not what you paid. you're on a flat subscription.` (lowercase, per dump 4.7).

---

## 7.3 Smart Insights — compute (`computeInsights(allTurns, now)`)

Pure function (extract testable logic). Returns an array of `{ type, severity, title, body, copy_text }` per dump 15.1; the renderer applies priority + max-3 + green-default.

Section header (dump 7.3): `💡 what is going on` · subtext `based on your actual patterns`. Both lowercase verbatim.

Helpers reusing existing code:
- `modelFamily(t.model)` exists (burnboard.html:524).
- "last 7 days" = `new Date(t.timestamp).getTime() >= now - 7*86400000`. "prior 7 days" = `now - 14*86400000 <= ts < now - 7*86400000`. Use ms math consistent with Phase 1/2 (e.g. burnboard.html:798).
- Group turns by `session_id`; sort each session's turns ascending by timestamp for spiral / opus-waste.

### Trigger 1 — Session Spiral (dump 7.3)
```
For sessions in last 7 days with >5 turns:
  ratio = avg_tokens(turns 3–end) / avg_tokens(turns 1–3)
If 3+ sessions have ratio > 3.0 → fire
```
- "last 7 days" session = session has ≥1 turn within last 7 days. ponytail: any-turn-in-window membership; upgrade = first_timestamp-in-window if it matters.
- Session qualifies only if it has **>5 turns** (strictly more than 5, i.e. ≥6).
- per-turn `tokens` = `input_tokens + output_tokens`.
- `avg_tokens(turns 1–3)` = mean of first 3 turns (indices 0,1,2). `avg_tokens(turns 3–end)` = mean of turns from index 2 to last inclusive. dump writes "1–3" and "3–end", which overlap at turn 3 — transcribe literally: early group = turns[0..2], late group = turns[2..end]. ponytail: turn-3 counted in both groups per dump's literal ranges; ceiling = boundary ambiguity, upgrade = clarify with spec author if a future audit flags it.
- `ratio = avgLate / avgEarly`; guard `avgEarly > 0` (skip session if 0).
- Count sessions with `ratio > 3.0` (strict). If count `>= 3` → fire.
- severity: `warning` (amber).
- title (verbatim): `your sessions get expensive fast`
- body (verbatim, `[N]` = count of spiral sessions; number in mono span):
  `[N] recent sessions had 3× cost growth turn-by-turn. The longer you stay in one conversation, the more every message costs — claude re-reads the whole history each turn.`
- copy_text (verbatim, plain text):
  `Run /compact every 30–45 minutes in long sessions, or use /clear when switching to a new task.`

### Trigger 2 — Cache Alert (dump 7.3) — DANGER + WARNING variants
```
cache_rate_now  = cache_read / (cache_read + input) for last 7 days
cache_rate_prev = same for prior 7 days

DANGER:  cache_rate_now < 10% AND cache_rate_prev > 25% AND total_tokens_this_week > 50k
WARNING: cache_rate_now < 15% AND total_tokens_this_week > 100k
```
- `cache_read` = sum `cache_read_tokens`; `input` = sum `input_tokens`. Rate is a fraction; compare against 0.10 / 0.15 / 0.25. Guard denominator `(cache_read + input) > 0`, else rate = 0.
- `total_tokens_this_week` = sum `input_tokens + output_tokens` for last-7-days turns. Thresholds: `> 50000` and `> 100000` (strict).
- Evaluate DANGER first. If DANGER fires, emit DANGER and DO NOT also emit WARNING (one Cache Alert card max). Else evaluate WARNING.
- DANGER severity `danger` (red); WARNING severity `warning` (amber).
- DANGER title (verbatim): `something looks wrong with your cache`
- DANGER body (verbatim; `[X]` = round(cache_rate_prev*100), `[Y]` = round(cache_rate_now*100); numbers in mono):
  `cache hit rate dropped from [X]% to [Y]% this week. this usually means a claude code bug is silently burning 10–20× more tokens.`
- DANGER copy_text (verbatim, newlines preserved):
  `Run: claude --version
If above 2.1.34, run: npm update -g @anthropic-ai/claude-code`
- WARNING title (verbatim): `your cache efficiency is low`
- WARNING body (verbatim; `[X]` = round(cache_rate_now*100); number in mono):
  `only [X]% of input tokens are coming from cache. healthy is 40–70%. changing your CLAUDE.md between sessions kills cache reuse.`
- WARNING copy_text (verbatim, newlines preserved):
  `Put stable rules at the top of CLAUDE.md (these get cached).
Put session-specific notes at the bottom.`

### Trigger 3 — Peak Hour Penalty (dump 7.3)
```
peak_pct = tokens during peak hours / total tokens (last 7 days)
If peak_pct > 0.50 → fire
```
- "tokens during peak hours" = sum `input_tokens + output_tokens` for last-7-days turns where `t.is_peak_hour === 1` (field computed at parse time, burnboard.html:681). "total tokens" = last-7-days total. Guard denominator > 0.
- `peak_pct > 0.50` (strict) → fire.
- severity: `info` (orange / `--accent`).
- title (verbatim): `half your usage is during peak hours`
- body (verbatim; `[X]` = round(peak_pct*100), number in mono; `[local time equivalent]` = local peak range):
  `[X]% of your claude code use this week happened during peak hours (5–11am PT / [local time equivalent]).`
  - `[local time equivalent]` = local-TZ peak range string. Reuse the local-peak computation already in `renderHeatmap()` (burnboard.html:1027–1039): convert 13:00 UTC and 19:00 UTC to `_cfg.timezone` via `Intl.DateTimeFormat`, lowercase, render as `${peakStart} – ${peakEnd}`. ponytail: reuse heatmap's TZ-abbr/fallback; if `Intl` lookup fails, fall back to the IANA string (same as heatmap). Consider extracting that block into a small helper `localPeakRange(tz)` and calling it from both renderHeatmap and here (DRY, optional — only if it does not change heatmap output).
- copy_text (verbatim, newlines preserved):
  `Peak hours: weekdays 5–11am PT (13:00–19:00 UTC).
For big sessions, start before 5am PT or after 11am PT.`

### Trigger 4 — Opus Waste (dump 7.3)
```
sessions in last 7 days WHERE turn_count < 4 AND model = opus
If count ≥ 5 → fire
```
- Per session: session has ≥1 turn in last 7 days, its `turn_count` (count of its turns) `< 4` (strict), and its dominant model family is `opus`. Dominant family = most `input+output` tokens (same rule as `buildSessions()`, burnboard.html:559–566) via `modelFamily`. ponytail: compute dominant family inline over the session's turns; matches buildSessions logic; upgrade = read from the sessions store if perf matters.
- Count such sessions; `>= 5` → fire.
- severity: `info` (orange).
- title (verbatim): `using opus for quick questions`
- body (verbatim; `[N]` = count, number in mono):
  `you have [N] sessions with under 4 turns using opus. haiku handles quick lookups and simple edits just as well and costs 15× less against your weekly cap.`
- copy_text (verbatim, newlines preserved):
  `Add to CLAUDE.md:
Use Haiku for: quick edits, formatting, simple Q&A.
Use Sonnet for: new code, refactors, multi-step tasks.
Use Opus only when I explicitly ask.`

### Priority, max-3, green default (dump 7.3)
- Collect all fired insights into an array.
- Sort by severity priority: `danger` (0) > `warning` (1) > `info` (2). dump 7.3: "DANGER > WARNING > INFO (amber > orange)". Stable within same severity (keep trigger declaration order: spiral, cache, peak, opus).
- Take the first 3 (max 3 shown).
- If the fired array is empty, render a single green card (dump 7.3 verbatim): `nothing alarming — using claude code efficiently.` This green card is a render-time fallback, NOT one of the `insights[]` objects (so `d.insights` is `[]`).
- `d.insights` (dump 15.1) = the post-sort, post-slice array of fired insight objects (may be empty).

---

## 7.3 Smart Insights — render (`renderInsights(d)`)
- Build `d.insights` inside `loadDataLocal()` (burnboard.html:758) by calling `computeInsights(allTurns, now)` — `allTurns` already loaded there (burnboard.html:764). Keeps insights on the unfiltered path. Add `insights` to the object returned at burnboard.html:808.
- Section card wrapper: a `.card`. Header uses the existing `.forecast-header` pattern: `<h3>💡 what is going on</h3><p>based on your actual patterns</p>` (matches Phase 2 chart-card headers, burnboard.html:962, 1041).
- Each insight card: reuse existing state-colored classes (burnboard.html:44–48): `card-red` (danger), `card-amber` (warning), `card-orange` (info), `card-green` (nothing-alarming fallback). Do NOT invent new color CSS.
- Insight card anatomy: title (Outfit 600, `--text`), body (`--mu`, with `<span class="mono">` around injected numbers), and a copy button. Stagger entrance with `.au` + `.d1`/`.d2`/`.d3`. ponytail: reuse existing 80ms stagger classes instead of the dump's 50ms; visual-only deviation, upgrade = add 50ms classes if design insists.
- Copy button: add a `.btn-copy` CSS class per dump 4.5:
  ```
  background: var(--s2); border: 1px solid var(--bdr); color: var(--mu);
  font: Outfit 500 12px; border-radius: 8px; padding: 6px 12px; cursor: pointer;
  ```
  Success state: `background: rgba(52,211,153,.15); color: var(--green);`, text `copied!`, revert after **1500ms** (dump 4.5).
- Copy behavior: a delegated helper `copyText(btn, text)` using `navigator.clipboard.writeText(text)`. On click: write to clipboard, swap text to `copied!` + green class, `setTimeout(..., 1500)` to restore the original label and classes. ponytail: clipboard via navigator.clipboard (Chrome/Edge only — matches the app's Chrome-only File System Access requirement); no execCommand fallback.
  - copy_text contains newlines and `:` — preserve them exactly in the clipboard payload. Do NOT HTML-escape the clipboard string (plain text). Prefer storing it via closure/dataset rather than inline attribute to avoid escaping bugs.

---

## 7.9 Sessions Table — data

Extend `loadFilteredData()` (burnboard.html:829) to also produce (from the FILTERED turn set — respects range + model, dump 7.4):
- `recent_sessions` (dump 15.1): last 20 sessions by recency. Group filtered turns by `session_id` via `buildSessions(turns)` (burnboard.html:533) which already returns the exact dump-15.1 session shape. Sort by `last_timestamp` descending, slice to 20.
  - ponytail: rebuild sessions from filtered turns via buildSessions rather than reading the sessions store, so model/range filters apply; the sessions store holds all-data sessions. Upgrade = query sessions store + per-turn re-filter if buildSessions gets expensive.
- `turns_by_session` (dump 15.1): map `session_id → [{ timestamp, input_tokens, output_tokens, cache_read_tokens, tool_name }]` for the 20 sessions in `recent_sessions` only. Built from the same filtered turn set, sorted ascending by timestamp per session. Only include the five dump-15.1 fields.

## 7.9 Sessions Table — render (`renderSessions(fd)`)
Target: the empty card from `renderSessionsShell()` (e.g. id `#sec-sessions`). Section header (dump 7.9): `📋 recent sessions` · subtext `click a row to expand`.

Columns (dump 7.9): `Project · When · Duration · Model · Turns · Tokens · ›`
- **Project**: `s.project_name`.
- **When**: relative time — dump examples `3h ago` / `yesterday` / `Jun 12`. The existing `relTime()` (burnboard.html:744) returns `Nd ago` — not matching. Add `relWhen(iso)` using `s.last_timestamp`: <60 min → `Nm ago`; <24h → `Nh ago`; 1 day ago → `yesterday`; older → `MMM D` (`Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'})`). ponytail: keep relTime for the header "synced N ago"; relWhen is the dump-7.9 session variant.
- **Duration**: `last_timestamp - first_timestamp`, format per dump 7.9: 0–59s → `< 1 min`; <60 min → `N min`; ≥60 min → `Hh Mm`. Add `fmtSessionDur(ms)` (do NOT change existing `fmtDur` at burnboard.html:738, whose format differs).
- **Model**: short name. `s.model` is already the family string (`opus`/`sonnet`/`haiku`/`other`) from buildSessions. Display family directly; map `other` → `unknown`. ponytail: buildSessions reduced model to family in Phase 1, so the exact `opus-4` version suffix is not retained; display the family name. Upgrade = retain a representative full model string in the session record if the version suffix is required. Deviation flagged, not an open question (no data-integrity / money impact).
- **Turns**: `s.turn_count` (mono).
- **Tokens**: `fmtTokens(s.total_input_tokens + s.total_output_tokens)` (mono). Reuse `fmtTokens` (burnboard.html:823).
- **›**: expand chevron.
- Row hover (dump 7.9): `--bdr2` border + slight lift.
- Numbers (turns, tokens, durations, when-times) in JetBrains Mono via `.mono`.
- Empty state: if `recent_sessions.length === 0`, show `no sessions in this range` (matches Phase 2 empty-state idiom).

Expanded row (dump 7.9 — click to expand, one open at a time):
- Columns: `Time · Input · Output · Cache read · Tool used`. One row per turn from `fd.turns_by_session[session_id]`.
- **Time**: `Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'})` on the turn timestamp (mono).
- **Input / Output / Cache read**: `fmtTokens(turn.input_tokens)`, `fmtTokens(turn.output_tokens)`, `fmtTokens(turn.cache_read_tokens)` (mono).
- **Tool used**: `turn.tool_name` or `—` if null.
- **Context-growth mini-bar** (dump 7.9): cumulative token total as % of session max, thin bar per row. cumulative = running sum of `input+output` up to and including the turn; session max = the largest cumulative (= final total); bar width = `cumulative / sessionMaxCumulative * 100`%. Reuse `.progress-track`/`.progress-fill` idiom (burnboard.html:144). ponytail: "session max" interpreted as max cumulative (= total), so last turn's bar is 100%; matches "% of session max".
- **Heavy-context highlight** (dump 7.9): if turn N input > 3× turn 1 input → row background `--amdim` (a `.heavy-context` class), label `heavy context` right-aligned. turn-1 input = `turns[0].input_tokens`; flag when `turn.input_tokens > 3 * turns[0].input_tokens` (strict). Guard `turns[0].input_tokens > 0` (if 0, flag nothing — avoids every row flagging). ponytail: 0-baseline guard prevents all-rows-flagged when first turn has no input.
- **One open at a time**: module-level `_openSession` id + delegated click handler on the sessions container. Clicking a row toggles its detail; clicking another closes the previously open one; second click on the same row closes it (dump 7.9). Keep filter handling untouched — add a separate listener or extend the existing dashboard-content handler (burnboard.html:1437) to also match `[data-session-row]` without affecting `[data-ftype]` branch.

---

## 7.10 Cost + Summary Grid — data

Extend `loadFilteredData()` to also produce (from the FILTERED turn set, dump 7.4):
- `cost_by_model` (dump 15.1): per family `{ model: <family>, total_tokens, estimated_cost_usd }`. cost = `(inputSum/1e6)*PRICING[fam].input + (outputSum/1e6)*PRICING[fam].output`, summed per family. Only families with `total_tokens > 0`. Order opus, sonnet, haiku (then unknown/other with cost 0 if present). ponytail: cache_read/cache_creation tokens not priced (dump §16 table lists only input/output rates); upgrade = add cache pricing if the spec ever lists it.
- `summary` (dump 15.1): `{ total_sessions, total_turns, total_input, total_output, total_cache_read, total_api_cost_usd }`. `total_sessions` = distinct `session_id` count in filtered turns; `total_turns` = filtered turn count; `total_input`/`total_output`/`total_cache_read` = field sums; `total_api_cost_usd` = sum of `cost_by_model[].estimated_cost_usd`.
- `total_api_cost_usd` (dump 15.1 top-level) = same as `summary.total_api_cost_usd`.

## 7.10 Cost + Summary Grid — render (`renderCostSummary(fd)`)
Two-column grid at bottom (reuse `.charts-grid`, burnboard.html:190). Target: card(s) from `renderCostShell()`.

**Left — Cost by Model** (dump 7.10): table columns `Model | Tokens | Est. Cost`. Rows from `fd.cost_by_model`. Model = family. Tokens = `fmtTokens(total_tokens)` (mono). Est. Cost = `$` + `.toFixed(2)` (mono). Empty state: if `cost_by_model.length === 0`, show `no usage in this range`. Note (dump 7.10 / §16, verbatim, muted small): `api pricing equivalent — not what you paid. you're on a flat subscription.`

**Right — Summary** (dump 7.10): key-value list (label left `--mu`, value right `.mono c-text`). Rows exactly (dump 7.10 labels):
- `Sessions` → `summary.total_sessions`
- `Turns` → `summary.total_turns`
- `Input tokens` → `fmtTokens(summary.total_input)`
- `Output tokens` → `fmtTokens(summary.total_output)`
- `Cache reads` → `fmtTokens(summary.total_cache_read)`
- `API equiv.` → `$` + `summary.total_api_cost_usd.toFixed(2)`

---

## CSS to add (minimal — dump 4.4, 4.5, 7.9, 7.10)
- `.btn-copy` (dump 4.5 copy button) + success state (green 15% bg). 1500ms revert handled in JS.
- Sessions table: lightweight table style (`.sessions-table`, `th`/`td`, row hover `--bdr2`), expanded-detail block, mini-bar (reuse `.progress-track`/`.progress-fill`), `.heavy-context` (bg `--amdim`) + right-aligned `heavy context` label.
- Cost/summary: `.kv-list` row layout and `.cost-table` (or reuse the sessions-table style).
- Insight cards: reuse existing `card-red/amber/orange/green`; no new color CSS — only spacing / copy-button placement if needed.
- Match the existing terse single-line CSS style. Mark any intentional simplification with `ponytail:`.

---

## Existing patterns to follow (named)
- Empty-card shell + fill-later: `renderChartsShell()` (burnboard.html:940) → mirror with `renderSessionsShell()`, `renderCostShell()`.
- Filtered pipeline: `loadFilteredData()` (829) + `renderFilteredSections()` (949) — extend both, do not fork.
- Unfiltered dashboard data: `loadDataLocal()` (758) returns `d`; add `insights` there.
- Section header markup: `.forecast-header` h3+p (962, 1041).
- Token formatting: `fmtTokens()` (823). Header relative time: `relTime()` (744). Local-TZ peak string: block inside `renderHeatmap()` (1027–1039).
- State-colored cards: classes at 44–48. Mono numbers: `.mono` (38).
- Delegated click handler idiom: tab-bar (1425) and filter-bar (1437).
- Self-check block at top of `<script>` (335) — add 1–2 cheap insight assertions there; main coverage goes in burnboard.test.js.

---

## CLAUDE.md hard rules that apply (quoted)
- "Never invent a state, field, name, or requirement not in spec docs." — All copy, titles, thresholds, field names transcribed from dump verbatim above. Do not add insight types, columns, or summary rows beyond those listed.
- "Mark intentional simplifications with a ponytail: comment." — Every shortcut above names its ceiling + upgrade path; carry those into code comments.
- dump 4.2 / 4.7: "Numbers are always mono." and lowercase copy. Every injected number wraps in `<span class="mono">`; all UI copy lowercase exactly as dump writes it. EXCEPTION: copy-button clipboard payloads keep the dump's exact casing, including the capitalized command/file lines (`Run:`, `Add to CLAUDE.md:`, `Put`, `Use`) — those are command/config text, transcribe verbatim, do not lowercase.

---

## Tests to add (`burnboard.test.js`) — riskiest pure logic
Extend the existing no-framework harness. Mirror the `computeFilteredData` pattern (burnboard.test.js:538): copy the pure compute logic into the test file and assert. Cover:

**computeInsights trigger math:**
- Session Spiral: fires at exactly 3 sessions with ratio > 3.0; silent at 2; silent when sessions have ≤5 turns; ratio boundary (3.0 exactly does NOT fire, >3.0 does); avgEarly=0 session skipped.
- Cache Alert DANGER: fires when now<10% AND prev>25% AND week>50k; silent if any condition fails; boundaries at 10% / 25% / 50k. WARNING: fires when now<15% AND week>100k; boundaries at 15% / 100k. DANGER suppresses WARNING when both would qualify (only one card).
- Peak Penalty: fires when peak_pct > 0.50; silent at exactly 0.50; uses `is_peak_hour`.
- Opus Waste: fires at ≥5 qualifying sessions (turn_count<4 AND dominant=opus, ≥1 turn in last 7 days); silent at 4; turn_count boundary (3 qualifies, 4 does not); model boundary (sonnet session excluded).
- Priority/slice: when >3 fire, exactly 3 returned in danger>warning>info order; empty array when none fire (green-card fallback is render-time → assert `[].length === 0`).

**Session/turn aggregation:**
- `recent_sessions`: built from filtered turns, sorted by last_timestamp desc, sliced to 20 (test 21+ sessions → 20).
- `turns_by_session`: only top-20 sessions present; per-session turns sorted ascending; only the five dump-15.1 fields.
- Duration formatter: `< 1 min` (<60s), `N min` (<60m), `Hh Mm` (≥60m) boundaries.
- `relWhen`: `Nm ago` / `Nh ago` / `yesterday` / `MMM D` boundaries.
- Context-growth: cumulative running sum; last turn = 100% of session max.
- Heavy-context: input > 3× turn1 flagged (strict); 3× exactly not flagged; turn1=0 baseline → nothing flagged.
- `cost_by_model`: cost = input/1e6*rate + output/1e6*rate per family using PRICING; unknown family → $0; only >0-token families.
- `summary`: distinct-session count, turn count, field sums, total_api_cost = sum of cost_by_model costs.

Keep tests assert-based, no fixtures, no new deps. For DOM-only behavior add a `CANNOT-VERIFY-HEADLESS` note (as burnboard.test.js:921): copy-button 1500ms revert, one-row-open-at-a-time toggle, insights-on-unfiltered-path vs sessions/cost-on-filtered-path — verify by source inspection and note it.

---

## SCOPE GUARD — explicitly OUT of Phase 3
Do NOT build any of the following (later phases / not in Phase 3 scope):
- History tab (dump 8: monthly/weekly/billing views, comparison chart, sparkline) — Phase 4.
- Export CSV (dump 8.4) — Phase 4.
- `recomputeMonthlyCache()` / `monthly_cache` population / `getWeeklyBuckets()` (dump 15.4, 15.5) — Phase 4. Leave `monthly_cache` empty as Phase 1 did.
- Token Tips tab (dump 9) — Phase 6.
- Two-account tracking: sync prompt modal, account selector, combined-totals card, per-account labels (dump 10) — Phase 5. Insights/Sessions/Cost use all data with the single existing `account_label`; no account UI.
- What's Coming tab/modal (dump 11) — Phase 6.
- Reconnect screen / `requestPermission()` re-grant flow (dump 5.3) — Phase 6.
- Toast system, favicon-by-state, `prefers-reduced-motion` polish, browser-support bar beyond what Phase 1 shipped (dump 18, 4.6) — Phase 6.
- No new charts (Phase 3 sections are tables/cards only). No new runtime dependencies.
- Do not reorder or restyle existing Phase 1/2 sections; only insert the three new blocks (Insights, Sessions, Cost+Summary) and extend the two existing pipelines.
