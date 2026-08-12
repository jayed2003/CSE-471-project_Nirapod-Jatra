# Nirapod Jatra — Travel Safety PWA

A travel safety PWA built with Next.js (frontend) and an internal Node.js/Express
backend connected to MongoDB.

## Architecture

- **`server/` — Node.js + Express backend (the real backend).** Connected to
  MongoDB via Mongoose. Serves **all internal APIs**: auth, trips, readiness,
  geocode, environment (weather + air quality), routing, travel brief, POIs,
  emergency services, SOS, risk alerts.
- **`src/` — Next.js frontend.** Client components call the backend through the
  relative `/api/*` paths; `next.config.ts` `rewrites()` proxies every `/api/*`
  request to the backend at `NEXT_PUBLIC_API_BASE_URL` (default
  `http://localhost:4000`).
- **External APIs stay external.** OpenWeather, Open-Meteo, OpenStreetMap
  (Nominatim/OSRM/Overpass), BMD/BWDB feeds, and Gemini are called **server-side**
  only — never from the browser.

## Getting Started

Both processes are required for the frontend to reach the backend.

```bash
cp .env.example .env.local   # then fill in MONGODB_URI, JWT_SECRET, API keys

npm run dev:all              # runs Next.js (3000) + Express backend (4000)
# or, in two terminals:
npm run dev                  #   Next.js frontend
npm run dev:server           #   Express backend
```

Open [http://localhost:3000](http://localhost:3000). The backend health check is
available at [http://localhost:4000/api/health](http://localhost:4000/api/health).

## Scripts

| Command                    | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| `npm run dev:all`          | Run frontend + backend together          |
| `npm run dev`              | Next.js dev server                       |
| `npm run dev:server`       | Express backend (tsx watch)              |
| `npm run build` / `start`  | Production Next.js build / serve         |
| `npm run lint`             | ESLint                                   |
| `npm run typecheck:server` | TypeScript check for `server/`           |
| `npm run test`             | Vitest tests (risk, warnings, weather)   |