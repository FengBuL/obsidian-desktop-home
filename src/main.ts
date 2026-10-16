import { ItemView, Notice, Platform, Plugin, TFile, TFolder, WorkspaceLeaf, moment, normalizePath, requestUrl, type TAbstractFile } from 'obsidian';
import { Desktop } from './ui/desktop';
import { normalizeSettings, defaultSettings, renamePinnedPaths, isExcluded, record, type Settings } from './model';
import type { DesktopHost, VaultRename } from './host';
import { joinPath, recentNotes, safeNoteName, type Note } from './notes';
import { appendTask, completeTaskLine, parseTasks, selectTasks, type TaskItem } from './tasks';
import { DesktopSettingsTab } from './settings-tab';
import alpineWallpaper from '../assets/alpine.webp';

const VIEW_TYPE = 'desktop-home-view';
/** obsidian 导出的 moment 在 esModuleInterop 下类型不可调用，这里收窄成只需要的格式化能力。 */
const formatDate = (date: Date, format: string): string => (moment as unknown as (input: Date) => { format(f: string): string })(date).format(format);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif']);
interface DailyConfig { folder: string; format: string; template: string }

export default class DesktopHomePlugin extends Plugin {
  settings = defaultSettings();
  private listeners = new Set<(rename?: VaultRename) => void>();
  private settingsListeners = new Set<(settings: Settings) => void>();
  private saving: Promise<void> = Promise.resolve();
  /** 笔记快照：按库事件增量更新，避免每次刷新都遍历整个库。 */
  private noteCache: Map<string, Note> | null = null;
  /** 每个文件的未完成任务，按修改时间失效。 */
  private taskCache = new Map<string, { mtime: number; tasks: TaskItem[] }>();

