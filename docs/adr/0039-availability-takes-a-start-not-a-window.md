---
id: "0039"
title: Availability takes a start, not a window
status: accepted
date: 2026-09-10
supersedes: null
superseded_by: null
arc42: ["§6.5", "§8.6", "§10.2"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: human
decided-by: human
ai-input: >
  THE HUMAN FOUND THIS, NOT THE AGENT. At slice 15's gate they ran the reproduction below against a
  live service and said: "since booking an appointment only need to pass in start time, I would
  expect the availability check also require the same, not end time." They also established that no
  ADR covered the original choice.

  The agent's contribution is the option set, the ruling that this REPLACES the range query rather
  than joining it, and two things nobody asked for: the response naming the interval it answered
  about, and availability inheriting the opening-hours gate. Both were ruled by the architect
  mid-slice under CLAUDE.md §6 and are provisional until the gate.

  Accepted at Gate E, 2026-09-10 — approved with conditions, none of them about this decision. It
  was written `proposed` at step 1 and stayed that way until the human had ruled, which is what the
  status field is for.
---

## Context and problem statement

`POST /appointments` takes `startsAt` and derives the end from the service type's duration —
deliberately, so a client cannot state a duration that disagrees with the one the dealership sells.
`GET /availability` receives the same `serviceTypeId` and then makes the client supply `from` and
`to` anyway, so the client re-implements the derivation the booking path keeps server-side.

Observed, against a live service on 2026-09-10 with a 60-minute service type and an appointment
already occupying 09:30–10:30:

```
GET /availability from=09:00 to=09:30   ->  bays=[...]   (free)
POST /appointments startsAt=09:00       ->  409
GET /availability from=09:00 to=10:00   ->  bays=[]      (busy)
```

Nothing raced and nothing was stale. The caller named a window that is not the interval the booking
would occupy, and an endpoint that answers whatever window it is handed cannot promise what the
brief asks for: *"check for the availability of both a ServiceBay and a qualified Technician for the
entire service duration."*

## Considered options

| | Option | Rejected, because |
|---|---|---|
| **A** | Keep `from`/`to`; document the hazard | The disclaimer already documents staleness and this is not staleness. Prose cannot stop a caller naming the wrong window |
| **B** | Accept `startsAt` **or** `from`/`to` | Keeps the defect available on the same URL, restores `to <= from` to the taxonomy for a mode with no consumer, and an object querystring cannot express the exclusivity — so the published contract could not state the rule it depends on |
| **C** | `startsAt` only; availability re-derives the end from `durationMinutes` itself | Two derivations again — one file apart instead of one process apart. The next duration rule (a buffer, a per-bay adjustment) has to find both |
| **D** | `startsAt` only, derived by `deriveInterval`, and the response names the interval | **Chosen** |
| **E** | A separate day-view endpoint taking a date and returning free start times | **Not rejected — deferred.** A different question with a different answer shape, and nobody has asked it |

## Decision

Chosen option: **D.** `GET /availability?dealershipId&serviceTypeId&startsAt` derives its window by
calling `deriveInterval` — the function `bookAppointment` calls, unedited — and the `200` carries
the `startsAt` and `endsAt` it answered about.

**Reusing the function rather than the rule is the decision.** A copy would satisfy the same
sentence and hold none of the guarantees: duration arithmetic lives in one file, the composition
order is asserted in one place, and the opening-hours gate cannot be left behind because the
function will not return an interval without it.

**Naming the interval in the response is the second half**, and it is what makes the first half
checkable. The window stops being a fact only the server knows: the property test probes the
interval the response named instead of computing one, and the availability answer and the booking
answer can be required to name the same two instants — an assertion that fails if the two paths
ever derive differently.

The general rule, which governs the next endpoint too: **a client is never asked for a value the
server can derive.**

## Consequences

**Good**

- Duration has one source of truth on both paths, and the agreement is asserted rather than
  reviewed.
- Availability inherits the opening-hours gate, so it stops reporting a bay free at a time no
  booking can take. Its residual failures become the booking path's, minus the ones that only apply
  to writing.
- `to <= from` becomes unreachable by a client, and the outcome that existed to hold it goes away.

**Bad, or deferred**

- **A breaking contract change** for any client sending `from`/`to`. `A-16-1` assumed there is none
  outside this repository; at Gate E that stopped being an assumption — `CLAUDE.md` §1 makes the
  client layer a stub over an OpenAPI contract and a cURL harness, so no external consumer exists by
  constitution rather than by belief.
- **The range query is foreclosed in this operation.** The day-view question (option E) is a
  backlog item, and answering it by widening this endpoint again would reintroduce exactly what
  this ADR removes.
- **The performance scenario now measures a narrower range against an unchanged budget** — arc42
  §11.1 `D-16-1`, with the measured figure recorded so a later tightening starts from a number.
