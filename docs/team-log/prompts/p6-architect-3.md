# Prompt · phase 6 · architect · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Document the booking decision in §4
- Sent: 2026-09-09T09:13:20.614Z

---

Restructure `docs/arc42/04-solution-strategy.md` so that how booking is handled is documented as one complete, clearly signposted decision. The human's words: "I think the single most important decision of this app is how booking is handled. I want that decision to be documented clearly."

No new decisions — everything below is already decided and recorded. This is reconciliation and restructuring. No ADR unless you find a genuine conflict, in which case raise it rather than resolving it silently.

## Defect 1 — §4 is stale about locking, and reads as self-contradictory

This is the priority. Every mention of locking in §4 today is a **rejection**:

- line 27: a mitigation that "is a lock in disguise"
- lines 30-31: "a per-dealership application lock (or `SERIALIZABLE` isolation), under which check-then-act would genuinely be *correct*. That is rejected on a different and more interesting ground…"

Meanwhile **ADR-0018 is `status: accepted`** and every attempt takes `pg_advisory_xact_lock` over its bay and its technician before the insert. §4 does not mention it once. A reader of §4 — the section asserting "Everything in §5 to §8 follows from them" — concludes this system rejected locking, then finds two locks per attempt in §6.1 and in `appointmentRepository.lockResources`.

Both positions are right and they are not in conflict, but only §6.1 currently says why. §4 must carry the distinction:

- **Rejected: a lock as the correctness mechanism.** A per-dealership lock or `SERIALIZABLE` would make check-then-act genuinely correct, and is rejected because it makes correctness depend on every present and future write path remembering to take it. That argument stands, unchanged. Keep it.
- **Adopted: advisory locks for liveness, deciding nothing.** Without them, simultaneous inserters do not queue — `check_exclusion_constraint` inserts the index tuple and *then* scans, so each waits on the others' in-progress tuples and they cycle. The invariant was never in question; the *status* was, because a deadlock carries no constraint and so yields no verdict to render as `409`. The lock reads no table and decides nothing.

§6.1 records that this is measured **both ways** in `tests/integration/exclusion-constraint-adjudicates.test.ts` — drop the lock and keep the constraints: still exactly one row, with 108 deadlocks; drop the constraints and *hold* the locks: twenty overlapping rows land one at a time, zero refusals. Cite that. It is the sharpest evidence in the repository that the two mechanisms do different jobs, and §4 should not have to be taken on trust when a measurement exists.

## Defect 2 — the booking decision is split across two subsections, one of which is the wrong one

The allocation strategy's substantive treatment currently sits at the end of **§4.2 "Technology decisions"**, as "a fifth decision", among HTTP frameworks, query layers and migration tools. It is not a technology decision. Move it.

The reader should be able to go to one place and get the whole decision, in order:

1. **The problem** — two requests at the same instant, and why the window between a read and a write cannot be closed by care.
2. **What was rejected and why** — check-then-act; the lock/`SERIALIZABLE` cousin; and the ports-and-adapters repository port, since ADR-0008 rejected it on the grounds that any in-memory implementation *is* a check-then-act booking. That rejection currently sits in the technology table but belongs to this argument.
3. **What was chosen** — overlap made unrepresentable by two exclusion constraints, with the four consequences §4.1 already lists. This stays the centre.
4. **What makes the verdict determinate** — the advisory locks, per Defect 1.
5. **What sits on top: allocation and retry** — seeded shuffle so concurrent requests disagree about what to try first; a `23P01` prunes the **whole resource** the violated constraint names, not the failed pair, which changes the bound from bays × technicians to bays + technicians; cap 16 (ADR-0004, ADR-0009).
6. **What requirement 2's "qualified" costs** — the composite foreign key from `(technician_id, service_type_id)` to `technician_qualification`, so qualification is adjudicated by the database rather than by the caller. One clause; §8.1 holds the detail.

**Draw one distinction sharply, because the section's whole value depends on it.** The exclusion constraints prevent double-booking, completely and alone. Retry and candidate ordering prevent **spurious refusal** — QS-3: with M free bays and M qualified technicians and N concurrent bookings, exactly `min(N, M)` are confirmed. Without retry the system would be correct and useless: no double-booking, and customers refused while bays sat empty. Do not let the reorganisation blur allocation into the integrity mechanism; §4.1's power comes from correctness living in exactly one place. Note that §10 files QS-3 under goal 1 alongside the constraints, so proximity is right — conflation is not.

## Defect 3 — the decision count is wrong

The section opens "Five decisions." Then §4.1 is one, §4.2's table is four, §4.2 adds "a fifth decision" (candidate ordering), and then "one rejection in no table" (the shared SQL function). Six presented under a heading promising five. "Fifth" means fifth *gate* decision but reads as fifth overall. Make the count true, whatever structure you land on.

## Constraints

1. **Budget is the binding constraint. §4 is at 1,216 words against a ceiling of `max(1500, 1216)` = 1,500 — 284 words of headroom, and you will want more than that.** Pay by compressing §4.2's technology table, which is dense but repetitive in form, and by removing anything the restructure makes redundant. Do **not** raise the baseline or the budget. Report the arithmetic.
2. **Do not restate §6 or §8.** §4 states the decision and the reasoning; §6.1 has the runtime sequence, §8.2 the DDL. Cross-reference, do not duplicate — you removed §8.1's duplicated DDL for this reason two commits ago; the same rule applies here.
3. §4.1's rejected-`checkAvailability` TypeScript snippet stays. It shows the defect the brief's own wording invites, and that is the section's most persuasive twenty lines.
4. Touch only `docs/arc42/04-solution-strategy.md`. No other arc42 section, no `src/`, no `tests/`, no ADR, no team-log write.
5. **Do not commit.** Leave it in the working tree; I will verify and commit.
6. Run and report: `npm run docs:budget:check`, `npm run docs:refs`, `npm run docs:check`. If `docs:check` says `system-design.md` is stale, run `npm run docs:build` — no other agent is running.

Report: the new structure; how you paid for it; every claim you added and the artifact it came from; and whether reconciling the lock position surfaced anything you think is an actual conflict rather than a stale omission.
