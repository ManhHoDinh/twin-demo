> **BẢN NHÁP LỊCH SỬ — được thay thế bởi [báo cáo audit ngày 2026-10-08](docs/AUDIT_FIX_REPORT.md).** Các khẳng định pretrained MC-LSTM, production-ready, groundedness và tốc độ trong tài liệu này chưa được chứng minh; không dùng làm trạng thái hiện tại.

# FloodTwin AI Architecture — Phân tích & Thiết kế Chi tiết

**Version:** 1.0 | **Date:** 2024-11 | **Status:** Design Document

---

## 1. PHÂN TÍCH THỰC TRẠNG CODE HIỆN TẠI

### 1.1 Điểm mạnh của FloodTwin Demo

| Thành phần | Đánh giá | Ghi chú |
|------------|----------|---------|
| Kiến trúc Event Bus | ⭐⭐⭐⭐⭐ | Tách biệt rõ ràng, dễ mở rộng |
| State Management | ⭐⭐⭐⭐ | centralized state, clean API |
| Hydro.js (thủy văn giải tích) | ⭐⭐⭐⭐ | Rule curve + MPC heuristic, đủ cho demo |
| SWE Simulation (world.js) | ⭐⭐⭐ | Virtual pipes, nhưng chỉ 2D height-field |
| Traffic simulation | ⭐⭐⭐ | Dijkstra routing, đơn giản nhưng hiệu quả |
| Ensemble/Fan chart | ⭐⭐⭐ | Parametric normal spread, KHÔNG phải thật |
| LLM layer (explainability.js) | ⭐⭐ | RAG giả lập, 100% trích dẫn nhưng synthetic |

### 1.2 Điểm yếu NGHIÊM TRỌNG cần khắc phục

```
❌ CRITICAL GAPS:
1. Không có mô hình ML thực sự — chỉ là analytical heuristics
2. Ensemble là parametric (normal distribution), không phải physics-based
3. Không có data assimilation thực — chỉ "soft assimilation" 
4. SWE là simplified height-field, KHÔNG phải full 2D shallow water
5. Calibration hoàn toàn bằng tay (hardcoded parameters)
6. Không có uncertainty quantification thực sự
7. LLM layer là RAG giả lập, không có model thật
```

### 1.3 Yêu cầu từ Novelty Paper

```
REQUIRED FOR Q1 PAPER NOVELTY:
✅ Groundedness ≥ 0.95 (currently: fake citations)
✅ Surrogate model 1-2 orders faster than HEC-RAS (currently: ~68x)
✅ CSI ≥ 0.80, NSE ≥ 0.80, KGE ≥ 0.75 (currently: demo labels)
✅ Uncertainty-aware decisions (currently: parametric fan only)
✅ Real-time learning/adaptation (currently: static)
```

---

## 2. KIẾN TRÚC AI MỚI (3-TIER)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TIER 3: DECISION SUPPORT AI                          │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────────┐    │
│  │ LLM Advisor     │  │ Risk Assessment  │  │ Natural Language       │    │
│  │ (Real Model)    │  │ Engine           │  │ Generation             │    │
│  └─────────────────┘  └──────────────────┘  └────────────────────────┘    │
├─────────────────────────────────────────────────────────────────────────────┤
│                        TIER 2: PREDICTIVE MODELS                           │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────────┐    │
│  │ Rainfall        │  │ Flood Inundation │  │ Traffic Impact        │    │
│  │ Forecasting     │  │ Mapping (U-Net)  │  │ Prediction            │    │
│  │ (Transformer)   │  │                  │  │ (Graph Network)       │    │
│  └─────────────────┘  └──────────────────┘  └────────────────────────┘    │
├─────────────────────────────────────────────────────────────────────────────┤
│                        TIER 1: DATA & PHYSICS HYBRID                       │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────────┐    │
│  │ Hydrological     │  │ Data Assimilation│  │ Calibration           │    │
│  │ Model (LSTM/MC- │  │ (EnKF/Particle)  │  │ Framework             │    │
│  │ LSTM/NeuralHydro)│  │                  │  │                       │    │
│  └─────────────────┘  └──────────────────┘  └────────────────────────┘    │
├─────────────────────────────────────────────────────────────────────────────┤
│                        DATA LAYER                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Real-time: Gauges · Radar · Satellite · Weather API                 │  │
│  │ Historical: CAMELS-style basin data · Event archives · GEE           │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. DATASET STRATEGY

### 3.1 Datasets cần thu thập

