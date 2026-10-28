# 0005 — Scripted plans as acceptance evidence

**Status:** accepted

`packages/sim/src/testing/ScriptedPlans.ts` contains two deterministic command scripts (stealth, combat) that issue
only the same commands a player can issue from the UI, conditioned on order completion/objectives. They prove on the
canonical seed that both strategies win, and they are reused by the browser E2E (`startPlan`) so the full mission is
played inside the real Phaser client. They are not an AI opponent or a "solver" and do not read hidden state beyond
what the HUD shows (order status, objectives).
