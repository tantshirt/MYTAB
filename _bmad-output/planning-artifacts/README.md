# My Tab — Planning Artifacts

State of play as of **2026-08-21**. Greenfield: planning artifacts exist, no application code yet.

## Pipeline status

| # | Stage | Status | Artifact | Skill that owns it |
| --- | --- | --- | --- | --- |
| 1 | Product brief | ✅ final | `briefs/brief-MYTAB-2026-08-21/brief.md` | `bmad-product-brief` |
| 2 | PRD | ✅ final | `prds/prd-MYTAB-2026-08-21/prd.md` | `bmad-prd` |
| 3 | Architecture spine | ✅ final | `architecture/architecture-MYTAB-2026-08-21/ARCHITECTURE-SPINE.md` | `bmad-architecture` |
| 4 | Stack research | ✅ final | `research/2026-08-21-stack-verification.md` | `bmad-deep-recon` |
| 5 | UX design | ✅ final | `ux-designs/ux-MYTAB-2026-08-21/DESIGN.md` + `EXPERIENCE.md` | `bmad-ux` |
| 6 | Epics and stories | ✅ final | `epics.md` (8 epics, 70 stories) | `bmad-create-epics-and-stories` |
| 7 | Readiness check | ✅ reconciled and independently re-audited | PRD/architecture/UX/epics/security reconciliation | `bmad-code-review` + Codex Security |
| 8 | Sprint plan | ✅ generated; implementation not started | `../implementation-artifacts/sprint-status.yaml` | `bmad-sprint-planning` |

Agent standing context lives at `../../docs/project-context.md` and is auto-loaded by every BMad skill.

## Provenance

Two documents were authored outside BMad by Dre and filed here on 2026-08-21:

- *Hackathon Project Brief v1.3* → `briefs/brief-MYTAB-2026-08-21/brief.md` (now v1.4 after readiness-audit reconciliation; original narrative retained)
- *Architecture Convex Privy Project Brief* → `architecture/architecture-MYTAB-2026-08-21/source-architecture-spec-v1.3.md` (original body retained with a binding supersession addendum)

Two documents were derived from them:

- `prds/prd-MYTAB-2026-08-21/prd.md` — the numbered FR/NFR contract, distilled from brief sections 3, 4, 6–8, 10–12, 17, 19, 24, 26.
- `architecture/architecture-MYTAB-2026-08-21/ARCHITECTURE-SPINE.md` — AD-1…AD-24, distilled from the source spec, verified vendor research, and audit remediation. **The spine is binding; the source spec is a retained long-form reference whose supersession table wins over stale body text.**

Each run folder carries a `.memlog.md` recording the decisions, constraints, and open questions behind its artifact. Skills resume from the memlog, not from the rendered document — so amend via the owning skill's Update intent rather than editing files by hand.

## Reading order for a new contributor

1. `../../docs/project-context.md` — five minutes, the hard rules
2. `prds/…/prd.md` sections 1–5 — what and for whom
3. `architecture/…/ARCHITECTURE-SPINE.md` — AD-1, AD-6, AD-8, AD-9, AD-13 are the ones that bite
4. `research/2026-08-21-stack-verification.md` — what was verified and the two corrections
5. `briefs/…/brief.md` sections 5 and 21 — the judge story and the 10-day plan

## Cross-reference conventions

- Requirements: `FR-<area><n>` (e.g. `FR-S6`) and `NFR-<n>`. Defined in the PRD, section 6–7.
- Architecture decisions: `AD-<n>`. Defined in the spine. **IDs are stable — never renumbered or reused.**
- Research findings: `R-<n>`. Defined in the research note.
- Open questions: `OQ-<n>`. Defined in the PRD, section 15.

## UX spines

`ux-designs/ux-MYTAB-2026-08-21/` holds the two peer contracts:

- **`DESIGN.md`** — how it looks. Authoritative cool-paper/navy/deep-blue token map, Instrument Sans scale, radii, spacing, Brand & Style, Colors, Typography, Layout, Elevation, Shapes, Components, Do's and Don'ts.
- **`EXPERIENCE.md`** — how it works. IA, voice, component behavior, state patterns, concurrency and revision, money legibility, settlement status in human terms, the Telegram surface, interaction primitives, accessibility floor, responsive behavior, and six named-protagonist flows.

**Both spines win on conflict with any mock, wireframe, or generated artboard.** `EXPERIENCE.md` references `DESIGN.md` tokens as `{colors.owed}`, `{typography.amount-hero}`, `{spacing.4}`.

`stitch-handoff-prompt.md` is a historical alternate-producer input. Its old palette, typography, totals, or interaction details must be reconciled to final `DESIGN.md` and `EXPERIENCE.md` before use. It never overrides either spine.

## Implementation-readiness gates

**OQ-1 / R-1** — Convex custom-JWT issuer matching against Privy's bare `iss: "privy.io"` is unproven from documentation. This is the Day 0 gate. No UI feature work until `ctx.auth.getUserIdentity()` returns non-null in a deployed Telegram Mini App.

Before feature implementation, the reconciled artifacts must also agree on: Convex HTTP Action Telegram ingress and five-minute server-side launch contexts; bot-admin membership checks; the reusable/session versus single-use token model; SOL→USDC sync-only DFlow execution; AD-21's exact persisted settlement enum (`created | quoting | ready_for_signature | user_signed | submitted | unknown | confirmed | failed | expired | superseded`) and late confirmation; atomic sponsor reservations; the transaction-validation manifest; integer-rational THB FX; and immutable waiver/manual-cash offsets. `awaiting_wallet`, `presigned`, and `confirming` are UI labels only.

P0/P1 labels are risk sequencing, not scope cuts. All 70 approved stories remain committed; the ten-day plan is the judged milestone rather than the end of development.
