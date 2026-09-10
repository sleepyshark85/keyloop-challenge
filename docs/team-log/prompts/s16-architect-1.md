# Prompt · slice 16 · architect · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 16 design
- Sent: 2026-09-10T00:58:39.982Z

---

Step 1 (DESIGN) for a new slice, id **16**, branch `slice/16-availability-derives-its-own-window` (already cut from `main` at 3819edb; slice 15 merged as PR #23, so the WIP limit is clear). You are the architect. Produce the design; do not implement, and do not write tests.

## The finding, raised by the human at the gate on 2026-09-10

`POST /appointments` takes `startsAt` only and derives `endsAt` server-side from the service type's duration (`src/application/deriveInterval.ts`). `GET /availability` requires the client to supply **both** `from` and `to` — while already receiving `serviceTypeId`, so the server has everything it needs to derive the window itself. The client is therefore made to re-implement a derivation the booking endpoint deliberately keeps server-side.

The human's words: *"since booking an appointment only need to pass in start time, I would expect the availability check also require the same, not end time"*.

### Reproduction (run against a live service on 2026-09-10, seeded scarce subtree, 60-minute service type)

```
an appointment already exists at 09:30 (occupying 09:30-10:30)

client asks about 09:00 but guesses a 30-minute window:
  GET /availability  from=09:00 to=09:30  ->  bays=[...] (FREE)
  POST /appointments startsAt=09:00       ->  HTTP 409

same question with the correct 60-minute window:
  GET /availability  from=09:00 to=10:00  ->  bays=[] (busy)
```

The endpoint reported 09:00 free and the booking refused it — not a race, not staleness, but the client having named a window that is not the interval the booking would occupy.

### What I checked before escalating this to you

- **It is not a violation of what slice 08 proved.** `docs/slices/08-availability-query.md` AC-1 (QS-8) proves the query agrees with the exclusion constraint for *exactly* `[from, to)`, and it does. The property treats the window as given; it says nothing about who chooses it.
- **It sits against the brief.** `Requirements.md:31` — *"Before confirming, check for the availability of both a ServiceBay and a qualified Technician **for the entire service duration**."* The current interface lets a caller name a window that is not the service duration, so the endpoint cannot guarantee it answers that question.
- **The choice was never recorded.** `docs/slices/08-availability-query.md` uses `[from, to)` from its first line without stating why the client supplies the window rather than the server deriving it. There is no ADR — ADR-0032 was retired under the human's ADR-bar ruling (`docs/STATUS.md:116`). Under CLAUDE.md §11 this is an undocumented interface decision.

## Scope you are asked to design

`GET /availability` derives its own window: caller sends `dealershipId`, `serviceTypeId`, `startsAt`; the server computes the end through **the same derivation the booking path uses**, so duration has one source of truth.

## Rulings I need from you, each with reasoning on the PR per §6's adjudication convention

1. **Does `from`/`to` go away, or stay alongside `startsAt`?** Nothing in the brief asks for a range query. The only consumers today are `docs/WALKTHROUGH.md` Scenario 3 and the OpenAPI contract; there is no external client. State whether this is a replacement or an addition, and why.
2. **What happens to QS-8's property test.** `tests/property/` generates an arbitrary `[from, to)` and probes agreement with the constraint. If the window becomes derived, the generator's freedom changes shape. Say what the property should assert now — this is the test-engineer's to write, but the *criterion* is yours.
3. **Error taxonomy.** The booking path distinguishes `malformed-instant` from `outside-opening-hours` because they differ in what the client should try next; availability collapses both bad-window cases into one `malformed-window` (`src/application/queryAvailability.ts` docblock explains why). With `to` derived, `to <= from` becomes unreachable by a client. Rule what the residual failure modes are and what each answers.
4. **Whether this warrants an ADR** under the human's bar (`docs/STATUS.md:116`): *closes off an alternative someone would otherwise reasonably take, and would be expensive to reverse*. My reading is that it does — it forecloses the range-query interface — but that is your call, and I would rather you disagreed with me than deferred.
5. **Opening hours.** `queryAvailability` currently applies none. A derived window makes "is this bookable at `startsAt`?" a much closer question to what `POST` answers, and `POST` *does* reject outside-opening-hours. Rule whether availability should now agree on that too, or whether that is scope creep for this slice — naming the criterion either way.

## Constraints

- CLAUDE.md is binding. arc42 is the single source of truth; you are the only role that may write `docs/arc42/` or `docs/adr/`.
- §5 test ownership: `tests/property/`, `tests/contract/`, `tests/acceptance/` are the test-engineer's. Specify criteria, not test code.
- This is a contract change. It touches at minimum `docs/api/openapi.json` (built artifact — check how it is generated), `src/http/routes/`, `src/application/queryAvailability.ts`, the QS-8 property test, `harness/`, `docs/WALKTHROUGH.md` Scenario 3, and `README.md`. Scope it deliberately: say what is in this slice and what is not.
- Minor, fold in only if it belongs: `src/application/queryAvailability.ts:2` still cites "ADR-0032", which was retired. Rule whether correcting that citation is in scope here or is separate.

## Deliverables (write them, commit nothing)

- `docs/slices/16-availability-derives-its-own-window.md` — the slice file in the house style, front-matter matching `docs/slices/_template.md` and the slice-15 file, with numbered acceptance criteria a test can fail on.
- `docs/slices/16-design.md` — building blocks touched, interfaces, data-model delta (I expect none), applicable §10 quality scenarios, proposed arc42 edits stated as edits, and your five rulings with reasoning.
- An ADR in `docs/adr/` if ruling 4 says so.
- Do **not** commit. Report back what you wrote, your five rulings, and anything you disagree with in my framing above — including if you think this whole slice is wrong.

Read `CLAUDE.md`, `docs/slices/_template.md`, `docs/slices/15-*.md` and `docs/slices/08-availability-query.md` before writing, so the house style and the QS-8 history are in hand.
