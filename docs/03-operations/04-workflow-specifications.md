# End-to-end workflow specifications

Implementation-ready specification of the ten operational workflows the platform must
support end to end, each executable from the map. This document is the *specification*
layer; the narrative [workflow catalog](01-workflow-catalog.md) is the *overview* layer and
the two are kept consistent by the WF-id mapping in section 0.3.

**Cross-reference index.** Personas P-01…P-09 in
[stakeholders/personas](../02-stakeholders/01-personas.md). Decision rights D-01…D-16 and
the RACI table in [decision rights](../02-stakeholders/02-decision-rights-raci.md), encoded
in `js/roles.js`. Screens S-01…S-10 in [screen catalog](../05-product/02-screen-catalog.md).
KPIs in [KPIs](../05-product/06-kpis.md). Data-source provenance in
[explainability](../07-engineering/13-decision-engine.md), decision-lifecycle provenance in
`js/lifecycle.js`. Thresholds in [decision trees](02-decision-trees.md); message rules in
[communication protocols](03-communication-protocols.md); entities in
[exposure and impact model](../01-domain-model/04-exposure-and-impact-model.md).

---

## 0. Framing

### 0.1 The map is the workspace

Every workflow below is executable from a single map surface. Panels are summoned over the
map and dismissed; no workflow requires navigating away from the map to a separate page.
This is enforced by the geospatial-OS shell (`js/shell.js`, `body.geoshell`): the map is
full-bleed, and the command bar plus floating docks (timeline, alert stack, decision panel,
inspector) overlay it. Where a step says "on the map", it means a direct map interaction
(select an object, draw a scenario, open its inspector) rather than a form.

### 0.2 The six lifecycle classes (the provenance the product sells)

Every artifact a workflow produces carries exactly one decision-lifecycle class
(`FT.lifecycle.CLASS`), orthogonal to its data-source provenance
(MEASURED/FORECAST/MODELLED/ASSUMED/SYNTHETIC):

| Class | Meaning | Actionable | Badge |
|---|---|---|---|
| `OBSERVED` | Sensed past state (t ≤ now) | no | obs |
| `FORECAST` | Predicted future with uncertainty (t > now) | no | fcst |
| `SIMULATION` | Model-computed consequence of a scenario | no | sim |
| `RECOMMENDATION` | AI/optimiser proposal, not yet acted on | no | rec |
| `OPERATOR_DECISION` | A named human's sealed approve/reject | no | dec |
| `APPROVED_PLAN` | A decision in force, driving operations | **yes** | plan |

**Invariant across all workflows:** a `RECOMMENDATION` becomes an `APPROVED_PLAN` only
through an `OPERATOR_DECISION` by an entitled actor (the RACI gate, `js/roles.js` `can()`).
Only `APPROVED_PLAN` is actionable. Every AI recommendation states its assumptions,
confidence, and expected downstream impact (decision package: counterfactual, constraints,
regret, P(below AL3) as the ensemble-band integral) before it can be approved.

### 0.3 Goal-workflow to catalog mapping

| # | This spec | Catalog WF | Primary screen |
|---|---|---|---|
| 1 | Watershed monitoring | WF-01 | S-01 map · S-02 gauge |
| 2 | Forecast interpretation | WF-02, WF-03 | S-03 forecast |
| 3 | Scenario simulation | WF-04 | S-01 map · S-04 inundation |
| 4 | Reservoir coordination | WF-05, WF-06, WF-07 | S-05 decision package |
| 5 | Operator review | WF-07 (review stage) | S-05 decision package |
| 6 | Regional coordination | WF-03, WF-05 (multi-reservoir) | S-01 map · S-06 cascade |
| 7 | Government approval | WF-07, WF-08 (authority gate) | S-05 · S-07 record |
| 8 | Public warning | WF-09, WF-11 | S-07 record · S-08 zones |
| 9 | Emergency response | WF-10 | S-08 zones · S-01 map |
| 10 | Post-event replay | WF-12 | S-09 replay · S-07 record |

---

## WF-SPEC-1 — Watershed monitoring

**Catalog:** WF-01. **Escalation:** L0. **Primary screen:** S-01 (map), S-02 (gauge).

- **Actors.** P-01 Control Room Operator (primary), P-02 Duty Hydrologist (review).
- **Goals.** Confirm the basin is behaving as expected; detect silent sensor drift and
  slow rule-curve non-compliance before they matter; hand a trustworthy state to the next
  shift. The unglamorous workflow that earns the credibility spent during a flood.
- **Inputs.** Overnight gauge stages, reservoir levels, inflow/outflow, generation; sensor
  health; rule-curve target for today's date; 5-day rainfall outlook.
- **Outputs.** A shift-state summary; a rule-curve compliance verdict; a data-health level
  (L0–L4); an auto-drafted, human-edited shift handover.
- **Domain entities.** FloodplainCell, PopulationCell (idle), Gauge, Reservoir,
  CriticalInfrastructure (health only), MonitoredZone (all NORMAL).
- **Lifecycle classes produced.** `OBSERVED` (all readings). No RECOMMENDATION at L0.
- **State transitions.** Basin `NORMAL`; per-gauge alert 0; data-health L0 → L1 if a feed
  degrades. Exit either stays L0 or escalates to WF-SPEC-2 on the rainfall outlook.
