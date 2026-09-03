---
id: "NN"
title: Short imperative title
status: ready          # ready · speccing · red · green · review · done · blocked
depends_on: []         # slice ids that must be merged first
arc42: []              # sections this slice MAY touch. Nothing else may move.
adr: []                # ADRs this slice implements
quality_scenarios: []  # QS-* from arc42 §10 — the traceability link
loopbacks: 0           # incremented on a (c) ruling; at 2 the architect must escalate
---

## Goal

One paragraph. What this slice makes true that was not true before.

## Acceptance criteria

Given/When/Then. These become the test-engineer's acceptance test names, so write them
as assertions rather than activities.

- **AC-1** — Given …, when …, then ….
- **AC-2** — Given …, when …, then ….

## In scope

- …

## Out of scope

- … *(work noticed but not asked for is a DCR, not a drive-by commit)*

## Definition of done

Beyond the standing DoD in `CLAUDE.md` §10, this slice additionally requires:

- …
