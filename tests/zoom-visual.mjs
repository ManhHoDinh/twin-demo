/* ==========================================================================
   P0 — Zoom legibility harness.

   Measures how readable the 3D scene is when the camera comes down to
   building level. Written because "đất và nhà và nước rất khó nhìn" is a
   visual defect that no existing suite can see: e2e asserts state, ux-audit
   asserts layout, and neither ever looks at what the WebGL canvas draws.

   TWO THINGS THIS FILE KNOWS THAT ARE EASY TO GET WRONG:

   1. You cannot read the scene by drawing the app canvas into a 2D canvas.
      The renderer is created without `preserveDrawingBuffer`, so the colour
      buffer is undefined outside its own rAF frame — `drawImage` yields a
      fully transparent (luma 0) image and every metric silently reads 0.
      Measurement therefore goes through `page.screenshot()` and the PNG is
      decoded back inside the page via createImageBitmap.

   2. The metrics deliberately look at a ground-only crop. The HUD is bright
      chrome that sits over the scene; including it drags mean luma up by
      ~25 points and masks exactly the defect we are trying to catch.

   Run: node tests/zoom-visual.mjs [--update-baseline] [--compare[=switch]]
        --compare sweeps a second time with a kill switch on and prints both
        columns. Switches: drapelegacy (pre-P1 drape height, default) and
        waterlegacy (pre-P5 flood-water opacity).
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchGpu } from './browser.mjs';
import { listen } from './serve.mjs';
import { bootApp } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.resolve(HERE, 'artifacts');
const BASELINE = path.join(ARTIFACTS, 'zoom-visual-baseline.json');
const UPDATE = process.argv.includes('--update-baseline');
/* --compare[=switch]: sweep again with a kill switch on and print both columns.
   Each switch declares the metric it is supposed to move and in which direction, so
   the run proves the fix is doing something rather than just recording numbers. */
const CMP_ARG = process.argv.find((a) => a.startsWith('--compare'));
const COMPARE = !!CMP_ARG;
const CMP_SWITCH = (CMP_ARG && CMP_ARG.includes('=')) ? CMP_ARG.split('=')[1] : 'drapelegacy';
/* Thresholds are set BELOW the measured effect, not at it. The water claim was first
   written against `detail` at 0.4; two runs then measured 0.43 and 0.35, i.e. the
   threshold sat on the mean and the gate would have flaked half the time. `detail`
   does rise with the fill fade, but by ~0.4 ± 0.05 and not in every view, so it is
   reported for inspection and gated on the metric that actually separates. */
const CMP_CLAIM = {
  drapelegacy: { metric: 'murkPct', dir: -1, min: 5, what: 'drape clearance' },
  waterlegacy: { metric: 'murkPct', dir: -1, min: 1.5, what: 'water fill fade' },
};

/* Ground-only crop: below the top HUD strip, above the timeline panel,
   inside the left rail and right zoom column. */
const CLIP = { x: 200, y: 150, width: 900, height: 400 };

/* Resolved from FT.data.CITIES at runtime rather than hard-coded km: guessed
   coordinates land in forest, and dark vegetation reads as murk without any
   defect being present — which is a false failure, not a finding. */
const SITE_IDS = ['hoian', 'danang', 'aiNghiaT'];
const ZOOMS = ['district', 'asset', 'street'];
const SIM_TIME_H = 12;        // pinned flood time; see sweep()

/* How the gate works, and why it is not a fixed threshold.

   `murkPct` measures scene content as well as scene defects: the Đà Nẵng
   street view is 36% murk with no defect at all, because the Hàn river and
   the bay legitimately sit in that luma band, while Ái Nghĩa inland reads 23%
   in an equally clean frame. Any single number that passes the first fails
   the second. So the gate is a REGRESSION gate against the recorded baseline,
   per site and zoom, with a loose absolute floor underneath it as a backstop
   for the case where the baseline itself was recorded from a broken build. */
const TOL = { murkPct: 5, meanLuma: 12 };     // allowed drift from baseline
const FLOOR = { street: { meanLuma: 95 }, asset: { meanLuma: 88 } };

