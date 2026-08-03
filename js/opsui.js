/* FloodTwin — ops UI layer (docs/99-appendix/demo-gap-analysis.md C-02…C-09)
   Renders the global chrome (mode · escalation · data health · κ · decision deadline),
   the decision package (constraints, counterfactual, alternatives, regret, confidence),
   reservoir safety margins, and the audit trail.

   Deliberately additive: it wraps FT.ui.tick instead of editing ui.js internals, so the
   existing render path and the anti-regression rules in DATA_AND_METHODS.md §3 are untouched. */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, D = FT.data, H = FT.hydro, OPS = FT.ops;
  const $ = (id) => document.getElementById(id);
  const vi = () => FT.state.lang === "vi";
  const L = (v, e) => (vi() ? v : e);

  let el = {}, safetyRefs = [], lastPkgKey = "", auditDrawn = 0, evacAcc = 0, lastTimelineAt = 0;

  /* ---------- escalation ladder (docs/02-stakeholders/02-decision-rights-raci.md §3) ---------- */
  function escalation(snap) {
    const g = D.GAUGES[0], gs = snap.gauges[g.id];
    let lvl = 0, why = L("bình thường", "normal");
    if (snap.rain > 8 || gs.alert >= 1) { lvl = 1; why = L("mưa/nước lên", "rain or rising stage"); }
    if (gs.alert >= 1 && gs.trend > 0.2) { lvl = 2; why = L(`${g.name} trên BĐ1 và đang lên`, `${g.name} above AL1 and rising`); }
    if (gs.alert >= 2) { lvl = 3; why = L(`${g.name} trên BĐ2`, `${g.name} above AL2`); }
    if (gs.alert >= 3) { lvl = 4; why = L(`${g.name} trên BĐ3`, `${g.name} above AL3`); }
    for (const r of D.RESERVOIRS) {
      const rs = snap.reservoirs[r.id];
      if (rs.Z > r.fsl) { lvl = Math.max(lvl, 4); why = L(`${r.name} trên MNDBT`, `${r.name} above FSL`); }
      if (r.zDesign != null && rs.Z > r.zDesign) { lvl = 5; why = L(`${r.name} trên mực nước lũ thiết kế`, `${r.name} above design flood level`); }
    }
    return { lvl, why };
  }

  /* ---------- ops bar ---------- */
  function updateOpsBar(snap) {
    const esc = escalation(snap);
    el.opsEscVal.textContent = `L${esc.lvl}`;
    el.opsEsc.className = `opsItem${esc.lvl >= 4 ? " lvl3" : esc.lvl >= 3 ? " lvl2" : esc.lvl >= 1 ? " lvl1" : ""}`;
    el.opsEsc.title = esc.why;

    const hl = OPS.health();
    el.opsHealthVal.textContent = `L${hl.level} · ${hl.fresh}/${hl.total}${hl.oldest > 15 ? ` · ${Math.round(hl.oldest)}′` : ""}`;
    el.opsHealth.className = `opsItem opsHealthBtn${hl.level ? ` lvl${Math.min(3, hl.level)}` : ""}`;
    el.opsHealth.title = hl.reason;

    const g = D.GAUGES[0];
    const k = OPS.kappa(g, FT.state.timeH);
    el.opsKappaVal.textContent = U.fmt(k, 2);
    el.opsKappa.title = k > 0.6
      ? L("Vận hành hồ tác động lớn tới đỉnh lũ hạ du.", "Reservoir operation materially changes the downstream peak.")
      : k >= 0.3
        ? L("Tác động một phần - cần làm song song cảnh báo và sơ tán.", "Partial control - run warning and evacuation in parallel.")
        : L("Lũ CHỦ YẾU do mưa khu giữa/tại chỗ - vận hành hồ không đổi được nhiều. Ưu tiên cảnh báo và sơ tán.",
            "This flood is driven by lateral/local rainfall - reservoir operation cannot change it much. Prioritise warning and evacuation.");
    el.opsKappa.classList.toggle("lvl2", k < 0.3);

    /* P(exceed BĐ3) over the next 12 h — the primary decision quantity (docs FR-28) */
    if (el.opsPexVal && FT.forecast) {
      const t = FT.state.timeH;
      let worst = 0, worstG = null;
      for (const gg of D.GAUGES) {
        const p = FT.forecast.pExceedWindow(gg.id, gg.bd[2], t, Math.min(FT.hydro.T1, t + 12));
        if (p > worst) { worst = p; worstG = gg; }
      }
      el.opsPexVal.textContent = `${Math.round(worst * 100)}%`;
      el.opsPex.className = `opsItem opsPex${worst >= 0.5 ? " lvl3" : worst >= 0.3 ? " lvl2" : worst >= 0.1 ? " lvl1" : ""}`;
      el.opsPex.title = worstG
        ? L(`Trạm cao nhất: ${worstG.name} (BĐ3 ${worstG.bd[2]} m). Ngưỡng hành động theo cây quyết định: 30%.`,
            `Highest gauge: ${worstG.name} (AL3 ${worstG.bd[2]} m). Decision-tree action threshold: 30%.`)
        : "";
    }
  }

  /* ---------- evacuation, routes and shelters (FR-22/23/24) ---------- */
  function updateEvac() {
    if (!el.evacList || !FT.forecast || !FT.world.ready) return;
    const t = FT.state.timeH;
    const sum = FT.forecast.summary(t);
    if (!sum) return;
    const hm = (tt) => U.clock(tt).hm;

    const netN = $("evacNetN");
    if (netN && netN.textContent !== String(FT.world.roads.edges.length)) netN.textContent = FT.world.roads.edges.length;
    el.evacSummary.textContent = L(`${sum.sheltersValid}/${sum.sheltersTotal} điểm trú hợp lệ`,
                                   `${sum.sheltersValid}/${sum.sheltersTotal} shelters valid`);
    el.evacSummary.style.color = sum.sheltersValid < sum.sheltersTotal * 0.6 ? "var(--al-2)" : "";

    /* Basin shelter demand vs capacity — the number that must not be hidden. Independent
       per-zone assignment used to imply everyone had a shelter; this rolls up the honest
       unsheltered count from the capacity-aware allocation (js/forecast.allocateShelters). */
    if (el.shelterCapacity) {
      const alloc = FT.forecast.allocateShelters(t);
      if (alloc && alloc.totalExposed > 0) {
        const short = alloc.totalUnsheltered;
        const cls = short > 0 ? "bad" : "ok";
        el.shelterCapacity.innerHTML =
          `<span class="scLabel">${L("Nhu cầu trú ẩn", "Shelter demand")}</span>`
          + `<b>${U.fmtInt(alloc.totalExposed)}</b> ${L("người phơi nhiễm", "exposed")} · `
          + `<b>${U.fmtInt(alloc.reachableCapacity)}</b> ${L("chỗ tới được", "reachable places")} · `
          + `<b class="${cls}">${short > 0 ? L("thiếu ", "short ") + U.fmtInt(short) : L("đủ chỗ", "all covered")}</b>`
          + (short > 0 ? ` <span class="scNote">${L("- cần trú tại chỗ trên cao / điều thêm điểm trú", "- vertical refuge / open more shelters")}</span>` : "");
        el.shelterCapacity.classList.toggle("scShort", short > 0);
      } else {
        el.shelterCapacity.innerHTML = "";
        el.shelterCapacity.classList.remove("scShort");
      }
    }

    /* zones ranked by urgency: isolation first, then how soon they lose access */
    /* single-access communities are always listed, even when calm — they are the ones that
       go first, and pre-positioning for them is a decision made before the event */
    const single = FT.zones.list.filter((z) => FT.forecast.isSingleAccess(z.def.node));
    const ranked = (FT.zones.sorted || FT.zones.list).filter((z) => z.status >= 2 || z.isolatesAt != null);
    /* Take the top-ranked zones FIRST, then guarantee every single-access community is
       present. Appending them before the slice let the cut drop exactly the communities
       that isolate first — the E2E suite caught this. */
    const zs = ranked.slice(0, 7);
    for (const z of single) if (!zs.includes(z)) zs.push(z);
    const rows = zs.map((z) => {
      const only = FT.forecast.isSingleAccess(z.def.node)
        ? `<span class="onlyRoute" title="${L("Chỉ có một tuyến đường duy nhất - sẽ cô lập ngay khi tuyến này ngập", "Single access route - isolates as soon as this road floods")}">${L("1 tuyến", "1 route")}</span>` : "";
      const iso = z.isolated
        ? `<b class="bad">${L("ĐÃ CÔ LẬP", "ISOLATED")}</b>`
        : z.isolatesAt != null
          ? `<b class="warn">${L("cô lập ~", "isolates ~")}${hm(z.isolatesAt)}</b>`
          : `<b class="ok">${L("còn tuyến", "connected")}</b>`;
      /* An isolated zone cannot be told to travel anywhere — the useful instruction is
         vertical refuge plus water transport, not a shelter it can no longer reach. */
      const sh = z.isolated
        ? `<span class="bad">${L("Trú tại chỗ trên tầng cao · tiếp cận bằng xuồng/trực thăng", "Shelter in place on upper floors · access by boat/air")}</span>`
        : z.shelter
          ? `${z.shelter.name} · ${z.shelterRoute.timeH * 60 < 2 ? L("tại chỗ", "on site") : `${Math.round(z.shelterRoute.timeH * 60)}′`}${z.shelterRoute.lastDeparture != null && z.shelterRoute.timeH * 60 >= 2 ? ` · ${L("đi trước", "depart by")} ${hm(z.shelterRoute.lastDeparture)}` : ""}`
          : `<span class="bad">${L("không có điểm trú hợp lệ tới được - trú tại chỗ trên cao", "no reachable valid shelter - shelter in place on upper floors")}</span>`;
      return `<div class="evacRow"><span class="evacName">${z.def.name}${only}</span>${iso}
        <em>${sh}</em></div>`;
    }).join("");
    el.evacList.innerHTML = rows || `<div class="evacRow"><span class="evacName">${L("Chưa có khu vực cần sơ tán", "No zone requires evacuation")}</span></div>`;

    /* upcoming road closures — the deadline behind every movement decision */
    const closures = sum.upcoming.map((c) =>
      `<div class="evacClose${c.lifeline ? " lifeline" : ""}"><span>${c.name}</span><b>${hm(c.at)}</b><em>${OPS.fmtHours(c.inH)}</em></div>`).join("");
    const invalid = sum.shelters.filter((x) => !x.st.valid);
    const invalidRows = invalid.map((x) => {
      const why = x.st.reason === "submerged" ? L("NGẬP QUÁ TẦNG TRÚ", "REFUGE SUBMERGED")
        : L("không dùng được", "unusable");
      return `<div class="evacClose bad"><span>${x.sh.name}</span><b>${why}</b><em>${L("loại", "excluded")}</em></div>`;
    }).join("");
    /* usable but degraded — the operator needs to know capacity has dropped */
    const degraded = sum.shelters.filter((x) => x.st.valid && x.st.warn);
    const degradedRows = degraded.map((x) => {
      const why = x.st.warn === "will-submerge"
        ? `${L("ngập quá tầng trú ~", "refuge submerged ~")}${hm(x.st.refugeLostAt)}`
        : x.st.warn === "no-resupply"
        ? L("mất tuyến tiếp tế từ EOC", "resupply route from EOC cut")
        : x.st.warn === "ground-floor-lost"
          ? L(`mất tầng trệt · còn ~${U.fmtInt(x.st.capacity)} chỗ`, `ground floor lost · ~${U.fmtInt(x.st.capacity)} places`)
          : L(`tầng trệt ngập ~${hm(x.st.groundLostAt)}`, `ground floor floods ~${hm(x.st.groundLostAt)}`);
      const act = x.st.warn === "will-submerge" ? L("bố trí điểm thay thế", "arrange an alternative")
        : x.st.warn === "no-resupply" ? L("tiếp tế bằng xuồng", "resupply by boat")
        : L("dùng tầng cao", "use upper floor");
      return `<div class="evacClose"><span>${x.sh.name}</span><b>${why}</b><em>${act}</em></div>`;
    }).join("");
    el.shelterList.innerHTML =
      (closures ? `<h6>${L("Tuyến sắp đóng (12h)", "Routes closing (12h)")}</h6>${closures}` : "") +
      (degradedRows ? `<h6>${L("Điểm trú giảm năng lực", "Shelters degraded")}</h6>${degradedRows}` : "") +
      (invalidRows ? `<h6>${L("Điểm trú bị loại", "Shelters excluded")}</h6>${invalidRows}` : "") ||
      `<h6>${L("Không có tuyến nào dự kiến đóng trong 12h", "No route closures expected in 12h")}</h6>`;
  }

  function updateDeadline(pkg) {
    const b = el.opsDeadlineVal, wrap = el.opsDeadline;
    if (!pkg || pkg.kind !== "PROPOSAL") { b.textContent = "-"; wrap.className = "opsItem opsDeadline"; wrap.title = ""; return; }
    const inH = pkg.deadlineIn;
    b.textContent = inH >= 0 ? OPS.fmtHours(inH) : L("ĐÃ QUÁ HẠN", "EXPIRED");
    wrap.className = `opsItem opsDeadline${inH < 0 ? " expired" : inH < 2 ? " urgent" : ""}`;
    wrap.title = inH >= 0
      ? L(`Phải quyết trước T${U.fmt(pkg.deadline, 1)}h = thời điểm xả − thông báo ${OPS.config.notificationLeadH}h − phê duyệt ${OPS.config.approvalLeadH}h`,
          `Decide before T${U.fmt(pkg.deadline, 1)}h = release time − notification ${OPS.config.notificationLeadH}h − approval ${OPS.config.approvalLeadH}h`)
      : L("Quá hạn: không còn đủ thời gian thông báo hạ du trước khi tăng xả theo phương án này.",
          "Expired: there is no longer enough notification lead time to increase release as proposed.");
  }

  /* ---------- reservoir safety margins (FR-17, FR-42) ---------- */
  function ensureSafetyRows() {
    const items = document.querySelectorAll("#resList .resItem");
    if (!items.length || safetyRefs.length === items.length) return;
    safetyRefs = [];
    items.forEach((node, i) => {
      let row = node.querySelector(".resSafety");
      if (!row) { row = document.createElement("div"); row.className = "resSafety"; node.appendChild(row); }
      safetyRefs.push({ r: D.RESERVOIRS[i], row });
    });
  }
  function updateSafety(snap) {
    ensureSafetyRows();
    for (const s of safetyRefs) {
      const m = OPS.margins(snap, s.r);
      const fbCls = m.freeboard != null && m.freeboard < 2 ? "bad" : m.freeboard != null && m.freeboard < 4 ? "warn" : "";
      const ttCls = m.tToCeil != null && m.tToCeil < 6 ? "bad" : m.tToCeil != null && m.tToCeil < 12 ? "warn" : "";
      const stKey = FT.domain ? FT.domain.reservoirState(s.r, FT.state.timeH) : null;
      const stDef = stKey && FT.domain.RES_STATES[stKey];
      s.row.innerHTML =
        (stDef ? `<span class="resState sev${stDef.sev}">${vi() ? stDef.vi : stDef.en}</span>` : "") +
        `<span class="${fbCls}">${L("an toàn", "freeboard")} <b>${m.freeboard != null ? U.fmt(m.freeboard, 1) + " m" : "-"}</b></span>` +
        `<span>dZ/dt <b>${(m.dZdt >= 0 ? "+" : "−") + U.fmt(Math.abs(m.dZdt), 2)} m/h</b></span>` +
        `<span>${L("còn trống", "free")} <b>${U.fmt(m.freeMm3, 0)} Mm³</b></span>` +
        `<span class="${ttCls}">${L("đầy sau", "time to ceiling")} <b>${m.tToCeil != null ? OPS.fmtHours(m.tToCeil) : "-"}</b></span>`;
      s.row.title = m.exhaustT != null
        ? L(`Từ khoảng T${U.fmt(m.exhaustT, 1)}h hồ không còn cắt được lũ - lượng xả ≈ lượng về.`,
            `From about T${U.fmt(m.exhaustT, 1)}h this reservoir can no longer reduce the flood - outflow ≈ inflow.`)
        : "";
    }
  }

  /* ---------- decision package (S-05) ---------- */
  function renderPackage(pkg) {
    const box = el.dpBox;
    if (!box) return;
    if (!pkg || pkg.kind === "NONE") {
      box.innerHTML = `<div class="dpSec"><span class="dpKind ok">${L("KHÔNG CẦN HÀNH ĐỘNG", "NO ACTION")}</span>
        <p class="dpWhy">${pkg ? pkg.reason : ""}</p></div>`;
      return;
    }
    if (pkg.kind === "DEGRADED") {
      box.innerHTML = `<div class="dpSec"><span class="dpKind bad">${L("BỘ TỐI ƯU VÔ HIỆU", "OPTIMISER DISABLED")}</span>
        <p class="dpWhy">${pkg.reason}</p></div>`;
      return;
    }
    if (pkg.kind === "SATURATED") {
      box.innerHTML = `<div class="dpSec"><span class="dpKind bad">${L("KHÔNG SO SÁNH ĐƯỢC", "NOT COMPARABLE")}</span>
        <p class="dpWhy">${L(
          `Cả hai chính sách đều đẩy ${pkg.gauge.name} tới trần biểu diễn của mô hình (${U.fmt(pkg.gauge.max, 1)} m). Chênh lệch đỉnh KHÔNG có ý nghĩa — không kết luận “không cần hành động”.`,
          `Both policies drive ${pkg.gauge.name} to the model's representable maximum (${U.fmt(pkg.gauge.max, 1)} m). The peak difference is meaningless - this is NOT a "no action needed" result.`)}</p>
        <p class="dpWhy">${L("Đây là giới hạn của mô hình giải tích trong bản demo, không phải kết luận thủy văn. Xem docs/06-critique/02-open-risk-register.md R-01.",
                             "This is a limitation of the demo's analytic model, not a hydrological conclusion. See docs/06-critique/02-open-risk-register.md R-01.")}</p></div>`;
      return;
    }
    if (pkg.kind === "REFUSAL") {
      box.innerHTML = `<div class="dpSec"><span class="dpKind bad">${L("TỪ CHỐI ĐỀ XUẤT", "NO ADVICE")}</span>
        <p class="dpWhy">${pkg.reason}</p>
        <p class="dpWhy">${L("Xem: phương án ứng phó khẩn cấp · danh bạ Ban Chỉ huy PCTT&TKCN · bản đồ ngập tĩnh.",
                            "See: emergency action plan · PCTT&TKCN contact tree · static inundation maps.")}</p></div>`;
      return;
    }

    const g = pkg.gauge, a = pkg.action;
    const kindCls = pkg.kind === "NULL" ? "ok" : pkg.feasible ? "ok" : "bad";
    const kindTxt = pkg.kind === "NULL"
      ? L("THEO BIỂU ĐỒ ĐIỀU PHỐI", "FOLLOW THE RULE CURVE")
      : pkg.feasible ? L("KHẢ THI", "FEASIBLE") : L("KHÔNG KHẢ THI", "INFEASIBLE");

    const cons = pkg.constraints.map((c) => {
      const dp = c.unit === "m³/s" || c.unit === "m³/s/h" ? 0 : 2;
      const m = Math.abs(c.margin) < (dp ? 0.005 : 0.5) ? 0 : c.margin;   // never render "−0"
      const sign = m > 0 ? "+" : m < 0 ? "−" : "±";
      const mark = c.status === "PASS" ? "✓" : c.status === "MARGINAL" ? "~" : "✗";
      return `<div class="dpC ${c.status}${c.binding ? " binding" : ""}"><span>${c.id} ${c.label}</span><b>${mark} ${sign}${U.fmt(Math.abs(m), dp)} ${c.unit}</b></div>`;
    }).join("");

    const alts = pkg.alternatives.map((x) =>
      `<div class="dpAlt"><span>${x.label}</span><b>${U.fmt(x.peak, 2)} m</b></div>`
    ).join("");

    /* Whose decision is this? Shown BEFORE the buttons, so the operator knows the answer
       without discovering it by being refused. docs/02-stakeholders/02-decision-rights-raci.md */
    let rights = "";
    if (FT.roles) {
      const dId = FT.roles.decisionForProposal(pkg, FT.hydro.at(FT.state.timeH));
      if (dId) {
        const mine = FT.roles.can(dId);
        const who = FT.roles.accountable(dId);
        const cons = FT.roles.consulted(dId);
        rights = `<div class="dpSec dpRights ${mine ? "mine" : "notMine"}">
          <h5>${L("Thẩm quyền quyết định", "Decision authority")}</h5>
          <p class="dpWhy"><b>${dId}</b> · ${L("chịu trách nhiệm quyết định", "accountable")}: <b>${who}</b>
            ${cons.length ? ` · ${L("tham vấn", "consulted")}: ${cons.join(", ")}` : ""}<br>
            ${mine
              ? L("Vai trò của bạn ĐƯỢC phê duyệt quyết định này.", "Your role MAY approve this decision.")
              : L(`Vai trò của bạn không được phê duyệt - chỉ đề xuất và thực hiện. Chuyển hồ sơ cho ${who}.`,
                  `Your role may not approve this - propose and execute only. Refer the package to ${who}.`)}</p>
        </div>`;
      }
    }

    box.innerHTML = `
      ${rights}
      <div class="dpSec">
        <span class="dpKind ${kindCls}">${kindTxt}</span>
        <span class="dpKind ${pkg.confidence === "HIGH" ? "ok" : pkg.confidence === "MEDIUM" ? "warn" : "bad"}" style="margin-left:6px">${L("tin cậy", "confidence")} ${pkg.confidence}</span>
        <p class="dpWhy" style="margin:5px 0 0">${pkg.id} · κ = ${U.fmt(pkg.kappa, 2)} · ${L("hạn quyết định", "deadline")} T${U.fmt(pkg.deadline, 1)}h (${OPS.fmtHours(pkg.deadlineIn)})</p>
      </div>

      <div class="dpSec">
        <h5>${L("Hành động đề xuất", "Proposed action")}</h5>
        <p class="dpWhy">${pkg.reservoir.name}: <b>${U.fmtInt(a.q0)} → ${U.fmtInt(a.q1)} m³/s</b> ${L("từ", "from")} T+${a.tStart}h ·
          ${L("giới hạn tăng", "ramp ≤")} ${U.fmtInt(a.rampMax)} m³/s/h · ${L("kết thúc khi", "until")} ${a.endCondition}<br>
          ${L("Cửa van", "Gates")}: ${a.gates}</p>
      </div>

      <div class="dpSec">
        <h5>${L("Kiểm tra ràng buộc — bằng chứng khả thi", "Constraint check — feasibility proof")}</h5>
        <div class="dpConstraints">${cons}</div>
        ${pkg.binding ? `<p class="dpWhy dpBinding">${L("Ràng buộc quyết định", "Binding constraint")}: <b>${pkg.binding.id} ${pkg.binding.label}</b> - ${L("cần cấp thẩm quyền chấp thuận ngoại lệ hoặc chọn phương án khác.", "requires an authorised exception or a different option.")}</p>` : ""}
      </div>

      <div class="dpSec">
        <h5>${L("Kết quả tại", "Outcome at")} ${g.name} - ${L("so với KHÔNG hành động", "vs DOING NOTHING")}</h5>
        <div class="dpCompareRow">
          <span>${L("Đề xuất (liên hồ)", "Proposal (cascade)")}</span><b>${U.fmt(pkg.outcome.peak, 2)} m</b><b>${U.fmt(pkg.outcome.hoursBD3, 1)} h &gt; BĐ3</b>
          <span class="cf">${L("Không hành động", "No action")}</span><b class="cf">${U.fmt(pkg.counterfactual.peak, 2)} m</b><b class="cf">${U.fmt(pkg.counterfactual.hoursBD3, 1)} h</b>
        </div>
        <p class="dpWhy">BĐ3 = ${g.bd[2]} m · ${L("chênh lệch đỉnh", "peak difference")} <b>${U.fmt(pkg.cut, 2)} m</b>${pkg.kind === "NULL" ? ` - ${L("nhỏ hơn sai số dự báo, không khuyến nghị xả trước.", "smaller than the forecast error — pre-release not recommended.")}` : ""}</p>
      </div>

      <div class="dpSec">
        <h5>${L("Phương án thay thế", "Alternatives")}</h5>
        ${alts}
      </div>

      <div class="dpSec">
        <h5>${L("Hối tiếc hai chiều", "Regret, both ways")}</h5>
        <div class="dpRegret">
          <div><h6>${L("Xả trước mà bão lệch", "Act & storm misses")}</h6>
            ${pkg.regret.actAndMiss.storageDeficit >= 0
              ? `${L("Hụt trữ tại T+48h", "Storage deficit at T+48h")}: <b>−${U.fmt(pkg.regret.actAndMiss.storageDeficit, 0)} Mm³</b><br>
                 <span class="dpWhy">${pkg.regret.actAndMiss.note}</span>`
              : `${L("Trữ NHIỀU HƠN tại T+48h", "MORE storage at T+48h")}: <b>+${U.fmt(-pkg.regret.actAndMiss.storageDeficit, 0)} Mm³</b><br>
                 <span class="dpWhy">${L("Xả sớm rồi tích lại được — phương án này không đánh đổi dung tích cuối kỳ.",
                                          "Released early but refilled — this option costs no end-of-horizon storage.")}</span>`}</div>
          <div><h6>${L("Chờ mà lũ đến", "Wait & storm comes")}</h6>
            ${L("Đỉnh cao hơn", "Higher peak")}: <b>+${U.fmt(pkg.regret.waitAndHit.extraPeak, 2)} m</b><br>
            ${L("Thêm giờ trên BĐ3", "Extra hours &gt; AL3")}: <b>+${U.fmt(pkg.regret.waitAndHit.extraHoursBD3, 1)} h</b><br>
            <span class="dpWhy">${pkg.regret.waitAndHit.note}</span></div>
        </div>
      </div>

      <div class="dpSec">
        <h5>${L("Vì sao tin cậy ở mức này", "Why this confidence")}</h5>
        <p class="dpWhy">${pkg.confidenceWhy.join(" · ")}</p>
        <p class="dpWhy">${L("Phiên bản", "Versions")}: ${pkg.versions.engine} · ${pkg.versions.thresholds} · ${pkg.versions.rulebook}</p>
      </div>`;
  }

  /* ---------- domain event stream (constitution: every object emits events) ---------- */
  function updateEvents() {
    if (!el.eventRibbon || !FT.domain) return;
    const t = FT.state.timeH;
    const needs = (!FT.domain.ready || FT.domain.stale) && FT.world.ready && FT.hydro.ready;
    /* throttle: re-deriving costs ~15-30 ms and a scrub drag fires continuously */
    if (needs && performance.now() - lastTimelineAt > 1500) {
      lastTimelineAt = performance.now();
      const t0 = performance.now();
      FT.domain.stale = false;
      FT.domain.rebuildTimeline();
      console.info(`[domain] timeline ${FT.domain.events.length} events in ${Math.round(performance.now() - t0)} ms`);
      const bad = FT.domain.illegalTransitions();
      if (bad.length) console.warn("[domain] illegal state transitions", bad.slice(0, 5));
    }
    if (!FT.domain.ready) return;
    const past = FT.domain.past(t, 2).reverse(), next = FT.domain.upcoming(t, 4);
    const hm = (x) => U.clock(x).hm;
    const cell = (e, ahead) => `<button type="button" class="evChip sev${e.sev}${ahead ? " ahead" : ""}" data-evt="${e.tH}"
        title="${(e.detail || "").replace(/"/g, "&quot;")}">
        <i>${e.icon}</i><b>${hm(e.tH)}</b><span>${e.title}</span></button>`;
    const html = past.map((e) => cell(e, false)).join("") +
      `<span class="evNow">${L("HIỆN TẠI", "NOW")}</span>` +
      next.map((e) => cell(e, true)).join("");
    if (el.eventRibbon.dataset.sig !== html.length + ":" + (next[0] ? next[0].tH : "")) {
      el.eventRibbon.dataset.sig = html.length + ":" + (next[0] ? next[0].tH : "");
      el.eventRibbon.innerHTML = html || `<span class="evNow">${L("Không có sự kiện", "No events")}</span>`;
    }
  }

  /* ---------- sub-catchment rainfall + antecedent wetness (S-08 · FR-29) ---------- */
  function updateSubcatch() {
    if (!el.subList || !FT.hydro.ready || !D.SUBCATCH) return;
    const H = FT.hydro, t = FT.state.timeH;
    const at = (arr) => H.sample(arr, U.clamp(t, H.T0, H.T1));
    /* 24 h accumulation is what an operator reads, not an instantaneous rate */
    const acc24 = (arr) => {
      let s = 0;
      for (let x = Math.max(H.T0, t - 24); x <= t; x += 0.5) s += H.sample(arr, x) * 0.5;
      return s;
    };
    let upper = 0, local = 0;
    const rows = D.SUBCATCH.map((sc) => {
      const S = H.sub[sc.id];
      const r = at(S.rain), a24 = acc24(S.rain), sat = H.satOf(at(S.api));
      const cls = H.wetClass(sat);
      const ro = at(S.runoff);
      if (sc.kind === "upper") upper += ro * sc.weight; else local += ro * sc.weight;
      return { sc, r, a24, sat, cls, ro };
    });
    const tot = upper + local;
    const ctrl = tot > 0.01 ? upper / tot : 0;
    el.subSplit.textContent = L(`${Math.round(ctrl * 100)}% điều tiết được`, `${Math.round(ctrl * 100)}% controllable`);
    el.subSplit.style.color = ctrl < 0.3 ? "var(--al-2)" : "";
    el.subSplit.title = L("Tỉ lệ dòng chảy sinh ra ở lưu vực có hồ điều tiết phía trên",
                          "Share of runoff generated in catchments with a reservoir above them");

    el.subList.innerHTML = rows.map((x) => `
      <div class="subRow ${x.sc.kind}">
        <span class="subName">${x.sc.name}<i>${x.sc.kind === "upper" ? L("điều tiết được", "controllable") : L("không điều tiết", "uncontrolled")}</i></span>
        <b class="subRain">${U.fmt(x.r, 0)}<em>mm/h</em></b>
        <b class="subAcc">${U.fmt(x.a24, 0)}<em>mm/24h</em></b>
        <span class="subWet wet-${x.cls.k}" title="${L("Chỉ số bão hòa đất (API/", "Soil saturation index (API/")}${H.API_SAT} mm)">
          <i style="--w:${Math.min(100, x.sat * 100).toFixed(0)}%"></i>${vi() ? x.cls.vi : x.cls.en} ${x.sat >= 1 ? "100" : Math.round(x.sat * 100)}%
        </span>
      </div>`).join("");

    /* Honesty: the demo's synthetic pulses run hotter than the plausibility band in
       docs/00-foundations/09-typical-values.md §1. Say so on the screen rather than let a
       hydrologist find it - an unflagged implausible number costs more than the flag. */
    if (el.rainCaveat && !el.rainCaveat.dataset.done) {
      let total = 0;
      for (let i = 0; i < H.NT; i++) total += H.rain[i] * H.DT;
      el.rainCaveat.innerHTML = L(
        `<b>Cảnh báo hiệu chỉnh:</b> tổng mưa kịch bản ~${Math.round(total)} mm/72h, <b>cao hơn dải hợp lý</b> 1000–1500 mm/72h cho sườn đón gió (typical-values §1). Chuỗi mưa là <b>tổng hợp</b>, chưa hiệu chỉnh theo trận thật — xem R-26.`,
        `<b>Calibration caveat:</b> scenario rainfall totals ~${Math.round(total)} mm/72 h, <b>above the plausible band</b> of 1000–1500 mm/72 h for windward slopes (typical-values §1). The series is <b>synthetic</b> and not calibrated to a real event — see R-26.`);
    }
  }

  /* ---------- alarms (DT-8) ---------- */
  function renderAlarms() {
    if (!el.alarmList || !FT.alarms) return;
    const act = FT.alarms.active();
    const dam = act.filter((a) => a.damSafety);
    const rest = act.filter((a) => !a.damSafety);
    const grouped = rest.filter((a) => a.groupOf === "storm");
    const singles = rest.filter((a) => a.groupOf !== "storm");
    el.alarmCount.textContent = `${FT.alarms.unacked().length}/${act.length}`;
    el.alarmCount.style.color = FT.alarms.unacked().length ? "var(--al-2)" : "";

    const row = (a) => `<div class="alarmRow sev${a.severity}${a.acked ? " acked" : ""}" data-alarm="${a.id}">
      <span class="alarmWhat">${a.what}</span>
      <button type="button" class="alarmAck" data-ack="${a.id}"${a.acked ? " disabled" : ""}>${a.acked ? "✓" : L("Xác nhận", "Ack")}</button>
      <em>${a.means}${a.doWhat ? ` → <b>${a.doWhat}</b>` : ""}${a.byWhen != null ? ` · ${L("trước", "by")} ${U.clock(a.byWhen).hm}` : ""}${a.acked ? ` · ${L("đã xác nhận", "acked by")} ${a.ackBy}` : ""}</em></div>`;

    el.alarmList.innerHTML =
      (dam.length ? `<h6 class="alarmDam">${L("AN TOÀN ĐẬP - không gộp, không tự xoá", "DAM SAFETY - never grouped, never auto-cleared")}</h6>${dam.map(row).join("")}` : "") +
      singles.map(row).join("") +
      (grouped.length ? `<div class="alarmRow sev2"><span class="alarmWhat">${L(`${grouped.length} cảnh báo khác cùng đợt`, `${grouped.length} further alarms in this burst`)}</span>
         <button type="button" class="alarmAck" data-ackall="1">${L("Xác nhận cả nhóm", "Ack group")}</button>
         <em>${L("Gộp để tránh nhiễu cảnh báo - mở nhật ký để xem từng mục.", "Grouped to prevent alarm fatigue - open the audit log for each item.")}</em></div>` : "") ||
      `<div class="alarmRow sev1"><span class="alarmWhat">${L("Không có cảnh báo cần xử lý", "No actionable alarms")}</span><em></em></div>`;
  }

  /* ---------- notifications (FR-20) ---------- */
  function openNotifyComposer(type) {
    const snap = FT.hydro.at(FT.state.timeH);
    const rec = FT.notifyOps.buildRecord(type, snap);
    pendingRec = rec;
    const ch = rec.channels;
    const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
    FT.ui.openModal(L("Soạn thông báo hạ du", "Compose downstream notification"),
      `<p class="dpWhy">${L("Tất cả biến thể dưới đây được sinh từ MỘT bản ghi", "All variants below are rendered from ONE record")} <b>${rec.id}</b> —
        ${L("nên các kênh không thể lệch số liệu nhau.", "so the channels cannot carry different numbers.")}</p>
       <p class="dpWhy" style="color:var(--al-2)">${L("Bản demo: KHÔNG gửi thật. Kênh gửi là hộp cát và mọi thao tác được ghi nhật ký.",
                                                      "Demo build: nothing is actually sent. The transport is a sandbox and every action is logged.")}</p>
       <h5 style="margin:10px 0 4px">${L("Người nhận bắt buộc", "Required recipients")}</h5>
       <div class="dpWhy">${rec.recipients.map((r) => `${r.name} <i>(${r.channels.join(", ")})</i>`).join(" · ")}</div>
       ${["call", "sms", "loudspeaker", "public", "cap"].map((k) => {
        const title = { call: L("Kịch bản gọi điện (≤20 giây)", "Phone script (≤20 s)"), sms: L("SMS / cell broadcast (không dấu)", "SMS / cell broadcast (unaccented)"), loudspeaker: L("Loa xã/phường", "Commune loudspeaker"), public: L("Thẻ thông tin cho người dân", "Public information card"), cap: "CAP (machine)" }[k];
        const meta = k === "sms"
          ? ` <i style="color:var(--ink-2);font-weight:400">- ${ch.smsParts.length} ${L("tin", "part(s)")}, ${ch.smsParts.map((p) => p.length).join("+")} ${L("ký tự", "chars")}</i>` : "";
        return `<h5 style="margin:12px 0 4px">${title}${meta}</h5>
         <pre style="white-space:pre-wrap;font-size:11px;line-height:1.55;background:rgba(9,20,32,.6);border:1px solid var(--line);border-radius:6px;padding:8px">${esc(ch[k])}</pre>`;
      }).join("")}
       <div style="margin-top:12px"><button id="nfSend" class="btnPrimary" type="button">${L("Phê duyệt & phát (hộp cát)", "Approve & dispatch (sandbox)")}</button></div>`);
    const b = document.getElementById("nfSend");
    if (b) b.addEventListener("click", () => {
      if (!OPS.audit.actor.name) {
        FT.notify(L("Chọn người trực trước khi phát thông báo.", "Select the duty operator before dispatching."), "warn");
        return;
      }
      /* Publishing to the public (D-14) and ordering an evacuation (D-10) are accountable to
         the authority, not to the plant. A message that reaches citizens is a decision, not
         a transmission. */
      if (FT.roles) {
        const needs = type === "evacuation" ? "D-10"
          : pendingRec.recipients.some((r) => r.key === "public" || r.key === "media") ? "D-14" : null;
        if (needs && !FT.roles.can(needs)) {
          OPS.audit.log("notify.refused", {
            decision: needs, requiredRole: FT.roles.accountable(needs),
            actorRole: OPS.audit.actor.role, type,
          });
          FT.notify(FT.roles.refusal(needs).replace(/\*\*/g, ""), "warn");
          renderAudit();
          return;
        }
      }
      const entry = FT.notifyOps.dispatch(pendingRec, `${OPS.audit.actor.name} (${OPS.audit.actor.role})`);
      FT.notify(L(`Đã phát ${entry.recipients.length} nhóm người nhận (hộp cát)`, `Dispatched to ${entry.recipients.length} recipient groups (sandbox)`), "ok");
      renderNotify(); renderAudit();
      const scrim = $("modalScrim"); if (scrim) scrim.hidden = true;
    });
  }
  let pendingRec = null;

  function renderNotify() {
    if (!el.notifyList || !FT.notifyOps) return;
    const sent = FT.notifyOps.sent.slice(0, 4);
    if (!sent.length) { el.notifyList.innerHTML = ""; return; }
    el.notifyList.innerHTML = sent.map((e) => {
      const ack = e.recipients.filter((r) => r.acked).length;
      const pend = e.recipients.filter((r) => !r.acked);
      return `<div class="nfEntry">
        <div class="nfHead"><b>${e.record.headlineShort}</b><span>${ack}/${e.recipients.length} ${L("đã xác nhận", "acked")}</span></div>
        <div class="nfRecips">${e.recipients.map((r) =>
          `<button type="button" class="nfChip${r.acked ? " on" : ""}" data-nfack="${e.id}|${r.key}"${r.acked ? " disabled" : ""}>${r.name.split(" ")[0]} ${r.acked ? "✓" : "○"}</button>`).join("")}</div>
        ${pend.length ? `<em>${L("Chưa xác nhận", "Unacknowledged")}: ${pend.map((r) => r.name).join(", ")} - ${L("leo thang bằng điện thoại", "escalate by phone")}</em>` : ""}
      </div>`;
    }).join("");
  }

  /* ---------- audit trail ---------- */
  function renderAudit() {
    const list = el.auditLog;
    if (!list) return;
    const entries = OPS.audit.entries;
    if (entries.length === auditDrawn) return;
    auditDrawn = entries.length;
    list.innerHTML = entries.slice(-40).reverse().map((e) => {
      const t = e.tsUtc.slice(11, 19);
      return `<li><i>#${e.seq}</i><span><b>${e.action}</b> · ${t} · T${e.simT}h
        <em>${e.actor}${e.reason ? ` - “${e.reason}”` : ""} · snap ${e.snapshot}</em></span></li>`;
    }).join("");
  }

  /* ---------- data-health modal ---------- */
  function openHealth() {
    const hl = OPS.health();
    const rows = hl.feeds.map((f) => {
      const cls = f.ageMin > 170 ? "gone" : f.ageMin > 15 ? "stale" : "";
      const state = f.ageMin > 170 ? L("MẤT", "MISSING") : f.ageMin > 15 ? L("CŨ", "STALE") : "OK";
      return `<tr><td>${f.name}</td><td>${f.critical ? "★" : ""}</td><td class="${cls}">${state}</td><td class="${cls}">${Math.round(f.ageMin)}′</td></tr>`;
    }).join("");
    const affected = hl.level >= 2
      ? L("Bộ tối ưu bị VÔ HIỆU cho hồ liên quan; quay về hướng dẫn theo biểu đồ điều phối.",
          "The optimiser is DISABLED for the affected reservoir; falling back to rule-curve guidance.")
      : hl.level >= 1 ? L("Các đại lượng liên quan bị hạ mức tin cậy.", "Affected quantities are downgraded in confidence.")
      : L("Không có tính toán nào bị ảnh hưởng.", "No computation is affected.");
    FT.ui.openModal(L("Sức khỏe dữ liệu", "Data health"),
      `<p><b>${L("Mức vận hành", "Operating level")} L${hl.level}</b> — ${hl.reason}</p>
       <p>${affected}</p>
       <p class="dpWhy">${L("Toàn bộ nguồn trong bản demo là TỔNG HỢP: không có telemetry thật. Điều khiển suy giảm trên thanh trạng thái để kiểm chứng hành vi L0-L4.",
                            "Every feed in this demo is SYNTHETIC - there is no real telemetry. Use the degradation control in the status bar to exercise the L0-L4 behaviour.")}</p>
       <table class="feedTable"><tr><th>${L("Nguồn", "Feed")}</th><th></th><th>${L("Trạng thái", "State")}</th><th>${L("Tuổi", "Age")}</th></tr>${rows}</table>`);
  }

  /* ---------- approval gate: identity + reason are required (FR-05, FR-10) ---------- */
  function gate(ev, action) {
    if (!OPS.audit.actor.name) {
      ev.stopImmediatePropagation(); ev.preventDefault();
      el.opsActorWrap.classList.add("unset");
      FT.notify(L("Chọn người trực trước khi phê duyệt - không chấp nhận quyết định vô danh.",
                  "Select the duty operator first - anonymous decisions are not accepted."), "warn");
      return false;
    }
    const reason = (el.dpReasonInput.value || "").trim();
    if (reason.length < 4) {
      ev.stopImmediatePropagation(); ev.preventDefault();
      el.dpReasonWrap.classList.add("needed");
      el.dpReasonInput.focus();
      FT.notify(L("Nhập lý do ghi nhận - bắt buộc cho hồ sơ kiểm toán.",
                  "Enter a reason of record - required for the audit trail."), "warn");
      return false;
    }
    el.dpReasonWrap.classList.remove("needed");
    const pkg = FT.ops._last;

    /* Decision rights (RACI). Being identified is not the same as being entitled: a
       reservoir engineer proposes a pre-release, the authority approves it. A refusal here
       names the accountable role and is itself logged - an attempted approval by the wrong
       office is exactly the kind of thing an inquiry asks about. */
    if (FT.roles && action === "decision.approve") {
      const snap = FT.hydro.at(FT.state.timeH);
      const dId = FT.roles.decisionForProposal(pkg, snap);
      if (dId && !FT.roles.can(dId)) {
        ev.stopImmediatePropagation(); ev.preventDefault();
        OPS.audit.log("decision.refused", {
          decision: dId, requiredRole: FT.roles.accountable(dId),
          actorRole: OPS.audit.actor.role, package: pkg ? pkg.id : null,
        }, reason);
        FT.notify(FT.roles.refusal(dId).replace(/\*\*/g, ""), "warn");
        renderAudit();
        return false;
      }
    }

    OPS.audit.log(action, {
      decision: FT.roles ? FT.roles.decisionForProposal(pkg, FT.hydro.at(FT.state.timeH)) : null,
      actorRole: OPS.audit.actor.role,
      package: pkg ? pkg.id : null,
      feasible: pkg ? pkg.feasible : null,
      binding: pkg && pkg.binding ? pkg.binding.id : null,
      peak: pkg ? U.fmt(pkg.outcome.peak, 2) : null,
      counterfactualPeak: pkg ? U.fmt(pkg.counterfactual.peak, 2) : null,
      confidence: pkg ? pkg.confidence : null,
      dataLevel: OPS.health().level,
    }, reason);
    el.dpReasonInput.value = "";
    renderAudit();
    return true;
  }

  /* ---------- wiring ---------- */
  function init() {
    el = {
      opsEsc: $("opsEsc"), opsEscVal: $("opsEscVal"),
      opsHealth: $("opsHealth"), opsHealthVal: $("opsHealthVal"),
      opsKappa: $("opsKappa"), opsKappaVal: $("opsKappaVal"),
      opsDeadline: $("opsDeadline"), opsDeadlineVal: $("opsDeadlineVal"),
      opsPex: $("opsPex"), opsPexVal: $("opsPexVal"),
      eventRibbon: $("eventRibbon"),
      subList: $("subList"), subSplit: $("subSplit"), rainCaveat: $("rainCaveat"),
      evacList: $("evacList"), shelterList: $("shelterList"), evacSummary: $("evacSummary"),
      shelterCapacity: $("shelterCapacity"),
      opsMode: $("opsMode"), opsActor: $("opsActor"), opsDegrade: $("opsDegrade"),
      opsActorWrap: $("opsActor") && $("opsActor").parentElement,
      dpBox: $("dpBox"), dpReasonInput: $("dpReasonInput"),
      dpReasonWrap: $("dpReasonInput") && $("dpReasonInput").parentElement,
      auditLog: $("auditLog"), auditExport: $("auditExport"),
      alarmList: $("alarmList"), alarmCount: $("alarmCount"), notifyList: $("notifyList"),
    };
    if (!el.dpBox) return;

    OPS.init();
    el.opsMode.textContent = OPS.modeLabel();

    el.opsActor.addEventListener("change", () => {
      const v = el.opsActor.value;
      if (!v) { OPS.audit.actor = { name: "", role: "" }; return; }
      const [name, role] = v.split("|");
      OPS.audit.actor = { name, role };
      el.opsActorWrap.classList.remove("unset");
      OPS.audit.log("session.actor", { name, role });
      renderAudit();
    });
    el.opsDegrade.addEventListener("change", () => {
      OPS.setDegradation(el.opsDegrade.value ? Number(el.opsDegrade.value) : null);
      renderAudit();
    });
    /* notification composer */
    const nfBtn = (id, type) => { const b = $(id); if (b) b.addEventListener("click", () => openNotifyComposer(type)); };
    const rp = (id, kind) => { const b = $(id); if (b) b.addEventListener("click", () => FT.reports.preview(kind)); };
    rp("btnRepOperation", "operation"); rp("btnRepEvent", "event");
    nfBtn("nfThreshold", "threshold"); nfBtn("nfRelease", "release"); nfBtn("nfEvac", "evacuation");

    /* alarm acknowledgement + recipient acknowledgement (event-delegated) */
    document.addEventListener("click", (ev) => {
      const ack = ev.target.closest && ev.target.closest("[data-ack]");
      if (ack) {
        const who = OPS.audit.actor.name ? `${OPS.audit.actor.name} (${OPS.audit.actor.role})` : null;
        if (!who) { FT.notify(L("Chọn người trực trước khi xác nhận cảnh báo.", "Select the duty operator before acknowledging."), "warn"); return; }
        FT.alarms.ack(Number(ack.dataset.ack), who); renderAlarms(); renderAudit(); return;
      }
      const all = ev.target.closest && ev.target.closest("[data-ackall]");
      if (all) {
        const who = OPS.audit.actor.name ? `${OPS.audit.actor.name} (${OPS.audit.actor.role})` : null;
        if (!who) { FT.notify(L("Chọn người trực trước khi xác nhận cảnh báo.", "Select the duty operator before acknowledging."), "warn"); return; }
        FT.alarms.active().filter((a) => a.groupOf === "storm" && !a.acked).forEach((a) => FT.alarms.ack(a.id, who));
        renderAlarms(); renderAudit(); return;
      }
      const evt = ev.target.closest && ev.target.closest("[data-evt]");
      if (evt) {
        FT.state.timeH = Number(evt.dataset.evt);
        FT.state.playing = false;
        FT.bus.emit("scrubbed"); FT.bus.emit("playState");
        return;
      }
      const nf = ev.target.closest && ev.target.closest("[data-nfack]");
      if (nf) {
        const [id, key] = nf.dataset.nfack.split("|");
        FT.notifyOps.ack(id, key, OPS.audit.actor.name || "commune duty officer");
        renderNotify(); renderAudit();
      }
    });

    el.opsHealth.addEventListener("click", openHealth);
    el.opsHealth.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") openHealth(); });
    el.auditExport.addEventListener("click", () => {
      FT.ui.openModal(L("Xuất nhật ký kiểm toán", "Audit trail export"),
        `<p class="dpWhy">${OPS.modeLabel()}</p><pre style="white-space:pre-wrap;font-size:11px;line-height:1.6">${
          (OPS.audit.exportText() || "-").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</pre>`);
    });

    /* capture phase so the gate runs before ui.js's own approve/reject handlers */
    const ap = $("mpcApprove"), rj = $("mpcReject");
    if (ap) ap.addEventListener("click", (e) => gate(e, "decision.approve"), true);
    if (rj) rj.addEventListener("click", (e) => gate(e, "decision.reject"), true);

    FT.bus.on("hydroRebuilt", () => {
      lastPkgKey = "";
      OPS.audit.log("engine.rebuild", { scenario: FT.state.scenario, policy: FT.state.policy, rainScale: U.fmt(FT.state.rainScale, 2), ensSpread: U.fmt(FT.state.ensSpread, 2) });
      renderAudit();
    });

    /* wrap the existing tick - additive, never replacing */
    const baseTick = FT.ui.tick;
    FT.ui.tick = function (snap) {
      baseTick(snap);
      try {
        updateOpsBar(snap);
        updateSafety(snap);
        evacAcc += 1;
        if (evacAcc >= 3) {                                     // ~1.5 Hz: Dijkstra on the predicted network
          evacAcc = 0;
          updateEvac();
          updateSubcatch();
          updateEvents();
          if (FT.alarms) { FT.alarms.scan(snap); renderAlarms(); renderNotify(); }
        }
        const key = `${FT.state.scenario}|${FT.state.policy}|${Math.round(FT.state.timeH * 4)}|${OPS.health().level}`;
        if (key !== lastPkgKey) {
          lastPkgKey = key;
          const pkg = OPS.package(snap);
          FT.ops._last = pkg;
          renderPackage(pkg);
          updateDeadline(pkg);
        }
        renderAudit();
      } catch (err) {
        console.error("[ops] tick", err);
      }
    };
    renderAudit();
    renderAlarms();
    renderNotify();
    console.info("[ops] decision layer active");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(init, 0));
  else setTimeout(init, 0);
})();
