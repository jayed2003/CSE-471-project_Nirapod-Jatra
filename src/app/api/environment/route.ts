import { NextRequest, NextResponse } from "next/server";
import { getAirQuality, getAirQualityForecast, getCurrentWeather, getWeatherForecast } from "@/services/weather";

const coordinates = (request: NextRequest) => {
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error("Invalid coordinates");
  return { latitude, longitude };
};

export async function GET(request: NextRequest) {
  try {
    const { latitude, longitude } = coordinates(request);
    const scope = request.nextUrl.searchParams.get("scope") ?? "all";
    if (scope === "weather") return NextResponse.json(await Promise.all([getCurrentWeather(latitude, longitude), getWeatherForecast(latitude, longitude)]).then(([current, forecast]) => ({ current, forecast })));
    if (scope === "air") return NextResponse.json(await Promise.all([getAirQuality(latitude, longitude), getAirQualityForecast(latitude, longitude)]).then(([current, forecast]) => ({ current, forecast })));
    const [weather, air] = await Promise.all([
      Promise.all([getCurrentWeather(latitude, longitude), getWeatherForecast(latitude, longitude)]),
      Promise.all([getAirQuality(latitude, longitude), getAirQualityForecast(latitude, longitude)]),
    ]);
    return NextResponse.json({ weather: { current: weather[0], forecast: weather[1] }, air: { current: air[0], forecast: air[1] } });
  } catch (error) {
    const status = error instanceof Error && error.message === "Invalid coordinates" ? 400 : 503;
    return NextResponse.json({ error: "Environmental data unavailable." }, { status });
  }
}