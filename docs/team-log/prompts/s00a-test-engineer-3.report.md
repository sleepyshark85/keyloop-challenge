# Report · slice 00a · test-engineer · invocation 3

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Fix I-1 typecheck error
- Returned: 2026-09-04T03:33:15.573Z
- Duration: 176s

---

**SHA `46f0f53`** — `fix(00a): the harness declares the child type instead of asserting it`, one file, +8/−3.

## The fix

`/home/agentadmin/sources/keyloop-challenge/tests/support/service.ts`

I took the implementer's shape. I considered the alternatives and it is the right one:

```ts
let child: ChildProcessByStdio<null, Readable, Readable>;
try {
  child = spawn(argv[0] as string, argv.slice(1), { …, stdio: ['ignore', 'pipe', 'pipe'] });
```

The assertion was simply false — `stdio[0] = 'ignore'` means `stdin` is `null`, and `ChildProcessWithoutNullStreams` says it is a `Writable`. Declaring the overload's actual return type removes the lie instead of laundering it through `unknown`, and it fails closed: changing the stdio tuple is now a compile error here rather than a stale annotation. I rejected widening to `ChildProcess`, which would make `child.stdout` nullable and push non-null handling into the failure path that AC-2's evidence depends on — a worse trade for a cosmetic gain.

**Behaviour is provably unchanged.** I transpiled the HEAD version and the new version side by side and diffed the emitted JS: the only delta is the four comment lines tsc preserves. Every executable statement is identical, so the diagnosis string quoted in the PR record is byte-for-byte the string the helper still produces.

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors, exit 0 |
| `npm test` | 8 files, **60 passed, 0 failures** (unchanged) |
| `npm run test:nodb` | 6 files, 54 passed |
| `npm run test:tools` | 13/13 |

I staged only my file — the tree also carried uncommitted changes to `.claude/hooks/guard-paths.mjs`, `docs/team-log/`, and `tools/test/guard-paths.test.mjs` that are not mine. (`bdb32c1` landed under me mid-task; my commit sits on top and contains one file.)

## The blind spot — this is the part that matters

**Should the harness have caught it? Yes, and the tooling to do so was already in the tree.** The gap is not a missing capability, it is an unwired one, in two places:

1. `npm run typecheck` uses `tsconfig.json`, whose `include` is `["src", "tests"]` — it *did* cover this file at my red commit. It simply was not in CI. Green commit 9 fixes exactly that.
2. `pretest` runs `npm run build`, so it looks like every test run typechecks. It does not: `tsconfig.build.json` overrides `include` to `["src"]`. Compiling the service can never see a type error in `tests/`. That asymmetry is what made this feel covered when it wasn't.

**Could the same blind spot hide a defect in a later slice's test? Yes — and worse than it did here.** This one was type-only and runtime-harmless: the object was right, the label on it was wrong. The dangerous cases in the tests I am about to write for slices 01+ are the ones where a type error and a *silently passing* assertion are the same mistake:

- **Casts on response JSON.** `(await res.json()) as AppointmentResponse` — if the field is `appointment_id` and I assert on `.appointmentId`, tsc catches it; transpile-only turns it into `expect(undefined).toBeDefined()`-adjacent green. An acceptance test that asserts on a field the API does not return is the exact failure mode §2.4 exists to prevent, and it would be invisible.
- **`fast-check` arbitrary/property mismatch.** A wrong arbitrary type is precisely a type error. Uncaught, the property test generates the wrong shape and passes over a space that never exercises the overlap invariant — a green property suite proving nothing about arc42 §10.
- **Concurrency tests.** A missing `await` or a wrong `Promise.all` shape is often a type error. Uncaught, the "parallel" requests serialise and the exclusion-constraint race is never issued — the single most important test in this system, green and vacuous.

**What I would do about it, as step-3 practice rather than a one-off:** my C1 check ("the failure is for the right reason") is not verifiable while the test does not typecheck — a transpile-only red can fail for reasons the source does not contain. So from slice 01 I will run `npm run typecheck` *before* committing red, and treat a clean typecheck as part of the red evidence rather than as a separate concern.

**One thing worth raising but not mine to decide:** Vitest can run tsc over test files as part of the run (`--typecheck`). That would make this class of defect structurally impossible rather than procedurally covered, and it would apply to my directories specifically. That is an architect call and a candidate backlog slice — flagging it, not acting on it.

```json
{
  "role": "test-engineer",
  "outcome": "revised",
  "tests_added": {"acceptance": 0, "contract": 0, "property": 0, "concurrency": 0},
  "quality_scenarios_covered": [],
  "red_commit": "a483d09",
  "ci_failure_confirmed": true,
  "objections": [],
  "dcr": null,
  "message": "Fixed I-1 in tests/support/service.ts: the false `as ChildProcessWithoutNullStreams` assertion is replaced by the overload's real type, ChildProcessByStdio<null, Readable, Readable>. Typecheck clean, 60 tests still passing, and the emitted JS is identical statement for statement so the failure diagnosis is unchanged. The blind spot was that tsconfig.build.json excludes tests/, so pretest's build only looked like it typechecked the harness."
}
```
