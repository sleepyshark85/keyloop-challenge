# Report · slice 05 · reviewer · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: R-02-3 disagreement — your one answer
- Returned: 2026-09-06T10:56:53.442Z
- Duration: 456s

---

I probed everything myself. Here is the verdict.

## 1. The architect's measurement is right. I withdraw that half.

I rebuilt `dist/`, made three copies, and applied the `ObjectLiteral "{}"` mutant to each response map separately, then drove all three through the real `buildServer` via `app.inject`.

`GET /appointments/{id}`, `found` view stubbed with two undeclared members (`createdAt`, `internalNote`):

- **baseline** → 200, exactly the ten schema members
- **mutant (`response: {}`)** → 200, **twelve** members, both extras emitted

The unit case needs no production change and — I checked — not even a cast. `const WITH_EXTRA = {...VIEW, internalNote}` assigned to an unannotated const, then handed to the stub, typechecks clean under `--strict --exactOptionalPropertyTypes` (TypeScript's excess-property check only fires on fresh literals at the use site). The route's dep is injectable and `serverAnswering({ read })` at `tests/unit/http/appointments.test.ts:63` already does exactly this.

So **`210:19` is killable by one unit case with no production change.** My "unkillable without a production change" is withdrawn.

**Where I went wrong, plainly.** I tested killability against the *production data path* — `toAppointmentView` (`src/application/bookAppointment.ts:97`) constructs exactly the ten members, so no production input distinguishes the mutant. That part is true, and it is the wrong test. Killability is a property of the suite's reach, not of the data path, and this mutant sits on a seam the unit tier already owns. The refuting evidence was inside the diff I was auditing: `tests/unit/http/appointments.test.ts:422`, added *this slice*, is the same case pointed at the cancel route, and its comment states the architect's argument verbatim — *"without this assertion emptying that schema changes NOTHING observable."* I read that file and did not connect it. That is a miss, not a judgement call.

## 2. "Worth killing" — I accept that too, and there is evidence the architect did not cite

I pulled `statusReason` out of `reports/mutation/mutation.json` for all three sibling maps:

| mutant | route | status | killed by |
|---|---|---|---|
| `133:46` | POST | Killed | `appointments.test.ts:730` — *"a member the schema does not declare is STRIPPED, on the view and on a problem"* |
| `255:19` | cancel | Killed | `appointments.test.ts:422` — *"a member the 200 schema does not declare is STRIPPED"* |
| `210:19` | **GET** | **Survived** | — |

The whitelist property is **already asserted on two of three routes**, by two tests, both stubbing an undeclared member. The GET route is the sole gap, and `210:19` is precisely the residue of that gap. The proposed case is not a formality invented to kill a mutant — it restores a control the file already applies twice, on the one route ADR-0019 pointed at. Build it.

(Secondary: with no extras stubbed, the POST mutant still differs — key *order*, `detail` before `resource`/`reference` under fast-json-stringify vs insertion order under `JSON.stringify`. That is incidental; the real kill is the whitelist.)

## 3. R-05-1 stands, relocated. I accept the relocation, and it is understated.

I measured ADR-0019's premise directly. A `cancelled` view carrying **exactly the ten members** through the GET route:

```
baseline: {"id":...,"status":"cancelled"}
mutant  : {"id":...,"status":"cancelled"}
IDENTICAL: true
```

Byte-identical. **The producibility of `cancelled` does not touch `210:19` at all.** And the mutants ADR-0019 actually argued from — the `status` union at line 111 — are `111:24`, `111:38`, `111:65`, all three **Killed**. The architect's "ADR-0019 misidentified its own mutant" is confirmed on both halves.

So: my conclusion was right, my reason was wrong, and the correct reason is stronger than mine. Mine said the premise was false *because the mutant was unreachable*; the truth is the premise was false *because it named the wrong mutant* — which is worse, since a criterion that cannot identify its own subject cannot be checked at the destination even by someone looking for it.

**One correction upward.** The architect says 0-for-2 on premises. It is **0-for-3**. Slice 05's own deferral named slice 10, and `docs/slices/10-openapi-and-curl-harness.md` carries `folded_into: "09"`, `folded_at: 2026-09-04`, `folded_by: gate-D` — a tombstone two days before the design named it. That is the same premise failure a third time, committed by the criterion's own author while applying it. The criterion is sound and unenforced, as ruled; the enforcement spec (`deferred_to` + `inherits` + `slice:check` failing Ready and Done, plus `docs:adr-check` refusing an ADR that is the only record of a destination) is the right remedy and is the part that actually matters. It is unbuilt, and `tools/` has no owner in this slice — that is the open risk, not the criterion.

## 4. `setNotFoundHandler` at slice 06 — I accept the ruling, and it is stronger than the reason given

First, the ADR is precise where the summary to me was compressed. `0024-…md:73` already says *"the media-type half stops discriminating — only `route-not-found` ≠ `appointment-not-found` still does."* That is the accurate statement, and I have no correction to offer: registering the handler would **not** break `cancel-appointment.test.ts:247` (it stays green — the request reaches the real route), and would **not** reopen the vacuous-green trap (the `type` assertion at `:286` still fails at red against `/problems/route-not-found`). It retires one of two redundant halves. My probe confirms the premise underneath — Fastify's default is `404 application/json {"message","error","statusCode"}`, carrying neither discriminator.

**And there is a structural reason the architect did not name, which is decisive on its own.** `tests/contract/error-taxonomy.test.ts:57` holds `TAXONOMY` as a closed seven-row list. Adding `/problems/route-not-found` moves that file — and `tests/contract/` is **test-engineer-owned under §5**. So the handler cannot land in slice 05 without a test-engineer round regardless of AC-4, because shipping it with the contract taxonomy unamended would leave the closed set asserting a set the service no longer emits. The ruling rests on ownership, not on the architect's judgement of a trade.

**Would I sign off on shipping the known second exit?** Yes. The substance of my finding was that arc42 asserted a totality the system does not keep; ADR-0024 corrects §8.6 **now**, so the overstatement is gone at this gate and what ships is a named, routed gap rather than a hidden one. It fails no AC, no QS and no §2 clause — which is why I filed it MAJOR and declined to block, and nothing I measured today changes that. The one thing I would hold the architect to is that `src/http/server.ts:36` still asserts totality *"is kept"* there; ADR-0024 books that as debt shipping with the handler, and it is the sentence a future reader will trust. It is one docblock in slice 06's first commit.

## 5. Vote

**Not needed.** I concede the killability question outright and accept the relocation; the only thing I add is that the premise record is worse than stated and the enforcement check is the live risk. There is no residual disagreement for a third role to break.

```json
{
  "role": "reviewer",
  "outcome": "approved",
  "findings": [
    {"severity": "MINOR", "file": "docs/adr/0019-defer-a-control-only-to-the-slice-that-makes-it-cheaper-or-stronger.md", "line": 0,
     "claim": "The criterion is 0-for-3 on premises, not 0-for-2: slice 05's own deferral named slice 10, which was already a tombstone.",
     "scenario": "docs/slices/10-openapi-and-curl-harness.md carries folded_into: \"09\", folded_at: 2026-09-04, folded_by: gate-D. Slice 05's design named it as the slice that makes OQ-05-2 cheaper or stronger two days later. The criterion's own author failed its premise while applying it, which is why the enforcement check rather than the criterion is the remedy."}
  ],
  "withdrawn": [
    {"ref": "R-05-1 residue", "claim": "R-02-3 is unkillable without a production change",
     "reason": "Reproduced the architect's measurement on dist/ through the real buildServer: baseline strips two undeclared members, the response:{} mutant emits them. The killing case needs no production change and no cast. I tested killability against the production data path instead of the suite's reach, and the refuting precedent was in the diff I audited (appointments.test.ts:422)."}
  ],
  "upheld": [
    {"ref": "R-05-1 core", "claim": "ADR-0019's premise for R-02-3 was false and went untested",
     "evidence": "A ten-member cancelled view renders byte-identical under baseline and mutant, so cancelled's producibility never reached 210:19. The status-union mutants ADR-0019 argued from (111:24, 111:38, 111:65) are all Killed. Relocation from outcome onto premise accepted; the architect's reason is stronger than the one I gave."}
  ],
  "mutation": {"score": 0.9073, "survivors": 19,
    "note": "210:19 reclassified from 'real and unkillable' to 'real and due now, killable by one unit case'. Sibling maps 133:46 and 255:19 are Killed by appointments.test.ts:730 and :422 respectively, per statusReason — the whitelist control exists on two of three routes and GET is the sole gap."},
  "depcruise": "pass",
  "commit_discipline": "pass",
  "test_ownership": "pass",
  "dcr": null,
  "vote_requested": false,
  "message": "The architect's measurement is right and I reproduced it; the R-02-3 residue is withdrawn, and the evidence that refutes it was inside the diff I reviewed. R-05-1 survives relocated onto premises, and the premise record is 0-for-3 rather than 0-for-2 because slice 05's own deferral named a tombstone. I accept setNotFoundHandler at slice 06 — and it is stronger than argued, because tests/contract/error-taxonomy.test.ts:57 holds the closed taxonomy and is test-engineer-owned, so the handler cannot land in a slice with no test-engineer round."
}
```

**Attribution line for the PR:** `**reviewer** · .claude/agents/reviewer.md@995af67 · verdict under §6.4`

Files that carry the evidence: `/home/agentadmin/sources/keyloop-challenge/src/http/routes/appointments.ts` (210:19, and lines 133/255 for the killed siblings), `/home/agentadmin/sources/keyloop-challenge/tests/unit/http/appointments.test.ts` (:422, :730), `/home/agentadmin/sources/keyloop-challenge/tests/contract/error-taxonomy.test.ts` (:57), `/home/agentadmin/sources/keyloop-challenge/tests/acceptance/cancel-appointment.test.ts` (:247, :286), `/home/agentadmin/sources/keyloop-challenge/docs/slices/10-openapi-and-curl-harness.md`.
