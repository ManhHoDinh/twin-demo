# Product strategy

---

## 1. The problem, stated precisely

In a reservoir-controlled basin with a short response time, a flood decision must be made in a window of a few hours, by a person who will be held accountable, using a forecast that is materially uncertain, under a legal procedure that constrains their options, with consequences measured in lives.

Today that decision is made with: a spreadsheet, a SCADA screen, a phone, a printed procedure, and experience.

**The gap is not prediction. It is the time and evidence around the decision.**

From [warning §2](../00-foundations/07-warning-and-emergency-management.md): the required chain is 2–7 hours, and useful hydrological lead time downstream is 3–8 hours. The margin is thin to negative. Meanwhile, roughly 50–70 % of forecast error comes from rainfall and cannot be engineered away by a product ([meteo §6](../00-foundations/06-meteorology-and-forecasting.md)).

> **Therefore the product's thesis:** the largest available gain is not a better forecast. It is *compressing analysis, decision, approval and dissemination from hours to minutes*, and *making the resulting decision defensible*.

Everything that looks like workflow plumbing in this product is lead-time engineering. Everything that looks like bureaucracy is defensibility engineering.

---

## 2. What the product is

**FloodTwin is an auditable flood decision-support system for reservoir-controlled basins.**

It:
- maintains a live, state-synchronised model of the basin (a digital twin in the operational sense: reservoirs, rivers, floodplain, exposure, sensors);
- turns forecasts into **impact**, not stages;
- generates **constrained, feasibility-proved release proposals** with counterfactuals, alternatives and regret;
- computes and displays the **decision deadline**;
- generates every notification from a single decision record;
- records everything so the decision can be reconstructed years later;
- trains the people who will have to do it for real.

It does **not**: issue official forecasts, actuate gates, replace the operating procedure, or make a decision.

---

## 3. Positioning

| Alternative | What it does well | Where it leaves the gap |
|---|---|---|
| **Status quo (spreadsheet + SCADA + phone)** | Trusted, understood, always available | Slow, unauditable, no uncertainty, no impact translation, no cascade view |
| **Hydraulic modelling suites** (MIKE, HEC, Delft) | Rigorous physics, industry standard | Modelling tools for engineers, not decision tools for a 03:00 committee; not real-time workflow; no notification chain |
| **National flood forecasting services** | Authoritative, broad, official | Basin-scale generic; not reservoir-operation-specific; not the operator's decision tool |
| **SCADA / plant control** | Real-time, reliable, actuating | Plant-boundary only; no basin, no downstream, no exposure |
| **GIS / dashboard products** | Nice maps | Display, not decision; no constraints, no proposals, no audit |
| **Generic "AI flood prediction" startups** | Fast, cheap forecasts | No institutional model, no auditability, no operating procedure, unverified skill claims — and officials cannot sign a decision attributed to an AI |

**The wedge:** nobody occupies the space between *the physics tools* and *the control system* — the place where a named human makes a constrained decision under time pressure and must justify it afterwards.

**One line:** *the system of record for flood operating decisions.*

---

## 4. Value by segment

| Segment | Primary value | What they pay for | Buying trigger |
|---|---|---|---|
| **Hydropower operators** | Defensibility + coordinated operation + compliance evidence | Reduced liability; provable procedure compliance; publishable operation record | A contested event; a regulatory finding; a cascade coordination mandate |
| **Provincial / city authorities** | Faster, defensible evacuation decisions | Lead time; impact translation; audit trail; public communication | A damaging event; central-government direction |
| **City emergency centres** | Operational picture, route and shelter management | Fewer isolated communities; faster deployment | Post-event review findings |
| **National disaster agencies** | Cross-basin standardisation, oversight | Consistency, reporting, verification | Programme-level modernisation |
| **Training institutions / utilities** | Manufactured competence, certified | Auditable training records | Regulatory training requirements |
| **Development banks / donors** | Measurable resilience outcomes | Verified KPIs | Climate adaptation programmes |

**The honest ordering of who buys first:** hydropower operators (they have budget and acute liability exposure), then provincial authorities (they have the need and slower procurement), then national programmes.

---

## 5. Value proposition, quantified honestly