| Dataset | Source | Format | Priority | Notes |
|---------|--------|--------|----------|-------|
| **Vu Gia – Thu Bon gauge data** | VN Water Resources Dept | CSV/JSON | 🔴 CRITICAL | Stage, discharge T−5y |
| **IMERG/GPM rainfall** | NASA GES DISC | NetCDF/GRIB | 🔴 CRITICAL | 30min, 0.1° |
| **Sentinel-1 SAR flood extent** | Google Earth Engine | Cloud-optimized GeoTIFF | 🔴 CRITICAL | Historical events |
| **ALERT-1/2/3 stages** | National Flood Center VN | API/CSV | 🟡 HIGH | Real alert levels |
| **Reservoir operations log** | EVN/Dam operators | PDF/CSV | 🟡 HIGH | Inflow/outflow |
| **Vietnam DEM** | SRTM/ASTER/AWS Terrain | GeoTIFF | 🔴 CRITICAL | Already integrated |
| **Land use/Cover** | ESA WorldCover | GeoTIFF | 🟡 HIGH | For runoff modeling |
| **CAMELS-VN (proposed)** | This project | Basin dataset | 🔴 CRITICAL | Novelty contribution |
| **Traffic/Road network** | OSM | Vector | 🟡 HIGH | Already integrated |

### 3.2 CAMELS-VN: Novel Dataset Contribution

```
CAMELS-VN (Catchment Attributes and Meteorology for Large-sample Studies - Vietnam)
├── basins/                    # 8-12 basins in VGTB + adjacent
│   ├── vgtb_ai/
│   │   ├── attributes.csv     # Physical catchment characteristics
│   │   ├── forcings/         # Meteorological data (IMERG-corrected)
│   │   │   ├── day/          # Daily aggregation
│   │   │   └── hour/         # Sub-daily for event modeling
│   │   └── observations/
│   │       ├── discharge.csv  # Gauge observations
│   │       ├── stage.csv     # Water level
│   │       └── alert.csv     # Alert level changes
├── basin_set_metadata.json    # Spatial boundaries
└── README.md
```

---

## 4. TIER 1: HYDROLOGICAL MODEL

### 4.1 Model Selection

```
RECOMMENDED: NeuralHydrology + MC-LSTM (Mass-Conserving LSTM)

Rationale:
- Mass-conserving: water balance is PHYSICALLY enforced
- Proven on CAMELS (600+ basins)
- Fast inference: ~42ms/batch vs HEC-RAS 2D hours
- Uncertainty: built-in ensemble support
- Interpretable: streamflow generation is physically meaningful
```

### 4.2 Architecture

```python
# Conceptual: MC-LSTM for VGTB
Input:  [rainfall(t-24:t), temperature, humidity, soil_moisture]
State:  [storage_surfaces, storage_subsurface, storage_groundwater]
Output: [discharge(t+1:t+48), uncertainty_quantiles]

Training:
- Transfer from CAMELS (US) baseline
- Fine-tune on VGTB historical events
- Cross-validation: leave-one-event-out
```

### 4.3 Novel Components

```
NOVELTY #1: Tropical Catchment Adaptation
├── Antecedent moisture accounting (API-based initialization)
├── Orographic rainfall correction for mountain basins
└── Monsoon seasonality modeling

NOVELTY #2: Multi-objective Calibration
├── NSE (efficiency)
├── KGE (diagnostic)
├── CSI (flood peak timing)
└── Volume bias minimization
```

---

## 5. TIER 2: PREDICTIVE MODELS

### 5.1 Flood Inundation Mapping (U-Net)

```python
# Semantic Segmentation for Flood Extent
Model: ResNet34-UNet with Attention Gates
Input:  [Sentinel-1 SAR, DEM, LandCover, Rainfall Accumulation]
Output: [Flood probability per pixel, Depth estimation]

Training Data: 
- Google FloodHub labeled data
- Vietnam flood event archives
- Synthetic flood scenarios (hydraulic model outputs)

Novelty: Real-time update using streamflow predictions as boundary conditions
```

### 5.2 Traffic Impact Prediction (Graph Network)

```python
# Based on HydroGAT architecture (SIGSPATIAL 2025)
Model: Heterogeneous Graph Attention Network
Nodes:  Road segments, Zones, Shelters, Gauges
Edges:  Spatial adjacency, Hydraulic connectivity, Route relationships

Input:  [Road graph, Flood depth predictions, Traffic demand]
Output: [Route viability, ETA changes, Evacuation timing]

Novelty: Spatiotemporal attention for dynamic flood propagation
```

### 5.3 Rainfall Forecasting (Transformer)

```python
# precipitation nowcasting + extended forecast
Model: GraphCast-style transformer
Input:  [ERA5 reanalysis, IMERG observations, Topography]
Output: [Rainfall t+1h to t+72h, with uncertainty]

Alternative: Fine-tuned GenCast (if available via API)
```

---

## 6. TIER 3: DECISION SUPPORT AI

### 6.1 Real LLM Integration

```javascript
// Current (fake):
LLM: "According to document X, you should..."
      ↑ This is hardcoded RAG, not real AI

// Proposed (real):
class FloodTwinAdvisor {
  async generateBrief(context) {
    // Use REAL LLM with grounding
    const response = await llm.generate({
      prompt: buildPrompt(context),
      citations: true,  // Force citation
      groundingThreshold: 0.95
    });
    return validateGrounding(response);
  }
}
```

