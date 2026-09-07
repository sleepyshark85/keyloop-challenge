# Report · slice 07 · architect · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 07 step 1 design
- Returned: 2026-09-06T17:32:54.509Z
- Duration: 1373s

---

All gates green, container cleaned, tree clean apart from your prompt capture.

**Files:** `/home/agentadmin/sources/keyloop-challenge/docs/slices/07-design.md` (1,696 / 3,000) and `/home/agentadmin/sources/keyloop-challenge/docs/adr/0030-a-move-locks-the-pair-it-leaves-as-well-as-the-pair-it-takes.md` (700 / 700, `accepted`, pinned). Commit `684ddfa`.

## The headline: slice 07 is not proof-only

I raced F-02-9 at step 1 instead of designing around it. It came back negative.

Two moves past attempt 1, each targeting the pair the other occupies over an overlapping interval, each holding ADR-0018's locks **on its target pair only**. Each `UPDATE`'s exclusion check finds the other's *vacated but uncommitted* index entry, whose `xmax` is a live transaction, and waits on it. Both wait. `40P01`.

`postgres:16-alpine`, this repo's constraint definitions, 20 mutually-vacating pairs from one barrier, 25 trials:

| Locks a move takes | `23P01` | `40P01` |
|---|---|---|
| target pair — **as merged at slice 06** | 883 / 1000 | **117 (11.7 %)** |
| union of incumbent and target | **1000 / 1000** | **0** |

Deadlock detail: `Process 162 waits for ShareLock on transaction 8424; blocked by process 161` and the mirror — a mutual transaction wait, not an advisory key. No path skipped anything. Uncontended cost unchanged (600 moves, p50 2.25 ms → 1.90 ms, one statement either way).

**My own slice-06 discharge ruling is what was wrong**, in the exact words you quoted back at me: *"vacating writes no index entry another transaction waits on."* It writes no **new** entry; the **old** one stays live until commit — and ADR-0023's own M1 had already measured a conflicting writer waiting on precisely that. A move is both a waiter and a wait-upon, so it can close a cycle. Booking never can; cancel never can.

ADR-0030 rules it: **a write locks every resource it is in flight against — the pair it takes, and, where it also runs an exclusion check, the pair it leaves.** Booking, cancel and move now fall out of one rule instead of three cases. ADR-0018's and ADR-0029's falsified premise is corrected there rather than by editing either; ADR-0029's *decision* is unaffected and is re-grounded (a `40P01` names the path in flight against more than it locked — a better reason for the split name than the one it was given).

**You asked to be told if ADR-0029's premise was wrong. It is, and this slice is the first that could produce the counterexample. It produced 117.**

## The three decisions

1. **"Never opens a window" is asserted by three witnesses, each able to fail.** The racing bookings are the only observer of a *committed* release (a `READ COMMITTED` poller cannot see an uncommitted one, and an uncommitted one is not a window) — that is why QS-5 is a race, not a poll. AC-1 gains **`xmin` and `ctid` unchanged**: *nothing was written*, not *nothing differs*. A compensating cancel-then-restore passes column equality and fails this; `xmin` is not forgeable by application code; an abort correctly leaves it untouched. Third, slice 06's merged statement-count trigger, re-run under contention.
2. **Two files, no third. Racing moves go into `refused-move-leaves-original.test.ts` under QS-4** — both cases are that scenario's adversarial instance, and a third file would need a §10 row that §10 has no headroom for. **Production code: yes** — `lockResources`' signature and lock statement, one argument at each of two call sites. No migration, no data-model delta, no dependency-cruiser change, no endpoint or field.
3. **The barrier harness: mechanism reusable, fixture not.** Plus a constraint nobody had written down — **the barrier must be released before ADR-0018's locks are taken**, because the locks are themselves a serialisation point and a racer waiting on one never reaches a barrier placed after it. I found that by hanging a harness on it. Existing concurrency tests race whole HTTP requests and are already on the right side; the new fixture must stay there.

