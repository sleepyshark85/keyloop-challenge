# Prompt · slice 05 · architect · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 05 review remedies + §8.6 DCR
- Sent: 2026-09-06T10:30:21.098Z

---

Slice 05 step 5 produced four MAJOR findings and a DCR. Branch `slice/05-cancellation`, PR **#14**, CI green on `7393fc7`, mutation 0.9073 on changed files. `changes-requested`, **not blocked** — the reviewer said explicitly that nothing in `src/` is wrong and it was not entitled to block. The test-engineer is fixing one line in its own file in parallel; stay out of `tests/`.

Rule and remedy under the standing delegation. The human is away; each ruling is provisional until the gate.

---

**R-05-1 (MAJOR) — an accepted ADR's deferral into this slice went unbuilt and unnoticed.** ADR-0019 names **slice 05** by name as the destination for **R-02-2** and **R-02-3**, on a stated criterion, and its Consequences read *"Two rows in arc42 §11 until slice 05 reaches `done`."* Neither is mentioned in `05-design.md` or `05-cancellation.md`; both are still `deferred`. The branch never touches `tests/integration/exclusion-constraints.test.ts` — **and ADR-0019's stated reason for choosing slice 05 was that it "reopens that same file anyway."** No file under `tests/` combines a `pg_advisory` lock with a dropped constraint, so R-02-2's fourth cell — *the lock cannot replace the constraint* — is still prose. R-02-3's mutant survives in this slice's own run at `routes/appointments.ts:210:19`, unchanged from slice 02's `203:19`.

The reviewer verified the residue and it changes the remedy: **R-02-3 is unkillable without a production change**, so the right outcome is to close it *with that reason*, not build it — which means ADR-0019's "slice 05 makes it stronger" premise was false for one of the two and went untested. Rule R-02-2 (build) and R-02-3 (close, with the reason) explicitly rather than letting them default into a fourth slice.

**R-05-2 (MAJOR) — slice 05 is repeating the mechanism, prospectively.** It defers three things: **F-05-1 → slice 06**, **OQ-05-2 → slice 10**, **AC-1's claim → slice 08**. `grep` finds none of `F-05-1`, `ResourceLock`, `ADR-0023`, `OQ-05-2` or the AC-1 claim in slices 06, 10 or 08. **ADR-0019's own Consequences record the pattern that works** — slice 04 routed D-04-1 to slice 08 and *slice 08 was amended* (`4d172cc`). None of the three did that. Write them into the target slice files. Then answer the question underneath: ADR-0019 requires a deferral to name a destination that makes the work cheaper or stronger, and it is now **0-for-2 at its first destination** — is the criterion wrong, or is nothing enforcing it? If the latter, name the check and I will build it; `tools/` is not yours.

**R-05-4 (MAJOR) — the remedy you accepted for I-05-5 does not fix the sentence it was accepted to fix.** You re-based D4 clause 2's MAJOR onto *"AC-1 is the sole guard on the allocator re-deriving over a cancelled row."* The reviewer measured: `candidateResources` reads only `service_bay` and `technician`/`technician_qualification` — **it never reads `appointment`**, so there is no re-derivation over a cancelled row and no two-copy seam. The severity has now been justified twice on premises that do not hold in this repository.

The reviewer also established what AC-1 *does* prove, and it is better than either stated reason: the fixture is 1×1, so `no_technician_overlap`'s predicate must also release — slice 00's AC-4 keeps `techB` free deliberately, so nothing else asserts the technician side behaviourally; and *because* the candidate list carries no availability filter, it is identical before and after the cancel, so the only thing that moved between the `409` and the `201` is the constraint's verdict on the retry attempts. **AC-1 is a proof at the edge that D1's `UPDATE` removes the row from both constraints' scope.** Take that.

**R-05-3 (MAJOR) + the DCR — a whole response class is outside the taxonomy.** Measured against the real `buildServer`: `GET /nope` returns **`404 application/json` with no `type` member at all** — there is no `setNotFoundHandler`, so it never reaches `setErrorHandler`. §8.6 opens *"Errors are RFC 9457 `application/problem+json`, with a stable `type` per failure"* and §10 indexes QS-11 as *"every failure has one status and one problem type."* A URL typo falsifies both, **and it collides on `404` with `/problems/appointment-not-found` with no `type` to disambiguate.** This slice's own rewrite of `server.ts`'s docblock asserts §8.6's totality *"is kept"* there; there is a second exit that file does not keep.

The DCR itself: **§8.6's `500` row is both a described failure class and an unrestricted catch-all ("and anything else"), which makes it unfalsifiable.** AC-12 asserts ∀rows ∃input; the property at risk is ∀responses ∃row. That reframes **T-05-7**, which is open — the reviewer's position is that T-05-7 as written can never block, because no reachability sweep can falsify a catch-all's fitness, and that what would make it block is a conformance assertion in the *opposite* direction: a fixed corpus of hostile requests, every response asserted `application/problem+json` with a `type` in the taxonomy. Its twenty-line probe found two instances in one run. Rule on the split, on `setNotFoundHandler`, and on whether either lands in slice 05 or at slice 06 step 1 where the taxonomy grows anyway. The reviewer suggested the latter; it is your call, and note that shipping a known second exit while the docblock claims totality is its own kind of debt.

---

**Two more things worth your attention, neither a finding.**

The reviewer sorted the nineteen survivors by killability rather than by age and **inverted my framing**: 9 unkillable exhaustiveness arms, 5 inert schema-options mutants (Fastify's `removeAdditional: true` makes `additionalProperties: false` strip rather than reject — it measured this), 3 OpenAPI-only description strings, 1 inert, and **1 real**, which is R-02-3. So eighteen of nineteen are not debt, and the actionable conclusion is the opposite of a §11 row: **~13 structurally unkillable mutants cap that file near 88%, so 83.04 has stopped discriminating.** Its proposed remedy is `// Stryker disable` on the exhaustiveness arms, not tests. `stryker.config.mjs`'s `mutate` list you ruled last slice to be the architect's — decide whether the disables are yours too.

It also **withdrew a MAJOR after measuring it** and turned the measurement into the explanation for five of the survivors.

---

**Constraints.** Word budgets enforced; all five guards stay green. `docs:adr-check -- --pin <file>` exists now. Accepted ADRs are immutable, but ADR-0023 is still provisional until this gate. No `src/`, no `tests/`, no `tools/`. Commit `docs(05):` / `docs(arc42):` / `docs(adr):`, ~150 lines.

**Report:** the rulings, what you amended, what you routed where — and separately anything none of this asked about.
