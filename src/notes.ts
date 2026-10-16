export interface Note { path: string; title: string; modified: number; excerpt?: string }
export function recentNotes(notes: Note[], limit = 8): Note[] { return [...notes].sort((a, b) => b.modified - a.modified).slice(0, limit); }
export function searchNotes(notes: Note[], query: string, limit = 12): Note[] {
  const q = query.trim().toLocaleLowerCase(); if (!q) return recentNotes(notes, limit);
  const score = (n: Note) => n.title.toLocaleLowerCase() === q ? 0 : n.title.toLocaleLowerCase().startsWith(q) ? 1 : n.title.toLocaleLowerCase().includes(q) ? 2 : 3;
  return notes.filter(n => `${n.title}\n${n.path}`.toLocaleLowerCase().includes(q)).sort((a, b) => score(a) - score(b) || b.modified - a.modified).slice(0, limit);
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
