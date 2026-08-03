/* FloodTwin — decision rights (docs/02-stakeholders/02-decision-rights-raci.md · FR-05)

   The product already refused ANONYMOUS decisions. It still accepted decisions from the
   WRONG PERSON: any identified user could approve a pre-release, when D-03 is accountable
   to the city/province PCTT&TKCN committee and a reservoir engineer may only propose it.
   Encoding the RACI table is what turns "who is logged in" into "who may decide", which is
   the difference between an attributed log and a defensible one.

   Two rules carried straight from the doc:
     · exactly one role is ACCOUNTABLE for each decision — accountability is never shared;
     · dam safety (D-06/D-07) is accountable to the dam safety engineer and every downstream
       party is merely informed. That inversion is the whole point of rank-1 priority, so it
       is encoded rather than left to convention. */
(function () {
  "use strict";
  const FT = window.FT;
  const vi = () => FT.state.lang === "vi";
  const L = (v, e) => (vi() ? v : e);

  const R = (FT.roles = {});

  /* ---------- decisions, from the RACI table ---------- */
  const DECISIONS = {
    "D-01": { vi: "Đổi chế độ vận hành", en: "Operating mode change", a: "plantManager", r: ["operator"] },
    "D-02": { vi: "Xả thường lệ", en: "Routine release", a: "plantManager", r: ["operator", "resEngineer"] },
    "D-03": { vi: "Xả trước (đón lũ)", en: "Pre-flood drawdown", a: "authority", r: ["operator", "resEngineer"], c: ["plantManager", "damSafety"] },
    "D-04": { vi: "Tăng lưu lượng xả", en: "Spill increase", a: "authority", r: ["operator", "resEngineer"], c: ["plantManager", "damSafety"] },
    "D-05": { vi: "Vận hành trên trần đón lũ", en: "Operate above the flood ceiling", a: "authority", r: ["operator", "resEngineer"], c: ["damSafety"] },
    "D-06": { vi: "Xả khẩn cấp (an toàn đập)", en: "Emergency spill (dam safety)", a: "damSafety", r: ["operator", "plantManager"] },
    "D-07": { vi: "Kích hoạt phương án khẩn cấp", en: "EAP activation", a: "damSafety", r: ["operator", "plantManager"] },
    "D-10": { vi: "Lệnh sơ tán", en: "Evacuation order", a: "authority", r: ["commander"] },
    "D-11": { vi: "Đóng đường", en: "Road closure", a: "authority", r: ["commander"] },
    "D-14": { vi: "Phát thông tin ra công chúng", en: "Public information release", a: "authority", r: [] },
    "D-15": { vi: "Thông báo điều độ điện", en: "Notify the dispatch centre", a: "plantManager", r: ["operator"] },
    "D-16": { vi: "Công bố kết thúc", en: "All-clear", a: "authority", r: [] },
  };
  R.DECISIONS = DECISIONS;

  /* ---------- roles, matched to the personas in the duty selector ---------- */
  const ROLES = {
    operator: { id: "operator", persona: "P-01", vi: "Trưởng ca vận hành", en: "Shift supervisor" },
    resEngineer: { id: "resEngineer", persona: "P-02", vi: "Kỹ sư vận hành hồ", en: "Reservoir engineer" },
    plantManager: { id: "plantManager", persona: "P-03", vi: "Giám đốc nhà máy", en: "Plant manager" },
    authority: { id: "authority", persona: "P-04", vi: "Ban Chỉ huy PCTT&TKCN", en: "PCTT&TKCN committee" },
    damSafety: { id: "damSafety", persona: "P-07", vi: "Kỹ sư an toàn đập", en: "Dam safety engineer" },
    commander: { id: "commander", persona: "P-05", vi: "Chỉ huy ứng phó", en: "Emergency commander" },
  };
  R.ROLES = ROLES;

  /* the duty selector stores "Name|Role label"; map the label onto a role id */
  const LABEL_TO_ROLE = {
    "Kỹ sư vận hành hồ": "resEngineer",
    "Trưởng ca vận hành": "operator",
    "Giám đốc nhà máy": "plantManager",
    "Ban Chỉ huy PCTT&TKCN": "authority",
    "Kỹ sư an toàn đập": "damSafety",
    "Chỉ huy ứng phó": "commander",
  };
  R.roleIdOf = (label) => LABEL_TO_ROLE[label] || null;
  R.current = () => {
    const a = FT.ops && FT.ops.audit.actor;
    return a && a.role ? R.roleIdOf(a.role) : null;
  };

  /* ---------- the question the product must be able to answer ---------- */
  /** May the signed-on role decide `id`? Accountable decides; responsible only executes. */
  R.can = function (id, roleId) {
    const role = roleId || R.current();
    const d = DECISIONS[id];
    if (!d || !role) return false;
    return d.a === role;
  };
  /** May the role prepare/propose it (responsible or accountable)? */
  R.canPropose = function (id, roleId) {
    const role = roleId || R.current();
    const d = DECISIONS[id];
    if (!d || !role) return false;
    return d.a === role || (d.r || []).includes(role);
  };
  /** Who IS accountable — so a refusal can name the right person instead of just saying no. */
  R.accountable = function (id) {
    const d = DECISIONS[id];
    if (!d) return null;
    const r = ROLES[d.a];
    return r ? (vi() ? r.vi : r.en) : d.a;
  };
  R.consulted = function (id) {
    const d = DECISIONS[id];
    return (d && d.c ? d.c : []).map((k) => (vi() ? ROLES[k].vi : ROLES[k].en));
  };

  /** Which decision does the current proposal actually represent?
      A pre-release is D-03; once the reservoir is above its ceiling the same action is
      D-05; a dam-safety-driven release is D-06 and leaves the authority's hands entirely. */
  R.decisionForProposal = function (pkg, snap) {
    if (!pkg || pkg.kind === "REFUSAL" || pkg.kind === "NONE") return null;
    const r = pkg.reservoir;
    if (!r) return "D-03";
    const rs = snap && snap.reservoirs ? snap.reservoirs[r.id] : null;
    if (rs && r.zDesign != null && rs.Z > r.zDesign) return "D-06";
    if (rs && rs.Z > r.fsl) return "D-06";
    if (rs && rs.overCeil) return "D-05";
    return "D-03";
  };

  /** Human-readable refusal text that names who may decide, and what this role MAY do. */
  R.refusal = function (id) {
    const d = DECISIONS[id];
    const who = R.accountable(id);
    const role = R.current();
    const roleName = role ? (vi() ? ROLES[role].vi : ROLES[role].en) : L("chưa định danh", "unidentified");
    const mayPropose = R.canPropose(id, role);
    return L(
      `${id} - ${d ? d.vi : ""}: thẩm quyền quyết định thuộc **${who}**. Vai trò hiện tại (${roleName}) ` +
        (mayPropose ? "được ĐỀ XUẤT và thực hiện, không được phê duyệt." : "không có vai trò trong quyết định này."),
      `${id} - ${d ? d.en : ""}: this decision is accountable to **${who}**. The current role (${roleName}) ` +
        (mayPropose ? "may PROPOSE and execute it, but not approve it." : "has no role in this decision.")
    );
  };
})();
