# Prompt · slice 08 · implementer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Assert the problem documents
- Sent: 2026-09-07T07:28:13.648Z

---

Slice 08 — **R-08-5 remediation in `tests/unit/`, plus one docblock correction.** Branch `slice/08-availability-query`, PR #17. Pull first.

**Your two unasked choices were both upheld.** The reviewer verified I-08-5 rather than accepting it: against this repo's own Fastify/TypeBox versions, a handler sending `{advisory: false, d: 'BROKEN'}` through a `Type.Literal` response schema **serializes as the literal values** — so `Type.Literal` really would have made AC-5 unfalsifiable, exactly as you argued. And I-08-4 (sequential reads) was ruled fair, with one note: the *stated* reason is the weaker of two available — under quiescence, concurrent reads would be equally deterministic — while **the stronger reason, unstated, is that `Promise.all` over a `pg` pool takes a second connection per request on a booking-screen endpoint.** The choice is right; the argument for it is not the best one.

## What needs doing

**`routes/availability.ts` scores 48.94 on mutation, and the architect rejected my attempt to explain it away.** I argued all 24 survivors were the inert schema-options and description class already ruled on `routes/appointments.ts`. **That inverted the precedent I cited**: I-06-5 removed only what is unkillable *by construction* and left the rest as a stated gap. **Twelve of the twenty-four are observable today and asserted by nothing** — four of them RFC 9457 `title` strings, which `routes/appointments.ts` has also carried unasserted since slice 02. Adjusted score **25/47 = 53.19**, and §10 is **not** satisfied.

The remedy is route unit assertions, ruled **(b)**, home here. In `tests/unit/http/availability.test.ts`:

- **Assert the whole problem document on both error arms** — `type`, `status`, `title`, `detail`, and `reference` — not just the status code and `type`.
- Add **one unknown query parameter** case and **one malformed uuid** case.

**Also correct `busyResources`' docblock.** It claims *"QS-8 is what proves this restatement agrees"*. That overstates: ADR-0032 is careful and says only *"the range expression QS-8 pins"*. The corrected claim is that QS-8 pins the range **and, after mechanic 6, the status predicate** — and that **the dealership predicate is redundant-by-composite-FK rather than pinned by anything**. The reviewer established that last part: `technician` and `service_bay` each carry `dealership_id NOT NULL`, and `appointment`'s composite FKs make `appointment.dealership_id` functionally determined by `technician_id`/`bay_id`, so the constraint's dealership-free predicate and your dealership-scoped one cannot diverge — **unless a technician is ever allowed at two dealerships**, which nothing tests.

**One thing you should know rather than discover:** the test-engineer is concurrently adding a `status` draw to the QS-8 generator (R-08-1), in `tests/property/`. It does not touch `src/`, so there is no conflict — but the `status` conjunct of your `busyResources` predicate becomes genuinely pinned by that change, which is what makes the docblock correction true rather than aspirational.

**Constraints.** §5: `src/` and `tests/unit/` only. §7: every commit green and small. Keep `lint:arch` and `typecheck` clean. **Do not run Stryker** — I re-run it after both changes land.

**Post to PR #17** — short **and** self-contained, per the generated block your definition now carries.

**Report** the standard JSON, how many of the twelve observable survivors your assertions now reach, and anything the remediation turned up.
