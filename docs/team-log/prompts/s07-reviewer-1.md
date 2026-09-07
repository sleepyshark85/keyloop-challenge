# Prompt · slice 07 · reviewer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 07 step 5 review
- Sent: 2026-09-06T18:38:50.522Z

---

Slice 07 **step 5 — REVIEW.** Branch `slice/07-reschedule-under-contention`. The diff is `git diff main...HEAD`. You may block a merge and raise a DCR; you may not change the design.

**Read:** `docs/slices/07-design.md`, `docs/slices/07-reschedule-under-contention.md` (four ACs), **ADR-0030** (new, accepted), and its context ADR-0018, 0023, 0026, 0027, 0029.

**What this slice is.** Step 1 raced F-02-9 rather than designing around it and **found a live defect in code merged an hour earlier**: contended moves deadlock, returning `40P01` and therefore `500`, with every ADR-0018 lock correctly taken. Each `UPDATE`'s exclusion check finds the other mover's *vacated but uncommitted* index entry, whose `xmax` is a live transaction. The architect's own slice-06 discharge ruling — *"vacating writes no index entry another transaction waits on"* — was the falsified sentence. ADR-0030: a write locks every resource it is **in flight against**.

**State.** Red `e030f52`, observed red in CI (run 34051339829: `suite` FAIL, `red-proof` PASS). Green at `f63f887` across two implementer commits. Typecheck, `lint:arch` (99 modules) clean. Zero loopbacks of max 2. No DCR.

---

## Six things to chase. The first three are the ones nobody else can do.

**1. T-07-5 — a vacuous-assertion trap, and I want the sweep.** The literal string `40P01` **never appears** in this service's structured output for the reschedule path: ADR-0029 gave that path its own event name, so the only signal is the `reschedule.deadlock` event with no SQLSTATE text beside it. **A raw substring check — the shape several existing `tests/concurrency/` files already use — would have passed on a build with the defect present.** The test-engineer caught it only by diffing a raw dump. **Sweep the existing concurrency and integration files: is any assertion on a raw SQLSTATE now vacuous for a path ADR-0029 renamed?** This is the highest-value thing in the review and it is squarely yours.

**2. O-51 — three of four criteria passed at the red commit.** Only AC-4 failed. AC-1 (`xmin`/`ctid`) and AC-2/AC-3 passed immediately, because slice 06's guarded `UPDATE` was already correct for them. The suite was red for the intended reason — but **§2.4's own reasoning cuts at those three**: a test that has never failed is not evidence, and they are characterisation tests of behaviour slice 06 already shipped. Give your reading: does a criterion that passes on first write need a demonstrated red of its own, or is pinning already-correct behaviour a legitimate second purpose §2.4 does not reach?

**3. Read the generated SQL, as you did at slice 06.** `lockResources` now locks a union via `DISTINCT` + `ORDER BY (cl, hashtext(key))`. Verify: one static statement for **both** booking and move (`vacated = leave ?? take`); bay-class sorts before technician-class; `DISTINCT` collapses the duplicate when incumbent and target share a resource; and — the load-bearing claim — **for a mutually-vacating pair the two racers' unions are the same multiset, so both compute an identical ordered lock sequence regardless of which pair each calls `take` or `leave`.** That symmetry is why the enlarged lock set cannot cycle on itself. The design also relies on the outer query honouring the subquery's `ORDER BY`, which nobody can prove from the standard; say whether you think AC-4 is an adequate live control on that.

**4. Two deviations from the design, both within stated latitude — confirm they are.** The implementer kept house style (`array[...]` with scalar interpolation) over the design's `unnest($1::int[], $2::text[])` sketch, and kept `lockResources(db, bayId, technicianId, leave)` over the sketched `(db, take: ResourcePair, leave: ResourcePair | null)` to minimise both call sites. §3 explicitly leaves spelling to the implementer. Functionally identical is claimed, not proven — check it.

**5. I-07-2, a prediction made at step 2 and confirmed at step 4.** The implementer predicted *before writing anything* that A-05-6's two `pgError.ts` guards are equivalent mutants, then argued it analytically: every downstream comparison in `classify` is `===` against a string literal, which never coerces, so a value failing either guard cannot be distinguished from one passing through it. **Check the proof, not the conclusion.** If it holds, this is the rare case where a survivor is provably unkillable rather than merely unkilled, and that distinction is worth confirming independently.

**6. I-07-5 — a pre-existing flake, now under more load.** `no-spurious-refusal.test.ts` (booking path, untouched here) failed once on a full-suite run and passed in isolation. This slice adds two concurrency fixtures at ~1600 attempts each to the same shared container. Is this a known flake with a home, or one this slice's load is making visible? A timing-sensitive test under rising load will fail intermittently and be blamed on whichever slice is in flight.

---

## Also verify, as standing duties

- **Commit discipline (§7)**: exactly one red commit, the test-engineer's, `(red)`-marked; every implementer commit green; Conventional, scoped `(07)`.
- **Test ownership (§5), per commit, both directions**: the implementer must not have touched `tests/concurrency/`; the test-engineer must not have touched `tests/unit/` or `src/`.
- **`lint:arch` clean** and the diff conforms to declared layering.
- **AC-4's assertions are not vacuous**: the positive witness must show both racers reaching attempt ≥ 2 — the test-engineer reports all 1600 by construction, since blocker appointments force attempt 1 to fail. Confirm that construction actually does what it claims.
- **The measured rates**: the architect saw 117/1000 on its fixture; the test-engineer measured **~0.5%** on this one (41/7800) and raised trials from 25 to 40 so the false-pass probability fell from 0.67% to 0.034%. Are you satisfied AC-4 discriminates, given the defect fires at 0.5% rather than 100%?
- **I-07-4**: 105 `src/` lines against a 22–26 estimate, almost all of it the docblock work the dispatch demanded. Fair, or is something else in there?

**Report** the standard reviewer JSON with your verdict, the T-07-5 sweep result, your §2.4 reading on O-51, your SQL verdict, and — separately — anything you found that this did not ask about. A reviewer with no findings reads to the retro exactly like an adjudication round with no disagreement.
