import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { Client } from 'pg';
import { uuidFor } from '../support/ids.js';
import { startService } from '../support/service.js';
import type { StartedService } from '../support/service.js';
import {
  at,
  bookingBody,
  describeAnswer,
  describeScenario,
  isoAt,
  member,
  occupy,
  postBooking,
  postReschedule,
  seedScenario,
} from '../support/booking.js';

/**
 * Slice 06 — AC-2, made falsifiable: "exactly one statement modified it" is not "the
 * reviewer looked", it is TWO audit triggers, installed and dropped by this test.
 *
 * `docs/slices/06-reschedule-atomic-move.md` AC-2 · `docs/slices/06-design.md` §2.3 ·
 * ADR-0025 decision 3 · CLAUDE.md §2.2, §5.
 *
 * WHOSE FILE THIS IS. `CLAUDE.md` §5 gives database-invariant `tests/integration/` tests to
 * the test-engineer. This file imports no `src/` module — it reaches the database only
 * through a connection string and reaches the application only over HTTP.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * TWO TRIGGERS, ONE SCRATCH TABLE, TWO DIFFERENT JOBS.
 *
 *   ROW-LEVEL      `AFTER INSERT OR UPDATE OR DELETE ... FOR EACH ROW`, recording `TG_OP`,
 *                  the row's own id (`case TG_OP when 'DELETE' then OLD.id else NEW.id end` —
 *                  not `coalesce(NEW.id, OLD.id)`, which evaluates `NEW.id` unconditionally
 *                  and so raises "record NEW is not assigned yet" on every `DELETE`; `CASE`
 *                  evaluates only the matching branch), `txid_current()` and
 *                  `statement_timestamp()`. It fires once per ROW a statement actually
 *                  touches, so filtering by `appointment_id` gives an EXACT, concurrency-safe
 *                  count of how many statements touched THIS test's own row — ids are unique
 *                  per case (`uuidFor`/`occupy`), so no other file's traffic can appear under
 *                  this filter. This is what makes "exactly one UPDATE" falsifiable: a
 *                  DELETE-then-INSERT-same-id, a cancel-then-book, or a clear-then-set would
 *                  each leave TWO rows here instead of one.
 *
 *   STATEMENT-LEVEL `AFTER UPDATE ... REFERENCING NEW TABLE AS changed ... FOR EACH
 *                  STATEMENT`, recording `TG_LEVEL`, `txid_current()`, `statement_timestamp()`
 *                  and `(select count(*) from changed)` as `affected`. This is the ONLY
 *                  instrument that can see a ZERO-ROW `UPDATE` at all — a `FOR EACH ROW`
 *                  trigger does not fire when no row matches, so it is structurally blind to
 *                  exactly the case ADR-0025 turns on. It has no `NEW` to filter by id.
 *
 * **THE DISCRIMINATOR FOR THE UNKNOWN-ID CASE IS A STATEMENT-LEVEL ROW WITH `affected = 0`,
 * NOT A COUNT OF FIRINGS.** `vitest.config.ts`'s `db` project runs this file alongside five
 * other directories against ONE container on ONE `databaseUrl`, with no `fileParallelism:
 * false` — so while these triggers are installed, ANY concurrent file's legitimate `UPDATE`
 * on `appointment` also fires the statement-level trigger. Asserting "zero firings" would be
 * flaky in the direction of FALSE FAILURES. A legitimate `UPDATE` always matches at least the
 * row it targets (`affected >= 1`); the ONLY way `affected = 0` appears is a statement issued
 * against a row that turned out not to satisfy its own `WHERE` — which is precisely
 * ADR-0025's rejected Option A (an unconditional `UPDATE ... WHERE id = $1`, issued even for
 * an unknown id) and precisely what the chosen Option C must never do.
 *
 * **RESIDUAL, MEASURED RATHER THAN ASSUMED (reported alongside this red commit).** The
 * argument above is airtight against ORDINARY traffic — a booking, a cancellation, a move
 * that succeeds — because every one of those `UPDATE`s matches the row it names. It is NOT
 * airtight against this SAME slice's OTHER `409 appointment-not-confirmed` case
 * (`tests/acceptance/reschedule-appointment.test.ts`): under ADR-0025 decision 2, moving a
 * CANCELLED appointment reaches the guarded `UPDATE` and receives a LEGITIMATE zero-row
 * result — the same shape as Option A's defect, for a different and correct reason. If that
 * case's request executes while THIS test's triggers are installed and its own zero-row
 * `UPDATE` lands inside the time window asserted below, this test could see an `affected = 0`
 * row that has nothing to do with the unknown-id request it is about. The window is narrowed
 * to bound this (captured immediately around the one HTTP call under test, not the whole
 * file), which makes the false-failure probability small rather than zero; it is not
 * eliminated, because nothing this file can observe distinguishes "an unknown id, wrongly
 * updated anyway" from "a real id, legitimately not confirmed" once affected is 0 with no
 * surviving row to name. Recorded here rather than discovered at review.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * REJECTED INSTRUMENTS, and why (design §2.3, independently confirmed here):
 * `pg_stat_user_tables` is table-wide and stats-collector-lagged, so it would flake against a
 * container shared with five other directories; `xmin` advances per TRANSACTION, not per
 * statement, and cannot count to two.
 */

