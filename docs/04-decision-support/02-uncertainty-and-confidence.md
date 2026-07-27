# Uncertainty and confidence

How the product tells the truth about what it does not know. This is the difference between a tool an engineer trusts and one they switch off.

---

## 1. Principles

1. **Every forecast quantity has an uncertainty representation.** No exceptions. A number without a band is a claim of certainty.
2. **Uncertainty is shown, not buried in a tooltip.** If it takes a click, it does not exist.
3. **Confidence is graded and the grade is explained.** "MEDIUM" alone is useless; "MEDIUM — ensemble spread is wide beyond 18 h and two upstream gauges are stale" is actionable.
4. **The product may say "I don't know."** ([observation model §5, level L4](../01-domain-model/03-observation-model.md))
5. **Uncertainty must not become an excuse.** Every uncertain output still comes with a recommended action and a deadline. "It's uncertain, you decide" is an abdication.
6. **Precision must match resolution.** 5 depth bands, stages to 0.01 m, population to the nearest 100, damage to an order of magnitude.

---

## 2. Confidence grading

| Grade | Criteria (all must hold) | Product behaviour |
|---|---|---|
| **HIGH** | Lead ≤ 12 h · all critical feeds fresh (L0) · ensemble spread within the historical calibrated band · model verified on ≥ 3 comparable events · no unresolved data alarms | Full recommendation with a specific action and a deadline |
| **MEDIUM** | Lead ≤ 24 h · L0–L1 data · spread moderate · some verification history | Recommendation with an explicit sensitivity statement: "this changes if rainfall is 30 % higher" |
| **LOW** | Lead ≤ 48 h · L1–L2 data · wide spread · thin verification | **Direction only** — "prepare for the possibility of X"; no specific quantity recommended |
| **UNUSABLE** | Lead > 48 h · L3+ data · spread exceeding the dynamic range · no verification · a hard input missing | **No recommendation.** State what is missing and what would restore usability. |

**Automatic downgrades** (any one applies):
- No verification record for this model/gauge/lead-time combination → cap at LOW.
- Antecedent wetness state unknown → cap at MEDIUM ([hydrology §3](../00-foundations/02-hydrology.md)).
- Inflow cross-check divergence > 25 % → cap at LOW for that reservoir.
- Governing gauge stale > 1 h → cap at LOW.
- Scenario is `SYNTHETIC` or `TRAINING` → **no operational grade at all**; the output is labelled non-operational and cannot be published.

> The last row is why the reference application, running entirely on synthetic hydrology, must show a permanent non-operational marker on every screen and every export. It currently does this in the footer and the methods modal — that behaviour is correct and must be extended to exports.

---

## 3. Representations, and when to use each

| Representation | Use for | Do not use for |
|---|---|---|
| **Fan / plume chart** (q10–q90 shaded, q50 line) | Stage and discharge time series | Anything an operator must read at a glance in 2 seconds |
| **Exceedance probability curve** `P(H > threshold)` vs time | The primary decision quantity | Communicating to the public |
| **Discrete bands** | Depth maps, damage classes | Anything needing a continuous gradient |
| **Ranges** | Population, homes, timing | Anything that will be quoted as a total |
| **Worst credible member** (q95–q98, not the max) | Planning against the bad case | The headline number |
| **Categorical likelihood words** | Public communication | Engineering decisions |
| **Verification history** | Establishing trust | Real-time decisions |

**Public likelihood vocabulary** (fixed mapping, used consistently — inconsistency is what destroys public calibration):

| Probability | Vietnamese | English |
|---|---|---|
| > 80 % | *rất có khả năng* | very likely |
| 60–80 % | *có khả năng* | likely |
| 40–60 % | *có thể* | possible |
| 20–40 % | *ít khả năng* | unlikely |
| < 20 % | *rất ít khả năng* | very unlikely |

---

## 4. What must never be done

