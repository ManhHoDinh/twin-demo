/* FloodTwin — decision-lifecycle provenance.
   Data-SOURCE provenance (how a number was produced: MEASURED/FORECAST/MODELLED/…) lives in
   js/explainability.js and js/decision.js. This module is the ORTHOGONAL axis the platform
   is built to make unambiguous: at what stage of the chain does an artifact sit, and who is
   accountable for it —

     OBSERVED → FORECAST → SIMULATION → RECOMMENDATION → OPERATOR_DECISION → APPROVED_PLAN

   The load-bearing rule: a RECOMMENDATION (what the optimiser proposes) must never be
   presentable as an APPROVED_PLAN (what is in force and drives operations). Only an
   identified, entitled human decision moves an artifact across that boundary, and only
   APPROVED_PLAN is `actionable`. This is the assurance the whole product sells; encoding it
   here lets a gate prove it rather than trust it. Pure and stateless. */
(function () {
  "use strict";
  const FT = window.FT;
  const L = (vi, en) => (FT.state && FT.state.lang === "en" ? en : vi);

  const CLASS = Object.freeze({
    OBSERVED: "OBSERVED",
    FORECAST: "FORECAST",
    SIMULATION: "SIMULATION",
    RECOMMENDATION: "RECOMMENDATION",
    OPERATOR_DECISION: "OPERATOR_DECISION",
    APPROVED_PLAN: "APPROVED_PLAN",
  });

  /* label (VI/EN), badge token (CSS class suffix), and whether this class may drive
     operations. actionable is true for APPROVED_PLAN ONLY — a recommendation, a forecast or
     a simulation informs a decision but never executes one. */
  const META = {
    OBSERVED:          { badge: "obs",  actionable: false, vi: "Quan trắc",        en: "Observed" },
    FORECAST:          { badge: "fcst", actionable: false, vi: "Dự báo",           en: "Forecast" },
    SIMULATION:        { badge: "sim",  actionable: false, vi: "Mô phỏng",         en: "Simulation" },
    RECOMMENDATION:    { badge: "rec",  actionable: false, vi: "Đề xuất của AI",   en: "AI recommendation" },
    OPERATOR_DECISION: { badge: "dec",  actionable: false, vi: "Quyết định người trực", en: "Operator decision" },
    APPROVED_PLAN:     { badge: "plan", actionable: true,  vi: "Phương án đã duyệt", en: "Approved plan" },
  };

  const Lc = (FT.lifecycle = { CLASS, META });

  Lc.label = (cls) => (META[cls] ? L(META[cls].vi, META[cls].en) : cls);
  Lc.badge = (cls) => (META[cls] ? META[cls].badge : "unknown");
  Lc.isActionable = (cls) => !!(META[cls] && META[cls].actionable);
  Lc.isValid = (cls) => Object.prototype.hasOwnProperty.call(META, cls);

  /* Classify a decision artifact. A decision package is a RECOMMENDATION until an operator
     approves it; once the MPC policy is approved and in force it is an APPROVED_PLAN. The
     approval state is the single source of truth for "in force" (FT.state.mpcApproved),
     matching hydro._activeKey which only routes the mpc policy when approved. */
  Lc.classifyDecision = function (pkg) {
    if (!pkg) return null;
    // only a genuine proposal is a recommendation; refusals/degraded/null are not proposals
    if (pkg.kind !== "PROPOSAL" && pkg.kind !== undefined) {
      // non-proposal packages carry no operational recommendation
      if (pkg.kind === "REFUSAL" || pkg.kind === "DEGRADED" || pkg.kind === "SATURATED" || pkg.kind === "NULL") return null;
    }
    const inForce = FT.state && FT.state.policy === "mpc" && FT.state.mpcApproved === true;
    return inForce ? CLASS.APPROVED_PLAN : CLASS.RECOMMENDATION;
  };

  /* Classify a sealed decision record: an approved/rejected/superseded record is the human
     act itself — an OPERATOR_DECISION. (The PLAN it puts in force is classified separately
     via classifyDecision once mpcApproved is set.) */
  Lc.classifyRecord = function (rec) {
    if (!rec || !rec.outcome) return null;
    return CLASS.OPERATOR_DECISION;
  };

  /* The assurance sentence shown beside a recommendation so it can never read as in-force. */
  Lc.reviewNotice = function (cls) {
    if (cls === CLASS.RECOMMENDATION)
      return L("Đề xuất của AI - cần người trực có thẩm quyền phê duyệt, CHƯA có hiệu lực.",
               "AI recommendation - requires review by an entitled operator, NOT in force.");
    if (cls === CLASS.APPROVED_PLAN)
      return L("Phương án đã được phê duyệt và đang có hiệu lực.",
               "Approved by an operator and now in force.");
    return "";
  };
})();
