import { describe, expect, it, vi } from "vitest";
import {
  LOW_NETWORK_ZONES,
  zonesAlongRoute,
  offlineTilesForZone,
  emergencyBundleForZone,
} from "./lowNetworkZones.js";

const TANGUAR_ROUTE = {
  type: "LineString",
  coordinates: [
    [91.05, 25.03],
    [91.09, 25.09],
    [91.12, 25.13],
  ],
};
const DHAKA_ROUTE = {
  type: "LineString",
  coordinates: [
    [90.2, 23.7],
    [90.4, 23.85],
    [90.6, 24.0],
  ],
};

describe("zonesAlongRoute", () => {
  it("detects a route passing through a curated zone", () => {
    const zones = zonesAlongRoute(TANGUAR_ROUTE);
    expect(zones.map((zone) => zone.id)).toContain("tanguar-haor");
  });

  it("returns nothing for a route far from every zone", () => {
    expect(zonesAlongRoute(DHAKA_ROUTE)).toEqual([]);
  });

  it("forces a zone via DEMO_LOW_NETWORK_ZONE regardless of geometry", () => {
    vi.stubEnv("DEMO_LOW_NETWORK_ZONE", "tanguar-haor");
    try {
      const zones = zonesAlongRoute(DHAKA_ROUTE);
      expect(zones.map((zone) => zone.id)).toContain("tanguar-haor");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("offlineTilesForZone", () => {
  it("computes a bounded tile list for a zone", () => {
    const tiles = offlineTilesForZone(LOW_NETWORK_ZONES[0]);
    expect(tiles.tileCount).toBeGreaterThan(0);
    expect(
      tiles.tiles.every((tile) =>
        /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(tile),
      ),
    ).toBe(true);
  });

  it("respects the maxTiles bound", () => {
    const tiles = offlineTilesForZone(LOW_NETWORK_ZONES[0], 14, 5);
    expect(tiles.tileCount).toBeLessThanOrEqual(5);
  });
});

vi.mock("./warnings.js", async () => {
  const actual = await vi.importActual<typeof import("./warnings.js")>("./warnings.js");
  return { ...actual, nearbyEmergencyServices: vi.fn() };
});

describe("emergencyBundleForZone", () => {
  it("propagates degraded=true when any representative point lookup is degraded", async () => {
    const { nearbyEmergencyServices } = await import("./warnings.js");
    vi.mocked(nearbyEmergencyServices).mockResolvedValue({ services: [], degraded: true });
    const bundle = await emergencyBundleForZone(LOW_NETWORK_ZONES[0]);
    expect(bundle.degraded).toBe(true);
  });

  it("dedupes services shared across representative points", async () => {
    const { nearbyEmergencyServices } = await import("./warnings.js");
    const shared = {
      id: "hospital-1",
      name: "Shared Hospital",
      category: "hospital" as const,
      point: [91.09, 25.08] as [number, number],
      distanceMeters: 100,
      phones: [],
    };
    vi.mocked(nearbyEmergencyServices).mockResolvedValue({ services: [shared], degraded: false });
    const bundle = await emergencyBundleForZone(LOW_NETWORK_ZONES[0]);
    const ids = bundle.services.map((service) => service.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(bundle.degraded).toBe(false);
  });
});
