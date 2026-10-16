export type SaveState = 'queued' | 'saving' | 'saved' | 'error';

/** Coalesce immutable configuration snapshots and serialize their writes. */
export class SettingsWriter<T> {
  private pending: { value: T; revision: number } | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private revision = 0;
  private chain: Promise<void> = Promise.resolve();
  constructor(private save: (value: T) => Promise<void>, private error: (error: unknown) => void, private state: (state: SaveState) => void = () => {}) {}
  queue(value: T) {
    this.pending = { value, revision: ++this.revision };
    clearTimeout(this.timer); this.state('queued');
    this.timer = setTimeout(() => { void this.flush(); }, 250);
  }
  flush(): Promise<void> {
    clearTimeout(this.timer); this.timer = undefined;
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
