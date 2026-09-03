# Prompt library

METHODOLOGY §9: *"Prompts are written **before** invocation to
`docs/team-log/prompts/<slice>-<agent>-<n>.md` with the report beside them, so the record cannot
drift from what ran; the prompt library is the primary evidence for* strategy for directing AI.*"*

## How these files get here

| File | Written by | When |
|---|---|---|
| `<scope>-<role>-<n>.md` | `.claude/hooks/capture-prompt.mjs` (`PreToolUse` on `Task`) | At invocation, before the agent runs |
| `<scope>-<role>-<n>.report.md` | `.claude/hooks/log-agent-finish.mjs` (`SubagentStop`) | When the agent returns, extracted from its transcript |

`<scope>` is `p<phase>` or `s<slice>`, read from `docs/team-log/.scope` — the same marker
`agent.finish` records use, so a prompt and its event always agree about which unit of work they
belong to.

Neither file is typed by hand. The prompt is captured as sent and the report is derived from the
transcript, so **neither can drift from what actually ran** — which is the whole point of keeping
them.

## Honest note on provenance

`p1-architect-1` and `p1-architect-2` were written by hand, before the hooks existed. Three further
prompts — `p2-architect-1`, `p2-architect-2` and `s00a-architect-1` — are **backfilled**: they were
sent during phases 2 and 4 while §9's rule depended on the orchestrator remembering to follow it,
and it did not. They are reproduced verbatim from the session transcript and are labelled as
backfilled in their own headers.

That gap is the reason the rule became a hook. A rule enforced only by discipline records nothing on
the day it matters, and the repository's own principle P3 — *executable beats asserted* — applies to
its own process as much as to the system it builds. From `s00a-architect-2` onward, capture is
mechanical.

Reports before that point were not captured at all; the two phase-2 reports are reproduced from the
session record and marked as such.
