# Report · slice 16 · architect · invocation 5

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 16 AC-3 wording
- Returned: 2026-09-10T02:43:49.754Z
- Duration: 196s

---

Done. Nothing committed; my working-tree changes are confined to the two slice documents.

## MINOR — AC-3 corrected, outcome (a)

`/home/agentadmin/sources/keyloop-challenge/docs/slices/16-availability-derives-its-own-window.md`, AC-3 now reads:

> …the operation declares exactly three problem types and no `500` (I-02-5): `/problems/malformed-request`, `/problems/outside-opening-hours`, `/problems/unknown-reference`.

The criterion was wrong, not the code — the emitted document, `tests/contract/openapi-document.test.ts:348` and ruling 6 all agreed on three. Adding the `(I-02-5)` citation makes the absent `500` deliberate on the face of the criterion rather than something a gate reader has to reconstruct. **The edit is word-neutral: the file holds at 796 of 800.** No `--rebaseline`, no `500` entry.

## MAJOR — ruling 6's premise: conceded, decision stands, no DCR

Recorded at `/home/agentadmin/sources/keyloop-challenge/docs/slices/16-design.md` as a dated correction under ruling 6 (+184 words; design now 2995/3000). Three points:

1. **The premise was false and the omission is mine.** `tests/contract/error-taxonomy.test.ts` has zero occurrences of `availability`. That net is enumerated per operation; it covered the two pre-existing sites and does not extend itself to a third. Ruling 6 treated an existing net as automatically covering a new site, and should instead have booked the row as a step-3 obligation.

2. **The decision itself is untouched by the measurement.** Sharing the symbol would not have changed what the reviewer measured: delete the arm, the outcome falls to `default:`, throws, and `server.ts` renders the same status, `type` and `title` — a shared `INTERNAL` would be equally unobserved. The gap is in the test set, not in the const's construction, so the remedy is exactly where the reviewer put it and there is no (c) to name.

3. **A residual the row does not close, flagged before it lands.** The contract-test row makes the three sites' agreement asserted rather than assumed — which is what ruling 6 claimed — but it still passes against the deleted arm. What separates a handled fault from an escaped exception (arc42 §8.4, error log + ERROR span) is distinguished by no test at any of the three `/problems/internal` sites, `appointments.ts:484` included. That is repo-wide and older than this slice, so it is **one §11.1 debt row at step 7**, not work in slice 16.

## Checks

| Check | Result |
|---|---|
| `docs:check` | pass — current, 13 sections, 22 ADRs |
| `docs:refs` | pass — 117 identifiers cited, all defined |
| `docs:adr-check` | pass — 22 ADRs, every option survives |
| `docs:budget:check` | pass (`--ratchet`) — 796/800 and 2995/3000 |

Reasoning posted to PR #24: https://github.com/sleepyshark85/keyloop-challenge/pull/24#issuecomment-5611860704

```json
{
  "role": "architect",
  "outcome": "adjudicated",
  "arc42_sections_touched": [],
  "adrs": [{"id": "0039", "status": "proposed", "supersedes": null}],
  "quality_scenarios": [],
  "assumptions": [],
  "open_questions": ["Handled-fault vs escaped-exception is unasserted at all three /problems/internal sites; booked for a §11.1 row at step 7"],
  "dcr_ruling": "(a) clarification — AC-3 named four problem types where the contract, the tests and ruling 6 all say three; corrected word-neutrally",
  "message": "AC-3 fixed within the 800-word ceiling. I concede ruling 6's premise was false for the third site and say so in the design record, but the decision stands: sharing INTERNAL would not have made the arm observable, so the remedy is the missing contract-test row and no DCR follows."
}
```
