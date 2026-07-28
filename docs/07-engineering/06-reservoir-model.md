# Reservoir Model

| Field | Value |
|---|---|
| Document ID | ENG-06 |
| Owner | Reservoir modelling lead |
| Status | REQUIRES DOMAIN REVIEW |
| Current demo | Deterministic `SYNTHETIC` storage/release behavior and simplified visual gate assumptions |
| Production target | Versioned mass-balance and structure model constrained by reviewed plant geometry, operating rules and authority |
| Domain review | Reservoir operations, hydrology, hydraulics, dam safety, plant engineering and Vietnamese legal/operating authority |
| Authoritative dependencies | [Reservoir foundation](../00-foundations/04-reservoir-operations.md), [dam safety](../00-foundations/05-dam-safety.md), [regulatory context](../00-foundations/08-regulatory-vietnam.md), [hydrology](04-hydrology-model.md) |

## Purpose and scope

Represent storage, level and controlled/uncontrolled releases for individual reservoirs and cascades. The model evaluates declared scenarios; it does not create an official operating order or infer legal thresholds.

## Scientific and implementation status

Demo dynamics are `IMPLEMENTED` only as `SYNTHETIC` workflow evidence. Production geometry, curves, structure capacities, rule curves, ramp rates and legal thresholds are `REQUIRES DOMAIN REVIEW`. Solver and cascade orchestration are `PLANNED`.

## Inputs

Uncontrolled inflow, initial level/storage, elevation-area-storage curves, outlet/spillway/gate/turbine geometry and coefficients, environmental releases, operating constraints/rule curves, downstream/tailwater state, scenario controls and cascade messages.

## Outputs

Storage, level, area, controlled release by structure, uncontrolled spill, turbine/environmental release, ramp/constraint margins, rejected action reasons, downstream boundary series and mass-balance residual.

## Dependencies and allowed dependency direction

Hydrology provides inflow; GIS and governed plant records provide geometry; Hydraulic may provide tailwater and receives releases; Scenario/Decision Support may request alternatives but cannot mutate accepted records. Reservoir may provide controlled feedback to Hydrology only through declared iteration in [Simulation architecture](02-simulation-architecture.md).

## Accepted alternatives and recommended method

| Method | Advantages | Principal limitations | Computational cost | Implementation complexity | Suitable use cases |
|---|---|---|---|---|---|
| Level-pool routing | Transparent storage continuity with few states and straightforward mass-balance verification | Assumes a level pool and aggregates structure behavior unless outlets are added explicitly | Low | Low | Single reservoirs and baseline flood-routing studies with governed storage curves |
| Structure-resolved continuity routing | Preserves storage balance while representing spillways, gates, turbines and tailwater regimes | Requires verified geometry, rating relationships and regime transitions | Low to medium | Medium to high | Operational simulation where release feasibility and structure attribution matter |
| Rule-curve simulation | Directly represents approved operating logic and is easy to audit against procedures | Cannot discover better alternatives and is only as valid as the encoded rule version | Low | Medium | Compliance checking, historical replay and counterfactual baselines |
| Deterministic constrained optimization | Produces feasible schedules against explicit bounds and objectives | Sensitive to forecast error, objective design and nonlinear/nonconvex structure behavior | Medium | High | Advisory planning when one accepted forecast trajectory and governed constraints are available |
| Robust optimization | Protects against a declared uncertainty set and exposes worst-case trade-offs | Can be conservative; uncertainty-set design requires review | Medium to high | High | Safety-focused cascade planning with bounded but not probabilistically calibrated uncertainty |
| Stochastic or ensemble optimization | Represents scenario probabilities and consequence distributions explicitly | Scenario count, probability calibration and compute grow quickly | High | Very high | Multi-reservoir advisory planning with calibrated ensembles and sufficient decision time |

Recommend a structure-resolved continuity model with monotone interpolated curves; add optimization only after legal/operational constraints and human authority are governed. No universal symmetric-gate assumption or universal N-1 operability claim is accepted.

## Governing equations and implementation form

