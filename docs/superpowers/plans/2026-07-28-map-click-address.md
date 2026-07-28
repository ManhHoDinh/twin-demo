# Map Click Address Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show immediate coordinates, an asynchronously resolved address using the new post-merger Da Nang commune/ward names, and persistent selected-location feedback for every supported map selection.

**Architecture:** Add a dependency-free `FT.address` service that wraps reverse geocoding, canonical administrative normalization, cache, and honest fallback. Keep request lifecycle in the place-sheet controller so stale responses cannot overwrite a newer selection. Reflect selection through semantic DOM attributes and CSS without changing simulation or camera contracts.

**Tech Stack:** Browser JavaScript, existing `FT` event bus and data model, OpenStreetMap Nominatim reverse API, CSS, Node.js Playwright tests.

---

## File Structure

- Create `js/address.js`: address lookup service, canonical administrative mapping, cache, formatter, fallback.
- Modify `index.html`: load the service before UI and shell code and bump affected cache versions.
- Modify `js/ui.js`: expose normalized longitude/latitude in the place-detail view model.
- Modify `js/shell.js`: render address status, manage abort/token lifecycle, and clear selection state on close.
- Modify `js/scene3d.js`: synchronize selected label semantics without hiding gauge alert state.
- Modify `styles.css`: selected-label/action styling and responsive address wrapping.
- Modify `tests/earth-map.mjs`: deterministic Playwright coverage for lookup, stale requests, cache, fallback, and visual state.

### Task 1: Address Service Contract

**Files:**
- Create: `js/address.js`
- Modify: `index.html:523`
- Test: `tests/earth-map.mjs`

- [ ] **Step 1: Write a failing service test**

Add a Playwright check that stubs `fetch`, calls `FT.address.lookup` for a point returned as legacy `Duy Chau, Duy Xuyen, Quang Nam`, and expects `Xã Thu Bồn, Thành phố Đà Nẵng`, `status === "resolved"`, and no obsolete province/district suffix.

```js
const first = await FT.address.lookup({ longitude: 108.114, latitude: 15.741 });
return {
  text: first.text,
  unit: first.administrativeUnit,
  status: first.status,
};
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node tests/earth-map.mjs`

Expected: FAIL because `FT.address` is undefined.

- [ ] **Step 3: Implement the service**

Create an IIFE that attaches `FT.address` and defines:

```js
FT.address = {
  lookup({ longitude, latitude, signal } = {}) {},
  clearCache() {},
  normalizeAdministrative(address = {}) {},
};
```

Implement finite-coordinate validation, five-decimal cache keys, one Nominatim request using `format=jsonv2&addressdetails=1&accept-language=vi`, response sanitization, a Resolution 1659 legacy-to-new mapping for the map domain, and result objects with `resolved`, `approximate`, or `unavailable` status. Use `D.PLACES` only for named-place fallback and never invent a street or exact unit from centroid distance.

- [ ] **Step 4: Load the service and rerun**

Add `<script src="./js/address.js?v=128"></script>` after `data.js` and before `ui.js`/`shell.js`.

Run: `node tests/earth-map.mjs`

Expected: the new service check passes and existing checks remain green.

- [ ] **Step 5: Commit**

```bash
git add js/address.js index.html tests/earth-map.mjs
git commit -m "feat: add Da Nang address lookup service"
```

### Task 2: Place Sheet Address Lifecycle

**Files:**
- Modify: `js/ui.js:203`
- Modify: `js/shell.js:309`
- Test: `tests/earth-map.mjs:454`

- [ ] **Step 1: Write failing place-sheet lifecycle tests**

Extend the sheet reader with `address: text('[data-place-field="address"]')`. Stub `FT.address.lookup` with controllable promises and assert:

```js
FT.explain.select(firstSelection);
const loading = readSheet().address;
FT.explain.select(secondSelection);
resolveFirst({ status: 'resolved', text: 'Địa chỉ cũ' });
resolveSecond({ status: 'resolved', text: 'Xã Thu Bồn, Thành phố Đà Nẵng' });
await waitFrame();
const finalAddress = readSheet().address;
```

Expected: loading contains `Đang tìm địa chỉ`, and the final text contains `Xã Thu Bồn` but not `Địa chỉ cũ`.

- [ ] **Step 2: Run and confirm failure**

Run: `node tests/earth-map.mjs`

Expected: FAIL because the address row and lookup lifecycle do not exist.

- [ ] **Step 3: Add geographic fields to the view model**

Refactor coordinate resolution into a helper returning `{ longitude, latitude, xKm, yKm }`. Keep `coordinates` unchanged and add:

```js
location: {
  longitude: resolved.longitude,
  latitude: resolved.latitude,
  xKm: resolved.xKm,
  yKm: resolved.yKm,
},
```

- [ ] **Step 4: Implement address rendering and stale-response protection**

Add a dedicated address element with `data-place-field="address"`, `aria-live="polite"`, and these controller fields:

```js
let addressRequestId = 0;
let addressController = null;
```

