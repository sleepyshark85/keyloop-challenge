---
id: "17"
title: Sweep citations of retired ADRs out of src/ and tests/
status: ready
depends_on: ["16"]
arc42: ["§11.1"]
adr: []
quality_scenarios: []
loopbacks: 0
deferred_from: "F-16-1"
---

## Goal

`ADR-0032` has **no file in `docs/adr/`**. The 2026-09-07 retirement (`docs/STATUS.md:116`) folded the
retired decisions into their slice designs, deleted the records, and rewrote roughly 160 references —
and missed a cluster. Five citations are live, and three of them are in the present tense, so a reader
follows the id to a file that does not exist and either invents what it said or discards the reasoning
the comment carries.

This slice makes every citation in `src/` and `tests/` resolve to something a reader can open.

## Acceptance criteria

- **AC-1** — For every ADR id cited anywhere under `src/` and `tests/`, either `docs/adr/<id>-*.md`
  exists, or the citation names the slice design the decision was folded into. The three present-tense
  sites are `src/persistence/appointmentRepository.ts:516,526` and
  `tests/unit/persistence/appointmentRepository.test.ts:533`; the two that already say *(retired)* are
  in `tests/property/availability-agrees-with-constraint.db.test.ts:21,91`.
- **AC-2** — A check makes the class **unrepeatable**: a bare ADR id in a comment is not a link, which
  is precisely why `docs:refs` could not see this for two slices. The remedy is a check, not a sweep;
  a sweep alone leaves the next retirement free to do it again.

## In scope

- The five sites above, and any others AC-2's check reports on first run.
- One new check, beside `docs:refs`.

## Out of scope

- Retiring or reinstating any ADR. This slice fixes citations, not decisions.
- The `docs/team-log/` citations: the log is append-only and the mapping records already resolve them.

## Definition of done

Beyond `CLAUDE.md` §10: AC-2's check runs in `test:tools`, and was observed failing on the tree at
slice 16's merge before it was made to pass.
