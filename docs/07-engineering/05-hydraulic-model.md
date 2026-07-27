# Hydraulic Model

| Field | Value |
|---|---|
| Document ID | ENG-05 |
| Owner | Hydraulic modelling lead |
| Status | REFERENCE MODEL |
| Current demo | `SYNTHETIC` virtual-pipe and gauge-nudged browser flood field; mountain `u/v` values are visual currents, not physical velocity |
| Production target | Verified and calibrated 1D/2D hydraulic computation with declared structures, boundaries, wetting/drying and uncertainty |
| Domain review | River hydraulics, coastal boundary conditions, structures, surveying and numerical methods |
| Authoritative dependencies | [Hydraulics foundation](../00-foundations/03-hydraulics-and-routing.md), [hydrology](04-hydrology-model.md), [river network](07-river-network-model.md), [GIS](09-gis-architecture.md) |

## Purpose and scope

Compute physical discharge, stage, depth and validated velocity/direction from inflows, terrain/channel geometry, structures and downstream boundaries. It owns hydraulic solver state; decorative currents and render interpolation are not solver outputs.

## Scientific and implementation status

The current browser field is `IMPLEMENTED` as a deterministic `SYNTHETIC` demonstration, not validated hydraulics. Production solvers, local geometry, calibration and tide/surge treatment are `PLANNED`. Structure data, roughness zoning and boundary interpretation are `REQUIRES DOMAIN REVIEW`.

## Inputs

Hydrology lateral/upstream inflows, Reservoir releases, River Network topology, surveyed/derived cross-sections or mesh, bed elevations and datum, roughness zones, structures, initial state, and downstream stage/tide/surge hydrographs with provenance.

## Outputs

Discharge `Q`, water-surface elevation `eta`, depth `h`, wetted extent, depth-averaged velocity components `u/v` only when physically solved and validated, structure flows, mass residual, convergence flags and uncertainty fields.

## Dependencies and allowed dependency direction

GIS/Terrain, Hydrology, Reservoir, Weather and River Network feed Hydraulic; Hydraulic feeds Flood Propagation, Digital Twin and Visualization. Gauge assimilation must create a traceable model-state update. GPU waves, particles, camera state and user drawing have no reverse path.

## Accepted alternatives and recommended method

| Method | Use | Limitation |
|---|---|---|
| Lag/route or virtual pipe | Workflow demonstration or screened travel-time approximation; a separate 2D height field may derive a wet extent | Does not solve validated hydraulic momentum or physical velocity; any derived extent needs independent calibration/validation |
| Muskingum-Cunge | Reach routing where channel geometry/slope support parameterization | Limited backwater, structures and floodplain detail |
| 1D diffusive wave | Gradually varied channel flow with modest inertia | Unsupported for regimes needing full momentum |
| 1D full Saint-Venant | Channels, backwater and structures | Cross-section and numerical burden |
| 2D shallow water | Floodplain flow, wetting/drying and directional hazards | Mesh, terrain and compute burden |
| Coupled 1D/2D | Channel efficiency plus floodplain detail | Interface conservation and stability complexity |

Recommended production method is decision- and evidence-dependent; coupled 1D/2D is a candidate where channel/floodplain exchange matters, after simpler methods are shown insufficient.

## Governing equations and implementation form

Use continuity and momentum authority in the [hydraulics foundation](../00-foundations/03-hydraulics-and-routing.md). Finite-volume/finite-difference updates must preserve conservative mass fluxes, bed/pressure/friction/source terms and declared structure fluxes. Wetting/drying uses explicit depth tolerances and positivity preservation. `MAX_SUB_DT` is only a configured cap; it cannot be called CFL-safe without local wave-speed calculation and a test.

## Variables, units, parameters and bounds

`Q` [m3/s], area `A` [m2], stage/elevation `eta,z` [m in named vertical datum], depth `h` [m, >=0], velocity `u,v` [m/s], gravity `g` [m/s2], roughness (for example Manning `n` [s/m^(1/3)]), bed slope [-], cell/reach length [m], time step [s], structure dimensions [m] and coefficients [-]. Bounds are source- and regime-specific, versioned and reviewed.

