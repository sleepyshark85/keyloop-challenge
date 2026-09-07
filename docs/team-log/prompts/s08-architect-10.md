# Prompt · slice 08 · architect · invocation 10

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Unname the actor across the project
- Sent: 2026-09-07T13:55:46.084Z

---

# Unname the actor — the brief says "a user" and we said "service advisor" 85 times

Working directory `/home/agentadmin/sources/keyloop-challenge`, **branch `chore/adr-readability`** (already checked out, 13 commits ahead of `main`, working tree clean). This extends PR #19.

## What the human ruled

They audited the trace, found `Requirements.md` says *"Allow **a user** to request a service appointment"* and never says "service advisor", and then ruled: *"I still think directly mention a service advisor in the ADRs as an actor for the system is limiting. Can we not do that?"* Asked how far to take it, they chose **unname it everywhere** — ADRs, arc42, slice designs, README.

The earlier H-1 fix qualified the term where it was introduced. This goes further: **the system stops asserting a role at all.**

## The key insight, which makes this a strengthening rather than a loss

**ADR-0002 bundles two decisions**: *who the actor is*, and *whether authentication is in scope*. Only the second is supportable from the brief. And ADR-0002 **already contains the role-independent argument** for it — *"a control built against a stubbed client would be unverifiable theatre"*. That reasoning rests on the client layer being stubbed, not on the user being dealership staff.

So the successor record rests the trust decision on the stubbed-client boundary, and is **stronger** than what it replaces, because it no longer depends on a reading the brief does not license.

## This is a decision change, so §4's mechanism applies

The readability pass was bounded to prose. **Withdrawing half of ADR-0002's decision is not prose.** So:

**Write a new ADR superseding ADR-0002** — next free number. Set `supersedes` on the new one. **Do not edit ADR-0002**; it stays exactly as it is, and `superseded_by` is the one field §4 contemplates changing on a superseded record — if the project's precedent is to set it, set it and nothing else; if precedent is to leave it, say so.

The new ADR decides:

- **The caller is "a user" — the brief's word — and the system does not name the human behind it.**
- **Authentication stays out of scope**, on the stubbed-client argument rather than on who the user is.
- **`customer_id` travels in the request body**; **ownership is validation, not a security control** — a `4xx` with a plain reason, not a `403`. **Both unchanged**, and say they are unchanged.
- Note what is *given up*: naming the actor as staff is what made "no authentication" feel obviously safe, and a reader may now ask why there is none. The stubbed-client argument is the answer and is the better one.

Write it in the form this branch established: the problem as a situation before any id, every cross-reference replaced by the fact it points at, **no implementation detail**.

## The rename, ~85 occurrences across 31 files

`git grep -in advisor` is your inventory. Judge each occurrence; they are not all the same:

- **Structural claims** — §3.1.1's actor table, §1.3's stakeholder table, §12's glossary row — stop asserting a role. §3.1.1's rows become "the caller" or "a user". **Remove the §12 glossary row added at `4b8b531`**: the human has ruled the term is not a domain term, so defining it would now assert the thing they removed. That also settles A-R-2 — with the row gone, §12's footnote arithmetic returns to what it was, and the pre-existing brokenness you reported stays untouched and still the scribe's.
- **§1.3's H-1 note** — rewrite rather than delete. It exists to show the brief's word; it now records that the reading was withdrawn and why, which is a better version of the same service.
- **Illustrative scenes** — ADR-0001's *"A service advisor books a car in for 03:00 on a Sunday"* becomes *a user*. Prose, inside the override this branch already has.
- **The other ADRs** (0004, 0007, 0010, 0018, 0019, 0030) — prose, same treatment.
- **Slice designs, slice files, README** — same.

**Where a sentence genuinely needs the human's role to make sense, stop and report it** rather than contorting the prose. I would rather have three sentences you could not neutralise than a paragraph bent around a rule.

## Budgets

`docs:budget:check` with `--ratchet`. "The caller" is shorter than "a service advisor", so most should come in under. **§3 is at 1498/1500 with two words of headroom** — it was made word-neutral for H-1 and cannot absorb growth. The new ADR must meet its own budget outright as a new document. **Never raise a ceiling**; report an unpayable one as a finding.

## Verify

```
npm run docs:refs
npm run docs:adr-check
npm run docs:check
npm run docs:budget:check
npm run test:tools
```

`docs:adr-check` will now count 17 ADRs. Commit in logical groups, `docs(adr):` / `docs(arc42):`, **explicit pathspecs, never `git add -A`**. Push; do not open a PR — #19 is open and this lands in it.

## Return

- The new ADR's number and how you framed the trust decision without the role.
- Any occurrence you could not neutralise, and why.
- Whether `superseded_by` on ADR-0002 was set, and on what precedent.
- Anything this rename revealed — a claim that only held because a role was assumed is exactly what it would surface, and that is worth more than the rename.
