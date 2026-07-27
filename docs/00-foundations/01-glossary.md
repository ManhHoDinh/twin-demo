# Glossary, units and symbols

Bilingual reference. Vietnamese terms are the ones actually spoken in a Vietnamese control room; keeping them prevents mistranslation in the UI. Return here rather than redefining terms elsewhere.

---

## 1. Units and conventions

| Quantity | Unit | Notes |
|---|---|---|
| Discharge / flow | `m³/s` (cumec) | Never `m3/h`. Spill + turbine + leakage = total outflow. |
| Reservoir storage | `10⁶ m³` = `Mm³` | 1 Mm³ = 1 million m³. Vietnamese practice also uses `triệu m³`. |
| Reservoir level | `m a.s.l.` | Absolute elevation. Called *mực nước hồ*, symbol `Z`. |
| River stage | `m` above **station datum** | Called *mực nước*, symbol `H`. Station zero differs per gauge. **Not comparable between stations.** |
| Rainfall depth | `mm` | Accumulated over a stated window (1 h, 3 h, 6 h, 24 h). |
| Rainfall intensity | `mm/h` | Instantaneous or interval mean — always state which. |
| Catchment area | `km²` | *diện tích lưu vực* |
| Flood depth | `m` | Water depth above local ground, not above datum. |
| Travel time | `h` | Time for a flood wave crest to move between two points. |
| Population | persons | Rounded to 100 in UI; never fake precision. |
| Energy | `MWh`, capacity `MW` | |
| Time | ICT (UTC+7) displayed, UTC stored | |

**Rounding policy in UI:** discharge to 10 m³/s below 1000, to 50 m³/s above; stage to 0.01 m; reservoir level to 0.01 m; volume to 0.1 Mm³; population to nearest 100; area to 1 km². Rounding *up* for exposure, *down* for available capacity — errors should fall on the safe side.

---

## 2. Core hydrology & hydraulics

