---
id: "05"
title: Cancellation — and the proof at the edge that both constraints release
status: done
depends_on: ["04"]
arc42: ["§5.2", "§6.1", "§6.4", "§6.6", "§8.6", "§10", "§11"]
                     # §6.6 and §8.6 added at step 2, §6.1 at step 7. §6.2, §6.3 and §6.5 took
                     # pointer-only edits to pay the budget ratchet for the additions.
adr: [3, 24]
quality_scenarios: [QS-7]
loopbacks: 0
gate: light          # human cost ruling 2026-09-05; revoked by any open MAJOR/BLOCKING
                     # step 5: REVOKED — seven open MAJORs
---

## Goal

`POST /appointments/{id}/cancellation` moves an appointment to `cancelled`, and the slot it held becomes
bookable again. A sub-resource rather than `DELETE`, because the appointment stays readable at its URL
afterwards, which `DELETE` would misdescribe.

The schema slice already proved a cancelled row releases the **bay**, definitionally and behaviourally.
What AC-1 adds is the **technician** side, which nothing else asserts, plus an attribution: the candidate
list carries no availability filter, so it is identical before and after the cancel, and the only thing
that moved between the `409` and the `201` is the constraint's verdict.

## Acceptance criteria

- **AC-1** — Given appointment A confirmed `[09:00, 10:00)` in the only bay, and a second booking for
  that interval refused with `409`, when A is cancelled, then the same booking **succeeds**. *(QS-7)*
- **AC-2** — Given A has been cancelled, when `GET /appointments/{id}` is requested, then `200` is
  returned with `status: cancelled` — it is not a `404`.
- **AC-3** — Given A has been cancelled, when it is cancelled again, then `200` is returned and
  nothing changes. Cancellation is idempotent. Asserted in **two places**, because one cannot reach
  it: the contract test takes the `200` and the identical body; the integration test takes whole-row
  equality across the replay, which is the only assertion that distinguishes the designed statement
  from the `updated_at = now()` it rejects.
- **AC-4** — Given an unknown id, when cancellation is requested, then `404` with
  `type=/problems/appointment-not-found`.
- **AC-5** — Given `Content-Type: application/json` with **no body**, and given the same header with
  an **unparseable** body, when either request is made to the cancellation route **or to
  `POST /appointments`**, then `400` with `type=/problems/malformed-request` — not the `500` returned
  today. The taxonomy gains no row for it. *Added at step 2, measured twice and independently by both
  reviewing roles. Step 5 keeps two thirds of it: two further responses are measured still outside
  the taxonomy and are ruled into the reschedule slice.*

## In scope

- The cancel route, use case and `UPDATE`.
- **`src/http/server.ts`** — AC-5's one predicate. The only line here that changes behaviour on an
  already-merged route, which is why the gate must exercise it.
- `tests/integration/cancellation-releases-slot.test.ts`, and
  `tests/concurrency/cancellation-takes-no-lock.test.ts`, respecified at step 2 so it can fail for the
  reason it exists: the discriminating case holds the bay's advisory lock in a second session, with a
  booking control and a release witness.
- **Two controls added at step 5**, both deferred into this slice by an earlier ruling and neither built.
  **The fourth cell of the exclusion-constraint adjudication matrix** — constraint dropped, each racing
  insert wrapped in the two advisory locks written out by hand, expecting **twenty overlapping rows**: the
  one sentence the matrix cannot otherwise say, *the lock cannot replace the constraint*. And **one unit
  case proving the response schema is an output whitelist**, stubbing the read with a view carrying an
  undeclared member and asserting the `200` body carries exactly the ten schema members.

## Out of scope

- Cancellation windows, fees, notification, or any record of *who* cancelled. This system has no actor
  and no audit trail; arc42 §11.3 carries that.
- Restoring a cancelled appointment — a fresh booking is the path back.
- **Making the lock a value the write must take**, so *"correctly exempt"* cannot read like *"forgot the
  lock"*. **Owned by the reschedule slice**, which writes a new locking path and so makes the control
  stronger rather than merely later.
- **An empty body on a route that reads no body answering `200` rather than `400`.** Re-routed at step 5
  to the close-out slice.
- **A handler for unmatched routes and the `404 /problems/route-not-found` row.** Ruled here and built at
  the reschedule slice: registering it breaks the media-type half of AC-4's vacuity guard, and this step
  has no test-engineer round left to re-derive it.

## Definition of done

Beyond `CLAUDE.md` §10:

- The freed-slot assertion books **through the API** rather than inserting directly, so it proves the
  released slot over allocation, retry and the constraint's verdict rather than at the SQL level.
- **The step-7 arc42 edits were ruled at step 5, so step 7 executed rather than decided.** §6.1 was added
  to the declaration at step 7, the adjudication matrix's fourth cell having been built here: what was
  claimed as measured from the booking slice was only argued until this slice ran it.
