# Map Click Address and New Da Nang Administrative Names

Date: 2026-07-28

## Goal

When a user selects a point or mapped asset, show its longitude, latitude, and a useful address without delaying the existing scientific place detail. Administrative names must use the commune/ward structure of the expanded Da Nang municipality that has operated since 1 July 2025, including former Quang Nam territory. The selected map label or action remains visibly highlighted until the selection changes or closes.

## Scope

- Preserve the current Google Earth-like 2D/3D map, camera navigation, simulation values, and explainability contract.
- Add a dedicated `Dia chi` field to the place sheet while retaining the existing coordinate field.
- Support point, gauge, reservoir, zone, and other selectable map assets that have geographic coordinates.
- Cover the current Vu Gia - Thu Bon map domain. Do not expand the simulation domain or add search, directions, or editing.

## Administrative Authority

Canonical commune and ward names come from Resolution 1659/NQ-UBTVQH15, published by the Government Electronic Newspaper on 16 June 2025:

https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-quyet-so-1659-nq-ubtvqh15-sap-xep-cac-dvhc-cap-xa-cua-thanh-pho-da-nang-nam-2025-119250616202714604.htm

The application stores a small, versioned whitelist and legacy-to-new mapping for administrative units intersecting the map domain. Examples include `phuong Hoa Cuong`, `phuong Dien Ban`, `phuong Hoi An`, `xa Hoa Vang`, `xa Hoa Tien`, `xa Ba Na`, `xa Nam Phuoc`, `xa Duy Xuyen`, `xa Thu Bon`, `xa Dien Ban Tay`, `xa Go Noi`, `xa Dai Loc`, `xa Ha Nha`, `xa Thuong Duc`, `xa Vu Gia`, and `xa Phu Thuan`.

External geocoder text is evidence for roads, hamlets, landmarks, and locality detail, but it is not authoritative for the canonical commune/ward label. A legacy district, town, commune, or ward returned by the provider must be translated through the local mapping before display. Unknown or ambiguous legacy names must not be promoted as a canonical new administrative unit.

## Architecture

Add a focused `FT.address` browser service with this public shape:

```js
FT.address.lookup({ longitude, latitude, signal })
// Promise<{ status, text, administrativeUnit, source, approximate }>
```

The service owns:

- coordinate validation and cache-key rounding;
- reverse-geocoder requests;
- administrative-name normalization;
- local fallback selection;
- explicit `resolved`, `approximate`, and `unavailable` results.

The UI owns request lifecycle and rendering. It starts a lookup after rendering coordinates, aborts or invalidates the previous request when selection changes, and only applies a response whose request token still matches the active selection.

## Data Flow

1. A map click creates the existing explainability selection.
2. The place sheet renders immediately with name, type, latitude, longitude, and local model coordinates.
3. The address row shows `Dang tim dia chi...` and begins reverse geocoding.
4. The provider result is sanitized and combined with the canonical new commune/ward name.
5. The address row updates in place without moving the camera, changing focus, or rebuilding simulation sections.
6. Successful and approximate results are cached by coordinates rounded to five decimal places.

The first provider is OpenStreetMap Nominatim `reverse` with Vietnamese output and address details. Requests are limited to user selections, deduplicated by cache, and never issued continuously during pointer movement or camera animation.

## Address Rules

- Prefer a provider-supplied road, hamlet, neighbourhood, landmark, or house number when present.
- Append exactly one canonical new commune/ward and `Thanh pho Da Nang`.
- Remove duplicated administrative fragments and obsolete district/province labels such as `Quang Nam`, `Quan ...`, `Huyen ...`, or `Thi xa Dien Ban` from the canonical suffix.
- If the provider returns a recognized new unit directly, keep its official type and name.
- If the provider fails but the nearest known local place is within a conservative threshold, show `Gan <place>, <canonical unit>, Thanh pho Da Nang` and mark the result approximate.
- If neither provider nor local evidence is sufficient, show `Chua xac dinh duoc dia chi` while retaining coordinates.
- Never infer a street, house number, or exact administrative unit solely from nearest-centroid distance.

Vietnamese UI strings use full diacritics in implementation. ASCII is used in this document only where identifiers or examples benefit from portability.

## Selection Feedback

Selectable 3D labels and equivalent map actions receive a semantic selected state using `aria-pressed` and a `data-selected` attribute. The selected state uses the existing cyan/teal Earth accent with stronger background, border, and legibility than hover. Keyboard focus remains a separate visible outline. Selection styling clears when another location is chosen or the place sheet closes.

The color change must not overwrite gauge alert colors. A selected gauge receives an accent ring/background while its alert text and border remain recognizable.

## Error, Privacy, and Rate Handling

- Use `AbortController` where supported and a monotonically increasing request token everywhere.
- Treat timeout, network, rate-limit, malformed payload, and out-of-domain responses as recoverable failures.
- Send only the clicked coordinate and language parameters. Do not send simulation, user, scenario, or operational data.
- Keep the cache in memory for the page session; do not persist click history.
- Make no more than one external request per uncached selection and avoid automatic retries.

## Accessibility and Responsive Behavior

- Announce address loading and completion through the existing place-sheet region without stealing focus.
- Keep the close button and place actions keyboard operable.
- Allow long Vietnamese addresses to wrap without horizontal scrolling on mobile.
- Preserve reduced-motion behavior and the current compact mobile sheet.

## Verification

Unit-style browser tests cover coordinate extraction, canonical-name normalization, cache hits, provider failures, approximate fallback, and stale-response rejection.

Playwright coverage verifies:

- coordinates appear immediately after a map selection;
- the address progresses from loading to a canonical new Da Nang ward/commune;
- an older delayed response cannot replace a newer selection;
- repeated selection uses the cache;
- offline/provider failure leaves coordinates visible and shows an honest fallback;
- the selected label/action keeps its color across focus changes and clears on close/change;
- desktop and mobile layouts remain readable;
- existing fly, zoom, orbit, scientific values, and explainability journeys still pass.

The full repository test suite and the anti-slop visual audit must pass before commit and push to `main`.

## Acceptance Criteria

- Every supported click immediately shows latitude and longitude to five decimal places.
- Resolved addresses use the new post-merger Da Nang commune/ward name and never present an obsolete unit as canonical.
- Failure states remain truthful and usable without network access.
- Selection color is persistent, accessible, and does not hide flood-alert meaning.
- No regression occurs in camera navigation, scientific data, desktop/mobile layout, or existing Playwright tests.
