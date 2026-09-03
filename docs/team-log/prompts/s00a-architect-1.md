# Prompt · slice 00a · architect · invocation 1

**BACKFILLED.** Sent on 2026-09-04, minutes before `.claude/hooks/capture-prompt.mjs` existed;
reproduced verbatim from the session transcript. This is the last backfilled prompt — capture is
mechanical from `s00a-architect-2` onward. See `README.md`.

- Task: Slice 00a design, step 1

---

You are the architect at **step 1 (Design)** of the slice loop for **slice 00a — the walking skeleton**. Phase 4, the pilot. Branch `slice/00a-walking-skeleton` is checked out; scope marker reads `{"slice":"00a"}`.

This is a **design**, not an implementation. You produce the design document that the test-engineer and implementer will review at step 2 and build against at steps 3 and 4. Do not write production code, tests, migrations or config files.

## Read first

- `docs/slices/00a-walking-skeleton.md` — the slice, approved at Gate C. Its acceptance criteria are the human's and you may not change them.
- `docs/arc42/05-building-blocks.md` §5.2 — the five modules and the composition root you are giving concrete shape to.
- `docs/arc42/07-deployment-view.md` — especially §7.2 (Testcontainers stands in for PostgreSQL under test) and §7.4 (the pipeline).
- `docs/arc42/08-crosscutting-concepts.md` §8.5 Testability.
- ADR-0005 (Fastify + TypeBox), ADR-0006 (Kysely over `pg`), ADR-0007 (`node-pg-migrate`), ADR-0008 (five layered modules, no repository port), ADR-0010 (GitHub Actions, `check.run` collected not committed).
- `.dependency-cruiser.js` — your own ruleset. The module tree you specify must satisfy it.
- `.github/workflows/verify.yml` — the six steps that ship today and the PHASE 4 block at the foot that this slice switches on.
- `docs/METHODOLOGY.md` §6 (the loop) and `docs/team-log/process-criteria.md` (what the pilot is measured against).

## What the design must settle

Write it to **`docs/slices/00a-design.md`**. Cover:

1. **The concrete module tree** — every file `src/` will contain at the end of this slice, with one line on what each holds. It must pass `depcruise` including `domain-is-pure` with `src/domain` importing nothing at all, so say what is in `src/domain` when there is no domain logic yet.
2. **The composition root** — how `src/main.ts` wires Fastify, the Kysely instance and the platform leaf without any module reaching upward. Given ADR-0008 rejected repository ports, be explicit about how `src/application` obtains its database access, since that is exactly the seam a reader will expect a port at.
3. **`GET /health`** — where it lives (it is an edge concern that must report database connectivity, so it necessarily crosses layers), its response shape, and how `503` is produced without `src/http` importing `pg` in violation of `sql-only-in-persistence`.
4. **The Testcontainers harness** — global setup versus per-file, container reuse, how the connection string reaches the suite, and how a test gets a clean database. Slice 00 will add migrations, so state the seam this slice must leave for them.
5. **`tests/architecture/layering.test.ts`** — the shape of the fixture-tree injection for AC-4. It must prove four named rules *fire*. This is the test-engineer's file to write; you specify what it must establish, not its code.
6. **`tools/team-log/collect-ci.mjs`** — the interface ADR-0010 decided but did not build. Its inputs, the `check.run` record shape it appends (schema-valid per `tools/team-log/schema.mjs`), and how it obtains `source: "derived"` legitimately via the `allowDerived` flag.
7. **The CI phase-4 block** — exactly which steps switch on in this slice, and the `red-proof` job's mechanics.
8. **Data-model delta** — none expected; say so explicitly rather than omitting the heading.
9. **Applicable §10 quality scenarios** — QS-10 is linked. State precisely what the slice must make true for it.
10. **Proposed arc42 edits** for step 7, and whether any ADR is needed. If a decision arises that ADR-0005..0010 do not already settle, raise it as an ADR with `status: proposed` rather than deciding it inline.

## A conflict you must resolve, not paper over

`process-criteria.md` C1 requires a failing acceptance run recorded in `check.run` *before* a passing one. But `collect-ci.mjs`, which emits `check.run`, is **built by this slice**. C1 is therefore unmeasurable for 00a by construction. Say so plainly in the design, state how the red proof for 00a is evidenced instead, and confirm C1 becomes measurable from slice 00 onward. Do not quietly redefine the criterion — it is pre-registered and the human approved it.

## Rules

- You may not change the slice's acceptance criteria or scope — those are the human's (`CLAUDE.md` §6).
- Do not write to `docs/team-log/events.jsonl`, do not move the board, do not push, do not open or comment on a PR. The orchestrator does that.
- Commit the design on `slice/00a-walking-skeleton` as `docs(00a): slice design`, ending the message with the standard attribution trailer.

## Report back

The design's key decisions; anything the acceptance criteria leave genuinely ambiguous (flag it now — step 2 is where that is cheap and step 5 is where it costs a full cycle); any ADR you raised; and the one or two choices the test-engineer or implementer is most likely to object to at step 2.
