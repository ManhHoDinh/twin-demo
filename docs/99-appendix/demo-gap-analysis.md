# Demo gap analysis — current application vs this specification

The bridge between the knowledge base and the code. Data provenance and the anti-regression rules live in [`../../DATA_AND_METHODS.md`](../../DATA_AND_METHODS.md); change history in [`../../IMPROVEMENT_LOG.md`](../../IMPROVEMENT_LOG.md). This file is **what to change and why**.

---

## 1. What the application already does well

Genuine strengths that must survive every future change:

| Strength | Where | Why it matters |
|---|---|---|
| Real basin geometry — DEM, imagery, roads, buildings, gazetteer, deep zoom to ~0.14 m/px | `js/geo.js`, `js/map2d.js`, `js/scene3d.js` | Credibility with people who know the ground |
| **Deterministic, scrub-safe timeline** (pre-computed T−24→T+48, seeded noise) | `js/hydro.js` | The foundation of reproducibility (NFR-09). Preserve absolutely. |
| Two operating policies pre-computed and comparable | `js/hydro.js` | The core hydrological argument |
| **5 discrete depth bands** | `js/core.js` `depthColor`, `js/scene3d.js` shader | Honest about resolution *by construction* ([UX §5](../05-product/04-ux-principles.md)) |
| Zone status from mean depth × exposed **fraction** | `js/zones.js` | The correct formulation ([exposure §4](../01-domain-model/04-exposure-and-impact-model.md)) |
| Road closure at 0.15/0.30 m with rerouting | `js/core.js` `roadClass`, `js/traffic.js` | Matches the hazard thresholds |
| **Start-up self-test with a visible pass indicator** | `js/main.js` `selfTestHydro()` | Exactly the NFR-12 pattern; extend rather than replace |
| Non-operational disclaimer in the footer and methods modal | `index.html`, `js/ui.js` | Correct instinct; needs to become structural |
| Floodplain-only SWE dynamics with a flood cap | `js/world.js` | A defensible engineering simplification, already hard-won |

---

## 2. Gap summary by theme

| Theme | Present | Absent | Priority |
|---|---|---|---|
| Visualisation | Excellent | Velocity/hazard, shelters, routes, teams, sensors | P1–P2 |
| Hydrology | Analytic engine, ensemble spread | Sub-catchment split, antecedent state, rating curves, tide phase | P1 |
| Reservoir ops | Mass balance, ramp limits, level bounds | Freeboard, time-to-threshold, gate model, constraints as proofs | **P0** |
| Decision support | A proposal-like object with approve/reject | Constraint list, counterfactual, alternatives, regret, deadline | **P0** |
| Honesty layer | Footer disclaimer | Quantity envelope, data health, mode marking, confidence grading | **P0** |
| Institutional | — | Audit, identity, roles, notification, EAP | **P0–P1** |
| Emergency mgmt | Zones, closures, event log | Shelters, routes, isolation, assisted evacuation | P1 |

---

## 3. Concrete change specification

Ordered by dependency. Each entry: what, where, and the requirement it satisfies.

### C-01 · Quantity envelope *(FR-01, P0)*
**New module `js/quantity.js`.** A `Q(value, unit, opts)` factory producing `{value, unit, provenance, timestamp, age, quality, uncertainty, source, version}` plus formatting helpers (`fmt`, `fmtRange`, `withAge`).
**Change:** `js/ui.js` renders through the helpers so provenance and age are encoded in the DOM (a class + a small badge) rather than as bare `textContent`.
**Constraint:** must not change the render cadence — the envelope is a formatting layer, not a new data path.

### C-02 · Data health and operating levels *(FR-02, P0)*
**New module `js/health.js`.** Maintains a feed registry (in the demo: synthetic feeds with simulated ages), computes level L0–L4 per [DT-7](../03-operations/02-decision-trees.md), and exposes `FT.health.level()`.
**UI:** a chip in the global chrome on every view (`Data: L1 · n/m feeds · oldest X min`) and a Data Health panel (S-13).
**Behaviour:** at L4 the proposal builder returns a refusal object; the decision panel renders the refusal, the EAP placeholder and the contact list.

