import Phaser from 'phaser';
import './styles/main.css';
import { BootScene } from './scenes/BootScene';
import { BriefingScene } from './scenes/BriefingScene';
import { DebriefScene } from './scenes/DebriefScene';
import { MenuScene } from './scenes/MenuScene';
import { TacticalScene } from './scenes/TacticalScene';
import { AudioEngine } from './audio/AudioEngine';
import { desktop } from './ui/desktop';
import { applyContrast } from './ui/SaveStore';

applyContrast();

// Browsers only allow audio after a user gesture; unlock on the first one.
const unlockAudio = (): void => AudioEngine.get().unlock();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// Booting WebGL while the viewport is 0×0 (hidden tab/pane) fails with an incomplete framebuffer,
// so wait until the page has a real size.
function boot(): void {
  if (window.innerWidth === 0 || window.innerHeight === 0) {
    window.requestAnimationFrame(boot);
    return;
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#0d0e10',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    render: { antialias: true, pixelArt: false },
    scene: [BootScene, MenuScene, BriefingScene, TacticalScene, DebriefScene],
    banner: false,
  });
  (window as unknown as Record<string, unknown>)['__PHASER_GAME__'] = game;
}

boot();

// Installed web app: cache the static bundle for offline play (production builds only). The desktop
// shell already serves its own files, and a worker there could only serve stale ones.
if (import.meta.env.PROD && !desktop && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is optional */
    });
  });
}
