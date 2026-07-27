# Dam safety

Rank-1 objective. Everything in [reservoir operations](04-reservoir-operations.md) is subordinate to this document.

---

## 1. Why dam safety must be structurally separate in the product

An optimiser trades. Dam safety does not trade. If the two share a code path, sooner or later a weight tuned for economics will influence a safety margin.

**Architectural requirement:** dam-safety evaluation is an **independent monitor** that runs on the same state but has its own thresholds, its own alarms, and **veto authority over any proposal**. It never appears as a term in the objective function; it appears as a constraint and as a separate always-visible status. See [decision engine §4](../04-decision-support/01-decision-engine-spec.md) and [S-06 Reservoir screen](../05-product/02-screen-catalog.md).

---

## 2. Failure modes

### 2.1 Concrete / RCC gravity and arch dams
| Mode | Precursors | Time to failure |
|---|---|---|
| Overtopping (rarely fatal for concrete, fatal for foundation/abutment) | Level approaching crest, spillway blocked or gates failed | hours |
| Sliding / overturning | Uplift pressure rise, drain flow change, displacement | days–hours |
| Foundation erosion / abutment failure | Turbid seepage, sinkholes, increased leakage | days–hours |
| Spillway structural failure or gate jam | Vibration, hoist fault, debris | minutes–hours |
| Reservoir-triggered seismicity | Rapid first filling, seismic swarm | — (a real, documented concern at some Vietnamese cascade sites) |

### 2.2 Embankment / earth-fill dams (the majority of small Vietnamese reservoirs)
| Mode | Share of historical failures | Precursors |
|---|---|---|
| **Overtopping** | ~35–40 % | Inadequate spillway, blocked spillway, extreme inflow |
| **Internal erosion / piping** | ~30–40 % | Turbid seepage, boils, sinkholes, sudden seepage increase |
| Slope instability | ~10–15 % | Cracking, bulging, rapid drawdown |
| Conduit failure | ~5–10 % | Sinkholes near outlet |

> **Rapid drawdown is itself a failure mechanism.** Emptying an earth dam too fast removes the water pressure that was supporting the upstream slope, and the saturated slope slides. This means: **a pre-release rate limit exists for the dam's own sake, not only for downstream safety.** Any product that optimises drawdown must carry this constraint explicitly. It is easy to forget and it has killed dams.

### 2.3 Cascade-specific: progressive failure
If an upstream dam fails, the flood wave arriving at the downstream dam may exceed anything it was designed for. Cascade risk assessment must include **domino analysis**: for each upstream dam, what does its breach hydrograph do to every dam below it?

For the VGTB cascade this is not hypothetical — four large reservoirs sit on connected headwaters above a dense delta.

---

## 3. Safety thresholds and margins

| Threshold | Meaning | Product behaviour |
|---|---|---|
| `Z ≤ Z_ceil` | Legal flood-season ceiling | Normal. |
| `Z_ceil < Z ≤ Z_FSL` | Above ceiling — justified only by procedure | **Amber**; require reason-of-record; log it. |
| `Z_FSL < Z ≤ Z_design` | Design flood range | **Red**; emergency spill mode candidate; notify dam safety authority. |
| `Z_design < Z ≤ Z_check` | Extreme | **Critical**; EAP activation; optimiser disabled, pass-through only. |
| `Z > Z_check` or freeboard < margin | Beyond design | **EAP Level 3**; downstream evacuation; the product's only job now is to compute and broadcast the breach-scenario arrival times. |

**Freeboard** must be shown as an explicit number in metres, continuously, on the reservoir screen. Operators think in freeboard when scared.

**Rate-of-rise matters as much as level.** `Z` rising at 0.5 m/h with 2 m of freeboard gives 4 hours. The product must show **time-to-threshold**, not only distance-to-threshold:
```
t_to_Zx = (Zx − Z_now) / (dZ/dt)     [show only when dZ/dt > 0, with the smoothing window stated]
```

---

## 4. Surveillance and instrumentation

