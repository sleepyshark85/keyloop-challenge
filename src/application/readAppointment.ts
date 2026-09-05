/**
 * `GET /appointments/{id}` — AC-2.
 *
 * `ReadOutcome` exists so §5.2's "the mapping is one exhaustive `switch` the compiler checks"
 * reaches the `GET` route and not only the `POST` one (T-02-3, I-02-7). Two members today; the
 * point of writing it now rather than when there are five is that the third cannot be added
 * without `src/http` failing to build.
 *
 * It returns the SAME `AppointmentView` the `201` does, from the same schema, so a client parses
 * one thing and AC-1's "naming the allocated bay and technician" is asserted against the same
 * fields on both paths.
 */
import { toAppointmentView } from './bookAppointment.js';
import type { AppointmentView } from './bookAppointment.js';
import { findAppointmentById } from '../persistence/appointmentRepository.js';
import type { Db } from '../persistence/db.js';

export type ReadOutcome =
  | { readonly kind: 'found'; readonly appointment: AppointmentView }
  | { readonly kind: 'not-found' };

export async function readAppointment(db: Db, id: string): Promise<ReadOutcome> {
  const row = await findAppointmentById(db, id);

  // A cancelled appointment is FOUND, not missing: §8.6 makes cancellation a sub-resource
  // precisely so the appointment stays readable at the same URL, and `status` is what tells the
  // client which it is. `404` here is reserved for an id that names no row at all (AC-2).
  return row === null ? { kind: 'not-found' } : { kind: 'found', appointment: toAppointmentView(row) };
}
