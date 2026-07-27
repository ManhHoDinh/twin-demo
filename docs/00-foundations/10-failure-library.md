# Failure library — disasters, mistakes and anti-patterns

Every product decision in this workspace can be traced to something in this file. When a feature is challenged, the answer should be "because of §X", not "because it seemed useful".

> Historical accounts here are summarised at the level of established public record. Casualty figures for several events remain disputed; where a number is given it is an order of magnitude, and precise figures must be checked before external citation.

---

## 1. Structural failures — what a dam failure actually costs

| Event | Year | Mechanism | Lesson encoded in this product |
|---|---|---|---|
| **Malpasset** (France) | 1959 | Arch dam foundation/abutment failure | Geology, not the dam body, was the weak link. Monitoring must watch the foundation, not just the wall. |
| **Vajont** (Italy) | 1963 | Landslide into the reservoir → overtopping wave; ~2000 deaths. **The dam did not fail.** | The reservoir's *surroundings* are part of the system. Warnings were disregarded because they were inconvenient. → [Dam safety §2](05-dam-safety.md), and the product rule that safety monitors cannot be overridden by an optimiser. |
| **Banqiao & Shimantan** (China) | 1975 | Extreme typhoon rainfall far beyond design; cascade of dam failures; catastrophic loss of life (tens of thousands to far higher, disputed) | Design floods can be exceeded. **Cascade domino failure is real.** Communications failed at the moment they were needed. → Cascade breach analysis, comms redundancy. |
| **Teton** (USA) | 1976 | Internal erosion/piping during first filling | Piping gives **hours** of warning at best, and the signature is turbid seepage. → Turbidity is a first-class alarm. |
| **Oroville spillway crisis** (USA) | 2017 | Main spillway chute failed under normal use; emergency spillway eroded; ~188 000 evacuated. **No dam failure.** | A *spillway* failure is a dam-safety emergency. Evacuation was ordered on hours of notice with poor information. → Pre-computed breach/emergency inundation library and pre-built notification tree. |
| **Xe-Pian Xe-Namnoy saddle dam** (Laos) | 2018 | Saddle dam collapse during construction-period filling in heavy rain | The weakest point may not be the main structure. Downstream communities had almost no warning. → All impounding structures modelled, not just the main dam. |
| **Derna** (Libya) | 2023 | Two dams failed in an extreme storm after years of deferred maintenance; thousands of deaths | Deferred maintenance + no functioning warning chain = mass casualties. → Maintenance state and EAP readiness are operational data, not paperwork. |

---

## 2. Operation-under-flood controversies — the failures this product exists to prevent

These are cases where the structure held but the *operation and communication* failed. They are the true product domain.

| Event | Year | What happened | Encoded lesson |
|---|---|---|---|
| **Central Vietnam, Typhoon Ketsana (bão số 9)** | 2009 | Severe basin-wide flooding across Quảng Nam / Đà Nẵng; public dispute over hydropower releases coinciding with the flood peak | The "did the dam make it worse?" argument arrives within days and is decided in public. → **The operation record must be publishable within hours**, with inflow, outflow and the counterfactual. |
| **Hố Hô hydropower, Hà Tĩnh** | 2016 | Sudden large release during heavy rain, downstream communities reported inadequate notice | Notification timing is the decisive fact after the event. → Notification lead time is a **hard constraint on the decision**, and every notification is logged with receipts. |
| **Chennai flood (Chembarambakkam)** | 2015 | Large reservoir release during an extreme urban rain event; contested whether release timing worsened the city flood | When a city is already flooding from local rain, a reservoir release becomes politically indistinguishable from the cause. → **Separate pluvial from fluvial contribution in the UI** and quantify the reservoir's actual share. |
| **Kerala floods** | 2018 | Multiple reservoirs near full at the onset of extreme rain; near-simultaneous releases from many dams; extensive downstream flooding | Reservoirs full *before* the peak season means zero buffer. Uncoordinated simultaneous release across many dams is the cascade failure mode. → Ceiling compliance monitoring + **cascade coordination as a core feature**. |
| **Thailand floods** | 2011 | Major reservoirs retained water early in the season, then were forced into large sustained releases as the season continued | Optimising for storage/economics early removes options later. → **"Regret of holding" must be shown alongside "regret of releasing"** in every proposal. |
| **Central Vietnam sequence (Linfa–Nangka–Molave–Vamco)** | Oct–Nov 2020 | Consecutive systems over weeks; catastrophic basin-wide flooding and landslides across central provinces, including the Rào Trăng 3 hydropower site landslide disaster | The killer was **cumulative saturation**, not any single storm. Landslide risk co-occurs with reservoir stress. → Antecedent wetness is a first-class state; multi-event sequences are a scenario class; landslide susceptibility belongs on the map. |
| **Typhoon Yagi, northern Vietnam** | Sep 2024 | Record flooding, widespread infrastructure damage including a bridge collapse; reservoir systems operated at extremes | Transport infrastructure fails during the event and invalidates evacuation plans. → **Routes must be evaluated against the forecast state, not the current state.** |

---

## 3. Recurring operational mistakes (the practitioner's list)

Ranked by how often they actually happen.

