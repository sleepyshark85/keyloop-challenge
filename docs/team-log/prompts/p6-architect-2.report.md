# Report · phase 6 · architect · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Restore section 11 binding scale
- Returned: 2026-09-09T08:47:31.687Z
- Duration: 78s

---

The fix is in the working tree, uncommitted, one file.

**File:** `/home/agentadmin/sources/keyloop-challenge/docs/arc42/11-risks-technical-debt.md`

## What was actually wrong

R-1 was not missing its *Binding scale* paragraph — `4dc252a` kept the paragraph and its remedy, but re-worded the one clause carrying the word `dealership`. "which no dealership generates organically" became "not organic traffic". The only remaining occurrence in §11 was `dealership_id`, and `\bdealership\b` cannot match inside it, because `_` is a word character and kills the trailing boundary. So the grep failed on a paragraph that still made most of the claim.

The restoration is three lines, restoring the clause that names who does not generate that load:

> two hundred simultaneous bookers on one slot — **which no dealership generates organically**; it arrives as a campaign funnelling many at one advertised slot — and the aggregate limit above binds first.

I did not re-add the deleted sentence's "at sustained bookings in the low thousands per second" — that figure already sits eight lines up in the same subsection ("In aggregate … low thousands per second"), and re-adding it would restore a duplication the condensation removed on purpose. The aggregate-versus-contended distinction is carried by "the aggregate limit **above** binds first", which points at it. Remedy and A-9 rationale were never lost and are untouched.

## Verification

- `npx vitest run --project perf` — **1 file, 5 tests, all passed**, 7.71s. Previously the AC-15 assertion in `tests/performance/availability-budget.test.ts` failed.
- `npm run docs:budget:check` — clean. §11 grew by ~10 words against a 2,500 ceiling; no rebaseline run.
- `npm run docs:refs` — 97 identifiers cited, all defined.
- `npm run docs:check` — `system-design.md` current.

`git status` shows only `docs/arc42/11-risks-technical-debt.md` modified by me (`events.jsonl` was already dirty when the session started). No commit made.

## On what would have caught it

The condensation should have run `npm test`. That is the whole answer — no new mechanism is warranted. A branch that rewrites prose an acceptance test asserts is exactly the branch that needs the suite, and "it's only docs" is the assumption that failed, not a gap in tooling. The check already existed and was simply not run.

Worth naming, though, so the next condensation is not surprised by it: **AC-15 is a documentation assertion wearing a performance test's clothes.** Its two greps read a Markdown file and need neither Docker nor a database; they sit in `tests/performance/` because CLAUDE.md §5 puts QS-14's threshold there, and the file's other four tests genuinely do need Postgres. That placement is correct and I am not proposing to move it — `tests/performance/` is the test-engineer's, and the reason §5 gives is sound. It just means the cheapest run that would have caught this was the full suite, not the docs scripts, and `docs:refs` could never have caught it: the claim is prose, not a cited identifier.

```json
{
  "role": "architect",
  "outcome": "reconciled",
  "arc42_sections_touched": ["§11.2"],
  "adrs": [],
  "quality_scenarios": ["QS-14"],
  "assumptions": [],
  "open_questions": [],
  "dcr_ruling": null,
  "message": "Restored R-1's binding-scale claim, dropped by 4dc252a's re-wording rather than by the paragraph deletion it looked like: the clause naming the dealership went, leaving only dealership_id, which \\bdealership\\b cannot match. perf is green, 5/5; docs:budget:check, docs:refs and docs:check all clean; nothing committed."
}
```
