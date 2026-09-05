# Report · slice 02 · reviewer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 02 step 5 review
- Returned: 2026-09-05T21:48:28.483Z
- Duration: 1444s

---

# Review — slice 02 @ `a6c558b`

`reviewer` · `.claude/agents/reviewer.md@f9fdd67`

**Outcome: `changes-requested`** — one MAJOR, three MINOR. Nothing about the shipped system is wrong; the MAJOR is a gate line that is not evidence. No DCR.

---

## What I ran, rather than read

| | Result |
|---|---|
| `npx stryker run` (full, independent) | **790 mutants · 747 killed · 11 timeout · 32 survived · 95.95%**. On the 14 changed `src/` files: 642 mutants, 26 survivors, **0.9595**. Survivor set **byte-identical** to the implementer's. |
| `npm run test:nodb` | 22 files / 436 tests green |
| `npm run test:db` | 8 files / 34 tests green — real PostgreSQL, includes both concurrency tests, the contract test and the DDL-drop control |
| `npm run lint:arch` | clean, 81 modules, every root covered |
| ADR-0018's three cells, re-measured by me on `postgres:16-alpine` against this repo's own migrations, N=20 from a hard barrier | see below |

**ADR-0018 corroborated.** I wrote the control the ADR describes and ran it myself:

```
(c) locks ON,  constraints ON  -> 1 row,  19x 23P01, 0 deadlocks
(b) locks OFF, constraints ON  -> 1 row,  19x 23P01, 0 deadlocks (this trial)
(a) locks ON,  constraints OFF -> 20 overlapping rows
```

Cell (a) is the one the orchestrator asked about: **the lock prevents nothing** — drop the constraints and twenty overlapping rows land while the lock is held. Cell (b): **the lock decides nothing** — remove it and the constraint alone still yields one row. The ADR's numbers are honest. (My single trial of (b) produced no deadlock; the ADR's 108 came from repeated trials, and the test-engineer's "roughly one race in three" is why one trial proves nothing about the deadlock count. Neither number is load-bearing for §2.1.)

## §4's structural defences under ADR-0018 — they hold

I checked the architect's own admission rather than accepting it.

- **The brand.** `classify` is the only minting site; `no-verdict` (`40P01`) carries no `constraint`, so a capacity refusal cannot be built from a deadlock. `contended-resource-cast` fires in `pgError.ts` only, with a negative control asserting the *type* may flow and only the *cast* is confined.
- **The scan.** `appointment-table-access` matches `src/persistence/appointmentRepository.ts` **exactly** — mechanism 4, a positive assertion, not "at most". `lockResources` takes `hashtext(bay_id)`/`hashtext(technician_id)` on reference ids and names no table, so the locks do not create an exempt reader. `candidateResources` does not touch `appointment`, joined or otherwise.
- **The transaction.** `bookAppointment` issues five reference reads, then `db.transaction()` containing exactly the lock statement and one `INSERT`; the classes are disjoint (`1`=bay, `2`=technician) and the order is fixed by the array literal in one statement, so no attempt can take them in reverse and no cycle is constructible. The retry loop prunes per resource *value*, terminates in `|bays|+|techs|-1`, and every pruning decision is justified by a constraint PostgreSQL actually named — I worked the pruning through six candidate configurations and found no false refusal.

The residue §4.3 names — a helper *inside* `appointmentRepository.ts` reading availability — is unchanged by ADR-0018 and still review's. It is not present.

## The 32 survivors — re-derived, not accepted

All 32 are equivalent or unobservable. Accounting (mine, from `mutation.json`):

6 `routes/health.ts` (slice-00a, untouched) · 6 exhaustiveness `default:`/`never`-throw · 11 TypeBox schema *options* · 2 `openingHours:130` (`formatToParts` always returns requested parts) · 2 `bookAppointment:202` (last case, no `default`) · 2 `pgError:80,103` · 1 `openingHours:256` · 1 `appointments:245` · 1 `appointments:203`.

Two I want on the record:

- **`appointments.ts:245 → true` is genuinely equivalent.** With the mutant a `closed-day` or `spans-local-days` verdict yields `{opensAt: undefined, closesAt: undefined}`; `fast-json-stringify` drops an optional property whose value is `undefined`, so the client sees the same bytes. Verified against the reachable verdict set (`unknown-zone` and `malformed-hours` are routed to `reference-data-invalid` before this function).
- **The implementer's note on `openingHours.ts:256` is wrong about which mutant survived.** It says *"this is the ordering arm"*. It is not: the surviving mutant is at **column 32**, `closesSeconds === null → false`, and it survives because that arm is **logically implied** by `!(opensSeconds < closesSeconds)` — when `closesSeconds` is null, `opensSeconds < null` coerces to `< 0` and is false for every non-negative seconds-of-day, so the third arm already returns `malformed-hours`. The ordering arm's own mutants are all killed, by `tests/unit/domain/openingHours.test.ts:144` and `:151`. Right conclusion, wrong reason — and the difference matters, because "no test covers it" and "the code is redundant" call for opposite remedies.