- **Decision points.** None operational. One judgement: is any drift or ceiling creep worth
  a maintenance ticket? (D-15 dispatch notify if generation plan changes.)
- **Human approvals.** Shift handover accepted by the incoming operator (sealed, attributed).
- **Data sources.** Gauge/reservoir telemetry (MEASURED, target: SCADA link); rainfall
  outlook (FORECAST); rule curve (the legal QĐ-1865 band).
- **Visualisations.** Map with gauge/reservoir glyphs at real coordinates; compliance chip
  (within band / above ceiling / below target); data-health strip; 5-day outlook sparkline.
- **User interactions (from the map).** Select a gauge → inspector shows stage, trend, alert
  bands; select a reservoir → level bar vs rule curve; open the handover dock to edit the
  auto-draft; acknowledge sensor-health items.
- **Failure cases.** Silent sensor drift accumulating unnoticed (mitigation: drift flag in
  data-health); ceiling non-compliance normalised over weeks (mitigation: compliance chip
  history); handover skipped (mitigation: incoming shift cannot clear the board without it).
- **Audit trail.** `session.actor` on sign-on; `handover.sealed` with both shift identities;
  any `data.health.change`.
- **KPIs.** Handover completion rate = 100 %; mean sensor-drift detection lead; false rule-
  curve alarms per week (low).
- **Acceptance criteria.** (a) Compliance verdict matches the QĐ-1865 band for the date;
  (b) a degraded feed moves data-health within one refresh; (c) the handover carries both
  identities and is sealed; (d) every displayed reading is class `OBSERVED`.

---

## WF-SPEC-2 — Forecast interpretation

**Catalog:** WF-02, WF-03. **Escalation:** L0 → L2. **Primary screen:** S-03 (forecast).

- **Actors.** P-06 Forecaster (primary), P-02 Duty Hydrologist, P-03 Plant Manager (brief).
- **Goals.** Turn an ensemble rainfall forecast into a decision-relevant statement per
  gauge: P(exceed AL1/AL2/AL3) per hour, with the antecedent-wetness context that decides
  whether it matters. Distinguish a rainfall problem from a reservoir problem (controllability κ).
- **Inputs.** Ensemble QPF; the official NCHMF bulletin (authoritative layer); antecedent
  precipitation index / soil moisture; current reservoir free storage and time-to-full.
- **Outputs.** Per-gauge exceedance-probability curves; controllability κ; a decision
  deadline countdown once L2; an early advisory-drawdown flag if ceiling compliance is at
  risk within the horizon (WF-02 step 5 — the cheap, days-ahead option).
- **Domain entities.** Gauge (with alert bands), Reservoir (free storage), the ensemble
  envelope, SubCatchment (antecedent wetness).
- **Lifecycle classes produced.** `FORECAST` (ensemble quantiles, P(exceed), κ). The
  advisory-drawdown flag is `RECOMMENDATION` only once a package is generated (WF-SPEC-4).
- **State transitions.** L0 → L1 on watch threshold; L1 → L2 on `P(AL2 at governing gauge) >
  30 %` within 48 h. Deadline countdown starts at L2.
- **Decision points.** *Is a slow cheap drawdown now better than a fast expensive one later?*
  (WF-02) — the highest-return decision in the catalogue, almost always made too late. Not
  an execution yet; it arms WF-SPEC-4.
- **Human approvals.** None at this stage — a forecast is never actionable. The forecaster
  publishes the interpretation; acting on it is a separate, gated decision.
- **Data sources.** GraphCast/GenCast-class ensemble (design target; current build is a
  calibrated analytic ensemble, labelled SYNTHETIC), NCHMF bulletin (FORECAST), IMERG-
  corrected rainfall (design target).
- **Visualisations.** Hydrograph with the P05–P95 fan and the median (S-03); a per-gauge
  P(exceed) small-multiple; the bulletin shown as its own authoritative layer beside the
  internal computation; κ meter; deadline chip.
- **User interactions (from the map).** Select a gauge → forecast dock opens with the fan
  and P(exceed); toggle the official bulletin layer; scrub the timeline to read the forecast
  at any hour; read κ from the ops strip.
- **Failure cases.** "It's only moderate rain" dismissed on saturated ground (mitigation: κ
  and antecedent-wetness are foreground, not buried); the ensemble presented without spread
  (mitigation: the band is mandatory, never a point forecast); confusing the bulletin with
  internal computation (mitigation: distinct layers and lifecycle badges).
- **Audit trail.** `forecast.published` with model/version; `escalation.change` L-level;
  `deadline.started`.
- **KPIs.** Brier score / reliability of P(exceed) (design-target, hindcast); FAR for AL3
  crossings at 12 h lead; decision-deadline lead time delivered.
- **Acceptance criteria.** (a) Every forecast number carries a range, never a point; (b)
  P(below AL3) equals the integral of the drawn ensemble band (guarded by
  `scripts/verify-r33.mjs`); (c) the bulletin and internal computation are visually and by
  lifecycle class distinct; (d) no forecast artifact is ever actionable.

---

## WF-SPEC-3 — Scenario simulation

**Catalog:** WF-04. **Escalation:** L2 → L3. **Primary screen:** S-01 (map), S-04 (inundation).

