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
    DEVIATING: "DEVIATING",
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

  function tr(key, values) {
    const template = FT.i18n && FT.i18n.t ? FT.i18n.t(key) : key;
    return Object.keys(values || {}).reduce((out, name) => out.replaceAll(`{${name}}`, values[name]), template);
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
    const orders = currentOrders(snapshot).filter((item) => item.facilityId === facilityId);
    const order = orders[0] || null;
    if (order) return order.status || DEMO_STATUS.APPROVED;
    const proposals = currentProposals(snapshot).filter((item) => item.facilityId === facilityId);
    const proposal = proposals[0] || null;
    if (proposal) return proposal.status || DEMO_STATUS.SUBMITTED;
    return null;
  }

  function statusForFacility(snapshot, facility) {
    const workflow = workflowForFacility(snapshot, facility.id);
    if (workflow) return workflow;
    return facility.demoReservoirId ? DEMO_STATUS.ASSESSED : DEMO_STATUS.NOT_IN_CURRENT_DEMO;
  }

  function orderForFacility(snapshot, facilityId) {
    return currentOrders(snapshot).find((item) => item.facilityId === facilityId) || null;
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
      text("p", "roleEyebrow", tr("city.eyebrow")),
      text("h2", "", tr("city.title")),
      text("p", "roleDashboardLead", tr("city.lead"))
    );
    const banner = el("p", "citySyntheticBanner", { dataset: { provenance: "synthetic" } });
    banner.textContent = tr("city.synthetic", { total: coverage.total, time: relTime() });
    head.append(titleWrap, banner);
    return head;
  }

  function renderKpis(coverage) {
    const wrap = el("div", "cityKpis");
    wrap.append(
      kpi(tr("city.scope"), coverage.total, "total", tr("city.registrySource")),
      kpi(tr("city.named"), coverage.named, "named", tr("city.authoritativeNames")),
      kpi(tr("city.unresolved"), coverage.unresolved, "unresolved", tr("city.notRowExpanded"))
    );
    return wrap;
  }

  function renderPortfolio(facilities, snapshot, hydroSnap) {
    const aside = el("aside", "cityPortfolio", { dataset: { cityPortfolio: "" }, "aria-label": tr("city.portfolioLabel") });
    aside.append(text("h3", "", tr("city.portfolio")));
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
        text("span", "", facility.demoReservoirId ? tr("city.demoMapped") : tr("city.registryOnly"))
      );
      row.append(meta);
      const reservoir = reservoirStateFor(facility, hydroSnap);
      if (facility.demoReservoirId) {
        row.append(text("span", "cityFacilityMetric", reservoir ? `Z ${fmt(reservoir.Z, 1)} m · O ${fmt(reservoir.O, 0)} m3/s` : tr("city.simPending")));
        const button = el("button", "cityPlantLink", {
          type: "button",
          dataset: { plantFacilityId: facility.id },
          "aria-label": tr("city.openPlant", { name: facility.name }),
        });
        button.textContent = tr("city.plantRoute");
        button.addEventListener("click", () => {
          if (FT.workspaces.rememberReturnFocus) FT.workspaces.rememberReturnFocus(button);
          FT.workspaces.navigate("plant", { facilityId: facility.id });
        });
        button.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          button.click();
        });
        row.append(button);
      }
      list.append(row);
    });
    aside.append(list);
    return aside;
  }

  function renderTimeline(facilities, snapshot) {
    const section = el("section", "cityTimeline", { dataset: { cityTimeline: "" }, "aria-label": tr("city.processTimelineLabel") });
    section.append(text("h3", "", tr("city.processTimeline")));
    DEMO_ORDER.map((id) => facilities.find((facility) => facility.id === id)).filter(Boolean).forEach((facility) => {
      const state = statusForFacility(snapshot, facility);
      const order = orderForFacility(snapshot, facility.id);
      const row = el("article", "cityProcessRow", {
        dataset: { processRow: "", state, facilityId: facility.id },
      });
      row.append(text("span", "cityProcessFacility", facility.name), text("strong", "cityProcessState", state));
      row.append(text("span", "cityProcessNote", order ? tr("city.noExecutionOrder", { id: order.id, status: order.status }) : tr("city.noExecution")));
      section.append(row);
    });
    return section;
  }

  function renderDecisionQueue(snapshot) {
    const section = el("section", "cityDecisionQueue", { dataset: { cityDecisionQueue: "" }, "aria-label": tr("city.decisionQueueLabel") });
    section.append(text("h3", "", tr("workspace.decisionQueue")));
    section.append(el("article", "cityDecisionCard pending", { dataset: { cityDecisionCard: "" } }));
    section.append(text("p", "cityQueueMeta", "—"));
    return section;
  }

  function renderImpact(hydroSnap) {
    const section = el("section", "cityImpact", { dataset: { cityImpact: "" }, "aria-label": tr("city.downstreamImpactLabel") });
    section.append(text("h3", "", tr("city.downstreamImpact")));
    const gauges = FT.data && FT.data.GAUGES ? FT.data.GAUGES.slice(0, 4) : [];
    gauges.forEach((gauge) => {
      const state = hydroSnap && hydroSnap.gauges ? hydroSnap.gauges[gauge.id] : null;
      const item = el("article", "cityGaugeCard", { dataset: { provenance: "simulation", cityGaugeId: gauge.id } });
      item.append(
        text("span", "", gauge.name),
        text("strong", "", state ? `${fmt(state.stage, 2)} m` : "—"),
        text("span", "cityGaugeState", state ? tr("city.alertTrend", { alert: state.alert, trend: fmt(state.trend, 2) }) : tr("city.simUnavailable"))
      );
      section.append(item);
    });
    section.append(text("p", "cityProvenance", tr("city.simProvenance")));
    return section;
  }

  function latestRefusal(eventId) {
    const entries = FT.ops && FT.ops.audit && Array.isArray(FT.ops.audit.entries) ? FT.ops.audit.entries : [];
    return [...entries].reverse().find((entry) => entry.action === "decision.refused" &&
      entry.detail && entry.detail.eventId === eventId) || null;
  }

  function refusalText(refusal) {
    return refusal
      ? tr("city.refusal", { actor: refusal.detail.actorRole || tr("city.unknownRole"), role: refusal.detail.requiredRole || tr("city.requiredRole") })
      : tr("city.noRefusal");
  }

  function renderReadiness(snapshot) {
    const section = el("section", "cityReadiness", { dataset: { cityReadiness: "" }, "aria-label": tr("city.readinessLabel") });
    section.append(text("h3", "", tr("city.readiness")));
    const entries = FT.ops && FT.ops.audit && Array.isArray(FT.ops.audit.entries) ? FT.ops.audit.entries : [];
    const notifications = entries.filter((entry) => /^notify|notification/i.test(entry.action || ""));
    const decisions = entries.filter((entry) => /^decision|release\./i.test(entry.action || ""));
    const grid = el("div", "cityReadinessGrid");
    grid.append(
      kpi(tr("city.auditEntries"), entries.length, "audit", tr("city.auditNote")),
      kpi(tr("city.notificationEvidence"), notifications.length, "notifications", tr("city.notificationNote")),
      kpi(tr("city.workflowEvidence"), decisions.length, "workflow", tr("city.workflowNote"))
    );
    section.append(grid);
    section.append(text("p", "cityRefusalEvidence", refusalText(latestRefusal(snapshot && snapshot.event && snapshot.event.id))));
    section.append(text("p", "cityProvenance", tr("city.readinessProvenance")));
    return section;
  }

  function renderUnresolved(coverage) {
    const card = el("article", "cityUnresolvedEvidence", { dataset: { cityUnresolvedEvidence: "", provenance: "registry" } });
    card.textContent = tr("city.unresolvedText", { count: coverage.unresolved });
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
      renderDecisionQueue(snapshot),
      map,
      renderPortfolio(facilities, snapshot, hydroSnap),
      renderTimeline(facilities, snapshot),
      renderImpact(hydroSnap),
      renderReadiness(snapshot)
    );
    shell.append(renderHeader(coverage), renderKpis(coverage), renderUnresolved(coverage), grid);
    updateCity(shell);
    return shell;
  }

  function updateKpis(root, coverage) {
    setText(root, '[data-city-kpi="total"] .cityKpiValue', coverage.total);
    setText(root, '[data-city-kpi="named"] .cityKpiValue', coverage.named);
    setText(root, '[data-city-kpi="unresolved"] .cityKpiValue', coverage.unresolved);
    setText(root, ".citySyntheticBanner", tr("city.synthetic", { total: coverage.total, time: relTime() }));
    setText(root, "[data-city-unresolved-evidence]", tr("city.unresolvedText", { count: coverage.unresolved }));
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
      if (metric) metric.textContent = reservoir ? `Z ${fmt(reservoir.Z, 1)} m · O ${fmt(reservoir.O, 0)} m3/s` : tr("city.simPending");
    });
  }

  function updateTimeline(root, facilities, snapshot) {
    DEMO_ORDER.map((id) => facilities.find((facility) => facility.id === id)).filter(Boolean).forEach((facility) => {
      const row = root.querySelector(`[data-city-timeline] [data-process-row][data-facility-id="${facility.id}"]`);
      if (!row) return;
      const state = statusForFacility(snapshot, facility);
      const order = orderForFacility(snapshot, facility.id);
      row.dataset.state = state;
      setText(row, ".cityProcessState", state);
      setText(row, ".cityProcessNote", order ? tr("city.noExecutionOrder", { id: order.id, status: order.status }) : tr("city.noExecution"));
    });
  }

  function updateDecisionQueue(root, snapshot) {
    const card = root.querySelector("[data-city-decision-card]");
    const decision = currentDecision();
    const orders = currentEventItems(snapshot, "orders");
    const decisions = snapshot && snapshot.decisions ? snapshot.decisions : {};
    if (card) {
      card.replaceChildren();
      if (orders.length) {
        const order = orders[0];
        const storedDecision = decisions[order.decisionId];
        card.append(
          text("strong", "", `${order.decisionId} · APPROVED_PLAN`),
          text("p", "", `approved_order_id ${order.id}; event_id ${order.eventId}; facility_id ${order.facilityId}`),
          text("p", "", storedDecision ? tr("city.accountableApproval", { actor: storedDecision.actor, reason: storedDecision.reason }) : tr("city.approvalEvidence"))
        );
      } else if (decision) {
        card.append(
          text("strong", "", `${decision.id} · ${decision.kind || "CURRENT_PACKAGE"}`),
          text("p", "", tr("city.accountableRole", { role: decision.accountable || tr("city.unassignedRaci") })),
          text("p", "", decision.consulted && decision.consulted.length ? tr("city.consulted", { roles: decision.consulted.join(", ") }) : tr("city.consultedNone"))
        );
      } else {
        card.append(text("strong", "", tr("city.noPackage")), text("p", "", tr("city.noPackageNote")));
      }
    }
    const proposals = currentEventItems(snapshot, "proposals");
    setText(root, ".cityQueueMeta", tr("city.queueMeta", { proposals: proposals.length, orders: orders.length }));
  }

  function updateImpact(root, hydroSnap) {
    const gauges = FT.data && FT.data.GAUGES ? FT.data.GAUGES.slice(0, 4) : [];
    gauges.forEach((gauge) => {
      const card = root.querySelector(`[data-city-gauge-id="${gauge.id}"]`);
      const state = hydroSnap && hydroSnap.gauges ? hydroSnap.gauges[gauge.id] : null;
      if (!card) return;
      setText(card, "strong", state ? `${fmt(state.stage, 2)} m` : "—");
      setText(card, ".cityGaugeState", state ? tr("city.alertTrend", { alert: state.alert, trend: fmt(state.trend, 2) }) : tr("city.simUnavailable"));
    });
  }

  function currentEventItems(snapshot, key) {
    const eventId = snapshot && snapshot.event && snapshot.event.id;
    const items = snapshot && snapshot[key] ? Object.values(snapshot[key]).filter((item) => item.eventId === eventId) : [];
    if (key === "orders") return currentOrders(snapshot);
    if (key === "proposals") return currentProposals(snapshot);
    return items;
  }

  function latestFirst(a, b) {
    return (b.revision || 0) - (a.revision || 0) || (b.createdAtH || 0) - (a.createdAtH || 0) || String(b.id).localeCompare(String(a.id));
  }

  function currentOrders(snapshot) {
    const eventId = snapshot && snapshot.event && snapshot.event.id;
    return snapshot && snapshot.orders
      ? Object.values(snapshot.orders).filter((item) => item.eventId === eventId && !item.supersededBy).sort(latestFirst)
      : [];
  }

  function currentProposals(snapshot) {
    const eventId = snapshot && snapshot.event && snapshot.event.id;
    return snapshot && snapshot.proposals
      ? Object.values(snapshot.proposals)
        .filter((item) => item.eventId === eventId && !item.supersededBy && item.status !== "REJECTED" && item.status !== "SUPERSEDED")
        .sort(latestFirst)
      : [];
  }

  function updateReadiness(root, snapshot) {
    const entries = FT.ops && FT.ops.audit && Array.isArray(FT.ops.audit.entries) ? FT.ops.audit.entries : [];
    const notifications = entries.filter((entry) => /^notify|notification/i.test(entry.action || ""));
    const eventId = snapshot && snapshot.event && snapshot.event.id;
    const decisions = entries.filter((entry) => /^decision|release\./i.test(entry.action || "") && entry.detail && entry.detail.eventId === eventId);
    setText(root, '[data-city-readiness] [data-city-kpi="audit"] .cityKpiValue', entries.length);
    setText(root, '[data-city-readiness] [data-city-kpi="notifications"] .cityKpiValue', notifications.length);
    setText(root, '[data-city-readiness] [data-city-kpi="workflow"] .cityKpiValue', decisions.length);
    setText(root, ".cityRefusalEvidence", refusalText(latestRefusal(eventId)));
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

  function rerenderCity() {
    if (!FT.workspaces || !FT.workspaces.current || FT.workspaces.current().workspace !== "city") return;
    FT.workspaces.render();
  }

  if (FT.bus) {
    ["scrubbed", "hydroRebuilt", "opsAudit", "releaseWorkflowChanged"].forEach((eventName) => {
      FT.bus.on(eventName, refreshCity);
    });
    FT.bus.on("lang", rerenderCity);
  }
})();
