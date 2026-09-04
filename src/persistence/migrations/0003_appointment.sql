-- Up Migration
--
-- Slice 00 · arc42 §8.1 and §8.2 · CLAUDE.md §2.1 (NON-NEGOTIABLE).
--
-- THE ONE TABLE THE API WRITES, AND THE ONE ARTIFACT THE SUBMISSION RESTS ON. Requirement 2
-- has two halves and neither is left to application care: "a QUALIFIED technician" is
-- `appointment_technician_qualified`; "AVAILABLE for the entire duration" is the two
-- exclusion constraints below.
--
-- SEVEN NAMED CONSTRAINTS, AND EXACTLY SEVEN. `dealership_id`, `service_type_id` and
-- `customer_id` deliberately carry NO standalone reference: each is covered transitively by a
-- composite (design §6.2). Adding the singleton foreign keys for tidiness would be redundant
-- AND would make the REPORTED constraint non-deterministic when two are violable at once —
-- which is what slice 03 maps `422 /problems/unknown-reference` from, by name.

CREATE TYPE appointment_status AS ENUM ('confirmed', 'cancelled');

CREATE TABLE appointment (
  id              uuid PRIMARY KEY,
  dealership_id   uuid NOT NULL,
  customer_id     uuid NOT NULL,
  vehicle_id      uuid NOT NULL,
  service_type_id uuid NOT NULL,
  technician_id   uuid NOT NULL,
  bay_id          uuid NOT NULL,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  status          appointment_status NOT NULL DEFAULT 'confirmed',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT appointment_interval_ordered CHECK (ends_at > starts_at),

  -- Requirement 2, first half: the technician is QUALIFIED for this service type.
  CONSTRAINT appointment_technician_qualified
    FOREIGN KEY (technician_id, service_type_id)
    REFERENCES technician_qualification (technician_id, service_type_id),

  -- A-9: resources belong to the appointment's dealership. Never spans dealerships.
  CONSTRAINT appointment_bay_in_dealership
    FOREIGN KEY (bay_id, dealership_id)        REFERENCES service_bay (id, dealership_id),
  CONSTRAINT appointment_technician_in_dealership
    FOREIGN KEY (technician_id, dealership_id) REFERENCES technician  (id, dealership_id),

  -- A-6 / ADR-0002: the vehicle belongs to the named customer. Validation, not authorisation.
  CONSTRAINT appointment_vehicle_owned_by_customer
    FOREIGN KEY (vehicle_id, customer_id)      REFERENCES vehicle     (id, customer_id)
);

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Reproduced VERBATIM from CLAUDE.md §2.1 and arc42 §8.2, unaltered. Paraphrasing the one
-- thing that must be exactly right is how it stops being exactly right.
--
-- EXCLUDE USING gist, not a UNIQUE index and not a trigger. A unique index forbids two rows
-- from being EQUAL; it cannot forbid two rows from OVERLAPPING, because overlap is not an
-- equivalence. A trigger could compute overlap — but a trigger is check-then-act with the
-- check moved inside the database: it reads other rows, and two concurrent triggers under
-- READ COMMITTED both read "free". An exclusion constraint is enforced by the index insertion
-- itself, which serialises on the index page, so the second writer blocks and then fails.
--
-- `bay_id WITH =` is why 0001 exists: GiST has no built-in opclass for uuid; btree_gist
-- supplies `gist_uuid_ops`.
--
-- `tstzrange(a, b)` defaults to `[)`, so [09:00, 10:00) and [10:00, 11:00) do NOT overlap and
-- back-to-back work in one bay is legal — A-4 expressed as a bound rather than as prose.
--
-- `WHERE (status <> 'cancelled')` is a DENYLIST, and that is the safe direction: a status
-- added later (`no_show`, `in_progress`) is automatically INSIDE the constraint's scope and
-- occupies its slot. A `= 'confirmed'` allowlist would have made a new status silently
-- non-occupying, which is a double-booking nobody wrote.
--
-- The NAMES are behaviour: `err.constraint` is what ADR-0009 prunes on and what labels
-- `booking_conflicts_total{resource}`. Renaming one is a behaviour change.
-- ─────────────────────────────────────────────────────────────────────────────────────────

ALTER TABLE appointment ADD CONSTRAINT no_bay_overlap
  EXCLUDE USING gist (bay_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');

ALTER TABLE appointment ADD CONSTRAINT no_technician_overlap
  EXCLUDE USING gist (technician_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');

-- Down Migration
--
-- The table first, then the type it depends on. Dropping the table drops its constraints and
-- the two partial GiST indexes with it, which is what lets 0001 then drop the extension.

DROP TABLE appointment;
DROP TYPE appointment_status;
