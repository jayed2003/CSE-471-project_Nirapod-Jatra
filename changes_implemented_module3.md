# Changes Implemented — Module 3 (Tier Subscription + UI Overhaul)

Documentation of the tier-based subscription gating feature and a site-wide UI consistency/polish
pass performed in the same session, on top of the merged module-2 work (`emergency-updated`) and the
low-network-zone / trip-time-optimization / SOS-script / voice-safe-word features already on `main`.

---

## 1. Tier-based subscription (Basic / Premium)

Course requirement: a Basic/Premium tier model gating specific features, with no real payment
gateway — switching plans is a one-click toggle that flips a stored field.

**Files:** `server/models/User.ts`, `server/index.ts`, `src/lib/plan.ts` (new),
`src/components/PremiumGate.tsx` (new), `src/components/SwitchPlanDialog.tsx` (new),
`src/app/account/page.tsx`, `src/app/emergency/page.tsx`, `src/app/readiness/page.tsx`

- `User.plan: "basic" | "premium"` (default `"basic"`) — new field on the user schema.
- `POST /api/auth/register` accepts an optional `plan` in the registration body (defaults to
  `"basic"` when omitted).
- `GET /api/me` now returns `plan` on the `user` object — the single source of truth every page
  already polls for current-user state.
- New `PUT /api/me/plan` (auth) — `{ plan }` → updates and returns the new plan. Supports both
  upgrade (Basic → Premium) and downgrade (Premium → Basic).
- New `requirePremium` middleware (after `requireAuth`) — loads the user's `plan` and returns
  `403` if not `"premium"`. Applied server-side (not just client-side gating) to:
  - `PUT /api/me/safe-word` (Bangla safe-word voice SOS)
  - `POST /api/sos/script` (SOS script generator)
  - `POST /api/location-share/start` (Share live location)
  - `GET /api/trips/:id/readiness`, `POST /api/trips/:id/readiness/offline`,
    `GET /api/trips/:id/low-network-zones`, `POST /api/trips/:id/low-network-zones/:zoneId/offline`
    (the entire Readiness page and its offline low-network-zone packs)
  - Left **unguarded** (stay Basic-accessible): `POST /api/sos`, check-in routes,
    `GET /api/emergency-services/nearby`.
- **`PremiumGate`** (`src/components/PremiumGate.tsx`) — wraps a section of UI; when the current
  plan isn't Premium, renders the children dimmed/blurred behind a locked overlay with a
  "Switch Plan" button, rather than redirecting the user away.
- **`SwitchPlanDialog`** (`src/components/SwitchPlanDialog.tsx`) — modal showing a Current Plan
  card and a Premium/Basic card side by side (feature bullet lists for each), with a single button
  to switch. Follows the existing `.confirm-overlay`/`.confirm-dialog` modal pattern used elsewhere
  in the app. Dispatches a `plan:changed` window event on success so every mounted page (Emergency,
  Readiness, Account) re-fetches `/api/me` and lifts its gates immediately, no reload needed.
- **Emergency page**: gates Share live location, the SOS script generator, and the Voice safe-word
  SOS arm behind `PremiumGate`. Send SOS, Check on me, and Emergency Services Nearby stay Basic.
- **Readiness page**: gated in its entirety (offline map pre-download, low-network zone packs,
  BMD/BWDB warnings) — a Basic user sees the page shell dimmed with the upsell overlay on top.
- **Account page**: registration form gained a Basic/Premium `<select>` (step 3, next to the
  location-monitoring checkbox); the logged-in view shows a new "Plan" card with the current tier
  and a Switch Plan button.

## 2. Site-wide UI consistency and polish pass

A code-level design audit (reading `globals.css`, `layout.tsx`, and every page) found the app was
mixing two card systems (a light "parchment" card style bolted onto an otherwise all-dark design),
declaring fonts that were never actually loaded, and had several near-duplicate colors, sparse
focus states, and uneven mobile coverage on newer features. Fixed in place — no framework/library
changes.

**Files:** `src/app/layout.tsx`, `src/app/globals.css`, `src/app/icon.svg` (new),
`public/manifest.webmanifest`, `src/app/planner/page.tsx`

### Fonts were declared but never loaded
- `next/font/google` now loads **Inter**, **Space Grotesk**, and **IBM Plex Mono** in
  `layout.tsx`, exposed as CSS variables (`--font-inter`, `--font-space-grotesk`,
  `--font-ibm-plex-mono`) on `<html>`.
- All 59 hardcoded `"Space Grotesk"` / `"IBM Plex Mono"` / `Inter` references across `globals.css`
  now resolve through the loaded variables (with the literal name kept as a fallback). Previously
  every page silently rendered in the browser's default system font.

