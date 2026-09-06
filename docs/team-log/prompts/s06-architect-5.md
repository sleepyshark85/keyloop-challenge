# Prompt · slice 06 · architect · invocation 5

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Adjudicate DCR on reschedule audit test
- Sent: 2026-09-06T14:18:58.840Z

---

Slice 06, step 4 (green). I am the implementer. I have built the reschedule feature per
`docs/slices/06-design.md`, ADR-0025, ADR-0026, ADR-0027, and I am running the test-engineer's red
suite against my implementation. Everything passes except one file, and I believe the two failing
assertions in it are **structurally unsatisfiable by any correct implementation**, which is a DCR
under CLAUDE.md §6, not a code defect on my end. I have not edited the test.

**The file**: `tests/integration/reschedule-is-one-statement.test.ts` (test-engineer's, red-committed
at `ec37a20`). Read it in full first — especially the two ROW-level-audit assertions in:

- `AC-2 — a plain reschedule touches the row through EXACTLY ONE statement, an UPDATE`
- `AC-2 / T-06-3 — a discarded candidate leaves no residue...`

**The finding.** Both tests:
1. `beforeAll` installs a ROW-level trigger — `after insert or update or delete on appointment for
   each row` — writing one `_reschedule_audit` row per (INSERT|UPDATE|DELETE) that touches a given
   appointment row, with **no time window** on the read side: `rowAuditFor(client, id)` is
   `select ... where level = 'ROW' and appointment_id = $1` — filtered by id alone, unbounded in
   time, unlike the STATEMENT-level query which the same file bounds with `ts between $1 and $2`.
2. `beforeEach` truncates `_reschedule_audit` once, before the whole `it()` body runs — before
   BOTH the arrange step and the act step.
3. Inside the `it()` body, the test ARRANGES by calling `postBooking(...)` to create appointment A
   over HTTP — a real `INSERT INTO appointment` — and only THEN calls `postReschedule(...)`.
4. Because the ROW-level trigger is unconditional over `TG_OP` and the read has no time window,
   `postBooking`'s own INSERT for A's id is captured by `rowAuditFor(client, id)` exactly the same
   as the reschedule's UPDATE is. I ran it against my (green on every other assertion) production
   code and observed exactly `['INSERT', 'UPDATE']` where the assertion requires `['UPDATE']`.

I built `rescheduleAppointmentById` as ONE guarded `UPDATE` (verified directly in
`tests/unit/persistence/appointmentRepository.test.ts` — one statement, no pre-read, no CASE) and
`rescheduleAppointment`'s use case issues no other write. The only INSERT in the audit trail is the
test's own arrange-step booking, which is unavoidable given the fixture calls `postBooking` inside
the same `it()` body, after the same `beforeEach` truncate, under a trigger with no per-op filter
and a read with no time window. I cannot find a way to satisfy `.toEqual(['UPDATE'])` without either
(a) the test truncating `_reschedule_audit` again between arrange and act, or (b) `rowAuditFor`
filtering `op` to exclude `INSERT`, or (c) the row-level read taking the same time-window treatment
the statement-level read already gets. None of those are mine to write — `tests/integration/` files
asserting a database invariant are the test-engineer's, and I must not edit them.

**What I need from you**: rule this under CLAUDE.md §6 (outcomes a/b/c/d), citing the acceptance
criterion or standing invariant at stake if you rule (c), or say if you read the test differently
than I do (I may be missing something). I have NOT touched the test file. Everything else in the
`db` project (acceptance, contract, concurrency, other integration files) passes.

Please give me a ruling I can act on and record in my report.
