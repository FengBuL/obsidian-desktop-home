export const KINDS = ['clock', 'weather', 'calendar', 'recent', 'pinned', 'tasks', 'memo'] as const;
export type WidgetKind = typeof KINDS[number];
export type WidgetSize = 's' | 'm' | 'l';
export const THEMES = ['auto', 'sky', 'midnight', 'paper'] as const;
export type Theme = typeof THEMES[number];
export const WALLPAPERS = ['alpine', 'dusk', 'custom', 'vault'] as const;
export type WallpaperKind = typeof WALLPAPERS[number];
export interface Widget { id: string; kind: WidgetKind; size: WidgetSize }
export interface City { name: string; latitude: number; longitude: number; region?: string }
export interface WeatherSnapshot { locationKey: string; temperature: number; code: number; updatedAt: number; isDay?: boolean; days: { date: string; high: number; low: number; code: number }[] }
export interface Settings {
  version: 1; theme: Theme; wallpaper: WallpaperKind; customImage: string; wallpaperPath: string;
  dim: number; blur: number; clock24: boolean; openOnStart: boolean;
  widgets: Widget[]; pins: string[]; city: City | null; weatherCache: WeatherSnapshot | null;
  /** 便签组件的文字，只保存在本地插件配置。 */
  memo: string;
  /** 日记：跟随核心「日记」插件，或使用下面的文件夹与格式。 */
  dailyFollowCore: boolean; dailyFolder: string; dailyFormat: string;
  /** 搜索、最近笔记与固定笔记选择中忽略的文件夹。 */
  excludeFolders: string[];
}
export const WIDGET_NAMES: Record<WidgetKind, string> = { clock: '时钟', weather: '天气', calendar: '日历', recent: '最近笔记', pinned: '固定笔记', tasks: '待办', memo: '便签' };
export const MEMO_LIMIT = 20_000;
export function defaultSettings(): Settings {
  return { version: 1, theme: 'auto', wallpaper: 'alpine', customImage: '', wallpaperPath: '', dim: 0.12, blur: 0, clock24: true, openOnStart: false,
    widgets: [ { id: 'clock', kind: 'clock', size: 's' }, { id: 'weather', kind: 'weather', size: 'm' }, { id: 'calendar', kind: 'calendar', size: 's' }, { id: 'recent', kind: 'recent', size: 'l' }, { id: 'pinned', kind: 'pinned', size: 's' } ],
    pins: [], city: null, weatherCache: null, memo: '', dailyFollowCore: true, dailyFolder: '日记', dailyFormat: 'YYYY-MM-DD', excludeFolders: [] };
}
export const record = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const oneOf = <T extends string>(list: readonly T[], x: unknown): x is T => typeof x === 'string' && (list as readonly string[]).includes(x);
export function validCity(x: unknown): x is City {
  return record(x) && typeof x.name === 'string' && x.name.length > 0 && x.name.length < 200 && finite(x.latitude) && Math.abs(x.latitude) <= 90 && finite(x.longitude) && Math.abs(x.longitude) <= 180;
}
export function validWeather(x: unknown): x is WeatherSnapshot {
  return record(x) && typeof x.locationKey === 'string' && finite(x.temperature) && finite(x.code) && finite(x.updatedAt) && Array.isArray(x.days) && x.days.length > 0 && x.days.length <= 7 && x.days.every(d => record(d) && typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && finite(d.high) && finite(d.low) && finite(d.code));
}
/** 去掉首尾斜杠与空白，空字符串表示库根目录。 */
export function cleanFolder(folder: string): string { return folder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/'); }
export function parseFolderList(text: string): string[] { return [...new Set(text.split(/[\n,，]/).map(cleanFolder).filter(Boolean))].slice(0, 50); }
export function normalizeSettings(input: unknown): Settings {
  const defaults = defaultSettings(); if (!record(input)) return defaults;
  const s = { ...defaults };
  if (oneOf(THEMES, input.theme)) s.theme = input.theme;
  if (oneOf(WALLPAPERS, input.wallpaper)) s.wallpaper = input.wallpaper;
  if (typeof input.customImage === 'string' && input.customImage.length < 8_000_000 && /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=\s]+$/.test(input.customImage)) s.customImage = input.customImage;
  if (typeof input.wallpaperPath === 'string' && input.wallpaperPath.length < 2048 && /\.(png|jpe?g|webp|gif|avif)$/i.test(input.wallpaperPath)) s.wallpaperPath = input.wallpaperPath;
  if (s.wallpaper === 'custom' && !s.customImage) s.wallpaper = 'alpine';
  if (s.wallpaper === 'vault' && !s.wallpaperPath) s.wallpaper = 'alpine';
  if (finite(input.dim)) s.dim = Math.min(0.65, Math.max(0, input.dim));
  if (finite(input.blur)) s.blur = Math.min(20, Math.max(0, input.blur));
  if (typeof input.clock24 === 'boolean') s.clock24 = input.clock24;
  if (typeof input.openOnStart === 'boolean') s.openOnStart = input.openOnStart;
  if (Array.isArray(input.widgets)) {
    const seen = new Set<string>();
    s.widgets = input.widgets.filter(record).flatMap(w => {
      if (typeof w.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(w.id) || !oneOf(KINDS, w.kind) || seen.has(w.id)) return [];
      seen.add(w.id); return [{ id: w.id, kind: w.kind, size: oneOf(['s', 'm', 'l'] as const, w.size) ? w.size : 'm' }];
    }).slice(0, 20);
  }
  if (Array.isArray(input.pins)) s.pins = [...new Set(input.pins.filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length < 2048))].slice(0, 100);
  if (validCity(input.city)) s.city = { name: input.city.name, latitude: input.city.latitude, longitude: input.city.longitude, region: typeof input.city.region === 'string' ? input.city.region : undefined };
  if (s.city && validWeather(input.weatherCache)) s.weatherCache = input.weatherCache;
  if (typeof input.memo === 'string') s.memo = input.memo.slice(0, MEMO_LIMIT);
  if (typeof input.dailyFollowCore === 'boolean') s.dailyFollowCore = input.dailyFollowCore;
  if (typeof input.dailyFolder === 'string' && input.dailyFolder.length < 500) s.dailyFolder = cleanFolder(input.dailyFolder);
  if (typeof input.dailyFormat === 'string' && input.dailyFormat.trim() && input.dailyFormat.length < 100) s.dailyFormat = input.dailyFormat.trim();
  if (Array.isArray(input.excludeFolders)) s.excludeFolders = parseFolderList(input.excludeFolders.filter((f): f is string => typeof f === 'string').join('\n'));
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
  const move = (path: string) => path === oldPath ? newPath : path.startsWith(`${oldPath}/`) ? `${newPath}${path.slice(oldPath.length)}` : path;
  const pins = s.pins.map(move); const wallpaperPath = s.wallpaperPath ? move(s.wallpaperPath) : '';
  if (pins.every((path, index) => path === s.pins[index]) && wallpaperPath === s.wallpaperPath) return s;
  return { ...s, pins: [...new Set(pins)], wallpaperPath };
}
export function defaultSize(kind: WidgetKind): WidgetSize { return kind === 'recent' ? 'l' : kind === 'weather' || kind === 'tasks' || kind === 'memo' ? 'm' : 's'; }
export function widgetSpan(w: Widget): [number, number] {
  if (w.size === 's') return [2, 2];
  if (w.size === 'm') return [4, 2];
  return w.kind === 'recent' || w.kind === 'pinned' ? [6, 2] : [4, 4];
}
/** 判断路径是否位于某个排除文件夹（含子文件夹）。 */
export function isExcluded(path: string, folders: readonly string[]): boolean { return folders.some(f => path === f || path.startsWith(`${f}/`)); }
