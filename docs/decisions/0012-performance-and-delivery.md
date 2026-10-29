# 0012 — Tick performance by memoisation; delivery as an installable web app

## Context

After blocks 4–5 the tick p95 sat at the spec's 10 ms limit. Profiling a full combat mission per system showed noise
propagation (52 %) and perception (31 %) dominating; everything else was under 10 %. Block 6 also asked for a desktop
package and a frame-rate budget on weak hardware.

## Decision

- **Optimise by pure memoisation, never by approximation.** A barrier fingerprint (open/closed state of every door,
  window and barricade) keys: a per-cell sound-absorption grid and opacity grid; cached sound fields per origin cell
  and intensity (small LRU; callers treat them as read-only); and each survivor's visible cells, reused when position,
  facing and barriers are unchanged. Final-state hashes of five full scripted missions were recorded before and are
  bit-identical after. Average tick 7.1 → 3.0 ms on the same machine; noise 3.7 → 0.6 ms.
- **Graphics quality** is a per-viewer setting: Alta (everything), Média (light map at half rate, no fog blur), Baixa
  (flat darkness grade instead of dynamic lights, no smoke). An FPS readout lets players measure their own hardware.
  Headless CI only has software GL (SwiftShader), where numbers are not representative of real GPUs.
- **Desktop delivery as an installable PWA**: web manifest, SVG icon, network-first service worker with an offline
  fallback, full-screen display. It needs no extra toolchain or large runtime download. A native Electron/Tauri wrapper
  stays an option if an executable is required.

## Consequences

- Any new input to opacity or sound absorption must be part of the fingerprint, or the caches would go stale.
- Real-GPU frame budgets remain unmeasured by automation; the FPS readout is the tool for that.
