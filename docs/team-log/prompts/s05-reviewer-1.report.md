# Report · slice 05 · reviewer · invocation 1

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Slice 05 step 5 REVIEW
- Returned: 2026-09-06T10:29:36.512Z
- Duration: 1038s

---

The confirmatory Stryker re-run is still going (~8 min in, ~960 mutants, one vitest spawn each). It does not gate my verification — I derived every survivor from the report artifact and confirmed each line against the source and `git blame`. I'll relay the number when it lands.

## Review — slice 05, PR #14

**Everything I was told, I collected myself.** CI `34025870705` on `7393fc7`: three jobs success. From the run artifacts, not the summary: green **565/565/0**, red `34025120072` **540 total, 530 passed, 10 failed**, the failures being exactly the five new test-engineer files and no unit test. `red-proof` on the red commit: *"red observed: … no unit test failed, and verify concluded success."* depcruise **clean** (30 modules, 72 deps); `lint:arch` clean (92 modules) — that flips `slice:check`'s `UNVERIFIED layering` row. Ownership clean both directions, per-commit: the test-engineer's `1e9e06c` touches no `tests/unit/`; the five implementer commits touch only `src/` and `tests/unit/`. **All 15 commits typecheck**, and the nodb suite is green at every implementer commit (490→495→503→507→508). The slice-04 `tsc`/vitest gap did not reach history. `17f2a11` is red in CI but is a `chore(log)`; `red-proof`'s `judge()` keys on the head-commit subject, so it asserts nothing there — not a second red commit. arc42: one file changed, the generated ADR-index row. No silent rewrite.

### Your 3-versus-16 split: correct — and the framing hides the answer

Verified. `275:9`, `275:18`, `277:27` are the new route's `default:` arm (route spans 236–281); the other sixteen `git blame` to slice 02's `feat(02)` commit. Arithmetic checks: 186/205 = 90.73%, 93/112 = 83.04%, 919/960 repo-wide — all exact.

But **"16 predate it" is the wrong axis.** Sorted by killability, the nineteen are:

- **9 unkillable exhaustiveness arms** — `197/199`, `228/230`, `275/277`, one per route. `const unhandled: never` means no value reaches them. The implementer's prediction was right.
- **5 inert TypeBox schema-options mutants** — `74:3`, `75:27`, `86:3`, `86:27`, `113:3`. I measured why: Fastify's default Ajv sets `removeAdditional: true`, so `additionalProperties: false` **strips** an unknown property rather than rejecting it. `POST /appointments` with an extra `technicianId` returns `201` today and builds the identical five-key command either way. Flipping the flag changes nothing observable.
- **3 description strings** — `77`, `78`, `113:47`. Visible only in the OpenAPI document, which QS-11 says is slice 10's and "not yet asserted". Scheduled, not debt.
- **1 inert** — `299:5`: `opensAt`/`closesAt` are `Type.Optional`, so a `closed-day` verdict spreads `undefined` and fast-json-stringify omits both. Byte-identical.
- **1 that is real, and it is due now** — `210:19`.

**Eighteen of nineteen are not debt.** So: not a §11 row, and not this slice's to pay. The actionable read is the opposite one — ~13 structurally unkillable mutants cap this file near 88%, so 83.04 has stopped discriminating. The remedy is `// Stryker disable` on the exhaustiveness arms, not tests. Reviewer/architect tooling; I can't author it.

**D4 clause 3 is not triggered:** no survivor sits between 230 and 275. Both live arms of the new switch are killed. The `404` arm is asserted.

### The thing nobody asked about, and it is the finding

`210:19` is **R-02-3**. ADR-0019 — accepted — names **slice 05** as the destination for R-02-2 and R-02-3, on a stated criterion, and its Consequences say *"Two rows in arc42 §11 until slice 05 reaches `done`."* Neither is mentioned in `05-design.md` or `05-cancellation.md`. Both are still `deferred` in the register. The branch **never touches `tests/integration/exclusion-constraints.test.ts`** — and ADR-0019's stated reason for choosing slice 05 was that it *"reopens that same file anyway."* No file under `tests/` combines a `pg_advisory` lock with a dropped constraint, so R-02-2's fourth cell — *the lock cannot replace the constraint* — is still prose.

And the mechanism is repeating, prospectively. Slice 05 defers three things: **F-05-1 → slice 06**, **OQ-05-2 → slice 10**, **AC-1's claim → slice 08**. `grep` finds none of `F-05-1`, `ResourceLock`, `ADR-0023`, `OQ-05-2` or the AC-1 claim in any of those three slice files. ADR-0019's own Consequences record the pattern that works — *"slice 04 routed D-04-1 to slice 08 … and slice 08 was amended (`4d172cc`)"*. None of the three did that.

