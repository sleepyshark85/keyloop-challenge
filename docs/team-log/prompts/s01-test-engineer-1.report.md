# Report · slice 01 · test-engineer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 01 step 2 agree — test-engineer
- Returned: 2026-09-04T17:06:21.139Z
- Duration: 366s

---

# Verdicts — Slice 01 design, step 2 (Agree)

I read `docs/slices/01-design.md`, `docs/slices/01-domain-policy-core.md`, ADR-0013 (proposed), arc42 §10 (QS-9, QS-12) and §8.3, `CLAUDE.md` §§2/5/6, the phase-4 retro's "finding that is not a criterion" section, and the current `.dependency-cruiser.js`, `vitest.config.ts`, `tsconfig*.json`, `package.json`, and `tests/architecture/layering.test.ts` (none of it under `src/`). Verdicts below, each argued, per §6.

## 1. DA-1 / AC-6 — **DISAGREE with the finding, DCR to the human**

Judging the finding and the remedy separately, as §6 requires.

**The remedy** (permit intra-domain `import type`) is architecturally sound and I'd choose it myself: it's the only option that keeps `DurationMinutes` a real brand across `duration.ts`/`interval.ts` (A-1's escape hatch) without duplicating structural types — the exact confusion AC-5 exists to prevent.

**The finding — "AC-5 and AC-6 are otherwise jointly unsatisfiable" — is overstated, and I don't think it's true.** A literal AC-6 (zero imports, including intra-domain, including type-only) is satisfiable without duplication: push the composition up to the caller. `interval.ts`'s `appointmentInterval` could take a raw millisecond count rather than a `DurationMinutes`-typed parameter; the caller (outside `src/domain`, so outside the rule entirely) calls `durationMillis()` then `appointmentInterval()`. No cross-file import inside `src/domain`, no duplicated type, AC-5's "arithmetic only in `duration.ts`" still holds. That's worse design — it's exactly the brand-safety loss A-1 argues against — but it's a design trade-off, not a logical impossibility, and the difference matters because it changes who gets to make the call.

It matters more because arc42 §5.2, as it stands *today*, already says the pure core "imports nothing at all — no other module, no npm package, no `node:` builtin" (quoted in the design's own §12.1 proposed edit). That's the literal reading, stated before this slice, by the architect, as architecture — the thing `CLAUDE.md` §4 makes the source of truth. The design proposes to *correct* that wording at step 7 to match the operational reading it needs now. Correcting arc42's own prior, literal statement of a purity guarantee, on the strength of an argument I can show isn't airtight, is a bigger thing than F-01-1's transposition fix (which corrected a wording bug against a ruling that had already happened). This one hasn't happened yet.

So: I read AC-6 as genuinely ambiguous between the two texts (arc42 §5.2 as it stands vs. the operational `domain-is-pure` rule AC-6 names), not as a case where the literal reading is impossible. Per the design's own flag ("if the test-engineer or implementer reads AC-6 the other way, that is a DCR"), and per `CLAUDE.md` §11 ("do not silently invent a resolution"), I'm raising it: **the human should rule between (a) the operational reading, with arc42 §5.2 corrected now, per the design, or (b) a literal reading, accepting that composition of `DurationMinutes`/`Instant` moves one layer up out of `src/domain` until a later slice's architecture makes that awkward.** I'd vote (a) if asked, but it isn't my vote to cast, and "jointly unsatisfiable" isn't the reason it's the right call.

## 2. ADR-0013 / the `dist/` seam — **AGREE**, with a self-owned safeguard

I own this call. The rule's stated purpose is two things: the test-engineer never reads `src/`, and outside-in tests reach the system the way a client does. For a pure function with no HTTP or SQL surface, the second clause has no referent — there is no "boundary" a client crosses to call a function, only a call. Given that, `dist/` preserves the half of the rule that still applies (I write against the design's signature blocks, never open `src/`, and — my own added discipline — never open `dist/` output either, even though nothing stops me mechanically) while making QS-9 executable in the slice that builds its subject rather than several slices later. Option E (defer QS-9) trades away executable evidence for the single riskiest piece of logic in this slice — a DST rule — for an unspecified number of slices. That's a worse trade than the recorded costs of Option C (`any`-typed load, dependency-cruiser blind spot).

One thing I will add, since "only review protects" against the dependency-cruiser blind spot is a real, named gap in the ADR's own consequences section: I'll write a small self-check into the red commit — a scan of `tests/property/**` and `tests/architecture/**` for any computed dynamic-import specifier whose string parts resolve under `src/` rather than `dist/`. That converts "only review" into "review plus a mechanism I own," cheaply, and it's mine to add without needing a design change.

## 3. §5.3's coverage assertions — **DISAGREE with the `> 0` threshold specifically, AGREE with accumulate-and-assert overall**

The mechanism is sound and I'll build on it. But `> 0` is too weak to discriminate what it's meant to discriminate. The retro's own number makes this concrete: uniform sampling hits a transition window at ≈0.00023/draw. Over 1000 draws, the probability of **at least one** hit — i.e., of a bare `> 0` coverage assertion passing — is `1 - (1-0.00023)^1000 ≈ 29%`. That means a coverage check written as `> 0` would itself pass roughly **three times in ten** under the exact naive/uniform generator this section argues against, if the stratified generator were silently broken (wrong anchor constant, zero-weight stratum) and only luck from the breadth stratum (S3) carried a stray sample into the window. A `> 0` gate doesn't reliably tell "the stratification worked" apart from "S3 got lucky" — which is precisely the "reports success over work it never did" shape the retro names.

My remedy: replace the four transition-proximity counters' `> 0` floor with a **minimum count scaled to the intended stratum weight and run count** (e.g., `count ≥ runs × S1_weight × 0.5`, computed and commented so the arithmetic is auditable, not a magic number). The `within`/`closed-day`/`outside-window`/`spans-local-days` kind-coverage checks can keep `> 0` — those aren't rare events under any reasonable generator, so the same flake math doesn't apply there.

## 4. §8.3's "structurally an assertion failure" — **DISAGREE that this is fully established; needs measurement, not just reasoning**

Reasons 1 and 3 (nothing statically imported from `src/`; the load is inside a `try` in a test body) are measured and sound. Reason 2 is where I think the claim outruns its evidence. `vitest.config.ts`'s own comment states: *"Under a single project a failing container start aborts the whole run"* — and `npm test` (which is what `red-proof` reads a combined `test-results.json` from) invokes **both** projects in one `vitest run`. Moving `tests/property/opening-hours-dst.test.ts` into the `nodb` project's `include` glob stops *that file's own* `globalSetup` from running — but it doesn't, by itself, establish that a Testcontainers failure in the **`db` project**, in the *same* `npm test` invocation, can't still abort the whole process before the `nodb` project's results are written to the shared results file. If it can, the DST test's red would arrive as a process crash / missing results entry, not an `AssertionError` — exactly the failure mode C1 exists to rule out, and exactly the shape of thing the retro calls Tier 1: "explaining why something works by naming a mechanism's capability instead of its configuration or discriminating case. Needs something run."

This is the same category of unknown DA-3 was, and it was resolved by measuring, not by argument, before the design was accepted. I'd want the same treatment here: run `npm test` with Docker deliberately unavailable and confirm the `nodb` project's tests (including this one) still land correctly in `test-results.json` as passes/failures rather than the whole invocation dying. I'll do this measurement myself before the red commit rather than block agreement on it now, but I'm flagging it rather than accepting §8.3's reason 2 as already discharged — if it fails, that's a design question (does `red-proof`/CI need to run `test:nodb` and the `db` project separately and merge results?) that would need to come back to the architect.

## 5. §7's ambiguity-containment scan — **AGREE it's discriminating, with one concrete regex fix**

The corpus guard (named files, not a count) and the planted-violation-plus-negative-control design map directly onto the two 00a lessons named in the retro ("a guard counting modules overall" / "for a discrimination claim, name the mutant"), and the "exactly one, not at most one" rule is the right anti-vacuity mechanism — it turns the red commit's own failure into the real assertion ("found 0"), which is the cheapest possible arrangement, as the design says.

One concrete gap: the `duration-arithmetic` marker as specified — "the literal `60_000` or `60000`" — needs a word boundary, or it will misfire the moment any unrelated code contains that digit string as a *substring*. `600000` (a very ordinary 10-minute timeout in milliseconds) contains `60000`; a naive `includes('60000')` or an unanchored regex would flag a Fastify or pg-pool timeout config in `src/platform` or `src/http` as a false AC-5 violation the day such a value appears. This is a real, specific, findable failure mode, not a hypothetical — I'll implement the marker as `\b60_000\b|\b60000\b` (and check the same for any other bare-number markers) so the scanner doesn't self-sabotage on ordinary numeric literals elsewhere. This is mine to fix when I write the file, not a design objection.

## 6. §5.1's oracle independence — **AGREE**

The offset-table oracle (two constants, both endpoints of the year, both measured) is a genuinely different mechanism from the implementation's `Intl.DateTimeFormat`-based rendering, and P1's criterion is phrased as a declarative condition (same local date ∧ weekly entry exists ∧ within window) rather than a step-by-step mirror of §4.2's branching order — which is the right shape, since a procedural mirror would risk sharing an ordering bug with the implementation it's meant to check. My one implementation note (not an objection): the oracle's own weekday/date extraction from `utc + offset` should be plain `Date.prototype.getUTC*` arithmetic, with no `Intl` call anywhere in the oracle, and I'll say so in a comment so a reviewer can see the independence rather than infer it.

---

### Summary

Two items need someone else's ruling before or alongside step 3: **AC-6's reading** (the human — this is a DCR, not a clarification I can silently pick a side on) and **the multi-project `globalSetup`-failure isolation claim** (needs to be measured, the way DA-3 was, before §8.3's "no path to a crash" is fully earned — I'll run it myself before the red commit and escalate only if it fails). Everything else — the `dist/` seam, the coverage-assertion mechanism, the scanner's markers, and the oracle's independence — I agree with the design's approach and will apply my own refinements (minimum-count coverage thresholds instead of `> 0`, word-boundary regexes on the numeric marker, a self-owned scan against a regression to importing `src/`) when I write the red commit, none of which require the architect to change anything.

```json
{
  "role": "test-engineer",
  "outcome": "objected",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0},
  "quality_scenarios_covered": [],
  "red_commit": null,
  "ci_failure_confirmed": false,
  "objections": [
    "AC-6's reading (DA-1): the design's 'AC-5 and AC-6 are jointly unsatisfiable' claim is overstated — a literal AC-6 is satisfiable by moving DurationMinutes/Instant composition up to the caller, at a real but non-fatal design cost. Given arc42 §5.2's current literal wording ('no other module'), this is a genuine ambiguity, not a settled reading — raising as a DCR for the human rather than accepting the proposed step-7 arc42 correction as a foregone conclusion.",
    "§8.3 reason 2 (globalSetup isolation): moving the DST property test into the nodb project's include glob doesn't by itself establish that a Testcontainers failure in the db project, within the same `npm test` invocation red-proof reads results from, can't abort the whole run per vitest.config.ts's own documented behavior ('a failing container start aborts the whole run'). Needs to be measured (Docker unavailable, confirm nodb results still land in test-results.json) before C1's 'structurally an assertion failure' claim is fully earned — I will measure this myself before the red commit and escalate only if it fails."
  ],
  "dcr": "AC-6 reading: does 'src/domain imports nothing at all' forbid intra-domain type-only imports (literal) or only cross-boundary imports the domain-is-pure rule already checks (operational, per the design)? Both readings are textually defensible; arc42 §5.2's current wording favors the literal reading the design proposes to correct at step 7. Human ruling requested before step 3.",
  "message": "Agree with the dist/ seam, the accumulate-and-assert coverage mechanism, the ambiguity-containment scan's discrimination design, and the DST oracle's independence, each with a self-owned refinement (minimum-count coverage thresholds instead of >0, word-boundary regex on the numeric marker, a scan guarding against regression to importing src/ under a computed specifier) that I'll apply when writing the red commit rather than asking the architect to change. Two things I can't silently resolve myself: AC-6's reading is a genuine ambiguity against arc42's current literal wording and goes to the human as a DCR, and the claim that a db-project globalSetup failure can't crash the nodb project's results within one npm test invocation is an unmeasured mechanical claim I'll verify before the red commit."
}
```
