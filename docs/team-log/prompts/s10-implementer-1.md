# Prompt · slice 10 · implementer · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Slice 10 step 2 implementer
- Sent: 2026-09-08T04:02:47.257Z

---

# Slice 10 · step 2 — AGREE or OBJECT

Working directory `/home/agentadmin/sources/keyloop-challenge`, branch `slice/10-openapi-and-curl-harness`, **PR #21 open**. Pull first. Read `docs/slices/10-design.md` and `docs/slices/10-openapi-and-curl-harness.md` in full.

**This slice exists because three green tests asserted the wrong thing** — AC-9's read problem-*type strings* and never touched `content[…]`, `A-06-2` was "discharged" by an assertion containing none of the words it claimed, and the double-booking script counts nothing and always exits 0. A design producing three more of those has failed even if it merges.

§6: objections here are cheap; the same ambiguity at step 5 costs a cycle plus a loopback. A round with no disagreement is deference, not consensus.

## Two things the design refuses to decide by reading — and you are the role that measures

The architect ruled both **measure-do-not-choose**, on `D-09-3`'s precedent, where the OTel HTTP instrumentation was assumed to work and you measured that it does not patch under this ESM entry point. You disproved its `37/42` the same way last slice, with a live `@fastify/swagger` harness. Do that again:

- **M1** — does Fastify's **per-response `content` form keep the serialiser**, and does it survive `; charset=utf-8`? This decides how `application/problem+json` can be declared at all. `problem.ts:76` sends `application/problem+json; charset=utf-8` today.
- **M2** — **does TypeBox collapse a one-member `Type.Union` to `Type.Literal`?** If it does, §8.5's silent substitution is reintroduced **inside the fix for it**. This is the one I would measure first.

Bring numbers or observed behaviour, not a reading of the docs.

## Three more for your judgement

3. **`R-09-13`'s prose splits.** Contract prose stays at operation level, one fact per concatenated literal; the TypeBox rationale returns to the file docblock. The querystring object's duplicate `description` is **dropped** — you measured that `@fastify/swagger` discards it, so **no emitted byte should change**, and AC-7's `--check` is what proves that. Does that hold? And `D-08-1`'s three surviving mutants bind to three AC-7 assertions, with AC-7 required to fail when **any one** literal is emptied — is that achievable at the operation level?

4. **AC-7's boundary was corrected** (`A-10-4`): `availability.ts` rejects `to <= from`, so the rule is *`to` strictly later than `from`*. Confirm that against the code rather than the design — the criterion as written would have published a rule the implementation does not have.

5. **`npm run harness:seed` emits `export`-shaped lines** for five ids plus `STARTS_AT`, so `eval "$(npm run --silent harness:seed)"` is the whole path. `harness/seed.mjs` and both scripts are **yours**. Is that shape workable, and does `npm run --silent` actually emit nothing but the exports?

## Boundaries

- **Do not write code yet** — step 3 is the test-engineer's red, step 4 is yours. Review only. Measuring in a throwaway fixture is expected and is not implementation.
- Do not edit the design. You object; the architect rules.
- `harness/` is **unguarded by `guard-paths.mjs`** (`A-10-3`) — the ownership table is a briefing rather than a mechanism there. Respect it anyway; `tests/acceptance/` and `tests/contract/` are the test-engineer's.

## Return

The structured report with `objections` populated, **M1 and M2's measured results**, and anything in the ownership table you think is wrong. Where you agree, say what you checked; agreement that names nothing is worth nothing.
