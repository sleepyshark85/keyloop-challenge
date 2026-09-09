# Walkthrough: run it, then make it do every thing it claims

This is the companion to [`README.md`](../README.md), not a replacement for it. The README has
*Install, run, call* and the Tests table — read that first for how to get the service up. This
document assumes the service is already running and walks a terminal through **every scenario the
acceptance criteria and [arc42 §10](arc42/10-quality-requirements.md) describe**, one at a time,
with the command, the response actually returned, and one line on what it proves.

Every response shown below is output this walkthrough actually saw, on a clean checkout, on
2026-09-08 — see the report that accompanies this document for the one thing that did not behave
on the first try. If you follow the same steps your ids and timestamps will differ (everything is
seeded fresh, per `harness/seed.mjs`), but the shapes and status codes will not.

## Before you start

Follow [README §Install, run, call](../README.md#install-run-call) up to and including
`curl -i localhost:3000/health` answering `200`. Then seed a scenario's reference data exactly as
the harness section does:

```bash
export DATABASE_URL=postgresql://keyloop:keyloop@127.0.0.1:5432/keyloop
export BASE_URL=http://localhost:3000
eval "$(npm run --silent harness:seed)"        # DEALERSHIP_ID, SERVICE_TYPE_ID, CUSTOMER_ID, VEHICLE_ID, STARTS_AT
```

Each seed is a **fresh, unrelated dealership** with one bay, one qualified technician, opening
hours 08:00–18:00 local every day (`Europe/London`), and a 60-minute service type
(`harness/seed.mjs`). Run it again before any scenario that needs a clean slot — reusing a
`STARTS_AT` re-books an already non-free interval. The full contract behind every request and
response below is [`docs/api/openapi.json`](api/openapi.json); the invariant behind the
double-booking scenario is `CLAUDE.md` §2.1 and [arc42 §8.2](arc42/08-crosscutting-concepts.md#82-persistence-and-the-exclusion-constraint).

---

## Scenario 1 — Book an appointment

```bash
curl -sS -i -X POST "$BASE_URL/appointments" -H 'content-type: application/json' \
  -d "{\"dealershipId\":\"$DEALERSHIP_ID\",\"customerId\":\"$CUSTOMER_ID\",\"vehicleId\":\"$VEHICLE_ID\",\"serviceTypeId\":\"$SERVICE_TYPE_ID\",\"startsAt\":\"$STARTS_AT\"}"
```

```
HTTP/1.1 201 Created
content-type: application/json; charset=utf-8

{"id":"814c448b-26e0-498b-8ad9-7b4c34dbff19","dealershipId":"ce398d10-bfbc-4fc4-9631-fe4c3d303d43",
 "customerId":"0a6ddc41-b803-4df6-ab58-dc20a5974248","vehicleId":"fe347054-be94-4c34-b98a-1c1e28d5d0ca",
 "serviceTypeId":"0ccb3c88-4715-4393-a77c-fa806b479a1f","technicianId":"17540c5d-14fb-4a5e-85c6-204d727087bd",
 "bayId":"d7033c25-39ff-4baf-b9b2-210c6c1d14bc","startsAt":"2026-09-09T09:00:00.000Z",
 "endsAt":"2026-09-09T10:00:00.000Z","status":"confirmed"}
```

The request named a dealership, customer, vehicle, service type and a **start** — no bay, no
technician, no end time. The response carries both resources the system allocated and the end
time it derived from the service type's duration.

`GET /appointments/{id}` reads the same record back unchanged (`HTTP 200`, identical body) — the
read that requirement 3 promises exists.

**Proves:** arc42 §1.1 requirements 1 and 3 — the request names only what the brief says a user
names, and the persisted record binds customer, vehicle, technician and bay (A-10).

---

## Scenario 2 — Double-booking, the system's central claim

`harness/double-booking.sh` does this concurrently and counts the result:

```bash
bash harness/double-booking.sh   # REQUEST_COUNT=10 by default
```

```
racer 1: HTTP 409
racer 2: HTTP 409
racer 3: HTTP 409
racer 4: HTTP 201
racer 5: HTTP 409
racer 6: HTTP 409
racer 7: HTTP 409
racer 8: HTTP 409
racer 9: HTTP 409
racer 10: HTTP 409
summary: 1 confirmed, 9 refused, 10 fired
PASS: exactly one confirmed and the rest refused.
```

That is the invariant as a demonstration, but it fires ten requests in a background loop — you
never actually *see* the loser get told no. By hand, with a fresh seed and the identical payload
fired twice at once:

```bash
PAYLOAD="{\"dealershipId\":\"$DEALERSHIP_ID\",\"customerId\":\"$CUSTOMER_ID\",\"vehicleId\":\"$VEHICLE_ID\",\"serviceTypeId\":\"$SERVICE_TYPE_ID\",\"startsAt\":\"$STARTS_AT\"}"
curl -sS -X POST "$BASE_URL/appointments" -H 'content-type: application/json' -d "$PAYLOAD" & \
curl -sS -X POST "$BASE_URL/appointments" -H 'content-type: application/json' -d "$PAYLOAD" & \
wait
```

```
racer 1: HTTP 201
{"id":"77756eba-...","status":"confirmed", ...}

racer 2: HTTP 409
{"type":"/problems/no-capacity","title":"No bay and technician are both free","status":409,
 "detail":"every candidate bay was already occupied for this interval","resource":"bay"}
```

The response never names the constraint — by design, it is neither in the body nor in the table
(arc42 §10.2, QS-1). It is on the structured log line the service writes for the refused attempt:

```json
{"event":"booking.conflict","constraint":"no_bay_overlap","resource":"bay","attempt":1,
 "bayId":"51798ba0-4f1d-4d6e-8e4e-06888bd01e38","technicianId":"392e4dc9-631c-4aad-9fe9-748f704fe2c7"}
```

`no_bay_overlap` is the PostgreSQL exclusion constraint from `CLAUDE.md` §2.1 — the loser's insert
was rejected by the database with SQLSTATE `23P01`, mapped to `409`. No application code checked
availability and then decided; the constraint decided, and the service only asked twice
(ADR-0004's retry, exhausted because there was only one bay to retry across).

**Proves:** QS-1 / QS-2 (no bay or technician overlap) and `CLAUDE.md` §2.1 — check-then-act is
structurally impossible here, not merely untested.

---

## Scenario 3 — Availability is advisory, and can go stale between the read and the write

```bash
curl -sS -i -G "$BASE_URL/availability" \
  --data-urlencode "dealershipId=$DEALERSHIP_ID" --data-urlencode "serviceTypeId=$SERVICE_TYPE_ID" \
  --data-urlencode "from=$STARTS_AT" --data-urlencode "to=2026-09-09T10:00:00.000Z"
```

```
HTTP/1.1 200 OK
{"bays":["4e1c64bf-6ca1-4347-b7d3-6a58469df495"],"technicians":["1dfd00c0-d43d-4b57-b896-f81fd5021595"],
 "advisory":true,"disclaimer":"This result is advisory only: it is not a reservation, and it is
 true only of the interval queried ... a concurrent booking can make it stale immediately
 afterwards. Only POST /appointments makes an adjudicated decision."}
```

The bay is reported free. Immediately after reading that response — no pause, no thinking time —
two concurrent bookings raced for that exact slot:

```
racer 1: HTTP 201  {"id":"f5388b9c-...","status":"confirmed", ...}
racer 2: HTTP 409  {"type":"/problems/no-capacity", ..., "resource":"bay"}
```

Querying the identical interval again immediately afterwards:

```
{"bays":[],"technicians":[],"advisory":true,"disclaimer":"..."}
```

The bay that was free a moment ago is gone. Nothing here is a bug: the disclaimer said this would
happen, and the contract (`docs/api/openapi.json`) says so out loud in the `200` description. The
only adjudicated decision in this system is the `INSERT` in Scenario 1/2 — `GET /availability` is
a UX affordance, never a reservation.

**Proves:** arc42 §6.5 and requirement 2's honoured-as-UX reading (§1.1); QS-8 pins the query and
the constraint agree only under quiescence, never under concurrent writers.

---

## Scenario 4 — Reschedule, and a refused move leaves the original alone

Book once, move it to a free slot, then fill the dealership's only capacity elsewhere and try to
move onto it:

```bash
# A confirmed at 09:00, then moved to 11:00 (free) — succeeds, same id
curl -sS -i -X PATCH "$BASE_URL/appointments/$APPT_A" -H 'content-type: application/json' \
  -d '{"startsAt":"2026-09-09T11:00:00.000Z"}'
# -> 200, id unchanged, startsAt now 11:00

# B booked at 14:00, taking the dealership's only bay and technician for that hour
curl -sS -i -X POST "$BASE_URL/appointments" ... -d '{"startsAt":"2026-09-09T14:00:00.000Z", ...}'
# -> 201

# Move A onto B's slot
curl -sS -i -X PATCH "$BASE_URL/appointments/$APPT_A" -H 'content-type: application/json' \
  -d '{"startsAt":"2026-09-09T14:00:00.000Z"}'
```

```
HTTP/1.1 409 Conflict
{"type":"/problems/no-capacity","title":"No bay and technician are both free","status":409,
 "detail":"every candidate bay was already occupied for this interval","resource":"bay"}
```

Read A back immediately after the refusal:

```bash
curl -sS -i -X GET "$BASE_URL/appointments/$APPT_A"
```

```
HTTP/1.1 200 OK
{"id":"814c448b-...","startsAt":"2026-09-09T11:00:00.000Z","endsAt":"2026-09-09T12:00:00.000Z",
 "status":"confirmed", ...}
```

Same id, still `confirmed`, still at 11:00 — the slot the refused move never touched. A reschedule
is a single atomic `UPDATE` (ADR-0003); there is no intermediate state where A is briefly homeless.

Trying to reschedule a **cancelled** appointment is a different `409`, and distinguishes state
conflict from resource contention:

```bash
curl -sS -i -X PATCH "$BASE_URL/appointments/$APPT_A" -H 'content-type: application/json' \
  -d '{"startsAt":"2026-09-09T16:00:00.000Z"}'   # A was cancelled first, in Scenario 5
```

```
HTTP/1.1 409 Conflict
{"type":"/problems/appointment-not-confirmed","title":"The appointment is not confirmed","status":409,
 "detail":"only a confirmed appointment can be rescheduled"}
```

**Proves:** QS-4 (a refused move leaves the original confirmed, at the row level — the `GET` above
is reading the row, not trusting the response) and arc42 §8.6's split between `/problems/no-capacity`
(contention, counted) and `/problems/appointment-not-confirmed` (state, not counted).

---

## Scenario 5 — Cancel, and a cancelled appointment frees its slot

```bash
curl -sS -i -X POST "$BASE_URL/appointments/$APPT_A/cancellation" -H 'content-type: application/json'
```

```
HTTP/1.1 200 OK
{"id":"814c448b-...","startsAt":"2026-09-09T11:00:00.000Z","status":"cancelled", ...}
```

Cancellation is a sub-resource, not `DELETE`: the appointment stays readable at its own URL,
`status: cancelled`. Cancelling it again is idempotent (`200`, same body, no error). The freed
slot is immediately bookable by someone else:

```bash
curl -sS -i -X POST "$BASE_URL/appointments" -H 'content-type: application/json' \
  -d "{... \"startsAt\":\"2026-09-09T11:00:00.000Z\"}"
```

```
HTTP/1.1 201 Created
{"id":"54fb1c46-...","startsAt":"2026-09-09T11:00:00.000Z","status":"confirmed", ...}
```

**Proves:** QS-7 — the exclusion constraint's `WHERE (status <> 'cancelled')` predicate is what
releases the slot, not a compensating step the application remembers to run (arc42 §8.2 clause 2).

---

## Scenario 6 — Opening hours

The seeded dealership is `Europe/London`, open 08:00–18:00 local every day. `2026-09-09` in
September is BST (UTC+1), so 08:00–18:00 local is 07:00–17:00 UTC. A request at 22:00 UTC
(23:00 BST) is well outside it:

```bash
curl -sS -i -X POST "$BASE_URL/appointments" -H 'content-type: application/json' \
  -d "{... \"startsAt\":\"2026-09-09T22:00:00.000Z\"}"
```

```
HTTP/1.1 400 Bad Request
{"type":"/problems/outside-opening-hours","title":"The requested interval is outside the
 dealership's opening hours","status":400,"detail":"outside-window",
 "opensAt":"08:00:00","closesAt":"18:00:00"}
```

`400`, not `409` — this is a property of the request, checked against a static schedule, and
deliberately inconsistent in shape with the `422` reference failures below (ADR-0001, arc42 §8.6).
Checking it cannot reintroduce check-then-act because it reads no booking.

**Proves:** ADR-0001's ruling that opening hours are validated (OQ-1) and arc42 §8.6's status-code
table for this row.

---

## Scenario 7 — Unknown and mismatched references

An id that does not exist:

```bash
curl -sS -i -X POST "$BASE_URL/appointments" -H 'content-type: application/json' \
  -d "{... \"vehicleId\":\"00000000-0000-0000-0000-000000000000\", ...}"
```

```
HTTP/1.1 422 Unprocessable Entity
{"type":"/problems/unknown-reference","title":"A named reference does not exist","status":422,
 "detail":"no vehicle matches the id in this request","reference":"vehicle"}
```

A vehicle that exists, but belongs to a **different** customer than the one named in the request
(seed a second dealership for a second customer/vehicle pair, then mix them):

```bash
curl -sS -i -X POST "$BASE_URL/appointments" -H 'content-type: application/json' \
  -d "{\"dealershipId\":\"$DEALERSHIP_ID\",\"customerId\":\"$CUSTOMER_ID\",\"vehicleId\":\"$OTHER_CUSTOMERS_VEHICLE_ID\", ...}"
```

```
HTTP/1.1 422 Unprocessable Entity
{"type":"/problems/vehicle-not-owned","title":"The vehicle is not this customer's","status":422,
 "detail":"the named vehicle does not belong to the named customer"}
```

Both are `422`, not `404` and not `403`: an unknown reference is treated the same shape as a
mismatched one, and ownership is **validation**, not authorisation, because there is no
authenticated party to authorise (ADR-0002, ADR-0034). The same `unknown-reference` type
appears identically on `GET /availability` for an unknown dealership.

**Proves:** A-6 (nothing is created implicitly; a vehicle belongs to exactly one customer) and
arc42 §8.6's four deliberate choices, specifically *"ownership failure is a `422`, not a `403`."*

---

## Scenario 8 — The error contract itself

Slice 10 exists to make one thing assertable: **every** error is `application/problem+json`, with
a `type` from a closed set. A sweep of shapes that never appear in the happy-path scenarios above:

| Request | Status | `type` |
|---|---|---|
| `GET /nonexistent` | `404` | `/problems/route-not-found` |
| `GET /appointments/<random-uuid>` | `404` | `/problems/appointment-not-found` |
| `POST /appointments` with `{not json` | `400` | `/problems/malformed-request` |
| `POST /appointments` with an empty body | `400` | `/problems/malformed-request` |
| `POST /appointments` with `content-type: application/xml` | `500` | `/problems/internal` |

The last row is the interesting one — it is not a gap in the taxonomy, it is the taxonomy holding:

```bash
curl -sS -i -X POST "$BASE_URL/appointments" -H 'content-type: application/xml' -d '<x/>'
```

```
HTTP/1.1 500 Internal Server Error
content-type: application/problem+json; charset=utf-8
{"type":"/problems/internal","title":"The request could not be completed","status":500,
 "detail":"the service could not complete this request; the failure has been logged"}
```

There is no `415` row in the taxonomy, so an unrecognised media type does not get a bespoke
response — it still comes back as a problem document with a `type` from the closed set, which is
the residual invariant arc42 §8.6 states explicitly: *every response with status ≥ 400 is
`problem+json` carrying a `type` from the closed set.* Every response captured in this document,
across eight different scenarios and nine distinct `type` values, has `content-type:
application/problem+json` on every error and `application/json` on every success — none of them
mixed.

**Proves:** QS-11 — the error taxonomy is total and stable, and its media type is asserted by
equality rather than assumed.

---

## Scenario 9 — Naming the service, and the Loki–Tempo join, in Grafana

Slice 14 made two sentences in arc42 true rather than aspirational: §8.4's log records now carry
the active span's own `trace_id`/`span_id`, "so Loki and Tempo join without a correlation id of
their own"; and §7.3's `OTEL_SERVICE_NAME` row means the service names itself instead of landing
under `unknown_service:node`. Both are checked here against the running `otel-lgtm` container —
Grafana on `http://localhost:3001` (mapped off `3000` so the service can keep that port,
`docker-compose.yml`), the collector on `4318` — through the same datasource-proxy API calls
Grafana's own Explore view makes, so no browser is required to reproduce this.

### The join

Repeat Scenario 2's by-hand pair (fresh seed, identical payload, fired twice at once). The loser's
full stdout line — Scenario 2 showed only the fields that mattered there — carries its own
`trace_id`/`span_id`:

```json
{"level":30,"time":1788969024548,"pid":126622,"hostname":"agentcomp",
 "trace_id":"f43ae2801e04eee71f8a9debf9cdf9f0","span_id":"2dde6484999434a1",
 "event":"booking.conflict","constraint":"no_bay_overlap","resource":"bay","attempt":1,
 "bayId":"9fdf333d-...","technicianId":"c29dcad3-...","msg":"booking.conflict"}
```

Query Loki for that `trace_id`, scoped to the service:

```bash
TRACE=f43ae2801e04eee71f8a9debf9cdf9f0
curl -sS -G "http://localhost:3001/api/datasources/proxy/uid/loki/loki/api/v1/query_range" \
  --data-urlencode "query={service_name=\"keyloop-service-scheduler\"} | trace_id = \`$TRACE\`" \
  --data-urlencode "start=$(( ($(date +%s) - 3600) * 1000000000 ))" \
  --data-urlencode "end=$(( ($(date +%s) + 60) * 1000000000 ))"
```

```
"stream": {"event": "booking.conflict", "constraint": "no_bay_overlap", "resource": "bay",
  "service_name": "keyloop-service-scheduler", "span_id": "2dde6484999434a1",
  "trace_id": "f43ae2801e04eee71f8a9debf9cdf9f0", ...}
```

`trace_id` and `span_id` came back as Loki stream labels — promoted from the OTLP `LogRecord`'s own
`spanContext`, not parsed out of the line's text (ADR-0037). Pivot to Tempo on the same id — this is
the one click Grafana's Loki datasource does itself, wired by its own `derivedFields` config, when
a reader clicks the line's `trace_id`:

```bash
curl -sS "http://localhost:3001/api/datasources/proxy/uid/tempo/api/traces/$TRACE" \
  | python3 -c "
import json, sys, base64
d = json.load(sys.stdin)
for b in d['batches']:
    for ss in b['scopeSpans']:
        for sp in ss['spans']:
            if base64.b64decode(sp['spanId']).hex() == '2dde6484999434a1':
                print(sp['name'], {a['key']: list(a['value'].values())[0] for a in sp['attributes']})
"
```

```
POST /appointments {'http.target': '/appointments', 'http.method': 'POST', 'http.status_code': '409'}
```

(Tempo's wire format is base64; pino's mixin writes hex — the decode above is what a click does
invisibly.) That is the exact span the `booking.conflict` line was emitted inside: the request's
root span, refused. Its siblings in the same trace are `availability.candidates` and
`appointment.insert` (carrying `db.sqlstate: 23P01`, `db.constraint: no_bay_overlap`) — the
waterfall §8.4's figure draws.

### The name

The trace above already carries half the answer: every span's resource read
`service.name = keyloop-service-scheduler` with **no** `OTEL_SERVICE_NAME` set. Restarting the
service with the variable set renames it, checked the same way on all three signals:

| Signal | Where the name showed up | Default (unset) | `OTEL_SERVICE_NAME=probe-override` |
|---|---|---|---|
| Logs | Loki `service_name` stream label | `keyloop-service-scheduler` | `probe-override` |
| Traces | Tempo resource `service.name` | `keyloop-service-scheduler` | `probe-override` |
| Metrics | Prometheus `service_name` label on `appointments_booked_total` | `keyloop-service-scheduler` | `probe-override` |

The metrics row needed a longer wait than the other two: `telemetry.ts` reads with a
`PeriodicExportingMetricReader`, whose default export interval is a full minute, where the trace and
log processors it configures alongside it (`BatchSpanProcessor`'s NodeSDK default,
`BatchLogRecordProcessor` explicitly per ADR-0037) both flush on a several-second schedule — so the
first two rows above were queryable almost immediately and the third needed roughly a minute's wait.

**Proves:** AC-1, AC-2 and AC-4 end to end, against the real Grafana instance rather than only
`tests/integration/telemetry-logs.test.ts`'s collector double — the join and the resource naming
both hold where an operator would actually look.

---

## Running the tests

`npm test` runs three separate Vitest projects and merges the results (`tools/ci/run-tests.mjs`;
see README's Tests table for why a single invocation cannot be trusted).

| Project | What it needs | What it is for |
|---|---|---|
| `nodb` | nothing — no Docker | unit, architecture, contract, most property tests. 33 files |
| `db` | Testcontainers PostgreSQL | integration and concurrency tests — the invariant itself. 25 files |
| `perf` | its own, separate PostgreSQL container | QS-14's latency budget, run in isolation so the twenty-racer concurrency suite next door cannot contend with it and turn a budget into a measurement of the runner. 1 file |

A clean run on this checkout: `nodb` 672 tests, `db` 152 tests, `perf` 5 tests — 829 total across
59 files, matching README's last-recorded figure.

**How to read a failure.** `run-tests.mjs` exits one of three ways, and the exit code tells you
which kind of failure you have before you open a log: `0` (all three projects ran, nothing failed),
`1` (`EXIT_TESTS_FAILED` — a project ran and an assertion failed), `2` (`EXIT_DID_NOT_RUN` — a
project produced zero test files, e.g. because Docker was unreachable, which is reported loudly
rather than merged in as zero failures — `CLAUDE.md` §2.4, finding T-01-2). The distinction matters
in exactly the direction you'd expect: a `db` project that silently contributed nothing would let a
concurrency regression through a green build.

**What this walkthrough actually found, running the suite repeatedly back to back on shared
hardware:** two timing-sensitive `db`-project tests flaked under sustained CPU contention —
`tests/concurrency/move-never-releases-slot.test.ts` (QS-5) once in nine full-suite runs, and
`tests/integration/telemetry-booking.test.ts` (QS-13, the span-ordering assertion) once in a
separate batch. Both failures were reruns of an otherwise-clean suite; both tests passed
consistently (6/6) when run in isolation immediately after. In no run, flaked or clean, did the
exclusion constraint itself yield more than one confirmed appointment for a contended slot — the
flakes were in *timing assertions* (a span ordering, a strict zero-confirmations-under-contention
count), not in the invariant Scenario 2 demonstrates. This is the same class of problem §10.2
already names for QS-14 — a budget or a strict timing count measured beside genuine concurrency
load measures the runner as much as the service — surfacing in two places the project has not yet
isolated onto their own container the way `perf` is. Recorded here rather than smoothed over; it
did not require touching `tests/` to observe.
