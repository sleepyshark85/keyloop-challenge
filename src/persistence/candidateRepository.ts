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
 * §6.2 step 5 has it consulting availability. Both are right about the FINISHED system. There is
 * still no availability read here, so check-then-act is not merely absent from the diff — it has
 * no subject.
 *
 * SLICE 04 DID NOT ADD THE FILTER, and the reason is better than the one slice 02 recorded here.
 * It is not that no acceptance criterion needs it: the pre-filter is only TRUSTWORTHY because of
 * QS-8 — every pair availability reports free is accepted by an `INSERT` — and QS-8 is slice 08's
 * property test. Shipping the filter before the property that validates it is backwards, so it
 * lands after slice 08 (04-design.md §5, §8).
 *
 * The cost is D-04-1, and it is now a measured number rather than a scoped pessimism: with no
 * filter the candidate list is every bay and every qualified technician, so
 * `|bays| + |technicians| - 1` exceeds ADR-0009's cap of 16 at §1.1 scale and a request CAN be
 * refused with an untried free bay behind the cap. `tests/acceptance/candidate-retry.test.ts`'s
 * seventeen-bay case is that refusal, standing evidence, deliberately.
 *
 * `CandidateSet` IS TWO LISTS OF IDS AND NOTHING ELSE. It has no field that could mean "free", no
 * timestamp and no freshness marker — there is nothing in the type for a later reader to trust.
 *
 * ── `availability.candidates`, arc42 §8.4 ──────────────────────────────────────────────────────
 *
 * The ONE call site every read of "which bays and technicians could this be" goes through —
 * `bookAppointment`, `rescheduleAppointment` and `queryAvailability` all call this function and
 * nothing else reads `service_bay`/`technician` for a candidate list — so instrumenting here
 * gives AC-1's ordering claim (this span ends before the first `appointment.insert` begins) and
 * AC-14's "reads the set once" claim (no nested per-candidate query spans) from one span, on
 * every caller, for free. `@opentelemetry/api` only: decision 1 confines the SDK itself to
 * `src/platform` and `src/main.ts`.
 */
import { tracer } from '../platform/telemetry.js';
import type { Db } from './db.js';

export interface CandidateSet {
  /** `service_bay.id` for the dealership, `ORDER BY name`. */
  readonly bays: readonly string[];
  /** `technician.id` at the dealership and qualified for the service type, `ORDER BY id`. */
  readonly technicians: readonly string[];
}

/**
 * Both orderings are deterministic, and NOTHING DOWNSTREAM MAY RELY ON THAT any more. Slice 04's
 * `orderCandidates` permutes both lists from a per-request seed (ADR-0009's Order-C), so the
 * `ORDER BY` here decides only what a debugging `SELECT` looks like — it is stability for the
 * reader, not allocation order. F-02-7's "a deterministic order is re-runnable with nothing to
 * record" is retired: what is recorded now is the seed, on `booking.refused` (ADR-0021).
 */
export async function candidateResources(
  db: Db,
  dealershipId: string,
  serviceTypeId: string,
): Promise<CandidateSet> {
  return await tracer.startActiveSpan('availability.candidates', async (span) => {
    try {
      const bayRows = await db
        .selectFrom('service_bay')
        .select(['id'])
        .where('dealership_id', '=', dealershipId)
        .orderBy('name')
        .execute();

      // A-3 and Requirement 2's first half: the technician belongs to THIS dealership and is
      // qualified for THIS service type. The join is what makes "qualified" a fact about the
      // data rather than about the caller — and `appointment_technician_qualified` still
      // adjudicates it at the insert, so a candidate list that got it wrong is refused rather
      // than believed.
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

      const result: CandidateSet = {
        bays: bayRows.map((row) => row.id),
        technicians: technicianRows.map((row) => row.id),
      };
      span.setAttribute('candidates.bays', result.bays.length);
      span.setAttribute('candidates.technicians', result.technicians.length);
      return result;
    } finally {
      span.end();
    }
  });
}
