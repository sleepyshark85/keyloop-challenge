#!/usr/bin/env bash
#
# AC-10 — the cURL harness's happy-path script. `docs/slices/09-observability.md`, arc42 §3.1's
# "the harness as the stubbed client" (`CLAUDE.md` §1 declines a client SDK or a UI beyond this).
#
# Books, reads, reschedules and cancels ONE appointment against a running service, printing the
# HTTP status and the `type`/`status` of each response — AC-10's own wording. Every `curl` here
# sets `content-type: application/json` reflexively, exactly as `tests/support/booking.ts`'s
# `postBooking` already does, which is precisely the client behaviour AC-6b's fix (`server.ts`'s
# content-type parser) makes safe against the cancellation route: that route reads no body, and
# this harness sends the header anyway.
#
# No `jq`: this project's runners are not guaranteed to have it (`tests/acceptance/harness.test.ts`
# spawns this script exactly as written, on whatever image is available), and the response shapes
# are flat enough — `AppointmentView`, `Problem` — that a small `grep`/`sed` extraction is a
# dependency this script does not need to add.
#
# Env: BASE_URL, DEALERSHIP_ID, SERVICE_TYPE_ID, CUSTOMER_ID, VEHICLE_ID, STARTS_AT.
set -euo pipefail

: "${BASE_URL:?BASE_URL is required}"
: "${DEALERSHIP_ID:?DEALERSHIP_ID is required}"
: "${SERVICE_TYPE_ID:?SERVICE_TYPE_ID is required}"
: "${CUSTOMER_ID:?CUSTOMER_ID is required}"
: "${VEHICLE_ID:?VEHICLE_ID is required}"
: "${STARTS_AT:?STARTS_AT is required}"

# `"$1":"<value>"` — the ONE quoted-string shape every field this script reads takes
# (`AppointmentView`'s `id`/`status`, `Problem`'s `type`). A numeric `Problem.status` is
# deliberately NOT matched by this pattern; `report()` below falls back to `type` for it.
extract() {
  # `|| true` is load-bearing under `set -o pipefail`: a SUCCESS body carries no `type` at all
  # (only a `Problem` does), so `grep` legitimately finds nothing and exits 1 — which, unguarded,
  # would make `pipefail` fail this whole pipeline and abort the script on the happy path.
  printf '%s' "$2" | grep -o "\"$1\":\"[^\"]*\"" | head -n1 | sed -E "s/^\"$1\":\"//; s/\"\$//" || true
}

# `curl -w` appends the status code on its own trailing line, so ONE request yields both the
# body and the status — issuing the request twice would book (or cancel) it twice.
request() {
  local method="$1" path="$2" data="${3:-}"
  local raw
  if [ -n "$data" ]; then
    raw=$(curl -sS -X "$method" "$BASE_URL$path" -H 'content-type: application/json' -d "$data" -w $'\n%{http_code}')
  else
    raw=$(curl -sS -X "$method" "$BASE_URL$path" -H 'content-type: application/json' -w $'\n%{http_code}')
  fi
  printf '%s' "$raw"
}

status_of() { printf '%s' "$1" | tail -n1; }
body_of() { printf '%s' "$1" | sed '$d'; }

report() {
  local label="$1" status="$2" body="$3"
  local kind
  kind="$(extract type "$body")"
  if [ -z "$kind" ]; then kind="$(extract status "$body")"; fi
  echo "${label}: HTTP ${status} type=${kind:-n/a}"
}

echo "== book: POST /appointments =="
BOOK_PAYLOAD=$(printf '{"dealershipId":"%s","customerId":"%s","vehicleId":"%s","serviceTypeId":"%s","startsAt":"%s"}' \
  "$DEALERSHIP_ID" "$CUSTOMER_ID" "$VEHICLE_ID" "$SERVICE_TYPE_ID" "$STARTS_AT")
BOOK_RAW=$(request POST /appointments "$BOOK_PAYLOAD")
BOOK_STATUS=$(status_of "$BOOK_RAW")
BOOK_BODY=$(body_of "$BOOK_RAW")
report book "$BOOK_STATUS" "$BOOK_BODY"

if [ "$BOOK_STATUS" != "201" ]; then
  echo "book did not answer 201; stopping.  body: $BOOK_BODY" >&2
  exit 1
fi

APPOINTMENT_ID="$(extract id "$BOOK_BODY")"
if [ -z "$APPOINTMENT_ID" ]; then
  echo "could not read the appointment id from the booking response: $BOOK_BODY" >&2
  exit 1
fi

echo "== read: GET /appointments/${APPOINTMENT_ID} =="
READ_RAW=$(request GET "/appointments/${APPOINTMENT_ID}")
report read "$(status_of "$READ_RAW")" "$(body_of "$READ_RAW")"

# Two hours later — well inside the fixture's opening hours (arc42 §8.1) and the same,
# now-vacated slot's own resources, so a move here needs no second slot reserved for it.
RESCHEDULED_STARTS_AT="$(date -u -d "${STARTS_AT} + 2 hours" +"%Y-%m-%dT%H:%M:%S.000Z")"
echo "== reschedule: PATCH /appointments/${APPOINTMENT_ID} =="
RESCHEDULE_PAYLOAD=$(printf '{"startsAt":"%s"}' "$RESCHEDULED_STARTS_AT")
RESCHEDULE_RAW=$(request PATCH "/appointments/${APPOINTMENT_ID}" "$RESCHEDULE_PAYLOAD")
report reschedule "$(status_of "$RESCHEDULE_RAW")" "$(body_of "$RESCHEDULE_RAW")"

echo "== cancel: POST /appointments/${APPOINTMENT_ID}/cancellation =="
# NO BODY — and content-type IS still set (AC-6b). Before this slice's fix this was 400.
CANCEL_RAW=$(request POST "/appointments/${APPOINTMENT_ID}/cancellation")
report cancel "$(status_of "$CANCEL_RAW")" "$(body_of "$CANCEL_RAW")"

echo "done."
