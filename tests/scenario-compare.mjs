/* Focused contract for Scenario Comparison, joint-schedule attribution, and Recovery. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listen } from './serve.mjs';
import { launchGpu } from './browser.mjs';
import { step, check, usePage, bootApp, report } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const server = await listen(0, ROOT);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await launchGpu({ headless: true });

try {
  const { ctx, page, errors } = await bootApp(browser, base);
  usePage(page);

  step('Compare domain contract');
  await check('comparison API is available', async () =>
    page.evaluate(() => !!(window.FT && FT.compare && typeof FT.compare.addOption === 'function')));

  await check('two options share one valid time and control gauge', async (detail) => {
    const result = await page.evaluate(() => {
      if (!FT.compare) return null;
      FT.compare.reset();
      FT.compare.createBaseSnapshot();
      const rule = FT.compare.addOption({ id: 'rule', kind: 'RULE', label: 'Rule curve' });
      const mpc = FT.compare.addOption({ id: 'mpc', kind: 'MPC', label: 'MPC' });
      return {
        count: FT.compare.state.optionOrder.length,
        ruleTime: rule.result.validTime,
        mpcTime: mpc.result.validTime,
        ruleGauge: rule.result.gaugeId,
        mpcGauge: mpc.result.gaugeId,
      };
    });
    detail(result);
    return !!result && result.count === 2 && result.ruleTime === result.mpcTime && result.ruleGauge === result.mpcGauge;
  });

  await check('joint schedule names its reservoirs, combined peak, and binding gauge', async (detail) => {
    const result = await page.evaluate(() => {
      if (!FT.ops || typeof FT.ops.compareOption !== 'function') return null;
      return FT.ops.compareOption({
        id: 'joint', kind: 'JOINT_SCHEDULE', gaugeId: 'aiNghia',
        selection: { avuong: 'mpc', songbung4: 'mpc' },
      });
    });
    detail(result);
    return !!result && result.attribution && result.attribution.reservoirIds.length === 2 &&
      Number.isFinite(result.attribution.combinedPeakM) && Number.isFinite(result.attribution.combinedPeakTimeH) &&
      result.attribution.bindingGaugeId === 'aiNghia';
  });

  await check('viewing an option leaves operational policy and approval unchanged', async (detail) => {
    const result = await page.evaluate(() => {
      if (!FT.compare) return null;
      const before = { policy: FT.state.policy, approved: FT.state.mpcApproved };
      if (!FT.compare.state.options.mpc) FT.compare.addOption({ id: 'mpc', kind: 'MPC', label: 'MPC' });
      FT.compare.selectOption('mpc');
      return {
        before,
        after: { policy: FT.state.policy, approved: FT.state.mpcApproved },
        viewKey: FT.compare.viewKey(),
      };
    });
    detail(result);
    return !!result && result.viewKey === 'mpc' && result.before.policy === result.after.policy &&
      result.before.approved === result.after.approved;
  });

  await check('shared gauge changes rederive every option and removal preserves a valid session', async (detail) => {
    const result = await page.evaluate(() => {
      const C = FT.compare;
      C.reset();
      C.createBaseSnapshot();
      C.addOption({ id: 'rule', kind: 'RULE', label: 'Rule curve' });
      C.addOption({ id: 'mpc', kind: 'MPC', label: 'MPC' });
      const selected = C.selectGauge('cauLau');
      const gauges = C.state.optionOrder.map((id) => C.state.options[id].result.gaugeId);
      C.removeOption('mpc');
      return {
        selected,
        gaugeId: C.state.gaugeId,
        gauges,
        remaining: C.state.optionOrder.slice(),
        status: C.state.status,
      };
    });
    detail(result);
    return result.selected === 'cauLau' && result.gaugeId === 'cauLau' &&
      result.gauges.every((gauge) => gauge === 'cauLau') && result.remaining.length === 1 &&
      result.remaining[0] === 'rule' && result.status === 'BASE_READY';
  });

  await check('null evidence, stale refusal, and recommendation export remain lifecycle-safe', async (detail) => {
    const result = await page.evaluate(() => {
      const C = FT.compare;
      C.reset();
      C.createBaseSnapshot();
      const rule = C.addOption({ id: 'rule', kind: 'RULE', label: 'Rule curve' });
      const mpc = C.addOption({ id: 'mpc', kind: 'MPC', label: 'MPC' });
      const ready = [rule, mpc].find((option) => option.status === 'READY');
      const exported = ready ? C.exportRecommendation(ready.id) : { ok: false };
      const noDelta = C.deriveDelta('rule', 'missing');
      C.markStale('test context changed');
      const stale = ready ? C.exportRecommendation(ready.id) : { ok: false };
      return {
        structuredNull: rule.result.exposure.value === null && !!rule.result.exposure.reason &&
          Object.prototype.hasOwnProperty.call(rule.result.exposure, 'dependency') &&
          Object.prototype.hasOwnProperty.call(rule.result.exposure, 'lastValidTime'),
        noDelta: noDelta === null,
        recommendation: exported.ok && exported.lifecycleClass === FT.lifecycle.CLASS.RECOMMENDATION,
        inert: exported.ok && !FT.lifecycle.isActionable(exported.lifecycleClass),
        staleRejected: !stale.ok,
      };
    });
    detail(result);
    return Object.values(result).every(Boolean);
  });

  step('Recovery contract');
  await check('Recovery is directly selectable and carries all required descriptive fields', async (detail) => {
    const result = await page.evaluate(() => {
      const scenario = FT.data && FT.data.SCENARIOS && FT.data.SCENARIOS.recovery;
      const option = document.querySelector('#scenarioSelect option[value="recovery"]');
      const fields = ['inputs', 'assumptions', 'simulation', 'expectedImpacts', 'confidence', 'limitations'];
      return {
        selectable: !!option,
        fields: !!scenario && fields.every((field) => Array.isArray(scenario[field]) && scenario[field].length > 0),
        synthetic: !!scenario && /synthetic|tổng hợp/i.test(scenario.assumptions.join(' ')),
      };
    });
    detail(result);
    return result.selectable && result.fields && result.synthetic;
  });

  await check('Recovery starts on a model-derived descending limb', async (detail) => {
    const result = await page.evaluate(() => {
      if (!FT.hydro || typeof FT.hydro.recoveryStart !== 'function') return null;
      const start = FT.hydro.recoveryStart('recovery');
      return { start, legal: FT.domain.illegalTransitions().length === 0 };
    });
    detail(result);
    return !!result && Number.isFinite(result.start) && result.legal;
  });

  step('Compare map-first surface');
  await check('keyboard C opens a semantic compare panel with two options', async (detail) => {
    await page.keyboard.press('c');
    await page.waitForTimeout(200);
    const result = await page.evaluate(() => {
      const panel = document.querySelector('[data-panel="compare"]');
      const style = panel ? getComputedStyle(panel) : null;
      const options = panel ? [...panel.querySelectorAll('[role="option"]')] : [];
      return {
        visible: !!panel && style.display !== 'none' && style.visibility !== 'hidden' && !panel.classList.contains('hidden-chrome'),
        optionCount: options.length,
        selected: options.filter((option) => option.getAttribute('aria-selected') === 'true').length,
        live: !!(panel && panel.querySelector('[aria-live="polite"]')),
      };
    });
    detail(result);
    return result.visible && result.optionCount >= 2 && result.optionCount <= 4 && result.selected === 1 && result.live;
  });

  await check('delta ribbon names the shared gauge and says it is not an order', async (detail) => {
    const result = await page.evaluate(() => {
      const ribbon = document.querySelector('.compareDelta');
      return ribbon ? { text: ribbon.textContent.trim(), gauge: ribbon.dataset.gauge || null } : null;
    });
    detail(result);
    return !!result && result.gauge === 'aiNghia' && /không phải lệnh|not an operational order/i.test(result.text);
  });

  await check('selecting the MPC card changes only the view key', async (detail) => {
    const result = await page.evaluate(() => {
      const before = { policy: FT.state.policy, approved: FT.state.mpcApproved };
      const card = document.querySelector('[data-panel="compare"] [data-option="mpc"]');
      if (card) card.click();
      const currentCard = document.querySelector('[data-panel="compare"] [data-option="mpc"]');
      return {
        clicked: !!card,
        selected: currentCard && currentCard.getAttribute('aria-selected'),
        viewKey: FT.compare.viewKey(),
        policy: FT.state.policy,
        approved: FT.state.mpcApproved,
        before,
      };
    });
    detail(result);
    return result.clicked && result.selected === 'true' && result.viewKey === 'mpc' &&
      result.policy === result.before.policy && result.approved === result.before.approved;
  });

  await check('390 px compare sheet stays inside the viewport with 40 px targets', async (detail) => {
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await mobile.waitForFunction(() => window.FT && FT.compare && FT.hydro && FT.hydro.ready, null, { timeout: 90000 });
    await mobile.keyboard.press('c');
    await mobile.waitForTimeout(200);
    const result = await mobile.evaluate(() => {
      const panel = document.querySelector('[data-panel="compare"]');
      const box = panel && panel.getBoundingClientRect();
      const targets = panel ? [...panel.querySelectorAll('button')] : [];
      return {
        inViewport: !!box && box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1,
        targets: targets.length > 0 && targets.every((target) => target.getBoundingClientRect().height >= 40),
        noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      };
    });
    await mobile.close();
    detail(result);
    return result.inViewport && result.targets && result.noOverflow;
  });

  step('Compare failure and lifecycle states');
  await check('one option is labelled as not yet a comparison and has no delta', async (detail) => {
    const result = await page.evaluate(() => {
      FT.compare.reset();
      FT.compare.createBaseSnapshot();
      FT.compare.addOption({ id: 'rule', kind: 'RULE', label: 'Rule curve' });
      const status = document.querySelector('[data-panel="compare"] .compareStatus');
      const delta = document.querySelector('.compareDelta');
      return {
        status: status ? status.textContent.trim() : '',
        deltaHidden: !!delta && (delta.hidden || getComputedStyle(delta).display === 'none'),
      };
    });
    detail(result);
    return /chưa phải so sánh|not yet a comparison/i.test(result.status) && result.deltaHidden;
  });

  await check('missing exposure is a structured null, never zero or stale data', async (detail) => {
    const result = await page.evaluate(() => {
      const option = FT.compare.state.options.rule;
      return option && option.result.exposure;
    });
    detail(result);
    return !!result && result.value === null && typeof result.reason === 'string' &&
      Object.prototype.hasOwnProperty.call(result, 'dependency') && Object.prototype.hasOwnProperty.call(result, 'lastValidTime');
  });

  await check('infeasible options remain named and cannot be exported', async (detail) => {
    const result = await page.evaluate(() => {
      FT.compare.reset(); FT.compare.createBaseSnapshot();
      FT.compare.addOption({ id: 'rule', kind: 'RULE', label: 'Rule curve' });
      FT.compare.addOption({ id: 'mpc', kind: 'MPC', label: 'MPC' });
      const option = Object.values(FT.compare.state.options).find((item) => item.status === 'INFEASIBLE');
      return option ? {
        found: true,
        binding: option.result.binding,
        gaugeId: option.result.gaugeId,
        exported: FT.compare.exportRecommendation(option.id),
      } : { found: false };
    });
    detail(result);
    return result.found && !!result.binding && !!result.gaugeId && result.exported.ok === false;
  });

  await check('a feasible export is a non-actionable recommendation', async (detail) => {
    const result = await page.evaluate(() => {
      const option = Object.values(FT.compare.state.options).find((item) => item.status === 'READY' && item.result.feasible);
      if (!option) return null;
      const exported = FT.compare.exportRecommendation(option.id);
      return {
        ok: exported.ok,
        cls: exported.lifecycleClass,
        actionable: FT.lifecycle.isActionable(exported.lifecycleClass),
        approved: FT.state.mpcApproved,
      };
    });
    detail(result);
    return !!result && result.ok && result.cls === 'RECOMMENDATION' && !result.actionable && !result.approved;
  });

  await check('selecting Recovery enters the derived descending limb and pauses replay', async (detail) => {
    const result = await page.evaluate(() => {
      const select = document.getElementById('scenarioSelect');
      select.value = 'recovery';
      select.dispatchEvent(new Event('change'));
      return {
        scenario: FT.state.scenario,
        timeH: FT.state.timeH,
        derived: FT.hydro.recoveryStart('recovery'),
        playing: FT.state.playing,
      };
    });
    detail(result);
    return result.scenario === 'recovery' && Number.isFinite(result.derived) && result.timeH === result.derived && result.playing === false;
  });

  step('Compare boot safety');
  await check('comparison work introduces no application errors', (detail) => {
    const appErrors = errors.filter((error) => !/overpass|arcgisonline|elevation-tiles-prod|jsdelivr|unpkg|cdn\./i.test(error));
    detail(appErrors);
    return appErrors.length === 0;
  });

  await ctx.close();
} finally {
  await browser.close();
  server.close();
}

process.exit(report('Scenario Compare') ? 1 : 0);
