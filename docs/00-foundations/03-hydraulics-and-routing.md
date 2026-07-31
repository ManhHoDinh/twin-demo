# Hydraulics and flood routing

How a flood wave moves, deforms, and floods land. This is the layer between a reservoir release decision and a village's front door.

---

## 1. Open-channel flow essentials

**Manning's equation** (uniform flow):
```
V = (1/n) · R^(2/3) · S^(1/2)          Q = A · V
R = A / P   (hydraulic radius)
```
| Channel | `n` |
|---|---|
| Clean straight earth channel | 0.022 – 0.030 |
| Natural river, some weeds/stones | 0.030 – 0.045 |
| Mountain stream, boulders | 0.040 – 0.070 |
| Floodplain, pasture | 0.030 – 0.050 |
| Floodplain, dense brush / trees | 0.070 – 0.160 |
| Urban streets / built floodplain | 0.015 – 0.050 (highly variable) |

**Product implication:** floodplain roughness is 2–5× channel roughness. Once a river goes overbank, the *effective* conveyance and the wave speed change abruptly. Any model that treats depth linearly beyond bankfull is wrong in the regime that matters most.

**Flow regime — Froude number:**
```
Fr = V / √(g·D)     D = A/T (hydraulic depth)
Fr < 1 subcritical (downstream controls) · Fr > 1 supercritical
```
Lowland Vietnamese rivers are subcritical ⇒ **downstream conditions (tide, backwater) propagate upstream**. This is why a moderate discharge at high tide can outrank a larger discharge at low tide.

---

## 2. Flood wave celerity and travel time

The flood **crest** travels faster than the water:
```
c ≈ (dQ/dA) ≈ (5/3)·V     for a wide rectangular channel (kinematic wave)
τ = L / c
```
Practical consequence: for `V ≈ 1.5–2.5 m/s`, `c ≈ 2.5–4 m/s ≈ 9–15 km/h`.

**Travel time is not a constant.** It shortens as the flood grows (deeper, faster) and lengthens when the floodplain engages (storage). A product that hard-codes a single travel time will be late exactly during the biggest event.

**Requirement:** travel time must be presented as a **range conditioned on magnitude**, e.g. *"Ái Nghĩa → Cẩm Lệ: 4–6 h at moderate flow, 3–4 h at extreme flow"*, with the basis stated.

> The reference demo carries per-gauge `lagH` constants (2.5–4.0 h) in `js/data.js`. Making these magnitude-dependent is a tracked gap.

---

## 3. Routing methods, and which to use

| Method | Physics | Cost | Use it for |
|---|---|---|---|
| **Lag & route** | Pure translation + linear store | trivial | First-cut, backup mode, training |
| **Muskingum / Muskingum–Cunge** | Storage-discharge with wedge | very low | Operational channel routing, the workhorse |
| **Diffusive wave (1D)** | Momentum minus inertia | low | Backwater-affected reaches |
| **Full Saint-Venant 1D** | Complete | moderate | Regulated rivers, tidal reaches, structures |
| **2D shallow water** | Depth-averaged | high | Floodplain extent and depth mapping |
| **Coupled 1D/2D** | Channel + floodplain | high | Best practice for urban delta flood mapping |

### Muskingum
```
S = K [ X·I + (1−X)·O ]
O₂ = C₀ I₂ + C₁ I₁ + C₂ O₁

C₀ = (−KX + 0.5Δt) / (K − KX + 0.5Δt)
C₁ = ( KX + 0.5Δt) / (K − KX + 0.5Δt)
C₂ = (K − KX − 0.5Δt) / (K − KX + 0.5Δt)      C₀+C₁+C₂ = 1
```
- `K` ≈ reach travel time (h); `X` ∈ [0, 0.5], typically **0.2–0.3** for natural rivers, `X → 0` for reservoir-like storage.
- Stability: choose `Δt` such that `2KX ≤ Δt ≤ K`. Violating this produces negative outflows — a classic silent bug.

