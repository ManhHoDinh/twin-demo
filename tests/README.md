# End-to-end suite

```bash
npm run e2e          # behaviour suite  — 75 checks
npm run ux           # UI/UX conformance — 37 checks against the project's own UX standard
npm run ux:strict    # SHOULD violations also fail the run
npm run e2e:quick    # skips the cross-cutting and scenario-matrix sweeps
npm run test:role-workspaces  # City/Plant role workspace release gate
npm run serve        # just serve the app on :4310
```

No install is required: `browser.mjs` resolves Playwright from a sibling project
(`SkyLabs_SURF2026`, `FloodTwin_SafeMove_Demo`) when this project has no `node_modules`.
Run `npm install` if you prefer a local copy.

Failures write evidence to `tests/artifacts/`: a PNG of the screen plus the `FT` state that
produced it, and `report.json` for diffing runs.

---

## What it tests, and why it is organised this way

Tests are grouped by **operational workflow**, not by screen. A screen that renders proves
nothing. The question each group asks is whether a duty operator can get from *"something is
happening"* to *"the right people have been told, and it is on the record"*.

| Group | Checks | What it protects |
|---|---|---|
| WF-01 Boot & honesty | 6 | Clean boot, in-app self-test passes, **synthetic marker permanently visible**, global chrome present |
| WF-03 Decision package | 6 | Constraints, counterfactual, alternatives, regret, deadline; infeasibility named; honest-null; saturation declared |
| WF-07 Approval gate | 4 | No anonymous decisions, no unreasoned decisions, append-only audit |
| DT-7 Degradation | 6 | L0–L4 behaviour; **L4 refuses to advise** |
| WF-05 Reservoir safety | 4 | Freeboard/dZ-dt/time-to-ceiling, operating state, legal transitions only, buffer exhaustion |
| WF-09 Notifications | 7 | One record → every channel; **alert level matches quoted stage**; SMS ASCII ≤160; CAP valid; identity gate; acknowledgement |
| DT-8 Alarms | 5 | Actionable + instructed, one-per-root-cause, identity-gated ack, dam safety never grouped |
| WF-10 Evacuation | 6 | Time-of-use routes, shelter exclusion, ground-floor vs refuge, shelter-in-place when isolated, single-access flag, model caveat |
| Domain | 5 | Timeline determinism, **state is a pure function of (entity, t)**, forward/backward scrub identity |
| WF-12 Reports | 6 | Watermark + versions on all three; operation record answers "did the dam cause this?" |
| FR-29 Hydrology | 6 | Sub-catchment split, normalised orographic weights, volume-neutral wetness, saturation index, calibration caveat |
| Map | 3 | View switch, shelter layer paints with live validity, every layer toggle wired |
| Cross-cutting | 5 | i18n, keyboard reach, shape-not-colour-only, rapid-scrub resilience, scrub responsiveness |
| Scenario matrix | 6 | Every scenario × policy runs the full event clean |
| Role workspaces | 76 | Governed hydropower registry, URL/nav routing, City dashboard, Plant demo/non-demo facility handling, RACI refusal/approval, shared orders/checklist/execution state, bilingual copy, accessibility and responsive desktop/mobile layouts |

`npm run test:role-workspaces` is the executable release gate for the City and Plant
operations workspaces. It covers the governed 44-facility registry and routing contract,
direct/deep-linked City and Plant workspace routes, demo facility order flow, non-demo
facility refusal, RACI authority checks, human-only approval, shared approved orders,
checklist and execution state, bilingual refresh, keyboard/a11y labels, and responsive
desktop/mobile containment.

---

## Inherited from the earlier harness

From `SkyLabs_SURF2026/scripts/` — the parts that were expensive to learn:

- **`browser.mjs` GPU flags.** The single most valuable piece. Headless Chromium renders
  WebGL through SwiftShader, on the CPU; the 3D scene then runs at ~0 fps and clicks time
  out at 30 s while the app is perfectly correct. With ANGLE/Metal it is ~60 fps and clicks
  land in ~186 ms. Without this the suite is unusably flaky and the cause is invisible.
- **`serve.mjs`** — no-dependency static server with the `EADDRINUSE` fallback, so a stale
  QA process makes the suite pick another port instead of dying.
