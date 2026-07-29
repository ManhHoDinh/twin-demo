(function () {
  "use strict";

  const FT = window.FT;
  if (!FT || !FT.workspaces || !FT.facilities) return;

  const DEMO_STATUS = Object.freeze({
    PROPOSED: "PROPOSED",
    SUBMITTED: "SUBMITTED",
    APPROVED: "APPROVED",
    NOTIFIED: "NOTIFIED",
    EXECUTING: "EXECUTING",
    VERIFIED: "VERIFIED",
    CLOSED: "CLOSED",
    ASSESSED: "ASSESSED",
    NOT_IN_CURRENT_DEMO: "NOT_IN_CURRENT_DEMO",
  });

  const DEMO_ORDER = Object.freeze(["a-vuong", "song-bung-4", "dak-mi-4", "song-tranh-2"]);

  function el(tag, className, attrs) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      Object.keys(attrs).forEach((key) => {
        const value = attrs[key];
        if (value == null) return;
        if (key === "text") node.textContent = value;
        else if (key === "dataset") Object.assign(node.dataset, value);
        else node.setAttribute(key, value);
      });
    }
    return node;
  }

  function text(tag, className, value) {
    return el(tag, className, { text: value == null || value === "" ? "—" : String(value) });
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "—";
    return value.toLocaleString("en-US", { maximumFractionDigits: digits == null ? 1 : digits });
  }

  function relTime() {
    return FT.util && FT.util.rel ? FT.util.rel(FT.state.timeH) : `T${FT.state.timeH >= 0 ? "+" : ""}${Math.round(FT.state.timeH)}h`;
  }

  function getSnapshot() {
    return FT.releaseOps && FT.releaseOps.snapshot ? FT.releaseOps.snapshot() : null;
  }

  function workflowForFacility(snapshot, facilityId) {
    const eventId = snapshot && snapshot.event && snapshot.event.id;
    const orders = snapshot && snapshot.orders ? Object.values(snapshot.orders) : [];
    const order = orders.find((item) => item.facilityId === facilityId && item.eventId === eventId);
    if (order) return order.status || DEMO_STATUS.APPROVED;
    const proposals = snapshot && snapshot.proposals ? Object.values(snapshot.proposals) : [];
    const proposal = proposals.find((item) => item.facilityId === facilityId && item.eventId === eventId);
    if (proposal) return proposal.status || DEMO_STATUS.SUBMITTED;
    return null;
  }

  function statusForFacility(snapshot, facility) {
    const workflow = workflowForFacility(snapshot, facility.id);
    if (workflow) return workflow;
    return facility.demoReservoirId ? DEMO_STATUS.ASSESSED : DEMO_STATUS.NOT_IN_CURRENT_DEMO;
  }

  function reservoirStateFor(facility, hydroSnap) {
    if (!facility.demoReservoirId || !hydroSnap || !hydroSnap.reservoirs) return null;
    const r = hydroSnap.reservoirs[facility.demoReservoirId];
    return r || null;
  }

  function currentDecision() {
    if (!FT.ops || !FT.ops.package || !FT.hydro || !FT.hydro.ready || !FT.hydro.at || !FT.roles) return null;
    const snap = FT.hydro.at(FT.state.timeH);
    const pkg = FT.ops.package(snap);
    const decisionId = FT.roles.decisionForProposal(pkg, snap);
    if (!decisionId) return null;
    return {
      id: decisionId,
      accountable: FT.roles.accountable(decisionId),
      consulted: FT.roles.consulted(decisionId),
      kind: pkg && pkg.kind,
    };
  }

  function hydroSnapshot() {
    return FT.hydro && FT.hydro.ready && FT.hydro.at ? FT.hydro.at(FT.state.timeH) : null;
  }

  function setText(root, selector, value) {
    const node = root.querySelector(selector);
    if (node) node.textContent = value == null || value === "" ? "—" : String(value);
  }

  function kpi(label, value, key, note) {
    const card = el("article", "cityKpi", { dataset: { cityKpi: key } });
    card.append(text("span", "cityKpiLabel", label), text("strong", "cityKpiValue", value));
    if (note) card.append(text("span", "cityKpiNote", note));
    return card;
  }

  function renderHeader(coverage) {
    const head = el("header", "roleDashboardHead");
    const titleWrap = el("div", "roleDashboardTitle");
    titleWrap.append(
      text("p", "roleEyebrow", "City operations"),
      text("h2", "", "Municipal coordination dashboard"),
      text("p", "roleDashboardLead", "Registry coverage, accountable decisions, downstream simulation and readiness evidence for the shared flood workflow.")
    );
    const banner = el("p", "citySyntheticBanner", { dataset: { provenance: "synthetic" } });
    banner.textContent = `Synthetic simulation workspace · ${coverage.total} municipal facilities in source scope · ${relTime()}`;
    head.append(titleWrap, banner);
    return head;
  }

  function renderKpis(coverage) {
    const wrap = el("div", "cityKpis");
    wrap.append(
      kpi("Municipal scope", coverage.total, "total", "DN registry source"),
      kpi("Named facilities", coverage.named, "named", "authoritative names"),
      kpi("Unresolved identities", coverage.unresolved, "unresolved", "not row-expanded")
    );
    return wrap;
  }

  function renderPortfolio(facilities, snapshot, hydroSnap) {
    const aside = el("aside", "cityPortfolio", { dataset: { cityPortfolio: "" }, "aria-label": "Governed hydropower portfolio" });
    aside.append(text("h3", "", "Governed portfolio"));
    const list = el("div", "cityFacilityList");
    const sorted = facilities.slice().sort((a, b) => {
      const da = DEMO_ORDER.indexOf(a.id);
      const db = DEMO_ORDER.indexOf(b.id);
      if (da !== -1 || db !== -1) return (da === -1 ? 999 : da) - (db === -1 ? 999 : db);
      return a.name.localeCompare(b.name, "vi");
    });
    sorted.forEach((facility) => {
      const state = statusForFacility(snapshot, facility);
      const row = el("article", "cityFacilityRow", {
        dataset: { cityFacilityRow: "", state, facilityId: facility.id },
      });
      row.append(text("strong", "", facility.name));
      const meta = el("span", "cityFacilityMeta");
      meta.append(
        text("span", "statePill", state),
        text("span", "", facility.demoReservoirId ? "Demo-mapped hydro state" : "Registry-only municipal identity")
      );
      row.append(meta);
      const reservoir = reservoirStateFor(facility, hydroSnap);
      if (facility.demoReservoirId) {
        row.append(text("span", "cityFacilityMetric", reservoir ? `Z ${fmt(reservoir.Z, 1)} m · O ${fmt(reservoir.O, 0)} m3/s` : "Simulation pending"));
        const button = el("button", "cityPlantLink", {
          type: "button",
          dataset: { plantFacilityId: facility.id },
          "aria-label": `Open plant workspace for ${facility.name}`,
        });
        button.textContent = "Plant route";
        button.addEventListener("click", () => FT.workspaces.navigate("plant", { facilityId: facility.id }));
        row.append(button);
      }
      list.append(row);
    });
    aside.append(list);
    return aside;
  }

  function renderTimeline(facilities, snapshot) {
    const section = el("section", "cityTimeline", { dataset: { cityTimeline: "" }, "aria-label": "Facility process timeline" });
    section.append(text("h3", "", "Process timeline"));
    DEMO_ORDER.map((id) => facilities.find((facility) => facility.id === id)).filter(Boolean).forEach((facility) => {
      const state = statusForFacility(snapshot, facility);
      const row = el("article", "cityProcessRow", {
        dataset: { processRow: "", state, facilityId: facility.id },
      });
      row.append(text("span", "cityProcessFacility", facility.name), text("strong", "cityProcessState", state));
      row.append(text("span", "cityProcessNote", "Shared workflow state or assessed demo baseline; no plant execution control exposed."));
      section.append(row);
    });
    return section;
  }

  function renderDecisionQueue(snapshot) {
    const section = el("section", "cityDecisionQueue", { dataset: { cityDecisionQueue: "" }, "aria-label": "Decision queue" });
    section.append(text("h3", "", "Decision queue"));
    section.append(el("article", "cityDecisionCard pending", { dataset: { cityDecisionCard: "" } }));
    section.append(text("p", "cityQueueMeta", "—"));
    return section;
  }

  function renderImpact(hydroSnap) {
    const section = el("section", "cityImpact", { dataset: { cityImpact: "" }, "aria-label": "Downstream simulation impact" });
    section.append(text("h3", "", "Downstream impact"));
    const gauges = FT.data && FT.data.GAUGES ? FT.data.GAUGES.slice(0, 4) : [];
    gauges.forEach((gauge) => {
      const state = hydroSnap && hydroSnap.gauges ? hydroSnap.gauges[gauge.id] : null;
      const item = el("article", "cityGaugeCard", { dataset: { provenance: "simulation", cityGaugeId: gauge.id } });
      item.append(
        text("span", "", gauge.name),
        text("strong", "", state ? `${fmt(state.stage, 2)} m` : "—"),
        text("span", "cityGaugeState", state ? `Alert ${state.alert} · trend ${fmt(state.trend, 2)} m/3h` : "Simulation unavailable")
      );
      section.append(item);
    });
    section.append(text("p", "cityProvenance", "Simulation provenance: FT.hydro.at(FT.state.timeH), synthetic demo data; not observed real-time telemetry."));
    return section;
  }

  function renderReadiness() {
    const section = el("section", "cityReadiness", { dataset: { cityReadiness: "" }, "aria-label": "Notification and audit readiness" });
    section.append(text("h3", "", "Readiness"));
    const entries = FT.ops && FT.ops.audit && Array.isArray(FT.ops.audit.entries) ? FT.ops.audit.entries : [];
    const notifications = entries.filter((entry) => /^notify|notification/i.test(entry.action || ""));
    const decisions = entries.filter((entry) => /^decision|release\./i.test(entry.action || ""));
    const grid = el("div", "cityReadinessGrid");
    grid.append(
      kpi("Audit entries", entries.length, "audit", "append-only local log"),
      kpi("Notification evidence", notifications.length, "notifications", "dispatch not assumed"),
      kpi("Workflow evidence", decisions.length, "workflow", "release/decision trail")
    );
    section.append(grid);
    section.append(text("p", "cityProvenance", "Readiness source/provenance: FT.ops.audit.entries. Zero means no recorded evidence in this browser session."));
    return section;
  }

  function renderUnresolved(coverage) {
    const card = el("article", "cityUnresolvedEvidence", { dataset: { cityUnresolvedEvidence: "", provenance: "registry" } });
    card.textContent = `${coverage.unresolved} identities awaiting authoritative registry`;
    return card;
  }

  function renderCity() {
    const coverage = FT.facilities.coverage();
    const facilities = FT.facilities.all();
    const snapshot = getSnapshot();
    const hydroSnap = hydroSnapshot();
    const shell = el("section", "roleDashboard cityDashboard", { dataset: { workspace: "city" } });
    const grid = el("div", "roleDashboardGrid");
    const map = el("div", "roleDashboardMap", { dataset: { workspaceMapSlot: "city" } });
    grid.append(
      map,
      renderPortfolio(facilities, snapshot, hydroSnap),
      renderTimeline(facilities, snapshot),
      renderDecisionQueue(snapshot),
      renderImpact(hydroSnap),
      renderReadiness()
    );
    shell.append(renderHeader(coverage), renderKpis(coverage), renderUnresolved(coverage), grid);
    updateCity(shell);
    return shell;
  }

  function updateKpis(root, coverage) {
    setText(root, '[data-city-kpi="total"] .cityKpiValue', coverage.total);
    setText(root, '[data-city-kpi="named"] .cityKpiValue', coverage.named);
    setText(root, '[data-city-kpi="unresolved"] .cityKpiValue', coverage.unresolved);
    setText(root, ".citySyntheticBanner", `Synthetic simulation workspace · ${coverage.total} municipal facilities in source scope · ${relTime()}`);
    setText(root, "[data-city-unresolved-evidence]", `${coverage.unresolved} identities awaiting authoritative registry`);
  }

  function updatePortfolio(root, facilities, snapshot, hydroSnap) {
    facilities.forEach((facility) => {
      const row = root.querySelector(`[data-city-facility-row][data-facility-id="${facility.id}"]`);
      if (!row) return;
      const state = statusForFacility(snapshot, facility);
      row.dataset.state = state;
      setText(row, ".statePill", state);
      const reservoir = reservoirStateFor(facility, hydroSnap);
      const metric = row.querySelector(".cityFacilityMetric");
      if (metric) metric.textContent = reservoir ? `Z ${fmt(reservoir.Z, 1)} m · O ${fmt(reservoir.O, 0)} m3/s` : "Simulation pending";
    });
  }

  function updateTimeline(root, facilities, snapshot) {
    DEMO_ORDER.map((id) => facilities.find((facility) => facility.id === id)).filter(Boolean).forEach((facility) => {
      const row = root.querySelector(`[data-city-timeline] [data-process-row][data-facility-id="${facility.id}"]`);
      if (!row) return;
      const state = statusForFacility(snapshot, facility);
      row.dataset.state = state;
      setText(row, ".cityProcessState", state);
    });
  }

  function updateDecisionQueue(root, snapshot) {
    const card = root.querySelector("[data-city-decision-card]");
    const decision = currentDecision();
    if (card) {
      card.replaceChildren();
      if (decision) {
        card.append(
          text("strong", "", `${decision.id} · ${decision.kind || "CURRENT_PACKAGE"}`),
          text("p", "", `Accountable role: ${decision.accountable || "unassigned in RACI"}`),
          text("p", "", decision.consulted && decision.consulted.length ? `Consulted: ${decision.consulted.join(", ")}` : "Consulted roles: none recorded")
        );
      } else {
        card.append(text("strong", "", "No active release decision package"), text("p", "", "Accountable role label unavailable until a proposal-class package exists."));
      }
    }
    const proposals = currentEventItems(snapshot, "proposals");
    const orders = currentEventItems(snapshot, "orders");
    setText(root, ".cityQueueMeta", `${proposals.length} proposals · ${orders.length} approved orders in shared release workflow snapshot`);
  }

  function updateImpact(root, hydroSnap) {
    const gauges = FT.data && FT.data.GAUGES ? FT.data.GAUGES.slice(0, 4) : [];
    gauges.forEach((gauge) => {
      const card = root.querySelector(`[data-city-gauge-id="${gauge.id}"]`);
      const state = hydroSnap && hydroSnap.gauges ? hydroSnap.gauges[gauge.id] : null;
      if (!card) return;
      setText(card, "strong", state ? `${fmt(state.stage, 2)} m` : "—");
      setText(card, ".cityGaugeState", state ? `Alert ${state.alert} · trend ${fmt(state.trend, 2)} m/3h` : "Simulation unavailable");
    });
  }

  function currentEventItems(snapshot, key) {
    const eventId = snapshot && snapshot.event && snapshot.event.id;
    return snapshot && snapshot[key] ? Object.values(snapshot[key]).filter((item) => item.eventId === eventId) : [];
  }

  function updateReadiness(root, snapshot) {
    const entries = FT.ops && FT.ops.audit && Array.isArray(FT.ops.audit.entries) ? FT.ops.audit.entries : [];
    const notifications = entries.filter((entry) => /^notify|notification/i.test(entry.action || ""));
    const eventId = snapshot && snapshot.event && snapshot.event.id;
    const decisions = entries.filter((entry) => /^decision|release\./i.test(entry.action || "") && entry.detail && entry.detail.eventId === eventId);
    setText(root, '[data-city-readiness] [data-city-kpi="audit"] .cityKpiValue', entries.length);
    setText(root, '[data-city-readiness] [data-city-kpi="notifications"] .cityKpiValue', notifications.length);
    setText(root, '[data-city-readiness] [data-city-kpi="workflow"] .cityKpiValue', decisions.length);
  }

  function updateCity(root) {
    if (!root) return;
    const coverage = FT.facilities.coverage();
    const facilities = FT.facilities.all();
    const snapshot = getSnapshot();
    const hydroSnap = hydroSnapshot();
    updateKpis(root, coverage);
    updatePortfolio(root, facilities, snapshot, hydroSnap);
    updateTimeline(root, facilities, snapshot);
    updateDecisionQueue(root, snapshot);
    updateImpact(root, hydroSnap);
    updateReadiness(root, snapshot);
  }

  FT.workspaces.register("city", renderCity);

  function refreshCity() {
    if (!FT.workspaces || !FT.workspaces.current || FT.workspaces.current().workspace !== "city") return;
    updateCity(document.querySelector(".cityDashboard"));
  }

  if (FT.bus) {
    ["scrubbed", "hydroRebuilt", "opsAudit", "lang"].forEach((eventName) => {
      FT.bus.on(eventName, refreshCity);
    });
  }
})();
