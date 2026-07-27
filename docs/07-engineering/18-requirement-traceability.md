# Requirement Traceability

| Field | Value |
|---|---|
| Document ID | ENG-18 |
| Owner | Scientific engineering lead |
| Status | PLANNED |
| Current demo | Canonical documentation coverage with product/public projections still pending |
| Production target | Atomic requirement-to-evidence audit across handbook, public projection, application and validation |
| Domain review | Scientific, operational, legal, product, accessibility and independent assurance owners |
| Authoritative dependencies | [Approved documentation design](../superpowers/specs/2026-07-27-scientific-digital-twin-documentation-design.md), [engineering index](README.md), [document conventions](../99-appendix/document-conventions.md) |

## Purpose and scope

Provide one stable row per scientific-brief obligation. Documentation completeness is distinct from product implementation and scientific validity: `PLANNED`, `REFERENCE MODEL` and `REQUIRES DOMAIN REVIEW` rows remain open product/evidence work.

## Scientific and implementation status

The canonical handbook rows are implemented documentation where linked to existing files and checked by the verifier. Public and application projections are generally `PLANNED`. No row claims operational calibration, independent validation, legal approval or production fitness without evidence.

## Inputs

The approved design, source brief, canonical handbook, existing application/code/tests, public/app projection plans, validation artifacts and domain-review dispositions.

## Outputs

Atomic stable IDs with verbatim requirement, source locator, canonical evidence, public projection, application projection or N/A, validation evidence, honest status, review dependency and owner.

## Dependencies and allowed dependency direction

Canonical documents are authoritative; public and app surfaces project them. Traceability may gate claims but cannot redefine science, code behavior, legal authority or validation results.

## Accepted alternatives and recommended method

Maintain a row-based matrix in version control. Split compound requirements into atomic rows, retain stable IDs, link only existing evidence and use plain planned paths for future projections.

## Governing equations and implementation form

No scientific equation is computed here. The implementation invariant is set coverage: every source item maps to at least one unique row and every `IMPLEMENTED` row links non-self executable or regular-file validation evidence.

## Variables, units, parameters and bounds

Identifiers are permanent strings. Status is one allowed vocabulary value. Links remain repository-relative and inside the repository. Quantities and units remain in their canonical scientific documents.

## Data structures and serialization

The Markdown table is the durable representation. Columns are fixed; rows are atomic; IDs are stable; future automated export must preserve source text and links losslessly.

## Update cadence and triggering events

Update with any brief, canonical document, public/app projection, implementation, test, domain disposition or claim-status change. Deleted requirements remain recorded as withdrawn rather than reusing IDs.

## Spatial and temporal resolution

Requirements apply at their declared entity, grid/reach/reservoir/zone and time support. Traceability does not broaden a local result into basin-wide or all-horizon coverage.

## Complexity and resource use

Audit cost scales linearly with rows plus link/evidence checks. Completeness automation reduces clerical errors but does not replace technical review.

## Initialization, warm-up and boundary conditions

The baseline is the approved design and existing source repository at the recorded commit. Future-repository paths remain plain text or inline code until created.

## Calibration method and observations

Not applicable to the matrix. Rows covering calibration link the governing document and remain review-gated until real registry/split/results exist.

## Validation metrics, datasets and acceptance thresholds

Documentation validation checks structure, status, links and evidence semantics. Scientific/product rows require their own metrics, datasets, thresholds and approval; a documentation pass does not satisfy them.

## Verification tests and invariants

Require exact columns, unique IDs, allowed statuses, resolvable canonical links, no nonexistent linked projections, valid non-self evidence for every `IMPLEMENTED` row and coverage of all enumerated brief items.

## Visualization derived from measurable state

Traceability is rendered as documentation only. Any future UI view must preserve status/review dependencies and cannot convert colors or completion percentages into evidence.

## Assumptions and limitations

“Verbatim” follows the approved brief/design text available in this repository. The matrix demonstrates coverage, not correctness of the underlying model or implementation.

## Failure detection, degraded behavior and recovery

Broken/missing links, duplicate IDs, unsupported implementation claims or absent source coverage fail the documentation gate. Correct the row/evidence or downgrade status; never add a decorative link merely to pass.

## Future extensions and scientific prerequisites

