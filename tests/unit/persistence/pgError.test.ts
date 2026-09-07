import { describe, expect, it } from 'vitest';
import { classify, VEHICLE_OWNERSHIP_CONSTRAINT } from '../../../src/persistence/pgError.js';

/**
 * `classify` is the ONE site that reads a SQLSTATE, so it is the one site whose totality has to
 * be asserted rather than assumed. Every case below is a SQLSTATE and constraint pair MEASURED
 * against this repository's own migrations (design §5.1, §8 rows 1-4 and 16); nothing here is
 * invented, because a classifier tested against invented errors classifies invented errors.
 *
 * The database's own verdicts are asserted in `tests/integration/` against a real container —
 * that is the test-engineer's, and `CLAUDE.md` §2.2 puts every persistence invariant there. What
 * is asserted here is the MAPPING, which is code and has no database in it.
 */

/** The shape `pg` presents on a refused insert: `code`, and `constraint` when it names one. */
function pgError(code: string, constraint?: string): unknown {
  return Object.assign(new Error(`SQLSTATE ${code}`), {
    code,
    ...(constraint === undefined ? {} : { constraint }),
    severity: 'ERROR',
  });
}

describe('classify — 23P01 exclusion_violation', () => {
  it('no_bay_overlap mints resource=bay and carries the constraint NAME', () => {
    // Both are needed and neither is redundant: ADR-0009 prunes on the resource, and AC-3
    // asserts on the name. A test that can only see 'bay' cannot tell `no_bay_overlap` from a
    // mapping that guessed.
    expect(classify(pgError('23P01', 'no_bay_overlap'))).toEqual({
      kind: 'conflict',
      resource: 'bay',
      constraint: 'no_bay_overlap',
    });
  });

  it('no_technician_overlap mints resource=technician', () => {
    expect(classify(pgError('23P01', 'no_technician_overlap'))).toEqual({
      kind: 'conflict',
      resource: 'technician',
      constraint: 'no_technician_overlap',
    });
  });

  it('the two constraints do not map to the same resource', () => {
    // Kills the mutant that collapses the map to a single value. AC-11's two mirrored cases
    // would both still pass a mapping that answered 'bay' to everything, if the fixture that
    // makes the technician scarce were ever to become bay-constrained by accident.
    const bay = classify(pgError('23P01', 'no_bay_overlap'));
    const technician = classify(pgError('23P01', 'no_technician_overlap'));
    expect(bay.kind === 'conflict' ? bay.resource : undefined).not.toBe(
      technician.kind === 'conflict' ? technician.resource : undefined,
    );
  });

  it('an UNRECOGNISED 23P01 constraint is `other`, never an invented resource', () => {
    // Design §2.1: the map has no default arm. A constraint nobody has seen becomes a 500,
    // because inventing a resource for it is how `booking_conflicts_total{resource}` starts
    // lying. This is also the mutant guard for a `?? 'bay'` fallback.
    const outcome = classify(pgError('23P01', 'no_lift_overlap'));
    expect(outcome.kind).toBe('other');
  });

  it('a 23P01 with NO constraint name is `other`', () => {
    expect(classify(pgError('23P01')).kind).toBe('other');
  });

  it('R-07-7 — a constraint named "constructor" is `other`, never the Object constructor as a resource', () => {
    // Before R-07-7 the lookup was a plain object literal, and bracket access on
    // `'constructor'` resolves through the prototype chain to `Object.prototype.constructor`
    // rather than to `undefined` — minting `resource: <the Object constructor>` for a name this
    // migration never defined. A `Map` has no prototype chain to walk, so this key is simply
    // absent, exactly like any other name nobody wrote into `0003_appointment.sql`.
    const outcome = classify(pgError('23P01', 'constructor'));
    expect(outcome.kind).toBe('other');
  });
});

describe('classify — 23503 foreign_key_violation', () => {
  it('the composite ownership FK is bad-reference, carrying the constraint ADR-0017 disambiguates', () => {
    // Measured: unknown vehicle, unknown customer and not-owned are INDISTINGUISHABLE at this
    // point — all three report this one name. That is why `classifyOwnership` exists and why
    // this classifier does not try to tell them apart.
    expect(classify(pgError('23503', VEHICLE_OWNERSHIP_CONSTRAINT))).toEqual({
      kind: 'bad-reference',
      constraint: VEHICLE_OWNERSHIP_CONSTRAINT,
    });
  });

  it('the other composite FKs are bad-reference too, and keep their own names', () => {
    // Defended, not exercised over HTTP (design §5.1, T-02-4): both are refused at steps 1-2
    // before any insert. Their mutants are killed here or not at all, which is exactly why
    // this case exists rather than being left to the contract test.
    for (const constraint of [
      'appointment_technician_qualified',
      'appointment_bay_in_dealership',
      'appointment_technician_in_dealership',
    ]) {
      expect(classify(pgError('23503', constraint))).toEqual({ kind: 'bad-reference', constraint });
    }
  });

  it('a 23503 with no constraint name is `other`', () => {
    expect(classify(pgError('23503')).kind).toBe('other');
  });

  it('a 23503 naming an EXCLUSION constraint is bad-reference, never a conflict', () => {
    // The SQLSTATE decides the arm; the constraint name only decides the resource. Without this
    // case the two tests are joined by an `&&` that no input separates, so a mutant weakening it
    // to `||` — or dropping the SQLSTATE test entirely — would mint `resource: 'bay'` from a
    // FOREIGN-KEY violation. That is a capacity refusal built from a verdict that was not about
    // capacity, which is precisely what ADR-0016 exists to make impossible.
    expect(classify(pgError('23503', 'no_bay_overlap'))).toEqual({
      kind: 'bad-reference',
      constraint: 'no_bay_overlap',
    });
  });

  it('a 23503 whose constraint is not a string is `other`, not a bad-reference naming a number', () => {
    // `fieldsOf` drops a non-string `constraint`. Without that drop, ADR-0009 would prune on a
    // value that is not a constraint name and `err.constraint` would reach the conflict log — and
    // slice 09's metric — as a number.
    expect(classify({ code: '23503', constraint: 7 }).kind).toBe('other');
  });
});

