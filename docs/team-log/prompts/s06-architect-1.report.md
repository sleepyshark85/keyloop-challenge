# Report · slice 06 · architect · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 06 step 1 design
- Returned: 2026-09-06T12:47:21.248Z
- Duration: 1061s

---

Step 1 is committed as `c410577`. `slice:check 06` Definition of Ready stays fully green; `docs:budget --check --ratchet`, `docs:refs`, `docs:adr-check`, `docs:check` and `test:tools` all pass.

## Report

```json
{
  "role": "architect",
  "outcome": "designed",
  "arc42_sections_touched": [],
  "adrs": [
    {"id": "0025", "status": "accepted", "supersedes": null},
    {"id": "0026", "status": "accepted", "supersedes": null}
  ],
  "quality_scenarios": ["QS-6", "QS-11"],
  "assumptions": ["A-06-1", "A-06-2"],
  "open_questions": ["OQ-06-1"],
  "dcr_ruling": null,
  "message": "Two of the five inherited obligations are ruled out of slice 06 — the racing-moves test to slice 07 (A-06-3), and src/domain/appointment.ts retired rather than deferred a third time. AC-5 was unimplementable as written and is amended: a move cannot be built without reading its own row, so the read decides existence and the guarded UPDATE decides legality, with no follow-up read at all."
}
```

Files: `/home/agentadmin/sources/keyloop-challenge/docs/slices/06-design.md`, `/home/agentadmin/sources/keyloop-challenge/docs/adr/0025-existence-is-the-reads-legality-is-the-statements.md`, `/home/agentadmin/sources/keyloop-challenge/docs/adr/0026-the-lock-is-a-value-the-write-takes-and-it-carries-its-keys.md`, plus body edits to `docs/slices/06-reschedule-atomic-move.md`, `07-reschedule-under-contention.md`, `09-observability.md`. No front matter touched.

### The four decisions

**1 — AC-4 vs AC-5.** Neither option in the prompt is the answer, because the premise both share is false. **A move cannot be constructed without reading its own row**: the new interval is derived from the appointment's service-type duration and validated against its dealership's opening hours, and both are named by the row, not the request. So AC-5's *"decided by the `UPDATE` affecting zero rows rather than by a preceding read"* is not merely unmet — it is unimplementable. I found this by trying to write the statement.

Ruled (ADR-0025): **the read decides `404`; the guarded `UPDATE` decides `409`; there is no follow-up read.** The read's `404` is sound because absence is *permanent* — ids are minted by `deps.newId()` and never client-supplied, so no concurrent transaction can create the id the client named. The `UPDATE`'s zero rows is unambiguous *because* existence is already established and `cancelled` is terminal. §6.3's follow-up read and §6.6's closing paragraph are struck at step 7. AC-5's amended wording is now in the slice file.

On check-then-act, the reason rather than the conclusion: §2.1 forbids a read whose answer **authorises** a write that its own staleness could invalidate. This read touches one row by primary key and can never answer *"is that bay free"*; its `absent` answer cannot go stale; its `confirmed` answer **can**, and is re-adjudicated atomically by the statement's own `status = 'confirmed'`. A read is check-then-act when the write trusts it — this write does not. A read *after* a failed write would not have been either, since nothing is written after it; the design simply does not need one.

Ruled consequence, recorded because step 3 will hit it: **a cancelled appointment moved out of hours answers `400 /problems/outside-opening-hours`, not `409`.** The status guard lives only in the statement, so the domain rule — which needs no database verdict — is evaluated first.

**2 — AC-1's mechanism.** An `UPDATE` writes a new heap tuple, stamps the old one's `xmax` with this transaction's xid, and inserts a new index entry. `check_exclusion_constraint` runs *after* that entry exists, skips the entry it just inserted by `ctid`, and for every other candidate fetches the heap tuple to test liveness — the superseded version carries `xmax` = this transaction's own xid and is *deleted by me*. **The index is never presented with the prior version.** That is a property of the enforcement mechanism, not of the row: a `BEFORE UPDATE` trigger reads the heap, therefore *does* see it, and is correct only if someone wrote `AND o.id <> NEW.id`.

What makes the pass honest is a control in the same fixture that **must** fail: the same appointment moved onto an interval held by a *different* confirmed appointment, refused with `23P01` naming `no_bay_overlap` on the `booking.conflict` line. Without it, a build with the constraints dropped passes AC-1 outright.

**3 — AC-2, made falsifiable.** A row-level `AFTER INSERT OR UPDATE OR DELETE … FOR EACH ROW` audit trigger, installed and dropped by the test, recording `TG_OP`, `txid_current()` and `statement_timestamp()`. One successful `PATCH` must leave exactly one audit row: `TG_OP = 'UPDATE'`, one distinct statement timestamp. `DELETE`-then-`INSERT` yields two rows with different ops; cancel-then-book yields `UPDATE` + `INSERT`; a two-statement move yields two timestamps. Owner: **test-engineer**, `tests/integration/reschedule-is-one-statement.test.ts` (it asserts a database invariant). Rejected: `pg_stat_user_tables` (table-wide, collector-lagged, flaky against a shared container) and `xmin` (advances per transaction, cannot count to two). The reviewer's SQL read stays as a second, independent check.

**4 — ADR-0024's warnings.** Warning 1 is **routed, not fixed**: the re-derivation lands in the *same red commit*, so the assertion is never a merged test degraded by a later fix; the discriminator becomes the `type` member plus a negative control (`POST /appointments/{id}/nonsense` → `/problems/route-not-found`) that proves the route exists. Warning 2 is **prevented, and the prevention already exists** — measured from `reports/mutation/mutation.json`: `problem.ts` is 75.00, 9/12, and all three survivors are on **line 78** (`additionalProperties: false` and the description), precisely the mutants slice 05 forbade disabling. The two new rows add two `StringLiteral` mutants, both killed by a set-equality assertion already committed at `tests/unit/http/appointments.test.ts:799` — extending that list is not optional, so the kill is self-enforcing. **11/14 = 78.57.** And the taxonomy changes **once, not twice**: both rows land together.

