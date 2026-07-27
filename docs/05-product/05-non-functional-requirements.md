# Non-functional requirements

Backend implementation is out of scope; these are the properties the product must have regardless of how it is built.

---

## NFR-01 — Availability

| Requirement | Target |
|---|---|
| Operator product availability | 99.9 % annual; **99.99 % during declared flood season** |
| Planned maintenance | Forbidden during flood season and within 72 h of a forecast event |
| Single points of failure | None in the path from observation to operator display |
| Failover | Automatic, < 60 s, without loss of the audit record |
| **Degraded operation** | The product must remain useful at data level L2–L3 ([DT-7](../03-operations/02-decision-trees.md)) |

**The availability that matters is conditional:** 99.9 % annual availability is worthless if the 0.1 % coincides with the typhoon. Availability is measured *during events*, separately and publicly.

---

## NFR-02 — Latency

| Path | Target | Hard limit |
|---|---|---|
| Observation → operator display | < 5 s | 30 s |
| Screen interaction response | < 200 ms | 1 s |
| Map pan/zoom | 60 fps target | 30 fps floor |
| Timeline scrub | < 100 ms per frame | — |
| Proposal generation | < 60 s | 3 min |
| What-if run | < 10 s | 30 s |
| Inundation library lookup | < 500 ms | 2 s |
| Full ensemble forecast cycle | < 5 min | 15 min |
| Notification dispatch | < 30 s to first channel | 2 min |
| Report generation | < 10 s | 60 s |

---

## NFR-03 — Data freshness and cadence

| Signal | Ingest cadence | Max acceptable age in the decision loop |
|---|---|---|
| Reservoir level, gate position | 1–5 min | 15 min |
| River stage | 5–15 min | 30 min |
| Rainfall | 5–15 min | 30 min |
| Radar/satellite | 10–30 min | 60 min |
| NWP/ensemble | per model cycle | one cycle + 1 h |
| Official bulletin | per issue | one cycle |
| Dam instrumentation | 15–60 min | 3 h |

Exceeding these degrades the operating level and caps confidence ([uncertainty §2](../04-decision-support/02-uncertainty-and-confidence.md)).

---

## NFR-04 — Scalability

| Dimension | Target |
|---|---|
| Reservoirs per basin | 20 |
| Control points | 50 |
| Monitored zones | 200 |
| Sensors | 2 000 |
| Grid cells (flood model) | 10⁶ |
| Concurrent operator users | 200 |
| Concurrent public users | **1 000 000 burst** — public demand spikes precisely during the event |
| Basins per deployment | 10 |
| Audit retention | 10 years, queryable |

**The public tier must be architecturally isolated from the operator tier**, so that a public traffic surge cannot degrade operations. This is a hard separation, not a rate limit.

---

## NFR-05 — Offline and connectivity

- Field mode functions fully offline with the last synchronised state and a prominent data age.
- Operator product functions on the local network if the WAN is lost, using local data and cached forecasts, marked L3.
- **Air-gapped deployment mode** must be supported for state customers.
- Sync on reconnect preserves both local and server timestamps and never overwrites the audit record.
- Public view usable on 2G/edge connectivity with a text-only fallback.

---

## NFR-06 — Security

| Area | Requirement |
|---|---|
| Authentication | MFA for approval-capable roles; **no session expiry during an active event** |
| Authorisation | Role-based, enforced server-side, aligned to [decision rights](../02-stakeholders/02-decision-rights-raci.md) |
| **SCADA boundary** ⚠ | One-way data flow out of plant systems. **No control path in, ever.** Enforced at the network layer, not in application code |
| Sensitive data | Breach parameters, structural defects and gate logic are operator-only and never present in the public build's data at all — not merely hidden in the UI |
| Personal data | Assisted-evacuation registers access-logged and minimally retained ([regulatory §7](../00-foundations/08-regulatory-vietnam.md)) |
| Audit integrity | Append-only with tamper evidence; verifiable independently |
| Transport | TLS everywhere; certificate pinning on field clients |
| Supply chain | Dependencies pinned and reviewed; no runtime code loaded from third-party CDNs in the operational build |
| Incident response | Defined, exercised, with a named contact |

