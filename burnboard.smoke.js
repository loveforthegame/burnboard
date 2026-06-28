// burnboard.smoke.js — runtime smoke test.
// Loads the REAL burnboard.html inline script (not a copy), stubs DOM + IndexedDB,
// and asserts the app boots to a screen with no error thrown on load.
// Catches the bug class unit tests miss: load-order / TDZ / missing-element / syntax
// errors that only fire when the actual shipping file starts up.
//   run: node burnboard.smoke.js   (exit 0 = boots, non-zero = blank-page bug)
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, 'burnboard.html');
const src = fs.readFileSync(HTML, 'utf8');

// Extract the inline script: the bare <script> with no attributes (the CDN tag is
// <script src=...>, so the literal `<script>` token only matches the inline block).
// Line-ending agnostic (the file may be CRLF after a git checkout).
const m = src.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('SMOKE FAIL: no inline <script> block found in burnboard.html'); process.exit(1); }
const code = m[1];

const screenIds = ['connect-screen', 'sync-screen', 'app-screen', 'reconnect-screen'];
let activeScreen = null;
const _els = {};
function fakeEl(id) {
  const el = {
    id, _cls: new Set(),
    classList: {
      add(c) { el._cls.add(c); if (c === 'active' && screenIds.includes(id)) activeScreen = id; },
      remove(c) { el._cls.delete(c); }, toggle(c) { if (el._cls.has(c)) { el._cls.delete(c); return false; } el._cls.add(c); return true; },
      contains(c) { return el._cls.has(c); },
    },
    style: {}, dataset: {}, value: '', textContent: '', innerHTML: '', disabled: false,
    addEventListener() {}, setAttribute() {}, removeAttribute() {}, appendChild() {},
    querySelectorAll() { return []; }, querySelector() { return null; },
  };
  return el;
}
const getEl = id => _els[id] || (_els[id] = fakeEl(id));

global.document = {
  getElementById: getEl, querySelectorAll() { return []; }, querySelector() { return null; },
  createElement() { return fakeEl('created'); }, head: fakeEl('head'), body: fakeEl('body'), addEventListener() {},
};
global.window = global;
global.showDirectoryPicker = undefined; // exercises the compat path; harmless with stubs
global.Chart = undefined;
global.navigator = { clipboard: { writeText() { return Promise.resolve(); } } };
global.requestAnimationFrame = f => setTimeout(f, 0);

function req(result) {
  const r = { onsuccess: null, onerror: null, result };
  setTimeout(() => { if (r.onsuccess) r.onsuccess({ target: { result } }); }, 0);
  return r;
}
const store = {
  get: () => req(undefined), getAll: () => req([]), put: () => req(undefined),
  delete: () => req(undefined), clear: () => req(undefined),
  index: () => ({ getAll: () => req([]), openCursor: () => req(null) }),
  openCursor: () => req(null), createIndex() {},
};
const db = {
  objectStoreNames: { contains: () => true }, createObjectStore: () => store,
  transaction: () => ({ objectStore: () => store, oncomplete: null, onerror: null, onabort: null }), close() {},
};
global.indexedDB = {
  open() {
    const r = { onsuccess: null, onerror: null, onupgradeneeded: null, result: db };
    setTimeout(() => { if (r.onsuccess) r.onsuccess({ target: { result: db } }); }, 0);
    return r;
  },
};

let threw = null;
let selfCheckOK = false;
const realLog = console.log;
console.log = (...a) => { if (String(a[0]).includes('self-check passed')) selfCheckOK = true; realLog(...a); };

try { (0, eval)(code); } catch (e) { threw = e; }

setTimeout(() => {
  console.log = realLog;
  const fail = m => { console.error('SMOKE FAIL: ' + m); process.exit(1); };
  if (threw) fail('script threw on load: ' + threw.name + ': ' + threw.message);
  if (!selfCheckOK) fail('self-check did not pass (or did not run)');
  if (activeScreen !== 'connect-screen') fail('boot did not reach the Connect screen (active=' + activeScreen + ')');
  console.log('SMOKE PASS: boots clean, self-check passed, reached Connect screen.');
  process.exit(0);
}, 300);