### Saint-Venant (1D)
```
Continuity:  ∂A/∂t + ∂Q/∂x = q_lat
Momentum:    ∂Q/∂t + ∂(Q²/A)/∂x + gA(∂h/∂x) + gA(S_f − S_0) = 0
```
Needed when: gates/weirs, tidal boundary, confluences, levee overtopping, or any backwater.

### 2D shallow water (what the demo's flood field uses)
```
∂h/∂t + ∇·(h u) = S
∂(hu)/∂t + ∇·(hu⊗u) + g h ∇(h+z) = −g h S_f
```
The demo uses a **virtual-pipes / local-inertial** simplification on a 288² grid (about 333 m per cell), dynamic only on the floodplain (< 28 m elevation) and diagnostic on steep terrain. This is a legitimate, well-known engineering simplification (it is essentially the LISFLOOD-FP local inertial scheme family) — **as long as its validity limits are documented in the UI**, which is a product requirement, not an optional nicety.

**Stability:** explicit shallow-water schemes obey a CFL condition
```
Δt ≤ CFL · Δx / (|u| + √(g h))
```
Ignoring it is how you get 400 m phantom lakes — a failure the reference implementation has already experienced and guarded against (see `DATA_AND_METHODS.md` anti-regression rule 2).

---

## 4. Confluences, diversions and the counter-intuitive cases

**Confluence timing beats confluence magnitude.** Two tributaries each carrying a moderate peak can produce a record stage downstream if their crests coincide. Conversely, a *larger* upstream release timed into the trough between two tributary peaks can lower the downstream maximum.

> This is the core justification for coordinated cascade operation, and it is the single most persuasive demo in the product: **show the operator that shifting a release by 3 hours cuts the downstream peak more than halving the release volume.**

**Diversions.** The VGTB system contains a real inter-basin transfer: **Đắk Mi 4** diverts water from the Vu Gia headwaters into the Thu Bồn for power generation. Operationally this:
- reduces dry-season flow to the Vu Gia / Đà Nẵng water supply (a chronic conflict), and
- during floods, moves flood volume between two downstream populations.

Any product for this basin **must model the diversion explicitly** and must show its consequences on *both* rivers. Presenting only the Vu Gia side is technically incomplete and politically indefensible.

**Bifurcation.** The Quảng Huế branch splits Vu Gia flow toward the Thu Bồn; the split ratio is stage-dependent and has shifted historically with channel morphology. This is a known source of forecast error at Ái Nghĩa and must be a documented uncertainty, not an unspoken constant.

---

## 5. Downstream boundary: tide, surge and compound flooding

The mouth boundary is not a fixed water level.

```
H_mouth(t) = MSL + Tide(t) + Surge(t) + WaveSetup(t) + SeaLevelTrend
```

| Component | Typical magnitude, central VN coast | Predictability |
|---|---|---|
| Astronomic tide | 0.6 – 1.2 m range (mixed, relatively small) | Deterministic, years ahead |
| Storm surge | 0.3 – 1.5 m (typhoon-dependent) | Hours–days, moderate skill |
| Wave setup | 0.1 – 0.5 m | Low |
| Backwater effect inland | Can extend 10–30 km upstream | Model-dependent |

**Compound flooding** — a river peak arriving during high tide plus surge — is the highest-consequence, most-underestimated scenario for Hội An and the lower Thu Bồn. A product that routes river flow to a *constant* sea level will systematically under-predict the worst case.

**Requirement FR-derived:** the mouth boundary must be an explicit, visible input with its own forecast and confidence, and the timeline must show *tide phase* alongside the flood crest so an operator can see a coincidence coming.

---

## 6. Floodplain inundation: from stage to depth to harm

Two families:

| Approach | How | Fidelity | Speed |
|---|---|---|---|
| **Static / "bathtub" from stage** | Project a water surface, subtract DEM | Poor on gradients; over-predicts | ms |
| **Level-pool with hydraulic connectivity** | Bathtub + connectivity check | Acceptable for screening | ms |
| **2D dynamic** | Solve shallow water | Good | s–min |
| **Pre-computed library** | Run 2D offline for many discharges, interpolate at runtime | Good + instant | ms at runtime |

