# Entity model

The world the product represents. One definition per entity, referenced everywhere else. Concrete values for the reference basin live in [02-basin-vgtb](02-basin-vgtb.md); sensing in [03-observation-model](03-observation-model.md); people and assets in [04-exposure-and-impact-model](04-exposure-and-impact-model.md).

**Conventions:** `PK` primary key · `→` relationship · `[t]` time series · `⚠` safety-critical field · `§` link to the foundation chapter that defines its physics.

---

## Universal twin-object contract

Every domain entity implements this base contract. A field that is not physically applicable is retained as explicit `null`/empty state with a reason; it is not silently omitted. Large geometry, state, history and prediction arrays may be stored by immutable reference, but the object envelope keeps their identifiers, versions and validity.

| Twin object field | Implementation contract |
|---|---|
| Identity | Stable `type`, `id`, basin/tenant scope, schema version and object version; aliases never replace the canonical ID |
| Geometry | Geometry or `geometry_ref`, horizontal CRS, spatial support, accuracy/resolution and no-data semantics |
| Elevation | Elevation/height support with units, vertical datum, accuracy and source; explicit `NOT_APPLICABLE` where the object has no elevation meaning |
| Physical properties | Typed, unit-bearing parameters and bounds with source, provenance, effective period and review state |
| State | Current accepted state plus valid/issue time, quality, provenance, uncertainty, model/source version and permitted use |
| History | Append-only observation, state-transition and decision references sufficient for replay; corrections create new versions |
| Prediction | Forecast/scenario state with horizon, issue/valid time, model/run ID, ensemble or uncertainty representation and skill reference |
| Relationships | Typed references to other stable object IDs, including direction, role, validity period and relationship version |
| Events | Typed immutable events with event ID, object ID, event/record time, cause/source, payload version and audit lineage |

### Scientific-brief object mapping

The brief uses product-language nouns while the canonical model sometimes uses a more specific entity or value object. This table removes ambiguity without creating duplicate concepts.

| Brief object | Canonical entity or value object |
|---|---|
| Terrain | `E-00 TerrainSurface` |
| River | `E-04 River` plus `E-05 RiverReach` |
| Reservoir | `E-07 Reservoir` |
| Dam | `E-08 Dam` |
| Spillway | `E-09 Spillway` |
| Gate | `E-10 Gate` |
| Catchment | `E-01 Catchment` |
| Rain Cell | Cell support within `E-02 RainfallField`, identified by `grid_ref + cell_id` |
| Forecast | `E-03 Forecast` |
| Radar | `E-16 RadarSite` plus versioned radar observations/products |
| Satellite | `E-17 SatelliteProduct` |
| Sensor | `E-13 Sensor` and its typed specializations |
| Population | `E-22 PopulationCell` plus governed census/exposure versions |
| Infrastructure | `E-27 CriticalInfrastructure` and its typed asset records |
| Shelter | `E-30 Shelter` |
| Hospital | `E-28 Hospital` |
| Bridge | `E-26 Bridge` |
| Road | `E-25 Road` |
| Power Station | `E-11 PowerPlant` |

---

## 0. Model overview

```
                          ┌──────────────┐
        Rainfall[t] ─────►│  Catchment   │──── drains to ────┐
        Forecast[t] ─────►│ (sub-basin)  │                   ▼
                          └──────────────┘            ┌─────────────┐
                                                      │  Reservoir  │◄── Dam ── PowerPlant
                                                      └──────┬──────┘        │
                                                   release[t]│               └── Gate ×n
                                                             ▼
     River ──► RiverReach ──► Confluence/Bifurcation ──► RiverReach ──► Estuary ◄── Tide/Surge
                    │                                          │
                    │ stage[t] at                              │
                    ▼                                          ▼
               GaugeStation                            FloodplainCell (grid)
                                                               │ depth[t], velocity[t]
                                                               ▼
                  ┌────────────────────────────────────────────────────────┐
                  │ Exposure: Settlement · Building · Road · Bridge ·      │
                  │ Hospital · School · Shelter · CriticalInfrastructure · │
                  │ PopulationCell · EvacuationRoute · EmergencyTeam       │
                  └────────────────────────────────────────────────────────┘

     Sensing layer: WeatherStation · RainGauge · RadarSite · Satellite · SCADAPoint
     Decision layer: Scenario · Forecast · DecisionProposal · Decision · Notification · AuditRecord
     Organisation:   Organisation · Role · User · CommandLevel
```

