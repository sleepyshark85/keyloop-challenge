# Report · slice 05 · test-engineer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 05 step 2 AGREE
- Returned: 2026-09-06T08:57:06.108Z
- Duration: 404s

---

I have what I need. Verified against the committed suite rather than taken on the design's word.

---

## Report

```json
{
  "role": "test-engineer",
  "outcome": "objected",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0},
  "quality_scenarios_covered": [],
  "red_commit": null,
  "ci_failure_confirmed": false,
  "objections": ["T-05-1", "T-05-2", "T-05-3", "T-05-4", "T-05-5"],
  "dcr": null,
  "message": "Agreed on D1, the 1x1 fixture and the const-body-twice; five objections, of which two are measurements against the design's own claims — section 1's premise is false against committed tests, and the concurrency file's assertion set is invariant under the mutation it exists to detect."
}
```

---

### T-05-1 · MAJOR · §1's central claim is false, measured

**What fails.** "One acceptance criterion is the entire guard on it" and "it lives in a `.sql` file where Stryker cannot reach it." The predicate already has two committed guards, both in `/home/agentadmin/sources/keyloop-challenge/tests/integration/exclusion-constraints.test.ts`:

- **A definitional guard covering both constraints.** `EXPECTED_CONSTRAINT_DEFS` (lines 105–112) compares `pg_get_constraintdef` output **by equality**, per constraint name, including `WHERE ((status <> 'cancelled'::appointment_status))` for `no_bay_overlap` *and* `no_technician_overlap`. Dropping the predicate from either one changes that string. Every drop-one and drop-both variant dies here, with no behavioural inference required.
- **A behavioural guard on the bay side.** Case AC-4 (line 605) is already the before/after pair: insert A, contender refused `23P01`/`no_bay_overlap`, cancel A by SQL, contender accepted. Its own title is *"the predicate is live and not decorative"*.

**Why it matters to my deliverable.** It misnames the mutant, so it points step 3 at the wrong target. What AC-1 uniquely adds is two things, and neither is the one §1 names:

1. A *behavioural* technician-side guard — slice 00's AC-4 deliberately uses `techB`/`quick` to keep the technician free, so the technician predicate is guarded definitionally only. At `|B| = |T| = 1` the re-book conflicts on both, so AC-1 covers it. Real, and narrow.
2. **The predicate is live *through the allocator*.** Slice 00 inserts a hand-chosen `(bay, technician)` pair. AC-1 proves the candidate-allocation path re-derives a pair over a cancelled row — that nothing in `src/application` independently excludes a resource whose only conflicting row is cancelled. That mutant lives in TypeScript, where Stryker *can* reach it. `booking.ts` already carries `overlappingConfirmed()` and `confirmedOverlapping()`, so a `status <> 'cancelled'` filter exists somewhere on the read side; a mutation there is exactly what AC-1 catches and nothing else does.

**Also load-bearing for D4.** Revocation clause 2 rates "AC-1 passing vacuously" as gate-revoking MAJOR *because* AC-1 is claimed to be the sole guard. On a false premise that severity is unearned.

**Remedy I would accept.** §1 rewritten to name the two existing guards and to state AC-1's increment as the allocator-side one. **Narrower remedy I would accept:** leave §1's severity framing, but add one sentence naming `exclusion-constraints.test.ts` case 0 and AC-4, so step 3 is not asked to re-prove them. I will target the allocator mutant either way; I would rather the design agreed that is what AC-1 is for.

---

### T-05-2 · MAJOR · The concurrency file cannot fail for the reason it exists

**What fails.** §5's assertion set — zero `booking.deadlock`, zero `500`s, every request a verdict, exactly one `confirmed` row — is **invariant under the mutation the file exists to detect**, and ADR-0018's own control table is the proof:

| | Rows after 20 racers | Deadlocks |
|---|---|---|
| locks on, constraints present | 1 | 0 |
| locks off, constraints present | 1 | 108 |

In slice 05's fixture the **bookings still take the locks** — the booking path is untouched. Only the cancel is exempt. So run the test against Option A (cancel takes the locks, ADR-0023's rejected option): the cancels queue behind the bookings on the bay's advisory lock, and you get zero deadlocks, zero `500`s, every request a verdict, one `confirmed` row. **Identical observable.** The file measures ADR-0018's already-tested property, not ADR-0023's decision.

It is not pure decoration — it does discriminate *catastrophically unsafe* (a cycle → `40P01` → `booking.deadlock` → `500`) from safe. But F-05-1 predicts the opposite regression, and it is the likelier one: someone adds `lockResources` to `cancelAppointmentById` for uniformity, because "correctly exempt" reads identically to "forgot the lock." Nothing in the designed file goes red for that.

This is `no-spurious-refusal.test.ts`'s own documented standard, turned on the new file: *"'No `25P02` appeared' is vacuously true of a service that never retried… the assertion cannot fail for the reason it is about."* That file gates its absence-assertion on a positive witness (E2). This one has no witness.

