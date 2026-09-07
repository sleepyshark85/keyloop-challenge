# Report · slice 08 · architect · invocation 8

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Retire 17 ADRs, resumed
- Returned: 2026-09-07T11:33:23.267Z
- Duration: 4472s

---

Done. Branch `chore/adr-retirement` is pushed, 12 commits, all checks green. No PR opened.

## What I inherited, and what I changed about it

The interrupted run had folded ADR-0011 into `00a-design.md` and ADR-0012 into `00-design.md`. Both folds were good and I kept them. Two corrections: the red budget was `00-design.md` at 1288/1200, not `00a` at 1235 as the brief said (00a was already at 1197); and the earlier run had left `00-design` over the ceiling, which I paid down by 88 words of compression rather than by trimming the new content.

## Verification

`docs:refs` clean (83 cited, all defined) · `docs:adr-check` clean at 16 · `docs:check` current · `docs:budget:check` green · `test:tools` 21/21.

## The seven unclaimed ADRs

I placed them on **each ADR's own provenance block**, which is stronger evidence than log-citation counts and corrected one of the leads:

| ADR | Placed | Evidence |
|---|---|---|
| 0011 | slice 00a | *"Raised by the architect at step 1 of slice 00a"*; `/health` is 00a's AC-2. The lead said 02 — that was citation volume, not origin |
| 0012 | slice 00 | *"Raised at step 1 of slice 00"*; its subject is AC-9. Confirmed: zero log citations |
| 0013 | slice 01 | *"step 1 of slice 01"* — arc42 §8.5 already holds the clauses, so only the refused alternatives moved |
| 0017 | slice 02 | *"PROPOSED by the architect at slice 02 step 1"* |
| 0020 | slice 04 | *"RULED at slice 04 step 1"* |
| 0021 | slice 04 | *"RAISED as objection T-04-1 at slice 04 step 2"* |
| 0022 | slice 04 | *"RAISED as T-04-5 at slice 04 step 3"* |

**One placement departs from the brief's map.** ADR-0029 was mapped to slices 07 and 09; those frontmatter `adr:` lists say the decision is *in force* there, not that it was *taken* there. Its provenance says slice 06 step 7 and the event names it settles are slice 06's second write path, so it went to `06-design.md`.

## The one I would not have retired, and one the brief missed

**ADR-0013 is genuinely architectural** and I executed the retirement under protest. It is `contested: true`, human-ratified at Gate E after two measured revisions, and it constrains `.dependency-cruiser.js` — which `CLAUDE.md` §2.3 makes NON-NEGOTIABLE tooling. It does not describe code shape; it defines what *outside-in* means operationally for every property test, and its deciding evidence is a negative result (widening the rule does not work). arc42 §8.5 carries the clauses, so nothing is lost operationally — but by the human's own bar, "important decisions" covers this one.

**ADR-0023 is a second ADR-0031-shaped case, and nothing flagged it.** It does not stand alone: it narrows one sentence of ADR-0018's Consequences, and ADR-0018 survives, is immutable, and is the most-cited ADR in the log. *"Every write path to `appointment` must take these two locks"* is **wrong about cancellation**, and ADR-0023 is the correction. ADR-0030 cites it four times. I handled it the way the brief handled 0031 — `05-design.md` §2.1 opens by naming which sentence it narrows — but its mapping record has to do the same repair job.

## Budgets

Every ceiling met; none raised. Two findings:

1. **The corpus is saturated.** Available headroom across the nine destination designs was ~390 words against ~1,900 of compressed decisions. Every fold was paid for by deletion, not by slack. What I deleted was duplication with a real other home: the finding text in rulings tables (`DEFECTS.md` is generated from the log with severity, role and the ruling verbatim), per-file mutation scores (`events.jsonl`), and the *"what step 7 moved / what paid for it"* sections in slices 04–08, which narrate the condensation rather than the system.

2. **arc42 §11.1 loses five rows from its generated debt register** — a `proposed` ADR is one of the two shapes it reads, and five of the seventeen were proposed. §11 had zero headroom, so I compressed ~70 words out of it to record the loss in prose: where such a record said a decision was ruled by the architect and never put to the human, its design says so now.

## Dangling pointers the mapping records must repair

`docs/adr/0030-…md` is immutable and cites **ADR-0023 ×4 (lines 22, 72, 75), ADR-0027 ×1 (line 31), ADR-0029 ×1 (line 82)**. That is the complete set among surviving ADRs. The two `_sample-*` files stay put by instruction; `_sample-0032-rewrite.md` now cites a file that no longer exists, which is deliberate — its whole subject is how ADR-0032 read.

## Mapping records

17 records, validated JSON, at `/tmp/claude-1000/-home-agentadmin-sources-keyloop-challenge/a54ca961-193c-4c22-bd90-a48d6d802c53/scratchpad/mapping.json` — one per retired ADR with `adr`, `title`, `decided_what`, `now_lives_in`, `notes`. Log citation counts per record: 0011:1, 0012:0, 0013:16, 0014:9, 0015:13, 0017:1, 0020:16, 0021:11, 0022:3, 0023:14, 0026:14, 0027:7, 0028:4, 0029:12, 0031:16, 0032:10, 0033:8 — 155 total. I did not write to the log.
