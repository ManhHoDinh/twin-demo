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

Priority open questions are:

| Category | Blocker and canonical link | Reviewer discipline | Required evidence | Production-claim impact |
|---|---|---|---|---|
| Scientific | ARF convention conflict/double application; [R-01/R-02 context](../06-critique/02-open-risk-register.md) | Hydrologist/meteorologist | Forcing-to-catchment derivation, convention and sensitivity | Blocks calibrated rainfall-runoff claim |
| Scientific | Kirpich empirical domain and transferability | Hydrologist | Catchment descriptors, local timing observations and alternative comparison | Blocks travel-time accuracy claim |
| Scientific | Quang Hue stage-dependent split; [R-04](../06-critique/02-open-risk-register.md) | Hydrologist/hydraulic engineer | Surveyed topology, paired flows/stages and calibrated split uncertainty | Blocks Ai Nghia and branch attribution claims |
| Operational/scientific | Dak Mi 4 diversion semantics; [R-05](../06-critique/02-open-risk-register.md) | Reservoir operator/hydrologist | Operating records, topology, transfer capacity and both-river validation | Blocks single-river consequence/proposal claim |
| Data | Vertical datum, terrain and channel bathymetry | Survey/GIS/hydraulic reviewer | Survey metadata, transformations, uncertainty and mesh lineage | Blocks decision-grade stage/depth/extent claim |
| Numerical | Diagnostic/apparent velocity is not validated physical velocity | Hydraulic/numerical reviewer | Momentum solver, observations/benchmarks and convergence | Blocks velocity/hazard/flow-direction claim |
| Numerical | Configured substep cap lacks computed CFL proof | Numerical reviewer | Per-cell/reach CFL logs and refinement cases | Blocks stability/convergence claim |
| Operational | Gate geometry, capacities, ramp and interlocks are unverified | Reservoir/dam-safety reviewer | Approved curves, constraints, telemetry and operating tests | Blocks feasible release recommendation |
| Legal/operational | Statutory notification timing and authority | Legal/emergency-management reviewer | Current primary instruments and approved procedure | Blocks compliant notification/order claim |
| Scientific | Meteorological error shares/components are not locally quantified | Meteorologist | Hindcast ensemble decomposition and reliability study | Blocks calibrated confidence attribution |
| Performance | Browser/solver benchmark rationale and representativeness | Performance/scientific reviewer | Workload profiles, environments, raw distributions and fidelity checks | Blocks service-level claim |
| Performance/scientific | “50 members” currently describes simulated spread, not 50 explicit runs | Meteorologist/performance reviewer | Fifty member manifests or corrected wording | Blocks explicit 50-member ensemble claim |
| Validation | Internal consistency is not physical validation | Independent domain reviewer | Held-out real observations and approved thresholds | Blocks validated/operational/decision-grade claim |

## Next

Audit every brief requirement in [Requirement Traceability](18-requirement-traceability.md).
