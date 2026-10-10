/* FloodTwin local conservative tank ensemble. Historical MC-LSTM class names are
   retained for callers. No pretrained neural weights are loaded by this module;
   spread represents seeded parameter sensitivity, not calibrated probabilities. */
(function() {
  "use strict";

  const AI = window.FT.AI || {};
  window.FT.AI = AI;

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    // Legacy compatibility fields; tank inference uses no neural layers.
    inputSize: 5,        // [rainfall, temperature, humidity, soil_moisture, evaporation]
    hiddenSize: 128,     // LSTM hidden units
    numLayers: 2,        // Stacked LSTMs
    forecastHorizon: 48, // hours ahead

    // Training
    sequenceLength: 168, // 1 week of hourly data
    batchSize: 32,
    learningRate: 0.001,

    // Uncertainty (ensemble)
    ensembleSize: 10,

    // Performance targets (from paper novelty)
    targetNSE: 0.80,
    targetKGE: 0.75,
    targetCSI: 0.80,

    // Inference
    inferenceDevice: 'cpu', // 'cpu', 'webgl', 'wasm'
    modelPath: null, // Trained LSTM artifacts are loaded by the separate training/serving pipeline.
  };

  // ============================================================================
  // DATA PIPELINE - CAMELS-VN FORMAT
  // ============================================================================

  const DataPipeline = {
    // Basin metadata
    basins: {
      'vgtb': {
        id: 'vgtb',
        name: 'Vu Gia - Thu Bon',
        area: 5100, // km²
        gauges: ['aiNghia', 'cauLau', 'giaoThuy', 'camLe'],
        reservoirs: ['avuong', 'songbung4', 'dakmi4', 'songtranh2'],
        forcingSources: ['IMERG', 'ERA5', 'RADAR'],
        observations: {
          discharge: true,
          stage: true,
          sediment: false,
          waterQuality: false
        }
      }
    },

    // Load forcing data (rainfall, meteorology)
    loadForcings(basinId, dateRange) {
      // In production: fetch from API/database
      // Format: CAMELS-style daily/hourly CSV
      return this.generateSyntheticForcings(dateRange);
    },

    // Load observations (discharge, stage)
    loadObservations(gaugeId, dateRange) {
      // In production: fetch from Vietnam hydrology database
      // Format: CAMELS-style observations CSV
      return this.generateSyntheticObservations(gaugeId, dateRange);
    },

    // Generate synthetic data for demo (replace with real data)
    generateSyntheticForcings(dateRange) {
      const { start, end } = dateRange;
      const hours = Math.ceil((end - start) / 3600000);
      const data = {
        time: [],
        rainfall: new Float32Array(hours),
        temperature: new Float32Array(hours),
        humidity: new Float32Array(hours),
        soilMoisture: new Float32Array(hours),
        evaporation: new Float32Array(hours),
        radarReflectivity: new Float32Array(hours)
      };

      let currentTime = start;
      let baseSoilMoisture = 0.4;

      for (let i = 0; i < hours; i++) {
        const dayOfYear = Math.floor((currentTime - Date.UTC(new Date(currentTime).getUTCFullYear(), 0, 1)) / 86400000) + 1;
        const seasonalFactor = Math.sin((dayOfYear - 80) * Math.PI / 182.5);

        // Base temperature (tropical)
        data.temperature[i] = 28 + 4 * seasonalFactor + (Math.random() - 0.5) * 3;

        // Base humidity
        data.humidity[i] = 0.75 + 0.15 * seasonalFactor + (Math.random() - 0.5) * 0.1;

        // Rainfall events (monsoon pattern)
        const monsoonProb = Math.max(0, 0.3 + 0.4 * seasonalFactor);
        if (Math.random() < monsoonProb) {
          // Rain event
          const intensity = 5 + 30 * Math.random() * Math.max(0, seasonalFactor + 0.5);
          data.rainfall[i] = intensity + (Math.random() - 0.5) * 10;

          // Soil moisture increases
          baseSoilMoisture = Math.min(0.9, baseSoilMoisture + 0.02 * intensity);
        }

        // Soil moisture with decay
        baseSoilMoisture = Math.max(0.2, baseSoilMoisture - 0.001);
        data.soilMoisture[i] = baseSoilMoisture + (Math.random() - 0.5) * 0.05;

        // Evaporation
        data.evaporation[i] = 0.1 + 0.15 * Math.max(0, data.temperature[i] - 25) + (Math.random() - 0.5) * 0.05;

        data.time[i] = currentTime;
        currentTime += 3600000; // 1 hour
      }

      return data;
    },

    // Generate synthetic observations
    generateSyntheticObservations(gaugeId, dateRange) {
      const { start, end } = dateRange;
      const hours = Math.ceil((end - start) / 3600000);

      // Get gauge-specific base flow from existing data
      const gaugeBases = {
        'aiNghia': 200,   // m³/s
        'cauLau': 150,
        'giaoThuy': 180,
        'camLe': 50
      };
      const baseFlow = gaugeBases[gaugeId] || 100;

      const data = {
        time: [],
        discharge: new Float32Array(hours),
        stage: new Float32Array(hours),
        alertLevel: new Uint8Array(hours),
        quality: new Uint8Array(hours) // 0=missing, 1=gap, 2=good
      };

      let currentTime = start;
      let prevFlow = baseFlow;
      let soilMoisture = 0.5;

      for (let i = 0; i < hours; i++) {
        const hour = new Date(currentTime).getHours();
        const dayOfYear = Math.floor((currentTime - Date.UTC(new Date(currentTime).getUTCFullYear(), 0, 1)) / 86400000) + 1;
        const seasonalFactor = Math.sin((dayOfYear - 80) * Math.PI / 182.5);

        // Daily variation
        const dailyFactor = 1 + 0.2 * Math.sin((hour - 6) * Math.PI / 12);

        // Base flow with seasonality
        let flow = baseFlow * dailyFactor * (0.8 + 0.2 * seasonalFactor);

        // Soil moisture effect (antecedent wetness)
        flow *= (0.6 + 0.8 * soilMoisture);

        // Add event-driven peaks
        const monsoonProb = Math.max(0, 0.1 + 0.3 * seasonalFactor);
        if (Math.random() < monsoonProb) {
          const peak = (500 + Math.random() * 1500) * Math.max(0, seasonalFactor + 0.3);
          flow += peak;

          // Update soil moisture
          soilMoisture = Math.min(0.95, soilMoisture + 0.05);
        }

        // Decay soil moisture
        soilMoisture = Math.max(0.2, soilMoisture - 0.002);

        // Add noise
        flow += (Math.random() - 0.5) * flow * 0.1;
        flow = Math.max(10, flow);

        // Update previous flow (AR-1 process for persistence)
        prevFlow = 0.7 * prevFlow + 0.3 * flow;

        data.time[i] = currentTime;
        data.discharge[i] = prevFlow;

        // Stage from discharge (rating curve approximation)
        data.stage[i] = this.dischargeToStage(gaugeId, prevFlow);

        // Alert level
        const stage = data.stage[i];
        const alertThresholds = { 'aiNghia': [6.5, 8.0, 9.0], 'cauLau': [2.0, 3.0, 4.0], 'giaoThuy': [6.2, 7.7, 8.8], 'camLe': [1.0, 1.7, 2.5] };
        const thresholds = alertThresholds[gaugeId] || [6, 8, 10];
        if (stage >= thresholds[2]) data.alertLevel[i] = 3;
        else if (stage >= thresholds[1]) data.alertLevel[i] = 2;
        else if (stage >= thresholds[0]) data.alertLevel[i] = 1;
        else data.alertLevel[i] = 0;

        // Quality (simulate some gaps)
        data.quality[i] = Math.random() > 0.02 ? 2 : (Math.random() > 0.5 ? 1 : 0);

        currentTime += 3600000;
      }

      return data;
    },

    // Rating curve approximation
    dischargeToStage(gaugeId, Q) {
      // Power law: stage = a * Q^b + offset
      const params = {
        'aiNghia': { a: 0.5, b: 0.3, offset: 2.5 },
        'cauLau': { a: 0.4, b: 0.35, offset: 0.3 },
        'giaoThuy': { a: 0.55, b: 0.28, offset: 1.8 },
        'camLe': { a: 0.3, b: 0.4, offset: 0.2 }
      };
      const p = params[gaugeId] || { a: 0.5, b: 0.3, offset: 1.0 };
      return p.offset + p.a * Math.pow(Q, p.b);
    },

    // Create training dataset
    createTrainingDataset(basinId, eventDates) {
      const dataset = [];

      for (const event of eventDates) {
        const forcing = this.loadForcings(basinId, event);
        for (const gaugeId of this.basins[basinId].gauges) {
          const obs = this.loadObservations(gaugeId, event);

          // Match timestamps
          for (let i = 0; i < forcing.time.length && i < obs.time.length; i++) {
            dataset.push({
              // Input features (5 dimensions)
              x: [
                forcing.rainfall[i] / 100,           // Normalized
                forcing.temperature[i] / 40,
                forcing.humidity[i],
                forcing.soilMoisture[i],
                forcing.evaporation[i] / 10
              ],
              // Output: discharge (normalized by catchment area)
              y: obs.discharge[i] / 10000,
              // Metadata
              gaugeId,
              timestamp: forcing.time[i],
              alertLevel: obs.alertLevel[i]
            });
          }
        }
      }

      return dataset;
    }
  };

  // ============================================================================
  // MC-LSTM MODEL IMPLEMENTATION
  // ============================================================================

  class MCLSTMModel {
    constructor(config = {}) {
      this.config = { ...CONFIG, ...config };
      this.isLoaded = false;
      this.ensemble = [];

      // State variables (water balance)
      this.surfaceStorage = 0;
      this.subsurfaceStorage = 0;
      this.groundwaterStorage = 0;
    }

    // Initialize model (load weights or create new)
    async load() {
      if (!Number.isInteger(this.config.ensembleSize) || this.config.ensembleSize < 2 || this.config.ensembleSize > 1000)
        throw new Error('Tank ensemble requires 2..1000 members');
      await this.initializeEnsemble();
      this.isLoaded = true;
      this.provenance = 'Seeded uncalibrated conservative-tank parameter ensemble; no neural weights';
      return true;
    }

    // Initialize ensemble members
    async initializeEnsemble() {
      this.ensemble = [];
      // Create multiple model instances for parameter sensitivity
      for (let i = 0; i < this.config.ensembleSize; i++) {
        this.ensemble.push(new MCLSTMCell({
          ...this.config,
          seed: 42 + i * 13 // Different initialization per member
        }));
      }
    }

    // Reset internal states
    resetStates() {
      this.surfaceStorage = 0;
      this.subsurfaceStorage = 0;
      this.groundwaterStorage = 0;
      this.lastInput = null;
      for (const model of this.ensemble) {
        model.reset();
      }
    }

    // Run prediction
    predict(input, horizon = 48) {
      if (!this.isLoaded) {
        throw new Error('Model not loaded');
      }

      if (!Number.isInteger(horizon) || horizon < 1 || horizon > 168) throw new Error('Invalid horizon');
      // Normalize input
      const x = this.normalizeInput(input);

      // Reset if new sequence
      if (input.reset || !this.lastInput) {
        this.resetStates();
      }

      // Run ensemble prediction
      const predictions = [];
      for (const model of this.ensemble) {
        // Commit one observed forcing step; all future steps branch from that state.
        model.forward(x, 1);
        const checkpoint = [model.surfaceStorage, model.subsurfaceStorage, model.groundwaterStorage];
        const pred = model.forward({ ...x, rainfall: x.rainfall * 0.8 }, horizon);
        [model.surfaceStorage, model.subsurfaceStorage, model.groundwaterStorage] = checkpoint;
        predictions.push(pred);
      }

      // Compute statistics
      this.lastInput = { ...input };
      return this.computeStatistics(predictions);
    }

    // Normalize input
    normalizeInput(input) {
      const value = { rainfall: input.rainfall ?? 0, temperature: input.temperature ?? 28,
        humidity: input.humidity ?? .75, soilMoisture: input.soilMoisture ?? .5, evaporation: input.evaporation ?? .1 };
      if (Object.values(value).some(v => !Number.isFinite(v)) || value.rainfall < 0 || value.evaporation < 0)
        throw new Error('Invalid physical forcing');
      return value;
    }

    // Compute ensemble statistics
    computeStatistics(predictions) {
      const n = predictions.length;
      const horizon = predictions[0].discharge.length;

      // Sort for quantile computation
      const sorted = [];
      for (let t = 0; t < horizon; t++) {
        const values = predictions.map(p => p.discharge[t]);
        values.sort((a, b) => a - b);
        sorted.push(values);
      }

      // Compute quantiles
      const result = {
        median: new Float32Array(horizon),
        q05: new Float32Array(horizon),
        q25: new Float32Array(horizon),
        q75: new Float32Array(horizon),
        q95: new Float32Array(horizon),
        mean: new Float32Array(horizon),
        std: new Float32Array(horizon)
      };

      for (let t = 0; t < horizon; t++) {
        const vals = sorted[t];
        const sum = vals.reduce((a, b) => a + b, 0);
        const mean = sum / n;
        const variance = vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;

        result.median[t] = vals[Math.floor(n / 2)];
        result.q05[t] = vals[Math.floor(n * 0.05)];
        result.q25[t] = vals[Math.floor(n * 0.25)];
        result.q75[t] = vals[Math.floor(n * 0.75)];
        result.q95[t] = vals[Math.floor(n * 0.95)];
        result.mean[t] = mean;
        result.std[t] = Math.sqrt(variance);
      }

      return result;
    }

    // Update model with new observation (online learning)
    async update(input, observed) {
      if (!Number.isFinite(observed) || observed < 0) throw new Error('Invalid observed discharge');
      const prediction = this.predict(input, 1);
      const ratio = Math.max(.5, Math.min(2, observed / Math.max(1e-6, prediction.median[0])));
      // Explicit state correction, not gradient learning; record the added/removed water.
      for (const cell of this.ensemble) {
        const prior = cell.surfaceStorage + cell.subsurfaceStorage + cell.groundwaterStorage;
        cell.surfaceStorage *= ratio; cell.subsurfaceStorage *= ratio; cell.groundwaterStorage *= ratio;
        cell.assimilationIncrementMm = prior * (ratio - 1);
      }
    }

    // Calculate performance metrics
    calculateMetrics(predicted, observed) {
      const n = predicted.length;
      if (window.FT.AIValidation) {
        const result = new window.FT.AIValidation.MetricsCalculator().calculateAll(predicted, observed);
        return {...result, r: result.correlation, ...result.kgeComponents};
      }
      if (!n || predicted.some(v => !Number.isFinite(v)) || observed.some(v => !Number.isFinite(v)))
        return {nse: null, kge: null, csi: null, r: null, alpha: null, beta: null};
      if (n !== observed.length) {
        throw new Error('Length mismatch');
      }

      // Basic statistics
      const obsMean = observed.reduce((a, b) => a + b, 0) / n;
      const predMean = predicted.reduce((a, b) => a + b, 0) / n;

      // NSE (Nash-Sutcliffe Efficiency)
      let sumNum = 0, sumDen = 0;
      for (let i = 0; i < n; i++) {
        sumNum += Math.pow(observed[i] - predicted[i], 2);
        sumDen += Math.pow(observed[i] - obsMean, 2);
      }
      const nse = sumDen > 0 ? 1 - sumNum / sumDen : null;

      // KGE (Kling-Gupta Efficiency)
      const r = this.correlation(predicted, observed);
      const alpha = this.std(observed) > 0 ? this.std(predicted) / this.std(observed) : null;
      const beta = obsMean !== 0 ? predMean / obsMean : null;
      const kge = [r, alpha, beta].every(Number.isFinite) ? 1 - Math.sqrt(Math.pow(r - 1, 2) + Math.pow(alpha - 1, 2) + Math.pow(beta - 1, 2)) : null;

      // CSI (Critical Success Index) for flood events
      const threshold = obsMean + this.std(observed);
      const csi = this.calculateCSI(predicted, observed, threshold);

      return { nse, kge, csi, r, alpha, beta };
    }

    correlation(x, y) {
      const n = x.length;
      const mx = x.reduce((a, b) => a + b, 0) / n;
      const my = y.reduce((a, b) => a + b, 0) / n;

      let num = 0, denX = 0, denY = 0;
      for (let i = 0; i < n; i++) {
        num += (x[i] - mx) * (y[i] - my);
        denX += Math.pow(x[i] - mx, 2);
        denY += Math.pow(y[i] - my, 2);
      }
      return denX > 0 && denY > 0 ? num / Math.sqrt(denX * denY) : null;
    }

    std(arr) {
      const n = arr.length;
      const mean = arr.reduce((a, b) => a + b, 0) / n;
      return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n);
    }

    calculateCSI(pred, obs, threshold) {
      let hits = 0, misses = 0, falseAlarms = 0, correctNegatives = 0;

      for (let i = 0; i < pred.length; i++) {
        const predFlood = pred[i] > threshold;
        const obsFlood = obs[i] > threshold;

        if (predFlood && obsFlood) hits++;
        else if (!predFlood && obsFlood) misses++;
        else if (predFlood && !obsFlood) falseAlarms++;
        else correctNegatives++;
      }

      return hits + misses + falseAlarms > 0 ? hits / (hits + misses + falseAlarms) : null;
    }
  }

  // ============================================================================
  // MC-LSTM CELL (Single ensemble member)
  // ============================================================================

  class MCLSTMCell {
    constructor(config) {
      this.hiddenSize = config.hiddenSize || 128;
      this.seed = config.seed || 42;

      // Initialize weights with seed
      this.initializeWeights();

      // Storage states (mass-conserving)
      this.surfaceStorage = 0;
      this.subsurfaceStorage = 0;
      this.groundwaterStorage = 0;
    }

    initializeWeights() {
      // Simplified weight initialization
      // In production: load pre-trained weights
      const random = this.seededRandom(this.seed);

      // Input gates weights (approximated)
      this.Wii = random() * 0.1;
      this.Wif = random() * 0.1;
      this.Wig = random() * 0.1;
      this.Wiq = random() * 0.1;

      // Hidden gates
      this.Whi = random() * 0.1;
      this.Whf = random() * 0.1;
      this.Whg = random() * 0.1;
      this.Whq = random() * 0.1;

      // Biases
      this.bi = random() * 0.01;
      this.bf = random() * 0.01;
      this.bg = random() * 0.01;
      this.bq = random() * 0.01;

      // Storage flux parameters (mass-conserving)
      this.alphaSurface = 0.20 + random() * 0.15;
      this.alphaSubsurface = 0.08 + random() * 0.08;
      this.alphaGroundwater = 0.01 + random() * 0.03;
    }

    seededRandom(seed) {
      let s = seed;
      return () => {
        s = Math.sin(s * 9999) * 10000;
        return s - Math.floor(s);
      };
    }

    reset() {
      this.surfaceStorage = 0;
      this.subsurfaceStorage = 0;
      this.groundwaterStorage = 0;
    }

    // Sigmoid activation
    sigmoid(x) {
      return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
    }

    // Tanh activation
    tanh(x) {
      return Math.tanh(x);
    }

    forward(input, horizon) {
      const discharge = new Float32Array(horizon);
      const ledgers = [];
      for (let t = 0; t < horizon; t++) {
        const rain = input.rainfall * .8 ** t; // mm per hourly step, persistence scenario
        const before = this.surfaceStorage + this.subsurfaceStorage + this.groundwaterStorage;
        this.surfaceStorage += rain;
        const evaporation = Math.min(this.surfaceStorage, input.evaporation ?? 0);
        this.surfaceStorage -= evaporation;
        const infiltration = this.surfaceStorage * .1;
        this.surfaceStorage -= infiltration; this.subsurfaceStorage += infiltration;
        const percolation = this.subsurfaceStorage * .05;
        this.subsurfaceStorage -= percolation; this.groundwaterStorage += percolation;
        const quick = this.surfaceStorage * this.alphaSurface;
        const inter = this.subsurfaceStorage * this.alphaSubsurface;
        const base = this.groundwaterStorage * this.alphaGroundwater;
        this.surfaceStorage -= quick; this.subsurfaceStorage -= inter; this.groundwaterStorage -= base;
        const outMm = quick + inter + base;
        discharge[t] = outMm * 5100 * 1000 / 3600; // basin km² × mm → m³/s over one hour
        const after = this.surfaceStorage + this.subsurfaceStorage + this.groundwaterStorage;
        ledgers.push({ inputMm: rain, evaporationMm: evaporation, dischargeMm: outMm,
          storageBeforeMm: before, storageAfterMm: after, residualMm: before + rain - evaporation - outMm - after });
      }
      this.lastLedger = ledgers;
      return { discharge, ledgers };
    }
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  AI.DataPipeline = DataPipeline;
  AI.MCLSTMModel = MCLSTMModel;
  AI.MCLSTMCell = MCLSTMCell;
  AI.CONFIG = CONFIG;

  // Auto-initialize when DOM ready
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[FloodTwin AI] ML Hydrology module loaded');
    });
  }

})();
