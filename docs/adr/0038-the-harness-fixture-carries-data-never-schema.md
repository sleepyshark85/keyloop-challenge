---
id: "0038"
title: The harness fixture carries data, never schema
status: accepted
date: 2026-09-10
supersedes: null
superseded_by: null
arc42: ["§3.1", "§11.1"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: architect
decided-by: human
ai-input: >
  The agent proposed the option set and ruled it at slice 15 step 1, drafted inline in
  `docs/slices/15-design.md` §2 and cited as settled by two roles while it was still a draft,
  which is why this file exists as a file. Nothing in the option set moved between the draft
  and here; `status` moved `proposed` → `accepted`, since a draft written before the gate that
  accepted it would otherwise book a shipped decision as debt in §11.1.

  THE HUMAN ASKED FOR THE CHANGE AND ACCEPTED THE RULING, AND THE ACCEPTANCE IS WEAKER THAN
  SLICE 14's. The human named the goal — read the seed's data from a file, cover the important
  cases, demonstrate capacity as well as scarcity — and put the central tension to the agent
  rather than resolving it. At Gate E it delegated the merge and did NOT run the demonstration.
  For a slice whose entire deliverable is a runnable demo, that leaves the artifact
  agent-verified: the only end-to-end runs are the implementer's and the reviewer's (§11.1
  `D-15-5`).
---

## Context and problem statement

`harness/seed.mjs` hard-coded one dealership with one bay and one technician, so the terminal demo
could show double-booking refused and could not show capacity confirmed. Moving that data into a file
is obvious. What is not obvious is **how much of the schema goes with it.**

The file is a second, independent transcription of arc42 §8.1's reference-data shape in raw SQL —
`tests/support/seed.ts` is the first — and that independence is load-bearing: a renamed or dropped
column fails loudly with PostgreSQL's own `42703` instead of silently seeding a wrong world. A fixture
format expressive enough to describe tables would make the seeder's SQL a *function of* a schema
description, and the transcription would collapse into the thing it was checking.

## Considered options

| | Option | Good, because | Rejected, because |
|---|---|---|---|
| **A** | **Keep the data hard-coded in `seed.mjs`** | Nothing to validate, nothing to drift; the transcription is trivially preserved | A second subtree means duplicating the file's whole body, and the world the demo runs against stays buried in nine `INSERT`s where no reader looks |
| **B** | **A generic `{table, columns, rows}` document the seeder replays** | One loop replays anything; new reference tables need no code | The `INSERT`s become generated from the document, so a column dropped from the migration disappears from the fixture too and the `42703` never fires. It also makes the fixture a schema an author can get wrong in ways no domain validation can catch |
| **C** | **A domain-shaped fixture of keys and attributes, replayed by hand-written per-table `INSERT`s** | Below | **Chosen** |
| **D** | **Generate the fixture from the migrations** | Cannot drift by construction | Same defect as B and worse: the fixture would be derived from the very artifact it exists to check independently, so agreement between them would prove nothing |

## Decision

Chosen option: **C — the fixture supplies rows, not tables.** It names entities by key
(`"bays": ["bay-1"]`), declares qualifications and ownership as references between those keys, and
cannot express a column at all. The nine `INSERT` statements stay hand-written in `seed.mjs`, naming
every column literally.

Three things the fixture therefore does **not** carry, each preserving a measured property of the file
it replaces: **no uuids or VINs** (minted fresh per invocation, because the `db` project shares one
un-truncated container and `vehicle.vin` is globally unique), **no instants** (`STARTS_AT` stays
rolled forward, so no literal ages into the past), and **no export names** (derived mechanically from a
subtree's `exportPrefix`, so slice 10's five exported names are reproduced by construction rather than
by care).

Because half the fixture's integrity is cross-reference rather than shape — a qualification naming a
declared service type, a vehicle naming a customer in its own subtree — the seeder validates it
itself, rejecting unknown keys, before any `INSERT`.

## Consequences

**Good**

- **The `42703` still fires.** Adding a *column* remains a two-file edit, deliberately; adding a *row*
  is a one-file edit.
- **The world the demo runs against is readable**, and each subtree must state its `purpose`.
- **A wrong fixture fails loudly on stderr with the offending JSON path**, printing nothing on the
  stdout that callers `eval`.

**Bad, or deferred**

- **The validator is a second place fixture rules live**, beside the database's own constraints. Three
  of them — the `day_of_week`, `closes_at > opens_at` and `duration_minutes > 0` CHECKs — are
  deliberately left to PostgreSQL, which is safe only because the insert sequence runs in a
  transaction; that `ROLLBACK` path is exercised by hand and asserted by nothing (§11.1 `R-11`,
  `D-15-3`).
- **A fixture author can still describe a world the demo cannot survive** — capacity above ADR-0009's
  attempt cap, or racer counts above `DB_POOL_MAX` — and nothing warns them (§11.1 `D-15-1`,
  `D-15-2`).
