# Scientific Platform Source Brief Coverage

**Source:** user-provided `SKYLABS DIGITAL TWIN SCIENTIFIC PLATFORM` brief, received 2026-07-28.
**Purpose:** preserve the requirements that the approved documentation design expands, including obligations that were previously only implicit in the design or traceability ledger.
**Authority:** this file records requested scope; scientific facts, equations and accepted methods remain authoritative in [Foundations](../00-foundations/01-glossary.md), while implementation contracts remain authoritative in the [Engineering handbook](../07-engineering/README.md).

## Primary platform capabilities

The target architecture must support high-resolution terrain, physically plausible flood simulation, reservoir operation, cascade interaction, downstream propagation, AI-assisted decision support, public warning and emergency response. Scientific credibility takes precedence over visual effect. Current demo behavior and production target behavior remain explicitly separate.

## Living object model

The watershed is represented through Terrain, River, Reservoir, Dam, Spillway, Gate, Catchment, Rain Cell, Forecast, Radar, Satellite, Sensor, Population, Infrastructure, Shelter, Hospital, Bridge, Road and Power Station concepts. Every object carries identity, geometry, elevation semantics, physical properties, state, history, prediction, relationships and events, using explicit not-applicable or unavailable values rather than silent omission.

## Approach comparison

For each accepted scientific or engineering approach, documentation must state advantages, principal limitations, computational cost, implementation complexity and suitable use cases. Recommendations must distinguish the current demo method from the production target and identify assumptions, required data, calibration and validation gates.

## Terrain

The architecture covers high-resolution DEM, LiDAR-derived terrain, terrain meshes, LOD, streaming, slope, aspect, flow accumulation, watershed and river-network extraction, and terrain validation. DEM, bathymetry, solver terrain and display terrain remain separate governed products.

## Simulation and rendering

Simulation and rendering are separate. Scientific engines own water depth, velocity, momentum, travel/arrival time, flood extent, reservoir storage, gate discharge, river discharge and floodplain inundation. Rendering may visualize only computed state or an explicitly non-quantitative cue; it may not invent arbitrary water behavior or physical readouts.

## Dataset contract

Every dataset defines source, owner, spatial/temporal resolution, temporal frequency, validation, confidence, fallback and transformation lineage. Provenance distinguishes observed, forecast, modelled, assumed and synthetic state.

## Visualization

The map architecture supports terrain, water, reservoirs, rainfall/weather, flow direction, velocity, flood depth, population exposure, infrastructure, sensor status, prediction, historical replay, scenario comparison and AI explanation. Layers are independently controllable where implemented; unavailable physical layers remain explicit targets rather than fabricated display effects.

## Assurance

Every subsystem defines verification, calibration, acceptance criteria, known limitations, uncertainty estimation and performance targets. A production claim additionally requires implemented behavior, linked evidence, independent validation and appropriate domain approval.

## Deliverables and consistency

The implementation-ready documentation set covers system/scientific/simulation architecture, hydrology, hydraulics, terrain/GIS, reservoirs, rendering, AI decisions, data ingestion, calibration, validation, verification/testing, performance optimization, risks and future integrations. Documents cross-reference one another and executable verification rejects orphaned files, incomplete method comparisons, incomplete object/dataset contracts and missing source-brief trace rows.

## Next

Use [Requirement traceability](../07-engineering/18-requirement-traceability.md) for the atomic evidence and status of each obligation.
