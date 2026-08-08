export const AQI_LABELS: Record<number, string> = { 1: "Good", 2: "Fair", 3: "Moderate", 4: "Poor", 5: "Very Poor" };
export function aqiLabel(aqi: number) { return AQI_LABELS[aqi] ?? "Unknown"; }