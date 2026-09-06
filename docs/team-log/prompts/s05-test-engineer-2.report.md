# Report · slice 05 · test-engineer · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 05 step 3 RED
- Returned: 2026-09-06T09:39:13.213Z
- Duration: 1350s

---

Step 3 is complete: red committed, pushed, observed in CI, and verified from the artifact.

```json
{
  "role": "test-engineer",
  "outcome": "red-committed",
  "tests_added": {"acceptance": 2, "contract": 5, "property": 0, "concurrency": 2, "integration": 2},
  "quality_scenarios_covered": ["QS-7", "QS-11"],
  "red_commit": "1e9e06c",
  "ci_failure_confirmed": true,
  "ci_run": "34025120072",
  "pull_request": 14,
  "objections": [],
  "dcr": null,
  "message": "Eleven cases across five files; ten failed in CI, every failure an AssertionError, no unit test failed, red-proof concluded success. Three mutants were run before the assertions were written, and one of them corrected the file's own claim about why AC-5 is red."
}
```

## C1, verified from the artifact

Downloaded `test-results.json` from run `34025120072` and classified it rather than reading job names: **530 passed, 10 failed, 540 total, `success: false`.** Every one of the ten failure messages begins `AssertionError`; there are no file-level collection errors and no failures under `tests/unit/`. `red-proof` on the runner emitted `red observed: … failed, no unit test failed, and verify concluded success`, and the same rule replayed offline against the local artifact exits 0.

## Green at the red — named, as asked

**One whole case, by design:** `tests/contract/cancellation.test.ts` → *AC-2 (a)*. D3 delegated AC-2's arrangement to me and asked that the choice be stated. I wrote **both** arrangements. (a) seeds the cancelled row directly under ADR-0012 and is green from this commit onward — declared in the file's header, in the case title itself, and in the commit message. It is not vacuous and cannot become so: it kills the `Type.Literal('confirmed')` substitution *today*, against merged code, which is the mutant D3 says AC-2 exists to kill. (b) is the criterion as written and fails at its arrange step — evidence about the route's absence, not about AC-2, and the file says so.

**Two sub-assertions that are green at the red and would be green over a wrong build** — the class you asked me to keep flagging:

- `cancellation-takes-no-lock.test.ts` step 1's **liveness half** (`toBe('answered')`). A `404` is fast, so "the cancel answered within 5 000 ms" passes at the red for a reason unrelated to locking. The status assertion beside it is what actually failed (`the cancel answered in 13 ms but not with 200`). It becomes load-bearing the moment the route exists.
- `cancel-appointment.test.ts` AC-4's **status assertion** (`toBe(404)`) — Fastify's own not-found handler already answers 404. That is the documented vacuous-green trap; the media-type assertion is what failed, exactly as intended.

**Unprompted, and it is the more interesting one:** AC-12 — §8.6's totality sweep — is **green in this same run**, over the very build AC-5 proves is broken. Seven rows observed, set equality satisfied, no collision. The taxonomy's totality claim passed for three slices while a live input produced `500 /problems/internal` where §8.6 promises a `400`. The sweep only ever visits inputs an author enumerated.

## Point 2 — AC-1 fails for the allocator reason

Mutant: `freeResources`'s overlap predicate without `status <> 'cancelled'`.

| | free bays after A is cancelled |
|---|---|
| predicate as designed | 1 |
| predicate dropped | 0 |

Then driven through AC-1's own three requests behind a stub route, to check the difference survives to the edge:

| | before | cancel | **after** |
|---|---|---|---|
| as designed | 409 | 200 | **201** — case passes |
| mutant | 409 | 200 | **409** — `expect(after.status).toBe(201)` fails |

The refusal and the cancellation are identical under both builds. Nothing else in the sequence moves, so AC-1's final assertion is the only thing that separates them — and it fails with `409 /problems/no-capacity`, not a 404 and not a timeout. Both measurements are recorded in the file header.

## Point 3 — the concurrency file discriminates Option A

