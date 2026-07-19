/* FloodTwin Q1 Demo — charts: probabilistic hydrograph + timeline scrubber
   Flood-Hub-style ensemble fan with BĐ alert lines, observed/forecast split,
   rule-vs-MPC ghost comparison. Canvas, DPR-crisp. */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, D = FT.data;
  let H;

  let hydroC, scrubC, hctx, sctx;
  let hw = 0, hh = 0, sw = 0, sh = 0, dpr = 1;
  let hoverT = null, lay = null;                  // hover time (h) + last layout for inverse mapping
  let phaseCache = null;                          // [{t, phase, alert}] per hour
  const PHASE_COLORS = { "phase.calm": "#22485f", "phase.watch": "#3b6f8a", "phase.rise": "#b98a2e", "phase.peak": "#c2453a", "phase.recede": "#3f9767" };

  function sizeCanvas(c) {
    const r = c.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return [0, 0];
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return [w, h];
  }

  function buildPhaseCache() {
    if (!H.ready) return;
    phaseCache = [];
    for (let t = H.T0; t <= H.T1; t += 1) {
      const s = H.at(t);
      phaseCache.push({ t, phase: s.phase, alert: s.basinAlert });
    }
  }

  FT.charts = {
    init() {
      H = FT.hydro;
      hydroC = document.getElementById("hydrographCanvas");
      scrubC = document.getElementById("scrubberCanvas");
      hctx = hydroC.getContext("2d");
      sctx = scrubC.getContext("2d");
      const ro = new ResizeObserver(() => { [hw, hh] = sizeCanvas(hydroC); [sw, sh] = sizeCanvas(scrubC); });
      ro.observe(hydroC); ro.observe(scrubC);
      [hw, hh] = sizeCanvas(hydroC); [sw, sh] = sizeCanvas(scrubC);
      FT.bus.on("hydroRebuilt", () => { phaseCache = null; });
      buildPhaseCache();
      /* hover readout on the hydrograph */
      hydroC.addEventListener("pointermove", (ev) => {
        if (!lay) return;
        const x = ev.offsetX * dpr;
        const t = H.T0 + ((x - lay.padL) / lay.iw) * (H.T1 - H.T0);
        hoverT = t >= H.T0 && t <= H.T1 ? t : null;
        drawHydrograph();
      });
      hydroC.addEventListener("pointerleave", () => { hoverT = null; drawHydrograph(); });
    },
    render(snap) {
      if (!H || !H.ready) return;
      if (!phaseCache) buildPhaseCache();
      drawHydrograph(snap);
      drawScrubber(snap);
    },
  };

  /* =================== hydrograph =================== */
  function drawHydrograph(snap) {
    if (!hw) [hw, hh] = sizeCanvas(hydroC);
    if (!hw) return;
    const ctx = hctx;
    ctx.clearRect(0, 0, hw, hh);
    const gId = FT.state.selectedGauge;
    const S = H.series(gId);
    if (!S) return;
    const g = S.def;
    const pk = H._activeKey();
    const act = S[pk];
    const now = FT.state.timeH;

    const padL = 30 * dpr, padR = 34 * dpr, padT = 8 * dpr, padB = 16 * dpr;
    const iw = hw - padL - padR, ih = hh - padT - padB;
    lay = { padL, iw };
    const y0 = g.base * 0.6, y1 = Math.max(g.max, S.rulePeak * 1.05, g.bd[2] * 1.1);
    const X = (t) => padL + ((t - H.T0) / (H.T1 - H.T0)) * iw;
    const Y = (v) => padT + (1 - (v - y0) / (y1 - y0)) * ih;
    const font = (s) => { ctx.font = `${Math.round(s * dpr)}px ui-monospace, Menlo, monospace`; };

    /* forecast region tint */
    ctx.fillStyle = "rgba(120,180,255,0.045)";
    ctx.fillRect(X(now), padT, X(H.T1) - X(now), ih);

    /* grid + x labels */
    ctx.strokeStyle = "rgba(148,196,234,0.10)";
    ctx.lineWidth = 1;
    ctx.fillStyle = U.css("--ink-2");
    font(8.5);
    ctx.textAlign = "center";
    for (let t = H.T0; t <= H.T1; t += 12) {
      ctx.beginPath(); ctx.moveTo(X(t), padT); ctx.lineTo(X(t), padT + ih); ctx.stroke();
      const c = U.clock(t);
      ctx.fillText(`${c.hm}`, X(t), hh - 5 * dpr);
    }
    /* y ticks */
    ctx.textAlign = "right";
    const stepY = (y1 - y0) > 6 ? 2 : 1;
    for (let v = Math.ceil(y0); v <= y1; v += stepY) {
      ctx.fillText(`${v}`, padL - 4 * dpr, Y(v) + 3 * dpr);
      ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(padL + iw, Y(v));
      ctx.strokeStyle = "rgba(148,196,234,0.06)"; ctx.stroke();
    }

    /* red wash above BĐ3 */
    ctx.fillStyle = "rgba(255,82,82,0.07)";
    ctx.fillRect(padL, padT, iw, Math.max(0, Y(g.bd[2]) - padT));

    /* alert lines */
    for (let i = 0; i < 3; i++) {
      const col = U.css(`--al-${i + 1}`);
      ctx.strokeStyle = col;
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath(); ctx.moveTo(padL, Y(g.bd[i])); ctx.lineTo(padL + iw, Y(g.bd[i])); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col;
      ctx.textAlign = "left";
      font(8.5);
      ctx.fillText(`BĐ${i + 1}`, padL + iw + 4 * dpr, Y(g.bd[i]) + 3 * dpr);
    }

    /* fan bands (forecast only) */
    const iNow = Math.max(0, Math.ceil((now - H.T0) / H.DT));
    const band = (lo, hi, alpha) => {
      ctx.beginPath();
      for (let i = iNow; i < H.NT; i++) { const t = H.T0 + i * H.DT; const x = X(t), y = Y(hi[i]); i === iNow ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      for (let i = H.NT - 1; i >= iNow; i--) ctx.lineTo(X(H.T0 + i * H.DT), Y(lo[i]));
      ctx.closePath();
      ctx.fillStyle = `rgba(55,182,255,${alpha})`;
      ctx.fill();
    };
    if (iNow < H.NT - 1) {
      band(act.q05, act.q95, 0.13);
      band(act.q25, act.q75, 0.30);
    }

    /* ghost rule median when MPC active */
    if (FT.state.policy === "mpc" && iNow < H.NT - 1) {
      ctx.strokeStyle = "rgba(200,210,225,0.55)";
      ctx.setLineDash([6 * dpr, 5 * dpr]);
      ctx.lineWidth = 1.4 * dpr;
      ctx.beginPath();
      for (let i = iNow; i < H.NT; i++) { const x = X(H.T0 + i * H.DT), y = Y(S.rule.med[i]); i === iNow ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.setLineDash([]);
      font(8.5);
      ctx.fillStyle = "rgba(200,210,225,0.8)"; ctx.textAlign = "right";
      ctx.fillText("Rule", padL + iw - 3 * dpr, Y(S.rule.med[H.NT - 1]) - 4 * dpr);
      ctx.fillStyle = U.css("--accent");
      ctx.fillText("MPC", padL + iw - 3 * dpr, Y(act.med[H.NT - 1]) + 9 * dpr);
    }

    /* observed line (t ≤ now) */
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 1.7 * dpr;
    ctx.beginPath();
    for (let i = 0; i <= Math.min(iNow, H.NT - 1); i++) { const x = X(H.T0 + i * H.DT), y = Y(act.med[i]); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();

    /* forecast median */
    if (iNow < H.NT - 1) {
      ctx.strokeStyle = U.css("--accent");
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      for (let i = iNow; i < H.NT; i++) { const x = X(H.T0 + i * H.DT), y = Y(act.med[i]); i === iNow ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }

    /* peak marker */
    let pi = 0;
    for (let i = 1; i < H.NT; i++) if (act.med[i] > act.med[pi]) pi = i;
    const px = X(H.T0 + pi * H.DT), py = Y(act.med[pi]);
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(px, py, 2.6 * dpr, 0, 7); ctx.fill();
    font(9);
    ctx.textAlign = px > hw * 0.75 ? "right" : "left";
    ctx.fillText(`${U.fmt(act.med[pi], 1)} m`, px + (px > hw * 0.75 ? -5 : 5) * dpr, py - 5 * dpr);

    /* now line */
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath(); ctx.moveTo(X(now), padT); ctx.lineTo(X(now), padT + ih); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    font(8.5); ctx.textAlign = "center";
    ctx.fillText(U.rel(now), X(now), padT + 8 * dpr);

    /* hover crosshair + readout */
    if (hoverT !== null) {
      const hv = U.clamp(hoverT, H.T0, H.T1);
      const med = H.sample(act.med, hv);
      const lo = H.sample(act.q05, hv), hi = H.sample(act.q95, hv);
      const hx = X(hv);
      ctx.strokeStyle = "rgba(89,227,216,0.6)";
      ctx.setLineDash([3 * dpr, 3 * dpr]);
      ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, padT + ih); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = U.css("--cyan");
      ctx.beginPath(); ctx.arc(hx, Y(med), 3 * dpr, 0, 7); ctx.fill();
      const isFc = hv > now;
      const txt1 = `${U.rel(hv)} · ${U.clock(hv).hm}`;
      const txt2 = isFc ? `${U.fmt(med, 1)} m  [${U.fmt(lo, 1)}–${U.fmt(hi, 1)}]` : `${U.fmt(med, 1)} m`;
      font(9);
      const wBox = Math.max(ctx.measureText(txt1).width, ctx.measureText(txt2).width) + 12 * dpr;
      const bx = U.clamp(hx - wBox / 2, 2 * dpr, hw - wBox - 2 * dpr);
      const by = padT + 2 * dpr;
      ctx.fillStyle = "rgba(7,19,32,0.92)";
      ctx.strokeStyle = "rgba(89,227,216,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bx, by, wBox, 26 * dpr, 5 * dpr) : ctx.rect(bx, by, wBox, 26 * dpr);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#cfeeee"; ctx.textAlign = "left";
      ctx.fillText(txt1, bx + 6 * dpr, by + 10 * dpr);
      ctx.fillStyle = "#fff";
      ctx.fillText(txt2, bx + 6 * dpr, by + 21 * dpr);
    }
  }

  /* =================== scrubber =================== */
  function drawScrubber(snap) {
    if (!sw) [sw, sh] = sizeCanvas(scrubC);
    if (!sw) return;
    const ctx = sctx;
    ctx.clearRect(0, 0, sw, sh);
    const now = FT.state.timeH;
    const X = (t) => ((t - H.T0) / (H.T1 - H.T0)) * sw;
    const g = D.GAUGES[0];
    const S = H.series(g.id);
    const act = S[H._activeKey()];

    /* background + observed shading */
    ctx.fillStyle = "rgba(7,19,32,0.55)";
    ctx.fillRect(0, 0, sw, sh);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, X(now), sh);

    /* rain bars from top */
    let rainMax = 10;
    for (let i = 0; i < H.NT; i++) if (H.rain[i] > rainMax) rainMax = H.rain[i];
    const bw = Math.max(1, sw / H.NT);
    for (let i = 0; i < H.NT; i += 2) {
      const r = H.rain[i];
      if (r < 0.5) continue;
      const frac = r / rainMax;
      const hgt = frac * sh * 0.42;
      ctx.fillStyle = frac > 0.66 ? "rgba(255,150,80,0.75)" : frac > 0.33 ? "rgba(90,200,235,0.7)" : "rgba(90,200,235,0.4)";
      ctx.fillRect(X(H.T0 + i * H.DT), 0, bw * 2, hgt);
    }

    /* main gauge stage area, alert-colored segments */
    const yOf = (v) => sh - ((v - g.base * 0.5) / (g.max - g.base * 0.5)) * sh * 0.62;
    for (let i = 1; i < H.NT; i += 1) {
      const v = act.med[i];
      const lv = H.alertOf(g, v);
      ctx.fillStyle = lv >= 3 ? "rgba(255,82,82,0.55)" : lv === 2 ? "rgba(255,160,64,0.5)" : lv === 1 ? "rgba(255,213,79,0.42)" : "rgba(79,195,247,0.30)";
      const x = X(H.T0 + i * H.DT);
      ctx.fillRect(x, yOf(v), Math.max(1, bw), sh - 4 * dpr - yOf(v));
    }

    /* event markers */
    if (H.events) {
      for (const ev of H.events) {
        const x = X(ev.tH);
        ctx.fillStyle = ev.kind === "danger" ? U.css("--al-3") : ev.kind === "warn" ? U.css("--al-1") : ev.kind === "ok" ? U.css("--ok") : U.css("--accent");
        ctx.beginPath();
        ctx.moveTo(x, sh - 10 * dpr); ctx.lineTo(x - 3 * dpr, sh - 4.5 * dpr); ctx.lineTo(x + 3 * dpr, sh - 4.5 * dpr);
        ctx.closePath(); ctx.fill();
      }
    }

    /* phase strip */
    if (phaseCache) {
      const cellW = sw / phaseCache.length;
      for (let i = 0; i < phaseCache.length; i++) {
        ctx.fillStyle = PHASE_COLORS[phaseCache[i].phase] || "#22485f";
        ctx.fillRect(i * cellW, sh - 4 * dpr, cellW + 1, 4 * dpr);
      }
    }

    /* now line */
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(X(now), 0); ctx.lineTo(X(now), sh); ctx.stroke();
  }
})();