### C-03 · Mode marking *(FR-03, P0)*
**`index.html` + `styles.css`:** a persistent mode band; a coloured frame for non-live modes; a diagonal watermark class applied to the print stylesheet **and** to any exported artefact.
**Because the demo's data is synthetic, the default mode is `SYNTHETIC / NON-OPERATIONAL` and it cannot be switched off.**

### C-04 · Safety margins *(FR-17, FR-42, P0)*
**`js/data.js`:** add `crest`, `zDesign`, `zCheck` per reservoir (`⚠ VERIFY` values, clearly marked as indicative).
**`js/hydro.js` `H.at()`:** add `freeboard`, `dZdt` (smoothed over ≥ 30 min of model time), `timeToCeil`, `timeToFSL`, `timeToDesign`, `freeStorageMm3`, `bufferExhaustionT`.
**UI:** reservoir rows show freeboard and time-to-full; the dashboard shows the buffer-exhaustion time with the plain-language statement.

### C-05 · Constraint engine *(FR-12, P0)*
**New module `js/constraints.js`.** Evaluates C1–C10 for a candidate schedule at every timestep, returning `{id, label, status, margin, binding}`.
**Critical:** C9 (downstream cap) is evaluated on the **routed arrival at the control point**, using the existing per-gauge lag — not at the dam.
**Rule:** no silent relaxation. If nothing passes, the builder returns `feasible: false` with the binding constraint.

### C-06 · Decision package *(FR-10, FR-11, FR-13, P0)*
**Rewrite `buildProposal()` in `js/hydro.js`** to emit the full proposal contract ([decision engine §6](../04-decision-support/01-decision-engine-spec.md)): actions with all six fields, constraint list, feasibility, outcome with quantiles, **counterfactual** (the rule-policy trajectory is already computed — it *is* the counterfactual), ≥ 2 alternatives (vary start time and split across reservoirs), regret both ways, deadline, confidence, κ, explanation, model versions.
**UI:** replace the MPC card with the S-05 decision package layout; approve/modify/reject/defer, each requiring a reason of record.
**Honest-null:** when `ruleStage − mpcStage < 0.15 m`, emit the "follow the rule curve" recommendation instead of a release proposal.

### C-07 · Decision deadline *(FR-16, P0)*
**`js/hydro.js`:** `deadline = actionStart − notificationLead − approvalLead`, components configurable in `js/data.js`.
**UI:** a countdown in the global chrome, red on expiry, naming the foreclosed options.

### C-08 · Audit trail *(FR-04, FR-05, P0)*
**New module `js/audit.js`.** Append-only in-memory + `localStorage` log with a sequence number, ISO timestamp, actor, action, entity, and a hash of the input snapshot (a cheap string hash is adequate for the demo; the production requirement is cryptographic).
**Wire:** scenario change, policy change, proposal generation, approve/reject/modify/defer, alarm acknowledgement, mode change.
**UI:** an Audit panel (S-18) with filtering and an export button.
**Identity:** a lightweight operator identity selector (name + role) — anonymous approval is forbidden.

### C-09 · Controllability κ *(FR-14, P1)*
**`js/hydro.js`:** decompose the gauge response into the reservoir-routed component and the local-runoff component (both already exist inside `buildGauge()` as `q/1150` and `local/55·localGain`) and expose their ratio.
This is a small change with a large honesty payoff: κ falls out of the existing arithmetic.
**UI:** on the dashboard, with the [DT-1](../03-operations/02-decision-trees.md) interpretation text.

### C-10 · Exceedance probability *(FR-28, P1)*
**`js/hydro.js`:** from the existing quantile machinery, compute `P(H > BĐn)` per gauge per timestep by inverting the parametric spread.
**UI:** a probability curve under the hydrograph and a `P(BĐ3)` bar on the dashboard.
**Label:** `SYNTHETIC` — the spread is parametric, not from real members (R-01).

### C-11 · Confidence grading *(FR-28, P0-cheap)*
**New in `js/quantity.js`:** grade from lead time, data level and spread, with the reason string. Automatic downgrades per [uncertainty §2](../04-decision-support/02-uncertainty-and-confidence.md).

