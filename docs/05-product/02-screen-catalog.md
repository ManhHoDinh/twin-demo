# Screen catalog

Every screen: purpose, primary user, layout, content, states, interactions, and what it must never do.

UX law in [UX principles](04-ux-principles.md) · features in [PRD](03-prd.md) · current implementation status marked per screen.

**Global chrome present on every screen:**
```
┌────────────────────────────────────────────────────────────────────────────┐
│ [MODE: LIVE/REPLAY/WHAT-IF/TRAINING]  Basin ▾   Scenario ▾    ⏱ 14:32 ICT │
│ Escalation: L2 ALERT ▸ trigger    Data: L1 · 34/36 feeds · oldest 12 min   │
│ ⏳ DECISION DEADLINE 01:47                        [user] [role] [org]      │
└────────────────────────────────────────────────────────────────────────────┘
```
Mode, escalation level, data health and the decision deadline are **never** hidden, collapsed or scrolled away.

---

## S-01 — Dashboard (Situation Now)

**Purpose.** The 5-second answer: what is happening, how bad, what am I being asked to do, by when.
**Primary user.** All. Default landing screen, varying by role.

### Screen contract

- **Operational workflow.** Enter from shift handover or an alert → scan basin posture and data health →
  open the active decision, affected map area, or degraded-feed explanation in one action.
- **Required data.** Current clock/mode, escalation, feed health, rainfall/forecast bands, gauge and reservoir
  states, exposure, active proposal, accountable role, deadline, and counterfactual.
- **Map layers.** Current flood depth, reservoirs, control gauges, zones, roads, shelters, active alerts,
  and provenance/confidence cues; the selected item is spatially emphasized.
- **User interactions.** Open a gauge/reservoir/zone inspector, jump to the decision package, acknowledge an
  alarm when authorised, switch view, and scrub the shared timeline without leaving the map shell.
- **Loading.** Render the map and last valid posture first; hydrate each metric independently and show its
  timestamp/progress rather than replacing the screen with a global spinner.
- **Empty states.** Normal posture states that no decision or emergency action is pending while retaining
  monitoring, data health, and the next forecast/update time.
- **Errors.** Name missing or rejected feeds and affected computations; at L4 remove advice and deadline,
  preserve last-known state, EAP contacts, and an explicit unusable status.
- **Accessibility.** Reading order follows posture → deadline → gauges/reservoirs → impact → action; every
  status uses text/shape as well as color and all primary actions are keyboard reachable.
- **Acceptance criteria.** A user can identify mode, escalation, data health, most urgent place, pending
  decision, accountable role, deadline, uncertainty, and counterfactual within one non-scrolling view.

```
┌─ SITUATION ───────────────────────────┬─ DECISION ────────────────────────┐
│ Phase: RISING   Basin alert: BĐ2      │ ⏳ DECIDE BY 16:15  (01:47 left)  │
│ Rain 42 mm/h ↑   κ = 0.48 (partial)   │ Pre-release A Vương 380→900 m³/s  │
│                                        │ from 15:30, ramp 150 m³/s/h      │
│ Ái Nghĩa  8.4 m  ↑0.4 m/h   BĐ2 +0.4  │ Constraints: 9 PASS · C9 MARGINAL │
│   P(BĐ3 in 12h) ████████░░ 72 %        │ Confidence: MEDIUM                │
│ Giao Thủy 7.1 m  ↑0.2      BĐ1 +0.9   │ [ Open decision package → ]       │
│ Câu Lâu   2.6 m  ↑0.1      BĐ1 +0.6   ├─ IF WE DO NOTHING ────────────────┤
│ Cẩm Lệ    1.4 m  →         BĐ1 +0.4   │ Ái Nghĩa peak 9.6 m (BĐ3 +0.6)    │
├─ RESERVOIRS ──────────────────────────┤ 24 000 people · QL1A cut 9 h      │
│ A Vương     92 % ▓▓▓▓▓▓▓▓▓░ ⏱ 6 h     └───────────────────────────────────┘
│   free 28 Mm³ · freeboard 3.2 m       ┌─ IMPACT (q50, q90) ───────────────┐
│ Sông Bung 4 88 % ▓▓▓▓▓▓▓▓░░ ⏱ 11 h    │ People exposed  18 000 – 24 000   │
│ Đắk Mi 4    79 % ▓▓▓▓▓▓▓░░░ ⏱ 19 h    │ Needing evac     3 200 –  5 100   │
│ Sông Tranh 2 71 % ▓▓▓▓▓▓░░░ ⏱ 26 h    │ Homes flooded    4 200 –  6 800   │
│ ⚠ A Vương: buffer exhausted ~21:00    │ Roads closed 6 · Zones critical 3 │
└───────────────────────────────────────┴───────────────────────────────────┘
```

**Must show:** phase · basin alert · rainfall · **κ** · per-gauge stage, trend, BĐ margin, `P(BĐ3)` · per-reservoir % of ceiling, free storage, **freeboard**, **time-to-full** · buffer-exhaustion time · the active proposal with its deadline · **the counterfactual** · impact ranges.

**Must never:** require scrolling for any of the above · hide the deadline · show a point estimate without its range · roll a dam-safety alarm into a summary badge.

**States:** normal · watch · alert · emergency · **degraded (L2+)** — banner naming exactly what is not being computed · **blind (L4)** — no proposal, EAP and contacts instead.

**Status:** ⚠ partially exists (KPI strip, gauge/reservoir/zone lists). Missing: κ, freeboard, time-to-full, `P(BĐ3)`, deadline, counterfactual, impact ranges, data-health chip.

---

## S-02 — Situation (authority view)

**Purpose.** Impact-first, jargon-free view for a committee meeting. **Primary user.** P-04, P-05.

### Screen contract

- **Target users.** Government decision makers and incident commanders who need an impact-first briefing;
  technical advisers may support them without changing the accountable role.
