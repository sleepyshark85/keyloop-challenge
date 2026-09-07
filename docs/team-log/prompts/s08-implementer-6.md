# Prompt · slice 08 · implementer · invocation 6

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Unname the actor in src and unit tests
- Sent: 2026-09-07T14:06:51.421Z

---

# Unname the actor in `src/` and `tests/unit/` — 7 comment lines

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `chore/adr-readability` (checked out, clean). Pull first.

## Why

The human audited the requirements trace and found `Requirements.md` says *"Allow **a user** to request a service appointment"* — it never says "service advisor". That term was our interpretation, recorded as Gate A's OQ-2 and ruled by ADR-0002. The human has now withdrawn the reading: *"directly mention a service advisor in the ADRs as an actor for the system is limiting."*

**ADR-0034 supersedes ADR-0002**: the caller is *a user*, the system does not name the human behind it, and authentication stays out of scope on the argument ADR-0002 already contained — a credential check in front of a stubbed client is a mechanism no test can exercise, which holds whoever is holding the phone. `customer_id`-in-body and ownership-as-validation are **unchanged**.

arc42, the ADRs and the slice designs are done. What is left is prose that quotes arc42 §8.6's justification for its `500` row, which has propagated verbatim into code and test comments. §8.6 now says *"the caller"*; these still say *"a service advisor"*.

## Your seven lines

`src/` and `tests/unit/` are yours under §5.

```
src/application/deriveInterval.ts:68
src/http/server.ts:90
tests/unit/application/bookAppointment.test.ts:728
tests/unit/application/deriveInterval.test.ts:113
tests/unit/http/appointments.test.ts:168
tests/unit/http/appointments.test.ts:754
tests/unit/persistence/referenceRepository.test.ts:167
```

Read arc42 §8.6's current wording first and follow it, so the quote and its source agree again.

## Boundaries

- **Comments only. No behaviour, no assertions, no test names.** If neutralising a comment would require changing what a test asserts, stop and report it — that would mean the assertion depended on the role, which is a finding rather than an edit.
- Do not touch `tests/contract/` — three lines there are the test-engineer's and are being done in parallel.
- Do not touch `docs/`.
- **The word "advisory" is unrelated** — advisory locks, advisory reads, the advisory availability query. Leave every one of them alone. Match `advisor` only where it names a person.
- `referenceRepository.test.ts:167` reads *"advisor the vehicle is unknown when the customer is too"* — mid-sentence, so read the whole comment rather than substituting one word.

## Verify and land

`npm run build`, `npx vitest run --project nodb`, `npx depcruise` — all must stay green; nothing here should be able to change them, which is the point.

Commit `docs(adr):` or `refactor(08):` as fits — comment-only, no behaviour change. **Explicit pathspecs, never `git add -A`.** Push. No PR — #19 is open and this lands in it.

Return the structured report, and say whether any comment resisted neutralising.