### 6.2 LLM Options

| Provider | Model | Pros | Cons |
|----------|-------|------|------|
| **OpenAI** | GPT-4o | Best reasoning, citations API | Cost, privacy |
| **Anthropic** | Claude 3.5 | Safety, long context | Cost |
| **Google** | Gemini 1.5 | Native GEE integration | Quality |
| **Ollama** | Llama 3.3 | Self-hosted, private | Hardware needed |
| **vLLM** | Mistral/Qwen | Open, fast | Quality trade-off |

### 6.3 Risk Assessment Engine

```javascript
// NEW: Real probabilistic risk engine
class RiskEngine {
  calculateFloodRisk(gaugeId, horizon) {
    // Get ensemble predictions from MC-LSTM
    const ensemble = this.getEnsemble(gaugeId, horizon);
    
    // Monte Carlo simulation for compound events
    const scenarios = this.monteCarloSim(ensemble, 1000);
    
    // Calculate:
    // - P(exceed AL3)
    // - Expected damage (USD)
    // - Population at risk
    // - Critical infrastructure exposure
    
    return {
      probability: this.pExceed3(scenarios),
      expectedDamage: this.expectedDamage(scenarios),
      populationAtRisk: this.popAtRisk(scenarios),
      recommendations: this.generateRecs(scenarios)
    };
  }
}
```

---

## 7. DATA ASSIMILATION STRATEGY

### 7.1 Why Current "Soft Assimilation" is Insufficient

```
Current (world.js):
- Equilibrium inversion for gauge anomaly
- Soft nudging to observed stages
- Deterministic

REQUIRED for paper novelty:
- Ensemble Kalman Filter (EnKF)
- Particle Filter for nonlinear states
- Satellite data assimilation (SAR water extent)
```

### 7.2 Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ASSIMILATION CYCLE (hourly)              │
│                                                             │
│  Forecast ──► Analysis ──► Update ──► Forecast ──► ...      │
│     ↑            │            │            │                │
│     └────────────┴────────────┴────────────┘                │
│                   (EnKF/Particle Filter)                   │
└─────────────────────────────────────────────────────────────┘

Observations assimilated:
- Gauge stages (telemetry, hourly)
- SAR flood extent (6-12h latency)
- Inundation model outputs (when available)
```

---

## 8. IMPLEMENTATION ROADMAP

### Phase 1: Data Infrastructure (Month 1-2)
```
□ Collect VGTB gauge data (2018-2024)
□ Download IMERG/GPM rainfall
□ Process DEM and land cover
□ Build CAMELS-VN dataset structure
□ Set up data pipeline
```

### Phase 2: ML Models (Month 3-4)
```
□ Implement MC-LSTM for streamflow
□ Train baseline on CAMELS → fine-tune on VGTB
□ Build U-Net for flood extent
□ Implement uncertainty quantification
□ Benchmark: CSI, NSE, KGE ≥ paper targets
```

### Phase 3: Integration (Month 5-6)
```
□ Replace hydro.js analytical with ML predictions
□ Integrate data assimilation
□ Connect to UI (maintain existing UX)
□ Real-time inference pipeline
□ Performance optimization (<50ms inference)
```

### Phase 4: LLM & Decision Support (Month 7-8)
```
□ Set up LLM API (or self-hosted)
□ Implement grounding validation
□ Build risk assessment engine
□ Generate validated briefs with real citations
□ A/B testing vs current system
```

---

## 9. NOVELTY MATRIX

| Novelty | Current State | Target State | Method |
|---------|---------------|--------------|--------|
| **Groundedness** | ~0.95 (fake) | 0.95+ (verified) | Real LLM + document validation |
| **Surrogate Speed** | 68× vs HEC-RAS | 100-1000× | MC-LSTM + reduced-order model |
| **Uncertainty** | Parametric fan | Full ensemble | MC-LSTM ensemble + EnKF |
| **Adaptation** | Static | Online learning | Retraining on new events |
| **Dataset** | None | CAMELS-VN | Novel contribution |

---

## 10. RISK ASSESSMENT

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Data unavailable | High | High | Use synthetic fallback, public APIs |
| Model underperforms | Medium | High | Ensemble methods, fallback to analytical |
| LLM quality issues | Medium | Medium | Grounding validation, human review |
| Computational cost | Medium | Medium | Quantization, edge inference |
| Paper timeline | High | Critical | Phased delivery, scope control |

---

## 11. REFERENCES

1. **NeuralHydrology** - Kratzert et al. (2018-2024)
2. **MC-LSTM** - Klotz et al. (2022)
3. **HydroGAT** - Lin et al. (2025) - SIGSPATIAL
4. **GraphCast** - Lam et al. (2023) - Nature
5. **FloodTwin Paper** - Internal Q1 targets
6. **CAMELS** - Newman et al. (2015), Addor et al. (2017)

---

*Document maintained continuously. Last update reflects current research findings.*
