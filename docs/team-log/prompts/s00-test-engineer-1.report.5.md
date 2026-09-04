# Report · slice 00 · test-engineer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 00 step 2 agree
- Returned: 2026-09-04T11:07:37.304Z
- Duration: 10260s

---

**`4af1e97`** on `slice/00-schema-and-constraints`, unmarked, committed with `git commit --only`. Not pushed, no PR comment. Working tree clean.

## Verbatim results

```
npm test                        Test Files  10 passed (10)      Tests  112 passed (112)
npx vitest run --project db     Test Files   3 passed (3)       Tests   18 passed (18)
npm run typecheck               clean
npm run lint:arch               no layering violations. 44 module(s) cruised, every root covered: src, tests
npm run test:tools              14/14 passed
```

112, as predicted.

## What the mutant printed

I did not use a synthetic mutation. I used **the design `CLAUDE.md` §2.1 rejects** — a `plpgsql` check-then-act trigger computing overlap, with the exclusion constraint dropped — because if AC-10 step 2 discriminates anything, that is the thing it should discriminate.

```
CORRECT — the exclusion constraint
  step 2  A -> [09:00,10:30)  self-overlap     ACCEPTED
  step 3  A -> [10:30,11:30)  onto B           REJECTED  no_bay_overlap
  step 4  A -> [10:00,11:00)  adjacent         ACCEPTED

MUTANT — check-then-act trigger, no `o.id <> NEW.id`
  step 2  A -> [09:00,10:30)  self-overlap     REJECTED  ERROR: bay overlap (trigger)   <- red
  step 3  A -> [10:30,11:30)  onto B           REJECTED  ERROR: bay overlap (trigger)
  step 4  A -> [10:00,11:00)  adjacent         ACCEPTED

MUTANT — same trigger, patched with `AND o.id <> NEW.id`
  step 2  A -> [09:00,10:30)  self-overlap     ACCEPTED
  step 3  A -> [10:30,11:30)  onto B           REJECTED  ERROR: bay overlap (trigger)
  step 4  A -> [10:00,11:00)  adjacent         ACCEPTED
```

Three things in that table, and the second and third are the ones worth keeping.

**Step 2 kills it, and steps 3 and 4 do not.** Under the naive trigger, steps 3 and 4 behave *identically* to the correct schema. Step 2 is the only assertion in the entire suite that separates the exclusion constraint from check-then-act on the UPDATE path. Had AC-10 been written with only the negative and the control — the shape every other case in this file has — the mutant would have passed clean.

**The patched trigger passes all three steps**, and I have said so in the commit message rather than letting the result read stronger than it is. AC-10 does not separate the exclusion constraint from a *correct* trigger; only simultaneity does, and that is QS-1's job at slice 07. This is the same honesty AC-3 already carries about `[)` versus `(]`: state what the evidence reaches, and name what it does not.

## One departure from AC-10's wording — raised, not taken

AC-10 as committed says A and B are *"on the same bay **and technician**"* and asserts the rejection at `no_bay_overlap`. **Those two clauses cannot both be evidence.** If A and B share a technician, moving A onto B's interval makes `no_technician_overlap` violable as well, and §11.2 A-2 says which of two simultaneously violable exclusion constraints is reported is index order and not a guarantee.

Measured before writing anything:

```
AC-10 as worded — same bay AND same technician
  A moved onto B (both constraints violable)     REJECTED  no_bay_overlap
As written here — same bay, DIFFERENT technician
  A moved onto B (only the bay is violable)      REJECTED  no_bay_overlap
```

The literal fixture passes today. It passes for the reason I spent step 2 of this slice objecting to — §4.2 rule 1 broken, inside a criterion. So B takes the other technician in the committed case, `no_bay_overlap` becomes the only violable constraint, and everything AC-10 actually asserts is preserved: consequence 4, the rejection at that name, B unchanged.

**The wording is mine.** It came from my step-5 recommendation, the human ruled on it in good faith, and I did not notice that the fixture clause and the assertion clause contradict each other until I sat down to write against it. That is a defect I introduced at the moment I was arguing hardest that nobody should rest an assertion on A-2. It wants a **(a) clarification** — delete "and technician" — and it is one line in the test either way. I flagged it in the file and in the commit message rather than changing the AC or quietly following it.

## Did writing it change what I believe about §8.2 consequence 4?

**Yes, in one respect that matters for slice 06.**

The consequence is stated in arc42 as a property of `UPDATE` — *"an UPDATE is checked against other rows, not against the version it replaces."* Writing the case made me see that it is really a property of **where the check lives**, and that the arc42 sentence describes an outcome without naming its cause. The exclusion constraint gets this for free because the index insertion never compares a tuple with the version it supersedes. A trigger gets it only if somebody *remembers* `o.id <> NEW.id` — and the patched-trigger row above is what that remembering looks like. Both end up satisfying the sentence, by completely different mechanisms, with completely different concurrency behaviour.

