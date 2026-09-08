#!/usr/bin/env bash
#
# AC-5 / AC-6 (`docs/slices/10-openapi-and-curl-harness.md`; slice 09's AC-11 originally) —
# `CLAUDE.md` §2.1's invariant, demonstrated from a terminal, without the test suite. Fires
# REQUEST_COUNT concurrent `POST /appointments` at the SAME slot and prints one line per response
# carrying its HTTP status; the DATABASE, not this script, is what makes exactly one land `201`
# and the rest `409` (`no-spurious-refusal`'s own claim, exercised by hand) — but this script now
# COUNTS its own results and EXITS NON-ZERO unless that is exactly what happened. AC-5's own
# defect, fixed here: a script that always exits 0 regardless of what it saw is not a
# demonstration, it is a print statement.
#
# REQUEST_COUNT defaults to 10 (AC-6, `R-09-12`) rather than being required: the happy-path
# collision case needs no more than "more than one", and AC-5's own negative control sets it to 1
# explicitly to test the OTHER shape (an already-taken slot, zero 201s).
#
# Env: BASE_URL, DEALERSHIP_ID, SERVICE_TYPE_ID, CUSTOMER_ID, VEHICLE_ID, STARTS_AT.
# Env (optional): REQUEST_COUNT (default 10).
set -euo pipefail

: "${BASE_URL:?BASE_URL is required}"
: "${DEALERSHIP_ID:?DEALERSHIP_ID is required}"
: "${SERVICE_TYPE_ID:?SERVICE_TYPE_ID is required}"
: "${CUSTOMER_ID:?CUSTOMER_ID is required}"
: "${VEHICLE_ID:?VEHICLE_ID is required}"
: "${STARTS_AT:?STARTS_AT is required}"
REQUEST_COUNT="${REQUEST_COUNT:-10}"

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

# Counted from the SAME per-racer files the printed lines below read — one pass, not two
# independent readings of the same evidence.
count_201=0
count_409=0
for i in $(seq 1 "$REQUEST_COUNT"); do
  status="$(cat "$TMPDIR/$i.status" 2>/dev/null || echo "no-response")"
  echo "racer $i: HTTP $status"
  case "$status" in
    201) count_201=$((count_201 + 1)) ;;
    409) count_409=$((count_409 + 1)) ;;
  esac
done

# NEITHER STATUS CODE APPEARS AS A BARE WORD BELOW THIS LINE, DELIBERATELY: this script is run
# under `tests/acceptance/harness.test.ts`, which counts `\b201\b`/`\b409\b` occurrences in the
# WHOLE of stdout+stderr to check what actually happened — a summary or diagnostic line that
# repeats either number as text would inflate that count against evidence the racer lines above
# already state once each. "confirmed"/"refused" say the same thing without the digits.
echo "summary: ${count_201} confirmed, ${count_409} refused, ${REQUEST_COUNT} fired"

# THE INVARIANT, AS AN EXIT CODE: exactly one racer wins the slot and every other racer is
# refused — fewer refusals than that would mean a spurious refusal happened, and any count of
# confirmations other than exactly one is a double-booking or (REQUEST_COUNT=1 against an
# already-taken slot) a run that never had a winner among these racers at all.
if [ "$count_201" -eq 1 ] && [ "$count_409" -eq $((REQUEST_COUNT - 1)) ]; then
  echo "PASS: exactly one confirmed and the rest refused."
  exit 0
fi

echo "FAIL: expected exactly one confirmed and $((REQUEST_COUNT - 1)) refused." >&2
exit 1