Mutant: the cancel obeying F-02-9 literally (pre-read, take ADR-0018's two locks, update). Under a held bay advisory lock, `statement_timeout` 5 s:

| | result |
|---|---|
| D (shipped) — bare `UPDATE` | 3 ms |
| **A (mutant)** | **blocked, 57014 at 5006 ms** |
| control — `INSERT` behind ADR-0018's locks | blocked, 57014 at 5003 ms |
| witness — same `INSERT` after release | 12 ms |

Then the file's three steps run over HTTP against two stub services: **D passes all three; A fails at step 1 and never reaches steps 2 and 3.** The deadline is therefore a liveness assertion, not a timing one. The control and the release witness both discharge their purpose under D — the booking genuinely blocks, and completes 201 once released.

## Point 4 — AC-5 is red on the CTP path, and the measurement corrected the file

Both halves fail at `500 /problems/internal`, **neither at 404**. My first draft claimed the cancellation-route half would red on routing; that was wrong, and I rewrote the comment and the assertion message rather than leaving the prediction standing. Fastify consults the content-type parser **before** the router, so an empty or unparseable JSON body addressed to a route that has never been registered still raises `FST_ERR_CTP_EMPTY_JSON_BODY`. Both AC-5 cases are regression evidence about behaviour live today. I also re-measured the premise independently (third time): both codes carry `statusCode: 400` and neither sets `validation`.

## What I had to invent that step 2 did not settle

1. **Which file each criterion lives in.** The design names only two files. I placed AC-1/AC-4 in a new acceptance file, AC-2/AC-3-on-the-wire in a new contract file, and put AC-5 into the existing `error-taxonomy.test.ts` because §8.6 is that file's subject and the regression belongs where the totality claim is made.
2. **Both AC-2 arrangements rather than one.** D3 delegated the choice; it did not contemplate taking both.
3. **The cancel request sends no `content-type`.** Nothing settles this, and with AC-5 in place it decides whether AC-1/AC-3/AC-4 are green after the fix: a client that reflexively sends `application/json` with no body is answered `400` under OQ-05-2's deferral. `postCancellation` therefore sends no header and no body, with the measurement recorded beside it.
4. **`resource` on the pre-cancellation refusal.** §3 requires it present but not which value; with |B| = |T| = 1 either list may empty, so I assert membership rather than pinning one.
5. **The three deadlines** (5 s / 2 s / 20 s) — §5 says "within a deadline" and names none. Derived from the mutant run.
6. **What M3 can still assert through the API.** ADR-0023's M3 raced raw `INSERT`s; through the route a booking consults the allocator first and is refused with no insert attempted, so "1 × 201, 19 × 23P01" is not reproducible. I kept the barrier and asserted what remains true — a verdict each, at most one confirmed, the 201s equal to the stored rows, twenty cancels answering identically, zero `40P01` — added a positive witness (≥ 19 real refusals) that §5 did not ask for, and stated this extra limit in the file.
7. **`xmin` is read and rendered but never asserted.** D1 records that a replay advances it; it does not say whether to assert it. Asserting it advances would pin the implementation to writing, asserting it does not would be false, so it goes in the failure message only.
8. **A "freed once" probe** in the integration file, which is in no design section. A direct `INSERT` over the same bay and interval must still be refused `23P01`/`no_bay_overlap`. Without it, every response-level assertion in this slice passes over a build whose exclusion constraints have been dropped outright.

## Files

- `/home/agentadmin/sources/keyloop-challenge/tests/acceptance/cancel-appointment.test.ts`
- `/home/agentadmin/sources/keyloop-challenge/tests/contract/cancellation.test.ts`
- `/home/agentadmin/sources/keyloop-challenge/tests/contract/error-taxonomy.test.ts` (AC-5 added)
- `/home/agentadmin/sources/keyloop-challenge/tests/integration/cancellation-releases-slot.test.ts`
- `/home/agentadmin/sources/keyloop-challenge/tests/concurrency/cancellation-takes-no-lock.test.ts`
- `/home/agentadmin/sources/keyloop-challenge/tests/support/booking.ts` (`postCancellation`, `postRaw`)

No docs guard was stale at HEAD — `docs:check`, `defects:check`, `docs:refs`, `docs:adr-check`, `docs:budget:check`, `agents:check` and the full `test:tools` chain all exit 0 — so no separate fix commit was needed and the red commit is tests-only. `slice:check 05` shows Ready fully green, Done unverified as expected at step 3. I opened PR #14 because the workflow triggers on `pull_request` and a push to a branch with no PR runs nothing; without it §2.4's "observed red in CI" could not be discharged.
