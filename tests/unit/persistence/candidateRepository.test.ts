import { describe, expect, it } from 'vitest';
import { candidateResources } from '../../../src/persistence/candidateRepository.js';
import { scriptedDb } from '../helpers/stub-db.js';

const DEALERSHIP = '11111111-1111-4111-8111-111111111111';
const SERVICE_TYPE = '44444444-4444-4444-8444-444444444444';

describe('candidateResources', () => {
  it('returns the two id lists, and nothing that could mean "free"', async () => {
    const { db } = scriptedDb([
      { rows: [{ id: 'bay-a' }, { id: 'bay-b' }] },
      { rows: [{ id: 'tech-a' }] },
    ]);
    const candidates = await candidateResources(db, DEALERSHIP, SERVICE_TYPE);

    // The shape is the point. `CandidateSet` has no timestamp, no freshness marker and no
    // availability flag, so there is nothing in it for a later reader to trust — which is what
    // makes it safe for this slice to read candidates BEFORE the availability filter exists.
    expect(candidates).toEqual({ bays: ['bay-a', 'bay-b'], technicians: ['tech-a'] });
    expect(Object.keys(candidates).sort()).toEqual(['bays', 'technicians']);
  });

  it('DOES NOT READ THE APPOINTMENT TABLE — not filtered, not joined, not NOT EXISTS-ed', async () => {
    // AC-5 at the one place it is most tempting to break. arc42 §5.2 calls this the "advisory"
    // availability read and §6.2 step 5 has it consulting availability — both true of the
    // FINISHED system. An advisory read is only safe because ADR-0004's loop adjudicates every
    // suggestion, and slice 04 adds the filter alongside ADR-0009's ordering and QS-3. Until
    // then there is no read whose result could be trusted, so check-then-act has no subject.
    const { db, recorded } = scriptedDb([{ rows: [] }, { rows: [] }]);
    await candidateResources(db, DEALERSHIP, SERVICE_TYPE);
    expect(recorded.map((q) => q.sql).join('\n')).not.toMatch(/appointment/i);
  });

  it('is exactly two statements: bays, then qualified technicians', async () => {
    const { db, recorded } = scriptedDb([{ rows: [] }, { rows: [] }]);
    await candidateResources(db, DEALERSHIP, SERVICE_TYPE);

    expect(recorded.map((q) => q.sql.replace(/\s+/g, ' '))).toEqual([
      'select "id" from "service_bay" where "dealership_id" = $1 order by "name"',
      'select "technician"."id" as "id" from "technician" ' +
        'inner join "technician_qualification" on "technician_qualification"."technician_id" = "technician"."id" ' +
        'where "technician"."dealership_id" = $1 and "technician_qualification"."service_type_id" = $2 ' +
        'order by "technician"."id"',
    ]);
  });

  it('orders bays by NAME and technicians by ID — deterministic, which is F-02-7\'s substitute for a seed', async () => {
    // There is no ADR-0009 seed in slice 02: the seeded shuffle and the attempt cap are slice
    // 04's. A deterministic order is re-runnable by construction with nothing to record, and the
    // acceptance fixture zero-pads bay names (`bay-000`, `bay-001`) so `ORDER BY name` and the
    // order the test expects agree. A mutant dropping either `orderBy` makes the candidate
    // sequence a property of the heap.
    const { db, recorded } = scriptedDb([{ rows: [] }, { rows: [] }]);
    await candidateResources(db, DEALERSHIP, SERVICE_TYPE);
    expect(recorded[0]?.sql).toMatch(/order by "name"$/);
    expect(recorded[1]?.sql).toMatch(/order by "technician"\."id"$/);
  });

  it('scopes technicians to BOTH the dealership and the service type', async () => {
    // A-3 and Requirement 2's first half. Dropping either predicate offers a candidate the
    // composite FKs would refuse — `appointment_technician_in_dealership` or
    // `appointment_technician_qualified` — which turns a 422 into a wasted attempt and a 500.
    const { db, recorded } = scriptedDb([{ rows: [] }, { rows: [] }]);
    await candidateResources(db, DEALERSHIP, SERVICE_TYPE);
    expect(recorded[1]?.parameters).toEqual([DEALERSHIP, SERVICE_TYPE]);
  });

  it('returns empty lists rather than throwing when a dealership has neither', async () => {
    // Both empties are ORDINARY VALUES here and are ruled on by the use case, not by this
    // module: zero bays is broken reference data (500) and no qualified technician is an
    // ordinary state of an ordinary dealership (422). A repository that threw would collapse
    // the two into one 500 and AC-9's `service-type` arm would be unreachable.
    const { db } = scriptedDb([{ rows: [] }, { rows: [] }]);
    expect(await candidateResources(db, DEALERSHIP, SERVICE_TYPE)).toEqual({
      bays: [],
      technicians: [],
    });
  });
});
