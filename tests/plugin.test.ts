import { describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', () => ({
  Plugin: class {
    registerView() {} addRibbonIcon() {} addCommand() {} addSettingTab() {} registerEvent() {} register() {}
  }, ItemView: class {}, PluginSettingTab: class {}, Setting: class {}, Notice: class {},
  TFile: class { constructor(public path: string, public basename: string, public stat = { mtime: 1 }) {} },
  normalizePath: (p: string) => p.replace(/\/+/g, '/'), requestUrl: vi.fn(),
}));
import Plugin from '../src/main';
import { TFile } from 'obsidian';
import { defaultSettings } from '../src/model';
import { localDate } from '../src/notes';
function setup() {
  const plugin = new Plugin({} as Plugin['app'], {} as Plugin['manifest']);
  const events = new Map<string, (...args: any[]) => void>();
  const files = new Map<string, unknown>();
  const openFile = vi.fn(async () => {});
  const create = vi.fn(async (path: string, text: string) => { const file = Object.assign(new TFile(), { path, basename: path.split('/').pop()!.replace('.md', ''), stat: { mtime: 1 }, text }); files.set(path, file); return file; });
  const createFolder = vi.fn(async (path: string) => { files.set(path, { path }); });
  plugin.app = {
    vault: { configDir: '.obsidian', adapter: { getResourcePath: (p: string) => `app://${p}` }, getMarkdownFiles: () => [...files.values()].filter(f => f instanceof TFile), getAbstractFileByPath: (p: string) => files.get(p), create, createFolder, on: (event: string, callback: (...args: any[]) => void) => { events.set(event, callback); } },
    metadataCache: { getFileCache: () => null, on: () => {} },
    workspace: { getLastOpenFiles: () => ['Gone.md', 'Existing.md'], getLeaf: () => ({ openFile }), on: () => {}, onLayoutReady: () => {} },
  } as unknown as Plugin['app'];
  plugin.manifest = { id: 'desktop-home', dir: '.obsidian/plugins/desktop-home' } as Plugin['manifest'];
  plugin.saveData = vi.fn(async () => {});
  plugin.loadData = async () => plugin.settings;
  return { plugin, files, openFile, create, createFolder, events };
}
describe('Obsidian host adapter', () => {
  it('uses real vault metadata and opens only existing files in a tab', async () => {
    const { plugin, files, openFile } = setup();
    const file = Object.assign(new TFile(), { path: 'Existing.md', basename: 'Existing', stat: { mtime: 20 } }); files.set(file.path, file);
    const host = plugin.host(); expect(host.getRecent().map(n => n.path)).toEqual(['Existing.md']);
    await host.openNote(file.path); expect(openFile).toHaveBeenCalledWith(file);
    await expect(host.openNote('Gone.md')).rejects.toThrow();
    expect(host.wallpaperUrl).toBe('app://.obsidian/plugins/desktop-home/assets/alpine.png');
  });
  it('creates a daily note once and never overwrites its contents', async () => {
    const { plugin, create, createFolder } = setup();
    await plugin.host().openDaily(); await plugin.host().openDaily();
    expect(createFolder).toHaveBeenCalledTimes(1); expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toBe(`日记/${localDate()}.md`);
  });
  it('serializes writes and recovers after a failed save', async () => {
    const { plugin } = setup();
    const writes: string[] = [];
    plugin.saveData = async settings => { writes.push(settings.theme); if (settings.theme === 'midnight') throw new Error('disk'); };
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
    events.get('rename')!({ path: 'Archive' }, 'Work');
    expect(plugin.settings.pins).toEqual(['Archive/A.md', 'Elsewhere.md']);
    expect(changed).toHaveBeenCalledWith({ oldPath: 'Work', newPath: 'Archive' });
    await vi.waitFor(() => expect(plugin.saveData).toHaveBeenCalledWith(expect.objectContaining({ pins: ['Archive/A.md', 'Elsewhere.md'] })));
  });
});
