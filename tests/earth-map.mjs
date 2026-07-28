/* ==========================================================================
   FloodTwin — Earth map interaction contract.

   This locks the browser-facing controls before implementation: the map must expose
   native, accessible buttons for Earth-style camera actions plus a camera status host.
   ========================================================================== */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listen } from './serve.mjs';
import { launchGpu } from './browser.mjs';
import { step, check, usePage, bootApp, report, results } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ACTIONS = [
  { action: 'zoom-in', name: /Phóng to/i },
  { action: 'zoom-out', name: /Thu nhỏ/i },
  { action: 'north', name: /Bắc/i },
  { action: 'tilt', name: /Nghiêng/i },
  { action: 'locate', name: /Vị trí|Định vị/i },
];
let BASE = '';

async function cameraState(page) {
  return page.evaluate(() => window.FT?.scene3d?.cameraState?.() || null);
}

function changed(a, b, key, epsilon = 0.01) {
  return a && b && Number.isFinite(a[key]) && Number.isFinite(b[key]) && Math.abs(a[key] - b[key]) > epsilon;
}

async function earthControls(browser) {
  step('Earth map contract · camera controls and status');
  const { ctx, page } = await bootApp(browser, BASE, { viewport: { width: 1440, height: 900 } });
  usePage(page);

  await check('Earth camera controls are native Vietnamese-accessible buttons with 40px targets', async (d) => {
    const controls = [];
    for (const { action, name } of ACTIONS) {
      const hook = page.locator(`[data-earth-action="${action}"]`);
      const control = hook.and(page.getByRole('button', { name }));
      const count = await control.count();
      const visible = count === 1 ? await control.isVisible() : false;
      const box = visible ? await control.boundingBox() : null;
      const tag = count === 1 ? await control.evaluate((el) => el.tagName) : null;
      controls.push({
        action,
        expectedName: String(name),
        dataHookCount: await hook.count(),
        roleNameMatchCount: count,
        visible,
        tag,
        width: box ? Math.round(box.width) : null,
        height: box ? Math.round(box.height) : null,
        targetOk: !!box && box.width >= 40 && box.height >= 40,
      });
    }

    d(controls);
    return controls.every((control) => (
      control.dataHookCount === 1 &&
      control.roleNameMatchCount === 1 &&
      control.visible &&
      control.tag === 'BUTTON' &&
      control.targetOk
    ));
  });

  await check('Earth camera status host exists', async (d) => {
    const status = await page.evaluate(() => {
      const el = document.getElementById('earthCameraStatus');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        role: el.getAttribute('role'),
        ariaLive: el.getAttribute('aria-live'),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });
    d(status);
    return !!status;
  });

  await check('Earth camera fly API emits start and settled with finite camera state', async (d) => {
    const result = await page.evaluate(async () => {
      const FT = window.FT;
      const events = [];
      const capture = (type) => (payload) => events.push({ type, payload });
      FT.bus.on('camera.fly.start', capture('start'));
      FT.bus.on('camera.fly.settled', capture('settled'));
      FT.scene3d.flyToSelection({ kind: 'point', xKm: 58, yKm: 63 }, { intent: 'asset' });
      await new Promise((resolve, reject) => {
        const deadline = window.setTimeout(() => reject(new Error('camera.fly.settled timeout')), 3000);
        FT.bus.on('camera.fly.settled', () => {
          window.clearTimeout(deadline);
          requestAnimationFrame(resolve);
        });
      });
      return { events, state: FT.scene3d.cameraState() };
    });
    d(result);
    const start = result.events.filter((event) => event.type === 'start');
    const settled = result.events.filter((event) => event.type === 'settled');
    return start.length === 1 &&
      settled.length === 1 &&
      start[0].payload?.intent === 'asset' &&
      start[0].payload?.view === '3d' &&
      settled[0].payload?.intent === 'asset' &&
      settled[0].payload?.view === '3d' &&
      settled[0].payload?.status === 'settled' &&
      result.state &&
      result.state.distance > 0 &&
      Number.isFinite(result.state.bearing) &&
      Number.isFinite(result.state.tilt);
  });

  await check('Earth zoom-in changes 3D camera distance and status', async (d) => {
    const before = await cameraState(page);
    await page.getByRole('button', { name: /Phóng to/i }).click();
    await page.waitForFunction((prior) => {
      const state = window.FT?.scene3d?.cameraState?.();
      return state && Math.abs(state.distance - prior.distance) > 0.05;
    }, before);
    const after = await cameraState(page);
    const status = await page.locator('#earthCameraStatus').textContent();
    d({ before, after, status });
    return before && after && after.distance < before.distance && /Phóng to|zoom/i.test(status || '');
  });

  await check('Earth north action changes bearing and status', async (d) => {
    await page.evaluate(() => window.FT.scene3d.flyToSelection({ kind: 'point', xKm: 58, yKm: 63 }, { intent: 'asset' }));
    await page.waitForFunction(() => Math.abs(window.FT.scene3d.cameraState().bearing) > 0.5);
    const before = await cameraState(page);
    await page.getByRole('button', { name: /Bắc/i }).click();
    await page.waitForFunction(() => Math.abs(window.FT.scene3d.cameraState().bearing) < 0.5);
    const after = await cameraState(page);
    const status = await page.locator('#earthCameraStatus').textContent();
    d({ before, after, status });
    return changed(before, after, 'bearing') && /Bắc/i.test(status || '');
  });

  await check('Earth tilt action changes 3D camera tilt and status', async (d) => {
    const before = await cameraState(page);
    await page.getByRole('button', { name: /Nghiêng/i }).click();
    await page.waitForFunction((prior) => {
      const state = window.FT?.scene3d?.cameraState?.();
      return state && Math.abs(state.tilt - prior.tilt) > 0.5;
    }, before);
    const after = await cameraState(page);
    const status = await page.locator('#earthCameraStatus').textContent();
    d({ before, after, status });
    return changed(before, after, 'tilt') && /Nghiêng/i.test(status || '');
  });

  await check('Earth locate action flies to a resolvable 3D target and status', async (d) => {
    await page.evaluate(() => {
      window.FT.scene3d.setCamera('overview');
      window.FT.explain?.select?.({ kind: 'point', xKm: 58, yKm: 63 });
    });
    await page.waitForFunction(() => {
      const state = window.FT?.scene3d?.cameraState?.();
      return state && Math.hypot(state.target.x - 55, state.target.y - 40) < 0.5;
    });
    const before = await cameraState(page);
    await page.getByRole('button', { name: /Vị trí|Định vị/i }).click();
    await page.waitForFunction((prior) => {
      const state = window.FT?.scene3d?.cameraState?.();
      return state && (Math.hypot(state.target.x - prior.target.x, state.target.y - prior.target.y) > 0.5 || state.distance < prior.distance - 0.5);
    }, before);
    const after = await cameraState(page);
    const status = await page.locator('#earthCameraStatus').textContent();
    d({ before, after, status });
    return before && after &&
      (Math.hypot(after.target.x - before.target.x, after.target.y - before.target.y) > 0.5 || after.distance < before.distance) &&
      /Vị trí|Định vị/i.test(status || '');
  });

  await ctx.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const srv = await listen(4310, ROOT);
  BASE = `http://127.0.0.1:${srv.address().port}`;
  console.log(`Earth map contract · serving ${ROOT} on ${BASE}`);

  const browser = await launchGpu();
  const t0 = Date.now();
  try {
    await earthControls(browser);
  } finally {
    await browser.close();
    srv.close();
  }

  console.log(`\nran ${results.length} checks in ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(report('FloodTwin Earth Map Contract') ? 1 : 0);
}
