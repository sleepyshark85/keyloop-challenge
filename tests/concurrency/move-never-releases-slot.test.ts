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
  isoAt,
  member,
  occupy,
  postBooking,
  postReschedule,
  releaseFromBarrier,
  seedScenario,
} from '../support/booking.js';
import type { HttpAnswer, Scenario } from '../support/booking.js';

/**
 * Slice 07 — AC-2 and AC-3: a move that is destined to be refused never transiently frees
 * the slot it holds, not for an instant, under any interleaving.
 *
 * `docs/slices/07-reschedule-under-contention.md` AC-2, AC-3 · `docs/slices/07-design.md`
 * §2.1, §2.3 · ADR-0003, ADR-0018, ADR-0026, ADR-0027 · arc42 §6.1, §6.3, §10 (QS-5) ·
 * CLAUDE.md §2.1, §2.2, §5.
 *
 * WHOSE FILE THIS IS. `CLAUDE.md` §5 gives `tests/concurrency/` to the test-engineer. This
 * file imports no `src/` module: a bare `pg.Client` for the database, HTTP for the service.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THE OBSERVER IS A RACE, NOT A POLL (07-design.md §2.2).
 *
 * A release that ever COMMITS is observed by somebody taking the slot; a release that never
 * commits is not a window at all, and nothing outside the transaction can see an uncommitted
 * one under READ COMMITTED. So the only honest witness to "never transiently released" is
 * putting real racers at the slot's door and counting how many get in — exactly zero, at
 * every moment, is the only value consistent with the slot never having opened.
 *
 * The fixture: A holds the dealership's only bay and technician at `[t0, t0+60)`. A's own
 * reschedule target is ALSO fully booked (a blocker occupies the only pair there, at an
 * interval disjoint from A's own), so — with bays:1/technicians:1 — the move has no
 * candidate to escape to (ADR-0027) and is unconditionally refused. `N` fresh bookings race
 * for A's ORIGINAL interval, released from the SAME barrier as A's own reschedule attempt, so
 * every one of them is asking the one question this file is about: is the bay free right now?
 *
 * If the move were built as a cancel-then-insert (the implementation QS-5 exists to catch),
 * A's slot would be visible as free for however long the cancel's commit outlives the
 * insert's, and SOME fraction of the N racers would land in that window and be confirmed. A
 * single atomic `UPDATE`, refused outright, gives the racers nothing to land in: A's row is
 * never deleted, never re-inserted, and the guarded `UPDATE`'s own attempt either matches
 * zero rows or aborts on `23P01` — neither is a write that ever commits a released state.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * AC-3 — "A RECORDED SEED", AND WHY THIS FILE SETS `BOOKING_SEED` WHERE THE QS-3 FILES DO NOT.
 *
 * `no-spurious-refusal.test.ts` and `no-bay-overlap.test.ts` deliberately leave `BOOKING_SEED`
 * unset, because their claim is about ADR-0009's shuffle SPREADING contention across
 * candidates — fixing the seed would hand every racer the same permutation and erase the
 * degeneracy the shuffle exists to remove. This file's fixture has exactly ONE candidate per
 * request (bays:1/technicians:1 for A; the fresh bookings have nowhere else to go either),
 * so there is no shuffle for a seed to degenerate. AC-3 asks for something different —
 * reproducibility of a FAILURE across runs, "and a failure names the seed" — so `BOOKING_SEED`
 * is set here to a literal, printed constant and the scenario is run several times over it.
 */

const RECORDED_SEED = 20260907;
const RACER_COUNT = 15;
const REPEAT_RUNS = 3;

