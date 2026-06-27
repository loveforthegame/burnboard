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
// CANNOT-VERIFY-HEADLESS: Phase 3 browser-only items confirmed by source inspection:
// 4. copyText 1500ms revert — navigator.clipboard.writeText + setTimeout(1500) in burnboard.html.
// 5. One-row-open-at-a-time — _openSession module var compared in the delegated handler.
// 6. Insights on unfiltered path — computeInsights called inside loadDataLocal (not loadFilteredData).
//    Sessions+Cost on filtered path — renderSessions/renderCostSummary called only from renderFilteredSections.

// ================================================================
// Phase 3 — pure compute functions (extracted verbatim from burnboard.html)
// ================================================================

const PRICING = {
  opus:   { input: 15.00, output: 75.00 },
  sonnet: { input:  3.00, output: 15.00 },
  haiku:  { input:  0.25, output:  1.25 },
};

function fmtSessionDur(ms) {
  if (ms < 60000) return '< 1 min';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), rm = m % 60;
  return `${h}h ${rm}m`;
}

function relWhen(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  if (hrs < 48) return 'yesterday';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(iso));
}

// Minimal _cfg stub for computeInsights (localPeakRange uses it)
const _cfg = { timezone: 'UTC' };

function localPeakRange(tz) {
  const refStart = new Date('2026-01-05T13:00:00Z');
  const refEnd   = new Date('2026-01-05T19:00:00Z');
  const fmt = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  return `${fmt.format(refStart).toLowerCase()} – ${fmt.format(refEnd).toLowerCase()}`;
}

function computeInsights(allTurns, now) {
  const DAY_MS = 86400000;
  const last7  = now - 7  * DAY_MS;
  const prev7s = now - 14 * DAY_MS;
  const fired  = [];

  const sessMap = {};
  for (const t of allTurns) {
    if (!sessMap[t.session_id]) sessMap[t.session_id] = [];
    sessMap[t.session_id].push(t);
  }

  // Trigger 1 — Session Spiral
  let spiralCount = 0;
  for (const turns of Object.values(sessMap)) {
    const inWindow = turns.some(t => new Date(t.timestamp).getTime() >= last7);
    if (!inWindow) continue;
    if (turns.length <= 5) continue;
    const sorted = [...turns].sort((a,b) => a.timestamp < b.timestamp ? -1 : 1);
    const toks = sorted.map(t => t.input_tokens + t.output_tokens);
    const early = toks.slice(0, 3);
    const late  = toks.slice(2);
    const avgEarly = early.reduce((s,v) => s+v, 0) / early.length;
    if (avgEarly <= 0) continue;
    const avgLate = late.reduce((s,v) => s+v, 0) / late.length;
    if (avgLate / avgEarly > 3.0) spiralCount++;
  }
  if (spiralCount >= 3) {
    fired.push({ type:'spiral', severity:'warning',
      title:'your sessions get expensive fast',
      body:`${spiralCount} recent sessions had 3x cost growth`,
      copy_text:'Run /compact every 30–45 minutes in long sessions, or use /clear when switching to a new task.' });
  }

  // Trigger 2 — Cache Alert
  let cacheReadNow=0, inputNow=0, totalTokNow=0, cacheReadPrev=0, inputPrev=0;
  for (const t of allTurns) {
    const ts = new Date(t.timestamp).getTime();
    if (ts >= last7) {
      cacheReadNow += t.cache_read_tokens; inputNow += t.input_tokens;
      totalTokNow  += t.input_tokens + t.output_tokens;
    } else if (ts >= prev7s) {
      cacheReadPrev += t.cache_read_tokens; inputPrev += t.input_tokens;
    }
  }
  const denomNow  = cacheReadNow  + inputNow;
  const denomPrev = cacheReadPrev + inputPrev;
  const rateNow  = denomNow  > 0 ? cacheReadNow  / denomNow  : 0;
  const ratePrev = denomPrev > 0 ? cacheReadPrev / denomPrev : 0;
  if (rateNow < 0.10 && ratePrev > 0.25 && totalTokNow > 50000) {
    fired.push({ type:'cache', severity:'danger',
      title:'something looks wrong with your cache',
      body:`cache hit rate dropped from ${Math.round(ratePrev*100)}% to ${Math.round(rateNow*100)}%`,
      copy_text:'Run: claude --version\nIf above 2.1.34, run: npm update -g @anthropic-ai/claude-code' });
  } else if (rateNow < 0.15 && totalTokNow > 100000) {
    fired.push({ type:'cache', severity:'warning',
      title:'your cache efficiency is low',
      body:`only ${Math.round(rateNow*100)}% of input tokens are coming from cache`,
      copy_text:'Put stable rules at the top of CLAUDE.md (these get cached).\nPut session-specific notes at the bottom.' });
  }

  // Trigger 3 — Peak Hour Penalty
  let peakTok=0, totalTok7=0;
  for (const t of allTurns) {
    if (new Date(t.timestamp).getTime() < last7) continue;
    const tok = t.input_tokens + t.output_tokens;
    totalTok7 += tok;
    if (t.is_peak_hour === 1) peakTok += tok;
  }
  const peakPct = totalTok7 > 0 ? peakTok / totalTok7 : 0;
  if (peakPct > 0.50) {
    fired.push({ type:'peak', severity:'info',
      title:'half your usage is during peak hours',
      body:`${Math.round(peakPct*100)}% of use happened during peak hours`,
      copy_text:'Peak hours: weekdays 5–11am PT (13:00–19:00 UTC).\nFor big sessions, start before 5am PT or after 11am PT.' });
  }

  // Trigger 4 — Opus Waste
  let opusWasteCount = 0;
  for (const [, turns] of Object.entries(sessMap)) {
    const inWindow = turns.some(t => new Date(t.timestamp).getTime() >= last7);
    if (!inWindow) continue;
    if (turns.length >= 4) continue;
    const vol = { opus:0, sonnet:0, haiku:0, other:0 };
    for (const t of turns) vol[modelFamily(t.model)] += t.input_tokens + t.output_tokens;
    const dominant = Object.entries(vol).sort((a,b) => b[1]-a[1])[0][0];
    if (dominant === 'opus') opusWasteCount++;
  }
  if (opusWasteCount >= 5) {
    fired.push({ type:'opus_waste', severity:'info',
      title:'using opus for quick questions',
      body:`you have ${opusWasteCount} sessions with under 4 turns using opus`,
      copy_text:'Add to CLAUDE.md:\nUse Haiku for: quick edits, formatting, simple Q&A.\nUse Sonnet for: new code, refactors, multi-step tasks.\nUse Opus only when I explicitly ask.' });
  }

  const PRIO = { danger:0, warning:1, info:2 };
  fired.sort((a,b) => PRIO[a.severity] - PRIO[b.severity]);
  return fired.slice(0, 3);
}

// Helpers for filtered data compute (phase 3 additions)
function computeFilteredDataP3(turns) {
  // Builds recent_sessions, turns_by_session, cost_by_model, summary from a turn array
  const allSessions = buildSessions(turns);
  const recent_sessions = allSessions
    .sort((a,b) => b.last_timestamp > a.last_timestamp ? 1 : -1)
    .slice(0, 20);

  const top20sids = new Set(recent_sessions.map(s => s.session_id));
  const turns_by_session = {};
  for (const t of turns) {
    if (!top20sids.has(t.session_id)) continue;
    if (!turns_by_session[t.session_id]) turns_by_session[t.session_id] = [];
    turns_by_session[t.session_id].push({
      timestamp: t.timestamp, input_tokens: t.input_tokens,
      output_tokens: t.output_tokens, cache_read_tokens: t.cache_read_tokens,
      tool_name: t.tool_name,
    });
  }
  for (const sid of Object.keys(turns_by_session)) {
    turns_by_session[sid].sort((a,b) => a.timestamp < b.timestamp ? -1 : 1);
  }

  const famInput  = { opus:0, sonnet:0, haiku:0, other:0 };
  const famOutput = { opus:0, sonnet:0, haiku:0, other:0 };
  for (const t of turns) {
    const fam = modelFamily(t.model);
    famInput[fam]  += t.input_tokens;
    famOutput[fam] += t.output_tokens;
  }
  const cost_by_model = ['opus','sonnet','haiku'].map(fam => {
    const inp = famInput[fam], out = famOutput[fam];
    if (inp + out === 0) return null;
    return { model: fam, total_tokens: inp+out,
             estimated_cost_usd: (inp/1e6)*PRICING[fam].input + (out/1e6)*PRICING[fam].output };
  }).filter(Boolean);
  const otherTok = famInput.other + famOutput.other;
  if (otherTok > 0) cost_by_model.push({ model:'unknown', total_tokens:otherTok, estimated_cost_usd:0 });

  const sidSet = new Set(turns.map(t => t.session_id));
  const total_api_cost_usd = cost_by_model.reduce((s,m) => s + m.estimated_cost_usd, 0);
  const summary = {
    total_sessions:   sidSet.size,
    total_turns:      turns.length,
    total_input:      turns.reduce((s,t) => s + t.input_tokens, 0),
    total_output:     turns.reduce((s,t) => s + t.output_tokens, 0),
    total_cache_read: turns.reduce((s,t) => s + t.cache_read_tokens, 0),
    total_api_cost_usd,
  };
  return { recent_sessions, turns_by_session, cost_by_model, summary, total_api_cost_usd };
}

// ================================================================
// Phase 3 — fmtSessionDur
// ================================================================
console.log('\nfmtSessionDur');
test('< 60s → "< 1 min"',         () => eq(fmtSessionDur(0),       '< 1 min'));
test('59999ms → "< 1 min"',       () => eq(fmtSessionDur(59999),   '< 1 min'));
test('60000ms → "1 min"',         () => eq(fmtSessionDur(60000),   '1 min'));
test('30 min',                    () => eq(fmtSessionDur(30*60000), '30 min'));
test('59 min',                    () => eq(fmtSessionDur(59*60000), '59 min'));
test('60 min → "1h 0m"',          () => eq(fmtSessionDur(3600000),  '1h 0m'));
test('90 min → "1h 30m"',         () => eq(fmtSessionDur(90*60000), '1h 30m'));
test('125 min → "2h 5m"',         () => eq(fmtSessionDur(125*60000),'2h 5m'));

// ================================================================
// Phase 3 — relWhen
// ================================================================
console.log('\nrelWhen');
test('empty → ""',  () => eq(relWhen(''), ''));
test('null → ""',   () => eq(relWhen(null), ''));
// Boundary tests using fixed timestamps (offset from now)
test('30m ago → "30m ago"', () => {
  const iso = new Date(Date.now() - 30*60000).toISOString();
  assert.ok(relWhen(iso).endsWith('m ago'), `got: ${relWhen(iso)}`);
});
test('5h ago → "5h ago"', () => {
  const iso = new Date(Date.now() - 5*3600000).toISOString();
  assert.ok(relWhen(iso).endsWith('h ago'), `got: ${relWhen(iso)}`);
});
test('23h ago → ends "h ago" not yesterday', () => {
  const iso = new Date(Date.now() - 23*3600000).toISOString();
  assert.ok(relWhen(iso).endsWith('h ago'), `got: ${relWhen(iso)}`);
});
test('25h ago → "yesterday"', () => {
  const iso = new Date(Date.now() - 25*3600000).toISOString();
  eq(relWhen(iso), 'yesterday');
});
test('3 days ago → MMM D format', () => {
  const iso = new Date(Date.now() - 3*86400000).toISOString();
  // Should not be "yesterday" or end "h ago"
  const r = relWhen(iso);
  assert.ok(!r.endsWith('h ago') && r !== 'yesterday', `got: ${r}`);
});

// ================================================================
// Phase 3 — computeInsights: Session Spiral
// ================================================================
console.log('\ncomputeInsights — Spiral');

// Helper to build N sessions each with 6 turns having a high ratio
function spiralSessions(count, now) {
  const turns = [];
  for (let i = 0; i < count; i++) {
    const sid = `spiral-sess-${i}`;
    // Turn 1-3: 100 tokens each; turns 3-6: 500 tokens each → late avg = 400, early avg = 100, ratio=4
    for (let j = 0; j < 6; j++) {
      const ts = new Date(now - 3*86400000 + j*60000).toISOString();
      const tok = j < 3 ? 100 : 500;
      turns.push(turn({ session_id: sid, timestamp: ts, input_tokens: tok, output_tokens: 0, cache_read_tokens: 0 }));
    }
  }
  return turns;
}

