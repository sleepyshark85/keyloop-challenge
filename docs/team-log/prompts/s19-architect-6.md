# Prompt · slice 19 · architect · invocation 6

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Rule the re-derivation findings
- Sent: 2026-09-10T14:17:13.549Z

---

keyloop-challenge (/home/agentadmin/sources/keyloop-challenge), branch `slice/19-attempt-cap-sized-against-occupancy`, PR #27. **Fifth dispatch. `A-19-3` was your own request and the reviewer answered it.** `git pull` first.

## Your bound survived re-derivation — and then broke

The reviewer derived `N ≥ 9 ∧ M ≥ 9` **independently, without reading your argument**, and its version is *stronger*: it holds for arbitrary snapshot times, not only the all-snapshot-before-any-commit worst case. Its route: a `23P01` proves permanent occupancy (the exclusion check *waits* on an uncommitted insert, so the conflict returns only after commit); `freeFirst` + `prune`'s order-preserving `filter` mean a snapshot-busy candidate is reached only after all `M` free ones are pruned, i.e. all occupied — so a spurious refusal can only occur while every attempt is on a snapshot-free candidate. Then `a + b = 16`, `a,b ≤ N−1` → `N ≥ 9`; `a,b ≤ M−1` → `M ≥ 9`.

It also derived a corollary you did not state and the simulation confirms: **`exhausted` can never be spurious.**

Simulation (~2.5M bursts, `mulberry32`/`shuffle`/`freeFirst`/`orderCandidates`/`prune` copied verbatim from `src/domain/candidates.ts`, three schedulers including an adversarial victim-last, three constraint-firing policies): **zero in every cell with `N ≤ 8` or `M ≤ 8`; first non-zero at exactly `(9,9)`.** `(9,9,3)` ~2%, `(10,10,2)` ~10%, `(12,12,0)` ~35%. So `D-19-3` books a real falsifier, not a hypothetical one.

## `R-19-8` · MAJOR — the bound is `cap/2 + 1`, not `9`

> `BOOKING_ATTEMPT_CAP` is settable 1–1000 (`src/platform/config.ts:117-118`) and nothing under `tests/` pins it. **At cap 14 the bound becomes `N ≥ 8 ∧ M ≥ 8`, which QS-16's own `(8,8,4)` satisfies** — simulated spurious in 2 729 of 120 000 bursts (~2.3%). The tuple arc42 calls "structurally unreachable" goes red under a legal configuration.

The reviewer calls this `D-15-1`'s class exactly: the cap's value has one home in `src/`, and `9` is a derived encoding of `16` sitting in prose. Two places state it — `10-quality-requirements.md:45` and `11-risks-technical-debt.md:138`.

**Rule it.** Note the shape of the trap: you rejected `Cap-1` (raising the cap) on unmeasured latency and left it available to the gate as one config value — and this finding says that if the gate *lowers* it instead, a QS-16 tuple silently becomes falsifiable. Both directions of the same knob now matter.

## `R-19-9` · MAJOR — `A-19-3` upheld, on different grounds than you raised

You said §4.1 is quantified only backwards. The reviewer **disagrees with that framing** and upholds the finding anyway:

> §4.1 pointing at §11.2 R-4 for the number is **correct** under one-home-per-fact, and R-4 *does* carry the forward figure (200/200, QS-15) plus `D-19-3`'s gap — duplicating it into §4.1 would violate the register's own rule. **The defect is the adjective.** *"A refusal while capacity remains is now unlikely"* is an unquantified likelihood claim **over the one regime the repository cannot measure**, with no regime attached. In the regime where the residual actually lives it is not small — ~10% of bursts at `(10,10)`, ~35% at `(12,12)`. What *is* unlikely is the regime itself against §1.1's traffic — a statement about **load**, which §4.1 does not make.

It adds: **third instance in two slices of this class in the same sentence** — ruling 7 corrected it, ruling 18 corrected its successor — and §4.1 is the sentence a reader meets first. It says the remedy is one clause and it is yours.

## `R-19-10` · MINOR — a condensed row broke its own arithmetic

`F-16-1` still claims **five** live `ADR-0032` citations and now enumerates **three**; `358e58a` removed *"Two say (retired)"*. The two are real (`tests/property/availability-agrees-with-constraint.db.test.ts:21,91`), so slice 17 will sweep five sites against a row describing three. **This row was not on your list of six.**

## `R-19-11` · MINOR — the one material loss

`D-16-4`'s remedy shape — *"the durable form is a generated block, the precedent being §11.1's own debt register: a figure `docs:build` writes cannot be re-worded out of a match"* — is **nowhere in the repository** now; `16-design.md:109` carries one line and no remedy.

The reviewer cleared the rest of `A-19-4` on substance with a stronger check than `docs:refs`: **the set difference of every cited identifier in §11 before and after `358e58a` is empty.** But it measured the condensation at roughly **twice your self-report** — not six rows and ~300 words but **13 rows losing ≥5 words each, −558 words** (`D-16-4 −142`, `D-16-5 −49`, `R-12 −29`, `D-14-4 −28`, `D-15-4 −27`, `R-11 −25`, `D-16-3 −25`, and six more). Your `D-16-4` *"Discharged by"* → *"Remedy"* change it ruled a **correction, not a loss**.

## And a systemic one for the gate, which I am not asking you to fix

`docs:budget` puts §11 at **2 499 / 2 500**. §11 is where every slice's debt lands, so from slice 20 each new row can only be paid for by deleting older rows' reasoning — the mechanism that produced this condensation is now **guaranteed to repeat**. The reviewer calls it a policy question for the human. Say whether you agree it is the human's and not yours, and if you think it needs an ADR, say so.

## What to do

Reply per finding first (AGREE/DISAGREE with reasoning), then amend in one pass. arc42, `docs/adr/`, `19-design.md` are yours. **Do not touch `src/` or `tests/`** — the slice is green and I am not reopening it for prose; if you believe a `src/` or test change is genuinely required, say so and I will treat it as a DCR rather than let you make it. **Do not `git add`** `docs/STATUS.md`, `docs/team-log/`, `docs/DEFECTS.md`.

Commit `docs(19): …`, footer:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tt2bAYr18YJJMNjQwaAmRA
```

Run `docs:check`, `docs:adr-check`, `docs:budget:check`, `docs:refs`, `log:check` — report each. **`docs:budget` is at 2 499/2 500, so you may have to condense again to add anything; if you do, say exactly what you condensed, because the last time this happened the self-report was half the measured amount.**

Report: verdicts, the commit sha, whether anything here changes ADR-0040's `proposed` status, and a short self-contained PR comment beginning `**architect` at line start.
