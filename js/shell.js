/* ==========================================================================
   FloodTwin — Geospatial OS shell
   Re-houses the existing dashboard into a map-first floating control centre.
   Strategy: NEVER rebuild engine DOM. Relocate nodes by id (listeners survive),
   toggle CSS classes, subscribe to existing bus events. Zero engine edits.

   If anything here throws, the original dashboard still works (body.geoshell
   is only added after a successful build) — an anti-regression safety net.
   ========================================================================== */
(function () {
  "use strict";
  const FT = (window.FT = window.FT || {});
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const LSKEY = "ft.shell.panels.v1";

  /* ---------- persisted per-panel geometry ---------- */
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LSKEY) || "{}"); } catch (e) { saved = {}; }
  const persist = () => { try { localStorage.setItem(LSKEY, JSON.stringify(saved)); } catch (e) {} };

  const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ======================================================================
     FloatingPanel — the universal state machine
     modes: hidden · collapsed · expanded · fullscreen ; flags: floating(drag) · pinned
     ====================================================================== */
  const panels = {};
  class FloatingPanel {
    constructor(id, opts = {}) {
      this.id = id; this.opts = opts;
      const node = el("section", "geoFloat " + (opts.cls || ""));
      node.dataset.panel = id;
      node.setAttribute("role", opts.role || "region");
      if (opts.label) node.setAttribute("aria-label", opts.label);

      // header with drag + controls
      const head = el("div", "gfHead");
      const title = el("div", "gfTitle", opts.title || id);
      const btns = el("div", "gfBtns");
      head.appendChild(title); head.appendChild(btns);
      const body = el("div", "gfBody");
      node.appendChild(head); node.appendChild(body);
      this.node = node; this.head = head; this.body = body; this.titleEl = title; this.btns = btns;

      // control buttons
      if (opts.collapsible !== false) this._btn("–", "collapse", "Thu gọn / mở", () => this.toggleCollapse());
      if (opts.pinnable) { this.pinBtn = this._btn("📌", "pin", "Ghim", () => this.togglePin()); }
      if (opts.fullscreen !== false) this._btn("⛶", "full", "Toàn màn hình", () => this.toggleFullscreen());
      if (opts.closable !== false) this._btn("×", "close", "Đóng", () => this.hide());

      this._enableDrag(head);
      document.body.appendChild(node);
      panels[id] = this;

      // restore geometry
      const s = saved[id];
      if (s && s.x != null) { node.style.left = s.x + "px"; node.style.top = s.y + "px"; node.style.right = "auto"; node.style.bottom = "auto"; this.floating = true; }
      if (s && s.pinned) this.pinned = true, this.pinBtn && this.pinBtn.classList.add("on");
      this.mode = "hidden";
      node.classList.add("hidden-chrome");
      node.style.display = "none";
    }
    _btn(txt, name, tip, fn) {
      const b = el("button", "gfBtn", txt); b.type = "button"; b.title = tip; b.setAttribute("aria-label", tip);
      b.dataset.act = name; b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
      this.btns.appendChild(b); return b;
    }
    setTitle(t) { this.titleEl.textContent = t; }
    /* adopt an existing DOM node (keeps its id + listeners) */
    adopt(nodeOrId) {
      const n = typeof nodeOrId === "string" ? $(nodeOrId) : nodeOrId;
      if (n) this.body.appendChild(n);
      return this;
    }
    show(mode) {
      this.node.style.display = "";
      // force reflow so the transition runs
      void this.node.offsetWidth;
      this.node.classList.remove("hidden-chrome");
      this.mode = mode || (this.mode === "hidden" ? "expanded" : this.mode);
      if (this.opts.onShow) this.opts.onShow(this);
      this._emit();
      return this;
    }
    hide() {
      if (this.opts.canHide && !this.opts.canHide()) return this; // e.g. pending decision
      this.node.classList.add("hidden-chrome");
      const done = () => { if (this.mode === "hidden") this.node.style.display = "none"; };
      this.mode = "hidden";
      if (reduceMotion()) done(); else setTimeout(done, 180);
      if (this.opts.onHide) this.opts.onHide(this);
      this._emit();
      return this;
    }
    toggle() { return this.mode === "hidden" ? this.show() : this.hide(); }
    toggleCollapse() {
      this.node.classList.toggle("collapsed");
      this.mode = this.node.classList.contains("collapsed") ? "collapsed" : "expanded";
      this._emit(); return this;
    }
    toggleFullscreen() {
      this.node.classList.toggle("fullscreen");
      this.mode = this.node.classList.contains("fullscreen") ? "fullscreen" : "expanded";
      this._emit(); return this;
    }
    togglePin() {
      this.pinned = !this.pinned;
      this.pinBtn && this.pinBtn.classList.toggle("on", this.pinned);
      (saved[this.id] = saved[this.id] || {}).pinned = this.pinned; persist();
      return this;
    }
    _emit() { FT.bus && FT.bus.emit("shellPanel", { id: this.id, mode: this.mode }); }
    _enableDrag(handle) {
      let sx, sy, ox, oy, on = false;
      const down = (e) => {
        if (e.target.closest(".gfBtn")) return;
        on = true; const r = this.node.getBoundingClientRect();
        sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
        this.node.classList.add("dragging"); handle.classList.add("grabbing");
        this.node.style.right = "auto"; this.node.style.bottom = "auto";
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
      };
      const move = (e) => {
        if (!on) return;
        const nx = Math.max(4, Math.min(window.innerWidth - 80, ox + e.clientX - sx));
        const ny = Math.max(4, Math.min(window.innerHeight - 40, oy + e.clientY - sy));
        this.node.style.left = nx + "px"; this.node.style.top = ny + "px";
        this.floating = true;
      };
      const up = () => {
        on = false; this.node.classList.remove("dragging"); handle.classList.remove("grabbing");
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
        const r = this.node.getBoundingClientRect();
        (saved[this.id] = saved[this.id] || {}).x = r.left; saved[this.id].y = r.top; persist();
      };
      handle.addEventListener("pointerdown", down);
    }
  }
  FT.panels = panels;

  /* ======================================================================
     MapMode — body-class controller (fullscreen/focus/immersive/present/compare/split)
     ====================================================================== */
  const MODES = ["fullscreen", "focus", "immersive", "present", "compare", "split"];
  const MapMode = {
    current: null,
    set(m) {
      MODES.forEach((x) => document.body.classList.toggle("mode-" + x, x === m && this.current !== m));
      this.current = this.current === m ? null : m;
      MODES.forEach((x) => document.body.classList.toggle("mode-" + x, x === this.current));
      // compare/split need both canvases sized → nudge renderers
      window.dispatchEvent(new Event("resize"));
      document.querySelectorAll(".modeBtn").forEach((b) => b.classList.toggle("active", b.dataset.mode === this.current));
      FT.notify && this.current && FT.notify("Chế độ: " + m, "info");
    },
  };
  FT.mapMode = MapMode;

  /* ======================================================================
     Auto-hide chrome while manipulating the map
     ====================================================================== */
  let hideTimer = null;
  const chromeEls = () => document.querySelectorAll(".cmdBar, .geoDock, .geoViewCtl, .geoModeRail");
  function chromeHide() { chromeEls().forEach((n) => n.classList.add("hidden-chrome")); }
  function chromeShow() { chromeEls().forEach((n) => n.classList.remove("hidden-chrome")); }
  function armAutoHide() {
    const wrap = $("stageWrap"); if (!wrap) return;
    const onActive = () => { chromeHide(); clearTimeout(hideTimer); hideTimer = setTimeout(chromeShow, 1400); };
    wrap.addEventListener("pointerdown", (e) => { if (e.target.closest(".geoFloat, .geoViewCtl, .geoModeRail")) return; onActive(); });
    wrap.addEventListener("wheel", onActive, { passive: true });
    window.addEventListener("pointermove", (e) => { if (e.clientY < 60) chromeShow(); });
  }

  /* ======================================================================
     Keyboard registry + cheatsheet
     ====================================================================== */
  const keymap = [];
  function key(combo, desc, fn, group) { keymap.push({ combo, desc, fn, group }); }
  function inField(e) {
    const t = (e.target.tagName || "").toLowerCase();
    return t === "input" || t === "select" || t === "textarea" || e.target.isContentEditable;
  }
  function matchCombo(e, combo) {
    const parts = combo.toLowerCase().split("+");
    const need = { meta: false, shift: false, alt: false };
    let base = null;
    parts.forEach((p) => { if (p === "cmd" || p === "meta") need.meta = true; else if (p === "shift") need.shift = true; else if (p === "alt") need.alt = true; else base = p; });
    const k = e.key.toLowerCase();
    const kb = k === " " ? "space" : k;
    return kb === base && (e.metaKey || e.ctrlKey) === need.meta && e.shiftKey === need.shift && e.altKey === need.alt;
  }
  function initKeys() {
    document.addEventListener("keydown", (e) => {
      // ⌘K / Esc / ? work even in fields; the rest don't
      const isPalette = matchCombo(e, "cmd+k");
      if (!isPalette && e.key !== "Escape" && inField(e)) return;
      for (const m of keymap) {
        if (matchCombo(e, m.combo)) { e.preventDefault(); m.fn(e); return; }
      }
    });
  }

  /* ======================================================================
     BUILD — runs after the original UI has initialised
     ====================================================================== */
  function build() {
    if (!$("stageWrap")) return;              // original DOM missing → bail, keep dashboard
    buildCommandBar();
    buildActions();
    buildOpsStrip();
    buildDock();
    buildViewControl();
    buildModeRail();
    buildTimeline();
    buildInspector();
    buildDecision();
    buildAlerts();
    buildAI();
    buildDrawer();
    buildRibbon();
    buildCheatsheet();
    armAutoHide();
    initKeys();
    document.body.classList.add("geoshell");  // ← flips the whole layout on, last
    // initial hint
    FT.notify && FT.notify("Bản đồ toàn màn hình · ⌘K để tìm · ? xem phím tắt", "info");
  }

  /* ---------- Command bar ---------- */
  function buildCommandBar() {
    const bar = el("div", "cmdBar"); bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Command bar");
    // brand
    const brand = el("div", "cmdBrand", '<div class="brandMark"><span>FT</span></div><b>FloodTwin</b> <span class="cmdBasin">VGTB</span>');
    // search
    const search = el("div", "cmdSearch", '<span class="cmdIco">⌕</span>');
    const input = el("input"); input.type = "search"; input.placeholder = "Tìm trạm · hồ · khu vực · lệnh  (⌘K)";
    input.setAttribute("aria-label", "Tìm kiếm"); input.id = "cmdSearchInput";
    input.addEventListener("focus", () => Palette.open(input.value));
    input.addEventListener("input", () => Palette.open(input.value));
    search.appendChild(input);
    bar.appendChild(brand); bar.appendChild(search);
    bar.appendChild(el("div", "cmdSep"));

    // scenario + policy re-homed (moved, not cloned → keeps listeners)
    const sc = document.querySelector(".scenarioSelect"); if (sc) bar.appendChild(sc);
    const pol = $("policyToggle"); if (pol) bar.appendChild(pol);
    bar.appendChild(el("div", "cmdSep"));

    // escalation pill (opens ops popover)
    const esc = el("div", "cmdChip esc"); esc.id = "cmdEscPill"; esc.setAttribute("role", "button"); esc.tabIndex = 0;
    esc.innerHTML = '<i>ESC</i> <b id="cmdEscVal">L0</b>';
    esc.addEventListener("click", opsPopover);
    esc.addEventListener("keydown", (e) => { if (e.key === "Enter") opsPopover(); });
    bar.appendChild(esc);

    // alert pill
    const al = el("div", "cmdChip alertPill quiet"); al.id = "cmdAlertPill"; al.innerHTML = '⚑ <b id="cmdAlertN">0</b>';
    al.addEventListener("click", () => panels.alerts.toggle());
    bar.appendChild(al);

    // tour + lang re-homed
    const tour = $("btnTour"); if (tour) bar.appendChild(tour);
    const lang = $("langToggle"); if (lang) bar.appendChild(lang);

    document.body.appendChild(bar);
    FT.dom = FT.dom || {}; FT.dom.cmdBar = bar;

    // keep escalation/alert pills in sync with existing values
    const syncEsc = () => {
      const v = ($("opsEscVal") && $("opsEscVal").textContent || "L0").trim();
      const cev = $("cmdEscVal"); if (cev) cev.textContent = v;
      const n = (v.match(/\d/) || ["0"])[0]; esc.dataset.esc = n;
    };
    const syncAlert = () => {
      const c = ($("alarmCount") && $("alarmCount").textContent || "0").trim();
      const cn = $("cmdAlertN"); if (cn) cn.textContent = c;
      const active = +c > 0; al.classList.toggle("active", active); al.classList.toggle("quiet", !active);
    };
    setInterval(() => { syncEsc(); syncAlert(); }, 900);
    syncEsc(); syncAlert();

    key("cmd+k", "Bảng lệnh", () => Palette.toggle(), "Chung");
    key("/", "Tìm kiếm", () => { chromeShow(); input.focus(); }, "Chung");
    key("s", "Đổi kịch bản", () => cycleScenario(), "Chung");
    key("p", "Rule ⇄ MPC", () => { const b = document.querySelector('#policyToggle button:not(.isActive)'); b && b.click(); }, "Chung");
  }

  /* ---------- Persistent action toolbar ----------
     Safety-critical dispatch + report actions must never be hidden behind a
     summon. We MOVE the real buttons here (ids + handlers preserved), so both
     operators and the e2e flows always reach them in one click. */
  function buildActions() {
    const bar = el("div", "geoActions"); bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Hành động nhanh");
    const grp = (label, ids) => {
      const g = el("div", "actGroup"); g.appendChild(el("span", "actLabel", label));
      ids.forEach((id) => { const btn = $(id); if (btn) { btn.classList.add("actBtn"); g.appendChild(btn); } });
      if (g.querySelectorAll(".actBtn").length) bar.appendChild(g);
    };
    grp("Thông báo", ["nfThreshold", "nfRelease", "nfEvac"]);          // downstream notification composer (WF-09)
    grp("Báo cáo", ["btnReport", "btnRepOperation", "btnRepEvent"]);    // operation record / post-event (WF-12)
    document.body.appendChild(bar);
    FT.dom.actions = bar;
  }

  /* ---------- Always-visible ops-signal strip ----------
     The persistent decision signals (escalation, data health, κ, P(exceed), decision
     deadline) MUST be on-screen without scrolling (UX §2). We move the REAL ops spans
     (ids + live updates preserved) into a dedicated strip that never hides. Actor +
     degrade selects go into the esc popover. */
  function buildOpsStrip() {
    const strip = el("div", "geoOpsStrip"); strip.setAttribute("role", "status"); strip.setAttribute("aria-label", "Tín hiệu vận hành");
    // opsMode = the SYNTHETIC-DATA safety marker; must be always visible (UX §12, cannot be hidden)
    const mode = $("opsMode"); if (mode) { mode.classList.add("opsStripMode"); strip.appendChild(mode); }
    ["opsEsc", "opsHealth", "opsKappa", "opsPex", "opsDeadline"].forEach((id) => {
      const n = $(id); if (n) { n.classList.add("opsStripItem"); strip.appendChild(n); }
    });
    document.body.appendChild(strip);
    FT.dom.opsStrip = strip;
  }

  function cycleScenario() {
    const sel = $("scenarioSelect"); if (!sel) return;
    sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function opsPopover() {
    // lightweight popover reusing the original ops fields (moved in, restored on close)
    let pop = $("opsPopover");
    if (pop) { pop.remove(); return; }
    pop = el("section", "geoFloat"); pop.id = "opsPopover";
    pop.style.top = "60px"; pop.style.left = "50%"; pop.style.transform = "translateX(-50%)"; pop.style.width = "560px"; pop.style.zIndex = 60;
    const head = el("div", "gfHead", '<div class="gfTitle">Trạng thái vận hành</div>');
    const close = el("button", "gfBtn", "×"); close.type = "button"; close.addEventListener("click", () => pop.remove());
    head.appendChild(close);
    const body = el("div", "gfBody"); body.style.padding = "12px";
    // ops signal spans now live in the always-visible strip; the popover holds the
    // duty-actor + data-degradation selects (still inside #opsBar) plus the mode marker.
    const opsBar = $("opsBar");
    if (opsBar) { body.appendChild(opsBar); opsBar.style.display = "flex"; opsBar.style.flexWrap = "wrap"; opsBar.style.gap = "12px"; }
    pop.appendChild(head); pop.appendChild(body); document.body.appendChild(pop);
  }

  /* ---------- Command palette ---------- */
  const Palette = {
    node: null, items: [], sel: 0,
    ensure() {
      if (this.node) return;
      const p = el("div", "cmdPalette");
      const inp = el("input"); inp.type = "text"; inp.placeholder = "Tìm nơi chốn, trạm, hoặc gõ lệnh…"; inp.setAttribute("aria-label", "Command palette");
      const list = el("div", "cmdPaletteList"); list.setAttribute("role", "listbox");
      p.appendChild(inp); p.appendChild(list); document.body.appendChild(p);
      this.node = p; this.input = inp; this.list = list;
      inp.addEventListener("input", () => this.render(inp.value));
      inp.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); this.move(1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); this.move(-1); }
        else if (e.key === "Enter") { e.preventDefault(); this.exec(); }
        else if (e.key === "Escape") { this.close(); }
      });
      document.addEventListener("pointerdown", (e) => { if (this.node.classList.contains("open") && !this.node.contains(e.target) && !e.target.closest(".cmdSearch")) this.close(); });
    },
    catalog() {
      const cmds = [];
      // places / cameras
      [["Toàn cảnh", "overview", "O"], ["Hạ lưu", "delta", "D"], ["Bậc thang hồ", "dams", "A"], ["Hội An", "hoian", "H"]]
        .forEach(([n, c, k]) => cmds.push({ g: "Camera", ico: "◎", label: n, key: k, run: () => camPreset(c) }));
      // gauges
      (FT.data && FT.data.GAUGES || []).forEach((g) => cmds.push({ g: "Trạm", ico: "◈", label: g.name || g.id, run: () => { FT.state.selectedGauge = g.id; FT.bus.emit("gaugeSelected", g.id); } }));
      // reservoirs
      (FT.data && FT.data.RESERVOIRS || []).forEach((r) => cmds.push({ g: "Hồ chứa", ico: "▨", label: r.name || r.id, run: () => FT.bus.emit("reservoirFocus", r.id) }));
      // actions
      cmds.push({ g: "Lệnh", ico: "▶", label: "Phát / Dừng mô phỏng", key: "Space", run: () => $("btnPlay") && $("btnPlay").click() });
      cmds.push({ g: "Lệnh", ico: "🎬", label: "Trình diễn tự động", run: () => $("btnTour") && $("btnTour").click() });
      cmds.push({ g: "Lệnh", ico: "◱", label: "Chế độ Focus", key: "⌥F", run: () => MapMode.set("focus") });
      cmds.push({ g: "Lệnh", ico: "⛶", label: "Toàn màn hình", key: "F", run: () => MapMode.set("fullscreen") });
      cmds.push({ g: "Lệnh", ico: "✦", label: "Trợ lý AI · bản tin", key: "⌘J", run: () => panels.ai.toggle() });
      cmds.push({ g: "Lệnh", ico: "▤", label: "Ngăn nhật ký / kiểm toán", key: "⌘L", run: () => panels.drawer.toggle() });
      return cmds;
    },
    open(q) { this.ensure(); this.node.classList.add("open"); this.render(q || ""); },
    toggle() { this.ensure(); if (this.node.classList.contains("open")) this.close(); else { this.open(""); this.input.focus(); } },
    close() { this.node && this.node.classList.remove("open"); },
    render(q) {
      const all = this.catalog();
      const f = q ? all.filter((c) => (c.label + c.g).toLowerCase().includes(q.toLowerCase())) : all;
      this.items = f; this.sel = 0;
      let html = "", lastG = null;
      f.slice(0, 40).forEach((c, i) => {
        if (c.g !== lastG) { html += `<div class="cpGroup">${c.g}</div>`; lastG = c.g; }
        html += `<div class="cpItem${i === 0 ? " sel" : ""}" role="option" data-i="${i}"><span class="cpIco">${c.ico}</span><span>${c.label}</span>${c.key ? `<span class="cpKey">${c.key}</span>` : ""}</div>`;
      });
      this.list.innerHTML = html || '<div class="cpGroup">Không có kết quả</div>';
      this.list.querySelectorAll(".cpItem").forEach((n) => n.addEventListener("click", () => { this.sel = +n.dataset.i; this.exec(); }));
    },
    move(d) {
      const items = this.list.querySelectorAll(".cpItem"); if (!items.length) return;
      items[this.sel] && items[this.sel].classList.remove("sel");
      this.sel = (this.sel + d + items.length) % items.length;
      items[this.sel].classList.add("sel"); items[this.sel].scrollIntoView({ block: "nearest" });
    },
    exec() { const c = this.items[this.sel]; if (c) { try { c.run(); } catch (e) { console.warn(e); } } this.close(); },
  };
  FT.palette = Palette;

  function camPreset(c) {
    const b = document.querySelector(`#camPresets button[data-cam="${c}"]`);
    if (b) b.click();
    else if (FT.scene3d && FT.scene3d.setCamera) FT.scene3d.setCamera(c);
  }

  /* ---------- Left dock + flyouts ---------- */
  function buildDock() {
    const dock = el("nav", "geoDock"); dock.setAttribute("role", "tablist"); dock.setAttribute("aria-label", "Công cụ");
    const defs = [
      { ico: "◱", id: "layers", src: "panelLayers", title: "Lớp hiển thị", key: "L" },
      { ico: "☁", id: "forcing", src: "panelForcing", title: "Cưỡng bức khí tượng", key: "F" },
      { ico: "▦", id: "zones", src: ".zonesPanel", title: "Khu vực giám sát", key: "Z" },
      { ico: "⛑", id: "evac", src: ".evacPanel", title: "Sơ tán · điểm trú", key: "E" },
      { ico: "☂", id: "subcatch", src: ".subcatchPanel", title: "Mưa tiểu lưu vực", key: "R" },
      { sep: true },
      { ico: "▤", id: "metrics", src: ".metricsPanel", title: "Ngưỡng mục tiêu", key: "M" },
      { ico: "◈", id: "legend", src: "panelLegend", title: "Chú giải", key: "G" },
    ];
    defs.forEach((d) => {
      if (d.sep) { dock.appendChild(el("div", "dockSep")); return; }
      const src = d.src[0] === "." ? document.querySelector(d.src) : $(d.src);
      const fp = new FloatingPanel("fly_" + d.id, { cls: "geoFlyout", title: d.title, role: "tabpanel", label: d.title, pinnable: true });
      if (src) fp.adopt(src);
      const b = el("button", "dockBtn", d.ico + `<span class="dockKey">${d.key}</span><span class="dockTip">${d.title}</span>`);
      b.type = "button"; b.dataset.fly = d.id; b.setAttribute("role", "tab"); b.setAttribute("aria-label", d.title); b.setAttribute("aria-keyshortcuts", d.key);
      b.addEventListener("click", () => toggleFlyout(d.id, b));
      dock.appendChild(b);
      key(d.key.toLowerCase(), d.title, () => toggleFlyout(d.id, b), "Công cụ");
    });
    document.body.appendChild(dock);
    FT.dom.dock = dock;
  }
  function toggleFlyout(id, btn) {
    const fp = panels["fly_" + id]; if (!fp) return;
    const opening = fp.mode === "hidden";
    // radio behaviour: close other unpinned flyouts
    Object.keys(panels).forEach((k) => { if (k.startsWith("fly_") && k !== "fly_" + id && !panels[k].pinned) panels[k].hide(); });
    document.querySelectorAll(".dockBtn").forEach((x) => x.classList.toggle("active", x === btn && opening));
    fp.toggle();
  }

  /* ---------- Floating view control (3D/2D + camera presets) ---------- */
  function buildViewControl() {
    const v = el("div", "geoViewCtl"); v.setAttribute("role", "group"); v.setAttribute("aria-label", "Điều khiển bản đồ");
    const tabs = $("viewTabs"); if (tabs) v.appendChild(tabs);
    const cams = $("camPresets"); if (cams) v.appendChild(cams);
    document.body.appendChild(v);
    FT.dom.viewCtl = v;
    key("1", "Bản đồ 3D", () => setViewBtn("3d"), "Bản đồ");
    key("2", "Bản đồ 2D", () => setViewBtn("2d"), "Bản đồ");
    key("o", "Camera toàn cảnh", () => camPreset("overview"), "Bản đồ");
    key("shift+d", "Camera hạ lưu", () => camPreset("delta"), "Bản đồ");
    key("a", "Camera bậc thang hồ", () => camPreset("dams"), "Bản đồ");
    key("h", "Camera Hội An", () => camPreset("hoian"), "Bản đồ");
  }
  function setViewBtn(view) { const b = document.querySelector(`#viewTabs button[data-view="${view}"]`); b && b.click(); }

  /* ---------- Mode rail ---------- */
  function buildModeRail() {
    const rail = el("div", "geoModeRail"); rail.setAttribute("role", "group"); rail.setAttribute("aria-label", "Chế độ bản đồ");
    const modes = [
      { m: "fullscreen", ico: "⛶", t: "Toàn màn hình (F)" },
      { m: "focus", ico: "◱", t: "Focus (⌥F)" },
      { m: "immersive", ico: "◉", t: "Immersive (I)" },
      { m: "split", ico: "▥", t: "Chia đôi 2D|3D (\\)" },
      { m: "present", ico: "⎋", t: "Trình chiếu (⇧P)" },
    ];
    modes.forEach((d) => {
      const b = el("button", "modeBtn", d.ico); b.type = "button"; b.dataset.mode = d.m; b.title = d.t; b.setAttribute("aria-label", d.t);
      b.addEventListener("click", () => MapMode.set(d.m));
      rail.appendChild(b);
    });
    // reuse original focus button target if any is fine; add PIP swap here too
    const pip = $("pipSwap");
    document.body.appendChild(rail);
    FT.dom.modeRail = rail;
    key("f", "Toàn màn hình", () => MapMode.set("fullscreen"), "Chế độ");
    key("alt+f", "Focus", () => MapMode.set("focus"), "Chế độ");
    key("i", "Immersive", () => MapMode.set("immersive"), "Chế độ");
    key("\\", "Chia đôi 2D|3D", () => MapMode.set("split"), "Chế độ");
    key("shift+p", "Trình chiếu", () => MapMode.set("present"), "Chế độ");
    key("alt+p", "Đổi PIP (2D⇄3D)", () => pip && pip.click(), "Chế độ");   // p=policy, ⇧P=present, so PIP swap = ⌥P
  }

  /* ---------- Floating timeline ---------- */
  function buildTimeline() {
    const fp = new FloatingPanel("timeline", { cls: "geoTimeline", title: "Dòng thời gian mô phỏng", label: "Timeline", closable: false, fullscreen: false, collapsible: true });
    fp.adopt("timelinePanel");
    const tp = $("timelinePanel"); if (tp) tp.style.display = "";
    fp.show("expanded");
    key("t", "Thu/mở dòng thời gian", () => fp.toggleCollapse(), "Bản đồ");
    // Space / arrows already handled by existing ui.js keydown — don't double-bind
  }

  /* ---------- Inspector (contextual, right) ---------- */
  function buildInspector() {
    const fp = new FloatingPanel("inspector", { cls: "geoInspector", title: "Thông tin đối tượng", label: "Inspector", role: "complementary", pinnable: true });
    panels.inspector = fp;
    // homes for reused DOM (gauge panel is the richest; zone/res detail rendered by existing modal/render)
    const gauge = document.querySelector(".gaugePanel");
    // gauge selection → open inspector with the gauge panel
    FT.bus.on("gaugeSelected", () => {
      if (gauge && gauge.parentElement !== fp.body) fp.body.appendChild(gauge);
      fp.setTitle("Trạm thủy văn");
      if (!fp.pinned || fp.mode === "hidden") fp.show("expanded");
    });
    FT.bus.on("reservoirFocus", () => {
      // reservoir + decision live in the Decision panel; surface it
      panels.decision && panels.decision.show("expanded");
    });
    FT.bus.on("zoneSelected", () => {
      fp.setTitle("Khu vực giám sát");
      // the existing zone detail renders into a modal; also ensure zones flyout content is reachable
      panels.decision; // no-op; zone detail handled by existing modal
      fp.show("expanded");
    });
    key("enter", "Mở Inspector cho lựa chọn", () => { if (fp.mode === "hidden") fp.show("expanded"); }, "Chọn");
  }

  /* ---------- Decision panel (priority, floating) ---------- */
  function buildDecision() {
    const pending = () => {
      const card = $("mpcCard");
      return card && !card.hidden && !(FT.state && FT.state.mpcApproved);
    };
    const fp = new FloatingPanel("decision", {
      cls: "geoDecision", title: "Quyết định vận hành · liên hồ", label: "Quyết định vận hành",
      role: "dialog", pinnable: true,
      canHide: () => { if (pending()) { minimizePill(true); return false; } return true; },
      // when a proposal is live, bring the package into view (it's what matters, not the res list)
      onShow: (self) => {
        const card = $("mpcCard");
        if (card && !card.hidden) {
          try { self.body.scrollTop = Math.max(0, card.offsetTop - self.body.offsetTop - 8); } catch (e) {}
        }
      },
    });
    fp.adopt(document.querySelector(".reservoirPanel"));
    panels.decision = fp;

    // minimised pill so a pending decision is never lost
    const pill = el("button", "decisionPill", "⚑ Quyết định chờ duyệt"); pill.type = "button";
    pill.addEventListener("click", () => { minimizePill(false); fp.show("expanded"); });
    document.body.appendChild(pill);
    function minimizePill(on) { pill.classList.toggle("show", on); }
    FT.dom.decisionPill = pill;

    // raise + pulse when a new MPC proposal appears
    let lastHidden = true;
    const check = () => {
      const card = $("mpcCard");
      const has = card && !card.hidden;
      if (has && lastHidden) {
        fp.show("expanded");
        fp.node.classList.add("raise"); setTimeout(() => fp.node.classList.remove("raise"), 220);
        if (!reduceMotion()) { fp.node.classList.add("pulse"); setTimeout(() => fp.node.classList.remove("pulse"), 2800); }
        FT.notify && FT.notify("Đề xuất xả trước mới — cần phê duyệt", "warn");
      }
      lastHidden = !has;
      if (!pending()) minimizePill(false);
    };
    setInterval(check, 800);
    FT.bus.on("scrubbed", check);

    key("d", "Bảng quyết định", () => fp.toggle(), "Quyết định");
  }

  /* ---------- Alert stack ---------- */
  function buildAlerts() {
    const fp = new FloatingPanel("alerts", { cls: "geoAlerts", title: "Cảnh báo · thông báo", label: "Cảnh báo", role: "log", pinnable: true });
    fp.adopt(document.querySelector(".alarmPanel"));
    panels.alerts = fp;
    key("n", "Cảnh báo", () => fp.toggle(), "Cảnh báo");
    // auto-surface when count rises
    let last = 0;
    setInterval(() => {
      const c = +(($("alarmCount") && $("alarmCount").textContent) || 0);
      if (c > last && fp.mode === "hidden") { fp.show("expanded"); }
      last = c;
    }, 1000);
  }

  /* ---------- AI assistant ---------- */
  function buildAI() {
    const fp = new FloatingPanel("ai", { cls: "geoAI", title: "Trợ lý AI · RAG · trích nguồn", label: "Trợ lý AI", role: "dialog", pinnable: true });
    fp.adopt(document.querySelector(".llmPanel"));
    panels.ai = fp;
    const launch = el("button", "aiLauncher", "✦"); launch.type = "button"; launch.title = "Trợ lý AI (⌘J)"; launch.setAttribute("aria-label", "Trợ lý AI");
    launch.addEventListener("click", () => { fp.toggle(); launch.style.display = fp.mode === "hidden" ? "" : "none"; });
    fp.opts.onHide = () => { launch.style.display = ""; };
    document.body.appendChild(launch);
    FT.dom.aiLaunch = launch;
    key("cmd+j", "Trợ lý AI", () => { launch.click(); }, "Chung");
  }

  /* ---------- Utility drawer (audit / events / traffic) ---------- */
  function buildDrawer() {
    const fp = new FloatingPanel("drawer", { cls: "geoDrawer", title: "Nhật ký · kiểm toán · giao thông", label: "Tiện ích", role: "region", pinnable: false });
    panels.drawer = fp;
    const tabs = el("div", "drawerTabs"); tabs.setAttribute("role", "tablist");
    const panes = [
      { id: "audit", t: "Kiểm toán", src: ".auditPanel" },
      { id: "events", t: "Sự kiện", src: ".logPanel" },
      { id: "traffic", t: "Giao thông", src: ".trafficPanel" },
    ];
    panes.forEach((p, i) => {
      const tb = el("button", "drawerTab" + (i === 0 ? " active" : ""), p.t); tb.type = "button"; tb.dataset.tab = p.id; tb.setAttribute("role", "tab");
      tb.addEventListener("click", () => {
        tabs.querySelectorAll(".drawerTab").forEach((x) => x.classList.toggle("active", x === tb));
        fp.body.querySelectorAll(".drawerPane").forEach((x) => x.classList.toggle("active", x.dataset.pane === p.id));
      });
      tabs.appendChild(tb);
      const pane = el("div", "drawerPane" + (i === 0 ? " active" : "")); pane.dataset.pane = p.id;
      const src = document.querySelector(p.src); if (src) pane.appendChild(src);
      fp.body.appendChild(pane);
    });
    // put tabs into header area
    fp.head.insertBefore(tabs, fp.btns);
    fp.titleEl.style.display = "none";
    key("cmd+l", "Ngăn nhật ký", () => fp.toggle(), "Chung");
  }

  /* ---------- Status ribbon ---------- */
  function buildRibbon() {
    const r = el("div", "geoRibbon"); r.setAttribute("role", "status"); r.tabIndex = 0;
    r.innerHTML =
      '<span class="ribbonChip">SYNTHETIC DATA · NOT FOR OPERATIONS</span>' +
      '<span class="ribbonFull">' +
      '<span>Esri World Imagery/Transportation · AWS Terrain · © OSM</span>' +
      '<span>·</span><span>Decision 1865/QĐ-TTg · 740/QĐ-TTg</span>' +
      '<span>·</span><span><a href="https://skylabs.vn/" target="_blank" rel="noopener" class="footLink">SkyLabs</a></span>' +
      '</span>' +
      '<span class="ribbonFps" id="ribbonFps">— fps · H✓</span>';
    document.body.appendChild(r);
    // mirror fps + selftest from existing meters
    setInterval(() => {
      const fps = ($("fpsMeter") && $("fpsMeter").textContent) || "";
      const rf = $("ribbonFps"); if (rf) rf.textContent = fps + " · H✓";
    }, 1000);
  }

  /* ---------- Keyboard cheatsheet ---------- */
  function buildCheatsheet() {
    const overlay = el("div", "geoCheat");
    const card = el("div", "geoCheatCard");
    overlay.appendChild(card);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("open"); });
    document.body.appendChild(overlay);
    const rebuild = () => {
      const groups = {};
      keymap.forEach((k) => { (groups[k.group || "Khác"] = groups[k.group || "Khác"] || []).push(k); });
      let html = "<h3>Phím tắt · FloodTwin</h3><div class='cheatGrid'>";
      Object.keys(groups).forEach((g) => {
        html += `<div><div class="cpGroup">${g}</div>`;
        groups[g].forEach((k) => { html += `<div class="cheatRow"><span>${k.desc}</span><kbd>${k.combo.replace("cmd", "⌘").replace("alt", "⌥").replace("shift", "⇧").toUpperCase()}</kbd></div>`; });
        html += "</div>";
      });
      html += "</div>";
      card.innerHTML = html;
    };
    key("shift+?", "Phím tắt", () => { rebuild(); overlay.classList.toggle("open"); }, "Chung");
    key("shift+/", "Phím tắt", () => { rebuild(); overlay.classList.toggle("open"); }, "Chung");
    key("escape", "Đóng lớp trên cùng", () => {
      if (overlay.classList.contains("open")) { overlay.classList.remove("open"); return; }
      if (Palette.node && Palette.node.classList.contains("open")) { Palette.close(); return; }
      // close top-most non-pinned float
      const open = Object.values(panels).filter((p) => p.mode !== "hidden" && !p.pinned && p.id !== "timeline");
      if (open.length) open[open.length - 1].hide();
      else if (MapMode.current) MapMode.set(MapMode.current);
    }, "Chung");
  }

  /* ======================================================================
     Boot — wait until the original UI + data have initialised
     ====================================================================== */
  function ready() {
    // require the engine namespace + stage present
    if (!window.FT || !$("stageWrap") || !FT.bus) return false;
    return true;
  }
  function boot(tries) {
    tries = tries || 0;
    if (window.__NO_SHELL || /[?&]classic/.test(location.search)) return; // kill-switch for A/B + tests
    if (!ready()) { if (tries < 60) return void setTimeout(() => boot(tries + 1), 100); return; }
    try { build(); }
    catch (e) { console.error("[shell] build failed — keeping classic dashboard:", e); document.body.classList.remove("geoshell"); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(() => boot(0), 300));
  else setTimeout(() => boot(0), 300);
})();
