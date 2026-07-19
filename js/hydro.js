/* FloodTwin Q1 Demo — hydro: analytic hydrology + reservoir cascade engine
   Precomputes, for the active scenario, both operating policies over t ∈ [-24, +48] h:
     · basin rainfall (mm/h)                       · reservoir inflow/outflow/level (per policy)
     · gauge stages + ensemble quantiles           · alert levels, phases, MPC proposal
   Everything is deterministic & scrub-safe. Units: flow m³/s, stage m, storage 10⁶ m³. */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, D = FT.data;

  const T0 = -24, T1 = 48, DT = 0.25;                 // h
  const NT = Math.round((T1 - T0) / DT) + 1;          // 289 samples
  const QK = { q05: -1.645, q25: -0.674, q50: 0, q75: 0.674, q95: 1.645 };

  const H = (FT.hydro = {
    t: new Float64Array(NT),
    rain: new Float64Array(NT),                        // basin-mean mm/h (median member)
    res: {},                                           // id → {rule:{I,O,Z,S}, mpc:{...}, proposal}
    gauge: {},                                         // id → {obs, q05..q95, alert arrays per policy}
    phase: [],
    proposal: null,                                    // active MPC decision package
    ready: false,
  });

  const idx = (t) => U.clamp((t - T0) / DT, 0, NT - 1);
  const sampleArr = (arr, t) => {
    const x = idx(t), i = Math.floor(x), f = x - i;
    return i >= NT - 1 ? arr[NT - 1] : arr[i] + (arr[i + 1] - arr[i]) * f;
  };
  H.sample = sampleArr;
  H.T0 = T0; H.T1 = T1; H.DT = DT; H.NT = NT;

  /* ---------- rainfall ---------- */
  function rainAt(t, scen, scale) {
    let r = 0;
    for (const p of scen.pulses) {
      const x = (t - p.t0) / p.dur;                    // gamma-like pulse, skewed rise/fall
      if (x > -0.2 && x < 2.2) {
        const g = Math.pow(Math.max(0, x + 0.2), 1.6) * Math.exp(-2.4 * Math.max(0, x + 0.2));
        r += p.peak * g * 9.5;                           // normalised so pulse max ≈ p.peak
      }
    }
    return r * scale;
  }

  /* smoothed/lagged rain response (leaky reservoir) for runoff shaping */
  function buildRunoff(rainArr, lagH, kRise, kFall) {
    const out = new Float64Array(NT);
    let s = rainArr[0];
    const shift = Math.round(lagH / DT);
    for (let i = 0; i < NT; i++) {
      const inp = rainArr[Math.max(0, i - shift)];
      const k = inp > s ? kRise : kFall;
      s += (inp - s) * U.clamp(k * DT, 0, 1);
      out[i] = s;
    }
    return out;
  }

  /* ---------- reservoir integration for one policy ---------- */
  function integrateReservoir(r, runoff, scen, policy, downstreamCoefSum) {
    const I = new Float64Array(NT), O = new Float64Array(NT), Z = new Float64Array(NT), S = new Float64Array(NT);
    const span = r.capM - r.deadM, zspan = r.fsl - r.dead;
    // inflow: baseflow + runoff scaled by catchment
    const baseQ = 25 * r.catch;
    for (let i = 0; i < NT; i++) I[i] = baseQ + runoff[i] * 30 * r.catch * scen.inflowGain;

    // find forecast peak (known analytically — stands in for the ensemble median forecast)
    let peakI = 0, peakT = 0;
    for (let i = 0; i < NT; i++) if (I[i] > peakI) { peakI = I[i]; peakT = T0 + i * DT; }

    // initial state: 88% of pre-flood ceiling band
    let s = r.deadM + (zToS(r.ceil, r) - r.deadM) * 0.9;
    let o = Math.min(r.turbine, I[0]);
    const rampUp = r.spillMax / (6 / DT);              // gate ramp limit per step
    const preQ = Math.min(r.spillMax * 0.35, Math.max(r.turbine * 3, peakI * 0.45));

    for (let i = 0; i < NT; i++) {
      const t = T0 + i * DT;
      const z = r.dead + zspan * U.clamp((s - r.deadM) / span, 0, 1.06);
      let target;
      if (policy === "mpc") {
        // forecast-informed: draw down ahead of the peak, then absorb, then smooth spill
        const toPeak = peakT - t;
        if (toPeak > 2 && toPeak < 16 && peakI > r.turbine * 4) target = preQ;            // pre-release window
        else if (z > r.ceil) target = Math.min(r.spillMax, I[i] * 1.05);                   // above ceiling: pass inflow
        else if (toPeak <= 2 && peakI > r.turbine * 4) target = Math.max(r.turbine, I[i] * 0.55); // absorb peak into freed buffer
        else target = Math.min(r.turbine, I[i]);
      } else {
        // static rule curve: react on stage thresholds only
        if (z < r.ceil - 0.5) target = Math.min(r.turbine, I[i]);
        else {
          const x = U.smoothstep(r.ceil - 0.5, r.fsl, z);
          target = r.turbine + (r.spillMax - r.turbine) * x * x;
        }
      }
      // downstream soft-cap (MPC only): keep weighted release sum inside gauge capacity
      if (policy === "mpc" && downstreamCoefSum > 0) target = Math.min(target, r.spillMax * 0.55);
      o += U.clamp(target - o, -rampUp, rampUp);
      o = Math.max(0, o);
      if (s <= r.deadM + 4 && o > I[i]) o = I[i];       // never drain below dead storage
      s += ((I[i] - o) * 3600 * DT) / 1e6;
      s = Math.min(s, r.capM * 1.04);
      I[i] = I[i]; O[i] = o; S[i] = s;
      Z[i] = r.dead + zspan * U.clamp((s - r.deadM) / span, 0, 1.06);
    }
    return { I, O, Z, S, peakI, peakT, preQ };
  }
  function zToS(z, r) { return r.deadM + (r.capM - r.deadM) * U.clamp((z - r.dead) / (r.fsl - r.dead), 0, 1.1); }

  /* ---------- gauge stage from routed releases + local runoff ---------- */
  function buildGauge(g, scen, policyKey) {
    const arr = new Float64Array(NT);
    const shift = Math.round(g.lagH / DT);
    for (let i = 0; i < NT; i++) {
      const j = Math.max(0, i - shift);
      let q = 0;
      for (const r of D.RESERVOIRS) { const w = g.resW[r.id] || 0; if (w) q += w * H.res[r.id][policyKey].O[j]; }
      const local = H._localRunoff[Math.max(0, i - Math.round(g.lagH * 0.5 / DT))];
      const resp = q / 1150 + (local / 55) * g.localGain;
      arr[i] = Math.min(g.max, g.base + resp * scen.surgeGain * 1.35);
    }
    // small observed-noise texture on the past
    const rnd = U.mulberry(scen.seed + g.id.length * 7919);
    let n = 0;
    for (let i = 0; i < NT; i++) { n = n * 0.9 + (rnd() - 0.5) * 0.05; arr[i] += (T0 + i * DT < 0 ? n : n * 0.3); }
    return arr;
  }

  /* ---------- ensemble quantiles: lead-time-growing spread around median ---------- */
  function buildQuantiles(median, g) {
    const out = {};
    for (const [k, z] of Object.entries(QK)) {
      const a = new Float64Array(NT);
      for (let i = 0; i < NT; i++) {
        const t = T0 + i * DT;
        const lead = Math.max(0, t);
        const sigma = (0.10 + 0.38 * Math.sqrt(lead / 48)) * FT.state.ensSpread;   // fraction of dynamic range
        const dyn = Math.max(0.4, median[i] - g.base);
        a[i] = t <= 0 ? median[i] : Math.min(g.max * 1.04, Math.max(g.base * 0.55, median[i] + z * sigma * dyn));
      }
      out[k] = a;
    }
    return out;
  }

  /* ---------- MPC proposal (decision package data) ---------- */
  function buildProposal(scen) {
    // most stressed reservoir = largest rule-policy peak inflow vs turbine
    let top = null, stress = 0;
    for (const r of D.RESERVOIRS) {
      const R = H.res[r.id];
      const s = R.rule.peakI / (r.turbine * 4);
      if (s > stress) { stress = s; top = r; }
    }
    if (!top || stress < 1) return null;
    const R = H.res[top.id];
    const g = D.GAUGES[0]; // Ái Nghĩa — governing downstream constraint (Art. 8)
    const ruleStage = H.gauge[g.id].rulePeak, mpcStage = H.gauge[g.id].mpcPeak;
    return {
      resId: top.id, resName: top.name,
      q0: Math.round(R.mpc.preQ * 0.55 / 50) * 50,
      q1: Math.round(R.mpc.preQ / 50) * 50,
      tStart: Math.max(0.5, Math.round((R.rule.peakT - 14) * 2) / 2),
      tPeak: R.rule.peakT,
      peakI: Math.round(R.rule.peakI / 50) * 50,
      p90I: Math.round(R.rule.peakI * 1.55 / 50) * 50,
      gaugeName: g.name, bd3: g.bd[2],
      ruleStage: ruleStage, mpcStage: mpcStage,
      pBelow: U.clamp(0.5 + (g.bd[2] - mpcStage) * 0.55, 0.08, 0.95),
      cites: ["d1865_a7", "d1865_a8", "gencast", "sensor"],
    };
  }

  /* ---------- events (BĐ crossings, peaks, closures come from traffic) ---------- */
  function scanEvents() {
    H.events = [];
    const pk = H._activeKey();
    for (const g of D.GAUGES) {
      const med = H.gauge[g.id][pk].q50 || H.gauge[g.id][pk];
      let prev = 0;
      for (let i = 1; i < NT; i++) {
        const lv = alertOf(g, med[i]);
        if (lv > prev) H.events.push({ tH: T0 + i * DT, kind: lv >= 3 ? "danger" : "warn", key: `ev.bd${lv}`, name: g.name });
        if (lv < prev && lv === 0) H.events.push({ tH: T0 + i * DT, kind: "ok", key: "ev.below", name: g.name });
        prev = Math.max(prev, lv) === prev && lv < prev ? lv : lv; // track current
        prev = lv;
      }
      // peak event
      let pi = 0; for (let i = 1; i < NT; i++) if (med[i] > med[pi]) pi = i;
      if (alertOf(g, med[pi]) >= 2) H.events.push({ tH: T0 + pi * DT, kind: "info", key: "ev.peak", name: g.name });
    }
    let ri = 0; for (let i = 1; i < NT; i++) if (H.rain[i] > H.rain[ri]) ri = i;
    if (H.rain[ri] > 20) H.events.push({ tH: T0 + ri * DT, kind: "info", key: "ev.rainPeak", name: `${Math.round(H.rain[ri])} mm/h` });
    H.events.sort((a, b) => a.tH - b.tH);
  }
  function alertOf(g, stage) { return stage >= g.bd[2] ? 3 : stage >= g.bd[1] ? 2 : stage >= g.bd[0] ? 1 : 0; }
  H.alertOf = alertOf;

  H._activeKey = () => (FT.state.policy === "mpc" && FT.state.mpcApproved ? "mpc" : "rule");

  /* ---------- (re)build everything for active scenario ---------- */
  H.rebuild = function () {
    const scen = D.SCENARIOS[FT.state.scenario];
    for (let i = 0; i < NT; i++) { H.t[i] = T0 + i * DT; H.rain[i] = rainAt(H.t[i], scen, FT.state.rainScale); }
    H._localRunoff = buildRunoff(H.rain, 1.2, 0.45, 0.16);

    for (const r of D.RESERVOIRS) {
      const runoff = buildRunoff(H.rain, r.lagH, 0.5, 0.14);
      H.res[r.id] = {
        rule: integrateReservoir(r, runoff, scen, "rule", 0),
        mpc: integrateReservoir(r, runoff, scen, "mpc", 1),
        def: r,
      };
    }
    for (const g of D.GAUGES) {
      const rule = buildGauge(g, scen, "rule");
      const mpc = buildGauge(g, scen, "mpc");
      const entry = {
        rule: Object.assign(buildQuantiles(rule, g), { med: rule }),
        mpc: Object.assign(buildQuantiles(mpc, g), { med: mpc }),
        def: g,
        rulePeak: Math.max(...rule), mpcPeak: Math.max(...mpc),
      };
      H.gauge[g.id] = entry;
    }
    H.proposal = buildProposal(scen);
    scanEvents();
    H.ready = true;
    FT.bus.emit("hydroRebuilt");
  };

  /* ---------- snapshot at time t (interpolated) for renderers/UI ---------- */
  const snap = { rain: 0, gauges: {}, reservoirs: {}, phase: "phase.calm", basinAlert: 0 };
  H.at = function (t) {
    const pk = H._activeKey();
    snap.rain = sampleArr(H.rain, t);
    let maxAlert = 0, maxRise = 0;
    for (const g of D.GAUGES) {
      const e = H.gauge[g.id];
      const med = e[pk].med;
      const stage = sampleArr(med, t);
      const stage3h = sampleArr(med, t + 3);
      const lv = alertOf(g, stage);
      maxAlert = Math.max(maxAlert, lv);
      maxRise = Math.max(maxRise, stage3h - stage);
      let gs = snap.gauges[g.id];
      if (!gs) gs = snap.gauges[g.id] = {};
      gs.stage = stage; gs.alert = lv; gs.trend = stage3h - stage;
      gs.q05 = sampleArr(e[pk].q05, t); gs.q95 = sampleArr(e[pk].q95, t);
      gs.frac = U.clamp((stage - g.base) / (g.bd[2] - g.base), 0, 1.6);   // 0..1 at BĐ3
    }
    for (const r of D.RESERVOIRS) {
      const R = H.res[r.id][pk];
      let rs = snap.reservoirs[r.id];
      if (!rs) rs = snap.reservoirs[r.id] = {};
      rs.I = sampleArr(R.I, t); rs.O = sampleArr(R.O, t); rs.Z = sampleArr(R.Z, t);
      rs.pct = U.clamp((rs.Z - r.dead) / (r.fsl - r.dead), 0, 1.08);
      rs.ceilPct = (r.ceil - r.dead) / (r.fsl - r.dead);
      rs.overCeil = rs.Z > r.ceil + 0.05;
      rs.spilling = rs.O > r.turbine * 1.15;
    }
    // phase heuristic from main gauge + rain
    const gm = snap.gauges[D.GAUGES[0].id];
    if (gm.stage > D.GAUGES[0].bd[1] && Math.abs(gm.trend) < 0.25) snap.phase = "phase.peak";
    else if (gm.trend > 0.3) snap.phase = "phase.rise";
    else if (gm.trend < -0.25 && gm.stage > D.GAUGES[0].bd[0]) snap.phase = "phase.recede";
    else if (snap.rain > 12) snap.phase = "phase.watch";
    else snap.phase = "phase.calm";
    snap.basinAlert = maxAlert;
    snap.t = t;
    return snap;
  };

  /* series accessor for charts: both policies available for comparison */
  H.series = function (gaugeId) { return H.gauge[gaugeId]; };
  H.reservoirSeries = function (resId) { return H.res[resId]; };

  /* playback event surfaceing: fire log entries crossed between t0→t1 */
  H.emitEventsBetween = function (t0, t1) {
    if (!H.events || t1 <= t0) return;
    for (const ev of H.events) {
      if (ev.tH > t0 && ev.tH <= t1) FT.bus.emit("logEvent", { msg: `${ev.name} — ${FT.i18n.t(ev.key)}`, kind: ev.kind, tH: ev.tH });
    }
  };
})();
