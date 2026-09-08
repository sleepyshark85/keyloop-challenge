# Report · slice 10 · implementer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 10 step 2 implementer
- Returned: 2026-09-08T04:12:56.696Z
- Duration: 604s

---

## Slice 10 · step 2 — AGREE, with two measured resolutions and one ownership-table correction

Pulled `slice/10-openapi-and-curl-harness`, read `docs/slices/10-design.md` and `docs/slices/10-openapi-and-curl-harness.md` in full, and measured against the pinned stack (`fastify@5.12.1`, `@fastify/swagger@9.8.1`, `@sinclair/typebox@0.34.52`) with throwaway fixtures under `.scratch-m10/` (removed after capture — no code written to `src/`, `tests/`, or `harness/`).

### M1 — per-response `content` form: keeps the serialiser, survives `; charset=utf-8`, but fails differently than the classic form

Built a route with `response: { 400: { content: { 'application/problem+json': { schema: ProblemSchema } } } }` (2-member union) and probed it with `app.inject`:

- **Charset survives.** `reply.type('application/problem+json; charset=utf-8').send(...)` matched the `application/problem+json` content key correctly in both directions — valid values serialised and came back with `content-type: application/problem+json; charset=utf-8` intact, with and without the charset param on the send side.
- **It enforces, not passes through.** A value outside the enum was rejected — but the failure mode differs from the classic (non-content) `response: { 400: ProblemSchema }` form I measured side by side:
  - Classic form: escalates to **`500`**, `application/json`, `FST_ERR_FAILED_ERROR_SERIALIZATION` — exactly what `problem.ts`'s docblock already documents.
  - Content-keyed form: **stays at the status already set** (`400`), flips content-type to `application/json`, body becomes Fastify's generic `{statusCode, error, message}` — never escalates to 500.

This is good news, not a blocker: the failure is still observable (wrong content-type, wrong body shape, same status) and AC-1's strengthened equality-on-`(status,type)`-content check would catch it. It's a materially different failure mode from what `problem.ts`'s docblock describes for the *classic* form, worth a line in whichever §8.5 row this mechanism lands as (arc42 edit at step 7), so a future reader doesn't assume content-keyed failures also escalate to 500 — they don't.

### M2 — one-member `Type.Union` **does** collapse, and it **does** silently substitute, confirmed end to end

Bare TypeBox: `Type.Union([Type.Literal(x)])` returns `Kind: 'Literal'`, `{const: x, type: 'string'}` — traced to source (`union.js`): `Union()` literally does `types.length === 1 ? CreateType(types[0], options) : UnionCreate(...)`. No option suppresses this; it's unconditional.

Full round-trip through Fastify's content-keyed response schema: a route declaring `type: Type.Union([Type.Literal('/problems/appointment-not-found')])` and a handler that sends `type: 'wrong-type-entirely'` returned **`404`, `application/problem+json; charset=utf-8`, body `{"type":"/problems/appointment-not-found",...}`** — the wrong value silently replaced by the schema's constant. This reproduces §8.5's documented defect exactly, and it is reachable: reading the four route files' exhaustive switches, **7 cells collapse to one member** under the design's own §1 matrix — read's 400 & 404, cancel's 400 & 404, availability's 400 & 422, book's 409 — each currently sharing a wider `PROBLEM_RESPONSES` map that will narrow to exactly one type.

I also measured the two other candidates the file docblock names: `Type.String({enum:[x]})` is worse — the wrong value passes through **unvalidated and unsubstituted** (client sees `"wrong-type-entirely"` verbatim).

**A working fix exists and I verified it**: bypass `Type.Union` for single-member cells with a hand-built `Type.Unsafe<T>({ anyOf: [{ const: x, type: 'string' }] })`. Same probe against this shape: the wrong value is **rejected** (400/404 preserved, content-type flips to `application/json`, generic body) — same enforcing behaviour as the 2-member union, and `Type.Unsafe`'s type parameter preserves the correct `Static<>` inference. This is the mechanism I'll use at step 4 for every collapsing cell; nothing here requires a design change since the design already left the mechanism (not the property) to measurement.

### Items 3–5

