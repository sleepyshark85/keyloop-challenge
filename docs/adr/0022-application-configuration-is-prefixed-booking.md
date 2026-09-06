---
id: "0022"
title: Prefix this application's own configuration with `BOOKING_`, and make §7.3's table the contract
status: accepted
date: 2026-09-06
supersedes: null
superseded_by: null
arc42: ["§5.2", "§6.2", "§7.3"]

# AI provenance — evidence for the assessment's verification criterion.
proposed-by: test-engineer
decided-by: architect
ai-input: >
  RAISED as T-04-5 (MAJOR) at slice 04 step 3 and RULED BY THE ARCHITECT under the human's
  standing delegation, the human being absent. Reviewed at slice 04's gate like any other
  mid-slice ruling; the human overrides it there if the rule is wrong.

  The finding is the test-engineer's and it is a contradiction rather than a preference, which
  is why it could not be deferred: §5.2 and §7.3 named the same variable differently and the
  implementer was writing `config.ts` while it stood. `CLAUDE.md` §4 breaks a slice-versus-arc42
  tie by ruling arc42 wins; here arc42 was both sides of the tie, so §4 had nothing to break and
  the architect had to choose rather than look it up.
---

## Context and problem statement

Three statements, all in arc42, and no two of them agree:

- **§5.2** — Config (`ATTEMPT_CAP`, default 16, and `BOOKING_SEED`, unset)
- **§7.3** — `BOOKING_ATTEMPT_CAP`
- **§7.3** — no `BOOKING_SEED` row at all, though ADR-0021 introduced it, the harness sets it, and
  §11's R-7a mitigation depends on it being settable.

**ADR-0009 named no variable.** It said the cap is "a `platform/config.ts` value", and ADR-0021 said
`BOOKING_SEED` without saying why the prefix. So this is a decision the design left open and never
noticed leaving open — not a reversal of anything, and nothing here is superseded.

## Considered options

| | Option | Verdict |
|---|---|---|
| **A** | `ATTEMPT_CAP` — §5.2's name; correct §7.3 | Rejected — see the asymmetry below |
| **B** | **`BOOKING_ATTEMPT_CAP`** — §7.3's name; correct §5.2 and §6.2 | **Chosen** |
| **C** | Drop the prefix everywhere: `ATTEMPT_CAP` and `SEED` | Rejected. It requires editing `tests/support/service.ts`, which is test-engineer-owned and which the architect may not touch; and `SEED` alone says nothing in a namespace shared with the whole container's environment |

## Decision

Chosen option: **B**, and the rule behind it is the part worth keeping: **`BOOKING_` marks
configuration this application invented; an unprefixed name is one something else already fixed** —
`DATABASE_URL` and `PORT` by convention, `LOG_LEVEL` by `pino`, `OTEL_EXPORTER_OTLP_ENDPOINT` by the
OpenTelemetry specification, where renaming it would break auto-configuration outright.

**The costs are asymmetric, and that decided it rather than incumbency.** Nothing in `tests/` reads a
cap variable: `tests/acceptance/candidate-retry.test.ts` holds `const ATTEMPT_CAP = 16` as a local and
asserts the shipped default (T-04-2), and the harness forwards no cap. So B costs four documentation
edits and zero test edits. `BOOKING_SEED`, by contrast, is read by `tests/support/service.ts`. A is
therefore not the cheaper half of a symmetric choice: it cannot reach the name that would make it
consistent, so it buys one consistent namespace nowhere and leaves a permanent one-of-two split.

`src/platform/config.ts` reads neither variable yet — the implementer is writing that file now — so
the choice was made while it was still free of code churn.

## Consequences

**Good.** One rule, so the next knob has a name before it has a section, and `BOOKING_ATTEMPT_CAP`
says which attempts. §7.3's table lists both and is the deployment contract.

**Bad, or deferred.** **Nothing detected this drift, and the obvious guard fires on prose.** Measured
over `docs/arc42/`: nine distinct backticked `SHOUTING_SNAKE` tokens, of which four are not this
service's configuration — `DOCKER_HOST` (a measurement in §7.2), `FST_ERR_FAILED_ERROR_SERIALIZATION`
(a Fastify code), `EXIT_TESTS_FAILED` and `EXIT_DID_NOT_RUN` (a wrapper's exit codes). A
shape-matching rule would demand a §7.3 row for each. The check that would work is anchored to code
rather than to shape: §7.3 already claims environment is "read once in `src/platform/config.ts`", so
the set of `env['…']` keys in that file must **equal** the table's first column — set equality, the
shape §10.2 QS-12 already uses, with no false positives, and it would also enforce the single-reader
claim, which nothing enforces today either. Two limits: it cannot run before `config.ts` exists, so it
catches drift at green rather than design; and it is silent on a name §5 mentions and `config.ts`
never reads. **Not built here — `tools/` is not the architect's** (F-02-10, F-04-1).

## Pros and cons of the options

### A — `ATTEMPT_CAP`

- Good, because it is the name in three of the four places that mention the cap, so it is the smaller
  textual edit, and unprefixed matches the four variables that already exist.
- Bad, because those four are unprefixed for a reason that does not extend to it: each is a name
  somebody else chose. And it cannot deliver the consistency that is its whole argument, because the
  variable it would have to match is frozen in a file this role cannot edit.

### B — `BOOKING_ATTEMPT_CAP`

- Good, because it is consistent with the one name that is already fixed, it survives a flat
  namespace, and it costs no test edits and no code churn.
- Bad, because it is longer, and the rule is inferred from two examples — a convention with a sample
  size of two is on probation.

### C — no prefix anywhere

- Good, because it is the simplest rule available: there is no rule.
- Bad, because it is unreachable. `BOOKING_SEED` lives in a test-engineer-owned file, so this option
  can only be taken by breaching `CLAUDE.md` §5, and a naming preference does not buy that.
