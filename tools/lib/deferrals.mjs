/**
 * WHERE A DEFERRED FINDING WENT — the machine-readable half of ADR-0019.
 *
 * ADR-0019 says a control is deferred only to a slice that makes it cheaper or stronger.
 * For five slices that destination lived in prose: a `finding.ruled` rationale said "routed
 * to slice 06", the receiving slice's file said nothing, and the only thing connecting them
 * was that someone remembered. A-05-5 recorded the criterion SOUND and the ENFORCEMENT
 * MISSING, and O-37 was the fourth time the same mechanism produced the same defect — a
 * destination named without being verified.
 *
 * This module is the one place that answers "what was deferred to slice N", so `slice:check`
 * and `docs:adr-check` cannot disagree about it.
 *
 * ------------------------------------------------------------------ two refinements --
 *
 * A-05-5 specified `deferred_to` on EVERY deferred ruling. Building it turned up two things
 * the specification could not have known, both recorded as O-38 rather than resolved here:
 *
 *   1. NOT EVERY DEFERRAL HAS A SLICE. Six of the fifteen open deferrals name no slice at
 *      all — they went to the retro, to the backlog, or were ruled out of slice. I-05-8 is
 *      the decisive one: it is an ORCHESTRATOR OVERRIDE OF ADR-0019 whose entire rationale
 *      is that it cannot name a cheaper-or-stronger slice and is choosing to defer anyway.
 *      A check demanding a slice id there would have forced a false destination into the
 *      log to satisfy a rule that exists to stop exactly that. So a destination is a slice
 *      id OR a member of a small closed set, and only slice ids feed the subset check.
 *
 *   2. A DEFERRAL CAN HAVE TWO DESTINATIONS. F-02-9's obligation is that "slice 06's
 *      reschedule UPDATE and slice 07 take ADR-0018's two locks in the same order" — one
 *      finding, genuinely owed by two slices. `deferred_to` therefore accepts an array, and
 *      a single string is read as an array of one.
 *
 * ------------------------------------------------------------------ and the history --
 *
 * Eighteen deferred rulings predate the rule and carry no `deferred_to`. They are NOT
 * rewritten. The log is append-only and O-36 settled the precedent when it declined to
 * rewrite history to tidy an attribution error: rewriting the record of an artifact under
 * assessment to satisfy a rule invented after it is the worse act, and it would make this
 * module's own evidence unfalsifiable.
 *
 * Instead `finding.routed` carries the destination forward as a new record that QUOTES the
 * sentence in the original ruling which already named it. That keeps the claim checkable —
 * a reader can hold the quote against the ruling — where a backfilled field could not be.
 * A `finding.routed` for a ref whose ruling never named a destination would be an invention,
 * so those simply do not exist and the historical deferrals with no slice bind nothing.
 */

/**
 * Destinations that are not a slice. Deliberately small: every member is a place that
 * actually decides things and can be pointed at.
 *
 *   backlog — a new slice will be cut for it; `backlog.added` records which
 *   retro    — weighed as evidence about the process rather than fixed as work
 *   gate     — the human decides it, at the gate, on the record
 *   human    — awaiting a human ruling outside any gate
 */
export const NON_SLICE_DESTINATIONS = ['backlog', 'retro', 'gate', 'human'];

/** Slice ids are two digits with an optional suffix letter — `00a` is one. */
export const SLICE_ID = /^\d{2}[a-z]?$/;

export const isSliceId = (v) => typeof v === 'string' && SLICE_ID.test(v);
export const isDestination = (v) => isSliceId(v) || NON_SLICE_DESTINATIONS.includes(v);

/** A string or an array of them, always read out as an array. */
export function destinations(value) {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).map((v) => (typeof v === 'string' ? v.trim() : v));
}

/**
 * Every deferral in the log with a destination, keyed by finding ref.
 *
 * `finding.ruled` with `verdict: "deferred"` is the primary record; `finding.routed` is the
 * historical backfill described above. A ruling wins over a routing for the same ref — the
 * routing exists only to speak for rulings that could not speak for themselves, so if the
 * ruling has a destination the routing is redundant rather than authoritative.
 */
export function deferralMap(events) {
  const out = new Map();

  for (const e of events) {
    if (e.event !== 'finding.routed' || !e.ref) continue;
    const to = destinations(e.deferred_to);
    if (to.length) out.set(e.ref, { ref: e.ref, to, via: 'routed', slice: e.slice, ts: e.ts });
  }

  for (const e of events) {
    if (e.event !== 'finding.ruled' || e.verdict !== 'deferred' || !e.ref) continue;
    const to = destinations(e.deferred_to);
    if (to.length) out.set(e.ref, { ref: e.ref, to, via: 'ruled', slice: e.slice, ts: e.ts });
  }

  return out;
}

/** The refs some ruling sent to this slice — what its `inherits:` must cover. */
export function refsDeferredTo(events, sliceId) {
  const id = String(sliceId).padStart(2, '0');
  return [...deferralMap(events).values()]
    .filter((d) => d.to.includes(id))
    .map((d) => d.ref)
    .sort();
}

/** Every slice id any deferral names, for tools that need to check a destination exists. */
export function destinationSlices(events) {
  const ids = new Set();
  for (const d of deferralMap(events).values()) for (const t of d.to) if (isSliceId(t)) ids.add(t);
  return ids;
}
