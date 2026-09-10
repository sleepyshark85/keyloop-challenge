import { describe, expect, it } from 'vitest';
import { queryAvailability } from '../../../src/application/queryAvailability.js';
import type { AvailabilityQuery } from '../../../src/application/queryAvailability.js';
import { scriptedDb } from '../helpers/stub-db.js';
import type { ScriptedStep } from '../helpers/stub-db.js';

/**
 * The SUBTRACTION, the derivation gating, and the precedence — the parts of `GET /availability`
 * that are decisions in code rather than facts about PostgreSQL. `tests/property/
 * availability-agrees-with-constraint.db.test.ts` is what proves the two reads AGREE with the
 * constraint (QS-8), against a real container, and is the test-engineer's; this file asserts
 * none of that. What IS here: that `queryAvailability` composes `candidateResources` and
 * `busyResources` by ID membership rather than by list length or position, that the statement
 * order is `bookAppointment`'s own (dealership → service type → `deriveInterval` → candidates →
 * busy), and that every `deriveInterval` verdict maps to the outcome `routes/availability.ts`
 * expects.
 *
 * `docs/slices/16-availability-derives-its-own-window.md`, `docs/slices/16-design.md` §3 ·
 * arc42 §6.5, §8.6, §10.2, §11.1 · ADR-0039. This file SUPERSEDES the slice 08 version at the
 * same path: `fromMillis`/`toMillis` and `malformed-window` are gone (replaced by
 * `startsAtMillis` and `malformed-instant`/`outside-opening-hours`/`reference-data-invalid`),
 * and the reference-data short-circuit tests below now run BEFORE `deriveInterval` rather than
 * after a window guard that no longer exists.
 */

const DEALERSHIP = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SERVICE_TYPE = 'ssssssss-0000-4000-8000-000000000000';

/** 10:00 local (BST) on Tuesday 2026-09-08, inside 08:00-18:00 — `bookAppointment.test.ts`'s own
 * fixture instant, reused so the two paths' unit tests share one notion of "a normal booking". */
const STARTS_AT_MILLIS = Date.parse('2026-09-08T09:00:00.000Z');

const BASE_QUERY: AvailabilityQuery = {
  dealershipId: DEALERSHIP,
  serviceTypeId: SERVICE_TYPE,
  startsAtMillis: STARTS_AT_MILLIS,
};

const DEALERSHIP_ROW = { id: DEALERSHIP, time_zone: 'Europe/London' };
const SERVICE_TYPE_ROW = { duration_minutes: 60 };

const OPEN_ALL_WEEK = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day_of_week: day,
  opens_at: '08:00:00',
  closes_at: '18:00:00',
}));

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
    { rows: OPEN_ALL_WEEK },
    { rows: [SERVICE_TYPE_ROW] },
    { rows: overrides.bays ?? [] },
    { rows: overrides.technicians ?? [] },
    { rows: overrides.busy ?? [] },
  ];
}

describe('queryAvailability — statement order is bookAppointment\'s own', () => {
  it('reference data, FIRST: an unknown dealership never reaches deriveInterval, candidateResources or busyResources', async () => {
    const { db, recorded } = scriptedDb([{ rows: [] }]);
    const outcome = await queryAvailability(db, BASE_QUERY);
    expect(outcome).toEqual({ kind: 'unknown-reference', reference: 'dealership' });
    expect(recorded).toHaveLength(1);
  });

  it('an unknown service type is unknown-reference, after the dealership resolves and before deriveInterval runs', async () => {
    const { db, recorded } = scriptedDb([
      { rows: [DEALERSHIP_ROW] },
      { rows: OPEN_ALL_WEEK }, // opening_hours
      { rows: [] }, // service_type — not found
    ]);
    const outcome = await queryAvailability(db, BASE_QUERY);
    expect(outcome).toEqual({ kind: 'unknown-reference', reference: 'service-type' });
    expect(recorded).toHaveLength(3);
  });

  it(
    'PRECEDENCE (AC-4): an unknown dealership AND an unrenderable startsAt together answer ' +
      'unknown-reference — the dealership check wins because it runs first',
    async () => {
      const { db, recorded } = scriptedDb([{ rows: [] }]);
      const outcome = await queryAvailability(db, { ...BASE_QUERY, startsAtMillis: NaN });
      expect(outcome).toEqual({ kind: 'unknown-reference', reference: 'dealership' });
      expect(recorded).toHaveLength(1);
    },
  );

  it('an unrenderable startsAt (NaN) is malformed-instant, but only AFTER both reference reads resolve', async () => {
    const { db, recorded } = scriptedDb([
      { rows: [DEALERSHIP_ROW] },
      { rows: OPEN_ALL_WEEK },
      { rows: [SERVICE_TYPE_ROW] },
    ]);
    const outcome = await queryAvailability(db, { ...BASE_QUERY, startsAtMillis: NaN });
    expect(outcome).toEqual({ kind: 'malformed-instant' });
    expect(recorded).toHaveLength(3);
  });
});

