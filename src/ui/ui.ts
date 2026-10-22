import {
  KEYCAP_CAP,
  KEYCAP_SETS,
  KEYCAPS,
  computeKeycapBonus,
  type KeycapDef,
} from '../data/keycaps';
import {
  BUFFS,
  BUFF_BY_ID,
  RARITY_GLYPH,
  RARITY_LABEL,
  type BuffId,
} from '../data/buffs';
import { K, type DifficultyId } from '../data/formulas';
import { formatNumber, formatTime } from '../core/math';
import { buffDesc, buffName, t } from '../i18n';
import type { Run } from '../game/run';
import type { RunResult } from '../game/types';
import type { DrawOutcome, SettlementOutcome } from '../meta/store';
import type { SaveV1 } from '../meta/save';

export interface UICallbacks {
  onBootStart: () => void;
  onStart: (difficulty: DifficultyId) => void;
  onChooseBuff: (id: BuffId) => void;
  onReroll: () => void;
  onPause: () => void;
  onResume: () => void;
  onAbandon: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onBackToHub: () => void;
  onReplay: () => void;
  onDraw: (count: 1 | 10) => void;
  onExport: () => void;
  onImport: (text: string) => void;
  onReset: () => void;
  onSettingsChange: (patch: Partial<SaveV1['settings']>) => void;
  onSkip: () => void;
  onSfx: () => void;
  onClosePage: () => void;
}

type Tag = keyof HTMLElementTagNameMap;

function el<K extends Tag>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return b;
}

function chip(text: string, cls = ''): HTMLElement {
  return el('span', `chip ${cls}`.trim(), text);
}

function difficultyName(id: DifficultyId): string {
  return id === 'eco' ? t('diff.eco') : id === 'balanced' ? t('diff.balanced') : t('diff.performance');
}

function difficultyEnd(id: DifficultyId): string {
  return id === 'eco' ? 'E' : id === 'balanced' ? 'F' : 'G';
}

