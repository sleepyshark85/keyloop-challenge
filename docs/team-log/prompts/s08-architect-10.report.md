# Report · slice 08 · architect · invocation 10

Extracted from the agent transcript by `.claude/hooks/log-agent-finish.mjs`.
This is the report **as returned** — it is derived, not retyped, so it cannot drift.

- Task: Unname the actor across the project
- Returned: 2026-09-07T14:05:12.307Z
- Duration: 564s

---

Done. Pushed to `chore/adr-readability` (`070da47`), comment on PR #19.

## The new ADR

**ADR-0034** — `/home/agentadmin/sources/keyloop-challenge/docs/adr/0034-the-caller-is-a-user-and-the-system-does-not-name-the-role.md`. Number 0034 because 0001–0033 are all burned: the 17 retired ADRs left `adr.retired` records in the append-only log at 0011–0015, 0017, 0020–0023, 0026–0029, 0031–0033.

**How the trust decision is framed without the role.** ADR-0002's own sentence — *"a control built against a stubbed client would be unverifiable theatre"* — is promoted from a supporting clause to the load-bearing one. The premise it rests on is **the client layer being stubbed by constraint**, which is a fact about what was built rather than an inference about who uses it, and 0034 says so in those words: *"A credential check in front of a caller nobody has built is a mechanism no test can exercise. That holds whoever is holding the phone."* Points 3 and 4 state `customer_id`-in-body and ownership-as-validation as **unchanged**, and point 5 says what is superseded is a reading, not a mechanism. Four options (keep the reading / take the other reading / name no role / name no role plus a shared API key), so the withdrawn reading survives as evidence. 697 of 700 words.

The cost is booked as the first "Bad" consequence, in the human's own terms: *staff behind a counter* is what made "no authentication" feel obviously safe, the stubbed-client argument is the answer and the better one, but it now has to be read rather than assumed.

## `superseded_by`

**Set**, to `"0034"`, and nothing else. There is no precedent from practice — no ADR in this corpus had ever been superseded, every record carried `superseded_by: null`. The authority is the project's own `docs/adr/_template.md:7`: `superseded_by: null    # set when a later ADR replaces this one — never delete`. No tool reads the field (only `supersedes` is rendered, in `tools/docs/build.mjs:53`), so it is documentation-only.

`status` stays `accepted`. A second field was not authorised, so §9's index row for ADR-0002 still reads *accepted*; the supersession is visible there only from ADR-0034's own `Supersedes` column. If you want the status flipped, that is a second field and your call.

The filename keeps `service-advisor`: renaming it would break the `adr-baseline.json` key and the log citations that cannot be rewritten. So the term survives in ADR-0002's title, filename and generated index rows — history keeping its words.

## What the rename revealed

**A claim that only held because a role was assumed.** §3.1.1 said of the customer *"Nothing crosses. Under ADR-0002 the customer does not touch the system; the advisor acts for them"*, and §1.3 said *"Never touches the system"*. Neither is decidable once the caller is unnamed — the caller may **be** the customer. What is actually true is narrower and stronger: no customer *identity* crosses, because `customer_id` is named **inside** the request, so whether the caller is the customer is not something the system observes. Two staged scenes went the same way — *"typically while the customer is on the phone"* and *"The customer calls back"* both required a third party.

## Not neutralised

One, and it is a coupling rather than a sentence that needs the role. §8.6's justification for the `500` row is quoted **verbatim** in eight places under `src/` and `tests/` — `src/http/server.ts:90`, `src/application/deriveInterval.ts:68`, `tests/contract/error-taxonomy.test.ts:224,403,532`, `tests/unit/application/bookAppointment.test.ts:728`, `tests/unit/application/deriveInterval.test.ts:113`, `tests/unit/http/appointments.test.ts:168,754`. I changed §8.6 to *"the caller"*; those quotes still say *"a service advisor"*. The argument is unchanged, so this is wording drift, not a stale claim — but both path families are closed to the architect (`§5`, and I never write code or tests), so it needs routing to the implementer and the test-engineer. Nothing checks a code comment against the prose it quotes, which is why it went unnoticed that §8.6's wording had propagated into eight files.

Also worth your ruling: `docs/arc42/12-glossary.md` is the scribe's section. I removed the row on your instruction; §12 is back at 374 words, its pre-H-1 figure, and A-R-2's footnote arithmetic is restored.

```json
{
  "role": "architect",
  "outcome": "designed",
  "arc42_sections_touched": ["§1.3", "§1.4", "§2.4", "§3.1", "§3.3", "§4.2", "§6.1", "§8.6", "§9", "§12"],
  "adrs": [{"id": "0034", "status": "accepted", "supersedes": "0002"}],
  "quality_scenarios": [],
  "assumptions": [],
  "open_questions": [
    "ADR-0002's status stays `accepted` while superseded — §9's index cannot show the supersession from its own row. One more field would fix it; only one was authorised.",
    "§8.6's justification is quoted verbatim in 8 src/ and tests/ files that still say 'a service advisor'. Needs routing to the implementer and test-engineer."
  ],
  "dcr_ruling": null,
  "message": "ADR-0034 supersedes ADR-0002: the actor is unnamed and authentication stays out of scope on the stubbed-client argument, which ADR-0002 already contained. The rename found that arc42's claim that the customer never touches the system only held because a role was assumed, and it is now stated as the narrower fact that no customer identity crosses the boundary."
}
```
