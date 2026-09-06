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
type OrderCandidates = (
  bays: readonly string[],
  technicians: readonly string[],
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
        const first = orderCandidates(bays, technicians, seed);
        const second = orderCandidates(bays, technicians, seed);
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
        const order = orderCandidates(bays, technicians, seed);
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
        const order = orderCandidates(bays, technicians, seed);
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
        const order = orderCandidates(bays, technicians, seed) as CandidateOrder;
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
          const order = orderCandidates(bays, technicians, seed) as CandidateOrder;
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
      const order = orderCandidates(bays, technicians, seed) as CandidateOrder;
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
          let order: CandidateOrder | null = orderCandidates(bays, technicians, seed);
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
});
