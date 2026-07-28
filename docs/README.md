# FloodTwin — Product Knowledge Base

**A flood decision-support product for reservoir-controlled river basins.**
Reference implementation basin: **Vu Gia – Thu Bồn (VGTB)**, Đà Nẵng / Quảng Nam, Việt Nam.

This workspace is the single source of truth for *what the product knows*, *what it models*, *who uses it*, *what it decides*, and *what it must never claim*. It is written to be read by hydrologists and engineers first, product and UX second, and implementers third.

---

## 0. Status and scope

| Item | Value |
|---|---|
| Document set version | 1.0 |
| Date | 2026-07-27 |
| Scope | Domain knowledge, world model, personas, workflows, decision logic, simulation, UI specification, PRD, critique |
| Explicitly out of scope | Backend implementation, code, infrastructure, procurement |
| Product maturity assumed | Demo → **Operational Decision Support (advisory, human-in-the-loop)** |
| Regulatory posture | **Advisory tool.** Never an authority of record. See [regulatory-vietnam](00-foundations/08-regulatory-vietnam.md) and [decision-rights](02-stakeholders/02-decision-rights-raci.md). |

> **The single most important product constraint in this entire knowledge base:**
> FloodTwin **proposes**; a licensed human operator **disposes**. Every number the product shows is an estimate with a stated uncertainty and a stated provenance. The product never issues a legally binding release order, never issues a public warning autonomously, and never overwrites the official inter-reservoir operating procedure. Everything else in this workspace is downstream of that sentence.

---

## 1. How to read this

**If you have 20 minutes and you are a hydropower / water-resources engineer:**
[Reservoir operations](00-foundations/04-reservoir-operations.md) → [Decision engine](04-decision-support/01-decision-engine-spec.md) → [Red-team critique](06-critique/01-red-team-review.md).

**If you are a product manager or investor:**
[Product strategy](05-product/01-product-strategy.md) → [Screen catalog](05-product/02-screen-catalog.md) → [PRD](05-product/03-prd.md) → [Open risks](06-critique/02-open-risk-register.md).

**If you are an emergency manager or provincial officer:**
[Personas](02-stakeholders/01-personas.md) → [Workflow catalog](03-operations/01-workflow-catalog.md) → [Communication protocols](03-operations/03-communication-protocols.md).

**If you are an engineer about to build it:**
[Entity model](01-domain-model/01-entity-model.md) → [Observation model](01-domain-model/03-observation-model.md) → [Engineering handbook](07-engineering/README.md) → [Decision engine](04-decision-support/01-decision-engine-spec.md) → [NFRs](05-product/05-non-functional-requirements.md) → [Demo gap analysis](99-appendix/demo-gap-analysis.md).

---

## 2. Document map

### 00 — Foundations (domain expertise)
| Doc | Contains |
|---|---|
| [01-glossary.md](00-foundations/01-glossary.md) | Bilingual VI/EN terminology, units, symbol conventions |
| [02-hydrology.md](00-foundations/02-hydrology.md) | Catchments, rainfall-runoff, unit hydrographs, antecedent conditions |
| [03-hydraulics-and-routing.md](00-foundations/03-hydraulics-and-routing.md) | Open-channel flow, flood routing, travel time, backwater, tides |
| [04-reservoir-operations.md](00-foundations/04-reservoir-operations.md) | Rule curves, pre-release, gate ops, cascade coordination, MPC |
| [05-dam-safety.md](00-foundations/05-dam-safety.md) | Failure modes, spillway capacity, surveillance, EAP |
| [06-meteorology-and-forecasting.md](00-foundations/06-meteorology-and-forecasting.md) | QPF, ensembles, AI weather models, radar/satellite, skill metrics |
| [07-warning-and-emergency-management.md](00-foundations/07-warning-and-emergency-management.md) | Lead time, warning chains, evacuation, CAP, human response |
| [08-regulatory-vietnam.md](00-foundations/08-regulatory-vietnam.md) | Legal framework, BĐ alert levels, mandated roles, liability |
| [09-typical-values.md](00-foundations/09-typical-values.md) | Reference tables: magnitudes, ranges, plausibility bounds |
| [10-failure-library.md](00-foundations/10-failure-library.md) | Historical disasters, recurring operational mistakes, anti-patterns |

### 01 — Domain model (the world the product represents)
| Doc | Contains |
|---|---|
| [01-entity-model.md](01-domain-model/01-entity-model.md) | All 25+ entities, attributes, relationships, invariants |
| [02-basin-vgtb.md](01-domain-model/02-basin-vgtb.md) | The concrete reference basin instance |
| [03-observation-model.md](01-domain-model/03-observation-model.md) | Sensors, telemetry, quality flags, gap handling |
| [04-exposure-and-impact-model.md](01-domain-model/04-exposure-and-impact-model.md) | Population, buildings, roads, lifelines, damage functions |

