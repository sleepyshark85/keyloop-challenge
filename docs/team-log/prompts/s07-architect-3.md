# Prompt · slice 07 · architect · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 07 step 7 as-built
- Sent: 2026-09-07T03:06:49.668Z

---

Slice 07 **step 7 — AS-BUILT**, plus four rulings. Branch `slice/07-reschedule-under-contention`, head `2bca770` + log commits. I gate this with you immediately after, under the human's standing delegation.

**The reviewer APPROVED.** No blocking, no major, two minors. Everything from its first review is closed on evidence.

**Mutation, measured by me just now** (19m53s, do not re-run): changed files **96.25**, repo-wide **93.91**. Per changed file, all far above 0.75 — `appointmentRepository.ts` **100.00 with zero survivors** (the file that gained `lockAppointmentRow` and the union statement), `pgError.ts` 96.92, `bookAppointment.ts` 96.80, `rescheduleAppointment.ts` 92.50. **Every survivor across all four is accounted for by a prior classification or a prior prediction, and none sits on a line this slice added.** The two `pgError.ts` survivors are A-05-6's, predicted at step 2 before any code was written, argued analytically at step 4, and differential-tested over 254 adversarial inputs at step 5 with zero distinguishing inputs.

**The reviewer closed a §2.4 gap by doing the work rather than raising it.** The corrected AC-5 instrument had never been observed failing — `b555317`'s red came from the *old* instrument, failing for a reason unrelated to build correctness — so it executed the slice file's own mutant control in a throwaway worktree with `src/` reverted: **P1 witness passes, P2 claim fails, both park-probes reached.** The discrimination evidence now exists.

**And it closed R-07-1 with a stronger argument than ADR-0031's own**, which you should absorb: ADR-0031 says a transaction holding an advisory lock never afterwards waits for a row lock. The sharper fact is that **every transaction that waits for an appointment row lock holds nothing at that moment** — a mover blocks at `lockAppointmentRow` before any advisory acquisition, and a cancel blocks inside its single statement before writing a dirty tuple. That also closes the mover→advisory→cancel→row-lock chain your wording does not cover, which it checked *because* a cancel is the one non-mover taking an appointment row lock.

## Four rulings

**O-53 — the only open MAJOR, and it is the third of its kind.** You routed **D-07-1** to **slice 11**, a tombstone Gate D folded into 09 (`folded_into: "09"`, `folded_by: gate-D`; slice 09 declares `absorbs: ["10","11"]`). The write-path guard refused it, so **D-07-1 currently has no `deferred_to` recorded at all** — I do not silently correct your rulings. Prior instances: OQ-05-2 → 10, and A-06-2 → 10, also yours. Name a live destination. And rule the question I put to the gate: **whether tombstone files should be renamed or carry a louder marker**, since three occurrences suggest reading `folded_into` is not what a role does when reaching for a slice number from memory.

**R-07-13 — MINOR, and it lands on your own step-7 deferral.** You deferred correcting AC-5's parenthetical *"(`classid`/`objid` against `hashtext`)"* to as-built, naming the slice file. **It is in two files** — also `07-design.md:136`. If step 7 fixes only the one you named, the design file — *the artifact arc42 absorbs* — states an assertion mechanism the test provably no longer uses, and a later reader re-derives the signed/unsigned defect the DCR removed.

**R-07-12 — MINOR, forward-looking, and it names its own trigger.** `POOL_MAX = 10` in the test is a **hand-copied duplicate** of pg's default. **Slice 11 — D-07-1's own destination — sets `max: 5` while measuring capacity.** AC-4 would then release 10 movers into a 5-client pool, reintroducing exactly the queue-serialisation R-07-4 removed, and the guard still passes because it compares against the literal. The re-measured 1.87% silently reverts toward 0.5% with nothing reporting it.

**O-54 — the reviewer narrowed the test-engineer's wording and I want your ruling on which goes to the retro.** Both agree the second red is right and §7's text is wrong: §7's count serves §2.4, which is a rule about *evidence per criterion*, and "one red per slice" is a proxy exact only while a slice's criteria never change. Amending the first red satisfies §7's letter by **breaking §2.4's substance** — it manufactures a red that never reddened what it claims to have reddened. §7 and §6 are in **direct textual tension**: §6 permits loopbacks, and a loopback that adds a criterion necessarily owes a red. The test-engineer proposed *"one red per **design**"*; the reviewer rejected that as having **no commit-countable definition** — arguable rather than auditable, the direction §2.3 forbids — and proposed *"one per slice **plus one per declared loopback that adds or amends an acceptance criterion**"*, derivable from `loopbacks:` which `slice:check` already reads. With a caveat worth carrying: **a red that fires for an instrument defect looks identical in git to one that fires for the build**, so the wording should carry §2.4's second clause — *observed red against the build the criterion discriminates against*.

## Step 7 itself

Reconcile arc42 to what merged. The slice declares `arc42: ["§5.2","§6.1","§6.3","§8.6","§10","§11"]`. Known obligations: ADR-0030 and ADR-0031's rules; the corrected deadlock premise (§6.1 and §11's `F-02-9`, whose *"discharged by measurement"* is false as written — a live path could violate the rule until `da68d67`); §11 candidates already booked — **D-07-1**, the reviewer's *"a regression barrier that cannot be observed red owes a **mutant control**, and an argued control is not a measured one"*, and A-07-3's four-boundary pattern if you want it there rather than only in the retro.

**`slice:check` still reports no ruling in span for `F-02-9` and `A-05-6`** — both are touched by your rulings but the log entries are mine to write, so **state their disposition explicitly in your report** and I will log them.

**Constraints.** arc42 §5, §6, §8, §10, §11 have between 0 and 15 words of headroom — every addition paid for by a named deletion; say what you let go. `07-design.md` shrinks to its as-built record against the 1,200 merged ceiling. All gates stay green. Accepted ADRs immutable. No `src/`, no `tests/`, no front matter.

**Report** the standard JSON, the four rulings, F-02-9 and A-05-6's dispositions, what moved in arc42 and what paid for it, and — most important for the gate — **anything you would want a human to look at that no test covers.** I will put it in the gate record verbatim, as not-checked rather than as passed.
