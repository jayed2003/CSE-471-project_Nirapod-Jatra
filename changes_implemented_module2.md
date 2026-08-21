# Changes Implemented — Module 2 (Emergency & Readiness)

Documentation of the functional and UI changes merged from the teammate branch `emergency-updated`
(commit `ba7543a`, 25 files, +1781/−37) on top of module 1 (`2314e4d`). Includes the readiness
engine, SOS email alerts, nearby emergency services, and the integration points with the existing
risk engine. A separate teammate-authored doc `emergency_tab_changes.md` covers the emergency tab UI.

---

## 1. Readiness engine (`server/warnings.ts`, new)

**Files:** `server/warnings.ts`

- `buildReadinessReport(routeGeometry)` — builds a per-trip readiness report:
  - **BMD CAP feed** (`https://cap.bmd.gov.bd/api/cap/rss.xml`, 10s timeout) for rainfall / severe-weather
    alerts; warnings within a **25 km corridor** of the route are kept and matched to route points
    (`matchedAt`), with `distanceKm` and severity.
  - Severity mapping: `Minor` / `Moderate` → Watch, `Severe` / `Extreme` → Warning.
  - **BWDB flood levels** via FloodWarnings (FFWC data, with fallback + demo flags `DEMO_BMD_WARNING`,
    `DEMO_FLOOD_STATIONS` for testing without network).
  - `nearestShelter(point)` — Overpass API lookup falling back to static shelter lists when offline;
    returns shelter name, point, distance.
  - Aggregated report: `{ status: "ready" | "escalated", warnings[], nearestShelter, offlineMap:
    { tiles[], zoom, tileCount } }` where `escalated` means at least one Warning.
- Helpers reused by the risk engine: `haversineKm`, `routePoints`, `nearestHospital`, `nearestFloodGauge`.

## 2. Flood status wired into the risk engine (`server/risk.ts`)

- `fetchLiveRisk(destinationPoint, route?)` now also fetches flood warnings and returns a real
  `floodStatus` for the route (via `floodStatusForRoute`) or destination point (via `floodStatusFor`,
  25 km radius), instead of always `"None"`.
- `RiskInputs` keeps `floodStatus: "None" | "Watch" | "Warning"`; new risk-history entries persist it.
- Trip creation and the internal risk recheck both pass the saved route through so live flood status
  is stored in `riskHistory` / the safety brief.

## 3. Trip model readiness + contact email (`server/models/Trip.ts`, `server/models/EmergencyContact.ts`)

- `Trip` gained a `readiness` subdocument: `{ status, source, warnings[], nearestShelter,
  offlineMap: { status, zoom, tileCount, tiles[], downloadedAt }, checkedAt }`.
- `EmergencyContact.email` is now `required` (was optional) — every contact must have an email
  address, because SOS alerts are email-based.

## 4. New backend endpoints (`server/index.ts`)

- `POST /api/trips/:id/refresh-risk` (auth, owner) — manually re-fetch live risk + nearest hospital /
  flood gauge, update `currentRiskBrief`, append a `riskHistory` entry, refresh the shadow profile.
- `GET /api/trips/:id/readiness` (auth, owner) — returns the readiness report, rebuilding it when
  older than 15 minutes (`READINESS_STALE_MS`).
- `POST /api/trips/:id/readiness/offline` (auth, owner) — marks the offline map as `downloaded`;
  returns the updated `offlineMap`.
- `GET /api/emergency-services/nearby?lat&lng&radius` (radius 50–400 m) — hospitals, fire, ambulance
  and police near a point via `nearbyEmergencyServices`.
- `POST /api/sos` — reworked: now **auth-required** (was an anonymous write), accepts
  `{ tripId?, location?, message }`, creates the `SosEvent`, loads the user's emergency contacts and
  display name, then emails each contact via `sendSosAlertEmail` (returns `emailsSent` count);
  emits `sos:new` over the socket. Still rate-limited (5/min).
- `POST /api/internal/readiness-check` (CRON_SECRET) — scans active trips, builds readiness reports,
  and when a trip escalates to `escalated`, persists the report (keeping the existing offline-map
  status), emits `readiness:update`, and sends a web-push notification.
- `POST /api/trips` now enriches the shadow profile at creation with `nearestHospital` and
  `nearestFloodGauge` at the origin.
- `POST /api/contacts` enforces a **max of 2 emergency contacts** (409 beyond the limit).

## 5. SOS email alerts (`server/mail.ts`, new)

- `sendSosAlertEmail(email, { requesterName, message, locationUrl, timestamp })` using **nodemailer**
  (SMTP). Config comes from env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- When SMTP is unconfigured it logs a warning and returns `false` — the SOS event is still recorded
  locally; only the email notification is skipped.
