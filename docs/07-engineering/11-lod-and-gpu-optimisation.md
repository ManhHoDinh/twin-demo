# LOD and GPU Optimisation

| Field | Value |
|---|---|
| Document ID | ENG-11 |
| Owner | Graphics performance lead |
| Status | PLANNED |
| Current demo | Browser-specific rendering optimisations without a complete measured scientific-fidelity budget |
| Production target | Measured spatial/temporal LOD and resource profiles constrained by scientific invariants |
| Domain review | Graphics performance, GIS, hydraulic modelling, product accessibility and target-device operations |
| Authoritative dependencies | [3D rendering](10-3d-rendering-pipeline.md), [GIS](09-gis-architecture.md), [performance requirements](../05-product/05-non-functional-requirements.md), [scientific architecture](01-scientific-architecture.md) |

## Purpose and scope

Keep interactive visualization within declared tile, mesh, texture, GPU-memory and frame budgets while bounding distortion of scientific state. Optimisation may reduce display detail, never alter authoritative model results.

## Scientific and implementation status

Some demo optimisations are `IMPLEMENTED`, but their performance and scientific error are not established here. Production budgets, profiles and benchmarks are `PLANNED`; acceptable decision-facing error requires domain review.

## Inputs

Governed render meshes/tiles/textures, typed physical fields, camera/view, target-device profile, frame/memory/network budgets, mapping version and permitted scientific/display errors.

## Outputs

Selected spatial/temporal LOD, culled visible sets, interpolated display resources, resource telemetry, measured error metrics and degraded-profile indicator.

## Dependencies and allowed dependency direction

Rendering/GIS state feeds the optimiser; its choices affect only display resources. It cannot change solver mesh/time step, persisted normalized fields, model outputs or validation evidence.

## Accepted alternatives and recommended method

Accepted methods include quadtree/tiles, mesh simplification, mipmaps, temporal decimation/interpolation, frustum/occlusion culling, instancing and bounded particle pools. Recommend precomputed/error-tagged spatial LOD plus adaptive view/device selection and separately governed temporal interpolation.

## Governing equations and implementation form

Select the lowest-cost representation satisfying declared screen/geometric and scientific error bounds. Error is measured against the authoritative render projection for depth bands, wet/dry boundary, extent, arrival categories, direction and uncertainty—not only triangle count or pixels.

## Variables, units, parameters and bounds

Tile/mesh level, geometric error [m], screen error [px], temporal gap [s], depth error [m], boundary displacement [m], arrival error [s], texture bytes, GPU memory [MB], upload/network bytes, frame time [ms], frame rate [Hz] and visible instance count. Budgets are target values until measured and approved.

## Data structures and serialization

`LODAsset`, `ErrorEnvelope`, `DeviceProfile`, `ResourceBudget`, `LODSelection`, `FrameTelemetry` and `BenchmarkResult` retain asset/mapping/source versions, scene, viewport, device/browser, settings and timestamps.

## Update cadence and triggering events

Re-evaluate on camera, viewport/device, layer/time, memory pressure or data-version change. Temporal LOD must not skip a wetting/arrival/peak transition that violates the declared invariant.

## Spatial and temporal resolution

LOD levels disclose effective mesh/texture resolution and temporal sampling. Fine levels are used near decision-relevant boundaries/readouts; coarse levels remain permissible only within measured error envelopes.

## Complexity and resource use

Selection targets logarithmic spatial lookup with cost proportional to visible assets; rendering cost follows visible geometry, texture bandwidth, uploads and effects. Frame time, GPU memory and network budgets must be reported as target versus measured, including percentile and device/scene context.

## Initialization, warm-up and boundary conditions

Start from a conservative low-resource profile while assets and telemetry initialize. Preload only bounded critical assets. Memory/context loss invokes a deterministic lower profile; no-data and not-computed semantics survive every level.

## Calibration method and observations

Tune heuristics against benchmark scenes/device profiles, not to make outputs look smoother. Fit selection thresholds only after error metrics and scientific invariants are fixed; retain out-of-sample scenes.

## Validation metrics, datasets and acceptance thresholds

Measure frame-time percentiles, dropped frames, peak GPU memory, upload/network cost, load latency and scientific errors in depth/readouts, wet/dry/extent boundary, arrival and direction. Acceptance thresholds are product/domain targets, not measured achievements in this document.

## Verification tests and invariants

Across all LODs, preserve exact readout source values, no-data/not-computed state, topology of critical barriers where declared, wet/dry classification within tolerance, monotonic depth bands, arrival ordering and deterministic selection for fixed inputs. Test budget pressure and context recovery.

## Visualization derived from measurable state

LOD changes display sampling only. Legends remain fixed; particles/waves may be reduced first. Quantitative readouts query authoritative normalized state or a verified sampling product, never the simplified mesh color/pixel.

## Assumptions and limitations

Device/browser drivers vary; screen-space similarity may conceal scientific boundary error. Occlusion can hide relevant state. Results from one scene/device cannot be generalized without measurement.

## Failure detection, degraded behavior and recovery

Detect memory pressure, allocation/context failure, frame-budget breach, missing tiles, excessive scientific error and LOD thrash. Degrade in ordered profiles—effects, density, texture/mesh detail—while preserving labels/readouts/invariants; recover hysteretically after sustained health.

## Future extensions and scientific prerequisites

WebGPU, server-driven LOD, foveation and predictive streaming require reproducible device benchmarks, error-aware assets and privacy/security review where telemetry leaves the client.

## Implementation evidence and traceability

Evidence links benchmark code/config, asset and mapping versions, device/browser, scene/run, raw telemetry, error comparison and target disposition. Demo behavior alone is not a performance measurement.

## Next

Enforce fixed meanings and accessibility in [Visualisation and Animation Rules](12-visualisation-and-animation-rules.md).
