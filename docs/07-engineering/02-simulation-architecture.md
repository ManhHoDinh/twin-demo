# Simulation Architecture

| Field | Value |
|---|---|
| Document ID | ENG-02 |
| Owner | Simulation architecture lead |
| Status | REFERENCE MODEL |
| Current demo | Browser-precomputed T-24 to T+48 synthetic scenarios with deterministic scrubbing and fallback geometry |
| Production target | Orchestrated, checkpointed multi-engine runs with versioned coupling and degraded profiles |
| Domain review | Hydrology, hydraulics, reservoir, meteorology, GIS and operations |
| Authoritative dependencies | [Scientific architecture](01-scientific-architecture.md), [scenario authority](../04-decision-support/03-simulation-and-scenarios.md), [demo evidence](../../DATA_AND_METHODS.md), [engine contracts](03-engine-contract-catalog.md) |

## Engine boundaries

The twelve engines own distinct state:

| Engine | Boundary |
|---|---|
| Terrain | Versioned land/bed elevation, masks and spatial support |
| Weather | Observed and forecast forcing with issue/valid-time semantics |
| River Network | Directed reaches, junctions, controls and topology |
| Hydrology | Rainfall-runoff and lateral/inflow hydrographs |
| Reservoir | Storage, level, releases, structures and operating constraints |
| Hydraulic | Water level, depth, discharge and velocity from hydraulic physics |
| Flood Propagation | Derived extent, arrival, duration, hazard and impact-facing products |
| Digital Twin | Entity-aligned normalized state, lineage and synchronization |
| Scenario | Immutable alternatives, perturbations, ensembles and counterfactuals |
| Decision Support | Feasibility, constraints, objectives, alternatives and residual risk |
| AI Explanation | Read-only grounded explanation of supplied state and decisions |
| Visualization | Read-only mapping from normalized quantities to GPU/display state |

Hydraulic owns the physical solver state. Flood Propagation consumes hydraulic results to derive products; it is not a second hydraulic solver and cannot overwrite depth, velocity, discharge or stage.

## Engine dependency DAG

```text
Terrain -------> Hydraulic -------> Flood Propagation ---+
      |              ^                     |             |
Weather -> Hydrology +-> Reservoir --------+             |
  |          ^              |                            v
  |          +--------------+ (controlled coupling)  Digital Twin
  |                                                     |   |
River Network -> Hydrology / Reservoir / Hydraulic -----+   +-> Scenario
  |                                                         |     |
  +---------------------------------------------------------+     | request/configure
Weather ----------------------------------------------------------+ scientific runs
                                                                  |
Digital Twin + Scenario ---------------------------------> Decision Support
      |             |                                      |          |
      +-------------+------------------------------> Visualization    |
      +-------------+------------------------------> AI Explanation <-+
```

