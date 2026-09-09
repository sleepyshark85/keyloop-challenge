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
  from those sources; the rest are rejected here on reasoning rather than on a
  contemporaneous deliberation. The Decision is unchanged and is not reopened.

  A SECOND WEAKNESS, and it is the reason this paragraph exists: THE OPTION SET WAS
  AMENDED AFTER DRAFTING, hours later, on the human's instruction of the same day. F (slot
  materialisation) and G (external coordination — Redlock, a single-writer log, Temporal,
  CRDTs, Spanner, grouped because one ground rejects them all) were ADDED because the first
  draft never weighed them. Neither was recalled: both are REASONED HERE, by the agent,
  after the fact, so they are weaker evidence than A, B and E and should be read that way.
  The same instruction permitted deleting options judged trivial, and TWO WERE DELETED to
  pay for the additions inside a 700-word budget: the old C (a `UNIQUE` index) survives as
  a clause in F, which is the only construction that makes a `UNIQUE` index apply at all,
  and the old D (an overlap trigger) survives as a clause in A, whose defect it shares. No
  rejection ground was dropped, but two options stopped being options, which is exactly
  what `docs:adr-check` exists to catch — it did catch both, and the baseline was re-pinned
  with `--pin` so the growth and the two deletions appear in a diff instead of in silence.
  Letters were not reused, so the table now reads A, B, F, G, E: an option set that both
  grows and shrinks after the fact can make a deliberation look more thorough than it was,
  and a renumbering would have hidden the shrinking half from the guard.

  The Decision, its verdict and its consequences did not move. One cross-reference in the
  Decision's last sentence was corrected to name the options that now exist.
---

## Context and problem statement

The brief asks for the defect in as many words — *"Before confirming, check for the availability of
both a ServiceBay and a qualified Technician for the entire service duration"*:

```ts
// REJECTED — the shape the brief's wording invites
const free = await checkAvailability(bayId, interval);
if (free) await createAppointment(bayId, interval);   // ← another request booked it here
```

Two requests arriving at 09:00:00.000 both read *free*, both insert, and both get bay 3. No
care in application code narrows that window shut: the read stops being true as it returns.
A double booking is one ramp and two cars. So the question is not how to make the race rare, but
**where correctness lives** — in code every caller repeats, or in the data.

## Considered options

| | Option | Good, because | Rejected, because |
|---|---|---|---|
| **A** | **Check-then-act**, as the brief words it | The obvious reading | Every variant keeps the shape — a shorter window, a re-check, a version column, or a trigger, which moves the read inside the database, where two concurrent triggers both see "free" (§8.2). Each fails under some interleaving, or is B in disguise |
| **B** | **A per-dealership advisory lock, or `SERIALIZABLE`** | Honestly correct, and spurious refusals go too | Correctness becomes a *discipline*. Every write path — a repair script, a new endpoint, a well-meant refactor — must remember to take it, and nothing fails when one forgets until two cars arrive for the same ramp (ADR-0004 Option D) |
| **F** | **Slot materialisation**: pre-create `(bay_id, slot_start)` rows; claim N consecutive under `UNIQUE` | It **converts overlap into equality**, which every database enforces — the only way a `UNIQUE` index can apply, since uniqueness rejects rows *equal* on a key. No `btree_gist`, portable, a plain `23505`, and it matches the fixed-slot board dealerships think in | Every booking must align to the grid: a 50-minute service on a 15-minute grid wastes ten minutes of a bay, and A-1's durations become multiples of the slot. Claiming N rows is all-or-nothing, restoring the partial-failure handling one `INSERT` removes. But TC-3 commits to PostgreSQL, where E gives arbitrary starts and exact durations free |
| **G** | **External coordination**: a distributed lock (Redlock), a single-writer log keyed by `bay_id`, Temporal, CRDTs, or Spanner | Real mechanisms, seriously used | Each moves correctness **out of the data and back into code**, so a `psql` session or a second writer double-books anyway. Redlock is worse still: after a pause a holder believes it holds what it lost. The log costs the synchronous `201`. Temporal solves sagas, CRDTs have no merge for mutual exclusion, and Spanner expresses overlap in code anyway, at greater cost |
| **E** | **PostgreSQL exclusion constraints** | Below | **Chosen** |

## Decision

Chosen option: **E — two `EXCLUDE USING gist` constraints, on bay and on technician, make an overlapping
row an object the database will not store** (DDL verbatim in §8.2; runtime sequence in §6.1).

**The system does not check whether a resource is free before booking it. It attempts the booking and
lets PostgreSQL refuse.** The constraint is not a faster check; it is a different kind of thing. It is
evaluated by the index machinery as part of the write, against committed rows, for every writer, with no
call site to omit — which is precisely what A, B and G each fail to be.

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
