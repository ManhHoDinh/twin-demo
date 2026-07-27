# Meteorology and forecasting

Where the product's lead time comes from — and where its honesty is tested hardest.

---

## 1. The forcing systems for central Vietnam

| System | Season | Character | Forecast difficulty |
|---|---|---|---|
| **Tropical cyclone / typhoon (bão)** | Jun–Nov, peak Sep–Nov | Intense, organised, track-dependent rainfall | Track: good at 24–72 h. **Rainfall amount and placement: poor.** A 50 km track error relocates the rain maximum entirely. |
| **Northeast monsoon surge (gió mùa Đông Bắc)** | Oct–Jan | Cold surge meets warm moist easterlies against the Trường Sơn range | Moderate skill; long duration is the hazard |
| **ITCZ / tropical depression** | Sep–Nov | Slow-moving, prolonged heavy rain | Poor timing, high totals |
| **Orographic enhancement** | Any | East-facing Trường Sơn slopes multiply coastal totals | Systematically **under-forecast** by coarse global models |
| **Compound sequences** | Oct–Nov | Multiple systems days apart | Individually forecastable, cumulatively catastrophic via antecedent wetness |

**Central Vietnam's specific brutality:** short, steep catchments + extreme orographic rainfall + a dense delta population + the flood season colliding with the reservoir refill season. Rain-to-flood is hours. There is no room for a slow forecast chain.

---

## 2. The forecast stack

| Layer | Horizon | Typical source | Role |
|---|---|---|---|
| **Nowcast** | 0–3 h | Radar extrapolation, satellite (Himawari) IR/rapid-scan | The only reliable input inside the response time of the catchment |
| **High-res regional NWP** | 0–48 h | WRF / regional models, convection-permitting (~1–4 km) | Placement of orographic maxima |
| **Global NWP deterministic** | 0–10 d | ECMWF IFS, GFS | Synoptic evolution, track |
| **Global ensemble** | 0–15 d | ECMWF ENS (51 members), GEFS | **The uncertainty, which is the actual product** |
| **AI/ML global models** | 0–10 d | GraphCast, GenCast, Pangu, FourCastNet, AIFS | Fast, competitive skill; GenCast is ensemble-native |
| **Satellite QPE** | past–now | GPM IMERG (early/late/final), gauge-corrected | Observed rainfall where gauges are absent |
| **Rain gauges / AWS** | past–now | National network + plant gauges | Ground truth, bias correction anchor |

**On AI weather models — the sober position.** Data-driven global models now match or beat operational NWP on many headline scores at a fraction of the compute, and ensemble-native diffusion models (GenCast class) produce calibrated ensembles cheaply. That is genuinely useful. But:
- Headline skill is dominated by large-scale fields (500 hPa height), **not** by extreme localised precipitation, which is what a flood product needs.
- Training on reanalysis means the tails are under-represented; behaviour on unprecedented events is not guaranteed.
- They still need a real analysis (initial condition) from a conventional system.

**Product position:** treat AI models as **additional ensemble members / a cheap large ensemble**, never as a replacement for the official national forecast, and always verify locally before trusting. Say this in the UI. Claiming an AI model "predicts floods better" without local verification is exactly the sort of statement that destroys credibility with a hydrological service.

---

## 3. Ensembles: the only honest representation

A single deterministic rainfall forecast pushed through a hydrological model produces a single flood forecast, which is **always wrong** and gives the operator no way to reason about risk.

**Ensemble chain:**
```
N rainfall members → N runoff realisations → N reservoir trajectories → N downstream stage series
                                                    ↓
                          P(exceed BĐ3), quantiles, worst-credible member
```

**What to display, in priority order:**
1. `P(H > BĐ3)` at the governing gauge, per hour — a probability, not a line.
2. The **q50 with a q10–q90 band** — the plume.
3. The **worst credible member** (not the maximum; typically q95–q98) — operators plan against this.
4. **Spread growth with lead time** — visible, so the user internalises the horizon of usefulness.

**Never display the ensemble mean of stage as "the forecast".** The mean of a set of sharp peaks at different times is a low, broad, non-physical hump that under-states the peak and mis-times it. Use the median and quantiles of the *peak*, or peak-aligned statistics.

> This is a specific, common, and serious error. It is worth a named product rule: **"never average across time-shifted hydrographs."**

---

## 4. Bias correction and downscaling

Global models systematically under-forecast orographic extremes. Minimum viable treatment:
```
P_corrected = a(location, season) · P_model^b        (quantile mapping preferred)
```
Fit against the gauge/IMERG record at each sub-catchment. Store the correction version; show it in provenance. An uncorrected global QPF over the Trường Sơn slopes can be low by a factor of 2 in a typhoon.