**Remedy I would accept.** One deterministic discriminator, in ADR-0018's two-controls style, plus its own positive control:

- Hold `pg_advisory_xact_lock(1, hashtext($bayId))` in a second `pg` session, keys derived exactly as ADR-0018 specifies. `POST /appointments/{id}/cancellation` must return `200` within a short deadline. Under Option A it blocks until the holder commits and the test fails on timeout. This is M2 promoted from a one-off reading to a standing assertion, and it is **not timing-flaky** — the gap is "returns in ~2 ms" versus "blocks indefinitely", not 2 ms versus 40 ms.
- **The control, which is not optional:** with the same lock held, a *booking* for that bay must block. Without it, an implementation that changed the key derivation makes the cancel assertion pass vacuously — the held lock would be the wrong key and nothing would be blocked either way. The pair is what makes it evidence.

**Narrower remedy I would accept.** Keep §5's liveness assertions exactly as designed, add the two-assertion discriminator above as a second `it()`, and say in the file header that the liveness half is a safety guard on the unsafe direction and the discriminator is the guard on the exemption itself. If the architect rejects the held-lock probe as too white-box, I would accept instead: assert that at least one booking verdict is issued *before* any cancel commits and at least one *after*, so the run is witnessed as genuinely interleaved rather than sequenced — weaker, but it at least stops "the race did not happen" from passing.

---

### T-05-3 · MAJOR · ADR-0023's *iff* outruns its evidence, and slice 06 inherits it

**What fails.** M1–M3 measure **one statement in one transactional shape**: a single `UPDATE`, alone in its transaction, waiting on nothing. The rule they are used to license is universally quantified over statements:

> A statement takes ADR-0018's two advisory locks **iff the row version it writes falls inside an exclusion constraint's scope.**

The safety argument that actually carries M1 is *"the wait is one-directional, inserter onto canceller"* — and that is a property of the **transaction**, not of the row version. A statement outside the constraints' scope that sits inside a transaction which *also* waits on something else is exempt by the rule and can close a cycle. The rule as written does not exclude it and the measurements do not cover it.

**Named risk, and it is the next slice.** Slice 06 is an atomic move. If it is written as `UPDATE old → cancelled` plus `INSERT new confirmed` in one transaction, the rule exempts the first half and locks on the second. Today that is harmless — the transaction holds the locks anyway — but the rule invites reasoning about halves, and the ADR's assurance that "slice 06 inherits ADR-0018 exactly as written" rests on the *insert* half, not on the rule it just shipped. The failure mode it reopens is ADR-0018's, measured at 285 of 400.

Also: **"the row version it writes"** is ambiguous for an `UPDATE`, which writes a new version and supersedes an old one that *was* indexed. All of M1 is about the old version's disappearance being what the inserter waits on; the rule names only the new one.

The ⇒ direction is fine — ADR-0018 measured it (locks off → 108 deadlocks) and the ADR cites it. My objection is on the ⇐ direction's generality only.

**Remedy I would accept.** One clause, costing nothing today because D1 is already exactly this shape: the rule applies to **a statement alone in its transaction, which can therefore only be waited *on* and never be a waiter**. That is the half M1 and M2 actually measure, and stating it is what stops slice 06 from inheriting an exemption the evidence does not cover.

**Narrower remedy I would accept.** ADR-0023 is `status: accepted` and immutable, but it is *provisional until slice 05's gate*, and ADR-0021 sets the precedent of narrowing a claim before ratification. Failing that: an **A-05-3** in `05-design.md` recording that M1–M3 cover a single-statement transaction only, and that slice 06 must re-measure before applying the exemption to any multi-statement path. I would not block on the ADR text; I would block on the limit being written down somewhere slice 06 will read.

---

### T-05-4 · MINOR · OQ-05-1 is an acceptance-criterion question, not a step-3 detail

**What fails.** "Measure at step 3 and let the harness's finding fix the contract" defers a question that decides **AC-4**. Fastify with `content-type: application/json` and a zero-length body raises `FST_ERR_CTP_EMPTY_JSON_BODY` in the content-type parser — *before* the route schema, and therefore before slice 03's `/problems/malformed-request` path, which arc42 §8.6 attributes to "TypeBox, before any handler." If that error reaches the client as Fastify's own `{statusCode, error, message}` as `application/json`, it is a **client-reachable error response outside §8.6's closed taxonomy** — and §8.6's own claim is that the set is closed with one constructor.

The natural client call is `curl -X POST -H 'content-type: application/json' …/cancellation`. Slice 10's harness will emit exactly that. So the finding does not stay in my test file; it lands on the contract.

**Remedy I would accept.** Rule now what the route does with that header, and state AC-4 over the call shape it is asserted against.

**Narrower remedy I would accept.** Leave OQ-05-1 open, but I assert AC-4 over **both** call shapes — with and without `content-type: application/json` — and whichever is not `404 /problems/appointment-not-found` becomes a §8.6 finding at step 3 rather than a contract quietly bent to fit. Cost: two lines in my test.

