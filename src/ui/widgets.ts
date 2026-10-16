import { MEMO_LIMIT, type Settings, type WeatherSnapshot, type Widget } from '../model';
import { folderOf, localDate, relativeTime, toneOf, type Note } from '../notes';
import { dueLabel, type TaskItem } from '../tasks';
import { weatherDescription } from '../weather';
import { el, button, textButton, rowButton, setVars } from './dom';
import { icon, type IconName } from './icons';
import { skyTone, weatherGlyph } from './weather-glyphs';

export interface WidgetContext {
  doc: Document; settings: Settings; notes: Map<string, Note>; recent: Note[];
  weather: WeatherSnapshot | null; weatherStatus: string;
  /** null 表示尚未读取。 */
  tasks: TaskItem[] | null; canAddTask: boolean; dailyDays: Set<number>;
  open: (path: string) => void; pin: (path: string) => void;
  choosePins: () => void; chooseCity: () => void; refreshWeather: () => void; daily: (date?: Date) => void;
  completeTask: (task: TaskItem) => void; addTask: (text: string) => void; memo: (text: string) => void;
}
export function renderWidget(w: Widget, c: WidgetContext): HTMLElement {
  const { doc } = c; const body = el(doc, 'div', `dh-widget-body dh-${w.kind}-body`);
  if (w.kind === 'clock') renderClock(body, c, w);
  else if (w.kind === 'weather') renderWeather(body, c, w);
  else if (w.kind === 'calendar') renderCalendar(body, c, w);
  else if (w.kind === 'recent') renderRecent(body, c, w);
  else if (w.kind === 'tasks') renderTasks(body, c, w);
  else if (w.kind === 'memo') renderMemo(body, c);
  else renderPinned(body, c, w);
  return body;
}
/** 统一的组件标题：彩色小图标 + 标题，右侧可放计数或操作。 */
function heading(doc: Document, glyph: IconName, title: string, ...extra: HTMLElement[]) {
  const head = el(doc, 'div', 'dh-widget-heading'); const name = el(doc, 'h2', 'dh-widget-title');
  name.append(icon(doc, glyph, 14), el(doc, 'span', '', title)); head.append(name, ...extra); return head;
}
const weekday = (date: Date) => date.toLocaleDateString('zh-CN', { weekday: 'long' });
function weekOfYear(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); const start = Date.UTC(d.getUTCFullYear(), 0, 1); return Math.ceil(((d.getTime() - start) / 86_400_000 + 1) / 7);
}
function renderClock(body: HTMLElement, { doc }: WidgetContext, w: Widget) {
  const face = el(doc, 'div', 'dh-clock-face'); face.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 60; i++) { const tick = el(doc, 'i', i % 5 === 0 ? 'dh-tick dh-major-tick' : 'dh-tick'); setVars(tick, { '--angle': `${i * 6}deg` }); face.append(tick); }
  for (let n = 1; n <= 12; n++) {
    const a = (n * Math.PI) / 6; const number = el(doc, 'span', 'dh-clock-number', String(n));
    setVars(number, { '--x': `${50 + Math.sin(a) * 34}%`, '--y': `${50 - Math.cos(a) * 34}%` }); face.append(number);
  }
  face.append(el(doc, 'div', 'dh-hand dh-hour-hand'), el(doc, 'div', 'dh-hand dh-minute-hand'), el(doc, 'div', 'dh-hand dh-second-hand'), el(doc, 'i', 'dh-clock-pivot'));
  body.append(face);
  if (w.size !== 's') {
    const now = new Date(); const info = el(doc, 'div', 'dh-clock-info');
    const progress = Math.floor(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (new Date(now.getFullYear() + 1, 0, 1).getTime() - new Date(now.getFullYear(), 0, 1).getTime())) * 100);
    info.append(el(doc, 'div', 'dh-clock-digital'), el(doc, 'div', 'dh-clock-date', `${now.getMonth() + 1}月${now.getDate()}日 ${weekday(now)}`), el(doc, 'div', 'dh-clock-meta', `第 ${weekOfYear(now)} 周 · 今年已过 ${progress}%`));
    body.append(info);
  }
  updateClock(body, new Date());
}
/** 指针角度写入 CSS 变量，样式表负责旋转；中、大尺寸同时更新数字时间。 */
export function updateClock(root: HTMLElement, date: Date, digital?: string) {
  const faces = root.querySelectorAll<HTMLElement>('.dh-clock-face'); if (!faces.length) return;
  const props = { '--dh-hour': `${(date.getHours() % 12) * 30 + date.getMinutes() / 2}deg`, '--dh-minute': `${date.getMinutes() * 6 + date.getSeconds() / 10}deg`, '--dh-second': `${date.getSeconds() * 6}deg` };
  faces.forEach(face => setVars(face, props));
  const text = digital ?? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  root.querySelectorAll<HTMLElement>('.dh-clock-digital').forEach(node => { if (node.textContent !== text) node.textContent = text; });
}
function dayLabel(date: string, index: number) { return index === 0 ? '今天' : new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' }); }
function renderWeather(body: HTMLElement, c: WidgetContext, w: Widget) {
  const { doc, weather: data, settings } = c;
  const top = el(doc, 'div', 'dh-weather-top');
  const city = button(doc, settings.city ? '更换天气城市' : '选择天气城市', c.chooseCity, 'dh-city-button');
  city.append(el(doc, 'span', '', settings.city?.name ?? '天气'), icon(doc, 'location', 12));
  top.append(city);
  if (settings.city) { const refresh = button(doc, '刷新天气', c.refreshWeather, 'dh-icon-button dh-weather-refresh'); refresh.append(icon(doc, 'refresh', 13)); top.append(refresh); }
  body.append(top);
  if (!data) {
    body.dataset.sky = 'clear';
    const center = el(doc, 'div', 'dh-weather-empty');
    center.append(weatherGlyph(doc, 2, true, w.size === 's' ? 44 : 64));
    const copy = el(doc, 'div', 'dh-weather-empty-copy');
    copy.append(el(doc, 'strong', '', settings.city ? '正在等待天气' : '把天气带到桌面'), el(doc, 'small', '', c.weatherStatus || (settings.city ? '天气尚未更新' : '选择城市后启用 · 无需定位')));
    copy.append(textButton(doc, settings.city ? '重新获取' : '选择城市', settings.city ? c.refreshWeather : c.chooseCity, 'dh-weather-setup'));
    center.append(copy); body.append(center); return;
  }
  const isDay = data.isDay ?? (new Date().getHours() >= 6 && new Date().getHours() < 18);
  body.dataset.sky = skyTone(data.code, isDay);
  const today = data.days[0];
  const main = el(doc, 'div', 'dh-weather-main');
  const temp = el(doc, 'div', 'dh-temperature', `${data.temperature}°`);
  const summary = el(doc, 'div', 'dh-weather-summary');
  const range = w.size === 's' ? `${Math.round(today.high)}° / ${Math.round(today.low)}°` : `最高 ${Math.round(today.high)}°  最低 ${Math.round(today.low)}°`;
  summary.append(el(doc, 'span', 'dh-condition', weatherDescription(data.code)), el(doc, 'span', 'dh-high-low', range));
  main.append(temp, summary, weatherGlyph(doc, data.code, isDay, w.size === 's' ? 44 : w.size === 'm' ? 56 : 76)); body.append(main);
  if (w.size === 'm') {
    const forecast = el(doc, 'div', 'dh-forecast');
    for (const [i, day] of data.days.slice(0, 5).entries()) {
      const entry = el(doc, 'div', 'dh-forecast-day');
      entry.append(el(doc, 'span', 'dh-forecast-label', dayLabel(day.date, i)), weatherGlyph(doc, day.code, true, 24), el(doc, 'span', 'dh-forecast-temp', `${Math.round(day.high)}°`));
      forecast.append(entry);
    }
    body.append(forecast);
  }
  if (w.size === 'l') {
    const list = el(doc, 'div', 'dh-forecast-list');
    const lows = data.days.map(d => d.low); const highs = data.days.map(d => d.high);
    const min = Math.min(...lows); const span = Math.max(1, Math.max(...highs) - min);
    for (const [i, day] of data.days.entries()) {
      const row = el(doc, 'div', 'dh-forecast-row');
      const bar = el(doc, 'span', 'dh-range'); const fill = el(doc, 'i');
      setVars(fill, { '--from': `${((day.low - min) / span) * 100}%`, '--to': `${((day.high - min) / span) * 100}%` }); bar.append(fill);
      row.append(el(doc, 'span', 'dh-forecast-label', dayLabel(day.date, i)), weatherGlyph(doc, day.code, true, 24), el(doc, 'span', 'dh-forecast-low', `${Math.round(day.low)}°`), bar, el(doc, 'span', 'dh-forecast-temp', `${Math.round(day.high)}°`));
      list.append(row);
    }
    body.append(list);
  }
  const foot = el(doc, 'div', 'dh-weather-foot');
  const credit = el(doc, 'a', '', 'Open-Meteo'); credit.href = 'https://open-meteo.com/'; credit.target = '_blank'; credit.rel = 'noopener noreferrer';
  foot.append(el(doc, 'small', '', c.weatherStatus || `${new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新`), credit); body.append(foot);
}
function monthGrid(doc: Document, c: WidgetContext, date: Date, interactive: boolean) {
  const grid = el(doc, 'div', 'dh-month-grid');
  for (const day of ['一', '二', '三', '四', '五', '六', '日']) grid.append(el(doc, 'span', 'dh-week-label', day));
  const start = (new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) % 7;
  for (let i = 0; i < start; i++) grid.append(el(doc, 'span', 'dh-day-blank'));
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  for (let n = 1; n <= count; n++) {
    const weekend = (start + n - 1) % 7 >= 5;
    const cls = ['dh-day', n === date.getDate() ? 'dh-today' : '', c.dailyDays.has(n) ? 'dh-has-daily' : '', weekend ? 'dh-weekend' : '', n < date.getDate() ? 'dh-past' : ''].filter(Boolean).join(' ');
    // 中、大尺寸可以点日期打开那天的日记；小尺寸格子太小，只显示标记。
    if (!interactive) { grid.append(el(doc, 'span', cls, String(n))); continue; }
    const day = button(doc, `${date.getMonth() + 1}月${n}日${c.dailyDays.has(n) ? '的日记' : ' · 新建日记'}`, () => c.daily(new Date(date.getFullYear(), date.getMonth(), n)), cls);
    day.textContent = String(n); grid.append(day);
  }
  return grid;
}
function renderCalendar(body: HTMLElement, c: WidgetContext, w: Widget) {
  const { doc } = c; const date = new Date(); const hasToday = c.dailyDays.has(date.getDate());
  const dateBtn = button(doc, hasToday ? '打开今日日记' : '写今日日记', () => c.daily(), 'dh-date-number'); dateBtn.textContent = String(date.getDate());
  const status = rowButton(doc, () => c.daily(), `dh-daily-status${hasToday ? ' dh-done' : ''}`);
  status.append(icon(doc, hasToday ? 'check' : 'plus', 12), el(doc, 'span', '', hasToday ? '今日日记已写' : '写今日日记'));
  if (w.size === 's') {
    const head = el(doc, 'div', 'dh-calendar-header'); head.append(el(doc, 'span', 'dh-weekday', weekday(date)), el(doc, 'span', 'dh-month-label', `${date.getMonth() + 1}月`));
    body.append(head, dateBtn, monthGrid(doc, c, date, false)); return;
  }
  if (w.size === 'm') {
    const left = el(doc, 'div', 'dh-calendar-side'); left.append(el(doc, 'span', 'dh-weekday', weekday(date)), dateBtn, status);
    const right = el(doc, 'div', 'dh-calendar-month'); right.append(el(doc, 'span', 'dh-month-title', `${date.getMonth() + 1}月`), monthGrid(doc, c, date, true));
    body.append(left, right); return;
  }
  const head = el(doc, 'div', 'dh-calendar-header'); const title = el(doc, 'div', 'dh-calendar-title');
  title.append(el(doc, 'span', 'dh-month-title', `${date.getMonth() + 1}月`), el(doc, 'span', 'dh-year-label', String(date.getFullYear())));
  head.append(title, el(doc, 'span', 'dh-weekday', `${date.getDate()}日 ${weekday(date)}`)); body.append(head, monthGrid(doc, c, date, true), status);
}
function noteTile(doc: Document, path: string, glyph: IconName) {
  const tile = el(doc, 'span', 'dh-note-icon'); tile.dataset.tone = String(toneOf(folderOf(path) || path)); tile.append(icon(doc, glyph, 15)); return tile;
}
function renderRecent(body: HTMLElement, c: WidgetContext, w: Widget) {
  const { doc } = c;
  body.append(heading(doc, 'history', '最近笔记'));
  const notes = c.recent.slice(0, w.size === 's' ? 2 : 3);
  if (!notes.length) { const empty = el(doc, 'div', 'dh-widget-empty'); empty.append(el(doc, 'p', '', '还没有笔记。从今天的日记开始，想法会慢慢长出来。'), textButton(doc, '写今日日记', () => c.daily())); body.append(empty); return; }
  const list = el(doc, 'div', 'dh-note-list');
  for (const note of notes) {
    const row = rowButton(doc, () => c.open(note.path), 'dh-note-row');
    const text = el(doc, 'span', 'dh-note-text'); const folder = folderOf(note.path);
    text.append(el(doc, 'strong', '', note.title), el(doc, 'small', '', w.size === 's' ? relativeTime(note.modified) : [folder, note.excerpt].filter(Boolean).join(' · ') || '根目录'));
    row.append(noteTile(doc, note.path, 'note'), text);
    if (w.size !== 's') row.append(el(doc, 'time', '', note.modified ? relativeTime(note.modified) : ''));
    list.append(row);
  }
  body.append(list);
}
function renderPinned(body: HTMLElement, c: WidgetContext, w: Widget) {
  const { doc } = c;
  const add = button(doc, '管理固定笔记', c.choosePins, 'dh-icon-button dh-heading-action'); add.append(icon(doc, 'plus', 15));
  body.append(heading(doc, 'pin', '固定笔记', add));
  const paths = c.settings.pins.slice(0, w.size === 's' ? 2 : w.size === 'm' ? 4 : 6);
  if (!paths.length) {
    const empty = el(doc, 'div', 'dh-widget-empty'); empty.append(el(doc, 'p', '', '把常用笔记放在这里，一点就开'), textButton(doc, '选择笔记', c.choosePins)); body.append(empty); return;
  }
  const list = el(doc, 'div', w.size === 's' ? 'dh-pin-list' : 'dh-pin-grid');
  for (const path of paths) {
    const note = c.notes.get(path);
    const row = rowButton(doc, note ? () => c.open(path) : c.choosePins, 'dh-pinned-row');
    row.append(noteTile(doc, path, note ? 'book' : 'help'), el(doc, 'span', 'dh-pinned-title', note?.title ?? `${path.split('/').pop()}（已移除）`));
    list.append(row);
  }
  body.append(list);
}
function renderTasks(body: HTMLElement, c: WidgetContext, w: Widget) {
  const { doc } = c; const today = localDate();
  const count = el(doc, 'span', 'dh-task-count', c.tasks ? String(c.tasks.length) : '');
  body.append(heading(doc, 'tasks', '待办', count));
  const limit = w.size === 's' ? 3 : w.size === 'm' ? 3 : 9;
  const list = el(doc, 'div', 'dh-task-list'); body.append(list);
  if (!c.tasks) list.append(el(doc, 'p', 'dh-empty-copy', '正在读取待办…'));
  else if (!c.tasks.length) list.append(el(doc, 'p', 'dh-empty-copy', w.size === 's' ? '今天没有待办' : '今天没有待办，轻松一点。今日日记里的 - [ ] 和到期任务会出现在这里。'));
  for (const task of (c.tasks ?? []).slice(0, limit)) {
    const row = el(doc, 'div', 'dh-task-row');
    const check = button(doc, `完成：${task.text}`, () => { check.disabled = true; row.classList.add('dh-task-done'); window.setTimeout(() => c.completeTask(task), 450); }, 'dh-task-check');
    const mark = icon(doc, 'check', 11); mark.querySelectorAll('path, polyline').forEach(p => p.setAttribute('pathLength', '1'));
    check.append(el(doc, 'span', 'dh-task-ring'), mark);
    const open = rowButton(doc, () => c.open(task.path), 'dh-task-text'); open.append(el(doc, 'span', '', task.text));
    row.append(check, open);
    if (w.size !== 's') { const label = dueLabel(task.due, today); row.append(el(doc, 'small', label.overdue ? 'dh-task-due dh-overdue' : 'dh-task-due', label.text)); }
    list.append(row);
  }
  if ((c.tasks?.length ?? 0) > limit) list.append(el(doc, 'small', 'dh-task-more', `还有 ${(c.tasks?.length ?? 0) - limit} 项`));
  if (w.size !== 's' && c.canAddTask) {
    const form = el(doc, 'form', 'dh-task-form'); const input = el(doc, 'input', 'dh-task-input'); input.placeholder = '添加到今日日记…'; input.maxLength = 300;
    form.append(icon(doc, 'plus', 14), input);
    form.addEventListener('submit', e => { e.preventDefault(); const text = input.value.trim(); if (!text) return; input.value = ''; c.addTask(text); });
    body.append(form);
  }
}
function renderMemo(body: HTMLElement, c: WidgetContext) {
  const { doc } = c;
  const status = el(doc, 'small', 'dh-memo-status', '自动保存');
  body.append(heading(doc, 'memo', '便签', status));
  const area = el(doc, 'textarea', 'dh-memo-input'); area.placeholder = '随手记点什么…\n内容只保存在本插件配置中，不会生成笔记。'; area.value = c.settings.memo; area.maxLength = MEMO_LIMIT; area.spellcheck = false;
  area.addEventListener('input', () => { c.memo(area.value); status.textContent = '已保存'; });
  body.append(area);
}
/** 组件内容的指纹：只有影响显示的数据变化时才重建该组件，其余刷新直接跳过。 */
export function widgetKey(w: Widget, c: WidgetContext, day: string): string {
  switch (w.kind) {
    case 'clock': return JSON.stringify([w.size, day]);
    case 'memo': return w.size;
    case 'calendar': return JSON.stringify([w.size, day, [...c.dailyDays]]);
    case 'weather': return JSON.stringify([w.size, c.weather, c.weatherStatus, c.settings.city]);
    case 'tasks': return JSON.stringify([w.size, day, c.canAddTask, c.tasks?.map(t => [t.path, t.line, t.raw, t.due]) ?? null]);
    case 'recent': return JSON.stringify([w.size, Math.floor(Date.now() / 60_000), c.recent.slice(0, 3).map(n => [n.path, n.title, n.excerpt, n.modified])]);
    case 'pinned': return JSON.stringify([w.size, c.settings.pins.map(p => [p, c.notes.get(p)?.title ?? null])]);
  }
}
