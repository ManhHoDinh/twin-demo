# 3D Rendering Pipeline

| Field | Value |
|---|---|
| Document ID | ENG-10 |
| Owner | 3D rendering lead |
| Status | REFERENCE MODEL |
| Current demo | Deterministic browser terrain, flood shader, waves and particles driven partly by `SYNTHETIC` state |
| Production target | Typed, one-way physical-state-to-GPU projection with exact missing-value behavior and auditable visual mappings |
| Domain review | Hydraulic modelling, GIS, uncertainty communication, accessibility and graphics engineering |
| Authoritative dependencies | [Scientific architecture](01-scientific-architecture.md), [hydraulic model](05-hydraulic-model.md), [GIS](09-gis-architecture.md), [visual rules](12-visualisation-and-animation-rules.md) |

## Purpose and scope

Transform normalized physical state into GPU resources and interactive render products without feeding visual state back into science. The pipeline distinguishes physical quantities, display interpolation and decorative effects.

## Scientific and implementation status

The browser renderer is `IMPLEMENTED` for demonstration. Typed production mappings, complete provenance/readout enforcement and visual validation are `PLANNED`. Any mapping presented as decision-support evidence is `REQUIRES DOMAIN REVIEW`.

## Inputs

Governed terrain/render mesh and typed fields for depth, stage, wet/dry, extent, arrival time, uncertainty and validated physical velocity/direction when computed; camera/interaction configuration is separate display input.

## Outputs

GPU buffers/textures/uniforms, rendered frames, legends/readouts tied to source field IDs, display diagnostics and explicit not-computed/no-data states. No output is a scientific engine input.

## Dependencies and allowed dependency direction

GIS, Hydraulic, Flood Propagation and Digital Twin feed Visualization. Data flows normalized state -> display projection -> GPU -> pixels/readouts. Shader results, particles, wave phase, frame interpolation and camera state cannot update model or persisted physical state.

## Accepted alternatives and recommended method

Accepted mappings include per-vertex attributes, textures, tiled fields and instanced vectors. Recommend a typed adapter that validates quantity/unit/CRS/time/provenance, then creates immutable frame resources. CPU/GPU interpolation is display-only unless a separately verified scientific resampler publishes a new normalized field.

## Governing equations and implementation form

No hydraulic equation is solved in shaders. Mapping functions transform supplied depth to elevation/color/opacity, validated vector state to direction glyphs, arrival to time categories and uncertainty to an approved channel. Interpolation is bounded between same-quantity valid states and carries source timestamps; visual waves/particles are additive decoration.

## Variables, units, parameters and bounds

Depth [m], elevation [m datum], validated velocity [m/s], direction [degrees/vector], arrival [UTC timestamp or duration], wet/dry boolean, uncertainty [declared representation], opacity/color/glyph scale [display units], wave phase and particle speed [decorative units]. Clamp display parameters only; never silently clamp exported/readout physical values.

## Data structures and serialization

`PhysicalFieldRef`, `RenderMeshRef`, `GPUFieldBinding`, `VisualMappingVersion`, `FrameState`, `LegendSpec`, `ReadoutBinding` and `RenderDiagnostics` retain quantity ID, unit, source/run/version, valid time, provenance, no-data mask and mapping version.

## Update cadence and triggering events

Upload/project on accepted state/version/time changes, camera/LOD changes or mapping-version changes. Animation frames may run faster than scientific cadence but interpolate only within declared windows; stale state stays visibly stale.

## Spatial and temporal resolution

Display tiles/meshes may be coarser than solver fields with measured projection error. Temporal interpolation cannot create earlier arrival, new wet cells or extrema outside source endpoints unless an authoritative derived product says so.

## Complexity and resource use

Cost scales with visible vertices/cells, textures, uploads, overdraw, particles and frame rate. Frame/GPU memory targets are specifications until measured on named devices/scenes; see [LOD and GPU optimisation](11-lod-and-gpu-optimisation.md).

## Initialization, warm-up and boundary conditions

Validate mesh/field CRS, extent, shape, unit, time and no-data compatibility before binding. Until a valid field arrives, render an explicit unavailable/not-computed state, not zero depth or synthetic motion presented as data.

## Calibration method and observations

Rendering is not scientifically calibrated. Color/glyph/readout mappings are checked against fixed fixtures and reviewed comprehension/accessibility studies; projection tolerances are verified against authoritative fields.

## Validation metrics, datasets and acceptance thresholds

Use pixel/reference fixtures, readout equality, no-data correctness, spatial alignment, temporal-state correctness, color/accessibility checks and task-comprehension evidence. Thresholds are targets pending review; visual similarity cannot validate hydraulics.

## Verification tests and invariants

Test typed binding rejection, unit/CRS/time mismatch, exact known vertex/texture samples, no-data masks, not-computed velocity, wet/dry/arrival invariants, deterministic frames for fixed inputs, context loss/reload and prohibition of GPU/shader readback into science.

## Visualization derived from measurable state

Depth, extent, wet/dry, arrival and uncertainty require corresponding normalized fields. Direction requires validated velocity/direction. If a quantity is absent, the exact behavior is: show “Not computed”, remove its quantitative legend/readout/export, and suppress any decoration that could be mistaken for it.

## Assumptions and limitations

Screen resolution, occlusion, perspective, interpolation and color perception limit interpretation. Waves and particles can suggest motion but are not measurements. A high-detail render mesh does not improve source terrain or hydraulic accuracy.

## Failure detection, degraded behavior and recovery

Detect schema/binding mismatch, invalid buffers/textures, context loss, stale/missing fields, shader compile errors and GPU budget exceedance. Fall back to simpler labelled rendering or unavailable layers; recover by rebuilding resources from immutable normalized state, never from pixels.

## Future extensions and scientific prerequisites

Uncertainty ensembles, volumetric rendering, WebGPU compute and server-streamed tiles require typed state contracts, device benchmarks, accessibility review and scientific separation tests.

## Implementation evidence and traceability

Each frame/readout is traceable to run, field, mesh and mapping versions. Current effects and synthetic sources are documented in [DATA_AND_METHODS](../../DATA_AND_METHODS.md); production evidence includes fixture captures and automated binding/invariant results.

## Next

Apply resource controls from [LOD and GPU Optimisation](11-lod-and-gpu-optimisation.md) and semantics from [Visualisation and Animation Rules](12-visualisation-and-animation-rules.md).
