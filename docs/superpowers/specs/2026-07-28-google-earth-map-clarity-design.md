# Google Earth-style map clarity and place detail design

**Date:** 2026-07-28
**Status:** Approved visual direction
**Scope:** FloodTwin 2D/3D map presentation, navigation, selection, and place detail

## 1. Outcome

FloodTwin will present the basin as a Google Earth-style operational surface: satellite
imagery and terrain remain readable at every useful zoom, camera movement is predictable,
and every selected place can be inspected without confusing observed conditions with
simulated flood consequences.

The redesign must improve clarity without changing the hydraulic model, domain state,
decision lifecycle, source provenance, or existing operational workflows.

## 2. Design principles

1. **Terrain first.** Satellite imagery, roads, buildings, and terrain provide the visual
   frame. Operational overlays add meaning without obscuring that frame.
2. **Observed and simulated are never encoded alike.** Observed/current state uses green
   status treatment and a measurement timestamp. Simulation uses blue treatment, an
   explicit `T+` time, and a range or depth band.
3. **Movement explains itself.** Zoom, orbit, pan, and fly-to controls provide immediate
   visual feedback and keep the target visible throughout the transition.
4. **Selection preserves geography.** Place details open in a bottom sheet on desktop and
   mobile rather than covering the selected terrain with a large floating panel.
5. **Progressive detail.** Basin, district, street, and building-level information appear
   only at zoom levels where they remain useful and legible.

## 3. Visual system

### 3.1 Earth-style scene

- The default 3D view uses an oblique terrain camera with satellite imagery as the dominant
  surface and restrained atmospheric haze.
- The canvas remains full viewport. Search is anchored at the top left. The compass,
  tilt/orbit affordance, zoom controls, and locate control form one vertical cluster at the
  right edge.
- A scale indicator displays the current ground distance. At deep zoom, a metres-per-pixel
  readout appears during and briefly after camera movement.
- Existing operational panels remain available but hide during active orbit, pan, zoom, or
  fly-to and return after the camera settles.

### 3.2 Water and flow

- Existing river water is rendered as a dark natural blue with a narrow light shoreline
  edge. Simulated inundation uses a distinct cyan-to-blue depth ramp.
- Simulated inundation has a clear outer boundary, visible depth variation, and directional
  flow particles. It carries a persistent label such as `MÔ PHỎNG NGẬP · T+18h`.
- At close camera distance, inundation opacity decreases so roofs, roads, bridges, and field
  boundaries remain visible. The boundary and flow particles retain sufficient contrast.
- Sea, permanent river water, observed water-level markers, and simulated overbank water
  must remain visually distinguishable in screenshots and during motion.

### 3.3 Objects and labels

- Reservoirs, gauges, bridges, shelters, road closures, and monitored zones use different
  silhouettes rather than colour alone.
- Markers receive a white halo and a minimum 44 px interactive target. The selected marker
  receives a blue locating ring and stays visible above the water overlay.
- Labels use a light surface with dark text, a subtle shadow, and collision suppression.
  Secondary labels fade before primary labels when space is constrained.

## 4. Camera and navigation

### 4.1 Pointer and touch controls

- Primary drag orbits in 3D; secondary drag pans. Wheel and pinch zoom toward the pointer or
  gesture centroid. Double-click or double-tap performs one bounded zoom step.
- The 2D view retains primary-drag pan and pointer-centred wheel/pinch zoom.
- Controls must not reverse direction between 2D and 3D. Reduced-motion mode replaces the
  animated transition with an immediate camera update.

### 4.2 Visible controls

- `+` and `-` buttons perform fixed, bounded zoom steps.
- The compass resets bearing to north when clicked and supports drag-to-rotate where pointer
  input permits.
- A tilt/orbit control switches between top-down and oblique inspection angles.
- The locate control returns to the selected object when one exists; otherwise it returns
  to the basin overview.
- During fly-to, a short status label names the target and destination scale. On arrival,
  the marker pulses once and the scale indicator updates.

### 4.3 Fly-to contract

`flyToSelection(selection, options)` becomes the shared navigation contract for search,
map selection, inspector actions, command palette results, alerts, and zone lists.

The contract accepts the selected entity or point plus a semantic zoom intent:
`overview`, `district`, `asset`, or `street`. It resolves the appropriate 2D scale or 3D
camera distance, keeps the target unobscured by the detail sheet, and emits start/settled
events for UI feedback and tests.

## 5. Place selection and detail

### 5.1 Selectable places

The place-detail path supports reservoirs, gauges, bridges, roads, shelters, monitored
zones, known gazetteer places, buildings where vector data exists, and arbitrary terrain
points. Arbitrary points show coordinates, elevation resolution, flood depth, and nearest
known feature without inventing a place name.

### 5.2 Detail sheet

Selection opens a compact bottom sheet with:

- name, type, coordinates, and satellite thumbnail or map crop;
- an `HIỆN TRẠNG` section containing timestamped observed or declared status;
- a `MÔ PHỎNG` section containing scenario time, depth band, expected state, and lifecycle
  badge;
- data-source and freshness information;
- `Bay tới` / `Zoom tới`, `Orbit quanh điểm`, and context-appropriate route or workflow
  actions.

The sheet is expanded only on demand. Closing it clears or preserves selection according to
the existing inspector focus contract and returns keyboard focus to the originating map.

### 5.3 Scientific honesty

- An observed value must show its timestamp and source provenance.
- A modelled result must show `MÔ PHỎNG`, the scenario time, and the model range/depth band.
- Missing observations display `Không có số đo hiện tại`; simulated values cannot fill that
  gap or be restyled as current conditions.
- Satellite imagery is labelled as imagery, not a live visual observation.

## 6. Component boundaries

- `js/scene3d.js` owns Earth-style camera behaviour, terrain/water rendering response to
  distance, 3D selection projection, and fly-to animation.
- `js/map2d.js` owns equivalent pointer-centred 2D navigation, marker emphasis, deep-zoom
  tile selection, and the 2D half of the shared fly-to contract.
- `js/shell.js` owns the search surface, Earth navigation controls, camera-status feedback,
  and bottom-sheet container.
- `js/ui.js` owns normalized detail content, observed/simulated grouping, provenance text,
  keyboard focus restoration, and workflow actions.
- `styles.css` owns the responsive layout, visual tokens, contrast, motion, and mobile bottom
  sheet. Scientific values remain sourced from existing state modules.

No renderer may calculate a new scientific value. It may only format or classify values
already exposed through the normalized physical-state and explainability contracts.

## 7. Data and event flow

1. Pointer, search, alert, or list action resolves a normalized selection.
2. The selection is stored through the existing selection state and emitted on the event bus.
3. The view-specific renderer highlights the target and resolves its camera destination.
4. `flyToSelection` emits `camera.fly.start`, performs the transition, then emits
   `camera.fly.settled` with the achieved semantic zoom and scale.
5. The UI builds the detail sheet from normalized domain state and explainability metadata.
6. Timeline or scenario changes refresh only simulated rows; new observations refresh only
   current-state rows. Selection and camera position remain stable.

## 8. Failure handling

- If satellite tiles fail, the existing procedural terrain remains visible and the imagery
  status reports degraded coverage without blocking navigation or place details.
- If deep-zoom vectors are unavailable, the app retains the selected coordinate and nearest
  known entity; it does not fabricate a building or road record.
- If a fly-to target lacks valid geometry, navigation falls back to its coordinate or the
  basin overview and announces the fallback.
- Camera transitions are cancelled cleanly by new pointer input. The new input becomes the
  authoritative camera state with no snap-back.
- Low-performance devices reduce flow-particle density and animation effects before reducing
  marker, boundary, or label clarity.

## 9. Accessibility and responsive behaviour

- All map controls are real buttons with Vietnamese accessible names, keyboard shortcuts,
  visible focus indicators, and at least 44 px touch targets.
- Keyboard users can pan, zoom, reset north, change tilt, select a focused result, open the
  detail sheet, and return focus to the map.
- Mobile places controls in a thumb-reachable right rail and displays place detail as a
  draggable bottom sheet. The sheet never permanently covers the selected marker.
- Motion respects `prefers-reduced-motion`; colour distinctions also have text and shape
  equivalents.

## 10. Validation and acceptance criteria

1. Satellite terrain, permanent water, simulated inundation, roads, and selected assets are
   distinguishable at basin, district, and street zoom in desktop and mobile screenshots.
2. At street zoom, roofs or road geometry remain visible beneath shallow simulated water;
   the inundation boundary and flow direction remain visible.
3. Search, map click, alert focus, and list focus all use the same fly-to contract and settle
   on the intended object without panel occlusion.
4. Wheel/pinch zoom is pointer-centred; orbit, pan, compass reset, tilt, `+`, `-`, and locate
   work using pointer, touch where available, and keyboard.
5. Every detail sheet separates current and simulated sections. Observations show source and
   timestamp; simulations show lifecycle class, scenario time, and range/depth band.
6. Missing imagery, vector, observation, or target geometry degrades explicitly and leaves
   the map navigable.
7. Existing explainability, workflow, physics, shell, UX, and end-to-end test suites pass.
8. New automated coverage verifies camera start/settled events, zoom bounds, interrupted
   transitions, selection persistence, detail-sheet honesty, keyboard navigation, and mobile
   non-occlusion.

## 11. Out of scope

- Street View or third-party panoramic imagery.
- A global globe outside the Vu Gia–Thu Bồn domain.
- New live telemetry, aerial imagery, geocoding services, or routing data sources.
- Changes to hydraulic calculations, forecasts, decision authority, or warning logic.
