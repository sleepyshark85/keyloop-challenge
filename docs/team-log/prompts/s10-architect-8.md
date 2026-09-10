# Prompt · slice 10 · architect · invocation 8

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Rebalance arc42 §8.1 and §8.4
- Sent: 2026-09-09T07:21:23.297Z

---

Task: rebalance `docs/arc42/08-crosscutting-concepts.md`. §8.1 is over-weighted and §8.4 is under-served. The user's words: "minimize the part for domain modelling, probably just a relation diagram and a few notes on each should be enough. Focus more on observability (with diagram too, if needed)."

This is editorial rebalancing plus two new figures. No architecture changes, no ADR — the model and the telemetry design are unchanged, only how they are presented.

## Work item 1 — shrink §8.1 to a diagram plus notes

§8.1 currently spends lines 5–124 mostly on an inline `CREATE TABLE` dump reproducing all nine tables. **That DDL already exists verbatim in `src/persistence/migrations/0001–0003*.sql`**, which is the executable copy. Two copies of the same DDL is exactly the drift risk arc42 should not be creating, and §4 of CLAUDE.md makes arc42 the source of truth for *architecture* — the model and its reasoning — not for schema text.

Replace the dump with:
- **an entity-relation diagram** (new, in `docs/diagrams/`), and
- **short notes**, a line or two per entity where a line is warranted.

The diagram must carry what a plain ER drawing usually loses, because in this schema the relationships *are* the design:
- nine tables, with the seven reference-data tables visually distinct from `appointment`, the only table the API writes, and `opening_hours` marked as reference data the API reads but never joins to
- the plain 1:N edges (dealership→bay/technician/opening_hours, customer→vehicle) drawn quietly
- **the composite foreign keys drawn as the prominent edges**, because each asserts a relationship *between two references*, not the existence of one: `(technician_id, service_type_id)` → `technician_qualification` is requirement 2's first half; `(bay_id, dealership_id)` and `(technician_id, dealership_id)` are A-9; `(vehicle_id, customer_id)` is A-6
- **the two exclusion constraints as a temporal self-relationship** on `appointment` — at most one non-cancelled row per bay, and per technician, per instant. It is not a foreign key and must not be drawn as one.
- that `service_type` and `customer` are **not** dealership-scoped, which the current text never states outright and which a reader consistently gets wrong

Keep, compressed, the reasoning currently under "Four things a reader will wonder about" — that is the part only arc42 has:
- `dealership_id`, `service_type_id` and `customer_id` carry no foreign key of their own and that is **complete rather than missing** — they are covered transitively, and adding the singletons would be *harmful*, making the reported constraint non-deterministic when two are violable at once, which §8.6 maps `422` by constraint name
- three of the four composite keys are unreachable from the API, so a violation there is a `500`
- `appointment.id` has no default, keeping `btree_gist` the only required extension; `updated_at` has no trigger
- nothing cascades, because nothing deletes — cancellation is a status transition

**Do not touch §8.2.** Its exclusion-constraint SQL is reproduced verbatim on purpose and CLAUDE.md §2.1 requires that. The migration file says why: "Paraphrasing the one thing that must be exactly right is how it stops being exactly right." §8.2 stays exactly as it is.

**A warning about the word arithmetic:** fenced code is stripped from the count (`tools/docs/budget.mjs:184`). Deleting the SQL dump therefore saves **lines, not words** — it buys you readability, not budget. Do not plan §8.4's expansion on the assumption that §8.1's shrink funded it.

## Work item 2 — give §8.4 a diagram and more room

The figure worth drawing is stated as a goal in §1.2 goal 4: ***the check-then-act window is visible in a waterfall even though the code never relies on it***. Draw that trace waterfall:

- the `{METHOD} {path}` root span
- `availability.candidates` with `candidates.bays` / `candidates.technicians`, ending
- **the gap** between that span's end and the first `appointment.insert` — labelled as the window check-then-act would have raced in, with the point made that *nothing depends on it*, which is why the design is safe
- `appointment.insert` **once per attempt**, so retries appear as separate bars rather than one long one; failed attempts carrying `db.sqlstate=23P01` and `db.constraint`, the last one succeeding

That single picture carries the system's thesis better than any prose in the document, so give it room.

Optionally, if it earns its place, a second small figure for the correlation path: every `pino` line carrying `trace_id`/`span_id` from a `mixin` over the active context, so Loki and Tempo join with no correlation id of their own. Draw it only if it adds something the sentence does not.

Strengthen the prose where it is thin — in particular what an **operator** actually does with each signal, which §1.2 names as a stakeholder ("sees health, conflicts and latency without a debugger") but §8.4 never quite delivers. Keep the metrics table; it is good.

## Constraints

1. **Budget.** The file is at 2380 words; the ceiling is `max(budget 4000, baseline 2380)` = **4000**, so there is real headroom — unlike §6, I have checked this properly. But this project has been condensing hard for several commits, so spend it deliberately: net growth should be modest and justified, not a refill to the ceiling. Report what you spent and on what.
2. **Do not commit.** Another architect is committing on this branch right now and a concurrent `git commit` risks index contention. Leave your changes in the working tree; I will commit them.
3. Export every new diagram: `npm run diagram:export docs/diagrams/<file>.html`. Match the house style and the visual vocabulary established across the existing figures — load the `diagram-design` skill. Note that coral now means SQLSTATE `23P01` across this diagram set and nothing else takes it; honour that in the waterfall.
4. Touch only `docs/arc42/08-crosscutting-concepts.md` and new files in `docs/diagrams/`. No `src/`, no `tests/`, no migrations, no ADR, no team-log write. Do not touch `06-runtime-view.md`, `slice-loop.html` or `METHODOLOGY.md` — another agent holds those.
5. Run and report: `npm run docs:budget:check`, `npm run docs:refs`, `npm run docs:check`.

Report: what §8.1 lost and what survived, what §8.4 gained, the word arithmetic, check output, and any judgement call a reviewer should see.