## Data structures and serialization

`HydraulicMesh`, `CrossSection`, `Structure`, `BoundarySeries`, `HydraulicState`, `FluxExchange` and `SolverDiagnostics` carry CRS, vertical datum, connectivity, units, wet/dry flags, valid time, provenance, uncertainty and exact model/config/input versions.

## Update cadence and triggering events

Trigger runs from new accepted inflow/boundary issues, geometry/roughness/structure versions, scenarios or assimilation events. Internal adaptive substeps obey stability criteria; publish at a declared cadence without hiding failed or unconverged steps.

## Spatial and temporal resolution

Reach/cross-section spacing or mesh cells must resolve control sections, conveyance, structures and decision-relevant floodplain pathways. Time steps follow local CFL/stability calculations and coupling exchange needs. Mesh/time refinement studies quantify convergence and conservation.

## Complexity and resource use

Routing/1D cost scales with reaches or sections and steps; 2D cost scales with active cells, flux faces and substeps; coupling adds interface iterations. GPU/CPU latency and capacity are unmeasured targets until benchmarked with versioned meshes and hardware.

## Initialization, warm-up and boundary conditions

Initialize from observed stage/flow, a steady solution, checkpoint or explicit dry/`ASSUMED` state. Declare upstream/lateral hydrographs, downstream rating/stage/tide/surge, structure controls and wetting thresholds. Inconsistent datums or boundary shocks must fail validation or invoke a documented ramp/warm-up.

## Calibration method and observations

Calibrate roughness and uncertain structure/boundary parameters against multiple `MEASURED` stage, discharge, high-water marks and extent observations, with sensitivity and spatial regularization. Gauge nudging is assimilation, not calibration proof; retain pre/post-assimilation residuals.

## Validation metrics, datasets and acceptance thresholds

Use independent events/locations and report stage/discharge RMSE or bias, peak and timing error, inundation fit, depth error, velocity evidence where available, mass residual and uncertainty coverage. Tide/surge cases require matched downstream evidence. Thresholds are predeclared and reviewed; none are asserted approved here.

## Verification tests and invariants

Test lake at rest, uniform flow, dam-break/analytic benchmarks, positivity, dry-bed advance/retreat, structure limits, junction/interface conservation, timestep/mesh convergence, deterministic restart and total mass balance. Explicitly test computed CFL against every accepted substep and prevent visual `u/v` from entering physical outputs.

## Visualization derived from measurable state

Depth, stage, extent and validated velocity may drive rendering through typed fields. When physical velocity is absent, show “not computed”; mountain `u/v`, particles and waves may be labelled visual motion only and cannot populate readouts, legends or exports as velocity.

## Assumptions and limitations

Depth-averaged equations omit vertical structure; 1D assumptions omit transverse variation; terrain without bathymetry cannot resolve channel conveyance. The current virtual-pipe/gauge-nudged browser height field can derive a wet extent, but that extent is `SYNTHETIC`, uncalibrated and not decision-grade; its momentum proxy and apparent `u/v` currents are not validated physical momentum or velocity. Roughness, structures and surge boundaries may dominate uncertainty.

## Failure detection, degraded behavior and recovery

Detect NaN/negative depth, exploding velocity, CFL violation, non-convergence, mass imbalance, datum mismatch, disconnected mesh and stale boundary. Quarantine invalid steps; suppress dependent hazard products or retain last valid state as stale. Recover from a verified checkpoint/new run, never shader state.

## Future extensions and scientific prerequisites

Data assimilation, ensembles, sediment/morphology, breach, compound rainfall-tide-surge and higher-order numerics require suitable observations, governed geometry, verification benchmarks and domain review.

## Implementation evidence and traceability

[DATA_AND_METHODS](../../DATA_AND_METHODS.md) bounds current demo claims. Production evidence links mesh/geometry hashes, solver/config version, boundaries, calibration/validation split, CFL/convergence logs, mass balance and reviewer approval to each run.

## Next

Define controlled boundaries in the [Reservoir model](06-reservoir-model.md) and GPU-safe projection in the [3D rendering pipeline](10-3d-rendering-pipeline.md).
