# Typical values, ranges and plausibility bounds

A reference table so that no screen, model or reviewer has to guess whether a number is sane. **Values marked *indicative* are engineering rules of thumb for sanity-checking, not design values.** Design values come from the dam owner's studies and the basin's own records.

Use these as **validation bounds**: anything outside them is a data-quality alarm, not a reading.

---

## 1. Rainfall

| Quantity | Typical | Extreme (central VN) |
|---|---|---|
| Light rain | 1–4 mm/h | — |
| Moderate | 4–10 mm/h | — |
| Heavy | 10–30 mm/h | — |
| Very heavy | 30–60 mm/h | — |
| Extreme burst | > 60 mm/h | 100–150 mm/h possible for short periods |
| 24-h total, wet-season day | 30–100 mm | — |
| 24-h total, typhoon | 150–400 mm | **> 500 mm observed in central VN events** |
| 3-day total, extreme sequence | — | **1000–1500 mm on windward slopes** (Oct 2020 class) |
| Annual, coastal Đà Nẵng | ~2000–2500 mm | — |
| Annual, Trường Sơn windward slopes | ~3000–4000+ mm | — |

**Plausibility alarm:** any hourly gauge value > 200 mm/h, or a daily value > 1000 mm, is a sensor fault until proven otherwise.

**Areal reduction factor (indicative)**

| Area \ Duration | 1 h | 6 h | 24 h |
|---|---|---|---|
| 100 km² | 0.85 | 0.92 | 0.96 |
| 500 km² | 0.72 | 0.85 | 0.92 |
| 1000 km² | 0.65 | 0.80 | 0.89 |
| 5000 km² | 0.50 | 0.68 | 0.81 |

---

## 2. Catchment response

| Quantity | Steep upper VGTB sub-catchment | Lower/delta |
|---|---|---|
| Time of concentration `t_c` | 3–8 h | 8–24 h |
| Runoff coefficient `C`, dry antecedent | 0.20–0.35 | 0.30–0.45 |
| `C`, saturated | 0.70–0.90 | 0.60–0.80 |
| Specific peak discharge (extreme) | 1–3 m³/s per km² | 0.3–1 m³/s per km² |
| Baseflow (dry season) | 0.005–0.02 m³/s per km² | — |

**Sanity identity:** a 1000 km² catchment receiving 200 mm in 12 h with `C = 0.7` yields
`V = 0.2 m × 0.7 × 10⁹ m² = 140 Mm³`, i.e. a mean of ≈ 3200 m³/s over 12 h — and a peak considerably higher. Any model producing a peak below the 12-h mean is broken.

---

## 3. River hydraulics

| Quantity | Typical |
|---|---|
| Mean velocity, lowland channel in flood | 1.0–2.5 m/s |
| Mean velocity, mountain reach in flood | 2–5 m/s |
| Flood wave celerity, lowland | 2–4 m/s (7–15 km/h) |
| Travel time, upper dam → lowland gauge (VGTB scale) | 3–6 h |
| Travel time, lowland gauge → city gauge | 2–5 h |
| Manning `n`, natural channel | 0.030–0.045 |
| Manning `n`, vegetated floodplain | 0.070–0.160 |
| Muskingum `X` | 0.20–0.30 (natural), → 0 (storage-dominated) |
| Rate of stage rise, severe flood | 0.3–1.0 m/h (locally higher) |

---

## 4. Reservoirs — VGTB reference cascade

Parameters used by the reference implementation (`js/data.js`). **Level values are plausible published magnitudes used for demonstration; treat all as `⚠ VERIFY` against the owner's records before any operational claim.**

| Reservoir | River | `Z_dead` (m) | `Z_ceil` (m) | `Z_FSL` (m) | Capacity (Mm³) | Dead storage (Mm³) | Turbine `Q` (m³/s) | Spillway max (m³/s) | Lag (h) |
|---|---|---|---|---|---|---|---|---|---|
| A Vương | A Vương | 340 | 376 | 380 | 344 | 74 | 78 | 3400 | 3.0 |
| Sông Bung 4 | Vu Gia | 205 | 217.5 | 222.5 | 510 | 110 | 166 | 5800 | 3.5 |
| Đắk Mi 4 | Đắk Mi | 240 | 255 | 258 | 312 | 66 | 128 | 4200 | 4.0 |
| Sông Tranh 2 | Thu Bồn | 140 | 172 | 175 | 730 | 190 | 110 | 6500 | 4.5 |

**Derived operator arithmetic (memorise):**

| Identity | Value |
|---|---|
| 1000 m³/s for 1 h | 3.6 Mm³ |
| 1 Mm³ | 1 000 000 m³ |
| Turbine-only outflow of the whole cascade | ≈ 480 m³/s — **trivial compared to flood inflows of thousands** |
| Total active storage of the four | ≈ 1460 Mm³ gross; usable flood buffer far less, depends on starting level |
| Buffer if all four sit 2 m below ceiling | order of 100–200 Mm³ → ≈ 30–60 h at 1000 m³/s net, ≈ 6–12 h at 5000 m³/s |

> **The lesson in that last row is the product's core honest message:** against a 5000 m³/s event, this cascade buys hours, not days. It can *shape* a flood; it cannot *cancel* one. Any UI that implies otherwise is lying, and the operator will know within one event.

---

## 5. Gates and releases

