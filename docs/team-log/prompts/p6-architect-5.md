# Prompt · phase 6 · architect · invocation 5

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Amend ADR-0036 option set
- Sent: 2026-09-09T09:59:35.810Z

---

Amend ADR-0036's **Considered options** to include the alternatives that were investigated after it was drafted. Human-instructed.

## Read this first — the governance position

`CLAUDE.md` §4 names the **option set** of an accepted ADR as immutable, and `tools/docs/adr-baseline.json` now pins ADR-0036's options, so `docs:adr-check` will fail on this edit until re-pinned. This amendment is nonetheless legitimate, on one specific ground: **ADR acceptance belongs to the human** (`decided-by: human`, always), and this record has never been to a gate — it was drafted today and marked `accepted` because the *underlying* decision was accepted at phase 0. The human is correcting an unreviewed draft, not relitigating a decision.

**The chosen option does not move.** Exclusion constraints remain the decision, the verdict, and every consequence.

**Non-negotiable condition on this work:** the `ai-input` provenance must record that the option set was amended after first drafting, on the human's instruction, and that the added options were reasoned rather than contemporaneously deliberated. The existing line already admits the set is "reconstructed, not minuted" — extend that honesty, do not replace it. An option set that silently grows makes a deliberation look more thorough than it was, which is precisely the flattering value `_template.md` warns against. This condition is the reason the amendment is acceptable at all.

Re-pin with the `--pin` invocation `docs:adr-check`'s own failure message prescribes. Do **not** run `--rebaseline`.

## The options to add

Five already present, unchanged: check-then-act as the brief words it; per-dealership lock or `SERIALIZABLE`; a `UNIQUE` index; a trigger computing overlap; exclusion constraints (chosen).

**Add — slot materialisation.** The one genuine rival, and it appears nowhere in the ADRs or arc42; I grepped. Discretise time into fixed slots, pre-create `(bay_id, slot_start)` rows, book by claiming N consecutive rows under a `UNIQUE` constraint. **It converts overlap into equality**, and equality is enforceable by every database. For: no `btree_gist`, portable to MySQL/SQLite/Aurora, conflict is a plain `23505`, and it matches how many dealerships actually think — fixed slots on a board. Against: every booking must align to the grid, so a 50-minute service on a 15-minute grid wastes ten minutes of a bay every time; claiming N rows is all-or-nothing, returning the multi-row transaction and partial-failure handling the single `INSERT` removed; and A-1's per-service-type durations would have to become multiples of the slot. Rejected because TC-3 already commits to PostgreSQL, and the chosen option gives arbitrary start times and exact durations for nothing. **Give this one its own option and real weight — it is the only alternative that could genuinely have been chosen.**

**Add — external coordination, as ONE grouped option.** A distributed lock (Redis/Redlock), a partitioned single-writer log (Kafka keyed by `bay_id`), durable execution (Temporal), and CRDT/eventual consistency. Group them because they share one rejection ground and it is the ADR's central argument: **each moves correctness out of the data and back into code**, so a `psql` session, a migration or a second writer can still double-book. Then one clause each on what is individually disqualifying:
- Redlock additionally *can lie* — under clock drift or a process pause a holder believes it holds a lock it has lost, so it is strictly worse than Option B, which at least is honestly correct.
- A single-writer log makes booking asynchronous, costing the synchronous `201`.
- Durable execution solves multi-step sagas, not mutual exclusion — genuinely useful later if booking grows to span payment or parts, and orthogonal to this decision.
- CRDTs are the wrong shape: booking is mutual exclusion and has no commutative merge; any convergence rule still picks a loser, just later and in front of the customer.

**Add — a strictly serializable database** (Spanner, FoundationDB). Overlap would still be expressed in application code inside a transaction; PostgreSQL's exclusion constraint is *more* declarative than what they offer for this. Considerable cost for strictly less.

## Constraints

1. **Budget: 700 words, currently 665.** Seven options will not fit by addition. Compress the existing five — they are argued at length and can be argued shorter without losing a rejection ground — and keep the grouped external option tight. If you cannot fit it honestly, say so in your report rather than dropping a rejection ground or thinning the Consequences; Consequences and Decision must survive intact.
2. Do not restate ADR-0018's control table, ADR-0009's bound arithmetic or ADR-0004's Option D. Cite, as now.
3. Touch only `docs/adr/0036-*.md` and `tools/docs/adr-baseline.json`. Do not edit any other ADR, do not supersede anything, do not renumber. If `docs:build` reports staleness afterwards, run it.
4. **Do not commit.** Leave it in the working tree.
5. Run and report: `npm run docs:adr-check`, `npm run docs:budget:check`, `npm run docs:refs`, `npm run docs:check`.

Report: the final option list with each rejection in one line; the exact `ai-input` text you wrote; the word arithmetic and what you compressed to pay for it; and whether you judge any added option strong enough that the human should look at it again rather than take the rejection on trust.