---

## 1. Hydrological domain

### E-00 TerrainSurface

`id`, `geometry_ref`, horizontal CRS, `elevation_ref`, vertical datum, resolution, accuracy report, no-data mask, source/provenance, acquisition/effective time, conditioning version, derived slope/aspect/flow-accumulation references, solver-mesh references and display-mesh references. DEM/DTM, bathymetry and render terrain remain separate versioned products; a render mesh cannot become solver authority by reuse.

### E-01 Catchment (`lưu vực`)
| Field | Type | Notes |
|---|---|---|
| `id` PK, `name` | | |
| `area_km2` | float | §[hydrology](../00-foundations/02-hydrology.md) |
| `parent_id` → Catchment | | nesting |
| `outlet` → Reservoir \| GaugeStation \| RiverReach | | exactly one |
| `mean_elevation_m`, `mean_slope`, `land_cover_mix` | | |
| `t_c_h` | float | time of concentration |
| `runoff_params` | `{n_stores, K, C_dry, C_wet}` | calibrated |
| `antecedent_state`[t] ⚠ | `{API, soil_moisture, baseflow, source, updated_at}` | **the state that dominates response** |
| `is_controlled` | bool | is there a reservoir above it |

**Invariant:** Σ(sub-catchment areas) = parent area ± 1 %. A basin whose sub-areas don't close is a data error, not a rounding issue.

### E-02 Rainfall field (`Rainfall`)
| Field | Notes |
|---|---|
| `grid_ref`, `timestamp`, `accumulation_window` | mm over a stated window — never a bare "mm" |
| `value_mm`, `source` | `GAUGE \| RADAR \| SATELLITE \| NWP \| AI_MODEL \| BLENDED` |
| `provenance` | `MEASURED \| FORECAST \| MODELLED` |
| `bias_correction_version` | |

### E-03 Forecast
| Field | Notes |
|---|---|
| `id` PK, `issued_at`, `valid_from`, `valid_to` | |
| `model` | e.g. `IFS-ENS`, `GenCast`, `WRF-4km`, `official-bulletin` |
| `members[]` | ensemble; a deterministic run is `n=1` and must be labelled as such |
| `variable` | rainfall, stage, discharge, tide, surge |
| `quantiles` | q05…q95 derived, never stored as the primary truth |
| `skill_ref` → VerificationRecord | ⚠ **a forecast with no verification history is `LOW` confidence by definition** |
| `confidence` | `HIGH \| MEDIUM \| LOW \| UNUSABLE` — see [uncertainty](../04-decision-support/02-uncertainty-and-confidence.md) |

### E-04 River / E-05 RiverReach
| Entity | Fields |
|---|---|
| **River** | `id`, `name`, `mouth`, `reaches[]` |
| **RiverReach** | `id`, `from_node`, `to_node`, `length_km`, `geometry`, `bankfull_q`, `manning_n`, `cross_sections[]`, `routing_params{K, X}`, `travel_time_h(magnitude)`, `capacity_q` ⚠ |

**Node types:** `SOURCE`, `CONFLUENCE`, `BIFURCATION` (with stage-dependent `split_ratio` and its uncertainty — see [hydraulics §4](../00-foundations/03-hydraulics-and-routing.md)), `GAUGE`, `STRUCTURE`, `MOUTH`.

**Invariant:** the reach graph is a DAG from sources to mouths. A cycle means a data error; bifurcations must be modelled as explicit split nodes, not as cycles.

### E-06 Estuary / mouth boundary
`tide[t]` (deterministic) · `surge[t]` (forecast) · `wave_setup[t]` · `total_level[t]` ⚠ · `backwater_extent_km`
Never a constant. See [hydraulics §5](../00-foundations/03-hydraulics-and-routing.md).

---

## 2. Infrastructure domain

