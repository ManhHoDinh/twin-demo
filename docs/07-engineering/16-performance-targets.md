# Performance Targets

| Field | Value |
|---|---|
| Document ID | ENG-16 |
| Owner | Performance engineering lead |
| Status | PLANNED |
| Current demo | Browser workload with unvalidated scenario, ensemble and rendering figures; measurements must be environment-labelled |
| Production target | Reproducible cadence, latency, throughput, memory, scenario, ensemble and rendering service levels with safe degradation |
| Domain review | Operations, scientific engines, frontend/GPU, infrastructure and accessibility |
| Authoritative dependencies | [Non-functional requirements](../05-product/05-non-functional-requirements.md), [decision specification](../04-decision-support/01-decision-engine-spec.md), [LOD/GPU](11-lod-and-gpu-optimisation.md), [verification](15-verification-strategy.md) |

## Purpose and scope

Define workload-specific targets and a reproducible way to distinguish a target from a measured result. Performance is acceptable only when scientific fidelity, provenance, accessibility and failure reporting remain intact.

## Scientific and implementation status

Targets are `PLANNED` or `REFERENCE MODEL` until measured on a declared environment and accepted for an operational workflow. Current browser figures are implementation observations only when a dated artifact states build, data, device and method. The UI phrase “50 members” describes a simulated spread, not evidence of 50 explicit model-member executions.

## Inputs

Versioned workload profiles; dataset/mesh sizes; time horizon and cadence; candidate/ensemble counts; device/CPU/GPU/memory/browser/network; build/config; cache state; measurement scripts; scientific tolerances and degraded-mode policy.

## Outputs

Target register and measured-result register for update cadence, ingest-to-state latency, forecast/proposal/scenario latency, throughput, memory, storage, ensemble execution, GPU upload, FPS/frame time, interaction latency, availability and recovery, each with status and environment.

## Dependencies and allowed dependency direction

Scientific and product owners define workload/fidelity needs; verification defines correctness gates; measurement observes immutable builds. Performance tuning cannot feed rendering approximations back into physics or remove required evidence. Operations approve degraded behavior.

## Accepted alternatives and recommended method

Use controlled microbenchmarks for components, workload benchmarks for coupled paths, browser traces for rendering and soak/load/failure tests for service behavior. Recommend percentile distributions across cold/warm runs and representative low/target/high profiles, with regression budgets and raw artifacts.

## Governing equations and implementation form

Report latency distributions rather than a single average; throughput includes concurrency and backpressure; memory includes peak/resident/GPU where observable; FPS pairs with frame-time percentiles. End-to-end timing starts at a named accepted input/event and ends at a named durable/visible state.

## Variables, units, parameters and bounds

Cadence/latency [s or ms], throughput [events/s or runs/h], memory/storage [MiB/GiB], scenario horizon/step, candidates/members [count], GPU upload [MiB/s], frame time [ms], FPS [1/s], error/degradation rate [%]. Every bound states target, rationale, workflow consequence and owner.

## Data structures and serialization

`WorkloadProfile`, `MeasurementEnvironment`, `PerformanceTarget`, `BenchmarkRun`, `PerformanceResult`, `RegressionBudget` and `DegradedModeResult` carry build/config/data hashes, warm/cold state, repetitions, percentiles and artifact links.

## Update cadence and triggering events

Run focused benchmarks for relevant changes and full representative profiles before release or hardware/data/model changes. Re-baselining requires a disposition explaining both performance and scientific-fidelity impact.

## Spatial and temporal resolution

Profiles declare catchments/reaches/cells/features, mesh/texture resolution, forecast horizon, solver/output cadence, scenario count and ensemble representation. Results cannot be generalized beyond the measured profile without evidence.

## Complexity and resource use

Track scaling against cells, edges, timesteps, candidates and members. Separate algorithmic work, I/O, serialization and rendering. A 50-quantile/display spread is not 50 explicit member runs; explicit-member claims require run-manifest evidence.

## Initialization, warm-up and boundary conditions

Declare cache state, startup, shader compilation, data preload, network shaping, background load, power mode and thermal state. Include restart, stale-source and dependency-failure profiles so recovery time is measured, not assumed.

## Calibration method and observations

Performance models may be fitted to benchmark observations but are not scientific calibration. Retain raw timings and residuals; validate extrapolation on held-out workload sizes before capacity use.

## Validation metrics, datasets and acceptance thresholds

Use p50/p95/p99 latency/frame time, sustained throughput, peak memory, dropped/stale updates, failure/recovery time and scientific-output equivalence. Thresholds come from workflow deadlines, device populations and infrastructure constraints, with source/rationale/approval; none are claimed approved here.

## Verification tests and invariants

Check reproducible environment capture, workload hashes, adequate repetitions, no hidden cache mixing, bounded regression, deterministic scientific outputs and unchanged units/provenance under optimization. Degraded modes must preserve decision rights and explicit stale/missing labels.

## Visualization derived from measurable state

Rendering targets cover FPS, frame time, interaction and GPU memory while preserving fixed scientific mappings. LOD may reduce geometry/detail but cannot change values, thresholds, extent membership or confidence. When 3D fails, an accessible lower-cost view retains the supported facts.

## Assumptions and limitations

Browser/device/network variability is large; one developer machine is not a deployment benchmark. Synthetic/demo workloads may not represent production data or concurrency. Meeting latency does not establish model correctness or operational readiness.

## Failure detection, degraded behavior and recovery

Detect missed deadlines, queues, memory pressure, context loss, low FPS, partial member completion and stale outputs. Degrade by lowering visual detail, limiting optional comparisons, scheduling work or presenting last valid state with age; never fabricate members or silently reduce scientific coverage needed for a decision.

## Future extensions and scientific prerequisites

Distributed execution, GPU compute, surrogate models, adaptive ensemble scheduling and edge/offline modes require verified numerical equivalence, observability, capacity tests and approved degradation semantics.

## Implementation evidence and traceability

Current code and quick E2E demonstrate a runnable browser path, not production performance. Each measured claim must link a benchmark manifest, environment, raw results and verification outcome; targets remain visibly separate.

## Next

Track claim blockers in [Engineering Risks and Open Questions](17-engineering-risks-and-open-questions.md).
