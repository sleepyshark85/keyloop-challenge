# Prompt · phase 2 · architect · invocation 2

**BACKFILLED.** Sent on 2026-09-03, before `.claude/hooks/capture-prompt.mjs` existed;
reproduced verbatim from the session transcript. From `s00a-architect-2` onward, capture is
mechanical and happens at invocation. See `README.md`.

- Task: ADR-0010 CI platform and workflow

---

You are the architect. Continue Phase 2 on the already-checked-out branch `phase/02-architecture`. Gate B is open as PR #2; the human has ruled that **CI is required** and asked for it as a decision record on this branch before merge.

Your five ADRs (0005–0009) are already committed and are `status: proposed`. Do not edit them.

## Read first

- PR #2's two comments: `gh pr view 2 --comments`. The orchestrator's comment sets out the CI finding — read it, it contains the substance of what you are deciding.
- `docs/METHODOLOGY.md` — especially §261 (the board cannot leave `red` until CI has recorded the acceptance test failing), the §400 event-coverage table (`check.run` is marked NOT EMITTED YET and makes phase-4 criterion C1 unpassable), and §111/§114/§122/§142 (traceability, docs link integrity, `QS-*` → real test, `verify-geometry.py`).
- `docs/arc42/02-constraints.md` — TC-9 (Docker required for tests) and TC-10 (Node/npm pin).
- `CLAUDE.md` §2.3, §2.4, §6.
- `docs/arc42/07-deployment-view.md` — your own §7, which is where CI's relationship to the deployment topology belongs.

## Deliverable 1 — ADR-0010, MADR, `status: proposed`

The CI platform decision. `status: proposed` like 0005–0009: it is part of the Gate B decision, and the human accepts it by merging.

Recommendation to argue: **GitHub Actions** — `origin` is the project's GitHub remote, and `ubuntu-latest` runners ship Docker, which is what TC-9 requires for Testcontainers. Note that this makes the runner choice a *correctness prerequisite* rather than a convenience, since TC-9 states the suite is not runnable on a Docker-less runner.

Alternatives that must be genuinely considered and rejected with reasons, per the standard you set yourself — "a technology named without a rejected alternative is a preference, not a decision": no CI at all / local-only (address it seriously — it is the status quo and it is what §2.4 and §261 actually forbid, so say precisely which rule it breaks); CircleCI; GitLab CI. Consider also whether a self-hosted runner is warranted and reject it if not.

The ADR must also decide, because these are the parts that carry real consequence:

1. **How `check.run` gets emitted.** This is the load-bearing part. §400 marks it the one event type that is fully trustworthy in principle but not emitted at all, and criterion C1 is unpassable until it exists. Decide the mechanism — a workflow step that appends to `docs/team-log/events.jsonl` and commits, versus the audit tool reading the GitHub API/artifacts after the fact, versus something else. Weigh: a bot committing to a PR branch is a real cost (it churns the branch, may retrigger runs, and needs a token with write scope); reading the API keeps the log clean but makes the event derived-on-demand rather than durable, and the log is a submission artifact that must survive without network access. State clearly which property you are buying.
2. **How the red proof is captured.** §2.4 and §6 step 3 require the acceptance test to be *observed* failing in CI before implementation exists. A CI run that fails is normally a blocked PR. Say how a deliberately-red run is distinguished from a broken one, and how the evidence is retained after the test later goes green.
3. **What runs when.** Right now `lint:arch` and `graph:modules` **fail because `src/` does not exist** — you flagged this yourself. So the workflow must be phased: what runs from today (docs and log integrity, diagram geometry, the tools test suite), and what gets wired in at phase 4 when `src/` and the test suite arrive. Do not wire src-dependent steps in now.
4. **Whether the Node/npm pin becomes enforced.** You flagged that TC-10 says "pinned" but nothing enforces it. CI is the natural place to make it real. Recommend, but note the human has not ruled on it.

## Deliverable 2 — the workflow itself

`.github/workflows/` — the founding workflow, containing only what passes **today**. It must be green on this branch when you are done; verify by running each step's command locally. Include the phase-4 additions as commented-out or clearly-marked-pending, or document them in the ADR — your call, but do not ship a workflow that is red.

## Deliverable 3 — reconcile arc42

Add CI where it belongs — §7 for the pipeline's place in the topology, and a line in §2 if TC-9/TC-10 gain an enforcement point. Keep it brief; do not restate the ADR. Regenerate with `npm run docs:build` and leave `docs:check`, `test:docs` and `log:audit` passing.

## Not yours in this task

- Do **not** rule on the slice-00 / `00a` walking-skeleton split. The human has not answered it, and it is a scope question (`CLAUDE.md` §6) belonging to Gate C. If your CI decision has a bearing on it, say so in your report, not in the ADR.
- Do not write slices, do not touch ADRs 0001–0009, do not write to `docs/team-log/events.jsonl`, do not move the board, do not push, do not comment on the PR. The orchestrator does all of that.

## Commits

Small and conventional on `phase/02-architecture`, ending each message with the standard attribution trailer.

## Report back

The ADR's decision and the alternatives rejected; the `check.run` mechanism you chose and the property you traded for; how the red proof is captured and retained; exactly which steps run today and which are deferred to phase 4, with evidence that today's set passes locally; what you changed in arc42; anything you are unsure about or that a reviewer should argue on the PR.
