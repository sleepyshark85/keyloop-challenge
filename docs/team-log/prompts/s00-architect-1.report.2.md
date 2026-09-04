# Report · slice 00 · architect · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 00 design, step 1
- Returned: 2026-09-04T08:35:28.711Z
- Duration: 2644s

---

Reasoning only — no edits, no commits. Five verdicts, each judging the finding and the remedy separately, then the four items to settle.

First, on the round itself: I asked step 2 to find the two things I believed were wrong and could not resolve (§11.4's ambiguities and §11.2's assumptions). It found something better — three false sentences of mine, two of them in the section I wrote *about* not writing false sentences. I agree with all five findings. That is not deference; it is that four of the five carry measurements, and the fifth (I-9) is a two-line documentary comparison I could have made and did not.

---

## T-4 — case 0 never asserts the column the constraints are keyed on

**Finding: AGREE.** Unreservedly, and it is the most serious thing in this round.

The mutant is undetectable by everything I specified except AC-2, and AC-2 catches it only through the behaviour my own **A-2** says is not guaranteed. So the honest statement of my design is: *a `no_bay_overlap` keyed on the wrong column is caught by nothing.* Worse, it is caught by nothing **in a way my §4.2 was structurally unable to see** — that section's "exactly one constraint violable" rule reasons about which constraints a *fixture* can trip, and silently assumes the constraints are keyed as §8.1 says. The isolation discipline presupposed the correctness it was supposed to help establish. That is 00a's rule 1 at one level up from where I applied it, and I did not see it.

**Remedy: AGREE, with two additions and one narrowing of what it buys.**

I accept the version-fragility trade, and not merely because the test-engineer accepts it. The fragility is bounded by two things already in the repository: the image is pinned to `postgres:16`, and `tests/integration/postgres-harness.test.ts` already asserts `server_version` matches `^16\.`. So a formatting change on a major-version bump fails seven assertions loudly, once, in the same commit as the bump — which is a good failure. The alternative I weighed and rejected is reading `pg_constraint.conkey` / `confrelid` / `confkey` and resolving to column names: version-stable, but it needs three different mechanisms and *still* falls back to `pg_get_expr` for the range expression and the partial predicate. Equality on `pg_get_constraintdef` is one mechanism covering all seven. Simplicity wins.

Two additions, both of which the remedy's phrasing leaves open and both of which decide whether it works:

1. **The expected strings are hand-written literals, transcribed from arc42 §8.1 and §8.2 — never captured from the database under test.** A snapshot taken from the running schema asserts that the schema equals itself. This is §6's own rule about fixtures pointed at the architect's remedy.
2. **The failure message must print expected and actual in full.** A `pg_get_constraintdef` equality failure with a truncated diff is unreadable, and an unreadable failure on the one artifact the submission rests on is close to no failure at all.

**The narrowing.** The remedy's claim that equality "closes wrong-target composite FKs that `contype = 'f'` cannot see" is correct, and I want the *limit* recorded alongside it, because the next person will otherwise read case 0 as a whole-schema guarantee. Case 0 by equality proves the seven **named** constraints are exactly right. It proves nothing about what else is in the schema — an extra constraint, a missing `NOT NULL`, a wrong column type. Closing that would mean snapshotting the whole `\d` output, which I reject: it is brittle against every unrelated change and would be edited into uselessness within three slices.

**Amendment.** §4.1 case 0 replaces the substring assertions with equality on the full normalised `pg_get_constraintdef` for all seven constraints, with the two additions above stated as requirements on the test and the limit stated as a limit. §4.2 gains a sentence saying that the one-violable-constraint discipline is sound *only given* case 0, so case 0 is a precondition of the AC cases rather than a companion to them. And a maintenance obligation: **when arc42 §8.1 or §8.2 changes, case 0 changes in the same commit** — it is §8.1 restated in the catalogue's vocabulary, and that is the point of it, not an inconvenience.

---

## T-5 — the isolation discipline is enforced non-uniformly by FK trigger order

**Finding: AGREE.** The structural argument is decisive independent of the measurement: FK triggers fire in a fixed order, so when two are violable one name always wins, and **which one wins is a function of declaration order in `0003_appointment.sql`**. That means the detectability of fixture drift depends on the order I happened to list the constraints in §8.1. That is arbitrary, and a discipline whose enforcement is arbitrary is not a discipline.

**Remedy: AGREE, and it is symmetry rather than an addition** — §4.3 reads the first row back, §4.4 has its negative control, §4.5 has its before/after pair. AC-5, AC-6 and AC-7 were the three that got a prose promise instead. I accept that the design was inconsistent with itself and that the reviewer noticed before I did.

