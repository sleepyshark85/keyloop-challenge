import { describe, expect, it } from 'vitest';
import { queryAvailability } from '../../../src/application/queryAvailability.js';
import type { AvailabilityQuery } from '../../../src/application/queryAvailability.js';
import { scriptedDb } from '../helpers/stub-db.js';
import type { ScriptedStep } from '../helpers/stub-db.js';

/**
 * The SUBTRACTION, and the window guard — the parts of `GET /availability` that are decisions in
 * code rather than facts about PostgreSQL. `tests/property/availability-agrees-with-constraint.
 * db.test.ts` is what proves the two reads AGREE with the constraint (QS-8), against a real
 * container, and is the test-engineer's; this file asserts none of that. What IS here: that this
 * module composes `candidateResources` and `busyResources` by ID membership rather than by list
 * length or position, that a malformed window never reaches the database at all, and that the two
 * reference-data arms short-circuit before either read runs (ADR-0032, design §1.1-§1.3).
 */

const DEALERSHIP = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SERVICE_TYPE = 'ssssssss-0000-4000-8000-000000000000';
const FROM_MILLIS = Date.parse('2026-09-08T09:00:00.000Z');
const TO_MILLIS = Date.parse('2026-09-08T10:00:00.000Z');

const BASE_QUERY: AvailabilityQuery = {
  dealershipId: DEALERSHIP,
  serviceTypeId: SERVICE_TYPE,
  fromMillis: FROM_MILLIS,
  toMillis: TO_MILLIS,
};

const DEALERSHIP_ROW = { id: DEALERSHIP, time_zone: 'Europe/London' };
const SERVICE_TYPE_ROW = { duration_minutes: 60 };

/**
 * The six queries a successful run issues, IN ORDER: dealership, opening_hours, service_type,
 * then `candidateResources`' own two statements (bays, technicians) and finally
 * `busyResources`' one — sequential, per `queryAvailability`'s own docblock, so this order is a
 * fact the module states rather than an artefact of how an event loop happened to interleave two
 * concurrent calls.
 */
function fullScript(overrides: {
  readonly bays?: readonly { readonly id: string }[];
  readonly technicians?: readonly { readonly id: string }[];
  readonly busy?: readonly { readonly bay_id: string; readonly technician_id: string }[];
}): ScriptedStep[] {
  return [
    { rows: [DEALERSHIP_ROW] },
    { rows: [] }, // opening_hours — unread by this use case, but findDealership always queries it
    { rows: [SERVICE_TYPE_ROW] },
    { rows: overrides.bays ?? [] },
    { rows: overrides.technicians ?? [] },
    { rows: overrides.busy ?? [] },
  ];
}

function sqlOf(recorded: readonly { readonly sql: string }[], match: RegExp): string | undefined {
  return recorded.find((q) => match.test(q.sql))?.sql;
}

describe('queryAvailability — the window guard, AC-6 / F-08-3', () => {
  it('to === from is malformed-window, and touches the database not at all', async () => {
    const { db, recorded } = scriptedDb([]);
    const outcome = await queryAvailability(db, { ...BASE_QUERY, toMillis: FROM_MILLIS });
    expect(outcome).toEqual({ kind: 'malformed-window' });
    expect(recorded).toHaveLength(0);
  });

  it('to < from is malformed-window, and touches the database not at all', async () => {
    const { db, recorded } = scriptedDb([]);
    const outcome = await queryAvailability(db, {
      ...BASE_QUERY,
      fromMillis: TO_MILLIS,
      toMillis: FROM_MILLIS,
    });
    expect(outcome).toEqual({ kind: 'malformed-window' });
    expect(recorded).toHaveLength(0);
  });

  it('an unrenderable instant (NaN, from an unparsable startsAt) is malformed-window too', async () => {
    const { db, recorded } = scriptedDb([]);
    const outcome = await queryAvailability(db, { ...BASE_QUERY, fromMillis: NaN });
    expect(outcome).toEqual({ kind: 'malformed-window' });
    expect(recorded).toHaveLength(0);
  });
});

