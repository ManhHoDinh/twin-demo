# Operational workflow catalog

Twelve workflows covering the full operating envelope, from a quiet Tuesday to a dam emergency. Each states its trigger, actors, steps, the product's role, the decision points, failure modes, and exit criteria.

Authority in [decision rights](../02-stakeholders/02-decision-rights-raci.md) · thresholds in [decision trees](02-decision-trees.md) · messaging in [communication protocols](03-communication-protocols.md).

This catalog is the *overview* layer. The implementation-ready *specification* layer, with
the full per-workflow schema (actors, goals, inputs, outputs, entities, state transitions,
decision points, approvals, data sources, visualisations, interactions, failure cases, audit
trail, KPIs, acceptance criteria) and the decision-lifecycle classes, is in
[workflow specifications](04-workflow-specifications.md) §0.3 maps the two together.

---

## WF-01 — Daily operation (dry / normal)

**Trigger:** every day, 07:00 and 15:00 shift routine. **Actors:** P-01, P-02.
**Escalation level:** L0.

| # | Step | Product role |
|---|---|---|
| 1 | Review overnight state: levels, inflow, outflow, generation | Overnight summary auto-generated for the shift |
| 2 | Check rule-curve compliance for today's date | Compliance chip: within band / above ceiling / below target |
| 3 | Check forecast for the next 5 days | Watch-level rainfall outlook, no alarms |
| 4 | Check sensor and equipment health | Data health L0–L4; gate test status; overdue maintenance |
| 5 | Agree generation plan with dispatch | Generation availability view |
| 6 | Write shift handover | **Auto-drafted handover, human-edited** — one of the highest-value low-glamour features |

**Failure modes:** silent sensor drift accumulating unnoticed; ceiling non-compliance normalised over weeks.
**Exit:** handover accepted by the next shift.

> **Why the boring workflow matters most:** the product's credibility during the flood is built entirely here. If it is wrong on a quiet Tuesday, it is switched off on the bad Thursday. ([Failure library §4](../00-foundations/10-failure-library.md))

---

## WF-02 — Normal rainfall / seasonal watch

**Trigger:** forecast rainfall above the seasonal watch threshold, or the official watch bulletin. **Actors:** P-02, P-03, P-06. **Level:** L0 → L1.

1. Ingest official bulletin; display it as the authoritative layer alongside internal computation.
2. Update antecedent wetness state (API/soil moisture) — **the number that decides whether this matters**.
3. Run the forecast chain; produce inflow forecast per reservoir with uncertainty.
4. Check free storage and time-to-full against the forecast.
5. If ceiling compliance is at risk within the horizon, generate an early advisory drawdown option — **days ahead, when it is cheap.**
6. Confirm gate readiness, backup power, comms.

**Decision point:** *is a slow, cheap drawdown now better than a fast, expensive one later?* This is the highest-return decision in the entire catalogue and it is almost always made too late.
**Failure mode:** the "it's only moderate rain" dismissal on saturated ground.
**Exit:** either de-escalate to L0 or escalate to WF-03.

---

## WF-03 — Heavy rainfall / flood watch

**Trigger:** `P(BĐ2 at governing gauge) > 30 %` within 48 h. **Actors:** P-01…P-04, P-06. **Level:** L1 → L2.

1. Staff up: duty engineer on shift, plant manager notified, authority informed.
2. Full ensemble run; publish `P(exceed BĐ1/2/3)` per gauge per hour.
3. Compute **controllability κ** — is this a reservoir problem or a rainfall problem?
4. Generate the decision package: candidate release plans, constraint checks, counterfactual, alternatives, regret.
5. Compute the **decision deadline** and start the countdown.
6. Pre-notify downstream communes and the dispatch centre (advisory, not alarm).
7. Verify shelters, routes and assisted-evacuation lists are current.

**Decision point D-03:** approve, modify, reject or defer the pre-release.
**Failure modes:** waiting for certainty past the deadline; pre-releasing into an already-elevated river.
**Exit:** decision recorded with reason; escalate to WF-04/05 or stand down.

---

## WF-04 — Extreme rainfall / flood in progress

**Trigger:** BĐ2 exceeded or forecast `P(BĐ3) > 50 %` within 12 h. **Actors:** all. **Level:** L2 → L3.

