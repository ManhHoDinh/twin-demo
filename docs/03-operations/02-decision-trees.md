# Decision trees

Formal, evaluable logic. Every threshold here is **configuration with an effective date and an owner**, never a code constant — see [failure library §4](../00-foundations/10-failure-library.md).

Notation: `⟨…⟩` configurable parameter · `⚠` safety-critical branch · **bold** = the branch people get wrong.

---

## DT-1 — Master triage: what kind of problem is this?

Run first, every cycle. It decides which tree runs next, and it prevents the product's most common category error: optimising a release when the flood is not controllable.

```
                    ┌─ Is dam safety threatened? ────── YES ──► DT-6  (⚠ overrides everything)
                    │   (Z > Z_FSL, freeboard < ⟨margin⟩, instrumentation alarm,
                    │    gate failure with rising level)
                    NO
                    ▼
                    ┌─ Forecast P(BĐ2 @ governing gauge, 48 h) > ⟨30 %⟩ ── NO ──► DT-2 routine
                    YES
                    ▼
                    ┌─ Controllability κ at the control point?
                    │
        κ > ⟨0.6⟩ ──┼── κ 0.3–0.6 ──┬── κ < ⟨0.3⟩
            │       │               │
            ▼       ▼               ▼
        DT-3     DT-3 + DT-5   **DT-5 ONLY**
      release    release AND    "This flood is not controllable
      optimisation  evacuation   by reservoir operation."
      dominant      in parallel  Switch the conversation to
                                 warning and evacuation timing.
```

