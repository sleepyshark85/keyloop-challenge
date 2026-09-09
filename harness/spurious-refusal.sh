#!/usr/bin/env bash
#
# Slice 15 — `docs/slices/15-design.md` §5 · AC-4 through AC-8. QS-3's harder half,
# demonstrated from a terminal: given M free bays and M free qualified technicians, N
# concurrent bookings for the SAME slot confirm exactly min(N, M) and refuse the rest —
# `double-booking.sh` shows "we never double-book"; this shows "we never refuse you while a
# bay is free", named for the hazard as its sibling is.
#
# CAPACITY is derived from the fixture's OWN DECLARED counts
# (CAPACITY_BAY_COUNT / CAPACITY_QUALIFIED_TECHNICIAN_COUNT — env `harness:seed` exports),
# never from what the racers report. A script that inferred it from the responses would be
# asserting whatever happened, regardless of what it saw — slice 10's AC-5 defect verbatim.
# AC-6 is the negative control that keeps this true: overriding CAPACITY to a wrong value must
# make the script fail, which only happens if CAPACITY is never re-derived from the answers.
#
# Guards (AC-8), each a usage error (exit 2) BEFORE any request is fired:
#   REQUEST_COUNT < 2                        — one racer demonstrates no contention (R-10-5)
#   CAPACITY_BAY_COUNT != CAPACITY_QUALIFIED_TECHNICIAN_COUNT
#                                             — outside QS-3's proven shape (B = T); with
#                                               unequal counts the attainable number is a
#                                               maximum bipartite matching, not min(N,M)
#   CAPACITY < 2                              — that demonstration is double-booking.sh's
#
# Env: BASE_URL, CAPACITY_DEALERSHIP_ID, CAPACITY_SERVICE_TYPE_ID, CAPACITY_CUSTOMER_ID,
#      CAPACITY_VEHICLE_ID, CAPACITY_STARTS_AT, CAPACITY_BAY_COUNT,
#      CAPACITY_QUALIFIED_TECHNICIAN_COUNT — all from `npm run --silent harness:seed`.
# Env (optional): REQUEST_COUNT (default 10, minimum 2); CAPACITY (default
#      CAPACITY_BAY_COUNT, override only to exercise AC-6's negative control).
set -euo pipefail

: "${BASE_URL:?BASE_URL is required}"
: "${CAPACITY_DEALERSHIP_ID:?CAPACITY_DEALERSHIP_ID is required}"
: "${CAPACITY_SERVICE_TYPE_ID:?CAPACITY_SERVICE_TYPE_ID is required}"
: "${CAPACITY_CUSTOMER_ID:?CAPACITY_CUSTOMER_ID is required}"
: "${CAPACITY_VEHICLE_ID:?CAPACITY_VEHICLE_ID is required}"
: "${CAPACITY_STARTS_AT:?CAPACITY_STARTS_AT is required}"
: "${CAPACITY_BAY_COUNT:?CAPACITY_BAY_COUNT is required}"
: "${CAPACITY_QUALIFIED_TECHNICIAN_COUNT:?CAPACITY_QUALIFIED_TECHNICIAN_COUNT is required}"
REQUEST_COUNT="${REQUEST_COUNT:-10}"

if [ "$REQUEST_COUNT" -lt 2 ]; then
  echo "spurious-refusal.sh: REQUEST_COUNT must be at least 2 to demonstrate contention (got $REQUEST_COUNT)." >&2
  exit 2
fi

if [ "$CAPACITY_BAY_COUNT" -ne "$CAPACITY_QUALIFIED_TECHNICIAN_COUNT" ]; then
  echo "spurious-refusal.sh: CAPACITY_BAY_COUNT ($CAPACITY_BAY_COUNT) must equal CAPACITY_QUALIFIED_TECHNICIAN_COUNT ($CAPACITY_QUALIFIED_TECHNICIAN_COUNT) — QS-3's proven shape is B = T." >&2
  exit 2
fi

# The ONLY place CAPACITY is derived — from the fixture's declared counts, overridable for
# AC-6's negative control alone. Nothing below this line re-derives it from a response.
CAPACITY="${CAPACITY:-$CAPACITY_BAY_COUNT}"

if [ "$CAPACITY" -lt 2 ]; then
  echo "spurious-refusal.sh: CAPACITY must be at least 2 to demonstrate a spurious refusal (got $CAPACITY) — that demonstration is double-booking.sh's." >&2
  exit 2
fi

