# Reader's guide

Architecture documentation for the Keyloop service scheduler, following [arc42](https://arc42.org)
(CC BY-SA). All twelve standard sections are retained; several are deliberately thin and say why.
**§13 AI Collaboration** is added outside the standard twelve.

## What the brief asks for, and where it is

The assessment's Part 1 asks a System Design Document for six things:

| The brief asks for | It is in |
|---|---|
| An architecture diagram | §5.1 (containers and modules), §6.1 (the concurrent-booking sequence) |
| A brief description of each component's role | §5.1, §5.2 |
| An explanation of the data flow | §6.1–§6.6 |
| A list of chosen technologies with justifications | §4.2, and §2.2 for what was imposed rather than chosen |
| A strategy for observability | §8.4 — spans, metrics, logs |
| How GenAI assisted the design | §13, and `README.md` for the collaboration narrative |

Part 2's *"scalability, performance, reliability, maintainability, observability"* are §1.2's ranked
quality goals, made executable as §10's scenarios and costed in §11.

**The one thing to read if you read one thing: §4.1.** Double-booking is prevented by a PostgreSQL
exclusion constraint rather than by application code. §8.2 is the constraint itself, §6.1 the race it
decides.

## How to read the quality scenarios

§10 numbers each scenario `QS-n` and names the test that enforces it, so
`§10 scenario → slice acceptance criterion → test name → CI result` is walkable both ways. A quality
attribute that cannot be traced to a test is aspiration.

## As-designed versus as-built

Written as-designed at the architecture gate and corrected to as-built at each slice merge. The
difference is preserved on purpose; §11 and §13 discuss the material deltas.

*Sections are separate files under `docs/arc42/`; `docs/system-design.md` is generated from them by
`npm run docs:build`. Edit the sections, never the generated file.*