describe('queryAvailability — deriveInterval\'s other verdicts, mapped to AvailabilityOutcome', () => {
  it('a derived interval outside opening hours is outside-opening-hours, carrying the verdict', async () => {
    const { db, recorded } = scriptedDb([
      { rows: [DEALERSHIP_ROW] },
      { rows: OPEN_ALL_WEEK },
      { rows: [SERVICE_TYPE_ROW] },
    ]);
    // 03:00 local Tuesday — well outside 08:00-18:00.
    const outcome = await queryAvailability(db, {
      ...BASE_QUERY,
      startsAtMillis: Date.parse('2026-09-08T02:00:00.000Z'),
    });
    expect(outcome).toEqual({
      kind: 'outside-opening-hours',
      verdict: { kind: 'outside-window', dayOfWeek: 2, opensAt: '08:00:00', closesAt: '18:00:00' },
    });
    expect(recorded).toHaveLength(3);
  });

  it('a service type whose duration is not a positive integer is reference-data-invalid (service-type-duration)', async () => {
    const { db } = scriptedDb([
      { rows: [DEALERSHIP_ROW] },
      { rows: OPEN_ALL_WEEK },
      { rows: [{ duration_minutes: 0 }] },
    ]);
    const outcome = await queryAvailability(db, BASE_QUERY);
    expect(outcome).toEqual({ kind: 'reference-data-invalid', detail: 'service-type-duration' });
  });

  it('a dealership whose time zone does not resolve is reference-data-invalid (unknown-zone)', async () => {
    const { db } = scriptedDb([
      { rows: [{ id: DEALERSHIP, time_zone: 'Not/AZone' }] },
      { rows: OPEN_ALL_WEEK },
      { rows: [SERVICE_TYPE_ROW] },
    ]);
    const outcome = await queryAvailability(db, BASE_QUERY);
    expect(outcome).toEqual({ kind: 'reference-data-invalid', detail: 'unknown-zone' });
  });
});

describe('queryAvailability — the subtraction', () => {
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
      startsAt: STARTS_AT_MILLIS,
      endsAt: STARTS_AT_MILLIS + 3_600_000,
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
    expect(outcome).toEqual({
      kind: 'available',
      startsAt: STARTS_AT_MILLIS,
      endsAt: STARTS_AT_MILLIS + 3_600_000,
      bays: ['bay-1'],
      technicians: [],
    });
  });

  it('everything free is an ordinary answer — no candidate is busy', async () => {
    const { db } = scriptedDb(
      fullScript({ bays: [{ id: 'bay-1' }], technicians: [{ id: 'tech-1' }], busy: [] }),
    );
    expect(await queryAvailability(db, BASE_QUERY)).toEqual({
      kind: 'available',
      startsAt: STARTS_AT_MILLIS,
      endsAt: STARTS_AT_MILLIS + 3_600_000,
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
      startsAt: STARTS_AT_MILLIS,
      endsAt: STARTS_AT_MILLIS + 3_600_000,
      bays: [],
      technicians: [],
    });
  });
});
