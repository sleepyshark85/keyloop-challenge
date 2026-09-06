# Report · slice 06 · architect · invocation 7

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 06 step 7 as-built
- Returned: 2026-09-06T17:03:40.517Z
- Duration: 1146s

---

Step 7 is complete, both rulings are recorded, and everything is pushed to `slice/06-reschedule-atomic-move` (`659186d`).

## The two rulings

**O-46 — the `reschedule.deadlock` rename is RATIFIED**, as [`/home/agentadmin/sources/keyloop-challenge/docs/adr/0029-a-deadlock-names-the-write-path-a-conflict-does-not.md`](file:///home/agentadmin/sources/keyloop-challenge/docs/adr/0029-a-deadlock-names-the-write-path-a-conflict-does-not.md). The substance is right and the route was not. Three names are shared with booking because the event *is* the same event — `booking.conflict` is I-02-6's observer that design §2.2 pins the move's two controls to, and the other two render the same §8.6 rows. A `40P01` is not a taxonomy row at all: under ADR-0018's locks it can only mean a write path skipped them (§6.1, §11 F-02-9), so its entire diagnostic content is *which path*, and the payload carries `bayId`, `technicianId`, `attempt` and **no path field**. One shared name deletes the only thing the line exists to carry. Cost if I am wrong, written into the ADR rather than left to be discovered: slice 09 sums two names for a total deadlock rate. Option D — one name plus a `path` field — is probably the better long-run shape and is deliberately **not** booked; a third design proposed at step 7 over merged code buys less than slice 09 designing it beside the metric. Slice 09 gets the pointer in its `adr:` frontmatter and in F-06-1's bullet.

**The citation check was right.** I-02-6 ruled only that the constraint name reached no observer the test-engineer may use; it never ruled on sharing names across use cases. The observer citation on `RescheduleDeps.logger` is sound; the quoted principle is not I-02-6's, it is now ADR-0029's. `src/` is not mine to edit, so §11 **D-06-4** carries the correction — D-05-1's shape exactly.

**R-06-D — finding accepted, remedy accepted in full, ADR-0026 not superseded, no loopback.** The measurement is correct and it *narrows* rather than defeats: ADR-0026's stated purpose is verified (`TS2554` for a missing lock, `TS2345` for a bare pair), and only the code comment *"the ONLY minting site"* overstates. Forgetting is the mistake the ADR exists to catch; forging is not one anyone makes by accident. I considered §6 **(b)** and declined its backlog slice: a `unique symbol` brand has no destination that makes it cheaper or stronger, so booking work for it would be manufacturing a slice to satisfy a rule. It is house-wide (`domain/candidates.ts` shares the shape), so it is recorded as residue, not a slice-06 regression — §11 **D-06-2**.

## What moved in arc42, and what paid for it

§6.3 loses the follow-up read it has mandated since phase 2, and §6.6's closing paragraph with it; §6.6's table now shows two deciders and gains the `route-not-found` row. §5.2 records `appointment.ts` **retired**, adds `rescheduleAppointment.ts` and the second loop, and closes F-05-1 in the cell that raised it. §8.2's blockquote stops pointing at slice 06 for racing moves and points at slice 07, recording what AC-1 actually raised the assertion to. §8.6 gains `route-not-found` (the `appointment-not-confirmed` row was already there from phase 2 — one row, not two), moves the `404`'s decider to the read, and its residual is now ADR-0024's invariant. §10 QS-11 goes to nine rows reached. §11 gains D-06-1…D-06-4, F-06-1, F-06-2; R-12 gains slice 06 as its second instance; F-05-1 and D-05-1 leave.

**Let go to pay for it** (four of these files had 0–15 words of headroom): §6.4's QS-7 paragraph, duplicated almost verbatim in §10 — §10's is the one QS-7 links from; §5.2's no-repository-port and second-translation-site paragraphs, compressed to their pointers; §5.2's ADR-0021 emitting-site paragraph; D-02-1, whose argument ADR-0016's own Consequences carry; §8.6's advisory-flag sentence, duplicated in §6.5; R-8's `log:audit` note, which is METHODOLOGY's. **And §10 QS-6 gained no annotation about AC-1's two constraint-name controls, deliberately** — §8.2 now holds that argument, and putting it in both is the duplication the budget exists to catch.

`06-design.md` went 2,997 → 985 against the 1,200 merged ceiling. **O-41 needed no work: the guard is live and slice 06 already passes it** — verified, not assumed.

**I declined O-48 in §11.** The eight unkillable mutants on the `default: {` lines are a decision *not* to suppress; §11 records what is owed, and nothing is. It is in the design's as-built record instead.

## For the gate record — what no test covers

- **QS-4 and QS-5 are asserted by nothing today.** The slice that ships the move ships **zero concurrency evidence for it** — a refused move leaving the original confirmed, and a move never transiently releasing its slot, are both argued from statement atomicity and deferred to slice 07 (`A-06-3`). That is the largest untested gap in what merged, and it is the class of defect §2.1 exists to prevent.
- **`updated_at` advancing is asserted by nothing** (§11 R-10) and is **not on the wire** — `AppointmentView` has no `updatedAt`, so a human tester cannot see it either. Only a direct table read would.
- **`OQ-06-1`, ruled out of scope by me:** a move to the *same* `startsAt` is a `200` that rewrites the row and advances `updated_at`. Slice 05 spent a `CASE` avoiding exactly that on the cancel path. A reasonable person could want a no-op or a `400`.
- **ADR-0025's ruled consequence, worth eyeballing:** a *cancelled* appointment moved *out of hours* answers `400 /problems/outside-opening-hours`, not `409 /problems/appointment-not-confirmed` — the domain rule runs before the status is consulted. Deliberate, and a gate-shaped judgement call.
- **`content-type: application/xml` still returns `500 /problems/internal`**, not `415`. ADR-0024 rules this the invariant holding rather than a gap; it means a client-caused error renders as a server fault.
- **Worth ten minutes by hand:** in a two-bay dealership, book A and B at different times, then move A onto B's interval — it should land in the *other* bay with a `booking.conflict` line on stdout, not a `409`. That re-allocation path is the largest new behaviour and only tests have ever seen its responses.
- **`slice:check` still shows four DoD failures**, three of which are yours: the CI run collection, the `arc42.updated` event (only the orchestrator can write it), and the open MAJOR findings R-06-A/B/C, O-45, O-46, O-49. Gate E is being granted on a board that is not mechanically green.

```json
{
  "role": "architect",
  "outcome": "reconciled",
  "arc42_sections_touched": ["§5.2", "§5.3", "§6.3", "§6.4", "§6.6", "§8.2", "§8.6", "§10.2", "§11.1", "§11.2"],
  "adrs": [{"id": "0029", "status": "accepted", "supersedes": null}],
  "quality_scenarios": ["QS-6", "QS-11"],
  "assumptions": ["A-06-1 — the exclusion mechanism is read off documented check_exclusion_constraint behaviour and slice 00's AC-10, not re-measured; AC-1's two controls are what would catch it being wrong"],
  "open_questions": ["OQ-06-1 — a move to the same instant is a 200 that rewrites the row; ruled out of scope, recorded because the gate may disagree", "Option D for the deadlock taxonomy (one name plus a path field) is probably better long-run and is deliberately unbooked"],
  "dcr_ruling": "O-46 ratified as ADR-0029, content accepted and route not; R-06-D finding and remedy accepted in full, ADR-0026 not superseded, (b)'s backlog slice declined for want of a destination",
  "message": "arc42 reconciled to as-built across seven sections, every addition paid for by a named deletion, and 06-design.md shrunk 2,997 to 985 against its merged ceiling. Two rulings recorded: the reschedule.deadlock rename stands on the ground that a deadlock's only diagnostic content is which write path skipped the locks, and the ResourceLock brand is confirmed unforgettable but forgeable, which narrows one sentence of ADR-0026 without touching its decision."
}
```