### Scope ruling on the five inherited obligations

| Obligation | Ruling | Destination |
|---|---|---|
| Racing-moves concurrency test | **Re-deferred** | **slice 07**, written into `07-reschedule-under-contention.md`, ref `A-06-3` |
| F-05-1 `ResourceLock` | Kept, and **strengthened** (ADR-0026: the lock carries its keys) | — |
| ADR-0024 handler + row + corpus | Kept, merged into one taxonomy change | — |
| `src/domain/appointment.ts` | **Retired, not deferred** (ADR-0025 decision 6) | none — no obligation remains |
| Stryker exhaustiveness disables | Kept; instrument corrected | — |

The racing-moves re-deferral rests on a measurable inconsistency in the slice file's own reasoning: *"ADR-0003's claim is what slice 06 ships on"* is equally true of QS-4 and QS-5, which are already slice 07's and were deferred without complaint. ADR-0019's criterion is met and both premises are re-measurable on arrival (D-05-3's remedy) — cheaper, because slice 07's AC-2 already builds the barrier harness for a move racing *N* bookings; stronger, because it can assert alongside AC-1 that the loser's original is untouched.

**One item was added and it is larger than anything removed.** ADR-0003 requires a move needing a different bay or technician to re-run ADR-0004's candidate loop. I considered ruling re-allocation out — it is a far smaller slice — and rejected it: it makes `PATCH` **refuse while capacity exists**, which is the one behaviour this system is about. The duplicated loop is `F-06-1`, extraction deferred to **slice 09**, which must instrument both loops anyway.

### `inherits:` front matter (for you to land — I touched no front matter)

- **Slice 06** — `["F-02-9", "F-05-1", "R-05-7", "R-05-9"]` is **correct as it stands**. I re-deferred nothing carrying one of those refs.
- **Slice 07** — add `A-06-3` → `["F-02-9", "A-05-6", "A-06-3"]`
- **Slice 09** — add `F-06-1` → `["OQ-05-2", "F-06-1"]`

Two events to log: `A-06-3` (finding.raised, architect, step 1) + ruled `deferred_to: ["07"]`; `F-06-1` likewise with `deferred_to: ["09"]`. Neither ADR's Decision section names a slice, so `docs:adr-check` is satisfied without further backfill. I also wrote to `tools/docs/adr-baseline.json` — `docs:adr-check` exits 1 without the pin (verified both ways), so it is required rather than optional.

### On the check you are landing

**I think it is right, and I can name what it cannot see.** It is a *subset* guard over logged deferrals, not a completeness guard over obligations — and slice 06 is the case that shows the gap. Its file listed five inherited obligations; `inherits` carries four refs, and **two of the five have no ref in the event log at all** (racing moves and `appointment.ts`). Both were prose-only, cited across files, exactly O-39's shape. Had I silently dropped either, `slice:check` would have stayed green. Cheap remedy, if you want it: require every bullet under a slice's `## Inherited scope` to carry a ref id, and cross-check that set against `inherits`. That converts prose into refs at the point where prose is written.

### Things you did not ask about

- **§6.3 has been wrong since phase 2.** It mandates a follow-up read and §6.6 explicitly records that this *"reproduces the ambiguity"*. arc42 has been describing a design that cannot satisfy AC-4 and AC-5 together for the whole project, and nothing caught it because no slice had tried to write the statement.
- **Step 7 has essentially no ratchet headroom, and this is now a project-level constraint.** Ceiling minus current, for the five files slice 06 touches: **§5 = 15, §6 = 1, §8 = 7, §10 = 0, §11 = 2** words. Every addition must be paid for by a deletion in the same file. The deletions exist and are listed in the design (§6.3's follow-up read, §6.6's closing paragraph, §10's *"at slice 06"* forward references, §8.6's *"slice 06 registers…"*), but the next slice may not be so lucky — §8 and §10 in particular are structurally full.
- **AC-4's metric half is unassertable in this slice.** `booking_conflicts_total` does not exist until slice 09, which already carries it as that slice's AC-5. AC-4 here asserts the status and the `type` only; recorded in the design so the test-engineer does not chase it.
- **The slice file's Stryker instrument was wrong.** `// Stryker disable next-line` cannot cover an exhaustiveness arm — measured: the three survivors per arm sit on two lines (`default: {` carries a `ConditionalExpression` and a `BlockStatement`; the `throw` carries the template literal). The instrument is a `// Stryker disable all : <reason>` … `// Stryker restore all` pair per arm. Corrected in the slice file. Effect: `routes/appointments.ts` 83.93 → 94/103 ≈ **91.3**.
- **`problem.ts` is pinned at exactly threshold with no legal way to raise it except adding assertions**, because its only three survivors are the schema-options mutants slice 05 forbade disabling. Any future slice touching that file inherits the same one-survivor margin.
- **`OQ-06-1`** — a move to the appointment's current `startsAt` is a successful `200` that rewrites the row and advances `updated_at`. Slice 05 spent a `CASE` avoiding exactly this on the cancel path. I ruled it out of scope — a move to the same instant is a request, not a replay of one — and recorded it because the gate may disagree.
- **`A-06-2`** — the whole `404`-is-permanent argument rests on `deps.newId()` being the only id-minting site, and **nothing asserts that.** It is a one-line `ambiguity-containment` marker if you want it closed; I did not rule it in, because it is not this slice's.
