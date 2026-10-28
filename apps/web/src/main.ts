import Phaser from 'phaser';
import './styles/main.css';
import { BootScene } from './scenes/BootScene';
import { DebriefScene } from './scenes/DebriefScene';
import { MenuScene } from './scenes/MenuScene';
import { TacticalScene } from './scenes/TacticalScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0d0e10',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  render: { antialias: true, pixelArt: false },
  scene: [BootScene, MenuScene, TacticalScene, DebriefScene],
  banner: false,
});

(window as unknown as Record<string, unknown>)['__PHASER_GAME__'] = game;