### C-12 · Alarm philosophy *(FR-44, P1)*
**New module `js/alarms.js`** implementing [DT-8](../03-operations/02-decision-trees.md): actionability, dedup, grouping, storm suppression, individual acknowledgement with attribution. Dam-safety alarms bypass grouping.
Replaces the current fire-and-forget toasts for anything decision-relevant; toasts remain for transient UI feedback.

### C-13 · Time-aware routes and isolation *(FR-22, FR-24, P1)*
**`js/traffic.js`:** evaluate closure against the **forecast** depth field at the time of use; compute `open_until` per edge; run a reachability check per zone to any EOC/shelter to flag isolation.
The Dijkstra graph and the forecast field both already exist — this is a re-use, not a new subsystem.

### C-14 · Sub-catchment rainfall and antecedent state *(FR-29, P1)*
**`js/hydro.js`:** split rainfall into upper (above reservoirs) and lower (intermediate + delta) components; maintain an API-style antecedent index and use it to modulate the runoff coefficient.
This makes κ meaningful (C-09) and is the highest-value hydrological change.

### C-15 · Notification workflow *(FR-20, P1)*
**New module `js/notify.js`.** Generates all channel variants from one decision record using the templates in [communication protocols §3](../03-operations/03-communication-protocols.md); a sandbox transport only (the demo must never send anything); delivery/acknowledgement simulated and logged to the audit trail.

### C-16 · Reports *(FR-33, P1)*
**Extend the existing print report** into: situation report, decision package, operation record, event report. All carry the mode watermark, provenance and model versions.

### C-17 · Shelters, hospitals, schools *(FR-23, P1)*
**`js/data.js`:** add the entities with elevation, capacity and access; validate against the flood footprint each cycle; render on the map with valid/invalid state.

### C-18 · Self-test extension *(NFR-12)*
**`js/main.js`:** extend `selfTestHydro()` with assertions for the new layers — no proposal violates a hard constraint; infeasibility is reported rather than relaxed; the envelope is present on every displayed quantity; L4 produces a refusal; the counterfactual is always present.

---

## 4. Anti-regression rules that constrain all of the above

From `DATA_AND_METHODS.md` §3, restated because every change above touches this code:

1. No module-level `THREE.*` references in `scene3d.js`.
2. SWE dynamics only on the floodplain (< 28 m).
3. No direct reservoir-outflow injection into the water grid.
4. Flood metrics always via `hBase` + `W.floodCap`.
5. Y-order: terrain < detail overlay < water < roads.
6. Road colours are RGBA (`itemSize 4`) in **both** `buildRoads` and `buildOsmRoads`.
7. `updateWater` stays at 10 Hz.
8. Bump `?v=N` in `index.html` on every JS change; verify the console and `[selftest] hydro PASS` before considering a change done.

**Add three more, from this specification:**

9. **No raw number rendered without the quantity envelope.**
10. **No proposal emitted without a counterfactual and a constraint list.**
11. **No export or print without the mode watermark and the non-operational marker.**

---

## 4b. What has now shipped (build v90)

Phases 1–2 of §5 are implemented. Two new modules were added; **no existing module's render path was modified** — `js/opsui.js` wraps `FT.ui.tick` additively, so every anti-regression rule above still holds.

| Change | Status | Where |
|---|---|---|
| C-01 quantity envelope | ✅ helper + provenance/quality/age/band rendering | `js/decision.js` `OPS.Q` / `OPS.html`, `.q-*` in `styles.css` |
| C-02 data health + L0–L4 | ✅ feed registry, level computation, health modal, degradation control | `js/decision.js` `OPS.health`, `js/opsui.js` `openHealth` |
| C-03 mode marking | ✅ persistent ops-bar band + print watermark | `index.html` `#opsMode`, `@media print` in `styles.css` |
| C-04 safety margins | ✅ freeboard, dZ/dt (1 h smoothed), free storage, time-to-ceiling, buffer-exhaustion time | `js/decision.js` `OPS.margins`, `.resSafety` row per reservoir |
| C-05 constraint engine | ✅ C1–C10 with PASS/MARGINAL/FAIL + margins; **C9 evaluated on the routed arrival** | `js/decision.js` `OPS.constraints` |
| C-06 decision package | ✅ action, constraint proof, counterfactual, alternatives, regret, confidence, versions | `js/decision.js` `OPS.package`, `js/opsui.js` `renderPackage` |
| C-07 decision deadline | ✅ countdown in the global chrome, red on expiry | `#opsDeadline` |
| C-08 audit trail | ✅ append-only, localStorage-backed, snapshot hash, attributed approval + reason of record | `js/decision.js` `OPS.audit`, `#auditLog` |
| C-09 controllability κ | ✅ exact decomposition of the gauge response | `js/decision.js` `OPS.kappa` |
| C-11 confidence grading | ✅ with reasons and automatic downgrades; capped at LOW on this synthetic build | `js/decision.js` |
| C-18 self-test extension | ✅ now 10 assertions, run at every boot | `js/main.js` `selfTestHydro` |

