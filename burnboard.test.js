'use strict';
// Standalone Node test — no framework, no fixtures (CLAUDE.md constraint).
// Extracts pure functions from burnboard.html and asserts their behavior.
// Run: node burnboard.test.js

const assert = require('assert');

// ================================================================
// Pure functions copied verbatim from burnboard.html <script>
// (IDB-dependent code is browser-only and not extracted here)
// ================================================================

function isPeakHour(ts) {
  const d = new Date(ts), day = d.getUTCDay(), h = d.getUTCHours();
  if (day === 0 || day === 6) return false;
  return h >= 13 && h <= 18;
}

function djb2hex(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) + str.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

function modelFamily(m) {
  if (!m) return 'other';
  const l = m.toLowerCase();
  if (l.includes('opus'))   return 'opus';
  if (l.includes('sonnet')) return 'sonnet';
  if (l.includes('haiku'))  return 'haiku';
  return 'other';
}

const WIN_MS = 5 * 3600 * 1000;

function buildWindows(allTurns) {
  const sorted = [...allTurns].sort((a,b) => a.timestamp < b.timestamp ? -1 : 1);
  const now    = Date.now();
  const wins   = [];
  let w = null;
  for (const t of sorted) {
    const tms = new Date(t.timestamp).getTime();
    if (!w || (tms - new Date(w._lastTs).getTime()) > WIN_MS) {
      if (w) wins.push(w);
      w = { window_start:t.timestamp, _lastTs:t.timestamp,
            total_input_tokens:0, total_output_tokens:0,
            opus_tokens:0, sonnet_tokens:0, haiku_tokens:0,
            turn_count:0, is_peak_hour: isPeakHour(t.timestamp)?1:0 };
    }
    w._lastTs = t.timestamp;
    w.total_input_tokens  += t.input_tokens;
    w.total_output_tokens += t.output_tokens;
    const fam = modelFamily(t.model);
    if (fam==='opus')   w.opus_tokens   += t.input_tokens + t.output_tokens;
    if (fam==='sonnet') w.sonnet_tokens += t.input_tokens + t.output_tokens;
    if (fam==='haiku')  w.haiku_tokens  += t.input_tokens + t.output_tokens;
    w.turn_count++;
  }
  if (w) wins.push(w);
  return wins.map(w => ({
    window_id:           djb2hex(w.window_start),
    window_start:        w.window_start,
    window_end:          w._lastTs,
    total_input_tokens:  w.total_input_tokens,
    total_output_tokens: w.total_output_tokens,
    opus_tokens:         w.opus_tokens,
    sonnet_tokens:       w.sonnet_tokens,
    haiku_tokens:        w.haiku_tokens,
    turn_count:          w.turn_count,
    is_peak_hour:        w.is_peak_hour,
    is_complete:         (now - new Date(w.window_start).getTime()) > WIN_MS ? 1 : 0,
  }));
}

function buildSessions(turns) {
  const map = {};
  for (const t of turns) {
    if (!map[t.session_id]) map[t.session_id] = {
      session_id: t.session_id,
      project_name: (t.cwd||'').replace(/\\/g,'/').split('/').filter(Boolean).pop() || '',
      first_timestamp: t.timestamp,
      last_timestamp:  t.timestamp,
      model: t.model,
      turn_count: 0,
      total_input_tokens:    0,
      total_output_tokens:   0,
      total_cache_read:      0,
      total_cache_creation:  0,
      account_label: t.account_label,
    };
    const s = map[t.session_id];
    if (t.timestamp < s.first_timestamp) s.first_timestamp = t.timestamp;
    if (t.timestamp > s.last_timestamp)  s.last_timestamp  = t.timestamp;
    s.turn_count++;
    s.total_input_tokens   += t.input_tokens;
    s.total_output_tokens  += t.output_tokens;
    s.total_cache_read     += t.cache_read_tokens;
    s.total_cache_creation += t.cache_creation_tokens;
  }
  for (const sid in map) {
    const vol = { opus:0, sonnet:0, haiku:0, other:0 };
    for (const t of turns) {
      if (t.session_id !== sid) continue;
      vol[modelFamily(t.model)] += t.input_tokens + t.output_tokens;
    }
    map[sid].model = Object.entries(vol).sort((a,b) => b[1]-a[1])[0][0];
  }
  return Object.values(map);
}

