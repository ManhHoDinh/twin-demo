/* FloodTwin Q1 Demo — map2d: operational 2D map (Flood-Hub style)
   Prerendered hypsometric+hillshade basemap · live water overlay · flow particles
   · road status · gauges/reservoirs · pan/zoom · hit-testing · PiP. */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, D = FT.data;
  const SZ = D.DOMAIN.sizeKm;

  let W, canvas, ctx, pipCanvas, pipCtx, tooltip;
  let cw = 0, ch = 0, dpr = 1;
  let base = null;                                  // offscreen basemap
  let waterCv = null, waterCtx = null, waterImg = null, waterStamp = 0;
  let waterEdgeCv = null, waterEdgeCtx = null, waterEdgeImg = null;
  let pipStamp = 0;
  const cam = { x: SZ / 2, y: SZ / 2, scale: 14 };  // px per km (logical px)
  let minScale = 10;

  /* particles */
  const NP = 2200;
  const px = new Float32Array(NP), py = new Float32Array(NP), pa = new Float32Array(NP);
  const vel = [0, 0];
  let prng;

  const M = (FT.map2d = {});
  const WATER_STYLE = {
    permanentWaterColor: "#0b3f61",
    simulatedWaterColor: "#56a8e4",
    simulatedCloseOpacity: 0.5,
    simulatedFarOpacity: 1,
    boundaryOpacity: 0.78,
    flowOpacity: 0.74,
  };

  /* ---------- transforms ---------- */
  const sx = (xKm) => (xKm - cam.x) * cam.scale * dpr + cw / 2;
  const sy = (yKm) => (yKm - cam.y) * cam.scale * dpr + ch / 2;
  const invX = (pxl) => (pxl - cw / 2) / (cam.scale * dpr) + cam.x;
  const invY = (pxl) => (pxl - ch / 2) / (cam.scale * dpr) + cam.y;

  function clampCam() {
    const half = SZ / 2;
    /* Google-Maps-depth zoom: up to ~0.14 m/px (z20 where imagery exists) */
    cam.scale = Math.max(minScale, Math.min(cam.scale, 7000));
    const view = Math.min(cw, ch) / (cam.scale * dpr);
    const m = Math.max(0.2, SZ - view * 0.5);
    cam.x = U.clamp(cam.x, half - m, half + m);
    cam.y = U.clamp(cam.y, half - m, half + m);
  }
  function cameraState() {
    return {
      xKm: cam.x,
      yKm: cam.y,
      scale: cam.scale,
      metresPerPixel: 1000 / cam.scale,
    };
  }
  function fitAll() {
    const s = Math.min(cw, ch) / dpr / (SZ * 1.04);
    cam.scale = s; minScale = s * 0.9; cam.x = SZ / 2; cam.y = SZ / 2;
  }

  /* ---------- basemap prerender (satellite-style) ---------- */
  function hashp(x, y) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }

  function buildBasemap() {
    /* REAL satellite imagery when geo.js loaded it */
    if (FT.geo && FT.geo.hasImagery) {
      const img = FT.geo.imagery;
      base = document.createElement("canvas");
      base.width = img.width; base.height = img.height;
      const bctx = base.getContext("2d");
      try { bctx.filter = "saturate(1.14) contrast(1.07)"; } catch (e) { /* older engines */ }
      bctx.drawImage(img, 0, 0);
      bctx.filter = "none";
      bctx.fillStyle = "rgba(4,10,18,0.10)";              // lighter tint — clearer imagery
      bctx.fillRect(0, 0, base.width, base.height);
      return;
    }
    const N = W.N, UP = 6, S = N * UP;
    base = document.createElement("canvas");
    base.width = S; base.height = S;
    const bctx = base.getContext("2d");
    const img = bctx.createImageData(S, S);
    const d = img.data;
    const t = W.terrain;
    /* bilinear samplers over the sim grid */
    const bil = (arr, fx, fy) => {
      const x0 = U.clamp(Math.floor(fx), 0, N - 1), y0 = U.clamp(Math.floor(fy), 0, N - 1);
      const x1 = Math.min(x0 + 1, N - 1), y1 = Math.min(y0 + 1, N - 1);
      const tx = U.clamp(fx - x0, 0, 1), ty = U.clamp(fy - y0, 0, 1);
      return U.lerp(U.lerp(arr[y0 * N + x0], arr[y0 * N + x1], tx), U.lerp(arr[y1 * N + x0], arr[y1 * N + x1], tx), ty);
    };
    for (let y = 0; y < S; y++) {
      const fy = y / UP;
      for (let x = 0; x < S; x++) {
        const fx = x / UP;
        const e = bil(t, fx, fy);
        const rd = bil(W.riverDist, fx, fy);
        const pop = bil(W.pop, fx, fy);
        /* gradient from bilinear field → smooth two-light hillshade */
        const ex = bil(t, fx + 0.6, fy) - bil(t, fx - 0.6, fy);
        const ey = bil(t, fx, fy + 0.6) - bil(t, fx, fy - 0.6);
        const slope = Math.min(1, Math.hypot(ex, ey) / 90);
        const lightNW = U.clamp(1 + (ex + ey) / 190, 0.45, 1.5);
        const lightNE = U.clamp(1 + (-ex + ey) / 420, 0.8, 1.2);
        let r, g, b;
        if (e <= 0.2) {
          /* sea: depth shade + turquoise shallows */
          const depth = U.clamp(-e / 7, 0, 1);
          r = U.lerp(30, 8, depth); g = U.lerp(86, 30, depth); b = U.lerp(118, 62, depth);
          const o0 = (y * S + x) * 4;
          d[o0] = r; d[o0 + 1] = g; d[o0 + 2] = b; d[o0 + 3] = 255;
          continue;
        }
        const n1 = hashp((fx * 0.9) | 0, (fy * 0.9) | 0);           // field-patch id (~340 m)
        const n2 = hashp(x * 0.13, y * 0.13) * 0.5 + hashp(x * 0.031, y * 0.031) * 0.5; // fine texture
        if (e < 1.6) { r = 178; g = 165; b = 128; }                  // sand / shoreline
        else if (e < 14) {
          /* delta paddies: patchwork of greens, wetter (darker) near channels */
          const patch = 0.35 + 0.65 * n1;
          r = U.lerp(56, 96, patch); g = U.lerp(112, 142, patch); b = U.lerp(58, 72, patch);
          if (rd < 1.6) { const w = 1 - rd / 1.6; r -= 18 * w; g -= 10 * w; b -= 6 * w; }
        } else if (e < 90) {
          const tt = (e - 14) / 76;
          r = U.lerp(82, 104, tt); g = U.lerp(118, 108, tt); b = U.lerp(62, 66, tt); // shrub/dry fields
        } else if (e < 900) {
          const tt = (e - 90) / 810;
          r = U.lerp(70, 92, tt); g = U.lerp(100, 84, tt); b = U.lerp(54, 60, tt);   // forest to the high ridges
        } else {
          const tt = Math.min(1, (e - 900) / 500);
          r = U.lerp(96, 148, tt); g = U.lerp(92, 140, tt); b = U.lerp(72, 124, tt); // bare rock crest
        }
        /* urban fabric where population is dense */
        const urb = U.clamp((pop - 60) / 320, 0, 0.8);
        if (urb > 0) {
          const ug = 138 + 26 * n2;
          r = U.lerp(r, ug, urb); g = U.lerp(g, ug, urb); b = U.lerp(b, ug + 4, urb);
        }
        /* texture, shading, riparian AO, faint contours */
        const tex = 0.9 + 0.2 * n2;
        let sh = lightNW * lightNE * U.clamp(1 - slope * 0.55, 0.55, 1.1) * tex;
        if (rd < 0.7 && e > 1.6) sh *= 0.8;
        if (e > 25) { const c = Math.abs(((e % 100) + 100) % 100); if (c < 3) sh *= 0.92; }
        r *= sh; g *= sh; b *= sh;
        const o = (y * S + x) * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
  }

  /* ---------- water overlay ---------- */
  const dcol = [0, 0, 0, 0];
  function buildWater(snap) {
    const N = W.N;
    if (!waterCv) {
      waterCv = document.createElement("canvas");
      waterCv.width = N; waterCv.height = N;
      waterCtx = waterCv.getContext("2d");
      waterImg = waterCtx.createImageData(N, N);
      waterEdgeCv = document.createElement("canvas");
      waterEdgeCv.width = N; waterEdgeCv.height = N;
      waterEdgeCtx = waterEdgeCv.getContext("2d");
      waterEdgeImg = waterEdgeCtx.createImageData(N, N);
    }
    const d = waterImg.data;
    const e = waterEdgeImg.data;
    const stormy = snap.rain > 40;
    const edgeAlpha = Math.round(WATER_STYLE.boundaryOpacity * 255);
    for (let k = 0; k < N * N; k++) {
      const o = k * 4;
      e[o + 3] = 0;
      if (W.sea[k]) {
        d[o] = stormy ? 24 : 11; d[o + 1] = stormy ? 60 : 63; d[o + 2] = stormy ? 84 : 97; d[o + 3] = 214;
        continue;
      }
      const h = W.h[k];
      const baseH = W.hBase[k] || 0;
      const simH = Math.max(0, h - baseH);
      if (simH >= 0.02) {
        U.depthColor(simH, dcol);
        d[o] = dcol[0]; d[o + 1] = dcol[1]; d[o + 2] = dcol[2]; d[o + 3] = (dcol[3] * 255) | 0;
      } else if (h >= 0.02 || W.riverDist[k] < 0.42) {
        d[o] = 11; d[o + 1] = 63; d[o + 2] = 97; d[o + 3] = 188;
      } else {
        d[o + 3] = 0;
      }
      if (simH >= 0.06) {
        const x = k % N, y = (k / N) | 0;
        const left = x > 0 ? Math.max(0, W.h[k - 1] - (W.hBase[k - 1] || 0)) : 0;
        const right = x < N - 1 ? Math.max(0, W.h[k + 1] - (W.hBase[k + 1] || 0)) : 0;
        const up = y > 0 ? Math.max(0, W.h[k - N] - (W.hBase[k - N] || 0)) : 0;
        const down = y < N - 1 ? Math.max(0, W.h[k + N] - (W.hBase[k + N] || 0)) : 0;
        if (left < 0.035 || right < 0.035 || up < 0.035 || down < 0.035) {
          e[o] = 82; e[o + 1] = 235; e[o + 2] = 255; e[o + 3] = edgeAlpha;
        }
      }
    }
    waterCtx.putImageData(waterImg, 0, 0);
    waterEdgeCtx.putImageData(waterEdgeImg, 0, 0);
  }

  /* ---------- live slippy-tile layer: every m² & every real road on deep zoom ---------- */
  function drawLiveTiles() {
    const g = FT.geo;
    if (!g || !g.tile || !g.hasImagery) return;
    /* screen resolution in metres per css px → pick matching tile zoom */
    const mPerPx = 1000 / cam.scale;
    if (mPerPx > 30) return;                                   // base canvas is sharp enough until ~z12
    const latMid = (g.LAT0 + g.LAT1) / 2;
    let z = 12;
    while (z < 20 && (40075016 * Math.cos((latMid * Math.PI) / 180)) / (Math.pow(2, z) * 256) > mPerPx * 1.35) z++;
    /* visible km-rect → lon/lat → tile range */
    const kx0 = Math.max(0, invX(0)), kx1 = Math.min(SZ, invX(cw));
    const ky0 = Math.max(0, invY(0)), ky1 = Math.min(SZ, invY(ch));
    const [lonA, latA] = g.km2ll(kx0, ky0);
    const [lonB, latB] = g.km2ll(kx1, ky1);
    const M = g.tileMath;
    const tx0 = Math.floor(M.lon2t(lonA, z)), tx1 = Math.floor(M.lon2t(lonB, z));
    const ty0 = Math.floor(M.lat2t(latA, z)), ty1 = Math.floor(M.lat2t(latB, z));
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 80) return;        // safety cap
    for (const layer of ["img", "rd", "pl"]) {
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const t = g.tile(layer, z, tx, ty);
          const lA = M.t2lon(tx, z), lB = M.t2lon(tx + 1, z);
          const pA = M.t2lat(ty, z), pB = M.t2lat(ty + 1, z);
          const [x0k, y0k] = g.ll2km(lA, pA);
          const [x1k, y1k] = g.ll2km(lB, pB);
          if (t.ok) {
            ctx.drawImage(t.img, sx(x0k), sy(y0k), sx(x1k) - sx(x0k), sy(y1k) - sy(y0k));
          } else if (z > 13 && layer === "img") {
            /* parent-tile fallback: crop the matching quarter of z-1 while this tile loads */
            const pT = g.tile(layer, z - 1, tx >> 1, ty >> 1);
            if (pT.ok) {
              ctx.drawImage(pT.img, (tx & 1) * 128, (ty & 1) * 128, 128, 128,
                sx(x0k), sy(y0k), sx(x1k) - sx(x0k), sy(y1k) - sy(y0k));
            }
          }
        }
      }
    }
    drawViewportAlleys(mPerPx);
    /* keep UI contrast consistent over bright hi-res tiles */
    ctx.fillStyle = "rgba(4,10,18,0.08)";
    ctx.fillRect(0, 0, cw, ch);
  }

  /* ---------- every-alley vectors on deep zoom (viewport Overpass, real browsers) ---------- */
  const alleyCache = new Map();               // "bx/by" (z15 blocks) → {segs|null, loading}
  function drawViewportAlleys(mPerPx) {
    const g = FT.geo;
    if (mPerPx > 2.2 || !g) return;
    const kx0 = Math.max(0, invX(0)), kx1 = Math.min(SZ, invX(cw));
    const ky0 = Math.max(0, invY(0)), ky1 = Math.min(SZ, invY(ch));
    const [lonA, latA] = g.km2ll(kx0, ky1);
    const [lonB, latB] = g.km2ll(kx1, ky0);
    const M = g.tileMath;
    const zB = 15;
    const bx0 = Math.floor(M.lon2t(lonA, zB)), bx1 = Math.floor(M.lon2t(lonB, zB));
    const by0 = Math.floor(M.lat2t(latB, zB)), by1 = Math.floor(M.lat2t(latA, zB));
    ctx.lineCap = "round";
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const key = `${bx}/${by}`;
        let e = alleyCache.get(key);
        if (!e) {
          e = { segs: null, loading: true };
          alleyCache.set(key, e);
          if (alleyCache.size > 60) alleyCache.delete(alleyCache.keys().next().value);
          const s = M.t2lat(by + 1, zB), n = M.t2lat(by, zB), w = M.t2lon(bx, zB), ee = M.t2lon(bx + 1, zB);
          const q = `[out:json][timeout:15];way["highway"](${s},${w},${n},${ee});out geom;`;
          fetch("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(q))
            .then((r) => (r.ok ? r.json() : null))
            .then((js) => {
              if (!js) { e.loading = false; return; }
              e.segs = (js.elements || [])
                .filter((el) => el.type === "way" && el.geometry)
                .map((el) => el.geometry.map((p) => g.ll2km(p.lon, p.lat)));
              e.loading = false;
            })
            .catch(() => { e.loading = false; });
        }
        if (!e.segs) continue;
        for (const seg of e.segs) {
          ctx.strokeStyle = "rgba(10,18,28,0.75)";
          ctx.lineWidth = 3.2 * dpr;
          ctx.beginPath();
          for (let i = 0; i < seg.length; i++) { const X = sx(seg[i][0]), Y = sy(seg[i][1]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
          ctx.stroke();
          ctx.strokeStyle = "rgba(250,250,245,0.8)";
          ctx.lineWidth = 1.7 * dpr;
          ctx.stroke();
        }
      }
    }
  }

  /* ---------- human-impact heatmap: population × flood depth ---------- */
  let impCv = null, impCtx = null, impImg = null, impStamp = 0;
  function drawImpact() {
    const N = W.N;
    const now = performance.now();
    if (!impCv) {
      impCv = document.createElement("canvas");
      impCv.width = N; impCv.height = N;
      impCtx = impCv.getContext("2d");
      impImg = impCtx.createImageData(N, N);
    }
    if (now - impStamp > 400) {
      impStamp = now;
      const d = impImg.data;
      const cap = W.floodCap;
      for (let k = 0; k < N * N; k++) {
        const o = k * 4;
        const ex = Math.min(cap, W.h[k] - W.hBase[k]);
        if (ex < 0.15 || W.sea[k]) { d[o + 3] = 0; continue; }
        const val = W.pop[k] * Math.min(1.2, ex);
        const a = Math.min(200, (val / 260) * 255);
        d[o] = 255; d[o + 1] = 64; d[o + 2] = 96; d[o + 3] = a;
      }
      impCtx.putImageData(impImg, 0, 0);
    }
    const x0 = sx(0), y0 = sy(0), wpx = SZ * cam.scale * dpr;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(impCv, x0, y0, wpx, wpx);
    ctx.restore();
  }

  /* ---------- particles ---------- */
  function respawn(i) {
    for (let tries = 0; tries < 6; tries++) {
      const x = prng() * SZ, y = prng() * SZ;
      if (W.sampleDepth(x, y) > 0.05) { px[i] = x; py[i] = y; pa[i] = 0.4 + prng() * 0.6; return; }
    }
    pa[i] = 0;
  }
  function stepParticles(dtReal) {
    const gain = 3.0 * dtReal;
    for (let i = 0; i < NP; i++) {
      if (pa[i] <= 0) { if (prng() < 0.06) respawn(i); continue; }
      W.sampleVel(px[i], py[i], vel);
      const sp = Math.hypot(vel[0], vel[1]);
      if (sp < 0.02 || W.sampleDepth(px[i], py[i]) < 0.03) { pa[i] -= dtReal * 1.5; continue; }
      px[i] += (vel[0] / 1000) * gain * 60;
      py[i] += (vel[1] / 1000) * gain * 60;
      pa[i] -= dtReal * 0.25;
      if (px[i] < 0 || px[i] > SZ || py[i] < 0 || py[i] > SZ) pa[i] = 0;
    }
  }

  /* ---------- fly-to animation ---------- */
  let flyAnim = null;
  const FLY_SCALES = { overview: 0, district: 45, asset: 180, street: 1800 };
  function settleFly(status) {
    if (!flyAnim) return;
    const meta = flyAnim.meta || {};
    flyAnim = null;
    if (FT.bus && meta.emit !== false) {
      FT.bus.emit("camera.fly.settled", {
        selection: meta.selection || null,
        intent: meta.intent || "overview",
        view: "2d",
        status: status || "settled",
        camera: cameraState(),
      });
    }
  }
  function cancelFly() {
    if (!flyAnim) return;
    settleFly("cancelled");
  }
  function startFly(xKm, yKm, scale, meta) {
    if (!Number.isFinite(xKm) || !Number.isFinite(yKm) || !Number.isFinite(scale)) return false;
    cancelFly();
    userPanned = true;
    flyAnim = {
      fx: cam.x,
      fy: cam.y,
      fs: cam.scale,
      tx: U.clamp(xKm, 0, SZ),
      ty: U.clamp(yKm, 0, SZ),
      ts: U.clamp(scale, minScale, 7000),
      start: performance.now(),
      duration: 700,
      meta: meta || {},
    };
    if (FT.bus && flyAnim.meta.emit !== false) {
      FT.bus.emit("camera.fly.start", {
        selection: flyAnim.meta.selection || null,
        intent: flyAnim.meta.intent || "overview",
        view: "2d",
        camera: cameraState(),
      });
    }
    return true;
  }
  M.flyTo = function (xKm, yKm, scaleMul) {
    return startFly(xKm, yKm, Math.min(minScale * 8, minScale * (scaleMul || 3.4)), { emit: false, intent: "asset" });
  };
  function stepFly() {
    if (!flyAnim) return;
    const t = Math.min(1, (performance.now() - flyAnim.start) / flyAnim.duration);
    const e = t * t * (3 - 2 * t);
    cam.x = U.lerp(flyAnim.fx, flyAnim.tx, e);
    cam.y = U.lerp(flyAnim.fy, flyAnim.ty, e);
    cam.scale = U.lerp(flyAnim.fs, flyAnim.ts, e);
    clampCam();
    if (t >= 1) settleFly("settled");
  }

  function pointFromSelection(selection) {
    if (!selection || typeof selection !== "object") return null;
    if (selection.kind === "point") {
      const x = +selection.xKm, y = +selection.yKm;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > SZ || y > SZ) return null;
      return { x, y };
    }
    if (selection.kind === "reservoir") {
      const r = D.RESERVOIRS.find((item) => item.id === selection.id);
      return r ? { x: r.x, y: r.y } : null;
    }
    if (selection.kind === "gauge") {
      const g = D.GAUGES.find((item) => item.id === selection.id);
      return g ? { x: g.x, y: g.y } : null;
    }
    if (selection.kind === "zone") {
      const z = D.ZONES.find((item) => item.id === selection.id);
      return z ? { x: z.x, y: z.y } : null;
    }
    return null;
  }

  /* ---------- zones ---------- */
  const Z_COLORS = ["rgba(79,195,247,", "rgba(255,213,79,", "rgba(255,160,64,", "rgba(255,82,82,"];
  function drawZones(t) {
    if (!FT.zones || !FT.zones.ready) return;
    for (const zs of FT.zones.list) {
      const z = zs.def;
      const X = sx(z.x), Y = sy(z.y), R = z.r * cam.scale * dpr;
      if (X < -R || X > cw + R || Y < -R || Y > ch + R) continue;
      const col = Z_COLORS[zs.status];
      ctx.beginPath();
      ctx.arc(X, Y, R, 0, 7);
      ctx.strokeStyle = col + (zs.status >= 3 ? 0.55 + 0.3 * Math.sin(t * 5) : 0.55) + ")";
      ctx.lineWidth = (zs.status >= 2 ? 2.2 : 1.2) * dpr;
      ctx.setLineDash(zs.status >= 2 ? [] : [5 * dpr, 5 * dpr]);
      ctx.stroke();
      ctx.setLineDash([]);
      /* choropleth: fill intensity ∝ MEAN flood depth of the area */
      if (zs.meanD > 0.04) {
        ctx.fillStyle = col + Math.min(0.34, 0.08 + zs.meanD * 0.2).toFixed(3) + ")";
        ctx.fill();
      }
      if (zs.status >= 2 || cam.scale > minScale * 1.5) {
        ctx.font = `600 ${9 * dpr}px sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 3 * dpr; ctx.strokeStyle = "rgba(5,12,20,0.85)";
        ctx.strokeText(z.name, X, Y - R - 4 * dpr);
        ctx.fillStyle = col + "0.95)";
        ctx.fillText(z.name, X, Y - R - 4 * dpr);
        if (zs.maxD > 0.05) {
          const t2 = zs.meanD >= 0.1
            ? `max ${U.fmt(zs.maxD, 1)} · TB ${U.fmt(zs.meanD, 1)} m${zs.accessOk ? "" : " · ✕EOC"}`
            : `max ${U.fmt(zs.maxD, 1)} m${zs.accessOk ? "" : " · ✕EOC"}`;
          ctx.font = `${8.5 * dpr}px ui-monospace, monospace`;
          ctx.strokeText(t2, X, Y - R + 8 * dpr);
          ctx.fillStyle = col + "0.95)";
          ctx.fillText(t2, X, Y - R + 8 * dpr);
        }
      }
    }
  }

  /* ---------- shelters (docs E-30 · FR-23) ----------
     Drawn with their LIVE validity, not as static pins: a site whose refuge level is
     under water, or that has lost resupply, must look different from one that is usable.
     A shelter map that cannot show an invalid shelter is how people get sent into one. */
  function drawShelters(t) {
    if (!D.SHELTERS || !FT.forecast || !FT.world.ready) return;
    const tH = FT.state.timeH;
    FT.forecast.ensureCalibrated(tH);
    const showLabel = cam.scale > minScale * 1.35;
    for (const sh of D.SHELTERS) {
      const X = sx(sh.x), Y = sy(sh.y);
      if (X < -30 || X > cw + 30 || Y < -30 || Y > ch + 30) continue;
      const st = FT.forecast.shelterState(sh, tH);
      const col = !st.valid ? "226,84,74" : st.warn ? "232,168,56" : "89,217,140";
      const r = 6 * dpr;
      /* house glyph — recognisable at a glance, not another coloured dot */
      ctx.beginPath();
      ctx.moveTo(X, Y - r * 1.25); ctx.lineTo(X + r, Y - r * 0.15);
      ctx.lineTo(X + r * 0.62, Y - r * 0.15); ctx.lineTo(X + r * 0.62, Y + r * 0.9);
      ctx.lineTo(X - r * 0.62, Y + r * 0.9); ctx.lineTo(X - r * 0.62, Y - r * 0.15);
      ctx.lineTo(X - r, Y - r * 0.15); ctx.closePath();
      ctx.fillStyle = `rgba(${col},${st.valid ? 0.88 : 0.6})`;
      ctx.fill();
      ctx.lineWidth = 1.4 * dpr;
      ctx.strokeStyle = "rgba(5,12,20,0.9)";
      ctx.stroke();
      if (!st.valid) {                                   // unmistakable cross — colour is never the only channel
        ctx.beginPath();
        ctx.moveTo(X - r * 0.8, Y - r * 0.8); ctx.lineTo(X + r * 0.8, Y + r * 0.8);
        ctx.moveTo(X + r * 0.8, Y - r * 0.8); ctx.lineTo(X - r * 0.8, Y + r * 0.8);
        ctx.strokeStyle = "rgba(255,235,235,0.95)";
        ctx.lineWidth = 1.8 * dpr;
        ctx.stroke();
      } else if (st.warn) {                              // ring = degraded but usable
        ctx.beginPath();
        ctx.arc(X, Y, r * 1.7, 0, 7);
        ctx.strokeStyle = `rgba(${col},0.75)`;
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.lineWidth = 1.3 * dpr;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (showLabel) {
        const cap = st.valid ? `${U.fmtInt(st.capacity)}` : FT.state.lang === "vi" ? "loại" : "excl";
        ctx.font = `600 ${8.5 * dpr}px sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 3 * dpr; ctx.strokeStyle = "rgba(5,12,20,0.85)";
        ctx.strokeText(`${sh.name} · ${cap}`, X, Y + r * 2.4);
        ctx.fillStyle = `rgba(${col},0.97)`;
        ctx.fillText(`${sh.name} · ${cap}`, X, Y + r * 2.4);
      }
    }
  }

  /* ---------- interactivity ---------- */
  let hover = null, dragging = false, lastPX = 0, lastPY = 0, moved = 0, userPanned = false;
  const keyboardCursor = { xKm: SZ / 2, yKm: SZ / 2, visible: false };
  const cursorKm = [NaN, NaN];
  function hitTest(mx, my) {
    const R = 14 * dpr;
    for (const g of D.GAUGES) {
      if (Math.hypot(sx(g.x) - mx, sy(g.y) - my) < R) return { kind: "gauge", obj: g };
    }
    for (const r of D.RESERVOIRS) {
      if (Math.hypot(sx(r.x) - mx, sy(r.y) - my) < R) return { kind: "res", obj: r };
    }
    if (FT.zones && FT.zones.ready && FT.state.layers.zones) {
      for (const zs of FT.zones.list) {
        const z = zs.def;
        const d = Math.hypot(sx(z.x) - mx, sy(z.y) - my);
        const Rz = z.r * cam.scale * dpr;
        if (Math.abs(d - Rz) < 7 * dpr || d < Math.min(Rz, 16 * dpr)) return { kind: "zone", obj: zs };
      }
    }
    let best = null, bd = R;
    for (const e of W.roads.edges) {
      const a = W.roads.nodes[e.a], b = W.roads.nodes[e.b];
      const d = distToSegPx(mx, my, sx(a.x), sy(a.y), sx(b.x), sy(b.y));
      if (d < bd) { bd = d; best = e; }
    }
    if (best) return { kind: "road", obj: best };
    return null;
  }
  function distToSegPx(pxl, pyl, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    const t = U.clamp(((pxl - ax) * dx + (pyl - ay) * dy) / L2, 0, 1);
    return Math.hypot(pxl - (ax + t * dx), pyl - (ay + t * dy));
  }

  function explainHit(hit, mx, my, pointerType) {
    let selection;
    if (!hit) {
      const xKm = invX(mx), yKm = invY(my);
      if (!Number.isFinite(xKm) || !Number.isFinite(yKm) || xKm < 0 || yKm < 0 || xKm > SZ || yKm > SZ) return;
      selection = { kind: "point", xKm, yKm };
    }
    else if (hit.kind === "gauge") selection = { kind: "gauge", id: hit.obj.id };
    else if (hit.kind === "res") selection = { kind: "reservoir", id: hit.obj.id };
    else if (hit.kind === "zone") selection = { kind: "zone", id: hit.obj.def.id };
    else selection = { kind: "road", id: `road:${hit.obj.idx}` };
    canvas.dataset.lastExplainPointer = pointerType || "mouse";
    FT.explain.select(selection);
  }

  function showTooltip(hit, clientX, clientY) {
    if (!hit) { tooltip.hidden = true; return; }
    const snap = FT.hydro.at ? FT.hydro.at(FT.state.timeH) : null;
    let html = "";
    if (hit.kind === "gauge") {
      const gs = snap.gauges[hit.obj.id];
      const lv = gs.alert;
      html = `<b>${hit.obj.name}</b> · ${hit.obj.river}<br>${U.fmt(gs.stage, 2)} m — ${lv ? FT.i18n.t("alert.bd") + lv : FT.i18n.t("alert.normal")}<br><small>${gs.trend >= 0 ? "▲" : "▼"} ${U.fmt(Math.abs(gs.trend), 2)} m/3h</small>`;
    } else if (hit.kind === "res") {
      const rs = snap.reservoirs[hit.obj.id];
      html = `<b>${hit.obj.name}</b><br>Z ${U.fmt(rs.Z, 1)} m / ${FT.i18n.t("res.ceil")} ${hit.obj.ceil} m<br><small>${FT.i18n.t("res.inflow")} ${U.fmtInt(rs.I)} · ${FT.i18n.t("res.outflow")} ${U.fmtInt(rs.O)} m³/s</small>`;
    } else if (hit.kind === "zone") {
      const zs = hit.obj;
      html = `<b>${zs.def.name}</b> · ${FT.i18n.t("zone.st" + zs.status)}<br>${FT.i18n.t("zone.depth")} ${U.fmt(zs.maxD, 2)} m · ${U.fmtInt(zs.exposed)} ${FT.i18n.t("unit.people")}<br><small>${FT.i18n.t("zone.access")}: ${zs.accessOk ? (zs.accessMin + " " + FT.i18n.t("unit.min")) : FT.i18n.t("zone.accessCut")}</small>`;
    } else if (hit.kind === "road") {
      const e = hit.obj;
      const status = ["road.open", "road.caution", "road.risk", "road.closed"][e.cls];
      html = `<b>${e.name}</b><br>${FT.i18n.t(status)}${e.depth > 0.02 ? ` · ${Math.round(e.depth * 100)} cm` : ""}`;
    }
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    const wrap = canvas.parentElement.getBoundingClientRect();
    tooltip.style.left = Math.min(clientX - wrap.left + 14, wrap.width - 200) + "px";
    tooltip.style.top = Math.max(8, clientY - wrap.top - 10) + "px";
  }

  function bindEvents() {
    canvas.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      cancelFly();
      userPanned = true;
      const mx = ev.offsetX * dpr, my = ev.offsetY * dpr;
      const wx = invX(mx), wy = invY(my);
      const f = Math.exp(-ev.deltaY * 0.0016);
      cam.scale *= f;
      clampCam();
      cam.x = wx - (mx - cw / 2) / (cam.scale * dpr);
      cam.y = wy - (my - ch / 2) / (cam.scale * dpr);
      clampCam();
    }, { passive: false });
    canvas.addEventListener("pointerdown", (ev) => {
      canvas.focus({ preventScroll: true });
      cancelFly();
      dragging = true; moved = 0; lastPX = ev.clientX; lastPY = ev.clientY; canvas.setPointerCapture(ev.pointerId);
    });
    canvas.addEventListener("pointermove", (ev) => {
      if (dragging) {
        const dx = ev.clientX - lastPX, dy = ev.clientY - lastPY;
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 6) userPanned = true;
        cam.x -= dx / cam.scale; cam.y -= dy / cam.scale;
        clampCam();
        lastPX = ev.clientX; lastPY = ev.clientY;
        tooltip.hidden = true;
      } else {
        hover = hitTest(ev.offsetX * dpr, ev.offsetY * dpr);
        canvas.style.cursor = hover ? "pointer" : "grab";
        showTooltip(hover, ev.clientX, ev.clientY);
        cursorKm[0] = invX(ev.offsetX * dpr); cursorKm[1] = invY(ev.offsetY * dpr);
      }
    });
    canvas.addEventListener("pointerup", (ev) => {
      dragging = false;
      if (moved < 6) {
        const hit = hitTest(ev.offsetX * dpr, ev.offsetY * dpr);
        if (hit && hit.kind === "gauge") { FT.state.selectedGauge = hit.obj.id; FT.bus.emit("gaugeSelected", hit.obj.id); }
        else if (hit && hit.kind === "res") FT.bus.emit("reservoirFocus", hit.obj.id);
        else if (hit && hit.kind === "zone") FT.bus.emit("zoneSelected", hit.obj.def.id);
        explainHit(hit, ev.offsetX * dpr, ev.offsetY * dpr, ev.pointerType);
      }
    });
    canvas.addEventListener("keydown", (ev) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Escape"].includes(ev.key)) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.key === "Escape") {
        FT.explain.clear();
        return;
      }
      if (ev.key === "Enter") {
        keyboardCursor.visible = true;
        canvas.dataset.inspectionCursor = "visible";
        FT.explain.select({ kind: "point", xKm: keyboardCursor.xKm, yKm: keyboardCursor.yKm });
        return;
      }
      const step = ev.shiftKey ? 5 : 1;
      keyboardCursor.visible = true;
      if (ev.key === "ArrowLeft") keyboardCursor.xKm -= step;
      if (ev.key === "ArrowRight") keyboardCursor.xKm += step;
      if (ev.key === "ArrowUp") keyboardCursor.yKm -= step;
      if (ev.key === "ArrowDown") keyboardCursor.yKm += step;
      keyboardCursor.xKm = U.clamp(keyboardCursor.xKm, 0, SZ);
      keyboardCursor.yKm = U.clamp(keyboardCursor.yKm, 0, SZ);
      canvas.dataset.inspectionCursor = "visible";
    });
    canvas.addEventListener("pointerleave", () => { tooltip.hidden = true; });
    canvas.addEventListener("dblclick", (ev) => {
      cancelFly();
      userPanned = true;
      const mx = ev.offsetX * dpr, my = ev.offsetY * dpr;
      cam.x = invX(mx); cam.y = invY(my); cam.scale *= 2; clampCam();
    });
  }

  /* ---------- drawing helpers ---------- */
  function drawRivers() {
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const subtle = FT.geo && FT.geo.hasImagery;           // real imagery already shows the rivers
    for (const r of D.RIVERS) {
      ctx.strokeStyle = subtle ? "rgba(90,170,225,0.4)" : "rgba(64,140,200,0.85)";
      ctx.lineWidth = Math.max(1.2, r.w * cam.scale * (subtle ? 0.3 : 0.5)) * dpr;
      ctx.beginPath();
      r.pts.forEach((p, i) => (i ? ctx.lineTo(sx(p[0]), sy(p[1])) : ctx.moveTo(sx(p[0]), sy(p[1]))));
      ctx.stroke();
    }
    // diversion tunnel
    ctx.strokeStyle = "rgba(120,150,180,0.5)";
    ctx.setLineDash([5 * dpr, 5 * dpr]);
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    ctx.moveTo(sx(D.DIVERSION.from[0]), sy(D.DIVERSION.from[1]));
    ctx.lineTo(sx(D.DIVERSION.to[0]), sy(D.DIVERSION.to[1]));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* REAL OSM roads: cartographic casing + live flood-status colour per chunk */
  function drawOsmRoads(t) {
    const osm = FT.geo.osmRoads;
    const zf = U.clamp(cam.scale / (minScale * 1.1), 0.8, 3.2);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (let pass = 0; pass < 2; pass++) {
      for (const s of osm) {
        const wBase = (s.cls === "mw" ? 3.2 : s.cls === "pri" ? 2.4 : 1.6) * zf * dpr;
        if (pass === 0) {
          ctx.strokeStyle = "rgba(8,16,26,0.85)";
          ctx.lineWidth = wBase + 2 * dpr;
        } else {
          ctx.strokeStyle = s.dcls > 0 ? U.roadColor(s.depth) : (s.cls === "mw" ? "rgba(255,225,150,0.95)" : s.cls === "pri" ? "rgba(245,245,240,0.92)" : "rgba(210,214,220,0.8)");
          ctx.lineWidth = wBase;
          if (s.dcls >= 3) ctx.setLineDash([6 * dpr, 4 * dpr]);
        }
        ctx.beginPath();
        for (let i = 0; i < s.pts.length; i++) {
          const X = sx(s.pts[i][0]), Y = sy(s.pts[i][1]);
          i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        if (pass === 1 && s.dcls >= 3) {
          const m = s.mids[(s.mids.length / 2) | 0];
          ctx.fillStyle = U.css("--road-closed");
          ctx.font = `bold ${11 * dpr}px sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 5);
          ctx.fillText("×", sx(m[0]), sy(m[1]));
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  /* mọi ngóc ngách: đường nhỏ + ngõ hẻm OSM (vector, tự bật ở trình duyệt thật) */
  function drawMinorRoads() {
    const g = FT.geo;
    if (!g || !g.hasOSMMinor) return;
    const mPerPx = 1000 / cam.scale;
    if (mPerPx > 9) return;                                // chỉ từ mức phố trở xuống
    const kx0 = invX(0) - 0.3, kx1 = invX(cw) + 0.3, ky0 = invY(0) - 0.3, ky1 = invY(ch) + 0.3;
    const W2 = { ter: 2.4, res: 1.7, aly: 1.1 };
    const C2 = { ter: "rgba(213,221,229,0.85)", res: "rgba(196,205,215,0.8)", aly: "rgba(172,182,194,0.75)" };
    ctx.lineCap = "round";
    for (const s of g.osmMinor) {
      if (s.cls === "aly" && mPerPx > 3.5) continue;       // hẻm chỉ hiện khi zoom sát
      const p0 = s.pts[0], pN = s.pts[s.pts.length - 1];
      if (Math.max(p0[0], pN[0]) < kx0 || Math.min(p0[0], pN[0]) > kx1 ||
          Math.max(p0[1], pN[1]) < ky0 || Math.min(p0[1], pN[1]) > ky1) continue;
      ctx.beginPath();
      s.pts.forEach((p, i) => (i ? ctx.lineTo(sx(p[0]), sy(p[1])) : ctx.moveTo(sx(p[0]), sy(p[1]))));
      ctx.strokeStyle = "rgba(8,16,26,0.65)";
      ctx.lineWidth = (W2[s.cls] + 1.6) * dpr;
      ctx.stroke();
      ctx.strokeStyle = C2[s.cls];
      ctx.lineWidth = W2[s.cls] * dpr;
      ctx.stroke();
    }
  }

  function drawRoads(t) {
    drawMinorRoads();
    if (FT.geo && FT.geo.hasOSM) { drawOsmRoads(t); return; }
    const accentOnly = FT.geo && FT.geo.hasTransport;      // real cartography underneath → only flood accents
    const zf = U.clamp(cam.scale / 14, 0.7, 2.2) * (accentOnly ? 0.7 : 1);
    for (const e of W.roads.edges) {
      if (accentOnly && e.cls === 0) continue;             // open roads: let the real map show
      const a = W.roads.nodes[e.a], b = W.roads.nodes[e.b];
      const wpx = (e.type === "exp" ? 3.5 : e.type === "hw" ? 2.5 : e.type === "prov" ? 1.8 : 1.4) * zf * dpr;
      const tracePoly = () => {
        ctx.beginPath();
        e.pts.forEach((p, i) => (i ? ctx.lineTo(sx(p[0]), sy(p[1])) : ctx.moveTo(sx(p[0]), sy(p[1]))));
        ctx.stroke();
      };
      if (e.bridge) {
        ctx.strokeStyle = "rgba(10,20,32,0.9)";
        ctx.lineWidth = wpx + 2.4 * dpr;
        tracePoly();
      }
      ctx.strokeStyle = U.roadColor(e.depth);
      ctx.lineWidth = wpx;
      if (e.cls >= 3) ctx.setLineDash([6 * dpr, 4 * dpr]);
      tracePoly();
      ctx.setLineDash([]);
      if (e.cls >= 3) {
        const mx = (sx(a.x) + sx(b.x)) / 2, my = (sy(a.y) + sy(b.y)) / 2;
        ctx.fillStyle = U.css("--road-closed");
        ctx.font = `bold ${11 * dpr}px sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const pulse = 0.7 + 0.3 * Math.sin(t * 5);
        ctx.globalAlpha = pulse;
        ctx.fillText("×", mx, my);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawVehicles() {
    const vs = FT.traffic.vehicles || [];
    for (const v of vs) {
      if (v.x === undefined) continue;
      const X = sx(v.x), Y = sy(v.y);
      if (X < -20 || X > cw + 20 || Y < -20 || Y > ch + 20) continue;
      const col = v.state === "blocked" ? "#ff5a5a" : v.state === "rerouting" ? "#ffb054" : "#ffe9cf";
      ctx.fillStyle = col;
      if (v.type === "moto") { ctx.fillRect(X - 1 * dpr, Y - 1 * dpr, 2 * dpr, 2 * dpr); continue; }
      ctx.save();
      ctx.translate(X, Y);
      ctx.rotate(v.heading);
      const L = (v.type === "truck" || v.type === "bus" ? 6 : 4.4) * dpr, Wd = 2.2 * dpr;
      ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
      ctx.restore();
    }
  }

  function drawReservoirs(snap, t) {
    for (const r of D.RESERVOIRS) {
      const rs = snap.reservoirs[r.id];
      const X = sx(r.x), Y = sy(r.y);
      const R = 9 * dpr;
      if (rs.spilling) {
        ctx.beginPath();
        ctx.arc(X, Y, R + (4 + 2 * Math.sin(t * 4)) * dpr, 0, 7);
        ctx.fillStyle = "rgba(55,182,255,0.16)";
        ctx.fill();
      }
      /* reservoir glyph: rounded square with a vertical level bar (reads instantly) */
      const S2 = R * 1.9;
      const rx = X - S2 / 2, ry = Y - S2 / 2;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(rx, ry, S2, S2, 4 * dpr) : ctx.rect(rx, ry, S2, S2);
      ctx.fillStyle = "rgba(10,26,41,0.92)";
      ctx.fill();
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = rs.overCeil ? U.css("--al-3") : rs.spilling ? "rgba(255,170,80,0.9)" : "rgba(148,196,234,0.55)";
      ctx.stroke();
      const fh = Math.min(1.04, rs.pct) * (S2 - 4 * dpr);
      ctx.fillStyle = rs.overCeil ? "rgba(255,110,90,0.95)" : "rgba(55,182,255,0.9)";
      ctx.fillRect(rx + 2 * dpr, ry + S2 - 2 * dpr - fh, S2 - 4 * dpr, fh);
      /* pre-flood ceiling notch */
      const cy = ry + S2 - 2 * dpr - rs.ceilPct * (S2 - 4 * dpr);
      ctx.fillStyle = U.css("--warn");
      ctx.fillRect(rx + 1 * dpr, cy, S2 - 2 * dpr, 1.5 * dpr);
      if (rs.spilling) {
        ctx.fillStyle = "#7fd4ff";
        ctx.font = `${8.5 * dpr}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.fillText(`${U.fmtInt(rs.O)} m³/s`, X, Y + R + 12 * dpr);
      }
      if (FT.state.layers.labels) {
        ctx.fillStyle = "#9fd8d2";
        ctx.font = `${9 * dpr}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(r.name, X, Y - R - 4 * dpr);
      }
    }
  }

  function drawGauges(snap, t) {
    for (const g of D.GAUGES) {
      const gs = snap.gauges[g.id];
      const X = sx(g.x), Y = sy(g.y);
      const sel = FT.state.selectedGauge === g.id;
      if (gs.alert >= 2) {
        ctx.beginPath();
        ctx.arc(X, Y, (8 + 3 * Math.sin(t * 5)) * dpr, 0, 7);
        ctx.strokeStyle = U.alertColor(gs.alert);
        ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5 * dpr; ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.arc(X, Y, 5 * dpr, 0, 7);
      ctx.fillStyle = U.alertColor(gs.alert);
      ctx.fill();
      ctx.lineWidth = (sel ? 2.2 : 1.2) * dpr;
      ctx.strokeStyle = sel ? "#fff" : "rgba(6,18,29,0.9)";
      ctx.stroke();
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = "rgba(5,12,20,0.85)";               // halo for readability on bright imagery
      if (cam.scale > minScale * 1.35 || sel) {
        ctx.font = `${9 * dpr}px ui-monospace, monospace`;
        ctx.textAlign = "left";
        ctx.strokeText(`${U.fmt(gs.stage, 1)} m`, X + 8 * dpr, Y + 3 * dpr);
        ctx.fillStyle = "#eaf4fd";
        ctx.fillText(`${U.fmt(gs.stage, 1)} m`, X + 8 * dpr, Y + 3 * dpr);
      }
      if (FT.state.layers.labels) {
        ctx.font = `${9 * dpr}px sans-serif`;
        ctx.textAlign = "left";
        ctx.strokeText(g.name, X + 8 * dpr, Y - 6 * dpr);
        ctx.fillStyle = "rgba(224,240,252,0.95)";
        ctx.fillText(g.name, X + 8 * dpr, Y - 6 * dpr);
      }
    }
  }

  function drawCities() {
    for (const c of D.CITIES) {
      const X = sx(c.x), Y = sy(c.y);
      const minor = c.size < 1;
      if (minor && cam.scale < minScale * 1.6) continue;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath(); ctx.arc(X, Y, (minor ? 2 : 2.8) * dpr, 0, 7); ctx.fill();
      ctx.font = `600 ${(minor ? 9 : 10 + c.size * 1.2) * dpr}px sans-serif`;
      ctx.textAlign = "left";
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = "rgba(5,12,20,0.85)";
      ctx.strokeText(c.name, X + 5 * dpr, Y - 4 * dpr);
      ctx.fillStyle = "rgba(244,250,255,0.96)";
      ctx.fillText(c.name, X + 5 * dpr, Y - 4 * dpr);
    }
    drawPlaces();
  }

  /* gazetteer thật: quận/huyện · cầu · địa danh — hiện dần theo mức zoom */
  function drawPlaces() {
    if (!D.PLACES) return;
    const t1 = cam.scale > minScale * 1.25, t2 = cam.scale > minScale * 3.2;
    if (!t1) return;
    ctx.textAlign = "center";
    for (const p of D.PLACES) {
      if (p.t === 2 && !t2) continue;
      const X = sx(p.x), Y = sy(p.y);
      if (X < -40 || X > cw + 40 || Y < -20 || Y > ch + 20) continue;
      if (p.k === "dist") {
        ctx.font = `700 ${9.5 * dpr}px sans-serif`;
        ctx.lineWidth = 3 * dpr;
        ctx.strokeStyle = "rgba(5,12,20,0.75)";
        ctx.strokeText(p.n.toUpperCase(), X, Y);
        ctx.fillStyle = "rgba(196,214,232,0.72)";
        ctx.fillText(p.n.toUpperCase(), X, Y);
      } else {
        const bridge = p.k === "bridge";
        ctx.fillStyle = bridge ? "rgba(120,210,255,0.95)" : "rgba(255,214,140,0.95)";
        ctx.beginPath(); ctx.arc(X, Y, 1.8 * dpr, 0, 7); ctx.fill();
        ctx.font = `600 ${9 * dpr}px sans-serif`;
        ctx.lineWidth = 3 * dpr;
        ctx.strokeStyle = "rgba(5,12,20,0.85)";
        ctx.strokeText(p.n, X, Y - 4 * dpr);
        ctx.fillStyle = bridge ? "rgba(170,225,255,0.96)" : "rgba(255,226,170,0.96)";
        ctx.fillText(p.n, X, Y - 4 * dpr);
      }
    }
    ctx.textAlign = "left";
  }

  let hatchOff = 0;
  function drawRain(snap, dtReal) {
    if (snap.rain < 8) return;
    hatchOff = (hatchOff + dtReal * 120) % 40;
    const alpha = U.clamp((snap.rain - 8) / 120, 0.04, 0.22);
    ctx.save();
    ctx.strokeStyle = `rgba(160,200,235,${alpha})`;
    ctx.lineWidth = 1 * dpr;
    const step = 26 * dpr;
    ctx.beginPath();
    for (let x = -ch; x < cw + ch; x += step) {
      ctx.moveTo(x + hatchOff * dpr, 0);
      ctx.lineTo(x + hatchOff * dpr - ch * 0.35, ch);
    }
    ctx.stroke();
    // orographic west emphasis
    const grd = ctx.createLinearGradient(0, 0, cw, 0);
    grd.addColorStop(0, `rgba(120,170,215,${alpha * 0.9})`);
    grd.addColorStop(0.5, "rgba(120,170,215,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
  }

  function drawHUD(snap) {
    // scale bar
    const targetPx = 90 * dpr;
    let km = (targetPx / (cam.scale * dpr));
    const nice = [1, 2, 5, 10, 20];
    km = nice.reduce((p, c) => (Math.abs(c - km) < Math.abs(p - km) ? c : p));
    const wpx = km * cam.scale * dpr;
    const bx = 14 * dpr, by = ch - 18 * dpr;
    ctx.fillStyle = "rgba(7,19,32,0.7)";
    ctx.fillRect(bx - 6 * dpr, by - 14 * dpr, wpx + 12 * dpr, 24 * dpr);
    ctx.strokeStyle = "#cfe4f4"; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + wpx, by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, by - 4 * dpr); ctx.lineTo(bx, by + 4 * dpr); ctx.moveTo(bx + wpx, by - 4 * dpr); ctx.lineTo(bx + wpx, by + 4 * dpr); ctx.stroke();
    ctx.fillStyle = "#cfe4f4";
    ctx.font = `${9 * dpr}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.fillText(`${km} km`, bx + wpx / 2, by - 6 * dpr);
    // north arrow
    const nx = cw - 26 * dpr, ny = 30 * dpr;
    ctx.fillStyle = "rgba(7,19,32,0.7)";
    ctx.beginPath(); ctx.arc(nx, ny, 14 * dpr, 0, 7); ctx.fill();
    ctx.fillStyle = "#e8f2fb";
    ctx.beginPath();
    ctx.moveTo(nx, ny - 9 * dpr); ctx.lineTo(nx - 4.5 * dpr, ny + 6 * dpr); ctx.lineTo(nx, ny + 2 * dpr); ctx.lineTo(nx + 4.5 * dpr, ny + 6 * dpr);
    ctx.closePath(); ctx.fill();
    ctx.font = `bold ${8 * dpr}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("N", nx, ny - 12 * dpr);
    // cursor → real geographic coordinates
    if (FT.geo && !Number.isNaN(cursorKm[0])) {
      const [lon, lat] = FT.geo.km2ll(cursorKm[0], cursorKm[1]);
      if (lon >= FT.geo.LON0 && lon <= FT.geo.LON1 && lat >= FT.geo.LAT0 && lat <= FT.geo.LAT1) {
        const txt = `${lon.toFixed(4)}°E ${lat.toFixed(4)}°N`;
        ctx.font = `${9 * dpr}px ui-monospace, monospace`;
        const tw2 = ctx.measureText(txt).width;
        ctx.fillStyle = "rgba(7,19,32,0.75)";
        ctx.fillRect(10 * dpr, 36 * dpr, tw2 + 16 * dpr, 18 * dpr);
        ctx.fillStyle = "#9fc6e8";
        ctx.textAlign = "left";
        ctx.fillText(txt, 18 * dpr, 48.5 * dpr);
      }
    }
    // time chip
    const label = `${U.rel(FT.state.timeH)} · ${FT.i18n.t(snap.phase)}`;
    ctx.font = `${9.5 * dpr}px ui-monospace, monospace`;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(7,19,32,0.75)";
    ctx.fillRect(10 * dpr, 10 * dpr, tw + 16 * dpr, 20 * dpr);
    ctx.fillStyle = "#bfe0f7";
    ctx.textAlign = "left";
    ctx.fillText(label, 18 * dpr, 23.5 * dpr);
  }

  function drawKeyboardCursor() {
    if (!keyboardCursor.visible) return;
    const x = sx(keyboardCursor.xKm), y = sy(keyboardCursor.yKm), r = 9 * dpr;
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2 * dpr;
    ctx.shadowColor = "rgba(5, 14, 24, .95)";
    ctx.shadowBlur = 4 * dpr;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - r * 1.6, y); ctx.lineTo(x + r * 1.6, y);
    ctx.moveTo(x, y - r * 1.6); ctx.lineTo(x, y + r * 1.6);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- API ---------- */
  M.init = function (mainCanvas, pip) {
    W = FT.world;
    canvas = mainCanvas; ctx = canvas.getContext("2d");
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-describedby", "map2dInstructions");
    pipCanvas = pip; pipCtx = pip.getContext("2d");
    tooltip = document.getElementById("tooltip");
    prng = U.mulberry(777);
    const ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cw = Math.max(4, Math.round(r.width * dpr));
      ch = Math.max(4, Math.round(r.height * dpr));
      canvas.width = cw; canvas.height = ch;
      fitAll();
    });
    ro.observe(canvas);
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = Math.max(4, Math.round(r.width * dpr)); ch = Math.max(4, Math.round(r.height * dpr));
    canvas.width = cw; canvas.height = ch;
    buildBasemap();
    fitAll();
    for (let i = 0; i < NP; i++) respawn(i);
    bindEvents();
  };

  let clock = 0;
  M.render = function (dtReal, snap) {
    if (!base || !cw) return;
    clock += dtReal;
    if (!userPanned && !flyAnim) fitAll();          // stay perfectly framed until the user takes over
    stepFly();
    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;

    const x0 = sx(0), y0 = sy(0), wpx = SZ * cam.scale * dpr;
    ctx.fillStyle = "#050e18";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(base, x0, y0, wpx, wpx);
    /* deep zoom: native-resolution city patches on top of the base */
    if (FT.geo && FT.geo.detailPatches && cam.scale > minScale * 2.1) {
      for (const p of FT.geo.detailPatches) {
        const px0 = sx(p.x0), py0 = sy(p.y0), px1 = sx(p.x1), py1 = sy(p.y1);
        if (px1 < 0 || px0 > cw || py1 < 0 || py0 > ch) continue;
        ctx.drawImage(p.canvas, px0, py0, px1 - px0, py1 - py0);
      }
    }
    /* m²-level: on-demand slippy tiles matched to the current zoom (up to z19 ≈ 0.3 m/px) */
    drawLiveTiles();

    if (FT.state.layers.water) {
      const now = performance.now();
      if (now - waterStamp > 150 || !waterCv) { buildWater(snap); waterStamp = now; }
      /* at street-level zoom, let the real map read through the (sim-res) water */
      const waterAlpha = U.clamp((1000 / cam.scale) / 8, WATER_STYLE.simulatedCloseOpacity, 1);
      ctx.globalAlpha = waterAlpha;
      ctx.drawImage(waterCv, x0, y0, wpx, wpx);
      ctx.globalAlpha = 1;
      if (waterEdgeCv) ctx.drawImage(waterEdgeCv, x0, y0, wpx, wpx);
    }
    if (FT.state.layers.impact) drawImpact();
    drawRivers();
    if (FT.state.layers.flow) {
      stepParticles(dtReal);
      ctx.lineWidth = 1.1 * dpr;
      for (let i = 0; i < NP; i++) {
        if (pa[i] <= 0.02) continue;
        W.sampleVel(px[i], py[i], vel);
        const sp = Math.hypot(vel[0], vel[1]);
        if (sp < 0.03) continue;
        const X = sx(px[i]), Y = sy(py[i]);
        if (X < 0 || X > cw || Y < 0 || Y > ch) continue;
        const L = U.clamp(sp * 3, 1.2, 7) * dpr;
        ctx.strokeStyle = `rgba(3,12,22,${U.clamp(pa[i] * 0.52, 0.2, 0.56)})`;
        ctx.lineWidth = 2.4 * dpr;
        ctx.beginPath();
        ctx.moveTo(X, Y);
        ctx.lineTo(X - (vel[0] / sp) * L, Y - (vel[1] / sp) * L);
        ctx.stroke();
        ctx.strokeStyle = `rgba(158,244,255,${U.clamp(pa[i] * U.clamp(sp * 0.62, 0.18, WATER_STYLE.flowOpacity), 0.12, WATER_STYLE.flowOpacity)})`;
        ctx.lineWidth = 1.1 * dpr;
        ctx.beginPath();
        ctx.moveTo(X, Y);
        ctx.lineTo(X - (vel[0] / sp) * L, Y - (vel[1] / sp) * L);
        ctx.stroke();
      }
    }
    if (FT.state.layers.roads) drawRoads(clock);
    if (FT.state.layers.traffic) drawVehicles();
    if (FT.state.layers.zones) drawZones(clock);
    if (FT.state.layers.shelters) drawShelters(clock);
    if (FT.state.layers.reservoirs) drawReservoirs(snap, clock);
    if (FT.state.layers.gauges) drawGauges(snap, clock);
    if (FT.state.layers.labels) drawCities();
    if (FT.state.layers.rain) drawRain(snap, dtReal);
    drawKeyboardCursor();
    drawHUD(snap);
  };

  Object.defineProperty(M, "keyboardCursor", { enumerable: true, get() { return { ...keyboardCursor }; } });

  M.cameraState = cameraState;

  M.waterPresentation = function () {
    const closeAlpha = U.clamp((1000 / cam.scale) / 8, WATER_STYLE.simulatedCloseOpacity, 1);
    return {
      permanentWaterColor: WATER_STYLE.permanentWaterColor,
      simulatedWaterColor: WATER_STYLE.simulatedWaterColor,
      closeOpacity: closeAlpha,
      farOpacity: WATER_STYLE.simulatedFarOpacity,
      simulatedFillOpacity: closeAlpha,
      boundaryOpacity: WATER_STYLE.boundaryOpacity,
      flowOpacity: WATER_STYLE.flowOpacity,
      metresPerPixel: 1000 / cam.scale,
      mode: "presentation-metadata",
    };
  };

  M.zoomStep = function (direction) {
    if (!cw || !ch) return false;
    cancelFly();
    userPanned = true;
    const mx = cw / 2, my = ch / 2;
    const wx = invX(mx), wy = invY(my);
    const factor = direction === "out" || direction < 0 ? 1 / 1.45 : 1.45;
    cam.scale = U.clamp(cam.scale * factor, minScale, 7000);
    cam.x = wx - (mx - cw / 2) / (cam.scale * dpr);
    cam.y = wy - (my - ch / 2) / (cam.scale * dpr);
    clampCam();
    return true;
  };

  M.resetNorth = function () {
    return true;
  };

  M.toggleTilt = function () {
    return false;
  };

  M.flyToSelection = function (selection, options) {
    const point = pointFromSelection(selection);
    if (!point) return false;
    const intent = options && options.intent || (selection.kind === "point" ? "asset" : "district");
    const requested = FLY_SCALES[intent] || FLY_SCALES.asset;
    const scale = intent === "overview" ? minScale : requested;
    return startFly(point.x, point.y, U.clamp(scale, minScale, 7000), { selection, intent });
  };

  M.renderPip = function (snap, mode) {
    const now = performance.now();
    if (now - pipStamp < 250) return;
    pipStamp = now;
    const pw = pipCanvas.width, ph = pipCanvas.height;
    pipCtx.clearRect(0, 0, pw, ph);
    if (mode === "3d" && FT.state.threeReady) {
      const c3 = document.getElementById("canvas3d");
      if (c3 && c3.width > 0) {
        const s = Math.max(pw / c3.width, ph / c3.height);
        const dw = c3.width * s, dh = c3.height * s;
        pipCtx.drawImage(c3, (pw - dw) / 2, (ph - dh) / 2, dw, dh);
      }
      return;
    }
    // mini 2D overview (letterboxed square)
    if (!base) return;
    const side = Math.min(pw, ph);
    const ox = (pw - side) / 2, oy = (ph - side) / 2;
    pipCtx.fillStyle = "#050e18";
    pipCtx.fillRect(0, 0, pw, ph);
    pipCtx.drawImage(base, ox, oy, side, side);
    if (waterCv) pipCtx.drawImage(waterCv, ox, oy, side, side);
    for (const g of D.GAUGES) {
      const gs = snap.gauges[g.id];
      pipCtx.beginPath();
      pipCtx.arc(ox + (g.x / SZ) * side, oy + (g.y / SZ) * side, 3, 0, 7);
      pipCtx.fillStyle = U.alertColor(gs.alert);
      pipCtx.fill();
    }
  };
})();