**Behaviours now demonstrable in the running app:**

| Behaviour | How to see it |
|---|---|
| Infeasibility reported, not relaxed | oct2020 + MPC → C9 **FAIL** (Giao Thủy 10.23 m vs BĐ3 8.8 m), package marked *KHÔNG KHẢ THI*, binding constraint named |
| Counterfactual always present | Package shows proposal 10.23 m vs no-action 10.78 m, and 7.0 h vs 12.5 h above BĐ3 |
| Alternatives computed exactly | Single-reservoir 10.40 m vs coordinated pair 10.23 m — derived from the linear gauge response, not estimated |
| Honest null | monsoon → peak difference below the worthwhile threshold → *follow the rule curve* |
| Model saturation declared | yagi → both policies clip at the gauge model's ceiling → *KHÔNG SO SÁNH ĐƯỢC*, confidence **UNUSABLE** |
| Optimiser stands down on data loss | Degradation L2/L3 → *BỘ TỐI ƯU VÔ HIỆU*, naming the missing feed and what is not being computed |
| Refusal to advise | Degradation L4 → *TỪ CHỐI ĐỀ XUẤT*, deadline blanked, EAP/contacts pointed to |
| No anonymous or unreasoned decisions | Approve is blocked until an operator identity and a reason of record are supplied; both land in the audit log |

**Two defects in the pre-existing engine were found and fixed while wiring this up:**

1. **`buildProposal` named the most-stressed reservoir regardless of its influence on the control point it was judged against** — it proposed operating Sông Tranh 2 while reporting a peak cut at Ái Nghĩa, where that reservoir's routing weight is zero. It now selects the (reservoir, control point) pair with the greatest influence-weighted stress and reports against that gauge. *(`js/hydro.js`; failure library §3 #5, FR-34.)*
2. **The analytic gauge model clips at `g.max`; in the worst-credible scenario both policies sat on that ceiling**, so the peak difference was zero and the package read "no action needed" — a false negative in exactly the scenario that matters most. Saturation is now detected and declared as *not comparable*. *(`js/decision.js`; uncertainty §1 rule 4.)*

---

## 4c. Operations layer (build v104)

Phase 3–4 of §5, less C-14 and C-16. Two more modules, still additive.

| Change | Status | Where |
|---|---|---|
| C-10 `P(exceed)` series | ✅ exact inversion of the ensemble spread; window max over 12 h on the ops bar | `js/forecast.js` `pExceed`, `pExceedWindow` |
| C-12 alarm engine | ✅ DT-8 in full: actionability, one-alarm-per-condition, root-cause grouping, storm suppression, individual attributed ack, **dam-safety exempt** | `js/alerts.js` `FT.alarms`, `#alarmList` |
| C-13 time-aware routes + isolation | ✅ closure times, `open_until`, last safe departure, per-zone isolation time, single-access flag | `js/forecast.js`, `js/zones.js`, `#evacList` |
| C-15 notification workflow | ✅ one record → phone/SMS/loudspeaker/public/CAP, recipient matrix, sandbox dispatch, per-recipient acknowledgement, audit | `js/alerts.js` `FT.notifyOps`, `#notifyList` |
| C-17 shelters | ✅ 12 sites with storeys/capacity/floor level, live validity, refuge-vs-ground-floor logic, map layer | `js/data.js` `SHELTERS`, `js/map2d.js` `drawShelters` |
| C-18 self-test | ✅ extended to **13 assertions** | `js/main.js` |

