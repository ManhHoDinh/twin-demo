# Visualisation and Animation Rules

| Field | Value |
|---|---|
| Document ID | ENG-12 |
| Owner | Scientific visualisation lead |
| Status | REQUIRES DOMAIN REVIEW |
| Current demo | Deterministic flood, rain, wave and particle presentation using partly `SYNTHETIC` state and visual motion proxies |
| Production target | Fixed, accessible measurable mappings with provenance, uncertainty and explicit non-physical effects |
| Domain review | Hydraulics, emergency communication, UX/accessibility, GIS and scientific visualisation |
| Authoritative dependencies | [3D rendering](10-3d-rendering-pipeline.md), [uncertainty](../04-decision-support/02-uncertainty-and-confidence.md), [UX principles](../05-product/04-ux-principles.md), [hydraulic model](05-hydraulic-model.md) |

## Purpose and scope

Define stable visual meanings for depth, direction, wet/dry state, extent, arrival and uncertainty, plus interaction/readout behavior. Decorative animation may support orientation but cannot impersonate measurement or model output.

## Scientific and implementation status

Demo visualization is `IMPLEMENTED`; its scientific interpretation is limited by synthetic inputs and proxy effects. Production mappings, user validation and accessibility evidence are `PLANNED`; operational communication semantics are `REQUIRES DOMAIN REVIEW`.

## Inputs

Typed normalized quantities and quality/provenance/uncertainty, approved mapping/legend versions, target locale/accessibility settings, and display-only deterministic seeds/time for decoration.

## Outputs

Legends, colors/bands, glyphs, animations, labels, tooltips/readouts, selection/compare states, accessible alternatives and exports carrying source time/provenance.

## Dependencies and allowed dependency direction

Digital Twin and rendering adapters feed visual components. Interaction may request a query/scenario but cannot edit scientific state. AI explanation may describe displayed evidence but cannot redefine legend thresholds or fill missing quantities.

## Accepted alternatives and recommended method

Use fixed categorical/continuous ramps, contours, direction glyphs, arrival bands and uncertainty overlays/small multiples as appropriate. Recommend redundant encodings—color plus label/pattern/shape—with a stable legend and direct numeric readout. Avoid purely animated or hue-only communication.

## Governing equations and implementation form

Mappings are deterministic functions of a named quantity, unit, mapping version and state. Depth bands use fixed reviewed boundaries; wet/dry uses the model's declared threshold; arrival uses source valid time; direction uses validated vector components. Animation phase/randomness is excluded from quantitative mapping.

## Variables, units, parameters and bounds

Depth [m], stage [m datum], validated velocity [m/s], direction [degrees/vector], arrival [UTC/local-labelled time or duration], wet/dry boolean, uncertainty/probability [% or declared form], legend thresholds, opacity, pattern and animation rate. Physical values remain unclipped in readouts; display saturation is disclosed.

## Data structures and serialization

`VisualEncodingSpec`, `LegendVersion`, `LayerState`, `InteractionState`, `AccessibleDescription`, `ReadoutRecord` and `ExportManifest` bind quantity/source/run/time, unit, provenance, quality, uncertainty and mapping version.

## Update cadence and triggering events

Update mappings when accepted state/time/layer/mapping/locale changes. Animation clocks update display effects only. Timeline scrubbing shows the selected valid time and prevents stale readouts from a previous frame.

## Spatial and temporal resolution

Legends disclose effective source/display resolution where relevant. Interpolation cannot invent wetting, arrival or flow reversal. Compare views use aligned time, CRS, scale and mapping.

## Complexity and resource use

Cost scales with visible layers, labels/glyphs, interaction queries and effects. Accessibility and deterministic decoration are requirements, not optional performance casualties; [LOD rules](11-lod-and-gpu-optimisation.md) define ordered degradation.

## Initialization, warm-up and boundary conditions

Before valid data, show “Not computed”/“Unavailable” with cause; do not initialize flood to zero or random extent. Restore legends/selections only when compatible with the current mapping/data version.

## Calibration method and observations

Visual mappings are not hydraulic calibration. Review depth bands and warning semantics with domain experts; evaluate comprehension, discrimination and accessibility with representative users/tasks. Decorative settings are chosen for clarity, never fitted to observations.

## Validation metrics, datasets and acceptance thresholds

Measure numeric readout accuracy, legend comprehension, category discrimination, task error/time, color-vision/contrast conformance and correct interpretation of provenance/uncertainty. Predeclare acceptance thresholds; none are claimed achieved or legally approved here.

## Verification tests and invariants

Test fixed mapping fixtures, legend/readout agreement, deterministic replay, no-data/not-computed states, color/keyboard/screen-reader behavior, timeline synchronization and export lineage. Random flood expansion or random flow direction must fail tests.

## Visualization derived from measurable state

- Depth color/bands derive only from depth; wet/dry and extent derive from corresponding model products.
- Direction arrows/streamlines derive only from validated physical velocity/direction. A momentum proxy must be labelled “momentum proxy”, define its inputs/units, and never appear as velocity.
- Wave animation is decorative surface motion and cannot report wave height, velocity or discharge.
- Particles are never the source for numeric readouts, legends, exports or downstream computation.
- Decorative rain uses a deterministic seed and is labelled illustrative unless driven by a normalized rainfall field; random flood expansion and random flow are prohibited.

## Assumptions and limitations

Color, perspective, occlusion and motion bias perception. Momentum proxies may indicate relative tendency but not physical velocity. Wave/particle animation can overstate certainty or direction. Accessibility alternatives are required for color/motion-dependent content.

## Failure detection, degraded behavior and recovery

Detect missing/mismatched quantity/unit/time, stale mapping, invalid legend, readout-frame mismatch, inaccessible contrast/input and non-deterministic quantitative output. Suppress the affected layer/readout, retain an explicit reason, and recover from typed normalized state plus the approved mapping version.

## Future extensions and scientific prerequisites

Probabilistic animation, ensemble comparison, impact narratives and immersive displays require validated uncertainty semantics, user research, accessibility review and safeguards against implying official warnings.

## Implementation evidence and traceability

Evidence links mapping/legend version, source/run/time, deterministic seed for decoration, accessibility/test results and review disposition. [DATA_AND_METHODS](../../DATA_AND_METHODS.md) bounds present demo effects and proxy claims.

## Next

Use these rules as constraints for the planned decision, calibration, verification, performance, risk and traceability documents `ENG-13` through `ENG-18`.
