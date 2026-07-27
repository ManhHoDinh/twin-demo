# Scientific Digital Twin Documentation Design

**Status:** Approved for implementation  
**Date:** 2026-07-27  
**Repositories:** `FloodTwin_Q1_Demo` (`app.skylabs.vn`) and `SkyLabs_SURF2026` (`info.skylabs.vn`)  
**Audience:** Hydrologists, hydraulic engineers, reservoir operators, emergency managers, software engineers, technical reviewers

## 1. Outcome

FloodTwin will expose a scientifically credible, implementation-ready account of how rainfall becomes runoff, reservoir inflow, storage and release, downstream propagation, inundation, impact, uncertainty, and a human-reviewed recommendation.

The documentation and application must answer five questions for every supported quantity:

1. Where did the data come from?
2. How was it processed?
3. Why did the simulation behave this way?
4. What assumptions and limitations apply?
5. How confident is the system, and why?

The work does not claim that the current reference demo is an operational hydrologic model. Existing synthetic hydrology stays labelled `SYNTHETIC`. Planned production methods stay labelled `PLANNED` or `REFERENCE MODEL` until implemented, calibrated, independently reviewed, and validated.

## 2. Authority and publication architecture

The system uses one canonical handbook and two projections.

### 2.1 Canonical scientific handbook

`FloodTwin_Q1_Demo/docs/` is the source of truth for domain models, engineering contracts, assumptions, limitations, calibration, validation, verification, performance targets, risks, and implementation status.

Existing foundation documents remain authoritative for established domain science. New engineering documents link to those foundations instead of copying equations or scientific claims.

### 2.2 Public engineering projection

`SkyLabs_SURF2026/info/` publishes a curated Vietnamese projection for `info.skylabs.vn`. It explains the end-to-end scientific chain, engine boundaries, physically grounded visualization, and evidence gates. Public pages link back to canonical document identifiers and never become a second independent scientific source.

### 2.3 In-application explainability projection

`FloodTwin_Q1_Demo/` exposes contextual explanations on `app.skylabs.vn`. Users inspect the state represented by a map cell, river segment, reservoir, gauge, forecast quantity, scenario result, or decision proposal. The application reads normalized physical state and provenance; it does not infer scientific values from colors, shaders, particle motion, or other rendering state.

## 3. Scientific status vocabulary

Every model, algorithm, data source, quantity, performance claim, and validation claim uses one status:

| Status | Meaning |
|---|---|
| `IMPLEMENTED` | Exists in the current application and is covered by executable or observable evidence. |
| `PLANNED` | Approved target behavior that is not implemented. |
| `REFERENCE MODEL` | Accepted engineering method recommended for production, not necessarily used by the demo. |
| `REQUIRES DOMAIN REVIEW` | A parameter, assumption, interpretation, or method that requires review by a qualified hydrologist, hydraulic engineer, reservoir engineer, dam-safety engineer, meteorologist, GIS specialist, or emergency-management authority. |

These statuses supplement, not replace, the quantity provenance tags already defined by the product: `MEASURED`, `FORECAST`, `MODELLED`, `ASSUMED`, and `SYNTHETIC`.

## 4. Canonical engineering document set

Create `FloodTwin_Q1_Demo/docs/07-engineering/` with the following focused documents:

