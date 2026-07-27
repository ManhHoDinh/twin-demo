/* FloodTwin Q1 Demo — world: terrain, rivers, shallow-water sim, road graph
   Height-field shallow-water ("virtual pipes", Mei et al. 2007) on an N×N grid,
   forced by reservoir releases + runoff and softly assimilated to the analytic
   gauge stages from hydro.js (the twin's data-assimilation loop, §6 of the paper).
   Grid: row-major [iy*N+ix], ix east+, iy south+. Units: m, km, s. */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, D = FT.data;
  const N = D.DOMAIN.N, SZ = D.DOMAIN.sizeKm, CELL = (SZ / N) * 1000;   // m
  const NC = N * N;

  const W = (FT.world = {
    N, CELL,
    terrain: new Float32Array(NC),      // bed elevation (m)
    h: new Float32Array(NC),            // water depth (m)
    hEq: new Float32Array(NC),          // assimilation target depth (m)
    hBase: new Float32Array(NC),        // normal-conditions water (rivers/sea) — floods are the EXCESS above this
    fx: new Float32Array((N + 1) * N),  // flux east at (ix+1/2, iy)
    fy: new Float32Array(N * (N + 1)),  // flux south at (ix, iy+1/2)
    u: new Float32Array(NC),            // cell velocity (m/s) for visuals/particles
    v: new Float32Array(NC),
    sea: new Uint8Array(NC),
    riverDist: new Float32Array(NC),    // km to nearest river centreline
    riverIdx: new Int16Array(NC),       // which river (index into D.RIVERS), -1 none
    riverS: new Float32Array(NC),       // along-river parameter 0..1 of nearest point
    pop: new Float32Array(NC),          // population weight per cell
    chanBed: new Float32Array(NC),      // channel bed elevation of nearest river (m)
    dyn: new Uint8Array(NC),            // 1 = dynamic SWE cell (floodplain); 0 = diagnostic (mountain/sea)
    rDirX: new Float32Array(NC),        // downstream direction of nearest river segment
    rDirY: new Float32Array(NC),
    ready: false,
  });
  const DYN_MAX_ELEV = 28;              // SWE dynamics only on the floodplain (paper §5: 2D core = delta)

  const ix2km = (i) => (i + 0.5) * (SZ / N);
  const km2i = (km) => U.clamp(Math.floor((km / SZ) * N), 0, N - 1);
  W.km2i = km2i; W.ix2km = ix2km;

  /* ---------- deterministic value noise ---------- */
  function hash2(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (((h ^ (h >>> 16)) >>> 0) / 4294967296);
  }
  function vnoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const s = (t) => t * t * (3 - 2 * t);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return U.lerp(U.lerp(a, b, s(xf)), U.lerp(c, d, s(xf)), s(yf));
  }
  function fbm(x, y, seed, oct) {
    let v = 0, amp = 0.5, f = 1;
    for (let o = 0; o < oct; o++) { v += amp * vnoise(x * f, y * f, seed + o * 101); amp *= 0.5; f *= 2.1; }
    return v;
  }

  /* ---------- geometry helpers ---------- */
  function distToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy || 1e-9;
    let t = ((px - ax) * dx + (py - ay) * dy) / L2;
    t = U.clamp(t, 0, 1);
    const qx = ax + t * dx, qy = ay + t * dy;
    return { d: Math.hypot(px - qx, py - qy), t };
  }

  /* rivers with cumulative arc-length for bed profiles */
  const riverGeo = [];
  function prepRivers() {
    for (const r of D.RIVERS) {
      const cum = [0];
      for (let i = 1; i < r.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]));
      riverGeo.push({ r, cum, len: cum[cum.length - 1] });
    }
  }

  /* ---------- terrain build: REAL DEM when loaded, scaled procedural fallback ---------- */
  function buildTerrain() {
    if (FT.geo && FT.geo.hasDEM) {
      for (let iy = 0; iy < N; iy++) {
        for (let ix = 0; ix < N; ix++) {
          const k = iy * N + ix;
          W.terrain[k] = FT.geo.elevAt(ix2km(ix), ix2km(iy));
        }
      }
      /* light 3×3 smoothing (DEM speckle at coarse sampling) */
      const src = W.terrain.slice();
      for (let iy = 1; iy < N - 1; iy++) {
        for (let ix = 1; ix < N - 1; ix++) {
          const k = iy * N + ix;
          W.terrain[k] = (src[k] * 4 + src[k - 1] + src[k + 1] + src[k - N] + src[k + N]) / 8;
        }
      }
      for (let k = 0; k < NC; k++) W.sea[k] = W.terrain[k] <= 0.3 ? 1 : 0;
      return;
    }
    /* offline fallback: the stylised basin, stretched to the real domain size */
    const sc = SZ / 44;
    const bayCx = 37.5, bayCy = -1.5, bayR = 6.4;
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const x = ix2km(ix) / sc, y = ix2km(iy) / sc, k = iy * N + ix;
        const coastX = 40.6 + 0.9 * Math.sin(y * 0.22) - Math.max(0, (y - 34)) * 0.12;
        const inBay = Math.hypot(x - bayCx, y - bayCy) < bayR;
        const isSea = x > coastX || inBay;
        W.sea[k] = isSea ? 1 : 0;
        if (isSea) { W.terrain[k] = -6; continue; }
        const mW = Math.pow(U.smoothstep(27, 7, x), 1.5);
        const mS = Math.pow(U.smoothstep(26, 40, y) * U.smoothstep(30, 16, x), 1.4);
        const mN = Math.pow(U.smoothstep(9, 1.5, y) * U.smoothstep(36, 30, x), 1.6) * 0.5;
        const mount = 1150 * mW + 780 * mS + 500 * mN;
        const n = fbm(x * 0.55, y * 0.55, 7, 4);
        const plain = 2.2 + 4.5 * U.smoothstep(41, 26, x) + n * 2.2;
        let e = plain + mount + (n - 0.5) * (mount * 0.55 + 4);
        const coastFade = U.smoothstep(0.2, 3.2, coastX - x);
        e = -1.2 + (e + 1.2) * coastFade;
        W.terrain[k] = e;
      }
    }
  }

  /* ---------- carve river valleys & channels ----------
     Bed profile FOLLOWS the terrain: pre-carve elevation at each polyline vertex,
     forced monotone-decreasing downstream (running minimum), interpolated per segment. */
  function carveRivers() {
    W.riverDist.fill(1e9); W.riverIdx.fill(-1);
    const segIdx = new Int16Array(NC).fill(-1);
    const segT = new Float32Array(NC);
    for (const rg of riverGeo) {
      let m = Infinity;
      rg.vertexBed = rg.r.pts.map((p) => {
        const te = W.terrain[km2i(p[1]) * N + km2i(p[0])];
        m = Math.min(m, te);
        return m;
      });
      const last = rg.vertexBed.length - 1;
      rg.vertexBed[last] = Math.min(rg.vertexBed[last], 1.5);                    // estuary/junction outlet stays low
    }
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const k = iy * N + ix;
        if (W.sea[k]) { W.riverDist[k] = 0.01; continue; }
        const x = ix2km(ix), y = ix2km(iy);
        for (let ri = 0; ri < riverGeo.length; ri++) {
          const { r, cum, len } = riverGeo[ri];
          for (let si = 0; si < r.pts.length - 1; si++) {
            const a = r.pts[si], b = r.pts[si + 1];
            if (Math.abs(x - (a[0] + b[0]) / 2) > 6 || Math.abs(y - (a[1] + b[1]) / 2) > 6) continue;
            const { d, t } = distToSeg(x, y, a[0], a[1], b[0], b[1]);
            if (d < W.riverDist[k]) {
              W.riverDist[k] = d; W.riverIdx[k] = ri;
              W.riverS[k] = (cum[si] + t * (cum[si + 1] - cum[si])) / len;
              segIdx[k] = si; segT[k] = t;
              const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
              W.rDirX[k] = (b[0] - a[0]) / L; W.rDirY[k] = (b[1] - a[1]) / L;
            }
          }
        }
        const ri = W.riverIdx[k];
        if (ri >= 0) {
          const rg = riverGeo[ri], r = rg.r;
          const d = W.riverDist[k];
          const bedLine = U.lerp(rg.vertexBed[segIdx[k]], rg.vertexBed[segIdx[k] + 1], segT[k]);
          const halfW = r.w;
          if (d < halfW * 4.5) {
            const valley = bedLine + Math.pow(d / (halfW * 4.5), 1.6) * Math.max(0, W.terrain[k] - bedLine);
            if (valley < W.terrain[k]) W.terrain[k] = valley;
          }
          if (d < halfW) {
            const chan = bedLine - r.depth * (1 - Math.pow(d / halfW, 2));
            if (chan < W.terrain[k]) W.terrain[k] = chan;
          }
          W.chanBed[k] = bedLine - r.depth;
        }
      }
    }
    /* actual carved bed per along-river bucket (follows terrain noise dips),
       then re-point every cell's chanBed at its river's LOCAL bed */
    for (const rg of riverGeo) {
      rg.nb = Math.max(2, Math.ceil(rg.len / 0.3));
      rg.bedS = new Float64Array(rg.nb).fill(Infinity);
    }
    for (let k = 0; k < NC; k++) {
      const ri = W.riverIdx[k];
      if (ri < 0 || W.sea[k]) continue;
      const rg = riverGeo[ri];
      if (W.riverDist[k] < rg.r.w * 0.6) {
        const b = Math.min(rg.nb - 1, Math.floor(W.riverS[k] * rg.nb));
        if (W.terrain[k] < rg.bedS[b]) rg.bedS[b] = W.terrain[k];
      }
    }
    for (const rg of riverGeo) {
      let last = rg.bedS[0] === Infinity ? 0 : rg.bedS[0];
      for (let b = 0; b < rg.nb; b++) { if (rg.bedS[b] === Infinity) rg.bedS[b] = last; else last = rg.bedS[b]; }
      for (let b = rg.nb - 2; b >= 0; b--) if (rg.bedS[b] === Infinity) rg.bedS[b] = rg.bedS[b + 1];
    }
    for (let k = 0; k < NC; k++) {
      const ri = W.riverIdx[k];
      if (ri < 0 || W.sea[k]) continue;
      const rg = riverGeo[ri];
      const b = Math.min(rg.nb - 1, Math.floor(W.riverS[k] * rg.nb));
      W.chanBed[k] = rg.bedS[b];
    }
  }

  /* ---------- population field ---------- */
  function buildPop() {
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const k = iy * N + ix;
        if (W.sea[k] || W.terrain[k] > 60) { W.pop[k] = 0; continue; }
        const x = ix2km(ix), y = ix2km(iy);
        let p = 6;                                                              // rural plain baseline (people/cell-ish weight)
        for (const c of D.CITIES) {
          const d = Math.hypot(x - c.x, y - c.y);
          p += (c.pop / 900) * Math.exp(-(d * d) / (2 * c.size * c.size));
        }
        W.pop[k] = p;
      }
    }
  }

  /* ---------- assimilation target: corridor stage anomaly from gauges ---------- */
  /* gauge anchor per river index + upstream fallback */
  let gaugeAnchors = [];
  function prepAnchors() {
    gaugeAnchors = D.GAUGES.map((g) => {
      const k = km2i(g.y) * N + km2i(g.x);
      return { g, ri: W.riverIdx[k], s: W.riverS[k] };
    });
  }
  /* stage anomaly (m above base) for river ri at parameter s, from hydro snapshot */
  function stageAnomaly(snap, ri, s) {
    let best = null, alt = null;
    for (const a of gaugeAnchors) {
      if (a.ri === ri) { if (!best || Math.abs(a.s - s) < Math.abs(best.s - s)) best = a; }
      else if (!alt) alt = a;
    }
    const a = best || alt;
    if (!a) return 0;
    const gs = snap.gauges[a.g.id];
    const anom = Math.max(0, gs.stage - a.g.base);
    const upstreamFade = 0.55 + 0.45 * U.smoothstep(0, 0.35, s);                 // less anomaly at headwaters
    return anom * upstreamFade;
  }

  function eqTarget(k, anom) {
    const ri = W.riverIdx[k], d = W.riverDist[k];
    if (ri < 0) return 0;
    const r = riverGeo[ri].r;
    const normal = d < r.w ? r.depth * 0.35 * (1 - Math.pow(d / r.w, 2)) : 0;    // base flow in channel
    if (!W.dyn[k]) {
      // mountain reach: swollen channel corridor only — no overbank ponding on rough terrain
      const corridor = r.w * 1.6;
      if (d >= corridor) return 0;
      const fall = 1 - Math.pow(d / corridor, 2);
      return Math.max(normal, Math.min(4.5, r.depth * 0.35 + anom * 0.5) * fall);
    }
    // floodplain: physical overbank — channel water-surface elevation minus cell terrain
    let target = normal;
    if (d < r.w * 6) {
      const surfElev = W.chanBed[k] + r.depth * 0.35 + anom;
      target = Math.max(target, surfElev - W.terrain[k]);
    }
    return Math.max(0, target);
  }

  function buildEqField(snap) {
    const surge = (D.SCENARIOS[FT.state.scenario].surgeGain - 0.55) * 0.35;      // small coastal setup
    for (let k = 0; k < NC; k++) {
      if (W.sea[k]) { W.hEq[k] = -W.terrain[k] + Math.max(0, surge); continue; }
      const ri = W.riverIdx[k];
      if (ri < 0) { W.hEq[k] = 0; continue; }
      W.hEq[k] = eqTarget(k, stageAnomaly(snap, ri, W.riverS[k]));
    }
  }

  /* normal-conditions field: zero-anomaly targets SETTLED by the SWE itself,
     so sea-filled estuaries/low coast are part of the baseline, not "flood" */
  function buildBaseField() {
    for (let k = 0; k < NC; k++) {
      if (W.sea[k]) { W.hBase[k] = -W.terrain[k]; continue; }
      W.hBase[k] = W.riverIdx[k] < 0 ? 0 : eqTarget(k, 0);
    }
    const analytic = W.hBase.slice();
    W.hEq.set(W.hBase);
    W.h.set(W.hBase);
    W.fx.fill(0); W.fy.fill(0);
    for (let i = 0; i < 30; i++) substep(MAX_SUB_DT, null);
    // reference = max(analytic target, settled state): covers both sea-filled lows
    // and corridor cells the settling drained — flood is only what exceeds BOTH
    for (let k = 0; k < NC; k++) W.hBase[k] = Math.max(W.h[k], analytic[k]);
    W.fx.fill(0); W.fy.fill(0); W.u.fill(0); W.v.fill(0);
  }

  /* ---------- reservoir & runoff injection ----------
     releases are injected where the river ENTERS the dynamic floodplain
     (the mountain reach is diagnostic — 1D/lumped in the paper's terms) */
  let resCells = [];
  function prepResCells() {
    resCells = D.RESERVOIRS.map((r) => {
      const k0 = km2i(r.y) * N + km2i(r.x);
      const ri = W.riverIdx[k0];
      const cand = [];
      for (let k = 0; k < NC; k++) {
        if (W.riverIdx[k] === ri && W.riverDist[k] < 0.6 && W.dyn[k] && W.riverS[k] > W.riverS[k0]) cand.push(k);
      }
      cand.sort((a, b) => W.riverS[a] - W.riverS[b]);
      let cells = cand.slice(0, 10);
      // rivers whose plain reach belongs to a downstream river (e.g. A Vương→Vu Gia): follow the network by proximity
      if (!cells.length) {
        for (let k = 0; k < NC; k++) if (W.riverDist[k] < 0.6 && W.dyn[k]) cells.push(k);
        cells.sort((a, b) => Math.hypot(ix2km(a % N) - r.x, ix2km((a / N) | 0) - r.y) - Math.hypot(ix2km(b % N) - r.x, ix2km((b / N) | 0) - r.y));
        cells = cells.slice(0, 10);
      }
      return { r, cells: cells.length ? cells : [k0] };
    });
  }
  function buildDynMask() {
    for (let k = 0; k < NC; k++) W.dyn[k] = !W.sea[k] && W.terrain[k] < DYN_MAX_ELEV ? 1 : 0;
  }

  /* ---------- SWE step (virtual pipes) ---------- */
  const G = 9.81, DAMP = 0.994;
  function substep(dt, snap) {
    const t = W.terrain, h = W.h, fx = W.fx, fy = W.fy;
    const A = CELL * CELL, pipeK = (G * dt * CELL) / CELL;                       // g·dt·(A/L) with A/L = CELL

    // 1) fluxes from surface gradient — dynamic (floodplain/sea) cells only
    const dyn = W.dyn, sea = W.sea;
    const wet = (k) => dyn[k] || sea[k];
    for (let iy = 0; iy < N; iy++) {
      const row = iy * N, frow = iy * (N + 1);
      for (let ix = 0; ix < N - 1; ix++) {
        const k = row + ix;
        if (!wet(k) || !wet(k + 1)) { fx[frow + ix + 1] = 0; continue; }
        const dH = (t[k] + h[k]) - (t[k + 1] + h[k + 1]);
        fx[frow + ix + 1] = fx[frow + ix + 1] * DAMP + pipeK * dH * Math.max(0.05, Math.min(h[k], h[k + 1], 8) + 0.05);
      }
    }
    for (let iy = 0; iy < N - 1; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const k = iy * N + ix;
        if (!wet(k) || !wet(k + N)) { fy[(iy + 1) * N + ix] = 0; continue; }
        const dH = (t[k] + h[k]) - (t[k + N] + h[k + N]);
        fy[(iy + 1) * N + ix] = fy[(iy + 1) * N + ix] * DAMP + pipeK * dH * Math.max(0.05, Math.min(h[k], h[k + N], 8) + 0.05);
      }
    }
    // 2) limit outflow so depth never negative
    for (let iy = 0; iy < N; iy++) {
      const frow = iy * (N + 1);
      for (let ix = 0; ix < N; ix++) {
        const k = iy * N + ix;
        let out = 0;
        const fE = fx[frow + ix + 1], fW = fx[frow + ix], fS = fy[(iy + 1) * N + ix], fN = fy[iy * N + ix];
        if (fE > 0) out += fE; if (fW < 0) out -= fW;
        if (fS > 0) out += fS; if (fN < 0) out -= fN;
        if (out > 0) {
          const maxOut = (h[k] * A) / (dt * 1.05);
          if (out > maxOut) {
            const sc = maxOut / out;
            if (fE > 0) fx[frow + ix + 1] = fE * sc;
            if (fW < 0) fx[frow + ix] = fW * sc;
            if (fS > 0) fy[(iy + 1) * N + ix] = fS * sc;
            if (fN < 0) fy[iy * N + ix] = fN * sc;
          }
        }
      }
    }
    // 3) integrate depth + velocity (dynamic cells); diagnostic cells follow hEq
    for (let iy = 0; iy < N; iy++) {
      const frow = iy * (N + 1);
      for (let ix = 0; ix < N; ix++) {
        const k = iy * N + ix;
        if (!dyn[k] && !sea[k]) {
          // mountain reach: prescribed stage + synthetic downstream current for visuals
          h[k] = W.hEq[k];
          if (h[k] > 0.03) {
            const spd = 1.0 + Math.min(2.6, h[k] * 0.55);
            W.u[k] = W.rDirX[k] * spd;
            W.v[k] = W.rDirY[k] * spd;
          } else { W.u[k] = 0; W.v[k] = 0; }
          continue;
        }
        const fE = fx[frow + ix + 1], fW = fx[frow + ix], fS = fy[(iy + 1) * N + ix], fN = fy[iy * N + ix];
        h[k] += ((fW - fE + fN - fS) * dt) / A;
        if (h[k] < 0) h[k] = 0;
        const hd = Math.max(h[k], 0.02);
        W.u[k] = ((fW + fE) * 0.5) / (hd * CELL);
        W.v[k] = ((fN + fS) * 0.5) / (hd * CELL);
      }
    }
    // 4) forcing: distributed runoff, assimilation, sea BC.
    // NOTE: reservoir releases are NOT injected directly — they are already encoded
    // in the gauge-stage anomalies the corridor assimilates toward (no double counting).
    if (snap) {
      const rain = snap.rain;                                                    // mm/h basin mean
      if (rain > 0.5) {
        const rEff = (rain / 3.6e6) * dt;                                        // m of direct rain
        for (let k = 0; k < NC; k++) {
          if (!dyn[k]) continue;
          const lat = W.riverDist[k] < 1.2 ? 10 : 2;                             // runoff concentration factor
          h[k] += rEff * lat;
        }
      }
    }
    const assim = Math.min(1, dt / 240);                                         // τ ≈ 4 min
    for (let k = 0; k < NC; k++) {
      if (sea[k]) { h[k] = W.hEq[k]; W.u[k] *= 0.9; W.v[k] *= 0.9; continue; }
      if (!dyn[k]) continue;
      // assimilate toward the gauge-consistent surface only where it prescribes water
      // (or inside the channel itself); elsewhere let the SWE spread + slow drainage act
      if (W.hEq[k] > 0.001 || W.riverDist[k] < 1.0) h[k] += (W.hEq[k] - h[k]) * assim;
      else if (h[k] > 0) h[k] = Math.max(0, h[k] - dt * 1.2e-5);                 // infiltration/drainage
    }
  }

  const MAX_SUB_DT = 20;                                                         // s (CFL-safe for ~8 m deep)
  W.step = function (simDt, snap) {
    buildEqField(snap);
    let remaining = Math.min(simDt, 360);                                        // cap work per frame
    while (remaining > 0) {
      const dt = Math.min(MAX_SUB_DT, remaining);
      substep(dt, snap);
      remaining -= dt;
    }
  };

  /* jump/scrub: settle to equilibrium of target time */
  W.resetToTime = function (snap) {
    buildEqField(snap);
    W.h.set(W.hEq);
    // start from the sea-filled reference where it is higher (coastal lows)
    for (let k = 0; k < NC; k++) if (W.hBase[k] > W.h[k] && W.riverDist[k] > 0.5) W.h[k] = W.hBase[k];
    W.fx.fill(0); W.fy.fill(0); W.u.fill(0); W.v.fill(0);
    for (let i = 0; i < 20; i++) substep(MAX_SUB_DT, snap);
  };

  /* ---------- sampling & stats ---------- */
  W.sampleDepth = function (xKm, yKm) {
    const fx = (xKm / SZ) * N - 0.5, fy = (yKm / SZ) * N - 0.5;
    const x0 = U.clamp(Math.floor(fx), 0, N - 1), y0 = U.clamp(Math.floor(fy), 0, N - 1);
    const x1 = Math.min(x0 + 1, N - 1), y1 = Math.min(y0 + 1, N - 1);
    const tx = U.clamp(fx - x0, 0, 1), ty = U.clamp(fy - y0, 0, 1);
    const h = W.h;
    return U.lerp(U.lerp(h[y0 * N + x0], h[y0 * N + x1], tx), U.lerp(h[y1 * N + x0], h[y1 * N + x1], tx), ty);
  };
  W.sampleTerrain = function (xKm, yKm) {
    const ix = km2i(xKm), iy = km2i(yKm);
    return W.terrain[iy * N + ix];
  };
  /* physical upper bound for "flood above normal": the largest gauge anomaly
     (+ ponding allowance) — kills residual terrain-noise artifacts in metrics */
  W.floodCap = 99;
  W.sampleExcess = function (xKm, yKm) {                                         // flood depth above normal rivers
    const ix = km2i(xKm), iy = km2i(yKm), k = iy * N + ix;
    return Math.min(W.floodCap, Math.max(0, W.h[k] - W.hBase[k]));
  };
  W.sampleVel = function (xKm, yKm, out) {
    const ix = km2i(xKm), iy = km2i(yKm), k = iy * N + ix;
    out[0] = W.u[k]; out[1] = W.v[k];
    return out;
  };

  const stats = { areaKm2: 0, exposed: 0 };
  W.floodStats = function () {
    let cells = 0, exp = 0;
    for (let k = 0; k < NC; k++) {
      if (W.sea[k]) continue;
      const ex = Math.min(W.floodCap, W.h[k] - W.hBase[k]);
      if (ex > 0.15 && W.riverDist[k] > 0.35) { cells++; exp += W.pop[k] * U.exposureFraction(ex); }  // graded, §3.1
    }
    stats.areaKm2 = cells * (CELL / 1000) * (CELL / 1000);
    /* rounded to the model's actual resolution, not to the integer — see zones.js */
    const rawExp = exp * 14;                                                     // weight → people (synthetic)
    stats.exposedRaw = rawExp;
    stats.exposed = rawExp >= 1000 ? Math.round(rawExp / 100) * 100
      : rawExp >= 100 ? Math.round(rawExp / 10) * 10 : Math.round(rawExp);
    return stats;
  };

  /* ---------- road graph ---------- */
  function polyAt(pts, cum, len, t) {
    const d = Math.max(0, Math.min(1, t)) * len;
    let s = 1;
    while (s < cum.length - 1 && cum[s] < d) s++;
    const t2 = (d - cum[s - 1]) / Math.max(1e-6, cum[s] - cum[s - 1]);
    return [U.lerp(pts[s - 1][0], pts[s][0], t2), U.lerp(pts[s - 1][1], pts[s][1], t2)];
  }
  /* point at fraction t (0..1) along edge polyline, oriented from node `fromId` */
  W.roadPoint = function (e, fromId, t) {
    const tt = fromId === e.b ? 1 - t : t;
    return polyAt(e.pts, e.cum, e.len, tt);
  };
  function buildRoads() {
    const nodes = {};
    for (const [id, n] of Object.entries(D.ROAD_NODES)) nodes[id] = { id, x: n.x, y: n.y };
    const edges = D.ROAD_EDGES.map((e, i) => {
      const a = nodes[e.a], b = nodes[e.b];
      /* polyline theo tuyến thật: a → via[] (lon/lat thật) → b */
      const pts = [[a.x, a.y]];
      if (e.via) for (const v of e.via) { const p = FT.LL(v[0], v[1]); pts.push([p[0], p[1]]); }
      pts.push([b.x, b.y]);
      const cum = [0];
      for (let s = 1; s < pts.length; s++) cum.push(cum[s - 1] + Math.hypot(pts[s][0] - pts[s - 1][0], pts[s][1] - pts[s - 1][1]));
      const len = cum[cum.length - 1];
      const nSamp = Math.max(3, Math.ceil(len / 0.6));
      const samples = [];
      for (let s = 0; s <= nSamp; s++) {
        const t = s / nSamp;
        // bridges: deck is elevated → only approaches (first/last 30%) feel water
        if (e.bridge && t > 0.3 && t < 0.7) continue;
        const p = polyAt(pts, cum, len, t);
        // samples that fall in a river channel are culverts/spans — skip them
        const kk = km2i(p[1]) * N + km2i(p[0]);
        if (W.riverDist[kk] < 0.5) continue;
        samples.push(p);
      }
      if (!samples.length) samples.push([a.x, a.y], [b.x, b.y]);
      return { idx: i, a: e.a, b: e.b, name: e.name, type: e.type, bridge: !!e.bridge, len, pts, cum, samples, depth: 0, cls: 0, speed: D.ROAD_SPEED[e.type] };
    });
    const neighbors = {};
    for (const id of Object.keys(nodes)) neighbors[id] = [];
    edges.forEach((e) => { neighbors[e.a].push(e); neighbors[e.b].push(e); });
    W.roads = { nodes, edges, neighbors };
    prepRoadForecast();
  }

  /* ---------- forecast-time-aware closure thresholds (docs FR-22) ----------
     eqTarget() is closed-form in the corridor anomaly, so for every road sample we can
     INVERT it: the gauge anomaly at which that point reaches a given depth. Taking the
     minimum over an edge's samples gives the anomaly that closes the edge — its lowest
     point decides, exactly as in docs/01-domain-model/04-exposure-and-impact-model.md E-25.
     Terrain is static, so this is computed once at build time and is then a pure lookup:
     open_until falls out of the (already known) gauge stage series with no simulation. */
  function anchorIdFor(ri, s) {
    let best = null, alt = null;
    for (const a of gaugeAnchors) {
      if (a.ri === ri) { if (!best || Math.abs(a.s - s) < Math.abs(best.s - s)) best = a; }
      else if (!alt) alt = a;
    }
    const a = best || alt;
    return a ? a.g.id : null;
  }
  /* gauge anomaly (m above that gauge's base) needed to put `depth` m of water on cell k */
  function gaugeAnomForDepth(k, depth) {
    const ri = W.riverIdx[k];
    if (ri < 0) return Infinity;
    const r = riverGeo[ri].r, d = W.riverDist[k];
    const fade = 0.55 + 0.45 * U.smoothstep(0, 0.35, W.riverS[k]);
    let anom;
    if (!W.dyn[k]) {                                   // mountain corridor: diagnostic swelling only
      const corridor = r.w * 1.6;
      if (d >= corridor) return Infinity;
      const fall = 1 - Math.pow(d / corridor, 2);
      if (fall <= 0.01) return Infinity;
      anom = (depth / fall - r.depth * 0.35) / 0.5;
    } else {                                           // floodplain: overbank from the channel water surface
      if (d >= r.w * 6) return Infinity;
      anom = depth + W.terrain[k] - W.chanBed[k] - r.depth * 0.35;
    }
    if (!isFinite(anom)) return Infinity;
    return Math.max(0, anom) / Math.max(0.2, fade);
  }
  function fadeAt(k) { return Math.max(0.2, 0.55 + 0.45 * U.smoothstep(0, 0.35, W.riverS[k])); }

  function prepRoadForecast() {
    prepAnchors();
    for (const e of W.roads.edges) {
      let a0 = Infinity, gid = null, fade = 1;
      for (const s of e.samples) {
        const k = km2i(s[1]) * N + km2i(s[0]);
        const a = gaugeAnomForDepth(k, 0);              // gauge anomaly at which water first arrives
        if (a < a0) { a0 = a; gid = anchorIdFor(W.riverIdx[k], W.riverS[k]); fade = fadeAt(k); }
      }
      /* depth_excess(A) ≈ fade · (A − a0): linear in the gauge anomaly, so a closure time is
         a lookup. a0 is re-anchored against the observed field each cycle by
         FT.forecast.calibrate() — the forecast assimilates the simulation rather than
         contradicting it, which is what keeps the two consistent on screen. */
      e.fc = isFinite(a0) && gid ? { gaugeId: gid, fade, a0Analytic: a0, a0, aClose: a0 + U.CLOSE_DEPTH / fade, aRisk: a0 + U.RISK_DEPTH / fade } : null;
    }
  }
  W.gaugeAnomForDepth = gaugeAnomForDepth;

  W.updateRoadDepths = function () {
    for (const e of W.roads.edges) {
      let dmax = 0;
      for (const s of e.samples) { const d = W.sampleExcess(s[0], s[1]); if (d > dmax) dmax = d; }
      e.depth = dmax;
      e.cls = U.roadClass(dmax);
    }
    /* REAL OSM segments: flood status per ≤2 km chunk */
    const osm = FT.geo && FT.geo.osmRoads;
    if (osm) {
      for (const s of osm) {
        let dmax = 0;
        for (const m of s.mids) { const d = W.sampleExcess(m[0], m[1]); if (d > dmax) dmax = d; }
        s.depth = dmax;
        s.dcls = U.roadClass(dmax);
      }
    }
  };

  /* ---------- init ---------- */
  W.init = function () {
    prepRivers();
    buildTerrain();
    carveRivers();
    buildDynMask();
    buildBaseField();
    buildPop();
    prepAnchors();
    prepResCells();
    buildRoads();
    W.ready = true;
  };
})();
