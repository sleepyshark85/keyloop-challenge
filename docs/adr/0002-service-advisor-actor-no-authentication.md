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

The brief says only *"Allow a user to request a service appointment"*. It never says who the user is,
and the two plausible readings produce different APIs — not different implementations of the same API.

- **Service advisor on behalf of a customer.** The caller is dealership staff, typically on the phone
  to the customer. `customer_id` is a field in the request body, because the caller is not the
  customer. The rule *"this vehicle belongs to this customer"* is then a **validation** rule about the
  consistency of the payload, and its failure is a client error in the same family as "unknown
  service type".
- **Customer self-service.** The caller is the vehicle owner. `customer_id` must *not* be in the body —
  taking it from the body would be the vulnerability — and instead comes from an authenticated
  identity. The same ownership rule becomes an **authorisation** control: its failure is a `403`, it
  must not leak whether the vehicle exists, and it needs an audit trail.

The same sentence in the domain therefore lands either in the validation layer or in a security
boundary, depending on an answer the brief does not give. This is a scope and acceptance-criteria
question, which `CLAUDE.md` §6 reserves to the human.

There is a second force. `CLAUDE.md` §1 and TC-5 stub the client layer entirely: there is no UI, only
an OpenAPI contract and a cURL harness. A stubbed client cannot hold a session, and building an
identity provider to authenticate a client that does not exist would spend the scarce review budget
(OC-3) on the least interesting part of the system.

## Considered options

- **Option A — Service advisor, no authentication.** The caller is trusted. `customer_id` travels in
  the request body; ownership is validation. No tokens, no sessions, no per-actor audit.
  *(The architect's recommendation.)*
- **Option B — Customer self-service with authenticated identity.** Identity arrives with the request
  (bearer token or session); `customer_id` is derived from it and rejected if supplied in the body.
  Ownership becomes an authorisation control.
- **Option C — Service advisor, with a shared API key or token on the boundary.** Authentication of
  the *calling system* without modelling users, so the contract shows a security scheme but no
  authorisation logic exists.

## Decision

Chosen option: **Option A — service advisor, no authentication**, because the actor the brief's
wording best supports is dealership staff replacing a paper diary and a phone call (§3.1.2), and
because a security control built against a stubbed client would be unverifiable theatre in a
submission graded on verifiability (§1.2 goal 2).

Concretely:

- **`customer_id` travels in the request body**, alongside vehicle, service type, dealership and
  desired start. The same holds for cancellation and rescheduling (ADR-0003).
- **Ownership is a validation rule, not a security control.** *"The vehicle must belong to the named
  customer"* is checked, and its failure is a `4xx` client error carrying a plain reason, in the same
  family as an unknown dealership id (A-6). It deliberately does **not** behave like an authorisation
  failure: no `403`, no deliberate ambiguity about whether the vehicle exists, no audit event.
- **The caller is trusted.** The stubbed client layer stands in for an authenticated front end that a
  real deployment would put in front of this service. The OpenAPI document publishes **no security
  scheme**, so the absence is explicit in the contract rather than merely unimplemented.
- **Authentication, authorisation, sessions, rate limiting and per-actor audit are out of scope**
  (§3.3) and are carried in §11 as debt, with the note that the change is not additive: it moves the
  ownership rule from validation into a security boundary and changes its observable failure mode.

## Consequences

**Good**

- The API is fully exercisable by cURL with no credential ceremony, which is what makes the harness a
  usable demonstration artifact for an assessor under time pressure (TC-5).
- Every `4xx` on the booking path is about the *domain* — unknown reference, mismatched ownership,
  outside opening hours (ADR-0001), or contention (ADR-0004) — so the error taxonomy stays legible.
- The customer is not an actor, which keeps §3.1's boundary to two human roles and one store.
- No security mechanism is claimed that is not tested. Nothing in the submission asserts a protection
  it does not have.

**Bad, or deferred**

- **The service is unsafe to expose.** Anyone who can reach it can book on any customer's behalf,
  read any appointment, and cancel any booking. This is acceptable only because the deployment is a
  single local container (§7) and must be stated plainly in §11 rather than softened.
- Retrofitting authentication is not purely additive: the ownership check moves layer, its status code
  changes from a validation `4xx` to `403`, and its response body must stop distinguishing
  "not yours" from "does not exist". Any test asserting the current shape will need revising.
- There is no actor on an appointment record — no "booked by" — so the audit question ("who cancelled
  this?") cannot be answered at all. If cancellation disputes matter, this is the first thing to add.
- Rate limiting is absent, so the retry loop of ADR-0004 has no per-caller ceiling above its
  per-request bound.

## Pros and cons of the options

### Option A — Service advisor, no authentication

- Good, because it matches the brief's framing — replacing a *manual* booking process run by staff
  (§3.1.2) — rather than inventing a consumer product the brief never describes.
- Good, because it keeps `customer_id` an ordinary field, so the booking request stays a single
  self-describing payload that the OpenAPI contract fully documents.
- Good, because it spends no review budget on a mechanism the assessment does not grade.
- Bad, because the resulting service could not be deployed anywhere reachable, and says so.
- Bad, because "ownership is validation" is a decision that quietly hardens: the longer tests assert
  its failure shape, the more a later move to `403` costs.

### Option B — Customer self-service with authenticated identity

- Good, because it is the only reading under which the service is safe on its own, and the ownership
  rule sits where a security reviewer would expect it.
- Good, because it would force an explicit answer to "what may this caller see?", which a real system
  needs.
- Bad, because it requires an identity provider, token issuance and a session story for a client that
  is deliberately stubbed — mechanism with no counterpart to exercise it.
- Bad, because the interesting risk in this system is concurrent resource allocation, and every hour
  spent on authentication is an hour not spent making that provable. It would trade a graded goal
  (§1.2 goals 1 and 2) for an ungraded one.

### Option C — Service advisor with an API key or token on the boundary

- Good, because the contract would show a security scheme, which looks more production-shaped.
- Bad, because it authenticates nobody in particular: with a single shared credential, ownership stays
  validation and no authorisation decision becomes possible, so the security posture is unchanged.
- Bad, because it adds friction to the cURL harness while providing no property any test could
  meaningfully assert. It is the option that most looks like security and least is.
