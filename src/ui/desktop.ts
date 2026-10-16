import { defaultSettings, defaultSize, moveWidget, normalizeSettings, resizeWidget, togglePin, renamePinnedPaths, type City, type Settings, type Widget, type WidgetKind, type WeatherSnapshot } from '../model';
import { folderOf, hasExactNote, searchNotes, toneOf, type Note } from '../notes';
import type { TaskItem } from '../tasks';
import type { DesktopHost } from '../host';
import { WeatherService } from '../weather';
import { el, button, textButton, rowButton, labelWith, setVars } from './dom';
import { icon, type IconName } from './icons';
import { updateClock } from './widgets';
import { Panels } from './panels';
import { WidgetGrid } from './grid';
import { SettingsWriter, type SaveState } from '../persistence';

export class Desktop {
  private static nextId = 0;
  private instanceId = `dh-${++Desktop.nextId}`;
  private settings: Settings;
  private doc: Document;
  private panels: Panels;
  private weatherService: WeatherService;
  private weather: WeatherSnapshot | null = null;
  private weatherStatus = '';
  private weatherGeneration = 0;
  private editing = false;
  private disposed = false;
  private mounted = false;
  private timer?: number;
  private weatherTimer?: number;
  private unsubscribe?: () => void;
  private unsubscribeSettings?: () => void;
  /** 首页不可见时收到的库变化，等回到首页再刷新。 */
  private stale = false;
  private tasks: TaskItem[] | null = null;
  private taskGeneration = 0;
  private dailyDays = new Set<number>();
  private noteMap = new Map<string, Note>();
  private cleanups: (() => void)[] = [];
  private board!: HTMLElement;
  private time!: HTMLElement;
  private date!: HTMLElement;
  private input!: HTMLInputElement;
  private searchBox!: HTMLElement;
  private results!: HTMLElement;
  private matches: Note[] = [];
  private createQuery = '';
  private activeResult = 0;
  private editButton!: HTMLButtonElement;
  private editBar!: HTMLElement;
  private grid!: WidgetGrid;
  private writer: SettingsWriter<Settings>;
  private history: Widget[][] = [];
  private undoButton!: HTMLButtonElement;
  private resetButton!: HTMLButtonElement;
  private saveStatus!: HTMLElement;
  private retrySave!: HTMLButtonElement;
  private notes: Note[] = [];
  private recent: Note[] = [];
  private day = '';
  private wallpaperSource?: string;

