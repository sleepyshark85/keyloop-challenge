# Prompt · slice 02 · architect · invocation 9

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Rule I-02-9 and four design items
- Sent: 2026-09-05T21:04:03.282Z

---

Slice 02, **step 4 DCR — I-02-9, plus four design items**. You are the architect, on `slice/02-book-and-read-an-appointment` at `fae2aff`. Step 4 is otherwise complete: 9 commits, **17 of 19 acceptance criteria green**, mutation **95.95%** on changed files (up from 84.58%), `lint:arch` clean at 81 modules.

Your authority is the delegated one — nothing escalates to the human between steps 1 and 5; you rule and it is listed at the gate. **One loopback remains of two.**

## I-02-9 — rule this first

Both concurrency tests contain an assertion that **no implementation can satisfy**. Verified by me at `fae2aff`, in `tests/concurrency/no-bay-overlap.test.ts:141-146` and `no-technician-overlap.test.ts:140`:

```ts
expect(`${confirmed.length} confirmed / ${refused.length} refused`)   // "1 confirmed / 19 refused"
  .toBe(`1 / ${RACERS - 1}`);                                          // "1 / 19"
```

Two renderings of the same fact compared to each other. It was red at `34b057b` for the *right* reason — 0/0 — so the defect was invisible then.

**The implementer did not edit it.** It reproduced both races in a scratch harness — same built artifact, same migrations, same fixture shape, `postgres:16`, 20 racers from a hard barrier — and ran every assertion both files make. All pass, including the one that matters most for your T-02-9 ruling: **non-201/409 responses = 0 in both races.** ADR-0018 is doing exactly what you ruled it would: 0 deadlocks, 0 `500`s, every racer a verdict, `resource` `bay` and `technician` respectively, and `attempt` values `["1"]` and `["1","2"]`.

Its requested outcome is **(a)**, one line, in the test-engineer's file: `.toBe(\`1 confirmed / ${String(RACERS - 1)} refused\`)` — keeping it as one strict equality naming both counts, because nineteen `500`s would read as `1 confirmed / 0 refused` and nothing else in either file would catch that. It argues this should not consume the remaining loopback: no AC, QS or §2 invariant fails, §2.1 is intact, and no production code changes.

Rule it. If you agree it is (a), say so and give the exact line; the test-engineer applies it, not you.

## Four things the implementer could not build as specified

It flagged all four rather than diverging silently. Judge each.

1. **`deriveInterval`'s signature.** §2.5 specifies `(startsAtMillis, serviceType, zone, weekly)`. It built `(startsAtMillis, serviceType, dealership: DealershipHours)` with the field named `ianaZone`. Its reason: naming the parameter `zone` leaves `deriveInterval.ts` off QS-12's `zone-transport` set-equality list, while an `ianaZone` *parameter* pushes the identifier into `bookAppointment.ts` — a fifth file — breaking the same assertion from the other side. The struct satisfies both, and the type is declared structurally so the module still imports nothing. This is the "one line either way" the test-engineer flagged at step 3.

2. **§2.4 is stale and contradicts §2.6 and AC-5.** It says *"No `db.transaction()` anywhere on this path"*, written before T-02-9. ADR-0018's `pg_advisory_xact_lock` needs a transaction to scope to, and AC-5's amended wording says *"one transaction containing exactly one `INSERT`"*. The implementer built §2.6/ADR-0018/AC-5. **This is your text and it is now wrong** — correct it.

3. **`lockResources` lives in `appointmentRepository.ts`**, which §2's module table does not name. Its reason: `sql` templates may only live in `src/persistence`, and putting the lock beside the insert is the strongest available form of F-02-9's inherited obligation.

4. **`classifyOwnership` uses two `EXISTS`, not §2.3's three.** The third — "is it owned" — can only answer `false` at that point, so it is a query nobody can make return `true`, and it was an equivalent-mutant generator.

## Two more, which I want your judgement on rather than a ruling

- **Commits 4, 6 and 7 are 962/1001/894 lines** against §7's ~150. Production code is 423/378/453 and roughly half of that is docblock; the rest is unit tests. The implementer judged that splitting `bookAppointment.ts` from its outcome union, or the three repositories from each other, would produce commits that were green but not meaningful — and **recorded it as a finding rather than defending it**. Say whether you agree that is the right trade, because the reviewer will see it at step 5 either way.
- **32 surviving mutants, all argued.** Notably `BookingBody`'s `additionalProperties: true` survives, which the implementer offers as honest evidence that **AC-6's schema-stripping leg is not load-bearing** — the structural one is, since `BookCommand` has no member for an end. Judge whether that reading is right; it bears on what AC-6 actually asserts.

## Constraints

`docs/slices/02-design.md`, `docs/adr/`, arc42 within `["§5.2", "§6.1", "§8.6"]`. **Not yours:** `tests/` — the test-engineer applies any test change; `src/`; the slice file; `docs/team-log/`.

`02-design.md` is far over budget; do not add net words without saying what you cut. Verify with `npm run lint:arch`, `npm run test:tools`, `npm run docs:budget`, `npm run docs:adr-check`. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

Report the ruling on I-02-9 with its outcome letter, a verdict on each of the four, your judgement on the two, and whether anything here should have escalated to the human had the old rule still applied.
