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

**The column itself lives in §8.6 as built** (step 7); the draft table that stood here is gone rather
than kept as a second copy of it. Read transposed, that deletes `404` from book, `409`+`422` from read and cancel, and `422` from
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

**Step 7, as built.** §8.5 took *two* corrections rather than a row: the collapse-and-rewrite pair
above (`R-10-2`), and `I-10-2`'s measurement that the `content` form **stays at the status already
set** with a generic `application/json` body where the bare form escalates to `500` — §8.5 described
only the second, so it was half wrong about the mechanism that shipped. `D-10-1` opens; `D-10-2`
folded into `F-06-2`, mutation-score blindness having a home already.

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
  `package.json` scripts and the seed-only environment are mechanical. ~~Ruled at step 1~~ —
  **withdrawn at step 5, `R-10-1`.** It was assertable in three lines and was then not written at
  all; see the adjudication below.
- **AC-3b is a denylist**, not a proof of minting.

## Assumptions and open questions

- **A-10-1** — the four dropped `(operation, status)` cells are unreachable, read from the routes'
  exhaustive switches. If any is reachable, narrowing turns a working response into a `500`; QS-11's
  sweep is what would say so, and it runs on every commit.
- **OQ-10-1** — an unreferenced `components.responses` entry for `route-not-found` is valid OpenAPI
  3.1, but whether `SwaggerParser.validate` accepts it under AC-8 is unverified. If not, the row is
  documented in `info.description` and asserted absent from all five operations instead.


## Step 5 adjudication — eight findings, eight verdicts

Loopbacks **0 of 2 and unchanged**: nothing below is a `(c)`, and the two that block are not DCR
outcomes at all. `R-10-1` and `R-10-3` are **conformance defects** — the design was right
and plainly stated, and was not built. §6's table adjudicates *disputes about a design*; returning
to step 1 to re-issue a design nobody disagrees with is ceremony, so the remedy is to build what is
already agreed, at the step that owns it. That distinction is recorded here because it is the one an
architect is most tempted to blur in its own favour: **neither finding is softened by it.** Both
block the merge.

| # | Verdict | Owner | Remedy |
|---|---|---|---|
| `R-10-1` | **UPHELD — blocking**, conformance | scribe · test-engineer | README run section; a mechanical assertion |
| `R-10-2` | **UPHELD — (a) clarification** | test-engineer | probe the shape at document level |
| `R-10-3` | **UPHELD — blocking**, conformance | test-engineer | `/health` by name, empty type set, no path unvisited |
| `R-10-4` | **UPHELD** | test-engineer | derive the cell list; stop transcribing it |
| `R-10-5` | **UPHELD, remedy amended** | implementer · test-engineer | `REQUEST_COUNT >= 2`; the negative control moves to 2 |
| `R-10-6` | **UPHELD as measured** | architect | §11.1, no code |
| `R-10-7` | **UPHELD** | implementer | compute the date; keep the time of day |
| `R-10-8` | **UPHELD, out of scope** | architect | §11.1 `D-09-4` |

### `R-10-1` — I withdraw "gate-verified rather than mechanical"

The reviewer calls that ruling **convenient rather than honest**, and it is right. The test is
three lines; I ruled it unassertable and the half was then not written at all, which is precisely
what an unassertable criterion buys. AC-6's README half is **mechanical from here**.

**The remedy is amended, and strengthened.** A grep for `harness:seed` asserts one string. Assert
**set equality** instead: every `harness:*` key in `package.json` appears in `README.md`, and
`README.md` names the `eval "$(npm run --silent harness:seed)"` line and both scripts. That catches
the realistic regression a grep misses — a *new* harness script added and never documented — for the
same three lines. Content is the scribe's (`CLAUDE.md` §4); the assertion is the test-engineer's.

### `R-10-2` — **(a)**, and the wording that was ambiguous was mine

Re-measured independently before ruling, on this toolchain: `@fastify/swagger` rewrites TypeBox's
`const` to `enum` in the emitted document, and `fast-json-stringify` **passes an `enum` value
through unvalidated** — it neither throws nor substitutes. So a collapsed cell emits
`{type: string, enum: [x]}`, the probe's wrong value comes back as *itself*, `not.toBe(correctType)`
holds, and all seven cells stay green while the runtime schema substitutes. The finding is exact.

