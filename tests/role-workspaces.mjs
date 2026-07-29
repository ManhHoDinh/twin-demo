import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listen } from './serve.mjs';
import { launchGpu } from './browser.mjs';
import { step, check, usePage, bootApp, report, results } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
let BASE = '';

async function governedFacilityRegistry(browser) {
  step('RW · Governed municipal facility registry');
  const { ctx, page, errors } = await bootApp(browser, BASE);
  usePage(page);

  await check('the app boots without registry-blocking application errors', (detail) => {
    const app = errors.filter((error) => !/overpass|arcgisonline|elevation-tiles-prod|jsdelivr|unpkg|cdn\./i.test(error));
    detail(app.slice(0, 4));
    return app.length === 0;
  });

  const coverage = await page.evaluate(() => window.FT.facilities.coverage());
  await check('municipal scope is 44 facilities', () => coverage.total === 44);
  await check('publicly named coverage is 34 with 10 unresolved', () =>
    coverage.named === 34 && coverage.unresolved === 10 && coverage.complete === false);

  const entity = await page.evaluate(() => window.FT.facilities.get('a-vuong'));
  await check('demo reservoir mapping is explicit', () =>
    entity.demoReservoirId === 'avuong' && entity.entityType === 'HydropowerFacility');

  const decisionNames = await page.evaluate(() => window.FT.facilities.decision1865ReservoirNames());
  await check('Decision 1865 contains exactly 19 reservoir names', () =>
    Array.isArray(decisionNames) && decisionNames.length === 19 && new Set(decisionNames).size === 19);

  const conflict = await page.evaluate(() => window.FT.facilities.resolveName('dak-mi-4a'));
  await check('Dak Mi 4A remains a reconciliation conflict, not an alias', () =>
    conflict.status === 'CONFLICTING_SOURCES' && conflict.facility === null);

  await ctx.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const srv = await listen(4310, ROOT);
  BASE = `http://127.0.0.1:${srv.address().port}`;
  console.log(`serving ${ROOT} on ${BASE}`);

  const browser = await launchGpu();
  const t0 = Date.now();
  try {
    await governedFacilityRegistry(browser);
  } finally {
    await browser.close();
    srv.close();
  }

  console.log(`\nran ${results.length} checks in ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(report('FloodTwin role workspace contracts') ? 1 : 0);
}
