# 0006 — HUD in HTML/CSS over the Phaser canvas

**Status:** accepted

The tactical HUD, menu and debriefing are DOM overlays (spec §15.1 allows HTML/CSS panels). Text layout, scaling
(100–150 %), accessibility and Playwright selectors are simpler than with canvas text. The HUD only reads state and
sends intents; markup is rewritten only when it changes (avoids layout churn and detached-element races in tests).
