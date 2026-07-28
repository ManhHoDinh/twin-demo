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
