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
    return state.proposals[`PRP-${packageId}`] || null;
  }

  function orderForProposalId(proposalId) {
    return Object.values(state.orders).find((item) => item.proposalId === proposalId) || null;
  }

  function storedAuditEntry(entry) {
    if (!entry || entry.seq == null || !entry.snapshot || !FT.ops || !FT.ops.audit) return null;
    return FT.ops.audit.entries.find((item) => item.seq === entry.seq && item.snapshot === entry.snapshot) || null;
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

  function matchesApproval(proposal, entry) {
    if (!proposal || !entry || entry.action !== "decision.approve" || !attributed(entry)) return false;
    if (!proposalEventAuthorized(proposal, entry)) return false;
    const detail = entry.detail || {};
    if (detail.package !== proposal.packageId && detail.package !== proposal.id) return false;
    if (!detail.decision || !FT.roles || !FT.roles.can(detail.decision, roleForAuthorization(entry))) return false;
    if (!entry.reason || String(entry.reason).trim().length < 4) return false;
    return true;
  }

  function matchesRejection(proposal, entry) {
    if (!proposal || !entry || entry.action !== "decision.reject" || !attributed(entry)) return false;
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

  function actualState(order, observedCms) {
    const facility = demoFacility(order);
    const commandedCms = Number.isFinite(order && order.commandedCms) ? order.commandedCms : null;
    if (!facility || facility.operationalDataState !== "ASSUMED_FOR_DEMO" || !facility.demoReservoirId || !Number.isFinite(commandedCms)) {
      return deepFreeze({ status: "MISSING", message: "telemetry not supplied", provenance: "MISSING" });
    }
    const value = Number.isFinite(observedCms) ? observedCms : null;
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
    const id = `PRP-${pkg.id}`;
    if (!state.proposals[id]) {
      const next = deepFreeze({
        id, eventId: state.event.id, facilityId: facility.id, packageId: pkg.id,
        action: immutableAction(pkg),
        lifecycleClass: FT.lifecycle.CLASS.RECOMMENDATION, actionable: false,
        revision: 1, createdAtH: FT.state.timeH, status: PROCESS.SUBMITTED,
      });
      const auditEntry = log("release.proposal.ingest", { eventId: state.event.id, proposalId: id, package: pkg.id, facilityId: facility.id });
      if (!auditEntry) return null;
      state.proposals[id] = next;
      state.activeFacilityId = facility.id;
      return state.proposals[id];
    }
    return state.proposals[id];
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
    const id = `ORD-${proposal.packageId}`;
    if (state.orders[id]) return state.orders[id];
    if (orderForProposalId(proposal.id)) return orderForProposalId(proposal.id);
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
      checklist: Object.freeze({}), actual: actualState({ facilityId: proposal.facilityId, commandedCms: proposal.action.commandedCms }, null),
      observedCms: null, auditSeq: stored.seq,
    });
    const orderAudit = log("release.order.create", { eventId: proposal.eventId, orderId: id, proposalId: proposal.id, decisionId: decision.id, package: proposal.packageId });
    if (!orderAudit) return null;
    state.decisions[decision.id] = decision;
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

  R.recordObservedRelease = function (orderId, observedCms) {
    if (!isFinite(observedCms)) return null;
    const prevOrder = state.orders[orderId];
    if (!prevOrder || !mutableOrder(prevOrder) || ![PROCESS.EXECUTING, PROCESS.DEVIATING].includes(prevOrder.status)) return null;
    const id = `EXE-${orderId}`;
    const prev = state.executions[id] || { id, orderId, revision: 0, observations: [] };
    const actual = actualState(prevOrder, observedCms);
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
    return order.actual || actualState(order, order.observedCms);
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
