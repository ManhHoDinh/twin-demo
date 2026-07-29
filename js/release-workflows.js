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

  function matchesApproval(proposal, entry) {
    if (!proposal || !entry || entry.action !== "decision.approve" || !attributed(entry)) return false;
    const detail = entry.detail || {};
    if (detail.package !== proposal.packageId && detail.package !== proposal.id) return false;
    if (!detail.decision || !FT.roles || !FT.roles.can(detail.decision, roleForAuthorization(entry))) return false;
    if (!entry.reason || String(entry.reason).trim().length < 4) return false;
    return true;
  }

  function log(action, detail, reason) {
    return FT.ops && FT.ops.audit ? FT.ops.audit.log(action, detail, reason) : null;
  }

  const R = {};

  R.ingestProposal = function (pkg) {
    if (!pkg || pkg.kind !== "PROPOSAL" || !pkg.reservoir) return null;
    const facility = FT.facilities.all().find((item) => item.demoReservoirId === pkg.reservoir.id);
    if (!facility) return null;
    const id = `PRP-${pkg.id}`;
    if (!state.proposals[id]) {
      state.proposals[id] = deepFreeze({
        id, eventId: state.event.id, facilityId: facility.id, packageId: pkg.id,
        lifecycleClass: FT.lifecycle.CLASS.RECOMMENDATION, actionable: false,
        revision: 1, createdAtH: FT.state.timeH, status: PROCESS.SUBMITTED,
      });
      log("release.proposal.ingest", { proposalId: id, package: pkg.id, facilityId: facility.id });
    }
    state.activeFacilityId = facility.id;
    return state.proposals[id];
  };

  R.recordDecision = function (auditEntry) {
    if (!auditEntry || !attributed(auditEntry)) return null;
    const detail = auditEntry.detail || {};
    const proposal = proposalForPackageId(detail.package);
    if (!proposal) return null;
    const approved = matchesApproval(proposal, auditEntry);
    const rejected = auditEntry.action === "decision.reject" || auditEntry.action === "decision.rejected";
    if (!approved && !rejected) return null;
    if (rejected && (!detail.decision || !FT.roles || !FT.roles.can(detail.decision, roleForAuthorization(auditEntry)))) return null;

    const id = `DEC-${auditEntry.seq || auditEntry.snapshot || proposal.packageId}`;
    if (!state.decisions[id]) {
      state.decisions[id] = deepFreeze({
        id, eventId: proposal.eventId, proposalId: proposal.id, packageId: proposal.packageId,
        auditSeq: auditEntry.seq || null, auditSnapshot: auditEntry.snapshot || null,
        decision: detail.decision, actor: auditEntry.actor, reason: auditEntry.reason || null,
        outcome: approved ? PROCESS.APPROVED : PROCESS.REJECTED,
        lifecycleClass: FT.lifecycle.CLASS.OPERATOR_DECISION, actionable: false,
        revision: 1, createdAtH: FT.state.timeH,
      });
    }
    return state.decisions[id];
  };

  R.createOrder = function (proposalId, auditEntry) {
    const proposal = state.proposals[proposalId];
    if (!matchesApproval(proposal, auditEntry)) return null;
    const decision = R.recordDecision(auditEntry);
    if (!decision) return null;
    const id = `ORD-${proposal.packageId}`;
    if (!state.orders[id]) {
      state.orders[id] = deepFreeze({
        id, eventId: proposal.eventId, proposalId: proposal.id, decisionId: decision.id,
        facilityId: proposal.facilityId, packageId: proposal.packageId,
        lifecycleClass: FT.lifecycle.CLASS.APPROVED_PLAN, actionable: true,
        revision: 1, createdAtH: FT.state.timeH, status: PROCESS.APPROVED,
        checklist: Object.freeze({}), observedCms: null, auditSeq: auditEntry.seq || null,
      });
      log("release.order.create", { orderId: id, proposalId: proposal.id, decisionId: decision.id, package: proposal.packageId });
    }
    return state.orders[id];
  };

  function updateOrder(orderId, status, action, extra, reason) {
    const prev = state.orders[orderId];
    if (!prev) return null;
    const next = Object.assign({}, prev, extra || {}, {
      status,
      revision: prev.revision + 1,
      updatedAtH: FT.state.timeH,
    });
    state.orders[orderId] = deepFreeze(next);
    log(action, Object.assign({ orderId, revision: next.revision, status }, extra || {}), reason);
    return state.orders[orderId];
  }

  R.markNotified = function (orderId) {
    return updateOrder(orderId, PROCESS.NOTIFIED, "release.order.notified");
  };

  R.startExecution = function (orderId) {
    const order = updateOrder(orderId, PROCESS.EXECUTING, "release.execution.start");
    if (!order) return null;
    const id = `EXE-${orderId}`;
    const prev = state.executions[id] || { id, orderId, revision: 0, observations: [] };
    state.executions[id] = deepFreeze(Object.assign({}, prev, {
      revision: prev.revision + 1,
      status: PROCESS.EXECUTING,
      startedAtH: prev.startedAtH == null ? FT.state.timeH : prev.startedAtH,
    }));
    return state.executions[id];
  };

  R.setChecklist = function (orderId, key, checked) {
    const prev = state.orders[orderId];
    if (!prev || !key) return null;
    const checklist = Object.freeze(Object.assign({}, prev.checklist || {}, { [key]: !!checked }));
    return updateOrder(orderId, prev.status, "release.checklist.set", { checklist, checklistKey: key, checked: !!checked });
  };

  R.recordObservedRelease = function (orderId, observedCms) {
    if (!isFinite(observedCms)) return null;
    const order = updateOrder(orderId, PROCESS.EXECUTING, "release.observed", { observedCms });
    if (!order) return null;
    const id = `EXE-${orderId}`;
    const prev = state.executions[id] || { id, orderId, revision: 0, observations: [] };
    const observations = (prev.observations || []).concat([{ tH: FT.state.timeH, observedCms }]);
    state.executions[id] = deepFreeze(Object.assign({}, prev, {
      revision: prev.revision + 1,
      status: PROCESS.EXECUTING,
      observations,
    }));
    return state.executions[id];
  };

  R.close = function (orderId) {
    return updateOrder(orderId, PROCESS.CLOSED, "release.order.close");
  };

  R.snapshot = function () {
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

  Object.defineProperty(FT, "releaseOps", {
    value: Object.freeze(R),
    enumerable: true,
    writable: false,
    configurable: false,
  });
})();
