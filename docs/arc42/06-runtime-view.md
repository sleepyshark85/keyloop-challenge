# 6. Runtime view

> Owner: architect · Written: phase 2

## 6.1 Concurrent booking — the database decides

**Mandatory.** Two racing requests for the same bay; the exclusion constraint commits the first and
rejects the second with `23P01`, which the service maps to `409 Conflict`. This is the scenario the
whole design exists to make safe, so it is documented before the happy path.

## 6.2 Availability query

## 6.3 Successful booking
