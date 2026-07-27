# Roadmap — maturity ladder

Five milestones, each with an **exit gate** that must be passed before the next begins. Gates are pass/fail and evidence-based; a gate that can be argued past is not a gate.

---

## M0 — Credible demonstrator *(current)*

**Purpose.** Prove the concept is comprehensible and the basin is representable. Win the meeting, not the contract.

**State.** Real terrain, imagery, road and building data for the VGTB basin; synthetic hydrology with two operating policies; 2D/3D visualisation to street level; 12 monitored zones; traffic and closure modelling; timeline with scenarios; start-up self-test.

**Work remaining in M0** — the honesty layer, which is cheap and changes what the product *is*:

| Item | Requirement |
|---|---|
| Quantity envelope on every displayed number | FR-01 |
| Data health panel and operating levels L0–L4 | FR-02 |
| Structural mode marking (frame + export watermark) | FR-03 |
| Decision package with constraint list, counterfactual, alternatives, regret | FR-10, FR-12, FR-13 |
| Decision deadline countdown | FR-16 |
| Freeboard, dZ/dt, time-to-threshold | FR-17 |
| Local audit trail with attributed approval and reason of record | FR-04, FR-05 |
| Controllability κ (estimated, caveated) | FR-14 |
| Time-to-full and buffer-exhaustion announcement | FR-42 |

**Exit gate M0 → M1**
1. Every displayed quantity carries provenance, age and quality. Zero un-enveloped numbers.
2. Every export and print carries the mode watermark and the non-operational marker.
3. A decision can be approved, attributed, reasoned and replayed from the local audit log.
4. The product refuses to produce a proposal at simulated level L4.
5. The start-up self-test passes, and the three reference scenarios replay deterministically.
6. A domain reviewer (hydropower engineer, not a colleague) confirms nothing on screen overstates what is known.

---

## M1 — Shadow mode

**Purpose.** Earn the right to be in the loop. **Non-skippable.**

The product runs on **real feeds** for a full flood season, producing recommendations that **nobody acts on**, while verification accumulates.

**Work.**
- Real telemetry integration: reservoir levels, gate positions, river stages, rain gauges — with the full QC pipeline.
- Real forecast ingestion: official bulletins, NWP/ensemble, satellite QPE; bias correction.
- Sub-catchment decomposition and antecedent wetness state (R-02, R-03).
- Rating curves as versioned entities (R-07).
- Calibration against ≥ 3 historical events; hindcast validation.
- Verification screen S-16 with real statistics.
- Full audit trail infrastructure.

**Exit gate M1 → M2**
1. One complete flood season in shadow with continuous operation ≥ 95 % at L0/L1.
2. Verification published: peak stage error, timing error, POD/FAR, CRPS, reliability — **stratified by lead time**, and inside the [typical values §8](../00-foundations/09-typical-values.md) envelope.
3. ≥ 3 historical events replay within the stated tolerance.
4. Inflow cross-check divergence < 25 % in ≥ 90 % of cycles.
5. At least one event in which the product correctly issued the **honest-null** or an **infeasibility** report.
6. The customer's own engineers state, in writing, that the recommendations were reasonable.
7. Degradation levels L0–L4 exercised in production, not only in test.

> **Gate 5 is the one that matters.** A season in which the product always had a confident answer proves it is broken, not good.

---

## M2 — Advisory operation

**Purpose.** In the workflow. Humans decide, with the product's package in front of them.

**Work.**
- Notification workflow with acknowledgement (FR-20) — the largest single build.
- Impact-based warning; shelter register and validation; time-aware routes; isolation detection (FR-21–24).
- Authority view S-02; field mode S-14; alerts S-10; reports S-11.
- EAP as structured data (FR-31).
- Training mode with debrief (FR-30); operator certification.
- Role-based access, identity, decision rights (FR-05).
- Post-event review automation (FR-33).

**Exit gate M2 → M3**
1. ≥ 10 real decisions taken with the product's package, each attributed and reasoned.
2. Median trigger-to-decision time < 30 min, measured.
3. Notification acknowledgement rate > 90 % in a real event.
4. One full post-event review auto-generated within 1 h of all-clear and accepted by the authority.
5. All operators certified on ≥ 3 scenario classes including a failure-injection scenario.
6. Zero incidents in which the product produced a proposal violating a hard constraint.
7. Security review passed, including the one-way SCADA boundary.

---

## M3 — Operational system of record

**Purpose.** The audit trail is relied upon. The product is inside the institution.

**Work.**
- Full cascade coordination and joint optimisation (FR-34).
- Inundation and breach libraries (FR-32).
- Velocity and hazard rating (FR-19); gate-realisable releases (FR-15).
- Public view (FR-26) with the false-alarm explanation workflow.
- Environmental and generation-impact outputs (DS-12, DS-14).
- Configuration governance with effective dates and approvals (FR-35).
- Air-gap-capable deployment; offline tile packs; self-hosted dependencies.

**Exit gate M3 → M4**
1. Used as the record of decision in a formal post-event review by the authority.
2. Two consecutive seasons of published verification.
3. Availability > 99.99 % measured **during declared events**.
4. Public view live, with at least one published false-alarm explanation.
5. Independent audit of the audit trail's tamper-evidence.
6. Full basin configuration change (add a reservoir/gauge/zone) performed without a code release.

---

## M4 — Multi-basin standard

**Purpose.** Second and third basins; cross-agency oversight; the national tier.

**Work.** Basin templating and calibration tooling; cross-basin aggregation and oversight views; standard reporting to national agencies; a partner/integrator delivery model; open verification publication.

**Exit gate.** Three basins live, each meeting M3 gates, with a shared configuration and calibration toolchain and no basin-specific code forks.

---

## Sequencing principles

1. **Honesty before capability.** The envelope, data health, mode marking and audit precede every analytical feature. A sophisticated model that cannot say where its numbers came from is a liability.
2. **Shadow mode is not optional.** The only credible answer to *"would it have been right last October?"* is a season of published verification.
3. **Notification before optimisation.** A perfect release plan that nobody is told about changes nothing; an adequate plan that reaches every commune saves people.
4. **Everyday value before crisis value.** Handover, compliance monitoring and data health build the trust that gets the product used at 03:00.
5. **Training is a delivery mechanism, not a feature.** It is often the first purchase and the safest way to build trust.
6. **Say no to features that outrun the data.** Do not build the cascade optimiser before the inflow estimates are trustworthy.

---

## What would make us stop

Stated in advance, so the decision is not made under commercial pressure:

| Condition | Action |
|---|---|
| Verification shows no skill beyond the rule curve after a full shadow season | Stop advisory development; reposition as monitoring, audit and training only |
| The customer cannot supply data of sufficient quality to leave L2 | Do not proceed to M2; deliver the training and audit product instead |
| A recommendation contributes to harm | Full stop; independent review before any further deployment |
| The institutional chain will not attribute decisions to named humans | Do not deploy; the product's core premise is unsatisfiable |

---

**Next:** [Demo gap analysis →](../99-appendix/demo-gap-analysis.md)
