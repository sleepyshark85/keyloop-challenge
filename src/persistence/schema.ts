/**
 * The Kysely database schema — EMPTY in slice 00a, and deliberately so.
 *
 * This is the slice's one concession to a future need, and it is load-bearing:
 * `Kysely<Database>` needs the type parameter, so `src/persistence/db.ts` cannot export
 * its `Db` alias without it. Slice 00 populates the interface from the migrations it adds
 * (ADR-0006); nothing before then has a table to name.
 *
 * There is no data model in 00a — docs/slices/00a-walking-skeleton.md puts "any migration,
 * table or domain type" explicitly out of scope — so an interface with a speculative
 * `appointment` member here would be a data-model delta smuggled in as a type declaration.
 */

export interface Database {}
