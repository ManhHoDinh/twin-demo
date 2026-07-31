(function () {
  "use strict";

  const FT = window.FT;
  if (!FT || !FT.workspaces || !FT.facilities) return;

  const MISSING_DEPENDENCIES = Object.freeze([
    "plant.dep.telemetry",
    "plant.dep.storage",
    "plant.dep.rules",
    "plant.dep.routing",
  ]);
  const marginDiagnostics = new Set();

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

  function fmtInt(value) {
    if (!Number.isFinite(value)) return "—";
    return Math.round(value).toLocaleString("en-US");
  }

  function relTime() {
    return FT.util && FT.util.rel ? FT.util.rel(FT.state.timeH) : `T${FT.state.timeH >= 0 ? "+" : ""}${Math.round(FT.state.timeH)}h`;
  }

  function hydroSnapshot() {
    return FT.hydro && FT.hydro.ready && FT.hydro.at ? FT.hydro.at(FT.state.timeH) : null;
  }

  function currentPackage(hydroSnap) {
    if (!FT.ops || typeof FT.ops.package !== "function" || !hydroSnap) return null;
    return FT.ops.package(hydroSnap);
  }

  function releaseSnapshot() {
    return FT.releaseOps && FT.releaseOps.snapshot ? FT.releaseOps.snapshot() : null;
  }

  function reservoirDef(id) {
    return FT.data && FT.data.RESERVOIRS ? FT.data.RESERVOIRS.find((item) => item.id === id) : null;
  }

  function reservoirState(facility, hydroSnap) {
    if (!facility || !facility.demoReservoirId || !hydroSnap || !hydroSnap.reservoirs) return null;
    return hydroSnap.reservoirs[facility.demoReservoirId] || null;
  }

  function marginsFor(facility, hydroSnap) {
    const def = facility && facility.demoReservoirId ? reservoirDef(facility.demoReservoirId) : null;
    if (!def || !hydroSnap || !FT.ops || typeof FT.ops.margins !== "function") return { state: "MISSING", margins: null, message: "Safety margin inputs are not available." };
    try {
      const margins = FT.ops.margins(hydroSnap, def);
      return { state: "OK", margins, message: "" };
    } catch (error) {
      const eventId = FT.releaseOps && FT.releaseOps.snapshot ? FT.releaseOps.snapshot().event.id : `EVT-${FT.state.scenario}`;
      const message = error && error.message ? error.message : String(error || "unknown margin error");
      const key = `${eventId}:${facility.id}:${message}`;
      if (!marginDiagnostics.has(key)) {
        marginDiagnostics.add(key);
        if (typeof FT.log === "function") FT.log(`MARGIN_CALCULATION_FAILED ${facility.name}: ${message}`, "warn");
      }
      return { state: "MARGIN_CALCULATION_FAILED", margins: null, message };
    }
  }

  function proposalForFacility(snapshot, facilityId) {
    return currentProposals(snapshot).find((item) => item.facilityId === facilityId) || null;
  }

  function orderForFacility(snapshot, facilityId) {
    return currentOrders(snapshot).find((item) => item.facilityId === facilityId) || null;
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

  function executionForOrder(snapshot, orderId) {
    if (!snapshot || !snapshot.executions || !orderId) return null;
    return Object.values(snapshot.executions).find((item) => item.orderId === orderId) || null;
  }

  function isPackageTarget(pkg, facility) {
    return !!(pkg && pkg.kind === "PROPOSAL" && pkg.reservoir && facility && pkg.reservoir.id === facility.demoReservoirId);
  }

  function metric(label, value, note) {
    const card = el("article", "plantMetric");
    card.append(text("span", "plantMetricLabel", label), text("strong", "", value));
    if (note) card.append(text("span", "plantMetricNote", note));
    return card;
  }

  function actionButton(kind, label, reason) {
    const button = el("button", "plantAction", {
      type: "button",
      dataset: { plantAction: kind },
      disabled: "",
      "aria-disabled": "true",
    });
    button.textContent = label;
    if (reason) button.title = reason;
    return button;
  }

  function currentOrderForFacility(snapshot, facility) {
    return facility ? orderForFacility(snapshot, facility.id) : null;
  }

  function checkLabels() {
    return {
      "order-valid": tr("plant.check.order-valid"),
      "notifications-acknowledged": tr("plant.check.notifications-acknowledged"),
      "plant-ready": tr("plant.check.plant-ready"),
      "outlet-ready": tr("plant.check.outlet-ready"),
      "ramp-started": tr("plant.check.ramp-started"),
      "actual-recorded": tr("plant.check.actual-recorded"),
      "downstream-monitored": tr("plant.check.downstream-monitored"),
      "completion-confirmed": tr("plant.check.completion-confirmed"),
    };
  }

  function renderHeader(root, facility) {
    const head = root.querySelector(".roleDashboardHead");
    if (!head) return;
    head.replaceChildren();
    const titleWrap = el("div", "roleDashboardTitle");
    titleWrap.append(
      text("p", "roleEyebrow", tr("plant.eyebrow")),
      el("h2", "", { text: facility ? facility.name : tr("plant.unknownFacility") }),
      text("p", "roleDashboardLead", tr("plant.lead"))
    );
    const banner = el("p", "plantSyntheticBanner", { dataset: { provenance: "synthetic" } });
    banner.textContent = tr("plant.synthetic", { time: relTime() });
    head.append(titleWrap, banner);
  }

  function buildFacilityBar(root, facility) {
    const bar = root.querySelector(".plantFacilityBar");
    if (!bar) return;
    bar.replaceChildren();

    const identity = el("div", "plantFacilityIdentity", { dataset: { plantFacilityIdentity: "" } });
    identity.append(
      text("strong", "", facility ? facility.name : tr("plant.unknownFacility")),
      text("span", "", facility ? tr("plant.identityMeta", { id: facility.id, type: facility.entityType, status: facility.inspectionStatus }) : tr("plant.noRegistry"))
    );

    const label = el("label", "plantFacilitySelect");
    label.append(text("span", "", tr("plant.facility")));
    const select = el("select", "", { dataset: { plantFacilitySelector: "" }, "aria-label": tr("plant.facilityAria") });
    FT.facilities.all().forEach((item) => {
      const option = el("option", "", { value: item.id, text: item.name });
      select.appendChild(option);
    });
    select.value = facility ? facility.id : "a-vuong";
    select.addEventListener("change", () => {
      const selectedId = select.value;
      if (!FT.facilities.get(selectedId)) {
        select.value = FT.state.selectedFacilityId;
        return;
      }
      FT.workspaces.navigate("plant", { facilityId: selectedId });
    });
    label.appendChild(select);

    const source = el("p", "plantSourceLine", { dataset: { provenance: "registry" } });
    source.textContent = facility
      ? tr("plant.registrySource", { source: facility.sourceId, date: facility.validFrom, state: facility.operationalDataState })
      : tr("plant.registryMissing");
    bar.append(identity, label, source);
  }

  function renderCurrentState(root, facility, hydroSnap) {
    const section = root.querySelector("[data-plant-current-state]");
    if (!section) return;
    section.replaceChildren();
    section.className = "plantPanel plantCurrentState";
    section.setAttribute("aria-label", tr("plant.currentStateLabel"));
    const state = facility ? facility.operationalDataState : "NOT_IN_CURRENT_DEMO";
    section.dataset.plantDataState = state;
    section.append(text("h3", "", tr("plant.currentState")));

    if (!facility || state === "NOT_IN_CURRENT_DEMO") {
      section.append(
        text("p", "plantUnavailableText", facility ? tr("plant.noPlantData", { name: facility.name, type: facility.entityType }) : tr("plant.selectedUnavailable")),
        text("p", "plantProvenance", facility ? tr("plant.inspectionSource", { status: facility.inspectionStatus, source: facility.sourceId, date: facility.validFrom }) : tr("plant.noSource"))
      );
      section.querySelector(".plantProvenance").dataset.provenance = "registry";
      return;
    }

    const rs = reservoirState(facility, hydroSnap);
    const marginResult = marginsFor(facility, hydroSnap);
    const margins = marginResult && marginResult.margins;
    section.dataset.plantMarginState = marginResult ? marginResult.state : "MISSING";
    const grid = el("div", "plantMetricGrid");
    grid.append(
      metric(tr("plant.reservoirLevel"), rs ? `${fmt(rs.Z, 1)} m` : "—", tr("plant.syntheticReservoir")),
      metric(tr("plant.inflow"), rs ? `${fmtInt(rs.I)} m3/s` : "—", tr("plant.simNotTelemetry")),
      metric(tr("plant.currentRelease"), rs ? `${fmtInt(rs.O)} m3/s` : "—", tr("plant.simActivePolicy")),
      metric(tr("plant.freeboard"), margins && Number.isFinite(margins.freeboard) ? `${fmt(margins.freeboard, 1)} m` : "MISSING", marginResult && marginResult.state === "OK" ? tr("plant.assumedDesign") : tr("plant.marginUnavailable"))
    );
    section.append(grid);
    if (marginResult && marginResult.state !== "OK") {
      const warning = text("p", "plantNotice missing", tr("plant.marginFailed", { state: marginResult.state, name: facility.name }));
      warning.dataset.provenance = "diagnostic";
      section.append(warning);
    }
    const prov = text("p", "plantProvenance", tr("plant.stateProvenance", { date: facility.validFrom }));
    prov.dataset.provenance = "simulation";
    section.append(prov);
  }

  function renderAdvisory(root, facility, hydroSnap, pkg, snapshot) {
    const section = root.querySelector("[data-plant-advisory]");
    if (!section) return;
    const scrollTop = section.scrollTop;
    section.replaceChildren();
    section.className = "plantPanel plantAdvisory";
    section.setAttribute("aria-label", tr("plant.advisoryLabel"));
    section.append(text("h3", "", tr("plant.advisory")));

    if (!facility || facility.operationalDataState === "NOT_IN_CURRENT_DEMO") {
      section.dataset.plantLifecycleClass = "MISSING";
      section.dataset.plantActionable = "false";
      section.append(text("p", "plantNotice missing", tr("plant.noAdvisory")));
      section.scrollTop = scrollTop;
      return;
    }

    const targeted = isPackageTarget(pkg, facility);
    if (!targeted) {
      section.dataset.plantLifecycleClass = "MISSING";
      section.dataset.plantActionable = "false";
      section.append(text("p", "plantLifecycleBadge", tr("plant.lifecycle", { class: "MISSING", actionable: "false" })));
      section.append(text("p", "plantNotice missing", tr("plant.notTargeted", { name: facility.name })));
      section.append(actionButton("propose", tr("plant.proposeUnavailable"), tr("plant.proposeReason")));
      section.append(actionButton("approve", tr("plant.approveUnavailable"), tr("plant.approveReason")));
      section.append(actionButton("execute", tr("plant.executeUnavailable"), tr("plant.executeReason")));
      const source = text("p", "plantProvenance", tr("plant.advisoryHiddenSource", { name: facility.name }));
      source.dataset.provenance = "workflow";
      section.append(source);
      section.scrollTop = scrollTop;
      return;
    }

    const cls = FT.lifecycle && FT.lifecycle.classifyDecision ? FT.lifecycle.classifyDecision(pkg) : null;
    const advisory = {
      lifecycleClass: cls || "MISSING",
      actionable: FT.lifecycle && cls ? FT.lifecycle.isActionable(cls) : false,
      notice: FT.lifecycle && cls ? FT.lifecycle.reviewNotice(cls) : "No current proposal-class decision package.",
      gateInstructionsAvailable: false,
    };
    section.dataset.plantLifecycleClass = advisory.lifecycleClass;
    section.dataset.plantActionable = String(advisory.actionable);
    section.append(text("p", "plantLifecycleBadge", tr("plant.lifecycle", { class: advisory.lifecycleClass, actionable: advisory.actionable ? "true" : "false" })));
    section.append(text("p", "plantNotice", advisory.notice || tr("plant.noActionable")));

    const proposal = proposalForFacility(snapshot, facility.id);
    if (!pkg || pkg.kind !== "PROPOSAL") {
      section.append(text("p", "", pkg && pkg.reason ? pkg.reason : tr("plant.noProposal")));
    } else if (targeted) {
      const grid = el("div", "plantMetricGrid");
      grid.append(
        metric(tr("plant.proposedRelease"), `${fmtInt(pkg.action.q0)} -> ${fmtInt(pkg.action.q1)} m3/s`, tr("plant.recommendationOnly")),
        metric(tr("plant.start"), relTimeLabel(pkg.action.tStart), tr("plant.requiresApproval")),
        metric(tr("plant.controlPoint"), pkg.gauge ? pkg.gauge.name : "—", tr("plant.downstreamSimulation")),
        metric(tr("plant.peakCut"), Number.isFinite(pkg.cut) ? `${fmt(pkg.cut, 2)} m` : "—", tr("plant.modelledComparison"))
      );
      section.append(grid);
    }

    if (pkg && pkg.action && pkg.action.gates) {
      const gate = text("p", "plantAssumption", tr("plant.gateAssumption", { name: pkg.reservoir.name, gates: pkg.action.gates }));
      gate.dataset.provenance = "assumption";
      section.append(gate);
    }

    section.append(actionButton("propose", tr("plant.proposeUnavailable"), tr("plant.proposeReason")));
    section.append(actionButton("approve", tr("plant.approveUnavailable"), tr("plant.approveReason")));
    section.append(actionButton("execute", tr("plant.executeUnavailable"), tr("plant.executeReason")));
    const source = text("p", "plantProvenance", tr("plant.advisorySource", { proposal: proposal ? proposal.id : tr("plant.noneStored") }));
    source.dataset.provenance = "workflow";
    section.append(source);
    section.scrollTop = scrollTop;
  }

  function relTimeLabel(tH) {
    if (!Number.isFinite(tH)) return "—";
    return `T${tH >= 0 ? "+" : ""}${fmt(tH, 1)}h`;
  }

  function renderAlternatives(root, facility, pkg) {
    const section = root.querySelector("[data-plant-alternatives]");
    if (!section) return;
    section.replaceChildren();
    section.className = "plantPanel plantAlternatives";
    section.setAttribute("aria-label", tr("plant.alternatives"));
    section.append(text("h3", "", tr("plant.alternatives")));
    if (!facility || facility.operationalDataState === "NOT_IN_CURRENT_DEMO") {
      section.append(text("p", "plantNotice missing", tr("plant.noNumericNotDemo")));
      return;
    }
    const targeted = isPackageTarget(pkg, facility);
    if (!targeted) {
      section.append(text("p", "plantNotice missing", tr("plant.noNumericNotTarget", { name: facility.name })));
      return;
    }
    if (!pkg || !Array.isArray(pkg.alternatives) || !pkg.alternatives.length) {
      section.append(text("p", "", tr("plant.noAlternatives")));
      return;
    }
    pkg.alternatives.slice(0, 3).forEach((alt) => {
      const card = el("article", "plantAlternative");
      card.append(
        text("strong", "", alt.label || alt.key),
        text("span", "", Number.isFinite(alt.peak) ? tr("plant.modelledPeak", { peak: fmt(alt.peak, 2) }) : tr("plant.modelledPeakUnavailable")),
        text("p", "", alt.note || tr("plant.noNote"))
      );
      section.append(card);
    });
  }

  function renderApprovedOrder(root, facility, snapshot) {
    const section = root.querySelector("[data-plant-approved-order]");
    if (!section) return;
    section.replaceChildren();
    section.className = "plantPanel plantApprovedOrder";
    section.setAttribute("aria-label", tr("plant.approvedOrderLabel"));
    section.append(text("h3", "", tr("workspace.approvedOrder")));
    const order = facility ? orderForFacility(snapshot, facility.id) : null;
    if (!order) {
      section.dataset.plantLifecycleClass = "NONE";
      section.append(text("p", "plantOrderEmpty", tr("plant.noApprovedOrder")));
      section.append(text("p", "plantNotice", tr("plant.recommendationBoundary")));
      return;
    }
    section.dataset.plantLifecycleClass = order.lifecycleClass || "APPROVED_PLAN";
    const decision = snapshot && snapshot.decisions ? snapshot.decisions[order.decisionId] : null;
    section.append(
      text("p", "plantLifecycleBadge approved", tr("plant.lifecycle", { class: order.lifecycleClass, actionable: order.actionable ? "true" : "false" })),
      metric(tr("plant.approvedOrderId"), order.id, order.status),
      metric(tr("plant.package"), order.packageId, tr("plant.revision", { revision: order.revision })),
      metric(tr("plant.commandedTarget"), Number.isFinite(order.commandedCms) ? `${fmtInt(order.commandedCms)} m3/s` : "—", tr("plant.assumedCommand")),
      metric(tr("plant.decisionAudit"), decision ? `#${decision.auditSeq}` : `#${order.auditSeq}`, decision ? `${decision.actor}; ${decision.reason}` : tr("plant.storedApproval"))
    );
    const valid = text("p", "plantProvenance", `approved_order_id ${order.id}; event_id ${order.eventId}; facility_id ${order.facilityId}; proposal_id ${order.proposalId}; decision_id ${order.decisionId}.`);
    valid.dataset.provenance = "workflow";
    section.append(valid);
  }

  function renderChecklist(root, facility, snapshot) {
    const section = root.querySelector("[data-plant-checklist]");
    if (!section) return;
    section.replaceChildren();
    section.className = "plantPanel plantChecklist";
    section.setAttribute("aria-label", tr("plant.checklistLabel"));
    section.append(text("h3", "", tr("workspace.checklist")));
    const order = facility ? orderForFacility(snapshot, facility.id) : null;
    const checks = FT.releaseOps && FT.releaseOps.CHECKS ? FT.releaseOps.CHECKS : [];
    const labels = checkLabels();
    if (!order) {
      section.append(text("p", "", tr("plant.checklistLocked")));
      checks.forEach((key) => {
        const row = el("label", "plantCheckRow");
        const input = el("input", "", { type: "checkbox", disabled: "", dataset: { checkKey: key } });
        row.append(input, text("span", "", labels[key] || key));
        section.append(row);
      });
      return;
    }
    checks.forEach((key) => {
      const row = el("label", "plantCheckRow");
      const input = el("input", "", { type: "checkbox", checked: order.checklist && order.checklist[key] ? "" : null, dataset: { checkKey: key } });
      input.addEventListener("change", () => {
        const result = FT.releaseOps.setChecklist(order.id, key, input.checked);
        if (!result) input.checked = !!(order.checklist && order.checklist[key]);
        refreshPlant();
      });
      row.append(input, text("span", "", labels[key] || key));
      section.append(row);
    });
  }

  function renderExecution(root, facility, snapshot) {
    const section = root.querySelector("[data-plant-execution]");
    if (!section) return;
    section.replaceChildren();
    section.className = "plantPanel plantExecution";
    section.setAttribute("aria-label", tr("plant.executionLabel"));
    section.append(text("h3", "", tr("plant.execution")));
    const order = facility ? orderForFacility(snapshot, facility.id) : null;
    const execution = order ? executionForOrder(snapshot, order.id) : null;
    if (!order) {
      section.append(text("p", "", tr("plant.noExecutionState")));
      return;
    }
    const actual = FT.releaseOps && FT.releaseOps.actualVersusCommanded ? FT.releaseOps.actualVersusCommanded(order.id) : order.actual;
    const canStart = FT.releaseOps && FT.releaseOps.prerequisitesSatisfied && FT.releaseOps.prerequisitesSatisfied(order.id);
    const canClose = FT.releaseOps && FT.releaseOps.completeSatisfied && FT.releaseOps.completeSatisfied(order.id);
    const start = actionButton("start-execution", tr("plant.startExecution"), tr("plant.startReason"));
    if (canStart) { start.disabled = false; start.removeAttribute("disabled"); start.setAttribute("aria-disabled", "false"); }
    start.addEventListener("click", () => { FT.releaseOps.startExecution(order.id); refreshPlant(); });
    const observe = actionButton("record-actual", tr("plant.recordActual"), tr("plant.recordReason"));
    if (execution && [FT.releaseOps.PROCESS.EXECUTING, FT.releaseOps.PROCESS.DEVIATING].includes(order.status)) {
      observe.disabled = false; observe.removeAttribute("disabled"); observe.setAttribute("aria-disabled", "false");
    }
    observe.addEventListener("click", () => {
      FT.releaseOps.recordObservedRelease(order.id);
      refreshPlant();
    });
    const close = actionButton("close-complete", tr("plant.closeComplete"), tr("plant.closeReason"));
    if (canClose) { close.disabled = false; close.removeAttribute("disabled"); close.setAttribute("aria-disabled", "false"); }
    close.addEventListener("click", () => { FT.releaseOps.close(order.id); refreshPlant(); });
    section.append(
      metric(tr("plant.order"), order.id, order.status),
      metric(tr("plant.execution"), execution ? execution.id : "—", execution ? execution.status : tr("plant.notStarted")),
      metric(tr("plant.commandedRelease"), Number.isFinite(order.commandedCms) ? `${fmtInt(order.commandedCms)} m3/s` : "—", tr("plant.approvedCommand")),
      metric(tr("plant.observedRelease"), actual && Number.isFinite(actual.observedCms) ? `${fmtInt(actual.observedCms)} m3/s` : tr("plant.telemetryMissing"), actual && actual.provenance === "ASSUMED_FOR_DEMO" ? "ASSUMED_FOR_DEMO" : "MISSING"),
      metric(tr("plant.deviation"), actual && Number.isFinite(actual.deviationCms) ? `${fmt(actual.deviationCms, 1)} m3/s` : tr("plant.telemetryMissing"), actual && actual.status ? actual.status : "MISSING")
    );
    section.dataset.state = actual && actual.status === "DEVIATING" ? "DEVIATING" : order.status;
    section.append(text("p", "plantProvenance", tr("plant.tolerance", { value: FT.releaseOps.DEMO_TOLERANCE_CMS })));
    section.append(start, observe, close);
  }

  function renderMissingDependencies(root, facility) {
    const existing = root.querySelector("[data-plant-missing-dependencies]");
    if (existing) existing.remove();
    if (!facility || facility.operationalDataState !== "NOT_IN_CURRENT_DEMO") return;
    const section = root.querySelector("[data-plant-current-state]");
    if (!section) return;
    const list = el("ul", "plantMissingDependencies", { dataset: { plantMissingDependencies: "" } });
    MISSING_DEPENDENCIES.forEach((item) => list.appendChild(text("li", "", tr(item))));
    section.append(text("h4", "", tr("plant.missingDependencies")));
    section.append(list);
  }

  function updatePlant(root) {
    if (!root) return;
    const facility = FT.facilities.get(FT.state.selectedFacilityId) || FT.facilities.get("a-vuong");
    const hydroSnap = hydroSnapshot();
    const pkg = currentPackage(hydroSnap);
    const snapshot = releaseSnapshot();
    renderHeader(root, facility);
    renderCurrentState(root, facility, hydroSnap);
    renderMissingDependencies(root, facility);
    renderAdvisory(root, facility, hydroSnap, pkg, snapshot);
    renderAlternatives(root, facility, pkg);
    renderApprovedOrder(root, facility, snapshot);
    renderChecklist(root, facility, snapshot);
    renderExecution(root, facility, snapshot);
  }

  function renderPlant(context) {
    const facility = FT.facilities.get(context.facilityId) || FT.facilities.get("a-vuong");
    const shell = el("section", "roleDashboard plantDashboard", { dataset: { workspace: "plant" } });
    const head = el("header", "roleDashboardHead");
    const facilityBar = el("div", "plantFacilityBar");
    const grid = el("div", "roleDashboardGrid");
    const map = el("div", "roleDashboardMap", { dataset: { workspaceMapSlot: "plant" } });
    const current = el("section", "", { dataset: { plantCurrentState: "" } });
    const advisory = el("section", "", { dataset: { plantAdvisory: "" } });
    const alternatives = el("section", "", { dataset: { plantAlternatives: "" } });
    const approved = el("section", "", { dataset: { plantApprovedOrder: "" } });
    const checklist = el("section", "", { dataset: { plantChecklist: "" } });
    const execution = el("section", "", { dataset: { plantExecution: "" } });
    grid.append(current, approved, map, advisory, alternatives, checklist, execution);
    shell.append(head, facilityBar, grid);
    buildFacilityBar(shell, facility);
    updatePlant(shell);
    return shell;
  }

  FT.workspaces.register("plant", renderPlant);

  function refreshPlant() {
    if (!FT.workspaces || !FT.workspaces.current || FT.workspaces.current().workspace !== "plant") return;
    updatePlant(document.querySelector(".plantDashboard"));
  }

  function rerenderPlant() {
    if (!FT.workspaces || !FT.workspaces.current || FT.workspaces.current().workspace !== "plant") return;
    FT.workspaces.render();
  }

  if (FT.bus) {
    ["scrubbed", "hydroRebuilt", "opsAudit", "releaseWorkflowChanged", "compareChanged"].forEach((eventName) => {
      FT.bus.on(eventName, refreshPlant);
    });
    FT.bus.on("lang", rerenderPlant);
  }
})();
