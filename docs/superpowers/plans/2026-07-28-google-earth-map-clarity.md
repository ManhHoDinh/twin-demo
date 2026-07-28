# Google Earth-style Map Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Earth-style satellite map experience with clear observed-versus-simulated water, predictable 2D/3D navigation, shared fly-to behavior, and detailed place inspection on desktop and mobile.

**Architecture:** Extend the existing map renderers rather than replacing them. `scene3d.js` and `map2d.js` expose a small shared navigation surface, `shell.js` owns Earth controls and the responsive place sheet, and `ui.js` supplies normalized, scientifically honest place content. Browser tests exercise observable interactions and screenshots while existing physics and explainability contracts guard scientific behavior.

**Tech Stack:** Static HTML/CSS/JavaScript, Three.js with OrbitControls, Canvas 2D, Playwright, Node.js test runners.

---

## File map

- Modify `js/scene3d.js`: semantic fly-to, zoom/tilt/north controls, camera events, close-range water clarity, selection marker feedback.
- Modify `js/map2d.js`: semantic fly-to parity, zoom controls, selection pulse, pointer/touch navigation feedback.
- Modify `js/shell.js`: Earth navigation rail, camera status/scale UI, unified selection-to-fly routing, place-sheet container.
- Modify `js/ui.js`: normalized place-detail view model and observed/simulated sections.
- Modify `styles.css`: Earth visual language, controls, water/selection labels, bottom sheet, responsive layout.
- Modify `index.html`: persistent map status and place-sheet semantic hosts only where shell runtime creation is unsuitable.
- Create `tests/earth-map.mjs`: focused browser contract for controls, fly-to, scientific labels, interruption, and mobile layout.
- Modify `package.json`: add `test:earth-map` and include it in the full test command.
- Modify `tests/shell-layout.mjs`: account for the new non-overlapping Earth controls and place sheet.

### Task 1: Lock the Earth control and fly-to contract

