# Regulatory and institutional framework (Việt Nam)

The product operates inside a legal system that already assigns every decision to a named office. Ignoring that is the fastest way to build something nobody is allowed to use.

> **Citation discipline.** Instruments below are cited by number and year. Items marked `⚠ VERIFY` must be checked against the primary text before appearing in any customer-facing document, proposal or contract. **No article number is to be quoted externally from this file without that check.**

---

## 1. Instruments that govern this product

| Instrument | Subject | Relevance |
|---|---|---|
| **Luật Phòng, chống thiên tai** 33/2013/QH13, amended by 60/2020/QH14 | Disaster prevention & control | Defines the PCTT&TKCN command committees at each level, responsibilities, and the disaster-response system the product plugs into |
| **Luật Thủy lợi** 08/2017/QH14 | Irrigation/hydraulic works | Safety and operation duties for hydraulic structures |
| **Luật Tài nguyên nước** 28/2023/QH15 (replacing 17/2012/QH13) | Water resources | River-basin planning, water allocation, inter-basin transfer `⚠ VERIFY effective-date details` |
| **Nghị định 114/2018/NĐ-CP** | Dam and reservoir safety management | Registration, safety inspection, **emergency action plans**, inundation mapping duties for dam owners |
| **Nghị định 66/2021/NĐ-CP** | Detailing the Disaster Law | Response organisation, resources `⚠ VERIFY` |
| **Quyết định 05/2020/QĐ-TTg** | Water levels corresponding to flood alert levels (BĐ1/BĐ2/BĐ3) nationwide | **The source of the BĐ thresholds hard-coded in the product** |
| **Quyết định 18/2021/QĐ-TTg** | Forecasting, warning, transmission of disaster information; **disaster risk levels** | Defines who may issue official forecasts/warnings and the risk-level scale |
| **Quyết định 1865/QĐ-TTg** (2019) | **Quy trình vận hành liên hồ chứa lưu vực sông Vu Gia – Thu Bồn** | The binding cascade operating procedure for the reference basin `⚠ VERIFY article numbers` |
| **Quyết định 740/QĐ-TTg** | Cited by the reference demo as a related operating instrument | `⚠ VERIFY — not independently confirmed; do not cite externally until checked` |

---

## 2. The alert-level system (BĐ) — and its limits

**Báo động 1 / 2 / 3** are statutory *stage* thresholds defined **per gauging station**, set by Decision 05/2020/QĐ-TTg.

| Level | Meaning in practice |
|---|---|
| **BĐ1** | Water rising into the low floodplain. Monitor; prepare. |
| **BĐ2** | Significant flooding of low-lying areas. Protective measures; move goods and vulnerable people. |
| **BĐ3** | Serious flooding. Full response; evacuation of at-risk areas. |
| **Above BĐ3 by X m** | The standard escalation phrasing — there is no BĐ4. Severity above BĐ3 is expressed as metres above BĐ3. |

**Reference values used by the product** (from `js/data.js`, per Decision 05/2020/QĐ-TTg):

| Station | River | BĐ1 | BĐ2 | BĐ3 |
|---|---|---|---|---|
| Ái Nghĩa | Vu Gia | 6.5 | 8.0 | 9.0 |
| Giao Thủy | Thu Bồn | 6.2 | 7.7 | 8.8 |
| Câu Lâu | Thu Bồn | 2.0 | 3.0 | 4.0 |
| Cẩm Lệ | Sông Hàn | 1.0 | 1.7 | 2.5 |

