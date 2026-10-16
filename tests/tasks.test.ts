import { describe, expect, it } from 'vitest';
import { appendTask, completeTaskLine, dueLabel, parseTasks, selectTasks } from '../src/tasks';
describe('tasks widget logic', () => {
  const text = '- [ ] write 📅 2026-10-15\n  * [ ] nested [due:: 2026-10-16]\n- [x] done\n- [ ] undated\r\n1. [ ] numbered\n- [ ]   \n';
  it('parses open tasks with Tasks/Dataview due dates and skips done or empty ones', () => {
    const tasks = parseTasks(text, 'a.md');
    expect(tasks.map(t => [t.text, t.due, t.line])).toEqual([['write', '2026-10-15', 0], ['nested', '2026-10-16', 1], ['undated', null, 3], ['numbered', null, 4]]);
  });
  it('keeps overdue/today tasks plus undated tasks in today\'s daily note, sorted by date', () => {
    const tasks = [...parseTasks(text, 'a.md'), ...parseTasks('- [ ] daily item\n- [ ] later 📅 2099-01-01', '日记/2026-10-16.md')];
    expect(selectTasks(tasks, '2026-10-16', '日记/2026-10-16.md').map(t => t.text)).toEqual(['write', 'nested', 'daily item']);
  });
  it('labels due dates in plain Chinese', () => {
    expect(dueLabel('2026-10-16', '2026-10-16')).toEqual({ text: '今天', overdue: false });
    expect(dueLabel('2026-10-13', '2026-10-16')).toEqual({ text: '逾期 3 天', overdue: true });
    expect(dueLabel(null, '2026-10-16').text).toBe('日记');
  });
  it('completes only the unchanged line and appends new tasks on their own line', () => {
    expect(completeTaskLine('- [ ] write 📅 2026-10-15', '- [ ] write 📅 2026-10-15', '2026-10-16')).toBe('- [x] write 📅 2026-10-15 ✅ 2026-10-16');
    expect(completeTaskLine('- [ ] changed', '- [ ] write', '2026-10-16')).toBeNull();
    expect(appendTask('# Day', ' a  b ')).toBe('# Day\n- [ ] a b\n');
    expect(appendTask('', 'x')).toBe('- [ ] x\n');
  });
});
