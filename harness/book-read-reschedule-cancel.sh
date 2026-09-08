#!/usr/bin/env bash
#
# AC-4 / AC-6 (`docs/slices/10-openapi-and-curl-harness.md`; slice 09's AC-10 originally) — the
# cURL harness's happy-path script. arc42 §3.1's "the harness as the stubbed client" (`CLAUDE.md`
# §1 declines a client SDK or a UI beyond this).
#
# Books, reads, reschedules and cancels ONE appointment against a running service, printing the
# HTTP status and the `type`/`status` of each response, and FAILING ON THE FIRST STATUS THAT IS
# NOT THE ONE THAT STEP MUST ANSWER — AC-4's own wording, and the fix for this script's slice-09
# defect: only `book`'s status used to gate an `exit 1`; `read`, `reschedule` and `cancel` printed
# whatever they got and the script always continued. Every `curl` here sets
# `content-type: application/json` reflexively, exactly as `tests/support/booking.ts`'s
# `postBooking` already does, which is precisely the client behaviour AC-6b's fix (`server.ts`'s
# content-type parser) makes safe against the cancellation route: that route reads no body, and
# this harness sends the header anyway.
#
# No `jq`: this project's runners are not guaranteed to have it (`tests/acceptance/harness.test.ts`
# spawns this script exactly as written, on whatever image is available), and the response shapes
# are flat enough — `AppointmentView`, `Problem` — that a small `grep`/`sed` extraction is a
# dependency this script does not need to add.
#
# No GNU-only coreutils (AC-6, `R-09-12`): the old GNU-only date-arithmetic invocation is
# replaced below by `node -e`, since every runner that can run this service already has Node.
# The RESCHEDULE OFFSET — two hours — is a DELIBERATE INTERFACE COMMITMENT carried over unchanged
# from the version this replaces: `tests/acceptance/harness.test.ts`'s own `RESCHEDULE_OFFSET_MS`
# pre-books exactly that instant to force a collision, so a change here would fail that test for a
# diagnosable reason rather than silently stop landing on its target.
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

# `$1` label, `$2` actual status, `$3` expected status, `$4` body (for the diagnostic only).
# Exits 1 the moment a step answers anything other than what that step must — AC-4's whole point.
require_status() {
  local label="$1" actual="$2" expected="$3" body="$4"
  if [ "$actual" != "$expected" ]; then
    echo "${label} did not answer ${expected}; stopping.  body: ${body}" >&2
    exit 1
  fi
}

echo "== book: POST /appointments =="
BOOK_PAYLOAD=$(printf '{"dealershipId":"%s","customerId":"%s","vehicleId":"%s","serviceTypeId":"%s","startsAt":"%s"}' \
  "$DEALERSHIP_ID" "$CUSTOMER_ID" "$VEHICLE_ID" "$SERVICE_TYPE_ID" "$STARTS_AT")
BOOK_RAW=$(request POST /appointments "$BOOK_PAYLOAD")
BOOK_STATUS=$(status_of "$BOOK_RAW")
BOOK_BODY=$(body_of "$BOOK_RAW")
report book "$BOOK_STATUS" "$BOOK_BODY"
require_status book "$BOOK_STATUS" 201 "$BOOK_BODY"

APPOINTMENT_ID="$(extract id "$BOOK_BODY")"
if [ -z "$APPOINTMENT_ID" ]; then
  echo "could not read the appointment id from the booking response: $BOOK_BODY" >&2
  exit 1
fi

echo "== read: GET /appointments/${APPOINTMENT_ID} =="
READ_RAW=$(request GET "/appointments/${APPOINTMENT_ID}")
READ_STATUS=$(status_of "$READ_RAW")
READ_BODY=$(body_of "$READ_RAW")
report read "$READ_STATUS" "$READ_BODY"
require_status read "$READ_STATUS" 200 "$READ_BODY"

# Two hours later — well inside the fixture's opening hours (arc42 §8.1) and the same,
# now-vacated slot's own resources, so a move here needs no second slot reserved for it. `node -e`
# in place of the old GNU-only date arithmetic (AC-6); the millisecond math is exact, so `.000Z`
# whenever STARTS_AT itself carries none.
RESCHEDULED_STARTS_AT="$(STARTS_AT="$STARTS_AT" node -e '
  process.stdout.write(new Date(new Date(process.env.STARTS_AT).getTime() + 2 * 60 * 60 * 1000).toISOString());
')"
echo "== reschedule: PATCH /appointments/${APPOINTMENT_ID} =="
RESCHEDULE_PAYLOAD=$(printf '{"startsAt":"%s"}' "$RESCHEDULED_STARTS_AT")
RESCHEDULE_RAW=$(request PATCH "/appointments/${APPOINTMENT_ID}" "$RESCHEDULE_PAYLOAD")
RESCHEDULE_STATUS=$(status_of "$RESCHEDULE_RAW")
RESCHEDULE_BODY=$(body_of "$RESCHEDULE_RAW")
report reschedule "$RESCHEDULE_STATUS" "$RESCHEDULE_BODY"
require_status reschedule "$RESCHEDULE_STATUS" 200 "$RESCHEDULE_BODY"

echo "== cancel: POST /appointments/${APPOINTMENT_ID}/cancellation =="
# NO BODY — and content-type IS still set (AC-6b). Before slice 09's fix this was 400.
CANCEL_RAW=$(request POST "/appointments/${APPOINTMENT_ID}/cancellation")
CANCEL_STATUS=$(status_of "$CANCEL_RAW")
CANCEL_BODY=$(body_of "$CANCEL_RAW")
report cancel "$CANCEL_STATUS" "$CANCEL_BODY"
require_status cancel "$CANCEL_STATUS" 200 "$CANCEL_BODY"

echo "done."