*(metres above station datum — see [glossary §1](01-glossary.md#1-units-and-conventions); these values are **not** comparable between stations)*

**Three limits the product must handle explicitly:**

1. **BĐ is a stage threshold, not an impact threshold.** The same stage produces different harm depending on the state of dykes, tide, and where people happen to be. Impact-based warning (see [warning §4](07-warning-and-emergency-management.md)) supplements BĐ; it does not replace it. **The product must display BĐ because it is the legal language, and display impact because it is the useful language. Both, always, side by side.**
2. **Thresholds change** when the decision is amended or a station is relocated. They must be **configuration data with an effective date and a source reference**, never constants in code. `⚠ Current implementation hard-codes them in js/data.js — tracked change.`
3. **A gauge can be destroyed or go silent** exactly at BĐ3. Losing the gauge must not be rendered as "level stopped rising".

---

## 3. Disaster risk levels (cấp độ rủi ro thiên tai)

Decision 18/2021/QĐ-TTg defines risk levels **1 to 5**. The level determines **which authority takes command** — commune, province, ministry, or national. That mapping is precisely why a decision-support product must model authority, not just hydrology: the same forecast triggers different chains at different levels.

**Product requirement:** the risk level is a displayed, derived field with the derivation shown, and the currently responsible command level is named on the dashboard. See [decision rights](../02-stakeholders/02-decision-rights-raci.md).

---

## 4. Who is allowed to do what

| Function | Holder | Product's role |
|---|---|---|
| Issue **official** hydro-meteorological forecasts and warnings | The national hydro-meteorological service system (Tổng cục/Trung tâm KTTV and its regional stations) | The product **consumes** the official bulletin and displays it as authoritative; its own computations are labelled *internal decision support*, never "the forecast" |
| Order reservoir operation in a flood | Per the inter-reservoir procedure: the designated chairperson (provincial People's Committee level) and, within limits, the reservoir owner | The product **proposes**; the order is recorded with the human authoriser's identity |
| Operate the gates | The dam owner / plant operator | The product never actuates |
| Declare evacuation | Provincial / commune People's Committee and the PCTT&TKCN committee | The product prepares the decision package |
| Publish public warnings | Authorised state bodies and mass media | The product generates drafts for approval, and never auto-publishes |
| Dam safety decisions | Dam owner + dam safety authority | The product's safety monitor is advisory and has veto over *its own* proposals only |

> **The three sentences that must appear in the product UI and in every export:**
> 1. This system is decision support. It does not issue official forecasts or warnings.
> 2. Official forecasts and warnings are issued by the competent state bodies.
> 3. Reservoir operation follows the approved inter-reservoir operating procedure; this system does not replace it.

---

## 5. Administrative reform 2025 — a live product risk

From **1 July 2025**, Việt Nam implemented a major administrative reorganisation: provincial mergers and a move to a **two-tier local government** (province/city → commune-level), with the **district level abolished**. Under this reform **Quảng Nam province was merged into Đà Nẵng city**, and district-level units in the reference basin were reorganised into commune-level units directly under the city. `⚠ VERIFY the current authoritative list of commune-level units and their boundaries before any deployment.`

**Why this is a first-order product concern, not trivia:**

| Consequence | Product implication |
|---|---|
| The **command chain changed**. Decisions that went province → district → commune now go city → commune. | The RACI and escalation ladder must be configurable and dated, not hard-coded. |
| **Administrative boundaries and names changed.** | Every gazetteer, zone, population figure and contact record keyed to old district names is stale. |
| **Population and exposure statistics** are published against the new units. | The exposure model must record which administrative vintage a figure belongs to. |
| The reference demo's gazetteer contains **14 district entries** and district-keyed zones. | These are pre-reform labels. They remain useful as *place names* but are no longer *administrative units*. **Tracked change: label them as places, and add a separate, versioned administrative layer.** |

> **General rule extracted:** administrative geography is *data with a validity period*, exactly like a rating curve. Any product that bakes it into code will be wrong within a political cycle.

---

## 6. Liability, evidence and the audit trail

After a damaging flood there will be an inquiry. It will ask, in this order:
1. What was known, and when?
2. What was decided, by whom, and on what basis?
3. Was the operating procedure followed?
4. Were downstream people notified, when, and through which channels?

**A decision-support product that cannot answer all four in minutes is a liability to its customer.** One that can is the customer's best defence. This is the strongest commercial argument in the entire product and it is an *audit* argument, not an *AI* argument.

**Mandatory audit properties** (see [NFR-10](../05-product/05-non-functional-requirements.md)):
- Append-only, tamper-evident decision log.
- Every record: timestamp (UTC + ICT), actor identity, inputs **as they were at that moment** (data snapshot hash, not a re-query), the proposal shown, the choice made, the stated reason, the constraint check result, the notifications sent and their receipts.
- Full replay: reconstruct exactly what the screen showed at any past instant.
- Model, parameter, threshold and rulebook **versions** attached to each record.
- Retention aligned to statutory record-keeping (multi-year).

> **"What did the screen say at 02:14?" must be answerable exactly, forever.** Design consequence: never mutate history; snapshot inputs by reference-with-hash; version everything.

---

## 7. Data governance

| Topic | Position |
|---|---|
| **Personal data** | Population is modelled in aggregate. Individual-level data (assisted-evacuation lists) is restricted, access-logged, and retained only as long as legally required. |
| **Data sovereignty** | Operational deployments for state customers should assume on-premise or in-country hosting. Design for an air-gapped-capable deployment mode. |
| **Sensitive infrastructure** | Dam structural details, breach maps and gate logic are security-sensitive. Public-facing views must not expose them. **Role-based separation of the public product from the operator product is a security requirement, not a UX preference.** |
| **Third-party map/imagery licensing** | Basemap, imagery and OSM attribution obligations must be honoured in every export and print. (The reference demo already does this in the footer — keep it.) |
| **Official bulletins** | Redistribution rules of the national service must be respected; attribute and link, never re-badge. |

---

## 8. Reference implementation status

| Element | Status | Gap |
|---|---|---|
| BĐ1/2/3 per station from Decision 05/2020 | ✅ in `js/data.js` | Hard-coded constants; no effective date, no source field |
| Inter-reservoir procedure referenced | ✅ footer + methods modal | Constraints not machine-encoded |
| "Not for real operations" disclaimer | ✅ footer + modal | Should also appear on every export/print |
| Disaster risk level (1–5) | ❌ | Missing |
| Named responsible command level | ❌ | Missing |
| Audit trail | ❌ | **Missing entirely — highest-value institutional feature** |
| Administrative layer with validity period | ❌ | Gazetteer uses pre-2025-reform districts |
| Role-based access (operator vs public) | ❌ | Single view for everyone |

---

**Next:** [Typical values →](09-typical-values.md)