- **Actors.** P-02 Duty Hydrologist (primary), P-06 Forecaster, P-05 Emergency Commander (reads).
- **Goals.** Compute the physical consequence of a forcing scenario — inundation extent and
  depth, road passability, zone exposure — fast enough to inform a decision, and honestly
  about its resolution (five depth bands, not false precision).
- **Inputs.** A forcing scenario (historical oct-2020, superstorm yagi, monsoon, or an
  operator-tuned rain-scale/ensemble-spread); reservoir release trajectory; DEM and channel
  geometry; population and building rasters.
- **Outputs.** A depth grid over the floodplain; road closure states with windows; per-zone
  mean/max depth, graded exposure (impact-model §3.1) and status; basin flooded area and
  exposed range.
- **Domain entities.** FloodplainCell (depth/velocity), Road/Bridge (closure), MonitoredZone
  (status), Building (flooded count), Shelter (validity vs the footprint).
- **Lifecycle classes produced.** `SIMULATION` (the SWE inundation and everything derived
  from it). Never actionable — a simulation is a consequence, not a plan.
- **State transitions.** Zones traverse NORMAL → WATCH → WARNING → SERIOUS → CRITICAL by
  mean-depth × exposed-fraction (impact-model §4); a zone with all routes cut → `isolated`.
- **Decision points.** None internal; the simulation *feeds* WF-SPEC-4/9/10. Judgement: is
  the scenario the right one to plan against (median vs P90 member)?
- **Human approvals.** None — a simulation result is published, not approved.
- **Data sources.** In-browser shallow-water solver 144² (design target: FNO surrogate,
  CSI ≥ 0.80 vs HEC-RAS-2D); real DEM (AWS Terrain Tiles) and imagery; OSM roads/buildings.
- **Visualisations.** The map itself: five-band depth choropleth, road passability colours,
  zone status fill, the 3D twin for terrain read; a flooded-area/exposure badge; the PiP.
- **User interactions (from the map).** Pick a scenario or drag the rain-scale/ensemble
  sliders; press play or scrub the timeline; select any cell/zone/road → inspector shows its
  simulated depth/status with the SIMULATION badge; toggle the 2D/3D view.
- **Failure cases.** Reading a single worst cell as the zone (mitigation: mean × fraction,
  never max); path-dependent SWE giving different numbers when jumped-to vs scrubbed
  (mitigation: settle the path for reproducible figures); presenting depth to 0.01 m
  (mitigation: five bands by construction).
- **Audit trail.** `engine.rebuild` with scenario/policy/rain-scale/ensemble-spread; the
  self-test PASS on mass balance and quantile order.
- **KPIs.** CSI/NSE/KGE vs a reference model (design-target); mass conservation error (proven
  ≤ 0.01 % numerically); frames-per-second (≥ 30 for interactivity).
- **Acceptance criteria.** (a) Zone status uses mean × exposed fraction; (b) exposure uses
  the graded depth function (`scripts/verify-exposure.mjs`); (c) depth is shown in five bands;
  (d) every simulated quantity carries the SIMULATION lifecycle class.

---

## WF-SPEC-4 — Reservoir coordination (the decision package)

**Catalog:** WF-05, WF-06, WF-07. **Escalation:** L2 → L3. **Primary screen:** S-05 (decision package).

- **Actors.** P-02 Duty Hydrologist (prepares/proposes), P-01 Operator (executes gates),
  P-03 Plant Manager (consulted), P-07 Dam Safety Engineer (consulted), P-04 Authority
  (accountable for pre-release, D-03/D-04).
- **Goals.** Produce a coordinated multi-reservoir release plan that reduces the downstream
  peak within the legal envelope, with the counterfactual and residual risk made explicit,
  so an accountable human can decide with both the benefit and the cost in view.
- **Inputs.** Per-reservoir inflow forecast with uncertainty; free storage and time-to-full;
  the QĐ-1865 rule curve and flood ceiling; downstream gauge influence weights; gate ramp
  and drawdown-rate limits.
- **Outputs.** A **decision package** (`RECOMMENDATION`): proposed release q0→q1 at reservoir
  R from T+start; the ensemble inflow envelope; the downstream effect (rule vs MPC peak, the
  P05·median·P95 band vs AL3); the governing clause; residual risk as P(below AL3) = the band
  integral; constraint checks C1–C10; the counterfactual; alternatives; regret both ways.
- **Domain entities.** Reservoir (level/storage/gates), Gauge (control point), the ensemble,
  the constraint set, the decision package artifact.
- **Lifecycle classes produced.** `RECOMMENDATION` while unapproved; becomes `APPROVED_PLAN`
  only after WF-SPEC-7. Rendered with the amber "requires review, not in force" marker
  (`js/lifecycle.js`, guarded by `scripts/verify-lifecycle.mjs`).
- **State transitions.** Package `kind`: PROPOSAL (worthwhile cut) · NULL (cut below
  threshold — an honest "no action") · SATURATED (model at ceiling, cannot compare) ·
  DEGRADED (data health L2+ stands the optimiser down) · REFUSAL (L4, refuses to advise).
- **Decision points.** Which (reservoir, control-point) pair to act on — chosen by
  influence-weighted stress, never the most-loaded dam if it has no hydraulic influence
  (`buildProposal`). Whether the cut is worthwhile (NULL below threshold). Whether the plan
  is feasible (any hard constraint FAIL → reported, never relaxed).
