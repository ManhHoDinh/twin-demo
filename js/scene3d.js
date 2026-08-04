/* FloodTwin Q1 Demo — scene3d: Three.js digital twin view
   1 unit = 1 km (X east, Z south). Terrain + flow-aware water shader + dams,
   road ribbons, instanced vehicles/buildings, rain, projected DOM labels. */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, D = FT.data;
  const SZ = D.DOMAIN.sizeKm;

  let THREE, W, renderer, scene, camera, controls, canvas;
  let raycaster, rayPointer;
  let terrainMesh, waterMesh, waterGeo, waterMat;
  let roadGeo, roadColors, roadPosCount = 0, roadRanges = [];
  let vehMesh, vehDummy, vehColor;
  let cityMesh, rainPts, rainVel;
  let damGroup, dams = [], gaugeGroup, gauges = [];
  let labelWrap, labels = [];
  let flyFrom = null, flyTo = null, flyT = 1, activeFly = null;
  let selectionRing = null, selectionPulse = null;
  let skyClear = null, skyStorm = null, skyTmp = null;
  let hemiLight = null, closeAmbient = null;
  let CLOSE_HAZE = null;                    // daylight haze the sky lerps toward up close
  const tmpV = { v: null };
  let clock = 0;
  let pointerDownX = 0, pointerDownY = 0, pointerMoved = 0, selectionPointerId = null;
  let canvasRect = null;                    // invalidated on resize/scroll — see S3.resize

  const S3 = (FT.scene3d = {});
  const WATER_STYLE = {
    permanentWaterColor: "#0d4868",
    simulatedWaterColor: "#56d2f6",
    /* the shader's own fade factor — keep these two in step or waterPresentation
       reports a number the scene never draws */
    simulatedFillFade: 0.58,
    simulatedFillFadeLegacy: 0.40,
    simulatedFarOpacity: 0.9,
    boundaryOpacity: 0.76,
    flowOpacity: 0.78,
  };

  /* vertical transform: plains readable, mountains imposing (96 km real domain) */
  function elevToY(m) { return m <= 25 ? m * 0.02 : 0.5 + (m - 25) * 0.007; }
  /* ground elevation: high-res real DEM when loaded, else the sim grid */
  function terrAt(x, y) { return FT.geo && FT.geo.hasDEM ? FT.geo.elevAt(x, y) : W.sampleTerrain(x, y); }

  /* The Y the terrain mesh actually RENDERS at (x, y) — not the DEM value.
     The two differ: the mesh is a coarse regular grid, so between its nodes it
     shows a flat triangle while the DEM keeps curving underneath. Anything that
     drapes over the terrain has to clear that triangle, not the DEM, or it gets
     punched through wherever the mesh interpolates above the true ground.
     `terrGrid` is filled in by whichever buildTerrain* path ran. */
  let terrGrid = null;                 // { n, step, origin, y: Float32Array }
  /* ?drapelegacy restores the pre-fix drape height, so the blotching this
     removed can be reproduced side by side instead of by editing source. */
  const DRAPE_LEGACY = /(^|[?&])drapelegacy(&|=|$)/.test(location.search);
  /* ?waterlegacy restores the pre-P5 water look the same way */
  const WATER_LEGACY = /(^|[?&])waterlegacy(&|=|$)/.test(location.search);
  function terrainSurfaceY(x, y) {
    const G = terrGrid;
    if (!G) return elevToY(terrAt(x, y));
    const n = G.n, st = G.step;
    const fx = (x - G.origin) / st, fy = (y - G.origin) / st;
    const ix = U.clamp(Math.floor(fx), 0, n - 2), iy = U.clamp(Math.floor(fy), 0, n - 2);
    const u = U.clamp(fx - ix, 0, 1), v = U.clamp(fy - iy, 0, 1);
    /* same split as the index buffer: (a, c, b) then (b, c, d) */
    const a = G.y[iy * n + ix], b = G.y[iy * n + ix + 1];
    const c = G.y[(iy + 1) * n + ix], d = G.y[(iy + 1) * n + ix + 1];
    return u + v <= 1
      ? a + u * (b - a) + v * (c - a)
      : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  }
  /* Highest rendered terrain within half a drape cell — covers the case where the
     drape is the coarser of the two grids and would dip between its own nodes. */
  function terrainSurfaceMax(x, y, r) {
    let m = terrainSurfaceY(x, y);
    m = Math.max(m, terrainSurfaceY(x - r, y), terrainSurfaceY(x + r, y));
    m = Math.max(m, terrainSurfaceY(x, y - r), terrainSurfaceY(x, y + r));
    return m;
  }

  /* THE ground reference for anything that stands on it. Must be the surface the
     viewer actually sees, which is the higher of the DEM and the terrain mesh's
     own triangle — the deep-zoom drape is placed on exactly this, so a building
     anchored to the raw DEM instead would sink into the drape by up to 12 m and
     a 4 m house would all but vanish at street zoom. */
  function groundY(x, y, minE) {
    const e = terrAt(x, y);
    return Math.max(elevToY(minE === undefined ? e : Math.max(minE, e)), terrainSurfaceY(x, y));
  }

  const CAMS = {
    overview: { pos: [58, 98, 128], tgt: [55, 0, 40] },
    delta: { pos: [82, 16, 60], tgt: [74, 0, 33] },
    dams: { pos: [8, 22, 62], tgt: [30, 2, 42] },
    hoian: { pos: [94, 9, 66], tgt: [86, 0, 40] },
  };
  const CAMERA_DISTANCES = { overview: 120, district: 46, asset: 16, street: 5.5 };

  /* ============ terrain ============ */
  const imTmp = [0, 0, 0];
  /* high-detail branch: 320² mesh straight from the real DEM + satellite drape */
  /* Terrain mesh density. The DEM behind it resolves 36.8 m per pixel (9.2 m in the fine
     windows), measured; at TN = 384 over the 96 km domain the mesh sampled it every 250 m
     and threw away roughly six sevenths of the relief, which is why the mountains read as
     smooth lumps rather than ridges. TN is now chosen from what the device can carry, so
     a laptop gets real ridgelines and a weak GPU still boots. */
  function terrainGridSize() {
    if (/[?&]coarseterrain\b/.test(location.search)) return 384;      // kill switch
    if (FT.state.quality === "low") return 384;
    const px = (window.devicePixelRatio || 1) * Math.max(screen.width, screen.height);
    return px >= 1400 ? 768 : 576;
  }

  /* Terrarium tiles carry isolated bad pixels: 56 cells of 357 604 sampled stand more than
     45 m above ALL FOUR neighbours, the worst 312 m above ground that is 2 m elevation.
     Rendered, each becomes a tall thin dark triangle — the scattered black spikes visible
     across the basin. A real ridge rises together with its neighbours, so requiring a cell
     to beat every neighbour by a wide margin isolates the artefact without shaving summits;
     the replacement is the neighbour median, not the mean, so a spike beside a genuine
     cliff does not drag the edge down with it. */
  function despike(grid, n, thresholdM) {
    let fixed = 0;
    const src = grid.slice();                 // judge against the original, not half-fixed data
    const at = (ix, iy) => src[Math.min(n - 1, Math.max(0, iy)) * n + Math.min(n - 1, Math.max(0, ix))];
    const median = (a) => { a.sort((p, q) => p - q); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
    for (let iy = 1; iy < n - 1; iy++) {
      for (let ix = 1; ix < n - 1; ix++) {
        const k = iy * n + ix;
        const c = src[k];
        const near = [at(ix - 1, iy), at(ix + 1, iy), at(ix, iy - 1), at(ix, iy + 1)];
        if (c - Math.max(...near) > thresholdM || Math.min(...near) - c > thresholdM) {
          grid[k] = median(near.slice());
          fixed++;
          continue;
        }
        /* A spike two cells wide props itself up: each half beats the outside world but not
           its twin, so the 4-neighbour test walks straight past it — that is the dark shard
           left standing in the bay off Sơn Trà. Judging against a ring at radius 2 catches
           the pair, and the ring is far enough out that a genuine summit (whose flanks fall
           away gradually) still passes. */
        const ring = [
          at(ix - 2, iy), at(ix + 2, iy), at(ix, iy - 2), at(ix, iy + 2),
          at(ix - 2, iy - 2), at(ix + 2, iy - 2), at(ix - 2, iy + 2), at(ix + 2, iy + 2),
        ];
        const med = median(ring.slice());
        const spread = Math.max(...ring) - Math.min(...ring);
        /* The flatness condition is what keeps this off the mountains. On a hillside the
           ring straddles a slope and its spread is large, so a cell standing above the
           median is just the hill continuing — an earlier version without this test
           "fixed" 68 457 of 589 824 cells and quietly shaved the ridges it was supposed to
           sharpen. A genuine artefact sits in surroundings that agree with each other. */
        if (c - med > thresholdM * 1.6 && spread < thresholdM) {
          grid[k] = med;
          fixed++;
        }
      }
    }
    return fixed;
  }

  function buildTerrainHiRes() {
    const TN = terrainGridSize();
    const SZ2 = D.DOMAIN.sizeKm;
    const step = SZ2 / (TN - 1);
    const pos = new Float32Array(TN * TN * 3);
    const col = new Float32Array(TN * TN * 3);
    const uv = new Float32Array(TN * TN * 2);
    const elevGrid = new Float32Array(TN * TN);
    for (let iy = 0; iy < TN; iy++) {
      for (let ix = 0; ix < TN; ix++) {
        elevGrid[iy * TN + ix] = FT.geo.elevAt(ix * step, iy * step);
      }
    }
    /* Threshold scales with cell size: at a finer mesh, neighbours are closer together, so
       a given metre difference is a steeper — and less plausible — slope. */
    const spikes = despike(elevGrid, TN, 45 * (step / 0.25));
    if (spikes) console.info(`[scene3d] terrain ${TN}² (${(step * 1000) | 0} m/cell) — ${spikes} DEM spikes filtered`);
    for (let iy = 0; iy < TN; iy++) {
      for (let ix = 0; ix < TN; ix++) {
        const k = iy * TN + ix, o = k * 3;
        const e = elevGrid[k];
        pos[o] = ix * step; pos[o + 1] = elevToY(e); pos[o + 2] = iy * step;
        uv[k * 2] = (ix * step) / SZ2; uv[k * 2 + 1] = 1 - (iy * step) / SZ2;
        const ex = elevGrid[iy * TN + Math.min(TN - 1, ix + 1)] - e;
        const ey = elevGrid[Math.min(TN - 1, iy + 1) * TN + ix] - e;
        const slope = Math.min(1, Math.hypot(ex, ey) / 60);
        const light = Math.max(0.55, Math.min(1.25, 1 + (ex + ey) / 120));
        /* shading only — the real imagery arrives via texture map (full canvas res, not per-vertex) */
        const sh = (1 - slope * 0.3) * light * 1.04;
        col[o] = sh; col[o + 1] = sh; col[o + 2] = sh;
      }
    }
    const idx = [];
    for (let iy = 0; iy < TN - 1; iy++) {
      for (let ix = 0; ix < TN - 1; ix++) {
        const a = iy * TN + ix, b = a + 1, c2 = a + TN, d2 = c2 + 1;
        idx.push(a, c2, b, b, c2, d2);
      }
    }
    const gy = new Float32Array(TN * TN);
    for (let k = 0; k < TN * TN; k++) gy[k] = pos[k * 3 + 1];
    terrGrid = { n: TN, step, origin: 0, y: gy };
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const tex = new THREE.CanvasTexture(FT.geo.imagery);
    tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
    terrainMesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, vertexColors: true }));
    scene.add(terrainMesh);
  }

  function buildTerrain() {
    if (FT.geo && FT.geo.hasDEM && FT.geo.hasImagery) { buildTerrainHiRes(); return; }
    const N = W.N;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * N * 3);
    const col = new Float32Array(N * N * 3);
    const c = new THREE.Color();
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const k = iy * N + ix, o = k * 3;
        const e = W.terrain[k];
        pos[o] = W.ix2km(ix);
        pos[o + 1] = elevToY(e);
        pos[o + 2] = W.ix2km(iy);
        /* REAL satellite drape when imagery is loaded */
        const ex = W.terrain[iy * N + Math.min(N - 1, ix + 1)] - e;
        const ey = W.terrain[Math.min(N - 1, iy + 1) * N + ix] - e;
        const slope = Math.min(1, Math.hypot(ex, ey) / 110);
        if (FT.geo && FT.geo.hasImagery) {
          const rgb = FT.geo.imageryAt(W.ix2km(ix), W.ix2km(iy), imTmp);
          const sh2 = (1 - slope * 0.35) * 1.06;
          col[o] = (rgb[0] / 255) * sh2; col[o + 1] = (rgb[1] / 255) * sh2; col[o + 2] = (rgb[2] / 255) * sh2;
          continue;
        }
        const hsh = (a, b2) => { const h = Math.sin(a * 127.1 + b2 * 311.7) * 43758.5453; return h - Math.floor(h); };
        const n1 = hsh(ix * 0.9 | 0, iy * 0.9 | 0);                 // field patches
        const n2 = hsh(ix * 0.37, iy * 0.37);
        if (W.sea[k]) {
          const depth = Math.min(1, -e / 7);
          c.setRGB(0.12 - 0.09 * depth, 0.34 - 0.22 * depth, 0.46 - 0.22 * depth);
        } else if (e < 1.6) c.setRGB(0.70, 0.65, 0.50);             // sand
        else if (e < 14) {
          const p = 0.35 + 0.65 * n1;
          c.setRGB(0.22 + 0.16 * p, 0.44 + 0.12 * p, 0.23 + 0.05 * p);
          if (W.riverDist[k] < 1.6) { const w2 = 1 - W.riverDist[k] / 1.6; c.r -= 0.07 * w2; c.g -= 0.04 * w2; }
        } else if (e < 90) {
          const tt = (e - 14) / 76;
          c.setRGB(0.27 + 0.05 * tt, 0.46 - 0.03 * tt, 0.22 + 0.02 * tt);
        } else if (e < 900) {
          const tt = (e - 90) / 810;
          c.setRGB(0.22 + 0.07 * tt, 0.40 - 0.06 * tt, 0.19 + 0.02 * tt);   // forest cover up to the high ridges
        } else {
          const tt = Math.min(1, (e - 900) / 500);
          c.setRGB(0.34 + 0.2 * tt, 0.36 + 0.18 * tt, 0.27 + 0.2 * tt);     // bare rock only at the crest
        }
        /* urban fabric from population density */
        if (!W.sea[k]) {
          const urb = Math.min(0.8, Math.max(0, (W.pop[k] - 60) / 320));
          if (urb > 0) { const ug = 0.54 + 0.1 * n2; c.r = U.lerp(c.r, ug, urb); c.g = U.lerp(c.g, ug, urb); c.b = U.lerp(c.b, ug + 0.02, urb); }
        }
        const tex = 0.9 + 0.2 * n2;
        let sh = (1 - slope * 0.45) * tex;
        if (!W.sea[k] && W.riverDist[k] < 0.7 && e > 1.6) sh *= 0.8;
        col[o] = c.r * sh; col[o + 1] = c.g * sh; col[o + 2] = c.b * sh;
      }
    }
    const idx = [];
    for (let iy = 0; iy < N - 1; iy++) {
      for (let ix = 0; ix < N - 1; ix++) {
        const a = iy * N + ix, b = a + 1, cI = a + N, dI = cI + 1;
        idx.push(a, cI, b, b, cI, dI);
      }
    }
    const gy2 = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) gy2[k] = pos[k * 3 + 1];
    /* W.ix2km(i) = (i + 0.5) * (SZ / N) — uniform, offset half a cell */
    terrGrid = { n: N, step: SZ / N, origin: 0.5 * (SZ / N), y: gy2 };
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    terrainMesh = new THREE.Mesh(geo, mat);
    scene.add(terrainMesh);
  }

  /* ============ water (display mesh matches the 288² sim so finer flood detail renders) ============ */
  const WN = 288;
  /* 4 m, in elevToY units (0.02 per metre below 25 m). Big enough to close the
     sim-vs-DEM gap in the delta, small enough that it can never invent water on a
     mountainside where the two terrains disagree by hundreds of metres. */
  const WATER_LIFT_CAP = 4 * 0.02;
  let wSampX = null, wSampY = null;                        // precomputed bilinear indices into the sim grid
  function buildWater() {
    const N = W.N;
    const SZk = D.DOMAIN.sizeKm;
    waterGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(WN * WN * 3);
    const depth = new Float32Array(WN * WN);
    const base = new Float32Array(WN * WN);
    const flow = new Float32Array(WN * WN * 2);
    const over = new Float32Array(WN * WN);                // 1 = floodplain (sediment-laden when flooded)
    const permanent = new Float32Array(WN * WN);           // 1 = sea / normal river water, not simulated overbank
    const edge = new Float32Array(WN * WN);                // 1 = a 4-neighbour is dry → this vertex is on the flood boundary
    wSampX = new Float32Array(WN); wSampY = new Float32Array(WN);
    for (let i = 0; i < WN; i++) { wSampX[i] = (i / (WN - 1)) * (N - 1); wSampY[i] = wSampX[i]; }
    for (let iy = 0; iy < WN; iy++) {
      for (let ix = 0; ix < WN; ix++) {
        const k = iy * WN + ix, o = k * 3;
        pos[o] = (ix / (WN - 1)) * SZk; pos[o + 1] = 0; pos[o + 2] = (iy / (WN - 1)) * SZk;
        const ks = Math.round(wSampY[iy]) * N + Math.round(wSampX[ix]);
        over[k] = !W.sea[ks] && W.riverDist[ks] > 0.9 ? 1 : 0;
        permanent[k] = W.sea[ks] || W.hBase[ks] > 0.025 || W.riverDist[ks] < 0.42 ? 1 : 0;
      }
    }
    const idx = [];
    for (let iy = 0; iy < WN - 1; iy++) {
      for (let ix = 0; ix < WN - 1; ix++) {
        const a = iy * WN + ix, b = a + 1, cI = a + WN, dI = cI + 1;
        idx.push(a, cI, b, b, cI, dI);
      }
    }
    waterGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    waterGeo.setAttribute("aDepth", new THREE.BufferAttribute(depth, 1));
    waterGeo.setAttribute("aBase", new THREE.BufferAttribute(base, 1));
    waterGeo.setAttribute("aFlow", new THREE.BufferAttribute(flow, 2));
    waterGeo.setAttribute("aOver", new THREE.BufferAttribute(over, 1));
    waterGeo.setAttribute("aPermanent", new THREE.BufferAttribute(permanent, 1));
    waterGeo.setAttribute("aEdge", new THREE.BufferAttribute(edge, 1));
    waterGeo.setIndex(idx);

    waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uGhost: { value: 0 },
        uLegacy: { value: WATER_LEGACY ? 1 : 0 },
        /* single source of truth with waterPresentation(), which reports these to the
           earth-map contract — duplicating the constants here is how the reported
           number silently stops describing what the shader draws */
        uFillFade: { value: WATER_STYLE.simulatedFillFade },
        uFillFadeLegacy: { value: WATER_STYLE.simulatedFillFadeLegacy },
      },
      vertexShader: `
        attribute float aDepth;
        attribute float aBase;
        attribute vec2 aFlow;
        attribute float aOver;
        attribute float aPermanent;
        attribute float aEdge;
        varying float vDepth;
        varying float vBase;
        varying vec2 vFlow;
        varying float vOver;
        varying float vPermanent;
        varying float vEdge;
        varying vec3 vPos;
        varying vec3 vView;
        void main() {
          vEdge = aEdge;
          vDepth = aDepth;
          vBase = aBase;
          vFlow = aFlow;
          vOver = aOver;
          vPermanent = aPermanent;
          vPos = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform float uGhost;
        uniform float uLegacy;
        uniform float uFillFade;
        uniform float uFillFadeLegacy;
        varying float vDepth;
        varying float vBase;
        varying vec2 vFlow;
        varying float vOver;
        varying float vPermanent;
        varying float vEdge;
        varying vec3 vPos;
        varying vec3 vView;
        void main() {
          if (vDepth < 0.015) discard;
          float spd = length(vFlow);
          float simDepth = max(0.0, vDepth - vBase);
          float simulated = smoothstep(0.025, 0.09, simDepth);
          /* shimmer advected along flow */
          vec2 fdir = spd > 0.01 ? vFlow / spd : vec2(0.7, 0.7);
          float phase = dot(vPos.xz, fdir) * 3.6 - uTime * (0.8 + spd * 2.2);
          float shimmer = sin(phase) * 0.5 + sin(vPos.x * 5.2 + vPos.z * 4.4 + uTime * 1.3) * 0.5;
          shimmer *= 0.5;
          /* discrete depth bands matching the 2D map (flood-density classes) */
          vec3 c1 = vec3(0.54, 0.82, 0.93);
          vec3 c2 = vec3(0.34, 0.66, 0.89);
          vec3 c3 = vec3(0.16, 0.44, 0.81);
          vec3 c4 = vec3(0.08, 0.24, 0.64);
          vec3 c5 = mix(vec3(0.13, 0.10, 0.48), vec3(0.19, 0.16, 0.58), 1.0 - uLegacy);
          vec3 col = c1;
          col = mix(col, c2, step(0.15, vDepth));
          col = mix(col, c3, step(0.5, vDepth));
          col = mix(col, c4, step(1.0, vDepth));
          col = mix(col, c5, step(2.0, vDepth));
          /* permanent river/sea: was (0.05, 0.28, 0.41), dark enough at 0.64 alpha to
             read as a black gash cut through the city rather than as water */
          vec3 natural = mix(vec3(0.05, 0.28, 0.41), vec3(0.10, 0.36, 0.50), 1.0 - uLegacy);
          col = mix(natural, col, simulated);
          /* overbank floodwater carries sediment — mix toward muddy ochre */
          vec3 mud = vec3(0.42, 0.33, 0.20);
          float mudF = vOver * simulated * smoothstep(0.08, 0.6, simDepth) * 0.46;
          col = mix(col, mud, mudF);
          col += shimmer * 0.06;
          /* fresnel rim */
          float fres = pow(1.0 - abs(normalize(vView).y), 3.0);
          col += fres * vec3(0.25, 0.4, 0.5) * 0.55;
          /* foam: shoreline + fast flow */
          float foam = smoothstep(0.02, 0.05, vDepth) * (1.0 - smoothstep(0.05, 0.14, vDepth)) * 0.55;
          foam += smoothstep(2.5, 3.8, spd) * 0.4;
          foam += smoothstep(0.75, 0.95, fract(shimmer + spd * 0.5)) * smoothstep(2.2, 3.4, spd) * 0.25;
          col = mix(col, vec3(0.88, 0.95, 1.0), clamp(foam, 0.0, 0.75));
          float alpha = mix(0.64, clamp(0.25 + vDepth * 0.55, 0.0, 0.90), simulated);
          /* cận cảnh: nước nông trong hơn để lộ nền đất/đường thật bên dưới.
             Fade the FILL harder than before (0.40 → 0.58) so the city under the
             flood stays readable at building zoom, where a 0.90-alpha sheet of deep
             indigo simply erased the ground. */
          float fillFade = mix(uFillFade, uFillFadeLegacy, uLegacy);
          alpha *= 1.0 - uGhost * simulated * fillFade;
          /* ...but the flood EXTENT must not fade with it. A rim over the first
             ~0.3 m of depth traces the boundary and is held at high alpha
             independently of uGhost, so thinning the fill costs no information. */
          float rim = max((1.0 - smoothstep(0.02, 0.30, vDepth)) * simulated, vEdge);
          col = mix(col, vec3(0.78, 0.93, 1.0), rim * 0.55 * (1.0 - uLegacy));
          float cue = max(foam, smoothstep(1.2, 3.0, spd) * simulated);
          cue = max(cue, rim * (1.0 - uLegacy));
          alpha = max(alpha, cue * 0.76);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.renderOrder = 2;
    scene.add(waterMesh);
  }

  function updateWater() {
    const N = W.N;
    const pos = waterGeo.attributes.position.array;
    const dep = waterGeo.attributes.aDepth.array;
    const base = waterGeo.attributes.aBase.array;
    const flow = waterGeo.attributes.aFlow.array;
    const T = W.terrain, Hh = W.h, Bb = W.hBase, Uu = W.u, Vv = W.v;
    for (let iy = 0; iy < WN; iy++) {
      const fy = wSampY[iy];
      const y0 = fy | 0, y1 = Math.min(N - 1, y0 + 1), ty = fy - y0;
      const r0 = y0 * N, r1 = y1 * N;
      for (let ix = 0; ix < WN; ix++) {
        const fx = wSampX[ix];
        const x0 = fx | 0, x1 = Math.min(N - 1, x0 + 1), tx = fx - x0;
        const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
        const a = r0 + x0, b = r0 + x1, c = r1 + x0, d = r1 + x1;
        const h = Hh[a] * w00 + Hh[b] * w10 + Hh[c] * w01 + Hh[d] * w11;
        const hb = Bb[a] * w00 + Bb[b] * w10 + Bb[c] * w01 + Bb[d] * w11;
        const t = T[a] * w00 + T[b] * w10 + T[c] * w01 + T[d] * w11;
        const k = iy * WN + ix, o = k * 3;
        /* NOTE — do not make this sheet yield its baseflow to the OSM layer yet.
           Tried and measured: OSM maps the Thu Bồn and Vu Gia as `waterway=river`
           CENTRELINES only, with no riverbank polygon, so `natural=water` covers the
           ponds and lagoons but not the main channels. Handing the permanent water to the
           polygon layer therefore deleted the rivers instead of sharpening them. Drawing
           the channel from real geometry needs the centrelines widened into ribbons
           first; until that exists this coarse sheet is the only thing carrying the
           river, blurry as it is at 333 m per cell. */
        if (h > 0.02) {
          /* The solver runs on the 288² sim terrain; the viewer sees the 384² DEM mesh.
             Where the rendered ground sits above the simulated water surface, the flood
             is drawn INSIDE the hillside and vanishes — measured at 27% of wet vertices.
             Lift the surface onto the visible ground, but by at most WATER_LIFT_CAP.

             The cap is the whole point. In the delta the two terrains agree to within a
             few metres and the lift simply repairs a render mismatch (8.3% of wet cells
             there). On the mountains they disagree by up to 291 m, and lifting that far
             would paint fabricated water across a hillside — that is a data limitation,
             not a rendering bug, and it must not be papered over. */
          const wy = elevToY(t + h * 1.6);
          const gy = terrainSurfaceY(pos[o], pos[o + 2]);
          pos[o + 1] = Math.max(wy, Math.min(gy, wy + WATER_LIFT_CAP)) + (0.055 - roadCloseF * 0.03);
          dep[k] = h;
        } else {
          pos[o + 1] = elevToY(t) - 0.05;
          dep[k] = 0;
        }
        base[k] = hb;
        flow[k * 2] = Uu[a] * w00 + Uu[b] * w10 + Uu[c] * w01 + Uu[d] * w11;
        flow[k * 2 + 1] = Vv[a] * w00 + Vv[b] * w10 + Vv[c] * w01 + Vv[d] * w11;
      }
    }
    /* Mark the wet/dry boundary. Thinning the fill so the city shows through costs
       nothing only if the flood EXTENT stays unmistakable, and extent is an edge
       property the fragment shader cannot see: it has no neighbourhood. A depth-based
       rim is not a substitute — where water is 6 m deep the whole sheet is far from
       any shallow band, so the rim never appears exactly where the flood is worst. */
    const edg = waterGeo.attributes.aEdge.array;
    for (let iy = 0; iy < WN; iy++) {
      for (let ix = 0; ix < WN; ix++) {
        const k = iy * WN + ix;
        if (dep[k] <= 0) { edg[k] = 0; continue; }
        const dryL = ix > 0 && dep[k - 1] <= 0, dryR = ix < WN - 1 && dep[k + 1] <= 0;
        const dryU = iy > 0 && dep[k - WN] <= 0, dryD = iy < WN - 1 && dep[k + WN] <= 0;
        edg[k] = (dryL || dryR || dryU || dryD) ? 1 : 0;
      }
    }
    waterGeo.attributes.aEdge.needsUpdate = true;
    waterGeo.attributes.position.needsUpdate = true;
    waterGeo.attributes.aDepth.needsUpdate = true;
    waterGeo.attributes.aBase.needsUpdate = true;
    waterGeo.attributes.aFlow.needsUpdate = true;
  }

  /* ============ roads ============ */
  /* REAL OSM roads → draped ribbons with per-chunk flood-status colours */
  function buildOsmRoads() {
    const osm = FT.geo.osmRoads;
    if (!osm) return;
    if (S3._roadMesh) { scene.remove(S3._roadMesh); S3._roadMesh.geometry.dispose(); }
    /* Half-widths are ~20× real so a road is legible across a 96 km overview.
       At building zoom that same ribbon is a 440 m slab lying over the city, and
       fading it is not enough because flooded segments deliberately stay opaque.
       Keep the centreline and the sideways offset per vertex so the ribbon can be
       narrowed toward true width as the camera closes in. */
    const HALFW = { mw: 0.22, pri: 0.16, sec: 0.11 };
    const posArr = [], ctrArr = [], offArr = [];
    roadRanges = [];
    const pushV = (c, o, yy) => { posArr.push(c[0] + o[0], yy, c[1] + o[1]); ctrArr.push(c[0], c[1]); offArr.push(o[0], o[1]); };
    for (const s of osm) {
      const half = HALFW[s.cls] || 0.12;
      const start = posArr.length / 3;
      let prev = null;
      for (let i = 0; i < s.pts.length; i++) {
        const [x, y] = s.pts[i];
        const nxt = s.pts[Math.min(i + 1, s.pts.length - 1)];
        const prv = s.pts[Math.max(i - 1, 0)];
        const dx = nxt[0] - prv[0], dy = nxt[1] - prv[1];
        const L = Math.hypot(dx, dy) || 1;
        const px = (-dy / L) * half, py = (dx / L) * half;
        const yy = groundY(x, y, 0.2) + 0.09;
        const cur = { c: [x, y], o1: [px, py], o2: [-px, -py], yy };
        if (prev) {
          pushV(prev.c, prev.o1, prev.yy); pushV(prev.c, prev.o2, prev.yy); pushV(cur.c, cur.o1, cur.yy);
          pushV(cur.c, cur.o1, cur.yy); pushV(prev.c, prev.o2, prev.yy); pushV(cur.c, cur.o2, cur.yy);
        }
        prev = cur;
      }
      roadRanges.push({ e: s, start, count: posArr.length / 3 - start, lastCls: -1 });
    }
    roadCtr = new Float32Array(ctrArr);
    roadOff = new Float32Array(offArr);
    roadWidthF = -1;
    roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(posArr), 3));
    roadColors = new Float32Array((posArr.length / 3) * 4);
    roadGeo.setAttribute("color", new THREE.BufferAttribute(roadColors, 4));
    const mesh = new THREE.Mesh(roadGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true }));
    mesh.renderOrder = 3;
    scene.add(mesh);
    S3._roadMesh = mesh;
    updateRoadColors(true, 0);
    /* apply the current zoom width immediately: OSM roads can land while the camera
       is already parked close, and the render loop only re-widths on a zoom change */
    updateRoadWidth(roadCloseF);
  }

  /* mọi ngóc ngách 3D: đường nhỏ + hẻm OSM thành LineSegments bám DEM (rẻ, hàng vạn đoạn OK) */
  let minorLines = null;
  function buildOsmMinor() {
    const segs = FT.geo && FT.geo.osmMinor;
    if (!segs || !segs.length) return;
    const pos = [];
    for (const s of segs) {
      for (let i = 0; i < s.pts.length - 1; i++) {
        const a = s.pts[i], b = s.pts[i + 1];
        pos.push(
          a[0], groundY(a[0], a[1], 0.2) + 0.07, a[1],
          b[0], groundY(b[0], b[1], 0.2) + 0.07, b[1]
        );
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    minorLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xd9dee4, transparent: true, opacity: 0.5 }));
    minorLines.renderOrder = 2;
    minorLines.visible = false;
    scene.add(minorLines);
    console.info(`[3d] OSM minor — ${pos.length / 6} đoạn đường nhỏ/hẻm`);
  }

  function buildRoads() {
    const HALF = { exp: 0.30, hw: 0.23, prov: 0.17, urban: 0.13 };
    const posArr = [], colArr = [], ctrArr = [], offArr = [];
    roadRanges = [];
    /* Same centreline bookkeeping as the OSM builder. This branch is not a rare
       fallback — the OSM fetch 504s often enough that the procedural ribbons are
       what a user actually sees, and at 600 m wide they bury the city at zoom. */
    const pushV = (c, o, yy) => { posArr.push(c[0] + o[0], yy, c[1] + o[1]); ctrArr.push(c[0], c[1]); offArr.push(o[0], o[1]); };
    for (const e of W.roads.edges) {
      const a = W.roads.nodes[e.a], b = W.roads.nodes[e.b];
      const len = e.len, steps = Math.max(2, Math.ceil(len / 0.25));
      const half = HALF[e.type] || 0.06;
      const startIdx = posArr.length / 3;
      const yA = groundY(a.x, a.y, 0.5) + 0.055;
      const yB = groundY(b.x, b.y, 0.5) + 0.055;
      let prev = null;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        /* follow the real polyline alignment (via waypoints) */
        const [x, y] = W.roadPoint(e, e.a, t);
        const [x2, y2] = W.roadPoint(e, e.a, Math.min(1, t + 0.5 / steps));
        let dx = x2 - x, dy = y2 - y;
        const dl = Math.hypot(dx, dy) || 1;
        const pxn = (-dy / dl) * half, pyn = (dx / dl) * half;
        let yy;
        if (e.bridge) yy = Math.max(yA, yB) + 0.12;
        else yy = groundY(x, y, 0.2) + 0.1;
        const cur = { c: [x, y], o1: [pxn, pyn], o2: [-pxn, -pyn], yy };
        if (prev) {
          pushV(prev.c, prev.o1, prev.yy); pushV(prev.c, prev.o2, prev.yy); pushV(cur.c, cur.o1, cur.yy);
          pushV(cur.c, cur.o1, cur.yy); pushV(prev.c, prev.o2, prev.yy); pushV(cur.c, cur.o2, cur.yy);
        }
        prev = cur;
      }
      roadRanges.push({ e, start: startIdx, count: posArr.length / 3 - startIdx, lastCls: -1 });
    }
    roadCtr = new Float32Array(ctrArr);
    roadOff = new Float32Array(offArr);
    roadWidthF = -1;
    roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(posArr), 3));
    roadColors = new Float32Array((posArr.length / 3) * 4);
    roadGeo.setAttribute("color", new THREE.BufferAttribute(roadColors, 4));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true });
    const mesh = new THREE.Mesh(roadGeo, mat);
    mesh.renderOrder = 3;
    scene.add(mesh);
    S3._roadMesh = mesh;
    updateRoadColors(true, 0);
    updateRoadWidth(roadCloseF);
  }

  const ROAD_RGB = [[0.30, 0.85, 0.48], [1.0, 0.84, 0.31], [1.0, 0.58, 0.25], [1.0, 0.30, 0.30]];
  const OSM_OPEN_RGB = { mw: [0.95, 0.85, 0.55], pri: [0.9, 0.9, 0.88], sec: [0.75, 0.77, 0.8] };
  let roadCloseF = 0;                       // 0 = xa (ribbon đầy đủ) · 1 = sát (đường mở nhường chỗ cho đường thật trên ảnh)
  let cfAcc = 9, wAcc = 9;                  // throttle rebuild nặng & cập nhật nước
  let roadCtr = null, roadOff = null, roadWidthF = -1;

  /* Narrow the ribbon toward true width as the camera closes in. Runs on the same
     0.25 s cfJump cadence as the colour pass, never per frame. */
  function updateRoadWidth(cf) {
    if (!roadCtr || !roadGeo || Math.abs(cf - roadWidthF) < 0.05) return;
    roadWidthF = cf;
    const w = 1 - cf * 0.82;                // 1 → 0.18 of the overview width
    const pos = roadGeo.attributes.position.array;
    for (let i = 0, n = roadCtr.length / 2; i < n; i++) {
      pos[i * 3] = roadCtr[i * 2] + roadOff[i * 2] * w;
      pos[i * 3 + 2] = roadCtr[i * 2 + 1] + roadOff[i * 2 + 1] * w;
    }
    roadGeo.attributes.position.needsUpdate = true;
  }
  function updateRoadColors(force, t) {
    let dirty = false;
    for (const rr of roadRanges) {
      const isOsm = rr.e.dcls !== undefined;
      const cls = isOsm ? rr.e.dcls : rr.e.cls;
      const pulse = cls >= 3 ? 0.65 + 0.35 * Math.sin(t * 5) : 1;
      if (!force && cls === rr.lastCls && cls < 3) continue;
      const [r, g, b] = isOsm && cls === 0 ? OSM_OPEN_RGB[rr.e.cls] || OSM_OPEN_RGB.sec : ROAD_RGB[cls];
      /* đường MỞ: sơ đồ chỉ là vệt mờ khi đã có bản đồ đường thật (raster/OSM); trạng thái ngập luôn rõ */
      const openBase = isOsm ? 0.85 : (FT.geo && FT.geo.hasTransport) ? 0.38 : 1;
      const alpha = cls === 0 ? openBase * (1 - roadCloseF * 0.88) : 1;
      for (let i = rr.start; i < rr.start + rr.count; i++) {
        roadColors[i * 4] = r * pulse;
        roadColors[i * 4 + 1] = g * pulse;
        roadColors[i * 4 + 2] = b * pulse;
        roadColors[i * 4 + 3] = alpha;
      }
      rr.lastCls = cls;
      dirty = true;
    }
    if (dirty) roadGeo.attributes.color.needsUpdate = true;
  }

  /* ============ vehicles ============ */
  function buildVehicles() {
    const geo = new THREE.BoxGeometry(0.3, 0.11, 0.14);
    const mat = new THREE.MeshLambertMaterial();
    vehMesh = new THREE.InstancedMesh(geo, mat, 160);
    vehMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    vehDummy = new THREE.Object3D();
    vehColor = new THREE.Color();
    scene.add(vehMesh);
  }
  function updateVehicles() {
    const vs = FT.traffic.vehicles || [];
    const n = Math.min(vs.length, 160);
    for (let i = 0; i < 160; i++) {
      if (i < n && vs[i].x !== undefined) {
        const v = vs[i];
        const y = groundY(v.x, v.y, 0.3) + 0.11;
        vehDummy.position.set(v.x, y, v.y);
        vehDummy.rotation.set(0, -v.heading, 0);
        /* The box is 0.3 × 0.11 × 0.14 in km — 300 m long, schematic so a vehicle is
           visible across a 96 km domain. `sV` shrinks that for close zoom, but the
           per-type scale below used to overwrite the whole vector and threw sV away,
           so the shrink never once took effect and every vehicle drew as a 300 m slab
           lying across the city. Both factors have to be combined, not assigned twice. */
        const sV = 1 - roadCloseF * 0.86;
        const s = v.type === "moto" ? 0.5 : v.type === "truck" || v.type === "bus" ? 1.3 : 1;
        vehDummy.scale.set(s * sV, sV, s * sV);
        vehDummy.updateMatrix();
        vehMesh.setMatrixAt(i, vehDummy.matrix);
        vehColor.set(v.state === "blocked" ? 0xff5a5a : v.state === "rerouting" ? 0xffb054 : 0xffe9cf);
        vehMesh.setColorAt(i, vehColor);
      } else {
        vehDummy.position.set(0, -10, 0);
        vehDummy.scale.set(0.001, 0.001, 0.001);
        vehDummy.updateMatrix();
        vehMesh.setMatrixAt(i, vehDummy.matrix);
      }
    }
    vehMesh.instanceMatrix.needsUpdate = true;
    if (vehMesh.instanceColor) vehMesh.instanceColor.needsUpdate = true;
  }

  /* ============ cities ============ */
  /* Instance budget for procedural buildings. The coarse basin-wide pass may use up to
     COARSE_BUDGET; the rest is split evenly across the city windows. */
  const BLDG_BUDGET = 9500, COARSE_BUDGET = 6000;
  function buildCities() {
    const geo = new THREE.BoxGeometry(0.11, 1, 0.11);
    geo.translate(0, 0.5, 0);
    const mat = makeBuildingMaterial({ extrude: false });
    mat.color = new THREE.Color(0x9aa4ad);
    let count = 0;
    const placements = [];
    /* nearest-road bearing → buildings align to real street grid */
    const roadAngle = (x, y) => {
      let best = 1e9, ang = 0;
      for (const e of W.roads.edges) {
        const a = W.roads.nodes[e.a], b = W.roads.nodes[e.b];
        const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
        const d = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
        if (d < best) { best = d; ang = Math.atan2(dy, dx); }
      }
      return ang;
    };
    const im = FT.geo && FT.geo.imageryData;
    const patches = (FT.geo && FT.geo.detailPatches) || [];
    const inPatch = (x, y) => patches.some((p) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1);
    if (im) {
      /* REAL built-up detection: bright, low-chroma satellite pixels = buildings/streets */
      const S = im.width, dat = im.data;
      const SZ2 = D.DOMAIN.sizeKm;
      const stepPx = 3;                                     // ≈125 m sampling
      const rng = U.mulberry(4242);
      /* Count the candidates BEFORE placing any, then accept a fixed fraction of them.
         Filling in raster order until the budget runs out puts every building in the
         north of whatever is being scanned and leaves the south empty — the same defect
         that left Hội An without buildings. A density pre-pass costs one extra scan at
         build time and makes coverage uniform. */
      const coarseOk = (px, py) => {
        const o = (py * S + px) * 4;
        const r = dat[o], g = dat[o + 1], b = dat[o + 2];
        const bright = (r + g + b) / 3;
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        if (bright < 118 || chroma > 34 || b > r + 14) return null;   // keep bright gray, drop veg/water
        const x = (px / S) * SZ2, y = (py / S) * SZ2;
        if (inPatch(x, y)) return null;                     // đô thị: pass tinh bên dưới lo
        const te = W.sampleTerrain(x, y);
        if (te > 60 || te < 0.25) return null;
        return [x, y];
      };
      let coarseCand = 0;
      for (let py = 2; py < S - 2; py += stepPx) for (let px = 2; px < S - 2; px += stepPx) if (coarseOk(px, py)) coarseCand++;
      const coarseKeep = coarseCand > 0 ? Math.min(0.55, COARSE_BUDGET / coarseCand) : 0;
      for (let py = 2; py < S - 2 && count < COARSE_BUDGET; py += stepPx) {
        for (let px = 2; px < S - 2 && count < COARSE_BUDGET; px += stepPx) {
          const hit = coarseOk(px, py);
          if (!hit) continue;
          const x = hit[0], y = hit[1];
          if (rng() > coarseKeep) continue;                 // uniform thinning to the budget
          const pop = W.pop[W.km2i(y) * W.N + W.km2i(x)];
          const tall = pop > 260 && rng() < 0.18;
          const hM = tall ? 22 + rng() * 34 : 5 + rng() * 9; // metres
          placements.push([x + (rng() - 0.5) * 0.08, groundY(x, y), y + (rng() - 0.5) * 0.08, hM * 0.02, roadAngle(x, y)]);
          count++;
        }
      }
      /* pass TINH trong 5 cửa sổ đô thị: ảnh z14 gốc ~9 m/px → nhà đặt đúng dãy phố, chân đế thật ~18 m
         (bỏ qua khi đã có móng nhà OSM thật) */
      const rng2 = U.mulberry(1337);
      /* The 9500 cap used to be a single shared budget consumed first-come-first-served,
         and the first window (Đà Nẵng, the largest) ate everything left after the coarse
         pass. Measured consequence: with OSM unavailable — which is often, Overpass
         refuses connections regularly — Hội An, the city this demo is built around, had
         ZERO buildings within 3 km. Give each window an equal share of what remains;
         recomputing per window means an underused share rolls forward instead of
         being wasted. */
      const patchList = skipPatchProcedural ? [] : patches;
      let patchIdx = 0;
      for (const p of patchList) {
        const share = Math.floor((BLDG_BUDGET - count) / Math.max(1, patchList.length - patchIdx));
        const stop = count + share;
        patchIdx++;
        let pd = null;
        try { pd = p.canvas.getContext("2d").getImageData(0, 0, p.canvas.width, p.canvas.height); } catch (e) { continue; }
        const PW = pd.width, PH = pd.height, dd = pd.data;
        const kmPx = (p.x1 - p.x0) / PW;
        const step = Math.max(1, Math.round(0.018 / kmPx));  // mẫu ~18 m
        /* Same density pre-pass as the coarse branch. Scanning rows until the share is
           spent fills the top of the window and leaves the middle bare, which is exactly
           how the centre of Hội An ended up with no buildings while its window held 909:
           the budget was gone before the scan reached the old town. */
        const patchOk = (px, py) => {
          const o = (py * PW + px) * 4;
          if (dd[o + 3] < 200) return null;                 // tile chưa nạp
          const r = dd[o], g = dd[o + 1], b = dd[o + 2];
          const bright = (r + g + b) / 3;
          const chroma = Math.max(r, g, b) - Math.min(r, g, b);
          if (bright < 122 || chroma > 36 || b > r + 12) return null;
          const x = p.x0 + px * kmPx, y = p.y0 + py * kmPx;
          const te = W.sampleTerrain(x, y);
          if (te > 60 || te < 0.25) return null;
          return [x, y];
        };
        let cand = 0;
        for (let py = 1; py < PH - 1; py += step) for (let px = 1; px < PW - 1; px += step) if (patchOk(px, py)) cand++;
        const keep = cand > 0 ? Math.min(0.65, share / cand) : 0;
        for (let py = 1; py < PH - 1 && count < stop; py += step) {
          for (let px = 1; px < PW - 1 && count < stop; px += step) {
            const hit = patchOk(px, py);
            if (!hit) continue;
            const x = hit[0], y = hit[1];
            if (rng2() > keep) continue;                    // uniform thinning to the share
            const pop = W.pop[W.km2i(y) * W.N + W.km2i(x)];
            const tall = pop > 300 && rng2() < 0.1;
            const hM = tall ? 20 + rng2() * 30 : 4.5 + rng2() * 7;
            placements.push([x, groundY(x, y), y, hM * 0.02, roadAngle(x, y), 0.16]);
            count++;
          }
        }
      }
    }
    if (!count) {
      for (const c of D.CITIES) {
        const rng = U.mulberry(c.pop);
        const n = Math.min(220, Math.round(Math.sqrt(c.pop) / 4));
        for (let i = 0; i < n; i++) {
          const ang = rng() * Math.PI * 2, rad = Math.abs(rng() + rng() - 1) * c.size;
          const x = c.x + Math.cos(ang) * rad, y = c.y + Math.sin(ang) * rad;
          const te = W.sampleTerrain(x, y);
          if (te > 25 || te < 0.2) continue;
          const h = (c.id === "danang" && rng() < 0.12 ? 0.35 + rng() * 0.22 : 0.07 + rng() * 0.15);
          placements.push([x, groundY(x, y), y, h]);
          count++;
        }
      }
    }
    cityMesh = new THREE.InstancedMesh(geo, mat, count);
    /* per-instance: the building's own height in metres, and the water standing
       against it — together these let the shader draw a waterline on every box */
    const hArr = new Float32Array(count), fArr = new Float32Array(count);
    geo.setAttribute("aHeightM", new THREE.InstancedBufferAttribute(hArr, 1));
    geo.setAttribute("aFloodM", new THREE.InstancedBufferAttribute(fArr, 1));
    cityMesh.userData.floodAttr = geo.getAttribute("aFloodM");
    const dummy = new THREE.Object3D();
    const baseC = new THREE.Color(0x9aa4ad);
    const hFix0 = buildingHeightFix(roadCloseF);
    placements.forEach((p, i) => {
      const f = p[5] || 1;                  // p[5]: chân đế thật cố định (nhà đô thị từ ảnh z14)
      dummy.position.set(p[0], p[1], p[2]);
      dummy.scale.set(f, p[3] * hFix0, f);
      dummy.rotation.y = p[4] !== undefined ? -p[4] : (i % 7) * 0.22;
      dummy.updateMatrix();
      cityMesh.setMatrixAt(i, dummy.matrix);
      cityMesh.setColorAt(i, baseC);
      hArr[i] = p[3] / 0.02;               // p[3] was metres * 0.02 → back to metres
    });
    bldgPlacements = placements;
    scene.add(cityMesh);
  }

  /* Buildings must NOT inherit the terrain's vertical exaggeration.
     `p[3]` is metres * 0.02, i.e. the same 20x stretch elevToY applies to lowland relief.
     Mountains can take that; buildings cannot — at overview (scene.scale.y = 1) a 10 m
     house rendered 200 m tall and a 56 m block became a 1.1 km black tower, which is what
     covered the delta in black slabs. True height is metres * 0.001 (1 unit = 1 km), and
     because scene.scale.y squashes the whole scene it has to be divided back out so the
     drawn height is right at every zoom, not just one. */
  function buildingHeightFix(cf) {
    return (0.001 / 0.02) / Math.max(0.1, 1 - cf * 0.9);
  }
  /* cận cảnh: co nhà về gần kích thước thật (110 m → ~15 m chân đế) để đúng tỉ lệ với ảnh nền */
  let bldgScaleF = -1;
  function updateBuildingScale(cf) {
    if (!cityMesh || !bldgPlacements.length || Math.abs(cf - bldgScaleF) < 0.05) return;
    bldgScaleF = cf;
    const dummy = new THREE.Object3D();
    const sB = 1 - cf * 0.86;
    const hFix = buildingHeightFix(cf);
    /* Coarse procedural blocks are a density impression for the overview: a box placed
       where the satellite pixels look built-up, not a building anyone surveyed. Held at
       full size up close they became the scattered dark specks over open fields that
       this pass exists to remove — and worse, they asserted a house where OSM has none.
       So they shrink away as the camera arrives, leaving the real footprints (which are
       exempt via p[5]) to carry the close view. Fading rather than hard-switching keeps
       the transition from popping. */
    const coarseFade = 1 - U.clamp((cf - 0.42) / 0.3, 0, 1);
    bldgPlacements.forEach((p, i) => {
      const real = !!p[5];
      const f = real ? p[5] : sB * coarseFade;
      dummy.position.set(p[0], p[1], p[2]);
      dummy.scale.set(f, p[3] * hFix * (real ? 1 : coarseFade), f);
      dummy.rotation.y = p[4] !== undefined ? -p[4] : (i % 7) * 0.22;
      dummy.updateMatrix();
      cityMesh.setMatrixAt(i, dummy.matrix);
    });
    cityMesh.instanceMatrix.needsUpdate = true;
  }

  /* Building material: extrudes in the vertex shader and paints a flood waterline.

     Two jobs, one hook. Height comes from `aUpM` (metres above ground) scaled by
     `uMetreY`, so buildings never inherit the terrain's 20x vertical exaggeration and
     stay true-scale at every zoom. `aFloodM` is the water standing against that
     building, so the fragment shader can ask "is this point below the waterline?" and
     pick one of two colours. Doing it per-fragment gives a crisp, level waterline
     without subdividing any geometry at the water height. */
  const BLDG_UNIFORMS = { uMetreY: { value: 0.001 }, uFloodOn: { value: 1 } };
  function makeBuildingMaterial(opts) {
    const extrude = !opts || opts.extrude !== false;
    const m = new THREE.MeshLambertMaterial(
      extrude ? { vertexColors: true, side: THREE.DoubleSide } : {});
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uMetreY = BLDG_UNIFORMS.uMetreY;
      sh.uniforms.uFloodOn = BLDG_UNIFORMS.uFloodOn;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
          attribute float aFloodM;
          ${extrude ? "attribute float aUpM;" : "attribute float aHeightM;"}
          uniform float uMetreY;
          varying float vUpM;
          varying float vFloodM;
          varying float vRoof;`)
        .replace("#include <begin_vertex>", extrude ? `#include <begin_vertex>
          vRoof = step(0.5, normal.y);
          vUpM = aUpM;
          vFloodM = aFloodM;
          transformed.y += aUpM * uMetreY;` : `#include <begin_vertex>
          /* instanced boxes: local y runs 0..1 from base to roof, and the instance
             matrix already carries the real height, so metres-above-ground is just
             the fraction times the building's own height */
          vRoof = step(0.5, normal.y);
          vUpM = position.y * aHeightM;
          vFloodM = aFloodM;`);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          uniform float uFloodOn;
          varying float vUpM;
          varying float vFloodM;
          varying float vRoof;`)
        .replace("#include <dithering_fragment>", `
          /* below the waterline = submerged; a small feather stops the line crawling
             with vertex interpolation without blurring it into a gradient */
          float wet = uFloodOn * (1.0 - smoothstep(vFloodM - 0.18, vFloodM + 0.18, vUpM));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.88, 0.20, 0.16), wet * 0.82);
          /* a bright rule exactly at the waterline so the depth is readable, not guessed */
          float line = (1.0 - smoothstep(0.0, 0.32, abs(vUpM - vFloodM))) * step(0.05, vFloodM) * uFloodOn;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.95, 0.72), line * 0.85);
          /* Roofs carry the severity class. True-scale buildings are seen mostly from
             above, where every wall — and therefore the whole waterline — is hidden, so
             without this a flooded house reads as dry at any angle but street level. */
          float sev = smoothstep(0.15, 0.5, vFloodM) * 0.55 + smoothstep(0.5, 2.0, vFloodM) * 0.45;
          vec3 roofCol = mix(vec3(0.96, 0.63, 0.29), vec3(0.91, 0.29, 0.25), smoothstep(0.5, 2.0, vFloodM));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, roofCol, vRoof * sev * uFloodOn * 0.9);
          #include <dithering_fragment>`);
    };
    m.customProgramCacheKey = () => (extrude ? "ft-bldg-flood-x" : "ft-bldg-flood-i");
    return m;
  }

  /* ---------- REAL OSM building footprints (extruded) — swap in khi dữ liệu về ---------- */
  let osmBldg = null;                 // { mesh, ranges:[{cx,cy,start,count,last}] }
  let skipPatchProcedural = false;
  function buildOsmBuildingsMesh() {
    const fps = FT.geo && FT.geo.osmBuildings;
    if (!fps || !fps.length) return;
    const pos = [], col = [], idx = [], ranges = [], shade = [];
    /* Per-vertex metres above ground. Height then belongs to the shader, not the mesh:
       the same 20x terrain exaggeration that turned a 10 m house into a 200 m tower is
       divided back out at draw time, and the flood waterline can be compared against
       these metres directly instead of subdividing geometry. */
    const upM = [], nrm = [];
    const rng = U.mulberry(77);
    for (const fp of fps) {
      const n = fp.pts.length;
      const te = terrAt(fp.cx, fp.cy);
      if (te > 60 || te < 0.2) continue;
      const y0 = groundY(fp.cx, fp.cy, 0.25);
      /* Height is the wall the waterline is measured against, so it comes from the data
         when the data has it. It used to be `4 + rng()*6`, a random 4–10 m per building:
         with that, "the water is up to two thirds of this house" was two thirds of a
         random number. OSM tags a height for very few buildings here (261 of ~68 000), so
         most fall back to a stated 6.6 m assumption carried in fp.hSrc rather than to
         noise — an assumption can be labelled, a random draw cannot. */
      const hM = Number.isFinite(fp.hM) ? fp.hM : 4 + rng() * 6 + (n > 12 ? 5 : 0);
      const y1 = y0;                    // extrusion now happens in the shader, from aUpM
      const vStart = pos.length / 3;
      /* Walls and roof get their OWN vertices. Sharing the top ring makes
         computeVertexNormals average a horizontal wall normal with a vertical roof
         normal, so every edge rounds off and the massing reads as a smudge instead
         of a block — the single biggest reason these looked like dark blobs. */
      for (const p of fp.pts) { pos.push(p[0], y0, p[1]); upM.push(0); }        // wall bottom
      for (const p of fp.pts) { pos.push(p[0], y1, p[1]); upM.push(hM); }      // wall top
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        idx.push(vStart + i, vStart + j, vStart + n + i, vStart + n + i, vStart + j, vStart + n + j);
      }
      const roofStart = pos.length / 3;
      for (const p of fp.pts) { pos.push(p[0], y1, p[1]); upM.push(hM); }      // roof ring, separate
      const cIdx = pos.length / 3;
      pos.push(fp.cx, y1, fp.cy); upM.push(hM);
      for (let i = 0; i < n; i++) idx.push(roofStart + i, roofStart + ((i + 1) % n), cIdx);
      const vCount = pos.length / 3 - vStart;
      /* roofs catch the sky, walls do not — bake that into the base colour so the
         block still reads when the key light is nearly edge-on */
      for (let i = 0; i < vCount; i++) {
        const s = vStart + i >= roofStart ? 1.24 : 0.92;
        shade.push(s);
        col.push(0.62 * s, 0.65 * s, 0.68 * s);
      }
      /* Normals by hand. computeVertexNormals cannot help here any more: the mesh is
         stored flat (walls have zero height until the shader extrudes them), so it would
         see degenerate triangles. A prism's wall normal is horizontal and independent of
         height — take it as the direction away from the footprint centroid — and the roof
         simply faces up. */
      for (let i = 0; i < vCount; i++) {
        const vi = vStart + i;
        if (vi >= roofStart) { nrm.push(0, 1, 0); continue; }
        const px = pos[vi * 3], pz = pos[vi * 3 + 2];
        let dx = px - fp.cx, dz = pz - fp.cy;
        const L = Math.hypot(dx, dz) || 1;
        nrm.push(dx / L, 0, dz / L);
      }
      ranges.push({ cx: fp.cx, cy: fp.cy, start: vStart, count: vCount, last: -1 });
    }
    if (!ranges.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
    g.setAttribute("aUpM", new THREE.BufferAttribute(new Float32Array(upM), 1));
    /* metres of floodwater standing against each building, written by updateBuildingImpact */
    g.setAttribute("aFloodM", new THREE.BufferAttribute(new Float32Array(upM.length), 1));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nrm), 3));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, makeBuildingMaterial());
    scene.add(mesh);
    osmBldg = { mesh, ranges, shade: new Float32Array(shade) };
    console.info(`[3d] OSM buildings — ${ranges.length} nhà thật`);
  }
  function swapOsmBuildings() {
    if (!FT.geo || !FT.geo.hasOSMBldg) return;
    /* bỏ nhà procedural trong cửa sổ đô thị (đã có nhà thật), giữ vùng ngoài */
    skipPatchProcedural = true;
    if (cityMesh) { scene.remove(cityMesh); cityMesh.geometry.dispose(); cityMesh = null; }
    buildCities();
    /* Reapply the close-zoom footprint NOW, not on the next zoom change. The render
       loop only calls updateBuildingScale when cf moves by >0.08, so a rebuild that
       lands while the camera is parked close leaves every coarse-pass building at its
       build-time 110 m footprint — which at street zoom draws as a giant flat slab
       lying across the city. */
    bldgScaleF = -1;
    updateBuildingScale(roadCloseF);
    buildOsmBuildingsMesh();
  }

  /* ============ real river channels (OSM water polygons) ============

     Why this layer exists at all. The permanent river was drawn only as part of the
     simulation water surface, which lives on the 288² solver grid — 333 m per cell over
     the 96 km domain. The Thu Bồn at Giao Thủy is roughly 100–200 m wide, so the river is
     narrower than one cell: the model knows it is there (hBase measures 3.56 m of standing
     water at the gauge) but the mesh has no resolution to draw a channel, which is why
     standing at Giao Thủy showed no river at all.

     Fixing that inside the solver would mean refining the grid basin-wide — expensive, and
     it would move hydrology that is already calibrated. So the wet surface is drawn from
     real OSM polygons at their true shape, while the flood on top stays on the solver
     grid. This layer is presentation only: it feeds nothing back into the model.          */
  let riverMesh = null;
  function buildOsmRivers() {
    if (/[?&]noosmwater\b/.test(location.search)) return;   // kill switch, matches ?classic
    const wt = FT.geo && FT.geo.osmWater;
    if (!wt || !wt.areas || !wt.areas.length || !THREE.ShapeUtils) return;
    const pos = [], idx = [], shade = [];
    let skipped = 0;
    for (const area of wt.areas) {
      const ring = area.p;
      if (!ring || ring.length < 4) continue;
      /* Drop the closing vertex: a repeated first/last point makes the triangulator emit
         a degenerate ear and the polygon comes out with a missing wedge. */
      const pts = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1) : ring.slice();
      if (pts.length < 3 || pts.length > 4000) { skipped++; continue; }
      let tris;
      try {
        tris = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), []);
      } catch (e) { skipped++; continue; }
      if (!tris || !tris.length) { skipped++; continue; }
      const vStart = pos.length / 3;
      for (const p of pts) {
        /* Sit exactly ON the ground and settle the co-planar fight with polygonOffset,
           never with a height bias. Biasing by height is the trap this codebase has hit
           twice: lift and the surface floats over its own banks at a tilt, drop and the
           terrain swallows it — measured, a 0.6 m drop made this layer invisible while
           still costing 152 000 triangles. */
        pos.push(p[0], groundY(p[0], p[1], 0), p[1]);
        shade.push(1);
      }
      for (const t of tris) idx.push(vStart + t[0], vStart + t[1], vStart + t[2]);
    }
    if (!idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(WATER_STYLE.permanentWaterColor),
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    riverMesh = new THREE.Mesh(g, mat);
    riverMesh.name = "osmRivers";
    riverMesh.renderOrder = 2;                       // under the flood sheet, over the ground
    riverMesh.frustumCulled = false;
    scene.add(riverMesh);
    console.info(`[scene3d] real river channels — ${wt.areas.length - skipped} polygons, ` +
                 `${(idx.length / 3) | 0} triangles${skipped ? `, ${skipped} skipped` : ""}`);
  }

  /* ---------- human impact: buildings recoloured by flood depth ---------- */
  let bldgPlacements = [], bldgClock = 9;
  S3.homesFlooded = 0;
  function updateBuildingImpact(dtReal) {
    if (!cityMesh || !bldgPlacements.length) return;
    bldgClock += dtReal;
    if (bldgClock < 1) return;
    bldgClock = 0;
    const cBase = new THREE.Color(0x9aa4ad);   // flood depth is drawn as a waterline now, not a flat tint
    let flooded = 0;
    const impactOn = FT.state.layers.impact;
    const fAttr = cityMesh.userData.floodAttr;
    for (let i = 0; i < bldgPlacements.length; i++) {
      const p = bldgPlacements[i];
      const d = W.sampleExcess(p[0], p[2]);
      /* Depth goes to the shader as metres so the waterline lands at the real height on
         the wall. The instance colour stays the dry base: saying "this house is flooded"
         with one flat colour cannot say how deep, which is the whole question. */
      if (fAttr) fAttr.array[i] = impactOn ? d : 0;
      if (impactOn && d >= 0.15) flooded++;
      cityMesh.setColorAt(i, cBase);
    }
    if (fAttr) fAttr.needsUpdate = true;
    if (cityMesh.instanceColor) cityMesh.instanceColor.needsUpdate = true;
    /* Real OSM buildings: write the standing water depth per building so the shader can
       draw the waterline. This replaces the old whole-building recolour — one flat colour
       could say "this house is flooded" but never "the water is up to here". */
    let osmFlooded = 0;
    if (osmBldg && osmBldg.mesh.geometry.attributes.aFloodM) {
      const fa = osmBldg.mesh.geometry.attributes.aFloodM;
      let fdirty = false;
      for (const rr of osmBldg.ranges) {
        const d = impactOn ? W.sampleExcess(rr.cx, rr.cy) : 0;
        if (d >= 0.15) osmFlooded++;
        if (Math.abs(d - (rr.lastD || 0)) < 0.02) continue;
        rr.lastD = d;
        fa.array.fill(d, rr.start, rr.start + rr.count);
        fdirty = true;
      }
      if (fdirty) fa.needsUpdate = true;
    }
    S3.homesFlooded = flooded * 9 + osmFlooded;          // procedural block ≈ cluster; móng OSM = 1 nhà thật
  }
  S3.homesInRadius = function (x, y, r) {
    let n = 0;
    for (const p of bldgPlacements) {
      if (Math.hypot(p[0] - x, p[2] - y) <= r && W.sampleExcess(p[0], p[2]) >= 0.15) n++;
    }
    n *= 9;
    if (osmBldg) for (const rr of osmBldg.ranges) {
      if (Math.hypot(rr.cx - x, rr.cy - y) <= r && W.sampleExcess(rr.cx, rr.cy) >= 0.15) n++;
    }
    return n;
  };

  /* ============ dams & gauges ============ */
  function buildDams() {
    damGroup = new THREE.Group();
    for (const r of D.RESERVOIRS) {
      const baseY = groundY(r.x, r.y, 2);
      const g = new THREE.Group();
      g.userData.explainSelection = { kind: "reservoir", id: r.id };
      g.position.set(r.x, 0, r.y);
      const crest = new THREE.Mesh(
        new THREE.BoxGeometry(1.35, 0.35, 0.45),
        new THREE.MeshLambertMaterial({ color: 0xb8bec6 })
      );
      crest.position.y = baseY + 0.3;
      g.add(crest);
      /* level bar */
      const barBg = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1.1), new THREE.MeshBasicMaterial({ color: 0x0a1c2c, side: THREE.DoubleSide }));
      barBg.position.set(0, baseY + 1.2, 0);
      g.add(barBg);
      const barFill = new THREE.Mesh(new THREE.PlaneGeometry(0.165, 1), new THREE.MeshBasicMaterial({ color: 0x37b6ff, side: THREE.DoubleSide }));
      barFill.position.set(0, baseY + 0.68, 0.002);
      g.add(barFill);
      /* spill jet */
      const jetGeo = new THREE.BufferGeometry();
      const jetN = 70;
      const jp = new Float32Array(jetN * 3);
      jetGeo.setAttribute("position", new THREE.BufferAttribute(jp, 3));
      const jet = new THREE.Points(jetGeo, new THREE.PointsMaterial({ color: 0xcfeaff, size: 0.06, transparent: true, opacity: 0.9 }));
      jet.visible = false;
      g.add(jet);
      damGroup.add(g);
      dams.push({ r, g, crest, barBg, barFill, jet, jp, jetPhase: new Float32Array(jetN).map((_, i) => i / jetN), baseY });
    }
    scene.add(damGroup);
  }
  function updateDams(snap, dt) {
    for (const d of dams) {
      const rs = snap.reservoirs[d.r.id];
      const pct = Math.min(1.05, rs.pct);
      /* The level bar is a 220 m × 1.1 km billboard — a readable gauge from across the
         basin, a wall across the valley up close. Same close-factor shrink the vehicles
         and gauge markers use; the crest itself is a physical structure and keeps its
         size. Overview is untouched (roadCloseF is 0 there). */
      const sM = 1 - roadCloseF * 0.80;
      d.barBg.scale.set(sM, sM, sM);
      d.barBg.position.y = d.baseY + 1.2 * sM;
      d.barFill.scale.set(sM, Math.max(0.02, pct * 1.1) * sM, sM);
      d.barFill.position.y = d.baseY + (0.68 + (pct * 1.1 - 1.1) * 0.5) * sM;
      d.barFill.material.color.set(rs.overCeil ? 0xff5252 : 0x37b6ff);
      d.jet.visible = !!rs.spilling && FT.state.layers.reservoirs;
      if (rs.spilling) {
        const jp = d.jp;
        for (let i = 0; i < d.jetPhase.length; i++) {
          d.jetPhase[i] += dt * (0.6 + (i % 5) * 0.1);
          if (d.jetPhase[i] > 1) d.jetPhase[i] -= 1;
          const t = d.jetPhase[i];
          jp[i * 3] = 0.6 + t * 1.2;
          jp[i * 3 + 1] = d.baseY + 0.26 - t * t * (d.baseY * 0.7);
          jp[i * 3 + 2] = ((i % 9) - 4) * 0.035;
        }
        d.jet.geometry.attributes.position.needsUpdate = true;
      }
      d.g.visible = FT.state.layers.reservoirs;
    }
  }

  function buildGauges() {
    gaugeGroup = new THREE.Group();
    for (const g of D.GAUGES) {
      const y = groundY(g.x, g.y, 1);
      const grp = new THREE.Group();
      grp.userData.explainSelection = { kind: "gauge", id: g.id };
      grp.position.set(g.x, 0, g.y);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.1, 0.045), new THREE.MeshBasicMaterial({ color: 0xd7e6f2 }));
      pole.position.y = y + 0.55;
      grp.add(pole);
      const disc = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8), new THREE.MeshBasicMaterial({ color: 0x4fc3f7 }));
      disc.position.y = y + 1.2;
      grp.add(disc);
      gaugeGroup.add(grp);
      gauges.push({ g, grp, disc, pole, baseY: y });
    }
    scene.add(gaugeGroup);
  }
  const AL_HEX = [0x4fc3f7, 0xffd54f, 0xffa040, 0xff5252];
  function updateGauges(snap, t) {
    for (const it of gauges) {
      const gs = snap.gauges[it.g.id];
      it.disc.material.color.set(AL_HEX[gs.alert]);
      const sel = FT.state.selectedGauge === it.g.id;
      const pulse = gs.alert >= 2 ? 1 + 0.18 * Math.sin(t * 5) : 1;
      /* The marker is a 310 m sphere on a 1.1 km pole — sized to be findable across a
         96 km domain, but at building zoom it is a blob covering a whole neighbourhood.
         Shrink it with the same close factor the rest of the scene uses; it stays a
         legible symbol without pretending to be a 310 m object. Overview is unchanged
         (roadCloseF is 0 there). */
      const sM = 1 - roadCloseF * 0.80;
      it.disc.scale.setScalar((sel ? 1.5 : 1) * pulse * sM);
      it.pole.scale.set(sM, sM, sM);
      it.pole.position.y = it.baseY + 0.55 * sM;
      it.disc.position.y = it.baseY + 1.2 * sM;
      it.grp.visible = FT.state.layers.gauges;
    }
  }

  /* ============ zone rings ============ */
  let zoneRings = [];
  const Z_HEX = [0x4fc3f7, 0xffd54f, 0xffa040, 0xff5252];
  function buildZones() {
    for (const z of D.ZONES) {
      const geo = new THREE.RingGeometry(z.r * 0.94, z.r, 48);
      const mat = new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(z.x, groundY(z.x, z.y, 1) + 0.05, z.y);
      ring.renderOrder = 4;
      ring.userData.explainSelection = { kind: "zone", id: z.id };
      scene.add(ring);
      zoneRings.push({ id: z.id, ring, mat, def: z });
    }
  }
  function updateZones(t) {
    if (!FT.zones || !FT.zones.ready) return;
    const show = FT.state.layers.zones;
    for (const zr of zoneRings) {
      const zs = FT.zones.byId(zr.id);
      if (!zs) continue;
      zr.ring.visible = show;
      zr.mat.color.setHex(Z_HEX[zs.status]);
      zr.mat.opacity = zs.status >= 3 ? 0.45 + 0.3 * Math.sin(t * 5) : zs.status >= 2 ? 0.55 : 0.3;
    }
  }

  /* ============ rain ============ */
  function buildRain() {
    const n = 3800;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    rainVel = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = Math.random() * 64 - 32;
      pos[i * 3 + 1] = Math.random() * 22;
      pos[i * 3 + 2] = Math.random() * 64 - 32;
      rainVel[i] = 14 + Math.random() * 8;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    rainPts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xa8c8e8, size: 0.05, transparent: true, opacity: 0.4 }));
    rainPts.visible = false;
    scene.add(rainPts);
  }
  function updateRain(snap, dt) {
    const on = FT.state.layers.rain && snap.rain > 6;
    rainPts.visible = on;
    if (!on) return;
    rainPts.material.opacity = U.clamp(snap.rain / 160, 0.15, 0.5);
    const pos = rainPts.geometry.attributes.position.array;
    const rate = U.clamp(snap.rain / 60, 0.5, 2.2);
    const tgt = controls.target;
    rainPts.position.set(tgt.x, 0, tgt.z);
    for (let i = 0; i < rainVel.length; i++) {
      pos[i * 3 + 1] -= rainVel[i] * rate * dt;
      pos[i * 3] -= dt * 2.2;                          // westward drift
      if (pos[i * 3 + 1] < 0) { pos[i * 3 + 1] = 19 + Math.random() * 3; pos[i * 3] = Math.random() * 64 - 32; pos[i * 3 + 2] = Math.random() * 64 - 32; }
    }
    rainPts.geometry.attributes.position.needsUpdate = true;
  }

  /* ============ labels ============ */
  function buildLabels() {
    labelWrap = document.getElementById("labels3d");
    labelWrap.textContent = "";
    labels = [];
    labelWrap.removeAttribute("aria-hidden");
    const mk = (txt, cls, x, yKm, elevOff, gaugeId, nearDist, selection) => {
      const el = document.createElement(selection ? "button" : "span");
      el.className = `label3d ${cls}`;
      el.textContent = txt;
      if (selection) {
        el.type = "button";
        el.dataset.explainKind = selection.kind;
        el.dataset.explainId = selection.id;
        el.dataset.selected = "false";
        el.setAttribute("aria-pressed", "false");
        /* the accessible name is a function of (kind, name, language) — none of which change
           between frames — so it is written once here instead of once per label per frame */
        el.setAttribute("aria-label", `${FT.i18n.t(`explain.label.${selection.kind}`)}: ${txt}`);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          FT.bus.emit("explainOrigin", { element: el, moveFocus: false });
          FT.explain.select(selection);
        });
        el.addEventListener("keydown", (ev) => {
          if (ev.key !== "Enter" && ev.key !== " ") return;
          ev.preventDefault();
          ev.stopPropagation();
          FT.bus.emit("explainOrigin", { element: el, moveFocus: true });
          FT.explain.select(selection);
        });
      } else {
        el.setAttribute("aria-hidden", "true");
      }
      labelWrap.appendChild(el);
      labels.push({ el, x, z: yKm, elevOff, cls, gaugeId, name: txt, nearDist: nearDist || 0, selection });
    };
    for (const c of D.CITIES) if (c.size >= 0.8) mk(c.name, "city", c.x, c.y, 0.55);
    for (const r of D.RESERVOIRS) mk(r.name, "res", r.x, r.y, 1.9, null, 0, { kind: "reservoir", id: r.id });
    for (const g of D.GAUGES) mk(g.name, "gauge", g.x, g.y, 1.55, g.id, 0, { kind: "gauge", id: g.id });
    /* gazetteer thật: quận/huyện hiện khi < 110, cầu & địa danh khi < 40 (đỡ rối toàn cảnh) */
    if (D.PLACES) for (const p of D.PLACES) {
      mk(p.n, `pl-${p.k}`, p.x, p.y, p.k === "bridge" ? 0.35 : 0.55, null, p.t === 1 ? 110 : 40);
    }
  }

  function syncSelectedLabels(selection) {
    for (const label of labels) {
      if (!label.selection) continue;
      const selected = !!selection &&
        label.selection.kind === selection.kind &&
        label.selection.id === selection.id;
      label.el.dataset.selected = String(selected);
      label.el.setAttribute("aria-pressed", String(selected));
    }
  }
  function updateLabels(snap) {
    if (!labels.length) return;
    const show = FT.state.layers.labels;
    const v = tmpV.v || (tmpV.v = new THREE.Vector3());
    /* cached: getBoundingClientRect() forces a synchronous layout, and this ran once per
       frame purely to read a size that only changes on resize. See S3.resize. */
    const rect = canvasRect || (canvasRect = renderer.domElement.getBoundingClientRect());
    const camDist = camera.position.distanceTo(controls.target);
    const sy2 = scene.scale.y;
    for (const L of labels) {
      const off = !show || (L.nearDist && camDist > L.nearDist);
      if (off) { if (!L.off) { L.off = true; L.el.style.display = "none"; } continue; }
      v.set(L.x, groundY(L.x, L.z, 1) * sy2 + L.elevOff * Math.max(sy2, 0.35), L.z);
      v.project(camera);
      if (v.z > 1 || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) {
        if (!L.off) { L.off = true; L.el.style.display = "none"; }
        continue;
      }
      if (L.off) { L.off = false; L.el.style.display = ""; }
      /* transform, not left/top: a compositor-only property. Writing left/top put every
         visible label into the layout tree on every frame, so a camera nudge with ~80
         labels up cost 80 layout invalidations per frame for a purely visual move. The
         -50%/-110% anchor that used to live in the stylesheet is folded in here, because
         an inline transform outranks a stylesheet one. */
      const emphasis = L.el.dataset.selected === "true" ? " scale(1.06)" : "";
      L.el.style.transform =
        `translate3d(${(((v.x + 1) / 2) * rect.width).toFixed(1)}px, ${(((1 - v.y) / 2) * rect.height).toFixed(1)}px, 0) translate(-50%, -110%)${emphasis}`;
      /* gauges: live stage + alert colour on the label itself */
      if (L.gaugeId) {
        const gs = snap.gauges[L.gaugeId];
        const txt = `${L.name} ${U.fmt(gs.stage, 1)} m`;
        if (L.txt !== txt) { L.txt = txt; L.el.textContent = txt; }
        const cls = `label3d gauge${gs.alert ? ` gauge-${gs.alert}` : ""}`;
        if (L.cls !== cls) { L.cls = cls; L.el.className = cls; }
      }
    }
  }

  function selectorFromHit(object) {
    for (let node = object; node; node = node.parent) {
      if (node.userData && node.userData.explainSelection) return node.userData.explainSelection;
    }
    return null;
  }

  function visibleThroughParents(object) {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    return true;
  }

  function rayFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    rayPointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(rayPointer, camera);
  }

  function resolveRay(clientX, clientY) {
    rayFromClient(clientX, clientY);
    const entityHits = raycaster.intersectObjects([damGroup, gaugeGroup, ...zoneRings.map((item) => item.ring)], true);
    for (const hit of entityHits) {
      if (!visibleThroughParents(hit.object)) continue;
      const selection = selectorFromHit(hit.object);
      if (selection) return selection;
    }
    const surfaceHits = raycaster.intersectObjects([waterMesh, terrainMesh].filter(Boolean), false);
    const surface = surfaceHits.find((hit) => visibleThroughParents(hit.object));
    if (!surface) return null;
    const xKm = U.clamp(surface.point.x, 0, SZ), yKm = U.clamp(surface.point.z, 0, SZ);
    return { kind: "point", xKm, yKm };
  }

  function selectRay(clientX, clientY, pointerType) {
    const selection = resolveRay(clientX, clientY);
    if (!selection) return;
    canvas.dataset.lastExplainPointer = pointerType || "mouse";
    FT.bus.emit("explainOrigin", { element: canvas, moveFocus: false });
    FT.explain.select(selection);
  }

  function bindSelection() {
    canvas.addEventListener("pointerdown", (ev) => {
      if (!ev.isPrimary || ev.button !== 0) return;
      selectionPointerId = ev.pointerId;
      pointerDownX = ev.clientX; pointerDownY = ev.clientY; pointerMoved = 0;
    });
    canvas.addEventListener("pointermove", (ev) => {
      if (ev.pointerId !== selectionPointerId) return;
      pointerMoved = Math.max(pointerMoved, Math.hypot(ev.clientX - pointerDownX, ev.clientY - pointerDownY));
    });
    canvas.addEventListener("pointerup", (ev) => {
      if (ev.pointerId !== selectionPointerId || !ev.isPrimary || ev.button !== 0) return;
      selectionPointerId = null;
      if (pointerMoved >= 6) return;
      selectRay(ev.clientX, ev.clientY, ev.pointerType);
    });
    canvas.addEventListener("pointercancel", (ev) => {
      if (ev.pointerId === selectionPointerId) selectionPointerId = null;
    });
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function cameraVector() {
    if (!camera || !controls) return null;
    return camera.position.clone().sub(controls.target);
  }

  function settleFly(status) {
    if (!activeFly) return;
    const meta = activeFly;
    activeFly = null;
    flyFrom = null;
    flyTo = null;
    flyT = 1;
    if (FT.bus && meta.emit !== false) {
      FT.bus.emit("camera.fly.settled", {
        selection: meta.selection || null,
        intent: meta.intent || "overview",
        view: "3d",
        status: status || "settled",
      });
    }
  }

  function cancelFly() {
    if (!activeFly) return;
    settleFly("cancelled");
  }

  function startFly(pos, tgt, meta) {
    if (!camera || !controls || !pos || !tgt) return false;
    cancelFly();
    const intent = meta && meta.intent || "overview";
    flyFrom = { pos: camera.position.clone(), tgt: controls.target.clone() };
    flyTo = { pos, tgt };
    flyT = reducedMotion() ? 0.985 : 0;
    activeFly = {
      selection: meta && meta.selection || null,
      intent,
      emit: !meta || meta.emit !== false,
    };
    if (FT.bus && activeFly.emit) {
      FT.bus.emit("camera.fly.start", {
        selection: activeFly.selection,
        intent,
        view: "3d",
      });
    }
    return true;
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

  function ensureSelectionRing() {
    if (selectionRing || !THREE || !scene) return selectionRing;
    const geo = new THREE.RingGeometry(0.42, 0.58, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4aa3ff,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    selectionRing = new THREE.Mesh(geo, mat);
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.renderOrder = 80;
    selectionRing.visible = false;
    scene.add(selectionRing);
    return selectionRing;
  }

  function showSelectionPulse(selection) {
    const point = pointFromSelection(selection);
    const ring = ensureSelectionRing();
    if (!point || !ring) {
      selectionPulse = null;
      if (ring) ring.visible = false;
      return;
    }
    selectionPulse = {
      selection: { kind: selection.kind, id: selection.id || null, xKm: point.x, yKm: point.y },
      x: point.x,
      y: point.y,
      start: performance.now(),
      duration: reducedMotion() ? 0 : 1800,
    };
    ring.visible = true;
  }

  function updateSelectionPulse() {
    if (!selectionRing || !selectionPulse) return;
    const t = selectionPulse.duration ? U.clamp((performance.now() - selectionPulse.start) / selectionPulse.duration, 0, 1) : 1;
    if (t >= 1 && selectionPulse.duration) {
      selectionPulse = null;
      selectionRing.visible = false;
      return;
    }
    const hold = selectionPulse.duration ? 1 - t : 0.82;
    const y = groundY(selectionPulse.x, selectionPulse.y, 1) + 0.08;
    const s = 1 + t * 1.4;
    selectionRing.position.set(selectionPulse.x, y, selectionPulse.y);
    selectionRing.scale.setScalar(s);
    selectionRing.material.opacity = 0.88 * hold;
    selectionRing.visible = true;
  }

  /* ============ dynamic close-zoom detail (live slippy tiles draped on terrain — Google-Earth style) ============ */
  /* 2048 px over the window: at the old 1024 a view-sized window would have dropped two
     zoom levels and blurred everything, which trades one defect for another. */
  /* 24 km, not 14: the first attempt capped below the old dist*1.15 sizing and so made
   the mid ("asset") zoom WORSE than before — meanLuma 140 -> 113, murk 19 -> 35. The
   cap must never shrink coverage relative to what it replaced. */
  const DQ_PX = 2048, DQ_MAX_KM = 24, DQ_TILE_BUDGET = 340;
  /* TWO levels, because one flat texture cannot serve a tilted view.
     Measured: at 0.45 km the far window is 2.93 km wide, so its 2048 px texture is
     1.43 m/px — finer than the screen needs at the horizon, but the ground at the
     BOTTOM of the frame is only ~200 m away, where a screen pixel covers ~0.15 m.
     That single number cannot be right at both ends, which is why the far field looked
     fine while the foreground was mush. The near layer is a small, high-zoom window
     parked over the foreground; the far layer keeps the whole view covered. */
  const DQ_NEAR_FRAC = 0.34;               // near window as a fraction of the view width
  const DQ_NEAR_MIN = 0.35, DQ_NEAR_MAX = 3.2;
  /* Tile policy per layer. Measured with both layers at full policy: 113 img tiles never
     arrived in the far window and 64 in the near one, so the ground fell back to stretched
     parent tiles — blurrier than the single-layer version it replaced. The bill has to be
     paid where the eye is: the near window keeps the high zoom, the far window drops one
     level (it is compressed on screen anyway), and neither bakes the label layer, which
     was a third of the requests and rendered as metre-high text smeared across the ground. */
  /* img only — no live "rd"/"pl" overlay. Those tiles carry map labels sized for a
     top-down view of their own zoom level; baked onto the ground and seen at a tilt they
     smear into metre-high text across the valley ("ĐƯỜNG HỒ CHÍ MINH" spanning 3 km).
     Nothing is lost: the baked base imagery already has transport drawn in, main roads
     are real 3D ribbons, and place names are screen-space DOM labels that stay upright. */
  const DQ = { mesh: null, cv: null, ctx: null, tex: null, N: 96, acc: 9, key: "", pending: 0,
               maxZ: 16, layers: ["img"] };
  const DQN = { mesh: null, cv: null, ctx: null, tex: null, N: 64, acc: 9, key: "", pending: 0,
                maxZ: 19, layers: ["img"] };
  function makeDrapeMesh(L, px, renderOrder) {
    L.cv = document.createElement("canvas");
    L.cv.width = L.cv.height = px;
    L.ctx = L.cv.getContext("2d");
    L.tex = new THREE.CanvasTexture(L.cv);
    L.tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const N = L.N, V = N + 1;
    const pos = new Float32Array(V * V * 3);
    const uv = new Float32Array(V * V * 2);
    const idx = [];
    for (let iy = 0; iy < V; iy++) for (let ix = 0; ix < V; ix++) {
      const k = iy * V + ix;
      uv[k * 2] = ix / N; uv[k * 2 + 1] = 1 - iy / N;
    }
    for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
      const a = iy * V + ix, b = a + 1, c2 = a + V, d2 = c2 + 1;
      idx.push(a, c2, b, b, c2, d2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    /* The near layer sits on the same ground as the far one, so it needs a depth bias
       rather than a height offset — lifting it would make it float over buildings. */
    const mat = new THREE.MeshBasicMaterial({ map: L.tex });
    if (renderOrder > 0) { mat.polygonOffset = true; mat.polygonOffsetFactor = -4; mat.polygonOffsetUnits = -4; }
    L.mesh = new THREE.Mesh(g, mat);
    L.mesh.visible = false;
    L.mesh.renderOrder = renderOrder;
    L.mesh.frustumCulled = false;          // bỏ tính boundingSphere mỗi lần cập nhật (đỡ hitch)
    scene.add(L.mesh);
  }
  function ensureDetail() {
    if (DQ.mesh || !FT.geo || !FT.geo.hasImagery || !FT.geo.tile) return;
    makeDrapeMesh(DQ, DQ_PX, 0);
    makeDrapeMesh(DQN, DQ_PX, 1);
    S3._dq = DQ; S3._dqn = DQN;
  }
  /* Ground actually inside the frustum, by intersecting the screen corners with the
     ground plane. Sizing the deep-zoom window off camera DISTANCE instead of off this
     is what produced the single bright square: at every close distance the window came
     out ~27% of the view width, i.e. it covered 7% of the visible ground area and the
     other 93% stayed blurred base imagery. Rays that escape over the horizon are
     reported so the caller can fall back instead of using a garbage box. */
  const dqRay = { rc: null, plane: null, hit: null, ndc: null };
  function viewGroundBox() {
    if (!dqRay.rc) {
      dqRay.rc = new THREE.Raycaster();
      dqRay.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      dqRay.hit = new THREE.Vector3();
      dqRay.ndc = new THREE.Vector2();
    }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, miss = 0;
    for (const c of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      dqRay.rc.setFromCamera(dqRay.ndc.set(c[0], c[1]), camera);
      if (!dqRay.rc.ray.intersectPlane(dqRay.plane, dqRay.hit)) { miss++; continue; }
      x0 = Math.min(x0, dqRay.hit.x); x1 = Math.max(x1, dqRay.hit.x);
      z0 = Math.min(z0, dqRay.hit.z); z1 = Math.max(z1, dqRay.hit.z);
    }
    if (miss >= 3) return null;                 // looking at the horizon — nothing usable
    return { x0, x1, z0, z1, w: Math.max(x1 - x0, z1 - z0), cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, miss };
  }

  /* Ground point under the lower part of the frame — where the foreground blur lives. */
  function nearFieldPoint() {
    if (!dqRay.rc) return null;
    dqRay.rc.setFromCamera(dqRay.ndc.set(0, -0.72), camera);
    if (!dqRay.rc.ray.intersectPlane(dqRay.plane, dqRay.hit)) return null;
    return { x: dqRay.hit.x, z: dqRay.hit.z };
  }

  function updateDetail(dt) {
    DQ.acc += dt; DQN.acc += dt;
    ensureDetail();
    if (!DQ.mesh) return;
    const dist = camera.position.distanceTo(controls.target);
    if (dist > 34) {
      DQ.mesh.visible = false; DQ.key = "";
      DQN.mesh.visible = false; DQN.key = "";
      return;
    }
    /* Cover what is on screen. DQ_MAX_KM bounds the tile bill; beyond it the window
       stops growing and the far field goes back to base imagery, which is the honest
       trade — a uniformly slightly-softer view beats a sharp patch in a blurred field. */
    const box = viewGroundBox();
    const viewW = box ? box.w : dist * 1.15;
    /* Near layer first: it is the one the eye judges, and it is cheap (small window). */
    /* Only worth a near layer when it is a real fraction of the view. At mid zoom the
       clamped near window would be a 3 km sharp patch inside a 50 km frame — the exact
       bright square this work set out to remove. */
    const np = nearFieldPoint();
    if (np && dist < 12 && viewW <= 9) {
      const Sn = U.clamp(viewW * DQ_NEAR_FRAC, DQ_NEAR_MIN, DQ_NEAR_MAX);
      drawDrape(DQN, Sn, np.x, np.z, dist, "near");
    } else if (DQN.mesh) { DQN.mesh.visible = false; DQN.key = ""; }
    const S = U.clamp(Math.max(viewW * 1.08, dist * 1.15), 1.1, DQ_MAX_KM);   // never below the pre-fix sizing
    /* Centre on the visible ground, not on the orbit target: with a tilted camera most
       of what you see lies beyond the target, so a target-centred window wastes half
       its area behind the viewer. */
    const tcx = box ? box.cx : controls.target.x, tcy = box ? box.cz : controls.target.z;
    drawDrape(DQ, S, tcx, tcy, dist, "far");
  }

  function drawDrape(DQ, S, tcx, tcy, dist, tagName) {
    if (DQ.acc < 0.35) return;
    const G2 = FT.geo, SZk = G2.SZ, tm = G2.tileMath;
    const cx = U.clamp(tcx, 0, SZk), cy = U.clamp(tcy, 0, SZk);
    const x0 = U.clamp(cx - S / 2, 0, SZk - S), y0 = U.clamp(cy - S / 2, 0, SZk - S);
    const mpp = (S * 1000) / DQ_PX;
    const latMid = G2.km2ll(cx, cy)[1];
    let z = Math.round(Math.log2((156543 * Math.cos((latMid * Math.PI) / 180)) / mpp));
    z = Math.max(13, Math.min(DQ.maxZ, z));
    const key = `${z}|${x0.toFixed(2)}|${y0.toFixed(2)}|${S.toFixed(2)}`;
    const keySame = key === DQ.key;
    if (keySame && !DQ.pending) return;
    if (keySame && DQ.acc < 0.55) return;   // chỉ chờ tile nạp nốt → cadence chậm hơn, đỡ giật
    DQ.acc = 0;
    DQ.key = key;
    if ((DQ.logs = (DQ.logs || 0) + 1) <= 4) console.info(`[3d] detail ${tagName} z${z} · ${S.toFixed(2)} km · cam ${dist.toFixed(1)}`);
    /* base: baked equirect canvas (đã gồm z14 đô thị + giao thông) — không bao giờ trống */
    const ctx = DQ.ctx, ps = DQ_PX / S, bs = G2.imagery.width / SZk;
    ctx.drawImage(G2.imagery, x0 * bs, y0 * bs, S * bs, S * bs, 0, 0, DQ_PX, DQ_PX);
    for (const p of G2.detailPatches || []) {
      if (p.x1 < x0 || p.x0 > x0 + S || p.y1 < y0 || p.y0 > y0 + S) continue;
      ctx.drawImage(p.canvas, (p.x0 - x0) * ps, (p.y0 - y0) * ps, (p.x1 - p.x0) * ps, (p.y1 - p.y0) * ps);
    }
    /* live tiles ảnh + giao thông (cùng cache/retry với 2D), vá tile cha khi đang tải */
    DQ.pending = 0;
    const nw = G2.km2ll(x0, y0), se = G2.km2ll(x0 + S, y0 + S);
    const tx0 = Math.floor(tm.lon2t(nw[0], z)), tx1 = Math.floor(tm.lon2t(se[0], z));
    const ty0 = Math.floor(tm.lat2t(nw[1], z)), ty1 = Math.floor(tm.lat2t(se[1], z));
    let budget = DQ_TILE_BUDGET;
    for (const layer of DQ.layers) {
      for (let ty = ty0; ty <= ty1 && budget > 0; ty++) {
        for (let tx = tx0; tx <= tx1 && budget > 0; tx++) {
          budget--;
          const e = G2.tile(layer, z, tx, ty);
          const kA = G2.ll2km(tm.t2lon(tx, z), tm.t2lat(ty, z));
          const kB = G2.ll2km(tm.t2lon(tx + 1, z), tm.t2lat(ty + 1, z));
          const dx = (kA[0] - x0) * ps, dy = (kA[1] - y0) * ps;
          const dw = (kB[0] - kA[0]) * ps, dh = (kB[1] - kA[1]) * ps;
          if (e.ok) ctx.drawImage(e.img, dx, dy, dw, dh);
          else if (layer === "img") {
            DQ.pending++;
            if (z > 13) {
              const pT = G2.tile(layer, z - 1, tx >> 1, ty >> 1);
              if (pT.ok) ctx.drawImage(pT.img, (tx & 1) * 128, (ty & 1) * 128, 128, 128, dx, dy, dw, dh);
            }
          }
        }
      }
    }
    /* drape lưới bám DEM — chỉ khi khung nhìn đổi (tile nạp nốt thì chỉ cần cập nhật texture) */
    if (!keySame) {
      const posA = DQ.mesh.geometry.attributes.position, V = DQ.N + 1;
      /* Clear the terrain mesh, not the DEM. The drape samples the DEM every
         S/64 km while the terrain mesh renders it every 250 m, so over any
         concave ground the mesh sits ABOVE the DEM and a drape offset by a
         fixed 1.75 m gets punched through — that is what read on screen as
         dark blotches all over the city at building zoom. */
      const half = (S / DQ.N) * 0.5;
      for (let iy = 0; iy < V; iy++) {
        for (let ix = 0; ix < V; ix++) {
          const o = (iy * V + ix) * 3;
          const xk = x0 + (ix / DQ.N) * S, yk = y0 + (iy / DQ.N) * S;
          posA.array[o] = xk;
          const demY = elevToY(terrAt(xk, yk));
          posA.array[o + 1] = (DRAPE_LEGACY ? demY : Math.max(demY, terrainSurfaceMax(xk, yk, half)))
            + (0.035 - roadCloseF * 0.02);
          posA.array[o + 2] = yk;
        }
      }
      posA.needsUpdate = true;
    }
    DQ.tex.needsUpdate = true;
    DQ.mesh.visible = true;
  }

  /* ============ init / render ============ */
  S3.init = function (cv) {
    THREE = window.THREE;
    if (!THREE) throw new Error("THREE missing");
    W = FT.world;
    canvas = cv;
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x081726);
    scene.fog = new THREE.Fog(0x081726, 150, 420);
    skyClear = new THREE.Color(0x081726);
    skyStorm = new THREE.Color(0x1c232c);
    skyTmp = new THREE.Color();
    CLOSE_HAZE = new THREE.Color(0x93aec4);

    camera = new THREE.PerspectiveCamera(46, 1.6, 0.5, 600);
    camera.position.set(...CAMS.overview.pos);

    controls = new window.OrbitControls(camera, cv);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.zoomToCursor = true;           // zoom về phía con trỏ như Google Maps
    controls.maxPolarAngle = 1.45;
    /* 1.2 km bottomed out well above building level — the view was still 5 km wide and
       "zoom in" simply stopped responding. 0.45 km puts a 15 m building at ~11 px. */
    controls.minDistance = 0.45;
    controls.maxDistance = 220;
    controls.target.set(...CAMS.overview.tgt);
    controls.addEventListener("start", cancelFly);
    raycaster = new THREE.Raycaster();
    rayPointer = new THREE.Vector2();

    hemiLight = new THREE.HemisphereLight(0xbcd8ff, 0x18261f, 0.85);
    scene.add(hemiLight);
    const key = new THREE.DirectionalLight(0xffd9a8, 1.25);
    key.position.set(70, 110, -60);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x6f9fd8, 0.35);
    fill.position.set(-70, 70, 95);
    scene.add(fill);
    /* The overview is lit as dusk, which is the look the wide shot wants. Up close
       that same rig crushes every wall facing away from the key light to near-black,
       because there is no ambient term at all. This one lifts with proximity only. */
    closeAmbient = new THREE.AmbientLight(0xdce8f5, 0);
    scene.add(closeAmbient);

    buildTerrain();
    buildWater();
    /* after the terrain so groundY() can drape the channels on the real DEM */
    if (FT.geo && FT.geo.hasOSMWater) buildOsmRivers();
    buildRoads();
    buildVehicles();
    /* Baked footprints are already in memory by the time the scene builds (main.js awaits
       them with the DEM), so the real city goes up on the first frame instead of appearing
       later via the osmBuildings event — and the procedural filler is skipped inside the
       city windows from the start rather than being drawn and then swapped out. */
    if (FT.geo && FT.geo.hasOSMBldg) skipPatchProcedural = true;
    buildCities();
    if (FT.geo && FT.geo.hasOSMBldg) buildOsmBuildingsMesh();
    buildDams();
    buildGauges();
    buildZones();
    buildRain();
    buildLabels();
    bindSelection();
    ensureSelectionRing();
    canvas.tabIndex = 0;

    const ro = new ResizeObserver(() => S3.resize());
    ro.observe(cv);
    S3.resize();
    FT.bus.on("osmRoads", () => { try { buildOsmRoads(); } catch (e) { console.warn("osm 3d roads", e); } });
    FT.bus.on("osmBuildings", () => { try { swapOsmBuildings(); } catch (e) { console.warn("osm 3d bldg", e); } });
    FT.bus.on("osmMinor", () => { try { buildOsmMinor(); } catch (e) { console.warn("osm 3d minor", e); } });
    FT.bus.on("explainSelection", (contract) => {
      const selection = contract && contract.selection;
      showSelectionPulse(selection);
      syncSelectedLabels(selection);
    });
  };

  S3.resize = function () {
    if (!renderer) return;
    const r = canvas.getBoundingClientRect();
    canvasRect = null;                      // the cached rect the label pass reads is now stale
    if (r.width < 4 || r.height < 4) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  };

  S3.setCamera = function (preset) {
    const c = CAMS[preset];
    if (!c || !camera) return;
    startFly(c.pos.slice(), c.tgt.slice(), { intent: preset, selection: null });
    FT.state.camPreset = preset;
  };

  S3.cameraState = function () {
    if (!camera || !controls) return null;
    const v = cameraVector();
    if (!v) return null;
    const horizontal = Math.hypot(v.x, v.z);
    const distance = v.length();
    return {
      distance,
      bearing: Math.atan2(v.x, v.z) * 180 / Math.PI,
      tilt: Math.atan2(horizontal, Math.max(0.0001, v.y)) * 180 / Math.PI,
      target: { x: controls.target.x, y: controls.target.z, z: controls.target.y },
      position: { x: camera.position.x, y: camera.position.z, z: camera.position.y },
    };
  };

  S3.waterPresentation = function () {
    const ghost = waterMat && waterMat.uniforms && waterMat.uniforms.uGhost ? waterMat.uniforms.uGhost.value : 0;
    const fade = WATER_LEGACY ? WATER_STYLE.simulatedFillFadeLegacy : WATER_STYLE.simulatedFillFade;
    const closeOpacity = WATER_STYLE.simulatedFarOpacity * (1 - U.clamp(ghost, 0, 1) * fade);
    return {
      permanentWaterColor: WATER_STYLE.permanentWaterColor,
      simulatedWaterColor: WATER_STYLE.simulatedWaterColor,
      closeOpacity,
      farOpacity: WATER_STYLE.simulatedFarOpacity,
      simulatedFillOpacity: closeOpacity,
      boundaryOpacity: WATER_STYLE.boundaryOpacity,
      flowOpacity: WATER_STYLE.flowOpacity,
      ghost: U.clamp(ghost, 0, 1),
      mode: "presentation-metadata",
    };
  };

  S3.selectionTarget = function (selection) {
    if (!renderer || !selection) return null;
    const candidates = [];
    const id = selection.id || null;
    if (selection.kind === "reservoir") {
      const item = dams.find((candidate) => candidate.r.id === selection.id);
      if (!item) return null;
      item.g.traverse((object) => {
        if (!object.isMesh || !object.geometry) return;
        object.geometry.computeBoundingBox();
        const box = object.geometry.boundingBox;
        for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.2, 0.5, 0.8]) {
          candidates.push(object.localToWorld(new THREE.Vector3(
            U.lerp(box.min.x, box.max.x, fx), U.lerp(box.min.y, box.max.y, fy), U.lerp(box.min.z, box.max.z, 0.5)
          )));
        }
      });
    } else if (selection.kind === "gauge") {
      const item = gauges.find((candidate) => candidate.g.id === selection.id);
      if (!item) return null;
      candidates.push(item.disc.getWorldPosition(new THREE.Vector3()));
    } else if (selection.kind === "zone") {
      const item = zoneRings.find((candidate) => candidate.id === selection.id);
      if (!item) return null;
      for (let i = 0; i < 48; i++) {
        const a = i * Math.PI * 2 / 48;
        candidates.push(item.ring.localToWorld(new THREE.Vector3(Math.cos(a) * item.def.r * 0.97, Math.sin(a) * item.def.r * 0.97, 0)));
      }
    } else if (selection.kind === "point") {
      candidates.push(new THREE.Vector3(selection.xKm, groundY(selection.xKm, selection.yKm, 1) * scene.scale.y, selection.yKm));
    } else return null;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const rect = canvas.getBoundingClientRect();
    for (const world of candidates) {
      world.project(camera);
      const target = {
        x: rect.left + ((world.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - world.y) / 2) * rect.height,
        kind: selection.kind,
        id,
      };
      if (selection.kind === "point" && target.x >= rect.left && target.x <= rect.right && target.y >= rect.top && target.y <= rect.bottom) return target;
      if (document.elementFromPoint(target.x, target.y) !== canvas) continue;
      const resolved = resolveRay(target.x, target.y);
      if (resolved && resolved.kind === selection.kind && resolved.id === selection.id) return target;
    }
    return null;
  };

  /* fly close to a world point (zone drill-down) */
  S3.flyToPoint = function (xKm, yKm) {
    return S3.flyToSelection({ kind: "point", xKm, yKm }, { intent: "asset" });
  };

  S3.flyToSelection = function (selection, options) {
    if (!camera || !controls) return false;
    const point = pointFromSelection(selection);
    if (!point) return false;
    const intent = options && options.intent || (selection.kind === "point" ? "asset" : "district");
    const dist = CAMERA_DISTANCES[intent] || CAMERA_DISTANCES.asset;
    const te = groundY(point.x, point.y, 1) * scene.scale.y;
    const tilt = intent === "street" ? 55 : intent === "overview" ? 48 : 60;
    const vertical = Math.max(2.8, Math.cos(tilt * Math.PI / 180) * dist);
    const horizontal = Math.max(1.2, Math.sin(tilt * Math.PI / 180) * dist);
    const bearing = -38 * Math.PI / 180;
    const pos = [
      point.x + Math.sin(bearing) * horizontal,
      te + vertical,
      point.y + Math.cos(bearing) * horizontal,
    ];
    const tgt = [point.x, te, point.y];
    return startFly(pos, tgt, { selection, intent });
  };

  S3.orbitSelection = function (selection) {
    if (!camera || !controls) return false;
    const point = pointFromSelection(selection);
    if (!point) return false;
    const te = groundY(point.x, point.y, 1) * scene.scale.y;
    const current = cameraVector();
    const currentBearing = current ? Math.atan2(current.x, current.z) : -38 * Math.PI / 180;
    const bearing = currentBearing + 72 * Math.PI / 180;
    const dist = U.clamp(current ? current.length() : CAMERA_DISTANCES.asset, 12, 22);
    const tilt = 60 * Math.PI / 180;
    const vertical = Math.max(2.8, Math.cos(tilt) * dist);
    const horizontal = Math.max(1.2, Math.sin(tilt) * dist);
    const pos = [
      point.x + Math.sin(bearing) * horizontal,
      te + vertical,
      point.y + Math.cos(bearing) * horizontal,
    ];
    return startFly(pos, [point.x, te, point.y], { selection, intent: "orbit" });
  };

  S3.zoomStep = function (direction) {
    if (!camera || !controls) return false;
    cancelFly();
    const v = cameraVector();
    if (!v) return false;
    const factor = direction === "out" || direction < 0 ? 1.38 : 0.72;
    const next = U.clamp(v.length() * factor, controls.minDistance || 0.45, controls.maxDistance || 220);
    v.setLength(next);
    camera.position.copy(controls.target).add(v);
    controls.update();
    return true;
  };

  S3.resetNorth = function () {
    if (!camera || !controls) return false;
    cancelFly();
    const v = cameraVector();
    if (!v) return false;
    const horizontal = Math.hypot(v.x, v.z) || 1;
    camera.position.set(controls.target.x, controls.target.y + v.y, controls.target.z + horizontal);
    controls.update();
    return true;
  };

  S3.toggleTilt = function () {
    if (!camera || !controls) return false;
    cancelFly();
    const v = cameraVector();
    if (!v) return false;
    const dist = U.clamp(v.length(), controls.minDistance || 0.45, controls.maxDistance || 220);
    const bearing = Math.atan2(v.x, v.z);
    const current = Math.atan2(Math.hypot(v.x, v.z), Math.max(0.0001, v.y)) * 180 / Math.PI;
    const nextTilt = current > 47 ? 32 : 64;
    const nextV = Math.cos(nextTilt * Math.PI / 180) * dist;
    const nextH = Math.sin(nextTilt * Math.PI / 180) * dist;
    camera.position.set(
      controls.target.x + Math.sin(bearing) * nextH,
      controls.target.y + nextV,
      controls.target.z + Math.cos(bearing) * nextH
    );
    controls.update();
    return true;
  };

  S3.render = function (dtReal, snap) {
    if (!renderer) return;
    clock += dtReal;
    if (flyT < 1 && flyFrom) {
      flyT = Math.min(1, flyT + dtReal / 0.85);
      const e = flyT * flyT * (3 - 2 * flyT);
      camera.position.set(
        U.lerp(flyFrom.pos.x, flyTo.pos[0], e),
        U.lerp(flyFrom.pos.y, flyTo.pos[1], e),
        U.lerp(flyFrom.pos.z, flyTo.pos[2], e)
      );
      controls.target.set(
        U.lerp(flyFrom.tgt.x, flyTo.tgt[0], e),
        U.lerp(flyFrom.tgt.y, flyTo.tgt[1], e),
        U.lerp(flyFrom.tgt.z, flyTo.tgt[2], e)
      );
      if (flyT >= 1) settleFly("settled");
    }
    controls.update();
    const camD = camera.position.distanceTo(controls.target);
    /* street-zoom realism: đường mở & nước nông nhường chỗ cho mặt đất thật */
    const cf = U.clamp((26 - camD) / 12, 0, 1);
    /* storm atmosphere: sky darkens & visibility closes in with rain intensity */
    if (skyTmp) {
      const rainF = Math.min(1, snap.rain / 110);
      skyTmp.copy(skyClear).lerp(skyStorm, rainF);
      /* Close in, lift the haze off the horizon too — a street view ringed by the
         overview's night-blue reads as a dark wall around whatever you flew to. */
      if (cf > 0) skyTmp.lerp(CLOSE_HAZE, cf * 0.55);
      scene.background.copy(skyTmp);
      scene.fog.color.copy(skyTmp);
      /* Fog tuned for a 96 km overview swallows the mid-ground of a 5 km view.
         Hold it off in proportion to how close the camera actually is. */
      const fogScale = Math.max(1, 26 / Math.max(camD, 1));
      scene.fog.near = (150 - 60 * rainF) * fogScale;
      scene.fog.far = (420 - 160 * rainF) * fogScale;
    }
    if (closeAmbient) closeAmbient.intensity = cf * 0.42;
    if (hemiLight) hemiLight.intensity = 0.85 + cf * 0.35;
    waterMat.uniforms.uTime.value = clock;
    waterMat.uniforms.uGhost.value = cf;
    /* đúng tỉ lệ dọc/ngang: toàn cảnh giữ phóng đại 20× cho dễ đọc, ghé sát hạ về ~2× (gần thực) */
    scene.scale.y = 1 - cf * 0.9;
    /* Buildings hold true height through that squash: 1 unit = 1 km, so a metre is
       0.001, divided by the scene squash that is about to be applied to everything. */
    BLDG_UNIFORMS.uMetreY.value = 0.001 / Math.max(0.1, scene.scale.y);
    BLDG_UNIFORMS.uFloodOn.value = FT.state.layers.impact ? 1 : 0;
    /* rebuild nặng (ma trận nhà + màu đường) dồn về nhịp 0,25s và ngưỡng 0,08 — zoom không còn khựng */
    cfAcc += dtReal;
    let cfJump = false;
    if (cfAcc >= 0.25 && Math.abs(cf - roadCloseF) > 0.08) {
      cfAcc = 0; cfJump = true; roadCloseF = cf; updateBuildingScale(cf); updateRoadWidth(cf);
    }
    waterMesh.visible = FT.state.layers.water;
    if (riverMesh) riverMesh.visible = FT.state.layers.water;
    /* nước: mặt/độ sâu đổi theo sim (Δt 2.5 s) — cập nhật 10 Hz là đủ, shimmer đã chạy bằng uTime */
    wAcc += dtReal;
    if (waterMesh.visible && wAcc >= 0.1) { wAcc = 0; updateWater(); }
    updateRoadColors(cfJump, clock);
    S3._roadMesh.visible = FT.state.layers.roads;
    minorLines && (minorLines.visible = FT.state.layers.roads && camD < 32);
    vehMesh.visible = FT.state.layers.traffic;
    if (vehMesh.visible) updateVehicles();
    cityMesh && (cityMesh.visible = FT.state.layers.bldg);
    osmBldg && (osmBldg.mesh.visible = FT.state.layers.bldg);
    updateBuildingImpact(dtReal);
    updateDams(snap, dtReal);
    updateGauges(snap, clock);
    updateZones(clock);
    updateRain(snap, dtReal);
    updateLabels(snap);
    updateDetail(dtReal);
    updateSelectionPulse();
    renderer.render(scene, camera);
  };
  Object.defineProperty(S3, "selectionPresentation", { enumerable: true, get() {
    return selectionPulse ? {
      selection: { ...selectionPulse.selection },
      duration: selectionPulse.duration,
      repeating: selectionPulse.duration > 0,
    } : null;
  } });
})();
