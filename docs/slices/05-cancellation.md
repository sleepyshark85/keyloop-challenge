---
id: "05"
title: Cancellation — and the proof that the predicate is live through the allocator
status: ready
depends_on: ["04"]
arc42: ["§5.2", "§6.4", "§6.6", "§8.6", "§10", "§11"]   # §6.6 and §8.6 amended at step 2
adr: [3, 23]
quality_scenarios: [QS-7]
loopbacks: 0
gate: light          # human cost ruling 2026-09-05; revoked by any open MAJOR/BLOCKING
                     # step 2: stands, with AC-5's `server.ts` line named as a must-exercise
---

## Goal

`POST /appointments/{id}/cancellation` moves an appointment to `cancelled`, and the slot it held
becomes bookable. A sub-resource rather than `DELETE`, because the appointment remains readable at
its URL afterwards — which `DELETE` would misdescribe.

This is the only slice that exercises `WHERE (status <> 'cancelled')` **through the allocator**.
Slice 00 already guards the clause definitionally and behaviourally on the bay side; what is
unproven is that candidate allocation re-derives a pair over a cancelled row — a mutant in
TypeScript, not in SQL. (`05-design.md` §1, corrected at step 2 by measurement.)

## Acceptance criteria

- **AC-1** — Given appointment A confirmed `[09:00, 10:00)` in the only bay, and a second booking for
  that interval refused with `409`, when A is cancelled, then the same booking **succeeds**. *(QS-7)*
- **AC-2** — Given A has been cancelled, when `GET /appointments/{id}` is requested, then `200` is
  returned with `status: cancelled` — it is not a `404`.
- **AC-3** — Given A has been cancelled, when it is cancelled again, then `200` is returned and
  nothing changes. Cancellation is idempotent (§8.6). Asserted in **two places**, because one cannot
  reach it: the contract test takes the `200` and the identical body; the integration test takes
  `to_jsonb(appointment)` equality across the replay, which is the only assertion that distinguishes
  the designed statement from the `updated_at = now()` it rejects. *(A-05-1, amended at step 2.)*
- **AC-4** — Given an unknown id, when cancellation is requested, then `404` with
  `type=/problems/appointment-not-found`.
- **AC-5** *(added at step 2 — measured twice, independently, by both reviewing roles)* — Given
  `Content-Type: application/json` with **no body**, and given the same header with an **unparseable**
  body, when either request is made to the cancellation route **or to `POST /appointments`**, then
  `400` with `type=/problems/malformed-request` is returned — **not** the `500 /problems/internal`
  returned today. §8.6's taxonomy claims totality and gains no row; this is that claim being kept.

## In scope

- The cancel route, use case and `UPDATE`.
- **`src/http/server.ts`** — AC-5's one predicate. The only line in this slice that changes behaviour
  on an already-merged route, which is why the gate must exercise it.
- `tests/integration/cancellation-releases-slot.test.ts`.
- `tests/concurrency/cancellation-takes-no-lock.test.ts` — a scope ruling, **respecified at step 2**
  so it can fail for the reason it exists: the discriminating case holds the bay advisory lock in a
  second session, with a booking control and a release witness (`05-design.md` §5).

## Out of scope

- Cancellation windows, fees, notification, or any record of *who* cancelled — ADR-0002 puts actors
  and audit out of scope, and §11 carries it.
- Restoring a cancelled appointment. Not in the brief; a fresh booking is the path back.
- **F-05-1's structural remedy** — a branded `ResourceLock` on `insertAppointment`. Ruled at step 2
  and **owned by slice 06**, which writes a new locking path and so makes the control stronger rather
  than merely later (ADR-0019). Until then the rule is enforced by review, stated as such.
- **Empty body on a bodyless route answering `200` rather than `400`** — OQ-05-2, deferred to slice
  10, where the cURL harness is the real client that emits the header.

## Definition of done

Beyond `CLAUDE.md` §10:

- The freed-slot assertion books through the API rather than inserting directly, so it proves the
  predicate **through the allocator** rather than at the SQL level slice 00 already covered.
- **Step-7 arc42 edits, ruled now so step 7 executes rather than decides:** §6.4 takes D1's statement
  and the sentence that a replay advances `xmin` while changing no column; §6.6 gains one sentence on
  its **two** rows reading *"the `UPDATE`'s 0 rows"* — slice 05 makes the first unambiguous, and the
  second is slice 06's, where a guarded `WHERE id = $1 AND status = 'confirmed'` reproduces exactly
  the ambiguity D1 rejects and needs the follow-up read §6.3 already names; §5.2 loses its prediction
  of `src/domain/appointment.ts`; §11 gains F-05-1 (with its remedy and slice), OQ-05-2, and F-02-9's
  narrowed wording.