### E-07 Reservoir
| Field | Type | Notes |
|---|---|---|
| `id` PK, `name`, `river_id`, `location` | | |
| `zv_curve` ⚠ | `[(Z, V)]` + `survey_date`, `version` | ages with sedimentation |
| `z_dead`, `z_ceil`, `z_fsl`, `z_design`, `z_check`, `z_crest` ⚠ | m a.s.l. | §[dam safety §3](../00-foundations/05-dam-safety.md) |
| `capacity_total_Mm3`, `capacity_dead_Mm3`, `flood_storage_Mm3` | | |
| `rule_curve` | `[(date, z_target, z_min, z_max)]` + `effective_from`, `legal_ref` | configuration, never code |
| `level`[t] ⚠, `storage`[t], `inflow`[t] ⚠ (derived + error band), `outflow`[t] | | |
| `free_storage_Mm3` (derived) | `V(z_ceil) − V(z_now)` | **the operator's number** |
| `time_to_full_h` (derived) | `free_storage / net_inflow` | |
| `freeboard_m` (derived) ⚠ | `z_crest − z_now` | |
| `dz_dt` (smoothed ≥30 min) ⚠ | | |
| `operating_mode` | see [res-ops §8](../00-foundations/04-reservoir-operations.md) |
| `upstream_of[]`, `downstream_of[]` → Reservoir | | cascade topology |
| `diversion_to` → River | | e.g. Đắk Mi 4 → Thu Bồn |

**Invariants (checked every cycle; violation = data alarm, not a silent clamp):**
1. `z_dead ≤ z_ceil ≤ z_fsl ≤ z_design ≤ z_check < z_crest`
2. `V(z)` monotonically increasing
3. Mass balance closes within sensor tolerance
4. `outflow ≤ Q_max(z)` from the gate rating

### E-08 Dam
`type` (`GRAVITY \| ARCH \| RCC \| EMBANKMENT`) · `height_m`, `crest_length_m`, `crest_elevation_m` ⚠ · `year_commissioned` · `design_flood_p`, `check_flood_p` · `instrumentation[]` → Sensor · `eap` → EmergencyActionPlan ⚠ · `breach_scenarios[]` ⚠ (pre-computed; see [simulation §5](../04-decision-support/03-simulation-and-scenarios.md)) · `last_safety_inspection`, `known_defects[]`, `maintenance_state`

### E-09 Spillway & E-10 Gate
| Spillway | `type` (`GATED \| FREE \| SIDE_CHANNEL`), `crest_elevation_m`, `width_m`, `n_gates`, `rating_curve` ⚠, `q_max_design`, `q_max_safe_stilling_basin` ⚠, `energy_dissipator_type` |
| **Gate** | `id`, `index` (position across the spillway), `type` (`RADIAL \| VERTICAL \| FLAP`), `height_m`, `width_m`, `opening_m`[t] ⚠, `commanded_opening_m` ⚠, `step_m`, `time_per_step_min`, `hoist_power_source`, `status` (`OK \| DEGRADED \| FAILED \| MAINTENANCE`), `last_tested` |

⚠ **`opening_m ≠ commanded_opening_m` is a critical alarm**, always, with no aggregation.
⚠ **Symmetry rule:** a legal gate configuration is symmetric about the centreline. The proposal engine must emit only legal configurations. See [res-ops §5](../00-foundations/04-reservoir-operations.md).

### E-11 PowerPlant
`installed_MW`, `n_units`, `design_head_m`, `q_turbine_max`, `unit_status[]`, `generation`[t], `dispatch_commitment`[t] (from the power dispatch centre), `revenue_per_MWh` (for regret computation, **never as an optimiser objective above rank 4**), `tailrace_level`[t]

### E-12 GaugeStation
`id`, `name`, `river_id`, `location`, `datum_m` ⚠ (station zero — **stages are not comparable across stations**), `bd1/bd2/bd3` ⚠ + `legal_ref` + `effective_from`, `rating_curve` ⚠ (+ `version`, `valid_range`, `last_survey`), `stage`[t], `discharge`[t] (derived), `is_governing_control_point` (bool — the point a release decision is optimised against), `historical_peaks[]` (memory anchors: "2020 level", "2009 level")

