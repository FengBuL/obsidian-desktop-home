import { KINDS, WIDGET_NAMES, type City, type Settings, type WidgetKind } from '../model';
import type { DesktopHost } from '../host';
import { searchNotes } from '../notes';
import { WeatherService } from '../weather';
import { el, button, textButton, rowButton, setVars } from './dom';
import { icon, type IconName } from './icons';
import { version } from '../../manifest.json';

export interface PanelActions {
  getSettings(): Settings;
  change(patch: Partial<Settings>): void;
  pin(path: string): void;
  add(kind: WidgetKind): void;
  city(city: City | null): void;
}
export class Panels {
  private static ids = 0;
  private overlay?: HTMLElement;
  private previous?: HTMLElement;
  private closed?: () => void;
  constructor(private root: HTMLElement, private host: DesktopHost, private actions: PanelActions, private weather: WeatherService) {}
  private create(title: string, subtitle?: string): HTMLElement {
    this.close(); const doc = this.root.ownerDocument;
    this.previous = doc.activeElement instanceof HTMLElement ? doc.activeElement : undefined;
    const overlay = el(doc, 'div', 'dh-overlay');
    const panel = el(doc, 'section', 'dh-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.tabIndex = -1;
    const heading = el(doc, 'div', 'dh-panel-heading'); const h2 = el(doc, 'h2', '', title); h2.id = `dh-panel-title-${++Panels.ids}`; panel.setAttribute('aria-labelledby', h2.id); heading.append(h2);
    const close = button(doc, '关闭面板', () => this.close()); close.append(icon(doc, 'close')); heading.append(close); panel.append(heading);
    if (subtitle) panel.append(el(doc, 'p', 'dh-panel-description', subtitle));
    overlay.append(panel); overlay.addEventListener('click', e => { if (e.target === overlay) this.close(); });
    panel.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); this.close(); }
      if (e.key === 'Tab') {
        const focusable = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,textarea,a[href]')].filter(e => e.getAttribute('type') !== 'file');
        const index = doc.activeElement instanceof HTMLElement ? focusable.indexOf(doc.activeElement) : -1;
        if (!focusable.length) { e.preventDefault(); return; }
        if (e.shiftKey && index <= 0) { e.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!e.shiftKey && (index === focusable.length - 1 || index < 0)) { e.preventDefault(); focusable[0].focus(); }
      }
    });
    this.root.append(overlay); this.overlay = overlay; panel.focus({ preventScroll: true }); return panel;
  }
  close() { this.closed?.(); this.closed = undefined; this.overlay?.remove(); this.overlay = undefined; if (this.previous?.isConnected) this.previous.focus({ preventScroll: true }); this.previous = undefined; }
  /** 电脑端自动聚焦输入框；手机上不自动弹出键盘，也避免页面跳动。 */
  private autofocus(input: HTMLInputElement) { if (!this.host.mobile) input.focus({ preventScroll: true }); }
  get isOpen() { return !!this.overlay; }
  appearance() {
    const doc = this.root.ownerDocument;
    const panel = this.create('桌面外观', '选一种心情，让桌面成为你的空间。');
    const themeTitle = el(doc, 'h3', '', '主题'); themeTitle.id = `dh-theme-title-${Panels.ids}`; panel.append(themeTitle);
    const themes = el(doc, 'div', 'dh-theme-options'); themes.setAttribute('role', 'group'); themes.setAttribute('aria-labelledby', themeTitle.id);
    const update = () => themes.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === this.actions.getSettings().theme)));
    for (const [value, label, sub] of [['auto', '自动', '跟随 Obsidian 明暗'], ['sky', '晴空', '轻盈 · 清透'], ['midnight', '午夜', '沉静 · 深邃'], ['paper', '暖纸', '柔和 · 温润']] as const) {
      const choice = rowButton(doc, () => { this.actions.change({ theme: value }); update(); }, `dh-theme-option dh-theme-${value}`); choice.dataset.themeChoice = value;
      const sample = el(doc, 'span', 'dh-theme-sample'); sample.append(el(doc, 'i'), el(doc, 'i'), el(doc, 'i'));
      choice.append(sample, el(doc, 'strong', '', label), el(doc, 'small', '', sub)); themes.append(choice);
    }
    update(); panel.append(themes);
    panel.append(el(doc, 'h3', '', '壁纸'));
    const wallpapers = el(doc, 'div', 'dh-wallpaper-options');
    const refreshWallpaper = () => wallpapers.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.wallpaperChoice === this.actions.getSettings().wallpaper)));
    for (const [value, label] of [['alpine', '山湖暮色'], ['dusk', '柔雾渐变']] as const) {
      const choice = rowButton(doc, () => { this.actions.change({ wallpaper: value }); refreshWallpaper(); }, `dh-wallpaper-option dh-wallpaper-${value}`); choice.dataset.wallpaperChoice = value;
      if (value === 'alpine') setVars(choice, { '--dh-thumb': `url("${this.host.wallpaperUrl.replace(/["\\\n\r]/g, '')}")` });
      choice.append(el(doc, 'span', '', label)); wallpapers.append(choice);
    }
    const settingsNow = this.actions.getSettings();
    if (settingsNow.wallpaper === 'vault' || settingsNow.wallpaperPath) {
      const url = this.host.resourceUrl?.(settingsNow.wallpaperPath) ?? '';
      const choice = rowButton(doc, () => { this.actions.change({ wallpaper: 'vault' }); refreshWallpaper(); }, 'dh-wallpaper-option dh-wallpaper-vault'); choice.dataset.wallpaperChoice = 'vault';
      if (url) setVars(choice, { '--dh-thumb': `url("${url.replace(/["\\\n\r]/g, '')}")` });
      choice.append(el(doc, 'span', '', settingsNow.wallpaperPath.split('/').pop() ?? '库内图片')); wallpapers.append(choice);
    }
    panel.append(wallpapers); refreshWallpaper();
    const file = el(doc, 'input', 'dh-file-input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.setAttribute('aria-label', '选择本地壁纸文件');
    let active = true; this.closed = () => { active = false; };
    file.addEventListener('change', () => {
      const selected = file.files?.[0]; if (!selected) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size > 20_000_000) { this.host.notify('请选择 20 MB 以内的 PNG、JPG 或 WebP 图片'); return; }
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        if (!active || typeof reader.result !== 'string') return;
        void shrinkImage(doc, reader.result).then(data => {
          if (!active) return;
          if (data.length > 7_500_000) { this.host.notify('图片太大，请换一张小一点的图片'); return; }
          this.actions.change({ customImage: data, wallpaper: 'custom' }); refreshWallpaper(); this.host.notify('壁纸已更新');
        });
      });
      reader.addEventListener('error', () => { if (active) this.host.notify('图片读取失败，请重新选择'); }); reader.readAsDataURL(selected);
    });
    const sources = el(doc, 'div', 'dh-wallpaper-sources');
    const upload = textButton(doc, '上传图片', () => file.click(), 'dh-upload-button'); upload.prepend(icon(doc, 'upload', 17)); sources.append(upload);
    if (this.host.listImages) { const pick = textButton(doc, '从笔记库选择', () => this.images(), 'dh-upload-button'); pick.prepend(icon(doc, 'images', 17)); sources.append(pick); }
    panel.append(file, sources);
    if (this.actions.getSettings().customImage) panel.append(textButton(doc, '使用上次上传的壁纸', () => { this.actions.change({ wallpaper: 'custom' }); refreshWallpaper(); }));
    this.range(panel, '壁纸遮罩', this.actions.getSettings().dim, 0, 0.65, 0.01, value => this.actions.change({ dim: value }));
    this.range(panel, '壁纸模糊', this.actions.getSettings().blur, 0, 20, 1, value => this.actions.change({ blur: value }));
    panel.append(el(doc, 'p', 'dh-panel-note', '主题只影响桌面首页，布局与笔记保持原位。上传的图片会缩小后保存在插件配置里；从笔记库选择则只记住图片路径，不占额外空间。'));
  }
  /** 从库里挑一张图片当壁纸，只保存路径。 */
  images() {
    const doc = this.root.ownerDocument; const panel = this.create('从笔记库选择壁纸', '选一张库里的图片作为桌面背景。只记住路径，图片改名或移动后会自动跟随。');
    const input = el(doc, 'input', 'dh-panel-input'); input.placeholder = '按文件名筛选…'; panel.append(input);
    const grid = el(doc, 'div', 'dh-image-choices'); panel.append(grid);
    const all = this.host.listImages?.() ?? [];
    const render = () => {
      grid.replaceChildren(); const q = input.value.trim().toLocaleLowerCase();
      const list = all.filter(p => p.toLocaleLowerCase().includes(q)).slice(0, 60);
      for (const path of list) {
        const choice = rowButton(doc, () => { this.actions.change({ wallpaper: 'vault', wallpaperPath: path }); this.host.notify('壁纸已更新'); this.appearance(); }, 'dh-image-choice');
        const url = this.host.resourceUrl?.(path); if (url) setVars(choice, { '--dh-thumb': `url("${url.replace(/["\\\n\r]/g, '')}")` });
        choice.append(el(doc, 'span', '', path.split('/').pop() ?? path)); choice.title = path; grid.append(choice);
      }
      if (!list.length) grid.append(el(doc, 'p', 'dh-empty-copy', all.length ? '没有匹配的图片' : '库里还没有 PNG、JPG、WebP 或 GIF 图片。'));
    };
    input.addEventListener('input', render); render(); this.autofocus(input);
  }
  private range(panel: HTMLElement, title: string, value: number, min: number, max: number, step: number, change: (value: number) => void) {
    const doc = this.root.ownerDocument; const label = el(doc, 'label', 'dh-setting-row'); label.append(el(doc, 'span', '', title));
    const input = el(doc, 'input'); input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value); input.dataset.name = title;
    input.addEventListener('input', () => change(Number(input.value))); label.append(input); panel.append(label);
  }
  settings() {
    const doc = this.root.ownerDocument; const panel = this.create('桌面设置', '让每次打开，都刚好适合你。');
    for (const [key, label, description] of [['openOnStart', '启动时打开首页', '下次启动 Obsidian 时打开桌面'], ['clock24', '24 小时制', '关闭后显示上午 / 下午']] as const) {
      const row = el(doc, 'label', 'dh-setting-row'); const copy = el(doc, 'span'); copy.append(el(doc, 'strong', '', label), el(doc, 'small', '', description));
      const input = el(doc, 'input'); input.type = 'checkbox'; input.checked = this.actions.getSettings()[key];
      input.addEventListener('change', () => this.actions.change({ [key]: input.checked })); row.append(copy, input); panel.append(row);
    }
    const weather = textButton(doc, '设置天气城市', () => this.cities(), 'dh-settings-action'); weather.append(icon(doc, 'chevron', 16)); panel.append(weather);
    const appearance = textButton(doc, '更换主题与壁纸', () => this.appearance(), 'dh-settings-action'); appearance.append(icon(doc, 'chevron', 16)); panel.append(appearance);
    panel.append(el(doc, 'p', 'dh-panel-note', '笔记搜索在本地进行。城市查询与天气使用 Open-Meteo；只有主动选择城市后才会发送城市和坐标。日记位置、搜索排除文件夹等更多选项在 Obsidian 设置 → Desktop Home 中。'));
    panel.append(el(doc, 'p', 'dh-panel-note', `Desktop Home · ${version}`));
  }
  widgets() {
    const doc = this.root.ownerDocument; const panel = this.create('添加组件', '选好尺寸，把喜欢的信息放到桌面。');
    const descriptions: Record<WidgetKind, string> = { clock: '留意时间，也留一点空白', weather: '看看窗外，安排今天', calendar: '今天，以及接下来的日子；有日记的日子会标出来', recent: '接着上次的灵感继续', pinned: '让常用笔记触手可及', tasks: '今日日记里的待办和到期任务，可直接勾选', memo: '随手记一句话，不新建笔记' };
    const marks: Record<WidgetKind, IconName> = { clock: 'clock', weather: 'partly', calendar: 'calendar', recent: 'history', pinned: 'pin', tasks: 'tasks', memo: 'memo' };
    for (const kind of KINDS) {
      const exists = this.actions.getSettings().widgets.some(w => w.kind === kind);
      const row = rowButton(doc, () => { this.actions.add(kind); this.close(); }, 'dh-add-widget'); row.disabled = exists; row.dataset.kind = kind;
      const mark = el(doc, 'span', `dh-add-widget-mark dh-mark-${kind}`); mark.append(icon(doc, marks[kind], 22));
      const copy = el(doc, 'span'); copy.append(el(doc, 'strong', '', WIDGET_NAMES[kind]), el(doc, 'small', '', descriptions[kind])); row.append(mark, copy, icon(doc, exists ? 'check' : 'plus', 18)); panel.append(row);
    }
  }
  pins() {
    const doc = this.root.ownerDocument; const panel = this.create('固定笔记', '选择常用笔记，随时回到熟悉的地方。');
    const input = el(doc, 'input', 'dh-panel-input'); input.placeholder = '搜索要固定的笔记…'; panel.append(input);
    const list = el(doc, 'div', 'dh-pin-choices'); panel.append(list);
    const render = () => {
      list.replaceChildren();
      const settings = this.actions.getSettings(); const allNotes = this.host.getNotes();
      const matches = searchNotes(allNotes, input.value, 50);
      const missing = settings.pins.filter(p => !allNotes.some(n => n.path === p) && p.toLocaleLowerCase().includes(input.value.toLocaleLowerCase()));
      for (const note of [...matches, ...missing.map(path => ({ title: `${path}（已移除）`, path, modified: 0 }))]) {
        const selected = settings.pins.includes(note.path);
        const row = rowButton(doc, () => { this.actions.pin(note.path); render(); }, 'dh-pin-choice'); row.setAttribute('aria-pressed', String(selected));
        const text = el(doc, 'span'); text.append(el(doc, 'strong', '', note.title), el(doc, 'small', '', note.path)); row.append(icon(doc, 'note', 18), text, icon(doc, selected ? 'check' : 'plus', 17)); list.append(row);
      }
      if (!list.children.length) list.append(el(doc, 'p', 'dh-empty-copy', '没有找到笔记'));
    };
    input.addEventListener('input', render); render(); this.autofocus(input);
  }
  cities() {
    const doc = this.root.ownerDocument; const panel = this.create('天气城市', '输入城市并查询，会将城市名发送给 Open-Meteo。选中后每 30 分钟更新天气；笔记内容留在本地。');
    const form = el(doc, 'form', 'dh-city-form'); const input = el(doc, 'input', 'dh-panel-input'); input.placeholder = '城市名，例如 上海'; input.required = true;
    const submit = el(doc, 'button', 'dh-primary-button', '查询'); submit.type = 'submit'; form.append(input, submit); panel.append(form);
    const status = el(doc, 'p', 'dh-panel-note'); status.setAttribute('role', 'status'); const list = el(doc, 'div', 'dh-city-choices'); panel.append(status, list);
    let alive = true; let generation = 0; this.closed = () => { alive = false; };
    const search = async () => {
      if (input.value.trim().length < 2) { status.textContent = '请输入至少两个字符'; return; }
      const request = ++generation; submit.disabled = true; status.textContent = '正在查找城市…'; list.replaceChildren();
      try {
        const cities = await this.weather.cities(input.value.trim()); if (!alive || generation !== request) return;
        status.textContent = cities.length ? '请选择城市' : '没有找到城市，可以试试英文名称。';
        for (const city of cities) {
          const row = rowButton(doc, () => { this.actions.city(city); this.close(); }, 'dh-city-choice');
          const copy = el(doc, 'span'); copy.append(el(doc, 'strong', '', city.name), el(doc, 'small', '', city.region ?? '')); row.append(icon(doc, 'location', 18), copy, icon(doc, 'chevron', 16)); list.append(row);
        }
      } catch { if (alive) status.textContent = '城市查询失败，请检查网络后重试。'; }
      finally { if (alive) submit.disabled = false; }
    };
    form.addEventListener('submit', e => { e.preventDefault(); void search(); });
    if (this.actions.getSettings().city) panel.append(textButton(doc, '停用天气并清除城市', () => { this.actions.city(null); this.close(); }, 'dh-danger-button'));
    const credit = el(doc, 'a', 'dh-panel-note', '天气数据由 Open-Meteo 提供 · 个人非商业预览'); credit.href = 'https://open-meteo.com/'; credit.target = '_blank'; credit.rel = 'noopener noreferrer'; panel.append(credit); this.autofocus(input);
  }
}

/** 把上传的图片缩到最长边 2560px 并转成 JPEG/WebP，避免几 MB 的原图塞进插件配置；无法处理时保留原图。 */
export async function shrinkImage(doc: Document, dataUrl: string, maxSide = 2560): Promise<string> {
  try {
    const image = doc.createElement('img'); image.src = dataUrl; await image.decode();
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = doc.createElement('canvas'); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext('2d'); if (!context || !canvas.width) return dataUrl;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', 0.86); const result = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.86);
    return result.length < dataUrl.length ? result : dataUrl;
  } catch { return dataUrl; }
}
