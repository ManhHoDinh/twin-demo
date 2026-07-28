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
const ACTIONS = ['zoom-in', 'zoom-out', 'north', 'tilt', 'locate'];
let BASE = '';

async function earthControls(browser) {
  step('Earth map contract · camera controls and status');
  const { ctx, page } = await bootApp(browser, BASE, { viewport: { width: 1440, height: 900 } });
  usePage(page);

  await check('Earth camera controls are native Vietnamese-accessible buttons with 40px targets', async (d) => {
    const controls = await page.evaluate((actions) => {
      const labelledText = (el) => {
        const ids = (el.getAttribute('aria-labelledby') || '').trim().split(/\s+/).filter(Boolean);
        return ids.map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
      };
      const accessibleName = (el) => [
        el.getAttribute('aria-label'),
        labelledText(el),
        el.textContent,
        el.getAttribute('title'),
      ].find((value) => value && value.trim())?.trim() || '';
      const vietnamese = /[ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯàáâãèéêìíòóôõùúăđĩũơưẠ-ỹ]/u;

      return actions.map((action) => {
        const el = document.querySelector(`[data-earth-action="${action}"]`);
        if (!el) return { action, present: false };
        const rect = el.getBoundingClientRect();
        const name = accessibleName(el);
        return {
          action,
          present: true,
          tag: el.tagName,
          name,
          hasVietnameseName: vietnamese.test(name),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          targetOk: rect.width >= 40 && rect.height >= 40,
        };
      });
    }, ACTIONS);

    d(controls);
    return controls.every((control) => (
      control.present &&
      control.tag === 'BUTTON' &&
      control.hasVietnameseName &&
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
