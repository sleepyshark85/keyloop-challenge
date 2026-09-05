# Prompt · slice 02 · reviewer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 02 step 5 review
- Sent: 2026-09-05T21:24:21.742Z

---

Slice 02, **step 5 — REVIEW**. You are the reviewer, on `slice/02-book-and-read-an-appointment` at `a6c558b`. PR #12 is open. CI is green on this commit: suite, docs/tools/log integrity, and red-proof all pass.

This is the largest slice in the backlog — **19 acceptance criteria**, carrying the booking path, the whole error taxonomy absorbed from slice 03, and two ratified domain remedies absorbed from slices 12 and 13.

## What to review against

`docs/slices/02-book-and-read-an-appointment.md` (the criteria) and `docs/slices/02-design.md` (the design), plus **ADR-0018**, which did not exist when the slice started. Diff: `git diff main...HEAD`.

The loop so far: red `34b057b` (27 failing assertions, zero non-assertion), then 9 implementer commits, then one test correction. **One loopback consumed of two** — a second (c) is the last available.

## Where I would look first, and why

I am telling you where the risk is rather than letting you find it cold, because the interesting question here is not whether the code matches the design — two prior rounds have hammered that — but whether the *mechanisms* do what they claim.

- **ADR-0018's advisory locks touch §2.1's write path.** The architect's own Consequences say: *"Under a per-resource lock a reintroduced check-then-act would be **correct**, not merely harmless. ADR-0016's argument gets weaker here, not stronger."* That is an honest admission, and it means §4's structural defences are load-bearing in a way they were not before. **Check that they still hold**, and that the lock genuinely decides nothing — ADR-0018 offers two controls (drop the constraints → 20 overlapping rows; drop the lock → still 1 row). Are they in the suite, or only in the ADR?
- **32 surviving mutants, all argued.** Mutation is 95.95% on changed files. The arguments looked sound to me, but I have not re-derived them. Judge whether any survivor is a real gap wearing an equivalence argument — that is your standing job and it is where you found the most value at slice 01.
- **Commits 4, 6 and 7 are 962/1001/894 lines** against §7's ~150. The implementer recorded this as a finding rather than defending it; the architect measured the mitigation and found comments are 37/37/29%, not "roughly half", and said it would have split the three repositories into three green commits. Form your own view.
- **AC-6's schema-stripping leg is not load-bearing** — the surviving `additionalProperties: true` mutant is the evidence. The architect ruled AC-6 is satisfied *structurally* instead, since `BookCommand` has no member for an end. Check that reading.
- **T-02-10** was raised and deliberately not repaired: `no-technician-overlap.test.ts:121` compares a derived count against a pinned literal. Satisfiable, but fragile. Your call whether it matters.

## What I will do with your findings

The human is asleep and has delegated the gate to me against a mechanical bar: `slice:check` all green with nothing UNVERIFIED, CI covering the slice's own last commit, mutation over threshold, **no open MAJOR or BLOCKING**, reviewer run and findings ruled, and discrimination claims re-run by me rather than taken from a report.

So a MAJOR or BLOCKING finding from you **stops the merge** until it is ruled. Do not soften anything to be helpful, and do not inflate anything to be seen to be thorough — I will read the reasoning, not the severity label.

Equally: **if you find nothing, say so and say why.** §6 reads a reviewer with no findings the same way it reads an adjudication round with no disagreement. A short, specific "I checked X, Y, Z and they hold" is worth more than a manufactured MINOR.

## Constraints

You **audit; you do not author**. You may not edit code, tests, arc42 or ADRs. A design problem is a **DCR**, not a finding you fix. Report findings with a ref (`R-02-n`), severity, file, the claim, and the measured scenario behind it — for a discrimination claim, name the mutant; for a mechanism claim, name the call site.

Verify rather than accept: this project has been burned by reports that were plausible and wrong, including mine. Trailers if you commit anything (you should not need to):

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```
