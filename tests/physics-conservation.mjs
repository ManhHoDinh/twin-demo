/* Physics validation: SWE mass conservation + Manning friction.
   Runs the real solver in the app and asserts:
     1. numerical mass closure |Σh·A − (water0 + sources − sinks)| / vol ≤ 1e-4  (the 0.01% target)
     2. Manning roughness field exists with physically-sane values (channel<floodplain<urban)
     3. depth stays non-negative and finite over a full flood cycle
     4. the DEM upgrade actually loaded finer data (or fell back honestly) */
import { launchGpu } from './browser.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const srv = spawn('node', [path.join(HERE, 'serve.mjs'), '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = await new Promise((res, rej) => {
  let buf = ''; const t = setTimeout(() => rej(new Error('no port: ' + buf)), 8000);
  const f = (d) => { buf += d; const m = buf.match(/127\.0\.0\.1:(\d+)/); if (m) { clearTimeout(t); res(m[1]); } };
  srv.stdout.on('data', f); srv.stderr.on('data', f);
});

let fails = 0;
const ok = (n, c, x) => { console.log(`${c ? '  ✓' : '  ✗'} ${n}${x !== undefined ? ' — ' + x : ''}`); if (!c) fails++; };

const b = await launchGpu({ headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
try {
  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 30000 });
  // A cold basin-wide z12 DEM fetch is 121 tiles and may queue behind per-origin limits.
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) { await sleep(500); ready = await p.evaluate(() => !!(window.FT && FT.world && FT.world.ready && FT.hydro)); }
  ok('world/solver initialised', ready);

  // Manning roughness field is physical: channel < floodplain, urban highest
  const rough = await p.evaluate(() => {
    const W = FT.world; if (!W.manning) return null;
    let ch = [], fp = [], ur = [];
    for (let k = 0; k < W.N * W.N; k++) {
      if (W.sea[k]) continue;
      const n = W.manning[k];
      if (W.riverDist[k] < 0.4) ch.push(n);
      else if (W.pop[k] > 0.35) ur.push(n);
      else fp.push(n);
    }
    const avg = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
    return { channel: avg(ch), floodplain: avg(fp), urban: avg(ur), n: ch.length + fp.length + ur.length };
  });
  ok('Manning field exists', rough && rough.n > 0);
  ok('roughness physical: channel < floodplain < urban',
     rough && rough.channel < rough.floodplain && rough.floodplain <= rough.urban,
     rough && `ch=${rough.channel.toFixed(3)} fp=${rough.floodplain.toFixed(3)} urb=${rough.urban.toFixed(3)}`);

  // Run a full flood cycle via the timeline and sample mass error at each step.
  const trace = await p.evaluate(async () => {
    const W = FT.world, H = FT.hydro, st = FT.state;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const times = [-12, -6, 0, 6, 12, 18, 24, 30];
    W.massReset();
    let maxErr = 0; const samples = [];
    for (const th of times) {
      st.timeH = th;
      const snap = H.at(th);
      // advance the solver ~30 min sim per checkpoint at fixed dt (no assimilation-free: real path)
      for (let s = 0; s < 30; s++) W.step(60, snap);   // 30 × 60 s = 30 sim-min
      const e = W.massError();
      maxErr = Math.max(maxErr, e);
      // depth sanity
      let neg = 0, nan = 0, maxH = 0;
      for (let k = 0; k < W.N * W.N; k++) { const h = W.h[k]; if (h < -1e-6) neg++; if (!isFinite(h)) nan++; if (h > maxH) maxH = h; }
      samples.push({ th, err: e, neg, nan, maxH: +maxH.toFixed(2) });
    }
    return { maxErr, samples, ledger: W.mass };
  });

  console.log('  · mass-error trace:', trace.samples.map((s) => `T${s.th}:${(s.err * 100).toExponential(1)}%`).join(' '));
  ok('mass conservation ≤ 0.01% over full cycle', trace.maxErr <= 1e-4, `max ${(trace.maxErr * 100).toExponential(2)}%`);
  ok('no negative depths', trace.samples.every((s) => s.neg === 0));
  ok('no NaN/Inf depths', trace.samples.every((s) => s.nan === 0));
  ok('flood produced real water (maxH > 0.5 m at peak)', Math.max(...trace.samples.map((s) => s.maxH)) > 0.5,
     `peak ${Math.max(...trace.samples.map((s) => s.maxH))} m`);

  // DEM resolution honesty
  const dem = await p.evaluate(() => (FT.geo && FT.geo.demMeta) || null);
  if (dem) {
    ok('DEM meta published (honest resolution)', !!dem.baseMppx,
       `base z${dem.baseZ} ≈ ${dem.baseMppx.toFixed(1)} m/px${dem.fineZ ? `, fine z${dem.fineZ} ≈ ${dem.fineMppx.toFixed(1)} m/px` : ' (no fine overlay)'}`);
    ok('base DEM finer than legacy z11 (≤ 40 m/px)', dem.baseMppx <= 40, `${dem.baseMppx.toFixed(1)} m/px`);
  } else {
    ok('DEM meta published', false, 'no demMeta (offline fallback?)');
  }

  const fatal = errs.filter((e) => !/tile|net::|WebGL|texture/i.test(e));
  ok('no fatal JS errors', fatal.length === 0, fatal.slice(0, 3).join(' | '));
} catch (e) {
  console.error('PHYSICS THREW:', e.message); fails++;
} finally { await b.close(); srv.kill(); }

console.log(fails === 0 ? '\nPHYSICS PASS' : `\nPHYSICS FAIL (${fails})`);
process.exit(fails === 0 ? 0 : 1);
