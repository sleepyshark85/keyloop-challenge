# Report · slice 06 · implementer · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 06 step 4 green
- Returned: 2026-09-06T14:45:52.674Z
- Duration: 2714s

---

Good — no stryker processes remain (exit 144 from `ps`/`grep` finding nothing is expected). Now let me answer the coordinator's five questions directly, from my own work in this session.

## 1. Did ADR-0025, ADR-0026 and ADR-0027 compose as specified once written?

**ADR-0025** composed as specified, with one thing it didn't name that I had to decide: what happens if `findDealership`/`findServiceType` return `null` for the row's own `dealershipId`/`serviceTypeId` after the existence read succeeds. ADR-0025 only speaks to the *appointment's* existence; it's silent on its referenced reference-data vanishing. There's no direct FK from `appointment` to `dealership`/`service_type` (only transitive, via the bay/technician composite FKs), so this is structurally near-unreachable, but I added `reference-data-invalid` arms mirroring booking's shape rather than leaving it a `null`-unsafe path. That's an extension of the design, not a divergence from it — flagging it because the ADR text doesn't cover it.

**ADR-0026** composed exactly as written — see answer 2.

**ADR-0027** composed exactly as written, including the "Bound-2 plus one" bound — see answer 3.

## 2. ADR-0026's branded `ResourceLock` — does it foreclose "forgot the lock", and what did the call-site move cost?

Yes. Once `bayId`/`technicianId` came off `NewAppointment` and `Move` entirely, there is no shape left for a caller to construct either write's argument without a `ResourceLock`, and the only way to get one is `lockResources`. I tried writing `insertAppointment` and `rescheduleAppointmentById` calls without threading the lock through while drafting, and both failed to compile — not a hypothetical, an actual `tsc` error I hit and fixed. The cost at the call sites was small and entirely mechanical: `bookAppointment.ts`'s single call site changed from `await lockResources(trx, bayId, technicianId); return insertAppointment(trx, {...})` to capturing the return (`const lock = await lockResources(...)`) and passing it as a third argument, dropping two fields from the object literal. `rescheduleAppointment.ts`'s loop does the same shape from the start. No call site needed a second lock or a branch on "do I have one" — the type made that question not arise.

## 3. ADR-0027's attempt-1-then-shuffle — clean, or special-cased against `nextCandidate`?

Clean, and it fell out as a state-machine split rather than a special case *inside* the shared loop primitives. I did **not** touch `nextCandidate`, `orderCandidates` or `prune` in `src/domain/candidates.ts` — attempt 1 is a plain direct call using `existing.bayId`/`existing.technicianId`, entirely outside the `CandidateOrder` abstraction. Only on that pair's first `23P01` do I call `orderCandidates` for the first time, over the *full* candidate lists (the incumbent included), and from there the loop is identical in shape to `bookAppointment`'s. The one place this needed real thought, confirmed by a unit test I wrote (`ADR-0027 — attempt 1 is the appointment's OWN pair`), is that the structural bound is `1 + |bays| + |technicians|`, not `|bays| + |technicians|` — the incumbent attempt is genuinely extra, exactly as the ADR states ("the bound is Bound-2's plus one"). A second unit test with a single bay and single technician confirmed the bounded-cost case the ADR names in its own Consequences section: attempt 2's shuffle can redraw the *identical* incumbent pair (both candidate lists are singletons), producing a second, wasted `23P01` on the same constraint before the bay list empties — not a bug, the exact cost ADR-0027 argued was bounded at one.

## 4. Anything worked around; what the reviewer should look hardest at

Nothing worked around in `src/`. The one thing I worked around was my own mistake mid-session: while trying to split the diff into commits by temporarily reverting the http-layer files to `HEAD` and restoring them afterward, I overwrote my modified `routes/appointments.ts`, `problem.ts`, `server.ts`, `main.ts` and their tests with the `HEAD` versions without saving the modified copies first, losing that work. I reconstructed all of it from the edits already recorded earlier in this session's transcript and re-verified `tsc`, the full `nodb` suite (549 tests) and `lint:arch` all green before committing — nothing is missing, but a reviewer diffing commits `b7e121e`/`d046670` against what I described earlier in the transcript is a legitimate independent check I'd want someone to actually do, since I'm the one attesting the reconstruction is faithful.

What I'd look hardest at: the `not-confirmed` vs `no-verdict`/`reference-data-invalid` arms in `rescheduleAppointment.ts` — specifically that zero rows from the guarded `UPDATE` is treated identically (`not-confirmed`) at *every* attempt number, not just attempt 1, since ADR-0025 decision 2's "zero rows means exactly one thing" has to hold uniformly across the whole loop, not just on the first try.

## 5. The Stryker instrument

Four `// Stryker disable all : <reason>` / `// Stryker restore all` pairs, one around each of the four `const unhandled: never = outcome; throw new Error(...)` arms in `src/http/routes/appointments.ts` — the `POST /appointments`, `GET /appointments/:id`, `POST /appointments/:id/cancellation`, and the new `PATCH /appointments/:id` default arms. Each pair wraps only those two lines. I did not place a disable/restore anywhere near a schema-options object or a `description:` string literal — those mutants are untouched.
