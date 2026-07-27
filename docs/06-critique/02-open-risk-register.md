# Open risk register

Risks that survived [red-team review](01-red-team-review.md). Each has an owner, a mitigation and a trigger that would force a re-plan.

**Severity** = consequence if it materialises · **Likelihood** at the current maturity stage · **Exposure** = Severity × Likelihood.

---

## Critical

### R-01 — The reference implementation runs entirely on synthetic hydrology
**Severity** Critical · **Likelihood** Certain (it is the current state) · **Owner** Product/engineering
Every number in the application is analytically generated. The ensemble is a parametric spread, not real members. **No operational claim of any kind can be supported.**
**Mitigation.** Permanent, structural non-operational marking on every screen and every export ([FR-03](../05-product/03-prd.md)); M1 shadow mode with real feeds and a full season of verification before any advisory use.
**Trigger for re-plan.** Any attempt to use the current build in a real operational context, or any customer-facing claim implying it is validated.

### R-02 — Rainfall is basin-mean; controllable and uncontrollable inflow cannot be separated
**Severity** High · **Likelihood** Certain · **Owner** Hydrology
Without sub-catchment decomposition there is no honest κ, and the product can imply control that does not exist.
**Mitigation.** [FR-29](../05-product/03-prd.md); until delivered, κ is displayed as an estimate with an explicit caveat, or not displayed at all.

### R-03 — Antecedent catchment wetness is not modelled
**Severity** High · **Likelihood** Certain · **Owner** Hydrology
The dominant driver of whether a given rainfall becomes a disaster ([hydrology §3](../00-foundations/02-hydrology.md)) is absent. This is the mechanism behind the October 2020 class of event.
**Mitigation.** API as a minimum viable implementation; confidence capped at MEDIUM while absent.

---

## High

### R-04 — Quảng Huế bifurcation split ratio not modelled
**Severity** High · **Likelihood** High · **Owner** Hydrology
A known, stage-dependent, morphologically drifting source of Ái Nghĩa forecast error — at the governing control point.
**Mitigation.** Model as a stage-dependent split with explicit uncertainty; widen the Ái Nghĩa band until calibrated.

### R-05 — Đắk Mi 4 diversion not hydrologically active in routing
**Severity** High · **Likelihood** High · **Owner** Hydrology
The diversion moves flood volume between two downstream populations and reduces Vu Gia dry-season flow to Đà Nẵng's supply. Presenting a single-river consequence is technically incomplete and politically indefensible.
**Mitigation.** [FR-34](../05-product/03-prd.md); the engine rejects single-river proposals in a diverted basin.

### R-06 — Tide and surge modelled as a scalar gain
**Severity** High · **Likelihood** High · **Owner** Hydraulics
Compound flooding (river peak + high tide + surge) is the worst credible case for Hội An and lower Thu Bồn, and a constant sea level systematically under-predicts it.
**Mitigation.** Explicit mouth boundary entity (E-06); tide phase strip on S-07; compound scenario class.

### R-08 — No observation model; the product cannot tell a live sensor from a dead one
**Severity** Critical if deployed · **Likelihood** Certain at current state · **Owner** Engineering
**Mitigation.** [FR-01](../05-product/03-prd.md), [FR-02](../05-product/03-prd.md) — the P0 foundation. Nothing else is honest without it.

### R-09 — Landslide hazard absent
**Severity** High · **Likelihood** High · **Owner** Hydrology/GIS
In steep saturated terrain the deadliest outcome is frequently the landslide, not the flood — including at dam sites, access roads and worker camps ([failure library §5](../00-foundations/10-failure-library.md)).
**Mitigation.** Susceptibility layer + rainfall intensity–duration thresholds; QL14B access vulnerability as a dam-safety input.

### R-10 — No audit trail
**Severity** Critical if deployed · **Likelihood** Certain at current state · **Owner** Engineering
The product's strongest commercial argument is currently absent.
**Mitigation.** [FR-04](../05-product/03-prd.md).

### R-11 — No notification workflow
**Severity** Critical if deployed · **Likelihood** Certain · **Owner** Product
The largest functional gap. A forecast that does not reach a person changes nothing.
**Mitigation.** [FR-20](../05-product/03-prd.md).

### R-12 — Administrative geography is stale (2025 reorganisation)
**Severity** Medium–High · **Likelihood** Certain · **Owner** Product/data
The gazetteer and zones are keyed to pre-July-2025 district units that no longer exist as administrative entities.
**Mitigation.** Separate place names from administrative units; E-34 with validity periods; verify the current commune-level list before any deployment. `⚠ VERIFY`

### R-17 — Evacuation recommendations may be unexecutable
**Severity** High · **Likelihood** Medium · **Owner** Product
Recommending evacuation of a zone that cannot be reached, or from which no viable route exists in the available time, is worse than no recommendation.
**Mitigation.** Executability check in [DT-5](../03-operations/02-decision-trees.md); recommendation switches to "pre-position rescue, shelter in place" with the reason stated.

---

## Medium

