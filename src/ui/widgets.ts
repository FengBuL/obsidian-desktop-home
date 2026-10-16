import type { Settings, WeatherSnapshot, Widget } from '../model';
import type { Note } from '../notes';
import { weatherDescription } from '../weather';
import { el, button, textButton } from './dom';
import { icon, weatherIcon } from './icons';

export interface WidgetContext {
  doc: Document; settings: Settings; notes: Note[]; recent: Note[];
  weather: WeatherSnapshot | null; weatherStatus: string;
  open: (path: string) => void; pin: (path: string) => void;
  choosePins: () => void; chooseCity: () => void; refreshWeather: () => void; daily: () => void;
}
export function renderWidget(w: Widget, c: WidgetContext): HTMLElement {
  const { doc } = c; const body = el(doc, 'div', `dh-widget-body dh-${w.kind}-body`);
  if (w.kind === 'clock') renderClock(body, c);
  else if (w.kind === 'weather') renderWeather(body, c, w);
  else if (w.kind === 'calendar') renderCalendar(body, c);
  else if (w.kind === 'recent') renderRecent(body, c, w);
  else renderPinned(body, c, w);
  return body;
}
function renderClock(body: HTMLElement, { doc }: WidgetContext) {
  const face = el(doc, 'div', 'dh-clock-face'); face.setAttribute('aria-label', '模拟时钟');
  for (let i = 0; i < 60; i++) { const tick = el(doc, 'i', i % 5 === 0 ? 'dh-tick dh-major-tick' : 'dh-tick'); tick.style.setProperty('--angle', `${i * 6}deg`); face.append(tick); }
  for (const n of [12, 3, 6, 9]) { const number = el(doc, 'span', `dh-clock-number dh-number-${n}`, String(n)); face.append(number); }
  face.append(el(doc, 'div', 'dh-hand dh-hour-hand'), el(doc, 'div', 'dh-hand dh-minute-hand'), el(doc, 'div', 'dh-hand dh-second-hand'), el(doc, 'i', 'dh-clock-pivot'));
  body.append(face, el(doc, 'span', 'dh-clock-caption', '此时此刻')); updateClock(body, new Date());
}
export function updateClock(root: HTMLElement, date: Date) {
  const angles: Record<string, number> = { hour: (date.getHours() % 12) * 30 + date.getMinutes() / 2, minute: date.getMinutes() * 6 + date.getSeconds() / 10, second: date.getSeconds() * 6 };
  for (const [name, angle] of Object.entries(angles)) root.querySelectorAll<HTMLElement>(`.dh-${name}-hand`).forEach(hand => hand.style.transform = `translateX(-50%) rotate(${angle}deg)`);
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
  const values = el(doc, 'div'); values.append(el(doc, 'strong', 'dh-temperature', `${data.temperature}°`), el(doc, 'div', 'dh-condition', weatherDescription(data.code)));
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
function renderCalendar(body: HTMLElement, c: WidgetContext) {
  const { doc } = c; const date = new Date();
  const heading = el(doc, 'div', 'dh-calendar-header'); heading.append(el(doc, 'span', 'dh-weekday', date.toLocaleDateString('zh-CN', { weekday: 'long' })), el(doc, 'span', 'dh-month-label', `${date.getMonth() + 1}月`));
  body.append(heading);
  const dateBtn = button(doc, '打开今日日记', c.daily, 'dh-date-number'); dateBtn.textContent = String(date.getDate()); body.append(dateBtn);
  const calendar = el(doc, 'div', 'dh-month-grid');
  for (const day of ['一', '二', '三', '四', '五', '六', '日']) calendar.append(el(doc, 'span', 'dh-week-label', day));
  const start = (new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) % 7;
  for (let i = 0; i < start; i++) calendar.append(el(doc, 'span'));
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  for (let n = 1; n <= count; n++) calendar.append(el(doc, 'span', n === date.getDate() ? 'dh-today' : '', String(n)));
  body.append(calendar);
}
function renderRecent(body: HTMLElement, c: WidgetContext, w: Widget) {
  const { doc } = c;
  const heading = el(doc, 'div', 'dh-widget-heading'); heading.append(el(doc, 'h2', '', '最近笔记'), icon(doc, 'clock', 16)); body.append(heading);
  const count = w.size === 's' ? 2 : 3;
  const notes = c.recent.slice(0, count);
  if (!notes.length) { body.append(el(doc, 'p', 'dh-empty-copy', '从一篇笔记开始，让想法慢慢生长。'), textButton(doc, '写今日日记', c.daily)); return; }
  const list = el(doc, 'div', 'dh-note-list');
  for (const note of notes) {
    const row = button(doc, `打开 ${note.title}`, () => c.open(note.path), 'dh-note-row');
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
    const empty = el(doc, 'div', 'dh-pins-empty'); empty.append(icon(doc, 'book', 32), el(doc, 'p', '', '给常用笔记留个位置'), textButton(doc, '选择笔记', c.choosePins)); body.append(empty); return;
  }
  for (const path of paths) {
    const note = c.notes.find(n => n.path === path);
    const row = button(doc, note ? `打开 ${note.title}` : `管理已失效的固定笔记 ${path}`, note ? () => c.open(path) : c.choosePins, 'dh-pinned-row');
    row.append(icon(doc, note ? 'book' : 'help', 21), el(doc, 'span', '', note?.title ?? `${path.split('/').pop()}（已移除）`), icon(doc, 'arrow', 16)); body.append(row);
  }
}
