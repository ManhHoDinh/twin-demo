/* FloodTwin Q1 Demo — geo: REAL terrain & imagery for the Vu Gia–Thu Bồn basin
   · DEM: AWS Terrarium tiles (s3 elevation-tiles-prod, z10) → Float32 heightfield
   · Imagery: Esri World Imagery tiles (z11) → stitched canvas, equirect-resampled
   Both are fetched at boot with a timeout; on failure the app falls back to the
   procedural terrain/basemap so the demo still runs fully offline. */
(function () {
  "use strict";
  const FT = window.FT;

  /* real bounding box of the demo domain (≈96 × 95.5 km) */
  const LON0 = 107.55, LON1 = 108.45, LAT0 = 15.30, LAT1 = 16.16;
  const KM_PER_LON = 103.3, KM_PER_LAT = 111.1;
  const SZ = 96;

  const G = (FT.geo = {
    LON0, LON1, LAT0, LAT1, SZ,
    hasDEM: false, hasImagery: false,
    ll2km(lon, lat) { return [(lon - LON0) * KM_PER_LON, (LAT1 - lat) * KM_PER_LAT]; },
    km2ll(x, y) { return [LON0 + x / KM_PER_LON, LAT1 - y / KM_PER_LAT]; },
  });
  FT.LL = (lon, lat) => G.ll2km(lon, lat);      // shorthand used by data.js

  /* ---------- slippy tile math ---------- */
  const t2lon = (x, z) => (x / Math.pow(2, z)) * 360 - 180;
  function t2lat(y, z) {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }
  const lon2t = (lon, z) => ((lon + 180) / 360) * Math.pow(2, z);
  function lat2t(lat, z) {
    const r = (lat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z);
  }

  function loadImage(url, timeoutMs) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const to = setTimeout(() => { img.src = ""; resolve(null); }, timeoutMs);
      img.onload = () => { clearTimeout(to); resolve(img); };
      img.onerror = () => { clearTimeout(to); resolve(null); };
      img.src = url;
    });
  }

  /* stitch a tile range into one canvas; returns {canvas, x0, y0, z, ok} */
  async function stitch(urlFn, z, timeoutMs) {
    const x0 = Math.floor(lon2t(LON0, z)), x1 = Math.floor(lon2t(LON1, z));
    const y0 = Math.floor(lat2t(LAT1, z)), y1 = Math.floor(lat2t(LAT0, z));
    const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
    const cv = document.createElement("canvas");
    cv.width = nx * 256; cv.height = ny * 256;
    const ctx = cv.getContext("2d");
    const jobs = [];
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        jobs.push(loadImage(urlFn(z, tx, ty), timeoutMs).then((img) => {
          if (img) ctx.drawImage(img, (tx - x0) * 256, (ty - y0) * 256);
          return !!img;
        }));
    const got = await Promise.all(jobs);
    const okCount = got.filter(Boolean).length;
    return { canvas: cv, ctx, x0, y0, z, nx, ny, ok: okCount >= jobs.length * 0.8 };
  }

  /* map lon/lat → pixel inside a stitched mercator canvas */
  function llToStitchPx(st, lon, lat) {
    return [ (lon2t(lon, st.z) - st.x0) * 256, (lat2t(lat, st.z) - st.y0) * 256 ];
  }

  /* ---------- DEM (terrarium encoding: h = R*256 + G + B/256 − 32768) ---------- */
  async function loadDEM(timeoutMs) {
    const st = await stitch(
      (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
      11, timeoutMs
    );
    if (!st.ok) return false;
    const { data, width } = st.ctx.getImageData(0, 0, st.canvas.width, st.canvas.height);
    G._dem = { st, data, width, height: st.canvas.height };
    G.hasDEM = true;
    return true;
  }

  /* elevation (m) at km coords, bilinear over the stitched DEM */
  G.elevAt = function (xKm, yKm) {
    const d = G._dem;
    if (!d) return 0;
    const [lon, lat] = G.km2ll(xKm, yKm);
    const [px, py] = llToStitchPx(d.st, lon, lat);
    const x0 = Math.max(0, Math.min(d.width - 2, Math.floor(px)));
    const y0 = Math.max(0, Math.min(d.height - 2, Math.floor(py)));
    const fx = Math.min(1, Math.max(0, px - x0)), fy = Math.min(1, Math.max(0, py - y0));
    const at = (xx, yy) => {
      const o = (yy * d.width + xx) * 4;
      return d.data[o] * 256 + d.data[o + 1] + d.data[o + 2] / 256 - 32768;
    };
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), e = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a + (e - b - (c - a)) * fx) * fy;
  };

  /* ---------- imagery (Esri World Imagery) ---------- */
  async function loadImagery(timeoutMs) {
    const imgUrl = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
    /* z12 first (38 m/px — matches canvas resolution); graceful z11 fallback */
    let st = await stitch(imgUrl, 12, timeoutMs);
    if (!st.ok) st = await stitch(imgUrl, 11, timeoutMs);
    if (!st.ok) return false;
    G._img = st;
    /* resample mercator → equirect square canvas matching the km domain */
    const S = 2304;
    const out = document.createElement("canvas");
    out.width = S; out.height = S;
    const octx = out.getContext("2d");
    for (let row = 0; row < S; row++) {
      const yKm = (row / S) * SZ;
      const lat = LAT1 - yKm / KM_PER_LAT;
      const sy = (lat2t(lat, st.z) - st.y0) * 256;
      const sx0 = (lon2t(LON0, st.z) - st.x0) * 256;
      const sx1 = (lon2t(LON0 + SZ / KM_PER_LON, st.z) - st.x0) * 256;
      octx.drawImage(st.canvas, sx0, sy, sx1 - sx0, 1, 0, row, S, 1);
    }
    G.imagery = out;
    /* high-detail z14 patches over key urban areas (buildings/streets visible) */
    await addDetailPatches(octx, S, timeoutMs);
    /* REAL road cartography baked in: Esri World Transportation (transparent overlay tiles) */
    await addTransportLayer(octx, S, timeoutMs);
    try { G.imageryData = octx.getImageData(0, 0, S, S); } catch (e) { G.imageryData = null; }
    G.hasImagery = true;
    return true;
  }

  /* draw z14 tiles (≈19 m/px) for city windows straight onto the equirect canvas */
  const DETAIL_WINDOWS = [
    { lon: 108.21, lat: 16.055, r: 0.055 },   // Đà Nẵng trung tâm
    { lon: 108.328, lat: 15.878, r: 0.038 },  // Hội An
    { lon: 108.10, lat: 15.885, r: 0.03 },    // Ái Nghĩa (Đại Lộc)
    { lon: 108.248, lat: 15.92, r: 0.032 },   // Vĩnh Điện – Điện Bàn
    { lon: 108.26, lat: 15.85, r: 0.03 },     // Nam Phước – cầu Câu Lâu
  ];
  G.detailPatches = [];                        // [{x0,y0,x1,y1 (km), canvas}] native-res for deep zoom
  async function addDetailPatches(octx, S, timeoutMs) {
    const z = 14;
    const jobs = [];
    for (const w of DETAIL_WINDOWS) {
      const x0 = Math.floor(lon2t(w.lon - w.r, z)), x1 = Math.floor(lon2t(w.lon + w.r, z));
      const y0 = Math.floor(lat2t(w.lat + w.r, z)), y1 = Math.floor(lat2t(w.lat - w.r, z));
      /* native-resolution patch canvas kept for deep zoom (≈9 m/px after equirect) */
      const pkm = [
        (t2lon(x0, z) - LON0) * KM_PER_LON, (LAT1 - t2lat(y0, z)) * KM_PER_LAT,
        (t2lon(x1 + 1, z) - LON0) * KM_PER_LON, (LAT1 - t2lat(y1 + 1, z)) * KM_PER_LAT,
      ];
      const pw = Math.max(2, Math.round((pkm[2] - pkm[0]) / 0.009));
      const ph = Math.max(2, Math.round((pkm[3] - pkm[1]) / 0.009));
      const pcv = document.createElement("canvas");
      pcv.width = Math.min(2048, pw); pcv.height = Math.min(2048, ph);
      const pctx = pcv.getContext("2d");
      const patch = { x0: pkm[0], y0: pkm[1], x1: pkm[2], y1: pkm[3], canvas: pcv };
      G.detailPatches.push(patch);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          jobs.push(loadImage(
            `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`,
            timeoutMs
          ).then((img) => {
            if (!img) return;
            const lonA = t2lon(tx, z), lonB = t2lon(tx + 1, z);
            const latA = t2lat(ty, z), latB = t2lat(ty + 1, z);
            /* equirect base canvas */
            octx.drawImage(img,
              ((lonA - LON0) * KM_PER_LON / SZ) * S, ((LAT1 - latA) * KM_PER_LAT / SZ) * S,
              ((lonB - lonA) * KM_PER_LON / SZ) * S, ((latA - latB) * KM_PER_LAT / SZ) * S);
            /* native patch canvas */
            const kmx = (lonA - LON0) * KM_PER_LON, kmy = (LAT1 - latA) * KM_PER_LAT;
            const kx2 = (lonB - LON0) * KM_PER_LON, ky2 = (LAT1 - latB) * KM_PER_LAT;
            const sxp = pcv.width / (patch.x1 - patch.x0), syp = pcv.height / (patch.y1 - patch.y0);
            pctx.drawImage(img, (kmx - patch.x0) * sxp, (kmy - patch.y0) * syp, (kx2 - kmx) * sxp, (ky2 - kmy) * syp);
          }));
        }
      }
    }
    await Promise.all(jobs);
  }

  /* imagery RGB at km coords (for draping onto the 3D terrain) */
  G.imageryAt = function (xKm, yKm, out) {
    const im = G.imageryData;
    out = out || [90, 100, 80];
    if (!im) return out;
    const S = im.width;
    const px = Math.max(0, Math.min(S - 1, Math.round((xKm / SZ) * S)));
    const py = Math.max(0, Math.min(S - 1, Math.round((yKm / SZ) * S)));
    const o = (py * S + px) * 4;
    out[0] = im.data[o]; out[1] = im.data[o + 1]; out[2] = im.data[o + 2];
    return out;
  };

  /* Esri World_Transportation z11 whole-domain + z14 city windows → equirect canvas */
  async function addTransportLayer(octx, S, timeoutMs) {
    const url = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/${z}/${y}/${x}`;
    const st = await stitch(url, 11, timeoutMs);
    if (st.ok) {
      for (let row = 0; row < S; row++) {
        const lat = LAT1 - ((row / S) * SZ) / KM_PER_LAT;
        const sy = (lat2t(lat, st.z) - st.y0) * 256;
        const sx0 = (lon2t(LON0, st.z) - st.x0) * 256;
        const sx1 = (lon2t(LON0 + SZ / KM_PER_LON, st.z) - st.x0) * 256;
        octx.drawImage(st.canvas, sx0, sy, sx1 - sx0, 1, 0, row, S, 1);
      }
      G.hasTransport = true;
    }
    /* sharper roads inside the detail windows */
    const jobs = [];
    for (const w of DETAIL_WINDOWS) {
      const z = 14;
      const x0 = Math.floor(lon2t(w.lon - w.r, z)), x1 = Math.floor(lon2t(w.lon + w.r, z));
      const y0 = Math.floor(lat2t(w.lat + w.r, z)), y1 = Math.floor(lat2t(w.lat - w.r, z));
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        jobs.push(loadImage(url(z, tx, ty), timeoutMs).then((img) => {
          if (!img) return;
          const lonA = t2lon(tx, z), lonB = t2lon(tx + 1, z);
          const latA = t2lat(ty, z), latB = t2lat(ty + 1, z);
          octx.drawImage(img,
            ((lonA - LON0) * KM_PER_LON / SZ) * S, ((LAT1 - latA) * KM_PER_LAT / SZ) * S,
            ((lonB - lonA) * KM_PER_LON / SZ) * S, ((latA - latB) * KM_PER_LAT / SZ) * S);
          /* keep deep-zoom patches road-crisp too */
          const kmx = (lonA - LON0) * KM_PER_LON, kmy = (LAT1 - latA) * KM_PER_LAT;
          const kx2 = (lonB - LON0) * KM_PER_LON, ky2 = (LAT1 - latB) * KM_PER_LAT;
          for (const p of G.detailPatches) {
            if (kx2 < p.x0 || kmx > p.x1 || ky2 < p.y0 || kmy > p.y1) continue;
            const sxp = p.canvas.width / (p.x1 - p.x0), syp = p.canvas.height / (p.y1 - p.y0);
            p.canvas.getContext("2d").drawImage(img, (kmx - p.x0) * sxp, (kmy - p.y0) * syp, (kx2 - kmx) * sxp, (ky2 - kmy) * syp);
          }
        }));
      }
    }
    await Promise.all(jobs);
  }

  /* ---------- REAL road network from OpenStreetMap (Overpass) ---------- */
  function simplify(pts, eps) {
    if (pts.length < 3) return pts;
    let dmax = 0, idx = 0;
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
    for (let i = 1; i < pts.length - 1; i++) {
      const t = ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / L2;
      const qx = ax + t * dx, qy = ay + t * dy;
      const d = Math.hypot(pts[i][0] - qx, pts[i][1] - qy);
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax <= eps) return [pts[0], pts[pts.length - 1]];
    return simplify(pts.slice(0, idx + 1), eps).slice(0, -1).concat(simplify(pts.slice(idx), eps));
  }

  G.osmRoads = null;      // [{cls:'mw'|'pri'|'sec', pts:[[xKm,yKm]…], mids:[[x,y]…], depth:0, dcls:0}]
  G.hasOSM = false;
  G.loadRoadsOSM = async function (timeoutMs) {
    const q = `[out:json][timeout:25];way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|secondary)$"](${LAT0},${LON0},${LAT1},${LON1});out geom;`;
    const mirrors = [
      "https://overpass-api.de/api/interpreter?data=",
      "https://overpass.kumi.systems/api/interpreter?data=",
      "https://overpass.private.coffee/api/interpreter?data=",
    ];
    try {
      let js = null;
      for (const m of mirrors) {
        try {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), timeoutMs || 20000);
          const res = await fetch(m + encodeURIComponent(q), { signal: ctrl.signal });
          clearTimeout(to);
          if (res.ok) { js = await res.json(); break; }
        } catch (e) { /* try next mirror */ }
      }
      if (!js) return false;
      const segs = [];
      for (const el of js.elements || []) {
        if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
        const hw = (el.tags && el.tags.highway) || "";
        const cls = /motorway|trunk/.test(hw) ? "mw" : hw.startsWith("primary") ? "pri" : "sec";
        let pts = el.geometry.map((p) => G.ll2km(p.lon, p.lat));
        pts = simplify(pts, 0.05);
        /* split into ≤2 km chunks so flood status stays local */
        let cur = [pts[0]], acc = 0;
        for (let i = 1; i < pts.length; i++) {
          const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          acc += d;
          cur.push(pts[i]);
          if (acc >= 2 || i === pts.length - 1) {
            if (cur.length > 1) {
              const mids = [];
              for (let j = 0; j < cur.length - 1; j++) mids.push([(cur[j][0] + cur[j + 1][0]) / 2, (cur[j][1] + cur[j + 1][1]) / 2]);
              segs.push({ cls, pts: cur, mids, depth: 0, dcls: 0 });
            }
            cur = [pts[i]]; acc = 0;
          }
        }
      }
      if (segs.length < 20) return false;
      G.osmRoads = segs;
      G.hasOSM = true;
      console.info(`[geo] OSM roads OK — ${segs.length} segments`);
      return true;
    } catch (e) {
      console.warn("[geo] OSM roads unavailable — keeping skeleton", e && e.message);
      return false;
    }
  };

  /* ---------- REAL building footprints (OSM way["building"], 5 cửa sổ đô thị) ---------- */
  G.osmBuildings = null;                     // [{pts:[[xKm,yKm]…], cx, cy}]
  G.hasOSMBldg = false;
  G.loadBuildingsOSM = async function (timeoutMs) {
    const boxes = DETAIL_WINDOWS.map((w) =>
      `way["building"](${(w.lat - w.r).toFixed(4)},${(w.lon - w.r).toFixed(4)},${(w.lat + w.r).toFixed(4)},${(w.lon + w.r).toFixed(4)});`
    ).join("");
    const q = `[out:json][timeout:25];(${boxes});out geom 9000;`;
    const mirrors = [
      "https://overpass-api.de/api/interpreter?data=",
      "https://overpass.kumi.systems/api/interpreter?data=",
      "https://overpass.private.coffee/api/interpreter?data=",
    ];
    try {
      let js = null;
      for (const m of mirrors) {
        try {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), timeoutMs || 25000);
          const res = await fetch(m + encodeURIComponent(q), { signal: ctrl.signal });
          clearTimeout(to);
          if (res.ok) { js = await res.json(); break; }
        } catch (e) { /* thử mirror kế */ }
      }
      if (!js) return false;
      const fps = [];
      for (const el of js.elements || []) {
        if (el.type !== "way" || !el.geometry || el.geometry.length < 4) continue;
        const pts = el.geometry.slice(0, -1).map((p) => G.ll2km(p.lon, p.lat));
        if (pts.length < 3 || pts.length > 40) continue;
        let cx = 0, cy = 0;
        for (const p of pts) { cx += p[0]; cy += p[1]; }
        cx /= pts.length; cy /= pts.length;
        fps.push({ pts, cx, cy });
        if (fps.length >= 7000) break;
      }
      if (fps.length < 50) return false;
      G.osmBuildings = fps;
      G.hasOSMBldg = true;
      console.info(`[geo] OSM buildings OK — ${fps.length} footprints`);
      return true;
    } catch (e) {
      console.warn("[geo] OSM buildings unavailable", e && e.message);
      return false;
    }
  };

  /* ---------- MỌI ngóc ngách: đường nhỏ + ngõ hẻm OSM (5 cửa sổ đô thị) ---------- */
  G.osmMinor = null;                         // [{cls:'ter'|'res'|'aly', pts:[[xKm,yKm]…]}]
  G.hasOSMMinor = false;
  G.loadMinorRoadsOSM = async function (timeoutMs) {
    const boxes = DETAIL_WINDOWS.map((w) =>
      `way["highway"](${(w.lat - w.r).toFixed(4)},${(w.lon - w.r).toFixed(4)},${(w.lat + w.r).toFixed(4)},${(w.lon + w.r).toFixed(4)});`
    ).join("");
    const q = `[out:json][timeout:30];(${boxes});out geom 14000;`;
    const mirrors = [
      "https://overpass-api.de/api/interpreter?data=",
      "https://overpass.kumi.systems/api/interpreter?data=",
      "https://overpass.private.coffee/api/interpreter?data=",
    ];
    try {
      let js = null;
      for (const m of mirrors) {
        try {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), timeoutMs || 30000);
          const res = await fetch(m + encodeURIComponent(q), { signal: ctrl.signal });
          clearTimeout(to);
          if (res.ok) { js = await res.json(); break; }
        } catch (e) { /* mirror kế */ }
      }
      if (!js) return false;
      const segs = [];
      for (const el of js.elements || []) {
        if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
        const hw = (el.tags && el.tags.highway) || "";
        if (/motorway|trunk|primary|secondary/.test(hw)) continue;   // đã có domain-wide
        const cls = /tertiary/.test(hw) ? "ter"
          : /residential|unclassified|living_street|road/.test(hw) ? "res" : "aly";
        let pts = el.geometry.map((p) => G.ll2km(p.lon, p.lat));
        pts = simplify(pts, 0.012);
        if (pts.length > 1) segs.push({ cls, pts });
        if (segs.length >= 12000) break;
      }
      if (segs.length < 50) return false;
      G.osmMinor = segs;
      G.hasOSMMinor = true;
      console.info(`[geo] OSM minor roads OK — ${segs.length} đoạn (đường nhỏ + hẻm)`);
      return true;
    } catch (e) {
      console.warn("[geo] OSM minor roads unavailable", e && e.message);
      return false;
    }
  };

  /* ---------- on-demand slippy tiles (m²-level deep zoom) ---------- */
  const tileCache = new Map();               // "L/z/x/y" → {img, ok} ; LRU-capped
  const TILE_URLS = {
    img: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    rd: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/${z}/${y}/${x}`,
    pl: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`,
  };
  G.tile = function (layer, z, x, y) {
    const key = `${layer}/${z}/${x}/${y}`;
    let e = tileCache.get(key);
    if (e) { tileCache.delete(key); tileCache.set(key, e); return e; }   // LRU bump
    e = { img: null, ok: false };
    tileCache.set(key, e);
    if (tileCache.size > 450) tileCache.delete(tileCache.keys().next().value);
    const url = TILE_URLS[layer](z, x, y);
    loadImage(url, 12000).then((img) => {
      if (img) { e.img = img; e.ok = true; return; }
      return loadImage(url, 12000).then((img2) => {
        if (img2) { e.img = img2; e.ok = true; }
        // hỏng cả 2 lần: nhả slot cache sau 30s để pan/zoom sau được nạp lại
        else setTimeout(() => { if (tileCache.get(key) === e && !e.ok) tileCache.delete(key); }, 30000);
      });
    });
    return e;
  };
  G.tileMath = { lon2t, lat2t, t2lon, t2lat };

  /* ---------- boot loader with hard timeout ---------- */
  G.load = async function (timeoutMs) {
    const t = timeoutMs || 12000;
    try {
      const [dem, img] = await Promise.all([
        loadDEM(t).catch(() => false),
        loadImagery(t).catch(() => false),
      ]);
      console.info(`[geo] DEM ${dem ? "OK" : "fallback"} · imagery ${img ? "OK" : "fallback"}`);
    } catch (e) {
      console.warn("[geo] real-map load failed — procedural fallback", e);
    }
    return { dem: G.hasDEM, imagery: G.hasImagery };
  };
})();