## A-06-3's two premises, re-measured (D-05-3)

- **"Cheaper — AC-2 already builds the harness; racing moves is that harness with `UPDATE` on both sides."** **FALSE.** A booking is in flight against one pair and cannot close a cycle. Measured: 60 trials, one move vs 10 bookings — 660/660 `23P01`, zero `40P01`, A's slot occupied 60/60. The barrier mechanism is shared; the fixture and the failure mode are not. The deferral was still right, for a reason nobody wrote down: slice 06 had no barrier at all, so this was not cheaper here, it was *impossible there*.
- **"Stronger — it can assert the loser's original is untouched."** **TRUE**, and more than claimed: `xmin` upgrades *untouched* from *unchanged values* to *not written*.

**O-41: discharged.** `slice:check 07` reports "4 bullet(s), every ref in `inherits:` named in one". Nothing to build.

## Front matter (yours to apply — I did not touch it)

- `arc42: ["§5.2", "§6.1", "§6.3", "§8.6", "§10", "§11"]` (was `["§6.3"]`)
- `adr: [3, 18, 23, 26, 27, 29, 30]` (was `[3]`)
- `quality_scenarios`, `inherits`, `loopbacks: 0` — unchanged. **No loopback is owed**: nothing had been built to loop back to, so this is a step-1 ruling, not a (c).

Design §7 names, per section, the deletion that pays for each arc42 edit — §6 has 30 words, everything else has zero. Three of the six edits delete a sentence that is now false.

## Not asked about

- **`src/persistence/pgError.ts`'s `classify` docblock and `rescheduleAppointment.ts`'s `no-verdict` arm both repeat the falsified premise** verbatim. `src/` is not mine — D-06-4's shape again, third occurrence. It lands in the implementer's A-05-6 pass, which is already opening that file.
- **`rescheduleAppointment.ts:13` says "ATTEMPT 1 IS THE APPOINTMENT'S OWN `(bay_id, technician_id)`, tried directly — no lock/`23P01` for it."** Line 201 takes the locks on every attempt. Whatever was meant, it reads as *attempt 1 is unlocked*, in the file F-02-9 exists to protect. Implementer's.
- **`docs:budget -- --check --ratchet` reported `slices/07-reschedule-under-contention.md` at 893/800 and "1 document GREW past its ceiling" on my first run, then exited 0 on four consecutive runs over an unchanged tree.** Not reproduced, not explained. A flaky ratchet is worse than a red one; the tool is yours.
- **`slice:check 07` carries an open MAJOR, O-50** (three lost `agent.finish` events across slices 04–05). Orthogonal to architecture; blocks Done, not this step.
- **I touched one `tools/` path**: `tools/docs/adr-baseline.json`, via the pin `docs:adr-check` itself instructs. Without it that gate is red. Flagging it because your constraint said no `tools/`.

```json
{
  "role": "architect",
  "outcome": "designed",
  "arc42_sections_touched": [],
  "adrs": [{"id": "0030", "status": "accepted", "supersedes": null}],
  "quality_scenarios": ["QS-4", "QS-5"],
  "assumptions": ["The subquery ORDER BY is honoured by the outer evaluation — the same reliance ADR-0018 already made on unnest order; a violation now costs an advisory cycle, which AC-4 catches because it is also a 40P01. Measured 0/1000."],
  "open_questions": ["Whether the 893/800 budget-ratchet report was a real regression or a tool flake — not reproduced in four subsequent runs."],
  "dcr_ruling": null,
  "message": "Raced F-02-9 rather than argue it: 117 of 1000 contended move attempts return 40P01 and therefore 500, with every ADR-0018 lock taken — my own slice-06 discharge argument was wrong, and ADR-0029's premise with it. ADR-0030 locks the union of the pair a move leaves and the pair it takes: 0 of 1000, no measurable cost. Slice 07 needs about fifteen lines of production code and is not proof-only; AC-4 added with its mutant control already measured."
}
```
