# Prompt · slice 10 · test-engineer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 10 remediation — test-engineer
- Sent: 2026-09-08T09:11:16.876Z

---

# Slice 10 · step 5 remediation — four assertions, and two of them are the slice's own defect

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/10-openapi-and-curl-harness`, PR #21. Pull first — the adjudication is at `a3e7d5f`, all eight findings upheld, **loopbacks stay 0 of 2**, nothing needs a design change.

The reviewer blocked and the architect agreed with all of it, including **withdrawing its own ruling** on AC-6. Its words: *"I ruled it unassertable and the half was then not written at all."* Two of the four items below are this slice's own defect — a green test that cannot fail on the thing it guards — which is the pattern slice 10 was reopened to correct.

## 1. `R-10-3` — `/health` by name, and equality that is actually equality (BLOCKING)

The failing criterion is **named**: AC-1 says *"each operation's set is asserted by equality"*, and it holds over **five of the document's six operations**. Equality over a subset the test chose is not equality. The §1 ruling said `/health` is *"excluded BY NAME with an asserted-empty type set, never by silent omission"* — the omission is what shipped.

Two changes, and the second is what closes the class:
- A sixth key, `GET /health` → `['200 application/json', '503 application/json']`.
- **`EXPECTED_PAIRS`' key set asserted equal to the `(method, path)` set in `doc.paths`** — so a future operation cannot be added and silently skipped.

## 2. `R-10-2` — the M2 probe must be able to fail (a)

You built a probe of the emitted document. `@fastify/swagger` rewrites `const` → `enum`, and `fast-json-stringify` **passes an `enum` through unvalidated** — neither throwing nor substituting — so a collapsed cell's wrong value returns as itself and `not.toBe(correctType)` holds. All seven cells stay green while the runtime schema substitutes.

The architect re-measured and confirmed it, and took the fault: *"M2 said the property must be shown, never at which level."* Its ruling:
- The **behavioural** property stays asserted at the **runtime schema** — `tests/unit/http/problem.test.ts` already fails on the collapse. That is the real guard.
- At **document** level the emitter has erased the distinction, so the only faithful assertion is the artifact's **shape**: each single-type cell's `type` is a **one-member `anyOf`**, never a bare `enum` or `const`.
- **It is reversing step 1's "behaviour not shape" for that level only**, because there the mechanism is the sole observable. **Delete the header's behaviour-not-shape claim — it is now false of the block beneath it.**

Falsification to run before you commit: switch the single-member branch back to `Type.Union`, re-emit, and confirm the suite goes red.

## 3. `R-10-4` — derive the cell list, do not fix it

Eight cells carry a one-member `anyOf`; your hand list has seven and its header says seven. The remedy is **not** the missing row: **derive `SINGLE_TYPE_CELLS` from `EXPECTED_PAIRS`** — the statuses with exactly one `/problems/*` entry. One transcription of §8.6, not two.

## 4. `R-10-5` — the negative control moves with the guard

The reviewer proposed a bare `REQUEST_COUNT >= 2` guard. The architect **refused it as proposed**: it collides with AC-5's negative control, which fires one request at an already-taken slot and would then exit non-zero **because of the guard rather than the contention** — a control passing for the wrong reason, which is this slice's whole subject. So both change together. The implementer adds the `>= 2` guard; **you change the control to fire two racers at an already-taken slot**, expecting 0×`201`, 2×`409`, non-zero exit.

## 5. `R-10-1`'s assertion half (BLOCKING)

The scribe has written the README section and verified it by running the commands twice from a fresh seed. Your half is the assertion, and the architect **strengthened it** from the reviewer's grep: **set equality** — every `harness:*` key in `package.json` appears in `README.md`, and the README names the `eval "$(npm run --silent harness:seed)"` line and both scripts. That catches a *new* undocumented script, which a grep would not, for the same three lines.

## Discipline

- Your directories only. `harness/*.sh` and `harness/seed.mjs` are the implementer's and `harness/` is **guarded** — a write there will be denied.
- **No new red commit**: these are corrections to assertions inside the slice, and no `(c)` was ruled. Commit `test(10):`, small, **explicit pathspecs**.
- `npm run test:tools` green; the full `nodb`/`db`/`perf` suites green before you push.
- Post one PR comment on #21, `**test-engineer · step 5 — REMEDIATION**`, ~150 words, short and self-contained.

## Return

The structured report, the falsification result for item 2, and anything you think the architect got wrong — it reversed one of its own step-1 instructions here and that is worth checking rather than accepting.
