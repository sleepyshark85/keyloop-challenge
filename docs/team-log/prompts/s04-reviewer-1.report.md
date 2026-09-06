# Report · slice 04 · reviewer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 04 step 5 REVIEW
- Returned: 2026-09-06T07:51:22.416Z
- Duration: 631s

---

# Slice 04 — review

## CI, collected myself

**Run `34019756105`**, head `96d0971`, workflow `verify` — **conclusion `success`**.

| Job | Conclusion |
|---|---|
| `suite (Testcontainers)` | success |
| `docs, tools and log integrity` | success |
| `red-proof` | success (completed 07:41:09Z) |

`red-proof` was still `queued` on my first collection and completed between my two calls. I re-collected rather than reporting the first read. `depcruise` re-run locally: **clean, 86 modules / 228 dependencies, no violations.**

## Verdict on `bookAppointment.ts:312` — equivalent mutant, established

Not accepted on plausibility. Two independent arguments:

**Proof.** Only `case 'conflict'` reaches `continue`, and every `conflict` calls `prune` on the head of the named list — always present, so it always removes ≥1. Attempt *k* therefore begins with `S − (k−1)` ids across two lists that are both still non-empty, so `S − (k−1) ≥ 2`, so `k ≤ S − 1`. Attempt `S = structuralBound` is unreachable, and `<=` and `<` admit the identical execution set.

**Exhaustive check** against the real `src/domain/candidates.ts` — all `(B,T) ∈ 1..9²`, 8 seeds, and *every* adversarial choice of which resource fires at each step (full branching, not a sample):

```
no overrun; deepest attempt reached globally: 17 against bound 18 (B=9, T=9)
minimum unused headroom under the written bound: 1 attempt
```

Always exactly `|B|+|T|−1`. **Equivalent — do not write a test for it.** The same proof discharges the `:445` survivor (the throw message in that tail).

## The mulberry32 survivors — the reasoning holds, and is stronger than claimed

The implementer's story is not a comfortable one, but "asserts *a* permutation, not *a particular* one" understates it. I applied both mutants and measured head distribution over 8 bays × 100,000 seeds:

```
baseline             8/8 heads   max dev 1.01%   chi2 2.8  (df=7, crit 24.3)
L66 (state - K)      8/8 heads   max dev 1.16%   chi2 5.2
L69 (t - imul)       8/8 heads   max dev 1.23%   chi2 5.3
```

Both preserve every property the architecture actually depends on — permutation, determinism, seed-sensitivity, head-reachability, *and* uniformity. Subtracting an odd constant mod 2³² is still a full-period bijection. These are equivalent for the contract, not merely unasserted. `candidate-ordering.test.ts` declares the exclusion explicitly (lines 34–42) and routes uniformity to the architect. Sound.

**Survivor accounting: 7 of 8 genuinely equivalent, 1 real.** `:245` ×2 is the last arm of an exhaustive switch whose body is `break` — falling through equals breaking. The one that is not equivalent is below.

## The four you asked about

**1. Test ownership — clean, both directions, verified independently.** Implementer's six commits (`1ed6a58 3aba448 98af1de b2830e2 994bfc5 e0153a1`) touch only `src/` and `tests/unit/`. Test-engineer's `1ea3223` and `39c2588` touch only `tests/{acceptance,concurrency,property,contract,support}/` — no `src/`, no `tests/unit/`.

**2. Commit discipline — one red commit, and every commit typechecks.** I checked out all 29 commits and ran `tsc --noEmit`: **29/29 clean**, including `1ed6a58` post-amendment. One `(red)` commit. Conventional Commits with slice id throughout. Three implementer commits exceed the ~150-line guide (227 / 124 / 174 *code* lines after stripping docblock) — `1ed6a58` is a new module plus its unit tests, which §7 explicitly endorses as one commit. **Checked and withdrawn.**

**3. A-04-11 — real, and worse than stated.** See F2.

**4. `39c2588` — verified, the claims hold.** The three surviving claims are permutation-independent by construction: 24 bays / 1 technician means exactly one row can exist, so the 1/19 split is a database fact; the technician list is a singleton, so each of the 19 losers must empty it at a cost of exactly one `no_technician_overlap` whichever bay it drew first (max 2 attempts either way — the cap of 16 is never near); and `resource` is whatever the last classification minted, which on both paths is `technician`. AC-3's assertion is `.toEqual(['1:no_bay_overlap', '2:no_bay_overlap'])` — an **exact sequence**, not a lower bound. Both bays blocked means every draw is a bay conflict under every permutation, and a loop-less build produces `['1:no_bay_overlap']` and fails 100% of the time. **The claim is correct; no QS-2 gap remains.**

