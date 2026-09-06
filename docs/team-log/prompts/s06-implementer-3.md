# Prompt · slice 06 · implementer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 06 step 5 remediation
- Sent: 2026-09-06T15:52:46.141Z

---

Slice 06 — **step 5 remediation, one pass.** Branch `slice/06-reschedule-atomic-move`, PR #15. Pull first. The reviewer returned **changes-requested**: one BLOCKING, three MAJOR, two MINOR. The architect ruled the same root cause independently. This is the single `src/` + `tests/unit/` pass that closes it — do it once, not twice.

**First, three things you should know, because two of them are in your favour.**

- **I-06-3 is DISCHARGED.** The reviewer replayed your pre-loss edits onto `3589a77` — 16 Edits in order, three `sed -i` patches, the Stryker comment script — and diffed the result against `d046670`. **All six files came back byte-for-byte identical**, including the three `sed`-patched `buildServer` call sites that appear in no edit record, and both *deletions*, which a rebuild that only re-applies additions would have lost. Its words: *"the merged code is complete and coherent. Nothing is missing. I would sign this."* You were right to ask and right that you could not discharge it yourself.
- **AC-2 passed on the hard reading.** The reviewer drove `rescheduleAppointmentById` from `dist/` through a capturing driver and counted the statements: **one**. No `DELETE`, no `INSERT`, no CTE, no sub-select, no pre-read deciding legality.
- **Your zero-rows-uniformly concern was verified and holds**, for a reason stronger than you gave: there is **no `DELETE` anywhere in `src/`**, and the only write to `status` is `cancelAppointmentById`. Rows are never removed, so the existence the read established cannot be undone.

---

## 1. BLOCKING — the four Stryker `restore all` directives are inert (R-06-A / R-05-9)

**Your comments were placed exactly as the design specified. The specified mechanism does not work.** `@stryker-mutator/instrumenter`'s `DirectiveBookkeeper.processStrykerDirectives` reads **`leadingComments` only**. A `// Stryker restore all` written as a block's last line is a *trailing* comment of the `throw` — there is no following node in the block for it to lead — so no restore is ever registered and **the first `disable all` at line 225 runs to end of file.**

Measured: of 163 mutants in `routes/appointments.ts`, **93 are Ignored and every one is at line ≥ 231; zero mutants at or after 231 are scored.** That includes the entire PATCH outcome switch and the `setNotFoundHandler` / `route-not-found` region — **this slice's own new code**. R-05-9's ruling forbade exactly this by name.

**Remedy, ruled by the architect and narrower than what you wrote:** delete all four pairs and replace each with a **single** `// Stryker disable next-line all : <reason>` placed directly above the `throw`. `disable next-line` binds to the annotated node's own start line, so it suppresses exactly those 8 mutants and **cannot over-apply**; there is no restore to be lost. This also falsifies the slice file's claim that `disable next-line` cannot cover an arm — each arm's two mutants sit on **one** line.

Note for the record: **nothing you did placed a disable on a schema-options or `description` mutant.** Those live above the first disable. The over-reach ran the other way.

## 2. MAJOR — the technician side of pruning is untested, and it hides a wrong answer (R-06-B)

`rescheduleAppointment.ts:232`. Nothing distinguishes `outcome.resource === 'bay' ? bayId : technicianId` from the constant `bayId` — both loop tests name `bay` as the scarce resource, and there is no technician-scarce mirror. `bookAppointment.test.ts:236,254,384,401` has both.

With the ternary replaced by `bayId`, a `no_technician_overlap` prunes the technician list for a value **not in it**, the list never shrinks, `nextCandidate` returns the same contended technician every attempt, and a move that should re-allocate is refused `409 no-capacity` / `capped` after 16 attempts **while a free technician exists** — QS-3's failure mode, on the path the loop exists to prevent. The integration control can kill it only when the seeded shuffle happens to redraw the contended technician first, which is a property of `BOOKING_SEED`, not of the assertion. **Add the technician-scarce unit test.**

