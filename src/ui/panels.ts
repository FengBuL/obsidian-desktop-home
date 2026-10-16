import { KINDS, WIDGET_NAMES, type City, type Settings, type WidgetKind } from '../model';
import type { DesktopHost } from '../host';
import { searchNotes } from '../notes';
import { WeatherService } from '../weather';
import { el, button, textButton } from './dom';
import { icon } from './icons';
import { version } from '../../manifest.json';

export interface PanelActions {
  getSettings(): Settings;
  change(patch: Partial<Settings>): void;
  pin(path: string): void;
  add(kind: WidgetKind): void;
  city(city: City | null): void;
}
export class Panels {
  private overlay?: HTMLElement;
  private previous?: HTMLElement;
  private closed?: () => void;
  constructor(private root: HTMLElement, private host: DesktopHost, private actions: PanelActions, private weather: WeatherService) {}
  private create(title: string, subtitle?: string): HTMLElement {
    this.close(); const doc = this.root.ownerDocument;
    this.previous = doc.activeElement as HTMLElement;
    const overlay = el(doc, 'div', 'dh-overlay');
    const panel = el(doc, 'section', 'dh-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', title); panel.tabIndex = -1;
    const heading = el(doc, 'div', 'dh-panel-heading'); heading.append(el(doc, 'h2', '', title));
    const close = button(doc, '关闭面板', () => this.close()); close.append(icon(doc, 'close')); heading.append(close); panel.append(heading);
    if (subtitle) panel.append(el(doc, 'p', 'dh-panel-description', subtitle));
    overlay.append(panel); overlay.addEventListener('click', e => { if (e.target === overlay) this.close(); });
    panel.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); this.close(); }
      if (e.key === 'Tab') {
        const focusable = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,a[href]')].filter(e => e.getAttribute('type') !== 'file');
        const index = focusable.indexOf(doc.activeElement as HTMLElement);
        if (!focusable.length) { e.preventDefault(); return; }
        if (e.shiftKey && index <= 0) { e.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!e.shiftKey && (index === focusable.length - 1 || index < 0)) { e.preventDefault(); focusable[0].focus(); }
      }
    });
    this.root.append(overlay); this.overlay = overlay; panel.focus(); return panel;
  }
  close() { this.closed?.(); this.closed = undefined; this.overlay?.remove(); this.overlay = undefined; if (this.previous?.isConnected) this.previous.focus(); this.previous = undefined; }
  get isOpen() { return !!this.overlay; }
  appearance() {
    const doc = this.root.ownerDocument;
    const panel = this.create('桌面外观', '选一种心情，让桌面成为你的空间。');
    panel.append(el(doc, 'h3', '', '主题'));
    const themes = el(doc, 'div', 'dh-theme-options'); themes.setAttribute('role', 'group'); themes.setAttribute('aria-label', '主题');
    const update = () => themes.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === this.actions.getSettings().theme)));
    for (const [value, label, sub] of [['sky', '晴空', '轻盈 · 清透'], ['midnight', '午夜', '沉静 · 深邃'], ['paper', '暖纸', '柔和 · 温润']] as const) {
      const choice = button(doc, label, () => { this.actions.change({ theme: value }); update(); }, `dh-theme-option dh-theme-${value}`); choice.dataset.themeChoice = value;
      const sample = el(doc, 'span', 'dh-theme-sample'); sample.append(el(doc, 'i'), el(doc, 'i'), el(doc, 'i'));
      choice.append(sample, el(doc, 'strong', '', label), el(doc, 'small', '', sub)); themes.append(choice);
    }
    update(); panel.append(themes);
    panel.append(el(doc, 'h3', '', '壁纸'));
    const wallpapers = el(doc, 'div', 'dh-wallpaper-options');
    const refreshWallpaper = () => wallpapers.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.wallpaperChoice === this.actions.getSettings().wallpaper)));
    for (const [value, label] of [['alpine', '山湖暮色'], ['dusk', '柔雾渐变']] as const) {
      const choice = button(doc, label, () => { this.actions.change({ wallpaper: value }); refreshWallpaper(); }, `dh-wallpaper-option dh-wallpaper-${value}`); choice.dataset.wallpaperChoice = value;
      if (value === 'alpine') choice.style.backgroundImage = `linear-gradient(transparent, #101c3b88), url("${this.host.wallpaperUrl}")`;
      choice.append(el(doc, 'span', '', label)); wallpapers.append(choice);
    }
    panel.append(wallpapers); refreshWallpaper();
    const file = el(doc, 'input', 'dh-file-input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.setAttribute('aria-label', '选择本地壁纸文件');
    let active = true; this.closed = () => { active = false; };
    file.addEventListener('change', () => {
      const selected = file.files?.[0]; if (!selected) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size > 5_000_000) { this.host.notify('请选择 5 MB 以内的 PNG、JPG 或 WebP 图片'); return; }
      const reader = new FileReader();
      reader.addEventListener('load', () => { if (active && typeof reader.result === 'string') { this.actions.change({ customImage: reader.result, wallpaper: 'custom' }); refreshWallpaper(); this.host.notify('壁纸已更新'); } });
      reader.addEventListener('error', () => { if (active) this.host.notify('图片读取失败，请重新选择'); }); reader.readAsDataURL(selected);
    });
    const upload = textButton(doc, '上传本地壁纸', () => file.click(), 'dh-upload-button'); upload.prepend(icon(doc, 'upload', 17)); panel.append(file, upload);
    if (this.actions.getSettings().customImage) panel.append(textButton(doc, '使用上次上传的壁纸', () => { this.actions.change({ wallpaper: 'custom' }); refreshWallpaper(); }));
    this.range(panel, '壁纸遮罩', this.actions.getSettings().dim, 0, 0.65, 0.01, value => this.actions.change({ dim: value }));
    this.range(panel, '壁纸模糊', this.actions.getSettings().blur, 0, 20, 1, value => this.actions.change({ blur: value }));
    panel.append(el(doc, 'p', 'dh-panel-note', '主题只影响桌面首页，布局与笔记保持原位。'));
  }
  private range(panel: HTMLElement, title: string, value: number, min: number, max: number, step: number, change: (value: number) => void) {
    const doc = this.root.ownerDocument; const label = el(doc, 'label', 'dh-setting-row'); label.append(el(doc, 'span', '', title));
    const input = el(doc, 'input'); input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value); input.setAttribute('aria-label', title);
    input.addEventListener('input', () => change(Number(input.value))); label.append(input); panel.append(label);
  }
  settings() {
    const doc = this.root.ownerDocument; const panel = this.create('桌面设置', '让每次打开，都刚好适合你。');
    for (const [key, label, description] of [['openOnStart', '启动时打开首页', '下次启动 Obsidian 时打开桌面'], ['clock24', '24 小时制', '关闭后显示上午 / 下午']] as const) {
      const row = el(doc, 'label', 'dh-setting-row'); const copy = el(doc, 'span'); copy.append(el(doc, 'strong', '', label), el(doc, 'small', '', description));
      const input = el(doc, 'input'); input.type = 'checkbox'; input.checked = this.actions.getSettings()[key]; input.setAttribute('aria-label', label);
      input.addEventListener('change', () => this.actions.change({ [key]: input.checked })); row.append(copy, input); panel.append(row);
    }
    const weather = textButton(doc, '设置天气城市', () => this.cities(), 'dh-settings-action'); weather.append(icon(doc, 'chevron', 16)); panel.append(weather);
    const appearance = textButton(doc, '更换主题与壁纸', () => this.appearance(), 'dh-settings-action'); appearance.append(icon(doc, 'chevron', 16)); panel.append(appearance);
    panel.append(el(doc, 'p', 'dh-panel-note', '笔记搜索在本地进行。城市查询与天气使用 Open-Meteo；只有主动选择城市后才会发送城市和坐标。'));
    panel.append(el(doc, 'p', 'dh-panel-note', `Desktop Home · ${version} · 电脑端预览版`));
  }
  widgets() {
    const doc = this.root.ownerDocument; const panel = this.create('添加组件', '选好尺寸，把喜欢的信息放到桌面。');
    const descriptions: Record<WidgetKind, string> = { clock: '留意时间，也留一点空白', weather: '看看窗外，安排今天', calendar: '今天，以及接下来的日子', recent: '接着上次的灵感继续', pinned: '让常用笔记触手可及' };
    for (const kind of KINDS) {
      const exists = this.actions.getSettings().widgets.some(w => w.kind === kind);
      const row = button(doc, `添加${WIDGET_NAMES[kind]}`, () => { this.actions.add(kind); this.close(); }, 'dh-add-widget'); row.disabled = exists;
      const mark = el(doc, 'span', `dh-add-widget-mark dh-mark-${kind}`); mark.append(icon(doc, kind === 'recent' ? 'note' : kind === 'pinned' ? 'pin' : kind === 'weather' ? 'partly' : kind, 26));
      const copy = el(doc, 'span'); copy.append(el(doc, 'strong', '', WIDGET_NAMES[kind]), el(doc, 'small', '', descriptions[kind])); row.append(mark, copy, icon(doc, exists ? 'check' : 'plus', 18)); panel.append(row);
    }
  }
  pins() {
    const doc = this.root.ownerDocument; const panel = this.create('固定笔记', '选择常用笔记，随时回到熟悉的地方。');
    const input = el(doc, 'input', 'dh-panel-input'); input.placeholder = '搜索笔记…'; input.setAttribute('aria-label', '搜索要固定的笔记'); panel.append(input);
    const list = el(doc, 'div', 'dh-pin-choices'); panel.append(list);
    const render = () => {
      list.replaceChildren();
      const settings = this.actions.getSettings(); const allNotes = this.host.getNotes();
      const matches = searchNotes(allNotes, input.value, 50);
      const missing = settings.pins.filter(p => !allNotes.some(n => n.path === p) && p.toLocaleLowerCase().includes(input.value.toLocaleLowerCase()));
      for (const note of [...matches, ...missing.map(path => ({ title: `${path}（已移除）`, path, modified: 0 }))]) {
        const selected = settings.pins.includes(note.path);
        const row = button(doc, `${selected ? '取消固定' : '固定'} ${note.title}`, () => { this.actions.pin(note.path); render(); }, 'dh-pin-choice'); row.setAttribute('aria-pressed', String(selected));
        const text = el(doc, 'span'); text.append(el(doc, 'strong', '', note.title), el(doc, 'small', '', note.path)); row.append(icon(doc, 'note', 18), text, icon(doc, selected ? 'check' : 'plus', 17)); list.append(row);
      }
      if (!list.children.length) list.append(el(doc, 'p', 'dh-empty-copy', '没有找到笔记'));
    };
    input.addEventListener('input', render); render(); input.focus();
  }
  cities() {
    const doc = this.root.ownerDocument; const panel = this.create('天气城市', '输入城市并查询，会将城市名发送给 Open-Meteo。选中后每 30 分钟更新天气；笔记内容留在本地。');
    const form = el(doc, 'form', 'dh-city-form'); const input = el(doc, 'input', 'dh-panel-input'); input.placeholder = '例如：上海、Tokyo'; input.setAttribute('aria-label', '城市名称'); input.required = true;
    const submit = el(doc, 'button', 'dh-primary-button', '查询'); submit.type = 'submit'; form.append(input, submit); panel.append(form);
    const status = el(doc, 'p', 'dh-panel-note'); status.setAttribute('role', 'status'); const list = el(doc, 'div', 'dh-city-choices'); panel.append(status, list);
    let alive = true; let generation = 0; this.closed = () => { alive = false; };
    form.addEventListener('submit', async e => {
      e.preventDefault(); if (input.value.trim().length < 2) { status.textContent = '请输入至少两个字符'; return; }
      const request = ++generation; submit.disabled = true; status.textContent = '正在查找城市…'; list.replaceChildren();
      try {
        const cities = await this.weather.cities(input.value.trim()); if (!alive || generation !== request) return;
        status.textContent = cities.length ? '请选择城市' : '没有找到城市，可以试试英文名称。';
        for (const city of cities) {
          const row = button(doc, `选择城市 ${city.name} ${city.region}`, () => { this.actions.city(city); this.close(); }, 'dh-city-choice');
          const copy = el(doc, 'span'); copy.append(el(doc, 'strong', '', city.name), el(doc, 'small', '', city.region ?? '')); row.append(icon(doc, 'location', 18), copy, icon(doc, 'chevron', 16)); list.append(row);
        }
      } catch { if (alive) status.textContent = '城市查询失败，请检查网络后重试。'; }
      finally { if (alive) submit.disabled = false; }
    });
    if (this.actions.getSettings().city) panel.append(textButton(doc, '停用天气并清除城市', () => { this.actions.city(null); this.close(); }, 'dh-danger-button'));
    const credit = el(doc, 'a', 'dh-panel-note', '天气数据由 Open-Meteo 提供 · 个人非商业预览'); credit.href = 'https://open-meteo.com/'; credit.target = '_blank'; credit.rel = 'noopener noreferrer'; panel.append(credit); input.focus();
  }
}
