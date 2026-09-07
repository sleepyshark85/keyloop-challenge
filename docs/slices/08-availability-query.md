---
id: "08"
title: Availability — advisory by contract, and provably in agreement with the constraint
status: ready
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

- **AC-1** — *(amended at step 1)* Given an arbitrary generated schedule over one dealership and an
  arbitrary query interval, with no concurrent writer, then **every** (bay, technician) pair **in the
  candidate set** the query reports free is accepted by an `INSERT`, and **every** pair it omits is
  rejected with `23P01`. The probe interval is **exactly `[from, to)`**. *(QS-8)*
  <br>**The universe is the candidate set, not every pair** — over "every (bay, technician) pair" an
  unqualified technician is `23503`, not `23P01`, so QS-8 is false as §10.2 writes it (`F-08-2`). Five
  mechanics are required, each closing one way the property passes while wrong: rolled-back
  `SAVEPOINT` probes; the verdict read as SQLSTATE `23P01` exactly; both directions counted
  separately; a generator **biased to the `[)` boundary**; and a **quiescence witness** — re-run the
  query after the probes and assert a byte-identical answer with unchanged `count(*)` and
  `max(updated_at)`. **A run whose witness fails is *invalid*, not a QS-8 failure.** No isolation
  level collapses stale and wrong: an exclusion check deliberately ignores the snapshot, so the read
  and the constraint run on two clocks no `BEGIN` aligns.
- **AC-2** — Given a bay with a confirmed appointment `[09:00, 10:00)`, when availability is queried
  for `[09:30, 10:30)`, then that bay is not returned; when queried for `[10:00, 11:00)`, it is.
- **AC-3** — Given a technician qualified for a service type at dealership X only, when availability
  is queried at dealership Y, then that technician is not returned (A-3, A-9).
- **AC-4** — Given a cancelled appointment, when availability is queried over its interval, then the
  resources it held are reported free.
- **AC-5** — *(amended at step 1)* Given any availability response, when it is read, then it carries
  an explicit advisory flag, and the response **and** the OpenAPI description carry **both** facts:
  that a free result is **not a reservation**, and that it is true **only of the interval queried**.
- **AC-6** — *(amended at step 1)* Given a query where **`to <= from`**, then `400` with
  `type=/problems/malformed-request`.
  <br>Not `to < from`. `from == to` is an empty `tstzrange`, which overlaps nothing, so the query
  would report **everything** free — vacuously true — and a probe of that window is refused by
  `23514` rather than `23P01`, putting it outside QS-8's universe entirely. The database guards
  `ends_at > starts_at`; the route must guard the same way round (`F-08-3`).
- **AC-7** — *(added at step 1)* Given the `ambiguity-containment` marker `appointment-table-access`,
  when it is resolved after this slice, then it names exactly `src/persistence/appointmentRepository.ts`
  — **unchanged**. This re-derives slice 05's AC-1 attribution structurally rather than by argument,
  and it is the criterion that would catch `F-08-1`: §6.5 has specified `candidateRepository.freeResources`
  since phase 2, which by set equality *is* that marker, and `ambiguity-containment.test.ts:742` plants
  that exact form as a control **expecting a violation**.

## Inherited scope — from slice 05, ruled at its step 5 (R-05-2)

- **AC-1 of slice 05 rests on a fact this slice deletes** (no ref — this obligation was ruled at
  slice 05 step 5 as R-05-2's third routing and recorded in the ruling's prose rather than as a
  finding of its own; O-39's rule, made at slice 06, would require one today).
  ** What makes cancellation's freed-slot proof
attributable is that `candidateResources` reads only `service_bay`, `technician` and
`technician_qualification` — **never `appointment`** — so the candidate list is *identical* before and
after the cancel, and the only thing that moved between the `409` and the `201` is the constraint's
verdict on ADR-0004's retry attempts. The advisory pre-filter named in Out of scope below makes the
candidate path read `appointment`, and that attribution stops holding: a `201` after a cancel could
then come from a changed candidate order rather than from the predicate.

**So slice 08 owes slice 05's AC-1 a re-derivation**, not a deletion. The cheapest form is to keep the
1×1 fixture, where a pre-filter cannot change an order of one — but that must be *asserted* here
rather than left true by accident, because the trap slice 05 closed by shape reopens the moment the
fixture widens. Its AC-4 above is the availability-side mirror and does not substitute for it.

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

- The availability query and its route; `tests/property/availability-agrees-with-constraint.test.ts`
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
