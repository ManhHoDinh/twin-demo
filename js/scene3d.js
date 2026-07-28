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
  const tmpV = { v: null };
  let clock = 0;
  let pointerDownX = 0, pointerDownY = 0, pointerMoved = 0, selectionPointerId = null;

  const S3 = (FT.scene3d = {});
  const WATER_STYLE = {
    permanentWaterColor: "#0d4868",
    simulatedWaterColor: "#56d2f6",
    simulatedCloseOpacity: 0.54,
    simulatedFarOpacity: 0.9,
    boundaryOpacity: 0.76,
    flowOpacity: 0.78,
  };

  /* vertical transform: plains readable, mountains imposing (96 km real domain) */
  function elevToY(m) { return m <= 25 ? m * 0.02 : 0.5 + (m - 25) * 0.007; }
  /* ground elevation: high-res real DEM when loaded, else the sim grid */
  function terrAt(x, y) { return FT.geo && FT.geo.hasDEM ? FT.geo.elevAt(x, y) : W.sampleTerrain(x, y); }

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
    const base = new Float32Array(WN * WN);
    const flow = new Float32Array(WN * WN * 2);
    const over = new Float32Array(WN * WN);                // 1 = floodplain (sediment-laden when flooded)
    const permanent = new Float32Array(WN * WN);           // 1 = sea / normal river water, not simulated overbank
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
    waterGeo.setIndex(idx);

    waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uGhost: { value: 0 } },
      vertexShader: `
        attribute float aDepth;
        attribute float aBase;
        attribute vec2 aFlow;
        attribute float aOver;
        attribute float aPermanent;
        varying float vDepth;
        varying float vBase;
        varying vec2 vFlow;
        varying float vOver;
        varying float vPermanent;
        varying vec3 vPos;
        varying vec3 vView;
        void main() {
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
        varying float vDepth;
        varying float vBase;
        varying vec2 vFlow;
        varying float vOver;
        varying float vPermanent;
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
          vec3 c5 = vec3(0.13, 0.10, 0.48);
          vec3 col = c1;
          col = mix(col, c2, step(0.15, vDepth));
          col = mix(col, c3, step(0.5, vDepth));
          col = mix(col, c4, step(1.0, vDepth));
          col = mix(col, c5, step(2.0, vDepth));
          vec3 natural = vec3(0.05, 0.28, 0.41);
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
          /* cận cảnh: nước nông trong hơn để lộ nền đất/đường thật bên dưới */
          alpha *= 1.0 - uGhost * simulated * 0.40;
          float cue = max(foam, smoothstep(1.2, 3.0, spd) * simulated);
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
        if (h > 0.02) {
          pos[o + 1] = elevToY(t + h * 1.6) + (0.055 - roadCloseF * 0.03);
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
        const yy = elevToY(Math.max(0.2, terrAt(x, y))) + 0.09;
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
    const mesh = new THREE.Mesh(roadGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true }));
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
          a[0], elevToY(Math.max(0.2, terrAt(a[0], a[1]))) + 0.07, a[1],
          b[0], elevToY(Math.max(0.2, terrAt(b[0], b[1]))) + 0.07, b[1]
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
    const posArr = [], colArr = [];
    roadRanges = [];
    for (const e of W.roads.edges) {
      const a = W.roads.nodes[e.a], b = W.roads.nodes[e.b];
      const len = e.len, steps = Math.max(2, Math.ceil(len / 0.25));
      const half = HALF[e.type] || 0.06;
      const startIdx = posArr.length / 3;
      const yA = elevToY(Math.max(0.5, terrAt(a.x, a.y))) + 0.055;
      const yB = elevToY(Math.max(0.5, terrAt(b.x, b.y))) + 0.055;
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
        else yy = elevToY(Math.max(0.2, terrAt(x, y))) + 0.1;
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
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true });
    const mesh = new THREE.Mesh(roadGeo, mat);
    mesh.renderOrder = 3;
    scene.add(mesh);
    S3._roadMesh = mesh;
    updateRoadColors(true, 0);
  }

  const ROAD_RGB = [[0.30, 0.85, 0.48], [1.0, 0.84, 0.31], [1.0, 0.58, 0.25], [1.0, 0.30, 0.30]];
  const OSM_OPEN_RGB = { mw: [0.95, 0.85, 0.55], pri: [0.9, 0.9, 0.88], sec: [0.75, 0.77, 0.8] };
  let roadCloseF = 0;                       // 0 = xa (ribbon đầy đủ) · 1 = sát (đường mở nhường chỗ cho đường thật trên ảnh)
  let cfAcc = 9, wAcc = 9;                  // throttle rebuild nặng & cập nhật nước
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
        const y = elevToY(Math.max(0.3, terrAt(v.x, v.y))) + 0.11;
        vehDummy.position.set(v.x, y, v.y);
        const sV = 1 - roadCloseF * 0.86;
        vehDummy.scale.set(sV, sV, sV);
        vehDummy.rotation.set(0, -v.heading, 0);
        const s = v.type === "moto" ? 0.5 : v.type === "truck" || v.type === "bus" ? 1.3 : 1;
        vehDummy.scale.set(s, 1, s);
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
  function buildCities() {
    const geo = new THREE.BoxGeometry(0.11, 1, 0.11);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x9aa4ad });
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
          placements.push([x + (rng() - 0.5) * 0.08, elevToY(te), y + (rng() - 0.5) * 0.08, hM * 0.02, roadAngle(x, y)]);
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
            placements.push([x, elevToY(te), y, hM * 0.02, roadAngle(x, y), 0.16]);
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
          placements.push([x, elevToY(te), y, h]);
          count++;
        }
      }
    }
    cityMesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    const baseC = new THREE.Color(0x9aa4ad);
    placements.forEach((p, i) => {
      const f = p[5] || 1;                  // p[5]: chân đế thật cố định (nhà đô thị từ ảnh z14)
      dummy.position.set(p[0], p[1], p[2]);
      dummy.scale.set(f, p[3], f);
      dummy.rotation.y = p[4] !== undefined ? -p[4] : (i % 7) * 0.22;
      dummy.updateMatrix();
      cityMesh.setMatrixAt(i, dummy.matrix);
      cityMesh.setColorAt(i, baseC);
    });
    bldgPlacements = placements;
    scene.add(cityMesh);
  }

  /* cận cảnh: co nhà về gần kích thước thật (110 m → ~15 m chân đế) để đúng tỉ lệ với ảnh nền */
  let bldgScaleF = -1;
  function updateBuildingScale(cf) {
    if (!cityMesh || !bldgPlacements.length || Math.abs(cf - bldgScaleF) < 0.05) return;
    bldgScaleF = cf;
    const dummy = new THREE.Object3D();
    const sB = 1 - cf * 0.86;
    bldgPlacements.forEach((p, i) => {
      const f = p[5] ? p[5] : sB;         // nhà đô thị đã đúng cỡ thật → không co thêm theo cf
      dummy.position.set(p[0], p[1], p[2]);
      dummy.scale.set(f, p[3], f);        // cao giữ nguyên — scene.scale.y đã hạ phóng đại dọc toàn cục
      dummy.rotation.y = p[4] !== undefined ? -p[4] : (i % 7) * 0.22;
      dummy.updateMatrix();
      cityMesh.setMatrixAt(i, dummy.matrix);
    });
    cityMesh.instanceMatrix.needsUpdate = true;
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
      const y1 = y0 + hM * 0.02;
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
    console.info(`[3d] OSM buildings — ${ranges.length} nhà thật`);
  }
  function swapOsmBuildings() {
    if (!FT.geo || !FT.geo.hasOSMBldg) return;
    /* bỏ nhà procedural trong cửa sổ đô thị (đã có nhà thật), giữ vùng ngoài */
    skipPatchProcedural = true;
    if (cityMesh) { scene.remove(cityMesh); cityMesh.geometry.dispose(); cityMesh = null; }
    buildCities();
    bldgScaleF = -1;                   // ép áp lại scale theo cf hiện tại
    buildOsmBuildingsMesh();
  }

  /* ---------- human impact: buildings recoloured by flood depth ---------- */
  let bldgPlacements = [], bldgClock = 9;
  S3.homesFlooded = 0;
  function updateBuildingImpact(dtReal) {
    if (!cityMesh || !bldgPlacements.length) return;
    bldgClock += dtReal;
    if (bldgClock < 1) return;
    bldgClock = 0;
    const cRed = new THREE.Color(0xe84a3f), cOrg = new THREE.Color(0xf5a04a), cBase = new THREE.Color(0x9aa4ad);
    let flooded = 0;
    const impactOn = FT.state.layers.impact;
    for (let i = 0; i < bldgPlacements.length; i++) {
      const p = bldgPlacements[i];
      const d = W.sampleExcess(p[0], p[2]);
      let c = cBase;
      if (impactOn && d >= 0.5) { c = cRed; flooded++; }
      else if (impactOn && d >= 0.15) { c = cOrg; flooded++; }
      cityMesh.setColorAt(i, c);
    }
    if (cityMesh.instanceColor) cityMesh.instanceColor.needsUpdate = true;
    /* nhà OSM thật: tô lại theo độ ngập từng móng (theo dải màu tác động) */
    let osmFlooded = 0;
    if (osmBldg) {
      const colA = osmBldg.mesh.geometry.attributes.color;
      let dirty = false;
      for (const rr of osmBldg.ranges) {
        const d = W.sampleExcess(rr.cx, rr.cy);
        const cls = !impactOn ? 0 : d >= 0.5 ? 2 : d >= 0.15 ? 1 : 0;
        if (cls > 0) osmFlooded++;
        if (cls === rr.last) continue;
        rr.last = cls;
        const c = cls === 2 ? cRed : cls === 1 ? cOrg : null;
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
    const rect = renderer.domElement.getBoundingClientRect();
    const camDist = camera.position.distanceTo(controls.target);
    for (const L of labels) {
      if (!show || (L.nearDist && camDist > L.nearDist)) { L.el.style.display = "none"; continue; }
      const te = terrAt(L.x, L.z);
      const sy2 = scene.scale.y;
      v.set(L.x, elevToY(Math.max(1, te)) * sy2 + L.elevOff * Math.max(sy2, 0.35), L.z);
      v.project(camera);
      if (v.z > 1 || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) { L.el.style.display = "none"; continue; }
      L.el.style.display = "";
      L.el.style.left = `${((v.x + 1) / 2) * rect.width}px`;
      L.el.style.top = `${((1 - v.y) / 2) * rect.height}px`;
      if (L.selection) {
        const kind = FT.i18n.t(`explain.label.${L.selection.kind}`);
        L.el.setAttribute("aria-label", `${kind}: ${L.name}`);
      }
      /* gauges: live stage + alert colour on the label itself */
      if (L.gaugeId) {
        const gs = snap.gauges[L.gaugeId];
        const txt = `${L.name} ${U.fmt(gs.stage, 1)} m`;
        if (L.el.textContent !== txt) L.el.textContent = txt;
        const cls = `label3d gauge${gs.alert ? ` gauge-${gs.alert}` : ""}`;
        if (L.el.className !== cls) L.el.className = cls;
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
    const y = elevToY(Math.max(1, terrAt(selectionPulse.x, selectionPulse.y))) + 0.08;
    const s = 1 + t * 1.4;
    selectionRing.position.set(selectionPulse.x, y, selectionPulse.y);
    selectionRing.scale.setScalar(s);
    selectionRing.material.opacity = 0.88 * hold;
    selectionRing.visible = true;
  }

  /* ============ dynamic close-zoom detail (live slippy tiles draped on terrain — Google-Earth style) ============ */
  const DQ = { mesh: null, cv: null, ctx: null, tex: null, N: 64, acc: 9, key: "", pending: 0 };
  function ensureDetail() {
    if (DQ.mesh || !FT.geo || !FT.geo.hasImagery || !FT.geo.tile) return;
    DQ.cv = document.createElement("canvas");
    DQ.cv.width = DQ.cv.height = 1024;
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
    DQ.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: DQ.tex }));
    DQ.mesh.visible = false;
    DQ.mesh.frustumCulled = false;          // bỏ tính boundingSphere mỗi lần cập nhật (đỡ hitch)
    scene.add(DQ.mesh);
    S3._dq = DQ;
  }
  function updateDetail(dt) {
    DQ.acc += dt;
    ensureDetail();
    if (!DQ.mesh) return;
    const dist = camera.position.distanceTo(controls.target);
    if (dist > 34) { DQ.mesh.visible = false; DQ.key = ""; return; }
    if (DQ.acc < 0.35) return;
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
    const ctx = DQ.ctx, ps = 1024 / S, bs = G2.imagery.width / SZk;
    ctx.drawImage(G2.imagery, x0 * bs, y0 * bs, S * bs, S * bs, 0, 0, 1024, 1024);
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
          posA.array[o + 1] = elevToY(terrAt(xk, yk)) + (0.035 - roadCloseF * 0.02);
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

    camera = new THREE.PerspectiveCamera(46, 1.6, 0.5, 600);
    camera.position.set(...CAMS.overview.pos);

    controls = new window.OrbitControls(camera, cv);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.zoomToCursor = true;           // zoom về phía con trỏ như Google Maps
    controls.maxPolarAngle = 1.45;
    controls.minDistance = 1.2;
    controls.maxDistance = 220;
    controls.target.set(...CAMS.overview.tgt);
    controls.addEventListener("start", cancelFly);
    raycaster = new THREE.Raycaster();
    rayPointer = new THREE.Vector2();

    scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x18261f, 0.85));
    const key = new THREE.DirectionalLight(0xffd9a8, 1.25);
    key.position.set(70, 110, -60);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x6f9fd8, 0.35);
    fill.position.set(-70, 70, 95);
    scene.add(fill);

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
    ensureSelectionRing();
    canvas.tabIndex = 0;

    const ro = new ResizeObserver(() => S3.resize());
    ro.observe(cv);
    S3.resize();
    FT.bus.on("osmRoads", () => { try { buildOsmRoads(); } catch (e) { console.warn("osm 3d roads", e); } });
    FT.bus.on("osmBuildings", () => { try { swapOsmBuildings(); } catch (e) { console.warn("osm 3d bldg", e); } });
    FT.bus.on("osmMinor", () => { try { buildOsmMinor(); } catch (e) { console.warn("osm 3d minor", e); } });
    FT.bus.on("explainSelection", (contract) => showSelectionPulse(contract && contract.selection));
  };

  S3.resize = function () {
    if (!renderer) return;
    const r = canvas.getBoundingClientRect();
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
    const closeOpacity = WATER_STYLE.simulatedFarOpacity * (1 - U.clamp(ghost, 0, 1) * 0.40);
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
  S3.flyToPoint = function (xKm, yKm) {
    return S3.flyToSelection({ kind: "point", xKm, yKm }, { intent: "asset" });
  };

  S3.flyToSelection = function (selection, options) {
    if (!camera || !controls) return false;
    const point = pointFromSelection(selection);
    if (!point) return false;
    const intent = options && options.intent || (selection.kind === "point" ? "asset" : "district");
    const dist = CAMERA_DISTANCES[intent] || CAMERA_DISTANCES.asset;
    const te = elevToY(Math.max(1, terrAt(point.x, point.y))) * scene.scale.y;
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
    const te = elevToY(Math.max(1, terrAt(point.x, point.y))) * scene.scale.y;
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
    const next = U.clamp(v.length() * factor, controls.minDistance || 1.2, controls.maxDistance || 220);
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
    const dist = U.clamp(v.length(), controls.minDistance || 1.2, controls.maxDistance || 220);
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
    /* storm atmosphere: sky darkens & visibility closes in with rain intensity */
    if (skyTmp) {
      const rainF = Math.min(1, snap.rain / 110);
      skyTmp.copy(skyClear).lerp(skyStorm, rainF);
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
    /* đúng tỉ lệ dọc/ngang: toàn cảnh giữ phóng đại 20× cho dễ đọc, ghé sát hạ về ~2× (gần thực) */
    scene.scale.y = 1 - cf * 0.9;
    /* rebuild nặng (ma trận nhà + màu đường) dồn về nhịp 0,25s và ngưỡng 0,08 — zoom không còn khựng */
    cfAcc += dtReal;
    let cfJump = false;
    if (cfAcc >= 0.25 && Math.abs(cf - roadCloseF) > 0.08) {
      cfAcc = 0; cfJump = true; roadCloseF = cf; updateBuildingScale(cf);
    }
    waterMesh.visible = FT.state.layers.water;
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
  Object.defineProperty(S3, "selectionPresentation", { enumerable: true, get() { return selectionPulse ? { ...selectionPulse.selection } : null; } });
})();