- **Human approvals.** None at this stage — the package is a recommendation. Approval is
  WF-SPEC-7 and is RACI-gated: pre-flood drawdown (D-03) is accountable to P-04 Authority,
  not the engineer who proposes it.
- **Data sources.** Reservoir routing (MODELLED; design target SCADA), ensemble (design
  target GenCast), legal corpus (real QĐ-1865 text).
- **Visualisations.** The decision panel over the map with the lifecycle marker; the head-to-
  head rule-vs-MPC peak chip; the ensemble band; the constraint table with the binding
  constraint named; the regret two-sided view.
- **User interactions (from the map).** Toggle the operating policy on the reservoir stack;
  open the decision package; read the counterfactual and residual risk; a reservoir's gates
  and downstream gauge are selectable on the map to inspect the routed effect.
- **Failure cases.** Naming a reservoir with zero influence on the judged gauge (mitigation:
  influence-weighted pairing); relaxing an infeasible plan to look feasible (mitigation:
  infeasibility is reported with the binding constraint); presenting the residual 8 % as the
  headline (mitigation: lead with the peak cut, band under residual risk — R-33).
- **Audit trail.** `package.generated` with id/feasible/binding/confidence/data-level;
  `engine.rebuild` on any forcing change.
- **KPIs.** Peak cut delivered (m); honest-null rate (proposals correctly withheld when the
  cut is not worthwhile); feasibility-report accuracy.
- **Acceptance criteria.** (a) The package always carries a counterfactual and a constraint
  proof; (b) infeasibility is reported, never relaxed; (c) the residual risk is the band
  integral, not a clamp; (d) the package is class RECOMMENDATION and not actionable until
  approved.

---

## WF-SPEC-5 — Operator review

**Catalog:** WF-07 (review stage). **Escalation:** L2 → L3. **Primary screen:** S-05.

- **Actors.** P-02 / P-03 / P-04 depending on the decision's accountable role (RACI);
  P-07 Dam Safety consulted for ceiling/emergency decisions.
- **Goals.** Let an entitled human interrogate a recommendation — assumptions, confidence,
  downstream impact, alternatives, regret — and record a defensible accept/reject that a
  post-event inquiry can reconstruct.
- **Inputs.** The decision package (`RECOMMENDATION`); the reviewer's identity and role; a
  reason of record; the current data-health level.
- **Outputs.** A sealed `OPERATOR_DECISION` record (approved/rejected/superseded) with the
  input snapshot hash, the reason, the actor and role, and the applies-at time. On approve,
  it puts the plan in force (WF-SPEC-7).
- **Domain entities.** The decision package; the decision record; the actor; the audit log.
- **Lifecycle classes produced.** `OPERATOR_DECISION` (the sealed record). The plan it puts
  in force is separately `APPROVED_PLAN`.
- **State transitions.** RECOMMENDATION → (review) → OPERATOR_DECISION{approved} →
  APPROVED_PLAN in force; or → OPERATOR_DECISION{rejected} (no plan); or superseded when the
  context changes under an open decision (a new snapshot is sealed first).
- **Decision points.** Approve / reject / defer. Entitlement is checked before the click
  lands: an un-entitled role's attempt is refused and itself logged (`decision.refused`).
- **Human approvals.** This *is* the human approval. Three gates in order (`js/opsui.js`
  `gate()`): (1) a duty operator is identified; (2) a reason of record ≥ 4 chars; (3) the
  role is accountable for this decision under RACI (`js/roles.js` `can()`).
- **Data sources.** The frozen input snapshot (canonical, SHA-256 hashed, recomputable
  without the vendor).
- **Visualisations.** The decision panel with the amber RECOMMENDATION marker; the identity
  and reason inputs; on approval the marker flips to the cyan APPROVED_PLAN state.
- **User interactions (from the map).** Select the duty operator; type the reason; press
  Approve or Reject; the record export/print control sits beside Approve.
- **Failure cases.** Anonymous approval (mitigation: identity gate); unexplained approval
  (mitigation: reason gate); the wrong office approving (mitigation: RACI entitlement gate,
  `scripts/verify-record.mjs`); re-hashing the same object proving nothing (mitigation: the
  hash test reverses key order at every level).
- **Audit trail.** `decision.approve`/`reject` with package id, actor role, reason, snapshot
  ref; `decision.refused` when entitlement fails; the sealed record itself.
- **KPIs.** Total decision-chain time (trigger → sealed decision); refusal rate for un-
  entitled attempts (should be caught 100 %); record recompute-verifiability = 100 %.
- **Acceptance criteria.** (a) No record is sealed without identity + reason + entitlement;
  (b) the record carries the input hash and applies-at time; (c) the hash is recomputable
  with any SHA-256 tool; (d) the record is class OPERATOR_DECISION and the in-force plan is
  APPROVED_PLAN.

---

## WF-SPEC-6 — Regional coordination (multi-reservoir cascade)

**Catalog:** WF-03, WF-05 across reservoirs. **Escalation:** L2 → L3. **Primary screen:** S-01, S-06 (cascade).

- **Actors.** P-04 Regional/Authority Coordinator (primary), P-03 each Plant Manager,
  P-08 Power Dispatch (consulted for generation impact).