> **This is the single most important architectural recommendation in the hydraulics chapter.** For an operational product you do **not** run a full 2D model inside the decision loop. You pre-compute an **inundation library** — a set of (discharge, tide, breach-state) → depth-grid mappings — and interpolate live. It is fast, deterministic, auditable, and reproducible for a post-event inquiry. Live dynamic simulation is reserved for the simulation/what-if screen, clearly labelled.

**Depth is what harms people, not stage.** The chain is:
```
Release → discharge → stage at gauge → water surface along reach → depth = surface − ground → harm
```
Each arrow adds error. Depth errors of ±0.3 m are excellent; ±0.5 m is normal; the product must never colour a map as if depth were known to 0.1 m. The demo enforces this with 5 discrete depth bands rather than a continuous ramp — **this is correct design and must be preserved.**

### Depth thresholds that actually matter
| Threshold | Meaning |
|---|---|
| 0.15 m | Road becomes hazardous; small cars lose traction |
| 0.30 m | **Road closure**; most vehicles stall/float |
| 0.50 m | Adults struggle in moving water; ground-floor property damage begins |
| 1.00 m | Ground floor uninhabitable; evacuation mandatory |
| 2.00 m | Structural risk to light construction; roof-level rescue |
| > 0.5 m **with** velocity > 1 m/s | Life-threatening regardless of depth alone |

**Velocity × depth product (`v·h`) is the correct hazard metric**, not depth alone:
```
HR = h · (v + 0.5) + DF        (UK FD2320 hazard rating form)
HR < 0.75 low · 0.75–1.25 moderate · 1.25–2.5 significant · > 2.5 extreme
```
A product that maps depth but ignores velocity will mark fast, shallow, lethal flow as "safe". **Tracked gap in the reference implementation.**

---

## 7. Structures and their failure

| Structure | Normal behaviour | Failure mode to model |
|---|---|---|
| Bridge | Conveys flow | Deck submergence → sudden backwater rise upstream; debris blockage |
| Culvert | Conveys | Blockage → local ponding, embankment overtopping |
| Levee / đê | Contains | Overtopping, piping, breach — after breach the downstream hydrograph changes character entirely |
| Road embankment | Not designed as a dam, acts as one | Impounds water, then fails abruptly |
| Urban drainage | Removes local rain | Capacity exceeded → pluvial flooding *independent of the river* |

**Pluvial vs fluvial must be separated in the UI.** A city can flood from its own drainage failing while the river is below BĐ1. Blaming reservoir releases for a pluvial event is a recurring and corrosive political failure mode — see [failure library](10-failure-library.md). A product that can distinguish and *show* the two is worth its price in that argument alone.

---

## 8. Reference implementation status

| Element | Status in `js/world.js` / `js/hydro.js` | Gap |
|---|---|---|
| 2D shallow-water flood field (virtual pipes) | ✅ floodplain-only, gauge-assimilated | Not calibrated; no velocity output |
| Gauge lag constants | ✅ per gauge | Constant, not magnitude-dependent |
| Depth bands (5 discrete) | ✅ | Correct — keep |
| Road closure at 0.30 m / hazard at 0.15 m | ✅ `core.roadClass` | Matches §6 thresholds |
| Tide / surge boundary | ⚠ scenario `surgeGain` scalar only | **No explicit tide phase, no compound-flood view** |
| Velocity-depth hazard `HR` | ❌ | Missing |
| Diversion (Đắk Mi 4 → Thu Bồn) | ✅ drawn in `DIVERSION` | Not hydrologically active in the routing |
| Bifurcation (Quảng Huế) | ✅ as a river geometry | Split ratio not modelled |
| Inundation library architecture | ❌ | Recommended target architecture |

---

**Next:** [Reservoir operations →](04-reservoir-operations.md)
