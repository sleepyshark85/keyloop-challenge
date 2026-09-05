/**
 * Slice 02's fixtures and client helpers — test-engineer's, step 3 (the red commit).
 *
 * `docs/slices/02-book-and-read-an-appointment.md` · `docs/slices/02-design.md` ·
 * arc42 §8.1, §8.6 · `CLAUDE.md` §2.2, §5.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS ALONGSIDE `seed.ts` RATHER THAN INSIDE IT.
 *
 * `seed.ts` seeds ONE shape — two bays, two technicians, one asymmetric qualification —
 * because slice 00 needed exactly one shape to make each constraint individually violable.
 * Slice 02 needs the shape to be a PARAMETER: AC-3 is "one free bay, technicians plentiful",
 * AC-4 is its mirror, AC-11 needs a dealership whose bay list can be emptied while its
 * technician list cannot, and AC-12's `500` row needs a dealership whose `time_zone` does
 * not parse. Widening `seed.ts` in place would have changed the fixture ten committed slice-00
 * assertions are written against, so this is a second transcription beside it rather than an
 * edit to it.
 *
 * It keeps every property `seed.ts` is built on, and for the same reasons:
 *
 * 1. **It is an independent transcription of arc42 §8.1.** Written by a role that cannot read
 *    `src/persistence/migrations/`, from arc42 alone, naming every column it writes. A renamed
 *    column fails loudly with `42703` rather than silently.
 * 2. **No `ON CONFLICT DO NOTHING`.** Two cases sharing a namespace must collide on
 *    `dealership_pkey`, because a silently shared fixture is how a vacuous pass is made.
 * 3. **No test discovers a fixture by query.** Every id is derived from the namespace and
 *    RETURNED; `select id from service_bay limit 1` is a fixture shared by accident.
 * 4. **No import from `src/`** — `outside-in-tests-do-not-import-src` covers `tests/support/`.
 *    This file reaches the system the way a client does: over HTTP, and over SQL.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * NOTHING HERE THROWS ON A FAILURE OF THE SYSTEM UNDER TEST.
 *
 * Process criterion C1: at the red commit every failure must be an ASSERTION in a collected
 * file, never a load error and never an exception escaping a helper. So `postBooking` and
 * `getAppointment` return a `transportFailure` string instead of rejecting, exactly as
 * `startService` does, and the test asserts on it.
 *
 * Seeding is the deliberate exception and is allowed to throw: a fixture that cannot be
 * created is a fault in the TEST, not evidence about the system, and it happens inside an
 * `it()` body (never a hook), so Vitest reports it in the file it belongs to.
 */
import type { Client } from 'pg';
import { uuidFor, vinFor } from './ids.js';
import { ANCHOR } from './seed.js';
import type { StartedService } from './service.js';

export { ANCHOR };

/**
 * `ANCHOR` is `2026-09-08T09:00:00.000Z` — a Tuesday, 10:00 in `Europe/London` (BST, +01:00).
 * Every interval in this slice is expressed as an offset from it so no literal timestamp is
 * scattered through a test file and every local-time claim is computed from one stated fact.
 */
export function at(minutesFromAnchor: number): Date {
  return new Date(ANCHOR.getTime() + minutesFromAnchor * 60_000);
}

/** The same instant as the RFC 3339 string the route schema accepts. */
export function isoAt(minutesFromAnchor: number): string {
  return at(minutesFromAnchor).toISOString();
}

// ────────────────────────────────────────────────────────────────────── the fixture ──

export interface ScenarioOptions {
  /** How many service bays the dealership has. Default 1. */
  readonly bays?: number;
  /** How many technicians, ALL qualified for the scenario's service type. Default 1. */
  readonly technicians?: number;
  /** How many (customer, vehicle) pairs. Default 1. Each vehicle belongs to its customer. */
  readonly customers?: number;
  /** The dealership's IANA zone. Default `Europe/London`. AC-12's `500` row seeds a bad one. */
  readonly timeZone?: string;
  /**
   * The opening hours written for ALL SEVEN days, so no claim in this suite depends on the
   * `day_of_week` numbering convention. `null` seeds no rows at all — every day closed.
   * Default 08:00–18:00.
   */
  readonly hours?: { readonly opensAt: string; readonly closesAt: string } | null;
  /** The scenario's service type duration. Default 60. */
  readonly durationMinutes?: number;
}

