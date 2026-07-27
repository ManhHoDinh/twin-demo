# Decision engine specification

What the product computes, how, from what, with what error, and what it refuses to compute.

Physics in [foundations](../00-foundations/); entities in [entity model](../01-domain-model/01-entity-model.md); logic in [decision trees](../03-operations/02-decision-trees.md); uncertainty policy in [02-uncertainty](02-uncertainty-and-confidence.md).

---

## 1. Architecture

```
        OBSERVATIONS                      FORECASTS                    CONFIGURATION
  (levels, stages, rain, gates)   (rainfall ensemble, tide,      (rule curves, thresholds,
              │                     surge, official bulletin)      constraints, weights)
              ▼                              │                            │
       ┌──────────────────┐                  │                            │
       │  STATE ESTIMATOR │◄─────────────────┘                            │
       │  QC · assimilation · inflow inference                            │
       └────────┬─────────┘                                               │
                ▼                                                         │
       ┌──────────────────┐                                               │
       │ FORECAST ENGINE  │  runoff → cascade routing → channel → floodplain
       │ per ensemble member, per candidate policy                        │
       └────────┬─────────┘                                               │
                ▼                                                         ▼
       ┌──────────────────┐            ┌───────────────────┐    ┌────────────────────┐
       │  IMPACT ENGINE   │            │ CONSTRAINT ENGINE │    │ DAM SAFETY MONITOR │
       │ exposure, damage,│            │ hard constraints  │    │  INDEPENDENT ⚠     │
       │ isolation, routes│            │ feasibility proof │    │  VETO AUTHORITY    │
       └────────┬─────────┘            └─────────┬─────────┘    └─────────┬──────────┘
                └──────────────┬─────────────────┘                        │
                               ▼                                          │
                    ┌─────────────────────┐                               │
                    │  PROPOSAL BUILDER   │◄──────────────────────────────┘
                    │ candidates · counterfactual · alternatives ·
                    │ regret · confidence · deadline · explanation
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │  HUMAN DECISION     │──► orders · notifications · AUDIT
                    └─────────────────────┘
```

**Three architectural rules:**
1. **The dam safety monitor is a separate path with veto.** It never appears in the objective function. ([dam safety §1](../00-foundations/05-dam-safety.md))
2. **The constraint engine produces a proof, not a score.** Every proposal ships with a per-constraint PASS/FAIL/MARGINAL list.
3. **The human decision is inside the loop, not after it.** Nothing actuates. Ever.

---

## 2. The fifteen estimates

Each: definition, method, inputs, output form, indicative error, failure mode, and status in the reference application.

### DS-01 Reservoir inflow `Q_in`
**Method.** Mass balance `Q_in = Q_out + dV/dt`, with `dZ/dt` smoothed over ≥ 30–60 min; cross-checked against an independent rainfall-runoff estimate.
**Output.** Time series with an error band. **Never a bare number.**
**Error.** ±10–25 % typical; worse at low `dZ/dt` and during rapid rise.
**Failure.** Level noise → phantom inflow; stale Z–V curve → systematic bias. **Divergence > 25 % between the two estimates raises a data alarm** rather than silently picking one.
**Status.** ✅ computed analytically · ❌ no error band, no cross-check.

### DS-02 Reservoir storage / level `V, Z`
**Method.** `V = f(Z)` from the surveyed Z–V curve (versioned); integration of the mass balance forward.
**Output.** Level and storage with the curve version attached.
**Error.** Curve error 1–10 % after a decade of sedimentation.
**Status.** ✅ · ❌ no curve versioning.

### DS-03 Available flood storage `V_free`
```
V_free = V(Z_ceil) − V(Z_now)
```
**Output.** Mm³ **and** the operator-facing derivative: `time_to_ceiling = V_free / max(Q_in − Q_out, ε)`.
**Failure.** Presenting `V_free` without the time conversion. Volume is abstract; hours are actionable.
**Status.** ⚠ derivable but not surfaced · **time-to-ceiling is a P0 addition.**

### DS-04 Release timing
**Method.** Constrained search over start times; objective is downstream peak stage at the governing control point subject to the hard constraints in §4.
**Output.** A start time with a **window** (`start between HH:MM and HH:MM`) and the cost of starting late.
**Failure.** Emitting a single instant. Operators need a window; a point implies a precision that does not exist.
**Status.** ⚠ heuristic pre-release window exists · ❌ not a constrained search, no window.

