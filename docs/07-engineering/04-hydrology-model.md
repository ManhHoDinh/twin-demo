# Hydrology Model

| Field | Value |
|---|---|
| Document ID | ENG-04 |
| Owner | Hydrology lead |
| Status | REFERENCE MODEL |
| Current demo | Deterministic analytic rainfall-runoff heuristic using `SYNTHETIC` forcing and parameters; it is not exactly a Nash cascade and is not calibrated |
| Production target | Versioned, event-tested rainfall-runoff model selected conditionally from data availability, basin response and operational need |
| Domain review | Catchment hydrology, hydro-meteorology and local basin operations |
| Authoritative dependencies | [Hydrology foundation](../00-foundations/02-hydrology.md), [observation model](../01-domain-model/03-observation-model.md), [scientific architecture](01-scientific-architecture.md), [river network](07-river-network-model.md) |

## Purpose and scope

Convert rainfall and catchment condition into uncontrolled runoff and inflow hydrographs for river, reservoir and hydraulic boundaries. Controlled reservoir releases remain Reservoir outputs; the Hydrology output contract keeps controlled and uncontrolled components distinct.

## Scientific and implementation status

The browser demonstration is `IMPLEMENTED` as a deterministic workflow but its hydrology is `SYNTHETIC`, not an operational model. Production selection, parameterization, calibration and local review are `PLANNED`; rainfall areal-reduction-factor (ARF) interpretation and empirical time-of-concentration use are `REQUIRES DOMAIN REVIEW`.

## Inputs

- Rainfall fields by valid time and issue time: gauge/radar `MEASURED`, NWP `FORECAST`, or explicitly `SYNTHETIC`.
- Subcatchment polygons, area, slope, drainage length, soil/land-cover descriptors and reach outlet mapping.
- Antecedent moisture or model states, evapotranspiration where required, observed discharge/stage with rating-curve provenance, and controlled releases supplied separately.

## Outputs

Time-indexed direct runoff, baseflow where modeled, losses, soil/store states, lateral inflow by reach, uncontrolled reservoir inflow and uncertainty/quality flags. Total downstream boundary flow may be assembled only from traceable controlled plus uncontrolled components.

## Dependencies and allowed dependency direction

Weather and Data Pipeline provide forcing; GIS and River Network provide spatial support; Reservoir may provide controlled feedback for a coupled run. Hydrology publishes inflow to Reservoir and Hydraulic. Visualization cannot alter rainfall, state, parameters or hydrographs; see the [allowed engine DAG](02-simulation-architecture.md).

## Accepted alternatives and recommended method

| Method | Advantages | Principal limitations | Computational cost | Implementation complexity | Suitable use cases |
|---|---|---|---|---|---|
| Unit hydrograph | Transparent, causal event transform with modest data and easy volume checks | Limited continuous soil-memory and transferability outside the derived response regime | Low | Low | Event forecasting where effective rainfall and a defensible response kernel exist |
| Conceptual store model | Interpretable water balance, antecedent state and continuous operation with few states | Equifinality and parameter identifiability; spatial behavior is aggregated | Low to medium | Medium | Operational catchment forecasting with multi-event rainfall and discharge records |
| HBV/GR4J-class conceptual model | Mature parsimonious structures, established calibration practice and strong baseline value | Requires bounded calibration; regional transfer and nonstationarity need evidence | Low to medium | Medium | Production baseline when continuous forcing and multiple independent events are available |
| Semi-distributed model | Represents subcatchment forcing and response differences while retaining interpretable routing | More parameters, spatial data and calibration burden; false spatial precision is possible | Medium | Medium to high | Basins where rainfall gradients, tributaries or reservoir inflows require separate response units |
| Fully distributed model | Resolves spatial runoff generation and supports gridded coupling | High data, compute and identifiability burden; detail can exceed observation support | High | High | Research or operational cases where dense forcing, terrain/soil data and spatial validation justify the resolution |

Recommended production method is conditional: begin with the least complex conceptual or HBV/GR4J-class model that meets predeclared validation needs; adopt distributed structure only when spatial evidence and decisions require it. The current analytic heuristic is not to be relabeled as Nash, HBV or GR4J.

## Governing equations and implementation form

Use the water-balance, loss, transform and routing authorities in the [hydrology foundation](../00-foundations/02-hydrology.md). A discrete implementation must close, for each subcatchment and step, rainfall volume minus interception/infiltration/evaporation and storage change equals generated runoff plus declared numerical residual. Store updates use bounded non-negative states; the transform produces a causal hydrograph; routing passes mass-conserving lateral inflow to the network.