### Light/dark theme conflict resolved
Standardized on the dark panel theme (`--panel` background, `--parchment` text) everywhere,
removing leftover light "parchment card" styling that had been applied inconsistently:
- `.route-form, .panel` (planner search form + Conditions dashboard) — was light-on-dark, now dark.
- `.travel-dialog` (destination brief modal) — same fix.
- Removed a dead/shadowed `.trips-page .trip-card` override that force-rendered the trip picker
  list as a light white card even though the base `.trip-card` rule was already dark.
- Removed the `!important`-forced light `.readiness-trip` override on the Readiness page's trip
  picker, for the same reason.
- **Found and fixed a masked specificity bug** these light overrides had been hiding: `.trip-card`
  and `.readiness-trip` are real `<button>` elements, and a pre-existing generic rule
  (`.subpage button { background: var(--amber); color: var(--ink); }`) has higher CSS specificity
  than their own background rule, so once the light `!important` overrides were removed, the trip
  cards rendered solid amber with unreadable ink-on-amber text. Fixed by excluding both classes
  from the generic rule (`.subpage button:not(.trip-card):not(.readiness-trip)`).
- **Found and fixed two contrast bugs** in the same family: `.date-row input` (Departure/Return
  date fields) and `.panel h2` / `.brief span` (Conditions card heading and footnote) were still
  using light-theme colors (`var(--ink)` text on transparent, or `var(--dark-muted)`, ~2.5:1
  contrast) left over from before the dark-theme conversion — both now use `var(--parchment)`/
  `var(--muted)` (~5.8:1 contrast). The date input also gained `color-scheme: dark` so the native
  calendar icon renders correctly on a dark background.

### Color token consolidation
- Added `--danger` (`#cf4a4a`), `--danger-hover` (`#b83e3e`), and `--amber-hover` (`#edb44e`)
  tokens to `:root`.
- Replaced 8+ scattered one-off hex values that were really the same two colors used
  inconsistently (`#cf4a4a` appeared standalone in five places; `#edb44e` and `#e8bd52` were two
  different shades both meaning "amber button hover").

### Favicon + PWA metadata
- New `src/app/icon.svg` — a branded icon (shield/pin motif) matching the app's actual palette,
  wired into `metadata.icons` in `layout.tsx`. The site previously had no favicon at all.
- Added a `viewport` export with `themeColor: "#0d2430"`.
- `public/manifest.webmanifest` — `theme_color`/`background_color` corrected to match the real
  design tokens (was `#184d47`/`#f7f6f0`, unrelated to any color actually used in the app); `icons`
  array populated with the new SVG (was empty).

### Focus states and interaction polish
- Added a global `:focus-visible` outline and baseline hover/active-press transitions for every
  button, link, and interactive element. Previously only 3 raw `<input>` elements had any focus
  styling in the entire app, and there were zero `:active` (pressed) states anywhere.

### Mobile coverage for newer features
Added breakpoints for the Trip-Time Optimizer table, the Premium-gate overlay, the Switch Plan
dialog, and low-network zone-pack cards — none of these had any responsive handling before (they
were added after the app's original breakpoint set was written). Also fixed the site nav to wrap
instead of overflow on narrow screens (`flex-wrap` + `max-width: calc(100vw - 20px)`), and gave the
active nav link a persistent underline so it stays distinguishable from a merely-hovered link
(previously `.active` and `:hover` used the identical style).

### Planner page layout
Two rounds of layout feedback against real screenshots (not just code reading) drove the final
structure: the "Where are you going?" search form is now a single card spanning the full height of
a left column that stacks the page headline above the "Conditions" dashboard card (narrower now
that it shares a column with the headline, was previously a wide separate row). The form card
itself gained a bottom row of small check chips (Weather / Air quality / Flood risk / Unrest)
explaining what the Plan action evaluates, so the taller card is filled with real content rather
than dead space.

---

## Verification performed

- `npm run typecheck:server` (`tsc --noEmit -p server/tsconfig.json`) clean after every change.
- `npx tsc --noEmit` (frontend) clean after every change.
- `npm run test` — all 52 existing tests pass throughout (no regressions from either the
  subscription gating or the CSS/layout changes).
- `npm run lint` — same 9 pre-existing issues before and after (all unrelated `react-hooks/*`
  findings in `useAirQuality.ts`, `useWeather.ts`, `RoutingMap.tsx`, and one `.memory-mongo.cjs`
  require-import warning); no new lint errors introduced.
- Manually exercised the plan-switch flow end-to-end via `curl` against the running dev server:
  registered a Basic account, confirmed `403` on a `requirePremium`-guarded route
  (`/api/location-share/start`), called `PUT /api/me/plan` to upgrade, confirmed the same route
  returned `201`; also verified registering directly as Premium and downgrading back to Basic.
- Manually reviewed real screenshots of the running app (provided by the user) across two rounds
  of feedback, catching regressions that static CSS reading missed (the trip-card
  specificity bug, the date-input contrast bug, and the planner layout gap) — fixed and
  re-verified against follow-up screenshots each time.
- Confirmed all six main pages (`/`, `/planner`, `/trips`, `/readiness`, `/emergency`, `/account`)
  return `200` after every change.
