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

async function show2d(page) {
  await page.click('#viewTabs button[data-view="2d"]');
  await page.waitForTimeout(120);
}

async function mapPoint(page, kind) {
  return page.evaluate((targetKind) => {
    const FT = window.FT;
    const canvas = document.getElementById('canvas2d');
    const rect = canvas.getBoundingClientRect();
    const size = FT.data.DOMAIN.sizeKm;
    const scale = Math.min(rect.width, rect.height) / (size * 1.04);
    const toScreen = (x, y) => ({
      x: rect.left + rect.width / 2 + (x - size / 2) * scale,
      y: rect.top + rect.height / 2 + (y - size / 2) * scale,
      xKm: x,
      yKm: y,
    });
    const reachesCanvas = (x, y) => {
      const p = toScreen(x, y);
      return document.elementFromPoint(p.x, p.y) === canvas;
    };
    const farFromPointEntities = (x, y, minKm = 2.2) =>
      [...FT.data.GAUGES, ...FT.data.RESERVOIRS].every((item) => Math.hypot(item.x - x, item.y - y) > minKm);
    const segmentDistance = (x, y, a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
    };
    const outsideZones = (x, y) => FT.data.ZONES.every((z) => {
      const d = Math.hypot(z.x - x, z.y - y);
      return d > Math.min(z.r, 16 / scale) + 1 && Math.abs(d - z.r) > 9 / scale;
    });
    const awayFromRoads = (x, y) => FT.world.roads.edges.every((edge) => {
      const a = FT.world.roads.nodes[edge.a], b = FT.world.roads.nodes[edge.b];
      return segmentDistance(x, y, a, b) > 18 / scale;
    });

    if (targetKind === 'point') {
      for (let y = 5; y < size - 5; y += 4) {
        for (let x = 5; x < size - 5; x += 4) {
          if (farFromPointEntities(x, y) && outsideZones(x, y) && awayFromRoads(x, y) && reachesCanvas(x, y)) return toScreen(x, y);
        }
      }
      throw new Error('no blank map point found');
    }
    if (targetKind === 'gauge') {
      const item = FT.data.GAUGES[0];
      return { ...toScreen(item.x, item.y), id: item.id };
    }
    if (targetKind === 'reservoir') {
      const item = FT.data.RESERVOIRS[0];
      return { ...toScreen(item.x, item.y), id: item.id };
    }
    if (targetKind === 'zone') {
      const item = FT.data.ZONES.find((z) => farFromPointEntities(z.x, z.y)) || FT.data.ZONES[0];
      return { ...toScreen(item.x, item.y), id: item.id };
    }
    const edge = FT.world.roads.edges.find((candidate) => {
      const p = FT.world.roadPoint(candidate, candidate.a, 0.5);
      return farFromPointEntities(p[0], p[1]) && outsideZones(p[0], p[1]) && reachesCanvas(p[0], p[1]);
    }) || FT.world.roads.edges[0];
    const p = FT.world.roadPoint(edge, edge.a, 0.5);
    return { ...toScreen(p[0], p[1]), id: `road:${edge.idx}` };
  }, kind);
}

async function mapPaddingPoint(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('canvas2d');
    const rect = canvas.getBoundingClientRect();
    const domainSide = Math.min(rect.width, rect.height) / 1.04;
    const left = rect.left + (rect.width - domainSide) / 2;
    const right = rect.right - (rect.width - domainSide) / 2;
    const top = rect.top + (rect.height - domainSide) / 2;
    const bottom = rect.bottom - (rect.height - domainSide) / 2;
    const candidates = [
      { x: left - 4, y: rect.top + rect.height / 2 },
      { x: right + 4, y: rect.top + rect.height / 2 },
      { x: rect.left + rect.width / 2, y: top - 4 },
      { x: rect.left + rect.width / 2, y: bottom + 4 },
    ];
    const point = candidates.find((p) => p.x > rect.left && p.x < rect.right
      && p.y > rect.top && p.y < rect.bottom && document.elementFromPoint(p.x, p.y) === canvas);
    if (!point) throw new Error('no unobstructed canvas padding point found');
    return point;
  });
}

async function sceneTarget(page, selection) {
  return page.evaluate((value) => {
    const target = window.FT.scene3d.selectionTarget && window.FT.scene3d.selectionTarget(value);
    return target || null;
  }, selection);
}

