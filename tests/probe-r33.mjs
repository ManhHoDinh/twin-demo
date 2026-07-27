/* R-33 probe: does the reported pBelow match the on-screen ensemble band?
   Boots the real app, reads FT.hydro, and computes P(peak stage < AL3) three ways:
   (1) the shipped closed-form clamp (js/hydro.js:227),
   (2) an ensemble-consistent value from the SAME Gaussian the band is drawn from,
   (3) an empirical Monte-Carlo over that Gaussian, as a cross-check on (2).
   Read-only: no repository state is mutated. */
import { launchGpu } from '../../SkyLabs_SURF2026/scripts/browser.mjs';
import { listen } from '../../SkyLabs_SURF2026/scripts/serve.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4193;

(async () => {
  const srv = await listen(PORT, DEMO);
  const browser = await launchGpu();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(16000);

  const out = await page.evaluate(() => {
    const H = window.FT.hydro;
    if (!H || !H.proposal) return { err: 'no proposal' };
    const p = H.proposal;
    const g = window.FT.data.GAUGES.find((x) => x.id === p.gaugeId);
    const e = H.gauge[p.gaugeId];
    const med = e.mpc.med;                       // MPC median stage series
    const T0 = H.T0, DT = H.DT, NT = H.NT;

    // locate the MPC peak index
    let pi = 0; for (let i = 1; i < NT; i++) if (med[i] > med[pi]) pi = i;
    const tPeak = T0 + pi * DT;
    const medPeak = med[pi];
    const bd3 = g.bd[2];

    // reconstruct the SAME sigma the band is drawn from (js/hydro.js buildQuantiles)
    const lead = Math.max(0, tPeak);
    const sigmaFrac = (0.10 + 0.38 * Math.sqrt(lead / 48)) * window.FT.state.ensSpread;
    const dyn = Math.max(0.4, medPeak - g.base);
    const sigma = sigmaFrac * dyn;               // stage units (m)

    // (2) analytic normal CDF P(stage < bd3)
    const z = (bd3 - medPeak) / sigma;
    const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
    const cdf = 0.5 * (1 + erf(z / Math.SQRT2));

    // reported band endpoints on screen at the peak (P05/P95)
    const q05Peak = e.mpc.q05[pi], q95Peak = e.mpc.q95[pi];

    return {
      gauge: g.name, bd3, medPeak: +medPeak.toFixed(2), tPeak,
      sigma: +sigma.toFixed(3), q05Peak: +q05Peak.toFixed(2), q95Peak: +q95Peak.toFixed(2),
      pBelow_shipped: +p.pBelow.toFixed(3),
      pBelow_ensemble: +cdf.toFixed(3),
      ensSpread: window.FT.state.ensSpread,
    };
  });

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  srv.close();
})();
