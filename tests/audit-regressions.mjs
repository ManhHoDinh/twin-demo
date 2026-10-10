import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const memory = new Map();
let seed = 42;
const math = Object.create(Math);
math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
const ctx = vm.createContext({ console, setTimeout, performance, Math: math,
  addEventListener() {}, localStorage: { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) } });
ctx.window = ctx;
for (const file of ['core', 'geo', 'data', 'hydro', 'decision', 'forecast', 'lifecycle',
  'ai/ml-hydrology', 'ai/data-assimilation', 'ai/data-pipeline', 'ai/training', 'ai/validation', 'ai/llm-integration', 'ai/risk-engine', 'ai/ai-manager']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', file + '.js'), 'utf8'), ctx, {filename: file});
}
const FT = ctx.FT, H = FT.hydro;
let count = 0;
async function check(label, fn) { await fn(); console.log('PASS ' + label); count++; }
await check('all scenarios, scales and policies conserve reservoir water at every step', () => {
  for (const scenario of Object.keys(FT.data.SCENARIOS)) for (const scale of [.5, 1, 1.8]) {
    FT.state.scenario = scenario; FT.state.rainScale = scale; H.rebuild();
    for (const def of FT.data.RESERVOIRS) for (const policy of ['rule', 'mpc']) {
      const r = H.res[def.id][policy];
      for (let i = 0; i < H.NT; i++) {
        assert.ok(Math.abs(r.S[i] - (i ? r.S[i - 1] : r.initialStorage) - (r.I[i] - r.O[i]) * H.DT * .0036) < 1e-9);
        assert.ok(r.S[i] >= def.deadM - 1e-9);
      }
    }
  }
});
await check('decision, gauge and mixed-policy snapshot use identical stage series', () => {
  FT.state.scenario = 'oct2020'; FT.state.rainScale = 1; H.rebuild();
  const selection = H.normalizeSelection({ avuong: 'mpc' });
  for (const g of FT.data.GAUGES) {
    const series = FT.ops.stageSeries(g, selection), ensemble = H.ensemble(g.id, selection);
    for (let i = 0; i < H.NT; i++) {
      assert.equal(series[i], ensemble.med[i]);
      assert.equal(H.at(H.t[i], selection).gauges[g.id].stage, series[i]);
    }
    assert.ok([...H.stageSeries(g, 'rule')].every((v, i) => v === H.gauge[g.id].rule.med[i]));
  }
});
await check('exceedance uses original spread despite clipped quantiles', () => {
  const e = H.gauge.giaoThuy.rule, t = 20;
  assert.equal(FT.forecast.pExceed('giaoThuy', 8.8, t), 1 - H.probabilityBelow(e, 8.8, t));
  assert.ok(FT.forecast.pExceed('giaoThuy', 8.8, t) < 1);
});
await check('closure during traversal is rejected; a risk slowdown extends traversal', () => {
  const F = FT.forecast, original = F.edgeClsAt;
  const edge = {a: 'a', b: 'b', len: 10, speed: 10};
  FT.world = {roads: {nodes: {a: {}, b: {}}, neighbors: {a: [edge], b: [edge]}}};
  F.edgeClsAt = (_, t) => t >= .25 ? 3 : 0;
  assert.equal(F.routeAt('a', 'b', 0, 1), null);
  F.edgeClsAt = (_, t) => t >= .25 ? 2 : 0;
  assert.equal(F.routeAt('a', 'b', 0, 1).timeH, 2);
  F.edgeClsAt = (_, t) => t >= .25 && t < .75 ? 3 : 0;
  assert.equal(F.routeAt('a', 'b', 0, 1), null);
  F.edgeClsAt = original;
});
await check('shelter assignment and basin capacity validate safety at arrival', () => {
  const F = FT.forecast, D = FT.data;
  const saved = {shelters: D.SHELTERS, zones: D.ZONES, world: FT.world, exposure: FT.zones,
    state: F.shelterState, route: F.routeViability, calibration: F.ensureCalibrated};
  try {
    D.SHELTERS = [{id: 'test-site', node: 'b'}]; D.ZONES = [{id: 'test-zone', node: 'a', pop: 100}];
    FT.world = {ready: true}; FT.zones = {list: [{exposed: 100}], byId: () => ({exposed: 100})};
    F.ensureCalibrated = () => {};
    F.routeViability = () => ({ok: true, timeH: 1, lastDeparture: 10});
    F.shelterState = (_, t) => ({valid: t < 1, capacity: 100});
    assert.equal(F.assignShelter(D.ZONES[0], 0), null);
    const allocation = F.allocateShelters(0);
    assert.equal(allocation.totalAssigned, 0); assert.equal(allocation.totalUnsheltered, 100);
    assert.equal(allocation.reachableCapacity, 0);
  } finally {
    D.SHELTERS = saved.shelters; D.ZONES = saved.zones; FT.world = saved.world; FT.zones = saved.exposure;
    F.shelterState = saved.state; F.routeViability = saved.route; F.ensureCalibrated = saved.calibration;
  }
});
const pipeline = new FT.AIData.DataPipeline();
await check('ten days × four gauges align by epoch timestamp on cold and warm cache', async () => {
  for (let i = 0; i < 2; i++) {
    const d = await pipeline.buildCAMELSDataset('vgtb', {startDate: '2024-01-01', endDate: '2024-01-10'});
    assert.equal(d.forcing.dates.length, 10); assert.equal(d.observations.dates.length, 10);
    for (const g of Object.values(d.observations.gauges)) assert.ok(g.discharge.every(Number.isFinite));
    assert.ok(d.observations.dates.every((v, j) => +v === +d.forcing.dates[j]));
  }
  const zeros = pipeline.buildObservationDataset({x: [{timestamp: new Date('2024-01-01'), discharge: 0, stage: 0}]});
  assert.equal(zeros.gauges.x.discharge[0], 0);
  const scaler = new FT.AITraining.DataScaler(); scaler.fit('q', [0, 1, 2], 'log');
  assert.equal(scaler.transform('q', null), null); assert.equal(scaler.transform('q', 0), 0);
});
await check('chronological windows, physical units, log targets and timestamps are consistent', async () => {
  const d = await pipeline.buildCAMELSDataset('vgtb', {startDate: '2024-01-01', endDate: '2024-05-01'});
  const {train, val} = new FT.AITraining.TrainingDataLoader(d).prepare(4, 2);
  assert.ok(Math.max(...train.map(s => s.endIndex + 2)) <= Math.min(...val.map(s => s.endIndex - 4)));
  assert.equal(train[0].input[0][0], d.forcing.precipitation[0]);
  assert.ok(Math.abs(Math.expm1(train[0].target) - train[0].targetRaw) < 1e-9);
  assert.ok(+new Date(train[0].endTime) > Date.UTC(2023, 0, 1));
  for (const mutate of [x => x.forcing.precipitation[0] = -1, x => x.forcing.humidity[0] = 2,
    x => x.observations.gauges.aiNghia.discharge.pop(), x => x.observations.gauges.aiNghia.discharge[0] = -1]) {
    const bad = JSON.parse(JSON.stringify(d)); mutate(bad);
    assert.throws(() => new FT.AITraining.TrainingDataLoader(bad).prepare(4, 2));
  }
});
await check('default 128-unit model returns finite deterministic outputs and validates weights', () => {
  const m = new FT.AITraining.TrainableMCLSTM();
  const x = [[10, 28, .75, 200, 2], [15, 29, .8, 220, 3]];
  const y = m.forward(x);
  assert.ok(Number.isFinite(y)); assert.equal(y, m.forward(x));
  const saved = m.save(); const other = new FT.AITraining.TrainableMCLSTM({hiddenSize: 4}); other.load(saved);
  assert.equal(other.forward(x), y);
  const bad = JSON.parse(saved); bad.weights.Wxi[0] = [];
  assert.throws(() => other.load(bad));
});
await check('BPTT gradients match finite differences and training reduces log-MSE', () => {
  const m = new FT.AITraining.TrainableMCLSTM({hiddenSize: 3});
  const x = [[10, 28, .75, 200, 2], [15, 29, .8, 220, 3]], target = 3;
  let gradients;
  const update = m.updateWeights; m.updateWeights = g => { gradients = g; };
  m.gradientUpdate(m.forward(x), target);
  for (const key of ['Wxi', 'Whf', 'Wxg', 'Who', 'readout', 'bias']) {
    const matrix = Array.isArray(m.weights[key]?.[0]), vector = Array.isArray(m.weights[key]);
    const get = () => matrix ? m.weights[key][0][0] : vector ? m.weights[key][0] : m.weights[key];
    const set = v => { if (matrix) m.weights[key][0][0] = v; else if (vector) m.weights[key][0] = v; else m.weights[key] = v; };
    const v = get(), epsilon = 1e-5;
    set(v + epsilon); const plus = (m.forward(x) - target) ** 2;
    set(v - epsilon); const minus = (m.forward(x) - target) ** 2; set(v);
    const analytic = matrix ? gradients[key][0][0] : vector ? gradients[key][0] : gradients[key];
    assert.ok(Math.abs(analytic - (plus - minus) / (2 * epsilon)) < 1e-5, key);
  }
  m.updateWeights = update;
  const before = (m.forward(x) - target) ** 2;
  for (let i = 0; i < 100; i++) m.gradientUpdate(m.forward(x), target, .02);
  assert.ok((m.forward(x) - target) ** 2 < before * .1);
});
await check('each sparse gauge observation leaves the full EnKF finite and reduces innovation', () => {
  for (const id of ['aiNghia', 'cauLau', 'giaoThuy', 'camLe']) {
    const filter = new FT.AI.EnsembleKalmanFilter();
    const index = ['aiNghia', 'cauLau', 'giaoThuy', 'camLe'].indexOf(id);
    const mean = () => filter.getObservationEnsemble().reduce((s, row) => s + row[index], 0) / filter.ensembleSize;
    const prior = mean(), obs = prior + .2;
    filter.analyze({[id]: obs}, .1);
    assert.ok(filter.ensemble.every(row => [...row].every(Number.isFinite)));
    assert.ok(Math.abs(mean() - obs) < Math.abs(prior - obs));
  }
  const manager = new FT.AI.DataAssimilationManager();
  manager.addObservation('camLe', 2, 0); manager.runCycle();
  assert.equal(manager.lastUpdateTime, 0);
  manager.addObservation('aiNghia', 6, 1); manager.runCycle();
  assert.equal(manager.lastUpdateTime, 1); assert.equal(manager.observations.length, 0);
});
await check('tank members differ, conserve mass and commit only one forcing step', async () => {
  const a = new FT.AI.MCLSTMModel(), b = new FT.AI.MCLSTMModel(); await a.load(); await b.load();
  const forcing = {rainfall: 10, evaporation: .1};
  const y = a.predict(forcing, 48); b.predict(forcing, 1);
  assert.ok([...y.std].some(v => v > 0));
  for (let i = 0; i < a.ensemble.length; i++) {
    assert.equal(a.ensemble[i].surfaceStorage, b.ensemble[i].surfaceStorage);
    assert.ok(a.ensemble[i].lastLedger.every(l => Math.abs(l.residualMm) < 1e-10));
  }
  const previous = a.ensemble[0].surfaceStorage; a.predict(forcing, 1);
  assert.ok(a.ensemble[0].surfaceStorage > previous);
});
await check('numeric metrics and dated scenario subsets are evaluated correctly', async () => {
  const validator = new FT.AIValidation.Validator();
  const recommendations = validator.generateRecommendations({metrics: {overall: {nse: 1, kge: 1, csi: 1}}, speed: {meetsTarget: null}});
  assert.equal(recommendations.length, 0);
  const scenarios = await validator.validateByScenario({forward: () => Math.log1p(10)}, [{input: [], targetRaw: 10, endTime: '2024-06-01'}]);
  assert.equal(scenarios.testing.nSamples, 1);
});
await check('degenerate metrics remain null and risk arrival times respect each threshold', () => {
  const calculator = new FT.AIValidation.MetricsCalculator();
  for (const [a, b] of [[[], []], [[0, 0], [0, 0]], [[1, 1], [1, 1]]]) {
    const m = calculator.calculateAll(a, b);
    assert.equal(m.nse, null); assert.equal(m.kge, null);
  }
  const validator = new FT.AIValidation.Validator();
  validator.results = {metrics: {overall: calculator.calculateAll([0, 0], [0, 0])}, speed: {speedup: null, meetsTarget: null}};
  assert.match(validator.generateReport(), /N\/A/); assert.match(validator.generateReport(), /UNVERIFIED/);
  const engine = new FT.AI.RiskEngine({numSimulations: 10});
  const sample = engine._simulateScenario({median: [6, 7, 8, 9], spread: [0, 0, 0, 0]}, 'aiNghia', 4, 0);
  assert.equal(engine._computeExpectedTime([sample], 6.5), 2);
  assert.equal(engine._computeExpectedTime([sample], 8), 3);
  assert.equal(engine._computeExpectedTime([sample], 9), 4);
  assert.equal(sample.peakTime, 4);
});
await check('gauge predictions have isolated state and validation cannot advance live models', async () => {
  await FT.AI.initialize({features: {USE_ML_HYDROLOGY: true, USE_LLM: false}});
  const a = await FT.AI.predictStreamflow('aiNghia', 10, 2);
  const b = await FT.AI.predictStreamflow('cauLau', 10, 2);
  assert.deepEqual(a.median, b.median);
  const reference = new FT.AI.MCLSTMModel(); await reference.load();
  reference.predict({rainfall: 10, evaporation: .1}, 2);
  const data = await pipeline.buildCAMELSDataset('vgtb', {startDate: '2024-01-01', endDate: '2024-02-01'});
  data.resolution = 'hourly'; data.metadata.stepHours = 1;
  data.forcing.dates = data.forcing.dates.map((_, i) => new Date(Date.UTC(2024, 0, 1) + i * 3600000));
  data.observations.dates = [...data.forcing.dates];
  const metrics = await FT.AI.calculateModelMetrics('aiNghia', data);
  assert.equal(metrics.samples, 31); assert.ok(Number.isFinite(metrics.rmse));
  const next = await FT.AI.predictStreamflow('aiNghia', 10, 2);
  assert.deepEqual(Array.from(next.median), Array.from(reference.predict({rainfall: 10, evaporation: .1}, 2).median));
  await FT.AI.initialize({features: {USE_ML_HYDROLOGY: false}});
  assert.equal(await FT.AI.predictStreamflow('aiNghia', 10, 2), null);
});
await check('local brief generator is wired and never calls a network provider', async () => {
  ctx.fetch = () => { throw new Error('Network must not be used'); };
  await FT.AI.initialize({features: {USE_LLM: true, USE_ML_HYDROLOGY: false, USE_DATA_ASSIMILATION: false, USE_RISK_ENGINE: false}});
  const result = await FT.AI.generateBrief({}); assert.ok(result);
  assert.equal(FT.AI.LLM_CONFIG.provider, 'mock');
});
console.log(`Audit unit regressions: ${count} passed`);