That answers your ADR-0023 question. The F-05-1 deferral is **structurally sound** — slice 06 genuinely makes the brand stronger, and the concurrency file is excellent: I verified the lock key derivation matches `lockResources` exactly (class 1, `hashtext(bayId)`), and the non-optional booking control plus release witness do discriminate Option A rather than assuming it. But the deferral is **empirically unbacked**: the criterion carrying it is 0-for-2 at its first destination, and nothing downstream has been told.

### The §8.6 questions — measured against the real `buildServer`, no database

I-05-6 confirmed: `application/xml` → `500 /problems/internal` on both routes. The implementer's restraint is **right** — widening past two named codes is the architect's, and the anti-widening unit test at `appointments.test.ts:575` is the correct control.

But T-05-7 is misframed, and that is why it will never block. §8.6's `500` row reads *"…and anything else."* The taxonomy is **total by construction**; the 415 case is *conformant*. AC-12 asserts ∀rows ∃input; the property at risk is ∀responses ∃row. No reachability sweep can falsify a catch-all's *fitness*.

And I found a response class that escapes the taxonomy outright: **an unrouted path returns `404 application/json` with no `type` member at all.** There is no `setNotFoundHandler`, so it never reaches `setErrorHandler`. §8.6 opens *"Errors are RFC 9457 `application/problem+json`, with a stable `type` per failure"*; §10 indexes QS-11 as *"every failure has one status and one problem type."* A URL typo falsifies both — and it is a **404**, so a client cannot separate "no such appointment" from "no such endpoint" by status, and cannot fall back to `type` because one of them has none. The register knows this only as a test-hygiene trap, never as a taxonomy defect.

This slice's own rewrite of `server.ts`'s docblock now asserts *"§8.6's `500 | Anything else` row is a claim of TOTALITY, and **this is where it is kept**."* There is a second exit that file does not keep.

**What would make T-05-7 block:** a conformance assertion in the opposite direction — a fixed corpus of hostile requests, every response asserted `application/problem+json` with a `type` in `TAXONOMY`. My probe is that, in twenty lines, needs no database, and found two instances in one run.

### AC-1's real value

`freeResources` does not exist — confirmed. `candidateResources` reads **only reference data**; its own docblock says the filter lands after slice 08. `candidateRepository.ts`: 21 mutants, all killed, none an overlap predicate. Stryker cannot reach a predicate that isn't there.

**AC-1 earns its place, on two grounds, neither of them the stated one.** First, its fixture is `bays: 1, technicians: 1`, so `no_technician_overlap`'s predicate must also release — slice 00's AC-4 keeps `techB` free deliberately, so nothing else asserts the technician side behaviourally. Second, *because* the candidate list carries no availability filter, it is identical before and after the cancel — so the only thing that moved between the `409` and the `201` is the constraint's verdict on ADR-0004's retry attempts. That makes AC-1 a proof at the edge that D1's `UPDATE` really removes the row from **both** constraints' scope. That is this slice's production code, and it is the real content. The trap-closing (one `const` posted twice, the typed refusal, the bay/technician assertions) is genuinely well built, and `cancellation-releases-slot.test.ts`'s freed-*once* probe does not duplicate it.

**But the architect's *narrowed* justification is also wrong.** I-05-5 was accepted and D4 clause 2's MAJOR re-based onto *"AC-1 is the sole guard on the allocator re-deriving over a cancelled row."* The allocator does not re-derive over a cancelled row; it never reads `appointment`. The re-derivation is the retry loop's and the verdict is the constraint's. The severity has now been justified twice on premises that do not hold here. **Correction to your brief:** it is **one** test file, three places — `cancel-appointment.test.ts:42`, `:45`, `:192` — not three files.

**Headers before merge or step 7?** Split. Lines 42/45 and design §1 are narrative; step 7 with slice 08 named. **Line 192 is not narrative** — it is the diagnostic a future failure hands its reader, and it will point at a module that does not exist and away from the two places the failure can actually be. One line, in the test-engineer's own file, before merge.

### Withdrawn before filing

I drafted a MAJOR claiming the `additionalProperties` mutants let unknown body properties through. I measured it. `removeAdditional: true` makes the mutant inert. Withdrawn — and it became the explanation for five survivors instead.

