/* Canonical local training/validation/export pipeline; no external data calls. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
let seed = Number(option('--seed', 42)) >>> 0;
const math = Object.create(Math);
math.random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 2 ** 32; };
const context = vm.createContext({console, setTimeout, performance, Math: math});
context.window = context; context.FT = {AI: {}};
for (const f of ['training', 'validation']) vm.runInContext(fs.readFileSync(path.join(root, 'js/ai', f + '.js'), 'utf8'), context);
const {TrainingDataLoader, TrainableMCLSTM, Trainer} = context.FT.AITraining;

function syntheticDataset() {
  const forcing = {dates: [], precipitation: [], temperature: [], humidity: [], radiation: [], wind: []};
  const observations = {dates: [], gauges: {aiNghia: {discharge: []}}};
  let surface = 0, sub = 0, ground = 0;
  for (let i = 0; i < 720; i++) {
    const rain = math.random() < .35 ? math.random() * 20 : 0;
    const date = new Date(Date.UTC(2024, 0, 1) + i * 3600000).toISOString();
    forcing.dates.push(date); observations.dates.push(date);
    forcing.precipitation.push(rain); forcing.temperature.push(28 + 2 * Math.sin(i / 24));
    forcing.humidity.push(.75); forcing.radiation.push(200); forcing.wind.push(2);
    surface += rain;
    const evap = Math.min(surface, .1); surface -= evap;
    const inf = surface * .1; surface -= inf; sub += inf;
    const perc = sub * .05; sub -= perc; ground += perc;
    const out = surface * .28 + sub * .12 + ground * .025;
    surface *= .72; sub *= .88; ground *= .975;
    observations.gauges.aiNghia.discharge.push(out * 5100 * 1000 / 3600);
  }
  return {forcing, observations, resolution: 'hourly', metadata: {synthetic: true, stepHours: 1,
    source: 'seeded conservative tank fixture; not measured observations'}};
}

async function main() {
  const datasetPath = option('--dataset', null);
  const data = datasetPath ? JSON.parse(fs.readFileSync(path.resolve(datasetPath), 'utf8')) : syntheticDataset();
  const gaugeId = option('--gauge', Object.keys(data.observations.gauges)[0]);
  if (!data.observations.gauges[gaugeId]) throw new Error('Gauge is absent in dataset');
  data.observations.gauges = {[gaugeId]: data.observations.gauges[gaugeId]};
  const sequenceLength = Number(option('--sequence', 12)), horizon = Number(option('--horizon', 1));
  const epochs = Number(option('--epochs', 12)), hiddenSize = Number(option('--hidden', 8));
  if (!Number.isInteger(epochs) || epochs < 1 || epochs > 1000) throw new Error('Invalid epochs');
  const loader = new TrainingDataLoader(data);
  const {train, val: holdout, split} = loader.prepare(sequenceLength, horizon);
  // Last holdout segment is never used for early stopping or model selection.
  const boundary = holdout[Math.floor(holdout.length / 2)].endIndex;
  const val = holdout.filter(s => s.endIndex + horizon <= boundary);
  const test = holdout.filter(s => s.endIndex - sequenceLength >= boundary);
  if (!val.length || !test.length) throw new Error('Not enough data for separate validation/test windows');
  const model = new TrainableMCLSTM({hiddenSize});
  const trainer = new Trainer(model, {epochs, batchSize: 32, learningRate: .01, earlyStoppingPatience: 5});
  await trainer.train(train, val);
  const calculate = samples => model.computeMetrics(samples.map(s => Math.expm1(model.forward(s.input))), samples.map(s => s.targetRaw));
  const metrics = {validation: calculate(val), test: calculate(test)};
  for (const key of ['rmse', 'nse', 'kge']) if (!Number.isFinite(metrics.test[key])) throw new Error('Non-finite test metric: ' + key);
  const artifact = JSON.parse(model.save());
  artifact.metadata = {...data.metadata, gaugeId, seed: Number(option('--seed', 42)),
    stepHours: data.metadata?.stepHours ?? (data.resolution === 'hourly' ? 1 : 24),
    sequenceLength, targetHorizonSteps: horizon, outputUnits: 'm3/s',
    featureOrder: ['precipitation_mm_per_step', 'temperature_C', 'humidity_fraction', 'radiation_Wm2', 'wind_ms'],
    trainingPeriod: [train[0].endTime, train[train.length - 1].endTime],
    validationPeriod: [val[0].endTime, val[val.length - 1].endTime],
    testPeriod: [test[0].endTime, test[test.length - 1].endTime],
    source: datasetPath ? data.metadata?.source || 'User supplied local dataset; provenance unverified' : data.metadata.source,
    fieldValidated: false};
  const output = path.resolve(option('--output', path.join(root, 'artifacts/local-ai')));
  fs.mkdirSync(output, {recursive: true});
  fs.writeFileSync(path.join(output, 'model.json'), JSON.stringify(artifact, null, 2));
  const report = {architecture: artifact.architecture, metadata: artifact.metadata, split,
    samples: {train: train.length, validation: val.length, test: test.length}, metrics,
    bestValidationLogMSE: trainer.bestValLoss, history: trainer.history,
    claims: {realDataValidation: false, calibratedUncertainty: false, matchedHydraulicBenchmark: false}};
  fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2));
  const rows = ['timestamp,gauge_id,observed_m3s,predicted_m3s,split'];
  for (const [label, samples] of [['validation', val], ['test', test]]) for (const sample of samples) {
    rows.push([sample.endTime, gaugeId, sample.targetRaw, Math.expm1(model.forward(sample.input)), label].join(','));
  }
  fs.writeFileSync(path.join(output, 'predictions.csv'), rows.join('\n') + '\n');
  const table = ['# Local validation — ' + (artifact.metadata.synthetic ? 'SYNTHETIC' : 'USER-SUPPLIED, UNVERIFIED'),
    '', 'Architecture: single-layer LSTM baseline; log1p discharge loss. Field validation: absent.', '',
    '| Split | Samples | NSE | KGE | CSI | RMSE (m³/s) | PBIAS (%) |', '|---|---:|---:|---:|---:|---:|---:|'];
  for (const label of ['validation', 'test']) {
    const m = metrics[label];
    table.push('| ' + [label, report.samples[label], m.nse, m.kge, m.csi, m.rmse, m.pbias].join(' | ') + ' |');
  }
  fs.writeFileSync(path.join(output, 'validation.md'), table.join('\n') + '\n');
  const fixture = {input: test[0].input, expectedDischarge: Math.expm1(model.forward(test[0].input))};
  fs.writeFileSync(path.join(output, 'parity.json'), JSON.stringify(fixture));
  console.log(JSON.stringify({output, samples: report.samples, metrics}, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