/* Decode a screenshot inside the page and reduce it to legibility metrics.
   `murkPct` — the fraction of pixels in the 64..112 luma band — is the metric
   that actually catches this defect, and it was chosen by calibration rather
   than by guess. Two frames of the identical camera, one with the coarse
   terrain punching through the deep-zoom drape and one without, differ by
   35.3% vs 19.8% in that band while mean luma moves only 138 → 156 and a
   naive "count pixels below 55" reads ~1% in both: the blotches are dull
   mid-grey, not black, so any threshold low enough to call them "dark"
   misses them entirely. Bins above 144 move the opposite way, which is why
   meanLuma alone is kept only as a weak secondary signal. */
async function measure(page, b64) {
  return page.evaluate(async (dataUrl) => {
    const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const W = bmp.width, H = bmp.height;
    const cv = new OffscreenCanvas(W, H);
    const ctx = cv.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;

    let sum = 0, murk = 0, dark = 0;
    const L = new Float32Array(W * H);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      L[p] = l;
      sum += l;
      if (l < 48) dark++;
      else if (l < 112) murk++;
    }
    /* `detail` = mean Sobel gradient. Ground texture — streets, roofs, field edges —
       carries high gradient; an opaque sheet of floodwater laid over it carries almost
       none. This is what makes "can you still see the city under the flood?" a number
       rather than an opinion, and it is the metric P5 is aimed at. */
    let grad = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const gx = -L[i - W - 1] - 2 * L[i - 1] - L[i + W - 1] + L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1];
        const gy = -L[i - W - 1] - 2 * L[i - W] - L[i - W + 1] + L[i + W - 1] + 2 * L[i + W] + L[i + W + 1];
        grad += Math.hypot(gx, gy);
      }
    }
    const N = W * H;
    return {
      meanLuma: +(sum / N).toFixed(1),
      murkPct: +((100 * murk) / N).toFixed(2),
      darkPct: +((100 * dark) / N).toFixed(2),
      detail: +(grad / (8 * (W - 2) * (H - 2))).toFixed(2),
    };
  }, b64);
}

/* Sweep every site × zoom in one browser session and return the metrics. */
async function sweep(browser, base, { hash = '', tag = '' } = {}) {
  const { page } = await bootApp(browser, base, { hash });
  const sites = await page.evaluate((ids) => ids.map((id) => {
    const c = window.FT.data.CITIES.find((k) => k.id === id);
    return { id, label: c.name, xKm: c.x, yKm: c.y };
  }), SITE_IDS);
  if (!tag) console.log(sites.map((s) => `${s.id}=(${s.xKm.toFixed(1)}, ${s.yKm.toFixed(1)})`).join('  ') + '\n');

  /* Tile/OSM fetches 504 often enough that a run can silently measure a scene with
     no satellite imagery at all. Those numbers are not comparable to a baseline
     recorded with imagery, so report the data state instead of quietly gating on it. */
  const feeds = await page.evaluate(() => ({
    imagery: !!(window.FT.geo && window.FT.geo.hasImagery),
    dem: !!(window.FT.geo && window.FT.geo.hasDEM),
    osmBldg: !!(window.FT.geo && window.FT.geo.hasOSMBldg),
  }));
  if (!feeds.imagery || !feeds.dem) {
    console.log(`WARNING degraded run — imagery=${feeds.imagery} dem=${feeds.dem} osmBldg=${feeds.osmBldg}; ` +
                `metrics are not comparable to the baseline.`);
  }

  /* Pin the simulation clock. The app auto-plays, so without this every run
     measures a different moment of the flood and the numbers drift for reasons
     that have nothing to do with rendering. T+12h is chosen because it is well
     into the flood — P5 is about how floodwater reads, so it has to be measured
     when there IS floodwater in frame. */
  await page.evaluate((t) => {
    const FT = window.FT;
    FT.state.playing = false;
    FT.state.timeH = t;
    FT.bus.emit('scrubbed');
    FT.world.updateRoadDepths();
    FT.zones.stepStats(true);
    const snap = FT.hydro.at(t);
    if (FT.alarms) FT.alarms.scan(snap);
    for (let i = 0; i < 5; i++) FT.ui.tick(snap);
  }, SIM_TIME_H);
  await page.waitForTimeout(1200);

  const out = { _feeds: feeds };
  for (const site of sites) {
    for (const zoom of ZOOMS) {
      await page.evaluate(({ x, y, z }) => {
        window.FT.scene3d.flyToSelection({ kind: 'point', xKm: x, yKm: y }, { intent: z });
      }, { x: site.xKm, y: site.yKm, z: zoom });
      /* the fly is eased and the deep-zoom drape streams tiles behind it */
      await page.waitForTimeout(6000);

      const key = `${site.id}/${zoom}`;
      const file = path.join(ARTIFACTS, `zoom-${site.id}-${zoom}${tag}.png`);
      const buf = await page.screenshot({ path: file, clip: CLIP });
      out[key] = await measure(page, `data:image/png;base64,${buf.toString('base64')}`);
      if (zoom === 'street') out[key].oversized = await oversizedAtStreet(page);
    }
  }
  await page.context().close();
  return out;
}