**Two things the remedy needs that its phrasing does not carry:**

1. **Ordering, and it follows from my own M-2.** The exclusion constraints pre-empt the FK triggers. So a positive control run *before* its negative sibling occupies the interval, and the negative insert then fails `23P01` instead of `23503` — the positive control would break the case it exists to validate. **The negative case runs first; the positive control follows, or sits in a disjoint interval.** Left unstated, this is the single most likely way the remedy gets built wrong.
2. **AC-8 is included, and it needs the control most.** CHECK constraints fire before *everything* (M-1), so a drifted AC-8 fixture that also violates a foreign key still reports `23514` / `appointment_interval_ordered` — I measured exactly that case and recorded it as reassuring. It is not reassuring. It means AC-8's reported name is the **least** attributable of the nine, because CHECK precedence masks every other defect the fixture might have. A positive control with a valid interval is the only thing that says the rest of that row was ever bookable.

**Amendment.** §4.6 and §4.7 gain a positive-control sibling per negative case: the same row with the single intended defect repaired, asserted to succeed, run after the negative and with the ordering rule stated with M-2 as its reason. §4.2's rule 3 changes from a prose requirement ("the fixture must be valid in every other respect") into an assertion, because that is what it should have been.

---

## T-6 — §4.4 step 5 is redundant and its stated reason is false

**Finding: AGREE.** The reason I gave — *"a range type is defined by two bounds and testing one of them is half the claim"* — conflates the range expression's two bounds with the test's two rows. Both rows are produced by the *same* expression, and `&&` is symmetric, so `upper(neighbour) = lower(new)` and `upper(new) = lower(neighbour)` are one predicate with the operands swapped. Against the closed-range mutant, both steps reject. I could not construct a mutant step 5 catches alone, including the asymmetric buffer mutants A-4 will eventually produce.

**Remedy: AGREE with keeping the step, but not with "replace the reason" as stated.** A step that catches no unique mutant does not get a *new* justification; it gets an honest one. So my amendment is narrower than "write a better reason":

**Step 5 is demoted from a criterion to part of step 6's coverage assertion, and the replacement text must state the redundancy explicitly** — that step 5 catches no mutant step 4 does not, that it was checked rather than assumed, and that it is retained because step 6 counts three rows and a two-row count is a weaker coverage claim. A measured negative result recorded in the design is worth more than a step quietly deleted; a step kept under a second invented reason is worth less than nothing.

**On the pattern, which is the part worth more than the instance.** F1, this, I-8 below, and the parallelism overstatement in the "also settle" list are four instances of one shape:

> Each explains why something works by naming a mechanism's **capability** instead of its **configuration** or its **discriminating case**.

`depcruise` *can* fail to open a directory — I did not check that `mkdirSync` had created it. `node-pg-migrate`'s `db.query` *does* print a caret — I did not check the logger was wired, with the call site open in front of me. A range type *has* two bounds — I did not check whether a mutant separates them. Vitest *is* parallel — I did not check at what granularity.

The rule that catches all four is cheaper than "measure everything": **for a discrimination claim, name the mutant; for a mechanism claim, name the call site.** What makes this uncomfortable rather than merely instructive is that the method is already in this design and correctly applied — §2's proof that `[)` and `(]` are indistinguishable names the discriminating case and shows there is none. I had the technique, used it on the constraint, and did not turn it on my own test steps. That is not a knowledge gap, it is an attention asymmetry, and it belongs in the record as such. I would add it to 00a's second rule table as the generalisation, rather than as a fifth row.

---

## I-8 — §8.2's mitigation 2 is false; the harness silences the logger

**Finding: AGREE.** `tests/setup/postgres.ts:68` passes `log: () => {}`, which swallows the `logger.error` carrying the filename and the caret. The `DatabaseError` that propagates has `message`, `position` and `file: 'scan.l'` — the PostgreSQL *source* file — and no migration filename anywhere, under a `No test files found` headline. My sentence said the opposite, and it said it with the words *"read from the source"*, which makes it the worst of the three: I read the mechanism in `db.js` and did not read the call site, in a session where I had quoted that call site.

**Remedy: AGREE with the narrow ask, and I am replacing it with something better rather than only correcting it.**

I accept the implementer's agreement that the `try`/`catch` stays rejected, and I decline to change `log: () => {}` in this slice. That deferral needs a reason that survives I-9, so: `tests/setup/postgres.ts` is genuinely test-engineer-owned, editing it genuinely spends 00a's seam promise on the slice whose failure-attribution depends on nothing else moving, and with A-4 now closed the fallback is rarely reached. Unlike I-9's, that reasoning holds.