---

### T-05-5 · MINOR · D3's "still honestly red" is true in letter and empty in substance — and I cannot verify its premise

Two parts, and I separate them.

**On the premise.** D3 asserts three things about `src/`: `readAppointment` returns `found` for a cancelled row, `AppointmentView.status` is the two-member union, `AppointmentBody.status` is `Type.Union`. **I am forbidden to read `src/`, so my agreement to those is not verification — it is deference wearing verification's clothes.** I am flagging that rather than agreeing to it. If the design needs my step-2 sign-off on a `src/` claim, the claim should be restated as an observable one that step 3 can measure.

**On the red.** AC-2's test fails at step 3 because the cancel route 404s at its *arrange* step. That is the same reason AC-1, AC-3 and AC-4 fail. §2.4's letter is met — the test fails. But AC-2 has never failed **for its own reason**, and at green it will pass without a line having been written for it. Its red carries no information that AC-1's red does not already carry, which is the same objection as "a test failing on a missing import proves nothing." Calling that "still honestly red" overstates it.

I am not asking to change the test. **I disagree with the claim and agree with the design.** AC-2 is worth having: it is a regression guard on slice 02's read path, newly reachable, and it kills the `Type.Literal('confirmed')` substitution mutant. That is a good reason to write it.

**Remedy I would accept.** Drop "still honestly red" and say what it is: red only because the route is absent; a regression guard on existing behaviour, not new verification.

**Narrower remedy I would accept.** Leave the wording; I record at step 3 what AC-2's assertion does against a cancelled row inserted by direct SQL. If that probe is green before any production line is written, the step-3 report says so plainly, and the gate sees which of AC-2's two readings is true.

---

## What I will have to invent at step 3, which the design does not mention

Listed separately because this is where the last three slices' ambiguities surfaced.

1. **A total row comparator for AC-3, and a correction to A-05-1's second half.** `findStoredAppointment` in `/home/agentadmin/sources/keyloop-challenge/tests/support/booking.ts` returns a **fixed projection** (id, dealership, customer, vehicle, serviceType, technician, bay, startsAt, endsAt) — `updated_at` is not in it. "No column of the row changes" needs `to_jsonb(appointment)` equality before/after, or AC-3 asserts only over columns I happened to pick. I will write that.

   More importantly: **`updatedAt` appears nowhere in `tests/` and, on the evidence, is not in the response body.** So A-05-1's *"and the response body is identical"* half is satisfied by D1's `CASE` **and** by the plain `updated_at = now()` alternative equally — it does no discriminating work. The entire observable difference between the two options is SQL-side. AC-3 therefore **cannot be a contract assertion** and its only guard is my `to_jsonb` comparison. Worth knowing, because Stryker will not produce a targeted `CASE`-removal mutant either: the statement is one string literal, and mutating it to `""` fails everything loudly rather than isolating the `CASE`. D1's `CASE` has exactly one guard in the whole system and it is a line I have not written yet.

2. **The `postCancellation` helper's header and body shape** — blocked on T-05-4. `booking.ts` has `postBooking` and `getAppointment`; there is no `POST`-with-no-body helper.

3. **Which constraint `resource` names at `|B| = |T| = 1`.** Both conflict; `err.constraint` reports whichever GiST index is checked first. The design correctly asks only for `resource` present — I will assert presence and membership in the two-element set, never a value, and render which one fired into the failure message. `booking.ts`'s permutation-safety rule (I-04-10) is the same discipline: assert only what holds for every reachable path.

4. **The concurrency file's barrier shape.** `releaseFromBarrier` has only ever released *one* kind of request. Racing N cancels against N bookings needs two request kinds released from one barrier. Mechanically fine, never done here.

5. **Namespace allocation for two new files.** `seedScenario` derives ids from a namespace and two files sharing one collide on `dealership_pkey` — deliberately. Mine to manage, but it is a step-3 decision nobody has written down.

6. **Whether the cancel route needs a row in `tests/architecture/layering.test.ts`'s expectations.** The design says no `.dependency-cruiser.js` change; it does not say whether the architecture tests enumerate routes.

**What I agree with, on the record.** D1's unconditional `UPDATE` with the `CASE`. The 1×1 fixture — `seedScenario` already defaults to `bays: 1, technicians: 1`, one pair means one permutation, and `booking.ts`'s own rule is that a fixture is permutation-safe when the scarce resource is the singleton list, which this satisfies twice over. Not pinning `BOOKING_SEED`, for ADR-0021's stated reason. And **one `const` body posted twice is sufficient to mean "the same booking"** — `bookingBody` pins `startsAt` explicitly and the duration derives from `serviceTypeId`, so the interval is identical by construction, and at 1×1 the pair must be too. The fourth-way trap the design does not name — the `201` landing at a different *time* — is closed by the body shape, not left open. `CancelOutcome` as its own union, no §8.6 row, and not creating `src/domain/appointment.ts`: agreed on their stated reasoning.
