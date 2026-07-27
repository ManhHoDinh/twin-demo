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

Same underlying numbers as S-01, rendered as: *"Tonight, water is likely to reach 0.8–1.2 m in these six communes between 01:00 and 04:00. About 21 000 people affected; about 4 000 need to move. Three routes will close. Decide on evacuation by 18:00."*

Contains: plain-language summary · commune-by-commune table (people, depth, time, action, shelter, route status) · what changed since the last briefing · the single recommended action with its deadline · a print/export button producing a signable brief.

**Must never** show a technical stage without its impact translation, or a term not defined in the [glossary](../00-foundations/01-glossary.md) plain-language column.

**Status:** ❌ (an LLM-style brief exists; not an authority view).

---

## S-03 — Map

**Purpose.** Spatial truth. **Primary user.** All.

**Layers** (toggleable, persisted per user): basemap/imagery · terrain · **flood depth (5 discrete bands)** · velocity/hazard rating · impact heatmap (pop × depth) · zones (choropleth by status) · rivers with stage-coloured reaches · reservoirs with level glyphs · gauges with BĐ colouring · roads with closure state and `open until` · bridges · buildings (flood-coloured) · shelters (valid/invalid) · hospitals/schools/critical infrastructure · evacuation routes · emergency teams · sensors with health · **isolated communities** · landslide susceptibility · administrative boundaries (with vintage) · place labels.

**Interactions.** Pan/zoom to street level · click any feature → detail card · time scrub (the map follows the timeline) · **compare mode** (policy A vs B, or forecast vs observed) · draw a query area → exposure summary · focus/kiosk mode.

**Must never:** use a continuous depth ramp · show a route as simply "open" without a time horizon · display sensitive infrastructure detail in the public build.

**2D vs 3D.** 2D is the working surface — dense, fast, precise. 3D is for briefing, public communication and situational comprehension. **Neither is the decision surface.** The decision is made on S-01/S-05.

**Status:** ✅ strong — real DEM/imagery, deep zoom to ~0.14 m/px, depth bands, zones, impact heatmap, roads with closures, buildings from OSM, 3D drape with detail overlay. Missing: shelters, routes, teams, sensors, isolation, hazard rating, `open until`, admin vintage.

---

## S-04 — Timeline

**Purpose.** Move through time; see the sequence of events and decisions.

Contains: T−24 → T+48 scrubber with **now** marker · event ribbon (BĐ crossings, peaks, closures, decisions, notifications) · **decision markers with the approver's name** · rainfall bar · reservoir level and outflow strips · forecast confidence shading (widening with lead) · playback controls with speed · **the decision deadline marked on the axis**.

**Interactions.** Scrub (every view follows) · click an event → jump and open detail · select a window → export that window as a report.

**Status:** ✅ scrubber, playback, event log, clickable events. Missing: decision markers, deadline marker, confidence shading.

---

## S-05 — Decision (the decision package)

**Purpose.** Where the product's core value is delivered. **Primary user.** P-02, P-03, P-04.

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

Contains, in one non-scrolling view: level with all bands drawn (dead / ceiling / FSL / design / check / crest) · **freeboard in metres** · `dZ/dt` · **time to ceiling / FSL / design** · inflow with error band and the independent cross-check · outflow split into turbine / spill / outlet · storage and free storage · **gate table: commanded vs actual per gate**, status, hoist power ⚠ · the active order and next required action with countdown · rule-curve compliance · **dam-safety monitor panel, visually separate** (seepage, turbidity, piezometers, deformation, alarms) · I/O sparklines.

**Must never** aggregate safety indicators into a score, or bury commanded-vs-actual gate disagreement.

**Status:** ⚠ level bar with ceiling notch, I/O sparklines, spilling/over-ceiling flags. Missing: freeboard, dZ/dt, time-to-threshold, gate table, safety panel, order/next action, compliance.

---

## S-07 — River / control point

**Purpose.** Stage forecast and routing at each control point. **Primary user.** P-02, P-06.

Contains: hydrograph with q10–q90 fan, BĐ lines, observed vs forecast, now-marker, hover crosshair · **`P(H > BĐn)` as a curve under the hydrograph** · tide phase strip aligned to the same axis ⚠ · policy comparison (rule vs proposal vs counterfactual) · upstream contribution breakdown (which reservoir, lateral, local — the κ decomposition) · travel-time diagram · rating curve with its version and validity range · historical peak markers (2020 line, 2009 line).

**Status:** ⚠ hydrograph with fan, BĐ lines, crosshair, policy compare exist. Missing: `P(exceed)` curve, tide strip, contribution breakdown, travel-time view, rating curve, historical markers.

---

## S-08 — Rainfall / catchment

**Purpose.** Where is the rain, on which sub-catchment, and does it matter.

Contains: **sub-catchment rainfall panel** (upper = controllable, lower = not) · observed vs forecast accumulation · intensity time series · radar/satellite/nowcast layer · **antecedent wetness state per sub-catchment** ⚠ · rainfall-runoff response per sub-catchment · gauge network status.

