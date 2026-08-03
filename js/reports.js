/* FloodTwin — operational reports (docs S-11 · FR-33)
   Four artefacts, each answering a question somebody will actually ask:

     situation   "what is happening and what do you want me to decide?"   → the committee
     decision    "what exactly was proposed, and on what basis?"          → the signature
     operation   "did the dam cause this?"                                → the public, in 72 h
     event       "what was known, decided and sent, and when?"            → the inquiry

   The operation record is the one that matters most politically: the argument about whether
   releases worsened a flood is settled in public within days, with or without evidence
   (docs/00-foundations/10-failure-library.md §2). Being able to publish inflow, outflow,
   absorbed volume and the counterfactual within the hour is the whole point.

   Every report carries the mode watermark, provenance and model versions — an export that
   loses its "synthetic" marking is a P0 defect (anti-regression rule 11). */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, D = FT.data;
  const R = (FT.reports = {});
  const vi = () => FT.state.lang === "vi";
  const L = (v, e) => (vi() ? v : e);
  const hm = (t) => U.clock(t).hm;
  const dm = (t) => U.clock(t).dm;
  const esc = (s) => String(s == null ? "" : s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

  function header(title, sub) {
    const OPS = FT.ops;
    const hl = OPS ? OPS.health() : null;
    return `<h1>${esc(title)}</h1>
      <div class="prMeta">
        ${L("Lập lúc", "Issued")}: ${hm(FT.state.timeH)} ${dm(FT.state.timeH)} (${U.rel(FT.state.timeH)}) ·
        ${L("Kịch bản", "Scenario")}: ${FT.i18n.t(D.SCENARIOS[FT.state.scenario].key)} ·
        ${L("Chính sách", "Policy")}: ${FT.state.policy === "mpc" ? "FloodTwin MPC" : "Rule curve"}
        ${hl ? ` · ${L("Dữ liệu", "Data")}: L${hl.level}` : ""}
        ${OPS && OPS.audit.actor.name ? ` · ${L("Trực ban", "Duty")}: ${esc(OPS.audit.actor.name)} (${esc(OPS.audit.actor.role)})` : ""}
      </div>
      <div class="prBanner">${OPS ? esc(OPS.modeLabel()) : "SYNTHETIC"} - ${L(
        "số liệu tổng hợp minh hoạ phương pháp, KHÔNG dùng cho vận hành hoặc công bố",
        "synthetic data illustrating the method; NOT for operations or publication")}</div>
      ${sub ? `<p class="prSub">${sub}</p>` : ""}`;
  }
  function footer() {
    const v = FT.ops ? FT.ops.versions : {};
    return `<div class="prFoot">
      ${L("Phiên bản mô hình", "Model versions")}: ${esc(v.engine)} · ${esc(v.thresholds)} · ${esc(v.rulebook)} ·
      ${L("Nền bản đồ", "Basemap")}: Esri / AWS Terrain / © OpenStreetMap ·
      FloodTwin ${L("bản trình diễn", "demonstrator")}</div>`;
  }

  /* ---------- 1. situation report ---------- */
  R.situation = function () {
    const snap = FT.hydro.at(FT.state.timeH);
    const ts = FT.traffic.stats();
    const states = FT.domain ? FT.domain.snapshotStates(FT.state.timeH) : null;
    const zs = (FT.zones.sorted || FT.zones.list).slice(0, 6);
    const sum = FT.forecast ? FT.forecast.summary(FT.state.timeH) : null;
    const pex = D.GAUGES.map((g) => ({
      g, p: FT.forecast ? FT.forecast.pExceedWindow(g.id, g.bd[2], FT.state.timeH, Math.min(FT.hydro.T1, FT.state.timeH + 12)) : 0,
    }));
    return header(L("Báo cáo tình huống", "Situation report")) + `
      <h2>${L("Trạm thủy văn", "Gauges")}</h2>
      <table><tr><th></th><th>${L("Mực nước", "Stage")}</th><th>BĐ1/2/3</th><th>${L("Trạng thái", "State")}</th><th>P(&gt;BĐ3, 12h)</th></tr>
      ${pex.map(({ g, p }) => {
        const gs = snap.gauges[g.id];
        const st = states ? states.gauges[g.id] : "";
        return `<tr><td>${g.name} (${g.river})</td><td>${U.fmt(gs.stage, 2)} m</td><td>${g.bd.join(" / ")}</td>
          <td>${st}</td><td>${Math.round(p * 100)}%</td></tr>`;
      }).join("")}</table>

      <h2>${L("Hồ chứa", "Reservoirs")}</h2>
      <table><tr><th></th><th>${L("Trạng thái vận hành", "Operating state")}</th><th>Z</th><th>${L("An toàn", "Freeboard")}</th><th>${L("Đầy trần sau", "To ceiling")}</th><th>${L("Vào/Xả", "In/Out")}</th></tr>
      ${D.RESERVOIRS.map((r) => {
        const rs = snap.reservoirs[r.id];
        const m = FT.ops ? FT.ops.margins(snap, r) : null;
        const st = states ? states.reservoirs[r.id] : "";
        const stD = FT.domain && FT.domain.RES_STATES[st];
        return `<tr><td>${r.name}</td><td>${stD ? (vi() ? stD.vi : stD.en) : ""}</td>
          <td>${U.fmt(rs.Z, 2)} / ${r.ceil} m</td>
          <td>${m && m.freeboard != null ? U.fmt(m.freeboard, 1) + " m" : "-"}</td>
          <td>${m && m.tToCeil != null ? FT.ops.fmtHours(m.tToCeil) : "-"}</td>
          <td>${U.fmtInt(rs.I)} / ${U.fmtInt(rs.O)} m³/s</td></tr>`;
      }).join("")}</table>

      <h2>${L("Khu vực và sơ tán", "Zones and evacuation")}</h2>
      <table><tr><th></th><th>${L("Ngập TB/max", "Mean/max depth")}</th><th>${L("Phơi nhiễm", "Exposed")}</th><th>${L("Tiếp cận", "Access")}</th><th>${L("Điểm trú", "Shelter")}</th></tr>
      ${zs.map((z) => `<tr><td>${z.def.name}</td>
        <td>${U.fmt(z.meanD, 1)} / ${U.fmt(z.maxD, 1)} m</td>
        <td>${U.fmtInt(z.exposed)}</td>
        <td>${z.isolated ? L("CÔ LẬP", "ISOLATED") : z.isolatesAt != null ? `${L("cô lập", "isolates")} ~${hm(z.isolatesAt)}` : L("thông", "open")}</td>
        <td>${z.shelter ? esc(z.shelter.name) : L("- trú tại chỗ", "- shelter in place")}</td></tr>`).join("")}</table>

      <h2>${L("Giao thông", "Transport")}</h2>
      <p>${L("Mạng thông", "Network open")}: ${ts.openPct}% · ${L("đoạn đóng", "closed")}: ${ts.closed}
        ${sum && sum.upcoming.length ? ` · ${L("sắp đóng", "closing soon")}: ${sum.upcoming.slice(0, 4).map((c) => `${esc(c.name)} ${hm(c.at)}`).join(", ")}` : ""}</p>
      ${footer()}`;
  };

  /* ---------- 2. operation record — the answer to "did the dam cause this?" ---------- */
  R.operation = function () {
    const H = FT.hydro, t = FT.state.timeH, pk = H._activeKey();
    const g = D.GAUGES[0];
    /* volume absorbed = ∫(inflow − outflow)dt over the rising limb, in Mm³ */
    const rows = D.RESERVOIRS.map((r) => {
      const S = H.res[r.id][pk];
      let absorbed = 0, peakI = 0, peakO = 0, tPeakI = 0;
      for (let i = 0; i < H.NT; i++) {
        const tt = H.T0 + i * H.DT;
        if (tt > t) break;
        absorbed += Math.max(0, S.I[i] - S.O[i]) * 3600 * H.DT / 1e6;
        if (S.I[i] > peakI) { peakI = S.I[i]; tPeakI = tt; }
        if (S.O[i] > peakO) peakO = S.O[i];
      }
      return { r, absorbed, peakI, peakO, tPeakI, cut: peakI - peakO };
    });
    const totalAbsorbed = rows.reduce((s, x) => s + x.absorbed, 0);
    /* pluvial vs fluvial: how much of the downstream response is local rain, not releases */
    const k = FT.ops ? FT.ops.kappa(g, t) : null;
    return header(L("Hồ sơ vận hành công khai", "Public operation record"),
      L("Bản ghi này trả lời câu hỏi “hồ có gây ra lũ không?” bằng số liệu vào-ra và phần lũ đã được hồ giữ lại.",
        "This record answers “did the reservoirs cause this flood?” with inflow-outflow figures and the volume they held back.")) + `
      <h2>${L("Cân bằng vào - ra từng hồ (T−24h → hiện tại)", "Per-reservoir inflow-outflow balance (T−24 h → now)")}</h2>
      <table><tr><th></th><th>${L("Đỉnh lượng về", "Peak inflow")}</th><th>${L("Đỉnh lượng xả", "Peak outflow")}</th><th>${L("Chênh đỉnh", "Peak reduction")}</th><th>${L("Đã giữ lại", "Volume held back")}</th></tr>
      ${rows.map((x) => `<tr><td>${x.r.name}</td>
        <td>${U.fmtInt(x.peakI)} m³/s (${hm(x.tPeakI)})</td>
        <td>${U.fmtInt(x.peakO)} m³/s</td>
        <td>${x.cut > 0 ? "−" + U.fmtInt(x.cut) + " m³/s" : "0"}</td>
        <td>${U.fmt(x.absorbed, 0)} Mm³</td></tr>`).join("")}
      <tr><td><b>${L("Tổng", "Total")}</b></td><td></td><td></td><td></td><td><b>${U.fmt(totalAbsorbed, 0)} Mm³</b></td></tr></table>

      <h2>${L("Phần lũ hồ điều tiết được", "How much of this flood the reservoirs control")}</h2>
      <p>${L("Hệ số điều tiết κ tại", "Controllability κ at")} ${g.name}: <b>${k != null ? U.fmt(k, 2) : "-"}</b> -
        ${k != null && k < 0.3
          ? L("phần lớn lượng nước gây lũ sinh ra ở khu giữa và đồng bằng, <b>không đi qua hồ nào</b>. Vận hành cửa van không thể thay đổi đáng kể trận lũ này.",
              "most of the flood volume is generated in the intermediate and delta catchments and <b>passes through no reservoir</b>. Gate operation cannot materially change this flood.")
          : k != null && k < 0.6
            ? L("một phần đáng kể lượng nước không qua hồ; vận hành hồ chỉ thay đổi được một phần đỉnh lũ.",
                "a substantial share bypasses the reservoirs; gate operation can change only part of the peak.")
            : L("phần lớn lượng nước đi qua hồ - vận hành hồ ảnh hưởng lớn tới đỉnh lũ hạ du.",
                "most of the volume passes through the reservoirs - gate operation materially affects the downstream peak.")}</p>
      <p>${L("Diễn giải", "Interpretation")}: ${L(
        "phần lũ do mưa khu giữa/tại chỗ sinh ra không thể quy cho việc xả hồ. Hai nguồn này được tách trong bảng mưa theo tiểu lưu vực.",
        "the share generated by intermediate and local rainfall cannot be attributed to reservoir releases. The two sources are separated in the sub-catchment rainfall panel.")}</p>

      <h2>${L("Đối chứng: nếu không vận hành theo đề xuất", "Counterfactual: without the proposed operation")}</h2>
      ${(() => {
        const pkg = FT.ops && FT.ops._last;
        if (!pkg || !pkg.counterfactual) return `<p>${L("Chưa có đề xuất để đối chứng.", "No proposal to compare against.")}</p>`;
        return `<p>${pkg.gauge.name}: ${L("đỉnh theo phương án", "peak under the proposal")} <b>${U.fmt(pkg.outcome.peak, 2)} m</b>
          ${L("so với", "versus")} <b>${U.fmt(pkg.counterfactual.peak, 2)} m</b> ${L("nếu không hành động", "with no action")}
          (${L("chênh", "difference")} ${U.fmt(pkg.cut, 2)} m; ${L("giờ trên BĐ3", "hours above AL3")}
          ${U.fmt(pkg.outcome.hoursBD3, 1)} h ${L("so với", "vs")} ${U.fmt(pkg.counterfactual.hoursBD3, 1)} h).</p>`;
      })()}
      ${footer()}`;
  };

  /* ---------- 3. event report — auto-generated reconstruction (WF-12) ---------- */
  R.event = function () {
    const Dm = FT.domain, OPS = FT.ops;
    const evs = Dm && Dm.ready ? Dm.events : [];
    const audit = OPS ? OPS.audit.entries.slice(-40) : [];
    const notif = FT.notifyOps ? FT.notifyOps.sent : [];
    return header(L("Báo cáo sau lũ (tự động dựng lại)", "Post-event report (auto-reconstructed)"),
      L("Dựng tự động từ dòng sự kiện tất định và nhật ký kiểm toán - đây là phần việc mà sau trận lũ thường không ai còn sức để viết.",
        "Reconstructed automatically from the deterministic event stream and the audit trail - the work nobody has the energy to write after a flood.")) + `
      <h2>${L("Dòng sự kiện", "Event timeline")} (${evs.length})</h2>
      <table><tr><th>${L("Giờ", "Time")}</th><th>${L("Sự kiện", "Event")}</th><th>${L("Diễn giải", "Detail")}</th></tr>
      ${evs.slice(0, 60).map((e) => `<tr><td>${hm(e.tH)} ${dm(e.tH)}</td><td>${esc(e.title)}</td><td>${esc(e.detail)}</td></tr>`).join("")}</table>
      ${evs.length > 60 ? `<p><i>${L(`… và ${evs.length - 60} sự kiện nữa`, `… and ${evs.length - 60} further events`)}</i></p>` : ""}

      <h2>${L("Quyết định và thông báo (nhật ký kiểm toán)", "Decisions and notifications (audit trail)")}</h2>
      <table><tr><th>#</th><th>${L("Thời điểm", "Time")}</th><th>${L("Hành động", "Action")}</th><th>${L("Người thực hiện", "Actor")}</th><th>${L("Lý do ghi nhận", "Reason of record")}</th></tr>
      ${audit.map((a) => `<tr><td>${a.seq}</td><td>${esc(a.tsUtc.slice(11, 19))} · T${esc(a.simT)}h</td>
        <td>${esc(a.action)}</td><td>${esc(a.actor)}</td><td>${esc(a.reason || "-")}</td></tr>`).join("")}</table>

      <h2>${L("Thông báo hạ du", "Downstream notifications")}</h2>
      ${notif.length ? notif.map((n) => `<p><b>${esc(n.record.headlineShort)}</b> — ${n.recipients.filter((r) => r.acked).length}/${n.recipients.length} ${L("nhóm đã xác nhận", "groups acknowledged")}.
        ${L("Chưa xác nhận", "Unacknowledged")}: ${n.recipients.filter((r) => !r.acked).map((r) => esc(r.name)).join(", ") || "-"}</p>`).join("")
        : `<p>${L("Chưa phát thông báo nào trong phiên này.", "No notifications were dispatched in this session.")}</p>`}
      ${footer()}`;
  };

  /* ---------- render + print ---------- */
  R.build = function (kind) {
    const host = document.getElementById("printReport");
    host.classList.remove("recordDoc");
    host.innerHTML = (R[kind] || R.situation)();
    return host;
  };
  R.print = function (kind) { R.build(kind); window.print(); };
  R.preview = function (kind) {
    const html = (R[kind] || R.situation)();
    FT.ui.openModal(L("Xem trước báo cáo", "Report preview"),
      `<div class="reportPreview">${html}</div>
       <div style="margin-top:12px"><button id="rpPrint" class="btnPrimary" type="button">🖨 ${L("In / xuất PDF", "Print / export PDF")}</button></div>`);
    const b = document.getElementById("rpPrint");
    if (b) b.addEventListener("click", () => {
      R.print(kind);
      FT.ops && FT.ops.audit.log("report.export", { kind });
    });
    FT.ops && FT.ops.audit.log("report.preview", { kind });
  };
})();
