import { LOGICAL_H, LOGICAL_W, clamp, lerp } from '../core/math';
import { Flags, World } from '../ecs/world';
import type { StyleDef } from '../data/styles';
import { STYLES } from '../data/styles';
import type { StickState } from '../input/input';

export const GLYPH_GROUPS: readonly (readonly string[])[] = [
  ['0x1F', '0xFF', '0b10', 'A5', '7E', '0x00', '1A2B', 'DEAD'],
  ['sudo', 'rm', 'git', 'if', 'null', 'true', 'for', 'else'],
  ['<div>', '{}', '[]', '();', '$>', '//', '&&', '||'],
  ['err', '404', 'warn', '!!', 'NaN', 'EOL', 'FATAL', 'xxx'],
];

export const GLYPH_COLORS = ['#38BDF8', '#34D399', '#E5E7EB', '#FBBF24'] as const;

export interface BossView {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  name: string;
  phase2: boolean;
  window: number;
}

export interface SpawnWarningView {
  x: number;
  y: number;
  size: number;
  progress: number;
  age: number;
}

export interface RenderView {
  active: boolean;
  world: World;
  style: StyleDef | null;
  aimX: number;
  aimY: number;
  aimMode: 'pointer' | 'stick' | 'auto';
  pointerX: number;
  pointerY: number;
  touchMode: boolean;
  autoLocked: boolean;
  leftStick: StickState;
  rightStick: StickState;
  showHitbox: boolean;
  screenShake: boolean;
  reducedMotion: boolean;
  boss: BossView | null;
  phase: string;
  ram: number;
  maxRam: number;
  playerAlpha: number;
  warnings: readonly SpawnWarningView[];
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(hexA: string, hexB: string, t: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(lerp(a[0], b[0], t));
  const g = Math.round(lerp(a[1], b[1], t));
  const bl = Math.round(lerp(a[2], b[2], t));
  return `rgb(${r},${g},${bl})`;
}

function abbreviate(name: string): string {
  const ascii = name.match(/[A-Za-z0-9]+/g)?.join('') ?? '';
  if (ascii.length > 0) return ascii.slice(0, 2).toUpperCase();
  return name.slice(0, 1);
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  scale = 1;
  dpr = 1;
  private bg: HTMLCanvasElement | null = null;
  private bgKey = '';
  private shakePower = 0;
  private shakeTime = 0;
  private texts: FloatingText[] = [];
  private lastFrame = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(document.body);
  }

  resize(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.scale = Math.min(vw / LOGICAL_W, vh / LOGICAL_H);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, Math.round(LOGICAL_W * this.scale));
    const cssH = Math.max(1, Math.round(LOGICAL_H * this.scale));
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(LOGICAL_W * this.dpr);
    this.canvas.height = Math.round(LOGICAL_H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.bg = null;
  }

  get logicalScale(): number {
    return this.scale;
  }