async function explainabilityContract(browser, base) {
  step('Scientific explainability · normalized physical state');
  const { ctx, page, errors } = await bootApp(browser, base, { context: { hasTouch: true } });
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
      const contract = window.FT.explain.atPoint(z.x, z.y);
      const quantities = contract.quantities;
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
          || (!Number.isFinite(q.age) && !(q.age === null && q.quality_flags.includes('AGE_UNAVAILABLE')))
          || !['OK', 'SUSPECT', 'STALE', 'MISSING', 'ESTIMATED'].includes(q.quality)
          || !q.uncertainty
          || !q.source_ref
          || !q.version
          || q.schema_version !== 'eng-quantity-envelope/1'
          || !Array.isArray(q.assumptions)
          || !Array.isArray(q.limitations)).map((q) => q.key),
        invalidTiming: quantities.filter((q) =>
          JSON.stringify(q.valid_time) !== JSON.stringify(contract.valid_time)
          || JSON.stringify(q.issue_time) !== JSON.stringify(contract.issue_time)
          || q.valid_time.semantics !== 'simulation_valid_time'
          || q.issue_time.semantics !== 'scenario_reference_time'
          || JSON.stringify(q.valid_time) === JSON.stringify(q.issue_time)).map((q) => q.key),
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
      && r.invalidCanonical.length === 0 && r.invalidTiming.length === 0
      && r.invalidSpatial.length === 0;
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
      && r.velocity.provenance !== 'MODELLED'
      && r.momentum.value === null
      && r.arrival.value === null && r.arrival.status === 'NOT_COMPUTED'
      && r.arrival.provenance !== 'MODELLED'
      && r.attribution.value === null && r.attribution.status === 'UNSUPPORTED'
      && r.attribution.provenance !== 'MODELLED';
  });

  await check('render layers, camera and active view cannot change the scientific contract', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const z = FT.data.ZONES[0];
      const before = JSON.stringify(FT.explain.atPoint(z.x, z.y));
      const saved = { layers: { ...FT.state.layers }, view: FT.state.view, camPreset: FT.state.camPreset };
      FT.state.layers.water = !FT.state.layers.water;
      FT.state.layers.flow = !FT.state.layers.flow;
      FT.state.layers.labels = !FT.state.layers.labels;
      FT.state.view = FT.state.view === '2d' ? '3d' : '2d';
      FT.state.camPreset = 'hoian';
      const after = JSON.stringify(FT.explain.atPoint(z.x, z.y));
      Object.assign(FT.state.layers, saved.layers);
      FT.state.view = saved.view;
      FT.state.camPreset = saved.camPreset;
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

  step('Scientific explainability · accessible 3D selection');

  await page.evaluate(() => { window.FT.state.layers.labels = false; });
  await page.waitForTimeout(100);

  await check('actual 3D mouse and touch rays select entity hits before terrain or water coordinates', async (d) => {
    const reservoirId = await page.evaluate(() => window.FT.data.RESERVOIRS[0].id);
    const reservoir = await sceneTarget(page, { kind: 'reservoir', id: reservoirId });
    if (!reservoir) { d({ reservoir: null }); return false; }
    await page.mouse.click(reservoir.x, reservoir.y);
    await page.waitForTimeout(80);
    const entity = await page.evaluate(() => window.FT.explain.current && window.FT.explain.current.selection);

    const surface = await sceneTarget(page, { kind: 'point', xKm: 48, yKm: 48 });
    if (!surface) { d({ reservoir, entity, surface: null }); return false; }
    await page.touchscreen.tap(surface.x, surface.y);
    await page.waitForTimeout(80);
    const point = await page.evaluate(() => ({
      pointer: document.getElementById('canvas3d').dataset.lastExplainPointer,
      selection: window.FT.explain.current && window.FT.explain.current.selection,
    }));
    d({ reservoir, entity, surface, point });
    return entity.kind === 'reservoir' && entity.id === reservoir.id
      && point.pointer === 'touch' && point.selection.kind === 'point'
      && Math.abs(point.selection.xKm - 48) < 1 && Math.abs(point.selection.yKm - 48) < 1;
  });

  await check('actual 3D rays resolve stable gauge and zone selectors', async (d) => {
    const selectors = await page.evaluate(() => ({
      gauge: { kind: 'gauge', id: window.FT.data.GAUGES[0].id },
      zone: { kind: 'zone', id: window.FT.data.ZONES[0].id },
    }));
    const selected = {};
    for (const [kind, selector] of Object.entries(selectors)) {
      const target = await sceneTarget(page, selector);
      if (!target) { d({ kind, target: null }); return false; }
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(60);
      selected[kind] = await page.evaluate(() => window.FT.explain.current && window.FT.explain.current.selection);
    }
    d(selected);
    return selected.gauge.kind === 'gauge' && selected.gauge.id === selectors.gauge.id
      && selected.zone.kind === 'zone' && selected.zone.id === selectors.zone.id;
  });

  await check('3D orbit drags never become explanation selections', async (d) => {
    const surface = await sceneTarget(page, { kind: 'point', xKm: 52, yKm: 52 });
    if (!surface) { d({ surface: null }); return false; }
    await page.evaluate(() => window.FT.explain.clear());
    await page.mouse.move(surface.x, surface.y);
    await page.mouse.down();
    await page.mouse.move(surface.x + 18, surface.y + 12, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    const r = await page.evaluate(() => window.FT.explain.current);
    d({ surface, current: r });
    return r === null;
  });

  await check('secondary mouse buttons never become explanation selections', async (d) => {
    const surface = await sceneTarget(page, { kind: 'point', xKm: 52, yKm: 52 });
    if (!surface) { d({ surface: null }); return false; }
    await page.evaluate(() => window.FT.explain.clear());
    await page.mouse.click(surface.x, surface.y, { button: 'right' });
    await page.waitForTimeout(80);
    const r = await page.evaluate(() => window.FT.explain.current);
    d({ surface, current: r });
    return r === null;
  });

  await check('projected gauge and reservoir labels are keyboard buttons while place labels remain decorative', async (d) => {
    await page.evaluate(() => { window.FT.state.layers.labels = true; });
    await page.waitForTimeout(100);
    const r = await page.evaluate(() => ({
      wrapperHidden: document.getElementById('labels3d').getAttribute('aria-hidden'),
      interactive: [...document.querySelectorAll('#labels3d button[data-explain-kind]')].map((el) => ({
        kind: el.dataset.explainKind, id: el.dataset.explainId, label: el.getAttribute('aria-label'), type: el.type,
        visible: getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0,
      })),
      decorative: [...document.querySelectorAll('#labels3d .label3d:not(button)')]
        .every((el) => el.getAttribute('aria-hidden') === 'true'),
    }));
    const gauge = r.interactive.find((item) => item.kind === 'gauge' && item.visible);
    if (!gauge) { d(r); return false; }
    await page.focus(`#labels3d button[data-explain-kind="gauge"][data-explain-id="${gauge.id}"]`);
    await page.keyboard.press('Enter');
    const selected = await page.evaluate(() => window.FT.explain.current && window.FT.explain.current.selection);
    d({ ...r, selected });
    return r.wrapperHidden === null && r.decorative
      && r.interactive.some((item) => item.kind === 'reservoir')
      && r.interactive.every((item) => item.type === 'button' && !!item.label)
      && selected.kind === 'gauge' && selected.id === gauge.id;
  });

  await check('3D label Enter moves focus into the inspector and Escape restores the originating label', async (d) => {
    const selector = await page.evaluate(() => {
      const label = [...document.querySelectorAll('#labels3d button[data-explain-kind]')]
        .find((el) => getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0);
      return label ? `#labels3d button[data-explain-kind="${label.dataset.explainKind}"][data-explain-id="${label.dataset.explainId}"]` : null;
    });
    if (!selector) { d({ selector: null }); return false; }
    await page.evaluate(() => window.FT.explain.clear());
    await page.focus(selector);
    await page.keyboard.press('Enter');
    const entered = await page.evaluate(() => ({
      current: window.FT.explain.current && window.FT.explain.current.selection,
      hidden: document.getElementById('explainInspector').hidden,
      active: document.activeElement && document.activeElement.id,
      activeInside: document.getElementById('explainInspector').contains(document.activeElement),
    }));
    await page.keyboard.press('Escape');
    const escaped = await page.evaluate((originSelector) => ({
      current: window.FT.explain.current,
      hidden: document.getElementById('explainInspector').hidden,
      restored: document.activeElement === document.querySelector(originSelector),
    }), selector);
    d({ selector, entered, escaped });
    return entered.current && !entered.hidden && entered.activeInside
      && escaped.current === null && escaped.hidden && escaped.restored;
  });

  await check('3D label Escape uses a visible view fallback when its recorded origin becomes hidden', async (d) => {
    const run = async (mode) => {
      await page.evaluate(() => {
        window.FT.state.layers.labels = true;
        window.FT.explain.clear();
      });
      await page.waitForTimeout(80);
      const selector = await page.evaluate(() => {
        const label = [...document.querySelectorAll('#labels3d button[data-explain-kind]')]
          .find((el) => getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0);
        return label ? `#labels3d button[data-explain-kind="${label.dataset.explainKind}"][data-explain-id="${label.dataset.explainId}"]` : null;
      });
      if (!selector) return { mode, selector: null };
      await page.focus(selector);
      await page.keyboard.press('Enter');
      if (mode === 'labels') {
        await page.evaluate(() => { window.FT.state.layers.labels = false; });
        await page.waitForTimeout(80);
      } else {
        await page.evaluate(() => document.querySelector('#viewTabs button[data-view="2d"]').click());
        await page.waitForTimeout(120);
      }
      await page.keyboard.press('Escape');
      return page.evaluate((originSelector) => {
        const active = document.activeElement;
        const style = active && getComputedStyle(active);
        return {
          mode: document.body.dataset.view || window.FT.state.view,
          current: window.FT.explain.current,
          inspectorHidden: document.getElementById('explainInspector').hidden,
          originVisible: document.querySelector(originSelector)?.getClientRects().length > 0,
          activeId: active && active.id,
          activeView: active && active.dataset && active.dataset.view,
          activeVisible: !!active && style.display !== 'none' && style.visibility !== 'hidden' && active.getClientRects().length > 0,
          activeInInspector: document.getElementById('explainInspector').contains(active),
        };
      }, selector);
    };
    const labelsHidden = await run('labels');
    await page.evaluate(() => {
      window.FT.state.layers.labels = true;
      document.querySelector('#viewTabs button[data-view="3d"]').click();
    });
    await page.waitForTimeout(120);
    const switched2d = await run('2d');
    d({ labelsHidden, switched2d });
    return [labelsHidden, switched2d].every((item) => item.selector !== null
      && item.current === null && item.inspectorHidden && !item.originVisible
      && item.activeVisible && !item.activeInInspector
      && (['canvas2d', 'canvas3d'].includes(item.activeId) || ['2d', '3d'].includes(item.activeView)));
  });

  await check('camera, layer and shader-render updates cannot change the selected scientific contract', async (d) => {
    const r = await page.evaluate(async () => {
      const FT = window.FT;
      const before = JSON.stringify(FT.explain.atPoint(48, 48));
      FT.scene3d.setCamera('hoian');
      FT.state.layers.water = !FT.state.layers.water;
      FT.state.layers.labels = !FT.state.layers.labels;
      await new Promise((resolve) => setTimeout(resolve, 120));
      const after = JSON.stringify(FT.explain.atPoint(48, 48));
      FT.state.layers.water = !FT.state.layers.water;
      FT.state.layers.labels = !FT.state.layers.labels;
      return { same: before === after };
    });
    d(r);
    return r.same;
  });

  step('Scientific explainability · accessible 2D inspector');
  await show2d(page);

  await check('persistent inspector shell has the required accessible regions and exact public link', async (d) => {
    const r = await page.evaluate(() => {
      const aside = document.getElementById('explainInspector');
      const heading = document.getElementById('explainTitle');
      const close = document.getElementById('explainClose');
      const summary = document.getElementById('explainSummary');
      const link = document.getElementById('explainDocsLink');
      return {
        exists: !!aside,
        role: aside && aside.getAttribute('role'),
        labelledBy: aside && aside.getAttribute('aria-labelledby'),
        heading: heading && heading.id,
        closeType: close && close.getAttribute('type'),
        closeLabel: close && close.getAttribute('aria-label'),
        live: summary && summary.getAttribute('aria-live'),
        sections: ['explainQuantities', 'explainSources', 'explainConfidence', 'explainAssumptions', 'explainLimitations']
          .every((id) => !!document.getElementById(id)),
        href: link && link.href,
      };
    });
    d(r);
    const governedLinks = new Set([
      'https://info.skylabs.vn/visualisation-science.html#depth',
      'https://info.skylabs.vn/visualisation-science.html#wet-dry',
      'https://info.skylabs.vn/simulation-engines.html#hydrology-engine',
      'https://info.skylabs.vn/simulation-engines.html#reservoir-engine',
    ]);
    return r.exists && r.role === 'complementary' && r.labelledBy === r.heading
      && r.closeType === 'button' && !!r.closeLabel && r.live === 'polite' && r.sections
      && governedLinks.has(r.href);
  });

  await check('real pointer selection handles blank points and named entities without replacing existing actions', async (d) => {
    await page.evaluate(() => {
      window.__legacySelections = { gauge: [], reservoir: [], zone: [] };
      window.FT.bus.on('gaugeSelected', (id) => window.__legacySelections.gauge.push(id));
      window.FT.bus.on('reservoirFocus', (id) => window.__legacySelections.reservoir.push(id));
      window.FT.bus.on('zoneSelected', (id) => window.__legacySelections.zone.push(id));
    });
    const selected = {};
    for (const kind of ['point', 'gauge', 'reservoir', 'zone']) {
      const p = await mapPoint(page, kind);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(80);
      selected[kind] = await page.evaluate(() => ({
        selection: window.FT.explain.current && window.FT.explain.current.selection,
        visible: !document.getElementById('explainInspector').hidden,
      }));
      if (kind === 'zone') {
        await page.evaluate(() => document.getElementById('modalClose').click());
        await page.waitForTimeout(40);
      }
      await page.evaluate(() => window.FT.explain.clear());
    }
    const legacy = await page.evaluate(() => window.__legacySelections);
    d({ selected, legacy });
    return selected.point.selection.kind === 'point' && selected.point.visible
      && selected.gauge.selection.kind === 'gauge' && legacy.gauge.includes(selected.gauge.selection.id)
      && selected.reservoir.selection.kind === 'reservoir' && legacy.reservoir.includes(selected.reservoir.selection.id)
      && selected.zone.selection.kind === 'zone' && legacy.zone.includes(selected.zone.selection.id);
  });

  await check('inspector links each supported selection to the matching public science section', async (d) => {
    const links = await page.evaluate(() => {
      const selectors = {
        point: { kind: 'point', xKm: 48, yKm: 54 },
        gauge: { kind: 'gauge', id: window.FT.data.GAUGES[0].id },
        reservoir: { kind: 'reservoir', id: window.FT.data.RESERVOIRS[0].id },
        zone: { kind: 'zone', id: window.FT.data.ZONES[0].id },
        road: { kind: 'road', id: 'road:0' },
      };
      return Object.fromEntries(Object.entries(selectors).map(([kind, selector]) => {
        window.FT.explain.select(selector);
        return [kind, document.getElementById('explainDocsLink').href];
      }));
    });
    d(links);
    return links.point === 'https://info.skylabs.vn/visualisation-science.html#depth'
      && links.gauge === 'https://info.skylabs.vn/simulation-engines.html#hydrology-engine'
      && links.reservoir === 'https://info.skylabs.vn/simulation-engines.html#reservoir-engine'
      && links.zone === 'https://info.skylabs.vn/visualisation-science.html#wet-dry'
      && links.road === 'https://info.skylabs.vn/visualisation-science.html#wet-dry';
  });

  await check('real touch selection resolves a stable road selector', async (d) => {
    const p = await mapPoint(page, 'road');
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(80);
    const r = await page.evaluate(() => ({
      pointer: document.getElementById('canvas2d').dataset.lastExplainPointer,
      selection: window.FT.explain.current && window.FT.explain.current.selection,
    }));
    d({ point: p, result: r });
    return r.pointer === 'touch' && r.selection.kind === 'road' && r.selection.id === p.id;
  });

  await check('real clicks in canvas letterbox padding are ignored without an invalid selection or page error', async (d) => {
    await page.evaluate(() => {
      window.FT.explain.clear();
      window.__paddingErrors = [];
      window.addEventListener('error', (event) => window.__paddingErrors.push(event.message), { once: true });
    });
    const point = await mapPaddingPoint(page);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(80);
    const r = await page.evaluate(() => ({
      current: window.FT.explain.current,
      hidden: document.getElementById('explainInspector').hidden,
      errors: window.__paddingErrors,
    }));
    d({ point, result: r });
    return r.current === null && r.hidden && r.errors.length === 0;
  });

  await check('inspector renders contract quantities, status, provenance, confidence, assumptions and limitations', async (d) => {
    await page.evaluate(() => window.FT.explain.select({ kind: 'road', id: 'road:0' }));
    const r = await page.evaluate(() => ({
      hidden: document.getElementById('explainInspector').hidden,
      title: document.getElementById('explainTitle').textContent,
      summary: document.getElementById('explainSummary').textContent,
      quantities: document.querySelectorAll('#explainQuantities [data-quantity-key]').length,
      status: document.getElementById('explainStatus').textContent,
      sources: document.getElementById('explainSources').textContent,
      confidence: document.getElementById('explainConfidence').textContent,
      assumptions: document.getElementById('explainAssumptions').textContent,
      limitations: document.getElementById('explainLimitations').textContent,
    }));
    d(r);
    return !r.hidden && !!r.title && !!r.summary && r.quantities >= 7 && !!r.status
      && /Tổng hợp/.test(r.sources) && !!r.confidence && !!r.assumptions && !!r.limitations;
  });

  await check('inspector visibly renders exact freshness, quality, flags, reasons and uncertainty details', async (d) => {
    const r = await page.evaluate(() => {
      const contract = window.FT.explain.current;
      const available = contract.quantities.find((q) => q.key === 'road_flood_excess');
      const unsupported = contract.quantities.find((q) => q.key === 'arrival_time');
      return {
        quantities: document.getElementById('explainQuantities').textContent,
        confidence: document.getElementById('explainConfidence').textContent,
        expected: {
          age: String(available.age),
          quality: 'Đạt',
          flag: 'Tuổi từ thời điểm phát hành',
          statusReason: 'Vật lý chưa được hỗ trợ',
          confidence: 'Không khả dụng',
          uncertaintyType: 'Không khả dụng',
          uncertaintyReason: 'Đại lượng chưa được tính',
        },
      };
    });
    d(r);
    return r.quantities.includes(r.expected.age)
      && r.quantities.includes(r.expected.quality)
      && r.quantities.includes(r.expected.flag)
      && r.quantities.includes(r.expected.statusReason)
      && r.confidence.includes(r.expected.confidence)
      && r.confidence.includes(r.expected.uncertaintyType)
      && r.confidence.includes(r.expected.uncertaintyReason);
  });

  await check('keyboard arrows expose and move a visible cursor, Enter selects, and Escape restores canvas focus', async (d) => {
    await page.evaluate(() => window.FT.explain.clear());
    await page.focus('#canvas2d');
    const before = await page.evaluate(() => window.FT.map2d.keyboardCursor);
    await page.keyboard.press('ArrowRight');
    const moved = await page.evaluate(() => ({
      cursor: window.FT.map2d.keyboardCursor,
      visible: document.getElementById('canvas2d').dataset.inspectionCursor,
      timeH: window.FT.state.timeH,
    }));
    await page.keyboard.press('Enter');
    const entered = await page.evaluate(() => window.FT.explain.current && window.FT.explain.current.selection);
    await page.keyboard.press('Escape');
    const escaped = await page.evaluate(() => ({
      current: window.FT.explain.current,
      hidden: document.getElementById('explainInspector').hidden,
      active: document.activeElement && document.activeElement.id,
    }));
    d({ before, moved, entered, escaped });
    return moved.visible === 'visible' && moved.cursor.visible
      && (!before.visible || moved.cursor.xKm > before.xKm) && entered.kind === 'point'
      && escaped.current === null && escaped.hidden && escaped.active === 'canvas2d';
  });

  await check('close button clears selection and returns focus to the selecting canvas', async (d) => {
    const p = await mapPoint(page, 'point');
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(60);
    await page.click('#explainClose');
    const r = await page.evaluate(() => ({
      current: window.FT.explain.current,
      hidden: document.getElementById('explainInspector').hidden,
      active: document.activeElement && document.activeElement.id,
    }));
    d(r);
    return r.current === null && r.hidden && r.active === 'canvas2d';
  });

  await check('Escape anywhere inside the inspector closes it and restores the selecting canvas', async (d) => {
    const results = [];
    for (const target of ['explainDocsLink', 'explainClose']) {
      const p = await mapPoint(page, 'point');
      await page.mouse.click(p.x, p.y);
      await page.focus(`#${target}`);
      await page.keyboard.press('Escape');
      results.push(await page.evaluate(() => ({
        current: window.FT.explain.current,
        hidden: document.getElementById('explainInspector').hidden,
        active: document.activeElement && document.activeElement.id,
      })));
    }
    d(results);
    return results.every((r) => r.current === null && r.hidden && r.active === 'canvas2d');
  });

  await check('Method modal keeps its overview and exposes an Explain this state gateway', async (d) => {
    await page.evaluate(() => window.FT.explain.clear());
    await page.evaluate(() => document.getElementById('btnMethod').click());
    const before = await page.evaluate(() => ({
      body: document.getElementById('modalBody').textContent,
      gateway: !!document.getElementById('methodExplainState'),
    }));
    await page.click('#methodExplainState');
    const after = await page.evaluate(() => ({
      modalHidden: document.getElementById('modalScrim').hidden,
      inspectorHidden: document.getElementById('explainInspector').hidden,
      selection: window.FT.explain.current && window.FT.explain.current.selection.kind,
      active: document.activeElement && document.activeElement.id,
      activeVisible: !!document.activeElement && document.activeElement.getClientRects().length > 0,
    }));
    d({ before, after });
    return /shallow-water/i.test(before.body) && before.gateway
      && after.modalHidden && !after.inspectorHidden && after.selection === 'point'
      && ['explainTitle', 'explainClose'].includes(after.active) && after.activeVisible;
  });

  await check('Method-origin selection restores focus without targeting a hidden modal control', async (d) => {
    await page.evaluate(() => {
      window.FT.explain.clear();
      const trigger = document.getElementById('btnMethod');
      trigger.dataset.testStyle = trigger.getAttribute('style') || '';
      window.__methodParent = trigger.parentNode;
      window.__methodNext = trigger.nextSibling;
      document.body.appendChild(trigger);
      trigger.style.cssText = 'position:fixed;left:80px;top:180px;z-index:89;display:block';
    });
    await page.click('#btnMethod');
    await page.click('#methodExplainState');
    await page.click('#explainClose');
    const r = await page.evaluate(() => {
      const active = document.activeElement;
      const style = active && getComputedStyle(active);
      const result = {
        active: active && active.id,
        visible: !!active && style.display !== 'none' && style.visibility !== 'hidden'
          && active.getClientRects().length > 0,
        modalHidden: document.getElementById('modalScrim').hidden,
      };
      const trigger = document.getElementById('btnMethod');
      trigger.setAttribute('style', trigger.dataset.testStyle);
      window.__methodParent.insertBefore(trigger, window.__methodNext);
      delete trigger.dataset.testStyle;
      delete window.__methodParent;
      delete window.__methodNext;
      return result;
    });
    d(r);
    return r.modalHidden && r.visible && r.active === 'btnMethod';
  });

  await check('Vietnamese-first presentation maps every inspector section with equivalent English and preserves contract identity', async (d) => {
    const vi = await page.evaluate(() => {
      window.FT.explain.select({ kind: 'road', id: 'road:0' });
      window.__localizedContract = window.FT.explain.current;
      window.__localizedJSON = JSON.stringify(window.FT.explain.current);
      return {
        quantities: document.getElementById('explainQuantities').textContent,
        sources: document.getElementById('explainSources').textContent,
        confidence: document.getElementById('explainConfidence').textContent,
        assumptions: document.getElementById('explainAssumptions').textContent,
        limitations: document.getElementById('explainLimitations').textContent,
      };
    });
    await page.click('#langToggle');
    const en = await page.evaluate(() => ({
      quantities: document.getElementById('explainQuantities').textContent,
      sources: document.getElementById('explainSources').textContent,
      confidence: document.getElementById('explainConfidence').textContent,
      assumptions: document.getElementById('explainAssumptions').textContent,
      limitations: document.getElementById('explainLimitations').textContent,
      same: window.FT.explain.current === window.__localizedContract,
      unchanged: JSON.stringify(window.FT.explain.current) === window.__localizedJSON,
    }));
    await page.click('#langToggle');
    d({ vi, en });
    return /Ngập vượt nền/.test(vi.quantities)
      && /Chất lượng: Đạt/.test(vi.quantities)
      && /Tuổi từ thời điểm phát hành/.test(vi.quantities)
      && /Vật lý chưa được hỗ trợ/.test(vi.quantities)
      && /Trạng thái SWE trong trình duyệt/.test(vi.sources)
      && /Tổng hợp/.test(vi.sources)
      && /Mức tin cậy: Không khả dụng/.test(vi.confidence)
      && /Bất định: Không khả dụng/.test(vi.confidence)
      && /Đại lượng chưa được tính/.test(vi.confidence)
      && /Thủy văn, diễn toán hồ chứa và ngập lụt là đầu ra tổng hợp/.test(vi.assumptions)
      && /Chưa được hiệu chỉnh hoặc kiểm định cho vận hành thực tế/.test(vi.limitations)
      && /Flood excess/.test(en.quantities)
      && /Quality: OK/.test(en.quantities)
      && /Age from issue time/.test(en.quantities)
      && /Unsupported physics/.test(en.quantities)
      && /In-browser SWE state/.test(en.sources)
      && /Synthetic/.test(en.sources)
      && /Confidence grade: Unavailable/.test(en.confidence)
      && /Uncertainty: Unavailable/.test(en.confidence)
      && /Quantity not computed/.test(en.confidence)
      && /Hydrology, reservoir routing and inundation are synthetic demonstration outputs/.test(en.assumptions)
      && /Not calibrated or validated for operational use/.test(en.limitations)
      && en.same && en.unchanged;
  });

  await check('procedural fallback and planned output labels are translated without changing canonical contract values', async (d) => {
    const vi = await page.evaluate(() => {
      const saved = window.FT.geo.hasDEM;
      window.FT.geo.hasDEM = false;
      window.FT.explain.select({ kind: 'point', xKm: 48, yKm: 48 });
      window.FT.geo.hasDEM = saved;
      window.__fallbackContract = window.FT.explain.current;
      window.__fallbackJSON = JSON.stringify(window.FT.explain.current);
      return {
        quantities: document.getElementById('explainQuantities').textContent,
        confidence: document.getElementById('explainConfidence').textContent,
      };
    });
    await page.click('#langToggle');
    const en = await page.evaluate(() => ({
      quantities: document.getElementById('explainQuantities').textContent,
      confidence: document.getElementById('explainConfidence').textContent,
      same: window.FT.explain.current === window.__fallbackContract,
      unchanged: JSON.stringify(window.FT.explain.current) === window.__fallbackJSON,
    }));
    await page.click('#langToggle');
    d({ vi, en });
    return /Địa hình thủ tục dự phòng/.test(vi.quantities)
      && /Chức năng đã lên kế hoạch/.test(vi.quantities)
      && /Procedural terrain fallback/.test(en.quantities)
      && /Planned functionality/.test(en.quantities)
      && en.same && en.unchanged;
  });

  await check('language changes rerender the same immutable contract object', async (d) => {
    const before = await page.evaluate(() => {
      window.__explainIdentity = window.FT.explain.current;
      return document.getElementById('explainTitle').textContent;
    });
    await page.click('#langToggle');
    const after = await page.evaluate(() => ({
      same: window.FT.explain.current === window.__explainIdentity,
      title: document.getElementById('explainTitle').textContent,
      lang: window.FT.state.lang,
    }));
    await page.click('#langToggle');
    d({ before, after });
    return after.same && after.lang === 'en' && after.title !== before;
  });

  await check('desktop overlay and bounded mobile bottom sheet leave permanent safety signals visible', async (d) => {
    const desktop = await page.evaluate(() => {
      const inspector = document.getElementById('explainInspector').getBoundingClientRect();
      const stage = document.getElementById('stageWrap').getBoundingClientRect();
      return { inspector, stage, position: getComputedStyle(document.getElementById('explainInspector')).position };
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    const mobile = await page.evaluate(() => {
      const inspector = document.getElementById('explainInspector').getBoundingClientRect();
      const signal = document.querySelector('.geoRibbon .ribbonChip') || document.getElementById('opsMode');
      const signalRect = signal && signal.getBoundingClientRect();
      return {
        inspector,
        viewport: { width: innerWidth, height: innerHeight },
        signalVisible: !!signal && getComputedStyle(signal).visibility !== 'hidden' && getComputedStyle(signal).display !== 'none',
        overlapsSignal: !!signalRect && !(inspector.bottom <= signalRect.top || inspector.top >= signalRect.bottom),
      };
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    d({ desktop, mobile });
    return desktop.position === 'absolute' && desktop.inspector.right <= desktop.stage.right + 1
      && desktop.inspector.width < desktop.stage.width * 0.6
      && mobile.inspector.width <= mobile.viewport.width
      && mobile.inspector.height <= mobile.viewport.height * 0.58
      && mobile.signalVisible && !mobile.overlapsSignal;
  });

  await check('a missing zones subsystem yields explicit missing zone quantities', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const saved = FT.zones;
      let contract;
      try {
        FT.zones = null;
        contract = FT.explain.forEntity('zone', FT.data.ZONES[0].id);
      } finally {
        FT.zones = saved;
      }
      const keys = ['zone_max_flood_excess', 'zone_mean_flood_excess', 'zone_exposed_population'];
      return {
        selection: contract.selection,
        quantities: keys.map((key) => contract.quantities.find((q) => q.key === key)),
      };
    });
    d(r);
    return r.selection.kind === 'zone'
      && r.quantities.every((q) => q && q.value === null && q.reason === 'MISSING_DATA')
      && r.quantities.every((q) => q.status === 'UNAVAILABLE_FOR_OPERATIONS'
        && q.quality === 'MISSING' && q.confidence_grade === 'UNAVAILABLE')
      && r.quantities.every((q) => /zone/i.test(q.source_id) && /FT\.zones/.test(q.source_ref));
  });

  await setDegradation(page, 1);
  await check('L1 unrelated feed staleness does not become the model quantity age', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const z = FT.data.ZONES[0];
      const c = FT.explain.atPoint(z.x, z.y);
      const flood = c.quantities.find((q) => q.key === 'flood_excess');
      return { health: c.data_health, flood, expectedDependency: `H:${FT.data.GAUGES[1].id}`, timeH: FT.state.timeH };
    });
    d(r);
    return r.health.level === 1 && r.health.oldest_age_min === 42
      && r.health.missing_quantity === 'gauge_stage' && r.health.missing_dependency === r.expectedDependency
      && Math.abs(r.health.last_valid_time.tH - (r.timeH - 42 / 60)) < 1e-9
      && r.flood.age === 0 && r.flood.status === 'DEGRADED' && r.flood.reason === 'STALE';
  });

  await setDegradation(page, 2);
  await check('L2 health degrades model output without relabeling it as measured', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const z = FT.data.ZONES[0];
      const c = FT.explain.atPoint(z.x, z.y);
      const physical = c.quantities.filter((q) => ['depth', 'flood_excess'].includes(q.key));
      const gauge = FT.explain.forEntity('gauge', FT.data.GAUGES[0].id)
        .quantities.find((q) => q.key === 'gauge_stage');
      const reservoir = FT.explain.forEntity('reservoir', FT.data.RESERVOIRS[0].id)
        .quantities.find((q) => q.key === 'reservoir_stage');
      return { health: c.data_health, physical, gauge, reservoir };
    });
    d(r);
    return r.health.level === 2 && r.health.reason === 'MISSING_DATA'
      && r.physical.every((q) => q.status === 'DEGRADED' && q.reason === 'MISSING_DATA')
      && r.physical.every((q) => q.provenance === 'SYNTHETIC' && q.age === 0)
      && r.gauge.age === 95 && r.reservoir.age === 0;
  });

  await check('L2 degradation names the missing dependency, last valid time, confidence effect and permitted use', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const c = FT.explain.atPoint(48, 48);
      return { health: c.data_health, expectedDependency: `H:${FT.data.GAUGES[0].id}`, timeH: FT.state.timeH };
    });
    d(r);
    return r.health.reason_category === 'MISSING_DATA'
      && r.health.missing_quantity === 'gauge_stage'
      && r.health.missing_dependency === r.expectedDependency
      && r.health.last_valid_time && Math.abs(r.health.last_valid_time.tH - (r.timeH - 95 / 60)) < 1e-9
      && /confidence/i.test(r.health.confidence_effect)
      && r.health.permitted_use === 'DEMO_ONLY_NO_OPERATIONAL_DECISIONS';
  });

  await check('a different oldest feed cannot corrupt the named dependency or its last-valid time', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const original = FT.ops.health;
      const dependency = `H:${FT.data.GAUGES[0].id}`;
      let health;
      try {
        FT.ops.health = () => ({
          level: 2,
          oldest: 600,
          missingCritical: `${FT.data.GAUGES[0].name} — mực nước sông`,
          feeds: [
            { id: dependency, name: `${FT.data.GAUGES[0].name} — mực nước sông`, critical: true, ageMin: 95 },
            { id: 'tide', name: 'Triều / nước dâng', critical: false, ageMin: 600 },
          ],
        });
        health = FT.explain.atPoint(48, 48).data_health;
      } finally {
        FT.ops.health = original;
      }
      return { health, dependency, timeH: FT.state.timeH };
    });
    d(r);
    return r.health.oldest_age_min === 600
      && r.health.missing_quantity === 'gauge_stage'
      && r.health.missing_dependency === r.dependency
      && Math.abs(r.health.last_valid_time.tH - (r.timeH - 95 / 60)) < 1e-9;
  });

  await check('degradation evidence is visible in the inspector in Vietnamese and equivalent English', async (d) => {
    const vi = await page.evaluate(() => {
      window.FT.explain.select({ kind: 'point', xKm: 48, yKm: 48 });
      const section = document.getElementById('explainDegradation');
      return { text: section ? section.textContent : '', dependency: window.FT.explain.current.data_health.missing_dependency };
    });
    await page.click('#langToggle');
    const en = await page.evaluate(() => ({
      text: document.getElementById('explainDegradation')?.textContent || '',
      dependency: window.FT.explain.current.data_health.missing_dependency,
    }));
    await page.click('#langToggle');
    d({ vi, en });
    return /Thiếu dữ liệu/.test(vi.text) && /Phụ thuộc bị thiếu/.test(vi.text)
      && /mực nước sông/.test(vi.text) && vi.text.includes(`[${vi.dependency}]`)
      && /Thời điểm hợp lệ gần nhất/.test(vi.text) && /Không dùng cho quyết định vận hành/.test(vi.text)
      && /Missing data/.test(en.text) && /Missing dependency/.test(en.text)
      && /river stage/i.test(en.text) && en.text.includes(`[${en.dependency}]`)
      && /Last valid time/.test(en.text) && /No operational decisions/.test(en.text)
      && vi.dependency === en.dependency;
  });

  await check('every degraded feed maps to a stable quantity key with equivalent Vietnamese and English labels', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const originalHealth = FT.ops.health;
      const gauge = FT.data.GAUGES[0];
      const reservoir = FT.data.RESERVOIRS[0];
      const cases = [
        { id: `H:${gauge.id}`, name: `${gauge.name} — mực nước sông`, quantity: 'gauge_stage', vi: ['Mực nước trạm', 'mực nước sông'], en: ['Gauge stage', 'river stage'] },
        { id: `Z:${reservoir.id}`, name: `${reservoir.name} — mực nước`, quantity: 'reservoir_stage', vi: ['Mực hồ', 'mực nước hồ'], en: ['Reservoir stage', 'reservoir level'] },
        { id: 'rain', name: 'Mưa lưu vực', quantity: 'basin_rainfall', vi: ['Mưa lưu vực', 'Mưa lưu vực'], en: ['Basin rainfall', 'Basin rainfall'] },
        { id: 'qpf', name: 'Dự báo mưa tổ hợp', quantity: 'ensemble_rainfall_forecast', vi: ['Dự báo mưa tổ hợp', 'Dự báo mưa tổ hợp'], en: ['Ensemble rainfall forecast', 'Ensemble rainfall forecast'] },
        { id: 'tide', name: 'Triều / nước dâng', quantity: 'tide_stage', vi: ['Mực triều / nước dâng', 'Triều / nước dâng'], en: ['Tide / storm-surge stage', 'Tide / storm surge'] },
        { id: 'gates', name: 'Vị trí cửa van (SCADA)', quantity: 'gate_position', vi: ['Vị trí cửa van', 'Vị trí cửa van (SCADA)'], en: ['Gate position', 'Gate position (SCADA)'] },
      ];
      const results = [];
      try {
        for (const item of cases) {
          FT.ops.health = () => ({
            level: 2,
            oldest: 95,
            missingCritical: item.name,
            feeds: [{ id: item.id, name: item.name, critical: true, ageMin: 95 }],
          });
          FT.i18n.setLang('vi');
          FT.explain.select({ kind: 'point', xKm: 48, yKm: 48 });
          const contract = FT.explain.current;
          const viText = document.getElementById('explainDegradation').textContent;
          FT.i18n.setLang('en');
          const enText = document.getElementById('explainDegradation').textContent;
          results.push({
            id: item.id,
            quantity: contract.data_health.missing_quantity,
            dependency: contract.data_health.missing_dependency,
            identityStable: contract === FT.explain.current,
            viText,
            enText,
            expected: item,
          });
        }
      } finally {
        FT.ops.health = originalHealth;
        FT.i18n.setLang('vi');
      }
      return results;
    });
    d(r);
    return r.length === 6 && r.every((item) => item.quantity === item.expected.quantity
      && item.dependency === item.id && item.identityStable
      && item.viText.includes(item.expected.vi[0]) && item.viText.includes(item.expected.vi[1])
      && item.enText.includes(item.expected.en[0]) && item.enText.includes(item.expected.en[1])
      && item.viText.includes(`[${item.id}]`) && item.enText.includes(`[${item.id}]`));
  });

  await setDegradation(page, 3);
  await check('L3 cached operation degrades usability without assigning global feed age', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const z = FT.data.ZONES[0];
      const c = FT.explain.atPoint(z.x, z.y);
      const flood = c.quantities.find((q) => q.key === 'flood_excess');
      return { health: c.data_health, flood, expectedDependency: `Z:${FT.data.RESERVOIRS[0].id}`, timeH: FT.state.timeH };
    });
    d(r);
    return r.health.level === 3 && r.health.oldest_age_min === 180
      && r.health.missing_quantity === 'reservoir_stage' && r.health.missing_dependency === r.expectedDependency
      && Math.abs(r.health.last_valid_time.tH - (r.timeH - 180 / 60)) < 1e-9
      && r.flood.age === 0 && r.flood.status === 'DEGRADED'
      && r.flood.reason === 'STALE' && r.flood.provenance === 'SYNTHETIC';
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
      && r.physical.every((q) => q.age === 0)
      && r.physical.every((q) => Number.isFinite(q.value));
  });

  await check('L4 degradation refuses operational use while retaining the last valid observation time', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      return {
        health: FT.explain.atPoint(48, 48).data_health,
        expectedDependency: `Z:${FT.data.RESERVOIRS[0].id}`,
        timeH: FT.state.timeH,
      };
    });
    d(r);
    return r.health.reason_category === 'MISSING_DATA'
      && r.health.missing_quantity === 'reservoir_stage'
      && r.health.missing_dependency === r.expectedDependency
      && Math.abs(r.health.last_valid_time.tH - (r.timeH - 600 / 60)) < 1e-9
      && r.health.confidence_effect === 'UNAVAILABLE_FOR_OPERATIONS'
      && r.health.permitted_use === 'DEMO_ONLY_NO_OPERATIONAL_DECISIONS';
  });

  await check('all governed reason categories normalize into contracts, including quality rejection and model failure', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const expected = ['MISSING_DATA', 'STALE', 'QUALITY_REJECTED', 'MODEL_FAILURE', 'UNSUPPORTED_PHYSICS', 'PLANNED'];
      const original = FT.ops.health;
      const base = original();
      const normalized = {};
      try {
        for (const reasonCode of ['QUALITY_REJECTED', 'MODEL_FAILURE']) {
          FT.ops.health = () => ({ ...base, level: 4, reasonCode, missingCritical: 'synthetic-test-feed' });
          const c = FT.explain.atPoint(48, 48);
          normalized[reasonCode] = {
            health: c.data_health.reason_category,
            quantities: [...new Set(c.quantities.filter((q) => q.value !== null).map((q) => q.reason))],
          };
        }
      } finally {
        FT.ops.health = original;
      }
      const point = FT.explain.atPoint(48, 48);
      return {
        categories: FT.explain.reasonCategories,
        normalized,
        unsupported: point.quantities.find((q) => q.key === 'velocity').reason,
        planned: point.quantities.find((q) => q.key === 'arrival_time').reason,
      };
    });
    d(r);
    return JSON.stringify(r.categories) === JSON.stringify(['MISSING_DATA', 'STALE', 'QUALITY_REJECTED', 'MODEL_FAILURE', 'UNSUPPORTED_PHYSICS', 'PLANNED'])
      && r.normalized.QUALITY_REJECTED.health === 'QUALITY_REJECTED'
      && r.normalized.QUALITY_REJECTED.quantities.includes('QUALITY_REJECTED')
      && r.normalized.MODEL_FAILURE.health === 'MODEL_FAILURE'
      && r.normalized.MODEL_FAILURE.quantities.includes('MODEL_FAILURE')
      && r.unsupported === 'UNSUPPORTED_PHYSICS' && r.planned === 'PLANNED';
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
