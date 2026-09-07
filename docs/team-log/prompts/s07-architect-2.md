# Prompt · slice 07 · architect · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Rule R-07-1 and R-07-2
- Sent: 2026-09-06T19:18:04.711Z

---

Slice 07 — **five step-5 findings to rule.** Branch `slice/07-reschedule-under-contention`. You write `docs/` only; the test-engineer is fixing its own files concurrently and the implementer is idle awaiting your rulings.

The reviewer returned **changes-requested**, no DCR, and said explicitly: *"the design is right and the implementation departs from it, not the reverse."* Its measurements first, because they are good news: mutation **93.85 overall**, `appointmentRepository.ts` — the file this slice rewrote — at **100.00 with zero survivors**, and **no survivor anywhere sits on a line this slice changed**. Commit discipline and test ownership clean in both directions.

---

**R-07-1 — MAJOR, and it is the same shape as the ruling this slice exists to correct.**

ADR-0030's `leave` is read **outside the transaction** and never re-validated. Two `PATCH`es of appointment A (at bay0/tech0) arrive together; both read `existing` on the pool and set `incumbent = (bay0, tech0)`. Request 1 wins the locks and commits a move to (bay1, tech1). Request 2 then runs attempt 1 with `take = leave = (bay0, tech0)` — two keys — and `rescheduleAppointmentById` guards only on `id` and `status = 'confirmed'`, **so its `UPDATE` succeeds and vacates bay1/tech1's index entry while holding no lock on either.** A booking contending bay1 waits on that entry, request 2 waits on the booking: `40P01`, `500`.

The tell is the docblock's own justification — *"`incumbent` is CONSTANT across every attempt, because every prior attempt aborted"*. That is true of **one request's** attempts and silent about **a second request's commit**. It is a statement true within one transaction offered as though it were true across them, which is precisely the form of your slice-06 discharge ruling that A-07-1 falsified.

Rule it. If the remedy is to re-read the incumbent inside the transaction, say what that costs against ADR-0027's attempt-1-first ordering. If it is a `WHERE` clause carrying the expected pair, say so. If you rule it out of slice, name the live destination.

**R-07-2 — MAJOR. The docblock calls a false statement "the load-bearing symmetry", and this slice's own AC-4 fixture falsifies it.**

At AC-4 attempt 2, mover A sends keys `{bay0, bay1, tA}` and mover B sends `{bay0, bay1, tB}` — **not the same multiset**. The claim holds only for a full-pair swap, which is the ADR's own measurement fixture. **No behaviour is wrong** — the total order on `(cl, hashtext(key))` is what prevents the cycle, and the docblock says that too — but a reader who believed the symmetry were load-bearing would conclude the `ORDER BY` is removable for symmetric cases and that an asymmetric mutual vacate like AC-4's is unprotected. Both conclusions are false. `appointmentRepository.test.ts:110` asserts the same over-general claim in its test name.

**I carried this claim into the step-4 dispatch as "the load-bearing one", so it is in the dispatch record too and I have logged that.**

**R-07-4 — MAJOR, and the remedy is a choice only you should make.** AC-4 releases 40 concurrent requests against a **10-client pool** (`src/persistence/db.ts` sets no `max`; pg's default is 10) with `connectionTimeoutMillis: 1_000`, forty times, on the one container 19 db-project files share. pg-pool applies that bound to **queued acquires**, not just new connections. A queued acquire past 1 s rejects with a codeless `Error` → `classify` → `other` → rethrown → `500`, and `badAnswers` then fails saying *"an unresolved `40P01` surfacing at the edge"* while `deadlocks.length` is 0. A **false failure**, not a false pass — but the one that will be blamed on ADR-0030. Twice the racer count of the file I-07-5 already reports flaking. Is the fix test-side (fewer racers), `src`-side (a pool `max`, which is a production decision), or the assertion's message?

**R-07-7 — MINOR, verified by execution.** `RESOURCE_BY_CONSTRAINT[constraint]` reaches `Object.prototype`: `classify({code:'23P01', constraint:'constructor'})` returns `resource: <the Object constructor>`. Same for `toString`, `valueOf`, `__proto__`. No live input reaches it, so it is a latent hole in a **totality claim** rather than a bug — and it contradicts the invariant `pgError.test.ts:55` asserts. Noted because A-05-6 made hardening these two guards this slice's own inherited obligation.

**R-07-10 — MINOR, and it is against me.** O-44 and O-50 entered this branch as a `slice:check` guard and appear in no acceptance criterion, no `inherits:` ref and no In-scope bullet of slice 07. The slice whose Ready gate was strengthened by O-41's completeness guard is itself carrying undeclared scope. Rule whether that needs declaring or is legitimately out-of-band tooling.

---

**Two things the reviewer settled that you do not need to re-open.** The **T-07-5 sweep came back negative on its hypothesis**: no assertion was made vacuous by ADR-0029, and the one raw-`40P01` check that is half-blind (`cancellation-takes-no-lock.test.ts:368`) has always been so, for an older and wider reason — the `no-verdict` arm swallows the SQLSTATE on **both** paths. And on **O-51** it ruled §2.4 satisfied and not reaching AC-1/2/3: they are *unfired*, not vacuous, and pinning already-correct behaviour is a legitimate second purpose. It added the sharp edge, which you may want in §11: what a regression barrier owes instead of a red is a **mutant control**, and this slice measured exactly one — AC-4's is a number, AC-1's and AC-2's are *arguments*, the same currency as the discharge ruling that shipped an 11.7% `500`.

**Constraints.** `07-design.md` is at 1,847/3,000, so you have room. Accepted ADRs are immutable — ADR-0030 is one day old and correcting a docblock is not superseding it. `docs:budget -- --check --ratchet`, `docs:refs`, `docs:adr-check`, `docs:check`, `log:check`, `test:tools` stay green. No `src/`, no `tests/`, no front matter. Commit `docs(07):`.

**Report** the standard JSON, one verdict per finding with reasoning, the exact `src/` change you want for R-07-1 and R-07-2 stated but **unmade** (the implementer will apply them), and anything this did not ask about.
