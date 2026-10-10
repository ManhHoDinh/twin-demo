/* FloodTwin AI — Risk Assessment Engine
   Probabilistic flood risk quantification for decision support.

   Features:
   - Monte Carlo simulation for compound events
   - Damage estimation (economic, population)
   - Critical infrastructure exposure
   - Scenario comparison (Rule vs MPC)
*/

(function() {
  "use strict";

  const AI = window.FT.AI || {};
  window.FT.AI = AI;

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const RISK_CONFIG = {
    // Monte Carlo settings
    numSimulations: 1000,

    // Damage parameters (VND, 2024 prices)
    damageParams: {
      // Residential damage per meter depth (millions VND per household)
      residential: {
        walls: 5,      // per 0.3m depth
        contents: 8,   // furniture, appliances
        cleanup: 3     // cleanup cost
      },
      // Economic damage
      infrastructure: {
        road: 500,      // per km per 0.1m depth
        bridge: 2000,   // per bridge
        utility: 100    // per substation
      },
      // Agricultural (per hectare per meter depth)
      agricultural: 15,
      industrial: 50
    },

    // Population exposure thresholds
    exposureThresholds: {
      minor: 0.3,   // meters
      significant: 0.7,
      severe: 1.5
    },

    // Alert level probabilities (from ensemble)
    alertLevelThresholds: {
      'aiNghia': [6.5, 8.0, 9.0],
      'cauLau': [2.0, 3.0, 4.0],
      'giaoThuy': [6.2, 7.7, 8.8],
      'camLe': [1.0, 1.7, 2.5]
    },

    // Critical infrastructure locations
    criticalInfrastructure: [
      { id: 'dn_airport', name: 'Sân bay Đà Nẵng', lat: 16.06, lon: 108.20, type: 'transport' },
      { id: 'hoian_old', name: 'Phố cổ Hội An', lat: 15.88, lon: 108.33, type: 'cultural' },
      { id: 'danang_hospital', name: 'Bệnh viện Đà Nẵng', lat: 16.05, lon: 108.21, type: 'medical' },
      { id: 'hoian_hospital', name: 'Bệnh viện Hội An', lat: 15.88, lon: 108.32, type: 'medical' }
    ]
  };

  // ============================================================================
  // POPULATION & EXPOSURE DATA
  // ============================================================================

  const PopulationData = {
    // Zone population data (from Vietnam census, adjusted)
    zones: {
      'danang_inner': { population: 450000, density: 12000, area: 37.5 },
      'danang_outer': { population: 650000, density: 3000, area: 216.7 },
      'hoian': { population: 120000, density: 2000, area: 60 },
      'quangNam_coastal': { population: 280000, density: 500, area: 560 },
      'quangNam_inland': { population: 180000, density: 200, area: 900 }
    },

    // Building count by zone
    buildings: {
      'danang_inner': 45000,
      'danang_outer': 35000,
      'hoian': 12000,
      'quangNam_coastal': 15000,
      'quangNam_inland': 8000
    },

    // Households (average 4.2 people per household in Vietnam)
    households: {
      'danang_inner': 107000,
      'danang_outer': 155000,
      'hoian': 28600,
      'quangNam_coastal': 66700,
      'quangNam_inland': 42900
    },

    // Get population affected by depth
    getAffectedPopulation(zone, depth) {
      const data = this.zones[zone] || { population: 0 };
      const threshold = RISK_CONFIG.exposureThresholds;

      if (depth >= threshold.severe) {
        return Math.round(data.population * 0.7); // 70% severely affected
      } else if (depth >= threshold.significant) {
        return Math.round(data.population * 0.4);
      } else if (depth >= threshold.minor) {
        return Math.round(data.population * 0.15);
      }
      return 0;
    },

    // Get economic damage (millions VND)
    getEconomicDamage(zone, depth, areaKm2) {
      const params = RISK_CONFIG.damageParams;
      const buildings = this.buildings[zone] || 0;

      // Residential damage
      const residentialDamage = buildings *
        (depth * params.residential.walls +
         depth * params.residential.contents +
         params.residential.cleanup) / 1000;

      // Agricultural damage
      const agriculturalDamage = areaKm2 * 100 * depth * params.agricultural;

      return residentialDamage + agriculturalDamage;
    }
  };

  // ============================================================================
  // RISK ENGINE
  // ============================================================================

  class RiskEngine {
    constructor(config = {}) {
      this.config = { ...RISK_CONFIG, ...config };
      this.populationData = PopulationData;
      this.mcModel = null; // ML hydrology model for ensemble
      this.assimilationManager = null; // Data assimilation for updated states
    }

    // Set ML model for predictions
    setMLModel(model) {
      this.mcModel = model;
    }

    // Set data assimilation manager
    setAssimilationManager(manager) {
      this.assimilationManager = manager;
    }

    // =========================================================================
    // MONTE CARLO SIMULATION
    // =========================================================================

    // Run Monte Carlo simulation for probabilistic risk
    async runMonteCarlo(gaugeId, forecastHorizon = 48, policy = null) {
      const results = {
        simulations: [],
        statistics: {},
        riskMetrics: {}
      };

      const ensemble = this._getParametricEnsemble(gaugeId, forecastHorizon, policy);
      // Shared deterministic draws for policy comparison. A common percentile across
      // each trajectory explicitly assumes perfect temporal error correlation.
      const random = window.FT.util.mulberry(42 + gaugeId.length * 7919);
      for (let sim = 0; sim < this.config.numSimulations; sim++) {
        const z = Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random()))) * Math.cos(2 * Math.PI * random());
        results.simulations.push(this._simulateScenario(ensemble, gaugeId, forecastHorizon, z));
      }
      results.provenance = 'SYNTHETIC analytic hydro; assumed perfectly correlated Gaussian errors and unverified impact coefficients';

      // Compute statistics
      results.statistics = this._computeStatistics(results.simulations);

      // Compute risk metrics
      results.riskMetrics = this._computeRiskMetrics(results.simulations, gaugeId);

      return results;
    }

    // Get ensemble from ML model
    async _getMLEnsemble(gaugeId, horizon) {
      // This would call the ML model in production
      // For now, return synthetic ensemble
      return this._getParametricEnsemble(gaugeId, horizon);
    }

    // Get parametric ensemble (fallback)
    _getParametricEnsemble(gaugeId, horizon, policy = null) {
      const FT = window.FT, H = FT.hydro;
      if (!H || !H.ready || !FT.data.GAUGES.some(g => g.id === gaugeId)) throw new Error('Gauge model not ready');
      const start = Math.max(0, FT.state.timeH);
      if (!Number.isInteger(horizon) || horizon < 1 || start + horizon > H.T1) throw new Error('Risk horizon exceeds forecast coverage');
      const e = H.ensemble(gaugeId, policy || H.viewSelection() || H._activeKey());
      return { median: Array.from({length: horizon}, (_, i) => H.sample(e.med, start + i + 1)),
        spread: Array.from({length: horizon}, (_, i) => H.sample(e.sigma, start + i + 1)) };
    }

    // Simulate single scenario
    _simulateScenario(ensemble, gaugeId, horizon, percentile = this.randn()) {
      const thresholds = this.config.alertLevelThresholds[gaugeId] || [6, 8, 10];
      const result = {
        maxStage: 0,
        peakTime: 0,
        alertLevels: [],
        stages: [],
        damages: {
          economic: 0,
          populationAffected: 0,
          criticalInfrastructure: []
        },
        events: []
      };

      for (let t = 0; t < horizon; t++) {
        // Sample from ensemble
        const stage = ensemble.median[t] + percentile * ensemble.spread[t];

        result.stages.push(stage);
        result.maxStage = Math.max(result.maxStage, stage);
        if (stage === result.maxStage) {
          result.peakTime = t + 1;
        }

        // Determine alert level
        let alertLevel = 0;
        if (stage >= thresholds[2]) alertLevel = 3;
        else if (stage >= thresholds[1]) alertLevel = 2;
        else if (stage >= thresholds[0]) alertLevel = 1;

        result.alertLevels.push(alertLevel);

        // Record events
        if (alertLevel === 3 && (result.alertLevels[t-1] || 0) < 3) {
          result.events.push({ type: 'ALERT_3', time: t + 1 });
        }
        if (alertLevel === 2 && (result.alertLevels[t-1] || 0) < 2) {
          result.events.push({ type: 'ALERT_2', time: t + 1 });
        }
      }

      // Estimate damages
      result.damages.economic = this._estimateEconomicDamage(result.maxStage);
      result.damages.populationAffected = this._estimatePopulationImpact(result.maxStage);
      result.damages.criticalInfrastructure = this._assessInfrastructureExposure(result.alertLevels);

      return result;
    }

    // Standard normal random
    randn() {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    // Estimate economic damage
    _estimateEconomicDamage(maxStage) {
      const zones = ['danang_inner', 'danang_outer', 'hoian', 'quangNam_coastal'];
      const areas = [37.5, 216.7, 60, 560];
      const damages = [15, 10, 5, 2]; // base damage multiplier by zone

      let total = 0;
      for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        const depth = this._getZoneDepth(zone, maxStage);
        total += this.populationData.getEconomicDamage(zone, depth, areas[i]) * damages[i];
      }

      return total; // millions VND
    }

    // Estimate population impact
    _estimatePopulationImpact(maxStage) {
      const zones = ['danang_inner', 'danang_outer', 'hoian', 'quangNam_coastal'];
      let total = 0;

      for (const zone of zones) {
        const depth = this._getZoneDepth(zone, maxStage);
        total += this.populationData.getAffectedPopulation(zone, depth);
      }

      return total;
    }

    // Get typical depth for zone given gauge level
    _getZoneDepth(zone, gaugeStage) {
      const depthMapping = {
        'danang_inner': gaugeStage * 0.3,
        'danang_outer': gaugeStage * 0.15,
        'hoian': gaugeStage * 0.25,
        'quangNam_coastal': gaugeStage * 0.1
      };
      return depthMapping[zone] || 0;
    }

    // Assess critical infrastructure exposure
    _assessInfrastructureExposure(alertLevels) {
      const results = [];
      const threshold = 2; // Alert level 2 or above

      for (const infra of this.config.criticalInfrastructure) {
        const affected = alertLevels.some(level => level >= threshold);
        results.push({
          id: infra.id,
          name: infra.name,
          type: infra.type,
          affected,
          alertLevel: affected ? 2 : 0
        });
      }

      return results;
    }

    // Compute statistics from simulations
    _computeStatistics(simulations) {
      const n = simulations.length;

      // Extract arrays
      const maxStages = simulations.map(s => s.maxStage);
      const damages = simulations.map(s => s.damages.economic);
      const populations = simulations.map(s => s.damages.populationAffected);

      return {
        stage: this._computeQuantiles(maxStages),
        economicDamage: this._computeQuantiles(damages),
        populationAffected: this._computeQuantiles(populations),

        // Exceedance probabilities
        pExceedStage7: this._computeExceedanceProb(maxStages, 7),
        pExceedStage8: this._computeExceedanceProb(maxStages, 8),
        pExceedStage9: this._computeExceedanceProb(maxStages, 9),

        // Expected values
        expectedDamage: damages.reduce((a, b) => a + b, 0) / n,
        expectedPopulation: Math.round(populations.reduce((a, b) => a + b, 0) / n)
      };
    }

    _computeQuantiles(arr) {
      const sorted = [...arr].sort((a, b) => a - b);
      const n = sorted.length;

      return {
        min: sorted[0],
        q05: sorted[Math.floor(n * 0.05)],
        q25: sorted[Math.floor(n * 0.25)],
        median: sorted[Math.floor(n * 0.5)],
        mean: arr.reduce((a, b) => a + b, 0) / n,
        q75: sorted[Math.floor(n * 0.75)],
        q95: sorted[Math.floor(n * 0.95)],
        max: sorted[n - 1]
      };
    }

    _computeExceedanceProb(arr, threshold) {
      const count = arr.filter(v => v >= threshold).length;
      return count / arr.length;
    }

    // Compute risk metrics
    _computeRiskMetrics(simulations, gaugeId) {
      const thresholds = this.config.alertLevelThresholds[gaugeId] || [6, 8, 10];

      return {
        // Probability of exceeding each alert level
        pAlert1: this._computeExceedanceProb(
          simulations.map(s => s.maxStage), thresholds[0]
        ),
        pAlert2: this._computeExceedanceProb(
          simulations.map(s => s.maxStage), thresholds[1]
        ),
        pAlert3: this._computeExceedanceProb(
          simulations.map(s => s.maxStage), thresholds[2]
        ),

        // Expected time to alert levels
        expectedTimeToAlert1: this._computeExpectedTime(simulations, thresholds[0]),
        expectedTimeToAlert2: this._computeExpectedTime(simulations, thresholds[1]),
        expectedTimeToAlert3: this._computeExpectedTime(simulations, thresholds[2]),

        // Risk score (0-100)
        riskScore: this._computeRiskScore(simulations, thresholds[2])
      };
    }

    _computeExpectedTime(simulations, threshold) {
      const times = [];

      for (const sim of simulations) {
        for (let t = 0; t < sim.stages.length; t++) {
          if (sim.stages[t] >= threshold) {
            times.push(t + 1);
            break;
          }
        }
      }

      if (times.length === 0) return null;
      return times.reduce((a, b) => a + b, 0) / times.length;
    }

    _computeRiskScore(simulations, alert3Threshold) {
      // Combine multiple factors into 0-100 score
      const maxStageProb = this._computeExceedanceProb(
        simulations.map(s => s.maxStage), alert3Threshold
      );
      const damageProb = this._computeExceedanceProb(
        simulations.map(s => s.damages.economic), 1000 // million VND
      );
      const populationProb = this._computeExceedanceProb(
        simulations.map(s => s.damages.populationAffected), 10000
      );

      // Weighted combination
      const score = (maxStageProb * 40 + damageProb * 35 + populationProb * 25);
      return Math.round(Math.min(100, score));
    }

    // =========================================================================
    // SCENARIO COMPARISON
    // =========================================================================

    // Compare Rule vs MPC policy
    async comparePolicies(gaugeId, forecastHorizon = 48) {
      const [ruleResults, mpcResults] = await Promise.all([
        this.runMonteCarlo(gaugeId, forecastHorizon, 'rule'),
        this.runMonteCarlo(gaugeId, forecastHorizon, 'mpc')
      ]);

      // Calculate benefits
      const benefit = {
        peakReduction: ruleResults.statistics.stage.median - mpcResults.statistics.stage.median,
        damageReduction: ruleResults.statistics.economicDamage.median - mpcResults.statistics.economicDamage.median,
        populationReduction: ruleResults.statistics.populationAffected.median - mpcResults.statistics.populationAffected.median,
        alert2Reduction: ruleResults.riskMetrics.pAlert2 - mpcResults.riskMetrics.pAlert2,
        alert3Reduction: ruleResults.riskMetrics.pAlert3 - mpcResults.riskMetrics.pAlert3
      };

      return {
        rule: ruleResults,
        mpc: mpcResults,
        benefit,
        recommendation: this._generateRecommendation(benefit)
      };
    }

    _generateRecommendation(benefit) {
      const recs = [];

      if (benefit.peakReduction > 0.5) {
        recs.push({
          action: 'MPC_PRE_RELEASE',
          confidence: 'low',
          description: 'MPC pre-release significantly reduces peak stage',
          evidence: `Peak reduction: ${benefit.peakReduction.toFixed(1)}m`
        });
      }

      if (benefit.damageReduction > 500) {
        recs.push({
          action: 'MPC_DAMAGE_REDUCTION',
          confidence: 'low',
          description: 'MPC reduces expected economic damage',
          evidence: `Damage reduction: ${Math.round(benefit.damageReduction)}M VND`
        });
      }

      if (benefit.alert3Reduction > 0.05) {
        recs.push({
          action: 'MPC_ALERT_REDUCTION',
          confidence: 'low',
          description: 'MPC reduces probability of exceeding Alert Level 3',
          evidence: `AL3 probability reduction: ${(benefit.alert3Reduction * 100).toFixed(0)}%`
        });
      }

      return recs;
    }

    // =========================================================================
    // RISK DASHBOARD DATA
    // =========================================================================

    // Generate risk dashboard data
    async getRiskDashboard(gaugeId, forecastHorizon = 48) {
      const mcResults = await this.runMonteCarlo(gaugeId, forecastHorizon);
      const stats = mcResults.statistics;
      const metrics = mcResults.riskMetrics;

      return {
        provenance: mcResults.provenance, calibrated: false,
        // Current assessment
        currentRisk: {
          level: metrics.riskScore < 30 ? 'low' : metrics.riskScore < 60 ? 'moderate' : 'high',
          score: metrics.riskScore,
          description: this._getRiskDescription(metrics.riskScore)
        },

        // Alert level probabilities
        alertProbabilities: {
          alert1: Math.round(metrics.pAlert1 * 100),
          alert2: Math.round(metrics.pAlert2 * 100),
          alert3: Math.round(metrics.pAlert3 * 100)
        },

        // Peak stage forecast
        peakStage: {
          expected: stats.stage.median.toFixed(1),
          range: `${stats.stage.q05.toFixed(1)} - ${stats.stage.q95.toFixed(1)}`,
          worst: stats.stage.q95.toFixed(1),
          probability: {
            below8: Math.round((1 - stats.pExceedStage8) * 100),
            below9: Math.round((1 - stats.pExceedStage9) * 100)
          }
        },

        // Impact estimates
        impacts: {
          economic: {
            expected: Math.round(stats.economicDamage.median),
            range: `${Math.round(stats.economicDamage.q25)} - ${Math.round(stats.economicDamage.q95)}`,
            unit: 'Million VND'
          },
          population: {
            expected: stats.populationAffected.median,
            range: `${stats.populationAffected.q25} - ${stats.populationAffected.q95}`,
            unit: 'people'
          }
        },

        // Timeline
        timeline: {
          timeToAlert1: metrics.expectedTimeToAlert1 ?
            `${Math.round(metrics.expectedTimeToAlert1)}h` : 'Not expected',
          timeToAlert2: metrics.expectedTimeToAlert2 ?
            `${Math.round(metrics.expectedTimeToAlert2)}h` : 'Not expected',
          timeToAlert3: metrics.expectedTimeToAlert3 ?
            `${Math.round(metrics.expectedTimeToAlert3)}h` : 'Not expected'
        },

        // Critical infrastructure
        criticalInfrastructure: mcResults.simulations[0].damages.criticalInfrastructure,

        // Monte Carlo details
        mcDetails: {
          numSimulations: this.config.numSimulations,
          horizon: forecastHorizon
        }
      };
    }

    _getRiskDescription(score) {
      if (score < 30) return 'Rủi ro thấp - Tình trạng bình thường';
      if (score < 60) return 'Rủi ro trung bình - Cần theo dõi';
      if (score < 80) return 'Rủi ro cao - Cần chuẩn bị ứng phó';
      return 'Rủi ro rất cao - Nguy cơ thiệt hại nghiêm trọng';
    }
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  AI.RiskEngine = RiskEngine;
  AI.PopulationData = PopulationData;
  AI.RISK_CONFIG = RISK_CONFIG;

  console.log('[FloodTwin AI] Risk Assessment module loaded');

})();