| Quantity | Typical |
|---|---|
| Radial gate width | 8–15 m |
| Number of spillway gates (medium hydropower dam) | 3–6 |
| Gate opening step | 0.1–0.5 m |
| Time to move one gate one step | 1–5 min |
| Discharge coefficient, gated orifice `Cd` | 0.60–0.75 |
| Discharge coefficient, ogee weir `Cd` (SI) | 1.8–2.2 |
| Outflow ramp limit | plant-specific; order of `Q_spillmax / 6 h` |
| Minimum notification before increasing spill | ≥ 2 h `⚠ VERIFY against procedure` |
| Max downstream rate of rise (guideline) | 0.3–0.5 m/h |
| Max downstream rate of fall (guideline) | 0.15–0.3 m/h |

---

## 6. Flood impact thresholds

| Depth | Effect |
|---|---|
| 0.15 m | Road hazardous |
| 0.30 m | **Road closed** — vehicles stall/float |
| 0.50 m | Adults unstable in moving water; property damage starts |
| 1.00 m | Ground floor uninhabitable |
| 2.00 m | Structural risk to light buildings |

| Hazard rating `HR = h(v+0.5)+DF` | Class |
|---|---|
| < 0.75 | Low — caution |
| 0.75–1.25 | Moderate — danger to some |
| 1.25–2.5 | Significant — danger to most |
| > 2.5 | Extreme — danger to all |

**Depth–damage (residential, indicative damage ratio of structure+contents value):**

| Depth (m) | 0.1 | 0.3 | 0.5 | 1.0 | 1.5 | 2.0 | 3.0 |
|---|---|---|---|---|---|---|---|
| Single-storey masonry | 0.05 | 0.13 | 0.22 | 0.40 | 0.52 | 0.62 | 0.75 |
| Two-storey | 0.03 | 0.09 | 0.15 | 0.28 | 0.36 | 0.44 | 0.60 |
| Light/temporary | 0.15 | 0.35 | 0.55 | 0.80 | 0.92 | 1.00 | 1.00 |

*Indicative shape only. Must be replaced by locally-calibrated curves before any monetary claim is published. Duration and velocity modify these substantially.*

---

## 7. Exposure — reference basin

| Place | Population (order) |
|---|---|
| Đà Nẵng urban | ~1.1–1.3 M |
| Hội An | ~120 k |
| Vĩnh Điện / Điện Bàn town area | ~45 k |
| Nam Phước / Duy Xuyên | ~26–38 k |
| Ái Nghĩa / Đại Lộc town | ~32 k |
| Thạnh Mỹ, Hiệp Đức | ~10–12 k |

`⚠ Administrative units were reorganised on 1 July 2025 — see [regulatory §5](08-regulatory-vietnam.md#5-administrative-reform-2025--a-live-product-risk). Figures above are order-of-magnitude for the settlement, not the current administrative unit.`

| Quantity | Indicative |
|---|---|
| Urban population density, Đà Nẵng core | 5 000–15 000 /km² |
| Rural delta density | 300–1 500 /km² |
| Persons per household | 3.5–4.0 |
| Shelter capacity, typical school | 200–600 persons |
| Evacuation movement speed, assisted, flooding roads | 2–5 km/h |

---

## 8. Forecast skill (what to expect, and what to promise)

| Lead time | Rainfall QPF skill | Flood stage skill | Actionable? |
|---|---|---|---|
| 0–3 h | Good (nowcast) | Very good | Yes — but too late for evacuation of large areas |
| 3–12 h | Moderate | Good | **Yes — the operational sweet spot** |
| 12–24 h | Moderate/weak on placement | Moderate | Yes for reservoir pre-positioning |
| 24–48 h | Weak on amount, useful on synoptics | Weak–moderate | Yes for readiness posture only |
| 48–120 h | Synoptic signal only | Low | Watch/prepare only — **never for evacuation orders** |
| > 5 d | — | Not usable | No |

**Peak stage error (well-calibrated system, indicative):** ±0.2–0.4 m at 6 h, ±0.5–1.0 m at 24 h, ±1.0–2.0 m at 48 h.
**Peak timing error:** ±1–2 h at 6 h, ±3–6 h at 24 h.

**Promise discipline:** the product's published claims must sit inside this table. If marketing wants a bigger number, the answer is no.

---

## 9. Plausibility bounds for automated data QA

Any value outside these is flagged `SUSPECT` and excluded from the decision loop until reviewed:

| Signal | Hard bounds | Rate bounds |
|---|---|---|
| Reservoir level `Z` | `Z_dead − 5` … `Z_crest + 1` | \|dZ/dt\| ≤ 1.5 m/h |
| River stage `H` | `−1` … `station max + 2 m` | \|dH/dt\| ≤ 1.5 m/h |
| Rainfall | 0 … 200 mm/h | — |
| Reservoir inflow `Q_in` | 0 … 3 × spillway max | \|dQ/dt\| ≤ spillmax/h |
| Outflow `Q_out` | 0 … spillway max × 1.05 | ramp limit |
| Gate opening | 0 … gate height | plant hoist rate |
| Flood depth (model) | 0 … 15 m | — |
| Any signal | **stale > 30 min ⇒ degrade; > 3 h ⇒ exclude** | — |

> These bounds belong in configuration, are versioned, and their violations are shown to the user — silently discarding data is forbidden. See [observation model](../01-domain-model/03-observation-model.md).

---

**Next:** [Failure library →](10-failure-library.md)
