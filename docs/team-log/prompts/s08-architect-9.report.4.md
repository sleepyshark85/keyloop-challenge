# Report · slice 08 · architect · invocation 9

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Rewrite 16 ADRs for readability
- Returned: 2026-09-07T13:43:50.546Z
- Duration: 7454s

---

H-1 is fixed in all three places, committed `4b8b531` and pushed.

## Word counts

| File | before | after | budget |
|---|---|---|---|
| `docs/arc42/01-introduction-goals.md` | 1048 | **1145** | 1500 |
| `docs/arc42/03-context-scope.md` | 1500 | **1498** | 1500 |
| `docs/arc42/12-glossary.md` | 374 | **432** | 1500 |

## What each says

**§1.3** — a note directly above the stakeholder table, so the term is qualified before it is used:

> **The primary actor is an interpretation, not a quotation.** The brief says only *"allow **a user** to request a service appointment"* and never names the role. OQ-2 asked who that user is and ADR-0002 answered *dealership staff* — a service advisor with a phone. The reading is load-bearing: it is why authentication is out of scope, why `customer_id` travels in the request body, and why a mismatched vehicle is a `4xx` rather than a `403`. Had the user been the customer booking their own car, identity would arrive with the request and ownership would be a security boundary.

**§3.1.1** — the primary-actor row now reads `**Service advisor** *(primary; the brief's "a user", read as dealership staff — ADR-0002, and see A-6)*`. **Word-neutral as required**: the eight words are paid for by five wording trims in the same file — *"can actually see"* → *"can see"*, *"the correctness of the system"* → *"the system's correctness"*, *"a user of a scheduling system"* → *"a user"*, and two more. Net −2. Nothing load-bearing was touched; in particular the "Customer / vehicle owner" row keeps its counterfactual, which is the sentence this fix leans on.

**§12** — the term is defined, with the brief's word and the ruling that read it.

ADR-0002 is untouched.

## One thing I would not do silently

**§12's closing footnote is already broken, and my row perturbs it further.** It reads *"The twelve domain terms below the first four were proposed in `docs/slices/01-design.md` §12.1"*. Two problems, both pre-existing: the table had thirteen rows, not sixteen; and `01-design.md` has no §12.1 — the design condensation removed it, so the citation resolves to nothing. `docs:refs` cannot see this because it only checks `D-`/`F-`/`DA-`/`OQ-`/`A-` ids, not section pointers.

There is no insertion point that leaves the footnote's meaning intact: adding first would sweep *Appointment* into the slice-01 attribution, adding last sweeps in my own row. **I chose last, because the misattribution then lands on the row I control**, and neutralised it inline with *"Added 2026-09-07; not a slice-01 term"*. Every pre-existing row's provenance is exactly as the footnote states it. The footnote is the scribe's sentence in the scribe's section, so I have not rewritten it — reporting it instead.

## The check that would have caught H-1

**A term-introduction check, and it is buildable.** §1.1 already declares the brief's three requirements as block quotations. A tool could extract every quoted span in §1.1, then require that any role named in §1.3's stakeholder table or §3.1.1's actor table either appears inside one of those quotations or sits within *n* lines of a marker saying it does not. That is the shape of the defect: a term presented as settled whose word never appears in the source the document claims to trace to. It would have fired on "Service advisor" on the day §1.3 was written, and it is cheap because both tables are machine-readable and the quotations are already delimited. I have not built it, per your instruction.

## Checks

`docs:refs`, `docs:adr-check`, `docs:check` and `docs:budget:check` are all green.

**`test:tools` is red at `defects:check` again, and again it is not mine**: `H-1` was appended to `docs/team-log/events.jsonl` in the working tree, which makes the generated `docs/DEFECTS.md` stale. Both are yours — `npm run defects` clears it, exactly as it did for `O-67`. Every commit used explicit pathspecs, so neither file was picked up; I also see your `b0e66d5` landed in between, recording that the three restored reasons are not `A-04-1`'s three, which answers the open question from my last report.
