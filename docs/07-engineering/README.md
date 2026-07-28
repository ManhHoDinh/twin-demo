# Engineering Handbook

| Field | Value |
|---|---|
| Document ID | ENG-INDEX |
| Owner | Scientific engineering lead |
| Status | IMPLEMENTED |
| Current demo | Complete cross-referenced engineering handbook for the deterministic browser twin; implemented demo behavior remains synthetic and non-operational unless explicitly evidenced otherwise |
| Production target | Reviewed, calibrated, validated, versioned scientific digital twin |
| Domain review | Hydrology, hydraulics, reservoir, meteorology, GIS, dam safety, emergency management |
| Authoritative dependencies | [Foundations](../00-foundations/01-glossary.md), [domain model](../01-domain-model/01-entity-model.md), [decision support](../04-decision-support/01-decision-engine-spec.md), [demo evidence](../../DATA_AND_METHODS.md) |

This index is the control surface for engineering documentation. `IMPLEMENTED` means code or observable evidence exists; it does **not** mean operational validity, calibration, legal approval, production readiness, or fitness for a real warning or reservoir decision.

## Document precedence

When statements conflict, use this order:

1. Scientific facts and equations: [00 Foundations](../00-foundations/01-glossary.md).
2. Entities, observations, quality and provenance: [01 Domain model](../01-domain-model/01-entity-model.md).
3. Decisions, uncertainty and scenarios: [04 Decision support](../04-decision-support/01-decision-engine-spec.md).
4. Current-demo claims: [DATA_AND_METHODS](../../DATA_AND_METHODS.md), code/tests, and [demo gap analysis](../99-appendix/demo-gap-analysis.md).
5. Engineering boundaries and contracts: this section. It links to higher authorities rather than redefining them.

The [approved documentation design](../superpowers/specs/2026-07-27-scientific-digital-twin-documentation-design.md) controls the documentation shape. Legal thresholds and interpretations remain `REQUIRES DOMAIN REVIEW` until checked against authoritative instruments.

## Status and provenance

| Vocabulary | Meaning |
|---|---|
| `IMPLEMENTED` | Present in code or observable evidence; no claim of operational validity |
| `PLANNED` | Approved target not yet implemented |
| `REFERENCE MODEL` | Accepted engineering approach recommended for evaluation or production |
| `REQUIRES DOMAIN REVIEW` | Requires a qualified discipline owner before use or claim |
| `MEASURED` | Direct observation with source, time, quality and datum |
| `FORECAST` | Issued forecast with issue time, valid time and version |
| `MODELLED` | Computed by a named, versioned model |
| `ASSUMED` | Explicit non-observed input or parameter |
| `SYNTHETIC` | Constructed demonstration or test data, unsuitable as operational evidence |

## Document graph

```text
foundations + domain model + decision support
                  |
                  v
01 scientific architecture
                  |
                  v
02 simulation architecture --> 03 engine contracts
                  |                    |
                  +----> 04..13 models/pipelines
                               |
                               v
                       14..18 assurance/control
                              |
                              v
                       19 feasibility path
```

No engineering page may reverse this authority direction. Rendering and interaction are downstream projections of normalized state.

## Audience reading paths