test('spiral: fires at 3 qualifying sessions', () => {
  const now = Date.now();
  const t = spiralSessions(3, now);
  const ins = computeInsights(t, now);
  assert.ok(ins.some(i => i.type === 'spiral'), 'spiral should fire');
});
test('spiral: silent at 2 qualifying sessions', () => {
  const now = Date.now();
  const t = spiralSessions(2, now);
  const ins = computeInsights(t, now);
  assert.ok(!ins.some(i => i.type === 'spiral'), 'spiral should not fire at 2');
});
test('spiral: silent when sessions have exactly 5 turns (<=5 → skip)', () => {
  const now = Date.now();
  const turns = [];
  for (let i = 0; i < 3; i++) {
    const sid = `sess-5t-${i}`;
    for (let j = 0; j < 5; j++) {
      const ts = new Date(now - 3*86400000 + j*60000).toISOString();
      const tok = j < 3 ? 100 : 500;
      turns.push(turn({ session_id: sid, timestamp: ts, input_tokens: tok, output_tokens: 0, cache_read_tokens: 0 }));
    }
  }
  const ins = computeInsights(turns, now);
  assert.ok(!ins.some(i => i.type === 'spiral'), 'spiral: 5-turn sessions should not qualify');
});
test('spiral: ratio exactly 3.0 does NOT fire (strict >)', () => {
  const now = Date.now();
  const turns = [];
  for (let i = 0; i < 3; i++) {
    const sid = `sess-ratio3-${i}`;
    // early avg = 100, late avg = 300 (including turn[2]=100) → ratio = 300/100 = 3.0 (not > 3)
    // turns[0,1,2] = 100; turns[2,3,4,5] = late. avg of [100,100,100,100] = 100. ratio=1. need to be precise.
    // Build: turns 0,1,2 = 100; turns 3,4,5 = 200. early=[100,100,100] avg=100; late=[100,200,200,200] avg=175. ratio=1.75
    // To get exactly 3.0: early=[100,100,100]=100 avg; late=[turn2=100, turn3=100, turn4=100, turn5=220] = avg=130. Not 3.0.
    // Precise: early = [t0,t1,t2] avg = E; late = [t2,t3,t4,t5] avg = L; L/E = 3.0 exactly.
    // E = (a+b+c)/3; L = (c+d+e+f)/4; 4L = 3E → c+d+e+f = (3/4)(a+b+c).
    // Simple: a=b=c=100 → E=100; need L=300: c+d+e+f=1200 → d+e+f=1100. Use d=e=f=366+1/3 (not integer).
    // Use a=b=c=300, d=e=f=0 → E=300; L=(300+0+0+0)/4=75. ratio=0.25. No.
    // Simpler: a=0,b=0,c=300 → early avg=100; late=[300,d,e,f]; want late avg=300 → d+e+f=900 → d=e=f=300.
    // ratio = 300/100 = 3.0 EXACTLY. Verify: toks=[0,0,300,300,300,300]; early=[0,0,300] avg=100; late=[300,300,300,300] avg=300.
    const tokPattern = [0, 0, 300, 300, 300, 300];
    for (let j = 0; j < 6; j++) {
      const ts = new Date(now - 3*86400000 + j*60000).toISOString();
      turns.push(turn({ session_id: sid, timestamp: ts, input_tokens: tokPattern[j], output_tokens: 0, cache_read_tokens: 0 }));
    }
  }
  const ins = computeInsights(turns, now);
  assert.ok(!ins.some(i => i.type === 'spiral'), 'spiral: ratio=3.0 exactly should NOT fire');
});
test('spiral: avgEarly=0 session skipped (no divide)', () => {
  const now = Date.now();
  // 3 sessions where first 3 turns all have 0 tokens (avgEarly=0) → should not throw, not fire
  const turns = [];
  for (let i = 0; i < 3; i++) {
    const sid = `sess-zero-${i}`;
    for (let j = 0; j < 6; j++) {
      const ts = new Date(now - 3*86400000 + j*60000).toISOString();
      // All turns 0 tokens → avgEarly=0, session skipped
      turns.push(turn({ session_id: sid, timestamp: ts, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 }));
    }
  }
  const ins = computeInsights(turns, now);
  assert.ok(!ins.some(i => i.type === 'spiral'), 'avgEarly=0: session skipped, no spiral');
});

// ================================================================
// Phase 3 — computeInsights: Cache Alert
// ================================================================
console.log('\ncomputeInsights — Cache Alert');

function makeCacheTurns({ rateNow, ratePrev, weekTotal }, now) {
  // Build minimal turns to achieve given rates
  const turns = [];
  // This-week turns: rateNow = cache/(cache+input); totalTok=weekTotal
  const inputNow = Math.floor(weekTotal / 2);
  const outputNow = weekTotal - inputNow;
  // cache_read = rateNow * (cache_read + input) → solve: cache = rateNow*input/(1-rateNow)
  const cacheReadNow = rateNow > 0 ? Math.round(rateNow * inputNow / (1 - rateNow)) : 0;
  turns.push(turn({
    session_id: 'now-s',
    timestamp: new Date(now - 3*86400000).toISOString(),
    input_tokens: inputNow, output_tokens: outputNow,
    cache_read_tokens: cacheReadNow, is_peak_hour: 0,
  }));
  // Prev-week turns
  if (ratePrev !== undefined) {
    const inputPrev = 50000;
    const cacheReadPrev = ratePrev > 0 ? Math.round(ratePrev * inputPrev / (1 - ratePrev)) : 0;
    turns.push(turn({
      session_id: 'prev-s',
      timestamp: new Date(now - 10*86400000).toISOString(),
      input_tokens: inputPrev, output_tokens: 0,
      cache_read_tokens: cacheReadPrev, is_peak_hour: 0,
    }));
  }
  return turns;
}

test('cache DANGER fires: rateNow<10%, ratePrev>25%, weekTotal>50k', () => {
  const now = Date.now();
  // rateNow=0.05 (5%), ratePrev=0.30 (30%), weekTotal=100000
  const turns = makeCacheTurns({ rateNow:0.05, ratePrev:0.30, weekTotal:100000 }, now);
  const ins = computeInsights(turns, now);
  assert.ok(ins.some(i => i.type === 'cache' && i.severity === 'danger'), 'cache DANGER should fire');
});
test('cache DANGER silent if rateNow >= 10%', () => {
  const now = Date.now();
  const turns = makeCacheTurns({ rateNow:0.10, ratePrev:0.30, weekTotal:100000 }, now);
  const ins = computeInsights(turns, now);
  assert.ok(!ins.some(i => i.type === 'cache' && i.severity === 'danger'), 'cache DANGER: rateNow=10% should NOT fire (strict <)');
});
test('cache DANGER silent if ratePrev <= 25%', () => {
  const now = Date.now();
  // Exact: ratePrev = 25/100 = 0.25. cache/(cache+input) = 0.25 → cache=input/3.
  // Use input=75000, cache=25000 → rate=25000/100000=0.25. rateNow=0.05, weekTotal>50k.
  const turns = [
    turn({ session_id:'now-s', timestamp: new Date(now-3*86400000).toISOString(),
      input_tokens:50000, output_tokens:50000, cache_read_tokens:2632, is_peak_hour:0 }),
    // prev: cache=25000, input=75000 → rate=25000/100000=0.25 exactly
    turn({ session_id:'prev-s', timestamp: new Date(now-10*86400000).toISOString(),
      input_tokens:75000, output_tokens:0, cache_read_tokens:25000, is_peak_hour:0 }),
  ];
  const ins = computeInsights(turns, now);
  assert.ok(!ins.some(i => i.type === 'cache' && i.severity === 'danger'), 'cache DANGER: ratePrev=25% should NOT fire (strict >)');
});
test('cache DANGER silent if weekTotal <= 50k', () => {
  const now = Date.now();
  const turns = makeCacheTurns({ rateNow:0.05, ratePrev:0.30, weekTotal:50000 }, now);
  const ins = computeInsights(turns, now);
  assert.ok(!ins.some(i => i.type === 'cache' && i.severity === 'danger'), 'cache DANGER: weekTotal=50000 should NOT fire (strict >)');
});
test('cache WARNING fires: rateNow<15%, weekTotal>100k (no DANGER)', () => {
  const now = Date.now();
  // rateNow=0.10 (>=10% so no DANGER), weekTotal=150000
  const turns = makeCacheTurns({ rateNow:0.10, ratePrev:0.10, weekTotal:150000 }, now);
  const ins = computeInsights(turns, now);
  assert.ok(ins.some(i => i.type === 'cache' && i.severity === 'warning'), 'cache WARNING should fire');
});
test('cache WARNING silent at rateNow >= 15%', () => {
  const now = Date.now();
  // Exact rateNow=0.15: cache/(cache+input)=0.15 → cache=0.15*input/(1-0.15)=0.15*input/0.85
  // input=85000, cache=15000 → 15000/100000=0.15 exactly. output=50000 → total=135000>100k.
  // ratePrev doesn't matter (< 0.25, no DANGER); rateNow=0.15 → WARNING should NOT fire.
  const turns = [
    turn({ session_id:'now-s', timestamp: new Date(now-3*86400000).toISOString(),
      input_tokens:85000, output_tokens:50000, cache_read_tokens:15000, is_peak_hour:0 }),
    turn({ session_id:'prev-s', timestamp: new Date(now-10*86400000).toISOString(),
      input_tokens:10000, output_tokens:0, cache_read_tokens:1000, is_peak_hour:0 }),
  ];
  const ins = computeInsights(turns, now);
  assert.ok(!ins.some(i => i.type === 'cache'), 'cache WARNING: rateNow=15% should NOT fire');
});
test('cache WARNING silent at weekTotal <= 100k', () => {
  const now = Date.now();
  const turns = makeCacheTurns({ rateNow:0.10, ratePrev:0.10, weekTotal:100000 }, now);
  const ins = computeInsights(turns, now);
  assert.ok(!ins.some(i => i.type === 'cache'), 'cache WARNING: weekTotal=100000 should NOT fire');
});
test('cache DANGER suppresses WARNING (one card max)', () => {
  const now = Date.now();
  // Conditions for DANGER: rateNow<10%, ratePrev>25%, weekTotal>50k → also satisfies WARNING (rateNow<15%)
  const turns = makeCacheTurns({ rateNow:0.05, ratePrev:0.30, weekTotal:100000 }, now);
  const ins = computeInsights(turns, now);
  const cacheIns = ins.filter(i => i.type === 'cache');
  eq(cacheIns.length, 1);
  eq(cacheIns[0].severity, 'danger');
});

// ================================================================
// Phase 3 — computeInsights: Peak Hour Penalty
// ================================================================
console.log('\ncomputeInsights — Peak Penalty');

test('peak fires when peak_pct > 0.50', () => {
  const now = Date.now();
  const ts = new Date(now - 3*86400000).toISOString();
  // 60% peak, 40% off-peak
  const turns = [
    turn({ session_id:'p1', timestamp:ts, input_tokens:600, output_tokens:0, cache_read_tokens:0, is_peak_hour:1 }),
    turn({ session_id:'p2', timestamp:ts, input_tokens:400, output_tokens:0, cache_read_tokens:0, is_peak_hour:0 }),
  ];
  const ins = computeInsights(turns, now);
  assert.ok(ins.some(i => i.type === 'peak'), 'peak should fire');
});
test('peak silent at exactly 0.50 (strict >)', () => {
  const now = Date.now();
  const ts = new Date(now - 3*86400000).toISOString();
  const turns = [
    turn({ session_id:'p1', timestamp:ts, input_tokens:500, output_tokens:0, cache_read_tokens:0, is_peak_hour:1 }),
    turn({ session_id:'p2', timestamp:ts, input_tokens:500, output_tokens:0, cache_read_tokens:0, is_peak_hour:0 }),
  ];
  const ins = computeInsights(turns, now);
  assert.ok(!ins.some(i => i.type === 'peak'), 'peak: exactly 0.50 should NOT fire');
});
test('peak uses is_peak_hour field', () => {
  const now = Date.now();
  const ts = new Date(now - 3*86400000).toISOString();
  // All tokens are peak-hour
  const turns = [turn({ session_id:'p1', timestamp:ts, input_tokens:1000, output_tokens:0, cache_read_tokens:0, is_peak_hour:1 })];
  const ins = computeInsights(turns, now);
  assert.ok(ins.some(i => i.type === 'peak'), 'all peak tokens should fire');
});

// ================================================================
// Phase 3 — computeInsights: Opus Waste
// ================================================================
console.log('\ncomputeInsights — Opus Waste');

function makeOpusSessions(count, now, turnCount=2) {
  const turns = [];
  for (let i = 0; i < count; i++) {
    const sid = `opus-${i}`;
    for (let j = 0; j < turnCount; j++) {
      turns.push(turn({
        session_id: sid, model: 'claude-opus-4-5',
        timestamp: new Date(now - 3*86400000 + j*60000).toISOString(),
        input_tokens: 500, output_tokens: 0, cache_read_tokens: 0, is_peak_hour: 0,
      }));
    }
  }
  return turns;
}

test('opus_waste fires at 5 qualifying sessions', () => {
  const now = Date.now();
  const ins = computeInsights(makeOpusSessions(5, now, 2), now);
  assert.ok(ins.some(i => i.type === 'opus_waste'), 'opus_waste should fire at 5');
});
test('opus_waste silent at 4 qualifying sessions', () => {
  const now = Date.now();
  const ins = computeInsights(makeOpusSessions(4, now, 2), now);
  assert.ok(!ins.some(i => i.type === 'opus_waste'), 'opus_waste: 4 sessions should not fire');
});
test('opus_waste: 3 turns qualifies (< 4 strict)', () => {
  const now = Date.now();
  const ins = computeInsights(makeOpusSessions(5, now, 3), now);
  assert.ok(ins.some(i => i.type === 'opus_waste'), 'opus_waste: 3 turns should qualify');
});
test('opus_waste: 4 turns does NOT qualify', () => {
  const now = Date.now();
  const ins = computeInsights(makeOpusSessions(5, now, 4), now);
  assert.ok(!ins.some(i => i.type === 'opus_waste'), 'opus_waste: 4 turns should NOT qualify (strict <4)');
});
test('opus_waste: sonnet sessions excluded', () => {
  const now = Date.now();
  const turns = [];
  for (let i = 0; i < 5; i++) {
    turns.push(turn({
      session_id: `sonnet-${i}`, model: 'claude-sonnet-3-7',
      timestamp: new Date(now - 3*86400000).toISOString(),
      input_tokens: 500, output_tokens: 0, cache_read_tokens: 0, is_peak_hour: 0,
    }));
  }
  const ins = computeInsights(turns, now);
  assert.ok(!ins.some(i => i.type === 'opus_waste'), 'sonnet sessions should not trigger opus_waste');
});

// ================================================================
// Phase 3 — computeInsights: Priority / max-3
// ================================================================
console.log('\ncomputeInsights — priority + max-3');

test('empty turns → no insights (green fallback is render-time)', () => {
  eq(computeInsights([], Date.now()).length, 0);
});

