# Prompt · slice 19 · architect · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Design slice 19 and ADR-0040
- Sent: 2026-09-10T09:15:05.522Z

---

You are the architect on keyloop-challenge (/home/agentadmin/sources/keyloop-challenge), branch `slice/19-attempt-cap-sized-against-occupancy`. **This is your second dispatch on `H-19-1`.** You ruled last time; §6 step 5 of "Adjudication is reasoned before it is applied" says *"Only then is the design amended, in one pass, with the rulings attached."* This is that pass. Now you write.

Your ruling is recorded in `docs/team-log/events.jsonl` (`s-19-finding-1-ruled`, `s-19-dcr-1`) and the defect register regenerates from it. Nothing in it was overridden.

## What the orchestrator did with your ruling

`docs/slices/19-attempt-cap-sized-against-occupancy.md` is **rewritten** and applies all seven of your AC rulings (AC-1 sharpened, AC-2 numbered, AC-3 split into 3a/3b, AC-4 carrying QS-16's tuples, AC-5 widened, AC-6 and AC-7 added), your `arc42:`/`adr:`/`quality_scenarios:` corrections, your reschedule ruling, and both corrections you made **against** the orchestrator:

- *Out of scope* no longer claims raising the cap merely moves the refusal. It now says a cap at or above `|bays| + |technicians|` makes it **structurally unreachable** and is declined on **latency**, staying available to the gate as one config value.
- *Out of scope* no longer claims Order-D is "still given up". It now says free-first **is** load-aware allocation at binary granularity, and what stays given up is continuous utilisation ordering.

**Read that file first and say so in your report if I misapplied any ruling.** It is the orchestrator's file — tell me, do not edit it.

Two claims of yours I verified independently, both correct: `candidate-retry.test.ts:304-305` is `seedScenario(…, {bays: 17, technicians: 17})` then `blockPairs(…, 17, …)`, so all 17 of each are blocked; and `docs/arc42/11-risks-technical-debt.md:172` carries R-4 verbatim as you quoted it.

## Write these, and only these

1. **`docs/slices/19-design.md`** — step 1 design, in the house form (see `docs/slices/16-design.md`): what changes · building blocks touched · interfaces · data-model delta · rulings · applicable §10 scenarios · proposed arc42 edits. It must carry:
   - The exact signature of `orderCandidates` after the change, and how `busy` is threaded from `bookAppointment` through `runAttemptLoop`'s `CandidateStrategy` — naming the `'incumbent'` arm and your empty-busy-set ruling for reschedule.
   - The partition-then-shuffle-within-group algorithm precisely enough that the implementer cannot get the de-synchronisation wrong, including that **both groups draw from the same seeded stream** and that survivors keep their order under `prune`.
   - `src/domain` imports **nothing** (`.dependency-cruiser.js` `domain-is-pure`, `to: {}`). `busy` arrives as a parameter. Say how the carrier stays non-empty-by-construction — `CandidateOrder` is `readonly [string, ...string[]]` and `orderCandidates`/`prune` are its only minting sites.
   - Your rulings from dispatch 1, attached: the (b) letter and why (c) was not reachable; supersede-not-amend and exactly what carries forward; cap stays 16; the `capped` signal restored **probabilistically, not structurally**; the reschedule empty-busy-set ruling; the backlog-ordering scope ruling, marked **provisional until the gate**.
   - **Objection 6 stated as the live risk it is**, in your stronger form — ADR-0004's never-refreshed snapshot front-loading, for every loser, the resources the winners just took — with QS-16 named as its falsifier and the loopback pre-committed if it fails.

2. **`docs/adr/0040-<slug>.md`**, `status: proposed`, `supersedes: "0009"`. Follow `docs/adr/_template.md` and the house bar: only decisions that matter, no implementation detail, an option set with real alternatives argued on merits. It must contain, per your own ruling: **raising the cap as a genuine option rejected on latency, not dismissed**; free-first named as coarse load-aware allocation, reopening ADR-0009's Order-D rejection honestly; the two ADR-0009 Consequences that become false; and the residual you refused to declare closed. Fill `ai-input` honestly — the human raised the cost question, the orchestrator derived the cap consequence and produced both measurements, you ruled and are ratifying under standing delegation with the human AFK. Note in it that this remedy's shape was fixed once before, in the retired ADR-0033 at slice 08 step 1, and lost in the 2026-09-07 cull.

3. **Set `superseded_by: "0040"` in `docs/adr/0009-*.md`.** Frontmatter only. §4: its decision and prose stay untouched.

4. **arc42 §10 — add QS-15 and QS-16** exactly as you specified them, so the test-engineer can cite them at step 3. Give them their `tests/` paths.

**Do NOT edit** arc42 §4.1, §11 R-4, §5.2, §6.2 or §8.4 now — propose those edits in the design and reconcile them at step 7, which is the house pattern. **Do NOT touch anything under `src/` or `tests/`** — the `candidate-retry.test.ts` comment correction in AC-5 is the test-engineer's.

## Then commit

Conventional Commits, referencing the slice: `docs(19): the design, ADR-0040, and the rulings that shaped it` or better. Attribution footer:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tt2bAYr18YJJMNjQwaAmRA
```

Commit **only** your own files plus the orchestrator's already-written `docs/slices/19-attempt-cap-sized-against-occupancy.md`, `docs/team-log/events.jsonl`, `docs/team-log/prompts/` and `docs/DEFECTS.md`. **Leave `docs/STATUS.md` alone** — it is stale from an earlier commit and is a separate chore. Run `npm run docs:check`, `npm run docs:adr-check` and `npm run log:check` before committing and report what they said; if `docs:adr-check` wants its baseline re-pinned because the ADR set changed, do it and say so.

## Report back

- Whether the orchestrator misapplied any ruling.
- The `orderCandidates` signature you settled, verbatim.
- Anything you changed your mind about between dispatch 1 and now, and why.
- What you want the test-engineer told at step 3, and what you want the implementer told at step 4 — I will pass these on verbatim.
- The commit sha.
