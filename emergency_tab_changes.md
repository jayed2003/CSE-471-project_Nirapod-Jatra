# Emergency Tab — Changes Implemented

Documentation of all functional and UI changes made to the **Emergency tab** (`/emergency`) during this work session. Scoped only to this feature — see `changes_implemented.md` for other members' work.

---

## 1. Fixed the blank map on the Emergency tab

**Files:** `src/components/map-preview.tsx`

- The "Nearby now" map was rendering completely blank (no tiles, no labels) — root cause was the hosted vector-tile style (`tiles.openfreemap.org`) silently failing to load tiles/glyphs in this dev environment.
- Switched `MapPreview` to the same raster OpenStreetMap tile source already working reliably on the Home/Planner map (`RoutingMap.tsx`), instead of the vector style.
- Verified via headless-browser screenshot: streets, buildings, and place-name labels now render correctly with the "You are here" marker.

---

## 2. Fixed the map popup close button covering the location label

**Files:** `src/app/globals.css`

- The global `.subpage button` rule (amber background, padding) was unintentionally styling MapLibre's own popup close button (`<button class="maplibregl-popup-close-button">`), turning it into a large amber block that covered the "You are here" text.
- Added a scoped, `!important`-based reset for `.maplibregl-popup-close-button` and `.maplibregl-popup-content` so the map's own UI is no longer hijacked by page-wide button styling. The close button is now a small, unobtrusive circular `×`.

---

## 3. New "Emergency services nearby" panel

**Files:** `server/warnings.ts`, `server/index.ts`, `src/components/EmergencyServicesPanel.tsx`, `src/app/emergency/page.tsx`, `src/app/globals.css`

- New backend endpoint **`GET /api/emergency-services/nearby?lat=&lng=&radius=`** that queries OpenStreetMap's Overpass API for **hospitals/clinics**, **fire stations**, **ambulance stations**, and **police** within the given radius (clamped **50–400 m**).
- `nearbyEmergencyServices()` in `server/warnings.ts`:
  - Computes real distances (haversine), extracts phone numbers from OSM tags (`phone`, `contact:phone`, `mobile`, `contact:mobile`, `emergency:phone`).
  - Dedupes near-duplicate OSM entries for the same physical building (same category within 60 m), preferring the entry that has a phone number.
  - Categorizes results into `hospital`, `fire`, `ambulance`, `police` (pharmacies intentionally excluded per feature scope).
- New component `EmergencyServicesPanel.tsx`, rendered below the map on the Emergency tab, grouped into **Hospitals**, **Fire services**, **Ambulance services**, **Other emergency services** — each entry shows name, distance, and tap-to-call phone number(s), or "No number listed" if OSM has none.
- A single **National Emergency Hotline (999)** card sits at the top of the panel as the one general fallback — no per-service hotline repetition.

---

## 4. Reliability fixes for the Overpass lookup (range-verification bugfix)

**Files:** `server/warnings.ts`

- **Found and fixed a real bug:** when the public Overpass API mirrors were slow/overloaded, the lookup silently returned an **empty result** — indistinguishable from a confirmed "nothing within range." (Proved with a live repro: a 200 m query returned 0 results, and an identical retry immediately after found 2 real hospitals.)
- Rewrote the mirror strategy to query all Overpass mirrors **in parallel** and take whichever responds first (`firstSuccessful`), instead of trying them one at a time.
- Added a **3-minute in-memory cache** keyed by `(lat, lng, radius)` rounded to a ~110 m grid, so repeat lookups (page reloads, refresh-location clicks) don't re-hammer an already-struggling mirror.
- The endpoint now returns a **`degraded`** flag. When the live lookup fails/times out, the API serves a stale cache entry if available and flags the response as degraded, rather than a hard empty list.
- Frontend shows a **"Live lookup was slow — results may be incomplete"** banner with a **Retry** button whenever `degraded: true`, instead of falsely claiming a category has nothing nearby.
- Verified radius filtering is mathematically correct at multiple radii (100 m / 200 m / 400 m) against real Dhaka hospital data — smaller radii are always a strict subset of larger ones once a live (non-degraded) result is returned.

---

## 5. Call-confirmation dialog for every phone number

**Files:** `src/components/EmergencyServicesPanel.tsx`, `src/app/globals.css`

- Clicking any phone number (the top hotline card **or** a per-service listed number) no longer dials immediately — it opens a confirmation dialog: **"Call {name}? You're about to dial {number}."** with **Cancel** / **Call** buttons.
- Reuses the app's existing `.confirm-overlay` / `.confirm-dialog` pattern (same one used for trip cancellation and risk acknowledgement) for visual consistency.
- Verified live: dialog opens with correct title/number for both the hotline card and a real OSM-listed hospital number; Cancel and Call both close it cleanly with no JS errors.

---

## Verification performed

- `npx tsc --noEmit -p server/tsconfig.json` clean and `npx tsc --noEmit` (frontend) clean after every change.
- Live-verified via a headless-browser (Playwright + system Chrome) script driving the real dev server: map rendering, popup styling, emergency-services data (real Dhaka hospitals with distances/phones), degraded-state banner, and the call-confirmation dialog (including a real listed phone number).
- Range correctness re-verified directly against the backend after the reliability fix: 200 m / 400 m queries at the same point return consistent, correctly-bounded subsets.
