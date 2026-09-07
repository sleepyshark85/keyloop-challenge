# Prompt · slice 08 · scribe · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Sweep all PR comments for context
- Sent: 2026-09-07T04:36:59.875Z

---

**Sweep every PR comment you wrote, plus five more, and fix a defect that is in all of them.** The human read one and said: *"this comment doesn't seem to have enough context for the human to read. Keep things short, but don't truncate context (keep the context short too)."*

## The defect, and why it is worse than length

**A long comment goes unread. A short one that assumes context is *unreadable*.** Your backfilled comments are the right length and are still not readable cold: a human opening PR #13 does not know what "D-04-1", "the additive bound", "Order-A" or "§6.2 routes null to 500" refer to. Neither does one opening PR #15 on "F-02-9" or "the fourth lock cell". You cited faithfully — that part is right and must survive — but a citation without a gloss is a pointer, not a record.

**This is now a generated rule in your own agent definition** (`<!-- generated:pr-comment -->`, sourced from `docs/METHODOLOGY.md` §8) rather than something I brief. Re-read it before you start.

## The shape

I have fixed two on PR #17 as the model — read them first: the implementer's and the test-engineer's, at https://github.com/sleepyshark85/keyloop-challenge/pull/17.

1. **One italic framing line at the top**, after the attribution: what the slice was doing and the single fact the comment turns on. The test-engineer's reads *"QS-8 is the property that availability agrees with the constraint; AC-1 tests it by generating schedules, asking the query what is free, then probing each answer with a real INSERT — so it needs a way to tell a stale answer from a wrong one."* A reader now knows why any of it matters.
2. **Gloss each reference in a clause as you use it** — not *"D-04-1's additive bound"* but *"D-04-1 — whether the retry cap of 16 can be reached at all — "*. Short. Inline. Not a footnote.
3. **Keep** the leading bold role, the reconstruction disclaimer, and every artifact citation. Those are what make it a record.
4. **Cut to pay for it**: narration, restatement of other roles' work, and any sentence explaining a fact's *significance* rather than stating it.

**Length may rise to roughly 1,400–1,700 characters** to carry the context. That is the correct trade — the two I fixed sit at 1,639 and 1,609. Do not go beyond it.

## Scope — 23 comments

- **PRs #12, #13, #14, #15** — all 17 you backfilled.
- **PR #16 (slice 07)** — five comments I wrote and trimmed too hard: architect ×2, test-engineer, implementer, reviewer. Same defect, same fix. Slice 07 is *rescheduling under contention*: it found a live deadlock in code merged an hour earlier, ADR-0030 made a write lock every resource it is in flight against, ADR-0031 moved the read of the vacated pair inside the transaction.
- **PR #17** — the **architect's** comment only (id: the one starting `**architect** · step 1`). Leave the implementer's, the test-engineer's and your own scribe note alone; those are done.

Edit in place with `gh api -X PATCH /repos/sleepyshark85/keyloop-challenge/issues/comments/<id> -f body='...'`. Do not delete and repost — the timestamps are part of the record.

**Never invent to fill a gloss.** If you cannot say what something is from the log, the ADRs or the slice files, cite it bare rather than guessing. A pointer is worse than a gloss and far better than a wrong one.

**Post only.** No files, no commits, no PR body edits, and do not touch PRs #6 or #10.

**Report** how many you edited, the range of final lengths, and — separately — any comment where you could not supply a gloss without inventing one, because that is a gap in the record rather than in the comment.
