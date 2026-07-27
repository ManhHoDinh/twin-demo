# Red-team review

Three rounds. Eight reviewers. Every finding either changed the specification, was deleted, or is recorded in the [open risk register](02-open-risk-register.md) with an owner.

**Rule of this exercise:** a review that produces no deletions has not happened.

---

# Round 1 — First pass over the draft specification

## Senior Hydropower Engineer

| # | Finding | Verdict | Outcome |
|---|---|---|---|
| 1.1 | "Your optimiser produces continuous discharge values. I cannot open a gate to 2 347 m³/s. This tells me you have never stood on a spillway." | **Accepted** | [FR-15](../05-product/03-prd.md) gate-realisable releases; symmetry and n−1 added to C5 |
| 1.2 | "You treat the downstream cap as a soft penalty. That is the constraint that gets people killed. It is hard, and it must be checked on the *routed arrival*, not at the dam." | **Accepted** | C9 made hard and routed; [DT-3 step 3](../03-operations/02-decision-trees.md) added |
| 1.3 | "Where is freeboard? That is the number I look at when I am frightened." | **Accepted** | [FR-17](../05-product/03-prd.md); freeboard, dZ/dt and time-to-threshold on S-06 |
| 1.4 | "You have no rapid-drawdown limit. You will recommend emptying an embankment dam fast enough to fail its upstream slope." | **Accepted — serious** | C8 added as a hard dam-side constraint |
| 1.5 | "Four reservoirs with 480 m³/s of turbine capacity against a 5 000 m³/s flood. Say plainly that you buy hours, not days." | **Accepted** | [typical values §4](../00-foundations/09-typical-values.md) reality-check row; strategy §5 caveats |

## Government Official (provincial authority)

