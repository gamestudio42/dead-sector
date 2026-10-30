# 0014 — Desktop as Electron packaged in a snap

## Context

The studio's first desktop channel is the Snap Store, already running for Vazante. Dead Sector had only the installable
web app, and its frame rate had never been measured on a real GPU.

## Decision

- **Same setup as Vazante**: `apps/desktop` (Electron, sandboxed window, minimal preload), `snap/snapcraft.yaml` built
  from source with strict confinement, and a workflow that builds, installs and smoke-tests the snap. The Snap Store's
  Builds tab publishes to edge; promotion to stable is manual.
- **Left out on purpose**: Steam, Windows/macOS/Flatpak targets and cross-origin isolation (no `SharedArrayBuffer` here).
- **Fixed origin `app://game`** keeps saves and settings across versions. They are separate from the website's.
- **No service worker on desktop**: the shell serves its own files, and a worker could only serve stale ones.
- **`--smoke` plays into a mission** and checks that ticks advance, storage works and the console has no errors, rather
  than only checking that the page opened.
- **`--bench`** samples frame times per graphics quality in a visible window on the real GPU.

## Consequences

Electron adds about 276 MB unpacked for a small game, in exchange for sharing the studio's packaging and CI. The snap
must be built in CI at first because the dev machine lacks disk space. An unexplained hard reset of that machine right
after the first `--bench` run is recorded in `TASKS.md`; the cause is unknown, and that run's reload bug means it probably
never reached the mission load.