- **Goals.** Coordinate the four-reservoir cascade (A Vương, Sông Bung 4, Đắk Mi 4, Sông
  Tranh 2) so their releases combine to cut the governing-gauge peak without one reservoir's
  release defeating another's, and within each reservoir's own safety envelope.
- **Inputs.** Per-reservoir state and routing; each reservoir's downstream influence weights
  on Ái Nghĩa / Câu Lâu / Giao Thủy; the combined downstream superposition.
- **Outputs.** A cascade-level view of how the individual `RECOMMENDATION` packages combine;
  the net downstream effect at each control point; conflicts flagged where releases add
  adversely.
- **Domain entities.** The four Reservoirs, the three governing Gauges, the influence-weight
  matrix (`resW`), the cascade routing.
- **Lifecycle classes produced.** `RECOMMENDATION` (the coordinated proposal set). Each
  constituent still requires its own accountable approval (no basin-wide auto-approve).
- **State transitions.** Per reservoir as WF-SPEC-4; regionally, escalation is the max of the
  constituent levels; a dam-safety alarm at any reservoir is never grouped away.
- **Decision points.** Whether the cascade combination reduces the net peak (superposition
  can be adverse); which reservoir carries the drawdown when several could; generation-loss
  acceptability (D-15 dispatch consult).
- **Human approvals.** Each reservoir's release is approved by its own accountable role;
  regional coordination advises but does not override a plant's or the authority's decision
  rights. No single "approve all" that bypasses per-reservoir RACI.
- **Data sources.** Per-reservoir routing (MODELLED), the influence-weight matrix (calibrated
  constant), dispatch generation availability (design target).
- **Visualisations.** The cascade on the map with all four reservoirs and their routed
  contributions to each gauge; a superposition chart at the governing gauge; per-reservoir
  decision markers so the coordinator sees which are recommendations vs approved.
- **User interactions (from the map).** Select any reservoir → its package; select a gauge →
  the decomposed contribution of each reservoir to its stage; compare the combined MPC vs
  rule at the control point.
- **Failure cases.** A release at one reservoir cancelling another's benefit (mitigation:
  superposition shown, not per-reservoir in isolation); a basin-wide approval bypassing
  per-reservoir accountability (mitigation: no cross-reservoir auto-approve); a dam-safety
  condition hidden by storm grouping (mitigation: dam-safety alarms exempt from grouping).
- **Audit trail.** Each constituent `package.generated` and `decision.*`; the coordination
  view is read-only and logs `view.cascade` only.
- **KPIs.** Net peak cut at the governing gauge (m); number of adverse-superposition
  conflicts surfaced; generation loss vs flood benefit (indicative).
- **Acceptance criteria.** (a) The net downstream effect is the superposition, not a single
  reservoir; (b) each release retains its own RACI approval; (c) dam-safety alarms are never
  grouped; (d) recommendations and approved plans are visually distinct per reservoir.

---

## WF-SPEC-7 — Government approval (the authority gate)

**Catalog:** WF-07, WF-08 (authority stage). **Escalation:** L3. **Primary screen:** S-05, S-07 (record).

- **Actors.** P-04 Provincial/City Authority (accountable for D-03/D-04/D-05/D-10/D-11);
  P-07 Dam Safety (accountable for D-06/D-07 emergency); P-02/P-01 (responsible, execute).
- **Goals.** Ensure the artifacts that carry legal and life-safety weight — pre-flood
  drawdown, spill increase, operating above the ceiling, evacuation orders — are approved by
  the office actually accountable for them, and that the approval is a defensible record.
- **Inputs.** The decision package (`RECOMMENDATION`); the RACI table (`js/roles.js`
  DECISIONS D-01…D-16); the approving actor's role; a reason of record.
- **Outputs.** An `APPROVED_PLAN` in force (drives operations) plus the sealed
  `OPERATOR_DECISION` record; or a logged `decision.refused` naming the role that *should*
  decide if an un-entitled office attempts it.
- **Domain entities.** The decision, the RACI mapping, the actor, the record, the audit log.
- **Lifecycle classes produced.** `OPERATOR_DECISION` (the act) and `APPROVED_PLAN` (the
  in-force result). The boundary from RECOMMENDATION is crossed only here.
- **State transitions.** RECOMMENDATION → (entitled approval) → APPROVED_PLAN; un-entitled
  attempt → refused + logged, artifact stays RECOMMENDATION.
- **Decision points.** Does the signed-on role's entitlement (`can(decision)`) match the
  decision's accountable role? Pre-flood drawdown D-03 → P-04 Authority; emergency spill
  D-06 → P-07 Dam Safety; a reservoir engineer may *propose* (`canPropose`) but not *decide*.
- **Human approvals.** The authority approval itself — the single most consequential human
  action in the platform, and the one the audit trail is built around.
- **Data sources.** The frozen input snapshot; the RACI table; the legal corpus.
- **Visualisations.** The decision panel; on approval the lifecycle marker flips
  RECOMMENDATION (amber) → APPROVED_PLAN (cyan, in force); the sealed record document with
  the hash-verification block.
- **User interactions (from the map).** The accountable actor selects themselves, enters the
  reason, approves; the record can be printed/exported for the file.
- **Failure cases.** The wrong office approving (mitigation: RACI gate refuses and names the
  accountable role); the record generating evidence against the buyer (acknowledged risk
  R-24 — just-culture terms, customer-owned log); a recommendation shown as in force before
  approval (mitigation: `scripts/verify-lifecycle.mjs` proves the marker distinction).
