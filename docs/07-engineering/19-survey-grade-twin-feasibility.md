# Survey-Grade Twin — Feasibility and Implementation Path

> **Why this document exists.** A recurring product request is a 3D basin "99% like reality,
> accurate to **0.1 m**", with water spread simulated to **0.01%** error. This document
> answers that request with numbers instead of adjectives: what each figure means
> physically, which part is achievable and which is not, what the achievable part costs in
> data and compute, and the concrete build order to get there.
>
> **Companion to** [`05-hydraulic-model.md`](05-hydraulic-model.md) (the model this would
> replace), [`14-calibration-and-validation.md`](14-calibration-and-validation.md)
> (acceptance methodology), [`08-data-pipeline.md`](08-data-pipeline.md) (ingestion), and
> [`16-performance-targets.md`](16-performance-targets.md) (budgets).
> **Current shipped state** is recorded in `DATA_AND_METHODS.md` §1.1–1.2.

---

## 1. The two requests are different in kind

The request bundles two numbers that behave very differently.

| Request | Physical meaning | Verdict |
|---|---|---|
| Terrain accurate to **0.1 m** | Vertical/horizontal error of the elevation surface vs. surveyed ground truth | **Achievable — but not from web tiles.** Requires airborne LiDAR. |
| Water spread accurate to **0.01%** | Ambiguous. Two readings: (a) the solver conserves mass to 0.01%; (b) predicted flood extent/depth is within 0.01% of observed. | (a) **Achievable and already shipped.** (b) **Not achievable by anyone** — see §4. |

Conflating (a) and (b) is the single most common way a flood product overstates itself.
This document keeps them apart throughout.

---

## 2. Terrain: what 0.1 m actually costs

### 2.1 Why the current source cannot reach it

The shipped app streams AWS Terrarium tiles (SRTM/Mapzen lineage).

| Zoom | Ground sample | Status over Vu Gia–Thu Bồn |
|---|---|---|
| z11 | 73.5 m/px | legacy baseline |
| z12 | **36.8 m/px** | **current basin-wide base** (121 tiles) |
| z13 | 18.4 m/px | real data; 441 tiles basin-wide — too many to stream at boot |
| z14 | **9.2 m/px** | **current delta overlay**; measured real detail (local roughness 0.31 m/px) |
| z15 | 4.6 m/px | **over-zoom** — measured decode garbage (a −9832 m sample), no added roughness |

**Measured ceiling of the free source: z14 ≈ 9 m/px**, and its *vertical* error is inherited
from SRTM-class data: **±several metres**, not ±0.1 m. No amount of zooming fixes vertical
error — resampling a 30 m-accurate product to a 0.1 m grid produces a precise-looking
surface that is still metres wrong.

### 2.2 What 0.1 m requires

| Requirement | Specification |
|---|---|
| Acquisition | Airborne LiDAR, point density **8–16 pts/m²**, vertical RMSE ≤ 0.10 m, horizontal ≤ 0.30 m |
| Ground control | RTK/GNSS check points, ≥ 20 per flight block, independent accuracy report |
| Products | Classified point cloud (LAS/LAZ) → **bare-earth DTM** (not DSM — vegetation/buildings removed) |
| Hydro-conditioning | Breakline enforcement, culvert/bridge burning, sink filling; a raw DTM will *not* route water correctly |
| Bathymetry | **Separate survey.** LiDAR does not penetrate turbid water; river/reservoir beds need single-beam/multi-beam echo sounding or ADCP cross-sections |
| Source in Vietnam | Licensed from Bộ TN&MT / provincial survey authority, or commissioned flight. Not open data. |

### 2.3 Storage and compute reality

For the 96 × 96 km domain:

| Grid | Cells | Float32 elevation | Note |
|---|---|---|---|
| 333 m (shipped) | 8.3 × 10⁴ | 0.3 MB | current solver grid |
| 9 m | 1.1 × 10⁸ | 455 MB | current fine DEM overlay resolution |
| 1 m | 9.2 × 10⁹ | 37 GB | typical operational 2D model resolution |
| **0.1 m** | **9.2 × 10¹¹** | **3.7 TB** | elevation *alone*, before any state variable |

A shallow-water solver carries at minimum depth + two momentum components + fluxes — call it
5–8× the elevation footprint in working state. **0.1 m over a whole basin is a ~20–30 TB
in-memory problem.** That is an HPC-scale job, and it is not a browser, laptop, or
single-GPU workload.

**The resolution that is actually used in professional practice is 1–5 m in urban cores and
5–20 m on rural floodplains** — chosen because it is where DEM error, roughness uncertainty
and compute cost balance, not because finer is impossible to store.

---

## 3. Water: the two error figures

### 3.1 Numerical mass conservation — achievable, and shipped

This is a property of the discretisation: does the solver create or destroy water?

The shipped solver meters every source and sink on the dynamic 2D domain and asserts