async function withService<T>(
  run: (service: StartedService) => Promise<T>,
): Promise<T | undefined> {
  const attempt = await startService({
    databaseUrl: inject('databaseUrl'),
    bookingSeed: RECORDED_SEED,
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

interface RunResult {
  readonly moveAnswer: HttpAnswer;
  readonly bookingAnswers: readonly HttpAnswer[];
  readonly scenario: Scenario;
  readonly aId: string;
}

async function runOnce(
  client: Client,
  service: StartedService,
  namespace: string,
): Promise<RunResult> {
  const scenario = await seedScenario(client, namespace, {
    bays: 1,
    technicians: 1,
    customers: RACER_COUNT + 1,
  });

  const booked = await postBooking(service, bookingBody(scenario, { customerIndex: 0 }));
  expect(
    booked.status,
    `ARRANGE — A was not booked.\n${describeAnswer(booked)}\n${describeScenario(scenario)}`,
  ).toBe(201);
  const aId = String(member(booked, 'id'));

  const bayId = scenario.bayIds[0] as string;
  const technicianId = scenario.technicianIds[0] as string;

  // A's target is ALSO fully booked, on the dealership's only pair, at an interval disjoint
  // from A's own current one — so seeding this can never itself conflict with A's row.
  await occupy(client, scenario, {
    label: 'target-blocker',
    bayId,
    technicianId,
    startsAt: at(120),
    endsAt: at(180),
  });

  const answers = await releaseFromBarrier(RACER_COUNT + 1, async (index) => {
    if (index === 0) return { kind: 'move' as const, answer: await postReschedule(service, aId, isoAt(120)) };
    return {
      kind: 'booking' as const,
      answer: await postBooking(service, bookingBody(scenario, { customerIndex: index })),
    };
  });

  const moveAnswer = (answers.find((a) => a.kind === 'move') as { answer: HttpAnswer }).answer;
  const bookingAnswers = answers
    .filter((a): a is { kind: 'booking'; answer: HttpAnswer } => a.kind === 'booking')
    .map((a) => a.answer);

  return { moveAnswer, bookingAnswers, scenario, aId };
}

describe('slice 07 — AC-2 / AC-3: a move destined to be refused never transiently releases its slot', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  for (let run = 0; run < REPEAT_RUNS; run += 1) {
    it(`AC-2 / AC-3 (run ${String(run)}, seed ${String(RECORDED_SEED)}) — A's slot is occupied at every moment: zero of ${String(RACER_COUNT)} racing bookings are ever confirmed`, async () => {
      await withService(async (service) => {
        const { moveAnswer, bookingAnswers, scenario, aId } = await runOnce(
          client,
          service,
          `ac2-move-never-releases-r${String(run)}`,
        );
        const where =
          `\n  seed=${String(RECORDED_SEED)} run=${String(run)}\n${describeScenario(scenario)}`;

        // ── ARRANGE-LEVEL: the move itself must be refused (the target is fully booked and
        // bays:1/technicians:1 leaves no candidate to escape to), and A must not vanish.
        expect(
          moveAnswer.status,
          `AC-2 — A's own reschedule must be refused: its target is fully booked and it has ` +
            `no other candidate. If this is not 409, the fixture is not testing what it ` +
            `claims to.\n${describeAnswer(moveAnswer)}${where}`,
        ).toBe(409);

        // ── THE CLAIM. Not one of the racing bookings may be confirmed: A's slot was never
        // observably free, at any point during the race, to any of them.
        const dropped = bookingAnswers.filter((a) => a.transportFailure !== undefined);
        expect(
          dropped.map((a) => a.transportFailure),
          `some racing bookings never got an answer at all.${where}`,
        ).toEqual([]);

        const confirmed = bookingAnswers.filter((a) => a.status === 201);
        const refused = bookingAnswers.filter((a) => a.status === 409);
        expect(
          `${String(confirmed.length)} confirmed / ${String(refused.length)} refused`,
          `AC-2 — QS-5: a move whose eventual answer is a refusal must never have transiently ` +
            `released the slot it holds. ${String(confirmed.length)} of ${String(RACER_COUNT)} ` +
            `racing bookings were CONFIRMED, which is only possible if A's row was — even ` +
            `momentarily — absent from a committed, non-cancelled state on this bay and ` +
            `technician. That is exactly what a cancel-then-insert move looks like from ` +
            `outside the transaction.\n` +
            bookingAnswers.map((a, i) => `  [${String(i)}] ${describeAnswer(a)}`).join('\n') +
            where,
        ).toBe(`0 confirmed / ${String(RACER_COUNT)} refused`);
        expect(
          bookingAnswers
            .map((a) => a.contentType)
            .filter((c) => !/application\/problem\+json/.test(c ?? '')),
          `every refused racer must be RFC 9457 problem+json.${where}`,
        ).toEqual([]);

        // ── OVER THE TABLE, not just the responses: exactly one confirmed row overlapping
        // A's interval, and it is A, unmoved.
        const live = await confirmedOverlapping(
          client,
          scenario.dealershipId,
          at(0),
          at(scenario.durationMinutes),
        );
        expect(
          live.map((r) => `${r.id} ${r.bayId} ${r.technicianId} ${r.status}`),
          `AC-2 — exactly one non-cancelled appointment may overlap this interval, and it ` +
            `must be A: id=${aId} bay=${scenario.bayIds[0]} tech=${scenario.technicianIds[0]}.` +
            `${where}`,
        ).toEqual([`${aId} ${String(scenario.bayIds[0])} ${String(scenario.technicianIds[0])} confirmed`]);
      });
    });
  }
});
