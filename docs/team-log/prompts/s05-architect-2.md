# Prompt · slice 05 · architect · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 05 step 2 adjudication
- Sent: 2026-09-06T09:02:29.182Z

---

Slice 05 step 2 adjudication. Branch `slice/05-cancellation`. Nine objections across both roles, and **two of them falsify claims in your own design by measurement**. §6 is NON-NEGOTIABLE here: **reply before you edit.** One verdict per objection, AGREE or DISAGREE, reasoning stated, the exact change named but not made. Then one amendment pass with the rulings attached. Judge the finding and the remedy separately — accepting a problem is real while taking a narrower remedy is a legitimate and common outcome, and you have done it well three times.

Both roles logged their findings; read `docs/team-log/events.jsonl` for the test-engineer's T-05-1…T-05-6. The implementer's are below.

---

## The two that falsify the design

**T-05-1 (MAJOR) — §1's central claim is false, measured.** You wrote that the predicate has one guard, AC-1, and that the mutant lives in a `.sql` file Stryker cannot reach. It has two, both committed in `tests/integration/exclusion-constraints.test.ts`: `EXPECTED_CONSTRAINT_DEFS` (lines 105–112) pins `pg_get_constraintdef` by **string equality** for `no_bay_overlap` *and* `no_technician_overlap`, predicate included, compared at line 362 — so every drop-one and drop-both variant already dies with no behavioural inference; and case AC-4 (line 605) is already the before/after pair, titled *"the predicate is live and not decorative"*. **I verified both myself.** The test-engineer's reframing is better than the claim it replaces: AC-1's real increment is a behavioural *technician-side* guard, and proof the predicate is live **through the allocator** — slice 00 inserts a hand-chosen pair; AC-1 proves candidate allocation re-derives one over a cancelled row, which is a TypeScript mutant Stryker *can* reach. Note the knock-on: D4's revocation clause rates "AC-1 passing vacuously" MAJOR *because* AC-1 was the sole guard.

**T-05-2 (MAJOR) — the concurrency file cannot fail for the reason it exists.** Its assertion set is invariant under the mutation it detects: only the cancel is exempt, bookings still lock, so ADR-0023's *rejected* Option A yields an identical observable. It cites `no-spurious-refusal.test.ts`'s own standard — an absence assertion needs a positive witness. Proposed remedy: hold the bay advisory lock in a second session with ADR-0018's key derivation and require the cancel to return `200` within a deadline (2 ms vs blocks-indefinitely, not timing-flaky), **plus a non-optional control** that a *booking* for that bay must block under the same held lock — without which a changed key derivation makes the cancel assertion vacuous.

**T-05-3 (MAJOR)** — ADR-0023's `iff` outruns its evidence: M1–M3 measure one statement alone in its transaction, the rule is universally quantified, and the argument that carries it (*the wait is one-directional*) is a property of the transaction, not the row version. Slice 06's atomic move is the multi-statement case the rule invites you to reason about in halves. Also flags that "the row version it writes" is ambiguous for an `UPDATE`, since M1 is about the *old* version's disappearance. Accepts the forward direction; objects to the converse's generality. Remedy: scope the rule to a statement alone in its transaction — or, since ADR-0023 is accepted-but-provisional-until-gate, narrow it as you narrowed ADR-0021.

**T-05-4 / T-05-5 / T-05-6** are in the log. T-05-5 refuses to sign off on three `src/` claims it may not read, calling that "deference wearing verification's clothes" — it disagrees with the claim while agreeing with the design. T-05-6 says AC-3 cannot be a contract assertion at all, because `updated_at` reaches neither the projection nor the response body.

---

## The implementer's three

**OBJ-1 (MAJOR) — a bodyless `POST` with `Content-Type: application/json` returns `500 /problems/internal` today.** Measured on Fastify 5.12.1 against `server.ts`'s handler verbatim:

```
no content-type, no body                -> 200
content-type json, no payload           -> 500  /problems/internal
content-type json, empty string payload -> 500  /problems/internal
bad uuid param                          -> 400  /problems/malformed-request
```

