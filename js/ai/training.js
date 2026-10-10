/* Local single-layer LSTM baseline: deterministic inference, exact BPTT,
   gradient clipping, Adam and log1p discharge MSE. Historical class names remain
   for compatibility; no batch normalization, pretrained weights or MC-LSTM claim. */

(function() {
  "use strict";

  const AI = window.FT.AI || {};
  window.FT.AITraining = {};

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const TrainingConfig = {
    model: {
      inputSize: 5,         // [rainfall, temp, humidity, radiation, wind]
      hiddenSize: 128,       // LSTM hidden units
      numLayers: 1,         // Stacked LSTMs
      outputSize: 1,        // Discharge
      dropout: 0,
      useBatchNorm: false
    },

    training: {
      batchSize: 64,
      epochs: 100,
      learningRate: 0.002,
      optimizer: 'adam',
      earlyStoppingPatience: 15,
      validationSplit: 0.2,
      shuffle: true,
      gradientClip: 1.0,
      lrDecay: 0.95,
      lrDecayFreq: 10
    },

    loss: 'log-mse', // MSE in log1p(m³/s), distinct from evaluation NSE.

    metrics: ['nse', 'kge', 'kge_alpha', 'kge_beta', 'pbias', 'rmse', 'csi']
  };

  // ============================================================================
  // IMPROVED DATA LOADER
  // ============================================================================

  class TrainingDataLoader {
    constructor(dataset, gaugeId = Object.keys(dataset.observations.gauges)[0]) {
      this.dataset = dataset;
      this.gaugeId = gaugeId;
      if (!dataset.observations.gauges[gaugeId]) throw new Error('Unknown training gauge');
      this.scaler = new DataScaler();
      this.gaugeScaler = {};
    }

    prepare(sequenceLength = 168, forecastHorizon = 24) {
      const { forcing, observations } = this.dataset;

      if (!Number.isInteger(sequenceLength) || sequenceLength < 1 ||
          !Number.isInteger(forecastHorizon) || forecastHorizon < 1) throw new Error('Invalid sequence/horizon');
      const n = forcing.dates.length;
      if (observations.dates.length !== n || forcing.dates.some((d, i) =>
          +new Date(d) !== +new Date(observations.dates[i]))) throw new Error('Forcing/observation timestamps must align');
      for (const field of ['precipitation', 'temperature', 'humidity', 'radiation', 'wind']) {
        if (forcing[field].length !== n || forcing[field].some(v => !Number.isFinite(v)))
          throw new Error('Invalid forcing: ' + field);
      }
      if (forcing.dates.some((d, i) => !Number.isFinite(+new Date(d)) ||
          (i && +new Date(d) <= +new Date(forcing.dates[i - 1])))) throw new Error('Dates must increase strictly');
      const stepHours = this.dataset.metadata?.stepHours ?? (this.dataset.resolution === 'hourly' ? 1 : 24);
      if (forcing.dates.some((d, i) => i && +new Date(d) - +new Date(forcing.dates[i - 1]) !== stepHours * 3600000)) throw new Error('Irregular forcing time steps');
      if (!Number.isFinite(stepHours) || stepHours <= 0) throw new Error('Invalid stepHours');
      if (forcing.precipitation.some(v => v < 0) || forcing.humidity.some(v => v < 0 || v > 1)
          || forcing.radiation.some(v => v < 0) || forcing.wind.some(v => v < 0))
        throw new Error('Forcing outside physical domain');
      const discharge = observations.gauges[this.gaugeId].discharge;
      if (discharge.length !== n || discharge.some(v => v !== null && (!Number.isFinite(v) || v < 0)))
        throw new Error('Discharge must align and contain non-negative numbers or null');
      // Physical input units are normalized inside the model; targets are log1p(m³/s).
      const sequences = this.createSequences(forcing, observations, sequenceLength, forecastHorizon);
      const boundary = Math.floor(n * (1 - TrainingConfig.training.validationSplit));
      const train = sequences.filter(s => s.endIndex + forecastHorizon <= boundary);
      const val = sequences.filter(s => s.endIndex - sequenceLength >= boundary);
      if (!train.length || !val.length) throw new Error('Not enough data for purged chronological train/validation split');
      return { train, val, scaler: this.scaler, gaugeScaler: this.gaugeScaler,
        split: { boundary, purged: sequences.length - train.length - val.length, method: 'chronological, disjoint input/target windows' } };
    }

    normalizeForcings(forcing) {
      const normalized = { dates: [...forcing.dates] };

      // Fit scalers
      this.scaler.fit('precipitation', forcing.precipitation, 'log');
      this.scaler.fit('temperature', forcing.temperature, 'standard');
      this.scaler.fit('humidity', forcing.humidity, 'minmax');
      this.scaler.fit('radiation', forcing.radiation, 'standard');
      this.scaler.fit('wind', forcing.wind, 'standard');

      // Transform
      normalized.precipitation = forcing.precipitation.map(v => this.scaler.transform('precipitation', v));
      normalized.temperature = forcing.temperature.map(v => this.scaler.transform('temperature', v));
      normalized.humidity = forcing.humidity.map(v => this.scaler.transform('humidity', v));
      normalized.radiation = forcing.radiation.map(v => this.scaler.transform('radiation', v));
      normalized.wind = forcing.wind.map(v => this.scaler.transform('wind', v));

      return normalized;
    }

    normalizeObservations(observations) {
      const normalized = { dates: [...observations.dates], gauges: {} };

      for (const [gaugeId, data] of Object.entries(observations.gauges)) {
        // Use log transform for discharge (right-skewed)
        this.gaugeScaler[gaugeId] = new DataScaler();
        this.gaugeScaler[gaugeId].fit(gaugeId, data.discharge, 'log');

        normalized.gauges[gaugeId] = {
          discharge: data.discharge.map(v => this.gaugeScaler[gaugeId].transform(gaugeId, v)),
          stage: [...data.stage],
          quality: [...data.quality]
        };
      }

      return normalized;
    }

    createSequences(forcing, observations, seqLen, horizon) {
      const sequences = [];
      const gaugeIds = [this.gaugeId];

      // Compute antecedent precipitation index (API)
      const api = this.computeAPI(forcing.precipitation);

      for (let i = seqLen; i <= forcing.dates.length - horizon; i++) {
        // Input features
        const input = [];
        for (let j = i - seqLen; j < i; j++) {
          input.push([
            forcing.precipitation[j],
            forcing.temperature[j],
            forcing.humidity[j],
            forcing.radiation[j],
            forcing.wind[j]
          ]);
        }

        // Compute input statistics (helps model learn)
        const inputStats = this.computeInputStats(input);

        // API at start and end
        const apiStart = api[i - seqLen];
        const apiEnd = api[i];

        // For each gauge
        for (const gaugeId of gaugeIds) {
          const obs = observations.gauges[gaugeId].discharge.slice(i, i + horizon);

          // Skip if too many missing
          const validCount = obs.filter(v => Number.isFinite(v)).length;
          if (validCount < horizon * 0.8) continue;

          // Target: mean discharge over horizon (in log space)
          const validObs = obs.filter(v => Number.isFinite(v));
          if (validObs.length === 0) continue;

          const targetLog = Math.log1p(validObs.reduce((a, b) => a + b, 0) / validObs.length);

          sequences.push({
            input,
            inputStats,
            apiStart,
            apiEnd,
            target: targetLog,
            targetRaw: validObs.reduce((a, b) => a + b, 0) / validObs.length,
            targetRawAll: validObs,
            gaugeId,
            endIndex: i,
            endTime: new Date(forcing.dates[i]).toISOString()
          });
        }
      }

      return sequences;
    }

    computeAPI(precipitation, decay = 0.95) {
      const api = [precipitation[0]];
      for (let i = 1; i < precipitation.length; i++) {
        api.push(api[i-1] * decay + precipitation[i]);
      }
      return api;
    }

    computeInputStats(input) {
      const n = input.length;
      const features = 5;
      const stats = new Array(features * 4); // mean, std, min, max for each feature

      for (let f = 0; f < features; f++) {
        const values = input.map(row => row[f]);
        const mean = values.reduce((a, b) => a + b, 0) / n;
        const std = Math.sqrt(values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / n);
        const min = Math.min(...values);
        const max = Math.max(...values);

        stats[f * 4] = mean;
        stats[f * 4 + 1] = std;
        stats[f * 4 + 2] = min;
        stats[f * 4 + 3] = max;
      }

      return stats;
    }

    shuffle(arr) {
      const result = [...arr];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    }
  }

  // ============================================================================
  // DATA SCALER
  // ============================================================================

  class DataScaler {
    constructor() {
      this.stats = {};
    }

    fit(name, values, method = 'minmax') {
      const valid = values.filter(v => Number.isFinite(v) && isFinite(v) && v >= 0);
      if (valid.length === 0) return;

      this.stats[name] = { method };

      if (method === 'log') {
        const logVals = valid.map(v => Math.log1p(v));
        this.stats[name].min = Math.min(...logVals);
        this.stats[name].max = Math.max(...logVals);
        this.stats[name].mean = logVals.reduce((a, b) => a + b, 0) / logVals.length;
        const variance = logVals.reduce((acc, v) => acc + Math.pow(v - this.stats[name].mean, 2), 0) / logVals.length;
        this.stats[name].std = Math.sqrt(variance);
        this.stats[name].rawMean = valid.reduce((a, b) => a + b, 0) / valid.length;
      } else if (method === 'standard') {
        this.stats[name].mean = valid.reduce((a, b) => a + b, 0) / valid.length;
        const variance = valid.reduce((acc, v) => acc + Math.pow(v - this.stats[name].mean, 2), 0) / valid.length;
        this.stats[name].std = Math.sqrt(variance);
      } else {
        this.stats[name].min = Math.min(...valid);
        this.stats[name].max = Math.max(...valid);
      }
    }

    transform(name, value) {
      if (value == null || !Number.isFinite(value)) return null;
      const stat = this.stats[name];
      if (!stat) return value;

      switch (stat.method) {
        case 'log':
          return Math.log1p(Math.max(0, value));
        case 'standard':
          return (value - stat.mean) / (stat.std + 1e-8);
        case 'minmax':
        default:
          return (value - stat.min) / (stat.max - stat.min + 1e-8);
      }
    }

    inverseTransform(name, value) {
      if (value == null || !Number.isFinite(value)) return null;
      const stat = this.stats[name];
      if (!stat) return value;

      switch (stat.method) {
        case 'log':
          return Math.expm1(Math.max(0, value));
        case 'standard':
          return value * stat.std + stat.mean;
        case 'minmax':
        default:
          return value * (stat.max - stat.min) + stat.min;
      }
    }
  }

  // ============================================================================
  // ENHANCED MC-LSTM MODEL
  // ============================================================================

  // Historical public class name retained. This is a single-layer LSTM baseline,
  // trained with exact BPTT and Adam; it is NOT the published MC-LSTM architecture.
  class TrainableMCLSTM {
    constructor(config = {}) {
      this.config = { ...TrainingConfig.model, ...config, numLayers: 1, useBatchNorm: false, dropout: 0 };
      const { inputSize: I, hiddenSize: H } = this.config;
      if (I !== 5 || !Number.isInteger(H) || H < 1 || H > 256) throw new Error('Invalid model dimensions');
      this.weights = {};
      for (const g of ['i', 'f', 'g', 'o']) {
        this.weights['Wx' + g] = Array.from({length: H}, () => Array.from({length: I}, () => this.randn() * Math.sqrt(2 / (I + H))));
        this.weights['Wh' + g] = Array.from({length: H}, () => Array.from({length: H}, () => this.randn() / Math.sqrt(H)));
        this.weights['b' + g] = new Array(H).fill(g === 'f' ? 1 : 0);
      }
      this.weights.readout = Array.from({length: H}, () => this.randn() / Math.sqrt(H));
      this.weights.bias = 0;
      this.optimizerState = { m: {}, v: {}, t: 0 };
    }
    randn() { return Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, Math.random()))) * Math.cos(2 * Math.PI * Math.random()); }
    sigmoid(x) { return 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, x)))); }
    matMulVec(matrix, vector) {
      if (matrix.some(row => row.length !== vector.length)) throw new Error('Matrix/vector shape mismatch');
      return matrix.map(row => row.reduce((a, v, i) => a + v * vector[i], 0));
    }
    forward(input, returnHidden = false) {
      if (!input.length || input.some(row => row.length !== 5 || row.some(v => !Number.isFinite(v)))) throw new Error('Expected finite 5-feature sequence');
      const H = this.config.hiddenSize, W = this.weights;
      let h = new Array(H).fill(0), c = new Array(H).fill(0);
      this.tape = [];
      for (const row of input) {
        const x = [Math.log1p(Math.max(0, row[0])) / 5, row[1] / 30, row[2], row[3] / 250, row[4] / 5];
        const gates = {};
        for (const g of ['i', 'f', 'g', 'o']) {
          const z = this.matMulVec(W['Wx' + g], x), r = this.matMulVec(W['Wh' + g], h);
          gates[g] = z.map((v, j) => g === 'g' ? Math.tanh(v + r[j] + W['b' + g][j]) : this.sigmoid(v + r[j] + W['b' + g][j]));
        }
        const nextC = c.map((v, j) => gates.f[j] * v + gates.i[j] * gates.g[j]);
        const nextH = nextC.map((v, j) => gates.o[j] * Math.tanh(v));
        this.tape.push({ x, h, c, nextC, gates });
        h = nextH; c = nextC;
      }
      this.lastH = h;
      this.lastZ = h.reduce((a, v, j) => a + v * W.readout[j], W.bias);
      const discharge = Math.max(this.lastZ, 0) + Math.log1p(Math.exp(-Math.abs(this.lastZ)));
      return returnHidden ? { discharge, h, c } : discharge;
    }
    predict(input, horizon = 48) {
      if (!Number.isInteger(horizon) || horizon < 1 || horizon > 168) throw new Error('Invalid horizon');
      let sequence = input.map(row => [...row]);
      const result = [];
      for (let t = 0; t < horizon; t++) {
        result.push(Math.expm1(this.forward(sequence)));
        const next = [...sequence[sequence.length - 1]];
        next[0] *= 0.8; // Explicit persistence rainfall assumption, never discharge fed as rain.
        sequence = [...sequence.slice(1), next];
      }
      return result;
    }
    computeLoss(predictions, targets) {
      if (!predictions.length || predictions.length !== targets.length) throw new Error('Invalid loss arrays');
      return predictions.reduce((a, p, i) => a + (p - targets[i]) ** 2, 0) / targets.length;
    }
    gradientUpdate(prediction, target, lr = 0.001) {
      if (!Number.isFinite(prediction) || !Number.isFinite(target) || !this.tape.length) throw new Error('Invalid training sample');
      const W = this.weights, H = this.config.hiddenSize;
      const zero = v => Array.isArray(v) ? v.map(zero) : 0;
      const gradients = Object.fromEntries(Object.entries(W).map(([k, v]) => [k, zero(v)]));
      const dz = 2 * (prediction - target) * this.sigmoid(this.lastZ);
      gradients.bias = dz;
      gradients.readout = this.lastH.map(v => dz * v);
      let dh = W.readout.map(v => dz * v), dc = new Array(H).fill(0);
      for (let t = this.tape.length - 1; t >= 0; t--) {
        const step = this.tape[t], { x, h, c, nextC, gates: G } = step;
        const dzG = { i: [], f: [], g: [], o: [] };
        for (let j = 0; j < H; j++) {
          const tanhC = Math.tanh(nextC[j]);
          const cellGrad = dc[j] + dh[j] * G.o[j] * (1 - tanhC * tanhC);
          dzG.o[j] = dh[j] * tanhC * G.o[j] * (1 - G.o[j]);
          dzG.f[j] = cellGrad * c[j] * G.f[j] * (1 - G.f[j]);
          dzG.i[j] = cellGrad * G.g[j] * G.i[j] * (1 - G.i[j]);
          dzG.g[j] = cellGrad * G.i[j] * (1 - G.g[j] * G.g[j]);
          dc[j] = cellGrad * G.f[j];
        }
        const priorDh = new Array(H).fill(0);
        for (const g of ['i', 'f', 'g', 'o']) for (let j = 0; j < H; j++) {
          gradients['b' + g][j] += dzG[g][j];
          for (let k = 0; k < 5; k++) gradients['Wx' + g][j][k] += dzG[g][j] * x[k];
          for (let k = 0; k < H; k++) {
            gradients['Wh' + g][j][k] += dzG[g][j] * h[k];
            priorDh[k] += W['Wh' + g][j][k] * dzG[g][j];
          }
        }
        dh = priorDh;
      }
      this.updateWeights(gradients, lr);
    }
    updateWeights(gradients, lr = 0.001) {
      const state = this.optimizerState, t = ++state.t;
      const flatten = v => Array.isArray(v) ? v.flatMap(flatten) : [v];
      const norm = Math.sqrt(Object.values(gradients).flatMap(flatten).reduce((a, v) => a + v * v, 0));
      const scale = Math.min(1, TrainingConfig.training.gradientClip / Math.max(norm, 1e-12));
      const zero = v => Array.isArray(v) ? v.map(zero) : 0;
      const update = (w, g, m, v) => {
        if (Array.isArray(g)) {
          const r = g.map((grad, i) => update(w[i], grad, m[i], v[i]));
          return [r.map(x => x[0]), r.map(x => x[1]), r.map(x => x[2])];
        }
        g *= scale;
        m = .9 * m + .1 * g; v = .999 * v + .001 * g * g;
        return [w - lr * (m / (1 - .9 ** t)) / (Math.sqrt(v / (1 - .999 ** t)) + 1e-8), m, v];
      };
      for (const [name, g] of Object.entries(gradients)) {
        if (!(name in this.weights)) throw new Error('Unknown parameter: ' + name);
        const r = update(this.weights[name], g, state.m[name] ?? zero(g), state.v[name] ?? zero(g));
        [this.weights[name], state.m[name], state.v[name]] = r;
      }
    }
    save() { return JSON.stringify({ schemaVersion: 2, architecture: 'lstm-baseline', outputTransform: 'log1p-m3s', config: this.config, weights: this.weights }); }
    load(json) {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      if (data.schemaVersion !== 2 || data.architecture !== 'lstm-baseline' || data.outputTransform !== 'log1p-m3s') throw new Error('Unsupported model artifact');
      const candidate = new TrainableMCLSTM(data.config);
      const validate = (expected, actual) => Array.isArray(expected) ?
        Array.isArray(actual) && actual.length === expected.length && expected.every((v, i) => validate(v, actual[i])) : Number.isFinite(actual);
      if (Object.keys(candidate.weights).some(k => !validate(candidate.weights[k], data.weights[k]))) throw new Error('Invalid model weights');
      this.config = candidate.config; this.weights = data.weights;
      this.optimizerState = { m: {}, v: {}, t: 0 };
    }
    computeMetrics(predictions, observations) {
      const valid = predictions
        .map((p, i) => ({ p, o: observations[i], valid: p !== null && observations[i] !== null && isFinite(p) && isFinite(observations[i]) }))
        .filter(x => x.valid);

      if (valid.length === 0) return {};
      if (window.FT.AIValidation) return { ...new window.FT.AIValidation.MetricsCalculator()
        .calculateAll(valid.map(x => x.p), valid.map(x => x.o)), nSamples: valid.length };

      const pred = valid.map(x => x.p);
      const obs = valid.map(x => x.o);

      // NSE
      const meanObs = obs.reduce((a, b) => a + b, 0) / obs.length;
      let numNSE = 0, denNSE = 0;
      for (let i = 0; i < pred.length; i++) {
        numNSE += Math.pow(pred[i] - obs[i], 2);
        denNSE += Math.pow(obs[i] - meanObs, 2);
      }
      const nse = denNSE > 0 ? 1 - numNSE / denNSE : null;

      // KGE components
      const meanPred = pred.reduce((a, b) => a + b, 0) / pred.length;
      const stdPred = this.std(pred);
      const stdObs = this.std(obs);
      const r = this.correlation(pred, obs);
      const alpha = stdPred / (stdObs + 1e-8);
      const beta = meanPred / (meanObs + 1e-8);
      const kge = 1 - Math.sqrt(Math.pow(r - 1, 2) + Math.pow(alpha - 1, 2) + Math.pow(beta - 1, 2));

      // CSI (flood detection)
      const threshold = meanObs + stdObs;
      let hits = 0, misses = 0, falseAlarms = 0;
      for (let i = 0; i < pred.length; i++) {
        const predFlood = pred[i] >= threshold;
        const obsFlood = obs[i] >= threshold;
        if (predFlood && obsFlood) hits++;
        else if (!predFlood && obsFlood) misses++;
        else if (predFlood && !obsFlood) falseAlarms++;
      }
      const csi = hits / (hits + misses + falseAlarms + 1e-8);

      // PBIAS
      const obsTotal = obs.reduce((a, v) => a + v, 0);
      const pbias = obsTotal > 0 ? 100 * pred.reduce((a, p, i) => a + p - obs[i], 0) / obsTotal : null;

      // RMSE
      let rmse = 0;
      for (let i = 0; i < pred.length; i++) {
        rmse += Math.pow(pred[i] - obs[i], 2);
      }
      rmse = Math.sqrt(rmse / pred.length);

      return {
        nse,
        kge: Math.max(-Infinity, Math.min(Infinity, kge)),
        kgeComponents: { r, alpha, beta },
        csi: Math.max(0, Math.min(1, csi)),
        pbias,
        rmse,
        nSamples: valid.length
      };
    }

    std(arr) {
      if (arr.length === 0) return 0;
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return Math.sqrt(arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / arr.length);
    }

    correlation(x, y) {
      const n = x.length;
      if (n === 0) return 0;
      const mx = x.reduce((a, b) => a + b, 0) / n;
      const my = y.reduce((a, b) => a + b, 0) / n;
      let num = 0, denX = 0, denY = 0;
      for (let i = 0; i < n; i++) {
        num += (x[i] - mx) * (y[i] - my);
        denX += Math.pow(x[i] - mx, 2);
        denY += Math.pow(y[i] - my, 2);
      }
      return num / (Math.sqrt(denX * denY) + 1e-8);
    }

  }

  // ============================================================================
  // TRAINER
  // ============================================================================

  class Trainer {
    constructor(model, config = {}) {
      this.model = model;
      this.config = { ...TrainingConfig.training, ...config };
      this.history = { train: [], val: [] };
      this.bestValLoss = Infinity;
      this.epochsWithoutImprovement = 0;
      this.bestModel = null;
      this.currentLR = this.config.learningRate;
    }

    async train(trainData, valData, callbacks = {}) {
      trainData = trainData.slice();
      const { epochs, batchSize, earlyStoppingPatience, lrDecay, lrDecayFreq } = this.config;

      if (!trainData.length || !valData.length) throw new Error('Training and validation sets are required');
      console.log('[Trainer] Starting training...');
      console.log(`[Trainer] Epochs: ${epochs}, Batch size: ${batchSize}`);
      console.log(`[Trainer] Train samples: ${trainData.length}, Val samples: ${valData.length}`);
      console.log(`[Trainer] Learning rate: ${this.currentLR}`);

      for (let epoch = 0; epoch < epochs; epoch++) {
        // Shuffle training data
        if (this.config.shuffle) {
          this.shuffle(trainData);
        }

        // Learning rate decay
        if (epoch > 0 && epoch % lrDecayFreq === 0) {
          this.currentLR *= lrDecay;
          console.log(`[Trainer] LR decay: ${this.currentLR.toFixed(6)}`);
        }

        // Training pass
        const trainLoss = await this.trainEpoch(trainData, batchSize);
        this.history.train.push(trainLoss);

        // Validation pass
        const valLoss = await this.validate(valData);
        this.history.val.push(valLoss);

        // Compute validation metrics
        const metrics = await this.computeValMetrics(valData);

        // Log progress
        if (epoch % 5 === 0 || epoch === epochs - 1) {
          console.log(`[Trainer] Epoch ${epoch + 1}/${epochs} - Loss: ${trainLoss.toFixed(4)}/${valLoss.toFixed(4)} - NSE: ${metrics.nse?.toFixed(3)} KGE: ${metrics.kge?.toFixed(3)}`);
        }

        // Early stopping
        if (valLoss < this.bestValLoss) {
          this.bestValLoss = valLoss;
          this.epochsWithoutImprovement = 0;
          this.bestModel = this.model.save();
        } else {
          this.epochsWithoutImprovement++;
        }

        if (this.epochsWithoutImprovement >= earlyStoppingPatience) {
          console.log(`[Trainer] Early stopping at epoch ${epoch + 1}`);
          break;
        }

        // Callback
        if (callbacks.onEpochEnd) {
          callbacks.onEpochEnd({ epoch, trainLoss, valLoss, metrics, history: this.history });
        }
      }

      // Restore best model
      if (this.bestModel) {
        this.model.load(this.bestModel);
      }

      console.log('[Trainer] Training complete!');
      console.log(`[Trainer] Best validation loss: ${this.bestValLoss.toFixed(4)}`);

      return this.history;
    }

    shuffle(data) {
      for (let i = data.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [data[i], data[j]] = [data[j], data[i]];
      }
    }

    async trainEpoch(trainData, batchSize) {
      let totalLoss = 0;
      let numBatches = 0;

      for (let i = 0; i < trainData.length; i += batchSize) {
        const batch = trainData.slice(i, i + batchSize);
        const loss = await this.trainBatch(batch);
        totalLoss += loss;
        numBatches++;
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      return totalLoss / numBatches;
    }

    async trainBatch(batch) {
      let totalLoss = 0;

      for (const sample of batch) {
        // Forward pass
        const prediction = this.model.forward(sample.input);

        // Target (log-transformed)
        const target = sample.target;

        // Loss
        const loss = Math.pow(prediction - target, 2);
        totalLoss += loss;

        // Gradient update
        this.model.gradientUpdate(prediction, target, this.currentLR);
      }

      return totalLoss / batch.length;
    }

    async validate(valData) {
      let totalLoss = 0;

      for (const sample of valData) {
        const prediction = this.model.forward(sample.input);
        const target = sample.target;
        totalLoss += Math.pow(prediction - target, 2);
      }

      return totalLoss / valData.length;
    }

    async computeValMetrics(valData, maxSamples = 500) {
      const samples = valData.slice(0, maxSamples);
      const predictions = [];
      const observations = [];

      for (const sample of samples) {
        const pred = this.model.forward(sample.input);
        const obs = sample.targetRaw;
        predictions.push(Math.expm1(pred));
        observations.push(obs);
      }

      return this.model.computeMetrics(predictions, observations);
    }
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  window.FT.AITraining = {
    TrainingDataLoader,
    TrainingConfig,
    TrainableMCLSTM,
    Trainer,
    DataScaler
  };

  console.log('[FloodTwin AI] Enhanced Training module loaded');

})();