**AC-6: the architect's reading is right, with one refinement.** The `additionalProperties: true` survivor is equivalent because `BookCommand` has no member for an end and the handler builds it from five named fields — I confirmed the acceptance test (`endsAt: isoAt(480)` against a 30-minute service type) passes either way. The refinement: `additionalProperties: false` is **not** load-bearing for the request contract *at runtime* either. Fastify's default `removeAdditional: true` makes it strip rather than reject — which is why the AC-6 test asserts `201`, not `400`. It is load-bearing only for ADR-0005's emitted document at slice 09/10. The design's sentence claims a little more than holds.

## Discipline

- **One red commit**, `34b057b … (red)`, test-engineer, touching only outside-in dirs plus `tests/support/`. The later `e6e4bec` touches `tests/concurrency/` only and is the ruled (a) correction, not a second red.
- **Test ownership: clean, symmetrically.** No `feat(02)`/`refactor(02)` commit touches `tests/{acceptance,contract,property,concurrency,architecture,performance}`; no test-engineer commit touches `tests/unit`.
- **arc42 movement:** three files moved. `§9` and `§11` are generated-block only. `§10` is a hand edit — see R-02-1.
- **Commit size:** I concur with the architect. §7's clause with force is *every implementer commit is green*, and `bookAppointment.ts` cannot be split from its own outcome union and still compile. The three repositories were three green commits and I would have taken that split too. A rebase now trades a real property (bisectable, green) for a cosmetic one. **Not a finding.**
- **T-02-10:** I concur with leaving it. `24 bays seeded, 1 used` fails *closed* — change the fixture and it fails loudly on the fixture guard, which is what it is for. Its "1 used" half is redundant with the `toHaveLength(1)` above it; the "24 seeded" half genuinely guards `seedScenario`. **No upgrade.**

---

## Findings

```
R-02-1 · MAJOR
tools/slice/check.mjs:142  (and docs/slices/02-book-and-read-an-appointment.md front matter)
claim:     slice:check reports "arc42 edits match the declaration — 0 hand-edited, all within
           §5.2 §6.1 §8.6" over an arc42 hand edit it never opened.
scenario:  dd9bd44 hand-edits docs/arc42/10-quality-requirements.md (QS-12's wording) mid-slice,
           at step 2, outside the slice's declared arc42: ["§5.2","§6.1","§8.6"]. Its subject is
           `docs(arc42): …`; check.mjs:142 selects the slice's commits with
           /^\S+ [a-z]+\(0*2\)!?:/ , which `docs(arc42)` does not match, so the file is never
           read. The exemption is deliberate and tested (tools/test/slice-check.test.mjs:304-308)
           on the assumption that `docs(arc42)` only ever appears at step 7, post-gate — an
           assumption this slice breaks. Same family as F-02-10 and O-29: a guard green over
           something it did not examine.
```
The edit itself is legitimate — it implements the human's E-02-2 ruling and is recorded — so nothing was rewritten silently. What is wrong is that the line the gate reads is vacuous for this slice. Scope-by-commit-message cannot separate a mid-slice `docs(arc42)` from a post-gate one; a gate-relative test can. Adding `§10` to the front matter would make the declaration honest but would **not** make the check see it.

```
R-02-2 · MINOR
tests/integration/exclusion-constraint-adjudicates.test.ts (case absent) · docs/slices/02-design.md §4.5
claim:     ADR-0018's "the lock prevents nothing" reading exists only in the ADR's prose; the
           design named exactly where the control belongs and it was never added, and no finding
           or DCR records the omission.
scenario:  §4.5 says "The lock-drop control belongs beside §4.4's in
           tests/integration/exclusion-constraint-adjudicates.test.ts … one added case in an
           existing file." That file has one it() and its race() issues raw INSERTs with no
           advisory lock, so the suite covers cells (b) and (c) and not (a).
```
MINOR and not more, deliberately: I ran cell (a) and it holds (20 rows), and cells (b)+(c) — both in the suite — already carry the §2.1 claim between them. Nothing behaves wrongly; a ruled design instruction was dropped without a record.