> **The κ < 0.3 branch is the one that earns trust.** A product that says *"nothing you do with the gates will materially change this — spend your remaining hours on evacuation"* is telling the truth that every experienced operator already knows, and proving it can be relied upon to say so. See [hydrology §6](../00-foundations/02-hydrology.md#6-sub-catchment-decomposition-why-one-basin-number-is-useless).

---

## DT-2 — Routine / rule-curve compliance (daily)

```
Z vs rule curve for today's date?
├─ Z > Z_ceil ────────────────────► ⚠ NON-COMPLIANT
│                                    → require reason of record
│                                    → propose drawdown schedule to regain compliance
│                                    → notify authority; log
├─ Z within ⟨0.5 m⟩ below Z_ceil ──► MARGINAL
│                                    → if any rain forecast in ⟨5 d⟩: propose early cheap drawdown
├─ Z within band ─────────────────► COMPLIANT → normal generation planning
└─ Z below rule-curve minimum ────► supply risk
                                     → check dry-season/water-supply implications
                                     → (Vu Gia: check Đà Nẵng intake & salinity)
```

**Common failure:** MARGINAL treated as COMPLIANT for weeks, so the season starts with no buffer ([failure library §3 #1](../00-foundations/10-failure-library.md)).

---

## DT-3 — Pre-release decision (the core tree)

```
INPUTS: ensemble inflow forecast; free storage; downstream state; tide; κ; lead time

1. Is there free storage to protect?
   free_storage < ⟨5 %⟩ of flood storage ──► NO BUFFER → go to DT-4 (pass-through planning)
   otherwise ▼

2. Is the forecast good enough to act on?
   confidence = UNUSABLE, or lead time < ⟨6 h⟩, or no verification history
       ──► DO NOT PRE-RELEASE. Follow the rule curve. Say why. ⚠
   otherwise ▼

3. Is the downstream already committed?
   H(control point, now) ≥ ⟨BĐ2⟩  OR  H forecast ≥ BĐ2 within the pre-release window
       ──► **PRE-RELEASE FORBIDDEN at any rate that raises H further.**
           Maximum permissible pre-release = the rate that keeps H below its cap
           at all times, including the routed arrival. May be zero. ⚠
   otherwise ▼

4. Compute the candidate: (start, target Q, ramp, gate config, end condition)
       subject to: downstream cap at every t (routed, tide-aware)
                   ramp limits (downstream rise/fall AND dam-side drawdown ⚠)
                   notification lead satisfied
                   gate-realisable, symmetric, n−1 tolerant
                   Z stays ≥ Z_dead + ⟨margin⟩

5. Is the candidate feasible?
   NO ──► REPORT INFEASIBILITY. Name the binding constraint.
          Offer the ≥2 least-bad options, each stating which constraint it breaks
          and who has the authority to accept that. ⚠ NEVER silently relax.
   YES ▼

6. Is it worth it?
   Δpeak at control point < ⟨0.15 m⟩ ──► NOT WORTH IT.
        "Pre-release would change the peak by less than the forecast error.
         Recommend following the rule curve."   ⚠ ← the honest-null answer
   otherwise ▼

7. Compute regret both ways:
   regret_act   = generation lost + dry-season risk + downstream disruption, IF storm misses
   regret_wait  = peak increase + people exposed + emergency-release risk, IF storm arrives
   Present BOTH with their probabilities. Do not collapse to an expected value —
   the loss is asymmetric and the choice belongs to the accountable human.

8. Emit the decision package; start the deadline countdown; route to the authority (D-03).
```

**The three branches people get wrong:** step 3 (pre-releasing onto an already-rising river), step 5 (silent relaxation), step 6 (acting when the benefit is inside the noise).

---

## DT-4 — Approaching capacity / pass-through planning

```
time_to_ceiling = free_storage / max(net_inflow_forecast, ε)

time_to_ceiling > ⟨24 h⟩ ──► monitor; revisit each cycle
⟨12–24 h⟩ ──► begin graduated increase now, at the maximum rate that keeps
              downstream below cap → converts a future step change into a ramp
⟨6–12 h⟩  ──► ⚠ point-of-no-return check:
              is there any schedule that avoids pass-through?
              NO → announce the pass-through transition time publicly NOW
< ⟨6 h⟩   ──► pass-through imminent
              → "the reservoir can no longer reduce the flood" statement
              → notify all downstream, all channels
              → evacuation decision support to authority (DT-5)
```

**Rule:** the pass-through announcement is made **as soon as it is unavoidable**, not when it happens. Buying downstream communities hours is the entire value of knowing early.

---

## DT-5 — Evacuation decision support

```
For each zone, at each forecast hour:

1. Depth exceeds ⟨0.5 m⟩ over ⟨10 %⟩ of the zone with P > ⟨40 %⟩?  → candidate
2. Vertical refuge sufficient?
   buildings with upper floor AND depth < floor+1.5 m  → shelter in place possible
   otherwise → horizontal evacuation required
3. Route viability:
   ∃ route with depth < 0.15 m for the whole movement window?
       NO  ──► ⚠ ISOLATION IMMINENT — evacuate NOW or pre-position rescue assets.
                This branch outranks depth severity.
       YES ──► compute open_until; evacuation must START by
                open_until − travel_time − assembly_time
4. Shelter check: capacity ≥ people, not in footprint, access open, resourced
       fail ──► reallocate, escalate for an alternative
5. Assisted cases: hospital (⚠ 12–48 h lead), elderly, disabled, boarding schools
       ──► these start FIRST, with the longest lead
6. Night-time arrival (22:00–05:00)?  ──► escalate one level; loud channels; door-knock
7. Emit per-zone: who, where to, by when, via which route, with what assistance
```

**Priority when resources are insufficient** (state it, don't hide it): isolation risk → assisted-evacuation cases → depth+velocity hazard → population count → property.

---

## DT-6 — Dam safety ⚠ (overrides all other trees)

```
Trigger ANY of:
  Z > Z_FSL  ·  freeboard < ⟨margin⟩  ·  dZ/dt > ⟨0.5 m/h⟩ with buffer < ⟨2 h⟩
  seepage turbidity increase  ·  seepage rate step change  ·  piezometer trend break
  measurable deformation  ·  gate commanded ≠ actual with rising level
  spillway structural observation  ·  reservoir-rim slope movement
        │
        ▼
  1. DISABLE the optimiser. Show it as disabled and say why.
  2. Compute max safe discharge (gate + stilling basin + structural limits).
  3. Assess EAP level 1 / 2 / 3.
  4. L2+ → notify authority, emergency services, all downstream. No approval queue.
  5. L3  → breach inundation library: arrival times and depths per community.
           EVACUATE on arrival time. Nothing else is computed or displayed.
  6. Continuous instrumentation watch; two independent comms paths.
  7. Everything auto-logged. Zero manual reporting burden.

  ⚠ There is NO branch that trades dam safety against downstream impact.
    If the product ever offers that choice, the product is defective.
```

---

## DT-7 — Data quality / degradation

```
Per cycle, evaluate feed health:

all critical feeds fresh                     ──► L0 full
non-critical stale                           ──► L1 reduced (flag affected quantities)
governing gauge OR a reservoir level missing ──► ⚠ L2 degraded
        → disable optimiser for the affected reservoir
        → fall back to rule-curve guidance
        → banner: what is missing, and what is therefore NOT being computed
no external connectivity                     ──► L3 local
        → last-known state + cache, all forecasts stamped with issue time
        → enable manual entry
no usable observations                       ──► ⚠ L4 blind
        → REFUSE to produce a proposal
        → show last valid state, EAP, contact tree, static inundation maps
```

**The L4 refusal is a feature.** See [observation model §5](../01-domain-model/03-observation-model.md).

---

## DT-8 — Alarm generation (the anti-fatigue tree)

```
Candidate alarm
  │
  ├─ Is it actionable by the recipient?         NO ──► not an alarm; it is a status
  ├─ Duplicate of an active alarm?              YES ─► update the existing one, do not re-fire
  ├─ Derived from a SUSPECT/STALE input?        YES ─► data alarm instead, routed to Data Health
  ├─ Same root cause as an active alarm?        YES ─► group under the parent
  ├─ Would ≥⟨5⟩ alarms fire in ⟨5 min⟩?         YES ─► emit ONE grouped escalation
  └─ else ─► fire, with: what happened, what it means, what to do, by when, who else was told

Every alarm is individually acknowledgeable with the acknowledger recorded.
⚠ Dam-safety alarms are NEVER grouped, deduplicated into a summary, or auto-cleared.
```

---

## DT-9 — Publish / do-not-publish

```
Is the information sensitive infrastructure detail
  (breach parameters, gate logic, structural defects)?      YES ──► operator-only ⚠
Does it conflict with an official bulletin?                 YES ──► reconcile with the
                                                                    forecaster before release
Is it derived from SYNTHETIC or TRAINING data?              YES ──► ⚠ NEVER publish
                                                                    (hard block, not a warning)
Is it approved by the authorised person?                    NO  ──► queue for approval
else ──► publish on all channels from the single decision record
```

---

## DT-10 — De-escalation

```
De-escalate ONLY when ALL hold:
  · stage below the level's threshold for ⟨3 consecutive hours⟩
  · trend falling
  · forecast P(re-exceed within 12 h) < ⟨20 %⟩
  · no active dam-safety alarm
  · all evacuated zones accounted for
  · a named human confirms, with a reason of record ⚠

Auto-de-escalation is FORBIDDEN. Escalation is automatic; de-escalation is human.
```

---

## Parameter register

Every `⟨…⟩` above is one row here, and each row has an owner, a value, an effective date and a rationale.

| Parameter | Default | Owner | Notes |
|---|---|---|---|
| `P(BĐ2)` watch threshold | 30 % / 48 h | Authority | |
| `P(BĐ3)` alert threshold | 30 % / 24 h | Authority | |
| κ thresholds | 0.3 / 0.6 | Basin engineer | |
| Minimum worthwhile Δpeak | 0.15 m | Basin engineer | Must exceed forecast error |
| Notification lead | ≥ 2 h | Legal | `⚠ VERIFY` against the procedure |
| Downstream rise limit | 0.4 m/h | Dam owner | |
| Downstream fall limit | 0.2 m/h | Dam owner | |
| Dam-side drawdown limit | plant-specific | Dam safety | ⚠ embankment slope stability |
| Freeboard margin | plant-specific | Dam safety | ⚠ |
| Evacuation depth trigger | 0.5 m over 10 % of zone | Authority | |
| Route closure depth | 0.30 m | Road authority | |
| Staleness degrade / exclude | 15 min / 3 h | Ops | |
| Alarm grouping window | 5 alarms / 5 min | Ops | |
| De-escalation hold | 3 h | Authority | |

---

**Next:** [Communication protocols →](03-communication-protocols.md)
