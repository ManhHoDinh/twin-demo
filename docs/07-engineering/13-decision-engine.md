# Decision Engine

| Field | Value |
|---|---|
| Document ID | ENG-13 |
| Owner | Decision-support lead |
| Status | REFERENCE MODEL |
| Current demo | Deterministic advisory comparison over `SYNTHETIC` scenarios; not an authorized operating system |
| Production target | Feasibility-first, ensemble-aware alternatives with human authorization and immutable decision records |
| Domain review | Reservoir operations, dam safety, emergency management, hydrology, hydraulics and legal authority |
| Authoritative dependencies | [Decision-engine specification](../04-decision-support/01-decision-engine-spec.md), [decision rights](../02-stakeholders/02-decision-rights-raci.md), [uncertainty](../04-decision-support/02-uncertainty-and-confidence.md), [simulation architecture](02-simulation-architecture.md) |

## Purpose and scope

Turn accepted physical and scenario state into a reviewable decision package: feasible alternatives, counterfactuals, objective results, uncertainty, regret, residual risk, required authority and refusal reasons. The normative objectives, proposal schema and hard constraints remain in the [decision-engine specification](../04-decision-support/01-decision-engine-spec.md); this document defines the engineering boundary without duplicating them.

## Scientific and implementation status

The browser comparison workflow is `IMPLEMENTED` for demonstration evidence but uses `SYNTHETIC` forcing and is not calibrated or authorized. Feasibility-first optimization, ensemble-aware objectives, formal regret and governed decision records are `PLANNED`; legal and operating authority is `REQUIRES DOMAIN REVIEW`.

## Inputs

Immutable baseline and alternative scenario results; ensemble members or explicit uncertainty representation; reservoir, river, inundation, exposure and impact state; hard constraints; decision deadline; authority/RACI context; observation quality, provenance and run manifests. Rendering state and AI-generated text are prohibited inputs.

## Outputs

A ranked but non-binding set of feasible alternatives, including the baseline/null action, counterfactual differences, objective components, constraint proofs, ensemble distribution, regret, sensitivities, residual risk, refusal/degradation state, authorization requirement and decision-record payload.

## Dependencies and allowed dependency direction

Digital Twin and Scenario publish accepted state; Reservoir, Hydraulic and Impact results arrive through those contracts. Decision Support may request immutable scenarios and publish a decision package to AI Explanation and Visualization. It cannot alter scientific state, actuate gates, issue official warnings or bypass human authority.

## Accepted alternatives and recommended method

| Method | Advantages | Principal limitations | Computational cost | Implementation complexity | Suitable use cases |
|---|---|---|---|---|---|
| Rule-based screening | Transparent, fast and directly auditable against approved procedures | Brittle outside encoded conditions and cannot quantify trade-offs among feasible alternatives | Very low | Low to medium | Hard safety/legal gates, escalation and baseline operating policies |
| Multi-criteria decision analysis | Makes competing objectives and stakeholder weights explicit | Scores/weights can hide value judgments and do not guarantee physical feasibility | Low | Medium | Human comparison of already-feasible alternatives with reviewed criteria |
| Deterministic constrained optimization | Searches a large action space while enforcing explicit bounds | One forecast trajectory can create false precision; nonlinearity and objective design matter | Medium | High | Advisory scheduling with governed constraints and adequate deterministic forecast skill |
| Robust optimization | Exposes worst-case or bounded-regret choices without requiring precise probabilities | May be conservative and depends on a defensible uncertainty set | Medium to high | High | Dam-safety-oriented planning under bounded structural/forecast uncertainty |
| Stochastic or ensemble optimization | Represents expected consequences, tails and probability-weighted trade-offs | Requires calibrated scenario probabilities and can be computationally expensive | High | Very high | Reservoir-cascade planning with validated ensembles and enough review time |
| Model predictive control | Re-optimizes as state and forecasts update, supporting rolling-horizon adaptation | Requires reliable state estimation, stable repeated solves and strict actuation/authority boundaries | High and recurring | Very high | Advisory rolling-horizon operation after telemetry, models and human approval workflow are production-ready |

Recommend feasibility filtering before any scoring, then transparent multi-objective comparison across ensemble members with explicit counterfactual and regret. Complexity is added only when inputs and validation support it.

