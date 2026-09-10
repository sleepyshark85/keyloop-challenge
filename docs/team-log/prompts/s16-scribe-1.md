# Prompt · slice 16 · scribe · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 16 walkthrough update
- Sent: 2026-09-10T02:12:18.157Z

---

Slice **16**, branch `slice/16-availability-derives-its-own-window`, PR #24. `docs/WALKTHROUGH.md` documents a request shape that no longer exists as of this slice. Fix Scenario 3, and only what that requires.

## What changed in the system

`GET /availability` used to take `dealershipId`, `serviceTypeId`, `from` and `to`. As of this slice it takes `dealershipId`, `serviceTypeId`, **`startsAt`** — and derives its own window by calling the same `deriveInterval` the booking path uses, then **names the derived interval in its own `200`** (`startsAt` and `endsAt` are now fields of the response body).

Read `docs/slices/16-availability-derives-its-own-window.md` and `docs/adr/0039-availability-takes-a-start-not-a-window.md` for why. In one line: the caller was being made to re-implement a derivation the booking path deliberately keeps server-side, and a caller who guessed a 30-minute window for a 60-minute job was told a bay was free and then refused `409` by the booking.

## Your task

- **Scenario 3** — the `curl` still sends `from`/`to` and will now answer `400`. Rewrite it to send `startsAt`, and replace the shown response with one you have **actually observed**, not one you composed. Every claim in this document cites an artifact; a response body you did not run is exactly the kind of thing this file must not contain.
- Scenario 3's prose says the result is advisory and can go stale between the read and the write. That claim is **unchanged and still true** — do not weaken it. What changes is that the interval is now the server's, named in the response, rather than a window the caller chose.
- Check the rest of the document for anything else this slice falsifies — search for `from=`, `to=`, `/availability`, and any prose describing the caller supplying a window. Fix what this slice broke. **Do not** fix unrelated staleness you happen to find; report it instead.

## Known, already reported, and NOT yours to fix in this pass

The human found on 2026-09-10 that Scenarios 3–8 hard-code seven absolute `2026-09-09T…` instants captured on the day the document was written. Scenario 3's is one of them, and rewriting that `curl` will incidentally settle it. **The other six are a separate concern** — they do not 400, they just quietly book yesterday's slots — and they are not this slice's to fix. Note them in your report; do not touch them.

## How to run it

The service and database must be up. Follow `README.md` §*Install, run, call*. Seeding: `export DATABASE_URL=postgresql://keyloop:keyloop@127.0.0.1:5432/keyloop`, `export BASE_URL=http://localhost:3000`, then `eval "$(npm run --silent harness:seed)"`. Note the service on port 3000 is running a **pre-slice-16 build** — you must `npm run build` and restart it against this branch before you capture anything, or you will record the old contract. Confirm you did.

One seed gives you one free 09:00 slot on a one-bay dealership; re-seed or step the hour (07:00Z–16:00Z is inside opening hours) if you need a clean slot.

## Discipline

- Your paths only: `docs/WALKTHROUGH.md`. Do **not** touch `docs/slices/`, `docs/adr/`, `docs/arc42/`, `docs/team-log/`, `src/`, `tests/` or `harness/`.
- Commit your work, message shaped `docs(16): …`. Do not push — I push.
- If the document's claim and the system's behaviour disagree in a way you cannot resolve by editing prose, raise it rather than writing something that reads well and is false.

Report: what you changed, the commands you actually ran and their real output, and anything you found and deliberately left alone.
