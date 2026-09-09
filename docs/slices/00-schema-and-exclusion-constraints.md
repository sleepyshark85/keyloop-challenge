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

The database refuses to represent a double booking, with no application code in existence. Migrations
create the schema: both exclusion constraints, and every composite foreign key that makes an invalid
appointment unrepresentable — a technician not qualified for the service type, a bay belonging to another
dealership, a vehicle not owned by the named customer. Proven by SQL alone.

**This is the phase-4 pilot slice**, run against retro criteria registered in advance: small,
unambiguous criteria, and the single artifact the whole submission rests on.

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
  inserted, then it is rejected — a bay, like every other resource, belongs to exactly one
  dealership.
- **AC-8** — Given `ends_at <= starts_at`, when an appointment is inserted, then it is rejected by
  `appointment_interval_ordered`.
- **AC-9** — Given the seed fixtures, when they are loaded into an empty database, then every
  reference table is populated and the suite can book against them deterministically.
- **AC-10** — Given confirmed appointments A and B on the same bay but **different technicians**,
  when A is `UPDATE`d onto an interval overlapping **its own** prior interval, then it succeeds; when
  A is `UPDATE`d onto an interval overlapping **B**, then it is rejected with `23P01` on
  `no_bay_overlap` and B is unchanged. *Added by the human at this slice's gate.*
  <br>The property is that an `UPDATE` is checked against other rows and not against the version it
  replaces. Every atomic move in this system rests on it, and nothing asserted it. It belongs here
  rather than at the reschedule slice because there the property is reached through a `PATCH`, a use
  case, a query builder and a retry loop, and a failure would be ambiguous between PostgreSQL's
  `UPDATE` semantics and the application's move logic. **This is the only slice in which it is an
  unambiguous claim about the database.** B sits on a different technician so that exactly one
  constraint is violable and the reported name is evidence rather than a coin flip.

## In scope

- `0001_extensions.sql` (`btree_gist`), `0002_reference_data.sql`, `0003_appointment.sql` — exactly the
  schema arc42 §8.1 states, as plain `.sql` run by `node-pg-migrate`.
- Both exclusion constraints, both carrying `WHERE (status <> 'cancelled')`.
- Seed fixtures: one dealership with opening hours and an IANA zone, bays, technicians, qualifications,
  service types with durations, customers, vehicles.
- `tests/integration/exclusion-constraints.test.ts` — it asserts a database invariant, so it is the
  test-engineer's.

## Out of scope

- Every line of TypeScript that is not a migration runner or a fixture loader. The point of this slice is
  that the invariant holds with no application code to hold it.
- Mapping a violation to `409` — the taxonomy slice. Here the assertion is on SQLSTATE.

## Definition of done

Beyond `CLAUDE.md` §10:

- Migrations run forward from empty on a fresh Testcontainers instance in CI.
- The phase-4 retro is written against the pre-registered criteria before the next slice starts.