### 02 — Stakeholders
| Doc | Contains |
|---|---|
| [01-personas.md](02-stakeholders/01-personas.md) | 10 detailed personas + jobs-to-be-done |
| [02-decision-rights-raci.md](02-stakeholders/02-decision-rights-raci.md) | Who decides what, escalation ladder, RACI |

### 03 — Operations
| Doc | Contains |
|---|---|
| [01-workflow-catalog.md](03-operations/01-workflow-catalog.md) | 12 operational workflows, step by step |
| [02-decision-trees.md](03-operations/02-decision-trees.md) | Formal decision trees and thresholds |
| [03-communication-protocols.md](03-operations/03-communication-protocols.md) | Notification matrix, message templates, acknowledgement |
| [04-workflow-specifications.md](03-operations/04-workflow-specifications.md) | Implementation-ready spec of the ten end-to-end workflows: full schema per workflow, decision-lifecycle classes, map-executable, seven-perspective review |

### 04 — Decision support & simulation
| Doc | Contains |
|---|---|
| [01-decision-engine-spec.md](04-decision-support/01-decision-engine-spec.md) | The 15 estimates, method, inputs, error bounds |
| [02-uncertainty-and-confidence.md](04-decision-support/02-uncertainty-and-confidence.md) | Ensembles, confidence grading, honest failure |
| [03-simulation-and-scenarios.md](04-decision-support/03-simulation-and-scenarios.md) | Replay, forecast, what-if, training mode |

### 05 — Product
| Doc | Contains |
|---|---|
| [01-product-strategy.md](05-product/01-product-strategy.md) | Problem, value, positioning, segments, pricing shape |
| [02-screen-catalog.md](05-product/02-screen-catalog.md) | Every screen: purpose, layout, states, controls |
| [03-prd.md](05-product/03-prd.md) | Feature-by-feature PRD with acceptance criteria |
| [04-ux-principles.md](05-product/04-ux-principles.md) | Control-room UX law, color, alarm design, accessibility |
| [05-non-functional-requirements.md](05-product/05-non-functional-requirements.md) | Availability, latency, degradation, security, audit |
| [06-kpis.md](05-product/06-kpis.md) | Product, operational and outcome KPIs |

### 06 — Critique
| Doc | Contains |
|---|---|
| [01-red-team-review.md](06-critique/01-red-team-review.md) | 8-role adversarial review, 3 rounds, what got cut |
| [02-open-risk-register.md](06-critique/02-open-risk-register.md) | Surviving risks with owners and mitigations |
| [03-roadmap.md](06-critique/03-roadmap.md) | Maturity ladder M0→M4 with exit gates |

### 07 — Engineering
| Doc | Contains |
|---|---|
| [README.md](07-engineering/README.md) | Engineering precedence, status/provenance rules, reading paths and completeness dashboard |
| [01-scientific-architecture.md](07-engineering/01-scientific-architecture.md) | One-way scientific state flow, evidence hierarchy, model selection and production claim gates |
| [02-simulation-architecture.md](07-engineering/02-simulation-architecture.md) | Twelve-engine DAG, clocks, coupling, replay, checkpoints and failure isolation |
| [03-engine-contract-catalog.md](07-engineering/03-engine-contract-catalog.md) | Uniform contracts and dependency matrix for all twelve engines |
| [04-hydrology-model.md](07-engineering/04-hydrology-model.md) | Rainfall-runoff alternatives, production recommendation, calibration and verification contract |
| [05-hydraulic-model.md](07-engineering/05-hydraulic-model.md) | Routing and 1D/2D hydraulic alternatives, numerics, wet/dry behavior and validation contract |
| [06-reservoir-model.md](07-engineering/06-reservoir-model.md) | Storage, structures, gate constraints, operating authority and cascade exchanges |
| [07-river-network-model.md](07-engineering/07-river-network-model.md) | Directed reaches, junctions, diversions, routing and release propagation |
| [08-data-pipeline.md](07-engineering/08-data-pipeline.md) | Source registry, QC, normalization, lineage, versioning and degraded behavior |
| [09-gis-architecture.md](07-engineering/09-gis-architecture.md) | CRS/datum control, terrain, bathymetry, spatial assets, indexes and mesh products |
| [10-3d-rendering-pipeline.md](07-engineering/10-3d-rendering-pipeline.md) | Typed physical-state-to-GPU projection and honest missing-value behavior |
| [11-lod-and-gpu-optimisation.md](07-engineering/11-lod-and-gpu-optimisation.md) | LOD, streaming, resource budgets and scientific-fidelity invariants |
| [12-visualisation-and-animation-rules.md](07-engineering/12-visualisation-and-animation-rules.md) | Measurable visual mappings, accessibility and non-physical cue restrictions |
| [13-decision-engine.md](07-engineering/13-decision-engine.md) | Feasible alternatives, uncertainty, human authority, AI boundaries and decision records |
| [14-calibration-and-validation.md](07-engineering/14-calibration-and-validation.md) | Calibration data, split-sample validation, metrics, thresholds and review gates |
| [15-verification-strategy.md](07-engineering/15-verification-strategy.md) | Unit, equation, conservation, convergence, integration, UI and independent-review proof |
| [16-performance-targets.md](07-engineering/16-performance-targets.md) | Measurable cadence, latency, capacity, rendering and safe-degradation targets |
| [17-engineering-risks-and-open-questions.md](07-engineering/17-engineering-risks-and-open-questions.md) | Ranked claim blockers, evidence needs, owners and domain-review dependencies |
| [18-requirement-traceability.md](07-engineering/18-requirement-traceability.md) | Atomic brief-to-document/public/app/evidence status ledger |
| [19-survey-grade-twin-feasibility.md](07-engineering/19-survey-grade-twin-feasibility.md) | Survey-grade data and solver feasibility, evidence boundaries and phased implementation path |

