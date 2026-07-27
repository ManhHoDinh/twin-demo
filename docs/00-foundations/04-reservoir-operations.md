# Reservoir operations

The core of the product. Written from the seat of a reservoir operation engineer with two decades in a control room, then reviewed by dam safety and by the provincial authority who will be blamed if it goes wrong.

---

## 1. The operator's actual objective function

A flood-season reservoir operator is not minimising one thing. They are holding **five objectives in tension**, in a strict priority order that is set by law and by conscience, not by an optimiser:

| Rank | Objective | Hard or soft |
|---|---|---|
| **1** | **Dam safety** — never lose the structure | HARD. Overrides everything. A dam failure is orders of magnitude worse than any flood it was holding back. |
| **2** | **Downstream life safety** — do not create or worsen a flood peak that kills people | HARD in practice |
| **3** | **Legal compliance** — follow the inter-reservoir procedure and its level bounds | HARD (personal liability) |
| **4** | **Property/economic damage** minimisation | SOFT, optimisable |
| **5** | **Power generation, water supply, environment** | SOFT, sacrificed first in a flood |

> **Product law:** the optimiser may only trade within rank 4–5. It must never present a candidate that trades rank 1–3 for rank 4–5 benefit, even if the expected-value arithmetic favours it. Any optimiser output must be accompanied by an explicit **constraint satisfaction list** proving ranks 1–3 hold. See [decision engine §4](../04-decision-support/01-decision-engine-spec.md).

**The asymmetry of blame.** Under-releasing and then being forced into a large emergency release is punished far more severely — legally, politically, and morally — than releasing early and being wrong. Operators know this. A product whose recommendations do not reflect this asymmetry will be ignored. Encode it as an **asymmetric loss function**, not a symmetric squared error.

---

## 2. Reservoir state: the four numbers that matter

