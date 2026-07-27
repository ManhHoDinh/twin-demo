# Engine Contract Catalog

| Field | Value |
|---|---|
| Document ID | ENG-03 |
| Owner | Scientific engineering lead |
| Status | REFERENCE MODEL |
| Current demo | Twelve logical capabilities exist with uneven implementation and synthetic scientific state |
| Production target | Independently versioned engines with enforced contracts, evidence and claim gates |
| Domain review | Hydrology, hydraulics, reservoir, meteorology, GIS, dam safety, emergency management |
| Authoritative dependencies | [Scientific architecture](01-scientific-architecture.md), [Simulation architecture](02-simulation-architecture.md), [Foundations](../00-foundations/01-glossary.md), [Demo evidence](../../DATA_AND_METHODS.md) |

This catalog defines boundaries and exchange obligations. It anchors equations and domain facts to existing authorities instead of duplicating them. A status of `IMPLEMENTED` means implementation evidence exists, not that the engine is calibrated, validated, operationally approved or legally authoritative.

## Allowed dependency edges

This table is exhaustive. `READ` consumes an immutable published contract. `FEEDBACK` is an orchestrated, time-indexed coupling exchange. `REQUEST` configures a new, separately identified run and cannot mutate accepted inputs or results. Any unlisted edge is prohibited.

| Source | Consumer | Payload | Mode |
|---|---|---|---|
| Terrain | Weather | Elevation/support for reviewed downscaling | READ |
| Terrain | River Network | Elevation, slope and spatial support | READ |
| Terrain | Hydraulic | Land/bed elevation, masks and mesh support | READ |
| Terrain | Flood Propagation | Elevation and spatial support | READ |
| Terrain | Digital Twin | Versioned terrain state and lineage | READ |
| Terrain | Visualization | Display terrain derived from published elevation | READ |
| Weather | Hydrology | Observed/forecast forcing | READ |
| Weather | Digital Twin | Versioned forcing state and lineage | READ |
| Weather | Scenario | Forcing members and issue/valid-time metadata | READ |
| River Network | Hydrology | Catchment/reach topology and control points | READ |
| River Network | Reservoir | Cascade topology, reaches and controls | READ |
| River Network | Hydraulic | Reaches, junctions, structures and boundaries | READ |
| River Network | Flood Propagation | Connectivity and spatial references | READ |
| River Network | Digital Twin | Versioned topology state and lineage | READ |
| Hydrology | Reservoir | Reservoir inflow hydrographs | READ |
| Hydrology | Hydraulic | Lateral/upstream hydrographs | READ |
| Hydrology | Digital Twin | Runoff, inflow and hydrograph state | READ |
| Reservoir | Hydrology | Controlled release/storage feedback for the next coupling iteration | FEEDBACK |
| Reservoir | Hydraulic | Releases, levels and structure boundaries | READ |
| Reservoir | Digital Twin | Storage, level, release and constraint state | READ |
| Hydraulic | Flood Propagation | Accepted depth, stage, discharge, velocity and wet/dry state | READ |
| Hydraulic | Digital Twin | Accepted hydraulic state and diagnostics | READ |
| Flood Propagation | Digital Twin | Extent, arrival, duration and hazard products | READ |
| Flood Propagation | Scenario | Versioned derived products for comparison | READ |
| Flood Propagation | Visualization | Extent, arrival and hazard display state | READ |
| Digital Twin | Scenario | Immutable baseline/entity snapshots | READ |
| Digital Twin | Decision Support | Normalized physical and derived state | READ |
| Digital Twin | AI Explanation | Grounded physical/entity state | READ |
| Digital Twin | Visualization | Normalized inspectable state | READ |
| Scenario | Hydrology | New-run forcing/parameter configuration | REQUEST |
| Scenario | Reservoir | New-run action/constraint configuration | REQUEST |
| Scenario | Hydraulic | New-run boundary/model configuration | REQUEST |
| Scenario | Flood Propagation | New-run product/threshold configuration | REQUEST |
| Scenario | Decision Support | Alternatives, ensembles and counterfactual results | READ |
| Scenario | AI Explanation | Scenario identity and comparison evidence | READ |
| Scenario | Visualization | Scenario results and differences | READ |
| Decision Support | Scenario | New immutable scenario run request with reviewed objective/context | REQUEST |
| Decision Support | AI Explanation | Decision package, evidence and limitations | READ |
| Decision Support | Visualization | Options, constraints and uncertainty for display | READ |