| EN | VI | Definition |
|---|---|---|
| Catchment / basin | Lưu vực | Land area draining to a point. Sub-catchment = *tiểu lưu vực*. |
| Inflow | Lưu lượng đến / lưu lượng về hồ | Flow entering a reservoir, `Q_in`. Almost never measured directly — back-calculated. See [hydrology §5](02-hydrology.md#5-inflow-estimation). |
| Outflow | Lưu lượng xả | Total leaving: turbine + spillway + bottom outlet + leakage. |
| Runoff coefficient | Hệ số dòng chảy | Fraction of rainfall becoming direct runoff, `C` (0–1). |
| Baseflow | Dòng chảy cơ bản | Groundwater-fed component. |
| Hydrograph | Đường quá trình lũ | Flow (or stage) vs time. |
| Rating curve | Đường quan hệ Q–H | Stage→discharge relation at a gauge. Shifts after morphology change. |
| Flood routing | Diễn toán lũ | Propagating a flood wave downstream. |
| Attenuation | Chiết giảm đỉnh lũ | Peak reduction as the wave travels/stores. |
| Lag / travel time | Thời gian truyền lũ | Crest-to-crest delay between two points. |
| Backwater | Nước vật / nước dềnh | Downstream control raising upstream levels (tide, confluence, bridge). |
| Concentration time | Thời gian tập trung nước | Time for runoff from the hydraulically remotest point to reach outlet, `t_c`. |
| Antecedent moisture | Độ ẩm đất trước lũ | Wetness before the event; dominates runoff response. |
| Return period | Tần suất / chu kỳ lặp lại | 1-in-N-year event. `P = 1%` ⇒ 100-year. Vietnamese standard uses **frequency %** more often than years. |
| Flood peak | Đỉnh lũ | Maximum stage or discharge. |
| Recession | Rút lũ / chân lũ | Falling limb. |

---

## 3. Reservoir & dam

| EN | VI | Definition |
|---|---|---|
| Full supply level / NWL | Mực nước dâng bình thường (MNDBT) | Normal maximum operating level, `Z_FSL`. |
| Flood control level (pre-flood) | Mực nước đón lũ / mực nước cao nhất trước lũ | Ceiling imposed during flood season, `Z_ceil` — **lower** than FSL. |
| Dead storage level | Mực nước chết (MNC) | Minimum operable level, `Z_dead`. |
| Design flood level | Mực nước lũ thiết kế | Level under design flood. |
| Check / maximum flood level | Mực nước lũ kiểm tra | Level under the extreme check flood. |
| Active / useful storage | Dung tích hữu ích | Between dead and FSL. |
| Flood storage | Dung tích phòng lũ | Volume reserved to absorb a flood. |
| Free storage / available buffer | Dung tích còn trống | `V(Z_ceil) − V(Z_now)` — the number an operator lives by. |
| Rule curve | Biểu đồ điều phối / đường vận hành | Seasonal level envelope the reservoir must stay within. |
| Inter-reservoir operating procedure | Quy trình vận hành liên hồ chứa | The legally binding cascade rulebook. See [regulatory](08-regulatory-vietnam.md). |
| Pre-release / drawdown | Xả trước / hạ mực nước đón lũ | Releasing ahead of a forecast flood to create buffer. |
| Spillway | Đập tràn / cửa xả | Controlled (gated) or uncontrolled (free overflow). |
| Radial / Tainter gate | Cửa van cung | Common spillway gate type. |
| Bottom outlet | Cống xả đáy | Low-level outlet, also for sediment flushing. |
| Gate opening | Độ mở cửa van | In metres of opening, per gate. |
| Ramp rate | Tốc độ tăng/giảm xả | Rate of change of outflow, `m³/s per hour` — safety-critical. |
| Spilling | Xả lũ | Passing flow over/through the spillway. |
| Emergency release | Xả lũ khẩn cấp | Release driven by dam safety, not downstream optimisation. |
| Freeboard | Chiều cao an toàn / độ vượt cao | Vertical margin between water surface and dam crest. |
| Cascade | Bậc thang hồ chứa | Reservoirs in hydraulic series. |
| Diversion | Chuyển nước | Inter-basin transfer (e.g. Đắk Mi 4 → Thu Bồn). |
| PMF | Lũ cực hạn (PMF) | Probable Maximum Flood. |
| EAP | Phương án ứng phó tình huống khẩn cấp | Emergency Action Plan. |

---

## 4. Warning, emergency & exposure

| EN | VI | Definition |
|---|---|---|
| Alert level 1 / 2 / 3 | Báo động 1 / 2 / 3 (BĐ1/BĐ2/BĐ3) | Statutory river stage thresholds per station. BĐ3 = serious flooding. |
| Above BĐ3 by X m | Trên BĐ3 X m | The standard Vietnamese phrasing in bulletins — the UI must use it. |
| Disaster risk level | Cấp độ rủi ro thiên tai | Levels 1–5, drives which authority leads. |
| Warning | Cảnh báo | Statement of a possible hazard. |
| Forecast bulletin | Bản tin dự báo | Official product of the meteo-hydrological service. |
| Evacuation | Sơ tán | Vertical (upper floors) or horizontal (to a shelter). |
| Shelter | Điểm sơ tán / nơi trú ẩn | Designated safe site with capacity. |
| Lead time | Thời gian dự kiến / thời gian cảnh báo trước | Time between warning issue and hazard arrival. |
| Exposure | Đối tượng phơi nhiễm | People/assets in the hazard footprint. |
| Vulnerability | Tính dễ bị tổn thương | Propensity to be damaged given exposure. |
| Depth-damage function | Hàm thiệt hại theo độ sâu | Damage ratio vs water depth. |
| Critical infrastructure | Hạ tầng thiết yếu | Hospitals, water, power, telecoms, EOC. |
| EOC | Trung tâm điều hành / Ban chỉ huy PCTT | Emergency operations centre. |
| Command committee | Ban Chỉ huy Phòng chống thiên tai và Tìm kiếm cứu nạn (PCTT&TKCN) | Statutory disaster command body at each administrative level. |

---

## 5. Forecasting & data

| EN | VI | Definition |
|---|---|---|
| QPF | Dự báo mưa định lượng | Quantitative Precipitation Forecast. |
| NWP | Mô hình số trị | Numerical weather prediction. |
| Ensemble | Tổ hợp dự báo | Many perturbed forecasts, giving a distribution. |
| Deterministic run | Bản dự báo tất định | Single "best guess" trajectory. |
| Quantile / percentile | Phân vị | q05 … q95 of the ensemble. |
| Nowcast | Dự báo cực ngắn | 0–6 h, radar/satellite extrapolation. |
| Reanalysis | Tái phân tích | Retrospective best estimate of past state. |
| Data assimilation | Đồng hóa dữ liệu | Blending observations into a model state. |
| Bias correction | Hiệu chỉnh sai số hệ thống | Removing systematic error. |
| CRPS | — | Continuous Ranked Probability Score; ensemble skill metric (lower is better). |
| Reliability diagram | Biểu đồ tin cậy | Are 70 % forecasts right 70 % of the time? |
| Telemetry | Truyền số liệu tự động | Automatic sensor data transmission. |
| SCADA | Hệ thống SCADA | Supervisory Control and Data Acquisition — plant control system. |
| Digital twin | Bản sao số | A live, state-synchronised model of a physical system. |

---

## 6. Symbols used in formulas

| Symbol | Meaning | Unit |
|---|---|---|
| `Q_in`, `I` | Reservoir inflow | m³/s |
| `Q_out`, `O` | Reservoir outflow | m³/s |
| `Q_t`, `Q_s` | Turbine, spillway discharge | m³/s |
| `S`, `V` | Storage / volume | Mm³ |
| `Z` | Reservoir water level | m a.s.l. |
| `H` | River stage at a gauge | m above station zero |
| `h` | Local flood depth above ground | m |
| `A` | Catchment area (or wetted area, stated) | km² (m²) |
| `C` | Runoff coefficient | – |
| `P` | Precipitation depth | mm |
| `t_c` | Time of concentration | h |
| `τ` | Travel time between two points | h |
| `K`, `X` | Muskingum routing parameters | h, – |
| `n` | Manning roughness | s·m^(−1/3) |
| `c` | Kinematic wave celerity | m/s |
| `Cd` | Discharge coefficient (spillway) | – |
| `B` | Gate/weir width | m |
| `a` | Gate opening | m |
| `σ` | Ensemble spread (std dev) | same as variable |
| `Δt` | Model timestep | h or s |

---

## 7. Terms the product must never use loosely

| Word | Why it is dangerous | Use instead |
|---|---|---|
| "Prediction" | Implies certainty | "Forecast (q50, 90 % band …)" |
| "Will flood" | Deterministic claim about the future | "Probability of exceeding BĐ3 = 72 %" |
| "Safe" | Absolute, legally loaded | "Below BĐ1 in 95 % of members" |
| "Recommended release" without a constraint list | Implies authority | "Candidate release, satisfying constraints C1–C7, pending operator approval" |
| "Real-time" | Implies zero latency | State the actual data age: "gauge age 12 min" |
| "AI decided" | Nobody can defend it in an inquiry | "Optimiser proposed; operator approved at 14:32 by Nguyễn V.A." |

See also [UX principles §3 — language of uncertainty](../05-product/04-ux-principles.md).