| File | Responsibility |
|---|---|
| `README.md` | Engineering index, reading paths, document graph, status legend, and requirement traceability entry point. |
| `01-scientific-architecture.md` | Scientific principles, accepted-model selection, evidence hierarchy, uncertainty chain, and separation of observations, models, decisions, and visuals. |
| `02-simulation-architecture.md` | Engine boundaries, orchestration, clocks, state transitions, coupling, determinism, replay, checkpoints, and failure isolation. |
| `03-engine-contract-catalog.md` | Uniform contracts for Terrain, Hydrology, Hydraulic, Weather, Reservoir, River Network, Flood Propagation, Digital Twin, Scenario, Decision Support, AI Explanation, and Visualization engines. |
| `04-hydrology-model.md` | Rainfall-runoff model comparison and recommendation, governing equations, catchment discretization, antecedent state, parameter estimation, calibration, and validation. |
| `05-hydraulic-model.md` | 1D/2D hydraulic model comparison and recommendation, Saint-Venant or shallow-water equations, wetting/drying, structures, boundaries, numerical stability, and validation. |
| `06-reservoir-model.md` | Storage continuity, elevation-area-storage curves, outlet and spillway hydraulics, gates, ramp limits, rule curves, operating constraints, and cascade coupling. |
| `07-river-network-model.md` | Directed network topology, reaches, junctions, diversions, travel time, routing choices, boundary conditions, and propagation of reservoir releases. |
| `08-data-pipeline.md` | Source registry, ingestion, timestamping, quality control, datum and unit normalization, gap handling, lineage, storage, versioning, and degradation. |
| `09-gis-architecture.md` | Coordinate reference systems, terrain and bathymetry, raster/vector tiling, meshes, buildings, roads, population, shelters, spatial indexing, and reprojection controls. |
| `10-3d-rendering-pipeline.md` | Physical-state-to-GPU contracts for depth, velocity, direction, momentum proxy, arrival time, extent, waves, wetting/drying, and uncertainty. |
| `11-lod-and-gpu-optimisation.md` | Spatial LOD, temporal LOD, mesh and texture budgets, culling, tiling, interpolation, GPU memory, frame budgets, and scientific fidelity constraints. |
| `12-visualisation-and-animation-rules.md` | Measurable-state visual mappings, legends, animation constraints, interaction rules, accessibility, and explicit prohibitions on random or decorative flow. |
| `13-decision-engine.md` | Feasibility constraints, alternatives, objective functions, uncertainty-aware optimization, human authority, AI explanation boundaries, and decision records. |
| `14-calibration-and-validation.md` | Calibration datasets, split strategy, objective functions, parameter identifiability, sensitivity analysis, event validation, spatial validation, and acceptance thresholds. |
| `15-verification-strategy.md` | Equation/unit checks, conservation tests, numerical convergence, invariants, integration tests, scenario regression, UI grounding, and independent review. |
| `16-performance-targets.md` | Update cadence, latency, throughput, memory, scenario runtime, ensemble size, rendering FPS, degraded modes, and measurement methods. |
| `17-engineering-risks-and-open-questions.md` | Ranked scientific, data, numerical, operational, legal, UX, and performance risks plus concrete questions that block production claims. |
| `18-requirement-traceability.md` | Every requirement from the scientific brief mapped to canonical evidence, public projection, app projection, validation evidence, and implementation status. |

The public brief names seventeen output themes but also requires twelve independent engines and a requirement-by-requirement audit. The index and traceability documents are therefore additional control documents, not new scientific scope.

## 5. Mandatory engine contract

Each engine entry in `03-engine-contract-catalog.md` and each specialized model document must include:

- purpose;
- inputs with source, schema, units, datum, spatial support, timestamp semantics, provenance, and uncertainty;
- outputs with schema, units, validity range, provenance, and uncertainty;
- dependencies and allowed dependency direction;
- accepted engineering algorithms and the recommended method;
- governing equations where scientific computation occurs;
- variables, units, parameters, and parameter bounds;
- data structures and serialization contracts;
- update frequency and triggering events;
- suitable spatial and temporal resolution;
- computational complexity and expected resource use;
- initialization, warm-up, and boundary conditions;
- calibration method and required observations;
- validation method, metrics, datasets, and acceptance thresholds;
- verification tests and invariants;
- visual behavior derived from measurable output state;
- assumptions and limitations;
- failure modes, detection, degraded behavior, and recovery;
- future extensions and their scientific prerequisites;
- implementation status and evidence links.

No engine may cite a rendering effect as evidence that the physical model is correct.

## 6. Model-selection rules

For every scientific computation the handbook must:

1. identify accepted engineering alternatives;
2. explain the physical and operational conditions under which each is valid;
3. compare accuracy, data demand, calibration burden, stability, runtime, and interpretability;
4. recommend one method for the production target and separately identify what the demo currently uses;
5. state assumptions and failure regimes;
6. identify required inputs and expected outputs;
7. define calibration, validation, and verification evidence before a production claim is allowed.

The handbook must reject parameter values or resolutions merely chosen to make visuals attractive. Unknown values remain unknown and are represented as missing, assumed, or subject to domain review.

## 7. State and data flow

The required dependency chain is:

```text
observations and forecasts
  -> quality-controlled, versioned input state
  -> independent scientific engines
  -> normalized physical state
  -> scenario and decision-support state
  -> GPU visualization state
  -> interaction and explanation state
```

The reverse path is prohibited. User interaction may request a scenario or query state, but a shader, color ramp, animation phase, camera, particle, or screen-space approximation may not modify scientific state.

Every physical-state quantity carries at least:

```text
value, unit, valid_time, issue_time, source_id, model_id, model_version,
provenance, confidence_grade, uncertainty_representation, quality_flags,
assumptions, limitations
```

Spatial fields additionally identify coordinate reference system, grid or mesh identifier, cell or feature identifier, resolution, interpolation method, and no-data semantics.

## 8. Public pages on info.skylabs.vn

Add four pages under `SkyLabs_SURF2026/info/` and include them in shared navigation, the index, sitemap, feed or changelog where required by existing repository conventions:

| Page | Purpose |
|---|---|
| `scientific-architecture.html` | End-to-end scientific chain, evidence hierarchy, model status, and engine map. |
| `simulation-engines.html` | Twelve engine summaries, their contracts, coupling, inputs, outputs, assumptions, and limitations. |
| `visualisation-science.html` | Separation of physics and rendering; depth, velocity, direction, arrival, wet/dry, uncertainty, LOD, GPU, and animation rules. |
| `calibration-verification.html` | Calibration, validation, verification, performance targets, risk register, and what evidence is still missing. |

Pages are written primarily in Vietnamese. Equations, symbols, SI units, identifiers, and canonical English model names remain unchanged. Public text distinguishes current behavior from production plans on every feature and performance claim.

## 9. Contextual explainability in app.skylabs.vn

### 9.1 Entry points

The existing Method button becomes an overview and a gateway to an `Explain this state` inspector. The inspector opens when a user selects a supported map cell, river segment, reservoir, gauge, zone, forecast quantity, or decision proposal. It is accessible by pointer, keyboard, and touch.

### 9.2 Inspector content

The inspector renders only fields present in normalized physical or decision state. Depending on the selected entity, it may show:

- water depth;
- velocity magnitude and vector direction;
- discharge or reservoir inflow/outflow;
- arrival time and peak time;
- wet/dry state and flood extent membership;
- source contribution or explicit statement that attribution is unavailable;
- upstream and local rainfall forcing;
- reservoir source and cascade path;
- forecast ensemble interval or probability;
- confidence grade and the reasons for that grade;
- data provenance and freshness;
- model name, version, and run identifier;
- assumptions, limitations, and known missing dependencies;
- AI recommendation evidence, constraints, alternatives, and residual risk.

If the engine does not compute velocity, momentum, arrival time, attribution, or another requested quantity, the inspector displays `not computed` or `planned`. It never derives a numerical value from animated texture speed, particle direction, color, opacity, or a display-only interpolation.

### 9.3 Language and authority

Vietnamese is primary. Existing English mode receives equivalent operational labels and explanations. The app remains advisory: AI explains and compares model-backed options but cannot create hydrologic values, issue an operating order, or autonomously issue an official warning.

## 10. Visualization and animation constraints

Each effect must map to a measurable field or a documented visualization-only transformation:

