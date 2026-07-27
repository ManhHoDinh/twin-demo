# Decision rights, escalation and RACI

Who is allowed to decide what. The product must model this explicitly, because a recommendation delivered to someone without the authority to act on it is wasted lead time.

Legal basis in [regulatory framework](../00-foundations/08-regulatory-vietnam.md). Personas in [personas](01-personas.md).

> `⚠ The mapping below is a product *model* of authority. It must be configured per deployment against the customer's actual delegation instruments and the governing inter-reservoir procedure, and re-verified after any administrative reorganisation.`

---

## 1. Decision inventory

| ID | Decision | Typical authority | Time pressure |
|---|---|---|---|
| **D-01** | Change plant operating mode (normal → flood watch) | Plant manager | Hours |
| **D-02** | Routine release within the procedure's normal band | Plant / duty engineer | Hours |
| **D-03** | **Pre-flood drawdown (xả trước)** | Provincial/city authority per the inter-reservoir procedure, on the plant's proposal | **Hours — the binding one** |
| **D-04** | Increase spill above a notification threshold | Authority + mandatory downstream notification lead | Hours |
| **D-05** | Operate above the flood-season ceiling | Authority, with reason of record | Hours |
| **D-06** | **Emergency spill for dam safety** | Dam owner + dam safety authority; **overrides all downstream considerations** | Minutes |
| **D-07** | Activate EAP level 1 / 2 / 3 | Dam owner (L1), owner + authority (L2), authority (L3) | Minutes |
| **D-08** | Issue official forecast/warning bulletin | Hydro-meteorological service only | Scheduled + on change |
| **D-09** | Declare disaster risk level | Per Decision 18/2021/QĐ-TTg | Hours |
| **D-10** | **Order evacuation** | City/province or commune People's Committee & PCTT&TKCN | **Hours — the highest-consequence** |
| **D-11** | Close a road / bridge | Road authority + police | Minutes–hours |
| **D-12** | Deploy rescue teams / pre-position assets | Emergency commander | Hours |
| **D-13** | Open shelters | Commune authority | Hours |
| **D-14** | Release public information | Authorised bodies + media | Continuous |
| **D-15** | Suspend generation / notify dispatch | Plant + dispatch centre | Hours |
| **D-16** | Declare all-clear and begin recovery | Authority | Hours |

---

## 2. RACI

**R** responsible (does it) · **A** accountable (answers for it, exactly one) · **C** consulted · **I** informed

| Decision | Operator P-01 | Res. Engineer P-02 | Plant Mgr P-03 | Authority P-04 | Emerg. Cdr P-05 | Forecaster P-06 | Dam Safety P-07 | Dispatch P-08 | Public P-09 |
|---|---|---|---|---|---|---|---|---|---|
| D-01 mode change | R | C | **A** | I | I | C | I | I | – |
| D-02 routine release | R | R | **A** | I | – | I | I | I | – |
| D-03 **pre-release** | R | R | C | **A** | I | C | C | I | I |
| D-04 spill increase | R | R | C | **A** | I | I | C | I | **I (mandatory, in advance)** |
| D-05 above ceiling | R | R | C | **A** | I | I | **C** | I | I |
| D-06 **emergency spill** | R | C | R | I | I | I | **A** | I | **I (immediately)** |
| D-07 EAP activation | R | C | R | C/A(L3) | R | I | **A (L1–L2)** | I | I |
| D-08 official bulletin | – | I | I | I | I | **A/R** | I | I | I |
| D-09 risk level | – | C | C | **A** | C | C | I | – | I |
| D-10 **evacuation** | – | C | C | **A** | R | C | C | – | **I** |
| D-11 road closure | – | I | I | **A** | R | – | – | – | I |
| D-12 team deployment | – | – | I | C | **A/R** | – | – | – | – |
| D-13 shelters | – | – | – | **A** | R | – | – | – | I |
| D-14 public info | – | – | C | **A** | C | C | – | – | R (recipient) |
| D-15 dispatch notify | R | C | **A** | I | – | – | – | **C** | – |
| D-16 all-clear | – | C | C | **A** | C | C | C | I | I |

**Two rows to internalise:**
- **D-06** is the only row where dam safety is Accountable and everyone downstream is merely Informed. That inversion is the whole point of rank-1 priority.
- **D-10** is where the product's value is realised or lost. Everything upstream exists to give P-04 a defensible evacuation decision with enough time.

