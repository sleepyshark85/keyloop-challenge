# Phase 4 — pre-registered process criteria

**Status: AGREED. Committed before slice 00 runs.**

Phase 4 runs the full pipeline on a deliberately trivial slice and judges **the machine, not the
code**. These are the criteria it is judged against, written and committed *before* the pilot, so
that a poor run cannot be rationalised after the fact. Git history is the proof of ordering: this
file's commit must precede the first slice-00 event in `events.jsonl`.

The methodology is a hypothesis. This is its test.

---

## Criteria

Each is measured from an artifact, not from anyone's impression of how it went.

| # | Criterion | Measured from | Passes if | A failure means |
|---|---|---|---|---|
| **C1** | **Test-first genuinely held** | `check.run` events | A failing acceptance run is recorded *before* any passing one, and the failure is a real assertion failure rather than a missing import | The red-commit trail is theatre; the entire verification story collapses |
| **C2** | **Independence genuinely held** | git history + hook denials | No commit shows the implementer touching `tests/{acceptance,contract,property,concurrency}/`, and no `src/` read by the test-engineer | Acceptance tests restate the implementation instead of checking it |
| **C3** | **The reviewer produced substance** | `review.finding` events | Either ≥1 finding carrying a concrete failure scenario, **or** an explicit no-findings review reporting a mutation score. Style-only findings, or findings without a scenario, count as failure | The reviewer is generating plausible text, and every downstream quality metric is noise |
| **C4** | **Architecture held unprompted** | `depcruise` in `check.run` | The implementer's first submission passes layering without a review round | Conformance depends on catching violations rather than preventing them |
| **C5** | **Gates are in the right places** | `gate.decided` + interruptions | ≤1 human intervention outside a defined gate | Gates are misplaced; the human is either over- or under-involved |
| **C6** | **The budget is real** | wall clock + token collector | Extrapolated 13-slice total fits the ceilings agreed below | Scope must be cut now, not at slice 9 |
| **C7** | **The record is trustworthy** | `events.jsonl` | Every record schema-valid; zero events written by a subagent; `derived` events actually produced by tooling rather than by the orchestrator | The evidence base for §13 is self-reported and worth little |
| **C8** | **The board is legible** | the human | After the pilot, the human can answer *"what happened in this slice, and why"* from `docs/board.html` alone, without asking | Observability exists on paper only |

C8 is a human judgement and is declared as one. The rest are mechanical.

---

## Agreed thresholds

Two numbers that cannot be derived from the code. Agreed before the pilot, which is the only
way a ceiling constrains anything.

| | Agreed | Meaning |
|---|---|---|
| Wall-clock ceiling | **≤ 45 min** for slice 00 | Extrapolates to roughly 10 hours over 13 slices |
| Cost ceiling | **≤ $8** for slice 00 | Extrapolates to roughly $100 total |

Slice 00 is the walking skeleton and should be among the cheapest, so treat these as floors on the
estimate rather than an average. If either is exceeded, the correct response is to cut slices or
reduce agent count — not to proceed and hope.

---

## Decision rule

Fixed in advance, so the outcome is read off rather than argued about.

| Result | Action |
|---|---|
| All criteria pass | Proceed to slice 01 unchanged |
| 1–2 non-fatal criteria fail | Tune the specific mechanism (prompt, hook, model), proceed to slice 01. **No second pilot** — tuning is verified by slice 01's own metrics |
| **C1 or C2 fails** | **Fatal.** Stop. These are the verification foundation; a process that fails them produces confident, unverified output — the exact failure this methodology exists to prevent |
| ≥3 criteria fail | The machine does not work. Redesign before spending more, and consider reducing to a smaller team |

---

## What will not happen

Stated plainly, because these are the ways a pre-registered test gets quietly defeated:

- **No redefining a criterion after seeing the result.** If a threshold turns out to be wrong, it is
  changed for *future* slices and the pilot is still recorded as having failed it.
- **No dropping a criterion because it is inconvenient.** C4 may well fail at slice 00 simply
  because `.dependency-cruiser.js` does not exist yet — that is a genuine finding about sequencing,
  not an exemption.
- **No counting UNVERIFIED as PASS.** `npm run slice:check` deliberately refuses to; the retro must
  too.
- **The retro is written before the next slice starts**, to `docs/team-log/retro-slice-00.md`, and
  records failures in the same detail as successes. A retro that only records what worked is
  marketing.

---

## Sign-off

| | |
|---|---|
| Criteria agreed by | human (repository owner) |
| Date | 2026-09-03 |
| Ordering proof | this file's commit precedes the first slice-00 event in `events.jsonl`; verify with `git log --diff-filter=M -- docs/team-log/` |
