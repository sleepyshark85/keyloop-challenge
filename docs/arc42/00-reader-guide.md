# Reader's guide

This is the architecture documentation for the Keyloop service scheduler, following
[arc42](https://arc42.org) (CC BY-SA). All twelve standard sections are retained; several are
deliberately thin and say why. One section is added outside the standard twelve: **§13 AI
Collaboration**.

**If you are assessing this submission** — §1 goals, §4 solution strategy, §9 decisions,
§11 risks and debt, §13 AI collaboration.
**If you are implementing** — §5 building blocks, §8 cross-cutting concepts, §10 quality scenarios.
**If you are operating it** — §7 deployment, §8 observability.

## How to read the quality scenarios

§10 numbers each scenario `QS-n`, and every one names the test that enforces it. The chain

```
§10 quality scenario → slice acceptance criterion → test name → CI result
```

is walkable in both directions, and CI fails if a `QS-*` names a test that does not exist. A quality
attribute that cannot be traced to a test is aspiration.

## As-designed versus as-built

This document was written as-designed at the architecture gate and corrected to as-built at each
slice merge. The difference is preserved on purpose: where the plan was wrong is worth more than a
plan that reads as though it never was. §11 and §13 discuss the material deltas.

*Sections are maintained as separate files under `docs/arc42/`; `docs/system-design.md` is generated
from them by `npm run docs:build`. Edit the sections, never the generated file.*
