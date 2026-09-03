#!/usr/bin/env node
/**
 * Regression test for the per-role path guard.
 *
 * Note on location: this lives under tools/, not tests/. The tests/ tree is
 * role-partitioned between the test-engineer and the implementer (METHODOLOGY.md
 * §7); tooling tests belong to neither and would otherwise trip the very
 * boundary they verify.
 *
 *   npm run test:tools
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const HOOK = resolve('.claude/hooks/guard-paths.mjs');
const CWD = process.cwd();

const ALLOW = 0;
const DENY = 2;

/** [description, expected exit, payload] */
const CASES = [
  // --- the two boundaries the verification story rests on -------------------
  ['implementer may not write an acceptance test', DENY,
    { tool_name: 'Write', agent_type: 'implementer', file_path: 'tests/acceptance/03.spec.ts' }],
  ['implementer may not write a property test', DENY,
    { tool_name: 'Write', agent_type: 'implementer', file_path: 'tests/property/p.spec.ts' }],
  ['implementer may not delete an acceptance test via the shell', DENY,
    { tool_name: 'Bash', agent_type: 'implementer', command: 'rm tests/acceptance/03.spec.ts' }],
  // The harness is part of the test. Both reviewers flagged this gap at slice 00a
  // step 2: an implementer able to edit globalSetup or the Vitest config can turn a
  // failing acceptance test green without touching the behaviour under test.
  ['implementer may not write the Testcontainers globalSetup', DENY,
    { tool_name: 'Write', agent_type: 'implementer', file_path: 'tests/setup/postgres.ts' }],
  ['implementer may not write the shared spawn helper', DENY,
    { tool_name: 'Write', agent_type: 'implementer', file_path: 'tests/support/service.ts' }],
  ['implementer may not edit the Vitest config', DENY,
    { tool_name: 'Edit', agent_type: 'implementer', file_path: 'vitest.config.ts' }],
  ['test-engineer owns the harness', ALLOW,
    { tool_name: 'Write', agent_type: 'test-engineer', file_path: 'tests/setup/postgres.ts' }],
  // A guard whose normal workaround is obfuscation teaches the wrong habit. AC-4
  // requires building a fixture tree under a temp directory; the bare substring
  // test denied it for merely containing the literal `src/`.
  ['fixture work outside the repo is not denied for containing a guarded name', ALLOW,
    { tool_name: 'Bash', agent_type: 'test-engineer',
      command: 'cp fixture.ts /tmp/probe-123/src/domain/bad.ts' }],
  ['...but the real path is still denied', DENY,
    { tool_name: 'Bash', agent_type: 'test-engineer', command: 'cp x.ts src/domain/bad.ts' }],
  ['...and so is an explicitly relative one', DENY,
    { tool_name: 'Bash', agent_type: 'test-engineer', command: 'cp x.ts ./src/domain/bad.ts' }],
  // Ruled to the test-engineer at Gate B (CLAUDE.md §5). QS-10 asserts the layering the
  // implementer must not be able to relax, so it is guarded like the other outside-in dirs.
  ['implementer may not write an architecture test (QS-10)', DENY,
    { tool_name: 'Write', agent_type: 'implementer', file_path: 'tests/architecture/layering.spec.ts' }],
  ['implementer may not write a performance test (QS-14)', DENY,
    { tool_name: 'Write', agent_type: 'implementer', file_path: 'tests/performance/availability-budget.spec.ts' }],
  ['test-engineer writes architecture tests', ALLOW,
    { tool_name: 'Write', agent_type: 'test-engineer', file_path: 'tests/architecture/layering.spec.ts' }],
  ['test-engineer writes performance tests', ALLOW,
    { tool_name: 'Write', agent_type: 'test-engineer', file_path: 'tests/performance/availability-budget.spec.ts' }],
  ['test-engineer may not READ src/ — independence is a read rule', DENY,
    { tool_name: 'Read', agent_type: 'test-engineer', file_path: 'src/domain/availability.ts' }],
  ['test-engineer may not write unit tests', DENY,
    { tool_name: 'Write', agent_type: 'test-engineer', file_path: 'tests/unit/a.spec.ts' }],

  // --- authorship boundaries ------------------------------------------------
  ['reviewer may not author code', DENY,
    { tool_name: 'Edit', agent_type: 'reviewer', file_path: 'src/x.ts' }],
  ['architect may not write code', DENY,
    { tool_name: 'Write', agent_type: 'architect', file_path: 'src/x.ts' }],
  ['implementer may not edit arc42', DENY,
    { tool_name: 'Edit', agent_type: 'implementer', file_path: 'docs/arc42/05.md' }],
  ['scribe may not author ADRs', DENY,
    { tool_name: 'Write', agent_type: 'scribe', file_path: 'docs/adr/0007-x.md' }],

  // --- one writer for the record -------------------------------------------
  ['no agent may write the event log', DENY,
    { tool_name: 'Write', agent_type: 'architect', file_path: 'docs/team-log/events.jsonl' }],
  ['no agent may write the board', DENY,
    { tool_name: 'Write', agent_type: 'reviewer', file_path: 'docs/board.html' }],

  // --- path handling --------------------------------------------------------
  ['absolute paths resolve to the same rule', DENY,
    { tool_name: 'Write', agent_type: 'implementer', file_path: `${CWD}/tests/property/p.spec.ts` }],

  // --- the work each role is actually for -----------------------------------
  ['implementer writes production code', ALLOW,
    { tool_name: 'Write', agent_type: 'implementer', file_path: 'src/domain/availability.ts' }],
  ['implementer writes unit tests', ALLOW,
    { tool_name: 'Write', agent_type: 'implementer', file_path: 'tests/unit/a.spec.ts' }],
  ['implementer runs the acceptance suite', ALLOW,
    { tool_name: 'Bash', agent_type: 'implementer', command: 'npx vitest run tests/acceptance' }],
  ['test-engineer writes acceptance tests', ALLOW,
    { tool_name: 'Write', agent_type: 'test-engineer', file_path: 'tests/acceptance/03.spec.ts' }],
  ['test-engineer reads the slice file', ALLOW,
    { tool_name: 'Read', agent_type: 'test-engineer', file_path: 'docs/slices/03-x.md' }],
  ['architect writes arc42', ALLOW,
    { tool_name: 'Write', agent_type: 'architect', file_path: 'docs/arc42/05.md' }],
  ['reviewer reads everything', ALLOW,
    { tool_name: 'Read', agent_type: 'reviewer', file_path: 'src/x.ts' }],

  // --- the orchestrator is unrestricted, and malformed input never blocks ----
  ['orchestrator (no agent_type) writes the log', ALLOW,
    { tool_name: 'Write', file_path: 'docs/team-log/events.jsonl' }],
  ['a malformed payload never blocks work', ALLOW, '__malformed__'],
];