| Claim | Basis | Caveat we state ourselves |
|---|---|---|
| Cuts analysis-to-decision time from hours to minutes | Workflow compression; pre-computed proposals; one-page package | Depends on the customer's approval chain, which we do not control |
| Provides a complete, reconstructable decision record | Audit architecture | Only as good as the data feeds it received |
| Improves cascade coordination outcomes | Combined routed hydrograph; joint optimisation | Benefit is bounded by controllability κ; in low-κ events it is near zero **and we say so** |
| Reduces false-alarm damage to trust | Explicit false-alarm explanation workflow | Requires the customer to actually publish |
| Trains operators on rare events | Replay + injection + debrief | Training quality depends on the instructor |
| **Does not** improve rainfall forecast skill | — | We consume the best available forecast; we do not claim to beat the national service |

> **The last row is a strategic asset, not a weakness.** A vendor who tells a hydro-meteorological service "we will not claim to out-forecast you" gets to work with them instead of against them.

---

## 6. Adoption path

```
M0 Demo/credibility   → M1 Shadow mode      → M2 Advisory     → M3 Operational   → M4 Basin standard
   Synthetic data        Real feeds, no        In the workflow,   System of record,   Multi-basin,
   Replay of a           decisions taken       proposals used,    audit relied on     cross-agency
   remembered event      Verification runs     humans decide      in reviews
```

**Shadow mode (M1) is the critical, non-skippable step.** The product runs on real data for a full flood season, making recommendations nobody acts on, while verification accumulates. It is the only honest way to earn the right to be in the loop, and it is the only way to answer the question every customer asks: *"would it have been right last October?"*

Details and exit gates in [roadmap](../06-critique/03-roadmap.md).

---

## 7. Commercial shape

| Element | Position |
|---|---|
| **Model** | Annual licence per basin, tiered by number of reservoirs and control points; implementation and calibration as a separate project; training as a recurring module |
| **Deployment** | On-premise or in-country cloud. **Air-gap-capable operation is a requirement**, not an option, for state customers |
| **Implementation** | 3–9 months: data integration, calibration, procedure encoding, shelter/route survey, contact tree, training |
| **The real cost driver** | Not software — it is **calibration and institutional integration**. Price and staff accordingly, and say so during the sale |
| **What must never be sold** | Forecast skill improvements; automated operation; a specific number of lives saved |

---

## 8. Moats

Ranked by durability:

1. **Encoded institutional knowledge** — operating procedures, contact trees, shelter registers, calibrated exposure, thresholds agreed with the authority. Years to rebuild, and it belongs to the deployment.
2. **The audit record** — once decisions of record live in the system, replacing it means losing the history. Strongest lock-in, and legitimately earned.
3. **Verification history** — a season of published skill statistics is credibility a new entrant cannot buy.
4. **Calibrated basin models** — high-water-mark surveys, event calibration, rating curve history.
5. **Trained and certified operators** — switching cost in people.
6. Software itself — weakest. Assume it is replicable.

---

## 9. Risks to the business

| Risk | Severity | Mitigation |
|---|---|---|
| A bad recommendation contributes to a disaster | **Existential** | Advisory-only; constraint proofs; conservative defaults; the honest-null answer; complete audit |
| The product is blamed for an unrelated outcome | High | Publishable operation record; pluvial/fluvial attribution; counterfactuals |
| Procurement never completes | High | Land via training and shadow mode, which are cheaper and lower-risk to buy |
| Customer cannot supply data quality | High | Degradation levels are designed in; the product works, and says what it cannot do, at L2 |
| Administrative reorganisation invalidates the deployment | Medium | Everything institutional is dated configuration ([regulatory §5](../00-foundations/08-regulatory-vietnam.md)) |
| Over-claiming in marketing destroys engineering credibility | **High and self-inflicted** | Claims are bounded by the verification table; §5 caveats are contractual, not decorative |
| A national service builds it themselves | Medium | Partner rather than compete; be the decision layer, not the forecast layer |

> The last mitigation for the first risk is cultural: **a team that would ship an always-green optimiser should not be building this product.**

---

## 10. Success in one sentence per stakeholder

- **Operator:** "I knew what was coming and when I had to decide."
- **Plant manager:** "I can prove exactly what we did and why."
- **Authority:** "We evacuated in time, and we can show the basis."
- **Forecaster:** "It uses my bulletin properly and it publishes its errors."
- **Dam safety:** "Nothing in it can trade away my margin."
- **Citizen:** "They told me, it was right, and when it wasn't they explained why."

---

**Next:** [Screen catalog →](02-screen-catalog.md)
