# Prompt · slice 06 · test-engineer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 06 step 2 test-engineer review
- Sent: 2026-09-06T12:49:34.495Z

---

Slice 06 step 2 — AGREE. Branch `slice/06-reschedule-atomic-move`, checked out. Read `docs/slices/06-design.md` (step 1, committed `c410577`), then `docs/slices/06-reschedule-atomic-move.md`, then **ADR-0025** (`docs/adr/0025-existence-is-the-reads-legality-is-the-statements.md`) and **ADR-0026** (`docs/adr/0026-the-lock-is-a-value-the-write-takes-and-it-carries-its-keys.md`). Both are accepted.

**You do not read `src/`.** That is the point of your role — you define *done* without having seen the implementation.

**This is the cheap moment.** CLAUDE.md §6: an objection here costs a comment; the same ambiguity found at step 5 costs a full cycle plus a loopback. And §6's adjudication clause is explicit that a round which has never produced a disagreement is not consensus, it is deference, and the retro reads it that way. You are not being asked to sign off. You are being asked for a verdict per item, with reasoning.

**Six things the design decided that land on you.**

1. **AC-5 was amended mid-design and you should check the amendment, not just accept it.** As written the criterion said `404` is "decided by the `UPDATE` affecting zero rows rather than by a preceding read". The architect ruled that unimplementable — a move cannot be constructed without reading its own row, because the new interval derives from the row's service-type duration and its dealership's opening hours. ADR-0025 rules: **the read decides `404`, the guarded `UPDATE` decides `409`, and there is no follow-up read.** The `404`'s soundness rests on absence being *permanent* — ids come from `deps.newId()` and are never client-supplied, so no concurrent transaction can create the id the client named. **Is that argument sound, and can you write a test that would fail if it were not?**

2. **A-06-2 is the load-bearing gap the architect declined to close, and it is arguably yours.** The whole "`404` is permanent" argument rests on `deps.newId()` being the only id-minting site, and *nothing asserts that*. The architect said it "is not this slice's" and left it. If you think AC-5 is unsound without it, say so — that is an objection about an acceptance criterion, which is exactly what this step is for.

3. **AC-2 has been made falsifiable and the mechanism is yours to build.** A row-level `AFTER INSERT OR UPDATE OR DELETE … FOR EACH ROW` audit trigger, installed and dropped by the test, recording `TG_OP`, `txid_current()` and `statement_timestamp()`. One successful `PATCH` leaves exactly one row: `TG_OP = 'UPDATE'`, one distinct statement timestamp. `DELETE`-then-`INSERT` gives two ops; cancel-then-book gives `UPDATE` + `INSERT`; a two-statement move gives two timestamps. File: `tests/integration/reschedule-is-one-statement.test.ts` — yours, because it asserts a database invariant. `pg_stat_user_tables` and `xmin` were considered and rejected; if you think the trigger has a hole, name it.

4. **AC-1 needs a control that must fail, or it proves nothing.** The design says so itself: without it, a build with the exclusion constraints dropped passes AC-1 outright. The control is the same appointment moved onto an interval held by a *different* confirmed appointment, refused with `23P01` naming `no_bay_overlap`. The mechanism behind the pass is recorded in the design — `check_exclusion_constraint` skips the entry it just inserted by `ctid`, and the superseded heap version carries `xmax` = this transaction's own xid — so the index is never shown the prior version. **A `BEFORE UPDATE` trigger would see it and is correct only with an explicit `id <> NEW.id`.** Check that reasoning; it is the one place the constraint's semantics are relied on without being obvious.

5. **ADR-0024's warning 1 is routed to you, in the same red commit.** Registering `setNotFoundHandler` breaks the media-type half of AC-4's vacuity guard at `tests/contract/cancel-appointment.test.ts:247`, which discriminates on Fastify's default body. The design requires the re-derivation to land **in the same red commit**, so no merged test is ever degraded by a later fix. The replacement discriminator is the `type` member plus a negative control (`POST /appointments/{id}/nonsense` → `/problems/route-not-found`) proving the route exists. You also extend `tests/contract/error-taxonomy.test.ts`'s closed seven-row list — **both new rows land together**, one taxonomy change, not two.

6. **Two consequences recorded so you do not chase them.** A cancelled appointment moved out of hours answers **`400 /problems/outside-opening-hours`, not `409`** — the status guard lives only in the statement, so the domain rule is evaluated first. And **AC-4's metric half is unassertable in this slice**: `booking_conflicts_total` does not exist until slice 09, which already carries it. AC-4 here asserts status and `type` only.

**Standing constraints.** §2.2: real PostgreSQL via Testcontainers, no mocked database in any test asserting a persistence invariant. §2.4 and §7: **exactly one red commit** for this slice, authored by you, `test(acceptance): … (red)`, and the red must be *observed in CI* before implementation exists — an evidence chain is not a substitute, and a design once tried to make it one. §5: you own `tests/acceptance/ contract/ property/ concurrency/ architecture/ performance/` and the database-invariant half of `tests/integration/`; you never touch `tests/unit/`.

**Do not write tests yet.** This step is the review. Step 3 is where you commit the red.

**Report** your standard JSON plus, for each of the six items above, **AGREE or DISAGREE with reasoning** — and where you agree that a problem is real but think the proposed remedy is wrong or too broad, say exactly that, because the finding and the remedy are separate verdicts. Then, separately, anything you found that this did not ask about, especially anything in the design that you cannot write a failing test for.