/* Guard against the bug class this file exists because of: things sized for the 96 km
   overview that never shrink when the camera comes down. It has been found five separate
   times — the deep-zoom drape, 110 m building footprints, 600 m road ribbons, 300 m
   vehicles, 310 m gauge markers — and each was spotted only by eye, days apart. This
   turns the next one into a test failure instead of another manual hunt.

   Terrain, drape, water and zone rings are exempt: they are legitimately kilometre-scale.
   Everything else that draws on the map should be within a city block at street zoom. */
const OVERSIZE_LIMIT_M = 250;
async function oversizedAtStreet(page) {
  return page.evaluate((limitM) => {
    const S3 = window.FT.scene3d;
    const scene = S3._roadMesh && S3._roadMesh.parent;
    if (!scene) return [];
    const THREE = window.THREE;
    const box = new THREE.Box3(), v = new THREE.Vector3(), m = new THREE.Matrix4();
    const exempt = new Set();
    if (S3._dq && S3._dq.mesh) exempt.add(S3._dq.mesh);
    scene.traverse((o) => {
      /* terrain + water are the two huge surfaces; zone rings are km-scale by design */
      if (o.isMesh && o.material && (o.material.type === 'ShaderMaterial' || o.material.map)) exempt.add(o);
      if (o.isMesh && o.geometry && o.geometry.type === 'RingGeometry') exempt.add(o);
    });
    /* Only measure things whose bounding box IS the feature size: instanced meshes (one
       box per vehicle/building) and single marker primitives. An arbitrary BufferGeometry
       is a merged mesh — the road ribbons are one object spanning the whole 96 km domain,
       so its bbox says 79 km while every individual ribbon is 108 m wide. Measuring that
       would be a false positive, and a gate that cries wolf gets switched off. */
    const MARKER_GEOM = new Set(['SphereGeometry', 'PlaneGeometry', 'CylinderGeometry', 'ConeGeometry']);
    const bad = [];
    scene.traverse((o) => {
      if (exempt.has(o) || !o.visible || !o.geometry) return;
      if (!o.isMesh && !o.isInstancedMesh) return;
      if (!o.isInstancedMesh && !MARKER_GEOM.has(o.geometry.type)) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      if (!bb) return;
      let extent;
      if (o.isInstancedMesh) {
        /* Scan every instance and take the max. Sampling instance 0 does NOT work: unused
           slots are parked at scale 0.001, so if slot 0 happens to be idle the check reads
           0.3 m and waves a 300 m vehicle straight through. Verified by reintroducing the
           real bug in a scratch copy — with instance 0 the gate stayed green. */
        let maxS = 0;
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m);
          const sx = v.setFromMatrixColumn(m, 0).length(), sz = v.setFromMatrixColumn(m, 2).length();
          const s = Math.max(sx, sz);
          if (s > 0.01 && s > maxS) maxS = s;        // skip the parked sentinel
        }
        extent = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * maxS;
      } else {
        box.copy(bb).applyMatrix4(o.matrixWorld);
        extent = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      }
      const extentM = extent * 1000;
      if (extentM > limitM) {
        const g = o.geometry.type;
        bad.push({ kind: o.isInstancedMesh ? `instanced[${g}]` : `mesh[${g}]`, extentM: Math.round(extentM) });
      }
    });
    return bad;
  }, OVERSIZE_LIMIT_M);
}