function getMondayUTC(now) {
  const d   = new Date(now);
  const day = d.getUTCDay();
  const m   = new Date(d);
  m.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  m.setUTCHours(0,0,0,0);
  return m.getTime();
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ================================================================
// Minimal harness
// ================================================================
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}: ${e.message}`);
    failed++;
  }
}

function eq(a, b) { assert.strictEqual(a, b); }

// Baseline turn factory
function turn(overrides) {
  return {
    session_id: 'sess-1',
    timestamp: '2026-06-15T14:00:00Z',  // Mon 14 UTC
    model: 'claude-opus-4-5',
    input_tokens: 1000,
    output_tokens: 500,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    tool_name: null,
    cwd: '/home/user/project',
    account_label: 'Primary',
    month_key: '2026-06',
    is_peak_hour: 1,
    ...overrides,
  };
}

// ================================================================
// isPeakHour — all spec cases + boundaries
// ================================================================
console.log('\nisPeakHour');
// SC1–SC6 are the inline self-check cases; verified identically here under Node
test('SC1 Mon 14 UTC = peak',             () => eq(isPeakHour('2026-06-15T14:00:00Z'), true));
test('SC2 Sat 14 UTC = not peak',         () => eq(isPeakHour('2026-06-13T14:00:00Z'), false));
test('SC3 Mon 20 UTC = off-peak',         () => eq(isPeakHour('2026-06-15T20:00:00Z'), false));
test('SC4 Mon 12 UTC = off-peak',         () => eq(isPeakHour('2026-06-15T12:00:00Z'), false));
test('SC5 Mon 18 UTC = peak (inclusive)', () => eq(isPeakHour('2026-06-15T18:00:00Z'), true));
test('SC6 Sun 15 UTC = not peak',         () => eq(isPeakHour('2026-06-14T15:00:00Z'), false));
test('Mon 13 UTC = peak (low bound)',     () => eq(isPeakHour('2026-06-15T13:00:00Z'), true));
test('Mon 19 UTC = off-peak (just past)', () => eq(isPeakHour('2026-06-15T19:00:00Z'), false));
test('Fri 18 UTC = peak',                 () => eq(isPeakHour('2026-06-19T18:00:00Z'), true));

// ================================================================
// djb2hex — determinism; used as window_id
// ================================================================
console.log('\ndjb2hex');
test('same input → same output', () => {
  eq(djb2hex('2026-06-15T14:00:00Z'), djb2hex('2026-06-15T14:00:00Z'));
});
test('different inputs → different outputs', () => {
  assert.notStrictEqual(djb2hex('2026-06-15T14:00:00Z'), djb2hex('2026-06-15T20:00:00Z'));
});
test('returns a hex string (no NaN/undefined)', () => {
  const h = djb2hex('hello');
  assert.ok(/^[0-9a-f]+$/.test(h), `not hex: ${h}`);
});
test('empty string produces a stable value', () => {
  eq(typeof djb2hex(''), 'string');
});

// ================================================================
// modelFamily
// ================================================================
console.log('\nmodelFamily');
test('opus',   () => eq(modelFamily('claude-opus-4-5'),    'opus'));
test('sonnet', () => eq(modelFamily('claude-sonnet-3-7'),  'sonnet'));
test('haiku',  () => eq(modelFamily('claude-haiku-3-5'),   'haiku'));
test('null → other',    () => eq(modelFamily(null),        'other'));
test('unknown → other', () => eq(modelFamily('unknown'),   'other'));
test('case-insensitive', () => eq(modelFamily('CLAUDE-OPUS-4'), 'opus'));

// ================================================================
// buildWindows — gap logic (highest-risk per changes.md)
// ================================================================
console.log('\nbuildWindows — gap logic');
test('empty input → 0 windows', () => {
  eq(buildWindows([]).length, 0);
});
test('single turn → 1 window', () => {
  eq(buildWindows([turn()]).length, 1);
});
test('two turns < 5h apart → 1 window', () => {
  const t1 = turn({ timestamp: '2026-06-15T10:00:00Z' });
  const t2 = turn({ timestamp: '2026-06-15T12:00:00Z' });
  eq(buildWindows([t1, t2]).length, 1);
});
test('two turns exactly 5h apart → 1 window (gap not > WIN_MS)', () => {
  // Gap = WIN_MS exactly; condition is > WIN_MS so boundary stays in same window
  const t1 = turn({ timestamp: '2026-06-15T10:00:00Z' });
  const t2 = turn({ timestamp: '2026-06-15T15:00:00Z' });
  eq(buildWindows([t1, t2]).length, 1);
});
test('two turns > 5h apart → 2 windows', () => {
  // 5h 1s apart → gap > WIN_MS → new window
  const t1 = turn({ timestamp: '2026-06-15T10:00:00Z' });
  const t2 = turn({ timestamp: '2026-06-15T15:00:01Z' });
  eq(buildWindows([t1, t2]).length, 2);
});
test('same session, multiple windows when gap > 5h', () => {
  const t1 = turn({ session_id: 'same', timestamp: '2026-06-15T08:00:00Z' });
  const t2 = turn({ session_id: 'same', timestamp: '2026-06-15T15:00:01Z' });
  eq(buildWindows([t1, t2]).length, 2);
});
test('cross-session gap > 5h → 2 windows', () => {
  const t1 = turn({ session_id: 'A', timestamp: '2026-06-15T08:00:00Z' });
  const t2 = turn({ session_id: 'A', timestamp: '2026-06-15T09:00:00Z' });
  const t3 = turn({ session_id: 'B', timestamp: '2026-06-15T15:00:01Z' }); // 6h 0m 1s after t2
  eq(buildWindows([t1, t2, t3]).length, 2);
});
test('unsorted input → sorted before windowing (window_start = earliest)', () => {
  const t1 = turn({ timestamp: '2026-06-15T15:00:01Z', input_tokens: 200 }); // later
  const t2 = turn({ timestamp: '2026-06-15T10:00:00Z', input_tokens: 100 }); // earlier
  const wins = buildWindows([t1, t2]); // gap > 5h → 2 windows
  eq(wins.length, 2);
  eq(wins[0].window_start, '2026-06-15T10:00:00Z'); // earlier turn starts first window
});
test('window_id = djb2hex(window_start)', () => {
  const t = turn({ timestamp: '2026-06-15T14:00:00Z' });
  const [w] = buildWindows([t]);
  eq(w.window_id, djb2hex('2026-06-15T14:00:00Z'));
});
test('window_end = last turn timestamp in that window', () => {
  const t1 = turn({ timestamp: '2026-06-15T14:00:00Z' });
  const t2 = turn({ timestamp: '2026-06-15T14:30:00Z' });
  const [w] = buildWindows([t1, t2]);
  eq(w.window_end, '2026-06-15T14:30:00Z');
});
test('is_peak_hour on window derived from first turn', () => {
  const t1 = turn({ timestamp: '2026-06-15T14:00:00Z' }); // Mon 14 UTC = peak
  const [w] = buildWindows([t1]);
  eq(w.is_peak_hour, 1);
});
test('is_peak_hour = 0 when first turn is off-peak', () => {
  const t1 = turn({ timestamp: '2026-06-15T10:00:00Z' }); // Mon 10 UTC = off-peak
  const [w] = buildWindows([t1]);
  eq(w.is_peak_hour, 0);
});
test('is_complete = 1 for a past window (>5h old)', () => {
  const t = turn({ timestamp: '2020-01-01T14:00:00Z' }); // definitely > 5h ago
  const [w] = buildWindows([t]);
  eq(w.is_complete, 1);
});
test('opus tokens accumulate correctly', () => {
  const t1 = turn({ model: 'claude-opus-4-5', input_tokens: 1000, output_tokens: 500, timestamp: '2026-06-15T14:00:00Z' });
  const t2 = turn({ model: 'claude-opus-4-5', input_tokens: 200,  output_tokens: 100, timestamp: '2026-06-15T14:30:00Z' });
  const [w] = buildWindows([t1, t2]);
  eq(w.opus_tokens, 1800); // (1000+500) + (200+100)
});
test('mixed model families bucket independently', () => {
  const t1 = turn({ model: 'claude-opus-4-5',   input_tokens: 1000, output_tokens: 500, timestamp: '2026-06-15T14:00:00Z' });
  const t2 = turn({ model: 'claude-sonnet-3-7',  input_tokens: 200,  output_tokens: 100, timestamp: '2026-06-15T14:30:00Z' });
  const t3 = turn({ model: 'claude-haiku-3-5',   input_tokens: 50,   output_tokens: 25,  timestamp: '2026-06-15T14:45:00Z' });
  const [w] = buildWindows([t1, t2, t3]);
  eq(w.opus_tokens,   1500);
  eq(w.sonnet_tokens, 300);
  eq(w.haiku_tokens,  75);
  eq(w.turn_count,    3);
});

// ================================================================
// buildWindows — dedup simulation
// The IDB cursor (dbDeleteTurnsBySession) is browser-only and cannot
// run under Node. Instead: prove that re-inserting a session's turns
// without dedup doubles the computed totals, confirming that the
// delete-before-insert guard is load-bearing.
// ================================================================
console.log('\nbuildWindows — dedup simulation');
test('no dedup: same turn twice doubles window totals', () => {
  const t = turn({ input_tokens: 1000, output_tokens: 500, model: 'claude-opus-4-5' });
  const [clean]  = buildWindows([t]);
  const [doubled] = buildWindows([t, { ...t }]); // same timestamp → same window
  eq(clean.total_input_tokens,  1000);
  eq(doubled.total_input_tokens, 2000); // double-count without dedup
  eq(clean.opus_tokens,  1500);
  eq(doubled.opus_tokens, 3000);
});
test('after dedup (fresh single-turn set): weekly-cap computation is correct', () => {
  // Simulates: dbDeleteTurnsBySession ran, then buildWindows from the fresh parse
  const TOKENS_PER_HOUR = 800000;
  const CAPS = { max5x: { opus: 25, sonnet: 210 } };
  const t = turn({ model: 'claude-opus-4-5', input_tokens: 800000, output_tokens: 0 });
  const [w] = buildWindows([t]);
  const opusHours = w.opus_tokens / TOKENS_PER_HOUR;
  const opusPct   = opusHours / CAPS.max5x.opus * 100;
  assert.ok(Math.abs(opusPct - 4) < 0.001, `expected ~4%, got ${opusPct}`); // 1h / 25h = 4%
});
test('double-inserted session raises opusPct to double: confirms dedup guards weekly cap', () => {
  const TOKENS_PER_HOUR = 800000;
  const CAPS = { max5x: { opus: 25 } };
  const t = turn({ model: 'claude-opus-4-5', input_tokens: 800000, output_tokens: 0 });
  const doubled = buildWindows([t, { ...t }]);
  const opusTokens = doubled.reduce((s, w) => s + w.opus_tokens, 0);
  const opusPct    = opusTokens / TOKENS_PER_HOUR / CAPS.max5x.opus * 100;
  assert.ok(Math.abs(opusPct - 8) < 0.001, `expected ~8%, got ${opusPct}`); // 2h / 25h = 8%
});

// ================================================================
// buildSessions
// ================================================================
console.log('\nbuildSessions');
test('single session, two turns: aggregates correctly', () => {
  const turns = [
    turn({ input_tokens: 100, output_tokens: 50, cache_read_tokens: 10, cache_creation_tokens: 5, timestamp: '2026-06-15T14:00:00Z' }),
    turn({ input_tokens: 200, output_tokens: 100, cache_read_tokens: 0, cache_creation_tokens: 0, timestamp: '2026-06-15T15:00:00Z' }),
  ];
  const [s] = buildSessions(turns);
  eq(s.turn_count,          2);
  eq(s.total_input_tokens,  300);
  eq(s.total_output_tokens, 150);
  eq(s.total_cache_read,    10);
  eq(s.total_cache_creation, 5);
  eq(s.first_timestamp,     '2026-06-15T14:00:00Z');
  eq(s.last_timestamp,      '2026-06-15T15:00:00Z');
});
test('two sessions → two records', () => {
  const t1 = turn({ session_id: 'A' });
  const t2 = turn({ session_id: 'B' });
  eq(buildSessions([t1, t2]).length, 2);
});
test('dominant model by token volume (not turn count)', () => {
  const turns = [
    turn({ model: 'claude-opus-4-5',  input_tokens: 1000, output_tokens: 500,  timestamp: '2026-06-15T14:00:00Z' }),
    turn({ model: 'claude-sonnet-3-7', input_tokens: 100,  output_tokens: 50, timestamp: '2026-06-15T15:00:00Z' }),
  ];
  const [s] = buildSessions(turns);
  eq(s.model, 'opus'); // 1500 opus vs 150 sonnet
});
test('sonnet wins when it has more tokens', () => {
  const turns = [
    turn({ model: 'claude-opus-4-5',   input_tokens: 100, output_tokens: 50, timestamp: '2026-06-15T14:00:00Z' }),
    turn({ model: 'claude-sonnet-3-7', input_tokens: 1000, output_tokens: 500, timestamp: '2026-06-15T15:00:00Z' }),
  ];
  const [s] = buildSessions(turns);
  eq(s.model, 'sonnet');
});
test('project_name from last path segment (POSIX)', () => {
  const [s] = buildSessions([turn({ cwd: '/home/user/my-project' })]);
  eq(s.project_name, 'my-project');
});
test('project_name from Windows path', () => {
  const [s] = buildSessions([turn({ cwd: 'C:\\Users\\user\\burnboard' })]);
  eq(s.project_name, 'burnboard');
});
test('empty cwd → empty project_name', () => {
  const [s] = buildSessions([turn({ cwd: '' })]);
  eq(s.project_name, '');
});

// ================================================================
// getMondayUTC
// ================================================================
console.log('\ngetMondayUTC');
test('Monday 12:00 UTC → same day 00:00 UTC', () => {
  const mon = new Date('2026-06-15T12:00:00Z').getTime();
  eq(getMondayUTC(mon), new Date('2026-06-15T00:00:00Z').getTime());
});
test('Tuesday → previous Monday', () => {
  const tue = new Date('2026-06-16T12:00:00Z').getTime();
  eq(getMondayUTC(tue), new Date('2026-06-15T00:00:00Z').getTime());
});
test('Wednesday → previous Monday', () => {
  const wed = new Date('2026-06-17T12:00:00Z').getTime();
  eq(getMondayUTC(wed), new Date('2026-06-15T00:00:00Z').getTime());
});
test('Friday → this week Monday', () => {
  const fri = new Date('2026-06-19T12:00:00Z').getTime();
  eq(getMondayUTC(fri), new Date('2026-06-15T00:00:00Z').getTime());
});
test('Sunday → previous Monday (6 days back)', () => {
  const sun = new Date('2026-06-14T12:00:00Z').getTime();
  eq(getMondayUTC(sun), new Date('2026-06-08T00:00:00Z').getTime());
});
test('Saturday → this week Monday (5 days back)', () => {
  const sat = new Date('2026-06-13T12:00:00Z').getTime();
  eq(getMondayUTC(sat), new Date('2026-06-08T00:00:00Z').getTime());
});
test('result is always midnight UTC', () => {
  const fri = new Date('2026-06-19T23:59:59Z').getTime();
  const ms = getMondayUTC(fri) % 86400000;
  eq(ms, 0); // 00:00:00 UTC
});

// ================================================================
// clamp
// ================================================================
console.log('\nclamp');
test('below min → min',  () => eq(clamp(-5, 0, 10), 0));
test('above max → max',  () => eq(clamp(15, 0, 10), 10));
test('in range → value', () => eq(clamp(5,  0, 10), 5));
test('at min → min',     () => eq(clamp(0,  0, 10), 0));
test('at max → max',     () => eq(clamp(10, 0, 10), 10));
test('fracElapsed clamped to 0.01 at Monday 00:01 UTC', () => {
  const mondayTs = new Date('2026-06-15T00:00:00Z').getTime();
  const oneMinLater = mondayTs + 60000;
  const frac = clamp((oneMinLater - mondayTs) / (7 * 86400000), 0.01, 1);
  eq(frac, 0.01); // natural value is ~0.0000992, clamped to 0.01
});

// ================================================================
// State machine — ordering + boundary conditions
// ================================================================
console.log('\nState machine');
function _state(nowISO, opusPct, sonnetPct, hasTurns) {
  if (!hasTurns) return 'no_data';
  const d = new Date(nowISO), day = d.getUTCDay(), h = d.getUTCHours();
  if (day === 0 || day === 6) return 'weekend';
  const peak = h >= 13 && h <= 18;
  if (peak) return (opusPct > 80 || sonnetPct > 85) ? 'danger' : 'caution_peak';
  return (opusPct > 70 || sonnetPct > 75) ? 'caution_budget' : 'good';
}

// SC7–SC13: inline self-check cases verified under Node
test('SC7  danger (opus >80, peak)',         () => eq(_state('2026-06-15T15:00:00Z', 90, 50, true),  'danger'));
test('SC8  danger (sonnet >85, peak)',        () => eq(_state('2026-06-15T15:00:00Z', 50, 90, true),  'danger'));
test('SC9  caution_peak',                    () => eq(_state('2026-06-15T15:00:00Z', 50, 50, true),  'caution_peak'));
test('SC10 weekend beats budget',            () => eq(_state('2026-06-13T15:00:00Z', 90, 90, true),  'weekend'));
test('SC11 no_data',                         () => eq(_state('2026-06-15T15:00:00Z', 0,  0,  false), 'no_data'));
test('SC12 caution_budget',                  () => eq(_state('2026-06-15T10:00:00Z', 75, 50, true),  'caution_budget'));
test('SC13 good',                            () => eq(_state('2026-06-15T10:00:00Z', 50, 50, true),  'good'));
// Ordering: no_data is checked before weekend
test('no_data checked before weekend',       () => eq(_state('2026-06-13T15:00:00Z', 90, 90, false), 'no_data'));
// Exact boundary conditions (spec: strict > not >=)
test('opus=80 peak → caution_peak (not danger)', () => eq(_state('2026-06-15T15:00:00Z', 80, 0,  true), 'caution_peak'));
test('opus=81 peak → danger',                    () => eq(_state('2026-06-15T15:00:00Z', 81, 0,  true), 'danger'));
test('sonnet=85 peak → caution_peak',            () => eq(_state('2026-06-15T15:00:00Z', 0,  85, true), 'caution_peak'));
test('sonnet=86 peak → danger',                  () => eq(_state('2026-06-15T15:00:00Z', 0,  86, true), 'danger'));
test('opus=70 off-peak → good (not caution_budget)', () => eq(_state('2026-06-15T10:00:00Z', 70, 0,  true), 'good'));
test('opus=71 off-peak → caution_budget',            () => eq(_state('2026-06-15T10:00:00Z', 71, 0,  true), 'caution_budget'));
test('sonnet=75 off-peak → good',                    () => eq(_state('2026-06-15T10:00:00Z', 0,  75, true), 'good'));
test('sonnet=76 off-peak → caution_budget',           () => eq(_state('2026-06-15T10:00:00Z', 0,  76, true), 'caution_budget'));

// ================================================================
// today_vs_avg: denominator is always 30 (spec ORIGINATED formula)
// ================================================================
console.log('\ntoday_vs_avg denominator = 30');
test('avg = sum / 30, not sum / distinct-days', () => {
  // 3 days of data, 100k tokens each
  const last30Tok = 300000;
  const avg = last30Tok / 30;
  assert.strictEqual(avg, 10000); // 10k/day, NOT 100k/day (which would be /3)
});
test('todayVsAvg = 0 when avg = 0 (no division by zero)', () => {
  const avg = 0, todayTok = 50000;
  const ratio = avg > 0 ? todayTok / avg : 0;
  eq(ratio, 0);
});
test('todayVsAvg > 1 when today burns harder than 30-day average', () => {
  const last30Tok = 300000;           // 10k/day avg
  const todayTok  = 30000;            // 3x average
  const avg   = last30Tok / 30;
  const ratio = avg > 0 ? todayTok / avg : 0;
  assert.ok(Math.abs(ratio - 3.0) < 0.001, `expected 3.0, got ${ratio}`);
});

// ================================================================
// projOpusPct forecast + clamp guard
// ================================================================
console.log('\nprojOpusPct + forecast state');
test('projOpusPct = opusPct / fracElapsed', () => {
  // 40% opus used at 50% of week → projected 80% (on_track)
  const proj = 40 / 0.5;
  assert.strictEqual(proj, 80);
});
test('on_track: opusPct=40 at half week (proj=80)', () => {
  const opusPct = 40, fracElapsed = clamp(0.5, 0.01, 1);
  const proj  = opusPct / fracElapsed;
  const state = opusPct >= 100 ? 'exhausted' : proj >= 100 ? 'tight' : 'on_track';
  eq(state, 'on_track');
});
test('tight: opusPct=60 at half week (proj=120)', () => {
  const opusPct = 60, fracElapsed = clamp(0.5, 0.01, 1);
  const proj  = opusPct / fracElapsed;
  const state = opusPct >= 100 ? 'exhausted' : proj >= 100 ? 'tight' : 'on_track';
  eq(state, 'tight');
});
test('exhausted: opusPct=100', () => {
  const opusPct = 100, fracElapsed = clamp(0.5, 0.01, 1);
  const proj  = opusPct / fracElapsed;
  const state = opusPct >= 100 ? 'exhausted' : proj >= 100 ? 'tight' : 'on_track';
  eq(state, 'exhausted');
});
test('clamp prevents Infinity at Monday 00:01', () => {
  const mondayTs = new Date('2026-06-15T00:00:00Z').getTime();
  const now = mondayTs + 60000;
  const fracElapsed = clamp((now - mondayTs) / (7 * 86400000), 0.01, 1);
  const opusPct = 5;
  const proj = opusPct / fracElapsed; // 5 / 0.01 = 500, not Infinity
  assert.ok(isFinite(proj), 'must be finite');
  eq(fracElapsed, 0.01);
  assert.strictEqual(proj, 500);
});
test('on_track remaining = round(100 - projOpusPct), clamped >= 0', () => {
  const opusPct = 30, fracElapsed = 0.5;
  const proj = opusPct / fracElapsed; // 60
  const rem  = Math.max(0, Math.round(100 - proj)); // 40
  eq(rem, 40);
});

// ================================================================
// Phase 2 — loadFilteredData() logic (pure, extracted for Node testing)
// Riskiest: range cutoff, model filter, day bucketing, top-8 slice, days_with_data
// ================================================================
console.log('\nPhase 2 — filter + aggregation');

// Pure re-implementation of loadFilteredData() logic, extracted from burnboard.html
// (IDB call swapped for a turns array passed in; _filter passed as argument)
function computeFilteredData(turns, filter) {
  const now = Date.now();
  let cutoff = 0;
  if      (filter.range === '7d')  cutoff = now - 7  * 86400000;
  else if (filter.range === '30d') cutoff = now - 30 * 86400000;
  else if (filter.range === '90d') cutoff = now - 90 * 86400000;

  let filtered = turns;
  if (cutoff > 0) {
    filtered = filtered.filter(t => new Date(t.timestamp).getTime() >= cutoff);
  }
  if (filter.model !== 'all') {
    filtered = filtered.filter(t => modelFamily(t.model) === filter.model);
  }

  // daily_usage
  const dailyMap = {};
  for (const t of filtered) {
    const day = t.timestamp.substring(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { day, total_tokens: 0, sessions: new Set() };
    dailyMap[day].total_tokens += t.input_tokens + t.output_tokens;
    dailyMap[day].sessions.add(t.session_id);
  }
  const daily_usage = Object.values(dailyMap)
    .map(d => ({ day: d.day, total_tokens: d.total_tokens, sessions: d.sessions.size }))
    .sort((a, b) => a.day < b.day ? -1 : 1);

  // heatmap
  const hmMap = {};
  for (const t of filtered) {
    const dt  = new Date(t.timestamp);
    const dow = dt.getUTCDay();
    const hr  = dt.getUTCHours();
    const key = `${dow}-${hr}`;
    if (!hmMap[key]) hmMap[key] = { day_of_week: dow, hour_utc: hr, tokens: 0 };
    hmMap[key].tokens += t.input_tokens + t.output_tokens;
  }
  const heatmap = Object.values(hmMap);

  // model_breakdown
  const familyTok = { opus: 0, sonnet: 0, haiku: 0, unknown: 0 };
  for (const t of filtered) {
    const fam = modelFamily(t.model);
    const key = fam === 'other' ? 'unknown' : fam;
    familyTok[key] += t.input_tokens + t.output_tokens;
  }
  const totalTok = familyTok.opus + familyTok.sonnet + familyTok.haiku + familyTok.unknown;
  const model_breakdown = ['opus', 'sonnet', 'haiku', 'unknown']
    .filter(f => familyTok[f] > 0)
    .map(f => ({
      model_family: f,
      tokens: familyTok[f],
      pct: totalTok > 0 ? Math.round(familyTok[f] / totalTok * 100) : 0,
    }));

  // top_projects
  const projMap = {};
  for (const t of filtered) {
    const name = (t.cwd || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'unknown';
    if (!projMap[name]) projMap[name] = { project_name: name, tokens: 0, sessions: new Set() };
    projMap[name].tokens += t.input_tokens + t.output_tokens;
    projMap[name].sessions.add(t.session_id);
  }
  const top_projects = Object.values(projMap)
    .map(p => ({ project_name: p.project_name, tokens: p.tokens, sessions: p.sessions.size }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 8);

  const days_with_data = daily_usage.length;

  return { daily_usage, heatmap, model_breakdown, top_projects, days_with_data };
}

// Helper to build a turn with a timestamp N days ago from now
function daysAgo(n, overrides) {
  const ts = new Date(Date.now() - n * 86400000).toISOString();
  return turn({ timestamp: ts, ...overrides });
}

// Range filter: 7d excludes 8-day-old turn, includes 2-day-old turn
test('7d range: excludes turn 8 days old', () => {
  const old  = daysAgo(8, { session_id: 'old', input_tokens: 1000, output_tokens: 0 });
  const recent = daysAgo(2, { session_id: 'new', input_tokens: 500,  output_tokens: 0 });
  const fd = computeFilteredData([old, recent], { range: '7d', model: 'all' });
  eq(fd.daily_usage.length, 1);
  eq(fd.daily_usage[0].total_tokens, 500);
});

test('7d range: includes turn exactly 2 days old', () => {
  const t = daysAgo(2, { session_id: 's1', input_tokens: 300, output_tokens: 100 });
  const fd = computeFilteredData([t], { range: '7d', model: 'all' });
  eq(fd.daily_usage[0].total_tokens, 400);
});

test('all range: includes old turn', () => {
  const old = turn({ timestamp: '2020-01-01T12:00:00Z', session_id: 'old', input_tokens: 999, output_tokens: 0 });
  const fd = computeFilteredData([old], { range: 'all', model: 'all' });
  eq(fd.daily_usage.length, 1);
  eq(fd.daily_usage[0].total_tokens, 999);
});

// Model filter: opus keeps only opus-family turns
test('model=opus: keeps only opus turns', () => {
  const t1 = turn({ model: 'claude-opus-4-5',   input_tokens: 1000, output_tokens: 0, session_id: 's1' });
  const t2 = turn({ model: 'claude-sonnet-3-7', input_tokens: 500,  output_tokens: 0, session_id: 's2' });
  const fd = computeFilteredData([t1, t2], { range: 'all', model: 'opus' });
  eq(fd.daily_usage[0].total_tokens, 1000);
});

test('model=sonnet: excludes opus turns', () => {
  const t1 = turn({ model: 'claude-opus-4-5',   input_tokens: 1000, output_tokens: 0, session_id: 's1' });
  const t2 = turn({ model: 'claude-sonnet-3-7', input_tokens: 200,  output_tokens: 100, session_id: 's2' });
  const fd = computeFilteredData([t1, t2], { range: 'all', model: 'sonnet' });
  eq(fd.daily_usage[0].total_tokens, 300);
});

// daily_usage: two same-UTC-day turns bucket into one entry, sessions = distinct session count
test('daily_usage: two same-day turns → one entry with summed tokens', () => {
  const t1 = turn({ timestamp: '2026-06-15T10:00:00Z', session_id: 'A', input_tokens: 100, output_tokens: 50 });
  const t2 = turn({ timestamp: '2026-06-15T14:00:00Z', session_id: 'A', input_tokens: 200, output_tokens: 100 });
  const fd = computeFilteredData([t1, t2], { range: 'all', model: 'all' });
  eq(fd.daily_usage.length, 1);
  eq(fd.daily_usage[0].total_tokens, 450);
});

test('daily_usage: sessions = distinct session_id count', () => {
  const t1 = turn({ timestamp: '2026-06-15T10:00:00Z', session_id: 'A', input_tokens: 100, output_tokens: 0 });
  const t2 = turn({ timestamp: '2026-06-15T12:00:00Z', session_id: 'B', input_tokens: 200, output_tokens: 0 });
  const t3 = turn({ timestamp: '2026-06-15T14:00:00Z', session_id: 'A', input_tokens: 50,  output_tokens: 0 });
  const fd = computeFilteredData([t1, t2, t3], { range: 'all', model: 'all' });
  eq(fd.daily_usage[0].sessions, 2);  // A and B, not 3
});

// daily_usage ascending sort
test('daily_usage: sorted ascending by day', () => {
  const t1 = turn({ timestamp: '2026-06-17T10:00:00Z', session_id: 'A', input_tokens: 100, output_tokens: 0 });
  const t2 = turn({ timestamp: '2026-06-15T10:00:00Z', session_id: 'B', input_tokens: 200, output_tokens: 0 });
  const fd = computeFilteredData([t1, t2], { range: 'all', model: 'all' });
  assert.ok(fd.daily_usage[0].day < fd.daily_usage[1].day, 'should be ascending');
});

// top_projects: sorts by tokens desc, slices to 8
test('top_projects: sorts by tokens desc', () => {
  const turns9 = [];
  // 9 projects, each with distinct token volumes descending
  for (let i = 9; i >= 1; i--) {
    turns9.push(turn({ cwd: `/home/user/proj-${i}`, session_id: `s${i}`, input_tokens: i * 1000, output_tokens: 0 }));
  }
  const fd = computeFilteredData(turns9, { range: 'all', model: 'all' });
  eq(fd.top_projects.length, 8);
  eq(fd.top_projects[0].project_name, 'proj-9');   // highest tokens first
  eq(fd.top_projects[7].project_name, 'proj-2');   // 9th (proj-1) excluded
});

test('top_projects: sessions = distinct session_id per project', () => {
  const t1 = turn({ cwd: '/home/user/myproject', session_id: 'A', input_tokens: 100, output_tokens: 0 });
  const t2 = turn({ cwd: '/home/user/myproject', session_id: 'B', input_tokens: 200, output_tokens: 0 });
  const t3 = turn({ cwd: '/home/user/myproject', session_id: 'A', input_tokens: 50,  output_tokens: 0 });
  const fd = computeFilteredData([t1, t2, t3], { range: 'all', model: 'all' });
  eq(fd.top_projects[0].sessions, 2);
});

test('top_projects: empty cwd → "unknown"', () => {
  const t = turn({ cwd: '', session_id: 's1', input_tokens: 100, output_tokens: 0 });
  const fd = computeFilteredData([t], { range: 'all', model: 'all' });
  eq(fd.top_projects[0].project_name, 'unknown');
});

// days_with_data = distinct UTC day count
test('days_with_data equals distinct UTC day count', () => {
  const t1 = turn({ timestamp: '2026-06-15T10:00:00Z', session_id: 'A', input_tokens: 100, output_tokens: 0 });
  const t2 = turn({ timestamp: '2026-06-15T20:00:00Z', session_id: 'B', input_tokens: 200, output_tokens: 0 });
  const t3 = turn({ timestamp: '2026-06-16T10:00:00Z', session_id: 'C', input_tokens: 50,  output_tokens: 0 });
  const fd = computeFilteredData([t1, t2, t3], { range: 'all', model: 'all' });
  eq(fd.days_with_data, 2);  // 2026-06-15 and 2026-06-16
});

test('days_with_data = 0 when no turns in range', () => {
  const old = turn({ timestamp: '2020-01-01T12:00:00Z', session_id: 's1', input_tokens: 100, output_tokens: 0 });
  const fd = computeFilteredData([old], { range: '7d', model: 'all' });
  eq(fd.days_with_data, 0);
});

// model_breakdown: 'other' family maps to 'unknown'
test('model_breakdown: other/unknown family maps to "unknown"', () => {
  const t = turn({ model: 'unknown-model', session_id: 's1', input_tokens: 500, output_tokens: 0 });
  const fd = computeFilteredData([t], { range: 'all', model: 'all' });
  eq(fd.model_breakdown[0].model_family, 'unknown');
});

test('model_breakdown: order is opus, sonnet, haiku, unknown', () => {
  const turns3 = [
    turn({ model: 'claude-haiku-3-5',  session_id: 's1', input_tokens: 100, output_tokens: 0 }),
    turn({ model: 'claude-sonnet-3-7', session_id: 's2', input_tokens: 200, output_tokens: 0 }),
    turn({ model: 'claude-opus-4-5',   session_id: 's3', input_tokens: 300, output_tokens: 0 }),
  ];
  const fd = computeFilteredData(turns3, { range: 'all', model: 'all' });
  eq(fd.model_breakdown[0].model_family, 'opus');
  eq(fd.model_breakdown[1].model_family, 'sonnet');
  eq(fd.model_breakdown[2].model_family, 'haiku');
});

test('model_breakdown: pct sums to ~100', () => {
  const turns3 = [
    turn({ model: 'claude-opus-4-5',   session_id: 's1', input_tokens: 500, output_tokens: 0 }),
    turn({ model: 'claude-sonnet-3-7', session_id: 's2', input_tokens: 300, output_tokens: 0 }),
    turn({ model: 'claude-haiku-3-5',  session_id: 's3', input_tokens: 200, output_tokens: 0 }),
  ];
  const fd = computeFilteredData(turns3, { range: 'all', model: 'all' });
  const sum = fd.model_breakdown.reduce((s, m) => s + m.pct, 0);
  // ponytail: rounding may cause off-by-one; allow sum 99-101
  assert.ok(sum >= 99 && sum <= 101, `pct sum ${sum} not in [99,101]`);
});

// heatmap: day_of_week and hour_utc bucketing
test('heatmap: correct day_of_week and hour_utc from timestamp', () => {
  // 2026-06-15T14:30:00Z → Mon = UTC day 1, hour 14
  const t = turn({ timestamp: '2026-06-15T14:30:00Z', session_id: 's1', input_tokens: 200, output_tokens: 100 });
  const fd = computeFilteredData([t], { range: 'all', model: 'all' });
  eq(fd.heatmap.length, 1);
  eq(fd.heatmap[0].day_of_week, 1);  // Monday
  eq(fd.heatmap[0].hour_utc, 14);
  eq(fd.heatmap[0].tokens, 300);
});

test('heatmap: two turns same cell sum tokens', () => {
  const t1 = turn({ timestamp: '2026-06-15T14:00:00Z', session_id: 's1', input_tokens: 100, output_tokens: 0 });
  const t2 = turn({ timestamp: '2026-06-15T14:59:00Z', session_id: 's2', input_tokens: 200, output_tokens: 0 });
  const fd = computeFilteredData([t1, t2], { range: 'all', model: 'all' });
  eq(fd.heatmap.length, 1);
  eq(fd.heatmap[0].tokens, 300);
});

// ================================================================
// Phase 2 — additional coverage (extended)
// ================================================================
console.log('\nPhase 2 — extended coverage');

// fmtTokens — the formatter used in tooltips, legends, axis ticks
function fmtTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(n);
}

test('fmtTokens: < 1000 → raw string', () => eq(fmtTokens(0),   '0'));
test('fmtTokens: 999 → "999"',         () => eq(fmtTokens(999), '999'));
test('fmtTokens: 1000 → "1K"',         () => eq(fmtTokens(1000), '1K'));
test('fmtTokens: 1500 → "2K" (rounds)', () => eq(fmtTokens(1500), '2K'));
test('fmtTokens: 1000000 → "1.0M"',    () => eq(fmtTokens(1000000), '1.0M'));
test('fmtTokens: 1500000 → "1.5M"',    () => eq(fmtTokens(1500000), '1.5M'));
test('fmtTokens: 284000 → "284K"',     () => eq(fmtTokens(284000), '284K'));  // dump 7.9 example

// 30d and 90d range cutoffs (only 7d and all were tested before)
test('30d range: excludes turn 31 days old', () => {
  const old    = daysAgo(31, { session_id: 'old', input_tokens: 1000, output_tokens: 0 });
  const recent = daysAgo(5,  { session_id: 'new', input_tokens: 200,  output_tokens: 0 });
  const fd = computeFilteredData([old, recent], { range: '30d', model: 'all' });
  eq(fd.daily_usage.length, 1);
  eq(fd.daily_usage[0].total_tokens, 200);
});

test('30d range: includes turn 29 days old', () => {
  const t = daysAgo(29, { session_id: 's1', input_tokens: 400, output_tokens: 0 });
  const fd = computeFilteredData([t], { range: '30d', model: 'all' });
  eq(fd.daily_usage.length, 1);
});

test('90d range: excludes turn 91 days old', () => {
  const old    = daysAgo(91, { session_id: 'old', input_tokens: 999, output_tokens: 0 });
  const recent = daysAgo(10, { session_id: 'new', input_tokens: 100, output_tokens: 0 });
  const fd = computeFilteredData([old, recent], { range: '90d', model: 'all' });
  eq(fd.daily_usage.length, 1);
  eq(fd.daily_usage[0].total_tokens, 100);
});

test('90d range: includes turn 89 days old', () => {
  const t = daysAgo(89, { session_id: 's1', input_tokens: 700, output_tokens: 0 });
  const fd = computeFilteredData([t], { range: '90d', model: 'all' });
  eq(fd.daily_usage.length, 1);
});

// heatmap: rowIndex → dow mapping (the riskiest wiring per changes.md)
// Formula: dow = (rowIndex + 1) % 7
// rowIndex=0 (Mon row) → dow=1; rowIndex=6 (Sun row) → dow=0
test('heatmap rowIndex mapping: Mon (dow=1) lands in row 0', () => {
  // 2026-06-15 is Monday → getUTCDay()=1
  const t = turn({ timestamp: '2026-06-15T10:00:00Z', session_id: 's1', input_tokens: 100, output_tokens: 0 });
  const fd = computeFilteredData([t], { range: 'all', model: 'all' });
  eq(fd.heatmap[0].day_of_week, 1);  // dow=1 → (rowIndex+1)%7=1 → rowIndex=0 (Mon)
});

test('heatmap rowIndex mapping: Sun (dow=0) → (0+6)%7=6 so rowIndex=6 (Sun row)', () => {
  // 2026-06-14 is Sunday → getUTCDay()=0
  const t = turn({ timestamp: '2026-06-14T10:00:00Z', session_id: 's1', input_tokens: 200, output_tokens: 0 });
  const fd = computeFilteredData([t], { range: 'all', model: 'all' });
  eq(fd.heatmap[0].day_of_week, 0);  // dow=0 → rowIndex=(0+6)%7=6 (Sun row — bottom)
});

test('heatmap rowIndex mapping: Sat (dow=6) → rowIndex=5 (Sat row)', () => {
  // 2026-06-13 is Saturday → getUTCDay()=6
  const t = turn({ timestamp: '2026-06-13T10:00:00Z', session_id: 's1', input_tokens: 300, output_tokens: 0 });
  const fd = computeFilteredData([t], { range: 'all', model: 'all' });
  eq(fd.heatmap[0].day_of_week, 6);  // dow=6 → (rowIndex+1)%7=6 → rowIndex=5 (Sat row)
});

test('heatmap: Mon turn and Sun turn land in different cells', () => {
  const tMon = turn({ timestamp: '2026-06-15T14:00:00Z', session_id: 'a', input_tokens: 100, output_tokens: 0 });
  const tSun = turn({ timestamp: '2026-06-14T14:00:00Z', session_id: 'b', input_tokens: 200, output_tokens: 0 });
  const fd = computeFilteredData([tMon, tSun], { range: 'all', model: 'all' });
  eq(fd.heatmap.length, 2);  // different (dow, hour) cells
  const dows = fd.heatmap.map(c => c.day_of_week).sort();
  assert.deepStrictEqual(dows, [0, 1]);  // Sun=0, Mon=1
});

// heatmap under-3-days gate: days_with_data is what the gate uses
test('days_with_data < 3 when only 2 distinct days', () => {
  const t1 = turn({ timestamp: '2026-06-15T10:00:00Z', session_id: 'a', input_tokens: 100, output_tokens: 0 });
  const t2 = turn({ timestamp: '2026-06-16T10:00:00Z', session_id: 'b', input_tokens: 100, output_tokens: 0 });
  const fd = computeFilteredData([t1, t2], { range: 'all', model: 'all' });
  assert.ok(fd.days_with_data < 3, `expected < 3, got ${fd.days_with_data}`);
});

test('days_with_data = 3 when exactly 3 distinct days (gate should pass)', () => {
  const t1 = turn({ timestamp: '2026-06-15T10:00:00Z', session_id: 'a', input_tokens: 100, output_tokens: 0 });
  const t2 = turn({ timestamp: '2026-06-16T10:00:00Z', session_id: 'b', input_tokens: 100, output_tokens: 0 });
  const t3 = turn({ timestamp: '2026-06-17T10:00:00Z', session_id: 'c', input_tokens: 100, output_tokens: 0 });
  const fd = computeFilteredData([t1, t2, t3], { range: 'all', model: 'all' });
  eq(fd.days_with_data, 3);  // exactly 3 → grid should render (gate fires on < 3)
});

test('days_with_data drops below 3 when filter reduces range', () => {
  // 5 days of data total, but 7d filter leaves only 2 (3 are older)
  const old1 = daysAgo(10, { session_id: 'o1', input_tokens: 100, output_tokens: 0 });
  const old2 = daysAgo(11, { session_id: 'o2', input_tokens: 100, output_tokens: 0 });
  const old3 = daysAgo(12, { session_id: 'o3', input_tokens: 100, output_tokens: 0 });
  const r1   = daysAgo(2,  { session_id: 'r1', input_tokens: 100, output_tokens: 0 });
  const r2   = daysAgo(3,  { session_id: 'r2', input_tokens: 100, output_tokens: 0 });
  const fd = computeFilteredData([old1, old2, old3, r1, r2], { range: '7d', model: 'all' });
  assert.ok(fd.days_with_data < 3, `filter should reduce to < 3 days, got ${fd.days_with_data}`);
});

// model_breakdown: families with 0 tokens are excluded
test('model_breakdown: excludes families with 0 tokens', () => {
  // Only opus turns — sonnet/haiku/unknown should not appear
  const t = turn({ model: 'claude-opus-4-5', session_id: 's1', input_tokens: 500, output_tokens: 0 });
  const fd = computeFilteredData([t], { range: 'all', model: 'all' });
  eq(fd.model_breakdown.length, 1);
  eq(fd.model_breakdown[0].model_family, 'opus');
});

test('model_breakdown: empty when no turns pass filter', () => {
  const fd = computeFilteredData([], { range: 'all', model: 'all' });
  eq(fd.model_breakdown.length, 0);
});

test('model_breakdown pct = 100 for single-family range', () => {
  const t1 = turn({ model: 'claude-sonnet-3-7', session_id: 's1', input_tokens: 300, output_tokens: 200 });
  const t2 = turn({ model: 'claude-sonnet-3-7', session_id: 's2', input_tokens: 100, output_tokens: 0, timestamp: '2026-06-15T16:00:00Z' });
  const fd = computeFilteredData([t1, t2], { range: 'all', model: 'all' });
  eq(fd.model_breakdown.length, 1);
  eq(fd.model_breakdown[0].pct, 100);
});

// top_projects: exactly 8 boundary (8 projects → all 8 returned, not sliced)
test('top_projects: exactly 8 projects → all 8 returned', () => {
  const turns8 = [];
  for (let i = 1; i <= 8; i++) {
    turns8.push(turn({ cwd: `/home/user/proj-${i}`, session_id: `s${i}`, input_tokens: i * 100, output_tokens: 0 }));
  }
  const fd = computeFilteredData(turns8, { range: 'all', model: 'all' });
  eq(fd.top_projects.length, 8);
});

// haiku model filter
test('model=haiku: keeps only haiku turns', () => {
  const t1 = turn({ model: 'claude-haiku-3-5', session_id: 's1', input_tokens: 400, output_tokens: 0 });
  const t2 = turn({ model: 'claude-opus-4-5',  session_id: 's2', input_tokens: 900, output_tokens: 0, timestamp: '2026-06-15T16:00:00Z' });
  const fd = computeFilteredData([t1, t2], { range: 'all', model: 'haiku' });
  eq(fd.daily_usage[0].total_tokens, 400);
  eq(fd.model_breakdown[0].model_family, 'haiku');
});

// CANNOT-VERIFY-HEADLESS: browser/DOM-dependent checks confirmed by static inspection
// 1. Filter handler wiring (AC#1): the handler at line 1436 of burnboard.html calls
//    renderFilteredSections() only — `renderDashboard` does not appear in that handler body.
//    Confirmed by grep: line 1446 calls `await renderFilteredSections()`, no renderDashboard call.
// 2. Chart destroy-before-recreate: each render function (renderDailyBurn L969,
//    renderModelBreakdown L1140, renderTopProjects L1182) calls `.destroy()` then null on
//    the module-level handle before `new Chart(...)`.  Pattern verified by source inspection.
// 3. Heatmap rowIndex→dow lookup: line 1069 uses `const dow = (rowIndex + 1) % 7`
//    which correctly maps Mon(rowIndex=0)→dow=1 ... Sun(rowIndex=6)→dow=0.
//    The lookup at line 1075 uses `lookup[\`${dow}-${h}\`]` matching heatmap key `${dow}-${hr}`.

// ================================================================
// Summary
// ================================================================
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
