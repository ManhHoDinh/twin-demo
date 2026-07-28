/* FloodTwin — Scenario Comparison session. Simulation viewing is orthogonal to the
   approved operating policy and human decision lifecycle. */
(function () {
  "use strict";
  const FT = window.FT;
  const C = (FT.compare = {});

  const freshState = () => ({
    status: "EMPTY", sessionId: null, baseScenarioId: null, validTime: null,
    gaugeId: null, optionOrder: [], options: {}, selectedOptionId: null,
    leftDeltaOptionId: null, rightDeltaOptionId: null, viewPolicyKey: null, staleReason: null,
  });

  C.state = freshState();

  C.createBaseSnapshot = function () {
    C.state.sessionId = `CMP-${FT.state.scenario}-${Math.round(FT.state.timeH * 10)}`;
    C.state.baseScenarioId = FT.state.scenario;
    C.state.validTime = FT.state.timeH;
    C.state.gaugeId = FT.state.selectedGauge || FT.data.GAUGES[0].id;
    C.state.status = "BASE_READY";
    return C.state;
  };

  function deriveResult(definition) {
    const result = FT.ops.compareOption(Object.assign({}, definition, { gaugeId: C.state.gaugeId }));
    result.validTime = C.state.validTime;
    result.scenarioId = C.state.baseScenarioId;
    return result;
  }

  C.addOption = function (definition) {
    if (C.state.status === "EMPTY") C.createBaseSnapshot();
    if (C.state.optionOrder.length >= 4) throw new Error("comparison supports at most four options");
    if (C.state.options[definition.id]) return C.state.options[definition.id];
    if (definition.scenarioId && definition.scenarioId !== C.state.baseScenarioId) throw new Error("cross-scenario deltas are not comparable");
    const result = deriveResult(definition);
    const option = Object.assign({}, definition, {
      scenarioId: C.state.baseScenarioId,
      status: result.feasible ? "READY" : "INFEASIBLE",
      result,
    });
    C.state.options[option.id] = option;
    C.state.optionOrder.push(option.id);
    if (!C.state.selectedOptionId) C.state.selectedOptionId = option.id;
    if (!C.state.leftDeltaOptionId) C.state.leftDeltaOptionId = option.id;
    else if (!C.state.rightDeltaOptionId) C.state.rightDeltaOptionId = option.id;
    if (C.state.optionOrder.length >= 2) C.state.status = "COMPARING";
    FT.bus.emit("compareChanged", C.state);
    return option;
  };

  C.removeOption = function (id) {
    const option = C.state.options[id];
    if (!option) return null;
    const clearedView = C.state.selectedOptionId === id && C.state.viewPolicyKey !== null;
    delete C.state.options[id];
    C.state.optionOrder = C.state.optionOrder.filter((optionId) => optionId !== id);
    if (C.state.selectedOptionId === id) C.state.selectedOptionId = C.state.optionOrder[0] || null;
    C.state.leftDeltaOptionId = C.state.optionOrder[0] || null;
    C.state.rightDeltaOptionId = C.state.optionOrder[1] || null;
    if (clearedView) C.state.viewPolicyKey = null;
    C.state.status = C.state.optionOrder.length >= 2 ? "COMPARING" : "BASE_READY";
    FT.bus.emit("compareChanged", C.state);
    if (clearedView && FT.world && FT.world.ready) FT.bus.emit("scrubbed");
    return option;
  };

  C.selectGauge = function (gaugeId) {
    const gauge = FT.data.GAUGES.find((item) => item.id === gaugeId);
    if (!gauge) throw new Error(`unknown comparison gauge ${gaugeId}`);
    if (C.state.status === "EMPTY") C.createBaseSnapshot();
    C.state.gaugeId = gauge.id;
    for (const id of C.state.optionOrder) {
      const option = C.state.options[id];
      const definition = Object.assign({}, option);
      delete definition.result;
      delete definition.status;
      option.result = deriveResult(definition);
      option.status = option.result.feasible ? "READY" : "INFEASIBLE";
    }
    C.state.status = C.state.optionOrder.length >= 2 ? "COMPARING" : "BASE_READY";
    C.state.staleReason = null;
    FT.bus.emit("compareChanged", C.state);
    return gauge.id;
  };

  C.selectOption = function (id) {
    const option = C.state.options[id];
    if (!option) throw new Error(`unknown comparison option ${id}`);
    C.state.selectedOptionId = id;
    C.state.viewPolicyKey = option.kind === "RULE" || option.kind === "RECOVERY" ? "rule" : "mpc";
    FT.bus.emit("compareView", option);
    FT.bus.emit("compareChanged", C.state);
    return option;
  };

  C.deriveDelta = function (leftId, rightId) {
    const left = C.state.options[leftId], right = C.state.options[rightId];
    if (!left || !right) return null;
    if (!["READY", "INFEASIBLE"].includes(left.status) || !["READY", "INFEASIBLE"].includes(right.status)) return null;
    if (left.result.validTime !== right.result.validTime || left.result.gaugeId !== right.result.gaugeId) return null;
    return {
      leftId, rightId,
      peakDeltaM: right.result.peakM - left.result.peakM,
      bindingGaugeId: right.result.gaugeId,
      validTime: right.result.validTime,
    };
  };

  C.exportRecommendation = function (id) {
    const option = C.state.options[id];
    if (!option || option.status !== "READY" || !option.result.feasible || C.state.status === "STALE") {
      return { ok: false, reason: "option is not exportable" };
    }
    const artifact = {
      kind: "PROPOSAL", comparisonSessionId: C.state.sessionId, optionId: id,
      validTime: C.state.validTime, gaugeId: C.state.gaugeId, result: option.result,
    };
    return { ok: true, lifecycleClass: FT.lifecycle.classifyDecision(artifact), artifact };
  };

  C.markStale = function (reason) {
    C.state.status = "STALE";
    C.state.viewPolicyKey = null;
    C.state.staleReason = reason;
    FT.bus.emit("compareChanged", C.state);
  };

  C.reset = function () {
    C.state = freshState();
    FT.bus.emit("compareChanged", C.state);
    if (FT.world && FT.world.ready) FT.bus.emit("scrubbed");
  };

  C.viewKey = () => C.state.status === "COMPARING" ? C.state.viewPolicyKey : null;
})();
