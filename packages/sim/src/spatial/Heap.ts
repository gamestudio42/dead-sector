/** Binary min-heap of numeric values keyed by numeric priority (ties resolved by insertion order). */
export class MinHeap {
  private prio: number[] = [];
  private vals: number[] = [];
  private order: number[] = [];
  private counter = 0;

  get size(): number {
    return this.vals.length;
  }

  clear(): void {
    this.prio.length = 0;
    this.vals.length = 0;
    this.order.length = 0;
    this.counter = 0;
  }

  push(priority: number, value: number): void {
    this.prio.push(priority);
    this.vals.push(value);
    this.order.push(this.counter++);
    this.up(this.vals.length - 1);
  }

  /** Removes and returns the value with lowest priority. Caller must check size first. */
  pop(): number {
    const top = this.vals[0] as number;
    const lastP = this.prio.pop() as number;
    const lastV = this.vals.pop() as number;
    const lastO = this.order.pop() as number;
    if (this.vals.length > 0) {
      this.prio[0] = lastP;
      this.vals[0] = lastV;
      this.order[0] = lastO;
      this.down(0);
    }
    return top;
  }

  private less(i: number, j: number): boolean {
    const pi = this.prio[i] as number;
    const pj = this.prio[j] as number;
    return pi < pj || (pi === pj && (this.order[i] as number) < (this.order[j] as number));
  }

  private swap(i: number, j: number): void {
    [this.prio[i], this.prio[j]] = [this.prio[j] as number, this.prio[i] as number];
    [this.vals[i], this.vals[j]] = [this.vals[j] as number, this.vals[i] as number];
    [this.order[i], this.order[j]] = [this.order[j] as number, this.order[i] as number];
  }

  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  private down(i: number): void {
    const n = this.vals.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
  }
}
