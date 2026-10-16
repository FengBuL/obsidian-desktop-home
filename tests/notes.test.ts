import { describe, expect, it } from 'vitest';
import { searchNotes, recentNotes } from '../src/notes';
const notes = [
  { path: 'Work/Ideas.md', title: 'Ideas', modified: 20 },
  { path: 'Journal/Today.md', title: 'Today', modified: 40 },
  { path: 'Archive/Ideas for home.md', title: 'Ideas for home', modified: 10 },
];
describe('local note discovery', () => {
  it('ranks exact titles first, searches paths, and respects the result limit', () => {
    expect(searchNotes(notes, ' ideas ', 1).map(n => n.path)).toEqual(['Work/Ideas.md']);
    expect(searchNotes(notes, 'journal').map(n => n.title)).toEqual(['Today']);
    expect(searchNotes(notes, '不存在')).toEqual([]);
  });
  it('uses recent notes for an empty query and keeps the input untouched', () => {
    expect(searchNotes(notes, '').map(n => n.modified)).toEqual([40, 20, 10]);
    expect(recentNotes(notes, 2).map(n => n.modified)).toEqual([40, 20]);
    expect(notes[0].modified).toBe(20);
  });
});
import { hasExactNote, safeNoteName, simpleDateFormat, joinPath } from '../src/notes';
describe('search helpers', () => {
  const withAlias = [{ path: 'People/Ada.md', title: 'Ada Lovelace', modified: 1, aliases: ['Ada'] }, { path: 'x.md', title: 'Other', modified: 2 }];
  it('matches aliases as strongly as titles', () => {
    expect(searchNotes(withAlias, 'ada').map(n => n.path)).toEqual(['People/Ada.md']);
    expect(hasExactNote(withAlias, ' ADA ')).toBe(true);
    expect(hasExactNote(withAlias, 'new idea')).toBe(false);
  });
  it('builds safe note names and daily paths', () => {
    expect(safeNoteName(' a/b: c?#[x] ')).toBe('a b c x');
    expect(simpleDateFormat(new Date(2026, 0, 5), 'YYYY/MM/YYYY-MM-DD · M-D')).toBe('2026/01/2026-01-05 · 1-5');
    expect(joinPath('/日记/', '2026-01-05')).toBe('日记/2026-01-05.md');
    expect(joinPath('', 'x')).toBe('x.md');
  });
});
