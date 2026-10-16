import { describe, expect, it } from 'vitest';
import { defaultSettings, normalizeSettings, moveWidget, resizeWidget, togglePin, widgetSpan, renamePinnedPaths } from '../src/model';

describe('saved desktop configuration', () => {
  it('creates independent defaults with the five desktop widgets', () => {
    const a = defaultSettings(); const b = defaultSettings();
    expect(a.widgets.map(w => w.kind)).toEqual(['clock', 'weather', 'calendar', 'recent', 'pinned']);
    a.widgets.pop();
    expect(b.widgets).toHaveLength(5);
  });
  it('recovers corrupt input and validates theme, size, and wallpaper', () => {
    expect(normalizeSettings(null)).toEqual(defaultSettings());
    const settings = normalizeSettings({ theme: '<script>', wallpaper: 'custom', customImage: 'javascript:alert(1)', dim: 5, blur: -1,
      widgets: [{ id: 'a', kind: 'recent', size: 'giant' }, { id: 'a', kind: 'clock', size: 's' }, { id: 'b', kind: 'unknown' }] });
    expect(settings.theme).toBe('sky');
    expect(settings.wallpaper).toBe('alpine');
    expect(settings.customImage).toBe('');
    expect(settings.dim).toBeLessThanOrEqual(0.65);
    expect(settings.blur).toBeGreaterThanOrEqual(0);
    expect(settings.widgets).toEqual([{ id: 'a', kind: 'recent', size: 'm' }]);
  });
  it('preserves an intentionally empty desktop and deduplicates pinned paths', () => {
    const settings = normalizeSettings({ widgets: [], pins: ['A.md', 'A.md', 3, '', 'B.md'] });
    expect(settings.widgets).toEqual([]);
    expect(settings.pins).toEqual(['A.md', 'B.md']);
  });
  it('moves and resizes a widget without changing theme or pins', () => {
    const settings = defaultSettings(); settings.pins = ['Keep.md'];
    const moved = moveWidget(settings, settings.widgets[0].id, 3);
    expect(moved.widgets[3].kind).toBe('clock');
    expect(settings.widgets[0].kind).toBe('clock');
    const resized = resizeWidget(moved, moved.widgets[3].id, 'l');
    expect(resized.widgets[3].size).toBe('l');
    expect(resized.theme).toBe(settings.theme);
    expect(resized.pins).toEqual(['Keep.md']);
    expect(moveWidget(settings, 'missing', 2)).toEqual(settings);
  });
  it('pins and unpins paths and uses different footprints for expanded content', () => {
    expect(togglePin(defaultSettings(), 'Daily.md').pins).toEqual(['Daily.md']);
    expect(togglePin(togglePin(defaultSettings(), 'Daily.md'), 'Daily.md').pins).toEqual([]);
    expect(widgetSpan({ id: 'r', kind: 'recent', size: 'l' })).toEqual([6, 2]);
    expect(widgetSpan({ id: 'w', kind: 'weather', size: 'l' })).toEqual([4, 4]);
  });
  it('follows renamed files and folders using full path boundaries', () => {
    const s = defaultSettings(); s.pins = ['Work/A.md', 'Workshop/B.md', 'Work/Sub/C.md'];
    const moved = renamePinnedPaths(s, 'Work', 'Archive');
    expect(moved.pins).toEqual(['Archive/A.md', 'Workshop/B.md', 'Archive/Sub/C.md']);
    expect(renamePinnedPaths(moved, 'Archive/A.md', 'Archive/New.md').pins[0]).toBe('Archive/New.md');
    expect(s.pins[0]).toBe('Work/A.md');
    expect(renamePinnedPaths(s, 'Missing.md', 'New.md')).toBe(s);
  });
});
