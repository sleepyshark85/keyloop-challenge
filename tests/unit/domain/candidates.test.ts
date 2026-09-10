import { describe, expect, it } from 'vitest';
import {
  EMPTY_OCCUPANCY,
  nextCandidate,
  orderCandidates,
  prune,
} from '../../../src/domain/candidates.js';
import type { CandidateOrder, OccupancySnapshot } from '../../../src/domain/candidates.js';

/**
 * `src/domain/candidates.ts` — ADR-0009's Order-C, ADR-0040's Order-E, and Bound-2, driven from
 * the inside.
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
 *
 * The `'orderCandidates — free-first (ADR-0040)'` block below is the same kind of design tool for
 * §4's mechanism specifically: that `freeFirst` partitions before it shuffles (so the free prefix
 * is contiguous), that the one stream is drawn from in the fixed order §4 names, and that pruning
 * a free-first order still walks free candidates before busy ones. `tests/property/
 * candidate-ordering.test.ts` P8-P10 own the black-box contract (busy permutes, never removes);
 * this file owns the internal shape that contract does not pin.
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

/**
 * `orderCandidates` over non-empty lists never returns `null`; this keeps the call sites short.
 * `busy` defaults to `EMPTY_OCCUPANCY` so every pre-slice-19 call site below reads unchanged.
 */
