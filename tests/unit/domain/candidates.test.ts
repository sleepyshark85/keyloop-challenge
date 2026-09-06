import { describe, expect, it } from 'vitest';
import {
  nextCandidate,
  orderCandidates,
  prune,
} from '../../../src/domain/candidates.js';
import type { CandidateOrder } from '../../../src/domain/candidates.js';

/**
 * `src/domain/candidates.ts` — ADR-0009's Order-C and Bound-2, driven from the inside.
 *
 * WHAT THIS FILE IS FOR, given that `tests/property/candidate-ordering.test.ts` already asserts
 * determinism, permutation, totality and the additive bound over the same three functions. That
 * file is the test-engineer's and it defines DONE from outside, over the compiled artifact, and
 * it says in its own header that it deliberately does not pin the algorithm. This file is the
 * design tool: it drives the two decisions inside the module that the contract does not fix —
 * that the generator is seeded rather than global, and that a degenerate seed value cannot
 * silently produce a degenerate order — and it is where the shuffle's statistical behaviour is
 * measured, which is the only thing that separates ADR-0009's chosen Order-C from its rejected
 * Order-A once both are pure and deterministic.
 */

const bays = (n: number): string[] => Array.from({ length: n }, (_unused, i) => `bay-${String(i)}`);
const technicians = (n: number): string[] =>
  Array.from({ length: n }, (_unused, i) => `tech-${String(i)}`);

/**
 * The nth id, refused rather than asserted when it is absent.
 *
 * `CandidateOrder` is a `readonly [string, ...string[]]`, so index 0 is a `string` and every other
 * index is `string | undefined` — the carrier makes the HEAD total, which is exactly what
 * `nextCandidate` needs and no more. A test that reaches past it says so here once.
 */
function nth(ids: readonly string[], index: number): string {
  const id = ids[index];
  if (id === undefined) throw new Error(`the fixture has no id at index ${String(index)}`);
  return id;
}

/** `orderCandidates` over non-empty lists never returns `null`; this keeps the call sites short. */
function order(b: readonly string[], t: readonly string[], seed: number): CandidateOrder {
  const result = orderCandidates(b, t, seed);
  if (result === null) throw new Error('both lists are non-empty, so an order must exist');
  return result;
}

describe('orderCandidates — the order is decided by the seed and nothing else', () => {
  it('is a pure function of (bays, technicians, seed)', () => {
    const first = order(bays(6), technicians(6), 12_345);
    const second = order(bays(6), technicians(6), 12_345);
    expect(second).toEqual(first);
  });

  it('is a permutation of each list — nothing dropped, invented or duplicated', () => {
    const got = order(bays(9), technicians(4), 777);
    expect([...got.bays].sort()).toEqual([...bays(9)].sort());
    expect([...got.technicians].sort()).toEqual([...technicians(4)].sort());
  });

  it('does not mutate its arguments', () => {
    // The caller hands over the arrays it read from `candidateRepository`, and the loop reads
    // their lengths AFTER ordering to compute Bound-2's header. A shuffle in place would change
    // that bound's inputs from under it.
    const b = bays(5);
    const t = technicians(5);
    order(b, t, 99);
    expect(b).toEqual(bays(5));
    expect(t).toEqual(technicians(5));
  });

  it('is null when either list is empty, and only then', () => {
    expect(orderCandidates([], technicians(3), 1)).toBeNull();
    expect(orderCandidates(bays(3), [], 1)).toBeNull();
    expect(orderCandidates([], [], 1)).toBeNull();
    expect(orderCandidates(bays(1), technicians(1), 1)).not.toBeNull();
  });

  it('SURVIVES A SEED THAT IS NOT A UINT32 — negative, fractional, or absurd', () => {
    // `main.ts` binds the seed to `crypto.getRandomValues`, which cannot produce any of these,
    // and `BOOKING_SEED` is validated at startup. This is the third line of defence and it is
    // cheap: without the `>>> 0` normalisation the stream yields `NaN`, `Math.floor(NaN * n)` is
    // `NaN`, `splice(NaN, 1)` removes the FIRST element every time, and the shuffle silently
    // degenerates to ADR-0009's rejected Order-A while remaining a valid permutation.
    for (const seed of [-1, -2_147_483_648, 0.5, 4_294_967_296, 1e21]) {
      const got = order(bays(6), technicians(6), seed);
      expect([...got.bays].sort(), `seed ${String(seed)} must still permute`).toEqual(
        [...bays(6)].sort(),
      );
    }
    // And they are not all the same order, which is what "degenerates to Order-A" would look
    // like: three of those five seeds normalise to distinct uint32 states.
    const heads = new Set([-1, 0.5, 1e21].map((seed) => order(bays(8), technicians(8), seed).bays.join()));
    expect(heads.size).toBeGreaterThan(1);
  });
});

