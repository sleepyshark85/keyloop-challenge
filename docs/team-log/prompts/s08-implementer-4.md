# Prompt · slice 08 · implementer · invocation 4

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 08 I-08-6 remediation
- Sent: 2026-09-07T08:03:31.451Z

---

# Slice 08 · implementer · I-08-6 remediation — your measurement stood, one of your six did not

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/08-availability-query`, PR #17. Pull first — the ruling is committed at `6ae06ad`. Read `docs/slices/08-design.md` §8 before you start.

## Accepted as measured, with one disagreement

You hand-mutated all twelve lines before reporting and said 6 of 12, not 12. That was upheld `(d)`. The architect disagrees on exactly one:

> "**`to`'s pattern at `57` is not structural.** The stated mechanism — `removeAdditional`, the fixed-shape literal — does not reach it, and this file already kills `from`'s twin at `tests/unit/http/availability.test.ts:158` and `serviceTypeId`'s at `:187`; the two `400`s differ anyway, `server.ts:127` sending `detail: error.message` where the route sends a fixed string."

Check that claim before you act on it — you own this file and you were the one who measured. If you think `to`'s pattern really is unkillable, say so with the mechanism, and do not write a test you believe cannot fail.

## Three changes

**1. One unit case for `to`'s RFC3339 pattern**, mirroring the shape of `from`'s at `tests/unit/http/availability.test.ts:158`. `tests/unit/` is yours (§5). This is the mutant at line `57`.

**2. Five `Stryker disable next-line` directives at source** in `src/http/routes/availability.ts` — **never `all`**:
- `ObjectLiteral` on lines `59`, `79`, `100`
- `BooleanLiteral` on lines `60`, `80`

`all` would swallow the `description` strings that slice 09's AC-7 kills, which is why the ruling forbids it. Line `143`'s existing `never`-arm directive is the precedent for placement: per-construct, beside what it excludes. Each needs its reason on the line, and the reason must be the ruled criterion, not "unkillable": permitted only where **(i)** the `dist/` recipe measures no observable difference at the module's boundary and **(ii)** the only killer would restate the literal.

Note the ruling's own warning about why (ii) matters — R-08-3 found `appointmentRepository.ts` scoring 100.00 by string-equality assertions against its own SQL while sitting on a real defect. A test that restates the literal buys the score and not the evidence.

**3. One docblock clause** in `src/persistence/appointmentRepository.ts`: *"often enough for the property to see one"* becomes **by construction** — true only once the test-engineer's witness lands, and the same overstatement F-08-4 named. The test-engineer is building that witness in parallel; the clause is correct as of its commit.

Do not touch `tests/property/` — the test-engineer has an uncommitted change there.

## Then

Re-run the `dist/` hand-mutation on line `57` to confirm the new case kills it, commit small and green (`feat(08):`/`test(08):`/`docs(08):` as fits), push, and post **one** PR comment attributed `**implementer · step 5 — I-08-6 remediation**`.

**~150 words, short AND self-contained.** One italic framing line, then inline a gloss at every reference — a human reading #17 does not know what "the `dist/` recipe", "ObjectLiteral" or "§10" mean. State the numbers: 6 of 12 measured, one reclassified, 32 of 42 ≈ 76.19% expected after. Say plainly that five lines are excluded from measurement and why that is not the same as fixed. Cut narration; cite and stop.

Return the structured report, and in it say whether you agreed with the `to` reclassification.
