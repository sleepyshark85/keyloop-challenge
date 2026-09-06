# Prompt · slice 05 · reviewer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 05 step 5 REVIEW
- Sent: 2026-09-06T10:12:16.531Z

---

Slice 05 step 5 — REVIEW. Branch `slice/05-cancellation`, PR **#14**, base `main`. Read the PR and `docs/slices/05-design.md` (amended at `2901fb7`) plus **ADR-0023** (narrowed in its provisional window) before the diff.

CI **34025870705** on `7393fc7`: all three jobs success, 565 tests / 0 failed against the red's 540/10. Collect it yourself; do not take my word.

**Mutation: 90.73 on changed files** (threshold 0.75), repo-wide 919 killed of 960. Per file: `cancelAppointment.ts` 100.00, `server.ts` 100.00, `appointmentRepository.ts` 100.00, **`routes/appointments.ts` 83.04 with 19 survivors**.

**I split those 19 before handing them to you, because the raw number misleads.** The new route occupies lines 235–281. **Three survivors are in this slice's diff** — `275` ×2 and `277`, the unreachable `default:` arm of the new switch. **Sixteen predate it**, on the two merged routes: 74, 75, 77, 78, 86 ×2, 113 ×2, 197 ×2, 199, 210, 228 ×2, 230, 299. Verify my split; if it is wrong, say so.

The implementer **predicted the three**, and predicted its file's own history correctly: *"the two merged routes carry the identical arm, so if slice 02's or 04's runs left survivors there, these are the same shape and the same non-answer."* They did. **Your judgement is wanted on the sixteen** — whether a file at 83.04 carrying pre-existing survivors through three slices is a debt this slice should be made to pay, or a §11 row. It also predicted two further survivors and killed them, one of which it **measured by hand**: emptying the route's `response` schema left the whole suite green, a silent survivor it staged, ran, then fixed.

**Four things to test rather than accept:**

1. **`freeResources` does not exist** (I-05-5, verified by me: it is in docs and prompts only). The design, and three test-file headers, say AC-1 uniquely guards `freeResources`'s overlap predicate as a TypeScript mutant. `candidateRepository`'s docblock puts that filter after slice 08. So AC-1's *stated* purpose is not what AC-1 currently does. Decide what AC-1 does prove today, whether that is worth its place, and whether the headers must be corrected before merge or at step 7. **Do not take the implementer's framing** — it is the party whose code the claim is about.
2. **I-05-6: `application/xml` on `POST /appointments` still returns `500 /problems/internal`** after AC-5, because 415 has no §8.6 row and "no row" routes to `500 | Anything else`. The implementer deliberately did not widen the predicate — a taxonomy change is the architect's — and added a unit test asserting a `statusCode: 400` error is *still* a 500, so nobody can widen it silently. Judge whether that is the right restraint or an under-fix shipped with a comment, and whether §8.6's own totality claim can survive merge in its current form.
3. **T-05-7 is the general defect and it is open.** §8.6's totality sweep (AC-12) is green today over a build with a known taxonomy hole, because the sweep visits only inputs an author enumerated. Three concrete instances now. Say whether it blocks, and if not, what would make it block.
4. **ADR-0023's exemption.** The cancel path takes no advisory locks. `cancellation-takes-no-lock.test.ts` is the evidence — three steps: a held-lock probe, a booking control, a release witness. Verify it actually discriminates ADR-0023's rejected Option A, and check F-05-1's residue: two write functions in one repository file, one locking and one not, with **`ResourceLock` ruled as the remedy but deferred to slice 06 under ADR-0019**. Is the deferral sound, or is the exempt function shipping with only a docblock between it and F-02-9's second recurrence?

**Also check, as always:** §5 ownership both directions (I found both clean — verify independently); §7 commit discipline, including that **every** commit typechecks, not just HEAD — the implementer reports the slice-04 `tsc`/vitest gap recurred once and was caught; and it self-reported `9600d2b` at 171 lines as over the ~150 guidance.

Under the standing delegation the architect rules any DCR mid-slice — raise it, do not route it to the human. You may block; you may not change the design or edit tests or `src/`. A review with no findings reads the way §6.3 reads an adjudication that never disagreed — and equally, do not manufacture findings. Two of your slice-04 findings were withdrawals, and those counted.

Report the standard JSON plus: your verdict on my 3-versus-16 split, on AC-1's real value, and — separately — anything none of this asked about.
