---
id: "0024"
title: The error taxonomy's residual is a property, not a row
status: accepted
date: 2026-09-06
supersedes: null
superseded_by: null
arc42: ["§8.6", "§10"]
contested: true

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: reviewer
decided-by: architect
ai-input: >
  RAISED AS A DCR by the reviewer at slice 05 step 5 and RULED BY THE ARCHITECT under the human's
  standing delegation, the human being absent. PROVISIONAL until slice 05's gate.
  Both escapes below were measured against the real `buildServer`, by the reviewer and again
  independently here; the second probe's output is quoted rather than paraphrased.
---

## Context and problem statement

§8.6 opens *"Errors are RFC 9457 `application/problem+json`, with a stable `type` per failure"*, and
§10 indexes QS-11 as *"every failure has one status and one problem type."* The table's last row is
`500 | /problems/internal | Reference data the client cannot see or correct, **and anything else**`.

That row is two things at once: a described failure class with four named reference-data faults and a
`40P01`, and an unrestricted catch-all. The catch-all makes the totality claim unfalsifiable. AC-12
sweeps ∀rows ∃input; the property actually at risk is **∀responses ∃row**, and no reachability sweep
can falsify a catch-all's *fitness* — which is why T-05-7, as written, can never block.

Two responses escape, both measured:

- `POST /appointments` with `content-type: application/xml` → `500 /problems/internal`
  (`FST_ERR_CTP_INVALID_MEDIA_TYPE`, `statusCode: 415`). I-05-6. Conformant under the catch-all, and
  the exact inversion AC-5 was added to correct: the client sent a header it can see and can fix.
- `GET /nope` → **`404 application/json; charset=utf-8`**, body
  `{"message":"Route GET:/nope not found","error":"Not Found","statusCode":404}` — **no `type` member
  at all.** No `setNotFoundHandler` is registered, so it never reaches `setErrorHandler`. It collides
  on `404` with `/problems/appointment-not-found` and carries nothing to disambiguate it.

## Considered options

- **A — keep the catch-all**, and close T-05-7 as misframed.
- **B — split the row, register a not-found handler, and assert the residual in the falsifiable
  direction.**
- **C — reuse `/problems/appointment-not-found` for an unrouted path.**
- **D — widen the `400` predicate in `server.ts` to `statusCode < 500`.**

## Decision

Chosen option: **B**, in four parts.

1. **§8.6's `500` row is a described class.** *"and anything else"* is struck. It covers the four
   reference-data faults and `40P01`, which is what QS-11 already reaches end-to-end.
2. **The residual is an invariant stated beneath the table, not a member of it:** *every response
   this service emits with status ≥ 400 is `application/problem+json` and carries a `type` from the
   closed set.* An input that reaches the fallback handler renders as `/problems/internal`. A
   response that does neither is a **defect**, not a taxonomy member — which is the whole difference.
3. **`setNotFoundHandler` brings the second exit inside the taxonomy**, with a new row:
   `404 /problems/route-not-found`. Distinct from `/problems/appointment-not-found` because the two
   share a status, and separating a URL typo from a missing resource is the one thing a client cannot
   do without the `type`.
4. **The invariant is asserted in the direction that can fail:** a fixed corpus of hostile requests —
   unrouted path, unsupported media type, unparseable body, wrong verb, empty body — each response
   asserted `application/problem+json` with a `type` in the closed set. `tests/contract/`, the
   test-engineer's.

**It lands at slice 06 step 1, not here** — and the decisive reason is not cost. `setNotFoundHandler`
**breaks an assertion this slice committed red.** `cancel-appointment.test.ts:247` closes AC-4's
vacuous-green trap by discriminating on the media type *and* the `type` member, precisely because
Fastify's default `404` carries neither; its comment quotes that body verbatim. Register the handler
and the media-type half stops discriminating — only `route-not-found` ≠ `appointment-not-found` still
does. Doing that at step 5, with no test-engineer round left, would silently degrade an acceptance
test by fixing a defect. Slice 06 has that round, already declares §8.6, and grows the taxonomy
anyway. That satisfies ADR-0019's criterion — and, this being the finding that produced R-05-2, the
deferral is written into `06-reschedule-atomic-move.md` rather than only into this record.

## Consequences

**Good**

- T-05-7 becomes blockable. The sweep it named certifies absence and therefore cannot; the corpus
  can only find defects, and found two in one twenty-line run.
- QS-11's opening sentence becomes something a test asserts rather than something the table assumes.

**Bad, or deferred**

- Between this record and slice 06 the service ships a **known** second exit, while `server.ts`'s
  docblock — rewritten in this very slice — asserts §8.6's totality *"is kept"* there. The docblock is
  `src/`, so the correction ships with the handler. Debt, named as such.
- §8.6 gains the `route-not-found` row at slice 06's step 7 and not before, so this record is briefly
  the only place it exists. Deliberate: a taxonomy row with no handler behind it is the inversion this
  ADR is about.
- The corpus is still a list somebody wrote. What changed is its direction, not its completeness.
- **AC-4's vacuity guard must be re-derived when the handler lands**, per the Decision. The gap this
  record closes is not unknown to `tests/` — it is *load-bearing* there, as a discriminator. That is
  the sharpest form of the finding: a defect a test depends on.
- `src/http/problem.ts` renders every row and sits at **exactly §10's 0.75 threshold**, three
  survivors. Slice 06 changes it twice — this row and `appointment-not-confirmed` — so one new
  survivor fails its Definition of Done. Named in slice 06's inherited scope as a warning rather than
  left as a surprise.

## Pros and cons of the options

### A — keep the catch-all

- Good, because the taxonomy is then total by construction and costs nothing to maintain.
- Bad, because totality by construction is unfalsifiable, and it certifies as conformant a `404`
  carrying no `type` — which contradicts §8.6's own opening sentence and QS-11's index line.

### B — split and register the handler

- Good, because it separates the claim that can be checked from the promise that cannot, and both
  measured escapes become failures rather than members.
- Bad, because it adds a taxonomy row and a corpus to maintain, and it lands a slice later than the
  measurement.

### C — reuse `appointment-not-found`

- Good, because no row is added and the response is inside the taxonomy immediately.
- Bad, because it collapses precisely the distinction QS-11 exists to protect: two unrelated failures
  behind one status *and* one `type`, and a client that retries a typo as a missing appointment.

### D — widen the `400` predicate

- Good, because it is one line and closes the 415 case.
- Bad, because `server.ts` already records a broader disjunction deleted after mutation for reaching
  no second input; because 415 is not a malformed request and would be misdescribed; and because it
  cannot reach the not-found path at all, which never enters the error handler.
