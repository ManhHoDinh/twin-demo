# Hydrology

What turns rain into a flood wave, and why the same rainfall produces wildly different floods. Terminology in [glossary](01-glossary.md); numeric ranges in [typical values](09-typical-values.md).

---

## 1. The chain the product must respect

```
Atmosphere → Rainfall → Land surface → Runoff → Channel → Reservoir → Channel → Floodplain → People
   (§ meteo)     (§2)        (§3)        (§4)     (§ hydraulics)  (§ res-ops)      (§ exposure)
```

Every link adds delay and uncertainty. **Uncertainty is not additive — it is multiplicative in the tails.** A 30 % rainfall error can become a 60–100 % peak-discharge error in a steep, wet catchment, because the runoff response is non-linear once soils saturate.

**Product consequence:** never present a downstream number with more apparent precision than the upstream input justifies. See [uncertainty](../04-decision-support/02-uncertainty-and-confidence.md).

---

## 2. Rainfall as a field, not a number

Rainfall is spatially and temporally structured. Three properties matter operationally:

| Property | Why it matters | Product implication |
|---|---|---|
| **Areal distribution** | Rain on the upper catchment behaves totally differently from rain on the delta. Upper = reservoir inflow (controllable). Lower = uncontrolled local flooding (not controllable by gates). | Must display **sub-catchment rainfall separately**, never a single basin average. |
| **Intensity vs duration** | 100 mm in 3 h ≫ 100 mm in 24 h for peak flow; the reverse for total volume / reservoir filling. | Show both intensity (mm/h) and accumulation (mm/6h, /24h). |
| **Orographic enhancement** | Mountain flanks (Trường Sơn) can receive 2–4× the coastal total from the same system. | Never interpolate a gauge from the coast onto the mountains. |

**Areal reduction factor (ARF).** Point rainfall over-estimates areal mean. For a design storm of duration `D` over area `A`:
```
P_areal = ARF(A, D) · P_point,    ARF ↓ as A ↑ and as D ↓
```
Indicative: `ARF ≈ 0.95` for 100 km²/24 h, `≈ 0.75` for 1000 km²/1 h. See [typical values §2](09-typical-values.md).

**Basin-mean rainfall** is computed by Thiessen polygons, inverse-distance, or (preferred) a gridded product bias-corrected against gauges:
```
P̄ = Σ wᵢ Pᵢ ,  Σ wᵢ = 1
```

---

## 3. The land surface: why antecedent conditions dominate

The **runoff coefficient** `C` is not a constant of the catchment. It is a function of how wet the soil already is.

| Condition | Typical `C` for a steep forested tropical catchment |
|---|---|
| Dry soil, first storm of the season | 0.20 – 0.35 |
| Moderately wet (rain in last 3–5 days) | 0.45 – 0.60 |
| Saturated (multi-day event, second typhoon) | 0.70 – 0.90 |

**This single factor explains most catastrophic surprises.** The October 2020 central-Vietnam sequence (Linfa, Nangka, Molave in rapid succession) was destructive not because any one storm was unprecedented, but because the catchment never dried between them.

**Operational proxies for antecedent wetness** (in order of preference):
1. Continuous soil-moisture accounting model state (best)
2. Satellite soil moisture (SMAP/ASCAT) — coarse, 1–3 day latency
3. **API — Antecedent Precipitation Index** (simple, robust, works with gauges only):
   ```
   API_t = k · API_{t−1} + P_t ,   k ≈ 0.85–0.95 per day
   ```
4. Baseflow at the gauge before the event (an excellent integrated indicator)

> **Product rule FR-derived:** the UI must show an *antecedent wetness state* with its own provenance. A forecast issued without it is `LOW` confidence by construction.

### SCS Curve Number (used widely, misused widely)
```
S = 25400/CN − 254           (mm)
Q = (P − 0.2S)² / (P + 0.8S)  for P > 0.2S, else Q = 0
```
`CN` 30–100. Tropical forest on steep slopes ≈ 60–75 dry, 85–95 wet (AMC III). **Caveat:** CN was calibrated on US agricultural plots; on steep tropical terrain treat it as a shape, not a truth, and calibrate against local events.

---

## 4. From rainfall to a hydrograph

### 4.1 Time of concentration
```
Kirpich:   t_c = 0.0195 · L^0.77 · S^(−0.385)   (min; L in m, S = slope m/m)
```
For VGTB upper sub-catchments (steep, 20–60 km flow length) `t_c` is typically **3–8 h**. That short response time is the whole problem: **rainfall-to-reservoir-peak is hours, not days.** Warning lead time therefore comes almost entirely from *forecast* rainfall, not from *observed* rainfall.

### 4.2 Unit hydrograph
A unit hydrograph `u(t)` is the response to 1 unit of effective rainfall in 1 timestep. The direct-runoff hydrograph is the convolution:
```
Q(t) = Σ_k  P_eff(k) · u(t − k)   +  Q_base(t)
```
Linear, hence cheap and stable — good for a decision-support inner loop. Its weakness is that it assumes the response shape is independent of magnitude, which is false at extremes (floodplain storage engages, roughness changes).

### 4.3 Conceptual store models (what a product should actually run)
A leaky-store cascade (Nash cascade / linear reservoir) is the pragmatic middle ground:
```
dS/dt = I − O ,   O = S/K
```
Chaining `n` stores gives a gamma-shaped response with parameters `(n, K)` — 2 parameters to calibrate per sub-catchment, robust, fast, explainable.

