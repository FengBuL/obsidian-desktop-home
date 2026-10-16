import { defaultSettings, moveWidget, normalizeSettings, resizeWidget, togglePin, renamePinnedPaths, type City, type Settings, type Widget, type WidgetKind, type WeatherSnapshot } from '../model';
import { searchNotes, type Note } from '../notes';
import type { DesktopHost } from '../host';
import { WeatherService } from '../weather';
import { el, button, textButton } from './dom';
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
  private timer?: ReturnType<typeof setInterval>;
  private weatherTimer?: ReturnType<typeof setInterval>;
  private unsubscribe?: () => void;
  private cleanups: (() => void)[] = [];
  private board!: HTMLElement;
  private time!: HTMLElement;
  private date!: HTMLElement;
  private input!: HTMLInputElement;
  private searchBox!: HTMLElement;
  private results!: HTMLElement;
  private matches: Note[] = [];
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
  private noteRevision = 0;
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
    const hero = el(doc, 'section', 'dh-hero'); hero.setAttribute('aria-label', '时间与搜索');
    this.time = el(doc, 'div', 'dh-time'); this.time.setAttribute('role', 'timer'); this.time.setAttribute('aria-live', 'off');
    this.date = el(doc, 'div', 'dh-date'); hero.append(this.time, this.date);
    this.searchBox = el(doc, 'div', 'dh-search-box');
    const searchLine = el(doc, 'div', 'dh-search-line'); searchLine.append(icon(doc, 'search', 21));
    this.input = el(doc, 'input', 'dh-search-input'); this.input.type = 'search'; this.input.placeholder = '搜索你的笔记'; this.input.setAttribute('aria-label', '搜索笔记'); this.input.autocomplete = 'off';
    this.input.setAttribute('role', 'combobox'); this.input.setAttribute('aria-controls', `${this.instanceId}-results`); this.input.setAttribute('aria-expanded', 'false'); this.input.setAttribute('aria-autocomplete', 'list');
    const hint = el(doc, 'kbd', 'dh-keyboard-hint', '⌘ K');
    this.results = el(doc, 'div', 'dh-search-results'); this.results.id = `${this.instanceId}-results`; this.results.setAttribute('role', 'listbox'); this.results.hidden = true;
    this.input.addEventListener('input', () => this.showSearch()); this.input.addEventListener('focus', () => this.showSearch());
    this.input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { this.hideSearch(); this.input.blur(); return; }
      if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault(); if (this.results.hidden) this.showSearch();
        else { this.activeResult = (this.activeResult + (e.key === 'ArrowDown' ? 1 : -1) + this.matches.length) % (this.matches.length || 1); this.highlightSearch(); }
      }
      if (e.key === 'Enter' && this.matches[this.activeResult]) { e.preventDefault(); this.openNote(this.matches[this.activeResult].path); this.hideSearch(); this.input.blur(); }
    });
    searchLine.append(this.input, hint); this.searchBox.append(searchLine, this.results); hero.append(this.searchBox); content.append(hero);
    this.editBar = el(doc, 'div', 'dh-edit-bar'); this.editBar.hidden = true;
    const editCopy = el(doc, 'span', 'dh-edit-hint'); editCopy.append(icon(doc, 'grip', 15), doc.createTextNode('拖动排列 · 自由组合'));
    this.undoButton = this.iconButton('撤销布局修改', 'undo', () => this.undoLayout());
    this.resetButton = textButton(doc, '恢复默认布局', () => this.change({ widgets: defaultSettings().widgets }), 'dh-reset-button');
    this.saveStatus = el(doc, 'small', 'dh-save-status', '布局自动保存'); this.saveStatus.setAttribute('role', 'status'); this.saveStatus.setAttribute('aria-live', 'polite');
    this.retrySave = textButton(doc, '重试保存', () => { void this.writer.flush(); }, 'dh-save-retry'); this.retrySave.hidden = true;
    this.editBar.append(editCopy, this.saveStatus, this.retrySave, this.undoButton, this.resetButton, textButton(doc, '添加组件', () => this.panels.widgets(), 'dh-add-button'), textButton(doc, '完成', () => this.toggleEdit(), 'dh-done-button'));
    content.append(this.editBar);
    this.board = el(doc, 'section', 'dh-board'); this.board.setAttribute('aria-label', '桌面组件'); content.append(this.board); scroll.append(content); root.append(scroll);
    this.grid = new WidgetGrid(this.board, {
      remove: id => this.change({ widgets: this.settings.widgets.filter(w => w.id !== id) }),
      resize: (id, size) => this.commit(resizeWidget(this.settings, id, size)),
      move: (id, delta) => this.commit(moveWidget(this.settings, id, this.settings.widgets.findIndex(w => w.id === id) + delta)),
      drop: (id, target) => this.commit(moveWidget(this.settings, id, this.settings.widgets.findIndex(w => w.id === target))),
      add: () => { if (!this.editing) this.toggleEdit(); this.panels.widgets(); },
    });
    this.readNotes(); this.renderDock(); this.applyAppearance(); this.renderBoard(); this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
    this.weatherTimer = setInterval(() => { if (this.settings.city && this.settings.widgets.some(w => w.kind === 'weather')) void this.loadWeather(); }, 30 * 60_000);
    this.unsubscribe = this.host.subscribe(rename => {
      if (this.disposed) return; this.readNotes();
      const updated = rename ? renamePinnedPaths(this.settings, rename.oldPath, rename.newPath) : this.settings;
      if (updated !== this.settings) this.commit(updated); else this.renderBoard();
      if (!this.results.hidden) this.showSearch();
    });
    const pointer = (event: Event) => { if (!this.searchBox.contains(event.target as Node)) this.hideSearch(); };
    const keydown = (event: KeyboardEvent) => {
      if (!root.contains(doc.activeElement)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (!this.panels.isOpen) { this.input.focus(); this.input.select(); } }
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && this.editing && !this.panels.isOpen && !(doc.activeElement as HTMLElement).matches('input,textarea,[contenteditable="true"]')) { event.preventDefault(); this.undoLayout(); }
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
    const url = s.wallpaper === 'custom' ? s.customImage : s.wallpaper === 'alpine' ? this.host.wallpaperUrl : '';
    if (url !== this.wallpaperSource) {
      root.style.setProperty('--dh-wallpaper-image', url ? `url("${url.replace(/["\\\n\r]/g, '')}")` : 'none'); this.wallpaperSource = url;
    }
    root.style.setProperty('--dh-wallpaper-dim', String(s.dim)); root.style.setProperty('--dh-wallpaper-blur', `${s.blur}px`);
  }
  private tick() {
    if (this.disposed) return; const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: !this.settings.clock24 });
    const date = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
    if (this.time.textContent !== time) this.time.textContent = time;
    if (this.date.textContent !== date) this.date.textContent = date;
    const day = now.toDateString(); const changed = this.day && day !== this.day; this.day = day;
    if (changed) this.renderBoard(); updateClock(this.board, now);
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
  }
  private undoLayout() { const widgets = this.history.pop(); if (widgets) this.commit({ ...this.settings, widgets }, false); }
  private showSaveState(state: SaveState) {
    if (this.disposed || !this.saveStatus) return;
    this.saveStatus.textContent = { queued: '等待保存…', saving: '正在保存…', saved: '已保存', error: '保存失败' }[state];
    this.saveStatus.dataset.state = state;
    this.retrySave.hidden = state !== 'error';
  }
  private readNotes() { this.notes = this.host.getNotes(); this.recent = this.host.getRecent(this.notes); this.noteRevision++; }
  private toggleEdit() {
    this.editing = !this.editing; this.root.classList.toggle('dh-editing', this.editing); this.editButton.setAttribute('aria-pressed', String(this.editing));
    this.editBar.hidden = !this.editing; this.hideSearch(); this.renderBoard();
  }
  private addWidget(kind: WidgetKind) {
    if (this.settings.widgets.some(w => w.kind === kind)) return;
    this.change({ widgets: [...this.settings.widgets, { id: `${kind}-${Date.now()}`, kind, size: kind === 'recent' ? 'l' : kind === 'weather' ? 'm' : 's' }] });
  }
  private renderBoard() {
    if (!this.grid) return;
    this.undoButton.disabled = this.history.length === 0;
    this.resetButton.disabled = JSON.stringify(this.settings.widgets) === JSON.stringify(defaultSettings().widgets);
    this.grid.update(this.settings, this.editing, {
      doc: this.doc, settings: this.settings, notes: this.notes, recent: this.recent, weather: this.weather, weatherStatus: this.weatherStatus,
      open: path => { if (!this.editing) this.openNote(path); }, pin: path => this.commit(togglePin(this.settings, path)),
      choosePins: () => this.panels.pins(), chooseCity: () => this.panels.cities(), refreshWeather: () => void this.loadWeather(true), daily: () => this.daily(),
    }, this.noteRevision, this.day || new Date().toDateString());
  }
  private renderDock() {
    const dock = el(this.doc, 'nav', 'dh-dock'); dock.setAttribute('aria-label', '桌面快捷入口');
    for (const [label, name, color, action] of [
      ['今日日记', 'book', 'purple', () => this.daily()], ['查找笔记', 'search', 'silver', () => { this.input.focus(); this.showSearch(); }],
      ['最近笔记', 'note', 'blue', () => { this.input.value = ''; this.input.focus(); this.showSearch(); }],
      ['固定笔记', 'star', 'gold', () => this.panels.pins()], ['天气城市', 'partly', 'coral', () => this.panels.cities()], ['桌面设置', 'settings', 'slate', () => this.panels.settings()],
    ] as [string, IconName, string, () => void][]) {
      const item = button(this.doc, label, action, `dh-dock-item dh-dock-${color}`); item.append(icon(this.doc, name, 25), el(this.doc, 'span', 'dh-dock-tooltip', label)); dock.append(item);
    }
    this.root.append(dock);
  }
  private showSearch() {
    this.matches = searchNotes(this.notes, this.input.value); this.activeResult = 0; this.results.replaceChildren();
    this.results.append(el(this.doc, 'div', 'dh-search-caption', this.input.value.trim() ? `${this.matches.length} 篇匹配笔记` : '最近修改'));
    if (!this.matches.length) this.results.append(el(this.doc, 'p', 'dh-empty-copy', '没有找到笔记，试试标题或文件夹名称。'));
    this.matches.forEach((note, index) => {
      const row = button(this.doc, `打开 ${note.title}`, () => { this.openNote(note.path); this.hideSearch(); }, 'dh-search-result'); row.id = `${this.instanceId}-result-${index}`; row.setAttribute('role', 'option');
      const copy = el(this.doc, 'span'); copy.append(el(this.doc, 'strong', '', note.title), el(this.doc, 'small', '', note.path)); row.append(icon(this.doc, 'note', 18), copy, icon(this.doc, 'arrow', 16)); this.results.append(row);
    });
    this.results.hidden = false; this.input.setAttribute('aria-expanded', 'true'); this.highlightSearch();
  }
  private highlightSearch() {
    this.results.querySelectorAll<HTMLElement>('[role="option"]').forEach((row, index) => { row.setAttribute('aria-selected', String(index === this.activeResult)); if (index === this.activeResult) row.scrollIntoView?.({ block: 'nearest' }); });
    if (this.matches.length) this.input.setAttribute('aria-activedescendant', `${this.instanceId}-result-${this.activeResult}`); else this.input.removeAttribute('aria-activedescendant');
  }
  private hideSearch() { if (!this.results) return; this.results.hidden = true; this.input.setAttribute('aria-expanded', 'false'); this.input.removeAttribute('aria-activedescendant'); }
  private openNote(path: string) { void this.host.openNote(path).catch(() => this.host.notify('笔记打开失败，文件可能已移动。')); }
  private daily() { void this.host.openDaily().catch(() => this.host.notify('日记创建失败，请检查文件夹与写入权限。')); }
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
    if (this.disposed) return this.writer.flush(); this.disposed = true; this.weatherGeneration++; this.panels.close(); clearInterval(this.timer); clearInterval(this.weatherTimer); this.unsubscribe?.(); this.cleanups.forEach(fn => fn()); this.root.replaceChildren(); this.root.classList.remove('dh-desktop', 'dh-editing');
    return this.writer.flush();
  }
}
