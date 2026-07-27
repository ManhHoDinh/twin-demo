# Personas

Ten stakeholders. Each entry states what they are accountable for, what they actually do during an event, what they need from the product, and — most importantly — **what makes them stop using it**.

Decision authority is formalised in [decision rights](02-decision-rights-raci.md). Workflows are in [workflow catalog](../03-operations/01-workflow-catalog.md).

---

## P-01 — Control Room Operator (Trực ban vận hành)

**Who.** 28–45, technical college or engineering degree, 12-hour shifts, sits in front of the SCADA HMI at the dam. Has seen three or four serious floods.

**Accountable for.** Executing the operating order correctly and on time. Logging everything. Escalating.

**During an event.** Watches level and inflow. Takes calls from the plant manager and the province. Physically commands gate movements. Writes the shift log. Often the only person awake at 03:00 who can see what is happening.

**Needs.**
- Level, inflow, outflow, freeboard, **time to ceiling** on one screen, updating without a click.
- The current *order*: what discharge, by when, with which gates.
- A countdown to the next required action.
- One-tap logging of what was actually done, with the time.
- Something to read aloud on the phone in 20 seconds.

**Kills the product.** Any screen that takes more than a glance. Any modal dialog during an event. Any number that disagrees with the SCADA HMI without explanation. Login timeouts. Anything requiring a mouse-heavy interaction while holding a phone.

**Design consequence.** The operator view is a **fixed-layout, always-on, no-scroll** screen with large type, and it must be readable from two metres. See [S-06](../05-product/02-screen-catalog.md).

---

## P-02 — Reservoir Operation Engineer / Duty Hydrologist (Kỹ sư vận hành hồ)

**Who.** 35–55, water resources engineering, 10–25 years, the person who actually decides what to propose. The most important user of this product.

**Accountable for.** Proposing releases that satisfy the operating procedure, keep the dam safe, and keep the downstream control point below its cap.

**During an event.** Reads the forecast, computes inflow, works out how much buffer exists and how long it lasts, drafts the release plan, defends it to the plant manager and the province, revises it every few hours.

**Needs.**
- Inflow **with its uncertainty**, and a way to sanity-check it independently.
- Free storage and time-to-full at current net inflow.
- The routed downstream consequence of a candidate release, at the control point, with tide included.
- The **counterfactual**: what happens if nothing changes.
- The **binding constraint**: which limit is actually stopping a better plan.
- 2–3 alternatives with explicit trade-offs.
- The ability to override any assumption and see the result immediately.

**Kills the product.** A black-box recommendation. An optimiser that always returns green. Being unable to reproduce a number by hand. Silent constraint relaxation. Anything that feels like it is trying to make the decision for them.

**Design consequence.** Every proposal exposes inputs, constraint list, counterfactual, sensitivity and alternatives — [decision engine §6](../04-decision-support/01-decision-engine-spec.md). This persona is the product's toughest and most valuable critic; if they trust it, the rest follows.

---

## P-03 — Hydropower Plant Manager (Giám đốc nhà máy)

**Who.** 40–60, engineer-turned-manager. Answers to the company for revenue and to the state for safety.

**Accountable for.** Plant safety, regulatory compliance, generation revenue, staff safety, the company's public position after the event.

**During an event.** Approves the operator's plan, talks to the province and the dispatch centre, decides on staffing and evacuation of plant personnel, handles the media.

**Needs.**
- A one-page decision package they can sign and forward.
- The **compliance status** against the operating procedure, explicitly.
- The economic consequence (generation foregone) — visible, but subordinate.
- Evidence they can publish: "here is our inflow, here is our outflow, here is what we absorbed."
- A record that they notified the right people at the right time.

**Kills the product.** Anything that cannot be printed and signed. Recommendations that would put them outside the procedure. Numbers that differ from what the province is seeing.

**Design consequence.** The **one-page decision package** and the **publishable operation record** are first-class outputs, not exports bolted on later.

---

## P-04 — Provincial / City Authority Officer (Cán bộ Ban Chỉ huy PCTT&TKCN)

