---
id: "09"
title: Observability — the check-then-act window is visible, and conflicts are counted
status: ready
depends_on: ["08"]
arc42: ["§8.4"]
adr: [10]
quality_scenarios: [QS-13]
loopbacks: 0
---

## Goal

A booking's advisory candidate read and its insert are separate spans, so the window the design
deliberately does not depend on is *visible* in a waterfall rather than merely argued about in
documentation. `booking_conflicts_total{resource}` makes quality goal 1 measurable in production and
not only in tests.

## Acceptance criteria

- **AC-1** — Given an in-memory OTel exporter and a booking that retries once then succeeds, when the
  trace is read, then it contains an `availability.candidates` span that **ends before** the first
  `appointment.insert` span begins. *(QS-13)*
- **AC-2** — In the same trace, exactly two `appointment.insert` spans exist; the failed one carries
  `db.sqlstate=23P01` and `db.constraint`.
- **AC-3** — In the same run, `booking_conflicts_total{resource="bay",outcome="absorbed"}` increments
  by exactly 1 and **no** `outcome="refused"` increment occurs.
- **AC-4** — Given a booking that is refused after exhausting candidates, then `outcome="refused"`
  increments and `absorbed` does not.
- **AC-5** — Given a `409` from moving a cancelled appointment, when metrics are read, then
  `booking_conflicts_total` did **not** increment — it counts `23P01`, and a state conflict is not
  contention (§8.4, §8.6).
- **AC-6** — Given any request, when its logs are read, then they are structured `pino` output
  correlated to the trace, and contain no customer name, VIN or vehicle description.

## In scope

- OpenTelemetry spans and metrics per §8.4, `pino` structured logging, and
  `tests/integration/telemetry-booking.test.ts`.
- The `grafana/otel-lgtm` stack from `docker-compose.yml` becoming useful for the demo.

## Out of scope

- Alerting, dashboards-as-code, or an SLO document. §11 carries them.
- Tracing the availability query's internals. The span that matters is the one that shows the window.

## Definition of done

Beyond `CLAUDE.md` §10:

- A screenshot of the waterfall showing the window is captured for the phase 7 shot list. It is the
  clearest single image of what this architecture decided.
