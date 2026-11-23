# 0030 — Touch gestures beside the mouse, and a precached offline shell

## Context

Phones and tablets could open the menus, but a portrait phone clipped the mission list and the
briefing, and the tactical map only listened for mouse buttons. The service worker also answered a
missing script with `index.html`, so an offline reload stayed on the boot line.

## Decision

- Mouse and keyboard input is untouched. A pointer with `wasTouch` uses a separate gesture: tap
  selects or issues the right-click order, a drag pans, a pinch zooms, and a long-press opens the
  existing order menu. Barricade stays the first item when the spot is a door or window.
- Copy that names a mouse chord is swapped only when the primary pointer is coarse. The strings in
  the catalogs stay the mouse wording for a desktop.
- The installed worker precaches every file the build emitted and never substitutes the HTML shell
  for a script or an image. Navigation still falls back to `index.html`.

## Consequences

- A phone can start a mission, move a squad, and barricade without a keyboard. Drag-select remains
  a mouse gesture; squads on a touch screen are selected by tap or by the squad card.
- Each production build gets its own cache name, so an update drops the previous bundle.