- Gmail guidance included in `.env.example` (App Password, `smtp.gmail.com:587`).

## 6. Readiness page (`src/app/readiness/page.tsx`, `src/app/api/readiness/route.ts`, `ReadinessMap.tsx`)

- **`src/app/api/readiness/route.ts`** — Next.js proxy: `GET /api/readiness?tripId=` → API
  `/api/trips/:id/readiness` (30s timeout); `POST /api/readiness/offline` → `/api/trips/:id/readiness/
  offline` (15s timeout). Auth via `Bearer` token; falls back to the `waymark-token` cookie.
- **`src/app/readiness/page.tsx`** — new `/readiness` route (auth-gated): lists saved trips, shows the
  selected trip's readiness status (ready / escalated), warning cards (alert/caution styling),
  nearest shelter with directions link, an offline-map panel (`primeOfflineMap` / `countCachedTiles`
  from `src/lib/offline.ts`, progress bar, persists `downloaded` status), and a MapLibre map.
- **`src/components/ReadinessMap.tsx`** — MapLibre GL map rendering the route line, warning polygons,
  and the nearest-shelter marker over OSM raster tiles.

## 7. Emergency page (needs location enabled)

**Files:** `src/app/emergency/page.tsx`, `src/components/EmergencyServicesPanel.tsx`

- `/emergency` now acquires the current location and (only when available) shows a
  `EmergencyServicesPanel`:
  - **999 national hotline** card (`tel:`).
  - Nearby hospitals / fire / ambulance / police within 400 m (`GET /api/emergency-services/nearby`),
    each with distance and `tel:` call links behind a "Call X?" confirmation dialog.
  - Handles degraded/slow lookups with an explicit "results may be incomplete" + Retry control.
  - The "Nearby now" map card shows the user's current location (nothing is shared unless SOS is sent).
- The existing SOS / 6-hour check-in flow now reports `emailsSent` vs `contactsNotified`, e.g.
  "Emailed 1 of 1 emergency contact(s)." via the current account's contacts.

## 8. Account page + registration contact email

- Registration step 2 now requires a **contact email** (in addition to name/phone) and shows an upload
  cap ("…up to 2 contacts"). The emergency-contacts list displays each contact's email and counts
  against `MAX_EMERGENCY_CONTACTS = 2`; the add form is hidden once the limit is reached.

## 9. Other module-2 changes

- `src/components/map-preview.tsx` — switched to an explicit OSM raster `mapStyle` (no third-party
  stylesheet dependency) and an optional `zoom` prop (used at zoom 15 on the emergency page).
- `src/lib/offline.ts` — `primeOfflineMap(urls, onProgress)` and `countCachedTiles(urls)` implement
  the `offline-map-tiles` Cache Storage (mirrored by a `CacheFirst` Workbox route in `public/sw.js`
  so the service worker serves cached tiles).
- `src/components/site-nav.tsx` — added a **Readiness** link to the nav.
- `src/app/globals.css` — readiness layout/status/warning/shelter/offline-map styles, emergency
  services + maplibre popup overrides, `body` tweak for the readiness workspaces.
- `src/app/trips/page.tsx` — the Refresh button now calls `POST /api/trips/:id/refresh-risk` for the
  selected trip before reloading (with a spinning state).
- `package.json` — added `nodemailer@^9.0.5`, `@types/nodemailer@^8.0.1`, `mongodb-memory-server`
  (test db), `maplibre-gl`. `public/sw.js` gains the tile route.
- `.env.example` — documented `DEMO_BMD_WARNING`, `DEMO_FLOOD_STATIONS`, and the new `SMTP_*` vars.

---

## Verification performed

- Ran `npm install` after the merge — `nodemailer`/`@types/nodemailer` were in the lockfile but not
  installed locally; without them the API server crashed on `MODULE_NOT_FOUND` the moment `server/
  index.ts` imported `sendSosAlertEmail` from `./mail.js`. Install fixed the startup.
- `npx tsc --noEmit -p server/tsconfig.json` clean; `npx tsc --noEmit` (frontend) clean for changed
  files.
- `npm run test` — includes the three module-2 unit suites: `server/risk.test.ts` (flood status from
  warnings) and `server/warnings.test.ts` (CAP parsing, corridor matching, shelter lookup).
- Backend verified booting: `GET /api/health` → `{"status":"ok"}` on port 4000 against MongoDB.
- Manual/dev check gloss: `DEMO_BMD_WARNING=1` + `DEMO_FLOOD_STATIONS=SW18,SW45` in `.env.local`
  synthesize an escalated readiness report (used to exercise the readiness UI). Remove them for real
  feed data.
- Note for live SOS email: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` in
  `.env.local` (not just `.env.example`); without them `sendSosAlertEmail` warns and returns `false`,
  so SOS records the event but contacts are not emailed.