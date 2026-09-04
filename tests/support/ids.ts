/**
 * Derived fixture identifiers — test-engineer's, slice 00 step 3.
 *
 * ADR-0012 and docs/slices/00-design.md §3.4. Ids are DERIVED, not random and not literal:
 * `uuidFor(namespace, name)` is a pure function of the case's own name, so two cases get
 * disjoint subtrees and the same failure names the same UUID on every run and in every log.
 *
 * The reason this is not a taste question, restated here because it is the only place a
 * maintainer will look before "simplifying" it to `randomUUID()`: the suite isolates by data
 * with NO cleanup (§3.2), so rows from all ten cases sit in one table for the life of the
 * run. When a count assertion fails, the ids in the message are the only thing that says
 * which rows were the case's own — and a random id says nothing, is not recomputable
 * offline, and differs on every run. `randomUUID()` is not an acceptable fallback here.
 *
 * This file imports nothing from src/ and nothing outside node: builtins
 * (`outside-in-tests-do-not-import-src` covers tests/support/).
 */
import { createHash } from 'node:crypto';

function digest(namespace: string, name: string): Buffer {
  return createHash('sha1').update(`${namespace}/${name}`).digest();
}

/**
 * A UUID that is a pure function of `${namespace}/${name}`.
 *
 * SHA-1 truncated to sixteen bytes with the version (5, name-based SHA-1) and RFC 4122
 * variant nibbles set, so PostgreSQL's `uuid` type accepts it and `pg` round-trips it
 * unchanged. Not a real RFC 4122 v5 UUID — that would hash a namespace UUID rather than a
 * string — and nothing here depends on it being one.
 */
export function uuidFor(namespace: string, name: string): string {
  const bytes = digest(namespace, name).subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * A VIN that is a pure function of `${namespace}/${name}`.
 *
 * `vehicle.vin` carries a GLOBAL `UNIQUE` (arc42 §8.1) and `vehicle` is one of the three
 * reference tables that is NOT dealership-scoped (§3.5), so every case's vehicles land in
 * the same table side by side. Two cases seeding a literal VIN would collide with `23505`.
 *
 * Seventeen uppercase hex characters. A real VIN excludes I, O and Q to avoid confusion
 * with 1 and 0; hex uppercases to 0-9 and A-F, so the exclusion is satisfied for free.
 */
export function vinFor(namespace: string, name: string): string {
  return digest(namespace, name).toString('hex').toUpperCase().slice(0, 17);
}