- **Operational workflow.** Open the current briefing → review commune-level consequence and what changed →
  inspect the mapped evidence → record or defer the accountable decision → export a signable brief.
- **Required data.** Approved/common operating picture, forecast intervals, affected population and
  infrastructure, route/shelter state, proposal/counterfactual, decision deadline, provenance, and versions.
- **Map layers.** Administrative areas, flood depth, affected roads, shelters, critical facilities, and the
  spatial footprint of the proposed action and counterfactual.
- **User interactions.** Select a commune, switch proposal/counterfactual evidence, expand limitations,
  open the formal review controls, and print/export the current version.
- **Loading.** Show the latest sealed briefing with its age while newer evidence is assembled; mark each
  updating section and never mix issue times without a warning.
- **Empty states.** No active event shows routine readiness, data health, next update, and unresolved
  preparedness actions rather than an empty committee page.
- **Errors.** If impact translation is unavailable, retain the scientific quantity but state that no
  decision-grade impact interpretation is available; never substitute stale prose as current.
- **Accessibility.** Plain Vietnamese is primary, technical terms link to definitions, tables have row and
  column headers, and print output preserves hierarchy and non-color status cues.
- **Acceptance criteria.** The authority can explain affected places, timing, range, recommended action,
  counterfactual, deadline, confidence, and decision owner without interpreting raw hydrology.

Same underlying numbers as S-01, rendered as: *"Tonight, water is likely to reach 0.8–1.2 m in these six communes between 01:00 and 04:00. About 21 000 people affected; about 4 000 need to move. Three routes will close. Decide on evacuation by 18:00."*

Contains: plain-language summary · commune-by-commune table (people, depth, time, action, shelter, route status) · what changed since the last briefing · the single recommended action with its deadline · a print/export button producing a signable brief.

**Must never** show a technical stage without its impact translation, or a term not defined in the [glossary](../00-foundations/01-glossary.md) plain-language column.

**Status:** ❌ (an LLM-style brief exists; not an authority view).

---

## S-03 — Map

**Purpose.** Spatial truth. **Primary user.** All.

### Screen contract

- **Target users.** All authorised operational roles, with public users served by the separately governed
  public projection rather than the internal map.
- **Operational workflow.** Start from basin extent → locate the active hazard or selected object → inspect
  time-aware evidence → compare/replay if needed → hand off the spatial context to a decision or report.
- **Required data.** Versioned basemap/terrain, hydrology and hydraulic state, asset/zone inventories,
  time-aware route and shelter validity, layer provenance, confidence, and access policy.
- **Loading.** Paint a bounded base map first, then stream scientific and asset layers independently with
  visible freshness; a failed optional tile provider must not block core simulation evidence.
- **Empty states.** No active flood shows the basin, monitoring network, preparedness layers, and scenario
  invitation; a layer with no records explains whether the cause is no exposure, filtering, or missing data.
- **Errors.** Missing current hydraulic output removes the current extent rather than reusing an old one;
  CRS/datum mismatch, render failure, and unavailable sensitive layers are explicit diagnostic states.
- **Accessibility.** Every mapped object has an equivalent keyboard/list route, legends use text and shape,
  focus is visible, and 2D remains a fully usable alternative to 3D.
- **Acceptance criteria.** The map occupies 85–95% of the normal viewport, all operational overlays remain
  contextual, and selecting or scrubbing any supported object yields the same scientific state in 2D/3D.

**Layers** (toggleable, persisted per user): basemap/imagery · terrain · **flood depth (5 discrete bands)** · velocity/hazard rating · impact heatmap (pop × depth) · zones (choropleth by status) · rivers with stage-coloured reaches · reservoirs with level glyphs · gauges with BĐ colouring · roads with closure state and `open until` · bridges · buildings (flood-coloured) · shelters (valid/invalid) · hospitals/schools/critical infrastructure · evacuation routes · emergency teams · sensors with health · **isolated communities** · landslide susceptibility · administrative boundaries (with vintage) · place labels.

**Interactions.** Pan/zoom to street level · click any feature → detail card · time scrub (the map follows the timeline) · **compare mode** (policy A vs B, or forecast vs observed) · draw a query area → exposure summary · focus/kiosk mode.

**Must never:** use a continuous depth ramp · show a route as simply "open" without a time horizon · display sensitive infrastructure detail in the public build.

**2D vs 3D.** 2D is the working surface — dense, fast, precise. 3D is for briefing, public communication and situational comprehension. **Neither is the decision surface.** The decision is made on S-01/S-05.

**Status:** ✅ strong — real DEM/imagery, deep zoom to ~0.14 m/px, depth bands, zones, impact heatmap, roads with closures, buildings from OSM, 3D drape with detail overlay. Missing: shelters, routes, teams, sensors, isolation, hazard rating, `open until`, admin vintage.

---

## S-04 — Timeline

**Purpose.** Move through time; see the sequence of events and decisions.

### Screen contract

- **Target users.** Operators, coordinators, emergency managers, reviewers, trainers, and analysts using
  the shared incident clock.
- **Operational workflow.** Inspect now → scrub or play to a forecast/replay time → jump to an event or
  decision marker → verify the map/object state → export or return to live posture.
- **Required data.** Observation/forecast boundary, deterministic event list, scenario clock, rainfall,
  reservoir/gauge series, decisions, notifications, confidence, and model/data versions.
- **Map layers.** The timeline drives the active flood, object states, closures, alerts, decisions, and
  comparison layer on the one shared map; it does not own a separate renderer.
- **Loading.** The clock and known event markers render immediately; derived events and bands appear in
  order with progress while playback remains pausable.
- **Empty states.** Before an event, show the monitoring baseline, now marker, forecast horizon, and “no
  derived events yet” rather than hiding the timeline.
- **Errors.** Illegal transitions, missing checkpoints, or unavailable historical layers stop the affected
  replay segment and name the gap; they never fabricate continuity.