But "say what the failure actually yields" leaves the implementer with no fallback at all, and there is one available for free: **`npm run db:migrate` invokes the CLI, whose logger is not silenced.** So the corrected mitigation 2 is *"run `npm run db:migrate` against the compose stack — the CLI logs what `globalSetup` swallows"*, not *"read globalSetup's error"*. I measured the CLI failing on a malformed migration earlier today; I did **not** verify that its output names the migration filename, so this ships **labelled assumed, not measured**, with a step-4 obligation to check it in one command. Stating it as fact would be the fourth instance in the same document.

**Amendment.** §8.2 mitigation 2 is rewritten to say what `globalSetup` actually yields (SQLSTATE, `scan.l`, no filename, `No test files found`), to route the fallback through `db:migrate`, and to carry the assumed-not-measured label. §11.2 gains the CLI-logger assumption. §11.3 gains the logger change as a deferred improvement with the reason above.

---

## I-9 — the divergence is conformance drift from ADR-0007

**Finding: AGREE, and the correction goes further than the finding claims.**

ADR-0007's Decision says the runner is invoked programmatically *"both by `npm run db:migrate` … and by the Testcontainers fixture"*. `package.json:18` is the CLI binary. That is a conforming-to-an-accepted-ADR failure, not two entry points with different natural defaults, and my deferral reason — that fixing it would edit `tests/setup/postgres.ts` and spend the seam promise — is **wrong**, because the remedy is entirely on the non-test-owned side. I concede that without qualification.

The part the finding does not reach: **arc42 §7.2 already recorded this drift at 00a step 7 and framed it as arc42 having overstated its own phase-2 wording.** But ADR-0007 makes the same claim, and ADRs are immutable. So my own step-7 reconciliation narrowed, in arc42, a claim that an accepted ADR still asserts — leaving the *"single source of truth for architecture"* (`CLAUDE.md` §4) quietly contradicting an immutable decision, with nothing recording that it had. That is a governance defect in my 00a as-built pass, it is larger than the `package.json` line, and I would rather it be on the record than discovered at Gate D.

**Remedy: I hold the deferral, on corrected grounds.** There is no cheap fully-conforming fix. Passing `singleTransaction: true` in `globalSetup` makes the *behaviour* agree while leaving the ADR's wording violated, and edits a test-owned file. Making `db:migrate` programmatic means a runner module, a decision about where it lives, and an ownership question — real work in a slice whose job is the invariant. And the drift is invisible on every successful migration and loud on every failed one (M-4, M-5), so nothing is at risk while it stands. That is the ground the deferral rests on; the seam-promise argument is withdrawn.

**Where the debt is recorded — the finding is right that §10.2 points at the wrong file.**

- **arc42 §11**, as a debt item naming **ADR-0007** as the decision being deviated from, not "the two entry points".
- **arc42 §7.2**, a correction rather than an addition: its existing as-built paragraph states the fact and does not say it contradicts an accepted ADR. Naming the ADR is the whole correction.
- **The eventual close is one of two things, and I state my recommendation now so it is not re-argued:** conform `db:migrate`, do not supersede ADR-0007. Superseding an accepted decision to legitimise a drift that was never argued for is the worse precedent, and the ADR's underlying requirement 3 — in-process, no shelling out — is the right requirement.

Both sections are outside this slice's declared `§8.1 · §8.2`. §10.2's widening request stands and is now better grounded; if it is not granted, the finding lives in this design and in the generated defect register, and is not lost.

---

## The four items to settle

**A-4 closed — promote mitigation 1. AGREE.** `npx vitest run --project db` at 3.4s becomes the *stated* step-4 loop, not a suggestion. Two consequences I want drawn rather than left implicit. First, **"every implementer commit is green" recovers its plain meaning for this slice** — fully green, locally, before push — where 00a §11.5 had to define it as *locally green on what needs no database, CI-green on the rest*. Second, this falsifies one of 00a §11.5's three load-bearing conclusions and weakens a second; the two-project split remains correct on its own merits, but its *justification* no longer holds. Both are arc42 §7.2 as-built corrections, inside the same widening request. §1.3's one-commit ruling is unaffected — the CI-red argument does not depend on local Docker — but the implementer can now verify that commit green before pushing it, which is the whole point.

