# Prompt · phase 6 · architect · invocation 1

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Deployment diagram, shorten section 8
- Sent: 2026-09-09T07:53:34.912Z

---

Two work items in one pass, both arc42. No ADR — a missing figure and an editorial cut, no decisions change.

# Work item 1 — §7 has no diagram, and your own role definition says it should

`docs/arc42/07-deployment-view.md` contains two ASCII blocks and no figure. `.claude/agents/architect.md:87-89` lists the presentation diagrams as "architecture, sequence, data model, deployment" — deployment is named and was never drawn. Every other one in that list now exists. Draw it.

What the figure must carry, all of it already in §7.1 prose:

- **Three runtime pieces on one machine**, and the split that matters: `postgres:16` and `otel-lgtm` come up under `docker compose`, while the **scheduler runs on the HOST** via `npm start`. The service is deliberately *not* in compose — compose provides the *dependencies*, and `docker-compose.yml` says so in its own header so the two cannot drift. That boundary is the single most important thing in the drawing.
- **Ports**: scheduler `:3000`, OTLP `:4317`, Grafana `:3001`.
- **postgres is the correctness boundary, not a storage detail** — its `btree_gist` requirement (TC-3) rules out any managed offering that restricts extensions. Give it visual weight accordingly; it is not a generic database box.
- **otel-lgtm is optional at runtime** and must be drawn that way — a dashed or clearly secondary edge — because "its absence must not break the service": export failures are logged and dropped. A reader must be able to see that deleting that box leaves a working system.
- **No gateway, no TLS, no load balancer, no authentication** (GC-2), and therefore **unsafe to expose on any reachable network**. §7.1 states the two together deliberately, because the deployment is what makes the missing auth acceptable. Draw the trust boundary so that dependency is visible rather than merely written down; §11.3 carries the retrofit.
- The scheduler is **one stateless process, no clustering** — everything holding across requests holds in PostgreSQL.

§7.1's ASCII block becomes redundant once the figure is correct; delete it and keep the prose. §7.2's Testcontainers ASCII is a *different* topology (test-time substitution) — leave it alone, and do not draw a second figure for it in this pass.

Budget: §7 is at 766 words against a ceiling of `max(1500, 766)` = **1500**. Ample headroom; the caption costs nothing you need to recover.

# Work item 2 — shorten §8

The user's words: "Shorten the cross cutting concepts. Too many text." The file is 2,735 words across six subsections:

| § | Words |
|---|---|
| 8.1 Domain model | 430 |
| 8.2 Persistence and the exclusion constraint | 388 |
| 8.3 Time, zones and the calendar | 390 |
| 8.4 Observability | 559 |
| 8.5 Testability | 394 |
| 8.6 Error handling and API semantics | 621 |

**Cut duplication, not substance.** This is the same move that took METHODOLOGY from 5,307 to 3,999 — "removed every restatement of a CLAUDE.md rule and three cross-artifact duplications". Apply it here. Specific candidates, each of which you should verify before acting on:

- **§8.5's ownership table restates CLAUDE.md §5.** §8.5 opens "Ownership is fixed by path" and then lists owner-per-directory, which CLAUDE.md §5 already fixes as NON-NEGOTIABLE. arc42 does not need to re-state a constitutional rule; it needs the part only it has — *what each level is for* and the "a unit test may replace the driver, not what the database decides" boundary. Keep that; drop the restatement.
- **§8.5 also overlaps §7.2**, which covers the Testcontainers topology, the two Vitest projects and `run-tests.mjs`. Whichever section is the weaker home for a given fact, cut it there and leave one copy.
- **§8.6's operation table may duplicate the emitted contract.** §5.1 says the OpenAPI document "is *emitted* from the route schemas, so it cannot drift from the service". A hand-written table of endpoints and success codes in arc42 is a second copy that *can* drift, which is precisely the argument that removed §8.1's DDL last pass. Keep the parts that are reasoning — why `PATCH` for a move, why cancellation is a sub-resource rather than `DELETE` — and cut what merely restates the generated contract.
- **§8.6 may overlap §6.6's "Where each failure is decided" table.** Check; keep one.

**Protect these**, they are the reason the sections exist:
- §8.2 in full and byte-identical — its SQL is verbatim by requirement (CLAUDE.md §2.1).
- §8.4's `booking-trace` figure and the "what an operator does with this" paragraph. §8.4 is the largest block after §8.6 and was expanded one commit ago at the user's request; it may be tightened, but the figure and the operator content stay.
- §8.1's transitive-coverage reasoning (why three columns carry no foreign key and that is *complete rather than missing*).

**Ratchet arithmetic, and get this right.** §8's recorded baseline is **2,380** while the file is at 2,735 — it is *above* its own high-water mark. The ceiling is `max(4000, 2380)` = 4000, so the check passes either way; that is not the point. If your result lands **below 2,380**, run `npm run docs:budget -- --rebaseline` so the reduction is actually held — `budget.mjs` is explicit that "a ratchet that does not tighten is a ratchet with slack" and that an unrecorded reduction can grow back with the check green. If your result lands **above 2,380**, do **not** rebaseline: that would loosen the ratchet, which is the wrong direction. Report which case you are in and what you did.

# Constraints

1. Export any new diagram: `npm run diagram:export docs/diagrams/<file>.html`. Match the established house style and vocabulary across the existing nine figures — load the `diagram-design` skill. Coral means SQLSTATE `23P01` across this set and nothing else may take it; a deployment diagram probably needs no coral at all.
2. Touch only `docs/arc42/07-deployment-view.md`, `docs/arc42/08-crosscutting-concepts.md`, and new files in `docs/diagrams/`. No `src/`, no `tests/`, no `CLAUDE.md`, no ADR, no team-log write.
3. **Do not commit.** Leave everything in the working tree; I will review and commit.
4. Run and report: `npm run docs:budget:check`, `npm run docs:refs`, `npm run docs:check`. If `docs:check` reports `system-design.md` stale, run `npm run docs:build` — no other agent is working in this tree right now, so it is safe this time.

Report: the figure and what it draws; a before/after word count per subsection; every cut with the duplicate it resolved and where the surviving copy lives; the rebaseline decision and why; and anything you judged too load-bearing to cut despite looking redundant.
