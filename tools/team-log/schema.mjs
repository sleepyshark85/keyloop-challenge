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

const UNIVERSAL_REQUIRED = ['ts', 'slice', 'event', 'source'];

const SEVERITIES = ['BLOCKING', 'MAJOR', 'MINOR'];
const RESOLUTIONS = ['fixed', 'disputed', 'accepted', 'deferred'];

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
  if (out.slice !== undefined) {
    out.slice = String(out.slice).padStart(2, '0');
    out.trace_id ??= `slice-${out.slice}`;
    if (!out.span_id) {
      const stem = `s-${out.slice}-${out.actor ?? out.event.split('.')[0]}`;
      const n = priorEvents.filter((p) => (p.span_id ?? '').startsWith(`${stem}-`)).length + 1;
      out.span_id = `${stem}-${n}`;
    }
  }
  return out;
}

/** Ordered field list, so appended lines stay readable in a git diff. */
export const FIELD_ORDER = [
  'ts', 'slice', 'trace_id', 'span_id', 'parent_span_id', 'actor', 'event',
  'source', 'outcome', 'board', 'duration_ms', 'inputs', 'outputs', 'git',
  'checks', 'agent_sha', 'transcript', 'message',
];

export function serialize(e) {
  const ordered = {};
  for (const k of FIELD_ORDER) if (e[k] !== undefined) ordered[k] = e[k];
  for (const k of Object.keys(e)) if (!(k in ordered)) ordered[k] = e[k];
  return JSON.stringify(ordered);
}
