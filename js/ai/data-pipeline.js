/* FloodTwin AI — Data Pipeline Module
   Handles data collection, processing, and storage for CAMELS-VN format.

   Data Sources:
   - NASA IMERG/GPM (rainfall)
   - USGS/CAMELS (model architectures)
   - Google Earth Engine (Sentinel, terrain)
   - Vietnam hydrology databases (when available)
*/

(function() {
  "use strict";

  const AI = window.FT.AI || {};
  window.FT = window.FT || {};
  window.FT.AIData = {};

  // ============================================================================
  // DATA SOURCE CONFIGURATION
  // ============================================================================

  const DataConfig = {
    // CAMELS-VN Basins
    basins: {
      'vgtb': {
        id: 'vgtb',
        name: 'Vu Gia - Thu Bon',
        bounds: {
          minLon: 107.5,
          maxLon: 108.5,
          minLat: 15.3,
          maxLat: 16.2
        },
        gauges: [
          { id: 'aiNghia', lat: 15.882, lon: 108.105, area: 2650 },
          { id: 'cauLau', lat: 15.858, lon: 108.262, area: 3520 },
          { id: 'giaoThuy', lat: 15.788, lon: 108.135, area: 4100 },
          { id: 'camLe', lat: 16.005, lon: 108.200, area: 4800 }
        ],
        reservoirs: [
          { id: 'avuong', lat: 15.805, lon: 107.59, area: 450 },
          { id: 'songbung4', lat: 15.745, lon: 107.68, area: 650 },
          { id: 'dakmi4', lat: 15.44, lon: 107.79, area: 580 },
          { id: 'songtranh2', lat: 15.345, lon: 108.12, area: 820 }
        ]
      }
    },

    // Data API endpoints
    apis: {
      imerg: {
        baseUrl: 'https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3',
        product: 'GPM_3IMERGDL.06',
        resolution: '0.1deg',
        temporal: '30min'
      },
      chirps: {
        baseUrl: 'https://data.chc.ucsb.edu',
        product: 'CHIRPS/daily',
        resolution: '0.05deg'
      },
      gee: {
        // Google Earth Engine datasets
        sentinel1: 'COPERNICUS/S1_GRD',
        dem: 'USGS/SRTMGL1_003',
        worldcover: 'ESA/WorldCover/v200'
      },
      vietnam: {
        // Placeholder for Vietnam data APIs (when available)
        nchmf: 'https://nchmf.gov.vn/api',
        monre: 'https://monre.gov.vn/api'
      }
    },

    // Cache settings
    cache: {
      enabled: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      storageKey: 'floodtwin_data_cache'
    }
  };

  // ============================================================================
  // DATA PIPELINE
  // ============================================================================

  class DataPipeline {
    constructor(config = {}) {
      this.config = { ...DataConfig, ...config };
      this.cache = new DataCache(this.config.cache);
      this.processors = {};

      this.initProcessors();
    }

    initProcessors() {
      // Rainfall processor
      this.processors.rainfall = new RainfallProcessor();

      // Streamflow processor
      this.processors.streamflow = new StreamflowProcessor();

      // Temperature/humidity processor
      this.processors.meteorology = new MeteorologyProcessor();

      // Catchment attributes processor
      this.processors.attributes = new AttributeProcessor();
    }

    // Fetch rainfall from IMERG
    async fetchIMERGRainfall(bounds, startDate, endDate) {
      const cacheKey = `imerg_${bounds.minLon}_${bounds.minLat}_${startDate}_${endDate}`;

      // Check cache
      if (this.cache.enabled) {
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;
      }

      console.log('[DataPipeline] Fetching IMERG rainfall...');

      // For demo: generate synthetic data with realistic patterns
      // In production: use actual GES DISC API
      const data = this.processors.rainfall.generateSyntheticIMERG(bounds, startDate, endDate);

      // Cache result
      if (this.cache.enabled) {
        this.cache.set(cacheKey, data);
      }

      return data;
    }

    // Fetch streamflow observations
    async fetchStreamflow(gaugeId, startDate, endDate) {
      const cacheKey = `streamflow_${gaugeId}_${startDate}_${endDate}`;

      if (this.cache.enabled) {
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;
      }

      console.log('[DataPipeline] Fetching streamflow data...');

      // Generate synthetic data with realistic patterns
      const data = this.processors.streamflow.generateSynthetic(gaugeId, startDate, endDate);

      if (this.cache.enabled) {
        this.cache.set(cacheKey, data);
      }

      return data;
    }

    // Fetch meteorology data
    async fetchMeteorology(bounds, startDate, endDate) {
      const cacheKey = `meteorology_${bounds.minLon}_${bounds.minLat}_${startDate}_${endDate}`;

      if (this.cache.enabled) {
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;
      }

      console.log('[DataPipeline] Fetching meteorology data...');

      const data = this.processors.meteorology.generateSynthetic(bounds, startDate, endDate);

      if (this.cache.enabled) {
        this.cache.set(cacheKey, data);
      }

      return data;
    }

    // Build complete CAMELS-VN dataset for a basin
    async buildCAMELSDataset(basinId, options = {}) {
      const {
        startDate = '2018-01-01',
        endDate = '2024-12-31',
        resolution = 'daily' // 'hourly' or 'daily'
      } = options;

      if (resolution !== 'daily') throw new Error('Synthetic local source supports daily resolution only; import hourly data explicitly');
      if (!Number.isFinite(+new Date(startDate)) || !Number.isFinite(+new Date(endDate)) || new Date(startDate) > new Date(endDate)) throw new Error('Invalid data period');
      const basin = this.config.basins[basinId];
      if (!basin) {
        throw new Error(`Basin ${basinId} not found`);
      }

      console.log(`[DataPipeline] Building CAMELS-VN dataset for ${basin.name}...`);
      console.log(`[DataPipeline] Period: ${startDate} to ${endDate}, Resolution: ${resolution}`);

      // Fetch all data types in parallel
      const [rainfall, meteorology, streamflow] = await Promise.all([
        this.fetchIMERGRainfall(basin.bounds, startDate, endDate),
        this.fetchMeteorology(basin.bounds, startDate, endDate),
        this.fetchGaugeData(basin.gauges, startDate, endDate)
      ]);

      // Build forcing dataset
      const forcing = this.buildForcingDataset(rainfall, meteorology, resolution);

      // Build observation dataset
      const observations = this.buildObservationDataset(streamflow, resolution);

      // Build attributes
      const attributes = this.buildAttributeDataset(basin);

      return {
        basinId,
        basinName: basin.name,
        period: { start: startDate, end: endDate },
        resolution,
        forcing,
        observations,
        attributes,
        metadata: {
          created: new Date().toISOString(),
          version: '1.0.0',
          source: 'SYNTHETIC local generator; not downloaded IMERG or measured gauges',
          synthetic: true, stepHours: 24
        }
      };
    }

    // Fetch data from multiple gauges
    async fetchGaugeData(gauges, startDate, endDate) {
      const results = {};

      for (const gauge of gauges) {
        try {
          results[gauge.id] = await this.fetchStreamflow(gauge.id, startDate, endDate);
        } catch (e) {
          console.error(`[DataPipeline] Failed to fetch ${gauge.id}:`, e);
        }
      }

      return results;
    }

    // Build forcing dataset
    buildForcingDataset(rainfall, meteorology, resolution) {
      const forcing = {
        dates: [],
        precipitation: [],
        temperature: [],
        humidity: [],
        radiation: [],
        wind: []
      };

      const timestamps = this.getTimestamps(
        rainfall.startDate,
        rainfall.endDate,
        resolution
      );

      for (let i = 0; i < timestamps.length; i++) {
        forcing.dates.push(timestamps[i]);

        // Aggregate rainfall
        const dayRain = rainfall.data
          .filter(r => this.isSameDay(r.timestamp, timestamps[i], resolution))
          .reduce((sum, r) => sum + r.precipitation, 0);
        forcing.precipitation.push(dayRain);

        // Average meteorology
        const dayMet = meteorology.data
          .filter(m => this.isSameDay(m.timestamp, timestamps[i], resolution));

        forcing.temperature.push(
          dayMet.length > 0
            ? dayMet.reduce((s, m) => s + m.temperature, 0) / dayMet.length
            : 28
        );

        forcing.humidity.push(
          dayMet.length > 0
            ? dayMet.reduce((s, m) => s + m.humidity, 0) / dayMet.length
            : 0.75
        );

        forcing.radiation.push(
          dayMet.length > 0
            ? dayMet.reduce((s, m) => s + m.radiation, 0) / dayMet.length
            : 200
        );

        forcing.wind.push(
          dayMet.length > 0
            ? dayMet.reduce((s, m) => s + m.wind, 0) / dayMet.length
            : 2.5
        );
      }

      return forcing;
    }

    // Build observation dataset
    buildObservationDataset(streamflow, resolution) {
      const observations = {
        dates: [],
        gauges: {}
      };

      // Initialize gauge data
      for (const [gaugeId, data] of Object.entries(streamflow)) {
        observations.gauges[gaugeId] = {
          discharge: [],
          stage: [],
          quality: []
        };
      }

      // Get all unique timestamps
      const allTimestamps = new Set();
      for (const data of Object.values(streamflow)) {
        for (const d of data) {
          allTimestamps.add(new Date(d.timestamp).getTime());
        }
      }
      const timestamps = Array.from(allTimestamps).sort((a, b) => a - b);

      for (const ts of timestamps) {
        observations.dates.push(new Date(ts));

        for (const [gaugeId, data] of Object.entries(streamflow)) {
          const record = data.find(d => new Date(d.timestamp).getTime() === ts);

          observations.gauges[gaugeId].discharge.push(record?.discharge ?? null);
          observations.gauges[gaugeId].stage.push(record?.stage ?? null);
          observations.gauges[gaugeId].quality.push(record?.quality || 0);
        }
      }

      return observations;
    }

    // Build attribute dataset
    buildAttributeDataset(basin) {
      const attributes = {
        basin_id: basin.id,
        basin_name: basin.name,
        gauges: [],
        reservoirs: []
      };

      // Gauge attributes
      for (const g of basin.gauges) {
        attributes.gauges.push({
          gauge_id: g.id,
          latitude: g.lat,
          longitude: g.lon,
          drainage_area_km2: g.area,
          elevation_m: this.estimateElevation(g.lat, g.lon)
        });
      }

      // Reservoir attributes (from existing data.js)
      for (const r of basin.reservoirs) {
        attributes.reservoirs.push({
          reservoir_id: r.id,
          latitude: r.lat,
          longitude: r.lon,
          drainage_area_km2: r.area
        });
      }

      return attributes;
    }

    // Helper: Get timestamps
    getTimestamps(startDate, endDate, resolution) {
      const timestamps = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      const inc = resolution === 'hourly' ? 3600000 : 86400000;

      for (let t = start.getTime(); t <= end.getTime(); t += inc) {
        timestamps.push(new Date(t));
      }

      return timestamps;
    }

    // Helper: Check if same day
    isSameDay(ts1, ts2, resolution) {
      if (resolution === 'daily') {
        return new Date(ts1).toISOString().slice(0, 10) === new Date(ts2).toISOString().slice(0, 10);
      }
      // For hourly, check within 30 minutes
      return Math.abs(ts1 - ts2) < 1800000;
    }

    // Estimate elevation from coordinates
    estimateElevation(lat, lon) {
      // Simplified elevation estimation
      // Coastal areas lower, mountainous areas higher
      const baseElev = 10;
      const latEffect = Math.max(0, 16 - lat) * 200;
      const lonEffect = Math.max(0, 108.5 - lon) * 100;
      return baseElev + latEffect + lonEffect;
    }

    // Export dataset to CSV format
    exportToCSV(dataset) {
      const lines = [];

      // Header
      lines.push('# CAMELS-VN Dataset Export');
      lines.push(`# Basin: ${dataset.basinName}`);
      lines.push(`# Period: ${dataset.period.start} to ${dataset.period.end}`);
      lines.push(`# Resolution: ${dataset.resolution}`);
      lines.push('# Generated:', dataset.metadata.created);
      lines.push('');

      // Forcing data
      lines.push('# FORCING DATA');
      lines.push('date,precipitation_mm,temperature_C,humidity,w radiation,w wind');

      for (let i = 0; i < dataset.forcing.dates.length; i++) {
        lines.push([
          dataset.forcing.dates[i].toISOString().split('T')[0],
          dataset.forcing.precipitation[i].toFixed(2),
          dataset.forcing.temperature[i].toFixed(1),
          dataset.forcing.humidity[i].toFixed(3),
          dataset.forcing.radiation[i].toFixed(1),
          dataset.forcing.wind[i].toFixed(1)
        ].join(','));
      }

      return lines.join('\n');
    }

    // Export to JSON format
    exportToJSON(dataset) {
      return JSON.stringify(dataset, (key, value) => {
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      }, 2);
    }

    // Clear cache
    clearCache() {
      this.cache.clear();
      console.log('[DataPipeline] Cache cleared');
    }
  }

  // ============================================================================
  // DATA PROCESSORS
  // ============================================================================

  class RainfallProcessor {
    constructor() {
      this.name = 'Rainfall';
    }

    generateSyntheticIMERG(bounds, startDate, endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const data = [];

      let currentDate = new Date(start);
      while (currentDate <= end) {
        // Tropical monsoon pattern
        const dayOfYear = this.getDayOfYear(currentDate);
        const seasonalFactor = this.getMonsoonIntensity(dayOfYear);

        // Probability of rain
        const rainProb = Math.max(0.05, 0.3 + 0.5 * seasonalFactor);

        // Daily rainfall
        let rainfall = 0;
        if (Math.random() < rainProb) {
          // Gamma distribution for rainfall amounts
          const intensity = this.sampleGamma(2 + seasonalFactor * 3, 5 + seasonalFactor * 10);
          rainfall = Math.min(200, intensity);
        }

        data.push({
          timestamp: new Date(currentDate),
          date: currentDate.toISOString().split('T')[0],
          latitude: bounds.minLat + Math.random() * (bounds.maxLat - bounds.minLat),
          longitude: bounds.minLon + Math.random() * (bounds.maxLon - bounds.minLon),
          precipitation: rainfall
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return {
        startDate: start,
        endDate: end,
        bounds,
        data
      };
    }

    getMonsoonIntensity(dayOfYear) {
      // Vietnam monsoon: peak Oct-Dec, secondary peak May-Jun
      const normalized = dayOfYear / 365;

      // Primary monsoon (Oct-Dec)
      if (normalized > 0.75) {
        return Math.sin((normalized - 0.75) * Math.PI / 0.25) * 0.8;
      }

      // Secondary (May-Jun)
      if (normalized > 0.35 && normalized < 0.5) {
        return 0.3;
      }

      // Dry season
      return -0.3;
    }

    sampleGamma(shape, scale) {
      // Simple gamma sampling using Marsaglia and Tsang's method
      if (shape < 1) {
        return this.sampleGamma(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
      }

      const d = shape - 1/3;
      const c = 1 / Math.sqrt(9 * d);

      while (true) {
        let x, v;
        do {
          x = this.randn();
          v = 1 + c * x;
        } while (v <= 0);

        v = v * v * v;
        const u = Math.random();

        if (u < 1 - 0.0331 * (x * x) * (x * x)) {
          return d * v * scale;
        }

        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
          return d * v * scale;
        }
      }
    }

    randn() {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    getDayOfYear(date) {
      const start = new Date(date.getFullYear(), 0, 0);
      const diff = date - start;
      return Math.floor(diff / 86400000);
    }
  }

  class StreamflowProcessor {
    constructor() {
      this.name = 'Streamflow';
      this.gaugeParams = {
        aiNghia: { baseFlow: 150, floodPeak: 8000, responseTime: 8, basinScale: 1.0 },
        cauLau: { baseFlow: 120, floodPeak: 6000, responseTime: 12, basinScale: 1.3 },
        giaoThuy: { baseFlow: 180, floodPeak: 7000, responseTime: 10, basinScale: 1.5 },
        camLe: { baseFlow: 40, floodPeak: 2000, responseTime: 6, basinScale: 0.8 }
      };
    }

    generateSynthetic(gaugeId, startDate, endDate) {
      const params = this.gaugeParams[gaugeId] || this.gaugeParams.aiNghia;
      const start = new Date(startDate);
      const end = new Date(endDate);
      const data = [];

      // Initialize state variables
      let soilMoisture = 0.5;
      let baseFlow = params.baseFlow;
      let trend = 0;

      let currentDate = new Date(start);
      while (currentDate <= end) {
        const dayOfYear = this.getDayOfYear(currentDate);
        const seasonalFactor = this.getSeasonality(dayOfYear);

        // Update soil moisture (antecedent wetness)
        const rainChance = Math.max(0.1, 0.3 + seasonalFactor);
        if (Math.random() < rainChance) {
          const rainAmount = this.sampleExponential(5 + seasonalFactor * 15);
          soilMoisture = Math.min(1.0, soilMoisture + rainAmount * 0.01);
        }
        soilMoisture = Math.max(0.2, soilMoisture - 0.005);

        // Runoff factor
        const runoffFactor = 0.3 + 0.7 * soilMoisture;

        // Base flow with seasonality
        const seasonalBase = baseFlow * (0.8 + 0.4 * seasonalFactor);

        // Event-driven peaks
        let discharge = seasonalBase;
        if (Math.random() < rainChance * 0.3) {
          const peak = params.floodPeak * runoffFactor * (0.5 + Math.random() * 0.5);
          discharge += peak;
        }

        // Add noise
        discharge *= (0.9 + Math.random() * 0.2);
        discharge = Math.max(10, discharge);

        // Update base flow (AR process)
        baseFlow = 0.95 * baseFlow + 0.05 * seasonalBase;

        // Calculate stage from discharge (rating curve)
        const stage = this.dischargeToStage(discharge, gaugeId);

        // Quality flag (simulate gaps)
        const quality = Math.random() > 0.02 ? 2 : (Math.random() > 0.5 ? 1 : 0);

        data.push({
          timestamp: new Date(currentDate),
          date: currentDate.toISOString().split('T')[0],
          discharge: Math.round(discharge),
          stage: Math.round(stage * 100) / 100,
          quality
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return data;
    }

    getSeasonality(dayOfYear) {
      // Tropical seasonality: wet season Oct-Dec, dry season Feb-Apr
      const normalized = dayOfYear / 365;

      if (normalized > 0.7 || normalized < 0.15) {
        // Wet season
        return Math.sin((normalized - 0.7) * Math.PI / 0.25) * 0.6;
      } else if (normalized > 0.4 && normalized < 0.6) {
        // Dry/hot season
        return -0.3;
      }

      return 0.1;
    }

    sampleExponential(lambda) {
      return -Math.log(1 - Math.random()) / lambda;
    }

    dischargeToStage(Q, gaugeId) {
      // Power law rating curve
      const params = {
        aiNghia: { a: 0.45, b: 0.32, offset: 2.5 },
        cauLau: { a: 0.38, b: 0.35, offset: 0.5 },
        giaoThuy: { a: 0.52, b: 0.30, offset: 2.0 },
        camLe: { a: 0.28, b: 0.38, offset: 0.3 }
      };

      const p = params[gaugeId] || { a: 0.4, b: 0.33, offset: 1.5 };
      return p.offset + p.a * Math.pow(Math.max(0, Q), p.b);
    }

    getDayOfYear(date) {
      const start = new Date(date.getFullYear(), 0, 0);
      const diff = date - start;
      return Math.floor(diff / 86400000);
    }
  }

  class MeteorologyProcessor {
    constructor() {
      this.name = 'Meteorology';
    }

    generateSynthetic(bounds, startDate, endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const data = [];

      let currentDate = new Date(start);
      while (currentDate <= end) {
        const dayOfYear = this.getDayOfYear(currentDate);
        const hour = 12; // Daily average
        const seasonalFactor = this.getSeasonality(dayOfYear);

        // Temperature
        const baseTemp = 28;
        const tempSeasonal = seasonalFactor * 4;
        const tempDaily = Math.sin((hour - 6) * Math.PI / 12) * 3;
        const temperature = baseTemp + tempSeasonal + tempDaily + (Math.random() - 0.5) * 2;

        // Humidity
        const baseHumidity = 0.75;
        const humiditySeasonal = -seasonalFactor * 0.1;
        const humidity = Math.max(0.4, Math.min(1.0, baseHumidity + humiditySeasonal + (Math.random() - 0.5) * 0.1));

        // Radiation
        const baseRadiation = 200;
        const radiationSeasonal = seasonalFactor * 30;
        const radiation = Math.max(50, baseRadiation + radiationSeasonal + (Math.random() - 0.5) * 50);

        // Wind
        const wind = 2 + Math.random() * 3 + Math.abs(seasonalFactor) * 2;

        data.push({
          timestamp: new Date(currentDate),
          date: currentDate.toISOString().split('T')[0],
          latitude: bounds.minLat + Math.random() * (bounds.maxLat - bounds.minLat),
          longitude: bounds.minLon + Math.random() * (bounds.maxLon - bounds.minLon),
          temperature: Math.round(temperature * 10) / 10,
          humidity: Math.round(humidity * 1000) / 1000,
          radiation: Math.round(radiation),
          wind: Math.round(wind * 10) / 10
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return {
        startDate: start,
        endDate: end,
        bounds,
        data
      };
    }

    getSeasonality(dayOfYear) {
      const normalized = dayOfYear / 365;

      // Coolest: Dec-Jan, Hottest: Apr-May
      if (normalized > 0.9 || normalized < 0.1) return -1;
      if (normalized > 0.25 && normalized < 0.4) return 1;
      if (normalized > 0.7) return 0.5;
      if (normalized > 0.5 && normalized < 0.7) return 0;

      return -0.3;
    }

    getDayOfYear(date) {
      const start = new Date(date.getFullYear(), 0, 0);
      const diff = date - start;
      return Math.floor(diff / 86400000);
    }
  }

  class AttributeProcessor {
    constructor() {
      this.name = 'Attributes';
    }
  }

  // ============================================================================
  // DATA CACHE
  // ============================================================================

  class DataCache {
    constructor(config) {
      this.enabled = config?.enabled !== false;
      this.maxAge = config?.maxAge || 24 * 60 * 60 * 1000;
      this.storageKey = config?.storageKey || 'floodtwin_cache';
    }

    get(key) {
      if (!this.enabled) return null;

      try {
        const cached = localStorage.getItem(`${this.storageKey}_${key}`);
        if (!cached) return null;

        const { data, timestamp } = JSON.parse(cached, (key, value) =>
          ['timestamp', 'startDate', 'endDate'].includes(key) && typeof value === 'string' ? new Date(value) : value);

        if (Date.now() - timestamp > this.maxAge) {
          this.remove(key);
          return null;
        }

        return data;
      } catch (e) {
        return null;
      }
    }

    set(key, data) {
      if (!this.enabled) return;

      try {
        const cacheEntry = {
          data,
          timestamp: Date.now()
        };
        localStorage.setItem(
          `${this.storageKey}_${key}`,
          JSON.stringify(cacheEntry)
        );
      } catch (e) {
        console.warn('[DataCache] Failed to cache:', e);
      }
    }

    remove(key) {
      try {
        localStorage.removeItem(`${this.storageKey}_${key}`);
      } catch (e) {}
    }

    clear() {
      try {
        const keys = Object.keys(localStorage);
        for (const key of keys) {
          if (key.startsWith(this.storageKey)) {
            localStorage.removeItem(key);
          }
        }
      } catch (e) {}
    }
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  window.FT.AIData.DataPipeline = DataPipeline;
  window.FT.AIData.DataConfig = DataConfig;

  console.log('[FloodTwin AI] Data Pipeline module loaded');

})();
