/* FloodTwin AI — Enhanced Validation Module
   Comprehensive validation with detailed metrics and reporting.
*/

(function() {
  "use strict";

  const AI = window.FT.AI || {};
  window.FT.AIValidation = {};

  // ============================================================================
  // VALIDATION CONFIGURATION
  // ============================================================================

  const ValidationConfig = {
    targets: {
      nse: 0.80,
      kge: 0.75,
      csi: 0.80,
      pbias_max: 10,
      kge_alpha_tol: 0.2,
      kge_beta_tol: 0.2
    },

    scenarios: {
      training: { name: 'Training Period', startDate: '2018-01-01', endDate: '2021-12-31' },
      validation: { name: 'Validation Period', startDate: '2022-01-01', endDate: '2023-12-31' },
      testing: { name: 'Testing Period', startDate: '2024-01-01', endDate: '2024-12-31' }
    },

    benchmark: {
      hecras: { name: 'HEC-RAS 2D', avgComputeTime: null },
      lisFlood: { name: 'LISFLOOD', avgComputeTime: null }
    }
  };

  // ============================================================================
  // METRICS CALCULATOR
  // ============================================================================

  class MetricsCalculator {
    constructor() {
      this.name = 'MetricsCalculator';
    }

    calculateAll(predictions, observations, thresholds = {}) {
      const results = {};

      results.nse = this.calculateNSE(predictions, observations);
      results.kge = this.calculateKGE(predictions, observations);
      results.kgeComponents = this.calculateKGEComponents(predictions, observations);
      results.csi = this.calculateCSI(predictions, observations, thresholds.flood);
      results.rmse = this.calculateRMSE(predictions, observations);
      results.pbias = this.calculatePBIAS(predictions, observations);
      results.correlation = this.calculateCorrelation(predictions, observations);
      results.lm = this.calculateLag1Autocorrelation(predictions, observations);

      results.meetsTargets = this.assessPerformance(results);

      return results;
    }

    calculateNSE(predictions, observations) {
      const valid = this.filterValid(predictions, observations);
      if (valid.length === 0) return null;

      const [pred, obs] = this.toArrays(valid);
      const meanObs = obs.reduce((a, b) => a + b, 0) / obs.length;

      let num = 0, den = 0;
      for (let i = 0; i < pred.length; i++) {
        num += Math.pow(pred[i] - obs[i], 2);
        den += Math.pow(obs[i] - meanObs, 2);
      }

      if (den === 0) return null;
      const nse = 1 - num / den;
      return Math.max(-Infinity, Math.min(Infinity, nse));
    }

    calculateKGE(predictions, observations) {
      const { r, alpha, beta } = this.calculateKGEComponents(predictions, observations);
      if (![r, alpha, beta].every(Number.isFinite)) return null;
      const kge = 1 - Math.sqrt(Math.pow(r - 1, 2) + Math.pow(alpha - 1, 2) + Math.pow(beta - 1, 2));
      return Math.max(-Infinity, Math.min(Infinity, kge));
    }

    calculateKGEComponents(predictions, observations) {
      const valid = this.filterValid(predictions, observations);
      if (valid.length === 0) return { r: null, alpha: null, beta: null };

      const [pred, obs] = this.toArrays(valid);
      const meanPred = pred.reduce((a, b) => a + b, 0) / pred.length;
      const meanObs = obs.reduce((a, b) => a + b, 0) / obs.length;

      const stdPred = this.std(pred);
      const stdObs = this.std(obs);
      const r = this.correlation(pred, obs);
      const alpha = stdObs > 0 ? stdPred / stdObs : null;
      const beta = meanObs !== 0 ? meanPred / meanObs : null;

      return { r, alpha, beta };
    }

    calculateCSI(predictions, observations, threshold = null) {
      if (threshold === null) {
        const obs = observations.filter(v => v !== null && isFinite(v));
        threshold = obs.reduce((a, b) => a + b, 0) / obs.length + this.std(obs);
      }

      const valid = this.filterValid(predictions, observations);
      if (valid.length === 0) return null;

      const [pred, obs] = this.toArrays(valid);

      let hits = 0, misses = 0, falseAlarms = 0;
      for (let i = 0; i < pred.length; i++) {
        const predFlood = pred[i] >= threshold;
        const obsFlood = obs[i] >= threshold;
        if (predFlood && obsFlood) hits++;
        else if (!predFlood && obsFlood) misses++;
        else if (predFlood && !obsFlood) falseAlarms++;
      }

      const total = hits + misses + falseAlarms;
      if (total === 0) return null;
      return hits / total;
    }

    calculateRMSE(predictions, observations) {
      const valid = this.filterValid(predictions, observations);
      if (valid.length === 0) return null;

      const [pred, obs] = this.toArrays(valid);
      let sumSq = 0;
      for (let i = 0; i < pred.length; i++) {
        sumSq += Math.pow(pred[i] - obs[i], 2);
      }
      return Math.sqrt(sumSq / pred.length);
    }

    calculatePBIAS(predictions, observations) {
      const valid = this.filterValid(predictions, observations);
      if (valid.length === 0) return null;

      const [pred, obs] = this.toArrays(valid);
      let sumNum = 0, sumDen = 0;
      for (let i = 0; i < pred.length; i++) {
        sumNum += (pred[i] - obs[i]);
        sumDen += obs[i];
      }
      return sumDen !== 0 ? (sumNum / sumDen) * 100 : null;
    }

    calculateCorrelation(predictions, observations) {
      const valid = this.filterValid(predictions, observations);
      if (valid.length === 0) return null;
      const [pred, obs] = this.toArrays(valid);
      return this.correlation(pred, obs);
    }

    calculateLag1Autocorrelation(predictions, observations) {
      const valid = this.filterValid(predictions, observations);
      if (valid.length < 3) return null;
      const [pred, obs] = this.toArrays(valid);
      const residuals = pred.map((p, i) => p - obs[i]);
      return this.correlation(residuals.slice(1), residuals.slice(0, -1));
    }

    assessPerformance(metrics) {
      const targets = ValidationConfig.targets;

      const assessment = {
        nse: {
          value: metrics.nse,
          target: targets.nse,
          pass: metrics.nse >= targets.nse,
          status: metrics.nse >= targets.nse ? 'PASS' : 'FAIL'
        },
        kge: {
          value: metrics.kge,
          target: targets.kge,
          pass: metrics.kge >= targets.kge,
          status: metrics.kge >= targets.kge ? 'PASS' : 'FAIL'
        },
        csi: {
          value: metrics.csi,
          target: targets.csi,
          pass: metrics.csi >= targets.csi,
          status: metrics.csi >= targets.csi ? 'PASS' : 'FAIL'
        },
        pbias: {
          value: metrics.pbias,
          target: `±${targets.pbias_max}%`,
          pass: Number.isFinite(metrics.pbias) && Math.abs(metrics.pbias) <= targets.pbias_max,
          status: Math.abs(metrics.pbias) <= targets.pbias_max ? 'PASS' : 'WARN'
        },
        kge_alpha: {
          value: metrics.kgeComponents.alpha,
          target: '1.0 ± 0.2',
          pass: Math.abs(metrics.kgeComponents.alpha - 1) < targets.kge_alpha_tol,
          status: Math.abs(metrics.kgeComponents.alpha - 1) < targets.kge_alpha_tol ? 'PASS' : 'WARN'
        },
        kge_beta: {
          value: metrics.kgeComponents.beta,
          target: '1.0 ± 0.2',
          pass: Math.abs(metrics.kgeComponents.beta - 1) < targets.kge_beta_tol,
          status: Math.abs(metrics.kgeComponents.beta - 1) < targets.kge_beta_tol ? 'PASS' : 'WARN'
        }
      };

      const criticalPass = assessment.nse.pass && assessment.kge.pass && assessment.csi.pass;
      const allPass = criticalPass && assessment.pbias.pass;

      assessment.overall = {
        criticalPass,
        allPass,
        summary: allPass ? 'ALL TARGETS MET' :
                 criticalPass ? 'CRITICAL TARGETS MET' :
                 'TARGETS NOT MET'
      };

      return assessment;
    }

    filterValid(predictions, observations) {
      const result = [];
      for (let i = 0; i < predictions.length; i++) {
        if (predictions[i] !== null && observations[i] !== null &&
            Number.isFinite(predictions[i]) && Number.isFinite(observations[i])) {
          result.push([predictions[i], observations[i]]);
        }
      }
      return result;
    }

    toArrays(pairs) {
      return [pairs.map(p => p[0]), pairs.map(p => p[1])];
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
      return denX > 0 && denY > 0 ? num / Math.sqrt(denX * denY) : null;
    }
  }

  // ============================================================================
  // VALIDATOR
  // ============================================================================

  class Validator {
    constructor(config = {}) {
      this.config = { ...ValidationConfig, ...config };
      this.calculator = new MetricsCalculator();
      this.results = {};
    }

    async validate(model, testData, options = {}) {
      console.log('[Validator] Starting validation...');

      const results = {
        summary: {},
        metrics: {},
        scenarios: {},
        speed: {},
        recommendations: []
      };

      // Calculate overall metrics
      console.log('[Validator] Calculating metrics...');
      results.metrics = this.validateMetrics(model, testData);

      // Validate by scenario
      console.log('[Validator] Validating by scenario...');
      results.scenarios = await this.validateByScenario(model, testData);

      // Benchmark speed
      console.log('[Validator] Benchmarking speed...');
      results.speed = await this.benchmarkSpeed(model);

      // Generate recommendations
      results.recommendations = this.generateRecommendations(results);

      // Summary
      results.summary = this.generateSummary(results);

      this.results = results;

      console.log('[Validator] Validation complete!');
      console.log('[Validator] Summary:', results.summary);

      return results;
    }

    validateMetrics(model, testData) {
      const predictions = [];
      const observations = [];
      const byGauge = {};

      for (const sample of testData) {
        const pred = Math.expm1(model.forward(sample.input));
        const obs = sample.targetRaw ?? Math.expm1(sample.target);

        predictions.push(pred);
        observations.push(obs);

        if (!byGauge[sample.gaugeId]) {
          byGauge[sample.gaugeId] = { predictions: [], observations: [] };
        }
        byGauge[sample.gaugeId].predictions.push(pred);
        byGauge[sample.gaugeId].observations.push(obs);
      }

      const overall = this.calculator.calculateAll(predictions, observations);

      const gaugeMetrics = {};
      for (const [gaugeId, data] of Object.entries(byGauge)) {
        gaugeMetrics[gaugeId] = this.calculator.calculateAll(data.predictions, data.observations);
      }

      return { overall, byGauge: gaugeMetrics };
    }

    async validateByScenario(model, testData) {
      const scenarios = {};

      for (const [scenarioId, scenario] of Object.entries(this.config.scenarios)) {
        const scenarioData = testData.filter(sample => {
          const date = new Date(sample.endTime);
          return date >= new Date(scenario.startDate) &&
                 date <= new Date(scenario.endDate);
        });

        if (scenarioData.length === 0) continue;

        const predictions = [];
        const observations = [];

        for (const sample of scenarioData) {
          predictions.push(Math.expm1(model.forward(sample.input)));
          observations.push(sample.targetRaw ?? Math.expm1(sample.target));
        }

        scenarios[scenarioId] = {
          name: scenario.name,
          nSamples: scenarioData.length,
          metrics: this.calculator.calculateAll(predictions, observations)
        };
      }

      return scenarios;
    }

    async benchmarkSpeed(model) {
      const numRuns = 100;
      const startTime = performance.now();

      const sampleInput = this.generateSampleInput(168);

      for (let i = 0; i < numRuns; i++) {
        model.forward(sampleInput);
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / numRuns;

      return {
        ourModel: { avgTime_ms: avgTime, totalTime_ms: totalTime, runs: numRuns },
        hecras: { avgTime_ms: null, speedup: null },
        speedup: null, meetsTarget: null,
        provenance: 'Measured local inference only; no matched HEC-RAS benchmark supplied'
      };
    }

    generateSampleInput(seqLength) {
      const input = [];
      for (let i = 0; i < seqLength; i++) {
        input.push([
          Math.random() * 20,
          28 + Math.random() * 4,
          0.7 + Math.random() * 0.2,
          0.4 + Math.random() * 0.3,
          0.1 + Math.random() * 0.1
        ]);
      }
      return input;
    }

    generateRecommendations(results) {
      const recommendations = [];
      const metrics = results.metrics.overall;

      if (!(Number.isFinite(metrics.nse) && metrics.nse >= this.config.targets.nse)) {
        recommendations.push({
          priority: 'HIGH',
          metric: 'NSE',
          current: metrics.nse?.toFixed(3) || 'N/A',
          target: ValidationConfig.targets.nse,
          suggestion: 'Add more training data or adjust model architecture'
        });
      }

      if (!(Number.isFinite(metrics.kge) && metrics.kge >= this.config.targets.kge)) {
        const { r, alpha, beta } = metrics.kgeComponents;
        if (Math.abs(beta - 1) > 0.2) {
          recommendations.push({
            priority: 'HIGH',
            metric: 'KGE (bias)',
            current: `β=${beta?.toFixed(3)}`,
            target: 'β≈1.0',
            suggestion: 'Apply bias correction post-processing'
          });
        }
      }

      if (!(Number.isFinite(metrics.csi) && metrics.csi >= this.config.targets.csi)) {
        recommendations.push({
          priority: 'HIGH',
          metric: 'CSI',
          current: metrics.csi?.toFixed(3) || 'N/A',
          target: ValidationConfig.targets.csi,
          suggestion: 'Consider event-based training for peak detection'
        });
      }

      if (results.speed.meetsTarget === false) {
        recommendations.push({
          priority: 'MEDIUM',
          metric: 'Speed',
          current: `${results.speed.ourModel.avgTime_ms}ms`,
          target: '10x faster than HEC-RAS',
          suggestion: 'Optimize model or use hardware acceleration'
        });
      }

      return recommendations;
    }

    generateSummary(results) {
      const overall = results.metrics.overall;
      const targets = ValidationConfig.targets;

      const summary = {
        paperTargets: {
          nse: {
            value: overall.nse?.toFixed(3) || 'N/A',
            target: targets.nse,
            status: (overall.nse || 0) >= targets.nse ? '✅ PASS' : '❌ FAIL'
          },
          kge: {
            value: overall.kge?.toFixed(3) || 'N/A',
            target: targets.kge,
            status: (overall.kge || 0) >= targets.kge ? '✅ PASS' : '❌ FAIL'
          },
          csi: {
            value: overall.csi?.toFixed(3) || 'N/A',
            target: targets.csi,
            status: (overall.csi || 0) >= targets.csi ? '✅ PASS' : '❌ FAIL'
          }
        },
        speedup: results.speed.speedup,
        overallStatus: overall.meetsTargets?.overall?.summary || 'UNKNOWN'
      };

      return summary;
    }

    generateReport() {
      if (!this.results.metrics) {
        return 'No validation results available.';
      }

      const r = this.results;
      const targets = ValidationConfig.targets;
      const metric = (v, digits = 4) => Number.isFinite(v) ? v.toFixed(digits) : 'N/A';

      return `
════════════════════════════════════════════════════════════
        FLOODTWIN AI — VALIDATION REPORT
════════════════════════════════════════════════════════════

PAPER TARGETS ASSESSMENT
────────────────────────────────────────────────────────────

┌─────────────────┬──────────┬──────────┬────────┐
│ Metric          │ Target   │ Achieved │ Status │
├─────────────────┼──────────┼──────────┼────────┤
│ NSE             │ ≥${targets.nse}   │ ${metric(r.metrics.overall.nse).padStart(7)} │ ${(r.metrics.overall.nse || 0) >= targets.nse ? '  PASS' : '  FAIL'} │
│ KGE             │ ≥${targets.kge}   │ ${metric(r.metrics.overall.kge).padStart(7)} │ ${(r.metrics.overall.kge || 0) >= targets.kge ? '  PASS' : '  FAIL'} │
│ CSI             │ ≥${targets.csi}   │ ${metric(r.metrics.overall.csi).padStart(7)} │ ${(r.metrics.overall.csi || 0) >= targets.csi ? '  PASS' : '  FAIL'} │
│ Speedup         │ ≥10x    │ ${String(r.speed.speedup ?? 'N/A').padStart(7)} │ ${r.speed.meetsTarget == null ? 'UNVERIFIED' : r.speed.meetsTarget ? '  PASS' : '  FAIL'} │
└─────────────────┴──────────┴──────────┴────────┘

KGE COMPONENTS
────────────────────────────────────────────────────────────
  r (correlation):    ${metric(r.metrics.overall.kgeComponents?.r)}
  α (variability):  ${metric(r.metrics.overall.kgeComponents?.alpha)} (target ≈1.0)
  β (bias):         ${metric(r.metrics.overall.kgeComponents?.beta)} (target ≈1.0)
  PBIAS:            ${metric(r.metrics.overall.pbias, 2)}% (target ±${targets.pbias_max}%)

OVERALL STATUS
────────────────────────────────────────────────────────────
  ${r.summary?.overallStatus || 'UNKNOWN'}

════════════════════════════════════════════════════════════
`;
    }
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  window.FT.AIValidation = {
    ValidationConfig,
    MetricsCalculator,
    Validator
  };

  console.log('[FloodTwin AI] Validation module loaded');

})();