  constructor(private root: HTMLElement, private host: DesktopHost, settings: Settings = defaultSettings()) {
    this.settings = normalizeSettings(settings); this.doc = root.ownerDocument;
    this.writer = new SettingsWriter(settings => this.host.save(settings), () => this.host.notify('桌面配置保存失败，请检查磁盘空间后重试。'), state => this.showSaveState(state));
    this.weatherService = new WeatherService(url => host.getJson(url));
    this.panels = new Panels(root, host, {
      getSettings: () => this.settings, change: patch => this.change(patch),
      pin: path => this.commit(togglePin(this.settings, path)),
      add: kind => this.addWidget(kind), city: city => this.setCity(city),
    }, this.weatherService);
  }
  mount() {
    if (this.mounted) return; this.mounted = true;
    const { doc, root } = this; root.classList.add('dh-desktop'); root.tabIndex = -1;
    const wallpaper = el(doc, 'div', 'dh-wallpaper'); wallpaper.setAttribute('aria-hidden', 'true');
    const shade = el(doc, 'div', 'dh-wallpaper-shade'); shade.setAttribute('aria-hidden', 'true');
    root.append(wallpaper, shade);
    const header = el(doc, 'header', 'dh-topbar');
    const identity = el(doc, 'div', 'dh-identity'); identity.append(icon(doc, 'home', 15), el(doc, 'span', '', '我的桌面'));
    if (this.host.preview) identity.append(el(doc, 'span', 'dh-preview-badge', '交互预览 · 示例笔记'));
    const toolbar = el(doc, 'div', 'dh-toolbar');
    toolbar.append(this.iconButton('桌面外观', 'image', () => this.panels.appearance()));
    this.editButton = this.iconButton('编辑桌面', 'grid', () => this.toggleEdit()); this.editButton.setAttribute('aria-pressed', 'false');
    toolbar.append(this.editButton, this.iconButton('桌面设置', 'settings', () => this.panels.settings())); header.append(identity, toolbar); root.append(header);
    const scroll = el(doc, 'main', 'dh-scroll'); const content = el(doc, 'div', 'dh-content');
    // 内容滚到顶栏下方时给顶栏加一层磨砂底，避免图标压在卡片上看不清。
    scroll.addEventListener('scroll', () => { const scrolled = scroll.scrollTop > 12; if (root.classList.contains('dh-scrolled') !== scrolled) root.classList.toggle('dh-scrolled', scrolled); }, { passive: true });
    const hero = el(doc, 'section', 'dh-hero');
    this.time = el(doc, 'div', 'dh-time'); this.time.setAttribute('role', 'timer'); this.time.setAttribute('aria-live', 'off');
    this.date = el(doc, 'div', 'dh-date'); hero.append(this.time, this.date);
    this.searchBox = el(doc, 'div', 'dh-search-box');
    const searchLine = el(doc, 'div', 'dh-search-line'); searchLine.append(icon(doc, 'search', 21));
    this.input = el(doc, 'input', 'dh-search-input'); this.input.type = 'search'; this.input.placeholder = '搜索你的笔记'; this.input.autocomplete = 'off'; this.input.enterKeyHint = 'search';
    this.input.setAttribute('role', 'combobox'); this.input.setAttribute('aria-controls', `${this.instanceId}-results`); this.input.setAttribute('aria-expanded', 'false'); this.input.setAttribute('aria-autocomplete', 'list');
    const mac = /Mac|iPhone|iPad/.test(doc.defaultView?.navigator.userAgent ?? '');
    const hint = el(doc, 'kbd', 'dh-keyboard-hint', mac ? '⌘ K' : 'Ctrl K'); hint.hidden = !!this.host.mobile;
    this.results = el(doc, 'div', 'dh-search-results'); this.results.id = `${this.instanceId}-results`; this.results.setAttribute('role', 'listbox'); this.results.hidden = true;
    this.input.addEventListener('input', () => this.showSearch()); this.input.addEventListener('focus', () => this.showSearch());
    this.input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { this.hideSearch(); this.input.blur(); return; }
      if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault(); if (this.results.hidden) this.showSearch();
        else { const total = this.matches.length + (this.createQuery ? 1 : 0); this.activeResult = (this.activeResult + (e.key === 'ArrowDown' ? 1 : -1) + total) % (total || 1); this.highlightSearch(); }
      }
      if (e.key === 'Enter' && !e.isComposing) {
        const match = this.matches[this.activeResult];
        if (match) { e.preventDefault(); this.openNote(match.path); this.hideSearch(); this.input.blur(); }
        else if (this.createQuery && this.activeResult === this.matches.length) { e.preventDefault(); this.createNote(this.createQuery); }
      }
    });
    searchLine.append(this.input, hint); labelWith(this.searchBox, '搜索笔记', this.input); this.searchBox.append(searchLine, this.results); hero.append(this.searchBox); content.append(hero);
    this.editBar = el(doc, 'div', 'dh-edit-bar'); this.editBar.hidden = true;
    const editCopy = el(doc, 'span', 'dh-edit-hint'); editCopy.append(icon(doc, 'grip', 15), doc.createTextNode('拖动排列 · 自由组合'));
    this.undoButton = this.iconButton('撤销布局修改', 'undo', () => this.undoLayout());
    this.resetButton = textButton(doc, '恢复默认布局', () => this.change({ widgets: defaultSettings().widgets }), 'dh-reset-button');
    this.saveStatus = el(doc, 'small', 'dh-save-status', '布局自动保存'); this.saveStatus.setAttribute('role', 'status'); this.saveStatus.setAttribute('aria-live', 'polite');
    this.retrySave = textButton(doc, '重试保存', () => { void this.writer.flush(); }, 'dh-save-retry'); this.retrySave.hidden = true;
    this.editBar.append(editCopy, this.saveStatus, this.retrySave, this.undoButton, this.resetButton, textButton(doc, '添加组件', () => this.panels.widgets(), 'dh-add-button'), textButton(doc, '完成', () => this.toggleEdit(), 'dh-done-button'));
    content.append(this.editBar);
    this.board = el(doc, 'section', 'dh-board'); labelWith(content, '桌面组件', this.board); content.append(this.board); scroll.append(content); root.append(scroll);
    this.grid = new WidgetGrid(this.board, {
      remove: id => this.change({ widgets: this.settings.widgets.filter(w => w.id !== id) }),
      resize: (id, size) => this.commit(resizeWidget(this.settings, id, size)),
      move: (id, delta) => this.commit(moveWidget(this.settings, id, this.settings.widgets.findIndex(w => w.id === id) + delta)),
      drop: (id, target) => this.commit(moveWidget(this.settings, id, this.settings.widgets.findIndex(w => w.id === target))),
      add: () => { if (!this.editing) this.toggleEdit(); this.panels.widgets(); },
    });
    this.readNotes(); this.renderDock(); this.applyAppearance(); this.renderBoard(); this.tick();
    this.timer = window.setInterval(() => this.tick(), 1000);
    this.weatherTimer = window.setInterval(() => { if (this.settings.city && this.settings.widgets.some(w => w.kind === 'weather')) void this.loadWeather(); }, 30 * 60_000);
    this.unsubscribe = this.host.subscribe(rename => {
      if (this.disposed) return;
      const updated = rename ? renamePinnedPaths(this.settings, rename.oldPath, rename.newPath) : this.settings;
      if (updated !== this.settings) this.commit(updated);
      if (this.visible()) this.refreshVault(); else this.stale = true;
    });
    this.unsubscribeSettings = this.host.onSettings?.(settings => this.replaceSettings(settings));
    void this.loadTasks();
    const pointer = (event: Event) => { if (!(event.target instanceof Node && this.searchBox.contains(event.target))) this.hideSearch(); };
    const keydown = (event: KeyboardEvent) => {
      if (!root.contains(doc.activeElement)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (!this.panels.isOpen) { this.input.focus(); this.input.select(); } }
      const typing = doc.activeElement instanceof HTMLElement && doc.activeElement.matches('input,textarea,select,[contenteditable="true"]');
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && this.editing && !this.panels.isOpen && !typing) { event.preventDefault(); this.undoLayout(); }
      if (event.key === 'Escape' && !this.panels.isOpen && this.editing) this.toggleEdit();
    };
    doc.addEventListener('pointerdown', pointer); doc.addEventListener('keydown', keydown);
    const flush = () => { void this.writer.flush(); };
    const visibility = () => { if (doc.hidden) flush(); };
    doc.addEventListener('visibilitychange', visibility); doc.defaultView?.addEventListener('pagehide', flush);
    this.cleanups.push(() => doc.removeEventListener('pointerdown', pointer), () => doc.removeEventListener('keydown', keydown), () => doc.removeEventListener('visibilitychange', visibility), () => doc.defaultView?.removeEventListener('pagehide', flush));
    void this.loadWeather();
  }
  private iconButton(label: string, name: IconName, action: () => void) { const b = button(this.doc, label, action); b.append(icon(this.doc, name)); return b; }
  private applyAppearance() {
    const { root, settings: s } = this;
    if (root.dataset.theme !== s.theme) root.dataset.theme = s.theme;
    if (root.dataset.wallpaper !== s.wallpaper) root.dataset.wallpaper = s.wallpaper;
    const url = s.wallpaper === 'custom' ? s.customImage : s.wallpaper === 'vault' ? this.host.resourceUrl?.(s.wallpaperPath) ?? '' : s.wallpaper === 'alpine' ? this.host.wallpaperUrl : '';
    if (url !== this.wallpaperSource) {
      setVars(root, { '--dh-wallpaper-image': url ? `url("${url.replace(/["\\\n\r]/g, '')}")` : 'none' }); this.wallpaperSource = url;
    }
    setVars(root, { '--dh-wallpaper-dim': String(s.dim), '--dh-wallpaper-blur': `${s.blur}px` });
  }
  private tick() {
    if (this.disposed) return; const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: !this.settings.clock24 });
    const date = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
    if (this.time.textContent !== time) this.time.textContent = time;
    if (this.date.textContent !== date) this.date.textContent = date;
    const day = now.toDateString(); const changed = this.day && day !== this.day; this.day = day;
    if (changed) { this.readNotes(); this.renderBoard(); void this.loadTasks(); }
    if (this.stale && this.visible()) this.refreshVault();
    updateClock(this.board, now, time);
  }
  private change(patch: Partial<Settings>) { this.commit({ ...this.settings, ...patch }); }
  private commit(settings: Settings, remember = true) {
    if (this.disposed || settings === this.settings) return;
    const previous = this.settings;
    const layoutChanged = JSON.stringify(settings.widgets) !== JSON.stringify(previous.widgets);
    if (remember && layoutChanged) {
      this.history.push(this.settings.widgets.map(w => ({ ...w }))); if (this.history.length > 20) this.history.shift();
    }
    this.settings = settings; this.applyAppearance(); this.tick();
    if (layoutChanged || previous.pins !== settings.pins || previous.city !== settings.city || previous.weatherCache !== settings.weatherCache) this.renderBoard();
    this.writer.queue(this.settings);
    if (this.settings.widgets.some(w => w.kind === 'weather') && !previous.widgets.some(w => w.kind === 'weather')) void this.loadWeather();
    if (this.settings.widgets.some(w => w.kind === 'tasks') && !previous.widgets.some(w => w.kind === 'tasks')) void this.loadTasks();
  }
  /** 设置页改动：直接采用新配置，并让尚未写入的快照跟上，避免旧值覆盖。 */
  private replaceSettings(settings: Settings) {
    if (this.disposed) return;
    const previous = this.settings; this.settings = normalizeSettings(settings); this.writer.rebase(this.settings);
    this.applyAppearance(); this.tick(); this.readNotes(); this.renderBoard();
    if (previous.dailyFollowCore !== this.settings.dailyFollowCore || previous.dailyFolder !== this.settings.dailyFolder || previous.dailyFormat !== this.settings.dailyFormat) void this.loadTasks();
    if (previous.city && !this.settings.city) { this.weatherGeneration++; this.weather = null; this.weatherStatus = ''; this.renderBoard(); }
  }
  private visible() { return !this.host.isVisible || this.host.isVisible(); }
  private refreshVault() {
    this.stale = false; this.readNotes(); this.renderBoard(); void this.loadTasks();
    if (!this.results.hidden) this.showSearch();
  }
  private undoLayout() { const widgets = this.history.pop(); if (widgets) this.commit({ ...this.settings, widgets }, false); }
  private showSaveState(state: SaveState) {
    if (this.disposed || !this.saveStatus) return;
    this.saveStatus.textContent = { queued: '等待保存…', saving: '正在保存…', saved: '已保存', error: '保存失败' }[state];
    this.saveStatus.dataset.state = state;
    this.retrySave.hidden = state !== 'error';
  }
  private readNotes() {
    this.notes = this.host.getNotes(); this.noteMap = new Map(this.notes.map(n => [n.path, n])); this.recent = this.host.getRecent(this.notes);
    const now = new Date(); this.dailyDays = this.host.dailyDays?.(now.getFullYear(), now.getMonth()) ?? new Set();
  }
  private async loadTasks() {
    if (!this.host.getTasks || this.disposed || !this.settings.widgets.some(w => w.kind === 'tasks')) return;
    const generation = ++this.taskGeneration;
    try { const tasks = await this.host.getTasks(); if (this.disposed || generation !== this.taskGeneration) return; this.tasks = tasks; }
    catch { if (generation !== this.taskGeneration) return; this.tasks = []; }
    this.renderBoard();
  }
  private completeTask(task: TaskItem) {
    if (!this.host.completeTask) return;
    void this.host.completeTask(task).then(ok => { if (!ok) this.host.notify('这条待办已经被修改，已重新读取。'); void this.loadTasks(); })
      .catch(() => { this.host.notify('待办更新失败，请检查文件是否可写。'); void this.loadTasks(); });
  }
  private addTask(text: string) {
    if (!this.host.addTask) return;
    void this.host.addTask(text).then(() => this.loadTasks()).catch(() => this.host.notify('添加失败，请检查日记文件夹是否可写。'));
  }
  private toggleEdit() {
    this.editing = !this.editing; this.root.classList.toggle('dh-editing', this.editing); this.editButton.setAttribute('aria-pressed', String(this.editing));
    this.editBar.hidden = !this.editing; this.hideSearch(); this.renderBoard();
  }
  private addWidget(kind: WidgetKind) {
    if (this.settings.widgets.some(w => w.kind === kind)) return;
    this.change({ widgets: [...this.settings.widgets, { id: `${kind}-${Date.now()}`, kind, size: defaultSize(kind) }] });
  }
  private renderBoard() {
    if (!this.grid) return;
    this.undoButton.disabled = this.history.length === 0;
    this.resetButton.disabled = JSON.stringify(this.settings.widgets) === JSON.stringify(defaultSettings().widgets);
    this.grid.update(this.settings, this.editing, {
      doc: this.doc, settings: this.settings, notes: this.noteMap, recent: this.recent, weather: this.weather, weatherStatus: this.weatherStatus,
      tasks: this.tasks, canAddTask: !!this.host.addTask, dailyDays: this.dailyDays,
      open: path => { if (!this.editing) this.openNote(path); }, pin: path => this.commit(togglePin(this.settings, path)),
      choosePins: () => this.panels.pins(), chooseCity: () => this.panels.cities(), refreshWeather: () => void this.loadWeather(true), daily: date => this.daily(date),
      completeTask: task => this.completeTask(task), addTask: text => this.addTask(text), memo: text => this.change({ memo: text }),
    }, this.day || new Date().toDateString());
  }
  private renderDock() {
    const dock = el(this.doc, 'nav', 'dh-dock'); labelWith(dock, '桌面快捷入口');
    for (const [label, name, tone, action] of [
      ['今日日记', 'book', 'daily', () => this.daily()], ['查找笔记', 'search', 'search', () => { this.input.focus(); this.showSearch(); }],
      ['最近笔记', 'history', 'recent', () => { this.input.value = ''; this.input.focus(); this.showSearch(); }],
      ['固定笔记', 'star', 'pins', () => this.panels.pins()], ['天气城市', 'partly', 'weather', () => this.panels.cities()], ['桌面设置', 'settings', 'settings', () => this.panels.settings()],
    ] as [string, IconName, string, () => void][]) {
      if (tone === 'settings') { const divider = el(this.doc, 'i', 'dh-dock-divider'); divider.setAttribute('aria-hidden', 'true'); dock.append(divider); }
      // 自定义提示气泡负责悬停文字，按钮用 aria-labelledby 指向它，避免 Obsidian 再弹一个提示。
      const item = rowButton(this.doc, action, `dh-dock-item dh-dock-${tone}`); const tip = el(this.doc, 'span', 'dh-dock-tooltip', label); tip.id = `${this.instanceId}-dock-${name}`;
      const tile = el(this.doc, 'span', 'dh-dock-tile'); tile.append(icon(this.doc, name, 24));
      item.setAttribute('aria-labelledby', tip.id); item.append(tile, tip); dock.append(item);
    }
    this.root.append(dock);
  }
  private showSearch() {
    const query = this.input.value.trim();
    this.matches = searchNotes(this.notes, query); this.activeResult = 0; this.results.replaceChildren();
    this.createQuery = query && this.host.createNote && !hasExactNote(this.notes, query) ? query : '';
    this.results.append(el(this.doc, 'div', 'dh-search-caption', query ? (this.matches.length ? `${this.matches.length} 篇匹配笔记` : '没有找到笔记') : '最近修改'));
    if (!this.matches.length && !this.createQuery) this.results.append(el(this.doc, 'p', 'dh-empty-copy', query ? '换个关键词试试，标题、别名和文件夹名称都能搜。' : '库里还没有笔记。'));
    this.matches.forEach((note, index) => {
      const row = rowButton(this.doc, () => { this.openNote(note.path); this.hideSearch(); }, 'dh-search-result'); row.id = `${this.instanceId}-result-${index}`; row.setAttribute('role', 'option');
      const copy = el(this.doc, 'span'); copy.append(el(this.doc, 'strong', '', note.title), el(this.doc, 'small', '', note.path)); const tile = el(this.doc, 'span', 'dh-note-icon'); tile.dataset.tone = String(toneOf(folderOf(note.path) || note.path)); tile.append(icon(this.doc, 'note', 15));
      row.append(tile, copy, icon(this.doc, 'arrow', 15)); this.results.append(row);
    });
    if (this.createQuery) {
      const index = this.matches.length; const name = this.createQuery;
      const row = rowButton(this.doc, () => this.createNote(name), 'dh-search-result dh-search-create'); row.id = `${this.instanceId}-result-${index}`; row.setAttribute('role', 'option');
      const copy = el(this.doc, 'span'); copy.append(el(this.doc, 'strong', '', `新建笔记「${name}」`), el(this.doc, 'small', '', '按 Enter 创建并打开')); const tile = el(this.doc, 'span', 'dh-note-icon dh-create-icon'); tile.append(icon(this.doc, 'newNote', 15)); row.append(tile, copy); this.results.append(row);
    }
    this.results.hidden = false; this.input.setAttribute('aria-expanded', 'true'); this.highlightSearch();
  }
  private highlightSearch() {
    this.results.querySelectorAll<HTMLElement>('[role="option"]').forEach((row, index) => { row.setAttribute('aria-selected', String(index === this.activeResult)); if (index === this.activeResult) row.scrollIntoView?.({ block: 'nearest' }); });
    if (this.matches.length || this.createQuery) this.input.setAttribute('aria-activedescendant', `${this.instanceId}-result-${this.activeResult}`); else this.input.removeAttribute('aria-activedescendant');
  }
  private hideSearch() { if (!this.results) return; this.results.hidden = true; this.input.setAttribute('aria-expanded', 'false'); this.input.removeAttribute('aria-activedescendant'); }
  private openNote(path: string) { void this.host.openNote(path).catch(() => this.host.notify('笔记打开失败，文件可能已移动。')); }
  private daily(date?: Date) { void this.host.openDaily(date).then(() => { this.readNotes(); this.renderBoard(); }).catch(() => this.host.notify('日记创建失败，请检查文件夹与写入权限。')); }
  private createNote(title: string) {
    if (!this.host.createNote) return; this.hideSearch(); this.input.value = ''; this.input.blur();
    void this.host.createNote(title).catch(() => this.host.notify('新建笔记失败，请检查名称和写入权限。'));
  }
  private setCity(city: City | null) {
    this.weatherGeneration++; this.weather = null; this.weatherStatus = ''; this.change({ city, weatherCache: null }); if (city) void this.loadWeather();
  }
  private async loadWeather(force = false) {
    const city = this.settings.city;
    if (!city || !this.settings.widgets.some(w => w.kind === 'weather') || this.disposed) return;
    const generation = ++this.weatherGeneration; this.weatherStatus = '正在更新…'; this.renderBoard();
    try {
      const result = await this.weatherService.load(city, this.settings.weatherCache, Date.now(), force);
      if (this.disposed || generation !== this.weatherGeneration) return;
      this.weather = result.data; this.weatherStatus = result.stale ? `离线缓存 · ${new Date(result.data.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '';
      if (this.settings.weatherCache?.updatedAt !== result.data.updatedAt) this.change({ weatherCache: result.data }); else this.renderBoard();
    } catch { if (!this.disposed && generation === this.weatherGeneration) { this.weatherStatus = '天气获取失败，请检查网络后重试'; this.renderBoard(); } }
  }
  destroy(): Promise<void> {
    if (this.disposed) return this.writer.flush(); this.disposed = true; this.weatherGeneration++; this.taskGeneration++; this.panels.close(); window.clearInterval(this.timer); window.clearInterval(this.weatherTimer); this.unsubscribe?.(); this.unsubscribeSettings?.(); this.cleanups.forEach(fn => fn()); this.root.replaceChildren(); this.root.classList.remove('dh-desktop', 'dh-editing', 'dh-scrolled');
    return this.writer.flush();
  }
}