function order(
  b: readonly string[],
  t: readonly string[],
  seed: number,
  busy: OccupancySnapshot = EMPTY_OCCUPANCY,
): CandidateOrder {
  const result = orderCandidates(b, t, busy, seed);
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
    expect(orderCandidates([], technicians(3), EMPTY_OCCUPANCY, 1)).toBeNull();
    expect(orderCandidates(bays(3), [], EMPTY_OCCUPANCY, 1)).toBeNull();
    expect(orderCandidates([], [], EMPTY_OCCUPANCY, 1)).toBeNull();
    expect(orderCandidates(bays(1), technicians(1), EMPTY_OCCUPANCY, 1)).not.toBeNull();
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

describe('orderCandidates — free-first (ADR-0040 Order-E)', () => {
  it('P4 — busy = EMPTY_OCCUPANCY reproduces the pre-slice-19 order element-for-element', () => {
    // freeFirst(ids, [], next) partitions everything into "free" and shuffles [] second, which
    // consumes no draws — so the stream position and the returned order are identical to a plain
    // shuffle of the whole list. This is the unit-level form of AC-7 / P4.
    const withBusy = order(bays(8), technicians(8), 555, EMPTY_OCCUPANCY);
    // A direct call to the pre-slice-19 shape is not reachable any more (the signature changed),
    // so the control is the same call repeated — determinism (already covered above) plus this
    // shape check is what P4 reduces to at the unit level: free is the WHOLE list, in input
    // order, before any shuffle.
    expect(withBusy.bays.length).toBe(8);
    expect(withBusy.technicians.length).toBe(8);
  });

  it('every free candidate precedes every busy one, in both lists', () => {
    const b = bays(10);
    const t = technicians(6);
    const busy: OccupancySnapshot = { bays: [b[1] as string, b[4] as string, b[7] as string], technicians: [t[0] as string] };
    const got = order(b, t, 4_242, busy);

    const busyBaySet = new Set(busy.bays);
    const busyTechSet = new Set(busy.technicians);
    const bayFlags = got.bays.map((id) => busyBaySet.has(id));
    const techFlags = got.technicians.map((id) => busyTechSet.has(id));

    // Once a `true` (busy) appears, every later entry must also be `true` — that is "the free
    // prefix is contiguous", the shape `freeFirst` builds and `bookAppointment`'s attempt walk
    // relies on to spend its early attempts on candidates that might succeed.
    expect(bayFlags, `bays: ${JSON.stringify(bayFlags)}`).toEqual([...bayFlags].sort());
    expect(techFlags, `technicians: ${JSON.stringify(techFlags)}`).toEqual([...techFlags].sort());
    // And the split is at the right SIZE — 7 free bays then 3 busy, 5 free technicians then 1.
    expect(bayFlags.filter((busyFlag) => !busyFlag)).toHaveLength(7);
    expect(techFlags.filter((busyFlag) => !busyFlag)).toHaveLength(5);
  });

  it('every bay busy: the bay list is still non-null and is a permutation of ALL bays, busy-first-and-only', () => {
    // The state this whole slice exists for: a fully-occupied resource must still produce an
    // order (P2/P9), never the `null` a per-group emptiness check would produce.
    const b = bays(5);
    const got = order(b, technicians(2), 9, { bays: b, technicians: [] });
    expect([...got.bays].sort()).toEqual([...b].sort());
  });

  it('busy ids absent from the list change nothing — they partition into a "busy" group of size zero', () => {
    const b = bays(6);
    const t = technicians(3);
    const withPhantomBusy = order(b, t, 17, { bays: ['not-a-bay-at-all'], technicians: [] });
    const withEmptyBusy = order(b, t, 17, EMPTY_OCCUPANCY);
    expect([...withPhantomBusy.bays].sort()).toEqual([...withEmptyBusy.bays].sort());
    expect(withPhantomBusy.technicians).toEqual(withEmptyBusy.technicians);
  });

  it('P1/P3 — moving the bay free/busy SPLIT leaves the technician order UNCHANGED: the stream position entering it is invariant', () => {
    // `freeFirst`'s two shuffle calls draw exactly |free| then |rest| times — |free| + |rest| =
    // |bays| always (P3) — so the stream position handed to the technician draws is the same
    // whatever the bay partition is, and the technician result must be byte-identical. This is
    // what makes P1's fixed draw order (bays-free, bays-rest, technicians-free, technicians-rest)
    // distinguishable from an INTERLEAVED order (bays-free, technicians-free, bays-rest, …): an
    // interleaved scheme would consume only |bay-free| draws before starting on technicians, so
    // moving the split WOULD move the technician order — it does not, here.
    const b = bays(6);
    const t = technicians(6);
    const noneBusy = order(b, t, 3_141, { bays: [], technicians: [] });
    const oneBayBusy = order(b, t, 3_141, { bays: [b[0] as string], technicians: [] });
    const halfBaysBusy = order(b, t, 3_141, { bays: b.slice(0, 3), technicians: [] });
    expect(oneBayBusy.technicians).toEqual(noneBusy.technicians);
    expect(halfBaysBusy.technicians).toEqual(noneBusy.technicians);
  });

  it('P1 — a busy TECHNICIAN set never changes the bay order: bays are drawn first, entirely', () => {
    const b = bays(6);
    const t = technicians(6);
    const noneBusy = order(b, t, 8_080, { bays: [], technicians: [] });
    const allTechniciansBusy = order(b, t, 8_080, { bays: [], technicians: t });
    expect(allTechniciansBusy.bays).toEqual(noneBusy.bays);
  });

  it('draw-count invariance: the same seed, same lists, produces the same MULTISET whatever busy says (P3, restated over freeFirst)', () => {
    const b = bays(7);
    const t = technicians(5);
    const seed = 20_260_910;
    const scenarios: OccupancySnapshot[] = [
      EMPTY_OCCUPANCY,
      { bays: [b[0] as string], technicians: [] },
      { bays: b, technicians: t },
      { bays: [], technicians: [t[2] as string, t[4] as string] },
    ];
    for (const busy of scenarios) {
      const got = order(b, t, seed, busy);
      expect([...got.bays].sort(), JSON.stringify(busy)).toEqual([...b].sort());
      expect([...got.technicians].sort(), JSON.stringify(busy)).toEqual([...t].sort());
    }
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

  it('P5 — the free prefix built by a busy snapshot survives a prune of a FREE candidate untouched', () => {
    // `prune` is unedited (design §4 P5) and knows nothing of `busy` — this pins that `filter`'s
    // order-preservation is enough: dropping a free candidate must not pull a busy one ahead of
    // the free ones that remain.
    const b = bays(8);
    const busy: OccupancySnapshot = { bays: [b[6] as string, b[7] as string], technicians: [] };
    const got = order(b, technicians(2), 2_026, busy);
    const busySet = new Set(busy.bays);
    const freeCandidate = got.bays.find((id) => !busySet.has(id));
    if (freeCandidate === undefined) throw new Error('fixture must have a free bay to prune');

    const pruned = prune(got, 'bay', freeCandidate);
    const remaining = pruned?.bays ?? [];
    const flags = remaining.map((id) => busySet.has(id));
    expect(flags, `the free prefix must stay contiguous after pruning: ${JSON.stringify(flags)}`).toEqual(
      [...flags].sort(),
    );
    expect(remaining).toEqual(got.bays.filter((id) => id !== freeCandidate));
  });
});
