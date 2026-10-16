import './obsidian-dom';
import { Desktop } from '../src/ui/desktop';
import { defaultSettings, normalizeSettings } from '../src/model';
import { localDate, recentNotes, safeNoteName, type Note } from '../src/notes';
import { completeTaskLine, parseTasks, selectTasks, appendTask, type TaskItem } from '../src/tasks';
import alpineWallpaper from '../assets/alpine.webp';
import type { DesktopHost } from '../src/host';
import { el, button } from '../src/ui/dom';
import { icon } from '../src/ui/icons';
import '../src/home.css';
import './preview.css';

const doc = document; const app = doc.querySelector<HTMLElement>('#app')!;
// ?shot=1 用于生成对外截图：去掉预览标注；?mobile=1 模拟 Obsidian 手机端。
const params = new URLSearchParams(location.search); const shot = params.has('shot'); const mobile = params.has('mobile');
if (mobile) { doc.body.classList.add('is-mobile'); doc.body.style.setProperty('--mobile-navbar-height', '0px'); }
const scheme = matchMedia('(prefers-color-scheme: dark)');
const applyScheme = () => { doc.body.classList.toggle('theme-dark', scheme.matches); doc.body.classList.toggle('theme-light', !scheme.matches); };
applyScheme(); scheme.addEventListener('change', applyScheme);
if (shot) doc.body.classList.add('preview-shot');
const chrome = el(doc, 'div', 'preview-chrome');
const traffic = el(doc, 'div', 'preview-traffic'); for (let i = 0; i < 3; i++) traffic.append(el(doc, 'i'));
const tab = el(doc, 'div', 'preview-tab'); tab.append(icon(doc, 'home', 15), doc.createTextNode('我的桌面'), icon(doc, 'close', 13));
chrome.append(traffic, tab, el(doc, 'span', 'preview-caption', 'Desktop Home / Obsidian 插件预览')); app.append(chrome);
const shell = el(doc, 'div', 'preview-shell'); const ribbon = el(doc, 'aside', 'preview-ribbon');
const gem = el(doc, 'div', 'preview-gem', '◆'); ribbon.append(gem);
const root = el(doc, 'div');
for (const [name, label] of [['home', '桌面'], ['note', '在桌面中搜索笔记'], ['book', '打开日记入口说明']] as const) {
  const b = button(doc, label, () => { if (name === 'home') root.focus(); else if (name === 'note') root.querySelector<HTMLInputElement>('.dh-search-input')?.focus(); else notify('底部「今日日记」按钮可创建预览日记。'); }); b.append(icon(doc, name, 19)); ribbon.append(b);
}
const bottom = el(doc, 'span', 'preview-ribbon-bottom'); bottom.append(icon(doc, 'moon', 17)); ribbon.append(bottom); shell.append(ribbon, root); app.append(shell);
const now = Date.now(); const notes: Note[] = [
  { path: '随想/那些值得留下的想法.md', title: '那些值得留下的想法', modified: now - 30 * 60_000, excerpt: '关于创造、习惯，以及更从容的生活。' },
  { path: '阅读/周末阅读清单.md', title: '周末阅读清单', modified: now - 24 * 3600_000, excerpt: '一些书、文章，和想要慢慢探索的话题。' },
  { path: '项目/下一个小计划.md', title: '下一个小计划', modified: now - 2 * 24 * 3600_000, excerpt: '把零散的灵感，变成一件具体的小事。' },
  { path: '日记/今天.md', title: '今日日记', modified: now - 3 * 24 * 3600_000, excerpt: '记下此刻，留给以后的自己。' },
  { path: '阅读/我的书架.md', title: '我的书架', modified: now - 4 * 24 * 3600_000, excerpt: '最近想读和正在读的书。' },
];
const today = localDate();
const contents = new Map<string, string>([
  ['项目/下一个小计划.md', `- [ ] 整理灵感清单 📅 ${today}\n- [ ] 给朋友回信 📅 ${localDate(new Date(now - 2 * 24 * 3600_000))}\n- [ ] 以后再说的事\n`],
  [`日记/${today}.md`, `# ${today}\n\n- [ ] 傍晚散步三十分钟\n- [ ] 读完《小王子》第三章\n`],
]);
const dailyPath = (d: Date) => `日记/${localDate(d)}.md`;
const dailySeed = [1, 3, 4, 7, 8, 9, 12, 14, 15].map(n => localDate(new Date(new Date().getFullYear(), new Date().getMonth(), n)));
for (const d of dailySeed) if (!notes.some(n => n.path === `日记/${d}.md`) && d <= today) notes.push({ path: `日记/${d}.md`, title: `${d} 日记`, modified: now - 6 * 24 * 3600_000 });
if (!notes.some(n => n.path === `日记/${today}.md`)) notes.push({ path: `日记/${today}.md`, title: `${today} 日记`, modified: now - 40 * 60_000 });
const subscriptions = new Set<() => void>();
let stored: unknown = null; if (!shot) try { stored = JSON.parse(localStorage.getItem('desktop-home-preview-v1') ?? 'null'); } catch { stored = null; }
const showcase = (): ReturnType<typeof defaultSettings> => {
  const s = { ...defaultSettings(), pins: ['日记/今天.md', '阅读/我的书架.md'], memo: '周六上午去花市买一盆薄荷\n把书架上没读完的书挑一本带走' };
  s.widgets = [...s.widgets, { id: 'tasks', kind: 'tasks', size: 'm' }, { id: 'memo', kind: 'memo', size: 'm' }]; return s;
};
const settings = stored ? normalizeSettings(stored) : showcase();
const themeParam = params.get('theme'); if (themeParam) settings.theme = normalizeSettings({ theme: themeParam }).theme;
if (shot) { settings.city = { name: '东京', latitude: 35.68, longitude: 139.69, region: '东京都 · 日本' }; }
function notify(message: string) {
  const toast = el(doc, 'div', 'preview-toast', message); toast.setAttribute('role', 'status'); app.append(toast); setTimeout(() => toast.remove(), 3600);
}
async function openPreview(path: string) {
  const note = notes.find(n => n.path === path); if (!note) throw new Error('missing');
  const overlay = el(doc, 'div', 'preview-note-overlay'); const panel = el(doc, 'article', 'preview-note'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', note.title); panel.tabIndex = -1;
  const close = button(doc, '关闭示例笔记', () => overlay.remove()); close.append(icon(doc, 'close', 20)); panel.append(close, el(doc, 'small', '', '预览示例笔记 · 保存在本次页面内存中'), el(doc, 'h1', '', note.title), el(doc, 'p', '', note.excerpt ?? '今天，有什么想记下的？'), el(doc, 'p', '', '安装插件后，这里会在 Obsidian 标签页中打开你自己的 Markdown 笔记。'));
  overlay.append(panel); app.append(overlay); overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); }); panel.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.remove(); }); close.focus();
}
const host: DesktopHost = {
  preview: !shot, mobile, wallpaperUrl: alpineWallpaper,
  getNotes: () => notes, getRecent: () => recentNotes(notes), openNote: openPreview,
  openDaily: async (date = new Date()) => {
    const path = dailyPath(date);
    if (!notes.some(n => n.path === path)) { notes.unshift({ path, title: `${localDate(date)} 日记`, modified: Date.now(), excerpt: '今天，有什么想记下的？' }); subscriptions.forEach(fn => fn()); }
    await openPreview(path);
  },
  dailyDays: (year, month) => new Set(notes.map(n => /^日记\/(\d{4})-(\d{2})-(\d{2})\.md$/.exec(n.path)).filter((m): m is RegExpExecArray => !!m && Number(m[1]) === year && Number(m[2]) === month + 1).map(m => Number(m[3]))),
  createNote: async title => {
    const name = safeNoteName(title); const path = `${name}.md`;
    if (!notes.some(n => n.path === path)) { notes.unshift({ path, title: name, modified: Date.now(), excerpt: '新建的预览笔记' }); subscriptions.forEach(fn => fn()); }
    await openPreview(path);
  },
  getTasks: async () => selectTasks([...contents].flatMap(([path, text]) => parseTasks(text, path)), today, dailyPath(new Date())),
  completeTask: async (task: TaskItem) => {
    const lines = (contents.get(task.path) ?? '').split('\n'); const next = completeTaskLine(lines[task.line] ?? '', task.raw, today);
    if (next === null) return false; lines[task.line] = next; contents.set(task.path, lines.join('\n')); return true;
  },
  addTask: async text => { const path = dailyPath(new Date()); contents.set(path, appendTask(contents.get(path) ?? '', text)); },
  save: async s => { localStorage.setItem('desktop-home-preview-v1', JSON.stringify(s)); },
  getJson: async url => {
    if (shot) {
      const day = (offset: number) => localDate(new Date(now + offset * 86_400_000));
      return url.includes('geocoding') ? { results: [] } : { current: { temperature_2m: 19.6, weather_code: 1 }, daily: { time: [0, 1, 2, 3, 4].map(day), temperature_2m_max: [22, 21, 19, 23, 24], temperature_2m_min: [15, 14, 13, 15, 16], weather_code: [1, 3, 61, 0, 2] } };
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) }); if (!response.ok) throw new Error('network'); return response.json(); },
  notify, subscribe: fn => { subscriptions.add(fn); return () => subscriptions.delete(fn); },
};
const desktop = new Desktop(root, host, settings); desktop.mount();
if (import.meta.hot) import.meta.hot.dispose(() => desktop.destroy());