```
R-02-3 · MINOR
src/http/routes/appointments.ts:203
claim:     the GET route's response schema is not load-bearing under test, while the POST's is —
           so fae2aff's "the response schemas are asserted to ENFORCE" is half true.
scenario:  mutant `appointments.ts:203:19 ObjectLiteral "{}"` (the whole
           `response: { 200: AppointmentBody, ...PROBLEM_RESPONSES }` map) SURVIVES; its sibling
           `appointments.ts:126:46` on the POST route is KILLED. Delete the GET route's response
           map and no unit test notices. Behaviour is identical today, so it is not a defect —
           but slice 05 renders `cancelled` at this URL, and the design's argument for the
           union-of-literals is that the response schema enforces.
```

```
R-02-4 · MINOR
docs/team-log/events.jsonl · docs/DEFECTS.md:637
claim:     I-02-7 (MAJOR) is recorded raised and never ruled, although its remedy shipped and its
           twin T-02-3 — the same gap raised by the other role — is ruled accepted.
scenario:  I-02-7 is the only step-2 finding in slice 02 with no finding.ruled event; T-02-3's
           own ruling text says "Raised independently by both roles (also I-02-7)", and the
           remedy is in the tree (AppointmentView, ReadOutcome, both response schemas).
           check.mjs:413 computes open MAJOR/BLOCKING from exactly this, and the stated gate bar
           is "no open MAJOR or BLOCKING".
```

---

## Report

```json
{
  "role": "reviewer",
  "outcome": "changes-requested",
  "findings": [
    {"severity": "MAJOR", "file": "tools/slice/check.mjs", "line": 142,
     "claim": "slice:check reports the arc42 declaration satisfied over a hand edit to §10 it never read, because dd9bd44 is scoped docs(arc42) and the check selects only commits scoped (02)",
     "scenario": "dd9bd44 edits docs/arc42/10-quality-requirements.md mid-slice, outside the declared ['§5.2','§6.1','§8.6']; the check's regex /^\\S+ [a-z]+\\(0*2\\)!?:/ does not match 'docs(arc42):', so the file is never examined and the line reads PASS / 0 hand-edited"},
    {"severity": "MINOR", "file": "tests/integration/exclusion-constraint-adjudicates.test.ts", "line": 209,
     "claim": "ADR-0018's 'locks on, constraints dropped -> 20 rows' control is not in the suite although design §4.5 named this file as its home",
     "scenario": "race() issues raw INSERTs with no advisory lock, so phases 1-3 cover only the unlocked cells; I ran the missing cell independently and it holds (20 overlapping rows)"},
    {"severity": "MINOR", "file": "src/http/routes/appointments.ts", "line": 203,
     "claim": "the GET route's response schema map is not asserted, while the POST route's is",
     "scenario": "mutant 203:19 ObjectLiteral '{}' survives; sibling 126:46 is killed"},
    {"severity": "MINOR", "file": "docs/team-log/events.jsonl", "line": 301,
     "claim": "I-02-7 (MAJOR) has no finding.ruled event although its remedy shipped and its twin T-02-3 is ruled",
     "scenario": "only step-2 finding in slice 02 with no ruling event; check.mjs:413's open-MAJOR predicate counts it, and the gate bar is 'no open MAJOR or BLOCKING'"}
  ],
  "mutation": {"score": 0.9595, "survivors": 32},
  "depcruise": "pass",
  "commit_discipline": "pass",
  "test_ownership": "pass",
  "dcr": null,
  "message": "Re-ran Stryker independently and reproduced 747/11/32 and 95.95% exactly, survivor set byte-identical; all 32 are equivalent or unobservable, though the implementer misnames which openingHours.ts:256 mutant survived. Ran the DB suite (8 files, 34 tests) and depcruise (81 modules) locally, both clean, and re-measured ADR-0018's three cells myself on postgres:16-alpine: locks on/constraints off gives 20 overlapping rows, locks off/constraints on gives 1 — the ADR is honest and §4's structural defences still hold under it. One MAJOR: the arc42-declaration line of slice:check reports PASS over a §10 hand edit it never opened, because the commit is scoped docs(arc42). The edit itself is the human's E-02-2 ruling and is legitimate; the gate line is not evidence."
}
```

Files, for anyone following up: `/home/agentadmin/sources/keyloop-challenge/tools/slice/check.mjs`, `/home/agentadmin/sources/keyloop-challenge/tests/integration/exclusion-constraint-adjudicates.test.ts`, `/home/agentadmin/sources/keyloop-challenge/src/http/routes/appointments.ts`, `/home/agentadmin/sources/keyloop-challenge/docs/DEFECTS.md`. My control script is at `/tmp/claude-1000/-home-agentadmin-sources-keyloop-challenge/bf0a061e-03e3-4edb-be4f-6269c9fa32ca/scratchpad/lock-control.mjs` — scratchpad only; I committed nothing and edited no tracked file.
