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
 *   1. The implementer may not edit acceptance/contract/property/concurrency
 *      tests. Those define *done*; an implementer that can weaken them has not
 *      been verified by them.
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
  if (writeish.test(cmd)) {
    for (const prefix of guarded) {
      if (cmd.includes(prefix)) {
        deny(`${role} may not modify ${prefix}* — the command appears to write there via the shell. ${policy.note}`);
      }
    }
  }
}

process.exit(0);
