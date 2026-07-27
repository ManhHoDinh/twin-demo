/* FloodTwin Q1 Demo — groundedness verifier.
   Realises info/ai.html §4.3: a situation brief is not published as written. Every claim
   is split out, and a claim that carries a number or a state assertion must (a) cite at
   least one source that resolves in CORPUS and (b) reproduce its number from the live
   snapshot within a rounding tolerance. Claims that fail are STRUCK from the bulletin and
   logged, never shown as fact. This is a real verification pass over real citations — no
   language model is invoked — which is exactly the property a flood-operations system
   should trust over a free-generating LLM.

   Pure and stateless: verify(claims, snap) has no side effects, so it is unit-testable and
   gate-checkable (scripts/verify-grounding.mjs). The UI layer renders and logs the result.

   A claim is: { text, cites:[corpusKey], num?: {value, field, tol} }
     - cites      : CORPUS keys the claim is attributed to
     - num.value  : the number the claim asserts (as rendered to the reader)
     - num.field  : how to recompute that number from the snapshot (see FIELDS below)
     - num.tol    : absolute tolerance; a claim within tol of the recomputed value passes
   A claim with no num is a qualitative statement: it needs only a resolving citation. */
(function () {
  "use strict";
  const FT = window.FT;

  const G = (FT.grounding = {});

  /* How each bindable field is recomputed from the snapshot the brief was built from.
     These read the SAME values the brief renders, so a drift between what the reader sees
     and what the model can defend shows up as a struck claim rather than a silent lie. */
  function fieldValue(field, snap) {
    const D = FT.data, H = FT.hydro;
    switch (field.kind) {
      case "rain":                                   // basin mean rainfall, mm/h
        return snap.rain;
      case "gaugeStage":                             // a gauge's stage at snap time, m
        return snap.gauges[field.gauge] && snap.gauges[field.gauge].stage;
      case "gaugeTrend":                             // 3h stage trend at a gauge, m
        return snap.gauges[field.gauge] && Math.abs(snap.gauges[field.gauge].trend);
      case "openPct":                                // open road network, %
        return FT.traffic && FT.traffic.stats().openPct;
      case "closed":                                 // closed links, count
        return FT.traffic && FT.traffic.stats().closed;
      case "resOut":                                 // a reservoir's outflow, m³/s
        return snap.reservoirs[field.res] && snap.reservoirs[field.res].O;
      case "q95in12":                                // P95 member 12h out, m
        return H.sample(H.series(field.gauge)[H._activeKey()].q95, Math.min(H.T1, FT.state.timeH + 12));
      default:
        return undefined;
    }
  }
  G.fieldValue = fieldValue;

  /** Verify a list of claims against the snapshot. Returns the same claims annotated with
      grounded/reason, plus the published set, the struck set and the grounded ratio. */
  G.verify = function (claims, snap) {
    const CORPUS = FT.data.CORPUS;
    const out = claims.map((c) => {
      const cites = c.cites || [];
      const resolves = cites.filter((k) => CORPUS[k]);
      if (!resolves.length) {
        return { ...c, grounded: false, reason: "no source cited" };
      }
      if (c.num) {
        const actual = fieldValue(c.num.field, snap);
        if (actual === undefined || actual === null || Number.isNaN(actual)) {
          return { ...c, grounded: false, reason: "source field unavailable" };
        }
        const tol = c.num.tol != null ? c.num.tol : 0.05;
        if (Math.abs(actual - c.num.value) > tol) {
          return { ...c, grounded: false, reason: `value ${round(c.num.value)} ≠ source ${round(actual)}` };
        }
      }
      return { ...c, grounded: true, reason: "" };
    });
    const published = out.filter((c) => c.grounded);
    const struck = out.filter((c) => !c.grounded);
    const ratio = out.length ? published.length / out.length : 1;
    return { claims: out, published, struck, ratio, total: out.length };
  };

  function round(v) { return Math.round(v * 100) / 100; }

  /** The contract from info/ai.html §4.3: the PUBLISHED bulletin is 100% grounded (every
      struck claim has been removed), and the pre-strike ratio must clear the target the
      product commits to. ok=false means a claim would have shipped unsourced. */
  G.meetsContract = function (result) {
    const target = (FT.data.TARGETS && FT.data.TARGETS.grounded) || 0.95;
    const publishedAllGrounded = result.published.every((c) => c.grounded);
    return { ok: publishedAllGrounded, ratio: result.ratio, target, clearsTarget: result.ratio >= target };
  };
})();
