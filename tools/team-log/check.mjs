#!/usr/bin/env node
/**
 * Validate every record in the team event log against the schema.
 *
 *   npm run log:check
 *
 * This ran as ten lines inlined in `.github/workflows/verify.yml` until slice 01, and
 * the workflow's own comment anticipated the move: *"if this grows it becomes a tools/
 * script with a test in tools/test/"*. It did not grow. What happened is worse and is
 * the reason this file exists:
 *
 * THE GUARD WAS UNRUNNABLE WHERE THE MISTAKE IS MADE. The orchestrator appended five
 * records with event names the schema does not define, ran `npm test`, `npm run
 * test:tools` and `npm run lint:arch` — all green, because none of them validates the
 * log — pushed, and learned about it from a red CI job. A guard that only fires after
 * the push costs a round trip every time, and the round trip is the whole of its cost:
 * the check itself is milliseconds.
 *
 * The root cause was separate and is worth naming here because this file does not fix
 * it: `tools/team-log/append.mjs` is the orchestrator write path and it validates before
 * writing. It was bypassed with a hand-rolled `appendFileSync`. This check is the
 * backstop for that, not a licence to keep bypassing it.
 *
 * `--quiet` suppresses the per-file summary on success, for callers that chain.
 */
import { readFileSync, existsSync } from 'node:fs';
import { validate } from './schema.mjs';

const FILE = process.env.TEAM_LOG ?? 'docs/team-log/events.jsonl';
const quiet = process.argv.includes('--quiet');

// GitHub Actions renders `::error file=…,line=…::` as an annotation on the diff; a plain
// terminal shows it as text, which is legible enough that there is no second format.
const ci = Boolean(process.env.GITHUB_ACTIONS);
const report = (line, detail) =>
  console.log(ci ? `::error file=${FILE},line=${line}::${detail}` : `  ${FILE}:${line}  ${detail}`);

if (!existsSync(FILE)) {
  console.error(`log:check: ${FILE} does not exist`);
  process.exit(2);
}

const lines = readFileSync(FILE, 'utf8').split('\n').filter(Boolean);
let bad = 0;

lines.forEach((line, i) => {
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    report(i + 1, 'not valid JSON');
    bad += 1;
    return;
  }
  const { ok, errors } = validate(e);
  if (!ok) {
    report(i + 1, errors.join('; '));
    bad += 1;
  }
});

if (bad) {
  console.error(`${lines.length} record(s) checked, ${bad} invalid`);
  process.exit(1);
}
if (!quiet) console.log(`${lines.length} record(s) checked, 0 invalid`);