## Variables, units, parameters and bounds

Core quantities are rainfall `P` [mm/time], effective rainfall [mm/time], catchment area [m2], discharge `Q` [m3/s], store depths [mm], soil moisture fraction [0,1], loss rates [mm/time], lag/time constants [s or h], and dimensionless shape/runoff coefficients. Physical states cannot be negative. Parameter bounds come from literature, local data and sensitivity review, not visual tuning. ARF must not be applied twice across gridded rainfall and catchment averaging.

## Data structures and serialization

`RainfallField`, `Subcatchment`, `HydrologyState`, `HydrologyParameterSet`, `InflowSeries` and `HydrologyRunManifest` carry CRS, units, valid/issue time, provenance, quality, uncertainty, model/config version and lineage using the [normalized quantity envelope](01-scientific-architecture.md).

## Update cadence and triggering events

Trigger a new immutable run for a material forcing issue, accepted observation/QC revision, parameter/model version, scenario or reservoir-coupling request. Solver steps may differ from output cadence but aggregation must conserve volume and preserve peaks/timing within declared error.

## Spatial and temporal resolution

Subcatchments and time steps must resolve rainfall variability and response time without implying detail unsupported by observations. Resolution selection is tested for convergence and decision sensitivity; Kirpich-derived timing is not automatically valid outside its empirical catchment and channel domain.

## Complexity and resource use

Unit-hydrograph and lumped store methods scale approximately with subcatchments times time steps; distributed methods additionally scale with grid cells and routing edges. Resource budgets are targets until measured on declared hardware and events; no runtime claim is made here.

## Initialization, warm-up and boundary conditions

Initialize antecedent stores from observations, a documented warm-up, or an `ASSUMED` state with sensitivity range. Boundary inputs include rainfall support, evapotranspiration policy, upstream flow and controlled releases. A cold start cannot be presented with the same confidence as a warmed, observed state.

## Calibration method and observations

Calibrate bounded parameters against multiple `MEASURED` rainfall-discharge events or continuous periods, using multi-objective residuals and identifiability/sensitivity analysis. Separate event and spatial calibration/validation splits; retain parameter ensembles or non-identifiable ranges. Rating-curve and gauge uncertainty belongs in the objective and evidence.

## Validation metrics, datasets and acceptance thresholds

Report NSE, KGE, volume bias/error, peak magnitude error and peak timing error, with hydrograph/residual diagnostics and stratification by event magnitude/season/location. Thresholds must be defined before validation and approved for intended decisions; none are claimed approved in this document.

## Verification tests and invariants

Test unit conversions, zero-rain response, non-negative states, causal response, water-balance closure, controlled/uncontrolled separation, deterministic replay, timestep sensitivity, analytic limiting cases and mass-preserving aggregation. Include adversarial ARF double-application and Kirpich out-of-domain flags.

## Visualization derived from measurable state

Maps and charts may show rainfall, losses, stores and inflow only from normalized fields with units, time, provenance and uncertainty. Animation smoothing cannot change hydrograph peak, volume or timing; `SYNTHETIC`, `MODELLED`, `FORECAST` and `MEASURED` series remain visually distinguishable.

## Assumptions and limitations

The current heuristic omits defensible local calibration and may omit snow, groundwater, urban drainage, landslide/debris and reservoir-backwater effects. ARF conventions may conflict across sources. Kirpich is an empirical relation with domain risk, not a universal travel-time law.

## Failure detection, degraded behavior and recovery

Detect missing/stale forcing, invalid units/CRS, negative rainfall, state/balance violations, unsupported extrapolation and solver divergence. Degrade to last valid output only with stale marking, or halt dependent forecast products. Recovery creates a new run from corrected immutable inputs; it never overwrites prior evidence.

## Future extensions and scientific prerequisites

Ensemble forcing, radar-gauge merging, data assimilation, spatial parameter regionalization and climate/nonstationarity studies require governed observations, uncertainty models and independent domain review before operational use.

## Implementation evidence and traceability

Demo method and provenance claims are bounded by [DATA_AND_METHODS](../../DATA_AND_METHODS.md). Production evidence must link model source/configuration, input hashes, parameter set, event split, verification results, validation report and reviewer disposition to a run ID.

## Next

Pass hydrologic boundaries through the [River Network model](07-river-network-model.md) into the [Hydraulic model](05-hydraulic-model.md).
