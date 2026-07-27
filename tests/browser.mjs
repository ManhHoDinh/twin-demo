/* ==========================================================================
   Chromium launcher for the FloodTwin E2E suite.

   INHERITED, and the single most important piece of the old harness
   (SkyLabs_SURF2026/scripts/browser.mjs). Headless Chromium renders WebGL through
   SwiftShader — on the CPU. This app's 3D scene then runs at roughly 0–3 fps, and at that
   frame rate the main thread does not service pointer events inside Playwright's default
   timeout: tests go red with `page.click: Timeout 30000ms exceeded` while the application
   is perfectly correct. The symptom moves with machine load, so it reads as flakiness.

   Measured on Apple M4, this app's 3D scene, viewport 1280×800:

     default (SwiftShader)   ~0 fps    click: timed out at 20 000 ms
     ANGLE + Metal           ~60 fps   click: 186 ms

   The flags are hints: a platform that cannot honour them is ignored by Chromium, which
   falls back to software rendering, so this file is safe on machines with no GPU.

   IMPROVEMENT over the inherited version: `resolvePlaywright()`. This project has no
   node_modules of its own, so the suite resolves Playwright from a sibling project when
   a local install is absent — the tests run out of the box instead of failing on an
   import that has nothing to do with what is being tested.
   ========================================================================== */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/** Where to look for an installed Playwright, in order of preference. */
const CANDIDATES = [
  path.resolve(ROOT, 'node_modules/playwright'),
  path.resolve(ROOT, '../SkyLabs_SURF2026/node_modules/playwright'),
  path.resolve(ROOT, '../FloodTwin_SafeMove_Demo/node_modules/playwright'),
];

export async function resolvePlaywright() {
  try { return await import('playwright'); } catch { /* fall through to siblings */ }
  for (const dir of CANDIDATES) {
    if (!fs.existsSync(dir)) continue;
    try {
      const mod = await import(pathToFileURL(path.join(dir, 'index.js')).href);
      console.log(`[browser] using Playwright from ${path.relative(ROOT, dir) || dir}`);
      return mod.default ?? mod;
    } catch { /* try the next candidate */ }
  }
  throw new Error(
    'Playwright not found. Run `npm install` in FloodTwin_Q1_Demo, or keep a sibling ' +
    'project that has it installed (SkyLabs_SURF2026 / FloodTwin_SafeMove_Demo).'
  );
}

/** Flags that ask for a real GPU for WebGL. On macOS this goes through ANGLE/Metal. */
export const GPU_ARGS = [
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  ...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : []),
];

/** Launch Chromium with GPU acceleration. Accepts the usual chromium.launch options. */
export async function launchGpu(opts = {}) {
  const pw = await resolvePlaywright();
  return pw.chromium.launch({ ...opts, args: [...GPU_ARGS, ...(opts.args || [])] });
}
