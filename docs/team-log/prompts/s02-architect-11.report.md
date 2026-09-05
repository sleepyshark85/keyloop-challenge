# Report · slice 02 · architect · invocation 11

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 02 step 7 as-built
- Returned: 2026-09-05T22:29:12.772Z
- Duration: 867s

---

Reconciliation is committed at `a91b8b7`. Everything verifies green.

## What I changed

`docs/arc42/05-building-blocks.md` · `06-runtime-view.md` · `08-crosscutting-concepts.md` · `10-quality-requirements.md` · `11-risks-technical-debt.md` — the four declared sections plus the two you routed into this pass.

## The as-designed versus as-built delta

| # | arc42 said (as designed) | What merged (as built) | Verdict |
|---|---|---|---|
| 1 | §6.1: a late-arriving racer **blocks** on the winner's in-progress row, then gets `23P01` when it commits. "That blocking *is* the serialisation point" | It **deadlocks**. `check_exclusion_constraint` inserts the index tuple then scans, so simultaneous inserters cycle: **285 of 400 losers returned `40P01`**, 95 `23P01`, over 20 trials. Retry livelocks — an aborted racer re-inserts its tuple. ADR-0018 puts one `pg_advisory_xact_lock` per bay and per technician in front of each attempt | **Wrong, not thin.** §2.1 held throughout — exactly one row survived every trial — but the *status* did not, and the design's own remedy was the one that livelocks |
| 2 | §6.1's serialisation point is the constraint | It is the **advisory lock**, immediately in front of the constraint, at three round trips per attempt instead of one | Corrected in §6.1 and folded into §11.2 R-1 |
| 3 | Design §2.4: "no `db.transaction()` anywhere on this path" | Each attempt **is** a transaction — two lock acquisitions then one `INSERT` — and `db.transaction()` sits inside the loop body and nowhere outside it | **Wrong.** The rule it was reaching for survives verbatim: no transaction wraps the *loop*. The description of the attempt did not |
| 4 | Design §5.1: `reference-data-invalid` "is unreachable over HTTP" | Reachable, and reached end-to-end through a seeded unresolvable zone. Four reference-data faults route to it plus `40P01` | **Wrong.** §8.6's `500` row now says what reaches it and that QS-11 asserts it |
| 5 | §8.5: four serialiser behaviours; guidance was "either the schema does not pin the value, or the test does not assert it from the body" | Six. A `Type.Union` of literals **enforces without substituting**; `Type.String({enum})` passes the wrong value straight through | **Guidance reversed.** Pinning as a union is strictly better than both offered ways out. E-02-3, routed at step 1, now paid |
| 6 | AC-6 claimed `additionalProperties: false` refuses an extra `endsAt` | Fastify's `removeAdditional: true` **strips** it. The property is load-bearing for ADR-0005's emitted document, not at runtime | **Over-claim, corrected.** AC-6 still holds by a second, independent route: no parameter on the path can receive an end |
| 7 | §5.2's `BookOutcome`: five members, `resource: 'bay' \| 'technician'` | Eight members. `resource` is `ContendedResource`, a brand mintable only by `pgError.classify`; `no-verdict` and `reference-data-invalid` are new and render as one §8.6 row | Grown, not wrong |
| 8 | §5.2's `PgOutcome`: three variants | Four — `40P01` → `no-verdict`, the absence of a verdict, deliberately not retried | Grown |
| 9 | Pruning "the whole resource is dropped" | Per resource **value**, not class — bounds the loop at `\|bays\|+\|technicians\|−1` | Clarified (T-02-1), now in §5.2 and the §6.1 diagram |
| 10 | §11: ADR-0014 and ADR-0015 "accepted and unimplemented"; `occupancyInterval` "has no production call site" | Both built; `deriveInterval.ts` calls it | Stale, corrected |
| 11 | §10.2 QS-12: three markers | Six — plus `zone-transport`, `appointment-table-access`, `contended-resource-cast` | Grown |
| 12 | §10.2 QS-11: "also asserts the emitted OpenAPI document matches the committed one" | Not asserted. Seven of eight taxonomy rows are in scope and all seven are reached | Now marked as slice 10's |

**§11 carries ADR-0018's own Consequence** as the first row of a new *cost of ADR-0018's locks* table: inside a per-resource lock a reintroduced check-then-act would be **correct**, not merely harmless, so ADR-0016's argument is weaker after it than before. What survives is the brand, the `appointment-table-access` marker and the two drop-one controls. **F-02-9** sits beside it with slices 06 and 07 named. Neither ADR-0018 nor ADR-0019 was touched; both stay `proposed`.

## Outside the declaration — please route