Machine-readable source IDs, cross-repository checks and publication/app coverage dashboards require stable external artifacts and repository integration from later tasks.

## Implementation evidence and traceability

| Requirement ID | Verbatim requirement | Source locator | Canonical evidence | Public projection | App projection/N/A | Validation evidence | Status | Domain-review dependency | Owner |
|---|---|---|---|---|---|---|---|---|---|
| BR-GOAL-01 | Explain how rainfall becomes runoff, reservoir inflow, storage/release, downstream propagation, inundation, impact, uncertainty and a human-reviewed recommendation. | Approved design §1 | [Scientific architecture](01-scientific-architecture.md) | `info/scientific-architecture.html` PLANNED | Explain inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | All scientific/operational disciplines | Scientific lead |
| BR-EXPL-01 | Where did the data come from? | Approved design §1 question 1 | [Data pipeline](08-data-pipeline.md) | `info/scientific-architecture.html` PLANNED | Provenance field PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Data governance | Data lead |
| BR-EXPL-02 | How was it processed? | Approved design §1 question 2 | [Simulation architecture](02-simulation-architecture.md) | `info/simulation-engines.html` PLANNED | Processing lineage PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Engine owners | Engineering lead |
| BR-EXPL-03 | Why did the simulation behave this way? | Approved design §1 question 3 | [Engine catalog](03-engine-contract-catalog.md) | `info/simulation-engines.html` PLANNED | Explain-state rationale PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Scientific owners | Scientific lead |
| BR-EXPL-04 | What assumptions and limitations apply? | Approved design §1 question 4 | [Scientific architecture](01-scientific-architecture.md) | `info/scientific-architecture.html` PLANNED | Assumptions panel PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Domain owners | Product lead |
| BR-EXPL-05 | How confident is the system, and why? | Approved design §1 question 5 | [Uncertainty](../04-decision-support/02-uncertainty-and-confidence.md) | `info/calibration-verification.html` PLANNED | Confidence reasons PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Validation/meteorology | Validation lead |
| BR-SEL-01 | Identify accepted engineering alternatives. | Approved design §6 step 1 | [Scientific architecture](01-scientific-architecture.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Relevant discipline | Scientific lead |
| BR-SEL-02 | Explain conditions under which each alternative is valid. | Approved design §6 step 2 | [Scientific architecture](01-scientific-architecture.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Relevant discipline | Scientific lead |
| BR-SEL-03 | Compare accuracy, data demand, calibration burden, stability, runtime and interpretability. | Approved design §6 step 3 | [Scientific architecture](01-scientific-architecture.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Relevant discipline | Scientific lead |
| BR-SEL-04 | Recommend a production method separately from the current demo method. | Approved design §6 step 4 | [Scientific architecture](01-scientific-architecture.md) | `info/simulation-engines.html` PLANNED | Method view PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Relevant discipline | Scientific lead |
| BR-SEL-05 | State assumptions and failure regimes. | Approved design §6 step 5 | [Scientific architecture](01-scientific-architecture.md) | `info/scientific-architecture.html` PLANNED | Limitations view PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Relevant discipline | Scientific lead |
| BR-SEL-06 | Identify required inputs and expected outputs and define calibration, validation and verification evidence before a production claim. | Approved design §6 steps 6–7 | [Calibration and validation](14-calibration-and-validation.md) | `info/calibration-verification.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Validation owner | Validation lead |
| BR-ENG-01 | Terrain Engine. | Approved design §4/engine set | [Engine catalog](03-engine-contract-catalog.md) | `info/simulation-engines.html` PLANNED | Terrain inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | GIS/survey | GIS lead |
| BR-ENG-02 | Hydrology Engine. | Approved design §4/engine set | [Hydrology](04-hydrology-model.md) | `info/simulation-engines.html` PLANNED | Hydrology inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Hydrology | Hydrology lead |
| BR-ENG-03 | Hydraulic Engine. | Approved design §4/engine set | [Hydraulics](05-hydraulic-model.md) | `info/simulation-engines.html` PLANNED | Hydraulic inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Hydraulics | Hydraulic lead |
| BR-ENG-04 | Weather Engine. | Approved design §4/engine set | [Engine catalog](03-engine-contract-catalog.md) | `info/simulation-engines.html` PLANNED | Weather inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Meteorology | Meteorology lead |
| BR-ENG-05 | Reservoir Engine. | Approved design §4/engine set | [Reservoir](06-reservoir-model.md) | `info/simulation-engines.html` PLANNED | Reservoir inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Reservoir/dam safety | Reservoir lead |
| BR-ENG-06 | River Network Engine. | Approved design §4/engine set | [River network](07-river-network-model.md) | `info/simulation-engines.html` PLANNED | River inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Hydrology/hydraulics | Network lead |
| BR-ENG-07 | Flood Propagation Engine. | Approved design §4/engine set | [Engine catalog](03-engine-contract-catalog.md) | `info/simulation-engines.html` PLANNED | Flood inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Hydraulics/GIS | Hydraulic lead |
| BR-ENG-08 | Digital Twin Engine. | Approved design §4/engine set | [Engine catalog](03-engine-contract-catalog.md) | `info/simulation-engines.html` PLANNED | State inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Architecture/data | Engineering lead |
| BR-ENG-09 | Scenario Engine. | Approved design §4/engine set | [Simulation architecture](02-simulation-architecture.md) | `info/simulation-engines.html` PLANNED | Scenario compare PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Scientific owners | Scenario lead |
| BR-ENG-10 | Decision Support Engine. | Approved design §4/engine set | [Decision engine](13-decision-engine.md) | `info/simulation-engines.html` PLANNED | Decision package PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Operations/dam safety | Decision lead |
| BR-ENG-11 | AI Explanation Engine. | Approved design §4/engine set | [Engine catalog](03-engine-contract-catalog.md) | `info/simulation-engines.html` PLANNED | Explanation inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Product/operations | Product lead |
| BR-ENG-12 | Visualization Engine. | Approved design §4/engine set | [Visualization rules](12-visualisation-and-animation-rules.md) | `info/visualisation-science.html` PLANNED | Map/3D projection PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Visualization/accessibility | Visualization lead |
| BR-VIS-01 | Rendering is downstream of normalized physical state and cannot create scientific state. | Approved design §§7,10 | [Rendering pipeline](10-3d-rendering-pipeline.md) | `info/visualisation-science.html` PLANNED | Rendering boundary PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Scientific/graphics review | Visualization lead |
| BR-VIS-02 | Water depth is derived from modeled physical state. | Approved design §§9–10 | [Visualization rules](12-visualisation-and-animation-rules.md) | `info/visualisation-science.html` PLANNED | Depth inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Hydraulics | Hydraulic lead |
| BR-VIS-03 | Flood-surface elevation is governed terrain/bed elevation plus modeled depth in a common datum. | Approved design §10 | [Rendering pipeline](10-3d-rendering-pipeline.md) | `info/visualisation-science.html` PLANNED | Surface inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REQUIRES DOMAIN REVIEW | Datum/bathymetry | GIS lead |
| BR-VIS-04 | Velocity magnitude must come from validated physical velocity. | Approved design §§9–10 | [Hydraulics](05-hydraulic-model.md) | `info/visualisation-science.html` PLANNED | Velocity inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REQUIRES DOMAIN REVIEW | Hydraulic validation | Hydraulic lead |
| BR-VIS-05 | Flow direction must come from modeled velocity vectors or be unavailable. | Approved design §10 | [Visualization rules](12-visualisation-and-animation-rules.md) | `info/visualisation-science.html` PLANNED | Direction inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REQUIRES DOMAIN REVIEW | Hydraulic validation | Hydraulic lead |
| BR-VIS-06 | Momentum proxy must be labelled and cannot masquerade as physical momentum. | Scientific brief water states | [Rendering pipeline](10-3d-rendering-pipeline.md) | `info/visualisation-science.html` PLANNED | Momentum PLANNED/not computed | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Hydraulic definition | Hydraulic lead |
| BR-VIS-07 | Arrival time is the first declared threshold crossing. | Approved design §10 | [Visualization rules](12-visualisation-and-animation-rules.md) | `info/visualisation-science.html` PLANNED | Arrival inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Threshold approval | Hydraulic lead |
| BR-VIS-08 | Flood extent comes from connected wet cells or a model-defined polygon. | Approved design §10 | [Visualization rules](12-visualisation-and-animation-rules.md) | `info/visualisation-science.html` PLANNED | Extent inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Hydraulic/GIS validation | Hydraulic lead |
| BR-VIS-09 | Waves/disturbances are modeled transients or explicitly non-quantitative cues. | Approved design §10 | [Rendering pipeline](10-3d-rendering-pipeline.md) | `info/visualisation-science.html` PLANNED | Wave cue PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Hydraulic/UX review | Visualization lead |
| BR-VIS-10 | Wetting and drying use solver state and declared hysteresis thresholds. | Approved design §10 | [Visualization rules](12-visualisation-and-animation-rules.md) | `info/visualisation-science.html` PLANNED | Wet/dry inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Hydraulic threshold | Hydraulic lead |
| BR-VIS-11 | Uncertainty is shown from ensemble quantiles, exceedance probability, confidence or discrepancy state. | Approved design §10 | [Uncertainty](../04-decision-support/02-uncertainty-and-confidence.md) | `info/visualisation-science.html` PLANNED | Uncertainty inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Meteorology/validation | Validation lead |
| BR-MATH-01 | Hydrology documents governing equations, implementation form, variables, units, parameters and bounds. | Scientific brief per-module fields | [Hydrology](04-hydrology-model.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Hydrology | Hydrology lead |
| BR-MATH-02 | Hydraulics documents continuity/momentum, numerical form, wetting/drying, variables and stability. | Scientific brief per-module fields | [Hydraulics](05-hydraulic-model.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Hydraulics/numerics | Hydraulic lead |
| BR-MATH-03 | Reservoirs document storage continuity, curves, outlets, gates, constraints and cascade coupling. | Scientific brief per-module fields | [Reservoir](06-reservoir-model.md) | `info/simulation-engines.html` PLANNED | Reservoir view PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Reservoir/dam safety | Reservoir lead |
| BR-MATH-04 | River networks document topology, routing, junctions, diversions, splits and propagation. | Scientific brief per-module fields | [River network](07-river-network-model.md) | `info/simulation-engines.html` PLANNED | River view PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Hydrology/hydraulics | Network lead |
| BR-MATH-05 | Every scientific module specifies inputs, outputs and dependency direction. | Scientific brief per-module fields | [Engine catalog](03-engine-contract-catalog.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Engine owners | Engineering lead |
| BR-MATH-06 | Every scientific module specifies calibration, validation, verification and limitations. | Scientific brief per-module fields | [Calibration and validation](14-calibration-and-validation.md) | `info/calibration-verification.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Validation owners | Validation lead |
| BR-CAS-01 | Cascade reservoirs include reservoir identity, topology and downstream propagation path. | Scientific brief cascade fields | [Reservoir](06-reservoir-model.md) | `info/simulation-engines.html` PLANNED | Cascade view PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Reservoir/network | Reservoir lead |
| BR-CAS-02 | Cascade reservoirs include inflow, storage/elevation and release state with units and time. | Scientific brief cascade fields | [Reservoir](06-reservoir-model.md) | `info/simulation-engines.html` PLANNED | Reservoir inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Reservoir | Reservoir lead |
| BR-CAS-03 | Cascade reservoirs include elevation-area-storage and outlet/spillway/gate relationships. | Scientific brief cascade fields | [Reservoir](06-reservoir-model.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | REQUIRES DOMAIN REVIEW | Survey/dam safety | Reservoir lead |
| BR-CAS-04 | Cascade reservoirs include operating constraints, rule curves, ramp limits and decision rights. | Scientific brief cascade fields | [Decision rights](../02-stakeholders/02-decision-rights-raci.md) | `info/simulation-engines.html` PLANNED | Decision package PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REQUIRES DOMAIN REVIEW | Operators/dam safety/legal | Operations lead |
| BR-CAS-05 | Releases propagate through reaches, diversions and bifurcations with uncertainty. | Scientific brief propagation fields | [River network](07-river-network-model.md) | `info/simulation-engines.html` PLANNED | River/cascade PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REQUIRES DOMAIN REVIEW | Network/hydraulics | Network lead |
| BR-CAS-06 | Cascade alternatives show counterfactual downstream consequences on both affected rivers. | Scientific brief propagation fields | [Decision engine](13-decision-engine.md) | `info/simulation-engines.html` PLANNED | Decision comparison PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Reservoir/hydrology/operations | Decision lead |
| BR-CLICK-01 | Click-anywhere inspection identifies selected cell, feature or entity. | Approved design §9 | [GIS architecture](09-gis-architecture.md) | `info/scientific-architecture.html` PLANNED | Explain inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | GIS/accessibility | Product lead |
| BR-CLICK-02 | Click-anywhere inspection shows value and unit. | Approved design §9 | [Scientific architecture](01-scientific-architecture.md) | `info/scientific-architecture.html` PLANNED | Explain inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Quantity owner | Product lead |
| BR-CLICK-03 | Click-anywhere inspection shows valid time and issue time. | Approved design §9 | [Data pipeline](08-data-pipeline.md) | `info/scientific-architecture.html` PLANNED | Explain inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Data owner | Product lead |
| BR-CLICK-04 | Click-anywhere inspection shows source and provenance. | Approved design §9 | [Data pipeline](08-data-pipeline.md) | `info/scientific-architecture.html` PLANNED | Explain inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Data governance | Product lead |
| BR-CLICK-05 | Click-anywhere inspection shows model name, version and run ID. | Approved design §9 | [Simulation architecture](02-simulation-architecture.md) | `info/scientific-architecture.html` PLANNED | Explain inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Engineering | Product lead |
| BR-CLICK-06 | Click-anywhere inspection shows quality flags and freshness. | Approved design §9 | [Observation model](../01-domain-model/03-observation-model.md) | `info/scientific-architecture.html` PLANNED | Explain inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Data owner | Product lead |
| BR-CLICK-07 | Click-anywhere inspection shows uncertainty and confidence reasons. | Approved design §9 | [Uncertainty](../04-decision-support/02-uncertainty-and-confidence.md) | `info/calibration-verification.html` PLANNED | Explain inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Validation owner | Product lead |
| BR-CLICK-08 | Click-anywhere inspection shows assumptions and limitations. | Approved design §9 | [Scientific architecture](01-scientific-architecture.md) | `info/scientific-architecture.html` PLANNED | Explain inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Domain owner | Product lead |
| BR-CLICK-09 | Click-anywhere inspection shows depth, velocity/direction, discharge/inflow/outflow and wet/dry/extent only when computed. | Approved design §9 | [Visualization rules](12-visualisation-and-animation-rules.md) | `info/visualisation-science.html` PLANNED | Explain inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Hydraulics/reservoir | Product lead |
| BR-CLICK-10 | Click-anywhere inspection shows arrival/peak time and source/cascade attribution or states unavailable. | Approved design §9 | [Rendering pipeline](10-3d-rendering-pipeline.md) | `info/visualisation-science.html` PLANNED | Explain inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Scientific owners | Product lead |
| BR-CLICK-11 | Decision inspection shows evidence, constraints, alternatives and residual risk. | Approved design §9 | [Decision engine](13-decision-engine.md) | `info/scientific-architecture.html` PLANNED | Decision inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | Operations | Decision lead |
| BR-CLICK-12 | Unsupported requested quantities display not computed or planned. | Approved design §9 | [Visualization rules](12-visualisation-and-animation-rules.md) | `info/visualisation-science.html` PLANNED | Explain inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | PLANNED | UX/accessibility | Product lead |
| BR-TRUTH-01 | No fake or random physics; shader, color, opacity, particles and animation cannot create numerical state. | Approved design §§7,9–10 | [Rendering pipeline](10-3d-rendering-pipeline.md) | `info/visualisation-science.html` PLANNED | Negative UI tests PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Scientific/graphics review | Visualization lead |
| BR-DOC-00 | Engineering index and status/traceability entry point. | Approved design §4 | [Engineering index](README.md) | N/A | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | None for document existence | Documentation owner |
| BR-DOC-01 | Scientific architecture document. | Approved design §4 | [ENG-01](01-scientific-architecture.md) | `info/scientific-architecture.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Content remains reviewable | Scientific lead |
| BR-DOC-02 | Simulation architecture document. | Approved design §4 | [ENG-02](02-simulation-architecture.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Content remains reviewable | Engineering lead |
| BR-DOC-03 | Engine contract catalog. | Approved design §4 | [ENG-03](03-engine-contract-catalog.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Content remains reviewable | Engineering lead |
| BR-DOC-04 | Hydrology model document. | Approved design §4 | [ENG-04](04-hydrology-model.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Hydrology review | Hydrology lead |
| BR-DOC-05 | Hydraulic model document. | Approved design §4 | [ENG-05](05-hydraulic-model.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Hydraulic review | Hydraulic lead |
| BR-DOC-06 | Reservoir model document. | Approved design §4 | [ENG-06](06-reservoir-model.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Reservoir/dam-safety review | Reservoir lead |
| BR-DOC-07 | River network model document. | Approved design §4 | [ENG-07](07-river-network-model.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Network review | Network lead |
| BR-DOC-08 | Data pipeline document. | Approved design §4 | [ENG-08](08-data-pipeline.md) | `info/scientific-architecture.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Data review | Data lead |
| BR-DOC-09 | GIS architecture document. | Approved design §4 | [ENG-09](09-gis-architecture.md) | `info/scientific-architecture.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | GIS/survey review | GIS lead |
| BR-DOC-10 | 3D rendering pipeline document. | Approved design §4 | [ENG-10](10-3d-rendering-pipeline.md) | `info/visualisation-science.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Graphics/science review | Visualization lead |
| BR-DOC-11 | LOD and GPU optimisation document. | Approved design §4 | [ENG-11](11-lod-and-gpu-optimisation.md) | `info/visualisation-science.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Performance review | Performance lead |
| BR-DOC-12 | Visualisation and animation rules document. | Approved design §4 | [ENG-12](12-visualisation-and-animation-rules.md) | `info/visualisation-science.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Accessibility/science review | Visualization lead |
| BR-DOC-13 | Decision engine document. | Approved design §4 | [ENG-13](13-decision-engine.md) | `info/simulation-engines.html` PLANNED | Decision package PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Operations/dam safety review | Decision lead |
| BR-DOC-14 | Calibration and validation document. | Approved design §4 | [ENG-14](14-calibration-and-validation.md) | `info/calibration-verification.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Validation review | Validation lead |
| BR-DOC-15 | Verification strategy document. | Approved design §4 | [ENG-15](15-verification-strategy.md) | `info/calibration-verification.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Independent review | Verification lead |
| BR-DOC-16 | Performance targets document. | Approved design §4 | [ENG-16](16-performance-targets.md) | `info/calibration-verification.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Performance/workflow review | Performance lead |
| BR-DOC-17 | Engineering risks and open questions document. | Approved design §4 | [ENG-17](17-engineering-risks-and-open-questions.md) | `info/calibration-verification.html` PLANNED | Risk projection PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Named risk reviewers | Scientific lead |
| BR-DOC-18 | Requirement traceability document. | Approved design §4 | [Engineering index](README.md) | N/A | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Coverage review | Documentation owner |
| BR-FIELD-01 | Purpose and scope. | Approved design §5 | [Engine catalog](03-engine-contract-catalog.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | None for structure | Documentation owner |
| BR-FIELD-02 | Scientific and implementation status. | Approved design §§3,5 | [Engine catalog](03-engine-contract-catalog.md) | `info/simulation-engines.html` PLANNED | Status projection PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Claim owner | Documentation owner |
| BR-FIELD-03 | Inputs. | Approved design §5 | [Engine catalog](03-engine-contract-catalog.md) | `info/simulation-engines.html` PLANNED | Input projection PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Engine owner | Documentation owner |
| BR-FIELD-04 | Outputs. | Approved design §5 | [Engine catalog](03-engine-contract-catalog.md) | `info/simulation-engines.html` PLANNED | Output projection PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Engine owner | Documentation owner |
| BR-FIELD-05 | Dependencies and allowed dependency direction. | Approved design §5 | [Simulation architecture](02-simulation-architecture.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Architecture owner | Documentation owner |
| BR-FIELD-06 | Accepted alternatives and recommended method. | Approved design §§5–6 | [Scientific architecture](01-scientific-architecture.md) | `info/simulation-engines.html` PLANNED | Method view PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Domain owner | Documentation owner |
| BR-FIELD-07 | Governing equations and implementation form. | Approved design §5 | [Engine catalog](03-engine-contract-catalog.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Domain owner | Documentation owner |
| BR-FIELD-08 | Variables, units, parameters and bounds. | Approved design §5 | [Scientific architecture](01-scientific-architecture.md) | `info/simulation-engines.html` PLANNED | Quantity inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Domain owner | Documentation owner |
| BR-FIELD-09 | Data structures and serialization. | Approved design §5 | [Simulation architecture](02-simulation-architecture.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Engineering owner | Documentation owner |
| BR-FIELD-10 | Update cadence and triggering events. | Approved design §5 | [Simulation architecture](02-simulation-architecture.md) | `info/simulation-engines.html` PLANNED | Freshness view PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Operations owner | Documentation owner |
| BR-FIELD-11 | Spatial and temporal resolution. | Approved design §5 | [Scientific architecture](01-scientific-architecture.md) | `info/simulation-engines.html` PLANNED | Resolution view PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Domain owner | Documentation owner |
| BR-FIELD-12 | Complexity and resource use. | Approved design §5 | [Performance targets](16-performance-targets.md) | `info/calibration-verification.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Performance owner | Documentation owner |
| BR-FIELD-13 | Initialization, warm-up and boundary conditions. | Approved design §5 | [Simulation architecture](02-simulation-architecture.md) | `info/simulation-engines.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Domain owner | Documentation owner |
| BR-FIELD-14 | Calibration method and observations. | Approved design §5 | [Calibration and validation](14-calibration-and-validation.md) | `info/calibration-verification.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Validation owner | Documentation owner |
| BR-FIELD-15 | Validation metrics, datasets and acceptance thresholds. | Approved design §5 | [Calibration and validation](14-calibration-and-validation.md) | `info/calibration-verification.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Validation owner | Documentation owner |
| BR-FIELD-16 | Verification tests and invariants. | Approved design §5 | [Verification strategy](15-verification-strategy.md) | `info/calibration-verification.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Verification owner | Documentation owner |
| BR-FIELD-17 | Visualization derived from measurable state. | Approved design §§5,10 | [Visualization rules](12-visualisation-and-animation-rules.md) | `info/visualisation-science.html` PLANNED | Explain inspector PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Scientific/UX review | Documentation owner |
| BR-FIELD-18 | Assumptions and limitations. | Approved design §5 | [Scientific architecture](01-scientific-architecture.md) | `info/scientific-architecture.html` PLANNED | Limitations view PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Domain owner | Documentation owner |
| BR-FIELD-19 | Failure detection, degraded behavior and recovery. | Approved design §§5,11 | [Simulation architecture](02-simulation-architecture.md) | `info/scientific-architecture.html` PLANNED | Failure view PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Operations owner | Documentation owner |
| BR-FIELD-20 | Future extensions and scientific prerequisites. | Approved design §5 | [Scientific architecture](01-scientific-architecture.md) | `info/scientific-architecture.html` PLANNED | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Domain owner | Documentation owner |
| BR-FIELD-21 | Implementation evidence and traceability. | Approved design §§5,12 | [Engineering index](README.md) | `info/calibration-verification.html` PLANNED | Evidence links PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | Evidence owner | Documentation owner |
| BR-FIELD-22 | Next. | Document conventions §4 | [Document conventions](../99-appendix/document-conventions.md) | N/A | N/A | [Verifier](../../tests/docs-engineering-verify.mjs) | IMPLEMENTED | None for structure | Documentation owner |
| BR-CRED-01 | Cross-reference existing authorities instead of duplicating normative facts. | Approved design §§2,5 | [Document conventions](../99-appendix/document-conventions.md) | Public pages cite canonical IDs PLANNED | App cites canonical/public pages PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Documentation/domain owners | Documentation owner |
| BR-CRED-02 | Reject assumptions, parameters or resolutions chosen merely to make visuals attractive. | Approved design §6 | [Scientific architecture](01-scientific-architecture.md) | `info/visualisation-science.html` PLANNED | Negative UI behavior PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REFERENCE MODEL | Scientific/UX review | Scientific lead |
| BR-CRED-03 | A production credibility claim requires implementation, calibration, independent validation, verification, evidence and domain approval. | Approved design §§3,12–13 | [Calibration and validation](14-calibration-and-validation.md) | `info/calibration-verification.html` PLANNED | Claim gate PLANNED | [Verifier](../../tests/docs-engineering-verify.mjs) | REQUIRES DOMAIN REVIEW | Independent domain/operational/legal review | Scientific lead |

## Next

Return to the [Engineering Handbook](README.md) and follow later public/application projection tasks without changing canonical authority.
