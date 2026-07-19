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
    } catch (err) { fails.push("exception: " + (err && err.message)); }
    if (fails.length) {
      FT.notify(`⚠️ Self-test hydro FAIL: ${fails.join("; ")}`.slice(0, 140), "danger");
      FT.log(`Self-test hydro FAIL: ${fails.join("; ")}`, "danger");
    } else {
      FT.log("Self-test hydro: PASS 4/4 (MPC cắt đỉnh · BĐ3 · quantile · cân bằng khối)", "ok");
    }
    console.info(`[selftest] hydro ${fails.length ? "FAIL: " + fails.join("; ") : "PASS 4/4"}`);
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