Terrain, Weather, Hydrology, Hydraulic, Reservoir, River Network and Flood Propagation all publish accepted state to Digital Twin. Terrain may supply Weather downscaling and River Network geometry; Reservoir may return controlled, time-indexed feedback to Hydrology. Digital Twin and Weather supply Scenario baselines and forcing. Scenario may request/configure new immutable Hydrology, Reservoir, Hydraulic and Flood Propagation runs through orchestration, but cannot mutate accepted inputs, completed results or published Digital Twin snapshots. The complete normative registry is the [allowed dependency edge table](03-engine-contract-catalog.md#allowed-dependency-edges); any edge absent there is prohibited. Reservoir-Hydrology coupling declares convergence policy per run. AI Explanation and Visualization have no outgoing scientific-state edges.

## Clocks, event time and run identity

| Concept | Rule |
|---|---|
| Event/valid time | When an observation or model state applies |
| Issue time | When a forecast, input package or decision package was issued |
| Ingest time | When the system received the record; never substituted for event time |
| Simulation time | Current solver time inside a run |
| Wall time | Execution/monitoring clock, excluded from scientific determinism |
| Run ID | Globally unique identifier bound to scenario, model/config versions, inputs and parent run |

All internal times use UTC with explicit timezone presentation. Late observations create a new input version and, if policy permits, a new run; they never silently rewrite a completed run.

## Orchestration and coupling exchanges

The orchestrator validates contracts, freezes inputs, creates the run manifest, schedules engines in DAG order, records exchanges, enforces time-step and convergence policies, and publishes only complete or explicitly degraded states. Exchanges use normalized quantity envelopes from [Scientific architecture](01-scientific-architecture.md#normalized-quantity-envelope).

Typical coupling per time step is: Weather forcing -> Hydrology lateral/inflow -> Reservoir storage/release -> Hydraulic upstream/lateral/boundary inputs -> Flood Propagation products -> Digital Twin state. Iterative reservoir-network coupling must declare stopping tolerance, maximum iterations and non-convergence behavior. No engine reads another engine's private memory.

## State transitions

```text
CREATED -> INPUTS_VALIDATED -> INITIALIZING -> RUNNING
RUNNING -> CHECKPOINTED -> RUNNING
RUNNING -> COMPLETED
RUNNING -> DEGRADED
RUNNING -> FAILED
DEGRADED -> COMPLETED_DEGRADED | FAILED
```

Transitions are append-only events containing run ID, simulation time, cause, engine, input/output versions and actor where human action is involved. Published states remain immutable.

## Deterministic replay and checkpoints

Replay requires pinned input bytes/hashes, model binaries or source revisions, configuration, parameter sets, random seeds, dependency versions, clock policy and coupling order. A checkpoint includes all prognostic state needed to resume without hidden warm-up history. Restart equivalence is verified against a continuous run within declared numerical tolerances.

The current demo provides useful `IMPLEMENTED` evidence for deterministic precomputation, timeline scrubbing and startup invariants in [DATA_AND_METHODS](../../DATA_AND_METHODS.md), but its browser state is not a production checkpoint format and its synthetic results are not validation evidence.

## Failure isolation and degraded profiles

| Failure | Isolation and degraded behavior |
|---|---|
| Weather unavailable/stale | Freeze or reject forcing per policy; no high-confidence forecast |
| Observation QC failure | Preserve raw record, exclude rejected value, expose gap and confidence effect |
| Hydrology failure | Stop dependent forecast runs; optionally retain last valid state clearly marked stale |
| Reservoir non-convergence | Do not emit an actionable schedule; expose binding failure |
| Hydraulic failure | Suppress new flood products; retain last valid result only with timestamp and warning |
| Flood Propagation failure | Physical hydraulic state may remain available; derived arrival/extent products unavailable |
| Digital Twin synchronization failure | Quarantine partial version; do not combine incompatible run IDs |
| Decision/AI failure | Scientific state remains intact; human receives data and explicit unavailability |
| Visualization failure | Simulation continues; no effect on physical or decision state |

Degraded profiles define permitted outputs, freshness ceilings, confidence caps and prohibited actions. Recovery creates a new transition and never erases the failure record.

## Resolution and scheduling

Each engine declares native spatial/temporal resolution, exchange resolution, interpolation/conservation method and aliasing risk. The orchestrator may aggregate for display but cannot improve scientific resolution. Time steps obey engine stability and accuracy requirements, not frame rate. GPU LOD changes presentation only.

## Current demo versus production target

| Concern | Current demo evidence | Production target |
|---|---|---|
| Forcing | Analytic `SYNTHETIC` rainfall scenarios | Versioned `MEASURED` and `FORECAST` sources with QC |
| Hydrology/reservoir | Analytic deterministic demonstration and synthetic ensemble spread | Calibrated, validated models with observed forcing and uncertainty propagation |
| Hydraulic/flood | Browser virtual-pipe field, floodplain limits and cap | Reviewed 1D/2D solver, surveyed geometry/bathymetry, calibration and validation |
| Terrain | AWS Terrain Tiles plus procedural fallback | Controlled DEM/DTM and surveyed bathymetry with CRS/datum lineage |
| Replay | Precomputed scrub-safe timeline and startup tests | Immutable run manifests, durable checkpoints and restart equivalence |
| Coupling | In-process shared browser modules | Typed versioned exchanges, orchestration, monitoring and failure isolation |
| Decisions | Synthetic advisory workflow with explicit constraints | Legally reviewed, human-authorized shadow/operational workflow after claim gates |

The current browser water surface and velocity-like visual motion are `SYNTHETIC` demonstration outputs, not validated hydraulics. AWS terrain is an external raster, not surveyed bathymetry.

## Next

Use the [Engine contract catalog](03-engine-contract-catalog.md) to implement these boundaries, or return to the [Engineering index](README.md).
