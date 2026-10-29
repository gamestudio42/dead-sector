# 0009 — Waypoint queue in the simulation; input layer for selection and bindings

## Context

Block 3 added Shift-click waypoints, multi-squad selection, a context menu and rebindable keys. Waypoints affect what
squads do over time, so they must survive save/load and replay identically; selection and key bindings are purely
local preferences.

## Decision

- **Waypoints live in `GameState`** (`Squad.waypoints`), not in the client. `issueOrder` takes `queue: true`; when the
  squad is busy the order is appended (cap 8, `ORDER_QUEUED` event, `queueFull` rejection), otherwise it is issued
  normally. `advanceWaypoints` runs at the end of each tick: a completed order starts the next waypoint (event flagged
  `fromQueue`), a blocked/interrupted one drops the rest (the plan no longer holds). Any non-queued order clears the
  queue, except the internal re-issue used when only the movement mode changes.
- Save schema bumped to **v2** with a migration that adds an empty queue to v1 saves; tests cover continuation after
  save/load and migrating a v1 save.
- **Selection is client-only** (`TacticalScene.selection`, primary first). Commands are still per squad, so replays
  and the sim are unaffected. Several squads moving to one point are spread side by side, perpendicular to travel and
  keeping their current left/right order to avoid crossing. Interactions go to the first selected squad only.
- **Key bindings** use `KeyboardEvent.code` (layout-independent, ABNT2-friendly), live in `localStorage`, swap on
  conflict so no action is left unbound, and keep `Esc` reserved for menus. HUD hints read the live bindings.
- The context menu is opened with **Ctrl + right click** (spec 13.2: radial/context menu "with a modifier"), so plain
  right click stays one-click fast.

## Consequences

- E2E pointer tests must avoid screen areas covered by HUD panels: clicks there go to the HUD, as they should.
- Hold/hide can be queued as the last step ("go and hold"); anything queued after them never starts, by design.
