export const FIXED_DT = 1 / 60;

export interface LoopHandle {
  stop(): void;
}

export function startLoop(
  step: (dt: number) => void,
  render: (alpha: number) => void,
): LoopHandle {
  let acc = 0;
  let last = performance.now();
  let running = true;

  const frame = (now: number): void => {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = (now - last) / 1000;
    last = now;
    acc += Math.min(dt, 0.25);
    let n = 0;
    while (acc >= FIXED_DT && n < 3) {
      step(FIXED_DT);
      acc -= FIXED_DT;
      n++;
    }
    if (acc >= FIXED_DT) acc = 0;
    render(acc / FIXED_DT);
  };

  requestAnimationFrame(frame);

  return {
    stop(): void {
      running = false;
    },
  };
}
