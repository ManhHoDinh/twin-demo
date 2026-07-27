# Verification Strategy

| Field | Value |
|---|---|
| Document ID | ENG-15 |
| Owner | Verification lead |
| Status | REFERENCE MODEL |
| Current demo | Executable syntax, behavior and documentation checks; not independent physical validation |
| Production target | Layered equation, numerical, integration, scenario, UI-grounding and independent-review evidence |
| Domain review | Scientific disciplines, software assurance, GIS, operations and accessibility |
| Authoritative dependencies | [Scientific architecture](01-scientific-architecture.md), [simulation architecture](02-simulation-architecture.md), [visualization rules](12-visualisation-and-animation-rules.md), [calibration and validation](14-calibration-and-validation.md) |

## Purpose and scope

Demonstrate that equations, transformations, contracts and interfaces are implemented as specified. Verification asks whether the system was built correctly; it does not establish that a calibrated model represents the real basin or is fit for an operational decision.

## Scientific and implementation status

Current repository checks are `IMPLEMENTED` software evidence. The production verification matrix, manufactured cases, convergence program and independent scientific review are `PLANNED`; acceptance of physical benchmarks and tolerances is `REQUIRES DOMAIN REVIEW`.

## Inputs

Versioned equations/contracts, units and schemas; solver/configuration; controlled fixtures; analytical/manufactured solutions; benchmark datasets; scenario manifests; expected invariants; UI quantity-to-source mappings; declared hardware/software environment.

## Outputs

Machine-readable test results, conservation/unit/convergence reports, replay hashes, integration-contract results, scenario-regression dispositions, UI-grounding evidence, negative-test evidence, coverage gaps and independent-review findings.

## Dependencies and allowed dependency direction

Every engine supplies contracts and diagnostics to the verification harness. Tests may read immutable state and rendering outputs but cannot alter accepted production evidence. Validation consumes verified builds; passing validation cannot excuse a failed invariant.

## Accepted alternatives and recommended method

Use analytical solutions, manufactured solutions, property/invariant tests, metamorphic tests, golden scenarios, differential comparison and independent calculation as appropriate. Recommend a layered pyramid: dimensions/units, component invariants, simple cases, convergence, contracts, deterministic scenarios, UI grounding, adversarial negatives and independent review.

## Governing equations and implementation form

Translate each authoritative equation into dimension checks, limiting cases and conservation identities. Numerical verification includes time/space refinement, observed order where applicable and residual budgets. Tests cite the equation/contract version rather than restating scientific authority.

## Variables, units, parameters and bounds

Each assertion declares quantity, SI/base unit or documented conversion, tolerance type, scale and rationale. Numerical tolerances separate floating-point, discretization and model discrepancy. Bounds are not widened merely to pass a failing implementation.

## Data structures and serialization

`VerificationCase`, `FixtureManifest`, `ExpectedInvariant`, `RunEnvironment`, `VerificationResult`, `RegressionDisposition` and `IndependentReview` store versions, seeds, hashes, tolerances, logs and artifacts.

## Update cadence and triggering events

Run focused checks on change and the complete matrix for release candidates, model/config changes and evidence publication. Any changed expected result requires reviewer disposition and cannot silently overwrite the baseline.

## Spatial and temporal resolution

Verification spans single cells/reaches/reservoirs, coupled networks and basin scenarios. Refinement sequences exercise spatial meshes and timesteps; replay uses identical clocks, ordering and seeds. UI tests cover desktop/mobile and supported interaction modes.

## Complexity and resource use

Fast unit/contract tests gate every change; expensive convergence, ensemble and end-to-end suites run on declared release infrastructure. Record runtime and resource use, but do not trade away a scientific invariant to meet a test budget.

## Initialization, warm-up and boundary conditions

Fixtures define initial state, warm-up, boundaries, seeds and expected failure behavior. Include zero input, constant input, dry/wet transitions, disconnected topology, missing observations, stale state and restart/checkpoint cases.

## Calibration method and observations

Verification fixtures are not calibrated to observations. Parameter values are chosen from authoritative/simple cases or declared manufactured solutions. Observational comparisons belong to validation; any observed benchmark retains provenance and remains outside calibration tuning.

## Validation metrics, datasets and acceptance thresholds

Verification acceptance uses exact identities where possible and justified tolerances otherwise: dimensional validity, mass/storage closure, positivity, convergence, deterministic hashes, schema compatibility and UI source identity. Physical skill thresholds remain in [Calibration and Validation](14-calibration-and-validation.md).

## Verification tests and invariants

Required families: dimensional/equation/unit checks; water/storage/mass conservation; analytical/manufactured cases; mesh/timestep convergence and CFL calculation; positivity/monotonicity/causality; engine integration contracts; deterministic replay/restart; scenario regression; UI grounding; negative tests proving shaders, colors, particles, camera and animation cannot create or modify numbers; independent calculation/review.

## Visualization derived from measurable state

UI tests trace every readout, legend and interaction back to normalized state plus mapping version. Deliberately perturbing shader uniforms, colors or particle speed must leave physical quantities unchanged. Missing state must remain missing rather than gain a display-derived estimate.

## Assumptions and limitations

Passing tests proves only covered specifications and environments. Golden outputs can preserve a bug; therefore invariants, independent cases and review complement snapshots. Internal consistency is not physical validation or legal/operational approval.

## Failure detection, degraded behavior and recovery

A failed invariant blocks the affected claim and release evidence. Quarantine flaky/nondeterministic tests as failures with owners; do not retry into a pass. Recover by correcting implementation or justified specification/tolerance under review, then regenerate immutable results.

## Future extensions and scientific prerequisites

Formal methods, solver differential testing, hardware determinism, continuous shadow replay and automated evidence packages require stable contracts, representative datasets and independent reviewers.

## Implementation evidence and traceability

Repository syntax, E2E, UX and [documentation verifier](../../tests/docs-engineering-verify.mjs) are current software evidence. Production proof additionally requires equation-linked cases, convergence/conservation artifacts, scenario manifests and independent review dispositions.

## Next

Measure verified workloads under [Performance Targets](16-performance-targets.md).