describe('classify — 40P01 deadlock_detected (T-02-9, ADR-0018)', () => {
  it('is `no-verdict`, and carries NOTHING', () => {
    // The absence is the point: `no-verdict` mints no ContendedResource, so a 409 here is not
    // merely dishonest, it is unconstructible without a cast. ADR-0016 answering T-02-9.
    expect(classify(pgError('40P01'))).toEqual({ kind: 'no-verdict' });
  });

  it('is `no-verdict` even when the driver attached a constraint name', () => {
    // A deadlock reports none in practice; asserting it anyway pins that the SQLSTATE alone
    // decides this arm, so a future edit cannot route a 40P01 through the conflict branch.
    expect(classify(pgError('40P01', 'no_bay_overlap'))).toEqual({ kind: 'no-verdict' });
  });

  it('40001 serialization_failure is NOT no-verdict — only 40P01 is', () => {
    // Design §2.1: at READ COMMITTED it cannot arise here, and adding an unmeasured SQLSTATE
    // to a classifier this design calls total is how a total function starts guessing.
    expect(classify(pgError('40001')).kind).toBe('other');
  });
});

describe('classify — A-05-6: the two guards inside classify/fieldsOf, directed', () => {
  it('a `code` that is not a string primitive never satisfies ANY SQLSTATE branch, even one shaped like a match', () => {
    // pgError.ts:80:9 — `typeof code === 'string'`. Every branch below tests the extracted
    // `code` with `===` against a string LITERAL (`DEADLOCK_DETECTED`, `EXCLUSION_VIOLATION`,
    // `FOREIGN_KEY_VIOLATION`), and `===` never coerces — so a value that fails this guard
    // cannot be confused with one that passes it by any comparison downstream, whether or not
    // it is spread into the record. That is also why this guard's one remaining mutant (the
    // ternary forced to its `true` branch) is very likely EQUIVALENT rather than merely
    // unkilled (I-07-2): a `code` that is not a string primitive cannot strict-equal a string
    // literal either way, so no input reaches `classify`'s public contract and distinguishes
    // the two builds. A `String` OBJECT is used here rather than a primitive specifically
    // because its `typeof` is `'object'`, not `'string'`, while its printed form still reads as
    // a SQLSTATE — the case most likely to tempt a loose (`==`) comparison into matching.
    const boxed = Object.assign(new Error('boxed code'), {
      code: new String('40P01'),
      constraint: 'no_bay_overlap',
    });
    expect(classify(boxed)).toEqual({ kind: 'other', cause: boxed });
  });

  it('a `23P01` whose constraint is the literal string "undefined" is `other`, the same as one with no constraint at all', () => {
    // pgError.ts:103:39 — `constraint !== undefined`. `RESOURCE_BY_CONSTRAINT` has no entry for
    // any key JS would coerce an absent `constraint` to, so skipping this guard when
    // `constraint` genuinely is `undefined` reaches the identical lookup result the guard
    // exists to short-circuit around — which is also why this guard's one remaining mutant is
    // very likely EQUIVALENT (I-07-2). The one input that COULD separate the two builds is a
    // constraint whose string value coincides with a key the map actually holds under
    // `undefined`'s coercion — `'undefined'` is exactly that candidate, and the map holds no
    // such key, so both builds land on `other` here too. Making this non-equivalent would mean
    // inventing a constraint this migration does not define, which design §2.1 forbids — this
    // pins the boundary rather than assuming it.
    expect(classify(pgError('23P01', 'undefined')).kind).toBe('other');
  });
});

describe('classify — totality', () => {
  it('carries the original error as `cause` on the `other` arm', () => {
    const error = pgError('42703', undefined);
    expect(classify(error)).toEqual({ kind: 'other', cause: error });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'boom'],
    ['a number', 42],
    ['a plain Error with no code', new Error('boom')],
    ['an object whose code is not a string', { code: 23503 }],
    ['an object whose constraint is not a string', { code: '23P01', constraint: 7 }],
  ])('classifies %s as `other` rather than throwing', (_label, value) => {
    expect(classify(value).kind).toBe('other');
  });
});
