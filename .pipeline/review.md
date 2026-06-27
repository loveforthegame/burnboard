# Reviewer Verdict — Phase 4 (history-and-export)

Base ref: `83f5cd6`. Branch: `ship/20260628-002500-phase-4-history-export`.
Diff is purely additive: `burnboard.html` +630/-0, `burnboard.test.js` +643/-0. Zero removed lines in either file (confirmed via `git diff | grep '^-[^-]'` returning empty). Phase 1/2/3 logic is untouched.

## Step 2 — Hard rules checklist (CLAUDE.md)

### Rule 1: "Never invent a state, field, name, or requirement not in spec docs"
PASS.
- Every persisted field traces to dump §13.5/§15.4: `month_key, total_tokens, input_tokens, output_tokens, cache_read_tokens, sessions, active_days, top_model, account_label, computed_at` (burnboard.html:1766-1774, 1789-1793).
- ORIGINATED items are exactly the ones the spec named and flagged: empty-state copy `no monthly history yet` (line 1994), `no billing history yet` (line 2224), billing-bar accent color `--accent` (line 2252), vs-avg baseline = mean of completed cycles in view (lines 2273-2279), CSV ascending sort (line 1918/1926), header-only CSV on empty (line 1909). No NEW originated strings beyond the spec's named set.
- UI copy is verbatim/lowercase vs dump §8: `your usage, over time.` (line 1965 = dump:593), `no activity` (line 2032 = dump:628), `not enough history yet` (line 2019 = dump:629), `mostly <model>` + `active days` (lines 2031-2032 = dump:617-618), `day N of N` (line 2263 = dump:671), `vs same point last cycle:` (line 2267 = dump:675), `of last cycle's total` (line 2257 = dump:677), `ongoing` (line 2284 = dump:683), `Export CSV` (line 1968 = dump:692).

### Rule 2: "Mark intentional simplifications with a ponytail: comment" (ceiling + upgrade path)
PASS. All 10 spec-required ponytails present with ceiling + upgrade path:
1. rolling-mean overlay on months axis — line 2050
2. billing day cap 28 — line 1845
3. top_model bar tint — line 2045
4. single-account combined collapse — line 1782
5. gap-month omission — line 2022
6. CSV no-escape — line 1903
7. stale-cache deferral — line 791
8. listener bind-once — see note below
9. re-render per tab click — line 2523
10. vs-same-point granularity — line 2232
Plus extras: cross-month label (1816), Monday-math reuse (1799), billing-bar accent (2252), CSV sort order (1918).

NOTE on #8 (listener bind-once): implemented correctly via `_historyBound` flag (declared line 1732, enforced lines 1945-1957) with a plain explanatory comment. This is the full-correctness guard, not a shortcut with a ceiling, so a `ponytail:` tag is not strictly applicable. Not a violation — the guard exists and works.

No hard-rule violation. Not a BLOCK.

## Step 3 — Acceptance criteria (ROADMAP)
1. History tab with Monthly/Weekly/Billing toggle, monthly cards newest-first w/ tokens, sessions, active days, dominant model, vs-prior delta — PASS (renderHistory 1940, renderMonthlyView 1982, cards 2007-2036).
2. recomputeMonthlyCache runs post-sync, comparison chart + rolling-avg overlay render from it — PASS (wiring at runSync, diff line +787; chart + rollingAvg lines 2052-2117).
3. Weekly: last 12 Mon-Sun, zero weeks faded, oldest dash, sparkline — PASS (lines 2123-2208; faded 2133, oldest dash 2138, sparkline 2177).
4. Billing uses `_cfg.billing_start`, current cycle card + last-3 table — PASS (lines 2214-2320; bsd at 2219).
5. CSV `burnboard-history-YYYY-MM-DD.csv` w/ spec columns, fully client-side — PASS (exportHistoryCsv 1922-1935, Blob+createObjectURL+revoke; columns line 1908 = dump:698-699).

## CRITICAL reconciliation check — billing key
PASS. `billing_start_day` appears ONLY in docs (dump.md, ROADMAP.md, spec.md) and in test/journal comments referencing the reconciliation — never as a code key. burnboard.html uses `_cfg.billing_start` exclusively (line 2219, pre-existing 549/2579/2595). No second key, no duplicate settings field added. Exactly the reconciliation point the spec demanded.

## Other required verifications
- recomputeMonthlyCache writes under `account_label:'combined'` (line 1791) and is called post-sync in runSync after bb_last_sync write, wrapped in try/catch (diff +787). PASS.
- Account dropdown stays HIDDEN — absent from renderHistory; only the three view pills + Export button render (lines 1960-1969). PASS.
- Monthly cards: no-data 40% opacity (`.no-data` + line 2021), single-month `not enough history yet` (line 2018-2019). Weekly: zero-activity faded rows (line 2133), oldest dash (line 2138). Billing card + last-3 table (lines 2261-2319). CSV exact 8 columns + Blob download. PASS.
- Scope guard: NO Phase 5/6 features built. `whats-coming` tab button/panel (lines 341/349) and the Reconnect ponytail (line 2658) are PRE-EXISTING Phase 1 scaffold/comments, NOT in this diff (confirmed: diff grep for them returns only renderHistory references). No account selector, no combined card, no tips, no toasts, no reconnect flow. PASS.
- Numbers in JetBrains Mono via `.mono` spans throughout (e.g. 2030-2031, 2151-2154, 2263). Chart tick/tooltip fonts JetBrains Mono. PASS.
- Charts guarded `if (!window.Chart) return;` AFTER text/table render, destroy-before-recreate via `_monthlyChart`/`_weeklyChart` (lines 2064-2065, 2174-2175). PASS.

## Step 4 — Code quality
- All 4 pure seams (aggregateMonths, getWeeklyBuckets, getBillingCycles, buildCsvRows) extracted IDB-free and copied verbatim into the test file. The copied getBillingCycles is logic-identical to the HTML version (only Intl locale differs: `'en-US'` vs `undefined`, which does not affect asserted numeric fields). Low drift risk.
- Tests exercise the risky paths the Coder flagged: Monday-boundary single-count, half-open [start,nextStart) billing interval, year/month rollback, Feb/28-day caps, top_model tie-break, CSV no-escape safety, empty inputs. Not happy-path-only.
- Test count reconciles: base 192 `test()` calls -> 238 now = +46 new (verified via git show on base ref). The changes.md "28 new" / test-results.md "18 extended + 28" narration is muddled, but the real artifact is 238/238 and the delta is genuinely +46. Cosmetic doc inconsistency only.
- No dead code. No refactor of adjacent Phase 1-3 code. Edits are the two spec'd integration points only.
- Tests not run here (node not on the read-only allowlist); relying on test-results.md (238/238 pass) + static seam inspection. Flagged as the one UNVERIFIABLE-by-me item; seams inspected and sound.

## Minor non-blocking observations (no action required)
- Current-cycle marker is rendered BEFORE the label (line 2301-2303) whereas the dump ASCII mock shows it trailing. Spec said "marked" without pinning position; dump is an illustrative mock. Cosmetic, present and unambiguous.
- listener bind-once uses a plain comment, not a `ponytail:` tag (it is a correctness guard, not a simplification). Acceptable.

## Verdict
Spec fully implemented, all hard rules pass, the billing-key reconciliation is honored exactly, scope guard respected (no Phase 5/6), tests are meaningful and cover the flagged risk paths, diff is purely additive with Phase 1-3 untouched. No security/correctness/data-integrity issue found.

VERDICT: SHIP