export interface CustomerVehicle {
  readonly customerId: string;
  readonly vehicleId: string;
}

export interface Scenario {
  readonly namespace: string;
  readonly dealershipId: string;
  readonly serviceTypeId: string;
  readonly durationMinutes: number;
  /** `service_bay.id`, in the `ORDER BY name` order §2.2 says candidates are read in. */
  readonly bayIds: readonly string[];
  /** `technician.id`, every one qualified for `serviceTypeId`. */
  readonly technicianIds: readonly string[];
  readonly customers: readonly CustomerVehicle[];
}

/**
 * Insert one dealership subtree shaped by `options` and return every id.
 *
 * Bay names are zero-padded (`bay-000`, `bay-001`, …) so `ORDER BY name` and the order of
 * `bayIds` agree — F-02-7's substitute for ADR-0009's seed. There IS no seed in slice 02:
 * candidate ordering is deterministic, so a failing interleaving is re-runnable by
 * construction and what the failure message must carry is the ORDER and the IDS, which
 * `describeScenario` below renders.
 */
export async function seedScenario(
  client: Client,
  namespace: string,
  options: ScenarioOptions = {},
): Promise<Scenario> {
  const bays = options.bays ?? 1;
  const technicians = options.technicians ?? 1;
  const customers = options.customers ?? 1;
  const timeZone = options.timeZone ?? 'Europe/London';
  const hours = options.hours === undefined ? { opensAt: '08:00:00', closesAt: '18:00:00' } : options.hours;
  const durationMinutes = options.durationMinutes ?? 60;

  const id = (name: string): string => uuidFor(namespace, name);
  const pad = (n: number): string => String(n).padStart(3, '0');

  const scenario: Scenario = {
    namespace,
    dealershipId: id('dealership'),
    serviceTypeId: id('service_type'),
    durationMinutes,
    bayIds: Array.from({ length: bays }, (_, i) => id(`service_bay/${pad(i)}`)),
    technicianIds: Array.from({ length: technicians }, (_, i) => id(`technician/${pad(i)}`)),
    customers: Array.from({ length: customers }, (_, i) => ({
      customerId: id(`customer/${pad(i)}`),
      vehicleId: id(`vehicle/${pad(i)}`),
    })),
  };

  // dealership (id, name, time_zone) — an IANA zone, ADR-0001 / A-8.
  await client.query('insert into dealership (id, name, time_zone) values ($1, $2, $3)', [
    scenario.dealershipId,
    `${namespace} motors`,
    timeZone,
  ]);

  // opening_hours (dealership_id, day_of_week, opens_at, closes_at). All seven days or none.
  if (hours !== null) {
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
      await client.query(
        'insert into opening_hours (dealership_id, day_of_week, opens_at, closes_at) values ($1, $2, $3, $4)',
        [scenario.dealershipId, dayOfWeek, hours.opensAt, hours.closesAt],
      );
    }
  }

  // service_type (id, name, duration_minutes) — NOT dealership-scoped, so it is namespaced.
  await client.query(
    'insert into service_type (id, name, duration_minutes) values ($1, $2, $3)',
    [scenario.serviceTypeId, `${namespace} service`, durationMinutes],
  );

  for (const [index, bayId] of scenario.bayIds.entries()) {
    await client.query('insert into service_bay (id, dealership_id, name) values ($1, $2, $3)', [
      bayId,
      scenario.dealershipId,
      `bay-${pad(index)}`,
    ]);
  }

  for (const [index, technicianId] of scenario.technicianIds.entries()) {
    await client.query('insert into technician (id, dealership_id, name) values ($1, $2, $3)', [
      technicianId,
      scenario.dealershipId,
      `tech-${pad(index)}`,
    ]);
    // Every technician qualified for the scenario's own service type: the scarcity in this
    // suite is expressed by the COUNT of technicians, never by a missing qualification, so a
    // case that wants "no qualified technician here" says `technicians: 0` and means it.
    await client.query(
      'insert into technician_qualification (technician_id, service_type_id) values ($1, $2)',
      [technicianId, scenario.serviceTypeId],
    );
  }

  for (const [index, pair] of scenario.customers.entries()) {
    await client.query('insert into customer (id, name) values ($1, $2)', [
      pair.customerId,
      `${namespace} customer ${pad(index)}`,
    ]);
    await client.query(
      'insert into vehicle (id, customer_id, vin, description) values ($1, $2, $3, $4)',
      [pair.vehicleId, pair.customerId, vinFor(namespace, `vehicle/${pad(index)}`), `vehicle ${pad(index)}`],
    );
  }

  return scenario;
}

