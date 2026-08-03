/* FloodTwin Q1 Demo — ui: panels, KPIs, timeline transport, modals,
   bounded-LLM briefs (every clause cited), toasts, event log. */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, D = FT.data;
  let H;

  const $ = (id) => document.getElementById(id);
  const el = {};
  let resRefs = [], closureSig = "", rebuildTimer = null, logCount = 0;
  let activeExplanation = null, explainReturnFocus = null, explainMoveFocus = false, methodReturnFocus = null;

  const UI = (FT.ui = {});

  /* ---------- citation chip ---------- */
  function cite(key) {
    const c = D.CORPUS[key];
    if (!c) return "";
    const vi = FT.state.lang === "vi";
    const txt = vi ? c.text_vi : c.text_en;
    const label = vi ? c.id : c.id_en || c.id;
    return ` <span class="cite" title="${txt.replace(/"/g, "&quot;")}">${label}</span>`;
  }
  const AL = () => FT.i18n.t("alert.bd");                 // "BĐ" · "AL"

  /* ---------- modal ---------- */
  function openModal(titleKey, bodyHTML) {
    el.modalTitle.textContent = FT.i18n.t(titleKey);
    el.modalBody.innerHTML = bodyHTML;
    el.modalScrim.hidden = false;
  }
  function closeModal() { el.modalScrim.hidden = true; }
  UI.openModal = openModal;                              // used by the ops layer (js/opsui.js)

  /* ---------- normalized physical-state inspector ---------- */
  function replaceTextList(root, values) {
    root.replaceChildren();
    for (const value of values) {
      const li = document.createElement("li");
      li.textContent = value;
      root.appendChild(li);
    }
  }

  const QUANTITY_LABELS = {
    flood_excess: ["Ngập vượt nền", "Flood excess"], depth: ["Độ sâu nước", "Water depth"], terrain: ["Cao độ địa hình", "Terrain elevation"],
    velocity: ["Vận tốc", "Velocity"], momentum: ["Động lượng", "Momentum"], arrival_time: ["Thời gian nước đến", "Arrival time"],
    source_attribution: ["Phân bổ nguồn", "Source attribution"], gauge_stage: ["Mực nước trạm", "Gauge stage"],
    gauge_trend_3h: ["Xu thế trạm 3 giờ", "Gauge 3-hour trend"], alert_level: ["Cấp báo động", "Alert level"],
    reservoir_stage: ["Mực hồ", "Reservoir stage"], reservoir_inflow: ["Lưu lượng vào hồ", "Reservoir inflow"],
    reservoir_outflow: ["Lưu lượng xả hồ", "Reservoir outflow"], zone_max_flood_excess: ["Ngập vượt nền lớn nhất khu vực", "Zone maximum flood excess"],
    zone_mean_flood_excess: ["Ngập vượt nền trung bình khu vực", "Zone mean flood excess"],
    zone_exposed_population: ["Dân số phơi nhiễm khu vực", "Zone exposed population"], road_flood_excess: ["Ngập vượt nền trên đường", "Road flood excess"],
    road_passability_class: ["Cấp lưu thông đường", "Road passability class"], basin_rainfall: ["Mưa lưu vực", "Basin rainfall"],
    ensemble_rainfall_forecast: ["Dự báo mưa tổ hợp", "Ensemble rainfall forecast"], tide_stage: ["Mực triều / nước dâng", "Tide / storm-surge stage"],
    gate_position: ["Vị trí cửa van", "Gate position"],
  };

  const ENUM_LABELS = {
    AVAILABLE: ["Khả dụng", "Available"], DEGRADED: ["Suy giảm", "Degraded"], UNAVAILABLE_FOR_OPERATIONS: ["Không dùng được cho vận hành", "Unavailable for operations"],
    UNSUPPORTED: ["Chưa hỗ trợ", "Unsupported"], NOT_COMPUTED: ["Chưa tính", "Not computed"], STALE: ["Cũ", "Stale"],
    MISSING_DATA: ["Thiếu dữ liệu", "Missing data"], UNSUPPORTED_PHYSICS: ["Vật lý chưa được hỗ trợ", "Unsupported physics"],
    QUALITY_REJECTED: ["Bị loại do chất lượng", "Quality rejected"], MODEL_FAILURE: ["Lỗi mô hình", "Model failure"],
    PLANNED: ["Chức năng đã lên kế hoạch", "Planned functionality"],
    OK: ["Đạt", "OK"], ESTIMATED: ["Ước tính", "Estimated"], SUSPECT: ["Đáng ngờ", "Suspect"], MISSING: ["Thiếu", "Missing"],
    LOW: ["Thấp", "Low"], VERY_LOW: ["Rất thấp", "Very low"], UNAVAILABLE: ["Không khả dụng", "Unavailable"],
    NO_VALIDATED_ERROR_MODEL: ["Chưa có mô hình sai số được kiểm định", "No validated error model"],
    NO_SURVEY_ERROR_MODEL: ["Chưa có mô hình sai số khảo sát", "No survey error model"],
    QUANTITY_NOT_COMPUTED: ["Đại lượng chưa được tính", "Quantity not computed"], NONE_PROVIDED: ["Không được cung cấp", "None provided"],
    MEASURED: ["Đo đạc", "Measured"], FORECAST: ["Dự báo", "Forecast"], MODELLED: ["Mô hình hóa", "Modelled"],
    ASSUMED: ["Giả định", "Assumed"], SYNTHETIC: ["Tổng hợp", "Synthetic"],
    AGE_FROM_ISSUE_TIME: ["Tuổi từ thời điểm phát hành", "Age from issue time"], AGE_FROM_SOURCE_FEED: ["Tuổi từ nguồn dữ liệu", "Age from source feed"],
    AGE_UNAVAILABLE: ["Không có tuổi dữ liệu", "Age unavailable"], SYNTHETIC_DEMO: ["Dữ liệu tổng hợp trình diễn", "Synthetic demo"],
    NOT_OPERATIONALLY_VALIDATED: ["Chưa kiểm định vận hành", "Not operationally validated"], EXTERNAL_GLOBAL_RASTER: ["Raster toàn cầu bên ngoài", "External global raster"],
    NOT_SURVEYED_BATHYMETRY: ["Không phải địa hình đáy khảo sát", "Not surveyed bathymetry"], SYNTHETIC_CHANNEL_CARVING: ["Lòng dẫn khắc tổng hợp", "Synthetic channel carving"],
    PROCEDURAL_FALLBACK: ["Địa hình thủ tục dự phòng", "Procedural terrain fallback"],
    NOT_VALIDATED_AS_PHYSICAL_OUTPUT: ["Chưa kiểm định như đầu ra vật lý", "Not validated as physical output"],
    MISSING_DEPENDENCY: ["Thiếu phụ thuộc", "Missing dependency"], ZONES_SUBSYSTEM_UNAVAILABLE: ["Phân hệ khu vực không khả dụng", "Zones subsystem unavailable"],
    critical_observation_feed: ["Nguồn quan trắc then chốt", "Critical observation feed"], usable_observations: ["Quan trắc dùng được", "Usable observations"],
    BASELINE_LOW_DEMO_CONFIDENCE: ["Mức thấp cơ sở của bản trình diễn", "Baseline low demo confidence"],
    CONFIDENCE_REDUCED: ["Giảm độ tin cậy", "Confidence reduced"],
    DEMO_ONLY: ["Chỉ dùng trình diễn", "Demo only"],
    DEMO_ONLY_NO_OPERATIONAL_DECISIONS: ["Không dùng cho quyết định vận hành", "No operational decisions"],
  };

  const SOURCE_LABELS = [
    [/^world-sample-(excess|depth)$/, ["Trạng thái SWE trong trình duyệt", "In-browser SWE state"]],
    [/^in-browser-swe-state$/, ["Trạng thái SWE trong trình duyệt", "In-browser SWE state"]],
    [/^(aws-terrarium|procedural-terrain)/, ["Địa hình và lòng dẫn mô hình", "Terrain and modeled channel"]],
    [/^hydro-gauge-series:/, ["Chuỗi mực nước trạm tổng hợp", "Synthetic gauge-stage series"]],
    [/^hydro-reservoir-series:/, ["Chuỗi diễn toán hồ tổng hợp", "Synthetic reservoir-routing series"]],
    [/^zone-grid-statistics:/, ["Thống kê lưới khu vực", "Zone grid statistics"]],
    [/^zone-synthetic-exposure:/, ["Phơi nhiễm dân số tổng hợp", "Synthetic population exposure"]],
    [/^world-road-depth:/, ["Độ sâu mô hình trên đường", "Modeled road depth"]],
    [/^world-road-passability:/, ["Ngưỡng lưu thông đường", "Road passability thresholds"]],
    [/^not-available$/, ["Không có nguồn trạng thái vật lý", "No physical-state source"]],
  ];

  const CONTRACT_TEXT = {
    "Hydrology, reservoir routing and inundation are synthetic demonstration outputs.": ["Thủy văn, diễn toán hồ chứa và ngập lụt là đầu ra tổng hợp dùng để trình diễn.", "Hydrology, reservoir routing and inundation are synthetic demonstration outputs."],
    "Flood excess means modeled water depth above the normal-river reference field.": ["Ngập vượt nền là độ sâu nước mô hình cao hơn trường sông bình thường.", "Flood excess means modeled water depth above the normal-river reference field."],
    "Flood excess is referenced to the model's normal-river field.": ["Ngập vượt nền được tham chiếu theo trường sông bình thường của mô hình.", "Flood excess is referenced to the model's normal-river field."],
    "Depth is the model total water column, not flood excess above normal rivers.": ["Độ sâu là toàn bộ cột nước mô hình, không phải phần ngập vượt trên sông bình thường.", "Depth is the model total water column, not flood excess above normal rivers."],
    "Global DEM elevations and synthetic channel carving are adequate for demonstration rendering/state queries.": ["Cao độ DEM toàn cầu và lòng dẫn khắc tổng hợp chỉ đủ cho hiển thị và truy vấn trạng thái trình diễn.", "Global DEM elevations and synthetic channel carving are adequate for demonstration rendering/state queries."],
    "Entity state is generated by the deterministic browser demonstration.": ["Trạng thái đối tượng do bản trình diễn tất định trong trình duyệt tạo ra.", "Entity state is generated by the deterministic browser demonstration."],
    "Zone max/mean aggregate modeled flood excess over included grid cells.": ["Giá trị lớn nhất/trung bình của khu vực tổng hợp ngập vượt nền trên các ô lưới được tính.", "Zone max/mean aggregate modeled flood excess over included grid cells."],
    "Population is a synthetic city-weighted grid and exposure uses the demo depth-response function.": ["Dân số là lưới tổng hợp có trọng số đô thị; phơi nhiễm dùng hàm đáp ứng độ sâu của bản trình diễn.", "Population is a synthetic city-weighted grid and exposure uses the demo depth-response function."],
    "Road depth is the maximum modeled flood excess over configured road samples.": ["Độ sâu trên đường là ngập vượt nền lớn nhất tại các điểm mẫu đã cấu hình.", "Road depth is the maximum modeled flood excess over configured road samples."],
    "Passability class uses the demo's fixed flood-depth thresholds.": ["Cấp lưu thông dùng các ngưỡng độ sâu ngập cố định của bản trình diễn.", "Passability class uses the demo's fixed flood-depth thresholds."],
    "Not calibrated or validated for operational use.": ["Chưa được hiệu chỉnh hoặc kiểm định cho vận hành thực tế.", "Not calibrated or validated for operational use."],
    "Terrain is not surveyed bathymetry; channels include synthetic carving.": ["Địa hình không phải địa hình đáy khảo sát; lòng dẫn có phần khắc tổng hợp.", "Terrain is not surveyed bathymetry; channels include synthetic carving."],
    "Velocity, momentum, arrival time and source attribution are not supported physical outputs.": ["Vận tốc, động lượng, thời gian nước đến và phân bổ nguồn chưa phải đầu ra vật lý được hỗ trợ.", "Velocity, momentum, arrival time and source attribution are not supported physical outputs."],
    "Synthetic browser model; not calibrated or validated for operational use.": ["Mô hình trình duyệt tổng hợp; chưa được hiệu chỉnh hoặc kiểm định cho vận hành.", "Synthetic browser model; not calibrated or validated for operational use."],
    "No validated uncertainty/error model is available.": ["Chưa có mô hình bất định hoặc sai số được kiểm định.", "No validated uncertainty/error model is available."],
    "Not surveyed bathymetry.": ["Không phải địa hình đáy được khảo sát.", "Not surveyed bathymetry."],
    "Source vertical datum is not normalized into an operational basin datum.": ["Mốc cao độ nguồn chưa được chuẩn hóa về mốc lưu vực vận hành.", "Source vertical datum is not normalized into an operational basin datum."],
    "Display animation, particles and shader state are prohibited as numerical sources.": ["Không được dùng hoạt ảnh, hạt hiển thị hoặc trạng thái shader làm nguồn số liệu.", "Display animation, particles and shader state are prohibited as numerical sources."],
    "No vehicle-specific, pavement, current-speed or debris assessment.": ["Chưa đánh giá theo loại xe, mặt đường, tốc độ dòng chảy hoặc vật cản.", "No vehicle-specific, pavement, current-speed or debris assessment."],
    "Gauge datum is unspecified; stages must not be compared across stations.": ["Chưa xác định mốc cao độ trạm; không được so sánh mực nước giữa các trạm.", "Gauge datum is unspecified; stages must not be compared across stations."],
    "Reservoir level datum and storage curve are not governed operational data.": ["Mốc mực hồ và đường quan hệ dung tích chưa phải dữ liệu vận hành được quản trị.", "Reservoir level datum and storage curve are not governed operational data."],
    "The zones subsystem is unavailable, so no aggregate or exposure value is asserted.": ["Phân hệ khu vực không khả dụng nên không khẳng định giá trị tổng hợp hoặc phơi nhiễm.", "The zones subsystem is unavailable, so no aggregate or exposure value is asserted."],
    "Not a census raster or surveyed person count.": ["Không phải raster điều tra dân số hoặc số người khảo sát.", "Not a census raster or surveyed person count."],
    "Precision is rounded to model resolution.": ["Độ chính xác được làm tròn theo độ phân giải mô hình.", "Precision is rounded to model resolution."],
  };

  function localPair(pair, fallback) { return pair ? pair[FT.state.lang === "vi" ? 0 : 1] : fallback; }
  function enumLabel(value) { return value == null ? "-" : localPair(ENUM_LABELS[value], value); }
  function contractText(value) { return localPair(CONTRACT_TEXT[value], value); }
  function sourceLabel(value) {
    const match = SOURCE_LABELS.find(([pattern]) => pattern.test(value));
    return match ? localPair(match[1], value) : value;
  }

  function dependencyLabel(value) {
    if (!value) return FT.i18n.t("explain.unavailable");
    if (value.startsWith("H:")) {
      const gauge = D.GAUGES.find((item) => item.id === value.slice(2));
      return gauge ? `${gauge.name} - ${localPair(["mực nước sông", "river stage"], value)}` : value;
    }
    if (value.startsWith("Z:")) {
      const reservoir = D.RESERVOIRS.find((item) => item.id === value.slice(2));
      return reservoir ? `${reservoir.name} - ${localPair(["mực nước hồ", "reservoir level"], value)}` : value;
    }
    return localPair({
      rain: ["Mưa lưu vực", "Basin rainfall"],
      qpf: ["Dự báo mưa tổ hợp", "Ensemble rainfall forecast"],
      tide: ["Triều / nước dâng", "Tide / storm surge"],
      gates: ["Vị trí cửa van (SCADA)", "Gate position (SCADA)"],
    }[value], value);
  }

  function quantityLabel(key) {
    return localPair(QUANTITY_LABELS[key], key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
  }

  function explanationDocsHref(selection) {
    const targets = {
      gauge: "https://info.skylabs.vn/simulation-engines.html#hydrology-engine",
      reservoir: "https://info.skylabs.vn/simulation-engines.html#reservoir-engine",
      zone: "https://info.skylabs.vn/visualisation-science.html#wet-dry",
      road: "https://info.skylabs.vn/visualisation-science.html#wet-dry",
    };
    return targets[selection.kind] || "https://info.skylabs.vn/visualisation-science.html#depth";
  }

  function isVisible(element) {
    if (!element || !document.contains(element)) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  }

  function restoreExplanationFocus() {
    const view = FT.state.view === "2d" ? "2d" : "3d";
    const activeCanvas = document.getElementById(`canvas${view}`);
    const viewControl = document.querySelector(`#viewTabs button[data-view="${view}"]`);
    const candidates = [
      explainReturnFocus,
      activeCanvas && activeCanvas.classList.contains("isActive") ? activeCanvas : null,
      viewControl,
    ];
    for (const candidate of candidates) {
      if (!isVisible(candidate)) continue;
      candidate.focus({ preventScroll: true });
      if (document.activeElement === candidate) return;
    }
  }

  function renderExplanation(contract) {
    if (!contract) {
      el.explainInspector.hidden = true;
      document.body.classList.remove("explain-open");
      return;
    }
    activeExplanation = contract;
    const t = FT.i18n.t;
    const selection = contract.selection;
    const subject = selection.name || (selection.kind === "point"
      ? `${t("explain.selection.point")} ${selection.cell_id}`
      : `${t("explain.selection.feature")} ${selection.id}`);
    el.explainTitle.textContent = t("explain.title");
    el.explainClose.setAttribute("aria-label", t("explain.close"));
    el.explainDocsLink.href = explanationDocsHref(selection);
    el.explainSummary.textContent = `${subject} · ${t("explain.valid")} ${contract.valid_time.iso}`;
    el.explainStatus.textContent = `${t("explain.status")}: ${enumLabel(contract.data_health.status)} · ${t("explain.issue")} ${contract.issue_time.iso}`;

    el.explainQuantities.replaceChildren();
    for (const q of contract.quantities) {
      const row = document.createElement("div");
      row.className = "explainQuantity";
      row.dataset.quantityKey = q.key;
      const main = document.createElement("div");
      main.className = "explainQuantityMain";
      const label = document.createElement("span");
      label.textContent = quantityLabel(q.key);
      const value = document.createElement("strong");
      value.textContent = q.value == null ? `${t("explain.notComputed")} · ${enumLabel(q.status)}` : `${U.fmt(q.value, 2)} ${q.unit}`;
      main.append(label, value);
      const meta = document.createElement("small");
      meta.className = "explainQuantityMeta";
      meta.textContent = [
        `${t("explain.valid")}: ${q.valid_time.iso}`,
        `${t("explain.issue")}: ${q.issue_time.iso}`,
        `${t("explain.age")}: ${q.age == null ? t("explain.unavailable") : q.age}`,
        `${t("explain.quality")}: ${enumLabel(q.quality)}`,
        `${t("explain.status")}: ${enumLabel(q.status)}`,
        `${t("explain.reason")}: ${enumLabel(q.reason)}`,
        `${t("explain.flags")}: ${(q.quality_flags || []).map(enumLabel).join(", ") || "-"}`,
      ].join(" · ");
      row.append(main, meta);
      el.explainQuantities.appendChild(row);
    }

    replaceTextList(el.explainSources, contract.sources.map((source) =>
      `${sourceLabel(source.source_id)} [${source.source_id}] · ${enumLabel(source.provenance)} · ${source.model_id} ${source.model_version}`));
    el.explainConfidence.replaceChildren();
    for (const q of contract.quantities) {
      const detail = document.createElement("p");
      detail.className = "explainConfidenceRow";
      const uncertainty = q.uncertainty || {};
      detail.textContent = `${quantityLabel(q.key)} · ${t("explain.grade")}: ${enumLabel(q.confidence_grade)}`
        + ` · ${t("explain.uncertaintyDetail")}: ${enumLabel(uncertainty.type)}`
        + ` · ${t("explain.reason")}: ${enumLabel(uncertainty.reason || q.reason)}`;
      el.explainConfidence.appendChild(detail);
    }
    const assumptions = [...new Set(contract.assumptions.concat(contract.quantities.flatMap((q) => q.assumptions || [])))];
    const limitations = [...new Set(contract.limitations.concat(contract.quantities.flatMap((q) => q.limitations || [])))];
    replaceTextList(el.explainAssumptions, assumptions.map(contractText));
    replaceTextList(el.explainLimitations, limitations.map(contractText));
    const health = contract.data_health;
    el.explainDegradation.className = "explainDegradationRow";
    el.explainDegradation.textContent = [
      `${t("explain.reason")}: ${enumLabel(health.reason_category)}`,
      `${t("explain.missingQuantity")}: ${health.missing_quantity ? quantityLabel(health.missing_quantity) : t("explain.unavailable")}`,
      `${t("explain.missingDependency")}: ${health.missing_dependency ? `${dependencyLabel(health.missing_dependency)} [${health.missing_dependency}]` : t("explain.unavailable")}`,
      `${t("explain.lastValid")}: ${health.last_valid_time ? health.last_valid_time.iso : t("explain.unavailable")}`,
      `${t("explain.confidenceEffect")}: ${enumLabel(health.confidence_effect)}`,
      `${t("explain.permittedUse")}: ${enumLabel(health.permitted_use)}`,
    ].join(" · ");
    el.explainInspector.hidden = false;
    document.body.classList.add("explain-open");
  }

  /* ---------- MPC text ---------- */
  function mpcText() {
    const p = H.proposal;
    if (!p) return FT.state.lang === "vi" ? "Không có đề xuất - dòng vào dự báo trong năng lực điều tiết." : "No proposal - forecast inflow within regulation capacity.";
    /* Lead with the effect the release achieves; the probability of clearing BĐ3
       is residual risk, not the headline — it reads as a failure rate up front. */
    const cut = Math.max(0, p.ruleStage - p.mpcStage);
    /* Lead with the effect the release achieves. The residual probability and the band
       it comes from are in the decision package's residual-risk section, not appended
       here as a lone percentage that reads as a failure rate (R-33). */
    if (FT.state.lang === "vi") {
      return `Xả trước <b>${U.fmtInt(p.q0)} → ${U.fmtInt(p.q1)} m³/s</b> tại <b>${p.resName}</b> từ <b>T+${p.tStart}h</b>, hạ đỉnh tại ${p.gaugeName} <b>${U.fmt(p.ruleStage, 1)} m → ${U.fmt(p.mpcStage, 1)} m (−${U.fmt(cut, 1)} m)</b>. Bao ensemble và xác suất dưới BĐ3 ở gói quyết định.`;
    }
    return `Pre-release <b>${U.fmtInt(p.q0)} → ${U.fmtInt(p.q1)} m³/s</b> at <b>${p.resName}</b> from <b>T+${p.tStart}h</b>, cutting the ${p.gaugeName} peak <b>${U.fmt(p.ruleStage, 1)} m → ${U.fmt(p.mpcStage, 1)} m (−${U.fmt(cut, 1)} m)</b>. The ensemble band and P(below AL3) are in the decision package.`;
  }

  /* Residual risk stated as the band, not a lone percentage. The founder decision on
     R-33 was to show the ensemble envelope (P05·median·P95 vs AL3) so the reader sees
     the spread the number comes from, not a single figure that reads as a failure rate.
     pBelow is the integral of THIS band below AL3 — the same estimator, so the sentence
     and the endpoints cannot drift apart. See docs/plans/active/r33-ensemble-pbelow.md. */
  function residualRiskText(p) {
    const vi = FT.state.lang === "vi";
    const pct = Math.round(p.pBelow * 100);
    const inN = Math.max(1, Math.round(p.pBelow * 100));     // "~inN in 100 members"
    const overAL3 = p.medPeak >= p.bd3;
    if (vi) {
      return `Bao ensemble tại ${p.gaugeName} khi đỉnh: <b>${U.fmt(p.p05Peak, 1)} - ${U.fmt(p.medPeak, 1)} - ${U.fmt(p.p95Peak, 1)} m</b> (P05·trung vị·P95), so với BĐ3 ${p.bd3} m. `
        + (overAL3
            ? `Trung vị vẫn trên BĐ3, nên đề xuất này <b>hạ đỉnh chứ chưa đưa trạm về dưới báo động</b>: khoảng <b>${inN} trong 100</b> thành viên giữ được dưới BĐ3 (${pct}%). Cân nhắc hạ mực nước sớm hơn nếu cần chắc chắn hơn.`
            : `Trung vị đã dưới BĐ3; khoảng <b>${inN} trong 100</b> thành viên vẫn vượt do đuôi trên của bao.`);
    }
    return `Ensemble envelope at ${p.gaugeName} at the peak: <b>${U.fmt(p.p05Peak, 1)} - ${U.fmt(p.medPeak, 1)} - ${U.fmt(p.p95Peak, 1)} m</b> (P05·median·P95), against AL3 ${p.bd3} m. `
      + (overAL3
          ? `The median is still above AL3, so this proposal <b>lowers the peak without bringing the gauge back under the alert</b>: about <b>${inN} in 100</b> members hold below AL3 (${pct}%). Consider earlier drawdown if more certainty is needed.`
          : `The median is below AL3; about <b>${inN} in 100</b> members still exceed it on the upper tail.`);
  }

  function decisionPackageHTML() {
    const p = H.proposal;
    if (!p) return "<p>-</p>";
    const vi = FT.state.lang === "vi";
    /* Lifecycle marker (js/lifecycle.js): this package is an AI RECOMMENDATION until an
       entitled operator approves it, at which point it becomes the APPROVED PLAN in force.
       Rendering the class here is what stops a proposal from ever reading as operational. */
    const lc = FT.lifecycle ? FT.lifecycle.classifyDecision({ kind: "PROPOSAL" }) : null;
    const lcBanner = lc ? `<div class="lcBanner lc-${FT.lifecycle.badge(lc)}">
      <span class="lcDot" aria-hidden="true"></span>
      <b>${FT.lifecycle.label(lc)}</b><em>${FT.lifecycle.reviewNotice(lc)}</em></div>` : "";
    return `${lcBanner}
      <div class="decisionKpis">
        <div><span>${vi ? `Cắt đỉnh tại ${p.gaugeName}` : `Peak cut at ${p.gaugeName}`}</span><strong>−${U.fmt(Math.max(0, p.ruleStage - p.mpcStage), 1)} m</strong></div>
        <div><span>${vi ? "Bắt đầu" : "Start"}</span><strong>T+${p.tStart}h</strong></div>
        <div><span>${vi ? "Đỉnh dòng vào" : "Inflow peak"}</span><strong>T+${U.fmt(p.tPeak, 0)}h</strong></div>
      </div>
      <h4>${FT.i18n.t("dp.proposed")}</h4>
      <p><b>${p.resName}</b>: ${U.fmtInt(p.q0)} → ${U.fmtInt(p.q1)} m³/s (ramp ≤ 6h)${cite("sensor")}</p>
      <h4>${FT.i18n.t("dp.envelope")}</h4>
      <p>${vi ? "Trung vị" : "Median"} ~${U.fmtInt(p.peakI)} m³/s · P90 ~${U.fmtInt(p.p90I)} m³/s / 18h${cite("gencast")}</p>
      <h4>${FT.i18n.t("dp.downstream")}</h4>
      <p>${p.gaugeName}: rule curve ${U.fmt(p.ruleStage, 1)} m → MPC ${U.fmt(p.mpcStage, 1)} m (${AL()}3 = ${p.bd3} m)${cite("surrogate")}</p>
      <h4>${FT.i18n.t("dp.legal")}</h4>
      <p>${cite("d1865_a7")}${cite("d1865_a8")}</p>
      <h4>${FT.i18n.t("dp.residual")}</h4>
      <p>${residualRiskText(p)}${cite("gencast")}</p>
      <div class="mpcActions" style="margin-top:12px">
        <button id="dpApprove" class="btnPrimary" type="button">${FT.i18n.t("mpc.approve")}</button>
        <button id="dpReject" type="button">${FT.i18n.t("mpc.reject")}</button>
      </div>`;
  }

  /* ---------- decision record ----------
     The artefact somebody attaches to a file and defends six months later.
     Written to be read by a person who has never opened this application, so
     every term is expanded where it first appears. EP-03 US-03.2. */

  function outcomeWord(o) { return FT.i18n.t("rec.out." + o); }

  function recValue(rec, key) {
    const t = FT.i18n.t, vi = FT.state.lang === "vi";
    const snap = FT.record.snapshotFor(rec);
    const sched = rec.proposal && rec.proposal.reservoir_schedule[0];
    const eff = rec.proposal && rec.proposal.predicted_effects[0];
    switch (key) {
      case "what":
        return sched
          ? `${outcomeWord(rec.outcome)} - ${vi
              ? `tăng lưu lượng xả tại <b>${snap.reservoirs[sched.reservoir_id].name}</b> từ ${U.fmtInt(sched.from_m3s)} lên <b>${U.fmtInt(sched.to_m3s)} m³/s</b>, bắt đầu ${U.rel(sched.start_sim_h)}, tăng dần trong không quá ${sched.ramp_limit_h} giờ.`
              : `raise the release at <b>${snap.reservoirs[sched.reservoir_id].name}</b> from ${U.fmtInt(sched.from_m3s)} to <b>${U.fmtInt(sched.to_m3s)} m³/s</b>, starting ${U.rel(sched.start_sim_h)}, ramped over no more than ${sched.ramp_limit_h} hours.`}`
          : `${outcomeWord(rec.outcome)} - ${vi ? "không có lệnh xả nào kèm theo." : "no release order attached."}`;
      /* Câu này chỉ nói phần nhất quán: đỉnh hạ bao nhiêu. Bao ensemble và mối
         mâu thuẫn giữa nó với xác suất tồn dư nằm ở phụ lục, nơi có chỗ để nói
         rõ hai con số ra từ hai bộ ước lượng khác nhau. */
      case "expect": {
        if (!eff) return vi ? "Không dự kiến thay đổi nào ở hạ du." : "No downstream change expected.";
        const cut = Math.max(0, eff.baseline - eff.median);
        return vi
          ? `Mực nước đỉnh tại trạm <b>${eff.gauge}</b> hạ từ ${U.fmt(eff.baseline, 2)} m xuống <b>${U.fmt(eff.median, 2)} m</b>, tức cắt <b>${U.fmt(cut, 2)} m</b>. Đây là trung vị của bộ diễn toán chạy trong trình duyệt; bao ensemble ghi ở phụ lục.`
          : `Peak stage at the <b>${eff.gauge}</b> gauge falls from ${U.fmt(eff.baseline, 2)} m to <b>${U.fmt(eff.median, 2)} m</b>, a cut of <b>${U.fmt(cut, 2)} m</b>. That is the median of the in-browser routing; the ensemble envelope is in the appendix.`;
      }
      case "risk":
        return rec.proposal
          ? (vi
              ? `Xác suất giữ trạm dưới <b>báo động 3</b>, mức cao nhất trong ba mức, là <b>${Math.round(rec.proposal.residual_risk.p_below_al3 * 100)}%</b> - tích phân của bao ensemble ở phụ lục phía dưới BĐ3. Lệnh xả này hạ đỉnh lũ; trung vị vẫn trên báo động, nên nó không đưa trạm về dưới mức báo động.`
              : `Probability of holding the gauge below <b>alert level 3</b>, the highest of the three, is <b>${Math.round(rec.proposal.residual_risk.p_below_al3 * 100)}%</b> - the integral of the ensemble band in the appendix below AL3. This release lowers the peak; the median is still above the alert, so it does not bring the gauge back under it.`)
          : (vi ? "Không áp dụng." : "Not applicable.");
      case "clause":
        return rec.citations.length
          ? rec.citations.map((c) => {
              const corp = D.CORPUS[c.clause_key];
              const label = corp ? (vi ? corp.id : corp.id_en || corp.id) : c.clause_id;
              const txt = corp ? (vi ? corp.text_vi : corp.text_en) : "";
              return `<b>${label}</b>${txt ? ` — ${txt}` : ""}`;
            }).join("<br>")
          : (vi ? "Không viện dẫn điều khoản nào." : "No clause cited.");
      case "who":
        return vi
          ? `${rec.actor.id} · ${t("rec.roleDemo")}. Hồ sơ này <b>chưa ký</b> và sinh ra trong bản trình diễn công khai.`
          : `${rec.actor.id} · ${t("rec.roleDemo")}. This record is <b>unsigned</b> and was produced in the public demo.`;
      default: return "";
    }
  }

  function recWhen(rec) {
    const vi = FT.state.lang === "vi";
    const c = U.clock(rec.created_at_sim);
    const target = rec.target_time_sim === rec.created_at_sim
      ? (vi ? "áp dụng ngay tại thời điểm đó" : "applies at that same moment")
      : (vi ? `áp dụng tại ${U.rel(rec.target_time_sim)}` : `applies at ${U.rel(rec.target_time_sim)}`);
    return `${c.hm} ${c.dm} ${vi ? "giờ mô phỏng" : "simulation time"} (${U.rel(rec.created_at_sim)}) · ${target}<br>
      <span class="recDim">${vi ? "Đồng hồ máy" : "Machine clock"}: ${rec.created_at_wall} · ${FT.i18n.t("rec.clk." + rec.created_at_wall_source)}</span>`;
  }

  /* Bao ensemble, kèm câu nói thẳng rằng nó và xác suất tồn dư không ra từ
     cùng một bộ ước lượng. Giấu chỗ này đi thì hồ sơ mất đúng thứ nó bán. */
  function recBandHTML(rec, snap) {
    const vi = FT.state.lang === "vi";
    const b = snap.proposal && snap.proposal.peak_band;
    if (!b) return `<p>-</p>`;
    const p = rec.proposal ? Math.round(rec.proposal.residual_risk.p_below_al3 * 100) : null;
    return `<table class="recTbl">
      <tr><th scope="col">P05</th><th scope="col">${vi ? "Trung vị" : "Median"}</th><th scope="col">P95</th><th scope="col">${vi ? "Nguồn" : "Source"}</th></tr>
      <tr><td>${U.fmt(b.p05_m, 2)} m</td><td>${U.fmt(b.p50_m, 2)} m</td><td>${U.fmt(b.p95_m, 2)} m</td><td>${t2("rec.bandSrc")}</td></tr>
    </table>
    <p>${vi
      ? `Lưu ý cho người đọc kỹ: con số <b>${p}%</b> ở mục rủi ro tồn dư là <b>tích phân của chính bao trên đây</b> phía dưới BĐ3 — cùng một bộ ước lượng, đọc tại thời điểm trung vị đạt đỉnh. Trước đây hai con số này ra từ hai chỗ khác nhau (bao là phân vị ensemble, phần trăm là công thức đóng của khối tối ưu) và chúng tôi từng ghi rõ là chúng chưa hoà giải; nay đã hoà giải, phần trăm được suy trực tiếp từ bao.`
      : `For the careful reader: the <b>${p}%</b> in the residual-risk section is the <b>integral of the envelope above</b> below AL3 — one estimator, read at the index where the median peaks. These two used to come from different places (the envelope from ensemble quantiles, the percentage from the optimiser's closed form) and we flagged them as unreconciled; they are now reconciled, with the percentage derived directly from the band.`}</p>`;
  }
  const t2 = (k) => FT.i18n.t(k);

  function recVerifyHTML(rec) {
    const vi = FT.state.lang === "vi";
    const v = FT.record.verify(rec);
    return `<table class="recTbl">
      <tr><th scope="row">${vi ? "Mã hồ sơ" : "Record id"}</th><td>${rec.id} · ${vi ? "lược đồ" : "schema"} ${rec.schema_version}</td></tr>
      <tr><th scope="row">${vi ? "Dấu băm đầu vào" : "Input hash"}</th><td class="recHash">${rec.input_hash}</td></tr>
      <tr><th scope="row">${vi ? "Ảnh chụp đầu vào" : "Input snapshot"}</th><td>${rec.input_snapshot_ref} · ${v.ok ? (vi ? "khớp" : "matches") : (vi ? "KHÔNG KHỚP" : "MISMATCH")}</td></tr>
      <tr><th scope="row">${vi ? "Phiên bản" : "Versions"}</th><td>${rec.versions.app_version} · ${rec.versions.model_version} · ${vi ? "dữ liệu" : "data"} ${rec.versions.data_version}</td></tr>
      <tr><th scope="row">${vi ? "Cách kiểm lại" : "How to recheck"}</th><td>${vi
        ? "SHA-256 trên chuỗi chuẩn tắc của ảnh chụp đầu vào: khoá sắp xếp, không khoảng trắng, số làm tròn sáu chữ số thập phân. Kiểm được bằng bất kỳ công cụ nào, không cần chúng tôi."
        : "SHA-256 over the canonical serialisation of the input snapshot: sorted keys, no whitespace, numbers rounded to six decimals. Recomputable with any tool, without us."}</td></tr>
    </table>`;
  }

  /* Bản in là một tài liệu riêng nên tiêu đề của nó là h1. Bản xem trước lại
     nằm trong trang đang có h1 của ứng dụng, nên phải lùi một bậc - hai h1 trong
     cùng một tài liệu làm hỏng dàn ý mà trình đọc màn hình dựng ra. */
  function recordDocHTML(rec, lvl) {
    const t = FT.i18n.t;
    const h1 = lvl === "preview" ? "h2" : "h1", h2 = lvl === "preview" ? "h3" : "h2";
    const sec = (key, body) => `<${h2}>${t(key)}</${h2}>${body}`;
    return `
      <div class="recWm" aria-hidden="true"><span>${t("rec.wm")}</span></div>
      <${h1}>${t("rec.title")}</${h1}>
      <div class="recBanner">${t("rec.banner")}</div>
      ${sec("rec.what", `<p>${recValue(rec, "what")}</p>`)}
      ${sec("rec.when", `<p>${recWhen(rec)}</p>`)}
      ${sec("rec.expect", `<p>${recValue(rec, "expect")}</p>`)}
      ${sec("rec.clause", `<p>${recValue(rec, "clause")}</p>`)}
      ${sec("rec.risk", `<p>${recValue(rec, "risk")}</p>`)}
      ${sec("rec.who", `<p>${recValue(rec, "who")}</p>`)}
      ${sec("rec.check", recVerifyHTML(rec))}
      <div class="recFoot">${t("rec.foot")}</div>`;
  }

  function recAppendixHTML(rec) {
    const t = FT.i18n.t, vi = FT.state.lang === "vi";
    const snap = FT.record.snapshotFor(rec);
    const all = FT.record.all();
    return `
      <div class="recWm" aria-hidden="true"><span>${t("rec.wm")}</span></div>
      <h1>${t("rec.apx")}</h1>
      <h2>${t("rec.apxSeq")}</h2>
      <table class="recTbl"><tr><th scope="col">#</th><th scope="col">${vi ? "Mã" : "Id"}</th><th scope="col">${vi ? "Kết cục" : "Outcome"}</th><th scope="col">${vi ? "Giờ mô phỏng" : "Sim time"}</th><th scope="col">${vi ? "Thay thế" : "Supersedes"}</th></tr>
      ${all.map((r) => `<tr><td>${r.seq}</td><td>${r.id}</td><td>${outcomeWord(r.outcome)}</td><td>${U.rel(r.created_at_sim)}</td><td>${r.prior_id || "-"}</td></tr>`).join("")}</table>
      <h2>${t("rec.apxGauge")}</h2>
      <table class="recTbl"><tr><th scope="col">${vi ? "Trạm" : "Gauge"}</th><th scope="col">${vi ? "Mực nước (m)" : "Stage (m)"}</th><th scope="col">${AL()}1/2/3</th><th scope="col">${vi ? "Xu thế 3h" : "3h trend"}</th></tr>
      ${Object.keys(snap.gauges).map((k) => { const g = snap.gauges[k];
        return `<tr><td>${g.name}</td><td>${U.fmt(g.stage_m, 2)}</td><td>${g.alert_levels_m.join(" / ")}</td><td>${U.fmt(g.trend_m_per_3h, 2)}</td></tr>`; }).join("")}</table>
      <h2>${t("rec.apxRes")}</h2>
      <table class="recTbl"><tr><th scope="col">${vi ? "Hồ" : "Reservoir"}</th><th scope="col">${vi ? "Mực hồ (m)" : "Level (m)"}</th><th scope="col">${vi ? "Trần trước lũ" : "Pre-flood ceiling"}</th><th scope="col">${vi ? "Vào / Xả (m³/s)" : "In / Out (m³/s)"}</th></tr>
      ${Object.keys(snap.reservoirs).map((k) => { const r = snap.reservoirs[k];
        return `<tr><td>${r.name}</td><td>${U.fmt(r.level_m, 1)}</td><td>${r.pre_flood_ceiling_m}</td><td>${U.fmtInt(r.inflow_m3s)} / ${U.fmtInt(r.outflow_m3s)}</td></tr>`; }).join("")}</table>
      <h2>${t("rec.apxForcing")}</h2>
      <p>${vi ? "Kịch bản" : "Scenario"}: ${t(D.SCENARIOS[snap.scenario_id].key)} · ${vi ? "hệ số mưa" : "rain factor"} ${U.fmt(snap.forcing.rain_scale, 2)}× · ${vi ? "độ mở ensemble" : "ensemble spread"} ${U.fmt(snap.forcing.ensemble_spread, 2)}× · ${vi ? "mưa lưu vực" : "basin rainfall"} ${U.fmt(snap.basin.rain_mm_per_h, 1)} mm/h</p>
      <h2>${t("rec.apxBand")}</h2>
      ${recBandHTML(rec, snap)}
      <h2>${t("rec.apxProv")}</h2>
      <p>${rec.provenance.source_keys.map((k) => t("rec.src." + k)).join(" · ")}</p>
      <p>${rec.data_sources.length
        ? `${vi ? "Nguồn số liệu được viện dẫn" : "Data sources cited"}: ${rec.data_sources.map((s) => {
            const c = D.CORPUS[s.source_key];
            return c ? (vi ? c.id : c.id_en || c.id) : s.source_key;
          }).join(" · ")}`
        : ""}</p>
      <div class="recFoot">${t("rec.foot")}</div>`;
  }

  function recordModalHTML() {
    const t = FT.i18n.t, vi = FT.state.lang === "vi";
    const rec = FT.record.last();
    if (!rec) return `<p>${t("rec.none")}</p>`;
    const all = FT.record.all();
    return `
      <div class="recActions">
        <button id="recPrint" class="btnPrimary" type="button">${t("rec.print")}</button>
        <button id="recJson" type="button">${t("rec.json")}</button>
        <label class="recOpt"><input type="checkbox" id="recApx" checked> ${t("rec.apxOpt")}</label>
      </div>
      <p class="recLedger">${vi ? "Sổ ghi" : "Ledger"}: ${all.map((r) => `<span class="recChip rec-${r.outcome}">${r.seq}. ${outcomeWord(r.outcome)}</span>`).join(" ")}</p>
      <div class="recPreview">${recordDocHTML(rec, "preview")}</div>`;
  }

  /* The control stays enabled even with an empty ledger: a disabled button with
     no explanation is a dead end, while the modal can say why it is empty and
     what produces the first record. */
  function refreshRecordBtn() {
    const b = el.mpcRecord;
    if (!b) return;
    const n = FT.record ? FT.record.count() : 0;
    b.textContent = n ? `${FT.i18n.t("rec.btn")} (${n})` : FT.i18n.t("rec.btn");
  }

  /* ---------- briefs ----------
     The brief is not published as written. Each claim is built as structured data (text,
     the sources it cites, and - where it states a number - the snapshot field that number
     must match), then FT.grounding.verify strikes any claim that is unsourced or whose
     number has drifted from the live value. This makes the info/ai.html §4.3 groundedness
     contract executable and visible instead of merely asserted. */
  function briefClaims(snap) {
    const vi = FT.state.lang === "vi";
    const g0 = D.GAUGES[0];
    const gs = snap.gauges[g0.id];
    const ts = FT.traffic.stats();
    const S = H.series(g0.id)[H._activeKey()];
    const q95in12 = H.sample(S.q95, Math.min(H.T1, FT.state.timeH + 12));
    const spilling = D.RESERVOIRS.filter((r) => snap.reservoirs[r.id].spilling);
    const claims = [];

    claims.push({
      text: vi
        ? `Lưu vực đang ở pha <b>${FT.i18n.t(snap.phase)}</b>, mưa trung bình <b>${U.fmt(snap.rain, 0)} mm/h</b>.`
        : `The basin is in <b>${FT.i18n.t(snap.phase)}</b> phase with mean rainfall <b>${U.fmt(snap.rain, 0)} mm/h</b>.`,
      cites: ["gencast", "nchmf"],
      num: { value: Math.round(snap.rain), field: { kind: "rain" }, tol: 0.5 },
    });
    claims.push({
      text: vi
        ? `Trạm ${g0.name} đạt <b>${U.fmt(gs.stage, 2)} m</b> (${gs.alert ? "BĐ" + gs.alert : "dưới BĐ1"}), xu thế ${gs.trend >= 0 ? "lên" : "xuống"} ${U.fmt(Math.abs(gs.trend), 1)} m/3h.`
        : `${g0.name} gauge reads <b>${U.fmt(gs.stage, 2)} m</b> (${gs.alert ? "AL" + gs.alert : "below AL1"}), ${gs.trend >= 0 ? "rising" : "falling"} ${U.fmt(Math.abs(gs.trend), 1)} m/3h.`,
      cites: ["sensor"],
      num: { value: Math.round(gs.stage * 100) / 100, field: { kind: "gaugeStage", gauge: g0.id }, tol: 0.02 },
    });
    if (spilling.length) {
      const names = spilling.map((r) => `${r.name} (${U.fmtInt(snap.reservoirs[r.id].O)} m³/s)`).join(", ");
      claims.push({
        text: vi ? `Đang xả điều tiết: ${names}.` : `Regulating releases: ${names}.`,
        cites: ["d1865_a7", "sensor"],
        num: { value: Math.round(snap.reservoirs[spilling[0].id].O), field: { kind: "resOut", res: spilling[0].id }, tol: 1 },
      });
    }
    claims.push({
      text: vi
        ? `Giao thông: <b>${ts.openPct}%</b> mạng thông suốt, ${ts.closed} đoạn đóng, ETA Đà Nẵng→Hội An ${ts.etaMin > 0 ? ts.etaMin + " phút" : "không khả dụng"}.`
        : `Traffic: <b>${ts.openPct}%</b> of the network open, ${ts.closed} closed links, Đà Nẵng→Hội An ETA ${ts.etaMin > 0 ? ts.etaMin + " min" : "unavailable"}.`,
      cites: ["surrogate"],
      num: { value: ts.openPct, field: { kind: "openPct" }, tol: 0.5 },
    });
    const worst = FT.zones && FT.zones.worst ? FT.zones.worst(2) : [];
    if (worst.length) {
      const names = worst.map((z) => `${z.def.name} (${U.fmt(z.maxD, 1)} m${z.accessOk ? "" : vi ? ", mất tuyến EOC" : ", EOC cut"})`).join("; ");
      claims.push({
        text: vi
          ? `Khu vực trọng điểm: ${names} - tổng ${U.fmtInt(worst.reduce((s, z) => s + z.exposed, 0))} người phơi nhiễm.`
          : `Priority areas: ${names} - total ${U.fmtInt(worst.reduce((s, z) => s + z.exposed, 0))} people exposed.`,
        cites: ["surrogate", "sensor"],
      });
    }
    claims.push({
      text: vi
        ? `Triển vọng 12h: nhánh P95 tại ${g0.name} đạt <b>${U.fmt(q95in12, 1)} m</b> ${q95in12 >= g0.bd[2] ? "- <b>có rủi ro vượt BĐ3</b>" : "(dưới BĐ3)"}.`
        : `12-h outlook: the P95 member at ${g0.name} reaches <b>${U.fmt(q95in12, 1)} m</b> ${q95in12 >= g0.bd[2] ? "- <b>AL3 exceedance risk</b>" : "(below AL3)"}.`,
      cites: ["gencast"],
      num: { value: Math.round(q95in12 * 10) / 10, field: { kind: "q95in12", gauge: g0.id }, tol: 0.1 },
    });
    if (FT.state.policy === "mpc" && H.proposal) {
      claims.push({ text: mpcText(), cites: ["d1865_a8"] });
    }
    return claims;
  }

  /* Public hook so the boot self-test (js/main.js) and the gate can assert the brief's
     groundedness without opening a modal. Returns the raw verify() result. */
  UI.verifyBrief = (snap) => FT.grounding.verify(briefClaims(snap || H.at(FT.state.timeH)), snap || H.at(FT.state.timeH));

  function situationBriefHTML(snap) {
    const vi = FT.state.lang === "vi";
    const result = FT.grounding.verify(briefClaims(snap), snap);
    const contract = FT.grounding.meetsContract(result);
    const pct = Math.round(result.ratio * 100);
    const header = `<div class="groundBar ${contract.clearsTarget ? "ok" : "warn"}">
      <span>${vi ? "Độ có nguồn của bản tin" : "Brief groundedness"}</span>
      <strong>${pct}% · ${result.published.length}/${result.total}</strong>
      <em>${vi ? "ngưỡng" : "target"} ${Math.round(contract.target * 100)}%</em></div>`;
    const body = result.claims.map((c) => {
      const chips = (c.cites || []).map((k) => cite(k)).join("");
      if (c.grounded) return `<p>${c.text}${chips}</p>`;
      // struck: shown, not hidden — the reader sees the verifier refuse rather than a gap
      return `<p class="claimStruck"><s>${c.text}</s><span class="struckTag">${vi ? "đã loại · " : "removed · "}${c.reason}</span></p>`;
    }).join("");
    return header + body;
  }

  /* Verify the current brief and log any struck claim to the audit trail. Called when the
     brief is opened and when it is included in the printable report. */
  function verifyAndLogBrief(snap) {
    const result = FT.grounding.verify(briefClaims(snap), snap);
    if (result.struck.length && FT.ops && FT.ops.audit) {
      for (const c of result.struck) {
        FT.ops.audit.log("brief.claim_struck", { reason: c.reason, cites: (c.cites || []).join(",") }, c.text.replace(/<[^>]*>/g, ""));
      }
    }
    return result;
  }

  function citizenHTML(snap) {
    const vi = FT.state.lang === "vi";
    if (!H.ready) return `<p class="abstain">${vi ? "Thiếu bản tin hợp lệ - vui lòng theo kênh chính thức." : "No valid bulletin - please follow official channels."}</p>`;
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
        ? `Theo bản tin hiện hành, mực nước Thu Bồn tại Câu Lâu dự báo <b>dưới BĐ1</b> trong 12 giờ tới - khả năng ngập đường khu trung tâm là thấp. Đây là ước lượng xác suất; hãy theo dõi thông báo chính thức.`
        : `Per the current bulletin, the Thu Bồn at Câu Lâu is forecast to stay <b>below AL1</b> over the next 12 h - street flooding downtown is unlikely. This is a probabilistic estimate; follow official notices.`;
    } else {
      a = vi
        ? `Dựa trên bản tin NCHMF và dự báo mới nhất, có khoảng <b>${prob}%</b> khả năng nước đạt <b>0,3-0,6 m</b> tại các tuyến thấp ven sông Hội An trong đêm nay (Câu Lâu dự báo ${U.fmt(q50, 1)} m, P95 ${U.fmt(q95, 1)} m so với BĐ2 = ${g.bd[1]} m). Đây là ước lượng xác suất; hãy tuân theo thông báo sơ tán chính thức.`
        : `Based on the NCHMF bulletin and the latest forecast, there is about a <b>${prob}%</b> chance of <b>0.3-0.6 m</b> of water on low riverside streets of Hội An tonight (Câu Lâu forecast ${U.fmt(q50, 1)} m, P95 ${U.fmt(q95, 1)} m vs AL2 = ${g.bd[1]} m). This is a probabilistic estimate; follow official evacuation notices.`;
    }
    return `<p><i>${q}</i></p><p>${a}${cite("nchmf")}${cite("gencast")}${cite("surrogate")}</p><p style="color:var(--ink-2);font-size:11px">${vi ? "LLM chỉ tổng hợp - độ sâu lấy từ surrogate đã kiểm định, không do mô hình ngôn ngữ tự bịa." : "The LLM only assembles - depths come from the validated surrogate, never invented by the language model."}</p>`;
  }

  /* ---------- controls wiring ---------- */
  UI.init = function () {
    H = FT.hydro;
    [
      "btnPlay", "playIcon", "speedGroup", "scrubber", "simClock", "simRel", "simPhase",
      "viewTabs", "camPresets", "pipSwap", "pipTag", "viewModeTag", "mapHint",
      "scenarioSelect", "policyToggle", "policyTag", "langToggle",
      "mpcCard", "mpcText", "mpcConfidence", "mpcApprove", "mpcReject", "mpcDetails", "mpcRecord",
      "gaugeSelect", "gaugeStageNow", "gaugeTrend", "gaugeAlert", "gaugeCrps",
      "layerToggles", "rainScale", "ensSpread", "rainScaleVal", "ensSpreadVal",
      "kpiAlertValue", "kpiRainValue", "kpiGaugeValue", "kpiRoadsValue", "kpiLeadValue",
      "resList", "vehCount", "trOpen", "trClosed", "trReroute", "trEta", "closureList",
      "llmBrief", "btnBrief", "btnCitizen", "eventLog", "logCount",
      "floodedArea", "peopleExposed", "modalScrim", "modalTitle", "modalBody", "modalClose",
      "toasts", "zoneList", "zonesSummary", "kpiZonesValue",
      "explainInspector", "explainTitle", "explainClose", "explainSummary", "explainStatus",
      "explainQuantities", "explainSources", "explainConfidence", "explainAssumptions", "explainLimitations", "explainDegradation", "explainDocsLink",
    ].forEach((id) => (el[id] = $(id)));

    FT.bus.on("explainOrigin", (origin) => {
      if (!origin || !origin.element || !document.contains(origin.element)) return;
      explainReturnFocus = origin.element;
      explainMoveFocus = !!origin.moveFocus;
    });

    FT.bus.on("explainSelection", (contract) => {
      if (contract) {
        if (document.activeElement && document.activeElement.id === "canvas2d") explainReturnFocus = document.activeElement;
        renderExplanation(contract);
        if (explainMoveFocus) el.explainClose.focus({ preventScroll: true });
        explainMoveFocus = false;
      } else {
        activeExplanation = null;
        renderExplanation(null);
        restoreExplanationFocus();
        explainReturnFocus = null;
        explainMoveFocus = false;
      }
    });
    FT.bus.on("lang", () => { if (activeExplanation) renderExplanation(activeExplanation); });
    el.explainClose.addEventListener("click", () => FT.explain.clear());
    el.explainInspector.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      FT.explain.clear();
    });

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

    /* Workspace Layout Presets */
    const layoutGroup = document.getElementById("layoutPresets");
    if (layoutGroup) {
      layoutGroup.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => {
          const mode = btn.dataset.layout;
          layoutGroup.querySelectorAll("button").forEach((b) => b.classList.toggle("isActive", b === btn));
          document.body.classList.remove("mode-focus", "mode-analytics");
          if (mode === "focus") {
            document.body.classList.add("mode-focus");
          } else if (mode === "analytics") {
            document.body.classList.add("mode-analytics");
          }
          window.dispatchEvent(new Event("resize"));
          FT.notify && FT.notify(`Giao diện: ${btn.textContent}`, "info");
        });
      });
    }

    /* Accordion Panels toggle */
    document.querySelectorAll(".panelTitle").forEach((title) => {
      title.addEventListener("click", (ev) => {
        if (ev.target.closest("button") || ev.target.closest("a")) return;
        const panel = title.closest(".panel");
        if (panel) panel.classList.toggle("isCollapsed");
      });
    });

    // Default collapse secondary panels for clean UI space
    const collapseSecondary = ["subcatchPanel", "evacPanel", "metricsPanel", "panelForcing"];
    collapseSecondary.forEach((cls) => {
      const p = document.querySelector(`.${cls}`);
      if (p) p.classList.add("isCollapsed");
    });

    /* Performance Mode (Low-GPU Mode) */
    const btnPerf = document.getElementById("btnPerfMode");
    if (btnPerf) {
      btnPerf.addEventListener("click", () => {
        FT.state.perfMode = !FT.state.perfMode;
        btnPerf.classList.toggle("isActive", FT.state.perfMode);
        btnPerf.innerHTML = FT.icon("lightning") + (FT.state.perfMode ? "Chế độ Mượt (đang bật)" : "Chế độ Mượt");
        if (FT.scene3d && FT.scene3d.setPerfMode) {
          FT.scene3d.setPerfMode(FT.state.perfMode);
        }
        FT.notify(FT.state.perfMode ? "Chế độ Mượt: ĐÃ BẬT. Giảm tải để giữ khung hình trên máy yếu." : "Chế độ Mượt: TẮT. Chất lượng đồ hoạ tối đa.", "info");
      });
    }

    /* scenario & policy */
    el.scenarioSelect.value = FT.state.scenario;
    el.scenarioSelect.addEventListener("change", () => {
      supersede("scenario changed");
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
        supersede("policy changed to " + pol);
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

    /* decision record — the export control sits beside Approve, not in a
       submenu: the artefact is the point of the whole flow. EP-03 UX. */
    el.mpcRecord.addEventListener("click", () => {
      openModal("modal.record", recordModalHTML());
      const pr = $("recPrint"), js = $("recJson"), apx = $("recApx");
      if (pr) pr.addEventListener("click", () => printRecord(FT.record.last(), !apx || apx.checked));
      if (js) js.addEventListener("click", () => FT.record.download());
    });
    refreshRecordBtn();

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
      refreshRecordBtn();   /* i18n.apply resets textContent, which drops the count */
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
      verifyAndLogBrief(snap);                       // log any struck claim before showing
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
      methodReturnFocus = isVisible(btnMethod) ? btnMethod : $("canvas2d");
      const vi = FT.state.lang === "vi";
      openModal("modal.method", (vi ? `
        <h4>Thật (chạy trong trình duyệt)</h4>
        <p>· Mô phỏng nước mặt: <b>shallow-water height-field</b> (virtual pipes, Mei 2007) lưới 288², chỉ chạy động lực trên đồng bằng &lt;28 m - thượng lưu là đoạn chẩn đoán (tương ứng cấu trúc 1D/2D của paper §5).<br>
        · <b>Đồng hóa mực trạm</b> dọc hành lang sông (vòng lặp DA của twin, §6).<br>
        · <b>Routing hồ chứa</b> tích phân cân bằng khối cho cả hai chính sách (rule curve §3 · MPC §6), ensemble lan rộng theo lead time.<br>
        · <b>Giao thông</b>: Dijkstra thời gian thực trên mạng đường, đóng ở ≥30 cm (He 2026).<br>
        · Ngưỡng báo động BĐ1/2/3, tên hồ/trạm/sông, khung pháp lý QĐ 1865/QĐ-TTg là <b>thật</b>.</p>
        <h4>Bản đồ thật</h4>
        <p>· Địa hình: <b>DEM thật</b> (AWS Terrarium z12 ≈ 37 m/px toàn lưu vực + lớp phủ z14 ≈ 9 m/px trên đồng bằng Hội An-Vĩnh Điện-Ái Nghĩa-Cẩm Lệ) cho bbox 107,55-108,45°E / 15,30-16,16°N (96 km). <b>Giới hạn thật:</b> đây là DEM vệ tinh miễn phí - sai số đứng ±vài mét; độ chính xác 0,1 m cần LiDAR đo đạc (không có nguồn stream web). Ảnh <b>Esri World Imagery z12</b> + tile động tới <b>z19 (~0,3 m/px)</b> khi zoom; <b>đường thật</b> Esri World Transportation; tọa độ đập/trạm/khu là vị trí thật.</p>
        <h4>Tổng hợp (minh hoạ)</h4>
        <p>· Mưa/dòng vào là hàm giải tích khớp hình dạng sự kiện 10/2020 & Yagi; tòa nhà suy ra từ pixel ảnh (không phải footprint từng căn); chỉ số CSI/NSE/KGE là <b>mục tiêu thiết kế §8</b>, không phải đo đạc.<br>
        · Bản tin LLM là khuôn mẫu có trích dẫn - minh hoạ ràng buộc groundedness ≥ 0,95 (§7), không gọi mô hình thật.</p>
        <h4>Ánh xạ paper</h4>
        <p>Forcing §4 → thanh cưỡng bức · Surrogate §5 → SWE + chip 68× · Tối ưu §6 → Rule⇄MPC + gói quyết định · LLM §7 → bản tin/hỏi đáp · Benchmark §8 → thẻ chỉ số.</p>` : `
        <h4>Real (runs in your browser)</h4>
        <p>· Surface water: <b>shallow-water height-field</b> (virtual pipes, Mei 2007), 288² grid, dynamics on the &lt;28 m floodplain only - upstream reaches are diagnostic (mirroring the paper's 1D/2D split, §5).<br>
        · <b>Gauge-stage assimilation</b> along river corridors (the twin's DA loop, §6).<br>
        · <b>Reservoir routing</b> with mass balance for both policies (rule curve §3 · MPC §6); ensemble spread grows with lead time.<br>
        · <b>Traffic</b>: live Dijkstra over the road graph, closures at ≥30 cm (He 2026).<br>
        · Alert stages AL1/2/3, reservoir/gauge/river names and the 1865/QD-TTg legal frame are <b>real</b>.</p>
        <h4>Real map</h4>
        <p>· Terrain: <b>real DEM</b> (AWS Terrarium z12 ≈ 37 m/px basin-wide + a z14 ≈ 9 m/px overlay across the Hội An-Vĩnh Điện-Ái Nghĩa-Cẩm Lệ delta) over 107.55-108.45°E / 15.30-16.16°N (96 km). <b>Honest limit:</b> this is free satellite DEM - vertical error ±several metres; 0.1 m accuracy needs surveyed LiDAR (no web-streamable source exists). <b>Esri World Imagery z12</b> + viewport tiles up to <b>z19 (~0.3 m/px)</b> on zoom; <b>real roads</b> via Esri World Transportation; dam/gauge/zone coordinates are real.</p>
        <h4>Synthetic (illustrative)</h4>
        <p>· Rainfall/inflows are analytic functions shaped after Oct-2020 & Yagi; buildings are inferred from imagery pixels (not per-building footprints); the CSI/NSE/KGE shown are the paper's <b>§8 design targets</b>, not measurements.<br>
        · The LLM brief is a cited template - illustrating the ≥0.95 groundedness bound (§7), no live model call.</p>
        <h4>Paper mapping</h4>
        <p>Forcing §4 → forcing panel · Surrogate §5 → SWE + 68× chip · Optimisation §6 → Rule⇄MPC + decision package · LLM §7 → briefs · Benchmarks §8 → metric card.</p>`) +
        `<button id="methodExplainState" class="btnPrimary" type="button">${FT.i18n.t("explain.methodGateway")}</button>`);
      $("methodExplainState").addEventListener("click", () => {
        explainReturnFocus = methodReturnFocus;
        if (FT.explain.current) renderExplanation(FT.explain.current);
        else FT.explain.select({ kind: "point", xKm: D.DOMAIN.sizeKm / 2, yKm: D.DOMAIN.sizeKm / 2 });
        closeModal();
        el.explainTitle.tabIndex = -1;
        el.explainTitle.focus({ preventScroll: true });
      });
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

  /* ---------- printable decision record ----------
     Reuses the one print container and the one @media print block. The summary
     is a single A4 page; appendices follow on their own pages. */
  function buildRecordPrint(rec, withApx) {
    const host = $("printReport");
    host.classList.add("recordDoc");
    host.innerHTML = `<section class="recPage">${recordDocHTML(rec)}</section>` +
      (withApx ? `<section class="recPage recApx">${recAppendixHTML(rec)}</section>` : "");
    return host;
  }
  FT.ui.buildRecordPrint = buildRecordPrint;

  function printRecord(rec, withApx) {
    if (!rec) return;
    buildRecordPrint(rec, withApx);
    window.print();
  }

  /* ---------- printable situation report ---------- */
  function buildPrintReport(snap) {
    $("printReport").classList.remove("recordDoc");
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
      <table><tr><th></th><th>${t("report.stage")}</th><th>${AL()}1/2/3</th><th>${t("report.alert")}</th><th>P95 +12h</th></tr>
      ${D.GAUGES.map((g) => {
        const gs = snap.gauges[g.id];
        const q95 = H.sample(H.series(g.id)[H._activeKey()].q95, Math.min(H.T1, FT.state.timeH + 12));
        return `<tr><td>${g.name} (${g.river})</td><td>${U.fmt(gs.stage, 2)}</td><td>${g.bd.join(" / ")}</td><td>${gs.alert ? AL() + gs.alert : "-"}</td><td>${U.fmt(q95, 1)}</td></tr>`;
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
      <p>${t("tr.open")}: ${ts.openPct}% · ${t("tr.closed")}: ${ts.closed} · ${t("tr.eta")}: ${ts.etaMin > 0 ? ts.etaMin + "′" : "-"}</p>
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
    if (FT.state.view !== "3d") setView("3d");
    if (FT.scene3d && FT.scene3d.runCinematicDemo) {
      FT.scene3d.runCinematicDemo(() => {
        stopTour(true);
      });
    }
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

  /* A decision is sealed BEFORE the state it describes is mutated: the record
     has to document the world the operator was looking at when they clicked,
     not the world their click produced. DB-01 §3. */
  function seal(outcome) {
    if (!FT.record) return null;
    const rec = FT.record.seal(outcome);
    FT.record.noteDecided(rec);
    refreshRecordBtn();
    /* The event log is where an operator looks for what happened, so a sealed
       record has to appear there rather than only inside a modal nobody opened. */
    FT.log(`${FT.i18n.t("rec.sealed")} ${rec.id}`, outcome === "approved" ? "ok" : "info");
    return rec;
  }

  /* The decision context changed underneath an open decision. Snapshot the
     world as it still is, then let the caller change it. EP-03 F05. */
  function supersede(reason) {
    if (!FT.record) return null;
    const rec = FT.record.noteContextChange(reason);
    if (rec) { refreshRecordBtn(); FT.log(FT.i18n.t("rec.superseded"), "warn"); }
    return rec;
  }

  function approveMpc() {
    if (FT.state.policy !== "mpc") return;
    seal("approved");
    FT.state.mpcApproved = true;
    el.mpcCard.classList.add("approved");
    el.mpcApprove.textContent = FT.i18n.t("mpc.approved");
    FT.notify(FT.i18n.t("toast.approved"), "ok");
    FT.log(FT.i18n.t("mpc.applied"), "ok");
    FT.bus.emit("hydroRebuilt");
  }
  function rejectMpc() {
    seal("rejected");
    FT.state.mpcApproved = false;
    el.mpcCard.classList.remove("approved");
    el.mpcApprove.textContent = FT.i18n.t("mpc.approve");
    FT.notify(FT.i18n.t("toast.rejected"), "info");
    FT.bus.emit("hydroRebuilt");
  }
  function refreshMpc() {
    if (FT.record) FT.record.notePresented();
    el.mpcText.innerHTML = mpcText();
    /* Chip shows what the release achieves (peak cut), not the residual probability —
       a lone "26%" in the header reads as a failure rate. The full band and P(below AL3)
       live in the decision package's residual-risk section. R-33. */
    el.mpcConfidence.textContent = H.proposal
      ? `−${U.fmt(Math.max(0, H.proposal.ruleStage - H.proposal.mpcStage), 1)} m`
      : "-";
    /* head-to-head peak comparison at the governing gauge */
    const cmp = $("mpcCompare");
    if (cmp) {
      const g0 = D.GAUGES[0];
      const S = H.series(g0.id);
      const cut = S.rulePeak - S.mpcPeak;
      const vi = FT.state.lang === "vi";
      cmp.innerHTML = `${vi ? "Đỉnh" : "Peak"} ${g0.name}: <em>Rule</em> ${U.fmt(S.rulePeak, 1)} m → <em>MPC</em> ${U.fmt(S.mpcPeak, 1)} m ${cut > 0.05 ? `<b>(−${U.fmt(cut, 1)} m)</b>` : ""} · ${AL()}3 ${g0.bd[2]} m`;
    }
  }

  function setView(v) {
    const prevView = FT.state.view;
    if (v === "3d" && !FT.state.threeReady) v = "2d";

    if (prevView !== v) {
      if (v === "3d" && prevView === "2d" && FT.map2d && FT.map2d.getCam && FT.scene3d && FT.scene3d.syncFrom2D) {
        const c2 = FT.map2d.getCam();
        FT.scene3d.syncFrom2D(c2.x, c2.y, c2.scale);
      } else if (v === "2d" && prevView === "3d" && FT.scene3d && FT.scene3d.getCam && FT.map2d && FT.map2d.syncFrom3D) {
        const c3 = FT.scene3d.getCam();
        if (c3) FT.map2d.syncFrom3D(c3.x, c3.z, c3.dist);
      }
    }

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
        <div><span>${FT.i18n.t("zone.gauge")}</span><strong>${g.name} ${U.fmt(gs.stage, 1)} m${gs.alert ? " · " + AL() + gs.alert : ""}</strong></div>
      </div>
      ${FT.state.threeReady ? `<p style="margin:2px 0 6px;font-size:12px">${FT.icon("house")} <b>~${U.fmtInt(FT.scene3d.homesInRadius(zs.def.x, zs.def.y, zs.def.r))}</b> ${FT.i18n.t("impact.homes").toLowerCase()} (≥15 cm)</p>` : ""}
      <h4>${FT.i18n.t("zone.history")}</h4>
      <canvas class="zoneSpark" id="zoneSparkCanvas"></canvas>
      <h4>${FT.i18n.t("zone.pois")}</h4>
      ${zs.pois.map((p) => `<div class="poiRow"><span class="poiIco">${FT.icon(p.t === "hosp" ? "first-aid" : p.t === "bridge" ? "bridge" : p.t === "school" ? "student" : p.t === "herit" ? "bank" : p.t === "eoc" ? "siren" : "road-horizon")}</span>${p.n}<b class="${p.ok ? "ok" : "bad"}">${p.ok ? FT.i18n.t("zone.ok") : FT.i18n.t("zone.flooded") + " " + Math.round(p.depth * 100) + " cm"}</b></div>`).join("")}
      <h4>${FT.i18n.t("zone.actions")}</h4>
      ${zs.actions.length ? `<ul class="zoneActions">${zs.actions.map((a) => `<li>${a}</li>`).join("")}</ul>` : `<p style="color:var(--ink-2)">${vi ? "Chưa cần hành động - tiếp tục theo dõi." : "No action needed - keep monitoring."}</p>`}
      <div class="mpcActions" style="margin-top:12px">
        <button id="zoneFly" class="btnPrimary" type="button">${FT.icon("crosshair")} ${FT.i18n.t("zone.flyto")}</button>
      </div>`;
  }

  function openZoneDetail(id) {
    const zs = FT.zones.byId(id);
    if (!zs) return;
    el.modalTitle.textContent = `${FT.i18n.t("modal.zone")} - ${zs.def.name} · ${FT.i18n.t("zone.st" + zs.status)}`;
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
      ref.depth.textContent = zs.maxD > 0.02 ? `${U.fmt(zs.maxD, 2)} m` : "-";
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
    el.zonesSummary.innerHTML = `<i class="zDot" style="background:var(--al-3)"></i>${c.red} <i class="zDot" style="background:var(--al-2)"></i>${c.orange}`;
    el.kpiZonesValue.textContent = `${c.orange} / ${c.red}`;
    el.kpiZonesValue.style.color = c.red > 0 ? U.css("--al-3") : c.orange > 0 ? U.css("--al-2") : "";
  }

  function buildGaugeSelect() {
    el.gaugeSelect.innerHTML = "";
    for (const g of D.GAUGES) {
      const o = document.createElement("option");
      o.value = g.id;
      o.textContent = `${g.name} - ${g.river}`;
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
    const alertTxt = snap.basinAlert ? `${AL()}${snap.basinAlert}` : FT.i18n.t("alert.normal");
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
    el.gaugeAlert.textContent = gs.alert ? `${AL()}${gs.alert}` : FT.i18n.t("alert.normal");
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
    el.trEta.textContent = ts.etaMin > 0 ? `${ts.etaMin} ${FT.i18n.t("unit.min")}` : "-";

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
