# Prompt · phase 1 · architect · invocation 1

Written before invocation, per METHODOLOGY.md §9. This file is the prompt as sent.

---

You are running **phase 1: requirements and ambiguity resolution**. This ends at Gate A, where the
human resolves the ambiguities you surface.

## Read first, in this order

1. `CLAUDE.md` — the project constitution. Its §2 standing invariants are **already decided**;
   implement them, do not relitigate them.
2. `Requirements.md` — the assessment brief. We are building **Scenario A: The Unified Service
   Scheduler**, backend only.
3. `docs/METHODOLOGY.md` §3 (phases) and §4 (documentation) — how your output is used.
4. `docs/arc42/01-introduction-goals.md`, `02-constraints.md`, `03-context-scope.md` — the stubs you
   are filling. Keep their heading structure.

## Deliverables — arc42 §1–§3 only

Write only these three files. **Do not touch §4 onward** — solution strategy and building blocks are
phase 2, behind Gate B. If you find yourself wanting to specify a component or a technology, that is
a signal you are ahead of the gate; note it as an open question instead.

**§1 Introduction and goals**
- §1.1 Requirements overview — what the system does, in about a page.
- §1.2 Quality goals — three to five, **ranked**. Unranked quality goals constrain nothing, so the
  ordering is the substance. Justify the ranking in one line each.
- §1.3 Stakeholders and what each expects.
- §1.4 Assumptions — see below.

**§2 Architecture constraints** — keep the standing-invariants table that is already there; add
technical and organisational constraints. A constraint is something *imposed*. Anything you are free
to choose belongs in §4 with an ADR, not here.

**§3 Context and scope** — business context (actors, neighbouring systems, what crosses each
boundary in domain terms), technical context (the same boundaries as protocols and formats), and an
explicit out-of-scope list. What a system deliberately does not do is part of its design.

## The most important part: ambiguity

The brief states plainly that these scenarios "are designed to mimic real-world requirements, which
can be ambiguous" and asks that assumptions be documented. **Documented assumptions are graded
work, not preamble.**

So: do **not** silently resolve ambiguity. For every point where the brief underdetermines the
system, record it. Distinguish two kinds:

- **Assumption** — you have picked a reasonable reading and can proceed. State the reading, and
  state what would change if it were wrong.
- **Open question** — you cannot proceed sensibly without a decision, or the choice materially
  changes the design. These block Gate A.

Scenario A is thin on several things that matter. Some worth examining — not an exhaustive list, and
do not pad it with questions that do not affect the design:

- Is a service duration fixed per service type, or does it vary by vehicle?
- Can one technician cover two bays, or is a technician occupied for the whole appointment?
- Are technician qualifications global, or scoped per dealership?
- Does a bay need setup/cleanup buffer between appointments?
- Are dealership opening hours and technician shifts modelled, or is time unbounded?
- Who is the actor — customer self-service, or a service advisor booking on their behalf?
- What happens to an appointment after it is made? Cancellation and rescheduling are not in the
  three stated criteria; are they in scope?
- Is a vehicle tied to one customer? Must it already exist, or is it created on booking?

For each, say why it matters — ideally which of the three stated acceptance criteria it affects.

## Rules

- You own `docs/arc42/` and `docs/adr/`. You may not write code, tests, or the event log; a hook
  enforces this and will explain any refusal.
- Do not create ADRs yet. Gate A produces the decisions; ADRs record them afterwards.
- No diagrams this phase. §3's context diagram comes in phase 2 with the rest.
- Prefer plain, short sentences. This document is read by an assessor under time pressure.
- Where the brief is quoted, quote it exactly.

## Report

End with exactly this block:

```json
{
  "role": "architect",
  "outcome": "designed",
  "arc42_sections_touched": ["§1", "§2", "§3"],
  "adrs": [],
  "quality_scenarios": [],
  "assumptions": ["..."],
  "open_questions": ["..."],
  "dcr_ruling": null,
  "message": "one or two plain sentences"
}
```

Put the ranked quality goals and the open questions in the report body too — they are what Gate A
turns on, and I need them without re-reading the files.
