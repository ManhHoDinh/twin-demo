/* FloodTwin Q1 Demo — hydronat: national multi-factor water engine
   Factors combined per basin: storm track rain · monsoon background · orography ·
   antecedent soil moisture · cascade routing of releases · transboundary inflow ·
   coastal surge/tide. Precomputed over T−24→+48 h at 0.5 h; deterministic. */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, V = FT.vndata;

  const T0 = -24, T1 = 48, DT = 0.5;
  const NT = Math.round((T1 - T0) / DT) + 1;

  const HN = (FT.hydronat = { T0, T1, DT, NT, ready: false });
  const idx = (t) => U.clamp((t - T0) / DT, 0, NT - 1);
  function samp(arr, t) {
    const x = idx(t), i = Math.floor(x), f = x - i;
    return i >= NT - 1 ? arr[NT - 1] : arr[i] + (arr[i + 1] - arr[i]) * f;
  }

  /* ---------- storm ---------- */
  function stormAt(scen, t) {
    const S = V.NSTORMS[scen];
    if (!S || !S.track) return { on: false, lon: 0, lat: 0, inten: 0, S };
    const tr = S.track;
    if (t <= tr[0][2]) return { on: true, lon: tr[0][0], lat: tr[0][1], inten: 0.4 * S.peak, S };
    for (let i = 0; i < tr.length - 1; i++) {
      if (t <= tr[i + 1][2]) {
        const f = (t - tr[i][2]) / (tr[i + 1][2] - tr[i][2]);
        // intensity: strong at sea, decays over land (later track points)
        const decay = 1 - 0.55 * (i / (tr.length - 2));
        return { on: true, lon: U.lerp(tr[i][0], tr[i + 1][0], f), lat: U.lerp(tr[i][1], tr[i + 1][1], f), inten: S.peak * decay, S };
      }
    }
    const last = tr[tr.length - 1];
    return { on: true, lon: last[0], lat: last[1], inten: 0.25 * S.peak, S };
  }

  /* orographic factor from ridge proximity */
  function orog(lon, lat) {
    let f = 1;
    for (const r of V.RIDGES) {
      for (let i = 0; i < r.pts.length; i++) {
        const d = Math.hypot(lon - r.pts[i][0], lat - r.pts[i][1]);
        if (d < r.r * 2) f = Math.max(f, 1 + 0.8 * (1 - d / (r.r * 2)) * (r.h / 2900));
      }
    }
    return f;
  }

  /* monsoon background weight by latitude band per scenario */
  function monsoonW(scen, lat) {
    if (scen === "monsoon") return lat < 13.5 ? 1 : lat < 16.5 ? 0.5 : 0.2;   // SW monsoon: south heavy
    if (scen === "oct2020") return lat > 13 && lat < 18 ? 1 : 0.25;            // central rains
    return lat > 19 ? 0.7 : 0.25;                                              // yagi: north band
  }

  HN.rainAt = function (lon, lat, t) {
    const scen = FT.state.scenario;
    const S = V.NSTORMS[scen];
    const st = stormAt(scen, t);
    let r = S.monsoon * 14 * monsoonW(scen, lat) * (0.7 + 0.3 * Math.sin(t * 0.35 + lat));
    if (st.on && st.inten > 0) {
      const d = Math.hypot(lon - st.lon, lat - st.lat);
      r += 90 * st.inten * Math.exp(-(d * d) / (2 * st.S.rMax * st.S.rMax));
    }
    return Math.max(0, r * orog(lon, lat) * FT.state.rainScale);
  };
  HN.stormAt = (t) => stormAt(FT.state.scenario, t);

  /* ---------- reservoir cascade integration ---------- */
  HN.res = {};      // id → {Z(NT) % of full, I, O, spill flags via O>turbine proxy}
  HN.regions = {};  // id → {rain, soil, alert}
  HN.riverFlux = {};// riverId → Float64Array 0..1
  HN.gauges = {};   // id → {stage(NT), def}
  HN.alertOfG = (g, st) => (st >= g.bd[2] ? 3 : st >= g.bd[1] ? 2 : st >= g.bd[0] ? 1 : 0);

  function upstreamPoint(r) {
    const riv = V.NRIVERS.find((x) => x.id === r.river);
    if (!riv) return r.ll;
    const i = Math.max(0, riv.pts.findIndex((p) => Math.hypot(p[0] - r.ll[0], p[1] - r.ll[1]) < 0.2) - 1);
    return riv.pts[Math.max(0, i)];
  }

  HN.rebuild = function () {
    const scen = FT.state.scenario;
    /* regional rain + soil moisture */
    for (const rg of V.NREGIONS) {
      const rain = new Float64Array(NT), soil = new Float64Array(NT), alert = new Float64Array(NT);
      let s = 0.35;
      for (let i = 0; i < NT; i++) {
        const t = T0 + i * DT;
        const rr = HN.rainAt(rg.c[0], rg.c[1], t);
        rain[i] = rr;
        s += (Math.min(1, rr / 60) - s * 0.06) * DT * 0.35;
        soil[i] = U.clamp(s, 0.1, 1);
      }
      HN.regions[rg.id] = { rain, soil, alert, def: rg };
    }
    /* reservoirs in cascade order */
    const byRiver = {};
    for (const r of V.NRES) (byRiver[r.river] = byRiver[r.river] || []).push(r);
    for (const arr of Object.values(byRiver)) arr.sort((a, b) => a.ord - b.ord);
    for (const [river, chain] of Object.entries(byRiver)) {
      let upstream = null;
      for (const r of chain) {
        const I = new Float64Array(NT), O = new Float64Array(NT), Z = new Float64Array(NT);
        const up = upstreamPoint(r);
        const turbine = 40 + r.capM * 0.06;                                    // proxy m³/s
        const spillMax = 400 + r.capM * 1.1;
        const catchK = 5 + r.capM * 0.012;
        const trans = river === "da" ? 320 : 0;                                // transboundary base (China)
        let sto = 0.62 * r.capM;                                               // start 62% full
        const ceil = 0.78 * r.capM;                                            // pre-flood ceiling proxy
        let runoff = 0;
        const rg = HN.regions[r.region];
        for (let i = 0; i < NT; i++) {
          const t = T0 + i * DT;
          const rr = HN.rainAt(up[0], up[1], t) * (0.6 + 0.8 * rg.soil[i]);
          runoff += (rr - runoff) * 0.22;
          let inflow = 20 + trans + runoff * catchK * 0.55;
          if (upstream) inflow += upstream.O[Math.max(0, i - Math.round(3 / DT))] * 0.85;
          let out;
          if (sto < ceil * 0.97) out = Math.min(turbine, inflow);
          else {
            const x = U.clamp((sto - ceil * 0.97) / (r.capM - ceil * 0.97), 0, 1);
            out = turbine + (spillMax - turbine) * x * x;
          }
          sto += ((inflow - out) * 3600 * DT) / 1e6;
          sto = U.clamp(sto, r.capM * 0.15, r.capM * 1.05);
          I[i] = inflow; O[i] = out; Z[i] = sto / r.capM;
        }
        HN.res[r.id] = { I, O, Z, def: r, turbine, spillMax };
        upstream = HN.res[r.id];
      }
      /* river flux = normalized last-node outflow + local term */
      const last = HN.res[chain[chain.length - 1].id];
      const flux = new Float64Array(NT);
      let fmax = 1;
      for (let i = 0; i < NT; i++) { flux[i] = last.O[i]; if (flux[i] > fmax) fmax = flux[i]; }
      for (let i = 0; i < NT; i++) flux[i] = flux[i] / fmax;
      HN.riverFlux[river] = flux;
    }
    /* rivers with no dams (Mekong branches): flux from monsoon + tide */
    for (const riv of V.NRIVERS) {
      if (HN.riverFlux[riv.id]) continue;
      const flux = new Float64Array(NT);
      for (let i = 0; i < NT; i++) {
        const t = T0 + i * DT;
        const tide = 0.5 + 0.35 * Math.sin((t / 12.4) * Math.PI * 2);
        flux[i] = U.clamp(0.35 + HN.rainAt(riv.pts[0][0], riv.pts[0][1], t) / 90 + (scen === "monsoon" ? tide * 0.4 : 0), 0, 1);
      }
      HN.riverFlux[riv.id] = flux;
    }
    /* national water-level stations: routed flux + local rain + tide/surge */
    const Ssc = V.NSTORMS[scen];
    for (const g of V.NGAUGES) {
      const stage = new Float64Array(NT);
      const flux = HN.riverFlux[g.river];
      const lag = Math.round(2 / DT);
      let rSm = 0;
      for (let i = 0; i < NT; i++) {
        const t = T0 + i * DT;
        const rr = HN.rainAt(g.ll[0], g.ll[1], t);
        rSm += (rr - rSm) * 0.18;
        let st = g.base + g.amp * (flux ? flux[Math.max(0, i - lag)] : 0.3) * 0.92 + (rSm / 110) * (g.bd[2] - g.base) * 0.35;
        if (g.tidal) st += 0.45 * Math.sin((t / 12.4) * Math.PI * 2) + (scen === "monsoon" ? 0.25 : 0);
        if (Ssc.surge && Ssc.surge.includes(g.region)) {
          const s2 = stormAt(scen, t);
          if (s2.on) {
            const d = Math.hypot(s2.lon - g.ll[0], s2.lat - g.ll[1]);
            if (d < 3) st += s2.inten * (1 - d / 3) * 0.9;
          }
        }
        stage[i] = Math.max(g.base * 0.5, st);
      }
      HN.gauges[g.id] = { stage, def: g };
    }

    /* regional alert: rain + worst reservoir stress + station alert + surge */
    const S = V.NSTORMS[scen];
    for (const rg of V.NREGIONS) {
      const R = HN.regions[rg.id];
      for (let i = 0; i < NT; i++) {
        const t = T0 + i * DT;
        let a = R.rain[i] > 70 ? 3 : R.rain[i] > 40 ? 2 : R.rain[i] > 18 ? 1 : 0;
        for (const r of V.NRES) if (r.region === rg.id) {
          const z = HN.res[r.id].Z[i];
          if (z > 0.98) a = Math.max(a, 3); else if (z > 0.9) a = Math.max(a, 2);
        }
        for (const g of V.NGAUGES) if (g.region === rg.id) a = Math.max(a, HN.alertOfG(g, HN.gauges[g.id].stage[i]));
        if (S.surge && S.surge.includes(rg.id)) {
          const st = stormAt(scen, t);
          if (st.on && st.inten > 0.5 && Math.hypot(st.lon - rg.c[0], st.lat - rg.c[1]) < 3) a = Math.max(a, 2);
          if (scen === "monsoon" && rg.id === "dbscl" && Math.sin((t / 12.4) * Math.PI * 2) > 0.7) a = Math.max(a, 1);
        }
        R.alert[i] = a;
      }
    }
    HN.ready = true;
  };

  /* ---------- interpolated snapshot ---------- */
  const snap = { storm: null, regions: {}, res: {}, flux: {} };
  HN.at = function (t) {
    snap.storm = stormAt(FT.state.scenario, t);
    for (const rg of V.NREGIONS) {
      const R = HN.regions[rg.id];
      let o = snap.regions[rg.id];
      if (!o) o = snap.regions[rg.id] = {};
      o.rain = samp(R.rain, t); o.soil = samp(R.soil, t); o.alert = Math.round(samp(R.alert, t));
    }
    for (const r of V.NRES) {
      const R = HN.res[r.id];
      let o = snap.res[r.id];
      if (!o) o = snap.res[r.id] = {};
      o.Z = samp(R.Z, t); o.I = samp(R.I, t); o.O = samp(R.O, t);
      o.spilling = o.O > R.turbine * 1.3;
      o.stress = o.Z > 0.98 ? 3 : o.Z > 0.9 ? 2 : o.Z > 0.8 ? 1 : 0;
    }
    for (const riv of V.NRIVERS) snap.flux[riv.id] = samp(HN.riverFlux[riv.id], t);
    if (!snap.gauges) snap.gauges = {};
    for (const g of V.NGAUGES) {
      let o = snap.gauges[g.id];
      if (!o) o = snap.gauges[g.id] = {};
      o.stage = samp(HN.gauges[g.id].stage, t);
      o.alert = HN.alertOfG(g, o.stage);
      o.trend = samp(HN.gauges[g.id].stage, t + 3) - o.stage;
    }
    return snap;
  };
  HN.gaugeSeries = (id) => HN.gauges[id];
  HN.samp = samp;

  /* factor chips for a region (for the panel) */
  HN.factors = function (rgId, t) {
    const out = [];
    const scen = FT.state.scenario, S = V.NSTORMS[scen];
    const st = stormAt(scen, t);
    const rg = V.NREGIONS.find((x) => x.id === rgId);
    const R = snap.regions[rgId] || {};
    if (st.on && Math.hypot(st.lon - rg.c[0], st.lat - rg.c[1]) < 3.2 && st.inten > 0.3) out.push("🌀 bão");
    if ((R.rain || 0) > 25) out.push("🌧 mưa lớn");
    if ((R.soil || 0) > 0.7) out.push("💧 đất bão hòa");
    for (const r of V.NRES) if (r.region === rgId && snap.res[r.id] && snap.res[r.id].spilling) { out.push("🔓 xả hồ"); break; }
    if (rgId === "taybac") out.push("🌏 xuyên biên giới");
    if (rgId === "dbscl") out.push("🌏 Mekong thượng nguồn", "🌊 triều cường");
    if (S.surge && S.surge.includes(rgId) && st.inten > 0.4) out.push("🌊 nước dâng");
    return out.slice(0, 4);
  };
})();
