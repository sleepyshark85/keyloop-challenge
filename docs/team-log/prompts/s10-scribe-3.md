# Prompt · slice 10 · scribe · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Write a run-and-scenarios walkthrough
- Sent: 2026-09-08T12:11:58.654Z

---

# A walkthrough: run the application, then exercise every scenario by hand

Working directory `/home/agentadmin/sources/keyloop-challenge`, **branch `main`**. Pull first. The project is complete — eleven slices merged, backlog empty.

The human has asked for **a document that guides them through running the application and testing it through scenarios**. Write `docs/WALKTHROUGH.md`.

## What this is, and what it is not

It is **not** the README. The README has *Install, run, call*, a harness section and a Tests section, and it is deliberately terse. This is the longer companion: someone sitting down with a terminal who wants to **see the system do each thing it claims**, one scenario at a time, and understand what each one proves.

**Do not duplicate the README — link to it.** Where it already carries the install and boot steps, reference them and move on. Your value here is the scenarios.

## The standing rule, and it is the whole point

**Run every command before you write it.** You did exactly this for the harness section: docker compose up, build, migrate, start, `/health` 200, then the exact documented lines twice from a fresh seed. Same discipline. **Every request body, every expected status, every response field you show must be output you actually saw.** If a scenario does not behave as you expect, that is a finding to report — not prose to smooth over.

## The scenarios to cover

Work from the acceptance criteria and arc42 rather than from memory. At minimum:

- **Book an appointment** — the happy path, and what the response carries (allocated bay, technician, interval).
- **Double-booking** — the system's central claim. Two requests for the same slot; one `201`, one `409` with the constraint that refused it. `harness/double-booking.sh` does this concurrently; show the by-hand version too, because seeing the second request refused is the point.
- **Availability** — and that it is **advisory**: a slot returned free may be taken by the time it is booked, which the contract says out loud.
- **Reschedule** — including that a refused move leaves the original appointment confirmed at its original time.
- **Cancel** — and that a cancelled appointment frees its slot.
- **Opening hours** — a booking outside them, and the problem document that comes back.
- **Unknown or mismatched references** — an unknown vehicle, and a vehicle that belongs to a different customer.
- **The error contract itself** — that every error is `application/problem+json` with a `type` from a closed set, since slice 10 exists to make that true and assertable.

For each: **the command, the response you saw, and one line on what it proves** — which invariant, criterion or quality scenario. That last line is what makes this a walkthrough rather than a list of curls.

## Also worth a short section

**How to run the tests**, and what the three projects mean — `nodb`, `db` and `perf` — since `perf` exists because a budget measured beside the twenty-racer concurrency suite is measuring the runner rather than the service. And how to read a failure: the project split exists so a container problem is distinguishable from an assertion failure.

## Constraints

- `docs/WALKTHROUGH.md` is a new file at `docs/` root — outside the budget survey, so length is your judgement. **Use that freedom for completeness, not padding.** Terse commands, real output, one line of meaning each.
- `README.md` is yours if it needs a pointer to the new document; keep that to one line and mind its budget.
- **Do not touch** `src/`, `tests/`, `harness/`, `docs/slices/`, `docs/adr/` or other arc42 sections.
- All four doc checks and `npm run test:tools` green. Commit `docs: `, **explicit pathspecs**, push to `main`.
- Tear down anything you start.

## Return

The structured report, plus: **which scenarios you actually executed versus any you could not**, and anything that did not behave as the documents claim. The second is worth more than the document itself.
