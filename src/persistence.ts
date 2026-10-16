export type SaveState = 'queued' | 'saving' | 'saved' | 'error';

/** Coalesce immutable configuration snapshots and serialize their writes. */
export class SettingsWriter<T> {
  private pending: { value: T; revision: number } | null = null;
  private timer?: number;
  private revision = 0;
  private chain: Promise<void> = Promise.resolve();
  constructor(private save: (value: T) => Promise<void>, private error: (error: unknown) => void, private state: (state: SaveState) => void = () => {}) {}
  queue(value: T) {
    this.pending = { value, revision: ++this.revision };
    window.clearTimeout(this.timer); this.state('queued');
    this.timer = window.setTimeout(() => { void this.flush(); }, 250);
  }
  /** 设置页等外部来源修改了配置时，用新值替换尚未写入的快照，避免旧值覆盖。 */
  rebase(value: T) { if (this.pending) this.pending = { value, revision: this.pending.revision }; }
  get hasPending() { return !!this.pending; }
  flush(): Promise<void> {
    window.clearTimeout(this.timer); this.timer = undefined;
    const snapshot = this.pending; if (!snapshot) return this.chain;
    this.pending = null;
    this.chain = this.chain.then(async () => {
      if (snapshot.revision === this.revision) this.state('saving');
      try {
        await this.save(snapshot.value);
        if (snapshot.revision === this.revision && !this.pending) this.state('saved');
      } catch (error) {
        if (snapshot.revision === this.revision && !this.pending) { this.pending = snapshot; this.state('error'); }
        this.error(error);
      }
    });
    return this.chain;
  }
}
