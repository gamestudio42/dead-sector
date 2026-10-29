import Phaser from 'phaser';
import { CELL } from '../render/constants';
import { Settings } from '../ui/SaveStore';
import { KeyBindings, type Action } from './KeyBindings';

export const FAST_FACTOR = 2.5;

/** Rebindable key pan (WASD and arrows by default, Shift for fast), wheel zoom, middle drag. Presentation only. */
export class CameraController {
  private keys: Record<string, boolean> = {};
  private dragging: { x: number; y: number } | null = null;
  private onKeyDown = (e: KeyboardEvent) => (this.keys[e.code] = true);
  private onKeyUp = (e: KeyboardEvent) => (this.keys[e.code] = false);
  private onBlur = () => (this.keys = {});

  constructor(
    private scene: Phaser.Scene,
    worldW: number,
    worldH: number,
  ) {
    const cam = scene.cameras.main;
    cam.setBounds(-CELL * 4, -CELL * 4, worldW * CELL + CELL * 8, worldH * CELL + CELL * 8);
    cam.setZoom(1.7);
    scene.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const before = cam.getWorldPoint(scene.input.activePointer.x, scene.input.activePointer.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.45, 4));
      const after = cam.getWorldPoint(scene.input.activePointer.x, scene.input.activePointer.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.middleButtonDown()) this.dragging = { x: p.x, y: p.y };
    });
    scene.input.on('pointerup', () => (this.dragging = null));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      cam.scrollX -= (p.x - this.dragging.x) / cam.zoom;
      cam.scrollY -= (p.y - this.dragging.y) / cam.zoom;
      this.dragging = { x: p.x, y: p.y };
    });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  centerOn(x: number, y: number): void {
    this.scene.cameras.main.centerOn(x * CELL, y * CELL);
  }

  update(deltaMs: number): void {
    const cam = this.scene.cameras.main;
    // Shift is the "fast camera" modifier (playtest request); the base speed is a setting
    const fast = this.keys['ShiftLeft'] || this.keys['ShiftRight'] ? FAST_FACTOR : 1;
    const speed = ((700 * Settings.cameraSpeed * fast) / cam.zoom) * (deltaMs / 1000);
    const held = (action: Action) => KeyBindings.codes(action).some((c) => this.keys[c]);
    if (held('panLeft')) cam.scrollX -= speed;
    if (held('panRight')) cam.scrollX += speed;
    if (held('panUp')) cam.scrollY -= speed;
    if (held('panDown')) cam.scrollY += speed;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