- **Audit trail.** `decision.approve` (entitled) or `decision.refused` (un-entitled) with
  required vs actual role; the sealed record; the applies-at time.
- **KPIs.** Entitlement-refusal catch rate = 100 %; approval-to-in-force latency; record
  completeness (identity, role, reason, hash, applies-at all present).
- **Acceptance criteria.** (a) Only the accountable role can move a decision to APPROVED_PLAN;
  (b) an un-entitled attempt is refused and logged, not silently dropped; (c) the in-force
  plan is class APPROVED_PLAN and only it is actionable; (d) the record is recomputable.

---

## WF-SPEC-8 — Public warning

**Catalog:** WF-09, WF-11. **Escalation:** L3. **Primary screen:** S-07 (record), S-08 (zones).

- **Actors.** P-04 Authority (issues, accountable D-14 public information); P-01 Operator
  (drafts from the record); P-09 Citizen (recipient).
- **Goals.** Turn one approved decision into consistent guidance across every channel — the
  phone script, SMS, Zalo, loudspeaker, public card, CAP feed — so no two messages
  contradict, and the shelter guidance matches what evacuation planning can actually deliver.
- **Inputs.** The `APPROVED_PLAN` or a threshold crossing; the addressed zones (worst-status);
  the capacity-aware shelter allocation (`F.allocateShelters`); road-closure windows; the
  P(exceed) likelihood band.
- **Outputs.** A single notification record rendered to every channel from one source;
  per-channel scripts; the CAP JSON; a dispatch log of what *would* be sent (sandbox — this
  build never transmits).
- **Domain entities.** The notification record, the recipient matrix (plant/dam-safety/
  authority/communes/emergency/dispatch/media/public), Shelter (allocation), Road (windows).
- **Lifecycle classes produced.** The warning derives from an `APPROVED_PLAN` (release) or an
  `OBSERVED`/`FORECAST` threshold; the warning itself is an operational artifact of the
  approved decision, never an un-reviewed AI output.
- **State transitions.** Warning type by trigger: threshold · release · passthrough (buffer
  exhausted) · evacuation · dam-emergency. Alert level is re-derived from the quoted stage at
  the quoted gauge so the message can never say "10.2 m, above AL1 by 0.03 m".
- **Decision points.** Which shelter to name — the one the capacity-aware allocation actually
  places the addressed zone at (where there is room), never merely the nearest; when no
  reachable capacity remains, drop the shelter name and say vertical refuge / await rescue.
- **Human approvals.** Public information release is D-14, accountable to P-04. The record is
  the approved artifact; the channel scripts are rendered, not re-authored per channel.
- **Data sources.** The decision record (the single source), the shelter allocation, the road
  graph, the ensemble likelihood.
- **Visualisations.** The record document; the per-channel preview; the addressed zones lit
  on the map; shelters and their capacity state; road-closure windows.
- **User interactions (from the map).** Select the addressed zones; open the notification
  record; preview each channel; the shelter named in the message is the one highlighted on
  the map.
- **Failure cases.** Per-channel variants drifting apart (mitigation: one record → every
  channel, `NF.render`); naming a full/unreachable shelter (mitigation: capacity-aware
  selection, `scripts/verify-warning-shelter.mjs`); SMS non-ASCII or truncated (mitigation:
  unaccent + ≤160-char parts, self-test); a warning that promises room that is not there
  (mitigation: vertical-refuge wording when unsheltered).
- **Audit trail.** `notify.dispatch` (sandbox) per recipient; `alarm.raise`/`ack`; the
  notification record with its source decision id.
- **KPIs.** Notification acknowledgement rate; per-channel consistency (100 % rendered from
  one record); shelter-guidance accuracy (named shelter has allocated places for the zone).
- **Acceptance criteria.** (a) Every channel is rendered from one record; (b) the alert level
  matches the quoted stage; (c) the named shelter has non-zero allocated places for the
  addressed zone, else refuge wording; (d) the SMS is ASCII and un-truncated.

---

## WF-SPEC-9 — Emergency response

**Catalog:** WF-10. **Escalation:** L3 → L4. **Primary screen:** S-08 (zones), S-01 (map).

- **Actors.** P-05 Emergency Commander (primary, accountable D-10 evacuation via authority),
  P-01 Operator (state), P-09 Citizen (affected).
- **Goals.** Move people out of harm before their routes close — allocate the exposed
  population to reachable shelters within capacity, identify communities that will isolate
  and by when, and pre-position for the ones that go first.
- **Inputs.** Per-zone graded exposure (impact-model §3.1); route viability judged at the
  time of use; shelter validity vs the inundation footprint; isolation times
  (`zoneIsolatesAt`); assisted-evacuation register.
- **Outputs.** A capacity-aware shelter allocation (per-zone placements + the basin
  unsheltered shortfall); per-zone actions; isolation deadlines; the vertical-refuge
  instruction where no shelter is reachable.
- **Domain entities.** MonitoredZone (exposure/status/isolation), Shelter (validity/capacity),
  EvacuationRoute (viability/open-until), EmergencyTeam (reachable zones, design target).
- **Lifecycle classes produced.** The allocation is `SIMULATION`-derived planning; the
  evacuation *order* is an `APPROVED_PLAN` (D-10, authority-accountable). No AI auto-order.
