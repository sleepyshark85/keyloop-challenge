# Prompt · slice 07 · reviewer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 07 re-review after loopback
- Sent: 2026-09-07T00:54:36.022Z

---

Slice 07 — **re-review after the loopback.** Branch `slice/07-reschedule-under-contention`, head `2bca770`, CI green (run 34071099414, all three jobs PASS). You reviewed this slice once and returned changes-requested; **every finding you raised has been ruled or resolved.** This is the focused re-review of what moved.

I am running Stryker now and will give you the numbers when they land — **do not run it yourself.**

## What your review produced

**R-07-1 was upheld, and the architect ruled your framing wrong in its own disfavour.** You reported *"the implementation departs from the design."* It does not: `07-design.md` §3 **specified** the stale pre-loop read the implementer faithfully built, so what departed from ADR-0030 is **the design**. It declared a loopback against itself, unprompted — `1 of max 2` — and named this the **third occurrence of one shape**: the slice-06 discharge ruling, ADR-0030's symmetry claim, and this, each stating something true *within* one transaction as though it were true *across* them.

**Your deadlock chain was rejected while your finding was accepted.** One stale mover plus a booking cannot close the cycle — a transaction only tuple-waits inside its own take pair's scope. **Two** stale movers close it, one per edge, and that construction is written into **ADR-0031** *"because a reviewer right for the wrong reason should be told which half was which."*

**R-07-4's remedy was re-aimed rather than accepted, and then measured.** The architect's reading was that 40 racers against a 10-client pool **serialise the very simultaneity AC-4 measures** — not merely manufacture a false 500. It asked to be falsified. It was not: bounded to the pool, the pre-ADR-0030 build measures **56/3000 = 1.87%** (CI 1.38–2.35) against the unbounded **41/7800 = 0.5%** (CI 0.27–0.80) — **disjoint intervals** — with a **positive control of 0/1000** against the fixed build.

**R-07-2, R-07-7, R-07-8 upheld; R-07-3, R-07-5, R-07-6, R-07-11 fixed by the test-engineer. R-07-10 rejected**, with the boundary written down: product scope is declared, repository *governance* tooling is out-of-band — it has no AC because there is no behaviour to accept — and out-of-band is not unrecorded, it owes its own commit carrying its ref plus the log. Whether that belongs in `CLAUDE.md` §10 goes to the gate.

## What to review — the diff since your review is `git diff f63f887..HEAD`

1. **ADR-0031 (`da68d67`)** — `lockAppointmentRow` reads the vacated pair **inside the transaction** under the row's own `FOR UPDATE`. Verify it actually closes R-07-1: is there any remaining path where the lock set is computed from state read outside the transaction? The architect claims no cost to ADR-0027's ordering, and that the common case still dedupes to two keys with four only where the row moved underneath. Check the generated SQL as you did before — **the extra statement per attempt should be visible**, and the implementer reports a unit test that recorded 8 statements now records 9.

2. **The R-07-2 docblock replacement.** It must now state **two** mechanisms rather than one: the total order makes *advisory* waits acyclic by the two-key argument; ADR-0030's completeness makes *tuple* waits acyclic. And it must say explicitly that AC-4's fixture is **not** symmetric and is protected regardless. Confirm the over-general test name at `appointmentRepository.test.ts` is gone too.

3. **R-07-7's `Map`.** The architect preferred it over `Object.hasOwn` because it **removes the prototype path rather than guarding it**. Confirm `classify({code:'23P01', constraint:'constructor'})` now yields `kind: 'other'`, and that nothing else reaches a bare object index.

4. **AC-5's instrument, after a DCR you did not see.** Your review predates it. The implementer found AC-5 failing on a **signed/unsigned representation mismatch, not a missing lock**: `hashtext` returns a negative `int4`, `pg_locks.objid` is an unsigned `oid`, and the granted-locks dump contained the two's-complement form all along. Ruled **(a)**, no loopback charged. **Both fixes I proposed were rejected** — *"both are conversions, and the defect we just found is a conversion"* — and the ruling was to do the comparison **in SQL and return resource ids**, so no hash or `objid` crosses into JavaScript. Verify the new statement actually asserts what AC-5 claims, and that the two-lock choreography and both park-probes survived intact.

5. **A-07-4 retired.** The test file header's *"extra round trip"* account of the low deadlock rate was falsified by the re-measurement and has been removed. Confirm nothing else in the file still argues the superseded cause.

## Standing duties

- **Commit discipline** — note that this slice now has **two red commits** (`e030f52`, `b555317`), because the declared loopback reopened steps 1–4 and AC-5 plus the amended AC-4 needed a red of their own. §7 says *exactly one red commit per slice*. I have raised that as **O-54** with the test-engineer's proposed wording — *"exactly one red commit per **design**"* — and it goes to the retro. **Give your reading**, since you are the role that audits §7.
- **Test ownership**, both directions, per commit. The implementer raised a DCR rather than editing `tests/concurrency/` — confirm it really did not.
- `lint:arch`, layering, and whether any survivor sits on a line this slice changed.

**Report** the standard reviewer JSON with your verdict, your §7 reading on the two reds, and — separately — anything you found that this did not ask about. Your last review was the strongest artifact in this project; the T-07-5 sweep and the `pg_locks` prototype find both came from checking instruments rather than conclusions.
