# 12. Glossary

> Owner: scribe · Written: phase 6

Domain terms only. Process vocabulary lives in `docs/METHODOLOGY.md`.

| Term | Meaning |
|---|---|
| Service bay | A physical workspace at a dealership; a booking occupies exactly one for its duration |
| Technician | A person qualified for particular service types |
| Service type | A category of work with an expected duration and required qualification |
| Appointment | The persisted record binding customer, vehicle, technician, bay and interval |
| Instant | A point on the absolute timeline. Stored as `timestamptz`, carried in the domain as epoch milliseconds, rendered exactly one way in any given zone (A-8) |
| Appointment interval | The half-open span `[startsAt, endsAt)` derived from a requested start and the service type's duration (A-1) |
| Occupancy interval | The span the exclusion constraint compares. Identical to the appointment interval today, and that identity **is** the statement that there is no buffer between jobs (A-4) |
| Local rendering | An instant expressed as a wall-clock date, time and weekday in a dealership's IANA zone. The conversion runs this way only, never the reverse (§8.3) |
| Opening hours | Per dealership and per day of week, in local wall clock. **A day with no row is a closed day**, not an unbounded one |
| Closed day | A weekday with no `opening_hours` row; `null` in the domain's weekly tuple |
| Absolute duration | Minutes added on the timeline, not on the wall clock. Sixty minutes from 00:30 local on a spring-forward night ends at 02:30 local |
| Wall-clock duration | What a clock on the wall shows between two instants. Differs from the absolute duration across a DST transition, and is **not** what occupies a bay |
| Ambiguous local time | A wall-clock time occurring twice, on a fall-back night. Ambiguous only for local → instant, which this system never performs (§8.3) |
| Actor | The caller of the API. Deliberately unnamed: the brief says only *"a user"*, and a stubbed client cannot authenticate anyone in particular (ADR-0034) |
| Candidate | A (bay, technician) pair considered for one booking attempt. Ordering is a pure function of the candidate set and a seed (ADR-0009) |
| Attempt cap | The bound on how many candidates a booking tries before refusing for capacity — pruning drops a whole resource per conflict, not one pair at a time (ADR-0009) |
| Contended resource | The bay or technician a `409` names, constructible only from a `23P01` the database actually raised (ADR-0016) |
| Move | This system's term for a reschedule: one atomic, conditional `UPDATE` adjudicating both the pair a booking takes and the pair it leaves (ADR-0025, ADR-0030) |
