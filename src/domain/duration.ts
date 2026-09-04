/**
 * How many minutes a service type occupies a bay and a technician for, and how those minutes
 * become the milliseconds `interval.ts` needs.
 *
 * NO IMPORTS. AC-6 is literal (docs/slices/01-design.md §2.0): this module may not import
 * `./interval.js` or `./openingHours.js`, and does not.
 *
 * A-1: duration is an attribute of the service type, not the request. `serviceDuration` is
 * the only constructor of `DurationMinutes` — everything downstream that needs a duration in
 * minutes takes this branded type, and the compiler forces the `null` branch to be handled at
 * every call site rather than trusting a bare number.
 */

/** Branded so a bare number cannot be passed where minutes are meant. */
export type DurationMinutes = number & { readonly __brand: 'DurationMinutes' };

/** The shape this module needs from a service type, and nothing more. */
export type ServiceTypeDuration = { readonly durationMinutes: number };

/**
 * THE ONLY CONSTRUCTOR of `DurationMinutes`. `duration_minutes` carries
 * `CHECK (duration_minutes > 0)` in the schema, but that constrains the database — this
 * function is handed a JavaScript number that has crossed a driver, a query builder and a row
 * mapper, so it re-asserts the same rule on a value it cannot trust. Returns `null` for
 * anything that is not a positive, finite integer number of minutes.
 */
export function serviceDuration(serviceType: ServiceTypeDuration): DurationMinutes | null {
  const { durationMinutes } = serviceType;
  return Number.isInteger(durationMinutes) && durationMinutes > 0
    ? (durationMinutes as DurationMinutes)
    : null;
}

/**
 * The only place in the system where minutes become milliseconds — AC-5's scan (§7.2) matches
 * the literal `60_000` and this definition, and nowhere else may either appear.
 */
export function durationMillis(duration: DurationMinutes): number {
  return duration * 60_000;
}
