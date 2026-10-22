import './styles.css';
import { AudioEngine } from './audio/audio';
import { EventBus } from './core/events';
import { startLoop } from './core/loop';
import { randomSeed } from './core/rng';
import { RARITY_LABEL, type Rarity } from './data/buffs';
import type { DifficultyId } from './data/formulas';
import { World } from './ecs/world';
import { Run, type RunPhase } from './game/run';
import { Input } from './input/input';
import { t } from './i18n';
import { MetaStore } from './meta/store';
import { reducedMotionEnabled, type SaveV1 } from './meta/save';
import { Renderer, type RenderView } from './render/renderer';
import { UI } from './ui/ui';

type Scene = 'boot' | 'hub' | 'run' | 'report';

const DIFF_ORDER: DifficultyId[] = ['eco', 'balanced', 'performance'];

class App {
  private readonly store = new MetaStore();
  private readonly audio = new AudioEngine();
  private readonly events = new EventBus();
  private readonly renderer: Renderer;
  private readonly input: Input;
  private readonly ui: UI;
  private readonly idleWorld = new World();

  private scene: Scene = 'boot';
  private run: Run | null = null;
  private lastDifficulty: DifficultyId = 'eco';
  private lastHud = 0;
  private lastPhase: RunPhase | null = null;
  private buffOpen = false;
  private bsodShown = false;
  private shutdownShown = false;
  private settingsFrom: 'hub' | 'pause' = 'hub';
  private portrait = false;

  constructor() {
    const canvas = document.getElementById('world') as HTMLCanvasElement | null;
    const uiRoot = document.getElementById('ui');
    if (!canvas || !uiRoot) throw new Error('DOM shell missing');
    this.renderer = new Renderer(canvas);
    this.audio.setVolumes(this.store.save.settings.musicVolume, this.store.save.settings.sfxVolume);
    this.input = new Input(canvas, {
      onPause: () => this.handlePause(),
      onAnyGesture: () => this.onGesture(),
      onBlur: () => this.autoPause(),
      onVisibilityHidden: () => this.autoPause(),
    });
    this.ui = new UI(uiRoot, {
      onBootStart: () => this.bootToHub(),
      onStart: (difficulty) => this.startRun(difficulty),
      onChooseBuff: (id) => this.chooseBuff(id),
      onReroll: () => this.reroll(),
      onPause: () => this.pauseRun('user'),
      onResume: () => this.resumeRun(),
      onAbandon: () => this.abandonRun(),
      onOpenSettings: () => this.openSettings(),
      onCloseSettings: () => this.closeSettings(),
      onBackToHub: () => this.backToHub(),
      onReplay: () => this.startRun(this.lastDifficulty),
      onDraw: (count) => this.drawKeycaps(count),
      onExport: () => this.exportSave(),
      onImport: (text) => this.importSave(text),
      onReset: () => this.resetProgress(),
      onSettingsChange: (patch) => this.changeSettings(patch),
      onSkip: () => this.skipCinematic(),
      onSfx: () => this.audio.play('uiClick'),
      onClosePage: () => this.backToHub(),
    });
    this.ui.setSave(this.store.save);
    document.documentElement.lang = this.store.save.settings.language;

    window.addEventListener('pointerdown', this.unlockAudio, { passive: true });
    window.addEventListener('keydown', this.unlockAudio);
    window.addEventListener('resize', () => this.checkOrientation());
    window.addEventListener('orientationchange', () => this.checkOrientation());
    window.addEventListener('pagehide', () => this.store.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.store.flush();
      else this.checkOrientation();
    });

