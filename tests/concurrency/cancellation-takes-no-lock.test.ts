import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  at,
  bookingBody,
  confirmedOverlapping,
  describeAnswer,
  describeScenario,
  findStoredAppointment,
  member,
  postBooking,
  postCancellation,
  releaseFromBarrier,
  seedScenario,
} from '../support/booking.js';
import type { HttpAnswer } from '../support/booking.js';

/**
 * Slice 05 — ADR-0023's exemption, measured rather than asserted.
 *
 * `docs/slices/05-design.md` §5 (respecified at step 2, T-05-2) · ADR-0023 · ADR-0018 ·
 * arc42 §6.1, §11 (F-02-9, F-05-1).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THE STEP-1 SPECIFICATION FOR THIS FILE WAS REJECTED, AND WHAT REPLACED IT.
 *
 * ADR-0023 exempts one write path from F-02-9 — "every write path to `appointment` must take
 * these two locks in this order" — on a claim. ADR-0018 set this repository's standard that
 * lock claims are MEASURED. The step-1 spec was N cancels racing N bookings, asserting zero
 * `40P01`, zero `500`s, a verdict each and one confirmed row. Every one of those observables
 * is produced IDENTICALLY by ADR-0023's rejected Option A — pre-read, lock, update — because
 * the BOOKINGS still lock either way. The assertion set was invariant under the very mutation
 * the file exists to detect, and F-05-1 predicts the likelier regression anyway: someone adds
 * `lockResources` to the cancel for uniformity, and nothing goes red.
 *
 * Case 1 is the replacement, and it is three steps, not one. An absence assertion needs a
 * positive witness — `no-spurious-refusal.test.ts`'s own documented standard, turned on this
 * file:
 *
 *   1. DISCRIMINATOR. A second session holds the BAY advisory lock in an open transaction,
 *      keyed exactly as ADR-0018 derives it. Under that lock the cancel must answer 200
 *      within a deadline.
 *   2. CONTROL (non-optional). While the same lock is held, a BOOKING for that bay must NOT
 *      complete. Without it, a changed class constant or a changed key derivation makes step
 *      1's 200 vacuous — the cancel would return fast because nothing was ever locked.
 *   3. RELEASE WITNESS (added by the architect beyond the objection's ask). Release the lock
 *      and the booking must then complete. Otherwise "blocked" is inferred from a timeout,
 *      and a booking that was broken for some unrelated reason would read as blocked.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE MUTANT, AND IT WAS RUN BEFORE THIS FILE WAS WRITTEN.
 *
 * Mutant: the cancel obeys F-02-9 literally — ADR-0023's Option A. `postgres:16`, this
 * repository's own migrations, the bay lock held by a second session, `statement_timeout` 5 s:
 *
 *   D (shipped)  bare UPDATE, no advisory lock                          completed in    3 ms
 *   A (mutant)   pre-read + pg_advisory_xact_lock(1, bay) + UPDATE      BLOCKED, 57014 at 5006 ms
 *   control      INSERT preceded by ADR-0018's two locks (a booking)    BLOCKED, 57014 at 5003 ms
 *   witness      the same INSERT once the lock is released              completed in   12 ms
 *
 * So Option A does not merely take longer: it cannot complete while the lock is held, and the
 * deadline below is a LIVENESS assertion rather than a timing one.
 *
 * Then the three steps themselves were run over HTTP against two stub services — one cancelling
 * with the bare UPDATE, one with the pre-read and ADR-0018's two locks — with this case's own
 * lock held by a second session, to confirm the FILE discriminates and not merely the SQL:
 *
 *   D (shipped)   step 1 answered 200 in 21 ms · step 2 still blocked · step 3 released, 201
 *   A (mutant)    step 1 TIMED OUT — the case fails here, and steps 2 and 3 are never reached
 *
 * That is the discrimination the step-2 objection asked for, and it is the property the step-1
 * spec did not have: under that spec both variants produced identical observables.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * CASE 2 IS A MEASUREMENT, NOT THIS FILE'S EVIDENCE, AND ITS LIMIT IS STATED HERE.
 *
 * ADR-0023's M3 kept as a liveness reading: it separates CATASTROPHICALLY UNSAFE from SAFE
 * and does NOT separate Option A from Option D. Its assertions hold under both. Two further
 * limits, the second of which ADR-0023 does not carry because M3 raced raw INSERTs:
 *
 *   - Through the API a booking consults the ALLOCATOR before it ever reaches an insert, so a
 *     racer that reads while A is still confirmed is refused with no lock taken and no
 *     constraint consulted. This cell therefore stages LESS contention than M3 did.
 *   - `BOOKING_SEED` is unset, as in every concurrency file (ADR-0021): a constant seed is
 *     ADR-0009's Order-A.
 */

