/**
 * Candidate ordering — ADR-0009's Order-C (a seeded shuffle) and Bound-2's per-resource prune,
 * as a pure function of `(bays, technicians, seed)`.
 *
 * NO IMPORTS. `domain-is-pure` is absolute and has no allowlist, so the pseudo-random generator
 * is written out below rather than taken from a package or from `node:crypto`. That is the rule
 * doing its job rather than an inconvenience: a module that cannot import a database client
 * cannot consult one, and ordering is exactly the decision that must not learn what is booked.
 *
 * ── WHY THE SEED IS A PARAMETER ───────────────────────────────────────────────────────────────
 *
 * ADR-0009 rejected Order-B (a uniform shuffle off a global RNG) and chose Order-C, whose whole
 * difference is that the seed ARRIVES: a test fixes the order, production varies it, and neither
 * needs a different code path. `src/application` draws the seed and passes it in; `main.ts` binds
 * the draw to the platform's CSPRNG, or to `BOOKING_SEED` when it is set (ADR-0021).
 *
 * ── NON-EMPTY BY CONSTRUCTION, AND WHY THAT IS THE CARRIER AND NOT A BRAND ────────────────────
 *
 * `CandidateOrder` carries `readonly [string, ...string[]]` rather than `readonly string[]`.
 * Measured at slice 04 step 2 (I-04-3): a brand on the OBJECT leaves the arrays alone, so
 * `noUncheckedIndexedAccess` still makes `order.bays[0]` a `string | undefined` and
 * `nextCandidate` is `error TS2322`, twice — the assertion the design set out to remove would
 * merely have moved into this file. With the tuple carrier `nextCandidate` is total, there is no
 * index assertion anywhere in this module, and `orderCandidates` and `prune` are the only two
 * minting sites: `null` from either one MEANS a list emptied, so the application never has to
 * ask an emptiness question a second time.
 *
 * The three `as CandidateOrder` casts below are the house pattern of `interval.ts` and
 * `duration.ts` — a constructor asserting its own return — and they fabricate no
 * `ContendedResource`, which is the assertion the `contended-resource-cast` marker is about.
 */

/** A non-empty list, in the type system rather than in a comment. */
type NonEmpty<T> = readonly [T, ...T[]];

/**
 * Two non-empty ordered lists. Branded, so it cannot be assembled anywhere but here.
 *
 * Non-empty by construction: {@link orderCandidates} and {@link prune} are the only minting
 * sites and both return `null` instead of an empty list.
 */
export type CandidateOrder = {
  readonly bays: NonEmpty<string>;
  readonly technicians: NonEmpty<string>;
} & { readonly __brand: 'CandidateOrder' };

/** One (bay, technician) pair — the thing an attempt attempts. */
export interface Candidate {
  readonly bayId: string;
  readonly technicianId: string;
}

/**
 * `mulberry32` — a 32-bit stream, deterministic in its seed, in about six lines.
 *
 * The properties that matter here are cheap ones: it is a pure function of the seed, it has a
 * period far beyond the tens of draws a booking makes, and its low bits are not degenerate (a
 * plain LCG's are, which would bias `Math.floor(next() * n)` for small `n` — exactly the draw
 * below). Cryptographic quality is not wanted and would not be reachable without an import.
 */
