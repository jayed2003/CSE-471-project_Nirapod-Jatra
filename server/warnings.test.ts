import { describe, expect, it, vi } from "vitest";
import { fetchBmdAlerts, haversineKm, offlineTilesForRoute, pointInPolygon, warningsNearRoute, type BmdAlert, type FloodWarning } from "./warnings.js";

const DHAKA_POLYGON: Array<[number, number]> = [[90.0, 23.5], [90.8, 23.5], [90.8, 24.1], [90.0, 24.1], [90.0, 23.5]];
const ROUTE = { type: "LineString", coordinates: [[90.2, 23.7], [90.4, 23.85], [90.6, 24.0]] };
const BMD_ALERT: BmdAlert = { provider: "bmd", id: "BMD-2026-001", event: "Rain", severity: "Severe", headline: "Heavy Rainfall Warning - Dhaka", area: "Dhaka", effective: "2026-08-11T06:00:00+06:00", expires: "2026-08-12T06:00:00+06:00", polygons: [DHAKA_POLYGON] };

describe("pointInPolygon", () => {
  it("returns true for a point inside the polygon and false outside", () => {
    expect(pointInPolygon(90.4, 23.85, DHAKA_POLYGON)).toBe(true);
    expect(pointInPolygon(89.0, 26.0, DHAKA_POLYGON)).toBe(false);
  });
});

describe("haversineKm", () => {
  it("approximates the Dhaka to Chittagong distance", () => {
    const distance = haversineKm([90.4125, 23.8103], [91.8, 22.35]);
    expect(distance).toBeGreaterThan(200);
    expect(distance).toBeLessThan(280);
  });
});

describe("warningsNearRoute", () => {
  it("flags a BMD polygon that the route passes through", () => {
    const warnings = warningsNearRoute(ROUTE, [BMD_ALERT], []);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ provider: "bmd", event: "Rain", status: "Warning" });
  });

  it("flags a flooded BWDB station within the corridor but ignores far stations", () => {
    const near: FloodWarning = { provider: "bwdb", stationId: "SW45", station: "Bhagyakul", district: "Munshiganj", point: [90.5, 23.85], dangerLevelM: 5.5, levelM: 6.3, status: "Warning", headline: "Bhagyakul river gauge is above the danger level (6.30 m).", source: "demo" };
    const far: FloodWarning = { provider: "bwdb", stationId: "SW1", station: "Kurigram", district: "Kurigram", point: [89.65, 25.8], dangerLevelM: 25.5, levelM: 26.3, status: "Warning", headline: "Kurigram river gauge is above the danger level.", source: "demo" };
    const warnings = warningsNearRoute(ROUTE, [], [near, far]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ provider: "bwdb", status: "Warning", area: "Bhagyakul, Munshiganj" });
  });

  it("returns an empty list when nothing affects the route", () => {
    expect(warningsNearRoute(ROUTE, [], [])).toEqual([]);
  });
});

describe("offlineTilesForRoute", () => {
  it("computes a bounded tile list for the route corridor", () => {
    const tiles = offlineTilesForRoute(ROUTE);
    expect(tiles.tileCount).toBeGreaterThan(0);
    expect(tiles.tiles.every((tile) => /^https:\/\/tile\.openstreetmap\.org\/13\/\d+\/\d+\.png$/.test(tile))).toBe(true);
  });

  it("returns an empty list without route geometry", () => {
    expect(offlineTilesForRoute(null).tileCount).toBe(0);
  });
});

describe("fetchBmdAlerts", () => {
  it("parses the CAP feed and filters expired alerts", async () => {
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Heavy Rainfall Warning - Dhaka, Khulna</title><link>https://cap.bmd.gov.bd/api/cap/BMD-2026-001.xml</link></item></channel></rss>`;
    const cap = `<alert xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2"><cap:identifier>BMD-2026-001</cap:identifier><cap:status>Actual</cap:status><cap:msgType>Alert</cap:msgType><cap:event>Rain</cap:event><cap:severity>Severe</cap:severity><cap:effective>2026-08-11T06:00:00+06:00</cap:effective><cap:expires>2099-08-12T06:00:00+06:00</cap:expires><cap:headline>Heavy Rainfall Warning - Dhaka</cap:headline><cap:area><cap:areaDesc>Dhaka</cap:areaDesc><cap:polygon>23.5,90.0 23.5,90.8 24.1,90.8 24.1,90.0 23.5,90.0</cap:polygon></cap:area></alert>`;
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      const body = url.includes("/rss.xml") ? rss : cap;
      return Promise.resolve(new Response(body));
    });
    vi.stubGlobal("fetch", fetchMock);
    const alerts = await fetchBmdAlerts();
    vi.unstubAllGlobals();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ event: "Rain", severity: "Severe", area: "Dhaka" });
    expect(alerts[0].polygons[0][0]).toEqual([90.0, 23.5]);
  });
});