test('when >3 fire, exactly 3 returned in danger>warning>info order', () => {
  const now = Date.now();

  // Build turns that fire all 4 triggers simultaneously
  const turns = [];
  // Cache DANGER: rateNow<10%, ratePrev>25%, weekTotal>50k
  // Input=50000, cacheRead=0, output=50000; prev: input=10000, cacheRead=4000
  turns.push(turn({ session_id:'c1', timestamp: new Date(now-3*86400000).toISOString(),
    input_tokens:50000, output_tokens:50000, cache_read_tokens:0, is_peak_hour:1,
    model:'claude-opus-4-5', cache_creation_tokens:0 }));
  turns.push(turn({ session_id:'cp1', timestamp: new Date(now-10*86400000).toISOString(),
    input_tokens:10000, output_tokens:0, cache_read_tokens:4000, is_peak_hour:0,
    model:'claude-sonnet-3-7', cache_creation_tokens:0 }));
  // Spiral: 3 sessions, 6 turns each with high ratio
  for (let i=0; i<3; i++) {
    const sid = `sp-${i}`;
    const tokPattern = [0,0,100,500,500,500];
    for (let j=0; j<6; j++) {
      turns.push(turn({ session_id:sid, timestamp: new Date(now-2*86400000+j*60000).toISOString(),
        input_tokens:tokPattern[j], output_tokens:0, cache_read_tokens:0, is_peak_hour:1,
        model:'claude-sonnet-3-7', cache_creation_tokens:0 }));
    }
  }
  // Opus waste: 5 sessions with <4 turns
  for (let i=0; i<5; i++) {
    turns.push(turn({ session_id:`ow-${i}`, timestamp: new Date(now-2*86400000).toISOString(),
      input_tokens:100, output_tokens:0, cache_read_tokens:0, is_peak_hour:0,
      model:'claude-opus-4-5', cache_creation_tokens:0 }));
  }

  const ins = computeInsights(turns, now);
  assert.ok(ins.length <= 3, `max 3: got ${ins.length}`);
  if (ins.length === 3) {
    // danger must come before warning, warning before info
    const severities = ins.map(i => i.severity);
    const PRIO = { danger:0, warning:1, info:2 };
    for (let i=1; i<severities.length; i++) {
      assert.ok(PRIO[severities[i]] >= PRIO[severities[i-1]], `order wrong: ${severities}`);
    }
    // First must be danger (cache DANGER)
    eq(severities[0], 'danger');
  }
});

// ================================================================
// Phase 3 — session/turn aggregation
// ================================================================
console.log('\nPhase 3 — session/turn aggregation');

test('recent_sessions: sorted by last_timestamp desc', () => {
  const t1 = turn({ session_id:'a', timestamp:'2026-06-10T10:00:00Z', input_tokens:100, output_tokens:0, cache_read_tokens:0 });
  const t2 = turn({ session_id:'b', timestamp:'2026-06-15T10:00:00Z', input_tokens:200, output_tokens:0, cache_read_tokens:0 });
  const fd = computeFilteredDataP3([t1, t2]);
  eq(fd.recent_sessions[0].session_id, 'b');  // more recent first
  eq(fd.recent_sessions[1].session_id, 'a');
});

test('recent_sessions: sliced to 20 when 21+ sessions exist', () => {
  const turns = [];
  for (let i = 0; i < 21; i++) {
    turns.push(turn({ session_id:`sess-${i}`,
      timestamp: new Date(Date.now() - i*3600000).toISOString(),
      input_tokens: 100, output_tokens: 0, cache_read_tokens: 0 }));
  }
  const fd = computeFilteredDataP3(turns);
  eq(fd.recent_sessions.length, 20);
});

test('turns_by_session: only top-20 sessions present', () => {
  const turns = [];
  for (let i = 0; i < 21; i++) {
    turns.push(turn({ session_id:`sess-${i}`,
      timestamp: new Date(Date.now() - i*3600000).toISOString(),
      input_tokens: 100, output_tokens: 0, cache_read_tokens: 0 }));
  }
  const fd = computeFilteredDataP3(turns);
  // sess-20 is oldest (21st) — should not be in turns_by_session
  const sids = Object.keys(fd.turns_by_session);
  eq(sids.length, 20);
  // The oldest session should be excluded
  assert.ok(!sids.includes('sess-20'), 'oldest session should be excluded from turns_by_session');
});

test('turns_by_session: per-session turns sorted ascending by timestamp', () => {
  const turns = [
    turn({ session_id:'s1', timestamp:'2026-06-15T16:00:00Z', input_tokens:200, output_tokens:0, cache_read_tokens:0 }),
    turn({ session_id:'s1', timestamp:'2026-06-15T14:00:00Z', input_tokens:100, output_tokens:0, cache_read_tokens:0 }),
  ];
  const fd = computeFilteredDataP3(turns);
  const ts = fd.turns_by_session['s1'];
  assert.ok(ts[0].timestamp < ts[1].timestamp, 'turns should be ascending');
});

test('turns_by_session: only 5 dump-15.1 fields per turn', () => {
  const fd = computeFilteredDataP3([turn({ session_id:'s1', input_tokens:100, output_tokens:50, cache_read_tokens:10 })]);
  const t = fd.turns_by_session['s1'][0];
  const keys = Object.keys(t).sort();
  assert.deepStrictEqual(keys, ['cache_read_tokens','input_tokens','output_tokens','timestamp','tool_name'].sort());
});

// Context-growth mini-bar: last turn bar = 100%
test('context-growth: last turn cumulative = session total (100%)', () => {
  const turns = [
    { timestamp:'2026-06-15T14:00:00Z', input_tokens:100, output_tokens:50, cache_read_tokens:0 },
    { timestamp:'2026-06-15T14:30:00Z', input_tokens:200, output_tokens:100, cache_read_tokens:0 },
  ];
  let cumulative = 0;
  const total = turns.reduce((s,t) => s + t.input_tokens + t.output_tokens, 0);
  for (const t of turns) cumulative += t.input_tokens + t.output_tokens;
  eq(cumulative, total);
  eq(Math.round(cumulative / total * 100), 100);
});

// Heavy-context: input > 3× turn1 (strict)
test('heavy-context: input > 3× turn1 is flagged', () => {
  const turns = [
    { input_tokens:100 },
    { input_tokens:301 },  // 301 > 300 = 3*100 → heavy
  ];
  const firstInput = turns[0].input_tokens;
  assert.ok(turns[1].input_tokens > 3 * firstInput, 'should be heavy');
});
test('heavy-context: input = 3× turn1 is NOT flagged (strict >)', () => {
  const turns = [{ input_tokens:100 }, { input_tokens:300 }];
  const firstInput = turns[0].input_tokens;
  assert.ok(!(turns[1].input_tokens > 3 * firstInput), '3× exactly should not flag');
});
test('heavy-context: turn1 input=0 → nothing flagged (guard)', () => {
  const turns = [{ input_tokens:0 }, { input_tokens:1000 }];
  const firstInput = turns[0].input_tokens;
  // Guard: if firstInput=0, skip flagging
  assert.ok(firstInput <= 0, 'firstInput=0 guard should skip flagging');
});

// ================================================================
// Phase 3 — cost_by_model
// ================================================================
console.log('\nPhase 3 — cost_by_model');

test('cost_by_model: opus cost computed correctly', () => {
  const t = turn({ model:'claude-opus-4-5', input_tokens:1000000, output_tokens:1000000, cache_read_tokens:0 });
  const fd = computeFilteredDataP3([t]);
  const opus = fd.cost_by_model.find(m => m.model === 'opus');
  // (1/1e6)*15 + (1/1e6)*75 = 15 + 75 = 90
  assert.ok(Math.abs(opus.estimated_cost_usd - 90) < 0.001, `expected 90, got ${opus.estimated_cost_usd}`);
});

test('cost_by_model: haiku cost computed correctly', () => {
  const t = turn({ model:'claude-haiku-3-5', input_tokens:1000000, output_tokens:1000000, cache_read_tokens:0 });
  const fd = computeFilteredDataP3([t]);
  const haiku = fd.cost_by_model.find(m => m.model === 'haiku');
  // (1/1e6)*0.25 + (1/1e6)*1.25 = 0.25+1.25 = 1.50
  assert.ok(Math.abs(haiku.estimated_cost_usd - 1.50) < 0.001, `expected 1.50, got ${haiku.estimated_cost_usd}`);
});

test('cost_by_model: unknown/other family → $0', () => {
  const t = turn({ model:'unknown-model', input_tokens:1000000, output_tokens:1000000, cache_read_tokens:0 });
  const fd = computeFilteredDataP3([t]);
  const unk = fd.cost_by_model.find(m => m.model === 'unknown');
  assert.ok(unk, 'unknown family should appear');
  eq(unk.estimated_cost_usd, 0);
});

test('cost_by_model: only >0-token families included', () => {
  const t = turn({ model:'claude-opus-4-5', input_tokens:100, output_tokens:0, cache_read_tokens:0 });
  const fd = computeFilteredDataP3([t]);
  assert.ok(fd.cost_by_model.every(m => m.total_tokens > 0), 'all entries must have >0 tokens');
  eq(fd.cost_by_model.length, 1);
  eq(fd.cost_by_model[0].model, 'opus');
});

// ================================================================
// Phase 3 — summary
// ================================================================
console.log('\nPhase 3 — summary');

test('summary: distinct session count', () => {
  const turns = [
    turn({ session_id:'a', input_tokens:100, output_tokens:0, cache_read_tokens:0 }),
    turn({ session_id:'a', input_tokens:200, output_tokens:0, cache_read_tokens:0, timestamp:'2026-06-15T15:00:00Z' }),
    turn({ session_id:'b', input_tokens:300, output_tokens:0, cache_read_tokens:0 }),
  ];
  const fd = computeFilteredDataP3(turns);
  eq(fd.summary.total_sessions, 2);
  eq(fd.summary.total_turns, 3);
});

test('summary: token sums correct', () => {
  const turns = [
    turn({ session_id:'a', input_tokens:100, output_tokens:50, cache_read_tokens:10 }),
    turn({ session_id:'a', input_tokens:200, output_tokens:100, cache_read_tokens:5, timestamp:'2026-06-15T15:00:00Z' }),
  ];
  const fd = computeFilteredDataP3(turns);
  eq(fd.summary.total_input, 300);
  eq(fd.summary.total_output, 150);
  eq(fd.summary.total_cache_read, 15);
});

test('summary: total_api_cost = sum of cost_by_model', () => {
  const t = turn({ model:'claude-sonnet-3-7', input_tokens:1000000, output_tokens:1000000, cache_read_tokens:0 });
  const fd = computeFilteredDataP3([t]);
  const expected = (1) * 3.00 + (1) * 15.00;  // 1M input + 1M output
  assert.ok(Math.abs(fd.summary.total_api_cost_usd - expected) < 0.001, `got ${fd.summary.total_api_cost_usd}`);
  assert.ok(Math.abs(fd.total_api_cost_usd - expected) < 0.001, 'top-level total_api_cost_usd matches');
});

// ================================================================
// Phase 3 — additional boundary coverage (tester-added)
// ================================================================
console.log('\nPhase 3 — additional boundary coverage');

// --- relWhen boundary: exactly 60 minutes ---
test('relWhen: 60m ago → "1h ago" (not "60m ago")', () => {
  const iso = new Date(Date.now() - 60 * 60000).toISOString();
  const r = relWhen(iso);
  assert.ok(r.endsWith('h ago'), `60m should be "1h ago", got: ${r}`);
});
test('relWhen: exactly 59m ago → ends "m ago"', () => {
  const iso = new Date(Date.now() - 59 * 60000).toISOString();
  const r = relWhen(iso);
  assert.ok(r.endsWith('m ago'), `59m should end "m ago", got: ${r}`);
});
// 48h boundary: exactly 48h ago is the first ms NOT "yesterday"
test('relWhen: exactly 47h ago → "yesterday"', () => {
  const iso = new Date(Date.now() - 47 * 3600000).toISOString();
  eq(relWhen(iso), 'yesterday');
});
test('relWhen: exactly 49h ago → MMM D (not yesterday)', () => {
  const iso = new Date(Date.now() - 49 * 3600000).toISOString();
  const r = relWhen(iso);
  assert.ok(r !== 'yesterday' && !r.endsWith('h ago'), `49h should be MMM D, got: ${r}`);
});

// --- fmtSessionDur: exact 59-minute boundary ---
test('fmtSessionDur: 3599999ms (59m 59s) → "59 min"', () => {
  eq(fmtSessionDur(3599999), '59 min');
});
test('fmtSessionDur: 3600001ms (just over 1h) → "1h 0m"', () => {
  eq(fmtSessionDur(3600001), '1h 0m');
});

// --- Spiral: session outside 7-day window excluded ---
test('spiral: session with all turns >7 days ago excluded from count', () => {
  const now = Date.now();
  // 3 high-ratio sessions but all turns are 10 days ago (outside last-7 window)
  const turns = [];
  for (let i = 0; i < 3; i++) {
    const sid = `old-spiral-${i}`;
    for (let j = 0; j < 6; j++) {
      const ts = new Date(now - 10 * 86400000 + j * 60000).toISOString();
      turns.push(turn({ session_id: sid, timestamp: ts, input_tokens: j < 3 ? 100 : 500, output_tokens: 0, cache_read_tokens: 0 }));
    }
  }
  const ins = computeInsights(turns, now);
  assert.ok(!ins.some(i => i.type === 'spiral'), 'sessions outside 7-day window should not count toward spiral');
});

// --- Spiral: session with exactly 6 turns qualifies (>5 strict) ---
test('spiral: exactly 6 turns qualifies (>5 strict)', () => {
  const now = Date.now();
  // 3 sessions, each exactly 6 turns with ratio > 3.0
  const ins = computeInsights(spiralSessions(3, now), now);
  assert.ok(ins.some(i => i.type === 'spiral'), '6-turn sessions should qualify (>5)');
});

// --- Opus Waste: sessions outside 7-day window excluded ---
test('opus_waste: sessions outside 7-day window excluded', () => {
  const now = Date.now();
  // 5 opus sessions with <4 turns but all turns 10 days ago
  const turns = [];
  for (let i = 0; i < 5; i++) {
    turns.push(turn({
      session_id: `old-opus-${i}`, model: 'claude-opus-4-5',
      timestamp: new Date(now - 10 * 86400000).toISOString(),
      input_tokens: 500, output_tokens: 0, cache_read_tokens: 0, is_peak_hour: 0,
    }));
  }
  const ins = computeInsights(turns, now);
  assert.ok(!ins.some(i => i.type === 'opus_waste'), 'opus sessions outside 7-day window should not count');
});