describe('orderCandidates — the shuffle spreads, which is the whole of Order-C over Order-A', () => {
  it('every bay and every technician is reachable as the head, over 512 consecutive seeds', () => {
    const headBays = new Set<string>();
    const headTechnicians = new Set<string>();
    for (let seed = 0; seed < 512; seed += 1) {
      const got = order(bays(8), technicians(8), seed);
      headBays.add(got.bays[0]);
      headTechnicians.add(got.technicians[0]);
    }
    expect(headBays.size, 'a bay that can never be drawn first is capacity nobody reaches').toBe(8);
    expect(headTechnicians.size).toBe(8);
  });

  it('spreads the first draw roughly evenly — no resource takes more than a fifth of it', () => {
    // ADR-0009 chose Order-C to spread CONTENTION, and a shuffle that is deterministic, total and
    // a permutation can still pile every request onto one bay. 8 bays over 4096 seeds is 512
    // each; the band is deliberately wide (a fifth, against an expected eighth) so this measures
    // "not concentrated" rather than the exact generator, which the property file declines to pin
    // for a reason this file agrees with.
    const counts = new Map<string, number>();
    const runs = 4096;
    for (let seed = 0; seed < runs; seed += 1) {
      const head = order(bays(8), technicians(8), seed).bays[0];
      counts.set(head, (counts.get(head) ?? 0) + 1);
    }
    expect(counts.size).toBe(8);
    for (const [bay, count] of counts) {
      expect(count / runs, `${bay} took ${String(count)} of ${String(runs)} first draws`).toBeLessThan(
        0.2,
      );
    }
  });

  it('ADJACENT SEEDS GIVE UNRELATED ORDERS — the generator is mixed, not a counter', () => {
    // The seed is drawn per request, and two requests arriving milliseconds apart must not get
    // near-identical permutations. A naive `seed % n` ordering passes every assertion above and
    // fails this one, because it would move the head by exactly one position each time.
    let sameHead = 0;
    for (let seed = 0; seed < 256; seed += 1) {
      const a = order(bays(8), technicians(8), seed);
      const b = order(bays(8), technicians(8), seed + 1);
      if (a.bays[0] === b.bays[0]) sameHead += 1;
    }
    // 1/8 of 256 is 32 by chance; a counter-like generator scores 0 or 256.
    expect(sameHead).toBeGreaterThan(0);
    expect(sameHead).toBeLessThan(96);
  });

  it('the two lists are ordered independently — one seed does not align bay i with technician i', () => {
    // Both lists come off ONE stream, bays then technicians. If the technician list reused the
    // bay list's draws, `bay-k` would always be paired with `tech-k` and the retry loop would
    // explore a diagonal of the candidate space instead of the whole of it.
    let aligned = 0;
    for (let seed = 0; seed < 256; seed += 1) {
      const got = order(bays(8), technicians(8), seed);
      if (got.bays.map((b) => b.slice(4)).join() === got.technicians.map((t) => t.slice(5)).join()) {
        aligned += 1;
      }
    }
    expect(aligned).toBe(0);
  });
});

describe('nextCandidate — total, and the head of each list', () => {
  it('is the pair at the head, and takes no index assertion to read', () => {
    const got = order(bays(4), technicians(3), 2_024);
    expect(nextCandidate(got)).toEqual({ bayId: got.bays[0], technicianId: got.technicians[0] });
  });

  it('is total down to one bay and one technician', () => {
    const got = order(['only-bay'], ['only-tech'], 5);
    expect(nextCandidate(got)).toEqual({ bayId: 'only-bay', technicianId: 'only-tech' });
  });
});

describe('prune — the whole resource, in place, or null', () => {
  it('drops the named bay and leaves every other bay in its order', () => {
    const got = order(bays(5), technicians(2), 31);
    const dropped = nth(got.bays, 2);
    const pruned = prune(got, 'bay', dropped);
    expect(pruned?.bays).toEqual(got.bays.filter((b) => b !== dropped));
    expect(pruned?.technicians, 'the other list is untouched').toEqual(got.technicians);
  });

  it('drops the named technician and leaves the bays alone', () => {
    const got = order(bays(2), technicians(5), 31);
    const dropped = got.technicians[0];
    const pruned = prune(got, 'technician', dropped);
    expect(pruned?.technicians).toEqual(got.technicians.filter((t) => t !== dropped));
    expect(pruned?.bays).toEqual(got.bays);
  });

  it('KEEPS THE SURVIVORS IN ORDER rather than reshuffling them', () => {
    // A recorded seed labels a run (ADR-0021). A prune that re-ordered what remains would make
    // that label unable to reproduce the run it names, and the label is the whole point.
    const got = order(bays(6), technicians(2), 8_675_309);
    const dropped = nth(got.bays, 3);
    const expected = got.bays.filter((b) => b !== dropped);
    const pruned = prune(got, 'bay', dropped);
    expect(pruned?.bays).toEqual(expected);
  });

  it('returns null when the named list empties, and only that list decides it', () => {
    const got = order(['solo-bay'], technicians(4), 11);
    expect(prune(got, 'bay', 'solo-bay'), 'the bay list emptied — the exhausted exit').toBeNull();
    // Four technicians remain, so pruning one of them is not the end of anything.
    expect(prune(got, 'technician', got.technicians[0])).not.toBeNull();
  });

  it('is repeatable: draw, prune, repeat empties a list in |bays| + |technicians| - 1 steps', () => {
    // Bound-2, exercised against the real functions rather than argued. Every draw is refused on
    // the bay, so the bay list is what empties, and it takes exactly |bays| attempts — never
    // |bays| x |technicians|, which is what pruning the PAIR would cost.
    let current: CandidateOrder | null = order(bays(4), technicians(3), 4_242);
    let steps = 0;
    while (current !== null) {
      const candidate = nextCandidate(current);
      steps += 1;
      current = prune(current, 'bay', candidate.bayId);
    }
    expect(steps).toBe(4);
  });

  it('does not mutate the order it was given', () => {
    const got = order(bays(4), technicians(4), 60_613);
    const before = [...got.bays];
    prune(got, 'bay', nth(got.bays, 1));
    expect(got.bays).toEqual(before);
  });
});
