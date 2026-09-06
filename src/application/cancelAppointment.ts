/**
 * `POST /appointments/{id}/cancellation` — ADR-0003's status transition, as a use case.
 *
 * It is one repository call and one mapping, and everything it does NOT do is the design:
 *
 *   - no pre-read, so there is nothing to check and then act on (`CLAUDE.md` §2.1 has no subject
 *     here, which is cheaper than having an exemption to argue);
 *   - no branch on the appointment's current status, so a replay walks the identical path —
 *     AC-3's idempotency is a property of D1's `UPDATE`, not of a guard written here;
 *   - no advisory lock and no transaction (ADR-0023), for the reason
 *     `cancelAppointmentById`'s docblock quotes off the constraint predicates.
 *
 * `CancelOutcome` IS ITS OWN UNION and not a reuse of `ReadOutcome`, although the two are
 * structurally identical today. Sharing them would mean a member added for one route silently
 * changing the other route's exhaustiveness check — §5.2's rule, and the reason each use case
 * declares the union its own edge maps.
 *
 * `not-found` is unambiguous only because the statement is unguarded: zero rows means no such id
 * and cannot also mean "already cancelled" (arc42 §6.6).
 */
import { toAppointmentView } from './bookAppointment.js';
import type { AppointmentView } from './bookAppointment.js';
import { cancelAppointmentById } from '../persistence/appointmentRepository.js';
import type { Db } from '../persistence/db.js';

export type CancelOutcome =
  | { readonly kind: 'cancelled'; readonly appointment: AppointmentView }
  | { readonly kind: 'not-found' };

export async function cancelAppointment(db: Db, id: string): Promise<CancelOutcome> {
  const row = await cancelAppointmentById(db, id);

  return row === null
    ? { kind: 'not-found' }
    : { kind: 'cancelled', appointment: toAppointmentView(row) };
}
