# Document conventions

Rules for maintaining this knowledge base.

---

## 1. Structure

```
docs/
  README.md              entry point, doc map, global conventions
  00-foundations/        domain expertise — the physics and the institutions
  01-domain-model/       the world the product represents
  02-stakeholders/       people and authority
  03-operations/         workflows, decision trees, communication
  04-decision-support/   what the product computes and how honestly
  05-product/            strategy, screens, PRD, UX, NFR, KPIs
  06-critique/           red-team, risks, roadmap
  99-appendix/           gap analysis, conventions
```

Companion documents at the repository root, **not duplicated here**:
[`README.md`](../../README.md) (how to run) · [`DATA_AND_METHODS.md`](../../DATA_AND_METHODS.md) (data provenance, edit reference, anti-regression rules) · [`HANDOVER.md`](../../HANDOVER.md) (demo script) · [`IMPROVEMENT_LOG.md`](../../IMPROVEMENT_LOG.md) (change history) · [`PLAN.md`](../../PLAN.md) (architecture).

---

## 2. The no-duplication rule

**A fact lives in exactly one document.** Everything else links to it.

| Kind of fact | Home |
|---|---|
| Term definition, unit, symbol | [glossary](../00-foundations/01-glossary.md) |
| Formula, physical principle | the relevant `00-foundations/` chapter |
| Typical value, range, plausibility bound | [typical values](../00-foundations/09-typical-values.md) |
| Entity attribute | [entity model](../01-domain-model/01-entity-model.md) |
| Basin-specific value | [basin VGTB](../01-domain-model/02-basin-vgtb.md) |
| Threshold used in logic | [decision trees](../03-operations/02-decision-trees.md) parameter register |
| Requirement | [PRD](../05-product/03-prd.md) |
| Screen content | [screen catalog](../05-product/02-screen-catalog.md) |
| Risk | [risk register](../06-critique/02-open-risk-register.md) |
| Code-level change | [gap analysis](demo-gap-analysis.md) |
| Data provenance, code edit reference | `../../DATA_AND_METHODS.md` |

If you are about to restate something, link instead. If a fact needs to be in two places, it belongs in neither — extract it to its home and link twice.

---

## 3. ID schemes

| Prefix | Meaning | Home |
|---|---|---|
| `E-nn` | Entity | entity model |
| `DS-nn` | Decision-support estimate | decision engine |
| `C-n` (constraints) | Constraint | decision engine §4 |
| `C-nn` (changes) | Code change | gap analysis |
| `D-nn` | Decision type | decision rights |
| `WF-nn` | Workflow | workflow catalog |
| `DT-n` | Decision tree | decision trees |
| `S-nn` | Screen | screen catalog |
| `FR-nn` | Functional requirement | PRD |
| `NFR-nn` | Non-functional requirement | NFR |
| `R-nn` | Risk | risk register |
| `P-nn` | Persona | personas |
| `M-n` | Milestone | roadmap |

IDs are permanent. A deleted item keeps its ID marked *withdrawn*; numbers are never reused.

---

## 4. Writing rules

1. **Lead with the conclusion.** The reader is busy.
2. **Tables over prose** for anything comparable.
3. **State the failure mode** for every design decision — what goes wrong without it.
4. **Cite the justification.** Every requirement links to the failure-library item or foundation section that motivates it. Uncited requirements are candidates for deletion.
5. **Mark uncertainty.** `⚠ VERIFY` for anything not checked against a primary source. **Never invent a citation, an article number, a statistic or a source.**
6. **No marketing language.** If a claim cannot survive the [red-team review](../06-critique/01-red-team-review.md), it does not go in.
7. **Vietnamese operational terms are preserved**, with the English gloss on first use in each document.
8. **Numbers carry units and a provenance qualifier** (measured / typical / indicative / synthetic).
9. **Blockquotes are reserved for load-bearing statements** — the sentences a reader should remember. Use them sparingly enough that they still signal importance.
10. **Every document ends with a "Next" link**, so the set can be read linearly.

---

## 5. Review process

| Trigger | Review |
|---|---|
| Any PRD change | Domain reviewer (hydrology or operations) + product |
| Any threshold change | The named parameter owner in the [parameter register](../03-operations/02-decision-trees.md#parameter-register) |
| Any change touching dam safety | Dam safety reviewer. **No exceptions.** |
| New feature proposal | Must cite its failure-library or foundation justification |
| Quarterly | Full red-team round; findings appended to [critique](../06-critique/01-red-team-review.md) |
| Post-event | Failure library updated; scenario archived; documents amended |
| After any administrative or legal change | [regulatory](../00-foundations/08-regulatory-vietnam.md) re-verified |

**Every red-team round must produce at least one deletion**, or the round did not happen.

---

## 6. Keeping documents and code in step

| Rule | Mechanism |
|---|---|
| Status tables at the end of each foundation and domain chapter reflect the real code | Updated in the same change as the code |
| The gap analysis is the single bridge to implementation | All code work references a `C-nn` |
| Anti-regression rules live in `DATA_AND_METHODS.md` §3, extended by [gap analysis §4](demo-gap-analysis.md#4-anti-regression-rules-that-constrain-all-of-the-above) | Checked before any change is called done |
| Doc review is part of the release checklist | Prevents R-24 documentation drift |

---

## 7. What this knowledge base is not

- Not an academic paper. It cites where verification matters and states uncertainty where it exists, but its purpose is to build a product.
- Not a marketing asset. The critique and risk register are the most important sections, and they are unflattering by design.
- Not a substitute for the governing operating procedure, the EAP, or the official forecast. It describes a system that operates *inside* those.
- Not finished. It is a working reference that changes with every event, every review and every deployment.

---

**Back to:** [README](../README.md)
