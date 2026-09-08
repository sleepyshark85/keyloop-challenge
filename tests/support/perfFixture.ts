import type { Client } from 'pg';
import { seedScenario } from './booking.js';
import type { Scenario } from './booking.js';
import { uuidFor } from './ids.js';

/**
 * The QS-14 fixture — test-engineer's, slice 09 red commit.
 *
 * `docs/slices/09-observability.md` AC-12: "a seeded schedule of 5 bays, 20 technicians and
 * 500 appointments in one dealership over one week." Built on `seedScenario` (already
 * `bays`/`technicians`-parametric) plus one bulk `INSERT` for the 500 filler rows — 500
 * sequential round trips would dominate the FIXTURE's own cost, which is not what QS-14
 * measures.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE SCHEDULE, AND WHY IT LEAVES ROOM FOR THE MEASURED BOOKINGS.
 *
 * A 30-minute service type over an 08:00-18:00 day gives 20 slots/day/bay; 7 days x 5 bays x
 * 20 slots = 700 (bay, day, slotIndex) cells. A flat counter 0..699 is mapped to one cell by
 *
 *   bay            = counter % 5
 *   technician      = counter % 20
 *   slotGroup       = floor(counter / 5)
 *   day             = floor(slotGroup / 20)
 *   slotIndexInDay  = slotGroup % 20
 *
 * For any FIXED slotGroup the five consecutive counters spanning it produce five DISTINCT
 * `technician` values (five consecutive integers mod 20 are always distinct), so no
 * technician is ever double-booked within one (day, slotIndex) — the only way two rows this
 * scheme produces could overlap in time.
 *
 * Counters `0..499` are the 500 FILLER appointments AC-12's fixture asks for. Counters
 * `500..649` (150, comfortably over the warm-up-plus-sample count the test actually books)
 * are reserved, deliberately unused by the filler, for AC-13's timed bookings — each lands on
 * a cell nothing else in this fixture occupies, so it is genuinely "uncontended" rather than
 * merely unlikely to collide. Counter `650` is reserved the same way for the ONE instrumented
 * booking `tests/performance/availability-budget.test.ts` uses to read
 * `appointment.insert`/`availability.candidates` off the trace (AC-13's second half, AC-14) —
 * kept separate from the timing bookings because turning telemetry on is a different
 * measurement from timing it off (design decision 3). Counter `651` is reserved, again
 * separately, for AC-15's single CONTENDED slot — the one cell this fixture deliberately lets
 * many racers collide on.
 *
 * MEASURED, NOT ASSUMED: an earlier version of this file reserved only 100 timing slots and
 * placed the instrumented probe at counter 600, inside the ACTUAL range a 10-warm-up +
 * 100-sample timing loop books (500..609) — the probe collided with a timing booking and
 * failed on a spurious `409`, not on the real, intended absence of telemetry. The 150-slot
 * margin and the two further reserved counters below are the fix, kept as a comment because
 * the failure mode is exactly the kind §11 calls a trap: a fixture bug reading as the
 * criterion it is meant to prove.
 *
 * Base day is `2026-11-02`, chosen to sit AFTER the UK's 2026 DST fallback
 * (`2026-10-25T01:00:00Z`, arc42 §8.3) so every slot's UTC clock and Europe/London local
 * clock agree without a wall-clock conversion in this file — this fixture is about volume,
 * not about DST, and arc42 §8.3's transitions are QS-9's fixture, not this one's.
 */

export const FIXTURE_BAYS = 5;
export const FIXTURE_TECHNICIANS = 20;
export const FIXTURE_FILLER_APPOINTMENTS = 500;
export const FIXTURE_DURATION_MINUTES = 30;
export const SLOTS_PER_DAY = 20; // (18:00 - 08:00) / 30 minutes

const BASE_DAY = new Date('2026-11-02T08:00:00.000Z');