```json
{
  "role": "reviewer",
  "outcome": "changes-requested",
  "findings": [
    {"severity": "MAJOR", "file": "docs/slices/05-cancellation.md", "line": 0,
     "claim": "ADR-0019 deferred R-02-2 and R-02-3 into slice 05 by name; neither arrived, neither was re-deferred, and the slice file never inherited them.",
     "scenario": "R-02-2: no file under tests/ combines a pg_advisory lock with a dropped exclusion constraint, and the branch never touches tests/integration/exclusion-constraints.test.ts, which ADR-0019 said slice 05 'reopens anyway'. R-02-3: its mutant survives in this slice's own run at routes/appointments.ts:210:19, unchanged from slice 02's 203:19. Residue I verified: R-02-3 is unkillable without a production change, so the right remedy is to close it with that reason, not build it — which means ADR-0019's 'slice 05 makes it stronger' premise was false and went untested."},
    {"severity": "MAJOR", "file": "docs/slices/06-reschedule-atomic-move.md", "line": 0,
     "claim": "Slice 05's own three deferrals are recorded only in slice 05's documents; none of the three target slice files names them.",
     "scenario": "grep finds no F-05-1, ResourceLock, ADR-0023, ADR-0019, OQ-05-2 or AC-1 claim in slices 06, 10 or 08. This is the exact mechanism that lost R-02-2/R-02-3. ADR-0019's own Consequences record the pattern that works — slice 08 was amended at 4d172cc — and none of the three followed it."},
    {"severity": "MAJOR", "file": "src/http/server.ts", "line": 36,
     "claim": "The docblock this slice rewrote asserts §8.6's totality 'is kept' in setErrorHandler; a whole response class never reaches it.",
     "scenario": "Measured against the real buildServer: GET /nope returns 404 application/json with no `type` member — Fastify's default not-found handler, no setNotFoundHandler registered. §8.6 opens 'Errors are RFC 9457 application/problem+json, with a stable type per failure' and §10 indexes QS-11 as 'every failure has one status and one problem type'. A URL typo falsifies both, and it collides on 404 with /problems/appointment-not-found with no `type` to disambiguate."},
    {"severity": "MAJOR", "file": "docs/slices/05-design.md", "line": 0,
     "claim": "The remedy accepted for I-05-5 does not fix the sentence it was accepted to fix: the narrowed D4 clause 2 premise is also false.",
     "scenario": "The rewritten reason is 'AC-1 is the sole guard on the allocator re-deriving over a cancelled row'. candidateResources reads only service_bay and technician/technician_qualification — it never reads appointment, so there is no re-derivation over a cancelled row and no two-copy seam. The re-derivation is ADR-0004's retry loop; the verdict is the constraint's."},
    {"severity": "MINOR", "file": "tests/acceptance/cancel-appointment.test.ts", "line": 192,
     "claim": "AC-1's central failure message names a module that does not exist as the diagnosis.",
     "scenario": "When AC-1 fails — say slice 06 regresses cancelAppointmentById — the reader is told a 409 means \"freeResources's overlap predicate has dropped status <> 'cancelled'\" and is directed away from the two places the failure can actually be: the cancel statement and the constraint predicate."},
    {"severity": "MINOR", "file": "src/http/routes/appointments.ts", "line": 75,
     "claim": "additionalProperties: false does not reject unknown body properties; Fastify's default removeAdditional strips them silently.",
     "scenario": "POST /appointments with {...valid, technicianId: X} returns 201 naming a different, allocated technician, with no signal the field was discarded. Pre-existing (slice 02), no AC requires rejection — recorded because it is why survivors 74:3, 75:27, 86:3, 86:27, 113:3 are inert rather than debt."}
  ],
  "mutation": {"score": 0.9073, "survivors": 19,
    "note": "changed files 186/205; routes/appointments.ts 93/112. Of 19 survivors: 9 unkillable exhaustiveness arms, 5 inert schema-options, 3 OpenAPI-only description strings, 1 inert (299:5, Type.Optional), 1 real and due now (210:19 = R-02-3). Confirmatory full re-run in progress."},
  "depcruise": "pass",
  "commit_discipline": "pass",
  "test_ownership": "pass",
  "dcr": "§8.6's 500 row is both a described failure class and an unrestricted catch-all ('and anything else'), which makes it unfalsifiable: AC-12 asserts ∀rows ∃input, while the property at risk is ∀responses ∃row. Split it into a described class and a named residual, and register a setNotFoundHandler so the not-found path is inside the taxonomy. Architecture — the architect's to rule, not mine to change.",
  "message": "The shipped code is right: D1's unconditional UPDATE is correct and 100% mutation-killed, ADR-0023's exemption is genuinely measured rather than asserted, and the concurrency file's held-lock probe plus booking control plus release witness really does discriminate the rejected Option A. Nothing in src/ is wrong. What is wrong is around it — an accepted ADR's deferral into this slice went unbuilt and unnoticed, this slice made three more deferrals the same undocumented way, and the two claims AC-1 has now been justified by are both false of this repository."
}
```

**Not blocking.** No acceptance criterion, quality scenario or §2 invariant fails on merged behaviour, so none of this is `(c)` and I am not entitled to block. `slice:check` has already revoked `gate: light` on the three open MAJORs; my four add to that rather than change it. The cheapest honest path is: correct `cancel-appointment.test.ts:192` before merge, rule R-02-2 (build) and R-02-3 (close, unkillable) explicitly rather than leaving them `deferred` into a fourth slice, write the three deferrals into slices 06/08/10, and take the §8.6 DCR at step 1 of slice 06 where the taxonomy grows anyway.

**One thing I could not verify:** the `reports/mutation/mutation.json` I read is gitignored, so I cannot prove its provenance from git — only that it is internally exact to four significant figures against every number reported and that its survivor set reproduces against the source and blame. The re-run will settle it.
