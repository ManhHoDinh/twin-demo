# Exposure and impact model

Turning water depth into consequences a decision-maker can act on. Physics is in [hydraulics §6](../00-foundations/03-hydraulics-and-routing.md); thresholds and damage curves in [typical values §6](../00-foundations/09-typical-values.md).

---

## 1. The impact chain

```
depth(x,y,t), velocity(x,y,t)
        │
        ├─► × Population raster ────────► people exposed, people needing evacuation
        ├─► × Building inventory ───────► buildings flooded, damage, homeless
        ├─► × Road network ─────────────► roads closed, isolation, route viability
        ├─► × Critical infrastructure ──► hospitals/schools/power/water affected
        ├─► × Agriculture/aquaculture ──► economic loss
        └─► × Time ─────────────────────► duration of disruption
```

**The product's job is to compute the right-hand column fast, transparently, and with visible uncertainty.** An operator does not decide on a depth map. They decide on *"18 000 people, 4 200 homes, QL1A cut for ~9 hours, Hội An old town 0.9 m."*

---

## 2. Entity definitions

### E-21 FloodplainCell
`cell_id`, `centroid`, `ground_elevation_m`, `land_use`, `depth[t]`, `velocity[t]` ⚠, `duration_h`, `hazard_rating[t]`, `is_dynamic` (floodplain vs diagnostic terrain).

**`velocity` is currently missing in the reference application** and it matters: fast shallow water kills. See [FR-19](../05-product/03-prd.md).

### E-22 PopulationCell
`cell_id`, `residents`, `daytime_population` ⚠, `night_population`, `age_profile`, `vulnerability_index`, `census_vintage`, `admin_unit_id` (+ validity period).

> **Day/night matters enormously.** A school, a market or an industrial zone holds thousands at 10:00 and nobody at 03:00. A residential ward is the reverse. Floods do not respect office hours, and the exposure number is wrong by a factor of several if the diurnal profile is ignored. Minimum viable version: two profiles (day/night) per cell.

### E-23 Settlement
`id`, `name`, `type` (`CITY \| TOWN \| VILLAGE \| HAMLET`), `population`, `centroid`, `admin_unit_id`, `historical_flood_marks[]` (memory anchors: "2020 line on the wall").

### E-24 Building
`id`, `footprint`, `n_storeys` ⚠, `floor_elevation_m` ⚠, `construction` (`MASONRY \| RC \| LIGHT \| TRADITIONAL_HERITAGE`), `use` (`RESIDENTIAL \| COMMERCIAL \| PUBLIC \| INDUSTRIAL \| HERITAGE`), `occupants_day`, `occupants_night`, `has_upper_floor_refuge` (bool).

> **`n_storeys` + `floor_elevation_m` decide whether a household can shelter in place or must move.** These two fields convert a depth map into an evacuation requirement, and they are the highest-value building attributes by a wide margin. Everything else is cosmetic.

### E-25 Road / E-26 Bridge
Road: `id`, `name`, `class` (`NATIONAL \| PROVINCIAL \| DISTRICT \| URBAN \| ALLEY`), `geometry`, `surface_elevation[]`, `min_elevation_point` ⚠ (**the lowest point decides closure, not the average**), `is_lifeline` (bool), `closure_state[t]`, `open_until[t]` ⚠.

Bridge: `id`, `name`, `deck_elevation_m` ⚠, `soffit_elevation_m`, `debris_risk`, `is_only_crossing` (bool — a single-crossing failure isolates a whole area).

### E-27–E-30 Critical infrastructure, hospitals, schools, shelters
| Entity | Critical fields |
|---|---|
| **CriticalInfrastructure** | `type` (`POWER \| WATER_INTAKE \| WATER_TREATMENT \| TELECOM \| EOC \| FUEL \| BRIDGE \| PUMP_STATION`), `elevation_m`, `criticality`, `dependencies[]`, `backup_power_h` |
| **Hospital** | `beds`, `icu_beds`, `has_backup_power`, `evacuation_difficulty` ⚠ (**hospital evacuation needs 12–48 h lead time — far more than any other facility**), `is_receiving_facility` |
| **School** | `students_day`, `is_designated_shelter`, `elevation_m` |
| **Shelter** ⚠ | `capacity_persons`, `current_occupancy`, `elevation_m`, `is_in_flood_footprint` ⚠, `access_routes[]`, `has_water/power/medical/toilets`, `accepts_livestock` (a real determinant of compliance in rural Vietnam) |

