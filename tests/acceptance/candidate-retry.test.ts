import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  at,
  blockPairs,
  bookingBody,
  conflictRecords,
  confirmedOverlapping,
  describeAnswer,
  describeLoopLines,
  describeScenario,
  member,
  postBooking,
  refusalRecords,
  seedScenario,
} from '../support/booking.js';
import type { ConflictRecord, HttpAnswer, RefusalRecord } from '../support/booking.js';

/**
 * Slice 04 — AC-3 (pruning by the constraint that fired), AC-4 (the attempt cap of 16) and
 * AC-5 (the seeded shuffle), over HTTP against the compiled artifact.
 *
 * `docs/slices/04-candidate-allocation-and-retry.md` · `docs/slices/04-design.md` §2-§5 ·
 * arc42 §6.2, §8.2, §8.6 · ADR-0004, ADR-0009, ADR-0016, ADR-0020, ADR-0021.
 *
 *   AC-3  an attempt refused with `no_bay_overlap` prunes THAT WHOLE BAY, and the mirror for
 *         `no_technician_overlap`; the loop's bound is additive, never multiplicative
 *   AC-4  the cap of 16 is reached with candidates remaining -> `409 /problems/no-capacity`,
 *         and the cap is visible in telemetry rather than silent
 *   AC-5  a fixed seed makes the run re-runnable, end to end through the running service
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY EVERY FIXTURE HERE IS A TERMINAL-STATE ARGUMENT AND NOT A FIRST-DRAW ONE.
 *
 * ADR-0021 records the structural fact these fixtures are built on: `appointment` carries an
 * exclusion constraint on BOTH `bay_id` and `technician_id`, so blocking K technicians costs
 * K bays at the same dealership, and whenever a free bay and a free technician both exist the
 * pair of them is a reachable first draw. **No static fixture can force a technician-side
 * FIRST conflict.**
 *
 * That is true and it is not the only way to be deterministic. Every fixture below is chosen
 * so the SET of reachable paths, not the path, has one outcome:
 *
 *   AC-3a  every bay blocked  -> whatever the permutation, every draw is a bay conflict, the
 *          bay list is what empties, and the count is EXACTLY 2 rather than 2 x 3
 *   AC-3b  every technician blocked, one bay free -> the free bay can never conflict, so the
 *          TECHNICIAN list is the one that must empty under every permutation. Only the
 *          number of bay conflicts before it varies, and it is bounded at 2
 *   AC-4   every bay blocked, so the loop is a straight run down the bay list and its length
 *          decides the exit
 *
 * So `BOOKING_SEED` is NOT needed for AC-3 or AC-4 after all, and it is used below only where
 * it is the actual subject: AC-5's re-runnability, and OQ-04-1's degeneracy check. That is a
 * narrower use than ADR-0021 anticipated and it is reported rather than quietly enjoyed.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT AN OUTSIDE-IN TEST CANNOT SEE HERE (D-04-2).
 *
 * ADR-0020 places the cap check INSIDE the `23P01` arm so that no refusal exit is reachable
 * without a `ContendedResource` the classification just minted. AC-4 requires both exits to
 * render identically at the edge, so this file cannot distinguish "capped from inside the
 * arm" from "capped from outside it with a cast" — that is a `tsc` and `depcruise` property,
 * asserted by `contended-resource-cast` in `tests/architecture/ambiguity-containment.test.ts`
 * and not here. What this file can and does pin is that the two exits are distinguishable at
 * all, which is the half that lives on stdout.
 */

/** ADR-0009's shipped default, asserted at its shipped value (T-04-2). Never overridden. */
const ATTEMPT_CAP = 16;

interface Observed {
  readonly answer: HttpAnswer;
  readonly conflicts: readonly ConflictRecord[];
  readonly refusals: readonly RefusalRecord[];
  readonly loop: string;
}

