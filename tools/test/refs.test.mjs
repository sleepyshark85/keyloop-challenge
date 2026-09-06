#!/usr/bin/env node
/**
 * `tools/docs/refs.mjs` — every cited identifier still resolves.
 *
 * This tool enforces a rule and had no tests, which is the same shape as `budget.mjs`
 * before O-33: the guard that catches everyone else was the one nothing checked.
 *
 * The cases below are written in the failing direction first, and the two that matter are
 * the mutants:
 *
 *   - rename the identifier in the design that DEFINES it, leaving the design that merely
 *     cites it alone — the original defect, where "appears in a design" was collapsed into
 *     "is defined in a design";
 *   - move a finding's id from its own `ref` field into a record's prose — the widening
 *     added for A-04-2..6 must not accept a mention as a definition.
 *
 * A-04-7. The guard was PREFIX-LUCKY. `REF` matches `A-`, `D-`, `F-`, `DA-` and `OQ-`, and
 * findings are logged under `T-`, `I-`, `S-`, `R-`, `O-`, `E-`, `J-`, `AB-` and `AC-` —
 * so for four slices no logged finding ever collided, and the contradiction between §9
 * ("findings live in the event log") and this tool ("must be defined in a slice design")
 * stayed invisible. It surfaced only when five architect findings were logged as `A-04-*`,
 * into a prefix that already meant "assumption defined in a design".
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, findingsIn, DEFINITION } from '../docs/refs.mjs';

let pass = 0; let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const build = ({ designs = {}, arc42Files = {}, adrs = {}, log = '' } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'refs-'));
  for (const sub of ['slices', 'arc42', 'adr', 'team-log']) mkdirSync(join(dir, sub), { recursive: true });
  for (const [f, b] of Object.entries(designs)) writeFileSync(join(dir, 'slices', f), b);
  for (const [f, b] of Object.entries(arc42Files)) writeFileSync(join(dir, 'arc42', f), b);
  for (const [f, b] of Object.entries(adrs)) writeFileSync(join(dir, 'adr', f), b);
  const logPath = join(dir, 'team-log', 'events.jsonl');
  writeFileSync(logPath, log);
  return {
    arc42: join(dir, 'arc42'), adr: join(dir, 'adr'), slices: join(dir, 'slices'), log: logPath,
  };
};

const orphans = (opts) => check(build(opts)).orphans.map(([ref]) => ref);
const raised = (ref, extra = {}) => `${JSON.stringify({ event: 'finding.raised', ref, ...extra })}\n`;

// --- the original purpose ---------------------------------------------------------
{
  const o = orphans({
    designs: { '01-design.md': '- **D-01-2** — composition order left the domain.\n' },
    arc42Files: { '11-risks.md': 'arc42 cites D-01-2 here.\n' },
  });
  ok('a cited identifier that IS defined in a design is not an orphan', o.length === 0, o.join(','));
}
{
  const o = orphans({
    designs: { '01-design.md': 'prose that merely mentions D-01-2 mid-sentence\n' },
    arc42Files: { '11-risks.md': 'arc42 cites D-01-2 here.\n' },
  });
  ok('...and a MENTION is not a definition — the mutant that made the first version useless',
    o.includes('D-01-2'), o.join(','));
}
{
  // The exact reported shape: rename it where it is DEFINED, leave the design that cites it.
  const o = orphans({
    designs: {
      '01-design.md': '- **D-01-9** — renamed here.\n',
      '02-design.md': 'this design cites D-01-2 twice: D-01-2.\n',
    },
    arc42Files: { '11-risks.md': 'arc42 cites D-01-2.\n' },
  });
  ok('renaming the DEFINITION is caught even though another design still cites it',
    o.includes('D-01-2'), o.join(','));
}
{
  const o = orphans({ arc42Files: { '11-risks.md': 'arc42 cites F-99-1.\n' } });
  ok('an identifier defined nowhere at all is an orphan', o.includes('F-99-1'), o.join(','));
}

// --- the append-only log is a citation source ------------------------------------
{
  const o = orphans({ log: `${JSON.stringify({ event: 'handoff', message: 'see OQ-01-1' })}\n` });
  ok('a citation that exists ONLY in the log is still caught — it can never be repaired',
    o.includes('OQ-01-1'), o.join(','));
}

// --- ...and it is also a DEFINITION source, for findings only --------------------
{
  const o = orphans({
    log: raised('A-04-4', { claim: 'the baseline escapes non-ASCII' })
       + JSON.stringify({ event: 'finding.ruled', ref: 'A-04-4', rationale: 'x' }),
  });
  ok('a finding.raised record DEFINES its own ref — §9 makes the log the definition site',
    o.length === 0, o.join(','));
}
{
  const o = orphans({
    log: `${JSON.stringify({ event: 'finding.ruled', ref: 'A-04-4' })}\n`,
  });
  ok('...but only finding.raised does. A ruling cites a finding; it does not create one',
    o.includes('A-04-4'), o.join(','));
}
{
  const o = orphans({
    log: `${JSON.stringify({ event: 'finding.raised', ref: 'S-01', claim: 'this concerns A-04-4' })}\n`,
  });
  ok('...and a ref named only in a record\'s PROSE is a mention, not a definition',
    o.includes('A-04-4'), o.join(','));
}
{
  const o = orphans({ log: raised('see A-04-4 below') });
  ok('...and the ref field is matched ANCHORED, so a field that merely contains one fails',
    o.includes('A-04-4'), o.join(','));
}
{
  // Widening, not hole: a design identifier deleted from its design is still caught unless
  // the log independently raised it as a finding.
  const o = orphans({
    designs: { '01-design.md': 'nothing here\n' },
    arc42Files: { '11-risks.md': 'arc42 cites D-01-2.\n' },
    log: raised('D-01-3'),
  });
  ok('an unrelated logged finding does not launder a deleted design definition',
    o.includes('D-01-2'), o.join(','));
}

// --- robustness ------------------------------------------------------------------
{
  ok('a corrupt log line is skipped rather than thrown on',
    findingsIn('not json\n{"event":"finding.raised","ref":"A-04-4"}\n').has('A-04-4'));
  ok('...and a blank log defines nothing', findingsIn('').size === 0);
}
{
  ok('a bold-label paragraph with two refs defines BOTH — the false positive that would '
    + 'get this switched off',
  DEFINITION('F-01-2').test('**OQ-01-2 / F-01-2** — AC-5 confines the failure.'));
}
{
  ok('a table row defines', DEFINITION('D-02-1').test('| D-02-1 | the debt | open |'));
  ok('...and prose after the em dash does not',
    !DEFINITION('D-02-9').test('| D-02-1 — this row discusses D-02-9 | open |'));
}

// --- one-directional, on purpose --------------------------------------------------
{
  const o = orphans({ designs: { '03-design.md': '- **OQ-03-1** — nothing cites this yet.\n' } });
  ok('a definition nobody cites is NOT an error — flagging it would push authors to delete '
    + 'records rather than keep them', o.length === 0, o.join(','));
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