```
| V(t) − ( V(0) + rain + boundaryFlux + assimilation − infiltration ) |  /  V(t)   ≤  1e-4
```

**Measured on production: ~10⁻⁶ – 10⁻⁴ %** depending on simulation path (the solver is
path-dependent), against an **enforced bound of ≤ 10⁻² %** — i.e. it runs two to four orders
of magnitude inside the 0.01% target and the bound is asserted, not assumed. Enforced by
`tests/physics-conservation.mjs` (`npm run physics`), which fails the build if closure
exceeds 1e-4; see [`15-verification-strategy.md`](15-verification-strategy.md).

This figure is real, provable, and reportable. It says nothing about physical realism.

### 3.2 Physical flood-extent accuracy — not achievable at 0.01%

Predicted inundation is only as good as its least-certain input:

| Input | Realistic uncertainty |
|---|---|
| Rainfall (QPE/QPF) | 10–40% |
| Manning roughness `n` | ±20–50% (land-cover dependent, seasonally variable) |
| DEM vertical error | ±0.1 m (LiDAR) … ±several m (SRTM-class) |
| Infiltration / antecedent soil moisture | 20–50% |
| Reservoir release timing/volume | operational, ±% |

Error propagates: **you cannot be more accurate than your least-certain input.** This is why
the peer-reviewed literature and operational agencies report flood-model skill as:

| Metric | Meaning | State of the art (calibrated, validated) |
|---|---|---|
| **CSI / Critical Success Index** | flood-extent overlap vs. observed | **0.70 – 0.90** |
| **RMSE (water level)** | stage error at gauges | **±0.2 – 0.5 m** |
| **NSE / KGE** | hydrograph efficiency | 0.75 – 0.90 |

A 0.01% physical extent error would be roughly **100× better than any validated flood model
on Earth**, including HEC-RAS 2D, TELEMAC-2D, LISFLOOD-FP and MIKE 21. It is not a
funding or engineering gap — it exceeds what the input physics supports.

**Recommended contractual wording:** target CSI ≥ 0.80 and stage RMSE ≤ 0.30 m against a
named historical event, with mass conservation ≤ 0.01% stated separately as a solver
property. Never present the second number as if it were the first.

---

## 4. Reference architecture for the achievable maximum

### 4.1 Method selection

| Method | Physics | Cost | Use case | Verdict |
|---|---|---|---|---|
| Height-field "virtual pipes" (Mei 2007) — **shipped** | diffusive, no inertia terms | very low | interactive twin, browser | keep for the live product |
| **2D SWE, finite volume, shock-capturing (HLLC)** | full shallow-water incl. inertia | high | operational flood mapping | **recommended core** |
| 2D SWE finite element (TELEMAC-2D) | full SWE, unstructured mesh | high | complex geometry, estuaries | strong alternative; better boundary fitting |
| LISFLOOD-FP sub-grid | local inertial approximation | medium | large-domain, fast | good for basin-scale ensembles |
| 3D CFD (Navier–Stokes, VOF) | full 3D free surface | extreme | dam-break near-field, single structures | not viable basin-wide |

**Recommendation:** finite-volume 2D SWE with wetting/drying and an HLLC Riemann solver on a
**variable-resolution mesh** — 1–2 m in urban cores (Hội An, Vĩnh Điện, Ái Nghĩa, Cẩm Lệ),
5–10 m on rural floodplain, 1D coupling for upstream mountain reaches. This is the standard
operational configuration and it is where the accuracy/compute optimum sits.

### 4.2 Compute sizing (order of magnitude)

A 2 m variable mesh over the flood-prone delta (order 1,000–1,500 km² of the 96 × 96 km
model domain) is ~2.5–4 × 10⁸ cells. With CFL-limited explicit stepping, a 48-hour forecast
is a **multi-GPU job (4–8× A100-class), minutes-to-hours per ensemble member**. An
operational ensemble (20–50 members) is a cluster workload, not an interactive one.

**Consequence for product design:** the high-fidelity model runs **offline/batch**; the
browser twin consumes its *outputs* (pre-computed depth grids, arrival times) plus the
interactive low-fidelity solver for what-if exploration. This is the standard two-tier
pattern and it is the honest way to put survey-grade results in front of an operator.

### 4.3 Surrogate acceleration

Once the high-fidelity model exists, an FNO/DeepONet surrogate trained on its outputs can
give near-interactive inference. **This is only meaningful after** the high-fidelity model is
built and validated — a surrogate inherits, and cannot exceed, its training model's skill.
Tracked in the product as a design target, explicitly **not trained** (see the metrics panel).

---

## 5. Calibration and validation plan (non-optional)

A survey-grade model that has not been calibrated is not survey-grade.

1. **Event selection** — ≥ 3 historical floods with good observation coverage. For this basin
   the October 2020 (Linfa–Nangka) event is the natural primary.
