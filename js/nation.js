/* FloodTwin Q1 Demo — nation: 3D national monitoring view (all of Vietnam)
   Stylised-but-recognisable terrain, 15 river systems with flux-driven particles,
   26 hydropower reservoirs with live level bars, moving storm, region beacons,
   operator panel with factor chips, drill-down into the VGTB basin twin.
   Scene units: 1 = 10 km. x=(lon−102)·10.67, z=(23.6−lat)·11.1, y=elev·0.0035. */
(function () {
  "use strict";
  const FT = window.FT, U = FT.util, V = FT.vndata;
  let THREE, HN;

  const X = (lon) => (lon - 102) * 10.67;
  const Z = (lat) => (23.6 - lat) * 11.1;
  const EY = (m) => m * 0.0035;

  let renderer, scene, camera, controls, canvas, labelWrap, panel;
  let ready = false, clock = 0, panelClock = 0;
  let resItems = [], beacons = [], labels = [], riverParticles = [];
  let stormSprite, stormCone, seaMesh;
  let raycaster, pointerV, pickables = [];
  let flyFrom = null, flyTo = null, flyT = 1;

  const N = (FT.nation = {});

  /* ---------- elevation & land mask ---------- */
  const POLY = V.COAST.concat(V.BORDER.slice(1, -1));
  function inland(lon, lat) {
    let inside = false;
    for (let i = 0, j = POLY.length - 1; i < POLY.length; j = i++) {
      const [xi, yi] = POLY[i], [xj, yj] = POLY[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function segDist(lon, lat, pts) {
    let best = 1e9;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
      const t = U.clamp(((lon - ax) * dx + (lat - ay) * dy) / L2, 0, 1);
      const d = Math.hypot(lon - (ax + t * dx), lat - (ay + t * dy));
      if (d < best) best = d;
    }
    return best;
  }
  function hash(a, b) { let h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); }
  function fbm2(lon, lat) {
    return hash(lon * 5.3, lat * 5.3) * 0.55 + hash(lon * 11.7, lat * 11.7) * 0.3 + hash(lon * 23.1, lat * 23.1) * 0.15;
  }
  /* precomputed bboxes for fast rejection */
  let riverBB = null, ridgeBB = null;
  function bboxOf(pts, pad) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    return [x0 - pad, x1 + pad, y0 - pad, y1 + pad];
  }
  function prepBB() {
    riverBB = V.NRIVERS.map((r) => bboxOf(r.pts, 0.25));
    ridgeBB = V.RIDGES.map((r) => bboxOf(r.pts, r.r * 2.6));
  }
  function riverDistN(lon, lat) {
    let best = 1e9;
    for (let i = 0; i < V.NRIVERS.length; i++) {
      const bb = riverBB[i];
      if (lon < bb[0] || lon > bb[1] || lat < bb[2] || lat > bb[3]) continue;
      const d = segDist(lon, lat, V.NRIVERS[i].pts);
      if (d < best) best = d;
    }
    return best;
  }
  function elev(lon, lat) {
    if (!inland(lon, lat)) return -30;
    const n = fbm2(lon, lat);
    let e = 70 + 90 * n;
    for (let i = 0; i < V.RIDGES.length; i++) {
      const bb = ridgeBB[i];
      if (lon < bb[0] || lon > bb[1] || lat < bb[2] || lat > bb[3]) continue;
      const r = V.RIDGES[i];
      const d = segDist(lon, lat, r.pts);
      if (d < r.r * 2.4) e += r.h * Math.exp(-(d * d) / (2 * r.r * r.r * 0.55)) * (0.82 + 0.36 * n);
    }
    for (const p of V.PLATEAUS) {
      const d = Math.hypot(lon - p.c[0], lat - p.c[1]);
      if (d < p.r * 1.8) e = Math.max(e, p.h * (1 - Math.pow(d / (p.r * 1.8), 3)) + 60 + 70 * n);
    }
    /* deltas flat */
    const dRed = Math.hypot(lon - 106.0, lat - 20.7), dMek = Math.hypot(lon - 105.7, lat - 9.9);
    if (dRed < 1.1) e = Math.min(e, 6 + dRed * 30);
    if (dMek < 2.0) e = Math.min(e, 4 + dMek * 8);
    /* coastal strip tapers */
    const dc = segDist(lon, lat, V.COAST);
    if (dc < 0.35) e = Math.min(e, 8 + dc * 180);
    /* carve river valleys */
    const dr = riverDistN(lon, lat);
    if (dr < 0.22) e = Math.min(e, Math.max(2, e - 240 * (1 - dr / 0.22)));
    else if (dr < 0.6 && e > 120) e -= (e - 120) * 0.4 * (1 - (dr - 0.22) / 0.38);
    return e;
  }
  N._elev = elev;

  /* ---------- terrain mesh ---------- */
  function buildTerrain() {
    const lon0 = 101.9, lon1 = 109.7, lat0 = 8.3, lat1 = 23.7, step = 0.032;
    const nx = Math.round((lon1 - lon0) / step), nz = Math.round((lat1 - lat0) / step);
    const pos = [], col = [], idxA = [];
    const c = new THREE.Color(), c2 = new THREE.Color();
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const lon = lon0 + i * step, lat = lat1 - j * step;
        const e = elev(lon, lat);
        pos.push(X(lon), EY(e), Z(lat));
        const n = fbm2(lon + 3.7, lat + 1.3);
        if (e <= 0) {
          /* shallow shelf brighter near coast */
          const dc = segDist(lon, lat, V.COAST);
          c.setRGB(0.02, 0.075, 0.16).lerp(c2.setRGB(0.05, 0.16, 0.26), U.clamp(1 - dc / 0.5, 0, 1) * 0.8);
        } else if (e < 2.5) c.setRGB(0.75, 0.7, 0.5);                                    // beach/foam line
        else if (e < 15) c.setRGB(0.14, 0.38, 0.2).lerp(c2.setRGB(0.25, 0.47, 0.2), n);  // paddy delta
        else if (e < 150) c.setRGB(0.16, 0.36, 0.2).lerp(c2.setRGB(0.36, 0.43, 0.22), (e - 15) / 135);
        else if (e < 700) c.setRGB(0.34, 0.41, 0.23).lerp(c2.setRGB(0.47, 0.4, 0.29), (e - 150) / 550);
        else c.setRGB(0.47, 0.4, 0.29).lerp(c2.setRGB(0.74, 0.72, 0.72), Math.min(1, (e - 700) / 1800));
        if (e > 2.5) {
          const tex = 0.88 + 0.24 * n;                                                   // micro colour variation
          c.r *= tex; c.g *= tex; c.b *= tex;
          const dr = riverDistN(lon, lat);
          if (dr < 0.5) { const f = 0.72 + 0.28 * (dr / 0.5); c.r *= f; c.g *= f; c.b *= f; } // damp valleys
        }
        col.push(c.r, c.g, c.b);
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e2 = d + 1;
        idxA.push(a, d, b, b, d, e2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idxA);
    geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
    /* sea */
    seaMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 260),
      new THREE.MeshLambertMaterial({ color: 0x0a2743, transparent: true, opacity: 0.94 })
    );
    seaMesh.rotation.x = -Math.PI / 2;
    seaMesh.position.set(60, -0.02, 84);
    scene.add(seaMesh);
  }

  /* ---------- rivers + particles ---------- */
  function buildRivers() {
    for (const riv of V.NRIVERS) {
      const pts3 = riv.pts.map((p) => new THREE.Vector3(X(p[0]), EY(Math.max(2, elev(p[0], p[1]))) + 0.06, Z(p[1])));
      const curve = new THREE.CatmullRomCurve3(pts3);
      const tube = new THREE.TubeGeometry(curve, riv.pts.length * 6, riv.id === "tien" || riv.id === "hau" ? 0.34 : 0.2, 5, false);
      const mesh = new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: 0x4193d6, transparent: true, opacity: 0.95 }));
      scene.add(mesh);
      /* particle pool along curve */
      const np = 90;
      const geo = new THREE.BufferGeometry();
      const parr = new Float32Array(np * 3);
      geo.setAttribute("position", new THREE.BufferAttribute(parr, 3));
      const mat = new THREE.PointsMaterial({ color: 0x9fe0ff, size: 0.42, transparent: true, opacity: 0.85, sizeAttenuation: true });
      const points = new THREE.Points(geo, mat);
      scene.add(points);
      const params = new Float32Array(np);
      for (let i = 0; i < np; i++) params[i] = Math.random();
      riverParticles.push({ riv, curve, points, params, arr: parr, mat });
    }
  }
  function updateRivers(dt, snapN) {
    for (const rp of riverParticles) {
      const flux = snapN.flux[rp.riv.id] || 0.3;
      const speed = 0.008 + flux * 0.05;
      const v = new THREE.Vector3();
      for (let i = 0; i < rp.params.length; i++) {
        rp.params[i] += speed * dt * (0.7 + 0.6 * ((i * 37) % 10) / 10);
        if (rp.params[i] > 1) rp.params[i] -= 1;
        rp.curve.getPointAt(rp.params[i], v);
        rp.arr[i * 3] = v.x; rp.arr[i * 3 + 1] = v.y + 0.05; rp.arr[i * 3 + 2] = v.z;
      }
      rp.points.geometry.attributes.position.needsUpdate = true;
      rp.mat.opacity = 0.35 + flux * 0.6;
      rp.mat.size = 0.3 + flux * 0.35;
    }
  }

  /* ---------- reservoirs ---------- */
  const STRESS_HEX = [0x37b6ff, 0xffd54f, 0xffa040, 0xff5252];
  function buildReservoirs() {
    for (const r of V.NRES) {
      const y = EY(Math.max(4, elev(r.ll[0], r.ll[1])));
      const g = new THREE.Group();
      g.position.set(X(r.ll[0]), y, Z(r.ll[1]));
      const dam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.22), new THREE.MeshLambertMaterial({ color: 0xc0c6cd }));
      dam.position.y = 0.1;
      g.add(dam);
      const barBg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.6, 8), new THREE.MeshBasicMaterial({ color: 0x081a2b }));
      barBg.position.y = 1.05;
      g.add(barBg);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1, 8), new THREE.MeshBasicMaterial({ color: 0x37b6ff }));
      bar.position.y = 0.5;
      g.add(bar);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.66, 24), new THREE.MeshBasicMaterial({ color: 0xff5252, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.05;
      g.add(halo);
      scene.add(g);
      dam.userData = { kind: "res", id: r.id };
      barBg.userData = dam.userData; bar.userData = dam.userData;
      pickables.push(dam, barBg, bar);
      resItems.push({ r, g, bar, halo });
    }
  }
  function updateReservoirs(snapN, t) {
    for (const it of resItems) {
      const s = snapN.res[it.r.id];
      const pct = U.clamp(s.Z, 0.05, 1.05);
      it.bar.scale.y = pct * 1.5;
      it.bar.position.y = 0.25 + pct * 0.75;
      it.bar.material.color.setHex(STRESS_HEX[s.stress]);
      it.halo.material.opacity = s.spilling ? 0.35 + 0.25 * Math.sin(t * 5) : s.stress >= 2 ? 0.25 : 0;
      it.halo.material.color.setHex(STRESS_HEX[Math.max(2, s.stress)]);
    }
  }

  /* ---------- national water-level stations ---------- */
  let gaugeItems = [];
  function buildGaugesNat() {
    for (const g of V.NGAUGES) {
      const y = EY(Math.max(2, elev(g.ll[0], g.ll[1])));
      const grp = new THREE.Group();
      grp.position.set(X(g.ll[0]), y, Z(g.ll[1]));
      const pin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0x4fc3f7 }));
      pin.rotation.x = Math.PI;
      pin.position.y = 0.55;
      grp.add(pin);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 20), new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      grp.add(ring);
      scene.add(grp);
      pin.userData = { kind: "gauge", id: g.id };
      pickables.push(pin);
      gaugeItems.push({ g, grp, pin, ring });
    }
  }
  function updateGaugesNat(snapN, t) {
    for (const it of gaugeItems) {
      const s = snapN.gauges[it.g.id];
      it.pin.material.color.setHex(STRESS_HEX[s.alert]);
      it.ring.material.color.setHex(STRESS_HEX[s.alert]);
      it.ring.material.opacity = s.alert >= 2 ? 0.4 + 0.3 * Math.sin(t * 5) : 0.35;
      it.ring.scale.setScalar(s.alert >= 2 ? 1 + 0.3 * Math.sin(t * 5) : 1);
    }
  }

  /* ---------- focus card (level-over-time assessment for any station/reservoir) ---------- */
  let focus = null, focusCv = null;
  function openFocus(kind, id) {
    focus = { kind, id };
    panel.querySelector("#npFocus").hidden = false;
    drawFocus();
  }
  function drawFocus() {
    if (!focus || !focusCv) return;
    const vi = FT.state.lang === "vi";
    const dpr2 = Math.min(2, window.devicePixelRatio || 1);
    const rect = focusCv.getBoundingClientRect();
    if (rect.width < 4) return;
    focusCv.width = rect.width * dpr2; focusCv.height = rect.height * dpr2;
    const ctx = focusCv.getContext("2d");
    const w = focusCv.width, h = focusCv.height;
    ctx.clearRect(0, 0, w, h);
    const HNref = FT.hydronat;
    const T0n = HNref.T0, T1n = HNref.T1, NTn = HNref.NT, DTn = HNref.DT;
    const Xc = (t) => ((t - T0n) / (T1n - T0n)) * (w - 30 * dpr2) + 2 * dpr2;
    const title = panel.querySelector("#npFocusTitle");
    let series, y0, y1, bd = null, unit = "m", now = FT.state.timeH, nowVal = 0;
    if (focus.kind === "gauge") {
      const G = HNref.gaugeSeries(focus.id);
      series = G.stage;
      bd = G.def.bd;
      y0 = G.def.base * 0.4; y1 = Math.max(G.def.bd[2] * 1.15, Math.max(...series) * 1.05);
      nowVal = HNref.samp(series, now);
      title.textContent = `${G.def.name} — ${U.fmt(nowVal, 2)} m ${HNref.alertOfG(G.def, nowVal) ? "· BĐ" + HNref.alertOfG(G.def, nowVal) : ""}`;
    } else {
      const R = HNref.res[focus.id];
      series = R.Z; y0 = 0.3; y1 = 1.08; unit = "%";
      nowVal = HNref.samp(series, now);
      title.textContent = `${R.def.name} — ${Math.round(nowVal * 100)}% · ${vi ? "xả" : "out"} ${U.fmtInt(HNref.samp(R.O, now))} m³/s`;
    }
    const Yc = (v) => h - 12 * dpr2 - ((v - y0) / (y1 - y0)) * (h - 20 * dpr2);
    /* alert lines */
    if (bd) {
      const cols = ["#ffd54f", "#ffa040", "#ff5252"];
      ctx.setLineDash([4, 3]);
      bd.forEach((v, i) => {
        ctx.strokeStyle = cols[i]; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, Yc(v)); ctx.lineTo(w, Yc(v)); ctx.stroke();
        ctx.fillStyle = cols[i]; ctx.font = `${8.5 * dpr2}px ui-monospace,monospace`;
        ctx.textAlign = "right"; ctx.fillText(`BĐ${i + 1}`, w - 2 * dpr2, Yc(v) - 2 * dpr2);
      });
      ctx.setLineDash([]);
    } else {
      ctx.setLineDash([4, 3]); ctx.strokeStyle = "#ffa040"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, Yc(0.78)); ctx.lineTo(w, Yc(0.78)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ffa040"; ctx.font = `${8.5 * dpr2}px ui-monospace,monospace`;
      ctx.textAlign = "right"; ctx.fillText(vi ? "trần trước lũ" : "pre-flood", w - 2 * dpr2, Yc(0.78) - 2 * dpr2);
    }
    /* series */
    ctx.strokeStyle = "#37b6ff"; ctx.lineWidth = 1.8 * dpr2;
    ctx.beginPath();
    for (let i = 0; i < NTn; i++) {
      const x = Xc(T0n + i * DTn), y = Yc(series[i]);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.lineTo(Xc(T1n), Yc(y0)); ctx.lineTo(Xc(T0n), Yc(y0)); ctx.closePath();
    ctx.fillStyle = "rgba(55,182,255,0.12)"; ctx.fill();
    /* now line + marker */
    ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1.2 * dpr2;
    ctx.beginPath(); ctx.moveTo(Xc(now), 4 * dpr2); ctx.lineTo(Xc(now), h - 8 * dpr2); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(Xc(now), Yc(nowVal), 2.6 * dpr2, 0, 7); ctx.fill();
    /* x labels */
    ctx.fillStyle = "rgba(126,156,182,0.9)"; ctx.font = `${8 * dpr2}px ui-monospace,monospace`;
    ctx.textAlign = "left"; ctx.fillText("T−24h", 2 * dpr2, h - 2 * dpr2);
    ctx.textAlign = "right"; ctx.fillText("T+48h", w - 2 * dpr2, h - 2 * dpr2);
  }

  /* ---------- storm ---------- */
  function stormTexture() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const ctx = cv.getContext("2d");
    ctx.translate(128, 128);
    for (let a = 0; a < Math.PI * 6; a += 0.05) {
      const r = 8 + a * 6.2;
      const alpha = U.clamp(1 - r / 120, 0, 1) * 0.8;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      for (const off of [0, Math.PI]) {
        ctx.beginPath();
        ctx.arc(Math.cos(a + off) * r, Math.sin(a + off) * r, 7 * (1 - r / 150) + 2, 0, 7);
        ctx.fill();
      }
    }
    ctx.fillStyle = "rgba(20,40,60,0.9)";
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill();
    return new THREE.CanvasTexture(cv);
  }
  function buildStorm() {
    stormSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: stormTexture(), transparent: true, opacity: 0.9, depthWrite: false }));
    stormSprite.scale.set(10, 10, 1);
    scene.add(stormSprite);
    stormCone = new THREE.Mesh(
      new THREE.CylinderGeometry(4.4, 5.2, 5, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7fb6e0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
    );
    scene.add(stormCone);
  }
  function updateStorm(snapN, dt) {
    const st = snapN.storm;
    const on = st && st.on && st.inten > 0.05;
    stormSprite.visible = on;
    stormCone.visible = on;
    if (!on) return;
    const x = X(st.lon), z = Z(st.lat);
    stormSprite.position.set(x, 6.5, z);
    const s = 6 + st.inten * 9;
    stormSprite.scale.set(s, s, 1);
    stormSprite.material.rotation -= dt * (0.6 + st.inten * 0.7);
    stormSprite.material.opacity = 0.45 + st.inten * 0.4;
    stormCone.position.set(x, 3, z);
    stormCone.scale.setScalar(0.6 + st.inten * 0.75);
    stormCone.material.opacity = 0.06 + st.inten * 0.12;
  }

  /* ---------- region beacons + labels ---------- */
  function buildBeaconsLabels() {
    labelWrap = document.createElement("div");
    labelWrap.className = "labels3d";
    labelWrap.id = "labelsNat";
    document.getElementById("stageWrap").appendChild(labelWrap);
    const mk = (txt, cls, lon, lat, off) => {
      const el = document.createElement("span");
      el.className = `label3d ${cls}`;
      el.textContent = txt;
      labelWrap.appendChild(el);
      labels.push({ el, lon, lat, off });
      return el;
    };
    for (const c of V.NCITIES) mk(c.name, c.big ? "city" : "", c.ll[0], c.ll[1], 0.35);
    for (const r of V.NRES) mk(r.name, "res", r.ll[0], r.ll[1], 0.85);
    for (const rg of V.NREGIONS) {
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshBasicMaterial({ color: 0x4fc3f7 }));
      const y = EY(Math.max(6, elev(rg.c[0], rg.c[1]))) + 0.9;
      beacon.position.set(X(rg.c[0]), y, Z(rg.c[1]));
      beacon.userData = { kind: "region", id: rg.id };
      scene.add(beacon);
      pickables.push(beacon);
      beacons.push({ rg, beacon });
      const el = mk(rg.name, "gauge", rg.c[0], rg.c[1], 1.3);
      el.style.fontWeight = "700";
    }
  }
  function updateBeacons(snapN, t) {
    for (const b of beacons) {
      const a = snapN.regions[b.rg.id].alert;
      b.beacon.material.color.setHex(STRESS_HEX[a]);
      b.beacon.scale.setScalar(a >= 2 ? 1 + 0.25 * Math.sin(t * 5) : 1);
    }
  }
  const tmpV = new (function () { this.v = null; })();
  function updateLabels() {
    const v = tmpV.v || (tmpV.v = new THREE.Vector3());
    const rect = renderer.domElement.getBoundingClientRect();
    const show = FT.state.layers.labels;
    const camDist = camera.position.distanceTo(controls.target);
    for (const L of labels) {
      if (!show) { L.el.style.display = "none"; continue; }
      /* reservoir labels only when zoomed in; keeps the overview readable */
      if (camDist > 130 && L.el.classList.contains("res")) { L.el.style.display = "none"; continue; }
      v.set(X(L.lon), EY(Math.max(4, elev(L.lon, L.lat))) + L.off, Z(L.lat));
      v.project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { L.el.style.display = "none"; continue; }
      L.el.style.display = "";
      L.el.style.left = `${((v.x + 1) / 2) * rect.width}px`;
      L.el.style.top = `${((1 - v.y) / 2) * rect.height}px`;
    }
  }

  /* ---------- operator panel (DOM overlay) ---------- */
  function buildPanel() {
    panel = document.createElement("div");
    panel.id = "nationPanel";
    panel.innerHTML = `
      <div class="npHead"><span>🇻🇳</span><strong data-np="title">Giám sát hồ đập toàn quốc</strong></div>
      <div class="npStorm" id="npStorm">—</div>
      <div id="npFocus" class="npFocus" hidden>
        <div class="npFocusHead"><strong id="npFocusTitle">—</strong><button id="npFocusClose" type="button">×</button></div>
        <canvas id="npFocusCv"></canvas>
      </div>
      <div class="npSection" data-np="gauges">Trạm mực nước</div>
      <div id="npGauges"></div>
      <div class="npSection" data-np="regions">Vùng · cảnh báo</div>
      <div id="npRegions"></div>
      <div class="npSection" data-np="res">Hồ căng thẳng nhất</div>
      <div id="npRes"></div>
      <button id="npDrill" type="button">▸ Đi sâu lưu vực Vu Gia–Thu Bồn</button>`;
    document.getElementById("stageWrap").appendChild(panel);
    panel.querySelector("#npDrill").addEventListener("click", () => FT.ui.forceView("3d"));
    focusCv = panel.querySelector("#npFocusCv");
    panel.querySelector("#npFocusClose").addEventListener("click", () => { focus = null; panel.querySelector("#npFocus").hidden = true; });
  }
  function updatePanel(snapN, tH) {
    const vi = FT.state.lang === "vi";
    panel.querySelector('[data-np="title"]').textContent = vi ? "Giám sát hồ đập toàn quốc" : "National reservoir monitoring";
    panel.querySelector('[data-np="regions"]').textContent = vi ? "Vùng · cảnh báo · yếu tố" : "Regions · alerts · factors";
    panel.querySelector('[data-np="gauges"]').textContent = vi ? "Trạm mực nước — nhấp để xem diễn biến" : "Water-level stations — click for time series";
    panel.querySelector('[data-np="res"]').textContent = vi ? "Hồ căng thẳng nhất" : "Most stressed reservoirs";
    panel.querySelector("#npDrill").textContent = vi ? "▸ Đi sâu lưu vực Vu Gia–Thu Bồn" : "▸ Drill into the Vu Gia–Thu Bồn basin";
    const st = snapN.storm;
    const S = V.NSTORMS[FT.state.scenario];
    document.getElementById("npStorm").innerHTML = st && st.on && st.inten > 0.05
      ? `🌀 <b>${S.name}</b> · ${st.lon.toFixed(1)}°E ${st.lat.toFixed(1)}°N · ${Math.round(st.inten * 100)}%`
      : `☁️ ${S.name}`;
    /* stations sorted by alert then stage fraction */
    const gEl = document.getElementById("npGauges");
    gEl.innerHTML = "";
    const gs = V.NGAUGES.map((g) => ({ g, s: snapN.gauges[g.id] }))
      .sort((a, b) => (b.s.alert - a.s.alert) || (b.s.stage / b.g.bd[2] - a.s.stage / a.g.bd[2]))
      .slice(0, 6);
    for (const { g, s } of gs) {
      const row = document.createElement("div");
      row.className = `npRes s${s.alert}`;
      row.innerHTML = `<span><i class="npDot" style="background:${U.alertColor(s.alert)}"></i>${g.name}</span>
        <div class="npBar"><i style="width:${Math.min(104, (s.stage / g.bd[2]) * 100)}%;background:${U.alertColor(s.alert)}"></i></div>
        <b>${U.fmt(s.stage, 1)} m ${s.alert ? "· BĐ" + s.alert : ""} ${s.trend > 0.05 ? "▲" : s.trend < -0.05 ? "▼" : ""}</b>`;
      row.addEventListener("click", () => { openFocus("gauge", g.id); flyToLL(g.ll[0], g.ll[1], false); });
      gEl.appendChild(row);
    }
    if (focus) drawFocus();
    const regs = document.getElementById("npRegions");
    regs.innerHTML = "";
    const sorted = V.NREGIONS.slice().sort((a, b) => snapN.regions[b.id].alert - snapN.regions[a.id].alert);
    for (const rg of sorted) {
      const R = snapN.regions[rg.id];
      const row = document.createElement("div");
      row.className = `npRow al${R.alert}`;
      const chips = FT.hydronat.factors(rg.id, tH).join(" ");
      row.innerHTML = `<i style="background:${U.alertColor(R.alert)}"></i><span>${rg.name}</span><small>${chips}</small><b>${Math.round(R.rain)} mm/h</b>`;
      row.addEventListener("click", () => flyToLL(rg.c[0], rg.c[1], rg.drill));
      regs.appendChild(row);
    }
    const resEl = document.getElementById("npRes");
    resEl.innerHTML = "";
    const rs = V.NRES.map((r) => ({ r, s: snapN.res[r.id] })).sort((a, b) => b.s.Z - a.s.Z).slice(0, 8);
    for (const { r, s } of rs) {
      const row = document.createElement("div");
      row.className = `npRes s${s.stress}`;
      row.innerHTML = `<span>${r.name}${s.spilling ? " 🔓" : ""}</span><div class="npBar"><i style="width:${Math.min(104, s.Z * 100)}%;background:${"#" + STRESS_HEX[s.stress].toString(16).padStart(6, "0")}"></i></div><b>${Math.round(s.Z * 100)}% · ${U.fmtInt(s.O)} m³/s</b>`;
      row.addEventListener("click", () => { if (!r.drill) openFocus("res", r.id); flyToLL(r.ll[0], r.ll[1], r.drill); });
      resEl.appendChild(row);
    }
  }

  /* ---------- camera ---------- */
  function flyToLL(lon, lat, drill) {
    if (drill) { FT.ui.forceView("3d"); return; }
    flyFrom = { pos: camera.position.clone(), tgt: controls.target.clone() };
    const y = EY(Math.max(6, elev(lon, lat)));
    flyTo = { pos: [X(lon) + 7, y + 9, Z(lat) + 12], tgt: [X(lon), y, Z(lat)] };
    flyT = 0;
  }
  N.resetCamera = function () {
    flyFrom = { pos: camera.position.clone(), tgt: controls.target.clone() };
    flyTo = { pos: [100, 150, 180], tgt: [40, 0, 82] };
    flyT = 0;
  };

  /* ---------- picking ---------- */
  function bindPicking() {
    canvas.addEventListener("pointerdown", (ev) => {
      const rect = canvas.getBoundingClientRect();
      pointerV.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointerV.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerV, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      if (!hits.length) return;
      const ud = hits[0].object.userData;
      if (ud.kind === "res") {
        const r = V.NRES.find((x) => x.id === ud.id);
        if (r) { if (!r.drill) openFocus("res", r.id); flyToLL(r.ll[0], r.ll[1], r.drill); }
      } else if (ud.kind === "gauge") {
        const g = V.NGAUGES.find((x) => x.id === ud.id);
        if (g) { openFocus("gauge", g.id); flyToLL(g.ll[0], g.ll[1], !!g.drill); }
      } else if (ud.kind === "region") {
        const rg = V.NREGIONS.find((x) => x.id === ud.id);
        if (rg) flyToLL(rg.c[0], rg.c[1], rg.drill);
      }
    });
  }

  /* ---------- API ---------- */
  N.init = function (cv) {
    THREE = window.THREE;
    if (!THREE) return;
    HN = FT.hydronat;
    canvas = cv;
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060f1c);
    scene.fog = new THREE.Fog(0x060f1c, 320, 760);
    camera = new THREE.PerspectiveCamera(45, 1.6, 0.5, 800);
    camera.position.set(100, 150, 180);
    controls = new window.OrbitControls(camera, cv);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(40, 0, 82);
    controls.maxPolarAngle = 1.42;
    controls.minDistance = 12;
    controls.maxDistance = 320;
    scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x14211c, 1.15));
    const key = new THREE.DirectionalLight(0xffe0b0, 1.25);
    key.position.set(140, 180, -60);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x5f8fc8, 0.4);
    fill.position.set(-80, 120, 220);
    scene.add(fill);
    raycaster = new THREE.Raycaster();
    pointerV = new THREE.Vector2();

    HN.rebuild();
    prepBB();
    buildTerrain();
    buildRivers();
    buildReservoirs();
    buildGaugesNat();
    buildStorm();
    buildBeaconsLabels();
    buildPanel();
    bindPicking();
    FT.bus.on("hydroRebuilt", () => HN.rebuild());
    const ro = new ResizeObserver(() => N.resize());
    ro.observe(cv);
    N.resize();
    ready = true;
  };

  N.resize = function () {
    if (!renderer) return;
    const r = canvas.getBoundingClientRect();
    if (r.width < 4) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  };

  N.setVisible = function (on) {
    if (labelWrap) labelWrap.style.display = on ? "" : "none";
    if (panel) panel.style.display = on ? "" : "none";
  };

  N.render = function (dtReal, tH) {
    if (!ready) return;
    clock += dtReal;
    if (flyT < 1 && flyFrom) {
      flyT = Math.min(1, flyT + dtReal / 0.9);
      const e = flyT * flyT * (3 - 2 * flyT);
      camera.position.set(U.lerp(flyFrom.pos.x, flyTo.pos[0], e), U.lerp(flyFrom.pos.y, flyTo.pos[1], e), U.lerp(flyFrom.pos.z, flyTo.pos[2], e));
      controls.target.set(U.lerp(flyFrom.tgt.x, flyTo.tgt[0], e), U.lerp(flyFrom.tgt.y, flyTo.tgt[1], e), U.lerp(flyFrom.tgt.z, flyTo.tgt[2], e));
    }
    controls.update();
    const snapN = HN.at(tH);
    updateRivers(dtReal, snapN);
    updateReservoirs(snapN, clock);
    updateGaugesNat(snapN, clock);
    updateStorm(snapN, dtReal);
    updateBeacons(snapN, clock);
    updateLabels();
    panelClock += dtReal;
    if (panelClock > 0.5) { panelClock = 0; updatePanel(snapN, tH); }
    renderer.render(scene, camera);
  };
})();
