# Report · slice 02 · architect · invocation 8

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Adjudicate T-02-9 deadlock DCR
- Returned: 2026-09-05T19:14:36.240Z
- Duration: 2155s

---

**Ruling: (c) design defect.** Committed at `7a2e222`. Loopbacks 0 → 1.

## What fails, named

**AC-3 and AC-4** (*"the other 19 receive `409` with `type=/problems/no-capacity`"*) and arc42 §10's **QS-1 and QS-2**, which use the same words. The failing clause is design §2.6's `other ⇒ rethrow ⇒ 500` arm and nothing else. §2.1 was never in question — exactly one row survived every trial of every configuration.

Not (b): a booking that returns `500` to three losers in four is not "correct under the agreed ADR". Not (a): `other ⇒ 500` is unambiguous and wrong.

## The measurements — the obvious remedy loses

Re-ran your finding first: **285 of 400 losers get `40P01`, not one race in three.** Had I ruled from the reported number, 33% would have looked survivable enough to reach for a retry.

Retry does not work. Every aborted racer re-inserts its index tuple, so the in-flight population never falls to one and nobody commits:

| Retry config (N=20, one bay) | Deadlocks | No verdict | Race |
|---|---|---|---|
| immediate, `deadlock_timeout` 1 s, 30 s budget | 292 | 114/120 | 48 s |
| exponential 50 ms→1 s, 1 s | 241 | 95/120 | 48 s |
| immediate, 25 ms | 2100 | 171/200 | 5.5 s |
| exponential 5→200 ms, 25 ms | 1305 | 114/200 | 5.5 s |
| jitter 0–25 ms, 25 ms | 1352 | 114/200 | 5.5 s |

`deadlock_timeout` is a **superuser** GUC (the app role is refused), so it could never have been config. `ON CONFLICT DO NOTHING` does *not* deadlock and is worse: **3 of 10 trials produced no appointment at all.**

**The remedy that works:** two class-scoped transaction advisory locks per attempt — class 1 on the bay, class 2 on the technician. Disjoint key spaces make *bay-then-technician* a total order by construction; no sort to keep sorted. **56 races at N=20 and N=40, bay/technician/mixed: 0 deadlocks, 0 retries, every racer a verdict, right constraint name, 76 ms median, +0.4 ms on an uncontended booking.**

Two controls separate liveness from correctness: drop the lock → still **1 row**, 108 deadlocks. Drop the constraints → **20 overlapping rows**.

## On your question about `409`

**ADR-0016 answered it before I did.** `40P01` carries no `constraint`, so `no-verdict` mints no `ContendedResource` — a `409` here isn't merely dishonest, it's unconstructible without a cast. And because the locks make the case mean *"a write path skipped ADR-0018's locks"*, it is an internal fault: `500 /problems/internal`, **not retried** (fail loudly), and **§8.6 gains no row**. No `503`, no taxonomy growth.

## AC wording — AC-5 only, and it is a change

**AC-3 and AC-4 are unchanged in substance** — the design now earns their nineteen `409`s. That is the outcome I wanted, not the one I expected. The exact wording for AC-5 (in design §9, R-02-1; I did not touch the slice file):

> **AC-5** — Given the source tree, when it is inspected, then no code path reads availability and then decides whether to insert. Each booking attempt is one transaction containing exactly one `INSERT` into `appointment`, preceded only by ADR-0018's two advisory-lock acquisitions — which read no table and decide nothing.

## What I would have escalated yesterday

1. **Adding an application lock to the write path of the one invariant CLAUDE.md §2 calls NON-NEGOTIABLE.** ADR-0004 Option D rejected the shape; I am admitting in design §4.5 that under a per-resource lock a reintroduced check-then-act would be **correct, not merely harmless** — §4's argument is weaker after this ruling than before it. Yesterday that reads as a §2-adjacent scope question.
2. **Changing what AC-5 asserts** — AC wording was the human's.
3. **Declining to add the `503` row** — a taxonomy decision that is a client-contract question.
4. **Spending the loopback** rather than escalating a slice already carrying 19 AC.

Net **+983 words** on `02-design.md`; paid for by cutting E-02-1 (−580) and E-02-2 (−618, both ruled and recorded in arc42 §10.2), §3's one-red-commit argument (−141, settled by the red), the stale blocker list (−180), I-02-5 (−71) and the step-2 measurement note (−135). Every cut section says so and points at git history.

Two things routed, not taken: **F-02-9** — every write path to `appointment` must take these locks in this order (slice 06's reschedule inherits it); **F-02-10** — `docs:adr-check` silently skips a *new* ADR, so ADR-0018 is unpinned. `--rebaseline` fixes it and also rewrites all 17 existing pins (367/−175 of unrelated churn); I would not bury that in a DCR commit.

Verified: `npm test` (red unchanged, both projects fail as committed), `lint:arch`, `test:tools`, `docs:refs`, `docs:adr-check` all clean. Containers removed.

```json
{
  "role": "architect",
  "outcome": "adjudicated",
  "arc42_sections_touched": [],
  "adrs": [{"id": "0018", "status": "proposed", "supersedes": null}],
  "quality_scenarios": ["QS-1", "QS-2", "QS-11"],
  "assumptions": [],
  "open_questions": [],
  "dcr_ruling": "c",
  "message": "T-02-9 ruled (c): 40P01 is a missing verdict, not a refusal, and design §2.6's `other ⇒ 500` arm fails AC-3, AC-4, QS-1 and QS-2 in 285 of 400 losers. Retry — the obvious remedy and my own first draft — livelocks in all five measured configurations; ADR-0018's two class-scoped advisory locks give 0 deadlocks across 56 races, and two controls show the lock decides nothing. AC-5's wording changes and I have said so in those words; AC-3 and AC-4 do not."
}
```

Files: `/home/agentadmin/sources/keyloop-challenge/docs/adr/0018-lock-the-bay-and-the-technician-before-each-insert.md`, `/home/agentadmin/sources/keyloop-challenge/docs/slices/02-design.md`
