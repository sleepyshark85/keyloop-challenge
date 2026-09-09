---
id: "0036"
title: Make overlap unrepresentable — every booking is adjudicated by the database, never by application code
status: accepted
date: 2026-09-09
supersedes: null
superseded_by: null
arc42: ["§4.1", "§6.1", "§8.2", "§8.6"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: human
decided-by: human
ai-input: >
  THE AGENT CONTRIBUTED NO PART OF THIS CHOICE. The human made it at phase 0, in
  `CLAUDE.md` §2.1, as a NON-NEGOTIABLE standing invariant — before the ADR process
  existed and before any agent had run on this project. Every agent since has implemented
  it; none was ever asked whether it was right, and this record does not ask now.

  What the agent did, on the human's instruction of 2026-09-09, is WRITE THE RECORD THAT
  WAS NEVER WRITTEN. Five ADRs orbit this decision — 0004, 0009, 0016, 0018, 0035 — and
  seven cite it, but none has it as its Decision. That is why arc42 §4.1 had to carry the
  whole argument, and why the system's most important decision was documented everywhere
  except as a decision.

  ONE WEAKNESS, stated because a retrospective record can otherwise flatter itself: the
  option set below is RECONSTRUCTED, from §2.1, §4.1 and the satellites, rather than
  minuted while the options were live. A, B and E were argued at the time and are quoted
  from those sources; C and D are rejected here on reasoning rather than on a
  contemporaneous deliberation. The Decision is unchanged and is not reopened.
---

## Context and problem statement

The brief asks for the defect in as many words — *"Before confirming, check for the availability of
both a ServiceBay and a qualified Technician for the entire service duration"*:

```ts
// REJECTED — the shape the brief's wording invites
const free = await checkAvailability(bayId, interval);
if (free) await createAppointment(bayId, interval);   // ← another request booked it here
```

Two requests arriving at 09:00:00.000 both read *free*, both insert, and both customers are told bay 3
is theirs. That window is not a small one to be narrowed. It cannot be closed by any amount of care in
application code, because the read's result stops being true the instant it is returned.

A double booking is also not a blemish to be reconciled overnight: it is one ramp and two cars. So the
question is not how to make the race rare. It is **where correctness is permitted to live** — in a code
path that every future caller must repeat, or in the data itself.

## Considered options

| | Option | Good, because | Rejected, because |
|---|---|---|---|
| **A** | **Check-then-act**, as the brief words it | It is the obvious reading of the requirement, and one round trip | Every variant keeps the shape: a shorter window, a re-check, a version column, a `SELECT … FOR UPDATE` over a row that does not yet exist. Each fails under some interleaving or is option B in disguise |
| **B** | **A per-dealership advisory lock, or `SERIALIZABLE` isolation** | Honestly correct: under either, check-then-act genuinely works, and it also removes spurious refusals | Correctness becomes a *discipline*. Every present and future write path — a repair script, a new endpoint, a well-meant refactor — must remember to take it, and nothing fails when one forgets until two cars arrive for the same ramp (ADR-0004 Option D) |
| **C** | **A `UNIQUE` index** on the resource and the slot | Declarative, and in the data where it belongs | It cannot express the property. Uniqueness rejects rows that are *equal* on a key; overlap is not an equivalence relation, and no key exists whose equality means "these two intervals intersect" |
| **D** | **A trigger that computes overlap** before the write | Declarative-looking, and it catches every write path | It is check-then-act with the check moved inside the database: the trigger *reads other rows*, and under `READ COMMITTED` two concurrent triggers both read "free" (§8.2 makes the same argument for the `UPDATE` path) |
| **E** | **PostgreSQL exclusion constraints** | Below | **Chosen** |

## Decision

Chosen option: **E — two `EXCLUDE USING gist` constraints, on bay and on technician, make an overlapping
row an object the database will not store** (DDL verbatim in §8.2; runtime sequence in §6.1).

**The system does not check whether a resource is free before booking it. It attempts the booking and
lets PostgreSQL refuse.** The constraint is not a faster check; it is a different kind of thing. It is
evaluated by the index machinery as part of the write, against committed rows, for every writer, with no
call site to omit — which is precisely what A, B and D each fail to be.

## Consequences

**Good**

- **Correctness is a property of the data, not of the code.** It holds for the API, for a migration, for
  a `psql` session, for a bug.
- **The write is the decision.** A booking exists if and only if PostgreSQL accepted the statement, so
  availability queries are advisory and the API says so (§8.6).
- **The failure mode is specific and catchable**: SQLSTATE `23P01`, naming the violated constraint —
  which §8.6 maps to `409`, ADR-0009 prunes on and ADR-0035 counts.

**Bad, or deferred**

- **It serialises writers that actually conflict**, capping write throughput for one contended
  resource (§11.2 R-1).
- **It makes check-then-act harmless rather than impossible**, so no behavioural test can catch a
  reintroduced one (ADR-0016).
- **Refusing is not the same as adjudicating**: without help the losers deadlock instead of receiving a
  verdict (ADR-0018), and a correct system that refuses a customer while a bay stands empty is useless
  (ADR-0004, ADR-0009). Both are built on top; neither moves the invariant.
- **The guarantee is exactly as wide as the `appointment` table.** Two appointments cannot overlap; a
  technician on holiday or a bay closed for maintenance is not a row, so nothing adjudicates it
  (ADR-0001 Option C).
