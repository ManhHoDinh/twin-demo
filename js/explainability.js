/* FloodTwin — normalized scientific explainability state.
   This module reads physical/domain state only. Rendering state is not a data source. */
(function () {
  "use strict";

  const FT = window.FT;
  const D = FT.data;
  const SCHEMA = "floodtwin.explain/v1";
  const MODEL_VERSION = "swe-144-1";
  const PROVENANCE = new Set(["MEASURED", "FORECAST", "MODELLED", "ASSUMED", "SYNTHETIC"]);
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

  function healthState() {
    const health = FT.ops && FT.ops.health ? FT.ops.health() : { level: 0, oldest: 0, missingCritical: null };
    const level = health.level || 0;
    return {
      level,
      status: level === 0 ? "AVAILABLE" : level === 4 ? "UNAVAILABLE_FOR_OPERATIONS" : "DEGRADED",
      reason: level === 0 ? null : level === 1 ? "STALE" : "MISSING_DATA",
      oldest_age_min: health.oldest || 0,
      missing_dependency: health.missingCritical || null,
    };
  }

  function modelAvailability(dataHealth) {
    if (dataHealth.level === 0) return { status: "AVAILABLE", reason: null, confidence: "LOW" };
    if (dataHealth.level === 1) return { status: "DEGRADED", reason: "STALE", confidence: "VERY_LOW" };
    if (dataHealth.level === 4) return { status: "UNAVAILABLE_FOR_OPERATIONS", reason: "MISSING_DATA", confidence: "UNAVAILABLE" };
    return { status: "DEGRADED", reason: "MISSING_DATA", confidence: "VERY_LOW" };
  }

  function spatialSupport(xKm, yKm) {
    const ix = FT.world.km2i(xKm), iy = FT.world.km2i(yKm);
    return {
      type: "GRID_CELL",
      crs: "FloodTwin local kilometres; WGS84 coordinates retained on selection",
      grid_id: `swe-${D.DOMAIN.N}`,
      cell_id: `${ix}:${iy}`,
      resolution_m: D.DOMAIN.cellKm * 1000,
    };
  }

  function quantity(key, value, unit, options) {
    const o = options || {};
    const provenance = o.provenance || "SYNTHETIC";
    if (!PROVENANCE.has(provenance)) throw new TypeError(`Invalid provenance for ${key}: ${provenance}`);
    return {
      key,
      value: value == null || !Number.isFinite(value) ? null : value,
      unit,
      status: o.status || "AVAILABLE",
      reason: o.reason || null,
      provenance,
      quality_flags: o.quality_flags || [],
      confidence_grade: o.confidence_grade || "LOW",
      uncertainty_representation: o.uncertainty_representation || { type: "NONE_PROVIDED" },
      source_id: o.source_id || "floodtwin-local-model",
      model_id: o.model_id || "floodtwin-demo",
      model_version: o.model_version || MODEL_VERSION,
      spatial_support: o.spatial_support || { type: "NOT_APPLICABLE" },
      interpolation: o.interpolation || "NONE",
      no_data_semantics: o.no_data_semantics || "null means the quantity is not supported or was not computed",
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
    const support = spatialSupport(xKm, yKm);
    const availability = modelAvailability(dataHealth);
    const flags = ["SYNTHETIC_DEMO", "NOT_OPERATIONALLY_VALIDATED"];
    const modelOpts = {
      status: availability.status,
      reason: availability.reason,
      provenance: "SYNTHETIC",
      quality_flags: flags,
      confidence_grade: availability.confidence,
      source_id: "in-browser-swe-state",
      model_id: "shallow-water-height-field",
      model_version: MODEL_VERSION,
      spatial_support: support,
      no_data_semantics: "numeric demo value may remain visible during degradation; status governs operational usability",
    };
    const terrainReal = !!(FT.geo && FT.geo.hasDEM);
    const terrainOpts = {
      provenance: terrainReal ? "ASSUMED" : "SYNTHETIC",
      quality_flags: terrainReal
        ? ["EXTERNAL_GLOBAL_RASTER", "NOT_SURVEYED_BATHYMETRY", "SYNTHETIC_CHANNEL_CARVING"]
        : ["PROCEDURAL_FALLBACK", "NOT_SURVEYED_BATHYMETRY"],
      confidence_grade: "LOW",
      source_id: terrainReal ? "aws-terrarium-plus-channel-carving" : "procedural-terrain-plus-channel-carving",
      model_id: "terrain-grid",
      model_version: MODEL_VERSION,
      spatial_support: support,
      interpolation: "NEAREST_CELL",
      no_data_semantics: "null only when the terrain grid is unavailable",
    };
    const unsupported = {
      value: null,
      status: "UNSUPPORTED",
      reason: "UNSUPPORTED_PHYSICS",
      provenance: "MODELLED",
      quality_flags: ["NOT_VALIDATED_AS_PHYSICAL_OUTPUT"],
      confidence_grade: "UNAVAILABLE",
      source_id: "not-available",
      model_id: "not-implemented",
      model_version: MODEL_VERSION,
      spatial_support: support,
      interpolation: "NONE",
    };

    return [
      quantity("flood_excess", W.sampleExcess(xKm, yKm), "m", { ...modelOpts, interpolation: "NEAREST_CELL" }),
      quantity("depth", W.sampleDepth(xKm, yKm), "m", { ...modelOpts, interpolation: "BILINEAR" }),
      quantity("terrain", W.sampleTerrain(xKm, yKm), "m", terrainOpts),
      quantity("velocity", unsupported.value, "m/s", unsupported),
      quantity("momentum", unsupported.value, "m2/s", unsupported),
      quantity("arrival_time", null, "h", { ...unsupported, status: "NOT_COMPUTED" }),
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
        provenance: q.provenance,
        status: q.status,
        model_id: q.model_id,
        model_version: q.model_version,
      });
    }
    return sources;
  }

  function buildContract(selection, quantities, dataHealth) {
    return deepFreeze({
      schema: SCHEMA,
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
    const support = { type: "FEATURE", feature_kind: kind, feature_id: kind === "road" ? `road:${entity.def.idx}` : entity.def.id };
    const opts = {
      status: availability.status,
      reason: availability.reason,
      provenance: "SYNTHETIC",
      quality_flags: ["SYNTHETIC_DEMO", "NOT_OPERATIONALLY_VALIDATED"],
      confidence_grade: availability.confidence,
      source_id: "in-browser-analytic-state",
      model_id: "hydro-analytic-1",
      model_version: FT.ops.versions.engine,
      spatial_support: support,
      interpolation: "FEATURE_LOOKUP",
      no_data_semantics: "numeric demo value may remain visible during degradation; status governs operational usability",
    };
    const snap = FT.hydro.at(FT.state.timeH);
    if (kind === "gauge") {
      const state = snap.gauges[entity.def.id];
      return [
        quantity("gauge_stage", state.stage, "m", opts),
        quantity("gauge_trend_3h", state.trend, "m", opts),
        quantity("alert_level", state.alert, "level", opts),
      ];
    }
    if (kind === "reservoir") {
      const state = snap.reservoirs[entity.def.id];
      return [
        quantity("reservoir_stage", state.Z, "m", opts),
        quantity("reservoir_inflow", state.I, "m3/s", opts),
        quantity("reservoir_outflow", state.O, "m3/s", opts),
      ];
    }
    if (kind === "zone") {
      const state = FT.zones && FT.zones.byId ? FT.zones.byId(entity.def.id) : null;
      if (!state) return [];
      return [
        quantity("zone_max_flood_excess", state.maxD, "m", opts),
        quantity("zone_mean_flood_excess", state.meanD, "m", opts),
        quantity("zone_exposed_population", state.exposed, "people", opts),
      ];
    }
    return [
      quantity("road_flood_excess", entity.def.depth, "m", opts),
      quantity("road_passability_class", entity.def.cls, "class", opts),
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
  FT.explain = E;
})();