## Governing equations and implementation form

Apply the objective, proposal and constraint definitions from the [normative decision specification](../04-decision-support/01-decision-engine-spec.md). In implementation: validate inputs, enumerate/generate candidates, reject every hard-constraint violation, simulate accepted candidates, compute per-member objectives and regret against the best feasible member-specific action, summarize distributions, then require human disposition.

## Variables, units, parameters and bounds

Decision variables include release trajectories [m3/s], gate-realizable changes, notification/decision times [UTC], evacuation or intervention choices and scenario identifiers. Objectives retain physical units before governed normalization. Bounds come from approved operating constraints and evidence; missing bounds make an action infeasible rather than silently relaxed.

## Data structures and serialization

`DecisionRequest`, `ConstraintSet`, `Alternative`, `Counterfactual`, `ObjectiveResult`, `RegretResult`, `DecisionPackage`, `AuthorizationDisposition` and append-only `DecisionRecord` carry run/config versions, input hashes, provenance, uncertainty, reviewer identity and timestamps.

## Update cadence and triggering events

Recompute when an accepted observation/forecast issue, model/config version, constraint, authority context or requested alternative changes. A superseded package remains immutable and linked to its replacement; a display refresh never triggers scientific recomputation.

## Spatial and temporal resolution

Use the resolution of accepted upstream results and decision horizons. Release trajectories must respect gate/ramp cadence; impacts and deadlines use the spatial/temporal support at which decisions are executable. Aggregation cannot hide a local hard-constraint violation.

## Complexity and resource use

Cost scales with candidates times ensemble members times coupled-simulation cost. Screening and cached immutable scenarios may reduce latency, but no runtime or ensemble-size claim is made without the measurement protocol in [performance targets](16-performance-targets.md).

## Initialization, warm-up and boundary conditions

Initialize from an accepted Digital Twin snapshot, current authorized operating state and complete constraint set. Missing observations, decision rights, gate constraints, notification lead or model validity boundaries cause refusal or a clearly bounded information-only package.

## Calibration method and observations

Objective weights and decision thresholds are policy parameters, not hydrologic calibration coefficients. Elicit and test them with authorized stakeholders against historical exercises, then version them. Never tune them to make a preferred current-demo action win.

## Validation metrics, datasets and acceptance thresholds

Validate feasibility classification, ranking stability, regret, counterfactual correctness, authority routing and user comprehension on independent historical/hypothetical exercises. Metrics and thresholds require rationale, source and domain approval; internal consistency alone is not decision validity.

## Verification tests and invariants

Prove hard constraints are evaluated before objectives; infeasible actions cannot rank; the null action is present; identical inputs replay deterministically; ensemble order does not change summaries; missing authority blocks authorization; every shown number traces to state; AI prose cannot change values, actions or status.

## Visualization derived from measurable state

Show alternatives, constraint results, objective components, counterfactual differences, ensemble intervals, regret and residual risk from the serialized package. Color or chart order cannot alter ranking. Unsupported quantities display `not computed` or `planned`.

## Assumptions and limitations

Optimization quality is bounded by upstream models, impact functions, constraints and objectives. A feasible mathematical action may still be institutionally or legally unavailable. AI Explanation may summarize and cite the package only; it cannot compute hydrology, create evidence, issue an order or issue an official warning.

## Failure detection, degraded behavior and recovery

Reject stale/missing inputs, empty feasible sets, constraint-evaluation errors, unstable rankings, incomplete ensemble coverage and absent authority. Return explicit infeasibility/refusal with causes and permitted next steps. Recovery produces a new versioned package after corrected inputs or authorized constraints.

## Future extensions and scientific prerequisites

Robust/stochastic control, adaptive policies, value-of-information and learned surrogate optimization require validated upstream ensembles, approved objective semantics, bias monitoring, adversarial tests and independent operational review.

## Implementation evidence and traceability

Current behavior is bounded by [DATA_AND_METHODS](../../DATA_AND_METHODS.md), [decision code](../../js/decision.js) and executable tests. Production evidence requires immutable scenarios, constraint proofs, objective/regret calculations, reviewer disposition and replayable decision records.

## Next

Define evidence gates in [Calibration and Validation](14-calibration-and-validation.md).