| Quantity | Symbol | Where it comes from |
|---|---|---|
| Water level | `Z` | Measured (redundant sensors) |
| Storage | `V = f(Z)` | Z–V curve (surveyed; ages with sedimentation) |
| Inflow | `Q_in` | **Inferred** — see [hydrology §5](02-hydrology.md#5-inflow-estimation) |
| Outflow | `Q_out = Q_turbine + Q_spill + Q_outlet + leakage` | Turbine flow from plant; spill from gate rating |

**The mass balance is the whole game:**
```
dV/dt = Q_in − Q_out
V(t+Δt) = V(t) + (Q_in − Q_out)·Δt
```
Convenient operational identity (memorise it):
```
1000 m³/s sustained for 1 hour = 3.6 Mm³
```
So a reservoir with 100 Mm³ of free storage absorbs 1000 m³/s of net inflow for ~28 hours, or 5000 m³/s for ~5.5 hours. **This arithmetic, displayed as "time to full at current net inflow", is worth more to an operator than any map.**

### Level bands
```
Z_dead  ───────────  minimum operable (MNC)
Z_ceil  ───────────  flood-season ceiling / pre-flood level  ← the operative constraint
Z_FSL   ───────────  normal max level (MNDBT)
Z_design ──────────  design flood level
Z_check ───────────  check (extreme) flood level
Z_crest ───────────  dam crest        freeboard = Z_crest − Z_water
```
During flood season the reservoir is legally required to sit **at or below `Z_ceil`**, sacrificing generation head to hold flood buffer. Encroaching above `Z_ceil` before a forecast storm is one of the classic pre-conditions of disaster.

---

## 3. Rule curves — what they are and what they cannot do

A **rule curve** (*biểu đồ điều phối*) prescribes the target level envelope through the year: low in flood season, refilling toward FSL as the season ends.

```
Z
FSL ┤                                        ╭──────────
    │                                   ╭────╯
Z_ceil ─ ─ ─ ─╮                    ╭────╯
    │         ╰────────────────────╯
    │        flood season (Sep–Dec, VGTB)      refill
    └────────────────────────────────────────────────► month
```

**Strengths:** simple, auditable, legally defensible, requires no forecast, works when everything else fails.
**Weaknesses:** it is *reactive*. It responds to the level you already have, not the flood that is coming. In a fast-responding catchment (`t_c` 3–8 h) a reactive rule spends the storm chasing the flood.

**The product's central hydrological claim** is precisely this gap: forecast-informed operation converts hours of foresight into metres of downstream stage. It must be stated carefully:

> Forecast-informed pre-release can reduce a downstream peak **when (a) the forecast has skill at the required lead time, (b) the reservoir has meaningful control over the downstream point (`κ`, see [hydrology §6](02-hydrology.md#6-sub-catchment-decomposition-why-one-basin-number-is-useless)), and (c) the pre-release itself does not cause harm.** When any of the three fails, the honest recommendation is *follow the rule curve*.

**A product that cannot recommend "do nothing, follow the rule" has no credibility with engineers.** This is a hard acceptance criterion — see [FR-11](../05-product/03-prd.md).

---

## 4. Pre-release (xả trước): the highest-value and highest-risk manoeuvre

**The idea:** before a forecast flood, release water to create empty storage, so the peak can be absorbed.

**The arithmetic:**
```
V_created = (Q_pre − Q_in_now) · duration
Peak_reduction ≈ V_created / (peak duration)   [very roughly]
```
Example: pre-releasing an extra 400 m³/s for 12 h creates ≈ 17 Mm³, enough to shave roughly 470 m³/s off a 10-hour peak. Whether that translates into downstream stage relief depends entirely on `κ` and on routing.

**The four ways pre-release goes wrong:**

| # | Failure | Mechanism | Guard |
|---|---|---|---|
| 1 | **The forecast storm doesn't arrive** | You emptied a reservoir you must now refill, losing generation and possibly dry-season supply | Require a probability threshold + show the regret cost of the false-alarm branch |
| 2 | **You flood people with the pre-release itself** | Downstream is already at BĐ2 from local rain; your "preventive" release pushes it to BĐ3 | Hard constraint: pre-release must keep downstream control point below its cap *at all times*, including travel-time-shifted arrival |
| 3 | **You release into the arriving tributary peak** | Timing error — pre-release crest coincides with lateral inflow crest | Route the pre-release explicitly; check crest coincidence, not just volumes |
| 4 | **Ramp too fast → bank collapse, drowning, livestock loss** | Rapid stage change downstream | Ramp-rate limits (§6), mandatory notification lead time |

> **Failure #2 is the one that ends careers.** The product must make it structurally impossible to propose a pre-release whose *own routed hydrograph* violates a downstream cap. This is a constraint, not a penalty term.

**Decision variable set for a pre-release proposal:**
`(which reservoir, start time, target discharge, ramp rate, end condition, downstream notification lead time)` — all six, or it is not an actionable proposal. See [decision engine §6](../04-decision-support/01-decision-engine-spec.md).

---

## 5. Spillway and gate hydraulics

**Free (uncontrolled) overflow weir:**
```
Q = Cd · B · H^(3/2)          Cd ≈ 1.8 – 2.2 (SI, ogee crest); H = head over crest
```

**Gated (submerged/orifice) flow under a partially open gate:**
```
Q = Cd · a · B · √(2 g H)     a = gate opening, H = head to gate centreline, Cd ≈ 0.6 – 0.75
```

**Operational realities that the equations don't show:**

| Reality | Consequence |
|---|---|
| Gates open in **discrete steps**, often 0.1–0.5 m, and take minutes each | The achievable discharge set is discrete, not continuous. An optimiser producing "2,347 m³/s" is not implementable. **Snap all proposals to realisable gate configurations.** |
| Gates must be opened **symmetrically** about the spillway centreline | Asymmetric opening causes scour and vibration in the stilling basin. A proposal must specify a legal gate pattern. |
| Each gate has a **hoist motor, a power supply, and a failure probability** | Assume `n−1`: the plan must survive one gate failing to open. |
| **Trash and debris** accumulate at the intake during floods | Effective discharge can be materially below rating |
| **Stilling basin / energy dissipation limits** | Some dams have a maximum safe discharge below the theoretical spillway max |
| Downstream **channel capacity** may be far below spillway capacity | The binding limit is usually downstream, not the gate |

**Product requirement:** the release proposal is expressed as **gate configuration + resulting discharge**, with the discrete achievable set shown. A slider that implies continuous control teaches operators a false model of their own plant.

---

## 6. Ramp rates and the notification clock

Rapid changes in downstream stage kill people who are in the channel — fishing, collecting sand, crossing a ford.

| Limit | Indicative value | Rationale |
|---|---|---|
| Max rate of **rise** downstream | 0.3 – 0.5 m/h | Human escape time from the channel |
| Max rate of **fall** downstream | 0.15 – 0.3 m/h | Bank saturation → slope failure when support is removed |
| Max outflow ramp | Plant-specific; often expressed as gate steps per 15–30 min | Structure + hydraulic transients |
| Minimum notification lead before any increase | **Statutory** — typically ≥ 2 h before spill increase (verify against the governing procedure) `⚠ VERIFY` | Downstream people must be warned before the water |

> **The notification clock is a hard constraint on the decision, not a downstream consequence of it.** If a proposal requires spilling at T+3 h and the notification chain needs 2 h, the decision deadline is **T+1 h**, and the product must display *that* deadline, prominently, counting down. This "decision deadline" is one of the highest-value UI elements in the entire product — see [S-01 Dashboard](../05-product/02-screen-catalog.md).

---

## 7. Cascade coordination — the multi-reservoir problem

With `N` reservoirs in a basin, uncoordinated locally-optimal operation is often globally terrible: each dam individually "does the right thing" and their releases arrive downstream simultaneously.

**The coordination problem:**
```
minimise   J = Σ_t [ w_H · penalty(H_downstream(t))                     ← downstream stage
                    + w_S · penalty(Z_i(t) vs bounds)                    ← dam safety
                    + w_E · (energy foregone)                            ← economics
                    + w_R · (ramp violations) ]
subject to  mass balance for each reservoir
            Z_dead ≤ Z_i(t) ≤ Z_ceil (or Z_design in emergency)
            0 ≤ Q_out,i(t) ≤ Q_max,i (gate-realisable set)
            |ΔQ_out,i| ≤ ramp_i
            H_downstream(t) = Route( Σ_i Q_out,i , Q_lateral , tide )
            notification lead time satisfied
```
This is a **model predictive control (MPC)** problem: solve over a receding horizon (typically 24–72 h), apply only the first few hours of the plan, re-solve as new observations arrive.

**Why MPC and not a one-shot optimum:**
- Forecasts update; a plan that cannot be revised is a liability.
- Applying only the head of the plan bounds the damage from a bad forecast.
- Re-solving on a schedule gives a natural, auditable decision cadence.

**Why MPC is dangerous in this domain:**
| Danger | Mitigation |
|---|---|
| Optimiser exploits model error (releases into a modelled trough that doesn't exist) | Robust/scenario-based formulation over ensemble members, not the mean |
| Chattering — plan flips between re-solves, operator loses trust | Move-suppression term; hysteresis; show *plan stability* explicitly |
| Objective weights encode political choices invisibly | Weights must be **configured by the authority, versioned, and shown in the audit trail** |
| Silent constraint relaxation to find a solution | Infeasibility must be **reported as infeasibility**, never quietly relaxed |

> **The last row is a product-defining rule.** When no feasible plan exists — when every option violates a hard constraint — the correct output is: *"No plan satisfies all constraints. The binding constraint is X. Here are the three least-bad options and exactly which constraint each one breaks."* An optimiser that always returns a green answer is worse than useless in the situation where it matters most.

**Cascade-specific structure:** upstream reservoirs have longer effective lead time on the downstream control point (their water takes longer to arrive), so they are the preferred instrument for *slow, early* action; downstream reservoirs are the instrument for *fast, late* correction. A good product states this explicitly in the proposal rationale.

---

## 8. Operating modes

| Mode | Trigger | Behaviour | Who authorises |
|---|---|---|---|
| **Normal generation** | Level within band, no flood forecast | Optimise energy within level bounds | Plant / dispatch |
| **Flood watch** | Forecast rain or rising inflow | Verify level ≤ ceiling, verify gates, staff up, pre-notify | Plant manager |
| **Pre-flood drawdown** | Forecast flood with sufficient confidence and lead time | Controlled pre-release under §4 constraints | Basin authority per procedure |
| **Flood absorption** | Flood arriving, buffer available | Outflow < inflow, level rising deliberately | Per procedure |
| **Flood pass-through** | Level at/above ceiling, buffer exhausted | Outflow ≈ inflow; **the reservoir is now a river** | Per procedure |
| **Emergency spill** | Dam safety threatened (level approaching design/check, or structural concern) | Maximum safe discharge regardless of downstream | Dam safety authority; overrides all |
| **Post-flood recovery** | Recession | Controlled drawdown back to ceiling, then refill schedule | Plant + authority |

> **"The reservoir is now a river"** is the sentence the public never hears and must. Once buffer is exhausted, outflow ≈ inflow and the dam is no longer reducing the flood — it is passing it. Product requirement: a large, unambiguous **buffer-exhaustion indicator** and a plain-language statement, because this is the exact moment when public anger about "the dam caused the flood" originates, and the exact moment when the truthful answer is defensible and provable.

---

## 9. Human factors in the control room

Twenty years in the seat teaches these, and they are product requirements:

1. **Decisions happen at 03:00, tired, with the phone ringing.** Any interaction requiring more than ~30 seconds or more than 3 clicks will not be used in a real event.
2. **Nobody reads a paragraph during a flood.** The primary decision surface must be readable in one glance: *what is coming, when, how bad, what am I being asked to do, by when.*
3. **Trust is built in calm and spent in crisis.** If the tool is wrong during quiet weeks, it is switched off during the storm. Daily-use accuracy is a safety feature.
4. **Operators will not accept a black box.** Every recommendation must expose: inputs, constraints checked, the counterfactual (what happens if you do nothing), and the sensitivity (what would change the answer).
5. **The phone is the real system.** The tool must produce something that can be *read aloud over a phone line in 20 seconds*. If it can't, it doesn't fit the workflow. See [communication protocols](../03-operations/03-communication-protocols.md).
6. **Alarm fatigue is a design failure, not a user failure.** See [UX principles §4](../05-product/04-ux-principles.md).
7. **Handover between shifts is where context dies.** A machine-generated, human-edited shift handover is one of the highest-value low-glamour features in the product.

---

## 10. Reference implementation status

`js/hydro.js` implements two policies — a static rule-curve policy and a forecast-informed MPC-like policy — and pre-computes both so the operator can compare peak outcomes at the downstream governing gauge (Ái Nghĩa).

| Element | Status | Gap |
|---|---|---|
| Mass balance with ramp limiting | ✅ `integrateReservoir` | — |
| Never drain below dead storage | ✅ | — |
| Level bounds (dead / ceiling / FSL) | ✅ per reservoir | Design & check flood levels absent |
| Rule vs forecast-informed comparison | ✅ both precomputed | — |
| Pre-release window ahead of forecast peak | ✅ `toPeak ∈ (2,16) h` | Heuristic, not a constrained optimisation |
| Downstream cap as a **hard constraint** | ⚠ soft cap `spillMax·0.55` | **Must become a hard, routed, per-timestep constraint** |
| Gate-realisable discrete releases | ❌ | Missing — proposals are continuous |
| Infeasibility reporting | ❌ | Missing — engine always returns a plan |
| Notification lead / decision deadline | ❌ | **Missing — highest-value operational addition** |
| Buffer-exhaustion ("now a river") indicator | ⚠ `spilling`/`overCeil` flags exist | Not surfaced as a first-class state |
| Time-to-full at current net inflow | ❌ | Missing — cheap, very high value |
| Objective weights visible/versioned | ❌ | Missing |

These gaps are converted into requirements in [PRD](../05-product/03-prd.md) and into concrete code changes in [demo gap analysis](../99-appendix/demo-gap-analysis.md).

---

**Next:** [Dam safety →](05-dam-safety.md)