async function withService<T>(
  run: (service: StartedService) => Promise<T>,
): Promise<T | undefined> {
  const attempt = await startService({ databaseUrl: inject('databaseUrl') });
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

interface RowAuditRow {
  readonly level: 'ROW';
  readonly op: string;
  readonly appointmentId: string | null;
  readonly txid: string;
  readonly ts: string;
}

interface StatementAuditRow {
  readonly level: 'STATEMENT';
  readonly op: string;
  readonly txid: string;
  readonly ts: string;
  readonly affected: number | null;
}

async function rowAuditFor(client: Client, appointmentId: string): Promise<readonly RowAuditRow[]> {
  const { rows } = await client.query<{
    op: string;
    appointment_id: string | null;
    txid: string;
    ts: string;
  }>(
    `select op, appointment_id, txid::text as txid, ts::text as ts
       from _reschedule_audit
      where level = 'ROW' and appointment_id = $1
      order by id`,
    [appointmentId],
  );
  return rows.map((r) => ({
    level: 'ROW' as const,
    op: r.op,
    appointmentId: r.appointment_id,
    txid: r.txid,
    ts: r.ts,
  }));
}

async function statementAuditInWindow(
  client: Client,
  fromTs: string,
  toTs: string,
): Promise<readonly StatementAuditRow[]> {
  const { rows } = await client.query<{
    op: string;
    txid: string;
    ts: string;
    affected: number | null;
  }>(
    `select op, txid::text as txid, ts::text as ts, affected
       from _reschedule_audit
      where level = 'STATEMENT' and ts between $1 and $2
      order by id`,
    [fromTs, toTs],
  );
  return rows.map((r) => ({
    level: 'STATEMENT' as const,
    op: r.op,
    txid: r.txid,
    ts: r.ts,
    affected: r.affected,
  }));
}

async function clock(client: Client): Promise<string> {
  const { rows } = await client.query<{ ts: string }>('select clock_timestamp()::text as ts');
  return rows[0]?.ts as string;
}

describe('slice 06 — AC-2: the audit triggers, installed and dropped by this test', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('databaseUrl') });
    await client.connect();

    await client.query(`
      create table if not exists _reschedule_audit (
        id             serial primary key,
        level          text not null check (level in ('ROW', 'STATEMENT')),
        op             text not null,
        appointment_id uuid,
        txid           bigint not null,
        ts             timestamptz not null,
        affected       integer
      )
    `);

    // CASE, not coalesce(NEW.id, OLD.id): PL/pgSQL raises "record NEW/OLD is not assigned
    // yet" the moment an unassigned side is EVALUATED, and coalesce's short-circuiting still
    // evaluates its first argument (NEW.id) to test it for null — which would fire on every
    // DELETE. CASE evaluates only the matching branch, so the wrong side is never touched.
    await client.query(`
      create or replace function _reschedule_audit_row_fn() returns trigger
      language plpgsql as $$
      begin
        insert into _reschedule_audit (level, op, appointment_id, txid, ts)
        values (
          'ROW', TG_OP,
          case TG_OP when 'DELETE' then OLD.id else NEW.id end,
          txid_current(), statement_timestamp()
        );
        return null;
      end;
      $$
    `);
    await client.query('drop trigger if exists _reschedule_audit_row_trg on appointment');
    await client.query(`
      create trigger _reschedule_audit_row_trg
        after insert or update or delete on appointment
        for each row execute function _reschedule_audit_row_fn()
    `);

    await client.query(`
      create or replace function _reschedule_audit_stmt_fn() returns trigger
      language plpgsql as $$
      begin
        insert into _reschedule_audit (level, op, txid, ts, affected)
        values ('STATEMENT', TG_OP, txid_current(), statement_timestamp(),
                (select count(*)::integer from changed));
        return null;
      end;
      $$
    `);
    await client.query('drop trigger if exists _reschedule_audit_stmt_trg on appointment');
    await client.query(`
      create trigger _reschedule_audit_stmt_trg
        after update on appointment
        referencing new table as changed
        for each statement execute function _reschedule_audit_stmt_fn()
    `);
  });

  beforeEach(async () => {
    // Each case starts from an empty table: the ROW-level claims below are filtered by a
    // unique appointment id regardless (concurrency-safe on their own), but the STATEMENT-
    // level claim needs the table free of this suite's OWN prior inserts so the time window
    // it reads is as narrow as it can be.
    await client.query('truncate table _reschedule_audit');
  });

  afterAll(async () => {
    await client.query('drop trigger if exists _reschedule_audit_row_trg on appointment');
    await client.query('drop trigger if exists _reschedule_audit_stmt_trg on appointment');
    await client.query('drop function if exists _reschedule_audit_row_fn()');
    await client.query('drop function if exists _reschedule_audit_stmt_fn()');
    await client.query('drop table if exists _reschedule_audit');
    await client?.end();
  });

  it('AC-2 — a plain reschedule touches the row through EXACTLY ONE statement, an UPDATE', async () => {
    const scenario = await seedScenario(client, 'ac2-plain-move', { bays: 1, technicians: 1 });
    const where = `\n${describeScenario(scenario)}`;

    await withService(async (service) => {
      const booked = await postBooking(service, bookingBody(scenario));
      expect(booked.status, `ARRANGE — A was not booked.${where}`).toBe(201);
      const id = String(member(booked, 'id'));

      const from = await clock(client);
      const answer = await postReschedule(service, id, isoAt(30));
      const to = await clock(client);
      expect(answer.status, `ARRANGE — the move did not succeed.\n${describeAnswer(answer)}${where}`).toBe(
        200,
      );

      const rowAudit = await rowAuditFor(client, id);
      expect(
        rowAudit.map((r) => r.op),
        `AC-2 — EXACTLY ONE row-level firing for this id, and it must be an UPDATE. A ` +
          `DELETE-then-INSERT (same id), a cancel-then-book, or a clear-then-set each leave ` +
          `TWO rows here instead of one.${where}`,
      ).toEqual(['UPDATE']);

      const stmtAudit = await statementAuditInWindow(client, from, to);
      const forThisMove = stmtAudit.filter((r) => r.affected !== null && r.affected >= 1);
      expect(
        forThisMove.length,
        `AC-2 — the statement-level trigger must ALSO see one UPDATE with affected >= 1 in ` +
          `the request's own time window (self-test of the instrument itself: a DELETE-then-` +
          `INSERT would leave NOTHING here, since this trigger fires only on UPDATE).${where}`,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it('AC-2 / T-06-3 — a discarded candidate leaves no residue: the SUCCESSFUL move is still exactly one statement', async () => {
    // Reuses the AC-1 bay-control fixture verbatim (design §2.3): the original slot
    // contends, forcing ADR-0027's loop to try a second candidate. If a failed attempt's
    // UPDATE left a row here, the count below would be 2 instead of 1 — and design §2.3
    // argues it cannot, because the exclusion constraint raises 23P01 before that
    // attempt's OWN row triggers fire at end of statement, and the write rolls back with
    // the attempt's savepoint (ADR-0004) regardless.
    const scenario = await seedScenario(client, 'ac2-discarded-candidate', {
      bays: 2,
      technicians: 2,
    });
    const where = `\n${describeScenario(scenario)}`;
    const [bay1] = scenario.bayIds as readonly [string, string];
    const [tech1, tech2] = scenario.technicianIds as readonly [string, string];

    const aId = await occupy(client, scenario, {
      label: 'a',
      bayId: bay1,
      technicianId: tech1,
      startsAt: at(0),
      endsAt: at(60),
    });
    // C's interval starts at A's CURRENT end (`at(60)`), not at the target's own start: A
    // still physically occupies bay1 over `[0,60)` until it moves, so C's own insert must
    // not overlap that — `[60,75)` overlaps the TARGET `[15,75)` without ever overlapping A's
    // prior interval (`tests/integration/reschedule-self-overlap.test.ts`'s bay control).
    await occupy(client, scenario, {
      label: 'c',
      bayId: bay1,
      technicianId: tech2,
      startsAt: at(60),
      endsAt: at(75),
    });

    await withService(async (service) => {
      const answer = await postReschedule(service, aId, isoAt(15));
      expect(
        answer.status,
        `ARRANGE — the move must succeed by re-allocation after the first candidate is ` +
          `refused.\n${describeAnswer(answer)}${where}`,
      ).toBe(200);

      const rowAudit = await rowAuditFor(client, aId);
      expect(
        rowAudit.map((r) => r.op),
        `AC-2 / T-06-3 — the discarded first attempt must leave NO row here at all; only the ` +
          `successful attempt's UPDATE may.${where}`,
      ).toEqual(['UPDATE']);
    });
  });

  // DECLARED, NOT DISCOVERED: this case is GREEN AT THE RED COMMIT, for a reason that is not
  // yet its own claim. Before the route exists, `PATCH /appointments/{id}` 404s for EVERY
  // id — Fastify's own not-found, not ADR-0025's read — so "404, and no audit row at all"
  // is trivially true of a route that never runs. It becomes evidence about ADR-0025 the
  // moment the route exists and this same assertion still holds; the negative half above
  // (unrelated to routing: this file's `AC-2` and `AC-2 / T-06-3` cases, which fail HERE
  // because the route is absent) is what proves the red commit is not vacuous overall.
  it('AC-2 / ADR-0025 decision 3 — an unknown id issues no guarded UPDATE at all: no affected-0 statement row appears', async () => {
    const unknownId = uuidFor('ac2-unknown-id', 'never-booked');

    await withService(async (service) => {
      const from = await clock(client);
      const answer = await postReschedule(service, unknownId, isoAt(60));
      const to = await clock(client);
      expect(answer.status, describeAnswer(answer)).toBe(404);

      const rowAudit = await rowAuditFor(client, unknownId);
      expect(
        rowAudit,
        'a row-level trigger cannot fire for an id that never had a row to touch',
      ).toEqual([]);

      const stmtAudit = await statementAuditInWindow(client, from, to);
      const zeroRow = stmtAudit.filter((r) => r.affected === 0);
      expect(
        zeroRow,
        `AC-2 / ADR-0025 — ADR-0025's chosen Option C decides 404 from the READ, before the ` +
          `guarded UPDATE is ever issued, so no statement-level row can appear at all for this ` +
          `id — let alone one with affected = 0. Rejected Option A issues the UPDATE ` +
          `unconditionally and would leave exactly one such row. See this file's header for ` +
          `the residual: this predicate is sound against ordinary traffic but not against a ` +
          `concurrent AC-4 (appointment-not-confirmed) request landing in this same narrow ` +
          `window, which legitimately produces the identical shape for a different reason.\n` +
          JSON.stringify(zeroRow),
      ).toEqual([]);
    });
  });
});
