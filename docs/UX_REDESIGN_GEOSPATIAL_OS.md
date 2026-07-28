# FloodTwin — Redesign to a Geospatial Operating System

> **Mandate:** transform the current admin-dashboard shell into a map-first operational
> control centre in the class of Palantir Gotham, Cesium, ArcGIS, Windy, and Tesla FSD.
> **The map is the product.** Every other surface exists to serve a decision on the map,
> appears only when needed, and can be hidden, collapsed, floated, or pinned.
>
> **Non-negotiable constraint (grounded, not aesthetic):** this is a *re-housing*, not a
> feature cut. Every panel below maps to a documented requirement (`FR-xx` / screen `S-xx`
> in `docs/`) backed by a calibrated engine. Capability is preserved and *summoned on
> demand* — never deleted. See `DATA_AND_METHODS.md` anti-regression rules.

---

## 0. Diagnosis of the current shell

Current layout (`index.html` + `styles.css` `.app`):

```
grid-template-rows:    auto            auto         minmax(0,1fr)   auto
grid-template-cols:    300px           1fr          336px
                    ┌───────────────── TOP BAR (brand + 6 KPIs + scenario/policy/tour/lang) ─────────────────┐
                    ├──────────────────── OPS BAR (mode · esc · κ · P(exc) · deadline · actor · degrade) ─────┤
                    │ LEFT RAIL 300px │            CENTER STAGE (map)              │ RIGHT RAIL 336px          │
                    │ 7 panels stacked│  viewTabs · cam presets · canvas · PIP     │ 6 panels stacked          │
                    │ (scrolls)       │  · water badge · TIMELINE (fixed)          │ (scrolls)                 │
                    ├───────────────── FOOTER (attribution statusbar) ───────────────────────────────────────┤
```

Measured problem: with a 1440×900 viewport, the map canvas gets ≈ **820×560 px ≈ 44%**
of the screen. Two 300–336px rails + a fat header + ops bar + footer consume the majority
of pixels **permanently**, whether or not the operator is looking at any of them.

**13 permanently-mounted panels** compete for attention with equal visual weight:

| Rail | Panels (all always visible) |
|---|---|
| Left | Meteorological forcing · Sub-catchment rainfall · Monitored zones · Evacuation/shelters · Layers · Legend · Target metrics |
| Right | Gauge/hydrograph · Reservoir stack + MPC decision · Alarms/notifications · Audit trail · Traffic · LLM brief · Event log |

Everything the brief says to avoid is present: persistent sidebars, large KPI grid, a fat
header, a permanent secondary toolbar (ops bar), a footer, duplicate view controls, and no
progressive disclosure. `focusMode` exists but is all-or-nothing (hides *all* panels), so
operators never use it during real work — they'd lose the decision surface.

**The redesign keeps the engines, discards the furniture.**

---

## 1. Target information hierarchy → surface mapping

The brief's priority order drives which surface a thing lives in and how loud it is:

| # | Priority | New home | Default state |
|---|---|---|---|
| 1 | **Map** | Full-bleed canvas, 100% viewport | Always, 100% |
| 2 | Active simulation | Floating **Timeline** (bottom) + tiny sim clock in command bar | Collapsed to a strip |
| 3 | Alerts | Floating **Alert stack** (top-right) | Badge only until an alert fires |
| 4 | AI recommendations | Floating **Decision panel** (MPC) + **AI assistant** | Summoned; auto-raises on new MPC proposal |
| 5 | Timeline | Floating Timeline | Collapsed strip, expands on hover/focus |
| 6 | Context panel | Floating **Inspector** (right) | Hidden until an object is selected |
| 7 | Secondary tools | **Left icon dock** flyouts (layers, forcing, metrics, legend) | Icons only; flyout on demand |

Everything above **overlays** the map. Nothing reduces it.

---

## 2. The new shell — one map, floating instruments

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ▚ FT  [⌕ Search place / gauge / zone ]   ◑ Oct 2020 ▾   Rule|MPC   ☀ 22°  ⏻ actor ▾│ ← Command bar (floating, 44px, auto-hide)
│                                                                        ▲ 3 alerts ⚑│ ← Alert stack (badge → expands)
│ ┌──┐                                                                                │
│ │⌕ │                                                                                │
│ │◱ │  layers                                                                        │
│ │☁ │  forcing                    T H E   M A P   ( 3D / 2D )                        │
│ │▤ │  metrics          100% viewport · full-bleed · GPU                            │
│ │◈ │  legend                                                    ┌─────────────────┐ │
│ │⎘ │  compare                                                   │  INSPECTOR      │ │ ← Right, summoned
│ └──┘                                                            │  (Reservoir A   │ │   on object select
│ ↑ Left icon dock                                                │   Vương)        │ │
│ (56px, icons only,                                              │  ▸ storage 71%  │ │
│  flyout on click)                                               │  ▸ inflow 1.2k  │ │
│                                                     ┌──────────┐│  ▸ MPC pre-      │ │
│                                                     │◉ PIP 2D  ││    release …    │ │
│                                                     └──────────┘│  [Approve][…]   │ │
│                                                                 └─────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────────────┐    │
│  │ ▶  T+06h · BĐ3 crest  ══●══════════════════════ scrubber ═══  6/30/90 m/s  ⌃│    │ ← Timeline (floating,
│  └───────────────────────────────────────────────────────────────────────────┘    │   collapsible to 8px)
│  SYNTHETIC DATA · NOT FOR OPERATIONS · Esri/AWS/OSM · 1865/QĐ-TTg          60fps ●  │ ← Status ribbon (2px→hover)
└──────────────────────────────────────────────────────────────────────────────────┘
```

Three permanent chrome elements only, all thin and translucent, all auto-hiding:
**command bar** (top), **left icon dock**, **status ribbon** (bottom). Everything else is
summoned. Target map coverage: **88–95%** of viewport depending on which instruments are open.

### Universal panel state machine

Every floating surface implements the same lifecycle (brief requirement):

```
 hidden ⇄ collapsed ⇄ expanded ⇄ fullscreen
              ⇅            ⇅
           pinned      floating (draggable)
              ⇅
          auto-hide (idle 8s → collapse)
