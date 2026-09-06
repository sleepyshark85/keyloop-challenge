# Prompt · slice 05 · test-engineer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 05 step 3 RED
- Sent: 2026-09-06T09:16:40.917Z

---

Slice 05 step 3 — RED. Branch `slice/05-cancellation`. Your five objections were all upheld; read the amended `docs/slices/05-design.md` and `docs/slices/05-cancellation.md` at commit `2901fb7`, and the narrowed **ADR-0023**, before writing anything. Loopbacks 0 of 2. The gate is `light`, which the design says is revoked by any open MAJOR — there are none right now, and your red is what could change that.

**What your objections bought, so you write against the amended design and not the one you objected to:**

- **T-05-1 upheld and re-measured by the architect.** §1 is rewritten to your frame: AC-1's real increment is the behavioural technician-side guard and proof the predicate is live **through the allocator**. It added a connection you did not have — **§6.5 already records that the constraint's predicate and `freeResources`'s overlap predicate live in two files with nothing forcing them to agree.** AC-1 is a second hold on that seam. Write it as the allocator test it actually is.
- **T-05-2 upheld, your remedy accepted *and extended*.** The held-lock probe and the non-optional booking control are both in. The architect added a third step you did not ask for: a **release witness**, so "blocked" is witnessed rather than inferred from a timeout. Build all three.
- **T-05-3 upheld** — ADR-0023 was narrowed in its provisional window: the rule's unit moved from *statement* to *transaction*, and "into the constraints' scope" is now disambiguated from "out of".
- **T-05-4 upheld and ruled before step 3**, exactly as you demanded. This is now **AC-5**: `FST_ERR_CTP_EMPTY_JSON_BODY` and `FST_ERR_CTP_INVALID_JSON_BODY` both render `400 /problems/malformed-request`. The implementer measured the same defect independently and found it also fires on the **existing booking route**, live today. AC-5 is the only AC touching an already-merged route, and the design names its `server.ts` line as a must-exercise exception under the light gate.
- **T-05-5 upheld on both halves.** "Still honestly red" is withdrawn. The `src/` premises in D3 are now implementer-verifiable with you excused — you were right that agreeing to them would have been deference wearing verification's clothes.
- **T-05-6 upheld**, and your `to_jsonb(appointment)` form was taken over the implementer's narrower one.

**What I will hold you to, and will verify from the CI artifact rather than your report:**

1. **Every failure an assertion, not a load error**, and **name any case green at the red.** You have flagged a green-at-red case unprompted in each of the last two slices, including a vacuous one nobody had asked about. Do it again — and note that AC-2 is the live candidate here, since you argued yourself that it has never failed for its own reason.
2. **AC-1 must fail for the allocator reason, not merely because the route 404s.** Everything in this slice fails at the arrange step until the route exists; that is cheap and proves little. Say what AC-1's red would look like against a build where the route exists and the allocator *does* independently exclude a cancelled row's resource — the mutant §1 now names — and whether your test distinguishes that from the passing build.
3. **The concurrency file's three steps must discriminate ADR-0023's Option A.** For the discrimination claim, name the mutant and run it: cancel-takes-the-locks must fail your file. If it does not, the file is measuring ADR-0018 again, which is the objection you raised.
4. **AC-5 is a regression test on merged code.** It should be red now and it must not be green for the wrong reason — check it fails on the CTP code path rather than on routing.

**Constraints.** `tests/unit/` is not yours. Do not read or edit `src/`. Exactly one red commit, `test(05): … (red)`, observed red in CI, ~150 lines per commit. If a docs guard is stale at HEAD, fix it in a separate commit as you did at slice 04 so the red commit stays tests-only — and note that `docs:check` and `defects:check` are now in the local `test:tools` chain, so you can catch that before pushing.

**Report** the standard JSON plus: C1 verified from the artifact, every green-at-red case named, the mutant results for points 2–4, and anything you had to invent that step 2 did not settle. Your step-2 list of six such items was the most useful part of that round — the same section again.