/** ADR-0018: class 1 is bays, class 2 technicians — disjoint key spaces, an unsortable order. */
const BAY_LOCK_CLASS = 1;

/**
 * How long the cancel gets. Chosen against the measurement above, where the shipped statement
 * took 3 ms and Option A did not finish at all: any finite deadline discriminates, and this
 * one is three orders of magnitude above the observed cost so it can never fail for load.
 */
const CANCEL_DEADLINE_MS = 5_000;
/** How long the control watches the booking NOT complete. */
const BLOCKED_PROBE_MS = 2_000;
/** And how long the release witness gets once the lock is gone. */
const RELEASE_DEADLINE_MS = 20_000;

const TIMED_OUT = Symbol('timed out');

/**
 * `work`, or `TIMED_OUT`. The timer is always cleared, so a losing race cannot keep the
 * Vitest worker alive; the losing `work` promise settles on its own (every request in
 * `booking.ts` carries `AbortSignal.timeout(30_000)` and never throws).
 */
async function within<T>(ms: number, work: Promise<T>): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function withService<T>(
  options: { readonly logLevel?: string },
  run: (service: StartedService) => Promise<T>,
): Promise<T | undefined> {
  const attempt = await startService({
    databaseUrl: inject('databaseUrl'),
    ...(options.logLevel === undefined ? {} : { logLevel: options.logLevel }),
  });
  expect(attempt.failure ?? 'started', `the service did not start.\n${attempt.failure}`).toBe(
    'started',
  );
  const service = attempt.service;
  if (service === undefined) return undefined;
  try {
    return await run(service);
  } finally {
    await service.stop();
  }
}

