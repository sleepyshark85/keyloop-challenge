# Report · slice 02 · implementer · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 02 step 4 GREEN
- Returned: 2026-09-05T21:02:51.245Z
- Duration: 6257s

---

Step 4 is complete except for one blocked pair. Here is the report.

## Outcome: `green`, with one DCR

**9 commits on `slice/02-book-and-read-an-appointment`**, `d5622f3..fae2aff`, 26 files, +4135/−39.

| # | commit | ACs it closes |
|---|---|---|
| 1 | `06d5894` ADR-0014 — an `Instant` is renderable by construction | **AC-13, AC-14, AC-15, AC-16** |
| 2 | `278f198` ADR-0015 — an end at local midnight ends on the day it started | **AC-17, AC-18** (domain half of AC-19) |
| 3 | `a91c241` the `Database` interface, and the one site that reads a SQLSTATE | feeds AC-3/4/9–12 |
| 4 | `fa7cbff` the three repositories — reference, candidates, the guarded INSERT | feeds AC-1/2/5/9–11/19 |
| 5 | `9eea803` `deriveInterval` — the composition order + the precedence tests | **AC-7**, the structural half of **AC-6** |
| 6 | `6854eea` the booking use case — ADR-0004's loop inside ADR-0018's locks | **AC-3, AC-4, AC-5, AC-9, AC-10, AC-11** |
| 7 | `b90666a` the edge — taxonomy, routes, `setErrorHandler`, `main.ts` | **AC-1, AC-2, AC-6, AC-8, AC-12, AC-19** end to end |
| 8 | `70a846e` three unreachable branches removed + the tests mutation asked for | — |
| 9 | `fae2aff` the response schemas asserted to *enforce*; `classify`'s two tests separated | — |

**17 of 19 acceptance criteria are green.** `npm test`: nodb 22 files / 436 passed; db 6 of 8 files, 32 passed. `npm run lint:arch` clean at 81 modules. `npm run test:tools` 21/21.

## The DCR — I-02-9, and it blocks only AC-3 and AC-4

`tests/concurrency/no-bay-overlap.test.ts` and `…/no-technician-overlap.test.ts` each contain:

```ts
expect(
  `${String(confirmed.length)} confirmed / ${String(refused.length)} refused`,  // "1 confirmed / 19 refused"
  …,
).toBe(`1 / ${String(RACERS - 1)}`);                                            // "1 / 19"
```

**Unsatisfiable for any implementation** — two renderings of the same fact compared to each other. It was red at `34b057b` for the right reason (0/0), so the defect was invisible then.

I did not edit it. Instead I reproduced both races in a scratch harness (same artifact, same migrations, same fixture shape, `postgres:16`, 20 racers from a hard barrier) and ran every assertion the two files make:

| | AC-3 (1 bay, 24 techs) | AC-4 (24 bays, 1 tech) |
|---|---|---|
| one overlapping non-cancelled row | **1** ✓ | **1** ✓ |
| the split | **1 / 19** ✓ | **1 / 19** ✓ |
| every refusal problem+json, `type=/problems/no-capacity` | ✓ | ✓ |
| `resource` | `bay` ✓ | `technician` ✓ |
| the confirmed id is the stored row's id | ✓ | ✓ |
| `booking.conflict` lines naming the expected constraint (≥19) | 19 ✓ | 19 ✓ |
| distinct `attempt` values | `["1"]` | `["1","2"]` ✓ |
| **non-201/409 responses (the `40P01`→`500` risk)** | **0** | **0** |

That last row is ADR-0018 doing what it was ruled to do: 0 deadlocks, 0 `500`s, every racer a verdict.

**Requested outcome (a), one line, the test-engineer's:** `.toBe(\`1 confirmed / ${String(RACERS - 1)} refused\`)`. Keep it as one strict equality naming both counts — nineteen `500`s read as `1 confirmed / 0 refused`, and nothing else in either file would catch that. Not (c): no AC, QS or §2 invariant fails; §2.1 is intact; no production code changes. It should not consume the remaining loopback.

## Mutation on changed files — 95.95% (758 killed, 32 survived), up from 84.58%

100%: `interval.ts`, `duration.ts`, `deriveInterval.ts`, `readAppointment.ts`, `appointmentRepository.ts`, `candidateRepository.ts`, `referenceRepository.ts`, `server.ts`, `db.ts`, `health.ts`, `config.ts`, `logger.ts`. Then `bookAppointment.ts` 98.28, `openingHours.ts` 98.25, `pgError.ts` 96.72, `appointments.ts` 83.16, `problem.ts` 75.00. (`routes/health.ts` 85.00 is slice-00a code this slice did not touch.)