### DS-05 Release quantity and gate configuration
**Method.** Target discharge snapped to the **discrete, symmetric, n−1-tolerant gate-realisable set** ([res-ops §5](../00-foundations/04-reservoir-operations.md)).
**Output.** `{gate indices, opening steps, resulting Q, ramp schedule}`.
**Failure.** A continuous number no operator can execute.
**Status.** ❌ continuous only — **P1**.

### DS-06 Downstream travel time
**Method.** Routing (Muskingum–Cunge or a calibrated library), magnitude-dependent celerity.
**Output.** **Range**, conditioned on magnitude: "4–6 h at moderate flow, 3–4 h at extreme".
**Error.** ±20–30 %.
**Failure.** A single constant. It shortens as the flood grows — exactly when the error matters.
**Status.** ⚠ constant per gauge · **magnitude dependence is P1**.

### DS-07 Water level change at control points
**Method.** Routed hydrograph → rating curve → stage, with the tidal boundary applied.
**Output.** Stage series per ensemble member → q10/q50/q90 + `P(H > BĐn)` per hour.
**Error.** ±0.2–0.4 m at 6 h; ±0.5–1.0 m at 24 h ([typical values §8](../00-foundations/09-typical-values.md)).
**Failure.** Averaging time-shifted hydrographs; ignoring tide phase.
**Status.** ✅ stage + quantiles · ❌ `P(exceed)` not a first-class series; tide is a scalar gain.

### DS-08 Flood extent and depth
**Method.** **Pre-computed inundation library** interpolated on `(discharge, tide, breach state)`; live 2D reserved for the simulation screen ([hydraulics §6](../00-foundations/03-hydraulics-and-routing.md)).
**Output.** Depth grid in **5 discrete bands**, plus velocity and hazard rating.
**Error.** ±0.3–0.5 m in depth; extent error concentrated at the margin.
**Failure.** Continuous colour ramps implying 0.01 m precision.
**Status.** ✅ live 2D with banding (correct) · ❌ no library architecture, no velocity.

### DS-09 Flood risk (probabilistic, per zone)
```
Risk(zone, t) = P(depth > threshold) × Impact(zone, depth)
```
Mapped through the impact-based warning matrix ([warning §4](../00-foundations/07-warning-and-emergency-management.md)) to a colour.
**Output.** Per-zone likelihood × impact class + the driving factor.
**Failure.** Colouring by hazard alone, so an empty floodplain outranks a market.
**Status.** ⚠ zone status from depth+exposure (good) · ❌ not probabilistic.

### DS-10 Population exposure
**Method.** Depth × population raster with the day/night profile and the exposure function in [exposure §3.1](../01-domain-model/04-exposure-and-impact-model.md).
**Output.** **Range**, nearest 100, split into *exposed* vs *needing evacuation* — two different numbers.
**Error.** ±30–50 %.
**Failure.** A single precise count; conflating exposure with evacuation need.
**Status.** ✅ exposure per zone · ❌ no day/night, no evacuation-need split, no ranges.

### DS-11 Potential damage
**Method.** Depth-damage functions × asset inventory × duration/velocity modifiers.
**Output.** **Physical units first** (homes flooded, hectares, road-hours lost); monetary only as an order of magnitude, labelled `INDICATIVE`.
**Error.** Factor of 2–3 without local calibration.
**Failure.** A precise currency total. It will be quoted in a newspaper and then disputed forever.
**Status.** ⚠ homes flooded counted · ❌ no damage functions (and monetary output should stay indicative).

### DS-12 Electricity generation impact
```
Energy_foregone = Σ_t (Q_spill_beyond_turbine · η · ρ g H_head) Δt
```
**Output.** MWh and an indicative revenue figure, **presented as regret, never as an optimisation objective above rank 4** ([res-ops §1](../00-foundations/04-reservoir-operations.md)).
**Status.** ❌ — **P2, and important for the plant-manager persona.**