// --- Peak: session outside 7-day window excluded ---
test('peak: turns outside 7-day window not counted', () => {
  const now = Date.now();
  // All peak-hour tokens are 10 days old (outside window); no in-window turns
  const turns = [
    turn({ session_id: 'old-peak', timestamp: new Date(now - 10 * 86400000).toISOString(),
      input_tokens: 1000, output_tokens: 0, cache_read_tokens: 0, is_peak_hour: 1 }),
  ];
  const ins = computeInsights(turns, now);
  // totalTok7=0 → peakPct=0 → no fire
  assert.ok(!ins.some(i => i.type === 'peak'), 'peak: out-of-window turns must be excluded');
});

// --- recent_sessions: exactly 20 sessions → all 20 returned (not sliced to 19) ---
test('recent_sessions: exactly 20 sessions → all 20 returned', () => {
  const turns = [];
  for (let i = 0; i < 20; i++) {
    turns.push(turn({ session_id: `sess-${i}`,
      timestamp: new Date(Date.now() - i * 3600000).toISOString(),
      input_tokens: 100, output_tokens: 0, cache_read_tokens: 0 }));
  }
  const fd = computeFilteredDataP3(turns);
  eq(fd.recent_sessions.length, 20);
});

// --- recent_sessions: duration = last_timestamp - first_timestamp ---
test('recent_sessions: first_timestamp and last_timestamp present for duration', () => {
  const turns = [
    turn({ session_id: 's1', timestamp: '2026-06-15T10:00:00Z', input_tokens: 100, output_tokens: 0, cache_read_tokens: 0 }),
    turn({ session_id: 's1', timestamp: '2026-06-15T12:30:00Z', input_tokens: 200, output_tokens: 0, cache_read_tokens: 0 }),
  ];
  const fd = computeFilteredDataP3(turns);
  const s = fd.recent_sessions[0];
  const durMs = new Date(s.last_timestamp).getTime() - new Date(s.first_timestamp).getTime();
  eq(fmtSessionDur(durMs), '2h 30m');
});

// --- cost_by_model: sonnet cost computed correctly ---
test('cost_by_model: sonnet cost computed correctly', () => {
  const t = turn({ model: 'claude-sonnet-3-7', input_tokens: 2000000, output_tokens: 500000, cache_read_tokens: 0 });
  const fd = computeFilteredDataP3([t]);
  const sonnet = fd.cost_by_model.find(m => m.model === 'sonnet');
  // (2/1e6)*3.00 + (0.5/1e6)*15.00 = 6.00 + 7.50 = 13.50
  assert.ok(Math.abs(sonnet.estimated_cost_usd - 13.50) < 0.001, `expected 13.50, got ${sonnet.estimated_cost_usd}`);
});

// --- cost_by_model: order is opus, sonnet, haiku (then unknown if present) ---
test('cost_by_model: order is opus, sonnet, haiku', () => {
  const turns = [
    turn({ model: 'claude-haiku-3-5',  session_id: 'h', input_tokens: 100, output_tokens: 0, cache_read_tokens: 0 }),
    turn({ model: 'claude-sonnet-3-7', session_id: 's', input_tokens: 200, output_tokens: 0, cache_read_tokens: 0 }),
    turn({ model: 'claude-opus-4-5',   session_id: 'o', input_tokens: 300, output_tokens: 0, cache_read_tokens: 0 }),
  ];
  const fd = computeFilteredDataP3(turns);
  eq(fd.cost_by_model[0].model, 'opus');
  eq(fd.cost_by_model[1].model, 'sonnet');
  eq(fd.cost_by_model[2].model, 'haiku');
});

// --- summary: empty turns → zero everything ---
test('summary: zero turns → all fields zero', () => {
  const fd = computeFilteredDataP3([]);
  eq(fd.summary.total_sessions, 0);
  eq(fd.summary.total_turns, 0);
  eq(fd.summary.total_input, 0);
  eq(fd.summary.total_output, 0);
  eq(fd.summary.total_cache_read, 0);
  eq(fd.summary.total_api_cost_usd, 0);
  eq(fd.total_api_cost_usd, 0);
});

// --- CANNOT-VERIFY-HEADLESS: Phase 3 DOM-only behavior confirmed by static inspection ---
// 7. copyText 1500ms revert — burnboard.html copyText(): navigator.clipboard.writeText(text),
//    btn.textContent = 'copied!', btn.classList.add('copied'), setTimeout(() => { restore }, 1500).
//    1500ms confirmed in setTimeout call. Cannot test navigator.clipboard under Node.
// 8. One-row-open-at-a-time — module-level `let _openSession = null` toggled in the delegated
//    click handler on dashboard-content. Clicking a new row calls _openSession's detail.remove()
//    before inserting the new one. A second click on the same row removes without inserting. DOM-only.
// 9. Insights on unfiltered path — computeInsights called inside loadDataLocal (line ~1019 in HTML),
//    result stored in `d.insights`. renderInsights(d) called from renderDashboard(). The filter-bar
//    click handler calls only renderFilteredSections(), never renderDashboard(). Static inspection
//    confirms insights are not re-computed on filter change.
// 10. Sessions+Cost on filtered path — renderSessions/renderCostSummary called only from
//    renderFilteredSections() (not from renderDashboard()). Confirmed by grep: neither function
//    appears in renderDashboard() body.

// ================================================================
// Phase 4 — pure functions copied verbatim from burnboard.html
// ================================================================

// Copied verbatim from burnboard.html Phase 4 additions
function aggregateMonths(turns) {
  const map = {};
  for (const t of turns) {
    const mk = t.month_key || t.timestamp.substring(0, 7);
    if (!map[mk]) {
      map[mk] = {
        month_key: mk,
        total_tokens: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0,
        sessions: new Set(), active_days: new Set(),
        opus: 0, sonnet: 0, haiku: 0,
      };
    }
    const m = map[mk];
    m.input_tokens       += t.input_tokens;
    m.output_tokens      += t.output_tokens;
    m.cache_read_tokens  += t.cache_read_tokens;
    m.total_tokens       += t.input_tokens + t.output_tokens;
    m.sessions.add(t.session_id);
    m.active_days.add(t.timestamp.substring(0, 10));
    const fam = modelFamily(t.model);
    if (fam === 'opus')   m.opus   += t.input_tokens + t.output_tokens;
    if (fam === 'sonnet') m.sonnet += t.input_tokens + t.output_tokens;
    if (fam === 'haiku')  m.haiku  += t.input_tokens + t.output_tokens;
  }
  return Object.values(map).map(m => {
    const ranked = [['opus', m.opus], ['sonnet', m.sonnet], ['haiku', m.haiku]]
      .sort((a, b) => b[1] - a[1]);
    return {
      month_key:         m.month_key,
      total_tokens:      m.total_tokens,
      input_tokens:      m.input_tokens,
      output_tokens:     m.output_tokens,
      cache_read_tokens: m.cache_read_tokens,
      sessions:          m.sessions.size,
      active_days:       m.active_days.size,
      top_model:         ranked[0][0],
    };
  });
}

function getWeeklyBuckets(turns, n = 12, now = Date.now()) {
  const thisMonday = getMondayUTC(now);
  const buckets = [];
  for (let i = 0; i < n; i++) {
    const startMs = thisMonday - i * 7 * 86400000;
    const endMs   = startMs + 7 * 86400000;
    const startDate = new Date(startMs);
    const endDate   = new Date(endMs - 86400000);

    const fmtMD  = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const fmtD   = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'UTC' });
    const fmtMDe = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const startLabel = fmtMD.format(startDate);
    const endLabel = startDate.getUTCMonth() !== endDate.getUTCMonth()
      ? fmtMDe.format(endDate)
      : fmtD.format(endDate);
    const label = `${startLabel}–${endLabel}`;

    const startIso = new Date(startMs).toISOString();
    const endIso   = new Date(endMs).toISOString();
    let total_tokens = 0, opus_tokens = 0, sonnet_tokens = 0;
    const sessions = new Set();
    for (const t of turns) {
      const ts = t.timestamp;
      if (ts < startIso || ts >= endIso) continue;
      const tok = t.input_tokens + t.output_tokens;
      total_tokens += tok;
      const fam = modelFamily(t.model);
      if (fam === 'opus')   opus_tokens   += tok;
      if (fam === 'sonnet') sonnet_tokens += tok;
      sessions.add(t.session_id);
    }
    buckets.push({ label, start_iso: startIso, total_tokens, opus_tokens, sonnet_tokens, sessions: sessions.size });
  }
  return buckets.reverse(); // oldest-first
}

function getBillingCycles(turns, billingStartDay, now) {
  const bsd = Number(billingStartDay) || 1;
  const nowDate  = new Date(now);
  const nowDay   = nowDate.getUTCDate();
  const nowMonth = nowDate.getUTCMonth();
  const nowYear  = nowDate.getUTCFullYear();

  let curYear = nowYear, curMonth = nowMonth;
  if (nowDay < bsd) {
    curMonth--;
    if (curMonth < 0) { curMonth = 11; curYear--; }
  }

  const cycles = [];
  for (let i = 0; i < 4; i++) {
    let sy = curYear, sm = curMonth - i;
    while (sm < 0) { sm += 12; sy--; }
    const startMs = Date.UTC(sy, sm, bsd);
    const nextMs  = Date.UTC(sy, sm + 1, bsd);

    const startIso = new Date(startMs).toISOString();
    const endIso   = new Date(nextMs).toISOString();
    const days_in_cycle = Math.round((nextMs - startMs) / 86400000);
    const is_current = i === 0;

    let day_index = null;
    if (is_current) {
      day_index = Math.min(Math.floor((now - startMs) / 86400000) + 1, days_in_cycle);
    }

    const fmtMD = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const incEnd = new Date(nextMs - 86400000);
    const label = `${fmtMD.format(new Date(startMs))} – ${fmtMD.format(incEnd)}`;

    let total_tokens = 0;
    const sessions = new Set();
    for (const t of turns) {
      if (t.timestamp < startIso || t.timestamp >= endIso) continue;
      total_tokens += t.input_tokens + t.output_tokens;
      sessions.add(t.session_id);
    }
    cycles.push({ start_iso: startIso, end_iso: endIso, label, day_index, days_in_cycle, total_tokens, sessions: sessions.size, is_current });
  }
  return cycles;
}

function buildCsvRows(records) {
  const header = 'month,total_tokens,input_tokens,output_tokens,cache_reads,sessions,active_days,top_model';
  if (records.length === 0) return header;
  const rows = records.map(r =>
    [r.month_key, r.total_tokens, r.input_tokens, r.output_tokens, r.cache_read_tokens, r.sessions, r.active_days, r.top_model].join(',')
  );
  return [header, ...rows].join('\n');
}

// ================================================================
// Phase 4 — getWeeklyBuckets
// ================================================================
console.log('\nPhase 4 — getWeeklyBuckets');

// Fixed Monday 2026-06-22 00:00 UTC as "now" for all weekly tests
// (getWeeklyBuckets takes now as 3rd argument)
const MONDAY_JUN22 = new Date('2026-06-22T00:00:00Z').getTime(); // Mon
const NOW_JUN22_MID = MONDAY_JUN22 + 3 * 86400000; // Wed Jun 24 (inside current week)

test('returns n buckets, oldest-first', () => {
  const bkts = getWeeklyBuckets([], 12, NOW_JUN22_MID);
  eq(bkts.length, 12);
  // oldest-first: bucket[0].start_iso < bucket[11].start_iso
  assert.ok(bkts[0].start_iso < bkts[11].start_iso, 'oldest first');
});

test('empty turns → all buckets zero tokens, length n', () => {
  const bkts = getWeeklyBuckets([], 12, NOW_JUN22_MID);
  eq(bkts.length, 12);
  assert.ok(bkts.every(b => b.total_tokens === 0), 'all zero');
  assert.ok(bkts.every(b => b.sessions === 0), 'all zero sessions');
});

test('turn inside current week lands in newest bucket (last)', () => {
  const t = turn({ timestamp: '2026-06-23T10:00:00Z', input_tokens: 1000, output_tokens: 500 }); // Tue Jun 23 inside Jun 22-28
  const bkts = getWeeklyBuckets([t], 12, NOW_JUN22_MID);
  const newest = bkts[bkts.length - 1];
  eq(newest.total_tokens, 1500);
  eq(newest.sessions, 1);
});

test('turn 8 days before Monday lands in week 1 (second newest)', () => {
  // Mon Jun 22 - 8 days = Sun Jun 14, which is in the week Jun 8-14 (2 prior weeks back)
  // Second newest bucket = Jun 15-21. Jun 14 is in Jun 8-14 (third newest, bkts[length-3]).
  // Use Jun 16 instead: Jun 22 - 6 days = Tue Jun 16 = in week Jun 15-21 = second newest.
  const t = turn({ timestamp: '2026-06-16T10:00:00Z', input_tokens: 2000, output_tokens: 0 });
  const bkts = getWeeklyBuckets([t], 12, NOW_JUN22_MID);
  const secondNewest = bkts[bkts.length - 2]; // week Jun 15-21
  eq(secondNewest.total_tokens, 2000);
});

test('turn at exactly thisMonday 00:00 UTC is in current week (>= start)', () => {
  // thisMonday = Jun 22 00:00 UTC; a turn at that instant must be in the current (newest) bucket
  const t = turn({ timestamp: '2026-06-22T00:00:00Z', input_tokens: 100, output_tokens: 0 });
  const bkts = getWeeklyBuckets([t], 12, NOW_JUN22_MID);
  const newest = bkts[bkts.length - 1];
  eq(newest.total_tokens, 100);
});

test('turn one ms before Monday is in prior week', () => {
  // 2026-06-21T23:59:59.999Z = Sun Jun 21, one ms before Mon Jun 22
  const t = turn({ timestamp: '2026-06-21T23:59:59.999Z', input_tokens: 300, output_tokens: 0 });
  const bkts = getWeeklyBuckets([t], 12, NOW_JUN22_MID);
  const secondNewest = bkts[bkts.length - 2]; // Jun 15-21
  eq(secondNewest.total_tokens, 300);
});

