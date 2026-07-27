# Calibration and Validation

| Field | Value |
|---|---|
| Document ID | ENG-14 |
| Owner | Scientific validation lead |
| Status | REFERENCE MODEL |
| Current demo | Displays indicative target metrics over synthetic behavior; no independent scientific validation claim |
| Production target | Versioned calibration and independent validation by subsystem, event, location and decision use |
| Domain review | Hydrology, hydraulics, reservoirs, GIS, impact, meteorology and operations |
| Authoritative dependencies | [Observation model](../01-domain-model/03-observation-model.md), [exposure and impact model](../01-domain-model/04-exposure-and-impact-model.md), [uncertainty](../04-decision-support/02-uncertainty-and-confidence.md), [hydrology](04-hydrology-model.md), [hydraulics](05-hydraulic-model.md) |

## Purpose and scope

Define how parameters are estimated without consuming the evidence later used to judge predictive fitness. Calibration estimates/configures a model; validation evaluates a frozen model on independent evidence. Verification is separate and covered by [Verification Strategy](15-verification-strategy.md).

## Scientific and implementation status

The architecture and target metric vocabulary are `REFERENCE MODEL`. Local datasets, splits, acceptance thresholds and reviewer approvals are `PLANNED` or `REQUIRES DOMAIN REVIEW`. Displayed CSI, NSE, KGE, CRPS and related figures are targets or demonstration labels, not measurements unless linked to a governed result artifact.

## Inputs

A dataset registry with source, rights, station/layer, variable, units, datum, valid/issue/ingest times, quality, uncertainty and version; frozen model/configuration; declared calibration and validation split; decision-use statement; reviewer-approved metric definitions.

## Outputs

Versioned parameter/configuration sets; split manifest; objective and residual results; identifiability and sensitivity report; subsystem validation report; acceptance disposition; limitations and applicability domain; links to immutable inputs and executable verification.

## Dependencies and allowed dependency direction

Data Pipeline and Observation Model govern evidence; each scientific engine publishes predictions and diagnostics. Calibration may produce a new candidate configuration but cannot rewrite observations or validation partitions. Validation consumes the frozen candidate and independent data; Visualization only presents accepted artifacts.

## Accepted alternatives and recommended method

Use manual/engineering calibration, bounded search, Bayesian/ensemble inference or multi-objective optimization according to model complexity and data. Recommend preregistered multi-objective calibration with bounded parameters, sensitivity/identifiability analysis and held-out event/spatial/temporal validation. Cross-validation supplements, not replaces, an independent final set.

## Governing equations and implementation form

Objective functions combine explicitly scaled residual terms appropriate to the subsystem; no single score proves validity. Freeze code, data versions, parameters and split before final validation. Report uncertainty from observations, forcing, parameters, structure and numerical approximation separately where identifiable.

## Variables, units, parameters and bounds

Metrics retain definitions and direction: NSE/KGE [-], bias and volume error [% or physical units], RMSE/MAE [quantity units], peak/timing errors [quantity units/h], CSI/POD/FAR [-], CRPS [quantity units], spatial overlap/distance [declared units]. Parameter bounds and thresholds need sources, rationale and owner approval.

## Data structures and serialization

`DatasetRegistryEntry`, `SplitManifest`, `CalibrationRun`, `ParameterSet`, `SensitivityResult`, `ValidationCase`, `MetricResult`, `ValidationReport` and `ReviewDisposition` include hashes, versions, provenance, scripts/environment and signatures.

## Update cadence and triggering events

Create a new calibration/validation cycle for material code, forcing, geometry, datum, observation-QC, parameterization or intended-use changes. Correcting a result creates a superseding artifact; published historical evidence remains immutable.

## Spatial and temporal resolution

Split by whole events/periods and, where relevant, stations, reaches, reservoirs or zones so neighboring samples do not leak across partitions. Evaluate at native and decision-relevant aggregation. Temporal windows must not let future observations inform earlier forecasts.

## Complexity and resource use

Cost scales with parameter evaluations, events, locations, members and model runtime. Record compute environment and failed runs. Reduced calibration models require discrepancy evidence before transferring parameters to a higher-fidelity production model.

## Initialization, warm-up and boundary conditions

Warm-up periods, antecedent state, boundary series and observation availability are part of each case manifest. Warm-up observations cannot silently enter the scored validation window. Missing boundary evidence limits or rejects the case.

## Calibration method and observations

Use a registry-backed set representative of regimes and magnitudes. Prevent leakage through event, spatial and temporal partitioning; keep transformations and bias corrections inside the training partition. Inspect equifinality, parameter correlation, profile/posterior uncertainty and global/local sensitivity before selecting a parameter set.

## Validation metrics, datasets and acceptance thresholds

Validate separately: hydrology (volume, peak, timing, NSE/KGE); hydraulics (stage/discharge, velocity where observed, mass and timing); reservoirs (level/storage/release and constraints); inundation (CSI, extent/depth/arrival); impact (exposure/damage classification); decision support (feasibility, regret, usefulness and authority). Hindcast independent events and retain a final independent set. Every threshold needs source, rationale, intended-use consequence and domain approval.

## Verification tests and invariants

Test split disjointness, no future leakage, immutable hashes, units, metric formulas, missing-data policies, deterministic reruns, parameter bounds and report generation. A result cannot be accepted if its data or model version differs from the manifest.

## Visualization derived from measurable state

Plot observations versus predictions, residuals, hydrographs, spatial errors, reliability and uncertainty from stored metric artifacts. Label target, measured result and acceptance separately. Never turn a configured target into a measured badge.

## Assumptions and limitations

Historical coverage may omit extreme or changing conditions; observational error and rating/datum changes can dominate. Good aggregate scores can hide unsafe local errors. Internal consistency, synthetic benchmarks and calibration fit are not physical validation.

## Failure detection, degraded behavior and recovery

Reject overlapping splits, missing provenance, changed hashes, invalid units, non-identifiable parameters presented as unique, metric cherry-picking and threshold changes after results. Recover with a new preregistered cycle and independent review, not by relabeling failed evidence.

## Future extensions and scientific prerequisites

Bayesian model averaging, nonstationarity, online adaptation and continuous validation require governed real-time observations, drift detection, locked holdouts, rollback and approval policies.

## Implementation evidence and traceability

Current display/code evidence is not a validation report. Production evidence must link the dataset registry, split manifest, executable environment, frozen model/config, complete metric outputs, sensitivity/identifiability analysis and signed disposition.

## Next

Specify executable correctness evidence in [Verification Strategy](15-verification-strategy.md).
