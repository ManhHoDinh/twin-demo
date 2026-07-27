# Warning and emergency management

A forecast that does not change what a person does is worth zero. This chapter is about converting hydrology into behaviour.

---

## 1. The warning chain and where it breaks

```
Observation → Forecast → Interpretation → Decision → Dissemination → Reception → Comprehension → Belief → Action
```

Historical post-event reviews consistently find the failure is **rarely** in the first two links. It is in the last five.

| Link | Typical failure | Product countermeasure |
|---|---|---|
| Interpretation | Technical stage numbers nobody can act on | Translate to **impact**: "water 0.8 m deep in Ward X, road Y closed" |
| Decision | Nobody is sure who has authority | [Decision rights](../02-stakeholders/02-decision-rights-raci.md) built into the workflow |
| Dissemination | One channel, which happens to be down | Multi-channel, with delivery receipts |
| Reception | Message arrives at 03:00 to a silent phone | Loud channels: sirens, loudspeakers, door-knock lists |
| Comprehension | Jargon, or "BĐ3" meaning nothing to a citizen | Plain-language templates, local landmarks |
| Belief | "It flooded last time and nothing happened" | Consistency, calibration, and honest false-alarm accounting |
| Action | No route, no shelter, no transport, won't leave livestock | Evacuation route + shelter capacity + assistance flags in the same message |

**"The last mile" is not a technology problem.** It is a trust and specificity problem. The product's contribution is *specificity*: this street, this depth, this hour, this route, this shelter.

---

## 2. Lead time budget — the only chart that matters

```
T_available = T_hazard_arrival − T_now

T_needed = t_analysis + t_decision + t_approval + t_dissemination + t_public_response + t_movement
```

Indicative values for a Vietnamese provincial context:

| Component | Typical |
|---|---|
| `t_analysis` (forecast → interpreted impact) | 15–45 min (target: < 5 min with the product) |
| `t_decision` (operator/committee) | 15–60 min |
| `t_approval` (authority chain) | 15–120 min ← usually the largest and least visible |
| `t_dissemination` (all channels reached) | 10–30 min |
| `t_public_response` (hear → believe → begin) | 30–120 min, worse at night |
| `t_movement` (to shelter, with vulnerable people) | 30 min – 3 h, worse when roads already flooding |
| **Total** | **2–7 hours** |

> **This is the central operational insight of the whole product.** If total required time is 2–7 h and useful hydrological lead time is 3–8 h downstream, the margin is thin to negative. **Therefore the highest-value thing the product can do is not improve the forecast — it is compress `t_analysis`, `t_decision`, `t_approval` and `t_dissemination` from hours to minutes.** Everything in the [screen catalog](../05-product/02-screen-catalog.md) that looks like "workflow plumbing" is actually lead-time engineering.

**Product requirement (FR-16):** the dashboard shows a live **lead-time budget bar** — time until hazard, minus the configured chain durations — turning red when the decision deadline passes. See [S-01](../05-product/02-screen-catalog.md).

---

## 3. Warning content: what a usable message contains

Research on protective-action decision-making (Mileti and successors; WMO guidance) converges on a consistent set. A warning must state:

| Element | Bad | Good |
|---|---|---|
| **Hazard** | "Flood warning" | "River water entering homes" |
| **Location** | "Đại Lộc district" | "Villages A, B, C along the left bank between the bridge and the market" |
| **Timing** | "Soon" | "Water reaches your area between 02:00 and 04:00 tonight" |
| **Magnitude/impact** | "BĐ3" | "0.8–1.2 m deep — above the floor of most single-storey houses" |
| **Guidance** | "Be careful" | "Move to the second floor or to Trường THCS X; take medicine and documents" |
| **Source** | anonymous | "Ban Chỉ huy PCTT&TKCN huyện Đại Lộc" |
| **Confidence** | absent | "This is likely; we will update at 22:00" |

**Consistency across channels is a safety property.** Contradictory numbers from the plant, the province and the media destroy compliance. The product must generate all channel variants **from one decision record**, so they cannot diverge. That single design decision solves a recurring real-world failure. See [communication protocols](../03-operations/03-communication-protocols.md).

---

## 4. Standards worth conforming to

| Standard | What it gives |
|---|---|
| **CAP (Common Alerting Protocol, OASIS)** | A structured alert format: category, urgency, severity, certainty, area polygon, expiry, instruction. Machine-routable to sirens, cell broadcast, apps. |
| **WMO impact-based forecast and warning guidance** | Warn on *impact*, not on threshold crossing: `impact = f(hazard, exposure, vulnerability)` |
| **Common alerting matrix** | Likelihood × Impact → colour (green/yellow/orange/red) |
| **Sphere / IFRC EWS "four elements"** | Risk knowledge · Monitoring · Dissemination · Response capability — a system missing any one fails |