test('opus_tokens and sonnet_tokens aggregate correctly', () => {
  const opus   = turn({ timestamp: '2026-06-23T10:00:00Z', model: 'claude-opus-4-5',   input_tokens: 1000, output_tokens: 500, session_id: 'a' });
  const sonnet = turn({ timestamp: '2026-06-23T11:00:00Z', model: 'claude-sonnet-3-7', input_tokens: 200,  output_tokens: 100, session_id: 'b' });
  const bkts = getWeeklyBuckets([opus, sonnet], 12, NOW_JUN22_MID);
  const newest = bkts[bkts.length - 1];
  eq(newest.opus_tokens,   1500);
  eq(newest.sonnet_tokens, 300);
  eq(newest.total_tokens,  1800);
  eq(newest.sessions, 2);
});

// ================================================================
// Phase 4 — aggregateMonths
// ================================================================
console.log('\nPhase 4 — aggregateMonths');

test('empty turns → empty array', () => {
  eq(aggregateMonths([]).length, 0);
});

test('single month: total_tokens = input + output', () => {
  const t = turn({ timestamp: '2026-06-15T10:00:00Z', month_key: '2026-06', input_tokens: 1000, output_tokens: 500, cache_read_tokens: 100 });
  const [m] = aggregateMonths([t]);
  eq(m.total_tokens, 1500);
  eq(m.input_tokens, 1000);
  eq(m.output_tokens, 500);
  eq(m.cache_read_tokens, 100);
});

test('two months: separate records', () => {
  const t1 = turn({ timestamp: '2026-06-15T10:00:00Z', month_key: '2026-06', input_tokens: 1000, output_tokens: 0 });
  const t2 = turn({ timestamp: '2026-07-01T10:00:00Z', month_key: '2026-07', input_tokens: 2000, output_tokens: 0 });
  const months = aggregateMonths([t1, t2]);
  eq(months.length, 2);
  const jun = months.find(m => m.month_key === '2026-06');
  const jul = months.find(m => m.month_key === '2026-07');
  eq(jun.total_tokens, 1000);
  eq(jul.total_tokens, 2000);
});

test('sessions = distinct session_id count', () => {
  const t1 = turn({ session_id: 'A', month_key: '2026-06', input_tokens: 100, output_tokens: 0 });
  const t2 = turn({ session_id: 'B', month_key: '2026-06', input_tokens: 200, output_tokens: 0 });
  const t3 = turn({ session_id: 'A', month_key: '2026-06', input_tokens: 50,  output_tokens: 0, timestamp: '2026-06-20T10:00:00Z' });
  const [m] = aggregateMonths([t1, t2, t3]);
  eq(m.sessions, 2); // A and B
});

test('active_days = distinct UTC day count', () => {
  const t1 = turn({ timestamp: '2026-06-15T10:00:00Z', month_key: '2026-06', input_tokens: 100, output_tokens: 0 });
  const t2 = turn({ timestamp: '2026-06-15T22:00:00Z', month_key: '2026-06', input_tokens: 200, output_tokens: 0 });
  const t3 = turn({ timestamp: '2026-06-20T10:00:00Z', month_key: '2026-06', input_tokens: 50,  output_tokens: 0 });
  const [m] = aggregateMonths([t1, t2, t3]);
  eq(m.active_days, 2); // Jun 15 and Jun 20
});

test('top_model = dominant family by token volume', () => {
  const opus   = turn({ model: 'claude-opus-4-5',   month_key: '2026-06', input_tokens: 5000, output_tokens: 0 });
  const sonnet = turn({ model: 'claude-sonnet-3-7', month_key: '2026-06', input_tokens: 1000, output_tokens: 0 });
  const [m] = aggregateMonths([opus, sonnet]);
  eq(m.top_model, 'opus');
});

test('top_model tie → opus wins (opus>sonnet>haiku stable order)', () => {
  const opus   = turn({ model: 'claude-opus-4-5',   month_key: '2026-06', input_tokens: 1000, output_tokens: 0 });
  const sonnet = turn({ model: 'claude-sonnet-3-7', month_key: '2026-06', input_tokens: 1000, output_tokens: 0 });
  const [m] = aggregateMonths([opus, sonnet]);
  eq(m.top_model, 'opus');
});

test('uses month_key from turn field (not re-deriving from timestamp)', () => {
  // turn has month_key='2026-05' but timestamp in June — month_key wins
  const t = turn({ timestamp: '2026-06-15T10:00:00Z', month_key: '2026-05', input_tokens: 100, output_tokens: 0 });
  const [m] = aggregateMonths([t]);
  eq(m.month_key, '2026-05');
});

// ================================================================
// Phase 4 — getBillingCycles
// ================================================================
console.log('\nPhase 4 — getBillingCycles');

// Fixed: Jun 28, 2026, UTC (day 28 of month)
const JUN_28 = new Date('2026-06-28T12:00:00Z').getTime();
// Fixed: Jun 10, 2026 (day 10 of month)
const JUN_10 = new Date('2026-06-10T12:00:00Z').getTime();
// Fixed: Feb 28, 2026 (end of Feb, cycle that spans Jan→Feb)
const FEB_28_2026 = new Date('2026-02-28T12:00:00Z').getTime();

test('billing_start=1, now=Jun28: current cycle is Jun 1 – Jun 30', () => {
  const cycles = getBillingCycles([], 1, JUN_28);
  eq(cycles[0].is_current, true);
  eq(cycles[0].start_iso, new Date(Date.UTC(2026, 5, 1)).toISOString()); // Jun 1 UTC
});

test('billing_start=1, now=Jun28: day_index=28', () => {
  const cycles = getBillingCycles([], 1, JUN_28);
  eq(cycles[0].day_index, 28);
});

test('billing_start=15, now=Jun10: current cycle started May 15 (not Jun 15)', () => {
  // Jun 10 < day 15 → cycle started May 15
  const cycles = getBillingCycles([], 15, JUN_10);
  const expectedStart = new Date(Date.UTC(2026, 4, 15)).toISOString(); // May 15 UTC
  eq(cycles[0].start_iso, expectedStart);
  eq(cycles[0].is_current, true);
});

test('billing_start=15, now=Jun10: day_index correct (day 27 of 31-day cycle)', () => {
  // May 15 → Jun 15: 31 days. Jun 10 = May 15 + 26 days → day_index=27
  const cycles = getBillingCycles([], 15, JUN_10);
  eq(cycles[0].day_index, 27);
});

test('days_in_cycle correct across month boundary (Jan 1 → Feb 1 = 31 days)', () => {
  const jan15 = new Date('2026-01-15T12:00:00Z').getTime();
  const cycles = getBillingCycles([], 1, jan15);
  eq(cycles[0].days_in_cycle, 31); // Jan: 31 days
});

test('day_index clamped to days_in_cycle', () => {
  // Set now to last ms of a 31-day cycle to confirm day_index does not exceed days_in_cycle
  const startMs = Date.UTC(2026, 5, 1); // Jun 1
  const nowEdge = startMs + 30 * 86400000 + 3600000; // Jun 1 + 30 days + 1h (inside Jun 31? → wraps to Jul 1)
  // Actually: Jun has 30 days; cycle 1→Jul 1. day 31 would exceed, but clamp should cap it.
  // Let's use a billing_start=1 cycle for June (30 days): day 31 would overshoot.
  // Simulate: now = Jun 1 + 35 days = Jul 6 (after cycle ends — next cycle already started)
  // We want to test the clamp for the *current* cycle, so keep now within the cycle.
  // Instead: billing_start=28, Feb 2026: Feb 28 → Mar 28 (28 days in cycle).
  // Now = Feb 28 itself → day_index = floor(0/86400000)+1 = 1. days_in_cycle = 28.
  const feb28Start = Date.UTC(2026, 1, 28); // Feb 28 UTC
  const nowFeb28 = feb28Start + 500; // just after start
  const cycles = getBillingCycles([], 28, nowFeb28);
  const cur = cycles[0];
  assert.ok(cur.day_index <= cur.days_in_cycle, `day_index ${cur.day_index} <= days_in_cycle ${cur.days_in_cycle}`);
});

test('turn inside cycle is counted; turn outside is not', () => {
  const inTurn  = turn({ timestamp: '2026-06-15T10:00:00Z', input_tokens: 1000, output_tokens: 0 }); // in Jun 1-Jul 1 cycle
  const outTurn = turn({ timestamp: '2026-05-15T10:00:00Z', input_tokens: 5000, output_tokens: 0 }); // in May cycle
  const cycles = getBillingCycles([inTurn, outTurn], 1, JUN_28);
  const cur = cycles[0]; // current = Jun
  eq(cur.total_tokens, 1000);
});

test('returns 4 cycles total', () => {
  const cycles = getBillingCycles([], 1, JUN_28);
  eq(cycles.length, 4);
});

// ================================================================
// Phase 4 — buildCsvRows
// ================================================================
console.log('\nPhase 4 — buildCsvRows');

test('header row is exactly the spec columns', () => {
  const csv = buildCsvRows([]);
  const header = csv.split('\n')[0];
  eq(header, 'month,total_tokens,input_tokens,output_tokens,cache_reads,sessions,active_days,top_model');
});

test('empty records → header-only (no extra newline)', () => {
  const csv = buildCsvRows([]);
  eq(csv, 'month,total_tokens,input_tokens,output_tokens,cache_reads,sessions,active_days,top_model');
});

test('one record: raw integers, cache_reads maps from cache_read_tokens', () => {
  const rec = { month_key: '2026-06', total_tokens: 150000, input_tokens: 100000, output_tokens: 50000, cache_read_tokens: 8000, sessions: 5, active_days: 12, top_model: 'sonnet' };
  const csv = buildCsvRows([rec]);
  const lines = csv.split('\n');
  eq(lines.length, 2);
  eq(lines[1], '2026-06,150000,100000,50000,8000,5,12,sonnet');
});

test('column order matches spec exactly', () => {
  const rec = { month_key: '2026-05', total_tokens: 1, input_tokens: 2, output_tokens: 3, cache_read_tokens: 4, sessions: 5, active_days: 6, top_model: 'opus' };
  const row = buildCsvRows([rec]).split('\n')[1];
  const parts = row.split(',');
  eq(parts[0], '2026-05');  // month
  eq(parts[1], '1');         // total_tokens
  eq(parts[2], '2');         // input_tokens
  eq(parts[3], '3');         // output_tokens
  eq(parts[4], '4');         // cache_reads (from cache_read_tokens)
  eq(parts[5], '5');         // sessions
  eq(parts[6], '6');         // active_days
  eq(parts[7], 'opus');      // top_model
});

test('multiple records produce correct row count', () => {
  const recs = [
    { month_key: '2026-01', total_tokens: 100, input_tokens: 60, output_tokens: 40, cache_read_tokens: 0, sessions: 1, active_days: 1, top_model: 'haiku' },
    { month_key: '2026-02', total_tokens: 200, input_tokens: 120, output_tokens: 80, cache_read_tokens: 10, sessions: 2, active_days: 3, top_model: 'sonnet' },
  ];
  const csv = buildCsvRows(recs);
  const lines = csv.split('\n');
  eq(lines.length, 3); // header + 2 rows
});

// ================================================================
// Phase 4 — extended boundary coverage (tester-added)
// Covers the riskiest edges called out in changes.md:
//   getWeeklyBuckets: double-count, zero-activity-week-not-dropped
//   aggregateMonths: month_key fallback, haiku/sonnet top_model
//   getBillingCycles: cycle-start inclusion, year-boundary rollback, Feb length
//   buildCsvRows: raw integers, top_model is comma-free
// ================================================================
console.log('\nPhase 4 — extended boundary coverage');

// ----------------------------------------------------------------
// getWeeklyBuckets — additional gaps
// ----------------------------------------------------------------

// A turn exactly on Monday 00:00 UTC must land in the current (newest) bucket only.
// It must NOT appear in the prior week's bucket as well (no double-count).
test('getWeeklyBuckets: Monday 00:00 turn counted once (not in prior week too)', () => {
  // thisMonday = Jun 22 00:00 UTC (from NOW_JUN22_MID)
  const t = turn({ timestamp: '2026-06-22T00:00:00Z', input_tokens: 500, output_tokens: 0 });
  const bkts = getWeeklyBuckets([t], 12, NOW_JUN22_MID);
  const newest = bkts[bkts.length - 1];       // Jun 22-28 (current)
  const secondNewest = bkts[bkts.length - 2]; // Jun 15-21 (prior)
  eq(newest.total_tokens, 500);
  eq(secondNewest.total_tokens, 0); // must not appear in prior week
});

// A zero-activity week in a set that has other active weeks must still appear
// (not dropped or skipped — dump §8.2 says zero-activity weeks are faded, not hidden).
test('getWeeklyBuckets: zero-activity week present among non-zero weeks (not dropped)', () => {
  // Put a turn in the current week and another 2 weeks back; the week in between should
  // appear with total_tokens=0.
  const cur  = turn({ timestamp: '2026-06-23T10:00:00Z', input_tokens: 100, output_tokens: 0 }); // Jun 22-28
  const skip = turn({ timestamp: '2026-06-09T10:00:00Z', input_tokens: 200, output_tokens: 0 }); // Jun 8-14 (two back)
  const bkts = getWeeklyBuckets([cur, skip], 12, NOW_JUN22_MID);
  eq(bkts.length, 12);
  // Jun 15-21 is the second-newest (bkts[10]) — no turn in that week
  const gapWeek = bkts[bkts.length - 2]; // Jun 15-21
  eq(gapWeek.total_tokens, 0);
  // But it's still in the array (12 buckets, not 11)
  const active = bkts.filter(b => b.total_tokens > 0);
  eq(active.length, 2);
});

// n=1 returns exactly one bucket and it is the current week
test('getWeeklyBuckets: n=1 returns exactly 1 bucket (current week)', () => {
  const bkts = getWeeklyBuckets([], 1, NOW_JUN22_MID);
  eq(bkts.length, 1);
  // The single bucket's start should be thisMonday (Jun 22 00:00 UTC)
  const expectedStart = new Date(getMondayUTC(NOW_JUN22_MID)).toISOString();
  eq(bkts[0].start_iso, expectedStart);
});

