# Report · slice 04 · implementer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 04 step 2 AGREE
- Returned: 2026-09-06T05:40:48.289Z
- Duration: 576s

---

Measurements complete. Nothing committed; step 2 only.

## Step 2 — AGREE, with objections

`typescript` 6.0.3, this repository's `compilerOptions` (`strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `verbatimModuleSyntax`). Trees at `/tmp/claude-1000/-home-agentadmin-sources-keyloop-challenge/bf0a061e-03e3-4edb-be4f-6269c9fa32ca/scratchpad/s04/{A,E,F,G,H,C1,C2}`, each `npx tsc --noEmit -p tsconfig.json`.

### I-04-1 · ADR-0020, the cap inside the conflict arm — **AGREE**

Reproduced independently: **A exit 2**, `TS2322: Type '"bay"' is not assignable to type 'ContendedResource'`; **E exit 0**.

Judged on my own terms, not the type's: **it is what I would write, and ADR-0020 introduces no new placement.** The loop's *other* termination test is already in the conflict arm in shipped slice-02 code — `if (remaining.length > 0) continue;` then the `no-capacity` return. The conflict arm is the loop's only back-edge, so it is where a `for(;;)`'s termination conditions belong. The cap goes beside the exhaustion check because that is where its sibling already lives. Same answer as the brand at slice 02 and for the same reason: the value is already in hand at the refusal.

### I-04-2 · ADR-0020's option table is missing a fifth row — **OBJECT · minor**

ADR-0020's "Bad" names one direction only: move the cap out of the arm and `tsc` objects. The reverse is silent. Add a `PgOutcome` variant that is retried — a second `continue` — and the loop is **unbounded**: no `tsc` error, no test, a hang. Under Option A that is unrepresentable. The ADR trades a structural liveness bound for a type guarantee and does not say so.

Measured **F — both**: arm-placed refusals *plus* `for (let attempts = 1; attempts <= cap; attempts += 1)`, and `throw new Error(...)` at the tail. **exit 0, no cast, no fabricated resource.** The post-loop position needs to be *unreachable*, not a refusal, and a throw discharges `noImplicitReturns` without minting anything — which is the possibility the four-tree framing missed, because it assumed the tail had to return a `BookOutcome`. Cost: one dead statement, likely one Stryker survivor on the message literal.

**Change sought:** add F to the table and rule it. I do not insist on F; I insist the table not read as "the loop bound and the arm placement are alternatives", because they compose.

### I-04-3 · §3's `nextCandidate` signature does not compile — **OBJECT · major**

§3 states `nextCandidate` is *"TOTAL — a `CandidateOrder` is non-empty, so there is always a head and no index assertion"*, and that the brand *"removes the last `as string` index assertion on the booking path"*.

**C1, the stated carrier verbatim — exit 2**, twice `TS2322: Type 'string | undefined' is not assignable to type 'string'`. The brand sits on the object; `readonly bays: readonly string[]` is untouched by it, so `noUncheckedIndexedAccess` still yields `string | undefined`. The assertion is **relocated** from `bookAppointment.ts` into `candidates.ts`, not removed.

**C2 — exit 0, no index assertion anywhere.** Carry non-empty tuples:

```ts
type NonEmpty<T> = readonly [T, ...T[]];
function nonEmpty(values: readonly string[]): NonEmpty<string> | null {
  const [head, ...tail] = values;
  return head === undefined ? null : [head, ...tail];
}
```

The three `as CandidateOrder` at the minting sites are the house brand pattern (`src/domain/interval.ts:35`, `src/domain/duration.ts:30`) and are not matched by `contended-resource-cast`, whose pattern is `/\bas\s+ContendedResource\b/` (`tests/architecture/ambiguity-containment.test.ts:333`). C1 needs those casts *too*, plus the index assertions, so C2 strictly dominates.

**Change sought:** `CandidateOrder`'s carrier becomes `readonly [string, ...string[]]` for both lists; §3's "removes the last `as string`" sentence keeps its claim only under that carrier, and should be narrowed to "relocates" if the carrier stays.

### I-04-4 · §4 forces an unreachable branch — **OBJECT · minor**

