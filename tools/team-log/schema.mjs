/**
 * Team event-log schema.  See docs/METHODOLOGY.md §9.
 *
 * The log is trace-shaped: a slice is a trace, an agent invocation is a span,
 * handoffs are links, gates are events.  Append-only, one JSON object per line.
 *
 * Every record carries a `source` marking its trust tier (METHODOLOGY.md P5):
 *   derived  — produced by tooling (git hook, test reporter, CI). Cannot be fabricated.
 *   reported — a schema-validated agent self-report.
 *   narrated — written by the orchestrator. The only tier the board renders as opinion.
 */

export const ACTORS = [
  'architect', 'test-engineer', 'implementer', 'reviewer', 'scribe',
  'orchestrator', 'human',
];

export const SOURCES = ['derived', 'reported', 'narrated'];

export const BOARD_COLUMNS = [
  'ready', 'speccing', 'red', 'green', 'review', 'done', 'blocked',
];

export const DCR_RULINGS = {
  a: 'clarification',
  b: 'deferred-improvement',
  c: 'design-defect',
  d: 'escalate',
};

/** event name -> fields required beyond the universal ones */
export const EVENTS = {
  'slice.ready':      [],
  'board.move':       ['board'],
  'agent.start':      ['actor'],
  'agent.finish':     ['actor', 'outcome'],
  'handoff':          ['from', 'to', 'artifact'],
  'review.finding':   ['severity', 'file', 'claim', 'scenario'],
  'review.response':  ['finding_ref', 'resolution'],
  // A finding raised by ANY role at ANY step, not only the reviewer at step 5.
  // Slice 00a produced ~25 of these at steps 2-4 and none of them was recordable:
  // `review.finding` is the reviewer's, and a DCR puts the slice `blocked`, which
  // none of them did. So defect-escape distance — the metric the phase-4 retro is
  // built on — had no data. `ref` is the human-facing id used in the PR thread.
  'finding.raised':   ['actor', 'ref', 'severity', 'claim', 'scenario', 'step'],
  'finding.ruled':    ['actor', 'ref', 'verdict', 'rationale'],
  'dcr.raised':       ['actor', 'reason', 'step'],
  'dcr.discussed':    ['actor', 'position'],
  'dcr.resolved':     ['ruling', 'rationale'],
  'loopback':         ['from_step', 'to_step', 'reason'],
  'escalation':       ['actor', 'reason'],
  'gate.opened':      ['gate'],
  'gate.decided':     ['gate', 'decision', 'rationale'],
  'check.run':        ['checks'],
  'adr.recorded':     ['adr'],
  'arc42.updated':    ['sections'],
  'slice.done':       [],
};

const UNIVERSAL_REQUIRED = ['ts', 'event', 'source'];

/**
 * Work is scoped to either a slice or a phase, never neither. Phases 1-3 produce
 * arc42 and the backlog and have no slice, but their agent runs and gate
 * decisions are the evidence base for §13 — losing them would start the record
 * at slice 00 and throw away the architecture reasoning.
 */
export const PHASES = ['0', '1', '2', '3', '4', '6', '7'];

const SEVERITIES = ['BLOCKING', 'MAJOR', 'MINOR'];
const RESOLUTIONS = ['fixed', 'disputed', 'accepted', 'deferred'];
/**
 * A finding's outcome. `rejected` is deliberately here: a finding argued down on
 * reasoning is evidence the adjudication worked, and the register keeps it with
 * the ruling. Slice 00a's sharpest example was an accepted finding whose proposed
 * remedy was rejected — the two are separate verdicts, which is why `narrowed`
 * exists rather than forcing that case into `accepted`.
 */
const VERDICTS = ['accepted', 'narrowed', 'rejected', 'deferred', 'escalated'];

/**
 * Validate a record. Returns { ok, errors }.
 * A slice cannot advance on an invalid report — see METHODOLOGY.md §9.
 */