describe('slice 05 — the cancel takes no advisory lock (ADR-0023)', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('ADR-0023 — under a HELD bay lock the cancel completes, a booking for that bay does not, and it completes once the lock is released', async () => {
    const scenario = await seedScenario(client, 'adr23-held-lock', {
      bays: 1,
      technicians: 1,
      customers: 2,
    });
    const where = `\n${describeScenario(scenario)}`;
    const bayId = scenario.bayIds[0] as string;

    // A SECOND SESSION, not the shared `client`: the lock must be held across statements in
    // an open transaction, and the shared connection is used for reads throughout the file.
    const holder = new Client({ connectionString: inject('databaseUrl') });
    await holder.connect();

    try {
      await withService({}, async (service) => {
        const a = await postBooking(service, bookingBody(scenario, { customerIndex: 0 }));
        expect(a.status, `ARRANGE — A was not confirmed.\n${describeAnswer(a)}${where}`).toBe(201);
        const aId = String(member(a, 'id'));

        // ── HOLD. Keyed exactly as ADR-0018's Decision derives it:
        //      pg_advisory_xact_lock(c, k) from unnest(ARRAY[1,2], ARRAY[hashtext($bay), hashtext($tech)])
        //    Class 1, hashtext of the bay id as text. Only the BAY lock is taken, because
        //    only the bay is needed to block a booking: the service takes both, and blocking
        //    on either is blocking.
        await holder.query('begin');
        const held = await holder.query('select pg_advisory_xact_lock($1, hashtext($2::text))', [
          BAY_LOCK_CLASS,
          bayId,
        ]);
        expect(
          held.rowCount,
          `ARRANGE — the holder session did not take the bay advisory lock at all.${where}`,
        ).toBe(1);

        try {
          // ── 1. THE DISCRIMINATOR.
          const started = Date.now();
          const cancelled = await within(CANCEL_DEADLINE_MS, postCancellation(service, aId));
          const elapsed = Date.now() - started;

          expect(
            cancelled === TIMED_OUT ? 'no answer' : 'answered',
            `ADR-0023 IS WRONG IF THIS FAILS, and the gate is not light (design D4 clause 1).\n\n` +
              `The cancel did not answer within ${String(CANCEL_DEADLINE_MS)} ms while a second ` +
              `session held the BAY advisory lock. That is ADR-0023's rejected Option A — the ` +
              `cancel pre-reads, takes ADR-0018's locks and then updates — measured on ` +
              `postgres:16 as blocking indefinitely (57014 statement_timeout at 5006 ms) where ` +
              `the shipped one-statement UPDATE took 3 ms. A cancel that waits on a bay lock ` +
              `makes freeing capacity wait on the contention it is freeing, and F-05-1 says ` +
              `this is the regression to expect: someone adds \`lockResources\` to the cancel ` +
              `for uniformity.${where}`,
          ).toBe('answered');
          const answer = cancelled as HttpAnswer;
          expect(
            answer.status,
            `ADR-0023 — the cancel answered in ${String(elapsed)} ms but not with 200. At the ` +
              `red commit this is a 404: the route does not exist, which is the arrange ` +
              `failure and not a measurement of the lock.\n${describeAnswer(answer)}${where}`,
          ).toBe(200);
          expect(member(answer, 'status'), 'the cancel must have cancelled').toBe('cancelled');

          // ── 2. THE CONTROL. Fire a booking for the SAME bay and do not await it. It must
          //    still be in flight after the probe window, or step 1's 200 proves nothing
          //    about locks: an unlocked bay would let it straight through.
          //    It is fired AFTER the cancellation on purpose — while A was confirmed the
          //    allocator would refuse it outright, never reaching the lock at all.
          let settled: HttpAnswer | undefined;
          const booking = postBooking(service, bookingBody(scenario, { customerIndex: 1 })).then(
            (result) => {
              settled = result;
              return result;
            },
          );

          const probe = await within(BLOCKED_PROBE_MS, booking);
          expect(
            probe === TIMED_OUT ? 'still blocked' : 'completed',
            `CONTROL — a booking for this bay COMPLETED while the bay advisory lock was held ` +
              `by another session. The lock this case takes is therefore not the lock the ` +
              `service's booking path waits on — a different class constant, a different key ` +
              `derivation, or no lock at all — and the cancel's 200 above is vacuous rather ` +
              `than evidence. This is the assertion that makes the discriminator mean ` +
              `something (T-05-2).\n  the booking answered: ${settled === undefined ? '(none)' : describeAnswer(settled)}${where}`,
          ).toBe('still blocked');

          // ── 3. THE RELEASE WITNESS. Without it, "blocked" is inferred from a timeout, and a
          //    booking broken for an unrelated reason reads exactly the same.
          await holder.query('rollback');

          const released = await within(RELEASE_DEADLINE_MS, booking);
          expect(
            released === TIMED_OUT ? 'never completed' : 'completed',
            `RELEASE WITNESS — the booking did not complete within ` +
              `${String(RELEASE_DEADLINE_MS)} ms of the lock being released, so the previous ` +
              `assertion measured a broken booking rather than a blocked one.${where}`,
          ).toBe('completed');
          const witness = released as HttpAnswer;
          expect(
            witness.status,
            `RELEASE WITNESS — and it must be CONFIRMED: A was cancelled in step 1, so the ` +
              `bay and technician are free. A 409 here says the allocator does not re-derive ` +
              `over a cancelled row, which is AC-1's mutant seen from this file.` +
              `\n${describeAnswer(witness)}${where}`,
          ).toBe(201);
          expect(member(witness, 'bayId'), 'the freed bay').toBe(bayId);
        } finally {
          // Idempotent: step 3 has usually already rolled back. A failure before step 3 must
          // not leave the lock held for the rest of the run.
          try {
            await holder.query('rollback');
          } catch {
            // Not in a transaction. Nothing to release.
          }
        }
      });
    } finally {
      await holder.end();
    }
  });

  it('M3 as a liveness reading — 20 cancels of one appointment racing 20 bookings for its slot: a verdict each, no deadlock, and the table stays single-valued', async () => {
    const racers = 20;
    const scenario = await seedScenario(client, 'adr23-m3', {
      bays: 1,
      technicians: 1,
      customers: racers + 1,
    });
    const where = `\n${describeScenario(scenario)}`;

    // `trace`, not the harness default of `silent`: the deadlock claim is read off the
    // process's output, and a silent process would make it vacuous.
    await withService({ logLevel: 'trace' }, async (service) => {
      const a = await postBooking(service, bookingBody(scenario, { customerIndex: 0 }));
      expect(a.status, `ARRANGE — A was not confirmed.\n${describeAnswer(a)}${where}`).toBe(201);
      const aId = String(member(a, 'id'));

      // 40 requests from one barrier: 20 cancels of A, 20 bookings for A's slot.
      const answers = await releaseFromBarrier<HttpAnswer>(racers * 2, async (index) =>
        index < racers
          ? postCancellation(service, aId)
          : postBooking(service, bookingBody(scenario, { customerIndex: index - racers + 1 })),
      );
      const cancels = answers.slice(0, racers);
      const bookings = answers.slice(racers);

      const dropped = answers.filter((x) => x.transportFailure !== undefined);
      expect(
        dropped.map((x) => x.transportFailure),
        `some racers never got an answer at all.${where}`,
      ).toEqual([]);

      // ── THE CANCELS. Every one a 200, and every one describing a cancelled A: cancellation
      //    is monotone and terminal, so twenty interleavings all end in the same state
      //    (ADR-0023 Option C's third bullet). This is D1's idempotency under a real race
      //    rather than under a replay.
      expect(
        [...new Set(cancels.map((x) => `${String(x.status)} ${String(member(x, 'status'))}`))],
        `every one of the ${String(racers)} concurrent cancels must answer 200 with ` +
          `status=cancelled. At the red commit every one is a 404: the route does not exist.\n` +
          cancels.map((x, i) => `  [${String(i)}] ${describeAnswer(x)}`).join('\n') + where,
      ).toEqual(['200 cancelled']);

      // ── THE BOOKINGS. A verdict each, and never a 500 — which is what a 40P01 escaping as
      //    `no-verdict` would look like at the edge (ADR-0018).
      const confirmed = bookings.filter((x) => x.status === 201);
      const refused = bookings.filter((x) => x.status === 409);
      expect(
        `${String(confirmed.length)} confirmed / ${String(refused.length)} refused`,
        `every booking must be answered 201 or 409. At most ONE can be confirmed — the ` +
          `exclusion constraint makes two overlapping confirmed rows unrepresentable — and ` +
          `zero is legitimate here, since a racer that consults the allocator before any ` +
          `cancel commits is refused without ever attempting an insert.\n` +
          bookings.map((x, i) => `  [${String(i)}] ${describeAnswer(x)}`).join('\n') + where,
      ).toBe(`${String(confirmed.length)} confirmed / ${String(racers - confirmed.length)} refused`);
      expect(
        confirmed.length,
        `at most one booking may be confirmed for one bay over one interval.${where}`,
      ).toBeLessThanOrEqual(1);
      // The positive witness for the absence assertions below: a race with 19 or 20 real
      // refusals in it is a race that happened.
      expect(
        refused.length,
        `at least ${String(racers - 1)} of the ${String(racers)} bookings must be refused, ` +
          `which is what makes "no deadlock appeared" a claim about a contended run rather ` +
          `than about an empty one.${where}`,
      ).toBeGreaterThanOrEqual(racers - 1);

      // ── THE TABLE. One row for A, cancelled, with everything else about it intact.
      const stored = await findStoredAppointment(client, aId);
      expect(stored?.status, `A must be cancelled exactly once, not deleted.${where}`).toBe(
        'cancelled',
      );
      expect(stored?.bayId, 'twenty concurrent cancels may not disturb the row they cancel').toBe(
        scenario.bayIds[0],
      );
      const live = await confirmedOverlapping(
        client,
        scenario.dealershipId,
        at(0),
        at(scenario.durationMinutes),
      );
      expect(
        live.map((r) => r.id).sort(),
        `the non-cancelled rows overlapping the interval must be exactly the bookings that ` +
          `were answered 201 — otherwise "one row" and "one 201" are two facts about two ` +
          `different things.${where}`,
      ).toEqual(confirmed.map((x) => String(member(x, 'id'))).sort());

      // ── AND THE ABSENCE, last, now that the run above is witnessed as contended.
      const { stdout, stderr } = service.output();
      const raw = `${stdout}\n${stderr}`;
      expect(
        raw.includes('40P01'),
        `SQLSTATE 40P01 (deadlock_detected) appeared. ADR-0023's M3 measured twenty cancels ` +
          `racing twenty inserts on one bay with the cancel taking NO lock and read zero of ` +
          `them: the wait is one-directional — inserter onto canceller — and a ` +
          `one-directional wait cannot cycle. A 40P01 here says that argument is wrong.` +
          `${where}\n${raw}`,
      ).toBe(false);
    });
  });
});