```

- **hidden** — not in DOM flow; reachable via dock icon, hotkey, or context trigger.
- **collapsed** — title strip only (≈32px), shows the one number that matters.
- **expanded** — full panel, but as an *overlay* with backdrop-blur, never a layout column.
- **fullscreen** — panel takes the stage (for deep reading: audit log, post-event report).
- **floating** — undocked, drag anywhere, remembers position per panel (localStorage).
- **pinned** — stays open across selection changes (default is: Inspector unpins on close).
- **auto-hide** — after idle, non-critical panels collapse; alerts never auto-hide.

Implementation: a single `FloatingPanel` controller class replaces per-panel bespoke CSS.
State stored in `state.ui.panels[id] = {mode, x, y, w, h, pinned}`.

---

## 3. Screen-by-screen redesign

Each "screen" is a real surface in today's DOM. For every one: **Current Problems ·
Redesign Goals · Wireframe · Interaction Flow · Floating Behaviour · Responsive · Keyboard ·
Animation · Accessibility · User Journey · Before/After · Implementation.**

---

### S-1 · Global shell & top bar → **Command Bar**

**Current problems**
- Fat header (brand block + tagline + 6-KPI strip + scenario/policy/tour/lang) ≈ 96px tall,
  never collapses. The 6-KPI grid is exactly the "large KPI grid" the brief bans.
- The separate **ops bar** below it is a second permanent toolbar (mode, escalation, κ,
  P(exc), deadline, actor, degrade) — duplicate chrome, ≈40px more.
- Combined, top chrome steals ≈136px (15% of a 900px screen) forever.

**Redesign goals** — one 44px translucent floating bar; search-first; KPIs demoted to
on-demand; ops-state compressed to a single escalation pill that expands.

**Wireframe**
```
┌ 44px, floating, backdrop-blur, auto-hide on map-drag ──────────────────────────────┐
│ ▚FT │ ⌕ Search place · gauge · zone · dam        │ Oct2020▾ │ Rule◐MPC │ ☀22° │ L2⚑ │ ⏻▾│
└─────────────────────────────────────────────────────────────────────────────────────┘
        └ command palette (⌘K)                       └ scenario  └ policy  └wx └esc └actor
```
- The 6 KPIs move **into** two places: (a) the ones tied to a map object show in its
  Inspector; (b) the basin-wide ones (alert level, rain, roads open) become a **hover
  card** off the escalation pill and a **⌘K → "vitals"** view. Nothing is lost — `FR`
  metrics still render, just not as a permanent grid.
- Ops-state (escalation L0–L4, κ, P(exc,12h), decision deadline, data health) collapse into
  the single `L2⚑` pill; click expands a compact ops popover. Actor + degrade live in the
  `⏻▾` account menu.

**Interaction flow**
`⌘K` → command palette (search places, gauges, run scenario, toggle policy, jump camera) →
Enter → map flies to target + relevant Inspector opens. Escalation pill click → ops popover.

**Floating behaviour** — pinned by default (it's the primary entry point) but **auto-hides
on active map manipulation** (drag/orbit/zoom) and returns on pointer-to-top or `⌘K`.

**Responsive** — < 900px: collapses to `▚FT ⌕ ⚑ ⏻`; search opens full-width sheet; scenario
& policy move into `⏻` menu.

**Keyboard** — `⌘K` palette · `/` focus search · `S` cycle scenario · `P` toggle Rule/MPC ·
`Esc` close.

**Animation** — bar slides down 160ms `cubic-bezier(.2,.8,.2,1)` on reveal; palette scales
from 0.98→1 + fade 120ms. GPU `transform`/`opacity` only.

**Accessibility** — `role="toolbar"`; search is a labelled combobox with `aria-expanded`;
escalation pill `aria-live="polite"` announces level changes; palette is a listbox with
roving focus; full keyboard reachability; respects `prefers-reduced-motion`.

**User journey** — Operator lands → sees the map immediately, one thin bar → types "Ái
Nghĩa" → map flies to gauge, hydrograph Inspector opens. No hunting across two toolbars.

**Before / after**
| Before | After |
|---|---|
| 96px header + 40px ops bar, always | 44px bar, auto-hides |
| 6-KPI permanent grid | KPIs on-demand (Inspector / hover / ⌘K) |
| Two toolbars | One bar + one escalation pill |

**Implementation** — new `CommandBar` component; move `#scenarioSelect`, `#policyToggle`,
`#langToggle`, `#btnTour` in; fold `#kpiStrip` values into a `vitals()` popover; fold
`#opsBar` fields into `opsPopover()`. Data bindings unchanged (same `state` reads).

---

### S-2 · Left rail (7 panels) → **Left icon dock + flyouts**

**Current problems** — 300px permanent column with 7 stacked panels (forcing, sub-catchment
rainfall, zones, evacuation, layers, legend, metrics). Scrolls, so half is off-screen anyway.
Pure "persistent sidebar" anti-pattern. Steals 300px + gap forever.

**Redesign goals** — collapse to a **56px icon dock**; each icon opens a **flyout overlay**
(≤320px) that floats over the map with backdrop-blur and closes on outside-click. Only one
flyout open at a time (radio behaviour) unless pinned.