export function validate(e) {
  const errors = [];
  const need = (f) => {
    if (e[f] === undefined || e[f] === null || e[f] === '') {
      errors.push(`missing required field: ${f}`);
      return false;
    }
    return true;
  };

  for (const f of UNIVERSAL_REQUIRED) need(f);

  if (!e.slice && !e.phase) {
    errors.push('every record must be scoped: give it a `slice` or a `phase`');
  }
  if (e.phase && !PHASES.includes(String(e.phase))) {
    errors.push(`invalid phase: ${e.phase} (expected ${PHASES.join(' | ')}; slice work uses \`slice\`, not phase 5)`);
  }

  if (e.event && !(e.event in EVENTS)) {
    errors.push(`unknown event: ${e.event} (expected one of ${Object.keys(EVENTS).join(', ')})`);
  } else if (e.event) {
    for (const f of EVENTS[e.event]) need(f);
  }

  if (e.source && !SOURCES.includes(e.source)) {
    errors.push(`invalid source: ${e.source} (expected ${SOURCES.join(' | ')})`);
  }
  if (e.actor && !ACTORS.includes(e.actor)) {
    errors.push(`invalid actor: ${e.actor} (expected ${ACTORS.join(' | ')})`);
  }
  if (e.ts && Number.isNaN(Date.parse(e.ts))) {
    errors.push(`ts is not a parseable ISO timestamp: ${e.ts}`);
  }
  if (e.board) {
    for (const k of ['from', 'to']) {
      if (e.board[k] && !BOARD_COLUMNS.includes(e.board[k])) {
        errors.push(`invalid board.${k}: ${e.board[k]}`);
      }
    }
  }
  if (e.event === 'review.finding' && e.severity && !SEVERITIES.includes(e.severity)) {
    errors.push(`invalid severity: ${e.severity} (expected ${SEVERITIES.join(' | ')})`);
  }
  if (e.event === 'finding.raised' && e.severity && !SEVERITIES.includes(e.severity)) {
    errors.push(`invalid severity: ${e.severity} (expected ${SEVERITIES.join(' | ')})`);
  }
  if (e.event === 'finding.ruled' && e.verdict && !VERDICTS.includes(e.verdict)) {
    errors.push(`invalid verdict: ${e.verdict} (expected ${VERDICTS.join(' | ')})`);
  }
  if (e.event === 'review.response' && e.resolution && !RESOLUTIONS.includes(e.resolution)) {
    errors.push(`invalid resolution: ${e.resolution} (expected ${RESOLUTIONS.join(' | ')})`);
  }
  if (e.event === 'dcr.resolved' && e.ruling && !(e.ruling in DCR_RULINGS)) {
    errors.push(`invalid ruling: ${e.ruling} (expected a | b | c | d)`);
  }
  // METHODOLOGY.md §6: ruling (c) must name the AC or QS that would fail.
  if (e.event === 'dcr.resolved' && e.ruling === 'c' && !e.failing_criterion) {
    errors.push(
      "ruling (c) requires `failing_criterion` naming the acceptance criterion " +
      'or QS-* that would fail; without one the correct ruling is (b)',
    );
  }
  if (e.duration_ms !== undefined && typeof e.duration_ms !== 'number') {
    errors.push('duration_ms must be a number');
  }

  return { ok: errors.length === 0, errors };
}

/** Fill defaults that can be derived rather than typed. */
export function normalize(e, priorEvents = []) {
  const out = { ...e };
  out.ts ??= new Date().toISOString();
  out.source ??= 'reported';
  // A record is scoped to a slice or a phase; the trace is named after whichever.
  const scope = out.slice !== undefined && out.slice !== null
    ? { key: (out.slice = String(out.slice).padStart(2, '0')), prefix: 'slice', stem: 's' }
    : out.phase !== undefined && out.phase !== null
      ? { key: (out.phase = String(out.phase)), prefix: 'phase', stem: 'p' }
      : null;

  if (scope) {
    out.trace_id ??= `${scope.prefix}-${scope.key}`;
    if (!out.span_id) {
      const stem = `${scope.stem}-${scope.key}-${out.actor ?? out.event.split('.')[0]}`;
      const n = priorEvents.filter((p) => (p.span_id ?? '').startsWith(`${stem}-`)).length + 1;
      out.span_id = `${stem}-${n}`;
    }
  }
  return out;
}

/** Ordered field list, so appended lines stay readable in a git diff. */
export const FIELD_ORDER = [
  'ts', 'slice', 'phase', 'trace_id', 'span_id', 'parent_span_id', 'actor', 'event',
  'source', 'outcome', 'board', 'duration_ms', 'inputs', 'outputs', 'git',
  'checks', 'agent_sha', 'transcript', 'message',
];

export function serialize(e) {
  const ordered = {};
  for (const k of FIELD_ORDER) if (e[k] !== undefined) ordered[k] = e[k];
  for (const k of Object.keys(e)) if (!(k in ordered)) ordered[k] = e[k];
  return JSON.stringify(ordered);
}