- **`step` / `ok` / `bad` / `check`** result collection, per-page console + `pageerror`
  capture, grouped report, non-zero exit.

## Improvements over it

1. **Boot on a signal, not a sleep.** The old harness slept `waitForTimeout(22000)` — too
   slow on a warm machine, too short on a cold one, which is the classic manufactured
   flake. This waits for the app's own `[selftest]` line.
2. **Evidence on failure.** Screenshot + `FT` state dump per failing check.
3. **Deterministic time control.** `setTime()` drives scrub → resettle world → recompute
   zones → tick, exactly as the app does, so no assertion races the render loop.
4. **Invariant tests, not just interaction tests.** Determinism, state purity, message
   numeric consistency, constraint feasibility — properties, not clicks.
5. **Machine-readable `report.json`** for diffing runs.
6. **Pixel-level visual gating** (`zoom-visual.mjs`, `npm run test:zoom`). Nothing else in
   the suite looks at what the WebGL canvas actually draws — e2e asserts state, ux-audit
   asserts layout — so a scene can render as dark mush with every check green.

---

## `zoom-visual.mjs` — read this before changing it

Four things about it are deliberate, and each one was learned by getting it wrong first:

- **Screenshots, not canvas reads.** The renderer has no `preserveDrawingBuffer`, so
  drawing the app canvas into a 2D canvas yields a transparent image and every metric
  silently reads 0 — it looks like a measurement, not an error.
- **The sim clock is pinned** (`SIM_TIME_H`). The app auto-plays, so an unpinned run
  samples a different moment of the flood each time; an 11-point metric swing that looked
  like a code regression turned out to be nothing but clock drift.
- **Regression gate against a per-view baseline, not a fixed threshold.** `murkPct`
  reflects scene content as well as scene defects: a clean Đà Nẵng street view is ~36%
  because the river and bay sit in that luma band, while clean Ái Nghĩa inland is ~23%.
- **Thresholds sit below the measured effect, never on it.** A claim first written at
  `detail ≥ 0.4` then measured 0.43 and 0.35 across two runs — a gate on the mean, which
  would have flaked half the time.

`--compare[=switch]` re-sweeps with a kill switch (`drapelegacy`, `waterlegacy`) so
before/after is a live measurement of both code paths rather than a stale file. A run with
failed tile feeds is reported, skipped, and refused as a baseline.

It also guards a bug class that has now been found **five separate times**: objects sized
for the 96 km overview that never shrink when the camera comes down — the deep-zoom drape,
110 m building footprints, 600 m road ribbons, 300 m vehicles, 310 m gauge markers. At
street zoom nothing may draw wider than 250 m.

**Two things about that guard were wrong on the first attempt, and both are worth knowing
before you touch it.** It sampled `instance 0` of each instanced mesh — but unused vehicle
slots are parked at scale 0.001, so an idle slot 0 let a 300 m vehicle straight through;
the gate was proved useless by reintroducing the real bug in a scratch copy and watching it
stay green. And it measured whole-mesh bounding boxes, so the merged road mesh reported
79 km while every individual ribbon was 108 m wide. It now scans all instances for the max
and only measures instanced meshes and single marker primitives, where the bounding box
really is the object's size.

**Verify a new gate by breaking the code it protects.** A gate that has never failed is
decoration.

---

## `map-errors.mjs` — the sweep that fails on swallowed exceptions

`npm run test:map-errors`. Drives the map the way a user does — 3D flies to four cities at
three zoom intents, deep zoom, camera presets, orbit, every layer toggled off and on, a full
scrub of the flood, the 2D view and back — and fails on any console error, `pageerror`, or
failed same-origin request.

It exists because every other suite asserts an *outcome*. This app swallows exceptions on
purpose (`try { buildOsmRoads() } catch { console.warn(...) }`), so a 3D layer that throws
looks identical to a slow network and no outcome assertion notices.

Third-party tile failures are **reported but do not fail the run** — Esri and Overpass go
down often enough that a suite which reddens on someone else's CDN is a suite people learn
to ignore. That reporting is what surfaced `overpass-api.de` refusing connections, which in
turn led to finding that Hội An had zero buildings whenever OSM was unavailable.