### How the forecast stays consistent with the simulation

`eqTarget()` in `world.js` is closed-form in the corridor anomaly, so it is **inverted once at
build time** to give every road edge the gauge anomaly at which it floods. A closure time is
then a lookup against the already-precomputed stage series — no second simulation, fully
deterministic and scrub-safe.

Raw inversion is an *equilibrium* relation while the field it must agree with is damped and
capped, so it closed roads before the simulation did (78–100 % agreement, biased one way).
`FT.forecast.calibrate()` now re-anchors each edge's arrival anomaly on the observed depth
every cycle, snapping rather than blending when the user scrubs. **Measured agreement after
the fix: 100 % at the current time**, by construction. The forecast assimilates the
simulation instead of contradicting it — two numbers on one screen must never disagree.

### Defects found by building this, and fixed

3. **Shelter validity depended on the EOC being able to drive to it.** A refuge cut off from
   the command centre is still a refuge for the people beside it — that is a *resupply*
   problem. Conflating the two deleted usable shelters exactly at the peak (3/12 valid
   instead of 9/12). Split into `valid` (site survivable) and `warn: no-resupply`.
4. **A warning message read "Giao Thủy ~10,23 m, trên BĐ1 0,03 m".** 10.23 m at that station
   is above BĐ3 by 1.43 m. The release record overrides gauge and stage, but the alert level
   was still carried over from the currently-worst gauge. Now re-derived from the gauge and
   stage the message actually quotes, and asserted in the self-test.
5. **SMS carried diacritics, `m³/s` and an en dash, and ran to 214 characters.** Now folded
   to plain ASCII and split into numbered ≤160-character parts — never truncated, because a
   warning cut mid-sentence loses the instruction.
6. **Eleven near-identical isolation alarms**, one per zone, same required action. Collapsed
   into one alarm per root cause listing the affected zones (DT-8).
7. **Multi-storey shelters were written off when their ground floor wet.** The upper floor
   *is* the refuge — that is how vertical evacuation works. Ground-floor loss now cuts usable
   capacity (×0.45) instead of invalidating the site.

### Verified operational arc (oct2020, MPC policy)

| T | Escalation | P(BĐ3, 12 h) | κ | Alarms | Roads closed | Zones isolated | Shelters valid |
|---|---|---|---|---|---|---|---|
| −12 h | L1 | 0 % | 0.19 | 2 | 5 | 1 | 9/12 |
| +2 h | L1 | 1 % | 0.26 | 4 | 4 | 0 | 9/12 |
| +8 h | L1 | 81 % | 0.14 | 6 | 15 | 9 | 9/12 |
| +14 h | L2 | 100 % | 0.41 | 6 | 19 | 10 | 9/12 |
| +20 h | L4 | 100 % | 0.29 | 9 | 29 | 11 | 9/12 |
| +44 h | L1 | 35 % | 0.58 | 7 | 20 | 10 | 9/12 |

Full operator chain exercised through real UI clicks: sign on → acknowledge alarm →
compose → dispatch → commune acknowledges → audit shows `alarm.raise · alarm.ack ·
notify.dispatch · notify.ack`.

---

## 4d. Domain layer (build v110) — §3 complete

C-14 and C-16 land, plus a domain layer the earlier passes did not have.

| Change | Status | Where |
|---|---|---|
| C-14 sub-catchment rainfall + antecedent wetness | ✅ 8 sub-catchments, orographic weighting, API → saturation index → wetness-modulated runoff; upper/local split drives κ | `js/data.js` `SUBCATCH`, `js/hydro.js`, `#subList` |
| C-16 reports | ✅ situation · **public operation record** · post-event reconstruction, all watermarked and versioned | `js/reports.js`, `#btnRepOperation`, `#btnRepEvent` |
| **State machines** | ✅ reservoir (7 states + legal transition graph), gauge, road, zone | `js/domain.js` |
| **Event engine** | ✅ 124 deterministic domain events over T−24→T+48, click-to-jump ribbon | `js/domain.js`, `#eventRibbon` |

