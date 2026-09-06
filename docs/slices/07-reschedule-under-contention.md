---
id: "07"
title: Rescheduling under contention — a refused move changes nothing, and never opens a window
status: ready
depends_on: ["06"]
arc42: ["§6.3"]
adr: [3]
quality_scenarios: [QS-4, QS-5]
inherits: ["F-02-9", "A-05-6", "A-06-3", "O-41"]   # deferred here by ruling; slice:check enforces it (A-05-5)
loopbacks: 0
---

## Goal

The two properties that separate a correct move from one that merely looks correct in a
single-threaded test: a refused move leaves the original appointment exactly as it was, and a move
never transiently releases the slot it holds — not for an instant, under any interleaving.

QS-5 is the scenario that catches a cancel-then-insert implementation. That implementation passes
every test in slice 06.

## Acceptance criteria

- **AC-1** — Given A confirmed `[09:00, 10:00)` and the dealership fully booked at `[11:00, 12:00)`,
  when A is rescheduled to 11:00, then the request is refused **and** A is still `confirmed` at
  `[09:00, 10:00)` with the same id, bay and technician. Asserted by reading the row, not the
  response. *(QS-4)*
- **AC-2** — Given A holds the only bay at `[09:00, 10:00)`, when a reschedule of A to a fully-booked
  interval races *N* fresh bookings for `[09:00, 10:00)`, then **no fresh booking is ever confirmed**
  — at every moment, under every interleaving, A's slot is occupied. *(QS-5)*
- **AC-3** — Given the racing scenario of AC-2, when it is run repeatedly with recorded seeds, then
  the result is stable across runs and a failure names the seed that produced it.

## Inherited scope — written here, not only where it was deferred

- **A-05-6 — two unkilled guards inside ADR-0016's only sanctioned cast site.**
  `src/persistence/pgError.ts` carries surviving `ConditionalExpression` mutants at **80:9**
  (`typeof code === 'string'`, the duck-typing guard that makes `classify` total over `unknown`) and
  **103:39** (`constraint !== undefined` on the `23P01` arm). Nothing hands `classify` an error whose
  `code` is not a string, and nothing hands it a `23P01` carrying no constraint name — so both guards
  are specified and unproven, which is §11 R-11's shape inside the one file where ADR-0016 permits a
  `ContendedResource` to be minted. **Slice 07 is the destination** because it is where `23P01`
  classification on the `UPDATE` path becomes live rather than historical: a reschedule racing a
  booking is the first execution reaching that arm from a second call site. Two unit cases, the
  implementer's; no production change is expected, and if one is needed that is the finding.

- **A concurrency test for racing moves** (ref `A-06-3`, deferred here at slice 06 step 1; the
  obligation originates in §8.2, where it was for a while the only record). Slice 00's AC-10 fixes
  the **single-threaded** `UPDATE` semantics; [ADR-0003](../adr/0003-cancellation-and-rescheduling-in-scope.md)
  claims two racing reschedules behave like two racing bookings — one commits, the other gets
  `23P01` — and **no scenario and no test asserts it**. QS-4 and QS-5 cover what a *refused* move
  leaves behind, QS-6 the self-overlap; the mirror of QS-1 on the `UPDATE` path is named by
  nothing. A `BEFORE UPDATE` trigger that passes everything slice 00 asserts and fails only under
  simultaneity is the proof the gap is real, and is the mutant control this test owes.
  **Why here rather than slice 06:** ADR-0019's criterion, and both halves are re-measurable on
  arrival (D-05-3's remedy). *Cheaper* — AC-2 already builds the barrier harness for a move racing
  *N* bookings, and racing moves is that harness with `UPDATE` on both sides. *Stronger* — it can
  assert alongside AC-1 that the loser's original is untouched, which is what makes *"one commits,
  one is refused"* mean something rather than count to one. **If either premise is false on
  arrival, say so in the PR**; that is what D-05-3 asked for.

- **O-41 — the `Inherited scope` guard becomes bidirectional, and this file is where it first
  bites.** A-05-5's check is a *subset* guard (every ref deferred here appears in `inherits:`) and
  not a *completeness* guard: slice 06 listed five obligations in prose while three of its four
  `inherits:` refs appeared nowhere but the front-matter line, so a silent drop would have left
  `slice:check` green. Ruled at slice 06 step 2 with **one correction to the proposed remedy**:
  requiring every bullet to carry a ref is false against slice 06 today, because the retired
  `appointment.ts` bullet is a §5.2 prediction that was never a logged finding and has no ref to
  carry — a rule demanding one would invent a false ref to satisfy a rule that exists to stop false
  refs. So the guard runs **both ways**: every ref in `inherits:` appears in a body bullet, and
  every body bullet carries a ref **or** an explicit no-ref-with-reason escape. Bare bullets fail;
  escaped bullets pass and are visible. **Built at this slice's dispatch, before it reaches Ready**,
  so a Definition-of-Ready rule first bites on a file written under it rather than on one already
  declared ready. The tool is `tools/slice/check.mjs` and the edit is the orchestrator's.

## In scope

- `tests/concurrency/refused-move-leaves-original.test.ts` and
  `tests/concurrency/move-never-releases-slot.test.ts`.
- Whatever the implementation must change to satisfy them — which, if slice 06 was built as
  specified, is nothing. A green run here on unchanged production code is the desired outcome and is
  evidence, not an empty slice.

## Out of scope

- Any new endpoint or field. This slice adds proof, not surface.

## Definition of done

Beyond `CLAUDE.md` §10:

- If no production code changed, the reviewer states that explicitly in the PR and the team log
  records it. A slice that adds only tests is a legitimate outcome when the tests are the deliverable
  — but it must be visible rather than look like an oversight.
