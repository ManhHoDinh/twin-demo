# Simulation, scenarios and training

Simulation serves four distinct purposes, and conflating them is dangerous. A training run must never be mistaken for an operational forecast.

---

## 1. The four modes

| Mode | Question | Data | Visual marker | May be published? |
|---|---|---|---|---|
| **REPLAY** | What happened, and what would have happened otherwise? | Historical observations | Purple frame + "REPLAY — 11/10/2020" | ✔ with the label |
| **LIVE** | What is happening and what should we do? | Live feeds + current forecast | No frame (the default) | ✔ |
| **WHAT-IF** | What if we did X instead? | Live state + hypothetical action | Amber frame + "WHAT-IF — not an order" | ✔ with the label |
| **TRAINING** | Can the team handle this? | Synthetic or replayed, clock-shifted | **Red diagonal watermark across every screen** | ✘ **hard block** |

**Non-negotiable rules:**
1. Mode is visible on **every screen, every export, every print, every message draft** — not a menu setting you have to remember.
2. **Training mode cannot send a real notification.** Not "warns you first" — cannot. A separate, clearly-marked sandbox notification path.
3. Switching out of training requires an explicit confirmation and is logged.
4. Any artefact produced in TRAINING or from SYNTHETIC data is watermarked in the file itself, not just on screen.

> The reference application currently runs entirely on synthetic hydrology with a footer disclaimer. That is adequate for a research demo and **inadequate for a product**: the marker must be structural (frame + watermark on exports), not a line of small text. **P0 change.**

---

## 2. Historical replay

**Purpose.** Validation, training, public accountability, and the most persuasive demonstration the product has.

**Requirements:**
- Load a real event with its actual observations, actual operations and actual outcomes.
- **Replay must show what was *knowable at each moment*, not what we know now.** Showing the operator a perfect hindcast forecast teaches the wrong lesson and makes past decisions look stupid. The replay clock governs data availability.
- Scrub, pause, and step through the timeline.
- Overlay the **counterfactual**: what the product would have recommended, and what would have followed.
- Compare predicted vs observed at every gauge.

**Reference events for VGTB:** the October 2020 sequence (the memory anchor everyone in the basin shares), a Yagi-class worst-credible construction, and a routine monsoon surge — plus, critically, **a false-alarm event**.

> **Replay of the event everyone in the room lived through is the single most convincing thing this product can do in a sales meeting or a training session** — provided it is honest about what was knowable at the time.

---

## 3. What-if analysis

**Purpose.** The engineer's sandbox, and the committee's argument-settler.

**Adjustable:** release schedules per reservoir, start times, ramp rates, rainfall multiplier, rainfall timing shift, tide phase, antecedent wetness, sensor/gate failures, ensemble member selection, downstream constraint values.

**Output:** side-by-side comparison against the current plan — peak stage at each control point, people exposed, homes flooded, roads closed, energy foregone, constraint violations, and **which constraint becomes binding**.

**Design requirements:**
- **Under 10 seconds**, or it will not be used in a meeting.
- Always shown against a baseline; a what-if with no comparison is meaningless.
- **A what-if can be promoted to a proposal**, carrying its assumptions into the decision record — this is how an engineer's judgement enters the audit trail properly.
- Amber framing throughout. Nobody must ever mistake a what-if for an order.

**The demonstration that changes minds:** shift a release 3 hours earlier and show the downstream peak drop more than it does from halving the release volume. That single interaction teaches cascade timing better than any document. ([hydraulics §4](../00-foundations/03-hydraulics-and-routing.md))

---

## 4. Scenario library

| Class | Purpose | Examples |
|---|---|---|
| **Historical** | Validation, training, credibility | Oct 2020, Ketsana-class, the last three seasons |
| **Design** | Planning, capacity assessment | 1 %, 0.5 %, PMF-class inflow |
| **Worst credible** | Stress testing | Yagi-class on saturated ground |
| **Compound** ⚠ | The under-modelled killer | River peak + spring high tide + storm surge |
| **Sequence** ⚠ | The Oct-2020 lesson | Three systems in ten days, no drying between |
| **Failure injection** ⚠ | Resilience | Gauge loss, comms loss, gate failure, power loss, road cut to the dam |
| **False alarm** ⚠ | Honest cost accounting | Pre-release for a storm that turns away |
| **Dam emergency** | EAP exercise | Piping indication, spillway damage, breach |
| **Best case** | Establishing the upper bound of benefit | Perfect forecast, perfect coordination — the ceiling on what optimisation can deliver |

The four marked ⚠ are the ones normally missing from flood-simulation products, and they are the ones that produce the useful learning. **A team that has only ever trained on clean data during a textbook flood is untrained.**

