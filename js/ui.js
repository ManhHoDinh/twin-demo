/* FloodTwin Q1 Demo — ui: panels, KPIs, timeline transport, modals,
   bounded-LLM briefs (every clause cited), toasts, event log. */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, D = FT.data;
  let H;

  const $ = (id) => document.getElementById(id);
  const el = {};
  let resRefs = [], closureSig = "", rebuildTimer = null, logCount = 0;

  const UI = (FT.ui = {});

  /* ---------- citation chip ---------- */
  function cite(key) {
    const c = D.CORPUS[key];
    if (!c) return "";
    const txt = FT.state.lang === "vi" ? c.text_vi : c.text_en;
    return ` <span class="cite" title="${txt.replace(/"/g, "&quot;")}">${c.id}</span>`;
  }

  /* ---------- modal ---------- */
  function openModal(titleKey, bodyHTML) {
    el.modalTitle.textContent = FT.i18n.t(titleKey);
    el.modalBody.innerHTML = bodyHTML;
    el.modalScrim.hidden = false;
  }
  function closeModal() { el.modalScrim.hidden = true; }

  /* ---------- MPC text ---------- */
  function mpcText() {
    const p = H.proposal;
    if (!p) return FT.state.lang === "vi" ? "Không có đề xuất — dòng vào dự báo trong năng lực điều tiết." : "No proposal — forecast inflow within regulation capacity.";
    if (FT.state.lang === "vi") {
      return `Xả trước <b>${U.fmtInt(p.q0)} → ${U.fmtInt(p.q1)} m³/s</b> tại <b>${p.resName}</b> từ <b>T+${p.tStart}h</b>, giữ trạm ${p.gaugeName} dưới BĐ3 (${p.bd3} m) với xác suất <b>${Math.round(p.pBelow * 100)}%</b> theo trung vị ensemble.`;
    }
    return `Pre-release <b>${U.fmtInt(p.q0)} → ${U.fmtInt(p.q1)} m³/s</b> at <b>${p.resName}</b> from <b>T+${p.tStart}h</b>, keeping ${p.gaugeName} below AL3 (${p.bd3} m) with <b>${Math.round(p.pBelow * 100)}%</b> probability on the ensemble median.`;
  }

  function decisionPackageHTML() {
    const p = H.proposal;
    if (!p) return "<p>—</p>";
    const vi = FT.state.lang === "vi";
    return `
      <div class="decisionKpis">
        <div><span>${vi ? "P(dưới BĐ3)" : "P(below AL3)"}</span><strong>${Math.round(p.pBelow * 100)}%</strong></div>
        <div><span>${vi ? "Bắt đầu" : "Start"}</span><strong>T+${p.tStart}h</strong></div>
        <div><span>${vi ? "Đỉnh dòng vào" : "Inflow peak"}</span><strong>T+${U.fmt(p.tPeak, 0)}h</strong></div>
      </div>
      <h4>${FT.i18n.t("dp.proposed")}</h4>
      <p><b>${p.resName}</b>: ${U.fmtInt(p.q0)} → ${U.fmtInt(p.q1)} m³/s (ramp ≤ 6h)${cite("sensor")}</p>
      <h4>${FT.i18n.t("dp.envelope")}</h4>
      <p>${vi ? "Trung vị" : "Median"} ~${U.fmtInt(p.peakI)} m³/s · P90 ~${U.fmtInt(p.p90I)} m³/s / 18h${cite("gencast")}</p>
      <h4>${FT.i18n.t("dp.downstream")}</h4>
      <p>${p.gaugeName}: ${vi ? "rule curve" : "rule curve"} ${U.fmt(p.ruleStage, 1)} m → MPC ${U.fmt(p.mpcStage, 1)} m (BĐ3 = ${p.bd3} m)${cite("surrogate")}</p>
      <h4>${FT.i18n.t("dp.legal")}</h4>
      <p>${cite("d1865_a7")}${cite("d1865_a8")}</p>
      <h4>${FT.i18n.t("dp.residual")}</h4>
      <p>${vi
        ? `Nếu dòng vào theo nhánh P90, ${p.gaugeName} vượt BĐ3 ~0,2 m — cân nhắc hạ mực nước sớm hơn.`
        : `If inflow follows the P90 member, ${p.gaugeName} exceeds AL3 by ~0.2 m — consider earlier drawdown.`}${cite("gencast")}</p>
      <div class="mpcActions" style="margin-top:12px">
        <button id="dpApprove" class="btnPrimary" type="button">${FT.i18n.t("mpc.approve")}</button>
        <button id="dpReject" type="button">${FT.i18n.t("mpc.reject")}</button>
      </div>`;
  }

  /* ---------- briefs ---------- */
  function situationBriefHTML(snap) {
    const vi = FT.state.lang === "vi";
    const g0 = D.GAUGES[0];
    const gs = snap.gauges[g0.id];
    const ts = FT.traffic.stats();
    const S = H.series(g0.id)[H._activeKey()];
    const q95in12 = H.sample(S.q95, Math.min(H.T1, FT.state.timeH + 12));
    const spilling = D.RESERVOIRS.filter((r) => snap.reservoirs[r.id].spilling);
    const parts = [];
    parts.push(vi
      ? `Lưu vực đang ở pha <b>${FT.i18n.t(snap.phase)}</b>, mưa trung bình <b>${U.fmt(snap.rain, 0)} mm/h</b>.${cite("gencast")}${cite("nchmf")}`
      : `The basin is in <b>${FT.i18n.t(snap.phase)}</b> phase with mean rainfall <b>${U.fmt(snap.rain, 0)} mm/h</b>.${cite("gencast")}${cite("nchmf")}`);
    parts.push(vi
      ? `Trạm ${g0.name} đạt <b>${U.fmt(gs.stage, 2)} m</b> (${gs.alert ? "BĐ" + gs.alert : "dưới BĐ1"}), xu thế ${gs.trend >= 0 ? "lên" : "xuống"} ${U.fmt(Math.abs(gs.trend), 1)} m/3h.${cite("sensor")}`
      : `${g0.name} gauge reads <b>${U.fmt(gs.stage, 2)} m</b> (${gs.alert ? "AL" + gs.alert : "below AL1"}), ${gs.trend >= 0 ? "rising" : "falling"} ${U.fmt(Math.abs(gs.trend), 1)} m/3h.${cite("sensor")}`);
    if (spilling.length) {
      const names = spilling.map((r) => `${r.name} (${U.fmtInt(snap.reservoirs[r.id].O)} m³/s)`).join(", ");
      parts.push(vi ? `Đang xả điều tiết: ${names}.${cite("d1865_a7")}${cite("sensor")}` : `Regulating releases: ${names}.${cite("d1865_a7")}${cite("sensor")}`);
    }
    parts.push(vi
      ? `Giao thông: <b>${ts.openPct}%</b> mạng thông suốt, ${ts.closed} đoạn đóng, ETA Đà Nẵng→Hội An ${ts.etaMin > 0 ? ts.etaMin + " phút" : "không khả dụng"}.${cite("surrogate")}`
      : `Traffic: <b>${ts.openPct}%</b> of the network open, ${ts.closed} closed links, Đà Nẵng→Hội An ETA ${ts.etaMin > 0 ? ts.etaMin + " min" : "unavailable"}.${cite("surrogate")}`);
    const worst = FT.zones && FT.zones.worst ? FT.zones.worst(2) : [];
    if (worst.length) {
      const names = worst.map((z) => `${z.def.name} (${U.fmt(z.maxD, 1)} m${z.accessOk ? "" : vi ? ", mất tuyến EOC" : ", EOC cut"})`).join("; ");
      parts.push(vi
        ? `Khu vực trọng điểm: ${names} — tổng ${U.fmtInt(worst.reduce((s, z) => s + z.exposed, 0))} người phơi nhiễm.${cite("surrogate")}${cite("sensor")}`
        : `Priority areas: ${names} — total ${U.fmtInt(worst.reduce((s, z) => s + z.exposed, 0))} people exposed.${cite("surrogate")}${cite("sensor")}`);
    }
    parts.push(vi
      ? `Triển vọng 12h: nhánh P95 tại ${g0.name} đạt <b>${U.fmt(q95in12, 1)} m</b> ${q95in12 >= g0.bd[2] ? "— <b>có rủi ro vượt BĐ3</b>" : "(dưới BĐ3)"}.${cite("gencast")}`
      : `12-h outlook: the P95 member at ${g0.name} reaches <b>${U.fmt(q95in12, 1)} m</b> ${q95in12 >= g0.bd[2] ? "— <b>AL3 exceedance risk</b>" : "(below AL3)"}.${cite("gencast")}`);
    if (FT.state.policy === "mpc" && H.proposal) {
      parts.push(`${mpcText()}${cite("d1865_a8")}`);
    }
    return parts.map((p) => `<p>${p}</p>`).join("");
  }

  function citizenHTML(snap) {
    const vi = FT.state.lang === "vi";
    if (!H.ready) return `<p class="abstain">${vi ? "Thiếu bản tin hợp lệ — vui lòng theo kênh chính thức." : "No valid bulletin — please follow official channels."}</p>`;
    const g = D.GAUGES.find((x) => x.id === "cauLau");
    const S = H.series(g.id)[H._activeKey()];
    const t12 = Math.min(H.T1, FT.state.timeH + 12);
    const q50 = H.sample(S.q50, t12), q95 = H.sample(S.q95, t12);
    const frac = U.clamp((q50 - g.bd[0]) / (g.bd[2] - g.bd[0]), 0, 1);
    const prob = Math.round(U.clamp(0.15 + frac * 0.75, 0.05, 0.9) * 100);
    const q = vi ? "“Tối nay đường nhà tôi ở Hội An có ngập không?”" : "“Will my street in Hội An flood tonight?”";
    let a;
    if (q50 < g.bd[0] && q95 < g.bd[1]) {
      a = vi
        ? `Theo bản tin hiện hành, mực nước Thu Bồn tại Câu Lâu dự báo <b>dưới BĐ1</b> trong 12 giờ tới — khả năng ngập đường khu trung tâm là thấp. Đây là ước lượng xác suất; hãy theo dõi thông báo chính thức.`
        : `Per the current bulletin, the Thu Bồn at Câu Lâu is forecast to stay <b>below AL1</b> over the next 12 h — street flooding downtown is unlikely. This is a probabilistic estimate; follow official notices.`;
    } else {
      a = vi
        ? `Dựa trên bản tin NCHMF và dự báo mới nhất, có khoảng <b>${prob}%</b> khả năng nước đạt <b>0,3–0,6 m</b> tại các tuyến thấp ven sông Hội An trong đêm nay (Câu Lâu dự báo ${U.fmt(q50, 1)} m, P95 ${U.fmt(q95, 1)} m so với BĐ2 = ${g.bd[1]} m). Đây là ước lượng xác suất; hãy tuân theo thông báo sơ tán chính thức.`
        : `Based on the NCHMF bulletin and the latest forecast, there is about a <b>${prob}%</b> chance of <b>0.3–0.6 m</b> of water on low riverside streets of Hội An tonight (Câu Lâu forecast ${U.fmt(q50, 1)} m, P95 ${U.fmt(q95, 1)} m vs AL2 = ${g.bd[1]} m). This is a probabilistic estimate; follow official evacuation notices.`;
    }
    return `<p><i>${q}</i></p><p>${a}${cite("nchmf")}${cite("gencast")}${cite("surrogate")}</p><p style="color:var(--ink-2);font-size:11px">${vi ? "LLM chỉ tổng hợp — độ sâu lấy từ surrogate đã kiểm định, không do mô hình ngôn ngữ tự bịa." : "The LLM only assembles — depths come from the validated surrogate, never invented by the language model."}</p>`;
  }

  /* ---------- controls wiring ---------- */
  UI.init = function () {
    H = FT.hydro;
    [
      "btnPlay", "playIcon", "speedGroup", "scrubber", "simClock", "simRel", "simPhase",
      "viewTabs", "camPresets", "pipSwap", "pipTag", "viewModeTag", "mapHint",
      "scenarioSelect", "policyToggle", "policyTag", "langToggle",
      "mpcCard", "mpcText", "mpcConfidence", "mpcApprove", "mpcReject", "mpcDetails",
      "gaugeSelect", "gaugeStageNow", "gaugeTrend", "gaugeAlert", "gaugeCrps",
      "layerToggles", "rainScale", "ensSpread", "rainScaleVal", "ensSpreadVal",
      "kpiAlertValue", "kpiRainValue", "kpiGaugeValue", "kpiRoadsValue", "kpiLeadValue",
      "resList", "vehCount", "trOpen", "trClosed", "trReroute", "trEta", "closureList",
      "llmBrief", "btnBrief", "btnCitizen", "eventLog", "logCount",
      "floodedArea", "peopleExposed", "modalScrim", "modalTitle", "modalBody", "modalClose",
      "toasts", "zoneList", "zonesSummary", "kpiZonesValue",
    ].forEach((id) => (el[id] = $(id)));

    /* transport */
    el.btnPlay.addEventListener("click", togglePlay);
    FT.bus.on("playState", () => { el.playIcon.textContent = FT.state.playing ? "⏸" : "▶"; });
    document.addEventListener("keydown", (ev) => {
      const tag = (ev.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") {
        if (!(ev.target === el.scrubber && (ev.key === "ArrowLeft" || ev.key === "ArrowRight" || ev.key === " "))) return;
      }
      if (ev.key === " ") { ev.preventDefault(); togglePlay(); }
      else if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
        ev.preventDefault();
        const d = (ev.key === "ArrowRight" ? 1 : -1) * (ev.shiftKey ? 6 : 1);
        FT.state.timeH = U.clamp(FT.state.timeH + d, H.T0, H.T1);
        el.scrubber.value = FT.state.timeH;
        FT.bus.emit("scrubbed");
      }
    });
    el.speedGroup.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        FT.state.speed = +b.dataset.speed;
        el.speedGroup.querySelectorAll("button").forEach((x) => x.classList.toggle("isActive", x === b));
      })
    );
    el.scrubber.addEventListener("input", () => {
      FT.state.timeH = parseFloat(el.scrubber.value);
      FT.bus.emit("scrubbed");
    });

    /* views */
    el.viewTabs.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => setView(b.dataset.view))
    );
    el.pipSwap.addEventListener("click", () => setView(FT.state.view === "3d" ? "2d" : "3d"));
    el.pipSwap.title = "2D ⇄ 3D";
    el.camPresets.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        FT.scene3d && FT.scene3d.setCamera && FT.scene3d.setCamera(b.dataset.cam);
        el.camPresets.querySelectorAll("button").forEach((x) => x.classList.toggle("isActive", x === b));
      })
    );

    /* scenario & policy */
    el.scenarioSelect.value = FT.state.scenario;
    el.scenarioSelect.addEventListener("change", () => {
      FT.state.scenario = el.scenarioSelect.value;
      FT.state.mpcApproved = false;
      el.mpcCard.classList.remove("approved");
      H.rebuild();
      refreshMpc();
      FT.notify(`${FT.i18n.t("toast.scenario")}: ${FT.i18n.t(D.SCENARIOS[FT.state.scenario].key)}`, "info");
    });
    el.policyToggle.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        const pol = b.dataset.policy;
        if (pol === FT.state.policy) return;
        FT.state.policy = pol;
        el.policyToggle.querySelectorAll("button").forEach((x) => x.classList.toggle("isActive", x === b));
        FT.state.mpcApproved = false;
        el.mpcCard.classList.remove("approved");
        el.mpcApprove.textContent = FT.i18n.t("mpc.approve");
        el.mpcCard.hidden = pol !== "mpc";
        el.policyTag.textContent = pol === "mpc" ? "MPC" : "Rule curve";
        if (pol === "mpc") { refreshMpc(); FT.notify(FT.i18n.t("toast.mpcOn"), "info"); }
        FT.bus.emit("hydroRebuilt");
      })
    );
    el.mpcApprove.addEventListener("click", approveMpc);
    el.mpcReject.addEventListener("click", rejectMpc);
    el.mpcDetails.addEventListener("click", () => {
      openModal("modal.decision", decisionPackageHTML());
      const ap = $("dpApprove"), rj = $("dpReject");
      if (ap) ap.addEventListener("click", () => { approveMpc(); closeModal(); });
      if (rj) rj.addEventListener("click", () => { rejectMpc(); closeModal(); });
    });

    /* gauge select */
    buildGaugeSelect();
    el.gaugeSelect.addEventListener("change", () => {
      FT.state.selectedGauge = el.gaugeSelect.value;
      FT.bus.emit("gaugeSelected", FT.state.selectedGauge);
    });
    FT.bus.on("gaugeSelected", (id) => { el.gaugeSelect.value = id; });

    /* layers */
    el.layerToggles.querySelectorAll("input[data-layer]").forEach((cb) =>
      cb.addEventListener("change", () => { FT.state.layers[cb.dataset.layer] = cb.checked; })
    );

    /* forcing sliders */
    const debouncedRebuild = () => {
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(() => { H.rebuild(); refreshMpc(); }, 250);
    };
    el.rainScale.addEventListener("input", () => {
      FT.state.rainScale = el.rainScale.value / 100;
      el.rainScaleVal.textContent = `${U.fmt(FT.state.rainScale, 2)}×`;
      debouncedRebuild();
    });
    el.ensSpread.addEventListener("input", () => {
      FT.state.ensSpread = el.ensSpread.value / 100;
      el.ensSpreadVal.textContent = `${U.fmt(FT.state.ensSpread, 2)}×`;
      debouncedRebuild();
    });

    /* lang */
    el.langToggle.addEventListener("click", () => {
      FT.i18n.setLang(FT.state.lang === "vi" ? "en" : "vi");
      el.langToggle.innerHTML = FT.state.lang === "vi" ? "<b>VI</b> / EN" : "VI / <b>EN</b>";
      buildGaugeSelect();
      buildResList();
      refreshMpc();
      setView(FT.state.view);
    });
    el.langToggle.innerHTML = "<b>VI</b> / EN";

    /* modals */
    el.modalClose.addEventListener("click", closeModal);
    el.modalScrim.addEventListener("click", (ev) => { if (ev.target === el.modalScrim) closeModal(); });
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeModal(); });

    /* LLM briefs */
    el.btnBrief.addEventListener("click", () => {
      const snap = H.at(FT.state.timeH);
      const html = situationBriefHTML(snap);
      openModal("modal.brief", html);
      el.llmBrief.innerHTML = html;
    });
    el.btnCitizen.addEventListener("click", () => {
      openModal("modal.citizen", citizenHTML(H.at(FT.state.timeH)));
    });
    $("btnReport").addEventListener("click", () => {
      buildPrintReport(H.at(FT.state.timeH));
      window.print();
    });
    const btnMethod = $("btnMethod");
    if (btnMethod) btnMethod.addEventListener("click", () => {
      const vi = FT.state.lang === "vi";
      openModal("modal.method", vi ? `
        <h4>Thật (chạy trong trình duyệt)</h4>
        <p>· Mô phỏng nước mặt: <b>shallow-water height-field</b> (virtual pipes, Mei 2007) lưới 144², chỉ chạy động lực trên đồng bằng &lt;28 m — thượng lưu là đoạn chẩn đoán (tương ứng cấu trúc 1D/2D của paper §5).<br>
        · <b>Đồng hóa mực trạm</b> dọc hành lang sông (vòng lặp DA của twin, §6).<br>
        · <b>Routing hồ chứa</b> tích phân cân bằng khối cho cả hai chính sách (rule curve §3 · MPC §6), ensemble lan rộng theo lead time.<br>
        · <b>Giao thông</b>: Dijkstra thời gian thực trên mạng đường, đóng ở ≥30 cm (He 2026).<br>
        · Ngưỡng báo động BĐ1/2/3, tên hồ/trạm/sông, khung pháp lý QĐ 1865/QĐ-TTg là <b>thật</b>.</p>
        <h4>Bản đồ thật</h4>
        <p>· Địa hình: <b>DEM thật</b> (AWS Terrain Tiles z11) cho bbox 107,55–108,45°E / 15,30–16,16°N (96 km); ảnh <b>Esri World Imagery z12</b> + tile động theo khung nhìn tới <b>z19 (~0,3 m/px)</b> khi zoom; <b>đường thật</b> Esri World Transportation cùng mức zoom (vector OSM khi trình duyệt cho phép); tọa độ đập/trạm/khu là vị trí thật.</p>
        <h4>Tổng hợp (minh hoạ)</h4>
        <p>· Mưa/dòng vào là hàm giải tích khớp hình dạng sự kiện 10/2020 & Yagi; tòa nhà suy ra từ pixel ảnh (không phải footprint từng căn); chỉ số CSI/NSE/KGE là <b>mục tiêu thiết kế §8</b>, không phải đo đạc.<br>
        · Bản tin LLM là khuôn mẫu có trích dẫn — minh hoạ ràng buộc groundedness ≥ 0,95 (§7), không gọi mô hình thật.</p>
        <h4>Ánh xạ paper</h4>
        <p>Forcing §4 → thanh cưỡng bức · Surrogate §5 → SWE + chip 68× · Tối ưu §6 → Rule⇄MPC + gói quyết định · LLM §7 → bản tin/hỏi đáp · Benchmark §8 → thẻ chỉ số.</p>` : `
        <h4>Real (runs in your browser)</h4>
        <p>· Surface water: <b>shallow-water height-field</b> (virtual pipes, Mei 2007), 144² grid, dynamics on the &lt;28 m floodplain only — upstream reaches are diagnostic (mirroring the paper's 1D/2D split, §5).<br>
        · <b>Gauge-stage assimilation</b> along river corridors (the twin's DA loop, §6).<br>
        · <b>Reservoir routing</b> with mass balance for both policies (rule curve §3 · MPC §6); ensemble spread grows with lead time.<br>
        · <b>Traffic</b>: live Dijkstra over the road graph, closures at ≥30 cm (He 2026).<br>
        · Alert stages AL1/2/3, reservoir/gauge/river names and the 1865/QD-TTg legal frame are <b>real</b>.</p>
        <h4>Real map</h4>
        <p>· Terrain: <b>real DEM</b> (AWS Terrain Tiles z11) over 107.55–108.45°E / 15.30–16.16°N (96 km); <b>Esri World Imagery z12</b> + viewport tiles up to <b>z19 (~0.3 m/px)</b> on zoom; <b>real roads</b> via Esri World Transportation at matching zoom (OSM vectors when the browser allows); dam/gauge/zone coordinates are real.</p>
        <h4>Synthetic (illustrative)</h4>
        <p>· Rainfall/inflows are analytic functions shaped after Oct-2020 & Yagi; buildings are inferred from imagery pixels (not per-building footprints); the CSI/NSE/KGE shown are the paper's <b>§8 design targets</b>, not measurements.<br>
        · The LLM brief is a cited template — illustrating the ≥0.95 groundedness bound (§7), no live model call.</p>
        <h4>Paper mapping</h4>
        <p>Forcing §4 → forcing panel · Surrogate §5 → SWE + 68× chip · Optimisation §6 → Rule⇄MPC + decision package · LLM §7 → briefs · Benchmarks §8 → metric card.</p>`);
    });

    /* toasts + log */
    FT.bus.on("toast", ({ msg, kind }) => {
      while (el.toasts.children.length >= 3) el.toasts.firstChild.remove();
      const t = document.createElement("div");
      t.className = `toast ${kind}`;
      t.textContent = msg;
      el.toasts.appendChild(t);
      setTimeout(() => t.remove(), 5000);
    });
    FT.bus.on("logEvent", ({ msg, kind, tH }) => {
      const li = document.createElement("li");
      li.className = kind;
      const c = U.clock(tH);
      li.innerHTML = `<time>${c.hm} ${U.rel(tH)}</time><span></span>`;
      li.querySelector("span").textContent = msg;
      li.title = "⏱ " + U.rel(tH);
      li.style.cursor = "pointer";
      li.addEventListener("click", () => {                 // jump the twin to the event's moment
        FT.state.timeH = U.clamp(tH, H.T0, H.T1);
        el.scrubber.value = FT.state.timeH;
        FT.bus.emit("scrubbed");
      });
      el.eventLog.prepend(li);
      while (el.eventLog.children.length > 40) el.eventLog.lastChild.remove();
      logCount++;
      el.logCount.textContent = logCount;
    });
    FT.bus.on("reservoirFocus", (id) => {
      const ref = resRefs.find((r) => r.id === id);
      if (ref) {
        ref.root.scrollIntoView({ block: "nearest", behavior: "smooth" });
        ref.root.classList.add("blink");
        setTimeout(() => ref.root.classList.remove("blink"), 2000);
      }
    });

    FT.bus.on("zoneSelected", (id) => openZoneDetail(id));

    /* focus mode: hide side rails to maximise the map */
    const bf = $("btnFocus");
    if (bf) bf.addEventListener("click", () => {
      document.getElementById("app").classList.toggle("focusMode");
      FT.scene3d && FT.scene3d.resize && FT.scene3d.resize();
    });

    /* tour: start button + cancel on any user input */
    $("btnTour").addEventListener("click", (ev) => { ev.stopPropagation(); startTour(); });
    ["pointerdown", "keydown", "wheel"].forEach((evt) =>
      document.addEventListener(evt, (ev) => {
        if (!tourActive) return;
        if (ev.target && (ev.target.id === "btnTour" || ev.target.closest && ev.target.closest("#btnTour"))) return;
        stopTour();
      }, { capture: true })
    );

    buildResList();
    refreshMpc();
    el.mpcCard.hidden = FT.state.policy !== "mpc";
    setView(FT.state.view);
    el.scrubber.value = FT.state.timeH;
    window.addEventListener("resize", () => FT.scene3d && FT.scene3d.resize && FT.scene3d.resize());
  };

  /* ---------- printable situation report ---------- */
  function buildPrintReport(snap) {
    const t = FT.i18n.t;
    const c = U.clock(FT.state.timeH);
    const ts = FT.traffic.stats();
    const zsorted = (FT.zones.sorted || FT.zones.list).slice(0, 6);
    const g0 = D.GAUGES[0];
    const S = H.series(g0.id);
    const html = `
      <h1>${t("report.title")}</h1>
      <div class="prMeta">${t("report.at")}: ${c.hm} ${c.dm} (${U.rel(FT.state.timeH)}) · ${t(D.SCENARIOS[FT.state.scenario].key)} · ${FT.state.policy === "mpc" ? "FloodTwin MPC" : "Rule curve"}</div>
      <h2>${t("report.gauges")}</h2>
      <table><tr><th></th><th>${t("report.stage")}</th><th>BĐ1/2/3</th><th>${t("report.alert")}</th><th>P95 +12h</th></tr>
      ${D.GAUGES.map((g) => {
        const gs = snap.gauges[g.id];
        const q95 = H.sample(H.series(g.id)[H._activeKey()].q95, Math.min(H.T1, FT.state.timeH + 12));
        return `<tr><td>${g.name} (${g.river})</td><td>${U.fmt(gs.stage, 2)}</td><td>${g.bd.join(" / ")}</td><td>${gs.alert ? "BĐ" + gs.alert : "—"}</td><td>${U.fmt(q95, 1)}</td></tr>`;
      }).join("")}</table>
      <h2>${t("report.res")}</h2>
      <table><tr><th></th><th>${t("report.level")}</th><th>${t("report.ceil")}</th><th>${t("report.io")}</th></tr>
      ${D.RESERVOIRS.map((r) => {
        const rs = snap.reservoirs[r.id];
        return `<tr><td>${r.name}</td><td>${U.fmt(rs.Z, 1)}</td><td>${r.ceil}</td><td>${U.fmtInt(rs.I)} / ${U.fmtInt(rs.O)}</td></tr>`;
      }).join("")}</table>
      <h2>${t("report.zones")}</h2>
      <table><tr><th></th><th>${t("report.depth")}</th><th>${t("report.exposed")}</th><th>${t("report.access")}</th></tr>
      ${zsorted.map((z) => `<tr><td>${z.def.name}</td><td>${U.fmt(z.maxD, 2)}</td><td>${U.fmtInt(z.exposed)}</td><td>${z.accessOk ? z.accessMin + "′" : t("zone.accessCut")}</td></tr>`).join("")}</table>
      <h2>${t("report.traffic")}</h2>
      <p>${t("tr.open")}: ${ts.openPct}% · ${t("tr.closed")}: ${ts.closed} · ${t("tr.eta")}: ${ts.etaMin > 0 ? ts.etaMin + "′" : "—"}</p>
      <h2>${t("report.brief")}</h2>
      <div class="prBrief">${situationBriefHTML(snap)}</div>
      <p style="margin-top:3mm">${$("mpcCompare") ? $("mpcCompare").textContent : ""}</p>
      <div class="prFoot">${t("foot.mode")} · FloodTwin Q1 Demo · ${S ? `Peak rule ${U.fmt(S.rulePeak, 1)} m / MPC ${U.fmt(S.mpcPeak, 1)} m` : ""}</div>`;
    $("printReport").innerHTML = html;
  }

  /* ---------- guided demo tour ---------- */
  let tourTimers = [], tourActive = false;
  function tourJump(t) {
    FT.state.timeH = U.clamp(t, H.T0, H.T1);
    el.scrubber.value = FT.state.timeH;
    FT.bus.emit("scrubbed");
  }
  function setPolicyBtn(pol) {
    const b = el.policyToggle.querySelector(`[data-policy="${pol}"]`);
    if (b && FT.state.policy !== pol) b.click();
  }
  function stopTour(silent) {
    if (!tourActive) return;
    tourActive = false;
    tourTimers.forEach(clearTimeout);
    tourTimers = [];
    $("btnTour").classList.remove("running");
    FT.state.speed = 1800;
    if (!silent) FT.notify(FT.i18n.t("tour.cancel"), "info");
  }
  function startTour() {
    if (tourActive) { stopTour(); return; }
    tourActive = true;
    $("btnTour").classList.add("running");
    closeModal();
    /* reset to a clean rule-curve run */
    if (FT.state.scenario !== "oct2020") { el.scenarioSelect.value = "oct2020"; el.scenarioSelect.dispatchEvent(new Event("change")); }
    setPolicyBtn("rule");
    const peakT = H.proposal ? H.proposal.tPeak : 16;
    const steps = [
      [0, () => { setView("3d"); FT.scene3d.setCamera && FT.scene3d.setCamera("overview"); tourJump(-4); FT.state.playing = true; FT.state.speed = 5400; FT.bus.emit("playState"); FT.notify(FT.i18n.t("tour.s1"), "info"); }],
      [9, () => { tourJump(6); FT.scene3d.setCamera && FT.scene3d.setCamera("delta"); FT.notify(FT.i18n.t("tour.s2"), "warn"); }],
      [18, () => { tourJump(peakT); setView("2d"); FT.notify(FT.i18n.t("tour.s3"), "danger"); }],
      [27, () => { setView("3d"); FT.scene3d.setCamera && FT.scene3d.setCamera("dams"); setPolicyBtn("mpc"); tourJump(Math.max(-2, (H.proposal ? H.proposal.tStart : 2) - 3)); FT.notify(FT.i18n.t("tour.s4"), "info"); }],
      [35, () => { approveMpc(); const c = $("mpcCompare"); if (c) { c.classList.add("blink"); setTimeout(() => c.classList.remove("blink"), 2500); } FT.notify(FT.i18n.t("tour.s5"), "ok"); }],
      [42, () => { tourJump(peakT); setView("2d"); FT.notify(FT.i18n.t("tour.s6"), "ok"); }],
      [51, () => { setView("3d"); FT.scene3d.setCamera && FT.scene3d.setCamera("hoian"); el.btnBrief.click(); }],
      [60, () => { closeModal(); FT.notify(FT.i18n.t("tour.end"), "info"); stopTour(true); }],
    ];
    for (const [d, fn] of steps) tourTimers.push(setTimeout(() => { if (tourActive) fn(); }, d * 1000));
  }

  function togglePlay() {
    if (!FT.state.playing && FT.state.timeH >= FT.hydro.T1) FT.state.timeH = FT.hydro.T0;  // replay
    FT.state.playing = !FT.state.playing;
    FT.bus.emit("playState");
  }

  function approveMpc() {
    if (FT.state.policy !== "mpc") return;
    FT.state.mpcApproved = true;
    el.mpcCard.classList.add("approved");
    el.mpcApprove.textContent = FT.i18n.t("mpc.approved");
    FT.notify(FT.i18n.t("toast.approved"), "ok");
    FT.log(FT.i18n.t("mpc.applied"), "ok");
    FT.bus.emit("hydroRebuilt");
  }
  function rejectMpc() {
    FT.state.mpcApproved = false;
    el.mpcCard.classList.remove("approved");
    el.mpcApprove.textContent = FT.i18n.t("mpc.approve");
    FT.notify(FT.i18n.t("toast.rejected"), "info");
    FT.bus.emit("hydroRebuilt");
  }
  function refreshMpc() {
    el.mpcText.innerHTML = mpcText();
    el.mpcConfidence.textContent = H.proposal ? `${Math.round(H.proposal.pBelow * 100)}%` : "—";
    /* head-to-head peak comparison at the governing gauge */
    const cmp = $("mpcCompare");
    if (cmp) {
      const g0 = D.GAUGES[0];
      const S = H.series(g0.id);
      const cut = S.rulePeak - S.mpcPeak;
      const vi = FT.state.lang === "vi";
      cmp.innerHTML = `${vi ? "Đỉnh" : "Peak"} ${g0.name}: <em>Rule</em> ${U.fmt(S.rulePeak, 1)} m → <em>MPC</em> ${U.fmt(S.mpcPeak, 1)} m ${cut > 0.05 ? `<b>(−${U.fmt(cut, 1)} m)</b>` : ""} · BĐ3 ${g0.bd[2]} m`;
    }
  }

  function setView(v) {
    if (v === "3d" && !FT.state.threeReady) v = "2d";
    FT.state.view = v;
    el.viewTabs.querySelectorAll("button").forEach((b) => {
      const on = b.dataset.view === v;
      b.classList.toggle("isActive", on);
      b.setAttribute("aria-selected", on);
      if (b.dataset.view === "3d" && !FT.state.threeReady) b.disabled = true;
    });
    $("canvas3d").classList.toggle("isActive", v === "3d");
    $("canvas2d").classList.toggle("isActive", v === "2d");
    $("labels3d").style.display = v === "3d" ? "" : "none";
    el.viewModeTag.textContent = v.toUpperCase();
    el.mapHint.querySelector("strong").textContent = FT.i18n.t(v === "2d" ? "hint.pan2d" : "hint.orbit");
    el.camPresets.style.display = v === "3d" ? "" : "none";
    el.pipTag.textContent = v === "3d" ? "2D" : "3D";
    document.getElementById("pipSwap").style.display = FT.state.threeReady ? "" : "none";
  }
  UI.forceView = setView;

  /* ---------- monitored zones ---------- */
  let zoneRefs = new Map(), zoneSparkTimer = null;

  function flyToZone(zs) {
    if (FT.state.view === "2d") FT.map2d.flyTo && FT.map2d.flyTo(zs.def.x, zs.def.y, 3.6);
    else if (FT.scene3d.flyToPoint) FT.scene3d.flyToPoint(zs.def.x, zs.def.y);
  }

  function nearestGauge(zs) {
    let best = null, bd = 1e9;
    for (const g of D.GAUGES) {
      const d = Math.hypot(g.x - zs.def.x, g.y - zs.def.y);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  function drawZoneSpark(canvas, zs) {
    const dpr2 = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    if (r.width < 4) return;
    canvas.width = r.width * dpr2; canvas.height = r.height * dpr2;
    const c = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    c.clearRect(0, 0, w, h);
    const hist = zs.hist;
    if (hist.length < 2) return;
    const t0 = hist[0][0], t1 = Math.max(hist[hist.length - 1][0], t0 + 0.5);
    let dMax = 0.4;
    for (const p of hist) if (p[1] > dMax) dMax = p[1];
    const X = (t) => ((t - t0) / (t1 - t0)) * (w - 34 * dpr2) + 4 * dpr2;
    const Y = (d) => h - 14 * dpr2 - (d / dMax) * (h - 24 * dpr2);
    /* thresholds */
    c.strokeStyle = "rgba(255,160,64,0.5)"; c.setLineDash([4, 3]);
    c.beginPath(); c.moveTo(0, Y(0.35)); c.lineTo(w, Y(0.35)); c.stroke();
    c.strokeStyle = "rgba(255,82,82,0.5)";
    c.beginPath(); c.moveTo(0, Y(0.8)); c.lineTo(w, Y(0.8)); c.stroke();
    c.setLineDash([]);
    /* area */
    c.beginPath();
    hist.forEach((p, i) => (i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1]))));
    c.strokeStyle = U.css("--accent"); c.lineWidth = 1.8 * dpr2; c.stroke();
    c.lineTo(X(hist[hist.length - 1][0]), Y(0)); c.lineTo(X(hist[0][0]), Y(0)); c.closePath();
    c.fillStyle = "rgba(55,182,255,0.14)"; c.fill();
    /* last value */
    const last = hist[hist.length - 1];
    c.fillStyle = "#fff";
    c.font = `${9 * dpr2}px ui-monospace, monospace`;
    c.textAlign = "left";
    c.fillText(`${U.fmt(last[1], 2)} m`, X(last[0]) + 4 * dpr2, Y(last[1]) - 3 * dpr2);
  }

  function zoneDetailHTML(zs) {
    const vi = FT.state.lang === "vi";
    const g = nearestGauge(zs);
    const snap = H.at(FT.state.timeH);
    const gs = snap.gauges[g.id];
    return `
      <div class="zoneDetailGrid">
        <div><span>${FT.i18n.t("zone.depth")}</span><strong>${U.fmt(zs.maxD, 2)} m</strong></div>
        <div><span>${FT.i18n.t("zone.exposed")}</span><strong>${U.fmtInt(zs.exposed)}</strong></div>
        <div><span>${FT.i18n.t("zone.access")}</span><strong style="${zs.accessOk ? "" : "color:var(--al-3)"}">${zs.accessOk ? zs.accessMin + " " + FT.i18n.t("unit.min") : FT.i18n.t("zone.accessCut")}</strong></div>
        <div><span>${FT.i18n.t("zone.gauge")}</span><strong>${g.name} ${U.fmt(gs.stage, 1)} m${gs.alert ? " · BĐ" + gs.alert : ""}</strong></div>
      </div>
      ${FT.state.threeReady ? `<p style="margin:2px 0 6px;font-size:12px">🏠 <b>~${U.fmtInt(FT.scene3d.homesInRadius(zs.def.x, zs.def.y, zs.def.r))}</b> ${FT.i18n.t("impact.homes").toLowerCase()} (≥15 cm)</p>` : ""}
      <h4>${FT.i18n.t("zone.history")}</h4>
      <canvas class="zoneSpark" id="zoneSparkCanvas"></canvas>
      <h4>${FT.i18n.t("zone.pois")}</h4>
      ${zs.pois.map((p) => `<div class="poiRow"><span>${p.t === "hosp" ? "🏥" : p.t === "bridge" ? "🌉" : p.t === "school" ? "🏫" : p.t === "herit" ? "🏮" : p.t === "eoc" ? "🚨" : "🛣️"}</span>${p.n}<b class="${p.ok ? "ok" : "bad"}">${p.ok ? FT.i18n.t("zone.ok") : FT.i18n.t("zone.flooded") + " " + Math.round(p.depth * 100) + " cm"}</b></div>`).join("")}
      <h4>${FT.i18n.t("zone.actions")}</h4>
      ${zs.actions.length ? `<ul class="zoneActions">${zs.actions.map((a) => `<li>${a}</li>`).join("")}</ul>` : `<p style="color:var(--ink-2)">${vi ? "Chưa cần hành động — tiếp tục theo dõi." : "No action needed — keep monitoring."}</p>`}
      <div class="mpcActions" style="margin-top:12px">
        <button id="zoneFly" class="btnPrimary" type="button">🎯 ${FT.i18n.t("zone.flyto")}</button>
      </div>`;
  }

  function openZoneDetail(id) {
    const zs = FT.zones.byId(id);
    if (!zs) return;
    el.modalTitle.textContent = `${FT.i18n.t("modal.zone")} — ${zs.def.name} · ${FT.i18n.t("zone.st" + zs.status)}`;
    el.modalBody.innerHTML = zoneDetailHTML(zs);
    el.modalScrim.hidden = false;
    const fly = $("zoneFly");
    if (fly) fly.addEventListener("click", () => { flyToZone(zs); closeModal(); });
    const spark = $("zoneSparkCanvas");
    const draw = () => { if (!el.modalScrim.hidden && document.body.contains(spark)) drawZoneSpark(spark, zs); };
    requestAnimationFrame(draw);
    clearInterval(zoneSparkTimer);
    zoneSparkTimer = setInterval(() => { if (el.modalScrim.hidden) clearInterval(zoneSparkTimer); else draw(); }, 1000);
  }

  function updateZonePanel() {
    if (!FT.zones || !FT.zones.ready) return;
    const sorted = FT.zones.sorted || FT.zones.list;
    for (const zs of sorted) {
      let ref = zoneRefs.get(zs.def.id);
      if (!ref) {
        const root = document.createElement("div");
        root.innerHTML = `<i class="zDot"></i><span class="zName"></span><span class="zDepth"></span><span class="zMeta"><span class="m1"></span><span class="m2"></span><span class="m3"></span></span><div class="zMeter"><i></i></div>`;
        root.addEventListener("click", () => { openZoneDetail(zs.def.id); flyToZone(zs); });
        ref = {
          root,
          dot: root.querySelector(".zDot"),
          name: root.querySelector(".zName"),
          depth: root.querySelector(".zDepth"),
          m1: root.querySelector(".m1"), m2: root.querySelector(".m2"), m3: root.querySelector(".m3"),
          meter: root.querySelector(".zMeter i"),
        };
        zoneRefs.set(zs.def.id, ref);
      }
      ref.root.className = `zoneItem st${zs.status}`;
      ref.dot.style.background = U.alertColor(zs.status);
      ref.dot.style.boxShadow = `0 0 8px ${U.alertColor(zs.status)}`;
      ref.name.textContent = zs.def.name;
      ref.depth.textContent = zs.maxD > 0.02 ? `${U.fmt(zs.maxD, 2)} m` : "—";
      ref.m1.textContent = `${U.fmtInt(zs.exposed)} ${FT.i18n.t("unit.people")}`;
      ref.m2.className = `m2 ${zs.trend > 0.01 ? "up" : zs.trend < -0.01 ? "down" : ""}`;
      ref.m2.textContent = zs.trend > 0.01 ? "▲" : zs.trend < -0.01 ? "▼" : "•";
      ref.m3.className = `m3 ${zs.accessOk ? "" : "cut"}`;
      ref.m3.textContent = zs.accessOk ? `EOC ${zs.accessMin}′` : FT.i18n.t("zone.accessCut");
      /* mean-depth meter: compare flood intensity across areas at a glance */
      ref.meter.style.width = `${Math.min(100, (zs.meanD / 1.2) * 100)}%`;
      ref.meter.style.background = U.alertColor(zs.status);
      el.zoneList.appendChild(ref.root);            // re-append = reorder by severity
    }
    const c = FT.zones.counts();
    el.zonesSummary.textContent = `${c.red} 🔴 · ${c.orange} 🟠`;
    el.kpiZonesValue.textContent = `${c.orange} / ${c.red}`;
    el.kpiZonesValue.style.color = c.red > 0 ? U.css("--al-3") : c.orange > 0 ? U.css("--al-2") : "";
  }

  function buildGaugeSelect() {
    el.gaugeSelect.innerHTML = "";
    for (const g of D.GAUGES) {
      const o = document.createElement("option");
      o.value = g.id;
      o.textContent = `${g.name} — ${g.river}`;
      el.gaugeSelect.appendChild(o);
    }
    el.gaugeSelect.value = FT.state.selectedGauge;
  }

  function buildResList() {
    el.resList.innerHTML = "";
    resRefs = [];
    for (const r of D.RESERVOIRS) {
      const root = document.createElement("div");
      root.className = "resItem";
      root.innerHTML = `
        <div class="resName">${r.name}<small></small></div>
        <div class="resFlows"><span class="fi"></span> · <b class="fo"></b></div>
        <div class="resGauge"><i></i><em></em></div>
        <canvas class="resSpark"></canvas>
        <div class="resMeta"><span class="zm"></span><span class="pr"></span></div>`;
      root.querySelector("em").style.setProperty("--ceil", `${((r.ceil - r.dead) / (r.fsl - r.dead)) * 100}%`);
      el.resList.appendChild(root);
      resRefs.push({
        id: r.id, r, root,
        small: root.querySelector("small"),
        fi: root.querySelector(".fi"),
        fo: root.querySelector(".fo"),
        bar: root.querySelector(".resGauge"),
        fill: root.querySelector(".resGauge i"),
        spark: root.querySelector(".resSpark"),
        zm: root.querySelector(".zm"),
        pr: root.querySelector(".pr"),
      });
      root.addEventListener("click", () => FT.bus.emit("reservoirFocus", r.id));
    }
  }

  /* inflow (grey) vs outflow (cyan) mini history per reservoir, with now-marker */
  function drawResSparks() {
    const pk = H._activeKey();
    for (const ref of resRefs) {
      const cv = ref.spark;
      if (!cv) continue;
      const rect = cv.getBoundingClientRect();
      if (rect.width < 8) continue;
      const dpr2 = Math.min(2, window.devicePixelRatio || 1);
      const wpx = (rect.width * dpr2) | 0;
      if (cv.width !== wpx) { cv.width = wpx; cv.height = (rect.height * dpr2) | 0; }
      const c = cv.getContext("2d");
      const w = cv.width, h2 = cv.height;
      c.clearRect(0, 0, w, h2);
      const R = H.reservoirSeries(ref.id)[pk];
      let vmax = 50;
      for (let i = 0; i < H.NT; i++) { if (R.I[i] > vmax) vmax = R.I[i]; if (R.O[i] > vmax) vmax = R.O[i]; }
      const X2 = (i) => (i / (H.NT - 1)) * w;
      const Y2 = (v) => h2 - 1 - (v / vmax) * (h2 - 3);
      c.lineWidth = 1 * dpr2;
      c.strokeStyle = "rgba(150,170,190,0.55)";
      c.beginPath();
      for (let i = 0; i < H.NT; i += 2) { const x = X2(i), y = Y2(R.I[i]); i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
      c.strokeStyle = "rgba(89,227,216,0.95)";
      c.beginPath();
      for (let i = 0; i < H.NT; i += 2) { const x = X2(i), y = Y2(R.O[i]); i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
      const nx = ((FT.state.timeH - H.T0) / (H.T1 - H.T0)) * w;
      c.strokeStyle = "rgba(255,255,255,0.7)";
      c.beginPath(); c.moveTo(nx, 0); c.lineTo(nx, h2); c.stroke();
    }
  }

  /* ---------- per-tick updates ---------- */
  UI.tick = function (snap) {
    const st = FT.state;
    const c = U.clock(st.timeH);
    el.simClock.textContent = `${c.hm} · ${c.dm}`;
    el.simRel.textContent = U.rel(st.timeH);
    el.simPhase.textContent = FT.i18n.t(snap.phase);
    if (st.playing) el.scrubber.value = st.timeH;
    el.playIcon.textContent = st.playing ? "⏸" : "▶";

    /* KPIs */
    const alertTxt = snap.basinAlert ? `BĐ${snap.basinAlert}` : FT.i18n.t("alert.normal");
    el.kpiAlertValue.textContent = alertTxt;
    el.kpiAlertValue.parentElement.className = `kpi${snap.basinAlert ? ` alert-${snap.basinAlert}` : ""}`;
    el.kpiRainValue.textContent = `${U.fmt(snap.rain, 0)} mm/h`;
    const gAi = snap.gauges.aiNghia;
    el.kpiGaugeValue.textContent = `${U.fmt(gAi.stage, 1)} m`;
    el.kpiGaugeValue.style.color = gAi.alert ? U.alertColor(gAi.alert) : "";
    const ts = FT.traffic.stats();
    el.kpiRoadsValue.textContent = `${ts.openPct}%`;
    el.kpiRoadsValue.style.color = ts.openPct < 70 ? U.css("--al-3") : "";
    el.kpiLeadValue.textContent = `+${Math.max(0, Math.round(H.T1 - st.timeH))} h`;

    /* gauge readouts */
    const gs = snap.gauges[st.selectedGauge];
    const gdef = D.GAUGES.find((g) => g.id === st.selectedGauge);
    el.gaugeStageNow.textContent = `${U.fmt(gs.stage, 2)} m`;
    el.gaugeTrend.textContent = `${gs.trend >= 0 ? "+" : "−"}${U.fmt(Math.abs(gs.trend), 1)} m`;
    el.gaugeAlert.textContent = gs.alert ? `BĐ${gs.alert}` : FT.i18n.t("alert.normal");
    el.gaugeAlert.className = `alert-${gs.alert}`;
    el.gaugeCrps.textContent = U.fmt(0.42 * st.ensSpread, 2);

    /* reservoirs */
    for (const ref of resRefs) {
      const rs = snap.reservoirs[ref.id];
      ref.small.textContent = ` ${ref.r.river === "thubon" ? "Thu Bồn" : ref.r.river === "dakmi" ? "Đắk Mi" : "Vu Gia"}`;
      ref.fi.textContent = `${FT.i18n.t("res.inflow")} ${U.fmtInt(rs.I)}`;
      ref.fo.textContent = `${FT.i18n.t("res.outflow")} ${U.fmtInt(rs.O)} m³/s`;
      ref.fill.style.setProperty("--p", `${Math.min(106, rs.pct * 100)}%`);
      ref.bar.classList.toggle("hot", rs.spilling);
      ref.root.classList.toggle("overCeil", rs.overCeil);
      ref.zm.textContent = `Z ${U.fmt(rs.Z, 1)} / ${ref.r.ceil} m`;
      ref.pr.textContent = st.policy === "mpc" && st.mpcApproved && H.proposal && H.proposal.resId === ref.id ? FT.i18n.t("res.preRelease") : "";
    }

    /* traffic */
    el.vehCount.textContent = `${ts.count} ${FT.i18n.t("tr.veh")}`;
    el.trOpen.textContent = `${ts.openPct}%`;
    el.trOpen.className = ts.openPct < 70 ? "bad" : "";
    el.trClosed.textContent = ts.closed;
    el.trClosed.className = ts.closed > 0 ? "bad" : "";
    el.trReroute.textContent = ts.rerouted;
    el.trEta.textContent = ts.etaMin > 0 ? `${ts.etaMin} ${FT.i18n.t("unit.min")}` : "—";

    const sig = ts.closures.map((x) => x.name + x.cls).join("|");
    if (sig !== closureSig) {
      closureSig = sig;
      el.closureList.innerHTML = "";
      for (const cl of ts.closures) {
        const div = document.createElement("div");
        div.className = `closureItem${cl.cls === 2 ? " risk" : ""}`;
        div.innerHTML = `<span></span><b>${Math.round(cl.depth * 100)} cm</b>`;
        div.querySelector("span").textContent = cl.name;
        el.closureList.appendChild(div);
      }
    }

    /* flood badge */
    const fs = FT.world.floodStats();
    el.floodedArea.textContent = `${U.fmt(fs.areaKm2, 1)} km²`;
    el.peopleExposed.textContent = `${U.fmtInt(fs.exposed)} ${FT.i18n.t("unit.people")}`;
    const homes = FT.state.threeReady ? FT.scene3d.homesFlooded : Math.round(fs.exposed / 4.2);
    const hf = $("homesFlooded");
    if (hf) hf.textContent = `~${U.fmtInt(homes)}`;

    /* monitored zones panel */
    updateZonePanel();

    /* reservoir I/O sparklines (cheap; canvases are tiny) */
    drawResSparks();
  };
  UI.startTour = startTour;
})();
