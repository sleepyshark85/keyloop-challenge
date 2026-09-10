# Report · slice 16 · implementer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 16 step 2 review
- Returned: 2026-09-10T01:13:01.300Z
- Duration: 182s

---

## Verdicts

**1. AGREE — `deriveInterval` is reusable unedited.**
Checked `deriveInterval`'s signature (`src/application/deriveInterval.ts:75-79`): `(startsAtMillis: number, serviceType: ServiceTypeDuration, dealership: DealershipHours): Derivation`. `queryAvailability.ts` already calls `findDealership`/`findServiceType` (`src/persistence/referenceRepository.ts`), whose return types (`DealershipReference`, `ServiceTypeReference`) satisfy `DealershipHours`/`ServiceTypeDuration` structurally — the same objects `bookAppointment.ts:220` already passes to the same function. No edit to `deriveInterval.ts` is needed. `Derivation`'s five members (`derived`, `unparsable-instant`, `invalid-duration`, `outside-opening-hours`, `reference-data-invalid`) map onto the design's `AvailabilityOutcome` exactly the way `bookAppointment.ts:221-247` already maps them onto `BookOutcome` (including `invalid-duration` → `reference-data-invalid`, which the design's outcome sketch doesn't spell out as a separate `Derivation` case but is a direct copy of existing, proven logic). Ruling 5 holds: skipping the opening-hours gate would need a second derivation or a signature change, since `outside-opening-hours` carries no interval.

**2. AGREE — AC-4's precedence clause is achievable by reordering, and it's a straightforward reorder.**
Current order is window → dealership → service type (`queryAvailability.ts:58-70`). New order becomes dealership → service type → `deriveInterval` → candidates → busy, i.e. `bookAppointment`'s order. Nothing outside `tests/unit/` pins the current order — I checked `tests/unit/application/queryAvailability.test.ts` and `tests/unit/http/availability.test.ts`, which assert today's `malformed-window` behavior and statement order, but both are mine to rewrite at step 4. No acceptance/contract/property file pins the old order in a way I'd have to work around, since the test-engineer replaces the acceptance test at step 3 red. What moves: the `malformed-window` member disappears (ruling 3), replaced by `malformed-instant` (from `deriveInterval`'s `unparsable-instant`) evaluated *after* both reference lookups — which is exactly the change AC-4's last clause requires.

**3. AGREE — AC-3's `400` on `from`/`to`-without-`startsAt` is default behaviour, nothing explicit needed.**
`server.ts`'s own docblock (measured, I-08-6) states Fastify's ajv strips unknown query keys via `removeAdditional` regardless of `additionalProperties`. So `from`/`to` on a schema declaring only `dealershipId`/`serviceTypeId`/`startsAt` get silently dropped, and validation then fails on the missing required `startsAt` — landing on `FST_ERR_VALIDATION`, which `server.ts`'s `isValidationError` (`src/http/server.ts:125-134`) already maps to `400 /problems/malformed-request`. This is the same mechanism that already produces `400` for a missing `dealershipId` today. No new guard is needed in the route or schema.

**4. AGREE — the `zone-transport` marker is not tripped.**
Confirmed the four-file allowlist in `tests/architecture/ambiguity-containment.test.ts:487-490` is `deriveInterval.ts`, `openingHours.ts`, `referenceRepository.ts`, `schema.ts` — `bookAppointment.ts` is *not* on it despite calling `deriveInterval(millis, serviceType, dealership)` today, because it passes the whole `dealership` value rather than naming `ianaZone`/`time_zone` in its own source text. `queryAvailability.ts` calling `deriveInterval` the identical way adds no occurrence of either identifier to its file, so it stays off the list by the same mechanism. Asserted by set equality (`toEqual` on a sorted array), so any accidental addition would fail loudly.

**5. AGREE — no `AvailabilityView` type exists to break, and the switch stays exhaustive.**
There is no separate `AvailabilityView` type today — `AvailabilityOutcome`/`AvailabilityQuery` are consumed only by `availability.ts`'s route and passed through untyped in `main.ts:97` (`queryAvailability: async (query) => queryAvailability(db, query)`), which needs no change. The design's five-member union gives the route five arms (`available`→200, `malformed-instant`→400, `outside-opening-hours`→400, `unknown-reference`→422, `reference-data-invalid`→500) plus the same `const unhandled: never` catch-all pattern `appointments.ts` already uses — exhaustive by construction.

**6. One ambiguity I'd have to guess at, flagged rather than resolved:**

`outsideOpeningHours()` and `INTERNAL` (`src/http/routes/appointments.ts:463-486`) are not exported, and neither `appointments.ts` nor its exports appear in the design's "Building blocks touched" table or the slice's "In scope" file list. But AC-4 requires availability's `400 outside-opening-hours` and `500 internal` bodies to be status-and-`type`-identical to booking's. That leaves two ways to satisfy it, and the design doesn't pick one:

- (a) export both from `appointments.ts` and import them into `availability.ts` — touches a file the design says is untouched, or
- (b) rebuild the same two `problem()` calls locally in `availability.ts` — keeps the file list as stated, at the cost of two small duplicated call sites that could drift apart (the same category of duplication ADR-0039 exists to remove for duration).

I'd rather have this ruled than guess: my inclination is (b), to honor the design's explicit file list and because AC-4 only requires equal status/`type`, not shared code — but I'd take (a) if the architect prefers one source of truth for problem-body construction over the stated scope boundary.

## F-16-1 / the ten citations

Workable only in part, and I want to flag rather than silently narrow it. The slice file's own "Known limits" (not just the background note) says: *"This slice's roles fix the ones in files they are already rewriting."* I am rewriting `queryAvailability.ts` — its citation (line 2) is mine and I'll fix it as part of the docblock rewrite anyway, per the slice's "In scope" list. But per the design's building-blocks table, `src/persistence/appointmentRepository.ts` is explicitly **not edited** this slice (`busyResources` is unchanged). Its two ADR-0032 citations (lines 516, 526) are therefore not in a file I am "already rewriting" — touching it only to fix a docblock comment would be a drive-by outside this slice's scope as the design states it, and would falsify the design's own "not edited" claim for persistence. I'll fix `queryAvailability.ts`'s citation and leave `appointmentRepository.ts`'s two alone, consistent with F-16-1's stated sweep being booked separately — unless the architect rules those two in scope explicitly, in which case I'll take them as a one-line comment fix with no behavior change.

**Summary:** agreed design, six confirmations, one open ambiguity (problem-body reuse vs. duplication for the two new arms) that needs a ruling before step 4, and one scope clarification (I'll fix only `queryAvailability.ts`'s ADR-0032 citation, not `appointmentRepository.ts`'s, absent a wider ruling).
