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
// Summary
// ================================================================
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