1. Committee convened; command level confirmed and displayed.
2. Continuous re-forecast on the fastest cadence the data supports; **plan stability shown** (has the recommendation changed since the last cycle, and why).
3. Cascade coordination: combined routed hydrograph from all reservoirs at each control point.
4. Impact projection: people, homes, roads, isolated communities, by zone, by hour.
5. Evacuation decision support prepared for D-10, including route viability with `open until` times.
6. Public warning drafted from the decision record; approved; issued on all channels.
7. Log everything, continuously and automatically.

**Decision points:** D-04 spill increase · D-10 evacuation · D-11 road closures.
**Failure modes:** channel divergence; route directions issued against the current rather than the forecast state; alarm fatigue swamping the one alarm that mattered.
**Exit:** peak passes and stage falls below BĐ2 with a falling trend.

---

## WF-05 — Reservoir approaching full capacity

**Trigger:** `Z > Z_ceil − 0.5 m` with positive `dZ/dt`, or `time_to_ceiling < 12 h`. **Actors:** P-01, P-02, P-03, P-07, P-04. **Level:** L2/L3.

1. Display freeboard, `dZ/dt`, **time to ceiling / FSL / design level**.
2. Recompute the maximum absorbable volume and how long the buffer lasts at forecast inflow.
3. Determine the point of no return: after this time, pass-through is unavoidable.
4. Generate the release schedule that ends at pass-through with the **least downstream damage integral**, respecting ramp limits and notification lead.
5. **Announce the buffer-exhaustion transition explicitly** — internally and publicly.
6. Dam safety engineer reviews; instrumentation watch intensifies.

**The sentence that must appear:** *"From approximately HH:MM the reservoir can no longer reduce the flood; outflow will approximately equal inflow."*
**Failure mode:** delaying the increase until it must be made abruptly, converting a manageable ramp into a step change.
**Exit:** level stabilises below ceiling, or pass-through mode entered in a controlled way.

---

## WF-06 — Gate operation

**Trigger:** an approved release change. **Actors:** P-01, P-10, P-07. **Level:** any.

1. Convert target discharge → **legal, symmetric gate configuration** from the discrete achievable set.
2. Pre-checks: hoist power, gate status, `n−1` contingency, downstream notification confirmed **sent and acknowledged**.
3. Confirm the notification lead has elapsed. **Blocking check — no exceptions below L5.**
4. Execute step by step in SCADA (outside this product), logging each step and time.
5. Verify `commanded == actual` for every gate after every step ⚠.
6. Monitor downstream stage-rise rate against the limit; pause if exceeded.
7. Record the achieved outflow and reconcile against the plan.

**Failure modes:** asymmetric opening; a gate that does not move; notification skipped "because there's no time" — which is precisely when it matters.
**Exit:** target outflow achieved and stable; log complete.

---

## WF-07 — Controlled release (planned, non-emergency)

**Trigger:** approved pre-release or scheduled drawdown. **Actors:** P-02, P-01, P-04, communes. **Level:** L1/L2.

1. Publish the schedule: start, ramp, target, expected duration, expected downstream stage at each control point with times.
2. Notify at least the statutory lead ahead; obtain **acknowledgement**, not just delivery.
3. Execute per WF-06.
4. Monitor observed vs predicted downstream stage; **if divergence exceeds the band, pause and re-evaluate** — the model may be wrong.
5. Publish the running record.

**Decision point:** continue / hold / reverse on divergence.
**Failure mode:** treating the plan as fixed after reality departs from it.
**Exit:** target reached, downstream within predicted band.

---

## WF-08 — Emergency release (dam safety driven)

**Trigger:** D-06 — dam safety threatened. **Actors:** P-07 accountable, P-03, P-01, P-04 informed. **Level:** L4/L5.

1. **Optimiser disabled and visibly disabled.** Downstream optimisation is no longer the objective.
2. Compute maximum safe discharge and the resulting downstream hydrograph and arrival times.
3. Immediate notification on **all** channels simultaneously — no approval queue, pre-authorised by the escalation ladder.
4. Evacuation triggered on arrival times, not on stage thresholds.
5. Continuous instrumentation watch; EAP level tracking.
6. Every action auto-logged; no manual reporting burden during the emergency.

**Failure mode:** attempting to balance downstream impact against dam safety. **This trade does not exist.** The product must not offer it.
**Exit:** structure stabilised; controlled operation resumed under explicit authorisation.

---

## WF-09 — Downstream notification

**Trigger:** any decision affecting downstream water level, or any threshold crossing. **Actors:** P-03/P-04 approve, system executes, communes receive. **Level:** ≥ L1.

