# Observation model — sensing, quality and degradation

The layer the reference application does not have at all, and the layer that decides whether an operational product is trusted.

**Governing principle:** *A sensor that has stopped reporting is not a sensor reading "unchanged."* Everything below follows from that sentence.

---

## 1. Sensor inventory

| Entity | Measures | Typical cadence | Typical failure |
|---|---|---|---|
| **Reservoir level sensor** ⚠ | `Z` | 1–15 min | Drift, wave noise, freeze at last value, power loss |
| **Gate position sensor** ⚠ | `opening_m` | 1 min / on change | Disagreement with commanded value |
| **Turbine flow meter** | `Q_turbine` | 1 min | Calibration drift |
| **Tailrace level** | downstream stage at dam | 5–15 min | |
| **River stage gauge** ⚠ | `H` | 10–60 min (5 min in flood) | Destroyed by the flood; debris; comms loss |
| **Rain gauge / AWS** | mm, plus wind, T, RH, P | 5–15 min | Blockage, tipping-bucket under-catch in high wind, power |
| **Weather radar** | reflectivity → rain rate | 5–10 min | Beam blocking in mountains, attenuation in heavy rain |
| **Satellite (Himawari, GPM)** | cloud, QPE | 10 min / 30 min | Latency, coarse resolution |
| **Seepage weir + turbidity** ⚠ | leakage, turbidity | 15–60 min | **Turbidity is the piping alarm** |
| **Piezometer** ⚠ | pore pressure | hourly–daily | Clogging |
| **Survey/deformation** ⚠ | displacement | daily–monthly | |
| **CCTV** | visual | continuous | Bandwidth, darkness |
| **Citizen reports** | depth, road state, needs | ad hoc | Unverified, needs triage |
| **Field team reports** | ground truth | ad hoc | Highest-trust, lowest-volume |

---

## 2. The Observation record

```
Observation {
  sensor_id, timestamp, value, unit,
  quality: OK | SUSPECT | STALE | MISSING | ESTIMATED | REJECTED,
  qc_flags[],              // which check failed
  latency_s,               // measured, not assumed
  method: DIRECT | DERIVED | INTERPOLATED | INFILLED | MANUAL,
  source_chain[],          // sensor → RTU → telemetry → broker → store
  raw_value                // never discarded; QC is additive, not destructive
}
```

**Rule: QC never overwrites data.** The raw value is retained forever; flags are added. Post-event inquiries need the raw record, including the bad readings and the moment they were flagged.

---

## 3. Quality control pipeline

```
Ingest → 1. Range check ──► 2. Rate-of-change ──► 3. Persistence ──► 4. Cross-sensor
       ──► 5. Physical consistency ──► 6. Redundancy vote ──► 7. Human review queue
```

