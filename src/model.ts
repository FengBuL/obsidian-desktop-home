export const KINDS = ['clock', 'weather', 'calendar', 'recent', 'pinned'] as const;
export type WidgetKind = typeof KINDS[number];
export type WidgetSize = 's' | 'm' | 'l';
export type Theme = 'sky' | 'midnight' | 'paper';
export interface Widget { id: string; kind: WidgetKind; size: WidgetSize }
export interface City { name: string; latitude: number; longitude: number; region?: string }
export interface WeatherSnapshot { locationKey: string; temperature: number; code: number; updatedAt: number; days: { date: string; high: number; low: number; code: number }[] }
export interface Settings {
  version: 1; theme: Theme; wallpaper: 'alpine' | 'dusk' | 'custom'; customImage: string;
  dim: number; blur: number; clock24: boolean; openOnStart: boolean;
  widgets: Widget[]; pins: string[]; city: City | null; weatherCache: WeatherSnapshot | null;
}
export const WIDGET_NAMES: Record<WidgetKind, string> = { clock: '时钟', weather: '天气', calendar: '日历', recent: '最近笔记', pinned: '固定笔记' };
export function defaultSettings(): Settings {
  return { version: 1, theme: 'sky', wallpaper: 'alpine', customImage: '', dim: 0.12, blur: 0, clock24: true, openOnStart: false,
    widgets: [ { id: 'clock', kind: 'clock', size: 's' }, { id: 'weather', kind: 'weather', size: 'm' }, { id: 'calendar', kind: 'calendar', size: 's' }, { id: 'recent', kind: 'recent', size: 'l' }, { id: 'pinned', kind: 'pinned', size: 's' } ], pins: [], city: null, weatherCache: null };
}
export const record = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
export function validCity(x: unknown): x is City {
  return record(x) && typeof x.name === 'string' && x.name.length > 0 && x.name.length < 200 && finite(x.latitude) && Math.abs(x.latitude) <= 90 && finite(x.longitude) && Math.abs(x.longitude) <= 180;
}
export function validWeather(x: unknown): x is WeatherSnapshot {
  return record(x) && typeof x.locationKey === 'string' && finite(x.temperature) && finite(x.code) && finite(x.updatedAt) && Array.isArray(x.days) && x.days.length > 0 && x.days.length <= 7 && x.days.every(d => record(d) && typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && finite(d.high) && finite(d.low) && finite(d.code));
}
export function normalizeSettings(input: unknown): Settings {
  const defaults = defaultSettings(); if (!record(input)) return defaults;
  const s = { ...defaults };
  if (['sky', 'midnight', 'paper'].includes(String(input.theme))) s.theme = input.theme as Theme;
  if (['alpine', 'dusk', 'custom'].includes(String(input.wallpaper))) s.wallpaper = input.wallpaper as Settings['wallpaper'];
  if (typeof input.customImage === 'string' && input.customImage.length < 8_000_000 && /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=\s]+$/.test(input.customImage)) s.customImage = input.customImage;
  if (s.wallpaper === 'custom' && !s.customImage) s.wallpaper = 'alpine';
  if (finite(input.dim)) s.dim = Math.min(0.65, Math.max(0, input.dim));
  if (finite(input.blur)) s.blur = Math.min(20, Math.max(0, input.blur));
  if (typeof input.clock24 === 'boolean') s.clock24 = input.clock24;
  if (typeof input.openOnStart === 'boolean') s.openOnStart = input.openOnStart;
  if (Array.isArray(input.widgets)) {
    const seen = new Set<string>();
    s.widgets = input.widgets.filter(record).filter(w => {
      if (typeof w.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(w.id) || !KINDS.includes(w.kind as WidgetKind) || seen.has(w.id)) return false;
      seen.add(w.id); return true;
    }).slice(0, 20).map(w => ({ id: w.id as string, kind: w.kind as WidgetKind, size: ['s', 'm', 'l'].includes(String(w.size)) ? w.size as WidgetSize : 'm' }));
  }
  if (Array.isArray(input.pins)) s.pins = [...new Set(input.pins.filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length < 2048))].slice(0, 100);
  if (validCity(input.city)) s.city = { name: input.city.name, latitude: input.city.latitude, longitude: input.city.longitude, region: typeof input.city.region === 'string' ? input.city.region : undefined };
  if (s.city && validWeather(input.weatherCache)) s.weatherCache = input.weatherCache;
  return s;
}
export function moveWidget(s: Settings, id: string, to: number): Settings {
  const from = s.widgets.findIndex(w => w.id === id);
  if (from < 0 || !Number.isFinite(to) || to < 0 || to >= s.widgets.length) return s;
  const widgets = s.widgets.slice(); const [widget] = widgets.splice(from, 1); widgets.splice(Math.trunc(to), 0, widget);
  return { ...s, widgets };
}
export function resizeWidget(s: Settings, id: string, size: WidgetSize): Settings { return { ...s, widgets: s.widgets.map(w => w.id === id ? { ...w, size } : w) }; }
export function togglePin(s: Settings, path: string): Settings { return { ...s, pins: s.pins.includes(path) ? s.pins.filter(p => p !== path) : [...s.pins, path].slice(-100) }; }
export function renamePinnedPaths(s: Settings, oldPath: string, newPath: string): Settings {
  const pins = s.pins.map(path => path === oldPath ? newPath : path.startsWith(`${oldPath}/`) ? `${newPath}${path.slice(oldPath.length)}` : path);
  if (pins.every((path, index) => path === s.pins[index])) return s;
  return { ...s, pins: [...new Set(pins)] };
}
export function widgetSpan(w: Widget): [number, number] {
  if (w.size === 's') return [2, 2];
  if (w.size === 'm') return [4, 2];
  return w.kind === 'recent' || w.kind === 'pinned' ? [6, 2] : [4, 4];
}
