# Changes Implemented

Documentation of all functional and UI changes made to the Nirapod Jatra project during this work session.

---

## 1. Risk bars now match each factor's severity scale

**Files:** `src/components/risk-row.tsx`, `src/app/trips/page.tsx`

- Added a `total` prop to the shared `RiskRow` component (defaults to `5` so the planner is unaffected).
- The Trips safety-brief conditions card now renders scale-appropriate bars instead of always-5-segment bars:
  - **AQI** → 4 segments (Low=1, Moderate=2, High=3, Severe=4)
  - **Flood / Dengue / Weather / Unrest** → 3 segments (None=1, Watch/Active=2, Warning=3)
- Updated `riskSegments()` to map severity to the correct segment count per factor.

---

## 2. Cancel Trip option with confirmation

**Files:** `server/index.ts`, `src/app/trips/page.tsx`, `src/app/globals.css`

- New backend endpoint **`DELETE /api/trips/:id`** (auth-protected) that deletes a trip only if it belongs to the signed-in user; returns `204` on success, `404` if not found.
- The trips safety-brief preview now shows a red **Cancel trip** button on the opposite side of "Plan an updated route".
- Clicking it opens a confirmation modal: **"Are you sure you want to delete this trip?"** with **No** (closes) and **Yes** (calls the DELETE API, removes the trip from the list, and selects the next trip).
- Added styles: `.trip-detail-actions`, `.cancel-trip`, `.confirm-overlay`, `.confirm-dialog`, `.confirm-actions`, `.confirm-no`, `.confirm-yes` (stacked on mobile).

---

## 3. Planner confirmation before creating a trip

**Files:** `src/app/planner/page.tsx`, `src/app/globals.css`

- The Plan button no longer creates the trip immediately.
- It now opens a confirmation dialog: **"Confirm and create trip?"** showing the destination and travel dates.
  - **Yes** → runs the full existing flow (geocode → `POST /api/trips` → shadow-profile watcher → live conditions → travel brief).
  - **No** → nothing happens (dialog closes, no trip created).
- Added `.confirm-go` style (amber affirmative button) distinct from the destructive red `.confirm-yes`.

---

## 4. Live conditions stored at trip creation + severity-increase alerts

### 4a. Live AQI / weather stored in saved trips

**Files:** `server/risk.ts`, `server/models/Trip.ts`, `server/index.ts`

- `POST /api/trips` now fetches **live conditions** for the destination (AQI from OpenWeather `air_pollution`, weather from OpenMeteo) and stores them in `riskHistory` + the safety brief, instead of the hardcoded baseline `aqi: 45`.
- Added `fetchLiveRisk(destinationPoint)` in `server/risk.ts` with graceful fallback to `baselineRisk()` when providers fail.
- **AQI scale unified on the OpenWeather 1–5 index** (1-2 Low, 3 Moderate, 4 High, 5 Severe) across the server risk engine and the trips conditions card, matching what the planner displays. Legacy saved trips with `aqi: 45` are treated as Low (legacy guard) until their next recheck overwrites them.
- Trip schema gained `destinationPoint: [Number, Number]` (so rechecks know where to fetch live data).

### 4b. 6-hour recheck with severity-increase detection

**Files:** `server/index.ts`

- Reworked `POST /api/internal/risk-check`:
  - Due-window changed from 24h → **6h**.
  - Each due trip fetches its own live conditions (destination coords; falls back to last route coordinate).
  - Pushes a fresh `riskHistory` entry on every successful check.
  - If a factor's severity **increases** vs. the previous saved entry (AQI level rank, or Weather going from none → alert), sets `riskAlert: { factor, previous, current, createdAt }`.
  - Keeps the existing io emit + web-push notification for changed trips.
- New endpoint **`POST /api/trips/:id/acknowledge`** (auth, owner) → clears `riskAlert` (204).
- New endpoint **`GET /api/risk-alerts`** (auth) → `{ alerts: [{ tripId, destination, factor, previous, current }] }` for trips with an active, unacknowledged alert.

### 4c. Trips page warning UI

**Files:** `src/app/trips/page.tsx`, `src/app/globals.css`

- Trip cards with an active `riskAlert` get a **red caution marking** (red top bar / border).
- Clicking an alerted card shows the safety brief **and** the **"Acknowledge Risk Has Increased!"** prompt.
  - **Yes** → `POST /api/trips/:id/acknowledge`, clears the local marking, dispatches a `risk-alert:ack` window event.
  - **No** → prompt closes, marking stays.

### 4d. Sticky navbar warning banner

**Files:** `src/components/site-nav.tsx`, `src/app/globals.css`

