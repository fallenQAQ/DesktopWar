export interface DebouncedTask {
  schedule(): void;
  flush(): void;
  cancel(): void;
  readonly pending: boolean;
}

export function debounceTask(run: () => void, waitMs: number): DebouncedTask {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    schedule(): void {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        run();
      }, waitMs);
    },
    flush(): void {
      if (timer === null) return;
      cancel();
      run();
    },
    cancel,
    get pending(): boolean {
      return timer !== null;
    },
  };
}

export function createClickGate(waitMs: number): (run: () => void) => void {
  let last = -Infinity;
  return (run: () => void): void => {
    const now = performance.now();
    if (now - last < waitMs) return;
    last = now;
    run();
  };
}