---

## Defects this suite has already caught

- **Single-access communities were dropped from the evacuation list.** The code appended
  them to the ranked list *before* `slice(0, 7)`, so the cut removed exactly the
  communities that isolate first — the opposite of the intent stated in its own comment.
  Fixed by slicing first, then guaranteeing inclusion.
- One assertion of mine was itself wrong: it asserted any multi-storey shelter stays valid,
  but a low two-storey building genuinely can be submerged to above its refuge level. The
  invariant was rewritten against `refugeLost` rather than storey count — the app was right.

> `probe-r33.mjs` in this directory belongs to a separate investigation (risk R-33, whether
> the shipped `pBelow` matches the drawn ensemble band) and is not part of this suite.


---

# UI/UX conformance audit (`ux-audit.mjs`)

Audits the running app against `docs/05-product/04-ux-principles.md` and the accessibility
clauses of the NFRs. This is **measurement, not inspection**: contrast ratios are computed
from the colours the browser actually painted (compositing every translucent layer and
gradient stop down to the page background), and type sizes, overflow, tab reachability and
focus visibility are read off the live layout.

`MUST` = a stated hard rule; a violation fails the run. `SHOULD` = a stated preference;
reported, does not fail.

| Group | What is measured |
|---|---|
| Layout law | No horizontal scroll at 1920×1080, usable at 1366×768, persistent signals visible without scrolling, layout does not shift when values update |
| Typography | Type-scale floors per surface (amendment A1) |
| Colour & contrast | WCAG AA on every visible text node; never colour alone; discrete depth bands; reduced-motion |
| Alarm design | Rate budget, every alarm carries an instruction, individually acknowledgeable, dam safety never auto-cleared |
| Language of uncertainty | No bare certainty claims; every forecast carries a cue; the product can say "I don't know" |
| Charts | Reservoir level and river stage never share an axis; labelled thresholds; now-marker |
| Numbers | Units present, no false precision, 24-hour clock, VI decimal comma |
| Interaction & a11y | Keyboard reach, no tooltip-only critical info, visible focus, 200 % text scale, usable with 3D off |
| Anti-patterns | No hamburger, no timer-only notifications, no animated critical values, mode marker undismissable |
| Performance | Interaction latency, 2D map frame rate, decision-package generation |

## What the audit found on its first run

**6 MUST violations.** Four were real, two were bugs in the audit itself — worth separating,
because an audit that cannot be wrong is not measuring anything.

Real, and fixed in the app:

| Finding | Measured | Fix |
|---|---|---|
| No visible keyboard focus anywhere | 0 controls with an indicator | `:focus-visible` outline + ring across all controls |
| Text below the readable floor | **317 nodes < 11 px** | every declaration raised to ≥ 11 px; standard amended (A1) |
| Alert text failing AA on tinted cards | 14 nodes at **3.44–4.30:1** | lightened alert palette on the decision package |
| Exposure shown as an exact count | `1 603 people` | rounded to the model's resolution (nearest 100) |
| No `prefers-reduced-motion` support | absent | added |

Bugs in the audit, fixed in the audit:

- **Gradient backgrounds reported `ratio 1.0`.** `getComputedStyle().backgroundColor` is
  transparent on a gradient, so the walk-up found the wrong layer. First attempt then
  over-corrected by treating the gradient's first stop as *opaque* — but it is typically
  `rgba(47,134,255,0.14)`, and 134 legible nodes were reported as failures. Now every layer,
  gradient stops included, is composited with its real alpha.
- **`element.focus()` does not satisfy `:focus-visible`** in Chromium — the pseudo-class is
  gated on a keyboard-interaction heuristic. The audit reported a missing focus indicator
  that was present. It now drives a real `Tab`.
- **`new Set()` over arrays never dedupes**, so the 5 discrete depth bands counted as 8 and
  read as a continuous ramp.

## Result

**36/37 conform · 0 MUST violations · 1 SHOULD.**

The remaining `SHOULD` is [R-28](../docs/06-critique/02-open-risk-register.md): the decision
package sits inside a scrollable rail. It is left reported rather than suppressed, because
the honest fix is promoting S-05 to its own screen, not hiding the check.
