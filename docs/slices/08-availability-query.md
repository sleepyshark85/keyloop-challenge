---
id: "08"
title: Availability — advisory by contract, and provably in agreement with the constraint
status: done
depends_on: ["07"]
arc42: ["§5.2", "§6.5", "§8.6", "§10.2", "§11.2"]
adr: [8, 32, 33]
quality_scenarios: [QS-8, QS-12]
inherits: ["I-04-5", "A-06-4"]   # deferred here by ruling; slice:check enforces it (A-05-5)
loopbacks: 0
gate: light          # human cost ruling 2026-09-05; revoked by any open MAJOR/BLOCKING
---

## Goal

`GET /availability` answers *"what is free?"* for the booking screen. It exists for user experience
and never for correctness, and says so in its own response and its OpenAPI description — staleness is
a property of this domain interface, not an implementation detail.

What can honestly be proven about it is agreement under quiescence: with no concurrent writer, what
it reports free is exactly what the constraint accepts.

## Acceptance criteria

- **AC-1** — *(amended at step 1; scope corrected at step 2 under `T-08-1`)* Given an arbitrary
  generated schedule over one dealership and an arbitrary query interval, with no concurrent writer,
  then over the **candidate universe** for the queried (dealership, service type) —
  `candidateResources`' bays × technicians — **every** pair the query reports free is accepted by an
  `INSERT` of exactly `[from, to)`, and **every** pair it omits is rejected with SQLSTATE `23P01`.
  Each probe is a `SAVEPOINT` that is rolled back; a verdict of `23503`, `23514` or `40P01` fails the
  run **distinctly**; the two directions are counted apart and the shrunk counterexample names which
  failed; the generator is biased to produce appointments ending exactly at `from` and starting
  exactly at `to`; and *(added at step 5 under `R-08-1`, corrected in round 2 under `T-08-7`)*
  **every run carries a cancelled witness** — one generated item written `cancelled`, overlapping
  `[from, to)`, on a bay and a technician **no other in-window item uses**; the remaining items are
  drawn `confirmed`:`cancelled` at 4:1. A query and a constraint can agree on the range and disagree
  on the predicate that scopes it, and without this the `status <> 'cancelled'` conjunct is
  unreachable. A *weight* alone was not enough: exposure needs a cancelled item that is in-window
  **and** unmasked by a confirmed one, and three coincidences multiply into a 1-in-4 miss. As a
  construction the kill is deterministic — the witness's pair is reported busy while its probe is
  accepted. Offered shape, not mandated: draw the witness at index 0 starting inside the window, the
  other items from the remaining indices, restricted to the two `boundary` kinds when a count is 1,
  since mechanic 5 already pins those outside the window. **Quiescence is witnessed, not declared:** the query is re-run after the probes and
  must return a byte-identical answer, and `count(*)` with `max(updated_at)` over
  `appointment WHERE dealership_id = $1` — the fixture's own dealership, since no other dealership
  shares a bay or a technician with it — must be unchanged. A case failing the witness is discarded
  through **`fc.pre()`**, never swallowed by a `try/catch`, so a systemic leak trips fast-check's
  too-many-discards error and fails loud rather than passing quietly. *(QS-8)*
- **AC-2** — Given a bay with a confirmed appointment `[09:00, 10:00)`, when availability is queried
  for `[09:30, 10:30)`, then that bay is not returned; when queried for `[10:00, 11:00)`, it is.
- **AC-3** — Given a technician qualified for a service type at dealership X only, when availability
  is queried at dealership Y, then that technician is not returned (A-3, A-9).
- **AC-4** — Given a cancelled appointment, when availability is queried over its interval, then the
  resources it held are reported free.
- **AC-5a** — *(amended at step 1; split at step 5 under `R-08-2`)* Given any availability response,
  when it is read, then it carries an explicit advisory flag and a disclosure carrying **both** facts:
  that a free result is **not a reservation**, and that it is true **only of the interval queried**.
  The wire shape is pinned (`T-08-5`): `{ bays, technicians, advisory: boolean, disclaimer: string }`,
  and neither field may be a `Type.Literal` (`I-08-5`).
  <br>**AC-5b — the same two facts in the OpenAPI description — is deferred to slice 09**, beside
  AC-9, where the document is emitted and the assertion can therefore fail. Not slice 10, which is a
  tombstone. AC-5 as written bundled an assertable half with one that cannot fail, and survived only
  because bundling hid it — the same ground AC-7 was withdrawn on at step 2.

