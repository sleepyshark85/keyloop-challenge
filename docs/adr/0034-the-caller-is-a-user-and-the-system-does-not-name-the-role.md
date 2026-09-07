---
id: "0034"
title: The caller is "a user" and the system does not name the role; authentication is out of scope because the client is stubbed
status: accepted
date: 2026-09-07
supersedes: "0002"
superseded_by: null
arc42: ["§1.3", "§1.4", "§2.4", "§3.1", "§3.3", "§11", "§12"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: human
decided-by: human
ai-input: >
  RAISED AND DECIDED BY THE HUMAN, who audited the trace, read the brief and found that
  "service advisor" appears about eighty-five times across the documentation and nowhere
  in Requirements.md. Asked how far to take it, the human ruled: unname the actor
  everywhere. The architect proposed nothing and executed. Its one contribution is in the
  Decision below — that the superseded record bundles two decisions, only one of which the
  brief supports, and that the argument for the supportable half was already inside it.
---

## Context and problem statement

A request arrives to book a car in. Someone sent it, and everything that happens next turns on
whether that someone may be trusted with a customer's id. The brief never says who they are. Its
words are *"Allow a user to request a service appointment"*.

An earlier ruling read *a user* as dealership staff taking a phone call, and drew two conclusions
from that reading at once: **who the actor is**, and **that authentication is out of scope**. The
second is right. The first is not in the brief, and it costs something — naming staff imports a
business model into a system that never observes the difference. Nothing in the schema, the API or
the invariant changes if the person holding the phone is the car's owner.

The reading is also unnecessary. The record that made it already carries the argument that does not
depend on it: *a control built against a stubbed client would be unverifiable theatre*. That rests on
the client layer being stubbed by constraint — a fact about what was built — rather than on an
inference about who uses it.

## Considered options

- **Option A — keep the reading.** The caller is dealership staff, and no authentication follows from
  staff being trusted.
  - Good, because a named actor makes "no authentication" feel obviously safe
  - Bad, because the brief does not license it, while a corpus that says the term eighty-five times
    reads as though it did
  - Bad, because it narrows the product for a gain no test can see
- **Option B — take the other reading.** The caller is the vehicle owner; identity arrives with the
  request and ownership becomes a security boundary.
  - Good, because it is the only reading under which the service is safe on its own
  - Bad, because it builds an identity provider for a client that is deliberately stubbed
  - Bad, because it is exactly as unlicensed as A: the brief chooses neither
- **Option C — name no role.** The caller is *a user*, and the trust decision rests on the stubbed
  client. **Chosen.**
- **Option D — Option C, plus a shared API key on the boundary.**
  - Good, because the contract would then publish a security scheme
  - Bad, because one shared credential authenticates nobody in particular, so ownership stays
    validation and the posture is unchanged

## Decision

Chosen option: **C.**

1. **The system does not name the human behind the request.** Documentation says *a user* or *the
   caller*. Both readings stay open, and nothing built here forecloses either.
2. **Authentication, authorisation, sessions, rate limiting and per-actor audit stay out of scope, on
   the stubbed-client argument.** A credential check in front of a caller nobody has built is a
   mechanism no test can exercise. That holds whoever is holding the phone.
3. **`customer_id` travels in the request body. Unchanged.**
4. **Ownership is a validation rule, not a security control. Unchanged** — its failure is a `4xx`
   with a plain reason, deliberately not a `403`, with no studied ambiguity about the vehicle and no
   audit event.
5. **No schema, endpoint, status code or test moves.** What is superseded is a reading, not a
   mechanism.

## Consequences

**Good**

- Every claim the documentation makes about the actor now traces to a word in the brief
- The scope statement stands on evidence rather than on an inference, and is the stronger for it
- The product is not narrowed to one deployment shape by a sentence nobody had to write

**Bad, or deferred**

- **What is given up is the intuition.** *Staff behind a counter* is what made "no authentication"
  feel obviously safe; without it a reader may reasonably ask why there is none. The stubbed-client
  argument is the answer and is the better one, but it now has to be read rather than assumed.
- **The service is still unsafe to expose.** Anyone who can reach it can book on any customer's
  behalf, read any appointment, cancel any booking — acceptable only at the single local container
  this system deploys to, and unchanged by this record.
- Retrofitting authentication is still not purely additive, and nothing records who booked
- The superseded record keeps its own words, including in its filename and in the generated index:
  it is history, and history is not rewritten here
