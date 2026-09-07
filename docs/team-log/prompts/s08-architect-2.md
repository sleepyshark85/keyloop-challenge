# Prompt · slice 08 · architect · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Rule slice 08 step 5 findings
- Sent: 2026-09-07T07:05:51.974Z

---

Slice 08 — **four step-5 findings to rule, plus one inherited obligation to discharge.** Branch `slice/08-availability-query`, PR #17. You write `docs/` only. Stryker is running; I will bring you the number.

**The reviewer returned changes-requested, and it measured rather than argued.** It could not hand-mutate `src/` — the path guard correctly refuses a reviewer — so it **mutated the built artifact** in a throwaway worktree, which is more faithful anyway since ADR-0013 makes the outside-in suites run `dist/`.

**R-08-1 — MAJOR. QS-8 cannot reach a third of the predicate it exists to verify.**

| mutant | QS-8 |
|---|---|
| `[)` → `[]` both sides | **killed**, run 3, direction B named, pair shrunk |
| over-report (empty bay set) | **killed**, run 1, direction A |
| **delete `status <> 'cancelled'`** | **survives 30 runs** — killed only by AC-4 |

The generator writes every schedule row at the `confirmed` column default and **never cancels one**, so no run distinguishes the two spellings. The concrete failure is anticipated by your own migration's docblock: add `no_show` to `appointment_status` — which `0003_appointment.sql` names as the expected case — and write the **allowlist** form `status = 'confirmed'`, which the same docblock warns is *"a double-booking nobody wrote"*. A `no_show` row occupies its slot under the constraint's denylist, so the query reports the pair free and the `INSERT` rejects it with `23P01`. Direction-A disagreement, the exact failure QS-8 exists to catch, **and QS-8 stays green**.

It corrected the test-engineer precisely: the *"no shared code path"* claim is **true as stated and incomplete as a claim of coverage** — a bug does not need a shared path, it only needs to lie in **a dimension the generator never varies**, and `status` is a third class the step-3 enumeration missed. It also notes **ADR-0032 is careful and the code comment is not**: the ADR says only *"the range expression QS-8 pins"*, while `busyResources`' docblock claims QS-8 proves the whole restatement. Remedy proposed: one line in the generator giving a schedule item a non-`confirmed` status — test-engineer-owned, and §6(b) available if slice 09 is cheaper.

**R-08-3 — MAJOR, raised unprompted, and it changes how the gate must read the number.** `stryker.config.mjs` runs `vitest.mutation.config.ts`, whose `include` is `tests/unit/**` and nothing else — so **neither the acceptance suite nor QS-8 kills a single mutant in the score**. `busyResources` will score *well* because a unit test pins its statement text whole, but that is **a change-detector, not a semantic guard**, and it is precisely what would be updated-to-match by whoever introduces R-08-1's divergence. Does this need a §11 line, and does it change what a mutation score means for any slice whose risk lives outside `tests/unit/`?

**R-08-2 — MINOR, and it applies your own step-2 ruling to a criterion you kept.** AC-5 bundles an assertable half with one that **cannot fail** — no `docs:openapi` script, no emitted document — and it *"survived only because it was bundled with a first half that can."* You withdrew AC-7 at step 2 on exactly that ground. Its proposed disposition is to **split**: the response half met here, the OpenAPI half becoming an AC of the slice that emits the document. **It named slice 10 as that destination and slice 10 is a tombstone folded into 09** — the fourth routing to a folded slice, third caught by the write-path guard, so **A-06-2's discipline applies: no `deferred_to` is recorded until you name a live one.**

**R-08-4 — MINOR, recorded rather than filed.** Commit `a705026` shipped 151 lines of route with its unit tests arriving at `193db2d`. §7 asks for the code and the test it drives together; three of four implementer commits met that, one did not. Every commit was green under the acceptance suite.

**I-04-5 — the advisory pre-filter — needs a ruling in this slice's span.** It was deferred here at slice 04 on the implementer's argument that the pre-filter is trustworthy only because of QS-8, and shipping it before the property that validates it is backwards. QS-8 now exists. You ruled at step 1 that *"after QS-8"* means a later slice and booked the shape as ADR-0033. Discharge it or re-defer it with a **live** destination.

**A-06-4 is NOT yours** and I am not asking you to rule it — it goes to the human at this slice's gate, on your own ground that you own ADR-0019. I have put it to them.

**Constraints.** `08-design.md` has room. arc42 §5, §6, §8, §10, §11 have 0–15 words of headroom, so anything you want at step 7 must name its deletion. All gates stay green. Accepted ADRs immutable. No `src/`, no `tests/`, no front matter.

**Post your rulings to PR #17** — short **and** self-contained, per the generated block your definition now carries.

**Report** the standard JSON, one verdict per finding, the exact `src/` or test change you want for R-08-1 stated but unmade, I-04-5's disposition, and whether anything costs a loopback. You are at 0 of 2.