    this.ui.showBoot();
    this.registerServiceWorker();
    startLoop(
      (dt) => this.step(dt),
      (alpha) => this.render(alpha),
    );
  }

  private unlockAudio = (): void => {
    this.audio.unlock();
    this.audio.setVolumes(this.store.save.settings.musicVolume, this.store.save.settings.sfxVolume);
  };

  private onGesture(): void {
    this.unlockAudio();
  }

  private bootToHub(): void {
    this.scene = 'hub';
    this.audio.unlock();
    this.audio.startMusic('menu');
    this.ui.setSave(this.store.save);
    this.checkOrientation();
  }

  private viewSettings(): { showHitbox: boolean; screenShake: boolean; reducedMotion: boolean } {
    const settings = this.store.save.settings;
    return {
      showHitbox: settings.showHitbox,
      screenShake: settings.screenShake,
      reducedMotion: reducedMotionEnabled(this.store.save),
    };
  }

  private isUnlocked(difficulty: DifficultyId): boolean {
    return DIFF_ORDER.indexOf(difficulty) <= DIFF_ORDER.indexOf(this.store.save.difficulty.unlocked);
  }

  private startRun(difficulty: DifficultyId): void {
    if (!this.isUnlocked(difficulty)) {
      this.ui.toast(t('ui.locked'), 'danger');
      return;
    }
    this.lastDifficulty = difficulty;
    this.lastPhase = null;
    this.buffOpen = false;
    this.bsodShown = false;
    this.shutdownShown = false;
    this.settingsFrom = 'hub';
    this.input.clear();
    this.input.resetAim();
    this.events.clear();
    const seed = randomSeed();
    this.run = new Run(
      {
        difficulty,
        seed,
        keycapBonus: this.store.keycapBonus(),
        autoLock: this.store.save.settings.autoLock,
      },
      {
        events: this.events,
        grantKeycap: (rarity, rng) => this.store.grantRandomKeycap(rarity, rng),
        addFragments: (amount) => this.store.addFragments(amount),
      },
    );
    this.scene = 'run';
    this.ui.setSave(this.store.save);
    this.ui.showRun();
    this.audio.unlock();
    this.audio.resume();
    this.audio.startMusic('battle');
    if (!this.store.save.flags.tutorialDone) {
      this.ui.toast(t('toast.controls'));
      this.store.markTutorialDone();
    }
    this.checkOrientation();
  }

  private chooseBuff(id: Parameters<Run['chooseBuff']>[0]): void {
    if (!this.run) return;
    this.run.chooseBuff(id);
    this.buffOpen = false;
    this.ui.hideBuffOffer();
    this.audio.play('uiClick');
    this.lastHud = 0;
  }

  private reroll(): void {
    if (!this.run) return;
    this.run.rerollOffer();
    this.audio.play('reroll');
    this.ui.showBuffOffer(this.run);
  }

  private handlePause(): void {
    if (this.scene !== 'run' || !this.run) return;
    if (this.run.phase === 'bsod' || this.run.phase === 'shutdown' || this.run.finished) return;
    if (this.run.paused) this.resumeRun();
    else this.pauseRun('user');
  }

  private pauseRun(reason: string): void {
    if (!this.run || this.scene !== 'run') return;
    if (this.run.phase === 'bsod' || this.run.phase === 'shutdown') return;
    this.run.addPause(reason);
    this.audio.suspend();
    this.ui.showPause(this.run);
  }

  private autoPause(): void {
    if (this.scene !== 'run' || !this.run) return;
    if (this.run.paused || this.run.phase === 'buff_pick') return;
    if (this.run.phase === 'bsod' || this.run.phase === 'shutdown') return;
    this.run.addPause('blur');
    this.audio.suspend();
    this.ui.showPause(this.run);
  }

  private resumeRun(): void {
    if (!this.run) return;
    this.run.clearPauses();
    this.audio.resume();
    this.ui.hideModal();
  }

  private abandonRun(): void {
    if (!this.run) return;
    this.run.clearPauses();
    this.ui.hideModal();
    this.audio.resume();
    this.run.abandon();
  }

  private openSettings(): void {
    this.settingsFrom = this.scene === 'run' && this.run?.paused ? 'pause' : 'hub';
    this.ui.showSettings(this.store.save);
  }

  private closeSettings(): void {
    if (this.settingsFrom === 'pause' && this.run && this.scene === 'run') {
      this.ui.showPause(this.run);
      return;
    }
    this.scene = 'hub';
    this.ui.showHub();
    this.audio.startMusic('menu');
  }

  private changeSettings(patch: Partial<SaveV1['settings']>): void {
    this.store.updateSettings(patch);
    this.audio.setVolumes(this.store.save.settings.musicVolume, this.store.save.settings.sfxVolume);
    this.ui.setSave(this.store.save);
    if (patch.autoLock !== undefined) {
      this.run?.setAutoLock(patch.autoLock);
    }
  }

  private drawKeycaps(count: 1 | 10): void {
    const outcome = this.store.draw(count, randomSeed());
    this.ui.setSave(this.store.save);
    if (!outcome) {
      this.ui.toast(t('toast.no_target'), 'danger');
      return;
    }
    this.ui.renderDraw(this.store.save, outcome);
    if (outcome.pityTriggered) this.ui.toast(t('toast.pity'));
    if (outcome.pulls.some((p) => p.rarity === 'legendary')) this.audio.play('legendary');
    else this.audio.play('keycap');
  }

  private exportSave(): void {
    const text = this.store.exportText();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `desktopwar-save-${Date.now()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this.ui.toast(t('settings.exported'));
  }

  private importSave(text: string): void {
    if (!this.store.importText(text)) {
      this.ui.toast(t('settings.import_failed'), 'danger');
      return;
    }
    this.ui.setSave(this.store.save);
    this.ui.toast(t('settings.imported'), 'success');
    if (this.scene === 'hub') this.ui.showHub();
    else this.ui.showSettings(this.store.save);
  }

  private resetProgress(): void {
    this.store.reset();
    this.ui.setSave(this.store.save);
    this.ui.toast(t('settings.reset'), 'danger');
    if (this.scene === 'hub') this.ui.showHub();
    else this.ui.showSettings(this.store.save);
  }

  private backToHub(): void {
    this.run = null;
    this.scene = 'hub';
    this.lastPhase = null;
    this.buffOpen = false;
    this.input.clear();
    this.ui.hideModal();
    this.ui.hideCinematic();
    this.ui.hideRun();
    this.ui.setSave(this.store.save);
    this.ui.showHub();
    this.audio.resume();
    this.audio.startMusic('menu');
  }

  private skipCinematic(): void {
    this.run?.skipCinematic();
  }

  private handleEvent(event: Parameters<Parameters<EventBus['flush']>[0]>[0]): void {
    const run = this.run;
    switch (event.type) {
      case 'fire':
        this.audio.play('fire', event.group);
        break;
      case 'hit':
        if (event.amount > 0) {
          this.renderer.addText(
            event.x + (Math.random() * 10 - 5),
            event.y - 18,
            `-${event.amount}`,
            event.crit ? '#FBBF24' : '#E5E7EB',
          );
        }
        this.audio.play('hit');
        break;
      case 'enemyDie':
        this.audio.play(event.elite ? 'eliteDie' : 'enemyDie');
        if (event.elite) this.renderer.shake(2, 0.1);
        break;
      case 'playerHurt':
        this.audio.play('playerHurt');
        this.renderer.shake(3, 0.12);
        break;
      case 'ramUp': {
        this.audio.play('ramUp');
        if (run) {
          const p = run.world.player();
          const pi = run.world.indexOf(p);
          this.renderer.addText(run.world.c.x[pi]!, run.world.c.y[pi]! - 26, '+1 RAM', '#34D399');
        }
        break;
      }
      case 'waveClear':
        this.audio.play('waveClear');
        break;
      case 'folderClear':
        this.audio.play('waveClear');
        break;
      case 'bossAlarm':
        this.audio.play('bossAlarm');
        break;
      case 'bossPhase2':
        this.audio.play('bossPhase2');
        this.renderer.shake(4, 0.4);
        break;
      case 'bossDie':
        this.audio.play('eliteDie');
        break;
      case 'bsod':
        if (!this.bsodShown) {
          this.bsodShown = true;
          this.audio.play('bsod');
          this.audio.startMusic('none');
          this.ui.showBsod();
        }
        break;
      case 'shutdown':
        if (!this.shutdownShown) {
          this.shutdownShown = true;
          this.audio.play('shutdown');
          this.audio.startMusic('none');
          this.ui.showShutdown();
        }
        break;
      case 'buffInstall':
        this.audio.play('buffInstall');
        break;
      case 'legendary':
        this.audio.play('legendary');
        break;
      case 'keycap':
        this.audio.play('keycap');
        this.ui.toast(
          t('toast.keycap', {
            label: event.label,
            rarity: RARITY_LABEL[event.rarity as Rarity] ?? event.rarity,
          }),
          'success',
        );
        break;
      case 'trim':
        this.audio.play('waveClear');
        break;
      case 'revive':
        this.audio.play('buffInstall');
        this.renderer.shake(4, 0.3);
        if (run) {
          const p = run.world.player();
          const pi = run.world.indexOf(p);
          this.renderer.addText(run.world.c.x[pi]!, run.world.c.y[pi]! - 30, 'REVIVE', '#34D399');
        }
        break;
      case 'uiClick':
        this.audio.play('uiClick');
        break;
    }
  }

  private updatePhaseUi(run: Run): void {
    if (this.lastPhase !== run.phase) {
      this.lastPhase = run.phase;
      if (this.buffOpen && run.phase !== 'buff_pick') {
        this.buffOpen = false;
        this.ui.hideBuffOffer();
      }
      if (run.phase === 'buff_pick' && run.buffOffer) {
        this.buffOpen = true;
        this.audio.play('updateOpen');
        this.ui.showBuffOffer(run);
      }
      if (run.phase === 'boss_intro' || run.phase === 'boss') {
        this.audio.startMusic('boss');
      } else if (run.phase === 'disk_intro' || run.phase === 'folder_intro' || run.phase === 'wave') {
        this.audio.startMusic('battle');
      }
      if (run.phase === 'bsod' && !this.bsodShown) {
        this.bsodShown = true;
        this.audio.play('bsod');
        this.audio.startMusic('none');
        this.ui.showBsod();
      }
      if (run.phase === 'shutdown' && !this.shutdownShown) {
        this.shutdownShown = true;
        this.audio.play('shutdown');
        this.audio.startMusic('none');
        this.ui.showShutdown();
      }
    }
    if (run.phase === 'bsod') this.ui.updateBsod((run.phaseElapsed / 2.5) * 100);
  }

  private settleRun(): void {
    const run = this.run;
    if (!run) return;
    const result = run.getResult();
    const outcome = this.store.settleRun(result);
    this.ui.setSave(this.store.save);
    this.ui.showReport(result, outcome, this.store.save);
    this.scene = 'report';
    this.run = null;
    this.buffOpen = false;
    this.lastPhase = null;
    this.bsodShown = false;
    this.shutdownShown = false;
    this.input.clear();
    this.audio.resume();
    this.audio.startMusic('menu');
    this.audio.play(outcome.unlocked ? 'unlock' : 'reportTick');
    if (outcome.unlocked) {
      this.ui.toast(
        t('toast.unlock', {
          name: outcome.unlocked === 'balanced' ? t('diff.balanced') : t('diff.performance'),
        }),
        'success',
      );
    }
  }

  private checkOrientation(): void {
    const portrait = window.innerHeight > window.innerWidth;
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const show = portrait && coarse;
    this.ui.setRotate(show);
    if (!this.run || this.scene !== 'run') {
      this.portrait = show;
      return;
    }
    if (show && !this.run.hasPause('system')) {
      this.run.addPause('system');
      this.audio.suspend();
    }
    if (!show && this.portrait) {
      this.run.removePause('system');
      if (this.run.paused) {
        this.audio.suspend();
        this.ui.showPause(this.run);
      } else {
        this.audio.resume();
      }
    }
    this.portrait = show;
  }

  private step(dt: number): void {
    if (this.scene !== 'run' || !this.run) return;
    const run = this.run;
    const p = run.world.player();
    const pi = run.world.indexOf(p);
    const intent = this.input.sample(
      run.world.c.x[pi]!,
      run.world.c.y[pi]!,
      performance.now() / 1000,
    );
    run.setIntent(intent);
    run.step(dt);
    run.events.flush((event) => this.handleEvent(event));
    if (run.finished) {
      this.settleRun();
      return;
    }
    const now = performance.now();
    if (now - this.lastHud >= 100) {
      this.lastHud = now;
      this.ui.updateHud(run);
      this.updatePhaseUi(run);
    }
  }

  private render(alpha: number): void {
    this.input.setScale(this.renderer.scale);
    const now = performance.now();
    if (this.scene === 'run' && this.run) {
      this.renderer.render(
        this.run.getView(
          { left: this.input.leftStick, right: this.input.rightStick },
          this.viewSettings(),
        ),
        alpha,
        now,
      );
      return;
    }
    const idle: RenderView = {
      active: false,
      world: this.idleWorld,
      style: null,
      aimX: 0,
      aimY: -1,
      aimMode: 'pointer',
      pointerX: 640,
      pointerY: 360,
      touchMode: false,
      autoLocked: false,
      leftStick: this.input.leftStick,
      rightStick: this.input.rightStick,
      showHitbox: false,
      screenShake: false,
      reducedMotion: true,
      boss: null,
      phase: 'hub',
      ram: 5,
      maxRam: 5,
      playerAlpha: 0,
      warnings: [],
    };
    this.renderer.render(idle, alpha, now);
  }

  private registerServiceWorker(): void {
    if (!import.meta.env.PROD) return;
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return;
    void navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline mode is optional in MVP */
    });
  }

}

const app = new App();
if (import.meta.env.DEV) {
  (window as unknown as { __dw: App }).__dw = app;
}
