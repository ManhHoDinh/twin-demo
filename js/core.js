/* FloodTwin Q1 Demo — core: namespace, state, event bus, i18n, utils */
(function () {
  "use strict";

  const FT = (window.FT = window.FT || {});

  /* ---------- event bus ---------- */
  const listeners = {};
  FT.bus = {
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return fn; },
    off(evt, fn) { const a = listeners[evt]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    emit(evt, payload) { (listeners[evt] || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error(`[FT.bus:${evt}]`, e); } }); },
  };

  /* ---------- global state ---------- */
  FT.state = {
    lang: "vi",
    scenario: "oct2020",
    policy: "rule",            // "rule" | "mpc"
    mpcApproved: false,
    timeH: -6,                 // simulation time, hours relative to "now" [-24, +48]
    playing: true,
    speed: 1800,               // sim-seconds per real-second (30 sim-min/s)
    view: "3d",               // "3d" | "2d"
    camPreset: "overview",
    selectedGauge: "aiNghia",
    rainScale: 1.0,
    ensSpread: 1.0,
    layers: { water: true, flow: true, traffic: true, roads: true, gauges: true, reservoirs: true, rain: true, labels: true, zones: true, bldg: true, impact: true },
    quality: "high",
    threeReady: null,          // null = pending, true/false
  };

  /* ---------- i18n ---------- */
  const STR = {
    vi: {
      "tagline": "Bản sao số lũ & liên hồ chứa · nhận thức bất định · nền tảng pháp quy",
      "kpi.alert": "Cảnh báo lưu vực", "kpi.rain": "Mưa lưu vực", "kpi.gauge": "Ái Nghĩa", "kpi.roads": "Mạng đường thông", "kpi.leadtime": "Lead time hiệu dụng",
      "scenario.label": "Kịch bản",
      "scenario.oct2020": "Lũ tháng 10/2020 (lịch sử)", "scenario.yagi": "Siêu bão kiểu Yagi (cực đoan)", "scenario.monsoon": "Gió mùa trung bình",
      "policy.rule": "Rule curve tĩnh", "policy.mpc": "FloodTwin MPC",
      "panel.forcing": "Cưỡng bức khí tượng", "ctl.rainScale": "Hệ số mưa (× ensemble)", "ctl.ensSpread": "Độ mở ensemble",
      "ctl.note": "Chuỗi GraphCast/GenCast + IMERG hiệu chỉnh — dữ liệu tổng hợp minh hoạ.",
      "panel.layers": "Lớp hiển thị",
      "layer.water": "Mặt nước / ngập", "layer.flow": "Hạt dòng chảy", "layer.traffic": "Giao thông", "layer.roads": "Trạng thái đường",
      "layer.gauges": "Trạm thủy văn", "layer.reservoirs": "Hồ chứa / đập", "layer.rain": "Mưa", "layer.labels": "Nhãn địa danh",
      "panel.legend": "Chú giải", "legend.depth": "Độ sâu ngập (m)", "legend.road": "Khả năng lưu thông", "legend.alert": "Mức báo động trạm",
      "road.open": "Thông suốt", "road.caution": "Chú ý (<15 cm)", "road.risk": "Hạn chế (15–30 cm)", "road.closed": "Đóng (≥30 cm)",
      "alert.normal": "Bình thường",
      "panel.metrics": "Chỉ số mô hình · mục tiêu Q1", "metrics.synthetic": "demo tổng hợp", "metrics.vs": "(vs Sentinel-1)", "metrics.ground": "Groundedness LLM",
      "metrics.surrogate": "Surrogate FNO/DeepONet",
      "view.3d": "Song sinh số 3D", "view.2d": "Bản đồ vận hành 2D",
      "cam.overview": "Toàn cảnh", "cam.delta": "Hạ lưu", "cam.dams": "Bậc thang hồ", "cam.hoian": "Hội An",
      "hint.orbit": "Kéo xoay · lăn thu phóng · phải rê dịch", "hint.pan2d": "Kéo dịch chuyển · lăn thu phóng · nhấp trạm/hồ để xem",
      "badge.flooded": "Diện ngập", "badge.people": "Dân cư phơi nhiễm",
      "fallback.webgl": "Không tải được WebGL/Three.js — chuyển sang bản đồ 2D (đầy đủ mô phỏng).",
      "tl.observed": "quan trắc", "tl.now": "HIỆN TẠI", "tl.forecast": "dự báo ensemble",
      "panel.gauge": "Trạm thủy văn · dự báo xác suất",
      "gauge.stage": "Mực nước", "gauge.trend": "Xu thế 3h", "gauge.alert": "Báo động",
      "chart.obs": "Quan trắc", "chart.median": "Trung vị",
      "panel.reservoir": "Bậc thang liên hồ · QĐ 1865/QĐ-TTg",
      "mpc.title": "Đề xuất xả trước (MPC · nằm trong hành lang pháp lý)",
      "mpc.approve": "Phê duyệt", "mpc.details": "Gói quyết định", "mpc.reject": "Từ chối",
      "mpc.note": "Không cửa van nào vận hành theo lời LLM — người trực phê duyệt mọi lệnh xả.",
      "mpc.approved": "ĐÃ PHÊ DUYỆT", "mpc.applied": "Đang xả trước theo lệnh đã phê duyệt",
      "panel.traffic": "Giao thông thời gian thực",
      "tr.open": "Mạng thông", "tr.closed": "Đoạn đóng", "tr.reroute": "Xe đổi lộ trình", "tr.eta": "ETA ĐN→Hội An",
      "tr.veh": "xe", "tr.blocked": "tắc",
      "panel.llm": "Lớp LLM có kiểm soát · RAG", "llm.grounded": "100% trích nguồn",
      "llm.placeholder": "Nhấn tạo bản tin để tổng hợp tình huống — mọi con số lấy từ solver/optimizer, mọi mệnh đề kèm trích dẫn.",
      "llm.generate": "Tạo bản tin tình huống", "llm.citizen": "Hỏi đáp cư dân Hội An",
      "panel.log": "Nhật ký sự kiện",
      "panel.zones": "Khu vực giám sát", "kpi.zones": "KV nguy cơ/khẩn cấp",
      "layer.zones": "Vòng khu vực", "layer.bldg": "Tòa nhà", "layer.impact": "Tác động dân cư",
      "impact.homes": "Nhà ngập",
      "legend.impact": "Tác động dân cư", "legend.heat": "Nhiệt đồ dân × ngập", "legend.h15": "Nhà ngập ≥15 cm", "legend.h50": "Nhà ngập ≥50 cm",
      "zone.depth": "Ngập max", "zone.mean": "Ngập TB", "zone.exposed": "Phơi nhiễm", "zone.access": "Tiếp cận EOC",
      "zone.accessOk": "thông", "zone.accessCut": "MẤT TUYẾN", "zone.pois": "Hạ tầng trọng yếu", "zone.actions": "Khuyến nghị hành động",
      "zone.flyto": "Đến vị trí", "zone.history": "Diễn biến ngập (T−24h→nay)", "zone.gauge": "Trạm gần nhất",
      "zone.st0": "An toàn", "zone.st1": "Theo dõi", "zone.st2": "Nguy cơ", "zone.st3": "KHẨN CẤP",
      "zone.toRed": "chuyển mức KHẨN CẤP", "zone.toOrange": "chuyển mức nguy cơ", "zone.improved": "hạ mức — tình hình cải thiện",
      "zone.ok": "OK", "zone.flooded": "ngập", "modal.zone": "Chi tiết khu vực",
      "foot.mode": "Dữ liệu tổng hợp minh hoạ phương pháp — không dùng cho vận hành thật", "foot.docs": "Tài liệu kỹ thuật",
      "alert.bd": "BĐ", "alert.over": "Trên BĐ3",
      "phase.calm": "Ổn định", "phase.watch": "Theo dõi", "phase.rise": "Nước lên", "phase.peak": "Đỉnh lũ", "phase.recede": "Nước rút",
      "unit.people": "người", "unit.min": "ph",
      "res.inflow": "vào", "res.outflow": "xả", "res.ceil": "trần trước lũ", "res.gate": "cửa van", "res.preRelease": "xả trước",
      "modal.decision": "Gói quyết định · xả trước MPC", "modal.brief": "Bản tin tình huống (LLM có kiểm soát)", "modal.citizen": "Hỏi đáp cư dân — Hội An",
      "dp.proposed": "Lệnh xả đề xuất", "dp.envelope": "Bao dòng vào ensemble", "dp.legal": "Điều khoản pháp lý", "dp.residual": "Rủi ro tồn dư", "dp.downstream": "Hạ lưu dự kiến",
      "toast.mpcOn": "Đã kích hoạt tối ưu MPC — đề xuất xả trước sẵn sàng chờ phê duyệt.",
      "toast.approved": "Lệnh xả trước đã được phê duyệt — cập nhật dự báo hạ lưu.",
      "toast.rejected": "Đã từ chối đề xuất. Giữ vận hành theo rule curve.",
      "toast.scenario": "Đã nạp kịch bản", "toast.reroute": "Giao thông tự động định tuyến lại quanh đoạn ngập",
      "tour.btn": "Trình diễn",
      "tour.s1": "🎬 Trình diễn — Lũ 10/2020: theo dõi nước lên từ thượng nguồn", "tour.s2": "Vùng trũng ven sông ngập trước — xe bắt đầu đổi lộ trình",
      "tour.s3": "Đỉnh lũ theo RULE CURVE: Ái Nghĩa vượt BĐ3, nhiều tuyến đường đóng", "tour.s4": "FloodTwin MPC nhìn thấy trước đỉnh lũ — đề xuất xả trước chờ phê duyệt",
      "tour.s5": "Người trực PHÊ DUYỆT — hồ hạ mực nước đón lũ", "tour.s6": "Cùng đỉnh lũ với MPC: mực hạ lưu giảm rõ — so sánh 2 đường trên biểu đồ",
      "tour.end": "🎬 Kết thúc trình diễn — mời bạn tự do khám phá", "tour.cancel": "Đã dừng trình diễn",
      "report.btn": "Xuất báo cáo", "report.title": "BÁO CÁO TÌNH HUỐNG LŨ — LƯU VỰC VU GIA – THU BỒN",
      "report.at": "Thời điểm", "report.gauges": "Trạm thủy văn", "report.res": "Hồ chứa", "report.zones": "Khu vực trọng điểm", "report.traffic": "Giao thông",
      "report.stage": "Mực nước (m)", "report.alert": "Báo động", "report.level": "Mực hồ (m)", "report.ceil": "Trần trước lũ", "report.io": "Vào / Xả (m³/s)",
      "report.depth": "Ngập max (m)", "report.exposed": "Phơi nhiễm", "report.access": "Tiếp cận EOC", "report.brief": "Tóm tắt tình huống",
      "modal.method": "Phương pháp — cái gì thật, cái gì tổng hợp",
      "log.start": "Khởi tạo bản sao số VGTB — 4 hồ chứa, 2 trạm chính, lưới SWE 144².",
      "ev.bd1": "vượt báo động 1", "ev.bd2": "vượt báo động 2", "ev.bd3": "vượt BÁO ĐỘNG 3", "ev.below": "xuống dưới báo động 1",
      "ev.roadClosed": "ngập ≥30 cm — đóng đường", "ev.roadOpen": "nước rút — mở lại",
      "ev.gateOpen": "tăng cửa xả", "ev.peak": "qua đỉnh lũ tại", "ev.rainPeak": "đỉnh mưa lưu vực",
    },
    en: {
      "tagline": "Flood & inter-reservoir digital twin · uncertainty-aware · regulation-grounded",
      "kpi.alert": "Basin alert", "kpi.rain": "Basin rainfall", "kpi.gauge": "Ai Nghia", "kpi.roads": "Road network open", "kpi.leadtime": "Effective lead time",
      "scenario.label": "Scenario",
      "scenario.oct2020": "Oct 2020 flood (historical)", "scenario.yagi": "Yagi-class typhoon (extreme)", "scenario.monsoon": "Average monsoon",
      "policy.rule": "Static rule curve", "policy.mpc": "FloodTwin MPC",
      "panel.forcing": "Meteorological forcing", "ctl.rainScale": "Rain factor (× ensemble)", "ctl.ensSpread": "Ensemble spread",
      "ctl.note": "GraphCast/GenCast chain + bias-corrected IMERG — synthetic demo data.",
      "panel.layers": "Layers",
      "layer.water": "Water / inundation", "layer.flow": "Flow particles", "layer.traffic": "Traffic", "layer.roads": "Road status",
      "layer.gauges": "River gauges", "layer.reservoirs": "Reservoirs / dams", "layer.rain": "Rainfall", "layer.labels": "Place labels",
      "panel.legend": "Legend", "legend.depth": "Flood depth (m)", "legend.road": "Passability", "legend.alert": "Gauge alert level",
      "road.open": "Open", "road.caution": "Caution (<15 cm)", "road.risk": "Restricted (15–30 cm)", "road.closed": "Closed (≥30 cm)",
      "alert.normal": "Normal",
      "panel.metrics": "Model skill · Q1 targets", "metrics.synthetic": "synthetic demo", "metrics.vs": "(vs Sentinel-1)", "metrics.ground": "LLM groundedness",
      "metrics.surrogate": "FNO/DeepONet surrogate",
      "view.3d": "3D digital twin", "view.2d": "2D operations map",
      "cam.overview": "Overview", "cam.delta": "Lowlands", "cam.dams": "Cascade", "cam.hoian": "Hoi An",
      "hint.orbit": "Drag to orbit · scroll to zoom · right-drag to pan", "hint.pan2d": "Drag to pan · scroll to zoom · click gauges/dams",
      "badge.flooded": "Flooded area", "badge.people": "People exposed",
      "fallback.webgl": "WebGL/Three.js unavailable — showing the full-simulation 2D map instead.",
      "tl.observed": "observed", "tl.now": "NOW", "tl.forecast": "ensemble forecast",
      "panel.gauge": "River gauge · probabilistic forecast",
      "gauge.stage": "Stage", "gauge.trend": "3h trend", "gauge.alert": "Alert",
      "chart.obs": "Observed", "chart.median": "Median",
      "panel.reservoir": "Reservoir cascade · Decision 1865/QD-TTg",
      "mpc.title": "Pre-release proposal (MPC · inside legal envelope)",
      "mpc.approve": "Approve", "mpc.details": "Decision package", "mpc.reject": "Reject",
      "mpc.note": "No gate moves on the LLM's word — the duty operator approves every release.",
      "mpc.approved": "APPROVED", "mpc.applied": "Pre-releasing per approved order",
      "panel.traffic": "Real-time traffic",
      "tr.open": "Network open", "tr.closed": "Closed links", "tr.reroute": "Rerouted", "tr.eta": "ETA DN→Hoi An",
      "tr.veh": "veh", "tr.blocked": "jam",
      "panel.llm": "Bounded LLM layer · RAG", "llm.grounded": "100% cited",
      "llm.placeholder": "Generate a brief to summarise the situation — every number comes from the solver/optimizer, every clause carries a citation.",
      "llm.generate": "Generate situation brief", "llm.citizen": "Hoi An citizen Q&A",
      "panel.log": "Event log",
      "panel.zones": "Monitored areas", "kpi.zones": "Areas at risk/critical",
      "layer.zones": "Area rings", "layer.bldg": "Buildings", "layer.impact": "Human impact",
      "impact.homes": "Flooded homes",
      "legend.impact": "Human impact", "legend.heat": "Pop × depth heatmap", "legend.h15": "Homes ≥15 cm", "legend.h50": "Homes ≥50 cm",
      "zone.depth": "Max depth", "zone.mean": "Mean depth", "zone.exposed": "Exposed", "zone.access": "EOC access",
      "zone.accessOk": "open", "zone.accessCut": "CUT OFF", "zone.pois": "Critical infrastructure", "zone.actions": "Recommended actions",
      "zone.flyto": "Fly to", "zone.history": "Flood history (T−24h→now)", "zone.gauge": "Nearest gauge",
      "zone.st0": "Safe", "zone.st1": "Watch", "zone.st2": "At risk", "zone.st3": "CRITICAL",
      "zone.toRed": "escalated to CRITICAL", "zone.toOrange": "escalated to at-risk", "zone.improved": "downgraded — improving",
      "zone.ok": "OK", "zone.flooded": "flooded", "modal.zone": "Area detail",
      "foot.mode": "Synthetic demo data illustrating the method — not for real operations", "foot.docs": "Technical documentation",
      "alert.bd": "AL", "alert.over": "Above AL3",
      "phase.calm": "Stable", "phase.watch": "Watch", "phase.rise": "Rising", "phase.peak": "Flood peak", "phase.recede": "Receding",
      "unit.people": "people", "unit.min": "min",
      "res.inflow": "in", "res.outflow": "out", "res.ceil": "pre-flood ceiling", "res.gate": "gates", "res.preRelease": "pre-release",
      "modal.decision": "Decision package · MPC pre-release", "modal.brief": "Situation brief (bounded LLM)", "modal.citizen": "Citizen Q&A — Hoi An",
      "dp.proposed": "Proposed release", "dp.envelope": "Ensemble inflow envelope", "dp.legal": "Governing clause", "dp.residual": "Residual risk", "dp.downstream": "Projected downstream",
      "toast.mpcOn": "MPC optimizer armed — pre-release proposal awaiting approval.",
      "toast.approved": "Pre-release approved — downstream forecast updated.",
      "toast.rejected": "Proposal rejected. Keeping rule-curve operation.",
      "toast.scenario": "Scenario loaded", "toast.reroute": "Traffic automatically rerouted around flooded links",
      "tour.btn": "Demo tour",
      "tour.s1": "🎬 Tour — Oct 2020 flood: watch the rise from upstream", "tour.s2": "Riverside lowlands flood first — vehicles start rerouting",
      "tour.s3": "RULE-CURVE peak: Ái Nghĩa exceeds AL3, multiple roads closed", "tour.s4": "FloodTwin MPC sees the peak coming — pre-release proposed, awaiting approval",
      "tour.s5": "Operator APPROVES — reservoirs draw down to receive the flood", "tour.s6": "Same peak under MPC: downstream stage clearly lower — compare both curves",
      "tour.end": "🎬 Tour finished — explore freely", "tour.cancel": "Tour stopped",
      "report.btn": "Export report", "report.title": "FLOOD SITUATION REPORT — VU GIA – THU BON BASIN",
      "report.at": "As of", "report.gauges": "River gauges", "report.res": "Reservoirs", "report.zones": "Priority areas", "report.traffic": "Traffic",
      "report.stage": "Stage (m)", "report.alert": "Alert", "report.level": "Level (m)", "report.ceil": "Pre-flood ceiling", "report.io": "In / Out (m³/s)",
      "report.depth": "Max depth (m)", "report.exposed": "Exposed", "report.access": "EOC access", "report.brief": "Situation summary",
      "modal.method": "Methods — what is real vs synthetic",
      "log.start": "VGTB digital twin initialised — 4 reservoirs, 2 key gauges, 144² SWE grid.",
      "ev.bd1": "exceeded alert level 1", "ev.bd2": "exceeded alert level 2", "ev.bd3": "exceeded ALERT LEVEL 3", "ev.below": "dropped below alert level 1",
      "ev.roadClosed": "flooded ≥30 cm — road closed", "ev.roadOpen": "water receded — reopened",
      "ev.gateOpen": "increased spillway release", "ev.peak": "flood peak passed at", "ev.rainPeak": "basin rainfall peak",
    },
  };

  FT.i18n = {
    t(key) { return (STR[FT.state.lang] && STR[FT.state.lang][key]) || STR.vi[key] || key; },
    apply(root) {
      (root || document).querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = FT.i18n.t(el.dataset.i18n); });
      document.documentElement.lang = FT.state.lang;
    },
    setLang(lang) { FT.state.lang = lang; FT.i18n.apply(); FT.bus.emit("lang", lang); },
  };

  /* ---------- utils ---------- */
  FT.util = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    smoothstep(a, b, t) { const x = FT.util.clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); },
    fmt(v, d = 1) { return Number(v).toLocaleString(FT.state.lang === "vi" ? "vi-VN" : "en-US", { maximumFractionDigits: d, minimumFractionDigits: d }); },
    fmtInt(v) { return Math.round(v).toLocaleString(FT.state.lang === "vi" ? "vi-VN" : "en-US"); },
    /* sim clock: t hours relative to scenario "now" anchor */
    clock(tH) {
      const anchor = FT.data.SCENARIOS[FT.state.scenario].anchor; // {y,m,d,h}
      const ms = Date.UTC(anchor.y, anchor.m - 1, anchor.d, anchor.h) + tH * 3600e3;
      const dt = new Date(ms);
      const pad = (n) => String(n).padStart(2, "0");
      return { hm: `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`, dm: `${pad(dt.getUTCDate())}/${pad(dt.getUTCMonth() + 1)}`, dt };
    },
    rel(tH) { const s = tH < 0 ? "−" : "+"; const a = Math.abs(tH); const h = Math.floor(a); const m = Math.floor((a - h) * 60); return `T${s}${h}h${m ? String(m).padStart(2, "0") : ""}`; },
    /* deterministic pseudo-random */
    mulberry(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
    /* depth (m) → rgba color stops shared by 2D & 3D */
    /* discrete depth bands — flood "density" classes readable at a glance */
    depthColor(d, out) {
      out = out || [0, 0, 0, 0];
      if (d <= 0.02) { out[3] = 0; return out; }
      let r, g, b, a;
      if (d < 0.15) { r = 138; g = 208; b = 238; a = 0.38; }        // lấp xấp
      else if (d < 0.5) { r = 86; g = 168; b = 228; a = 0.58; }     // nông
      else if (d < 1.0) { r = 42; g = 112; b = 206; a = 0.74; }     // trung bình
      else if (d < 2.0) { r = 20; g = 62; b = 162; a = 0.86; }      // sâu
      else { r = 34; g = 26; b = 122; a = 0.93; }                   // rất sâu
      out[0] = r; out[1] = g; out[2] = b; out[3] = a;
      return out;
    },
    roadColor(depth) {
      if (depth >= 0.30) return getCSS("--road-closed");
      if (depth >= 0.15) return getCSS("--road-risk");
      if (depth >= 0.05) return getCSS("--road-caution");
      return getCSS("--road-open");
    },
    roadClass(depth) { return depth >= 0.30 ? 3 : depth >= 0.15 ? 2 : depth >= 0.05 ? 1 : 0; },
    alertColor(level) { return getCSS(`--al-${FT.util.clamp(level, 0, 3)}`); },
  };

  let cssCache = {};
  function getCSS(name) {
    if (!cssCache[name]) cssCache[name] = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
    return cssCache[name];
  }
  FT.util.css = getCSS;

  /* ---------- shared toast/log helpers (ui.js renders) ---------- */
  FT.notify = (msg, kind) => FT.bus.emit("toast", { msg, kind: kind || "info" });
  FT.log = (msg, kind, tH) => FT.bus.emit("logEvent", { msg, kind: kind || "info", tH: tH === undefined ? FT.state.timeH : tH });

  /* ---------- production safety net: surface runtime errors, throttled ---------- */
  let lastErrT = 0;
  function surfaceError(msg) {
    const now = Date.now();
    if (now - lastErrT < 10000) return;
    lastErrT = now;
    try { FT.notify(`⚠️ ${String(msg).slice(0, 120)}`, "danger"); } catch (_) { /* toasts not ready */ }
  }
  window.addEventListener("error", (ev) => surfaceError(ev.message || ev.error));
  window.addEventListener("unhandledrejection", (ev) => surfaceError(ev.reason && ev.reason.message ? ev.reason.message : ev.reason));
})();
