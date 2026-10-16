export interface Note { path: string; title: string; modified: number; excerpt?: string; aliases?: string[] }
export function recentNotes(notes: Note[], limit = 8): Note[] { return [...notes].sort((a, b) => b.modified - a.modified).slice(0, limit); }
/** 标题、别名与路径的本地搜索：完全匹配 > 前缀 > 包含 > 仅路径匹配，同级按修改时间。 */
export function searchNotes(notes: Note[], query: string, limit = 12): Note[] {
  const q = query.trim().toLocaleLowerCase(); if (!q) return recentNotes(notes, limit);
  const score = (n: Note) => {
    const names = [n.title, ...(n.aliases ?? [])].map(x => x.toLocaleLowerCase());
    return names.includes(q) ? 0 : names.some(x => x.startsWith(q)) ? 1 : names.some(x => x.includes(q)) ? 2 : 3;
  };
  return notes.map(n => ({ n, s: score(n) })).filter(({ n, s }) => s < 3 || n.path.toLocaleLowerCase().includes(q))
    .sort((a, b) => a.s - b.s || b.n.modified - a.n.modified).slice(0, limit).map(({ n }) => n);
}
/** 是否已有标题或别名与查询完全一致的笔记（决定是否提示「新建笔记」）。 */
export function hasExactNote(notes: Note[], query: string): boolean {
  const q = query.trim().toLocaleLowerCase(); return !q || notes.some(n => [n.title, ...(n.aliases ?? [])].some(x => x.toLocaleLowerCase() === q));
}
/** 新建笔记时使用的安全文件名：去掉 Obsidian 不允许的字符。 */
export function safeNoteName(title: string): string { return title.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120); }
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
/** 只支持常用的 YYYY / MM / DD / M / D 记号，用于浏览器预览与测试；插件内使用 moment 完整格式。 */
export function simpleDateFormat(date: Date, format: string): string {
  return format.replace(/YYYY|MM|DD|M|D/g, token => token === 'YYYY' ? String(date.getFullYear()) : token === 'MM' ? String(date.getMonth() + 1).padStart(2, '0')
    : token === 'DD' ? String(date.getDate()).padStart(2, '0') : token === 'M' ? String(date.getMonth() + 1) : String(date.getDate()));
}
export function joinPath(folder: string, name: string): string { const f = folder.trim().replace(/^\/+|\/+$/g, ''); return `${f ? `${f}/` : ''}${name}.md`; }
/** 相对时间：刚刚 / N 分钟前 / N 小时前 / 昨天 / N 天前 / M月D日。 */
export function relativeTime(time: number, now = Date.now()): string {
  const diff = now - time; const minute = 60_000; const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (diff < minute) return '刚刚';
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`;
  if (time >= startOfToday) return `${Math.floor(diff / (60 * minute))} 小时前`;
  const days = Math.ceil((startOfToday - time) / 86_400_000);
  if (days <= 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  const d = new Date(time); return `${d.getMonth() + 1}月${d.getDate()}日`;
}
/** 按路径稳定地分配 0-5 的色调，用于笔记图标底色。 */
export function toneOf(path: string): number { let h = 0; for (const ch of path) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 6; }
/** 所在文件夹名，根目录返回空字符串。 */
export function folderOf(path: string): string { const i = path.lastIndexOf('/'); return i < 0 ? '' : path.slice(0, i).split('/').pop() ?? ''; }
