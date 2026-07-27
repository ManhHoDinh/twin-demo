/* FloodTwin — domain state machines + event engine
   Constitution: "everything has a lifecycle" · "every object emits events" ·
                 "time is a first-class citizen" · "every action has consequences".

   Two hard design rules, both inherited from what already works in this codebase:

   1. STATE IS A PURE FUNCTION OF (entity, t). Nothing is accumulated frame-by-frame, so
      scrubbing backwards produces exactly the same states as scrubbing forwards. The
      existing engine is deterministic and scrub-safe (DATA_AND_METHODS §3) and this layer
      must not be the thing that breaks it.
   2. THE EVENT TIMELINE IS DERIVED, NOT COLLECTED. On every rebuild the whole T−24→T+48
      window is walked once and transitions are emitted as events. Replaying an event
      therefore reproduces the identical event list — which is what makes the post-event
      reconstruction in docs/03-operations WF-12 possible at all.

   User actions (approve, acknowledge, dispatch) are the exception: they are real events in
   wall-clock order and are appended to the audit trail, not to this derived timeline. */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, D = FT.data;
  const D_ = (FT.domain = { events: [], ready: false });
  const vi = () => FT.state.lang === "vi";
  const L = (v, e) => (vi() ? v : e);

  /* ================================================================
     STATE MACHINES — explicit states and the transitions the domain allows
     ================================================================ */

  /* Reservoir lifecycle (docs/00-foundations/04-reservoir-operations.md §8) */
  const RES_STATES = {
    NORMAL: { vi: "Vận hành bình thường", en: "Normal generation", sev: 0 },
    MONITORING: { vi: "Theo dõi lũ", en: "Flood watch", sev: 1 },
    FLOOD_CONTROL: { vi: "Cắt lũ (tích nước)", en: "Flood absorption", sev: 2 },
    CONTROLLED_RELEASE: { vi: "Xả điều tiết", en: "Controlled release", sev: 2 },
    PASS_THROUGH: { vi: "Xả ngang lũ về", en: "Pass-through", sev: 3 },
    EMERGENCY_RELEASE: { vi: "XẢ KHẨN CẤP", en: "EMERGENCY RELEASE", sev: 4 },
    RECOVERY: { vi: "Hạ về trần đón lũ", en: "Recovery drawdown", sev: 1 },
  };
  /* allowed transitions — a jump outside this graph is a modelling error, not a state */
  /* Multi-pulse events (oct2020 has four) mean a reservoir can genuinely fall BACK from
     pass-through into absorbing a later pulse once its level drops below the ceiling, and
     can de-escalate from emergency release to controlled release as the level recedes.
     The first version of this graph forbade both; the timeline scan flagged them as illegal
     transitions, which was a defect in the graph rather than in the physics. */
  const RES_TRANSITIONS = {
    NORMAL: ["MONITORING", "CONTROLLED_RELEASE", "EMERGENCY_RELEASE"],
    MONITORING: ["NORMAL", "FLOOD_CONTROL", "CONTROLLED_RELEASE", "PASS_THROUGH", "EMERGENCY_RELEASE", "RECOVERY"],
    FLOOD_CONTROL: ["MONITORING", "CONTROLLED_RELEASE", "PASS_THROUGH", "EMERGENCY_RELEASE", "RECOVERY"],
    CONTROLLED_RELEASE: ["MONITORING", "FLOOD_CONTROL", "PASS_THROUGH", "EMERGENCY_RELEASE", "RECOVERY"],
    PASS_THROUGH: ["FLOOD_CONTROL", "CONTROLLED_RELEASE", "EMERGENCY_RELEASE", "RECOVERY", "MONITORING"],
    EMERGENCY_RELEASE: ["PASS_THROUGH", "CONTROLLED_RELEASE", "FLOOD_CONTROL", "RECOVERY"],
    RECOVERY: ["NORMAL", "MONITORING", "FLOOD_CONTROL", "CONTROLLED_RELEASE"],
  };
  D_.RES_STATES = RES_STATES;
  D_.RES_TRANSITIONS = RES_TRANSITIONS;

  /* pure: reservoir state at time t under the active policy */
  D_.reservoirState = function (r, t) {
    const H = FT.hydro;
    if (!H.ready) return "NORMAL";
    const pk = H._activeKey(), R = H.res[r.id][pk];
    const Z = H.sample(R.Z, t), I = H.sample(R.I, t), O = H.sample(R.O, t);
    const S = H.sample(R.S, t);
    const sCeil = r.deadM + (r.capM - r.deadM) * U.clamp((r.ceil - r.dead) / (r.fsl - r.dead), 0, 1.1);
    const spilling = O > r.turbine * 1.15;
    const rising = I > O * 1.05;

    if (r.zDesign != null && Z > r.zDesign) return "EMERGENCY_RELEASE";
    if (Z > r.fsl) return "EMERGENCY_RELEASE";
    /* buffer gone: outflow tracks inflow — the reservoir is now a river */
    if (S >= sCeil - 0.5 && spilling && Math.abs(I - O) < Math.max(60, I * 0.15)) return "PASS_THROUGH";
    if (spilling && rising) return "FLOOD_CONTROL";
    if (spilling) return "CONTROLLED_RELEASE";
    if (Z > r.ceil + 0.05 && !rising) return "RECOVERY";
    if (rising || I > r.turbine * 2) return "MONITORING";
    return "NORMAL";
  };

  /* Gauge lifecycle — the statutory ladder, plus a receding state */
  const GAUGE_STATES = {
    NORMAL: { vi: "Bình thường", en: "Normal", sev: 0 },
    BD1: { vi: "Trên BĐ1", en: "Above AL1", sev: 1 },
    BD2: { vi: "Trên BĐ2", en: "Above AL2", sev: 2 },
    BD3: { vi: "Trên BĐ3", en: "Above AL3", sev: 3 },
    RECEDING: { vi: "Đang rút", en: "Receding", sev: 1 },
  };
  D_.GAUGE_STATES = GAUGE_STATES;
  D_.gaugeState = function (g, t) {
    const H = FT.hydro;
    if (!H.ready) return "NORMAL";
    const med = H.gauge[g.id][H._activeKey()].med;
    const s = H.sample(med, t), s1 = H.sample(med, Math.min(H.T1, t + 1));
    const lv = s >= g.bd[2] ? 3 : s >= g.bd[1] ? 2 : s >= g.bd[0] ? 1 : 0;
    if (lv === 0) return "NORMAL";
    if (lv === 1 && s1 < s - 0.02) return "RECEDING";
    return ["NORMAL", "BD1", "BD2", "BD3"][lv];
  };

  /* Road lifecycle — from the forecast closure model, so it is knowable ahead of time */
  const ROAD_STATES = {
    OPEN: { vi: "Thông suốt", en: "Open", sev: 0 },
    RESTRICTED: { vi: "Hạn chế", en: "Restricted", sev: 1 },
    CLOSED: { vi: "ĐÓNG", en: "CLOSED", sev: 3 },
  };
  D_.ROAD_STATES = ROAD_STATES;
  D_.roadState = function (e, t) {
    if (!FT.forecast) return "OPEN";
    const c = FT.forecast.edgeClsAt(e, t);
    return c >= 3 ? "CLOSED" : c >= 2 ? "RESTRICTED" : "OPEN";
  };

  /* Zone lifecycle */
  const ZONE_STATES = {
    NORMAL: { vi: "An toàn", en: "Normal", sev: 0 },
    WATCH: { vi: "Theo dõi", en: "Watch", sev: 1 },
    WARNING: { vi: "Nguy cơ", en: "Warning", sev: 2 },
    CRITICAL: { vi: "KHẨN CẤP", en: "Critical", sev: 3 },
    ISOLATED: { vi: "CÔ LẬP", en: "Isolated", sev: 4 },
  };
  D_.ZONE_STATES = ZONE_STATES;

  /* ================================================================
     EVENT ENGINE
     ================================================================ */
  const EV = {
    RAIN_PEAK: { icon: "🌧", sev: 1 },
    WETNESS_SATURATED: { icon: "💧", sev: 2 },
    RES_STATE: { icon: "🛢", sev: 2 },
    BUFFER_EXHAUSTED: { icon: "⚠", sev: 3 },
    GAUGE_STATE: { icon: "📈", sev: 2 },
    ROAD_CLOSED: { icon: "🚧", sev: 2 },
    ROAD_REOPENED: { icon: "🛣", sev: 0 },
    ZONE_ISOLATED: { icon: "🏝", sev: 3 },
    ZONE_RECONNECTED: { icon: "🔗", sev: 0 },
    SHELTER_LOST: { icon: "🏚", sev: 3 },
  };
  D_.EV = EV;

  function push(list, tH, type, subject, title, detail, extra) {
    list.push(Object.assign({
      tH, type, subject, title, detail,
      icon: (EV[type] || {}).icon || "•",
      sev: (EV[type] || {}).sev || 1,
    }, extra || {}));
  }

  /* ---------- derive the whole timeline (deterministic, scrub-safe) ---------- */
  D_.rebuildTimeline = function () {
    const H = FT.hydro;
    if (!H.ready) return;
    const list = [];
    const DTF = 0.25;                      // fine step: reservoirs and gauges (precomputed arrays)
    const DTC = 1.0;                       // coarse step: anything needing a graph search

    /* rainfall peak + the moment each upper catchment saturates */
    let ri = 0;
    for (let i = 1; i < H.NT; i++) if (H.rain[i] > H.rain[ri]) ri = i;
    if (H.rain[ri] > 12) {
      push(list, H.T0 + ri * H.DT, "RAIN_PEAK", "basin",
        L(`Đỉnh mưa lưu vực ${Math.round(H.rain[ri])} mm/h`, `Basin rainfall peak ${Math.round(H.rain[ri])} mm/h`),
        L("Thời điểm cường độ mưa lớn nhất của kịch bản", "Peak rainfall intensity of the scenario"));
    }
    if (H.sub) {
      for (const sc of D.SUBCATCH) {
        const S = H.sub[sc.id];
        if (!S) continue;
        for (let i = 1; i < H.NT; i++) {
          if (H.satOf(S.api[i - 1]) < 0.9 && H.satOf(S.api[i]) >= 0.9) {
            push(list, H.T0 + i * H.DT, "WETNESS_SATURATED", sc.id,
              L(`${sc.name}: đất bão hòa`, `${sc.name}: soil saturated`),
              L("Từ đây gần như toàn bộ lượng mưa thành dòng chảy — phản ứng lũ nhanh hơn nhiều.",
                "From here almost all rainfall becomes runoff — the flood response is far faster."));
            break;
          }
        }
      }
    }

    /* reservoirs: state transitions + buffer exhaustion */
    for (const r of D.RESERVOIRS) {
      let prev = null;
      for (let t = H.T0; t <= H.T1 + 1e-9; t += DTF) {
        const st = D_.reservoirState(r, t);
        if (prev && st !== prev) {
          const legal = (RES_TRANSITIONS[prev] || []).includes(st);
          push(list, t, "RES_STATE", r.id,
            `${r.name}: ${vi() ? RES_STATES[st].vi : RES_STATES[st].en}`,
            L(`Chuyển từ “${RES_STATES[prev].vi}”`, `Transition from “${RES_STATES[prev].en}”`),
            { from: prev, to: st, sev: RES_STATES[st].sev, illegal: !legal });
          if (st === "PASS_THROUGH") {
            push(list, t, "BUFFER_EXHAUSTED", r.id,
              L(`${r.name} hết dung tích cắt lũ`, `${r.name} flood buffer exhausted`),
              L("Lượng xả ≈ lượng về. Từ thời điểm này hồ KHÔNG còn làm giảm lũ hạ du.",
                "Outflow ≈ inflow. From now the reservoir does NOT reduce the downstream flood."));
          }
        }
        prev = st;
      }
    }

    /* gauges */
    for (const g of D.GAUGES) {
      let prev = null;
      for (let t = H.T0; t <= H.T1 + 1e-9; t += DTF) {
        const st = D_.gaugeState(g, t);
        if (prev && st !== prev && !(prev === "NORMAL" && st === "RECEDING")) {
          push(list, t, "GAUGE_STATE", g.id,
            `${g.name}: ${vi() ? GAUGE_STATES[st].vi : GAUGE_STATES[st].en}`,
            L(`Chuyển từ “${GAUGE_STATES[prev].vi}”`, `Transition from “${GAUGE_STATES[prev].en}”`),
            { from: prev, to: st, sev: GAUGE_STATES[st].sev });
        }
        prev = st;
      }
    }

    /* roads — knowable ahead because closure is a lookup, not a simulation */
    if (FT.forecast && FT.world && FT.world.ready) {
      for (const e of FT.world.roads.edges) {
        if (!e.fc) continue;
        let prev = null;
        for (let t = H.T0; t <= H.T1 + 1e-9; t += DTC) {
          const st = D_.roadState(e, t);
          if (prev && st !== prev) {
            if (st === "CLOSED") {
              push(list, t, "ROAD_CLOSED", e.name, L(`${e.name} đóng`, `${e.name} closed`),
                L("Ngập ≥30 cm — xe không qua được", "Water ≥30 cm — impassable to vehicles"),
                { lifeline: e.type === "hw" });
            } else if (prev === "CLOSED") {
              push(list, t, "ROAD_REOPENED", e.name, L(`${e.name} thông trở lại`, `${e.name} reopened`),
                L("Kiểm tra kết cấu trước khi cho lưu thông bình thường", "Inspect the structure before restoring normal traffic"));
            }
          }
          prev = st;
        }
      }

      /* zones: isolation is a graph property, so it is evaluated on the coarse step */
      for (const z of D.ZONES) {
        let prev = null;
        for (let t = H.T0; t <= H.T1 + 1e-9; t += DTC) {
          const iso = FT.forecast.zoneIsolationAt(z.node, t);
          if (prev !== null && iso !== prev) {
            if (iso) {
              push(list, t, "ZONE_ISOLATED", z.id, L(`${z.name} bị cô lập`, `${z.name} isolated`),
                L("Mất toàn bộ tuyến đường bộ — cần phương tiện thuỷ/trực thăng",
                  "All road access lost — boat or air access required"));
            } else {
              push(list, t, "ZONE_RECONNECTED", z.id, L(`${z.name} thông tuyến trở lại`, `${z.name} reconnected`),
                L("Đã có tuyến đường bộ tiếp cận", "A road route is available again"));
            }
          }
          prev = iso;
        }
      }

      /* shelters becoming unusable — the planning assumption that fails silently */
      for (const sh of (D.SHELTERS || [])) {
        let prev = null;
        for (let t = H.T0; t <= H.T1 + 1e-9; t += DTC) {
          const st = FT.forecast.shelterState(sh, t);
          const bad = !st.valid;
          if (prev === false && bad) {
            push(list, t, "SHELTER_LOST", sh.id, L(`${sh.name} không còn dùng được`, `${sh.name} no longer usable`),
              L("Ngập quá tầng trú — phải phân bổ lại người sơ tán", "Refuge level submerged — evacuees must be reallocated"));
          }
          prev = bad;
        }
      }
    }

    list.sort((a, b) => a.tH - b.tH);
    D_.events = list;
    D_.ready = true;
    FT.bus.emit("domainTimeline", list.length);
    return list;
  };

  /* ---------- queries ---------- */
  D_.between = (t0, t1) => D_.events.filter((e) => e.tH > t0 && e.tH <= t1);
  D_.upcoming = (t, n) => D_.events.filter((e) => e.tH > t).slice(0, n || 6);
  D_.past = (t, n) => D_.events.filter((e) => e.tH <= t).slice(-(n || 8)).reverse();
  D_.illegalTransitions = () => D_.events.filter((e) => e.illegal);

  /* current state snapshot of every object — used by the reports and the state panel */
  D_.snapshotStates = function (t) {
    const out = { reservoirs: {}, gauges: {}, zones: {}, roadsClosed: 0, roadsRestricted: 0 };
    for (const r of D.RESERVOIRS) out.reservoirs[r.id] = D_.reservoirState(r, t);
    for (const g of D.GAUGES) out.gauges[g.id] = D_.gaugeState(g, t);
    if (FT.zones && FT.zones.ready) {
      for (const z of FT.zones.list) {
        out.zones[z.def.id] = z.isolated ? "ISOLATED"
          : z.status >= 3 ? "CRITICAL" : z.status === 2 ? "WARNING" : z.status === 1 ? "WATCH" : "NORMAL";
      }
    }
    if (FT.world && FT.world.ready) {
      for (const e of FT.world.roads.edges) {
        const s = D_.roadState(e, t);
        if (s === "CLOSED") out.roadsClosed++; else if (s === "RESTRICTED") out.roadsRestricted++;
      }
    }
    return out;
  };

  /* The derived timeline is deterministic GIVEN the road-closure calibration, and that
     calibration converges as the SWE field settles — during boot the event count climbs
     (77 → 94 → 112 → 120) before stabilising. So the timeline is marked stale whenever the
     forcing or the settled state changes, and re-derived (throttled) rather than trusted
     forever. Post-event reconstruction must always reflect the field currently on screen;
     a timeline that disagreed with the road colours would be the same inconsistency the
     calibration exists to prevent. */
  FT.bus.on("hydroRebuilt", () => { D_.ready = false; });
  FT.bus.on("scrubbed", () => { D_.stale = true; });
})();
