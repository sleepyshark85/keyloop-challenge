# Prompt · slice 02 · test-engineer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Apply the I-02-9 fix
- Sent: 2026-09-05T21:16:10.864Z

---

Slice 02, applying an **(a) clarification**. You are the test-engineer, on `slice/02-book-and-read-an-appointment` at `3e251e6`. Small task, but read the reasoning — it changes what one of your comments should say.

## What was found

The implementer raised **I-02-9** against your two concurrency files, and it is right. Both contain an assertion **no implementation can satisfy**:

```ts
expect(`${confirmed.length} confirmed / ${refused.length} refused`)   // "1 confirmed / 19 refused"
  .toBe(`1 / ${RACERS - 1}`);                                          // "1 / 19"
```

The left side always carries the words *confirmed* and *refused*; the right side never does. It was red at `34b057b` for the **right** reason — `0 confirmed / 0 refused` vs `1 / 19` — so the defect hid behind a true failure. That is the one blind spot a red commit has by construction, and it is worth carrying forward: a test can be red for the correct reason and still be unsatisfiable.

The implementer did not touch your file. It reproduced both races in a scratch harness — same built artifact, same migrations, `postgres:16`, 20 racers from a hard barrier — and ran every assertion both files make. All pass.

**Ruled (a) clarification, no loopback consumed.** The slice stays at 1 of 2.

## What to change

In **both** `tests/concurrency/no-bay-overlap.test.ts` and `tests/concurrency/no-technician-overlap.test.ts`:

```ts
).toBe(`1 confirmed / ${String(RACERS - 1)} refused`);
```

**One strict equality, not two assertions**, and the architect judged the implementer's reason better than a split: every other assertion in both files filters `refused` and passes **vacuously** on an empty list, so this is the only one that fails when the losers get the wrong status. Keep both counts named in it.

## Two editorial follow-ons, yours to take or leave

- **The comment above that assertion is now false.** It tells a reader that a `40P01` reaching the client *"is this finding and not a defect in the booking path"*. ADR-0018 made that untrue — the locks mean 0 deadlocks and 0 non-201/409 responses, measured across 56 races and confirmed again in the implementer's reproduction. Left as it stands it will mislead the reviewer at step 5 into treating a `500` as expected. I would rewrite it to say what is now true: a non-201/409 response means a write path skipped ADR-0018's locks, which is F-02-9's obligation being broken.
- The `String(...)` wrapper is what your file's own lint rule requires.

## While you are in there

**Do not fix anything else you happen to see.** If you find another assertion that cannot discriminate, raise it — do not quietly repair it. The value of I-02-9 is that it was found and named, and a silent repair alongside a named one teaches the opposite lesson.

If you disagree that one strict equality is right, say so rather than implementing it: you own how *done* is asserted, and the architect ruled on the defect, not on your assertion style.

## Constraints

Yours only. Commit by explicit pathspec, message `test(02): the split assertion compares two renderings of one fact (I-02-9)`. `npm test` will still show the db project failing until CI runs green — that is expected; what must hold is that the two concurrency files now assert something satisfiable. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

Report what you changed, whether you took the comment rewrite, and anything else you noticed but did not touch.
