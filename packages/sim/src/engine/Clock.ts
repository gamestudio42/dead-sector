/**
 * Fixed-step accumulator used by hosts (browser loop, tests). It never touches the simulation
 * state: it only answers how many 100 ms ticks should run for an elapsed wall-clock delta.
 */
export class FixedStepClock {
  private accumulator = 0;
  paused = false;
  speed: 1 | 2 = 1;

  constructor(
    readonly tickMs = 100,
    readonly maxTicksPerAdvance = 8,
  ) {}

  /** Returns the number of ticks to execute for `elapsedMs` of real time. */
  advance(elapsedMs: number): number {
    if (this.paused || elapsedMs <= 0) return 0;
    this.accumulator += elapsedMs * this.speed;
    let ticks = Math.floor(this.accumulator / this.tickMs);
    this.accumulator -= ticks * this.tickMs;
    if (ticks > this.maxTicksPerAdvance) {
      ticks = this.maxTicksPerAdvance;
      this.accumulator = 0;
    }
    return ticks;
  }

  /** Interpolation factor between the previous and current tick, for rendering. */
  get alpha(): number {
    return this.paused ? 1 : Math.min(1, this.accumulator / this.tickMs);
  }

  togglePause(): boolean {
    this.paused = !this.paused;
    return this.paused;
  }
}