The first pass had 128 survivors. **Three of them were answered by deleting code, not by writing a test that could not have failed** — `referenceRepository`'s `day_of_week` re-check (`toWeekly` reads seven named slots, so it was unobservable), `nextLocalDate`'s regex anchors and two guard arms (unreachable given step 1's bound), and `isValidationError`'s `|| code === 'FST_ERR_VALIDATION'` behind a hand-rolled `typeof` guard (Fastify sets both together).

Named survivors, all argued rather than left:
- **`appointments.ts` L190/L221 `default:` + the `never` throw** (5) — compile-time exhaustiveness devices; unreachable by construction, same class as `routes/health.ts`'s.
- **`appointments.ts` L67/68/70/71/79/106, `problem.ts` L78** (9) — TypeBox schema *options*. `description: ""` is only observable through slice 09/10's emitted OpenAPI document. The `BookingBody` `additionalProperties: true` mutant is the honest evidence that **AC-6's schema-stripping leg is not load-bearing** — the structural one is, since `BookCommand` has no member for an end.
- **`appointments.ts` L245 `verdict.kind === 'outside-window' → true`** — reading `opensAt` off a `closed-day` verdict yields `undefined`, which JSON drops; equivalent at runtime.
- **`bookAppointment.ts` L202 `case 'derived':`** — that switch has no `default`, so falling through and breaking are the same path.
- **`pgError.ts` L80, L103 `→ true`** — separable only by a `String` object as `code`; L103's `||` and its other two arms are now killed by the 23503/`no_bay_overlap` case.
- **`openingHours.ts` L130** (2) — slice-01 code; `formatToParts` always returns every requested part.
- **`openingHours.ts` L256 `→ false`** — one arm of step 6's three-way `||`; both null arms now have cases, this is the ordering arm.

## What I could not implement as the design specifies — four items for step 5/7

1. **`deriveInterval`'s signature.** §2.5 gives `(startsAtMillis, serviceType, zone, weekly)`. I built `(startsAtMillis, serviceType, dealership: DealershipHours)` with the field named `ianaZone`. `zone` leaves `deriveInterval.ts` off QS-12's `zone-transport` set-equality list; an `ianaZone` *parameter* puts the identifier into `bookAppointment.ts`, a fifth file, and breaks it the other way. The pair satisfies both, and the type is declared structurally so the module still imports nothing outside `src/domain`. This is the "one-line change either way" the test-engineer flagged at step 3.
2. **§2.4 is stale and contradicts §2.6 and AC-5.** It says *"No `db.transaction()` anywhere on this path"* — written before T-02-9. ADR-0018's locks are `pg_advisory_xact_lock` and need a transaction to scope to, and AC-5's amended wording says *"one transaction containing exactly one `INSERT`"*. I implemented §2.6/ADR-0018/AC-5; §2.4's sentence needs correcting at step 7.
3. **`lockResources` lives in `appointmentRepository.ts`**, which §2's module table does not name. `sql` templates may only live in `src/persistence`, and putting it beside the insert is the strongest available form of F-02-9's inherited obligation.
4. **`classifyOwnership` uses two `EXISTS`, not §2.3's three.** The third — "is it owned" — can only answer `false` at that point, and a query nobody can make return `true` is not evidence. It was also an equivalent-mutant generator.

Two smaller notes: the refusal returns from **inside** the conflict arm rather than after the loop, because returning after it needs either a dead branch or `as ContendedResource` in `src/application`, which the marker forbids and which is the exact shape ADR-0016 exists to make visible. And `invalid-duration` maps to `reference-data-invalid` (`detail: 'service-type-duration'`), following §2.6's trace, since `BookOutcome` has no member for it.

## Also worth your attention

- **Commits 4, 6 and 7 are 962/1001/894 lines**, well past §7's ~150. Production code is 423/378/453 of that and roughly half of *that* is docblock; the rest is unit tests. I judged that splitting `bookAppointment.ts` from its outcome union, or the three repositories from each other, would produce commits that were green but not meaningful. Recording it as a finding rather than defending it.
- Commit `70a846e`'s message claims two `classify` tests that a failed `sed` never wrote. `fae2aff` writes them and says so.
- **I have not pushed.** CI's last run covers `34b057b` (the red), so `slice:check` still reports `tests green: FAIL` and `test-first proven: FAIL` from that run. CI cannot go green until I-02-9 is ruled and the one line changes, so the push is best sequenced after that.

Files: `/home/agentadmin/sources/keyloop-challenge/src/application/bookAppointment.ts`, `/home/agentadmin/sources/keyloop-challenge/src/persistence/appointmentRepository.ts`, `/home/agentadmin/sources/keyloop-challenge/src/persistence/pgError.ts`, `/home/agentadmin/sources/keyloop-challenge/src/http/problem.ts`, `/home/agentadmin/sources/keyloop-challenge/src/http/routes/appointments.ts`, `/home/agentadmin/sources/keyloop-challenge/src/domain/openingHours.ts`.
