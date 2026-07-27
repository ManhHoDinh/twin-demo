# Reference basin — Vu Gia – Thu Bồn (VGTB)

The concrete instance of the [entity model](01-entity-model.md). Data provenance (what is real, what is synthetic, where it comes from in code) is documented once in [`../../DATA_AND_METHODS.md`](../../DATA_AND_METHODS.md) — this file describes the **system**, not the file layout.

---

## 1. Why this basin

| Property | Value | Why it makes a good reference case |
|---|---|---|
| Basin area | ~10 000 km² (Vu Gia + Thu Bồn combined) | Large enough to be real, small enough to model well |
| Relief | 0 → ~2000 m over ~80 km | Extreme; short response time |
| Response time | Rain → reservoir peak in hours | The hard case for decision support |
| Rainfall | 2000 mm coastal → 4000 mm+ windward slopes | Orographic extremes |
| Reservoirs | 4 large hydropower reservoirs on connected headwaters | A genuine cascade coordination problem |
| Inter-basin transfer | Đắk Mi 4 diverts Vu Gia water into Thu Bồn | A real, contested operational conflict |
| Bifurcation | Quảng Huế splits Vu Gia flow toward Thu Bồn | A real forecast-uncertainty source |
| Downstream exposure | Đà Nẵng (~1.2 M) + Hội An (UNESCO, ~120 k) + dense delta | High consequence, high visibility |
| Tidal/estuarine mouths | Hàn and Cửa Đại | Compound flooding |
| Legal framework | Governed by an approved inter-reservoir operating procedure | Realistic institutional constraints |

**In one sentence:** this basin contains every hard problem in reservoir-informed flood decision support, at a scale a product can actually model.

---

## 2. Domain extent

| | |
|---|---|
| Bounding box | 107.55 – 108.45 °E, 15.30 – 16.16 °N |
| Extent | ≈ 96 km × 95.5 km |
| Model grid | 144 × 144 cells ≈ 667 m |
| Terrain | AWS Terrain Tiles (Terrarium) z10–11 |
| Imagery | Esri World Imagery z12 base, z14 city windows, live tiles to z20 |
| Vertical | Floodplain dynamic below 28 m; steep terrain diagnostic ([hydraulics §3](../00-foundations/03-hydraulics-and-routing.md)) |

---

## 3. River network

```
A Vương (res) ──► S. A Vương ──┐
                               ├──► Sông Vu Gia ──► Ái Nghĩa (gauge) ──┬──► S. Yên/Hàn ──► Cẩm Lệ ──► Đà Nẵng ──► Hàn mouth
Sông Bung 4 (res) ─────────────┘                                       │
                                                                       └──► Quảng Huế (bifurcation)
Đắk Mi 4 (res) ──► S. Đắk Mi/Cái ──► (diversion to Thu Bồn) ────────────────┐
                                                                            ▼
Sông Tranh 2 (res) ──► Sông Thu Bồn ──► Giao Thủy (gauge) ──► Câu Lâu (gauge) ──► Hội An ──► Cửa Đại mouth
                                             │
                                             └──► S. Vĩnh Điện ──► toward Hàn
```

