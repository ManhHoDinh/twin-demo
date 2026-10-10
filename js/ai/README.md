# Local AI modules

These modules are experimental and use synthetic data by default. They are not operational flood forecasts. OpenAI is disabled by default and was not called during this implementation.

| Module | Actual behavior |
|---|---|
| ml-hydrology | Seeded, conservative three-tank parameter ensemble; historical MCLSTMModel/MCLSTMCell names retained for compatibility |
| training | One-layer LSTM baseline; exact BPTT, Adam, log1p discharge target, deterministic inference, schema-2 artifacts |
| data-pipeline | Synthetic daily CAMELS-style fixture with explicit provenance; timestamp-keyed alignment and cache revival |
| data-assimilation | Serial deterministic square-root EnKF with per-gauge sparse observations and unit-aware forecast |
| llm-integration | Local template by default; no verified external grounding or legal provenance |
| risk-engine | Hydro-based Gaussian parameter ensemble, common draws for policy comparison; uncalibrated impact assumptions |
| validation | Physical discharge metrics, dated subsets, measured inference latency; no invented hydraulic benchmark |
| ai-manager | Feature configuration, independent tank state per gauge, isolated metric evaluation, brief generator wiring |
| bootstrap | Optional dynamic loader; main operational app retains its analytical engine |

Training and serving documentation: [LOCAL_AI_WORKFLOW](../../docs/LOCAL_AI_WORKFLOW.md). Issue mapping and limitations: [AUDIT_FIX_REPORT](../../docs/AUDIT_FIX_REPORT.md).

The LSTM baseline is not the published mass-conserving recurrent architecture. The conservative tank model is not a pretrained neural model. Parameter spread is not a calibrated confidence interval.
