/* Phase 5/6 interaction test: decision panel, alerts, AI, drawer, modes, a11y. */
import { launchGpu } from './browser.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const s = spawn('node', [path.join(HERE, 'serve.mjs'), '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = await new Promise((resolve, reject) => {
  let output = '';
  const timer = setTimeout(() => reject(new Error(`server did not start: ${output}`)), 8000);
  const read = (chunk) => {
    output += chunk;
    const match = output.match(/127\.0\.0\.1:(\d+)/);
    if (match) { clearTimeout(timer); resolve(match[1]); }
  };
  s.stdout.on('data', read); s.stderr.on('data', read);
});
let fails = 0;
const ok = (n, c, x) => { console.log(`${c ? '  ✓' : '  ✗'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };

const b = await launchGpu({ headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
try {
  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 30000 });
  await sleep(2800);

  // AI assistant toggles via ⌘J
  await p.keyboard.down('Meta'); await p.keyboard.press('j'); await p.keyboard.up('Meta'); await sleep(300);
  const aiOpen = await p.evaluate(() => { const f = document.querySelector('[data-panel="ai"]'); return f && f.style.display !== 'none' && !f.classList.contains('hidden-chrome'); });
  ok('AI assistant opens (⌘J)', aiOpen);
  // AI holds the brief/citizen buttons; report buttons moved to the persistent action toolbar
  const aiWired = await p.evaluate(() => !!document.querySelector('[data-panel="ai"] #btnBrief') && !!document.querySelector('[data-panel="ai"] #btnCitizen'));
  ok('AI panel holds real LLM brief/citizen buttons', aiWired);
  const reportsPersistent = await p.evaluate(() => !!document.querySelector('.geoActions #btnReport') && !!document.querySelector('.geoActions #btnRepOperation'));
  ok('report actions live in persistent toolbar', reportsPersistent);

  // Utility drawer via ⌘L + tabs
  await p.keyboard.down('Meta'); await p.keyboard.press('l'); await p.keyboard.up('Meta'); await sleep(300);
  const drawerOpen = await p.evaluate(() => { const d = document.querySelector('[data-panel="drawer"]'); return d && d.style.display !== 'none' && !d.classList.contains('hidden-chrome'); });
  ok('Utility drawer opens (⌘L)', drawerOpen);
  const drawerTabs = await p.evaluate(() => document.querySelectorAll('[data-panel="drawer"] .drawerTab').length);
  ok('drawer has 3 tabs', drawerTabs === 3, drawerTabs + '');
  const auditIntact = await p.evaluate(() => !!document.querySelector('[data-panel="drawer"] #auditLog') && !!document.querySelector('[data-panel="drawer"] #auditExport'));
  ok('audit trail (append-only) present in drawer', auditIntact);
  // switch to traffic tab
  await p.evaluate(() => { const t = [...document.querySelectorAll('[data-panel="drawer"] .drawerTab')].find(x => x.dataset.tab === 'traffic'); t && t.click(); }); await sleep(150);
  const trafficPane = await p.evaluate(() => { const pane = document.querySelector('[data-panel="drawer"] .drawerPane[data-pane="traffic"]'); return pane && pane.classList.contains('active') && !!pane.querySelector('#vehCount'); });
  ok('traffic tab switches + holds #vehCount', trafficPane);

  // Decision panel present + holds MPC approve + reason field
  const decisionWired = await p.evaluate(() => {
    const d = document.querySelector('[data-panel="decision"]');
    return !!d && !!d.querySelector('#mpcApprove') && !!d.querySelector('#dpReasonInput') && !!d.querySelector('#resList');
  });
  ok('Decision panel holds reservoir + MPC approve + reason', decisionWired);

  // decision pill exists (safety: pending decision never lost)
  const pill = await p.evaluate(() => !!document.querySelector('.decisionPill'));
  ok('decision minimise-pill exists (safety)', pill);

  // Alert stack holds the alarm list; notify composer moved to persistent action toolbar
  const alertsWired = await p.evaluate(() => !!document.querySelector('[data-panel="alerts"] #alarmList'));
  ok('Alert stack holds alarm list', alertsWired);
  const notifyPersistent = await p.evaluate(() => !!document.querySelector('.geoActions #nfRelease') && !!document.querySelector('.geoActions #nfEvac'));
  ok('notify composer lives in persistent toolbar', notifyPersistent);

  // Scenario Compare is a keyboard-opened, view-only simulation surface.
  await p.keyboard.press('c');
  await p.waitForFunction(() => document.querySelectorAll('[data-panel="compare"] [role="option"]').length >= 2, null, { timeout: 90000 });
  const compare = await p.evaluate(() => {
    const panel = document.querySelector('[data-panel="compare"]');
    const options = panel ? [...panel.querySelectorAll('[role="option"]')] : [];
    const ribbon = document.querySelector('.compareDelta');
    return {
      visible: !!panel && getComputedStyle(panel).display !== 'none' && !panel.classList.contains('hidden-chrome'),
      optionCount: options.length,
      selected: options.filter((option) => option.getAttribute('aria-selected') === 'true').length,
      live: !!(panel && panel.querySelector('[aria-live="polite"]')),
      nonOrder: !!ribbon && /không phải lệnh|not an operational order/i.test(ribbon.textContent),
      definitive: options.some((option) => /\b(best|optimal|winner)\b|tốt nhất|tối ưu|chiến thắng/i.test(option.textContent)),
    };
  });
  ok('Scenario Compare opens on C with 2–4 semantic options', compare.visible && compare.optionCount >= 2 && compare.optionCount <= 4, JSON.stringify(compare));
  ok('Scenario Compare exposes one selected option and a live status region', compare.selected === 1 && compare.live);
  ok('Scenario Compare is explicitly non-operational and non-definitive', compare.nonOrder && !compare.definitive);

  const compareExport = await p.evaluate(() => {
    const C = FT.compare;
    const infeasible = Object.values(C.state.options).find((option) => option.status === 'INFEASIBLE');
    if (!infeasible) return { found: false };
    C.selectOption(infeasible.id);
    const button = document.querySelector('[data-panel="compare"] .compareExport');
    return { found: true, disabled: !!button && button.disabled, refused: !C.exportRecommendation(infeasible.id).ok };
  });
  ok('infeasible comparison option cannot be exported', compareExport.found && compareExport.disabled && compareExport.refused, JSON.stringify(compareExport));
  await p.keyboard.press('c'); await sleep(150);

  // helper: force a neutral mode state (clear whatever is current)
  const neutral = async () => { await p.evaluate(() => { const m = window.FT.mapMode; if (m.current) m.set(m.current); }); await sleep(120); };

  // Modes: split shows both canvases
  await neutral();
  await p.evaluate(() => window.FT.mapMode.set('split')); await sleep(300);
  const split = await p.evaluate(() => {
    const c2 = getComputedStyle(document.getElementById('canvas2d'));
    return document.body.classList.contains('mode-split') && parseFloat(c2.opacity) === 1;
  });
  ok('split mode shows both canvases', split);
  await neutral();

  // immersive hides 2D + chrome
  await p.evaluate(() => window.FT.mapMode.set('immersive')); await sleep(300);
  const immersive = await p.evaluate(() => {
    const cls = document.body.classList.contains('mode-immersive');
    const op = getComputedStyle(document.querySelector('.geoDock')).opacity;
    return { cls, op };
  });
  ok('immersive mode hides chrome', immersive.cls && immersive.op === '0', JSON.stringify(immersive));
  await neutral();

  // cheatsheet on ?
  await p.keyboard.down('Shift'); await p.keyboard.press('/'); await p.keyboard.up('Shift'); await sleep(250);
  const cheat = await p.evaluate(() => document.querySelector('.geoCheat').classList.contains('open'));
  ok('keyboard cheatsheet opens (?)', cheat);
  await p.keyboard.press('Escape');

  // a11y: key surfaces have roles/labels
  const a11y = await p.evaluate(() => {
    const bar = document.querySelector('.cmdBar'); const dock = document.querySelector('.geoDock');
    const dec = document.querySelector('[data-panel="decision"]'); const rib = document.querySelector('.geoRibbon');
    return bar.getAttribute('role') === 'toolbar' && dock.getAttribute('role') === 'tablist' &&
           dec.getAttribute('role') === 'dialog' && rib.getAttribute('role') === 'status';
  });
  ok('a11y roles on bar/dock/decision/ribbon', a11y);

  // ribbon carries the mandatory safety string
  const safety = await p.evaluate(() => /NOT FOR OPERATIONS/.test(document.querySelector('.geoRibbon').textContent));
  ok('safety banner present in ribbon', safety);

  const fatal = errs.filter((e) => !/tile|net::|WebGL|texture|CORS|404|429/i.test(e));
  ok('no page errors during interactions', fatal.length === 0, fatal.slice(0, 3).join(' | '));

  await p.screenshot({ path: path.join(HERE, 'artifacts', 'shell-interactions.png') });
} catch (e) {
  console.error('THREW:', e.message); fails++;
} finally { await b.close(); s.kill(); }
console.log(fails === 0 ? '\nINTERACTIONS PASS' : `\nINTERACTIONS FAIL (${fails})`);
process.exit(fails === 0 ? 0 : 1);
