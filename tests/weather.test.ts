import { describe, expect, it } from 'vitest';
import { cityResults, parseForecast, forecastUrl, weatherDescription, WeatherService } from '../src/weather';
const city = { name: 'Tokyo', latitude: 35.68, longitude: 139.69 };
const response = { current: { temperature_2m: 21.4, weather_code: 0 }, daily: {
  time: ['2026-10-16', '2026-10-17'], temperature_2m_max: [23, 22], temperature_2m_min: [17, 16], weather_code: [0, 3] } };
describe('weather data boundaries', () => {
  it('validates cities and discards incomplete forecast data', () => {
    expect(cityResults({ results: [{ name: 'Tokyo', latitude: 35.68, longitude: 139.69 }, { name: 'Bad', latitude: 200, longitude: 0 }] })).toHaveLength(1);
    expect(() => parseForecast({ current: {} }, city, 100)).toThrow();
    const parsed = parseForecast(response, city, 100);
    expect(parsed.temperature).toBe(21);
    expect(parsed.days[0].low).toBe(17);
    expect(parsed.updatedAt).toBe(100);
  });
  it('encodes coordinates and translates weather codes', () => {
    expect(forecastUrl(city)).toContain('latitude=35.68');
    expect(forecastUrl(city)).toContain('timezone=auto');
    expect(weatherDescription(0)).toBe('晴朗');
    expect(weatherDescription(95)).toBe('雷雨');
    expect(weatherDescription(53)).toBe('毛毛雨'); expect(weatherDescription(86)).toBe('阵雪'); expect(weatherDescription(45)).toBe('有雾');
  });
  it('reuses fresh cache and returns old data as stale when the network fails', async () => {
    let requests = 0;
    const get = async () => { requests++; return response; };
    const service = new WeatherService(get);
    const first = await service.load(city, null, 1000);
    const cached = await service.load(city, first.data, 2000);
    expect(requests).toBe(1);
    expect(cached.stale).toBe(false);
    const offline = new WeatherService(async () => { throw new Error('offline'); });
    const fallback = await offline.load(city, first.data, 3_000_000);
    expect(fallback.stale).toBe(true);
    expect(fallback.data.temperature).toBe(21);
    await expect(offline.load({ ...city, name: 'Elsewhere', latitude: 0 }, first.data, 3_000_000)).rejects.toThrow();
  });
});
