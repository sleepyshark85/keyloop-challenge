# Report · slice 05 · implementer · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 05 step 4 GREEN
- Returned: 2026-09-06T09:56:22.632Z
- Duration: 980s

---

All three CI jobs are green on the head commit. Here is the report.

```json
{
  "role": "implementer",
  "outcome": "green",
  "commits": ["878c74b", "4bd376f", "9600d2b", "0eff5e3", "7393fc7"],
  "files_changed": 9,
  "unit_tests_added": 25,
  "acceptance_passing": true,
  "depcruise": "pass",
  "objections": [],
  "dcr": null,
  "message": "Slice 05 is green: 565 tests, 0 failed, 39 files in CI run 34025870705 on 7393fc7, all three jobs success. Five commits, each typechecked before it was made. Three findings where the design did not survive contact with the code, one of them a live 500 on merged code that is the third concrete instance of the open MAJOR T-05-7."
}
```

**CI:** run `34025870705`, sha `7393fc7` — `docs, tools and log integrity` success · `suite (Testcontainers)` success · `red-proof` success. Artifact reads 565 tests, 565 passed, 0 failed (the red was 540/10 failed, so +25, matching the unit tests added). Local `npm test` exits 0 on both projects; `npm run lint:arch` clean, 92 modules, every root covered.

**Commits** (`/home/agentadmin/sources/keyloop-challenge`)

| sha | what |
|---|---|
| `878c74b` | `src/persistence/appointmentRepository.ts` — `cancelAppointmentById`, 7 unit tests |
| `4bd376f` | `src/application/cancelAppointment.ts` — 5 unit tests |
| `9600d2b` | the route + `src/main.ts` wiring, 8 unit tests |
| `0eff5e3` | `src/http/server.ts` — AC-5, 4 unit tests |
| `7393fc7` | 2 unit assertions aimed at survivors |

`9600d2b` is 171 lines (60 src, 111 test) — over the ~150 guidance; it should have been the route and its tests separately. Naming it rather than rounding down.

**`main.ts` could not be its own delta.** Design §4 lists it as a separate interface row, but adding `cancelAppointment` to `AppointmentRouteDeps` breaks `tsc` until the composition root is wired, so under "every commit typechecks" that line travels with the route. Slice 04's vitest-transpiles-without-typechecking finding recurred exactly once and was caught the same way: 507 unit tests green while `tsc` failed on an `it.each` tuple arity.

## Predicted mutation survivors

**Two, both in the same place: the unreachable `default:` arm of the new `switch`** in `/home/agentadmin/sources/keyloop-challenge/src/http/routes/appointments.ts` — the block-removal mutant and the string mutant inside `throw new Error(\`unhandled cancel outcome …\`)`. The union has two members, both are covered, so nothing can reach the arm; `tsc` demands it and no test can kill it. The two merged routes carry the identical arm, so if slice 02's or 04's runs left survivors there, these are the same shape and the same non-answer.

I predicted two more before writing the tests and killed both rather than reporting them:

- the 404 arm's `detail: 'no appointment exists with that id'` — this file's own mutation history is that every string literal in a route survived until asserted, and I had asserted only the title;
- the route's `response: { 200: AppointmentBody, … }` object. **Measured by hand** rather than assumed: emptied to `response: {}`, the 200 still renders and the 404 still sets its own media type through `sendProblem`, so the whole suite stayed green. Staged the mutant, ran it, 1 failed | 58 passed once the stripping assertion existed, then restored. That one would have been a silent survivor.

## Where the design did not survive contact with the code

**1. `freeResources` does not exist, so AC-1's named mutant is unreachable today.** Design §1 and three test-file headers say AC-1 uniquely holds "`freeResources`'s overlap predicate" and that it is "a mutant in TypeScript, where Stryker reaches it". There is no `freeResources` under `src/`. `candidateRepository.candidateResources` reads reference data only, and its own docblock records that the availability filter deliberately lands **after slice 08**, because the pre-filter is only trustworthy once QS-8 validates it. arc42 §6.5 describes `candidateRepository.freeResources` as part of the finished system. The test-engineer's header is honest — it says the two predicates were driven "behind a stub route" — but the design's inference from that measurement is not yet true of this repository: the seam §6.5 names, two copies of the predicate with nothing forcing them to agree, has **one** copy in the codebase. What AC-1 actually proves at this slice is narrower and still unproven elsewhere: that ADR-0004's retry loop re-attempts over a cancelled row and the *constraint's* predicate lets the insert through, on the technician side as well as the bay side, through the API. The design's claim becomes true at slice 08. §1's sentence and the AC-1 header want a date attached at step 7, or slice 08 wants to inherit the claim.

**2. AC-5 closed two of three content-type-parser holes. The third is live, and it is T-05-7's next instance.** Measured on the built artifact *after* this slice, through `buildServer` from `dist/`:

```
POST /appointments   content-type: application/xml + body   -> 500 /problems/internal
```

The error is `FST_ERR_CTP_INVALID_MEDIA_TYPE`, `statusCode: 415`, no `validation` — identical shape to the two AC-5 named, and it falls to the same catch-all. Same for `application/x-www-form-urlencoded` and `multipart/form-data`. The design's argument for naming by code cites 415 as a code that "has no §8.6 row"; that is true, and the measurement shows the absence is not neutral — with no row it lands on `500 | Anything else`, which is precisely the inversion AC-5 exists to correct: the client sent a header it can see and can fix, and is told the system broke. **Naming by code is still right and I did not widen the predicate** — a 415 row is a taxonomy change the architect owns, and widening to `statusCode < 500` is the move `server.ts` already records being deleted after mutation. I added a unit test that stages a different error carrying `statusCode: 400` and asserts it is still a 500, so the predicate cannot be widened silently. This is the third concrete instance of the open MAJOR **T-05-7** ("a totality claim asserted over a hand-written input set is a claim about the author's imagination"), and it is evidence that T-05-7 is a live defect rather than a methodological worry.

Two smaller measurements from the same probe, both expected and neither a problem: `text/plain` + body on the booking route is `400 /problems/malformed-request` (via the body schema, not the CTP arm); and `POST /unknown-path` with `application/json` + empty body now answers `400` rather than the `500` it answered before — the parser-before-router ordering the test-engineer measured, applied to a path that does not exist.

**3. The cancellation route publishes two response schemas it can never produce.** Design §4 prescribes `response: { 200: AppointmentBody, ...PROBLEM_RESPONSES }`, and `PROBLEM_RESPONSES` carries 400, 404, 409 and 422. This route can produce 400 and 404 only. Harmless at runtime; ADR-0005 emits it as the OpenAPI document at slice 10, so the published contract advertises two statuses the endpoint cannot return. I implemented it as designed rather than trimming, because narrowing the shared constant at one call site is how it forks. Worth a per-route response set at slice 10.

Nothing above blocks the slice: no acceptance criterion, §10 scenario or §2 invariant fails, so none of it is a DCR. Findings 2 and 3 are architect rulings, and finding 1 is a step-7 correction.