export function slotStartsAt(counter: number): Date {
  const slotGroup = Math.floor(counter / FIXTURE_BAYS);
  const day = Math.floor(slotGroup / SLOTS_PER_DAY);
  const slotIndexInDay = slotGroup % SLOTS_PER_DAY;
  return new Date(
    BASE_DAY.getTime() + day * 24 * 60 * 60_000 + slotIndexInDay * FIXTURE_DURATION_MINUTES * 60_000,
  );
}

/** Timing bookings may use indices `0..TIMING_RESERVED-1` without colliding with anything else. */
export const TIMING_RESERVED = 150;

export interface PerfFixture {
  readonly scenario: Scenario;
  /** The whole seeded week's outer bound, for AC-12's one-day query and its own span. */
  readonly weekStart: Date;
  readonly weekEnd: Date;
  /** Counter `500 + index` (`index` in `0..TIMING_RESERVED-1`) — AC-13's timed bookings. */
  timingBookingStartsAt(index: number): Date;
  /** Counter `650` — AC-13/AC-14's one instrumented, uncontended booking. */
  readonly telemetryProbeStartsAt: Date;
  /** Counter `651` — AC-15's single, deliberately CONTENDED slot. */
  readonly contendedProbeStartsAt: Date;
}

export async function seedPerfFixture(client: Client, namespace: string): Promise<PerfFixture> {
  const scenario = await seedScenario(client, namespace, {
    bays: FIXTURE_BAYS,
    technicians: FIXTURE_TECHNICIANS,
    customers: 1,
    durationMinutes: FIXTURE_DURATION_MINUTES,
    hours: { opensAt: '08:00:00', closesAt: '18:00:00' },
  });

  const rows: string[] = [];
  const values: unknown[] = [];
  let placeholder = 1;
  for (let counter = 0; counter < FIXTURE_FILLER_APPOINTMENTS; counter += 1) {
    const bayId = scenario.bayIds[counter % FIXTURE_BAYS];
    const technicianId = scenario.technicianIds[counter % FIXTURE_TECHNICIANS];
    const customer = scenario.customers[0];
    if (bayId === undefined || technicianId === undefined || customer === undefined) {
      throw new Error('seedPerfFixture: scenario did not seed the expected bays/technicians/customers');
    }
    const startsAt = slotStartsAt(counter);
    const endsAt = new Date(startsAt.getTime() + FIXTURE_DURATION_MINUTES * 60_000);
    const id = `${scenario.namespace}-filler-${String(counter)}`;
    rows.push(
      `($${String(placeholder)}, $${String(placeholder + 1)}, $${String(placeholder + 2)}, $${String(placeholder + 3)}, $${String(placeholder + 4)}, $${String(placeholder + 5)}, $${String(placeholder + 6)}, $${String(placeholder + 7)}, $${String(placeholder + 8)})`,
    );
    values.push(
      uuidFor(scenario.namespace, `filler/${String(counter)}`),
      scenario.dealershipId,
      customer.customerId,
      customer.vehicleId,
      scenario.serviceTypeId,
      technicianId,
      bayId,
      startsAt.toISOString(),
      endsAt.toISOString(),
    );
    placeholder += 9;
  }

  await client.query(
    `insert into appointment
       (id, dealership_id, customer_id, vehicle_id, service_type_id, technician_id, bay_id, starts_at, ends_at)
     values ${rows.join(', ')}`,
    values,
  );

  const weekStart = BASE_DAY;
  const weekEnd = new Date(BASE_DAY.getTime() + 7 * 24 * 60 * 60_000);

  return {
    scenario,
    weekStart,
    weekEnd,
    timingBookingStartsAt: (index: number) => {
      if (index < 0 || index >= TIMING_RESERVED) {
        throw new Error(`timingBookingStartsAt(${String(index)}) is outside the reserved 0..${String(TIMING_RESERVED - 1)} range`);
      }
      return slotStartsAt(FIXTURE_FILLER_APPOINTMENTS + index);
    },
    telemetryProbeStartsAt: slotStartsAt(FIXTURE_FILLER_APPOINTMENTS + TIMING_RESERVED),
    contendedProbeStartsAt: slotStartsAt(FIXTURE_FILLER_APPOINTMENTS + TIMING_RESERVED + 1),
  };
}
