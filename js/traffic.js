/* FloodTwin Q1 Demo — traffic: vehicle agents on the road graph
   Dijkstra shortest-time routing; edges slow with water depth and close at ≥30 cm
   (He et al. 2026 road-functionality framing). Deterministic across reloads. */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, D = FT.data;

  const SLOW = [1, 0.6, 0.3, 0];                 // speed factor per passability class
  const N_VEH = 130;
  const TYPES = [
    { id: "moto", w: 0.42, spd: 1.15 },
    { id: "car", w: 0.34, spd: 1.0 },
    { id: "truck", w: 0.14, spd: 0.8 },
    { id: "bus", w: 0.10, spd: 0.85 },
  ];

  let rng, hubs = [], hubCum = [], hubTotal = 0;
  let prevCls = null, rerouteQueue = [], lastRerouteToastT = -1e9;
  const statsCache = { count: 0, openPct: 100, closed: 0, rerouted: 0, etaMin: -1, closures: [] };

  const T = (FT.traffic = { vehicles: [] });

  /* ---------- routing ---------- */
  function edgeCost(e, allowClosed) {
    if (e.cls >= 3) return allowClosed ? e.len / (e.speed * 0.05) : Infinity;
    return e.len / (e.speed * SLOW[e.cls]);
  }
  function otherNode(e, id) { return e.a === id ? e.b : e.a; }

  /* Dijkstra over node ids; returns {edges:[...], timeH} or null */
  function route(from, to) {
    if (from === to) return null;
    const R = FT.world.roads;
    const dist = {}, prev = {}, done = {};
    const Q = [[0, from]];
    dist[from] = 0;
    while (Q.length) {
      let bi = 0;
      for (let i = 1; i < Q.length; i++) if (Q[i][0] < Q[bi][0]) bi = i;
      const [d, n] = Q.splice(bi, 1)[0];
      if (done[n]) continue;
      done[n] = 1;
      if (n === to) break;
      for (const e of R.neighbors[n]) {
        const c = edgeCost(e, false);
        if (!isFinite(c)) continue;
        const m = otherNode(e, n), nd = d + c;
        if (dist[m] === undefined || nd < dist[m]) { dist[m] = nd; prev[m] = { n, e }; Q.push([nd, m]); }
      }
    }
    if (dist[to] === undefined) return null;
    const edges = [];
    let cur = to;
    while (cur !== from) { const p = prev[cur]; edges.unshift({ e: p.e, from: p.n }); cur = p.n; }
    return { edges, timeH: dist[to] };
  }

  function pickHub(exclude) {
    for (let tries = 0; tries < 8; tries++) {
      const x = rng() * hubTotal;
      let acc = 0;
      for (let i = 0; i < hubs.length; i++) { acc += hubs[i].w; if (x < acc) { if (hubs[i].node !== exclude) return hubs[i].node; break; } }
    }
    return hubs[(rng() * hubs.length) | 0].node;
  }
  function pickType() {
    const x = rng();
    let acc = 0;
    for (const t of TYPES) { acc += t.w; if (x < acc) return t; }
    return TYPES[1];
  }

  /* ---------- vehicles ---------- */
  function spawn(v) {
    const R = FT.world.roads;
    for (let tries = 0; tries < 6; tries++) {
      const from = pickHub(null), to = pickHub(from);
      const r = route(from, to);
      if (r && r.edges.length) {
        const type = pickType();
        v.from = from; v.to = to; v.route = r.edges; v.leg = 0; v.progress = 0;
        v.type = type.id; v.spdF = type.spd * (0.85 + rng() * 0.3);
        v.state = "moving"; v.rerouted = false;
        const n = R.nodes[from];
        v.x = n.x; v.y = n.y; v.heading = 0;
        return true;
      }
    }
    v.state = "blocked"; v.route = null;
    return false;
  }

  T.init = function () {
    rng = U.mulberry(1234);
    hubs = D.TRAFFIC_HUBS.slice();
    hubTotal = hubs.reduce((s, h) => s + h.w, 0);
    T.vehicles = [];
    for (let i = 0; i < N_VEH; i++) {
      const v = { id: i };
      spawn(v);
      // scatter along their first edge so traffic starts distributed
      if (v.route) v.progress = rng();
      T.vehicles.push(v);
    }
    prevCls = FT.world.roads.edges.map((e) => e.cls);
    updateStats();
  };

  function currentEdge(v) { return v.route && v.leg < v.route.length ? v.route[v.leg] : null; }

  function advance(v, simDt) {
    const R = FT.world.roads;
    let guard = 4;
    let leg = currentEdge(v);
    if (!leg) { spawn(v); return; }
    let remH = (simDt / 3600);
    while (remH > 0 && guard-- > 0) {
      const e = leg.e;
      if (e.cls >= 3) {                                   // edge became impassable under the wheels → back to node & reroute
        v.state = "rerouting";
        if (!v._queued) { v._queued = true; rerouteQueue.push(v); }
        return;
      }
      const sp = e.speed * SLOW[e.cls] * v.spdF;          // km/h
      const legLenH = e.len / Math.max(5, sp);
      const dProg = remH / legLenH;
      v.progress += dProg;
      if (v.progress >= 1) {
        remH = (v.progress - 1) * legLenH;
        v.progress = 0; v.leg++;
        leg = currentEdge(v);
        if (!leg) { spawn(v); return; }
        // peek: next edge closed? request reroute at the node
        if (leg.e.cls >= 3) { v.state = "rerouting"; if (!v._queued) { v._queued = true; rerouteQueue.push(v); } return; }
      } else remH = 0;
    }
    // position along edge (follows the real polyline alignment)
    const e = leg.e, A = R.nodes[leg.from], B = R.nodes[otherNode(e, leg.from)];
    const t = v.progress;
    const [nx, ny] = FT.world.roadPoint(e, leg.from, t);
    const tgtHeading = Math.atan2(ny - v.y || B.y - A.y, nx - v.x || B.x - A.x);
    v.x = nx; v.y = ny;
    let dh = tgtHeading - v.heading;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    v.heading += dh * 0.5;
    v.state = e.cls >= 2 ? "rerouting" : "moving";        // visual: crawling through risk zone shows orange
    if (e.cls < 2) v.state = "moving";
  }

  function tryReroute(v) {
    v._queued = false;
    const R = FT.world.roads;
    const leg = currentEdge(v);
    const at = leg ? leg.from : v.from;
    if (!at || !R.nodes[at]) { spawn(v); return; }
    const r = route(at, v.to);
    if (r && r.edges.length) {
      v.route = r.edges; v.leg = 0; v.progress = 0;
      v.state = "moving"; v.rerouted = true;
      const n = R.nodes[at]; v.x = n.x; v.y = n.y;
    } else {
      v.state = "blocked";                                 // wait for waters to recede
    }
  }

  /* ---------- edge class transitions → events ---------- */
  function scanTransitions() {
    const edges = FT.world.roads.edges;
    let newlyClosed = 0;
    for (let i = 0; i < edges.length; i++) {
      const c = edges[i].cls, p = prevCls[i];
      if (c !== p) {
        if (c >= 3 && p < 3) { FT.log(`${edges[i].name} — ${FT.i18n.t("ev.roadClosed")}`, "danger"); newlyClosed++; }
        else if (p >= 3 && c < 3) FT.log(`${edges[i].name} — ${FT.i18n.t("ev.roadOpen")}`, "ok");
        prevCls[i] = c;
      }
    }
    if (newlyClosed > 0) {
      // blocked vehicles get another chance; passing vehicles will detect on entry
      for (const v of T.vehicles) if (v.state === "blocked" && !v._queued) { v._queued = true; rerouteQueue.push(v); }
      if (FT.state.timeH - lastRerouteToastT > 2) {
        lastRerouteToastT = FT.state.timeH;
        FT.notify(FT.i18n.t("toast.reroute"), "warn");
      }
    }
  }

  /* ---------- stats ---------- */
  let statClock = 0;
  function updateStats() {
    const edges = FT.world.roads.edges;
    let totalLen = 0, openLen = 0, closed = 0;
    const closures = [];
    for (const e of edges) {
      totalLen += e.len;
      if (e.cls < 3) openLen += e.len;
      else closed++;
      if (e.cls >= 2) closures.push({ name: e.name, depth: e.depth, cls: e.cls });
    }
    closures.sort((a, b) => b.depth - a.depth);
    statsCache.count = T.vehicles.length;
    statsCache.openPct = Math.round((openLen / totalLen) * 100);
    statsCache.closed = closed;
    statsCache.rerouted = T.vehicles.reduce((s, v) => s + (v.rerouted && v.state !== "blocked" ? 1 : 0), 0);
    statsCache.closures = closures.slice(0, 8);
    const main = route(D.MAIN_ROUTE.from, D.MAIN_ROUTE.to);
    statsCache.etaMin = main ? Math.round(main.timeH * 60) : -1;
  }
  T.stats = () => statsCache;
  T.findRoute = route;                            // shared with zones (access checks)

  /* ---------- public step ---------- */
  T.step = function (simDt, dtReal) {
    if (!FT.world.ready || !T.vehicles.length) return;
    scanTransitions();
    // budget Dijkstra calls
    let budget = 6;
    while (budget-- > 0 && rerouteQueue.length) {
      const v = rerouteQueue.shift();
      if (v.state === "rerouting" || v.state === "blocked") tryReroute(v);
    }
    if (simDt > 0) {
      for (const v of T.vehicles) {
        if (v.state === "blocked" || v._queued) continue;
        if (v.state === "rerouting" && !currentEdge(v)) continue;
        advance(v, simDt);
      }
    }
    statClock += dtReal;
    if (statClock > 0.5) { statClock = 0; updateStats(); }
  };

  T.resync = function () {
    if (!FT.world.ready) return;
    rerouteQueue.length = 0;
    prevCls = FT.world.roads.edges.map((e) => e.cls);
    for (const v of T.vehicles) {
      v._queued = false;
      if (!v.route) { spawn(v); continue; }
      const leg = currentEdge(v);
      if (!leg || leg.e.cls >= 3) tryReroute(v);
      else v.state = "moving";
    }
    updateStats();
  };
})();
