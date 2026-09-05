# Prompt · slice 02 · architect · invocation 10

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Rule R-02-2 and R-02-3
- Sent: 2026-09-05T21:52:09.346Z

---

Slice 02, **step 5 adjudication**. You are the architect, on `slice/02-book-and-read-an-appointment` at `a6c558b` plus uncommitted orchestrator fixes. The reviewer returned **one MAJOR and three MINOR**. Two are mine and are already resolved; **two are yours to rule**.

Its report is worth reading in full — it re-ran Stryker independently and reproduced 747/11/32 and 95.95% with a **byte-identical survivor set**, ran the DB suite and depcruise locally, and **re-measured ADR-0018's three cells itself** on `postgres:16-alpine` rather than accepting them:

```
locks ON,  constraints ON   ->  1 row,  19x 23P01, 0 deadlocks
locks OFF, constraints ON   ->  1 row,  19x 23P01
locks ON,  constraints OFF  ->  20 overlapping rows
```

Its verdict on your ruling: **"the ADR's numbers are honest"**, and §4's structural defences hold under ADR-0018 — it checked the brand's single minting site, the `appointment-table-access` scan matching `appointmentRepository.ts` exactly, and worked the pruning through six candidate configurations finding no false refusal.

## Already handled, so you do not re-rule them

- **R-02-1 (MAJOR)** — mine. `slice:check` reported the arc42 declaration satisfied over a §10 hand edit it never opened, because `dd9bd44` is scoped `docs(arc42)` and the check selected only `(02)`-scoped commits. Now gate-relative: on a branch, every commit is the slice's work whatever its subject says; scope remains the fallback once merged. It immediately caught the §10 edit, so slice 02 now declares `§10.2`. The test that encoded the false assumption is rewritten and the mutant fails it.
- **R-02-4 (MINOR)** — mine. **I-02-7 was never logged as ruled**, though you ruled it at step 2 as T-02-3's twin. Logged retrospectively. Second instance of O-29 in one slice.

## Yours to rule

**R-02-2 · MINOR · `tests/integration/exclusion-constraint-adjudicates.test.ts`.** Your design §4.5 says the lock-drop control *"belongs beside §4.4's in `tests/integration/exclusion-constraint-adjudicates.test.ts` … one added case in an existing file."* It was never added — that file's `race()` issues raw `INSERT`s with no advisory lock, so the suite covers cells (b) and (c) and **not** (a), the one that proves the lock *prevents nothing*. The reviewer ran cell (a) itself and it holds, and it graded this MINOR because (b)+(c) already carry the §2.1 claim between them.

The question I would put to you: ADR-0018's Consequences say ADR-0016's argument is **weaker** after this ruling. If the control that shows the lock is not load-bearing lives only in an ADR's prose and not in the suite, is that acceptable at this slice's gate, or is it the exact thing this project keeps catching — a mechanism stated and never run? You ruled the remedy; you are the right person to say whether its absence is a defect or a deferral. If it should be built, the file is the **test-engineer's**.

**R-02-3 · MINOR · `src/http/routes/appointments.ts:203`.** The GET route's whole `response` map survives as an `ObjectLiteral "{}"` mutant while the POST route's sibling at `126:46` is killed — delete the GET response map and no test notices. Behaviour is identical today, so it is not a defect. But **slice 05 renders `cancelled` at that URL**, and the design's argument for the union-of-literals is precisely that the response schema enforces. Rule whether that is a deferral with a named owner or something this slice closes.

## Two things the reviewer corrected that you should see

- **The implementer misnamed which `openingHours.ts:256` mutant survived.** It said "this is the ordering arm"; the reviewer measured that the survivor is at column 32, `closesSeconds === null → false`, and survives because that arm is **logically implied** by `!(opensSeconds < closesSeconds)`. Right conclusion, wrong reason — and the reviewer's point is that *"no test covers it"* and *"the code is redundant"* call for opposite remedies. Judge whether anything follows.
- **AC-6, refined:** `additionalProperties: false` is not load-bearing at runtime either, because Fastify's `removeAdditional: true` strips rather than rejects — which is why the AC-6 test asserts `201`, not `400`. It is load-bearing only for ADR-0005's emitted document. **The design's sentence claims a little more than holds.** That is your text.

## Constraints

`docs/slices/02-design.md`, `docs/adr/`, arc42 within the slice's declaration — which now includes **§10.2**. **Not yours:** `tests/`, `src/`, the slice file, `tools/`, `docs/team-log/`.

The human is asleep and has delegated the gate to me against a bar that includes **no open MAJOR or BLOCKING and every reviewer finding ruled**. So these two rulings are what stands between this slice and its merge — rule them on the merits, not to unblock me. If either should hold the slice, say so.

Verify with `npm run lint:arch`, `npm run test:tools`, `npm run docs:budget`. Trailers as before. Report each ruling with its outcome letter, what you changed, and whether anything here should hold the gate.
