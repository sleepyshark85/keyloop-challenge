/**
 * THE ONE PLACE IN THE PROCESS WHERE A SQLSTATE IS READ.
 *
 * `sql-only-in-persistence` calls this out by name: "SQLSTATE 23P01 is translated in exactly one
 * module (`src/persistence/pgError.ts`). A second translation site is the classic way a 409
 * quietly starts meaning two different things, and how `err.constraint` — which ADR-0009 uses to
 * prune candidates and §8.4 uses to label `booking_conflicts_total{resource}` — gets dropped on
 * one path and not the other."
 *
 * The rule dependency-cruiser can enforce is that `pg` is not imported above this directory. What
 * it cannot enforce is that a `pg` error VALUE does not escape upward, because a value has no
 * import for the graph to see. So this module is the boundary stated in code: `bookAppointment`
 * catches, hands the error here, and gets back a closed union that names no driver type. The same
 * containment `pingDatabase` provides with a boolean, one shape up.
 *
 * ── ADR-0016: a capacity refusal requires a database verdict ──────────────────────────────────
 *
 * `ContendedResource` is a branded `'bay' | 'technician'`, and `classify` is its ONLY minting
 * site. `BookOutcome`'s `no-capacity` variant carries that type, so to refuse a booking for
 * capacity reasons a use case must be holding a value PostgreSQL produced. Measured (design §8,
 * rows 5-6): a planted `return { kind: 'no-capacity', resource: 'bay', attempts: 0 }` is
 * `error TS2322` under this repository's `tsc --strict`; the same tree with
 * `'bay' as ContendedResource` compiles clean. So the honest claim is that the brand FORECLOSES
 * EVERY SHAPE THAT DOES NOT CAST — and the cast is a single greppable token, confined to this
 * file by the `contended-resource-cast` marker in tests/architecture. F-02-4 carries the residue.
 */

/** Minted ONLY by {@link classify}, from `err.constraint`. Design §4.1, ADR-0016. */
export type ContendedResource = ('bay' | 'technician') & { readonly __brand: 'ContendedResource' };

export type PgOutcome =
  /** `23P01` exclusion_violation — the database adjudicated and refused. */
  | {
      readonly kind: 'conflict';
      readonly resource: ContendedResource;
      readonly constraint: string;
    }
  /** `23503` foreign_key_violation — a named reference does not resolve. */
  | { readonly kind: 'bad-reference'; readonly constraint: string }
  /** `40P01` deadlock_detected — T-02-9, ADR-0018. THE ABSENCE OF A VERDICT. */
  | { readonly kind: 'no-verdict' }
  | { readonly kind: 'other'; readonly cause: unknown };

/** The composite FK that ADR-0017 disambiguates AFTER it fires. Design §5.1, §5.3. */
export const VEHICLE_OWNERSHIP_CONSTRAINT = 'appointment_vehicle_owned_by_customer';

/**
 * The constraint-name -> resource map. A TOTAL FUNCTION OVER THE TWO NAMES IN THE MIGRATION,
 * with no default arm.
 *
 * An unrecognised `23P01` constraint name is `{ kind: 'other' }` and becomes a `500`. Inventing a
 * resource for a constraint nobody has seen is how the metric ADR-0009 depends on starts lying —
 * and `0003_appointment.sql` says outright that the names are behaviour, so a rename is a
 * behaviour change and must show up as one.
 *
 * A `Map`, not a `Record`/object literal — R-07-7. `constraint` is a driver-supplied string read
 * off `unknown`, and an object literal's lookup by bracket notation resolves a key like
 * `'constructor'` to `Object.prototype.constructor` rather than to `undefined`, minting
 * `resource: <the Object constructor>` for a name this migration never defined. A `Map` has no
 * prototype chain to walk, so that key space does not exist to be reached — the bad state is
 * unrepresentable rather than guarded against, the same habit §2.1 already asks of the insert.
 */
const RESOURCE_BY_CONSTRAINT = new Map<string, 'bay' | 'technician'>([
  ['no_bay_overlap', 'bay'],
  ['no_technician_overlap', 'technician'],
]);

/**
 * SQLSTATEs this classifier recognises. Only those MEASURED to reach this path (design §5.1).
 *
 * Exported for `src/application/attemptLoop.ts`'s span attributes (`db.sqlstate`, arc42 §8.4) —
 * a span attribute restating a code this file already classified is not a second translation
 * site; it is a label on a `PgOutcome` this function already produced.
 */
export const EXCLUSION_VIOLATION = '23P01';
export const FOREIGN_KEY_VIOLATION = '23503';
export const DEADLOCK_DETECTED = '40P01';

/**
 * The shape read off a `pg` error, structurally rather than by importing `DatabaseError`.
 *
 * Duck-typed on purpose: this function's contract is TOTAL over `unknown`, and it is handed
 * whatever a `catch` caught — a driver error, a `TypeError` from the row mapper, a rejected
 * string. Narrowing by `instanceof` would make the classification depend on which copy of `pg`
 * constructed the error, which is a class of bug this project has no way to observe.
 */
function fieldsOf(error: unknown): { code?: string; constraint?: string } {
  if (typeof error !== 'object' || error === null) return {};
  const record = error as Record<string, unknown>;
  const code = record['code'];
  const constraint = record['constraint'];
  return {
    ...(typeof code === 'string' ? { code } : {}),
    ...(typeof constraint === 'string' ? { constraint } : {}),
  };
}

/**
 * TOTAL. Every input produces a variant; nothing throws and nothing is rethrown from here.
 *
 * `40P01` is `no-verdict` and `no-verdict` is `40P01` ALONE. It carries no constraint, no
 * resource and no cause, because a deadlock reports none — and that absence is the point. It is
 * the one variant a capacity refusal cannot be built from, which is ADR-0016 doing its job at the
 * moment it was most likely to be argued around: under ADR-0018/ADR-0030's locks a deadlock can
 * only mean some write path did not lock every resource it was in flight against — its own pair,
 * and, where it also vacates one (a move past attempt 1), that pair too — so it is an internal
 * fault and not contention. (ADR-0018 alone was not sufficient for this: a move is in flight
 * against two pairs at once, and locking only one of them still deadlocks — measured at slice 07,
 * ADR-0030.)
 *
 * `40001` (serialization_failure) is deliberately NOT included: at READ COMMITTED it cannot arise
 * here, and adding an unmeasured SQLSTATE to the one classifier this design calls total is how a
 * total function starts guessing.
 */
export function classify(error: unknown): PgOutcome {
  const { code, constraint } = fieldsOf(error);

  if (code === DEADLOCK_DETECTED) return { kind: 'no-verdict' };

  if (code === EXCLUSION_VIOLATION && constraint !== undefined) {
    const resource = RESOURCE_BY_CONSTRAINT.get(constraint);
    if (resource !== undefined) {
      return { kind: 'conflict', resource: resource as ContendedResource, constraint };
    }
  }

  if (code === FOREIGN_KEY_VIOLATION && constraint !== undefined) {
    return { kind: 'bad-reference', constraint };
  }

  return { kind: 'other', cause: error };
}
