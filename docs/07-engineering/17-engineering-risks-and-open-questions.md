# Engineering Risks and Open Questions

| Field | Value |
|---|---|
| Document ID | ENG-17 |
| Owner | Scientific engineering lead |
| Status | REQUIRES DOMAIN REVIEW |
| Current demo | Known scientific, data, numerical, operational, legal, UX and performance gaps block production claims |
| Production target | Evidence-linked risk disposition with named reviewer, blocker, required proof and claim impact |
| Domain review | All named scientific and operational disciplines plus legal/data governance |
| Authoritative dependencies | [Open risk register](../06-critique/02-open-risk-register.md), [red-team review](../06-critique/01-red-team-review.md), [basin model](../01-domain-model/02-basin-vgtb.md), [engineering models](04-hydrology-model.md) |

## Purpose and scope

Project existing `R-xx` risks into engineering claim gates and expose additional concrete questions. This is not a duplicate risk register: [the canonical register](../06-critique/02-open-risk-register.md) owns severity and mitigation; this document owns engineering evidence and production-claim impact.

## Scientific and implementation status

Risk identification is `IMPLEMENTED` documentation; closure is mostly `PLANNED` or `REQUIRES DOMAIN REVIEW`. No open item may be converted to an assumption solely to unblock a production statement.

## Inputs

Canonical risks, model/data contracts, code/config, run and validation artifacts, operating procedures, legal sources, user research, benchmarks, incident/exercise findings and reviewer dispositions.

## Outputs

An evidence queue by scientific, data, numerical, operational, legal, UX and performance category: blocker/question, related `R-xx`, reviewer discipline, required evidence, owner and exact production claim suppressed until closure.

## Dependencies and allowed dependency direction

The canonical risk register supplies IDs; engineering documents supply evidence requirements; traceability records claim impact. Risk disposition may block publication, validation or operation, but cannot rewrite physical outputs or evidence.

## Accepted alternatives and recommended method

Use risk acceptance, mitigation, transfer or avoidance only under named authority. Recommend fail-closed claim gating: retain the open question, commission evidence, obtain independent discipline review, then update both canonical risk and engineering disposition.

## Governing equations and implementation form

Scientific questions cite their governing authority rather than inventing replacements: ARF and Kirpich in [hydrology](../00-foundations/02-hydrology.md), CFL and branching/diversion in [hydraulics/routing](../00-foundations/03-hydraulics-and-routing.md), reservoir constraints in [reservoir operations](../00-foundations/04-reservoir-operations.md).

## Variables, units, parameters and bounds

Every quantitative blocker states quantity/unit/datum/support and whether unknown, assumed or measured. Thresholds, gate geometry, split fractions, error shares, benchmark limits and notification lead cannot receive unsourced values.

## Data structures and serialization

`EngineeringRiskProjection` records canonical risk ID, category, blocker, affected contract/claim, owner, reviewer discipline, required evidence, status, decision date, disposition and artifact links.

## Update cadence and triggering events

Review on model/data/config/legal/workflow changes, failed verification/validation, exercises/incidents and before any production/public claim. A changed disposition preserves prior history and rationale.

## Spatial and temporal resolution

Risks identify affected basin branch, reach, reservoir, gauge, zone, forecast horizon, timestep or device profile. A local evidence result cannot close a basin-wide or all-regime claim without transferability evidence.

## Complexity and resource use

Evidence cost is estimated separately from software effort: survey/bathymetry, telemetry agreements, calibration campaigns, compute, operational exercises and legal review may dominate. Missing cost estimates do not imply low risk.

## Initialization, warm-up and boundary conditions

Risk review starts from the current immutable baseline and intended-use statement. A production claim is blocked when boundary conditions, antecedent state, datum, operating constraints or authority are missing.

## Calibration method and observations

Calibration-related risks include dataset coverage, leakage, non-identifiability and parameter transfer. Required evidence is a governed registry, split manifest, sensitivity/identifiability result and independent validation; visual fit is never closure.

