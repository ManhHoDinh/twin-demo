/* FloodTwin — forecast-time-aware operations layer
   docs: FR-22 (time-aware route viability) · FR-24 (isolation detection) · FR-28 (P(exceed))

   The point of this module: an evacuation route must be judged against the flood state at
   the time people are ACTUALLY ON IT, not the state now. Directing people onto a road that
   will be under 0.4 m of water in 90 minutes is worse than giving no direction at all
   (docs/00-foundations/10-failure-library.md §3 #12).

   It is exact and cheap, not a second simulation: world.js inverted its own equilibrium
   relation once at build time to give every road edge the gauge anomaly that closes it
   (`e.fc`), and the gauge stage series is already precomputed over the whole timeline.
   Predicting a closure is therefore a lookup, and it is deterministic and scrub-safe. */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, D = FT.data;

  const F = (FT.forecast = {});
  const HORIZON = 24;                        // h ahead to search for closures / isolation
  const STEP = 0.25;                         // h

  /* ---------- gauge anomaly at an arbitrary time, active policy ---------- */
  F.anomAt = function (gaugeId, t) {
    const H = FT.hydro;
    if (!H.ready) return 0;
    const g = D.GAUGES.find((x) => x.id === gaugeId);
    const e = H.gauge[gaugeId];
    if (!g || !e) return 0;
    const med = e[H._activeKey()].med;
    return Math.max(0, H.sample(med, U.clamp(t, H.T0, H.T1)) - g.base);
  };

  /* ---------- exceedance probability P(H > level) from the ensemble quantiles ----------
     The quantiles are a parametric normal spread around the median (hydro.buildQuantiles),
     so inverting them for an exceedance probability is exact for THIS engine. It is still
     SYNTHETIC — there are no real members behind it. See risk register R-01. */
  const NORM_CDF = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  function erf(x) {                                     // Abramowitz & Stegun 7.1.26
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  F.pExceed = function (gaugeId, level, t) {
    const H = FT.hydro;
    if (!H.ready) return 0;
    const e = H.gauge[gaugeId];
    if (!e) return 0;
    const key = H._activeKey();
    const med = H.sample(e[key].med, U.clamp(t, H.T0, H.T1));
    const q95 = H.sample(e[key].q95, U.clamp(t, H.T0, H.T1));
    const sigma = Math.max(0.02, (q95 - med) / 1.645);
    if (t <= 0) return med >= level ? 1 : 0;             // the past is observed, not forecast
    return U.clamp(1 - NORM_CDF((level - med) / sigma), 0, 1);
  };
  /* peak probability over a forward window — what an operator actually asks */
  F.pExceedWindow = function (gaugeId, level, t0, t1) {
    let p = 0;
    for (let t = t0; t <= t1; t += 0.5) p = Math.max(p, F.pExceed(gaugeId, level, t));
    return p;
  };

  /* ---------- calibration: assimilate the observed field ----------
     The analytic inversion is an equilibrium relation; the SWE field it must agree with is
     damped, capped and settled, so raw inversion closes roads earlier than the simulation
     does. Rather than let two numbers on the same screen disagree — the trust-killer in
     docs/00-foundations/10-failure-history §3 #11 — each edge's arrival anomaly a0 is
     re-anchored on the observed depth every cycle. Agreement at the current time then holds
     by construction, and the forward prediction is the calibrated extrapolation. */
  let lastCalT = null;
  F.calibrate = function (t) {
    const W = FT.world;
    if (!W.ready || !FT.hydro.ready) return;
    /* a scrub is a jump, not a drift — snap instead of blending, or the closure times
       lag the timeline for several seconds after the user drags the scrubber */
    const snap = lastCalT == null || Math.abs(t - lastCalT) > 1;
    lastCalT = t;
    for (const e of W.roads.edges) {
      const fc = e.fc;
      if (!fc) continue;
      const A = F.anomAt(fc.gaugeId, t);
      let a0;
      if (e.depth > 0.03) a0 = Math.max(0, A - e.depth / fc.fade);   // water is here: solve for a0
      else a0 = Math.max(fc.a0Analytic, A);                          // dry: arrival needs at least A
      fc.a0 = (snap || fc.a0 == null) ? a0 : fc.a0 * 0.6 + a0 * 0.4; // smooth drift, snap on jumps
      fc.aClose = fc.a0 + U.CLOSE_DEPTH / fc.fade;
      fc.aRisk = fc.a0 + U.RISK_DEPTH / fc.fade;
    }
  };

  /* recalibrate at most once per state (time · policy · scenario) so repeated callers in
     the same frame do not double-smooth */
  let calKey = "";
  F.ensureCalibrated = function (t) {
    const k = `${FT.state.scenario}|${FT.state.policy}|${FT.state.mpcApproved}|${Math.round(t * 20)}`;
    if (k === calKey) return;
    calKey = k;
    F.calibrate(t);
  };

  /* ---------- road edges ---------- */
  /* predicted passability class of an edge at time t (0 open … 3 closed) */
  F.edgeClsAt = function (e, t) {
    if (!e.fc) return 0;
    const a = F.anomAt(e.fc.gaugeId, t);
    return a >= e.fc.aClose ? 3 : a >= e.fc.aRisk ? 2 : 0;
  };
  /* first time within the horizon at which the edge closes; null if it stays open */
  F.edgeClosesAt = function (e, t0) {
    if (!e.fc) return null;
    if (F.edgeClsAt(e, t0) >= 3) return t0;               // already closed
    const tEnd = Math.min(FT.hydro.T1, t0 + HORIZON);
    for (let t = t0; t <= tEnd; t += STEP) if (F.edgeClsAt(e, t) >= 3) return t;
    return null;
  };
  /* first time the edge REOPENS after t0 (for recovery planning) */
  F.edgeReopensAt = function (e, t0) {
    if (!e.fc || F.edgeClsAt(e, t0) < 3) return null;
    const tEnd = FT.hydro.T1;
    for (let t = t0; t <= tEnd; t += STEP) if (F.edgeClsAt(e, t) < 3) return t;
    return null;
  };

  /* ---------- routing on the PREDICTED network ----------
     A route is viable for a departure at t0 only if every edge stays passable for as long
     as the traveller is still on it — so each edge is tested at its own arrival time. */
  function routeAt(from, to, t0, speedFactor) {
    const R = FT.world.roads;
    if (!R || !R.nodes[from] || !R.nodes[to]) return null;
    if (from === to) return { edges: [], timeH: 0, arriveT: t0 };
    const dist = { [from]: 0 }, prev = {}, done = {};
    const Q = [[0, from]];
    while (Q.length) {
      let bi = 0;
      for (let i = 1; i < Q.length; i++) if (Q[i][0] < Q[bi][0]) bi = i;
      const [d, n] = Q.splice(bi, 1)[0];
      if (done[n]) continue;
      done[n] = 1;
      if (n === to) break;
      for (const e of R.neighbors[n]) {
        const tArrive = t0 + d;                          // when this traveller reaches the edge
        if (F.edgeClsAt(e, tArrive) >= 3) continue;      // will be shut by the time they get there
        const slow = F.edgeClsAt(e, tArrive) >= 2 ? 0.35 : 1;
        const c = e.len / Math.max(5, e.speed * slow * (speedFactor || 1));
        const m = e.a === n ? e.b : e.a, nd = d + c;
        if (dist[m] === undefined || nd < dist[m]) { dist[m] = nd; prev[m] = { n, e }; Q.push([nd, m]); }
      }
    }
    if (dist[to] === undefined) return null;
    const edges = [];
    let cur = to;
    while (cur !== from) { const p = prev[cur]; edges.unshift(p.e); cur = p.n; }
    return { edges, timeH: dist[to], arriveT: t0 + dist[to] };
  }
  F.routeAt = routeAt;

  /* Route viability with a horizon: "open until ~HH:MM", never a green/red binary.
     speedFactor < 1 models assisted movement of vulnerable people on foot/by bus. */
  F.routeViability = function (from, to, t0, speedFactor) {
    const r = routeAt(from, to, t0, speedFactor);
    if (!r) return { ok: false, openUntil: null, timeH: null, reason: "no-route" };
    let openUntil = null;
    for (const e of r.edges) {
      const c = F.edgeClosesAt(e, t0);
      if (c != null && (openUntil == null || c < openUntil)) openUntil = c;
    }
    /* the last safe departure is when the traveller would still clear the first closure */
    const lastDeparture = openUntil == null ? null : openUntil - r.timeH;
    return { ok: true, timeH: r.timeH, openUntil, lastDeparture, edges: r.edges, reason: null };
  };

  /* ---------- standing access vulnerability ----------
     How many independent roads a community has is a property of the network, knowable on a
     quiet Tuesday. A single-access settlement isolates the moment its one road goes under,
     so it belongs on the screen as a permanent fact — not as a discovery made mid-flood.
     (docs E-26 `is_only_crossing`; failure library §3 #12.) */
  F.accessDegree = function (nodeId) {
    const R = FT.world.roads;
    if (!R || !R.neighbors[nodeId]) return 0;
    return R.neighbors[nodeId].length;
  };
  F.isSingleAccess = (nodeId) => F.accessDegree(nodeId) <= 1;

  /* ---------- isolation (FR-24) ----------
     A zone is isolated when no route with passable depth reaches ANY of the reachable
     safe destinations (EOC, hospital, shelter). Isolation outranks depth severity in the
     response priority — an isolated village at 0.4 m needs boats before a 1.2 m flood
     next to an open highway needs anything. */
  F.zoneIsolationAt = function (nodeId, t) {
    if (!FT.world.ready || !nodeId) return true;
    if (nodeId === D.EOC_NODE) return false;
    return !routeAt(nodeId, D.EOC_NODE, t, 1);
  };
  /* earliest time within the horizon at which the zone loses all access; null if it holds */
  F.zoneIsolatesAt = function (nodeId, t0) {
    if (!FT.world.ready || !nodeId || nodeId === D.EOC_NODE) return null;
    if (F.zoneIsolationAt(nodeId, t0)) return t0;
    const tEnd = Math.min(FT.hydro.T1, t0 + HORIZON);
    for (let t = t0; t <= tEnd; t += 0.5) if (F.zoneIsolationAt(nodeId, t)) return t;
    return null;
  };

  /* ---------- shelters (FR-23) ----------
     A shelter inside the inundation footprint, or one whose every access route is cut
     before people can reach it, is INVALID and must not be offered. Validating this is a
     blocking check, not a warning: docs/00-foundations/10-failure-library.md §3 #13. */
  /* A multi-storey school is not written off when its ground floor wets: the upper floor IS
     the refuge, which is how vertical evacuation actually works. Ground-floor loss cuts
     usable capacity and services; only depth above the refuge level — or losing access —
     invalidates the site. docs/00-foundations/07 §5 (vertical vs horizontal evacuation). */
  F.refugeDepth = (sh) => (sh.floorM || 0.3) + Math.max(0, (sh.storeys || 1) - 1) * 3.2;

  F.shelterState = function (sh, t) {
    const W = FT.world;
    if (!W.ready) return { valid: false, reason: "not-ready", depth: 0 };
    const depthNow = W.sampleExcess(sh.x, sh.y);
    const floorM = sh.floorM || 0.3, refugeM = F.refugeDepth(sh);
    const k = W.km2i(sh.y) * W.N + W.km2i(sh.x);
    const gid = shelterGauge(sh);
    /* Scan from the START of the window, not from `t`, and judge purely on the forecast
       anomaly. Mixing the live SWE depth (which is settled to whatever time the UI is
       showing) with the anomaly at an arbitrary t made this NOT a pure function of time —
       so the derived event timeline reported shelters being "lost" at T−19 h. State must be
       a pure function of (entity, t) or replay is not reproducible. */
    const tEnd = Math.min(FT.hydro.T1, Math.max(t, 0) + HORIZON);
    const firstTimeAbove = (depth) => {
      const a = W.gaugeAnomForDepth(k, depth);
      if (!isFinite(a)) return null;
      for (let tt = FT.hydro.T0; tt <= tEnd; tt += 0.5) if (F.anomAt(gid, tt) >= a) return tt;
      return null;
    };
    const groundLostAt = firstTimeAbove(floorM);
    const refugeLostAt = firstTimeAbove(refugeM);
    /* Validity is a property of the SITE, not of the EOC's ability to drive to it. A refuge
       cut off from the command centre is still a refuge for the people beside it — it is a
       RESUPPLY problem, and conflating the two wrongly deletes usable shelters at the peak,
       exactly when the operator has fewest options. Reachability from a given zone is
       decided per zone in assignShelter(). */
    const resupply = F.routeViability(sh.node, D.EOC_NODE, t, 1);
    const groundLost = groundLostAt != null && groundLostAt <= t + 1e-6;
    const refugeLost = refugeLostAt != null && refugeLostAt <= t + 1e-6;
    /* usable now unless the refuge itself is already under water; a future loss is a
       warning with a time on it, not an immediate exclusion */
    const valid = !refugeLost;
    return {
      valid, depth: depthNow, floorM, refugeM,
      groundLost, groundLostAt, refugeLostAt,
      /* ground floor under water → services and usable area go with it */
      capacity: Math.round((sh.capacity || 0) * (groundLost ? 0.45 : 1)),
      resupplyOk: resupply.ok, resupplyOpenUntil: resupply.openUntil,
      reason: refugeLost ? "submerged" : null,
      warn: !valid ? null
        : refugeLostAt != null ? "will-submerge"
        : !resupply.ok ? "no-resupply"
        : groundLost ? "ground-floor-lost"
        : groundLostAt != null ? "ground-floor-at-risk" : null,
    };
  };
  function shelterGauge(sh) {
    const W = FT.world;
    const k = W.km2i(sh.y) * W.N + W.km2i(sh.x);
    let bestG = D.GAUGES[0].id, bestD = 1e9;
    for (const g of D.GAUGES) {
      const d = Math.hypot(g.x - sh.x, g.y - sh.y);
      if (d < bestD) { bestD = d; bestG = g.id; }
    }
    return bestG;
  }
  F.shelterGauge = shelterGauge;

  /* nearest VALID shelter for a zone, judged at the time of use */
  F.assignShelter = function (zone, t) {
    if (!D.SHELTERS) return null;
    let best = null;
    for (const sh of D.SHELTERS) {
      const st = F.shelterState(sh, t);
      if (!st.valid) continue;
      const r = F.routeViability(zone.node, sh.node, t, 0.5);   // assisted movement is slow
      if (!r.ok) continue;
      /* prefer close, dry-floored, adequately sized sites — and one people can still reach */
      const score = r.timeH
        + (st.capacity < zone.pop * 0.15 ? 0.6 : 0)
        + (st.groundLost ? 0.5 : 0)
        + (r.lastDeparture != null && r.lastDeparture < t ? 5 : 0);
      if (!best || score < best.score) best = { shelter: sh, route: r, state: st, score };
    }
    return best;
  };

  /* ---------- basin-wide capacity-aware allocation (FR-23, evacuation planning) ----------
     assignShelter() answers "nearest valid shelter for this zone" but ignores that one
     shelter cannot hold many zones' worth of people. At the flood peak that let the model
     route 27,000 people to a 1,200-place school and the UI read it as covered. This pass
     assigns EVERY zone's exposed population to its reachable valid shelters, nearest first,
     CONSUMING capacity so a full shelter overflows to the next, and reports whoever is left
     with no reachable capacity as unsheltered — the number an operator must not be denied.

     Capacity consumption is order-sensitive, so zones are processed in their fixed D.ZONES
     order for a deterministic, reproducible allocation. Judged at time t, like everything
     else in this module. */
  let _allocCache = null;   // memo: stepStats and updateEvac both call this each tick at the same t
  F.allocateShelters = function (t) {
    if (!D.SHELTERS || !D.ZONES) return null;
    const W = FT.world;
    if (!W || !W.ready || !FT.hydro.ready) return null;
    F.ensureCalibrated(t);
    /* Cache on (t, policy, degradation, exposure signature): exposure is what drives the
       allocation and it changes as the sim advances, so key on it rather than t alone. */
    const sig = t + "|" + FT.state.policy + "|" + (FT.state.mpcApproved ? 1 : 0) + "|"
      + (FT.zones && FT.zones.list ? FT.zones.list.map((z) => Math.round(z.exposed)).join(",") : "");
    if (_allocCache && _allocCache.sig === sig) return _allocCache.result;

    // remaining capacity per shelter, seeded from the time-aware state (ground-floor loss
    // already reduces this) — only valid shelters offer any capacity at all
    const remaining = {};
    const stOf = {};
    for (const sh of D.SHELTERS) {
      const st = F.shelterState(sh, t);
      stOf[sh.id] = st;
      remaining[sh.id] = st.valid ? st.capacity : 0;
    }

    const zones = [];
    let totalExposed = 0, totalAssigned = 0, totalUnsheltered = 0;
    for (const zdef of D.ZONES) {
      const zs = FT.zones && FT.zones.byId ? FT.zones.byId(zdef.id) : null;
      const exposed = Math.max(0, Math.round(zs ? zs.exposed : 0));
      totalExposed += exposed;
      // reachable valid shelters for this zone, nearest (shortest viable route) first
      const reachable = [];
      for (const sh of D.SHELTERS) {
        if (!stOf[sh.id].valid) continue;
        const r = F.routeViability(zdef.node, sh.node, t, 0.5);
        if (!r.ok) continue;
        reachable.push({ sh, r });
      }
      reachable.sort((a, b) => a.r.timeH - b.r.timeH);
      // fill nearest first, spill overflow to the next reachable shelter
      let need = exposed;
      const placed = [];
      for (const { sh, r } of reachable) {
        if (need <= 0) break;
        const take = Math.min(need, remaining[sh.id]);
        if (take <= 0) continue;
        remaining[sh.id] -= take;
        need -= take;
        placed.push({ shelterId: sh.id, name: sh.name, placed: take, route: r });
      }
      const unsheltered = need;
      totalAssigned += exposed - unsheltered;
      totalUnsheltered += unsheltered;
      zones.push({
        zoneId: zdef.id, name: zdef.name, node: zdef.node,
        exposed, assigned: exposed - unsheltered, unsheltered,
        primary: placed[0] || null, placements: placed,
      });
    }

    // total reachable valid capacity in the basin (union of what any zone can reach)
    let reachableCapacity = 0;
    for (const sh of D.SHELTERS) {
      if (!stOf[sh.id].valid) continue;
      const anyZoneReaches = D.ZONES.some((z) => F.routeViability(z.node, sh.node, t, 0.5).ok);
      if (anyZoneReaches) reachableCapacity += stOf[sh.id].capacity;
    }

    const result = {
      zones,
      totalExposed, totalAssigned, totalUnsheltered,
      reachableCapacity,
      sheltersUsed: Object.keys(remaining).filter((id) => stOf[id].valid && remaining[id] < stOf[id].capacity).length,
    };
    _allocCache = { sig, result };
    return result;
  };

  /* ---------- summary used by the UI ---------- */
  F.summary = function (t) {
    const W = FT.world;
    if (!W.ready || !FT.hydro.ready) return null;
    F.ensureCalibrated(t);
    const edges = W.roads.edges;
    let closingSoon = 0, closedNow = 0;
    const upcoming = [];
    for (const e of edges) {
      const now = F.edgeClsAt(e, t);
      if (now >= 3) { closedNow++; continue; }
      const c = F.edgeClosesAt(e, t);
      if (c != null && c - t <= 12) { closingSoon++; upcoming.push({ name: e.name, at: c, inH: c - t, lifeline: e.type === "hw" }); }
    }
    upcoming.sort((a, b) => a.at - b.at);
    const shelters = (D.SHELTERS || []).map((sh) => ({ sh, st: F.shelterState(sh, t) }));
    return {
      closedNow, closingSoon, upcoming: upcoming.slice(0, 6),
      sheltersValid: shelters.filter((x) => x.st.valid).length,
      sheltersTotal: shelters.length,
      shelters,
    };
  };
})();