- `SiteNav` now polls `GET /api/risk-alerts` when signed in (on mount, on path change, every 30s, and on the `risk-alert:ack` event).
- Renders a sticky red banner at the top of the viewport: **"{factor} changed to {current}"** (e.g., "AQI changed to High"), linking to `/trips`. The nav drops down while a banner is shown.

---

## 5. Weather now stored and shown live in trips

**Files:** `server/risk.ts`, `server/models/Trip.ts`, `src/app/trips/page.tsx`

- Previously the conditions card showed "No alerts" for non-severe weather. `fetchLiveRisk` now also captures:
  - `weatherDescription` (mapped from the OpenMeteo weather code, e.g., "Light drizzle")
  - `temperature`
- Fixed a bug where OpenMeteo's field was read as `temperature` instead of the actual `temperature_2m`.
- `buildBrief` now renders e.g. **"Weather: Light drizzle, 26 C"**.
- Risk-history schema persists the new `weatherDescription` / `temperature` fields (mongoose strict mode would otherwise drop them).
- The conditions Weather row now mirrors the planner: value shows temperature, state shows the live description; the severity bar only rises for genuine severe weather.

---

## 6. Trip card readability (white cards)

**Files:** `src/app/globals.css`

- Fixed the unselected trip cards showing an orange background: the global `.subpage button` rule (amber) was overriding `.trip-card` because the cards are `<button>` elements.
- Added higher-specificity rules scoped to the trips page (`.trips-page .trip-card`) so unselected cards are **near-white** (`rgba(255,255,255,.94)`) with dark text and darker metadata for readability.
- Hover keeps an amber border; the selected card keeps a light amber tint; the red alert marking on flagged cards still renders.

---

## Verification performed

- `npx tsc --noEmit` clean (frontend) and `npx tsc --noEmit -p server/tsconfig.json` clean (backend).
- `npm run lint` clean for changed files (only pre-existing errors remain in `useWeather.ts` / `useAirQuality.ts`).
- `npm run test` — 4/4 passing.
- Endpoints verified live via curl:
  - Trip creation stores live AQI/weather + `destinationPoint`.
  - Risk-check detects an increase (saved AQI 1/Low → live AQI 4/High) and sets `riskAlert` itself.
  - `GET /api/risk-alerts` returns the alert for the owner; `POST /api/trips/:id/acknowledge` returns 204 and clears it; unauthenticated requests return 401.

---

## 7. All internal APIs moved onto the Node.js backend

**Context:** the teacher's review flagged that several "internal" APIs were only
Next.js route handlers calling external providers directly, so the app looked
backend-less / client-side.

### What changed

- **Next.js route handlers deleted** (`src/app/api/*`): `geocode`, `environment`,
  `routing`, `travel-brief`, `readiness` no longer exist in the Next.js app.
- **Backend now owns every internal API.** New Express endpoints:
  - `GET /api/environment` (weather + AQI, `scope=weather|air`) — logic moved
    into new `server/weather.ts` (external Open-Meteo / OpenWeather calls kept).
  - `GET /api/routing` — OSRM multi-route + scoring moved into `server/routing.ts`.
  - `POST /api/travel-brief` — Gemini brief + fallback moved into
    `server/travel-brief.ts`.
  - `GET /api/geocode` — Nominatim call kept, but the response is normalized to
    `{ lat, lon, displayName }` and returns 404 when no place is found (matches
    what the client already expected).
- **Proxying:** `next.config.ts` now declares `rewrites()` so every `/api/*`
  browser request is forwarded to the backend at `NEXT_PUBLIC_API_BASE_URL`
  (default `http://localhost:4000`).
- **Client simplified to a single hop:** `apiFetch` in `src/lib/api-client.ts`
  now uses relative `/api/*` paths (the rewrite routes them to the backend), and
  `RoutingMap`'s POI lookup + `sos-button` also call relative `/api/*`.
- **Readiness page** now calls the real backend endpoints directly:
  `GET /api/trips/:id/readiness` and `POST /api/trips/:id/readiness/offline`;
  the `/api/readiness` proxy route is gone.
- **Weather service relocated to `server/weather.ts`**; the client keeps only
  `src/services/weather/types.ts` for the type shapes used by cards/hooks.
  `src/utils/aqiMap.ts` and `src/utils/weatherCodeMap.ts` are folded into the
  server module. The weather normalization test moved to
  `server/weather.test.ts` (still passing).

### Result

All internal APIs are now served only by the Node.js + MongoDB backend. External
APIs (OpenWeather, Open-Meteo, OpenStreetMap/Nominatim/OSRM/Overpass, BMD/BWDB,
Gemini) are still called, but always **server-side**. Running the full stack
requires both processes (`npm run dev:all`).