describe('slice 04 — pruning, the attempt cap, and the seeded shuffle', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  /**
   * Start a service, run `body`, drain the log, stop. Never throws on a start failure — the
   * `failure` string is handed to the caller, which asserts on it inside its own test body.
   */
  async function withService<T>(
    options: { readonly bookingSeed?: number; readonly logLevel?: string | null },
    body: (service: StartedService) => Promise<T>,
  ): Promise<{ readonly failure?: string; readonly value?: T }> {
    const attempt = await startService({
      databaseUrl: inject('databaseUrl'),
      // The two loop lines ARE the observation for AC-3 and AC-4; `silent` would make both
      // criteria unassertable from outside (I-02-6). `null` — R-7a's case only — sets no
      // LOG_LEVEL at all, so the child runs at the level a deployment that sets nothing does.
      logLevel: options.logLevel === undefined ? 'trace' : options.logLevel,
      ...(options.bookingSeed === undefined ? {} : { bookingSeed: options.bookingSeed }),
    });
    if (attempt.service === undefined) {
      return { failure: attempt.failure ?? 'the service did not start' };
    }
    const service = attempt.service;
    try {
      return { value: await body(service) };
    } finally {
      await service.stop();
    }
  }

  /** One refused booking, with the loop lines it wrote, waited for rather than assumed. */
  async function refuseOnce(
    service: StartedService,
    scenario: Parameters<typeof bookingBody>[0],
    expectedConflicts: number,
  ): Promise<Observed> {
    const answer = await postBooking(service, bookingBody(scenario));
    const records = await service.awaitLogRecords(
      (rs) =>
        refusalRecords(rs).length >= 1 && conflictRecords(rs).length >= expectedConflicts,
    );
    return {
      answer,
      conflicts: conflictRecords(records),
      refusals: refusalRecords(records),
      loop: describeLoopLines(records),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────── AC-3 ──

  it('AC-3 — a no_bay_overlap refusal prunes the WHOLE bay: two bays, three technicians, exactly two attempts', async () => {
    // Two bays, both blocked — which costs two of the three technicians, leaving one free.
    // Under EVERY permutation each draw lands on a blocked bay, so each attempt violates
    // `no_bay_overlap` (arc42 §8.2 creates it before `no_technician_overlap`, so it is the
    // one PostgreSQL names when both are violated — design §8, measurements 1-2).
    //
    // THE DISCRIMINATOR IS THE COUNT, NOT THE OUTCOME. Two attempts is the additive bound;
    // per-PAIR pruning would take up to 2 x 3 = 6 and meet the loop's own additive header of
    // 5 first, which arc42 §6.2 says THROWS (a 500). Pruning the technician instead of the
    // bay would take three attempts and refuse naming `technician` while a technician is
    // demonstrably free. Both are green on "a 409 came back".
    const scenario = await seedScenario(client, 'ac3-bay-prune', { bays: 2, technicians: 3 });
    await blockPairs(client, scenario, 2, at(0), at(60));
    const fixture = describeScenario(scenario);

    const { failure, value } = await withService({}, async (service) =>
      refuseOnce(service, scenario, 2),
    );
    expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
    const seen = value as Observed;
    const where = `\n${fixture}\n${seen.loop}`;

    expect(
      seen.answer.status,
      `AC-3 — both bays are taken, so the booking must be refused.\n${describeAnswer(seen.answer)}${where}`,
    ).toBe(409);
    expect(seen.answer.contentType, 'RFC 9457').toMatch(/application\/problem\+json/);
    expect(member(seen.answer, 'type')).toBe('/problems/no-capacity');
    expect(
      member(seen.answer, 'resource'),
      `AC-3 — the BAY list is what emptied. 'technician' here would be the mis-naming E-02-1 ` +
        `was ruled on: one technician is demonstrably free.${where}`,
    ).toBe('bay');

    expect(
      seen.conflicts.map((c) => `${String(c.attempt)}:${c.constraint}`),
      `AC-3 — EXACTLY two attempts, one per bay, each refused by no_bay_overlap. More means ` +
        `the bay was not pruned as a whole and the bound has gone multiplicative; fewer means ` +
        `a bay was never tried.${where}`,
    ).toEqual(['1:no_bay_overlap', '2:no_bay_overlap']);
    expect(
      seen.conflicts.map((c) => c.resource),
      `AC-3 — the resource minted from that constraint name (ADR-0016).${where}`,
    ).toEqual(['bay', 'bay']);

    expect(
      seen.refusals.map((r) => `${r.exit}/${r.resource}/${String(r.attempts)}`),
      `AC-3 — one booking.refused line: the bay list emptied after two attempts, which is ` +
        `'exhausted' and not 'capped' — the cap is ${String(ATTEMPT_CAP)} and was never near.${where}`,
    ).toEqual(['exhausted/bay/2']);

    expect(
      (await confirmedOverlapping(client, scenario.dealershipId, at(0), at(60))).length,
      `AC-3 — a refused booking writes nothing: only the two blocking rows may remain.${where}`,
    ).toBe(2);
  });

  it('AC-3 — a no_technician_overlap refusal prunes the WHOLE technician: three bays, two technicians, exactly two technician conflicts', async () => {
    // The mirror, and the one ADR-0021 says no fixture can force on the FIRST draw. It does
    // not need to be first. Both technicians are blocked — which costs two of the three bays
    // — and the third bay is free, so:
    //
    //   - a draw on a blocked bay conflicts on the bay and prunes it (at most twice);
    //   - a draw on the free bay MUST conflict on the technician, because every technician is
    //     blocked; and the free bay can never be pruned.
    //
    // So under every permutation the TECHNICIAN list is the one that empties, and it takes
    // EXACTLY two technician conflicts to empty it. Three or more means the technician was
    // not pruned as a whole; zero or one means the list emptied without being asked.
    const scenario = await seedScenario(client, 'ac3-tech-prune', { bays: 3, technicians: 2 });
    await blockPairs(client, scenario, 2, at(0), at(60));
    const fixture = describeScenario(scenario);

    const { failure, value } = await withService({}, async (service) =>
      refuseOnce(service, scenario, 2),
    );
    expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
    const seen = value as Observed;
    const where = `\n${fixture}\n${seen.loop}`;

    expect(
      seen.answer.status,
      `AC-3 — both technicians are taken, so the booking must be refused.\n${describeAnswer(seen.answer)}${where}`,
    ).toBe(409);
    expect(member(seen.answer, 'type')).toBe('/problems/no-capacity');
    expect(
      member(seen.answer, 'resource'),
      `AC-3 — the TECHNICIAN list is what emptied; a free bay remains untouched.${where}`,
    ).toBe('technician');

    const technicianConflicts = seen.conflicts.filter(
      (c) => c.constraint === 'no_technician_overlap',
    );
    const bayConflicts = seen.conflicts.filter((c) => c.constraint === 'no_bay_overlap');
    expect(
      technicianConflicts.map((c) => c.resource),
      `AC-3 — EXACTLY two no_technician_overlap refusals, one per technician. A loop that ` +
        `pruned only the pair would meet the same technician again behind the free bay and ` +
        `run to the additive header of 5, which arc42 §6.2 makes a THROW.${where}`,
    ).toEqual(['technician', 'technician']);
    expect(
      bayConflicts.length,
      `AC-3 — at most two bay conflicts are reachable, one per blocked bay; the free bay ` +
        `cannot conflict.${where}`,
    ).toBeLessThanOrEqual(2);
    expect(
      seen.conflicts.map((c) => Number(c.attempt)),
      `AC-3 — the attempt numbers must be 1..n with no gap and no repeat.${where}`,
    ).toEqual(seen.conflicts.map((_c, i) => i + 1));

    expect(
      seen.refusals.map((r) => `${r.exit}/${r.resource}/${String(r.attempts)}`),
      `AC-3 — one booking.refused line, 'exhausted' on the technician list, reporting the ` +
        `same attempt count the conflict lines show (2 + the bay conflicts, so 2 to 4).${where}`,
    ).toEqual([`exhausted/technician/${String(seen.conflicts.length)}`]);
    expect(
      seen.conflicts.length,
      `AC-3 — between 2 and 4 attempts: two technician conflicts plus at most two bay ones. ` +
        `This is ADR-0009's ADDITIVE bound (|bays| + |technicians| - 1 = 4); a multiplicative ` +
        `loop would reach 6.${where}`,
    ).toBeLessThanOrEqual(4);
  });

  // ─────────────────────────────────────────────────────────────────────────── AC-4 ──
  //
  // ONE FIXTURE PAIR PINS THREE THINGS, and no cheaper fixture pins any of them (T-04-2):
  // the cap is exactly 16, the two exits are distinguishable, and ADR-0020's tie resolves to
  // `exhausted`. `ATTEMPT_CAP=3` would pin none of them — it would assert the knob, not the
  // shipped behaviour — so both cases run at the DEFAULT and the environment is not touched.

  it('AC-4 — 16 blocked bays: 16 attempts, the list empties exactly as the cap is reached, and the tie resolves to exhausted', async () => {
    const scenario = await seedScenario(client, 'ac4-tie-16', { bays: 16, technicians: 16 });
    await blockPairs(client, scenario, 16, at(0), at(60));
    const fixture = describeScenario(scenario);

    const { failure, value } = await withService({}, async (service) =>
      refuseOnce(service, scenario, ATTEMPT_CAP),
    );
    expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
    const seen = value as Observed;
    const where = `\n${fixture}\n${seen.loop}`;

    expect(seen.answer.status, `${describeAnswer(seen.answer)}${where}`).toBe(409);
    expect(member(seen.answer, 'type')).toBe('/problems/no-capacity');
    expect(member(seen.answer, 'resource')).toBe('bay');

    expect(
      seen.conflicts.length,
      `AC-4 — sixteen bays, every one blocked, one attempt each.${where}`,
    ).toBe(ATTEMPT_CAP);
    expect(
      [...new Set(seen.conflicts.map((c) => c.constraint))],
      `AC-4 — every draw lands on a blocked bay.${where}`,
    ).toEqual(['no_bay_overlap']);
    expect(
      seen.refusals.map((r) => `${r.exit}/${r.resource}/${String(r.attempts)}`),
      `AC-4 — at attempt ${String(ATTEMPT_CAP)} BOTH conditions hold: the bay list has just ` +
        `emptied AND the cap has been reached. ADR-0020 gives the tie to 'exhausted', because ` +
        `nothing was left untried. 'capped' here means the tie is resolved the other way; a ` +
        `count other than ${String(ATTEMPT_CAP)} means the cap is not 16.${where}`,
    ).toEqual([`exhausted/bay/${String(ATTEMPT_CAP)}`]);
  });

  it('AC-4 — 17 blocked bays: the cap stops the loop at 16 with a candidate still untried, and says so as capped', async () => {
    const scenario = await seedScenario(client, 'ac4-capped-17', { bays: 17, technicians: 17 });
    await blockPairs(client, scenario, 17, at(0), at(60));
    const fixture = describeScenario(scenario);

    const { failure, value } = await withService({}, async (service) =>
      refuseOnce(service, scenario, ATTEMPT_CAP),
    );
    expect(failure ?? 'started', `the service did not start.\n${failure ?? ''}`).toBe('started');
    const seen = value as Observed;
    const where = `\n${fixture}\n${seen.loop}`;

    expect(seen.answer.status, `${describeAnswer(seen.answer)}${where}`).toBe(409);
    expect(
      member(seen.answer, 'type'),
      `AC-4 — a capped refusal is the SAME problem type as an exhausted one; arc42 §8.6 gains ` +
        `no row for it (design §2). The difference lives on stdout and nowhere else.${where}`,
    ).toBe('/problems/no-capacity');
    expect(member(seen.answer, 'resource')).toBe('bay');

    expect(
      seen.conflicts.length,
      `AC-4 — the loop must stop at ${String(ATTEMPT_CAP)} attempts with a seventeenth bay ` +
        `still untried. Seventeen means there is no cap, or it is off by one; the additive ` +
        `header of 34 would let the loop run to exhaustion without it.${where}`,
    ).toBe(ATTEMPT_CAP);
    expect(
      seen.refusals.map((r) => `${r.exit}/${r.resource}/${String(r.attempts)}`),
      `AC-4 — 'capped', not 'exhausted': one bay was never tried. This is the leg that makes ` +
        `the cap "visible in telemetry rather than silent", and it is also D-04-1's standing ` +
        `partial evidence — the cap of 16 sits BELOW the additive bound of 34 here. CORRECTED ` +
        `at slice 19 (docs/slices/19-attempt-cap-sized-against-occupancy.md AC-5): this ` +
        `refusal is HONEST, not spurious — this fixture blocks all 17 bays AND all 17 ` +
        `technicians, so no capacity exists anywhere in the dealership for any candidate the ` +
        `loop could still have reached, and 'exhausted' would have said the same thing had the ` +
        `cap not intervened first. What is true here is narrower than "a non-zero cap-exceeded ` +
        `counter means the cap is wrong": only the EXIT LABEL is decided by which bound (16 or ` +
        `34) is hit first, never whether capacity remained.${where}`,
    ).toEqual([`capped/bay/${String(ATTEMPT_CAP)}`]);
  });

  // ─────────────────────────────────────────────────────────────────────────── AC-5 ──

  it('AC-5 — a fixed BOOKING_SEED makes the allocation reproducible, and different seeds allocate differently', async () => {
    // Sixteen bays and sixteen technicians, all free, and a 30-minute service type so that
    // fifteen DISJOINT intervals fit inside one 08:00-18:00 day. Every request therefore
    // draws from the identical candidate list — the candidate read is reference data only
    // until slice 08 (arc42 §6.2 step 5) — and every request succeeds on its first attempt.
    //
    // WHY THIS COMPARES IDS RATHER THAN POSITIONS. Comparing "the same index was chosen"
    // across two dealerships would assume the repository reads candidates in the order this
    // fixture names them. Three bookings inside ONE dealership at disjoint intervals assume
    // nothing: the same seed must yield the same BAY ID and the same TECHNICIAN ID, whatever
    // order the rows came back in.
    //
    // THE SECOND ASSERTION IS THE ANTI-VACUITY GUARD, and it is the one that matters. "The
    // same seed chose the same pair" is trivially true of an implementation that ignores the
    // seed entirely and always sorts — which is ADR-0009's Order-A, the option this slice
    // exists to replace. So five seeds must not all land on the same pair. With 16 x 16 = 256
    // pairs the chance a correct shuffle does that is (1/256)^4, about 2 in 10^10.
    const SEEDS = [1, 40_503, 1_013_904_223, 1_597_334_677, 2_654_435_769] as const;
    const PER_SEED = 3;
    const scenario = await seedScenario(client, 'ac5-seeded-order', {
      bays: 16,
      technicians: 16,
      durationMinutes: 30,
    });
    const fixture = describeScenario(scenario);

    const allocations: string[][] = [];
    for (const [run, seed] of SEEDS.entries()) {
      const { failure, value } = await withService({ bookingSeed: seed }, async (service) => {
        const answers: HttpAnswer[] = [];
        for (let i = 0; i < PER_SEED; i += 1) {
          // -120 minutes from the anchor is 08:00 local; the fifteen slots run to 15:30.
          const startsAtMinutes = -120 + 30 * (run * PER_SEED + i);
          answers.push(await postBooking(service, bookingBody(scenario, { startsAtMinutes })));
        }
        return answers;
      });
      expect(
        failure ?? 'started',
        `AC-5 — the service did not start with BOOKING_SEED=${String(seed)}.\n${failure ?? ''}`,
      ).toBe('started');
      const answers = value as readonly HttpAnswer[];

      expect(
        answers.map((a) => a.status),
        `AC-5 — sixteen bays and sixteen technicians are free at every one of these disjoint ` +
          `intervals, so every request must be confirmed.\n` +
          answers.map((a, i) => `  [${String(i)}] ${describeAnswer(a)}`).join('\n') +
          `\n${fixture}`,
      ).toEqual(Array.from({ length: PER_SEED }, () => 201));

      const chosen = answers.map(
        (a) => `${String(member(a, 'bayId'))} / ${String(member(a, 'technicianId'))}`,
      );
      expect(
        [...new Set(chosen)],
        `AC-5 — with BOOKING_SEED=${String(seed)} fixed, all ${String(PER_SEED)} bookings must ` +
          `allocate the SAME (bay, technician) pair: the candidate list is identical at each ` +
          `interval and the seed is the only thing choosing between its 256 pairs. Two ` +
          `different pairs here means the seed is drawn per request in spite of the ` +
          `configuration, which is ADR-0021's knob not being honoured — and a failing run ` +
          `reported by a customer would not be re-runnable.\n${chosen.join('\n')}\n${fixture}`,
      ).toHaveLength(1);
      allocations.push(chosen);
    }

    const perSeed = allocations.map((a) => a[0] ?? '(none)');
    expect(
      new Set(perSeed).size,
      `AC-5 — five different seeds must not all choose the same pair. If they do, the seed is ` +
        `being ignored and the ordering is ADR-0009's rejected Order-A — which would pass the ` +
        `assertion above trivially, since a constant order is also a reproducible one.\n` +
        perSeed.map((p, i) => `  seed ${String(SEEDS[i])} -> ${p}`).join('\n') +
        `\n${fixture}`,
    ).toBeGreaterThanOrEqual(2);
  });

  it('OQ-04-1 — with BOOKING_SEED unset two refusals log two different seeds; with it set they log that one', async () => {
    // One bay, one technician, both blocked, so every request is refused after exactly one
    // attempt and NOTHING IS WRITTEN — which is why the same fixture serves both halves.
    //
    // FIRST HALF, the open question. ADR-0009 lists "the seed must actually vary — a
    // misconfigured deployment that seeds every request identically degrades to Order-A
    // silently" among its bad consequences, and nothing in the suite could see it. Two
    // refusals in ONE process logging two different seeds tests the SOURCE in the running
    // process at P(false failure) = 2^-32.
    //
    // WHAT IT DOES NOT CLOSE, stated so nobody reads more into it: it shows the source is not
    // a constant, not that it is uniform, and not that the ordering uses it. The second is
    // out of reach of two samples; the third is what AC-5 above and the property test in
    // `tests/property/candidate-ordering.test.ts` are for.
    const scenario = await seedScenario(client, 'oq041-seed-varies', { bays: 1, technicians: 1 });
    await blockPairs(client, scenario, 1, at(0), at(60));
    const fixture = describeScenario(scenario);

    const twice = async (
      bookingSeed: number | undefined,
    ): Promise<{ readonly failure?: string; readonly value?: Observed }> =>
      await withService(
        bookingSeed === undefined ? {} : { bookingSeed },
        async (service): Promise<Observed> => {
          await postBooking(service, bookingBody(scenario));
          const answer = await postBooking(service, bookingBody(scenario));
          const records = await service.awaitLogRecords((rs) => refusalRecords(rs).length >= 2);
          return {
            answer,
            conflicts: conflictRecords(records),
            refusals: refusalRecords(records),
            loop: describeLoopLines(records),
          };
        },
      );

    const unset = await twice(undefined);
    expect(failureOf(unset), `the service did not start.\n${failureOf(unset)}`).toBe('started');
    const varying = unset.value as Observed;
    expect(
      varying.refusals.map((r) => `${r.exit}/${r.resource}`),
      `OQ-04-1 — both requests must be refused, each after one attempt.\n${fixture}\n${varying.loop}`,
    ).toEqual(['exhausted/bay', 'exhausted/bay']);
    expect(
      varying.refusals.map((r) => r.seed).filter((s) => typeof s !== 'number'),
      `OQ-04-1 — booking.refused must carry a NUMERIC seed; a label that is not a number ` +
        `cannot be fed back in as BOOKING_SEED, which is the whole of ADR-0021.\n${varying.loop}`,
    ).toEqual([]);
    expect(
      new Set(varying.refusals.map((r) => Number(r.seed))).size,
      `OQ-04-1 — with BOOKING_SEED unset, two requests in the SAME process must draw two ` +
        `different seeds. One value twice is ADR-0009's named risk (R-7a) realised: every ` +
        `request gets the same permutation, the shuffle degenerates to Order-A, and retry work ` +
        `goes quadratic under burst with no test failing and no symptom but latency. At 32 ` +
        `bits the chance of a false alarm here is 2^-32.\n${varying.loop}\n${fixture}`,
    ).toBe(2);

    const FIXED = 424_242;
    const set = await twice(FIXED);
    expect(failureOf(set), `the service did not start.\n${failureOf(set)}`).toBe('started');
    const constant = set.value as Observed;
    expect(
      constant.refusals.map((r) => r.seed),
      `OQ-04-1 — the mirror, and it is what buys back the word "silently" in ADR-0021: with ` +
        `BOOKING_SEED=${String(FIXED)} every request must log THAT seed. Two different values ` +
        `means the knob is not wired to the ordering at all, and the assertion above would be ` +
        `passing on an implementation that logs a random number it never used.\n${constant.loop}\n${fixture}`,
    ).toEqual([FIXED, FIXED]);
  });

  // ──────────────────────────────────────────────────── R-7a — the mitigation itself ──
  //
  // ADR-0021 bought a production configuration surface to make AC-5 assertable, and arc42
  // §11 R-7a names exactly ONE thing as the mitigation for the risk it created: "a startup
  // `warn` when `BOOKING_SEED` is set, plus an assertion that two refusals log two different
  // seeds". OQ-04-1 above is the second half. This is the first, and until now it was held
  // by nothing an outside-in run could see — so a build that simply never emitted the line
  // was green, and `BOOKING_SEED` would run Order-A in production unannounced.
  //
  // WHAT IS PINNED, AND WHY ONLY THIS MUCH. Pinning a sentence is how the next rewording
  // becomes a false failure; pinning nothing is what R-7a already had. So this asserts the
  // OBLIGATIONS an operator's line has to meet, each independently defeasible:
  //
  //   1. exactly one such record, and only when the variable is set — a line on every run
  //      is noise an operator learns to filter, and one per request is worse;
  //   2. at `warn` or above, AT THE LEVEL A DEPLOYMENT THAT CONFIGURES NOTHING RUNS AT —
  //      a warning only reachable under `LOG_LEVEL=trace` is not a mitigation, and this is
  //      the only assertion in the suite that starts the artifact without a LOG_LEVEL;
  //   3. it names `BOOKING_SEED` — which knob; a contract fixed by ADR-0022 and §7.3, not
  //      prose, so no rewording moves it;
  //   4. it carries the seed's VALUE — ADR-0021's whole point is that the run is
  //      reproducible, and a warning that omits the value hands back a label, not a handle;
  //   5. it says `production` — the operator-actionable half. That is `config.ts:213`,
  //      Stryker's one non-equivalent survivor: the sentence telling the reader what to DO
  //      could be deleted with the suite green.
  //
  // DELIBERATELY LOOSE: the wording, the sentence order, WHICH FIELD carries any of it (the
  // record is read whole, so moving the seed from the message into a structured field is not
  // a failure — the information is what the operator needs, not its position), and ADR-0009's
  // "Order-A" jargon. That last one is an argument for the decision rather than an
  // instruction to the operator, it is already killed by a mutant inside `config.ts` —
  // which IS in Stryker's scope — and duplicating it here would buy a second brittle pin
  // and no new obligation.

  it('R-7a — BOOKING_SEED set warns once at startup, visibly, naming the variable, its value and production; unset warns not at all', async () => {
    const SEEDED = 987_654_321;

    const seeded = await withService(
      { bookingSeed: SEEDED, logLevel: null },
      async (service) =>
        // The warning is a startup line, so it needs no traffic: `loadConfig` supplies the
        // PORT the server binds (§7.3), so it has already run by the time /health answers.
        // The wait is for stdout delivery to this process, not for the service to act.
        await service.awaitLogRecords((rs) => configWarnings(rs).length >= 1, 5_000),
    );
    expect(
      failureOf(seeded),
      `the service did not start with BOOKING_SEED=${String(SEEDED)}.\n${failureOf(seeded)}`,
    ).toBe('started');
    const announced = seeded.value as readonly Record<string, unknown>[];
    const warnings = configWarnings(announced);
    const heard = `\nwhat the process said at its DEFAULT log level:\n${describeRecords(announced)}`;

    expect(
      warnings.length,
      `R-7a — exactly one \`${CONFIG_WARNING_EVENT}\` record. Zero is the mitigation missing ` +
        `entirely — the risk ADR-0021 knowingly created, realised, with every other test in ` +
        `this repository still green. More than one is a per-request line, which is noise ` +
        `rather than a startup announcement.${heard}`,
    ).toBe(1);
    const warning = warnings[0] as StartupWarning;

    expect(
      warning.level,
      `R-7a — the line must be at \`warn\` (${String(WARN_LEVEL)}) or above AND at the level ` +
        `an unconfigured deployment runs at. Below it the mitigation exists only for whoever ` +
        `already knew to look, which is nobody.${heard}`,
    ).toBeGreaterThanOrEqual(WARN_LEVEL);
    expect(
      warning.text,
      `R-7a — the line must name the variable, so the operator knows which knob to unset.${heard}`,
    ).toContain('BOOKING_SEED');
    expect(
      warning.text,
      `R-7a — and its VALUE (${String(SEEDED)}): ADR-0021 exists so a run can be REPRODUCED, ` +
        `and a warning without the seed is the label that ADR called insufficient.${heard}`,
    ).toContain(String(SEEDED));
    expect(
      warning.text.toLowerCase(),
      `R-7a — and it must tell the operator this is not a production setting. This is the ` +
        `only assertion anywhere on the actionable half of the text: \`config.ts:213\` is ` +
        `Stryker's one non-equivalent survivor precisely because that sentence could be ` +
        `deleted with the whole suite green. The word is pinned, not the sentence.${heard}`,
    ).toContain('production');

    // The mirror, and it is what stops the assertion above being satisfied by a build that
    // warns unconditionally: such a build announces nothing, it just always complains, and
    // an operator who sees the line on every boot has been given no signal at all.
    const unset = await withService({ logLevel: null }, async (service) =>
      // Nothing to wait FOR — the claim is an absence — so this drains rather than waits.
      // It is not vacuous: the seeded run above was heard at this same level, in this same
      // way, so silence here is the service's and not the harness's.
      await service.awaitLogRecords(() => false, 1_500),
    );
    expect(failureOf(unset), `the service did not start.\n${failureOf(unset)}`).toBe('started');
    const quiet = unset.value as readonly Record<string, unknown>[];
    expect(
      configWarnings(quiet).map((w) => w.text),
      `R-7a — with BOOKING_SEED UNSET — the default, and the only production setting — there ` +
        `must be no such warning at all. A line on every boot is one an operator filters, and ` +
        `a filtered warning is the silent degradation ADR-0009 named.\n${describeRecords(quiet)}`,
    ).toEqual([]);
  });
});

/**
 * ADR-0021's startup line: `loadConfig` emits ONE of these when `BOOKING_SEED` is set, and it
 * is the whole of arc42 §11 R-7a's mitigation. Both of `pino`'s renderings of an event name
 * are accepted, exactly as `conflictRecords` accepts them — which of `event` and `msg` carries
 * the string is a calling convention and R-7a asserts nothing about it.
 */
const CONFIG_WARNING_EVENT = 'config.warning';

/** `pino`'s numeric levels: 30 is `info`, 40 is `warn`, 50 is `error`. */
const WARN_LEVEL = 40;

interface StartupWarning {
  readonly level: number;
  /** Everything the record says, joined — see `renderedText`. */
  readonly text: string;
}

function configWarnings(
  records: readonly Record<string, unknown>[],
): readonly StartupWarning[] {
  const out: StartupWarning[] = [];
  for (const record of records) {
    const named =
      record['event'] === CONFIG_WARNING_EVENT || record['msg'] === CONFIG_WARNING_EVENT;
    if (!named) continue;
    out.push({ level: Number(record['level']), text: renderedText(record) });
  }
  return out;
}

/**
 * Every value the record carries, joined into one string, minus `pino`'s own envelope.
 *
 * The record is read WHOLE on purpose: the four content obligations above are about what an
 * operator is told, not about where the line puts it, so moving the seed out of the message
 * and into a structured field must not fail this test — and dropping it entirely must.
 */
function renderedText(record: Record<string, unknown>): string {
  const envelope = ['level', 'time', 'pid', 'hostname'];
  return Object.entries(record)
    .filter(([key]) => !envelope.includes(key))
    .map(([, value]) => (typeof value === 'string' ? value : JSON.stringify(value)))
    .join(' ');
}

/** The raw NDJSON, one line each, for a failure that can be diagnosed from CI output alone. */
function describeRecords(records: readonly Record<string, unknown>[]): string {
  if (records.length === 0) return '      (the process wrote nothing to stdout)';
  return records.map((record) => `      ${JSON.stringify(record)}`).join('\n');
}

/** `'started'` when the service came up, otherwise the harness's diagnosis. */
function failureOf(attempt: { readonly failure?: string }): string {
  return attempt.failure ?? 'started';
}