**Two features that make forecasting here genuinely hard:**
1. **Quảng Huế bifurcation** — the Vu Gia/Thu Bồn split ratio is stage-dependent and has changed with channel morphology. Ái Nghĩa forecasts inherit that uncertainty.
2. **Đắk Mi 4 diversion** — water is moved out of the Vu Gia headwaters into the Thu Bồn for generation. Flood volume is therefore *relocated between two downstream populations*, and dry-season Vu Gia flow (Đà Nẵng's water supply) is reduced. Any operational proposal must show both rivers.

The two together mean **a release decision on one river is a release decision on the other.** A product that presents a single-river view of this basin is technically incomplete.

---

## 4. Reservoir cascade

Parameters as configured in the reference application; see [typical values §4](../00-foundations/09-typical-values.md) for the table and the `⚠ VERIFY` caveat.

| | A Vương | Sông Bung 4 | Đắk Mi 4 | Sông Tranh 2 |
|---|---|---|---|---|
| River | A Vương | Vu Gia | Đắk Mi | Thu Bồn |
| Ceiling → FSL (m) | 376 → 380 | 217.5 → 222.5 | 255 → 258 | 172 → 175 |
| Capacity (Mm³) | 344 | 510 | 312 | 730 |
| Turbine `Q` (m³/s) | 78 | 166 | 128 | 110 |
| Spillway max (m³/s) | 3 400 | 5 800 | 4 200 | 6 500 |
| Lag to basin response (h) | 3.0 | 3.5 | 4.0 | 4.5 |
| Primary downstream control | Ái Nghĩa | Ái Nghĩa | Ái Nghĩa (+ Thu Bồn via diversion) | Giao Thủy / Câu Lâu |

**Reality check the product must state plainly:** combined turbine capacity ≈ 480 m³/s against flood inflows in the thousands. **Generation is not a flood-management instrument here.** Only spillways and stored buffer are, and the buffer buys hours.

---

## 5. Control points (gauges)

| Station | River | BĐ1 / BĐ2 / BĐ3 (m) | Role |
|---|---|---|---|
| **Ái Nghĩa** | Vu Gia | 6.5 / 8.0 / 9.0 | **Governing control point** for cascade release decisions on the Vu Gia side; protects Đại Lộc and the route to Đà Nẵng |
| **Giao Thủy** | Thu Bồn | 6.2 / 7.7 / 8.8 | Upper Thu Bồn control; early indicator for the delta |
| **Câu Lâu** | Thu Bồn | 2.0 / 3.0 / 4.0 | Delta / Hội An approach; tide-affected |
| **Cẩm Lệ** | Sông Hàn | 1.0 / 1.7 / 2.5 | Đà Nẵng urban; strongly tide-affected |

Thresholds per Decision 05/2020/QĐ-TTg — see [regulatory §2](../00-foundations/08-regulatory-vietnam.md#2-the-alert-level-system-bđ--and-its-limits). **Stages are measured above different station datums and must never share an axis.**

**Tide sensitivity increases downstream.** At Câu Lâu and Cẩm Lệ, the same discharge produces materially different stages depending on tide phase — which is why the mouth boundary is a modelled entity, not a constant.

---

## 6. Exposure at risk

| Settlement | Order of population | Dominant hazard |
|---|---|---|
| Đà Nẵng urban | ~1.1–1.3 M | Compound: Hàn river stage + tide + **urban pluvial drainage failure** |
| Hội An | ~120 k + tourists | Thu Bồn stage + tide; **UNESCO old town floods regularly**; non-resident population with no local knowledge |
| Điện Bàn / Vĩnh Điện | ~45 k | Delta inundation, road cut |
| Duy Xuyên / Nam Phước | ~26–38 k | Thu Bồn overbank |
| Đại Lộc / Ái Nghĩa | ~32 k | **First to flood on the Vu Gia**; the town the governing control point protects |
| Thạnh Mỹ, Hiệp Đức | ~10–12 k | Upstream, flash response, landslide risk |

**Lifelines:** QL1A (national north–south artery through the delta — cutting it is a national-scale disruption), QL14B (the only road corridor to the upper basin and the dams), Đà Nẵng–Quảng Ngãi expressway, Đà Nẵng airport, the Hàn river bridges, and the water intakes supplying Đà Nẵng.

> **QL14B deserves special product treatment:** if it is cut, the dams and their crews become isolated. That is simultaneously an emergency-management fact and a dam-safety fact.

`⚠ Administrative units were reorganised on 1 July 2025 (Quảng Nam merged into Đà Nẵng city; district level abolished). The names above are settlements/places, not current administrative units. See [regulatory §5](../00-foundations/08-regulatory-vietnam.md#5-administrative-reform-2025--a-live-product-risk).`

---

## 7. Monitored zones

The reference application defines **12 monitored zones**, each carrying mean/max depth, exposed population fraction, EOC accessibility, and recommended actions. This is the correct granularity for an operational product: **coarser than a grid cell, finer than a district, and aligned to how responders actually divide the ground.**

Zone status derives from *mean depth* plus the *exposed fraction* of the zone's population — deliberately not a single worst cell, which would make every zone red, and not an absolute count, which would hide small vulnerable communities. See [exposure model §4](04-exposure-and-impact-model.md).

---

## 8. Design scenarios

| Scenario | Anchor | Character | Purpose |
|---|---|---|---|
| **Oct 2020 (Linfa–Nangka class)** | 2020-10-11 | Multi-pulse, saturated antecedent, basin-wide | The memory anchor. Every operator in this basin remembers it. |
| **Yagi-class (worst credible)** | 2024-09-07 | Higher intensity, higher inflow and surge gain | Stress test; the "worst credible" planning case |
| **NE monsoon surge** | 2025-11-03 | Long duration, moderate intensity | The common case — where most real decisions are made |

**Missing scenario classes** (tracked, see [simulation](../04-decision-support/03-simulation-and-scenarios.md)): compound tide+river coincidence, sensor/comms failure during an event, gate failure, dam-safety emergency, and a **false-alarm scenario** (pre-release for a storm that turns away) — the last is essential for teaching honest cost accounting.

---

## 9. Basin-specific decision rules

Rules that only make sense here, and that must be encoded as configuration:

1. **Ái Nghĩa is the governing constraint** for Vu Gia-side release decisions. Optimisation targets its stage.
2. **A release on the Đắk Mi 4 diversion is a Thu Bồn decision**, and must be evaluated at Giao Thủy/Câu Lâu, not only on the Vu Gia.
3. **Tide phase gates the delta decision.** A release that is safe at low tide can be unsafe six hours later at the same discharge.
4. **Upper reservoirs (A Vương, Sông Bung 4) are the early instrument; Sông Tranh 2 is the late instrument** for the Thu Bồn — from their travel times.
5. **QL14B closure is an escalation trigger in its own right**, independent of stage, because it isolates the dams.
6. **Hội An's old town has a distinct, lower damage threshold** than its surroundings: heritage fabric, tourist population, and a stage-damage relationship that begins at low depths.

---

## 10. Known modelling limitations for this basin

| Limitation | Consequence | Status |
|---|---|---|
| Quảng Huế split ratio not modelled | Ái Nghĩa forecast bias in large events | Open, R-04 |
| Diversion not hydrologically active in routing | Thu Bồn side under-represented in proposals | Open, R-05 |
| Basin-mean rainfall only | Cannot distinguish upper (controllable) from lower (uncontrollable) rain | Open, R-02 |
| Tide/surge as a scalar gain | Compound flooding under-represented | Open, R-06 |
| Synthetic hydrology throughout | **No operational validity whatsoever** | By design at M0; see [roadmap](../06-critique/03-roadmap.md) |
| Rating curves not modelled | Stage↔discharge conversion is implicit | Open, R-07 |
| No landslide layer | The deadliest co-hazard is invisible | Open, R-09 |

---

**Next:** [Observation model →](03-observation-model.md)
