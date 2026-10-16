import { MEMO_LIMIT, type Settings, type WeatherSnapshot, type Widget } from '../model';
import { localDate, type Note } from '../notes';
import { dueLabel, type TaskItem } from '../tasks';
import { weatherDescription } from '../weather';
import { el, button, textButton, rowButton, setVars } from './dom';
import { icon, weatherIcon } from './icons';

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
  if (w.kind === 'clock') renderClock(body, c);
  else if (w.kind === 'weather') renderWeather(body, c, w);
  else if (w.kind === 'calendar') renderCalendar(body, c, w);
  else if (w.kind === 'recent') renderRecent(body, c, w);
  else if (w.kind === 'tasks') renderTasks(body, c, w);
  else if (w.kind === 'memo') renderMemo(body, c);
  else renderPinned(body, c, w);
  return body;
}
function renderClock(body: HTMLElement, { doc }: WidgetContext) {
  const face = el(doc, 'div', 'dh-clock-face'); face.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 60; i++) { const tick = el(doc, 'i', i % 5 === 0 ? 'dh-tick dh-major-tick' : 'dh-tick'); setVars(tick, { '--angle': `${i * 6}deg` }); face.append(tick); }
  for (const n of [12, 3, 6, 9]) face.append(el(doc, 'span', `dh-clock-number dh-number-${n}`, String(n)));
  face.append(el(doc, 'div', 'dh-hand dh-hour-hand'), el(doc, 'div', 'dh-hand dh-minute-hand'), el(doc, 'div', 'dh-hand dh-second-hand'), el(doc, 'i', 'dh-clock-pivot'));
  body.append(face, el(doc, 'span', 'dh-clock-caption', '此时此刻')); updateClock(body, new Date());
}
/** 指针角度写入 CSS 变量，样式表负责旋转。 */
export function updateClock(root: HTMLElement, date: Date) {
  const faces = root.querySelectorAll<HTMLElement>('.dh-clock-face'); if (!faces.length) return;
  const props = { '--dh-hour': `${(date.getHours() % 12) * 30 + date.getMinutes() / 2}deg`, '--dh-minute': `${date.getMinutes() * 6 + date.getSeconds() / 10}deg`, '--dh-second': `${date.getSeconds() * 6}deg` };
  faces.forEach(face => setVars(face, props));
}
function renderWeather(body: HTMLElement, c: WidgetContext, w: Widget) {
  const { doc, weather: data, settings } = c;
  const top = el(doc, 'div', 'dh-widget-heading');
  const city = button(doc, settings.city ? '更换天气城市' : '选择天气城市', c.chooseCity, 'dh-city-button');
  city.append(icon(doc, 'location', 14), el(doc, 'span', '', settings.city?.name ?? '你的城市'));
  top.append(city);
  if (settings.city) { const refresh = button(doc, '刷新天气', c.refreshWeather); refresh.append(icon(doc, 'refresh', 15)); top.append(refresh); }
  body.append(top);
  if (!data) {
    const center = el(doc, 'div', 'dh-weather-empty'); center.append(icon(doc, 'partly', 48));
    center.append(el(doc, 'strong', '', settings.city ? '正在等待天气' : '把天气带到桌面'));
    center.append(textButton(doc, settings.city ? '重新获取' : '选择城市', settings.city ? c.refreshWeather : c.chooseCity, 'dh-weather-setup'));
    body.append(center, el(doc, 'small', 'dh-weather-status', c.weatherStatus || (settings.city ? '天气尚未更新，请重新获取' : '选择城市后启用 · 无需定位'))); return;
  }
  const current = el(doc, 'div', 'dh-weather-current');
  const values = el(doc, 'div'); values.append(el(doc, 'strong', 'dh-temperature', `${data.temperature}°`), el(doc, 'div', 'dh-condition', `${weatherDescription(data.code)} · ${Math.round(data.days[0].high)}° / ${Math.round(data.days[0].low)}°`));
  current.append(values, icon(doc, weatherIcon(data.code), 50)); body.append(current);
  if (w.size !== 's') {
    const forecast = el(doc, 'div', 'dh-forecast');
    for (const [i, day] of data.days.entries()) {
      const entry = el(doc, 'div', 'dh-forecast-day');
      entry.append(el(doc, 'span', '', i === 0 ? '今天' : new Date(`${day.date}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' })), icon(doc, weatherIcon(day.code), 20), el(doc, 'span', '', `${Math.round(day.high)}°`));
      if (w.size === 'l') entry.append(el(doc, 'small', '', `${Math.round(day.low)}°`));
      forecast.append(entry);
    }
    body.append(forecast);
  }
  const foot = el(doc, 'div', 'dh-weather-foot');
  const credit = el(doc, 'a', '', 'Open-Meteo'); credit.href = 'https://open-meteo.com/'; credit.target = '_blank'; credit.rel = 'noopener noreferrer';
  foot.append(el(doc, 'small', '', c.weatherStatus || `${new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新`), credit); body.append(foot);
}
function renderCalendar(body: HTMLElement, c: WidgetContext, w: Widget) {
  const { doc } = c; const date = new Date();
  const heading = el(doc, 'div', 'dh-calendar-header'); heading.append(el(doc, 'span', 'dh-weekday', date.toLocaleDateString('zh-CN', { weekday: 'long' })), el(doc, 'span', 'dh-month-label', `${date.getMonth() + 1}月`));
  body.append(heading);
  const dateBtn = button(doc, c.dailyDays.has(date.getDate()) ? '打开今日日记' : '写今日日记', () => c.daily(), 'dh-date-number'); dateBtn.textContent = String(date.getDate()); body.append(dateBtn);
  const calendar = el(doc, 'div', 'dh-month-grid');
  for (const day of ['一', '二', '三', '四', '五', '六', '日']) calendar.append(el(doc, 'span', 'dh-week-label', day));
  const start = (new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) % 7;
  for (let i = 0; i < start; i++) calendar.append(el(doc, 'span'));
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  for (let n = 1; n <= count; n++) {
    const cls = [n === date.getDate() ? 'dh-today' : '', c.dailyDays.has(n) ? 'dh-has-daily' : ''].filter(Boolean).join(' ');
    // 中、大尺寸可以点日期打开那天的日记；小尺寸格子太小，只显示标记。
    if (w.size === 's') { calendar.append(el(doc, 'span', cls, String(n))); continue; }
    const day = button(doc, `${date.getMonth() + 1}月${n}日${c.dailyDays.has(n) ? '的日记' : ' · 新建日记'}`, () => c.daily(new Date(date.getFullYear(), date.getMonth(), n)), `dh-day ${cls}`.trim());
    day.textContent = String(n); calendar.append(day);
  }
  body.append(calendar);
}
function renderRecent(body: HTMLElement, c: WidgetContext, w: Widget) {
  const { doc } = c;
  const heading = el(doc, 'div', 'dh-widget-heading'); heading.append(el(doc, 'h2', '', '最近笔记'), icon(doc, 'clock', 16)); body.append(heading);
  const notes = c.recent.slice(0, w.size === 's' ? 2 : 3);
  if (!notes.length) { body.append(el(doc, 'p', 'dh-empty-copy', '还没有笔记。从今天的日记开始，想法会慢慢长出来。'), textButton(doc, '写今日日记', () => c.daily())); return; }
  const list = el(doc, 'div', 'dh-note-list');
  for (const note of notes) {
    const row = rowButton(doc, () => c.open(note.path), 'dh-note-row');
    const mark = el(doc, 'span', 'dh-note-icon'); mark.append(icon(doc, 'note', 19));
    const text = el(doc, 'span', 'dh-note-text'); text.append(el(doc, 'strong', '', note.title), el(doc, 'small', '', note.excerpt || note.path));
    row.append(mark, text);
    if (w.size !== 's') row.append(el(doc, 'time', '', note.modified ? new Date(note.modified).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : ''));
    list.append(row);
  }
  body.append(list);
}
function renderPinned(body: HTMLElement, c: WidgetContext, w: Widget) {
  const { doc } = c;
  const heading = el(doc, 'div', 'dh-widget-heading'); const title = el(doc, 'h2'); title.append(icon(doc, 'pin', 15), doc.createTextNode('固定笔记'));
  const add = button(doc, '管理固定笔记', c.choosePins); add.append(icon(doc, 'plus', 16)); heading.append(title, add); body.append(heading);
  const paths = c.settings.pins.slice(0, w.size === 's' ? 2 : w.size === 'm' ? 3 : 5);
  if (!paths.length) {
    const empty = el(doc, 'div', 'dh-pins-empty'); empty.append(icon(doc, 'book', 32), el(doc, 'p', '', '把常用笔记放在这里，一点就开'), textButton(doc, '选择笔记', c.choosePins)); body.append(empty); return;
  }
  for (const path of paths) {
    const note = c.notes.get(path);
    const row = rowButton(doc, note ? () => c.open(path) : c.choosePins, 'dh-pinned-row');
    row.append(icon(doc, note ? 'book' : 'help', 21), el(doc, 'span', '', note?.title ?? `${path.split('/').pop()}（已移除）`), icon(doc, 'arrow', 16)); body.append(row);
  }
}
function renderTasks(body: HTMLElement, c: WidgetContext, w: Widget) {
  const { doc } = c; const today = localDate();
  const heading = el(doc, 'div', 'dh-widget-heading'); const title = el(doc, 'h2'); title.append(icon(doc, 'tasks', 15), doc.createTextNode('待办'));
  const count = el(doc, 'span', 'dh-task-count', c.tasks ? String(c.tasks.length) : ''); heading.append(title, count); body.append(heading);
  const limit = w.size === 's' ? 2 : w.size === 'm' ? 3 : 9;
  const list = el(doc, 'div', 'dh-task-list'); body.append(list);
  if (!c.tasks) list.append(el(doc, 'p', 'dh-empty-copy', '正在读取待办…'));
  else if (!c.tasks.length) list.append(el(doc, 'p', 'dh-empty-copy', w.size === 's' ? '今天没有待办' : '今天没有待办，轻松一点。今日日记里的 - [ ] 和到期任务会出现在这里。'));
  for (const task of (c.tasks ?? []).slice(0, limit)) {
    const row = el(doc, 'div', 'dh-task-row');
    const check = button(doc, `完成：${task.text}`, () => { check.disabled = true; row.classList.add('dh-task-done'); c.completeTask(task); }, 'dh-task-check');
    check.append(icon(doc, 'circle', 17), icon(doc, 'check', 12));
    const open = rowButton(doc, () => c.open(task.path), 'dh-task-text'); open.append(el(doc, 'span', '', task.text));
    const label = dueLabel(task.due, today); const due = el(doc, 'small', label.overdue ? 'dh-task-due dh-overdue' : 'dh-task-due', label.text);
    row.append(check, open, due); list.append(row);
  }
  if ((c.tasks?.length ?? 0) > limit) list.append(el(doc, 'small', 'dh-task-more', `还有 ${(c.tasks?.length ?? 0) - limit} 项`));
  if (w.size !== 's' && c.canAddTask) {
    const form = el(doc, 'form', 'dh-task-form'); const input = el(doc, 'input', 'dh-task-input'); input.placeholder = '添加到今日日记…'; input.maxLength = 300;
    form.append(icon(doc, 'plus', 15), input);
    form.addEventListener('submit', e => { e.preventDefault(); const text = input.value.trim(); if (!text) return; input.value = ''; c.addTask(text); });
    body.append(form);
  }
}
function renderMemo(body: HTMLElement, c: WidgetContext) {
  const { doc } = c;
  const heading = el(doc, 'div', 'dh-widget-heading'); const title = el(doc, 'h2'); title.append(icon(doc, 'memo', 15), doc.createTextNode('便签')); heading.append(title);
  const status = el(doc, 'small', 'dh-memo-status', '自动保存'); heading.append(status); body.append(heading);
  const area = el(doc, 'textarea', 'dh-memo-input'); area.placeholder = '随手记点什么…\n内容只保存在本插件配置中，不会生成笔记。'; area.value = c.settings.memo; area.maxLength = MEMO_LIMIT; area.spellcheck = false;
  area.addEventListener('input', () => { c.memo(area.value); status.textContent = '已保存'; });
  body.append(area);
}
/** 组件内容的指纹：只有影响显示的数据变化时才重建该组件，其余刷新直接跳过。 */
export function widgetKey(w: Widget, c: WidgetContext, day: string): string {
  switch (w.kind) {
    case 'clock': return 'clock';
    case 'memo': return w.size;
    case 'calendar': return JSON.stringify([w.size, day, [...c.dailyDays]]);
    case 'weather': return JSON.stringify([w.size, c.weather, c.weatherStatus, c.settings.city]);
    case 'tasks': return JSON.stringify([w.size, day, c.canAddTask, c.tasks?.map(t => [t.path, t.line, t.raw, t.due]) ?? null]);
    case 'recent': return JSON.stringify([w.size, c.recent.slice(0, 3).map(n => [n.path, n.title, n.excerpt, n.modified])]);
    case 'pinned': return JSON.stringify([w.size, c.settings.pins.map(p => [p, c.notes.get(p)?.title ?? null])]);
  }
}