### R-07 — Rating curves not modelled
Stage↔discharge conversion is implicit, and rating shift after a major flood is a known error source. **Mitigation.** Rating curve as a versioned entity with a validity range and drift monitoring.

### R-13 — Third-party CDN and tile dependencies in the operational path
Runtime code and basemap tiles fetched from public services will not survive a security review, and may be unavailable during an event. **Mitigation.** Self-hosted libraries and offline tile packs for the operational build (NFR-06, NFR-05).

### R-14 — Calibration cost is high, recurring, and is the true delivery risk
**Mitigation.** Price and staff for it explicitly; make it visible in the sale rather than discovering it in delivery ([strategy §7](../05-product/01-product-strategy.md)).

### R-15 — Institutional adoption is slower than software delivery
**Mitigation.** Land via training and shadow mode, which are cheaper to buy and carry no operational risk.

### R-16 — The audit trail may be used against the customer's staff
An honest tension, not a defect. **Mitigation.** Replay shows what was *knowable at the time*, never hindsight; the record equally demonstrates correct action under uncertainty. Stated openly during the sale.

### R-18 — Over-claiming in marketing destroys engineering credibility
The fastest self-inflicted way to lose the technical buyer. **Mitigation.** Claims bounded by the verification table; [strategy §5](../05-product/01-product-strategy.md) caveats are contractual, not decorative.

### R-19 — Operator over-trust ("automation complacency")
A tool that is usually right trains people to stop checking. **Mitigation.** Mandatory counterfactual, visible constraint proofs, confidence grading with reasons, and training scenarios in which the product is *wrong*.

### R-20 — Public tier surge during an event degrades operations
**Mitigation.** Architectural isolation (NFR-04), not rate limiting.

---

### R-26 — Scenario rainfall totals exceed the plausibility band
**Severity** Medium–High · **Likelihood** Certain · **Owner** Hydrology
The synthetic pulse shapes produce **2 700 mm (oct2020) to 3 800 mm (yagi) over 72 h**, against the 1 000–1 500 mm/72 h band this workspace itself gives for windward slopes ([typical values §1](../00-foundations/09-typical-values.md)). Every derived magnitude — inflow, stage, flood extent, exposure — inherits that inflation, which is why the flood extents look severe across the whole basin.
**Mitigation.** Surfaced on the sub-catchment panel in the running app rather than hidden; rescaling is deliberately **not** done because the flood field, zone thresholds and traffic model are all calibrated against the current forcing, and a silent rescale would invalidate them together. Correct fix is calibration against a real event in M1 shadow mode.
**Trigger for re-plan.** Any use of the demo's magnitudes as evidence of real flood severity.

### R-27 — Gauge model saturates at `g.max` in the worst scenario
**Severity** Medium · **Likelihood** Certain · **Owner** Hydrology
The analytic stage relation clips, so in a Yagi-class event both policies sit on the ceiling and cannot be compared. The product now **detects and declares** this (`SATURATED`, confidence `UNUSABLE`) instead of reporting a false "no action needed", but the underlying limitation stands and it removes the worst-case comparison that matters most.
**Mitigation.** Declared in the UI; a rating-curve-based stage model in M1.

### R-28 — The decision package is reachable only by scrolling a rail
**Severity** Low–Medium · **Likelihood** Certain · **Owner** UX
[UX §2](../05-product/04-ux-principles.md) requires the decision surfaces not to scroll. The
right rail does. The automated audit reports it as a `SHOULD` violation on every run and it
is deliberately not suppressed.
**Mitigation.** Every persistent decision signal (mode · escalation · data health · κ ·
P(exceed) · decision deadline) is in the global chrome and verified visible without
scrolling. Proper fix is promoting S-05 to its own screen — an information-architecture
change, scheduled with the M2 role-based views.

---

## Low (monitored)

| ID | Risk | Mitigation |
|---|---|---|
| R-21 | 3D performance on low-end hardware | Full functionality with 3D disabled (NFR-15) |
| R-22 | Vietnamese/English terminology drift | Single glossary; operational terms stay Vietnamese |
| R-23 | Scenario library becomes stale | Every real event archived into the library (WF-12) |
| R-24 | Documentation drift from implementation | Doc review is part of the release checklist ([conventions](../99-appendix/document-conventions.md)) |
| R-25 | Key-person dependency on basin calibration | Calibration procedures documented; parameters versioned in configuration |

---

## Risk summary

| Severity | Count | Dominant theme |
|---|---|---|
| Critical | 3 | **The gap between a research demo and an operational product is data, not features** |
| High | 8 | Hydrological completeness; the operational workflow layer |
| Medium | 8 | Commercial and institutional |
| Low | 5 | Maintenance |

> **The single most important line in this register:** every Critical risk is about *data honesty*, not about capability. The reference application is visually and computationally sophisticated and operationally unvalidated. Closing that gap — R-01, R-08, R-10, R-11 — is the entire content of milestone M1.

---

**Next:** [Roadmap →](03-roadmap.md)
