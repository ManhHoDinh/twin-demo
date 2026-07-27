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

### Sourced target register

`TARGET` means an authoritative product/design target, not a measurement. `UNVERIFIED` means current wording or configuration exists without the required benchmark artifact. No row below is a measured production result.

| Target ID | Metric | Target | Source | Evidence status | Rationale | Workload profile | Measurement method | Degradation action |
|---|---|---|---|---|---|---|---|---|
| PERF-01 | Reservoir level/gate ingest cadence | 1–5 min; maximum decision-loop age 15 min | [NFR-03](../05-product/05-non-functional-requirements.md) | TARGET | Keep controllable state current enough for advisory review | One basin, governed reservoir telemetry | Compare source, ingest and accepted-state timestamps over event/soak runs | Lower operating level, cap confidence and show stale payload |
| PERF-02 | River stage/rainfall ingest cadence | 5–15 min; maximum age 30 min | [NFR-03](../05-product/05-non-functional-requirements.md) | TARGET | Bound stale hydrometeorological inputs | Representative gauges and rainfall sources | Timestamp-lag percentiles plus missed-update count | Mark stale, cap confidence and suppress dependent advice |
| PERF-03 | Observation-to-display latency | < 5 s target; 30 s hard limit | [NFR-02](../05-product/05-non-functional-requirements.md) | TARGET | Preserve operator situational awareness | Accepted observation through durable state to visible operator screen | End-to-end timestamp trace, p50/p95/p99, cold/warm | Show last-valid age; degrade operating level after limit |
| PERF-04 | Screen interaction latency | < 200 ms target; 1 s hard limit | [NFR-02](../05-product/05-non-functional-requirements.md) | TARGET | Maintain usable investigation during events | Representative desktop/mobile selections and controls | Browser trace and input-to-visible-response percentiles | Reduce optional effects/detail; preserve decision-critical controls |
| PERF-05 | Proposal generation | < 60 s target; 3 min hard limit | [NFR-02](../05-product/05-non-functional-requirements.md) | TARGET | Support committee review before decision deadlines | Declared candidate count, ensemble representation and coupled cached inputs | Request-to-immutable-package percentiles with workload manifest | Return explicit timeout/incomplete status; never rank partial results as complete |
| PERF-06 | Single what-if scenario | < 10 s target; 30 s hard limit | [NFR-02](../05-product/05-non-functional-requirements.md) | TARGET | Support interactive comparison | One declared scenario/horizon/model profile | Request-to-accepted-result percentiles and scientific equivalence checks | Queue/offline execution or retain prior accepted result with age |
| PERF-07 | Inundation-library lookup | < 500 ms target; 2 s hard limit | [NFR-02](../05-product/05-non-functional-requirements.md) | TARGET | Support interactive map inspection | Versioned library at representative spatial index size | Lookup-to-render-ready result percentiles, cache states declared | Fall back to text/last-valid product with version and age |
| PERF-08 | Full ensemble forecast cycle | < 5 min target; 15 min hard limit | [NFR-02](../05-product/05-non-functional-requirements.md) | TARGET | Produce scheduled uncertainty before it becomes stale | Declared member count, horizons, engines and compute environment | Issue-to-complete-manifest percentiles plus member completion accounting | Mark incomplete ensemble; do not fabricate missing members or confidence |
| PERF-09 | Scenario/live 2D runtime | What-if < 10 s; live 2D seconds–minutes and clearly labelled | [Decision compute budget](../04-decision-support/01-decision-engine-spec.md) | TARGET | Separate interactive lookup from live simulation expectations | Declared mesh, timestep, horizon and boundary profile | Wall-clock and simulation-time ratio with convergence/fidelity checks | Switch to precomputed/library result or schedule run; label mode |
| PERF-10 | Ensemble size | No approved numeric production target; current “50 members” is simulated spread, not 50 explicit runs | [Current demo description](../../js/data.js) | UNVERIFIED; REQUIRES DOMAIN REVIEW | Prevent display wording becoming a compute/scientific claim | Current synthetic demo and future explicit-member profile | Count immutable member manifests and verify distinct forcing/run IDs | Correct wording; suppress explicit-member claim until evidence exists |
| PERF-11 | Operator/public throughput | 200 concurrent operators and 1,000,000 public-user burst are scalability targets | [NFR-04](../05-product/05-non-functional-requirements.md) | TARGET | Keep public surge isolated from operations | Isolated public/operator tiers at declared request mix | Load/soak test with latency, error, queue and isolation metrics | Shed public detail/traffic without degrading operator tier |
| PERF-12 | Host memory | No authoritative numeric CPU/RAM target exists | [NFR-15](../05-product/05-non-functional-requirements.md) | REQUIRES DOMAIN REVIEW | Avoid inventing a memory budget before device profiling | Control workstation, integrated-graphics laptop, field/mobile profiles | Peak/resident memory and pressure/failure traces | Disable optional 3D/effects while retaining all decision-critical functions |
| PERF-13 | GPU memory/upload | No authoritative numeric GPU-memory or upload target exists | [LOD/GPU contract](11-lod-and-gpu-optimisation.md) | REQUIRES DOMAIN REVIEW | Device-specific limits require measured scene budgets | Declared target devices, scenes, tiles, textures and cache states | Browser/GPU tooling for peak allocation, upload and context-loss tests | Ordered LOD reduction; accessible 2D/text fallback |
| PERF-14 | Rendering frame rate | 60 fps control-room target; ≥30 fps integrated-graphics floor or gracefully disable 3D | [NFR-15](../05-product/05-non-functional-requirements.md) | TARGET | Preserve interaction without making 3D mandatory | Representative full scene on named workstation/laptop profiles | Frame-time p50/p95/p99, dropped frames and GPU memory with cold/warm runs | Reduce effects/LOD; disable 3D while preserving 100% decision-critical function |

## Next

Track claim blockers in [Engineering Risks and Open Questions](17-engineering-risks-and-open-questions.md).
