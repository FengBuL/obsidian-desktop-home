import { localDate } from './notes';
export interface TaskItem { path: string; line: number; raw: string; text: string; due: string | null }
const TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)( )(\]\s+)(.*)$/;
const DUE_RE = /(?:📅\s*|\[due::\s*)(\d{4}-\d{2}-\d{2})\]?/u;
/** 解析未完成任务（- [ ]），识别 Tasks 插件的 📅 日期和 Dataview 的 [due:: 日期]。 */
export function parseTasks(content: string, path: string): TaskItem[] {
  const out: TaskItem[] = [];
  content.split('\n').forEach((line, index) => {
    const raw = line.replace(/\r$/, ''); const m = TASK_RE.exec(raw); if (!m) return;
    const due = DUE_RE.exec(m[4])?.[1] ?? null;
    const text = m[4].replace(/\[due::[^\]]*\]/g, '').replace(/📅\s*\d{4}-\d{2}-\d{2}/gu, '').replace(/[⏳🛫➕✅]\s*\d{4}-\d{2}-\d{2}/gu, '').replace(/\s+/g, ' ').trim();
    if (text) out.push({ path, line: index, raw, text, due });
  });
  return out;
}
/** 今天要看的：已到期或逾期的任务，加上今日日记里没有日期的任务；按日期排序。 */
export function selectTasks(tasks: TaskItem[], today: string, dailyPath: string, limit = 30): TaskItem[] {
  return tasks.filter(t => t.due ? t.due <= today : t.path === dailyPath)
    .sort((a, b) => (a.due ?? today).localeCompare(b.due ?? today) || a.path.localeCompare(b.path) || a.line - b.line).slice(0, limit);
}
export function dueLabel(due: string | null, today: string): { text: string; overdue: boolean } {
  if (!due) return { text: '日记', overdue: false };
  if (due === today) return { text: '今天', overdue: false };
  const days = Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000);
  return { text: `逾期 ${days} 天`, overdue: true };
}
/** 勾选任务。行内容已经变化时返回 null，避免改错行。 */
export function completeTaskLine(line: string, expectedRaw: string, today = localDate()): string | null {
  if (line.replace(/\r$/, '') !== expectedRaw) return null;
  const m = TASK_RE.exec(expectedRaw); if (!m) return null;
  const done = `${m[1]}x${m[3]}${m[4]}`;
  return /📅/u.test(m[4]) ? `${done} ✅ ${today}` : done;
}
export function newTaskLine(text: string): string { return `- [ ] ${text.replace(/\s+/g, ' ').trim()}`; }
/** 把新任务追加到文本末尾，保证换行。 */
export function appendTask(content: string, text: string): string { return `${content && !content.endsWith('\n') ? `${content}\n` : content}${newTaskLine(text)}\n`; }