### DS-13 Safety margin
**Output (all four, always visible on the reservoir screen):** `freeboard_m`, `dZ/dt`, `time_to_ceiling/FSL/design`, and the dam-safety monitor state.
**Failure.** Any aggregation of these into a single "safety score". They are read individually by people who know what they mean.
**Status.** ❌ — **P0. Freeboard and time-to-threshold are trivial to compute and are what a scared operator looks at.**

### DS-14 Environmental impact
**Method.** Minimum ecological flow compliance; rate-of-change effects; sediment flushing; **salinity intrusion at the Đà Nẵng water intake** after a drawdown; water quality.
**Output.** Compliance flags plus a dry-season consequence statement for any drawdown proposal.
**Failure.** Ignoring the dry-season cost of a flood drawdown — a real, recurring conflict in this basin.
**Status.** ❌ — **P2.**

### DS-15 Confidence
See [02-uncertainty](02-uncertainty-and-confidence.md). Every output carries `HIGH / MEDIUM / LOW / UNUSABLE` with the reason.
**Status.** ⚠ ensemble spread exists · ❌ no confidence grading, no reason.

---

## 3. Two derived quantities that are not on the original list but should be

| ID | Quantity | Why it earns its place |
|---|---|---|
| **DS-16 Controllability κ** | `Q_reg / (Q_reg + Q_lat + Q_local)` | Tells the operator whether release optimisation is even the right conversation. Prevents the product's worst category error. ([hydrology §6](../00-foundations/02-hydrology.md)) |
| **DS-17 Decision deadline** | `hazard_arrival − Σ(chain durations)` | Converts a forecast into a countdown. The single highest-value number for compressing the lead-time budget. ([decision rights §4](../02-stakeholders/02-decision-rights-raci.md)) |

---

## 4. Constraint engine — the feasibility proof

Every proposal is evaluated against every constraint, and the result travels with it.

| ID | Constraint | Class | Source |
|---|---|---|---|
| **C1** | `Z ≤ Z_ceil` (or the authorised exception) | HARD | rule curve / procedure |
| **C2** | `Z ≥ Z_dead + margin` | HARD | plant |
| **C3** | Freeboard ≥ margin at all times ⚠ | HARD | dam safety |
| **C4** | `Q_out ≤ Q_max(z)` and within the stilling-basin safe limit | HARD | spillway rating |
| **C5** | Gate configuration legal: symmetric, discrete, n−1 tolerant | HARD | plant |
| **C6** | Outflow ramp ≤ plant limit | HARD | plant |
| **C7** | Downstream rate of rise ≤ limit; rate of fall ≤ limit | HARD | safety |
| **C8** | **Dam-side drawdown rate ≤ limit** (embankment slope stability) ⚠ | HARD | dam safety |
| **C9** | `H(control point, t) ≤ cap` for **all t**, routed, tide-aware | HARD | authority |
| **C10** | Notification lead satisfied before any increase | HARD | legal |
| **C11** | Minimum ecological flow | SOFT | environmental licence |
| **C12** | Dispatch commitment | SOFT | commercial |
| **C13** | Dry-season storage target | SOFT | water supply |

**Rules.**
- A HARD violation makes a proposal **infeasible**. It is still shown, marked infeasible, with the binding constraint named and the authority who could accept the exception identified.
- **Silent relaxation is forbidden.** If the solver relaxes anything, it says so, and the relaxation appears in the audit record.
- MARGINAL (within 10 % of a limit) is reported, because operators want to know how close they are.

> **The output when nothing is feasible:**
> *"No plan satisfies all constraints. Binding constraint: C9 — Ái Nghĩa exceeds its cap under every candidate. The three least-bad options are below; each states which constraint it breaks and who may authorise the exception."*
> This is the behaviour that separates an engineering tool from a demo. ([failure library §4](../00-foundations/10-failure-library.md))

---

## 5. Optimisation formulation

```
minimise over the release schedule u(t) for all reservoirs:

  J = Σ_members p_m · [ w_H · Σ_t penalty(H_m(t) − H_cap)²      ← downstream stage
                      + w_P · Σ_t exposed_population_m(t)        ← people
                      + w_E · energy_foregone_m                  ← economics (rank 5)
                      + w_S · move_suppression(Δu)               ← plan stability
                      ]
subject to  C1–C10 for every member and every t
            u(t) ∈ gate-realisable set
```

