# Prompt · phase 2 · architect · invocation 1

**BACKFILLED.** Sent on 2026-09-03, before `.claude/hooks/capture-prompt.mjs` existed;
reproduced verbatim from the session transcript. From `s00a-architect-2` onward, capture is
mechanical and happens at invocation. See `README.md`.

- Task: Phase 2 architecture, arc42 §4–§11

---

You are the architect. Phase 2 — Architecture — closing at Gate B. Branch `phase/02-architecture` is checked out; the scope marker `docs/team-log/.scope` already reads `{"phase":"2"}`.

## Read first

- `CLAUDE.md` — the constitution. §2 invariants are NON-NEGOTIABLE and are not to be relitigated. §3 names exactly what is reserved to you at Gate B.
- `docs/arc42/01-introduction-goals.md` — Phase 1's output. §1.2 quality goals (ranked, ratified by the human at Gate A), §1.3 stakeholders, §1.4 the ten assumptions A-1..A-10 and the four Gate A rulings OQ-1..OQ-4.
- `docs/arc42/02-constraints.md` and `03-context-scope.md` — written, do not rewrite.
- `docs/adr/0001..0004` — accepted, IMMUTABLE. Never edit them; supersede if you must, and you should not need to.
- `docs/METHODOLOGY.md`, `docs/arc42/00-reader-guide.md`.
- `Requirements.md` — the original assessment brief.

Sections §1, §2, §3, §9 (index), §12, §13 are NOT yours in this phase. §12 and §13 belong to the scribe. §9 is an index — regenerate it only if `npm run docs:build` does so.

## Deliverables

**1. arc42 sections, currently stubs — replace the placeholder italics with real content:**

- **§4 Solution strategy** — the shortest section carrying the most weight. §4.1 must name check-then-act as a considered and *rejected* alternative and explain why correctness is delegated to the database. §4.2 the technology decisions, each pointing at its ADR. §4.3 how the §1.2 goals map onto structure.
- **§5 Building blocks** — the decomposition. Whitebox of the whole, then one level down. §1.2 goal 3 (modifiability) demands that each §1.4 ambiguity most likely to move — A-1 duration by vehicle, A-4 buffer, ADR-0001 opening hours — be absorbed by *one* building block. A-4 in particular says to keep "the interval the constraint sees" a named concept; do that.
- **§6 Runtime view** — at minimum: the booking path including the ADR-0004 retry loop across remaining candidates with its attempt cap; the ADR-0003 atomic-`UPDATE` reschedule; cancellation. Show where SQLSTATE `23P01` is caught and mapped.
- **§7 Deployment view** — service + PostgreSQL, and how Testcontainers stands in for it under test (§2.2).
- **§8 Crosscutting concepts** — the domain model / data-model delta (tables, the `btree_gist` exclusion constraints verbatim), time handling per A-8 (`timestamptz`/`tstzrange`, dealership IANA zone used for opening-hours validation only and never in the overlap calculation), error mapping (`400` out-of-hours per ADR-0001, `409` on exhausted candidates per ADR-0004, `404`/`422` for the A-6 reference-data failures), and observability per §1.2 goal 4 — OpenTelemetry spans separating the availability check from the insert, and `booking_conflicts_total{resource}`.
- **§10 Quality requirements** — the quality tree plus *executable* scenarios in the §10.2 table, each naming the test path that will enforce it. These are what the test-engineer will implement, so they must be precise. It MUST pin, at minimum:
  - the no-overlap invariant for bay and for technician under any interleaving (goal 1);
  - **no spurious refusal under retry** (ADR-0004): a request that conflicts on its first candidate while the dealership still has capacity must be confirmed, not refused;
  - **a refused move leaves the original appointment confirmed** (ADR-0003);
  - **a reschedule onto an interval that overlaps the appointment's own current interval must succeed** — the row must not conflict with itself;
  - a **DST-boundary** scenario for opening-hours validation (ADR-0001);
  - scenarios for goals 2–5. Performance is ranked last but still needs a stated budget rather than silence.
- **§11 Risks and technical debt** — including what §1.2 already consigns there: the goal-1-over-goal-5 write-throughput ceiling and the scale at which it would need revisiting; A-2's capacity-*n* technician needing a different mechanism than an exclusion constraint; the excluded shift modelling, authentication, and DMS event publication.

**2. `.dependency-cruiser.js` at the repo root** — the founding layering rules. `CLAUDE.md` §2.3 makes this the enforcement mechanism, not reviewer opinion: the layering you describe in §5 must be exactly what this file forbids. Rules must be real and fail on a real violation, not aspirational comments.

**3. ADRs for the four decisions `CLAUDE.md` §3 reserves to you** — HTTP framework, query layer / ORM, migration tool, module decomposition. MADR format, numbered from 0005, `status: proposed` until the human approves at Gate B (they are the Gate B decision). Each MUST carry alternatives genuinely considered with the reason for rejection — §1.4 is explicit that "a technology named without a rejected alternative is a preference, not a decision". Weigh them against the ranked §1.2 goals, especially: does the query layer let the exclusion-constraint insert and the atomic reschedule `UPDATE` be expressed directly and the SQLSTATE be caught cleanly? A layer that hides `23P01` behind a generic error is disqualifying.

**4. Presentation diagrams** for §5 and §6. Follow whatever convention `docs/diagrams/` already uses and check `tools/docs/export-diagram.mjs` / `npm run diagram:export`.

## Rules of engagement

- Everything you write must trace to the brief, an ADR, or a §1.4 assumption. Do not invent scope. If a genuine new ambiguity appears, record it as an assumption in your report and flag it — do not silently resolve it (`CLAUDE.md` §11), and do not add it to §1.4 (that section is closed and was ratified at Gate A).
- You may NOT change scope, acceptance criteria or quality goals — those are the human's.
- Do not write slices; slice definition is the orchestrator's.
- Do not write to `docs/team-log/events.jsonl` and do not move the board (`CLAUDE.md` §9). Return a structured report instead.
- Run `npm run docs:build` and `npm run docs:check` and leave them passing; run `npm run test:docs` too.
- Commit your work in small conventional commits on `phase/02-architecture`, e.g. `docs(arc42): §5 building blocks`, `feat(arch): founding dependency-cruiser ruleset`, `docs(adr): 0005 HTTP framework`. End every commit message with the standard attribution trailer.

Do NOT push and do NOT open the PR — the orchestrator does that.

## Report back

A structured report: sections written, ADRs recorded (id, title, status, alternatives rejected), the dependency-cruiser rules and what each forbids, the §10 scenario ids with the test paths they name, any new assumptions flagged for the human, and anything you deliberately left for Gate B discussion. Also state plainly the one or two decisions you are least confident in — the PR thread is where the human will argue them.