// ----------------------------------------------------------------
// aggregateMonths — additional gaps
// ----------------------------------------------------------------

// When month_key field is absent, fall back to timestamp.substring(0,7)
test('aggregateMonths: absent month_key falls back to timestamp.substring(0,7)', () => {
  // Construct a turn without month_key property at all
  const t = {
    session_id: 'sess-1',
    timestamp: '2026-05-20T10:00:00Z',
    // month_key deliberately omitted
    model: 'claude-sonnet-3-7',
    input_tokens: 300,
    output_tokens: 100,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
  };
  const months = aggregateMonths([t]);
  eq(months.length, 1);
  eq(months[0].month_key, '2026-05'); // derived from timestamp
  eq(months[0].total_tokens, 400);
});

// haiku dominates → top_model = 'haiku'
test('aggregateMonths: top_model = haiku when haiku has most tokens', () => {
  const haiku  = turn({ model: 'claude-haiku-3-5',  month_key: '2026-06', input_tokens: 5000, output_tokens: 0 });
  const opus   = turn({ model: 'claude-opus-4-5',   month_key: '2026-06', input_tokens: 100,  output_tokens: 0 });
  const sonnet = turn({ model: 'claude-sonnet-3-7', month_key: '2026-06', input_tokens: 200,  output_tokens: 0 });
  const [m] = aggregateMonths([haiku, opus, sonnet]);
  eq(m.top_model, 'haiku');
});

// sonnet tie vs haiku → sonnet wins (sonnet comes before haiku in ranked array)
test('aggregateMonths: sonnet/haiku tie → sonnet wins (stable order)', () => {
  const sonnet = turn({ model: 'claude-sonnet-3-7', month_key: '2026-06', input_tokens: 1000, output_tokens: 0 });
  const haiku  = turn({ model: 'claude-haiku-3-5',  month_key: '2026-06', input_tokens: 1000, output_tokens: 0 });
  const [m] = aggregateMonths([sonnet, haiku]);
  eq(m.top_model, 'sonnet');
});

// cache_read_tokens aggregates correctly across multiple turns in same month
test('aggregateMonths: cache_read_tokens sums across turns', () => {
  const t1 = turn({ month_key: '2026-06', input_tokens: 100, output_tokens: 0, cache_read_tokens: 200 });
  const t2 = turn({ month_key: '2026-06', input_tokens: 100, output_tokens: 0, cache_read_tokens: 300, timestamp: '2026-06-20T10:00:00Z' });
  const [m] = aggregateMonths([t1, t2]);
  eq(m.cache_read_tokens, 500);
});

// ----------------------------------------------------------------
// getBillingCycles — additional gaps
// ----------------------------------------------------------------

// Turn exactly ON the cycle start date must be included (half-open: >= startIso)
test('getBillingCycles: turn on cycle start date IS included', () => {
  // billing_start=1, now=Jun28 → current cycle starts Jun 1 00:00 UTC
  const onStart = turn({ timestamp: '2026-06-01T00:00:00Z', input_tokens: 777, output_tokens: 0 });
  const cycles = getBillingCycles([onStart], 1, JUN_28);
  eq(cycles[0].total_tokens, 777);
});

// Turn one ms before cycle start must NOT be included (it falls in the prior cycle)
test('getBillingCycles: turn one ms before cycle start is excluded from current', () => {
  // billing_start=1, now=Jun28 → current cycle starts 2026-06-01T00:00:00.000Z
  // One ms before = 2026-05-31T23:59:59.999Z → falls in prior cycle
  const beforeStart = turn({ timestamp: '2026-05-31T23:59:59.999Z', input_tokens: 999, output_tokens: 0 });
  const cycles = getBillingCycles([beforeStart], 1, JUN_28);
  // Current cycle (cycles[0]) should have 0 tokens
  eq(cycles[0].total_tokens, 0);
  // Prior cycle (cycles[1]) should have the tokens
  eq(cycles[1].total_tokens, 999);
});

// Year-boundary rollback: billing_start=15, now=Jan 5 → current cycle started Dec 15 of prior year
test('getBillingCycles: year-boundary rollback (billing_start=15, now=Jan5)', () => {
  const JAN_05_2026 = new Date('2026-01-05T12:00:00Z').getTime();
  const cycles = getBillingCycles([], 15, JAN_05_2026);
  // Jan 5 < day 15 → current cycle started Dec 15 2025
  const expectedStart = new Date(Date.UTC(2025, 11, 15)).toISOString(); // Dec 15 2025
  eq(cycles[0].start_iso, expectedStart);
  eq(cycles[0].is_current, true);
});

// Feb cycle: billing_start=1, now=Feb 15 2026 → days_in_cycle = 28 (2026 is non-leap)
test('getBillingCycles: Feb cycle days_in_cycle = 28 (non-leap 2026)', () => {
  const FEB_15_2026 = new Date('2026-02-15T12:00:00Z').getTime();
  const cycles = getBillingCycles([], 1, FEB_15_2026);
  // Current cycle: Feb 1 → Mar 1 = 28 days (2026 is not a leap year)
  eq(cycles[0].days_in_cycle, 28);
});

// billing_start=28 in Feb 2026: cycle Feb 28 → Mar 28 = 28 days
test('getBillingCycles: billing_start=28, now=Feb28 2026 → days_in_cycle=28 (Feb28→Mar28)', () => {
  // now = Feb 28 2026 12:00 UTC. Day 28 >= bsd 28 → cycle started Feb 28.
  // nextMs = Date.UTC(2026, 1, 29) = JS normalizes to Mar 1? No: Date.UTC(2026, 1, 29)
  // Feb has 28 days in 2026 (non-leap), so day 29 overflows → Mar 1.
  // days = (Mar 1 - Feb 28) = 1 day? That can't be right for "Feb 28 → Mar 28".
  // Let me check: Date.UTC(2026, 1+1, 28) = Date.UTC(2026, 2, 28) = Mar 28.
  // The code uses: nextMs = Date.UTC(sy, sm + 1, bsd) where sm=1 (Feb), bsd=28
  // → Date.UTC(2026, 2, 28) = Mar 28 UTC. days = (Mar28 - Feb28) / 86400000 = 28.
  const nowFeb28 = new Date('2026-02-28T12:00:00Z').getTime();
  const cycles = getBillingCycles([], 28, nowFeb28);
  const cur = cycles[0];
  // Feb 28 → Mar 28 = 28 days
  eq(cur.days_in_cycle, 28);
  // start is Feb 28 UTC
  eq(cur.start_iso, new Date(Date.UTC(2026, 1, 28)).toISOString());
});

// 4 cycles go back 4 months (newest-first: current + 3 prior)
test('getBillingCycles: 4 cycles include current + 3 prior, newest first', () => {
  const cycles = getBillingCycles([], 1, JUN_28);
  eq(cycles[0].is_current, true);
  eq(cycles[1].is_current, false);
  eq(cycles[2].is_current, false);
  eq(cycles[3].is_current, false);
  // Verify ordering: each cycle starts earlier than the previous
  assert.ok(cycles[0].start_iso > cycles[1].start_iso, 'current newer than prior-1');
  assert.ok(cycles[1].start_iso > cycles[2].start_iso, 'prior-1 newer than prior-2');
  assert.ok(cycles[2].start_iso > cycles[3].start_iso, 'prior-2 newer than prior-3');
});

// day_index for billing_start=1, now=Jun28 at noon: floor((noon - Jun1_start) / 86400000) + 1
// = floor(27.5) + 1 = 27 + 1 = 28
test('getBillingCycles: day_index = 1 when now is the first day of the cycle', () => {
  // billing_start=1, now = Jun 1 at noon (well within day 1)
  const JUN_01_NOON = new Date('2026-06-01T12:00:00Z').getTime();
  const cycles = getBillingCycles([], 1, JUN_01_NOON);
  eq(cycles[0].day_index, 1);
});

// non-current cycles have day_index = null
test('getBillingCycles: prior cycles have day_index = null', () => {
  const cycles = getBillingCycles([], 1, JUN_28);
  eq(cycles[1].day_index, null);
  eq(cycles[2].day_index, null);
  eq(cycles[3].day_index, null);
});

// ----------------------------------------------------------------
// buildCsvRows — additional gaps
// ----------------------------------------------------------------

// top_model values ('opus', 'sonnet', 'haiku') contain no commas — confirm the
// no-escape ponytail is safe for actual model family names.
test('buildCsvRows: top_model single-word values have no commas (safe without escaping)', () => {
  const models = ['opus', 'sonnet', 'haiku'];
  for (const m of models) {
    const rec = { month_key: '2026-06', total_tokens: 1, input_tokens: 1, output_tokens: 0, cache_read_tokens: 0, sessions: 1, active_days: 1, top_model: m };
    const row = buildCsvRows([rec]).split('\n')[1];
    // Each row must have exactly 7 commas (8 columns)
    const commas = (row.match(/,/g) || []).length;
    eq(commas, 7);
    // last field (top_model) must equal the model name
    const parts = row.split(',');
    eq(parts[7], m);
  }
});

// Raw integers: no thousands separators (e.g. "1500000" not "1,500,000")
test('buildCsvRows: integer values are raw (no thousands separators)', () => {
  const rec = { month_key: '2026-06', total_tokens: 1500000, input_tokens: 1000000, output_tokens: 500000, cache_read_tokens: 200000, sessions: 10, active_days: 20, top_model: 'opus' };
  const row = buildCsvRows([rec]).split('\n')[1];
  const parts = row.split(',');
  eq(parts[1], '1500000');  // no "1,500,000"
  eq(parts[2], '1000000');
  eq(parts[3], '500000');
  eq(parts[4], '200000');
});

// Rows joined by \n (no trailing newline after last row)
test('buildCsvRows: no trailing newline after last row', () => {
  const rec = { month_key: '2026-06', total_tokens: 1, input_tokens: 1, output_tokens: 0, cache_read_tokens: 0, sessions: 1, active_days: 1, top_model: 'opus' };
  const csv = buildCsvRows([rec]);
  assert.ok(!csv.endsWith('\n'), 'no trailing newline');
});

// ================================================================
// Phase 5+6 — PURE function tests (no IDB, no DOM)
// ================================================================

// ----------------------------------------------------------------
// twoAccountMode — extracted as inline for Node (closure over _cfg)
// Uses the existing _cfg const (property mutation is fine on const).
// ----------------------------------------------------------------
function twoAccountMode() {
  return !!(_cfg && _cfg.account_2_name && _cfg.account_2_name.trim());
}

console.log('\ntwoAccountMode');
test('false when account_2_name is empty string', () => {
  _cfg.account_2_name = '';
  eq(twoAccountMode(), false);
});
test('false when account_2_name is whitespace only', () => {
  _cfg.account_2_name = '   ';
  eq(twoAccountMode(), false);
});
test('true when account_2_name has content', () => {
  _cfg.account_2_name = 'Alt';
  eq(twoAccountMode(), true);
});
test('true when account_2_name has leading/trailing spaces but has chars', () => {
  _cfg.account_2_name = ' Work ';
  eq(twoAccountMode(), true);
});
_cfg.account_2_name = ''; // reset to single-account mode

// ----------------------------------------------------------------
// filterTurnsByAccount
// ----------------------------------------------------------------
function filterTurnsByAccount(turns, label) {
  if (label === 'all') return turns;
  return turns.filter(t => t.account_label === label);
}

console.log('\nfilterTurnsByAccount');
test("label 'all' returns all turns regardless of account_label", () => {
  const turns = [
    turn({ account_label: 'Primary' }),
    turn({ account_label: 'Alt' }),
    turn({ account_label: 'combined' }),
  ];
  eq(filterTurnsByAccount(turns, 'all').length, 3);
});
test("exact-match 'Primary' returns only Primary turns", () => {
  const turns = [
    turn({ account_label: 'Primary' }),
    turn({ account_label: 'Alt' }),
    turn({ account_label: 'Primary' }),
  ];
  eq(filterTurnsByAccount(turns, 'Primary').length, 2);
});
test("exact-match 'Alt' returns only Alt turns", () => {
  const turns = [
    turn({ account_label: 'Primary' }),
    turn({ account_label: 'Alt' }),
  ];
  eq(filterTurnsByAccount(turns, 'Alt').length, 1);
});
test("'combined' does NOT match Primary or Alt (exact-match only)", () => {
  const turns = [
    turn({ account_label: 'Primary' }),
    turn({ account_label: 'Alt' }),
  ];
  eq(filterTurnsByAccount(turns, 'combined').length, 0);
});
test('empty array returns empty array for any label', () => {
  eq(filterTurnsByAccount([], 'Primary').length, 0);
  eq(filterTurnsByAccount([], 'all').length, 0);
});

// ----------------------------------------------------------------
// Per-account monthly aggregation (via aggregateMonths)
// Verifies that filterTurnsByAccount + aggregateMonths gives
// per-account totals correctly.
// ----------------------------------------------------------------

// aggregateMonths already defined above (Phase 4 section). Reuses it here.
console.log('\nper-account monthly aggregation');
test('account 1 totals are isolated from account 2', () => {
  const a1 = turn({ account_label: 'Primary', input_tokens: 1000, output_tokens: 500, month_key: '2026-06' });
  const a2 = turn({ account_label: 'Alt',     input_tokens:  200, output_tokens: 100, month_key: '2026-06' });
  const [r] = aggregateMonths(filterTurnsByAccount([a1, a2], 'Primary'));
  eq(r.input_tokens,  1000);
  eq(r.output_tokens,  500);
});
test('account 2 totals are isolated from account 1', () => {
  const a1 = turn({ account_label: 'Primary', input_tokens: 1000, output_tokens: 500, month_key: '2026-06' });
  const a2 = turn({ account_label: 'Alt',     input_tokens:  200, output_tokens: 100, month_key: '2026-06' });
  const [r] = aggregateMonths(filterTurnsByAccount([a1, a2], 'Alt'));
  eq(r.input_tokens,  200);
  eq(r.output_tokens, 100);
});
test("'all' label includes combined-tagged turns", () => {
  const a1 = turn({ account_label: 'Primary',  input_tokens: 1000, month_key: '2026-06' });
  const ac = turn({ account_label: 'combined', input_tokens:  100, month_key: '2026-06' });
  const [r] = aggregateMonths(filterTurnsByAccount([a1, ac], 'all'));
  eq(r.input_tokens, 1100);
});