describe('queryAvailability — reference data, before either read runs', () => {
  it('an unknown dealership is unknown-reference, and never reaches candidateResources or busyResources', async () => {
    const { db, recorded } = scriptedDb([{ rows: [] }]);
    const outcome = await queryAvailability(db, BASE_QUERY);
    expect(outcome).toEqual({ kind: 'unknown-reference', reference: 'dealership' });
    expect(recorded).toHaveLength(1);
  });

  it('an unknown service type is unknown-reference, after the dealership resolves and before either read runs', async () => {
    const { db, recorded } = scriptedDb([
      { rows: [DEALERSHIP_ROW] },
      { rows: [] }, // opening_hours
      { rows: [] }, // service_type — not found
    ]);
    const outcome = await queryAvailability(db, BASE_QUERY);
    expect(outcome).toEqual({ kind: 'unknown-reference', reference: 'service-type' });
    expect(recorded).toHaveLength(3);
  });
});

describe('queryAvailability — the subtraction (ADR-0032)', () => {
  it('a candidate reported busy is excluded; a candidate never mentioned by busyResources is not', async () => {
    const { db } = scriptedDb(
      fullScript({
        bays: [{ id: 'bay-1' }, { id: 'bay-2' }],
        technicians: [{ id: 'tech-1' }, { id: 'tech-2' }],
        busy: [{ bay_id: 'bay-1', technician_id: 'tech-2' }],
      }),
    );
    const outcome = await queryAvailability(db, BASE_QUERY);
    expect(outcome).toEqual({
      kind: 'available',
      bays: ['bay-2'],
      technicians: ['tech-1'],
    });
  });

  it('subtracts by ID MEMBERSHIP, not by position or count — a busy bay absent from the candidate list changes nothing', async () => {
    const { db } = scriptedDb(
      fullScript({
        bays: [{ id: 'bay-1' }],
        technicians: [{ id: 'tech-1' }],
        busy: [{ bay_id: 'a-bay-at-another-dealership', technician_id: 'tech-1' }],
      }),
    );
    const outcome = await queryAvailability(db, BASE_QUERY);
    // bay-1 was never reported busy, so it stays; tech-1 was, so it is dropped. A subtraction
    // that worked by array length or index would get this wrong in either direction.
    expect(outcome).toEqual({ kind: 'available', bays: ['bay-1'], technicians: [] });
  });

  it('everything free is an ordinary answer — no candidate is busy', async () => {
    const { db } = scriptedDb(
      fullScript({ bays: [{ id: 'bay-1' }], technicians: [{ id: 'tech-1' }], busy: [] }),
    );
    expect(await queryAvailability(db, BASE_QUERY)).toEqual({
      kind: 'available',
      bays: ['bay-1'],
      technicians: ['tech-1'],
    });
  });

  it('everything busy is an ordinary answer too — empty lists, not an error', async () => {
    const { db } = scriptedDb(
      fullScript({
        bays: [{ id: 'bay-1' }],
        technicians: [{ id: 'tech-1' }],
        busy: [{ bay_id: 'bay-1', technician_id: 'tech-1' }],
      }),
    );
    expect(await queryAvailability(db, BASE_QUERY)).toEqual({
      kind: 'available',
      bays: [],
      technicians: [],
    });
  });

  it('passes the window straight through to busyResources as Dates, not as the millisecond pair', async () => {
    const { db, recorded } = scriptedDb(fullScript({}));
    await queryAvailability(db, BASE_QUERY);
    const busySql = sqlOf(recorded, /tstzrange\(\$/);
    expect(busySql).toBeDefined();
    const busyQuery = recorded.find((q) => q.sql === busySql);
    const params = (busyQuery?.parameters ?? []) as unknown[];
    expect(params.some((p) => p instanceof Date && p.getTime() === FROM_MILLIS)).toBe(true);
    expect(params.some((p) => p instanceof Date && p.getTime() === TO_MILLIS)).toBe(true);
  });
});
