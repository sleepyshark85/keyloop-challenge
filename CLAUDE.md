# Project Constitution

Keyloop Technical Assessment — **Scenario A: Unified Service Scheduler**, backend implementation.

This file governs every agent in this repository. Rules marked **NON-NEGOTIABLE** may not be
relaxed by any agent for any reason; if one appears to block progress, raise a DCR (§6) instead
of working around it.

---

## 1. What we are building

A service-appointment scheduler for automotive dealerships. A customer requests an appointment
for a vehicle, service type, dealership and desired time. The system confirms only if **both** a
service bay **and** a technician qualified for that service type are free for the entire duration,
then persists an Appointment linking customer, vehicle, technician and bay.

Backend only. The client layer is stubbed with an OpenAPI contract and a cURL harness.

## 2. Standing invariants — NON-NEGOTIABLE

These are decided. Agents implement them; they do not relitigate them.

### 2.1 Double-booking is prevented by the database, not by application code

Check-then-act is forbidden:

```ts
// FORBIDDEN — both concurrent requests see "free" and both insert
const free = await checkAvailability(...);
if (free) await createAppointment(...);
```

Overlap is made unrepresentable using PostgreSQL exclusion constraints:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointment ADD CONSTRAINT no_bay_overlap
  EXCLUDE USING gist (bay_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');
-- and the equivalent on technician_id
```

The service layer attempts the insert and maps SQLSTATE `23P01` (exclusion_violation) to
`409 Conflict`. Availability queries exist to give good UX, never to guarantee correctness.

### 2.2 Tests run against real PostgreSQL

Testcontainers. No SQLite, no in-memory repository substitutes, no mocked database in any test
that asserts a persistence invariant. The most important invariant in this system lives in the
database; a test that mocks the database does not test it.

### 2.3 Layering is enforced by tooling

`.dependency-cruiser.js` is authored by the architect and enforced in CI. Violations fail the
build. Architecture conformance is not a matter of reviewer opinion.

### 2.4 Test-first, and provably so

Every slice begins with a failing acceptance test committed by the test-engineer, observed red in
CI, before any implementation exists. A test that has never failed is not evidence.

## 3. Stack

Decided: TypeScript, Node, PostgreSQL, Vitest, Testcontainers, `fast-check` (property tests),
Stryker (mutation testing), `dependency-cruiser` (layering), OpenTelemetry + `pino` (observability).

Deliberately left to the architect at Gate B: HTTP framework, query layer / ORM, migration tool,
module decomposition. Record the choice as an ADR with alternatives considered.

## 4. Source of truth

| Concern | Lives in | Owner |
|---|---|---|
| Architecture | `docs/arc42/` | architect |
| Decisions | `docs/adr/` (MADR) | architect |
| Units of work | `docs/slices/` | orchestrator |
| Team telemetry | `docs/team-log/` | orchestrator (append-only) |
| Build/run/test + AI narrative | `README.md` | scribe |

**arc42 is the single source of truth for architecture.** Nothing else describes the system's
structure. If a slice file and arc42 disagree, arc42 wins and the slice file is wrong.

**ADRs are immutable.** Never edit an accepted ADR — supersede it with a new one that references
it. The history of how thinking changed is the point.

## 5. Test ownership — NON-NEGOTIABLE

Enforced by path, symmetrically. Each role owns directories; neither crosses.

```
tests/acceptance/    tests/contract/    tests/property/    tests/concurrency/
        ^-- test-engineer only. The implementer MUST NOT create, edit or delete these.

tests/unit/
        ^-- implementer only. The test-engineer MUST NOT touch these.

tests/integration/
        ^-- shared; tests asserting a database invariant belong to the test-engineer.
```

Rationale: unit tests are a design tool and must be freely writable during refactor, so the
implementer owns them. Acceptance, contract, property and concurrency tests define *done* and must
be written by someone who has not seen the implementation.

If the implementer believes an acceptance test is wrong, it **raises a DCR**. It does not edit the
test. That escalation is a signal — it usually means the slice's acceptance criteria were ambiguous.

## 6. The slice loop

```
1 DESIGN → 2 AGREE → 3 RED → 4 GREEN → 5 REVIEW → 6 GATE → 7 AS-BUILT
architect   all      test-eng  impl     reviewer   human    architect
```

1. **Design** — architect states which building blocks are touched, interfaces, data-model delta,
   applicable §10 quality scenarios, proposed arc42 edits, ADR if a decision is needed.
2. **Agree** — test-engineer and implementer review the design and either agree or object. Objections
   here are cheap; the same ambiguity found at step 5 costs a full cycle plus a loopback.
3. **Red** — acceptance/contract/property tests, committed red, failure observed in CI.
4. **Green** — unit TDD, small commits, each one green.
5. **Review** — reviewer checks the diff against the design and AC, plus dependency-cruiser and
   Stryker survivors.
6. **Gate** — human exploratory testing, then approval and merge.
7. **As-built** — architect reconciles arc42 to what actually merged.

### Design Change Requests

Any role, at any step, may raise a DCR on a mismatch. The slice goes `blocked`. The architect
convenes **one** round of discussion, then rules:

| Outcome | Criterion | Effect |
|---|---|---|
| **(a) Clarification** | Design right, wording ambiguous | Update slice file; resume from raising step |
| **(b) Deferred improvement** | Work is **correct** under the agreed ADR; something better exists | **Merge as-is.** New backlog slice + ADR with `status: proposed` |
| **(c) Design defect** | Work would be **incorrect, unsafe or unshippable** | Loop back to step 1; supersede the ADR; revise (never delete) prior work |
| **(d) Escalate** | Genuine trade-off or scope question | Human decides |

To rule **(c)** the architect **must name the acceptance criterion or §10 quality scenario that
would fail**. If it cannot name one, the outcome is (b). Preference is not a blocker.

**Max 2 loopbacks per slice.** A third auto-escalates: a slice needing three design changes is a
slicing problem, not a design problem.

### Authority

- **Architect** decides architecture: interfaces, layering, data model, patterns.
- **Architect may not** change scope, acceptance criteria or quality goals — those are the human's.
- **Reviewer** may block a merge and raise a DCR, but may not change the design.
- **Implementer / test-engineer** may raise and argue once, but not decide.
- **Human** overrides anyone; every override is recorded with rationale.

One round of discussion, then a decision. No multi-turn agent debate — two agents arguing past
each other is not rigor, it is spend.

## 7. Commits and branches

- One branch and one PR per slice.
- **Exactly one red commit per slice**, authored by the test-engineer: `test(acceptance): … (red)`.
- **Every implementer commit is green** — unit test and the code it drives, together.
- `main` only ever receives green merges.
- Conventional Commits, referencing the slice id: `feat(03): …`, `test(03): …`, `refactor(03): …`.
- Small and deliverable. If a commit changes more than ~150 lines, it should probably have been two.

## 8. Work in progress

**WIP limit: 1 slice.** No slice starts until the previous one has passed its human gate. The
scarce resource here is human review attention, not agent capacity — the limit exists to protect it.

## 9. Logging obligations

Every agent returns a structured report; the **orchestrator alone** writes to
`docs/team-log/events.jsonl`. Sub-agents never write to the log or move the board — no agent marks
its own work done.

Facts that can be derived (commits, diffstat, test counts, mutation scores, timings) come from git
and tooling, never from narration. Narration is confined to the `message` field and is labelled as
such in the board view.

## 10. Definition of Ready / Done

**Ready:** acceptance criteria present · dependencies merged · `arc42:` scope declared ·
`quality_scenarios:` linked · no open clarifications.

**Done:** all tests green · mutation score above threshold on changed files · dependency-cruiser
clean · arc42 reconciled by the architect · ADRs recorded · PR approved by the human.

`npm run slice:check <id>` returns pass/fail. A slice does not reach `done` because an agent
says so.

## 11. Ambiguity

The assessment states that ambiguity is deliberate. Do not silently invent a resolution. Record the
assumption explicitly, flag it for the human, and once decided capture it as an ADR. Documented
assumptions are graded work, not preamble.