function run(spec) {
  let stdin;
  if (spec === '__malformed__') {
    stdin = 'not json';
  } else {
    const { tool_name, agent_type, file_path, command } = spec;
    const payload = { tool_name, cwd: CWD, tool_input: {} };
    if (agent_type) { payload.agent_type = agent_type; payload.agent_id = 'test'; }
    if (file_path) payload.tool_input.file_path = file_path;
    if (command) payload.tool_input.command = command;
    stdin = JSON.stringify(payload);
  }
  return spawnSync('node', [HOOK], { input: stdin, encoding: 'utf8' });
}

let failed = 0;
for (const [desc, expected, spec] of CASES) {
  const { status, stdout } = run(spec);
  const ok = status === expected;
  if (!ok) failed++;
  const verdict = expected === DENY ? 'DENY ' : 'ALLOW';
  console.log(`${ok ? '  ok  ' : 'FAIL  '}${verdict}  ${desc}${ok ? '' : `  (exit ${status})`}`);
  if (ok && expected === DENY) {
    let reason = '';
    try { reason = JSON.parse(stdout).hookSpecificOutput.permissionDecisionReason; } catch {}
    if (!reason) { failed++; console.log('FAIL          denial carried no explanation'); }
  }
}

console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
process.exit(failed ? 1 : 0);
