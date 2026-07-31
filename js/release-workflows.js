/* FloodTwin — shared release workflow state.
   This module stores workflow facts for later city/plant renderers. It does not make
   proposals operational: only an attributed, entitled approval audit entry can create an
   actionable order. */
(function () {
  "use strict";
  const FT = window.FT;
  if (Object.prototype.hasOwnProperty.call(FT, "releaseOps")) {
    throw new Error("FT.releaseOps is already initialized");
  }

  const PROCESS = Object.freeze({
    DETECTED: "DETECTED", ASSESSED: "ASSESSED", PROPOSED: "PROPOSED",
    COORDINATED: "COORDINATED", SUBMITTED: "SUBMITTED", APPROVED: "APPROVED",
    REJECTED: "REJECTED", NOTIFIED: "NOTIFIED", EXECUTING: "EXECUTING",
    DEVIATING: "DEVIATING", VERIFIED: "VERIFIED", CLOSED: "CLOSED",
  });
  const CHECKS = Object.freeze([
    "order-valid", "notifications-acknowledged", "plant-ready", "outlet-ready",
    "ramp-started", "actual-recorded", "downstream-monitored", "completion-confirmed",
  ]);
  const REQUIRED_START_CHECKS = Object.freeze(CHECKS.slice(0, 4));
  const REQUIRED_CLOSE_CHECKS = Object.freeze(CHECKS.slice(4));
  const DEMO_TOLERANCE_CMS = 5;

  const state = {
    event: Object.freeze({ id: `EVT-${FT.state.scenario}`, scenarioId: FT.state.scenario, processes: Object.freeze({}) }),
    proposals: {},
    decisions: {},
    orders: {},
    executions: {},
    activeFacilityId: "a-vuong",
  };

  function eventForScenario() {
    return Object.freeze({ id: `EVT-${FT.state.scenario}`, scenarioId: FT.state.scenario, processes: Object.freeze({}) });
  }

  function syncEvent() {
    const nextId = `EVT-${FT.state.scenario}`;
    if (!state.event || state.event.id !== nextId) state.event = eventForScenario();
    return state.event;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
  }

  function freezeCopy(value) {
    return deepFreeze(JSON.parse(JSON.stringify(value)));
  }

  function dictSnapshot(dict) {
    const out = {};
    for (const [key, value] of Object.entries(dict)) out[key] = freezeCopy(value);
    return Object.freeze(out);
  }

  function proposalForPackageId(packageId) {
    return Object.values(state.proposals)
      .filter((proposal) => proposal.packageId === packageId && activeProposal(proposal))
      .sort((a, b) => b.revision - a.revision)[0] || null;
  }

  function orderForProposal(proposal) {
    return Object.values(state.orders).find((item) => item &&
      item.eventId === proposal.eventId &&
      item.facilityId === proposal.facilityId &&
      item.proposalId === proposal.id) || null;
  }

  function currentPriorOrdersForProposal(proposal) {
    return Object.values(state.orders)
      .filter((order) => order &&
        order.eventId === proposal.eventId &&
        order.packageId === proposal.packageId &&
        order.facilityId === proposal.facilityId &&
        order.proposalId !== proposal.id &&
        !order.supersededBy)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  function storedAuditEntry(entry) {
    if (!entry || entry.seq == null || !entry.snapshot || !FT.ops || !FT.ops.audit) return null;
    return typeof FT.ops.audit.stored === "function" ? FT.ops.audit.stored(entry) : null;
  }

  function roleIdOf(label) {
    return FT.roles && FT.roles.roleIdOf ? FT.roles.roleIdOf(label) : null;
  }

  function auditedActorRole(entry) {
    const actor = entry && entry.actor;
    const match = typeof actor === "string" ? actor.match(/\(([^)]+)\)$/) : null;
    return match ? roleIdOf(match[1]) : null;
  }

  function detailRole(entry) {
    const label = entry && entry.detail && entry.detail.actorRole;
    return label ? roleIdOf(label) : null;
  }

  function roleForAuthorization(entry) {
    const actorRole = auditedActorRole(entry);
    if (!actorRole) return null;
    const label = entry && entry.detail && entry.detail.actorRole;
    if (label && detailRole(entry) !== actorRole) return null;
    return actorRole;
  }

  function attributed(entry) {
    return !!(entry && entry.actor && entry.actor !== "unattributed");
  }

  function auditEventId(entry) {
    return entry && entry.scenario ? `EVT-${entry.scenario}` : null;
  }

  function proposalEventAuthorized(proposal, entry) {
    if (!proposal || !entry) return false;
    const detail = entry.detail || {};
    if (auditEventId(entry) !== proposal.eventId) return false;
    if (detail.eventId && detail.eventId !== proposal.eventId) return false;
    return syncEvent().id === proposal.eventId;
  }

  function activeProposal(proposal) {
    return !!(proposal && proposal.eventId === syncEvent().id && !proposal.supersededBy && proposal.status !== PROCESS.REJECTED);
  }

  function matchesApproval(proposal, entry) {
    if (!activeProposal(proposal) || !entry || entry.action !== "decision.approve" || !attributed(entry)) return false;
    if (!proposalEventAuthorized(proposal, entry)) return false;
    const detail = entry.detail || {};
    if (detail.package !== proposal.packageId && detail.package !== proposal.id) return false;
    if (!detail.decision || !FT.roles || !FT.roles.can(detail.decision, roleForAuthorization(entry))) return false;
    if (!entry.reason || String(entry.reason).trim().length < 4) return false;
    return true;
  }

  function matchesRejection(proposal, entry) {
    if (!activeProposal(proposal) || !entry || entry.action !== "decision.reject" || !attributed(entry)) return false;
    if (!proposalEventAuthorized(proposal, entry)) return false;
    const detail = entry.detail || {};
    if (detail.package !== proposal.packageId && detail.package !== proposal.id) return false;
    if (!detail.decision || !FT.roles || !FT.roles.can(detail.decision, roleForAuthorization(entry))) return false;
    if (!entry.reason || String(entry.reason).trim().length < 4) return false;
    return true;
  }

  function packageDecisionAuthorized(pkg, entry, action) {
    if (!pkg || pkg.kind !== "PROPOSAL" || pkg.feasible === false || !entry || entry.action !== action || !attributed(entry)) return false;
    const detail = entry.detail || {};
    const eventId = auditEventId(entry);
    if (!eventId || eventId !== syncEvent().id) return false;
    if (detail.eventId && detail.eventId !== eventId) return false;
    if (detail.package !== pkg.id) return false;
    if (!detail.decision || !FT.roles || !FT.roles.can(detail.decision, roleForAuthorization(entry))) return false;
    if (!entry.reason || String(entry.reason).trim().length < 4) return false;
    return true;
  }

  function log(action, detail, reason) {
    if (!FT.ops || !FT.ops.audit || typeof FT.ops.audit.log !== "function") return null;
    try {
      return FT.ops.audit.log(action, detail, reason) || null;
    } catch (e) {
      return null;
    }
  }

  function approvalEvidence(proposal, auditEntry) {
    const stored = storedAuditEntry(auditEntry);
    return matchesApproval(proposal, stored) ? stored : null;
  }

  function buildDecision(proposal, auditEntry, outcome) {
    const detail = auditEntry.detail || {};
    return deepFreeze({
      id: `DEC-${auditEntry.seq}`,
      eventId: proposal.eventId, proposalId: proposal.id, packageId: proposal.packageId,
      auditSeq: auditEntry.seq, auditSnapshot: auditEntry.snapshot,
      decision: detail.decision, actor: auditEntry.actor, reason: auditEntry.reason || null,
      outcome,
      lifecycleClass: FT.lifecycle.CLASS.OPERATOR_DECISION, actionable: false,
      revision: 1, createdAtH: FT.state.timeH,
    });
  }

  function immutableAction(pkg) {
    const action = pkg && pkg.action;
    return deepFreeze({
      commandedCms: Number.isFinite(action && action.q1) ? action.q1 : null,
      previousCms: Number.isFinite(action && action.q0) ? action.q0 : null,
      tStart: Number.isFinite(action && action.tStart) ? action.tStart : null,
      rampMax: Number.isFinite(action && action.rampMax) ? action.rampMax : null,
      endCondition: action && action.endCondition ? String(action.endCondition) : null,
      gates: action && action.gates ? String(action.gates) : null,
    });
  }

  function actionSignature(action) {
    return JSON.stringify([
      action && action.commandedCms,
      action && action.previousCms,
      action && action.tStart,
      action && action.rampMax,
      action && action.endCondition,
      action && action.gates,
    ]);
  }

  function shortHash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).slice(0, 8);
  }

  function compatibleOrder(order, proposal) {
    return !!(order &&
      order.eventId === proposal.eventId &&
      order.facilityId === proposal.facilityId &&
      order.proposalId === proposal.id);
  }

  function uniqueOrderId(baseId, proposal, staleOrders) {
    const preferred = staleOrders.length ? `${baseId}-R${proposal.revision}` : baseId;
    if (!state.orders[preferred] || compatibleOrder(state.orders[preferred], proposal)) return preferred;
    const eventScoped = `${baseId}-${proposal.eventId}`;
    if (!state.orders[eventScoped] || compatibleOrder(state.orders[eventScoped], proposal)) return eventScoped;
    const facilityScoped = `${eventScoped}-${proposal.facilityId}`;
    if (!state.orders[facilityScoped] || compatibleOrder(state.orders[facilityScoped], proposal)) return facilityScoped;
    return `${facilityScoped}-${shortHash(proposal.id)}`;
  }

  function proposalMatchesPackage(proposal, pkg, facility, action) {
    return !!(proposal &&
      proposal.eventId === syncEvent().id &&
      proposal.facilityId === facility.id &&
      proposal.packageId === pkg.id &&
      actionSignature(proposal.action) === actionSignature(action));
  }

  function currentOrder(order) {
    return !!(order && order.eventId === syncEvent().id && !order.supersededBy);
  }

  function demoOrder(order) {
    const facility = demoFacility(order);
    return !!(facility && facility.operationalDataState === "ASSUMED_FOR_DEMO" && facility.demoReservoirId);
  }

  function mutableOrder(order) {
    return !!(currentOrder(order) && demoOrder(order) && order.status !== PROCESS.CLOSED);
  }

  function validCheckKey(key) {
    return CHECKS.includes(key);
  }

  function checksSatisfied(order, keys) {
    const checklist = order && order.checklist ? order.checklist : {};
    return keys.every((key) => checklist[key] === true);
  }

  function emitWorkflowChanged(kind, detail) {
    if (FT.bus) FT.bus.emit("releaseWorkflowChanged", Object.assign({ kind }, detail || {}));
  }

  function demoFacility(order) {
    return order && FT.facilities && FT.facilities.get ? FT.facilities.get(order.facilityId) : null;
  }

  function missingActual(order) {
    const commandedCms = Number.isFinite(order && order.commandedCms) ? order.commandedCms : null;
    return deepFreeze({ commandedCms, observedCms: null, status: "MISSING", message: "telemetry not supplied", provenance: "MISSING" });
  }

  function observedReleaseFromDemo(order) {
    const facility = demoFacility(order);
    if (!facility || facility.operationalDataState !== "ASSUMED_FOR_DEMO" || !facility.demoReservoirId) return null;
    const snap = FT.hydro && typeof FT.hydro.at === "function" ? FT.hydro.at(FT.state.timeH) : null;
    const reservoir = snap && snap.reservoirs ? snap.reservoirs[facility.demoReservoirId] : null;
    return reservoir && Number.isFinite(reservoir.O) ? reservoir.O : null;
  }

  function actualState(order) {
    const commandedCms = Number.isFinite(order && order.commandedCms) ? order.commandedCms : null;
    if (!Number.isFinite(commandedCms)) return missingActual(order);
    const value = observedReleaseFromDemo(order);
    if (!Number.isFinite(value)) {
      return deepFreeze({ commandedCms, observedCms: null, status: "MISSING", message: "telemetry not supplied", provenance: "ASSUMED_FOR_DEMO", toleranceCms: DEMO_TOLERANCE_CMS });
    }
    const deviationCms = value - commandedCms;
    return deepFreeze({
      commandedCms,
      observedCms: value,
      deviationCms,
      status: Math.abs(deviationCms) <= DEMO_TOLERANCE_CMS ? "ON_COMMAND" : "DEVIATING",
      provenance: "ASSUMED_FOR_DEMO",
      toleranceCms: DEMO_TOLERANCE_CMS,
      toleranceNote: "Demo assumption; not a regulatory operating threshold.",
    });
  }

  const R = {};

  R.ingestProposal = function (pkg) {
    syncEvent();
    if (!pkg || pkg.kind !== "PROPOSAL" || !pkg.reservoir) return null;
    const facility = FT.facilities.all().find((item) => item.demoReservoirId === pkg.reservoir.id);
    if (!facility) return null;
    const action = immutableAction(pkg);
    const baseId = `PRP-${pkg.id}`;
    const existing = proposalForPackageId(pkg.id);
    if (!existing) {
      const id = state.proposals[baseId] ? `${baseId}@${shortHash(actionSignature(action))}` : baseId;
      const next = deepFreeze({
        id, eventId: state.event.id, facilityId: facility.id, packageId: pkg.id,
        action,
        lifecycleClass: FT.lifecycle.CLASS.RECOMMENDATION, actionable: false,
        revision: 1, createdAtH: FT.state.timeH, status: PROCESS.SUBMITTED,
      });
      const auditEntry = log("release.proposal.ingest", { eventId: state.event.id, proposalId: id, package: pkg.id, facilityId: facility.id });
      if (!auditEntry) return null;
      state.proposals[id] = next;
      state.activeFacilityId = facility.id;
      return state.proposals[id];
    }
    if (!proposalMatchesPackage(existing, pkg, facility, action)) {
      const archivedId = `${existing.id}@rev${existing.revision}`;
      const id = `${baseId}@${shortHash(actionSignature(action))}`;
      const archived = deepFreeze(Object.assign({}, existing, {
        id: archivedId,
        status: "SUPERSEDED",
        supersededBy: id,
        revision: existing.revision + 1,
        updatedAtH: FT.state.timeH,
      }));
      const next = deepFreeze({
        id, eventId: state.event.id, facilityId: facility.id, packageId: pkg.id,
        action,
        lifecycleClass: FT.lifecycle.CLASS.RECOMMENDATION, actionable: false,
        revision: archived.revision + 1, createdAtH: FT.state.timeH, status: PROCESS.SUBMITTED,
        previousProposalId: archivedId,
      });
      const revisionAudit = log("release.proposal.revise", {
        eventId: state.event.id,
        proposalId: archivedId,
        supersededBy: id,
        package: pkg.id,
        facilityId: facility.id,
        reason: "action-signature-mismatch",
      });
      if (!revisionAudit) return null;
      delete state.proposals[existing.id];
      state.proposals[archivedId] = archived;
      state.proposals[id] = next;
      state.activeFacilityId = facility.id;
      emitWorkflowChanged("release.proposal.revise", { eventId: state.event.id, proposalId: archivedId, supersededBy: id, status: archived.status });
      return state.proposals[id];
    }
    return activeProposal(existing) ? existing : null;
  };

  R.recordDecision = function (auditEntry) {
    const stored = storedAuditEntry(auditEntry);
    if (!stored || !attributed(stored)) return null;
    const detail = stored.detail || {};
    const proposal = proposalForPackageId(detail.package);
    if (!proposal) return null;
    if (!proposalEventAuthorized(proposal, stored)) return null;
    const approved = matchesApproval(proposal, stored);
    const rejected = matchesRejection(proposal, stored);
    if (!approved && !rejected) return null;

    const id = `DEC-${stored.seq}`;
    if (!state.decisions[id]) {
      if (rejected) {
        const nextProposal = deepFreeze(Object.assign({}, proposal, {
          status: PROCESS.REJECTED,
          revision: proposal.revision + 1,
          rejectedDecisionId: id,
          updatedAtH: FT.state.timeH,
        }));
        const rejectAudit = log("release.proposal.reject", { eventId: proposal.eventId, proposalId: proposal.id, decisionId: id, package: proposal.packageId });
        if (!rejectAudit) return null;
        state.proposals[proposal.id] = nextProposal;
      }
      state.decisions[id] = buildDecision(proposal, stored, approved ? PROCESS.APPROVED : PROCESS.REJECTED);
    }
    return state.decisions[id];
  };

  R.createOrder = function (proposalId, auditEntry) {
    const proposal = state.proposals[proposalId];
    const stored = approvalEvidence(proposal, auditEntry);
    if (!stored) return null;
    const decisionId = `DEC-${stored.seq}`;
    const decision = state.decisions[decisionId] || buildDecision(proposal, stored, PROCESS.APPROVED);
    const existingOrder = orderForProposal(proposal);
    if (existingOrder) return existingOrder;
    const baseId = `ORD-${proposal.packageId}`;
    const staleOrders = currentPriorOrdersForProposal(proposal);
    const supersededOrderIds = staleOrders.map((order) => order.id);
    const id = uniqueOrderId(baseId, proposal, staleOrders);
    if (state.orders[id] && compatibleOrder(state.orders[id], proposal)) return state.orders[id];
    const order = deepFreeze({
      id, eventId: proposal.eventId, proposalId: proposal.id, decisionId: decision.id,
      facilityId: proposal.facilityId, packageId: proposal.packageId,
      commandedCms: proposal.action.commandedCms,
      previousCms: proposal.action.previousCms,
      tStart: proposal.action.tStart,
      rampMax: proposal.action.rampMax,
      action: proposal.action,
      lifecycleClass: FT.lifecycle.CLASS.APPROVED_PLAN, actionable: true,
      revision: 1, createdAtH: FT.state.timeH, status: PROCESS.APPROVED,
      checklist: Object.freeze({}), actual: missingActual({ facilityId: proposal.facilityId, commandedCms: proposal.action.commandedCms }),
      observedCms: null, auditSeq: stored.seq,
    });
    const orderAudit = log("release.order.create", {
      eventId: proposal.eventId,
      orderId: id,
      proposalId: proposal.id,
      decisionId: decision.id,
      package: proposal.packageId,
      supersedesOrderId: supersededOrderIds[0] || null,
      supersededOrderIds,
    });
    if (!orderAudit) return null;
    state.decisions[decision.id] = decision;
    for (const staleOrder of staleOrders) {
      state.orders[staleOrder.id] = deepFreeze(Object.assign({}, staleOrder, {
        supersededBy: id,
        revision: staleOrder.revision + 1,
        updatedAtH: FT.state.timeH,
      }));
    }
    state.orders[id] = order;
    return state.orders[id];
  };

  function commitOrder(orderId, status, action, extra, reason) {
    const prev = state.orders[orderId];
    if (!prev) return null;
    const next = Object.assign({}, prev, extra || {}, {
      status,
      revision: prev.revision + 1,
      updatedAtH: FT.state.timeH,
    });
    const frozen = deepFreeze(next);
    const auditEntry = log(action, Object.assign({ eventId: frozen.eventId, orderId, revision: frozen.revision, status }, extra || {}), reason);
    if (!auditEntry) return null;
    state.orders[orderId] = frozen;
    emitWorkflowChanged(action, { eventId: frozen.eventId, orderId, status });
    return state.orders[orderId];
  }

  R.markNotified = function (orderId) {
    const prev = state.orders[orderId];
    if (!prev || !mutableOrder(prev) || prev.status !== PROCESS.APPROVED) return null;
    return R.setChecklist(orderId, "notifications-acknowledged", true);
  };

  R.startExecution = function (orderId) {
    const prevOrder = state.orders[orderId];
    if (!prevOrder || !mutableOrder(prevOrder) || prevOrder.status !== PROCESS.APPROVED || !checksSatisfied(prevOrder, REQUIRED_START_CHECKS)) return null;
    const id = `EXE-${orderId}`;
    const prev = state.executions[id] || { id, orderId, revision: 0, observations: [] };
    const order = deepFreeze(Object.assign({}, prevOrder, {
      status: PROCESS.EXECUTING,
      revision: prevOrder.revision + 1,
      updatedAtH: FT.state.timeH,
    }));
    const execution = deepFreeze(Object.assign({}, prev, {
      revision: prev.revision + 1,
      status: PROCESS.EXECUTING,
      startedAtH: prev.startedAtH == null ? FT.state.timeH : prev.startedAtH,
    }));
    const auditEntry = log("release.execution.start", { eventId: order.eventId, orderId, revision: order.revision, status: order.status });
    if (!auditEntry) return null;
    state.orders[orderId] = order;
    state.executions[id] = execution;
    emitWorkflowChanged("release.execution.start", { eventId: order.eventId, orderId, status: order.status });
    return state.executions[id];
  };

  R.setChecklist = function (orderId, key, checked) {
    const prev = state.orders[orderId];
    if (!prev || !mutableOrder(prev) || !validCheckKey(key)) return null;
    const checklist = Object.freeze(Object.assign({}, prev.checklist || {}, { [key]: !!checked }));
    return commitOrder(orderId, prev.status, "release.checklist.set", { checklist, checklistKey: key, checked: !!checked });
  };

  R.recordObservedRelease = function (orderId) {
    const prevOrder = state.orders[orderId];
    if (!prevOrder || !mutableOrder(prevOrder) || ![PROCESS.EXECUTING, PROCESS.DEVIATING].includes(prevOrder.status)) return null;
    const id = `EXE-${orderId}`;
    const prev = state.executions[id] || { id, orderId, revision: 0, observations: [] };
    const actual = actualState(prevOrder);
    if (!actual || !Number.isFinite(actual.observedCms)) return null;
    const observedCms = actual.observedCms;
    const status = actual.status === "DEVIATING" ? PROCESS.DEVIATING : PROCESS.EXECUTING;
    const observations = (prev.observations || []).concat([{ tH: FT.state.timeH, observedCms, actual }]);
    const order = deepFreeze(Object.assign({}, prevOrder, {
      revision: prevOrder.revision + 1,
      updatedAtH: FT.state.timeH,
      observedCms,
      actual,
      status,
    }));
    const execution = deepFreeze(Object.assign({}, prev, {
      revision: prev.revision + 1,
      status,
      observations,
    }));
    const auditEntry = log("release.observed", { eventId: order.eventId, orderId, revision: order.revision, status: order.status, observedCms, actual });
    if (!auditEntry) return null;
    state.orders[orderId] = order;
    state.executions[id] = execution;
    emitWorkflowChanged("release.observed", { eventId: order.eventId, orderId, status: order.status });
    return state.executions[id];
  };

  R.close = function (orderId) {
    const prev = state.orders[orderId];
    if (!prev || !mutableOrder(prev) || ![PROCESS.EXECUTING, PROCESS.DEVIATING, PROCESS.VERIFIED].includes(prev.status)) return null;
    if (!checksSatisfied(prev, REQUIRED_CLOSE_CHECKS)) return null;
    if (!prev.actual || !["ON_COMMAND", "DEVIATING"].includes(prev.actual.status)) return null;
    return commitOrder(orderId, PROCESS.CLOSED, "release.order.close");
  };

  R.actualVersusCommanded = function (orderId) {
    const order = state.orders[orderId];
    if (!order) return Object.freeze({ status: "MISSING", message: "telemetry not supplied", provenance: "MISSING" });
    return order.actual || missingActual(order);
  };

  R.prerequisitesSatisfied = function (orderId) {
    const order = state.orders[orderId];
    return !!(order && mutableOrder(order) && order.status === PROCESS.APPROVED && checksSatisfied(order, REQUIRED_START_CHECKS));
  };

  R.completeSatisfied = function (orderId) {
    const order = state.orders[orderId];
    return !!(order && mutableOrder(order) && [PROCESS.EXECUTING, PROCESS.DEVIATING, PROCESS.VERIFIED].includes(order.status) &&
      checksSatisfied(order, REQUIRED_CLOSE_CHECKS) && order.actual && ["ON_COMMAND", "DEVIATING"].includes(order.actual.status));
  };

  R.completionRule = function (orderId) {
    const order = state.orders[orderId];
    const endCondition = order && order.action && order.action.endCondition ? order.action.endCondition : "approved plan end condition";
    return Object.freeze({
      orderId: order ? order.id : null,
      endCondition,
      requiredChecks: Object.freeze(REQUIRED_CLOSE_CHECKS.slice()),
      requiresObservedActual: true,
      rule: `Close requires observed actual-versus-commanded evidence plus ${REQUIRED_CLOSE_CHECKS.join(", ")} for: ${endCondition}.`,
    });
  };

  R.snapshot = function () {
    syncEvent();
    return Object.freeze({
      event: freezeCopy(state.event),
      activeFacilityId: state.activeFacilityId,
      proposals: dictSnapshot(state.proposals),
      decisions: dictSnapshot(state.decisions),
      orders: dictSnapshot(state.orders),
      executions: dictSnapshot(state.executions),
    });
  };

  R.PROCESS = PROCESS;
  R.CHECKS = Object.freeze(CHECKS.slice());
  R.DEMO_TOLERANCE_CMS = DEMO_TOLERANCE_CMS;

  if (FT.bus) FT.bus.on("hydroRebuilt", syncEvent);
  if (FT.bus && !FT.__releaseDecisionListenerInstalled) {
    FT.__releaseDecisionListenerInstalled = true;
    FT.bus.on("releaseDecision", (payload) => {
      const action = payload && payload.action;
      const auditEntry = payload && payload.auditEntry;
      const pkg = payload && payload.package;
      if (action !== "decision.approve" && action !== "decision.reject") return;
      const stored = storedAuditEntry(auditEntry);
      if (!packageDecisionAuthorized(pkg, stored, action)) return;
      const before = JSON.stringify({ proposals: state.proposals, decisions: state.decisions, orders: state.orders });
      const proposal = R.ingestProposal(pkg);
      if (!proposal) return;
      const decision = R.recordDecision(stored);
      if (!decision) return;
      let order = null;
      if (action === "decision.approve") order = R.createOrder(proposal.id, stored);
      else if (action !== "decision.reject") return;
      const after = JSON.stringify({ proposals: state.proposals, decisions: state.decisions, orders: state.orders });
      if (before !== after) emitWorkflowChanged(action, {
        eventId: proposal.eventId,
        facilityId: proposal.facilityId,
        proposalId: proposal.id,
        decisionId: decision.id,
        orderId: order && order.id,
      });
    });
  }

  Object.defineProperty(FT, "releaseOps", {
    value: Object.freeze(R),
    enumerable: true,
    writable: false,
    configurable: false,
  });
})();
