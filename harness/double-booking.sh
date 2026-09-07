#!/usr/bin/env bash
#
# AC-11 — `CLAUDE.md` §2.1's invariant, demonstrated from a terminal, without the test suite.
# Fires REQUEST_COUNT concurrent `POST /appointments` at the SAME slot and prints one line per
# response carrying its HTTP status: exactly one `201`, the rest `409` — the database, not this
# script, is what makes that true (`no-spurious-refusal`'s own claim, exercised by hand).
#
# Env: BASE_URL, DEALERSHIP_ID, SERVICE_TYPE_ID, CUSTOMER_ID, VEHICLE_ID, STARTS_AT, REQUEST_COUNT.
set -euo pipefail

: "${BASE_URL:?BASE_URL is required}"
: "${DEALERSHIP_ID:?DEALERSHIP_ID is required}"
: "${SERVICE_TYPE_ID:?SERVICE_TYPE_ID is required}"
: "${CUSTOMER_ID:?CUSTOMER_ID is required}"
: "${VEHICLE_ID:?VEHICLE_ID is required}"
: "${STARTS_AT:?STARTS_AT is required}"
: "${REQUEST_COUNT:?REQUEST_COUNT is required}"

PAYLOAD=$(printf '{"dealershipId":"%s","customerId":"%s","vehicleId":"%s","serviceTypeId":"%s","startsAt":"%s"}' \
  "$DEALERSHIP_ID" "$CUSTOMER_ID" "$VEHICLE_ID" "$SERVICE_TYPE_ID" "$STARTS_AT")

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

# Fired in the background, together, rather than one at a time — the whole point is that
# PostgreSQL's exclusion constraint adjudicates SIMULTANEOUS writers, not sequential ones. Each
# racer's status lands in its own file so this script prints every response without them
# clobbering one another's output mid-write.
pids=()
for i in $(seq 1 "$REQUEST_COUNT"); do
  (curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$BASE_URL/appointments" \
    -H 'content-type: application/json' -d "$PAYLOAD" > "$TMPDIR/$i.status") &
  pids+=($!)
done

for pid in "${pids[@]}"; do
  wait "$pid"
done

for i in $(seq 1 "$REQUEST_COUNT"); do
  status="$(cat "$TMPDIR/$i.status" 2>/dev/null || echo "no-response")"
  echo "racer $i: HTTP $status"
done
