import { describe, expect, it } from "vitest";
import { floodStatusFor, floodStatusForRoute } from "./risk.js";
import type { FloodWarning } from "./warnings.js";

const WARNING: FloodWarning = {
  provider: "bwdb",
  stationId: "SW90",
  station: "Bhairab Bazar",
  district: "Kishoreganj",
  point: [90.98, 24.05],
  dangerLevelM: 6.25,
  levelM: 7.05,
  status: "Warning",
  headline: "Bhairab Bazar river gauge is above the danger level.",
  source: "demo",
};
const WATCH: FloodWarning = {
  ...WARNING,
  stationId: "SW45",
  station: "Bhagyakul",
  district: "Munshiganj",
  point: [90.1, 23.62],
  status: "Watch",
  levelM: 5.4,
};
const NONE: FloodWarning = {
  ...WARNING,
  stationId: "SW93",
  station: "Chandpur",
  district: "Chandpur",
  point: [90.66, 23.23],
  status: "None",
  levelM: 5.4,
};

describe("floodStatusFor", () => {
  it("uses the nearest station's status within the radius", () => {
    expect(floodStatusFor([90.98, 24.05], [WARNING])).toBe("Warning");
    expect(floodStatusFor([90.1, 23.62], [WATCH])).toBe("Watch");
  });

  it("ignores stations beyond the radius", () => {
    expect(floodStatusFor([91.87, 24.9], [WARNING])).toBe("None");
  });

  it("reports None when the nearest station is at safe level", () => {
    expect(floodStatusFor([90.66, 23.23], [NONE])).toBe("None");
    expect(floodStatusFor([91.0, 24.1], [NONE, WARNING])).toBe("Warning");
  });
});

describe("floodStatusForRoute", () => {
  it("is Warning when any route point is near an active station", () => {
    const dhakaToSylhet: Array<[number, number]> = [
      [90.41, 23.81],
      [90.75, 23.95],
      [90.98, 24.05],
      [91.4, 24.5],
      [91.87, 24.9],
    ];
    expect(floodStatusForRoute(dhakaToSylhet, [WARNING])).toBe("Warning");
  });

  it("is None when the route stays far from active stations", () => {
    const farRoute: Array<[number, number]> = [
      [91.87, 24.9],
      [91.9, 25.0],
      [92.0, 25.2],
    ];
    expect(floodStatusForRoute(farRoute, [WARNING])).toBe("None");
  });

  it("is None for an empty route", () => {
    expect(floodStatusForRoute([], [WARNING])).toBe("None");
  });
});
