# UX principles — control-room design law

Written from the seat of someone deciding at 03:00, tired, with a phone ringing.

---

## 1. The five laws

1. **Five seconds to the situation, thirty seconds to the decision.** If the primary answer is not readable in five seconds, the layout is wrong. If a decision needs more than three interactions, the workflow is wrong.
2. **Nothing that matters is behind a click.** Deadline, escalation level, data health, mode, confidence, the counterfactual — all persistently visible. Hover-only information does not exist during an event.
3. **Density over beauty on the decision surface.** Operators read dense tables faster than they read cards. Whitespace is for marketing pages.
4. **Never move things.** Layout is fixed. An operator builds muscle memory for where the freeboard number lives; a responsive reflow at 03:00 costs seconds and confidence.
5. **The interface must be able to say "I don't know".** ([uncertainty](../04-decision-support/02-uncertainty-and-confidence.md))

---

## 2. Layout

| Rule | Reason |
|---|---|
| Fixed regions: chrome (top), primary decision (centre), context (rails), timeline (bottom) | Muscle memory |
| **No scrolling on S-01, S-05 or S-06** at the target resolution | Scrolling hides state |
| Target resolution: 1920×1080 primary; must remain usable at 1366×768 | Real control rooms |
| **Type scale by surface** — see the amendment below | Operators stand up and point |
| Modal dialogs forbidden during an event, except a decision confirmation | Modals block the situation |
| Multi-monitor: screens detachable into separate windows | Real control rooms use 2–4 displays |
| Print layout is a first-class output, not an afterthought | Signed paper is still the legal artefact |

---

### Amendment A1 — type scale by surface *(after the UI/UX audit, build v117)*

The original rule read *"readable from 2 m: minimum 14 px body, 24 px+ for primary values"*.
The automated audit measured **317 text nodes below 11 px** against it. Raising everything to
14 px would have destroyed the density this same document demands two rows above, so the
figure was wrong for this surface rather than the implementation being wrong.

The 14 px/24 px figure is right for a **wall or briefing display** viewed at 2 m. It is not
right for a **desktop operator console** viewed at 50–70 cm, where 11–12 px secondary
metadata is normal in control-room software. The standard is therefore split:

| Surface | Secondary metadata | Body | Primary decision values |
|---|---|---|---|
| **Desktop operator console** (this build) | ≥ 11 px | ≥ 12 px | ≥ 15 px |
| **Wall / briefing display** | ≥ 14 px | ≥ 16 px | ≥ 24 px |
| **Field / mobile** | ≥ 13 px | ≥ 15 px | ≥ 20 px |

**Nothing below 11 px anywhere**, on any surface. Enforced by `tests/ux-audit.mjs`.

This is recorded as an amendment rather than a quiet edit: the audit found the product in
breach of its own standard, and the resolution was to correct the standard *with a stated
reason*, not to lower the bar until the product passed.

### Accepted deviation D1 — the decision package sits inside a scrollable rail

§2 says the decision surfaces must not scroll. The right rail carries the gauge panel,
reservoir state, decision package, alarms, notifications and audit; at 1080 px it does
scroll, and the audit reports this every run as a `SHOULD` violation.

It is **not suppressed**, because the tension is real: resolving it properly means promoting
the decision package to its own screen (S-05) rather than a panel, which is an information-
architecture change, not a CSS change. Mitigation in the meantime: every *persistent* decision
signal — mode, escalation, data health, κ, P(exceed), decision deadline — lives in the global
chrome and is verified visible without scrolling on every audit run. Tracked as **R-28**.

---

## 3. The language of uncertainty

| Rule | Example |
|---|---|
| State the quantity, then its band, then its basis | "8.9 m (8.2–9.8), ensemble q50, issued 14:00" |
| Probability before adjective for technical users | "72 % chance of exceeding BĐ3" |
| Adjective before probability for the public | "Likely (about 7 in 10)" |
| Never a bare future-tense claim | not "the river will reach 9 m" |
| Say what would change the answer | "no action needed if rainfall is 30 % lower" |
| Name the missing input rather than hiding the gap | "antecedent soil moisture unavailable — confidence capped at MEDIUM" |

