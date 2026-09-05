---
id: "0002"
title: Treat the service advisor as the actor and leave authentication out of scope
status: accepted
date: 2026-09-03
supersedes: null
superseded_by: null
arc42: ["§1.3", "§1.4", "§2.4", "§3.1", "§3.2", "§3.3", "§11"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  ACCEPTED as recommended. The architect recommended OQ-2 be answered "service
  advisor, no authentication", with customer_id carried in the request body and
  ownership treated as validation rather than as a security control. The human
  accepted it unchanged, including its condition that §3.3 must name authentication
  and authorisation as out of scope, since that is a scope statement only the human
  can ratify.
---

## Context and problem statement

The brief says only *"Allow a user to request a service appointment"*, and the two readings of
"user" produce different APIs — not two implementations of one:

- **Service advisor on behalf of a customer.** The caller is dealership staff, typically on the
  phone, so `customer_id` is in the request body and ownership is a **validation** rule.
- **Customer self-service.** The caller is the vehicle owner. `customer_id` must *not* be in the body
  — that would be the vulnerability. It comes from an authenticated identity, so ownership becomes
  an **authorisation** control: a `403`, audited, leaking nothing about the vehicle.

The same sentence lands either in validation or in a security boundary, on an answer the
brief does not give — a scope question `CLAUDE.md` §6 reserves to the human. TC-5 also stubs the
client layer, and a stubbed client cannot hold a session.

## Considered options

- **Option A — Service advisor, no authentication.** The caller is trusted.
  *(The architect's recommendation.)*
  - Good, because it matches the brief's framing — a *manual* process run by staff (§3.1.2).
  - Good, because it keeps `customer_id` an ordinary field
  - Good, because it spends no review budget
  - Bad, because the resulting service could not be deployed anywhere reachable
  - Bad, because "ownership is validation" is a decision that quietly hardens
    — the longer tests assert its failure shape, the costlier a later `403`.
- **Option B — Customer self-service with authenticated identity.** Identity arrives with the
  request; `customer_id` is derived from it, not read from the body.
  - Good, because it is the only reading under which the service is safe on its own
  - Good, because it would force an explicit answer to "what may this caller see?"
  - Bad, because it requires an identity provider, token issuance and a session story
    for a deliberately stubbed client — mechanism with no counterpart.
  - Bad, because the interesting risk in this system is concurrent resource allocation
    — it trades a graded goal (§1.2 goals 1 and 2) for an ungraded one.
- **Option C — Service advisor, with a shared API key or token on the boundary.** Authentication of
  the *calling system* without modelling users.
  - Good, because the contract would show a security scheme
  - Bad, because it authenticates nobody in particular
    — one shared credential leaves ownership as validation, so the posture is unchanged.
  - Bad, because it adds friction to the cURL harness
    while providing no property any test could assert.

## Decision

Chosen option: **Option A — service advisor, no authentication**, because the actor the brief's
wording best supports is dealership staff replacing a paper diary (§3.1.2), and because a control
built against a stubbed client would be unverifiable theatre (§1.2 goal 2).

- **`customer_id` travels in the request body**, alongside vehicle, service type, dealership and
  desired start; likewise for cancellation and rescheduling (ADR-0003).
- **Ownership is a validation rule, not a security control.**
  Its failure is a `4xx` with a plain reason (A-6), deliberately **not** an authorisation failure:
  no `403`, no studied ambiguity about the vehicle, no audit event.
- **The caller is trusted.** The stubbed client layer stands in for an authenticated front end
  a real deployment would put in front. The OpenAPI document publishes **no security scheme** —
  the absence is explicit.
- **Authentication, authorisation, sessions, rate limiting and per-actor audit are out of scope**
  (§3.3), carried in §11 as debt; the change is not additive.

## Consequences

**Good**

- The API is fully exercisable by cURL with no credential ceremony
  — what makes the harness usable under time pressure (TC-5).
- Every `4xx` on the booking path is about the *domain*
  — unknown reference, mismatched ownership, opening hours (ADR-0001), contention (ADR-0004).
- The customer is not an actor, which keeps §3.1's boundary to two human roles
- No security mechanism is claimed that is not tested.

**Bad, or deferred**

- **The service is unsafe to expose. Anyone who can reach it can book on any customer's behalf**,
  read any appointment, cancel any booking. Acceptable only at §7's single local container;
  stated plainly in §11.
- Retrofitting authentication is not purely additive: the ownership check moves layer
  and its status code becomes `403`; its body must stop distinguishing "not yours" from
  "does not exist".
- There is no actor on an appointment record — no "booked by"
  — so "who cancelled this?" cannot be answered.
- Rate limiting is absent, so the retry loop of ADR-0004 has no per-caller ceiling