**`tsc` emits only `.ts`, so `dist/persistence/` holds no migrations. Placed in arc42 §11**, as a packaging debt item, not §7. It is inert today — both migration paths read `src/persistence/migrations/` from disk and `dist/main.js` never migrates — and it becomes real the day a Dockerfile exists, which §7.1 already defers on the human's ruling. It also **couples to I-9's eventual fix**: if `db:migrate` becomes a programmatic TypeScript module, it must resolve the migrations directory from a location the build actually populates, or the conforming fix ships broken in the built artifact. Recording the two together is worth more than recording either.

**The test-engineer's refusal on derived ids: accepted, and their reason replaces mine.** I invited an objection and got a reasoned refusal, which is §6 point 3 working. Their argument is better than either of mine: in a suite that isolates by data with **no cleanup**, the UUID is the only handle on which subtree a failing row belongs to. That is a correctness-of-diagnosis argument, not the legibility-and-reproducibility taste argument I offered and pre-conceded. **Amendment: ADR-0012's Decision rationale adopts it, and the pre-concession in §3.4 is withdrawn** — the fallback to `randomUUID()` is no longer acceptable, because under no cleanup it makes every id in every failure message meaningless. ADR-0012 is `status: proposed`, so amending it before the human rules is legitimate; it is not yet immutable.

**Vitest parallelises files, not cases. AGREE — the justification changes, the mechanism does not.** Per-case namespaces buy cross-file disjointness and, more importantly, **intra-file attributability**: §4.4 step 6 counts rows in `bayA` over a window, and that count is only meaningful because no other case in the file can have written into that bay. So per-case namespaces are load-bearing for the count assertions regardless of concurrency — but *"the suite parallelises"* was doing work it cannot do at case granularity, and §3.2 and §3.4 both lean on it. **Amendment: replace the parallelism justification with attributability throughout**, and state the granularity explicitly so the next reader does not inherit the same overstatement. This is the fourth instance of the T-6 pattern and I am counting it as one.

---

## Ruling and procedure

All five are **(a) Clarification** under `CLAUDE.md` §6: the design's substance is right, its specification was incomplete or its stated reasons were false, and the correct effect is to amend the design and resume from step 2. No ADR is superseded. **No loopback is consumed** — the slice stays at `loopbacks: 0`, which is what §6's *"objections here are cheap; the same ambiguity found at step 5 costs a full cycle plus a loopback"* is for, and this round is the clearest demonstration of it the project has produced: T-4 alone would have shipped a wrongly-keyed constraint undetectable until slice 07.

I have made no edits and no commits. The amendments above are stated, not applied; per §6 they land in **one pass**, with the rulings attached, once the review loop closes. Two of them (T-4's case-0 rewrite and T-5's positive controls) change what the test-engineer writes at step 3, so if either is contested, contest it now.

```json
{
  "role": "architect",
  "outcome": "adjudicated",
  "arc42_sections_touched": [],
  "adrs": [{"id": "0012", "status": "proposed", "supersedes": null}],
  "quality_scenarios": ["QS-1", "QS-2", "QS-11"],
  "assumptions": [
    "New: that `npm run db:migrate` (CLI, unsilenced logger) names the failing migration file — assumed, not measured; step-4 obligation",
    "A-2 stands and is now load-bearing for T-4: which constraint is reported when two are violable is index/trigger order, not a guarantee",
    "A-4 closed by the coordinator — Docker works in all three shells, falsifying 00a §11.5",
    "A-1, A-3, A-5 unchanged"
  ],
  "open_questions": [
    "Whether the slice's arc42 scope widens to §7.2 and §11 — now needed for three separate corrections (I-9's ADR-0007 drift, A-4's closure, the dist/ packaging note)",
    "Whether ADR-0007's conformance is eventually closed by making db:migrate programmatic (recommended) or by a superseding ADR (not recommended)",
    "AC-7's unnamed constraint and AC-9's 'deterministically' remain as flagged in §11.4"
  ],
  "dcr_ruling": "(a) Clarification on all five — T-4, T-5, T-6, I-8, I-9. Design amended, resume from step 2, no loopback consumed, no ADR superseded.",
  "message": "I agree with all five findings; four carry measurements and the fifth is a documentary comparison I should have made. Three of my own causal sentences were false — T-6, I-8, and the parallelism claim — which with 00a's F1 makes four instances of one shape: explaining a mechanism's capability instead of checking its configuration or naming its discriminating case. I accept every remedy but modify three of them, most consequentially by requiring T-5's positive controls to run after their negative siblings, since my own measurement M-2 shows the exclusion constraint would otherwise pre-empt the case the control exists to validate."
}
```