## Findings

```
**reviewer** · `.claude/agents/reviewer.md@995af67` · MAJOR
docs/slices/04-candidate-allocation-and-retry.md:6
claim:     arc42 §7.3 was rewritten but is not in the slice's declared `arc42:` scope
           (["§6.2", "§5.2", "§11"]), and design §7 "arc42 edits" does not list it either.
scenario:  9dfde0d rewrites docs/arc42/07-deployment-view.md — the environment-variable
           contract table, plus a new normative sentence ("This table is the contract;
           BOOKING_ marks what this application invented"). §10 Ready requires the arc42
           scope declared; F-04-3 shows the field was amended once already to add §11, so
           the mechanism existed and was not used here. Remedy is an (a)-shaped slice-file
           amendment, not a redesign.
```

Not graded BLOCKING: my card says block on arc42 moving *silently*, and `9dfde0d`'s own subject line names §7.3. The content is correct; the declaration is missing.

```
**reviewer** · `.claude/agents/reviewer.md@995af67` · MAJOR
src/platform/config.ts:213 and src/main.ts:46
claim:     R-7a's mitigation is unguarded at both ends — the actionable half of the warning
           text is unpinned, and its emission is asserted by nothing at all.
scenario:  (a) config.test.ts pins line 210 (`toContain('BOOKING_SEED=99')`) and line 212
           (`toMatch(/Order-A/)`). Delete line 213 — "It is for reproducing a run, never for
           production", the only sentence telling an operator what to do — and every test
           passes. That is Stryker's config.ts:213 survivor, and the test's own comment
           ("the wording is asserted, not merely the count") is true of two of four
           fragments and false of the two that survived.
           (b) `config.warning` appears exactly once in the whole repository: at main.ts:46.
           No outside-in test asserts it, and stryker.config.mjs excludes `'!src/main.ts'`
           on the stated ground "the composition root: wiring, asserted by AC-2 end to end".
           That justification is true of the booking path and false of this line: delete
           main.ts:46 and BOOKING_SEED runs Order-A in production with no operator warning
           while npm test, npm run mutation and depcruise all stay green.
```

The cheap remedy is an outside-in assertion — `candidate-retry.test.ts` AC-5 already starts the service with `bookingSeed` set and already reads log records, so one `config.warning` record at `warn` is a few lines in a file the test-engineer owns. **I did not write it.** I attempted to establish (b) by deleting main.ts:46 in a throwaway worktree; `guard-paths` correctly refused me, so (b) rests on the grep and the Stryker exclusion, both of which are checkable. If the architect rules this out of scope as a (b), that is legitimate — but the Stryker exclusion comment should then be corrected, because it currently asserts coverage that does not exist.

```
**reviewer** · `.claude/agents/reviewer.md@995af67` · MINOR
(no file) — branch state
claim:     HEAD is 478af2d; CI ran on 96d0971. No CI run exists for HEAD.
scenario:  478af2d changes docs/DEFECTS.md and docs/team-log/events.jsonl — precisely the
           inputs to the docs job's `defects:check`, log-append-only, log-schema and budget
           steps. Those four checks have not run on the commit that would merge. I ran them
           myself against the merge result; all pass. Process gap, not a defect.
```

## Found without being asked

**The branch is behind `main` by one commit, and it is in a file this slice rewrote.** `57971b4` ("two corrections found at slice 02 step 7") is on main and not on this branch; it edits `docs/arc42/08-crosscutting-concepts.md` and `docs/arc42/11-risks-technical-debt.md`, and slice 04 rewrote §11 across 124 lines. This also means a naive `git diff main..HEAD` **misreads §8.3 as a regression** — it shows ADR-0015 reverting from "shipped in slice 02" to "Accepted, and not yet written", which this slice did not do. Anyone reviewing on `main..HEAD` alone will file that as a defect. It is not one.

I checked the merge rather than trusting it: `git merge-tree` merges clean, the `R-02-2 → D-02-1` rename survives (merged §11 line 77 carries D-02-1; R-02-2 is absent), and against the merged tree `docs:check`, `docs:refs`, `docs:adr-check`, budget ratchet, `defects:check`, `log:check` and `agents:check` **all pass**. **Checked and withdrawn** — recorded because the risk was real and the reverse-delta trap is live for the next reader.

**One more withdrawn.** The log record `s-04-check-2` (ts 07:41:36Z) reports `red-proof: PASS` for a job my first collection showed queued. `red-proof` actually completed at 07:41:09Z, 27 seconds before the record. The record was derivable when written; my first read was stale. **Withdrawn** — no §9 violation.

