# Product Requirements Document

Every feature: purpose, business value, user value, workflow, acceptance criteria, edge cases, failure cases, KPIs, future evolution.

**Priority:** `P0` foundation — nothing else is honest without it · `P1` core decision support · `P2` scale and depth.
**Traceability:** each requirement cites the failure-library item or foundation section that justifies it. A requirement with no citation is decoration and should be cut.

Screens in [screen catalog](02-screen-catalog.md) · engine in [decision engine](../04-decision-support/01-decision-engine-spec.md) · NFRs in [NFR](05-non-functional-requirements.md).

---

# Theme A — Honesty foundation (P0)

## FR-01 — Quantity envelope

**Purpose.** Every displayed quantity carries provenance, timestamp, age, quality, uncertainty, source and version.
**Business value.** The precondition for auditability, and the difference between a dashboard and a decision-support product.
**User value.** P-02 can tell measurement from model from assumption at a glance.
**Workflow.** All.
**Acceptance criteria.**
1. Every numeric display in the product renders from a quantity object carrying all eight envelope fields ([entity model §7](../01-domain-model/01-entity-model.md#7-cross-cutting-field-contract)).
2. Provenance is visually encoded (measured / forecast / modelled / assumed / synthetic) without requiring hover.
3. Age is displayed whenever it exceeds the per-signal threshold.
4. A quantity with `quality != OK` is visually degraded and cannot silently enter a proposal.
5. Exports carry the envelope.
**Edge cases.** Derived quantities inherit the worst quality of their inputs. Composite quantities list all sources.
**Failure cases.** A raw number rendered without an envelope is a build-breaking defect, caught by a lint rule.
**KPIs.** 100 % of displayed quantities enveloped; zero un-enveloped renders in review.
**Future.** Per-field lineage graph in S-18.
*Justification: [failure library §4](../00-foundations/10-failure-library.md) "the confident single number".*

## FR-02 — Data health and operating levels

**Purpose.** Show what the product is actually seeing, and degrade explicitly.
**Business value.** Prevents the worst liability event: confident advice on absent data.
**User value.** P-01/P-02 know when to trust the screen.
**Workflow.** All; [DT-7](../03-operations/02-decision-trees.md).
**Acceptance criteria.**
1. Operating level L0–L4 computed each cycle and displayed in the global chrome on every screen.
2. S-13 lists every feed with freshness, quality and redundancy state.
3. At L2 the affected optimiser is disabled and a banner names what is missing and what is therefore not computed.
4. **At L4 the product refuses to produce a proposal** and shows the EAP, contact tree and static inundation maps instead.
5. Stale signals render as chart gaps, never as flat lines.
**Edge cases.** Late-arriving backfill triggers re-evaluation and is shown as a revision, with both versions in the audit.
**Failure cases.** Silent substitution of a default for a missing input is forbidden and is a defect class.
**KPIs.** Time-to-detect a feed outage < 1 cycle; zero proposals emitted at L4.
**Future.** Predictive feed-failure warning.
*Justification: [observation model §5](../01-domain-model/03-observation-model.md); [failure library §3 #9](../00-foundations/10-failure-library.md).*

## FR-03 — Mode marking (live / replay / what-if / training)

**Purpose.** Make it structurally impossible to mistake a simulation for reality.
**Business value.** Eliminates a catastrophic and entirely avoidable class of incident.
**User value.** Everyone always knows what they are looking at.
**Workflow.** All.
**Acceptance criteria.**
1. Mode is displayed in the global chrome, with a coloured frame for non-live modes.
2. Training mode applies a diagonal watermark to every screen **and to every exported file**.
3. Training mode cannot reach the real notification path — enforced by a separate sandbox transport, not by a warning.
4. Leaving training mode requires explicit confirmation and is logged.
5. Any artefact derived from `SYNTHETIC` data is watermarked in the file.
**Edge cases.** A what-if promoted to a proposal carries its assumptions and loses the amber frame only on approval.
**Failure cases.** A published artefact without its mode marker is a P0 incident.
**KPIs.** Zero unmarked non-live artefacts.
*Justification: [simulation §1](../04-decision-support/03-simulation-and-scenarios.md).*

## FR-04 — Audit trail

**Purpose.** Reconstruct exactly what was known, shown, decided and sent, at any past instant, forever.
**Business value.** The strongest commercial argument and the strongest moat ([strategy §8](01-product-strategy.md)).
**User value.** Every persona will be asked to justify a decision.
**Workflow.** All; WF-12.
**Acceptance criteria.**
1. Append-only, tamper-evident log; no record is ever mutated or deleted.
2. Every record: UTC + ICT timestamps, actor identity, action, entity, input snapshot hash, model/threshold/rulebook versions.
3. S-18 replays the exact screen state at any past instant.
4. Every notification is recorded with channel, content, delivery and acknowledgement.
5. Inquiry export produces a complete, verifiable package.
6. Retention meets the statutory record-keeping period.
**Edge cases.** Clock skew is recorded; offline actions sync with both local and server times preserved.
**Failure cases.** An unreconstructable decision is a P0 defect.
**KPIs.** 100 % of decisions reconstructable; event report auto-generated < 1 h after all-clear.
*Justification: [regulatory §6](../00-foundations/08-regulatory-vietnam.md#6-liability-evidence-and-the-audit-trail); [failure library §3 #16](../00-foundations/10-failure-library.md).*

## FR-05 — Identity, roles and decision rights

**Purpose.** Model who is allowed to decide what.
**Business value.** Legal defensibility; enables the approval workflow.
**User value.** Recommendations reach the person who can act.
**Workflow.** All.
**Acceptance criteria.** Users, roles, organisations and command levels are configurable per deployment · every approval records an identified human · a user cannot approve outside their rights · escalation level determines the active command level and it is displayed · a certified-operator requirement is enforceable per decision type.
**Edge cases.** Delegation during shift handover; emergency pre-authorisation at L4/L5 (recorded, not blocked).
**Failure cases.** Anonymous approval is forbidden.
**KPIs.** 100 % of decisions attributed.
*Justification: [decision rights](../02-stakeholders/02-decision-rights-raci.md).*

---

# Theme B — The decision (P0–P1)

## FR-10 — Decision package

**Purpose.** One artefact containing everything needed to make and defend a release decision.
**Business value.** The core product. Compresses `t_analysis` and `t_approval` ([warning §2](../00-foundations/07-warning-and-emergency-management.md)).
**User value.** P-02 gets a defensible proposal; P-03/P-04 get something they can sign.
**Workflow.** WF-03, WF-04, WF-05, WF-07.
**Acceptance criteria.**
1. Contains all fields of the proposal contract ([decision engine §6](../04-decision-support/01-decision-engine-spec.md)) — actions (all six fields), constraint list, feasibility, outcome with quantiles, **counterfactual**, ≥ 2 alternatives, regret both ways, deadline, confidence, κ, explanation, model versions, snapshot hash.
2. Approve / Modify / Reject / Defer, each requiring a reason of record enterable in ≤ 30 s.
3. One click to a printable, signable page.
4. Generated in < 60 s.
5. **An infeasible proposal is still emitted**, marked infeasible, with the binding constraint and the authority who could accept an exception.
**Edge cases.** No feasible plan → the three least-bad options with the constraint each breaks. Δpeak inside forecast error → the honest-null recommendation "follow the rule curve".
**Failure cases.** A package without a counterfactual must not render. Silent constraint relaxation is a P0 defect.
**KPIs.** Median time from package open to decision < 5 min; ≥ 90 % of decisions carry a reason of record.
*Justification: [res-ops §7](../00-foundations/04-reservoir-operations.md); [failure library §3 #15, §4](../00-foundations/10-failure-library.md).*

## FR-11 — Honest-null and infeasibility reporting

**Purpose.** The product must be able to say "do nothing" and "nothing works".
**Business value.** The single strongest trust signal with engineers ([personas P-02](../02-stakeholders/01-personas.md)).
**User value.** No wasted action; no false confidence.
**Acceptance criteria.** When `Δpeak < ⟨0.15 m⟩` the recommendation is explicitly "follow the rule curve", with the reason · when no plan satisfies the hard constraints the output is an infeasibility report · neither is presented as a failure of the product.
**Failure cases.** An optimiser that always returns a green plan is a defect, not a feature.
**KPIs.** Honest-null rate is tracked and reported; it should be non-zero in any real season.

## FR-12 — Constraint engine with feasibility proof

**Acceptance criteria.** All of C1–C13 evaluated per candidate, per timestep, per ensemble member · each returns PASS/FAIL/MARGINAL with a margin · hard violations mark the proposal infeasible · relaxations are reported and audited · C9 (downstream cap) is evaluated on the **routed, tide-aware** arrival, not at the dam.
**Edge cases.** Conflicting constraints; constraints that become binding mid-schedule.
**Failure cases.** Evaluating C9 at the dam rather than at the control point is the classic silent error.
*Justification: [res-ops §4](../00-foundations/04-reservoir-operations.md) failure #2.*

## FR-13 — Counterfactual

**Acceptance criteria.** Every proposal computes and displays the no-action trajectory with the same quantiles and impact metrics · shown adjacent to the proposal, never behind a click.
**User value.** The only way to judge a recommendation, before or after the event.

## FR-14 — Controllability indicator κ

**Purpose.** State whether reservoir operation can materially change this flood.
**Acceptance criteria.** κ computed per control point per timestep · displayed on S-01 · when `κ < 0.3` the product states that the flood is not controllable by reservoir operation and switches emphasis to warning and evacuation timing ([DT-1](../03-operations/02-decision-trees.md)).
**KPIs.** Operator survey: "did the product tell you when you had no power to change it?"
*Justification: [hydrology §6](../00-foundations/02-hydrology.md#6-sub-catchment-decomposition-why-one-basin-number-is-useless).*

## FR-15 — Gate-realisable releases

**Acceptance criteria.** Target discharge is snapped to the discrete gate-realisable set · configurations are symmetric about the spillway centreline · `n−1` gate failure tolerance is verified · the achievable discharge set is visible so the operator sees the granularity of their own plant.
**Edge cases.** A gate in maintenance changes the achievable set; a hoist power fault removes options.
*Justification: [res-ops §5](../00-foundations/04-reservoir-operations.md).*

## FR-16 — Decision deadline countdown

**Purpose.** Convert a forecast into a clock.
**Business value.** The highest-leverage lead-time compression in the product.
**Acceptance criteria.** `deadline = hazard_arrival − Σ(chain components)`, all components configurable and displayed on hover · countdown in the global chrome on every screen · on expiry it turns red and **names the options now foreclosed** rather than disappearing · the chain components are measured from real exercises and updated.
**Failure cases.** A deadline that silently vanishes is worse than none.
*Justification: [decision rights §4](../02-stakeholders/02-decision-rights-raci.md); [warning §2](../00-foundations/07-warning-and-emergency-management.md).*

## FR-17 — Safety margins panel

**Acceptance criteria.** Freeboard (m), `dZ/dt` (smoothed, window stated), time-to-ceiling/FSL/design, and the dam-safety monitor state are displayed together on S-06 and never aggregated into a score · time-to-threshold appears only when `dZ/dt > 0`.
*Justification: [dam safety §3](../00-foundations/05-dam-safety.md).*

## FR-18 — Dam safety monitor with veto

**Acceptance criteria.** Runs on the same state through an independent path · never contributes a term to the objective function · can mark any proposal rejected-on-safety-grounds · its alarms are never grouped, deduplicated or auto-cleared · crossing a safety threshold disables the optimiser and says so ([DT-6](../03-operations/02-decision-trees.md)) · gate commanded ≠ actual is a critical alarm.
**Failure cases.** Any UI that offers a downstream-impact-versus-dam-safety trade is defective.

## FR-19 — Velocity and hazard rating

**Acceptance criteria.** Depth and velocity produce `HR = h(v+0.5)+DF` per cell, classified into four bands · fast shallow water is shown as hazardous.
*Justification: [hydraulics §6](../00-foundations/03-hydraulics-and-routing.md).*

---

# Theme C — Warning and response (P1)

## FR-20 — Notification workflow from a single decision record

**Purpose.** All channel messages generated from one record so they cannot diverge.
**Business value.** Structurally eliminates the most corrosive real-world failure.
**Workflow.** WF-09.
**Acceptance criteria.**
1. One decision record renders all channel variants (phone script, SMS, Zalo, loudspeaker script, siren code, CAP, media, app, public web).
2. One approval covers the whole set.
3. Delivery tracked per channel; **acknowledgement** tracked per recipient.
4. Non-acknowledged escalates automatically per [communication §4](../03-operations/03-communication-protocols.md).
5. Every contact has a backup; an EAP without backups cannot be marked valid.
6. Notification lead time is enforced as a blocking check before any release increase (below L5).
**Edge cases.** Channel outages; night-time delivery; recipients on leave.
**Failure cases.** Hand-authored per-channel text is forbidden by design.
**KPIs.** Acknowledgement rate; median time from decision to full dissemination; zero cross-channel numeric discrepancies.
*Justification: [failure library §3 #8, #11](../00-foundations/10-failure-library.md).*

## FR-21 — Impact-based warning

**Acceptance criteria.** Warning colour derives from likelihood × impact ([warning §4](../00-foundations/07-warning-and-emergency-management.md)), not from threshold crossing alone · every technical quantity has a plain-language equivalent · BĐ level and impact statement are always shown together.

## FR-22 — Time-aware route viability

**Acceptance criteria.** Routes evaluated against the **forecast** flood state at the time of use · presented as "open until ~HH:MM (±1 h)", never binary · evacuation start times derived from `open_until − travel − assembly` · re-evaluated each cycle with re-notification on change.
**Failure cases.** Directing people onto a road that will be cut is the defining failure of this feature.
*Justification: [failure library §3 #12](../00-foundations/10-failure-library.md); [exposure §2 E-31](../01-domain-model/04-exposure-and-impact-model.md).*

## FR-23 — Shelter register and validation

**Acceptance criteria.** Shelters carry capacity, elevation, resources, access routes, occupancy · validated at ingest and per event against the inundation footprint · a shelter inside a footprint or with all routes cut is flagged INVALID and cannot be offered.
*Justification: [failure library §3 #13](../00-foundations/10-failure-library.md).*

## FR-24 — Isolation detection

**Acceptance criteria.** A zone is isolated when no path with depth < 0.30 m reaches an EOC, hospital or shelter · isolation is escalated above depth severity in the priority ordering · forecast isolation time is displayed so assets can be pre-positioned.
**User value.** P-05's most operationally important fact.

## FR-25 — Assisted evacuation register

**Acceptance criteria.** Hospitals, elderly, disabled, boarding schools and isolated households are held as restricted, access-logged records · these cases start first, with the longest lead (hospitals 12–48 h) · privacy controls per [regulatory §7](../00-foundations/08-regulatory-vietnam.md).

## FR-26 — Public view

**Acceptance criteria.** Separate build with a separate data policy · no sensitive infrastructure detail · "my area" answer in plain language with landmarks · shelter, route and closure information · issuer and next update time always shown · works on a weak connection with no login · explicit all-clear · **false-alarm explanation published within 48 h**.
**KPIs.** Public trust survey; compliance rate on the following event.
*Justification: [uncertainty §6](../04-decision-support/02-uncertainty-and-confidence.md).*

---

# Theme D — Forecast, simulation, learning (P1–P2)

## FR-27 — Forecast performance and verification

**Acceptance criteria.** S-16 publishes CRPS, Brier, reliability, rank histogram, POD/FAR/CSI, peak stage and timing error, stratified by gauge and lead time · model-error vs forecast-error split · false-alarm ratio and its explanations · **a model/gauge/lead combination with no verification history caps confidence at LOW**.
**Business value.** Credibility with the hydro-meteorological service and with any technical buyer.
*Justification: [meteo §5](../00-foundations/06-meteorology-and-forecasting.md).*

## FR-28 — Ensemble and probability

**Acceptance criteria.** `P(H > BĐn)` as a first-class time series per gauge · fan charts with q10–q90 · worst-credible member (q95–q98) available for planning · **never average time-shifted hydrographs** — enforced in code and in review · confidence grading with reasons and automatic downgrades ([uncertainty §2](../04-decision-support/02-uncertainty-and-confidence.md)).

## FR-29 — Sub-catchment rainfall and antecedent state

**Acceptance criteria.** Rainfall decomposed by sub-catchment, separating controllable (above reservoirs) from uncontrollable · antecedent wetness (API or soil moisture) maintained per sub-catchment with provenance · a forecast without antecedent state is capped at MEDIUM confidence.
**Business value.** The two highest-value hydrological improvements; κ depends on the first.
*Justification: [hydrology §3, §6](../00-foundations/02-hydrology.md).*

## FR-30 — What-if and training mode

**Acceptance criteria.** Editable release schedules, rainfall multiplier and shift, tide phase, antecedent state, failure injection · side-by-side against a baseline · result in < 10 s · promote-to-proposal carrying assumptions · training mode with clock control 1×–60×, instructor injection, full workflow including notification drafting, and a debrief scoring decision latency, constraint violations, notification completeness, honest-null recognition and infeasibility escalation · certification records per user and scenario class.
**Business value.** Frequently the purchasing justification; the safest path to trust before an event.
*Justification: [simulation §7](../04-decision-support/03-simulation-and-scenarios.md).*

## FR-31 — EAP as structured data

**Acceptance criteria.** Triggers held as evaluable expressions and evaluated continuously · contact tree with backups · breach inundation layers pre-computed · when a trigger fires the product presents the exact plan section with pre-filled contacts · `last_exercised_at` tracked and surfaced when stale.
**Business value.** The most defensible feature to a dam safety auditor.
*Justification: [dam safety §5](../00-foundations/05-dam-safety.md).*

## FR-32 — Inundation library

**Acceptance criteria.** Offline-computed mapping `(discharge, tide, breach state) → depth grid`, interpolated at run time in < 500 ms · live 2D reserved for S-12 and labelled · breach scenarios are **never** computed live · library version recorded in every result.
*Justification: [hydraulics §6](../00-foundations/03-hydraulics-and-routing.md); [dam safety §5](../00-foundations/05-dam-safety.md).*

## FR-33 — Post-event review automation

**Acceptance criteria.** ≥ 80 % of the event report auto-generated from the audit trail within 1 h of all-clear · timeline, decisions, notifications, forecast verification, predicted vs observed · high-water-mark survey ingest · calibration feedback · publishable operation record answering "did the dam cause this?" with the pluvial/fluvial split.
*Justification: WF-12; [failure library §2](../00-foundations/10-failure-library.md).*

## FR-34 — Cascade coordination view

**Acceptance criteria.** Combined routed hydrograph from all reservoirs at each control point · per-reservoir contribution decomposition · joint proposals across reservoirs · the diversion and bifurcation shown on both affected rivers · a single-river proposal in a basin with a diversion is rejected by the engine.
*Justification: [basin §3](../01-domain-model/02-basin-vgtb.md); [failure library §3 #6](../00-foundations/10-failure-library.md).*

## FR-35 — Configuration with effective dates

**Acceptance criteria.** Thresholds, BĐ levels, rule curves, constraint parameters, optimiser weights, administrative boundaries and contact trees are all data with `effective_from`, an owner, a source reference and a version · changing any of them is a recorded decision · **no operational constant lives in code**.
*Justification: [regulatory §2, §5](../00-foundations/08-regulatory-vietnam.md); [failure library §4](../00-foundations/10-failure-library.md).*

---

# Theme E — Everyday value (P1)

## FR-40 — Shift handover
Auto-drafted from the last 12 h of state and decisions, human-edited, acknowledged by the incoming shift, stored in the audit. *Low glamour, high daily value; builds the trust that is spent in a crisis.*

## FR-41 — Rule-curve compliance monitoring
Continuous seasonal compliance view; alerts days ahead when the season will start without buffer; marginal is not treated as compliant. *Justification: [failure library §3 #1](../00-foundations/10-failure-library.md).*

## FR-42 — Time-to-full and buffer exhaustion
`time_to_ceiling` displayed per reservoir; the pass-through transition announced as soon as it is unavoidable, with the plain-language statement *"from approximately HH:MM the reservoir can no longer reduce the flood."* *Justification: [res-ops §8](../00-foundations/04-reservoir-operations.md).*

## FR-43 — Inflow cross-check
Mass-balance inflow compared against an independent rainfall-runoff estimate; divergence > 25 % raises a data alarm rather than silently choosing one. *Justification: [hydrology §5](../00-foundations/02-hydrology.md#5-inflow-estimation).*

## FR-44 — Alarm philosophy engine
[DT-8](../03-operations/02-decision-trees.md) implemented: actionability test, deduplication, grouping, storm-suppression, individual acknowledgement with attribution, and dam-safety alarms exempt from all grouping.

## FR-45 — Offline field mode
S-14 fully functional offline with last-known state, prominent data age, one-tap field reporting, and sync-on-reconnect preserving both local and server timestamps.

---

## Requirement → screen → workflow matrix (abridged)

| FR | Screens | Workflows | Priority |
|---|---|---|---|
| 01, 02, 03, 04, 05 | all | all | **P0** |
| 10, 11, 12, 13, 16, 17, 18 | S-01, S-05, S-06 | WF-03/04/05/07/08 | **P0** |
| 14, 15, 19, 28, 42, 43 | S-01, S-03, S-06, S-07 | WF-03/04/05 | P1 |
| 20, 21, 22, 23, 24, 25, 44 | S-02, S-03, S-10, S-14 | WF-09/10/11 | P1 |
| 26, 33, 40, 41, 45 | S-11, S-15, S-14 | WF-01/11/12 | P1 |
| 27, 29, 30, 31, 34, 35 | S-08, S-09, S-12, S-16, S-17 | WF-02/03/12 | P2 |
| 32 | S-03, S-12 | WF-04/08 | P2 |

---

## Explicitly out of scope

| Item | Why |
|---|---|
| Gate actuation / any control path into SCADA | Legal, safety and liability |
| Issuing official forecasts or warnings | Not our authority ([regulatory §4](../00-foundations/08-regulatory-vietnam.md)) |
| Replacing the inter-reservoir operating procedure | It is the law; we operate inside it |
| Claiming rainfall-forecast skill improvements | We consume forecasts; we do not out-forecast the national service |
| Monetary damage figures presented as authoritative | Uncalibrated currency figures destroy credibility |
| Autonomous decision-making of any kind | The product proposes; a human disposes |

---

**Next:** [UX principles →](04-ux-principles.md)