- **State transitions.** Zone → CRITICAL on isolation or shelter-invalid; shelter → invalid
  when its refuge level floods or all access is cut; route → closed at the time depth on the
  path exceeds 0.30 m within the travel window.
- **Decision points.** Which shelter each zone goes to (capacity-aware, nearest-first with
  overflow); when to pre-position for a single-access community (before it isolates); when to
  switch a zone from horizontal evacuation to vertical refuge (no reachable capacity).
- **Human approvals.** The evacuation order (D-10) is accountable to the authority; the
  commander directs execution. The order is a public warning (WF-SPEC-8).
- **Data sources.** The simulation (SIMULATION), the shelter register (ASSUMED planning
  figures), the road graph, the assisted-evacuation register (design target).
- **Visualisations.** Zones ranked by urgency (isolation first) on the map; shelters with
  capacity state; the basin shelter-demand line (exposed / reachable / unsheltered); route
  closure windows; single-access communities flagged.
- **User interactions (from the map).** Select a zone → its allocation, isolation time, and
  the shelter it is directed to; select a shelter → its capacity and who is placed there;
  read the basin unsheltered count.
- **Failure cases.** Routing more people to a shelter than it holds (mitigation: capacity is
  consumed, overflow spills, `scripts/verify-shelter.mjs`); telling an isolated zone to
  travel (mitigation: isolated → vertical refuge + boat/air); the headline "everyone has a
  shelter" when they do not (mitigation: the unsheltered shortfall is surfaced, not hidden);
  dropping the community that isolates first from a truncated list (mitigation: single-access
  zones always listed).
- **Audit trail.** `alarm.raise` (isolation/buffer/dam); the evacuation record; `zone`
  status transitions; the allocation snapshot.
- **KPIs.** Isolated communities identified before isolation; unsheltered count (minimise);
  assisted-evacuation lead time; time from order to zone acknowledgement.
- **Acceptance criteria.** (a) No shelter is allocated beyond capacity and the arithmetic
  closes; (b) the basin unsheltered shortfall is shown; (c) isolated zones get refuge, not a
  travel instruction; (d) exposure is graded, not binary.

---

## WF-SPEC-10 — Post-event replay

**Catalog:** WF-12. **Escalation:** L0 (retrospective). **Primary screen:** S-09 (replay), S-07 (record).

- **Actors.** P-02 Hydrologist (primary), P-04 Authority (review), P-06 Forecaster (skill
  assessment), all roles (accountability review).
- **Goals.** Reconstruct exactly what was known and decided at each moment — the observed
  state, the forecast then in force, the recommendation shown, the decision sealed, the plan
  executed — so the event can be learned from and the product's own errors published.
- **Inputs.** The sealed decision records (each with its frozen input snapshot and hash); the
  scenario timeline; the observed vs forecast vs simulated series; the notification log.
- **Outputs.** A replayable timeline with each decision pinned at its sim-time; a hindcast
  skill read (forecast vs what happened); a "what the operator saw when they clicked" view;
  a post-season report including where the system was wrong.
- **Domain entities.** The decision records, the input snapshots, the event timeline
  (`FT.domain.events`), the hydrograph history.
- **Lifecycle classes produced.** All six, replayed in place: `OBSERVED` (past), `FORECAST`
  (as issued), `SIMULATION` (as run), `RECOMMENDATION` (as shown), `OPERATOR_DECISION` (as
  sealed), `APPROVED_PLAN` (as in force). Replay must preserve each artifact's original class.
- **State transitions.** Scrub the timeline; each decision record surfaces at its
  `created_at_sim`; the derived event timeline is deterministic (replay reproduces it
  exactly — self-test invariant).
- **Decision points.** Retrospective only: was the decision defensible on what was known
  then? Was the forecast skilful? Where did the model diverge from reality?
- **Human approvals.** None operational; the post-season report is authored and published,
  including honest disclosure of the system's misses.
- **Data sources.** The append-only record ledger; the hash-verified snapshots; the scenario
  hydrology; the notification log.
- **Visualisations.** The replay timeline with decision pins; the record document with its
  hash-verification block; observed-vs-forecast overlays; the event log, each entry
  clickable to jump to its sim-time.
- **User interactions (from the map).** Scrub to any moment; click a decision pin → the exact
  input snapshot the operator acted on; replay a policy comparison; export the record set.
- **Failure cases.** A record altered after the fact (mitigation: the input hash is
  recomputable and the ledger is append-only, `scripts/verify-record.mjs`); the replay
  showing today's numbers instead of what was known then (mitigation: the frozen snapshot,
  sealed at click time); the derived timeline being non-deterministic (mitigation: self-test
  reproduces it exactly); a record re-classed on replay (mitigation: lifecycle class is on
  the artifact, not recomputed).
- **Audit trail.** The whole ledger *is* the audit trail; replay is read-only and logs
  `replay.open` only. Each record carries schema version, app/model/data versions.
- **KPIs.** Record recompute-verifiability = 100 %; forecast skill (hindcast Brier/CRPS,
  design target); publication of misses (a published-honesty metric).
- **Acceptance criteria.** (a) Every decision replays with the exact input it was made on;
  (b) the hash recomputes with any SHA-256 tool; (c) the derived event timeline is
  deterministic; (d) each replayed artifact keeps its original lifecycle class.

