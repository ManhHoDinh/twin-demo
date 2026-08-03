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
  let flyFrom = null, flyTo = null, flyT = 1;
  let skyClear = null, skyStorm = null, skyTmp = null;
  const tmpV = { v: null };
  let clock = 0, sunAcc = 9;
  let pointerDownX = 0, pointerDownY = 0, pointerMoved = 0, selectionPointerId = null;
  let canvasRect = null;                    // invalidated on resize/scroll, see S3.resize

  const S3 = (FT.scene3d = {});

  /* ======================================================================
     QUALITY GOVERNOR
     The scene has to stay interactive on an operations-room laptop as well as
     a workstation, so quality is a measured feedback loop rather than a guess:
     a rolling frame-time estimate walks a 5-step ladder (pixel ratio, rain veil,
     alley network, water-mesh cadence, detail-tile resolution). "auto" holds the
     frame time inside the 45–75 fps band; the fixed presets pin a rung so a
     demonstration looks identical on every machine.
     ====================================================================== */
  const LADDER = [
    /* 0 = best */ { pr: 2.0, rain: true, minor: true, waterDt: 0.10, detail: 1024 },
    /*         */ { pr: 1.5, rain: true, minor: true, waterDt: 0.10, detail: 1024 },
    /*         */ { pr: 1.25, rain: true, minor: true, waterDt: 0.15, detail: 1024 },
    /*         */ { pr: 1.0, rain: true, minor: false, waterDt: 0.20, detail: 512 },
    /* 4 = smoothest */ { pr: 0.85, rain: false, minor: false, waterDt: 0.30, detail: 512 },
  ];
  const Q = {
    mode: "auto",          // auto | ultra | high | balanced | smooth
    step: 1,
    ema: 16.7,             // ms between presented frames (vsync-limited)
    work: 6,               // ms of CPU work inside S3.render — the headroom signal
    hold: 0,               // seconds before the next step is allowed
    probe: 0,              // ema at the moment of the last degrade (0 = no experiment running)
    freeze: 0,             // seconds of stand-down after a degrade that did not help
    rain: true, minor: true, waterDt: 0.10, detail: 1024,
  };
  S3.quality = Q;
  const MODE_STEP = { ultra: 0, high: 1, balanced: 3, smooth: 4 };
  function applyStep(i) {
    const s = LADDER[U.clamp(i, 0, LADDER.length - 1) | 0];
    Q.step = i;
    Q.rain = s.rain; Q.minor = s.minor; Q.waterDt = s.waterDt;
    if (Q.detail !== s.detail) { Q.detail = s.detail; if (DQ.cv) { DQ.cv.width = DQ.cv.height = s.detail; DQ.key = ""; } }
    if (renderer) renderer.setPixelRatio(Math.min(s.pr, window.devicePixelRatio || 1));
    if (renderer) S3.resize();
    /* The chrome is a sixth rung of the same ladder. Every translucent surface floating
       over this canvas costs the compositor a backdrop re-blur EVERY frame, because the
       canvas under it is never the same twice. Once the governor has started shedding
       scene detail, that cost buys nothing an operator wants, so the glass goes too. */
    document.body.classList.toggle("perfLite", Q.step >= 3);
  }
  /* Frame delta alone cannot detect headroom: with vsync on, a scene using 3 ms and one
     using 15 ms both present every 16.7 ms. So the ladder climbs only when frames are
     ALSO being presented on time AND the work inside render() is comfortably short.

     It also cannot tell WHOSE fault a slow frame is. A backgrounded tab, or the SWE
     solver churning through a large sim-time step at 90 min/s, both stretch the frame
     without the renderer being to blame — and dropping resolution would not help. So a
     degrade is treated as an experiment: if the frame time does not actually improve,
     the step is handed back and auto-tuning stands down for a while. */
  function adaptQuality(dtReal, workMs) {
    if (document.hidden) return;               // rAF is throttled; the numbers mean nothing
    Q.ema += ((dtReal * 1000) - Q.ema) * 0.05;
    Q.work += (workMs - Q.work) * 0.05;
    if (Q.mode !== "auto") return;
    Q.hold -= dtReal;
    if (Q.freeze > 0) { Q.freeze -= dtReal; return; }
    if (Q.hold > 0) return;
    if (Q.probe) {
      /* judge the experiment we ran one hold ago */
      const helped = Q.ema < Q.probe * 0.92;
      Q.probe = 0;
      if (!helped) { applyStep(Q.step - 1); Q.freeze = 25; return; }
    }
    if (Q.ema > 21 && Q.step < LADDER.length - 1) { Q.probe = Q.ema; applyStep(Q.step + 1); Q.hold = 3; }
    else if (Q.ema < 17.8 && Q.work < 7 && Q.step > 0) { applyStep(Q.step - 1); Q.hold = 6; }
  }
  S3.setQuality = function (mode) {
    Q.mode = mode;
    Q.probe = 0; Q.freeze = 0;
    if (mode === "auto") { Q.hold = 1.5; return; }
    applyStep(MODE_STEP[mode] !== undefined ? MODE_STEP[mode] : 1);
  };

  /* vertical exaggeration — the operator's explicit, displayed choice (1.0 = true 1:1) */
  S3.vertEx = 1.0;
  S3.setVertEx = function (f) { S3.vertEx = U.clamp(Number(f) || 1, 0.5, 5); };

  /* Water rendering: 0 = legend depth bands (the operational default — colour IS the
     depth class), 1 = natural appearance for presentation, where colour no longer maps
     to a band. Never make 1 the default: it would break the read-the-legend contract. */
  S3.waterStyle = 0;
  S3.setWaterStyle = function (v) {
    S3.waterStyle = v ? 1 : 0;
    if (waterMat) waterMat.uniforms.uNatural.value = S3.waterStyle;
    if (S3.waterStyle && FT.notify) FT.notify("Mặt nước: chế độ trình bày - màu không còn tra được độ sâu", "warn");
  };

  /* ---------------------------------------------------------------------
     SCALE CONTRACT — everything below is metric and honest.
     1 scene unit = 1 km. M2U converts metres to scene units, so geometry is
     built at TRUE 1:1 (a 30 m building is 0.03 units tall, a 4.5 m car is
     0.0045 units long). Vertical exaggeration is NOT baked into geometry —
     it is a single `scene.scale.y` the operator chooses (default 1:1), so the
     rendered relief always matches a stated, visible factor.
     Previously elevToY() baked a silent 1.5× exaggeration and features were
     lifted off the ground by 15–100 m to dodge z-fighting; both are gone.
     Coplanar surfaces now use polygonOffset (a depth-buffer bias, zero
     geometric error) plus a sub-metre lift. --------------------------------- */
  const M2U = 0.001;                     // 1 m → scene units (1 unit = 1 km)
  /* sub-metre lifts, in metres, purely to order coplanar draped surfaces */
  const LIFT = { detail: 0.35, water: 0.45, road: 0.7, minor: 0.55, bridge: 6 };
  /* depth-bias pairs (factor, units) — larger negative = drawn "closer" */
  const PO = { detail: -3, water: -6, road: -9, minor: -8 };
  function poly(mat, kind) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = PO[kind];
    mat.polygonOffsetUnits = PO[kind];
    return mat;
  }
  function elevToY(m) { return m * M2U; }
  /* ground elevation: high-res real DEM when loaded, else the sim grid */
  function terrAt(x, y) { return FT.geo && FT.geo.hasDEM ? FT.geo.elevAt(x, y) : W.sampleTerrain(x, y); }

  /* ======================================================================
     SOLAR POSITION — the scene is lit by where the sun actually is over the
     basin at the simulated timestamp, not by a fixed studio key light.
     NOAA low-precision algorithm (±0.01° over 1950–2050), which is far tighter
     than anything the render needs. Basin centroid; the domain is ~96 km across,
     so a single position is correct to a few hundredths of a degree corner-to-corner.
     ====================================================================== */
  const BASIN_LAT = 15.73, BASIN_LON = 108.0, ICT_OFFSET_H = 7;   // Indochina Time, UTC+7
  const RAD = Math.PI / 180;
  function solarPosition(simHours) {
    /* U.clock() builds the scenario timestamp with Date.UTC() but the anchor hour is
       local Vietnamese wall time, so the calendar fields ARE local — shift back to
       true UTC before the astronomy. */
    const c = U.clock(simHours);
    const jd = c.dt.getTime() / 86400000 + 2440587.5 - ICT_OFFSET_H / 24;
    const n = jd - 2451545.0;                                  // days since J2000.0
    const L = (280.460 + 0.9856474 * n) * RAD;                 // mean longitude
    const g = (357.528 + 0.9856003 * n) * RAD;                 // mean anomaly
    const lam = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;   // ecliptic longitude
    const eps = (23.439 - 0.0000004 * n) * RAD;                // obliquity
    const dec = Math.asin(Math.sin(eps) * Math.sin(lam));      // declination
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    const gmst = (18.697374558 + 24.06570982441908 * n) % 24;  // Greenwich mean sidereal time, h
    const lst = ((gmst + BASIN_LON / 15) % 24 + 24) % 24;
    let ha = lst * 15 * RAD - ra;                              // hour angle
    ha = Math.atan2(Math.sin(ha), Math.cos(ha));               // wrap to ±π
    const lat = BASIN_LAT * RAD;
    const alt = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
    const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha));
    return { alt, az };                                        // radians; az from true north, clockwise
  }
  /* scene axes: +X east, +Z south, +Y up → unit vector pointing AT the sun */
  function sunVector(alt, az) {
    const ca = Math.cos(alt);
    return new THREE.Vector3(ca * Math.sin(az), Math.sin(alt), -ca * Math.cos(az));
  }

  let sunLight, hemiLight, fillLight;
  let sunDirW = null, sunColW = null, sunUp = 1;
  S3.sun = { alt: 0, az: 0, enabled: true };
  const SUN_NIGHT = 0x030811, SUN_DAY = 0x0d2135, SUN_DUSK = 0x2a1a26;
  const cTmpA = { a: null, b: null, c: null };
  /* Drive every light, the sky and the water specular from the real solar position at
     the simulated instant. Turn it off (S3.setSunLighting(false)) to get the previous
     fixed studio key light — useful when comparing screenshots across timestamps. */
  function updateSun(simHours, rainF) {
    if (!sunLight) return;
    if (!sunDirW) {
      sunDirW = new THREE.Vector3(0.4, 0.8, 0.4);
      sunColW = new THREE.Color();
      cTmpA.a = new THREE.Color(); cTmpA.b = new THREE.Color(); cTmpA.c = new THREE.Color();
    }
    if (!S3.sun.enabled) {
      sunLight.position.set(70, 110, -60);
      sunLight.color.setHex(0xffd9a8); sunLight.intensity = 1.25;
      hemiLight.intensity = 0.85; fillLight.intensity = 0.35;
      sunUp = 1; sunDirW.set(0.45, 0.75, -0.4).normalize(); sunColW.setHex(0xffd9a8);
      return;
    }
    const p = solarPosition(simHours);
    S3.sun.alt = p.alt; S3.sun.az = p.az;
    const dir = sunVector(p.alt, p.az);
    sunDirW.copy(dir);
    /* the light is placed far along the sun vector — a DirectionalLight only reads direction */
    sunLight.position.copy(dir).multiplyScalar(400);
    sunLight.target.position.set(SZ / 2, 0, SZ / 2);
    sunLight.target.updateMatrixWorld();

    const s = Math.sin(p.alt);
    sunUp = U.clamp(s, 0, 1);
    /* atmospheric extinction: the low sun is dimmer and much redder (longer air mass) */
    const day = U.clamp((s + 0.09) / 0.35, 0, 1);              // 0 below civil twilight, 1 by ~20°
    const warm = 1 - U.clamp(s / 0.5, 0, 1);                   // 1 at the horizon, 0 above 30°
    sunColW.setRGB(1.0, U.lerp(0.98, 0.52, warm), U.lerp(0.94, 0.26, warm));
    sunLight.color.copy(sunColW);
    /* the storm deck also cuts direct beam — overcast is diffuse, not directional */
    sunLight.intensity = (0.10 + 1.30 * day) * (1 - 0.55 * rainF);
    /* NIGHT FLOOR — a flood room works through the night, so the basemap must stay
       readable at 03:00. Ambient never falls below the level where terrain, roads and
       the flood edge are legible; only the direct beam and the colour cast follow the
       sun. This is a deliberate legibility floor, not a claim about real illumination. */
    hemiLight.intensity = 0.62 + 0.48 * day;
    hemiLight.color.setRGB(U.lerp(0.42, 0.74, day), U.lerp(0.50, 0.85, day), U.lerp(0.66, 1.0, day));
    fillLight.intensity = 0.22 + 0.22 * day;
    fillLight.position.copy(dir).multiplyScalar(-300).setY(180);

    /* sky: night → day, with a warm band while the sun sits near the horizon */
    cTmpA.a.setHex(SUN_NIGHT); cTmpA.b.setHex(SUN_DAY); cTmpA.c.setHex(SUN_DUSK);
    skyClear.copy(cTmpA.a).lerp(cTmpA.b, day);
    const dusk = U.clamp(1 - Math.abs(s) / 0.22, 0, 1) * 0.55;
    skyClear.lerp(cTmpA.c, dusk);

    if (waterMat) {
      waterMat.uniforms.uSunDir.value.copy(dir);
      waterMat.uniforms.uSunCol.value.copy(sunColW);
      /* same night floor: the flood sheet is the decision surface, it never goes black */
      waterMat.uniforms.uSunUp.value = 0.55 + 0.45 * day;
    }
  }
  S3.setSunLighting = function (on) {
    S3.sun.enabled = !!on;
    updateSun(FT.state.timeH, 0);
  };

  const CAMS = {
    overview: { pos: [58, 98, 128], tgt: [55, 0, 40] },
    delta: { pos: [82, 16, 60], tgt: [74, 0, 33] },
    dams: { pos: [8, 22, 62], tgt: [30, 2, 42] },
    hoian: { pos: [94, 9, 66], tgt: [86, 0, 40] },
  };

  /* ============ terrain ============ */
  const imTmp = [0, 0, 0];
  /* high-detail branch: 320² mesh straight from the real DEM + satellite drape */
  function buildTerrainHiRes() {
    const TN = 384;
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
  let wSampX = null, wSampY = null;                        // precomputed bilinear indices into the sim grid
  function buildWater() {
    const N = W.N;
    const SZk = D.DOMAIN.sizeKm;
    waterGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(WN * WN * 3);
    const depth = new Float32Array(WN * WN);
    const flow = new Float32Array(WN * WN * 2);
    const over = new Float32Array(WN * WN);                // 1 = floodplain (sediment-laden when flooded)
    wSampX = new Float32Array(WN); wSampY = new Float32Array(WN);
    for (let i = 0; i < WN; i++) { wSampX[i] = (i / (WN - 1)) * (N - 1); wSampY[i] = wSampX[i]; }
    for (let iy = 0; iy < WN; iy++) {
      for (let ix = 0; ix < WN; ix++) {
        const k = iy * WN + ix, o = k * 3;
        pos[o] = (ix / (WN - 1)) * SZk; pos[o + 1] = 0; pos[o + 2] = (iy / (WN - 1)) * SZk;
        const ks = Math.round(wSampY[iy]) * N + Math.round(wSampX[ix]);
        over[k] = !W.sea[ks] && W.riverDist[ks] > 0.9 ? 1 : 0;
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
    waterGeo.setAttribute("aFlow", new THREE.BufferAttribute(flow, 2));
    waterGeo.setAttribute("aOver", new THREE.BufferAttribute(over, 1));
    waterGeo.setIndex(idx);

    waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uGhost: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.4) },   // world-space, toward the sun
        uSunCol: { value: new THREE.Color(1, 0.94, 0.86) },
        uSunUp: { value: 1 },                                   // sin(solar altitude), clamped ≥0
        uNatural: { value: 0 },                                 // 0 = depth bands (operational), 1 = natural water
      },
      vertexShader: `
        attribute float aDepth;
        attribute vec2 aFlow;
        attribute float aOver;
        varying float vDepth;
        varying vec2 vFlow;
        varying float vOver;
        varying vec3 vPos;
        varying vec3 vView;
        void main() {
          vDepth = aDepth;
          vFlow = aFlow;
          vOver = aOver;
          vPos = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform float uGhost;
        uniform vec3 uSunDir;
        uniform vec3 uSunCol;
        uniform float uSunUp;
        uniform float uNatural;
        varying float vDepth;
        varying vec2 vFlow;
        varying float vOver;
        varying vec3 vPos;
        varying vec3 vView;
        void main() {
          if (vDepth < 0.015) discard;
          float spd = length(vFlow);
          /* shimmer advected along flow - capillary ripples riding the depth-averaged velocity */
          vec2 fdir = spd > 0.01 ? vFlow / spd : vec2(0.7, 0.7);
          float phase = dot(vPos.xz, fdir) * 3.6 - uTime * (0.8 + spd * 2.2);
          float shimmer = sin(phase) * 0.5 + sin(vPos.x * 5.2 + vPos.z * 4.4 + uTime * 1.3) * 0.5;
          shimmer *= 0.5;
          /* discrete depth bands matching the 2D map legend (flood-density classes).
             Bands, not a ramp: an operator reads a class, never interpolates a hue. */
          vec3 c1 = vec3(0.54, 0.82, 0.93);
          vec3 c2 = vec3(0.34, 0.66, 0.89);
          vec3 c3 = vec3(0.16, 0.44, 0.81);
          vec3 c4 = vec3(0.08, 0.24, 0.64);
          vec3 c5 = vec3(0.13, 0.10, 0.48);
          vec3 col = c1;
          col = mix(col, c2, step(0.15, vDepth));
          col = mix(col, c3, step(0.5, vDepth));
          col = mix(col, c4, step(1.0, vDepth));
          col = mix(col, c5, step(2.0, vDepth));
          /* natural-appearance mode: attenuation with depth instead of legend bands */
          vec3 nat = mix(vec3(0.32, 0.45, 0.44), vec3(0.05, 0.13, 0.19), smoothstep(0.1, 2.5, vDepth));
          col = mix(col, nat, uNatural);
          /* overbank floodwater carries sediment - mix toward muddy ochre */
          vec3 mud = vec3(0.42, 0.33, 0.20);
          float mudF = vOver * smoothstep(0.08, 0.6, vDepth) * (0.65 + 0.2 * uNatural);
          col = mix(col, mud, mudF);
          col += shimmer * 0.06;
          vec3 V = normalize(vView);
          /* fresnel rim - grazing angles reflect the sky, as real water does */
          float fres = pow(1.0 - abs(V.y), 3.0);
          col += fres * vec3(0.25, 0.4, 0.5) * 0.55 * (0.35 + 0.65 * uSunUp);
          /* specular sun glint off the perturbed surface (Blinn-Phong about the up normal,
             tilted by the ripple field) - this is what ties the water to the real sun angle */
          vec3 N = normalize(vec3(shimmer * 0.06 + fdir.x * spd * 0.02, 1.0, shimmer * 0.05 + fdir.y * spd * 0.02));
          vec3 Hv = normalize(uSunDir + V);
          float spec = pow(max(dot(N, Hv), 0.0), 90.0) * uSunUp;
          col += uSunCol * spec * 0.85;
          /* diffuse tint so the sheet darkens at dusk instead of glowing at midnight */
          col *= 0.30 + 0.70 * uSunUp;
          /* foam: shoreline + fast flow */
          float foam = smoothstep(0.02, 0.05, vDepth) * (1.0 - smoothstep(0.05, 0.14, vDepth)) * 0.55;
          foam += smoothstep(2.5, 3.8, spd) * 0.4;
          foam += smoothstep(0.75, 0.95, fract(shimmer + spd * 0.5)) * smoothstep(2.2, 3.4, spd) * 0.25;
          col = mix(col, vec3(0.88, 0.95, 1.0) * (0.4 + 0.6 * uSunUp), clamp(foam, 0.0, 0.75));

          /* Flood edge: a steady, legible waterline (the wetted boundary is a decision
             surface - it must not pulse or shift hue, which reads as changing data). */
          float edge = smoothstep(0.012, 0.04, vDepth) * (1.0 - smoothstep(0.04, 0.16, vDepth));
          col = mix(col, vec3(0.62, 0.92, 1.0), edge * 0.5 * (1.0 - uNatural));

          float alpha = clamp(0.25 + vDepth * 0.55 + edge * 0.30, 0.0, 0.95);
          /* cận cảnh: nước nông trong hơn để lộ nền đất/đường thật bên dưới */
          alpha *= 1.0 - uGhost * (1.0 - smoothstep(0.3, 1.2, vDepth)) * 0.38;
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    poly(waterMat, "water");
    waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.renderOrder = 2;
    scene.add(waterMesh);
  }

  function updateWater() {
    const N = W.N;
    const pos = waterGeo.attributes.position.array;
    const dep = waterGeo.attributes.aDepth.array;
    const flow = waterGeo.attributes.aFlow.array;
    const T = W.terrain, Hh = W.h, Uu = W.u, Vv = W.v;
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
        const t = T[a] * w00 + T[b] * w10 + T[c] * w01 + T[d] * w11;
        const k = iy * WN + ix, o = k * 3;
        if (h > 0.02) {
          /* the free surface sits at its TRUE elevation (terrain + depth); the
             sub-metre lift only breaks the depth tie with the draped basemap */
          pos[o + 1] = elevToY(t + h + LIFT.water);
          dep[k] = h;
        } else {
          pos[o + 1] = elevToY(t - 0.5);
          dep[k] = 0;
        }
        flow[k * 2] = Uu[a] * w00 + Uu[b] * w10 + Uu[c] * w01 + Uu[d] * w11;
        flow[k * 2 + 1] = Vv[a] * w00 + Vv[b] * w10 + Vv[c] * w01 + Vv[d] * w11;
      }
    }
    waterGeo.attributes.position.needsUpdate = true;
    waterGeo.attributes.aDepth.needsUpdate = true;
    waterGeo.attributes.aFlow.needsUpdate = true;
  }

  /* ============ roads ============ */
  /* REAL OSM roads → draped ribbons with per-chunk flood-status colours */
  function buildOsmRoads() {
    const osm = FT.geo.osmRoads;
    if (!osm) return;
    if (S3._roadMesh) { scene.remove(S3._roadMesh); S3._roadMesh.geometry.dispose(); }
    const HALFW = { mw: 0.22, pri: 0.16, sec: 0.11 };
    const posArr = [];
    roadRanges = [];
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
        const yy = elevToY(Math.max(0.2, terrAt(x, y)) + LIFT.road);
        const p1 = [x + px, yy, y + py], p2 = [x - px, yy, y - py];
        if (prev) posArr.push(...prev[0], ...prev[1], ...p1, ...p1, ...prev[1], ...p2);
        prev = [p1, p2];
      }
      roadRanges.push({ e: s, start, count: posArr.length / 3 - start, lastCls: -1 });
    }
    roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(posArr), 3));
    roadColors = new Float32Array((posArr.length / 3) * 4);
    roadGeo.setAttribute("color", new THREE.BufferAttribute(roadColors, 4));
    const mesh = new THREE.Mesh(roadGeo, poly(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true }), "road"));
    mesh.renderOrder = 3;
    scene.add(mesh);
    S3._roadMesh = mesh;
    updateRoadColors(true, 0);
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
          a[0], elevToY(Math.max(0.2, terrAt(a[0], a[1])) + LIFT.minor), a[1],
          b[0], elevToY(Math.max(0.2, terrAt(b[0], b[1])) + LIFT.minor), b[1]
        );
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    minorLines = new THREE.LineSegments(g, poly(new THREE.LineBasicMaterial({ color: 0xd9dee4, transparent: true, opacity: 0.5 }), "minor"));
    minorLines.renderOrder = 2;
    minorLines.visible = false;
    scene.add(minorLines);
    console.info(`[3d] OSM minor - ${pos.length / 6} đoạn đường nhỏ/hẻm`);
  }

  function buildRoads() {
    const HALF = { exp: 0.30, hw: 0.23, prov: 0.17, urban: 0.13 };
    const posArr = [], colArr = [];
    roadRanges = [];
    for (const e of W.roads.edges) {
      const a = W.roads.nodes[e.a], b = W.roads.nodes[e.b];
      const len = e.len, steps = Math.max(2, Math.ceil(len / 0.25));
      const half = HALF[e.type] || 0.06;
      const startIdx = posArr.length / 3;
      const yA = elevToY(Math.max(0.5, terrAt(a.x, a.y)) + LIFT.road);
      const yB = elevToY(Math.max(0.5, terrAt(b.x, b.y)) + LIFT.road);
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
        /* a real bridge deck clears the design flood by a few metres — not 120 m */
        if (e.bridge) yy = Math.max(yA, yB) + elevToY(LIFT.bridge);
        else yy = elevToY(Math.max(0.2, terrAt(x, y)) + LIFT.road);
        const p1 = [x + pxn, yy, y + pyn], p2 = [x - pxn, yy, y - pyn];
        if (prev) {
          posArr.push(...prev[0], ...prev[1], ...p1, ...p1, ...prev[1], ...p2);
        }
        prev = [p1, p2];
      }
      roadRanges.push({ e, start: startIdx, count: posArr.length / 3 - startIdx, lastCls: -1 });
    }
    roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(posArr), 3));
    roadColors = new Float32Array((posArr.length / 3) * 4);
    roadGeo.setAttribute("color", new THREE.BufferAttribute(roadColors, 4));
    const mat = poly(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true }), "road");
    const mesh = new THREE.Mesh(roadGeo, mat);
    mesh.renderOrder = 3;
    scene.add(mesh);
    S3._roadMesh = mesh;
    updateRoadColors(true, 0);
  }

  const ROAD_RGB = [[0.30, 0.85, 0.48], [1.0, 0.84, 0.31], [1.0, 0.58, 0.25], [1.0, 0.30, 0.30]];
  const OSM_OPEN_RGB = { mw: [0.95, 0.85, 0.55], pri: [0.9, 0.9, 0.88], sec: [0.75, 0.77, 0.8] };
  let roadCloseF = 0;                       // 0 = xa (ribbon đầy đủ) · 1 = sát (đường mở nhường chỗ cho đường thật trên ảnh)
  let cfAcc = 9, wAcc = 9, lodAcc = 9;      // throttle rebuild nặng, cập nhật nước & LOD nhà
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
  /* Built at TRUE size: a 4.6 m × 1.9 m × 1.6 m car. At basin overview that is a
     fraction of a pixel, so `vehLod` (set each frame from camera distance) inflates
     them just enough to stay legible and relaxes to exactly 1.0 at street zoom.
     The inflation is a symbol size, never a claim about the vehicle's footprint. */
  function buildVehicles() {
    const geo = new THREE.BoxGeometry(4.6 * M2U, 1.6 * M2U, 1.9 * M2U);
    geo.translate(0, 0.8 * M2U, 0);                      // wheels on the road, not sunk into it
    const mat = new THREE.MeshLambertMaterial();
    vehMesh = new THREE.InstancedMesh(geo, mat, 160);
    vehMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    vehDummy = new THREE.Object3D();
    vehColor = new THREE.Color();
    scene.add(vehMesh);
  }
  let vehLod = 1;
  function updateVehicles() {
    const vs = FT.traffic.vehicles || [];
    const n = Math.min(vs.length, 160);
    for (let i = 0; i < 160; i++) {
      if (i < n && vs[i].x !== undefined) {
        const v = vs[i];
        const y = elevToY(Math.max(0.3, terrAt(v.x, v.y)) + LIFT.road);
        vehDummy.position.set(v.x, y, v.y);
        vehDummy.rotation.set(0, -v.heading, 0);
        const s = (v.type === "moto" ? 0.5 : v.type === "truck" || v.type === "bus" ? 1.35 : 1) * vehLod;
        vehDummy.scale.set(s, vehLod, s);
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

  /* ======================================================================
     SPATIAL INDEX — 1 km buckets over the road network and the building set.
     Two jobs: aligning building footprints to the real street grid at build time
     (the naive nearest-segment search was O(placements × edges) and stalled the tab
     for seconds with ~9 500 placements), and naming the feature under the cursor
     without raycasting a 147 k-triangle terrain or a 9 500-instance mesh.
     ====================================================================== */
  const IDX = { cell: 1.0, roads: null, bldg: null };
  function bucket(map, x, y, rec) {
    const k = Math.floor(x / IDX.cell) + "," + Math.floor(y / IDX.cell);
    let a = map.get(k);
    if (!a) map.set(k, (a = []));
    a.push(rec);
  }
  function buildRoadIndex() {
    if (IDX.roads) return;
    const map = new Map();
    for (const e of W.roads.edges) {
      const a = W.roads.nodes[e.a], b = W.roads.nodes[e.b];
      const rec = { ax: a.x, ay: a.y, dx: b.x - a.x, dy: b.y - a.y, ang: Math.atan2(b.y - a.y, b.x - a.x) };
      rec.L2 = rec.dx * rec.dx + rec.dy * rec.dy || 1e-9;
      /* stamp the segment into every cell its bounding box touches */
      const x0 = Math.floor(Math.min(a.x, b.x) / IDX.cell), x1 = Math.floor(Math.max(a.x, b.x) / IDX.cell);
      const y0 = Math.floor(Math.min(a.y, b.y) / IDX.cell), y1 = Math.floor(Math.max(a.y, b.y) / IDX.cell);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const k = cx + "," + cy;
        let arr = map.get(k);
        if (!arr) map.set(k, (arr = []));
        arr.push(rec);
      }
    }
    IDX.roads = map;
  }
  const NO_ROAD = { d: 1e9, ang: 0 };
  function nearestRoad(x, y, maxRing) {
    if (!IDX.roads) return NO_ROAD;
    let best = 1e9, ang = 0;
    const cx = Math.floor(x / IDX.cell), cy = Math.floor(y / IDX.cell);
    for (let r = 1; r <= (maxRing || 4); r++) {            // widen the ring until a road is found
      for (let jy = cy - r; jy <= cy + r; jy++) {
        for (let jx = cx - r; jx <= cx + r; jx++) {
          const arr = IDX.roads.get(jx + "," + jy);
          if (!arr) continue;
          for (const s of arr) {
            const t = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.L2));
            const d = Math.hypot(x - (s.ax + t * s.dx), y - (s.ay + t * s.dy));
            if (d < best) { best = d; ang = s.ang; }
          }
        }
      }
      if (best < 1e9) break;
    }
    return { d: best, ang };
  }
  function buildBldgIndex() {
    const map = new Map();
    for (const p of bldgPlacements) bucket(map, p[0], p[2], p);
    if (osmBldg) for (const rr of osmBldg.ranges) bucket(map, rr.cx, rr.cy, rr);
    IDX.bldg = map;
  }
  function nearestBldg(x, y) {
    if (!IDX.bldg) return 1e9;
    let best = 1e9;
    const cx = Math.floor(x / IDX.cell), cy = Math.floor(y / IDX.cell);
    for (let jy = cy - 1; jy <= cy + 1; jy++) {
      for (let jx = cx - 1; jx <= cx + 1; jx++) {
        const arr = IDX.bldg.get(jx + "," + jy);
        if (!arr) continue;
        for (const p of arr) {
          const px = p[0] !== undefined ? p[0] : p.cx, py = p[2] !== undefined ? p[2] : p.cy;
          const d = Math.hypot(x - px, y - py);
          if (d < best) best = d;
        }
      }
    }
    return best;
  }

  /* ============ cities ============ */
  /* Buildings are built at TRUE metric size: the base box is 1 m × 1 m in plan and
     1 unit tall, so an instance scaled (footprintM, heightUnits, footprintM) is exactly
     that many metres on the ground. `bldgLod` inflates the whole block symbol at basin
     range so the urban fabric stays readable, and relaxes to 1.0 (true 1:1) by ~8 km. */
  function buildCities() {
    const geo = new THREE.BoxGeometry(M2U, 1, M2U);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshLambertMaterial({
      color: 0x37b6ff,
      emissive: 0x0a2840,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    let count = 0;
    const placements = [];
    buildRoadIndex();
    const roadAngle = (x, y) => nearestRoad(x, y).ang;
    const im = FT.geo && FT.geo.imageryData;
    const patches = (FT.geo && FT.geo.detailPatches) || [];
    const inPatch = (x, y) => patches.some((p) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1);
    if (im) {
      /* REAL built-up detection: bright, low-chroma satellite pixels = buildings/streets */
      const S = im.width, dat = im.data;
      const SZ2 = D.DOMAIN.sizeKm;
      const stepPx = 3;                                     // ≈125 m sampling
      const rng = U.mulberry(4242);
      for (let py = 2; py < S - 2 && count < 6000; py += stepPx) {
        for (let px = 2; px < S - 2 && count < 6000; px += stepPx) {
          const o = (py * S + px) * 4;
          const r = dat[o], g = dat[o + 1], b = dat[o + 2];
          const bright = (r + g + b) / 3;
          const chroma = Math.max(r, g, b) - Math.min(r, g, b);
          if (bright < 118 || chroma > 34 || b > r + 14) continue;   // keep bright gray, drop veg/water
          const x = (px / S) * SZ2, y = (py / S) * SZ2;
          if (inPatch(x, y)) continue;                      // đô thị: pass tinh bên dưới lo
          const te = W.sampleTerrain(x, y);
          if (te > 60 || te < 0.25) continue;
          if (rng() < 0.45) continue;                       // thin out
          const pop = W.pop[W.km2i(y) * W.N + W.km2i(x)];
          const tall = pop > 260 && rng() < 0.18;
          const hM = tall ? 22 + rng() * 34 : 5 + rng() * 9; // metres
          /* 14 m frontage ≈ a Vietnamese tube-house block seen from the air */
          placements.push([x + (rng() - 0.5) * 0.08, elevToY(te), y + (rng() - 0.5) * 0.08, hM * M2U, roadAngle(x, y), 14]);
          count++;
        }
      }
      /* pass TINH trong 5 cửa sổ đô thị: ảnh z14 gốc ~9 m/px → nhà đặt đúng dãy phố, chân đế thật ~18 m
         (bỏ qua khi đã có móng nhà OSM thật) */
      const rng2 = U.mulberry(1337);
      for (const p of skipPatchProcedural ? [] : patches) {
        let pd = null;
        try { pd = p.canvas.getContext("2d").getImageData(0, 0, p.canvas.width, p.canvas.height); } catch (e) { continue; }
        const PW = pd.width, PH = pd.height, dd = pd.data;
        const kmPx = (p.x1 - p.x0) / PW;
        const step = Math.max(1, Math.round(0.018 / kmPx));  // mẫu ~18 m
        for (let py = 1; py < PH - 1 && count < 9500; py += step) {
          for (let px = 1; px < PW - 1 && count < 9500; px += step) {
            const o = (py * PW + px) * 4;
            const r = dd[o], g = dd[o + 1], b = dd[o + 2];
            if (dd[o + 3] < 200) continue;                  // tile chưa nạp
            const bright = (r + g + b) / 3;
            const chroma = Math.max(r, g, b) - Math.min(r, g, b);
            if (bright < 122 || chroma > 36 || b > r + 12) continue;
            if (rng2() < 0.35) continue;
            const x = p.x0 + px * kmPx, y = p.y0 + py * kmPx;
            const te = W.sampleTerrain(x, y);
            if (te > 60 || te < 0.25) continue;
            const pop = W.pop[W.km2i(y) * W.N + W.km2i(x)];
            const tall = pop > 300 && rng2() < 0.1;
            const hM = tall ? 20 + rng2() * 30 : 4.5 + rng2() * 7;
            /* z14 urban windows resolve individual plots — ~12 m, and pinned to true
               scale (flag at [6]) so zooming out never inflates them past reality */
            placements.push([x, elevToY(te), y, hM * M2U, roadAngle(x, y), 12, 1]);
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
          const hM = (c.id === "danang" && rng() < 0.12 ? 45 + rng() * 55 : 6 + rng() * 14);
          placements.push([x, elevToY(te), y, hM * M2U, undefined, 14]);
          count++;
        }
      }
    }
    cityMesh = new THREE.InstancedMesh(geo, mat, count);
    bldgPlacements = placements;
    const baseC = new THREE.Color(0x9aa4ad);
    for (let i = 0; i < count; i++) cityMesh.setColorAt(i, baseC);
    bldgLodApplied = -1;
    writeBuildingMatrices(1);
    scene.add(cityMesh);
    buildBldgIndex();
  }

  /* Cartographic LOD, not a size fudge: instances are true 1:1 whenever the camera is
     inside ~8 km (where an operator judges real geometry against the imagery) and are
     inflated up to 6× beyond that purely so the urban fabric stays visible from basin
     range. Plots resolved from z14 imagery ([6] flag) are pinned to true scale always. */
  let bldgLodApplied = -1;
  function writeBuildingMatrices(lod) {
    const dummy = new THREE.Object3D();
    for (let i = 0; i < bldgPlacements.length; i++) {
      const p = bldgPlacements[i];
      const L = p[6] ? 1 : lod;
      const f = (p[5] || 14) * L * M2U;
      dummy.position.set(p[0], p[1], p[2]);
      dummy.scale.set(f, p[3] * L, f);
      dummy.rotation.y = p[4] !== undefined ? -p[4] : (i % 7) * 0.22;
      dummy.updateMatrix();
      cityMesh.setMatrixAt(i, dummy.matrix);
    }
    cityMesh.instanceMatrix.needsUpdate = true;
    bldgLodApplied = lod;
  }
  function updateBuildingScale(lod) {
    if (!cityMesh || !bldgPlacements.length) return;
    if (Math.abs(lod - bldgLodApplied) < 0.15) return;   // rewriting ~9 500 matrices is not free
    writeBuildingMatrices(lod);
  }

  /* ---------- REAL OSM building footprints (extruded) — swap in khi dữ liệu về ---------- */
  let osmBldg = null;                 // { mesh, ranges:[{cx,cy,start,count,last}] }
  let skipPatchProcedural = false;
  function buildOsmBuildingsMesh() {
    const fps = FT.geo && FT.geo.osmBuildings;
    if (!fps || !fps.length) return;
    const pos = [], col = [], idx = [], ranges = [];
    const rng = U.mulberry(77);
    for (const fp of fps) {
      const n = fp.pts.length;
      const te = terrAt(fp.cx, fp.cy);
      if (te > 60 || te < 0.2) continue;
      const y0 = elevToY(Math.max(0.25, te));
      const hM = 4 + rng() * 6 + (n > 12 ? 5 : 0);
      const y1 = y0 + hM * M2U;              // real footprint + real storey height = true 1:1
      const vStart = pos.length / 3;
      for (const p of fp.pts) pos.push(p[0], y0, p[1]);
      for (const p of fp.pts) pos.push(p[0], y1, p[1]);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        idx.push(vStart + i, vStart + j, vStart + n + i, vStart + n + i, vStart + j, vStart + n + j);
      }
      const cIdx = pos.length / 3;
      pos.push(fp.cx, y1, fp.cy);
      for (let i = 0; i < n; i++) idx.push(vStart + n + i, vStart + n + ((i + 1) % n), cIdx);
      const vCount = pos.length / 3 - vStart;
      for (let i = 0; i < vCount; i++) col.push(0.62, 0.65, 0.68);
      ranges.push({ cx: fp.cx, cy: fp.cy, start: vStart, count: vCount, last: -1 });
    }
    if (!ranges.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    scene.add(mesh);
    osmBldg = { mesh, ranges };
    buildBldgIndex();
    console.info(`[3d] OSM buildings - ${ranges.length} nhà thật`);
  }
  function swapOsmBuildings() {
    if (!FT.geo || !FT.geo.hasOSMBldg) return;
    /* bỏ nhà procedural trong cửa sổ đô thị (đã có nhà thật), giữ vùng ngoài */
    skipPatchProcedural = true;
    if (cityMesh) { scene.remove(cityMesh); cityMesh.geometry.dispose(); cityMesh = null; }
    buildCities();
    bldgLodApplied = -1;               // ép áp lại LOD theo khoảng cách camera hiện tại
    buildOsmBuildingsMesh();
  }

  /* ---------- human impact: buildings recoloured by 4 flood hazard tiers ---------- */
  let bldgPlacements = [], bldgClock = 9;
  S3.homesFlooded = 0;
  function updateBuildingImpact(dtReal) {
    if (!cityMesh || !bldgPlacements.length) return;
    bldgClock += dtReal;
    if (bldgClock < 0.5) return;
    bldgClock = 0;
    const cRed = new THREE.Color(0xe74c3c);   // Critical (>= 1.5m)
    const cOrg = new THREE.Color(0xe67e22);   // Heavy (0.5m - 1.5m)
    const cYel = new THREE.Color(0xf1c40f);   // Mild (0.15m - 0.5m)
    const cBase = new THREE.Color(0x8a99a8);  // Normal (< 0.15m)
    let flooded = 0;
    const impactOn = FT.state.layers.impact;
    for (let i = 0; i < bldgPlacements.length; i++) {
      const p = bldgPlacements[i];
      const d = W.sampleExcess(p[0], p[2]);
      let c = cBase;
      if (impactOn) {
        if (d >= 1.5) { c = cRed; flooded++; }
        else if (d >= 0.5) { c = cOrg; flooded++; }
        else if (d >= 0.15) { c = cYel; flooded++; }
      }
      cityMesh.setColorAt(i, c);
    }
    if (cityMesh.instanceColor) cityMesh.instanceColor.needsUpdate = true;
    /* nhà OSM thật: tô lại theo độ ngập từng móng (theo dải màu tác động 4 cấp) */
    let osmFlooded = 0;
    if (osmBldg) {
      const colA = osmBldg.mesh.geometry.attributes.color;
      let dirty = false;
      for (const rr of osmBldg.ranges) {
        const d = W.sampleExcess(rr.cx, rr.cy);
        const cls = !impactOn ? 0 : d >= 1.5 ? 3 : d >= 0.5 ? 2 : d >= 0.15 ? 1 : 0;
        if (cls > 0) osmFlooded++;
        if (cls === rr.last) continue;
        rr.last = cls;
        const c = cls === 3 ? cRed : cls === 2 ? cOrg : cls === 1 ? cYel : null;
        for (let i = rr.start; i < rr.start + rr.count; i++) {
          if (c) { colA.array[i * 3] = c.r; colA.array[i * 3 + 1] = c.g; colA.array[i * 3 + 2] = c.b; }
          else { colA.array[i * 3] = 0.62; colA.array[i * 3 + 1] = 0.65; colA.array[i * 3 + 2] = 0.68; }
        }
        dirty = true;
      }
      if (dirty) colA.needsUpdate = true;
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
      const te = terrAt(r.x, r.y);
      const baseY = elevToY(Math.max(2, te));
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
      dams.push({ r, g, barFill, jet, jp, jetPhase: new Float32Array(jetN).map((_, i) => i / jetN), baseY });
    }
    scene.add(damGroup);
  }
  function updateDams(snap, dt) {
    for (const d of dams) {
      const rs = snap.reservoirs[d.r.id];
      const pct = Math.min(1.05, rs.pct);
      d.barFill.scale.y = Math.max(0.02, pct * 1.1);
      d.barFill.position.y = d.baseY + 0.68 + (pct * 1.1 - 1.1) * 0.5;
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
      const te = terrAt(g.x, g.y);
      const y = elevToY(Math.max(1, te));
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
      gauges.push({ g, grp, disc });
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
      it.disc.scale.setScalar((sel ? 1.5 : 1) * pulse);
      it.grp.visible = FT.state.layers.gauges;
    }
  }

  /* ============ zone rings ============ */
  let zoneRings = [];
  const Z_HEX = [0x4fc3f7, 0xffd54f, 0xffa040, 0xff5252];
  function buildZones() {
    for (const z of D.ZONES) {
      const te = Math.max(1, W.sampleTerrain(z.x, z.y));
      const geo = new THREE.RingGeometry(z.r * 0.94, z.r, 48);
      const mat = new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(z.x, elevToY(te) + 0.05, z.y);
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
    const on = FT.state.layers.rain && Q.rain && snap.rain > 6;
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
      el.className = `mapCalloutBadge ${cls}`;
      el.innerHTML = `<span>${txt}</span><span class="checkIcon">✔</span>`;
      if (selection) {
        el.type = "button";
        el.dataset.explainKind = selection.kind;
        el.dataset.explainId = selection.id;
        /* the accessible name is a function of (kind, name, language) — none of which change
           between frames — so it is written once here instead of once per label per frame */
        el.setAttribute("aria-label", `${FT.i18n.t(`explain.label.${selection.kind}`)}: ${txt}`);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
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
  function updateLabels(snap) {
    if (!labels.length) return;
    const show = FT.state.layers.labels;
    const v = tmpV.v || (tmpV.v = new THREE.Vector3());
    /* cached: getBoundingClientRect() forces a synchronous layout, and this ran once
       per frame purely to read a size that only changes on resize */
    const rect = canvasRect || (canvasRect = renderer.domElement.getBoundingClientRect());
    const camDist = camera.position.distanceTo(controls.target);
    const sy2 = scene.scale.y;
    for (const L of labels) {
      const off = !show || (L.nearDist && camDist > L.nearDist);
      if (off) { if (!L.off) { L.off = true; L.el.style.display = "none"; } continue; }
      const te = terrAt(L.x, L.z);
      v.set(L.x, elevToY(Math.max(1, te)) * sy2 + L.elevOff * Math.max(sy2, 0.35), L.z);
      v.project(camera);
      if (v.z > 1 || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) {
        if (!L.off) { L.off = true; L.el.style.display = "none"; }
        continue;
      }
      if (L.off) { L.off = false; L.el.style.display = ""; }
      /* transform, not left/top: a compositor-only property. Writing left/top put every
         visible label into the layout tree on every frame, so a camera nudge with ~80
         labels up cost 80 layout invalidations per frame for a purely visual move. */
      L.el.style.transform =
        `translate3d(${(((v.x + 1) / 2) * rect.width).toFixed(1)}px, ${(((1 - v.y) / 2) * rect.height).toFixed(1)}px, 0) translate(-50%, -100%)`;
      /* gauges: live stage + alert colour on the label itself */
      if (L.gaugeId) {
        const gs = snap.gauges[L.gaugeId];
        const txt = `${L.name} ${U.fmt(gs.stage, 1)} m`;
        if (L.txt !== txt) { L.txt = txt; L.el.firstChild.textContent = txt; }
        /* keep the badge class — writing the bare legacy `label3d gauge…` here used to
           strip .mapCalloutBadge off gauge labels one frame after they were built, so
           gauges silently rendered in a different style from every other callout */
        const cls = `mapCalloutBadge gauge${gs.alert ? ` gauge-${gs.alert}` : ""}`;
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

  /* ---------------------------------------------------------------------
     GROUND INTERSECTION by ray-marching the DEM, not by raycasting the mesh.
     The terrain is a 384² grid (≈294 k triangles) with no BVH, so `intersectObject`
     costs tens of milliseconds — enough to visibly stall an orbit when it ran on
     every pointermove. Marching the height field instead costs a few hundred
     bilinear DEM samples, and is *more* accurate: it queries the full-resolution
     DEM rather than the decimated render mesh. Hits the water surface where the
     solver has water, the bare ground elsewhere.
     ------------------------------------------------------------------- */
  let elevSpan = null;
  function elevRange() {
    if (elevSpan) return elevSpan;
    let lo = 1e9, hi = -1e9;
    for (let iy = 0; iy <= 48; iy++) for (let ix = 0; ix <= 48; ix++) {
      const e = terrAt((ix / 48) * SZ, (iy / 48) * SZ);
      if (e < lo) lo = e; if (e > hi) hi = e;
    }
    return (elevSpan = { lo: lo - 30, hi: hi + 120 });
  }
  function surfaceYAt(x, z) {
    const t = terrAt(x, z);
    const h = W.sampleExcess(x, z);
    return elevToY(t + (h > 0.02 ? h : 0)) * scene.scale.y;
  }
  function marchGround() {
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    /* clip the march to the domain footprint … */
    let t0 = 0, t1 = 500;
    const axis = (oc, dc) => {
      if (Math.abs(dc) < 1e-7) return oc >= 0 && oc <= SZ;
      let a = (0 - oc) / dc, b = (SZ - oc) / dc;
      if (a > b) { const s = a; a = b; b = s; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      return true;
    };
    if (!axis(o.x, d.x) || !axis(o.z, d.z) || t1 <= t0) return null;
    /* … and to the elevation band the terrain can actually occupy */
    const R = elevRange(), sy = scene.scale.y;
    const yLo = elevToY(R.lo) * sy, yHi = elevToY(R.hi) * sy;
    if (Math.abs(d.y) > 1e-7) {
      const a = (yLo - o.y) / d.y, b = (yHi - o.y) / d.y;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    } else if (o.y < yLo || o.y > yHi) return null;
    if (t1 <= t0) return null;

    const STEPS = 256;
    const step = (t1 - t0) / STEPS;
    let prevT = t0, prevAbove = (o.y + d.y * t0) - surfaceYAt(o.x + d.x * t0, o.z + d.z * t0) > 0;
    for (let i = 1; i <= STEPS; i++) {
      const t = t0 + step * i;
      const x = o.x + d.x * t, z = o.z + d.z * t;
      const above = (o.y + d.y * t) - surfaceYAt(x, z) > 0;
      if (prevAbove && !above) {
        let lo = prevT, hi = t;                       // bisect to ~(t1-t0)/2²⁰ ≈ sub-metre
        for (let k = 0; k < 18; k++) {
          const m = (lo + hi) * 0.5;
          if ((o.y + d.y * m) - surfaceYAt(o.x + d.x * m, o.z + d.z * m) > 0) lo = m; else hi = m;
        }
        const m = (lo + hi) * 0.5;
        return { x: o.x + d.x * m, y: o.y + d.y * m, z: o.z + d.z * m };
      }
      prevAbove = above; prevT = t;
    }
    return null;
  }

  function resolveRay(clientX, clientY) {
    rayFromClient(clientX, clientY);
    const entityHits = raycaster.intersectObjects([damGroup, gaugeGroup, ...zoneRings.map((item) => item.ring)], true);
    for (const hit of entityHits) {
      if (!visibleThroughParents(hit.object)) continue;
      const selection = selectorFromHit(hit.object);
      if (selection) return selection;
    }
    const p = marchGround();
    if (!p) return null;
    const xKm = U.clamp(p.x, 0, SZ), yKm = U.clamp(p.z, 0, SZ);
    return { kind: "point", xKm, yKm };
  }

  function selectRay(clientX, clientY, pointerType) {
    const selection = resolveRay(clientX, clientY);
    if (!selection) return;
    canvas.dataset.lastExplainPointer = pointerType || "mouse";
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

  /* ============ 3D GIS Inspector & Hover Indicator ============ */
  let hoverRing = null;
  function buildHoverRing() {
    const geo = new THREE.RingGeometry(0.12, 0.22, 32);
    geo.rotateX(-Math.PI / 2);
    /* the one locked interaction colour (--accent #37b6ff), not a neon cyan */
    const mat = new THREE.MeshBasicMaterial({ color: 0x37b6ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false });
    hoverRing = new THREE.Mesh(geo, mat);
    hoverRing.renderOrder = 5;
    hoverRing.visible = false;
    scene.add(hoverRing);
  }

  function build3dHud() {
    const wrap = document.getElementById("stageWrap");
    if (!wrap) return;

    if (!document.getElementById("inspector3d")) {
      const hud = document.createElement("div");
      hud.id = "inspector3d";
      hud.className = "inspector3d";
      wrap.appendChild(hud);
    }

    if (!document.getElementById("compass3d")) {
      const compass = document.createElement("button");
      compass.id = "compass3d";
      compass.className = "compass3d";
      compass.type = "button";
      compass.title = "Click để xoay về hướng Bắc (North-up)";
      compass.innerHTML = `
        <div class="compassDial" id="compassDial3d">
          <span class="compassN">N</span>
          <span class="compassArrow" aria-hidden="true">▲</span>
        </div>
      `;
      compass.addEventListener("click", () => S3.resetHeading());
      wrap.appendChild(compass);
    }

    if (!document.getElementById("scaleBar3d")) {
      const scale = document.createElement("div");
      scale.id = "scaleBar3d";
      scale.className = "scaleBar3d";
      scale.innerHTML = `
        <div class="scaleLine" id="scaleBarLine3d"></div>
        <span class="scaleText" id="scaleBarText3d">1 km</span>
      `;
      wrap.appendChild(scale);
    }
  }

  let inspectPending = false, inspectLastEv = null;
  function doInspectPointer(ev) {
    if (!renderer || FT.state.view !== "3d") return;
    const rect = canvas.getBoundingClientRect();
    if (ev.clientX < rect.left || ev.clientX > rect.right || ev.clientY < rect.top || ev.clientY > rect.bottom) {
      if (hoverRing) hoverRing.visible = false;
      const hud = document.getElementById("inspector3d");
      if (hud) hud.classList.remove("active");
      return;
    }
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    rayPointer.set(x, y);
    raycaster.setFromCamera(rayPointer, camera);

    /* entity pick against the handful of small symbol meshes only; ground comes from
       the DEM march (see marchGround) so the hover never touches the big meshes */
    let hitObj = null;
    const entityHits = raycaster.intersectObjects([damGroup, gaugeGroup].filter(Boolean), true);
    for (const h of entityHits) {
      if (visibleThroughParents(h.object)) { hitObj = h.object; break; }
    }
    const hitPoint = marchGround();

    const hud = document.getElementById("inspector3d");
    if (!hitPoint) {
      if (hoverRing) hoverRing.visible = false;
      if (hud) hud.classList.remove("active");
      return;
    }

    const xKm = U.clamp(hitPoint.x, 0, SZ), yKm = U.clamp(hitPoint.z, 0, SZ);
    const dem = terrAt(xKm, yKm);
    const depth = W.sampleExcess(xKm, yKm);
    const wElev = dem + depth;
    const [lon, lat] = FT.geo ? FT.geo.km2ll(xKm, yKm) : [107.55 + (xKm / 96) * 0.9, 16.16 - (yKm / 96) * 0.86];

    if (hoverRing) {
      hoverRing.position.set(xKm, elevToY(Math.max(dem, wElev)) + 0.02, yKm);
      hoverRing.visible = true;
    }

    let hazardTxt = "An toàn", hazardClass = "safe";
    if (depth >= 1.5) { hazardTxt = "Cực kỳ nguy hiểm (≥1.5m)"; hazardClass = "critical"; }
    else if (depth >= 0.5) { hazardTxt = "Ngập nặng (0.5m-1.5m)"; hazardClass = "heavy"; }
    else if (depth >= 0.15) { hazardTxt = "Ngập nhẹ (15cm-50cm)"; hazardClass = "mild"; }
    else if (depth > 0.02) { hazardTxt = "Nước nông (<15cm)"; hazardClass = "caution"; }

    let featName = depth > 0.02 ? "Mặt nước lũ" : "Mặt đất / Thung lũng";
    const sel = hitObj ? selectorFromHit(hitObj) : null;
    if (sel) {
      if (sel.kind === "reservoir") { const r = D.RESERVOIRS.find((item) => item.id === sel.id); featName = `Hồ chứa ${r ? r.name : sel.id}`; }
      else if (sel.kind === "gauge") { const g = D.GAUGES.find((item) => item.id === sel.id); featName = `Trạm quan trắc ${g ? g.name : sel.id}`; }
      else if (sel.kind === "zone") { const z = D.ZONES.find((item) => item.id === sel.id); featName = `Vùng giám sát ${z ? z.name : sel.id}`; }
    } else {
      /* proximity naming off the spatial index — real distances in metres, and it
         costs one bucket lookup instead of a raycast through 9 500 instances */
      const dRoad = nearestRoad(xKm, yKm, 2).d, dBldg = nearestBldg(xKm, yKm);
      if (dBldg < 0.03) featName = `Tòa nhà / khu dân cư · cách ${Math.round(dBldg * 1000)} m`;
      else if (dRoad < 0.05) featName = `Tuyến giao thông · cách ${Math.round(dRoad * 1000)} m`;
    }

    if (hud) {
      hud.classList.add("active");
      hud.innerHTML = `
        <div class="inspItem"><span class="inspLabel">${FT.icon("map-pin")} Tọa độ</span><strong>${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E</strong></div>
        <div class="inspDivider"></div>
        <div class="inspItem"><span class="inspLabel">${FT.icon("mountains")} Cao trình DEM</span><strong>${U.fmt(dem, 1)} m</strong></div>
        <div class="inspDivider"></div>
        <div class="inspItem"><span class="inspLabel">${FT.icon("waves")} Mực nước</span><strong>${U.fmt(wElev, 1)} m</strong></div>
        <div class="inspDivider"></div>
        <div class="inspItem"><span class="inspLabel">${FT.icon("warning")} Độ sâu ngập</span><strong class="inspBadge ${hazardClass}">${U.fmt(depth, 2)} m (${hazardTxt})</strong></div>
        <div class="inspDivider"></div>
        <div class="inspItem"><span class="inspLabel">${FT.icon("buildings")} Đối tượng</span><strong>${featName}</strong></div>
      `;
    }
  }

  /* Hover readout is gated to 20 Hz and suppressed while the camera is being dragged:
     a readout for a viewpoint the operator is still moving away from is noise, and the
     frames during an orbit are exactly the ones that must stay cheap. */
  let inspectLastRun = 0;
  function onPointerMoveInspect(ev) {
    if (!renderer || FT.state.view !== "3d") return;
    if (ev.buttons) { inspectLastEv = null; return; }
    inspectLastEv = ev;
    if (inspectPending) return;
    const now = performance.now();
    const wait = Math.max(0, 50 - (now - inspectLastRun));
    inspectPending = true;
    const run = () => {
      inspectPending = false;
      inspectLastRun = performance.now();
      if (inspectLastEv) doInspectPointer(inspectLastEv);
    };
    if (wait > 0) setTimeout(run, wait); else requestAnimationFrame(run);
  }

  function bindInspectorPointer() {
    window.addEventListener("pointermove", onPointerMoveInspect, { passive: true });
  }

  /* 2D <-> 3D Camera Sync & Control Helpers */
  S3.getCam = function () {
    if (!controls || !camera) return null;
    return {
      x: controls.target.x,
      z: controls.target.z,
      dist: camera.position.distanceTo(controls.target),
      heading: controls.getAzimuthalAngle(),
      pitch: controls.getPolarAngle(),
    };
  };

  S3.syncFrom2D = function (xKm, yKm, scale2d) {
    if (!controls || !camera) return;
    const te = elevToY(terrAt(xKm, yKm));
    controls.target.set(xKm, te, yKm);
    const targetDist = U.clamp(2800 / (scale2d || 14), 6, 180);
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    if (dir.lengthSq() < 0.001) dir.set(0.2, 0.8, 0.6).normalize();
    camera.position.copy(controls.target).add(dir.multiplyScalar(targetDist));
    controls.update();
  };

  S3.resetHeading = function () {
    if (!controls || !camera) return;
    const dist = camera.position.distanceTo(controls.target);
    const pitch = Math.max(0.3, Math.min(1.4, controls.getPolarAngle()));
    const yOff = dist * Math.cos(pitch);
    const zOff = dist * Math.sin(pitch);
    camera.position.set(controls.target.x, controls.target.y + yOff, controls.target.z + zOff);
    controls.update();
    FT.notify && FT.notify("3D Camera: Đã xoay về hướng Bắc (North-up)", "info");
  };

  /* Legacy entry point (ui.js "Chế độ Mượt" button) — now a shortcut into the
     quality ladder so there is a single source of truth for render load. */
  S3.setPerfMode = function (on) {
    S3.setQuality(on ? "smooth" : "auto");
  };

  /* ============ dynamic close-zoom detail (live slippy tiles draped on terrain — Google-Earth style) ============ */
  const DQ = { mesh: null, cv: null, ctx: null, tex: null, N: 64, acc: 9, key: "", pending: 0 };
  function ensureDetail() {
    if (DQ.mesh || !FT.geo || !FT.geo.hasImagery || !FT.geo.tile) return;
    DQ.cv = document.createElement("canvas");
    DQ.cv.width = DQ.cv.height = Q.detail;
    DQ.ctx = DQ.cv.getContext("2d");
    DQ.tex = new THREE.CanvasTexture(DQ.cv);
    DQ.tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const N = DQ.N, V = N + 1;
    const pos = new Float32Array(V * V * 3);
    const uv = new Float32Array(V * V * 2);
    const idx = [];
    for (let iy = 0; iy < V; iy++) {
      for (let ix = 0; ix < V; ix++) {
        const k = iy * V + ix;
        uv[k * 2] = ix / N; uv[k * 2 + 1] = 1 - iy / N;
      }
    }
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const a = iy * V + ix, b = a + 1, c2 = a + V, d2 = c2 + 1;
        idx.push(a, c2, b, b, c2, d2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    /* Lambert, not Basic: the close-zoom drape has to be lit by the same sun as the terrain
       it sits on. Unlit, it stayed at full daylight brightness while the surrounding basin
       darkened — a bright rectangle floating over a dusk valley, and blown out under tone
       mapping. Now the seam is invisible at every hour. */
    DQ.mesh = new THREE.Mesh(g, poly(new THREE.MeshLambertMaterial({ map: DQ.tex }), "detail"));
    DQ.mesh.renderOrder = 1;
    DQ.mesh.visible = false;
    DQ.mesh.frustumCulled = false;          // bỏ tính boundingSphere mỗi lần cập nhật (đỡ hitch)
    scene.add(DQ.mesh);
    S3._dq = DQ;
  }
  /* camera settle detector: redrawing a 1024² canvas and re-uploading the texture mid-orbit
     is the single biggest hitch in the frame budget, and the result is stale by the time it
     lands. Wait until the camera has been still for ~180 ms. */
  const CamStill = { x: 0, y: 0, z: 0, still: 0 };
  function cameraSettled(dt) {
    const p = camera.position;
    const moved = Math.hypot(p.x - CamStill.x, p.y - CamStill.y, p.z - CamStill.z);
    CamStill.x = p.x; CamStill.y = p.y; CamStill.z = p.z;
    CamStill.still = moved > 0.02 ? 0 : CamStill.still + dt;
    return CamStill.still > 0.18;
  }
  function updateDetail(dt) {
    DQ.acc += dt;
    const settled = cameraSettled(dt);
    ensureDetail();
    if (!DQ.mesh) return;
    const dist = camera.position.distanceTo(controls.target);
    if (dist > 34) { DQ.mesh.visible = false; DQ.key = ""; return; }
    if (DQ.acc < 0.35 || !settled) return;
    const G2 = FT.geo, SZk = G2.SZ, tm = G2.tileMath;
    const S = U.clamp(dist * 1.15, 1.1, 30);
    const cx = U.clamp(controls.target.x, 0, SZk), cy = U.clamp(controls.target.z, 0, SZk);
    const x0 = U.clamp(cx - S / 2, 0, SZk - S), y0 = U.clamp(cy - S / 2, 0, SZk - S);
    const mpp = (S * 1000) / 1024;
    const latMid = G2.km2ll(cx, cy)[1];
    let z = Math.round(Math.log2((156543 * Math.cos((latMid * Math.PI) / 180)) / mpp));
    z = Math.max(13, Math.min(19, z));
    const key = `${z}|${x0.toFixed(2)}|${y0.toFixed(2)}|${S.toFixed(2)}`;
    const keySame = key === DQ.key;
    if (keySame && !DQ.pending) return;
    if (keySame && DQ.acc < 0.55) return;   // chỉ chờ tile nạp nốt → cadence chậm hơn, đỡ giật
    DQ.acc = 0;
    DQ.key = key;
    if ((DQ.logs = (DQ.logs || 0) + 1) <= 5) console.info(`[3d] detail z${z} · ${S.toFixed(1)} km · cam ${dist.toFixed(1)}`);
    /* base: baked equirect canvas (đã gồm z14 đô thị + giao thông) — không bao giờ trống */
    const CN = DQ.cv.width;
    const ctx = DQ.ctx, ps = CN / S, bs = G2.imagery.width / SZk;
    ctx.drawImage(G2.imagery, x0 * bs, y0 * bs, S * bs, S * bs, 0, 0, CN, CN);
    for (const p of G2.detailPatches || []) {
      if (p.x1 < x0 || p.x0 > x0 + S || p.y1 < y0 || p.y0 > y0 + S) continue;
      ctx.drawImage(p.canvas, (p.x0 - x0) * ps, (p.y0 - y0) * ps, (p.x1 - p.x0) * ps, (p.y1 - p.y0) * ps);
    }
    /* live tiles ảnh + giao thông (cùng cache/retry với 2D), vá tile cha khi đang tải */
    DQ.pending = 0;
    const nw = G2.km2ll(x0, y0), se = G2.km2ll(x0 + S, y0 + S);
    const tx0 = Math.floor(tm.lon2t(nw[0], z)), tx1 = Math.floor(tm.lon2t(se[0], z));
    const ty0 = Math.floor(tm.lat2t(nw[1], z)), ty1 = Math.floor(tm.lat2t(se[1], z));
    let budget = 200;
    for (const layer of ["img", "rd", "pl"]) {
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
      for (let iy = 0; iy < V; iy++) {
        for (let ix = 0; ix < V; ix++) {
          const o = (iy * V + ix) * 3;
          const xk = x0 + (ix / DQ.N) * S, yk = y0 + (iy / DQ.N) * S;
          posA.array[o] = xk;
          posA.array[o + 1] = elevToY(terrAt(xk, yk) + LIFT.detail);
          posA.array[o + 2] = yk;
        }
      }
      posA.needsUpdate = true;
      DQ.mesh.geometry.computeVertexNormals();   // relief shading follows the DEM, not a flat plane
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
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    /* filmic response so the high dynamic range between a noon glint and a dusk valley
       lands inside display range instead of clipping to white */
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x081726);
    scene.fog = new THREE.Fog(0x081726, 150, 420);
    skyClear = new THREE.Color(0x081726);
    skyStorm = new THREE.Color(0x1c232c);
    skyTmp = new THREE.Color();

    /* near plane 50 m (was 500 m — it clipped geometry at street zoom, where the
       controls allow the camera within 1.2 km of its target) */
    camera = new THREE.PerspectiveCamera(46, 1.6, 0.05, 600);
    camera.position.set(...CAMS.overview.pos);

    controls = new window.OrbitControls(camera, cv);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.zoomToCursor = true;           // zoom về phía con trỏ như Google Maps
    controls.maxPolarAngle = 1.45;
    controls.minDistance = 1.2;
    controls.maxDistance = 220;
    controls.target.set(...CAMS.overview.tgt);
    raycaster = new THREE.Raycaster();
    rayPointer = new THREE.Vector2();

    hemiLight = new THREE.HemisphereLight(0xbcd8ff, 0x18261f, 0.85);
    scene.add(hemiLight);
    sunLight = new THREE.DirectionalLight(0xffd9a8, 1.25);
    sunLight.position.set(70, 110, -60);
    scene.add(sunLight);
    fillLight = new THREE.DirectionalLight(0x6f9fd8, 0.35);
    fillLight.position.set(-70, 70, 95);
    scene.add(fillLight);
    updateSun(FT.state.timeH, 0);

    buildTerrain();
    buildWater();
    buildRoads();
    buildVehicles();
    buildCities();
    buildDams();
    buildGauges();
    buildZones();
    buildRain();
    buildLabels();
    bindSelection();
    buildHoverRing();
    build3dHud();
    bindInspectorPointer();

    const ro = new ResizeObserver(() => S3.resize());
    ro.observe(cv);
    S3.resize();
    FT.bus.on("osmRoads", () => { try { buildOsmRoads(); } catch (e) { console.warn("osm 3d roads", e); } });
    FT.bus.on("osmBuildings", () => { try { swapOsmBuildings(); } catch (e) { console.warn("osm 3d bldg", e); } });
    FT.bus.on("osmMinor", () => { try { buildOsmMinor(); } catch (e) { console.warn("osm 3d minor", e); } });
  };

  S3.resize = function () {
    if (!renderer) return;
    const r = canvas.getBoundingClientRect();
    canvasRect = r;
    if (r.width < 4 || r.height < 4) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  };

  S3.setCamera = function (preset) {
    const c = CAMS[preset];
    if (!c || !camera) return;
    flyFrom = { pos: camera.position.clone(), tgt: controls.target.clone() };
    flyTo = c;
    flyT = 0;
    FT.state.camPreset = preset;
    const titles = {
      overview: "Toàn cảnh: lưu vực Vu Gia - Thu Bồn",
      delta: "Hạ lưu: đồng bằng Vu Gia và Cửa Đại",
      dams: "Bậc thang 4 hồ: A Vương, Sông Bung 4, Đắk Mi 4, Sông Tranh 2",
      hoian: "Đô thị cổ Hội An: khu vực ngập trọng điểm",
    };
    if (titles[preset] && FT.notify) FT.notify(titles[preset], "info");
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
      candidates.push(new THREE.Vector3(selection.xKm, elevToY(Math.max(1, terrAt(selection.xKm, selection.yKm))) * scene.scale.y, selection.yKm));
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
      if (document.elementFromPoint(target.x, target.y) !== canvas) continue;
      if (selection.kind === "point") return target;
      const resolved = resolveRay(target.x, target.y);
      if (resolved && resolved.kind === selection.kind && resolved.id === selection.id) return target;
    }
    return null;
  };

  /* fly close to a world point (zone drill-down) */
  /* ============ Section 4: Cinematic Camera Tour ============ */
  let tourActive = false, tourTime = 0, tourCallback = null;
  S3.runCinematicDemo = function (onComplete) {
    if (!camera || !controls) return;
    tourActive = true;
    tourTime = 0;
    tourCallback = onComplete || null;
    FT.notify && FT.notify("Đang chạy trình diễn camera (9 giây)", "info");
  };

  function updateCinematicTour(dt) {
    if (!tourActive || !camera || !controls) return;
    tourTime += dt;
    let p1, p2, t;
    if (tourTime <= 3.0) {
      t = tourTime / 3.0;
      const ease = t * t * (3 - 2 * t);
      p1 = CAMS.overview.pos; p2 = CAMS.delta.pos;
      const t1 = CAMS.overview.tgt, t2 = CAMS.delta.tgt;
      camera.position.set(p1[0] + (p2[0] - p1[0]) * ease, p1[1] + (p2[1] - p1[1]) * ease, p1[2] + (p2[2] - p1[2]) * ease);
      controls.target.set(t1[0] + (t2[0] - t1[0]) * ease, t1[1] + (t2[1] - t1[1]) * ease, t1[2] + (t2[2] - t1[2]) * ease);
    } else if (tourTime <= 6.0) {
      t = (tourTime - 3.0) / 3.0;
      const ease = t * t * (3 - 2 * t);
      p1 = CAMS.delta.pos; p2 = CAMS.dams.pos;
      const t1 = CAMS.delta.tgt, t2 = CAMS.dams.tgt;
      camera.position.set(p1[0] + (p2[0] - p1[0]) * ease, p1[1] + (p2[1] - p1[1]) * ease, p1[2] + (p2[2] - p1[2]) * ease);
      controls.target.set(t1[0] + (t2[0] - t1[0]) * ease, t1[1] + (t2[1] - t1[1]) * ease, t1[2] + (t2[2] - t1[2]) * ease);
    } else if (tourTime <= 9.0) {
      t = (tourTime - 6.0) / 3.0;
      const ease = t * t * (3 - 2 * t);
      p1 = CAMS.dams.pos; p2 = CAMS.hoian.pos;
      const t1 = CAMS.dams.tgt, t2 = CAMS.hoian.tgt;
      camera.position.set(p1[0] + (p2[0] - p1[0]) * ease, p1[1] + (p2[1] - p1[1]) * ease, p1[2] + (p2[2] - p1[2]) * ease);
      controls.target.set(t1[0] + (t2[0] - t1[0]) * ease, t1[1] + (t2[1] - t1[1]) * ease, t1[2] + (t2[2] - t1[2]) * ease);
    } else {
      tourActive = false;
      if (tourCallback) tourCallback();
      FT.notify && FT.notify("Đã hoàn thành trình diễn camera", "success");
    }
  }

  S3.render = function (dtReal, snap) {
    if (!renderer) return;
    const t0 = performance.now();
    clock += dtReal;
    if (tourActive) updateCinematicTour(dtReal);
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
    }
    controls.update();
    const rainF = Math.min(1, snap.rain / 110);
    /* sun first — it writes skyClear, which the storm blend below starts from */
    sunAcc += dtReal;
    if (sunAcc > 0.25) { sunAcc = 0; updateSun(FT.state.timeH, rainF); }
    /* storm atmosphere: sky darkens & visibility closes in with rain intensity */
    if (skyTmp) {
      skyTmp.copy(skyClear).lerp(skyStorm, rainF * (0.35 + 0.65 * sunUp));
      scene.background.copy(skyTmp);
      scene.fog.color.copy(skyTmp);
      scene.fog.near = 150 - 60 * rainF;
      scene.fog.far = 420 - 160 * rainF;
    }
    waterMat.uniforms.uTime.value = clock;
    /* street-zoom realism: đường mở & nước nông nhường chỗ cho mặt đất thật */
    const camD = camera.position.distanceTo(controls.target);
    const cf = U.clamp((26 - camD) / 12, 0, 1);
    waterMat.uniforms.uGhost.value = cf;
    /* vertical exaggeration is the operator's explicit choice, never baked into geometry.
       1.0 = true 1:1; the chosen factor is shown on the map-control bar. */
    scene.scale.y = S3.vertEx;
    /* symbol LOD — true 1:1 close in, inflated only at basin range (see writeBuildingMatrices) */
    vehLod = U.clamp(camD / 6, 1, 26);
    /* 3D Navigation HUD update */
    const compassDial = document.getElementById("compassDial3d");
    if (compassDial) {
      const azm = controls.getAzimuthalAngle();
      compassDial.style.transform = `rotate(${-azm}rad)`;
    }
    const scaleLine = document.getElementById("scaleBarLine3d");
    const scaleText = document.getElementById("scaleBarText3d");
    if (scaleLine && scaleText) {
      const fovRad = (camera.fov * Math.PI) / 180;
      const visibleKmAt100px = (2 * camD * Math.tan(fovRad / 2)) * (100 / (renderer.domElement.clientWidth || 1000));
      if (visibleKmAt100px < 1) {
        scaleText.textContent = `${Math.round(visibleKmAt100px * 1000)} m`;
      } else {
        scaleText.textContent = `${U.fmt(visibleKmAt100px, 1)} km`;
      }
    }
    /* rebuild nặng (ma trận nhà + màu đường) dồn về nhịp 0,25s và ngưỡng 0,08 — zoom không còn khựng */
    cfAcc += dtReal;
    let cfJump = false;
    if (cfAcc >= 0.25 && Math.abs(cf - roadCloseF) > 0.08) {
      cfAcc = 0; cfJump = true; roadCloseF = cf;
    }
    lodAcc += dtReal;
    if (lodAcc >= 0.3) { lodAcc = 0; updateBuildingScale(U.clamp(camD / 8, 1, 6)); }
    waterMesh.visible = FT.state.layers.water;
    /* nước: mặt/độ sâu đổi theo sim (Δt 2.5 s) — 10 Hz là đủ, shimmer đã chạy bằng uTime.
       Nhịp giãn ra khi bộ điều tiết chất lượng hạ cấp (Q.waterHz). */
    wAcc += dtReal;
    if (waterMesh.visible && wAcc >= Q.waterDt) { wAcc = 0; updateWater(); }
    updateRoadColors(cfJump, clock);
    S3._roadMesh.visible = FT.state.layers.roads;
    minorLines && (minorLines.visible = FT.state.layers.roads && camD < 32 && Q.minor);
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
    renderer.render(scene, camera);
    adaptQuality(dtReal, performance.now() - t0);
  };
})();