---

## 3. Sensing domain → see [03-observation-model](03-observation-model.md)

`E-13 Sensor` · `E-14 WeatherStation` · `E-15 RainGauge` · `E-16 RadarSite` · `E-17 SatelliteProduct` · `E-18 SCADAPoint` · `E-19 Observation` · `E-20 DataQualityFlag`

Every one of them carries `last_seen`, `quality`, `provenance` and a **staleness policy**. A sensor is never assumed to be reporting.

---

## 4. Land, people and assets → see [04-exposure-and-impact-model](04-exposure-and-impact-model.md)

`E-21 FloodplainCell` · `E-22 PopulationCell` · `E-23 Settlement` · `E-24 Building` · `E-25 Road` · `E-26 Bridge` · `E-27 CriticalInfrastructure` · `E-28 Hospital` · `E-29 School` · `E-30 Shelter` · `E-31 EvacuationRoute` · `E-32 MonitoredZone` · `E-33 EmergencyTeam` · `E-34 AdministrativeUnit`

### E-34 AdministrativeUnit — note the validity period
| Field | Notes |
|---|---|
| `id`, `name`, `level` (`CITY_PROVINCE \| COMMUNE`), `parent_id`, `geometry`, `population` | |
| `valid_from`, `valid_to` ⚠ | **Vietnam reorganised its administrative units on 1 July 2025** — see [regulatory §5](../00-foundations/08-regulatory-vietnam.md#5-administrative-reform-2025--a-live-product-risk) |
| `census_vintage` | which statistical release the population came from |

**Rule:** boundaries and names are *data with a validity period*, never constants. Place names (a bridge, a market, a ward as a landmark) are a **separate** entity from administrative units, because place names outlive decrees.

---

## 5. Decision domain

### E-35 Scenario
`id`, `name`, `type` (`HISTORICAL_REPLAY \| LIVE_FORECAST \| WHATIF \| TRAINING \| DESIGN_EVENT`), `anchor_time`, `forcing` → Forecast/Rainfall, `assumptions[]`, `created_by`, `is_synthetic` ⚠ (**must be true for anything not derived from a real feed, and must be visible on every screen and export**)

### E-36 DecisionProposal ⚠ — the central product artefact
| Field | Notes |
|---|---|
| `id`, `created_at`, `scenario_id`, `horizon_h` | |
| `actions[]` | `{reservoir_id, start_time, target_q, gate_config, ramp_rate, end_condition}` — **all six fields or it is not actionable** |
| `constraints_checked[]` ⚠ | `{constraint_id, status: PASS\|FAIL\|MARGINAL, margin, binding}` — the proof that ranks 1–3 hold ([res-ops §1](../00-foundations/04-reservoir-operations.md)) |
| `feasible` ⚠ | bool. **If false, the proposal is still shown, with the binding constraint named.** |
| `predicted_outcome` | stage/depth/exposure series with quantiles |
| `counterfactual` ⚠ | what happens if you do nothing — *required*, not optional |
| `alternatives[]` | ≥ 2, each with its trade-off stated |
| `regret` | `{if_act_and_storm_misses, if_dont_act_and_storm_comes}` — the asymmetric loss |
| `decision_deadline` ⚠ | `action_time − notification_lead − approval_lead` — **the countdown shown on the dashboard** |
| `confidence`, `controllability_kappa` | see [hydrology §6](../00-foundations/02-hydrology.md) |
| `explanation` | inputs, method, sensitivity — machine-generated, human-readable |
| `model_versions{}` ⚠ | every model, parameter set, threshold set and rulebook version |

### E-37 Decision
`proposal_id`, `decided_at`, `decided_by` → User ⚠, `authority_basis` (legal reference), `choice` (`APPROVE \| MODIFY \| REJECT \| DEFER`), `modifications`, `reason_of_record` ⚠ (**required, free text, ≤ 30 s to enter**), `input_snapshot_hash` ⚠, `resulting_orders[]`, `notifications[]`

### E-38 Notification
`decision_id`, `channel` (`SMS \| CALL \| ZALO \| SIREN \| LOUDSPEAKER \| RADIO \| APP \| CAP_FEED \| EMAIL`), `audience`, `template_id`, `rendered_text` ⚠ (**generated from the decision record — never hand-authored per channel**, so channels cannot diverge), `sent_at`, `delivery_status`, `acknowledged_by`, `acknowledged_at` ⚠

### E-39 AuditRecord
Append-only, tamper-evident. `{seq, timestamp_utc, actor, action, entity_ref, before_hash, after_hash, screen_state_ref}`. Supports exact replay of what any user saw at any past moment. See [regulatory §6](../00-foundations/08-regulatory-vietnam.md#6-liability-evidence-and-the-audit-trail).

### E-40 EmergencyActionPlan
`dam_id`, `version`, `approved_by`, `triggers[]` (**evaluable expressions**, not prose), `levels[1..3]` → `{condition, actions[], contacts[]}`, `contact_tree` → Person/Organisation with backups, `breach_inundation_layers[]`, `shelters[]`, `routes[]`, `last_exercised_at` ⚠

### E-41 VerificationRecord
`forecast_id`, `observed`, `lead_time_h`, `metrics{crps, brier, peak_error_m, timing_error_h, pod, far, csi}`, `event_ref` — feeds the [Forecast Performance screen](../05-product/02-screen-catalog.md).

---

## 6. Organisation domain

### E-42 Organisation / E-43 CommandLevel / E-44 Role / E-45 User
| Entity | Fields |
|---|---|
| Organisation | `id`, `name`, `type` (`PLANT_OWNER \| CITY_PROVINCE \| COMMUNE \| MET_SERVICE \| DISPATCH \| MILITARY \| HEALTH \| MEDIA`) |
| CommandLevel | `level`, `activated_for_risk_level` — driven by disaster risk level 1–5 ([regulatory §3](../00-foundations/08-regulatory-vietnam.md)) |
| Role | `name`, `permissions[]`, `can_approve[]`, `notification_subscriptions[]` |
| User | `id`, `name`, `org`, `roles[]`, `contact`, `shift`, `certification` (⚠ some approvals require a certified operator) |

---

## 7. Cross-cutting field contract

**Every displayed quantity in the product carries this envelope. No exceptions.**

```
Quantity {
  value
  unit
  provenance:  MEASURED | FORECAST | MODELLED | ASSUMED | SYNTHETIC
  timestamp
  age                      // rendered whenever > threshold
  quality:     OK | SUSPECT | STALE | MISSING | ESTIMATED
  uncertainty: {band | quantiles | class}   // null only for MEASURED with negligible error
  source_ref                                // sensor id, model id, or document
  version                                   // model / rating curve / threshold set
}
```

> This single contract is what separates a decision-support product from a dashboard. It is also what makes the [audit trail](../00-foundations/08-regulatory-vietnam.md#6-liability-evidence-and-the-audit-trail) possible, and it is **the first thing to implement in the application** — see [demo gap analysis](../99-appendix/demo-gap-analysis.md).

---

## 8. Reference implementation coverage

| Group | Implemented in the app | Missing |
|---|---|---|
| Hydrology | Catchment (implicit), Rainfall, Forecast (synthetic ensemble), River, RiverReach (geometry), GaugeStation | Sub-catchments, antecedent state, estuary boundary as an entity |
| Infrastructure | Reservoir (levels/capacity/turbine/spill), PowerPlant (implicit), diversion (drawn) | Dam, Spillway, **Gate**, breach scenarios, freeboard, design/check levels |
| Sensing | — | **Entire sensing layer** |
| Land/people | FloodplainCell, PopulationCell, Settlement, Building, Road, Bridge, MonitoredZone | Shelter, Hospital, School, CriticalInfrastructure, EvacuationRoute, EmergencyTeam, AdministrativeUnit |
| Decision | Scenario, a proposal-like object (`H.proposal`) | Decision, Notification, AuditRecord, EAP, VerificationRecord, constraint list, counterfactual, deadline |
| Organisation | — | **Entire organisation layer** |

---

**Next:** [The reference basin →](02-basin-vgtb.md)