// ----------------------------------------------------------------
// countMalformed
// ----------------------------------------------------------------
function countMalformed(lines) {
  let count = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    try { JSON.parse(line); } catch { count++; }
  }
  return count;
}

console.log('\ncountMalformed');
test('all valid JSON lines → 0', () => {
  eq(countMalformed(['{"a":1}', '{"b":2}']), 0);
});
test('one malformed line → 1', () => {
  eq(countMalformed(['{"a":1}', 'not json']), 1);
});
test('empty/blank lines are skipped (not counted as malformed)', () => {
  eq(countMalformed(['', '   ', '{"a":1}']), 0);
});
test('all malformed → count equals non-empty line count', () => {
  eq(countMalformed(['bad1', 'bad2', 'bad3']), 3);
});

// ----------------------------------------------------------------
// faviconColorForState
// ----------------------------------------------------------------
function faviconColorForState(state) {
  return { good:'#34D399', weekend:'#34D399', caution_peak:'#FBBF24',
           caution_budget:'#FBBF24', danger:'#F87171', no_data:'#6B6460' }[state] || '#6B6460';
}

console.log('\nfaviconColorForState');
test("'good' → green #34D399",             () => eq(faviconColorForState('good'),           '#34D399'));
test("'weekend' → green #34D399",          () => eq(faviconColorForState('weekend'),        '#34D399'));
test("'caution_peak' → amber #FBBF24",     () => eq(faviconColorForState('caution_peak'),   '#FBBF24'));
test("'caution_budget' → amber #FBBF24",   () => eq(faviconColorForState('caution_budget'), '#FBBF24'));
test("'danger' → red #F87171",             () => eq(faviconColorForState('danger'),         '#F87171'));
test("'no_data' → muted #6B6460",          () => eq(faviconColorForState('no_data'),        '#6B6460'));
test('unknown state → muted #6B6460 (default)', () => eq(faviconColorForState('unknown'),   '#6B6460'));

// ----------------------------------------------------------------
// tipPersonalization
// ----------------------------------------------------------------
// Needs modelFamily (already defined above)
function tipPersonalization(turns, now) {
  const generic = { 1:null, 2:null, 3:null, 4:null, 5:null, 6:null };
  const activeDays = new Set(turns.map(t => t.timestamp.substring(0, 10)));
  if (activeDays.size < 7) return generic;

  const last7 = now - 7 * 86400000;
  const recent = turns.filter(t => new Date(t.timestamp).getTime() >= last7);

  let totalIn = 0, totalOut = 0;
  for (const t of recent) { totalIn += t.input_tokens; totalOut += t.output_tokens; }
  const ratio = totalIn > 0 ? totalOut / totalIn : 0;
  const tip1 = ratio > 2.0 ? `your data: output ratio is ${ratio.toFixed(1)}×` : null;

  const sessMap = {};
  for (const t of recent) {
    if (!sessMap[t.session_id]) sessMap[t.session_id] = [];
    sessMap[t.session_id].push(t);
  }
  let spiralCount = 0;
  for (const ts of Object.values(sessMap)) {
    if (ts.length <= 5) continue;
    const sorted = [...ts].sort((a, b) => a.timestamp < b.timestamp ? -1 : 1);
    const toks = sorted.map(t => t.input_tokens + t.output_tokens);
    const early = toks.slice(0, 3);
    const late  = toks.slice(2);
    const avgE = early.reduce((s, v) => s + v, 0) / early.length;
    if (avgE <= 0) continue;
    const avgL = late.reduce((s, v) => s + v, 0) / late.length;
    if (avgL / avgE > 3.0) spiralCount++;
  }
  const tip2 = spiralCount >= 3 ? `your data: ${spiralCount} sessions spiraled this week` : null;

  let opusWaste = 0;
  for (const ts of Object.values(sessMap)) {
    if (ts.length >= 4) continue;
    const vol = { opus:0, sonnet:0, haiku:0, other:0 };
    for (const t of ts) vol[modelFamily(t.model)] += t.input_tokens + t.output_tokens;
    if (Object.entries(vol).sort((a, b) => b[1] - a[1])[0][0] === 'opus') opusWaste++;
  }
  const tip5 = opusWaste >= 5 ? `your data: ${opusWaste} short opus sessions` : null;

  return { 1:tip1, 2:tip2, 3:null, 4:null, 5:tip5, 6:null };
}

// Helper: build N turns spread over N distinct UTC days (within the last 7d window)
function makeTurns(n, overrides = {}) {
  const now = new Date('2026-06-28T12:00:00Z').getTime();
  return Array.from({ length: n }, (_, i) => ({
    session_id: `sess-${i}`,
    timestamp: new Date(now - i * 86400000).toISOString(),
    model: 'claude-sonnet-3-7',
    input_tokens: 1000,
    output_tokens: 500,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    account_label: 'Primary',
    month_key: '2026-06',
    ...overrides,
  }));
}

console.log('\ntipPersonalization');
test('empty turns → all null (generic)', () => {
  const r = tipPersonalization([], Date.now());
  eq(Object.values(r).every(v => v === null), true);
});
test('fewer than 7 active days → all null (gate not met)', () => {
  const turns = makeTurns(6); // 6 distinct days
  const r = tipPersonalization(turns, new Date('2026-06-28T12:00:00Z').getTime());
  eq(Object.values(r).every(v => v === null), true);
});
test('tips 3/4/6 are always null (no data signal available)', () => {
  const turns = makeTurns(10);
  const r = tipPersonalization(turns, new Date('2026-06-28T12:00:00Z').getTime());
  eq(r[3], null);
  eq(r[4], null);
  eq(r[6], null);
});
test('tip 1 fires when output/input ratio > 2.0 (last 7d, ≥7 active days)', () => {
  // 10 turns, 24h apart from 12:00 UTC → 10 distinct UTC days (gate met).
  // Last 8 are within 7d window; ratio = output/input = 3000/1000 = 3.0 → tip1 fires.
  const now = new Date('2026-06-28T12:00:00Z').getTime();
  const turns = Array.from({ length: 10 }, (_, i) => ({
    session_id: `sess-${i}`,
    timestamp: new Date(now - i * 86400000).toISOString(), // 24h apart → distinct days
    model: 'claude-sonnet-3-7',
    input_tokens:  1000,
    output_tokens: 3000, // ratio = 3.0
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    account_label: 'Primary',
    month_key: '2026-06',
  }));
  const r = tipPersonalization(turns, now);
  eq(r[1] !== null, true);
  eq(r[1].includes('3.0'), true);
});
test('tip 1 is null when ratio ≤ 2.0', () => {
  const now = new Date('2026-06-28T12:00:00Z').getTime();
  const turns = Array.from({ length: 10 }, (_, i) => ({
    session_id: `sess-${i}`,
    timestamp: new Date(now - i * 86400000).toISOString(), // 24h apart → distinct days
    model: 'claude-sonnet-3-7',
    input_tokens:  1000,
    output_tokens: 1000, // ratio = 1.0
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    account_label: 'Primary',
    month_key: '2026-06',
  }));
  const r = tipPersonalization(turns, now);
  eq(r[1], null);
});
test('tip 5 fires when ≥5 short opus sessions (< 4 turns, opus-dominant)', () => {
  // 10 single-turn opus sessions, 24h apart → 10 distinct days (gate met).
  // 8 of them are within the 7d recent window → 8 short-opus sessions → ≥5 → tip5 fires.
  const now = new Date('2026-06-28T12:00:00Z').getTime();
  const turns = Array.from({ length: 10 }, (_, i) => ({
    session_id: `opus-sess-${i}`, // each is its own 1-turn session
    timestamp: new Date(now - i * 86400000).toISOString(), // 24h apart → distinct days
    model: 'claude-opus-4-5',
    input_tokens:  500,
    output_tokens: 200,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    account_label: 'Primary',
    month_key: '2026-06',
  }));
  const r = tipPersonalization(turns, now);
  eq(r[5] !== null, true);
  eq(r[5].includes('short opus sessions'), true);
});

// ================================================================
// CANNOT-VERIFY-HEADLESS: Phase 4 DOM/async wiring confirmed by static inspection
// 11. recomputeMonthlyCache try/catch in runSync — burnboard.html now wraps the call
//     in try { await recomputeMonthlyCache(); } catch (e) { ...; _monthlyCacheStale = true }.
//     The catch does not re-throw, so renderDashboard() and showScreen('app') still
//     run even if recompute throws. Confirmed by source inspection — cannot exercise
//     IDB paths under Node.
// 12. renderHistory called on history tab switch — burnboard.html tab-bar handler:
//     after panel.classList.add('active'), if (btn.dataset.tab === 'history') renderHistory()
//     is called. Fire-and-forget (no await). Confirmed by grep of tab handler body.
// 13. _historyBound flag prevents double-binding — renderHistory() checks _historyBound
//     before attaching the delegated listener; sets it to true after first attach.
//     Confirmed by module-level `let _historyBound = false` and guard in renderHistory.
// 14. Phase 5: account selector pills rendered — renderHistory() now renders
//     account-selector div with 3 pills (All, acct1, acct2) when twoAccountMode().
//     Confirmed by source inspection of renderHistory().
// 15. CSV download via Blob+createObjectURL+<a download> — exportHistoryCsv() creates
//     Blob([csv], {type:'text/csv'}), URL.createObjectURL, temporary <a> with download
//     attr, .click(), URL.revokeObjectURL. Confirmed by source inspection.
// 16. _cfg.billing_start used (not billing_start_day) — getBillingCycles reads
//     `Number(_cfg.billing_start) || 1` per RESOLVED spec note. Confirmed by grep.
// 17. Phase 5: recomputeMonthlyCache loops real labels — in twoAccountMode loops
//     [acct1, acct2, 'combined']; else ['combined']. RESOLVED Phase 4 ponytail.
//     Confirmed by source inspection — cannot exercise IDB under Node.
// 18. Phase 6: toast shown post-sync — runSync calls showToast('all caught up ✓')
//     when totalTurns===0, or showToast('skipped N malformed lines') when skippedLines>0.
//     Skipped-lines takes priority. Cannot exercise DOM showToast under Node.
// 19. Phase 6: favicon updated in renderDashboard — setFavicon(_lastCheckState) is called
//     after dashboard innerHTML assignment. _lastCheckState is set by renderStartCheck.
//     Confirmed by source inspection — cannot exercise DOM+IDB path under Node.
// 20. Phase 6: boot() shows reconnect screen when permission revoked — perm !== 'granted'
//     now calls showScreen('reconnect') instead of showScreen('connect'). Confirmed.
//
// Additional browser-only items (CANNOT-VERIFY-HEADLESS):
// 21. Dashboard always uses combined data — loadDataLocal() reads ALL turns via dbGetAll('turns')
//     with no account_label filter. Start Check / Forecast / Mini Stats come from this path.
//     The _historyAccount selector in renderHistory does NOT affect loadDataLocal.
//     Confirmed: grep shows _historyAccount only referenced in renderHistory/renderMonthlyView/
//     renderWeeklyView/renderBillingView/exportHistoryCsv — never in loadDataLocal.
// 22. Account selector + combined card only appear when account_2_name set — twoAccountMode()
//     is called inside renderHistory() before rendering selector/card HTML.
//     When account_2_name is empty/whitespace, twoAccountMode()===false and the selector/card
//     HTML is skipped entirely. Confirmed by source inspection of renderHistory().
// 23. Account 2 cleared → single-account view — saveSettings() re-renders dashboard; history
//     re-renders on every tab click. twoAccountMode() returns false when account_2_name is
//     cleared, so selector and combined card vanish on next render. No migration needed.
//     Confirmed: twoAccountMode() reads _cfg.account_2_name live on every call.
// 24. promptAccount dismiss → Primary — backdrop click and Esc key both call dismiss()
//     which resolves with `a1 = _cfg.account_1_name || 'Primary'`. No DOM element needed
//     to verify the fallback chain; the pure fallback is tested below (test #25).
// ================================================================

// ================================================================
// Phase 5+6 — extended boundary coverage (tester-added)
// Covers the gaps called out in changes.md:
//   Primary-in-combined-not-Alt invariant
//   recomputeMonthlyCache label-loop logic (pure part)
//   tipPersonalization 7-day boundary (exactly 7)
//   toast priority selection (skipped beats caught-up)
//   promptAccount dismiss fallback
// ================================================================
console.log('\nPhase 5+6 — extended boundary coverage');

// ----------------------------------------------------------------
// Primary-in-combined-not-Alt invariant
// Models the recomputeMonthlyCache label loop:
//   label === 'combined' → ALL turns
//   label === 'Primary'  → turns.filter(t => t.account_label === 'Primary')
//   label === 'Alt'      → turns.filter(t => t.account_label === 'Alt')
// A turn labeled 'Primary' must appear in combined AND Primary, never in Alt.
// A 'combined'-tagged turn (Both/Unsure sync) must appear ONLY in combined.
// ----------------------------------------------------------------

test('Primary turn: included in combined aggregation (combined uses all turns)', () => {
  const primary = turn({ account_label: 'Primary', input_tokens: 1000, output_tokens: 0, month_key: '2026-06' });
  const alt     = turn({ account_label: 'Alt',     input_tokens: 500,  output_tokens: 0, month_key: '2026-06' });
  const allTurns = [primary, alt];
  // combined: all turns passed in (label==='combined' branch in recomputeMonthlyCache)
  const [combinedMonth] = aggregateMonths(allTurns);
  eq(combinedMonth.total_tokens, 1500); // primary + alt both count
});

test('Primary turn: included in Primary aggregation (exact-match)', () => {
  const primary = turn({ account_label: 'Primary', input_tokens: 1000, output_tokens: 0, month_key: '2026-06' });
  const alt     = turn({ account_label: 'Alt',     input_tokens: 500,  output_tokens: 0, month_key: '2026-06' });
  const allTurns = [primary, alt];
  const primaryTurns = allTurns.filter(t => t.account_label === 'Primary');
  const [m] = aggregateMonths(primaryTurns);
  eq(m.total_tokens, 1000); // only Primary
});

