# Report · phase 6 · architect · invocation 4

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Write the centralizing booking ADR
- Returned: 2026-09-09T09:29:29.395Z
- Duration: 376s

---

All checks green, nothing committed.

## Files

- **`/home/agentadmin/sources/keyloop-challenge/docs/adr/0036-overlap-is-unrepresentable-the-database-adjudicates.md`** (new) — 665 words against the 700 budget, not `contested`.
- **`/home/agentadmin/sources/keyloop-challenge/docs/arc42/04-solution-strategy.md`** — §4.1 rewritten.

Three files changed as a mechanical consequence of the mandated checks, not as authored edits: `tools/docs/adr-baseline.json` (the `--pin` the `docs:adr-check` failure message itself prescribes — it warns explicitly against `--rebaseline`, which I did not run), and `docs/arc42/09-architecture-decisions.md` + `docs/system-design.md` (generated blocks rebuilt by `docs:build`; the §9 diff is one index row). No other ADR was opened.

## Work item 1 — the option set

| Option | Rejected because |
|---|---|
| **A** Check-then-act as the brief words it | Every variant keeps the shape — a shorter window, a re-check, a version column, `SELECT … FOR UPDATE` over a row that does not yet exist. Each fails under some interleaving or is B in disguise |
| **B** Per-dealership advisory lock, or `SERIALIZABLE` | Honestly correct — and correctness becomes a *discipline*. Every present and future write path must remember to take it, and nothing fails when one forgets until two cars arrive for the same ramp (cited to ADR-0004 Option D, not restated) |
| **C** A `UNIQUE` index | It cannot express the property. Uniqueness rejects rows *equal* on a key; overlap is not an equivalence relation, and no key exists whose equality means "these intervals intersect" |
| **D** A trigger computing overlap | Check-then-act with the check moved inside the database: the trigger reads other rows, and under `READ COMMITTED` two concurrent triggers both read "free" |
| **E** PostgreSQL exclusion constraints | **Chosen** |

Consequences carry the four that run through the design, plus four costs, each a one-line citation rather than a copy: throughput (§11.2 R-1), check-then-act made *harmless* not impossible (ADR-0016), deadlock-without-verdict and spurious refusal as the two things built on top (ADR-0018, ADR-0004/0009), and the scope boundary. ADR-0018's control table, ADR-0009's bound arithmetic and ADR-0004's Option D are cited and stay theirs.

## Provenance

`proposed-by: human`, `decided-by: human`. The choice was made at phase 0 in `CLAUDE.md` §2.1, before the ADR process and before any agent ran; no agent was ever asked whether it was right, and this record does not ask now. `ai-input` says the agent contributed no part of the choice and states one weakness plainly: **the option set is reconstructed, not minuted.** A, B and E were argued at the time and are quoted from §2.1, §4.1 and the satellites; C and D are rejected here on reasoning rather than on contemporaneous deliberation. Marking C and D as if they had been weighed live would be exactly the flattering value the template warns against, and an assessor comparing dates would catch it.

## Work item 2 — the arithmetic

| | §4.1 | whole file |
|---|---|---|
| before today (`b055a43`, 09-07) | 523 | 1,395 |
| after the condense pass (`4dc252a`) | 463 | 1,216 |
| current `HEAD` (`6cbbcb3`) | 792 | 1,476 |
| **now** | **516** | **1,200** |

−276 words, −35% on §4.1; the file lands 16 under the 1,216 the brief set as the bar. Kept: the `checkAvailability` snippet, the mechanism stated plainly, all four consequences, and the integrity-versus-spurious-refusal distinction with QS-3. Cut to a sentence: the option-by-option rejection (now a named list ending in ADR-0036) and the both-ways lock measurement (now "measured both ways", citing ADR-0018). One detail worth flagging — §4.2's table says ports and adapters were "rejected in §4.1", so the `BookingRepository` port stayed in that named list; cutting it would have dangled that pointer.

## What the record surfaced

**Nothing in this repository verifies that the database it connects to actually carries the constraints.** Every satellite assumes their presence, and ADR-0018's own control row is the proof that absence is silent: locks on, constraints dropped — twenty overlapping rows, zero deadlocks, zero refusals. No error, no `40P01`, no `409`; just double bookings. The test suite cannot observe that state, because every test builds its container from the migrations that create them. There is no startup assertion and no migration-drift check, and §7 is deliberately minimal, so nothing covers it operationally either. "Correctness is a property of the data" is true only of data in a database that carries the constraint — and the one gap in the argument is the one thing the design never checks. I did not book it as debt: §11 is outside the two files I was scoped to, and adding a `Bad, or deferred` line whose §11 row I cannot write would create an obligation no tool can see. It needs your ruling.

Smaller, latent: §8.2 states that cancelling frees the slot through the partial predicate. The converse is nowhere — an `UPDATE … SET status = 'confirmed'` on a cancelled row is a *booking* as far as the constraint is concerned, and would inherit ADR-0018's obligation to take both locks. No endpoint does it today, so it is a trap for a future write path rather than a defect.

```json
{
  "role": "architect",
  "outcome": "designed",
  "arc42_sections_touched": ["§4.1"],
  "adrs": [{"id": "0036", "status": "accepted", "supersedes": null}],
  "quality_scenarios": ["QS-3"],
  "assumptions": [],
  "open_questions": ["Nothing verifies that the deployed database carries the exclusion constraints; their absence is silent and untestable by a suite that builds its own schema. Needs a §11 debt row I was not scoped to write."],
  "dcr_ruling": null,
  "message": "ADR-0036 records the decision the system exists for — five options, provenance human/human, 665 of 700 words — and §4.1 drops from 792 to 516, taking the file to 1,200 against the 1,216 bar. docs:adr-check, docs:budget:check, docs:refs and docs:check all pass; nothing is committed."
}
```
