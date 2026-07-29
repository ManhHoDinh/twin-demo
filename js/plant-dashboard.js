(function () {
  "use strict";

  const FT = window.FT;
  if (!FT || !FT.workspaces || !FT.facilities) return;

  const MISSING_DEPENDENCIES = Object.freeze([
    "telemetry feed not supplied to this demo",
    "storage/outlet geometry not supplied to this demo",
    "plant operating rules not supplied to this demo",
    "routing/forecast inputs not supplied for this facility",
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
    const eventId = snapshot && snapshot.event && snapshot.event.id;
    const proposals = snapshot && snapshot.proposals ? Object.values(snapshot.proposals) : [];
    return proposals.find((item) => item.facilityId === facilityId && item.eventId === eventId) || null;
  }

  function orderForFacility(snapshot, facilityId) {
    const eventId = snapshot && snapshot.event && snapshot.event.id;
    const orders = snapshot && snapshot.orders ? Object.values(snapshot.orders) : [];
    return orders.find((item) => item.facilityId === facilityId && item.eventId === eventId) || null;
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

  function renderHeader(root, facility) {
    const head = root.querySelector(".roleDashboardHead");
    if (!head) return;
    head.replaceChildren();
    const titleWrap = el("div", "roleDashboardTitle");
    titleWrap.append(
      text("p", "roleEyebrow", "Plant operations"),
      el("h2", "", { text: facility ? facility.name : "Unknown facility" }),
      text("p", "roleDashboardLead", "Reservoir state, recommendation lifecycle, approval boundary and execution readiness for the selected governed facility.")
    );
    const banner = el("p", "plantSyntheticBanner", { dataset: { provenance: "synthetic" } });
    banner.textContent = `Synthetic operations workspace · source-labelled data · ${relTime()}`;
    head.append(titleWrap, banner);
  }

  function buildFacilityBar(root, facility) {
    const bar = root.querySelector(".plantFacilityBar");
    if (!bar) return;
    bar.replaceChildren();

    const identity = el("div", "plantFacilityIdentity", { dataset: { plantFacilityIdentity: "" } });
    identity.append(
      text("strong", "", facility ? facility.name : "Unknown facility"),
      text("span", "", facility ? `${facility.id} · ${facility.entityType} · inspection ${facility.inspectionStatus}` : "No governed registry match")
    );

    const label = el("label", "plantFacilitySelect");
    label.append(text("span", "", "Facility"));
    const select = el("select", "", { dataset: { plantFacilitySelector: "" }, "aria-label": "Plant facility" });
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
      ? `Registry provenance/source: ${facility.sourceId}; source date ${facility.validFrom}; operational state ${facility.operationalDataState}.`
      : "Registry provenance/source: selected facility is not available in the governed registry.";
    bar.append(identity, label, source);
  }

  function renderCurrentState(root, facility, hydroSnap) {
    const section = root.querySelector("[data-plant-current-state]");
    if (!section) return;
    section.replaceChildren();
    section.className = "plantPanel plantCurrentState";
    section.setAttribute("aria-label", "Current plant state");
    const state = facility ? facility.operationalDataState : "NOT_IN_CURRENT_DEMO";
    section.dataset.plantDataState = state;
    section.append(text("h3", "", "Current state"));

    if (!facility || state === "NOT_IN_CURRENT_DEMO") {
      section.append(
        text("p", "plantUnavailableText", facility ? `${facility.name} is a governed ${facility.entityType} identity, but operational plant data are NOT_IN_CURRENT_DEMO.` : "Selected facility is not available in the governed registry."),
        text("p", "plantProvenance", facility ? `Inspection status: ${facility.inspectionStatus}; evidence/source ${facility.sourceId}; date ${facility.validFrom}.` : "No source record available for this selection.")
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
      metric("Reservoir level", rs ? `${fmt(rs.Z, 1)} m` : "—", "synthetic reservoir state"),
      metric("Inflow", rs ? `${fmtInt(rs.I)} m3/s` : "—", "simulated, not telemetry"),
      metric("Current release", rs ? `${fmtInt(rs.O)} m3/s` : "—", "simulated active policy"),
      metric("Freeboard", margins && Number.isFinite(margins.freeboard) ? `${fmt(margins.freeboard, 1)} m` : "MISSING", marginResult && marginResult.state === "OK" ? "assumed design values" : "safety margin unavailable")
    );
    section.append(grid);
    if (marginResult && marginResult.state !== "OK") {
      const warning = text("p", "plantNotice missing", `${marginResult.state}: safety margin could not be calculated for ${facility.name}; no numeric freeboard or margin value is substituted.`);
      warning.dataset.provenance = "diagnostic";
      section.append(warning);
    }
    const prov = text("p", "plantProvenance", `State provenance: FT.hydro.at(FT.state.timeH), hydro.js synthetic reservoir model; source date ${facility.validFrom}; values are simulated/assumed, not observations.`);
    prov.dataset.provenance = "simulation";
    section.append(prov);
  }

  function renderAdvisory(root, facility, hydroSnap, pkg, snapshot) {
    const section = root.querySelector("[data-plant-advisory]");
    if (!section) return;
    const scrollTop = section.scrollTop;
    section.replaceChildren();
    section.className = "plantPanel plantAdvisory";
    section.setAttribute("aria-label", "Advisory recommendation");
    section.append(text("h3", "", "Advisory recommendation"));

    if (!facility || facility.operationalDataState === "NOT_IN_CURRENT_DEMO") {
      section.dataset.plantLifecycleClass = "MISSING";
      section.dataset.plantActionable = "false";
      section.append(text("p", "plantNotice missing", "NOT_IN_CURRENT_DEMO: no plant advisory, release recommendation, gate instruction, release-comparison metric or operational guidance is computed for this facility."));
      section.scrollTop = scrollTop;
      return;
    }

    const targeted = isPackageTarget(pkg, facility);
    if (!targeted) {
      section.dataset.plantLifecycleClass = "MISSING";
      section.dataset.plantActionable = "false";
      section.append(text("p", "plantLifecycleBadge", "Lifecycle class: MISSING; actionable: false"));
      section.append(text("p", "plantNotice missing", `${facility.name} is not currently targeted by a proposal-class package. No release recommendation, gate instruction, proposal validity or package alternative is rendered for this facility.`));
      section.append(actionButton("propose", "Propose plan unavailable", "Task 7 wires proposal events; Task 6 keeps recommendations non-actionable."));
      section.append(actionButton("approve", "Approve unavailable", "Only an attributed entitled approval can create an approved order."));
      section.append(actionButton("execute", "Execute unavailable", "No approved order is current for this renderer."));
      const source = text("p", "plantProvenance", `Advisory source/provenance: ${facility.name} registry and hydro state only; recommendation outputs are hidden unless the selected facility is the package target.`);
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
    section.append(text("p", "plantLifecycleBadge", `Lifecycle class: ${advisory.lifecycleClass}; actionable: ${advisory.actionable ? "true" : "false"}`));
    section.append(text("p", "plantNotice", advisory.notice || "No actionable advisory is available."));

    const proposal = proposalForFacility(snapshot, facility.id);
    if (!pkg || pkg.kind !== "PROPOSAL") {
      section.append(text("p", "", pkg && pkg.reason ? pkg.reason : "No proposal-class package is available at the current time."));
    } else if (targeted) {
      const grid = el("div", "plantMetricGrid");
      grid.append(
        metric("Proposed release", `${fmtInt(pkg.action.q0)} -> ${fmtInt(pkg.action.q1)} m3/s`, "RECOMMENDATION only"),
        metric("Start", relTimeLabel(pkg.action.tStart), "requires approval"),
        metric("Control point", pkg.gauge ? pkg.gauge.name : "—", "downstream simulation"),
        metric("Peak cut", Number.isFinite(pkg.cut) ? `${fmt(pkg.cut, 2)} m` : "—", "modelled comparison")
      );
      section.append(grid);
    }

    if (pkg && pkg.action && pkg.action.gates) {
      const gate = text("p", "plantAssumption", `ASSUMED_FOR_DEMO: package gate note for ${pkg.reservoir.name}: ${pkg.action.gates}. Individual gate geometry is not modelled; no verified gate openings are available.`);
      gate.dataset.provenance = "assumption";
      section.append(gate);
    }

    section.append(actionButton("propose", "Propose plan unavailable", "Task 7 wires proposal events; Task 6 keeps recommendations non-actionable."));
    section.append(actionButton("approve", "Approve unavailable", "Only an attributed entitled approval can create an approved order."));
    section.append(actionButton("execute", "Execute unavailable", "No approved order is current for this renderer."));
    const source = text("p", "plantProvenance", `Advisory source/provenance: FT.ops.package and FT.lifecycle; snapshot proposal for this facility: ${proposal ? proposal.id : "none stored"}.`);
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
    section.setAttribute("aria-label", "Alternatives");
    section.append(text("h3", "", "Alternatives"));
    if (!facility || facility.operationalDataState === "NOT_IN_CURRENT_DEMO") {
      section.append(text("p", "plantNotice missing", "No numeric alternatives are computed for NOT_IN_CURRENT_DEMO facilities."));
      return;
    }
    const targeted = isPackageTarget(pkg, facility);
    if (!targeted) {
      section.append(text("p", "plantNotice missing", `No numeric alternatives are rendered for ${facility.name} because it is not currently targeted by the proposal package.`));
      return;
    }
    if (!pkg || !Array.isArray(pkg.alternatives) || !pkg.alternatives.length) {
      section.append(text("p", "", "No comparable alternatives are available at the current time."));
      return;
    }
    pkg.alternatives.slice(0, 3).forEach((alt) => {
      const card = el("article", "plantAlternative");
      card.append(
        text("strong", "", alt.label || alt.key),
        text("span", "", Number.isFinite(alt.peak) ? `Modelled peak ${fmt(alt.peak, 2)} m` : "Modelled peak unavailable"),
        text("p", "", alt.note || "No note available.")
      );
      section.append(card);
    });
  }

  function renderApprovedOrder(root, facility, snapshot) {
    const section = root.querySelector("[data-plant-approved-order]");
    if (!section) return;
    section.replaceChildren();
    section.className = "plantPanel plantApprovedOrder";
    section.setAttribute("aria-label", "Approved order");
    section.append(text("h3", "", "Approved order"));
    const order = facility ? orderForFacility(snapshot, facility.id) : null;
    if (!order) {
      section.dataset.plantLifecycleClass = "NONE";
      section.append(text("p", "plantOrderEmpty", "No approved/current operational order for this facility."));
      section.append(text("p", "plantNotice", "Recommendations remain separate from approved orders. This renderer does not create operational orders."));
      return;
    }
    section.dataset.plantLifecycleClass = order.lifecycleClass || "APPROVED_PLAN";
    section.append(
      text("p", "plantLifecycleBadge approved", `Lifecycle class: ${order.lifecycleClass}; actionable: ${order.actionable ? "true" : "false"}`),
      metric("Order", order.id, order.status),
      metric("Package", order.packageId, `revision ${order.revision}`)
    );
  }

  function renderChecklist(root, facility, snapshot) {
    const section = root.querySelector("[data-plant-checklist]");
    if (!section) return;
    section.replaceChildren();
    section.className = "plantPanel plantChecklist";
    section.setAttribute("aria-label", "Operational checklist");
    section.append(text("h3", "", "Checklist"));
    const order = facility ? orderForFacility(snapshot, facility.id) : null;
    if (!order) {
      section.append(text("p", "", "Checklist locked until an approved order exists."));
      ["downstream notice", "operator handoff", "dam safety confirmation"].forEach((label) => {
        const row = el("label", "plantCheckRow");
        const input = el("input", "", { type: "checkbox", disabled: "" });
        row.append(input, text("span", "", label));
        section.append(row);
      });
      return;
    }
    Object.keys(order.checklist || {}).forEach((key) => {
      const row = el("label", "plantCheckRow");
      const input = el("input", "", { type: "checkbox", disabled: "", checked: order.checklist[key] ? "" : null });
      row.append(input, text("span", "", key));
      section.append(row);
    });
  }

  function renderExecution(root, facility, snapshot) {
    const section = root.querySelector("[data-plant-execution]");
    if (!section) return;
    section.replaceChildren();
    section.className = "plantPanel plantExecution";
    section.setAttribute("aria-label", "Execution status");
    section.append(text("h3", "", "Execution"));
    const order = facility ? orderForFacility(snapshot, facility.id) : null;
    const execution = order ? executionForOrder(snapshot, order.id) : null;
    if (!order || !execution) {
      section.append(text("p", "", "No execution state. Execution controls remain unavailable until approval and Task 7 wiring."));
      return;
    }
    section.append(
      metric("Execution", execution.id, execution.status),
      metric("Observations", Array.isArray(execution.observations) ? execution.observations.length : 0, "stored workflow observations")
    );
  }

  function renderMissingDependencies(root, facility) {
    const existing = root.querySelector("[data-plant-missing-dependencies]");
    if (existing) existing.remove();
    if (!facility || facility.operationalDataState !== "NOT_IN_CURRENT_DEMO") return;
    const section = root.querySelector("[data-plant-current-state]");
    if (!section) return;
    const list = el("ul", "plantMissingDependencies", { dataset: { plantMissingDependencies: "" } });
    MISSING_DEPENDENCIES.forEach((item) => list.appendChild(text("li", "", item)));
    section.append(text("h4", "", "Missing operational dependencies"));
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
    grid.append(map, current, advisory, alternatives, approved, checklist, execution);
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

  if (FT.bus) {
    ["scrubbed", "hydroRebuilt", "opsAudit", "compareChanged", "lang"].forEach((eventName) => {
      FT.bus.on(eventName, refreshPlant);
    });
  }
})();