## 3. MAJOR — 27 of the 36 survivors are killable, and 9 are not (R-06-C)

The reviewer classified all 36. **Nine are inert by shape** — the `case 'derived': break` pair, the loop-bound `<=`, and six inside the unreachable post-loop `throw` — and `bookAppointment.ts` carries all four of those shapes as its **only** survivors at 96.80, which is the independent evidence they are shape and not debt. Excluding them the file is **84/111 = 0.7568**, which clears 0.75. Do **not** try to kill those nine.

Kill these 27. Each already exists in `bookAppointment.test.ts` in mirror form:

- **Group A, 14 mutants** — the `dealership === null` and `serviceType === null` arms (`L111,116,117,119` and `L123,125,126,128`). No test in any suite drives them; `bookAppointment.test.ts:691,700` drives and kills both mirrors. The architect ruled **I-06-4** on this: these arms are correct and stay — they apply design §3's already-ruled `23503` principle one step earlier — and the remedy is *these two unit tests*, not an ADR and not a §11 line. It measured the effect: **70.00 → 81.67**, above threshold on its own.
- **Group B, 9 mutants** — `L96,97` (the `DEADLOCK_EVENT` / `REFERENCE_DATA_EVENT` names), `L140,141`, `L146–151`, `L252–259`, `L268`. Every one of these arms **is** driven; the tests assert only the returned outcome, never the log record. `bookAppointment.test.ts:619,668` kills the identical shapes, and `CONFLICT_EVENT`/`REFUSED_EVENT` are already killed here by the one test that asserts a full record — which proves the shape is killable.
- **Group D, 2 mutants** — `L224` `if (initialOrder === null)` and its `'exhausted'` literal. No test has attempt 1 conflict with an empty candidate list.
- **Group C, 1 mutant** — `L167` `const move: Move = {...}` → `{}`. Nothing asserts the interval the domain *derived* is the interval the statement *writes*; the happy-path test reads its response off the scripted row. Covered outside-in by AC-1, but a unit-level gap.
- **R-06-E** is inside group B and is called out because its blast radius is a later slice: rename `'booking.deadlock'` in this file only and every test in the repo stays green while **slice 09's observability work silently loses every deadlock on the reschedule path**.

## 4. Not yours — do not touch

**R-06-D**: `__brand` is a public string-literal property, so `lockResources` is the only minting site *by convention*, not by the type system — writing the brand by hand compiles clean. The reviewer verified with `tsc --strict` that your ADR-0026 claim **holds** where it matters (omitting the lock is `TS2554`, a bare pair is `TS2345`); only the "ONLY minting site" sentence overstates it. That is a §11 residue line for the architect, **not a code change**, and `src/domain/candidates.ts` shares the shape.

---

## Then re-run Stryker, and this time report the numbers

`npx stryker run` takes ~18 minutes. **Run it once, in the background, and wait for it to finish before reporting** — you ended three previous invocations in a polling loop without producing a report, so start it, then stop calling tools until it is done. Read `reports/mutation/mutation.json` and give me the real per-file scores for `rescheduleAppointment.ts` and `routes/appointments.ts`.

**§10 is now ruled to mean *per changed file*** — the architect and the reviewer read it the same way independently — so `rescheduleAppointment.ts` must clear 0.75 on its own. It is at 0.70; group A alone should take it to ~0.82.

**Constraints.** §5: `src/` and `tests/unit/` only — do not touch any test-engineer directory. §7: every commit green, small, Conventional. Keep `lint:arch` and `typecheck` clean. Do not re-litigate the review; if you think a finding is wrong, raise a DCR **and tell me** rather than dispatching anyone yourself (O-44).

**Report** the standard JSON, the measured per-file mutation scores, which survivor groups you closed and which you deliberately left, and anything the fixes turned up.
