/* FloodTwin — decision layer (docs/99-appendix/demo-gap-analysis.md C-01…C-11)
   Adds the "honesty + decision" layer on top of the existing analytic engine:
     · quantity envelope (provenance / quality / age / uncertainty)   [FR-01]
     · data health + operating level L0–L4                            [FR-02]
     · safety margins: freeboard, dZ/dt, time-to-threshold            [FR-17, FR-42]
     · constraint engine C1–C10 with a feasibility proof              [FR-12]
     · decision package: counterfactual, alternatives, regret,
       deadline, confidence, controllability κ                        [FR-10, 11, 13, 14, 16]
     · append-only audit log with attributed approval                 [FR-04, FR-05]

   IMPORTANT: every number here is derived from the SYNTHETIC engine in hydro.js.
   Nothing in this file may be presented as operational. See docs/06-critique/02-open-risk-register.md R-01.

   Alternatives and the counterfactual are computed EXACTLY, not estimated: the gauge
   response in hydro.buildGauge is linear in the reservoir outflows, so a stage series
   for any rule/mpc mix of reservoirs can be re-derived here without re-integrating. */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, D = FT.data;

  const OPS = (FT.ops = {});
  const vi = () => FT.state.lang === "vi";
  const L = (v, e) => (vi() ? v : e);

  /* ================================================================
     C-03 · MODE — this build is synthetic and can never claim otherwise
     ================================================================ */
  OPS.MODE = "SYNTHETIC";
  OPS.modeLabel = () => L("DỮ LIỆU TỔNG HỢP · KHÔNG DÙNG VẬN HÀNH", "SYNTHETIC DATA · NOT FOR OPERATIONS");

  /* ================================================================
     C-01 · quantity envelope
     ================================================================ */
  const PROV = { MEASURED: "meas", FORECAST: "fcst", MODELLED: "mod", ASSUMED: "asm", SYNTHETIC: "syn" };
  OPS.PROV = PROV;
  OPS.Q = function (value, unit, o) {
    o = o || {};
    return {
      value, unit,
      provenance: o.provenance || "SYNTHETIC",
      quality: o.quality || "OK",
      ageMin: o.ageMin == null ? 0 : o.ageMin,
      band: o.band || null,          // [lo, hi]
      source: o.source || "hydro.js",
      version: o.version || OPS.versions.engine,
      dp: o.dp == null ? 1 : o.dp,
    };
  };
  /* renders value + unit + a provenance dot; age shown only when it matters */
  OPS.html = function (q) {
    if (!q || q.value == null || !isFinite(q.value)) return `<span class="q q-missing">—</span>`;
    const cls = `q q-${PROV[q.provenance] || "syn"}${q.quality !== "OK" ? " q-" + q.quality.toLowerCase() : ""}`;
    const v = q.dp === 0 ? U.fmtInt(q.value) : U.fmt(q.value, q.dp);
    const band = q.band ? `<i class="qBand">${U.fmt(q.band[0], q.dp)}–${U.fmt(q.band[1], q.dp)}</i>` : "";
    const age = q.ageMin > 15 ? `<i class="qAge">${Math.round(q.ageMin)}′</i>` : "";
    return `<span class="${cls}" title="${q.provenance} · ${q.source} · ${q.version}">${v}<em>${q.unit}</em>${band}${age}</span>`;
  };
  OPS.versions = { engine: "hydro-analytic-1.0", thresholds: "QĐ05/2020", rulebook: "QĐ1865/QĐ-TTg", exposure: "synthetic-pop-1.0" };

  /* ================================================================
     C-02 · data health + operating level  (DT-7)
     In this build every feed is synthetic. The degradation control exists so the
     L0→L4 behaviour is demonstrable and testable — it is labelled, never hidden.
     ================================================================ */
  const health = { forced: null, feeds: [] };
  function buildFeeds() {
    health.feeds = [];
    for (const r of D.RESERVOIRS) health.feeds.push({ id: `Z:${r.id}`, name: `${r.name} — mực nước`, critical: true, ageMin: 0 });
    for (const g of D.GAUGES) health.feeds.push({ id: `H:${g.id}`, name: `${g.name} — mực nước sông`, critical: g.id === D.GAUGES[0].id, ageMin: 0 });
    health.feeds.push({ id: "rain", name: "Mưa lưu vực", critical: true, ageMin: 0 });
    health.feeds.push({ id: "qpf", name: "Dự báo mưa tổ hợp", critical: true, ageMin: 0 });
    health.feeds.push({ id: "tide", name: "Triều / nước dâng", critical: false, ageMin: 0 });
    health.feeds.push({ id: "gates", name: "Vị trí cửa van (SCADA)", critical: false, ageMin: 0 });
  }
  OPS.setDegradation = function (lvl) {                 // null | 1 | 2 | 3 | 4
    health.forced = lvl;
    for (const f of health.feeds) f.ageMin = 0;
    if (lvl >= 1) health.feeds.filter((f) => !f.critical).forEach((f) => (f.ageMin = 42));
    if (lvl >= 2) { const g = health.feeds.find((f) => f.id === `H:${D.GAUGES[0].id}`); if (g) g.ageMin = 95; }
    if (lvl >= 3) health.feeds.forEach((f) => (f.ageMin = Math.max(f.ageMin, 180)));
    if (lvl >= 4) health.feeds.forEach((f) => (f.ageMin = 600));
    OPS.audit.log("health.degradation", { level: lvl || 0 });
    FT.bus.emit("opsHealth");
  };
  OPS.health = function () {
    if (!health.feeds.length) buildFeeds();
    let level = 0, oldest = 0, stale = 0, missingCritical = null;
    for (const f of health.feeds) {
      oldest = Math.max(oldest, f.ageMin);
      if (f.ageMin > 15) stale++;
      if (f.critical && f.ageMin > 60 && !missingCritical) missingCritical = f.name;
    }
    if (oldest > 480) level = 4;
    else if (oldest > 170) level = 3;
    else if (missingCritical) level = 2;
    else if (stale) level = 1;
    const reason = level === 0 ? L("Mọi nguồn còn hạn", "All feeds fresh")
      : level === 1 ? L("Một số nguồn phụ đã cũ", "Some non-critical feeds stale")
      : level === 2 ? L(`Thiếu nguồn then chốt: ${missingCritical}`, `Critical feed missing: ${missingCritical}`)
      : level === 3 ? L("Mất kết nối — dùng trạng thái lưu tại chỗ", "No connectivity — running on cached state")
      : L("Không có quan trắc dùng được", "No usable observations");
    return { level, oldest, stale, total: health.feeds.length, fresh: health.feeds.length - stale, reason, feeds: health.feeds, missingCritical };
  };

  /* ================================================================
     C-04 · safety margins per reservoir
     ================================================================ */
  const zToS = (z, r) => r.deadM + (r.capM - r.deadM) * U.clamp((z - r.dead) / (r.fsl - r.dead), 0, 1.1);

  OPS.margins = function (snap, r) {
    const rs = snap.reservoirs[r.id];
    const pk = FT.hydro._activeKey();
    const R = FT.hydro.res[r.id][pk];
    const t = FT.state.timeH;
    /* dZ/dt smoothed over a 1 h window (never differentiate raw samples — hydrology §5) */
    const z1 = FT.hydro.sample(R.Z, Math.max(FT.hydro.T0, t - 0.75));
    const z2 = FT.hydro.sample(R.Z, Math.min(FT.hydro.T1, t + 0.25));
    const dZdt = (z2 - z1) / 1.0;
    const sCeil = zToS(r.ceil, r);
    const sNow = FT.hydro.sample(R.S, t);
    const freeMm3 = Math.max(0, sCeil - sNow);
    const net = rs.I - rs.O;                                   // m³/s
    const tToCeil = net > 5 ? (freeMm3 * 1e6) / (net * 3600) : null;
    const freeboard = r.crest != null ? r.crest - rs.Z : null;
    /* first time the active policy reaches the ceiling → "the reservoir is now a river" */
    let exhaustT = null;
    for (let i = 0; i < FT.hydro.NT; i++) {
      const tt = FT.hydro.T0 + i * FT.hydro.DT;
      if (tt < t) continue;
      if (R.S[i] >= sCeil - 0.5) { exhaustT = tt; break; }
    }
    return { dZdt, freeMm3, tToCeil, freeboard, exhaustT, sCeil, sNow };
  };

  /* ================================================================
     C-09 · controllability κ at the governing control point
     Reproduces the hydro.buildGauge decomposition exactly.
     ================================================================ */
  function gaugeParts(g, t, selection) {
    const Hy = FT.hydro, scen = D.SCENARIOS[FT.state.scenario];
    const iAt = (x) => U.clamp((x - Hy.T0) / Hy.DT, 0, Hy.NT - 1);
    const i = Math.round(iAt(t));
    const j = Math.max(0, i - Math.round(g.lagH / Hy.DT));
    let q = 0;
    for (const r of D.RESERVOIRS) {
      const w = g.resW[r.id] || 0;
      if (!w) continue;
      const pol = selection && selection[r.id] ? selection[r.id] : "rule";
      q += w * Hy.res[r.id][pol].O[j];
    }
    const local = Hy._localRunoff[Math.max(0, i - Math.round((g.lagH * 0.5) / Hy.DT))];
    const resp = q / 1150;
    const loc = (local / 55) * g.localGain;
    const k = scen.surgeGain * 1.35;
    return { res: resp * k, loc: loc * k, base: g.base, max: g.max };
  }
  /* exact stage series for an arbitrary rule/mpc mix — used for alternatives + counterfactual */
  function stageSeries(g, selection) {
    const Hy = FT.hydro, out = new Float64Array(Hy.NT);
    for (let i = 0; i < Hy.NT; i++) {
      const t = Hy.T0 + i * Hy.DT;
      const p = gaugeParts(g, t, selection);
      out[i] = Math.min(g.max, p.base + p.res + p.loc);
    }
    return out;
  }
  OPS.stageSeries = stageSeries;

  OPS.kappa = function (g, t) {
    const p = gaugeParts(g, t, allSel("mpc"));
    const tot = p.res + p.loc;
    return tot > 0.05 ? U.clamp(p.res / tot, 0, 1) : 0;
  };
  function allSel(pol) { const s = {}; for (const r of D.RESERVOIRS) s[r.id] = pol; return s; }

  function peakOf(arr) { let m = -1e9, ti = 0; for (let i = 0; i < arr.length; i++) if (arr[i] > m) { m = arr[i]; ti = i; } return { peak: m, tPeak: FT.hydro.T0 + ti * FT.hydro.DT }; }
  const pkgPeaks = (a, b, g) => ({ a, b, max: g.max });
  const pkgSaturated = (x) => x.a >= x.max - 0.02 && x.b >= x.max - 0.02;
  function hoursAbove(arr, lvl) { let n = 0; for (let i = 0; i < arr.length; i++) if (arr[i] >= lvl) n++; return n * FT.hydro.DT; }

  /* ================================================================
     C-05 · constraint engine (decision engine §4)
     ================================================================ */
  const CFG = (OPS.config = {
    notificationLeadH: 2.0,        // ⚠ VERIFY against the governing procedure
    approvalLeadH: 0.5,
    freeboardMarginM: 1.0,
    riseLimitMh: 0.4,              // downstream rate of rise
    fallLimitMh: 0.2,
    drawdownLimitMh: 0.5,          // dam-side (embankment slope stability)
    worthwhileCutM: 0.15,          // below this, recommend the rule curve (FR-11)
  });

  function C(id, label, status, margin, unit, binding) {
    return { id, label, status, margin, unit, binding: !!binding };
  }
  OPS.constraints = function (resId, g, selection) {
    const Hy = FT.hydro, r = D.RESERVOIRS.find((x) => x.id === resId), out = [];
    const R = Hy.res[resId].mpc;
    let zMax = -1e9, zMin = 1e9, oMax = 0, rampMax = 0, dropMax = 0;
    for (let i = 0; i < Hy.NT; i++) {
      zMax = Math.max(zMax, R.Z[i]); zMin = Math.min(zMin, R.Z[i]); oMax = Math.max(oMax, R.O[i]);
      if (i) {
        rampMax = Math.max(rampMax, Math.abs(R.O[i] - R.O[i - 1]) / Hy.DT);
        dropMax = Math.max(dropMax, (R.Z[i - 1] - R.Z[i]) / Hy.DT);
      }
    }
    out.push(C("C1", L("Trần mực nước hồ", "Reservoir ceiling"), zMax <= r.ceil + 0.05 ? "PASS" : zMax <= r.fsl ? "MARGINAL" : "FAIL", r.ceil - zMax, "m"));
    out.push(C("C2", L("Trên mực nước chết", "Above dead storage"), zMin >= r.dead ? "PASS" : "FAIL", zMin - r.dead, "m"));
    if (r.crest != null) out.push(C("C3", L("Chiều cao an toàn", "Freeboard"), (r.crest - zMax) >= CFG.freeboardMarginM ? "PASS" : "FAIL", r.crest - zMax, "m"));
    out.push(C("C4", L("Năng lực xả", "Spillway capacity"), oMax <= r.spillMax ? "PASS" : "FAIL", r.spillMax - oMax, "m³/s"));
    out.push(C("C6", L("Tốc độ thay đổi xả", "Outflow ramp"), rampMax <= r.spillMax / 6 ? "PASS" : "MARGINAL", r.spillMax / 6 - rampMax, "m³/s/h"));
    out.push(C("C8", L("Tốc độ hạ mực nước hồ", "Dam-side drawdown rate"), dropMax <= CFG.drawdownLimitMh ? "PASS" : "FAIL", CFG.drawdownLimitMh - dropMax, "m/h"));

    /* downstream: routed arrival at the control point — NOT at the dam (red-team 1.2) */
    const selectedStage = stageSeries(g, selection || allSel("mpc"));
    let riseMax = 0, fallMax = 0;
    for (let i = 1; i < selectedStage.length; i++) {
      const d = (selectedStage[i] - selectedStage[i - 1]) / Hy.DT;
      riseMax = Math.max(riseMax, d); fallMax = Math.max(fallMax, -d);
    }
    const pk = peakOf(selectedStage);
    out.push(C("C7", L("Tốc độ nước lên hạ du", "Downstream rate of rise"), riseMax <= CFG.riseLimitMh ? "PASS" : "MARGINAL", CFG.riseLimitMh - riseMax, "m/h"));
    out.push(C("C9", L(`Ngưỡng ${g.name} (BĐ3)`, `${g.name} cap (AL3)`), pk.peak <= g.bd[2] ? "PASS" : pk.peak <= g.bd[2] + 0.3 ? "MARGINAL" : "FAIL", g.bd[2] - pk.peak, "m", pk.peak > g.bd[2]));
    const p = Hy.proposal;
    const leadOK = p ? (p.tStart - FT.state.timeH) >= CFG.notificationLeadH : false;
    out.push(C("C10", L("Thời gian thông báo hạ du", "Downstream notification lead"), leadOK ? "PASS" : "FAIL", p ? p.tStart - FT.state.timeH - CFG.notificationLeadH : 0, "h", !leadOK));
    return out;
  };

  /* Same q05/median estimator as hydro.buildProposal(), extracted for comparison. */
  function probabilityBelowAtPeak(g, key) {
    const e = FT.hydro.gauge[g.id][key];
    let iPk = 0;
    for (let i = 1; i < e.med.length; i++) if (e.med[i] > e.med[iPk]) iPk = i;
    const medPk = e.med[iPk];
    const sigma = Math.max(0.05, (medPk - e.q05[iPk]) / 1.645);
    return U.clamp(U.normCdf((g.bd[2] - medPk) / sigma), 0.01, 0.99);
  }

  OPS.compareOption = function (def) {
    const g = D.GAUGES.find((x) => x.id === def.gaugeId) || D.GAUGES[0];
    const selection = Object.assign({}, def.selection || allSel(def.kind === "RULE" ? "rule" : "mpc"));
    const peak = peakOf(stageSeries(g, selection));
    const selectedReservoirs = Object.keys(selection).filter((id) => selection[id] === "mpc");
    const constraints = [];
    for (const resId of selectedReservoirs) {
      for (const constraint of OPS.constraints(resId, g, selection)) {
        constraints.push(Object.assign({}, constraint, { reservoirId: resId }));
      }
    }
    const hard = constraints.filter((c) => c.status === "FAIL");
    const binding = constraints.find((c) => c.binding) || hard[0] || null;
    const key = def.kind === "RULE" ? "rule" : "mpc";
    return {
      id: def.id,
      kind: def.kind,
      gaugeId: g.id,
      peakM: peak.peak,
      peakTimeH: peak.tPeak,
      feasible: hard.length === 0,
      binding,
      constraints,
      attribution: {
        reservoirIds: selectedReservoirs,
        combinedPeakM: peak.peak,
        combinedPeakTimeH: peak.tPeak,
        bindingGaugeId: g.id,
      },
      exposure: {
        value: null,
        reason: L("Tính khi phương án được vẽ bằng bộ giải hiện hữu.", "Computed when the option is painted by the existing solver."),
        dependency: "world.floodStats",
        lastValidTime: null,
      },
      residualRisk: { pBelowAl3: probabilityBelowAtPeak(g, key), gaugeId: g.id },
      confidence: "LOW",
      versions: Object.assign({}, OPS.versions),
      validTime: FT.state.timeH,
      scenarioId: FT.state.scenario,
    };
  };

  /* ================================================================
     C-06/C-07/C-11 · the decision package
     ================================================================ */
  OPS.package = function (snap) {
    const Hy = FT.hydro, p = Hy.proposal;
    /* the control point the proposal is actually judged at — not always the basin's
       governing gauge, because the instrument may sit on the other river (Thu Bồn) */
    const g = (p && D.GAUGES.find((x) => x.id === p.gaugeId)) || D.GAUGES[0];
    const hl = OPS.health();

    /* DT-7: no observations → no advice. This is a feature. */
    if (hl.level >= 4) {
      return { kind: "REFUSAL", reason: L(
        "Không có quan trắc dùng được — hệ thống KHÔNG đưa ra đề xuất. Hiển thị trạng thái cuối cùng còn hợp lệ, phương án ứng phó khẩn cấp và danh bạ liên lạc.",
        "No usable observations — the system will NOT produce a proposal. Showing the last valid state, the emergency action plan and the contact tree."), health: hl };
    }
    /* DT-7 / FR-02: a missing critical feed disables the optimiser and falls back to
       rule-curve guidance. Naming what is missing — and what is therefore NOT being
       computed — is the point; degrading silently would be worse than not degrading. */
    if (hl.level >= 2) {
      return { kind: "DEGRADED", health: hl, missing: hl.missingCritical,
        reason: L(
          `Thiếu nguồn dữ liệu then chốt (${hl.missingCritical}) — bộ tối ưu bị VÔ HIỆU. Không tính toán đề xuất xả trước, đỉnh dự báo hạ du hay xác suất vượt BĐ. Vận hành theo biểu đồ điều phối cho tới khi nguồn dữ liệu phục hồi.`,
          `Critical feed missing (${hl.missingCritical}) — the optimiser is DISABLED. Pre-release proposals, downstream peak forecasts and exceedance probabilities are NOT being computed. Operate to the rule curve until the feed is restored.`) };
    }
    if (!p) {
      return { kind: "NONE", reason: L("Dòng vào dự báo nằm trong năng lực điều tiết — theo biểu đồ điều phối.",
        "Forecast inflow is within regulation capacity — follow the rule curve."), health: hl };
    }

    const r = D.RESERVOIRS.find((x) => x.id === p.resId);
    const sRule = stageSeries(g, allSel("rule"));           // counterfactual: no action
    const sMpc = stageSeries(g, allSel("mpc"));             // candidate: coordinated cascade
    const pkRule = peakOf(sRule), pkMpc = peakOf(sMpc);
    const cut = pkRule.peak - pkMpc.peak;

    /* The analytic gauge model clips at g.max. When BOTH trajectories sit on that
       ceiling the comparison carries no information, and reporting "no action needed"
       would be a lie in the worst scenario the product has. Say so instead.
       docs/04-decision-support/02-uncertainty-and-confidence.md §1 rule 4. */
    const saturated = pkgSaturated(pkgPeaks(pkRule.peak, pkMpc.peak, g));

    /* FR-11 honest null — the benefit is inside the forecast error */
    const cons = OPS.constraints(p.resId, g);
    const hard = cons.filter((c) => c.status === "FAIL");
    const binding = cons.find((c) => c.binding) || hard[0] || null;

    /* alternatives computed EXACTLY from the linear gauge response */
    const alts = [];
    const single = {}; single[p.resId] = "mpc";
    const sSingle = stageSeries(g, single);
    alts.push({
      key: "single",
      label: L(`Chỉ vận hành ${r.name}`, `Operate ${r.name} only`),
      peak: peakOf(sSingle).peak,
      note: L("Ít phối hợp hơn, hiệu quả cắt đỉnh thấp hơn.", "Less coordination required, smaller peak reduction."),
      selection: single,
    });
    /* two heaviest-weighted reservoirs for this control point */
    const byW = D.RESERVOIRS.slice().sort((a, b) => (g.resW[b.id] || 0) - (g.resW[a.id] || 0));
    const pair = {}; pair[byW[0].id] = "mpc"; pair[byW[1].id] = "mpc";
    alts.push({
      key: "pair",
      label: L(`Phối hợp ${byW[0].name} + ${byW[1].name}`, `Coordinate ${byW[0].name} + ${byW[1].name}`),
      peak: peakOf(stageSeries(g, pair)).peak,
      note: L("Chia tải giữa hai hồ trọng số cao nhất tại trạm khống chế.", "Splits the action across the two highest-weight reservoirs at the control point."),
      selection: pair,
    });

    /* regret — both branches, never collapsed into an expected value */
    const Rr = Hy.res[p.resId].rule, Rm = Hy.res[p.resId].mpc;
    const storageDeficit = Rr.S[Hy.NT - 1] - Rm.S[Hy.NT - 1];        // Mm³ less water kept at T+48
    const extraHoursBD3 = hoursAbove(sRule, g.bd[2]) - hoursAbove(sMpc, g.bd[2]);

    /* confidence (uncertainty §2) */
    const leadToPeak = Math.max(0, pkRule.tPeak - FT.state.timeH);
    let conf = "HIGH", why = [];
    if (leadToPeak > 12) { conf = "MEDIUM"; why.push(L("thời gian dự kiến > 12 h", "lead time > 12 h")); }
    if (leadToPeak > 24) { conf = "LOW"; why.push(L("thời gian dự kiến > 24 h", "lead time > 24 h")); }
    if (hl.level >= 1) { conf = conf === "HIGH" ? "MEDIUM" : conf; why.push(L("một số nguồn dữ liệu đã cũ", "some feeds stale")); }
    if (hl.level >= 2) { conf = "LOW"; why.push(L("thiếu nguồn dữ liệu then chốt", "critical feed missing")); }
    if (FT.state.ensSpread > 1.2) { conf = conf === "HIGH" ? "MEDIUM" : conf; why.push(L("độ tán tổ hợp rộng", "wide ensemble spread")); }
    why.push(L("chưa có hồ sơ kiểm định — độ tin cậy tối đa LOW ở bản tổng hợp", "no verification record — synthetic build capped at LOW"));
    conf = "LOW";                                    // R-01: synthetic build can never exceed LOW

    const deadline = p.tStart - CFG.notificationLeadH - CFG.approvalLeadH;

    if (saturated) {
      conf = "UNUSABLE";
      why = [L("mô hình trạm đã chạm trần biểu diễn — không so sánh được hai chính sách",
               "the gauge model has reached its representable maximum — the two policies cannot be compared")];
    }

    const action = Object.freeze({
      q0: p.q0, q1: p.q1, tStart: p.tStart,
      rampMax: Math.round(r.spillMax / 6),
      endCondition: L(`Z ≤ ${U.fmt(r.ceil - 1.5, 1)} m hoặc hết đỉnh lũ`, `Z ≤ ${U.fmt(r.ceil - 1.5, 1)} m or peak passed`),
      gates: L("mở đối xứng quanh tim tràn (chưa mô hình hoá từng cửa)", "symmetric about the spillway centreline (individual gates not modelled)"),
    });

    return {
      kind: saturated ? "SATURATED" : cut < CFG.worthwhileCutM ? "NULL" : "PROPOSAL",
      saturated,
      id: `DP-${FT.state.scenario}-${Math.round(p.tStart * 10)}`,
      proposalRevision: 1,
      validFromH: FT.state.timeH,
      validUntilH: deadline,
      health: hl,
      reservoir: r,
      gauge: g,
      action,
      constraints: cons,
      feasible: hard.length === 0,
      binding,
      outcome: { peak: pkMpc.peak, tPeak: pkMpc.tPeak, hoursBD3: hoursAbove(sMpc, g.bd[2]) },
      counterfactual: { peak: pkRule.peak, tPeak: pkRule.tPeak, hoursBD3: hoursAbove(sRule, g.bd[2]) },
      cut,
      alternatives: alts,
      regret: {
        actAndMiss: { storageDeficit, note: L("nước đã xả sớm, phải tích lại; rủi ro nếu mùa khô đến sớm", "water released early must be refilled; risk if the dry season starts early") },
        waitAndHit: { extraPeak: cut, extraHoursBD3, note: L("đỉnh cao hơn và thời gian trên BĐ3 dài hơn", "higher peak and longer time above AL3") },
      },
      deadline, deadlineIn: deadline - FT.state.timeH,
      confidence: conf, confidenceWhy: why,
      kappa: OPS.kappa(g, pkRule.tPeak),
      versions: Object.assign({}, OPS.versions),
    };
  };

  /* ================================================================
     C-08 · append-only audit trail (FR-04) + identity (FR-05)
     ================================================================ */
  const KEY = "ft.audit.v1";
  const auditEntries = [];
  const storedAuditEntries = new WeakSet();
  function freezeAuditValue(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freezeAuditValue(child);
    return value;
  }
  function storeAuditEntry(entry, trusted) {
    const frozen = freezeAuditValue(entry);
    auditEntries.push(frozen);
    if (trusted) storedAuditEntries.add(frozen);
    return frozen;
  }
  const audit = (OPS.audit = {
    get entries() {
      return Object.freeze(auditEntries.slice());
    },
    set entries(_value) {
      return false;
    },
    actor: { name: "", role: "" },
    load() {
      auditEntries.length = 0;
      try {
        const loaded = JSON.parse(localStorage.getItem(KEY) || "[]");
        if (Array.isArray(loaded)) loaded.forEach((entry) => storeAuditEntry(entry, false));
      } catch (e) {
        auditEntries.length = 0;
      }
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(auditEntries.slice(-500))); } catch (e) { /* quota */ } },
    hash(o) {                                            // cheap snapshot hash — production requires a cryptographic one
      const s = JSON.stringify(o); let h = 2166136261;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return ("0000000" + (h >>> 0).toString(16)).slice(-8);
    },
    stored(entry) {
      return storedAuditEntries.has(entry) ? entry : null;
    },
    log(action, detail, reason) {
      const e = {
        seq: auditEntries.length + 1,
        tsUtc: new Date().toISOString(),
        simT: FT.state ? U.fmt(FT.state.timeH, 2) : null,
        actor: audit.actor.name ? `${audit.actor.name} (${audit.actor.role})` : "unattributed",
        action, detail: detail || {}, reason: reason || null,
        mode: OPS.MODE,
        scenario: FT.state && FT.state.scenario,
        versions: OPS.versions,
      };
      e.snapshot = audit.hash({ a: action, d: detail, t: e.simT, s: e.scenario });
      const stored = storeAuditEntry(e, true);
      audit.save();
      FT.bus.emit("opsAudit", stored);
      return stored;
    },
    exportText() {
      return auditEntries.map((e) =>
        `#${e.seq} ${e.tsUtc} T${e.simT} [${e.mode}] ${e.actor} — ${e.action} ${JSON.stringify(e.detail)}${e.reason ? ` · reason: ${e.reason}` : ""} · snap ${e.snapshot}`
      ).join("\n");
    },
  });
  audit.load();

  /* ================================================================
     helpers used by the UI
     ================================================================ */
  OPS.fmtHours = function (h) {
    if (h == null || !isFinite(h)) return "—";
    const neg = h < 0; h = Math.abs(h);
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    return `${neg ? "−" : ""}${hh}h${String(mm).padStart(2, "0")}`;
  };
  OPS.confColor = (c) => (c === "HIGH" ? "--ok" : c === "MEDIUM" ? "--al-1" : c === "LOW" ? "--al-2" : "--al-3");

  OPS.init = function () { buildFeeds(); OPS.audit.log("session.start", { build: OPS.versions.engine }); };
})();
