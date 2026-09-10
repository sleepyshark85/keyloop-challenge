# Prompt · slice 19 · reviewer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Re-derive the N≥9 M≥9 bound
- Sent: 2026-09-10T13:56:26.999Z

---

keyloop-challenge (/home/agentadmin/sources/keyloop-challenge), branch `slice/19-attempt-cap-sized-against-occupancy`, PR #27. `git pull` first; step 7 landed as `358e58a`.

**Your `R-19-6` was agreed and extended, and the extension is what I need you to check.** The architect asked for this by name and I am treating it as gate-blocking:

> Ruling 18 replaces a wrong claim with an unverified one, and arc42 now states it as fact. The `N ≥ 9 ∧ M ≥ 9` bound is my own derivation, produced at step 7, downstream of nothing. It is load-bearing in three places — §10 QS-16, §11 D-19-3, ADR-0040's residual — and **nothing in the repository asserts it**; the test that would (`(9,9,3)`) is booked, not written. I caught a false claim by reasoning and then wrote a second claim by the same method, which is precisely the move this project distrusts. **A reviewer should re-derive the counting argument before the gate, not read it.**

## The claim to check

Your masking argument was accepted. The architect then ran it further:

> A refusal *while a free pair remains* requires reaching the cap of 16 on candidates the snapshot called **free**; the other racers can occupy at most `2(N − 1)` of those, and at most `2M − 2` can be spent without emptying a free list — after which the refusal is honest. So it needs **`N ≥ 9` and `M ≥ 9`**. Every QS-16 tuple has `M ≤ 8`, `(8,8,4)` included.

Two things follow that are now **written into arc42 and ADR-0040 as fact**:

1. A spurious refusal is **structurally unreachable at all four QS-16 tuples**, not merely masked at three.
2. Therefore the architect's step-1 claim that **QS-16 was free-first's falsifier is false** — the burst re-synchronisation risk is *unfalsified*, not measured absent.

## What I want

**Re-derive it independently. Do not read the architect's argument and agree with it.** Then, because this project prefers a measurement to an argument and the architect's own critique is that it produced the latter:

**Test it empirically.** A simulation is legitimate and cheap here — you do not need the database. Model the real loop: N racers each holding a snapshot taken before any of them committed; free-first ordering (free prefix shuffled, busy tail shuffled, one `mulberry32` stream); one prune of the whole resource per `23P01`; cap 16; racers interleaving. Sweep `(N, M, k)` across and beyond QS-16's four tuples — include `(9,9,3)`, `(10,10,2)`, `(12,12,0)`, and the four QS-16 tuples — and report whether a **spurious** refusal (capped while a free bay *and* a free technician both remained at that instant) ever occurs, and at what smallest `(N, M)`.

Put the script in `/tmp/claude-1000/-home-agentadmin-sources-keyloop-challenge/fee65a03-4453-4557-971c-b9301c1f9de4/scratchpad/` — **not** in the repo. You are not writing a test; `(9,9,3)` is booked as `D-19-3` and §2.4 wants it red first in its own slice.

**If your derivation or your simulation disagrees with `N ≥ 9 ∧ M ≥ 9`, say so plainly** — arc42 currently asserts it, so a wrong bound is a defect in merged documentation and I would rather find it now than ship it. If it agrees, say what the simulation does and does not establish: a simulation of the loop is not the loop.

## Also

Confirm the two things the architect self-reported, since it asked the gate to see them rather than notice them:

- **`A-19-3`** — arc42 §4.1's new headline is quantified only *backwards*: it gives one-in-six for the **old** ordering and calls the new residual *"unlikely"* with no number, and by ruling 18's own arithmetic **no test in the suite can produce one**. Is that an acceptable state for the system's most user-visible claim, or is it a finding?
- **`A-19-4`** — slice 19's commit condensed ~300 words out of **six debt rows belonging to earlier slices** (`D-15-4`, `D-16-3`, `D-16-4`, `D-16-5`, `R-11`, §11.3) to pay arc42 §11's word ratchet. `docs:refs` passes at 129 identifiers, all defined. Verify no decision or citation was actually lost — spot-check the six against their pre-`358e58a` text.

Do **not** `git add` `docs/STATUS.md`, `docs/team-log/` or `docs/DEFECTS.md`. A full-project mutation run is finishing concurrently and may briefly rewrite `src/` in place — ignore transient `src/` diffs, and do not start your own mutation run.

Report: your independent derivation, the simulation's method and results, whether you agree with the bound, and verdicts on `A-19-3` and `A-19-4`. Post to PR #27 beginning `**reviewer` at line start.