---

## 5. Forecast verification — non-negotiable

A flood product that does not continuously verify itself will drift into confident nonsense.

| Metric | What it answers |
|---|---|
| **CRPS** | Overall probabilistic accuracy (lower better); the primary ensemble score |
| **Brier score / skill** | Accuracy of "will it exceed BĐ3" |
| **Reliability diagram** | Are 70 % forecasts right 70 % of the time? |
| **Rank histogram** | Is the ensemble spread right (flat = calibrated; U-shape = under-spread)? |
| **POD / FAR / CSI** | Hit rate, false alarm ratio, critical success index for threshold crossings |
| **Peak stage error, peak timing error** | The two numbers an operator actually cares about |
| **Lead-time-stratified everything** | Skill at 6 h and at 48 h are different products |

**Product requirement (FR-27):** a permanent, user-visible **Forecast Performance** screen showing verification over the last season and last event, per gauge, per lead time. Selling a forecast product without publishing its verification is the industry's oldest bad habit.

**The honest horizon statement.** For a basin with `t_c` of 3–8 h and a reservoir cascade adding 3–5 h of routing, useful actionable lead time is roughly:
```
useful lead ≈ (rainfall forecast skill horizon) + (catchment response) + (routing)
```
With skilful QPF to ~12–24 h, actionable warning is on the order of **12–36 h** for reservoir decisions and **3–8 h** for downstream community warning. **Do not claim more.** Publishing a 7-day flood forecast for this basin is a marketing claim, not a hydrological one.

---

## 6. Uncertainty sources ranked by contribution

For an operational flood forecast in this kind of basin, roughly:

| Rank | Source | Share of total error (indicative) |
|---|---|---|
| 1 | **Rainfall forecast** (amount, timing, placement) | 50–70 % |
| 2 | **Antecedent catchment state** | 10–20 % |
| 3 | Hydrological model structure/parameters | 5–15 % |
| 4 | Reservoir operation (what humans actually do) | 5–15 % — *and it is the one you control* |
| 5 | Routing / hydraulic model | 5–10 % |
| 6 | Observation error (rating curves, sensors) | 3–8 % |
| 7 | Downstream boundary (tide/surge) | 2–10 %, higher in compound events |

**Two product consequences:**
1. Spending engineering effort on a fancier hydraulic model while ignoring rainfall uncertainty is misallocated. Effort goes to the ensemble first.
2. Because rank 4 is *controllable*, the product's highest-leverage function is not better prediction — it is **better decisions under the prediction you already have**. This is the strategic argument in [product strategy](../05-product/01-product-strategy.md).

---

## 7. Radar, satellite and gaps

| Source | Strength | Limitation |
|---|---|---|
| Weather radar | 5–10 min, ~1 km, real observed intensity | Beam blocking in mountains (severe in this terrain), attenuation in heavy rain, needs Z–R calibration |
| Himawari geostationary | 10 min full disk, continuous | Cloud-top proxy; poor at rain rate under thick cloud |
| GPM IMERG | Global, calibrated | Early run ~4 h latency, coarse (0.1°), weak on orographic extremes |
| Gauges / AWS | Truth at a point | Sparse in mountains; **fail or are unreachable exactly during extreme events** |
| Crowd/citizen reports | Fills gaps, high value in cities | Unverified; needs triage |

**Design for gauge loss.** In a severe typhoon, expect a fraction of the telemetry network to go dark (power, comms, physical destruction). A forecast system that degrades gracefully when 30 % of gauges vanish is worth more than one that is 10 % more accurate with a full network. See [NFR-08 graceful degradation](../05-product/05-non-functional-requirements.md).

---

## 8. Reference implementation status

| Element | Status | Gap |
|---|---|---|
| Scenario-driven rainfall pulses | ✅ synthetic, labelled | Not a real forecast feed |
| Ensemble quantiles q05–q95 | ✅ parametric spread growing with lead | Not real members; no `P(exceed)` |
| Spread scaling control (`ensSpread`) | ✅ | — |
| `P(H > BĐ3)` display | ⚠ only inside the MPC proposal (`pBelow`) | **Should be a first-class time series** |
| Verification screen | ❌ | Missing — [FR-27] |
| Bias correction / downscaling | ❌ | N/A while synthetic; required for real feed |
| Sub-catchment rainfall | ❌ | Basin-mean only |
| Nowcast layer | ❌ | Missing |
| Graceful degradation on data loss | ❌ | No observation model yet |

---

**Next:** [Warning and emergency management →](07-warning-and-emergency-management.md)
