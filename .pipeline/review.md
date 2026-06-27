# Review — Phase 3 (insights-and-sessions) — RE-REVIEW

Prior verdict: BLOCK — single hard-rule violation. The model-family-display
deviation in renderSessions lacked the ponytail: comment the spec named
explicitly. This re-review confirms the fix.

## Hard rule: "Mark intentional simplifications with a ponytail: comment"

PASS. The fix is present and correct.

burnboard.html lines 1589-1592, inside fd.recent_sessions.map:

    // ponytail: display the model family only (e.g. "opus"), not the version suffix dump 7.9 wants ("opus-4")
    // Phase 1 buildSessions already collapsed model to family, so the suffix isn't recoverable here.
    // upgrade path: store the raw model string on session records, then surface the short version name.
    const model = s.model === 'other' ? 'unknown' : s.model;

- Names the ceiling: family-only display, version suffix lost because Phase 1
  buildSessions already collapsed model to family. Correct and specific.
- Names the upgrade path: store the raw model string on session records, then
  surface the short version name. Actionable.

This is exactly the deviation the spec flagged, now marked as required.

## Other required ponytail (Spiral turn-3 overlap)

PASS. Still present, unchanged, at lines 855-856:

    // ponytail: turn-3 counted in both groups per dump's literal "1-3" and "3-end" ranges;
    //           ceiling = boundary ambiguity; upgrade = clarify with spec author if a future audit flags it.

## Hard rule: "Never invent a state, field, name, or requirement not in spec docs"

PASS (unchanged from prior pass). The edit is comment-only.

## No new issues introduced

Confirmed additive. The diff is three comment lines above an unchanged
const model = ... statement. No logic, no control flow, no field, no copy
changed. Surrounding render block (lines 1593+) untouched. No new dependency,
no scope creep.

## Carried forward from prior pass (verified clean previously)

- No invented states/fields/copy
- Filter scope correct; insight selection correct
- Surgical diff
- 192/192 tests passing
- Scope guard honored
- All other ponytail markers in place (CDN pin, dedup guard, pricing,
  window recompute, djb2, heatmap intensity, palette, clipboard, etc.)

## Verdict rationale

The sole blocking item is resolved. The ponytail comment names both the
ceiling and the upgrade path as the spec required. The change is purely
additive and introduces no new risk. Everything else was clean on the
prior pass.

VERDICT: SHIP
