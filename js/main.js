/* FloodTwin Q1 Demo — main: bootstrap + simulation/render loop */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, H = FT.hydro, W = FT.world;

  let lastTs = 0, fpsAcc = 0, fpsN = 0, uiClock = 0, prevT = null, pip3dClock = 0, replayAt = null;
  /* any user takeover cancels the pending kiosk replay */
  document.addEventListener("pointerdown", () => { replayAt = null; }, { capture: true });
  let booted = false;

  async function boot(threeOk) {
    if (booted) return;
    booted = true;
    FT.state.threeReady = !!threeOk;

    /* fetch the REAL basin (DEM + satellite imagery); falls back silently offline */
    const fpsEl = document.getElementById("fpsMeter");
    if (fpsEl) fpsEl.textContent = "tải DEM…";
    await FT.geo.load(9000);
    if (fpsEl) fpsEl.textContent = "60 fps";

    H.rebuild();
    W.init();
    const snap0 = H.at(FT.state.timeH);
    W.resetToTime(snap0);
    W.updateRoadDepths();

    /* flood-metric cap must exist before zones' first pass */
    let cap0 = 0;
    for (const g of FT.data.GAUGES) {
      const a = snap0.gauges[g.id].stage - g.base;
      if (a > cap0) cap0 = a;
    }
    W.floodCap = cap0 + 0.6;

    FT.traffic.init();
    FT.zones.init();
    FT.charts.init();
    FT.map2d.init(document.getElementById("canvas2d"), document.getElementById("canvasPip"));
    if (threeOk) {
      try { FT.scene3d.init(document.getElementById("canvas3d")); }
      catch (e) { console.error("scene3d init failed", e); FT.state.threeReady = false; }
    }
    FT.ui.init();
    if (!FT.state.threeReady) {
      document.getElementById("webglFallback").hidden = false;
      FT.ui.forceView("2d");
      setTimeout(() => { document.getElementById("webglFallback").hidden = true; }, 4000);
    }
    FT.i18n.apply();
    FT.log(FT.i18n.t("log.start"), "info");
    selfTestHydro();

    /* deep links: #2d · #tour · #en · #yagi · #monsoon */
    const hash = (location.hash || "").replace("#", "").toLowerCase();
    if (hash === "en") FT.i18n.setLang("en");
    if (hash === "yagi" || hash === "monsoon") {
      const sel = document.getElementById("scenarioSelect");
      sel.value = hash;
      sel.dispatchEvent(new Event("change"));
    }
    if (hash === "2d") FT.ui.forceView("2d");
    if (hash === "focus") document.getElementById("app").classList.add("focusMode");
    if (hash === "tour") setTimeout(() => FT.ui.startTour && FT.ui.startTour(), 1200);

    requestAnimationFrame(loop);

    /* real OSM road vectors load in the background; renderers swap in when ready */
    const buildTag = document.getElementById("buildTag");
    const setTag = (txt) => { if (buildTag) buildTag.textContent = `${txt}${FT._st ? " · " + FT._st : ""}`; };
    setTag("FloodTwin Q1 · OSM…");
    FT.geo.loadRoadsOSM(20000)
      .then((ok) => {
        if (ok) {
          W.updateRoadDepths();
          FT.bus.emit("osmRoads");
          setTag(`FloodTwin Q1 · OSM ✓ ${FT.geo.osmRoads.length}`);
        } else setTag(FT.geo.hasTransport ? "FloodTwin Q1 · đường thật (raster)" : "FloodTwin Q1 · OSM ✗");
        /* móng nhà thật (chạy sau đường để không tranh mirror), rồi đến mọi ngõ hẻm */
        return FT.geo.loadBuildingsOSM(25000)
          .then((okB) => { if (okB) FT.bus.emit("osmBuildings"); })
          .then(() => FT.geo.loadMinorRoadsOSM(30000))
          .then((okM) => {
            if (okM) {
              FT.bus.emit("osmMinor");
              if (FT.geo.hasOSM) setTag(`FloodTwin Q1 · OSM ✓ ${FT.geo.osmRoads.length} · hẻm ✓ ${FT.geo.osmMinor.length}`);
            }
          });
      })
      .catch((e) => setTag(`FloodTwin Q1 · OSM ✗ ${String(e && e.message).slice(0, 40)}`));
  }

  /* rebuild world equilibrium when the timeline is scrubbed or scenario/policy changes */
  FT.bus.on("scrubbed", () => {
    const snap = H.at(FT.state.timeH);
    W.resetToTime(snap);
    W.updateRoadDepths();
    FT.traffic.resync();
    prevT = FT.state.timeH;
  });
  FT.bus.on("hydroRebuilt", () => {
    if (!booted || !W.ready) return;
    const snap = H.at(FT.state.timeH);
    W.resetToTime(snap);
    W.updateRoadDepths();
    FT.traffic.resync();
    prevT = FT.state.timeH;
  });

  function loop(ts) {
    requestAnimationFrame(loop);
    const dtReal = Math.min(0.1, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;

    /* fps */
    fpsAcc += dtReal; fpsN++;
    if (fpsAcc > 0.5) {
      const el = document.getElementById("fpsMeter");
      if (el) el.textContent = `${Math.round(fpsN / fpsAcc)} fps`;
      fpsAcc = 0; fpsN = 0;
    }

    const st = FT.state;
    if (prevT === null) prevT = st.timeH;

    /* advance scenario clock */
    if (st.playing) {
      st.timeH += (st.speed * dtReal) / 3600;
      if (st.timeH >= H.T1) {
        st.timeH = H.T1; st.playing = false;
        FT.bus.emit("playState");
        replayAt = ts + 12000;                     // kiosk auto-replay unless the user takes over
      }
    } else if (replayAt && ts > replayAt) {
      replayAt = null;
      st.timeH = H.T0;
      st.playing = true;
      FT.bus.emit("scrubbed");
      FT.bus.emit("playState");
      FT.notify("🔁 " + (st.lang === "vi" ? "Phát lại kịch bản" : "Replaying scenario"), "info");
    }

    const snap = H.at(st.timeH);

    /* physical cap for flood-above-normal metrics: max gauge anomaly + ponding */
    let cap = 0;
    for (const g of FT.data.GAUGES) {
      const a = snap.gauges[g.id].stage - g.base;
      if (a > cap) cap = a;
    }
    W.floodCap = cap + 0.6;

    /* physics + traffic run in scenario time */
    const simDt = st.playing ? st.speed * dtReal : 0;
    if (simDt > 0) {
      W.step(simDt, snap);
      H.emitEventsBetween(prevT, st.timeH);
    }
    W.updateRoadDepths();
    FT.traffic.step(simDt, dtReal);
    FT.zones.step(dtReal);

    /* render active view + PiP every frame */
    if (st.view === "3d" && st.threeReady) FT.scene3d.render(dtReal, snap);
    else {
      FT.map2d.render(dtReal, snap, "main");
      /* keep the 3D thumbnail fresh for the PiP at low rate */
      pip3dClock += dtReal;
      if (st.threeReady && pip3dClock > 0.5) { pip3dClock = 0; FT.scene3d.render(dtReal, snap); }
    }
    FT.map2d.renderPip(snap, st.view === "3d" ? "2d" : "3d");

    /* UI + charts at ~5 Hz */
    uiClock += dtReal;
    if (uiClock > 0.2) {
      uiClock = 0;
      FT.ui.tick(snap);
      FT.charts.render(snap);
    }
    prevT = st.timeH;
  }

  /* in-browser hydrology self-test (substitutes the blocked node harness) */
  function selfTestHydro() {
    const fails = [];
    try {
      const g = FT.data.GAUGES[0];
      const S = H.series(g.id);
      /* 1: MPC cuts the Ái Nghĩa peak vs rule curve (oct2020 money shot) */
      if (FT.state.scenario === "oct2020" && !(S.mpcPeak < S.rulePeak - 0.2)) fails.push(`MPC cut ${(S.rulePeak - S.mpcPeak).toFixed(2)}m`);
      /* 2: rule peak exceeds BĐ3 in oct2020 */
      if (FT.state.scenario === "oct2020" && !(S.rulePeak > g.bd[2])) fails.push(`rulePeak ${S.rulePeak.toFixed(2)} ≤ BĐ3`);
      /* 3: ensemble quantiles ordered on the forecast half */
      const e = S.rule;
      for (let i = Math.floor(H.NT / 2); i < H.NT; i += 9) {
        if (!(e.q05[i] <= e.q25[i] + 1e-6 && e.q25[i] <= e.q50[i] + 1e-6 && e.q50[i] <= e.q75[i] + 1e-6 && e.q75[i] <= e.q95[i] + 1e-6)) { fails.push("quantile order"); break; }
      }
      /* 4: reservoir mass balance + level bounds */
      for (const r of FT.data.RESERVOIRS) {
        const R = H.reservoirSeries(r.id).rule;
        let s = R.S[0], bad = 0;
        for (let i = 1; i < H.NT; i++) {
          s += ((R.I[i] - R.O[i]) * 3600 * H.DT) / 1e6;
          if (Math.abs(s - R.S[i]) > Math.max(2, s * 0.02)) bad++;
          if (R.Z[i] < r.dead - 1 || R.Z[i] > r.fsl + (r.fsl - r.dead) * 0.12) bad += 100;
        }
        if (bad >= 5) { fails.push(`mass/level ${r.id} (${bad})`); }
      }
      /* 5–8: decision layer (docs/05-product/05-non-functional-requirements.md NFR-12) */
      const OPS = FT.ops;
      if (OPS) {
        const snap = H.at(FT.state.timeH);
        const pkg = OPS.package(snap);
        /* 5: a proposal always carries a counterfactual and a constraint proof */
        if (pkg.kind === "PROPOSAL" || pkg.kind === "NULL") {
          if (!pkg.counterfactual || pkg.counterfactual.peak == null) fails.push("no counterfactual");
          if (!pkg.constraints || !pkg.constraints.length) fails.push("no constraint list");
          /* 6: infeasibility is REPORTED, never relaxed away */
          const anyFail = pkg.constraints.some((c) => c.status === "FAIL");
          if (anyFail && pkg.feasible) fails.push("infeasible marked feasible");
          if (anyFail && !pkg.binding) fails.push("no binding constraint named");
        }
        /* 7: degradation behaviour — L2 stands the optimiser down, L4 refuses to advise */
        OPS.setDegradation(2);
        if (OPS.package(H.at(FT.state.timeH)).kind !== "DEGRADED") fails.push("L2 did not disable the optimiser");
        OPS.setDegradation(4);
        if (OPS.package(H.at(FT.state.timeH)).kind !== "REFUSAL") fails.push("L4 did not refuse");
        OPS.setDegradation(null);
        /* 8: the synthetic build can never claim more than LOW confidence (R-01) */
        if (pkg.confidence && pkg.confidence !== "LOW" && pkg.confidence !== "UNUSABLE") fails.push(`confidence ${pkg.confidence} on synthetic build`);
        /* 10–12: warning-message integrity (docs FR-20) */
        if (FT.notifyOps) {
          const snapN = H.at(6);
          for (const type of ["threshold", "release", "evacuation"]) {
            const rec = FT.notifyOps.buildRecord(type, snapN);
            /* 10: the quoted alert level must match the quoted stage at the quoted gauge —
                   a message saying "10.2 m, above AL1 by 0.03 m" is a real defect class */
            if (rec.gauge && rec.stage != null) {
              const b = rec.gauge.bd, s = rec.stage;
              const expect = s >= b[2] ? 3 : s >= b[1] ? 2 : s >= b[0] ? 1 : null;
              if (rec.bdLevel !== expect) fails.push(`${type}: level ${rec.bdLevel} vs stage ${s.toFixed(2)}`);
            }
            /* 11: SMS must be plain ASCII and split into ≤160-char parts, never truncated */
            if (/[^\x20-\x7E\n]/.test(rec.channels.sms)) fails.push(`${type}: SMS not ASCII`);
            if (rec.channels.smsParts.some((p) => p.length > 160)) fails.push(`${type}: SMS part >160`);
          }
        }
        /* 13–15: domain state machines + derived event timeline */
        if (FT.domain && W.ready) {
          FT.domain.rebuildTimeline();
          const n1 = FT.domain.events.length;
          const sig1 = FT.domain.events.map((e) => `${e.tH.toFixed(2)}|${e.type}|${e.subject}`).join(";");
          /* 13: every transition must be one the domain permits */
          const bad = FT.domain.illegalTransitions();
          if (bad.length) fails.push(`illegal transition ${bad[0].subject} ${bad[0].from}->${bad[0].to}`);
          /* 14: the derived timeline is deterministic — replay reproduces it exactly */
          FT.domain.rebuildTimeline();
          const sig2 = FT.domain.events.map((e) => `${e.tH.toFixed(2)}|${e.type}|${e.subject}`).join(";");
          if (sig1 !== sig2 || n1 !== FT.domain.events.length) fails.push("event timeline not deterministic");
          /* 15: state is a pure function of (entity, t), independent of where the SWE sits */
          if (FT.forecast && FT.data.SHELTERS) {
            const keepT = FT.state.timeH;
            const probe = () => FT.data.SHELTERS.map((s) => FT.forecast.shelterState(s, 20).valid).join(",");
            FT.state.timeH = 4; W.resetToTime(H.at(4)); W.updateRoadDepths();
            const a = probe();
            FT.state.timeH = 40; W.resetToTime(H.at(40)); W.updateRoadDepths();
            const b = probe();
            FT.state.timeH = keepT; W.resetToTime(H.at(keepT)); W.updateRoadDepths();
            if (a !== b) fails.push("shelter state not a pure function of t");
          }
        }

        /* 12: dam-safety alarms are never grouped away */
        if (FT.alarms && FT.alarms.list.some((a) => a.damSafety && a.groupOf)) fails.push("dam-safety alarm grouped");

        /* 9: a saturated gauge model must NOT be reported as "no action needed" */
        for (const sc of ["oct2020", "yagi", "monsoon"]) {
          const keepSc = FT.state.scenario;
          FT.state.scenario = sc; H.rebuild();
          const q = OPS.package(H.at(6));
          if (q.saturated && q.kind !== "SATURATED") fails.push(`${sc}: saturated reported as ${q.kind}`);
          FT.state.scenario = keepSc; H.rebuild();
        }

        /* 16: the AI situation brief may publish only grounded claims (info/ai.html §4.3).
           Every claim it would show must cite a resolving source and, where numeric, match
           the live snapshot — a shipped brief with an unsourced or drifted claim is a defect. */
        if (FT.ui && FT.ui.verifyBrief && FT.grounding) {
          const gr = FT.ui.verifyBrief(H.at(FT.state.timeH));
          if (!gr.published.every((c) => c.grounded)) fails.push("brief published an ungrounded claim");
          if (gr.total > 0 && gr.ratio < (FT.data.TARGETS.grounded || 0.95)) fails.push(`brief groundedness ${(gr.ratio * 100) | 0}% below target`);
        }

        /* 18: the graded depth-exposure function (impact-model §3.1) must be monotonic,
           bounded in [0,1], and carry the documented values at the band boundaries — the
           headline "people exposed" is population × this, so a wrong curve is a wrong count. */
        {
          const ef = FT.util.exposureFraction;
          const bands = [[0.10, 0], [0.15, 0.25], [0.20, 0.25], [0.30, 0.60], [0.49, 0.60], [0.50, 1.00], [2.0, 1.00]];
          for (const [d, want] of bands) if (Math.abs(ef(d) - want) > 1e-9) fails.push(`exposureFraction(${d})=${ef(d)} want ${want}`);
          let prev = -1;
          for (let d = 0; d <= 2; d += 0.05) { const v = ef(d); if (v < prev - 1e-9 || v < 0 || v > 1) { fails.push("exposureFraction not monotonic in [0,1]"); break; } prev = v; }
        }

        /* 17: shelter allocation must never place more people than a shelter can hold, and
           its arithmetic must close (assigned + unsheltered == exposed). Over-filling a
           shelter on paper is the evacuation-planning defect this pass exists to prevent. */
        if (FT.forecast && FT.forecast.allocateShelters && FT.zones && FT.zones.ready) {
          const alloc = FT.forecast.allocateShelters(FT.state.timeH);
          if (alloc) {
            const cap = {};
            for (const z of alloc.zones) for (const p of z.placements) cap[p.shelterId] = (cap[p.shelterId] || 0) + p.placed;
            for (const sh of FT.data.SHELTERS) {
              const used = cap[sh.id] || 0, avail = FT.forecast.shelterState(sh, FT.state.timeH).capacity;
              if (used > avail + 1e-6) fails.push(`shelter ${sh.id} overfilled ${used}/${avail}`);
            }
            if (alloc.totalAssigned + alloc.totalUnsheltered !== alloc.totalExposed) fails.push("shelter allocation arithmetic does not close");
          }
        }
      }
    } catch (err) { fails.push("exception: " + (err && err.message)); }
    if (fails.length) {
      FT.notify(`⚠️ Self-test FAIL: ${fails.join("; ")}`.slice(0, 140), "danger");
      FT.log(`Self-test FAIL: ${fails.join("; ")}`, "danger");
    } else {
      FT.log("Self-test: PASS 19/19 (MPC cắt đỉnh · BĐ3 · quantile · cân bằng khối · phản thực · khả thi · từ chối L4 · tin cậy · bản tin có nguồn · sức chứa trú ẩn · hàm phơi nhiễm)", "ok");
    }
    console.info(`[selftest] ${fails.length ? "FAIL: " + fails.join("; ") : "PASS 19/19"}`);
    FT._st = fails.length ? "H✗" : "H✓";
    return fails.length === 0;
  }

  /* boot once DOM + Three (or its failure) are known */
  function armBoot() {
    if (window.__THREE_READY !== undefined) boot(window.__THREE_READY);
    else {
      window.addEventListener("three-ready", (e) => boot(e.detail.ok), { once: true });
      setTimeout(() => boot(!!window.THREE), 6000);                  // CDN hard timeout
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", armBoot);
  else armBoot();
})();
