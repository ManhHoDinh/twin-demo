# Scientific Architecture

| Field | Value |
|---|---|
| Document ID | ENG-01 |
| Owner | Scientific architecture lead |
| Status | REFERENCE MODEL |
| Current demo | Deterministic synthetic hydrology and flood demonstration with partial quantity envelopes |
| Production target | Traceable, calibrated, independently reviewed scientific state and advisory outputs |
| Domain review | Hydrology, hydraulics, reservoir, meteorology, GIS, dam safety, emergency management |
| Authoritative dependencies | [Foundations](../00-foundations/01-glossary.md), [observation model](../01-domain-model/03-observation-model.md), [decision support](../04-decision-support/01-decision-engine-spec.md), [uncertainty](../04-decision-support/02-uncertainty-and-confidence.md) |

**Document ID:** ENG-01
**Status:** REFERENCE MODEL

This document defines separation, evidence and claim rules. It does not replace the scientific equations in [Foundations](../00-foundations/01-glossary.md) or the entity semantics in the [Domain model](../01-domain-model/01-entity-model.md).

## Scientific state flow

```text
observation / forecast
  -> quality control and immutable input version
  -> independent scientific engines
  -> normalized physical state
  -> scenario and decision-support state
  -> GPU visualization state
  -> interaction and explanation state
```

Each arrow is typed, versioned and auditable. The reverse direction is prohibited. A user may request a scenario or query existing state, but a shader, color ramp, camera, animation phase, particle, screen-space interpolation or explanatory phrase cannot write a scientific value.

## Separation of state and projection

| Layer | May do | Must not do |
|---|---|---|
| Observation/QC | Accept, reject, flag, normalize and version source data | Silently repair or relabel provenance |
| Scientific engine | Compute a declared quantity from allowed upstream contracts | Read GPU or interaction state |
| Normalized physical state | Carry units, time, model and uncertainty consistently | Hide missing or stale dependencies |
| Scenario/decision | Compare alternatives and expose constraints and residual risk | Issue an official order or warning |
| GPU/interaction/explanation | Render, query and explain supplied state | Infer physical values from visual effects or mutate scientific state |

AI Explanation and Visualization are read-only consumers. Human action creates a new decision record or scenario request, never an untracked edit to model output.

## Evidence hierarchy

From strongest to weakest for a production claim:

1. Independently reviewed validation against representative observations with predefined acceptance thresholds.
2. Calibration/validation split evidence, sensitivity analysis and uncertainty coverage.
3. Verification evidence: conservation, unit, invariant, convergence, deterministic replay and integration tests.
4. Versioned implementation evidence tied to code, configuration and input snapshots.
5. Expert-reviewed `REFERENCE MODEL` rationale.
6. `ASSUMED` or `SYNTHETIC` demonstrations, which can test workflows but cannot establish operational validity.

Visual plausibility, smooth animation and agreement with a hand-picked event are not validation.

## Normalized quantity envelope

Every scalar, series or field exposed across engine boundaries carries these minimum fields:

| Field | Requirement |
|---|---|
| `value` | Numeric, categorical, vector or explicit no-data value |
| `unit` | SI or declared domain unit; dimensionally checked |
| `valid_time` | Time represented by the value |
| `issue_time` | Time the source or forecast was issued |
| `source` | Stable source identifier and lineage |
| `model` | Model identifier, or `none` for direct observations |
| `version` | Source/model/configuration version |
| `provenance` | `MEASURED`, `FORECAST`, `MODELLED`, `ASSUMED`, or `SYNTHETIC` |
| `confidence` | Grade and reasons, not only a badge |
| `uncertainty` | Distribution, ensemble, interval, probability, error model, or explicit unavailable state |
| `quality` | Flags, freshness, acceptance/rejection and corrections |
| `assumptions` | Identified assumptions affecting interpretation |
| `limitations` | Unsupported regimes, missing dependencies and known failure conditions |

Spatial quantities also include CRS, vertical datum, grid/mesh/feature identifier, spatial support, resolution, interpolation method and no-data semantics. These requirements extend the canonical [observation model](../01-domain-model/03-observation-model.md); they do not redefine its entities.

## Model-selection protocol

For each scientific computation:

1. Define the decision-relevant output, required accuracy, latency and supported physical regimes.
2. Compare accepted alternatives for validity, data demand, calibration burden, numerical stability, runtime and interpretability.
3. Identify the current demo method separately from the recommended production method.
4. State governing-equation authority by linking to [Foundations](../00-foundations/01-glossary.md), rather than copying it.
5. Declare parameters, bounds, initialization, boundary conditions and failure regimes.
6. Define calibration observations, independent validation datasets, metrics and acceptance thresholds before implementation is called production-ready.
7. Require discipline review where a parameter, legal threshold or local interpretation is unresolved.

Parameters and resolutions cannot be selected merely to improve appearance. Unknown values remain missing, `ASSUMED`, or `REQUIRES DOMAIN REVIEW`.

## Uncertainty chain

Uncertainty is preserved and attributed through forcing, observation error, model structure, parameters, initial/boundary conditions, numerical approximation, coupling and decision consequences. Engines must not collapse an ensemble or interval to a point without retaining the reduction method and discarded spread. Correlation assumptions are explicit; double counting and false independence are prohibited.

Confidence follows the [uncertainty authority](../04-decision-support/02-uncertainty-and-confidence.md). Stale data, failed dependencies, unsupported physics or extrapolation automatically lower confidence or make a result unusable. Scenario comparison reports uncertainty in both proposal and counterfactual.

## Production claim gates

A scientific component may claim production suitability only after all applicable gates pass:

| Gate | Required evidence |
|---|---|
| Contract | Complete engine inputs, outputs, dependency direction and failure behavior |
| Provenance | Versioned input registry, QC, lineage, datum and unit normalization |
| Verification | Equations/units, conservation, invariants, replay and integration checks |
| Calibration | Documented observations, objective functions, identifiability and bounds |
| Validation | Independent events/locations, predefined metrics and acceptance thresholds |
| Performance | Measured update latency, runtime, capacity and degraded profiles |
| Domain review | Signed review by relevant qualified disciplines |
| Operational/legal | Human authority, audit, procedures, training and verified legal interpretation |

`IMPLEMENTED` satisfies only the implementation-evidence part of these gates. The current demo evidence in [DATA_AND_METHODS](../../DATA_AND_METHODS.md) remains `SYNTHETIC` for hydrology, reservoir behavior and flood fields; AWS terrain is an external raster surface, not surveyed river bathymetry.

## Human authority

The system is advisory. A qualified human operator owns acceptance, modification, rejection, deferment, escalation and official communication. Decision Support may rank feasible alternatives and AI Explanation may summarize evidence, but neither may relax hard constraints, invent missing values, create an operating order, or issue an official public warning. Legal thresholds and operating interpretations require qualified review against primary instruments.

## Architecture invariants

- Every displayed physical number originates in normalized state, never rendering state.
- Every run is attributable to immutable inputs, model/config versions and a run identifier.
- Missing, stale, rejected and unsupported values remain visible as such.
- A failed downstream projection cannot alter upstream state.
- Independent engines exchange declared contracts; undocumented shared mutable state is prohibited.
- Current and target behavior are always distinguished.

## Next

Continue to [Simulation architecture](02-simulation-architecture.md), then apply the [Engine contract catalog](03-engine-contract-catalog.md).
