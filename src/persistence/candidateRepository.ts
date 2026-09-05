/**
 * The candidate bays and the candidate technicians for one (dealership, service type).
 *
 * ── THIS QUERY DOES NOT READ THE `appointment` TABLE ──────────────────────────────────────────
 *
 * Not filtered by it, not joined to it, not `NOT EXISTS`-ed against it. It reads `service_bay` for
 * the dealership, and `technician` joined to `technician_qualification` for the dealership and the
 * service type. That is reference data and nothing else, and the `appointment-table-access` marker
 * in tests/architecture is what keeps it that way.
 *
 * arc42 §5.2 calls this module "the ADVISORY free-bay and free-qualified-technician read" and
 * §6.2 step 5 has it consulting availability. Both are right about the FINISHED system. But an
 * advisory read is only safe because ADR-0004's loop makes every suggestion get adjudicated, and
 * this slice should not introduce the read before the mechanism that makes trusting it impossible
 * is visible next to it. In slice 02 there is no availability read IN EXISTENCE, so there is no
 * read whose result could be trusted — check-then-act is not merely absent from the diff, it has
 * no subject. Slice 04 adds the availability filter in the same slice as ADR-0009's ordering and
 * QS-3, where the read and the reason it is advisory arrive together.
 *
 * The cost is the pessimism the slice file already scopes: a request may be refused while an
 * untried bay is free, until slice 04. Nothing in AC-1 to AC-19 depends on it not being.
 *
 * `CandidateSet` IS TWO LISTS OF IDS AND NOTHING ELSE. It has no field that could mean "free", no
 * timestamp and no freshness marker — there is nothing in the type for a later reader to trust.
 */
import type { Db } from './db.js';

export interface CandidateSet {
  /** `service_bay.id` for the dealership, `ORDER BY name`. */
  readonly bays: readonly string[];
  /** `technician.id` at the dealership and qualified for the service type, `ORDER BY id`. */
  readonly technicians: readonly string[];
}

/**
 * Both orderings are DETERMINISTIC and that is F-02-7's substitute for ADR-0009's seed: there is
 * no seed in slice 02, because the seeded shuffle and the attempt cap are slice 04's. A
 * deterministic order is re-runnable by construction with nothing to record.
 */
export async function candidateResources(
  db: Db,
  dealershipId: string,
  serviceTypeId: string,
): Promise<CandidateSet> {
  const bayRows = await db
    .selectFrom('service_bay')
    .select(['id'])
    .where('dealership_id', '=', dealershipId)
    .orderBy('name')
    .execute();

  // A-3 and Requirement 2's first half: the technician belongs to THIS dealership and is
  // qualified for THIS service type. The join is what makes "qualified" a fact about the data
  // rather than about the caller — and `appointment_technician_qualified` still adjudicates it at
  // the insert, so a candidate list that got it wrong is refused rather than believed.
  const technicianRows = await db
    .selectFrom('technician')
    .innerJoin(
      'technician_qualification',
      'technician_qualification.technician_id',
      'technician.id',
    )
    .select(['technician.id as id'])
    .where('technician.dealership_id', '=', dealershipId)
    .where('technician_qualification.service_type_id', '=', serviceTypeId)
    .orderBy('technician.id')
    .execute();

  return {
    bays: bayRows.map((row) => row.id),
    technicians: technicianRows.map((row) => row.id),
  };
}