Follow continuity and outlet authorities in the [reservoir foundation](../00-foundations/04-reservoir-operations.md): discrete storage change equals integrated inflow minus total release/spill and declared losses. Convert storage to level/area through versioned monotone curves. Outlet, orifice, weir/spillway, gate and turbine equations use applicable head/tailwater/submergence regimes; ramp and gate limits constrain successive commands.

## Variables, units, parameters and bounds

Storage `S` [m3], elevation `H` [m in named datum], area [m2], inflow/release `Q` [m3/s], gate opening [m or % with definition], head [m], coefficients [-], power [W or MW], ramp [m3/s per time], environmental minimum [m3/s] and rule-curve levels [m]. Curve domains and all hard limits are versioned; extrapolation is prohibited unless explicitly reviewed.

## Data structures and serialization

`Reservoir`, `StorageCurve`, `HydraulicStructure`, `ConstraintSet`, `OperatingRuleVersion`, `ReservoirState`, `ReleasePlan` and `CascadeExchange` retain source document, effective period, datum, units, provenance, approval/review status, uncertainty and run lineage.

## Update cadence and triggering events

Recompute on accepted inflow forecast/observation, state update, tailwater change, rule/constraint version or authorized scenario request. Control interval and numerical step are distinct. Late data creates a new scenario/run, not an edited release history.

## Spatial and temporal resolution

Each reservoir is a control volume unless stratification or distributed routing is justified. Time steps resolve inflow/release changes, travel time and ramp constraints; cascade messages include valid time and travel-time uncertainty.

## Complexity and resource use

Single-reservoir routing scales with steps and structures; cascade simulation scales with reservoirs, links, alternatives and iterations; optimization may grow with controls, horizons and scenarios. Resource claims remain targets until benchmark evidence exists.

## Initialization, warm-up and boundary conditions

Initialize with `MEASURED` level/storage conversion or explicit `ASSUMED` state and uncertainty. Boundary conditions include inflow, tailwater, losses and downstream constraints. Validate curve domain and continuity at initialization; no silent clipping to legal/physical limits.

## Calibration method and observations

Estimate uncertain curve/structure parameters only from governed surveys, tests and `MEASURED` level-inflow-release records. Separate sensor bias, balance residual and operating uncertainty. Legal constraints and plant geometry are not free calibration parameters.

## Validation metrics, datasets and acceptance thresholds

On independent periods, report storage/level residual, release error by structure, event volume balance, spill onset/timing, ramp/constraint compliance and cascade arrival error. Acceptance thresholds must be approved by relevant disciplines and authorities; this document asserts none.

## Verification tests and invariants

Test closed-basin conservation, monotonic curve interpolation, zero/head-limited flows, structure regime transitions, bounds/ramp enforcement, environmental release, no-negative storage, deterministic replay and cascade message conservation. Test asymmetric/failed gate configurations; do not encode blanket N-1 availability.

## Visualization derived from measurable state

Display level, storage, inflow, release, spill and constraint margin from normalized state with datum/units/time/provenance. Gate animation reflects a supplied structure-specific opening or is labelled schematic; it cannot imply identical gates or actual operability.

## Assumptions and limitations

Level-pool mixing, curve stationarity and simplified losses may not hold. Demo geometry and thresholds are not authoritative. Plant geometry, legal limits and operating interpretations require versioned primary provenance and qualified review.

## Failure detection, degraded behavior and recovery

Detect balance error, curve/domain violation, conflicting constraints, impossible commands, stale inflow/state, tailwater mismatch and cascade non-convergence. Reject unsafe/unsupported plans and retain advisory “unavailable” state; recover via corrected governed inputs and a new auditable run.

## Future extensions and scientific prerequisites

Ensemble optimization, hydropower efficiency, sediment/storage evolution, probabilistic reliability and emergency drawdown need plant data, operating authority, uncertainty models and reviewed objectives/constraints.

## Implementation evidence and traceability

Demo claims are bounded by [DATA_AND_METHODS](../../DATA_AND_METHODS.md). Production traceability binds every curve, structure, legal/operating rule, scenario, input, model/config version, verification result, reviewer and human disposition to immutable evidence.

## Next

Route releases through the [River Network model](07-river-network-model.md) and [Hydraulic model](05-hydraulic-model.md).