1. **§6's preamble** (the two "load-bearing conventions", above §6.1). *"Each write attempt is a single statement in autocommit… an attempt is its own transaction… satisfied by construction rather than by savepoint discipline."* Factually wrong now. The prohibition it carries — no transaction wraps the loop — survives verbatim and should stay; the sentence describing the attempt should not. **Highest priority**: it is the last place in arc42 that contradicts what merged.
2. **§6.2** — step 7's loop box reads "loop, attempt ≤ 16, **OUTSIDE any transaction**" and shows no lock acquisition. Same correction, one level down.
3. **§6.3** — the reschedule `UPDATE` is exactly where F-02-9 bites. Slice 06 will read §6.3, not §11.
4. **§8.2** — the design routed F-02-9 to "§11 **and §8.2**". §8.2's consequence 4 already carries an *"Inherited obligation for slice 06"* block; the lock obligation belongs beside it. I put it only in §11.
5. **§8.3** — *"**One case the rule as built gets wrong**… **Accepted, and not yet written**; §11.1 carries it as agreed and unbuilt."* ADR-0015 is built. Correcting it also frees ~120 words from a section that is over budget.
6. **`docs/slices/02-book-and-read-an-appointment.md` frontmatter is still `status: ready`.** §11's *generated* debt register therefore still says ADR-0014 and ADR-0015 are **agreed and unbuilt**. Both are built and merged. arc42 is the single source of truth and currently carries a false row I cannot fix from my paths — `docs:build` will drop both rows the moment the slice is `done`.
7. **`docs/diagrams/concurrent-booking.*`** predates ADR-0018 and does not draw the locks. I added a five-word caption saying so rather than redrawing; the refresh is phase 6's single pass.

## Drift this slice did not cause

- **`slice:check 02` currently FAILs the arc42-correspondence check against my own step-7 commit.** The selector is `onBranch = merge-base(origin/main, HEAD) !== HEAD`. Local `main` is one commit ahead of unpushed `origin/main`, so a post-gate `docs(arc42)` commit on `main` is indistinguishable from branch work and gets governed by the slice's declaration. It resolves on push, when the selector falls back to Conventional Commit scope. Worth the tooling owner's attention: the exemption the comment describes holds only while `main` is pushed.
- **That check is file-granular.** Declaring `§8.6` licenses every edit in `08-crosscutting-concepts.md`, so my §8.5 changes passed unremarked while §11 was flagged. The declaration reads section-level and is enforced file-level.
- **`docs:refs` will not let arc42 mint its own debt ids.** I wrote the new §11 rows as `D-02-1…3` and the guard rejected them — a design-local identifier must be *defined* in a `docs/slices/*-design.md`, and I may not write there. The rows now cite `R-02-2`, `F-02-9`, `F-02-8`, which is arguably better (each points at the argument). But an architect cannot open a new debt id in §11 without the orchestrator's cooperation, and nobody has written that down.
- **`slice:check 02`'s other two FAILs are yours**: "tests green" (newest recorded CI run `fbbe52e` predates `738bcb2`) and "arc42 reconciled to as-built" (no step-7 record in the event log).
- **Budget.** §5 +813, §11 +592, §8 +341, §10 +133; §7 is +300 and I did not touch it. I trimmed ~200 words of genuine duplication while adding (the port's testability cost now lives only in §8.5; the mutation-gate premise only in §8.5; the `occupancyInterval` and purity rationales collapsed to one home each). §5 and §11 grew net because the system grew a mechanism and five debt items. A §5/§11 concision pass belongs in phase 6, and item 5 above is the cheapest single cut available.

## Verification

`npm test` — nodb 22 files, db 8 files, both exit 0 · `npm run lint:arch` — no violations, 81 modules, every root covered · `npm run test:tools` — 21 passed · `npm run docs:build` clean · `npm run docs:adr-check` — 19 ADRs · `npm run docs:refs` — 14 citations, all resolve.

```json
{
  "role": "architect",
  "outcome": "reconciled",
  "arc42_sections_touched": ["§5.2", "§6.1", "§8.5", "§8.6", "§10.2", "§11.1", "§11.2"],
  "adrs": [],
  "quality_scenarios": ["QS-1", "QS-2", "QS-9", "QS-11", "QS-12"],
  "assumptions": [],
  "open_questions": [
    "§6 preamble, §6.2 and §6.3 still describe an attempt as a single statement in autocommit and the loop as lock-free — route them",
    "§8.2 is F-02-9's second declared home and was not taken",
    "§8.3 still says ADR-0015 is accepted and not yet written",
    "slice 02's frontmatter is still status: ready, so §11's generated register asserts ADR-0014 and ADR-0015 are unbuilt",
    "slice:check's arc42 check governs an unpushed step-7 commit, and is file-granular rather than section-granular"
  ],
  "dcr_ruling": null,
  "message": "arc42 now describes the booking path that merged, including the two places the design was wrong rather than thin: §6.1's blocking racer, which actually deadlocks 285 times in 400, and §8.5's serialiser guidance, which reverses under the two rows it was missing. ADR-0018's weakening of ADR-0016 and F-02-9's inherited obligation are in §11 with slices 06 and 07 named; neither proposed ADR was ratified. Five sections need routing before arc42 stops contradicting itself in §6."
}
```
