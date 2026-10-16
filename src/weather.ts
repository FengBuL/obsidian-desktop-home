import { record, validCity, validWeather, type City, type WeatherSnapshot } from './model';
export type GetJson = (url: string) => Promise<unknown>;
export function cityResults(data: unknown): City[] {
  if (!record(data) || !Array.isArray(data.results)) return [];
  return data.results.filter(validCity).map(c => ({ name: c.name, latitude: c.latitude, longitude: c.longitude,
    region: [record(c) ? c.admin1 : '', record(c) ? c.country : ''].filter(x => typeof x === 'string').join(' · ') }));
}
export const locationKey = (city: City) => `${city.latitude},${city.longitude}`;
export function forecastUrl(city: City): string {
  if (!validCity(city)) throw new Error('城市坐标无效');
  return `https://api.open-meteo.com/v1/forecast?${new URLSearchParams({ latitude: String(city.latitude), longitude: String(city.longitude), current: 'temperature_2m,weather_code', daily: 'weather_code,temperature_2m_max,temperature_2m_min', timezone: 'auto', forecast_days: '5' })}`;
}
export function parseForecast(input: unknown, city: City, now = Date.now()): WeatherSnapshot {
  if (!record(input) || !record(input.current) || !record(input.daily)) throw new Error('天气数据格式异常');
  const d = input.daily;
  if (![d.time, d.temperature_2m_max, d.temperature_2m_min, d.weather_code].every(Array.isArray)) throw new Error('天气预报不完整');
  const result = { locationKey: locationKey(city), temperature: Math.round(input.current.temperature_2m as number), code: input.current.weather_code, updatedAt: now,
    days: (d.time as unknown[]).slice(0, 5).map((date, i) => ({ date, high: (d.temperature_2m_max as unknown[])[i], low: (d.temperature_2m_min as unknown[])[i], code: (d.weather_code as unknown[])[i] })) };
  if (typeof input.current.temperature_2m !== 'number' || !validWeather(result)) throw new Error('天气数据无效');
  return result;
}
export function weatherDescription(code: number): string {
  if (code === 0) return '晴朗'; if (code < 3) return '晴间多云'; if (code === 3) return '多云';
  if (code < 50) return '有雾'; if (code < 70) return '有雨'; if (code < 80) return '有雪'; if (code < 90) return '阵雨'; return '雷雨';
}
export class WeatherService {
  constructor(private get: GetJson) {}
  async cities(name: string): Promise<City[]> {
    return cityResults(await this.request(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name, count: '8', language: 'zh', format: 'json' })}`));
  }
  async load(city: City, cache: WeatherSnapshot | null, now = Date.now(), force = false): Promise<{ data: WeatherSnapshot; stale: boolean }> {
    const usable = cache && validWeather(cache) && cache.locationKey === locationKey(city) ? cache : null;
    if (!force && usable && now >= usable.updatedAt && now - usable.updatedAt < 30 * 60_000) return { data: usable, stale: false };
    try { return { data: parseForecast(await this.request(forecastUrl(city)), city, now), stale: false }; }
    catch (error) { if (usable) return { data: usable, stale: true }; throw error; }
  }
  private async request(url: string): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([this.get(url), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('天气服务连接超时')), 12_000); })]); }
    finally { clearTimeout(timer); }
  }
}
