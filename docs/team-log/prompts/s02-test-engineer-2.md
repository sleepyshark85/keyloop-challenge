# Prompt · slice 02 · test-engineer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 02 step 3 RED
- Sent: 2026-09-05T17:32:08.259Z

---

Slice 02, **step 3 — RED**. You are the test-engineer, on `slice/02-book-and-read-an-appointment` at `ce41a0d`. Everything you flagged at step 2 is resolved; nothing is queued behind you.

Re-read `docs/slices/02-design.md` — it has changed materially since your step-2 review, and `docs/slices/02-book-and-read-an-appointment.md` has too.

## Your step-2 objections, and what happened to each

All eleven were ruled **(a) clarification**, no loopback consumed. The two you escalated went to the human:

- **E-02-2 — you were right, and the ruling went your way.** QS-12 reads **by concept, not by spelling**. arc42 §10.2 now says so in the scenario's own text: *"deriving a wall clock or calendar field from an instant, by any route… `Intl.DateTimeFormat`, `toLocaleString` and `getHours` illustrate that concept rather than define it… **carrying an opaque zone string is not reasoning about a zone**."* Your refusal to resolve it yourself — *"however good the argument"* — is why it reached the human at all, and the ruling rests on the reason you supplied: the response measure survives, because transport files hold a string they never interpret.
- **E-02-1 — the minimal retry loop is IN scope**, and **your AC-11 argument is what decided it.** Neither the architect nor the orchestrator had made it: without the loop, `resource` systematically names the *abundant* resource under double violation, so AC-11 is wrong and slice 09's metric inherits it. The three alternatives you and the implementer set out all left that wrong. ADR-0009's seeded ordering and the cap of 16 stay in slice 04.
- **T-02-1 — accepted.** §2.6 and §0 now say prune per **value**, not per resource. Your trace was right and it was found before any code existed.
- **T-02-2 — accepted.** `appointment-table-access` is now a concept — a query *issued against* the table — not the token `/\bappointment\b/`.
- **T-02-3 / I-02-7 — accepted.** The `201`/`200` bodies, `AppointmentView`'s fields and the `ReadOutcome` union are pinned in the design.
- **T-02-4 — accepted**, and it is good news you found: `reference-data-invalid` IS reachable over HTTP via a seeded bad zone, so **all seven of §8.6's in-scope rows are reachable and AC-12 is satisfiable as written**.
- **T-02-7 — half accepted.** Zero bays is broken reference data ⇒ `500`. "No qualified technician here" stays `unknown-reference: service-type`; a new problem type was ruled scope growth.
- **T-02-8 — accepted.** The DoD's "record ADR-0009's seed" is not satisfiable this slice; record the fixture namespace and derived ids as you proposed.
- **I-02-6 — accepted, and it was blocking.** `BookDeps` gains a logger; the refusal path logs `{ constraint, resource, attempts }`. **That is your observer for AC-3 and AC-4** — `tests/support/service.ts` spawns the built artifact, so `pino`'s stdout is readable without importing `src/`.
- Your two **additions**: the **DDL-drop negative control is adopted**; `pg_stat_statements` is deferred as **F-02-6**, recorded rather than dressed as a ruling.

## The task: one red commit, all 19 acceptance criteria

`test(acceptance): … (red)`, and §7 allows exactly one. Your planned shape from step 2 stands — acceptance, contract, concurrency, property, integration, architecture — plus the two respecified markers.

**The markers are specified in `docs/slices/02-design.md`, and the architect widened the form list after your review**, so read it fresh: `wall-clock-reasoning` now also catches `getTimezoneOffset`, `getSeconds`/`getMilliseconds` and `toString`/`toDateString`/`toTimeString`. `getUTC*` and ambient-zone *construction* are excluded **deliberately**, as drawn boundaries — the design says so in those terms. Your three planted controls are required: zone reasoning inside a transport-permitted file must still fire.

**`zone-transport` is asserted by set equality, not subset** — a file that should not be on the list fails just as a missing one does. The architect's reason, which I want preserved in the test: an over-long transport list is exactly how transport turns into reasoning without anyone deciding to.

## What I will hold you to

1. **C1 — every failure is an assertion, not a load error.** You verified this at step 2 and named three exceptions: AC-16 reds as a caught `RangeError`, AC-18 is green by design as the negative control, AC-19 must be written end-to-end through reference data or it is vacuous. Handle all three as you specified, and say in your report what each looks like at the red.
2. **AC-2's `404` is a vacuous-green trap** you found yourself — assert `application/problem+json` and the `type`, not the status alone.
3. **The mutants.** For every discrimination claim, name the mutant and run it. That applies to the two new markers especially: the measurement that convinced everyone was that the *old* marker reported the same four files whether or not violations were planted.

## Constraints

Yours: `tests/{acceptance,contract,property,concurrency,architecture,performance}/` and database-invariant integration tests. **You do not read `src/`.** Not yours: `tests/unit/`, `src/`, `docs/`, `.claude/`.

Commit by explicit pathspec. Verify the red is observed in CI — I will collect the run. `npm run lint:arch` and `npm run test:tools` must stay green; only the new acceptance tests fail. Trailers:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qsRtEbkABftxsp7LWAkyW
```

Report: the file-by-file shape, which AC each case covers, the mutants run with their kill counts, and anything in the design you still cannot write a test against. If something is untestable as specified, raise a DCR — do not invent a testable version of it.
