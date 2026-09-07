/**
 * `GET /availability` — the use case. ADR-0032, design §1.1-§1.3, §2.
 *
 * ── TWO READS, COMPOSED HERE — NEITHER REPOSITORY DECIDES "FREE" ─────────────────────────────
 *
 * `candidateResources` (reference data: which bays and qualified technicians this dealership
 * has for this service type) and `busyResources` (which of those are occupied over the queried
 * window) are two independent queries in two different files, and this module is the ONLY place
 * that subtracts one from the other. Neither repository could answer "is X free" on its own, and
 * that is deliberate: the subtraction happening here, in the open, is what makes it reviewable —
 * there is no single query anywhere whose result IS an availability answer.
 *
 * ── THIS PATH NEVER TOUCHES `INSERT`, AND THAT IS THE WHOLE OF §2.1's ANSWER HERE ─────────────
 *
 * `CLAUDE.md` §2.1 governs check-then-act; design §1.3 is the finding that §2.1 is SILENT about
 * this endpoint because a `GET` performs no act. What keeps "advisory" true is not a rule this
 * module obeys, but a fact about the rest of the system: nothing here calls `lockResources` or
 * `insertAppointment`, and nothing outside `bookAppointment.ts`/`rescheduleAppointment.ts` ever
 * does, so a free answer from this function cannot be turned into a reservation by any code path.
 *
 * ── `malformed-window` COVERS TWO THINGS, DELIBERATELY ONE OUTCOME ────────────────────────────
 *
 * `to <= from` (AC-6, F-08-3: the route must guard the same way round the database does,
 * `ends_at > starts_at`) and an unrenderable instant (ADR-0014's `instant()`, the same
 * constructor `deriveInterval.ts` uses for `startsAt`) are both client-supplied nonsense about
 * the window, and design §2's sketch gives them one member rather than two — there is no second
 * fact a client could act on by telling the two apart, unlike `malformed-instant` versus
 * `outside-opening-hours` on the booking path, which differ in what the client should try next.
 */
import { instant } from '../domain/interval.js';
import { busyResources } from '../persistence/appointmentRepository.js';
import { candidateResources } from '../persistence/candidateRepository.js';
import { findDealership, findServiceType } from '../persistence/referenceRepository.js';
import type { Db } from '../persistence/db.js';

export interface AvailabilityQuery {
  readonly dealershipId: string;
  readonly serviceTypeId: string;
  /** Epoch milliseconds — the same shape `BookCommand.startsAtMillis` takes. */
  readonly fromMillis: number;
  readonly toMillis: number;
}

export type AvailabilityOutcome =
  | {
      readonly kind: 'available';
      readonly bays: readonly string[];
      readonly technicians: readonly string[];
    }
  /** AC-6 (`to <= from`), or either bound not a renderable instant (ADR-0014). */
  | { readonly kind: 'malformed-window' }
  | { readonly kind: 'unknown-reference'; readonly reference: 'dealership' | 'service-type' };

export async function queryAvailability(
  db: Db,
  query: AvailabilityQuery,
): Promise<AvailabilityOutcome> {
  // 1. The window, FIRST — same discipline as `deriveInterval`'s "the instant before anything
  //    else": nothing below is meaningful if `from`/`to` cannot even be rendered.
  const from = instant(query.fromMillis);
  const to = instant(query.toMillis);
  if (from === null || to === null || to <= from) return { kind: 'malformed-window' };

  // 2. Reference data. Ordinary 422s, exactly as `bookAppointment`'s AC-9 arms — a query naming
  //    a dealership or service type that does not exist is not a capacity question.
  const dealership = await findDealership(db, query.dealershipId);
  if (dealership === null) return { kind: 'unknown-reference', reference: 'dealership' };

  const serviceType = await findServiceType(db, query.serviceTypeId);
  if (serviceType === null) return { kind: 'unknown-reference', reference: 'service-type' };

  // 3. The two reads, and the ONE subtraction. `candidateResources` never sees `appointment`
  //    (QS-12's marker); `busyResources` never sees `service_bay`/`technician`. Only this line
  //    puts the two together. Sequential rather than concurrent: the query is answered from one
  //    round trip's latency budget on top of another rather than two split across a pool
  //    connection each, and it is what keeps the wire order of statements a fact this module
  //    states rather than one an event-loop interleaving happens to produce.
  const candidates = await candidateResources(db, query.dealershipId, query.serviceTypeId);
  const busy = await busyResources(db, query.dealershipId, new Date(from), new Date(to));

  const busyBays = new Set(busy.bays);
  const busyTechnicians = new Set(busy.technicians);

  return {
    kind: 'available',
    bays: candidates.bays.filter((id) => !busyBays.has(id)),
    technicians: candidates.technicians.filter((id) => !busyTechnicians.has(id)),
  };
}
