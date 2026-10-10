import assert from 'node:assert/strict';
import fs from 'node:fs';
import {listen} from './serve.mjs';
import {launchGpu} from './browser.mjs';
import {bootApp, setTime} from './harness.mjs';
const server = await listen(0), base = `http://127.0.0.1:${server.address().port}`;
const browser = await launchGpu();
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log('PASS ' + name); };
try {
  const {page, ctx, errors, selftest} = await bootApp(browser, base);
  assert.match(selftest, /PASS/);
  await setTime(page, 6);
  await check('immutable deterministic context matches every viewed gauge and reservoir without changing state', async () => {
    const r = await page.evaluate(() => {
      const state = JSON.stringify(FT.state), snap = JSON.stringify(FT.hydro.at(FT.state.timeH));
      const c = FT.mockAI.capture(), a = FT.mockAI.answer('', c), b = FT.mockAI.answer('', c);
      return {equal: JSON.stringify(a) === JSON.stringify(b), ready: c.ready,
        frozen: Object.isFrozen(c) && Object.isFrozen(c.gauges[0]),
        unchanged: state === JSON.stringify(FT.state) && snap === JSON.stringify(FT.hydro.at(FT.state.timeH)),
        gaugeError: Math.max(...c.gauges.map(g => Math.abs(g.stage - FT.hydro.sample(FT.hydro.viewEnsemble(g.id).med, c.timeH)))),
        resError: Math.max(...c.reservoirs.map(r => Math.abs(r.outflow - FT.hydro.sample(FT.hydro.res[r.id][c.selection[r.id]].O, c.timeH))))};
    });
    assert.deepEqual(r, {equal:true, ready:true, frozen:true, unchanged:true, gaugeError:0, resError:0});
  });
  await check('bounded peak includes fractional endpoints; bands refer to the same peak time', async () => {
    await setTime(page, 37.13);
    const r = await page.evaluate(() => {
      const c = FT.mockAI.capture(), H = FT.hydro;
      return {horizon:c.horizon, errors:c.gauges.map(g => {
        const e = H.viewEnsemble(g.id), ts = [c.timeH, 48, ...Array.from(H.t).filter(t => t >= c.timeH && t <= 48)];
        return [Math.abs(g.peak - Math.max(...ts.map(t => H.sample(e.med,t)))), Math.abs(g.q95 - H.sample(e.q95,g.peakT))];
      })};
    });
    assert.ok(Math.abs(r.horizon - 10.87) < 1e-9); assert.ok(r.errors.flat().every(e => e < 1e-12));
    await setTime(page, 48);
    const result = await page.evaluate(() => FT.mockAI.answer('Dự báo mực nước'));
    assert.equal(result.context.horizon, 0); assert.ok(result.limitations.some(x => x.includes('hết miền')));
    assert.ok(!result.rows.some(x => x.text.includes('giờ mô phỏng tiếp theo')));
  });
  await check('mixed preview uses the selected reservoir mix and keeps roads in operational scope', async () => {
    await setTime(page, 6);
    const r = await page.evaluate(() => {
      FT.compare.reset(); FT.compare.createBaseSnapshot();
      FT.compare.addOption({id:'mock-rule',kind:'RULE',label:'Rule'});
      FT.compare.addOption({id:'mock-mixed',kind:'SINGLE',label:'Mixed',selection:{avuong:'mpc'}});
      FT.compare.selectOption('mock-mixed');
      const a = FT.mockAI.answer('Tình huống');
      return {selection:a.context.selection, preview:a.context.preview, approved:FT.state.mpcApproved,
        difference:a.context.gauges.some(g => FT.hydro.viewEnsemble(g.id).med.some((v,i) => Math.abs(v - FT.hydro.gauge[g.id].mpc.med[i]) > 1e-6)),
        matches:a.context.gauges.every(g => g.stage === FT.hydro.sample(FT.hydro.ensemble(g.id,a.context.selection).med,6)),
        limits:a.limitations, rows:a.rows};
    });
    assert.equal(r.preview,true); assert.equal(r.selection.avuong,'mpc'); assert.equal(r.selection.songbung4,'rule');
    assert.equal(r.approved,false); assert.equal(r.difference,true); assert.equal(r.matches,true);
    assert.ok(r.limits.some(x => x.includes('chưa tính lại')));
    assert.ok(r.rows.some(x => x.source.includes('operational world')));
    await page.evaluate(() => FT.compare.reset());
  });
  await check('degraded or invalid data withholds forecasts; mock never approves', async () => {
    for (const level of [2,3,4]) {
      const r = await page.evaluate(level => { FT.ops.setDegradation(level); return FT.mockAI.answer('Dự báo mực nước'); }, level);
      assert.equal(r.status, level === 4 ? 'ABSTAIN' : 'LIMITED');
      assert.ok(!r.rows.some(x => x.text.includes('giờ mô phỏng tiếp theo')));
    }
    const r = await page.evaluate(() => {
      FT.ops.setDegradation(null);
      const rejected = FT.mockAI.answer('Phê duyệt lệnh xả ngay');
      const value = FT.hydro.gauge.aiNghia.rule.med[120]; FT.hydro.gauge.aiNghia.rule.med[120] = NaN;
      const invalid = FT.mockAI.answer('Tình huống'); FT.hydro.gauge.aiNghia.rule.med[120] = value;
      return {rejected:rejected.status, invalid:invalid.status, approved:FT.state.mpcApproved};
    });
    assert.deepEqual(r,{rejected:'ABSTAIN',invalid:'ABSTAIN',approved:false});
  });
  await check('citizen questions cannot fabricate street depth or calibrated probabilities', async () => {
    const r = await page.evaluate(() => FT.mockAI.answer('Tối nay đường nhà tôi ở Hội An có ngập không?'));
    assert.equal(r.context.gauges.length,4);
    assert.ok(r.rows.some(x => x.text.includes('Câu Lâu')));
    assert.ok(r.limitations.some(x => x.includes('Mực trạm không phải')));
    assert.ok(!JSON.stringify(r).includes('0,3–0,6')); assert.ok(!r.rows.some(x => /NCHMF|khả năng.*%/.test(x.text)));
    const unknown = await page.evaluate(() => FT.mockAI.answer('Giá cổ phiếu ngày mai?'));
    assert.equal(unknown.status,'ABSTAIN');
  });
  await check('main page form, quick prompts, frozen results and stale context indication work', async () => {
    await page.locator('.aiLauncher').click();
    await page.locator('[data-mock-prompt="forecast"]').click();
    assert.ok(await page.locator('#llmBrief').innerText().then(t => t.includes('AI MOCK')));
    const old = await page.locator('#llmBrief').innerText();
    await setTime(page,7); await page.waitForFunction(() => document.getElementById('mockStatus').classList.contains('stale'));
    assert.equal(await page.locator('#llmBrief').innerText(),old);
    await page.locator('#mockQuestion').fill('Hồ chứa và lưu lượng xả'); await page.locator('#mockQuestion').press('Enter');
    assert.ok(!(await page.locator('#mockStatus').getAttribute('class')).includes('stale'));
    assert.equal(await page.evaluate(() => FT.mockAI.last.context.timeH),7);
  });
  await check('question text cannot execute HTML; language switch keeps captured context', async () => {
    await page.locator('#mockQuestion').fill('<img src=x onerror="window.__mockInjected=1">');
    await page.locator('#mockQuestion').press('Enter');
    assert.equal(await page.evaluate(() => window.__mockInjected),undefined); assert.equal(await page.locator('#llmBrief img').count(),0);
    await page.locator('#btnBrief').click();
    await setTime(page,8);
    await page.evaluate(() => FT.i18n.setLang('en'));
    assert.ok((await page.locator('#llmBrief').innerText()).includes('local rules'));
    assert.equal(await page.evaluate(() => FT.mockAI.last.context.timeH),7);
    assert.ok((await page.locator('#mockStatus').innerText()).includes('Context changed'));
    await page.locator('#btnBrief').click();
    assert.equal(await page.evaluate(() => FT.mockAI.last.context.timeH),8);
  });
  await check('assistant controls fit a mobile viewport and requests need no AI endpoint', async () => {
    const requests = []; page.on('request',r => { if (/openai|anthropic|\/api\/(chat|predict|generate)/i.test(r.url())) requests.push(r.url()); });
    await page.setViewportSize({width:390,height:844});
    await page.locator('#mockQuestion').fill('Gauge forecast'); await page.locator('#mockQuestion').press('Enter');
    for (const selector of ['#mockQuestion', '#mockQuestionForm button', '#btnBrief', '#btnCitizen']) {
      const box = await page.locator(selector).boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= 391, selector);
    }
    assert.deepEqual(requests,[]); assert.ok(!errors.some(x => x.startsWith('pageerror:')),errors.join('\n'));
    fs.mkdirSync('tests/artifacts',{recursive:true});
    await page.screenshot({path:'tests/artifacts/mock-ai-mobile.png'});
    await page.setViewportSize({width:1440,height:900});
    await page.screenshot({path:'tests/artifacts/mock-ai-desktop.png'});
  });
  await ctx.close(); console.log(`Mock AI: ${checks}/${checks} groups passed`);
} finally { await browser.close(); await new Promise(r => server.close(r)); }
