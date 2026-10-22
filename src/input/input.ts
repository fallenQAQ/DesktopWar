import { LOGICAL_H, LOGICAL_W, clamp, len, normalize } from '../core/math';

export interface StickState {
  active: boolean;
  originX: number;
  originY: number;
  x: number;
  y: number;
  pointerId: number;
}

export interface Intent {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  aimActive: boolean;
  aimMode: 'pointer' | 'stick' | 'auto';
  pointerX: number;
  pointerY: number;
  hasPointer: boolean;
  primary: boolean;
  touch: boolean;
}

export interface InputCallbacks {
  onPause?: () => void;
  onAnyGesture?: () => void;
  onBlur?: () => void;
  onVisibilityHidden?: () => void;
}

function emptyStick(): StickState {
  return { active: false, originX: 0, originY: 0, x: 0, y: 0, pointerId: -1 };
}

export class Input {
  private readonly keys = new Set<string>();
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: InputCallbacks;
  private scale = 1;
  private rect: DOMRect;
  private pointerX = LOGICAL_W / 2;
  private pointerY = LOGICAL_H / 2 - 80;
  private hasPointer = false;
  private lastPointerMove = -10;
  private primaryPressed = false;
  private lastAim = { x: 0, y: -1 };
  readonly leftStick: StickState = emptyStick();
  readonly rightStick: StickState = emptyStick();
  touchMode = false;

  readonly intent: Intent = {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: -1,
    aimActive: false,
    aimMode: 'pointer',
    pointerX: LOGICAL_W / 2,
    pointerY: LOGICAL_H / 2 - 80,
    hasPointer: false,
    primary: false,
    touch: false,
  };

  constructor(canvas: HTMLCanvasElement, callbacks: InputCallbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.rect = canvas.getBoundingClientRect();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    window.addEventListener('resize', this.updateRect);
    document.addEventListener('scroll', this.updateRect, true);
  }

  private updateRect = (): void => {
    this.rect = this.canvas.getBoundingClientRect();
  };

  setScale(scale: number): void {
    this.scale = scale;
    this.updateRect();
  }

  private toLogical(clientX: number, clientY: number): { x: number; y: number } {
    return {
      x: clamp((clientX - this.rect.left) / this.scale, 0, LOGICAL_W),
      y: clamp((clientY - this.rect.top) / this.scale, 0, LOGICAL_H),
    };
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      event.preventDefault();
      this.keys.add(key);
    }
    if (key === 'escape') {
      event.preventDefault();
      this.callbacks.onPause?.();
    }
    this.callbacks.onAnyGesture?.();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
  };

  private onBlur = (): void => {
    this.clear();
    this.callbacks.onBlur?.();
  };

  private onVisibility = (): void => {
    if (document.hidden) {
      this.clear();
      this.callbacks.onVisibilityHidden?.();
    }
  };

  private onPointerDown = (event: PointerEvent): void => {
    this.callbacks.onAnyGesture?.();
    this.primaryPressed = true;
    this.updateRect();
    const p = this.toLogical(event.clientX, event.clientY);
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      this.touchMode = true;
      const stick = p.x < LOGICAL_W / 2 ? this.leftStick : this.rightStick;
      if (stick.active) return;
      stick.active = true;
      stick.pointerId = event.pointerId;
      stick.originX = p.x;
      stick.originY = p.y;
      stick.x = p.x;
      stick.y = p.y;
      this.canvas.setPointerCapture?.(event.pointerId);
    } else {
      this.hasPointer = true;
      this.pointerX = p.x;
      this.pointerY = p.y;
      this.lastPointerMove = performance.now() / 1000;
    }
    event.preventDefault();
  };

  private onPointerMove = (event: PointerEvent): void => {
    this.updateRect();
    const p = this.toLogical(event.clientX, event.clientY);
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      this.touchMode = true;
      const stick = this.leftStick.pointerId === event.pointerId
        ? this.leftStick
        : this.rightStick.pointerId === event.pointerId
          ? this.rightStick
          : null;
      if (stick) {
        stick.x = p.x;
        stick.y = p.y;
      }
    } else {
      this.hasPointer = true;
      this.pointerX = p.x;
      this.pointerY = p.y;
      this.lastPointerMove = performance.now() / 1000;
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.leftStick.pointerId === event.pointerId) this.leftStick.active = false, this.leftStick.pointerId = -1;
    if (this.rightStick.pointerId === event.pointerId) this.rightStick.active = false, this.rightStick.pointerId = -1;
  };

  clear(): void {
    this.keys.clear();
    this.leftStick.active = false;
    this.rightStick.active = false;
    this.leftStick.pointerId = -1;
    this.rightStick.pointerId = -1;
  }

  resetAim(): void {
    this.hasPointer = false;
    this.lastAim = { x: 0, y: -1 };
    this.lastPointerMove = -10;
  }

  pressesPrimary(): boolean {
    const pressed = this.primaryPressed;
    this.primaryPressed = false;
    return pressed;
  }

  sample(playerX: number, playerY: number, now: number): Intent {
    let mx = 0;
    let my = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) my -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) my += 1;
    if (this.leftStick.active) {
      const dx = this.leftStick.x - this.leftStick.originX;
      const dy = this.leftStick.y - this.leftStick.originY;
      const d = len(dx, dy);
      if (d > 8) {
        const power = Math.min(1, (d - 8) / 40);
        mx = (dx / d) * power;
        my = (dy / d) * power;
      }
    }
    const moveLen = len(mx, my);
    if (moveLen > 1) {
      mx /= moveLen;
      my /= moveLen;
    }

    let ax = 0;
    let ay = 0;
    let aimActive = false;
    let aimMode: Intent['aimMode'] = 'pointer';

    if (this.rightStick.active) {
      const dx = this.rightStick.x - this.rightStick.originX;
      const dy = this.rightStick.y - this.rightStick.originY;
      const d = len(dx, dy);
      if (d > 8) {
        ax = dx / d;
        ay = dy / d;
        aimActive = true;
        aimMode = 'stick';
      }
    }

    if (!aimActive && this.hasPointer) {
      const dx = this.pointerX - playerX;
      const dy = this.pointerY - playerY;
      if (len(dx, dy) >= 24) {
        const n = normalize(dx, dy);
        this.lastAim = n;
      }
      ax = this.lastAim.x;
      ay = this.lastAim.y;
      aimMode = 'pointer';
      aimActive = now - this.lastPointerMove < 0.15;
    }

    if (!this.hasPointer && !this.rightStick.active) {
      ax = this.lastAim.x;
      ay = this.lastAim.y;
    }

    const intent = this.intent;
    intent.moveX = mx;
    intent.moveY = my;
    intent.aimX = ax;
    intent.aimY = ay;
    intent.aimActive = aimActive;
    intent.aimMode = aimMode;
    intent.pointerX = this.pointerX;
    intent.pointerY = this.pointerY;
    intent.hasPointer = this.hasPointer;
    intent.touch = this.touchMode;
    intent.primary = false;
    return intent;
  }

  stickVector(stick: StickState): { x: number; y: number; power: number } {
    if (!stick.active) return { x: 0, y: 0, power: 0 };
    const dx = stick.x - stick.originX;
    const dy = stick.y - stick.originY;
    const d = len(dx, dy);
    if (d < 1) return { x: 0, y: 0, power: 0 };
    return { x: dx / d, y: dy / d, power: Math.min(1, d / 48) };
  }
}
