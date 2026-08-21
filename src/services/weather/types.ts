export type CurrentWeather = {
  temperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  description: string;
  observedAt: string;
};

export type WeatherForecastDay = {
  date: string;
  minTemperature: number;
  maxTemperature: number;
  weatherCode: number;
  description: string;
};
export type AirQuality = {
  aqi: number;
  label: string;
  pm25: number;
  pm10: number;
  o3: number;
  no2: number;
  so2: number;
  co: number;
  nh3: number;
  observedAt: string;
};
export type AirQualityForecastPoint = Pick<
  AirQuality,
  "aqi" | "label" | "pm25" | "pm10" | "o3" | "observedAt"
>;
