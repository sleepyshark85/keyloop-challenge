# Keyloop Service Scheduler

Backend for **Scenario A — Unified Service Scheduler**. A customer requests an appointment for a
vehicle, service type, dealership and desired start. The service confirms only if a **service bay**
and a **technician qualified for that service type** are both free for the whole duration, and
persists an Appointment binding customer, vehicle, technician and bay.

Backend only, by design: the client layer is an OpenAPI contract and a cURL harness (slice 09).

## The one invariant

Double-booking is prevented by PostgreSQL, never by application code. Check-then-act is forbidden
(`CLAUDE.md` §2.1): both racers see *free* and both insert.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointment ADD CONSTRAINT no_bay_overlap
  EXCLUDE USING gist (bay_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');
-- and the equivalent on technician_id
```

The booking path attempts the insert and maps SQLSTATE `23P01` to `409 Conflict`. Availability
reads are advisory (ADR-0004, ADR-0016). Attacked under genuine concurrency by the reviewer at
slice 00: 8 racing clients, 1 committed, 7 rejected, the losers blocking on the index page before
failing (`docs/team-log/phase-4-retro.md`, C3).

## Prerequisites

| | |
|---|---|
| Node | `>=22.22.0 <23` or `>=24.0.0 <25` (`package.json` engines; CI installs with `--engine-strict`) |
| npm | `>=10.9.0` |
| Docker | required for the `db` test project — Testcontainers starts a throwaway `postgres:16` |

## Install, run, call

```bash
npm ci
docker compose up -d                      # postgres + otel-lgtm; the service is NOT containerised
npm run build
DATABASE_URL=postgresql://keyloop:keyloop@127.0.0.1:5432/keyloop npm run db:migrate
DATABASE_URL=postgresql://keyloop:keyloop@127.0.0.1:5432/keyloop PORT=3000 npm start
curl -i localhost:3000/health
```

`DATABASE_URL` and `PORT` are required; `LOG_LEVEL` is optional (`src/platform/config.ts`). Config
fails fast and names the variable; connectivity is probed only by `GET /health`, so the service
still starts against a dead database and answers `503`.

| Route | Purpose |
|---|---|
| `GET /health` | operational probe, outside the RFC 9457 taxonomy |
| `POST /appointments` | book — `201`, or a problem document (`409` conflict, `422` unknown reference, `400` invalid request) |
| `GET /appointments/:id` | read back — `200` or `404` |
| `PATCH /appointments/:id` | reschedule — `200`, or a problem document (`404`, `409`) |
| `POST /appointments/:id/cancellation` | cancel — `200`, or `404` |

The full contract, including every `(status, type)` pair per operation, is
[`docs/api/openapi.json`](docs/api/openapi.json) — this table omits nothing as of slice 10 (`S-10-1`).

## Demonstrate it: the cURL harness

With the service from **Install, run, call** still running, this reaches every state transition
and the concurrency invariant from a terminal — no test suite, no other tooling (AC-6,
`docs/api/openapi.json` is the full contract).

```bash
export DATABASE_URL=postgresql://keyloop:keyloop@127.0.0.1:5432/keyloop
export BASE_URL=http://localhost:3000
eval "$(npm run --silent harness:seed)"       # exports DEALERSHIP_ID, SERVICE_TYPE_ID, CUSTOMER_ID, VEHICLE_ID, STARTS_AT

bash harness/book-read-reschedule-cancel.sh   # book, read, reschedule, cancel
bash harness/double-booking.sh                # REQUEST_COUNT (default 10) racers at the same slot
```

`harness:seed` (`harness/seed.mjs`) inserts a fresh, unrelated dealership subtree on every
invocation and prints the five ids above as `export` lines — `eval` on its own output is the whole
setup. Run it again before a second demonstration; re-using one `STARTS_AT` re-books an already
non-free slot.

`book-read-reschedule-cancel.sh` prints each step's HTTP status and `type`, and exits non-zero the
moment one status is not the one that step must answer. `double-booking.sh` fires `REQUEST_COUNT`
concurrent bookings at the identical slot, prints every response, and exits non-zero unless exactly
one is `201` and the rest `409` — the one invariant, demonstrated rather than asserted. Both scripts
need `bash` and `curl` only — no GNU coreutils, no `jq` — and were run by hand on a clean checkout
before this slice was claimed done.

## Tests

`npm test` runs the two Vitest projects as **separate invocations** and merges the results. That is
not a style choice: a single run over both projects aborts in `globalSetup` when Docker is
unavailable and writes a results file containing **0 tests**, which `red-proof` reads as *no
test-engineer-owned suite failed*. A project that did not run is a loud, distinct failure
(`tools/ci/run-tests.mjs`; finding T-01-2, ruled a design defect against `CLAUDE.md` §2.4).

| Command | Covers |
|---|---|
| `npm test` | all three projects merged. Last local run: **829 tests, 59 files, all passing** |
| `npm run test:nodb` | 33 files, no Docker — unit, architecture, contract, most property |
| `npm run test:db` | 25 files against real PostgreSQL via Testcontainers |
| `npm run typecheck` | `src` **and** `tests` (the build config narrows to `src`) |
| `npm run lint:arch` | dependency-cruiser through a wrapper that asserts per-root coverage first |
| `npm run mutation` | Stryker, per changed file against a 0.75 gate. Not always cleared: the human overrode a 71.43% merge at slice 08 (arc42 §13.6); slice 10 missed by 0.7 of a point and was fixed rather than argued |
| `npm run test:tools` | the process tooling's own regression suite, plus the docs guards |

Test ownership is enforced by path and symmetrically (`CLAUDE.md` §5): `tests/{acceptance,contract,
property,concurrency,architecture,performance}/` are the test-engineer's, `tests/unit/` is the
implementer's, `tests/integration/` is shared. The implementer may not edit an acceptance test it
dislikes — it raises a Design Change Request.

`npm run lint:arch` is the wrapper rather than the bare `depcruise` CLI, because the bare CLI exits
`0` having cruised **nothing** when it cannot resolve a compatible TypeScript compiler. That was
the first instance of this project's signature defect and it is why the wrapper exists.

## Seeing how it was built

| Command | Shows |
|---|---|
| `npm run status` | where the project is, derived from the event log, ADRs, slices and git |
| `npm run board` | `docs/board.html` — slices, events, findings |
| `npm run log -- --slice 02` | the raw event log, filtered; `=` derived, `·` reported, `~` narrated |
| `npm run defects` | regenerates `docs/DEFECTS.md` — 369 findings, mean escape distance 1.48 steps |
| `npm run slice:check 02` | pass/fail against the Definition of Ready and Done |
| `npm run docs:budget` | word budgets; `docs:budget:check` is the CI ratchet |

| Artifact | What it is |
|---|---|
| [`docs/arc42/`](docs/arc42/) | the single source of truth for architecture |
| [`docs/adr/`](docs/adr/) | 18 MADR decision records (33 were written; 17 retired into the slice designs that own them), each with an `ai-input` provenance block |
| [`docs/slices/`](docs/slices/) | units of work and their designs |
| [`docs/team-log/`](docs/team-log/) | append-only event log, every prompt as sent and every report as returned |
| [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) · [`CLAUDE.md`](CLAUDE.md) | the process, and the rules binding every agent |

## AI Collaboration Narrative

The full account, with citations, is [arc42 §13](docs/arc42/13-ai-collaboration.md).

**Strategy.** Six agents with **bounded authority** rather than one assistant: architect (arc42 and
ADRs), test-engineer (outside-in tests), implementer (`src/` and unit tests), reviewer (may block,
may not fix), scribe, orchestrator (routes and logs; decides nothing). Every slice runs
design → agree → red → green → review → gate → as-built. The bounds are the design: the
test-engineer defines *done* without having seen the implementation, and the implementer cannot
edit the test that judges it. Both halves are enforced by path, by a `PreToolUse` hook, and by
`git commit --only <paths>` — added after a bare commit swept another role's staged files in and
nearly recorded an authority violation in git history.

**Verification.** Nothing an agent reports is taken on trust. Acceptance tests are committed **red
and observed failing in CI** before implementation exists — run `33984418682` failing, then
`33994990813` green. Mutation testing audits the tests: at slice 02 the reviewer re-ran Stryker
independently and reproduced a **byte-identical survivor set**. Layering is `dependency-cruiser` in
CI, not reviewer opinion. Findings are logged as events, so `docs/DEFECTS.md` is generated and
cannot drift from the record.

**What it caught.** One defect shape recurred and was named: *a mechanism that reports success over
work it never did.* `depcruise` exiting 0 having cruised nothing; Stryker scoring 142 mutants of which
only 21 were ever run against a test; `vitest` writing 0 tests after an aborted `globalSetup`; a scope marker that was
present and wrong. Over twenty instances are on the register — several in the process tooling
itself. The rule that catches them is now binding: **for a discrimination claim, name the mutant;
for a mechanism claim, name the call site.**

**Quality assurance.** A slice is done when `npm run slice:check` says so — not when an agent does.
The human overrode the agents where it mattered: ADR-0001 records a recommendation **overridden**,
at slice 01 the human ruled acceptance criterion AC-6 *literally* against the architect's
preference, and at slice 09 the human reopened a slice Gate D had folded away after all three
BLOCKING findings landed on the folded-in half. Disagreement is expected: `CLAUDE.md` §6 says a
round with none is deference, not consensus — slice 09's step 5 produced this project's **first (c)
ruling**, the architect naming two acceptance criteria and a quality scenario rather than settling
for the softer reading.

**The project is done: 11 built slices (00a–10; 03, 11–13 folded in), 18 ADRs surviving a 33→16
retirement, 369 logged findings.** What it cost per role, what recurred despite the process, and
where §6(b) has no terminal case for a `proposed` ADR on the last slice — none of it smoothed over —
are in §13.5 and §13.6.
