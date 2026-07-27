# River Network Model

| Field | Value |
|---|---|
| Document ID | ENG-07 |
| Owner | River-network modelling lead |
| Status | REQUIRES DOMAIN REVIEW |
| Current demo | Simplified directed connectivity and `SYNTHETIC` travel/release propagation |
| Production target | Versioned directed multigraph with reviewed diversions, bifurcations, boundaries and routing semantics |
| Domain review | Basin hydrology, river hydraulics, reservoir operations and local network/domain experts |
| Authoritative dependencies | [Basin model](../01-domain-model/02-basin-vgtb.md), [hydraulics/routing](../00-foundations/03-hydraulics-and-routing.md), [entity model](../01-domain-model/01-entity-model.md), [GIS](09-gis-architecture.md) |

## Purpose and scope

Provide the authoritative computational topology connecting catchments, reaches, junctions, reservoirs, diversions, bifurcations, lateral inflows and boundaries. It carries identity and routing interfaces; it does not invent physical splits from map appearance.

## Scientific and implementation status

Basic demo connectivity is `IMPLEMENTED` for `SYNTHETIC` scenarios. A production topology, reach parameters and routing are `PLANNED`. The Dak Mi 4 diversion and Quang Hue stage-dependent split are explicitly unresolved and `REQUIRES DOMAIN REVIEW`.

## Inputs

Versioned hydrography, surveyed/derived centerlines and sections, node/asset registry, catchment outlets, reservoir releases, lateral inflows, boundary definitions, diversion rules, structure controls and routing parameters.

## Outputs

Validated directed graph, topological order/cycle declarations, upstream/downstream adjacency, reach travel-time/routing operators, release-propagation series, split/merge diagnostics and topology/version lineage.

## Dependencies and allowed dependency direction

GIS and governed domain records define geometry/identity; Hydrology and Reservoir provide flows; River Network supplies topology to those engines and Hydraulic. Hydraulic may return stage needed by an explicitly coupled stage-dependent split, never silently rewrite graph data.

## Accepted alternatives and recommended method

Use pure lag for screened demonstrations, Muskingum/Muskingum-Cunge for reviewed reach routing, hydraulic routing where backwater/stage controls matter, and explicit transfer/control rules for diversions. Recommend a typed directed multigraph with routing chosen per reach and coupled hydraulic treatment for stage-dependent bifurcations. Static percentages are not acceptable where the split is stage/structure dependent.

## Governing equations and implementation form

Travel-time and routing authority comes from [hydraulics and routing](../00-foundations/03-hydraulics-and-routing.md). Discrete node balance requires sum of incoming, lateral and controlled flows equals outgoing flows plus declared storage/residual. Every split operator declares conservation, capacity, priority, stage/control dependency and fallback.

## Variables, units, parameters and bounds

Reach length [m], slope [-], travel time [s], discharge [m3/s], stage [m datum], storage [m3], routing coefficients [-], split fractions [0,1 only when physically applicable], capacities [m3/s] and lateral inflow [m3/s]. Parameters remain within method stability/physical domains.

## Data structures and serialization

`Reach`, `Junction`, `Diversion`, `Bifurcation`, `LateralInflowPort`, `BoundaryNode`, `ReservoirPort` and `NetworkVersion` use stable IDs, geometry references, direction, ports, routing method/config, validity period, provenance and review state. Parallel edges and controlled cycles are explicit.

## Update cadence and triggering events

Topology changes only with a governed network version. Flow states update at routing/coupling cadence when upstream, lateral, reservoir or boundary inputs change. A changed diversion rule creates a new configuration/run.

## Spatial and temporal resolution

Reach segmentation must preserve junctions, structures, material geometry changes and decision-relevant travel time. Temporal resolution resolves hydrograph translation/attenuation and control changes; refinement is checked for stable arrival, peak and volume.

## Complexity and resource use

Acyclic traversal is linear in nodes plus edges per step; iterative stage-coupled splits add solver iterations; ensembles multiply run cost. Capacity/latency remain targets until measured on declared network versions.

## Initialization, warm-up and boundary conditions

Initialize reach storage/state from observations, hydraulic state, warm-up or explicit `ASSUMED` conditions. Declare headwater, downstream, lateral and control boundaries. Validate connectivity, direction, ports and balance before propagation.

## Calibration method and observations

Calibrate reach travel/attenuation only against `MEASURED` hydrographs at multiple locations/events, separating upstream timing error from routing error. Diversion/split parameters require observed flow, stage and control records; topology is not tuned to fit an event.

## Validation metrics, datasets and acceptance thresholds

Use independent events/locations and report travel-time, peak, volume and hydrograph fit, junction balance and diversion/split residual. Thresholds are decision-specific and require review; none are approved here.

## Verification tests and invariants

Test schema/referential integrity, reach direction, permitted cycles, topological ordering, exact node mass balance, zero/constant hydrographs, split fractions/capacities, deterministic propagation and timestep sensitivity. Include unresolved Dak Mi 4/Quang Hue fixtures that fail closed rather than assume a split.

## Visualization derived from measurable state

Network maps show versioned edges/nodes and direction. Flow width/color/animation requires a normalized discharge or validated velocity; unresolved diversions show unknown/review state, not plausible animated branching.

## Assumptions and limitations

Map centerlines do not prove hydraulic connectivity or flow partition. Current routing is synthetic. Dak Mi 4 diversion semantics and the Quang Hue stage-dependent split remain unresolved; static or visually inferred replacements are prohibited.

## Failure detection, degraded behavior and recovery

Detect orphan ports, unintended cycles, reversed reaches, duplicate IDs, missing routing config, balance errors and unresolved required splits. Quarantine the affected path and dependent forecasts; recover with a reviewed network/config version and new run.

## Future extensions and scientific prerequisites

Dynamic topology, control-system integration, probabilistic travel time and coupled 1D/2D junctions require observed controls/stages, reviewed geometry and conservative coupling evidence.

## Implementation evidence and traceability

Each graph/version change links source geometry/records, reviewer, routing choice, tests and dependent run IDs. [DATA_AND_METHODS](../../DATA_AND_METHODS.md) bounds the `SYNTHETIC` demo network claim.

## Next

Normalize all network inputs through the [Data Pipeline](08-data-pipeline.md) and spatial authority in [GIS Architecture](09-gis-architecture.md).
