# Prompt · slice 06 · test-engineer · invocation 3

Captured at invocation by `.claude/hooks/capture-prompt.mjs`, per METHODOLOGY.md §9.
This file is the prompt **as sent** — written before the agent ran, not reconstructed after.

- Task: Repair AC-2 audit window
- Sent: 2026-09-06T14:39:36.458Z

---

Slice 06 — **repair your AC-2 instrument.** Branch `slice/06-reschedule-atomic-move`, PR #15. Pull first: the implementer is green on `src/` (six commits, `22ac211`..`d046670`) and raised a **DCR** against your file rather than editing it, which is §5 working exactly as intended.

**The architect ruled (a) clarification at `431c866`. No loopback consumed, no ADR, and the design's share of the fault is recorded as the architect's own.**

**The finding, which is correct and which you should verify yourself rather than take from me.** In `tests/integration/reschedule-is-one-statement.test.ts`:

- `rowAuditFor` filters `where level = 'ROW' and appointment_id = $1` — **id alone, unbounded in time** — while `statementAuditInWindow`, in the same file, bounds itself with `ts between $1 and $2`.
- `beforeEach` truncates `_reschedule_audit` **once, before the whole `it()` body**.
- Both cases then write that same appointment row *inside* that body: `postBooking` over HTTP in the AC-2 case, and — the architect found this one, you did not name it — `occupy` in the AC-2 / T-06-3 case, which at `tests/support/booking.ts:281` issues a literal `insert into appointment` for `aId`.

So a correct implementation audits `['INSERT', 'UPDATE']` and your `.toEqual(['UPDATE'])` cannot pass. The implementer measured exactly that against a build green on every other assertion.

**Why this is not merely over-strict.** `docs/slices/06-design.md` §2.3's truth table line one is *"One `UPDATE` → `UPDATE` × 1 → **pass**"*. Under the instrument as written **that line is unreachable** — no implementation can produce it. An instrument whose pass row cannot be reached does not measure AC-2; it fails everything, which is a different thing from being strict.

**AC-2 and design §2.3 have been amended**, because the window was never stated and your reading over the row's lifetime was defensible against what was written. AC-2 now reads *"exactly one statement modified it **in the course of that move**… The window is the request, not the row's lifetime: the fixture's own arrange writes the same row and is not counted (`R-06-1`)."*

**The remedy is constrained narrower than the finding, and the constraint is the interesting part.** Of the three candidates:

- **Preferred:** take a high-water mark after arrange — `select coalesce(max(id), 0) from _reschedule_audit` — and add `and id > $2` to `rowAuditFor`. Exact, no clock, no truncation of another case's rows. A second `truncate` between arrange and act is equally sound.
- **REFUSED — filtering `op` to exclude `INSERT`.** It would silently make the truth table's *"Cancel then book | `UPDATE`, `INSERT` | **fails**"* line **pass**: the arrange INSERT is gone, the cancel is an `UPDATE`, the book's `INSERT` is filtered out, and the read returns `['UPDATE']`. That is a real loss of discriminating power on a row the design **requires** to fail.
- **REFUSED — a clock window on the ROW read.** The id filter is exact; a window trades that exactness for skew flake. Your header accepts that residual at statement level only because there it had no alternative. Here it has one.
- **The expected values stay `['UPDATE']` in both cases.** Only the window moves. If your repair needs the expectation itself changed, that is a different question and goes back to the architect.

**§2.4, and this is the part that needs care.** This repair is **not** a second red commit — §7 keeps exactly one, `ec37a20`. But a test amended while the implementation is green is precisely what §2.4 exists to catch. So: **re-run the repaired file against `ec37a20`'s `src` tree in a scratch worktree, confirm it is still red, and report the output.** The architect predicts both cases will still fail at the `expect(answer.status).toBe(200)` arrange line, as they did at the red commit. If they do not, say so loudly — that would mean the repair weakened the test.

**Scope.** Repair the instrument and nothing else. Do not touch `src/`, `tests/unit/`, or the implementer's work. Commit `test(06):` — not `(red)`, since this is a repair to an already-red-proven file.

**Report** the standard JSON, the scratch-worktree re-run output showing the repaired file still red against `ec37a20`, which mechanism you chose and why, and — separately — whether verifying the architect's `occupy` claim turned up anything else in your fixtures with the same shape.