  shake(power: number, duration: number): void {
    this.shakePower = Math.max(this.shakePower, power);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  addText(x: number, y: number, text: string, color: string, life = 0.55): void {
    if (this.texts.length > 80) this.texts.shift();
    this.texts.push({ x, y, text, color, life, maxLife: life });
  }

  private buildBackground(style: StyleDef | null): HTMLCanvasElement {
    const key = style?.color ?? 'none';
    if (this.bg && this.bgKey === key) return this.bg;
    const canvas = document.createElement('canvas');
    canvas.width = LOGICAL_W;
    canvas.height = LOGICAL_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const grad = ctx.createLinearGradient(0, 0, LOGICAL_W, LOGICAL_H);
    grad.addColorStop(0, '#0B1220');
    grad.addColorStop(0.55, '#0C1528');
    grad.addColorStop(1, '#090F1B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    ctx.strokeStyle = 'rgba(148,163,184,0.045)';
    ctx.lineWidth = 1;
    for (let x = 32; x < LOGICAL_W; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, LOGICAL_H);
      ctx.stroke();
    }
    for (let y = 32; y < LOGICAL_H; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(LOGICAL_W, y + 0.5);
      ctx.stroke();
    }

    const glow = ctx.createRadialGradient(640, 330, 40, 640, 330, 620);
    glow.addColorStop(0, `${style?.color ?? '#2563EB'}14`);
    glow.addColorStop(0.7, `${style?.color ?? '#2563EB'}06`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    const vignette = ctx.createRadialGradient(640, 360, 260, 640, 360, 760);
    vignette.addColorStop(0, 'transparent');
    vignette.addColorStop(1, 'rgba(5,9,17,0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    ctx.fillStyle = 'rgba(17,26,46,0.55)';
    ctx.fillRect(0, LOGICAL_H - 30, LOGICAL_W, 30);
    ctx.fillStyle = 'rgba(148,163,184,0.28)';
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.fillText('DesktopWar.exe', 16, LOGICAL_H - 11);
    ctx.fillText('C:  D:  E:  F:  G:', LOGICAL_W - 210, LOGICAL_H - 11);
    ctx.fillStyle = 'rgba(56,189,248,0.25)';
    ctx.fillRect(LOGICAL_W - 238, LOGICAL_H - 13, 14, 3);

    this.bg = canvas;
    this.bgKey = key;
    return canvas;
  }

  render(view: RenderView, alpha: number, nowMs: number): void {
    const ctx = this.ctx;
    const dt = Math.min(0.1, (nowMs - this.lastFrame) / 1000);
    this.lastFrame = nowMs;
    const bg = this.buildBackground(view.style);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0B1220';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.drawImage(bg, 0, 0, LOGICAL_W, LOGICAL_H);

    if (!view.active) {
      this.updateTexts(dt);
      this.drawTexts();
      return;
    }

    this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.shakeTime <= 0) this.shakePower = 0;

    ctx.save();
    if (view.screenShake && !view.reducedMotion && this.shakePower > 0) {
      const p = this.shakePower * (this.shakeTime > 0 ? 1 : 0);
      ctx.translate(Math.round((Math.random() - 0.5) * 2 * p), Math.round((Math.random() - 0.5) * 2 * p));
    }

    this.drawEnemyBullets(view, alpha);
    this.drawEnemies(view, alpha, nowMs);
    this.drawPendingWarnings(view, nowMs);
    this.drawPlayerBullets(view, alpha);
    this.drawPlayer(view, alpha);
    this.drawFx(view, alpha);
    ctx.restore();

    this.drawStick(view.rightStick, view.touchMode ? 'right' : '');
    this.drawStick(view.leftStick, view.touchMode ? 'left' : '');
    this.drawReticle(view);
    this.updateTexts(dt);
    this.drawTexts();
  }

  private drawEnemies(view: RenderView, alpha: number, nowMs: number): void {
    const ctx = this.ctx;
    const w = view.world;
    const c = w.c;
    for (let i = 0; i < w.enemies.length; i++) {
      const e = w.enemies[i]!;
      if (!w.isAlive(e)) continue;
      const idx = w.indexOf(e);
      const tier = c.tier[idx]!;
      const style = STYLES[c.styleIdx[idx]!] ?? STYLES[0]!;
      const size = tier === 2 ? 112 : tier === 1 ? 56 : 48;
      const x = lerp(c.px[idx]!, c.x[idx]!, alpha);
      const y = lerp(c.py[idx]!, c.y[idx]!, alpha);
      const spawn = c.spawnTimer[idx]!;
      const spawnTotal = tier === 1 ? 0.8 : 0.4;
      const spawnProgress = spawn > 0 ? clamp(1 - spawn / spawnTotal, 0, 1) : 1;
      const spawnEase = 1 - (1 - spawnProgress) ** 3;
      const spawnScale = spawn > 0 ? lerp(0.68, 1, spawnEase) : 1;
      const alphaMul = spawn > 0 ? 0.25 + 0.65 * spawnEase : 1;
      const half = (size * spawnScale) / 2;
      ctx.save();
      ctx.globalAlpha = alphaMul;
      const r = size * 0.22;
      roundRect(ctx, x - half, y - half, size * spawnScale, size * spawnScale, r);
      const tint = mix(style.color, '#111A2E', 0.78);
      const grad = ctx.createLinearGradient(x - half, y - half, x + half, y + half);
      grad.addColorStop(0, mix(style.color, '#111A2E', 0.68));
      grad.addColorStop(1, tint);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = tier === 2 ? style.color : tier === 1 ? style.light : 'rgba(255,255,255,0.13)';
      ctx.lineWidth = tier === 0 ? 1 : tier === 1 ? 2 : 3;
      ctx.stroke();
      if (tier === 1) {
        ctx.strokeStyle = `${style.color}99`;
        ctx.lineWidth = 2;
        roundRect(ctx, x - half - 4, y - half - 4, size * spawnScale + 8, size * spawnScale + 8, r + 3);
        ctx.stroke();
      }
      if (c.flash[idx]! > 0) {
        ctx.fillStyle = `rgba(255,255,255,${clamp(c.flash[idx]! * 10, 0, 0.85)})`;
        ctx.fill();
      }
      const proto = c.proto[idx]!;
      const software = style.enemies[(['popup', 'notifier', 'adware', 'trojan', 'cache', 'updater'] as const)[proto] ?? 'popup'] ?? 'App';
      ctx.fillStyle = '#F8FAFC';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${tier === 2 ? 600 : 500} ${Math.round(size * 0.28)}px ui-monospace, Consolas, monospace`;
      ctx.fillText(abbreviate(software), x, y - (tier === 2 ? 6 : 2));
      ctx.font = '9px ui-monospace, Consolas, monospace';
      ctx.fillStyle = 'rgba(229,231,235,0.7)';
      ctx.fillText(software, x, y + size * 0.3);
      if (tier > 0) {
        const bw = tier === 2 ? 120 : 52;
        const ratio = clamp(c.hp[idx]! / Math.max(1, c.maxHp[idx]!), 0, 1);
        ctx.fillStyle = 'rgba(11,18,32,0.8)';
        ctx.fillRect(x - bw / 2, y + half + 8, bw, 4);
        ctx.fillStyle = ratio > 0.5 ? '#F87171' : '#FCA5A5';
        ctx.fillRect(x - bw / 2, y + half + 8, bw * ratio, 4);
      }
      if ((c.flags[idx]! & Flags.WindingUp) !== 0) {
        ctx.strokeStyle = '#FBBF24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, half + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(c.aiTimer[idx]! / 0.35, 0, 1));
        ctx.stroke();
      }
      ctx.restore();
      if ((c.flags[idx]! & Flags.Warn) !== 0) {
        const fadeIn = clamp(c.warnAge[idx]! / 0.2, 0, 1);
        const fadeOut = spawn > 0 ? clamp(spawn / 0.15, 0, 1) : 1;
        this.drawSpawnWarning(x, y, size, spawnProgress, Math.min(fadeIn, fadeOut), nowMs);
      }
    }
  }

  private drawPendingWarnings(view: RenderView, nowMs: number): void {
    for (const warning of view.warnings) {
      const fade = clamp(warning.age / 0.2, 0, 1);
      this.drawSpawnWarning(
        warning.x,
        warning.y,
        warning.size,
        warning.progress,
        fade,
        nowMs,
      );
    }
  }

  private drawSpawnWarning(
    x: number,
    y: number,
    size: number,
    progress: number,
    fade: number,
    nowMs: number,
  ): void {
    if (fade <= 0) return;
    const ctx = this.ctx;
    const time = nowMs / 1000;
    const beat = 0.5 + 0.5 * Math.sin(time * 9);
    const pulse = 1 + 0.1 * beat;
    const marginX = 24;
    const top = 56;
    const bottom = 48;
    const onScreen = x >= marginX && x <= LOGICAL_W - marginX && y >= top && y <= LOGICAL_H - bottom;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#FBBF24';
    ctx.fillStyle = '#FBBF24';
    if (onScreen) {
      const r = size * (0.95 - 0.2 * progress) * pulse;
      ctx.globalAlpha = (0.32 + 0.3 * beat) * fade;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -time * 26;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.globalAlpha = (0.18 + 0.22 * beat) * fade;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.52 * (1.08 - 0.12 * progress), 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = (0.4 + 0.25 * beat) * fade;
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const angle = Math.PI / 4 + i * (Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(angle) * (r + 3), y + Math.sin(angle) * (r + 3));
        ctx.lineTo(x + Math.cos(angle) * (r + 8), y + Math.sin(angle) * (r + 8));
        ctx.stroke();
      }
    } else {
      const mx = clamp(x, marginX, LOGICAL_W - marginX);
      const my = clamp(y, top, LOGICAL_H - bottom);
      const scale = 1 + 0.08 * beat;
      ctx.globalAlpha = (0.4 + 0.3 * beat) * fade;
      ctx.translate(mx, my);
      ctx.rotate(Math.atan2(y - my, x - mx));
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-4, -7);
      ctx.lineTo(-4, 7);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = (0.25 + 0.2 * beat) * fade;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 16 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPlayerBullets(view: RenderView, alpha: number): void {
    const ctx = this.ctx;
    const w = view.world;
    const c = w.c;
    for (let i = 0; i < w.playerBullets.length; i++) {
      const b = w.playerBullets[i]!;
      if (!w.isAlive(b)) continue;
      const idx = w.indexOf(b);
      const x = lerp(c.px[idx]!, c.x[idx]!, alpha);
      const y = lerp(c.py[idx]!, c.y[idx]!, alpha);
      const angle = Math.atan2(c.vy[idx]!, c.vx[idx]!);
      const group = c.glyphGroup[idx]!;
      const text = GLYPH_GROUPS[group]?.[c.glyphIdx[idx]!] ?? '01';
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.scale(1.25, 0.95);
      ctx.font = `${Math.round(18 * clamp(c.r[idx]! / 4, 0.9, 1.5))}px ui-monospace, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = GLYPH_COLORS[group] ?? '#38BDF8';
      ctx.globalAlpha = 0.2;
      ctx.fillText(text, -6, 0);
      ctx.globalAlpha = 1;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }

  private drawEnemyBullets(view: RenderView, alpha: number): void {
    const ctx = this.ctx;
    const w = view.world;
    const c = w.c;
    for (let i = 0; i < w.enemyBullets.length; i++) {
      const b = w.enemyBullets[i]!;
      if (!w.isAlive(b)) continue;
      const idx = w.indexOf(b);
      const x = lerp(c.px[idx]!, c.x[idx]!, alpha);
      const y = lerp(c.py[idx]!, c.y[idx]!, alpha);
      const r = c.r[idx]!;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(248,113,113,0.22)';
      ctx.fillRect(-r - 3, -r - 3, (r + 3) * 2, (r + 3) * 2);
      ctx.fillStyle = '#F87171';
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = '#FFF1F2';
      ctx.fillRect(-r * 0.35, -r * 0.35, r * 0.7, r * 0.7);
      ctx.restore();
    }
  }

  private drawPlayer(view: RenderView, alpha: number): void {
    if (view.playerAlpha <= 0) return;
    const ctx = this.ctx;
    const w = view.world;
    const p = w.player();
    const idx = w.indexOf(p);
    const c = w.c;
    const x = lerp(c.px[idx]!, c.x[idx]!, alpha);
    const y = lerp(c.py[idx]!, c.y[idx]!, alpha);
    const invuln = c.invuln[idx]!;
    const blink = invuln > 0 && Math.floor(invuln * 4) % 2 === 0;
    ctx.save();
    ctx.globalAlpha = blink ? 0.35 : 1;
    const speed = Math.hypot(c.vx[idx]!, c.vy[idx]!);
    if (speed > 1) {
      const nx = c.vx[idx]! / speed;
      const ny = c.vy[idx]! / speed;
      for (let i = 1; i <= 3; i++) {
        ctx.globalAlpha = (blink ? 0.12 : 0.22) * (1 - i * 0.2);
        this.drawCursor(x - nx * i * 9, y - ny * i * 9, 0.8);
      }
    }
    ctx.globalAlpha = blink ? 0.35 : 1;
    this.drawCursor(x, y, 1);
    if (view.showHitbox) {
      ctx.fillStyle = '#38BDF8';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(56,189,248,0.5)';
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (invuln > 0) {
      ctx.strokeStyle = 'rgba(248,113,113,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawCursor(x: number, y: number, scale: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 28);
    ctx.lineTo(7, 21);
    ctx.lineTo(13, 32);
    ctx.lineTo(18, 29);
    ctx.lineTo(12, 19);
    ctx.lineTo(21, 19);
    ctx.closePath();
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0B1220';
    ctx.stroke();
    ctx.restore();
  }

  private drawReticle(view: RenderView): void {
    const ctx = this.ctx;
    let x: number;
    let y: number;
    if (view.touchMode) {
      const p = view.world.player();
      const idx = view.world.indexOf(p);
      x = view.world.c.x[idx]! + view.aimX * 160;
      y = view.world.c.y[idx]! + view.aimY * 160;
    } else {
      x = view.pointerX;
      y = view.pointerY;
    }
    const r = view.touchMode ? 14 : 12;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = view.autoLocked ? '#FBBF24' : '#38BDF8';
    ctx.lineWidth = view.autoLocked ? 1.5 : 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    const gap = 6;
    const arm = 8;
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(cos * gap, sin * gap);
      ctx.lineTo(cos * (gap + arm), sin * (gap + arm));
      ctx.stroke();
    }
    if (view.autoLocked) {
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i + Math.PI / 4;
        ctx.fillStyle = '#FBBF24';
        ctx.fillRect(Math.cos(a) * (r + 5) - 1.5, Math.sin(a) * (r + 5) - 1.5, 3, 3);
      }
    }
    ctx.restore();
  }

  private drawStick(stick: StickState, side: 'left' | 'right' | ''): void {
    if (!stick.active) return;
    const ctx = this.ctx;
    const dx = stick.x - stick.originX;
    const dy = stick.y - stick.originY;
    const d = Math.hypot(dx, dy);
    const travel = Math.min(48, d);
    const nx = d > 0 ? dx / d : 0;
    const ny = d > 0 ? dy / d : 0;
    ctx.save();
    ctx.strokeStyle = side === 'left' ? 'rgba(56,189,248,0.35)' : 'rgba(251,191,36,0.35)';
    ctx.fillStyle = 'rgba(17,26,46,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(stick.originX, stick.originY, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(24,36,60,0.9)';
    ctx.strokeStyle = side === 'left' ? '#38BDF8' : '#FBBF24';
    ctx.beginPath();
    ctx.arc(stick.originX + nx * travel, stick.originY + ny * travel, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawFx(view: RenderView, alpha: number): void {
    const ctx = this.ctx;
    const w = view.world;
    const c = w.c;
    for (let i = 0; i < w.fx.length; i++) {
      const e = w.fx[i]!;
      if (!w.isAlive(e)) continue;
      const idx = w.indexOf(e);
      const x = lerp(c.px[idx]!, c.x[idx]!, alpha);
      const y = lerp(c.py[idx]!, c.y[idx]!, alpha);
      const life = c.life[idx]!;
      const max = Math.max(0.001, c.maxHp[idx]!);
      const t = clamp(1 - life / max, 0, 1);
      const type = c.fxType[idx]!;
      const style = STYLES[c.styleIdx[idx]!] ?? STYLES[0]!;
      if (type === 1) {
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        const s = 2 + c.r[idx]! * (1 + t * 2);
        ctx.beginPath();
        ctx.moveTo(x - s, y);
        ctx.lineTo(x + s, y);
        ctx.moveTo(x, y - s);
        ctx.lineTo(x, y + s);
        ctx.stroke();
        ctx.restore();
      } else if (type === 2) {
        ctx.save();
        ctx.globalAlpha = 1 - t;
        const count = Math.floor(c.r[idx]!);
        for (let j = 0; j < count; j++) {
          const a = (j / count) * Math.PI * 2 + c.orbit[idx]!;
          const d = 6 + t * 26;
          const size = 3 + (j % 3);
          ctx.fillStyle = j % 2 ? '#E5E7EB' : style.color;
          ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, size, size);
        }
        ctx.restore();
      } else if (type === 3) {
        ctx.save();
        ctx.globalAlpha = 0.5 * (1 - t);
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 8 + t * 56, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (type === 4) {
        ctx.save();
        ctx.globalAlpha = 0.7 * (1 - t);
        ctx.strokeStyle = '#34D399';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 20 + t * 90, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private updateTexts(dt: number): void {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const text = this.texts[i]!;
      text.life -= dt;
      text.y -= dt * 22;
      if (text.life <= 0) this.texts.splice(i, 1);
    }
  }

  private drawTexts(): void {
    const ctx = this.ctx;
    for (const text of this.texts) {
      ctx.save();
      ctx.globalAlpha = clamp(text.life / text.maxLife, 0, 1);
      ctx.fillStyle = text.color;
      ctx.font = '13px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(text.text, text.x, text.y);
      ctx.restore();
    }
  }
}
