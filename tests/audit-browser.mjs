import assert from 'node:assert/strict';
import {listen} from './serve.mjs';
import {launchGpu} from './browser.mjs';
import {bootApp, setTime, setPolicy, signOnRole, ROLE} from './harness.mjs';
const server = await listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await launchGpu();
let count = 0;
async function check(name, fn) { await fn(); console.log('PASS ' + name); count++; }
try {
  const {page, ctx} = await bootApp(browser, base);
  await setPolicy(page, 'mpc');
  await page.evaluate(() => { FT.state.rainScale = .5; FT.hydro.rebuild(); });
  await setTime(page, -6);
  await check('modal approval cannot bypass identity or reason gate', async () => {
    const result = await page.evaluate(() => {
      document.getElementById('mpcDetails').click();
      document.getElementById('dpReasonInput').value = 'anonymous modal probe';
      document.getElementById('dpApprove').click();
      return {approved: FT.state.mpcApproved, count: FT.ops.audit.entries.filter(e => e.action === 'decision.approve').length,
        modalHidden: document.getElementById('modalScrim').hidden};
    });
    assert.equal(result.approved, false); assert.equal(result.count, 0); assert.equal(result.modalHidden, false);
    await signOnRole(page, ROLE.authority);
    const missing = await page.evaluate(() => {
      document.getElementById('dpReasonInput').value = '';
      document.getElementById('dpApprove').click(); return FT.state.mpcApproved;
    });
    assert.equal(missing, false);
  });
  await check('reasoned modal approval seals operator identity, audit reference and build version', async () => {
    const result = await page.evaluate(() => {
      document.getElementById('dpReasonInput').value = 'Reviewed feasible local proposal';
      document.getElementById('dpApprove').click();
      const record = FT.record.last();
      const audit = [...FT.ops.audit.entries].reverse().find(e => e.action === 'decision.approve');
      return {approved: FT.state.mpcApproved, record, audit, version: FT.BUILD_VERSION,
        lifecycle: FT.lifecycle.classifyDecision(FT.ops._last)};
    });
    assert.equal(result.approved, true);
    assert.equal(result.record.actor.name, result.audit.detail.actorIdentity.name);
    assert.equal(result.record.reason, result.audit.reason);
    assert.equal(result.record.audit_seq, result.audit.seq);
    assert.equal(result.record.versions.app_version, result.version);
    assert.equal(result.lifecycle, 'APPROVED_PLAN');
  });
  await check('mixed preview matches its reservoir selection, export remains recommendation', async () => {
    const result = await page.evaluate(() => {
      FT.compare.reset(); FT.compare.createBaseSnapshot();
      FT.compare.addOption({id: 'rule-probe', kind: 'RULE', label: 'Rule'});
      FT.compare.addOption({id: 'single-probe', kind: 'SINGLE', label: 'Single', selection: {avuong: 'mpc'}});
      FT.compare.selectOption('single-probe');
      const selection = FT.compare.viewSelection();
      const id = FT.data.GAUGES[0].id;
      const difference = FT.hydro.viewEnsemble(id).med.some((v, i) => v !== FT.hydro.gauge[id].mpc.med[i]);
      const exported = FT.compare.exportRecommendation('rule-probe');
      const unrelated = FT.lifecycle.classifyDecision({kind: 'PROPOSAL', id: 'unrelated'});
      FT.compare.reset();
      return {selection, difference, exported, unrelated, approved: FT.state.mpcApproved};
    });
    assert.equal(result.selection.avuong, 'mpc'); assert.equal(result.selection.songbung4, 'rule');
    assert.equal(result.difference, true); assert.equal(result.approved, true);
    assert.equal(result.exported.ok, true); assert.equal(result.exported.lifecycleClass, 'RECOMMENDATION');
    assert.equal(result.unrelated, 'RECOMMENDATION');
  });
  await check('forcing change invalidates approval and saturated proposal cannot be applied', async () => {
    const result = await page.evaluate(() => {
      FT.state.rainScale = 1; FT.hydro.rebuild();
      const invalidated = !FT.state.mpcApproved;
      const snap = FT.hydro.at(FT.state.timeH); FT.ui.tick(snap);
      document.getElementById('dpReasonInput').value = 'Do not apply saturated proposal';
      document.getElementById('mpcApprove').click();
      return {invalidated, approved: FT.state.mpcApproved, kind: FT.ops._last.kind};
    });
    assert.equal(result.invalidated, true); assert.equal(result.approved, false); assert.equal(result.kind, 'SATURATED');
  });
  await check('vehicles blocked by closures resume after the network reopens', async () => {
    const result = await page.evaluate(() => {
      FT.state.playing = false;
      FT.world.roads.edges.forEach(e => { e.cls = 3; }); FT.traffic.init();
      const before = FT.traffic.vehicles.filter(v => v.state === 'blocked').length;
      FT.world.roads.edges.forEach(e => { e.cls = 0; });
      for (let i = 0; i < 30; i++) FT.traffic.step(0, .1);
      return {before, after: FT.traffic.vehicles.filter(v => v.state === 'blocked').length};
    });
    assert.equal(result.before, 130); assert.equal(result.after, 0);
  });
  await ctx.close();
  for (const file of ['ai-demo.html', 'phase2-training.html']) {
    await check(file + ' boots and runs its local training/validation UI', async () => {
      const page = await browser.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${base}/${file}`, {waitUntil: 'load'});
      const result = await page.evaluate(async () => {
        const dataset = await new FT.AIData.DataPipeline().buildCAMELSDataset('vgtb',
          {startDate: '2024-01-01', endDate: '2025-12-31'});
        const loader = new FT.AITraining.TrainingDataLoader(dataset);
        const split = prepareLocalDataset(loader);
        const model = new FT.AITraining.TrainableMCLSTM({hiddenSize: 4});
        const trainer = new FT.AITraining.Trainer(model, {epochs: 2, batchSize: 16});
        await trainer.train(split.train.slice(0, 32), split.val.slice(0, 16));
        const predictions = split.test.slice(0, 16).map(s => Math.expm1(model.forward(s.input)));
        const observations = split.test.slice(0, 16).map(s => s.targetRaw);
        const metrics = new FT.AIValidation.MetricsCalculator().calculateAll(predictions, observations);
        FT.AIDataset = dataset; FT.AIModel = model;
        return {hasData: !!FT.data, loss: trainer.bestValLoss, rmse: metrics.rmse};
      });
      assert.equal(result.hasData, true); assert.ok(Number.isFinite(result.loss)); assert.ok(Number.isFinite(result.rmse));
      if (file === 'ai-demo.html') {
        await page.locator('#btn-init').click();
        await page.waitForFunction(() => document.getElementById('data-status').textContent === 'Sẵn sàng');
        await page.locator('#btn-risk').click();
        await page.waitForFunction(() => document.getElementById('risk-status').textContent === 'Hoàn thành');
        assert.match(await page.locator('#risk-output').innerText(), /Provenance:.*SYNTHETIC/i);
        await page.locator('#btn-brief').click();
        await page.waitForFunction(() => document.getElementById('risk-status').textContent === 'Brief Generated');
        assert.match(await page.locator('#risk-output').innerText(), /unverified/);
        await page.locator('#btn-dashboard').click();
        await page.waitForFunction(() => document.getElementById('risk-status').textContent === 'Dashboard Ready');
        assert.match(await page.locator('#risk-output').innerText(), /calibrated.*false/);
      } else {
        const workflow = await page.evaluate(async () => {
          const initialized = await step1Initialize();
          state.dataset = FT.AIDataset; state.model = FT.AIModel;
          const validation = await step4Validate(), report = step5Report();
          const reportText = document.getElementById('results-output').textContent;
          let reportCalledAfterFailure = false;
          step1Initialize = async () => true; step2GenerateData = async () => true;
          step3TrainModel = async () => true; step4Validate = async () => false;
          step5Report = () => { reportCalledAfterFailure = true; return true; };
          await runFullPipeline();
          return {initialized, validation, report, reportText, reportCalledAfterFailure};
        });
        assert.equal(workflow.initialized, true); assert.equal(workflow.validation, true);
        assert.equal(workflow.report, true); assert.match(workflow.reportText, /SYNTHETIC/);
        assert.equal(workflow.reportCalledAfterFailure, false);
      }
      assert.deepEqual(errors, []); await page.close();
    });
  }
  console.log(`Audit browser regressions: ${count} passed`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
