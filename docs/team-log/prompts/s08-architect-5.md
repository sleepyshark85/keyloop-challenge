# Prompt · slice 08 · architect · invocation 5

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Rule O-62 section 10 shortfall
- Sent: 2026-09-07T08:40:49.402Z

---

# Slice 08 · architect · O-62 — the measured score is 71.43, not the 76.19 you ruled

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/08-availability-query`, PR #17. Pull first. **One round (§6): rule, do not re-open.**

## What the run says

Stryker ran full (23m46s), aggregate **93.32** against a break threshold of 74. Both remediations you ruled are in and CI is green on `aaad786`. But `src/http/routes/availability.ts` reports:

**49 mutants — 30 killed, 12 survived, 7 ignored → 30/42 = 71.43%.** Under §10's 0.75.

You ruled 32/42 = 76.19% on the assumption of **ten** survivors. There are twelve.

## The two extra are named, and they are an arm you already disabled

Line **159** — the `default: {` arm of the exhaustive switch — generates two mutants:
- `ConditionalExpression` → `"default:"`
- `BlockStatement` → `"{}"`

The `// Stryker disable next-line all` directive at line **161** covers line **164**'s `throw`: its `CallExpression` and `StringLiteral` are both in the Ignored list, because `next-line` counts from the end of the comment block. **The directive protects the throw and not the arm that contains it.** Both extra mutants are unkillable for the identical reason already accepted for 164 — a `never` arm is unreachable by construction.

The other ten survivors are exactly the ones you named and left in the denominator on purpose: `StringLiteral` → `""` at lines 48, 49, 50, 68, 69, 70, 96, 97, 98, 99 — the `description` strings. Seven wait on slice 09's OpenAPI document; three are killed outside-in but invisible to a config that runs only `tests/unit`, which is R-08-3 restated by measurement.

## The arithmetic is the problem, and it is why this is yours

One more directive over the `default` arm gives **30/40 = exactly 75.00** — *at* the threshold, not above it. That is the same knife-edge R-05-7 recorded for `problem.ts`, reached by moving a denominator twice in one slice. §10 says "above threshold"; whether exactly 0.75 clears it is a reading you need to state rather than assume.

Three options I can see, and I am deliberately not choosing:

1. **A third directive** over line 159's arm, under the same criterion you already wrote. Consistent — the arm is genuinely unreachable — but lands on 75.00 exactly.
2. **Widen the mutation config's test set** so the three outside-in kills become visible. This changes what is measured rather than what is excluded, and it is the only option that makes the number *more* true; it costs runtime.
3. **Accept a stated gap** and put the shortfall to the gate, in I-06-5's shape.

Your own criterion from §8 — a directive is permitted only where the `dist/` recipe measures no observable difference at the module's boundary and the only killer restates the literal — should decide (1) on its merits, and you wrote that it must have teeth.

Note the honest tension you may want to name: option 1 makes the number pass by shrinking what is counted, in a slice where that has already been done once. I am not saying it is wrong — the arm really is unreachable — but the gate should be able to see the reasoning rather than the result.

## Boundaries

- **You do not edit `src/` or `tests/`** (§5). Specify; the implementer edits.
- **No new ADR.** Record in `docs/slices/08-design.md` / `08-availability-query.md`.
- If your ruling needs an implementer change, say exactly which lines and which mutator names.
- Step 7 as-built is a separate dispatch; do not do it here.

## Post to PR #17

One comment, `**architect · step 5 — O-62 ruling**`. **~150 words, short AND self-contained**: one italic framing line, a gloss inline at every reference (a human does not know what "ObjectLiteral", "the `dist/` recipe" or "§10" mean). Give the numbers — 71.43 measured, 76.19 ruled, what your option lands on. Say plainly whether the slice clears §10 and on what reading. Cut narration; cite and stop.

Return the structured report with the outcome letter for O-62 and the exact remediation, if any.