(async () => {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const srv = await listen(0);
  const port = srv.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await launchGpu();

  const results = await sweep(browser, base);
  /* ?drapelegacy reproduces the pre-fix drape so the comparison is a live
     measurement of both code paths, not this run against a stale file. */
  const legacy = COMPARE ? await sweep(browser, base, { hash: `?${CMP_SWITCH}`, tag: '-legacy' }) : null;

  for (const [key, m] of Object.entries(results)) {
    if (key === '_feeds') continue;
    const l = legacy && legacy[key];
    console.log(`${key.padEnd(18)} luma ${String(m.meanLuma).padStart(5)}  ` +
                `murk ${String(m.murkPct).padStart(5)}%  dark ${String(m.darkPct).padStart(5)}%` +
                `  detail ${String(m.detail).padStart(5)}` +
                (l ? `     legacy: murk ${String(l.murkPct).padStart(5)}%  detail ${String(l.detail).padStart(5)}` : ''));
  }

  await browser.close();
  srv.close();

  const degraded = !results._feeds.imagery || !results._feeds.dem;
  if (UPDATE || !fs.existsSync(BASELINE)) {
    /* Never freeze a degraded run as the reference — every later run would then be
       gated against a scene that had no satellite imagery in it. */
    if (degraded) {
      console.log('\nREFUSING to write baseline from a degraded run (imagery/DEM missing). Re-run when the tile feeds are up.');
      process.exit(1);
    }
    fs.writeFileSync(BASELINE, JSON.stringify(results, null, 2) + '\n');
    console.log(`\nbaseline written → ${path.relative(HERE, BASELINE)}`);
    if (UPDATE) process.exit(0);
  }

  /* gate */
  if (degraded) {
    console.log('\nSKIP gate — degraded data feeds, nothing meaningful to compare.');
    process.exit(0);
  }
  const ref = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  let failed = 0;
  console.log('');
  for (const [key, m] of Object.entries(results)) {
    if (key === '_feeds') continue;
    const zoom = key.split('/')[1];
    const b = ref[key], floor = FLOOR[zoom];
    const problems = [];
    if (b) {
      if (m.murkPct > b.murkPct + TOL.murkPct) problems.push(`murkPct ${m.murkPct} vs baseline ${b.murkPct} (+${TOL.murkPct} allowed)`);
      if (m.meanLuma < b.meanLuma - TOL.meanLuma) problems.push(`meanLuma ${m.meanLuma} vs baseline ${b.meanLuma} (−${TOL.meanLuma} allowed)`);
    } else problems.push('no baseline entry — run --update-baseline');
    if (floor && m.meanLuma < floor.meanLuma) problems.push(`meanLuma ${m.meanLuma} below floor ${floor.meanLuma}`);
    if (m.oversized && m.oversized.length) {
      problems.push(`overview-scale objects still drawn at street zoom: ` +
        m.oversized.map((o) => `${o.kind} ${o.extentM}m`).join(', '));
    }
    if (problems.length) { failed++; console.log(`FAIL ${key}: ${problems.join('; ')}`); }
    else console.log(`ok   ${key}`);
  }

  /* With --compare, also pin the fix itself: if someone drops the drape
     clearance, legacy and current converge and this stops being satisfied. */
  if (legacy) {
    const claim = CMP_CLAIM[CMP_SWITCH];
    if (!claim) console.log(`(no claim registered for ?${CMP_SWITCH} — printed for inspection only)`);
    else {
      const gains = Object.keys(results)
        .filter((k) => (k.endsWith('/street') || k.endsWith('/asset')) && legacy[k])
        .map((k) => claim.dir * (results[k][claim.metric] - legacy[k][claim.metric]));
      const mean = gains.reduce((a, b2) => a + b2, 0) / gains.length;
      if (mean < claim.min) { failed++; console.log(`FAIL ${claim.what}: mean ${claim.metric} gain over ?${CMP_SWITCH} is only ${mean.toFixed(2)} (need ${claim.min})`); }
      else console.log(`ok   ${claim.what} — mean ${claim.metric} gain over ?${CMP_SWITCH} ${mean.toFixed(2)}`);
    }
  }

  console.log(failed ? `\n${failed} gate(s) failed` : '\nall gates green');
  process.exit(failed ? 1 : 0);
})();