> **Validation rule, run at ingest and again per event:** a shelter whose location is inside any modelled inundation footprint, or whose access routes are all cut before the hazard arrives, is flagged **INVALID** and cannot be offered. This is [failure-library §3 #13](../00-foundations/10-failure-library.md).

### E-31 EvacuationRoute ⚠
`id`, `from_zone`, `to_shelter`, `path`, `length_km`, `min_elevation_m`, `capacity_persons_per_hour`, `viability[t]`, `open_until` ⚠, `assisted_transport_required`.

**Route viability must be computed against the forecast flood state at the time of use**, not the current state:
```
route is viable for a departure at t₀  ⟺  ∀ s ∈ [t₀, t₀ + travel_time]:  depth(path, s) < 0.15 m
```
Present as **"open until ~HH:MM (±1 h)"**, never as a green/red binary.

### E-32 MonitoredZone
`id`, `name`, `geometry`, `population`, `mean_depth[t]`, `max_depth[t]`, `exposed_fraction[t]`, `status`, `eoc_access[t]`, `recommended_actions[]`, `responsible_org`.

The operational unit of the product — coarser than a grid cell, finer than an administrative unit, aligned to how responders divide ground. The reference application implements 12 of these.

### E-33 EmergencyTeam
`id`, `type` (`RESCUE \| MEDICAL \| MILITARY \| POLICE \| UTILITY \| ENGINEERING`), `base_location`, `strength`, `capabilities[]`, `assets[]` (boats matter), `status`, `assigned_zone`, `reachable_zones[t]` ⚠ (**shrinks as roads close — the reason to pre-position, and the reason pre-positioning has a deadline**).

---

## 3. Impact computation

### 3.1 People exposed
```
exposed(t) = Σ_cells  population(cell, profile(t)) · f_exposure(depth(cell,t))

f_exposure:  depth < 0.15 → 0
             0.15–0.30   → 0.25   (disrupted)
             0.30–0.50   → 0.60   (affected)
             > 0.50      → 1.00   (directly affected)
```
Report as a **range**, from the ensemble quantiles, and **round to the nearest 100**. `18 000 – 24 000 people` is honest; `21 437 people` is not.

### 3.2 People needing evacuation
```
evacuation_need = Σ buildings where depth > (floor_elevation + 0.3)
                    AND NOT has_upper_floor_refuge
                  + all occupants of buildings where depth > floor + 1.5   (vertical refuge insufficient)
                  + assisted-evacuation register in the footprint
```
This is a *different and much smaller* number than "people exposed", and confusing the two produces either panic or complacency. **Show both, labelled distinctly.**

### 3.3 Damage
```
Damage = Σ_assets  value(asset) · damage_ratio(depth, asset_type) · duration_factor · velocity_factor
```
**Monetary damage must be labelled `INDICATIVE` unless locally-calibrated curves exist.** A currency figure carries false authority; publishing an uncalibrated one is how a product loses a customer after the first event. Prefer physical units (homes flooded, hectares inundated, road-hours lost) and offer money as a secondary, clearly-caveated view.

### 3.4 Isolation
A zone is **isolated** when every road out is closed. Compute on the road graph:
```
isolated(zone, t) ⟺ no path from zone to any EOC/hospital/shelter with depth < 0.30 m along it
```
Isolation is often more operationally important than depth: an isolated village with 0.4 m of water and no boat access outranks a 1.2 m flood next to a highway.

### 3.5 Lifeline outage cascade
Power → water pumping → water supply → hospital function. Telecom → warning dissemination → everything. Model as explicit `dependencies[]` and show the second-order consequence, because it is invisible on a depth map and it is what the EOC actually manages.

---

## 4. Zone status logic (as implemented, and why it is right)

The reference application derives zone status from **mean depth** and the **exposed fraction of the zone's population** — deliberately *not* from a single worst cell, and *not* from an absolute headcount.

| Wrong approach | Failure |
|---|---|
| Max depth in the zone | One cell in a ditch turns the whole zone red; everything is always red; alarm fatigue |
| Absolute exposed count | Small vulnerable communities never surface next to a city |
| Mean depth alone | A deep flood over an empty field ranks equal to a shallow flood in a market |

**Mean depth × exposed fraction** is the defensible combination. Keep it.

**Status ladder:**

| Status | Condition (indicative, configurable) |
|---|---|
| `NORMAL` | mean depth < 0.05 m, exposed fraction < 1 % |
| `WATCH` | mean depth 0.05–0.15 m or exposed fraction 1–5 % |
| `WARNING` | mean depth 0.15–0.40 m or exposed fraction 5–20 % |
| `SERIOUS` | mean depth 0.40–1.0 m or exposed fraction 20–50 % |
| `CRITICAL` | mean depth > 1.0 m or exposed fraction > 50 % or **isolated** or **shelter invalid** |

Thresholds are configuration with an effective date, agreed with the responsible authority — not constants.

---

## 5. Uncertainty in impact numbers

Impact inherits every upstream error and adds its own (population raster, building attributes, damage curves). Practical policy:

| Quantity | Present as | Never present as |
|---|---|---|
| People exposed | Range, nearest 100 | Exact count |
| Homes flooded | Range, nearest 10 | Exact count |
| Depth in a zone | Band (one of 5) | Continuous to 0.01 m |
| Damage in currency | Order of magnitude, labelled indicative | A precise total |
| Roads closed | Named list with closure windows | A count |
| Time to isolation | Range with confidence | A single time |

> The 5-discrete-depth-band choice already made in the reference application is exactly right and must be preserved. It is honest about resolution *by construction*, and it survives every red-team round in [critique](../06-critique/01-red-team-review.md).

---

## 6. Reference implementation status

| Element | Status | Gap |
|---|---|---|
| Flood depth grid + 5 bands | ✅ | No velocity, no hazard rating |
| Population field (gaussian, totals matched) | ✅ | No day/night profile, no vulnerability index |
| Buildings from imagery + OSM footprints | ✅ | **No storeys, no floor elevation** — cannot compute evacuation need |
| Roads with 0.15/0.30 m thresholds + rerouting | ✅ | Closure uses current, not forecast, state; no `open_until` |
| Monitored zones with status, exposure, actions | ✅ | Status logic correct; no isolation detection |
| Impact heatmap (pop × excess depth) | ✅ | — |
| Shelters, hospitals, schools, critical infra | ❌ | **Missing entirely — largest exposure-model gap** |
| Evacuation routes | ❌ | Missing |
| Emergency teams | ❌ | Missing |
| Damage estimation | ❌ | Missing (and should stay indicative-only) |
| Isolation detection | ❌ | Missing — high value, cheap on the existing road graph |

---

**Next:** [Personas →](../02-stakeholders/01-personas.md)