| # | Check | Rule | Failure meaning |
|---|---|---|---|
| 1 | **Range** | Within bounds in [typical values §9](../00-foundations/09-typical-values.md) | Sensor fault or unit error |
| 2 | **Rate of change** | \|dZ/dt\| ≤ 1.5 m/h, \|dH/dt\| ≤ 1.5 m/h | Spike, or a real dam-safety event — **never auto-discard; escalate** |
| 3 | **Persistence** | Value identical for > N samples while related signals move | **Frozen sensor** — the most dangerous failure, because it looks healthy |
| 4 | **Cross-sensor** | Upstream stage rising while downstream flat and no storage between | Physically impossible → one of them is wrong |
| 5 | **Physical consistency** | Reservoir mass balance closes; rainfall vs runoff plausible | Model or sensor problem; **divergence > 25 % raises a data alarm** ([hydrology §5](../00-foundations/02-hydrology.md#5-inflow-estimation)) |
| 6 | **Redundancy vote** | 2-of-3 on safety-critical signals | Disagreement is itself a critical alarm |
| 7 | **Human review** | Anything SUSPECT that the decision loop needs | Never silently used, never silently dropped |

> **Check 3 deserves emphasis.** A frozen level sensor during a rising flood presents as a calm, stable reservoir. It has caused real incidents. The persistence check plus the "is anything else moving?" cross-check is cheap and catches it.

---

## 4. Staleness policy

| Age of the newest observation | Product behaviour |
|---|---|
| < 1 cycle | Normal. Age not displayed. |
| 1–3 cycles | Age displayed next to the value in muted text. |
| > 15 min (fast signals) / > 30 min (slow) | **Value rendered visibly degraded** (dashed border, greyed) + age badge. |
| > 3 h | **Excluded from the decision loop.** Derived quantities that depended on it are marked `ESTIMATED` and their confidence downgraded. |
| Sensor declared down | Shown as a **gap in the chart, not a flat line** ⚠, and listed in the Data Health panel. |

**Never interpolate across a gap in a display without marking it.** A dotted line labelled *infilled* is honest; a solid line is a lie.

---

## 5. Graceful degradation — designing for the typhoon

A severe event will take out part of the network. The product must have **declared operating levels**, visible to the user:

| Level | Condition | Product behaviour |
|---|---|---|
| **L0 — Full** | All critical feeds fresh | Full functionality, full confidence range available |
| **L1 — Reduced** | Some non-critical feeds stale | Normal operation; affected quantities flagged; confidence capped at `MEDIUM` for those |
| **L2 — Degraded** | A governing gauge or a reservoir level is unavailable | Optimiser **disabled** for the affected reservoir; fall back to rule-curve guidance; banner states exactly what is missing and what is therefore not being computed |
| **L3 — Local/offline** | No external connectivity | Runs on last-known state + local cache; **all forecasts marked stale with their issue time**; manual data entry enabled; product explicitly says "this is a snapshot from HH:MM" |
| **L4 — Blind** | No usable observations | Product refuses to produce a proposal. Shows the last valid state, the EAP, contact tree, and static inundation maps. **This is a feature.** |

> **L4 is the most important row in this table.** A system that keeps producing confident recommendations with no data is the worst possible failure mode. The correct behaviour is to say *"I cannot advise; here is the plan and here are the phone numbers."*

**Manual entry** is mandatory: an operator reading a staff gauge by torchlight and typing `H = 8.4 m` must be able to get that into the system, flagged `MANUAL`, with their name attached.

---

## 6. Telemetry architecture assumptions (informational)

Backend implementation is out of scope, but the model imposes these:

- **Store-and-forward at the edge.** RTUs buffer and backfill after a comms outage; late-arriving data must be accepted and must trigger re-evaluation, with the audit trail showing both the original and the revised picture.
- **Idempotent, timestamped ingestion.** Duplicates are common after a backfill.
- **Two independent comms paths** for dam-safety signals (e.g. fibre + cellular/satellite).
- **Clock discipline.** A drifting RTU clock silently corrupts every rate calculation. Clock skew is a monitored quantity.
- **The SCADA boundary is one-way.** Observations flow out of the plant control system into the product. **No control path back in.** This is a security and liability requirement, not a design preference — see [dam safety §6](../00-foundations/05-dam-safety.md#6-what-the-product-must-not-do).

---

## 7. Data Health as a user-facing screen

Data health is not an admin page — it is an operational fact the decision-maker needs. See [S-13 Data Health](../05-product/02-screen-catalog.md).

Must show: per-feed freshness, current operating level L0–L4, which computations are affected, what has been excluded and why, redundancy status on safety-critical signals, and the manual-entry queue.

**One-line summary chip on every screen:** `Data: L1 · 34/36 feeds · oldest 12 min`.

---

## 8. Reference implementation status

The reference application has **no observation model**. All quantities are computed analytically and displayed as if perfectly known.

| Element | Status | Priority |
|---|---|---|
| Quantity envelope (provenance/quality/age) | ❌ | **P0 — implement first; everything else depends on it** |
| Data health panel + operating level | ❌ | P0 |
| Staleness rendering | ❌ | P0 |
| QC checks | ❌ | P1 (needs a real feed to matter) |
| Manual entry | ❌ | P2 |
| Gap-not-flatline charting | ❌ | P1 |

---

**Next:** [Exposure and impact model →](04-exposure-and-impact-model.md)
