/* FloodTwin AI — Data Assimilation Module
   Implements Ensemble Kalman Filter (EnKF) and Particle Filter
   for real-time state updating with observations.

   Paper novelty: Uncertainty-aware digital twin with real DA

   Methods:
   - EnKF: Linear/Gaussian assumption
   - Particle Filter: Non-linear, non-Gaussian states
   - SEIK: Square Root Ensemble Kalman Filter
*/

(function() {
  "use strict";

  const AI = window.FT.AI || {};
  window.FT.AI = AI;

  // ============================================================================
  // ENSEMBLE KALMAN FILTER (EnKF)
  // ============================================================================

  class EnsembleKalmanFilter {
    constructor(config = {}) {
      this.ensembleSize = config.ensembleSize || 50;
      this.stateDim = config.stateDim || 10;
      this.obsDim = config.obsDim || 4;

      if (!Number.isInteger(this.ensembleSize) || this.ensembleSize < 2 || this.stateDim !== 10 || this.obsDim !== 4)
        throw new Error('Local EnKF requires >=2 members, 10 states and 4 indexed gauges');
      // Ensemble members: each column is a state vector
      this.ensemble = [];
      for (let i = 0; i < this.ensembleSize; i++) {
        this.ensemble.push(new Float64Array(this.stateDim));
      }

      // Observation operator H (maps state to observation space)
      this.H = this.buildObservationOperator();

      // Inflation factor (account for model error)
      this.inflation = config.inflation || 1.05;

      // Localization radius (km) - ignore correlations beyond this
      this.localizationRadius = config.localizationRadius || 50;

      // Initialize ensemble
      this.initialize();
    }

    buildObservationOperator() {
      // H matrix: maps state [Q1, Q2, Q3, Q4, S1, S2, S3, S4, API, rainfall]
      // to observations [gauge1_stage, gauge2_stage, gauge3_stage, gauge4_stage]

      // Simplified: each gauge observation is weighted sum of upstream states
      return {
        // Gauge at Ái Nghĩa: influenced by A Vương, Sông Bung 4
        aiNghia: [0.32, 0.42, 0.18, 0.0, 0, 0, 0, 0, 0.1, 0],
        // Gauge at Câu Lâu: influenced by all reservoirs
        cauLau: [0.05, 0.08, 0.12, 0.5, 0, 0, 0, 0, 0.15, 0],
        // Gauge at Giao Thủy: influenced by Sông Tranh 2
        giaoThuy: [0, 0.05, 0.2, 0.62, 0, 0, 0, 0, 0.12, 0],
        // Gauge at Cẩm Lệ: influenced by A Vương, Sông Bung 4
        camLe: [0.22, 0.28, 0.1, 0, 0, 0, 0, 0, 0.08, 0]
      };
    }

    initialize() {
      // Initialize ensemble around prior mean
      // In production: use climatological statistics
      const priorMean = this.getPriorMean();

      for (let i = 0; i < this.ensembleSize; i++) {
        for (let j = 0; j < this.stateDim; j++) {
          // Add spread around prior
          this.ensemble[i][j] = priorMean[j] + this.randn() * priorMean[j] * 0.2;
        }
      }
    }

    getPriorMean() {
      // Prior mean state [Q1, Q2, Q3, Q4, S1, S2, S3, S4, API, rainfall]
      // Based on climatological values for VGTB
      return [
        200,   // Q1: A Vương discharge (m³/s)
        400,   // Q2: Sông Bung 4 discharge
        300,   // Q3: Đắk Mi 4 discharge
        500,   // Q4: Sông Tranh 2 discharge
        150,   // S1: A Vương storage (Mm³)
        300,   // S2: Sông Bung 4 storage
        200,   // S3: Đắk Mi 4 storage
        450,   // S4: Sông Tranh 2 storage
        100,   // API: Antecedent Precipitation Index
        5      // Current rainfall (mm/h)
      ];
    }

    // Forecast step: run model for each ensemble member
    forecast(dt = 0.25) {
      if (!Number.isFinite(dt) || dt <= 0 || dt > 24) throw new Error('Invalid assimilation step');
      const areasKm2 = [682, 1448, 1125, 1100]; // Assumed contributing areas for local prototype.
      const recessionPerHour = [.0048, .0048, .0054, .004];
      for (const state of this.ensemble) {
        for (let j = 0; j < 4; j++) {
          const inputMm3 = state[9] * dt * areasKm2[j] * .001;
          const available = state[4 + j] + inputMm3;
          const releaseMm3 = available * (1 - Math.exp(-recessionPerHour[j] * dt));
          state[4 + j] = available - releaseMm3;
          state[j] = releaseMm3 * 1e6 / (dt * 3600);
        }
        state[8] = state[8] * Math.pow(.96, dt / 6) + state[9] * dt;
        state[9] *= Math.pow(.8, dt);
      }
      this.inflate();
    }

    // Analysis step: update with observations
    analyze(observations, observationError) {
      // Serial deterministic square-root EnKF. Missing gauges retain their fixed index.
      const ids = ['aiNghia', 'cauLau', 'giaoThuy', 'camLe'];
      const values = Array.isArray(observations) || ArrayBuffer.isView(observations) ?
        observations : ids.map(id => observations[id] ?? null);
      for (let d = 0; d < this.obsDim; d++) {
        const y = values[d];
        if (y == null) continue;
        const std = Array.isArray(observationError) ? observationError[d] : observationError;
        if (!Number.isFinite(y) || !Number.isFinite(std) || std <= 0)
          throw new Error('Observation and positive error standard deviation must be finite');
        const projected = this.getObservationEnsemble().map(row => row[d]);
        const n = this.ensembleSize;
        const yMean = projected.reduce((a, v) => a + v, 0) / n;
        const mean = this.getStatistics().mean;
        const variance = projected.reduce((a, v) => a + (v - yMean) ** 2, 0) / (n - 1);
        const denominator = variance + std * std;
        const alpha = 1 / (1 + Math.sqrt(std * std / denominator));
        const gain = mean.map((m, j) => this.ensemble.reduce((a, row, i) =>
          a + (row[j] - m) * (projected[i] - yMean), 0) / (n - 1) / denominator);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < this.stateDim; j++) {
            this.ensemble[i][j] += gain[j] * (y - yMean) -
              alpha * gain[j] * (projected[i] - yMean);
          }
          this.clampState(this.ensemble[i]);
        }
      }
    }

    getObservationEnsemble() {
      const obsEnsemble = [];
      const gaugeMap = {
        'aiNghia': [0, 4],
        'cauLau': [1, 5],
        'giaoThuy': [2, 6],
        'camLe': [3, 7]
      };

      for (let i = 0; i < this.ensembleSize; i++) {
        const state = this.ensemble[i];
        const obs = new Float64Array(this.obsDim);

        // Convert discharges to stage using rating curve
        // Stage = base + a * Q^b
        const ratingParams = [
          { a: 0.5, b: 0.3, base: 3.2 },  // aiNghia
          { a: 0.4, b: 0.35, base: 0.7 }, // cauLau
          { a: 0.55, b: 0.28, base: 2.6 }, // giaoThuy
          { a: 0.3, b: 0.4, base: 0.4 }  // camLe
        ];

        for (let d = 0; d < this.obsDim; d++) {
          const Q = state[d];
          const p = ratingParams[d];
          obs[d] = p.base + p.a * Math.pow(Math.max(0, Q), p.b);
        }

        obsEnsemble.push(obs);
      }

      return obsEnsemble;
    }

    inflate() {
      // Apply multiplicative inflation
      const mean = new Float64Array(this.stateDim);

      for (let j = 0; j < this.stateDim; j++) {
        let sum = 0;
        for (let i = 0; i < this.ensembleSize; i++) {
          sum += this.ensemble[i][j];
        }
        mean[j] = sum / this.ensembleSize;
      }

      for (let i = 0; i < this.ensembleSize; i++) {
        for (let j = 0; j < this.stateDim; j++) {
          this.ensemble[i][j] = mean[j] + (this.ensemble[i][j] - mean[j]) * this.inflation;
        }
      }
    }

    clampState(state) {
      // Physical bounds
      const mins = [10, 10, 10, 10, 50, 80, 40, 150, 0, 0];
      const maxs = [5000, 8000, 6000, 10000, 400, 600, 400, 800, 500, 200];

      for (let j = 0; j < this.stateDim; j++) {
        state[j] = Math.max(mins[j], Math.min(maxs[j], state[j]));
      }
    }

    randn() {
      // Box-Muller transform for standard normal
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    // Get ensemble statistics
    getStatistics() {
      const mean = new Float64Array(this.stateDim);
      const std = new Float64Array(this.stateDim);

      // Mean
      for (let j = 0; j < this.stateDim; j++) {
        let sum = 0;
        for (let i = 0; i < this.ensembleSize; i++) {
          sum += this.ensemble[i][j];
        }
        mean[j] = sum / this.ensembleSize;
      }

      // Standard deviation
      for (let j = 0; j < this.stateDim; j++) {
        let sumSq = 0;
        for (let i = 0; i < this.ensembleSize; i++) {
          sumSq += Math.pow(this.ensemble[i][j] - mean[j], 2);
        }
        std[j] = Math.sqrt(sumSq / (this.ensembleSize - 1));
      }

      // Quantiles
      const q05 = new Float64Array(this.stateDim);
      const q50 = new Float64Array(this.stateDim);
      const q95 = new Float64Array(this.stateDim);

      const values = new Float64Array(this.ensembleSize);
      for (let j = 0; j < this.stateDim; j++) {
        for (let i = 0; i < this.ensembleSize; i++) {
          values[i] = this.ensemble[i][j];
        }
        values.sort();

        q05[j] = values[Math.floor(this.ensembleSize * 0.05)];
        q50[j] = values[Math.floor(this.ensembleSize * 0.5)];
        q95[j] = values[Math.floor(this.ensembleSize * 0.95)];
      }

      return { mean, std, q05, q50, q95 };
    }
  }

  // ============================================================================
  // PARTICLE FILTER (for non-linear, non-Gaussian)
  // ============================================================================

  class ParticleFilter {
    constructor(config = {}) {
      this.numParticles = config.numParticles || 1000;
      this.stateDim = config.stateDim || 10;

      // Particles and weights
      this.particles = [];
      this.weights = new Float64Array(this.numParticles);

      // Initialize
      this.initialize();
    }

    initialize() {
      const priorMean = this.getPriorMean();

      for (let i = 0; i < this.numParticles; i++) {
        this.particles.push(new Float64Array(this.stateDim));

        for (let j = 0; j < this.stateDim; j++) {
          this.particles[i][j] = priorMean[j] * (0.5 + Math.random());
        }

        this.weights[i] = 1 / this.numParticles;
      }
    }

    getPriorMean() {
      return [
        200, 400, 300, 500, 150, 300, 200, 450, 100, 5
      ];
    }

    // Predict step: apply model with noise
    predict(dt = 0.25) {
      for (let i = 0; i < this.numParticles; i++) {
        const p = this.particles[i];

        // Simplified model with process noise
        const processNoise = 0.1;

        for (let j = 0; j < 4; j++) {
          // Add noise to discharge
          p[j] *= (1 + (Math.random() - 0.5) * processNoise);
          p[j] = Math.max(10, Math.min(5000, p[j]));
        }

        for (let j = 4; j < 8; j++) {
          // Storage
          p[j] *= (1 + (Math.random() - 0.5) * processNoise * 0.5);
          p[j] = Math.max(10, Math.min(1000, p[j]));
        }
      }
    }

    // Update step: weight by likelihood of observation
    update(observations) {
      // observations: array of [gauge, stage] pairs

      for (let i = 0; i < this.numParticles; i++) {
        const p = this.particles[i];
        let logWeight = 0;

        for (const obs of observations) {
          const predictedStage = this.stateToStage(p, obs.gaugeIndex);
          const error = obs.stage - predictedStage;
          const likelihood = this.gaussianPDF(error, obs.std);
          logWeight += Math.log(likelihood + 1e-10);
        }

        this.weights[i] = Math.exp(logWeight);
      }

      // Normalize weights
      const sum = this.weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < this.numParticles; i++) {
        this.weights[i] /= sum;
      }
    }

    stateToStage(state, gaugeIndex) {
      // Simplified rating curve
      const ratingParams = [
        { a: 0.5, b: 0.3, base: 3.2 },
        { a: 0.4, b: 0.35, base: 0.7 },
        { a: 0.55, b: 0.28, base: 2.6 },
        { a: 0.3, b: 0.4, base: 0.4 }
      ];

      const p = ratingParams[gaugeIndex];
      return p.base + p.a * Math.pow(Math.max(0, state[gaugeIndex]), p.b);
    }

    gaussianPDF(x, std) {
      return Math.exp(-0.5 * Math.pow(x / std, 2)) / (std * Math.sqrt(2 * Math.PI));
    }

    // Resample (systematic resampling)
    resample() {
      const newParticles = [];
      const cumsum = new Float64Array(this.numParticles + 1);

      cumsum[0] = 0;
      for (let i = 0; i < this.numParticles; i++) {
        cumsum[i + 1] = cumsum[i] + this.weights[i];
      }

      // Starting point
      let u0 = Math.random() / this.numParticles;

      for (let i = 0; i < this.numParticles; i++) {
        const u = u0 + i / this.numParticles;

        // Find particle index
        let j = 0;
        while (j < this.numParticles && cumsum[j + 1] < u) {
          j++;
        }

        // Clone particle with mutation
        const newP = new Float64Array(this.stateDim);
        const orig = this.particles[j];
        const mutation = 0.05;

        for (let k = 0; k < this.stateDim; k++) {
          newP[k] = orig[k] * (1 + (Math.random() - 0.5) * mutation);
        }

        newParticles.push(newP);
        this.weights[i] = 1 / this.numParticles;
      }

      this.particles = newParticles;
    }

    getStatistics() {
      const mean = new Float64Array(this.stateDim);
      const sorted = [];

      // Weighted mean
      for (let j = 0; j < this.stateDim; j++) {
        let sum = 0;
        for (let i = 0; i < this.numParticles; i++) {
          sum += this.particles[i][j] * this.weights[i];
        }
        mean[j] = sum;
      }

      // Weighted quantiles
      const q05 = new Float64Array(this.stateDim);
      const q50 = new Float64Array(this.stateDim);
      const q95 = new Float64Array(this.stateDim);

      for (let j = 0; j < this.stateDim; j++) {
        const values = [];
        for (let i = 0; i < this.numParticles; i++) {
          values.push({
            v: this.particles[i][j],
            w: this.weights[i]
          });
        }

        // Sort by value
        values.sort((a, b) => a.v - b.v);

        // Find quantiles
        let cumW = 0;
        for (const { v, w } of values) {
          cumW += w;
          if (cumW >= 0.05 && q05[j] === 0) q05[j] = v;
          if (cumW >= 0.5 && q50[j] === 0) q50[j] = v;
        }
        q95[j] = values[Math.floor(this.numParticles * 0.95)].v;
      }

      return { mean, q05, q50, q95 };
    }
  }

  // ============================================================================
  // DATA ASSIMILATION MANAGER
  // ============================================================================

  class DataAssimilationManager {
    constructor(config = {}) {
      this.useEnKF = config.useEnKF !== false;
      this.usePF = config.usePF || false;

      if (this.useEnKF) {
        this.enkf = new EnsembleKalmanFilter(config.enkf);
      }

      if (this.usePF) {
        this.pf = new ParticleFilter(config.pf);
      }

      // Observation buffer
      this.observations = [];
      this.lastUpdateTime = null;

      // Statistics history
      this.history = [];
    }

    // Add new observation
    addObservation(gaugeId, stage, time, std = 0.1) {
      const gaugeMap = {
        'aiNghia': 0,
        'cauLau': 1,
        'giaoThuy': 2,
        'camLe': 3
      };

      if (!(gaugeId in gaugeMap) || !Number.isFinite(stage) || !Number.isFinite(time) ||
          !Number.isFinite(std) || std <= 0) throw new Error('Invalid gauge observation');
      this.observations.push({
        gaugeIndex: gaugeMap[gaugeId],
        gaugeId,
        stage,
        time,
        std
      });
    }

    // Run assimilation cycle
    runCycle(dt = 0.25) {
      // Forecast
      if (this.useEnKF) {
        this.enkf.forecast(dt);
      }
      if (this.usePF) {
        this.pf.predict(dt);
      }

      const currentTime = Date.now();
      // Consume each timestamp once, in order, without mixing simulation and wall clocks.
      const pending = this.observations.filter(o => this.lastUpdateTime == null || o.time > this.lastUpdateTime)
        .sort((a, b) => a.time - b.time);
      const times = [...new Set(pending.map(o => o.time))];
      for (const time of times) {
        const group = pending.filter(o => o.time === time);
        const values = new Array(4).fill(null), errors = new Array(4).fill(null);
        for (let g = 0; g < 4; g++) {
          const obs = group.filter(o => o.gaugeIndex === g);
          if (!obs.length) continue;
          const precision = obs.reduce((a, o) => a + 1 / (o.std * o.std), 0);
          values[g] = obs.reduce((a, o) => a + o.stage / (o.std * o.std), 0) / precision;
          errors[g] = Math.sqrt(1 / precision);
        }
        if (this.useEnKF) this.enkf.analyze(values, errors);
        if (this.usePF) { this.pf.update(group); this.pf.resample(); }
        this.lastUpdateTime = time;
      }
      this.observations = [];

      // Get statistics
      const stats = {
        time: currentTime,
        enkf: this.useEnKF ? this.enkf.getStatistics() : null,
        pf: this.usePF ? this.pf.getStatistics() : null
      };

      this.history.push(stats);
      if (this.history.length > 1000) {
        this.history.shift();
      }

      return stats;
    }

    // Get current state estimate
    getStateEstimate() {
      if (this.useEnKF) {
        const stats = this.enkf.getStatistics();
        return {
          discharges: stats.q50.slice(0, 4),
          storages: stats.q50.slice(4, 8),
          api: stats.q50[8],
          rainfall: stats.q50[9],
          uncertainty: {
            discharges: stats.std.slice(0, 4),
            q05: stats.q05.slice(0, 4),
            q95: stats.q95.slice(0, 4)
          }
        };
      }

      if (this.usePF) {
        const stats = this.pf.getStatistics();
        return {
          discharges: stats.q50.slice(0, 4),
          storages: stats.q50.slice(4, 8),
          api: stats.q50[8],
          rainfall: stats.q50[9],
          uncertainty: {
            discharges: null,
            q05: stats.q05.slice(0, 4),
            q95: stats.q95.slice(0, 4)
          }
        };
      }

      return null;
    }

    // Reset
    reset() {
      if (this.useEnKF) {
        this.enkf.initialize();
      }
      if (this.usePF) {
        this.pf.initialize();
      }
      this.observations = [];
      this.lastUpdateTime = null;
      this.history = [];
    }
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  AI.EnsembleKalmanFilter = EnsembleKalmanFilter;
  AI.ParticleFilter = ParticleFilter;
  AI.DataAssimilationManager = DataAssimilationManager;

  console.log('[FloodTwin AI] Data Assimilation module loaded');

})();
