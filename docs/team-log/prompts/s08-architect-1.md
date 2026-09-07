# Prompt · slice 08 · architect · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 08 step 1 design
- Sent: 2026-09-07T03:57:24.967Z

---

Slice 08 step 1 — DESIGN. Branch `slice/08-availability-query`, off a `main` carrying slice 07 (merge `59ee9e2`). `slice:check 08` reports Definition of Ready **fully green**.

Read `docs/slices/08-availability-query.md` first: six ACs, `arc42: ["§6.5", "§8.6"]`, `quality_scenarios: [QS-8]`, `inherits: ["I-04-5", "A-06-4"]`, `gate: light`, `loopbacks: 0`.

**Slice 07 merged and it is worth knowing what it cost, because this slice inherits a habit from it.** Step 1 raced F-02-9 instead of designing around it and found a **live defect in code merged an hour earlier** — 11.7% of contended moves deadlocking to a `500` with every ADR-0018 lock correctly taken. ADR-0030 fixed it; the reviewer then found ADR-0030's `leave` was read outside the transaction, and ADR-0031 fixed that. **One loopback, declared by you against your own design.** The lesson you drew — A-07-3, now the retro's most generalisable finding — is that four claims in that slice were true in one representation and false in another, and every one survived because **what would falsify it sat across a boundary nobody crossed**. The countermeasure worked four times and is the same each time: *cross the boundary and read the value in the representation the system actually uses.*

**This slice is where that habit is most likely to be needed and least likely to be reached for**, because availability is *advisory by contract*. There is no constraint to adjudicate it. A wrong answer is not refused by the database; it is simply wrong, and nothing downstream notices.

**Two inherited obligations, and one of them is a gate question you cannot rule.**

- **I-04-5 — the advisory pre-filter, and the reason it waited for this slice.** Ruled (b) at slice 04 with both halves upheld, and the surviving argument was the implementer's: *the pre-filter is trustworthy only because of QS-8, and shipping it before the property that validates it is backwards.* So the ordering is the point — **QS-8 is this slice's**, and the pre-filter arrives behind it rather than in front of it. The ruling distinguished an **authoritative allocator** (excluded, correctly) from an **advisory pre-filter** (in scope, after QS-8). D-04-1's other half — filter or a higher cap — you **declined to rule**, and the cap of 16 is a number the human accepted at Gate B.

- **A-06-4 — and this slice's gate must rule it, which is why it was routed here.** You raised it at slice 06 step 2 *against your own pattern of rulings*: ADR-0019's cheaper-or-stronger criterion is **per-item and has no aggregate**, and slice 09 now holds OQ-05-2, F-06-1, A-06-2, T-06-5 **and D-07-1 and R-07-12 from slice 07** — six now, not four — on top of fifteen acceptance criteria and slices 10 and 11 absorbed by Gate D. You refused to rule it because you own ADR-0019; I declined to re-cut the backlog on a merge delegation and routed it here because **slice 08's gate is the last moment the decision is still free.** Slice 09 is next. Three questions: split slice 09, exempt a slice that has absorbed two folded slices from receiving further deferrals, or accept it is the close-out and will be large. **The aggregate-clause question goes to the retro whichever way the scope question falls.**

**Three things to decide.**

1. **What makes an advisory answer wrong, and what would catch it.** QS-8 is *"provably in agreement with the constraint"* — decide what "in agreement" means when the two can legitimately disagree by a race, and say what observation distinguishes a **stale** answer from a **wrong** one. This is A-07-3's shape: the constraint's verdict and the query's answer live on opposite sides of a boundary.
2. **Whether the pre-filter ships in this slice or only its validating property.** I-04-5's ruling puts it *after* QS-8, not *with* it. Say plainly whether "after" means this slice or a later one, because the slice file's Out of scope currently names the pre-filter and its In scope does not.
3. **What §2.1 has to say here, if anything.** Availability is explicitly advisory and cannot guarantee correctness — §2.1 says so. But this is the first slice whose whole subject is a read that gives UX guidance about a state only the constraint decides, so say whether §2.1 constrains it at all, or whether it is silent and the risk is elsewhere.

**Standing context.** ADR-0030 and ADR-0031 are accepted: a write locks every resource it is *in flight against*, and a move reads the pair it leaves *inside its own transaction*. **D-07-1 is live in `main` right now** — a saturated pool answers `500`, because `createPool` sets no `max` and `CONNECTION_TIMEOUT_MS`, decided for an unreachable database, silently also bounds queue waits. That is slice 09's, disclosed at slice 07's gate.

**One process change since your last step 1.** §6 requires every reply, disagreement and vote on the PR, and it had not happened since slice 01 — the human caught it, I logged it as O-55, and **`slice:check` now fails a slice whose PR lacks an attributed comment from every role that produced an agent event.** You implicated yourself in that finding unprompted, which is on the record. Post your reasoning to the PR as well as reporting it; I will open the PR when the branch first pushes.

**Constraints.** In-flight design ceiling 3,000 words. arc42 §5, §6, §8, §10, §11 have between 0 and 15 words of headroom — every step-7 addition paid for by a deletion, so design with that in view. `docs:budget -- --check --ratchet`, `docs:refs`, `docs:adr-check`, `docs:check`, `log:check`, `test:tools` stay green. ADR if a decision is needed; accepted ADRs immutable. No `src/`, no `tests/`, no `tools/`. **Do not hand-edit front matter** — tell me what belongs there. Commit `docs(08):`.

**Report** the standard JSON, your three decisions, your disposition of I-04-5, what belongs in front matter, and — separately — anything you found that this did not ask about. That section has been the most valuable part of every report for six slices.
