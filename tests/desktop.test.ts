import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Desktop } from '../src/ui/desktop';
import { defaultSettings, type Settings } from '../src/model';
import type { DesktopHost } from '../src/host';
const notes = [{ path: 'Ideas.md', title: '想法收集', modified: 100 }, { path: 'Journal.md', title: '<script>alert(1)</script>', modified: 50 }];
let desktop: Desktop;
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { desktop?.destroy(); await Promise.resolve(); document.body.replaceChildren(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
function setup(saved = defaultSettings()) {
  const root = document.createElement('div'); document.body.append(root);
  const save = vi.fn(async (_settings: Settings) => {});
  const notify = vi.fn(); const openNote = vi.fn(async (_path: string) => {});
  let notifyChange: (change?: { oldPath: string; newPath: string }) => void = () => {};
  const getNotes = vi.fn(() => notes); const getRecent = vi.fn(() => notes);
  const host: DesktopHost = { preview: true, wallpaperUrl: '/wallpaper.png', getNotes, getRecent, openNote, openDaily: async () => {}, save, getJson: async () => ({}), notify, subscribe: fn => { notifyChange = fn; return () => {}; } };
  desktop = new Desktop(root, host, saved); desktop.mount(); return { root, save, notify, openNote, getNotes, emit: (event?: { oldPath: string; newPath: string }) => notifyChange(event) };
}
function click(label: string) { const btn = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`); expect(btn, label).not.toBeNull(); btn!.click(); }
describe('desktop interaction', () => {
  it('renders five widgets and treats note titles as plain text', () => {
    const { root } = setup();
    expect(root.querySelectorAll('.dh-widget')).toHaveLength(5);
    expect(root.querySelector('script')).toBeNull();
    expect(root.textContent).toContain('<script>alert(1)</script>');
  });
  it('searches locally and opens the matching note with Enter', async () => {
    const { openNote } = setup();
    const input = document.querySelector<HTMLInputElement>('[aria-label="搜索笔记"]')!;
    input.value = '想法'; input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();
    expect(openNote).toHaveBeenCalledWith('Ideas.md');
  });
  it('resizes and removes widgets only through editing controls, then adds one back', async () => {
    const { root, save } = setup();
    expect(root.querySelector('[aria-label="天气尺寸"]')).toBeNull();
    click('编辑桌面');
    const select = root.querySelector<HTMLSelectElement>('[aria-label="天气尺寸"]')!;
    select.value = 'l'; select.dispatchEvent(new Event('change'));
    await vi.advanceTimersByTimeAsync(300);
    expect(save.mock.calls.at(-1)?.[0].widgets.find(w => w.kind === 'weather')?.size).toBe('l');
    click('移除天气'); expect(root.querySelectorAll('.dh-widget')).toHaveLength(4);
    click('添加组件'); click('添加天气');
    expect(root.querySelectorAll('.dh-widget')).toHaveLength(5);
  });
  it('changes theme without resetting layout and persists settings', async () => {
    const saved = defaultSettings(); saved.widgets.reverse();
    const { root, save } = setup(saved);
    click('桌面外观'); click('午夜');
    await vi.advanceTimersByTimeAsync(300);
    expect(root.dataset.theme).toBe('midnight');
    expect(save.mock.calls.at(-1)?.[0].widgets.map(w => w.id)).toEqual(saved.widgets.map(w => w.id));
  });
  it('reports persistence failures and keeps controls usable', async () => {
    const { save, notify } = setup(); save.mockRejectedValueOnce(new Error('disk full'));
    click('桌面外观'); click('暖纸');
    await vi.advanceTimersByTimeAsync(300);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('保存失败'));
    click('晴空');
    expect(document.querySelector('.dh-desktop')?.getAttribute('data-theme')).toBe('sky');
  });
  it('retries a failed save from the editing toolbar', async () => {
    const { save, root } = setup(); save.mockRejectedValueOnce(new Error('disk full'));
    click('编辑桌面'); click('移除天气'); await vi.advanceTimersByTimeAsync(300);
    click('重试保存'); await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(root.querySelector('.dh-save-status')?.textContent).toBe('已保存');
  });
  it('removes all UI and timers on destroy', () => {
    vi.useFakeTimers(); const { root } = setup(); desktop.destroy();
    expect(root.childElementCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0); vi.useRealTimers();
  });
  it('keeps widget DOM and clock hands in place while appearance changes', () => {
    const { root } = setup(); const clock = root.querySelector('.dh-clock-face'); const weather = root.querySelector('.dh-widget-weather');
    click('桌面外观'); click('午夜');
    expect(root.querySelector('.dh-clock-face')).toBe(clock);
    expect(root.querySelector('.dh-widget-weather')).toBe(weather);
    const slider = root.querySelector<HTMLInputElement>('[aria-label="壁纸模糊"]')!;
    slider.value = '8'; slider.dispatchEvent(new Event('input'));
    expect(root.querySelector('.dh-clock-face')).toBe(clock);
  });
  it('keeps focus on the size control and retains unrelated widgets', () => {
    const { root } = setup(); click('编辑桌面'); const clock = root.querySelector('.dh-clock-face');
    const select = root.querySelector<HTMLSelectElement>('[aria-label="天气尺寸"]')!;
    select.focus(); select.value = 'l'; select.dispatchEvent(new Event('change'));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('天气尺寸');
    expect(root.querySelector('.dh-clock-face')).toBe(clock);
  });
  it('keeps an accessible focus target after removing the last widget', () => {
    const initial = defaultSettings(); initial.widgets = [initial.widgets[0]];
    const { root } = setup(initial); click('编辑桌面');
    const remove = root.querySelector<HTMLButtonElement>('[aria-label="移除时钟"]')!;
    remove.focus(); remove.click();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('添加第一个组件');
  });
  it('scans notes once for the board, then reuses the snapshot on appearance changes', () => {
    const { getNotes } = setup(); expect(getNotes).toHaveBeenCalledTimes(1);
    click('桌面外观'); click('暖纸'); expect(getNotes).toHaveBeenCalledTimes(1);
  });
  it('undoes a layout change and restores defaults without changing theme or pins', async () => {
    const initial = defaultSettings(); initial.theme = 'paper'; initial.pins = ['Ideas.md'];
    const { root, save } = setup(initial); click('编辑桌面'); click('移除天气');
    click('撤销布局修改'); expect(root.querySelectorAll('.dh-widget')).toHaveLength(5);
    click('移除天气'); click('恢复默认布局');
    await vi.advanceTimersByTimeAsync(300);
    expect(save.mock.calls.at(-1)?.[0].widgets).toEqual(defaultSettings().widgets);
    expect(save.mock.calls.at(-1)?.[0].theme).toBe('paper'); expect(save.mock.calls.at(-1)?.[0].pins).toEqual(['Ideas.md']);
    click('撤销布局修改'); expect(root.querySelectorAll('.dh-widget')).toHaveLength(4);
  });
  it('rebases a pending layout save on a renamed pinned folder', async () => {
    const initial = defaultSettings(); initial.pins = ['Work/A.md', 'Workshop/B.md'];
    const { root, save, emit } = setup(initial); click('编辑桌面'); click('移除天气');
    emit({ oldPath: 'Work', newPath: 'Projects' }); await vi.advanceTimersByTimeAsync(300);
    expect(root.querySelectorAll('.dh-widget')).toHaveLength(4);
    expect(save.mock.calls.at(-1)?.[0].pins).toEqual(['Projects/A.md', 'Workshop/B.md']);
  });
  it('loads configured weather when restoring a layout that had weather removed', async () => {
    const initial = defaultSettings(); initial.widgets = initial.widgets.filter(w => w.kind !== 'weather');
    initial.city = { name: 'Tokyo', latitude: 35, longitude: 139 };
    initial.weatherCache = { locationKey: '35,139', temperature: 21, code: 0, updatedAt: Date.now(), days: [{ date: '2026-10-16', high: 25, low: 18, code: 0 }] };
    const { root } = setup(initial); click('编辑桌面'); click('恢复默认布局');
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.dh-widget-weather')?.textContent).toContain('21°');
  });
});