M2 said the property must be *shown*; **it never said at which level**, and that omission is the
defect. Fixed here: **the M2 property is asserted at the runtime schema** — `tests/unit/http/
problem.test.ts`, which already does it and does fail on the collapse. At **document** level the
distinction the property rests on has been erased by the emitter before the test can see it, so
behaviour-probing is impossible in principle there and the only faithful assertion is the
**artifact's shape**: each single-type cell's `type` schema is a one-member `anyOf`, never a bare
`enum` or `const`. That is a mechanism assertion, which step 1 declined by name — I am reversing
that here for the document level only, because at that level the mechanism is the sole observable,
and it discriminates all three measured constructions (`Union` collapse, `String({enum})`, `Unsafe`
+ `anyOf`). Falsification the test-engineer must run: switch the single-member branch to
`Type.Union`, re-emit, contract suite red.

Keep the serialiser probe beside it as a second signal, and **delete the header's claim that this
block asserts behaviour rather than shape** — that sentence is now false of the block below it.

### `R-10-3` — my own ruling, and it is nameable

`10-design.md` §1: `/health` is *"excluded by name with an asserted-empty type set, never by silent
omission"*. `EXPECTED_PAIRS` has five keys and the walk visits only those, so the document's sixth
operation is unasserted and a problem response added to its `503` is green everywhere. **The
criterion that fails is AC-1** — *"each operation's set is asserted by equality"* — which today holds
over five of six operations, and equality over a subset chosen by the test is not equality.

Remedy, exactly the ruling: a sixth key `GET /health` with `['200 application/json',
'503 application/json']` — an empty problem-type set, stated — **plus** the assertion that closes
the class rather than this instance: `EXPECTED_PAIRS`' key set **equals** the set of
`(method, path)` pairs in `doc.paths`. A future route that nobody adds to the matrix then fails
rather than passing unseen.

### `R-10-4` — derive it, do not extend it

Eight cells, header says seven, `PATCH /appointments/{id}` `404` absent — confirmed against the
emitted document. Adding the missing row fixes the instance and leaves the shape. **`SINGLE_TYPE_CELLS`
is derived from `EXPECTED_PAIRS` instead**: the cells with exactly one `/problems/*` entry at a
status. One transcription of §8.6, not two, and the residual named at step 2 (nothing ties the
transcription to §8.6) does not double.

### `R-10-5` — the finding is right and the remedy as offered breaks AC-5's negative control

`REQUEST_COUNT=1` against a free slot prints PASS having demonstrated no contention. Upheld. But a
bare `>= 2` guard collides with the negative control step 1 specified — `REQUEST_COUNT=1` against an
**already-taken** slot — which would then exit non-zero because of the guard rather than because it
counted, and a negative control that passes for the wrong reason is this slice's own subject.

**Both change, together** (mid-slice AC authority, provisional to the gate): the script requires
`REQUEST_COUNT >= 2`, and AC-5's negative control fires **two** racers at an already-taken slot,
expecting zero `201`s and two `409`s and a non-zero exit. It still proves counting, and it now also
proves the script does not accept the vacuous configuration. Cost if wrong: one acceptance case
rewritten, and the one-racer shape is no longer exercised — deliberate, since it is the shape being
forbidden.

### The residuals this slice leaves — `D-10-1`

- **`D-10-1` — §8.6's operations column and the contract test's matrix are two transcriptions tied
  by nothing.** AC-2 is prose; only review catches a divergence, and parsing §8.6 from a test was
  declined at step 1 because it makes arc42 a machine-readable input. `A-06-2`'s minting half is the
  same shape — `tests/architecture/` holds a denylist over `src/**`, not a proof. §11.1 carries it,
  with no destination slice because there is none.

### `R-10-6`, `R-10-7`, `R-10-8`

**`R-10-6`** — true as measured; `vitest.mutation.config.ts` includes `tests/unit/**` only, so the
`components` block cannot be scored. No code: the guard is real (slice 09's AC-7 fails when the
committed document loses the entries) and it is the *number* that is partial. **§11.1 carries the
caveat**, because `server.ts`'s 79.05 is read as evidence elsewhere.

**`R-10-7`** — fixed. `seed.mjs` is Node, so `R-09-12`'s no-coreutils constraint never applied to
it and the literal bought nothing. Roll the **date** forward from today and keep `09:00Z`: the
`+2h` reschedule target stays inside the seeded 08:00–18:00 window by construction, which the
literal only achieved by accident of the day it was written.

**`R-10-8`** — out of scope, and I am not widening the last slice to take it. Twenty racers
answering ten times is `D-09-4`'s open mechanism seen again, and the missing answers are the
saturated-pool half of `D-07-1` — a **new taxonomy row** that QS-11 requires reached end to end,
which is booking-path work. Recorded in §11.1 against both rows, with no destination slice and the
reason there is none stated there rather than implied.
