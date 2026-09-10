import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

/**
 * AC-5, as the architect ruled it at step 1 — **ordering is a deterministic pure function of
 * (bays, technicians, seed)** — plus the algebra of `prune` and `nextCandidate` that the
 * retry loop's additive bound rests on.
 *
 * `docs/slices/04-design.md` §3, §5 · arc42 §5.2, §6.2 · ADR-0009, ADR-0013, ADR-0021.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY AC-5 IS A PROPERTY AND NOT A CONCURRENCY CASE.
 *
 * AC-5's literal words are "the same interleaving of candidate choices results". An
 * interleaving of CONCURRENT requests is the OS scheduler's and PostgreSQL's, not this
 * system's: ADR-0018's own retry table records identical configurations producing 292, 241
 * and 2 100 deadlocks. Asserting a reproducible interleaving would manufacture the flake AC-5
 * exists to prevent. What a seed can decide is the ORDER ONE REQUEST DRAWS ITS CANDIDATES IN,
 * and that is what is asserted here — with the end-to-end half, through the running service
 * under `BOOKING_SEED`, in `tests/acceptance/candidate-retry.test.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE SEAM (ADR-0013 §6.2, the pattern slice 01 established).
 *
 * `src/domain/candidates.ts` imports nothing, and `outside-in-tests-do-not-import-src` forbids
 * this directory from naming `src/` at all. So this file loads the COMPILED artifact through a
 * dynamic import whose specifier is COMPUTED from a `URL` — a literal reference to a module
 * that does not exist yet fails `tsc`, which fails `verify`, which is what `red-proof` gates
 * the red commit on. The load happens INSIDE each test body, never in a hook and never at
 * module top level, so "it is not built yet" is a value this file asserts on rather than an
 * exception the runner reports (criterion C1). At the red commit that assertion IS the
 * failure, and its message names the missing export.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY NOT ASSERTED.
 *
 * **Uniformity.** P6 asserts the seed CHANGES the order and that every position is reachable
 * as the head; it does not assert the permutation is uniformly distributed. ADR-0009 chose
 * Fisher-Yates and this file does not re-derive it — a test that pinned the exact permutation
 * for a seed would be a transcription of the implementation, not a check on it, and would
 * forbid the algorithm ever changing behind its contract.
 *
 * **`prune` of an absent id.** §3 says "drops `id` from the named list" and says nothing about
 * an id that is not in it. The loop only ever prunes what `nextCandidate` just returned, so
 * the case is unreachable and inventing a rule for it here would be this file deciding a
 * design question that belongs to the architect.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * SLICE 19 AMENDMENT (`docs/slices/19-attempt-cap-sized-against-occupancy.md` AC-3a/AC-3b,
 * AC-7 · `19-design.md` §3, §4, §6 ruling 10 · ADR-0040) — carried here rather than in a
 * second file, because P1-P7 already characterise `orderCandidates` and a duplicate file
 * asserting the same algebra against the same seam would be the ADR-0039 duplication this
 * codebase declines elsewhere.
 *
 * `orderCandidates` gains a third parameter, `busy: OccupancySnapshot`, inserted BEFORE
 * `seed` (design §3: "the call reads what, what, what is taken, how"). P1-P7 below now pass
 * `EMPTY_OCCUPANCY` where they used to pass nothing — which is not a weakening of what they
 * assert: design P4 proves `busy = EMPTY_OCCUPANCY` makes `freeFirst` shuffle the same list on
 * the same stream and return element-for-element what the three-argument function used to, so
 * re-running P1-P7 under `EMPTY_OCCUPANCY` IS the black-box form of **AC-7**'s identity claim
 * — a literal comparison against "the old code" is neither necessary nor possible from outside
 * (there is only ever one compiled `orderCandidates`, and pinning its exact permutation would
 * be the transcription this file's own header already forbids).
 *
 * **P8, P9 and P10 are new and are AC-3b**: `busy` PERMUTES the two lists and never REMOVES
 * from them, over arbitrary `busy` — including ids absent from both lists, `busy` a SUPERSET
 * of a whole list, and `busy = EMPTY_OCCUPANCY` itself — and `null` is returned **iff** an
 * input list is empty, regardless of what `busy` says. This is the point ruling 10 makes about
 * `T-19-1`'s refused seam: nothing else in the repository would catch a later edit that turned
 * the ordering READ into a FILTER (removing a busy candidate rather than merely reordering it)
 * — §2.1 cannot, because ADR-0018's per-resource lock makes a reintroduced check-then-act
 * *correct* rather than merely harmless, so no concurrency test would ever see it fail. A
 * property over the multiset is the only guard that would.
 */