**Status:** ⚠ basin-mean rainfall only. **Sub-catchment decomposition and antecedent state are the two highest-value hydrological additions.**

---

## S-09 — Forecast

**Purpose.** The meteorological picture and its credibility. **Primary user.** P-06, P-02.

Contains: official bulletin as a privileged, distinct layer · ensemble spaghetti and quantiles · model comparison (NWP vs AI models vs official) · spread growth vs lead time · **forecast performance summary with a link to S-16** · issue time and next issue time for every product ⚠ · forecaster override control with attribution.

**Status:** ⚠ ensemble quantiles and spread control exist. Missing: bulletins, model comparison, issue times, override.

---

## S-10 — Alerts & notifications

**Purpose.** Manage alarms and run the notification workflow. **Primary user.** P-01, P-04.

Contains: active alarms, grouped per [DT-8](../03-operations/02-decision-trees.md), each individually acknowledgeable with the acknowledger recorded · **dam-safety alarms in a separate, never-grouped section** ⚠ · notification composer showing all channel variants generated from one decision record · recipient matrix with delivery and **acknowledgement** state · escalation timers for non-acknowledged · message history.

**Status:** ⚠ toasts and an event log exist. Missing: the entire notification workflow. **This is the largest single functional gap in the product.**

---

## S-11 — Reports

**Purpose.** Produce the artefacts that make the product defensible.

Report types: **situation report** (current, printable, signable) · **decision package** (per decision) · **operation record** (inflow/outflow/level/absorbed volume — publishable, the answer to "did the dam cause this?") · **event report** (full timeline reconstruction from the audit trail, auto-generated within 1 h of all-clear) · **verification report** (post-event forecast performance) · **public statement draft** · **shift handover**.

Every export carries: mode watermark · data provenance · model versions · the non-operational marker when applicable · attribution for map data.

**Status:** ⚠ a print situation report exists. Missing: everything else, and the watermark/provenance envelope on exports.

---

## S-12 — Simulation / what-if

**Purpose.** Explore, compare, train. Amber-framed throughout.

Contains: scenario selector (historical / design / worst-credible / compound / sequence / failure-injection / false-alarm) · release schedule editor per reservoir · rainfall multiplier and timing shift · tide phase · antecedent wetness · failure injection · **side-by-side comparison against the baseline** · promote-to-proposal · training mode with clock control (1×–60×), instructor injection, and debrief scoring.

**Status:** ⚠ scenario selection, rain scale, ensemble spread, policy compare. Missing: release editing, failure injection, comparison view, training mode, promote-to-proposal.

---

## S-13 — Data health

**Purpose.** What is the product actually seeing. **Operational, not admin.**

Contains: operating level L0–L4 with the reason · per-feed freshness table · redundancy status on safety-critical signals · QC flags and the review queue · **which computations are degraded or disabled as a result** ⚠ · manual entry · sensor map · clock skew.

**Status:** ❌ — **P0. Nothing exists, and every other honesty feature depends on it.**

---

## S-14 — Field mode (mobile)

**Purpose.** The commander in a vehicle with no signal. **Primary user.** P-05, P-10.

Contains: offline map with last-known state and **a prominent timestamp** · zone priority list · route viability with `open until` · shelters with occupancy · isolated communities · team positions · one-tap field report (depth, road state, needs, photo) · large touch targets, high contrast, works in rain and daylight.

**Rules.** Must function fully offline. Must never require login re-entry during an event. Must show data age at all times.

**Status:** ❌.

---

## S-15 — Public view

**Purpose.** The citizen's answer. Separate build, separate data policy.

Contains: "my area" by location or selection · plain-language depth, timing and action · shelter and route with `open until` · road closures · the issuing authority and next update time · categorical likelihood · **all-clear and false-alarm explanations** · the publishable operation record.

**Rules.** No sensitive infrastructure data ⚠ · works on a weak connection · no login · accessible (audio, large type, unaccented fallback) · Vietnamese primary, English secondary.

**Status:** ⚠ a "citizen" toggle exists in the demo. Not a separate build, no data policy separation.

---

## S-16 — Forecast performance

**Purpose.** Publish our own errors. The credibility screen.

Contains: CRPS, Brier, reliability diagram, rank histogram, POD/FAR/CSI, peak stage error, peak timing error — **all stratified by gauge and lead time** · last event vs last season · model-error vs forecast-error split · false-alarm ratio and the explanation record.

**Status:** ❌ — high credibility value, moderate cost. ([FR-27](03-prd.md))

---

## S-17 — Administration

Basin configuration (reservoirs, gauges, reaches, zones) · **thresholds and constraint parameters with effective dates and owners** ⚠ · rule curves · optimiser weights (visible and versioned) ⚠ · contact tree and EAP data · shelters and routes · users, roles, certification · notification templates · model and data-source configuration.

**Rule.** Every change is versioned, attributed and audited. Changing a threshold is a recorded decision.

**Status:** ❌.

---

## S-18 — Audit

**Purpose.** Answer "what did the screen say at 02:14?" exactly.

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
