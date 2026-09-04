---
id: "00"
title: The schema, the exclusion constraints, and seed data — the invariant before any code
status: done
depends_on: ["00a"]
arc42: ["§8.1", "§8.2"]
adr: [1, 2, 3, 7]
quality_scenarios: [QS-1, QS-2, QS-11]
loopbacks: 0
---

## Goal

The database refuses to represent a double booking. Migrations create §8.1's schema, including both
exclusion constraints and every composite foreign key that makes an invalid appointment
unrepresentable — a technician not qualified for the service type, a bay belonging to another
dealership, a vehicle not owned by the named customer. Proven by SQL, with no TypeScript domain code
in existence.

**This is the phase-4 pilot slice.** It runs the full loop against the pre-registered retro criteria.
It was chosen because it is small, has unambiguous acceptance criteria, and lands the single artifact
the whole submission rests on.

## Acceptance criteria

- **AC-1** — Given migrations have run, when an appointment is inserted for a bay and interval, then
  a second insert overlapping that bay's interval is rejected with SQLSTATE `23P01` naming
  `no_bay_overlap`.
- **AC-2** — As AC-1 for a technician; the constraint reported is `no_technician_overlap`. Asserted
  separately, because two constraints are two objects and one passing is no evidence for the other.
- **AC-3** — Given an appointment `[09:00, 10:00)`, when an appointment `[10:00, 11:00)` is inserted
  for the same bay, then it succeeds — `tstzrange` is half-open and adjacency is not overlap.
- **AC-4** — Given a confirmed appointment, when its status is set to `cancelled`, then an insert
  overlapping its interval succeeds — the constraints' `WHERE (status <> 'cancelled')` predicate is
  live and not decorative.
- **AC-5** — Given a technician with no qualification for a service type, when an appointment naming
  both is inserted, then it is rejected with `23503` on `appointment_technician_qualified`.
- **AC-6** — Given a vehicle owned by customer X, when an appointment naming that vehicle and
  customer Y is inserted, then it is rejected with `23503` on
  `appointment_vehicle_owned_by_customer`.
- **AC-7** — Given a bay at dealership X, when an appointment naming that bay and dealership Y is
  inserted, then it is rejected — resources never span dealerships (A-9).
- **AC-8** — Given `ends_at <= starts_at`, when an appointment is inserted, then it is rejected by
  `appointment_interval_ordered`.
- **AC-9** — Given the seed fixtures, when they are loaded into an empty database, then every
  reference table is populated and the suite can book against them deterministically.
- **AC-10** — Given confirmed appointments A and B on the same bay, when A is
  `UPDATE`d onto an interval overlapping **its own** prior interval, then it succeeds; when A is
  `UPDATE`d onto an interval overlapping **B**, then it is rejected with `23P01` on `no_bay_overlap`
  and B is unchanged. *Added by the human at slice 00's gate, 2026-09-04.* arc42 §8.2 consequence 4
  — an `UPDATE` is checked against other rows, not against the version it replaces — is the single
  property ADR-0003's atomic move rests on, and it was asserted nowhere. §8.5 names it in the same
  sentence as cancellation-frees-the-slot, which landed as AC-4; its sibling clause did not, and
  §8.2 defers it to QS-6, which has no slice. It belongs here rather than at slice 06 because by
  then the property is reached through `PATCH`, a use case, Kysely and ADR-0004's retry loop, and a
  failure there is ambiguous between PostgreSQL's `UPDATE` semantics and the application's move
  logic. **This is the only slice in which it is an unambiguous claim about the database** — the
  same reasoning that keeps AC-5 and AC-7 here. *Clarified the same day (T-9): the original wording
  said "the same bay **and technician**", which would make `no_technician_overlap` violable too and
  put the named assertion back on §11.2 A-2's non-guarantee about which of two simultaneously
  violable constraints PostgreSQL reports. The test-engineer authored that wording, measured that
  the literal fixture passes on 16.15 by index order alone, wrote the case with B on the other
  technician, and raised the contradiction rather than following it — so `no_bay_overlap` is the
  only violable constraint and the assertion is evidence rather than a coin flip.*

## In scope

- `0001_extensions.sql` (`btree_gist`), `0002_reference_data.sql`, `0003_appointment.sql` — exactly
  §8.1's schema, as plain `.sql` run by `node-pg-migrate` (ADR-0007).
- Both exclusion constraints, both `WHERE (status <> 'cancelled')`.
- Seed fixtures: one dealership with opening hours and an IANA zone, bays, technicians,
  qualifications, service types with durations, customers, vehicles.
- `tests/integration/exclusion-constraints.test.ts` — a database-invariant test, test-engineer owned
  per `CLAUDE.md` §5.

## Out of scope

- Every line of TypeScript that is not a migration runner or a fixture loader. The point of this
  slice is that the invariant holds with no application code to hold it.
- The `409` mapping — slice 03. Here the assertion is on SQLSTATE, not on a status code.

## Definition of done

Beyond `CLAUDE.md` §10:

- Migrations run forward from empty on a fresh Testcontainers instance in CI.
- The phase-4 retro is written against the criteria pre-registered in METHODOLOGY, before the next
  slice starts. Gate D decides whether the loop is tuned or proceeds as-is.
