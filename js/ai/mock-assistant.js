/* Local deterministic assistant. Reads synthetic engine outputs; never runs an LLM,
   estimates street flooding, or applies an operating decision. */
(function () {
  "use strict";
  const FT = window.FT;
  const AI = FT.mockAI = { provider: "mock", version: "1.0" };
  let revision = 0, last = null, statusKey = "";
  FT.bus.on("hydroRebuilt", () => { revision++; });
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const freeze = (x) => { if (x && typeof x === "object") { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
  const finite = (x) => typeof x === "number" && Number.isFinite(x);
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
  const n = (v, d = 2) => finite(v) ? v.toFixed(d) : "—";
  function signature() {
    const s = FT.state, H = FT.hydro, health = FT.ops.health();
    const roads = FT.traffic && FT.traffic.stats ? FT.traffic.stats() : null;
    return JSON.stringify([revision, H.ready, s.scenario, s.timeH, s.rainScale,
      s.ensSpread, s.selectedGauge, H._activeKey(), H.viewSelection(), health.level, health.oldest,
      FT.world && FT.world.ready, roads && [roads.openPct, roads.closed]]);
  }
  AI.signature = signature;
  AI.capture = function () {
    const H = FT.hydro, s = FT.state, D = FT.data, health = FT.ops.health();
    const c = { signature: signature(), scenario: s.scenario, timeH: s.timeH,
      selectedGauge: s.selectedGauge, health: {level: health.level, oldest: health.oldest},
      operational: H._activeKey(), selection: copy(H.normalizeSelection(H.viewSelection() || H._activeKey())),
      preview: !!H.viewSelection(), gauges: [], reservoirs: [], roads: null, ready: false };
    if (!H.ready || !finite(c.timeH) || c.timeH < H.T0 || c.timeH > H.T1) return freeze(c);
    c.rain = H.sample(H.rain, c.timeH);
    c.horizon = Math.max(0, Math.min(12, H.T1 - c.timeH));
    for (const g of D.GAUGES) {
      const e = H.ensemble(g.id, c.selection), end = c.timeH + c.horizon;
      let peakT = c.timeH, peak = H.sample(e.med, peakT);
      // A piecewise-linear series peaks at a sample or an interval endpoint.
      const candidates = [end];
      for (let i = Math.ceil((c.timeH - H.T0) / H.DT); i < H.NT && H.t[i] <= end; i++) candidates.push(H.t[i]);
      for (const t of candidates) { const v = H.sample(e.med, t); if (v > peak) { peak = v; peakT = t; } }
      const parts = H.gaugeParts(g, peakT, c.selection), dt = Math.min(3, H.T1 - c.timeH);
      const stage = H.sample(e.med, c.timeH);
      c.gauges.push({ id: g.id, name: g.name, stage, bd: [...g.bd],
        alert: g.bd.reduce((a, b, i) => stage >= b ? i + 1 : a, 0),
        trend: dt > 0 ? H.sample(e.med, c.timeH + dt) - stage : null, trendH: dt,
        peak, peakT, q05: H.sample(e.q05, peakT), q95: H.sample(e.q95, peakT),
        clipped: parts.base + parts.res + parts.loc >= g.max });
    }
    for (const r of D.RESERVOIRS) {
      const R = H.res[r.id][c.selection[r.id]], t = c.timeH;
      c.reservoirs.push({id: r.id, name: r.name, policy: c.selection[r.id],
        inflow: H.sample(R.I, t), outflow: H.sample(R.O, t), level: H.sample(R.Z, t),
        capacityExceeded: H.sample(R.S, t) > r.capM});
    }
    // Roads are the currently rendered operational world, never the comparison preview.
    if (FT.world && FT.world.ready && FT.traffic && FT.traffic.stats) c.roads = copy(FT.traffic.stats());
    c.ready = finite(c.rain) && c.gauges.every(g => [g.stage, g.peak, g.peakT, g.q05, g.q95].every(finite)) &&
      c.reservoirs.every(r => [r.inflow, r.outflow, r.level].every(finite));
    return freeze(c);
  };
  AI.answer = function (question = "", context = AI.capture(), lang = FT.state.lang) {
    const vi = lang === "vi", L = (v, e) => vi ? v : e;
    const n = (v, d = 2) => finite(v) ? v.toLocaleString(vi ? "vi-VN" : "en-US",
      {minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false}) : "—";
    const q = norm(question).slice(0, 500), c = context;
    const rows = [], limits = [], add = (text, source) => rows.push({text, source});
    let status = "OK";
    const intent = !q.trim() ? "brief" :
      /phe duyet|duyet lenh|ra lenh|approve|execute|ap dung|apply/.test(q) ? "decision" :
      /nguon|mo hinh|ai that|llm|source|model|mock|rag/.test(q) ? "source" :
      /so tan|tru an|shelter|evacuat/.test(q) ? "shelter" :
      /duong|giao thong|road|traffic|street|hoi an/.test(q) ? "roads" :
      /bat dinh|xac suat|p95|p05|uncertaint|probab/.test(q) ? "uncertainty" :
      /ho chua|xa nuoc|luu luong|reservoir|release|\bmpc\b|phuong an/.test(q) ? "reservoirs" :
      /du bao|muc nuoc|tram|song|forecast|gauge|river/.test(q) ? "forecast" :
      /tinh hinh|tinh huong|rui ro|summary|situation|risk/.test(q) ? "brief" : "unknown";
    const header = L("AI MOCK · quy tắc cục bộ · dữ liệu mô phỏng", "AI MOCK · local rules · synthetic data");
    const baseLimit = L("Chưa dùng LLM hoặc mô hình AI đã huấn luyện. Số liệu chưa được kiểm định cho vận hành thực tế.",
      "No LLM or trained AI model is used here. These outputs have not been validated for real operations.");
    if (intent === "source") {
      add(L("Câu trả lời dùng bộ quy tắc và mẫu câu cố định, đọc mô hình thủy văn phân tích tại hydro.js. Không gọi API AI; không truy xuất bản tin NCHMF hay tài liệu RAG.",
        "Answers use fixed rules and templates reading the analytical hydro.js engine. No AI API, live NCHMF bulletin, or RAG retrieval is involved."), "js/ai/mock-assistant.js; js/hydro.js");
    } else if (!c.ready || c.health.level >= 4) {
      status = "ABSTAIN";
      add(L("Chưa đủ dữ liệu hợp lệ để tổng hợp hoặc dự báo. Kiểm tra trạng thái mô phỏng và mức suy giảm dữ liệu.",
        "Insufficient valid data to summarise or forecast. Check simulation readiness and data degradation."), "hydro.ready; ops.health");
    } else if (intent === "decision") {
      status = "ABSTAIN";
      add(L("Trợ lý mock không phê duyệt hoặc thực thi lệnh xả. Phương án phải đi qua luồng kiểm tra khả thi, định danh, lý do và phê duyệt của hệ thống.",
        "The mock assistant cannot approve or execute releases. Plans must pass the system's feasibility, identity, reason and approval workflow."), "ui.authorizeDecision");
    } else if (intent === "unknown") {
      status = "ABSTAIN";
      add(L("Mock chưa có quy tắc cho câu hỏi này. Có thể hỏi về tình huống, mực trạm, hồ chứa, đường, bất định hoặc nguồn dữ liệu.",
        "No mock rule matches this question. Ask about the situation, gauges, reservoirs, roads, uncertainty or data sources."), "mock.intentRules");
    } else if (intent === "shelter") {
      status = "LIMITED";
      add(L("Chưa thể chỉ định nơi trú an hoặc tuyến sơ tán từ câu hỏi tự do. Hãy chọn khu vực và xem phân bổ, sức chứa cùng khả năng tiếp cận trong lớp trú an của demo.",
        "A free-text question cannot determine a shelter or evacuation route. Select an area and inspect allocation, capacity and reachability in the demo's shelter layer."), "forecast.allocateShelters; selected area required");
    } else {
      if (intent === "brief") add(L(`Mưa lưu vực tại thời điểm đang xem: ${n(c.rain, 1)} mm/h.`,
        `Basin rainfall at the viewed time: ${n(c.rain, 1)} mm/h.`), "hydro.rain @ context.timeH");
      if (["brief", "forecast", "uncertainty", "roads"].includes(intent)) {
        let gauges = intent === "brief" ? c.gauges : [c.gauges.find(g => g.id === c.selectedGauge) || c.gauges[0]];
        // Named gauges override focus; Hội An questions refer to Câu Lâu without asserting street depths.
        const named = c.gauges.filter(g => q.includes(norm(g.name)));
        if (named.length) gauges = named;
        else if (/hoi an/.test(q)) gauges = [c.gauges.find(g => g.id === "cauLau") || gauges[0]];
        for (const g of gauges) {
          add(L(`${g.name}: ${n(g.stage)} m; ${g.alert ? "BĐ" + g.alert : "dưới BĐ1"}.`,
            `${g.name}: ${n(g.stage)} m; ${g.alert ? "AL" + g.alert : "below AL1"}.`), `hydro.ensemble(${g.id}, selection).med @ context.timeH`);
          if (c.health.level >= 2) { status = "LIMITED"; continue; }
          if (c.horizon > 0) {
            add(L(`Trong ${n(c.horizon, 1)} giờ mô phỏng tiếp theo, đỉnh đường trung vị ${n(g.peak)} m tại T${g.peakT >= 0 ? "+" : ""}${n(g.peakT, 2)} h; P05–P95 tại cùng thời điểm: ${n(g.q05)}–${n(g.q95)} m.`,
              `Over the next ${n(c.horizon, 1)} simulation hours, the median curve peaks at ${n(g.peak)} m at T${g.peakT >= 0 ? "+" : ""}${n(g.peakT, 2)} h; P05–P95 at that same time: ${n(g.q05)}–${n(g.q95)} m.`), `hydro.ensemble(${g.id}, selection).med/q05/q95; bounded interval`);
          } else { status = "LIMITED"; limits.push(L("Đã hết miền thời gian mô phỏng; không có dự báo tiếp theo.", "The simulation time domain has ended; no further forecast is available.")); }
          if (g.clipped) { status = "LIMITED"; limits.push(L(`${g.name}: đỉnh chạm giới hạn mô hình; không thể suy ra đỉnh lũ thực.`, `${g.name}: peak hits the model limit; the real flood peak cannot be inferred.`)); }
        }
      }
      if (["brief", "reservoirs"].includes(intent)) {
        for (const r of c.reservoirs) add(L(`${r.name} (${r.policy}): mực hồ ${n(r.level)} m; vào ${n(r.inflow, 0)}, ra ${n(r.outflow, 0)} m³/s${r.capacityExceeded ? "; dung tích mô phỏng vượt sức chứa" : ""}.`,
          `${r.name} (${r.policy}): level ${n(r.level)} m; inflow ${n(r.inflow, 0)}, outflow ${n(r.outflow, 0)} m³/s${r.capacityExceeded ? "; simulated storage exceeds capacity" : ""}.`), `hydro.res.${r.id}.${r.policy}.Z/I/O/S @ context.timeH`);
        if (c.reservoirs.some(r => r.capacityExceeded)) status = "LIMITED";
      }
      if (["brief", "roads"].includes(intent)) {
        if (c.roads && [c.roads.openPct, c.roads.closed].every(finite)) add(L(`Mạng đường của trạng thái vận hành ${c.operational}: ${n(c.roads.openPct, 0)}% mở, ${c.roads.closed} đoạn đóng.`,
          `Road network of the operational ${c.operational} state: ${n(c.roads.openPct, 0)}% open, ${c.roads.closed} closed links.`), "traffic.stats; rendered operational world");
        else { status = "LIMITED"; limits.push(L("Mạng đường chưa sẵn sàng.", "The road network is not ready.")); }
        limits.push(L("Không đủ thông tin để xác định đường nhà bạn, độ sâu ngập hay tuyến đi an toàn; cần vị trí và kiểm tra tuyến cụ thể. Mực trạm không phải độ sâu ngập đường.",
          "A home street, flood depth or safe route needs a location and a specific route check. Gauge stage is not street flood depth."));
        if (c.preview) limits.push(L("Số liệu đường thuộc trạng thái vận hành, chưa tính lại cho phương án xem thử.", "Road data belongs to the operational state and has not been recalculated for this preview."));
      }
      if (["brief", "forecast", "uncertainty", "roads"].includes(intent)) limits.push(L(
        "P05–P95 là dải giả định tại một thời điểm, chưa hiệu chuẩn; không phải xác suất ngập đường hay dải của đỉnh lũ cả khoảng. Bất định tăng theo T từ mốc T=0; tại T≤0, dải bằng đường mô phỏng, không phải quan trắc thật.",
        "P05–P95 is an uncalibrated assumed band at one time, not street-flood probability or an event-wide peak interval. Spread grows with T from T=0; at T≤0 the band equals the synthetic curve, not real observations."));
      if (c.horizon < 12 && c.horizon > 0) limits.push(L("Chân trời đã rút ngắn theo thời gian còn lại của mô phỏng.", "The horizon is shortened to the remaining simulation time."));
      if (/\b(24|48|72)\s*(h|gio|hour)/.test(q)) limits.push(L("Mock chỉ tóm tắt tối đa 12 giờ tiếp theo; không trả lời đầy đủ chân trời dài hơn được hỏi.", "This mock summarises at most the next 12 hours, not the full longer horizon requested."));
      if (c.health.level > 0) { status = "LIMITED"; limits.push(L(`Dữ liệu đang suy giảm L${c.health.level}; nguồn cũ nhất ${c.health.oldest} phút. Từ L2, mock ngừng đưa triển vọng tương lai; các số hiện tại chỉ mô tả trạng thái lưu.`,
        `Data is degraded at L${c.health.level}; oldest feed ${c.health.oldest} minutes. At L2 and above the mock withholds future outlooks; current values describe cached state only.`)); }
    }
    return freeze({provider: "mock", status, intent, question: String(question).slice(0, 500), header,
      context: c, rows, limitations: [...new Set([baseLimit, ...limits])]});
  };
  AI.html = function (result) {
    const c = result.context, vi = FT.state.lang === "vi";
    const selection = c.reservoirs.map(r => `${r.name}: ${r.policy}`).join(" · ");
    const status = result.status === "ABSTAIN" ? (vi ? "Chưa đủ cơ sở trả lời" : "Answer withheld") :
      result.status === "LIMITED" ? (vi ? "Phạm vi hạn chế" : "Limited scope") : (vi ? "Tóm tắt mô phỏng" : "Simulation summary");
    return `<p class="mockBadge">${esc(result.header)}</p><p class="mockContext">${esc(FT.i18n.t("scenario." + c.scenario))} · T${c.timeH >= 0 ? "+" : ""}${n(c.timeH, 2)} h · L${c.health.level}<br>${c.preview ? (vi ? "Xem thử" : "Preview") : (vi ? "Vận hành mô phỏng" : "Simulated operation")} · ${esc(selection)}</p>` +
      `<details class="mockLimits"><summary>${vi ? "Phạm vi & giới hạn" : "Scope & limitations"} · ${esc(status)}</summary>${result.limitations.map(l => `<p>${esc(l)}</p>`).join("")}</details>` +
      (result.question ? `<p class="mockQuestion">${esc(result.question)}</p>` : "") +
      result.rows.map(r => `<p>${esc(r.text)}</p>`).join("") +
      `<details><summary>${vi ? "Nguồn tính toán nội bộ" : "Internal calculation sources"}</summary>${result.rows.map((r,i) => `<small class="mockEvidence">${i + 1}. ${esc(r.source)}</small>`).join("")}</details>`;
  };
  AI.run = function (question = "") {
    last = AI.answer(question); AI.last = last;
    document.getElementById("llmBrief").innerHTML = AI.html(last);
    statusKey = ""; AI.tick(); return last;
  };
  AI.tick = function () {
    const node = document.getElementById("mockStatus"); if (!node) return;
    const stale = !!last && last.context.signature !== signature();
    const key = `${FT.state.lang}|${!!last}|${stale}`;
    if (key === statusKey) return; statusKey = key;
    node.classList.toggle("stale", stale);
    const vi = FT.state.lang === "vi";
    node.textContent = !last ? (vi ? "Chọn tạo bản tin hoặc đặt câu hỏi." : "Generate a brief or ask a question.") : stale ?
      (vi ? "Bối cảnh đã thay đổi — tạo lại bản tin hoặc gửi lại câu hỏi để cập nhật." : "Context changed — regenerate the brief or resubmit the question to update.") :
      (vi ? "Kết quả khớp bối cảnh hiện tại." : "Result matches the current context.");
  };
  AI.init = function () {
    document.getElementById("mockQuestionForm").addEventListener("submit", (e) => {
      e.preventDefault(); const input = document.getElementById("mockQuestion");
      if (input.value.trim()) AI.run(input.value.trim());
    });
    document.querySelectorAll("[data-mock-prompt]").forEach(b => b.addEventListener("click", () => {
      const queries = FT.state.lang === "vi" ? {forecast: "Dự báo mực nước trạm", reservoirs: "Hồ chứa và lưu lượng xả", uncertainty: "Bất định P05 P95", source: "Nguồn dữ liệu và mô hình AI"} :
        {forecast: "Gauge forecast", reservoirs: "Reservoir releases", uncertainty: "P05 P95 uncertainty", source: "AI model and data sources"};
      document.getElementById("mockQuestion").value = queries[b.dataset.mockPrompt]; AI.run(queries[b.dataset.mockPrompt]);
    }));
    FT.bus.on("lang", () => {
      if (last) { last = AI.answer(last.question, last.context); AI.last = last; document.getElementById("llmBrief").innerHTML = AI.html(last); }
      statusKey = ""; AI.tick();
    });
    AI.tick();
  };
})();
