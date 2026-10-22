import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClickGate, debounceTask } from '../src/core/debounce';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('debounceTask', () => {
  it('runs once after the last schedule', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const task = debounceTask(run, 500);

    task.schedule();
    vi.advanceTimersByTime(300);
    task.schedule();
    vi.advanceTimersByTime(499);
    expect(run).not.toHaveBeenCalled();
    expect(task.pending).toBe(true);

    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(task.pending).toBe(false);
  });

  it('flushes immediately and cancels without running', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const task = debounceTask(run, 500);

    task.schedule();
    task.flush();
    expect(run).toHaveBeenCalledTimes(1);
    expect(task.pending).toBe(false);

    task.schedule();
    task.cancel();
    vi.advanceTimersByTime(500);
    expect(run).toHaveBeenCalledTimes(1);
    expect(task.pending).toBe(false);
  });
});

describe('createClickGate', () => {
  it('ignores repeated clicks inside the window', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const gate = createClickGate(200);
    const run = vi.fn();

    gate(run);
    gate(run);
    expect(run).toHaveBeenCalledTimes(1);

    now = 1100;
    gate(run);
    expect(run).toHaveBeenCalledTimes(1);

    now = 1200;
    gate(run);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
