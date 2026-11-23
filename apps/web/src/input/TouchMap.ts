/** How far a finger may drift before a press is a pan, not a tap or a long-press. */
export const TAP_SLOP_PX = 18;
/** Hold still this long to open the order menu (the touch stand-in for Ctrl + right click). */
export const LONG_PRESS_MS = 480;

interface Point {
  x: number;
  y: number;
  sx: number;
  sy: number;
}

export interface TouchMap {
  points: Map<number, Point>;
  phase: 'idle' | 'pending' | 'pan' | 'pinch' | 'done';
  started: number;
  originX: number;
  originY: number;
  pinchDist: number;
  longFired: boolean;
}

export type TouchGesture =
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'zoom'; factor: number; cx: number; cy: number }
  | { type: 'tap'; x: number; y: number }
  | { type: 'long'; x: number; y: number };

export function createTouchMap(): TouchMap {
  return {
    points: new Map(),
    phase: 'idle',
    started: 0,
    originX: 0,
    originY: 0,
    pinchDist: 0,
    longFired: false,
  };
}

export function clearTouchMap(state: TouchMap): void {
  state.points.clear();
  state.phase = 'idle';
  state.pinchDist = 0;
  state.longFired = false;
}

function pair(state: TouchMap): [Point, Point] | null {
  if (state.points.size < 2) return null;
  const [a, b] = state.points.values();
  return a && b ? [a, b] : null;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A finger landed. A second finger turns the gesture into a pinch and cancels the long-press. */
export function touchDown(state: TouchMap, id: number, x: number, y: number, now: number): void {
  state.points.set(id, { x, y, sx: x, sy: y });
  if (state.points.size === 1) {
    state.phase = 'pending';
    state.started = now;
    state.originX = x;
    state.originY = y;
    state.longFired = false;
    state.pinchDist = 0;
    return;
  }
  const ends = pair(state);
  if (!ends) return;
  state.phase = 'pinch';
  state.pinchDist = distance(ends[0], ends[1]);
}

/** Finger moved. Pending presses become pans once they leave the slop; pinches report a zoom factor. */
export function touchMove(state: TouchMap, id: number, x: number, y: number): TouchGesture | null {
  const point = state.points.get(id);
  if (!point) return null;
  const dx = x - point.x;
  const dy = y - point.y;
  point.x = x;
  point.y = y;
  if (state.phase === 'pinch') {
    const ends = pair(state);
    if (!ends || state.pinchDist <= 0) return null;
    const next = distance(ends[0], ends[1]);
    const factor = next / state.pinchDist;
    state.pinchDist = next;
    if (Math.abs(factor - 1) < 0.01) return null;
    return {
      type: 'zoom',
      factor,
      cx: (ends[0].x + ends[1].x) / 2,
      cy: (ends[0].y + ends[1].y) / 2,
    };
  }
  if (state.phase === 'pending') {
    if (Math.hypot(x - state.originX, y - state.originY) <= TAP_SLOP_PX) return null;
    state.phase = 'pan';
  }
  if (state.phase === 'pan') return { type: 'pan', dx, dy };
  return null;
}

/** Finger lifted. A short press that never moved is a tap; a long-press already fired is not. */
export function touchUp(
  state: TouchMap,
  id: number,
  x: number,
  y: number,
  now: number,
): TouchGesture | null {
  if (!state.points.has(id)) return null;
  state.points.delete(id);
  const phase = state.phase;
  if (state.points.size === 0) {
    state.phase = 'idle';
    if (phase === 'pending' && !state.longFired && now - state.started < LONG_PRESS_MS)
      return { type: 'tap', x, y };
    return null;
  }
  if (state.points.size === 1 && phase === 'pinch') {
    state.phase = 'pan';
    const rest = [...state.points.values()][0]!;
    state.originX = rest.x;
    state.originY = rest.y;
  }
  return null;
}

/** Call while a finger is down. Fires the long-press once, at the point where the finger landed. */
export function touchHold(state: TouchMap, now: number): TouchGesture | null {
  if (state.phase !== 'pending' || state.longFired || state.points.size !== 1) return null;
  if (now - state.started < LONG_PRESS_MS) return null;
  state.longFired = true;
  state.phase = 'done';
  const point = [...state.points.values()][0]!;
  return { type: 'long', x: point.sx, y: point.sy };
}
