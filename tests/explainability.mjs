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
        schema: contract.schema,
        keys: Object.keys(contract).sort(),
        expected: [
          'assumptions', 'data_health', 'issue_time', 'limitations', 'policy',
          'quantities', 'scenario', 'schema', 'selection', 'sources', 'valid_time',
        ].sort(),
        validTime: contract.valid_time,
        issueTime: contract.issue_time,
      };
    });
    d(r);
    return r.schema === 'floodtwin.explain/v1'
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
        'confidence_grade', 'interpolation', 'key', 'model_id', 'model_version',
        'no_data_semantics', 'provenance', 'quality_flags', 'reason', 'source_id',
        'spatial_support', 'status', 'uncertainty_representation', 'unit', 'value',
      ].sort();
      return {
        count: quantities.length,
        bad: quantities.filter((q) => JSON.stringify(Object.keys(q).sort()) !== JSON.stringify(expected))
          .map((q) => ({ key: q.key, fields: Object.keys(q).sort() })),
        invalidValue: quantities.filter((q) => q.value !== null && !Number.isFinite(q.value)).map((q) => q.key),
      };
    });
    d(r);
    return r.count >= 7 && r.bad.length === 0 && r.invalidValue.length === 0;
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

  await check('forEntity resolves gauge, reservoir, zone and stable road selectors', async (d) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const cases = [
        ['gauge', FT.data.GAUGES[0].id],
        ['reservoir', FT.data.RESERVOIRS[0].id],
        ['zone', FT.data.ZONES[0].id],
        ['road', 'road:0'],
      ];
      return cases.map(([kind, id]) => {
        const c = FT.explain.forEntity(kind, id);
        return {
          asked: { kind, id },
          got: { kind: c.selection.kind, id: c.selection.id },
          schema: c.schema,
          quantityKeys: c.quantities.map((q) => q.key),
        };
      });
    });
    d(r);
    return r.every((x) => x.schema === 'floodtwin.explain/v1'
      && x.got.kind === x.asked.kind && x.got.id === x.asked.id
      && x.quantityKeys.length > 0)
      && r.find((x) => x.asked.kind === 'road').got.id === 'road:0';
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
        firstSchema: events[0] && events[0].schema,
        last: events[events.length - 1],
      };
    });
    d(r);
    return r.frozen && r.mutationBlocked && r.sameCurrent && r.cleared === null
      && r.current === null && r.eventCount === 2
      && r.firstSchema === 'floodtwin.explain/v1' && r.last === null;
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
