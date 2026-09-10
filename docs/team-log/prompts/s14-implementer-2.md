# Prompt · slice 14 · implementer · invocation 2

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 14 step 4: make the red green
- Sent: 2026-09-09T13:52:51.047Z

---

Slice 14, step 4 (GREEN). You agreed this design at step 2 with no objections, after verifying its load-bearing claims against `node_modules` source. The test-engineer's red commit now exists. Make it green.

Branch `slice/14-otlp-logs-and-service-identity`, PR [#22](https://github.com/sleepyshark85/keyloop-challenge/pull/22). Red commit `fe574ea`, observed red in CI (run 34359143223: `suite (Testcontainers)` failed, `docs, tools and log integrity` passed, `red-proof` passed). Read `docs/slices/14-design.md` and `docs/slices/14-otlp-logs-and-service-identity.md` first — the design is of record and its §2 carries ADR-0037's inline draft.

**The measured red, verified independently by me and by the test-engineer, identical both places:**

`tests/integration/telemetry-logs.test.ts` — 10 failed, 11 passed. Red: AC-1 (all three signals' resource), AC-2 (log signal only), AC-3, AC-4, AC-5, AC-6 (all three). Green and must stay green: AC-7 (stdout still trace-correlated), AC-8 (booking still answers 201 against `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:1`), and AC-2's trace/metric halves. `tests/architecture/layering.test.ts` — 3 failed, 29 passed; the three are the `otel-logs-api-only-in-platform` plant reporting "found 0" because the rule does not exist in `.dependency-cruiser.js` yet.

**One thing to know before you start, which the design's prose gets slightly wrong.** It calls AC-2 "the criterion option (B) fails". It is not: AC-2's trace and metric halves pass today with zero implementation, because `NodeSDK`'s `envDetector` reads `OTEL_SERVICE_NAME` regardless of application code. **AC-1 is the criterion that discriminates** — no variable set, and the default `keyloop-service-scheduler` must still appear on all three signals. AC-2's real job is to stop you from hardcoding `serviceName` on the `NodeSDK` options, which would beat the environment (`sdk.js:173-178`). Both criteria stand as written; only the design's rationale for AC-2 is imprecise. Do not edit the test to match this, and do not edit the design — if you think it needs correcting, say so in your report and the architect handles it at step 7.

**What you own** (§5, and the design's §4 ownership table): `src/platform/config.ts`, `src/platform/telemetry.ts`, `src/platform/logger.ts`, **new** `src/platform/otelLogStream.ts`, `src/main.ts`, `package.json`, `.dependency-cruiser.js`, and `tests/unit/**`. You **must not** create, edit or delete anything under `tests/integration/`, `tests/architecture/`, `tests/support/`, `tests/acceptance/`, `tests/contract/`, `tests/property/`, `tests/concurrency/` or `tests/performance/`. If you believe an acceptance test is wrong, **raise a DCR** — do not edit it. That escalation is a signal, not a failure.

**Carry your own step-2 findings through; they are the sharpest thing anyone has said about this slice:**

- `pino.multistream`'s `write()` loops calling `stream.write(data)` with **no try/catch** (`node_modules/pino/lib/multistream.js`), so a throwing sink propagates onto the request's stack. §7.1's isolation and AC-8 rest **entirely** on `otelLogStream.ts`'s own `write()` never throwing — wrap its `JSON.parse` and its `emit()`. This is a hard requirement on the new file, not a guarantee inherited from the library.
- `logs.getLogger()` returns a `ProxyLogger` that delegates per `emit()`, like `Tracer` and unlike `Meter`. **Do not copy** `telemetry.ts`'s `lazyCounter`/`lazyMeter` deferral into the bridge; it is not needed and would be cargo.
- The existing `otel-sdk-only-in-platform` regex already matches `sdk-logs` and `exporter-logs-otlp-http` but not `api-logs`, so the new rule is genuinely needed rather than redundant.
- `NodeSDK` defaults its env-configured log exporter to `http/protobuf` while this project's trace and metric exporters are the JSON `-otlp-http` pair. Pass the exporter explicitly or the records arrive at the test collector as unrecognised bytes.

**Discipline (§7):** every commit green — a unit test and the code it drives, together. Small: if a commit changes more than ~150 lines it should probably have been two. Conventional Commits referencing the slice, `feat(14): …`. Push as you go so CI sees them. Do not merge, and do not open a second PR.

The slice's DoD adds two things beyond §10: the new dependency-cruiser rule must arrive **with its plant** (the test-engineer has already written the plant, so yours is the rule), and mutation score must clear threshold on changed files — `otelLogStream.ts` is new code with a severity mapping and an attribute allowlist, which is exactly where survivors hide.

Report: commits with shas, the per-AC state at the end (all of AC-1 to AC-8 green, or precisely which are not and why), `npm run lint:arch` result, mutation score on changed files, and anything you had to decide that the design did not settle.
