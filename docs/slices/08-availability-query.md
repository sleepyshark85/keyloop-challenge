---
id: "08"
title: Availability — advisory by contract, and provably in agreement with the constraint
status: done
depends_on: ["07"]
arc42: ["§5.2", "§6.5", "§8.6", "§10.2", "§11.2"]
adr: [8]
quality_scenarios: [QS-8, QS-12]
inherits: ["I-04-5", "A-06-4"]   # deferred here by ruling; slice:check enforces it
loopbacks: 0
gate: light          # human cost ruling 2026-09-05; revoked by any open MAJOR/BLOCKING
---

## Goal

`GET /availability` answers *"what is free?"* for the booking screen. It exists for user experience
and never for correctness, and it says so in its own response and in its published description:
staleness is a property of this interface, not an implementation detail.

What can honestly be proven about it is agreement under quiescence — with no concurrent writer, what
it reports free is exactly what the constraint accepts.

## Acceptance criteria

- **AC-1** — Given an arbitrary generated schedule over one dealership and an arbitrary query
  interval, with no concurrent writer, then over the **candidate universe** for the queried
  dealership and service type — the same bays × technicians the allocator would consider — **every**
  pair the query reports free is accepted by an `INSERT` of exactly `[from, to)`, and **every** pair
  it omits is rejected as an exclusion violation. *(QS-8)*
  <br>Six mechanics make this a gate rather than a probability, and each closes one way the property
  could pass while wrong:
  - Each probe is a `SAVEPOINT` that is rolled back, so no probe's verdict depends on the last.
  - The verdict must be an exclusion violation exactly. A foreign-key, check or deadlock code fails
    the run **distinctly**, so a run in which every probe errors cannot read as green.
  - The two directions are counted apart and the shrunk counterexample names which one failed,
    because a merely *conservative* query would otherwise pass on the free-and-accepted half alone.
  - The generator is biased to produce appointments ending exactly at `from` and starting exactly at
    `to`, since uniform generation reaches the half-open boundary at about zero.
  - **Every run carries a cancelled witness**: one generated item written `cancelled`, overlapping
    `[from, to)`, on a bay and a technician no other in-window item uses, with the remaining items
    drawn confirmed-to-cancelled at 4:1. A query and a constraint can agree on the range and
    disagree on the predicate that scopes it, and without this the constraints' *not cancelled*
    conjunct is never exercised. A *weight* alone was not enough — exposure needs a cancelled item
    that is both in-window and unmasked by a confirmed one, and three coincidences multiply into a
    one-in-four miss. As a construction the kill is deterministic: the witness's pair is reported
    busy while its probe is accepted.
  - **Quiescence is witnessed, not declared.** The query is re-run after the probes and must return a
    byte-identical answer, and the row count and latest update time for the fixture's own dealership
    must be unchanged — no other dealership shares a bay or a technician with it. A case failing the
    witness is **discarded**, never swallowed by a `try`/`catch`, so a systemic leak trips the
    property runner's too-many-discards error and fails loud rather than passing quietly.
- **AC-2** — Given a bay with a confirmed appointment `[09:00, 10:00)`, when availability is queried
  for `[09:30, 10:30)`, then that bay is not returned; when queried for `[10:00, 11:00)`, it is.
- **AC-3** — Given a technician qualified for a service type at dealership X only, when availability
  is queried at dealership Y, then that technician is not returned.
- **AC-4** — Given a cancelled appointment, when availability is queried over its interval, then the
  resources it held are reported free.
- **AC-5a** — Given any availability response, when it is read, then it carries an explicit advisory
  flag and a disclosure carrying **both** facts: that a free result is **not a reservation**, and
  that it is true **only of the interval queried**. The wire shape is pinned as
  `{ bays, technicians, advisory: boolean, disclaimer: string }`, and neither of those two fields may
  be a literal type.
  <br>**The same two facts in the OpenAPI description are deferred to the close-out slice**, where
  the document is emitted and the assertion can therefore fail. As originally written this criterion
  bundled an assertable half with one that cannot fail, and survived only because bundling hid it.
- **AC-6** — Given a query where **`to <= from`**, then `400` with
  `type=/problems/malformed-request`.
  <br>Not `to < from`. An empty range overlaps nothing, so `from == to` would report **everything**
  free — vacuously true — and a probe of that window is refused as a check violation rather than an
  exclusion violation, putting it outside QS-8's universe entirely. The database guards
  `ends_at > starts_at`; the route must guard the same way round.

## Inherited scope — from the cancellation slice, ruled at its step 5

- **The cancellation slice's AC-1 rests on a fact this slice deletes** *(no ref — recorded in the
  ruling's prose rather than as a finding of its own; today's rules would require one)*.
  **Discharged by citation rather than by a new criterion.** That attribution rests on the marker for
  *reads of the appointment table* resolving to exactly `src/persistence/appointmentRepository.ts`,
  and the ambiguity-containment test already asserts that against the **real `src/` tree by exact
  file equality, in CI, on every commit** — the candidate repository is absent from the permitted
  list. **Composing two reads in the use case is the only option considered that leaves that list
  unchanged**, so this slice need only avoid breaking a guarantee that already holds. A criterion
  minted at step 1 to assert it was **withdrawn at step 2**: one satisfied before the slice opens
  cannot fail it, and a criterion that cannot fail is not evidence.
- **`I-04-5` — the advisory pre-filter, and why it waits for this slice.** Ruled a deferred
  improvement at the allocation slice with both halves upheld, and the surviving argument was the
  implementer's: *the pre-filter is trustworthy only because of QS-8, and shipping it before the
  property that validates it is backwards.* So the ordering is the point — QS-8 is this slice's, and
  the pre-filter arrives behind it rather than in front of it. That ruling also distinguished an
  **authoritative allocator**, correctly excluded, from an **advisory pre-filter**, in scope once
  QS-8 holds. Whether to filter or to raise the attempt cap the architect **declined to rule**; it is
  not this slice's to settle.
- **`A-06-4` — whether the close-out slice has become the place work goes, which this slice's gate
  must rule.** Raised by the architect at the reschedule slice *against its own pattern of rulings*:
  the deferral criterion is per-item and has no aggregate, and the close-out slice now holds four
  deferred obligations — three of them ruled in one slice, every one individually correct — on top of
  fifteen acceptance criteria and two folded slices. The architect refused to rule it because it owns
  that criterion; the orchestrator declined to re-cut the backlog on a merge delegation. **This
  slice's gate is the last moment the decision is free.** Split the close-out slice, exempt a slice
  that absorbed two folded slices from receiving deferrals, or accept that it is the close-out and
  will be large. The aggregate question goes to the retro either way.

## In scope

- The availability query and its route, and the property test that races it against the constraint.

## Out of scope

- **Any freshness guarantee.** arc42 §10 deliberately has no scenario for it: asserting freshness
  would be asserting the property the whole design gives up on purpose.
- Using the query as an **authoritative** allocator — deciding from the read whether a booking may
  proceed. Booking is fixed as *"can I have 09:00?"*, not *"find me something Tuesday"*, and making
  availability authoritative would reintroduce check-then-act. **An advisory pre-filter on the
  booking path's candidate list is in scope and is not that**: it changes only which candidate is
  attempted first, every attempt is still adjudicated by the `INSERT`, and a refusal still requires a
  database verdict.
- Deleting the synthetic board fixture under `docs/slices/` — that happens at phase 6.

## Definition of done

Beyond `CLAUDE.md` §10:

- The property test holds the constraint's range expression and the query's in agreement. The design
  explains why a shared SQL function cannot do that job; the reviewer checks the reasoning still
  applies to what was built.
