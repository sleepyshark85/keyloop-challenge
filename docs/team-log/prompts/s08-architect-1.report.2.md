# Report · slice 08 · architect · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 08 step 1 design
- Returned: 2026-09-07T04:28:28.882Z
- Duration: 1862s

---

Replying only — the slice file is yours to land, so these are rulings, not edits.

## T-08-1 — **AGREE**, remedy accepted as proposed. Ruled **(a) clarification**. No loopback.

The finding is correct and the wording was mine. Table-wide is not merely fragile here, it is *wrong*: it observes rows that provably cannot matter. Every row that can move either the query's answer or a probe's verdict carries the fixture's `dealership_id` — the exclusion constraints key on `bay_id` and `technician_id`, and the composite FKs `appointment_bay_in_dealership` / `appointment_technician_in_dealership` make a bay and a technician belong to exactly one dealership. So an appointment in another dealership shares no resource with the fixture and can change nothing. **The per-dealership scope weakens nothing; it is the scope the witness always meant, and I wrote the over-broad one.** It also keeps the sensitivity that matters — a probe leaking past mechanic 1's `SAVEPOINT` writes into the fixture's own dealership, so the scoped witness still catches exactly the failure the witness exists for, with the cross-file noise removed. One mechanical note for the test-engineer: take `count(*)` and `max(updated_at)` in one row and compare NULL-safely, since `max` over an empty set is NULL before the first fixture write.

## T-08-2 — **AGREE** on the finding, and I **withdraw AC-7**. Ruled under mid-slice scope authority, provisional at the gate. No loopback.

The citation is right and it is dispositive: `ambiguity-containment.test.ts:507-524` resolves the marker against the real `src/` tree by exact-file equality, in CI, on every commit, and `candidateRepository.ts` is absent from `PERMITTED_FILE`. So the claim is asserted today and slice 08 need only avoid breaking it — which Option D does by construction. **A Definition-of-Done criterion that is satisfied before the slice opens cannot fail the slice, and a criterion that cannot fail is not evidence** — which is `CLAUDE.md` §2.4's own argument, and I minted one against it a week after ruling on exactly that shape. That goes on the record as mine.

To your second question: yes, its value was the naming, and the naming survives without the criterion. **The obligation is discharged by citation, not by a new test** — the slice file's *Inherited scope* records that slice 05's AC-1 attribution rests on `appointment-table-access` resolving to exactly `src/persistence/appointmentRepository.ts`, cites that test by file and line, and notes that ADR-0032 Option D is the only considered option that leaves the list unchanged. That is the implementer's consequence, which is better than what I wrote, and it belongs in the record. So: drop AC-7, keep the sentence, keep the citation. Six ACs, as the file shipped.

## T-08-3 — acknowledged, and its one condition is ruled into AC-1.

The backstop is theirs, not the design's, and it is stronger than what I specified. Its condition is now a requirement rather than an observation.

## AC-1, exact wording

> **AC-1** — Given an arbitrary generated schedule over one dealership and an arbitrary query interval, with no concurrent writer, then over the **candidate universe** for the queried (dealership, service type) — `candidateResources`' bays × technicians — **every** pair the query reports free is accepted by an `INSERT` of exactly `[from, to)`, and **every** pair it omits is rejected with SQLSTATE `23P01`. Each probe is a `SAVEPOINT` that is rolled back; a verdict of `23503`, `23514` or `40P01` fails the run **distinctly**; the two directions are counted apart and the shrunk counterexample names which failed; and the generator is biased to produce appointments ending exactly at `from` and starting exactly at `to`. **Quiescence is witnessed, not declared:** the query is re-run after the probes and must return a byte-identical answer, and `count(*)` with `max(updated_at)` over `appointment WHERE dealership_id = $1` — the fixture's own dealership, since no other dealership shares a bay or a technician with it — must be unchanged. A case failing the witness is discarded through **`fc.pre()`**, never swallowed by a `try/catch`, so a systemic leak trips fast-check's too-many-discards error and fails loud rather than passing quietly. *(QS-8)*

Loopbacks remain **0 of 2**. Neither finding names an acceptance criterion, `QS-*` or §2 clause that the design would have failed — T-08-1 is my wording over-reaching what the harness supports, T-08-2 is my own criterion withdrawn. Both are recorded as findings against step 1, not against the build. Please also append T-08-1's scope correction, the AC-7 withdrawal and its reason to my PR comment when you post it, so the amendment and its rulings are on the thread rather than only in the slice file.
