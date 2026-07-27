# KPIs

Four tiers. The further down the list, the harder to measure and the more it actually matters.

---

## Tier 1 — Product usage (weekly)

| KPI | Target | Why |
|---|---|---|
| Daily active operators / licensed operators | > 80 % | A tool used only during floods is a tool nobody trusts during floods |
| Shift handovers generated and accepted | > 90 % of shifts | The everyday-value canary |
| Sessions during non-event days | > 5/week per site | Trust is built in calm |
| Screens per session at L0 | 3–6 | Higher suggests hunting for information |
| Field-mode sessions during events | > 60 % of deployed responders | Adoption where connectivity is worst |
| Training scenarios completed per operator per year | ≥ 4, covering ≥ 3 scenario classes | Competence manufacturing |

---

## Tier 2 — Decision quality and speed (per event)

**This tier is the product's thesis** ([strategy §1](01-product-strategy.md)).

| KPI | Baseline (typical) | Target | Note |
|---|---|---|---|
| **Time from trigger to decision** | 60–180 min | **< 20 min** | The compressible component |
| Time from decision to full dissemination | 30–90 min | < 15 min | |
| Time from decision to first acknowledgement | unmeasured | < 10 min | Usually unmeasured today — measuring it at all is progress |
| **Total decision-chain time** | 2–7 h | **< 1.5 h** | The headline number |
| Decisions with a reason of record | ~0 % | > 95 % | |
| Decisions with an attributed approver | partial | 100 % | |
| Proposals reviewed with the counterfactual open | n/a | > 90 % | |
| Constraint violations proposed and caught pre-approval | n/a | tracked, trending down | |
| Plan stability (cycles without a reversal) | n/a | > 70 % | Chattering destroys trust |
| **Honest-null rate** (recommendation to follow the rule curve) | n/a | non-zero, tracked | A product that never says "do nothing" is lying |
| Infeasibility reports issued | n/a | non-zero in severe events | Same logic |

---

## Tier 3 — Technical performance (continuous)

| KPI | Target |
|---|---|
| Availability during declared events | > 99.99 % |
| Operating level L0 uptime | > 95 % of flood season |
| Feed freshness compliance | > 98 % of signals within NFR-03 |
| Median observation→display latency | < 5 s |
| Proposal generation p95 | < 60 s |
| Alarm rate per operator per 10 min | < 1 steady, < 6 peak |
| Alarm acknowledgement rate | > 95 % |
| Notification delivery success | > 98 % per channel |
| **Notification acknowledgement rate** | > 90 % |
| Data-quality alarms resolved within a cycle | > 80 % |
| Audit completeness (decisions reconstructable) | 100 % |
| Event report auto-generated within 1 h of all-clear | 100 % |

---

## Tier 4 — Forecast and model skill (per season, published)

Published on S-16 whether flattering or not ([FR-27](03-prd.md)).

| KPI | Target |
|---|---|
| CRPS vs climatology, stratified by lead time | Improving season over season |
| Peak stage error, 6 h lead | < ±0.4 m (p50) |
| Peak stage error, 24 h lead | < ±1.0 m (p50) |
| Peak timing error, 6 h lead | < ±2 h |
| POD for BĐ3 crossings, 12 h lead | > 0.85 |
| **FAR for BĐ3 crossings, 12 h lead** | < 0.35 |
| Reliability diagram deviation | within the calibration envelope |
| Rank histogram flatness | near-flat (no systematic under-spread) |
| Inundation extent agreement vs high-water marks | > 75 % (critical success index) |
| Depth error at surveyed points | < ±0.4 m |
| Exposure estimate vs post-event assessment | within ±40 % |

**Rule:** a metric that has not been measured is reported as *not measured*, never as a target achieved.

---

## Tier 5 — Outcomes (per event and per season)

Hardest to attribute, and the reason the product exists. Report with explicit attribution caveats.

| KPI | Direction | Attribution honesty |
|---|---|---|
| Warning lead time delivered to affected communities | ↑ | Directly attributable — this is the product's mechanism |
| Population warned before hazard arrival (%) | ↑ | Directly attributable |
| Evacuations completed before route closure (%) | ↑ | Strongly attributable |
| **Isolated communities identified before isolation** | ↑ | Directly attributable |
| People trapped requiring rescue | ↓ | Partially attributable |
| Downstream peak reduction achieved vs counterfactual | ↑ | Attributable but **bounded by κ** — must be reported alongside κ |
| Reservoirs entering the season above the ceiling | ↓ | Directly attributable to compliance monitoring |
| Emergency (unplanned) releases | ↓ | Partially attributable |
| Time to publish the operation record after an event | ↓ | Directly attributable |
| Public trust / compliance on the subsequent event | ↑ | Survey-based, weakly attributable |
| **Deaths and injuries** | ↓ | **Not attributable to the product.** Report it, never claim it. |

> **The last row is a discipline, not modesty.** A vendor claiming lives saved from a decision-support tool cannot substantiate it, and the claim will be dismantled publicly the first time an event goes badly. Report the mechanism metrics — lead time, warning coverage, evacuation completion — and let others draw the outcome conclusion.

---

## Anti-KPIs — metrics that must never be optimised

| Metric | Why it is dangerous |
|---|---|
| Number of alerts sent | Rewards alarm fatigue |
| Number of recommendations accepted | Rewards a compliant operator, not a correct one; a rejected proposal may be the right outcome |
| Time on screen / engagement | This is not a consumer product |
| Forecast precision (narrower bands) | Rewards over-confidence; calibration is the goal, not sharpness |
| Zero false alarms | Achievable only by not warning |
| Percentage of proposals marked feasible | Rewards silent constraint relaxation — the exact failure the product exists to prevent |

---

## Reporting cadence

| Report | Frequency | Audience |
|---|---|---|
| Operations summary (Tiers 1, 3) | Weekly | Customer ops, vendor |
| Event report (Tiers 2, 5) | Within 24 h of all-clear | Customer, authority |
| Verification report (Tier 4) | Per event and per season | Customer, forecaster, public |
| Outcome review (Tier 5) | Per season | Customer executive, funders |
| **Public performance summary** | Per season | Public |

The last row is unusual and deliberate: publishing seasonal skill and false-alarm statistics is the mechanism by which public compliance is maintained ([uncertainty §6](../04-decision-support/02-uncertainty-and-confidence.md)).

---

**Next:** [Red-team review →](../06-critique/01-red-team-review.md)