| # | Finding | Verdict | Outcome |
|---|---|---|---|
| 1.6 | "BĐ3 means nothing to my committee. Give me people and hours." | **Accepted** | S-02 authority view; [FR-21](../05-product/03-prd.md) impact-based warning |
| 1.7 | "If your system tells me to evacuate and I do, and nothing happens, I am finished. Show me what it costs to be wrong in both directions." | **Accepted** | Regret both ways, never collapsed to an expected value |
| 1.8 | "Who signs this? If nobody's name is on it, it is not a decision." | **Accepted** | [FR-05](../05-product/03-prd.md) identity; reason of record; attributed approval |
| 1.9 | "Our districts were abolished in July 2025. Your entire zone structure is keyed to units that no longer exist." | **Accepted — embarrassing** | [regulatory §5](../00-foundations/08-regulatory-vietnam.md#5-administrative-reform-2025--a-live-product-risk); E-34 with validity periods; R-12 |

## Emergency Commander

| # | Finding | Verdict | Outcome |
|---|---|---|---|
| 1.10 | "Your map shows roads open *now*. I need to know if the road is open when my people are actually on it." | **Accepted — critical** | [FR-22](../05-product/03-prd.md) time-aware routes; `open_until` |
| 1.11 | "I have no signal in a typhoon. Your product is a browser tab." | **Accepted** | S-14 field mode; NFR-05 offline |
| 1.12 | "Depth is not my problem. *Cut off* is my problem." | **Accepted** | [FR-24](../05-product/03-prd.md) isolation detection, ranked above depth severity |
| 1.13 | "Half your shelters are in the flood zone. Somebody drew them on a map ten years ago." | **Accepted** | [FR-23](../05-product/03-prd.md) shelter validation, blocking |

## Dam Safety Auditor

| # | Finding | Verdict | Outcome |
|---|---|---|---|
| 1.14 | "Dam safety appears as a weighted term in your objective. Remove it. It is a constraint with veto." | **Accepted — fundamental** | [FR-18](../05-product/03-prd.md); independent monitor path; §4 architecture rule |
| 1.15 | "Show me commanded versus actual gate position, or the product is not serious." | **Accepted** | E-10; critical alarm, never grouped |
| 1.16 | "Your EAP is a PDF. Mine has to fire automatically." | **Accepted** | [FR-31](../05-product/03-prd.md) EAP as structured data with evaluable triggers |
| 1.17 | "Do not compute breach scenarios live. During an emergency you get one chance." | **Accepted** | Pre-computed breach library; [FR-32](../05-product/03-prd.md) |

## Investor

| # | Finding | Verdict | Outcome |
|---|---|---|---|
| 1.18 | "What is the moat? Anyone can build a map." | **Accepted** | [strategy §8](../05-product/01-product-strategy.md) — institutional encoding, audit record, verification history |
| 1.19 | "You refuse to claim forecast improvement. That is your whole AI story gone." | **Rejected** | The claim is unverifiable and would be dismantled after the first event. The story is *auditable decision support*. Recorded as a deliberate positioning choice. |
| 1.20 | "Eighteen screens is not an MVP." | **Accepted** | [roadmap](03-roadmap.md) sequences P0 → P1 → P2; M1 ships six screens |

## Enterprise Customer (utility IT)

| # | Finding | Verdict | Outcome |
|---|---|---|---|
| 1.21 | "Any write path into our SCADA and this never passes security review." | **Accepted** | NFR-06 one-way boundary enforced at the network layer |
| 1.22 | "You load your 3D library from a public CDN." | **Accepted** | NFR-06 supply chain; no third-party runtime CDN in operational builds |
| 1.23 | "Public traffic during an event will take down the operator tier." | **Accepted** | NFR-04 architectural isolation of the public tier |

## UX Expert

| # | Finding | Verdict | Outcome |
|---|---|---|---|
| 1.24 | "Your beautiful 3D city is a briefing tool, not a decision surface. Do not confuse the demo with the product." | **Accepted** | [UX §9](../05-product/04-ux-principles.md); 3D scoped to briefing/public/training; every 3D view has a 2D equivalent |
| 1.25 | "Continuous depth colour ramp implies centimetre precision you do not have." | **Already correct** | 5 discrete bands retained and made a rule |
| 1.26 | "Colour-only encoding fails ~8 % of your male operators." | **Accepted** | UX §5 — colour never the sole channel |

## AI Researcher

| # | Finding | Verdict | Outcome |
|---|---|---|---|
| 1.27 | "Optimising the ensemble mean lets the solver exploit model error. Use scenario-robust optimisation." | **Accepted** | [decision engine §5](../04-decision-support/01-decision-engine-spec.md) |
| 1.28 | "Averaging time-shifted hydrographs produces a physically impossible forecast." | **Accepted** | Named prohibition in [uncertainty §4](../04-decision-support/02-uncertainty-and-confidence.md) |
| 1.29 | "MPC will chatter between cycles and destroy operator trust faster than any error." | **Accepted** | Move suppression + plan-stability reporting |
| 1.30 | "You cite AI weather models as if their extreme-precipitation skill is established. It is not." | **Accepted** | [meteo §2](../00-foundations/06-meteorology-and-forecasting.md) sober position; AI models as extra ensemble members, verified locally |

---

# Round 2 — Adversarial pass on the revised specification

## The hardest questions, and the honest answers

**Q (Hydropower Engineer): "Your controllability κ says the flood is uncontrollable. So why am I buying a reservoir-operation product?"**
Because the same product then tells you, with evidence, that the flood was uncontrollable — and that record is what protects you and the public afterwards. And because in the events where κ *is* high, hours of correctly-timed release matter. **A product that only works in the favourable case is a product you cannot trust in the unfavourable one.** Kept, and made prominent.

**Q (Dam Safety Auditor): "You say the optimiser is disabled above a safety threshold. Who decides the threshold?"**
The dam owner and the dam safety authority, as dated configuration with a named owner ([FR-35](../05-product/03-prd.md)). Not the vendor, and not in code. **Finding accepted: added an explicit prohibition on vendor-set safety thresholds.**

**Q (Government Official): "Your audit trail will be used against my staff in an inquiry."**
Correct, and it will equally exonerate them when they acted correctly on the information they had. The alternative — no record — has historically gone badly for operators, not well. **Accepted as an honest tension; added to [risk register R-16](02-open-risk-register.md) with a mitigation: replay shows what was *knowable at the time*, not with hindsight.**

**Q (Investor): "You are describing a 3–9 month implementation dominated by calibration. That is a services business."**
Partly, yes, and pretending otherwise would be dishonest. The software is the leverage; the calibration is the moat. **Accepted; [strategy §7](../05-product/01-product-strategy.md) states it plainly rather than hiding it in a footnote.**

**Q (UX Expert): "The decision package has eleven sections. Nobody reads eleven sections at 03:00."**
**Partially accepted.** Redesigned so the top third — situation, proposal, deadline, counterfactual — is the 30-second read, and the remainder is scannable evidence for the person who must defend it. The eleven sections exist because a proposal without a constraint proof is not defensible; they are collapsed by default *except* the counterfactual and the binding constraint.

**Q (AI Researcher): "Your ensemble is parametric in the reference implementation. Your quantiles are decorative."**
**Accepted, and this is the single most important honesty finding in the review.** The reference application's ensemble is a parametric spread, not real members. It is labelled `SYNTHETIC` and cannot support any operational claim. Recorded as **R-01, the top risk**, and it is precisely what M1 shadow mode exists to fix.

**Q (Enterprise Customer): "What happens when we lose 40 % of gauges in the storm?"**
Operating level L2: the affected optimiser is disabled, the banner names what is missing, and the product falls back to rule-curve guidance. **Accepted with an addition:** degradation levels became a tested scenario class rather than a design intention (NFR-08, NFR-12).

**Q (Emergency Commander): "You will give me an evacuation recommendation for a zone I cannot reach."**
**Accepted — the sharpest finding in round 2.** Added: evacuation recommendations must be checked for *executability* — if no viable route and no assets can reach the zone in time, the recommendation changes from "evacuate" to "pre-position rescue and shelter in place", and says why. Recorded as R-17 and folded into [DT-5](../03-operations/02-decision-trees.md) step 3.

---

# Round 3 — Deletions

**Features removed for being unrealistic, undeliverable, or dangerous.** This is the most useful section of the review.

| Deleted | Why |
|---|---|
| **Automated gate control / "auto-pilot mode"** | Legally impossible, ethically wrong, and would end the product on its first incident. Advisory only. |
| **7-day flood forecast** | Beyond the verified skill horizon for this basin. Marketing, not hydrology. Capped at the [typical values §8](../00-foundations/09-typical-values.md) table. |
| **"Lives saved" as a headline KPI** | Unattributable. Replaced by mechanism metrics (lead time, warning coverage, evacuation completion) in [KPIs Tier 5](../05-product/06-kpis.md). |
| **Precise monetary damage totals** | Uncalibrated currency figures get quoted and then dismantled. Physical units first; money as an order of magnitude, labelled indicative. |
| **AI-generated public warning text sent without approval** | An unreviewed generated warning is an unacceptable risk. Drafts only, human approval always. |
| **Real-time full 2D hydraulic simulation inside the decision loop** | Too slow, non-deterministic under load, and unauditable. Replaced by the pre-computed inundation library. |
| **Single "risk score" per zone** | Collapses likelihood and impact into an unactionable number. Replaced by the likelihood × impact matrix. |
| **Social-media sentiment / crowd-sourced flood detection as a primary input** | Unverifiable, gameable, and would enter the decision loop through the least trustworthy path. Retained only as a triaged field-report channel. |
| **Blockchain audit trail** | An append-only, tamper-evident log with signed hashes meets every stated requirement. The rest is theatre. |
| **Gamified operator training with leaderboards** | Wrong register for a domain where the failure mode is death. Training is scored, debriefed and certified — not gamified. |
| **"Digital twin" as the marketing frame** | Kept as an accurate technical description of the state-synchronised model; removed as the positioning, which is *system of record for flood operating decisions*. The former sells a demo; the latter sells a product. |
| **Cross-basin "national dashboard" in the core product** | The reference application already removed its national view once. It is a different product with different users; re-adding it dilutes the operator product. Deferred to M4. |
| **Automatic de-escalation** | Caused real harm historically; de-escalation is human-only with a reason of record ([DT-10](../03-operations/02-decision-trees.md)). |

---

# What survived every round

These were challenged and defended successfully; they are the specification's load-bearing decisions:

1. **Advisory only. The product proposes; a human disposes.**
2. **Dam safety is a constraint with veto, never a term in the objective.**
3. **Infeasibility is reported, never relaxed.**
4. **The counterfactual is mandatory.**
5. **Every quantity carries provenance, quality, age and uncertainty.**
6. **All channel messages are generated from one decision record.**
7. **The audit trail is append-only and supports exact replay.**
8. **Five discrete depth bands, never a continuous ramp.**
9. **The product can say "do nothing", "nothing works", and "I don't know".**
10. **We do not claim to improve rainfall forecast skill.**

---

# Remaining weaknesses (honestly stated)

No amount of reviewing removes these; they are recorded in [open risks](02-open-risk-register.md):

| Weakness | Why it cannot be designed away |
|---|---|
| The reference implementation is entirely synthetic | Only real feeds and a shadow season fix it (R-01) |
| Forecast uncertainty dominates everything | Physics, not engineering |
| Benefit is bounded by κ, which is often low in this basin | Hydrology, not product |
| Institutional adoption is slower than software delivery | Organisational reality |
| Calibration cost is high and recurring | The moat and the burden are the same thing |
| Attribution of outcomes is weak | Statistics |

**A specification that claims to have solved these would fail the next review.**

---

**Next:** [Open risk register →](02-open-risk-register.md)