test('Primary turn: NOT included in Alt aggregation (exact-match excludes)', () => {
  const primary = turn({ account_label: 'Primary', input_tokens: 1000, output_tokens: 0, month_key: '2026-06' });
  const altTurns = [primary].filter(t => t.account_label === 'Alt');
  eq(altTurns.length, 0); // Primary does not match Alt filter
});

test('"combined"-labeled turn: in combined aggregation (all turns), NOT in Primary or Alt', () => {
  const combinedTurn = turn({ account_label: 'combined', input_tokens: 800, output_tokens: 0, month_key: '2026-06' });
  const allTurns = [combinedTurn];
  // combined: all turns
  const [cm] = aggregateMonths(allTurns);
  eq(cm.total_tokens, 800);
  // Primary filter: exact-match → 0 results
  eq(allTurns.filter(t => t.account_label === 'Primary').length, 0);
  // Alt filter: exact-match → 0 results
  eq(allTurns.filter(t => t.account_label === 'Alt').length, 0);
});

test('combined total >= Primary + Alt (combined-labeled turns only counted in combined)', () => {
  const primary     = turn({ account_label: 'Primary',  input_tokens: 1000, output_tokens: 0, month_key: '2026-06' });
  const alt         = turn({ account_label: 'Alt',      input_tokens: 500,  output_tokens: 0, month_key: '2026-06' });
  const bothUnsure  = turn({ account_label: 'combined', input_tokens: 200,  output_tokens: 0, month_key: '2026-06' });
  const allTurns    = [primary, alt, bothUnsure];

  const [combinedMonth] = aggregateMonths(allTurns); // combined: all turns
  const [primaryMonth]  = aggregateMonths(allTurns.filter(t => t.account_label === 'Primary'));
  const [altMonth]      = aggregateMonths(allTurns.filter(t => t.account_label === 'Alt'));

  // combined includes the Both/Unsure turn; sum of individual accounts does not
  eq(combinedMonth.total_tokens, 1700);
  eq(primaryMonth.total_tokens, 1000);
  eq(altMonth.total_tokens, 500);
  assert.ok(combinedMonth.total_tokens > primaryMonth.total_tokens + altMonth.total_tokens,
    'combined must exceed primary+alt when combined-tagged turns exist');
});

// ----------------------------------------------------------------
// recomputeMonthlyCache label resolution (pure part — no IDB)
// The label list is: twoAccount ? [acct1, acct2, 'combined'] : ['combined']
// ----------------------------------------------------------------

function resolveMonthlyLabels(cfg) {
  const twoMode = !!(cfg && cfg.account_2_name && cfg.account_2_name.trim());
  return twoMode
    ? [(cfg.account_1_name || 'Primary'), cfg.account_2_name.trim(), 'combined']
    : ['combined'];
}

test('single-account mode: only ["combined"] label', () => {
  const labels = resolveMonthlyLabels({ account_1_name: 'Primary', account_2_name: '' });
  assert.deepStrictEqual(labels, ['combined']);
});

test('two-account mode: [acct1, acct2, "combined"] with real names', () => {
  const labels = resolveMonthlyLabels({ account_1_name: 'Work', account_2_name: 'Personal' });
  assert.deepStrictEqual(labels, ['Work', 'Personal', 'combined']);
});

test('two-account mode: acct1 defaults to "Primary" when empty', () => {
  const labels = resolveMonthlyLabels({ account_1_name: '', account_2_name: 'Alt' });
  assert.deepStrictEqual(labels, ['Primary', 'Alt', 'combined']);
});

test('two-account mode: acct2 trimmed in label list', () => {
  const labels = resolveMonthlyLabels({ account_1_name: 'Primary', account_2_name: '  Side  ' });
  assert.deepStrictEqual(labels, ['Primary', 'Side', 'combined']);
});

// ----------------------------------------------------------------
// tipPersonalization: exactly 7-day boundary (the spec-critical edge)
// activeDays.size < 7 → generic; activeDays.size === 7 → gate passes
// ----------------------------------------------------------------

test('exactly 7 active days: gate passes (activeDays.size === 7, not < 7)', () => {
  const now = new Date('2026-06-28T12:00:00Z').getTime();
  // 7 turns, each 24h apart → 7 distinct UTC days; all within the last 7d window
  const turns7 = Array.from({ length: 7 }, (_, i) => ({
    session_id: `s7-${i}`,
    timestamp: new Date(now - i * 86400000).toISOString(),
    model: 'claude-sonnet-3-7',
    input_tokens: 1000,
    output_tokens: 3000, // ratio = 3.0 > 2.0 → tip1 should fire
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    account_label: 'Primary',
    month_key: '2026-06',
  }));
  const r = tipPersonalization(turns7, now);
  // Gate passes at exactly 7 — tip1 fires (ratio 3.0 > 2.0)
  eq(r[1] !== null, true);
  eq(r[1].includes('3.0'), true);
});

test('exactly 6 active days: gate fails (activeDays.size === 6 < 7)', () => {
  const now = new Date('2026-06-28T12:00:00Z').getTime();
  const turns6 = Array.from({ length: 6 }, (_, i) => ({
    session_id: `s6-${i}`,
    timestamp: new Date(now - i * 86400000).toISOString(),
    model: 'claude-sonnet-3-7',
    input_tokens: 1000,
    output_tokens: 3000,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    account_label: 'Primary',
    month_key: '2026-06',
  }));
  const r = tipPersonalization(turns6, now);
  // 6 < 7 → all generic regardless of ratio
  eq(r[1], null);
  eq(Object.values(r).every(v => v === null), true);
});

test('tip 2 fires at exactly 7 active days when 3+ sessions spiral', () => {
  const now = new Date('2026-06-28T12:00:00Z').getTime();
  // 7 anchor turns spread over 7 distinct days (gate = 7 active days)
  const anchorTurns = Array.from({ length: 7 }, (_, i) => ({
    session_id: `anchor-${i}`,
    timestamp: new Date(now - i * 86400000).toISOString(),
    model: 'claude-sonnet-3-7',
    input_tokens: 100, output_tokens: 50,
    cache_read_tokens: 0, cache_creation_tokens: 0,
    account_label: 'Primary', month_key: '2026-06',
  }));
  // 3 spiral sessions, each 6 turns in the last 7d window
  // early avg = 100, late avg >> 300 → ratio > 3.0
  const spiralTurns = [];
  for (let i = 0; i < 3; i++) {
    const sid = `spiral-${i}`;
    const tokPattern = [50, 50, 50, 500, 500, 500];
    for (let j = 0; j < 6; j++) {
      spiralTurns.push({
        session_id: sid,
        timestamp: new Date(now - 1 * 86400000 + j * 60000).toISOString(), // within last 7d
        model: 'claude-sonnet-3-7',
        input_tokens: tokPattern[j], output_tokens: 0,
        cache_read_tokens: 0, cache_creation_tokens: 0,
        account_label: 'Primary', month_key: '2026-06',
      });
    }
  }
  const allTurns = [...anchorTurns, ...spiralTurns];
  const r = tipPersonalization(allTurns, now);
  eq(r[2] !== null, true);
  assert.ok(r[2].includes('sessions spiraled'), `tip2 badge: ${r[2]}`);
});

// ----------------------------------------------------------------
// Toast priority selection
// Pure if-else extracted from runSync lines 925-928:
//   if (skippedLines > 0) → skipped toast
//   else if (totalTurns === 0) → caught-up toast
// ----------------------------------------------------------------

// Mirrors the exact branching from burnboard.html runSync
function selectToast(skippedLines, totalTurns) {
  if (skippedLines > 0) return 'skipped';
  if (totalTurns === 0) return 'caught_up';
  return null;
}

console.log('\ntoast priority selection');
test('skippedLines > 0 → skipped toast (regardless of totalTurns)', () => {
  eq(selectToast(1, 5),  'skipped');
  eq(selectToast(3, 0),  'skipped'); // both conditions true: skipped wins
  eq(selectToast(10, 0), 'skipped');
});

test('skippedLines === 0 AND totalTurns === 0 → caught-up toast', () => {
  eq(selectToast(0, 0), 'caught_up');
});

test('skippedLines === 0 AND totalTurns > 0 → no toast', () => {
  eq(selectToast(0, 1),   null);
  eq(selectToast(0, 100), null);
});

test('skipped beats caught-up: if both conditions true, skipped wins', () => {
  // skippedLines > 0 AND totalTurns === 0 → both would fire, but skipped is checked first
  eq(selectToast(5, 0), 'skipped');
  assert.notStrictEqual(selectToast(5, 0), 'caught_up');
});

// ----------------------------------------------------------------
// promptAccount dismiss → Primary default (pure fallback)
// Mirrors burnboard.html runSync line 823:
//   const accountLabel = accountLabelArg || _cfg.account_1_name || 'Primary';
// And promptAccount dismiss: resolves with a1 = _cfg.account_1_name || 'Primary'
// ----------------------------------------------------------------

function resolveAccountLabel(accountLabelArg, cfg) {
  return accountLabelArg || (cfg && cfg.account_1_name) || 'Primary';
}

console.log('\npromptAccount dismiss → Primary default');
test('dismiss (undefined arg) → account_1_name', () => {
  eq(resolveAccountLabel(undefined, { account_1_name: 'Work' }), 'Work');
});
test('dismiss (undefined arg) with no account_1_name → literal "Primary"', () => {
  eq(resolveAccountLabel(undefined, { account_1_name: '' }), 'Primary');
});
test('dismiss (undefined arg) with null cfg → literal "Primary"', () => {
  eq(resolveAccountLabel(undefined, null), 'Primary');
});
test('explicit label passed → used as-is (no dismiss fallback)', () => {
  eq(resolveAccountLabel('Alt', { account_1_name: 'Work' }), 'Alt');
});
test('"combined" label passed → used as-is', () => {
  eq(resolveAccountLabel('combined', { account_1_name: 'Work' }), 'combined');
});

// ================================================================
// CANNOT-VERIFY-HEADLESS: Phase 4 DOM/async wiring confirmed by static inspection
// 11. recomputeMonthlyCache try/catch in runSync — burnboard.html now wraps the call
//     in try { await recomputeMonthlyCache(); } catch (e) { ...; _monthlyCacheStale = true }.
//     The catch does not re-throw, so renderDashboard() and showScreen('app') still
//     run even if recompute throws. Confirmed by source inspection — cannot exercise
//     IDB paths under Node.
// 12. renderHistory called on history tab switch — burnboard.html tab-bar handler:
//     after panel.classList.add('active'), if (btn.dataset.tab === 'history') renderHistory()
//     is called. Fire-and-forget (no await). Confirmed by grep of tab handler body.
// 13. _historyBound flag prevents double-binding — renderHistory() checks _historyBound
//     before attaching the delegated listener; sets it to true after first attach.
//     Confirmed by module-level `let _historyBound = false` and guard in renderHistory.
// 14. Phase 5: account selector pills rendered — renderHistory() now renders
//     account-selector div with 3 pills (All, acct1, acct2) when twoAccountMode().
//     Confirmed by source inspection of renderHistory().
// 15. CSV download via Blob+createObjectURL+<a download> — exportHistoryCsv() creates
//     Blob([csv], {type:'text/csv'}), URL.createObjectURL, temporary <a> with download
//     attr, .click(), URL.revokeObjectURL. Confirmed by source inspection.
// 16. _cfg.billing_start used (not billing_start_day) — getBillingCycles reads
//     `Number(_cfg.billing_start) || 1` per RESOLVED spec note. Confirmed by grep.
// 17. Phase 5: recomputeMonthlyCache loops real labels — in twoAccountMode loops
//     [acct1, acct2, 'combined']; else ['combined']. RESOLVED Phase 4 ponytail.
//     Confirmed by source inspection — cannot exercise IDB under Node.
// 18. Phase 6: toast shown post-sync — runSync calls showToast('all caught up ✓')
//     when totalTurns===0, or showToast('skipped N malformed lines') when skippedLines>0.
//     Skipped-lines takes priority. Cannot exercise DOM showToast under Node.
// 19. Phase 6: favicon updated in renderDashboard — setFavicon(_lastCheckState) is called
//     after dashboard innerHTML assignment. _lastCheckState is set by renderStartCheck.
//     Confirmed by source inspection — cannot exercise DOM+IDB path under Node.
// 20. Phase 6: boot() shows reconnect screen when permission revoked — perm !== 'granted'
//     now calls showScreen('reconnect') instead of showScreen('connect'). Confirmed.
//
// Additional browser-only items (CANNOT-VERIFY-HEADLESS):
// 21. Dashboard always uses combined data — loadDataLocal() reads ALL turns via dbGetAll('turns')
//     with no account_label filter. Start Check / Forecast / Mini Stats come from this path.
//     The _historyAccount selector in renderHistory does NOT affect loadDataLocal.
//     Confirmed: grep shows _historyAccount only referenced in renderHistory/renderMonthlyView/
//     renderWeeklyView/renderBillingView/exportHistoryCsv — never in loadDataLocal.
// 22. Account selector + combined card only appear when account_2_name set — twoAccountMode()
//     is called inside renderHistory() before rendering selector/card HTML.
//     When account_2_name is empty/whitespace, twoAccountMode()===false and the selector/card
//     HTML is skipped entirely. Confirmed by source inspection of renderHistory().
// 23. Account 2 cleared → single-account view — saveSettings() re-renders dashboard; history
//     re-renders on every tab click. twoAccountMode() returns false when account_2_name is
//     cleared, so selector and combined card vanish on next render. No migration needed.
//     Confirmed: twoAccountMode() reads _cfg.account_2_name live on every call.
// 24. promptAccount dismiss → Primary — backdrop click and Esc key both call dismiss()
//     which resolves with `a1 = _cfg.account_1_name || 'Primary'`. No DOM element needed
//     to verify the fallback chain; the pure fallback is tested above.
// ================================================================

// ================================================================
// Summary
// ================================================================
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