3. **R-09-13 split holds.** Confirmed directly against the *committed* `docs/api/openapi.json` (not the docblock's claim): the availability querystring's parameters carry no `description` anywhere (`parameters[].description` and `parameters[].schema.description` are both absent for all four params) even though the object schema currently sets one — `@fastify/swagger` genuinely discards it today, so dropping that duplicate literal changes zero emitted bytes; only the operation-level string (which must change anyway to satisfy AC-7's wording) changes. Three-literal-per-fact concatenation at operation level is achievable for D-08-1's three mutants **provided** the test reads `op.description` directly rather than AC-5b's broader `collectDescriptions` sweep — I'd flag that to the test-engineer as a precision concern, not an objection.
4. **AC-7's correction is right.** `queryAvailability.ts:62`: `if (from === null || to === null || to <= from) return { kind: 'malformed-window' }` — confirms `to` must be strictly later than `from`; AC-7 as originally written ("at or after") would have published a rule the code doesn't have.
5. **`harness:seed` shape is workable, measured.** `npm run --silent <script>` emits *only* the script's own stdout — no npm banner, confirmed with a throwaway `package.json`, and `eval "$(npm run --silent seed)"` correctly set variables in the parent shell. One caveat worth stating for step 4: any `pre<script>` hook that prints to stdout (e.g. a build step) leaks into the same stream and would get `eval`'d as garbage — `harness:seed` must stay pure `.mjs` with no printing pre-hook.

### Ownership table correction

The design's row `harness/*.sh, harness/seed.mjs | implementer | nothing — harness/ is unguarded` is now **stale**. `git log` shows commit `a1d1717` ("fix(10): harness/ belonged to nobody... — A-10-3") landed *after* the design commits (`80d278b`, `622bd28`) and added `HARNESS_OWNED = ['harness/']` to `.claude/hooks/guard-paths.mjs`, denied to every role except the implementer. I read the hook directly and confirmed it's live. Not a design defect — just a table that needs its "Enforced by" cell updated from "nothing" to "guard-paths (`HARNESS_OWNED`, A-10-3)" when the architect reconciles at step 7, and the task brief's own "Boundaries" section should be read the same way.

No objections that block the design. `outcome: agreed`.

```json
{
  "role": "implementer",
  "outcome": "agreed",
  "commits": [],
  "files_changed": 0,
  "unit_tests_added": 0,
  "acceptance_passing": null,
  "depcruise": "not run (step 2, no source changed)",
  "objections": [
    "design's ownership table row for harness/*.sh, harness/seed.mjs says 'Enforced by: nothing' — stale as of commit a1d1717 (after the design commits), which added HARNESS_OWNED to guard-paths.mjs denying every role but the implementer; correct at step 7"
  ],
  "dcr": null,
  "message": "M1 measured: content-form keeps the serialiser and survives charset, but a schema mismatch on a multi-member union stays at its own status (400/404) with content-type flipped to application/json rather than escalating to 500 as the classic form does. M2 measured positive: Type.Union of one member collapses to Literal and silently substitutes end to end through Fastify for all 7 narrowed single-type cells, reproducing §8.5's defect; Type.Unsafe with a hand-built one-member anyOf avoids the collapse and enforces correctly, verified the same way. AC-7's to-strictly-later-than-from correction and the querystring description drop (measured zero emitted-byte change) both hold against the code and the committed document."
}
```

Files read (no writes): `docs/slices/10-design.md`, `docs/slices/10-openapi-and-curl-harness.md`, `src/http/problem.ts`, `src/http/routes/availability.ts`, `src/http/routes/appointments.ts`, `src/http/server.ts`, `src/application/queryAvailability.ts`, `tools/docs/openapi.mjs`, `docs/api/openapi.json`, `tests/contract/openapi-document.test.ts`, `tests/acceptance/harness.test.ts`, `harness/book-read-reschedule-cancel.sh`, `harness/double-booking.sh`, `.claude/hooks/guard-paths.mjs`, `node_modules/@sinclair/typebox/build/cjs/type/union/union.js`, `node_modules/@sinclair/typebox/build/cjs/type/unsafe/unsafe.d.ts`.
