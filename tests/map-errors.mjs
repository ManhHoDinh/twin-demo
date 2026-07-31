/* ==========================================================================
   Map error sweep.

   Drives the map the way a user does — both views, every zoom intent, layer
   toggles, scrubbing, deep zoom — and fails on any console error, pageerror,
   failed same-origin request, or WebGL shader/context problem.

   This exists because the other suites assert outcomes: e2e checks state,
   earth-map checks the view contract, zoom-visual checks pixels. None of them
   fail on an exception that the app swallows, and this app swallows a lot of
   them by design (`try { buildOsmRoads() } catch (e) { console.warn(...) }`),
   so a broken 3D layer can look exactly like a slow network.

   Third-party tile 504s are reported but do NOT fail the run: they are the
   normal weather of this app, and a suite that goes red on someone else's CDN
   teaches people to ignore it.

   Run: node tests/map-errors.mjs
   ========================================================================== */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchGpu } from './browser.mjs';
import { listen } from './serve.mjs';
import { bootApp } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.resolve(HERE, 'artifacts');

/* Anything matching these is someone else's infrastructure, not our defect. */
const THIRD_PARTY = /arcgisonline|elevation-tiles-prod|overpass|openstreetmap|nominatim|tile\.|basemaps/i;
/* Noise the app emits on purpose. */
const BENIGN = /\[selftest\]|\[3d\]|\[geo\]|\[2d\]|DevTools|Download the React/i;

const problems = [];
const notes = [];

function classify(kind, text, where = '') {
  const full = `${text} ${where}`;
  if (BENIGN.test(text)) return;
  if (THIRD_PARTY.test(full)) { notes.push(`${kind}: ${text.slice(0, 110)}`); return; }
  problems.push({ kind, text: text.slice(0, 300), where });
}

(async () => {
  const srv = await listen(0);
  const browser = await launchGpu();
  const { page } = await bootApp(browser, `http://127.0.0.1:${srv.address().port}`);

  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    classify(m.type(), m.text(), (m.location && m.location().url) || '');
  });
  page.on('pageerror', (e) => classify('pageerror', e.message));
  page.on('requestfailed', (r) => classify('requestfailed', `${r.failure()?.errorText} ${r.url()}`, r.url()));
  page.on('response', (r) => {
    if (r.status() >= 400) classify('http' + r.status(), r.url(), r.url());
  });

  const step = async (label, fn) => {
    const before = problems.length;
    try { await fn(); } catch (e) { problems.push({ kind: 'driver', text: `${label}: ${e.message}` }); }
    await page.waitForTimeout(900);
    const added = problems.length - before;
    console.log(`  ${added ? '✗' : '✓'} ${label}${added ? `  (+${added})` : ''}`);
  };

  const sites = await page.evaluate(() => window.FT.data.CITIES.slice(0, 4).map((c) => ({ id: c.id, x: c.x, y: c.y })));

  console.log('\n— 3D view —');
  for (const s of sites) {
    for (const intent of ['district', 'asset', 'street']) {
      await step(`3D fly ${s.id}/${intent}`, async () => {
        await page.evaluate(({ x, y, i }) => window.FT.scene3d.flyToSelection({ kind: 'point', xKm: x, yKm: y }, { intent: i }),
          { x: s.x, y: s.y, i: intent });
        await page.waitForTimeout(2600);
      });
    }
  }
  await step('3D deep zoom (4 steps in)', async () => {
    for (let i = 0; i < 4; i++) { await page.evaluate(() => window.FT.scene3d.zoomStep('in')); await page.waitForTimeout(1400); }
  });
  await step('3D zoom back out', async () => {
    for (let i = 0; i < 6; i++) { await page.evaluate(() => window.FT.scene3d.zoomStep('out')); await page.waitForTimeout(700); }
  });
  await step('3D camera presets', async () => {
    for (const p of ['overview', 'delta', 'dams', 'hoian']) {
      await page.evaluate((k) => window.FT.scene3d.setCamera(k), p);
      await page.waitForTimeout(900);
    }
  });
  await step('3D orbit + reset north + tilt', async () => {
    await page.evaluate(() => {
      const S3 = window.FT.scene3d;
      S3.orbitSelection({ kind: 'point', xKm: 80, yKm: 31 });
      S3.resetNorth(); S3.toggleTilt();
    });
  });
  await step('every layer toggled off then on', async () => {
    const keys = await page.evaluate(() => Object.keys(window.FT.state.layers));
    for (const k of keys) {
      await page.evaluate((key) => { window.FT.state.layers[key] = false; }, k);
      await page.waitForTimeout(220);
      await page.evaluate((key) => { window.FT.state.layers[key] = true; }, k);
    }
  });
  await step('scrub across the whole flood', async () => {
    for (const t of [-12, 0, 6, 12, 18, 24, 30, 6]) {
      await page.evaluate((h) => {
        const FT = window.FT;
        FT.state.playing = false; FT.state.timeH = h; FT.bus.emit('scrubbed');
        FT.world.updateRoadDepths(); FT.zones.stepStats(true);
        const snap = FT.hydro.at(h);
        if (FT.alarms) FT.alarms.scan(snap);
        for (let i = 0; i < 3; i++) FT.ui.tick(snap);
      }, t);
      await page.waitForTimeout(500);
    }
  });

  console.log('\n— 2D view —');
  await step('switch to 2D', async () => {
    await page.click('#viewTabs button[data-view="2d"]');
    await page.waitForTimeout(1500);
  });
  for (const s of sites.slice(0, 3)) {
    await step(`2D fly ${s.id}/street`, async () => {
      await page.evaluate(({ x, y }) => window.FT.map2d.flyToSelection({ kind: 'point', xKm: x, yKm: y }, { intent: 'street' }), s);
      await page.waitForTimeout(1600);
    });
  }
  await step('back to 3D', async () => {
    await page.click('#viewTabs button[data-view="3d"]');
    await page.waitForTimeout(1500);
  });

  console.log('\n— WebGL health —');
  const gl = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const ctx = cv && (cv.getContext('webgl2') || cv.getContext('webgl'));
    return {
      contextLost: !ctx || ctx.isContextLost(),
      glError: ctx ? ctx.getError() : 'no-context',
      renderLoopAlive: !!(window.FT && window.FT.scene3d && window.FT.scene3d.cameraState()),
    };
  });
  if (gl.contextLost) problems.push({ kind: 'webgl', text: 'WebGL context lost' });
  if (gl.glError && gl.glError !== 0) problems.push({ kind: 'webgl', text: `glGetError ${gl.glError}` });
  if (!gl.renderLoopAlive) problems.push({ kind: 'webgl', text: 'scene3d not responding after the sweep' });
  console.log(`  ${gl.contextLost || gl.glError ? '✗' : '✓'} ${JSON.stringify(gl)}`);

  await page.screenshot({ path: path.join(ARTIFACTS, 'map-errors-final.png') });
  await browser.close();
  srv.close();

  console.log(`\n==================== Map error sweep ====================`);
  if (notes.length) {
    const uniq = [...new Set(notes.map((n) => n.replace(/\d+/g, '#')))].slice(0, 6);
    console.log(`third-party tile noise (not failing): ${notes.length} events`);
    for (const u of uniq) console.log(`   · ${u}`);
  }
  if (!problems.length) { console.log('no app-side map errors\n'); process.exit(0); }
  console.log(`${problems.length} app-side problem(s):`);
  for (const p of problems.slice(0, 40)) console.log(`   ✗ [${p.kind}] ${p.text}${p.where ? `  @ ${p.where}` : ''}`);
  process.exit(1);
})();