That matters because ADR-0003's atomic move is not merely relying on "an UPDATE succeeds when it self-overlaps". It is relying on the fact that **the property is structural rather than remembered** — nobody can regress it by editing a predicate, because there is no predicate. If §8.2 consequence 4 keeps describing the outcome only, a future slice can satisfy it with a trigger, pass AC-10, and lose the concurrency guarantee entirely, which is the same substitution §2.1 exists to forbid on the INSERT path.

Two concrete things follow, and I would rather hand them to step 7 than have them found later:

1. **§8.2 consequence 4 should say why, not just what** — that the exemption comes from the index never seeing the superseded tuple, and that a trigger reproducing it is a different mechanism with a different failure mode under simultaneity.
2. **Slice 06 still owes a concurrency case for the move.** AC-10 establishes the single-threaded UPDATE semantics unambiguously, which is exactly what I argued it should do and why it belongs here. It establishes nothing about two clients rescheduling onto the same slot at once — the mirror of QS-1 on the UPDATE path — and the patched-trigger row is the proof that the gap is real rather than theoretical. I do not think that changes slice 00's scope; I think it should be written into slice 06's design as an inherited obligation, the way AC-10 was not.

The other belief that survived intact: consequence 4 is **true**, on `postgres:16.15`, in all three directions, measured before I wrote a line of the case. If it had not been, the finding would have been an ADR to supersede rather than a test to write.

```json
{
  "role": "test-engineer",
  "outcome": "revised",
  "commit": "4af1e97",
  "marked_red": false,
  "red_commit": "98ace77",
  "committed_by_pathspec": true,
  "tests_added": {"integration_db_invariant": 1},
  "acceptance_criteria_covered": ["AC-10"],
  "verification": {
    "npm test": "10 files, 112 passed",
    "npx vitest run --project db": "3 files, 18 passed",
    "typecheck": "clean",
    "lint:arch": "clean — 44 modules, every root covered",
    "test:tools": "14/14 passed"
  },
  "mutant": {
    "chosen": "the check-then-act plpgsql trigger CLAUDE.md §2.1 rejects, exclusion constraint dropped — not a synthetic mutation",
    "naive trigger": "step 2 REJECTED (case red); steps 3 and 4 IDENTICAL to the correct schema",
    "discrimination": "step 2 is the only assertion in the suite separating the exclusion constraint from check-then-act on the UPDATE path",
    "patched trigger (o.id <> NEW.id)": "passes all three steps — AC-10 does NOT separate the constraint from a correct trigger; only simultaneity does, and that is QS-1 at slice 07"
  },
  "objections": [
    {
      "ref": "T-9",
      "severity": "minor",
      "disputes": "docs/slices/00-schema-and-exclusion-constraints.md AC-10",
      "claim": "AC-10's fixture clause 'on the same bay AND technician' contradicts its assertion clause 'rejected with 23P01 on no_bay_overlap'. Sharing the technician makes no_technician_overlap violable too, and §11.2 A-2 says which of two is reported is not guaranteed. Measured: the literal fixture passes on 16.15 by index order. The wording is the test-engineer's own from the step-5 recommendation.",
      "remedy": "(a) clarification — delete 'and technician'. The committed case gives B the other technician so no_bay_overlap is the only violable constraint; one line either way, and everything AC-10 asserts is preserved."
    }
  ],
  "belief_change": {
    "consequence_4_holds": "yes — measured on 16.15 in all three directions before writing the case",
    "what_changed": "§8.2 consequence 4 describes an OUTCOME without naming its CAUSE. The exclusion constraint gets it structurally, because the index never compares a tuple with the version it supersedes; a trigger gets it only if someone remembers `o.id <> NEW.id`. Both satisfy the sentence and pass AC-10, with different concurrency behaviour. ADR-0003 depends on the property being structural rather than remembered.",
    "for_step_7": "§8.2 consequence 4 should state the mechanism, not only the outcome.",
    "for_slice_06": "AC-10 fixes the single-threaded UPDATE semantics unambiguously and that is why it belongs here. It says nothing about two clients rescheduling onto one slot at once — the mirror of QS-1 on the UPDATE path. Write it into slice 06's design as an inherited obligation rather than leaving it to be rediscovered, which is how AC-10 was nearly lost."
  },
  "dcr": null,
  "message": "4af1e97 lands AC-10, mutant-checked against the check-then-act trigger §2.1 rejects rather than a synthetic mutation — step 2 kills it and steps 3 and 4 do not, so the property AC-10 exists for is carried by exactly one assertion. One flaw raised in AC-10's own wording, which I authored: 'same bay and technician' makes two exclusion constraints violable and puts the named assertion back on A-2. Writing it also changed what I think §8.2 consequence 4 should say — it names an outcome where the thing ADR-0003 depends on is the mechanism."
}
```