> The reference demo's `js/hydro.js` implements exactly this idea: `buildRunoff()` is a lagged leaky store with asymmetric rise/fall constants (`kRise` > `kFall`), which correctly reproduces the fast rise / slow recession asymmetry of real hydrographs.

### 4.4 Asymmetry is physical, not cosmetic
Rising limb is steep (surface runoff), recession is long (drainage of soil and channel storage). A model with a symmetric response will systematically **under-forecast how long a reservoir stays under stress**, which is the single most expensive error class for a cascade operator.

---

## 5. Inflow estimation — the hardest number in the room

Reservoir inflow `Q_in` is **almost never measured**. It is inferred from the mass balance:
```
Q_in(t) = Q_out(t) + (dV/dt)
        ≈ Q_out(t) + [V(Z_{t+Δt}) − V(Z_t)] / Δt
```

**Why this is treacherous:**

| Problem | Magnitude | Consequence |
|---|---|---|
| Level sensor noise (wind waves, seiche) | ±2–5 cm | On a large reservoir, 5 cm ≈ several Mm³ ⇒ hundreds of m³/s of phantom inflow at Δt = 15 min |
| Z–V curve error (sedimentation) | 1–10 % after 10–20 yrs | Systematic bias in every inflow estimate |
| Outflow error (gate rating, turbine flow) | 3–10 % | Directly propagates |
| Reservoir surface slope during rapid inflow | up to 10 s of cm | Level at the dam ≠ mean level |

**Mandatory mitigations (product requirements):**
- Smooth `dZ/dt` over ≥ 30–60 min, never differentiate raw samples.
- Show inflow with an explicit error band, never as a single number.
- Cross-check against an independent rainfall-runoff estimate; **flag divergence > 25 % as a data-quality alarm** rather than silently trusting either.
- Re-survey the Z–V curve periodically; store curve version in metadata and show it in [Audit](../05-product/02-screen-catalog.md).

> **Failure-library link:** several real-world mis-operations trace to a bad inflow estimate that nobody questioned because the UI showed it as a crisp number. See [10-failure-library §3](10-failure-library.md).

---

## 6. Sub-catchment decomposition (why one basin number is useless)

For a reservoir-controlled basin, split flow into:

| Component | Controllable by gates? | Estimated from |
|---|---|---|
| `Q_reg` — regulated inflow from reservoirs | **Yes** | Reservoir outflow records |
| `Q_lat` — lateral/uncontrolled inflow from intermediate catchment | **No** | Rainfall-runoff on the residual area |
| `Q_local` — direct local runoff / urban drainage in the flooded town | **No** | Local rainfall, drainage capacity |
| Tide / storm surge at the mouth | **No** | Tide table + surge forecast |

**The operator's real question is never "how much water is coming" — it is "how much of it can I actually influence, and by how much".**

Define the **controllability ratio** at a downstream control point:
```
κ = Q_reg / (Q_reg + Q_lat + Q_local)
```
- `κ > 0.6` → reservoir operation materially changes downstream peak; optimisation is worth doing.
- `κ < 0.3` → the flood is essentially uncontrollable; the honest product behaviour is to **say so** and switch the conversation from *release optimisation* to *evacuation timing*.

> This is a first-class product feature, not an academic aside. See [FR-14 Controllability indicator](../05-product/03-prd.md) — it prevents the product from pretending the operator has power they do not have. In the VGTB basin, the intermediate catchment below the four dams is large and wet; κ at Ái Nghĩa in a big event is frequently in the 0.35–0.55 band.

---

## 7. Frequency analysis and design events

For planning and for labelling a live event:
- Fit an annual-maximum series (Gumbel, GEV, Log-Pearson III, Pearson III — Pearson III is the Vietnamese convention).
- Report exceedance probability `P%` (Vietnamese practice) *and* return period (international readability).

```
P = 1%  ⇔ 1-in-100-year      P = 0.5% ⇔ 1-in-200-year
P = 5%  ⇔ 1-in-20-year       P = 10%  ⇔ 1-in-10-year
```

**Honest caveats the product must carry:**
1. A 30-year record cannot support a defensible 1 % estimate; confidence intervals are enormous. Show them.
2. Non-stationarity (land-use change, reservoir construction, climate) breaks the i.i.d. assumption. A "100-year flood" computed on pre-dam data is a different variable from post-dam flow.
3. Two 100-year floods in consecutive years is not evidence of a broken model; it is what independence implies (P ≈ 0.01 % per pair, but across many basins and years it happens).

**UI rule:** label live events as *"comparable to the 2020 event at Ái Nghĩa"* (a memory anchor) before *"≈ 2 % event"* (a statistic). Operators reason from remembered events.

---

## 8. What the reference implementation does today

`js/hydro.js` (see [demo gap analysis](../99-appendix/demo-gap-analysis.md)):

| Element | Implemented | Gap vs this document |
|---|---|---|
| Rainfall pulses (gamma-shaped, scenario-driven) | ✅ | Single basin-mean field; **no sub-catchment decomposition** |
| Lagged leaky-store runoff, asymmetric rise/fall | ✅ | Not calibrated to real events |
| Reservoir mass balance with ramp limits | ✅ | Inflow assumed known, no inflow-uncertainty band |
| Ensemble quantiles growing with lead time | ✅ | Spread is parametric, not from real members |
| Antecedent wetness state | ❌ | **Missing — highest-value hydrological addition** |
| Controllability ratio κ | ❌ | **Missing — highest-value product addition** |

---

**Next:** [Hydraulics and routing →](03-hydraulics-and-routing.md)
