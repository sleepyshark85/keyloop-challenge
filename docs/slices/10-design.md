# Slice 10 — design

Slice file: [`10-openapi-and-curl-harness.md`](10-openapi-and-curl-harness.md). Seven criteria, six
inherited obligations, QS-11. The work is small; **the through-line is that all three subjects were
asserted by tests that could not fail**, so every ruling below is judged on whether it produces an
assertion with a reachable red.

**Yes, one slice.** AC-1 and AC-3 are the *same* per-operation walk over one document, and the
harness shares the close-out (seed script, README, gate run). The hinge, if it ever splits, is
measurement M1 below — not the harness.

## Building blocks touched · data-model delta: none

`src/http/problem.ts` (a per-cell problem response, from the same closed set) · `src/http/routes/*.ts`
(response maps narrowed) · `tools/docs/openapi.mjs` / `buildOpenApiDocument()` (the two rows with no
operation) · `harness/` + `harness/seed.mjs` (new) · `package.json`. Layering unchanged; no new
dependency-cruiser rule (§5.3's plant rule applies to forbidden edges, and this adds none).

## 1 — The matrix is a **column**, not a table

AC-2 asks §8.6 for a `type` × operation matrix. §8.6 already owns status, `type`, when and decided-by
per row; the operation dimension is the only *new* fact. A second grid would re-home status and
`type` — the duplication seventeen ADRs were retired for. **Ruling: one new column on §8.6's existing
nine-row table.** A table with a type axis and an operation axis is a matrix however it is drawn.

| `type` | status | operations |
|---|---|---|
| `malformed-request` | 400 | all five |
| `outside-opening-hours` | 400 | book, reschedule |
| `appointment-not-found` | 404 | read, reschedule, cancel |
| `route-not-found` | 404 | **none** — `setNotFoundHandler` answers no operation |
| `no-capacity` | 409 | book, reschedule |
| `appointment-not-confirmed` | 409 | reschedule |
| `unknown-reference` | 422 | book, availability |
| `vehicle-not-owned` | 422 | **book only** |
| `internal` | 500 | all five, **carrying no response schema** (§8.5) |

Read transposed, that deletes `404` from book, `409`+`422` from read and cancel, and `422` from
reschedule, and narrows every surviving cell's union. `/health` is **outside** §8.6's surface (§3.1's
operator boundary; its `503` is a health document, not a problem) and is excluded *by name* with an
asserted-empty type set, never by silent omission.

## 2 — Equality, on **(status, type) pairs**

Kept, and widened: a superset check passes on exactly the defect this slice exists to remove — an
operation claiming a `type` it cannot produce. Equality on pairs rather than types, because
`malformed-request` drifting from 400 to 422 is real drift a type-set misses. Add the 2xx direction:
a `201` that arrived as `problem+json` is §8.6's stated *worse* failure, so success responses are
asserted `application/json` by the same walk.

The cost — every future route touches this test — is small and bounded: A-7 keeps reference data off
the API and §8.6 closes the surface at five. The dishonest failure is the tempting fix (add the row
to the test, not to §8.6). **Residual, named:** nothing mechanically ties the test's transcribed
matrix to §8.6's. `error-taxonomy.test.ts`'s ∀responses ∃row sweep over the wire is the independent
guard; the matrix constant carries the §8.6 anchor. See "what cannot fail" below.

## 3 — `R-09-13`: the prose splits, and the mutants stay put

`AVAILABILITY_QUERYSTRING_DESCRIPTION` is doing two jobs. **Ruling: split it.** The operation-level
constant becomes contract prose — what the operation answers, the rule, the consequence, one fact per
concatenated literal — and the TypeBox rationale stays in the file docblock, where it already is and
where nothing publishes it. The querystring object's now-duplicate `description` property is dropped;
@fastify/swagger was measured at slice 09 to discard it, so this changes no emitted byte and AC-7's
`docs:openapi -- --check` proves that rather than assuming it.

The three mutants go to AC-7's three assertions — one per literal, or D-08-1 reopens on the file the
human took a §10 override for. That binds the criterion: **AC-7 must fail when any one piece is
emptied**, not merely when all three are.

**AC-7's boundary is wrong as written and I am correcting it** (mid-slice AC authority, provisional):
the route rejects `to <= from`, so the rule is *`to` must be strictly later than `from`; a `to` at or
before `from` is `400 /problems/malformed-request`*. AC-7's "at or after" publishes a rule the code
does not implement. Cost if wrong: a contract sentence off by one boundary, caught by AC-5b's
neighbours at the gate.

## 4 — `R-09-12`: "from a terminal" means the seed prints the environment

Two halves, and only the second is new. **No GNU-only utility**: `date -u -d` becomes `node -e`,
asserted as a static denylist scan of `harness/*.sh` (`date -d`, `date --`, `readlink -f`, `sed -i`,
`grep -P`, `stat -c`). That does not prove POSIX purity — nothing here can — it proves the named
hazards are absent, and it can fail.

**`harness/seed.mjs`, run as `npm run harness:seed`, prints the environment the scripts require** as
`export`-shaped lines (the five ids it creates plus a `STARTS_AT` inside opening hours), so
`eval "$(npm run --silent harness:seed)"` is the whole terminal path. `REQUEST_COUNT` gains a default
of 10. **The assertion that makes this fail-able**: the acceptance test drives both scripts using
*only* what the seed printed — never `seedScenario`'s ids. Today the test supplies them from the
fixture, which is precisely the test suite the criterion says the harness must not need. A missing or
incomplete seed then trips the scripts' own `:?` guards and goes red.

The seed cannot import `tests/support/` because `tsconfig.build.json` excludes it from `dist/`; a
dependency-cruiser rule policing an impossibility is padding, so there is none.

## 5 — Ownership. Slice 09 lost work twice to this table (`T-09-5`, `O-72`)

| Artifact | Owner | Enforced by |
|---|---|---|
| `tests/acceptance/harness.test.ts`, `tests/contract/openapi-document.test.ts` | **test-engineer** | `guard-paths` denies the implementer |
| `harness/*.sh`, `harness/seed.mjs` | **implementer** | **nothing** — `harness/` is unguarded |
| `src/http/**`, `docs/api/openapi.json`, `package.json` scripts | **implementer** | — |
| `README.md` run section | **scribe** (`CLAUDE.md` §4) | `guard-paths` |
| arc42 §3.1, §8.5, §8.6, §10.2, §11.1 | **architect**, step 7 | `guard-paths` |

`harness/` is the *subject* the acceptance test spawns. A test-engineer that writes it asserts its own
work — the independence §5 exists for — and the hook will not stop either role, so this row is the
only thing standing between us and `T-09-5` a third time.

## Measure, do not choose in advance

Two mechanisms could each produce a green assertion of nothing. Both are the implementer's to settle
**by measurement**, as `D-09-3` was; the design fixes the property, not the mechanism.

- **M1 — how `application/problem+json` reaches the document.** Preferred: Fastify's per-response
  `content` form, declared per route, so the assertion has route-specific data to catch. **Unverified:
  whether the serialiser still applies under it, and whether `sendProblem`'s `; charset=utf-8`
  defeats content-type matching.** If it does, fall back to a rewrite inside `buildOpenApiDocument()`
  driven by *each route's own* declared problem statuses — never by `status >= 400`, which would
  assert the rewriter and nothing else.
- **M2 — a one-member `Type.Union`.** TypeBox may collapse `Union([Literal(x)])` to `Literal(x)`,
  which §8.5 measured as **silent substitution** — the defect that makes a contract test unable to
  fail, reintroduced by the fix for it. Every single-`type` cell (read, cancel, availability's 400)
  must be shown to *enforce, not substitute*, by the same wrong-value probe §8.5's table was built
  from.

Narrowing is safe to attempt because QS-11's existing sweep already reaches all nine rows end to end:
a mis-narrowed union renders `FST_ERR_FAILED_ERROR_SERIALIZATION` and `error-taxonomy.test.ts` fails
loudly. That is the point — the document stops being *able* to lie.

## AC-3, and a second half for `A-06-2`

The same walk asserts, by equality: each operation's `requestBody` property set, and each operation's
`(name, in)` parameter list. Adding `appointmentId` to `BookingBody` fails; so does a query parameter
nobody declared.

That discharges the **contract** half — an appointment id is unreachable from a client, which is what
ADR-0025's permanent `absent` rests on. It does not discharge *"`deps.newId()` is the only place an id
is minted"*, and I will not let that be declared a third time on an assertion that does not make it.
**Added as AC-3b** (mid-slice AC authority): a `tests/architecture/` set-equality marker — the files
in `src/**` matching a uuid-mint pattern equal `{src/main.ts}`. `crypto.randomUUID()` appears there
exactly once today. It catches the realistic reintroduction, not an adversary; the residual is stated.

## Negative controls, because "always exits 0" is this slice's whole subject

AC-4 and AC-5 are unfalsifiable without one each, and the test-engineer owns both:

- **AC-5** — `REQUEST_COUNT=1` against an already-taken slot yields zero `201`s; the script **must
  exit non-zero**. Nothing else proves it counts.
- **AC-4** — a run in which one of read/reschedule/cancel answers a status other than `200` must exit
  non-zero, and it must be one of the three steps that are *unchecked today*.

Assert the **exit code** as the primary signal. The current test's occurrence-counting of `201`/`409`
in stdout breaks the moment a script prints a summary line, and it is the test asserting the
invariant rather than the script.

## Proposed arc42 edits (step 7 makes them)

§8.6 — the operations column, and the "as built the emitted document does not say so" paragraph
deleted; §8.5 — a row for whichever M1 mechanism ships, since the seam table is where this repository
keeps measured serialiser behaviour (**added to the slice's `arc42:` field here rather than after the
fact**, which slice 09 had to do and said was the worse order); §3.1 — the harness sentence gains the
seed; §10.2 — QS-11's "its media types are wrong and asserted by nothing" retired; §11.1 — `D-09-1`
closes, with the residuals below opened.

## No ADR

The human's 2026-09-07 bar: *closes off an alternative someone would reasonably take, and expensive
to reverse*. Per-cell narrowing refines ADR-0024's closed set rather than closing an alternative;
documenting the `500` outside the response schema is §8.5 being applied, not decided. Reversal is one
helper. **Nothing here reaches the bar**, and this section is the record that it was checked.

## What cannot fail — say it now, or repeat the defect

- **AC-2 alone cannot fail a build.** §8.6 is prose; no check compares its column to the document. Its
  real protection is AC-1, and its residual is a divergence a reader must catch. I considered parsing
  §8.6 from the test and declined it: it makes arc42 a machine-readable input and breaks on
  reformatting. Verified at the gate, and recorded as debt rather than dressed up.
- **AC-6's README half** is a gate item (the DoD already requires the run by hand); only the
  `package.json` scripts and the seed-only environment are mechanical.
- **AC-3b is a denylist**, not a proof of minting.

## Assumptions and open questions

- **A-10-1** — the four dropped `(operation, status)` cells are unreachable, read from the routes'
  exhaustive switches. If any is reachable, narrowing turns a working response into a `500`; QS-11's
  sweep is what would say so, and it runs on every commit.
- **OQ-10-1** — an unreferenced `components.responses` entry for `route-not-found` is valid OpenAPI
  3.1, but whether `SwaggerParser.validate` accepts it under AC-8 is unverified. If not, the row is
  documented in `info.description` and asserted absent from all five operations instead.