---

## Verification evidence

This specification defines the production target; it does not pretend that the reference demo
already implements every criterion. `PARTIAL` means the named behavior is observable and gated in
the demo while the row's missing production dependency remains open. The cross-repository gates
live in `SkyLabs_SURF2026/scripts/`; app gates live in this repository's `tests/`.

| Workflow | Current status | Executable evidence | Remaining production evidence |
|---|---|---|---|
| WF-SPEC-1 | PARTIAL | `tests/e2e.mjs` (WF-01 provenance/data-health behavior) | Live SCADA ingestion, drift detection against a reference instrument, and sealed two-party handover |
| WF-SPEC-2 | PARTIAL | `tests/e2e.mjs` forecast workflow; `SkyLabs_SURF2026/scripts/verify-r33.mjs` | Named operational forecast feed, skill monitoring, and antecedent-state calibration |
| WF-SPEC-3 | PARTIAL | `tests/physics-conservation.mjs`; `tests/e2e.mjs`; boot physics invariants | Event calibration, independent hydraulic validation, and production-resolution runtime evidence |
| WF-SPEC-4 | PARTIAL | `tests/e2e.mjs`; `SkyLabs_SURF2026/scripts/verify-lifecycle.mjs`; `verify-record.mjs` | Approved operating-rule encoding, live constraints, and independent optimisation review |
| WF-SPEC-5 | PARTIAL | `tests/e2e.mjs` RACI paths; `verify-lifecycle.mjs`; `verify-record.mjs` | Production identity provider, qualified electronic signatures, and statutory retention decision |
| WF-SPEC-6 | PARTIAL | `tests/e2e.mjs` cascade/decision workflows; physics superposition invariants | Signed inter-reservoir data agreements and calibrated travel-time/routing model |
| WF-SPEC-7 | PARTIAL | `tests/e2e.mjs` authority gate; `verify-lifecycle.mjs`; `verify-record.mjs` | Legally accepted signing method, authority directory, and deployment-specific delegation policy |
| WF-SPEC-8 | PARTIAL | `verify-grounding.mjs`; `verify-warning-shelter.mjs`; `tests/e2e.mjs` | Official warning-authority integration, delivery receipts, acknowledgement escalation, and CAP transport |
| WF-SPEC-9 | PARTIAL | `verify-exposure.mjs`; `verify-shelter.mjs`; `verify-warning-shelter.mjs` | Live population/resource registers, route telemetry, and field-confirmed evacuation status |
| WF-SPEC-10 | PARTIAL | `verify-record.mjs`; `tests/e2e.mjs` replay/record behavior | Immutable operational event store, observed high-water marks, and after-action publication workflow |

The documentation gate `node tests/workflow-spec-verify.mjs` checks the ten workflow names,
all 150 required schema fields, lifecycle classes, AI/human authority invariants, map-first
execution contract, cross-reference IDs, evidence rows, reviewer perspectives, and checklist state.

---

## Review — seven perspectives

Each reviewer signs that the spec is implementable and internally consistent from their seat.

- **Reservoir Operator (P-01/P-02).** The decision package leads with the peak cut, names the
  binding constraint, and never relaxes an infeasible plan; approval needs my identity, a
  reason, and the entitled role. WF-SPEC-4/5 match how a real shift decides. *Consistent.*
- **Regional Coordinator (P-04).** The cascade shows superposition at the governing gauge, not
  per-reservoir in isolation, and no basin-wide approval bypasses per-reservoir accountability
  (WF-SPEC-6). *Consistent.*
- **Emergency Manager (P-05).** Shelter guidance is capacity-honest, the unsheltered count is
  surfaced, isolated zones get refuge not a travel order, and the communities that isolate
  first are never dropped from the list (WF-SPEC-9). *Consistent.*
- **Government Authority (P-04).** The artifacts that carry legal weight can only reach
  APPROVED_PLAN through the accountable office; an un-entitled attempt is refused and logged;
  the record is a defensible, recomputable document (WF-SPEC-5/7). *Consistent.*
- **GIS Engineer.** Every workflow is executable from one map surface; entities carry real
  coordinates; depth is five bands, exposure is graded; the simulation is SIMULATION-classed
  and never actionable (WF-SPEC-1/3/9, section 0.1). *Consistent.*
- **UX Designer.** No workflow requires leaving the map; recommendations and approved plans
  are visibly distinct (amber vs cyan); nothing reads as operational until approved; the
  decision surface is summoned over the map, not a separate CRUD page (section 0.1/0.2).
  *Consistent.*
- **Principal Software Engineer.** The 150-field document contract and cross-references are
  executable through `tests/workflow-spec-verify.mjs`. Runtime acceptance is not overstated:
  the evidence table separates gated demo behavior from missing production integrations and
  domain validation. The lifecycle classes remain a pure module with one source of truth.
  *Consistent, testable, and status-honest.*

---

## Verification checklist

- [x] Every workflow lists all fifteen schema elements.
- [x] Every workflow states which lifecycle classes it produces and that only APPROVED_PLAN
      is actionable.
- [x] Current executable evidence is separated from remaining production evidence per workflow.
- [x] Cross-references (WF, P, D, S) resolve to real IDs; KPI definitions resolve to the KPI catalog.
- [x] No workflow requires navigating away from the map.