`FST_ERR_CTP_EMPTY_JSON_BODY` carries `statusCode: 400` but `validation === undefined`, so it misses the validation arm and falls to the catch-all. `FST_ERR_CTP_INVALID_JSON_BODY` does the same on the existing booking route; the contract test only ever sends parseable JSON of the wrong shape, which is why neither was caught. At stake: §8.6's `400 /problems/malformed-request` row and the `500` row's own rationale — *"a 4xx would tell a service advisor to correct something they did not send and cannot see"* — which is exactly inverted here. **A cancel has no body, so this is the correct client's shape, not a malformed one.** `tests/support/booking.ts:442`'s `postBooking` sets that header, so the test-engineer will copy it. Remedies offered: rule both CTP codes to `400`; or empty-body only now with invalid JSON as a (b); or rule it out of slice 05 and record it in §11 — **but rule it before step 3.** This converges with T-05-4 from the opposite direction; two roles found it independently.

**OBJ-2 (MAJOR) — F-05-1's only mitigation is a docblock, and ADR-0023's Consequences contradict themselves**: *"F-02-9 becomes a rule with a test rather than an instruction to remember"* against *"the rule is enforced by review."* The QS-12 marker route is unavailable and the reason is worth your attention: markers are **file-granular** (`PERMITTED_FILE` asserts exactly one file under `src/`), and both write functions live in `appointmentRepository.ts` — splitting the file would break `appointment-table-access`, which is AC-5's mechanism. Remedy: `lockResources` returns a branded `ResourceLock` that `insertAppointment` takes as a parameter — type-only, erased, one cast at one site, the ADR-0016 shape. "Forgot the lock" becomes a compile error; "correctly exempt" becomes a signature that does not ask for one. It states the residue honestly (it does not prove the keys match the row). Narrower: defer the witness to slice 06 but record it now as F-05-1's ruled remedy. Named failure if not: an in-scope write skipping the locks reproduces ADR-0018's 285/400, which `classify` maps to `no-verdict` and the route to `500`, breaking slice 02's AC-3/AC-4.

**OBJ-3 (MINOR) — AC-3's binding half is unfalsifiable as scoped.** A-05-1 rules AC-3 to mean "no column changes **and** the response body is identical". The body half is satisfied by *any* implementation including the plain `now()` you rejected, since `updated_at` is in neither `AppointmentRow` nor `AppointmentView`. A compiled-SQL unit test kills the mutant but asserts the implementation back at itself. **This is the argument your own §4 used to exclude `src/domain/appointment.ts`, applied to the `CASE`.** Remedy: state that the integration test reads `updated_at` before and after the replay — or rule AC-3 to mean the response body only and ship the plain `now()`, in which case the `CASE` is complexity with nothing to justify it. Either is accepted; what is objected to is the `CASE` *plus* nothing that can distinguish it.

**Agreed by the implementer, verified against real PostgreSQL 16.15:** D1 (first cancel `UPDATE 1`, replay `updated_at` identical but `xmin` 739→740, unknown id `UPDATE 0`, re-book `23P01` then `INSERT 0 1`); D3's zero-production-lines claim, checked against the code it owns; and the omission of `src/domain/appointment.ts`, unreservedly, having written out what it would have held. It also measured that PG 16 has no `OLD` in `RETURNING` (arrives in 18), so `RETURNING status` cannot distinguish a first cancel from a replay — the one-token form that can is `RETURNING (updated_at = now()) AS just_cancelled`.

---

**Also decide these, which the reports raise and nobody has ruled:**

- §6.6's table has **two** rows reading "the `UPDATE`'s 0 rows" — `404 unknown id` and `409 appointment not confirmed`. Slice 05 makes the first true; the second is slice 06's, where a guarded `WHERE id = $1 AND status = 'confirmed'` reproduces exactly the ambiguity D1 rejects. Worth a sentence so slice 06 inherits the problem rather than the sentence.
- The replay writes a new row version (`xmin` advances) though no column changes. "Changes no column" is true; "writes nothing" is not, and a reader may take the second from the first.
- `main.ts` gains a wiring line, and `main.ts` is excluded from mutation — so that line is guarded by the acceptance test or by nothing, which is this project's most-counted defect shape. The implementer named it rather than letting anyone claim otherwise.

**Constraints.** Max 2 loopbacks; you are at 0. Under the standing delegation nothing escalates. Word budgets enforced — design ceiling 3,000, currently 1,633. ADR-0023 is accepted but **provisional until this slice's gate**, so narrowing it before the gate is available to you exactly as it was for ADR-0021; editing an accepted ADR outside that window is not. `docs:adr-check -- --pin <file>` now exists — F-04-1 is fixed, so registering a new ADR is a 3-line diff and you no longer need to hand-edit the baseline or commit outside your brief.

**Report:** the nine verdicts with reasoning, what you amended, and separately anything the round did not ask about.
