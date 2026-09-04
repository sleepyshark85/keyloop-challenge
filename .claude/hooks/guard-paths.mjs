#!/usr/bin/env node
/**
 * PreToolUse guard — enforces per-role file boundaries (METHODOLOGY.md §2, §7).
 *
 * The hook payload carries `agent_id` and `agent_type` ONLY when the call comes
 * from a subagent. The main session (the orchestrator) is unrestricted: it is the
 * sole writer of the board and the log, and it is the one being held responsible.
 *
 * Two boundaries matter most, and neither survives as a polite request:
 *
 *   1. The implementer may not edit the outside-in tests — acceptance, contract,
 *      property, concurrency, architecture and performance. Those define *done*;
 *      an implementer that can weaken them has not been verified by them.
 *   2. The test-engineer may not even READ src/. Independence is a read
 *      restriction as much as a write one — tests derived from an implementation
 *      restate it rather than check it.
 *
 * Deny → exit 2 with permissionDecision "deny". Allow → exit 0, silent.
 */
import { readFileSync } from 'node:fs';
import { relative, resolve, isAbsolute } from 'node:path';

const TEST_OWNED = [
  'tests/acceptance/', 'tests/contract/', 'tests/property/', 'tests/concurrency/',
  // Ruled to the test-engineer at Gate B; CLAUDE.md §5 carries the reasoning.
  'tests/architecture/', 'tests/performance/',
  // The harness is part of the test.  Both reviewers flagged this gap independently
  // at slice 00a step 2: AC-1's assertion IS that the container starts and the suite
  // connects, so an implementer able to edit globalSetup, the shared spawn helper or
  // the Vitest config can turn a failing acceptance test green without touching the
  // behaviour under test.  Criterion C2 is measured from hook denials, so an
  // unenforced boundary here makes a fatal criterion self-reported.
  'tests/setup/', 'tests/support/', 'vitest.config.ts',
];

/** role -> { write: [prefixes], read: [prefixes], note } */
const POLICY = {
  'test-engineer': {
    write: ['tests/unit/', 'src/', 'docs/arc42/', 'docs/adr/'],
    read: ['src/'],
    note: 'The test-engineer derives tests from the slice file, arc42 and the ADRs — never from the implementation. Unit tests belong to the implementer.',
  },
  implementer: {
    write: [...TEST_OWNED, 'docs/arc42/', 'docs/adr/'],
    read: [],
    note: 'Acceptance, contract, property and concurrency tests define *done*. If one is wrong, raise a DCR — do not edit it. arc42 and ADRs belong to the architect.',
  },
  reviewer: {
    write: ['src/', 'tests/', 'docs/'],
    read: [],
    note: 'The reviewer audits and cannot author. A design problem is raised as a DCR, not fixed.',
  },
  architect: {
    write: ['src/', 'tests/'],
    read: [],
    note: 'The architect owns arc42 and the ADRs, and never writes application code or tests.',
  },
  scribe: {
    write: ['src/', 'tests/', 'docs/adr/', 'docs/slices/'],
    read: [],
    note: 'The scribe records. It owns README, arc42 §12 and §13 — not §1–§11, not code, not decisions.',
  },
};

// Every subagent is barred from the log and the board: no agent marks its own
// work done, and a single writer keeps the record free of races.
const UNIVERSAL_WRITE_DENY = ['docs/team-log/', 'docs/board.html'];

const deny = (reason) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(2);
};

let payload;
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0); // never block on a malformed payload
}

const role = payload.agent_type;
// No agent_type => the orchestrator (main session). Unrestricted by design.
if (!role || !(role in POLICY)) process.exit(0);

const policy = POLICY[role];
const tool = payload.tool_name ?? '';
const input = payload.tool_input ?? {};
const cwd = payload.cwd ?? process.cwd();

const toRel = (p) => {
  if (!p) return null;
  const abs = isAbsolute(p) ? p : resolve(cwd, p);
  const rel = relative(cwd, abs);
  return rel.startsWith('..') ? null : rel.replace(/\\/g, '/');
};

const hits = (rel, prefixes) => rel && prefixes.find((p) => rel.startsWith(p));

const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'MultiEdit']);
const READ_TOOLS = new Set(['Read']);