---

## 3. Escalation ladder

```
L0 NORMAL       Routine ops. Plant duty staff. Product in monitoring mode.
     │ trigger: forecast rain above threshold OR inflow rising OR official watch bulletin
     ▼
L1 WATCH        Plant manager informed. Verify ceiling compliance, gates, backup power.
                Product: pre-event checklist, readiness state.
     │ trigger: forecast P(BĐ2 at governing gauge) > 30 % within 48 h
     ▼
L2 ALERT        Authority informed. Duty engineer on shift. Draft proposal prepared.
                Product: decision package with deadline countdown.
     │ trigger: P(BĐ3) > 30 % within 24 h  OR  reservoir approaching ceiling
     ▼
L3 EMERGENCY    Committee convened. Pre-release/spill decisions active. Public notified.
                Product: full operational mode, notification workflow live.
     │ trigger: BĐ3 exceeded OR reservoir above FSL OR EAP L2
     ▼
L4 DISASTER     Evacuation, rescue. Higher command level assumes control.
                Product: field mode, isolation tracking, resource view.
     │ trigger: dam safety threatened OR breach imminent
     ▼
L5 DAM EMERGENCY  EAP L3. Breach inundation timings and evacuation are the ONLY outputs.
                  Optimiser disabled and visibly disabled.
```

**Product requirements from this ladder:**
1. The current level is displayed prominently, everywhere, with the trigger that set it.
2. Escalation is **automatic on the trigger**; de-escalation is **manual only**, and requires a reason of record. (Auto-de-escalation on a temporarily improving number has caused real harm.)
3. Each level has a defined notification set, pre-configured, so escalation *is* the notification.
4. The level determines which persona's view is the default landing screen.

---

## 4. Decision deadline arithmetic

The number the product exists to compute:

```
decision_deadline = hazard_arrival_time
                  − t_movement            (people reach safety)
                  − t_public_response     (hear → believe → begin)
                  − t_dissemination       (all channels reached)
                  − t_approval            (authority chain)
                  − t_notification_lead   (statutory minimum before release change)
```

All components are **configuration per deployment**, measured and updated from real exercises — not guessed once and forgotten.

> **Displayed as a countdown on the dashboard.** When the deadline passes, it does not disappear: it turns red and states which options are now foreclosed. Losing an option silently is worse than losing it loudly. See [S-01](../05-product/02-screen-catalog.md) and [FR-16](../05-product/03-prd.md).

---

## 5. Conflicts of interest — stated, not hidden

| Tension | Parties | Product's position |
|---|---|---|
| Generation revenue vs flood buffer | Plant owner vs downstream public | Rank order is fixed ([res-ops §1](../00-foundations/04-reservoir-operations.md)). Revenue is shown as *regret*, never as an optimisation objective above rank 4. |
| Dry-season supply vs flood drawdown | Đà Nẵng water supply vs flood safety | Both consequences shown. The trade is the authority's to make, explicitly and on the record. |
| Diversion benefits Thu Bồn, costs Vu Gia | Two downstream populations | **Both rivers always shown.** A single-river proposal is rejected by the engine. |
| Early warning vs false-alarm fatigue | Authority vs public | Asymmetric loss stated explicitly; false alarms explained publicly afterwards. |
| Local optimum vs cascade optimum | Individual plants vs basin | Cascade view is the default for any multi-reservoir proposal. |
| Speed vs due process | Emergency vs legality | Escalation ladder pre-authorises the fast path, with the record captured automatically. |

> **A product that pretends these conflicts do not exist will be discovered, once, publicly.** Naming them is what makes it credible to a government customer.

---

## 6. Reference implementation status

| Element | Status |
|---|---|
| Any model of authority, roles or users | ❌ |
| Escalation level display | ⚠ basin alert level exists (0–3 from BĐ), but it is a hazard level, not a command level |
| Decision deadline | ❌ **P0 gap** |
| Approval action with an identified approver | ⚠ an "approve MPC" interaction exists, anonymous and unrecorded |
| Notification set per level | ❌ |
| Conflict/regret presentation | ❌ |

---

**Next:** [Workflow catalog →](../03-operations/01-workflow-catalog.md)
