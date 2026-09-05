# Report · slice 01 · architect · invocation 4

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 02 design, step 1
- Returned: 2026-09-05T07:29:40.189Z
- Duration: 1479s

---

Done. Branch `slice/02-book-and-read-an-appointment`, two commits, all gates green.

## What the design settles

**`/home/agentadmin/sources/keyloop-challenge/docs/slices/02-design.md`** — ten files across four layers. The decisions you named: `bookAppointment` returns a seven-member `BookOutcome` union mapped by one exhaustive `switch` in `src/http`; `pgError.ts` stays the single `23P01` site; composition order lands in **`src/application/deriveInterval.ts`**, which is *pure* — so the order D-01-1 records as "correct because someone wrote it correctly" gets a unit test and a mutation score, the closest replacement for the compiler it lost.

**On §2.1, the uncomfortable part first:** you cannot catch check-then-act from behaviour here, because the exclusion constraint makes it *harmless*. QS-1 and QS-2 would pass over it. So the mechanisms are structural, and all three were run:

- `ContendedResource` — a brand minted only by SQLSTATE classification. `tsc` exit 0 on the conforming tree; **exit 2, `TS2322`** on a planted check-then-act. A **cast compiles clean**, so the claim is narrowed to "forecloses every shape that does not cast", the same narrowing 00a applied to partial application.
- Two `tests/architecture/` markers, residue named.
- `domain-is-pure`, cited from slice 01's measurement rather than re-claimed.

Nine measurements in §8. Two corrected assumptions I'd already written down — `Date.parse('2026-02-30…')` is *not* NaN, and `additionalProperties: false` **strips** rather than rejects.

## Three things I did not resolve

**E-02-1 — §6(d) escalate. AC-4 is not satisfiable without ADR-0004's retry loop, which the slice puts out of scope.** Measured: when both exclusion constraints are violated PostgreSQL reports the one whose index was **created first** — reversing creation order in a scratch table flips the answer. So AC-3 needs `no_bay_overlap` from a doubly-violating insert and AC-4 needs `no_technician_overlap`, and one index ordering cannot give both. With prune-and-retry the constraint reported *at refusal* becomes the list that emptied — the scarce resource — and both go deterministic. AC-5's "per attempt" and AC-11's "every candidate is refused" already presuppose the loop, and arc42 §6.1 draws it. I designed to the reading that the numbered AC governs the prose bullet, and named the exact bounded deletion if the human rules otherwise.

**E-02-2 — QS-12 becomes unsatisfiable at this slice. Blocking on step 3.** `wall-clock-and-zone` permits `time_zone`/`ianaZone` in exactly one file; Kysely's `Database` interface and the repository must both name the column, and no naming avoids it. §10 is outside my declared scope so I flagged it rather than took it — but if the red commit is written against the marker as it stands it encodes a scenario nothing can satisfy.

**E-02-3 — §8.5's serialiser table is incomplete and its guidance reverses.** Measured: `Type.Literal` substitutes (already recorded), a **union of literals enforces with a loud 500**, `Type.String({enum})` validates nothing. The union is a third and better option than the two §8.5 offers, and the problem schema uses it.

## Also

Two ADRs, both `proposed`: **0016** (a capacity refusal requires a database verdict) and **0017** (disambiguate the ownership FK *after* it fires — measured: unknown vehicle, unknown customer and not-owned all report `appointment_vehicle_owned_by_customer`, so something must separate them; validating before the insert would make the FK's arm inert, which is R-01-4's exact shape).

**No DCR on the red commit.** §7 counts commits, not files; all three test families fail as assertions at the red.

§11.1 reconciled in its own `docs(arc42)` commit — the hand-written table and the "cannot show" framing are gone, "a merge is not a ratification" kept, and the two design details of your fix that would each have reintroduced AB-01-7 are now recorded.

```json
{
  "role": "architect",
  "outcome": "designed",
  "arc42_sections_touched": ["§11.1"],
  "adrs": [
    {"id": "0016", "status": "proposed", "supersedes": null},
    {"id": "0017", "status": "proposed", "supersedes": null}
  ],
  "quality_scenarios": ["QS-1", "QS-2", "QS-9", "QS-11", "QS-12"],
  "assumptions": [
    "DA-02-1 the appointment id is minted by the application, and a retried attempt reuses it",
    "DA-02-2 startsAt/endsAt render as ISO-8601 UTC, never in the dealership's local zone"
  ],
  "open_questions": [
    "OQ-02-1 should the edge reject a calendar-invalid but pattern-valid date (F-02-2)? recommend no; recorded as a limitation"
  ],
  "dcr_ruling": null,
  "message": "Slice 02 designed, two ADRs proposed, §11.1 reconciled to the generator's second source. Three items need the human and none was resolved: AC-4 is not satisfiable without ADR-0004's retry loop (measured — the constraint reported under double violation is decided by index creation order), QS-12's wall-clock marker becomes unsatisfiable the moment a repository names time_zone, and §8.5's serialiser guidance is reversed by two measured rows. The QS-12 flag blocks step 3."
}
```
