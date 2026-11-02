const ZOOM_KEYS = new Set(['+', '-', '=', '_', '0']);

let installed = false;

// 只锁页面层级；面板内部仍靠 touch-action: pan-y 保留滚动。
export function installViewportGuards(): void {
  if (installed) return;
  installed = true;

  const stop = (event: Event): void => {
    event.preventDefault();
  };

  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, stop, { passive: false });
  }

  document.addEventListener('dblclick', stop, { passive: false });
  document.addEventListener('contextmenu', stop);

  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) event.preventDefault();
    },
    { passive: false },
  );

  window.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    },
    { passive: false },
  );

  window.addEventListener(
    'keydown',
    (event) => {
      if ((event.ctrlKey || event.metaKey) && ZOOM_KEYS.has(event.key)) {
        event.preventDefault();
      }
    },
    { passive: false },
  );

  window.addEventListener(
    'scroll',
    () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    },
    { passive: true },
  );
}