PAYLOAD=$(printf '{"dealershipId":"%s","customerId":"%s","vehicleId":"%s","serviceTypeId":"%s","startsAt":"%s"}' \
  "$CAPACITY_DEALERSHIP_ID" "$CAPACITY_CUSTOMER_ID" "$CAPACITY_VEHICLE_ID" "$CAPACITY_SERVICE_TYPE_ID" "$CAPACITY_STARTS_AT")

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

# Fired in the background, together — PostgreSQL's exclusion constraints adjudicate
# SIMULTANEOUS writers, not sequential ones. Each racer's status AND body land in their own
# files so AC-5's distinctness check below can read the confirmed bodies without the racers'
# output clobbering one another mid-write.
pids=()
for i in $(seq 1 "$REQUEST_COUNT"); do
  (curl -sS -o "$TMPDIR/$i.body" -w '%{http_code}\n' -X POST "$BASE_URL/appointments" \
    -H 'content-type: application/json' -d "$PAYLOAD" > "$TMPDIR/$i.status") &
  pids+=($!)
done

for pid in "${pids[@]}"; do
  wait "$pid"
done

count_confirmed=0
count_refused=0
for i in $(seq 1 "$REQUEST_COUNT"); do
  status="$(cat "$TMPDIR/$i.status" 2>/dev/null || echo "no-response")"
  echo "racer $i: HTTP $status"
  case "$status" in
    201) count_confirmed=$((count_confirmed + 1)) ;;
    409) count_refused=$((count_refused + 1)) ;;
  esac
done

# min(N, CAPACITY) — computed ONCE, from REQUEST_COUNT and the CAPACITY derived above, and used
# for both the count comparison and AC-5's distinctness check. Never re-derived from what the
# racers reported.
if [ "$REQUEST_COUNT" -le "$CAPACITY" ]; then
  expected_confirmed="$REQUEST_COUNT"
else
  expected_confirmed="$CAPACITY"
fi
expected_refused=$((REQUEST_COUNT - expected_confirmed))

# NEITHER STATUS CODE APPEARS AS A BARE WORD BELOW THIS LINE, DELIBERATELY (mirrors
# double-booking.sh): "confirmed"/"refused" say the same thing without letting a summary line
# inflate a count any consumer might take from the whole of stdout+stderr.
echo "summary: ${count_confirmed} confirmed, ${count_refused} refused, ${REQUEST_COUNT} fired, CAPACITY=${CAPACITY}"

if [ "$count_confirmed" -ne "$expected_confirmed" ] || [ "$count_refused" -ne "$expected_refused" ]; then
  echo "FAIL: expected exactly $expected_confirmed confirmed and $expected_refused refused." >&2
  exit 1
fi

# AC-5: the CONFIRMED bodies alone must name min(N,CAPACITY) DISTINCT bay ids and as many
# distinct technician ids — the same claim `no-spurious-refusal.test.ts` makes. `grep -o`, not
# `jq`: the flat `AppointmentView` shape its sibling already reads needs nothing more.
if [ "$expected_confirmed" -gt 0 ]; then
  bay_ids=()
  technician_ids=()
  for i in $(seq 1 "$REQUEST_COUNT"); do
    status="$(cat "$TMPDIR/$i.status" 2>/dev/null || echo "")"
    if [ "$status" = "201" ]; then
      bay_id="$(grep -o '"bayId":"[^"]*"' "$TMPDIR/$i.body" | head -1 | cut -d'"' -f4)"
      technician_id="$(grep -o '"technicianId":"[^"]*"' "$TMPDIR/$i.body" | head -1 | cut -d'"' -f4)"
      bay_ids+=("$bay_id")
      technician_ids+=("$technician_id")
    fi
  done

  distinct_bays="$(printf '%s\n' "${bay_ids[@]}" | sort -u | wc -l | tr -d ' ')"
  distinct_technicians="$(printf '%s\n' "${technician_ids[@]}" | sort -u | wc -l | tr -d ' ')"

  if [ "$distinct_bays" -ne "$expected_confirmed" ] || [ "$distinct_technicians" -ne "$expected_confirmed" ]; then
    echo "FAIL: expected $expected_confirmed distinct bay ids and $expected_confirmed distinct technician ids among the confirmed bodies (got $distinct_bays bays, $distinct_technicians technicians)." >&2
    exit 1
  fi
fi

echo "PASS: exactly $expected_confirmed confirmed (distinctly) and $expected_refused refused."
exit 0
