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

async function map2dCameraState(page) {
  return page.evaluate(() => window.FT?.map2d?.cameraState?.() || null);
}

function changed(a, b, key, epsilon = 0.01) {
  return a && b && Number.isFinite(a[key]) && Number.isFinite(b[key]) && Math.abs(a[key] - b[key]) > epsilon;
}

async function waitForCamera(page, predicate, arg, timeout = 5000) {
  await page.waitForFunction(predicate, arg, { timeout });
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
          window.setTimeout(resolve, 250);
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
      Number.isFinite(result.state.distance) &&
      Number.isFinite(result.state.bearing) &&
      Number.isFinite(result.state.tilt);
  });

  await check('Earth camera presets emit one lifecycle and meaningful status', async (d) => {
    const result = await page.evaluate(async () => {
      const FT = window.FT;
      const events = [];
      const capture = (type) => (payload) => events.push({ type, payload });
      FT.bus.on('camera.fly.start', capture('start'));
      FT.bus.on('camera.fly.settled', capture('settled'));
      document.querySelector('#camPresets button[data-cam="delta"]').click();
      await new Promise((resolve, reject) => {
        const deadline = window.setTimeout(() => reject(new Error('preset camera.fly.settled timeout')), 3000);
        FT.bus.on('camera.fly.settled', () => {
          window.clearTimeout(deadline);
          window.setTimeout(resolve, 250);
        });
      });
      return {
        events,
        state: FT.scene3d.cameraState(),
        status: document.getElementById('earthCameraStatus')?.textContent || '',
      };
    });
    d(result);
    const start = result.events.filter((event) => event.type === 'start' && event.payload?.intent === 'delta');
    const settled = result.events.filter((event) => event.type === 'settled' && event.payload?.intent === 'delta');
    return start.length === 1 &&
      settled.length === 1 &&
      start[0].payload?.view === '3d' &&
      settled[0].payload?.view === '3d' &&
      settled[0].payload?.status === 'settled' &&
      result.state &&
      Number.isFinite(result.state.distance) &&
      result.state.distance > 0 &&
      /hạ lưu/i.test(result.status);
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
    await waitForCamera(page, () => {
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

  await check('Earth locate falls back to basin overview when selection is missing or unsupported', async (d) => {
    const outcomes = [];
    for (const mode of ['missing', 'unsupported']) {
      await page.evaluate((kind) => {
        const FT = window.FT;
        FT.scene3d.flyToSelection({ kind: 'point', xKm: 58, yKm: 63 }, { intent: 'asset' });
        if (kind === 'missing') FT.explain?.clear?.();
        else {
          const edge = FT.world?.roads?.edges?.[0];
          FT.explain?.select?.({ kind: 'road', id: `road:${edge.idx}` });
        }
      }, mode);
      await waitForCamera(page, () => {
        const state = window.FT?.scene3d?.cameraState?.();
        return state && state.distance < 25 && Math.hypot(state.target.x - 58, state.target.y - 63) < 0.5;
      });
      const before = await cameraState(page);
      await page.getByRole('button', { name: /Vị trí|Định vị/i }).click();
      await waitForCamera(page, () => {
        const state = window.FT?.scene3d?.cameraState?.();
        return state && state.distance > 80;
      });
      const after = await cameraState(page);
      const status = await page.locator('#earthCameraStatus').textContent();
      outcomes.push({ mode, before, after, status });
    }
    d(outcomes);
    return outcomes.every(({ before, after, status }) => (
      before && after &&
      before.distance < 25 &&
      after.distance > 80 &&
      /toàn cảnh|lưu vực/i.test(status || '') &&
      !/chưa sẵn sàng/i.test(status || '')
    ));
  });

  await check('Earth controls and shared fly API operate on the active 2D renderer', async (d) => {
    await page.click('#viewTabs button[data-view="2d"]');
    await page.waitForFunction(() => window.FT?.state?.view === '2d' && window.FT?.map2d?.cameraState);
    const beforeZoom = await map2dCameraState(page);
    await page.getByRole('button', { name: /Phóng to/i }).click();
    await page.waitForFunction((prior) => {
      const state = window.FT?.map2d?.cameraState?.();
      return state && state.scale > prior.scale;
    }, beforeZoom);
    const afterZoom = await map2dCameraState(page);
    const fly = await page.evaluate(async () => {
      const FT = window.FT;
      const events = [];
      const capture = (type) => (payload) => events.push({ type, payload });
      FT.bus.on('camera.fly.start', capture('start'));
      FT.bus.on('camera.fly.settled', capture('settled'));
      const ok = FT.navigation.flyToSelection({ kind: 'point', xKm: 58, yKm: 63 }, { intent: 'asset' });
      await new Promise((resolve, reject) => {
        const deadline = window.setTimeout(() => reject(new Error('2D camera.fly.settled timeout')), 3000);
        FT.bus.on('camera.fly.settled', (ev) => {
          if (ev && ev.view === '2d') {
            window.clearTimeout(deadline);
            window.setTimeout(resolve, 120);
          }
        });
      });
      return { ok, events, state: FT.map2d.cameraState() };
    });
    d({ beforeZoom, afterZoom, fly });
    const start = fly.events.filter((event) => event.type === 'start' && event.payload?.view === '2d');
    const settled = fly.events.filter((event) => event.type === 'settled' && event.payload?.view === '2d');
    return beforeZoom && afterZoom &&
      afterZoom.scale > beforeZoom.scale &&
      fly.ok === true &&
      start.length === 1 &&
      settled.length === 1 &&
      start[0].payload?.intent === 'asset' &&
      settled[0].payload?.intent === 'asset' &&
      settled[0].payload?.status === 'settled' &&
      Number.isFinite(fly.state?.scale) &&
      Number.isFinite(fly.state?.metresPerPixel) &&
      Math.hypot(fly.state.xKm - 58, fly.state.yKm - 63) < 0.8;
  });

  await check('2D fly cancels on real map input without snapping back', async (d) => {
    await page.click('#viewTabs button[data-view="2d"]');
    await page.waitForFunction(() => window.FT?.state?.view === '2d' && window.FT?.map2d?.cameraState);
    await page.evaluate(async () => {
      const FT = window.FT;
      const events = [];
      const capture = (type) => (payload) => events.push({ type, payload, state: FT.map2d.cameraState() });
      window.__earth2dCancelEvents = events;
      FT.bus.on('camera.fly.start', capture('start'));
      FT.bus.on('camera.fly.settled', capture('settled'));
      FT.navigation.flyToSelection({ kind: 'point', xKm: 15, yKm: 20 }, { intent: 'street' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__earth2dCancelDuring = FT.map2d.cameraState();
    });
    const box = await page.locator('#canvas2d').boundingBox();
    const x = box.x + box.width * 0.52;
    const y = box.y + box.height * 0.48;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 44, y + 12, { steps: 3 });
    await page.mouse.up();
    await page.mouse.wheel(0, -180);
    const result = await page.evaluate(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
      return {
        events: window.__earth2dCancelEvents,
        during: window.__earth2dCancelDuring,
        after: window.FT.map2d.cameraState(),
      };
    });
    d(result);
    const starts = result.events.filter((event) => event.type === 'start' && event.payload?.view === '2d');
    const cancelled = result.events.filter((event) => event.type === 'settled' && event.payload?.view === '2d' && event.payload?.status === 'cancelled');
    const settled = result.events.filter((event) => event.type === 'settled' && event.payload?.view === '2d' && event.payload?.status === 'settled');
    return starts.length === 1 &&
      cancelled.length === 1 &&
      settled.length === 0 &&
      result.after &&
      result.during &&
      Math.hypot(result.after.xKm - 15, result.after.yKm - 20) > 0.8 &&
      Number.isFinite(result.after.scale) &&
      result.after.scale !== result.during.scale;
  });

  await check('Command palette routes zones and active alerts through shared navigation without dropping UI events', async (d) => {
    const result = await page.evaluate(() => {
      const FT = window.FT;
      const catalog = FT.palette.catalog();
      const zoneDef = FT.data.ZONES[0];
      const activeAlarms = FT.alarms.active();
      const zoneEntry = catalog.find((item) => item.g === 'Khu vực' && item.selection?.kind === 'zone' && item.selection.id === zoneDef.id);
      const alertEntry = catalog.find((item) => item.g === 'Cảnh báo' && item.selection);
      const calls = [];
      const emissions = [];
      const originalFly = FT.navigation.flyToSelection;
      FT.navigation.flyToSelection = (selection, options) => {
        calls.push({ selection, options });
        return true;
      };
      FT.bus.on('zoneSelected', (id) => emissions.push({ type: 'zoneSelected', id }));
      FT.bus.on('gaugeSelected', (id) => emissions.push({ type: 'gaugeSelected', id }));
      FT.bus.on('reservoirFocus', (id) => emissions.push({ type: 'reservoirFocus', id }));
      try {
        if (zoneEntry) zoneEntry.run();
        if (alertEntry) alertEntry.run();
      } finally {
        FT.navigation.flyToSelection = originalFly;
      }
      return {
        zoneCount: catalog.filter((item) => item.g === 'Khu vực' && item.selection?.kind === 'zone').length,
        dataZoneCount: FT.data.ZONES.length,
        activeAlarmCount: activeAlarms.length,
        alertCount: catalog.filter((item) => item.g === 'Cảnh báo').length,
        zoneEntry: zoneEntry && { label: zoneEntry.label, selection: zoneEntry.selection },
        alertEntry: alertEntry && { label: alertEntry.label, selection: alertEntry.selection },
        calls,
        emissions,
        alertsPanelMode: FT.panels?.alerts?.mode || null,
      };
    });
    d(result);
    const zoneCall = result.calls.find((call) => call.selection?.kind === 'zone' && call.selection.id === result.zoneEntry?.selection?.id);
    const alertCall = result.alertEntry && result.calls.find((call) => call.selection?.kind === result.alertEntry.selection.kind && call.selection.id === result.alertEntry.selection.id);
    const alertUiPreserved = !result.alertEntry ||
      result.alertsPanelMode !== 'hidden' ||
      result.emissions.some((event) => event.id === result.alertEntry.selection.id);
    return result.zoneCount === result.dataZoneCount &&
      result.zoneEntry &&
      zoneCall?.options?.intent === 'district' &&
      result.emissions.some((event) => event.type === 'zoneSelected' && event.id === result.zoneEntry.selection.id) &&
      (result.activeAlarmCount === 0 || (result.alertCount > 0 && result.alertEntry && alertCall && alertUiPreserved));
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