AI Explanation and Visualization have no outgoing scientific-state edges. Controlled Hydrology/Reservoir feedback and every `REQUEST` exchange pass through the orchestrator described in [Simulation architecture](02-simulation-architecture.md#orchestration-and-coupling-exchanges).

## Terrain Engine

| Contract field | Contract value |
|---|---|
| Purpose and scope | Own immutable elevation, land/bed support, masks and terrain derivatives; never infer hydrology. |
| Scientific and implementation status | `IMPLEMENTED` external AWS raster loading and procedural fallback; `PLANNED` controlled production terrain; bathymetry `REQUIRES DOMAIN REVIEW`. |
| Inputs | Versioned DEM/DTM or survey points; CRS, horizontal/vertical datum, acquisition time, quality, license and `MEASURED`/source provenance. |
| Outputs | Elevation `m`, slope/aspect, masks and mesh/grid identifiers in normalized envelopes. |
| Dependencies and allowed dependency direction | No scientific-engine dependency. Weather, River Network, Hydraulic, Flood Propagation, Digital Twin and Visualization may read Terrain; Terrain cannot read their state. |
| Accepted alternatives and recommended method | Raster DEM, TIN or surveyed mesh. Recommend controlled DTM plus surveyed channel/bathymetric mesh after review. |
| Governing equations and implementation form | Terrain interpolation and derivatives only; scientific formulations remain anchored in [hydraulics foundations](../00-foundations/03-hydraulics-and-routing.md). |
| Variables, units, parameters and bounds | Elevation `z` in `m`; CRS/datum required; no invented bathymetric bounds. |
| Data structures and serialization | Versioned raster tiles, TIN/mesh and metadata manifest; lossless scientific storage, display tiles derived downstream. |
| Update cadence and triggering events | On source/version change; static within a run. |
| Spatial and temporal resolution | Native source resolution retained; exchange resolution declares resampling and no-data behavior. |
| Complexity and resource use | Loading/tiling linear in cells; meshing and GPU budgets measured per dataset. |
| Initialization, warm-up and boundary conditions | Validate coverage, CRS, datum, holes and vertical units before publishing. |
| Calibration method and observations | Survey control-point bias correction where justified; no visual-fit calibration. |
| Validation metrics, datasets and acceptance thresholds | Vertical RMSE/bias and coverage against withheld survey controls; thresholds set before acceptance. |
| Verification tests and invariants | CRS round-trip, unit/datum checks, tile seam checks, monotonic mesh indexing and deterministic resampling. |
| Visualization derived from measurable state | Hillshade, contours and mesh derive from elevation; exaggeration is display-only and labelled. |
| Assumptions and limitations | AWS Terrain is an external raster, not surveyed bathymetry; procedural fallback is `SYNTHETIC`. |
| Failure detection, degraded behavior and recovery | Reject datum/CRS mismatch; expose gaps; use fallback only as non-operational degraded display state. |
| Future extensions and scientific prerequisites | Surveyed bathymetry, change detection and uncertainty surfaces require acquisition and domain review. |
| Implementation evidence and traceability | Current source and fallback behavior: [DATA_AND_METHODS](../../DATA_AND_METHODS.md). |
| Next | [Hydraulic Engine](#hydraulic-engine) |

## Hydrology Engine

| Contract field | Contract value |
|---|---|
| Purpose and scope | Transform weather and antecedent catchment state into runoff, reservoir inflow and lateral hydrographs. |
| Scientific and implementation status | `IMPLEMENTED` analytic `SYNTHETIC` demo; production method `REFERENCE MODEL` pending calibration and validation. |
| Inputs | QC rainfall/forecast, catchments, antecedent state, terrain/network attributes and observed discharge with units and time semantics. |
| Outputs | Discharge hydrographs `m3/s`, runoff depth `mm`, state variables, ensembles/intervals and contribution metadata. |
| Dependencies and allowed dependency direction | Reads Weather, Terrain, River Network and controlled Reservoir feedback through orchestration; supplies Reservoir, Hydraulic and Digital Twin; no rendering dependency. |
| Accepted alternatives and recommended method | Unit hydrograph, conceptual rainfall-runoff, distributed process model or ML hybrid. Select by data, scale and decision need. |
| Governing equations and implementation form | Use the authoritative [hydrology foundations](../00-foundations/02-hydrology.md); implementations record discrete form and conservation residual. |
| Variables, units, parameters and bounds | Rainfall `mm/h`, discharge `m3/s`, area `km2`, storage/state and bounded calibrated parameters. |
| Data structures and serialization | Catchment graph, forcing arrays, parameter set and quantity-envelope time series serialized with run/model versions. |
| Update cadence and triggering events | On new forcing/QC version and scheduled forecast cycle; event reruns are immutable. |
| Spatial and temporal resolution | Catchment/sub-catchment support and time step justified against response time and input resolution. |
| Complexity and resource use | Typically linear in catchments, time steps and ensemble members; report runtime and memory. |
| Initialization, warm-up and boundary conditions | Warm antecedent state from observations or declared spin-up; boundary gaps lower confidence. |
| Calibration method and observations | Calibrate against observed discharge and internal states where available, with bounded parameters and split events. |
| Validation metrics, datasets and acceptance thresholds | Bias, NSE/KGE, peak error, volume error, timing error and interval coverage; thresholds predefined by use. |
| Verification tests and invariants | Water balance, non-negative state/flow, unit checks, deterministic replay and parameter-bound tests. |
| Visualization derived from measurable state | Hyetographs/hydrographs and contribution views use computed series; animation never creates runoff. |
| Assumptions and limitations | Demo gain/lag and ensemble spread are `SYNTHETIC`; transfer across events/basins is unsupported. |
| Failure detection, degraded behavior and recovery | Flag stale/missing forcing, mass-balance error or extrapolation; suppress actionable forecast when unusable. |
| Future extensions and scientific prerequisites | Real ensembles, data assimilation and distributed states require feeds, observations and identifiability review. |
| Implementation evidence and traceability | Demo method and limitations: [DATA_AND_METHODS](../../DATA_AND_METHODS.md); science: [hydrology](../00-foundations/02-hydrology.md). |
| Next | [Reservoir Engine](#reservoir-engine) |

## Hydraulic Engine

| Contract field | Contract value |
|---|---|
| Purpose and scope | Solve river/floodplain hydraulic state: stage, depth, discharge and depth-averaged velocity. |
| Scientific and implementation status | `IMPLEMENTED` browser virtual-pipe demonstration; validated hydraulic production solver is `PLANNED`. |
| Inputs | Terrain/bed geometry, network, inflow/lateral hydrographs, reservoir releases, downstream boundaries, roughness and structures. |
| Outputs | Stage/depth `m`, discharge `m3/s`, velocity `m/s`, wet/dry state and solver diagnostics. |
| Dependencies and allowed dependency direction | Reads Terrain, River Network, Hydrology and Reservoir; supplies Flood Propagation and Digital Twin only downstream. |
| Accepted alternatives and recommended method | 1D Saint-Venant, coupled 1D/2D or 2D shallow water. Recommend after regime/data/runtime comparison. |
| Governing equations and implementation form | Use [hydraulics and routing foundations](../00-foundations/03-hydraulics-and-routing.md); document numerical flux, friction and wet/dry form. |
| Variables, units, parameters and bounds | Depth/stage `m`, velocity `m/s`, discharge `m3/s`, roughness and CFL/stability bounds. |
| Data structures and serialization | Versioned mesh/network, boundary series, solver state/checkpoints and envelope fields keyed by run/time. |
| Update cadence and triggering events | Per stable solver step; publish at declared exchange interval after convergence/quality checks. |
| Spatial and temporal resolution | Mesh and step demonstrate convergence and resolve decision-relevant channels/structures; not chosen for appearance. |
| Complexity and resource use | 1D scales with reaches; 2D with wet cells and time steps; CPU/GPU and memory measured. |
| Initialization, warm-up and boundary conditions | Dry/wet initialization, warm-up, upstream/downstream/lateral boundaries and structure states declared. |
| Calibration method and observations | Roughness/structure parameters against observed stage, discharge, extent and timing with physical bounds. |
| Validation metrics, datasets and acceptance thresholds | Stage/flow error, arrival/peak timing, extent skill, velocity where observed and conservation; thresholds predefined. |
| Verification tests and invariants | Mass conservation, still-water, uniform-flow, wet/dry, structure, mesh-convergence and replay tests. |
| Visualization derived from measurable state | Surface elevation, depth bands and motion use solver fields; absent velocity is shown as not computed. |
| Assumptions and limitations | Current browser water/velocity is `SYNTHETIC` demonstration, not validated hydraulics; AWS terrain lacks surveyed bathymetry. |
| Failure detection, degraded behavior and recovery | Detect instability, non-convergence, negative depth and balance error; stop dependent flood products or publish explicit degraded state. |
| Future extensions and scientific prerequisites | Reviewed 1D/2D coupling, structures, tide/backwater and assimilation require surveyed geometry and observations. |
| Implementation evidence and traceability | Demo implementation: [DATA_AND_METHODS](../../DATA_AND_METHODS.md); current gaps: [demo analysis](../99-appendix/demo-gap-analysis.md). |
| Next | [Flood Propagation Engine](#flood-propagation-engine) |

## Weather Engine

| Contract field | Contract value |
|---|---|
| Purpose and scope | Own weather observations and issued forecasts used as forcing, without computing runoff. |
| Scientific and implementation status | Demo forcing is `IMPLEMENTED` as `SYNTHETIC`; operational observation/forecast ingestion is `PLANNED`. |
| Inputs | Gauge, radar, satellite, NWP/ensemble products with source, issue/valid time, QC and spatial support. |
| Outputs | Rainfall and meteorological forcing fields/series with provenance, uncertainty and member identity. |
| Dependencies and allowed dependency direction | May read Terrain for downscaling; supplies Hydrology, Digital Twin and Scenario; never reads flood visuals or decisions. |
| Accepted alternatives and recommended method | Gauge interpolation, radar-gauge merge, satellite correction and NWP ensembles; recommend blended ensemble after skill review. |
| Governing equations and implementation form | Methods and forecast skill remain anchored in [meteorology foundations](../00-foundations/06-meteorology-and-forecasting.md). |
| Variables, units, parameters and bounds | Rainfall `mm`/`mm/h`, temperature `degC`, wind `m/s`, probabilities and calibrated correction parameters. |
| Data structures and serialization | Immutable observation/forecast messages, grids and ensemble-member arrays with source/model versions. |
| Update cadence and triggering events | Source-driven ingest plus forecast issue cycles; late data creates a new version. |
| Spatial and temporal resolution | Retain native support; downscaling declares method, conservation and effective resolution. |
| Complexity and resource use | Linear in grid cells/members; merging/downscaling cost measured and bounded. |
| Initialization, warm-up and boundary conditions | Validate source clock, accumulation window, units, member completeness and domain coverage. |
| Calibration method and observations | Bias correction against quality-controlled observations using training periods separated from validation. |
| Validation metrics, datasets and acceptance thresholds | Bias, RMSE/MAE, CRPS/Brier, reliability, detection and spatial skill with lead-time thresholds. |
| Verification tests and invariants | Accumulation conservation, time-window, unit, member-order, no-data and deterministic transform tests. |
| Visualization derived from measurable state | Rain intensity and ensemble uncertainty map only supplied forcing; decorative rain is labelled and deterministic. |
| Assumptions and limitations | Named forecast products in the demo do not imply live data use; analytic forcing is `SYNTHETIC`. |
| Failure detection, degraded behavior and recovery | Expose stale/missing members and QC rejection; cap confidence or refuse forecast-dependent advice. |
| Future extensions and scientific prerequisites | Radar nowcasting and calibrated multi-model ensembles require licensed feeds and local verification. |
| Implementation evidence and traceability | Demo forcing inventory: [DATA_AND_METHODS](../../DATA_AND_METHODS.md); science: [meteorology](../00-foundations/06-meteorology-and-forecasting.md). |
| Next | [Hydrology Engine](#hydrology-engine) |

## Reservoir Engine

| Contract field | Contract value |
|---|---|
| Purpose and scope | Compute storage, level, inflow, release and structure state subject to physical and reviewed operating constraints. |
| Scientific and implementation status | `IMPLEMENTED` synthetic continuity/policy demonstration; production operations are `PLANNED` and `REQUIRES DOMAIN REVIEW`. |
| Inputs | Hydrology inflow, storage/elevation curves, outlet/spillway/gate data, initial state, constraints and approved actions. |
| Outputs | Storage `m3`, level `m a.s.l.`, release `m3/s`, gate/structure state, margins and constraint diagnostics. |
| Dependencies and allowed dependency direction | Reads Hydrology and River Network; supplies Hydraulic, controlled Hydrology coupling and Digital Twin. Decision Support consumes this state through Digital Twin/Scenario contracts. |
| Accepted alternatives and recommended method | Rule simulation, constrained optimization or MPC. Recommend transparent constraint-first evaluation before optimization. |
| Governing equations and implementation form | Use [reservoir operations foundations](../00-foundations/04-reservoir-operations.md); implementation records continuity and structure forms. |
| Variables, units, parameters and bounds | Storage `m3`, level `m`, flows `m3/s`, gate opening, ramp rates and reviewed bounds. |
| Data structures and serialization | Curves, structures, constraint set, schedule, state series and decision lineage serialized per run. |
| Update cadence and triggering events | Each coupling step and on approved action/scenario change; commands remain separate from simulated state. |
| Spatial and temporal resolution | Step resolves inflow/release changes, travel times and operational ramp constraints. |
| Complexity and resource use | Simulation linear in reservoirs/time; optimization reports variables, constraints, scenarios and solve time. |
| Initialization, warm-up and boundary conditions | Observed or explicit `ASSUMED` initial storage/level; warm-up and cascade boundaries declared. |
| Calibration method and observations | Curves/structure coefficients from surveys/tests; routing and losses against observed operations. |
| Validation metrics, datasets and acceptance thresholds | Mass balance, level/release error, structure response and constraint reproduction on withheld events. |
| Verification tests and invariants | Continuity residual, curve monotonicity, gate/ramp/bound checks, legal state transitions and replay. |
| Visualization derived from measurable state | Level, storage, release and margins derive from state; gate animation cannot alter release. |
| Assumptions and limitations | Demo parameters/telemetry are synthetic or plausible; legal thresholds and dam-safety values require review. |
| Failure detection, degraded behavior and recovery | No silent constraint relaxation; infeasible/non-converged schedules are labelled and not actionable. |
| Future extensions and scientific prerequisites | Real telemetry, gate hydraulics, cascade MPC and shadow operation require owner data and formal review. |
| Implementation evidence and traceability | Demo method: [DATA_AND_METHODS](../../DATA_AND_METHODS.md); authority: [reservoir operations](../00-foundations/04-reservoir-operations.md). |
| Next | [Decision Support Engine](#decision-support-engine) |

## River Network Engine

| Contract field | Contract value |
|---|---|
| Purpose and scope | Own directed reaches, junctions, diversions, structures, control points and connectivity. |
| Scientific and implementation status | Demo topology is partly `IMPLEMENTED`; controlled hydrologic/hydraulic network is `PLANNED`. |
| Inputs | Survey/GIS hydrography, catchments, structures, station locations, reach attributes, CRS and version. |
| Outputs | Validated directed graph, reach geometry/attributes, adjacency, travel support and stable identifiers. |
| Dependencies and allowed dependency direction | May read Terrain/GIS source; supplies Hydrology, Reservoir, Hydraulic, Flood Propagation and Digital Twin. |
| Accepted alternatives and recommended method | Node-edge graph, linear referencing or mesh-coupled network. Recommend stable versioned directed multigraph. |
| Governing equations and implementation form | Routing physics belongs to Hydrology/Hydraulic; network enforces topology and geometric invariants. |
| Variables, units, parameters and bounds | Length `m`, slope, chainage, bed/section references, connectivity and optional travel-time metadata. |
| Data structures and serialization | Versioned nodes, reaches, junctions and structures in geospatial plus compact graph serialization. |
| Update cadence and triggering events | On controlled geometry/configuration release, not per simulation step. |
| Spatial and temporal resolution | Reach segmentation follows topology, controls and model discretization; display simplification is separate. |
| Complexity and resource use | Storage linear in nodes/edges; traversal linear in graph; spatial indexing measured. |
| Initialization, warm-up and boundary conditions | Validate IDs, CRS, direction, junction continuity, cycles/diversions and boundary nodes. |
| Calibration method and observations | Geometry from survey; routing parameters are calibrated in consuming scientific engines. |
| Validation metrics, datasets and acceptance thresholds | Topology against authoritative hydrography and field knowledge; location/geometry errors within predefined tolerances. |
| Verification tests and invariants | No orphan endpoints, invalid direction, unintended cycles, duplicate IDs or broken station/reach references. |
| Visualization derived from measurable state | River lines and flow arrows follow network and modelled direction; styling cannot change connectivity. |
| Assumptions and limitations | Demo coordinates/topology support demonstration and may not represent surveyed cross-sections or complete diversions. |
| Failure detection, degraded behavior and recovery | Quarantine invalid versions; dependent engines cannot run with broken topology. |
| Future extensions and scientific prerequisites | Surveyed cross-sections, structures and dynamic connectivity require acquisition and hydraulic review. |
| Implementation evidence and traceability | Current coordinate/source inventory: [DATA_AND_METHODS](../../DATA_AND_METHODS.md); entity authority: [entity model](../01-domain-model/01-entity-model.md). |
| Next | [Hydraulic Engine](#hydraulic-engine) |

## Flood Propagation Engine

| Contract field | Contract value |
|---|---|
| Purpose and scope | Derive flood extent, arrival, duration, thresholds and hazard products from Hydraulic state. |
| Scientific and implementation status | Demo derived flood field is `IMPLEMENTED` as `SYNTHETIC`; production derived products are `PLANNED`. |
| Inputs | Version-matched Hydraulic depth/velocity/stage, Terrain, River Network, thresholds and exposure references. |
| Outputs | Extent polygons/cells, first-arrival/peak/duration, hazard classes and threshold exceedance with uncertainty. |
| Dependencies and allowed dependency direction | Reads Hydraulic, Terrain and River Network; supplies Digital Twin, Scenario and Visualization. Decision Support consumes these products through Digital Twin/Scenario contracts; Flood Propagation never writes Hydraulic state. |
| Accepted alternatives and recommended method | Cell thresholding/connectivity, time-of-first-crossing and reviewed hazard classifications; recommend deterministic derived transforms. |
| Governing equations and implementation form | No substitute flow solver. Derived equations/thresholds link to [hydraulics](../00-foundations/03-hydraulics-and-routing.md) and exposure authority. |
| Variables, units, parameters and bounds | Depth `m`, velocity `m/s`, arrival/duration `s`, extent, thresholds and uncertainty bands. |
| Data structures and serialization | Run/time-keyed raster/vector products referencing immutable Hydraulic field versions. |
| Update cadence and triggering events | After each accepted Hydraulic publication or completed scenario interval. |
| Spatial and temporal resolution | Cannot exceed source Hydraulic resolution; aggregation and threshold hysteresis declared. |
| Complexity and resource use | Linear in cells/time slices plus connectivity/vectorization costs; cache keyed by source version. |
| Initialization, warm-up and boundary conditions | Require baseline wet/dry definition, analysis window, thresholds and complete source run identity. |
| Calibration method and observations | Derived thresholds require domain review; no calibration against appearance. |
| Validation metrics, datasets and acceptance thresholds | Extent CSI/F1, arrival/duration error and hazard-class agreement against independent observations. |
| Verification tests and invariants | Source-version match, monotonic first-arrival, connectivity, threshold and no-upstream-write tests. |
| Visualization derived from measurable state | Extent, arrival and hazard maps derive only from products; uncertainty remains visible. |
| Assumptions and limitations | Demo field is capped and floodplain-limited; it is not evidence of validated propagation. |
| Failure detection, degraded behavior and recovery | If Hydraulic fails or versions mismatch, withhold new products and report dependency failure. |
| Future extensions and scientific prerequisites | Impact coupling and probabilistic products require validated hydraulics, exposure data and reviewed thresholds. |
| Implementation evidence and traceability | Demo field method: [DATA_AND_METHODS](../../DATA_AND_METHODS.md); exposure authority: [exposure model](../01-domain-model/04-exposure-and-impact-model.md). |
| Next | [Digital Twin Engine](#digital-twin-engine) |

## Digital Twin Engine

| Contract field | Contract value |
|---|---|
| Purpose and scope | Align versioned observations, model outputs and entity state without becoming a new scientific solver. |
| Scientific and implementation status | Entity/state integration is partly `IMPLEMENTED`; production synchronization and persistence are `PLANNED`. |
| Inputs | Normalized outputs from scientific engines, observation entities, run manifests and quality/provenance metadata. |
| Outputs | Entity-addressable current/historical state, lineage, freshness, health and consistent run snapshots. |
| Dependencies and allowed dependency direction | Reads all physical/derived engines; supplies Scenario, Decision Support, AI Explanation and Visualization; no reverse mutation. |
| Accepted alternatives and recommended method | Event-sourced state, immutable snapshots or bitemporal store. Recommend immutable run snapshots plus event lineage. |
| Governing equations and implementation form | No governing physical equation; preserves units, time, provenance and model identity. |
| Variables, units, parameters and bounds | Entity/run/source IDs, event/issue/ingest times, freshness, confidence and typed quantities. |
| Data structures and serialization | Schema-versioned envelopes, entity snapshots and append-only events; serialization rejects unknown unit/datum semantics. |
| Update cadence and triggering events | On accepted observation/model publication; atomic snapshots prevent mixed run versions. |
| Spatial and temporal resolution | Preserves source support and time; does not manufacture finer resolution. |
| Complexity and resource use | Linear ingest plus indexed entity/time queries; retention and latency measured. |
| Initialization, warm-up and boundary conditions | Load schema registry, entity graph and last complete snapshot; partial recovery remains quarantined. |
| Calibration method and observations | Not applicable scientifically; synchronization policies tested against known event streams. |
| Validation metrics, datasets and acceptance thresholds | Completeness, consistency, lineage, freshness and bitemporal query accuracy acceptance tests. |
| Verification tests and invariants | Schema, referential integrity, atomicity, idempotency, ordering and mixed-version rejection. |
| Visualization derived from measurable state | Inspectors query stored envelopes; display state never becomes twin state. |
| Assumptions and limitations | A digital representation is not validation of its contributing models. |
| Failure detection, degraded behavior and recovery | Quarantine incompatible/partial data, expose health and retain last complete state as stale when permitted. |
| Future extensions and scientific prerequisites | Durable streaming, bitemporal persistence and audit integration require production infrastructure. |
| Implementation evidence and traceability | Canonical entities/observations: [domain model](../01-domain-model/01-entity-model.md); current integration: [demo analysis](../99-appendix/demo-gap-analysis.md). |
| Next | [Scenario Engine](#scenario-engine) |

## Scenario Engine

| Contract field | Contract value |
|---|---|
| Purpose and scope | Define immutable forecast, replay, what-if, training and counterfactual runs and their perturbations. |
| Scientific and implementation status | Deterministic scenario comparison is `IMPLEMENTED` for synthetic demo inputs; production ensembles are `PLANNED`. |
| Inputs | Base run/input versions, forcing members, initial/boundary perturbations, actions and parameter/model variants. |
| Outputs | Scenario manifest, run family, member weights, differences, counterfactual identity and comparison metadata. |
| Dependencies and allowed dependency direction | Reads Digital Twin baselines, Weather forcing and versioned Flood Propagation products; configures/requests Hydrology, Reservoir, Hydraulic and Flood Propagation runs through orchestration; supplies Decision Support, AI Explanation and Visualization; cannot mutate accepted scientific results. |
| Accepted alternatives and recommended method | Deterministic alternatives, ensembles, sensitivity designs or stochastic sampling; choose by uncertainty question. |
| Governing equations and implementation form | Scenario sampling is not physical law; methods remain anchored in [simulation/scenario authority](../04-decision-support/03-simulation-and-scenarios.md). |
| Variables, units, parameters and bounds | Scenario/member/run IDs, weights/probabilities, perturbations, horizon and comparison baseline. |
| Data structures and serialization | Immutable manifest referencing input/model/config hashes; results stored separately by run ID. |
| Update cadence and triggering events | On forecast cycle, user-authorized request, replay or scheduled exercise. |
| Spatial and temporal resolution | Inherits engine resolutions; comparison aligns times/support without inventing precision. |
| Complexity and resource use | Approximately members times engine cost; parallelism and queue limits declared. |
| Initialization, warm-up and boundary conditions | Freeze baseline and seed; validate scenario semantics and permitted action ranges. |
| Calibration method and observations | Sampling distributions calibrated/elicited from evidence and reviewed; synthetic exercises stay labelled. |
| Validation metrics, datasets and acceptance thresholds | Coverage, reliability and decision stability across representative events; thresholds defined by purpose. |
| Verification tests and invariants | Seed replay, manifest immutability, member uniqueness, baseline identity and comparison alignment. |
| Visualization derived from measurable state | Scenario differences and uncertainty maps derive from normalized results, never random display perturbation. |
| Assumptions and limitations | Demo scenario pulses and spread are `SYNTHETIC`; they are not forecast probabilities. |
| Failure detection, degraded behavior and recovery | Failed members remain visible; weight renormalization is explicit; insufficient coverage lowers confidence. |
| Future extensions and scientific prerequisites | Real forcing ensembles, structural ensembles and training libraries require validated component models. |
| Implementation evidence and traceability | Scenario authority: [simulation and scenarios](../04-decision-support/03-simulation-and-scenarios.md); demo: [DATA_AND_METHODS](../../DATA_AND_METHODS.md). |
| Next | [Decision Support Engine](#decision-support-engine) |

## Decision Support Engine

| Contract field | Contract value |
|---|---|
| Purpose and scope | Evaluate feasibility, constraints, alternatives, consequences, uncertainty and residual risk for human review. |
| Scientific and implementation status | Constraint-based synthetic advisory workflow is `IMPLEMENTED`; operational decision authority is `PLANNED` and review-gated. |
| Inputs | Versioned Digital Twin/scenario results, reviewed constraints/objectives, deadlines and human decision context. |
| Outputs | Proposal/options, feasibility proof, binding constraints, counterfactual, uncertainty, confidence, deadline and audit record. |
| Dependencies and allowed dependency direction | Reads Digital Twin and Scenario; may request new Scenario runs; supplies AI Explanation/Visualization and humans, never physical engines. |
| Accepted alternatives and recommended method | Rules, multi-criteria ranking, robust optimization or MPC. Recommend constraint-first transparent comparison. |
| Governing equations and implementation form | Decision formulations and estimates remain authoritative in [decision engine specification](../04-decision-support/01-decision-engine-spec.md). |
| Variables, units, parameters and bounds | Actions, constraints/margins, objectives, probabilities, regret, deadlines and reviewed legal limits. |
| Data structures and serialization | Immutable decision package linked to run/input/model versions and append-only human disposition. |
| Update cadence and triggering events | On material state/scenario change or authorized request; stale packages are invalidated, not overwritten. |
| Spatial and temporal resolution | Matches action/control intervals and consequence horizons; source resolution remains disclosed. |
| Complexity and resource use | Report scenarios, variables, constraints, solve/runtime and timeout behavior. |
| Initialization, warm-up and boundary conditions | Require valid state, reviewed constraints, authority context and explicit counterfactual. |
| Calibration method and observations | Objective weights/behavioral models require elicitation and review; no tuning to preferred answer. |
| Validation metrics, datasets and acceptance thresholds | Constraint correctness, outcome error, option stability and retrospective decision usefulness on independent events. |
| Verification tests and invariants | No hard-constraint relaxation, counterfactual/alternatives present, traceable inputs and deterministic rerun. |
| Visualization derived from measurable state | Cards/charts show supplied evidence, margins and uncertainty; UI selection cannot change scientific state. |
| Assumptions and limitations | The system is advisory. Legal thresholds and interpretations `REQUIRES DOMAIN REVIEW`; demo outputs are synthetic. |
| Failure detection, degraded behavior and recovery | Return infeasible/unavailable with cause; never fabricate an option, order or warning. |
| Future extensions and scientific prerequisites | Shadow-mode evaluation and formally governed optimization require validated engines and institutional approval. |
| Implementation evidence and traceability | Decision authority: [decision specification](../04-decision-support/01-decision-engine-spec.md); demo evidence: [demo analysis](../99-appendix/demo-gap-analysis.md). |
| Next | [AI Explanation Engine](#ai-explanation-engine) |

## AI Explanation Engine

| Contract field | Contract value |
|---|---|
| Purpose and scope | Explain supplied evidence, assumptions, constraints, alternatives and limitations without generating scientific state. |
| Scientific and implementation status | Template/state explanation is partly `IMPLEMENTED`; bounded production explanation is `PLANNED`. |
| Inputs | Read-only normalized physical/decision envelopes, approved terminology, user language and access context. |
| Outputs | Grounded explanation with cited quantity/run/model IDs, uncertainty, limitations and explicit unavailable fields. |
| Dependencies and allowed dependency direction | Reads Digital Twin, Scenario and Decision Support; no dependency edge back to any scientific or decision state. |
| Accepted alternatives and recommended method | Deterministic templates, retrieval-grounded generation or constrained language model; recommend templates for safety-critical core. |
| Governing equations and implementation form | No physical equations and no numeric inference; arithmetic only when supplied and unit-checked by an upstream service. |
| Variables, units, parameters and bounds | Referenced IDs, language, confidence reasons, citations and generation/version metadata. |
| Data structures and serialization | Structured explanation request/response plus grounding references and audit metadata. |
| Update cadence and triggering events | On user query or decision-package publication; never drives simulation cadence. |
| Spatial and temporal resolution | Uses source spatial/time support exactly; does not infer a point from a coarse field. |
| Complexity and resource use | Latency/token/resource budgets measured; deterministic fallback always available. |
| Initialization, warm-up and boundary conditions | Load approved vocabulary, policies and grounding schema; reject missing source identity. |
| Calibration method and observations | No scientific calibration; evaluate language quality and grounding on reviewed examples. |
| Validation metrics, datasets and acceptance thresholds | Citation/number fidelity, completeness, refusal correctness, bilingual parity and reviewer acceptance thresholds. |
| Verification tests and invariants | No unsupported number, no state mutation, source-ID existence, unit fidelity and adversarial prompt tests. |
| Visualization derived from measurable state | May describe displayed measurable state; cannot cite color, particle speed or shader motion as evidence. |
| Assumptions and limitations | Language fluency is not scientific validity; missing quantities are stated as not computed/planned. |
| Failure detection, degraded behavior and recovery | Refuse unsupported requests, fall back to structured facts, and leave all upstream state unchanged. |
| Future extensions and scientific prerequisites | Broader multilingual explanations require governed retrieval, evaluation datasets and safety review. |
| Implementation evidence and traceability | Human authority: [scientific architecture](01-scientific-architecture.md#human-authority); demo explanation notes: [DATA_AND_METHODS](../../DATA_AND_METHODS.md). |
| Next | [Visualization Engine](#visualization-engine) |

## Visualization Engine

| Contract field | Contract value |
|---|---|
| Purpose and scope | Map normalized measurable state to accessible 2D/3D GPU and interaction state, read-only. |
| Scientific and implementation status | Browser 2D/3D rendering is `IMPLEMENTED`; physically grounded production mappings are partly `PLANNED`. |
| Inputs | Terrain, Digital Twin, Flood Propagation, Scenario and Decision quantities with units, support and uncertainty. |
| Outputs | Frames, legends, interaction hit targets and display-only derived buffers linked to source versions. |
| Dependencies and allowed dependency direction | Reads upstream state only. Visualization, shader and interaction state cannot mutate any scientific engine. |
| Accepted alternatives and recommended method | Raster/vector/mesh rendering and CPU/GPU transforms. Recommend deterministic mappings with fixed documented legends. |
| Governing equations and implementation form | No governing physics; display transforms are explicit, bounded and invertible where numerical reading is offered. |
| Variables, units, parameters and bounds | Color bands, opacity, glyph scale, animation speed and LOD tied to measurable fields or labelled cues. |
| Data structures and serialization | GPU buffers/textures and scene graph reference immutable source field/run/version; never become canonical state. |
| Update cadence and triggering events | Frame rate independent of scientific update rate; buffers refresh only on accepted source version/time. |
| Spatial and temporal resolution | LOD may reduce display detail but cannot claim finer scientific resolution or change aggregates. |
| Complexity and resource use | Frame time, GPU memory, draw calls and transfer cost measured for desktop/mobile budgets. |
| Initialization, warm-up and boundary conditions | Validate units, legends, no-data, accessibility, source version and fallback presentation. |
| Calibration method and observations | No visual tuning as scientific calibration; perceptual mappings receive UX/accessibility review. |
| Validation metrics, datasets and acceptance thresholds | Value-to-color/glyph fidelity, legend comprehension, uncertainty visibility and cross-device acceptance. |
| Verification tests and invariants | Golden mappings, no-GPU-write tests, source-version checks, missing-field honesty and deterministic animation. |
| Visualization derived from measurable state | Depth, extent, direction and motion derive from measurable state; decorative cues are deterministic and labelled. |
| Assumptions and limitations | Current browser water and velocity-like motion are `SYNTHETIC`, not validated hydraulics. |
| Failure detection, degraded behavior and recovery | Show unavailable/stale state and retain scientific process; rendering failure cannot affect model/decision state. |
| Future extensions and scientific prerequisites | Validated velocity, arrival and uncertainty layers require upstream production fields and accessibility review. |
| Implementation evidence and traceability | Current rendering/data inventory: [DATA_AND_METHODS](../../DATA_AND_METHODS.md); UX authority: [UX principles](../05-product/04-ux-principles.md). |
| Next | [Engineering index](README.md) |

## Next

Return to the [Engineering index](README.md), or apply the contracts through [Simulation architecture](02-simulation-architecture.md).