1. Generate **one decision record** → all channel variants from it (SMS, Zalo, call script, siren code, loudspeaker script, CAP feed, media release, app push).
2. Human approval on the message set (one approval, all channels).
3. Dispatch; track delivery per channel.
4. Track **acknowledgement** from each commune contact; escalate to a phone call for non-acknowledged after N minutes.
5. Publish the same content publicly so citizens can verify what their commune was told.
6. Log everything.

**Failure modes:** channel divergence (solved structurally by generating from one record); silence mistaken for acknowledgement; night-time non-reception.
**Exit:** all required recipients acknowledged, or escalated with the exception recorded.

> **This workflow is where forecasts become safety.** It deserves as much engineering as the hydrology.

---

## WF-10 — Evacuation

**Trigger:** D-10. **Actors:** P-04 accountable, P-05 executes, communes, P-09. **Level:** L4.

1. Define the evacuation zone from the **forecast** footprint at the relevant hour, not the current footprint.
2. Compute per-zone: people to move, assisted cases, transport needed, shelter allocation, and route viability with `open until` times.
3. Verify shelters: capacity, not in the footprint, accessible, resourced.
4. Issue orders per WF-09 with a **specific destination per zone** — not "move to higher ground".
5. Track progress: zone reported clear / partial / not started; occupancy at each shelter.
6. Continuously re-check route viability; re-route and re-notify as roads close.
7. Flag isolated communities requiring boat/air response.

**Failure modes:** routes flooding mid-movement; shelter over-capacity; households refusing to leave livestock; night evacuation.
**Exit:** zones reported clear or accounted for; assisted cases individually confirmed.

---

## WF-11 — Communication and public information

**Trigger:** continuous during ≥ L2. **Actors:** P-04, media, P-09.

1. Fixed-cadence public updates (e.g. every 3 h at L2, hourly at L3+) **even when nothing has changed** — silence is interpreted as either safety or concealment, both harmful.
2. Plain-language impact statements with landmarks, not stages.
3. Publish the reservoir operation record live: inflow, outflow, level, absorbed volume.
4. Answer "is the dam causing this?" **pre-emptively**, with the pluvial/fluvial split and the counterfactual.
5. Issue an explicit **all-clear**, and afterwards a **false-alarm explanation** when applicable.

**Failure mode:** letting the narrative form for 48 h before the data appears. The argument is decided in the first 72 hours ([failure library §2](../00-foundations/10-failure-library.md)).
**Exit:** all-clear issued and acknowledged by media/public channels.

---

## WF-12 — Post-flood review

**Trigger:** all-clear + 24 h. **Actors:** all, plus researchers. **Level:** L0.

1. **Timeline reconstruction from the audit trail** — what was known, decided, sent, when. Automatic.
2. Forecast verification: peak error, timing error, `P(exceed)` reliability, false-alarm accounting.
3. Operation review: was the procedure followed; what did the reservoirs actually absorb; what would the counterfactual have produced.
4. **High-water mark survey** within days — the only way to validate the inundation model.
5. Impact assessment vs prediction; recalibrate exposure and damage functions.
6. After-action review against the warning chain ([warning §1](../00-foundations/07-warning-and-emergency-management.md)); identify which link failed.
7. Publish the operation record and the review.
8. Feed the event into the scenario library for training ([simulation](../04-decision-support/03-simulation-and-scenarios.md)).

**Failure mode:** the review that is never written because everyone is exhausted. **Countermeasure: 80 % of it must be auto-generated from the audit trail within one hour of the all-clear.**
**Exit:** review published; calibration updated; scenario archived; actions assigned.

---

## Cross-workflow requirements

| # | Requirement | Workflows |
|---|---|---|
| X-1 | Every state change is logged automatically, with actor and time | all |
| X-2 | Every decision requires a reason of record (≤ 30 s to enter) | 03,04,05,07,08,10 |
| X-3 | Every notification is generated from the decision record | 07,08,09,10,11 |
| X-4 | Every workflow has a defined exit and de-escalation criterion | all |
| X-5 | Every workflow is executable at operating level L2 (degraded data) | all |
| X-6 | Every workflow is exercisable in training mode with injected failures | all |
| X-7 | No workflow requires the internet to complete its safety-critical path | 06,08,09,10 |

---

**Next:** [Decision trees →](02-decision-trees.md)