- **Accessibility.** Play/pause, speed, scrub, event jump, and live return are keyboard operable; every
  marker has a text title/time and does not depend on color.
- **Acceptance criteria.** All time-aware panels follow one clock, forward/backward scrub is deterministic,
  event jumps move the map, and the live/observed/forecast/replay boundary is always visible.

Contains: T−24 → T+48 scrubber with **now** marker · event ribbon (BĐ crossings, peaks, closures, decisions, notifications) · **decision markers with the approver's name** · rainfall bar · reservoir level and outflow strips · forecast confidence shading (widening with lead) · playback controls with speed · **the decision deadline marked on the axis**.

**Interactions.** Scrub (every view follows) · click an event → jump and open detail · select a window → export that window as a report.

**Status:** ✅ scrubber, playback, event log, clickable events. Missing: decision markers, deadline marker, confidence shading.

---

## S-05 — Decision (the decision package)

**Purpose.** Where the product's core value is delivered. **Primary user.** P-02, P-03, P-04.

### Screen contract

- **Operational workflow.** Receive a recommendation → inspect situation, constraints, alternatives,
  counterfactual, regret, confidence, and deadline → identify the accountable actor → approve, refuse,
  modify, or defer with a reason → seal the outcome.
- **Required data.** Versioned proposal actions, feasible schedule evidence, forecast/simulation inputs,
  constraints and margins, impact ranges, alternatives, RACI, actor identity, deadline, and provenance.
- **Map layers.** Proposed consequence, do-nothing counterfactual, affected zones, reservoir schedule,
  control gauge, binding constraint location, confidence, and data-health overlays.
- **User interactions.** Expand evidence, select alternatives, paint proposal/counterfactual, inspect a
  binding constraint, enter identity/reason, and submit an authorised approval/refusal.
- **Loading.** Render the recommendation shell and known context first; mark deriving sections separately
  and disable review submission until the package is internally complete and current.
- **Empty states.** No active recommendation minimizes to a visible decision pill with normal posture and
  no false urgency; a viewed comparison option remains simulation until explicitly exported.
- **Errors.** Infeasible, stale, saturated, unsupported, or missing-model results stay visible with reasons
  and cannot be approved; wrong-role, anonymous, or reasonless actions are refused and audited.
- **Accessibility.** Evidence follows a stable reading order, confidence and feasibility are textual,
  deadline changes are announced, and all review actions and reasons are keyboard/screen-reader usable.
- **Acceptance criteria.** The complete package is explainable and printable; no recommendation changes
  downstream state, and only an authorised, identified, reasoned `APPROVED_PLAN` becomes actionable.

```
┌─ DECISION PACKAGE #A-2026-0731-04 ────────────── MEDIUM confidence ────────┐
│ SITUATION  Inflow to A Vương peaking 4200 m³/s ±900 around 19:00.          │
│            Free storage 28 Mm³ (6 h at current net). κ = 0.48.             │
│ PROPOSAL   A Vương 380 → 900 m³/s from 15:30, ramp 150 m³/s/h,             │
│            gates 2+3+4 at 0.8 m (symmetric), until Z ≤ 374.5 m             │
│ ┌─ CONSTRAINTS ─────────────────────────────────────────────────────────┐  │
│ │ C1 ceiling      PASS  1.5 m margin   C7 downstream ramp  PASS 0.28 m/h│  │
│ │ C3 freeboard    PASS  3.2 m          C8 drawdown rate    PASS         │  │
│ │ C4 gate rating  PASS                 C9 Ái Nghĩa cap ▲ MARGINAL 0.1 m │  │
│ │ C5 gate config  PASS  n−1 OK         C10 notification    PASS 2.5 h   │  │
│ └───────────────────────────────────────────────────────────────────────┘  │
│ OUTCOME    Ái Nghĩa peak 8.9 m (q50) [8.2 – 9.8]   vs 9.6 m if no action   │
│ IMPACT     18 000–24 000 exposed → 12 000–16 000.  Homes 4 200 → 2 900.    │
│ ALTERNATIVES  A) start 17:00 → peak 9.2 m, 1 h more notice                 │
│               B) split A Vương + S. Bung 4 → peak 8.7 m, C9 PASS, more     │
│                  coordination needed                                       │
│ REGRET     Act & storm misses: 14 GWh, refill risk if dry Nov (P≈25 %)     │
│            Wait & storm comes: +0.7 m at Ái Nghĩa, +6 000 exposed (P≈72 %) │
│ WHY        Driven by: ensemble q75 inflow · antecedent API 68 mm · tide    │
│            low at 19:00. Changes if rainfall is 30 % lower → no action.    │
│ ⏳ DECIDE BY 16:15   (notification 2 h + approval 0.5 h)                    │
│ [ Approve ] [ Modify… ] [ Reject ] [ Defer ]   Reason: ______________      │
└────────────────────────────────────────────────────────────────────────────┘
```

**Rules.** Counterfactual always present · alternatives always ≥ 2 · reason of record required on every choice · infeasible proposals still shown with the binding constraint named · **one click to a printable, signable page** · every action recorded with identity and time.

**Status:** ⚠ an MPC proposal card with approve/reject exists. Missing: constraint list, counterfactual as a first-class element, alternatives, regret, deadline, reason of record, identity, printable package.

---

## S-06 — Reservoir (per reservoir)

**Purpose.** The operator's home screen. **Primary user.** P-01, P-02, P-07.

### Reservoir selection workspace

One active reservoir selection and one global clock bind six contextual map views:

1. **Current state** — normalized state, age, quality, provenance, constraints and permitted use.
2. **Historical trends** — observed/history series with gaps, datum/source versions and explicit synthetic replay.
3. **Scenario comparison** — aligned alternatives, reservoir actions, downstream deltas, constraints and limitations.
4. **Relationship graph** — directed reservoirs, rivers, catchments, diversions, gauges and downstream areas from
   the governed [connected-watershed registry](https://github.com/ManhHoDinh/skylabs-surf2026/blob/main/product-os/database/DB-04-connected-watershed-registry.md),
   including travel-time uncertainty and missing relationships.
5. **Timeline** — observations, forecasts, state transitions, proposals, human decisions and revisions on the
   same deterministic clock as the map.
6. **Downstream analysis** — river, inundation, infrastructure and population consequence by branch, with
   proposal/counterfactual attribution and controllability limits.

Switching views preserves the selected reservoir, time, scenario, network version and decision state. Each view
has loading, stale, missing, unavailable and error behavior; none may reuse a prior-current result as current.

### Screen contract

- **Operational workflow.** Select a reservoir → verify telemetry quality and safety margins → inspect
  inflow/outflow and current official schedule → evaluate constraints → escalate or prepare a proposal.
- **Required data.** Level/storage with datum, inflow/outflow bands, structure/gate state when authoritative,
  rule curves and effective dates, freeboard, rates, time-to-threshold, safety observations, and provenance.
- **Map layers.** Reservoir/catchment, upstream inflow, downstream reach and control gauge, access routes,
  sensors, safety observations, and current release propagation.
- **User interactions.** Inspect values/lineage, compare schedule alternatives, acknowledge permitted
  alarms, open the official order, and route out-of-corridor actions to the accountable authority.
- **Loading.** Show last valid observed state with age while live feeds load; simulation-only quantities
  remain visually distinct and unavailable gate details are not synthesized.
- **Empty states.** No active order shows rule-curve posture, available verified telemetry, readiness tasks,
  and the next expected update.
- **Errors.** Commanded/actual disagreement, stale safety telemetry, datum mismatch, and threshold breach are
  separate high-priority states; missing gate geometry blocks gate-level advice.
- **Accessibility.** Safety alarms are never color-only or grouped away; charts expose text values/units and
  keyboard inspection, with a non-visual path to every margin and action.
- **Acceptance criteria.** The operator can identify current level, datum, trend, freeboard, time to each
  applicable limit, inflow/outflow uncertainty, official order, safety state, and next accountable action.

Contains, in one non-scrolling view: level with all bands drawn (dead / ceiling / FSL / design / check / crest) · **freeboard in metres** · `dZ/dt` · **time to ceiling / FSL / design** · inflow with error band and the independent cross-check · outflow split into turbine / spill / outlet · storage and free storage · **gate table: commanded vs actual per gate**, status, hoist power ⚠ · the active order and next required action with countdown · rule-curve compliance · **dam-safety monitor panel, visually separate** (seepage, turbidity, piezometers, deformation, alarms) · I/O sparklines.

**Must never** aggregate safety indicators into a score, or bury commanded-vs-actual gate disagreement.

**Status:** ⚠ level bar with ceiling notch, I/O sparklines, spilling/over-ceiling flags. Missing: freeboard, dZ/dt, time-to-threshold, gate table, safety panel, order/next action, compliance.

---

## S-07 — River / control point

**Purpose.** Stage forecast and routing at each control point. **Primary user.** P-02, P-06.

### Screen contract

- **Target users.** Reservoir engineers, hydrologists, forecasters, and downstream coordinators evaluating
  stage, routing, arrival, and control-gauge evidence.
- **Operational workflow.** Select a control point → verify observed/forecast quality → inspect threshold
  crossing and arrival range → compare schedule contributions → open affected zones or decision evidence.
- **Required data.** Gauge datum and rating-curve version, observations, ensemble stages, alert levels,
  routed reservoir/lateral contributions, travel times, tide boundary where available, and provenance.
- **Map layers.** Gauge/reach, upstream reservoirs and tributaries, forecast flood extent, downstream zones,
  alert thresholds, contribution paths, and confidence/data-health state.
- **User interactions.** Scrub/crosshair the hydrograph, select a threshold or ensemble band, compare policies,
  inspect contribution/arrival evidence, and jump to a downstream zone.
- **Loading.** Show last valid observation and threshold context first; load forecast bands and routed
  attribution independently with issue time and progress.
- **Empty states.** No forecast crossing states that thresholds are not crossed in the available horizon,
  with the horizon/confidence visible; missing forecast is not reported as “no risk”.
- **Errors.** Datum/rating mismatch, saturated response, missing ensemble, or unsupported tide/contribution
  evidence is named and affected probabilities/arrival times become unavailable.
- **Accessibility.** Chart series and thresholds have text/table equivalents, keyboard crosshair control,
  non-color line distinctions, and announced selected time/value.
- **Acceptance criteria.** Users can identify observed state, forecast range, threshold probability,
  arrival window, controlling contributions, data age, confidence, and limitations without mixing datums.

Contains: hydrograph with q10–q90 fan, BĐ lines, observed vs forecast, now-marker, hover crosshair · **`P(H > BĐn)` as a curve under the hydrograph** · tide phase strip aligned to the same axis ⚠ · policy comparison (rule vs proposal vs counterfactual) · upstream contribution breakdown (which reservoir, lateral, local — the κ decomposition) · travel-time diagram · rating curve with its version and validity range · historical peak markers (2020 line, 2009 line).

**Status:** ⚠ hydrograph with fan, BĐ lines, crosshair, policy compare exist. Missing: `P(exceed)` curve, tide strip, contribution breakdown, travel-time view, rating curve, historical markers.

---

## S-08 — Rainfall / catchment

**Purpose.** Where is the rain, on which sub-catchment, and does it matter.

### Screen contract

- **Target users.** Forecasters, reservoir engineers, coordinators, and hydrologists evaluating forcing and
  antecedent state.
- **Operational workflow.** Inspect observed/forecast rainfall → compare sub-catchments and wetness → verify
  sensor/forecast quality → trace runoff relevance to reservoirs and control points.
- **Required data.** Gauge/radar/satellite observations when available, ensemble QPF, issue times,
  sub-catchment geometry/weights, antecedent state, runoff response, sensor health, and provenance.
- **Map layers.** Rainfall intensity/accumulation, sub-catchments, gauges/radar coverage, wetness state,
  reservoirs, river network, and data-quality masks.
- **User interactions.** Select catchment/time/member, compare observed and forecast accumulation, inspect
  weights/wetness/quality, and jump to the resulting reservoir or downstream forecast.
- **Loading.** Base catchments and last observation load first; remote products and ensemble members stream
  with issue/freshness labels and never block the map.
- **Empty states.** Dry/no-rain posture shows valid zero rainfall and current feed health; missing products
  show unavailable evidence, not a zero.
- **Errors.** Stale/rejected gauges, incomplete ensemble, coverage gap, or uncalibrated wetness is named and
  confidence is reduced; no field is relabelled observed.
- **Accessibility.** Spatial colors have labelled bands/pattern alternatives, charts expose tables, and all
  catchments/products are keyboard selectable.
- **Acceptance criteria.** The user can distinguish observed and forecast rain, identify contributing
  catchments, issue/freshness, uncertainty, wetness assumptions, and affected downstream computations.

Contains: **sub-catchment rainfall panel** (upper = controllable, lower = not) · observed vs forecast accumulation · intensity time series · radar/satellite/nowcast layer · **antecedent wetness state per sub-catchment** ⚠ · rainfall-runoff response per sub-catchment · gauge network status.

**Status:** ⚠ basin-mean rainfall only. **Sub-catchment decomposition and antecedent state are the two highest-value hydrological additions.**

---

## S-09 — Forecast

**Purpose.** The meteorological picture and its credibility. **Primary user.** P-06, P-02.

### Screen contract

- **Target users.** Forecasters and reservoir engineers preparing or reviewing meteorological forcing;
  coordinators may inspect the same evidence without overriding the forecast authority.
- **Operational workflow.** Review official bulletin → compare ensemble/model products → inspect spread and
  skill by lead → record an attributed interpretation/override → publish forcing context to Step 1.
- **Required data.** Official bulletin, model/ensemble outputs, issue/valid/next-issue times, performance
  metrics, forecaster notes, quality/provenance, and downstream product dependencies.
- **Map layers.** Forecast rainfall/weather fields, official warning areas, model disagreement, observation
  coverage, basin/sub-catchment boundaries, and confidence.
- **User interactions.** Select product/member/lead, compare models, inspect skill and source, filter the map,
  enter an attributed override where authorised, and open forecast performance.
- **Loading.** Preserve the latest valid official product and its age while newer products load; models
  hydrate independently and mismatched issue times are flagged.
- **Empty states.** No new issue shows the previous issue, expiry/next issue, and monitoring posture; no
  product must never appear as a benign forecast.
- **Errors.** Missing official bulletin, delayed model, partial ensemble, or failed ingest names the product
  and disables dependent confidence claims or recommendations as required by degradation level.
- **Accessibility.** Spaghetti/bands have table summaries and non-color styles; product/lead selectors and
  source/skill details are keyboard and screen-reader usable.
- **Acceptance criteria.** Users can identify official versus model guidance, issue/valid times, spread,
  performance, disagreement, provenance, confidence, and any attributed human interpretation.

Contains: official bulletin as a privileged, distinct layer · ensemble spaghetti and quantiles · model comparison (NWP vs AI models vs official) · spread growth vs lead time · **forecast performance summary with a link to S-16** · issue time and next issue time for every product ⚠ · forecaster override control with attribution.

**Status:** ⚠ ensemble quantiles and spread control exist. Missing: bulletins, model comparison, issue times, override.

---

## S-10 — Alerts & notifications

**Purpose.** Manage alarms and run the notification workflow. **Primary user.** P-01, P-04.

### Screen contract

- **Target users.** Duty operators managing alarms and accountable authorities reviewing notification or
  public-release actions, with public-information staff preparing channel variants.
- **Operational workflow.** Receive/group an alarm → inspect cause, affected place and instruction →
  acknowledge/escalate with identity → derive channel drafts from one approved record → review delivery and
  recipient acknowledgements.
- **Required data.** Alarm philosophy/rules, object state and root cause, severity, required action, actor
  identity, approved decision record, recipient/contact tree, templates, delivery receipts, and timers.
- **Map layers.** Alarmed reservoirs/gauges/zones, warning polygons, affected routes/shelters, recipient
  areas, and delivery/acknowledgement state where policy permits.
- **User interactions.** Filter/group, inspect, acknowledge, escalate, open the source evidence, review every
  channel variant, submit for authority approval, and inspect receipt history.
- **Loading.** Active dam-safety and life-safety alarms render first; communication status loads separately
  and drafts remain visibly pending until the approved source record is complete.
- **Empty states.** No active alarms states normal monitoring and last check time; no approved public message
  preserves drafts as unavailable rather than sending from simulation.
- **Errors.** Missing identity, wrong authority, contradictory record, invalid CAP/SMS, unavailable channel,
  or non-acknowledgement is retained and escalated; alarms never silently clear.
- **Accessibility.** Severity is textual and shaped, focus moves to new critical alarms without trapping,
  acknowledgements require explicit controls, and message variants are readable without color.
- **Acceptance criteria.** One root cause produces the governed alarm set, safety alarms remain separate,
  every acknowledgement is attributed, all channels match one approved record, and dispatch without
  authority is refused and logged.

Contains: active alarms, grouped per [DT-8](../03-operations/02-decision-trees.md), each individually acknowledgeable with the acknowledger recorded · **dam-safety alarms in a separate, never-grouped section** ⚠ · notification composer showing all channel variants generated from one decision record · recipient matrix with delivery and **acknowledgement** state · escalation timers for non-acknowledged · message history.

**Status:** ⚠ toasts and an event log exist. Missing: the entire notification workflow. **This is the largest single functional gap in the product.**

---

## S-11 — Reports

**Purpose.** Produce the artefacts that make the product defensible.

### Screen contract

- **Target users.** Operators, coordinators, accountable authorities, public-information officers,
  analysts, auditors, and inquiry reviewers according to report type.
- **Operational workflow.** Choose report type/context → preview versioned evidence → resolve unavailable or
  unapproved sections → record the preview/export → produce the role-appropriate artefact.
- **Required data.** Sealed decisions/audit entries, scenario clock, model/data/config versions, provenance,
  uncertainty, maps, notifications/receipts, actor attribution, and report-specific evidence.
- **Map layers.** Time-pinned extent, reservoirs/gauges/zones, impacts, routes/shelters, decision markers, and
  source attribution appropriate to the report audience.
- **User interactions.** Select period/type/language, inspect cited evidence, preview, print/export, and open
  the source record; public release remains a separate authorised action.
- **Loading.** Render the report structure and sealed metadata first, mark each evidence section while
  resolving, and never combine different version snapshots silently.
- **Empty states.** No applicable event/decision explains prerequisites and offers the latest valid routine
  report; missing evidence remains an explicit unavailable section.
- **Errors.** Hash/version mismatch, unavailable historical layer, unsigned/unapproved release, or print
  overflow blocks finalization and preserves a diagnostic draft.
- **Accessibility.** Semantic headings/tables, alt text/map summaries, tagged language, print contrast, and
  keyboard preview/export are required; watermarks remain readable in monochrome.
- **Acceptance criteria.** Every export is self-describing, time/version pinned, attributed, watermarked,
  reproducible from its record, and cannot imply approval or operational validity it does not have.

Report types: **situation report** (current, printable, signable) · **decision package** (per decision) · **operation record** (inflow/outflow/level/absorbed volume — publishable, the answer to "did the dam cause this?") · **event report** (full timeline reconstruction from the audit trail, auto-generated within 1 h of all-clear) · **verification report** (post-event forecast performance) · **public statement draft** · **shift handover**.

Every export carries: mode watermark · data provenance · model versions · the non-operational marker when applicable · attribution for map data.

**Status:** ⚠ a print situation report exists. Missing: everything else, and the watermark/provenance envelope on exports.

---

## S-12 — Simulation / what-if

**Purpose.** Explore, compare, train. Amber-framed throughout.

### Screen contract

- **Target users.** Reservoir engineers, coordinators, emergency managers, trainers, and authorised
  reviewers; never the public or an automated actuator.
- **Operational workflow.** Choose/create a scenario → set permitted forcing/schedule/failure assumptions →
  run → compare against baseline on one clock/map → inspect limitations → save for training or export a
  feasible option as a recommendation.
- **Required data.** Scenario metadata, forcing/ensemble, reservoir/network configuration, baseline,
  schedule options, failure injections, model versions, constraints, provenance, and confidence.
- **Map layers.** Selected option flood field, baseline/delta, reservoirs/releases, propagation, gauges,
  exposure, failures/degradation, and data-confidence overlays.
- **User interactions.** Select scenario, adjust allowed parameters, add/remove options, run/cancel, select
  shared gauge/time, scrub, compare, inspect attribution/limitations, and export a recommendation.
- **Loading.** Base map and baseline remain interactive; each option reports queued/running/ready/error
  independently and cancelled/stale work cannot paint the current map.
- **Empty states.** No option explains how to add one; one option is explicitly “not yet a comparison”; no
  usable data preserves baseline context and names blocked products.
- **Errors.** Infeasible, unavailable, saturated, illegal-transition, render-failure, and stale states remain
  distinct, preserve textual evidence, and disable export where appropriate.
- **Accessibility.** Amber mode is also labelled in text, option state is non-color-only, all controls and
  timeline are keyboard/touch usable, and status changes use live regions.
- **Acceptance criteria.** Two to four comparable options share one map/clock/gauge, none is an automatic
  winner/order, lifecycle state stays unchanged while viewing, and only a feasible current option can
  become a non-actionable recommendation.

Contains: scenario selector (historical / design / worst-credible / compound / sequence / failure-injection / false-alarm) · release schedule editor per reservoir · rainfall multiplier and timing shift · tide phase · antecedent wetness · failure injection · **side-by-side comparison against the baseline** · promote-to-proposal · training mode with clock control (1×–60×), instructor injection, and debrief scoring.

**Status:** ⚠ scenario selection, rain scale, ensemble spread, policy compare. Missing: release editing, failure injection, comparison view, training mode, promote-to-proposal.

---

## S-13 — Data health

**Purpose.** What is the product actually seeing. **Operational, not admin.**

### Screen contract

- **Target users.** Operators, forecasters, data-quality reviewers, reservoir engineers, coordinators, and
  incident leads deciding whether the platform may still support a workflow.
- **Operational workflow.** Inspect overall L0–L4 posture → identify failed/stale/rejected dependencies →
  see affected quantities and permitted use → review or enter authorised fallback data → monitor recovery.
- **Required data.** Source registry, freshness/quality thresholds, observations and flags, redundancy,
  clock skew, lineage, last-valid time, affected computations, confidence effect, and reviewer attribution.
- **Map layers.** Sensor/feed locations, coverage gaps, stale/rejected regions, dependent reservoirs/gauges/
  zones, and the current degradation footprint.
- **User interactions.** Filter by severity/source/dependency, inspect lineage and last valid evidence,
  acknowledge/review a quality issue, enter permitted manual evidence, and open affected screens.
- **Loading.** Show cached health and its timestamp immediately; hydrate feed checks independently and mark
  unknown checks rather than assuming healthy.
- **Empty states.** All feeds current states L0/L1 posture and next check; no configured feed explains the
  setup dependency and cannot appear healthy by default.
- **Errors.** Missing, stale, quality-rejected, model-failed, unsupported, and disconnected are distinct;
  L4 removes advice/deadline while preserving last-known evidence and fallback contacts.
- **Accessibility.** Health uses text/reason/shape, tables support keyboard sorting and row inspection, and
  changes requiring action are announced without relying on color or animation.
- **Acceptance criteria.** Every degraded quantity names source, reason, last-valid time, confidence effect,
  affected computation, and permitted action; no missing feed is silently treated as current.

Contains: operating level L0–L4 with the reason · per-feed freshness table · redundancy status on safety-critical signals · QC flags and the review queue · **which computations are degraded or disabled as a result** ⚠ · manual entry · sensor map · clock skew.

**Status:** ❌ — **P0. Nothing exists, and every other honesty feature depends on it.**

---

## S-14 — Field mode (mobile)

**Purpose.** The commander in a vehicle with no signal. **Primary user.** P-05, P-10.

### Screen contract

- **Target users.** Field incident commanders and authorised field teams operating from vehicles or weak-
  connectivity areas during preparedness, response, and initial recovery.
- **Operational workflow.** Preload an authorised incident package → work offline from time-stamped state →
  inspect zone/route/shelter priorities → capture attributed field reports → reconcile when connectivity
  safely returns.
- **Required data.** Offline map package, last-known hazard/zone/route/shelter/team state, package/version
  time, user/role credentials, report schema, conflict rules, and synchronization receipts.
- **Map layers.** Offline basemap, flood/closure last-known state, zones, viable routes, shelters/occupancy,
  isolated communities, team positions, and report locations.
- **User interactions.** Navigate large-touch map/list views, select a zone/route/shelter, record depth/road/
  needs/photo evidence, queue synchronization, and inspect data age/conflict status.
- **Loading.** Open the last verified package without network access; background checks never block the
  cached map and show progress/age explicitly.
- **Empty states.** No offline package blocks incident use, names the missing preload, and offers only local
  emergency contacts/instructions that are legitimately bundled.
- **Errors.** Expired/corrupt package, storage failure, identity expiry, GPS unavailable, or sync conflict is
  explicit; field evidence remains queued and never silently overwritten.
- **Accessibility.** Minimum 44 px targets, high contrast/daylight mode, screen-reader labels, text/photo
  alternatives, simple focus order, and no event-time login loop are required.
- **Acceptance criteria.** The core field journey works without connectivity, continuously shows data age,
  preserves attributed reports through restart/conflict, and never presents stale routes as currently open.

Contains: offline map with last-known state and **a prominent timestamp** · zone priority list · route viability with `open until` · shelters with occupancy · isolated communities · team positions · one-tap field report (depth, road state, needs, photo) · large touch targets, high contrast, works in rain and daylight.

**Rules.** Must function fully offline. Must never require login re-entry during an event. Must show data age at all times.

**Status:** ❌.

---

## S-15 — Public view

**Purpose.** The citizen's answer. Separate build, separate data policy.

### Screen contract

- **Target users.** Residents, visitors, community leaders, accessibility users, and public-information
  staff validating the public projection.
- **Operational workflow.** Locate/select an area → read authority-issued timing/depth/action → inspect
  viable shelter/route and next update → receive all-clear or correction from the same approved record.
- **Required data.** Authority-approved public record, generalized hazard/impact, route/shelter validity,
  issue/next-update time, language/accessibility variants, provenance, and public data policy.
- **Map layers.** Generalized public hazard, administrative/community areas, approved closures, shelters and
  routes with time horizon, issuing authority, and no sensitive infrastructure detail.
- **User interactions.** Search/use location with consent, select an area, switch language/text/audio,
  inspect action/shelter/route/next update, and access low-bandwidth fallback content.
- **Loading.** Critical text and last approved issue time load before the map; weak-network mode uses compact
  assets and never substitutes draft or simulation content.
- **Empty states.** No active warning shows routine preparedness and next official source; location outside
  coverage explains the boundary without guessing an action.
- **Errors.** Missing approval, expired record, unavailable route/shelter, location denial, or update failure
  retains the last approved message with age and directs users to official fallback channels.
- **Accessibility.** Vietnamese primary, English secondary, large type, audio/text alternatives, unaccented
  fallback, semantic structure, non-color likelihood, and keyboard/touch access are required.
- **Acceptance criteria.** Every public statement is authority-approved, place/time specific, consistent
  across channels, low-bandwidth accessible, free of sensitive detail, and carries issuer/issue/next-update.

Contains: "my area" by location or selection · plain-language depth, timing and action · shelter and route with `open until` · road closures · the issuing authority and next update time · categorical likelihood · **all-clear and false-alarm explanations** · the publishable operation record.

**Rules.** No sensitive infrastructure data ⚠ · works on a weak connection · no login · accessible (audio, large type, unaccented fallback) · Vietnamese primary, English secondary.

**Status:** ⚠ a "citizen" toggle exists in the demo. Not a separate build, no data policy separation.

---

## S-16 — Forecast performance

**Purpose.** Publish our own errors. The credibility screen.

### Screen contract

- **Target users.** Forecasters, hydrologists, model validators, reservoir engineers, authorities,
  auditors, and scientific reviewers.
- **Operational workflow.** Choose event/season/model/gauge/lead → inspect deterministic and probabilistic
  metrics → diagnose bias/reliability/failure modes → record review outcome → compare the next version.
- **Required data.** Frozen forecasts and observations, QC/selection rules, gauge/datum/version metadata,
  model/config versions, event stratification, benchmark definitions, and review decisions.
- **Map layers.** Gauge/catchment coverage, spatial error/bias, missing verification areas, event footprints,
  and model/version selection.
- **User interactions.** Filter/compare versions and lead times, inspect metric definitions/samples, drill to
  events, export evidence, and record an attributed validation review.
- **Loading.** Show cohort/sample coverage before metrics; compute panels independently and mark insufficient
  samples instead of emitting unstable scores.
- **Empty states.** No verified event or insufficient sample states the requirement and leaves metrics null,
  never implying perfect performance.
- **Errors.** Datum/time alignment, missing observation, leakage, incompatible model version, or invalid
  cohort blocks affected metrics and preserves diagnostics.
- **Accessibility.** Reliability/rank plots have tables and text summaries, comparisons use non-color cues,
  definitions/samples are keyboard reachable, and exports preserve semantic labels.
- **Acceptance criteria.** Metrics are reproducible from pinned data/code/config, stratified as claimed,
  sample-aware, independently reviewable, and never presented as operational validation without evidence.

Contains: CRPS, Brier, reliability diagram, rank histogram, POD/FAR/CSI, peak stage error, peak timing error — **all stratified by gauge and lead time** · last event vs last season · model-error vs forecast-error split · false-alarm ratio and the explanation record.

**Status:** ❌ — high credibility value, moderate cost. ([FR-27](03-prd.md))

---

## S-17 — Administration

### Screen contract

- **Purpose.** Govern basin configuration, users, effective-dated thresholds, contacts, templates, model
  versions, and data sources without granting operational release authority.
- **Target users.** Authorised system/data/configuration administrators, security administrators, model
  owners, and accountable approvers for governed configuration changes.
- **Operational workflow.** Propose a configuration change → validate schema/references/impact → route to
  the named owner/approver → activate at an effective date → audit and support rollback to a prior version.
- **Required data.** Versioned basin/twin configuration, owners, source authority, effective dates, change
  reason, approval policy, users/roles/certification, templates, model/data registry, and audit history.
- **Map layers.** Configuration preview for reservoirs, gauges, reaches, zones, routes, shelters, sensors,
  boundaries, CRS/datum, and spatial diff against the active version.
- **User interactions.** Search/edit drafts, validate, preview spatial/behavioral diff, submit/approve where
  authorised, schedule activation, rollback by new version, and inspect history.
- **Loading.** Active configuration loads read-only first; large drafts/diffs validate asynchronously with
  explicit progress and cannot affect runtime before activation.
- **Empty states.** Missing owner/source/effective date prevents activation and names required authority;
  an unconfigured integration remains planned rather than receiving a fabricated default.
- **Errors.** Schema/reference/CRS conflict, unsafe threshold, invalid role separation, failed activation,
  or version race leaves the active version unchanged and records the failed attempt.
- **Accessibility.** Forms expose labels/errors/diffs programmatically, map changes have tabular equivalents,
  destructive-looking actions require explicit confirmation, and review is keyboard operable.
- **Acceptance criteria.** Every active value has source, owner, effective date, version, reason, approver,
  validation evidence, and audit record; administrators cannot approve releases or bypass separation of duty.

Basin configuration (reservoirs, gauges, reaches, zones) · **thresholds and constraint parameters with effective dates and owners** ⚠ · rule curves · optimiser weights (visible and versioned) ⚠ · contact tree and EAP data · shelters and routes · users, roles, certification · notification templates · model and data-source configuration.

**Rule.** Every change is versioned, attributed and audited. Changing a threshold is a recorded decision.

**Status:** ❌.

---

## S-18 — Audit

**Purpose.** Answer "what did the screen say at 02:14?" exactly.

### Screen contract

- **Target users.** Accountable authorities, auditors, investigators, administrators, analysts, legal/
  compliance reviewers, and trainers with scoped access.
- **Operational workflow.** Define incident/time/query → locate immutable records → reconstruct exact screen/
  map state and versions → verify hashes/sequence/receipts → export an inquiry package with access recorded.
- **Required data.** Append-only events/decisions/actions, canonical input snapshots/hashes, actor/role/reason,
  model/data/config versions, checkpoints, notification receipts, supersession links, and access logs.
- **Map layers.** Time-pinned historical flood/object states, decision/action markers, notification areas,
  data-health context, and explicit unavailable layers where products were not retained.
- **User interactions.** Filter/search, scrub/jump, open linked evidence, verify tamper evidence, compare
  versions, preview/export, and inspect who accessed or produced the package.
- **Loading.** Return indexed record metadata first; reconstruct heavy screen/map state asynchronously and
  never display current state as historical while loading.
- **Empty states.** No matching record states the query/retention boundary and preserves filter context;
  missing retained products are explicit, not reconstructed from later data.
- **Errors.** Hash/sequence/version mismatch, checkpoint gap, access denial, or export failure blocks a
  verified label, preserves evidence, and raises an attributed audit diagnostic.
- **Accessibility.** Logs/timelines are keyboard searchable, event state and integrity are textual, maps
  have evidence tables, and exported packages retain semantic structure and monochrome watermarks.
- **Acceptance criteria.** An authorised reviewer can reproduce the exact known/simulated/recommended/
  decided state for a time, verify append-only integrity and versions, and export without mutating history.

Contains: append-only decision and action log with filters · **exact screen-state replay at any past instant** ⚠ · data snapshot references with hashes · model/threshold versions per record · notification records with receipts · export for inquiry · tamper-evidence verification.

**Status:** ❌ — **P0 institutional feature.** ([regulatory §6](../00-foundations/08-regulatory-vietnam.md#6-liability-evidence-and-the-audit-trail))

---

## Navigation model

```
Role-based landing:
  Operator      → S-06 Reservoir
  Res. engineer → S-05 Decision
  Authority     → S-02 Situation
  Commander     → S-14 Field
  Forecaster    → S-09 Forecast
  Public        → S-15 Public

Always reachable in one action: S-01 Dashboard · S-03 Map · S-10 Alerts · S-13 Data health
Timeline scrub is global — every time-aware screen follows it.
```

**Screen count discipline.** Eighteen screens is a lot. The test each must pass: *does a named persona need this during a named workflow step?* Anything that fails becomes a panel inside another screen, not a screen.

---

**Next:** [PRD →](03-prd.md)
