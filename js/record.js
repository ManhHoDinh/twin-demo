/* FloodTwin Q1 Demo — record: the decision record.

   Spec: product-os/database/DB-01-data-model.md §1, product-os/epics/EP-03.
   This is the one artefact that must survive the session, so the whole module
   is written to be verifiable without the application: no DOM access, no
   clocks other than the ones recorded, and a canonical serialisation whose
   hash a stranger can recompute with any SHA-256 implementation.  */
(function () {
  "use strict";

  const FT = window.FT, D = FT.data;
  const R = (FT.record = {});

  const SCHEMA_VERSION = "1.0.0";
  const APP_VERSION = "v126";   // must equal the js?v=NN asset query in index.html (verify-record.mjs check 1)
  const MODEL_VERSION = "hydro-analytic-1 + swe-144-1";
  const PROMPT_VERSION = "none";          /* no model call in this build, ui.js §brief */
  const DATA_VERSION = "vgtb-2026-07";

  /* ==================================================================
     1 · Canonical serialisation
     Sorted keys, fixed precision, no whitespace. Two implementations must
     agree byte for byte or the hash proves nothing, so the number rule is
     the narrow one: round to six decimals, then print with the
     ECMAScript Number-to-String algorithm, which is fully specified and
     therefore identical in every conforming runtime.
     ================================================================== */
  function num(n) {
    if (typeof n !== "number" || !isFinite(n)) return "null";
    const r = Math.round(n * 1e6) / 1e6;
    return Object.is(r, -0) ? "0" : String(r);
  }

  function canon(v) {
    if (v === null || v === undefined) return "null";
    const t = typeof v;
    if (t === "number") return num(v);
    if (t === "boolean") return v ? "true" : "false";
    if (t === "string") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (t === "object") {
      const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
      return "{" + keys.map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
    }
    return "null";
  }

  /* ==================================================================
     2 · SHA-256 (FIPS 180-4)
     Written out rather than delegated to crypto.subtle: that API is
     asynchronous and absent outside a secure context, and this file has to
     work when the demo is opened from a local file. The gate recomputes
     every hash with node:crypto, so an error here fails the build.
     ================================================================== */
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  function utf8Bytes(str) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(str);
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        const lo = str.charCodeAt(i + 1);
        if (lo >= 0xdc00 && lo <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00); i++; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  function sha256(message) {
    const bytes = utf8Bytes(message);
    const len = bytes.length;
    const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[len] = 0x80;
    const bits = len * 8;
    const hi = Math.floor(bits / 4294967296), lo = bits % 4294967296;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, hi, false);
    dv.setUint32(padded.length - 4, lo, false);

    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const W = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));

    for (let off = 0; off < padded.length; off += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      const v = [a, b, c, d, e, f, g, h];
      for (let i = 0; i < 8; i++) H[i] = (H[i] + v[i]) >>> 0;
    }
    return H.map((x) => x.toString(16).padStart(8, "0")).join("");
  }

  R.canon = canon;
  R.sha256 = sha256;
  R.hashOf = (obj) => sha256(canon(obj));

  /* ==================================================================
     3 · Input snapshot, frozen at click time
     DB-01 §3: frozen when the operator acts, not when the document is
     rendered. A snapshot re-read at export time would be internally
     consistent and describe a different world.
     ================================================================== */
  function roundTo(v, d) { const p = Math.pow(10, d); return Math.round(v * p) / p; }

  /* The band around the predicted peak is the model's own ensemble spread read
     at the index where the median peaks — not a margin invented for the
     document. A record that states an interval has to be able to say where the
     interval came from, or it is the kind of number this product argues against. */
  function peakBand(p) {
    const g = FT.data.GAUGES.find((x) => x.name === p.gaugeName);
    const e = g && FT.hydro.gauge[g.id];
    if (!e || !e.mpc || !e.mpc.med) return null;
    let iPeak = 0;
    for (let i = 1; i < e.mpc.med.length; i++) if (e.mpc.med[i] > e.mpc.med[iPeak]) iPeak = i;
    return {
      p05_m: roundTo(e.mpc.q05[iPeak], 3),
      p50_m: roundTo(e.mpc.med[iPeak], 3),
      p95_m: roundTo(e.mpc.q95[iPeak], 3),
      source: "ensemble quantiles of the in-browser routing at the index where the median peaks",
    };
  }

  function snapshot() {
    const H = FT.hydro, S = FT.state;
    const at = H.at(S.timeH);                    /* H.at returns a shared buffer — copy every field out */
    const gauges = {}, reservoirs = {};
    for (const g of D.GAUGES) {
      const gs = at.gauges[g.id];
      gauges[g.id] = {
        name: g.name, river: g.river,
        alert_levels_m: g.bd.slice(),
        stage_m: roundTo(gs.stage, 3),
        alert: gs.alert,
        trend_m_per_3h: roundTo(gs.trend, 3),
      };
    }
    for (const r of D.RESERVOIRS) {
      const rs = at.reservoirs[r.id];
      reservoirs[r.id] = {
        name: r.name,
        level_m: roundTo(rs.Z, 3),
        pre_flood_ceiling_m: r.ceil,
        inflow_m3s: roundTo(rs.I, 1),
        outflow_m3s: roundTo(rs.O, 1),
        spilling: !!rs.spilling,
      };
    }
    const p = H.proposal;
    return {
      scenario_id: S.scenario,
      policy: S.policy,
      sim_time_h: roundTo(S.timeH, 3),
      forcing: { rain_scale: roundTo(S.rainScale, 3), ensemble_spread: roundTo(S.ensSpread, 3) },
      basin: {
        rain_mm_per_h: roundTo(at.rain, 2),
        phase: at.phase,
        alert: at.basinAlert,
      },
      gauges: gauges,
      reservoirs: reservoirs,
      proposal: p ? {
        peak_band: peakBand(p),
        reservoir_id: p.resId,
        release_from_m3s: p.q0,
        release_to_m3s: p.q1,
        start_sim_h: roundTo(p.tStart, 2),
        inflow_peak_sim_h: roundTo(p.tPeak, 2),
        inflow_peak_median_m3s: p.peakI,
        inflow_peak_p90_m3s: p.p90I,
        governing_gauge: p.gaugeName,
        rule_peak_stage_m: roundTo(p.ruleStage, 3),
        mpc_peak_stage_m: roundTo(p.mpcStage, 3),
        p_below_al3: roundTo(p.pBelow, 4),
        clauses: p.cites.slice(),
      } : null,
      versions: {
        app_version: APP_VERSION,
        model_version: MODEL_VERSION,
        prompt_version: PROMPT_VERSION,
        data_version: DATA_VERSION,
        schema_version: SCHEMA_VERSION,
      },
    };
  }
  R.snapshot = snapshot;

  /* ==================================================================
     4 · The ledger — append only
     ================================================================== */
  const records = [];
  const snapshots = {};                          /* input_snapshot_ref → frozen snapshot */
  let seq = 0;
  let open = null;                               /* {sig, recordId|null} — the decision currently in play */

  const OUTCOMES = { approved: 1, rejected: 1, superseded: 1 };

  function refFor(hash, n) { return "snap-" + String(n).padStart(3, "0") + "-" + hash.slice(0, 12); }

  /* A clause is legal text. Everything else in the citation list is a data
     source. The corpus marks the two real legal entries with a d1865_ prefix. */
  function isClause(key) { return /^d\d+_/.test(key); }

  function predictedEffects(snap) {
    const p = snap.proposal;
    if (!p) return [];
    const b = p.peak_band;
    const out = [{
      metric: "peak_stage", gauge: p.governing_gauge, unit: "m",
      median: b ? b.p50_m : p.mpc_peak_stage_m,
      p05: b ? b.p05_m : null,
      p95: b ? b.p95_m : null,
      band_source: b ? b.source : "no ensemble available",
      baseline: p.rule_peak_stage_m,
    }];
    /* The inflow figures the proposal carries are a median and a P90 only.
       Reporting a P05 there would mean inventing one, so the field says so. */
    out.push({
      metric: "inflow_peak", gauge: p.reservoir_id, unit: "m3/s",
      median: p.inflow_peak_median_m3s, p05: null, p95: p.inflow_peak_p90_m3s,
      band_source: "median and P90 member of the routed inflow; no P05 is computed",
    });
    return out;
  }

  /**
   * Seal a decision into the ledger.
   * @param {"approved"|"rejected"|"superseded"} outcome
   * @param {{snap?:object, priorId?:string, reason?:string}} [opts]
   */
  R.seal = function (outcome, opts) {
    if (!OUTCOMES[outcome]) throw new Error("unknown outcome: " + outcome);
    opts = opts || {};
    const snap = opts.snap || snapshot();
    const hash = sha256(canon(snap));
    const n = ++seq;
    const ref = refFor(hash, n);
    snapshots[ref] = snap;

    const wall = new Date();
    const rec = {
      id: "dr-" + String(n).padStart(4, "0"),
      seq: n,
      schema_version: SCHEMA_VERSION,
      outcome: outcome,
      prior_id: opts.priorId || null,
      reason: opts.reason || null,
      created_at_wall: wall.toISOString(),
      created_at_wall_source: "client_clock_unsynchronised",   /* khoá, hiển thị dịch ở ui.js */
      created_at_sim: snap.sim_time_h,
      target_time_sim: opts.targetTimeSim === undefined ? snap.sim_time_h : opts.targetTimeSim,
      scenario_id: snap.scenario_id,
      actor: { id: "demo-visitor", role: "demo, no identity established" },
      input_snapshot_ref: ref,
      input_hash: hash,
      proposal: snap.proposal ? {
        reservoir_schedule: [{
          reservoir_id: snap.proposal.reservoir_id,
          from_m3s: snap.proposal.release_from_m3s,
          to_m3s: snap.proposal.release_to_m3s,
          start_sim_h: snap.proposal.start_sim_h,
          ramp_limit_h: 6,
        }],
        predicted_effects: predictedEffects(snap),
        residual_risk: {
          p_below_al3: snap.proposal.p_below_al3,
          statement: "the release lowers the peak; it does not bring the gauge below the alert level",
        },
      } : null,
      /* Only legal text belongs under "which clause permitted it". The forecast
         and reservoir-state citations are data provenance, and putting them in
         the same list reads as a category error to anyone who checks. */
      citations: (snap.proposal ? snap.proposal.clauses : []).filter(isClause).map((k) => ({
        clause_id: (D.CORPUS[k] && D.CORPUS[k].id) || k,
        clause_key: k,
        verbatim_text_ref: "CORPUS." + k,
      })),
      data_sources: (snap.proposal ? snap.proposal.clauses : []).filter((k) => !isClause(k)).map((k) => ({
        source_key: k,
        verbatim_text_ref: "CORPUS." + k,
      })),
      versions: snap.versions,
      /* Khoá, không phải câu chữ: bản xuất JSON phải trung tính ngôn ngữ, phần
         hiển thị cho người đọc do ui.js dịch. */
      provenance: {
        is_synthetic: true,
        source_keys: ["terrain_real", "legal_real", "forcing_synthetic", "solver_local"],
      },
      demo_flag: true,
      signed: false,
    };
    records.push(rec);
    return rec;
  };

  R.all = () => records.slice();
  R.last = () => (records.length ? records[records.length - 1] : null);
  R.count = () => records.length;
  R.snapshotFor = (rec) => snapshots[rec.input_snapshot_ref] || null;

  /** Recompute the hash from the stored snapshot. Any mutation shows up here. */
  R.verify = function (rec) {
    const snap = snapshots[rec.input_snapshot_ref];
    if (!snap) return { ok: false, reason: "snapshot missing" };
    const h = sha256(canon(snap));
    return { ok: h === rec.input_hash, expected: rec.input_hash, actual: h };
  };

  /* ------------------------------------------------------------------
     Lifecycle: what is currently in play, and what supersedes it.
     A proposal the operator merely looked at is not superseded on every
     slider drag; only a change of the decision context supersedes it,
     which is the transition EP-03 F05 names.
     ------------------------------------------------------------------ */
  R.notePresented = function () {
    const p = FT.hydro && FT.hydro.proposal;
    if (!p || FT.state.policy !== "mpc") return;
    const sig = canon([FT.state.scenario, p.resId, p.q1, p.tStart]);
    if (open && open.sig === sig) return;
    open = { sig: sig, recordId: null };
  };

  R.noteDecided = function (rec) { open = { sig: open ? open.sig : "", recordId: rec.id, outcome: rec.outcome }; };

  /** Called when the decision context changes underneath an open decision. */
  R.noteContextChange = function (reason) {
    if (!open) return null;
    const wasApproved = open.outcome === "approved";
    const priorId = open.recordId;
    if (!wasApproved && !priorId) {
      /* presented but never decided: the operator was shown an option and the
         world moved on. That is audit-relevant, and it is exactly the record
         an outside reviewer asks for. */
      const rec = R.seal("superseded", { reason: reason });
      open = null;
      return rec;
    }
    if (wasApproved) {
      const rec = R.seal("superseded", { priorId: priorId, reason: reason });
      open = null;
      return rec;
    }
    open = null;
    return null;
  };

  R.open = () => open;

  /* ==================================================================
     5 · Export
     ================================================================== */
  R.toJSON = function () {
    return JSON.stringify({
      document: "FloodTwin decision records",
      schema_version: SCHEMA_VERSION,
      demo: true,
      signed: false,
      notice: "DEMO — synthetic inputs, unsigned. Not a record of any real operation.",
      hash_algorithm: "sha256 over the canonical serialisation of input_snapshot",
      canonicalisation: "sorted keys, no whitespace, numbers rounded to 6 decimals",
      records: records,
      snapshots: snapshots,
    }, null, 2);
  };

  R.download = function () {
    const blob = new Blob([R.toJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "floodtwin-decision-records-DEMO.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
})();
