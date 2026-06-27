# BurnBoard
**Claude Code Token Usage Dashboard · Complete Specification**

---

## 1. WHAT IT IS

BurnBoard is a single `.html` file you open in Chrome. It reads your Claude Code
session history directly from your local `~/.claude/projects/` folder, stores
everything in IndexedDB (your browser's built-in database), and renders a
full usage dashboard. Nothing ever leaves your machine. No server, no account,
no deployment, no cost.

**The problem it solves:**
You're deep in a Claude Code session and hit the rate limit with no warning.
BurnBoard tells you — before you open Claude — whether now is a good time to
start, how much budget you have left this week, and how your usage has trended
over time.

---

## 2. ARCHITECTURE

**Stack:**
- Single `.html` file — all JS, CSS, and markup in one file
- IndexedDB — browser-native persistent storage, ~250MB capacity
- File System Access API (`showDirectoryPicker`) — reads your `.claude` folder
- Chart.js — charts
- GSAP — animations

**How it works:**
1. User picks their `~/.claude/projects/` folder in Chrome's folder picker
2. Browser reads all `.jsonl` files recursively, locally
3. Parsed turns are written to IndexedDB
4. Dashboard queries IndexedDB and computes everything in JS
5. On return visits: one-click folder reconnect, then incremental re-sync

**No network calls. No backend. No accounts. No tokens.**

---

## 3. WHAT IT TRACKS

| Source | Tracked |
|---|---|
| Claude Code sessions | ✅ |
| claude.ai web chat | ❌ no local files written |
| Claude Desktop | ❌ different format |
| Cowork | ❌ server-side only, impossible |
| Active/live sessions | ❌ jsonl written after session ends |
| Conversation content | ❌ never — token counts only |

---

## 4. DESIGN SYSTEM

### 4.1 Color palette

```
Backgrounds (darkest to slightly lighter):
  --bg:  #080706    page background
  --s1:  #0F0D0B    card backgrounds
  --s2:  #171411    nested surfaces, inputs
  --s3:  #1E1A16    deep nesting
  --s4:  #252018    extra depth
  --s5:  #2C261E    deepest surfaces

Borders:
  --bdr:  rgba(255,255,255, .055)   default border
  --bdr2: rgba(255,255,255, .10)    hover border
  --bdr3: rgba(255,255,255, .16)    active border

Accent — orange:
  --accent:  #F97316
  --accent2: #FB923C    lighter variant
  --accent3: #FDBA74    very light
  --adim:    rgba(249,115,22, .09)   faint tint
  --abright: rgba(249,115,22, .16)   stronger tint

Semantic:
  --green: #34D399    good/safe
  --gdim:  rgba(52,211,153, .08)
  --amber: #FBBF24    caution
  --amdim: rgba(251,191,36, .08)
  --red:   #F87171    danger
  --rdim:  rgba(248,113,113, .08)

Text:
  --text: #EDE8E3    primary
  --mu:   #6B6460    muted / secondary
  --mu2:  #4A4440    more muted
  --mu3:  #302C28    near-invisible
```

### 4.2 Typography

```
Font 1 — Outfit (Google Fonts)
  Used for: all headings, labels, body text, UI copy
  Weights: 400 (body), 500 (medium), 700/800/900 (headings)

Font 2 — JetBrains Mono (Google Fonts)
  Used for: every number, token count, timestamp, percentage, cost figure
  Weights: 400, 500
```

Numbers are always mono. This is non-negotiable. Every stat value, counter,
and metric uses JetBrains Mono.

### 4.3 Atmospheric effects

**Orange radial glow** — top-left corner of page, subtle:
```css
background: radial-gradient(
  ellipse 55% 40% at 0% 0%,
  rgba(249,115,22, .08),
  transparent 60%
);
```

**Film grain** — full-page noise texture at very low opacity (~2.2%),
applied via an SVG `feTurbulence` filter on a `::before` pseudo-element.
Adds depth without being visible — you feel it more than see it.

**Scrollbar** — 3px wide, color `--mu3`, no track.

### 4.4 Card style

All cards:
```
background: var(--s1)
border: 1px solid var(--bdr)
border-radius: 14px
padding: 20–24px
```

On hover (interactive cards): `border-color: var(--bdr2)`, `transform: translateY(-1px)`

State-colored cards (Start Check, insight cards):
- Green state: left border 2px `--green`, background tinted `--gdim`
- Amber state: left border 2px `--amber`, background tinted `--amdim`
- Red state: left border 2px `--red`, background tinted `--rdim`
- Orange state: left border 2px `--accent`, background tinted `--adim`

### 4.5 Buttons

**Primary button (orange):**
```
background: var(--accent)
color: #000
border-radius: 10px
padding: 14px 28px
font: Outfit 600 15px
hover: brightness(1.08), translateY(-1px), orange box-shadow
```

**Secondary / pill button:**
```
background: var(--s2)
border: 1px solid var(--bdr)
color: var(--mu)
border-radius: 8px
padding: 6px 14px
font: Outfit 500 13px
active/selected: border-color var(--accent), color var(--accent)
```

**Copy button:**
```
background: var(--s2)
border: 1px solid var(--bdr)
color: var(--mu)
font: Outfit 500 12px
On success: background var(--green) 15%, color var(--green), text "copied!"
Revert after 1500ms
```

### 4.6 Motion

- Nav entrance: fade in, 0.5s ease
- Stat cards: stagger reveal, 80ms between cards, `translateY(6px) → 0` + `opacity 0 → 1`
- Insight cards: stagger 50ms, same motion
- Tip cards: stagger 60ms
- Number counters: `gsap.from(el, { opacity:0, y:4, duration:.4 })` on load
- All animations respect `prefers-reduced-motion`

### 4.7 Tone and copy

Lowercase where natural. Direct. No filler words.
- ✅ `"good time to start."` 
- ✅ `"your cache hit rate dropped 60% this week."`
- ❌ `"Welcome to your BurnBoard Dashboard!"`
- ❌ `"Based on the analysis of your usage patterns..."`

---

## 5. SCREENS

### 5.1 Boot logic

```
Open file in browser
  ├── Check IndexedDB for saved folder handle
  │     ├── Found + permission granted   → run sync → Dashboard
  │     ├── Found + permission revoked   → Reconnect screen
  │     └── Not found                   → Connect screen
  └── No IDB data                       → Connect screen
```

### 5.2 Connect screen

Shown first time only.

**Layout** (centered, max-width 460px):
- 🔥 icon + `"BurnBoard"` headline, Outfit 900, large
- Tagline: `"your claude code is bleeding tokens somewhere. this tells you where."`
- Trust strip (horizontal, 4 items): `✓ no prompts stored` · `✓ token counts only` · `✓ fully local` · `✓ free forever`
- Accordion: `"what can burnboard actually see?"` — collapses on return visits
  - Lists what's tracked (Claude Code sessions) and what's not (web, Cowork, Desktop)
- Numbered steps: `1 pick folder` · `2 browser reads locally` · `3 stop being surprised`
- Primary CTA button: `"📂 select ~/.claude/projects"`
- Helper notes below button:
  - macOS: `"press ⌘ Shift . to show hidden folders"`
  - Windows: `"usually at C:\Users\[you]\.claude\projects"`
- Amber warning bar (hidden unless Firefox/Safari): `"folder sync needs Chrome or Edge"`

### 5.3 Reconnect screen

Shown when folder handle exists but browser restarted (Chrome privacy — permissions don't persist across restarts).

**Layout:**
- 🔌 icon
- `"browser forgot the folder"`
- Explanation: `"this is chrome enforcing privacy, not a bug. your data is still here."`
- Primary CTA: `"📂 reconnect ~/.claude/projects"` — calls `requestPermission()` on saved handle (no new picker needed, one click)
- Secondary link: `"skip and show last data"` → loads dashboard from IndexedDB without re-parsing

### 5.4 Sync screen

Shown during JSONL parsing.

**Layout:**
- Spinning icon (CSS animation)
- Status message (updates live): `"scanning .jsonl files..."` → `"found 847 turns..."` → `"writing to storage..."` → `"computing dashboard..."`
- Progress bar: `--accent` color fill, 0–100%, updates per file
- Privacy note: `"only token counts and timestamps are being read. no conversation content."`

### 5.5 Dashboard screen

Main screen. Nav + tab bar + tab panels. See Section 7 for full feature specs.

---

## 6. NAVIGATION AND TABS

```
┌──────────────────────────────────────────────────────────────────────┐
│  🔥 BurnBoard   [Max 5x · $100]          🔒 no prompts stored        │
│                        synced 3m ago   [💬 tips] [↻ sync] [⚙ settings] │
└──────────────────────────────────────────────────────────────────────┘

[📊 dashboard]  [📅 history]  [💬 token tips]  [✨ what's coming]
```

**Nav items:**
- Logo: `"🔥 BurnBoard"` — Outfit 800
- Plan badge: pill showing user's plan, e.g. `"Max 5x · $100"` — `--s2` background, `--mu` text
- Lock icon + `"no prompts stored"` — persistent reassurance, small, muted
- `"synced N ago"` — relative time, muted
- Tips button: opens Token Tips tab
- Sync button `↻` — triggers re-sync
- Settings `⚙` — opens settings overlay

**Tab bar:**
- `📊 dashboard` — selected by default
- `📅 history` — monthly + weekly breakdown
- `💬 token tips` — 6 efficiency tip cards
- `✨ what's coming` — teaser for upcoming features

Active tab: `--accent` bottom border, `--text` color. Inactive: `--mu`.

---

## 7. DASHBOARD TAB

Layout flows top to bottom. Every section full-width, max container width 1200px, centered.

---

### 7.1 Start Check (P0)

The largest element, always above the fold. Minimum 200px tall.

**Purpose:** One clear answer to "should I open Claude Code right now?"

**Left side:** State headline + body text + action hint
**Right side:** Large mono number — time remaining in current 5-hour window

#### State machine

```
INPUTS:
  now (UTC)
  user timezone (from settings)
  opus_pct: % of weekly opus cap used
  sonnet_pct: % of weekly sonnet cap used
  window_remaining: time left in current 5hr window (minutes)

PEAK HOURS: weekdays only, Mon–Fri, 13:00–19:00 UTC (5am–11am PT)
```

| State | Condition | Border | Headline | Body |
|---|---|---|---|---|
| GOOD | off-peak + opus<70% + sonnet<75% | green | `"good time to start."` | `"off-peak right now. [Xh Ym] left in window. [Z]% of weekly opus remaining. go build."` |
| CAUTION — peak | peak hours + caps ok | amber | `"okay to start, but heads up."` | `"peak hours active until [local time]. window burns faster than usual. off-peak starts at [local time]."` |
| CAUTION — budget | off-peak + opus>70% OR sonnet>75% | amber | `"off-peak, but budget is getting thin."` | `"good time technically. you've used [X]% of opus cap. save the hard problems for when it matters."` |
| DANGER | peak hours + opus>80% OR sonnet>85% | red | `"not a great time."` | `"peak hours + running low on weekly budget. window burns faster right now. off-peak starts [local time]. resets [day]."` |
| WEEKEND | Sat or Sun UTC | green | `"weekend — no peak hours."` | `"peak hours only apply weekdays. go as hard as you want."` |
| NO DATA | nothing synced yet | muted | `"sync your data to see this."` | `"connect your .claude folder to get window status and weekly forecast."` |

**Right panel — window clock:**
- Number: `"4h 22m"` — JetBrains Mono, ~48px, `--text`
- Label: `"window remaining"` — Outfit 500 12px, state color
- Subtext: `"started 38m ago"` — muted

**Pulsing status dot:** 6px circle, state color, CSS `@keyframes pulse` animation, sits left of headline.

---

### 7.2 Mini Stats Row (P0)

Three equal-width cards directly below Start Check.

**Card 1 — Current Window**
```
Label:    CURRENT WINDOW
Value:    4h 22m              (mono, 28px)
Sub:      started 38m ago
Color:    green >2h / amber 1–2h / red <1h
Tooltip:  "Time left in your 5-hour rolling window. Starts on your first
           message. Resets 5 hours later, not at midnight."
```

**Card 2 — Weekly Cap**
```
Label:    WEEKLY CAP
Value:    34%                 (mono, 28px)
Sub:      of cap used · resets Monday
Color:    green <60% / amber 60–80% / red >80%
Tooltip:  "Estimated % of your 7-day model cap used.
           Community estimates — not official Anthropic numbers."
```

**Card 3 — Today vs Average**
```
Label:    TODAY VS AVG
Value:    1.4×                (mono, 28px)
Sub:      vs 30-day daily average
Color:    green ≤1.0× / amber 1.0–2.0× / red >2.0×
Tooltip:  "Today's token total vs your 30-day daily average.
           Above 1.0× means you're burning harder than usual."
```

---

### 7.3 Smart Insights (P1)

Section header: `"💡 what is going on"` · subtext: `"based on your actual patterns"`

2–4 cards rendered based on what's detected. Max 3 shown simultaneously.
If nothing fires: single green card — `"nothing alarming — using claude code efficiently."`

#### Insight 1 — Session Spiral

```
TRIGGER:
  For sessions in last 7 days with >5 turns:
    ratio = avg_tokens(turns 3–end) / avg_tokens(turns 1–3)
  If 3+ sessions have ratio > 3.0 → fire

SEVERITY: amber
TITLE: "your sessions get expensive fast"
BODY: "[N] recent sessions had 3× cost growth turn-by-turn. The longer
       you stay in one conversation, the more every message costs —
       claude re-reads the whole history each turn."
COPY TEXT: "Run /compact every 30–45 minutes in long sessions,
            or use /clear when switching to a new task."
```

#### Insight 2 — Cache Alert

```
TRIGGER:
  cache_rate_now  = cache_read / (cache_read + input) for last 7 days
  cache_rate_prev = same for prior 7 days

  DANGER: cache_rate_now < 10% AND cache_rate_prev > 25%
           AND total_tokens_this_week > 50k
  WARNING: cache_rate_now < 15% AND total_tokens_this_week > 100k

SEVERITY (DANGER): red
TITLE: "something looks wrong with your cache"
BODY: "cache hit rate dropped from [X]% to [Y]% this week. this usually
       means a claude code bug is silently burning 10–20× more tokens."
COPY TEXT: "Run: claude --version
            If above 2.1.34, run: npm update -g @anthropic-ai/claude-code"

SEVERITY (WARNING): amber
TITLE: "your cache efficiency is low"
BODY: "only [X]% of input tokens are coming from cache. healthy is 40–70%.
       changing your CLAUDE.md between sessions kills cache reuse."
COPY TEXT: "Put stable rules at the top of CLAUDE.md (these get cached).
            Put session-specific notes at the bottom."
```

#### Insight 3 — Peak Hour Penalty

```
TRIGGER:
  peak_pct = tokens during peak hours / total tokens (last 7 days)
  If peak_pct > 0.50 → fire

SEVERITY: orange (info)
TITLE: "half your usage is during peak hours"
BODY: "[X]% of your claude code use this week happened during peak hours
       (5–11am PT / [local time equivalent])."
COPY TEXT: "Peak hours: weekdays 5–11am PT (13:00–19:00 UTC).
            For big sessions, start before 5am PT or after 11am PT."
```

#### Insight 4 — Opus Waste

```
TRIGGER:
  sessions in last 7 days WHERE turn_count < 4 AND model = opus
  If count ≥ 5 → fire

SEVERITY: orange (info)
TITLE: "using opus for quick questions"
BODY: "you have [N] sessions with under 4 turns using opus.
       haiku handles quick lookups and simple edits just as well
       and costs 15× less against your weekly cap."
COPY TEXT: "Add to CLAUDE.md:
            Use Haiku for: quick edits, formatting, simple Q&A.
            Use Sonnet for: new code, refactors, multi-step tasks.
            Use Opus only when I explicitly ask."
```

**Priority order when >3 fire:** DANGER > WARNING > INFO (amber > orange).

---

### 7.4 Filter Bar (P0)

```
RANGE   [7d]  [30d ●]  [90d]  [all]    |    MODEL   [all ●]  [opus]  [sonnet]  [haiku]
```

Affects: Daily chart, Heatmap, Model breakdown, Top projects, Sessions table, Cost table.

Does NOT affect: Start Check, Mini Stats, Week Forecast, Insights.

---

### 7.5 Week Forecast (P0)

Section header: `"📅 week forecast"` · subtext: `"at your current pace"`

**Forecast sentence** (plain English, one line, colored by severity):
- Green: `"you're on track to finish the week with 42% of opus remaining."`
- Amber: `"at your current pace, opus runs out thursday around 6pm."`
- Red: `"opus cap hit. resets in 4 days (monday)."`

**Progress bars:**
```
Opus     ████████████░░░░    62%   ·   4.2h used of ~25h est.  ·  resets in 4 days
Sonnet   ███░░░░░░░░░░░░░    18%   ·   38h used of ~210h est.  ·  resets in 4 days
```
Bar fill: green <60% → amber 60–80% → red >80%.

**Disclaimer (always visible, small, muted):**
`"cap estimates are community-reported, not official anthropic numbers."`

---

### 7.6 Daily Burn Chart (P1)

Section header: `"🔥 daily burn rate"`

Bar chart:
- X axis: days (range-filtered)
- Y axis: total tokens (formatted as K/M)
- Bar color: `--accent` gradient top to bottom (bright → dim)
- Today's bar: brighter orange + `"today"` label above
- Hover tooltip: date · tokens · sessions that day
- Chart height: 240px
- Empty state: `"no usage in this range"` centered in chart area

---

### 7.7 Peak Hour Heatmap (P1)

Section header: `"🌡 when you work"` · subtext: `"amber = peak hours"`

Grid: 7 rows (Mon–Sun) × 24 columns (hours 0–23 UTC).

- Cell: transparent → `--accent` by token intensity (log scale)
- Peak columns (13–18 UTC, weekday rows only): faint amber background tint underneath token color
- Cell hover tooltip: `"[Day] [Hour]:00 [user TZ] · [X] tokens · peak / off-peak"`
- Min 3 days of data to render; otherwise: `"add more data to see your patterns"`

Below heatmap (small, muted):
`"in your timezone (IST): peak hours = 6:30pm – 12:30am"`
Computed from user's saved timezone using `Intl.DateTimeFormat`.

---

### 7.8 Model Breakdown + Top Projects (P1)

Two-column equal-width grid.

**Left — Model Breakdown**
Doughnut chart.
- Segments: Opus (purple tint), Sonnet (sky blue tint), Haiku (teal tint), Unknown (muted)
- Center: total tokens in range (mono)
- Legend below: model name · tokens · %

**Right — Top Projects**
Horizontal bar chart.
- Y axis: project folder names (from `cwd`, last segment)
- X axis: tokens
- Top 8 by token volume
- Bar color: `--accent`
- Hover tooltip: project name · total tokens · sessions

---

### 7.9 Sessions Table (P1)

Section header: `"📋 recent sessions"` · subtext: `"click a row to expand"`

**Columns:**
```
Project  ·  When  ·  Duration  ·  Model  ·  Turns  ·  Tokens  ·  ›
```

- Project: folder name from cwd
- When: relative time — `"3h ago"` / `"yesterday"` / `"Jun 12"`
- Duration: `"< 1 min"` / `"43 min"` / `"2h 14m"`
- Model: short name — `"opus-4"` not `"claude-opus-4-20250514"`
- Tokens: formatted — `"284K"`
- Row hover: `--bdr2` border, slight lift

**Expanded row (click to expand, one open at a time):**

Columns: `Time · Input · Output · Cache read · Tool used`

- One row per turn
- "context growth" mini-bar: cumulative token total as % of session max, rendered as thin bar per row
- If turn N input > 3× turn 1 input: row background `--amdim`, label `"heavy context"` right-aligned
- Close on second click or clicking another row

---

### 7.10 Cost + Summary Grid (P2)

Two-column grid at bottom.

**Left — Cost by Model**
```
| Model    | Tokens  | Est. Cost |
| opus-4   | 1.2M    | $18.00    |
| sonnet-4 | 8.4M    | $25.20    |
| haiku-4  | 340K    | $0.09     |
```
Note: `"api pricing equivalent — not what you paid. you're on a flat subscription."`

**Right — Summary**
Key-value list:
```
Sessions      18
Turns         847
Input tokens  4.2M
Output tokens 1.1M
Cache reads   2.8M
API equiv.    $43.29
```

---

## 8. HISTORY TAB

Section header: `"📅 your usage, over time."`

**View toggle + controls:**
```
[Monthly ●]  [Weekly]  [Billing Cycle]          [Account: All ▾]   [↓ Export CSV]
```

Account dropdown only visible if two accounts configured (see Section 10).

---

### 8.1 Monthly View

12-card grid, newest first (top-left = most recent month).

**Each card:**
```
┌─────────────────────────────┐
│  June 2026                  │
│                             │
│  4,218,400                  │
│  tokens                     │
│                             │
│  18 sessions                │
│  12 active days             │
│  mostly sonnet              │
│                             │
│  ↑ +12% vs May              │
└─────────────────────────────┘
```

- Month + year: Outfit 600, `--mu`
- Token number: JetBrains Mono, 28px, `--text`
- Sessions, active days, dominant model: Outfit 400, 12px, `--mu`
- Delta: green `↑` or red `↓`, Outfit 600, 12px
- No data month: card at 40% opacity, `"no activity"` in center
- Only 1 month: hide delta, show `"not enough history yet"`

Cards animate in with 30ms stagger on tab switch.

**Below grid — Monthly comparison chart:**
- Bar chart: X = months (last 12), Y = total tokens
- Bars: orange-tinted for opus-heavy months, blue-tinted for sonnet-heavy months
- Dotted line overlay: 30-day rolling average
- Hover tooltip: month · total tokens · sessions · avg per day

---

### 8.2 Weekly View

Section header: `"week-by-week breakdown"`

Table, last 12 weeks, newest first:

```
┌──────────────┬───────────┬──────────┬────────────┬──────────┬───────────┐
│ Week         │ Tokens    │ Opus hrs │ Sonnet hrs │ Sessions │ vs prior  │
├──────────────┼───────────┼──────────┼────────────┼──────────┼───────────┤
│ Jun 23–29    │ 1,218,400 │   4.2h   │   18.1h    │   12     │ ↑ +15%    │
│ Jun 16–22    │ 1,048,000 │   3.8h   │   16.2h    │    9     │ ↓ -3%     │
│ Jun 9–15     │ 1,081,200 │   4.1h   │   17.0h    │   10     │ ↑ +8%     │
│ Jun 2–8      │   992,800 │   3.5h   │   15.4h    │    8     │  —        │
└──────────────┴───────────┴──────────┴────────────┴──────────┴───────────┘
```

- Week = Mon–Sun UTC
- Zero-activity weeks: shown as faded row, not hidden
- Oldest visible week: `"—"` in vs-prior column
- Below table: sparkline chart — 12 weeks on X, tokens on Y, orange area fill

---

### 8.3 Billing Cycle View

Uses `billing_start_day` from settings (default: 1).

**Current cycle card:**
```
Cycle: Jun 1 – Jun 30  ·  day 26 of 30

3,218,400 tokens

vs same point last cycle: ↑ +22%

[████████████████████░░░░] 86% of last cycle's total
```

**Last 3 cycles table:**
```
| Cycle         | Total Tokens      | Sessions | vs avg |
| Jun 1–30 ●   | 3,218,400 ongoing |   14     | +18%   |
| May 1–31      | 2,740,100         |   12     |  +8%   |
| Apr 1–30      | 2,530,800         |   11     | base   |
```

---

### 8.4 Export CSV

Button: `"↓ Export CSV"` in history tab header.

Downloads: `burnboard-history-YYYY-MM-DD.csv`

Columns:
```
month, total_tokens, input_tokens, output_tokens,
cache_reads, sessions, active_days, top_model
```

Pure client-side: `Blob` → `URL.createObjectURL()` → `<a download>` click.

---

## 9. TOKEN TIPS TAB

Section header: `"💬 token tips"` · subtext personalises after 7 days of data.

Six cards, each with title, description, stat, and a copy button.

| # | Title | Saving |
|---|---|---|
| 1 | Tell Claude to talk less | 40–65% output |
| 2 | Use /compact in long sessions | 40–70% input |
| 3 | Ask for diffs, not full files | 50–80% on edits |
| 4 | Add a .claudeignore | 20–60% input |
| 5 | Use the right model | up to 80% on simple tasks |
| 6 | Trim your CLAUDE.md | 5–15% all input |

**Card anatomy:**
- Title: Outfit 600, `--text`
- Saving badge: pill, `--adim` background, `--accent` text
- Description: Outfit 400, `--mu`, 2–3 lines
- Code block: JetBrains Mono, `--s2` background, `--bdr` border, copyable
- Copy button: bottom-right, state change on click

**Personalisation badges** (after 7+ days of data):
If user's actual patterns match the tip, badge text updates:
`"your data: output ratio is 4.2×"` instead of `"generic tip"`

---

## 10. TWO-ACCOUNT TRACKING

### 10.1 Problem

JSONL files at `~/.claude/projects/` don't record which Claude account was
active. Switching accounts in Claude Code mixes sessions from both into the
same directory. There is no automatic detection possible.

### 10.2 Solution: manual sync tagging

**Settings — two new fields:**
- Account 1 name: text input, default `"Primary"`
- Account 2 name: text input, default empty

Two-account mode is **disabled** until Account 2 name is filled in. No UI
shown to single-account users.

**Sync prompt (only if two accounts configured):**
When user clicks `↻ sync`, before sync runs:

```
┌─────────────────────────────────────┐
│  which account is this sync from?   │
│                                     │
│  [Primary]  [Alt Account]           │
│             [Both / Unsure]         │
└─────────────────────────────────────┘
```

All turns written from this sync get the selected label. `"Both / Unsure"` tags
as `"combined"` — included in totals but not split.

### 10.3 Two-account UI (History tab only)

**Account selector** (visible only if Account 2 configured):
```
[Account: All ▾]  →  All | Primary | Alt Account
```

Filters all history views to selected account's turns.

**Combined totals card** (top of History tab, only if two accounts):
```
┌──────────────────────────────────────────────────┐
│  🔀 across both accounts                          │
│                                                   │
│  Primary       Alt Account      Combined          │
│  4.2M tokens   1.8M tokens      6.0M tokens       │
│  18 sessions   7 sessions       25 sessions       │
└──────────────────────────────────────────────────┘
```

**Dashboard tab:** always shows combined totals. Start Check, Forecast,
Mini Stats all use all data regardless of account label.

---

## 11. WHAT'S COMING TAB / MODAL

Teaser for a future browser extension that would track claude.ai web sessions.

Content: extension demo animation showing the extension UI overlaid on a
claude.ai screenshot mockup. Three feature pills. Email capture for waitlist.

This is a static/animated marketing panel — no functionality to ship yet.

---

## 12. SETTINGS OVERLAY

Slides in from right, full-height panel.

**Fields:**

| Field | Type | Options | Default |
|---|---|---|---|
| Plan | Dropdown | Pro · $20 / Max 5x · $100 / Max 20x · $200 / API | max5x |
| Billing start day | Number input | 1–28 | 1 |
| Timezone | Text input | IANA timezone string | auto-detected |
| Account 1 name | Text input | free text | Primary |
| Account 2 name | Text input | free text (empty = disabled) | — |

**Actions:**
- Save — writes to IndexedDB kv store, closes overlay, re-renders dashboard
- Wipe all data — `confirm()` dialog → clears all IndexedDB stores → Connect screen

---

## 13. DATA ARCHITECTURE

### 13.1 IndexedDB schema

```
Database:  burnboard_v2
Version:   2

Object stores:

kv              keyPath: (string key)
  Stores: dirHandle, bb_config, bb_last_sync, bb_visited

turns           keyPath: id (autoIncrement)
  Indexes:
    by_session    → session_id
    by_timestamp  → timestamp
    by_month      → month_key         ("2026-06")
    by_account    → account_label

sessions        keyPath: session_id
  Indexes:
    by_project    → project_name
    by_start      → first_timestamp
    by_account    → account_label

windows         keyPath: window_id
  Indexes:
    by_start      → window_start

monthly_cache   keyPath: [month_key, account_label]  (compound)
  Indexes:
    by_month      → month_key
```

### 13.2 Turn record

```javascript
{
  id:                    // autoIncrement
  month_key:             "2026-06"         // from timestamp.substring(0, 7)
  account_label:         "Primary"         // "Primary" | "Alt Account" | "combined"

  session_id:            "abc123def"
  timestamp:             "2026-06-15T14:23:00.000Z"
  model:                 "claude-opus-4-20250514"
  input_tokens:          12450
  output_tokens:         3210
  cache_read_tokens:     8900
  cache_creation_tokens: 400
  tool_name:             "write_file"      // null if no tool used
  cwd:                   "/Users/abhinav/projects/reelforge"
  is_peak_hour:          1                 // 1 = peak, 0 = off-peak
}
```

### 13.3 Session record

```javascript
{
  session_id:             "abc123def"
  project_name:           "reelforge"      // cwd.split('/').pop()
  first_timestamp:        "2026-06-15T14:23:00.000Z"
  last_timestamp:         "2026-06-15T16:11:00.000Z"
  model:                  "claude-opus-4-..." // dominant model (most tokens)
  turn_count:             22
  total_input_tokens:     280000
  total_output_tokens:    72000
  total_cache_read:       190000
  total_cache_creation:   8800
  account_label:          "Primary"
}
```

### 13.4 Window record

```javascript
{
  window_id:           "a3f21b08"       // hash of window_start
  window_start:        "2026-06-15T14:23:00.000Z"
  window_end:          "2026-06-15T18:47:00.000Z"
  total_input_tokens:  180000
  total_output_tokens: 48000
  opus_tokens:         82000
  sonnet_tokens:       140000
  haiku_tokens:        6000
  turn_count:          34
  is_peak_hour:        0
  is_complete:         1               // 1 if >5h since window_start
}
```

### 13.5 Monthly cache record

```javascript
{
  month_key:          "2026-06"
  account_label:      "Primary"        // or "combined"
  total_tokens:       4218400
  input_tokens:       2100000
  output_tokens:      1800000
  cache_read_tokens:  318400
  sessions:           18               // count of unique sessions
  active_days:        12               // count of days with ≥1 session
  top_model:          "sonnet"         // dominant by token volume
  computed_at:        "2026-06-26T..." // recomputed on every sync
}
```

### 13.6 Settings record (in kv store)

```javascript
// key: 'bb_config'
{
  plan:              "max5x"
  billing_start_day: 1
  timezone:          "Asia/Kolkata"
  account_1_name:    "Primary"
  account_2_name:    ""             // empty = two-account mode off
}
```

---

## 14. JSONL PARSING

Claude Code writes one `.jsonl` file per session, in subdirectories of
`~/.claude/projects/`. Each line in the file is a JSON object representing
one conversation event.

**Algorithm:**
1. Recursively walk all subdirectories of the picked folder
2. For each `.jsonl` file:
   - Skip if `file.lastModified < last_sync_timestamp` (incremental sync)
   - Read file as text, split by `\n`
   - For each line:
     - Skip empty lines
     - Parse JSON; skip on parse error
     - Skip if `type !== "assistant"` — only assistant turns have usage
     - Extract `message.usage` — `input_tokens`, `output_tokens`,
       `cache_read_input_tokens`, `cache_creation_input_tokens`
     - Skip if both input and output are 0
     - Extract `sessionId` (or `session_id`), `timestamp`
     - Skip if either missing
     - Extract `model` from `message.model` or top-level `model`
     - Extract first `tool_use` block name from `message.content` array
     - Extract `cwd` (max 300 chars)
     - Compute `is_peak_hour` from timestamp
     - Add to turns array

**Peak hour logic:**
- `isPeakHour(timestamp)`:
  - Parse as UTC Date
  - If day is Saturday (6) or Sunday (0): return false
  - If UTC hour is 13–18 inclusive: return true
  - Otherwise: return false

**Window computation:**
- Sort all turns by timestamp ascending
- Iterate; if gap between consecutive turns > 5 hours: start new window
- Each window: hash of `window_start` as ID, aggregate token counts by model

**Session computation:**
- Group turns by `session_id`
- Per session: min timestamp = first, max = last, sum all token fields
- `project_name` = last segment of `cwd` path

---

## 15. LOCAL COMPUTATION

Everything computed from IndexedDB data before rendering. No server.

### 15.1 Dashboard data object

The render layer expects this object (`d`). Build it from IDB each time
the dashboard loads or filters change.

```
d = {
  user: {
    plan,
    billing_start,
    timezone,
    last_synced_at,
  },

  start_check: {
    state,           // "good" | "caution_peak" | "caution_budget" | "danger" | "weekend" | "no_data"
    window_remaining_ms,
    window_start,
    opus_pct,
    sonnet_pct,
    peak_ends_at,    // ISO string, next time peak hours end
    reset_day,       // e.g. "monday"
  },

  mini_stats: {
    window_remaining_ms,
    window_start,
    weekly_cap_pct,  // max of opus_pct and sonnet_pct
    today_vs_avg,    // ratio, e.g. 1.4
  },

  forecast: {
    state,           // "on_track" | "tight" | "exhausted"
    sentence,        // pre-computed plain English string
    opus_pct,
    sonnet_pct,
    opus_hours_used,
    sonnet_hours_used,
    opus_hours_total,
    sonnet_hours_total,
    resets_in_days,
    resets_day_name,
  },

  insights: [
    {
      type,      // "session_spiral" | "cache_alert" | "peak_penalty" | "opus_waste"
      severity,  // "danger" | "warning" | "info"
      title,
      body,
      copy_text,
    },
    ...
  ],

  daily_usage: [
    { day: "2026-06-15", total_tokens: 284000, sessions: 3 },
    ...
  ],

  heatmap: [
    { day_of_week: 1, hour_utc: 14, tokens: 48000 },
    ...
  ],

  model_breakdown: [
    { model_family: "opus", tokens: 1200000, pct: 22 },
    ...
  ],

  top_projects: [
    { project_name: "reelforge", tokens: 2400000, sessions: 8 },
    ...
  ],

  recent_sessions: [
    { session_id, project_name, first_timestamp, last_timestamp,
      model, turn_count, total_input_tokens, total_output_tokens,
      total_cache_read, total_cache_creation },
    ...
  ],

  turns_by_session: {
    "session_id": [
      { timestamp, input_tokens, output_tokens, cache_read_tokens, tool_name },
      ...
    ],
  },

  cost_by_model: [
    { model: "opus", total_tokens: 1200000, estimated_cost_usd: 18.00 },
    ...
  ],

  summary: {
    total_sessions, total_turns, total_input, total_output,
    total_cache_read, total_api_cost_usd,
  },

  total_api_cost_usd,
}
```

### 15.2 Weekly cap computation

```javascript
const CAPS = {
  pro:    { opus: 0,  sonnet: 60  },
  max5x:  { opus: 25, sonnet: 210 },
  max20x: { opus: 32, sonnet: 360 },
};
const TOKENS_PER_HOUR = 800_000; // community estimate

// Get Monday 00:00 UTC of current week
function getMondayUTC() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = (day === 0) ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

// Query turns since Monday, group by model family
const mondayTs = getMondayUTC().toISOString();
const weekTurns = turns.filter(t => t.timestamp >= mondayTs);

const opusTokens   = weekTurns.filter(t => t.model.includes('opus'))
                               .reduce((s, t) => s + t.input_tokens + t.output_tokens, 0);
const sonnetTokens = weekTurns.filter(t => t.model.includes('sonnet'))
                               .reduce((s, t) => s + t.input_tokens + t.output_tokens, 0);

const opusHours   = opusTokens   / TOKENS_PER_HOUR;
const sonnetHours = sonnetTokens / TOKENS_PER_HOUR;

const caps = CAPS[plan] ?? CAPS.max5x;
const opusPct   = caps.opus   > 0 ? (opusHours   / caps.opus)   * 100 : 0;
const sonnetPct = caps.sonnet > 0 ? (sonnetHours / caps.sonnet) * 100 : 0;
```

### 15.3 Current window computation

```javascript
// Most recent window from IDB windows store
// A window is "current" if: is_complete === 0 OR within 5h of window_start

const WIN_MS = 5 * 3600 * 1000;
const now = Date.now();

const currentWindow = windows
  .filter(w => (now - new Date(w.window_start).getTime()) < WIN_MS)
  .sort((a, b) => b.window_start.localeCompare(a.window_start))[0] ?? null;

const windowRemainingMs = currentWindow
  ? WIN_MS - (now - new Date(currentWindow.window_start).getTime())
  : WIN_MS; // if no window, full window available
```

### 15.4 Monthly cache computation (post-sync)

Run after every sync in the background. Does not block dashboard render.

```javascript
async function recomputeMonthlyCache(db, accountLabels) {
  for (const label of accountLabels) {
    const turns = label === 'combined'
      ? await getAllTurns(db)
      : await getTurnsByAccount(db, label);

    const byMonth = {};
    for (const t of turns) {
      const mk = t.month_key;
      if (!byMonth[mk]) byMonth[mk] = {
        total_tokens: 0, input_tokens: 0, output_tokens: 0,
        cache_read_tokens: 0,
        sessions: new Set(), active_days: new Set(),
        opus: 0, sonnet: 0, haiku: 0,
      };
      const total = t.input_tokens + t.output_tokens;
      byMonth[mk].total_tokens      += total;
      byMonth[mk].input_tokens      += t.input_tokens;
      byMonth[mk].output_tokens     += t.output_tokens;
      byMonth[mk].cache_read_tokens += t.cache_read_tokens;
      byMonth[mk].sessions.add(t.session_id);
      byMonth[mk].active_days.add(t.timestamp.substring(0, 10));
      if (t.model.includes('opus'))   byMonth[mk].opus   += total;
      if (t.model.includes('sonnet')) byMonth[mk].sonnet += total;
      if (t.model.includes('haiku'))  byMonth[mk].haiku  += total;
    }

    for (const [mk, data] of Object.entries(byMonth)) {
      const top = ['opus','sonnet','haiku']
        .sort((a, b) => data[b] - data[a])[0];
      await db.put('monthly_cache', {
        month_key: mk, account_label: label,
        total_tokens: data.total_tokens,
        input_tokens: data.input_tokens,
        output_tokens: data.output_tokens,
        cache_read_tokens: data.cache_read_tokens,
        sessions: data.sessions.size,
        active_days: data.active_days.size,
        top_model: top,
        computed_at: new Date().toISOString(),
      });
    }
  }
}
```

### 15.5 Weekly bucket computation

```javascript
function getWeeklyBuckets(turns, n = 12) {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(now.getUTCDate() + diff);
  thisMonday.setUTCHours(0, 0, 0, 0);

  const buckets = [];
  for (let i = 0; i < n; i++) {
    const start = new Date(thisMonday.getTime() - i * 7 * 86400000);
    const end   = new Date(start.getTime() + 7 * 86400000);
    const weekTurns = turns.filter(t => {
      const ts = t.timestamp;
      return ts >= start.toISOString() && ts < end.toISOString();
    });
    buckets.push({
      label:         `${fmt(start)} – ${fmt(new Date(end - 86400000))}`,
      start_iso:     start.toISOString(),
      total_tokens:  weekTurns.reduce((s, t) => s + t.input_tokens + t.output_tokens, 0),
      opus_tokens:   weekTurns.filter(t => t.model.includes('opus'))
                              .reduce((s, t) => s + t.input_tokens + t.output_tokens, 0),
      sonnet_tokens: weekTurns.filter(t => t.model.includes('sonnet'))
                              .reduce((s, t) => s + t.input_tokens + t.output_tokens, 0),
      sessions:      new Set(weekTurns.map(t => t.session_id)).size,
    });
  }
  return buckets.reverse(); // oldest first
}
```

---

## 16. API PRICING REFERENCE (for cost-equivalent display)

| Model family | Input per 1M tokens | Output per 1M tokens |
|---|---|---|
| claude-opus-4 | $15.00 | $75.00 |
| claude-sonnet-4 | $3.00 | $15.00 |
| claude-haiku-4 | $0.25 | $1.25 |

Always display with note: `"api pricing equivalent — not what you paid on your subscription."`

---

## 17. CAP ESTIMATES

Community-reported. Always show the disclaimer.

| Plan | Opus hrs/week | Sonnet hrs/week |
|---|---|---|
| Pro ($20) | 0 | ~60h |
| Max 5x ($100) | ~25h | ~210h |
| Max 20x ($200) | ~32h | ~360h |

Disclaimer: `"community estimates — not official anthropic numbers. treat as directional."`

---

## 18. ERROR HANDLING

| Scenario | Behavior |
|---|---|
| Firefox or Safari detected | Amber bar on connect screen: `"folder sync needs Chrome or Edge."` Folder button disabled. Skip-to-dashboard link shown if IDB has data. |
| User cancels folder picker | `AbortError` — swallow silently, stay on connect screen. |
| Malformed JSONL line | Skip line, continue. After sync: if >0 skipped, show count: `"skipped N malformed lines"` in sync summary. |
| Empty `.jsonl` file | Skip file silently. |
| Directory permission denied | Skip directory, continue. Log to console. |
| IDB wiped (user cleared Chrome data) | Boot: no dirHandle found → Connect screen. Show note: `"if you had data previously, re-syncing rebuilds your full history."` |
| Sync fails mid-way | Error message on sync screen with retry button. Loads dashboard from whatever exists in IDB. |
| Re-sync finds 0 new turns | Toast: `"all caught up ✓"`. No error state. |
| Monthly cache compute fails | History tab shows last cached data with small note: `"data may be stale — re-sync to refresh."` |
| Two-account prompt dismissed | Default to Account 1 / Primary. Sync proceeds. |
| Account 2 name later cleared in settings | Turns remain tagged in IDB. UI reverts to single-account view. Nothing lost. |
| Plan cap numbers seem wrong | No error thrown — show disclaimer prominently. Never hard-block on cap estimates. |

---

## 19. BUILD ORDER

Each step is independently testable before starting the next.

```
Step 1: HTML shell + design system
  Full page CSS: all variables, card styles, button styles, atmospheric
  effects, typography, scrollbar, motion keyframes.
  Empty screens: Connect, Reconnect, Sync, Dashboard (no data).
  Nav and tab bar.

Step 2: IndexedDB layer
  Schema (version 2): kv, turns, sessions, windows, monthly_cache.
  Helper: openDB(), put(), get(), getAll(), clear().
  Settings: save/load from kv store.

Step 3: Folder picker + JSONL parsing
  showDirectoryPicker() flow.
  Recursive walk + incremental sync (skip files by lastModified).
  parseJsonl() → turn records.
  buildSessions() + buildWindows().
  Write to IDB via writeTurnsToIDB().
  Save dirHandle to kv.

Step 4: Dashboard computation + render
  loadDataLocal() — compute all 11 data points from IDB turns.
  renderAll(d) — wire all render functions to computed data.
  Start Check, Mini Stats, Week Forecast, Filter bar functional.

Step 5: Charts
  Daily burn rate bar chart (Chart.js).
  Peak hour heatmap (CSS grid + IDB data).
  Model breakdown doughnut.
  Top projects horizontal bar.

Step 6: Insights
  All 4 insight types: compute triggers, render cards, copy buttons.
  Priority ordering (max 3 shown).

Step 7: Sessions table
  Render last 20 sessions.
  Expand row → turn detail from IDB by session_id.
  Context growth bar per turn.

Step 8: History tab
  Monthly view: cards from monthly_cache + comparison chart.
  recomputeMonthlyCache() called post-sync.
  Weekly view: table from getWeeklyBuckets() + sparkline.
  Billing cycle view.
  Export CSV.

Step 9: Two-account support
  Account 2 name field in settings.
  Sync prompt modal.
  account_label on all IDB writes.
  Account selector in History tab.
  Combined totals card.

Step 10: Token Tips tab
  6 tip cards, copy buttons, personalisation badges.

Step 11: Reconnect flow + polish
  Reconnect screen: requestPermission() on stored handle.
  Coming Soon modal + animation.
  Toast system.
  Favicon update by Start Check state.
  All empty states.
  All error states.
  prefers-reduced-motion.
```

---

*End of document.*
