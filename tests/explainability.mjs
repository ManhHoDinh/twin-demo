/* Normalized scientific explainability contract — browser integration tests. */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listen } from './serve.mjs';
import { launchGpu } from './browser.mjs';
import {
  step, check, usePage, bootApp, setTime, setDegradation, report, results,
} from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

async function explainabilityContract(browser, base) {
  step('Scientific explainability · normalized physical state');
  const { ctx, page, errors } = await bootApp(browser, base);
  usePage(page);
  await setTime(page, 8);

  await check('atPoint exposes floodtwin.explain/v1 with the exact normalized envelope', async (d) => {
    const r = await page.evaluate(() => {
      const z = window.FT.data.ZONES[0];
      const contract = window.FT.explain.atPoint(z.x, z.y);
      return {
        contract: contract.contract,
        keys: Object.keys(contract).sort(),
        expected: [
          'assumptions', 'contract', 'data_health', 'issue_time', 'limitations', 'policy',
          'quantities', 'scenario', 'selection', 'sources', 'valid_time',
        ].sort(),
        validTime: contract.valid_time,
        issueTime: contract.issue_time,
      };
    });
    d(r);
    return r.contract === 'floodtwin.explain/v1'
      && JSON.stringify(r.keys) === JSON.stringify(r.expected)
      && r.validTime.tH === 8
      && r.issueTime.tH === 0
      && r.validTime.semantics === 'simulation_valid_time'
      && r.issueTime.semantics === 'scenario_reference_time';
  });

  await check('every quantity carries the exact normalized scientific envelope', async (d) => {
    const r = await page.evaluate(() => {
      const z = window.FT.data.ZONES[0];
      const quantities = window.FT.explain.atPoint(z.x, z.y).quantities;
      const expected = [
        'age', 'assumptions', 'confidence_grade', 'interpolation', 'issue_time', 'key',
        'limitations', 'model_id', 'model_version', 'no_data_semantics', 'provenance',
        'quality', 'quality_flags', 'reason', 'schema_version', 'source_id', 'source_ref',
        'spatial_support', 'status', 'timestamp', 'uncertainty',
        'uncertainty_representation', 'unit', 'valid_time', 'value', 'version',
      ].sort();
      return {
        count: quantities.length,
        bad: quantities.filter((q) => JSON.stringify(Object.keys(q).sort()) !== JSON.stringify(expected))
          .map((q) => ({ key: q.key, fields: Object.keys(q).sort() })),
        invalidValue: quantities.filter((q) => q.value !== null && !Number.isFinite(q.value)).map((q) => q.key),
        invalidCanonical: quantities.filter((q) =>
          JSON.stringify(q.timestamp) !== JSON.stringify(q.valid_time)
          || !Number.isFinite(q.age)
          || !['OK', 'SUSPECT', 'STALE', 'MISSING', 'ESTIMATED'].includes(q.quality)
          || !q.uncertainty
          || !q.source_ref
          || !q.version
          || q.schema_version !== 'eng-quantity-envelope/1'
          || !Array.isArray(q.assumptions)
          || !Array.isArray(q.limitations)).map((q) => q.key),
        invalidSpatial: quantities.filter((q) => {
          const s = q.spatial_support || {};
          return !s.support_type || !s.crs || !s.vertical_datum
            || !Object.hasOwn(s, 'grid_id') || !Object.hasOwn(s, 'feature_id')
            || !Object.hasOwn(s, 'resolution_m') || !s.interpolation || !s.no_data_semantics;
        }).map((q) => q.key),
      };
    });
    d(r);
    return r.count >= 7 && r.bad.length === 0 && r.invalidValue.length === 0
      && r.invalidCanonical.length === 0 && r.invalidSpatial.length === 0;
  });

  await check('point depth, flood excess and terrain equal the physical-state samplers', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const z = FT.data.ZONES[0];
      const contract = FT.explain.atPoint(z.x, z.y);
      const q = Object.fromEntries(contract.quantities.map((x) => [x.key, x]));
      return {
        actual: { depth: q.depth.value, floodExcess: q.flood_excess.value, terrain: q.terrain.value },
        expected: {
          depth: FT.world.sampleDepth(z.x, z.y),
          floodExcess: FT.world.sampleExcess(z.x, z.y),
          terrain: FT.world.sampleTerrain(z.x, z.y),
        },
        units: { depth: q.depth.unit, floodExcess: q.flood_excess.unit, terrain: q.terrain.unit },
        primaryProvenance: q.flood_excess.provenance,
      };
    });
    d(r);
    const near = (a, b) => Math.abs(a - b) < 1e-6;
    return near(r.actual.depth, r.expected.depth)
      && near(r.actual.floodExcess, r.expected.floodExcess)
      && near(r.actual.terrain, r.expected.terrain)
      && Object.values(r.units).every((u) => u === 'm')
      && r.primaryProvenance === 'SYNTHETIC';
  });

  await check('unsupported physics remains null and explicitly categorized', async (d) => {
    const r = await page.evaluate(() => {
      const z = window.FT.data.ZONES[0];
      const q = Object.fromEntries(window.FT.explain.atPoint(z.x, z.y).quantities.map((x) => [x.key, x]));
      return {
        velocity: q.velocity,
        momentum: q.momentum,
        arrival: q.arrival_time,
        attribution: q.source_attribution,
      };
    });
    d(r);
    return r.velocity.value === null && r.velocity.status === 'UNSUPPORTED'
      && r.velocity.reason === 'UNSUPPORTED_PHYSICS'
      && r.momentum.value === null
      && r.arrival.value === null && r.arrival.status === 'NOT_COMPUTED'
      && r.attribution.value === null && r.attribution.status === 'UNSUPPORTED';
  });

  await check('render layers, camera and active view cannot change the scientific contract', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const z = FT.data.ZONES[0];
      const before = JSON.stringify(FT.explain.atPoint(z.x, z.y));
      FT.state.layers.water = !FT.state.layers.water;
      FT.state.layers.flow = !FT.state.layers.flow;
      FT.state.layers.labels = !FT.state.layers.labels;
      FT.state.view = FT.state.view === '2d' ? '3d' : '2d';
      FT.state.camPreset = 'hoian';
      const after = JSON.stringify(FT.explain.atPoint(z.x, z.y));
      return { same: before === after };
    });
    d(r);
    return r.same;
  });

  await check('forEntity values, units and lineage match gauge, reservoir, zone and road state', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const snap = FT.hydro.at(FT.state.timeH);
      const gauge = FT.data.GAUGES[0];
      const reservoir = FT.data.RESERVOIRS[0];
      const zoneDef = FT.data.ZONES[0];
      const zone = FT.zones.byId(zoneDef.id);
      const road = FT.world.roads.edges[0];
      const contracts = {
        gauge: FT.explain.forEntity('gauge', gauge.id),
        reservoir: FT.explain.forEntity('reservoir', reservoir.id),
        zone: FT.explain.forEntity('zone', zoneDef.id),
        road: FT.explain.forEntity('road', 'road:0'),
      };
      const q = (kind, key) => contracts[kind].quantities.find((item) => item.key === key);
      return {
        selectors: Object.fromEntries(Object.entries(contracts).map(([kind, c]) =>
          [kind, { contract: c.contract, kind: c.selection.kind, id: c.selection.id }])),
        gauge: {
          stage: q('gauge', 'gauge_stage'), expectedStage: snap.gauges[gauge.id].stage,
          trend: q('gauge', 'gauge_trend_3h'), expectedTrend: snap.gauges[gauge.id].trend,
        },
        reservoir: {
          stage: q('reservoir', 'reservoir_stage'), expectedStage: snap.reservoirs[reservoir.id].Z,
          inflow: q('reservoir', 'reservoir_inflow'), expectedInflow: snap.reservoirs[reservoir.id].I,
          outflow: q('reservoir', 'reservoir_outflow'), expectedOutflow: snap.reservoirs[reservoir.id].O,
        },
        zone: {
          max: q('zone', 'zone_max_flood_excess'), expectedMax: zone.maxD,
          mean: q('zone', 'zone_mean_flood_excess'), expectedMean: zone.meanD,
          exposed: q('zone', 'zone_exposed_population'), expectedExposed: zone.exposed,
        },
        road: {
          depth: q('road', 'road_flood_excess'), expectedDepth: road.depth,
          cls: q('road', 'road_passability_class'), expectedClass: road.cls,
        },
      };
    });
    d(r);
    const near = (a, b) => Math.abs(a - b) < 1e-6;
    const selectorsOk = Object.entries(r.selectors).every(([kind, x]) =>
      x.contract === 'floodtwin.explain/v1' && x.kind === kind)
      && r.selectors.road.id === 'road:0';
    const feature = (q, id) => q.spatial_support.support_type === 'FEATURE'
      && q.spatial_support.feature_id === id;
    return selectorsOk
      && near(r.gauge.stage.value, r.gauge.expectedStage) && r.gauge.stage.unit === 'm'
      && near(r.gauge.trend.value, r.gauge.expectedTrend) && r.gauge.trend.unit === 'm/3h'
      && r.gauge.stage.source_id.startsWith('hydro-gauge-series:')
      && r.gauge.stage.model_id === 'hydro-analytic-gauge'
      && feature(r.gauge.stage, r.selectors.gauge.id)
      && near(r.reservoir.stage.value, r.reservoir.expectedStage) && r.reservoir.stage.unit === 'm'
      && near(r.reservoir.inflow.value, r.reservoir.expectedInflow) && r.reservoir.inflow.unit === 'm3/s'
      && near(r.reservoir.outflow.value, r.reservoir.expectedOutflow) && r.reservoir.outflow.unit === 'm3/s'
      && r.reservoir.stage.model_id === 'hydro-analytic-reservoir-routing'
      && feature(r.reservoir.stage, r.selectors.reservoir.id)
      && near(r.zone.max.value, r.zone.expectedMax) && r.zone.max.unit === 'm'
      && near(r.zone.mean.value, r.zone.expectedMean) && r.zone.mean.unit === 'm'
      && near(r.zone.exposed.value, r.zone.expectedExposed) && r.zone.exposed.unit === 'people'
      && r.zone.max.model_id === 'zones-grid-aggregation'
      && r.zone.exposed.model_id === 'synthetic-population-exposure'
      && feature(r.zone.max, r.selectors.zone.id)
      && near(r.road.depth.value, r.road.expectedDepth) && r.road.depth.unit === 'm'
      && r.road.cls.value === r.road.expectedClass && r.road.cls.unit === 'class'
      && r.road.depth.model_id === 'road-depth-sampling'
      && r.road.cls.model_id === 'road-passability-thresholds'
      && feature(r.road.depth, 'road:0');
  });

  await check('select and clear publish immutable current state on the event bus', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const z = FT.data.ZONES[0];
      const events = [];
      const listener = (value) => events.push(value);
      FT.bus.on('explainSelection', listener);
      const selected = FT.explain.select({ kind: 'point', xKm: z.x, yKm: z.y });
      const frozen = Object.isFrozen(selected)
        && Object.isFrozen(selected.selection)
        && Object.isFrozen(selected.quantities)
        && selected.quantities.every(Object.isFrozen);
      const oldX = selected.selection.xKm;
      try { selected.selection.xKm = -999; } catch { /* expected in strict/frozen engines */ }
      const mutationBlocked = FT.explain.current.selection.xKm === oldX;
      const sameCurrent = FT.explain.current === selected;
      const cleared = FT.explain.clear();
      FT.bus.off('explainSelection', listener);
      return {
        frozen, mutationBlocked, sameCurrent, cleared,
        current: FT.explain.current,
        eventCount: events.length,
        firstContract: events[0] && events[0].contract,
        last: events[events.length - 1],
      };
    });
    d(r);
    return r.frozen && r.mutationBlocked && r.sameCurrent && r.cleared === null
      && r.current === null && r.eventCount === 2
      && r.firstContract === 'floodtwin.explain/v1' && r.last === null;
  });

  await setDegradation(page, 2);
  await check('L2 health degrades model output without relabeling it as measured', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const z = FT.data.ZONES[0];
      const c = FT.explain.atPoint(z.x, z.y);
      const physical = c.quantities.filter((q) => ['depth', 'flood_excess'].includes(q.key));
      return { health: c.data_health, physical };
    });
    d(r);
    return r.health.level === 2 && r.health.reason === 'MISSING_DATA'
      && r.physical.every((q) => q.status === 'DEGRADED' && q.reason === 'MISSING_DATA')
      && r.physical.every((q) => q.provenance === 'SYNTHETIC');
  });

  await setDegradation(page, 4);
  await check('L4 health marks model output unavailable for operations but preserves demo provenance', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const z = FT.data.ZONES[0];
      const c = FT.explain.atPoint(z.x, z.y);
      const physical = c.quantities.filter((q) => ['depth', 'flood_excess'].includes(q.key));
      return { health: c.data_health, physical };
    });
    d(r);
    return r.health.level === 4 && r.health.reason === 'MISSING_DATA'
      && r.physical.every((q) => q.status === 'UNAVAILABLE_FOR_OPERATIONS' && q.reason === 'MISSING_DATA')
      && r.physical.every((q) => q.provenance === 'SYNTHETIC')
      && r.physical.every((q) => Number.isFinite(q.value));
  });

  await setDegradation(page, null);
  const fatal = errors.filter((e) => !/overpass|arcgisonline|elevation-tiles-prod|jsdelivr|unpkg|cdn\.|tile|CORS|net::/i.test(e));
  await check('the explainability path adds no application errors', (d) => {
    d(fatal.slice(0, 5));
    return fatal.length === 0;
  });

  await ctx.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const srv = await listen(4341, ROOT);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await launchGpu();
  try {
    await explainabilityContract(browser, base);
  } finally {
    await browser.close();
    srv.close();
  }
  process.exit(report('FloodTwin Explainability') ? 1 : 0);
}

export { explainabilityContract };