## Validation metrics, datasets and acceptance thresholds

Closure criteria name evidence and approval, not merely a metric. Metric thresholds and benchmark rationale require source and intended-use consequence. Internal consistency, conservation or synthetic-case success is verification, not physical validation.

## Verification tests and invariants

Test that every projected risk has a canonical ID or explicit new-question label, owner, reviewer, evidence requirement and claim impact; open blockers remain visible in traceability. Negative tests reject unsupported `IMPLEMENTED`, “CFL-safe”, “validated”, “50-member” and statutory claims.

## Visualization derived from measurable state

Risk badges and warnings render stored disposition, not inferred severity from colors or model outputs. Unknown/blocked items remain visible across desktop/mobile; decorative severity must not change workflow authority.

## Assumptions and limitations

The register is incomplete by nature and does not replace qualified review. Reviewer discipline must match the claim; software approval cannot close hydrology, dam-safety or legal questions. Absence of a recorded risk is not evidence of safety.

## Failure detection, degraded behavior and recovery

Detect orphan risks, expired evidence, missing owners/reviewers, contradictions and claims whose blocker remains open. Suppress affected production wording/function and show the required evidence. Recovery requires artifact review and explicit disposition, not a comment deletion.

## Future extensions and scientific prerequisites

Automated claim gates, evidence expiry, cross-repository publication checks and quantitative risk models require stable identifiers, governed artifacts and authority-approved workflows.

## Implementation evidence and traceability

Priority is ordered by production-claim impact and dependency breadth. `OPEN — BLOCKS CLAIM` is the current disposition; closing a row requires the named evidence and reviewer discipline.

