/* FloodTwin — normalized scientific explainability state.
   This module reads physical/domain state only. Rendering state is not a data source. */
(function () {
  "use strict";

  const FT = window.FT;
  const D = FT.data;
  const CONTRACT = "floodtwin.explain/v1";
  const QUANTITY_SCHEMA = "eng-quantity-envelope/1";
  const MODEL_VERSION = "swe-144-1";
  const PROVENANCE = new Set(["MEASURED", "FORECAST", "MODELLED", "ASSUMED", "SYNTHETIC"]);
  const REASON_CATEGORIES = Object.freeze(["MISSING_DATA", "STALE", "QUALITY_REJECTED", "MODEL_FAILURE", "UNSUPPORTED_PHYSICS", "PLANNED"]);
  const REASONS = new Set(REASON_CATEGORIES);
  let current = null;

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
  }

  function scenarioTime(tH, semantics) {
    const anchor = D.SCENARIOS[FT.state.scenario].anchor;
    const ms = Date.UTC(anchor.y, anchor.m - 1, anchor.d, anchor.h) + tH * 3600e3;
    return { tH, iso: new Date(ms).toISOString(), semantics };
  }

  function quantityForDependency(id) {
    if (!id) return null;
    if (id.startsWith("H:")) return "gauge_stage";
    if (id.startsWith("Z:")) return "reservoir_stage";
    return {
      rain: "basin_rainfall",
      qpf: "ensemble_rainfall_forecast",
      tide: "tide_stage",
      gates: "gate_position",
    }[id] || null;
  }

  function lastValidTime(feed) {
    if (!feed) return null;
    const timestamp = feed.last_valid_time || feed.lastValidTime || feed.valid_time || feed.timestamp;
    if (timestamp && Number.isFinite(timestamp.tH)) {
      return { ...timestamp, semantics: timestamp.semantics || "last_valid_source_time" };
    }
    if (Number.isFinite(feed.ageMin)) return scenarioTime(FT.state.timeH - feed.ageMin / 60, "last_valid_source_time");
    return null;
  }

  function degradedDependency(health, level) {
    const feeds = Array.isArray(health.feeds) ? health.feeds : [];
    const named = health.missingCritical
      ? feeds.find((feed) => feed.id === health.missingCritical || feed.name === health.missingCritical)
      : null;
    const threshold = level === 1 ? 15 : 60;
    const feed = named || feeds.find((candidate) => Number.isFinite(candidate.ageMin) && candidate.ageMin > threshold) || null;
    return {
      id: feed ? feed.id : null,
      quantity: feed ? quantityForDependency(feed.id) : null,
      lastValid: lastValidTime(feed),
    };
  }

  function healthState() {
    const health = FT.ops && FT.ops.health ? FT.ops.health() : { level: 0, oldest: 0, missingCritical: null };
    const level = health.level || 0;
    const fallbackReason = level === 0 ? null : level === 1 || level === 3 ? "STALE" : "MISSING_DATA";
    const reasonCategory = REASONS.has(health.reasonCode) ? health.reasonCode : fallbackReason;
    const oldest = health.oldest || 0;
    const unavailable = level === 4 || reasonCategory === "QUALITY_REJECTED" || reasonCategory === "MODEL_FAILURE";
    const dependency = level === 0 ? { id: null, quantity: null, lastValid: null } : degradedDependency(health, level);
    return {
      level,
      status: level === 0 ? "AVAILABLE" : unavailable ? "UNAVAILABLE_FOR_OPERATIONS" : "DEGRADED",
      reason: reasonCategory,
      reason_category: reasonCategory,
      oldest_age_min: oldest,
      missing_quantity: dependency.quantity,
      missing_dependency: dependency.id,
      last_valid_time: dependency.lastValid,
      confidence_effect: level === 0 ? "BASELINE_LOW_DEMO_CONFIDENCE" : unavailable ? "UNAVAILABLE_FOR_OPERATIONS" : "CONFIDENCE_REDUCED",
      permitted_use: level === 0 ? "DEMO_ONLY" : "DEMO_ONLY_NO_OPERATIONAL_DECISIONS",
    };
  }

  function feedAge(feedId) {
    const health = FT.ops && FT.ops.health ? FT.ops.health() : null;
    const feed = health && health.feeds ? health.feeds.find((item) => item.id === feedId) : null;
    return feed && Number.isFinite(feed.ageMin) ? feed.ageMin : null;
  }

  function modelAvailability(dataHealth) {
    if (dataHealth.level === 0) return { status: "AVAILABLE", reason: null, confidence: "LOW" };
    if (dataHealth.status === "UNAVAILABLE_FOR_OPERATIONS") {
      return { status: dataHealth.status, reason: dataHealth.reason_category, confidence: "UNAVAILABLE" };
    }
    return { status: "DEGRADED", reason: dataHealth.reason_category, confidence: "VERY_LOW" };
  }

  function spatialSupport(xKm, yKm, options) {
    const o = options || {};
    const ix = FT.world.km2i(xKm), iy = FT.world.km2i(yKm);
    return {
      support_type: "GRID_CELL",
      crs: "EPSG:4326 projected to FloodTwin local kilometre coordinates",
      vertical_datum: o.vertical_datum || "UNSPECIFIED",
      grid_id: `swe-${D.DOMAIN.N}`,
      feature_id: null,
      cell_id: `${ix}:${iy}`,
      resolution_m: D.DOMAIN.cellKm * 1000,
      interpolation: o.interpolation || "NONE",
      no_data_semantics: o.no_data_semantics || "null means unavailable or not computed",
    };
  }

  function featureSupport(kind, id, options) {
    const o = options || {};
    return {
      support_type: "FEATURE",
      crs: "EPSG:4326 projected to FloodTwin local kilometre coordinates",
      vertical_datum: o.vertical_datum || "NOT_APPLICABLE",
      grid_id: null,
      feature_id: id,
      resolution_m: null,
      interpolation: o.interpolation || "FEATURE_LOOKUP",
      no_data_semantics: o.no_data_semantics || `null means ${kind} state is unavailable or not computed`,
    };
  }

  function quantity(key, value, unit, options) {
    const o = options || {};
    const provenance = o.provenance || "SYNTHETIC";
    if (!PROVENANCE.has(provenance)) throw new TypeError(`Invalid provenance for ${key}: ${provenance}`);
    const validTime = o.valid_time || scenarioTime(FT.state.timeH, "simulation_valid_time");
    const issueTime = o.issue_time || scenarioTime(0, "scenario_reference_time");
    const support = o.spatial_support || featureSupport("quantity", key);
    const uncertainty = o.uncertainty || { type: "UNAVAILABLE", reason: "NO_VALIDATED_ERROR_MODEL" };
    return {
      key,
      value: value == null || !Number.isFinite(value) ? null : value,
      unit,
      timestamp: validTime,
      age: Object.hasOwn(o, "age") ? o.age : 0,
      quality: o.quality || "ESTIMATED",
      uncertainty,
      source_ref: o.source_ref || o.source_id || "floodtwin-local-model",
      version: o.version || o.model_version || MODEL_VERSION,
      schema_version: QUANTITY_SCHEMA,
      valid_time: validTime,
      issue_time: issueTime,
      status: o.status || "AVAILABLE",
      reason: o.reason || null,
      provenance,
      quality_flags: o.quality_flags || [],
      confidence_grade: o.confidence_grade || "LOW",
      uncertainty_representation: o.uncertainty_representation || { type: "NONE_PROVIDED" },
      source_id: o.source_id || "floodtwin-local-model",
      model_id: o.model_id || "floodtwin-demo",
      model_version: o.model_version || MODEL_VERSION,
      assumptions: o.assumptions || [],
      limitations: o.limitations || [],
      spatial_support: support,
      interpolation: o.interpolation || support.interpolation,
      no_data_semantics: o.no_data_semantics || support.no_data_semantics,
    };
  }

  function pointSelection(xKm, yKm) {
    const size = D.DOMAIN.sizeKm;
    if (!Number.isFinite(xKm) || !Number.isFinite(yKm) || xKm < 0 || yKm < 0 || xKm > size || yKm > size) {
      throw new RangeError("Point selection must be finite and inside the model domain");
    }
    const support = spatialSupport(xKm, yKm);
    const ll = FT.geo.km2ll(xKm, yKm);
    return {
      kind: "point",
      id: `cell:${support.cell_id}`,
      xKm,
      yKm,
      longitude: ll[0],
      latitude: ll[1],
      grid_id: support.grid_id,
      cell_id: support.cell_id,
    };
  }

  function physicalQuantities(xKm, yKm, dataHealth) {
    const W = FT.world;
    const availability = modelAvailability(dataHealth);
    const flags = ["AGE_FROM_ISSUE_TIME", "SYNTHETIC_DEMO", "NOT_OPERATIONALLY_VALIDATED"];
    const quality = dataHealth.level === 0 ? "OK" : dataHealth.reason_category === "STALE" ? "STALE"
      : dataHealth.reason_category === "QUALITY_REJECTED" ? "SUSPECT" : "ESTIMATED";
    const modelLimitations = [
      "Synthetic browser model; not calibrated or validated for operational use.",
      "No validated uncertainty/error model is available.",
    ];
    const modelOpts = {
      status: availability.status,
      reason: availability.reason,
      provenance: "SYNTHETIC",
      age: 0,
      quality,
      uncertainty: { type: "UNAVAILABLE", reason: "NO_VALIDATED_ERROR_MODEL" },
      quality_flags: flags,
      confidence_grade: availability.confidence,
      source_id: "in-browser-swe-state",
      source_ref: "FT.world physical-state samplers",
      model_id: "shallow-water-height-field",
      model_version: MODEL_VERSION,
      version: MODEL_VERSION,
      assumptions: ["Flood excess is referenced to the model's normal-river field."],
      limitations: modelLimitations,
      no_data_semantics: "numeric demo value may remain visible during degradation; status governs operational usability",
    };
    const terrainReal = !!(FT.geo && FT.geo.hasDEM);
    const terrainSupport = spatialSupport(xKm, yKm, {
      vertical_datum: "SOURCE_DATUM_NOT_NORMALIZED; synthetic channel carving applied",
      interpolation: "NEAREST_CELL",
      no_data_semantics: "null only when the terrain grid is unavailable",
    });
    const terrainOpts = {
      provenance: terrainReal ? "ASSUMED" : "SYNTHETIC",
      age: null,
      quality: "ESTIMATED",
      uncertainty: { type: "UNAVAILABLE", reason: "NO_SURVEY_ERROR_MODEL" },
      quality_flags: terrainReal
        ? ["AGE_UNAVAILABLE", "EXTERNAL_GLOBAL_RASTER", "NOT_SURVEYED_BATHYMETRY", "SYNTHETIC_CHANNEL_CARVING"]
        : ["AGE_UNAVAILABLE", "PROCEDURAL_FALLBACK", "NOT_SURVEYED_BATHYMETRY"],
      confidence_grade: "LOW",
      source_id: terrainReal ? "aws-terrarium-plus-channel-carving" : "procedural-terrain-plus-channel-carving",
      source_ref: terrainReal ? "AWS Terrarium DEM plus FT.world synthetic channel carving" : "FT.world procedural terrain plus synthetic channel carving",
      model_id: "terrain-grid",
      model_version: MODEL_VERSION,
      version: terrainReal ? "aws-terrarium-z11+channel-carving-v1" : "procedural-terrain-v1+channel-carving-v1",
      assumptions: ["Global DEM elevations and synthetic channel carving are adequate for demonstration rendering/state queries."],
      limitations: ["Not surveyed bathymetry.", "Source vertical datum is not normalized into an operational basin datum."],
      spatial_support: terrainSupport,
      no_data_semantics: "null only when the terrain grid is unavailable",
    };
    const unsupportedSupport = spatialSupport(xKm, yKm, {
      vertical_datum: "NOT_APPLICABLE",
      interpolation: "NONE",
      no_data_semantics: "null is mandatory because this is not a supported physical output",
    });
    const unsupported = {
      value: null,
      status: "UNSUPPORTED",
      reason: "UNSUPPORTED_PHYSICS",
      provenance: "SYNTHETIC",
      age: null,
      quality: "MISSING",
      uncertainty: { type: "UNAVAILABLE", reason: "QUANTITY_NOT_COMPUTED" },
      quality_flags: ["AGE_UNAVAILABLE", "NOT_VALIDATED_AS_PHYSICAL_OUTPUT"],
      confidence_grade: "UNAVAILABLE",
      source_id: "not-available",
      source_ref: "No normalized physical-state source",
      model_id: "not-implemented",
      model_version: MODEL_VERSION,
      version: MODEL_VERSION,
      assumptions: [],
      limitations: ["Display animation, particles and shader state are prohibited as numerical sources."],
      spatial_support: unsupportedSupport,
    };

    return [
      quantity("flood_excess", W.sampleExcess(xKm, yKm), "m", {
        ...modelOpts,
        source_id: "world-sample-excess",
        source_ref: "FT.world.sampleExcess(xKm, yKm)",
        spatial_support: spatialSupport(xKm, yKm, {
          vertical_datum: "DEPTH_ABOVE_MODEL_NORMAL_RIVER_REFERENCE",
          interpolation: "NEAREST_CELL",
          no_data_semantics: modelOpts.no_data_semantics,
        }),
      }),
      quantity("depth", W.sampleDepth(xKm, yKm), "m", {
        ...modelOpts,
        source_id: "world-sample-depth",
        source_ref: "FT.world.sampleDepth(xKm, yKm)",
        assumptions: ["Depth is the model total water column, not flood excess above normal rivers."],
        spatial_support: spatialSupport(xKm, yKm, {
          vertical_datum: "MODEL_TOTAL_WATER_COLUMN",
          interpolation: "BILINEAR",
          no_data_semantics: modelOpts.no_data_semantics,
        }),
      }),
      quantity("terrain", W.sampleTerrain(xKm, yKm), "m", terrainOpts),
      quantity("velocity", unsupported.value, "m/s", unsupported),
      quantity("momentum", unsupported.value, "m2/s", unsupported),
      quantity("arrival_time", null, "h", {
        ...unsupported,
        status: "NOT_COMPUTED",
        reason: "PLANNED",
        uncertainty: { type: "UNAVAILABLE", reason: "PLANNED" },
      }),
      quantity("source_attribution", null, "fraction", unsupported),
    ];
  }

  function sourcesFor(quantities) {
    const seen = new Set();
    const sources = [];
    for (const q of quantities) {
      if (seen.has(q.source_id)) continue;
      seen.add(q.source_id);
      sources.push({
        source_id: q.source_id,
        source_ref: q.source_ref,
        provenance: q.provenance,
        status: q.status,
        quality: q.quality,
        model_id: q.model_id,
        model_version: q.model_version,
        version: q.version,
      });
    }
    return sources;
  }

  function buildContract(selection, quantities, dataHealth) {
    return deepFreeze({
      contract: CONTRACT,
      selection,
      valid_time: scenarioTime(FT.state.timeH, "simulation_valid_time"),
      issue_time: scenarioTime(0, "scenario_reference_time"),
      scenario: FT.state.scenario,
      policy: FT.state.policy,
      data_health: dataHealth,
      quantities,
      sources: sourcesFor(quantities),
      assumptions: [
        "Hydrology, reservoir routing and inundation are synthetic demonstration outputs.",
        "Flood excess means modeled water depth above the normal-river reference field.",
      ],
      limitations: [
        "Not calibrated or validated for operational use.",
        "Terrain is not surveyed bathymetry; channels include synthetic carving.",
        "Velocity, momentum, arrival time and source attribution are not supported physical outputs.",
      ],
    });
  }

  function atPoint(xKm, yKm) {
    const dataHealth = healthState();
    const selection = pointSelection(xKm, yKm);
    return buildContract(selection, physicalQuantities(xKm, yKm, dataHealth), dataHealth);
  }

  function entityDefinition(kind, id) {
    if (kind === "gauge") {
      const def = D.GAUGES.find((item) => item.id === id);
      return def && { def, x: def.x, y: def.y, name: def.name };
    }
    if (kind === "reservoir") {
      const def = D.RESERVOIRS.find((item) => item.id === id);
      return def && { def, x: def.x, y: def.y, name: def.name };
    }
    if (kind === "zone") {
      const def = D.ZONES.find((item) => item.id === id);
      return def && { def, x: def.x, y: def.y, name: def.name };
    }
    if (kind === "road") {
      const match = /^road:(\d+)$/.exec(id);
      const edge = match && FT.world.roads && FT.world.roads.edges[Number(match[1])];
      if (!edge || `road:${edge.idx}` !== id) return null;
      const p = FT.world.roadPoint(edge, edge.a, 0.5);
      return { def: edge, x: p[0], y: p[1], name: edge.name };
    }
    return null;
  }

  function entityQuantities(kind, entity, dataHealth) {
    const availability = modelAvailability(dataHealth);
    const featureId = kind === "road" ? `road:${entity.def.idx}` : entity.def.id;
    const quality = dataHealth.level === 0 ? "OK" : dataHealth.reason_category === "STALE" ? "STALE"
      : dataHealth.reason_category === "QUALITY_REJECTED" ? "SUSPECT" : "ESTIMATED";
    const common = {
      status: availability.status,
      reason: availability.reason,
      provenance: "SYNTHETIC",
      age: 0,
      quality,
      uncertainty: { type: "UNAVAILABLE", reason: "NO_VALIDATED_ERROR_MODEL" },
      quality_flags: ["AGE_FROM_ISSUE_TIME", "SYNTHETIC_DEMO", "NOT_OPERATIONALLY_VALIDATED"],
      confidence_grade: availability.confidence,
      assumptions: ["Entity state is generated by the deterministic browser demonstration."],
      limitations: ["Not calibrated or validated for operational use."],
      no_data_semantics: "numeric demo value may remain visible during degradation; status governs operational usability",
    };
    const snap = FT.hydro.at(FT.state.timeH);
    if (kind === "gauge") {
      const state = snap.gauges[entity.def.id];
      const opts = {
        ...common,
        age: feedAge(`H:${entity.def.id}`),
        quality_flags: ["AGE_FROM_SOURCE_FEED", "SYNTHETIC_DEMO", "NOT_OPERATIONALLY_VALIDATED"]
          .concat(feedAge(`H:${entity.def.id}`) == null ? "AGE_UNAVAILABLE" : []),
        source_id: `hydro-gauge-series:${entity.def.id}`,
        source_ref: `FT.hydro.at(timeH).gauges.${entity.def.id}`,
        model_id: "hydro-analytic-gauge",
        model_version: FT.ops.versions.engine,
        version: FT.ops.versions.engine,
        spatial_support: featureSupport(kind, featureId, {
          vertical_datum: "STATION_DATUM_UNSPECIFIED",
          no_data_semantics: common.no_data_semantics,
        }),
        limitations: common.limitations.concat("Gauge datum is unspecified; stages must not be compared across stations."),
      };
      return [
        quantity("gauge_stage", state.stage, "m", opts),
        quantity("gauge_trend_3h", state.trend, "m/3h", opts),
        quantity("alert_level", state.alert, "level", opts),
      ];
    }
    if (kind === "reservoir") {
      const state = snap.reservoirs[entity.def.id];
      const opts = {
        ...common,
        age: feedAge(`Z:${entity.def.id}`),
        quality_flags: ["AGE_FROM_SOURCE_FEED", "SYNTHETIC_DEMO", "NOT_OPERATIONALLY_VALIDATED"]
          .concat(feedAge(`Z:${entity.def.id}`) == null ? "AGE_UNAVAILABLE" : []),
        source_id: `hydro-reservoir-series:${entity.def.id}`,
        source_ref: `FT.hydro.at(timeH).reservoirs.${entity.def.id}`,
        model_id: "hydro-analytic-reservoir-routing",
        model_version: FT.ops.versions.engine,
        version: FT.ops.versions.engine,
        spatial_support: featureSupport(kind, featureId, {
          vertical_datum: "RESERVOIR_LEVEL_DATUM_UNSPECIFIED",
          no_data_semantics: common.no_data_semantics,
        }),
        limitations: common.limitations.concat("Reservoir level datum and storage curve are not governed operational data."),
      };
      return [
        quantity("reservoir_stage", state.Z, "m", opts),
        quantity("reservoir_inflow", state.I, "m3/s", opts),
        quantity("reservoir_outflow", state.O, "m3/s", opts),
      ];
    }
    if (kind === "zone") {
      const state = FT.zones && FT.zones.byId ? FT.zones.byId(entity.def.id) : null;
      if (!state) {
        const missing = {
          ...common,
          value: null,
          age: null,
          status: "UNAVAILABLE_FOR_OPERATIONS",
          reason: "MISSING_DATA",
          quality: "MISSING",
          quality_flags: ["AGE_UNAVAILABLE", "MISSING_DEPENDENCY", "ZONES_SUBSYSTEM_UNAVAILABLE"],
          confidence_grade: "UNAVAILABLE",
          source_ref: `FT.zones.byId(${entity.def.id}) unavailable`,
          version: MODEL_VERSION,
          spatial_support: featureSupport(kind, featureId, {
            vertical_datum: "NOT_APPLICABLE",
            no_data_semantics: "null means the zones subsystem or requested zone state is unavailable",
          }),
          assumptions: [],
          limitations: ["The zones subsystem is unavailable, so no aggregate or exposure value is asserted."],
        };
        return [
          quantity("zone_max_flood_excess", null, "m", {
            ...missing,
            source_id: `zone-grid-statistics:${entity.def.id}`,
            model_id: "zones-grid-aggregation",
            model_version: MODEL_VERSION,
          }),
          quantity("zone_mean_flood_excess", null, "m", {
            ...missing,
            source_id: `zone-grid-statistics:${entity.def.id}`,
            model_id: "zones-grid-aggregation",
            model_version: MODEL_VERSION,
          }),
          quantity("zone_exposed_population", null, "people", {
            ...missing,
            source_id: `zone-synthetic-exposure:${entity.def.id}`,
            model_id: "synthetic-population-exposure",
            model_version: FT.ops.versions.exposure,
            version: FT.ops.versions.exposure,
          }),
        ];
      }
      const depthOpts = {
        ...common,
        source_id: `zone-grid-statistics:${entity.def.id}`,
        source_ref: `FT.zones.byId(${entity.def.id}) depth statistics`,
        model_id: "zones-grid-aggregation",
        model_version: MODEL_VERSION,
        version: MODEL_VERSION,
        spatial_support: featureSupport(kind, featureId, {
          vertical_datum: "DEPTH_ABOVE_MODEL_NORMAL_RIVER_REFERENCE",
          no_data_semantics: common.no_data_semantics,
        }),
        assumptions: common.assumptions.concat("Zone max/mean aggregate modeled flood excess over included grid cells."),
      };
      const exposureOpts = {
        ...common,
        source_id: `zone-synthetic-exposure:${entity.def.id}`,
        source_ref: `FT.zones.byId(${entity.def.id}).exposed from FT.world synthetic population field`,
        model_id: "synthetic-population-exposure",
        model_version: FT.ops.versions.exposure,
        version: FT.ops.versions.exposure,
        spatial_support: featureSupport(kind, featureId, {
          vertical_datum: "NOT_APPLICABLE",
          no_data_semantics: common.no_data_semantics,
        }),
        assumptions: ["Population is a synthetic city-weighted grid and exposure uses the demo depth-response function."],
        limitations: ["Not a census raster or surveyed person count.", "Precision is rounded to model resolution."],
      };
      return [
        quantity("zone_max_flood_excess", state.maxD, "m", depthOpts),
        quantity("zone_mean_flood_excess", state.meanD, "m", depthOpts),
        quantity("zone_exposed_population", state.exposed, "people", exposureOpts),
      ];
    }
    const depthOpts = {
      ...common,
      source_id: `world-road-depth:${entity.def.idx}`,
      source_ref: `FT.world.roads.edges[${entity.def.idx}].depth`,
      model_id: "road-depth-sampling",
      model_version: MODEL_VERSION,
      version: MODEL_VERSION,
      spatial_support: featureSupport(kind, featureId, {
        vertical_datum: "DEPTH_ABOVE_MODEL_NORMAL_RIVER_REFERENCE",
        no_data_semantics: common.no_data_semantics,
      }),
      assumptions: common.assumptions.concat("Road depth is the maximum modeled flood excess over configured road samples."),
    };
    const classOpts = {
      ...common,
      source_id: `world-road-passability:${entity.def.idx}`,
      source_ref: `FT.world.roads.edges[${entity.def.idx}].cls via FT.util.roadClass`,
      model_id: "road-passability-thresholds",
      model_version: FT.ops.versions.thresholds,
      version: FT.ops.versions.thresholds,
      spatial_support: featureSupport(kind, featureId, {
        vertical_datum: "NOT_APPLICABLE",
        no_data_semantics: common.no_data_semantics,
      }),
      assumptions: ["Passability class uses the demo's fixed flood-depth thresholds."],
      limitations: ["No vehicle-specific, pavement, current-speed or debris assessment."],
    };
    return [
      quantity("road_flood_excess", entity.def.depth, "m", depthOpts),
      quantity("road_passability_class", entity.def.cls, "class", classOpts),
    ];
  }

  function forEntity(kind, id) {
    const entity = entityDefinition(kind, id);
    if (!entity) throw new RangeError(`Unknown explainability selector: ${kind}:${id}`);
    const dataHealth = healthState();
    const base = atPoint(entity.x, entity.y);
    const selection = {
      ...base.selection,
      kind,
      id,
      name: entity.name,
    };
    const quantities = base.quantities.concat(entityQuantities(kind, entity, dataHealth));
    return buildContract(selection, quantities, dataHealth);
  }

  const E = {
    atPoint,
    forEntity,
    select(selection) {
      if (!selection || typeof selection !== "object") throw new TypeError("Selection is required");
      current = selection.kind === "point"
        ? atPoint(selection.xKm, selection.yKm)
        : forEntity(selection.kind, selection.id);
      FT.bus.emit("explainSelection", current);
      return current;
    },
    clear() {
      current = null;
      FT.bus.emit("explainSelection", null);
      return null;
    },
  };
  Object.defineProperty(E, "current", { enumerable: true, get() { return current; } });
  Object.defineProperty(E, "reasonCategories", { enumerable: true, get() { return REASON_CATEGORIES; } });
  FT.explain = E;
})();
