# 8. Cross-cutting concepts

> Owner: architect · Written: phase 2, extended per slice

## 8.1 Domain model

## 8.2 Persistence and the exclusion constraint

*Where the central invariant physically lives, and what that implies for testing.*

## 8.3 Observability

*OpenTelemetry traces with `pino` logs correlated by trace id. Spans around the availability check
and the insert separately, so the check-then-act window is visible in a waterfall. Metrics are
domain metrics — `appointments_booked_total`, `booking_conflicts_total`,
`availability_query_duration_seconds` — because CPU graphs do not tell you whether the business
invariant held.*

## 8.4 Testability

*Test levels, ownership, and why acceptance tests are written by a role that never reads `src/`.*

## 8.5 Error handling and API semantics