> The last supply-chain row is a change from the reference application, which loads its 3D library from a public CDN. Acceptable for a demo, unacceptable for an operational deployment.

---

## NFR-07 — Data quality and integrity

- Every input passes the QC pipeline before entering the decision loop ([observation model §3](../01-domain-model/03-observation-model.md)).
- Raw values are never overwritten; QC is additive.
- Plausibility bounds are configuration ([typical values §9](../00-foundations/09-typical-values.md)).
- Silent substitution of defaults is forbidden and is detectable in review.
- Late-arriving data triggers re-evaluation with both the original and revised pictures preserved.

---

## NFR-08 — Graceful degradation

The product must have **declared, visible operating levels** L0–L4 and must behave correctly at each, including **refusing to advise at L4**. Degradation is tested as a first-class scenario class, not discovered in production.

---

## NFR-09 — Reproducibility

- Same inputs + same versions → bit-identical outputs.
- Random seeds stored with every run.
- Model, parameter, threshold and rulebook versions attached to every result.
- Input snapshots referenced by hash, never re-queried.
- Any past result is reproducible for the full audit retention period.

---

## NFR-10 — Auditability

Per [FR-04](03-prd.md) and [regulatory §6](../00-foundations/08-regulatory-vietnam.md#6-liability-evidence-and-the-audit-trail): append-only, tamper-evident, exact screen replay, complete notification records, inquiry export, and retention meeting the statutory period.

---

## NFR-11 — Maintainability and configurability

- **No operational constant in code.** Thresholds, curves, weights, boundaries and contacts are dated, owned, versioned configuration ([FR-35](03-prd.md)).
- Adding a reservoir, gauge, zone or shelter is configuration, not a release.
- Adding a basin requires configuration and calibration, not a fork.
- Every configuration change is a recorded decision with an approver.

---

## NFR-12 — Testing and verification

| Layer | Requirement |
|---|---|
| Physical invariants | Mass balance closure, monotonic Z–V, level-band ordering, non-negative discharge — asserted continuously, in production |
| Constraint engine | Property tests: no proposal may violate a hard constraint; infeasibility is reported, never relaxed |
| Regression | Every historical event replays to within a stated tolerance after any change |
| **Self-test at start-up** | Core hydrological assertions run at every launch, with a visible pass/fail indicator |
| Degradation | Each operating level L0–L4 is an automated test scenario |
| Notification | End-to-end tests on the sandbox transport, including acknowledgement escalation |
| Accessibility | Automated WCAG checks plus manual keyboard and screen-reader passes |
| Load | Public tier at 1 M concurrent; operator tier under a full-basin alarm storm |

> The reference application already runs a start-up self-test with a visible footer indicator and a console assertion set. **That pattern is correct and should be extended, not replaced.**

---

## NFR-13 — Deployment and operations

- On-premise, in-country cloud, and air-gapped modes.
- Blue/green deployment with instant rollback; **no deployment during flood season without an exception approval**.
- Configuration and data migration are versioned and reversible.
- Monitoring covers data freshness, computation latency, alarm rates, notification success and audit-write success — with alerting to the vendor, not only the customer.
- Documented runbooks for every degraded mode.

---

## NFR-14 — Compliance and localisation

- Data residency per customer requirement.
- Vietnamese primary UI, complete and idiomatic, not machine-translated.
- Records retained per statutory requirements.
- Map data attribution honoured in every view, export and print.
- Third-party licensing respected and documented.

---

## NFR-15 — Performance on real hardware

| Environment | Requirement |
|---|---|
| Control-room workstation | Full product, 3D enabled, 60 fps |
| Office laptop, integrated graphics | Full product, 3D at ≥ 30 fps or gracefully disabled |
| **Any machine with 3D disabled** | **100 % of decision-critical functionality remains available** |
| Field tablet/phone | S-14 fully functional offline |
| Public device (low-end Android, 2G) | S-15 functional, text fallback |

---

## Acceptance summary

A release is acceptable when: all P0 requirements pass; the self-test passes; every historical event replays within tolerance; each degradation level behaves as specified; no hard constraint can be violated by any proposal in property testing; and the audit trail reconstructs a full simulated event end to end.

---

**Next:** [KPIs →](06-kpis.md)