**Checked and clean, for the record.** §2.1: `candidateRepository.ts` issues no query against `appointment` (`appointment-table-access` marker positively asserts the sole permitted site is `appointmentRepository.ts`); every attempt is adjudicated by the `INSERT`; no check-then-act anywhere on the path. All five ACs map to committed outside-in tests, AC-4 at the shipped cap of 16 with both the exhausted-tie (16 bays) and capped (17 bays) fixtures. `no-spurious-refusal.test.ts` AC-2 asserts `max(attempt) >= 2` where the fixture owes ≥8 — loose, but AC-1's `min(N,M)` count in the same file is the real guard, so no hole; withdrawn.

## Report

```json
{
  "role": "reviewer",
  "outcome": "changes-requested",
  "findings": [
    {"severity": "MAJOR", "file": "docs/slices/04-candidate-allocation-and-retry.md", "line": 6,
     "claim": "arc42 §7.3 was rewritten but is not in the slice's declared arc42: scope",
     "scenario": "9dfde0d rewrites docs/arc42/07-deployment-view.md's environment-variable contract table and adds a normative sentence; the frontmatter declares only §6.2, §5.2, §11, and design §7 lists the same three. §10 Ready requires the scope declared, and F-04-3 shows the field was already amended once to add §11."},
    {"severity": "MAJOR", "file": "src/platform/config.ts", "line": 213,
     "claim": "The actionable half of R-7a's warning text is pinned by no test, and its emission at main.ts:46 is guarded by neither a test nor a mutant",
     "scenario": "config.test.ts pins lines 210 and 212 only; deleting line 213 ('It is for reproducing a run, never for production') leaves the suite green — Stryker's config.ts:213 survivor. Separately, 'config.warning' occurs once in the repo, at main.ts:46, which stryker.config.mjs excludes as '!src/main.ts' on the ground that AC-2 asserts the wiring end to end; deleting that line leaves BOOKING_SEED running Order-A in production unannounced with npm test, mutation and depcruise all green."},
    {"severity": "MINOR", "file": "docs/team-log/events.jsonl", "line": 0,
     "claim": "No CI run exists for HEAD (478af2d); run 34019756105 is on 96d0971",
     "scenario": "478af2d changes docs/DEFECTS.md and docs/team-log/events.jsonl, the inputs to the docs job's defects:check, log-append-only, log-schema and budget steps. Those four have not run on the commit that would merge; I ran them against the merge result and all pass."}
  ],
  "mutation": {"score": 0.9756, "survivors": 8, "equivalent": 7, "real": 1},
  "depcruise": "pass",
  "commit_discipline": "pass",
  "test_ownership": "pass",
  "dcr": null,
  "ci": {"run_id": 34019756105, "head_sha": "96d0971", "conclusion": "success",
         "jobs": {"suite (Testcontainers)": "success", "docs, tools and log integrity": "success", "red-proof": "success"}},
  "message": "bookAppointment.ts:312 is an established equivalent mutant, by proof and by exhaustive search over every adversarial conflict path — the deepest reachable attempt is exactly |B|+|T|-1. The mulberry32 survivors are equivalent too, and by more than the implementer claimed: I measured both mutants uniform to within 1.3% with chi-square 5.2 and 5.3 against a baseline of 2.8. Seven of eight survivors are equivalent; the eighth, config.ts:213, is a real hole in the one place it matters, because ADR-0021's warn is R-7a's whole mitigation and neither its actionable sentence nor its emission from main.ts is asserted anywhere. Test ownership and typecheck-every-commit both verified independently and both clean. Two findings raised and two withdrawn."
}
```

No DCR. Neither finding asks for a design change: F1 is a slice-file amendment (a), F2 is a test in a file the test-engineer already owns. Nothing here is incorrect or unsafe, so this is `changes-requested`, not `blocked`.

Files: `/home/agentadmin/sources/keyloop-challenge/src/application/bookAppointment.ts`, `/home/agentadmin/sources/keyloop-challenge/src/domain/candidates.ts`, `/home/agentadmin/sources/keyloop-challenge/src/platform/config.ts`, `/home/agentadmin/sources/keyloop-challenge/src/main.ts`, `/home/agentadmin/sources/keyloop-challenge/stryker.config.mjs`, `/home/agentadmin/sources/keyloop-challenge/docs/slices/04-candidate-allocation-and-retry.md`, `/home/agentadmin/sources/keyloop-challenge/docs/arc42/07-deployment-view.md`, `/home/agentadmin/sources/keyloop-challenge/tests/unit/platform/config.test.ts`, `/home/agentadmin/sources/keyloop-challenge/tests/acceptance/candidate-retry.test.ts`.
