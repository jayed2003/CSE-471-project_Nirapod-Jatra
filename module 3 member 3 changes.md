# Module 3 — Member 3 — Changes Implemented

Documentation of all functional and UI changes made to the Nirapod Jatra project during this work session: making Emergency SOS email alerts actually send, building a new Live Location Sharing feature, adding click-to-locate on the Emergency Services panel, and building a new Smart Tourist Explorer feature on the Planner tab.

---

## 1. Emergency SOS — real email alerts to emergency contacts

**Files:** `server/mail.ts`, `server/index.ts`, `src/components/sos-button.tsx`, `src/app/emergency/page.tsx`, `.env.local`, `.env.example`

**What it does:** When a user presses "Send emergency SOS" (or a 6-hour check-in timer expires unconfirmed), every saved emergency contact for that user receives a real email with the requester's name, an optional message, a Google Maps link to their last known location, and the time of the alert.

**How it works:**
- `POST /api/sos` (already existed) creates a `SosEvent`, looks up the signed-in user's own `EmergencyContact` records (scoped by `userId`, so it's per-user by design — every account's own contacts get emailed, nothing shared across users), and calls `sendSosAlertEmail()` for each one.
- `server/mail.ts` uses `nodemailer` with SMTP credentials from environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). The transporter is created lazily and cached for the life of the process.
- **Reply-To fix:** the alert email's `Reply-To` header is now set to the requester's own email address, and the email body says "Reply to this email to reach {name} directly at {email}" — so the emergency contact can hit Reply and reach the actual person in danger, not a shared system inbox.
- **Dev-mode reliability fallback:** if no SMTP credentials are configured, the server automatically routes email through a disposable Ethereal test inbox (via `nodemailer.createTestAccount()`) instead of silently failing — this lets the whole SOS flow be exercised and demoed locally with zero setup. Each such send is clearly flagged: the API response includes `testMode: true` and a `testPreviewUrls` array (viewable links to the actual rendered email), and the UI shows "(test mode — SMTP isn't configured yet, so nothing reached a real inbox)" instead of implying real delivery.
- **Production config:** wired up a real Gmail account (`smtp.gmail.com`, port `587`) using an App Password, set directly in `.env.local`. Verified live — `POST /api/sos` for a real account returned `emailsSent: 1` with no `testMode` flag, and the server log showed no send errors.

---

## 2. Live Location Sharing (new feature)

**Files:** `server/models/LocationShare.ts` (new), `server/mail.ts`, `server/index.ts`, `src/app/emergency/page.tsx`, `src/app/share/[token]/page.tsx` (new)

**What it does:** From the Emergency tab, a user can start sharing their live, continuously-updating location with their emergency contacts by email, for up to 6 hours, without needing to build a real-time chat/tracking app from scratch.

**How it works:**
- New Mongoose model `LocationShare`: `token` (unguessable random ID), `userId`, `requesterName` (snapshotted at creation), `active`, `expiresAt`, `location`, `accuracy`, `lastUpdatedAt`.
- **`POST /api/location-share/start`** (auth required): deactivates any previous active share for the user, creates a new one with a fresh token, emails every emergency contact a link like `http://localhost:3000/share/<token>` via a new `sendLocationShareEmail()` function in `mail.ts` (reuses the same SMTP/Ethereal/Reply-To infrastructure as SOS).
- **`PUT /api/location-share/:token/location`** (auth required): updates the live coordinates. The browser calls this via `navigator.geolocation.watchPosition()`, throttled to at most once every 10 seconds so it doesn't hammer the server.
- **`POST /api/location-share/stop`** (auth required): deactivates the share immediately — anyone still viewing the link sees "This live location share has ended."
- **`GET /api/location-share/:token`** (public, **no login required** — matches how Google Maps/WhatsApp live-location links work, protected only by the unguessable token): returns the current location, accuracy, requester name, and whether the share is still active.
- New public page `src/app/share/[token]/page.tsx`: no auth, polls the public endpoint every 6 seconds, renders the live location on a map with a pulsing "Live" indicator and a relative "updated Ns ago" timestamp.
- The Emergency tab gained a new "Share live location" card: Start/Stop buttons, the shareable link, and expiry time.
- **Design decision:** live updates use polling (6s) rather than wiring up a WebSocket client, since the codebase already polls elsewhere (risk alerts every 30s) and adding `socket.io-client` for one feature would mean a new dependency plus auth/CORS handling for an unauthenticated viewer page, for a UX difference most users wouldn't notice at 6-second granularity.