/** A further derived id inside a scenario's namespace — for rows a case writes itself. */
export function uuidNamespaceOf(scenario: Scenario, name: string): string {
  return uuidFor(scenario.namespace, name);
}

/**
 * The failure-message payload F-02-7 substitutes for ADR-0009's seed.
 *
 * The slice's Definition of Done asks the concurrency tests to "record ADR-0009's seed in the
 * failure message so a failing interleaving is re-runnable rather than a flake". There is no
 * seed in slice 02 — the seeded shuffle and the attempt cap are slice 04's, and candidate
 * ordering here is deterministic. A deterministic order is reproducible by construction with
 * nothing to record, so what a failure must carry is the order that WAS used and the ids it
 * used it on. That is this.
 */
export function describeScenario(scenario: Scenario): string {
  return [
    `  namespace       ${scenario.namespace}`,
    `  dealership      ${scenario.dealershipId}`,
    `  serviceType     ${scenario.serviceTypeId} (${scenario.durationMinutes} min)`,
    `  bays (ORDER BY name, ${scenario.bayIds.length})`,
    ...scenario.bayIds.map((b, i) => `      [${i}] ${b}`),
    `  technicians (${scenario.technicianIds.length})`,
    ...scenario.technicianIds.map((t, i) => `      [${i}] ${t}`),
    `  customers (${scenario.customers.length})`,
    ...scenario.customers.map((c, i) => `      [${i}] ${c.customerId} / ${c.vehicleId}`),
  ].join('\n');
}

/**
 * Occupy a (bay, technician) pair over an interval by writing an `appointment` row directly.
 *
 * Used ONLY by the uncontended taxonomy cases, to make a resource scarce without a race. It
 * is never used to manufacture the conflict AC-3 and AC-4 assert on: a test that inserts its
 * own probe row chooses which constraint the loser trips, and the assertion goes vacuous
 * while staying green (design §2.6, I-02-6).
 */