function mulberry32(seed: number): () => number {
  // `>>> 0` normalises the seed to a uint32, so a negative or fractional value still yields a
  // well-defined stream rather than `NaN`s.
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

/**
 * Fisher-Yates, in its SELECTION form: draw uniformly from a shrinking pool rather than swapping
 * in place. The two produce the same distribution — each remaining element is equally likely at
 * each position — and this one has no `pool[i]` read to assert on, which is the same reason the
 * carrier above is a tuple. Lists here are tens of ids long, so the quadratic `splice` is free.
 */
function shuffle(ids: readonly string[], next: () => number): string[] {
  const pool = [...ids];
  const ordered: string[] = [];
  while (pool.length > 0) {
    ordered.push(...pool.splice(Math.floor(next() * pool.length), 1));
  }
  return ordered;
}

/**
 * ADR-0009's Order-C. Both lists are shuffled from ONE stream — bays, then technicians — so the
 * seed decides the whole order and not merely half of it.
 *
 * `null` when either list is empty: no candidate exists, so no attempt can be made. That is the
 * ONLY empty-candidate branch on the booking path (arc42 §6.2 step 6). This module does not say
 * what an absent bay or an absent technician MEANS — the domain owns "is there a candidate", the
 * application owns "whose fault is it" — and in particular it never fabricates a capacity
 * refusal, which would need a verdict nobody has (ADR-0016).
 *
 * THE EMPTINESS TEST IS THE DESTRUCTURING, not a `length` check in front of it. Splitting head
 * from tail is what BUILDS the tuple the carrier needs, and `head === undefined` is exactly the
 * condition a `length === 0` check would have tested — so the two collapse into one branch that
 * is both reachable and the thing `tsc` narrows on. The alternative pairs a length guard with an
 * `as NonEmpty<string>` per list, which asserts the very fact the guard just established: I-04-4
 * one level down.
 */
export function orderCandidates(
  bays: readonly string[],
  technicians: readonly string[],
  seed: number,
): CandidateOrder | null {
  const next = mulberry32(seed);
  const [bayHead, ...bayTail] = shuffle(bays, next);
  const [technicianHead, ...technicianTail] = shuffle(technicians, next);
  if (bayHead === undefined || technicianHead === undefined) return null;

  const orderedBays: NonEmpty<string> = [bayHead, ...bayTail];
  const orderedTechnicians: NonEmpty<string> = [technicianHead, ...technicianTail];
  // The ONLY assertion is the brand. Both lists are non-empty tuples by the line above, which is
  // what the carrier was chosen for.
  return { bays: orderedBays, technicians: orderedTechnicians } as CandidateOrder;
}

/**
 * TOTAL — the head of each list. A `CandidateOrder` is non-empty by construction, so there is no
 * `undefined` to handle and no assertion to write.
 */
export function nextCandidate(order: CandidateOrder): Candidate {
  return { bayId: order.bays[0], technicianId: order.technicians[0] };
}

/**
 * Bound-2. Drops `id` from the named list and leaves the other untouched; `null` when the named
 * list emptied.
 *
 * THE WHOLE RESOURCE, NOT THE PAIR. A `23P01` on `bay_id` is a fact about the bay, not about the
 * pair that met it, so every candidate sharing that bay goes with it. That is what turns the
 * loop's bound from `|bays| x |technicians|` into `|bays| + |technicians| - 1`, and a prune that
 * removed only the pair would meet the same bay again behind a different technician.
 *
 * THE SURVIVORS KEEP THEIR ORDER. `filter` preserves it, and that is behaviour rather than an
 * accident of the implementation: a recorded seed labels a run, and a prune that reshuffled would
 * make that label unable to reproduce the run it names (ADR-0021).
 *
 * `resource` is the UNBRANDED union on purpose. A `ContendedResource` is an intersection with
 * `'bay' | 'technician'` and so is assignable to it: the application passes the value
 * `pgError.classify` minted straight in, with no cast at the call site and nothing branded
 * crossing back out.
 */
export function prune(
  order: CandidateOrder,
  resource: 'bay' | 'technician',
  id: string,
): CandidateOrder | null {
  const [head, ...tail] = (resource === 'bay' ? order.bays : order.technicians).filter(
    (candidate) => candidate !== id,
  );
  if (head === undefined) return null;

  const remaining: NonEmpty<string> = [head, ...tail];
  return (
    resource === 'bay'
      ? { bays: remaining, technicians: order.technicians }
      : { bays: order.bays, technicians: remaining }
  ) as CandidateOrder;
}
