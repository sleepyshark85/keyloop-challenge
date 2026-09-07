# Prompt · slice 08 · architect · invocation 7

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Retire 17 non-architectural ADRs
- Sent: 2026-09-07T10:03:40.252Z

---

# ADR retirement — the human's ruling, now being built

Working directory `/home/agentadmin/sources/keyloop-challenge`. **Branch `chore/adr-retirement` is already created off `main` at `172a846` — work there.** Slice 08 is merged and done; this is process work, not a slice.

## The ruling you are implementing

The human read ADR-0032, then the whole set, and ruled (logged as `gate.decided`, `s-08-gate-process-adr`): most ADRs are *hard to follow*, it is *not clear what is being decided or how it affects the application*, they *cross-reference other parts like defects, which makes it harder still* — and, decisively, **many are below the bar where a decision warrants an ADR at all.** Their words: *"I'm not saying this ADR is trivial, but it doesn't seem to be in the level of decision that require an ADR (where I think only important decisions should be addressed)."* Then: *"I think we can just remove them (and make sure they are recorded in the slice designs)."*

**Retire these 17:** `0011 0012 0013 0014 0015 0017 0020 0021 0022 0023 0026 0027 0028 0029 0031 0032 0033`. The other 16 survive untouched — **do not edit them**, their form is a separate discussion the human has explicitly deferred.

## What "retire" has to mean, given this project's own rules

`CLAUDE.md` §4 says ADRs are immutable and the history of how thinking changed is the point. The human has overridden that for these 17. **The override is of the file, not of the history** — so a retired decision must still be findable, and every existing citation must still land somewhere true.

Three populations of reference, and they are not the same problem:

1. **~160 references in `docs/`** (arc42, slice files, other ADRs, METHODOLOGY). These are editable. Each must be rewritten to point at wherever the decision now lives.
2. **118 citations in `docs/team-log/events.jsonl`**, which is **append-only and must not be rewritten** — O-36 settled that precedent. These can only be served by a **new appended mapping record per retired ADR**, saying what it decided and where that decision now lives. Return those records to me as structured data; **I append them, not you** (§9: the orchestrator alone writes the log).
3. **The surviving 16 ADRs may cite retired ones.** They are immutable, so you cannot edit them to fix a dangling pointer. Where that happens, the mapping record is the only repair — say so explicitly in your report.

## Where each decision goes

Into the **slice design** that owned it (`docs/slices/NN-design.md`), as the human asked. Slice-frontmatter `adr:` lists give these homes:

```
0014, 0015 → 02      0023 → 05, 07     0026, 0027 → 06, 07     0028 → 06
0029 → 07, 09        0031 → 07         0032, 0033 → 08
```

Seven have **no slice claiming them** and you must establish each home rather than guess: `0011 0012 0013 0017 0020 0021 0022`. Log-citation counts hint `0011→02, 0013→01, 0017→02, 0020→04, 0021→04, 0022→04`, and **`0012` appears nowhere in the log at all** — treat these as leads to verify, not answers. If a decision has no honest slice home, say so rather than forcing one; §11 or `docs/arc42/` may be the truthful destination for some.

**ADR-0031 is the special case and must not simply vanish.** It is the correction that made ADR-0030 *true* — a move must lock the pair it leaves, not only the pair it takes. ADR-0030 **survives and is immutable**, so you cannot fold 0031 into it. Its content goes into slice 07's design as part of 0030's story, and its mapping record must say plainly that 0030 as written is incomplete without it.

## Form

The human chose this explicitly, so do not deviate:

- **Retired ADRs get no "What changes in the application" section** — the slice design already describes what the application does, and that is the whole reason they fold in there.
- The two sample rewrites, `docs/adr/_sample-0032-rewrite.md` and `docs/adr/_sample-0018-rewrite.md`, show the *prose* standard the human approved: state the decision in plain terms before any section number, and **replace a cross-reference with the fact it points at** rather than making the reader chase it. Apply that standard to what you write into the designs. The samples themselves stay where they are.
- What lands in a slice design should be **what was decided and why, and what it constrains** — compressed, not the ADR pasted in.

## Budgets, which will bind

`docs:budget:check` runs with `--ratchet`, and a merged slice's design ceiling is **1200 words** — several are already at it (slice 08's is at exactly 1200). Adding 17 decisions into designs will collide with that immediately. **Do not raise a budget to fit.** Compress, or put the content where it truly belongs. If a ceiling genuinely cannot hold a decision that has to live there, stop and report it as a finding rather than inflating the number — the budget being wrong is a legitimate finding; quietly raising it is not.

## Verify before you finish

All four must be green, and the first two are the ones this change will break:

```
npm run docs:refs          # dangling citations — the main risk
npm run docs:adr-check     # invariants over the ADR set
npm run docs:check
npm run docs:budget:check
```

Then `npm run test:tools` (21 suites). Commit in **logical commits, not one** — Conventional Commits, `docs(adr):`. **Use explicit pathspecs, never `git add -A`**: I swept your last ruling into a tooling commit that way (O-65) and I would rather not have it happen in reverse. Push the branch; **do not open the PR** — I will, so the description carries the human's ruling verbatim.

## Return

- The mapping records, as structured JSON, one per retired ADR: `{ adr, title, decided_what, now_lives_in, notes }`. I append them.
- Which of the seven unclaimed ADRs you placed where, and on what evidence.
- Any decision you judged **should not** be retired after reading it — the human ruled on the set, and if one of the 17 is genuinely architectural you should say so rather than execute silently. Disagreement is expected and is not failure (§6).
- Any budget you could not meet.
