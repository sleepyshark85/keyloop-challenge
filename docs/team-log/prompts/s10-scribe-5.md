# Prompt · slice 10 · scribe · invocation 5

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Refocus arc42 §13
- Sent: 2026-09-09T07:25:09.231Z

---

Task: refocus `docs/arc42/13-ai-collaboration.md`. The user wants it organised around four questions it currently answers only partially and in the wrong order of emphasis.

Their words, verbatim — treat these as the section's brief:

> "focus on how we built the whole agent team to tackle the problem from just the business requirements (in Requirements.md) and how the team doing loops, discussions, agreements/disagreements to finalize the whole application with all the documentation, tests. How the team can improve, correct themselves. And what are the result"

So four movements: **(1) from a one-page brief to a team**, **(2) the loop as it was actually run — agreements and disagreements**, **(3) self-correction**, **(4) results**.

## The bar, which does not move

Your role constraint is the whole value of this section: **every claim cites an artifact, and derived facts come from tooling, never narration** (CLAUDE.md §9). The section's own header already promises this — "Sourced from artifacts, never memory". Do not weaken it into storytelling. §13 is the evidence; the *narrative* lives in `README.md`, and that division must survive this edit.

**Re-derive every number yourself.** I ran some queries to confirm the evidence exists, but numbers I quote here are a starting point to verify, not a source to copy:

- `node tools/team-log/query.mjs` — the event log reader (1,269 lines). Event-type counts I observed: `finding.raised` 374, `agent.finish` 247, `finding.ruled` 226, `finding.resolved` 119, `check.run` 107, `handoff` 28, `gate.decided` 26, `adr.recorded` 23, `review.finding` 23, `adr.retired` 17, `arc42.updated` 14, `finding.routed` 13, `escalation` 9, `slice.done` 8, `review.response` 8, `gate.opened` 6, `dcr.raised` 6, `dcr.resolved` 6, `loopback` 4, `board.move` 3, `backlog.added` 2.
- `docs/team-log/phase-4-retro.md`, `docs/team-log/process-criteria.md`, `docs/team-log/prompts/` — the reports and prompts
- `DEFECTS.md` (369-row register), `docs/adr/`, `docs/slices/`, `reports/mutation/`, and git

## Movement 1 — from `Requirements.md` to a team

This is the part that barely exists today and is the user's first ask. The starting material was a one-page brief; everything else is constructed. Show the construction, from the log:

- **Phase 1** produced requirements *and the ambiguities*, which is the interesting move — the brief was under-specified and the team's first output was a list of what it could not know. Gate A resolved four open questions (OQ-1 opening hours as request validation; OQ-2 service advisor, no auth; OQ-3 both cancellation and rescheduling in scope, *expanding* on the architect's recommendation; OQ-4 retry then refuse). Note which of those the human accepted, modified or overrode — the `adr.recorded` rows carry a `provenance` field (`accepted` / `modified` / `overridden`) that makes this measurable rather than asserted.
- **Phase 2** turned constraints into ADRs 0005–0010; Gate B accepted all six unmodified but added three rulings of its own, including moving `tests/architecture/` and `tests/performance/` to the test-engineer and splitting slice 00 into 00a so the pilot measured the loop rather than scaffolding friction.
- **Phase 3** produced thirteen slices with every QS-1…QS-14 claimed by the slice that makes it executable, ordered by what must exist before the invariant can be tested rather than by feature value.

The through-line worth making explicit: **the team, the rules and the guards are themselves outputs of the process**, not givens. CLAUDE.md §5's test-ownership split, the `.dependency-cruiser.js` ruleset and `.claude/hooks/guard-paths.mjs` all exist because something needed them.

## Movement 2 — loops, discussions, agreement and disagreement

Currently spread across §13.2 and §13.4. Pull it together and make the *disagreement* visible, because CLAUDE.md §6 states outright that "an adjudication round that has never produced a disagreement is not consensus, it is deference, and the retro reads it the same way it reads a reviewer with no findings."

So the honest question this section must answer with data: **did the team actually disagree, or did it defer?** Use `finding.raised` (374) against `finding.ruled` (226) and `finding.resolved` (119); `review.finding` (23) against `review.response` (8); the 6 DCRs and their rulings by outcome (a)/(b)/(c)/(d); the 4 loopbacks; the 9 escalations. If any vote was called under §6's "the architect may call a vote", find it and name it — a third role adjudicating is the process's strongest artifact. If the ratio shows deference rather than disagreement anywhere, **say so**; a section that reports only the flattering ratio fails your own bar.

## Movement 3 — self-correction

The user's third ask, and the one with the best evidence. The process amended *itself* in response to its own failures. Candidates to verify and cite:

- **17 `adr.retired` events** against 23 recorded — decisions superseded rather than edited, which CLAUDE.md §4 requires ("an ADR's decision is immutable; its prose is not")
- **CLAUDE.md §6 gained a clause because of a specific failure**: "§2 is on that list because a design once worked around §2.4 and substituted an evidence chain for it. Nothing else could be named — the end state was green either way — so the gravest defect was the one the rule could not reach." Find that episode in the log and cite it. It is the single best example of the team correcting its own governance.
- **The adjudication rule itself** ("Adjudication is reasoned before it is applied") exists because an adjudicator that rules and edits in one pass makes agreement the path of least resistance. Was it added mid-project? The log and git will say.
- `phase-4-retro.md` and `process-criteria.md` — what the retro changed.
- The `--ratchet` word budget and `budget.mjs`'s own comment recording that a file fell 13,566 → 1,200 while the baseline still said 13,566, "so it could have grown back twelvefold with the check green the whole way. Found by the architect immediately after making it."

## Movement 4 — results

Consolidate what today is scattered. Derived facts only: slices completed against slices planned, ADRs accepted, arc42 sections reconciled, test counts by suite, mutation scores from `reports/mutation/`, dependency-cruiser status, the defect register's disposition, human gate decisions. State what was *not* finished as plainly as what was — the backlog's contents at close, any deferred (b) rulings outstanding, and anything the ratchet or the guards still do not cover.

## Constraints

1. **Budget.** File is at 1,042 words; ceiling is `max(budget 1500, baseline 1042)` = **1500**, so roughly 450 words of headroom. Four movements will not fit by addition — **restructure, and cut what does not serve the four questions.** Report what you cut and why. Do not raise the baseline.
2. **Do not commit.** Two other agents are working on this branch and a concurrent `git commit` risks index contention. Leave changes in the working tree; I will commit.
3. Touch only `docs/arc42/13-ai-collaboration.md`. Do **not** edit `README.md`, `docs/arc42/06-runtime-view.md`, `docs/arc42/08-crosscutting-concepts.md`, `docs/diagrams/`, `docs/METHODOLOGY.md` or `CLAUDE.md` — other agents hold several of those. If your work implies a `README.md` change, describe the delta in your report rather than making it.
4. Run and report: `npm run docs:budget:check`, `npm run docs:refs`, `npm run docs:check`.

Report: the new section structure, what you cut, every number you derived with the command that produced it, any claim you wanted to make but dropped for lack of an artifact, and the README delta if there is one.
