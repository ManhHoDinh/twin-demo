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
    const rejected = stored.action === "decision.reject" || stored.action === "decision.rejected";
    if (!approved && !rejected) return null;
    if (rejected && (!detail.decision || !FT.roles || !FT.roles.can(detail.decision, roleForAuthorization(stored)))) return null;

    const id = `DEC-${stored.seq}`;
    if (!state.decisions[id]) {
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
    const order = deepFreeze({
      id, eventId: proposal.eventId, proposalId: proposal.id, decisionId: decision.id,
      facilityId: proposal.facilityId, packageId: proposal.packageId,
      lifecycleClass: FT.lifecycle.CLASS.APPROVED_PLAN, actionable: true,
      revision: 1, createdAtH: FT.state.timeH, status: PROCESS.APPROVED,
      checklist: Object.freeze({}), observedCms: null, auditSeq: stored.seq,
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
    return state.orders[orderId];
  }

  R.markNotified = function (orderId) {
    const prev = state.orders[orderId];
    if (!prev || prev.status !== PROCESS.APPROVED) return null;
    return commitOrder(orderId, PROCESS.NOTIFIED, "release.order.notified");
  };

  R.startExecution = function (orderId) {
    const prevOrder = state.orders[orderId];
    if (!prevOrder || prevOrder.status !== PROCESS.NOTIFIED) return null;
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
    return state.executions[id];
  };

  R.setChecklist = function (orderId, key, checked) {
    const prev = state.orders[orderId];
    if (!prev || !key || prev.status === PROCESS.CLOSED) return null;
    const checklist = Object.freeze(Object.assign({}, prev.checklist || {}, { [key]: !!checked }));
    return commitOrder(orderId, prev.status, "release.checklist.set", { checklist, checklistKey: key, checked: !!checked });
  };

  R.recordObservedRelease = function (orderId, observedCms) {
    if (!isFinite(observedCms)) return null;
    const prevOrder = state.orders[orderId];
    if (!prevOrder || ![PROCESS.EXECUTING, PROCESS.DEVIATING].includes(prevOrder.status)) return null;
    const id = `EXE-${orderId}`;
    const prev = state.executions[id] || { id, orderId, revision: 0, observations: [] };
    const observations = (prev.observations || []).concat([{ tH: FT.state.timeH, observedCms }]);
    const order = deepFreeze(Object.assign({}, prevOrder, {
      revision: prevOrder.revision + 1,
      updatedAtH: FT.state.timeH,
      observedCms,
    }));
    const execution = deepFreeze(Object.assign({}, prev, {
      revision: prev.revision + 1,
      status: prevOrder.status,
      observations,
    }));
    const auditEntry = log("release.observed", { eventId: order.eventId, orderId, revision: order.revision, status: order.status, observedCms });
    if (!auditEntry) return null;
    state.orders[orderId] = order;
    state.executions[id] = execution;
    return state.executions[id];
  };

  R.close = function (orderId) {
    const prev = state.orders[orderId];
    if (!prev || ![PROCESS.EXECUTING, PROCESS.DEVIATING, PROCESS.VERIFIED].includes(prev.status)) return null;
    return commitOrder(orderId, PROCESS.CLOSED, "release.order.close");
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

  if (FT.bus) FT.bus.on("hydroRebuilt", syncEvent);

  Object.defineProperty(FT, "releaseOps", {
    value: Object.freeze(R),
    enumerable: true,
    writable: false,
    configurable: false,
  });
})();
