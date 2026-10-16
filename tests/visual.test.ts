import { describe, expect, it } from 'vitest';
import { folderOf, relativeTime, toneOf } from '../src/notes';
import { glyphKind, skyTone, weatherGlyph } from '../src/ui/weather-glyphs';
import { forecastUrl, parseForecast } from '../src/weather';

describe('note presentation helpers', () => {
  const now = new Date(2026, 9, 16, 15, 0).getTime();
  it('formats relative times in Chinese', () => {
    expect(relativeTime(now - 10_000, now)).toBe('刚刚');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 分钟前');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 小时前');
    expect(relativeTime(new Date(2026, 9, 15, 22).getTime(), now)).toBe('昨天');
    expect(relativeTime(new Date(2026, 9, 12, 9).getTime(), now)).toBe('4 天前');
    expect(relativeTime(new Date(2026, 8, 1).getTime(), now)).toBe('9月1日');
  });
  it('assigns stable tones and folder names', () => {
    expect(toneOf('项目/计划.md')).toBe(toneOf('项目/计划.md'));
    expect(toneOf('a')).toBeGreaterThanOrEqual(0); expect(toneOf('a')).toBeLessThan(6);
    expect(folderOf('工作/项目/计划.md')).toBe('项目'); expect(folderOf('计划.md')).toBe('');
  });
});
describe('weather glyphs', () => {
  it('maps WMO codes and day/night to glyphs and sky tones', () => {
    expect(glyphKind(0, true)).toBe('sun'); expect(glyphKind(0, false)).toBe('moon');
    expect(glyphKind(95, true)).toBe('thunder'); expect(glyphKind(71, true)).toBe('snow'); expect(glyphKind(45, true)).toBe('fog');
    expect(skyTone(0, true)).toBe('clear'); expect(skyTone(0, false)).toBe('night'); expect(skyTone(61, true)).toBe('rain'); expect(skyTone(95, true)).toBe('storm');
  });
  it('builds SVG through the DOM with unique gradient ids', () => {
    const a = weatherGlyph(document, 2, true); const b = weatherGlyph(document, 2, true);
    expect(a.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(a.getAttribute('aria-hidden')).toBe('true');
    const ids = (svg: SVGElement) => [...svg.querySelectorAll('[id]')].map(n => n.id);
    expect(ids(a).length).toBeGreaterThan(0); expect(ids(a).some(id => ids(b).includes(id))).toBe(false);
  });
  it('requests and parses day/night state', () => {
    const city = { name: 'Tokyo', latitude: 35.68, longitude: 139.69 };
    expect(forecastUrl(city)).toContain('is_day');
    const daily = { time: ['2026-10-16'], temperature_2m_max: [23], temperature_2m_min: [17], weather_code: [0] };
    expect(parseForecast({ current: { temperature_2m: 20, weather_code: 0, is_day: 0 }, daily }, city, 1).isDay).toBe(false);
    expect(parseForecast({ current: { temperature_2m: 20, weather_code: 0, is_day: 1 }, daily }, city, 1).isDay).toBe(true);
    expect(parseForecast({ current: { temperature_2m: 20, weather_code: 0 }, daily }, city, 1).isDay).toBeUndefined();
  });
});
