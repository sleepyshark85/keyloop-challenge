# Report · phase 6 · architect · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Deployment diagram, shorten section 8
- Returned: 2026-09-09T08:12:18.314Z
- Duration: 1122s

---

Both work items done, nothing committed.

## Work item 1 — the §7 deployment figure

`/home/agentadmin/sources/keyloop-challenge/docs/diagrams/deployment.html` + `.svg` (1000×660, exported). Referenced from §7.1 as `.svg`; §7.1's ASCII block deleted, §7.2's Testcontainers block untouched.

Type **deployment**, 3 zones / 4 nodes / 3 paths / 5 artifact chips — inside every budget, and **no coral**, so `23P01` keeps sole claim on it across the set.

What it draws:
- **Outer zone is the trust boundary**, eyebrow `ONE MACHINE · LOOPBACK ONLY · NO GATEWAY · NO TLS · NO AUTH`, with the stubbed client drawn *inside* it — so the dependency §7.1 states in prose is visible: the caller can only be on this machine. Colophon: `NOTHING ENFORCES THE BOUNDARY BUT THE NETWORK — GC-2 REMOVED AUTHENTICATION, AND §11.3 CARRIES THE RETROFIT`. One italic-serif callout lands on that border: *"the deployment is what makes the missing authentication acceptable"*.
- **Two inner zones carry the split**: `HOST · npm start` holds the scheduler; `docker compose up -d · DEPENDENCIES ONLY` holds the other two. The service box is physically outside the compose zone.
- **postgres has the visual weight** — the only 1.6px stroke on the page, white fill, tallest node, sublabel "the correctness boundary, not a storage detail", chips `postgres:16 / :5432` and `btree_gist / TC-3 · no managed offering`.
- **otel-lgtm is drawn deletable**: dashed box, dashed edge, `OPTIONAL` tag, "may be absent · failures logged and dropped".
- Ports: `HTTP :3000` on the caller edge, `SQL :5432` on the postgres chip, `OTLP :4317` on the dashed edge, `Grafana UI :3001` on the otel chip. Scheduler badged `STATELESS ×1`.

`self_check.py` and `verify-geometry.py` both pass (0 findings).

## Work item 2 — §8

| § | Before | After |
|---|---|---|
| 8.1 Domain model | 424 | **280** |
| 8.2 Exclusion constraint | 388 | **301** |
| 8.3 Time and calendar | 377 | **300** |
| **8.4 Observability** | 543 | **639** |
| 8.5 Testability | 386 | **327** |
| 8.6 Error handling | 606 | **517** |
| **File** | **2,735** | **2,375** |

§8.4 is now the longest subsection, restructured under `### Traces` / `### Metrics` / `### Logs` / `### What an operator does with this` — matching the brief's "logging, metrics, tracing" and ending on the payoff. It opens with the strategy rather than `TC-8`; the mid-clause parentheticals moved to sentence ends; the operator paragraph became a question→signal→answer table.

Cuts, each with where the surviving copy lives:
- **§8.5's ownership table → CLAUDE.md §5.** Table replaced by prose keeping only *what each level is for* plus the driver/database boundary.
- **§8.6's five-operation table → the emitted OpenAPI document** (§5.1: generated from route schemas, cannot drift). The `PATCH`/sub-resource reasoning stayed.
- **§8.6's "Decided by" column → §6.6.** The `500` row's decider survives in the prose below the table.
- **§8.2's trigger contrast → slice 06's design** (`docs/slices/06-design.md:12`, which measures it) **and QS-6** (asserts the outcome). §8 keeps the claim and the mechanism.
- **§8.2's QS-8 closing paragraph and "GiST serves availability" → §6.5**, which already says both.
- **§8.3's spring-forward measurements → QS-9**, which carries them verbatim. The fall-back pair (not in QS-9) stayed.
- **§8.1's `dealership` row → §8.3**, whose headline rule it restated.
- **§8.4's opening question-list → §8.4's own operator table**, which listed the same three.

Judged too load-bearing to cut despite looking redundant: **§8.3's six-step ordering list** (nothing else records it, and the order is what a mutant attacks); **§8.5's Stryker measurement** — §11.2 R-12 records the *risk*, only §8.5 has "118 of 130 survivors had `testsCompleted: 0`"; **§8.6's `500`-is-reachable argument**, which is a decision, not a restatement; and the "no technician qualified" resolution, defined nowhere else — folded into the `422` row rather than dropped.

Protected as instructed: §8.2's SQL is byte-identical; §8.1's transitive-coverage paragraph and §8.4's `booking-trace` figure and operator content are intact.

## Rebaseline — ran it, with one caveat you should know

I landed at **2,375, below the 2,380 baseline**, so I ran `npm run docs:budget -- --rebaseline`.

Two things in that diff are not what they look like:

1. **`arc42/13-ai-collaboration.md` moved 1042 → 1497.** That is pre-existing committed drift, not my edit — I never touched §13.
2. **The rebaseline changes no effective ceiling anywhere.** `budget.mjs:278` computes `ceiling = Math.max(r.budget, r.was)`, so a baseline only binds when it exceeds the budget. §8's override is 4,000, which dominates both 2,380 and 2,375; §13's budget is 1,500, which dominates both 1,042 and 1,497. **So the §8 reduction is not actually held** — §8 can grow back to 4,000 with `docs:budget:check` green the whole way. Holding it would mean lowering `arc42Overrides['08']` in `tools/docs/budget.mjs`, which is outside the paths you scoped me to, so I have not done it. Worth a decision.

§7 stayed at **exactly 766**: the figure's caption and alt text are counted prose (+20), so I paid for them out of §7.1, which the figure now carries. Otherwise the rebaseline would have raised §7's recorded size — the wrong direction, even though the ceiling would not have moved.

## Checks

- `npm run docs:budget:check` — **pass** (exit 0)
- `npm run docs:refs` — **pass**, 97 identifiers cited, all defined
- `npm run docs:check` — reported `system-design.md` stale; ran `npm run docs:build`; now **current** (13 sections, 18 ADRs)

Modified and left in the working tree: `docs/arc42/07-deployment-view.md`, `docs/arc42/08-crosscutting-concepts.md`, `docs/system-design.md`, `tools/docs/budget-baseline.json`, plus new `docs/diagrams/deployment.{html,svg}`. (`docs/team-log/events.jsonl` and the `prompts/` files are the harness's writes, not mine.)

```json
{
  "role": "architect",
  "outcome": "reconciled",
  "arc42_sections_touched": ["§7.1", "§8.1", "§8.2", "§8.3", "§8.4", "§8.5", "§8.6"],
  "adrs": [],
  "quality_scenarios": [],
  "assumptions": [],
  "open_questions": ["The §8 reduction is not held by the ratchet: arc42Overrides['08'] = 4000 dominates the 2,375 baseline, so §8 may grow back with the check green. Lowering that constant is a tooling edit outside the scoped paths."],
  "dcr_ruling": null,
  "message": "Drew the missing §7 deployment figure and cut §8 from 2,735 to 2,375 words, weighting observability up to 639 as the brief's named deliverable. Eight duplications resolved against §6.5, §6.6, §8.3, QS-6, QS-9, CLAUDE.md §5, slice 06's design and the emitted OpenAPI contract."
}
```
