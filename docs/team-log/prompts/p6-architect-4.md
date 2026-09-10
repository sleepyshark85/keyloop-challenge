# Prompt · phase 6 · architect · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Write the centralizing booking ADR
- Sent: 2026-09-09T09:23:11.536Z

---

Two linked work items, ruled by the human: record the booking decision as its own ADR, and pull §4.1 back to a high-level summary that points at it.

## The finding this rests on

**The most important decision in this system has no ADR.** Every booking-related ADR is a satellite of it:

| ADR | Decides |
|---|---|
| 0004 | retry across remaining candidates |
| 0009 | candidate ordering and attempt cap |
| 0016 (proposed) | a capacity refusal requires a database verdict |
| 0018 | lock the bay and the technician before each insert |
| 0035 (proposed) | one conflict counted per exclusion violation |

The decision they orbit — *overlap is made unrepresentable; the database adjudicates every booking* — arrived in `CLAUDE.md` §2.1 as a NON-NEGOTIABLE standing invariant at phase 0, before the ADR process existed. No ADR has it as its Decision; seven merely cite it. That is why §4.1 had to carry the whole argument, and why the human could not find the decision documented anywhere as a decision.

## Work item 1 — ADR-0036, how a booking is made

Next free id is **0036** (0011–0015, 0017, 0020–0023 and others are gaps from the earlier retirement of non-architectural ADRs; do not reuse them).

Follow `docs/adr/_template.md`. Budget is **700 words**, the same as every other ADR — `docs:budget:check` enforces it, and several existing ADRs sit at 697–700, so this is tight and deliberate.

**Context** — the brief asks for the defect in as many words: *"Before confirming, check for the availability of both a ServiceBay and a qualified Technician for the entire service duration."* The window between that read and the write cannot be closed by care in application code.

**Considered options** — the set genuinely weighed. At minimum: check-then-act as written; a per-dealership application lock or `SERIALIZABLE` isolation (under which check-then-act is genuinely correct — rejected because correctness then depends on every present and future write path remembering to take it); a `UNIQUE` index (cannot express overlap, which is not an equivalence relation); a trigger computing overlap (check-then-act moved inside the database — it reads other rows, and two concurrent triggers under READ COMMITTED both read "free"); and PostgreSQL exclusion constraints. The template is explicit: *"An ADR with one option considered is a note, not a decision record."*

**Decision** — exclusion constraints, and why.

**Consequences** — the four that run through the whole design (correctness is a property of the data not the code; the write is the decision; availability queries are advisory; the failure mode is a specific catchable SQLSTATE), plus the cost §11.2 R-1 records: the constraint serialises writers that actually conflict, capping write throughput for one contended resource.

### Two hard limits on what this ADR may do

1. **It RECORDS a decision already made. It does not re-open it.** The chosen option is settled and non-negotiable under CLAUDE.md §2.1. Write it as the record that was never written, not as a fresh deliberation with a foregone conclusion.
2. **It must NOT restate the satellites' evidence.** ADR-0018's control table (locks off + constraints: 1 row, 108 deadlocks; locks on + constraints dropped: 20 rows) stays ADR-0018's, cited not copied. Same for ADR-0009's bound arithmetic and ADR-0004's Option D. This ADR is the *centre*; the satellites keep their own measurements. Copying them here recreates exactly the duplication this whole exercise is removing.

**Provenance must be truthful and is the point.** `proposed-by: human` and `decided-by: human` — this was the human's decision at phase 0, in CLAUDE.md, before any agent existed on the project. `ai-input` should say plainly that the agent recorded a pre-existing constitutional decision retrospectively and contributed no part of the choice. A flattering or vague value here is worse than none; the template says so.

`status: accepted`. `date`: today, 2026-09-09. `arc42:` should list the sections this decision governs — at least §4.1, §6.1, §8.2, and §8.6.

## Work item 2 — pull §4.1 back to high level

`docs/arc42/04-solution-strategy.md` §4.1 currently carries the full argument, which duplicates ADR-0004 Option D, ADR-0008's port rejection and ADR-0018's measurements. With ADR-0036 existing, it should not.

**Keep** — the rejected `checkAvailability` TypeScript snippet (the brief's own wording turned against itself, and the most persuasive twenty lines in §4); the chosen mechanism stated plainly; the four consequences, because §5–§8 are shaped by them; and **the integrity-versus-spurious-refusal distinction**, which is in no ADR and is genuinely §4's: the constraints prevent double-booking alone, while retry and candidate ordering prevent spurious refusal (QS-3).

**Cut to a sentence plus a citation** — the option-by-option rejection rationale, and the both-ways lock measurement. Name what was rejected and point at ADR-0036 for why; point at ADR-0018 for the locks.

**Keep the lock reconciliation, but shrink it.** §4 must still not read as rejecting locks outright — one sentence that the advisory locks buy a determinate verdict and decide nothing, citing ADR-0018, is enough now that ADR-0036 holds the argument.

The section should end up **shorter than the 1,216 words it was before today**, not merely shorter than its current 1,476. Report the arithmetic.

## Constraints

1. Touch only `docs/adr/0036-*.md` (new) and `docs/arc42/04-solution-strategy.md`. No other ADR — do not edit, supersede, or renumber 0004, 0009, 0016, 0018 or 0035; nothing about them changes and CLAUDE.md §4 makes their decisions immutable. No `src/`, no `tests/`, no team-log write.
2. **Do not commit.** Leave it in the working tree.
3. Run and report: `npm run docs:adr-check`, `npm run docs:budget:check`, `npm run docs:refs`, `npm run docs:check` (run `npm run docs:build` if it reports staleness; no other agent is running).

Report: the ADR's option set and why each was rejected in one line; the provenance you wrote and your reasoning for it; §4.1's before/after word count; and whether writing this record surfaced anything the satellites assume but nothing states.
