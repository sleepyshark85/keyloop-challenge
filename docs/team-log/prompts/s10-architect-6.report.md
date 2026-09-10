# Report · slice 10 · architect · invocation 6

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Refresh §6.1 diagram, add §6.2
- Returned: 2026-09-09T03:15:26.704Z
- Duration: 1137s

---

Done. Five figures, all exported and committed.

## Files changed

| File | What |
|---|---|
| `/home/agentadmin/sources/keyloop-challenge/docs/arc42/06-runtime-view.md` | five figures added/corrected, caption convention fixed, three prose cuts |
| `/home/agentadmin/sources/keyloop-challenge/docs/diagrams/concurrent-booking.html` + `.svg` | **corrected** — now draws the locks |
| `/home/agentadmin/sources/keyloop-challenge/docs/diagrams/candidate-pruning.html` + `.svg` | new, §6.2 |
| `/home/agentadmin/sources/keyloop-challenge/docs/diagrams/reschedule-lock-union.html` + `.svg` | new, §6.3 |
| `/home/agentadmin/sources/keyloop-challenge/docs/diagrams/cancellation-scope.html` + `.svg` | new, §6.4 |
| `/home/agentadmin/sources/keyloop-challenge/docs/diagrams/availability-composition.html` + `.svg` | new, §6.5 |

Commit `a5e694f`, by explicit pathspec. No `src/`, no `tests/`, no ADR, no team-log write, board untouched.

## Checks

```
npm run docs:budget:check   exit 0   (silent — nothing grew past its ceiling)
npm run docs:refs           exit 0   97 identifiers cited, all defined across 11 slice designs
npm run docs:check          exit 0   system-design.md is current (13 sections, 18 ADRs)
```
Per diagram, `self_check.py` **OK** and `verify-geometry.py` **0 findings** (5/5). `verify-geometry.py` is not in the installed skill's `scripts/`; it lives one level up at the plugin cache root — found and run there.

## Word arithmetic — 1196 → **1187**

**The brief's premise was wrong and you should know which way.** The ratchet ceiling is `max(budget, baseline)` (`budget.mjs:276`), i.e. `max(1500, 1196) = 1500` — there were 304 words of headroom, not zero. I paid inside the recorded baseline anyway and ended 9 words below it, so the baseline is untouched and a future `--rebaseline` can still tighten.

Spent: +16 for the convention sentence, and four new figures at ~12 each (short alt + `*Source: […]*`). Recovered:

| Cut | Words | Which figure made it redundant |
|---|---|---|
| §6.1 "One `pg_advisory_xact_lock` per bay and per technician now precedes each attempt, so every loser conflicts with a **committed** row and the reported constraint is deterministic" → "The two locks the figure draws buy that verdict and nothing else" | ~16 | `concurrent-booking` — the lock, the wait, the commit, the conflict-with-committed are now all drawn |
| §6.1's 33-line ASCII block | 0 (fenced code is free) | same — deleted as *editorially* redundant, not to buy words |
| §6.3 "the pair it leaves re-read inside the attempt's own transaction under the row's lock: row lock, advisory locks, write. `(class, hashtext(key))` total-orders…" → one compressed clause | ~17 | `reschedule-lock-union` steps 2–3 and the union panel |
| §6.4 ", a cancelled row satisfying no constraint's `WHERE` and leaving nothing to serialise" | ~14 | `cancellation-scope`; and the *next* paragraph already said it — an in-section duplication |
| §6.5 "may be stale before the response is serialised … and it is about **exactly the window queried**" → shortened | ~14 | `availability-composition` (the answer box and box B's sublabel) |

§6.2's ASCII is untouched, as instructed; its figure sits above it.

## Judgement calls a reviewer should see

1. **§6.1 lost the two User actors.** It had four lifelines with one `Scheduler`; a single scheduler lifeline cannot show one request blocked while the other proceeds, and that blocked span *is* ADR-0018. It is now `Request R1` / `Request R2` / `PostgreSQL`, with `201` and `409` as terminal badges at the foot of each request lifeline rather than returns to actors. 11 messages, one under the sequence budget.
2. **§6.2 is not a flow chart of the loop.** It is an elimination ladder in state-machine grammar — the states are the candidate set, the transitions are database verdicts — because the subject is the lists shrinking. The 23P01 arm is drawn **once** as an annotation panel with no connector, following `type-state`'s "use a single annotation, don't draw it from every state"; that also kept the layout free of backward connectors.
3. **I drew §6.4.** Scope/containment only, no flow, as you specified: the constraints' `WHERE` as a dashed region, three confirmed rows inside, one statement carrying `a-2` out of it.
4. **Shared vocabulary is deliberate and load-bearing.** Coral means `23P01` in every diagram that has one and nothing else ever takes it; §6.1 gained the prune notation `prune bay B1 → list empty → exhausted` so R2 reads as §6.2's loop in its degenerate case; §6.3's verdict panel routes `23P01` explicitly back to "the §6.2 arm".
5. **No rasterizer on this machine** (no `rsvg-convert`, `inkscape`, `chromium`, `cairosvg`), so there is no pixel-level proof. Text fit was verified by arithmetic against box widths at Geist Mono's 0.6em advance, and two overlong lines in `reschedule-lock-union` were trimmed after that check; the two validators cover the connector and accessibility contracts. A human eye on the five SVGs at the gate is still worth having.
6. **`docs/team-log/events.jsonl` was already modified in the working tree when I started** and is not mine; I left it alone and it is not in my commit.

```json
{
  "role": "architect",
  "outcome": "reconciled",
  "arc42_sections_touched": ["§6.1", "§6.2", "§6.3", "§6.4", "§6.5"],
  "adrs": [],
  "quality_scenarios": ["QS-6", "QS-8"],
  "assumptions": [],
  "open_questions": [],
  "dcr_ruling": null,
  "message": "Corrected the §6.1 sequence to draw ADR-0018's locks and the loser's blocked span, and added figures for §6.2 through §6.5. Paid for five captions inside the recorded baseline — 1196 to 1187 — by stating the regeneration command once and cutting three sentences the figures made redundant; the ratchet ceiling is in fact 1500, not 1196."
}
```