**Wireframe**
```
┌56┐   click ◱ →  ┌ Layers flyout (floats, 300px) ───────────┐
│⌕ │             │ ☑ Water/flood   ☑ Flow particles          │
│◱ │ layers      │ ☑ Traffic       ☑ Road status             │
│☁ │ forcing     │ ☑ Gauges        ☑ Reservoirs              │
│▤ │ metrics     │ ☑ Rain          ☑ Labels · Zones · Bldg   │
│◈ │ legend      │ … grouped, searchable, "solo/hide all"    │
│⎘ │ compare     └───────────────────────────────────────────┘
│▦ │ zones
│⛑ │ evac
└──┘
```
Dock icons (top→bottom): Search · **Layers** · **Forcing** (met) · **Metrics** · **Legend** ·
**Compare** · **Zones** · **Evacuation**. Legend is *context-aware*: it auto-shows only the
ramps for currently-enabled layers.

**Interaction flow** — click icon → flyout slides in from dock → interact → click map or
`Esc` → flyout closes. Zones/Evac items are clickable → select the object → its **Inspector**
opens on the right and camera flies there (replaces today's "Đến vị trí" button).

**Floating behaviour** — flyouts float, are pin-able (📌 keeps open while you work the map),
and draggable when pinned. Layers flyout is the most-pinned, so it remembers `pinned:true`.

**Responsive** — < 1180px dock stays (it's only 56px); flyouts become bottom sheets on
touch. < 900px dock becomes a bottom tab-bar of the same icons.

**Keyboard** — `L` layers · `F` forcing · `M` metrics · `G` legend · `C` compare ·
`Z` zones · `E` evac · number keys `1–9` toggle individual layers when Layers flyout is open.

**Animation** — flyout translate-X from -8px + fade 140ms; icon active-state is a 2px accent
bar growing from center 120ms.

**Accessibility** — dock is `role="tablist"` vertical; each flyout `role="tabpanel"` with
focus trap while open; layer toggles are real checkboxes; `aria-keyshortcuts` on each icon.

**User journey** — Operator wants rainfall context → presses `F` → forcing flyout (rain
scale, ensemble spread, sub-catchment split) floats up → adjusts → presses `Esc` → back to
full map. Never lost a column of pixels.

**Before / after**
| Before | After |
|---|---|
| 300px column, 7 panels, always | 56px dock, flyouts on demand |
| Legend always shown in full | Legend context-aware, summoned |
| "Đến vị trí" buttons | Click item → Inspector + camera fly |

**Implementation** — wrap each existing `<section class="panel">` from `#railLeft` in a
`Flyout(id, icon, hotkey)`. Reuse the panels' inner DOM verbatim (forcing sliders, zone list,
layer toggles) — only the container changes. Delete `.railLeft` grid column.

---

### S-3 · Center stage → **Full-bleed map + floating map instruments**

**Current problems** — the stage is boxed by rails; `viewBar` (3D/2D tabs + cam presets +
fps/grid meta) is a permanent strip above the map eating vertical space; the map never
reaches the "80–95%" mandate. `focusMode` exists but nukes the whole decision surface.

**Redesign goals** — map fills the viewport edge-to-edge. View/camera controls become a
**floating segmented control** bottom-left. Add the brief's map modes: Fullscreen,
Immersive, Focus, Presentation, Compare, Split, PIP.

**Wireframe**
```
┌ full-bleed canvas (3D or 2D) ──────────────────────────────────────────────┐
│                                                                              │
│  ┌ water badge (floats, top-left, auto) ┐              ┌ mode rail (right) ┐ │
│  │ Flooded 923 km² · Exposed 84k · …    │              │ ⛶ fullscreen      │ │
│  └───────────────────────────────────────┘              │ ◱ focus           │ │
│                                                          │ ▦ compare/split   │ │
│                                                          │ ◉ immersive       │ │
│                                                          │ ⎋ present         │ │
│  ┌ view/cam control (floats, bottom-left) ┐             └───────────────────┘ │
│  │ 3D│2D  ·  Overview Delta Dams HoiAn    │      ┌ PIP (floats, drag) ┐       │
│  └─────────────────────────────────────────┘      │ ◉ opposite view    │       │
└───────────────────────────────────────────────────└────────────────────┘──────┘
```

**Map modes (brief-mandated)**
- **Fullscreen** — hides command bar + dock + status; map is 100%. (`F11` / `⛶`)
- **Focus** — hides all summoned panels but keeps thin chrome (today's `focusMode`, refined).
- **Immersive** — 3D only, cinematic camera, no UI except timeline (for briefings).
- **Presentation** — large fonts, auto-tour (reuses `#btnTour`), pointer highlights.
- **Compare** — split map: Rule vs MPC outcome side-by-side, synced camera + time.
- **Split** — 3D | 2D simultaneously, synced.
- **PIP** — the existing `#pipSwap` becomes a draggable, resizable picture-in-picture of
  the *other* view; click swaps main/PIP.

**Interaction flow** — click any map object (reservoir, gauge, river reach, zone, road,
shelter) → Inspector opens (S-6). Double-click → camera flies + Inspector pins. Right-drag
pans, wheel zooms (unchanged engine input).

**Floating behaviour** — water badge, view control, and mode rail all auto-hide during
camera manipulation and return on idle. PIP is always floating + draggable.

**Responsive** — < 900px: view control becomes a bottom segmented control; mode rail folds
into a `⋯` menu; PIP hidden (matches current mobile rule).

**Keyboard** — `1` 3D · `2` 2D · `Space` play/pause · `F` fullscreen · `⌥F` focus ·
`I` immersive · `C` compare · `\` split · `P` PIP swap · `O/D/A/H` camera presets
(Overview/Delta/Dams/HoiAn) · arrow keys nudge camera.

**Animation** — camera preset transitions are eased fly-tos (existing 3D). Mode switches
crossfade 200ms. Badge/controls fade 140ms. All `transform`/`opacity`; honour reduced-motion
(snap instead of fly).

**Accessibility** — canvas has an `aria-label` + an off-screen live-region summarising the
current scene ("Basin alert L2, 923 km² flooded, 3 zones critical"); all floating controls
are real buttons with labels; keyboard camera nav; focus ring visible on controls.

**User journey** — Operator opens app → map fills screen → clicks Đắk Mi 4 dam → Inspector
slides in with storage/inflow/MPC → approves pre-release → watches downstream crest drop on
the timeline ghost line. Zero page navigation; everything happened on the map.

**Before / after**
| Before | After |
|---|---|
| Map ≈ 44% viewport | Map 88–95% |
| `viewBar` permanent strip | Floating view control, auto-hide |
| Focus mode = all-or-nothing | 7 graded map modes |
| Static PIP button | Draggable, resizable PIP |

**Implementation** — promote `#stageWrap` canvas to fixed full-viewport; the existing two
canvases (`#canvas3d`, `#canvas2d`) and `#labels3d` stay. Move `#viewTabs` + `#camPresets`
into a floating `ViewControl`; move `#waterBadge`, `#btnFocus`, `#pipSwap` to floating
layer. Add `MapMode` controller (mostly CSS class toggles on `body`). No renderer changes.

---

### S-4 · Timeline → **Floating collapsible timeline**

**Current problems** — timeline is docked at the bottom of the stage, always full height
(transport + speed + clock + scrubber + event ribbon). Valuable, but permanently sized.

**Redesign goals** — float it over the map bottom; collapse to an 8px progress rail that
expands on hover/focus; keep scrubber, ensemble event ribbon, and BĐ markers.

**Wireframe**
```
collapsed:  ▁▁▁▁▁▁●▁▁▁▁▁▁▁▁▁▁▁▁▁  (8px, shows playhead + event ticks)
                    ↓ hover / T
expanded:   ┌───────────────────────────────────────────────────────────────┐
            │ ▶  T+06h · crest  T−24 ══════●══════ NOW ══════ T+48  6│30│90 m/s│
            │    event ribbon: ▲rain ▲BĐ1 ▲BĐ2 ▲BĐ3 ▲release ▲evac            │
            └───────────────────────────────────────────────────────────────┘
```

**Interaction flow** — hover/focus expands; drag scrubber scrubs sim (unchanged); click
event tick jumps to that moment + shows a toast of what happened. Play/pause + 6/30/90 m/s
retained.

**Floating behaviour** — pinned-expanded during active simulation, auto-collapses when
paused + idle. Draggable; can dock to top if operator prefers.

**Responsive** — < 900px: expanded timeline wraps (transport row + scrubber row), matches
current mobile wrap.

**Keyboard** — `Space` play/pause · `←/→` step scrubber · `⇧←/→` jump event · `[` `]` speed
down/up · `T` toggle timeline expand.

**Animation** — height 8px→auto 160ms ease; playhead is a smooth `requestAnimationFrame`
translate; reduced-motion keeps playhead but drops the expand animation.

**Accessibility** — scrubber is `<input type=range>` with `aria-valuetext="T+06h, BĐ3
crest"`; play button `aria-pressed`; event ticks are buttons with labels; live-region
announces phase changes ("crest reached").

**User journey** — during a briefing the operator collapses it to the 8px rail for a clean
map, scrubs by grabbing the thin playhead, expands only to change speed.

**Before / after** — permanent full timeline → 8px rail that expands on demand; same engine.

**Implementation** — reuse `#timelinePanel` DOM entirely; wrap in `FloatingPanel` with a
`collapsedHeight:8`. Move out of stage flow to `position:fixed; bottom`.

---

### S-5 · Reservoir stack + MPC decision → **Floating Decision panel (priority overlay)**

**Current problems** — buried as the 2nd panel in the right rail; the single most important
operational surface (the human-in-the-loop approval, `FR-04`/`S-05` decision package)
competes with 5 sibling panels and is often scrolled off.

**Redesign goals** — promote to a **first-class floating decision panel** that **auto-raises
and pulses** when MPC issues a new pre-release proposal (hierarchy priority #4). Contains the
reservoir stack, MPC compare, decision package (constraints/counterfactual/alternatives/
regret), mandatory reason field, and Approve/Reject/Record.

**Wireframe**
```
┌ Decision · Đắk Mi 4 → downstream (floats top-right, raises on new proposal) ─┐
│ Bậc thang liên hồ · QĐ 1865/QĐ-TTg                         confidence 0.78  │
│ ┌ A Vương ▓▓▓▓░ 71% ┐ ┌ S.Bung4 ▓▓▓░ 63% ┐ ┌ ĐăkMi4 ▓▓▓▓▓ 88% ┐ …          │
│ MPC proposal: pre-release +140 m³/s for 6h → crest −0.4 m at Ái Nghĩa        │
│ ┌ decision package ─────────────────────────────────────────────────────┐  │
│ │ constraints ✓ within 1865 corridor · counterfactual (Rule) · regret …  │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│ Reason (required): [ _______________________________ ]                       │
│ [ Approve ]  [ Record ]  [ Package ]  [ Reject ]     LLM never opens a gate   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Interaction flow** — MPC computes proposal → panel raises + soft pulse + alert badge →
operator reads package → must type reason → Approve → downstream water responds, ghost line
shows before/after, audit entry appended, notifications generated from the single decision
record.

**Floating behaviour** — floating, pinnable; **cannot be dismissed while a proposal is
pending approval** (only minimised to a persistent pill so it's never lost — safety).

**Responsive** — < 900px: becomes a bottom sheet at 70% height; reason field + Approve
stay above the fold.

**Keyboard** — `D` open decision · `A` approve (only after reason entered) · `R` reject ·
`⌘⏎` approve. Approve disabled (with reason) until the required field is non-empty.

**Animation** — raise = scale 0.98→1 + shadow bloom 180ms; pulse = 2 gentle border-glow
cycles then stop (never a nag loop); reduced-motion → static highlight.

**Accessibility** — `role="dialog"` (non-modal, `aria-modal="false"`); reason input labelled
+ `aria-required`; confidence read via `aria-label`; approve button `aria-disabled` reflects
reason state; live-region announces "new pre-release proposal, confidence 0.78".

**User journey** — the core FloodTwin loop: proposal → package review → reasoned approval →
visible downstream relief. Now it's the loudest floating surface, not rail item #2.

**Before / after** — decision UI buried mid-rail → floating priority panel that finds the
operator; identical engine, identical audit/notify wiring.

**Implementation** — lift `#reservoirPanel` + `#mpcCard` + `#dpBox` into `DecisionPanel`
floating controller; add `raise()`/`pulse()` hooks fired from the existing MPC-proposal
event in the sim loop. Keep `mpcApprove`/`mpcReject`/`mpcRecord` handlers.

---

### S-6 · Object selection → **Contextual Inspector (right, summoned)**

**Current problems** — no unified inspector; object detail is scattered (zone detail modal,
gauge panel, reservoir panel). Selecting a river or road has no home. This is the biggest
gap vs. Palantir/ArcGIS.

**Redesign goals** — one **contextual Inspector** on the right that **appears only on
selection**, adapts its contents to the object type, and disappears on deselect — exactly
the brief's Reservoir/River/Rainfall examples.

**Wireframe (adapts per object)**
```
click Reservoir → ┌ Inspector: A Vương ────────┐   click River  → ┌ Inspector: Vu Gia reach ┐
                  │ storage 71% ▓▓▓▓░           │                 │ stage 8.4m ▲ BĐ2         │
                  │ inflow 1.2k / outflow 0.9k  │                 │ discharge · ensemble fan │
                  │ ▸ MPC pre-release …         │                 │ downstream zones at risk │
                  │ [Approve][Package]          │                 │ [Notify][Report]         │
                  └─────────────────────────────┘                 └──────────────────────────┘
click Zone → flood depth, homes flooded, EOC route, shelter, actions
click Gauge → hydrograph fan + CRPS + alert band (today's right-rail gauge panel)
click Rainfall cell → sub-catchment rain, antecedent wetness, κ contribution
```

**Interaction flow** — select on map → Inspector slides in from right (overlay, ~360px, does
**not** compress the map — floats over it) → resizable via left edge → close (`Esc`/×) →
Inspector disappears, map reclaims 100%. Selecting a different object swaps contents in place.

**Floating behaviour** — hidden → summoned → resizable → collapsible → pin (to keep while
selecting others) → fullscreen (for deep tables like zone impact). Remembers width.

**Responsive** — < 900px: Inspector becomes a bottom sheet (drag-up to expand to full),
matching mobile ergonomics.

**Keyboard** — `Enter` on a hovered/focused object opens Inspector · `Tab` cycles selectable
objects · `Esc` closes · `⌥P` pin · `⌥→` widen.

**Animation** — slide-in translateX 12px + fade 160ms; content swap crossfade 120ms;
resize is live (no animation). Reduced-motion → instant.

**Accessibility** — `role="complementary"` + `aria-label="Inspector: A Vương"`; focus moves
to Inspector heading on open, returns to the map object on close; resizer is keyboard
operable; every metric has a text label (not colour-only).

**User journey** — the brief's exact flow: *Click Reservoir → panel slides in; Click River →
river analysis; Click Rainfall → rainfall controls; Close → panel disappears.* Now literally
implemented as one adaptive surface.

**Before / after**
| Before | After |
|---|---|
| Detail scattered across modal + 2 rail panels | One adaptive Inspector |
| River/road have no detail home | Every object inspectable |
| Panels always present | Summoned on select, gone on deselect |

**Implementation** — new `Inspector` controller with per-type renderers that **reuse existing
DOM builders**: reservoir renderer = current `#resList`/`mpcCard`; gauge = current
`#gaugePanel` + `hydrographCanvas`; zone = current zone-detail modal body; rainfall = current
`#subList`. Wire map picking (already exists for tooltips in `map2d.js`/`scene3d.js`) to
`Inspector.open(type, id)`.

---

### S-7 · Alarms / notifications → **Floating Alert stack**

**Current problems** — alarms + downstream-notification composer are a right-rail panel,
always mounted even at L0 (no alerts). "Large card" that's usually empty.

**Redesign goals** — a floating **alert stack** top-right: a badge when quiet, expanding to
a toast-column when alerts fire (hierarchy priority #3). Notification composer (threshold
bulletin, release notice, evac order) moves into the alert's action row + a `⌘K` action.

**Wireframe**
```
quiet:   ⚑            (badge with count)
active:  ┌ Alerts (3) ───────────────────┐
         │ ⚠ BĐ3 exceeded · Ái Nghĩa 2m  │ [ Notify ▸ ]
         │ ⚠ Road QL14B closed @T+3h     │ [ Reroute ]
         │ ● Shelter Hội An 82% full     │ [ Details ]
         └───────────────────────────────┘
```

**Interaction flow** — new alert → item animates into stack + optional map ping (camera
does *not* auto-move; operator stays in control) → click → map flies + Inspector opens →
`Notify` → composer (one decision record → all channels: phone/SMS/loudspeaker/Zalo/CAP).

**Floating behaviour** — floats top-right; alerts **never auto-hide**; stack scrolls;
individual alerts dismissible; whole stack collapsible to the badge.

**Responsive** — < 900px: stack anchors bottom (above timeline), full-width, max 40vh
(matches current toast rule).

**Keyboard** — `N` open alerts · `⇧N` next alert · `Enter` focus alert's object · in
composer `⌘⏎` record.

**Animation** — new alert slides in from right + subtle attention flash (once); severity sets
colour, not motion. Reduced-motion → no flash.

**Accessibility** — `role="log" aria-live="assertive"` for new critical alerts,
`"polite"` for info; each alert is a button; count in badge has `aria-label="3 active
alerts"`.

**User journey** — operator works the map calmly; BĐ3 breach fires → one alert slides in →
click → jump to gauge → issue release notice — all without a permanently-open panel.

**Before / after** — always-mounted alarm card → badge-until-needed floating stack;
notification composer reachable from the alert that motivated it.

**Implementation** — reuse `#alarmPanel` list rendering + `#notifyBar` handlers inside an
`AlertStack` floating controller; existing `#toasts` merges visual language with it.

---

### S-8 · AI / LLM brief + reports → **Floating AI Assistant**

**Current problems** — LLM brief + citizen Q&A + 4 report buttons are a dense right-rail
panel. Valuable (`RAG`, 100% cited) but static and low in the scroll.

**Redesign goals** — a floating **AI assistant** (bottom-right launcher `✦`) that opens a
conversational panel: situation brief, citizen Q&A (Hội An), and report generation
(situation PDF, operation dossier "did the dam cause the flood?", post-event report).

**Wireframe**
```
launcher: ✦        →   ┌ AI Assistant · RAG · 100% cited ─────────────┐
                       │ ▸ Generate situation brief                    │
                       │ ▸ Citizen Q&A (Hội An)                        │
                       │ ▸ Reports: situation · operation · post-event │
                       │ ── every claim carries a citation chip ──     │
                       │ [ ask anything about current state … ]        │
                       └───────────────────────────────────────────────┘
```

**Interaction flow** — click `✦` → panel opens → "Generate brief" → streamed brief with
inline citation chips (click chip → highlights the source metric/panel) → "Export report"
→ PDF (`#printReport`). LLM never computes hydraulics — copy retained verbatim.

**Floating behaviour** — floats bottom-right; collapsible to launcher; pin to keep open;
fullscreen for report review.

**Responsive** — < 900px: full-screen sheet.

**Keyboard** — `⌘J` toggle assistant · `⌘⏎` generate brief · `Esc` close.

**Animation** — launcher scale-in; panel slide-up 160ms; streaming text respects
reduced-motion (no typewriter).

**Accessibility** — `role="dialog"` non-modal; messages `aria-live="polite"`; citation chips
are links with `aria-label`; export button labelled.

**User journey** — after approving a release, operator opens `✦`, generates the situation
brief, exports the operation dossier for the record — from one floating surface.

**Before / after** — static rail panel → summoned assistant; same RAG/citation guarantees.

**Implementation** — wrap `#llmPanel` (brief, citizen, report buttons) in `AIAssistant`
floating controller; keep `btnBrief`/`btnCitizen`/`btnReport`/`btnRepOperation`/
`btnRepEvent` handlers and `#printReport`.

---

### S-9 · Audit trail + event log + traffic → **Utility drawer (bottom, on-demand)**

**Current problems** — audit trail, event log, and traffic panel occupy 3 right-rail slots.
Important for the record (`FR-04`) but rarely needed *live*; they're reference/history.

**Redesign goals** — move to a single **utility drawer** summoned from a status-ribbon
button; tabbed (Audit · Events · Traffic); expands to fullscreen for review/export.

**Wireframe**
```
status ribbon: … 60fps ●  [ ▤ Log ]
                              ↓ click
┌ Utility drawer (slides from bottom, tabs) ───────────────────────────────┐
│ [Audit] [Events] [Traffic]                                    [⛶][×]      │
│ append-only audit log · export · Dijkstra closures · ETA ĐN→Hội An …      │
└───────────────────────────────────────────────────────────────────────────┘
```

**Interaction flow** — click Log → drawer slides up (40vh) → switch tabs → export audit →
fullscreen for post-event review.

**Floating behaviour** — hidden → drawer (40vh) → fullscreen; never permanently mounted.

**Responsive** — < 900px: full-height sheet with sticky tabs.

**Keyboard** — `⌘L` toggle log drawer · `[`/`]` switch tabs · `⌘E` export audit.

**Animation** — slide-up 180ms; tab switch crossfade 100ms.

**Accessibility** — tabs `role="tablist"`; audit list `<ol>` preserved; export announces
success; drawer focus-trapped when fullscreen.

**User journey** — during after-action review the operator opens the drawer fullscreen,
reads the append-only audit, exports it, checks the traffic closure timeline.

**Before / after** — 3 always-on reference panels → one summoned tabbed drawer.

**Implementation** — move `#auditPanel`, `#logPanel`, `#trafficPanel` into a `UtilityDrawer`
with three tabs; reuse their renderers and `auditExport` handler.

---

### S-10 · Footer statusbar → **Status ribbon (2px → hover)**

**Current problems** — full-width footer with attribution + policy + build tag, always
visible, steals a row.

**Redesign goals** — 2px translucent bottom ribbon carrying the **one legally-required
persistent string** ("SYNTHETIC DATA · NOT FOR OPERATIONS") + fps dot; hovering reveals full
attribution (Esri/AWS/OSM, 1865/QĐ-TTg, build tag). The data-mode banner is safety-critical,
so its text is *always* legible even in the 2px state via a persistent left chip.

**Wireframe**
```
resting:  ▁ SYNTHETIC DATA · NOT FOR OPERATIONS ───────────────────────── 60fps ●
hover:    ┌ Esri World Imagery · AWS Terrain · © OSM · Decision 1865/QĐ-TTg · FloodTwin Q1 ┐
```

**Floating behaviour** — auto-hide except the mandatory data-mode chip (never hidden — it's a
compliance requirement, not decoration).

**Responsive** — < 900px: chip stays, attribution collapses into `ⓘ`.

**Keyboard** — `⌘/` reveal attribution.

**Accessibility** — data-mode chip `role="status"`, always in the a11y tree; contrast ≥ 4.5:1.

**Before / after** — permanent footer row → 2px ribbon + persistent safety chip.

**Implementation** — `#statusbar` → `StatusRibbon`; keep the synthetic-data string as a
non-hiding element (respects `DATA_AND_METHODS.md` honesty rule).

---

### S-11 · Modals & toasts → **Unified overlay system**

Keep modals for genuinely blocking flows (method/transparency `ℹ️`, confirmations). Toasts
merge visual language with the alert stack (S-7). Both already exist (`#modalScrim`,
`#toasts`); standardise animation (scale+fade 140ms) and reduced-motion behaviour. Self-test
FAIL still fires a red toast (H✓ contract preserved).

---

## 4. Global keyboard model (control-room muscle memory)

| Key | Action | Key | Action |
|---|---|---|---|
| `⌘K` | Command palette | `Space` | Play / pause sim |
| `/` | Focus search | `←/→` | Step time · `⇧` = jump event |
| `1` `2` | 3D / 2D | `[` `]` | Sim speed − / + |
| `F` | Fullscreen map | `⌥F` | Focus mode |
| `I` `C` `\` | Immersive · Compare · Split | `P` | PIP swap |
| `O D A H` | Camera Overview/Delta/Dams/HoiAn | `T` | Timeline expand |
| `L F M G Z E` | Dock flyouts | `D` | Decision panel |
| `N` | Alerts | `⌘J` | AI assistant |
| `⌘L` | Log drawer | `Esc` | Close top-most surface |
| `S` | Cycle scenario | `⇧?` | Keyboard cheatsheet overlay |

All shortcuts shown in a `⇧?` cheatsheet and as `aria-keyshortcuts` on controls.

---

## 5. Motion & rendering principles

- **GPU-only** transitions: `transform` + `opacity`; never animate layout properties.
- **Budget:** panel transitions 120–200ms, `cubic-bezier(.2,.8,.2,1)`; no animation > 240ms.
- **Purposeful only:** camera fly-tos, panel summon/dismiss, alert arrival, decision raise.
  No decorative motion (brief: "no unnecessary animation").
- **60fps guard:** existing `#fpsMeter`; if fps < 45, auto-disable non-essential blur.
- **`prefers-reduced-motion`:** all summon/dismiss become instant; playhead + camera snap.

---

## 6. Accessibility baseline (control-room grade)

- Full keyboard operability of every floating surface; visible focus rings; logical focus
  order; focus trap only in fullscreen/blocking modals; focus returns to trigger on close.
- Colour never the sole signal: alert levels, road status, depth ramps all carry text/icons.
- Live regions: escalation level, new alerts (`assertive`), phase changes, decision proposals.
- Canvas fallback: off-screen textual scene summary updated each sim tick.
- Contrast ≥ 4.5:1 for text, ≥ 3:1 for UI glyphs, verified in the dark theme.
- Touch targets ≥ 40px (already a mobile rule; extend to dock/flyouts).
- Bilingual (VI/EN) retained; `lang` attribute per surface for screen-reader pronunciation.

---

## 7. Responsive strategy

| Breakpoint | Behaviour |
|---|---|
| ≥ 1440px | Full floating system; map 88–95%; multiple pinned instruments allowed |
| 1180–1440px | Same; flyouts single-open; Inspector default 340px |
| 900–1180px | Dock stays (56px); flyouts + Inspector become right-edge overlays; PIP optional |
| < 900px | Dock → bottom tab-bar; command bar condenses; all panels → bottom sheets; timeline wraps; PIP hidden; map stays top and dominant |

Guiding rule at every size: **the map is never permanently reduced**; smaller screens push
instruments to *temporary* sheets, not permanent columns.

---

## 8. Before / after — the whole product

| Dimension | Before (admin dashboard) | After (geospatial OS) |
|---|---|---|
| Map coverage | ≈ 44% | 88–95% |
| Permanent chrome | Header + ops bar + 2 rails + footer | Command bar + 56px dock + 2px ribbon (all auto-hide) |
| Panels mounted | 13 always | 0 always; all summoned |
| Object detail | Scattered (modal + 2 panels) | One adaptive Inspector |
| Decision (MPC) | Rail item #2, scrolls off | Floating priority panel, auto-raises |
| Alerts | Always-on card (often empty) | Badge → floating stack |
| Map modes | Focus (all-or-nothing) + static PIP | 7 modes + draggable PIP |
| Discoverability | Everything at once | Progressive disclosure + `⌘K` |
| Feel | Control panel *beside* a map | A map you *operate* |

---

## 9. Implementation plan (incremental, non-regressing)

**Guardrails (from `DATA_AND_METHODS.md` + memory `floodtwin-q1-demo`):** every phase keeps
the H✓ self-test PASS, the SWE/hydrology calibration untouched, the audit/notify single-
record wiring intact, and the synthetic-data banner always legible. Each phase is shippable
and independently reversible.

**Phase 0 — Foundation (no visible change).**
`FloatingPanel` controller (state machine, drag, pin, persist to `state.ui.panels`);
`MapMode` body-class controller; keyboard-shortcut registry + `⇧?` cheatsheet. Reuse existing
panel DOM — no engine edits. *Exit:* all panels render identically but through the new host.

**Phase 1 — Full-bleed map.**
Promote `#stageWrap` to fixed full-viewport; move `#viewTabs`/`#camPresets`/`#waterBadge`/
`#pipSwap` into floating `ViewControl`; delete stage-boxing from `.app` grid. *Exit:* map ≥
85%; 3D/2D/PIP/camera all work; fps unchanged.

**Phase 2 — Command bar + status ribbon.**
Collapse `#topbar` + `#opsBar` into `CommandBar` (+ escalation popover, `vitals()` hover);
`#statusbar` → 2px ribbon with persistent safety chip. *Exit:* top chrome ≤ 44px; all
scenario/policy/actor/degrade controls reachable.

**Phase 3 — Left dock + flyouts.**
Convert 7 left panels into dock flyouts; make Legend context-aware; wire zone/evac items to
selection. *Exit:* left column gone; every panel summonable; hotkeys `L F M G Z E`.

**Phase 4 — Inspector.**
Build adaptive `Inspector`; wire existing map picking → `Inspector.open(type,id)`; per-type
renderers reuse current reservoir/gauge/zone/rainfall DOM. *Exit:* click any object → correct
Inspector; deselect → map reclaims 100%.

**Phase 5 — Decision panel + Alert stack + AI assistant + Utility drawer.**
Promote MPC decision to floating priority panel with `raise()/pulse()` on new proposal; move
alarms→`AlertStack`, LLM/reports→`AIAssistant`, audit/events/traffic→`UtilityDrawer`.
*Exit:* right rail gone; decision loop louder than before; audit export works.

**Phase 6 — Modes, motion, a11y polish.**
Implement Immersive/Compare/Split/Presentation; standardise transitions + reduced-motion;
full keyboard + live-region + contrast audit; extend Playwright `tests/` (organised by
operational flow) to cover summon/dismiss/pin/keyboard paths and assert map-coverage ≥ 85%.
*Exit:* `npm run e2e` green; H✓ PASS; no calibration regression.

**Verification each phase:** boot-clean console · self-test H✓ PASS · flood cycle
(rise→BĐ3 crest→recede) intact · MPC approve → downstream ghost-line relief · report export ·
map coverage measured ≥ target. Fail → iterate, don't advance.

---

## 9a. Implementation notes (as built)

The redesign shipped as **one additive file `js/shell.js`** (loaded last) plus an appended
CSS block in `styles.css` and a handful of `id` additions in `index.html`. It is gated on a
`body.geoshell` class added only after a successful build, with a kill-switch (`?classic` in
the URL or `window.__NO_SHELL = 1`) that falls back to the original dashboard — so the shell
can never brick the app. Because every engine element is accessed by `getElementById` and the
canvases self-size via `ResizeObserver`, panels are **relocated** (`appendChild`) rather than
rebuilt: their ids, event listeners, and live data bindings all survive the move.

Two surfaces were added during implementation to keep the design honest under the project's
own UX law (decision signals must be on-screen; safety actions must not hide):

- **Persistent action toolbar (`.geoActions`)** — the downstream-notification composer
  (`nfThreshold/nfRelease/nfEvac`, WF-09) and the report actions (`btnReport/btnRepOperation/
  btnRepEvent`, WF-12) are **moved here**, always visible below the command bar. Safety-
  critical dispatch is never behind a summon. (This resolved 3 operational-flow e2e checks
  that clicked those buttons directly.)
- **Always-visible ops-signal strip (`.geoOpsStrip`)** — the real ops spans (escalation, data
  health, κ, P(exceed BĐ3 12h), decision deadline) and the SYNTHETIC-DATA mode marker are
  moved here, on-screen without scrolling. Duty-actor + data-degradation selects live in the
  escalation popover.

**Verification:** `npm run e2e:quick` → **70/70** (no operational regression); bespoke
`tests/shell-smoke.mjs` (20/20, map coverage 100%) and `tests/shell-interactions.mjs`
(15/15) cover the floating surfaces, modes, keyboard, and a11y roles.

**UX-audit reconciliation:** two Layout-law checks in `tests/ux-audit.mjs` encoded the
*dashboard* standard (persistent `railLeft/railRight/opsBar`; decision package reached by
scrolling a rail). They were updated to test the **same intent** against the map-first shell
(map ≥ 80% + persistent chrome present; decision package summonable and fully on-screen),
with a legacy fallback path when the shell is disabled — the guard stays real, it just tests
the architecture that now exists.

## 10. What we explicitly did *not* remove (honesty ledger)

Per the anti-regression rules, none of these were cut — only re-housed:
sub-catchment rainfall & κ basis, evacuation/shelter capacity & route timing, target metrics
(CSI/NSE/KGE + self-test), decision package (constraints/counterfactual/alternatives/regret),
audit trail, multi-channel notification single-record guarantee, RAG-cited LLM brief, bilingual
VI/EN, synthetic-data disclosure, and all attributions. The redesign changes **where and when**
these appear — never **whether** they exist.
```
