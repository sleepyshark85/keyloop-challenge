# System design — Keyloop service scheduler

*Scenario A: Unified Service Scheduler (backend). Generated from `docs/arc42/` by
`npm run docs:build` — edit the sections, not this file.*

This is the architecture documentation for the Keyloop service scheduler, following
[arc42](https://arc42.org) (CC BY-SA). All twelve standard sections are retained; several are
deliberately thin and say why. One section is added outside the standard twelve: **§13 AI
Collaboration**.

**If you are assessing this submission** — §1 goals, §4 solution strategy, §9 decisions,
§11 risks and debt, §13 AI collaboration.
**If you are implementing** — §5 building blocks, §8 cross-cutting concepts, §10 quality scenarios.
**If you are operating it** — §7 deployment, §8 observability.

## How to read the quality scenarios

§10 numbers each scenario `QS-n`, and every one names the test that enforces it. The chain

```
§10 quality scenario → slice acceptance criterion → test name → CI result
```

is walkable in both directions, and CI fails if a `QS-*` names a test that does not exist. A quality
attribute that cannot be traced to a test is aspiration.

## As-designed versus as-built

This document was written as-designed at the architecture gate and corrected to as-built at each
slice merge. The difference is preserved on purpose: where the plan was wrong is worth more than a
plan that reads as though it never was. §11 and §13 discuss the material deltas.

---

## 1. Introduction and goals

### 1.1 Requirements overview

*What the system does, in a page. Scenario A: resource-constrained booking, real-time availability
of both a service bay and a qualified technician, and a persistent appointment record.*

### 1.2 Quality goals

*The top three to five, ranked. Ranked, because unranked quality goals do not constrain anything.*

### 1.3 Stakeholders

| Role | Expectation |
|---|---|

### 1.4 Assumptions

*The assessment states ambiguity is deliberate. Every assumption resolved at Gate A is recorded here
with the ADR that settled it, rather than silently absorbed.*

---

## 2. Architecture constraints

### 2.1 Standing invariants

Decided before the architecture, and not open to relitigation. Full statements in `CLAUDE.md` §2.

| Constraint | Consequence |
|---|---|
| Double-booking is prevented by a PostgreSQL exclusion constraint, never by application code | Check-then-act is forbidden; the service maps SQLSTATE `23P01` to `409 Conflict` |
| Tests asserting persistence run against real PostgreSQL via Testcontainers | No SQLite, no in-memory repository, no mocked database |
| Layering is enforced by `dependency-cruiser` in CI | Conformance is a build failure, not a reviewer's opinion |
| Every slice begins with a failing acceptance test, committed red by a different author | A test that has never failed is not evidence |

### 2.2 Technical constraints

*Stack, runtime, and anything imposed rather than chosen. Choices made freely belong in §4 with an ADR.*

### 2.3 Organisational constraints

*Assessment scope and the time budget. Backend only; the client layer is stubbed with an OpenAPI
contract and a cURL harness.*

---

## 3. Context and scope

### 3.1 Business context

*Actors and neighbouring systems, and what crosses each boundary in domain terms.*

### 3.2 Technical context

*The same boundaries as protocols and formats.*

### 3.3 Out of scope

*Named explicitly. What a system deliberately does not do is part of its design.*

---

## 4. Solution strategy

*The shortest section that carries the most weight: the handful of decisions everything else
follows from, each linked to its ADR.*

### 4.1 Preventing double-booking

*The central decision. Must name check-then-act as a considered and rejected alternative, and
explain why correctness is delegated to the database rather than to application code.*

### 4.2 Technology decisions

*Each with its ADR. A technology named without a rejected alternative is a preference, not a decision.*

### 4.3 Achieving the quality goals

*How the §1.2 goals map onto structure.*

---

## 5. Building block view

### 5.1 Level 1 — containers

*C4 container view. Diagram: `diagram-design`, exported to SVG and referenced here.*

### 5.2 Level 2 — components

*Whitebox of the service.*

### 5.3 Module dependency graph

*Generated from `dependency-cruiser`, never hand-drawn — a hand-drawn dependency graph is a claim,
a generated one is a fact. The same configuration enforces these boundaries in CI.*

---

## 6. Runtime view

### 6.1 Concurrent booking — the database decides

**Mandatory.** Two racing requests for the same bay; the exclusion constraint commits the first and
rejects the second with `23P01`, which the service maps to `409 Conflict`. This is the scenario the
whole design exists to make safe, so it is documented before the happy path.

### 6.2 Availability query

### 6.3 Successful booking

---

## 7. Deployment view

*Deliberately minimal: a single-container local deployment plus a PostgreSQL instance and one
`grafana/otel-lgtm` container for telemetry. What a production deployment would additionally
require is stated in §11 rather than invented here — three paragraphs of speculative Kubernetes
topology would be padding, not design.*

---

## 8. Cross-cutting concepts

### 8.1 Domain model

### 8.2 Persistence and the exclusion constraint

*Where the central invariant physically lives, and what that implies for testing.*

### 8.3 Observability

*OpenTelemetry traces with `pino` logs correlated by trace id. Spans around the availability check
and the insert separately, so the check-then-act window is visible in a waterfall. Metrics are
domain metrics — `appointments_booked_total`, `booking_conflicts_total`,
`availability_query_duration_seconds` — because CPU graphs do not tell you whether the business
invariant held.*

### 8.4 Testability

*Test levels, ownership, and why acceptance tests are written by a role that never reads `src/`.*

### 8.5 Error handling and API semantics

---

## 9. Architecture decisions

Decisions live as individual MADR files under [`docs/adr/`](../adr/). They are **immutable**: an
accepted ADR is never edited, only superseded by a later one that references it. The record of how
thinking changed is the reason to keep them at all.

Each carries `proposed-by`, `decided-by` and `ai-input`, so where an agent's recommendation was
accepted, modified or overridden is visible without taking anyone's word for it.

_No decisions recorded yet._



---

## 10. Quality requirements

### 10.1 Quality tree

### 10.2 Quality scenarios

Each scenario is written so it can be executed, and names the test that enforces it. CI fails if a
scenario names a test that does not exist.

| id | Scenario | Enforced by |
|---|---|---|
| QS-1 | *(stimulus → response, measurable)* | *(test path)* |

*"The system should be fast" is not a quality scenario. "No two confirmed appointments may share a
bay with overlapping intervals under any interleaving of concurrent requests" is.*

---

## 11. Risks and technical debt

### 11.1 Deferred improvements

Generated: every ADR with `status: proposed` and every deferred-improvement slice is, by
construction, a debt item traceable to the decision that created it.

_No deferred improvements recorded._

### 11.2 Known risks

### 11.3 What production would additionally require

*Named honestly. Scope that was cut deliberately is judgement; scope that was cut silently is a gap.*

---

## 12. Glossary

Domain terms only. Process vocabulary lives in `docs/METHODOLOGY.md`.

| Term | Meaning |
|---|---|
| Service bay | A physical workspace at a dealership; a booking occupies exactly one for its duration |
| Technician | A person qualified for particular service types |
| Service type | A category of work with an expected duration and required qualification |
| Appointment | The persisted record binding customer, vehicle, technician, bay and interval |

---

## 13. AI collaboration

Sourced from artifacts, never from memory: the ADR set, PR threads, `docs/team-log/events.jsonl`,
the prompt library under `docs/team-log/prompts/`, and git history. Every claim here cites one.

### 13.1 Team structure and bounded authority

### 13.2 Verification — what it caught

*Independent acceptance tests, the mutation audit, hook-enforced path locks, the red-commit trail.
With what each actually found, not what it was intended to find.*

### 13.3 Where the human overrode the agents

*From ADR `ai-input` fields and `gate.decided` events.*

### 13.4 Design changes and the superseding chain

### 13.5 What the process cost

*Per role, from the token collector. Reconstructed from session transcripts, not a billing record,
and labelled as such.*

### 13.6 What did not work

*This subsection is worth more than the ones above it.*

---

*Architecture documentation follows [arc42](https://arc42.org), used under CC BY-SA.*
