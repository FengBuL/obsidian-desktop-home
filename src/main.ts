import { ItemView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, normalizePath, requestUrl } from 'obsidian';
import { Desktop } from './ui/desktop';
import { normalizeSettings, defaultSettings, renamePinnedPaths, type Settings } from './model';
import type { DesktopHost, VaultRename } from './host';
import { localDate, recentNotes, type Note } from './notes';

const VIEW_TYPE = 'desktop-home-view';
export default class DesktopHomePlugin extends Plugin {
  settings = defaultSettings();
  private listeners = new Set<(rename?: VaultRename) => void>();
  private saving: Promise<void> = Promise.resolve();
  async onload() {
    try { this.settings = normalizeSettings(await this.loadData()); }
    catch { new Notice('Desktop Home 配置读取失败，已使用默认桌面。'); }
    this.registerView(VIEW_TYPE, leaf => new DesktopHomeView(leaf, this));
    this.addRibbonIcon('house', '打开桌面首页', () => { void this.openHome(); });
    this.addCommand({ id: 'open-home', name: '打开桌面首页', callback: () => { void this.openHome(); } });
    this.addSettingTab(new DesktopSettingsTab(this));
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => this.listeners.forEach(fn => fn()), 250); };
    this.registerEvent(this.app.vault.on('create', refresh));
    this.registerEvent(this.app.vault.on('delete', refresh));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      const updated = renamePinnedPaths(this.settings, oldPath, file.path);
      if (updated !== this.settings) void this.saveSettings(updated).catch(() => { new Notice('固定笔记路径保存失败，请检查写入权限。'); });
      this.listeners.forEach(fn => fn({ oldPath, newPath: file.path })); refresh();
    }));
    this.registerEvent(this.app.vault.on('modify', refresh));
    this.registerEvent(this.app.workspace.on('file-open', refresh));
    this.registerEvent(this.app.metadataCache.on('changed', refresh));
    this.register(() => { clearTimeout(refreshTimer); this.listeners.clear(); });
    this.app.workspace.onLayoutReady(() => { if (this.settings.openOnStart) void this.openHome(); });
  }
  async openHome() {
    try {
      let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
      if (!leaf) { leaf = this.app.workspace.getLeaf('tab'); await leaf.setViewState({ type: VIEW_TYPE, active: true }); }
      await this.app.workspace.revealLeaf(leaf);
    } catch { new Notice('桌面首页打开失败，请重新加载插件。'); }
  }
  saveSettings(settings: Settings): Promise<void> {
    this.settings = normalizeSettings(settings); const snapshot = structuredClone(this.settings);
    const request = this.saving.catch(() => {}).then(() => this.saveData(snapshot)); this.saving = request; return request;
  }
  host(): DesktopHost {
    const notes = (): Note[] => this.app.vault.getMarkdownFiles().map(file => {
      const meta = this.app.metadataCache.getFileCache(file)?.frontmatter;
      return { path: file.path, title: typeof meta?.title === 'string' ? meta.title : file.basename, modified: file.stat.mtime, excerpt: typeof meta?.description === 'string' ? meta.description.slice(0, 180) : undefined };
    });
    return {
      preview: false,
      wallpaperUrl: this.app.vault.adapter.getResourcePath(normalizePath(`${this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`}/assets/alpine.png`)),
      getNotes: notes,
      getRecent: (all = notes()) => {
        const map = new Map(all.map(n => [n.path, n]));
        const opened = [...new Set(this.app.workspace.getLastOpenFiles())].map(path => map.get(path)).filter((n): n is Note => !!n);
        const seen = new Set(opened.map(n => n.path)); return [...opened, ...recentNotes(all).filter(n => !seen.has(n.path))].slice(0, 8);
      },
      openNote: async path => { const file = this.app.vault.getAbstractFileByPath(path); if (!(file instanceof TFile)) throw new Error('文件已移除'); await this.app.workspace.getLeaf('tab').openFile(file); },
      openDaily: async () => {
        const folder = '日记'; const path = normalizePath(`${folder}/${localDate()}.md`);
        if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
        let file = this.app.vault.getAbstractFileByPath(path);
        if (!file) file = await this.app.vault.create(path, `# ${localDate()}\n\n`);
        if (!(file instanceof TFile)) throw new Error('日记路径无效');
        await this.app.workspace.getLeaf('tab').openFile(file);
      },
      save: settings => this.saveSettings(settings),
      getJson: async url => {
        const parsed = new URL(url); if (parsed.protocol !== 'https:' || !['api.open-meteo.com', 'geocoding-api.open-meteo.com'].includes(parsed.hostname)) throw new Error('不支持的天气地址');
        const response = await requestUrl({ url, method: 'GET', throw: false }); if (response.status !== 200) throw new Error(`天气服务 ${response.status}`); return response.json as unknown;
      },
      notify: message => { new Notice(message); },
      subscribe: callback => { this.listeners.add(callback); return () => this.listeners.delete(callback); },
    };
  }
  onunload() { this.app.workspace.detachLeavesOfType(VIEW_TYPE); }
}
class DesktopHomeView extends ItemView {
  private desktop?: Desktop;
  constructor(leaf: WorkspaceLeaf, private plugin: DesktopHomePlugin) { super(leaf); }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return '我的桌面'; }
  getIcon() { return 'house'; }
  async onOpen() { this.contentEl.replaceChildren(); this.contentEl.classList.add('dh-view'); this.desktop = new Desktop(this.contentEl, this.plugin.host(), this.plugin.settings); this.desktop.mount(); }
  async onClose() { await this.desktop?.destroy(); this.contentEl.classList.remove('dh-view'); }
}
class DesktopSettingsTab extends PluginSettingTab {
  constructor(private plugin: DesktopHomePlugin) { super(plugin.app, plugin); }
  display() {
    this.containerEl.empty();
    new Setting(this.containerEl).setName('Desktop Home').setHeading();
    new Setting(this.containerEl).setName('打开桌面').setDesc('在首页内调整主题、壁纸与组件。').addButton(b => b.setButtonText('打开首页').onClick(() => { void this.plugin.openHome(); }));
    new Setting(this.containerEl).setName('数据与网络').setDesc('设置保存在当前库的插件 data.json。天气默认关闭，选择城市后连接 Open-Meteo。默认日记路径为 日记/YYYY-MM-DD.md。首版仅支持电脑端。');
  }
}