| Visual property | Scientific source |
|---|---|
| Flood surface elevation | Terrain or bed elevation plus modeled depth. |
| Depth color band | Modeled depth using fixed, documented thresholds. |
| Flow direction | Modeled depth-averaged velocity vector or explicitly unavailable. |
| Motion speed | Bounded mapping from modeled velocity magnitude; never a random speed. |
| Wetting and drying | Solver wet/dry state and threshold with hysteresis. |
| Arrival-time display | First threshold-crossing time from scenario output. |
| Flood extent | Connected wet cells or model-defined inundation polygons. |
| Uncertainty | Ensemble quantiles, exceedance probability, confidence grade, or model-discrepancy layer. |
| Wave or disturbance animation | Modeled transient or documented non-quantitative cue that is never presented as physical wave height. |

Decorative rain may communicate scenario forcing only if intensity is deterministically tied to forcing and labelled as visualization. Random flow paths, random flood expansion, and shader-generated physical readouts are prohibited.

## 11. Failure and degraded behavior

When a value cannot be supported, the system reports:

- the missing quantity;
- the missing or failed upstream dependency;
- the last valid time if any;
- whether the problem is missing data, quality rejection, stale data, model failure, unsupported physics, or planned functionality;
- the effect on confidence and permitted actions.

Measured, forecast, modelled, assumed, and synthetic quantities remain visually distinguishable. A stale or failed source cannot silently retain a high-confidence badge. Failure of the explanation layer cannot alter simulation state, and failure of visualization cannot alter physical state.

## 12. Validation design

### 12.1 Documentation validation

A traceability verifier checks that every requested subsystem, deliverable, mandatory engine field, mathematical-model field, and cross-reference has an authoritative target. Link and navigation checks cover both repositories. A status audit rejects unlabelled production claims and ambiguous current-versus-planned language.

### 12.2 Application validation

Automated tests verify:

- supported entity selection by pointer, keyboard, and touch;
- correct physical-state values and units;
- provenance, model version, time, uncertainty, and confidence reasons;
- honest missing-field behavior;
- bilingual parity;
- separation between physical state and rendering state;
- no numerical readout sourced from shader or animation variables;
- mobile and desktop inspector layout;
- focus management, escape/close behavior, and screen-reader labels;
- links from app explanations to the correct public documentation section.

### 12.3 Repository gates

The implementation must pass the existing focused app tests, app self-tests, JavaScript syntax checks, `SkyLabs_SURF2026` verification, end-to-end tests, documentation link checks, and behavior-appropriate visual inspection. Existing dirty changes are preserved and are not reverted or included in task commits unless directly required by this design.

### 12.4 Completion audit

Completion is proved by `18-requirement-traceability.md`. Each brief requirement records:

- canonical document;
- public page and section;
- app surface or explicit non-applicability;
- implementation status;
- executable or observable validation evidence;
- unresolved domain-review dependency.

A requirement marked only `PLANNED`, `REFERENCE MODEL`, or `REQUIRES DOMAIN REVIEW` can satisfy documentation completeness but cannot be reported as implemented product behavior.

## 13. Scope boundaries

This work documents a production-grade target architecture and adds truthful explainability to the current reference application. It does not silently replace the demo's synthetic hydrology with a production solver, claim operational calibration, invent telemetry, invent terrain or bathymetry, invent gate geometry, or claim independent scientific validation.

Production implementation of the recommended hydrology, hydraulics, reservoir, weather, and optimization methods is future engineering work gated by real data agreements, basin configuration, calibration datasets, domain review, and acceptance evidence defined by the new handbook.

## 14. Approved design decisions

1. `FloodTwin_Q1_Demo/docs/` is canonical.
2. `info.skylabs.vn` publishes a curated Vietnamese projection.
3. `app.skylabs.vn` exposes contextual, state-backed explainability.
4. Existing foundation science is reused and cross-referenced.
5. Rendering never becomes physics or a source of scientific values.
6. Missing scientific state is shown as missing, never synthesized for presentation.
7. Current, planned, reference, and review-required work remain explicit.
8. Completion is requirement-traceable and evidence-based.
