/* FloodTwin Q1 Demo — zones: multi-area operator watchlist
   Per zone: live max/mean flood depth from the SWE grid, exposed population,
   rescue-access route to the EOC over the live road network, trend, POI status,
   recommended actions, depth history for the detail sparkline.
   Status: 0 an toàn · 1 theo dõi · 2 nguy cơ · 3 khẩn cấp. */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, D = FT.data;

  const Z = (FT.zones = { list: [], ready: false });
  let W, statClock = 0, lastLogT = {};

  /* status from AREA-WIDE severity: mean depth + FRACTION of the zone's population exposed */
  const STATUS_FROM = (meanD, frac) => (meanD >= 0.45 || frac >= 0.25 ? 3 : meanD >= 0.2 || frac >= 0.08 ? 2 : meanD >= 0.05 || frac >= 0.02 ? 1 : 0);

  function cellsOf(z) {
    const N = W.N, out = [];
    const i0 = W.km2i(z.x - z.r), i1 = W.km2i(z.x + z.r);
    const j0 = W.km2i(z.y - z.r), j1 = W.km2i(z.y + z.r);
    for (let iy = j0; iy <= j1; iy++) {
      for (let ix = i0; ix <= i1; ix++) {
        const cx = W.ix2km(ix), cy = W.ix2km(iy);
        if (Math.hypot(cx - z.x, cy - z.y) <= z.r) {
          const k = iy * N + ix;
          if (!W.sea[k] && W.riverDist[k] > 0.28) out.push(k);   // exclude the channel itself
        }
      }
    }
    return out;
  }

  Z.init = function () {
    W = FT.world;
    Z.list = D.ZONES.map((z) => ({
      def: z,
      cells: cellsOf(z),
      maxD: 0, meanD: 0, exposed: 0, status: 0, prevStatus: 0,
      trend: 0, accessMin: 0, accessOk: true,
      hist: [],                                    // [tH, maxD] capped
      pois: z.pois.map((p) => ({ ...p, depth: 0, ok: true })),
      actions: [],
    }));
    Z.ready = true;
    Z.stepStats(true);
  };

  /* actions synthesised from the zone's current problem state — the demo's
     explicit "detect → assess → decide" chain for each location */
  function buildActions(zs) {
    const vi = FT.state.lang === "vi";
    const a = [];
    if (zs.status >= 2 && zs.trend > 0.03 && zs.def.pop > 20000)
      a.push(vi ? "Phát lệnh sơ tán chủ động các hộ ven sông, ưu tiên người già/trẻ em" : "Issue pre-emptive evacuation for riverside households, prioritise elderly/children");
    if (zs.status >= 2 && !zs.accessOk)
      a.push(vi ? "Mất tuyến tiếp cận EOC — điều phối xuồng/phương tiện cao, lập điểm tập kết tạm" : "EOC access lost — deploy boats/high-clearance vehicles, set temporary muster point");
    for (const p of zs.pois) {
      if (!p.ok && p.t === "bridge") a.push(vi ? `Đóng ${p.n}, phân luồng từ xa` : `Close ${p.n}, divert traffic upstream`);
      if (!p.ok && p.t === "hosp") a.push(vi ? `${p.n} ngập tiếp cận — kích hoạt chuyển tuyến bệnh nhân` : `${p.n} access flooded — activate patient transfer`);
      if (!p.ok && p.t === "school") a.push(vi ? `Cho học sinh nghỉ, trưng dụng ${p.n} tầng cao làm điểm trú` : `Close school; use upper floors of ${p.n} as refuge`);
      if (!p.ok && p.t === "herit") a.push(vi ? `Kích hoạt phương án bảo vệ di sản tại ${p.n}` : `Activate heritage-protection plan at ${p.n}`);
    }
    if (zs.status >= 1 && zs.trend < -0.03)
      a.push(vi ? "Nước rút — kiểm tra kết cấu/vệ sinh trước khi cho dân quay lại" : "Receding — inspect structures/sanitation before return");
    if (zs.status >= 3)
      a.push(vi ? "Báo cáo Ban chỉ huy PCTT tỉnh, đề nghị chi viện" : "Report to provincial flood command, request reinforcement");
    return a.slice(0, 4);
  }

  Z.stepStats = function (force) {
    if (!Z.ready) return;
    for (const zs of Z.list) {
      let maxD = 0, sum = 0, expo = 0;
      const cap = W.floodCap;
      for (const k of zs.cells) {
        const h = Math.min(cap, Math.max(0, W.h[k] - W.hBase[k])); // flood = excess above normal rivers
        if (h > maxD) maxD = h;
        sum += h;
        if (h > 0.45) expo += W.pop[k];                            // people count from significant depth
      }
      const prevMax = zs.maxD;
      zs.maxD = maxD;
      zs.meanD = zs.cells.length ? sum / zs.cells.length : 0;
      zs.exposed = Math.round(expo * 14);
      zs.trend = force ? 0 : maxD - prevMax;
      /* access to EOC over live network (the EOC's own zone is trivially connected) */
      if (zs.def.node === D.EOC_NODE) { zs.accessOk = true; zs.accessMin = 0; }
      else if (FT.traffic.findRoute) {
        const r = FT.traffic.findRoute(zs.def.node, D.EOC_NODE);
        zs.accessOk = !!r;
        zs.accessMin = r ? Math.round(r.timeH * 60) : -1;
      }
      /* POIs */
      for (const p of zs.pois) { p.depth = W.sampleDepth(p.x, p.y); p.ok = p.depth < 0.15; }
      zs.prevStatus = zs.status;
      zs.status = STATUS_FROM(zs.meanD, zs.exposed / Math.max(1, zs.def.pop));
      if (!zs.accessOk && zs.status < 2) zs.status = 2;
      zs.actions = buildActions(zs);
      /* history for sparkline (sim-time indexed) */
      const t = FT.state.timeH;
      const H = zs.hist;
      if (!H.length || t - H[H.length - 1][0] > 0.2 || t < H[H.length - 1][0]) {
        if (H.length && t < H[H.length - 1][0]) H.length = 0;      // scrubbed backwards
        H.push([t, maxD]);
        if (H.length > 260) H.shift();
      }
      /* log transitions (throttled per zone) */
      if (!force && zs.status !== zs.prevStatus) {
        const key = zs.def.id;
        if ((lastLogT[key] === undefined || Math.abs(t - lastLogT[key]) > 0.5)) {
          lastLogT[key] = t;
          if (zs.status > zs.prevStatus && zs.status >= 2) {
            FT.log(`${zs.def.name} — ${FT.i18n.t(zs.status >= 3 ? "zone.toRed" : "zone.toOrange")} (${U.fmt(maxD, 1)} m)`, zs.status >= 3 ? "danger" : "warn");
            if (zs.status >= 3) FT.notify(`${zs.def.name}: ${FT.i18n.t("zone.toRed")}`, "danger");
          } else if (zs.status < zs.prevStatus && zs.status <= 1) {
            FT.log(`${zs.def.name} — ${FT.i18n.t("zone.improved")}`, "ok");
          }
        }
      }
    }
    Z.sorted = Z.list.slice().sort((a, b) => (b.status - a.status) || (b.meanD - a.meanD) || (b.maxD - a.maxD));
  };

  Z.step = function (dtReal) {
    statClock += dtReal;
    if (statClock > 0.5) { statClock = 0; Z.stepStats(false); }
  };

  Z.byId = (id) => Z.list.find((z) => z.def.id === id);
  Z.worst = (n) => (Z.sorted || []).slice(0, n || 2).filter((z) => z.status >= 2);
  Z.counts = function () {
    let red = 0, orange = 0;
    for (const z of Z.list) { if (z.status >= 3) red++; else if (z.status === 2) orange++; }
    return { red, orange };
  };
})();
