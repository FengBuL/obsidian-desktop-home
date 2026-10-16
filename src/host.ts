import type { Note } from './notes';
import type { Settings } from './model';
import type { TaskItem } from './tasks';
export interface VaultRename { oldPath: string; newPath: string }
/** 插件与浏览器预览共用的宿主接口：首页界面只通过它读写笔记库。 */
export interface DesktopHost {
  preview: boolean;
  /** 移动端：不自动弹出键盘、不显示快捷键提示。 */
  mobile?: boolean;
  wallpaperUrl: string;
  getNotes(): Note[];
  getRecent(notes?: Note[]): Note[];
  openNote(path: string): Promise<void>;
  /** 打开（必要时创建）某天的日记，默认今天。 */
  openDaily(date?: Date): Promise<void>;
  /** 本月已有日记的日期（1-31）。 */
  dailyDays?(year: number, month: number): Set<number>;
  /** 用搜索词新建一篇笔记并打开；同名笔记已存在时直接打开。 */
  createNote?(title: string): Promise<void>;
  getTasks?(): Promise<TaskItem[]>;
  completeTask?(task: TaskItem): Promise<boolean>;
  addTask?(text: string): Promise<void>;
  /** 库内可用作壁纸的图片路径。 */
  listImages?(): string[];
  resourceUrl?(path: string): string;
  save(settings: Settings): Promise<void>;
  getJson(url: string): Promise<unknown>;
  notify(message: string): void;
  subscribe(callback: (rename?: VaultRename) => void): () => void;
  /** 设置页修改配置后通知已打开的首页。 */
  onSettings?(callback: (settings: Settings) => void): () => void;
  /** 首页当前是否可见；不可见时暂停刷新，回到首页再补上。 */
  isVisible?(): boolean;
}
