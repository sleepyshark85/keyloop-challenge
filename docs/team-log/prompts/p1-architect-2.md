# Prompt · phase 1 · architect · invocation 2 (post-Gate A)

Written before invocation, per METHODOLOGY.md §9.

---

Gate A is decided. Record the decisions as ADRs and fold them into arc42 §1–§3.

## The four rulings

**OQ-1 — opening hours: validation only.** Reject a request falling outside dealership opening
hours with `400 Bad Request`. Do **not** model technician shifts. The reasoning matters and belongs
in the ADR: opening hours are a *static property of the request*, decidable without reading any
other booking, so validating them cannot reintroduce check-then-act. Availability and contention
remain entirely the database's business. This differs from your recommendation of "unbounded" — the
human took the middle path because a scheduler that cheerfully books 03:00 is visibly naive, while
full shift modelling would add a second class of availability rule that the exclusion constraint
does not cover.

**OQ-2 — service advisor, no authentication.** `customer_id` travels in the request body; ownership
is a validation rule, not a security control. Authentication is out of scope and belongs in §11.
As you recommended.

**OQ-3 — cancellation AND rescheduling are both in scope.** This *expands* on your recommendation,
which deferred rescheduling. Rescheduling is the technically interesting case and the human wants it
built: a move must not transiently release the slot, so it has to be a single atomic `UPDATE` that
the exclusion constraint still guards — never a delete followed by an insert. Say that explicitly in
the ADR, because the wrong implementation of it is the most plausible way this system could develop
a race after all the care taken elsewhere.

**OQ-4 — retry across remaining candidates, then refuse.** On `23P01`, try the next candidate rather
than surfacing `409` immediately; refuse only when the candidate list is exhausted. The ADR must be
explicit that the candidate read stays **advisory** — correctness still comes from the insert, so
this is not check-then-act — and must state a bound on the retry so a pathological case cannot loop.
As you recommended.

**Quality goals** — ranking ratified exactly as you proposed, performance last with its cost stated.

## What to write

**Four ADRs**, `docs/adr/0001-*.md` through `0004-*.md`, MADR format per `docs/adr/_template.md`.
Number them in OQ order. For each:

- `status: accepted`, today's date, and the arc42 sections it governs.
- **Populate *Considered Options* honestly.** Each of these had at least two live alternatives and
  you argued them in phase 1 — carry that reasoning across rather than writing a one-option note.
  For OQ-1 and OQ-3 in particular, record the option the human did *not* take and why, since in both
  cases your recommendation was overruled or extended.
- Set the provenance fields truthfully. `proposed-by: architect`, `decided-by: human`, and `ai-input`
  saying what you recommended and whether it was accepted, modified or overridden. For OQ-1 and OQ-3
  that value is *not* "accepted" — record that accurately. These fields are evidence for the
  assessment's AI-verification criterion and a flattering value is worse than none.

**Update arc42 §1–§3** so nothing still reads as open:

- §1.4 — move each resolved question out of "open" and into the assumption list, referencing its
  ADR. Keep A-1…A-10; renumber only if a ruling contradicts one.
- §2 — opening-hours validation and "no authentication" are now constraints; add them.
- §3 — the out-of-scope list gains authentication and technician-shift modelling; rescheduling comes
  *out* of any deferred list if you placed it there.

Note that A-4 (no setup/cleanup buffer) and A-6 (nothing created implicitly by booking) were flagged
to the human and left standing as assumptions. Do not change them.

## Rules

- Do not touch §4 onward. Solution strategy is still phase 2, behind Gate B.
- ADRs are immutable once accepted; these are the founding four, so write them right.
- No diagrams.
- Run `npm run docs:build` when finished.

## Report

End with the standard architect JSON block, listing the ADRs you created with their status.
