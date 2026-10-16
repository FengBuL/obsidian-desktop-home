import { describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', () => {
  class TAbstractFile { constructor(public path = '') {} }
  class TFile extends TAbstractFile {
    basename: string; extension: string; stat: { mtime: number };
    constructor(path = '', mtime = 1) { super(path); this.basename = path.split('/').pop()?.replace(/\.md$/, '') ?? ''; this.extension = path.split('.').pop() ?? ''; this.stat = { mtime }; }
  }
  class TFolder extends TAbstractFile { isRoot() { return this.path === '/'; } }
  const pad = (n: number) => String(n).padStart(2, '0');
  const moment = (d: Date = new Date()) => ({ format: (f: string) => f.replace('YYYY', String(d.getFullYear())).replace('MM', pad(d.getMonth() + 1)).replace('DD', pad(d.getDate())).replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())) });
  return {
    Plugin: class { registerView() {} addRibbonIcon() {} addCommand() {} addSettingTab() {} registerEvent() {} register() {} },
    ItemView: class {}, PluginSettingTab: class {}, Setting: class {}, Notice: class {}, Platform: { isMobile: false },
    TAbstractFile, TFile, TFolder, moment,
    normalizePath: (p: string) => p.replace(/\/+/g, '/'), requestUrl: vi.fn(),
  };
});
import Plugin from '../src/main';
import { TFile, TFolder } from 'obsidian';
import { defaultSettings } from '../src/model';
import { localDate } from '../src/notes';
type Listener = (...args: unknown[]) => void;
// 测试替身的构造函数接受路径参数；真实 Obsidian 类型的构造函数没有参数。
const makeFile = (path: string, mtime = 1) => new (TFile as unknown as new (path: string, mtime?: number) => TFile)(path, mtime);
const makeFolder = (path: string) => new (TFolder as unknown as new (path: string) => TFolder)(path);
function setup() {
  const plugin = new Plugin({} as Plugin['app'], {} as Plugin['manifest']);
  const events = new Map<string, Listener>();
  const files = new Map<string, unknown>();
  const contents = new Map<string, string>();
  const openFile = vi.fn(async () => {});
  const create = vi.fn(async (path: string, text: string) => { const file = makeFile(path); files.set(path, file); contents.set(path, text); return file; });
  const createFolder = vi.fn(async (path: string) => { files.set(path, makeFolder(path)); });
  const getMarkdownFiles = vi.fn(() => [...files.values()].filter((f): f is TFile => f instanceof TFile && f.extension === 'md'));
  const listItems = new Map<string, { task?: string }[]>();
  plugin.app = {
    vault: {
      configDir: '.obsidian', getMarkdownFiles, getFiles: () => [...files.values()].filter(f => f instanceof TFile),
      getAbstractFileByPath: (p: string) => files.get(p) ?? null, create, createFolder,
      cachedRead: async (f: TFile) => contents.get(f.path) ?? '',
      process: async (f: TFile, fn: (text: string) => string) => { const next = fn(contents.get(f.path) ?? ''); contents.set(f.path, next); return next; },
      getResourcePath: (f: TFile) => `app://${f.path}`,
      on: (event: string, callback: Listener) => { events.set(event, callback); },
    },
    metadataCache: { getFileCache: (f: TFile) => ({ listItems: listItems.get(f.path) }), getFirstLinkpathDest: () => null, on: (event: string, callback: Listener) => { events.set(`meta:${event}`, callback); } },
    fileManager: { getNewFileParent: () => makeFolder('/') },
    workspace: { getLastOpenFiles: () => ['Gone.md', 'Existing.md'], getLeaf: () => ({ openFile }), on: () => {}, onLayoutReady: () => {} },
  } as unknown as Plugin['app'];
  plugin.manifest = { id: 'desktop-home', dir: '.obsidian/plugins/desktop-home' } as Plugin['manifest'];
  plugin.saveData = vi.fn(async () => {});
  plugin.loadData = async () => plugin.settings;
  const add = (path: string, text = '', mtime = 1) => { const file = makeFile(path, mtime); files.set(path, file); contents.set(path, text); return file; };
  return { plugin, files, contents, listItems, openFile, create, createFolder, events, getMarkdownFiles, add };
}
describe('Obsidian host adapter', () => {
  it('uses real vault metadata and opens only existing files in a tab', async () => {
    const { plugin, openFile, add } = setup();
    const file = add('Existing.md', '', 20);
    const host = plugin.host(); expect(host.getRecent().map(n => n.path)).toEqual(['Existing.md']);
    await host.openNote(file.path); expect(openFile).toHaveBeenCalledWith(file);
    await expect(host.openNote('Gone.md')).rejects.toThrow();
    expect(host.wallpaperUrl).toContain('alpine');
  });
  it('creates a daily note once, never overwrites it, and marks the day on the calendar', async () => {
    const { plugin, create, createFolder } = setup();
    await plugin.host().openDaily(); await plugin.host().openDaily();
    expect(createFolder).toHaveBeenCalledTimes(1); expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toBe(`日记/${localDate()}.md`);
    const now = new Date(); expect(plugin.host().dailyDays?.(now.getFullYear(), now.getMonth()).has(now.getDate())).toBe(true);
  });
  it('uses the configured daily folder when the core plugin is unavailable', async () => {
    const { plugin, create } = setup(); plugin.settings.dailyFolder = 'Journal/Daily';
    await plugin.host().openDaily(new Date(2026, 0, 5));
    expect(create.mock.calls[0][0]).toBe('Journal/Daily/2026-01-05.md');
  });
  it('caches the note list and only rebuilds it after structural changes', async () => {
    const { plugin, add, events, getMarkdownFiles } = setup(); add('A.md'); await plugin.onload();
    const host = plugin.host(); host.getNotes(); host.getNotes(); expect(getMarkdownFiles).toHaveBeenCalledTimes(1);
    const b = add('B.md', '', 5); events.get('create')?.(b);
    expect(host.getNotes().map(n => n.path).sort()).toEqual(['A.md', 'B.md']); expect(getMarkdownFiles).toHaveBeenCalledTimes(1);
    events.get('delete')?.(makeFolder('Old')); host.getNotes(); expect(getMarkdownFiles).toHaveBeenCalledTimes(2);
  });
  it('honours excluded folders for search data', async () => {
    const { plugin, add } = setup(); add('Templates/T.md'); add('Notes/N.md');
    await plugin.saveSettings({ ...plugin.settings, excludeFolders: ['Templates'] });
    expect(plugin.host().getNotes().map(n => n.path)).toEqual(['Notes/N.md']);
  });
  it('lists due tasks, completes the exact line, and appends new tasks to today\'s daily note', async () => {
    const { plugin, add, contents, listItems } = setup();
    add('Project.md', '- [ ] overdue 📅 2000-01-01\n- [ ] someday\n', 2); listItems.set('Project.md', [{ task: ' ' }]);
    const host = plugin.host(); const tasks = await host.getTasks!();
    expect(tasks.map(t => t.text)).toEqual(['overdue']);
    expect(await host.completeTask!(tasks[0])).toBe(true);
    expect(contents.get('Project.md')).toContain('- [x] overdue 📅 2000-01-01 ✅');
    expect(await host.completeTask!(tasks[0])).toBe(false);
    await host.addTask!('buy milk');
    expect(contents.get(`日记/${localDate()}.md`)).toContain('- [ ] buy milk');
  });
  it('creates a new note from a search query with a safe file name', async () => {
    const { plugin, create, openFile } = setup();
    await plugin.host().createNote!('a/b: idea?');
    expect(create.mock.calls[0][0]).toBe('a b idea.md'); expect(openFile).toHaveBeenCalled();
  });
  it('serializes writes and recovers after a failed save', async () => {
    const { plugin } = setup();
    const writes: string[] = [];
    plugin.saveData = async (settings: { theme: string }) => { writes.push(settings.theme); if (settings.theme === 'midnight') throw new Error('disk'); };
    const first = plugin.saveSettings({ ...defaultSettings(), theme: 'midnight' });
    const second = plugin.saveSettings({ ...defaultSettings(), theme: 'paper' });
    await expect(first).rejects.toThrow('disk'); await second;
    expect(writes).toEqual(['midnight', 'paper']);
  });
  it('rejects weather requests to other destinations', async () => {
    const { plugin } = setup();
    await expect(plugin.host().getJson('https://example.com/vault')).rejects.toThrow();
    await expect(plugin.host().getJson('http://api.open-meteo.com/')).rejects.toThrow();
  });
  it('persists renamed pins even when the homepage is closed, and emits the new path', async () => {
    const { plugin, events } = setup(); plugin.settings.pins = ['Work/A.md', 'Elsewhere.md'];
    await plugin.onload(); const changed = vi.fn(); plugin.host().subscribe(changed);
    events.get('rename')?.(makeFolder('Archive'), 'Work');
    expect(plugin.settings.pins).toEqual(['Archive/A.md', 'Elsewhere.md']);
    expect(changed).toHaveBeenCalledWith({ oldPath: 'Work', newPath: 'Archive' });
    await vi.waitFor(() => expect(plugin.saveData).toHaveBeenCalledWith(expect.objectContaining({ pins: ['Archive/A.md', 'Elsewhere.md'] })));
  });
  it('pushes settings-tab changes to open homepages', async () => {
    const { plugin } = setup(); const seen = vi.fn(); plugin.host().onSettings!(seen);
    await plugin.updateSettings({ clock24: false });
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ clock24: false }));
  });
});