### Two design rules that made the domain layer safe to add

1. **State is a pure function of `(entity, t)`** — nothing accumulates frame to frame, so
   scrubbing backwards yields exactly the states scrubbing forwards did.
2. **The event timeline is derived, not collected** — the whole window is walked on rebuild
   and transitions are emitted. Replaying an event reproduces an identical event list, which
   is what makes the WF-12 reconstruction possible at all.

Both are asserted in the self-test (now **16 assertions**).

### Defects found by building this

8. **The reservoir transition graph was wrong.** The scan flagged
   `PASS_THROUGH → FLOOD_CONTROL` and `EMERGENCY_RELEASE → CONTROLLED_RELEASE` as illegal.
   Both are real: a multi-pulse event (oct2020 has four) lets a reservoir fall back to
   absorbing a later pulse, and a receding level de-escalates from emergency to controlled
   release. The graph was corrected, not the physics — the state machine earned its keep on
   its first run.
9. **Shelter state was not a pure function of time.** It mixed the live SWE depth (settled to
   whatever time the UI showed) with the anomaly at an arbitrary `t`, so the derived timeline
   reported shelters "lost" at T−19 h, before the flood. Now judged purely on the forecast
   anomaly, scanning from the window start. Asserted.
10. **Antecedent wetness was displayed as raw API in millimetres** (~2 700 mm), a figure no
    hydrologist would accept. Now a **saturation index 0–1** against a stated reference, with
    a qualitative class, and the underlying rainfall-calibration problem is surfaced on the
    panel rather than hidden — see **R-26**.

### Verified

Six scenario × policy combinations exercised end to end (scrub across 5 times, alarm scan,
UI tick, timeline rebuild, all three reports, notification record): **no errors, no illegal
transitions**. Event counts scale with severity: oct2020 117 · yagi 103 · monsoon 88.

Reservoir lifecycle for A Vương reads as a real event:
`NORMAL → MONITORING (T−14.8) → FLOOD_CONTROL (T+8) → PASS_THROUGH (T+11.5) →
EMERGENCY_RELEASE (T+21.5) → CONTROLLED_RELEASE (T+30) → PASS_THROUGH (T+33.3)`.

The public operation record at T+16 h reports 242 Mm³ held back across the cascade, κ = 0.37
at Ái Nghĩa with the honest interpretation, and the counterfactual (10.10 m vs 10.80 m;
12.8 h vs 15.0 h above BĐ3).

**§3 is now complete.** Remaining work is no longer gap-closing but M1 shadow mode: real
feeds, real ensemble members, and calibration against a real event (R-01, R-26, R-27).

---

## 4e. Decision rights (build v119)

`js/roles.js` encodes the RACI table from
[decision rights](../02-stakeholders/02-decision-rights-raci.md). The product previously
refused *anonymous* decisions but still accepted them from the *wrong office*.

| Element | Status |
|---|---|
| 12 decisions D-01…D-16, exactly one accountable role each | ✅ |
| 6 duty roles, incl. dam safety and emergency commander | ✅ |
| Decision code varies with reservoir state (D-03 → D-05 → D-06) | ✅ |
| Dam-safety inversion at D-06 (authority merely informed) | ✅ |
| Enforced on approval, public information (D-14), evacuation (D-10) | ✅ |
| Refusal names the accountable role **and is audited** | ✅ |
| Authority shown *before* the buttons | ✅ |

Verified across all six roles: only the authority may approve D-03; the other five are
refused and each refusal is recorded.

---

## 5. Implementation order

```
Phase 1 (honesty)      C-01 → C-02 → C-03 → C-11
Phase 2 (decision)     C-04 → C-05 → C-06 → C-07 → C-08
Phase 3 (hydrology)    C-09 → C-14 → C-10
Phase 4 (operations)   C-12 → C-13 → C-15 → C-17 → C-16
Continuous             C-18
```

Phases 1 and 2 change what the product *is*. Phases 3 and 4 change what it can *do*. Doing them in the other order produces a more capable dishonest product.

---

**Next:** [Document conventions →](document-conventions.md)
