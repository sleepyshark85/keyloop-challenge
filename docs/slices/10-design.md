# Slice 10 — design, as built

Slice file: [`10-openapi-and-curl-harness.md`](10-openapi-and-curl-harness.md), QS-11. The
through-line: **all three subjects were asserted by tests that could
not fail**, so every ruling was judged on whether it produced an assertion with a reachable red. After
step 7 the architecture is in arc42 §3.1, §8.5, §8.6, §10.2 and §11.1; this keeps the rulings and the
debt.

*The step-1 to step-5 reasoning is on PR #21 and in the event log, its home (§4).*

**Building blocks touched · data-model delta: none.** `src/http/problem.ts`, `src/http/routes/*.ts`,
`tools/docs/openapi.mjs`, `harness/` (with a new `seed.mjs`), `package.json`. Layering and
dependency-cruiser untouched: narrowing a schema adds no forbidden edge.


## What was designed, and what merged

| Decided | As built |
|---|---|
| **The matrix is a column, not a second table.** §8.6 owns status, `type`, when and decided-by already; the operation dimension is the only new fact, and a second grid would re-home the rest | Shipped on §8.6's nine rows, `/health` excluded **by name** with an asserted-empty problem set rather than by silent omission |
| **Equality on (status, type) pairs**, both directions — a superset passes on the defect being removed, and type sets miss `malformed-request` drifting 400→422 | Shipped, widened at `R-10-3` |
| **Measure, do not choose in advance** (`D-09-3`'s precedent). M1: how `application/problem+json` reaches the document. M2: whether a one-member `Type.Union` collapses. The design fixed the property, not the mechanism | Both positive. **M2 — it collapses to a literal and silently substitutes**, §8.5's documented defect reintroduced inside the fix for it, and **eight** cells reach it: narrowing the declaration, the act this slice exists to perform, is what would have armed it. `Type.String({ enum })` measured *worse* — the wrong value reaches the client unvalidated. The remedy is a hand-built `Type.Unsafe` carrying a one-member `anyOf`, which rejects instead. **M1** — the `content` form keeps the serialiser and survives charset, but fails differently from the bare form (`I-10-2`). §8.5 took both corrections, not the one row proposed |
| **The two inherited obligations.** `R-09-13`: the prose splits — contract prose to the operation-level constant, TypeBox rationale to the docblock, the duplicate `description` dropped as measured discarded. `R-09-12`: *"from a terminal"* means the seed prints the environment, and the acceptance test drives both scripts from **only** what the seed printed — never the fixture's ids, which are the suite the criterion says the harness must not need | Both shipped and closed (§3.1, README), with a static denylist of GNU-only utilities over `harness/*.sh`. No emitted byte changed, and `D-08-1`'s three mutants bind to three AC-7 assertions, so AC-7 fails when **any one** literal is emptied |

## Rulings — mid-slice authority, provisional until the gate

- **AC-7's boundary corrected**: the route rejects `to <= from`, so the rule published is *`to` must
  be strictly later than `from`*. As written it would have shipped a rule the code does not implement.
- **AC-3b added.** AC-3's `requestBody` and `(name, in)` equality discharges `A-06-2`'s **contract**
  half — an appointment id is unreachable from a client, which ADR-0025's permanent `absent` rests on
  — but not *"`deps.newId()` is the only mint"*, which I would not let be declared a third time on
  an assertion that does not make it. A `tests/architecture/` marker asserts the uuid-minting file set
  equals `{src/main.ts}`: a denylist, not a proof.
- **`REQUEST_COUNT >= 2` and AC-5's negative control move together.** A bare guard collides with the
  control step 1 specified — one request at an already-taken slot — which would then exit non-zero
  *because of the guard rather than because it counted*, and a control passing for the wrong reason is
  this slice's entire subject. The control now fires **two** racers: zero `201`s, two `409`s, non-zero
  exit. Cost: the one-racer shape goes unexercised, being the shape now forbidden.
- **No ADR**, checked against the human's 2026-09-07 bar and recorded as checked: per-cell narrowing
  refines ADR-0024's closed set rather than closing an alternative, and reversal is one helper.

## Step 5 — eight findings, eight upheld, no loopback

Loopbacks **0 of 2 and unchanged**. `R-10-1` and `R-10-3` block the merge but are **conformance
defects**, not DCR outcomes: the design was right, plainly stated and not built, and §6's table
adjudicates disputes *about a design*. That distinction is the one an architect is most tempted to
blur in its own favour, so: **neither is softened by it.**

| # | Verdict | Remedy |
|---|---|---|
| `R-10-1` | **UPHELD — blocking**, conformance | the README run section, plus an assertion. My *"gate-verified rather than mechanical"* is **withdrawn**: I ruled a three-line test unassertable and the half was then not written at all. Remedy **strengthened**, not merely accepted — set equality between `package.json`'s `harness:*` keys and `README.md`, catching a *new* undocumented script |
| `R-10-2` | **UPHELD — (a) clarification** | probe the shape at document level |
| `R-10-3` | **UPHELD — blocking**, conformance | `/health` by name; no path unvisited |
| `R-10-4` | **UPHELD** | derive the single-type cells from `EXPECTED_PAIRS` — §8.6 transcribed once, not twice, removing the possibility not the instance |
| `R-10-5` | **UPHELD, remedy amended** | `REQUEST_COUNT >= 2`; the negative control moves to two racers |
| `R-10-6` | **UPHELD as measured** | no code; the `components` block is unscorable, `F-06-2` |
| `R-10-7` | **UPHELD** | compute the seed's date; keep the time of day |
| `R-10-8` | **UPHELD, out of scope** | `D-09-4` and `D-07-1`'s saturated-pool half again; §11.1, and I am not widening the last slice |

**`R-10-2` — two levels, and the ambiguous wording was mine.** Re-measured before ruling:
`@fastify/swagger` rewrites `const` to `enum` and `fast-json-stringify` passes an `enum` value through
**unvalidated**, so a collapsed cell returns the probe's wrong value as itself and every cell stays
green while the runtime schema substitutes. M2 said the property must be *shown* and **never said at
which level**; that omission is the defect. Ruling: the behavioural property is asserted at the
**runtime schema**, in the unit test that already fails on the collapse. At **document** level the
emitter has erased the distinction before a test can see it, so behaviour-probing is impossible there
and the only faithful assertion is **shape** — each single-type cell's `type` schema is a one-member
`anyOf`, never a bare `enum` or `const`. A mechanism assertion, which step 1 declined
by name; **I reverse that for the document level alone**, the mechanism being the sole
observable there and discriminating all three measured constructions. Falsified as required: a cell
collapsed, the contract suite red.

**`R-10-3` — my own §1 ruling unbuilt, and the criterion that fails is nameable.** `EXPECTED_PAIRS`
had five keys, leaving the sixth operation unasserted. **AC-1 fails** — *each operation's set is
asserted by equality* — holding over five of six, and equality over a subset the test chose is not
equality. Remedy: that ruling verbatim, plus the assertion closing the **class** and not the
instance — `EXPECTED_PAIRS`' key set equals the `(method, path)` set in `doc.paths`, so a future route
nobody adds to the matrix fails rather than passing unseen.

## The debt this slice booked

- **`D-10-1` — §8.6's operations column and the contract test's matrix are two transcriptions tied by
  nothing**, in full in §11.1. Parsing §8.6 from a test was declined at step 1: it makes arc42 a
  machine-readable input and breaks on reformatting. No destination slice, there being none.

## Assumptions and open questions

- **A-10-1** — the four dropped `(operation, status)` cells are unreachable, read from the routes'
  exhaustive switches. If any is reachable, narrowing turns a working response into a `500`, which
  QS-11's sweep would report on the next commit.
- **OQ-10-1, closed by measurement:** `SwaggerParser` accepts an unreferenced `components.responses`
  entry — and narrowing left a **second** type homeless, unanticipated: `internal` (`I-10-4`).