**Impact-based warning matrix** (adopt this directly):

```
            IMPACT →
LIKELIHOOD  Minimal    Minor     Significant  Severe
  Very high  Yellow    Amber     Red          Red
  Likely     Yellow    Amber     Amber        Red
  Possible   Green     Yellow    Amber        Amber
  Unlikely   Green     Green     Yellow       Yellow
```

This matrix is *the* reason a product needs both an exceedance probability **and** an exposure estimate: neither alone determines the colour. Both live in the [decision engine](../04-decision-support/01-decision-engine-spec.md).

---

## 5. Evacuation

**Two modes:**
- **Vertical** — move up within the same building. Fast, cheap, preferred where buildings are strong and depth is moderate. Fails for single-storey housing and long-duration flooding (no water, no food, no toilet, no medical access).
- **Horizontal** — move to a shelter. Needs routes, transport, capacity, and time.

**Route viability is dynamic.** A route that is open at decision time may be cut before people finish moving. The product must evaluate routes against the **forecast** flood state at the *time of use*, not the current state.

> **This is a specific, high-value product capability and a specific, dangerous bug class.** Directing people onto a road that will be under 0.4 m of water in 90 minutes is worse than giving no direction. Requirement: route evaluation is time-aware and must show *"open until ~HH:MM"* rather than a binary open/closed. The reference demo already closes roads at ≥ 0.30 m using the *current* field — upgrading this to forecast-time-aware is a tracked change.

**Shelter model must carry:** capacity, current occupancy, elevation, access route, backup power, water, medical, and whether it is itself in the flood footprint. A shelter inside the inundation zone is a common and lethal planning error.

**Vulnerable groups needing assisted evacuation:** elderly, disabled, hospital inpatients, pregnant, children in boarding schools, prisoners, isolated households, tourists (Hội An), and people who will not leave livestock or property. Each requires a named plan, not an aggregate number.

---

## 6. Post-event

| Step | Purpose |
|---|---|
| **Rapid impact assessment (24–72 h)** | Where to send help |
| **High-water mark survey** | The only way to validate the inundation model. Do it within days, before marks are lost. |
| **Timeline reconstruction** | Exactly what was known, decided and sent, when — from the audit log |
| **Forecast verification** | Peak error, timing error, false alarm accounting |
| **After-action review** | What failed in the chain of §1 |
| **Model recalibration** | Feed the event into the calibration set |
| **Public accounting** | Publish the reservoir operation record. In Vietnam, the "did the dam cause the flood?" argument is decided in public within 72 hours, with or without evidence. |

> **Post-flood review is a first-class product screen, not an afterthought.** It is where trust is rebuilt or lost, and it is the strongest institutional reason to buy an auditable system. See [S-11 Reports](../05-product/02-screen-catalog.md) and [WF-12](../03-operations/01-workflow-catalog.md).

---

## 7. Human response — what people actually do

Encoded from disaster-behaviour research and repeated post-event findings:

1. **People do not panic.** They seek confirmation — from neighbours, family, a second source. Warning systems should assume *confirmation-seeking*, not stampede. Provide a checkable public source.
2. **First response is to protect property**, not to leave. Give people something to do that is compatible with leaving (raise goods, then go).
3. **Repeated warnings that don't materialise reduce compliance**, but *explained* false alarms much less so. Publish why: "the storm turned north; the release was not needed."
4. **Night warnings have far lower reception.** Loud channels and door-knocking are required; the product should flag night-time hazard arrival as a distinct escalation.
5. **People die in vehicles.** A large share of flood deaths are motorists/motorcyclists entering flooded roads. Road-closure information is therefore *life-safety* information, and belongs in the public product, not only the operator product.
6. **Tourists and non-residents have no local knowledge.** In Hội An this is a first-order concern.

---

## 8. Reference implementation status

| Element | Status | Gap |
|---|---|---|
| BĐ threshold events | ✅ `scanEvents` | Threshold-based, not impact-based |
| Zone-level exposure and actions | ✅ `js/zones.js` (12 zones, depth/exposure/EOC access/actions) | Good foundation |
| Road closure ≥ 0.30 m + rerouting | ✅ `js/traffic.js` | **Uses current state, not forecast state** |
| Lead-time budget | ❌ | **Missing — [FR-16], highest-value addition** |
| CAP-structured alert output | ❌ | Missing |
| Impact-based warning matrix | ❌ | Missing |
| Shelters, capacity, assisted-evacuation lists | ❌ | Missing entirely |
| Message templates per channel, one source | ❌ | Missing |
| Delivery/acknowledgement tracking | ❌ | Missing |
| Post-event review screen | ⚠ print report exists | Not a structured review |

---

**Next:** [Vietnamese regulatory framework →](08-regulatory-vietnam.md)