Forbidden words and their replacements are listed once in [glossary §7](../00-foundations/01-glossary.md#7-terms-the-product-must-never-use-loosely).

---

## 4. Alarm design

**Alarm fatigue is a design failure, not a user failure.** ([DT-8](../03-operations/02-decision-trees.md))

| Principle | Rule |
|---|---|
| **Actionability** | If the recipient cannot act on it, it is a status, not an alarm |
| **One alarm per condition** | Never one per model run, per threshold, per station |
| **Grouping** | Same root cause → one parent alarm with children |
| **Storm suppression** | ≥ 5 alarms in 5 min → one grouped escalation |
| **Individual acknowledgement** | With the acknowledger recorded |
| **No auto-clear** | An alarm clears when a human clears it, or when the condition ends *and* it is shown as ended |
| **Dam safety is exempt** ⚠ | Never grouped, never deduplicated into a summary, never auto-cleared |
| **Content** | What happened · what it means · what to do · by when · who else was told |
| **Rate target** | < 1 alarm per operator per 10 min in steady state; < 6 per 10 min at peak |

**Sound.** Distinct tones per severity; a dam-safety tone that is unique and cannot be muted below a floor volume. Muting is time-boxed, logged and visibly indicated.

---

## 5. Colour

**Colour is meaning, not decoration.**

| Colour | Reserved for |
|---|---|
| Red | BĐ3 / critical / emergency / infeasible |
| Orange | BĐ2 / serious / warning |
| Yellow | BĐ1 / watch |
| Green | Normal / constraint PASS |
| Blue | Water, forecast, informational |
| Purple | Replay mode |
| Amber frame | What-if mode |
| Red diagonal watermark | Training mode |
| Grey / dashed | Stale, missing, estimated, disabled |

**Rules.**
- **Never use colour alone.** Every colour-coded state also carries a shape, icon, label or pattern — ~8 % of men have a colour vision deficiency, and control rooms are not exempt.
- **5 discrete depth bands, never a continuous ramp** — the ramp implies precision the model does not have ([hydraulics §6](../00-foundations/03-hydraulics-and-routing.md)).
- Contrast ≥ 4.5:1 for text, ≥ 3:1 for graphical indicators.
- Dark theme is the default (night shifts); light theme must be equally complete for daylight field use and for printing.

---

## 6. Charts

| Rule | Reason |
|---|---|
| Fan charts show the band as the primary visual, the median as a line within it | The band is the information |
| **BĐ thresholds drawn as labelled horizontal lines**, always | The operator's reference frame |
| Now-marker on every time axis; it moves with the global scrub | Orientation |
| **Gaps are gaps.** Missing data is never interpolated across without a dotted line labelled *infilled* | Honesty |
| Reservoir level (m a.s.l.) and river stage (m above station zero) **never share an axis** | They are different scales ([glossary §1](../00-foundations/01-glossary.md)) |
| Observed and forecast are visually distinct, with the issue time labelled | Hindsight discipline |
| Historical peak markers ("2020 line") on every stage chart | Operators reason from remembered events |
| Y-axis never auto-scales during an event | A rescaling axis makes a rising flood look flat |

---

## 7. Numbers

| Rule | Example |
|---|---|
| Round to the resolution of the underlying model | `18 000–24 000`, not `21 437` |
| Errors round to the safe side | exposure up, available capacity down |
| Units always shown | `m³/s`, `m`, `Mm³` |
| Time always with a timezone and a date at day boundaries | `02:15 ICT 28/07` |
| Deltas alongside absolutes | `8.4 m (BĐ2 +0.4, ↑0.4 m/h)` |
| Vietnamese decimal comma in the VI locale | `8,4 m` |
| Large numbers grouped | `1 200 000` |

---

## 8. Interaction

| Rule | Reason |
|---|---|
| Keyboard shortcuts for every frequent action | Faster than a mouse under stress |
| **No drag-only interactions** | Impossible one-handed with a phone in the other |
| Global timeline scrub; all views follow | One mental model of time |
| Undo for everything except a sent notification | Sent is sent |
| **Destructive and irreversible actions confirm with a typed reason**, not a checkbox | The reason is needed anyway for the audit |
| Session never expires during an active event | Re-login at 03:00 is a safety hazard |
| Everything works at 200 % browser zoom | Older operators, poor lighting |

---

## 9. 3D — where it belongs

3D is genuinely valuable for **briefing, public communication, spatial comprehension and training**. It is not a decision surface.

| Use 3D for | Do not use 3D for |
|---|---|
| Explaining the situation to a committee | Reading a number |
| Public communication and media | Comparing two options |
| Training and orientation | Any timed decision |
| Showing depth relative to buildings | Precise measurement |

**Requirement:** every 3D view has a 2D equivalent carrying the same information, and the product remains fully usable with 3D disabled — for low-end hardware, for accessibility, and for the field.

*(The reference application's 3D work is strong and should be kept as the briefing and public-communication surface. The decision surfaces added in this specification are deliberately flat and dense.)*

---

## 10. Accessibility

- WCAG 2.1 AA minimum on the operator product; AA is the floor, not the goal.
- Full keyboard navigation.
- Screen-reader labels on every data value including its envelope.
- Colour never the sole channel.
- Text scalable to 200 % without loss of function.
- Public view: audio playback, large-type mode, unaccented Vietnamese fallback, low-bandwidth mode.
- Field view: high contrast for daylight, large touch targets for wet hands and gloves.

---

## 11. Localisation

Vietnamese is the primary language, not a translation. English is secondary. Operational terms stay in Vietnamese in both locales (`Báo động 3`, `xả lũ`) because those are the words used on the phone. Dates `DD/MM/YYYY`, 24-hour clock, ICT displayed / UTC stored.

---

## 12. Anti-patterns

| Anti-pattern | Why |
|---|---|
| Animated transitions on state change | Delays comprehension; a flood is not a slideshow |
| Auto-refresh that moves content under the cursor | Mis-clicks at the worst moment |
| Infinite scroll | State must be bounded and countable |
| Hamburger menus on the operator product | Hidden navigation costs seconds |
| Tooltips as the only source of critical information | Invisible on touch, invisible under stress |
| Notifications that disappear on a timer | Missed at 03:00 |
| "Are you sure?" without stating the consequence | Trains people to click through |
| Dashboards that look impressive and decide nothing | The most common failure in this category of product |

---

**Next:** [Non-functional requirements →](05-non-functional-requirements.md)