| Anti-pattern | Why it is harmful |
|---|---|
| **Averaging time-shifted hydrographs** | Produces a low, broad, non-physical hump; under-states and mis-times the peak. Use median-of-peaks or peak-aligned statistics. |
| Showing the ensemble mean as "the forecast" | Same failure, one step earlier |
| Hiding the band because it "looks alarming" | The band *is* the information |
| Displaying a false-precision number (`21 437 people`) | Invites literal use and destroys credibility on contact with reality |
| Continuous colour ramps on a depth map | Implies 0.01 m resolution that does not exist |
| A single "confidence score" with no explanation | Unactionable |
| Extending a forecast beyond its verified horizon because the chart looks better | Marketing, not hydrology |
| Silently substituting a climatological or default value for a missing input | The worst of all — it looks like data |

---

## 5. Communicating uncertainty to each audience

| Audience | Representation | Example |
|---|---|---|
| **Reservoir engineer** | Full ensemble, quantiles, sensitivity | "Peak 9.2 m (q50), q10–q90 8.4–10.3 m at Ái Nghĩa, 14:00–18:00" |
| **Plant manager** | Central + worst credible + probability | "Likely 9.2 m; plan against 10.3 m; 72 % chance of exceeding BĐ3" |
| **Authority** | Probability + impact + deadline | "72 % chance BĐ3 is exceeded tonight; 18 000–24 000 people affected; decide by 16:00" |
| **Emergency commander** | Worst credible + timing window | "Assume 10.3 m; water reaches Zone 4 between 01:00 and 03:00" |
| **Public** | Categorical + action + update time | "Flooding is likely in your area tonight. Move valuables upstairs. Next update 22:00." |

**One rule across all five:** the *same underlying numbers*, differently rendered. Never different numbers. ([communication protocols](../03-operations/03-communication-protocols.md))

---

## 6. The false-alarm problem

False alarms are unavoidable. **Unexplained** false alarms are what destroy a warning system.

**Policy:**
1. Publish the decision threshold in advance: "we act when the probability exceeds X %."
2. When a warned event does not occur, publish the explanation within 48 h: what was forecast, what happened, why, what it cost, and whether the decision was still correct given what was known.
3. Track and publish the false-alarm ratio per gauge and lead time.
4. **Never quietly delete a warning.** Issue an explicit all-clear with a reason.

> A community that has been shown, once, that a false alarm was an honest and correct decision under uncertainty will comply with the next warning. One that has been left to conclude the system "cries wolf" will not. This is the highest-return trust mechanism available and it costs almost nothing to build.

---

## 7. Model error vs forecast error

Two different things, both must be tracked and both must be visible:

| | Model error | Forecast error |
|---|---|---|
| Question | Given perfect rainfall, is my hydrology right? | Was the rainfall right? |
| Measured by | Hindcast with observed rainfall | Verification against observations |
| Improved by | Calibration, better physics, better data | Better NWP, better ensembles, bias correction |
| Typical share | 10–25 % | 50–70 % ([meteo §6](../00-foundations/06-meteorology-and-forecasting.md)) |

**Both belong on the verification screen**, because "the model is fine, the rain was wrong" and "the rain was right, the model is wrong" demand entirely different responses — and after a bad event, the distinction is exactly what the inquiry will ask about.

---

## 8. Reference implementation status

| Element | Status | Gap |
|---|---|---|
| Ensemble quantiles q05–q95 with lead-time-growing spread | ✅ | Parametric, not real members |
| User-adjustable spread | ✅ | — |
| Fan chart on the hydrograph | ✅ | — |
| Discrete depth bands | ✅ | Correct — keep |
| Non-operational labelling in footer/modal | ✅ | Must extend to every export and print |
| Confidence grading with reasons | ❌ | **P0** |
| `P(exceed)` as a first-class series | ❌ | **P1** |
| Verification / false-alarm accounting | ❌ | P2 |
| Ranges instead of point counts for exposure | ❌ | P1 |
| Automatic downgrade rules | ❌ | P0 (trivial once the envelope exists) |

---

**Next:** [Simulation and scenarios →](03-simulation-and-scenarios.md)