| Audience | Path |
|---|---|
| Hydrologist or hydraulic engineer | [Scientific architecture](01-scientific-architecture.md) -> [Simulation architecture](02-simulation-architecture.md) -> [Engine contracts](03-engine-contract-catalog.md) -> `04-hydrology-model.md` / `05-hydraulic-model.md` |
| Reservoir or dam-safety reviewer | [Scientific architecture](01-scientific-architecture.md) -> [Engine contracts](03-engine-contract-catalog.md#reservoir-engine) -> `06-reservoir-model.md` -> `13-decision-engine.md` |
| Software or data engineer | [Simulation architecture](02-simulation-architecture.md) -> [Engine contracts](03-engine-contract-catalog.md) -> `08-data-pipeline.md` / `09-gis-architecture.md` |
| Product, UX or visualization engineer | [Scientific architecture](01-scientific-architecture.md#separation-of-state-and-projection) -> [Visualization contract](03-engine-contract-catalog.md#visualization-engine) -> `10-3d-rendering-pipeline.md` / `12-visualisation-and-animation-rules.md` |
| Assurance reviewer | `14-calibration-and-validation.md` -> `15-verification-strategy.md` -> `17-engineering-risks-and-open-questions.md` -> `18-requirement-traceability.md` |
| Programme sponsor or survey/data owner | [Engineering risks](17-engineering-risks-and-open-questions.md) -> [Survey-grade feasibility](19-survey-grade-twin-feasibility.md) -> [Calibration and validation](14-calibration-and-validation.md) |

Every document is linked below so the verifier can prove the handbook has no orphaned engineering page.

## Twelve-engine map

| Layer | Engines | State authority |
|---|---|---|
| Inputs and geometry | Terrain, Weather, River Network | Versioned forcing and spatial support |
| Scientific computation | Hydrology, Reservoir, Hydraulic, Flood Propagation | Independent, unit-checked physical or derived state |
| Integration | Digital Twin, Scenario | Run identity, time, lineage and alternatives |
| Advisory | Decision Support, AI Explanation | Human-reviewed options and bounded explanation |
| Projection | Visualization | Read-only GPU and interaction state |

See the [allowed dependency edges](03-engine-contract-catalog.md#allowed-dependency-edges) and [simulation DAG](02-simulation-architecture.md#engine-dependency-dag).

## Completeness dashboard

| Doc | Subject | Status |
|---|---|---|
| [01](01-scientific-architecture.md) | Scientific architecture | `REFERENCE MODEL` |
| [02](02-simulation-architecture.md) | Simulation architecture | `REFERENCE MODEL` |
| [03](03-engine-contract-catalog.md) | Twelve-engine contract catalog | `REFERENCE MODEL` |
| [04](04-hydrology-model.md) | Hydrology model | `REFERENCE MODEL` |
| [05](05-hydraulic-model.md) | Hydraulic model | `REFERENCE MODEL` |
| [06](06-reservoir-model.md) | Reservoir model | `REQUIRES DOMAIN REVIEW` |
| [07](07-river-network-model.md) | River network model | `REQUIRES DOMAIN REVIEW` |
| [08](08-data-pipeline.md) | Data pipeline | `REFERENCE MODEL` |
| [09](09-gis-architecture.md) | GIS architecture | `REFERENCE MODEL` |
| [10](10-3d-rendering-pipeline.md) | 3D rendering pipeline | `REFERENCE MODEL` |
| [11](11-lod-and-gpu-optimisation.md) | LOD and GPU optimisation | `PLANNED` |
| [12](12-visualisation-and-animation-rules.md) | Visualization and animation rules | `REQUIRES DOMAIN REVIEW` |
| [13](13-decision-engine.md) | Decision engine | `REFERENCE MODEL` |
| [14](14-calibration-and-validation.md) | Calibration and validation | `REFERENCE MODEL` |
| [15](15-verification-strategy.md) | Verification strategy | `REFERENCE MODEL` |
| [16](16-performance-targets.md) | Performance targets | `PLANNED` |
| [17](17-engineering-risks-and-open-questions.md) | Risks and open questions | `REQUIRES DOMAIN REVIEW` |
| [18](18-requirement-traceability.md) | Requirement traceability | `IMPLEMENTED` |
| [19](19-survey-grade-twin-feasibility.md) | Survey-grade feasibility and phased implementation path | `REFERENCE MODEL` |

## Next

Continue with [Scientific architecture](01-scientific-architecture.md), [Simulation architecture](02-simulation-architecture.md), the [Engine contract catalog](03-engine-contract-catalog.md), or the [survey-grade implementation path](19-survey-grade-twin-feasibility.md).
