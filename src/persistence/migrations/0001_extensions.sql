-- Up Migration
--
-- Slice 00 · arc42 §8.1 · CLAUDE.md §2.1 (NON-NEGOTIABLE) · TC-3.
--
-- ALONE IN A FILE ON PURPOSE: the only statement in the corpus that can fail for an
-- ENVIRONMENT reason — postgresql-contrib absent, or the role lacking privilege — rather than
-- a schema reason. Alone, that failure names itself. It must precede 0003;
-- `node-pg-migrate` sorts the directory listing, so the dependency is satisfied by the
-- numbering and by NOTHING ELSE.
--
-- `IF NOT EXISTS` appears here and nowhere else in the corpus. Idempotence is the runner's
-- job — `pgmigrations` is the gate, and a second run applies nothing. This line is VERBATIM
-- from CLAUDE.md §2.1 and is not edited for consistency's sake.

CREATE EXTENSION IF NOT EXISTS btree_gist;      -- TC-3: gist over (uuid =, tstzrange &&)

-- Down Migration
--
-- Reviewable as a reversible change; not part of any recovery story (ADR-0007). Last down,
-- because 0003's GiST indexes depend on this extension.

DROP EXTENSION btree_gist;