2. **Observations** — gauge stage/discharge time series (Ái Nghĩa, Câu Lâu, Giao Thủy, Cẩm Lệ),
   surveyed high-water marks, satellite-derived inundation extent (Sentinel-1 SAR — works
   through cloud, which optical cannot during a typhoon).
3. **Calibration** — adjust Manning `n` by land-cover class **only**, within physically
   defensible bounds (Chow 1959 tables). Never tune DEM or mass to fit.
4. **Split-sample validation** — calibrate on event A, validate on events B and C. Report
   metrics on the *validation* events, not the calibration event.
5. **Acceptance** — CSI ≥ 0.80 (extent), stage RMSE ≤ 0.30 m, peak timing error ≤ 2 h,
   mass conservation ≤ 0.01%.
6. **Uncertainty** — ensemble over rainfall and roughness; publish depth percentiles, not a
   single deterministic surface.

---

## 6. Build order (each phase independently useful)

| Phase | Deliverable | Gate |
|---|---|---|
| **P0** | Procure/commission LiDAR + bathymetry for the delta; independent accuracy report | vertical RMSE ≤ 0.10 m verified against RTK check points |
| **P1** | Hydro-conditioned bare-earth DTM: breaklines, culverts/bridges burned, sinks filled | drainage-enforcement audit passes; no spurious sinks on the floodplain |
| **P2** | Variable-resolution mesh (1–2 m urban / 5–10 m rural) + land-cover roughness field | mesh quality metrics; `n` map traceable to a published classification |
| **P3** | 2D SWE FV solver deployment (HEC-RAS 2D / TELEMAC-2D or in-house HLLC) | analytical benchmarks pass: dam-break, wet/dry front, still-water balance |
| **P4** | Calibration + split-sample validation per §5 | CSI ≥ 0.80, stage RMSE ≤ 0.30 m on **validation** events |
| **P5** | Batch pipeline: forecast ensemble → depth/arrival-time grids → tiles for the twin | end-to-end run inside the forecast cycle time |
| **P6** | Surrogate (FNO/DeepONet) trained on P3/P4 outputs, for interactive what-if | surrogate CSI within 0.05 of the full model |

**Phases P0–P2 are data procurement and preparation and carry most of the schedule risk.**
No solver work can raise accuracy above the DTM it runs on.

---

## 7. What the shipped browser twin does today (for contrast)

| Aspect | Shipped now | Survey-grade target |
|---|---|---|
| DEM | 36.8 m/px basin-wide, 9.2 m/px delta overlay (free tiles, ±several m vertical) | LiDAR bare-earth DTM, ±0.10 m |
| Bathymetry | none — channels synthetically carved | surveyed cross-sections / echo sounding |
| Solver | height-field virtual pipes, 288² (333 m/cell), Manning friction | 2D SWE FV, HLLC, 1–10 m variable mesh |
| Mass conservation | **~10⁻⁶–10⁻⁴ %** measured, **≤ 10⁻² % enforced** by test | same requirement, ≤ 0.01% |
| Physical extent skill | **not validated** — synthetic scenarios, no hindcast | CSI ≥ 0.80 on split-sample events |
| Runtime | interactive, 60 fps, in-browser | batch, multi-GPU, minutes–hours |

The shipped product states these limits in the UI (measured DEM m/px and live mass-conservation
%) and in `DATA_AND_METHODS.md`. **It does not claim 0.1 m or 0.01% physical accuracy**, and
that honesty is a product requirement, not a caveat.

This is the same boundary already held open as **ENG-RISK-001 / [R-01](../06-critique/02-open-risk-register.md)**
("internal consistency, conservation and synthetic-case success are **not** physical
validation" — status *OPEN — BLOCKS CLAIM*, see
[`17-engineering-risks-and-open-questions.md`](17-engineering-risks-and-open-questions.md)).
Phases P0–P4 in §6 are precisely the work that would close R-01; until they are complete and
independently reviewed, the words *validated*, *operational* and *decision-grade* remain
unavailable to this product, and synthetic builds stay capped at LOW confidence.

---

## 8. One-paragraph answer for stakeholders

> A 0.1 m-accurate 3D basin is achievable, but only with commissioned airborne LiDAR plus
> bathymetric survey — not from any free web elevation source, and not inside a browser
> (0.1 m over this basin is a multi-terabyte, HPC-scale problem). A 0.01% figure is
> achievable for **numerical mass conservation** — our solver measures 10⁻⁶–10⁻⁴ % today and
> proves it with an automated test — but **not** for physical flood-extent accuracy, where
> the best validated models worldwide reach CSI 0.70–0.90 because rainfall, roughness and
> terrain inputs each carry 10–50% uncertainty. The correct target to contract against is
> CSI ≥ 0.80 and stage RMSE ≤ 0.30 m on withheld historical events, with mass conservation
> reported separately as the solver property it is.
