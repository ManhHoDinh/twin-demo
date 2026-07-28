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

  await check('Earth water presentation distinguishes simulated inundation from satellite context', async (d) => {
    const result = await page.evaluate(async () => {
      const FT = window.FT;
      FT.state.playing = false;
      FT.state.timeH = 6;
      FT.bus.emit('scrubbed');
      FT.world.updateRoadDepths();
      FT.zones.stepStats(true);
      const snap = FT.hydro.at(FT.state.timeH);
      for (let i = 0; i < 3; i++) FT.ui.tick(snap);
      document.querySelector('#viewTabs button[data-view="3d"]').click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const threeBefore = FT.scene3d.waterPresentation?.();
      FT.scene3d.flyToSelection({ kind: 'point', xKm: 78, yKm: 36 }, { intent: 'street' });
      await new Promise((resolve, reject) => {
        const deadline = window.setTimeout(() => reject(new Error('3D close camera timeout')), 3000);
        FT.bus.on('camera.fly.settled', (ev) => {
          if (ev && ev.view === '3d') {
            window.clearTimeout(deadline);
            window.setTimeout(resolve, 160);
          }
        });
      });
      const threeClose = FT.scene3d.waterPresentation?.();
      document.querySelector('#viewTabs button[data-view="2d"]').click();
      FT.map2d.flyToSelection({ kind: 'point', xKm: 78, yKm: 36 }, { intent: 'street' });
      await new Promise((resolve) => setTimeout(resolve, 900));
      const twoClose = FT.map2d.waterPresentation?.();
      const label = document.querySelector('.earthLayerLabel');
      const rect = label?.getBoundingClientRect();
      return {
        labelText: label?.textContent || '',
        labelVisible: !!label && rect.width > 20 && rect.height > 14 && getComputedStyle(label).visibility !== 'hidden',
        threeBefore,
        threeClose,
        twoClose,
        timeH: FT.state.timeH,
      };
    });
    d(result);
    const colorsDistinct = (a, b) => a && b && String(a).toLowerCase() !== String(b).toLowerCase();
    return /MÔ PHỎNG/i.test(result.labelText) &&
      /T[+-]\s*\d/i.test(result.labelText) &&
      result.labelVisible &&
      result.threeBefore &&
      result.threeClose &&
      result.twoClose &&
      result.threeClose.closeOpacity < result.threeBefore.farOpacity &&
      result.threeClose.boundaryOpacity >= 0.72 &&
      result.threeClose.flowOpacity >= 0.72 &&
      result.threeClose.simulatedFillOpacity < 1 &&
      result.twoClose.simulatedFillOpacity < 1 &&
      colorsDistinct(result.threeClose.permanentWaterColor, result.threeClose.simulatedWaterColor) &&
      colorsDistinct(result.twoClose.permanentWaterColor, result.twoClose.simulatedWaterColor);
  });

  await check('Earth layer label follows the real water layer toggle after state changes', async (d) => {
    const result = await page.evaluate(async () => {
      const cb = document.querySelector('input[data-layer="water"]');
      const label = document.querySelector('.earthLayerLabel');
      if (!cb || !label) return { missing: { checkbox: !cb, label: !label } };
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const read = () => ({
        checked: cb.checked,
        state: window.FT.state.layers.water,
        text: label.textContent || '',
      });
      if (!cb.checked) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        await waitFrame();
      }
      cb.checked = false;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFrame();
      const off = read();
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFrame();
      const on = read();
      return { off, on };
    });
    d(result);
    return result.off &&
      result.on &&
      result.off.checked === false &&
      result.off.state === false &&
      /lớp ngập đang tắt/i.test(result.off.text) &&
      result.on.checked === true &&
      result.on.state === true &&
      !/lớp ngập đang tắt/i.test(result.on.text);
  });

  await check('Earth place sheet separates observed and simulated truth for gauges and arbitrary terrain points', async (d) => {
    const result = await page.evaluate(async () => {
      const FT = window.FT;
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const visible = (el) => !!el && !el.hidden && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
      const text = (selector) => document.querySelector(selector)?.textContent || '';
      const readSheet = () => {
        const sheet = document.getElementById('earthPlaceSheet');
        const observed = sheet?.querySelector('[data-place-section="observed"]');
        const simulated = sheet?.querySelector('[data-place-section="simulated"]');
        const actions = [...(sheet?.querySelectorAll('button[data-place-action]') || [])].map((button) => ({
          action: button.dataset.placeAction,
          visible: visible(button),
          disabled: button.disabled,
          text: button.textContent,
          tag: button.tagName,
        }));
        const rect = sheet?.getBoundingClientRect();
        return {
          visible: visible(sheet),
          heading: text('#earthPlaceSheet h2'),
          name: text('[data-place-field="name"]'),
          type: text('[data-place-field="type"]'),
          coordinates: text('[data-place-field="coordinates"]'),
          observedText: observed?.textContent || '',
          simulatedText: simulated?.textContent || '',
          actions,
          box: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null,
          activeId: document.activeElement?.id || null,
        };
      };

      const origin = document.getElementById('canvas2d');
      document.querySelector('#viewTabs button[data-view="3d"]').click();
      await waitFrame();
      origin.focus({ preventScroll: true });
      FT.bus.emit('explainOrigin', { element: origin, moveFocus: false });
      const gauge = FT.data.GAUGES[0];
      FT.explain.select({ kind: 'gauge', id: gauge.id });
      await waitFrame();
      const gaugeSheet = readSheet();
      const beforeCamera = FT.scene3d.cameraState();
      FT.state.timeH = Math.min(FT.hydro.T1, FT.state.timeH + 6);
      FT.bus.emit('scrubbed');
      FT.world.updateRoadDepths();
      FT.zones.stepStats(true);
      FT.ui.tick(FT.hydro.at(FT.state.timeH));
      await waitFrame();
      const updatedGauge = readSheet();
      const afterCamera = FT.scene3d.cameraState();
      const closeButton = document.querySelector('#earthPlaceSheet [data-place-action="close"]');
      closeButton?.focus({ preventScroll: true });
      closeButton?.click();
      await waitFrame();
      const closeResult = {
        hidden: document.getElementById('earthPlaceSheet')?.hidden,
        activeId: document.activeElement?.id || null,
      };

      origin.focus({ preventScroll: true });
      FT.bus.emit('explainOrigin', { element: origin, moveFocus: false });
      FT.explain.select({ kind: 'point', xKm: 11.4, yKm: 88.2 });
      await waitFrame();
      const pointSheet = readSheet();
      const orbitIn3d = pointSheet.actions.find((action) => action.action === 'orbit');
      document.querySelector('#viewTabs button[data-view="2d"]').click();
      await waitFrame();
      const point2d = readSheet();
      document.querySelector('#earthPlaceSheet [data-place-action="close"]')?.focus({ preventScroll: true });
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await waitFrame();
      const escapeResult = {
        hidden: document.getElementById('earthPlaceSheet')?.hidden,
        activeId: document.activeElement?.id || null,
      };

      return {
        gaugeSheet,
        updatedGauge,
        pointSheet,
        point2d,
        orbitIn3d,
        closeResult,
        escapeResult,
        cameraMovedOnUpdate: beforeCamera && afterCamera
          ? Math.hypot(beforeCamera.target.x - afterCamera.target.x, beforeCamera.target.y - afterCamera.target.y) > 0.1
          : null,
      };
    });
    d(result);
    const gaugeActions = Object.fromEntries(result.gaugeSheet.actions.map((item) => [item.action, item]));
    const pointActions = Object.fromEntries(result.pointSheet.actions.map((item) => [item.action, item]));
    const point2dActions = Object.fromEntries(result.point2d.actions.map((item) => [item.action, item]));
    return result.gaugeSheet.visible &&
      /Thông tin|địa điểm|place/i.test(result.gaugeSheet.heading) &&
      result.gaugeSheet.name.trim().length > 0 &&
      /trạm|gauge/i.test(result.gaugeSheet.type) &&
      /\d/.test(result.gaugeSheet.coordinates) &&
      /HIỆN TRẠNG/i.test(result.gaugeSheet.observedText) &&
      /nguồn|source|provenance/i.test(result.gaugeSheet.observedText) &&
      /fresh|phút|cập nhật|timestamp|2020|2024|2026|Z/i.test(result.gaugeSheet.observedText) &&
      /MÔ PHỎNG/i.test(result.gaugeSheet.simulatedText) &&
      /T[+-]\s*\d/i.test(result.gaugeSheet.simulatedText) &&
      /lifecycle|vòng đời|chưa kiểm định|demo|synthetic/i.test(result.gaugeSheet.simulatedText) &&
      /bất định|uncertainty|range|P05|P95|giới hạn|limitation/i.test(result.gaugeSheet.simulatedText) &&
      result.updatedGauge.simulatedText !== result.gaugeSheet.simulatedText &&
      result.cameraMovedOnUpdate === false &&
      ['fly', 'zoom', 'orbit'].every((key) => gaugeActions[key]?.tag === 'BUTTON' && gaugeActions[key].visible) &&
      !gaugeActions.fly.disabled &&
      !gaugeActions.zoom.disabled &&
      !gaugeActions.orbit.disabled &&
      result.closeResult.hidden === true &&
      result.closeResult.activeId === 'canvas2d' &&
      result.pointSheet.visible &&
      /điểm|point|ô lưới/i.test(result.pointSheet.type) &&
      /\d/.test(result.pointSheet.coordinates) &&
      result.pointSheet.observedText.includes('Không có số đo hiện tại') &&
      !/mô phỏng/i.test(result.pointSheet.observedText.replace('Không có số đo hiện tại', '')) &&
      /MÔ PHỎNG/i.test(result.pointSheet.simulatedText) &&
      pointActions.fly?.visible &&
      pointActions.zoom?.visible &&
      result.orbitIn3d?.visible &&
      result.orbitIn3d?.disabled === false &&
      (!point2dActions.orbit || point2dActions.orbit.disabled || !point2dActions.orbit.visible) &&
      result.escapeResult.hidden === true &&
      result.escapeResult.activeId === 'canvas2d';
  });

  await check('Earth place Orbit action performs a real 3D orbit distinct from fixed fly-to', async (d) => {
    const result = await page.evaluate(async () => {
      const FT = window.FT;
      const waitSettled = (view = '3d') => new Promise((resolve, reject) => {
        const deadline = window.setTimeout(() => reject(new Error(`${view} camera settle timeout`)), 4000);
        FT.bus.on('camera.fly.settled', (ev) => {
          if (ev && ev.view === view) {
            window.clearTimeout(deadline);
            window.setTimeout(resolve, 120);
          }
        });
      });
      const norm = (deg) => ((deg % 360) + 540) % 360 - 180;
      const bearingDelta = (a, b) => Math.abs(norm(a - b));
      document.querySelector('#viewTabs button[data-view="3d"]').click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const selection = { kind: 'gauge', id: FT.data.GAUGES[0].id };
      FT.explain.select(selection);
      FT.scene3d.flyToSelection(selection, { intent: 'asset' });
      await waitSettled('3d');
      const fixedBefore = FT.scene3d.cameraState();
      const events = [];
      FT.bus.on('camera.fly.start', (payload) => events.push({ type: 'start', payload }));
      FT.bus.on('camera.fly.settled', (payload) => events.push({ type: 'settled', payload }));
      document.querySelector('#earthPlaceSheet [data-place-action="orbit"]')?.click();
      await waitSettled('3d');
      const orbit = FT.scene3d.cameraState();
      FT.scene3d.flyToSelection(selection, { intent: 'asset' });
      await waitSettled('3d');
      const fixedAfter = FT.scene3d.cameraState();
      return {
        fixedBefore,
        orbit,
        fixedAfter,
        events,
        orbitApi: typeof FT.navigation.orbitSelection,
        bearingChange: bearingDelta(orbit.bearing, fixedBefore.bearing),
        fixedResetDelta: bearingDelta(fixedAfter.bearing, fixedBefore.bearing),
        targetMove: Math.hypot(orbit.target.x - fixedBefore.target.x, orbit.target.y - fixedBefore.target.y),
        repeatedFlyVsOrbit: bearingDelta(fixedAfter.bearing, orbit.bearing),
      };
    });
    d(result);
    const starts = result.events.filter((event) => event.type === 'start' && event.payload?.intent === 'orbit');
    const settled = result.events.filter((event) => event.type === 'settled' && event.payload?.intent === 'orbit' && event.payload?.status === 'settled');
    return result.orbitApi === 'function' &&
      starts.length === 1 &&
      settled.length === 1 &&
      result.fixedBefore &&
      result.orbit &&
      result.fixedAfter &&
      result.bearingChange >= 25 &&
      result.targetMove < 0.25 &&
      result.orbit.distance > 4 &&
      result.orbit.distance < 45 &&
      result.fixedResetDelta < 1 &&
      result.repeatedFlyVsOrbit >= 25;
  });

  await check('Earth place sheet Escape closes from canvas origin but does not steal input Escape', async (d) => {
    const canvasResult = await page.evaluate(async () => {
      const FT = window.FT;
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      document.querySelector('#viewTabs button[data-view="3d"]').click();
      await waitFrame();
      const canvas = document.getElementById('canvas3d');
      canvas.focus({ preventScroll: true });
      FT.bus.emit('explainOrigin', { element: canvas, moveFocus: false });
      FT.explain.select({ kind: 'point', xKm: 42, yKm: 44 });
      await waitFrame();
      const input = document.getElementById('cmdSearchInput');
      input.focus({ preventScroll: true });
      return {
        beforeHidden: document.getElementById('earthPlaceSheet').hidden,
        inputActive: document.activeElement === input,
      };
    });
    await page.keyboard.press('Escape');
    const afterInput = await page.evaluate(() => ({
      hidden: document.getElementById('earthPlaceSheet').hidden,
      activeId: document.activeElement?.id || null,
    }));
    await page.focus('#canvas3d');
    await page.keyboard.press('Escape');
    const afterCanvas = await page.evaluate(() => ({
      hidden: document.getElementById('earthPlaceSheet').hidden,
      activeId: document.activeElement?.id || null,
      currentKind: window.FT.explain.current?.selection?.kind || null,
    }));
    const result = { canvasResult, afterInput, afterCanvas };
    d(result);
    return canvasResult.beforeHidden === false &&
      canvasResult.inputActive === true &&
      afterInput.hidden === false &&
      afterCanvas.hidden === true &&
      afterCanvas.activeId === 'canvas3d' &&
      afterCanvas.currentKind === 'point';
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
        if (zoneEntry) {
          zoneEntry.run();
          var afterZone = {
            current: FT.explain.current && FT.explain.current.selection,
            sheetHidden: document.getElementById('earthPlaceSheet')?.hidden,
            sheetKind: document.getElementById('earthPlaceSheet')?.dataset.placeKind,
            sheetName: document.querySelector('#earthPlaceSheet [data-place-field="name"]')?.textContent || '',
          };
        }
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
        afterZone,
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
      result.afterZone?.current?.kind === 'zone' &&
      result.afterZone?.current?.id === result.zoneEntry.selection.id &&
      result.afterZone?.sheetHidden === false &&
      result.afterZone?.sheetKind === 'zone' &&
      result.afterZone?.sheetName.trim().length > 0 &&
      result.emissions.some((event) => event.type === 'zoneSelected' && event.id === result.zoneEntry.selection.id) &&
      (result.activeAlarmCount === 0 || (result.alertCount > 0 && result.alertEntry && alertCall && alertUiPreserved));
  });

  await check('Command palette gauge and reservoir entries use canonical normalized selection', async (d) => {
    const result = await page.evaluate(() => {
      const FT = window.FT;
      const catalog = FT.palette.catalog();
      const gaugeDef = FT.data.GAUGES[0];
      const reservoirDef = FT.data.RESERVOIRS[0];
      const gaugeEntry = catalog.find((item) => item.g === 'Trạm' && item.label === gaugeDef.name);
      const reservoirEntry = catalog.find((item) => item.g === 'Hồ chứa' && item.label === reservoirDef.name);
      const calls = [];
      const emissions = [];
      const originalFly = FT.navigation.flyToSelection;
      FT.navigation.flyToSelection = (selection, options) => {
        calls.push({ selection, options });
        return true;
      };
      FT.bus.on('gaugeSelected', (id) => emissions.push({ type: 'gaugeSelected', id }));
      FT.bus.on('reservoirFocus', (id) => emissions.push({ type: 'reservoirFocus', id }));
      try {
        if (gaugeEntry) gaugeEntry.run();
        var afterGauge = {
          current: FT.explain.current && FT.explain.current.selection,
          sheetHidden: document.getElementById('earthPlaceSheet')?.hidden,
          sheetKind: document.getElementById('earthPlaceSheet')?.dataset.placeKind,
          sheetName: document.querySelector('#earthPlaceSheet [data-place-field="name"]')?.textContent || '',
          selectedGauge: FT.state.selectedGauge,
        };
        if (reservoirEntry) reservoirEntry.run();
        var afterReservoir = {
          current: FT.explain.current && FT.explain.current.selection,
          sheetHidden: document.getElementById('earthPlaceSheet')?.hidden,
          sheetKind: document.getElementById('earthPlaceSheet')?.dataset.placeKind,
          sheetName: document.querySelector('#earthPlaceSheet [data-place-field="name"]')?.textContent || '',
        };
      } finally {
        FT.navigation.flyToSelection = originalFly;
      }
      return {
        gaugeEntry: gaugeEntry && { label: gaugeEntry.label },
        reservoirEntry: reservoirEntry && { label: reservoirEntry.label },
        gaugeId: gaugeDef.id,
        reservoirId: reservoirDef.id,
        afterGauge,
        afterReservoir,
        calls,
        emissions,
      };
    });
    d(result);
    const gaugeCall = result.calls.find((call) => call.selection?.kind === 'gauge' && call.selection.id === result.gaugeId);
    const reservoirCall = result.calls.find((call) => call.selection?.kind === 'reservoir' && call.selection.id === result.reservoirId);
    return result.gaugeEntry &&
      result.reservoirEntry &&
      result.afterGauge?.current?.kind === 'gauge' &&
      result.afterGauge?.current?.id === result.gaugeId &&
      result.afterGauge?.sheetHidden === false &&
      result.afterGauge?.sheetKind === 'gauge' &&
      result.afterGauge?.sheetName === result.gaugeEntry.label &&
      result.afterGauge?.selectedGauge === result.gaugeId &&
      result.afterReservoir?.current?.kind === 'reservoir' &&
      result.afterReservoir?.current?.id === result.reservoirId &&
      result.afterReservoir?.sheetHidden === false &&
      result.afterReservoir?.sheetKind === 'reservoir' &&
      result.afterReservoir?.sheetName === result.reservoirEntry.label &&
      gaugeCall?.options?.intent === 'asset' &&
      reservoirCall?.options?.intent === 'asset' &&
      result.emissions.some((event) => event.type === 'gaugeSelected' && event.id === result.gaugeId) &&
      result.emissions.some((event) => event.type === 'reservoirFocus' && event.id === result.reservoirId);
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