**Who.** 35–55, administrator with technical staff support. Since the 2025 reorganisation, the city/province level sits directly above commune level ([regulatory §5](../00-foundations/08-regulatory-vietnam.md#5-administrative-reform-2025--a-live-product-risk)).

**Accountable for.** Ordering releases within their authority, ordering evacuations, allocating resources, and answering to the public and to central government.

**During an event.** Chairs the committee. Receives reports from every direction. Must decide on evacuation with incomplete information, then defend it.

**Needs.**
- **Impact, not hydrology.** How many people, which communes, what depth, when.
- A clear, single recommendation with a deadline.
- The confidence and the downside of being wrong in each direction.
- A ready-to-send instruction to commune level.
- A record of who was told what and when.

**Kills the product.** Technical jargon. BĐ stages with no impact translation. Two systems showing different numbers. Anything that takes more than a minute to understand in a meeting.

**Design consequence.** [S-02 Situation](../05-product/02-screen-catalog.md) is impact-first and jargon-free; every technical quantity has a plain-language equivalent.

---

## P-05 — Emergency Commander (Chỉ huy ứng phó hiện trường)

**Who.** 35–55, often military/police/civil defence background. Runs the physical response.

**Accountable for.** Getting people out alive; deploying teams, boats and vehicles; not losing responders.

**During an event.** Moves. Works from a vehicle or a commune office on a phone. Poor connectivity. Needs to know which roads are open *now* and *in two hours*.

**Needs.**
- A map that works on a phone, offline, with the last-known state and its timestamp.
- **Route viability with a time horizon** — "open until ~02:30".
- Zone priority list: where to go first.
- Team positions and what is reachable from where.
- Isolated communities, flagged loudly.
- Assisted-evacuation lists for their area.

**Kills the product.** Requiring connectivity. Heavy 3D. Anything that shows only the current state when they need the next three hours. Not showing data age.

**Design consequence.** [S-14 Field mode](../05-product/02-screen-catalog.md) — offline-capable, low-bandwidth, phone-first, timestamp always visible. This persona is the reason offline is a requirement, not a feature.

---

## P-06 — Meteorologist / Hydrological Forecaster (Dự báo viên KTTV)

**Who.** 30–50, meteorology/hydrology, works at the regional hydro-meteorological station. **Issues the official forecast** — an authority the product does not have.

**Accountable for.** The official bulletin's accuracy and timeliness.

**During an event.** Analyses models, issues bulletins on a fixed cycle, fields questions from everyone.

**Needs.**
- Ensemble tools, not a single answer.
- Verification statistics — their professional credibility is measurable.
- The ability to **override** the product's automated interpretation with their professional judgement, with that override recorded and attributed.
- Clear separation between "official bulletin" and "this system's internal computation".

**Kills the product.** Any implication that the product's number supersedes the official bulletin. Unverified skill claims. Presenting an AI model output as authoritative.

**Design consequence.** Official bulletins are displayed as a distinct, privileged layer. Forecaster override is a designed feature, not a workaround. [FR-27 verification screen](../05-product/03-prd.md) exists partly for this persona's trust.

---

## P-07 — Dam Safety Engineer (Kỹ sư an toàn đập)

**Who.** 40–60, civil/geotechnical. Often not on site daily; arrives when something is wrong.

**Accountable for.** Structural integrity. Has veto power that outranks everything.

**During an event.** Watches instrumentation — seepage, turbidity, piezometers, deformation. Decides whether to activate the EAP.

**Needs.**
- Instrumentation trends with alarms, **separate from the operational dashboard**.
- Freeboard, rate of rise, time to design/check level.
- Gate commanded-vs-actual, always.
- The EAP as live structured data with triggers evaluated automatically.
- The rapid-drawdown rate constraint respected in every proposal.

**Kills the product.** Safety indicators buried inside an operational summary. An optimiser that appears to trade safety margin. Any hint of automated actuation.

**Design consequence.** Dam safety is an **independent monitor with veto**, never a term in the objective function — [dam safety §1](../00-foundations/05-dam-safety.md).

---

## P-08 — Power Dispatch Centre Engineer (Điều độ hệ thống điện)

**Who.** 30–50, power systems. Cares about grid balance, not floods.

**Accountable for.** Grid stability and dispatch schedules.

**During an event.** Needs to know how much generation is about to disappear or surge, and when — so the grid can be rebalanced.

**Needs.** Forecast generation availability from each plant with lead time; notification when flood operation will override dispatch; expected duration.

**Kills the product.** Being surprised. Learning about a mode change after it happens.

**Design consequence.** Dispatch is a **notification audience** in the communication matrix, and generation impact is a computed, published output — not because it competes with safety, but because failing to inform the grid creates a second emergency. See [decision engine §3](../04-decision-support/01-decision-engine-spec.md).

---

## P-09 — Citizen (Người dân vùng hạ du)

**Who.** Everyone from a farmer in Đại Lộc with livestock to a shop owner in Hội An to a tourist who arrived yesterday. Smartphone penetration is high; trust in official messaging varies; flood experience is deep but calibrated to *past* floods.

**Accountable for.** Their own family. Will protect property before leaving. Will not leave livestock without a plan for it.

**During an event.** Checks the phone, calls relatives, looks at the water, asks neighbours, decides.

**Needs.**
- "Will *my house* flood, how deep, and when?" — in plain language, with a landmark reference.
- Is my road open? Where do I go? Is there a shelter that takes my family and my situation?
- Who says so, and can I check?
- Updates when the picture changes, and an explicit **all-clear**.

**Kills the product.** Jargon (BĐ3 means nothing). A generic province-wide message. Being warned and having nothing happen, with no explanation afterward. An app that fails when the network is congested.

**Design consequence.** [S-15 Public view](../05-product/02-screen-catalog.md): separate, simplified, no sensitive infrastructure data, works on a weak connection, and **explains false alarms afterwards** — the single most effective trust-preserving feature available.

---

## P-10 — Maintenance / Field Team Lead (Đội trưởng vận hành – bảo trì)

**Who.** 30–50, technician. Fixes gates, generators, sensors and roads, in the rain, at night.

**Accountable for.** Equipment availability and their crew's safety.

**During an event.** Checks gate hoists and backup power before the peak; responds to faults; may be sent onto a road that is about to flood.

**Needs.** Equipment status and known defects; a pre-event readiness checklist; **their own safety** — is the road they are on about to close, and when; the ability to report a fault from the field in seconds.

**Kills the product.** Being dispatched without route/timing information. No offline capability.

**Design consequence.** Field reporting and route-safety warnings serve responders, not just civilians. Crew safety is an explicit output of the road model.

---

## Secondary stakeholders (modelled, lower depth)

| Stakeholder | Primary interest | Product touchpoint |
|---|---|---|
| **National government / ministry** | Cross-basin oversight, national risk level, resource allocation | Aggregated status feed, standard reporting |
| **Environmental scientist** | Ecological flow, sediment, salinity intrusion, water quality after release | Environmental impact indicator in the proposal; post-event data |
| **Media** | A clear, sourced story within hours | Publishable operation record; press-ready situation report |
| **Insurance / finance** | Exposure and loss estimation | Post-event loss dataset (indicative only) |
| **Researchers** | Calibration data, event archive | Event archive export |
| **Water supply utility** | Intake availability, salinity, turbidity | Dry-season and post-flood views; diversion impact |
| **Tour operators / hotels (Hội An)** | Guest safety, closure decisions | Public view + business notification tier |

---

## Cross-persona truths

1. **Everyone wants a different number from the same event.** Operator wants freeboard; province wants people; commander wants roads; citizen wants their street. One model, many views.
2. **Nobody has time.** The 30-second rule applies to every persona under stress.
3. **Everyone will be asked to justify their decision.** The audit trail serves all of them.
4. **Trust is earned in calm weeks.** Every persona judges the product by whether it was right when it did not matter.
5. **The product is used by people who will be blamed.** Design for defensibility, not just for insight.

---

**Next:** [Decision rights and RACI →](02-decision-rights-raci.md)