// ─────────────────────────────────────────────────────────────── the seam: load dist/ ──

type DomainModule = Record<string, unknown> | null;

async function loadCandidates(): Promise<DomainModule> {
  const specifier = new URL('../../dist/domain/candidates.js', import.meta.url).href;
  try {
    return (await import(specifier)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function assertExport<T>(mod: DomainModule, exportName: string): T {
  const value = mod ? mod[exportName] : undefined;
  expect(
    typeof value,
    `dist/domain/candidates.js did not load, or does not export ${exportName}`,
  ).toBe('function');
  return value as T;
}

/** The shape §3 pins: two non-empty lists, branded. Read structurally, never by brand. */
interface CandidateOrder {
  readonly bays: readonly string[];
  readonly technicians: readonly string[];
}
interface Candidate {
  readonly bayId: string;
  readonly technicianId: string;
}
/** `19-design.md` §3, verbatim: "what the ordering is told is taken". */
interface OccupancySnapshot {
  readonly bays: readonly string[];
  readonly technicians: readonly string[];
}
/** `19-design.md` §3: "the ordering with nothing known to be busy — reschedule's argument". */
const EMPTY_OCCUPANCY: OccupancySnapshot = { bays: [], technicians: [] };
type OrderCandidates = (
  bays: readonly string[],
  technicians: readonly string[],
  busy: OccupancySnapshot,
  seed: number,
) => CandidateOrder | null;
type NextCandidate = (order: CandidateOrder) => Candidate;
type Prune = (
  order: CandidateOrder,
  resource: 'bay' | 'technician',
  id: string,
) => CandidateOrder | null;

interface Api {
  readonly orderCandidates: OrderCandidates;
  readonly nextCandidate: NextCandidate;
  readonly prune: Prune;
}

async function api(): Promise<Api> {
  const mod = await loadCandidates();
  return {
    orderCandidates: assertExport<OrderCandidates>(mod, 'orderCandidates'),
    nextCandidate: assertExport<NextCandidate>(mod, 'nextCandidate'),
    prune: assertExport<Prune>(mod, 'prune'),
  };
}

// ───────────────────────────────────────────────────────────────────────── arbitraries ──

/**
 * Ids are unique within a list: `prune` names one by VALUE, so duplicates are meaningless.
 * UUIDs because that is what `service_bay.id` and `technician.id` are (arc42 §8.1) — the
 * functions treat them as opaque, and generating the real shape costs nothing.
 */
const ids = (min: number, max: number): fc.Arbitrary<string[]> =>
  fc.uniqueArray(fc.uuid(), { minLength: min, maxLength: max });

/** `main.ts` binds the seed to `crypto.getRandomValues(new Uint32Array(1))[0]` — a uint32. */
const seeds = fc.integer({ min: 0, max: 0xffff_ffff });

const sorted = (xs: readonly string[]): string[] => [...xs].sort();

describe('AC-5 — candidate ordering is a deterministic pure function of (bays, technicians, seed)', () => {
  it('P1 — the same inputs give the same order, every time', async () => {
    const { orderCandidates } = await api();
    fc.assert(
      fc.property(ids(1, 12), ids(1, 12), seeds, (bays, technicians, seed) => {
        const first = orderCandidates(bays, technicians, EMPTY_OCCUPANCY, seed);
        const second = orderCandidates(bays, technicians, EMPTY_OCCUPANCY, seed);
        expect(second, 'a second call with identical arguments must return an identical order').toEqual(
          first,
        );
      }),
      { numRuns: 400 },
    );
  });

  it('P2 — the order is a PERMUTATION of the input: nothing is dropped, nothing invented, nothing duplicated', async () => {
    const { orderCandidates } = await api();
    fc.assert(
      fc.property(ids(1, 12), ids(1, 12), seeds, (bays, technicians, seed) => {
        const order = orderCandidates(bays, technicians, EMPTY_OCCUPANCY, seed);
        expect(order, 'both lists are non-empty, so an order must exist').not.toBeNull();
        const got = order as CandidateOrder;
        // Sorted equality, not set equality: a shuffle that duplicated one bay and dropped
        // another would satisfy a `Set` comparison and quietly leave a candidate untried,
        // which is the spurious refusal AC-1 forbids.
        expect(sorted(got.bays), 'every bay exactly once').toEqual(sorted(bays));
        expect(sorted(got.technicians), 'every technician exactly once').toEqual(
          sorted(technicians),
        );
      }),
      { numRuns: 400 },
    );
  });

  it('P3 — null when either list is empty, and only then', async () => {
    const { orderCandidates } = await api();
    fc.assert(
      fc.property(ids(0, 8), ids(0, 8), seeds, (bays, technicians, seed) => {
        const order = orderCandidates(bays, technicians, EMPTY_OCCUPANCY, seed);
        const expectedNull = bays.length === 0 || technicians.length === 0;
        expect(
          order === null,
          `null iff no candidate exists. §3: this is the ONLY empty-candidate branch, and ` +
            `arc42 §6.2 step 6 is where the 500 (no bay) and 422 (no qualified technician) ` +
            `answers are decided — a 409 must never be fabricated there, because there is no ` +
            `verdict to build one from (ADR-0016)`,
        ).toBe(expectedNull);
      }),
      { numRuns: 300 },
    );
  });

  it('P4 — nextCandidate is TOTAL and is the head of each list', async () => {
    const { orderCandidates, nextCandidate } = await api();
    fc.assert(
      fc.property(ids(1, 12), ids(1, 12), seeds, (bays, technicians, seed) => {
        const order = orderCandidates(bays, technicians, EMPTY_OCCUPANCY, seed) as CandidateOrder;
        const candidate = nextCandidate(order);
        // Totality is the point of §3's tuple carrier: `readonly [string, ...string[]]` is
        // what removes the index assertion, so this must never throw and never be undefined.
        expect(candidate.bayId, 'the head bay').toBe(order.bays[0]);
        expect(candidate.technicianId, 'the head technician').toBe(order.technicians[0]);
      }),
      { numRuns: 300 },
    );
  });

  it('P5 — prune drops exactly the named id from the named list, keeps the survivors in order, and returns null when that list empties', async () => {
    const { orderCandidates, prune } = await api();
    fc.assert(
      fc.property(
        ids(1, 10),
        ids(1, 10),
        seeds,
        fc.constantFrom<'bay' | 'technician'>('bay', 'technician'),
        fc.nat(),
        (bays, technicians, seed, resource, pick) => {
          const order = orderCandidates(bays, technicians, EMPTY_OCCUPANCY, seed) as CandidateOrder;
          const target = resource === 'bay' ? order.bays : order.technicians;
          const other = resource === 'bay' ? order.technicians : order.bays;
          const id = target[pick % target.length] as string;

          const pruned = prune(order, resource, id);
          if (target.length === 1) {
            expect(
              pruned,
              `pruning the last ${resource} empties that list, which is the 'exhausted' exit ` +
                `of arc42 §6.2 — and the list that emptied is what names the ContendedResource`,
            ).toBeNull();
            return;
          }
          expect(pruned, 'candidates remain, so an order remains').not.toBeNull();
          const got = pruned as CandidateOrder;
          const gotTarget = resource === 'bay' ? got.bays : got.technicians;
          const gotOther = resource === 'bay' ? got.technicians : got.bays;

          // The WHOLE resource, by value — T-02-1, and the reason the loop's bound is
          // additive rather than multiplicative.
          expect(
            gotTarget,
            `prune removes the named ${resource} and keeps the rest IN ORDER — a prune that ` +
              `reshuffled would make a recorded seed unable to reproduce the run it labelled ` +
              `(ADR-0021), and one that removed only the (bay, technician) PAIR would meet ` +
              `the same resource again and turn the bound multiplicative`,
          ).toEqual(target.filter((x) => x !== id));
          expect(gotOther, 'the other list is untouched').toEqual(other);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('P6 — the seed decides the order: it is not ignored, and every position is reachable as the head', async () => {
    const { orderCandidates } = await api();
    // Fixed lists and a fixed sweep of seeds, so this is a measurement rather than a sample:
    // it passes or fails identically on every run and on every machine.
    const bays = Array.from({ length: 8 }, (_unused, i) => `bay-${String(i)}`);
    const technicians = Array.from({ length: 8 }, (_unused, i) => `tech-${String(i)}`);
    const heads = new Set<string>();
    const orders = new Set<string>();
    for (let seed = 0; seed < 512; seed += 1) {
      const order = orderCandidates(bays, technicians, EMPTY_OCCUPANCY, seed) as CandidateOrder;
      heads.add(`${String(order.bays[0])}/${String(order.technicians[0])}`);
      orders.add(`${order.bays.join(',')}|${order.technicians.join(',')}`);
    }
    expect(
      orders.size,
      `over 512 seeds the ordering must take more than one value. ONE value means the seed is ` +
        `ignored and the ordering is ADR-0009's REJECTED Order-A (sorted), which degenerates ` +
        `under burst to the O(n^2) retry storm ADR-0004 named — and which passes every other ` +
        `property in this file, since a constant function is pure and deterministic`,
    ).toBeGreaterThan(1);
    expect(
      new Set([...heads].map((h) => h.split('/')[0])).size,
      `every one of the 8 bays must be reachable as the first candidate. Fewer means part of ` +
        `the list can never be tried first, which is the load-balancing bias ADR-0009 rejected`,
    ).toBe(8);
    expect(
      new Set([...heads].map((h) => h.split('/')[1])).size,
      'and every one of the 8 technicians',
    ).toBe(8);
  });

  it('P7 — the loop terminates within the ADDITIVE bound: draw, prune, repeat empties a list in |bays| + |technicians| - 1 steps at worst', async () => {
    const { orderCandidates, nextCandidate, prune } = await api();
    fc.assert(
      fc.property(
        ids(1, 8),
        ids(1, 8),
        seeds,
        fc.array(fc.boolean(), { minLength: 20, maxLength: 20 }),
        (bays, technicians, seed, pruneBay) => {
          // The loop of arc42 §6.2 with an adversary choosing which constraint fires each
          // time. Bound-2's claim is that the header |bays| + |technicians| is enough and its
          // tail is unreachable; this is that claim, exercised against the real functions.
          let order: CandidateOrder | null = orderCandidates(bays, technicians, EMPTY_OCCUPANCY, seed);
          let steps = 0;
          const bound = bays.length + technicians.length;
          while (order !== null) {
            const candidate = nextCandidate(order);
            steps += 1;
            expect(
              steps,
              `the draw-prune loop must empty a list within |bays| + |technicians| = ` +
                `${String(bound)} steps. Exceeding it means prune is not removing a whole ` +
                `resource, and arc42 §6.2's unreachable tail becomes reachable — a THROW`,
            ).toBeLessThanOrEqual(bound);
            const takeBay = pruneBay[steps % pruneBay.length] ?? true;
            order = takeBay
              ? prune(order, 'bay', candidate.bayId)
              : prune(order, 'technician', candidate.technicianId);
          }
          expect(
            steps,
            'and it must take at least min(|bays|, |technicians|) steps to empty one',
          ).toBeGreaterThanOrEqual(Math.min(bays.length, technicians.length));
        },
      ),
      { numRuns: 400 },
    );
  });

  // ─────────────────────────────────────────── slice 19: AC-3b — busy permutes, never removes ──

  /**
   * Ids drawn from `pool` (a subset — `[]` and the WHOLE pool are both in `fc.subarray`'s
   * range, so "busy = EMPTY_OCCUPANCY" and "busy is a SUPERSET of the whole list" are both
   * reachable through this alone) unioned with ids that name NOTHING in either list — AC-3b's
   * three named cases in one generator: absent ids, a superset, and empty.
   */
  const busyFrom = (pool: readonly string[]): fc.Arbitrary<string[]> =>
    fc
      .tuple(fc.subarray([...pool]), fc.uniqueArray(fc.uuid(), { maxLength: 5 }))
      .map(([subset, absent]) => [...subset, ...absent]);

  const scenarioWithBusy = fc
    .tuple(ids(1, 10), ids(1, 10), seeds)
    .chain(([bays, technicians, seed]) =>
      fc.tuple(
        fc.constant(bays),
        fc.constant(technicians),
        fc.constant(seed),
        fc.record({ bays: busyFrom(bays), technicians: busyFrom(technicians) }),
      ),
    );

  it('P8 — busy PERMUTES and never REMOVES: an equal multiset to orderCandidates(..., EMPTY_OCCUPANCY, seed), for arbitrary busy — including ids absent from the lists and busy a SUPERSET of a whole list', async () => {
    const { orderCandidates } = await api();
    fc.assert(
      fc.property(scenarioWithBusy, ([bays, technicians, seed, busy]) => {
        const withBusy = orderCandidates(bays, technicians, busy, seed);
        const empty = orderCandidates(bays, technicians, EMPTY_OCCUPANCY, seed);
        expect(withBusy, 'both lists are non-empty, so busy must not empty either').not.toBeNull();
        expect(empty, 'the EMPTY_OCCUPANCY call is the control and must also be non-null').not.toBeNull();
        const got = withBusy as CandidateOrder;
        const control = empty as CandidateOrder;
        // Sorted equality, not set equality — the same anti-vacuity reasoning as P2: a
        // partition that duplicated a busy id and dropped a free one would satisfy a Set
        // comparison while quietly leaving a candidate untried, which is the spurious refusal
        // this whole slice exists to remove.
        expect(
          sorted(got.bays),
          'busy may reorder the bays but the SET of bays is unchanged — this is what makes ' +
            "a wrong or stale snapshot (T-19-1) cost attempts and never a refusal",
        ).toEqual(sorted(control.bays));
        expect(sorted(got.technicians), 'and the set of technicians').toEqual(sorted(control.technicians));
      }),
      { numRuns: 400 },
    );
  });

  it('P9 — null iff an input list is empty, for ANY busy: busy cannot reach the null exit that bookAppointment routes to 500/422', async () => {
    const { orderCandidates } = await api();
    fc.assert(
      fc.property(
        fc
          .tuple(ids(0, 8), ids(0, 8), seeds)
          .chain(([bays, technicians, seed]) =>
            fc.tuple(
              fc.constant(bays),
              fc.constant(technicians),
              fc.constant(seed),
              fc.record({ bays: busyFrom(bays), technicians: busyFrom(technicians) }),
            ),
          ),
        ([bays, technicians, seed, busy]) => {
          const order = orderCandidates(bays, technicians, busy, seed);
          const expectedNull = bays.length === 0 || technicians.length === 0;
          expect(
            order === null,
            'null iff no candidate exists, REGARDLESS of busy — including busy declaring every ' +
              'remaining candidate taken. A build where busy can empty a non-empty list has ' +
              'turned the ordering read into a FILTER (ADR-0040\'s refused Filter-1), which is ' +
              "§2.1's forbidden shape with the `if` moved into the query planner",
          ).toBe(expectedNull);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('P10 — concrete edge cases named by AC-3b: ids absent from the lists, busy a SUPERSET of the whole list, and busy = EMPTY_OCCUPANCY', async () => {
    const { orderCandidates } = await api();
    const bays = ['bay-0', 'bay-1', 'bay-2'];
    const technicians = ['tech-0', 'tech-1'];
    const seed = 20_260_910;
    const baseline = orderCandidates(bays, technicians, EMPTY_OCCUPANCY, seed) as CandidateOrder;
    expect(baseline, 'the control call itself must be non-null').not.toBeNull();

    const cases: Record<string, OccupancySnapshot> = {
      'busy = EMPTY_OCCUPANCY': EMPTY_OCCUPANCY,
      'ids absent from both lists': {
        bays: ['not-a-bay-1', 'not-a-bay-2'],
        technicians: ['not-a-technician'],
      },
      'busy is a SUPERSET of the whole list (every candidate reported taken)': {
        bays: [...bays, 'not-a-bay'],
        technicians: [...technicians, 'not-a-technician'],
      },
    };

    for (const [label, busy] of Object.entries(cases)) {
      const order = orderCandidates(bays, technicians, busy, seed);
      expect(order, `${label}: busy must never empty a non-empty list`).not.toBeNull();
      const got = order as CandidateOrder;
      expect(sorted(got.bays), `${label}: the same multiset of bays as EMPTY_OCCUPANCY`).toEqual(
        sorted(baseline.bays),
      );
      expect(
        sorted(got.technicians),
        `${label}: the same multiset of technicians as EMPTY_OCCUPANCY`,
      ).toEqual(sorted(baseline.technicians));
    }
  });
});
