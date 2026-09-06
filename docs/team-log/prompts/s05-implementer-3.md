# Prompt · slice 05 · implementer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Build R-02-3 — the response whitelist
- Sent: 2026-09-06T10:57:35.499Z

---

Build **R-02-3** as one unit case. Branch `slice/05-cancellation`, PR #14, CI green. The test-engineer is building R-02-2 in `tests/integration/` in parallel — stay out of it.

**This came out of a genuine disagreement that has now been settled by measurement, so you are building the agreed thing.** The reviewer said R-02-3's surviving mutant at `src/http/routes/appointments.ts:210:19` was **unkillable without a production change** and should be closed with that reason. The architect disagreed and probed `dist/` through the real `buildServer`. The reviewer then reproduced the probe itself, **withdrew**, and said the refuting evidence had been inside the diff it was auditing.

**What the measurements established, all of it verified twice:**

- A `found` view stubbed with two undeclared members renders through the baseline as **exactly the ten schema members**; with the `response` map emptied (`response: {}`) it renders **twelve** — both extras emitted.
- The case needs **no production change and not even a cast**: `const WITH_EXTRA = {...VIEW, internalNote}` assigned to an unannotated const typechecks clean under `--strict --exactOptionalPropertyTypes`, because TypeScript's excess-property check only fires on fresh literals at the use site.
- `serverAnswering({ read })` at `tests/unit/http/appointments.test.ts:63` already does exactly this injection.

**And the reason this is worth building rather than a formality invented to kill a mutant** — the reviewer pulled `statusReason` for all three sibling response maps:

| mutant | route | status | killed by |
|---|---|---|---|
| `133:46` | POST | Killed | `appointments.test.ts:730` |
| `255:19` | cancel | Killed | `appointments.test.ts:422` — **added this slice, by you** |
| `210:19` | **GET** | **Survived** | — |

**The whitelist control already exists on two of three routes, both stubbing an undeclared member. The GET route is the sole gap**, and `210:19` is exactly its residue. You wrote `:422` this slice; this restores the same control on the one route ADR-0019 pointed at.

The property to assert is the one your own `:422` comment states: **the response schema is an output whitelist, not merely a document.** A member the 200 schema does not declare is stripped.

**Two things to get right:**

1. **Verify the mutant dies.** Stage `response: {}` on the GET route, run your new case, confirm it fails, restore. You did exactly this at step 4 for the schema mutant you predicted and killed — same discipline. Report the before/after.
2. **Do not assert key order.** The reviewer noted in passing that the POST mutant also differs in key ordering (`fast-json-stringify` vs `JSON.stringify` insertion order). That is incidental and would be a brittle pin. The whitelist is the real kill.

**Constraints.** `tests/unit/` is yours. No outside-in test directories — §5, NON-NEGOTIABLE. No `src/` change should be needed; if you find one is, that refutes the measurement both roles reproduced, so **stop and tell me** rather than making it. `tsc --noEmit` before the commit — a green unit run is not a green commit. One commit, `test(05):` or `feat(05):` as appropriate, small.

**Report** the standard JSON plus the staged-mutant before/after, and anything you found while in there.