§4: *"one `orderCandidates` call after the two empty-candidate guards"*.

- **H** (no null handler): exit 2, `TS2345` — `tsc` forces the branch to exist.
- **E** (handler after the guards): exit 0, and the branch is unreachable by construction. No test can cover it; Stryker gets a free survivor; I have to invent an outcome for a state that cannot occur.
- **G** (guards folded *into* the null branch): exit 0, both outcomes preserved (`bays.length === 0` → `reference-data-invalid: no-service-bays`, else `unknown-reference: service-type`), **every branch reachable**.

G is also the better split: the domain owns *"is there a candidate"*, the application owns *"whose fault is it"*.

**Change sought:** §4's clause becomes "one `orderCandidates` call **replacing** the two empty-candidate guards, which move into its `null` branch".

### I-04-5 · D-04-1 is right, sharper than stated, and routed to a slice that refuses it — **OBJECT · major**

**(a) The finding is stronger than the filter premise.** ADR-0009 sized the cap **below the bound its own Bound-2 paragraph computed**: *"Worst case |bays| + |technicians| − 1 attempts: roughly 40, not roughly 300"* — then *"a hard cap of 16"*. arc42 §1.1: *"single-digit bays and tens of technicians"*. So `|bays| + |technicians| − 1 > 16` at ordinary scale **with or without the filter**; the filter changes only whether a conflict means a race or a busy resource. Two numbers already in the repository:

- Slice 09 **AC-12**'s fixture is 5 bays, 20 technicians, 500 appointments → additive bound **24 > 16**. **AC-13** asserts an uncontended booking on that fixture issues **exactly one `INSERT`** — which an unfiltered, shuffled candidate list over 500 appointments cannot promise. D-04-1 has a sibling, and it is slice 09's.
- QS-3's largest fixture, (N,M) = (20,8): 7 bay prunes + 7 technician prunes, then attempt 15 empties a list. **Max 15 attempts against a cap of 16.** The design says QS-3's fixtures cannot see D-04-1 — true, and the margin is *one attempt*. Worth stating, because it is the number that moves if anyone edits the fixture.

**(b) The deferral target excludes it.** `docs/slices/08-availability-query.md`, Out of scope: *"Using the query to drive allocation. A-5 fixed booking as 'can I have 09:00?' … making availability authoritative would reintroduce check-then-act."* That covers exactly the work D-04-1 is deferred into, for a stated ADR-level reason, in a slice marked `gate: light`. ADR-0019's criterion is that the receiving slice makes the work *cheaper or stronger*; a receiving slice whose own file forbids it makes it impossible, and the deferral becomes permanent.

**Change sought:** the ruling must name the slice-08 edit — distinguishing *availability as an authoritative allocator* (excluded, correctly) from *an advisory pre-filter on the candidate list, still adjudicated by the insert and still retried*. Slice files are the orchestrator's, so a routing stated only in this design creates no work item — F-02-11 again, exactly as F-04-3 catches for §11.

**Does it change what I build now? No.** And I offer the deferral a better argument than §5's *"no acceptance criterion needs it"*: the pre-filter is only trustworthy because of **QS-8** — *every pair availability reports free is accepted by an `INSERT`* — which is slice 08's property test. Shipping the filter before the property that validates it is backwards. Note that argument places the filter **after** slice 08, which is (b) again and reinforces the routing objection rather than answering it.

Separately, and for the architect only: the cap is **not** a termination guard — Bound-2 already bounds the loop at `|bays| + |technicians| − 1`. It is a latency guard, and QS-14/slice 09 budgets only the *uncontended* booking, so nothing measures the thing the cap protects. Raising the default is one line in `config.ts` and ADR-0009's own rejection of a large cap was argued against the *multiplicative* bound ("hundreds of pairs"), not the additive one. I am not asking for it — 16 is human-accepted and implementing it is my job — but it is the cheap remedy if a (b) is wanted.

### I-04-6 · A-04-1 / F-02-9 — **AGREE**, checked against the code, and understated

`lockResources` (`src/persistence/appointmentRepository.ts`) takes both locks in **one** `SELECT` over `unnest(array[1,2], array[hashtext($bay), hashtext($tech)])`; `BAY_LOCK_CLASS = 1` and `TECHNICIAN_LOCK_CLASS = 2` are module constants in persistence. The shuffle supplies only the two *values*. Three independent reasons, where the design gives one:

1. Disjoint class key spaces — the design's reason.
2. It is **one literal statement**, so whatever order PostgreSQL evaluates it in is the *same* order at every attempt. A cycle needs two transactions taking the same two lock objects in *opposite* orders; identical statement text rules that out without depending on `unnest` row order being ordered. Stronger than the stated claim.
3. `src/domain/candidates.ts` cannot reach the classes at all — `domain-is-pure` is `to: {}`, absolute, no allowlist (`.dependency-cruiser.js:36-67`).

Slice 04 adds no write path to `appointment`, so F-02-9 gains no obligation here.

### I-04-7 · `ATTEMPT_CAP` configurable — **AGREE**, with the conditional removed

Not a test seam: ADR-0009 already decided it — *"it is a `platform/config.ts` value"*. The design implements an accepted decision rather than inventing one. The fixture argument is also real: reaching 16 attempts *without* exhausting a list needs bay- and technician-conflicts to alternate, which needs roughly 9 bays busy with unqualified technicians plus 7 technicians busy in already-pruned bays — buildable, brittle, and dependent on the drawn permutation. Cap 3 needs four rows.

**Two changes.** §5's *"If step 3 takes it, one assertion that the default is 16 belongs beside it"* is conditional on the test-engineer's fixture choice and should not be — the risk is `ATTEMPT_CAP` defaulting wrongly in production, which is independent of how AC-4 is fixtured. `loadConfig` and `tests/unit/platform/config.test.ts` are both mine, so **I will pin the default at 16 there regardless**; make the sentence unconditional.

And §4 should say the range's **lower bound of 1 is load-bearing under ADR-0020, not taste**: the arm-placed check is reached only after a classification, so there is no refusal exit before the first attempt and `ATTEMPT_CAP=0` would silently behave as 1. `min 1` is what makes that a startup failure rather than a silent one, and `config.ts` should record it or someone will relax it.

### I-04-8 · the seed source adds an import `main.ts` deliberately avoids — **OBJECT · trivial**

§3 binds `seed` to `randomInt(0, 2 ** 32)` — `node:crypto`'s, requiring an import. `src/main.ts:50` states why `newId` uses the **global** instead: *"`crypto` is a Node global, so injecting `newId` gives `src/application` no import and leaves `no-dev-dep-in-src` and the layering rules untouched (DA-02-1)."* Measured: `crypto.getRandomValues(new Uint32Array(1))[0] ?? 0` compiles **exit 0** under this repo's options with `types: ["node"]`, no import. I will use the global unless ruled otherwise.

### I-04-9 · §5's ruling falsifies two sentences in shipped source — **notice, not an objection**

`src/persistence/candidateRepository.ts` says *"Slice 04 adds the availability filter in the same slice as ADR-0009's ordering and QS-3, where the read and the reason it is advisory arrive together"* and *"a request may be refused while an untried bay is free, until slice 04."* Both become false at merge. The file is mine; I will correct them in slice 04, pointing at D-04-1 and its real destination once I-04-5 is ruled. Named here so it is not found at review.

---

```json
{
  "role": "implementer",
  "outcome": "objected",
  "commits": [],
  "files_changed": 0,
  "unit_tests_added": 0,
  "acceptance_passing": false,
  "depcruise": "not-run",
  "objections": ["I-04-2", "I-04-3", "I-04-4", "I-04-5", "I-04-8"],
  "dcr": null,
  "message": "ADR-0020 reproduced and agreed: A exit 2, E exit 0, and the cap belongs beside the exhaustion check because that check is already in the conflict arm in shipped code. Five objections, all measured: §3's nextCandidate signature does not compile as written and relocates the assertion rather than removing it; §4's ordering forces an unreachable branch tsc demands and no test can cover; D-04-1 is right and sharper than stated, but slice 08's Out of scope forbids the work it is deferred into; ADR-0020's option table omits a shape that keeps both the arm placement and a structural loop bound; and the seed source adds an import main.ts deliberately avoids."
}
```