**Files:**
- Create: `tests/earth-map.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing browser test for Earth controls**

Create a Playwright test using the existing `tests/harness.mjs` helpers. Assert that the app exposes buttons with `data-earth-action="zoom-in|zoom-out|north|tilt|locate"`, that each has a Vietnamese accessible name, and that the camera status host exists.

```js
await check('Earth controls expose accessible navigation actions', async () => {
  return page.evaluate(() => {
    const actions = ['zoom-in', 'zoom-out', 'north', 'tilt', 'locate'];
    const controls = actions.map((action) => document.querySelector(`[data-earth-action="${action}"]`));
    return controls.every((control) => control
      && control.tagName === 'BUTTON'
      && control.getAttribute('aria-label')
      && control.getBoundingClientRect().width >= 40
      && control.getBoundingClientRect().height >= 40)
      && !!document.getElementById('earthCameraStatus');
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node tests/earth-map.mjs`

Expected: FAIL because the Earth action buttons and `#earthCameraStatus` do not exist.

- [ ] **Step 3: Add the focused npm command**

Add to `package.json`:

```json
"test:earth-map": "node tests/earth-map.mjs"
```

Append `npm run test:earth-map` to the existing `test` script after the shell tests and before physics.

- [ ] **Step 4: Run JSON syntax validation**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"`

Expected: `package ok`.

- [ ] **Step 5: Commit the red contract**

```bash
git add package.json tests/earth-map.mjs
git commit -m "test: define Earth map interaction contract"
```

### Task 2: Implement semantic 3D camera navigation

**Files:**
- Modify: `tests/earth-map.mjs`
- Modify: `js/scene3d.js`
- Modify: `js/shell.js`
- Modify: `styles.css`

- [ ] **Step 1: Add failing tests for camera actions and events**

Extend `tests/earth-map.mjs` to record `camera.fly.start` and `camera.fly.settled`, click the `zoom-in`, `north`, `tilt`, and `locate` buttons, and assert that:

```js
const result = await page.evaluate(async () => {
  const events = [];
  FT.bus.on('camera.fly.start', (event) => events.push(['start', event.intent]));
  FT.bus.on('camera.fly.settled', (event) => events.push(['settled', event.intent]));
  FT.scene3d.flyToSelection({ kind: 'point', xKm: 58, yKm: 63 }, { intent: 'asset' });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return { events, camera: FT.scene3d.cameraState() };
});
return result.events.some(([type]) => type === 'start')
  && result.events.some(([type]) => type === 'settled')
  && result.camera.distance > 0
  && Number.isFinite(result.camera.bearing)
  && Number.isFinite(result.camera.tilt);
```

- [ ] **Step 2: Run and verify RED**

Run: `node tests/earth-map.mjs`

Expected: FAIL because `flyToSelection()` and `cameraState()` are undefined.

- [ ] **Step 3: Implement the minimal 3D camera API**

In `js/scene3d.js`, add:

```js
const INTENT_DISTANCE = { overview: 120, district: 46, asset: 16, street: 5.5 };

S3.cameraState = function () {
  if (!camera || !controls) return null;
  const offset = camera.position.clone().sub(controls.target);
  return {
    distance: offset.length(),
    bearing: Math.atan2(offset.x, offset.z),
    tilt: Math.acos(U.clamp(offset.y / Math.max(0.001, offset.length()), -1, 1)),
    target: { xKm: controls.target.x, yKm: controls.target.z },
  };
};

S3.flyToSelection = function (selection, options = {}) {
  if (!camera || !selection) return false;
  const intent = options.intent || 'asset';
  const xKm = selection.xKm;
  const yKm = selection.yKm;
  if (!Number.isFinite(xKm) || !Number.isFinite(yKm)) return false;
  const terrainY = elevToY(Math.max(1, terrAt(xKm, yKm)));
  const distance = INTENT_DISTANCE[intent] || INTENT_DISTANCE.asset;
  flyFrom = { pos: camera.position.clone(), tgt: controls.target.clone() };
  flyTo = {
    pos: [xKm + distance * 0.55, terrainY + distance * 0.48, yKm + distance * 0.68],
    tgt: [xKm, terrainY, yKm],
    intent,
  };
  flyT = 0;
  FT.bus.emit('camera.fly.start', { selection, intent });
  return true;
};
```

Emit `camera.fly.settled` exactly once when animation reaches one. Cancel the active fly on OrbitControls `start` so manual input never snaps back.

- [ ] **Step 4: Build the Earth control rail**

In `js/shell.js`, create one `.earthNav` group containing five real buttons. Route actions through view-specific renderer methods:

```js
function activeMap() {
  return FT.state.view === '2d' ? FT.map2d : FT.scene3d;
}

const earthActions = {
  'zoom-in': () => activeMap().zoomStep(1),
  'zoom-out': () => activeMap().zoomStep(-1),
  north: () => activeMap().resetNorth(),
  tilt: () => activeMap().toggleTilt(),
  locate: () => FT.navigation.locateSelection(),
};
```

Create `#earthCameraStatus` as a polite status region and update it on fly start/settled.

- [ ] **Step 5: Style controls and verify GREEN**

Add `.earthNav`, `.earthCompass`, `.earthCameraStatus`, hover, active, focus-visible, reduced-motion, and mobile rules in `styles.css`. Each control must be at least 44 px square.

Run: `node tests/earth-map.mjs && npm run shell`

Expected: Earth camera and existing shell suites PASS.

- [ ] **Step 6: Commit**

```bash
git add js/scene3d.js js/shell.js styles.css tests/earth-map.mjs
git commit -m "feat: add Earth-style camera navigation"
```

### Task 3: Add 2D navigation parity and shared selection routing

**Files:**
- Modify: `tests/earth-map.mjs`
- Modify: `js/map2d.js`
- Modify: `js/shell.js`
- Modify: `js/ui.js`

- [ ] **Step 1: Add failing tests for 2D zoom and shared fly-to**

Switch to 2D, call `FT.map2d.cameraState()`, click zoom in, and assert scale increases. Then send a normalized point through `FT.navigation.flyToSelection()` and assert `camera.fly.start` and `camera.fly.settled` fire with `view: '2d'`.

```js
const before = await page.evaluate(() => FT.map2d.cameraState().scale);
await page.click('[data-earth-action="zoom-in"]');
const after = await page.evaluate(() => FT.map2d.cameraState().scale);
return after > before;
```

- [ ] **Step 2: Run and verify RED**

Run: `node tests/earth-map.mjs`

Expected: FAIL because the 2D camera API and shared navigation object do not exist.

- [ ] **Step 3: Implement the 2D camera API**

In `js/map2d.js`, expose:

```js
M.cameraState = () => ({ xKm: cam.x, yKm: cam.y, scale: cam.scale, metresPerPixel: 1000 / cam.scale });
M.zoomStep = (direction) => { cam.scale *= direction > 0 ? 1.55 : 1 / 1.55; clampCam(); };
M.resetNorth = () => true;
M.toggleTilt = () => false;
M.flyToSelection = (selection, options = {}) => {
  const scaleByIntent = { overview: minScale, district: 45, asset: 180, street: 1800 };
  const targetScale = Math.max(minScale, scaleByIntent[options.intent || 'asset']);
  return startCameraTween(selection.xKm, selection.yKm, targetScale, options.intent || 'asset');
};
```

Use one requestAnimationFrame camera tween instead of changing camera values instantly. New pointer input cancels the tween and emits a cancelled settlement state.

- [ ] **Step 4: Add shared navigation routing**

In `js/shell.js`, expose `FT.navigation.flyToSelection(selection, options)` and
`FT.navigation.locateSelection()`. Resolve reservoir, gauge, and zone IDs to coordinates from
existing data before calling the active renderer. Update command palette results and zone
focus actions to use this route.

- [ ] **Step 5: Verify GREEN**

Run: `node tests/earth-map.mjs && node tests/shell-interactions.mjs && node tests/explainability.mjs`

Expected: all suites PASS and selection focus restoration remains intact.

- [ ] **Step 6: Commit**

```bash
git add js/map2d.js js/shell.js js/ui.js tests/earth-map.mjs
git commit -m "feat: unify map fly-to navigation"
```

### Task 4: Clarify permanent water, simulated inundation, and flow

**Files:**
- Modify: `tests/earth-map.mjs`
- Modify: `js/scene3d.js`
- Modify: `js/map2d.js`
- Modify: `styles.css`

- [ ] **Step 1: Add failing renderer-state tests**

Expose presentation state only, not scientific calculations. Test that close-range 3D water
has lower fill opacity while maintaining boundary and flow visibility, and that 2D reports
separate permanent-water and simulation styles.

```js
const presentation = await page.evaluate(() => ({
  three: FT.scene3d.waterPresentation(),
  two: FT.map2d.waterPresentation(),
}));
return presentation.three.simulation.label.includes('MÔ PHỎNG')
  && presentation.three.closeOpacity < presentation.three.farOpacity
  && presentation.three.boundaryOpacity >= 0.7
  && presentation.two.permanent.color !== presentation.two.simulation.color;
```

- [ ] **Step 2: Run and verify RED**

Run: `node tests/earth-map.mjs`

Expected: FAIL because presentation accessors and separate styling are missing.

- [ ] **Step 3: Implement 3D water clarity**

Extend the existing water shader with distinct close-range fill, high-contrast edge, and flow
strength uniforms. Keep `uGhost` distance-driven, but never let edge alpha or flow alpha fall
below `0.72`. Expose constant presentation metadata through `S3.waterPresentation()`.

- [ ] **Step 4: Implement 2D water clarity**

Adjust `buildWater()` and render composition so permanent sea/river water uses dark natural
blue, simulated cells use the depth ramp, and deep zoom reduces simulated fill alpha while
adding a cyan boundary pass. Increase flow-particle contrast with a dark shadow rather than
increasing particle count.

- [ ] **Step 5: Add the persistent simulation label**

Use `#earthCameraStatus`'s adjacent overlay host or create `.earthLayerLabel` in `shell.js`.
It must display lifecycle, scenario-relative time, and current layer state without implying
that satellite imagery is live.

- [ ] **Step 6: Verify GREEN and visual regressions**

Run: `node tests/earth-map.mjs && node tests/e2e.mjs --quick && node tests/ux-audit.mjs`

Expected: focused and existing UX tests PASS.

- [ ] **Step 7: Commit**

```bash
git add js/scene3d.js js/map2d.js js/shell.js styles.css tests/earth-map.mjs
git commit -m "feat: clarify simulated water on satellite terrain"
```

### Task 5: Build Google Earth-style place detail

**Files:**
- Modify: `tests/earth-map.mjs`
- Modify: `js/ui.js`
- Modify: `js/shell.js`
- Modify: `js/map2d.js`
- Modify: `js/scene3d.js`
- Modify: `styles.css`

- [ ] **Step 1: Add failing scientific-honesty tests for the place sheet**

Select a gauge and a terrain point. Assert `#earthPlaceSheet` opens, current and simulation
sections are distinct, current values contain source and timestamp, simulation contains a
lifecycle label plus `T+`, and a point with missing observations displays
`Không có số đo hiện tại`.

```js
const detail = await page.evaluate(() => ({
  open: !document.getElementById('earthPlaceSheet').hidden,
  observed: document.querySelector('[data-place-section="observed"]')?.innerText,
  simulated: document.querySelector('[data-place-section="simulated"]')?.innerText,
}));
return detail.open
  && /HIỆN TRẠNG/.test(detail.observed)
  && /(Nguồn|Source)/.test(detail.observed)
  && /(T\+|MÔ PHỎNG)/.test(detail.simulated);
```

- [ ] **Step 2: Run and verify RED**

Run: `node tests/earth-map.mjs`

Expected: FAIL because `#earthPlaceSheet` and normalized place sections do not exist.

- [ ] **Step 3: Create a normalized place-detail view model**

In `js/ui.js`, add `UI.placeDetail(selection, snap)` returning:

```js
{
  id, kind, name, type, coordinates,
  observed: { available, label, value, timestamp, source, freshness },
  simulated: { available, label, value, timeLabel, lifecycle, uncertainty },
  actions: { canRoute, canOrbit, canFly },
}
```

Build it only from existing world, normalized physical-state, and explainability data. Never
derive a replacement observation from simulated state.

- [ ] **Step 4: Render the place sheet**

In `shell.js`, create `#earthPlaceSheet` with name, type, coordinates, observed section,
simulated section, provenance, and `Bay tới`, `Orbit quanh điểm`, plus context route action.
Use DOM creation and text content for values; do not interpolate untrusted names into HTML.

- [ ] **Step 5: Connect selection and marker feedback**

Map click, 3D ray selection, search result, alert, gauge, reservoir, and zone focus must emit
the same normalized selection. Both renderers show a one-shot blue pulse around the selected
target, and the detail sheet remains synced while the timeline changes.

- [ ] **Step 6: Verify GREEN**

Run: `node tests/earth-map.mjs && node tests/explainability.mjs && node tests/e2e.mjs --quick`

Expected: place-sheet, explainability, and quick workflow tests PASS.

- [ ] **Step 7: Commit**

```bash
git add js/ui.js js/shell.js js/map2d.js js/scene3d.js styles.css tests/earth-map.mjs
git commit -m "feat: add Earth-style place inspection"
```

### Task 6: Complete responsive layout and full verification

**Files:**
- Modify: `tests/earth-map.mjs`
- Modify: `tests/shell-layout.mjs`
- Modify: `styles.css`
- Modify: `docs/superpowers/plans/2026-07-28-google-earth-map-clarity.md`

- [ ] **Step 1: Add failing mobile non-occlusion and keyboard tests**

At 390x844, select an object and assert the place sheet fits the viewport, the selected
marker target remains outside the sheet, Earth controls remain reachable, and Escape closes
the sheet and restores focus to the map. Test `+`, `-`, north, tilt, locate, and arrow-key pan.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/earth-map.mjs`

Expected: FAIL on mobile placement or keyboard behavior until responsive rules are complete.

- [ ] **Step 3: Implement mobile and reduced-motion rules**

Use a draggable-height bottom sheet with a default maximum of 44vh, a compact right-side
control rail, safe-area offsets, and a map padding calculation that keeps the selected point
above the sheet. Under `prefers-reduced-motion`, camera transitions complete immediately and
selection feedback uses a static ring.

- [ ] **Step 4: Update shell collision coverage**

Add `.earthNav`, `.earthLayerLabel`, `#earthCameraStatus`, and `#earthPlaceSheet` to the shell
layout inventory. Assert they do not overlap the command bar, persistent operations strip,
timeline, or each other in desktop and mobile states.

- [ ] **Step 5: Run focused verification**

Run:

```bash
npm run test:earth-map
npm run shell
node tests/explainability.mjs
node tests/ux-audit.mjs
node tests/e2e.mjs --quick
```

Expected: all focused suites PASS with no browser console errors.

- [ ] **Step 6: Run full verification**

Run: `npm test`

Expected: documentation, workflow, explainability, E2E, UX, shell, Earth map, and physics
suites all PASS.

- [ ] **Step 7: Inspect the final diff and preserve overlapping work**

Run:

```bash
git diff --check
git status --short
git diff -- js/scene3d.js js/map2d.js js/shell.js js/ui.js styles.css index.html package.json tests/earth-map.mjs tests/shell-layout.mjs
```

Confirm no `.omc`, `.playwright-cli`, `.superpowers`, `artifacts`, `output`, or unrelated
engineering-document changes are staged.

- [ ] **Step 8: Commit the responsive closeout**

```bash
git add styles.css tests/earth-map.mjs tests/shell-layout.mjs docs/superpowers/plans/2026-07-28-google-earth-map-clarity.md
git commit -m "test: verify Earth map experience end to end"
```