if (WRITE_TOOLS.has(tool) || READ_TOOLS.has(tool)) {
  const rel = toRel(input.file_path ?? input.path ?? input.notebook_path);
  if (!rel) process.exit(0);

  if (WRITE_TOOLS.has(tool)) {
    const universal = hits(rel, UNIVERSAL_WRITE_DENY);
    if (universal) {
      deny(`${role} may not write ${rel}. The orchestrator is the sole writer of the event log and the board — no agent records its own outcome. Return your findings in the report block instead.`);
    }
    const blocked = hits(rel, policy.write);
    if (blocked) deny(`${role} may not write ${rel} (blocked prefix: ${blocked}). ${policy.note}`);
  }

  if (READ_TOOLS.has(tool)) {
    const blocked = hits(rel, policy.read);
    if (blocked) {
      deny(`${role} may not read ${rel} (blocked prefix: ${blocked}). ${policy.note}`);
    }
  }
  process.exit(0);
}

// Bash is best-effort: catch the obvious redirections and file-mutating commands.
// This is a speed bump, not a wall — see the note in the header of tests/README
// and METHODOLOGY.md §7. Defence in depth is the reviewer, who checks git history
// for test-ownership violations that a shell could have slipped through.
if (tool === 'Bash') {
  const cmd = String(input.command ?? '');
  const guarded = [...policy.write, ...UNIVERSAL_WRITE_DENY];
  const writeish = /(^|[\s;&|])(>{1,2}|tee\b|sed\s+-i|truncate\b|dd\b|cp\b|mv\b|rm\b|install\b)/;

  // Commands that cannot write a working-tree file, however they mention one.
  // Slice 00a produced FIVE false positives in five consecutive agent runs, and
  // every one was a legitimate action: building a fixture under a temp dir,
  // `git commit -F` with a heredoc naming a guarded path in its MESSAGE, and —
  // worst — `git restore --staged docs/team-log/…`, which was denied *because it
  // names the path it was un-staging*, blocking the correction to a boundary
  // violation rather than the violation.  A guard that stops more legitimate work
  // than violations inverts its purpose, and its normal workaround becoming
  // obfuscation (an agent concatenated 's' + 'rc' to get past it) teaches exactly
  // the habit the reviewer then has to see through.
  //
  // A heredoc body is prose, not a path.  Git plumbing that unstages or inspects
  // writes nothing a hook needs to stop.  The Write/Edit branch above is the real
  // enforcement and is unaffected — this branch was always a speed bump.
  const heredocBody = /<<-?\s*'?[A-Za-z_]+'?\n[\s\S]*?\n[A-Za-z_]+\s*$/m;
  const readOnlyGit = /^\s*git\s+(restore\s+--staged|reset|diff|status|log|show|stash\s+list|add\s+-p)\b/;
  const stripped = cmd.replace(heredocBody, ' <heredoc> ');

  if (readOnlyGit.test(cmd)) {
    process.exit(0);
  }

  if (writeish.test(stripped)) {
    for (const prefix of guarded) {
      // Anchor the match to a path that would actually resolve inside the repo.
      // A bare substring test denied any command merely CONTAINING `src/` —
      // including fixture work under /tmp, which slice 00a's AC-4 requires. The
      // test-engineer hit this at step 2 and had to build its probe through a
      // node script concatenating 's' + 'rc' to evade the heuristic. A guard
      // whose normal workaround is obfuscation teaches the wrong habit and
      // makes the reviewer's job harder, so the match now requires the prefix
      // to appear at a token boundary and NOT under an absolute path outside
      // the project.
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const inRepo = new RegExp(`(^|[\\s;&|='"\`])(\\./)?${escaped}`);
      // An ABSOLUTE path elsewhere (/tmp/probe-1/src/...) is someone else's tree.
      // `./src/` is not: the leading `/` is required, so a relative path still bites.
      const underAbsolute = new RegExp(`(^|[\\s;&|='"\`])/[\\w.-]+(/[\\w.-]+)*/${escaped}`);
      if (inRepo.test(stripped) && !underAbsolute.test(stripped)) {
        deny(`${role} may not modify ${prefix}* — the command appears to write there via the shell. ${policy.note}`);
      }
    }
  }
}

process.exit(0);