  async onload() {
    try { this.settings = normalizeSettings(await this.loadData()); }
    catch { new Notice('桌面首页配置读取失败，已使用默认桌面。'); }
    this.registerView(VIEW_TYPE, leaf => new DesktopHomeView(leaf, this));
    this.addRibbonIcon('house', '打开桌面首页', () => { void this.openHome(); });
    this.addCommand({ id: 'open-home', name: '打开桌面首页', callback: () => { void this.openHome(); } });
    this.addSettingTab(new DesktopSettingsTab(this.app, this));
    let refreshTimer: number | undefined;
    const refresh = () => { window.clearTimeout(refreshTimer); refreshTimer = window.setTimeout(() => this.listeners.forEach(fn => fn()), 400); };
    const markdown = (file: TAbstractFile): file is TFile => file instanceof TFile && file.extension === 'md';
    this.registerEvent(this.app.vault.on('create', file => { if (markdown(file)) this.noteCache?.set(file.path, this.toNote(file)); refresh(); }));
    this.registerEvent(this.app.vault.on('delete', file => {
      if (file instanceof TFolder) this.noteCache = null; else this.noteCache?.delete(file.path);
      this.taskCache.delete(file.path); refresh();
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (file instanceof TFolder) { this.noteCache = null; this.taskCache.clear(); }
      else { this.noteCache?.delete(oldPath); this.taskCache.delete(oldPath); if (markdown(file)) this.noteCache?.set(file.path, this.toNote(file)); }
      const updated = renamePinnedPaths(this.settings, oldPath, file.path);
      if (updated !== this.settings) void this.saveSettings(updated).catch(() => { new Notice('固定笔记路径保存失败，请检查写入权限。'); });
      this.listeners.forEach(fn => fn({ oldPath, newPath: file.path })); refresh();
    }));
    this.registerEvent(this.app.vault.on('modify', file => {
      if (!markdown(file)) return;
      const cached = this.noteCache?.get(file.path); if (cached) this.noteCache?.set(file.path, { ...cached, modified: file.stat.mtime });
      refresh();
    }));
    this.registerEvent(this.app.metadataCache.on('changed', file => { if (this.noteCache && markdown(file)) this.noteCache.set(file.path, this.toNote(file)); refresh(); }));
    this.registerEvent(this.app.workspace.on('file-open', refresh));
    this.register(() => { window.clearTimeout(refreshTimer); this.listeners.clear(); this.settingsListeners.clear(); });
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
    const previous = this.settings;
    this.settings = normalizeSettings(settings); const snapshot = structuredClone(this.settings);
    if (previous.excludeFolders.join('\n') !== this.settings.excludeFolders.join('\n')) this.noteCache = null;
    const request = this.saving.catch(() => {}).then(() => this.saveData(snapshot)); this.saving = request; return request;
  }
  /** 设置页的修改：保存并同步给已打开的首页。 */
  async updateSettings(patch: Partial<Settings>) {
    await this.saveSettings({ ...this.settings, ...patch });
    this.settingsListeners.forEach(fn => fn(this.settings)); this.listeners.forEach(fn => fn());
  }
  private toNote(file: TFile): Note {
    const meta = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const rawAliases: unknown = meta?.aliases ?? meta?.alias;
    const aliases = (Array.isArray(rawAliases) ? rawAliases : [rawAliases]).filter((a): a is string => typeof a === 'string' && a.length > 0).slice(0, 10);
    const title: unknown = meta?.title; const description: unknown = meta?.description;
    return { path: file.path, title: typeof title === 'string' && title ? title : file.basename, modified: file.stat.mtime, excerpt: typeof description === 'string' ? description.slice(0, 180) : undefined, aliases: aliases.length ? aliases : undefined };
  }
  notes(): Note[] {
    if (!this.noteCache) {
      const excluded = this.settings.excludeFolders;
      this.noteCache = new Map(this.app.vault.getMarkdownFiles().filter(f => !isExcluded(f.path, excluded)).map(f => [f.path, this.toNote(f)]));
    }
    return [...this.noteCache.values()];
  }
  /** 日记位置：优先跟随核心「日记」插件，否则使用本插件设置。 */
  dailyConfig(): DailyConfig {
    const own = { folder: this.settings.dailyFolder, format: this.settings.dailyFormat || 'YYYY-MM-DD', template: '' };
    if (!this.settings.dailyFollowCore) return own;
    const internal: unknown = (this.app as unknown as { internalPlugins?: { getPluginById?: (id: string) => unknown } }).internalPlugins?.getPluginById?.('daily-notes');
    if (!record(internal) || internal.enabled !== true || !record(internal.instance) || !record(internal.instance.options)) return own;
    const options = internal.instance.options; const text = (x: unknown) => typeof x === 'string' ? x.trim() : '';
    return { folder: text(options.folder), format: text(options.format) || 'YYYY-MM-DD', template: text(options.template) };
  }
  dailyPath(date: Date, config = this.dailyConfig()): string { return normalizePath(joinPath(config.folder, formatDate(date, config.format))); }
  private async ensureDaily(date: Date): Promise<TFile> {
    const config = this.dailyConfig(); const path = this.dailyPath(date, config);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;
    if (existing) throw new Error('日记路径被文件夹占用');
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (folder && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    let content = `# ${formatDate(date, 'YYYY-MM-DD')}\n\n`;
    if (config.template) {
      const template = this.app.metadataCache.getFirstLinkpathDest(config.template, '');
      if (template) content = (await this.app.vault.cachedRead(template))
        .replace(/{{\s*date\s*(?::([^}]+))?}}/gi, (_m, f?: string) => formatDate(date, f?.trim() || config.format))
        .replace(/{{\s*time\s*(?::([^}]+))?}}/gi, (_m, f?: string) => formatDate(new Date(), f?.trim() || 'HH:mm'))
        .replace(/{{\s*title\s*}}/gi, formatDate(date, config.format));
    }
    return this.app.vault.create(path, content);
  }
  async tasks(): Promise<TaskItem[]> {
    const all: TaskItem[] = []; const excluded = this.settings.excludeFolders; const seen = new Set<string>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (isExcluded(file.path, excluded)) continue;
      const items = this.app.metadataCache.getFileCache(file)?.listItems;
      if (!items?.some(item => item.task === ' ')) continue;
      seen.add(file.path);
      let cached = this.taskCache.get(file.path);
      if (!cached || cached.mtime !== file.stat.mtime) { cached = { mtime: file.stat.mtime, tasks: parseTasks(await this.app.vault.cachedRead(file), file.path) }; this.taskCache.set(file.path, cached); }
      all.push(...cached.tasks);
    }
    for (const path of this.taskCache.keys()) if (!seen.has(path)) this.taskCache.delete(path);
    return selectTasks(all, formatDate(new Date(), 'YYYY-MM-DD'), this.dailyPath(new Date()));
  }
  host(view?: ItemView): DesktopHost {
    const open = async (file: TFile) => { await this.app.workspace.getLeaf('tab').openFile(file); };
    return {
      preview: false, mobile: Platform.isMobile, wallpaperUrl: alpineWallpaper,
      getNotes: () => this.notes(),
      getRecent: (all = this.notes()) => {
        const map = new Map(all.map(n => [n.path, n]));
        const opened = [...new Set(this.app.workspace.getLastOpenFiles())].map(path => map.get(path)).filter((n): n is Note => !!n);
        const seen = new Set(opened.map(n => n.path)); return [...opened, ...recentNotes(all).filter(n => !seen.has(n.path))].slice(0, 8);
      },
      openNote: async path => { const file = this.app.vault.getAbstractFileByPath(path); if (!(file instanceof TFile)) throw new Error('文件已移除'); await open(file); },
      openDaily: async date => { await open(await this.ensureDaily(date ?? new Date())); },
      dailyDays: (year, month) => {
        const config = this.dailyConfig(); const days = new Set<number>(); const count = new Date(year, month + 1, 0).getDate();
        for (let d = 1; d <= count; d++) if (this.app.vault.getAbstractFileByPath(this.dailyPath(new Date(year, month, d), config)) instanceof TFile) days.add(d);
        return days;
      },
      createNote: async title => {
        const name = safeNoteName(title); if (!name) throw new Error('名称无效');
        const existing = this.app.metadataCache.getFirstLinkpathDest(name, '');
        if (existing) { await open(existing); return; }
        const parent = this.app.fileManager.getNewFileParent('');
        await open(await this.app.vault.create(normalizePath(joinPath(parent.isRoot() ? '' : parent.path, name)), ''));
      },
      getTasks: () => this.tasks(),
      completeTask: async task => {
        const file = this.app.vault.getAbstractFileByPath(task.path); if (!(file instanceof TFile)) return false;
        let ok = false;
        await this.app.vault.process(file, text => {
          const lines = text.split('\n'); const line = lines[task.line];
          const next = line === undefined ? null : completeTaskLine(line, task.raw, formatDate(new Date(), 'YYYY-MM-DD'));
          if (next === null) return text; ok = true; lines[task.line] = next; return lines.join('\n');
        });
        return ok;
      },
      addTask: async text => { const file = await this.ensureDaily(new Date()); await this.app.vault.process(file, content => appendTask(content, text)); },
      listImages: () => this.app.vault.getFiles().filter(f => IMAGE_EXTENSIONS.has(f.extension.toLowerCase()) && !isExcluded(f.path, this.settings.excludeFolders))
        .sort((a, b) => b.stat.mtime - a.stat.mtime).map(f => f.path),
      resourceUrl: path => { const file = this.app.vault.getAbstractFileByPath(path); return file instanceof TFile ? this.app.vault.getResourcePath(file) : ''; },
      save: settings => this.saveSettings(settings),
      getJson: async url => {
        const parsed = new URL(url); if (parsed.protocol !== 'https:' || !['api.open-meteo.com', 'geocoding-api.open-meteo.com'].includes(parsed.hostname)) throw new Error('不支持的天气地址');
        const response = await requestUrl({ url, method: 'GET', throw: false }); if (response.status !== 200) throw new Error(`天气服务 ${response.status}`); return response.json as unknown;
      },
      notify: message => { new Notice(message); },
      subscribe: callback => { this.listeners.add(callback); return () => this.listeners.delete(callback); },
      onSettings: callback => { this.settingsListeners.add(callback); return () => this.settingsListeners.delete(callback); },
      isVisible: view ? () => view.containerEl.isShown() : undefined,
    };
  }
}
class DesktopHomeView extends ItemView {
  private desktop?: Desktop;
  constructor(leaf: WorkspaceLeaf, private plugin: DesktopHomePlugin) { super(leaf); }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return '我的桌面'; }
  getIcon() { return 'house'; }
  async onOpen() { this.contentEl.empty(); this.contentEl.addClass('dh-view'); this.desktop = new Desktop(this.contentEl, this.plugin.host(this), this.plugin.settings); this.desktop.mount(); }
  async onClose() { await this.desktop?.destroy(); this.contentEl.removeClass('dh-view'); }
}
