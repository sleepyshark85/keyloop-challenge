# Video shot list

> Owner: scribe. A 5–10 minute recording of this project. Every beat names the artifact to have on
> screen — this is a shot list, not a script; say what the artifact shows rather than reading it.

## 0:00–0:45 — Introduction and scenario

**Show:** `README.md` top (the one-paragraph scenario) and
[`docs/arc42/01-introduction-goals.md`](arc42/01-introduction-goals.md) §1.1, scrolled to the
stakeholder table.

Say what is being built (Scenario A, the unified service scheduler) and name the one invariant up
front: a booking is confirmed only if a bay and a qualified technician are both free for the whole
duration, and double-booking is prevented by PostgreSQL rather than application code
(`CLAUDE.md` §2.1). Flag that this is backend-only by design — the client layer is an OpenAPI
contract and a cURL harness, built at slice 10.

## 0:45–2:15 — System design and implementation highlights

**Show:** `docs/board.html` (`npm run board`) for the finished shape — 11 slices, all done, the
findings panel. Then the exclusion constraint in `README.md`'s "The one invariant" section, and
[`docs/arc42/08-crosscutting-concepts.md`](arc42/08-crosscutting-concepts.md) for the error taxonomy
and the candidate-allocation retry loop.

Say: the constraint is what makes overlap unrepresentable — `EXCLUDE USING gist` on
`(bay_id, tstzrange)` and its technician twin — and the service layer's only job on conflict is to
map SQLSTATE `23P01` to `409`. Point at `.dependency-cruiser.js` and a green `npm run lint:arch` to
show layering is enforced by tooling, not review (`CLAUDE.md` §2.3). Mention the candidate ordering
and attempt cap (ADR-0009) as the interesting allocation-under-contention design, without a live
demo yet — that comes in the demonstration block.

## 2:15–3:45 — The AI collaboration story

**Show, in order:**

1. `docs/team-log/events.jsonl` count and [`docs/DEFECTS.md`](DEFECTS.md)'s summary table — 369
   findings, mean escape distance 1.48 steps — to establish that this is a measured process, not a
   narrated one.
2. **PR #20**, the architect's step-5 adjudication comment: *"Fifteen findings, fifteen agreed, two
   remedies rejected — and the first (c) of this project."* This is the project's one moment of the
   architect refusing to soften a finding to protect its own loopback count.
3. **The ADR supersession chain** — open `docs/adr/0002-service-advisor-actor-no-authentication.md`
   (`status: superseded`, `superseded_by: "0034"`) side by side with
   `docs/adr/0034-the-caller-is-a-user-and-the-system-does-not-name-the-role.md`. Say: the human
   audited the trace and found "service advisor" named about 85 times in a codebase whose brief says
   only *"a user"* — an invented actor that had put authentication out of scope. This ADR pair is
   the whole finding in two files.
4. **PR #18**'s body — the 33 → 16 ADR retirement, on the human's own words: *"it doesn't seem to be
   in the level of decision that require an ADR."*

Say: six roles with bounded authority — architect, test-engineer, implementer, reviewer, scribe,
orchestrator — none of which can mark its own work done, and a human who overrides at the gate and
by ruling. Point at [arc42 §13](arc42/13-ai-collaboration.md) as the full account.

## 3:45–6:00 — Demonstration

**Show:** a terminal, the service already running per README's "Install, run, call".

```bash
eval "$(npm run --silent harness:seed)"
bash harness/book-read-reschedule-cancel.sh   # book, read, reschedule, cancel — one state machine
bash harness/double-booking.sh                # the invariant, live
```

Say, while `double-booking.sh` runs: this fires ten concurrent requests at the identical slot and
the terminal will show exactly one `201` and the rest `409` — the invariant demonstrated under real
concurrency rather than asserted by a unit test. This is the same shape the reviewer ran by hand at
slice 00: 8 racing clients, 1 committed, 7 rejected (`docs/team-log/phase-4-retro.md`, C3). If time
allows, re-run `harness:seed` and repeat once to show it is not a one-off.

## 6:00–7:30 — Lessons and challenges

**Show:** [arc42 §13.6](arc42/13-ai-collaboration.md#136-what-did-not-work) on screen, scrolled to
the tooling-catches-its-own-author paragraph, and `docs/adr/0035-one-conflict-counted-per-exclusion-violation.md`'s
frontmatter (`status: proposed`).

Say three things plainly, because this section is worth more than the parts that worked:

- **The recurring failure shape** was a mechanism reporting success over work it never did —
  `depcruise` cruising nothing, an aggregate mutation score hiding a failing file, a `loopbacks`
  field the governor that blocks a third loopback never actually read. Caught by asking "what would
  happen if this were removed or wrong?", not by reading code.
- **§6(b) has no terminal case on a final slice.** ADR-0035 was ruled correct-under-the-design with
  a better idea available — the textbook deferred improvement — and its remedy is a backlog slice
  that does not exist, because slice 09 was the project's last. It exits `proposed`, permanently.
- **Dispatches contradicted role definitions by silence**, at least four times in one remediation
  round, and work survived only because a role read past its own instructions — which the
  orchestrator itself logged as *not a mechanism*.

## 7:30–8:00 — Close

**Show:** `README.md`'s final state — 11 slices, 18 ADRs, all tests green.

Say: the project is closed on its own terms — a working booking service whose central invariant is
enforced by the database, and a documented account of where the process that built it worked, cost
more than planned, and did not fully close.
