# 12. Glossary

> Owner: scribe · Written: phase 6

Domain terms only. Process vocabulary lives in `docs/METHODOLOGY.md`.

| Term | Meaning |
|---|---|
| Service bay | A physical workspace at a dealership; a booking occupies exactly one for its duration |
| Technician | A person qualified for particular service types |
| Service type | A category of work with an expected duration and required qualification |
| Appointment | The persisted record binding customer, vehicle, technician, bay and interval |
| Instant | A point on the absolute timeline. Stored as `timestamptz`, carried in the domain as epoch milliseconds, and rendered exactly one way in any given zone (A-8) |
| Appointment interval | The half-open span `[startsAt, endsAt)` derived from a requested start and the service type's duration. The customer-facing interval (AC-1, A-1) |
| Occupancy interval | The span the exclusion constraint compares. Today identical to the appointment interval, and that identity **is** the statement that there is no buffer between jobs (A-4) |
| Local rendering | An instant expressed as a wall-clock date, time and weekday in a dealership's IANA zone. The conversion runs this way only, never the reverse (§8.3) |
| Opening hours | Per dealership and per day of week, in the dealership's local wall clock. **A day with no row is a closed day**, not an unbounded one (AC-4) |
| Closed day | A weekday for which a dealership has no `opening_hours` row; represented in the domain as `null` in the weekly tuple |
| Absolute duration | Minutes added on the timeline, not on the wall clock. Sixty minutes from 00:30 local on a spring-forward night ends at 02:30 local (AC-3) |
| Wall-clock duration | What a clock on the wall shows between two instants. Differs from the absolute duration across a DST transition, and is **not** what occupies a bay |
| Ambiguous local time | A wall-clock time that occurs twice, on a fall-back night. Ambiguous only for local → instant; this system never performs that conversion (§8.3) |

*The twelve domain terms below the first four were proposed in `docs/slices/01-design.md` §12.1 and
applied by the architect at slice 01 step 7, under that slice's declared arc42 scope — slice 01 is
where those concepts entered the system, and a glossary that omitted them would have been stale from
the merge onward. The section's owner is the scribe and the phase-6 pass is theirs; these entries are
as-built records, not a claim on the section.*
