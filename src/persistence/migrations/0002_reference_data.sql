-- Up Migration
--
-- Slice 00 · arc42 §8.1, the eight relations the API never writes.
--
-- A-7 draws this line and makes it durable rather than cosmetic: this is the half of the
-- schema that arrives by migration and fixture, never by request. `appointment` — the one
-- table the API writes — is 0003, so a reader who wants the invariant opens one file and
-- finds nothing else in it.
--
-- No `IF NOT EXISTS` on any table: it would convert "this database is in a state the
-- migration did not expect" from a loud failure into a silent pass.

CREATE TABLE dealership (
  id         uuid PRIMARY KEY,
  name       text NOT NULL,
  time_zone  text NOT NULL              -- IANA, e.g. 'Europe/London'  (ADR-0001, A-8)
);

CREATE TABLE opening_hours (             -- a day with no row is a day the dealership is closed
  dealership_id uuid     NOT NULL REFERENCES dealership (id),
  day_of_week   smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),   -- 0 = Sunday
  opens_at      time     NOT NULL,
  closes_at     time     NOT NULL,
  PRIMARY KEY (dealership_id, day_of_week),
  CHECK (closes_at > opens_at)
);

CREATE TABLE service_type (
  id               uuid    PRIMARY KEY,
  name             text    NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0)         -- A-1
);

CREATE TABLE service_bay (
  id            uuid PRIMARY KEY,
  dealership_id uuid NOT NULL REFERENCES dealership (id),
  name          text NOT NULL,
  UNIQUE (id, dealership_id)             -- target for appointment's composite FK  (A-9)
);

CREATE TABLE technician (
  id            uuid PRIMARY KEY,
  dealership_id uuid NOT NULL REFERENCES dealership (id),                -- A-3
  name          text NOT NULL,
  UNIQUE (id, dealership_id)
);

CREATE TABLE technician_qualification (
  technician_id   uuid NOT NULL REFERENCES technician (id),
  service_type_id uuid NOT NULL REFERENCES service_type (id),
  PRIMARY KEY (technician_id, service_type_id)
);

CREATE TABLE customer (
  id uuid PRIMARY KEY, name text NOT NULL
);

CREATE TABLE vehicle (
  id          uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customer (id),                    -- A-6: one owner
  vin         text NOT NULL UNIQUE,
  description text NOT NULL,
  UNIQUE (id, customer_id)
);

-- Down Migration
--
-- CHILD-FIRST, so every reference is gone before its target. No CASCADE anywhere: a CASCADE
-- would drop whatever this order got wrong instead of failing on it, which is the same defeat
-- as an `IF NOT EXISTS`.

DROP TABLE vehicle;
DROP TABLE customer;
DROP TABLE technician_qualification;
DROP TABLE technician;
DROP TABLE service_bay;
DROP TABLE service_type;
DROP TABLE opening_hours;
DROP TABLE dealership;