function clockText(): string {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function statText(stat: 'atk' | 'as' | 'mov'): string {
  return stat === 'atk' ? t('stat.atk') : stat === 'as' ? t('stat.as') : t('stat.mov');
}

function keyWidth(label: string): number {
  if (label === 'Space') return 190;
  if (label === 'Backspace' || label === 'LShift' || label === 'RShift') return 78;
  if (label === 'Enter' || label === 'Caps' || label === 'Tab') return 66;
  if (label.length >= 5) return 58;
  if (label.length >= 3) return 48;
  return 42;
}

export class UI {
  private readonly root: HTMLElement;
  private readonly cb: UICallbacks;
  private save: SaveV1 | null = null;

  private readonly boot: HTMLElement;
  private readonly hub: HTMLElement;
  private readonly runLayer: HTMLElement;
  private readonly subpage: HTMLElement;
  private readonly modal: HTMLElement;
  private readonly cinematic: HTMLElement;
  private readonly toastHost: HTMLElement;

  private readonly hud: HTMLElement;
  private readonly ramCells: HTMLElement;
  private readonly pathText: HTMLElement;
  private readonly waveText: HTMLElement;
  private readonly diskText: HTMLElement;
  private readonly buffStrip: HTMLElement;
  private readonly bossWrap: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossPct: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly bannerTitle: HTMLElement;
  private readonly bannerSub: HTMLElement;

  private selectedDifficulty: DifficultyId = 'eco';
  private selectedKey = 'key.escape';
  private lastDraw: DrawOutcome | null = null;
  private buffSelected: BuffId | null = null;
  private buffKeyHandler: ((event: KeyboardEvent) => void) | null = null;
  private lastBanner = '';
  private page: 'keyboard' | 'draw' | 'codex' = 'codex';
  private codexTab: 'buffs' | 'keycaps' = 'buffs';

  constructor(root: HTMLElement, callbacks: UICallbacks) {
    this.root = root;
    this.cb = callbacks;

    this.boot = el('div', 'screen boot');
    this.hub = el('div', 'screen hub hidden');
    this.runLayer = el('div', 'screen run hidden');
    this.subpage = el('div', 'screen subpage hidden');
    this.modal = el('div', 'modal-layer hidden');
    this.cinematic = el('div', 'cinematic-layer hidden');
    this.toastHost = el('div', 'toast-host');

    this.hud = el('div', 'hud');
    const top = el('div', 'hud-top');
    const ramWrap = el('div', 'ram-wrap');
    ramWrap.append(el('span', 'ram-label', 'RAM'));
    this.ramCells = el('div', 'ram-cells');
    ramWrap.append(this.ramCells);
    this.pathText = el('div', 'hud-path');
    const pauseButton = button('‖', 'pause-button', () => this.cb.onPause());
    pauseButton.setAttribute('aria-label', t('ui.pause'));
    top.append(ramWrap, this.pathText, pauseButton);
    const sub = el('div', 'hud-sub');
    this.waveText = el('span', 'hud-wave');
    this.diskText = el('span', 'hud-disk');
    sub.append(this.waveText, this.diskText);
    this.buffStrip = el('div', 'buff-strip');
    this.bossWrap = el('div', 'boss-wrap hidden');
    const bossTop = el('div', 'boss-top');
    this.bossName = el('span', 'boss-name');
    this.bossPct = el('span', 'boss-pct');
    bossTop.append(this.bossName, this.bossPct);
    const bossTrack = el('div', 'boss-track');
    this.bossFill = el('div', 'boss-fill');
    const bossTick = el('div', 'boss-tick');
    bossTrack.append(this.bossFill, bossTick);
    this.bossWrap.append(bossTop, bossTrack);
    this.banner = el('div', 'banner hidden');
    this.bannerTitle = el('h1', 'banner-title');
    this.bannerSub = el('div', 'banner-sub');
    this.banner.append(this.bannerTitle, this.bannerSub);
    this.hud.append(top, sub, this.bossWrap, this.buffStrip);
    this.runLayer.append(this.hud, this.banner);

    this.root.append(
      this.boot,
      this.hub,
      this.runLayer,
      this.subpage,
      this.modal,
      this.cinematic,
      this.toastHost,
    );
  }

  setSave(save: SaveV1): void {
    this.save = save;
  }

  // ------------------------------------------------------------------ boot
  showBoot(): void {
    this.boot.replaceChildren();
    this.hideAll();
    this.boot.classList.remove('hidden');
    const term = el('div', 'boot-term');
    const bar = el('div', 'boot-bar');
    const fill = el('div', 'boot-bar-fill');
    bar.append(fill);
    term.append(el('div', 'boot-cmd', t('boot.line1')));
    term.append(bar);
    for (let i = 1; i <= 4; i++) {
      const row = el('div', 'boot-row');
      row.append(el('span', '', t(`boot.step${i}` as string)));
      row.append(el('span', 'ok', t('boot.ok')));
      term.append(row);
    }
    term.append(el('div', 'boot-hint', t('boot.hint')));
    this.boot.append(term);
    requestAnimationFrame(() => {
      fill.style.width = '100%';
    });
    let started = false;
    const start = (): void => {
      if (started) return;
      started = true;
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', onKey);
      this.cb.onBootStart();
      this.showHub();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Enter' || event.key === ' ') start();
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', onKey);
  }

  // ------------------------------------------------------------------- hub
  showHub(): void {
    const save = this.save;
    if (!save) return;
    this.hideAll();
    this.hub.classList.remove('hidden');
    this.hub.replaceChildren();
    const header = el('div', 'hub-header');
    header.append(el('div', 'hub-title', 'DesktopWar'));
    header.append(el('div', 'hub-clock', clockText()));
    const body = el('div', 'hub-body');
    const grid = el('div', 'hub-grid');
    const icon = (glyph: string, label: string, cls: string, onClick: () => void): HTMLElement => {
      const wrap = el('div', 'hub-icon');
      const tile = button(glyph, `hub-tile ${cls}`, () => {
        this.cb.onSfx();
        onClick();
      });
      wrap.append(tile, el('div', 'hub-icon-label', label));
      return wrap;
    };
    grid.append(
      icon('EXE', t('ui.start'), 'primary', () => this.showDifficulty(save)),
      icon('87', t('ui.keyboard'), '', () => this.showPage('keyboard', save)),
      icon('RNG', t('ui.draw'), '', () => this.showPage('draw', save)),
      icon('LOG', t('ui.codex'), '', () => this.showPage('codex', save)),
      icon('CFG', t('ui.settings'), '', () => this.showSettings(save)),
    );
    body.append(grid);
    if (!save.flags.tutorialDone) body.append(el('div', 'hub-hint', t('hub.hint')));
    const taskbar = el('div', 'taskbar');
    taskbar.append(el('div', 'taskbar-start', '▦'));
    taskbar.append(el('div', 'taskbar-label', t('ui.start')));
    taskbar.append(el('div', 'taskbar-spacer'));
    taskbar.append(el('div', 'taskbar-item', `${t('ui.keyboard')} ${computeKeycapBonus(save.keycaps).owned}/87`));
    taskbar.append(el('div', 'taskbar-item', `${t('ui.fragments')} ${formatNumber(save.fragments)}`));
    taskbar.append(el('div', 'taskbar-item', clockText()));
    this.hub.append(header, body, taskbar);
  }

  showDifficulty(save: SaveV1): void {
    this.clearModal();
    this.modal.classList.remove('hidden');
    const backdrop = el('div', 'backdrop');
    const win = el('div', 'window diff-window');
    win.append(el('h2', 'window-title', t('diff.title')));
    win.append(el('p', 'window-sub', t('diff.subtitle')));
    const cards = el('div', 'diff-cards');
    const unlocked = save.difficulty.unlocked;
    const order: DifficultyId[] = ['eco', 'balanced', 'performance'];
    const isUnlocked = (id: DifficultyId): boolean => order.indexOf(id) <= order.indexOf(unlocked);
    const select = (id: DifficultyId): void => {
      this.selectedDifficulty = id;
      for (const node of cards.querySelectorAll('.diff-card')) {
        node.classList.toggle('selected', node.getAttribute('data-id') === id);
      }
      start.disabled = false;
    };
    for (const id of order) {
      const open = isUnlocked(id);
      const card = button('', `diff-card ${id} ${open ? '' : 'locked'}`, () => {
        if (!open) {
          const prev = id === 'balanced' ? t('diff.eco') : t('diff.balanced');
          this.toast(t('diff.locked', { prev }), 'danger');
          return;
        }
        select(id);
      });
      card.dataset.id = id;
      card.append(el('div', 'diff-name', difficultyName(id)));
      card.append(el('div', 'diff-disks', t('diff.disks', { end: difficultyEnd(id) })));
      card.append(el('div', 'diff-desc', t(`diff.${id}.desc`)));
      card.append(el('div', 'diff-state', open ? (id === 'eco' ? '●○○' : id === 'balanced' ? '●●○' : '●●●') : t('ui.locked')));
      cards.append(card);
    }
    const start = button(t('diff.launch'), 'btn primary', () => {
      if (isUnlocked(this.selectedDifficulty)) this.cb.onStart(this.selectedDifficulty);
    });
    const back = button(t('ui.back'), 'btn', () => this.clearModal());
    const footer = el('div', 'window-footer');
    footer.append(el('div', 'window-note', t(`diff.${this.selectedDifficulty}.desc`)), start, back);
    win.append(cards, footer);
    this.modal.append(backdrop, win);
    if (isUnlocked(this.selectedDifficulty)) select(this.selectedDifficulty);
    else select('eco');
  }

  // ------------------------------------------------------------------- HUD
  showRun(): void {
    this.hideAll();
    this.runLayer.classList.remove('hidden');
  }

  hideRun(): void {
    this.runLayer.classList.add('hidden');
  }

  updateHud(run: Run): void {
    if (this.ramCells.childElementCount !== run.maxRam) {
      this.ramCells.replaceChildren();
      for (let i = 0; i < run.maxRam; i++) this.ramCells.append(el('span', 'ram-cell'));
    }
    const cells = this.ramCells.children;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i] as HTMLElement;
      cell.classList.toggle('filled', i < run.ram);
      cell.classList.toggle('low', run.ram <= 2 && i < run.ram);
    }
    this.hud.classList.toggle('low-ram', run.ram <= 2);
    this.pathText.textContent = run.pathText ? `${run.diskLetter}:\\${run.pathText}` : '';
    this.waveText.textContent = t('hud.wave', { wave: run.wave, left: run.waveRemaining });
    this.diskText.textContent = t('hud.disk', { disk: run.diskLetter, k: K(run.disk).toFixed(2) });

    const buffs = run.getBuffs();
    this.buffStrip.replaceChildren();
    for (const buff of buffs.slice(0, 10)) {
      const node = el('span', `buff-chip rarity-${BUFF_BY_ID[buff.id].rarity}`);
      node.textContent = BUFF_BY_ID[buff.id].icon;
      node.title = `${buffName(buff.id)} ×${buff.stacks}`;
      if (buff.stacks > 1) node.append(el('b', '', `×${buff.stacks}`));
      this.buffStrip.append(node);
    }
    if (buffs.length > 10) this.buffStrip.append(el('span', 'buff-chip', `+${buffs.length - 10}`));

    const boss = run.boss;
    const showBoss = boss !== null && (run.phase === 'boss' || run.phase === 'boss_intro');
    this.bossWrap.classList.toggle('hidden', !showBoss);
    if (showBoss && boss) {
      const idx = run.world.indexOf(boss.entity);
      const hp = boss.entity ? run.world.c.hp[idx] ?? boss.maxHp : boss.maxHp;
      const ratio = Math.max(0, Math.min(1, hp / boss.maxHp));
      this.bossName.textContent = t('phase.boss', { boss: boss.name });
      this.bossPct.textContent = `${Math.ceil(ratio * 100)}%`;
      this.bossFill.style.width = `${ratio * 100}%`;
      this.bossWrap.classList.toggle('phase2', boss.phase === 2);
      this.bossWrap.classList.toggle('window', boss.windowLeft > 0);
    }
    this.updateBanner(run);
  }

  private updateBanner(run: Run): void {
    let key = '';
    let title = '';
    let sub = '';
    switch (run.phase) {
      case 'disk_intro':
        key = `disk-${run.disk}`;
        title = t('phase.disk_mount', { disk: run.diskLetter });
        sub = `${t('phase.style', { style: run.style.name })} · ${'■'.repeat(run.disk)}`;
        break;
      case 'folder_intro':
        key = `folder-${run.disk}-${run.folder}`;
        title = `${run.diskLetter}:\\${run.pathText}`;
        sub = `${run.folder}/5 · ${'■'.repeat(run.folder)}`;
        break;
      case 'wave_clear':
        key = `wc-${run.disk}-${run.folder}-${run.wave}`;
        title = `W${run.wave} 已清理`;
        sub = t('phase.clear');
        break;
      case 'folder_clear':
        key = `fc-${run.disk}-${run.folder}`;
        title = t('phase.clear');
        sub = t('phase.reward');
        break;
      case 'boss_intro':
        key = `boss-${run.disk}`;
        title = run.boss ? t('phase.boss', { boss: run.boss.name }) : 'Boss';
        sub = 'root_boss · 50% 阶段';
        break;
      case 'disk_clear':
        key = `dc-${run.disk}`;
        title = t('phase.disk_clear', { disk: run.diskLetter });
        sub = `K ${K(run.disk).toFixed(2)} → ${K(run.disk + 1).toFixed(2)}`;
        break;
      default:
        break;
    }
    if (!key) {
      this.banner.classList.add('hidden');
      this.lastBanner = '';
      return;
    }
    this.banner.classList.remove('hidden');
    if (key !== this.lastBanner) {
      this.lastBanner = key;
      this.bannerTitle.textContent = title;
      this.bannerSub.textContent = sub;
      this.banner.classList.remove('pulse');
      void this.banner.offsetWidth;
      this.banner.classList.add('pulse');
    }
  }

  // ---------------------------------------------------------- buff selection
  showBuffOffer(run: Run): void {
    const offer = run.buffOffer;
    if (!offer) return;
    this.clearModal();
    this.modal.classList.remove('hidden');
    this.buffSelected = null;
    const backdrop = el('div', 'backdrop strong');
    const win = el('div', 'window update-window');
    win.append(el('h2', 'window-title', t('update.title')));
    win.append(el('p', 'window-sub', t('update.subtitle')));
    if (offer.kind === 'boss') win.append(el('div', 'update-boss', t('update.boss')));
    if (offer.bonusFragments > 0) win.append(el('div', 'update-boss', t('update.full')));
    const cards = el('div', 'buff-cards');
    const install = button(t('ui.install'), 'btn primary', () => {
      if (this.buffSelected) this.cb.onChooseBuff(this.buffSelected);
    });
    install.disabled = true;
    const select = (index: number): void => {
      const id = offer.cards[index];
      if (!id) return;
      this.buffSelected = id;
      for (const node of cards.querySelectorAll('.buff-card')) {
        node.classList.toggle('selected', node.getAttribute('data-id') === id);
      }
      install.disabled = false;
    };
    offer.cards.forEach((id, index) => {
      const def = BUFF_BY_ID[id];
      const stacks = run.buffs[id] ?? 0;
      const card = button('', `buff-card rarity-${def.rarity}`, () => this.cb.onSfx());
      card.dataset.id = id;
      card.addEventListener('click', () => select(index));
      const top = el('div', 'card-top');
      top.append(el('span', 'rarity-glyph', RARITY_GLYPH[def.rarity]));
      top.append(el('span', 'rarity-label', RARITY_LABEL[def.rarity]));
      card.append(top);
      card.append(el('div', 'card-icon', def.icon));
      card.append(el('div', 'card-name', buffName(id)));
      card.append(el('div', 'card-desc', buffDesc(id)));
      card.append(el('div', 'card-stack', t('ui.lv', { n: stacks + 1, cap: def.maxStacks })));
      card.append(el('div', 'card-index', String(index + 1)));
      cards.append(card);
    });
    const footer = el('div', 'window-footer');
    footer.append(install);
    if (run.canReroll) {
      footer.append(button(t('ui.reroll'), 'btn', () => {
        this.cb.onReroll();
      }));
    }
    win.append(cards, footer);
    this.modal.append(backdrop, win);

    this.buffKeyHandler = (event: KeyboardEvent): void => {
      const index = Number(event.key) - 1;
      if (index >= 0 && index < offer.cards.length) {
        select(index);
      } else if (event.key === 'Enter' && this.buffSelected) {
        this.cb.onChooseBuff(this.buffSelected);
      }
    };
    window.addEventListener('keydown', this.buffKeyHandler);
  }

  hideBuffOffer(): void {
    if (this.buffKeyHandler) {
      window.removeEventListener('keydown', this.buffKeyHandler);
      this.buffKeyHandler = null;
    }
    this.buffSelected = null;
    if (!this.modal.classList.contains('hidden')) this.clearModal();
  }

  // ----------------------------------------------------------------- pause
  showPause(run: Run): void {
    this.clearModal();
    this.modal.classList.remove('hidden');
    const backdrop = el('div', 'backdrop');
    const win = el('div', 'window task-window');
    win.append(el('h2', 'window-title', t('pause.title')));
    const table = el('div', 'task-table');
    const row = (a: string, b: string, c: string): HTMLElement => {
      const r = el('div', 'task-row');
      r.append(el('span', '', a), el('span', '', b), el('span', '', c));
      return r;
    };
    table.append(row(t('pause.process'), t('pause.status'), 'RAM'));
    table.append(row('desktopwar.exe', t('pause.running'), `${'■'.repeat(run.ram)}${'□'.repeat(Math.max(0, run.maxRam - run.ram))} ${run.ram}/${run.maxRam}`));
    table.append(row(t('pause.glyph'), `${(1 / Math.max(0.12, 0.8 / (1 + run.stats.fireRatePct / 100))).toFixed(2)} 发/s`, '—'));
    table.append(row(t('pause.buffs'), `${run.activeBuffCount} 个`, t('pause.legendary', { n: run.legendaryBuffCount })));
    const meta = el('div', 'task-meta');
    meta.textContent = `${t('ui.seed')} 0x${(run.seed >>> 0).toString(16).toUpperCase().padStart(8, '0')}   ${run.diskLetter}:\\${run.pathText}   W${run.wave}/3 · 磁盘 ${run.diskLetter}:`;
    const footer = el('div', 'window-footer');
    footer.append(
      button(t('ui.continue'), 'btn primary', () => this.cb.onResume()),
      button(t('ui.settings'), 'btn', () => this.cb.onOpenSettings()),
      button(t('ui.give_up'), 'btn danger', () => {
        const confirm = el('div', 'inline-confirm');
        confirm.append(
          el('div', 'confirm-title', '放弃本次运行？'),
          el('div', 'confirm-desc', '本局按当前表现结算，已获得的键帽保留。'),
        );
        const actions = el('div', 'confirm-actions');
        actions.append(
          button(t('ui.continue'), 'btn', () => confirm.remove()),
          button(t('ui.give_up'), 'btn danger', () => this.cb.onAbandon()),
        );
        confirm.append(actions);
        win.append(confirm);
      }),
    );
    win.append(table, meta, el('div', 'task-hint', t('pause.hint')), footer);
    this.modal.append(backdrop, win);
  }

  hideModal(): void {
    this.clearModal();
  }

  // ------------------------------------------------------------- cinematic
  showBsod(): void {
    this.cinematic.classList.remove('hidden');
    this.cinematic.className = 'cinematic-layer bsod';
    this.cinematic.replaceChildren();
    this.cinematic.setAttribute('role', 'alert');
    const content = el('div', 'bsod-content');
    content.append(el('div', 'bsod-face', ':('));
    content.append(el('p', 'bsod-p', t('bsod.line1')));
    content.append(el('p', 'bsod-p', t('bsod.line2')));
    content.append(el('p', 'bsod-p bsod-gap', t('bsod.code')));
    content.append(el('p', 'bsod-p', t('bsod.op')));
    const progress = el('div', 'bsod-progress');
    const fill = el('div', 'bsod-progress-fill');
    progress.append(fill);
    const progressText = el('div', 'bsod-progress-text', t('bsod.progress', { n: 0 }));
    content.append(progress, progressText);
    const hint = el('div', 'cinematic-hint', t('ui.skip'));
    hint.style.opacity = '0';
    this.cinematic.append(content, hint);
    let ready = false;
    window.setTimeout(() => {
      ready = true;
      hint.style.opacity = '';
    }, 600);
    this.cinematic.onclick = () => {
      if (ready) this.cb.onSkip();
    };
    this.bsodFill = fill;
    this.bsodText = progressText;
    this.updateBsod(0);
  }

  private bsodFill: HTMLElement | null = null;
  private bsodText: HTMLElement | null = null;

  updateBsod(progress: number): void {
    const p = Math.max(0, Math.min(100, Math.floor(progress)));
    if (this.bsodFill) this.bsodFill.style.width = `${p}%`;
    if (this.bsodText) this.bsodText.textContent = t('bsod.progress', { n: p });
  }

  showShutdown(): void {
    this.cinematic.classList.remove('hidden');
    this.cinematic.className = 'cinematic-layer shutdown';
    this.cinematic.replaceChildren();
    const content = el('div', 'shutdown-content');
    content.append(el('p', 'shutdown-p', t('shutdown.line1')));
    content.append(el('p', 'shutdown-p', t('shutdown.line2')));
    content.append(el('h1', 'shutdown-title', t('shutdown.line3')));
    content.append(el('p', 'shutdown-p muted', t('shutdown.line4')));
    const dots = el('div', 'shutdown-dots', '●●●');
    const hint = el('div', 'cinematic-hint', t('ui.skip'));
    hint.style.opacity = '0';
    this.cinematic.append(content, dots, hint);
    let ready = false;
    window.setTimeout(() => {
      ready = true;
      hint.style.opacity = '';
    }, 600);
    this.cinematic.onclick = () => {
      if (ready) this.cb.onSkip();
    };
  }

  hideCinematic(): void {
    this.cinematic.classList.add('hidden');
    this.cinematic.onclick = null;
    this.bsodFill = null;
    this.bsodText = null;
  }

  // ---------------------------------------------------------------- report
  showReport(
    result: RunResult,
    outcome: SettlementOutcome,
    save: SaveV1,
  ): void {
    this.hideCinematic();
    this.clearModal();
    this.modal.classList.remove('hidden');
    this.hideRun();
    this.hub.classList.add('hidden');
    const backdrop = el('div', 'backdrop strong');
    const win = el('div', 'window report-window');
    const head = el('div', 'report-head');
    head.append(el('h2', 'window-title', t('report.title')));
    head.append(chip(result.cleared ? t('report.cleared') : t('report.failed'), result.cleared ? 'success' : 'danger'));
    win.append(head);
    const meta = el('div', 'report-meta');
    meta.textContent = `${t('ui.seed')} 0x${(result.seed >>> 0).toString(16).toUpperCase().padStart(8, '0')} · ${difficultyName(result.difficulty)}`;
    win.append(meta);
    const grid = el('div', 'report-grid');
    const field = (label: string, value: string, highlight = false): HTMLElement => {
      const box = el('div', `report-field${highlight ? ' highlight' : ''}`);
      box.append(el('span', 'report-label', label), el('span', 'report-value', value));
      return box;
    };
    grid.append(
      field(t('report.duration'), formatTime(result.durationMs / 1000)),
      field(t('report.kills'), formatNumber(result.kills)),
      field(t('report.disks'), `${result.disksCleared}/${result.maxDisk}`),
      field(t('report.no_hit'), String(result.noHitFolders)),
      field(t('report.buffs'), String(result.buffs.reduce((sum, b) => sum + b.stacks, 0))),
      field(t('report.keycaps'), result.keycaps.length ? String(result.keycaps.length) : t('report.none')),
    );
    win.append(grid);
    const fragmentRow = el('div', 'report-fragments');
    fragmentRow.append(el('span', 'report-label', t('report.fragments')));
    const amount = el('span', 'report-fragments-value');
    const total = outcome.fragments.fragments + outcome.firstClearBonus;
    amount.textContent = `+${formatNumber(total)}`;
    fragmentRow.append(amount);
    fragmentRow.append(el('span', 'report-formula', t('report.raw', { raw: Math.round(outcome.fragments.raw), mult: outcome.fragments.mult.toFixed(4) })));
    win.append(fragmentRow);
    if (result.cleared) win.append(el('div', 'report-bonus', t('report.clear_bonus')));
    if (outcome.firstClearBonus > 0) {
      win.append(el('div', 'report-bonus', `首通奖励 +${formatNumber(outcome.firstClearBonus)}`));
    }
    if (result.keycaps.length > 0) {
      const keyRow = el('div', 'report-keys');
      for (const key of result.keycaps) {
        const k = el('span', `chip rarity-${key.rarity}`, `${RARITY_GLYPH[key.rarity]} ${key.label}${key.duplicate ? ' · 重复' : ''}`);
        keyRow.append(k);
      }
      win.append(keyRow);
    }
    if (outcome.unlocked) {
      const banner = el('div', 'unlock-banner', t('report.unlock', { name: difficultyName(outcome.unlocked) }));
      win.append(banner);
    }
    const footer = el('div', 'window-footer');
    footer.append(
      button(t('report.again'), 'btn primary', () => this.cb.onReplay()),
      button(t('report.hub'), 'btn', () => this.cb.onBackToHub()),
    );
    win.append(footer);
    this.modal.append(backdrop, win);
    void save;
  }

  // ---------------------------------------------------------------- pages
  showPage(page: 'keyboard' | 'draw' | 'codex', save: SaveV1): void {
    this.page = page;
    this.save = save;
    this.hideAll();
    this.subpage.classList.remove('hidden');
    this.subpage.replaceChildren();
    if (page === 'keyboard') this.renderKeyboard(save);
    else if (page === 'draw') this.renderDraw(save);
    else this.renderCodex(save);
  }

  renderDraw(save: SaveV1, outcome?: DrawOutcome): void {
    this.save = save;
    if (outcome) this.lastDraw = outcome;
    if (this.page !== 'draw') {
      this.showPage('draw', save);
      return;
    }
    this.subpage.replaceChildren();
    const header = el('div', 'page-header');
    header.append(el('h2', 'page-title', t('draw.title')));
    header.append(el('div', 'page-meta', `${t('ui.fragments')} ${formatNumber(save.fragments)}`));
    header.append(button(t('ui.back'), 'btn', () => this.cb.onClosePage()));
    this.subpage.append(header);
    const info = el('div', 'draw-info');
    info.append(el('div', '', t('draw.probability')));
    info.append(el('div', 'pity', t('draw.pity', { n: save.pity.sinceLegendary })));
    this.subpage.append(info);
    const grid = el('div', 'draw-grid');
    const pulls = this.lastDraw?.pulls ?? [];
    for (let i = 0; i < 10; i++) {
      const pull = pulls[i];
      const card = el('div', `draw-card${pull ? ` rarity-${pull.rarity}` : ' empty'}`);
      if (pull) {
        card.append(el('span', 'draw-glyph', RARITY_GLYPH[pull.rarity]));
        card.append(el('span', 'draw-label', pull.label));
        card.append(el('span', 'draw-rarity', RARITY_LABEL[pull.rarity]));
        if (pull.duplicate) card.append(el('span', 'draw-dup', `+${pull.fragments}`));
      } else {
        card.append(el('span', 'draw-glyph', '?'));
      }
      grid.append(card);
    }
    this.subpage.append(grid);
    const summary = el('div', 'draw-summary');
    if (this.lastDraw) {
      summary.textContent = `${t('draw.new_summary', { n: this.lastDraw.newCount })} · ${t('draw.duplicate_summary', { n: this.lastDraw.pulls.length - this.lastDraw.newCount, fragments: this.lastDraw.duplicateFragments })}`;
    } else {
      summary.textContent = t('draw.empty');
    }
    this.subpage.append(summary);
    const actions = el('div', 'page-actions');
    const complete = Object.keys(save.keycaps).length >= KEYCAPS.length;
    const single = button(t('draw.single'), 'btn primary', () => this.cb.onDraw(1));
    single.disabled = save.fragments < 200 || complete;
    const ten = button(t('draw.ten'), 'btn', () => this.cb.onDraw(10));
    ten.disabled = save.fragments < 1800 || complete;
    actions.append(single, ten);
    if (complete) actions.append(el('div', 'page-note', t('draw.complete')));
    else if (save.fragments < 200) actions.append(el('div', 'page-note danger', t('draw.not_enough', { n: 200 - save.fragments })));
    this.subpage.append(actions);
  }

  private renderKeyboard(save: SaveV1): void {
    const bonus = computeKeycapBonus(save.keycaps);
    const header = el('div', 'page-header');
    header.append(el('h2', 'page-title', `${t('keyboard.title')} · ${t('keyboard.installed', { owned: bonus.owned })}`));
    const stats = el('div', 'key-stats');
    stats.append(
      el('span', '', `${t('keyboard.atk')} +${bonus.atkPct.toFixed(2)}%/${KEYCAP_CAP.atk}%`),
      el('span', '', `${t('keyboard.as')} +${bonus.asPct.toFixed(2)}%/${KEYCAP_CAP.as}%`),
      el('span', '', `${t('keyboard.mov')} +${bonus.movPct.toFixed(2)}%/${KEYCAP_CAP.mov}%`),
    );
    header.append(stats);
    header.append(button(t('ui.back'), 'btn', () => this.cb.onClosePage()));
    this.subpage.append(header);

    const layout = el('div', 'keyboard-layout');
    const board = el('div', 'keyboard-board');
    const rows = new Map<number, KeycapDef[]>();
    for (const key of KEYCAPS) {
      const row = rows.get(key.row) ?? [];
      row.push(key);
      rows.set(key.row, row);
    }
    for (let row = 0; row < 7; row++) {
      const rowEl = el('div', `key-row key-row-${row}`);
      for (const key of rows.get(row) ?? []) {
        const owned = Boolean(save.keycaps[key.id]);
        const node = button(key.label, `keycap ${key.rarity} ${owned ? 'owned' : 'missing'}`, () => {
          this.selectedKey = key.id;
          this.renderKeyboard(save);
          this.cb.onSfx();
        });
        const width = keyWidth(key.label);
        node.style.flex = `0 0 ${width}px`;
        node.style.width = `${width}px`;
        if (this.selectedKey === key.id) node.classList.add('selected');
        node.title = owned
          ? `${key.label} · ${RARITY_LABEL[key.rarity]} · ${statText(key.stat)} +${key.value.toFixed(2)}%`
          : `${key.label} · ${t('keyboard.not_owned')}`;
        rowEl.append(node);
      }
      board.append(rowEl);
    }
    const detail = el('div', 'key-detail');
    const def = KEYCAPS.find((k) => k.id === this.selectedKey) ?? KEYCAPS[0]!;
    const owned = Boolean(save.keycaps[def.id]);
    detail.append(el('div', 'detail-label', def.label));
    detail.append(el('div', `detail-rarity rarity-${def.rarity}`, `${RARITY_GLYPH[def.rarity]} ${RARITY_LABEL[def.rarity]}`));
    detail.append(el('div', 'detail-line', owned ? `${statText(def.stat)} +${def.value.toFixed(2)}%` : t('keyboard.not_owned')));
    detail.append(el('div', 'detail-line muted', `id ${def.id}`));
    const setList = el('div', 'set-list');
    for (const set of KEYCAP_SETS) {
      const done = bonus.sets.includes(set.id);
      const row = el('div', `set-row${done ? ' done' : ''}`);
      row.append(el('span', 'set-name', set.name));
      row.append(el('span', 'set-desc', set.desc));
      row.append(el('span', 'set-state', done ? t('keyboard.set_done') : `${set.keys.filter((id) => save.keycaps[id]).length}/${set.keys.length}`));
      setList.append(row);
    }
    detail.append(el('div', 'detail-heading', t('keyboard.sets')), setList);
    layout.append(board, detail);
    this.subpage.append(layout);
  }

  private renderCodex(save: SaveV1): void {
    const header = el('div', 'page-header');
    header.append(el('h2', 'page-title', t('codex.title')));
    const tabs = el('div', 'tabs');
    const buffTab = button(t('codex.buffs', { n: BUFFS.length }), `tab${this.codexTab === 'buffs' ? ' active' : ''}`, () => {
      this.codexTab = 'buffs';
      this.renderCodex(save);
    });
    const keyTab = button(t('codex.keycaps', { n: Object.keys(save.keycaps).length }), `tab${this.codexTab === 'keycaps' ? ' active' : ''}`, () => {
      this.codexTab = 'keycaps';
      this.renderCodex(save);
    });
    tabs.append(buffTab, keyTab);
    header.append(tabs, button(t('ui.back'), 'btn', () => this.cb.onClosePage()));
    this.subpage.append(header);
    const grid = el('div', 'codex-grid');
    if (this.codexTab === 'buffs') {
      for (const buff of BUFFS) {
        const card = el('div', `codex-card rarity-${buff.rarity}`);
        card.append(el('span', 'codex-glyph', buff.icon));
        card.append(el('span', 'codex-name', buffName(buff.id)));
        card.append(el('span', 'codex-rarity', `${RARITY_GLYPH[buff.rarity]} ${RARITY_LABEL[buff.rarity]}`));
        card.title = buffDesc(buff.id);
        grid.append(card);
      }
    } else {
      for (const key of KEYCAPS) {
        const owned = Boolean(save.keycaps[key.id]);
        const card = el('div', `codex-card keycard rarity-${key.rarity}${owned ? ' owned' : ' unknown'}`);
        card.append(el('span', 'codex-glyph', owned ? key.label : '?'));
        card.append(el('span', 'codex-name', owned ? key.label : t('codex.unknown')));
        card.append(el('span', 'codex-rarity', `${RARITY_GLYPH[key.rarity]} ${RARITY_LABEL[key.rarity]}`));
        grid.append(card);
      }
    }
    this.subpage.append(grid);
  }

  // -------------------------------------------------------------- settings
  showSettings(save: SaveV1): void {
    this.save = save;
    this.clearModal();
    this.modal.classList.remove('hidden');
    const backdrop = el('div', 'backdrop');
    const win = el('div', 'window settings-window');
    win.append(el('h2', 'window-title', t('settings.title')));
    const body = el('div', 'settings-body');

    const section = (title: string): HTMLElement => {
      const s = el('div', 'settings-section');
      s.append(el('div', 'settings-heading', title));
      return s;
    };
    const slider = (
      label: string,
      value: number,
      onChange: (v: number) => void,
    ): HTMLElement => {
      const row = el('label', 'setting-row');
      row.append(el('span', 'setting-label', label));
      const input = el('input', 'setting-range');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.05';
      input.value = String(value);
      const out = el('span', 'setting-value', `${Math.round(value * 100)}%`);
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = `${Math.round(v * 100)}%`;
        onChange(v);
      });
      row.append(input, out);
      return row;
    };
    const toggle = (label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement => {
      const row = el('div', 'setting-row');
      row.append(el('span', 'setting-label', label));
      const btn = button(value ? t('settings.on') : t('settings.off'), `toggle${value ? ' on' : ''}`, () => {
        const next = !btn.classList.contains('on');
        btn.classList.toggle('on', next);
        btn.textContent = next ? t('settings.on') : t('settings.off');
        onChange(next);
        this.cb.onSfx();
      });
      row.append(btn);
      return row;
    };

    const audio = section(t('settings.audio'));
    audio.append(
      slider(t('settings.music'), save.settings.musicVolume, (v) => this.cb.onSettingsChange({ musicVolume: v })),
      slider(t('settings.sfx'), save.settings.sfxVolume, (v) => this.cb.onSettingsChange({ sfxVolume: v })),
    );
    const video = section(t('settings.video'));
    video.append(
      toggle(t('settings.shake'), save.settings.screenShake, (v) => this.cb.onSettingsChange({ screenShake: v })),
      toggle(t('settings.hitbox'), save.settings.showHitbox, (v) => this.cb.onSettingsChange({ showHitbox: v })),
    );
    const motionRow = el('div', 'setting-row');
    motionRow.append(el('span', 'setting-label', t('settings.motion')));
    const motionBtn = button(
      save.settings.reducedMotion === 'system' ? t('settings.system') : save.settings.reducedMotion === 'on' ? t('settings.on') : t('settings.off'),
      'toggle small',
      () => {
        const order: SaveV1['settings']['reducedMotion'][] = ['system', 'on', 'off'];
        const index = order.indexOf(save.settings.reducedMotion);
        const next = order[(index + 1) % order.length]!;
        save.settings.reducedMotion = next;
        motionBtn.textContent = next === 'system' ? t('settings.system') : next === 'on' ? t('settings.on') : t('settings.off');
        this.cb.onSettingsChange({ reducedMotion: next });
        this.cb.onSfx();
      },
    );
    motionRow.append(motionBtn);
    video.append(motionRow);
    const aim = section(t('settings.aim'));
    aim.append(toggle(t('settings.autolock'), save.settings.autoLock, (v) => this.cb.onSettingsChange({ autoLock: v })));
    const general = section(t('settings.language'));
    const lang = el('select', 'setting-select');
    const zh = el('option', '', t('settings.zh'));
    zh.value = 'zh-CN';
    const en = el('option', '', 'English (reserved)');
    en.value = 'en-US';
    en.disabled = true;
    lang.append(zh, en);
    lang.value = 'zh-CN';
    lang.addEventListener('change', () => this.cb.onSettingsChange({ language: 'zh-CN' }));
    general.append(lang);
    const saveSection = section(t('settings.save'));
    const saveActions = el('div', 'setting-row');
    saveActions.append(
      button(t('settings.export'), 'btn small', () => this.cb.onExport()),
      button(t('settings.import'), 'btn small', () => {
        const input = el('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          if (!file) return;
          void file.text().then((text) => this.cb.onImport(text));
        });
        input.click();
      }),
      button(t('settings.reset'), 'btn small danger', () => {
        const confirm = el('div', 'inline-confirm');
        confirm.append(
          el('div', 'confirm-title', t('settings.reset')),
          el('div', 'confirm-desc', t('settings.reset_confirm')),
        );
        const actions = el('div', 'confirm-actions');
        actions.append(
          button(t('ui.cancel'), 'btn', () => confirm.remove()),
          button(t('settings.reset'), 'btn danger', () => this.cb.onReset()),
        );
        confirm.append(actions);
        win.append(confirm);
      }),
    );
    saveSection.append(saveActions);
    const about = el('div', 'settings-about', t('settings.about_text'));
    const footer = el('div', 'window-footer');
    footer.append(button(t('ui.back'), 'btn', () => this.cb.onCloseSettings()));
    body.append(audio, video, aim, general, saveSection, about);
    win.append(body, footer);
    this.modal.append(backdrop, win);
  }

  // ----------------------------------------------------------------- toast
  toast(text: string, kind = ''): void {
    this.toastHost.replaceChildren();
    const node = el('div', `toast ${kind}`.trim(), text);
    this.toastHost.append(node);
    window.setTimeout(() => {
      if (node.parentElement) node.remove();
    }, 2400);
  }

  setRotate(visible: boolean): void {
    const rotate = document.getElementById('rotate');
    if (rotate) rotate.hidden = !visible;
  }

  // --------------------------------------------------------------- helpers
  private hideAll(): void {
    this.boot.classList.add('hidden');
    this.hub.classList.add('hidden');
    this.runLayer.classList.add('hidden');
    this.subpage.classList.add('hidden');
    this.cinematic.classList.add('hidden');
    this.clearModal();
  }

  private clearModal(): void {
    this.buffKeyHandler && window.removeEventListener('keydown', this.buffKeyHandler);
    this.buffKeyHandler = null;
    this.modal.replaceChildren();
    this.modal.classList.add('hidden');
  }
}