| # | Mistake | Why it happens | Product countermeasure |
|---|---|---|---|
| 1 | **Entering the storm above the flood ceiling** | Generation/revenue incentive; optimism about the forecast | Continuous ceiling-compliance monitor with a *seasonal* view; alert days ahead, not hours |
| 2 | **Waiting for certainty before pre-releasing** | Fear of the false-alarm cost; ambiguity of authority | Show the **decision deadline** and the asymmetric regret of both branches |
| 3 | **Trusting a single deterministic forecast** | It's the one on the wall | Ensemble-first UI; the deterministic run is one line among many |
| 4 | **Trusting a wrong inflow number** | It is displayed crisply, so it looks like a measurement | Inflow always with an error band + independent cross-check + divergence alarm |
| 5 | **Releasing into the tributary peak** | Only reservoir-side numbers were on screen | Routed arrival at the control point, with lateral inflow shown separately |
| 6 | **Simultaneous release from multiple dams** | Each operator locally rational, no shared view | Cascade coordination screen with the *combined* routed hydrograph |
| 7 | **Ramping too fast** | Urgency | Hard ramp limits in the proposal; downstream stage-rate preview |
| 8 | **Notifying after opening the gates** | Chain is manual and slow | Notification lead built into the decision deadline; one-click pre-drafted messages |
| 9 | **Believing a silent sensor** | Flat line looks like "stable" | Stale data is visually distinct everywhere; freshness is on every number |
| 10 | **Losing the decision rationale** | Nobody wrote it down at 03:00 | Reason-of-record is a required field on approval, 10 seconds to fill |
| 11 | **Different numbers from different offices** | Independent spreadsheets | One decision record, all channel messages generated from it |
| 12 | **Evacuation route already flooded** | Route checked at decision time only | Time-aware route viability, "open until HH:MM" |
| 13 | **Shelter inside the flood footprint** | Planned on paper, never checked against a map | Shelters validated against the inundation library at ingest, re-validated per event |
| 14 | **Alarm flood → everything ignored** | One alert per threshold per station per model run | Alarm design: deduplicate, group, escalate; every alarm actionable |
| 15 | **Model quietly relaxed a constraint to return an answer** | Solver engineering convenience | **Infeasibility must be reported as infeasibility** |
| 16 | **Post-event: no reconstruction possible** | Live system overwrote state | Append-only audit, snapshot-by-hash, exact replay |
| 17 | **Rapid drawdown damaging the dam** | Downstream-only thinking | Dam-side drawdown rate limit as a constraint |
| 18 | **Assuming the rating curve still holds** | It changed after the last big flood | Rating curve version + drift monitoring against independent estimates |
| 19 | **Public blames dam for a pluvial event** | No evidence available fast enough | Pluvial/fluvial attribution + publishable operation record |
| 20 | **Training only in calm conditions** | Real events are rare | Training/simulation mode with historical replay and injected failures |

---

## 4. Product anti-patterns (what similar software gets wrong)

| Anti-pattern | Why it is fatal | This product's rule |
|---|---|---|
| **The confident single number** | Removes the operator's ability to reason about risk; produces over-trust then abandonment | Every forecast quantity carries an uncertainty representation |
| **The black-box recommendation** | Cannot be defended in an inquiry; engineers reject it | Every proposal exposes inputs, constraints, counterfactual, sensitivity |
| **The always-green optimiser** | Hides infeasibility exactly when it matters | Infeasible is a first-class, loud outcome |
| **Beautiful 3D, unusable decisions** | Demos brilliantly, dies in operations | 3D is for briefing and public communication; the decision surface is dense, flat and fast |
| **Alert on everything** | Alarm fatigue; the real alert is missed | Alarm philosophy in [UX principles §4](../05-product/04-ux-principles.md) |
| **Requiring the internet during a typhoon** | Comms fail exactly then | Offline/degraded mode is a core requirement, not a nice-to-have |
| **"AI-powered" as the headline** | Officials cannot sign a decision attributed to an AI | The headline is *auditable decision support*; the AI is an implementation detail |
| **Assuming the operator has time to read** | They have 30 seconds | One-glance dashboard, one-page decision package, 20-second phone script |
| **Modelling only the controllable part** | Produces the illusion of control | Controllability ratio κ displayed; lateral and pluvial contributions always visible |
| **Hard-coding thresholds, boundaries, names** | They change by decree | All of it is dated, versioned configuration |
| **One UI for operators, officials and public** | Sensitive data leaks; nobody's needs met | Role-separated products from a shared core |
| **Treating the plan as the deliverable** | The deliverable is a *notified, acknowledged, recorded* action | The workflow ends at acknowledgement, not at the recommendation |

---

## 5. Landslides — the companion hazard that must not be forgotten

In steep, saturated terrain, the deadliest outcome is frequently **not** the flood but the landslide: it kills upstream, in the mountains, near the dams and their access roads and worker camps, often after the rain peak has passed.

Encoded requirements:
- Landslide susceptibility layer (slope × geology × land cover × antecedent rainfall) on the map.
- Rainfall intensity–duration threshold alarms for slope failure, separate from flood alarms.
- Access-road vulnerability for the dam sites themselves — a plant that cannot be reached cannot be operated or repaired.
- Reservoir-rim slope instability as a dam-safety input (the Vajont lesson).

`⚠ Not implemented in the reference application. Tracked in the risk register as R-09.`

---

## 6. How this file is used

1. Every requirement in the [PRD](../05-product/03-prd.md) cites the failure-library item it addresses.
2. Every red-team round in [critique](../06-critique/01-red-team-review.md) re-checks the design against §3 and §4.
3. A feature that has no entry here must justify its existence on other grounds — usually it is decoration.

---

**End of foundations.** → [Domain model: entity model](../01-domain-model/01-entity-model.md)