export async function occupy(
  client: Client,
  scenario: Scenario,
  what: {
    readonly label: string;
    readonly bayId: string;
    readonly technicianId: string;
    readonly customer?: CustomerVehicle;
    readonly startsAt: Date;
    readonly endsAt: Date;
  },
): Promise<string> {
  const customer = what.customer ?? scenario.customers[0];
  if (customer === undefined) throw new Error('occupy() needs at least one seeded customer');
  const appointmentId = uuidFor(scenario.namespace, `occupied/${what.label}`);
  await client.query(
    `insert into appointment
       (id, dealership_id, customer_id, vehicle_id, service_type_id, technician_id, bay_id, starts_at, ends_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      appointmentId,
      scenario.dealershipId,
      customer.customerId,
      customer.vehicleId,
      scenario.serviceTypeId,
      what.technicianId,
      what.bayId,
      what.startsAt.toISOString(),
      what.endsAt.toISOString(),
    ],
  );
  return appointmentId;
}

// ────────────────────────────────────────────────────────────── reading the table back ──

export interface StoredAppointment {
  readonly id: string;
  readonly dealershipId: string;
  readonly customerId: string;
  readonly vehicleId: string;
  readonly serviceTypeId: string;
  readonly technicianId: string;
  readonly bayId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: string;
}

const SELECT_APPOINTMENT = `
  select id, dealership_id, customer_id, vehicle_id, service_type_id, technician_id, bay_id,
         starts_at, ends_at, status::text as status
    from appointment`;

function toStored(row: Record<string, unknown>): StoredAppointment {
  const instant = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
  return {
    id: String(row['id']),
    dealershipId: String(row['dealership_id']),
    customerId: String(row['customer_id']),
    vehicleId: String(row['vehicle_id']),
    serviceTypeId: String(row['service_type_id']),
    technicianId: String(row['technician_id']),
    bayId: String(row['bay_id']),
    startsAt: instant(row['starts_at']),
    endsAt: instant(row['ends_at']),
    status: String(row['status']),
  };
}

export async function findStoredAppointment(
  client: Client,
  id: string,
): Promise<StoredAppointment | null> {
  const { rows } = await client.query<Record<string, unknown>>(
    `${SELECT_APPOINTMENT} where id = $1`,
    [id],
  );
  const row = rows[0];
  return row === undefined ? null : toStored(row);
}

/**
 * Every non-cancelled row for `column = value` overlapping `[startsAt, endsAt)`.
 *
 * QS-1 and QS-2 are asserted OVER THE TABLE, never over the responses alone, and the range
 * predicate is the constraint's own: `tstzrange(starts_at, ends_at) && tstzrange($2, $3)`.
 * Counting rows with an EQUAL interval would pass over a system that booked twenty
 * overlapping-but-unequal appointments, which is the property the scenario is about.
 */
export async function overlappingConfirmed(
  client: Client,
  column: 'bay_id' | 'technician_id',
  value: string,
  startsAt: Date,
  endsAt: Date,
): Promise<readonly StoredAppointment[]> {
  const { rows } = await client.query<Record<string, unknown>>(
    `${SELECT_APPOINTMENT}
      where ${column} = $1
        and status <> 'cancelled'
        and tstzrange(starts_at, ends_at) && tstzrange($2, $3)
      order by starts_at, id`,
    [value, startsAt.toISOString(), endsAt.toISOString()],
  );
  return rows.map(toStored);
}

// ─────────────────────────────────────────────────────────────────────── the client ──

/** The `POST /appointments` body of design §2.7. Deliberately `unknown`-valued so a case can send a wrong shape. */
export type BookingBody = Record<string, unknown>;

export function bookingBody(
  scenario: Scenario,
  options: { readonly customerIndex?: number; readonly startsAtMinutes?: number } = {},
): BookingBody {
  const customer = scenario.customers[options.customerIndex ?? 0];
  if (customer === undefined) throw new Error('bookingBody() needs at least one seeded customer');
  return {
    dealershipId: scenario.dealershipId,
    customerId: customer.customerId,
    vehicleId: customer.vehicleId,
    serviceTypeId: scenario.serviceTypeId,
    startsAt: isoAt(options.startsAtMinutes ?? 0),
  };
}

export interface HttpAnswer {
  /** Present iff the request completed. */
  readonly status?: number;
  readonly contentType?: string;
  /** The parsed body, or `undefined` if it was not JSON. `rawBody` always carries the text. */
  readonly body?: unknown;
  readonly rawBody?: string;
  /** Present iff the request did NOT complete. Never thrown — C1. */
  readonly transportFailure?: string;
}

async function request(
  url: string,
  init: RequestInit & { readonly method: string },
): Promise<HttpAnswer> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    return { transportFailure: `${init.method} ${url} did not complete: ${String(error)}` };
  }
  let rawBody = '';
  try {
    rawBody = await response.text();
  } catch (error) {
    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? undefined,
      transportFailure: `${init.method} ${url} answered ${response.status} but its body could not be read: ${String(error)}`,
    };
  }
  let body: unknown;
  try {
    body = rawBody === '' ? undefined : JSON.parse(rawBody);
  } catch {
    body = undefined;
  }
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? undefined,
    body,
    rawBody,
  };
}

export async function postBooking(service: StartedService, body: BookingBody): Promise<HttpAnswer> {
  return await request(`${service.baseUrl}/appointments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function getAppointment(service: StartedService, id: string): Promise<HttpAnswer> {
  return await request(`${service.baseUrl}/appointments/${id}`, { method: 'GET' });
}

/** A one-line rendering of an answer, for a failure message. */
export function describeAnswer(answer: HttpAnswer): string {
  if (answer.transportFailure !== undefined) return answer.transportFailure;
  return `${String(answer.status)} ${answer.contentType ?? '(no content-type)'} ${answer.rawBody ?? ''}`;
}

/** The members a test asserts on, extracted defensively so a missing body is a value, not a throw. */
export function member(answer: HttpAnswer, name: string): unknown {
  const body = answer.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  return (body as Record<string, unknown>)[name];
}

// ───────────────────────────────────────────────────────── the barrier, and the conflict log ──

/**
 * Release `count` requests as simultaneously as this runtime allows.
 *
 * Every racer is constructed first and parks on one shared promise; the promise is resolved
 * only after all `count` of them have parked. Firing `Promise.all(map(fetch))` without the
 * barrier starts request 0 while request 19 is still being built, which is a staggered start
 * wearing a race's clothes.
 */
export async function releaseFromBarrier<T>(
  count: number,
  racer: (index: number) => Promise<T>,
): Promise<readonly T[]> {
  let open = (): void => {};
  const gate = new Promise<void>((resolveGate) => {
    open = () => resolveGate();
  });
  let parked = 0;
  let allParked = (): void => {};
  const everyoneParked = new Promise<void>((resolveParked) => {
    allParked = () => resolveParked();
  });

  const racers = Array.from({ length: count }, async (_unused, index) => {
    parked += 1;
    if (parked === count) allParked();
    await gate;
    return await racer(index);
  });

  await everyoneParked;
  open();
  return await Promise.all(racers);
}

/**
 * The `booking.conflict` records of design §2.6 / I-02-6: one structured line per `23P01`,
 * carrying `constraint`, `resource` and `attempt`.
 *
 * A record counts as one iff it names the event AND carries the two fields the acceptance
 * criteria are about. The event name is pinned by the design; both of `pino`'s renderings of
 * it are accepted — `event` when it is a field of the structured object, `msg` when it is
 * passed as the message argument — because which of the two carries the string is a `pino`
 * calling convention rather than anything AC-3 or AC-4 assert.
 */
export const BOOKING_CONFLICT_EVENT = 'booking.conflict';

export interface ConflictRecord {
  readonly constraint: string;
  readonly resource: string;
  readonly attempt: unknown;
}

export function conflictRecords(
  records: readonly Record<string, unknown>[],
): readonly ConflictRecord[] {
  const out: ConflictRecord[] = [];
  for (const record of records) {
    const named =
      record['event'] === BOOKING_CONFLICT_EVENT || record['msg'] === BOOKING_CONFLICT_EVENT;
    if (!named) continue;
    out.push({
      constraint: String(record['constraint']),
      resource: String(record['resource']),
      attempt: record['attempt'],
    });
  }
  return out;
}

/** Everything the service said, for a failure message that can be diagnosed offline. */
export function describeServiceOutput(service: StartedService): string {
  const { stdout, stderr } = service.output();
  const indent = (text: string): string =>
    text.trimEnd() === ''
      ? '      (empty)'
      : text
          .trimEnd()
          .split('\n')
          .map((line) => `      ${line}`)
          .join('\n');
  return `  stdout\n${indent(stdout)}\n  stderr\n${indent(stderr)}`;
}
