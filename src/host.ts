import type { Note } from './notes';
import type { Settings } from './model';
export interface VaultRename { oldPath: string; newPath: string }
export interface DesktopHost {
  preview: boolean;
  wallpaperUrl: string;
  getNotes(): Note[];
  getRecent(notes?: Note[]): Note[];
  openNote(path: string): Promise<void>;
  openDaily(): Promise<void>;
  save(settings: Settings): Promise<void>;
  getJson(url: string): Promise<unknown>;
  notify(message: string): void;
  subscribe(callback: (rename?: VaultRename) => void): () => void;
}