| Rank | Engineering ID | Severity | Category | Existing risk or new question | Blocker/open question | Owner | Reviewer discipline | Status/disposition | Required evidence | Production-claim impact | Next action |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ENG-RISK-001 | Critical | Validation | [R-01](../06-critique/02-open-risk-register.md) | Internal consistency, conservation and synthetic-case success are not physical validation. | Scientific validation lead | Independent hydrology, hydraulics and operations reviewers | OPEN — BLOCKS CLAIM | Held-out real observations, approved thresholds, complete validation report and signed disposition | Blocks “validated”, “operational” and “decision-grade” claims | Establish dataset registry and independent event/spatial/temporal split |
| 2 | ENG-RISK-002 | Critical | Data | NEW-Q-01 | Horizontal/vertical datum, terrain accuracy and channel bathymetry are not established for decision-grade stage/depth/extent. | GIS/data lead | Survey, GIS and hydraulic reviewers | OPEN — BLOCKS CLAIM | Survey/source metadata, transformations, uncertainty, bathymetry and mesh lineage | Blocks decision-grade elevation, depth, conveyance and extent claims | Commission source/datum inventory and survey-gap assessment |
| 3 | ENG-RISK-003 | Critical | Operational | NEW-Q-02 | Gate geometry, rating curves, capacities, ramp limits and interlocks are unverified. | Reservoir engineering lead | Reservoir operator and dam-safety reviewer | OPEN — BLOCKS CLAIM | Approved curves/constraints, telemetry lineage and operating tests | Blocks feasible or safe release recommendation | Obtain owner-approved structure and operating records |
| 4 | ENG-RISK-004 | High | Scientific/operational | [R-05](../06-critique/02-open-risk-register.md) | Dak Mi 4 diversion semantics and transfer capacity are not active/validated across both rivers. | River-network lead | Reservoir operator, hydrologist and hydraulic reviewer | OPEN — BLOCKS CLAIM | Operating records, topology, transfer capacity and both-river hindcast | Blocks single-river consequence and proposal claims | Define diversion contract and validate Vu Gia/Thu Bon propagation |
| 5 | ENG-RISK-005 | High | Scientific | [R-04](../06-critique/02-open-risk-register.md) | Quang Hue stage-dependent split and morphological drift are unresolved. | River-network lead | Hydrologist and hydraulic reviewer | OPEN — BLOCKS CLAIM | Surveyed topology, paired flows/stages, split function and uncertainty validation | Blocks Ai Nghia forecast and branch-attribution claims | Collect/locate paired evidence and compare split formulations |
| 6 | ENG-RISK-006 | High | Numerical | NEW-Q-03 | Configured substep cap is described in code but lacks computed local CFL proof. | Hydraulic engineering lead | Independent numerical-method reviewer | OPEN — BLOCKS CLAIM | Per-cell/reach wave-speed CFL logs, stability cases and mesh/timestep refinement | Blocks numerical-stability and convergence claims | Instrument local CFL and execute refinement matrix |
| 7 | ENG-RISK-007 | High | Scientific/numerical | NEW-Q-04 | Diagnostic/apparent velocity is not validated physical velocity or momentum. | Hydraulic engineering lead | Hydraulic and independent validation reviewers | OPEN — BLOCKS CLAIM | Momentum-capable solver evidence, analytical benchmarks, observations and convergence | Blocks velocity, hazard-rating and flow-direction claims | Relabel current diagnostic output and define validation acquisition plan |
| 8 | ENG-RISK-008 | High | Legal/operational | NEW-Q-05 | Statutory notification lead, issuing authority and acknowledgement workflow are not verified against current primary instruments. | Operations lead | Legal and emergency-management reviewers | OPEN — BLOCKS CLAIM | Current primary instruments, approved procedure, authority/RACI and exercise evidence | Blocks compliant notification, order and warning claims | Commission current legal/procedure review; keep app advisory |
| 9 | ENG-RISK-009 | High | Scientific | NEW-Q-06 | ARF convention may conflict across point, gridded and catchment-mean rainfall and could be applied twice. | Hydrology lead | Hydrologist and meteorologist | OPEN — BLOCKS CLAIM | Forcing-to-catchment derivation, source convention, unit tests and sensitivity | Blocks calibrated rainfall-runoff claim | Select/version one ARF convention and add double-application test |
| 10 | ENG-RISK-010 | Medium–High | Scientific | NEW-Q-07 | Kirpich empirical timing may be outside its catchment/channel domain and transferable timing is unproven. | Hydrology lead | Independent hydrologist | OPEN — BLOCKS CLAIM | Catchment descriptors, local timing observations, alternative comparison and sensitivity | Blocks travel-time and peak-timing accuracy claims | Define applicability screen and compare against observed events |
| 11 | ENG-RISK-011 | Medium–High | Scientific | NEW-Q-08 | Meteorological error components/shares are not locally quantified. | Meteorology lead | Independent meteorologist and validation reviewer | OPEN — BLOCKS CLAIM | Hindcast ensemble decomposition, reliability/calibration and event stratification | Blocks calibrated confidence attribution | Define hindcast registry and error-decomposition protocol |
| 12 | ENG-RISK-012 | Medium | Performance | NEW-Q-09 | Browser/solver benchmark profiles and target rationale are not yet representative or measured. | Performance engineering lead | Performance and scientific-fidelity reviewers | OPEN — BLOCKS CLAIM | Declared workloads/environments, raw percentile results and output-equivalence checks | Blocks production latency, capacity, memory and FPS claims | Execute ENG-16 target-register benchmark profiles |
| 13 | ENG-RISK-013 | Medium | Performance/scientific | NEW-Q-10 | “50 members” describes simulated spread, not evidence of 50 explicit model-member runs. | Scenario engineering lead | Meteorologist and performance reviewer | OPEN — WORDING CORRECTION REQUIRED | Fifty immutable member manifests with distinct forcing/run IDs, or corrected wording | Blocks explicit 50-member ensemble claim | Preserve simulated-spread label until run-manifest evidence exists |

## Next

Audit every brief requirement in [Requirement Traceability](18-requirement-traceability.md).