- **AC-6** — *(amended at step 1)* Given a query where **`to <= from`**, then `400` with
  `type=/problems/malformed-request`.
  <br>Not `to < from`. `from == to` is an empty `tstzrange`, which overlaps nothing, so the query
  would report **everything** free — vacuously true — and a probe of that window is refused by
  `23514` rather than `23P01`, putting it outside QS-8's universe entirely. The database guards
  `ends_at > starts_at`; the route must guard the same way round (`F-08-3`).

## Inherited scope — from slice 05, ruled at its step 5 (R-05-2)

- **AC-1 of slice 05 rests on a fact this slice deletes** (no ref — ruled at slice 05 step 5 as
  R-05-2's third routing, recorded in the ruling's prose rather than as a finding of its own; O-39's
  rule, made at slice 06, would require one today).
  **Discharged by citation rather than by a new criterion** (`T-08-2`): slice 05's AC-1 attribution
  rests on the `appointment-table-access` marker resolving to exactly
  `src/persistence/appointmentRepository.ts`, and
  `tests/architecture/ambiguity-containment.test.ts:507-524` already asserts that against the **real
  `src/` tree by exact-file equality, in CI, on every commit** — `candidateRepository.ts` is absent
  from `PERMITTED_FILE`. **Composing two reads in the use case is the only considered option that leaves that list
  unchanged**, so slice 08 need only avoid breaking a guarantee that already holds. AC-7 was minted
  at step 1 to assert this and **withdrawn at step 2**: a criterion satisfied before the slice opens
  cannot fail it, and a criterion that cannot fail is not evidence — §2.4's own argument.

- **I-04-5 — the advisory pre-filter, and the reason it waits for this slice.** Ruled (b) at slice 04
  with both halves upheld, and the surviving argument is the implementer's: *the pre-filter is
  trustworthy only because of QS-8, and shipping it before the property that validates it is
  backwards.* So the ordering is the point — QS-8 is this slice's, and the pre-filter arrives behind
  it rather than in front of it. The ruling also distinguished an **authoritative allocator**
  (excluded, correctly) from an **advisory pre-filter** (in scope, after QS-8), and that wording was
  applied to this file at the time. D-04-1's other half — filter or a higher cap — the architect
  **declined to rule**; not this slice's to settle.

- **A-06-4 — whether slice 09 has become the place work goes, and this slice's gate must rule it.**
  Raised by the architect at slice 06 step 2 *against its own pattern of rulings*: ADR-0019's
  cheaper-or-stronger criterion is **per-item and has no aggregate**, and slice 09 now holds
  OQ-05-2, F-06-1, A-06-2 and T-06-5 — every one individually correct, three ruled in slice 06
  alone — on top of fifteen ACs and slices 10 and 11 absorbed by Gate D. The architect refused to
  rule it because it owns ADR-0019; the orchestrator declined to re-cut the backlog on a merge
  delegation. **This slice's gate is the last moment the decision is free.** Split slice 09, exempt
  a slice that absorbed two folded slices from receiving deferrals, or accept it is the close-out
  and will be large — and the aggregate-clause question goes to the retro either way.

## In scope

- The availability query and its route; `tests/property/availability-agrees-with-constraint.db.test.ts` (`T-08-4`)
  using `fast-check`.

## Out of scope

- **Any freshness guarantee.** §10 deliberately has no scenario for it: asserting freshness would be
  asserting the property the whole design gives up on purpose.
- Using the query as an **authoritative** allocator — deciding from the read whether a booking may
  proceed. A-5 fixed booking as "can I have 09:00?", not "find me something Tuesday", and making
  availability authoritative would reintroduce check-then-act. **An advisory pre-filter on the
  booking path's candidate list is in scope and is not that**: it changes only which candidate is
  attempted first, every attempt is still adjudicated by the `INSERT`, a refusal still requires a
  verdict (ADR-0016), and it is only trustworthy because AC-1's QS-8 property holds. It closes
  **D-04-1** (slice 04) and unblocks slice 09's AC-13.
- Deleting `docs/slices/99-availability.md`, the synthetic board fixture — that happens at phase 6.

## Definition of done

Beyond `CLAUDE.md` §10:

- The property test holds the constraint's range expression and the query's in agreement. §4.2
  explains why a shared SQL function cannot do this job; the reviewer checks the reasoning still
  applies to what was built.
