# Prompt · slice 10 · implementer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 10 step 4 green
- Sent: 2026-09-08T05:06:14.588Z

---

# Slice 10 · step 4 — GREEN. Small commits, each one green.

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/10-openapi-and-curl-harness`, **PR #21 open**. Pull first — the red is at `3c08f15`, CI-confirmed red for the right reasons (`db` exit 1, `nodb` and `perf` exit 0, red-proof green).

Read `docs/slices/10-design.md`, the slice file, and the red tests.

## What you already measured, which is now the spec

**`I-10-1` / M2 is yours to act on.** A one-member `Type.Union` collapses to a Literal and **silently substitutes** — you traced it to TypeBox's `Union()` source and confirmed it end-to-end through Fastify. **Seven cells collapse** under AC-1's narrowing: read's 400 & 404, cancel's 400 & 404, availability's 400 & 422, book's 409. Your verified fix is a hand-built `Type.Unsafe<T>({ anyOf: [{ const: x, type: 'string' }] })`, which rejects rather than substitutes and keeps `Static<>` inference.

**The test-engineer asserted the property, not your mechanism** — a reject-not-substitute probe through `fast-json-stringify`. So a future refactor that abandons `Type.Unsafe` and reintroduces the collapse still fails. Build to the property.

**`I-10-2` / M1**: the content-keyed form keeps the serialiser and survives `; charset=utf-8`, but fails at its own status with the content-type flipped rather than escalating to 500. That is the observable AC-1 rests on.

## Your work

1. **AC-1** — each operation declares only its own `(status, type)` pairs, as `application/problem+json` content, both directions including 2xx. `GET /availability` stops claiming `vehicle-not-owned`. Use the `Type.Unsafe` shape on every collapsing cell.
2. **AC-3 / AC-3b** — no `requestBody` schema carries an appointment id under any name; the only id `parameters` are path ids on the three operations addressing an appointment that exists. uuid minting stays confined to `{src/main.ts}`. **`A-06-2` has been declared discharged twice on assertions that did not make it — this is the third attempt and the marker is now anchored on `randomUUID`'s identity, so it will actually bite.**
3. **AC-7** — three assertions bound to `D-08-1`'s three surviving mutants, one fact per concatenated literal at operation level; AC-7 must fail when **any one** is emptied. The boundary is *`to` strictly later than `from`* (`A-10-4`) — you confirmed that against `queryAvailability.ts:62`.
4. **`R-09-13`'s split** — contract prose stays at operation level, the TypeBox rationale returns to the file docblock, the querystring object's duplicate `description` is dropped. You measured that `@fastify/swagger` discards it today, so **no emitted byte should change from that drop alone**; AC-7's `--check` proves it.
5. **`harness/seed.mjs` + both scripts + `npm run harness:seed`** — `harness/` is now **guarded and yours** (`a1d1717`). Two dependencies the test-engineer named:
   - `book-read-reschedule-cancel.sh`'s `date -u -d STARTS_AT + 2 hours` reschedule-offset convention **must survive the GNU-coreutils rewrite unchanged**, because AC-4's negative control pre-books exactly that instant to force the collision.
   - `double-booking.sh` needs **no new env var** — only real 201-counting logic driving its own exit code. AC-5's control supplies the collision itself.
   - Keep `harness:seed` a pure `.mjs` with **no printing pre-hook**, per your own measurement that a `pre<script>` printing to stdout would be `eval`'d as garbage.

**Not yours:** AC-2's §8.6 column is an arc42 edit and lands at step 7 with the architect. AC-6's README half is the scribe's. Do not write either.

## Discipline

- `src/`, `tests/unit/`, `harness/`, `docs/api/openapi.json`, `package.json`. **Not the outside-in test directories** — raise a DCR if a red test is wrong; you did that twice last slice and both were ruled (a).
- **Every commit green**, small, `(10)`, **explicit pathspecs**.
- When done: run Stryker **over the whole project**, not file-scoped — a file-scoped run overwrites the report and produced a false clean record last slice (`O-73`). Report the per-file numbers for every changed file.

## Post to PR #21

One comment, `**implementer · step 4 — GREEN**`. **~150 words, short and self-contained**, one italic framing line, a gloss at every reference, the measured mutation figures, and anything you objected to.

## Return

The structured report, the **measured** per-file mutation scores, and whether the `Type.Unsafe` shape held across all seven cells.
