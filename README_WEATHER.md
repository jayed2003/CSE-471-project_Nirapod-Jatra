# Environmental Data

## Providers

- Open-Meteo supplies current weather and five-day forecasts without an API key.
- OpenWeather Air Pollution supplies AQI and pollutant readings. Requests run only on the server through `/api/environment`, so the key is never included in browser bundles.
- OpenWeather forecast and Fire Weather Index services exist behind disabled feature flags in `src/services/weather/`.

## Setup

Create `.env.local` with `OPENWEATHER_API_KEY=your-key`. This file is ignored by Git. Copy `.env.example` for the remaining local configuration. Restart `npm run dev` after changing environment variables.

## Location

The dashboard starts in Dhaka at `23.8103, 90.4125`. Planning a destination updates each card using the selected longitude and latitude. Components also accept coordinates directly:

```tsx
<WeatherCard lat={23.8103} lon={90.4125} />
<ForecastCard lat={23.8103} lon={90.4125} />
<AirQualityCard lat={23.8103} lon={90.4125} />
<AirQualityForecastCard lat={23.8103} lon={90.4125} />
```

## Caching and limits

Weather and AQI data are cached independently by `latitude,longitude` for 10 minutes. Concurrent requests share one in-flight request. Each provider request uses a 10-second timeout and retries once for network failures. Open-Meteo requires no key; respect OpenWeather plan limits when choosing refresh frequency.

## Normalized responses

Current weather returns `{ temperature, humidity, windSpeed, weatherCode, description, observedAt }`. Air quality returns `{ aqi, label, pm25, pm10, o3, no2, so2, co, nh3, observedAt }`, with OpenWeather AQI levels mapped from Good through Very Poor.