On render, show `Đang tìm địa chỉ...`, abort the previous controller, increment the request id, call `FT.address.lookup`, and update only if the id and active selection still match. On close, abort, increment the id, clear `activePlaceSelection`, and emit or apply selection clearing.

- [ ] **Step 5: Run the focused test**

Run: `node tests/earth-map.mjs`

Expected: immediate-coordinate, loading, resolved-address, and stale-response checks pass.

- [ ] **Step 6: Commit**

```bash
git add js/ui.js js/shell.js tests/earth-map.mjs
git commit -m "feat: show click address in place details"
```

### Task 3: Cache and Honest Failure States

**Files:**
- Modify: `js/address.js`
- Modify: `js/shell.js`
- Test: `tests/earth-map.mjs`

- [ ] **Step 1: Write failing cache and fallback tests**

Call the same rounded coordinate twice and assert one fetch. Then reject fetch and assert coordinates remain visible while the address is either `Gần <known place>...` with `data-address-status="approximate"` or `Chưa xác định được địa chỉ` with `data-address-status="unavailable"`.

- [ ] **Step 2: Run and confirm failure**

Run: `node tests/earth-map.mjs`

Expected: FAIL on request count or missing explicit status.

- [ ] **Step 3: Complete caching and status propagation**

Cache resolved and approximate result promises by rounded coordinate, remove failed in-flight entries, and place `result.status` on the address DOM node. Do not retry automatically. Treat abort separately so a stale selection does not render an error.

- [ ] **Step 4: Run focused verification**

Run: `node tests/earth-map.mjs`

Expected: cache, approximate, unavailable, and abort cases pass.

- [ ] **Step 5: Commit**

```bash
git add js/address.js js/shell.js tests/earth-map.mjs
git commit -m "fix: keep address fallbacks truthful and cached"
```

### Task 4: Persistent Selected-Location Feedback

**Files:**
- Modify: `js/scene3d.js:893`
- Modify: `js/shell.js:436`
- Modify: `styles.css:334`
- Test: `tests/earth-map.mjs`

- [ ] **Step 1: Write a failing semantic selection test**

Select a gauge through `FT.explain.select`, move focus to the close button, and verify the corresponding `.label3d` retains `aria-pressed="true"` and `data-selected="true"`. Close the sheet and verify the attributes clear. Repeat with a second selection and assert only one label is selected.

- [ ] **Step 2: Run and confirm failure**

Run: `node tests/earth-map.mjs`

Expected: FAIL because label state currently follows only focus and alert classes.

- [ ] **Step 3: Synchronize semantic state**

In the label builder, initialize selectable buttons with `aria-pressed="false"`. On `explainSelection`, compare kind/id and set:

```js
label.el.dataset.selected = selected ? 'true' : 'false';
label.el.setAttribute('aria-pressed', String(selected));
```

Clear the explain selection when the sheet closes so map and sheet state stay aligned.

- [ ] **Step 4: Add intentional Earth-style visuals**

Add a cyan/teal selected background, readable foreground, inset highlight, and outer ring. Use attribute selectors so gauge alert classes remain intact. Keep `:focus-visible` as a separate outline and disable transitions under reduced motion.

- [ ] **Step 5: Run desktop and mobile checks**

Run: `node tests/earth-map.mjs`

Expected: semantic selection and responsive sheet checks pass.

- [ ] **Step 6: Commit**

```bash
git add js/scene3d.js js/shell.js styles.css tests/earth-map.mjs
git commit -m "fix: highlight the active map location"
```

### Task 5: End-to-End Verification and Publish

**Files:**
- Modify if needed: files from Tasks 1-4 only

- [ ] **Step 1: Run focused suites**

```bash
npm run test:earth-map
npm run test:explainability
npm run shell
```

Expected: all checks pass with no failed assertions.

- [ ] **Step 2: Run the complete repository suite**

Run: `npm test`

Expected: every documentation, explainability, comparison, E2E, UX, shell, Earth-map, and physics check passes.

- [ ] **Step 3: Perform Playwright visual inspection**

Start `npm run serve`, inspect desktop and mobile selections, and capture evidence that coordinates, long Vietnamese addresses, selected color, satellite imagery, water, and camera controls remain legible. Check browser console and failed network requests. Do not commit generated screenshots or browser artifacts.

- [ ] **Step 4: Run anti-slop cleanup**

Use the repository diff to remove generic copy, redundant badges, noisy effects, accidental purple styling, awkward wrapping, and inconsistent focus/selection states without expanding scope.

- [ ] **Step 5: Verify repository state and commit final adjustments**

```bash
git status --short
git diff --check
git add index.html js/address.js js/ui.js js/shell.js js/scene3d.js styles.css tests/earth-map.mjs
git commit -m "test: verify map address interactions"
```

Skip the commit if there are no final changes.

- [ ] **Step 6: Rebase-safe main verification and push**

```bash
git status --short --branch
git pull --rebase origin main
npm test
git push origin main
git status --short --branch
```

Expected: local `main` and `origin/main` point to the same commit, the worktree is clean, and the post-rebase full suite passes.
