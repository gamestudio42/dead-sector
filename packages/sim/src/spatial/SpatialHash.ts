import type { Vec2 } from '../model/types';

/** Uniform bucket grid for neighbourhood queries; rebuilt every tick, insertion order preserved. */
export class SpatialHash<T extends { position: Vec2 }> {
  private buckets = new Map<number, T[]>();

  constructor(
    private readonly bucketSize: number,
    private readonly columns: number,
  ) {}

  private key(bx: number, by: number): number {
    return by * this.columns + bx;
  }

  clear(): void {
    this.buckets.clear();
  }

  insert(item: T): void {
    const k = this.key(
      Math.floor(item.position.x / this.bucketSize),
      Math.floor(item.position.y / this.bucketSize),
    );
    let b = this.buckets.get(k);
    if (!b) {
      b = [];
      this.buckets.set(k, b);
    }
    b.push(item);
  }

  /** Items whose position lies within `radius` of `center`, ordered by bucket then insertion. */
  query(center: Vec2, radius: number, out: T[] = []): T[] {
    out.length = 0;
    const r2 = radius * radius;
    const bx0 = Math.floor((center.x - radius) / this.bucketSize);
    const bx1 = Math.floor((center.x + radius) / this.bucketSize);
    const by0 = Math.floor((center.y - radius) / this.bucketSize);
    const by1 = Math.floor((center.y + radius) / this.bucketSize);
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        if (bx < 0 || by < 0 || bx >= this.columns) continue;
        const b = this.buckets.get(this.key(bx, by));
        if (!b) continue;
        for (const item of b) {
          const dx = item.position.x - center.x;
          const dy = item.position.y - center.y;
          if (dx * dx + dy * dy <= r2) out.push(item);
        }
      }
    }
    return out;
  }
}
