/* FloodTwin AI — Integration Module
   Connects all AI components with the existing FloodTwin system.

   This module:
   - Initializes AI subsystem
   - Manages data flow between components
   - Provides fallback to analytical methods
   - Enables/disables AI features via feature flags
*/

(function() {
  "use strict";

  const AI = window.FT.AI || {};
  window.FT.AI = AI;

  // ============================================================================
  // FEATURE FLAGS
  // ============================================================================

  const FEATURES = {
    // Core AI features
    USE_ML_HYDROLOGY: false,       // Use ML model instead of analytical
    USE_DATA_ASSIMILATION: false,   // Use EnKF/Particle filter
    USE_LLM: false,                 // Use real LLM (requires API key)
    USE_RISK_ENGINE: false,         // Use Monte Carlo risk engine

    // UI features
    SHOW_AI_CONFIDENCE: true,      // Show AI confidence intervals
    SHOW_ML_PREDICTIONS: false,     // Overlay ML predictions on UI
    ENABLE_CHAT: false,             // Enable Q&A chat interface

    // Performance
    ML_INFERENCE_DEVICE: 'cpu',     // 'cpu', 'webgl', 'wasm'
    ASYNC_INFERENCE: true,          // Run ML in web worker if available

    // Fallback
    AUTO_FALLBACK: true             // Automatically fall back to analytical on error
  };

  // ============================================================================
  // AI MANAGER
  // ============================================================================

  const AIState = {
    initialized: false,
    models: {},
    status: {
      mlHydrology: 'not_loaded',
      dataAssimilation: 'not_loaded',
      llm: 'not_loaded',
      riskEngine: 'not_loaded'
    },
    errors: []
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async function initialize(config = {}) {
    console.log('[FloodTwin AI] Initializing AI subsystem...');
    if (window.FT.hydro && !window.FT.hydro.ready && window.FT.data) window.FT.hydro.rebuild();

    // Apply config overrides
    Object.assign(FEATURES, config.features || {});
    AIState.models = {};
    AIState.errors = [];
    AIState.gaugeModels = new Map();

    const results = {
      mlHydrology: null,
      dataAssimilation: null,
      llm: null,
      riskEngine: null
    };

    // Initialize ML Hydrology
    if (FEATURES.USE_ML_HYDROLOGY && AI.MCLSTMModel) {
      try {
        console.log('[FloodTwin AI] Loading ML Hydrology model...');
        const model = new AI.MCLSTMModel();
        const loaded = await model.load();
        AIState.models.mlHydrology = model;
        AIState.status.mlHydrology = loaded ? 'ready' : 'loaded_fallback';
        results.mlHydrology = { status: AIState.status.mlHydrology };
        console.log('[FloodTwin AI] ML Hydrology:', AIState.status.mlHydrology);
      } catch (e) {
        console.error('[FloodTwin AI] ML Hydrology failed:', e);
        AIState.status.mlHydrology = 'error';
        AIState.errors.push({ component: 'mlHydrology', error: e.message });
      }
    } else {
      AIState.status.mlHydrology = 'disabled';
    }

    // Initialize Data Assimilation
    if (FEATURES.USE_DATA_ASSIMILATION && AI.DataAssimilationManager) {
      try {
        console.log('[FloodTwin AI] Initializing Data Assimilation...');
        const dam = new AI.DataAssimilationManager({
          useEnKF: true,
          usePF: false
        });
        AIState.models.dataAssimilation = dam;
        AIState.status.dataAssimilation = 'ready';
        results.dataAssimilation = { status: 'ready' };
        console.log('[FloodTwin AI] Data Assimilation: ready');
      } catch (e) {
        console.error('[FloodTwin AI] Data Assimilation failed:', e);
        AIState.status.dataAssimilation = 'error';
        AIState.errors.push({ component: 'dataAssimilation', error: e.message });
      }
    } else {
      AIState.status.dataAssimilation = 'disabled';
    }

    // Initialize LLM
    if (FEATURES.USE_LLM && AI.LLMClient) {
      try {
        console.log('[FloodTwin AI] Initializing LLM client...');
        AIState.models.llm = AI.llm;
        AIState.models.briefGen = AI.briefGen || new AI.BriefGenerator(AI.llm);
        AIState.status.llm = AI.llm.config.provider === 'mock' ? 'local_template' : 'ready';
        results.llm = { status: 'ready' };
        console.log('[FloodTwin AI] LLM: ready');
      } catch (e) {
        console.error('[FloodTwin AI] LLM failed:', e);
        AIState.status.llm = 'error';
        AIState.errors.push({ component: 'llm', error: e.message });
      }
    } else {
      AIState.status.llm = 'disabled';
    }

    // Initialize Risk Engine
    if (FEATURES.USE_RISK_ENGINE && AI.RiskEngine) {
      try {
        console.log('[FloodTwin AI] Initializing Risk Engine...');
        const engine = new AI.RiskEngine();

        // Connect to ML model if available
        if (AIState.models.mlHydrology) {
          engine.setMLModel(AIState.models.mlHydrology);
        }

        // Connect to DA if available
        if (AIState.models.dataAssimilation) {
          engine.setAssimilationManager(AIState.models.dataAssimilation);
        }

        AIState.models.riskEngine = engine;
        AIState.status.riskEngine = 'ready';
        results.riskEngine = { status: 'ready' };
        console.log('[FloodTwin AI] Risk Engine: ready');
      } catch (e) {
        console.error('[FloodTwin AI] Risk Engine failed:', e);
        AIState.status.riskEngine = 'error';
        AIState.errors.push({ component: 'riskEngine', error: e.message });
      }
    } else {
      AIState.status.riskEngine = 'disabled';
    }

    AIState.initialized = true;
    console.log('[FloodTwin AI] Initialization complete:', AIState.status);

    return {
      success: AIState.errors.length === 0,
      features: FEATURES,
      status: AIState.status,
      errors: AIState.errors,
      results
    };
  }

  // ============================================================================
  // ML-BASED PREDICTIONS
  // ============================================================================

  async function predictStreamflow(gaugeId, rainfall, horizon = 48) {
    if (!FEATURES.USE_ML_HYDROLOGY || !AIState.models.mlHydrology) {
      console.warn('[FloodTwin AI] ML model not available, using fallback');
      return getAnalyticalFallback(gaugeId, rainfall, horizon);
    }

    try {
      const input = {
        rainfall: rainfall,
        temperature: 28,
        humidity: 0.8,
        soilMoisture: 0.6,
        evaporation: 0.1
      };

      if (!window.FT.data.GAUGES.some(g => g.id === gaugeId)) throw new Error('Unknown gauge');
      let model = AIState.gaugeModels.get(gaugeId);
      if (!model) {
        model = new AI.MCLSTMModel(); await model.load();
        AIState.gaugeModels.set(gaugeId, model);
      }
      const prediction = model.predict(input, horizon);

      // Convert to same format as hydro.js
      return {
        q05: Array.from(prediction.q05),
        q25: Array.from(prediction.q25),
        median: Array.from(prediction.median),
        q75: Array.from(prediction.q75),
        q95: Array.from(prediction.q95),
        mean: Array.from(prediction.mean),
        uncertainty: Array.from(prediction.std),
        source: 'synthetic-parameter-ensemble',
        units: 'm3/s', calibrated: false,
        model: 'conservative-tank-ensemble', gaugeId
      };
    } catch (e) {
      console.error('[FloodTwin AI] Prediction failed:', e);
      if (FEATURES.AUTO_FALLBACK) {
        return getAnalyticalFallback(gaugeId, rainfall, horizon);
      }
      throw e;
    }
  }

  function getAnalyticalFallback(gaugeId, rainfall, horizon) {
    // Return null to use existing hydro.js calculations
    return null;
  }

  // ============================================================================
  // DATA ASSIMILATION
  // ============================================================================

  function addObservation(gaugeId, stage, time) {
    if (!AIState.models.dataAssimilation) {
      return false;
    }

    try {
      AIState.models.dataAssimilation.addObservation(gaugeId, stage, time);
      return true;
    } catch (e) {
      console.error('[FloodTwin AI] Add observation failed:', e);
      return false;
    }
  }

  function getAssimilatedState() {
    if (!AIState.models.dataAssimilation) {
      return null;
    }

    try {
      return AIState.models.dataAssimilation.getStateEstimate();
    } catch (e) {
      console.error('[FloodTwin AI] Get assimilated state failed:', e);
      return null;
    }
  }

  function runAssimilationCycle(dt) {
    if (!AIState.models.dataAssimilation) {
      return null;
    }

    try {
      return AIState.models.dataAssimilation.runCycle(dt);
    } catch (e) {
      console.error('[FloodTwin AI] Assimilation cycle failed:', e);
      return null;
    }
  }

  // ============================================================================
  // LLM INTERFACE
  // ============================================================================

  async function generateBrief(context) {
    if (!AIState.models.llm) {
      return getFallbackBrief(context);
    }

    try {
      const result = await AIState.models.briefGen.generateBrief(context);
      return result;
    } catch (e) {
      console.error('[FloodTwin AI] Brief generation failed:', e);
      if (FEATURES.AUTO_FALLBACK) {
        return getFallbackBrief(context);
      }
      throw e;
    }
  }

  async function answerQuestion(question, context) {
    if (!AIState.models.llm) {
      return getFallbackAnswer(question);
    }

    try {
      const result = await AIState.models.briefGen.answerQuestion(question, context);
      return result;
    } catch (e) {
      console.error('[FloodTwin AI] Question answering failed:', e);
      if (FEATURES.AUTO_FALLBACK) {
        return getFallbackAnswer(question);
      }
      throw e;
    }
  }

  function getFallbackBrief(context) {
    // Generate a simple brief from existing hydro.js data
    const gaugeLevels = context?.gaugeLevels || {};
    const alertLevels = context?.alertLevels || {};

    let summary = '## Bản tin tình huống\n\n';

    for (const [gauge, level] of Object.entries(gaugeLevels)) {
      const alert = alertLevels[gauge] || 0;
      summary += `- ${gauge}: ${level.toFixed(1)}m`;
      if (alert > 0) summary += ` (BĐ${alert})`;
      summary += '\n';
    }

    return {
      text: summary,
      groundingScore: null,
      citations: [],
      isGrounded: false,
      source: 'analytical'
    };
  }

  function getFallbackAnswer(question) {
    return {
      text: 'Để có câu trả lời chi tiết, vui lòng kích hoạt module LLM trong cấu hình AI.',
      groundingScore: 0,
      citations: [],
      isGrounded: false,
      source: 'fallback'
    };
  }

  // ============================================================================
  // RISK ASSESSMENT
  // ============================================================================

  async function assessRisk(gaugeId, forecastHorizon = 48) {
    if (!AIState.models.riskEngine) {
      return getFallbackRisk(gaugeId);
    }

    try {
      return await AIState.models.riskEngine.getRiskDashboard(gaugeId, forecastHorizon);
    } catch (e) {
      console.error('[FloodTwin AI] Risk assessment failed:', e);
      if (FEATURES.AUTO_FALLBACK) {
        return getFallbackRisk(gaugeId);
      }
      throw e;
    }
  }

  async function comparePolicies(gaugeId) {
    if (!AIState.models.riskEngine) {
      return getFallbackPolicyComparison(gaugeId);
    }

    try {
      return await AIState.models.riskEngine.comparePolicies(gaugeId);
    } catch (e) {
      console.error('[FloodTwin AI] Policy comparison failed:', e);
      return getFallbackPolicyComparison(gaugeId);
    }
  }

  function getFallbackRisk(gaugeId) {
    // Extract from existing hydro.js ensemble
    const H = window.FT.hydro;
    if (!H || !H.ready) {
      return null;
    }

    const g = window.FT.data.GAUGES.find(g => g.id === gaugeId);
    if (!g) return null;

    const entry = H.gauge[gaugeId];
    if (!entry) return null;

    const key = H._activeKey();
    const med = entry[key].med;

    const peakStage = Math.max(...Array.from(med));
    const thresholds = g.bd;

    return {
      currentRisk: {
        level: 'unknown',
        score: null,
        description: 'Cần bật module AI để đánh giá rủi ro chi tiết'
      },
      peakStage: {
        expected: peakStage.toFixed(1),
        range: 'N/A',
        worst: peakStage.toFixed(1)
      },
      source: 'analytical'
    };
  }

  function getFallbackPolicyComparison(gaugeId) {
    // Use existing hydro.js comparison
    const H = window.FT.hydro;
    if (!H || !H.ready) {
      return null;
    }

    const rule = H.gauge[gaugeId]?.rule;
    const mpc = H.gauge[gaugeId]?.mpc;

    if (!rule || !mpc) return null;

    const rulePeak = Math.max(...Array.from(rule.med));
    const mpcPeak = Math.max(...Array.from(mpc.med));

    return {
      rulePeak,
      mpcPeak,
      reduction: rulePeak - mpcPeak,
      recommendation: rulePeak - mpcPeak > 0.5 ?
        'MPC giảm đỉnh đáng kể' :
        'Hai phương pháp tương đương',
      source: 'analytical'
    };
  }

  // ============================================================================
  // PERFORMANCE METRICS
  // ============================================================================

  async function calculateModelMetrics(gaugeId, dataset) {
    if (!AIState.models.mlHydrology) return null;
    if (!window.FT.data.GAUGES.some(g => g.id === gaugeId)) throw new Error('Unknown gauge');
    if (!dataset?.forcing || !dataset?.observations || !window.FT.AITraining)
      throw new Error('Supply an aligned hourly dataset, not an unverified date range');
    const step = dataset.metadata?.stepHours ?? (dataset.resolution === 'hourly' ? 1 : 24);
    if (step !== 1) throw new Error('Tank validation requires hourly forcing');
    const loader = new window.FT.AITraining.TrainingDataLoader(dataset, gaugeId);
    loader.prepare(1, 1); // Validate regular timestamps, forcing and observation alignment.
    const model = new AI.MCLSTMModel(); await model.load();
    const predictions = [], observations = [];
    // Isolated model: metric evaluation never advances the operational prediction state.
    const f = dataset.forcing, obs = dataset.observations.gauges[gaugeId].discharge;
    for (let i = 0; i < f.dates.length - 1; i++) {
      const predicted = model.predict({rainfall: f.precipitation[i], temperature: f.temperature[i],
        humidity: f.humidity[i], evaporation: .1}, 1).median[0];
      if (!Number.isFinite(obs[i + 1])) continue;
      predictions.push(predicted); observations.push(obs[i + 1]);
    }
    const metrics = model.calculateMetrics(predictions, observations);
    return {...metrics, samples: predictions.length, gaugeId, source: dataset.metadata?.source || 'unverified local dataset',
      synthetic: dataset.metadata?.synthetic !== false, calibrated: false,
      meetsTargets: [metrics.nse, metrics.kge, metrics.csi].every(Number.isFinite)
        && metrics.nse >= .80 && metrics.kge >= .75 && metrics.csi >= .80};
  }

  // ============================================================================
  // STATUS & DIAGNOSTICS
  // ============================================================================

  function getStatus() {
    return {
      initialized: AIState.initialized,
      status: AIState.status,
      features: FEATURES,
      errors: AIState.errors,
      models: {
        mlHydrology: AIState.models.mlHydrology ? 'loaded' : 'not_loaded',
        dataAssimilation: AIState.models.dataAssimilation ? 'loaded' : 'not_loaded',
        llm: AIState.models.llm ? 'loaded' : 'not_loaded',
        riskEngine: AIState.models.riskEngine ? 'loaded' : 'not_loaded'
      }
    };
  }

  function enableFeature(feature, enabled = true) {
    if (feature in FEATURES) {
      FEATURES[feature] = enabled;
      console.log(`[FloodTwin AI] Feature ${feature}: ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    }
    return false;
  }

  function setApiKey(provider, key) {
    if (provider === 'openai' && AI.llm) {
      AI.llm.setApiKey(key);
      AIState.status.llm = 'configured';
      return true;
    }
    return false;
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  AI.initialize = initialize;
  AI.getStatus = getStatus;
  AI.enableFeature = enableFeature;
  AI.setApiKey = setApiKey;
  AI.FEATURES = FEATURES;

  // ML Hydrology
  AI.predictStreamflow = predictStreamflow;
  AI.calculateModelMetrics = calculateModelMetrics;

  // Data Assimilation
  AI.addObservation = addObservation;
  AI.getAssimilatedState = getAssimilatedState;
  AI.runAssimilationCycle = runAssimilationCycle;

  // LLM
  AI.generateBrief = generateBrief;
  AI.answerQuestion = answerQuestion;

  // Risk
  AI.assessRisk = assessRisk;
  AI.comparePolicies = comparePolicies;

  console.log('[FloodTwin AI] Integration module loaded');
  console.log('[FloodTwin AI] Features:', FEATURES);

})();
