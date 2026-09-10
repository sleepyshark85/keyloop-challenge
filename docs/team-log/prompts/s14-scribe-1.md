# Prompt · slice 14 · scribe · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 14: README and WALKTHROUGH
- Sent: 2026-09-09T15:49:16.951Z

---

Slice 14 passed its human gate and the architect has finished step 7. Two documents are yours under CLAUDE.md §4, and both are outstanding. Branch `slice/14-otlp-logs-and-service-identity`, PR #22, head `6791fca`. Nothing has merged yet — you are the last work before the merge.

Read `docs/slices/14-otlp-logs-and-service-identity.md`, `docs/slices/14-design.md` (now condensed to the as-built record), the new `docs/adr/0037-bridge-pino-to-opentelemetry-in-process.md`, arc42 §7.3 (`docs/arc42/07-deployment-view.md`) and §8.4 (`docs/arc42/08-crosscutting-concepts.md`), and the five PR comments. **Every claim you write must cite an artifact** — you record what happened, not what was intended.

**What the slice made true:** the service names itself `keyloop-service-scheduler` from its own artifact rather than landing in Grafana as `unknown_service:node`, and every `pino` call now writes to stdout **and** to the collector on the same call, with the active span's trace and span ids on the log record itself rather than only in the line's text.

**Obligation 1 — `README.md`.** The sentence at line ~52 reads "`DATABASE_URL` and `PORT` are required; `LOG_LEVEL` is optional (`src/platform/config.ts`)." That is now incomplete: `config.ts` also reads `OTEL_SERVICE_NAME`, defaulting to `keyloop-service-scheduler`. Add it, cite arc42 §7.3's new row, and keep it to the sentence — this is a one-clause correction, not a section.

**Obligation 2 — `docs/WALKTHROUGH.md`, one new scenario.** This is new scope the human explicitly asked for. **Nothing in that file became false** — its Scenario 2 prints a `booking.conflict` stdout line that is still written exactly as shown, guarded by AC-7 — so you are adding, not correcting. The gap is that the document's premise is *"run it, then make it do every thing it claims"*, and the system now claims something no scenario verifies.

The architect specified the shape, and it is a good one because it makes arc42 §8.4's "join without a correlation id of their own" **runnable** rather than asserted:

- Hang it off Scenario 2's `booking.conflict` line, which the reader has already produced.
- Take that line's `trace_id`, query Loki in Grafana for `{service_name="keyloop-service-scheduler"}` filtered to it, then pivot to the Tempo trace on the same id and land on the span the line was emitted inside.
- Second half: the service dropdown reads `keyloop-service-scheduler` on all three signals rather than `unknown_service:node`, and setting `OTEL_SERVICE_NAME` renames it.

Grafana is at **http://localhost:3001** (the compose file maps it off 3000 so the service can keep that port); the collector takes OTLP on 4318. **Run it before you write it.** `docker compose up -d`, `npm start`, produce the conflict the way Scenario 2 does, and follow your own instructions end to end — a walkthrough step that has never been executed is exactly the kind of claim this project does not accept. If a step does not work as described, say so in your report rather than writing around it.

Match the file's existing voice and structure: numbered scenario heading in the established style, real command blocks, real output pasted rather than invented, and the same habit of explaining *why* the system behaves that way rather than only what to type. Keep it proportionate — Scenario 2 is the longest in the file because it carries the system's central claim; this one is smaller.

**Constraints:** edit only `README.md` and `docs/WALKTHROUGH.md`. Do not touch `docs/arc42/**`, `docs/adr/**`, `docs/slices/**`, `src/` or `tests/`. Commit `docs(14): …` referencing the slice and push; do not merge. Check `npm run docs:refs` and `npm run docs:budget:check` pass before you commit — §8 has only 26 words of headroom, though that is the architect's file and not yours.

Report what you wrote, what you actually ran to verify it, and anything that did not behave as the architect's specification predicted.
