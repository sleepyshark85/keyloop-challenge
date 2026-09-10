# Prompt · slice 15 · architect · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 15 design: seed fixtures and capacity harness
- Sent: 2026-09-09T16:34:01.500Z

---

Slice 15, step 1 (DESIGN). Slice 14 merged at `e63fe17`; nothing is open, so §8's WIP limit is clear. Branch `slice/15-seed-fixtures-and-capacity-harness`, cut from `main`. Produce the step-1 design per CLAUDE.md §6.1 — building blocks touched, interfaces, data-model delta, applicable §10 quality scenarios, proposed arc42 edits, ADR if a decision is needed. Do not implement.

## What the human asked for, in their words

1. Improve `harness/seed.mjs` to **read its data from a JSON file instead of hard-coding it**.
2. The **default JSON file should prepare enough data to do all the important test cases**.
3. Improve `harness/double-booking.sh` to cover the case we discussed: **multiple bays, multiple qualified technicians, multiple concurrent booking requests**.

The motivation for (3) is a gap I put to them and they chose to close. `tests/concurrency/no-spurious-refusal.test.ts` already proves the claim rigorously — QS-3/AC-1, given *M* free bays and *M* free technicians and *N* concurrent bookings, exactly `min(N, M)` are confirmed — across `(N,M) ∈ {(2,1), (5,3), (20,8), (8,20)}`. But **nothing runnable from a terminal can demonstrate it**, because `harness/seed.mjs` seeds exactly one bay and one technician. So the demo proves "we never double-book" and cannot prove "we never refuse you while a bay is free" — which is the more reassuring of the two claims to a dealership.

## The trap, which I want ruled before anyone writes code

**Raising the default capacity breaks the existing scarcity demonstration.** `harness/double-booking.sh` today fires `REQUEST_COUNT=10` (default) at one bay and one technician and asserts **exactly one** `201` and the rest `409`, exiting non-zero otherwise. `docs/WALKTHROUGH.md` Scenario 2 prints that exact output as the system's central claim. If the default fixture seeds *M* > 1 bays, that script's assertion becomes false, Scenario 2's transcript becomes a lie, and `tests/acceptance/harness.test.ts` (slice 10 AC-4/AC-5/AC-6, the **test-engineer's** file) fails.

So "enough data for all the important test cases" and "the scarcity demo still works" are in tension, and the resolution is a design decision, not an implementation detail. One shape that occurs to me — **non-binding, rule as you see fit**: the default fixture describes both a scarce subtree (1 bay, 1 technician) and an abundant one (*M* of each), exporting distinct ids, so Scenario 2 keeps its transcript and a new scenario gets its own. There may be better shapes; a second `SERVICE_TYPE` with different qualified-technician coverage is another.

## Properties of the current code that must not be destroyed

Read `harness/seed.mjs` before designing — its docblock states these as deliberate, and they are the kind of thing a refactor silently removes:

- **It is a SECOND, INDEPENDENT TRANSCRIPTION of arc42 §8.1's reference-data shape, in raw SQL.** `tests/support/seed.ts` is the first. A renamed or dropped column fails loudly with PostgreSQL's own `42703` rather than silently. Moving the *data* into JSON is compatible with this only if the *SQL* stays hand-written here; a design that generates SQL from the JSON schema would collapse two transcriptions into one and lose the property.
- **Its stdout is `export`-shaped and is the entire contract.** `eval "$(npm run --silent harness:seed)"` is the whole setup a clean checkout needs, and `tests/acceptance/harness.test.ts` drives both cURL scripts from this command's stdout **alone**, never from `tests/support/seedScenario`. Changing what is exported changes an acceptance contract.
- **No `pre` hook, measured**: npm's own `pre`-hook stdout would interleave with and be `eval`'d alongside the export lines. `package.json` deliberately has no `preharness:seed`.
- Fresh random ids per invocation, because the `db` project shares one Testcontainer with no truncation and the script runs once per acceptance case — `vehicle.vin` has a global UNIQUE.
- `STARTS_AT` is tomorrow 09:00Z, rolled forward rather than pinned, with opening hours 08:00–18:00 every day so the day never matters, and two hours' headroom for `book-read-reschedule-cancel.sh`'s `+2 hours` reschedule convention.
- `double-booking.sh` refuses `REQUEST_COUNT < 2` outright (`R-10-5`): one racer against a free slot demonstrates no contention at all.

## Questions the design must answer

- What is the JSON's **schema**, where does the default live, and is it validated? An invalid fixture must fail loudly rather than seed a subtly wrong world — this repo's whole posture is that a check which cannot fail usefully is worse than none.
- What does "**all the important test cases**" mean, concretely and enumerably? Name them. If the honest answer is that the default cannot cover every case without becoming unwieldy, say which it covers and which stay out of scope.
- How does `double-booking.sh` learn *M*? Asserting `min(N, M)` requires knowing capacity; today it hardcodes an expectation of 1. Does the seed export it, does the script take it, or is it a second script? A script that infers *M* from the answers it got would be asserting whatever happened, which is `AC-5`'s own original defect — "a script that always exits 0 regardless of what it saw is not a demonstration, it is a print statement."
- §5 ownership: `harness/**` is the **implementer's**; `tests/acceptance/harness.test.ts` is the **test-engineer's**. State which acceptance criteria are new, which of slice 10's are amended, and be explicit that amending slice 10's ACs is a change to a merged contract.
- Is there an **ADR** here? The JSON-fixture decision may be one; the tension above may be another. Apply §4's bar — only important decisions, no implementation detail.
- Which **§10 quality scenarios** apply. QS-3 is the obvious one; say whether this slice extends it or merely demonstrates it.

Write the design to `docs/slices/15-design.md` following the existing `NN-design.md` conventions. Report your rulings, the ACs you propose, the ADR if any, and anything you are refusing and why — including if you think this should be two slices rather than one.