---

## 3. Emergency Services panel — click a service to see it on the map

**Files:** `src/components/EmergencyServicesPanel.tsx`, `src/components/map-preview.tsx`, `src/app/emergency/page.tsx`, `src/app/globals.css`

**What it does:** Each nearby hospital/fire/ambulance/police entry now has a small map-pin button. Clicking it re-centers the "Nearby now" map to show that specific service's location alongside the user's own location (two pins, auto-fit to both), instead of the map only ever showing "You are here."

**How it works:**
- The backend (`/api/emergency-services/nearby`) already returned each service's coordinates (`point: [lng, lat]`) — that data just wasn't being used by the UI.
- `MapPreview` gained an optional `secondaryMarker` prop: when present, it adds a second marker (teal-green, vs. the existing red primary marker) and calls `fitBounds()` so both pins are visible at once instead of just re-centering on one.
- Clicking a service's pin icon lifts `{ name, point }` up to the Emergency page via an `onSelect` callback, which sets it as the map's primary marker (service location) with the user's own coordinates as the secondary marker, and smooth-scrolls the map card into view. A "Show my location only" link clears the selection.

**Two real bugs found and fixed along the way:**
- **CSS specificity bug:** a global `.subpage button` rule (amber background, big padding) was silently overriding the small icon-button styling, turning the pin icon into an ugly solid-amber block instead of a small bordered button. Fixed by scoping the new styles under a more specific `.service-name .service-locate` selector, and reverted the earlier mistake of making the *category* icon itself clickable (it's plain again, matching the original design) — the map-pin button is a distinct, separate control next to it, per feedback.
- **Real runtime crash:** clicking a service threw `Cannot read properties of undefined (reading 'lng')` and crashed the map. Root cause: the secondary marker was being added to the map (`.addTo(map)`) *before* its coordinates were set (`.setLngLat()`), so MapLibre tried to position a marker with no location yet. Fixed by setting coordinates before adding the marker to the map, matching the order already used correctly for the primary marker.

---

## 4. Smart Tourist Explorer (new feature)

**Files:** `server/attractions.ts` (new), `server/travel-brief.ts`, `server/index.ts`, `server/warnings.ts`, `src/components/TouristExplorer.tsx` (new), `src/app/planner/page.tsx`, `src/app/globals.css`

**What it does:** A new "Discover attractions" section on the Planner tab. A user types any city or destination — anywhere in the world, any size — and gets back a categorized list of real, popular tourist attractions (Landmarks & History, Museums & Galleries, Parks & Nature, Entertainment & Recreation) plus a short "best time to visit" note.

**How it works — data source:**
- **Originally built on OpenStreetMap's Overpass API** (the same provider already used by the Emergency Services panel), tagging attractions by `tourism=*`/`historic=*`/`leisure=park`/etc. This worked, but had two real problems surfaced through testing: (1) Overpass's free public mirrors are unreliable — they went fully unreachable mid-project from rate-limiting/outages, which also affected the *pre-existing* Emergency Services feature, proving it wasn't a new-code bug; (2) OSM's own tagging for "is this actually famous" (`wikipedia`/`wikidata` tags) is inconsistently present, especially outside major Western cities, causing genuinely famous sites (e.g. Shalban Bihar and Mainamati near Cumilla) to get buried behind generic local clutter like every town's war memorial.
- **Rebuilt on Wikipedia's GeoSearch API** instead — the same class of fast, reliable, keyless public API that already makes the weather feature reliable (Open-Meteo). Every result Wikipedia's geosearch returns is inherently "notable" by definition (obscure places don't get Wikipedia articles), which solves the fame-ranking problem structurally instead of needing a fragile OSM-tag heuristic. Typical response time dropped from Overpass's 20+ second timeouts to well under a second.

**How it works — filtering/classification (`server/attractions.ts`):**
- Wikipedia happily returns geotagged pages that aren't attractions at all — administrative divisions, schools, historical events, embassies, sports clubs, businesses. A classification engine parses each result's short Wikidata description (e.g. "Archaeological site in Bangladesh", "Hindu temple in Bangladesh") to decide what to keep and how to categorize it:
  - A large "strong exclude" word list (schools, hospitals, government bodies, wars/riots/protests, businesses, demolished/former buildings, etc.) is checked against the *whole* description, since these words are never an innocent trailing location reference.
  - A separate, smaller "geographic type" exclude list (city, district, union, village, etc.) is checked **only against the portion of the description before the first "in/of/at/near/on"** — because Wikidata descriptions follow a "`<TYPE> in <LOCATION>`" pattern, and a word like "district" is only a bad sign as the *type* ("District in X") — as a trailing location qualifier ("Waterfall in Alikadam, X **District**") it's completely harmless and must not cause a real attraction to be excluded. This exact bug was found and fixed live during testing (Bandarban's real waterfall and hill were initially being wrongly filtered out because their descriptions merely *mentioned* "Bandarban District").
  - Remaining results are classified into landmark/museum/nature/park/entertainment by keyword matching (temple/mosque/fort/museum/zoo/park/beach/etc.), defaulting to "landmark" if notable-but-unmatched.
  - The filter list was iteratively hardened against real noise found via live testing across Cumilla, Paris, Cairo, Bandarban, and Mymensingh — catching things like historical events ("2011 Egyptian revolution"), diplomatic missions, sports tournament editions, church administrative divisions, oil fields, and even a tragic incident, none of which are tourist attractions.
- **Coverage for smaller/rural destinations:** Wikipedia's geosearch API hard-caps a single request at a 10 km radius, so a sparse result at a small district's exact center doesn't necessarily mean the district has nothing to see. When a search returns fewer than 6 results, the backend automatically fans out 4 additional parallel searches at points ~15 km out in each cardinal direction (using proper great-circle geodesic math, not naive degree math, so it works correctly worldwide), covering roughly a 25 km radius around the destination without ever exceeding Wikipedia's per-request limit. This directly fixed districts like Thakurgaon that returned zero results before.
- **Caching:** results are cached for 24 hours per location (attraction data is effectively static day-to-day), so a destination that's been searched once stays fast and available even if Wikipedia's API has a slow moment later.

**How it works — "best time to visit" (`server/travel-brief.ts`):**
- New `buildBestTimeToVisit()` function, following the exact same pattern already used by the existing travel-brief feature: uses Gemini (if `GEMINI_API_KEY` is configured) for a natural-language answer, otherwise falls back to a deterministic latitude/hemisphere-based climate-zone heuristic (e.g. "tropical, so Nov–Feb is typically the drier, cooler window"), clearly labeled as general guidance rather than a verified forecast.

**API:** `GET /api/attractions?lat=&lon=&destination=` returns `{ attractions, degraded, bestTimeToVisit }`. `degraded: true` means the live lookup failed and (if available) a stale cached result was served instead — same honest-degradation pattern already used elsewhere in the app, with a Retry button in the UI.

**Frontend (`TouristExplorer.tsx`):** own destination input (separate from the trip-planning form, since exploring shouldn't require picking travel dates), reuses the app's existing geocode cache and the same list-styling patterns as the Emergency Services panel for visual consistency. Distance-from-center and "nearby" framing were deliberately removed per feedback — the goal is "what's worth seeing in this destination," not "what's physically closest to a pin."

---

## Verification performed

- `npx tsc --noEmit --project server/tsconfig.json` and `npx tsc --noEmit` (frontend) clean after every change.
- ESLint clean on every touched file (pre-existing warnings elsewhere in the codebase were left alone, not introduced by this work).
- Live-verified via a headless-browser (Playwright) script driving the real dev server for: SOS send flow, Live Location Sharing start/update/stop across two browser contexts, Emergency Services click-to-locate (screenshot-confirmed dual-marker map, zero console errors), and the Tourist Explorer end-to-end for both a Bangladeshi district (Cumilla) and international cities.
- Backend endpoints additionally verified directly via `curl` for edge cases: invalid destinations, degraded/retry states, and a systematic audit across all 64 Bangladesh districts (8 divisions) plus 8 international cities of varying size (Tokyo, Rome, Cairo, Nairobi, down to small towns like Ushuaia) to confirm the attractions feature generalizes worldwide rather than being tuned to a handful of demo cities.
- Real end-to-end email delivery confirmed for both SOS and Live Location Sharing using a real Gmail SMTP account — `emailsSent: 1` with no test-mode fallback, no send errors in server logs.