**Best-case scenarios matter for honesty:** running with a perfect forecast establishes the maximum achievable benefit. If perfect foresight only buys 0.4 m at Ái Nghĩa in a Yagi-class event, then no amount of AI will buy more, and the product should say so rather than imply otherwise.

---

## 5. Cascade simulation

Requirements specific to multi-reservoir simulation:
- All reservoirs advance on a **shared clock** with correct routing delays between them.
- Upstream releases become downstream inflows with the proper lag.
- The **diversion** (Đắk Mi 4 → Thu Bồn) moves water between river systems and must be visible on both.
- The **bifurcation** (Quảng Huế) splits flow with a stage-dependent ratio and its uncertainty.
- Simultaneous-release effects are the point of the exercise: the combined routed hydrograph at each control point is the primary output.
- **Domino breach analysis:** an upstream failure's hydrograph becomes the downstream dam's inflow. ([dam safety §2.3](../00-foundations/05-dam-safety.md))

---

## 6. Breach and emergency libraries — pre-computed, never live

For each dam and each credible breach mode, pre-compute and store:
`breach hydrograph · arrival time per community · maximum depth per community · maximum velocity · duration · safe assembly areas · evacuation timings`

**Why pre-computed:** during a dam emergency you have neither the compute time nor the right to gamble on a solver converging. Look-up is instant, deterministic, reproducible and auditable.

The same argument applies to the **operational inundation library** for routine flooding: interpolate `(discharge, tide, breach state) → depth grid` at run time; reserve live 2D for the simulation screen. ([hydraulics §6](../00-foundations/03-hydraulics-and-routing.md))

---

## 7. Operator training mode

**Purpose.** Rare events mean thin experience. Training is where competence is manufactured.

**Design:**

| Feature | Requirement |
|---|---|
| Scenario injection | Instructor selects the event and the failures to inject |
| **Clock control** | Accelerate 1×–60×, pause, rewind — reality does not wait, but training must |
| Realistic degradation | Gauges fail, comms drop, a gate jams, the forecast is wrong |
| Full workflow | The trainee performs the **entire chain**, including notification drafting and acknowledgement |
| Decision capture | Every decision, its timing, its reason of record |
| **Debrief** | Timeline vs the "good" reference path; where time was lost; which constraints were missed |
| Scoring | Peak outcome, constraint compliance, **decision latency**, notification completeness |
| Certification | Track who has trained on which scenario classes and when |
| **Absolute isolation** | Red watermark; no real notifications; no writes to the operational record |

**Debrief metrics that matter:**
1. **Time from trigger to decision** — the compressible part of the lead-time budget.
2. **Constraint violations proposed** — did they try to do something unsafe?
3. **Notification completeness and timing** — did the right people get told in time?
4. **Did they recognise the honest-null case** — the flood that was not controllable?
5. **Did they recognise infeasibility** and escalate rather than improvise?

> **Training mode is not a secondary feature.** For a government or utility customer it is frequently the *purchasing* justification, because it produces something auditable: a record that named staff have been trained on named scenarios. It is also the safest possible way to build trust in the product before an event.

---

## 8. Determinism and reproducibility

| Requirement | Reason |
|---|---|
| Same inputs + same versions → identical outputs, bit for bit | Post-event inquiry; regression testing |
| Random seeds recorded in the scenario | Reproducible ensembles |
| Model, parameter, threshold and rulebook versions stored with every run | "Which version produced this?" must be answerable |
| Input snapshot hashed, not re-queried | Data changes; the record must not |
| Every run archived with its scenario definition | Replay of a replay |

The reference application is already deterministic and scrub-safe (pre-computed series, seeded noise). **This is a genuine architectural strength and must be preserved through every future change.**

---

## 9. Reference implementation status

| Element | Status | Gap |
|---|---|---|
| Scenario definitions (3) | ✅ | No compound/sequence/failure/false-alarm classes |
| Deterministic, scrub-safe timeline T−24→T+48 | ✅ | Strength — preserve |
| Policy comparison (rule vs forecast-informed) | ✅ | Not a general what-if |
| Historical replay framing | ⚠ scenarios are anchored to real dates | Not driven by real observations; no "knowable at the time" clock |
| What-if with adjustable inputs | ⚠ rain scale + ensemble spread only | No release editing, no tide, no failures |
| Mode marking (replay/live/what-if/training) | ❌ | **P0 — structural marker required** |
| Training mode with clock control and debrief | ❌ | **P1 — high commercial value** |
| Failure injection | ❌ | P1 |
| Breach / inundation library | ❌ | P2 |
| Promote what-if → proposal | ❌ | P1 |

---

**Next:** [Product strategy →](../05-product/01-product-strategy.md)
