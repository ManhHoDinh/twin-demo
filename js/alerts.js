/* FloodTwin — alarms + notification workflow
   docs: FR-44 (alarm philosophy, DT-8) · FR-20 (one decision record → every channel)
         · docs/03-operations/03-communication-protocols.md

   The structural rule this module exists to enforce: EVERY channel message is rendered
   from ONE record. Nobody hand-writes a per-channel variant, so the phone script, the SMS,
   the loudspeaker script and the public card cannot contradict each other — the failure
   that historically does the most damage to public compliance (failure library §3 #11).

   Nothing here can send anything. The transport is a sandbox that records what WOULD be
   sent, because this build runs on synthetic hydrology (risk register R-01). */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, D = FT.data;
  const vi = () => FT.state.lang === "vi";
  const L = (v, e) => (vi() ? v : e);
  const hm = (t) => U.clock(t).hm;
  const dm = (t) => U.clock(t).dm;

  /* ================================================================
     ALARMS (DT-8) — an alarm the operator cannot act on is a status, not an alarm
     ================================================================ */
  const A = (FT.alarms = { list: [] });
  const STORM_WINDOW = 5;                 // alarms
  let seq = 0, recent = [];

  /* severity: 1 info · 2 warn · 3 critical · 4 dam safety (never grouped, never auto-cleared) */
  function key(a) { return `${a.kind}:${a.subject}`; }

  A.raise = function (kind, subject, opts) {
    opts = opts || {};
    const k = `${kind}:${subject}`;
    const now = FT.state.timeH;
    const existing = A.list.find((x) => key(x) === k && !x.cleared);
    if (existing) {                        // one alarm per condition — update, never re-fire
      existing.updatedT = now;
      existing.detail = opts.detail || existing.detail;
      existing.severity = Math.max(existing.severity, opts.severity || 1);
      return existing;
    }
    const a = {
      id: ++seq, kind, subject,
      severity: opts.severity || 2,
      damSafety: !!opts.damSafety,
      what: opts.what || "", means: opts.means || "", doWhat: opts.doWhat || "",
      byWhen: opts.byWhen == null ? null : opts.byWhen,
      detail: opts.detail || null,
      raisedT: now, updatedT: now,
      acked: false, ackBy: null, ackAt: null,
      cleared: false, groupOf: null,
    };
    /* storm suppression: many alarms at once become ONE escalation, except dam safety */
    recent = recent.filter((r) => Math.abs(now - r) < 0.5);
    recent.push(now);
    if (!a.damSafety && recent.length > STORM_WINDOW) a.groupOf = "storm";
    A.list.unshift(a);
    if (A.list.length > 80) A.list.length = 80;
    FT.ops && FT.ops.audit.log("alarm.raise", { kind, subject, severity: a.severity, damSafety: a.damSafety });
    return a;
  };
  A.ack = function (id, who) {
    const a = A.list.find((x) => x.id === id);
    if (!a || a.acked) return null;
    a.acked = true; a.ackBy = who || "unattributed"; a.ackAt = new Date().toISOString();
    FT.ops && FT.ops.audit.log("alarm.ack", { id, kind: a.kind, subject: a.subject }, `acknowledged by ${a.ackBy}`);
    return a;
  };
  /* a condition that has genuinely ended clears — but dam-safety alarms need a human */
  A.resolve = function (kind, subject) {
    const a = A.list.find((x) => key(x) === `${kind}:${subject}` && !x.cleared);
    if (!a || a.damSafety) return;
    a.cleared = true; a.clearedT = FT.state.timeH;
  };
  A.active = () => A.list.filter((a) => !a.cleared);
  A.unacked = () => A.active().filter((a) => !a.acked);

  /* ---------- scan the world state and raise/clear alarms ---------- */
  let lastScan = -1e9;
  A.scan = function (snap) {
    const t = FT.state.timeH;
    if (Math.abs(t - lastScan) < 0.25) return;
    lastScan = t;

    /* gauge threshold crossings — actionable, so they are alarms */
    for (const g of D.GAUGES) {
      const gs = snap.gauges[g.id];
      if (gs.alert >= 2) {
        A.raise("gauge", g.id, {
          severity: gs.alert >= 3 ? 3 : 2,
          what: L(`${g.name} ${U.fmt(gs.stage, 2)} m - trên BĐ${gs.alert}`, `${g.name} ${U.fmt(gs.stage, 2)} m - above AL${gs.alert}`),
          means: L("Ngập nghiêm trọng vùng trũng ven sông", "Serious flooding of low-lying riverside areas"),
          doWhat: gs.alert >= 3 ? L("Phát lệnh sơ tán vùng trũng", "Order evacuation of low-lying areas")
                                : L("Rà soát hộ ven sông, chuẩn bị sơ tán", "Check riverside households, prepare to evacuate"),
        });
      } else A.resolve("gauge", g.id);
    }

    /* reservoir safety — dam-safety alarms are exempt from grouping and auto-clear */
    for (const r of D.RESERVOIRS) {
      const rs = snap.reservoirs[r.id];
      const m = FT.ops ? FT.ops.margins(snap, r) : null;
      if (rs.Z > r.fsl) {
        A.raise("dam", r.id, {
          severity: 4, damSafety: true,
          what: L(`${r.name}: Z ${U.fmt(rs.Z, 2)} m trên MNDBT ${r.fsl} m`, `${r.name}: Z ${U.fmt(rs.Z, 2)} m above FSL ${r.fsl} m`),
          means: L("Vượt mực nước dâng bình thường - vùng lũ thiết kế", "Above normal max level - into the design flood range"),
          doWhat: L("Báo cơ quan an toàn đập; xả theo phương án khẩn cấp", "Notify the dam safety authority; operate to the emergency plan"),
        });
      } else if (rs.overCeil) {
        A.raise("res", r.id, {
          severity: 2,
          what: L(`${r.name} trên trần đón lũ (${r.ceil} m)`, `${r.name} above flood ceiling (${r.ceil} m)`),
          means: L("Dung tích phòng lũ đang bị lấn", "Flood storage is being encroached"),
          doWhat: L("Ghi nhận lý do, lập kế hoạch hạ về trần", "Record the reason, plan a drawdown to the ceiling"),
          byWhen: m && m.tToCeil != null ? t + m.tToCeil : null,
        });
      } else { A.resolve("res", r.id); A.resolve("dam", r.id); }
      /* buffer exhaustion — the moment the reservoir stops reducing the flood */
      if (m && m.exhaustT != null && m.exhaustT > t && m.exhaustT - t < 6) {
        A.raise("buffer", r.id, {
          severity: 3,
          what: L(`${r.name}: hết dung tích cắt lũ ~${hm(m.exhaustT)}`, `${r.name}: flood buffer exhausted ~${hm(m.exhaustT)}`),
          means: L("Từ thời điểm đó lượng xả ≈ lượng về - hồ không còn cắt lũ", "From then outflow ≈ inflow - the reservoir no longer reduces the flood"),
          doWhat: L("Thông báo hạ du TRƯỚC thời điểm này", "Notify downstream BEFORE this time"),
          byWhen: m.exhaustT,
        });
      } else A.resolve("buffer", r.id);
    }

    /* Zone isolation — outranks depth severity, but ONE root cause (the network is coming
       apart) gets ONE alarm listing the affected zones. Eleven near-identical alarms with
       the same required action is textbook alarm fatigue (DT-8). */
    if (FT.zones && FT.zones.ready) {
      const cut = FT.zones.list.filter((z) => z.isolated);
      const soon = FT.zones.list.filter((z) => !z.isolated && z.isolatesAt != null && z.isolatesAt - t < 3)
        .sort((a, b) => a.isolatesAt - b.isolatesAt);
      if (cut.length) {
        A.raise("isolation", "cut", {
          severity: 3,
          what: L(`${cut.length} khu vực đã mất toàn bộ tuyến tiếp cận`, `${cut.length} zones have lost all access routes`),
          means: cut.map((z) => z.def.name).join(", "),
          doWhat: L("Điều xuồng/trực thăng; tiếp tế tại chỗ; không điều xe bánh lốp vào", "Deploy boats/air; resupply in place; do not send wheeled vehicles in"),
        });
      } else A.resolve("isolation", "cut");
      if (soon.length) {
        A.raise("isolation", "soon", {
          severity: 2,
          what: L(`${soon.length} khu vực sắp mất tuyến cuối, sớm nhất ~${hm(soon[0].isolatesAt)}`,
                  `${soon.length} zones about to lose their last route, earliest ~${hm(soon[0].isolatesAt)}`),
          means: soon.map((z) => `${z.def.name} ~${hm(z.isolatesAt)}`).join(", "),
          doWhat: L("Tiền trạm lực lượng và vật tư trước giờ đó", "Pre-position teams and supplies before then"),
          byWhen: soon[0].isolatesAt,
        });
      } else A.resolve("isolation", "soon");
    }

    /* data health */
    const hl = FT.ops ? FT.ops.health() : null;
    if (hl && hl.level >= 2) {
      A.raise("data", "level", {
        severity: hl.level >= 4 ? 3 : 2,
        what: L(`Dữ liệu mức L${hl.level}`, `Data at level L${hl.level}`),
        means: hl.reason,
        doWhat: hl.level >= 4 ? L("Hệ thống KHÔNG đưa đề xuất - dùng phương án ứng phó và danh bạ", "System will NOT advise - use the emergency plan and contact tree")
                              : L("Bộ tối ưu vô hiệu - vận hành theo biểu đồ điều phối", "Optimiser disabled - operate to the rule curve"),
      });
    } else A.resolve("data", "level");
  };

  /* ================================================================
     NOTIFICATIONS (FR-20) — one record, every channel
     ================================================================ */
  const NF = (FT.notifyOps = { sent: [] });

  /* SMS and cell broadcast must survive legacy handsets: strip to plain ASCII, including
     the typographic characters that creep in from the UI (en dash, ³, ·, curly quotes). */
  const unaccent = (s) => String(s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/³/g, "3").replace(/²/g, "2")
    .replace(/[·•]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\n]/g, "");
  /* 160 GSM characters is one message; longer texts are split and numbered rather than
     silently truncated, because a warning cut mid-sentence loses the instruction. */
  function smsParts(text) {
    const t = text.replace(/\s+/g, " ").trim();
    if (t.length <= 160) return [t];
    const parts = [];
    const budget = 153;                        // 7 chars reserved for the "(n/m)" marker
    let rest = t;
    while (rest.length) {
      let cut = rest.length <= budget ? rest.length : rest.lastIndexOf(" ", budget);
      if (cut <= 0) cut = Math.min(budget, rest.length);
      parts.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    return parts.map((p, i) => `${p} (${i + 1}/${parts.length})`);
  }

  /* who must be told, per event class — docs/03-operations/03-communication-protocols.md §1 */
  const MATRIX = {
    release: ["plant", "damSafety", "authority", "communes", "emergency", "dispatch", "media", "public"],
    threshold: ["plant", "authority", "communes", "emergency", "media", "public"],
    passthrough: ["plant", "damSafety", "authority", "communes", "emergency", "dispatch", "media", "public"],
    evacuation: ["authority", "communes", "emergency", "media", "public"],
    damEmergency: ["plant", "damSafety", "authority", "communes", "emergency", "dispatch", "media", "public"],
  };
  const RECIPIENTS = {
    plant: { name: "Nhà máy / trực ban vận hành", channels: ["call", "app"] },
    damSafety: { name: "Cơ quan an toàn đập", channels: ["call", "email"] },
    authority: { name: "Ban Chỉ huy PCTT&TKCN thành phố", channels: ["call", "email", "app"] },
    communes: { name: "UBND các xã/phường hạ du", channels: ["call", "sms", "zalo", "loudspeaker"] },
    emergency: { name: "Lực lượng cứu hộ / công an / quân sự", channels: ["call", "app"] },
    dispatch: { name: "Trung tâm Điều độ hệ thống điện", channels: ["call", "email"] },
    media: { name: "Đài PT-TH / báo chí", channels: ["email", "cap"] },
    public: { name: "Người dân vùng hạ du", channels: ["sms", "zalo", "siren", "app", "cap"] },
  };

  /* ---------- render every channel variant from ONE record ---------- */
  NF.render = function (rec) {
    const g = rec.gauge, out = {};
    const stage = rec.stage != null ? U.fmt(rec.stage, 2) : "-";
    const bdTxt = rec.bdLevel ? `${L("trên BĐ", "above AL")}${rec.bdLevel} ${rec.overBy != null ? `${U.fmt(rec.overBy, 2)} m` : ""}` : "";

    /* Capacity-honest shelter guidance for the HEADLINE zone (the area the message speaks to).
       Three states from the allocation: fully placed → name shelter + deadline; partially placed
       → name shelter for those who fit AND tell the rest to take vertical refuge, with the honest
       count; unplaced → refuge only, never a shelter the zone has no place at. A warning that
       promises room that is not there costs public compliance the next time (failure library
       §message-credibility). The refuge wording matches the ops panel's isolated-zone copy. */
    const hp = rec.shelterPlan && rec.shelterPlan.length ? rec.shelterPlan[0] : null;
    const refugeShort = "Len tang cao/vung cao, cho cuu ho";
    const refugeVi = "lên tầng cao hoặc vùng cao và chờ lực lượng cứu hộ";
    const refugeEn = "move to upper floors or high ground and await rescue";
    // SMS (unaccented, terse): "Den X truoc HH:MM." + shortfall note, or refuge only
    const smsShelter = (() => {
      if (!hp || !hp.shelter) return ` ${refugeShort}.`;
      const by = hp.departBy != null ? ` truoc ${hm(hp.departBy)}` : "";
      const fit = ` Den ${hp.shelter}${by} (${U.fmtInt(hp.placed)} cho).`;
      const rest = hp.unsheltered > 0 ? ` Con ~${U.fmtInt(hp.unsheltered)} nguoi: ${refugeShort}.` : "";
      return fit + rest;
    })();
    // Loudspeaker / public card (accented, room for the honest count) — headline zone.
    // `lead` differs by channel: the loudspeaker says "đến X", the public card just "X".
    const shelterLine = (lead) => {
      if (!hp || !hp.shelter) return L(refugeVi, refugeEn);
      const by = hp.departBy != null ? L(` trước ${hm(hp.departBy)}`, ` before ${hm(hp.departBy)}`) : "";
      const head = L(`${lead ? "đến " : ""}${hp.shelter}${by} (còn ${U.fmtInt(hp.placed)} chỗ)`,
                     `${lead ? "to " : ""}${hp.shelter}${by} (${U.fmtInt(hp.placed)} places)`);
      if (hp.unsheltered <= 0) return head;
      const rest = L(`; ~${U.fmtInt(hp.unsheltered)} người còn lại ${refugeVi}`,
                     `; the remaining ~${U.fmtInt(hp.unsheltered)} ${refugeEn}`);
      return head + rest;
    };
    /* Loudspeaker addresses MULTIPLE zones, so it gives each addressed zone its OWN shelter
       (where the allocation places it) and its own shortfall — a resident hears the instruction
       for their own area, never another district's shelter. Per-zone honesty, founder decision. */
    const perZoneLoud = () => {
      const plan = rec.shelterPlan || [];
      if (!plan.length) return "";
      return plan.map((p) => {
        if (!p.shelter) return `- ${p.zone}: ${refugeVi}.`;
        const by = p.departBy != null ? ` (trước ${hm(p.departBy)})` : "";
        const rest = p.unsheltered > 0 ? `; ~${U.fmtInt(p.unsheltered)} người còn lại ${refugeVi}` : "";
        return `- ${p.zone}: đến ${p.shelter}${by}, còn ${U.fmtInt(p.placed)} chỗ${rest}.`;
      }).join("\n");
    };

    out.call =
`${rec.issuer} → [NGƯỜI NHẬN], ${hm(rec.t)} ${dm(rec.t)}.
${rec.headline}
${g ? `Dự kiến tại ${g.name} khoảng ${hm(rec.arriveT != null ? rec.arriveT : rec.t)}, mực nước ~${stage} m, ${bdTxt}.` : ""}
${rec.action ? `Đề nghị: ${rec.action}` : ""}
Xin xác nhận đã nhận.`;

    out.smsParts = smsParts(unaccent(
`CANH BAO ${rec.areaShort || "HA DU"}: ${rec.headlineShort}. ${g ? `${g.name} ~${stage}m ${bdTxt}` : ""} tu ${hm(rec.startT != null ? rec.startT : rec.t)} ${dm(rec.t)}.` +
`${smsShelter}${rec.roadWarn ? ` ${rec.roadWarn}.` : ""} ${rec.issuerShort}`));
    out.sms = out.smsParts.join("\n");

    out.loudspeaker =
`Thông báo khẩn của ${rec.issuer}.
${rec.headline}
${g ? `Mực nước sông tại ${g.name} dự kiến ${stage} mét, ${bdTxt}, vào khoảng ${hm(rec.arriveT != null ? rec.arriveT : rec.t)}.` : ""}
${rec.areas && rec.areas.length ? `Các khu vực có khả năng ngập sâu: ${rec.areas.join(", ")}.` : ""}
Đề nghị bà con: kê cao tài sản; di chuyển người già, trẻ em, người bệnh theo hướng dẫn từng khu vực:
${rec.shelterPlan && rec.shelterPlan.length ? perZoneLoud() : `- ${shelterLine(true)}`}
${rec.roadWarn ? `${rec.roadWarn}.` : ""}
Xin nhắc lại…`;

    out.public =
`${L("Khu vực của bạn", "Your area")}: ${rec.areaShort || "-"}
${rec.publicWhen || rec.headline}
${rec.publicDepth ? `${L("Độ sâu dự kiến", "Expected depth")}: ${rec.publicDepth}` : ""}
${L("Việc cần làm", "What to do")}: ${rec.action || "-"}
${L("Nơi đến", "Where to go")}: ${shelterLine(false)}
${L("Nguồn tin", "Issued by")}: ${rec.issuer} · ${L("cập nhật tiếp", "next update")} ${hm(rec.t + 1)}
${L("Mức chắc chắn", "Confidence")}: ${rec.likelihood || "-"}`;

    out.cap = JSON.stringify({
      identifier: rec.id, sender: rec.issuerShort, sent: new Date().toISOString(),
      status: "Exercise", msgType: "Alert", scope: "Public", category: "Met",
      event: rec.event, urgency: rec.urgency || "Expected",
      severity: rec.severity || "Severe", certainty: rec.certainty || "Likely",
      headline: rec.headlineShort, description: rec.headline, instruction: rec.action,
      area: rec.areas || [], parameter: { gauge: g ? g.name : null, stage: rec.stage, alertLevel: rec.bdLevel },
      note: "SYNTHETIC - exercise only, not an operational alert",
    }, null, 1);

    return out;
  };

  /* ---------- build the record from live state ---------- */
  NF.buildRecord = function (type, snap) {
    const t = FT.state.timeH;
    const g = D.GAUGES.reduce((a, b) => (snap.gauges[b.id].alert > snap.gauges[a.id].alert ? b : a), D.GAUGES[0]);
    const gs = snap.gauges[g.id];
    const pkg = FT.ops && FT.ops._last;
    const worst = (FT.zones.sorted || []).filter((z) => z.status >= 2).slice(0, 4);
    const sum = FT.forecast ? FT.forecast.summary(t) : null;
    const firstClose = sum && sum.upcoming.length ? sum.upcoming[0] : null;
    /* Shelter guidance must match the capacity-aware allocation, and it must be PER ZONE and
       HONEST about capacity (founder decision 2026-07-27, warning-shelter-consistency.md).
       Each addressed zone gets ITS OWN allocation shelter — never one zone's shelter named for
       a different zone — and the message states how many fit versus how many must take vertical
       refuge. A zone the allocation places zero of is told refuge, not a shelter it cannot use.
       The old code named the first worst zone with any nearby shelter for the whole order; at a
       superstorm peak that told the headline zone (allocated zero) to go to another district's
       full school and said nothing of the tens of thousands with no place. See
       docs/plans/completed/shelter-capacity-allocation.md and warning-shelter-consistency.md. */
    const alloc = FT.forecast && FT.forecast.allocateShelters ? FT.forecast.allocateShelters(t) : null;
    const allocByZone = alloc ? Object.fromEntries(alloc.zones.map((z) => [z.zoneId, z])) : {};
    const shelterPlan = worst.map((z) => {
      const az = allocByZone[z.def.id];
      const primary = az && az.primary && az.primary.placed > 0 ? az.primary : null;
      return {
        zone: z.def.name,
        shelter: primary ? primary.name : null,
        placed: primary ? primary.placed : 0,
        unsheltered: az ? az.unsheltered : Math.round(z.exposed),
        departBy: primary && primary.route && primary.route.lastDeparture != null ? primary.route.lastDeparture : null,
      };
    });
    // The headline copy speaks for the highest-priority addressed zone, using ITS OWN placement.
    const headlinePlan = shelterPlan[0] || null;
    const pEx = FT.forecast ? FT.forecast.pExceedWindow(g.id, g.bd[2], t, Math.min(FT.hydro.T1, t + 12)) : 0;
    const likelihood = pEx > 0.8 ? L("rất có khả năng", "very likely") : pEx > 0.6 ? L("có khả năng", "likely")
      : pEx > 0.4 ? L("có thể", "possible") : pEx > 0.2 ? L("ít khả năng", "unlikely") : L("rất ít khả năng", "very unlikely");

    const base = {
      id: `NF-${FT.state.scenario}-${Math.round(t * 10)}-${type}`,
      type, t, gauge: g, stage: gs.stage, bdLevel: gs.alert || null,
      overBy: gs.alert ? gs.stage - g.bd[gs.alert - 1] : null,
      arriveT: t + 2,
      issuer: "Ban Chỉ huy PCTT&TKCN thành phố Đà Nẵng",
      issuerShort: "BCH PCTT TP Da Nang",
      areas: worst.map((z) => z.def.name),
      areaShort: worst.length ? worst[0].def.name : L("hạ du", "downstream"),
      shelter: headlinePlan ? headlinePlan.shelter : null,
      departBy: headlinePlan ? headlinePlan.departBy : null,
      shelterPlan,                        // per-zone capacity-aware guidance (name + fit + shortfall)
      roadWarn: firstClose ? L(`Tuyến ${firstClose.name} dự kiến đóng lúc ${hm(firstClose.at)}`, `${firstClose.name} expected to close at ${hm(firstClose.at)}`) : null,
      likelihood,
      publicDepth: worst.length ? `${U.fmt(worst[0].meanD, 1)}-${U.fmt(worst[0].maxD, 1)} m` : null,
      severity: gs.alert >= 3 ? "Severe" : gs.alert >= 2 ? "Moderate" : "Minor",
      certainty: pEx > 0.6 ? "Likely" : "Possible",
    };

    if (type === "release" && pkg && pkg.kind === "PROPOSAL") {
      Object.assign(base, {
        event: "Reservoir release increase",
        headline: L(`Hồ ${pkg.reservoir.name} sẽ tăng lưu lượng xả từ ${U.fmtInt(pkg.action.q0)} lên ${U.fmtInt(pkg.action.q1)} m³/s bắt đầu lúc ${hm(pkg.action.tStart)}.`,
                    `${pkg.reservoir.name} will increase release from ${U.fmtInt(pkg.action.q0)} to ${U.fmtInt(pkg.action.q1)} m³/s starting ${hm(pkg.action.tStart)}.`),
        headlineShort: L(`Hồ ${pkg.reservoir.name} tăng xả ${U.fmtInt(pkg.action.q1)} m³/s`, `${pkg.reservoir.name} release up to ${U.fmtInt(pkg.action.q1)} m³/s`),
        startT: pkg.action.tStart, arriveT: pkg.outcome.tPeak,
        stage: pkg.outcome.peak, gauge: pkg.gauge,
        action: L("Kê cao tài sản, đưa người và gia súc khỏi bãi bồi và lồng bè", "Raise belongings; move people and livestock off floodplains and fish cages"),
        urgency: "Expected",
        publicWhen: L(`Nước sông sẽ lên từ khoảng ${hm(pkg.action.tStart)}`, `The river will rise from about ${hm(pkg.action.tStart)}`),
      });
    } else if (type === "passthrough") {
      Object.assign(base, {
        event: "Reservoir buffer exhausted",
        headline: L("Hồ chứa đã hết dung tích cắt lũ - lượng xả xấp xỉ lượng nước về. Từ thời điểm này hồ KHÔNG còn làm giảm lũ.",
                    "The reservoir's flood buffer is exhausted - outflow now approximately equals inflow. From now the reservoir does NOT reduce the flood."),
        headlineShort: L("Hồ hết dung tích cắt lũ", "Reservoir buffer exhausted"),
        action: L("Sơ tán theo phương án đã duyệt", "Evacuate per the approved plan"),
        urgency: "Immediate",
      });
    } else if (type === "evacuation") {
      Object.assign(base, {
        event: "Evacuation order",
        headline: L(`Lệnh sơ tán các khu vực: ${base.areas.join(", ") || "hạ du"}.`, `Evacuation ordered for: ${base.areas.join(", ") || "downstream areas"}.`),
        headlineShort: L("Lệnh sơ tán", "Evacuation order"),
        action: L("Di chuyển ngay đến điểm sơ tán; mang theo giấy tờ và thuốc men", "Move to the shelter now; take documents and medicine"),
        urgency: "Immediate", severity: "Extreme",
      });
    } else {
      Object.assign(base, {
        event: "River flood alert",
        headline: L(`${g.name} đạt ${U.fmt(gs.stage, 2)} m, ${base.bdLevel ? `trên BĐ${base.bdLevel}` : "đang lên"}.`,
                    `${g.name} at ${U.fmt(gs.stage, 2)} m, ${base.bdLevel ? `above AL${base.bdLevel}` : "rising"}.`),
        headlineShort: L(`${g.name} ${U.fmt(gs.stage, 1)}m`, `${g.name} ${U.fmt(gs.stage, 1)}m`),
        action: L("Theo dõi thông báo, chuẩn bị di dời tài sản", "Monitor updates, prepare to move belongings"),
        urgency: "Expected",
        publicWhen: L(`Nước đang lên tại ${g.name}`, `Water is rising at ${g.name}`),
      });
    }
    /* CONSISTENCY GUARD — the alert level and the exceedance must be derived from the very
       gauge and stage the message quotes. A release record overrides both (it reports the
       forecast peak at the control point, not the currently worst gauge), and re-deriving
       here is what stops the message reading "10.23 m, above AL1 by 0.03 m" when 10.23 m at
       that station is above AL3. Contradictory numbers in a warning are not a cosmetic bug.
       docs/03-operations/03-communication-protocols.md — one record, one set of numbers. */
    if (base.gauge && base.stage != null) {
      const gg = base.gauge, s = base.stage;
      base.bdLevel = s >= gg.bd[2] ? 3 : s >= gg.bd[1] ? 2 : s >= gg.bd[0] ? 1 : null;
      base.overBy = base.bdLevel ? s - gg.bd[base.bdLevel - 1] : null;
      base.severity = base.bdLevel >= 3 ? "Severe" : base.bdLevel >= 2 ? "Moderate" : "Minor";
    } else { base.bdLevel = null; base.overBy = null; }

    base.recipients = (MATRIX[type] || MATRIX.threshold).map((r) => ({ key: r, ...RECIPIENTS[r] }));
    base.channels = NF.render(base);
    return base;
  };

  /* ---------- sandbox dispatch: records what WOULD be sent, never sends ---------- */
  NF.dispatch = function (rec, actor) {
    const entry = {
      id: rec.id, type: rec.type, t: rec.t, sentAt: new Date().toISOString(),
      actor: actor || "unattributed",
      recipients: rec.recipients.map((r) => ({
        key: r.key, name: r.name, channels: r.channels,
        delivered: true,                       // sandbox: transport always accepts
        acked: false, ackAt: null,
      })),
      record: rec,
    };
    NF.sent.unshift(entry);
    if (NF.sent.length > 30) NF.sent.length = 30;
    FT.ops && FT.ops.audit.log("notify.dispatch", {
      id: rec.id, type: rec.type, recipients: entry.recipients.length,
      channels: Object.keys(rec.channels).join(","), sandbox: true,
    }, rec.headlineShort);
    FT.bus.emit("notifySent", entry);
    return entry;
  };
  NF.ack = function (entryId, recipientKey, who) {
    const e = NF.sent.find((x) => x.id === entryId);
    if (!e) return;
    const r = e.recipients.find((x) => x.key === recipientKey);
    if (!r || r.acked) return;
    r.acked = true; r.ackAt = new Date().toISOString(); r.ackBy = who || "unattributed";
    FT.ops && FT.ops.audit.log("notify.ack", { id: entryId, recipient: recipientKey }, `acknowledged by ${r.ackBy}`);
    FT.bus.emit("notifySent", e);
  };
  NF.ackRate = function () {
    let tot = 0, ok = 0;
    for (const e of NF.sent) for (const r of e.recipients) { tot++; if (r.acked) ok++; }
    return tot ? ok / tot : 1;
  };
  NF.MATRIX = MATRIX;
  NF.RECIPIENTS = RECIPIENTS;
})();
