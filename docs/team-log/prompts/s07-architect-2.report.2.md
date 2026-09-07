# Report · slice 07 · architect · invocation 2

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Rule R-07-1 and R-07-2
- Returned: 2026-09-07T00:40:52.107Z
- Duration: 19364s

---

**Ruled: (a) clarification.** The design is right, ADR-0031 is satisfied, and the instrument is wrong. The granted-locks dump contains `classid=2, objid=4083001586`, which *is* the lock ADR-0031 requires — the transaction holds it. I cannot name a criterion that fails, and I would not want to: AC-5 exists to witness the lock set, and the lock set is correct. Resume from step 3, the raising step. No ADR, no design change.

**It does not cost the second loopback; you stay at 1 of 2.** The governor bounds design churn — a slice needing three design changes is a slicing problem. Nothing in the design, the ADR or the build moves here, and the failure *confirmed* the design rather than challenging it. Charging a loopback for an assertion's comparison would spend the governor on the one thing it is not for, and would make the next genuine (c) unavailable for a reason that had nothing to do with design.

**Which side moves: neither.** Do the comparison in SQL and let it return resource *ids*. Join `pg_locks` against `hashtext(bay_id)` / `hashtext(technician_id)` computed in the same statement, and have the harness assert that the set of ids coming back equals the pair the row currently occupies. Both fixes you offered are conversions, and the defect we just found *is* a conversion — adding a correct one leaves a second place the encoding can be wrong, and it puts a signed/unsigned fact in a JavaScript file where nothing will ever re-derive it. UUIDs cross the boundary unambiguously; `int4`-in-`oid` does not. This preserves the deterministic-witness property and strengthens it: the assertion then reads the lock set in the terms ADR-0031 is actually written in — *which resources is this transaction holding* — instead of in the terms `pg_locks` happens to store. AC-5's parenthetical ("`classid`/`objid` against `hashtext`") now names the wrong mechanism; its substance is unchanged, so I will correct that clause at step 7's as-built rather than reopen the design file mid-slice.

**On R-07-4**: noted, and thank you for running the falsification rather than the confirmation. 1.87% against 0.5% with disjoint intervals and a 0/1000 positive control is a better result than the ruling deserved — the old shape was under-racing, and the header's extra-round-trip account should be retired in the file rather than left standing beside the new number.

**The fourth occurrence is worth telling the retro, and it is the same family.** The vacated index entry, the multiset symmetry, the stale `leave`, and now a signed hash in an unsigned column: every one is a claim that survived because the thing that would falsify it sat on the other side of a boundary nobody crossed — three transaction boundaries and one type boundary. What differs is the cost: the first three were defects in the system, this one was a defect in an instrument, and it was caught precisely because I required the witness to be deterministic. That is the control working, and the retro should read it that way rather than as a fourth failure. The countermeasure has now worked four times and is the same each time: cross the boundary and read the value in the representation the system actually uses, instead of arguing about it from the near side.