| Instrument | Measures | Failure signature |
|---|---|---|
| Piezometers | Pore pressure in dam/foundation | Rising uplift → sliding risk |
| Seepage weirs | Leakage volume **and turbidity** | Increasing flow, or *any* turbidity → piping. Turbidity is the alarm, not volume. |
| Inclinometers / survey monuments | Deformation | Accelerating displacement |
| Crack meters / joint meters | Structural movement | Step changes |
| Accelerometers | Seismic | Event triggers inspection |
| Level sensors (redundant) | `Z` | Disagreement between redundant sensors = data alarm |
| Gate position sensors | Actual opening | **Disagreement with commanded position = critical** |

**Rule of instrumentation in a product:** a sensor that has stopped reporting is *not* a sensor reading "unchanged". Stale data must be visually distinct from fresh data, always, everywhere. See [observation model](../01-domain-model/03-observation-model.md) and [NFR-07](../05-product/05-non-functional-requirements.md).

---

## 5. Emergency Action Plan (EAP)

An EAP is the pre-agreed script for the worst day. Vietnamese equivalent: *phương án ứng phó tình huống khẩn cấp*, required for dams under the dam-safety management framework (Decree 114/2018/NĐ-CP `⚠ VERIFY article numbers before external citation`).

**Minimum contents:**
1. **Notification flowchart** — who calls whom, in what order, with names and numbers, and the backup for each.
2. **Trigger conditions** — unambiguous, measurable, level/rate/observation-based.
3. **Inundation maps for breach scenarios** — sunny-day breach *and* flood-induced breach; both are needed because they have utterly different warning times.
4. **Arrival times and depths** at each downstream community.
5. **Evacuation routes and shelters** with capacity.
6. **Responsibilities** of plant, authority, police, military, health.
7. **Termination and recovery criteria.**

**EAP levels** (typical three-tier structure):
| Level | Condition | Action |
|---|---|---|
| **1 — Unusual event** | Non-routine condition, no immediate threat | Internal notification, increased monitoring |
| **2 — Potential failure** | Condition could develop into failure | Notify authorities, prepare evacuation, staff EOC |
| **3 — Failure imminent/occurring** | Failure in progress or unavoidable | Immediate evacuation, all channels, no further analysis |

> **Product requirement (FR-31):** EAP is not a PDF in a drawer. The product must hold the EAP as **structured data** — triggers as evaluable expressions, contact tree as records, breach inundation as pre-computed layers — so that when a trigger fires, the product presents the exact page of the exact plan with the exact people to call, pre-filled. This is the single most defensible feature to sell to a dam safety auditor.

**Dam-break arrival times must be pre-computed, never computed live.** During a real dam emergency you have neither the compute time nor the right to gamble on a solver converging. Pre-compute the breach library; at run time you look it up. See [simulation §5](../04-decision-support/03-simulation-and-scenarios.md).

---

## 6. What the product must *not* do

| Forbidden | Why |
|---|---|
| Auto-actuate gates | Legal, safety and liability catastrophe. The product is advisory. Actuation stays in SCADA under human command. |
| Present a dam-safety margin as optimisable | Rank-1 objectives are constraints, not terms. |
| Suppress or aggregate a safety alarm into a summary badge | Safety alarms are individually acknowledgeable, never rolled up. |
| Continue showing a plan when a safety threshold is crossed | On crossing, the product switches to emergency presentation and the optimiser is disabled and *visibly* disabled. |
| Estimate breach parameters live from a heuristic | Breach parameters come from the dam owner's engineering studies, versioned, or the product says "not available". |

---

## 7. Reference implementation status

| Element | Status | Gap |
|---|---|---|
| Level bounds dead/ceiling/FSL | ✅ `js/data.js` RESERVOIRS | No design/check flood level, no crest, **no freeboard** |
| Over-ceiling flag | ✅ `rs.overCeil` | Not escalated as a safety state |
| Spilling flag | ✅ `rs.spilling` | — |
| Time-to-threshold | ❌ | Missing (cheap, high value) |
| Rate-of-rise `dZ/dt` display | ❌ | Missing |
| Redundant-sensor disagreement | ❌ | No observation model at all yet |
| EAP as structured data | ❌ | Missing entirely |
| Breach scenario library | ❌ | Missing entirely |
| Optimiser disabled above threshold | ❌ | MPC policy remains selectable at any level |
| Rapid-drawdown constraint | ❌ | Pre-release has no dam-side rate limit |

---

**Next:** [Meteorology and forecasting →](06-meteorology-and-forecasting.md)
