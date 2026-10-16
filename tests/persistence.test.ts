import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsWriter } from '../src/persistence';
beforeEach(() => vi.useFakeTimers()); afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
describe('coalesced settings writes', () => {
  it('writes only the last value in a rapid sequence', async () => {
    const save = vi.fn(async (_value: number) => {}); const writer = new SettingsWriter(save, () => {});
    writer.queue(1); writer.queue(2); writer.queue(3);
    expect(save).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(251);
    expect(save.mock.calls).toEqual([[3]]);
  });
  it('flushes the pending value when the view closes', async () => {
    const save = vi.fn(async (_value: number) => {}); const writer = new SettingsWriter(save, () => {});
    writer.queue(1); await writer.flush(); expect(save).toHaveBeenCalledWith(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('serializes slow requests and recovers from an error', async () => {
    const writes: number[] = []; const errors = vi.fn();
    const writer = new SettingsWriter(async (value: number) => { writes.push(value); if (value === 1) throw new Error('disk'); }, errors);
    writer.queue(1); const first = writer.flush(); writer.queue(2); const second = writer.flush();
    await Promise.all([first, second]); expect(writes).toEqual([1, 2]); expect(errors).toHaveBeenCalledTimes(1);
  });
  it('retains the failed value for an explicit retry', async () => {
    const save = vi.fn(async (_value: number) => {}); save.mockRejectedValueOnce(new Error('disk'));
    const writer = new SettingsWriter(save, () => {}); writer.queue(3); await writer.flush();
    await writer.flush(); expect(save.mock.calls).toEqual([[3], [3]]);
  });
});