| Design choice | Rationale |
|---|---|
| **Scenario-based / robust over members, not the mean** | Optimising the mean lets the solver exploit model error and produces plans that fail on every real member ([res-ops §7](../00-foundations/04-reservoir-operations.md)) |
| **Receding horizon (24–72 h), apply only the first 3–6 h** | Bounds the damage from a bad forecast; matches the re-forecast cadence |
| **Move suppression** | Prevents chattering between cycles, which destroys operator trust faster than any error |
| **Weights are configuration, versioned, displayed** | They encode political choices; hiding them is dishonest and undefendable |
| **Constraints never enter `J`** | A constraint in the objective is a constraint you will trade away |
| **Plan stability reported** | "Recommendation unchanged for 3 cycles" is itself information |

---

## 6. Proposal contract

Every proposal carries all of this, or it is not emitted:

| Field | Rule |
|---|---|
| `actions[]` | reservoir, start, target Q, gate config, ramp, end condition — **all six** |
| `constraints_checked[]` | every C1–C13 with status, margin, binding flag |
| `feasible` | if false, the binding constraint is named |
| `predicted_outcome` | stage/depth/exposure with quantiles, per control point |
| **`counterfactual`** | what happens with **no action** — mandatory, never optional |
| `alternatives[]` | ≥ 2, each with its explicit trade-off |
| `regret{act_and_miss, wait_and_hit}` | both branches with probabilities; **not collapsed to an expected value** |
| `decision_deadline` | with the chain components shown |
| `confidence` + reason | |
| `kappa` | controllability |
| `explanation` | inputs, method, sensitivity: "this changes if rainfall is 30 % higher" |
| `model_versions{}` | every model, parameter set, threshold set, rulebook |
| `data_snapshot_hash` | so the inputs can be reproduced exactly, forever |

**The counterfactual is non-negotiable.** An operator cannot judge a recommendation without knowing what happens if they ignore it, and a reviewer cannot judge it afterwards either.

---

## 7. What the engine refuses to do

| Refusal | Reason |
|---|---|
| Actuate anything | Advisory product; actuation stays in SCADA under human command |
| Produce a proposal at data level L4 | No observations, no advice ([observation model §5](../01-domain-model/03-observation-model.md)) |
| Produce a proposal when a dam-safety threshold is crossed | DT-6 disables the optimiser and says so |
| Trade dam safety against downstream impact | That trade does not exist |
| Return a feasible-looking answer by relaxing a hard constraint | Reports infeasibility instead |
| Publish anything derived from SYNTHETIC or TRAINING data | Hard block ([DT-9](../03-operations/02-decision-trees.md)) |
| Claim skill it has not verified | Verification record required ([FR-27](../05-product/03-prd.md)) |
| Recommend action when `Δpeak` is inside the forecast error | Emits the honest null: "follow the rule curve" |

---

## 8. Compute budget

| Path | Target | Note |
|---|---|---|
| State update on new observation | < 5 s | |
| Full ensemble forecast chain | < 5 min | Scheduled cadence, not on demand |
| Proposal generation | < 60 s | Must feel responsive during a committee meeting |
| What-if single scenario | < 10 s | Interactive |
| Inundation lookup from library | < 500 ms | Interactive map |
| Live 2D simulation | seconds–minutes | Simulation screen only, clearly labelled |
| Breach scenario | **pre-computed** | Never computed live ([dam safety §5](../00-foundations/05-dam-safety.md)) |

---

## 9. Status summary

| Priority | Missing capability |
|---|---|
| **P0** | Quantity envelope (provenance/quality/age) · freeboard + time-to-threshold · decision deadline · counterfactual · constraint list with feasibility · audit trail |
| **P1** | `P(exceed)` series · controllability κ · gate-realisable releases · magnitude-dependent travel time · velocity/hazard rating · isolation detection · forecast-time-aware routes |
| **P2** | Inundation library · generation impact · environmental impact · damage functions · verification screen · day/night exposure |

Converted into requirements in [PRD](../05-product/03-prd.md) and into concrete code changes in [demo gap analysis](../99-appendix/demo-gap-analysis.md).

---

**Next:** [Uncertainty and confidence →](02-uncertainty-and-confidence.md)
