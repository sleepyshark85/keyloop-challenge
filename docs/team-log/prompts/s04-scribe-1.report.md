# Report · slice 04 · scribe · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: README and the AI collaboration narrative
- Returned: 2026-09-06T06:19:16.439Z
- Duration: 669s

---

Done. Commit `ee868c3`, two files, nothing else touched.

## What I wrote

**`/home/agentadmin/sources/keyloop-challenge/README.md`** — new, 989/1500 words. Prerequisites (engines range, Docker for Testcontainers), `npm ci` → `docker compose up -d` → `db:migrate` → `npm start`, the three routes, a command-by-command test table with what each covers, the ownership-by-path rule, the process commands (`status`, `board`, `log`, `defects`, `slice:check`, `docs:budget`), and the required **AI Collaboration Narrative** at 382 words. Every command verified against `package.json` rather than assumed — `npm test` is `tools/ci/run-tests.mjs`, not `vitest`, and I explain why in one sentence because that split *is* the T-01-2 ruling.

**`/home/agentadmin/sources/keyloop-challenge/docs/arc42/13-ai-collaboration.md`** — 144 → 1500/1500 words, all six subsections filled.

`docs:budget`, `docs:budget:check` (ratchet), `docs:refs` and `test:tools` all green.

## Strongest evidence found

- **The recurring shape, countable.** Eight in the pilot plus seventeen since, each named by ref (`R-5`, `R-10`, `T-01-2`, `O-14`, `O-17`, `O-19`, `O-20`, `O-24`, `O-25`, `O-27`, `O-31`, `O-32`, `O-33`, `R-02-1`, `AB-01-5`, `AB-01-7`, and the ADR guard printing *"every considered option and chosen option survives"* over a file it never opened). The project's own counters say **five, seven, eight and nine** in four different files — each counting a different set. I left that standing and said so, rather than picking one.
- **The operational rule's provenance.** First written by the architect against its *own* work — `docs/team-log/prompts/s00-architect-1.report.2.md:68`, *"I had the technique, used it on the constraint, and did not turn it on my own test steps"* — then codified in the retro, injected into all four slice-01 prompts, then into test comments (`tests/property/instant-bounds.test.ts:47`, `tools/test/token-capture.test.mjs:13`), then made a gate bar (`s02-implementer-2.md:60`: *"name the mutant — I will run it"*). It was even turned on a report whose subject was that failure mode (`DEFECTS.md:564`).
- **Disagreement that changed outcomes**, all four cases confirmed: T-01-1 (test-engineer upheld by the human against the architect's reading), O-5 (implementer showing a BLOCKING 0.0634 was a harness artifact; true baseline 76.06), the (b) ruled against preference — *"I would rule the same way if I disliked the answer"* — and the reviewer's byte-identical 747/11/32 survivor set.
- **Cost.** Both time columns given because neither is the cost: summed duration overstates (24 of 42 pilot runs carry `duration_caveat`), elapsed counts idle gaps. Slice 00's elapsed is **5.3 h** against a summed **30.7 h** — the two disagree by 6×, which is the honest headline.

## What I expected to cite and could not

1. **There is no ADR supersession chain.** §6 says a (c) ruling supersedes the ADR. All 21 ADRs carry `supersedes: null` and `superseded_by: null`. Both (c) rulings dodged it for defensible reasons — T-01-2 had no ADR to supersede, T-02-9 *produced* ADR-0018 — but the constitution's own remedy has never once been exercised, and my brief assumes it has. I gave §13.4 the heading *"the supersession chain that does not exist"* rather than implying one. **This is the most useful thing I found: a §6 clause with zero instances after four slices is either dead or about to be reached for the first time under pressure.**

2. **No vote has ever been called.** §6.4's third-role tie-break — *"the architect may call a vote"* — has zero occurrences in the log, in any report, or anywhere in `docs/`. Every disagreement resolved in one round or went to the human. Also unexercised.

3. **`review.response` is thinner than it reads.** Only 3 records exist (2026-09-05 test-engineer, 2026-09-06 test-engineer and implementer at slice 04). The step-2 AGREE rounds at 00a, 00 and 01 produced no `review.response` events at all — those objections are only recoverable as `finding.raised` pairs and prompt files. So "how a design was argued into shape" is reconstructable, but not from one event type.

4. **`docs/video-shotlist.md` does not exist** and I did not write it — outside the task's scope, but it is on my owned-files list.

5. **Cost per *role* across the project is derivable but not billed.** `tokens` carries `{in, out, cache_read, cache_write, thinking}`; there is no price field anywhere, and `R-5` is why no dollar figure appears. Slice 01's headline figures also moved after they were ruled on — 15 runs/9.5 h/8.30 M at the light-gate ruling, 19 runs/11.1 h/10.69 M now, because of `O-20`. I reported both numbers rather than the current one alone.