Foundational equations and scientific facts remain authoritative in [00 — Foundations](#00-foundations-domain-expertise). Engineering documents define implementation boundaries and evidence obligations; they do not replace foundation authority.

### 99 — Appendix
| Doc | Contains |
|---|---|
| [demo-gap-analysis.md](99-appendix/demo-gap-analysis.md) | Current `FloodTwin_Q1_Demo` vs this specification |
| [document-conventions.md](99-appendix/document-conventions.md) | Writing rules, ID schemes, review process |
| [scientific-platform-source-brief.md](99-appendix/scientific-platform-source-brief.md) | Durable normalization of the user-provided scientific-platform scope and its extra coverage obligations |

---

## 3. Conventions used everywhere

| Convention | Rule |
|---|---|
| **Units** | SI. Flow `m³/s`, stage `m` (above local datum, stated), storage `10⁶ m³` (Mm³), rainfall `mm` and `mm/h`, area `km²`, depth `m`. Never mix. |
| **Time** | `T` = forecast issue time (now). `T−n` past, `T+n` lead time in hours, ICT (UTC+7). Model times internally UTC. |
| **Datum** | Reservoir levels in **m a.s.l.**; river gauge stages in **m above station zero** — these are *different scales* and must never be plotted on a shared axis. |
| **Provenance tag** | Every displayed quantity carries one of: `MEASURED` · `FORECAST` · `MODELLED` · `ASSUMED` · `SYNTHETIC`. |
| **Confidence** | Every forecast carries `HIGH / MEDIUM / LOW / UNUSABLE` per [02-uncertainty](04-decision-support/02-uncertainty-and-confidence.md). |
| **IDs** | Requirements `FR-nn`, non-functional `NFR-nn`, risks `R-nn`, workflows `WF-nn`, screens `S-nn`, entities `E-nn`, decisions `D-nn`. |
| **Citations** | Legal instruments cited by number and date. Anything not verified against the primary text is marked `⚠ VERIFY`. **No invented citations.** |
| **Language** | English body, Vietnamese operational terms preserved (`Báo động 3`, `xả lũ`, `quy trình vận hành liên hồ`) because those are the words used in the room. |

---

## 4. Knowledge hygiene rules

1. **No duplicated knowledge.** A fact lives in exactly one document. Everything else links to it. If you find yourself restating a formula, link instead.
2. **Every number has a source.** Typical values live in [09-typical-values](00-foundations/09-typical-values.md) and are labelled *indicative* unless traced to a primary source.
3. **Synthetic is labelled synthetic.** The reference demo uses synthetic hydrology. Any figure derived from it is `SYNTHETIC` and may not be used to justify a real operating decision.
4. **The failure library is not decoration.** Every design decision that contradicts [10-failure-library](00-foundations/10-failure-library.md) must be justified in writing.
5. **Critique is a phase, not a mood.** Round-by-round outcomes are recorded in [06-critique](06-critique/01-red-team-review.md), including the features that were *deleted* for being unrealistic.
