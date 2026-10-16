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
