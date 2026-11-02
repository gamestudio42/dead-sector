# DEAD SECTOR — Technical and Game-Design Specification

**Version:** 1.0 — 2026-10-28
**Type:** Implementable specification for a programming agent
**Mechanical inspiration:** Close Combat (especially the classic 2D series)
**Title:** provisional, pending a commercial-availability check
**Setting:** Zombie apocalypse, original universe and visual identity
**Initial platforms:** desktop browser; desktop distribution later
**Game language:** Brazilian Portuguese; code, comments, commits and technical documents in English
**Audience:** players who like tactical real-time tactics, survival, squads and emergent campaigns.

Quoted interface strings in this document stay in Brazilian Portuguese, because that is the player-facing language.

> **Nature of the reverse engineering:** functional analysis and an independent reconstruction of observable, documented mechanisms. Do not access closed source, extract resources, or copy maps, scripts, trademarks, specific UI, audio or art from Close Combat or from any other game. The goal is a spiritual successor with its own implementation and identity.

## 0. DIRECT INSTRUCTION TO THE IMPLEMENTING AGENT

You are the lead engineer of an original game called **Dead Sector**. Your mission is to deliver a playable prototype and evolve it until it matches this specification. Do not ship static screens that pretend to be mechanics; every included feature must work in the real simulation. Do not over-architect before there is a playable vertical slice. Use strict TypeScript, automated tests, a deterministic simulation with an injectable RNG, a split between domain and rendering, configurable data and small, verifiable commits. Each phase must produce an executable build whose acceptance criteria are met. When a detail is missing, choose the simplest solution consistent with the pillars and record the decision in `docs/decisions/`.

Absolute priority: **(1) a convincing tactical simulation > (2) readability and interaction > (3) zombie AI > (4) campaign > (5) visual finish**. Never treat zombies as conventional soldiers.

## 1. PRODUCT VISION

### 1.1 High concept

A **pausable real-time tactics** game in which the player commands **squads of survivors** on reconnaissance, rescue, supply, defence and evacuation operations in infested cities. Survivors are people, not drones: they have skills, fear, fatigue, bonds, wounds and their own initiative. Zombies react to sound, sight, obstacles and the movement of other infected. Losses persist across the campaign.

### 1.2 The six pillars

1. **Squad-level command:** orders go to the team; individual behaviour emerges.
2. **Operational psychology:** fear, stress, morale, discipline and leadership change decisions.
3. **Imperfect information:** fog of war, individual line of sight, contact memory and noise.
4. **Sound as a tactical resource:** gunfire attracts and concentrates hordes; quiet weapons have their own cost and risk.
5. **Persistence and scarcity:** casualties, infection, ammunition and supplies matter beyond the mission.
6. **Verifiable emergent stories:** consequences come from simulation state, not from arbitrary events with no warning.

### 1.3 What the game is not

- It is not a real-time strategy game about building bases and gathering resources.
- It is not a tower-defence game whose main system is linear waves.
- It is not a shooter with individual WASD control of a protagonist.
- It does not require an online LLM or an API connection for its real-time decisions.
- It must not reward only killing zombies; rescuing people and bringing them back alive are the main objectives.

### 1.4 Target experience

A single match should be able to produce moments like this: a scout spots infected beyond the fog, the commander orders the team to advance quietly, an accidental shot reveals the position, the noise draws a group from another street, one member panics, the leader rallies her, and the team escapes by an alternate route. The rules that generate the event must be observable and reproducible in tests.

## 2. FUNCTIONAL BREAKDOWN OF THE REFERENCE AND THE TRANSFORMATION

| System inspired by Close Combat | Functional element to rebuild | Original conversion for Dead Sector |
|---|---|---|
| Order the team, not the soldier | the unit obeys with autonomy | squads of 2–6; soldiers seek nearby positions |
| Sneak / Move / Move Fast | three movement tempos | sneak / normal / sprint, with distinct noise, fatigue and risk |
| Defend / Hide / Fire / Smoke | posture, fire and concealment | hold, hide, attack a target or area; smoke later |
| Individual morale and leadership | psychological reaction under threat | fear from horde proximity, losses, isolation and darkness |
| Suppression by gunfire | under fire, humans do less | remains only against human enemies; the infected do not panic from shots |
| LOS, cover, elevation | partial information and terrain advantage | walls block sight; windows allow observation; light, smoke and darkness affect detection |
| Resources and formations | choose teams for the mission | recruits, veterans, specialists and scarce supplies |
| Campaign and losses | progression across several encounters | infested sectors, shelters, missions, trauma and persistent survivors |
| Fog of war | hide undetected opponents | keep known contacts only as a last estimated position |
| Combined combat | positioning, flanking | sound lures, escape routes, barricades, coordinated cover |

**Note:** this table names mechanical foundations. It does not describe or replicate proprietary algorithms.

## 3. SCOPE AND MODES

### 3.1 MVP — one complete tactical mission

- 1 original fixed map, 96 × 96 cells, each cell about 1 metre.
- 2 squads of 4 survivors (8 people in total), with individual attributes and one leader per squad.
- 3 infected types: walker, runner and heavy (in the MVP, simple versions of the first two; the heavy comes in the next phase).
- 30–60 active zombies, depending on difficulty and noise.
- 4 weapons: pistol, carbine, shotgun and melee.
- Basic orders: move, sprint, sneak, hold, hide, attack, retreat, interact.
- Fog of war, line of sight, propagated sound, AI states, combat, fear, ammunition, wounds, bites and extraction.
- One mission with verifiable objectives and outcomes.
- Pause, 1× and 2× speeds, camera, selection and HUD.
- Minimal save/load; deterministic engine tests.
- No multiplayer, crafting, editor or expandable base in this phase.

### 3.2 Extended vertical slice

- 3 maps, 4 classes and 4 infected types.
- Doors, windows and barricades with hit points; simple lighting.
- Inventory, supply loot, extraction and debriefing.
- 3 connected missions with persistence between them.
- Contextual tutorial and original sound effects.

### 3.3 1.0 release

- Campaign with a sector strategic map.
- 12–20 maps, drawn or assembled parametrically, with manual review.
- Varied missions, equipment, training and specialists.
- Day/night cycle, rain, power, simplified vehicles and roaming hordes.
- JSON modding tools, balance passes and stable saving.

### 3.4 Post-1.0 (do not start before the campaign is done)

- Co-op, hostile human factions, optional competitive multiplayer.
- Map and scenario editor.
- High-level natural-language commands translated into structured orders, with a local fallback.
- An LLM for leader planning at discrete moments, never inside the simulation loop.
- A map with complete multiple floors and a detailed interior.

## 4. GAME LOOP

**Before the operation:** inspect the partial map and choose members, weapons, ammunition, supplies and a possible escape route.

**During:** explore → detect threats → issue orders → adapt the route → manage fear, wounds, ammunition and noise → complete the objective → extract.

**After:** event report → update injuries, trauma, infection and death → spend resources → advance the campaign → choose the next operation.

**Dramatic economy:** every round spent protects the team now but costs a future resource; every shot makes noise; every delay raises infestation pressure.

## 5. SIMULATION: CONTRACTS AND TIMING

### 5.1 Time model

- Fixed simulation tick: **100 ms (10 ticks per second)**.
- Rendering is separate: `requestAnimationFrame`, interpolation between states.
- Pause: tick accumulation is off, and the world does not advance.
- Speeds: 1× and 2× multiply how many ticks run; they do not change per-tick formulas.
- Random operations use a seeded, reproducible RNG. The domain never calls `Math.random()`.
- Content times are in seconds; the engine uses ticks. Conversion is explicit.
- Tick pipeline: `applyCommands` → `updatePerception` → `updateNoise` → `decideAI` → `moveActors` → `resolveCombat` → `resolveDamageAndInfection` → `updatePsychology` → `evaluateObjectives` → `emitEvents`.
- Deterministic tie-break: an explicit priority, then a stable id.

### 5.2 Domain-layer rules

- `simulation-core` does NOT import Phaser, the browser, the DOM or graphics objects.
- Every state change happens in `advanceTick(state, commands, rng)` or in systems the simulator calls.
- State has `schemaVersion` and `tick`.
- Generated events contain `id`, `tick`, `type` and a validated payload.
- The renderer only consumes state or snapshots and sends validated commands.
- Movement and combat happen in world space. The camera is presentation only.
- A dead entity does not act, does not hold an active order and does not receive new commands.

### 5.3 Geometry

- A 2D Cartesian world in metres and cells. Each tile has terrain, movement cost, transparency, acoustic absorption and traversal resistance.
- `worldPosition` uses continuous coordinates. The tile grid controls navigation and line of sight.
- Collisions use an approximate circle (survivor radius 0.25 m; zombie radius 0.28 m).
- Doors and obstacles are entities with state. Changing passability invalidates the affected paths.
- The MVP is **one playable level**. Roofs and heights may be visual at first. Do not promise simulated floors before a level system exists.

## 6. MAP, TERRAIN AND COVER

### 6.1 Initial terrain types

| Terrain | Movement cost | LOS | Noise / interaction | Note |
|---|---:|---|---|---|
| Asphalt street | 1.0 | clear | normal footsteps | fast, exposed |
| Sidewalk | 1.0 | clear | normal | — |
| Grass | 1.2 | partly obscured in bushes | quieter footsteps | little ballistic protection |
| Rubble | 1.6 | partial | loud footsteps | trip risk (not MVP) |
| Solid wall | blocked | blocked | high absorption | destructible only if marked |
| Low fence | 1.5 or climbable | clear | climb noise | slows zombies |
| Window | blocked / crossable by interaction | allows sight | broken glass makes noise | passage after it breaks |
| Closed door | blocked | blocked | can be opened or forced | has hit points / a lock |
| Open door | 1.0 | clear | clear | — |

These values are balance starting points, not a physical simulation.

### 6.2 Cover and concealment are different

- **Cover:** reduces the hit chance or damage of human gunfire (future human PvE). Against zombies it works only as a **physical obstacle** they cannot reach or must destroy or go around.
- **Concealment:** reduces the probability or range of visual detection. A bush is not a shield against a bite.
- **Movement block:** a wall or barricade can hold the infected, at a cost and with hit points.
- A mere `coverBonus` must not make someone unreachable by a horde.

### 6.3 Line of sight

- Implement **supercover grid traversal**, or an equivalent ray traversal, with per-tile occlusion tests.
- An opaque wall and a closed door block line of sight. A window allows sight, not passage, until an explicit action.
- Vision belongs to the individual soldier, not to the centre of the team.
- Base daytime range is 18 cells for a survivor; 7 cells at night without light. Lights and lanterns modify this.
- Normal view angle is 120°. Within 3 cells, a reduced 360° peripheral vision makes control easier (tunable).
- Each tick tests only candidate entities in spatial buckets. Short-range line of sight still requires a vision radius.
- A known map does not mean an enemy is currently visible. Lost contacts leave an imprecise marker of the last position, with a timestamp.

### 6.4 Fog of war

Per cell: `unexplored`, `explored`, `visible`. Current visibility is the union of cells visible to living survivors. Draw them differently: black for never explored, dimmed for explored, clear for visible. Never show an undetected zombie only because the cell was explored before.

## 7. SURVIVORS: DATA MODEL AND PSYCHOLOGY

### 7.1 Attributes per survivor

- Identity: persistent id, original name, generic portrait, profession, short background.
- Physical: `health` (0–100), `stamina` (0–100), `bleeding`, `infectionStage`.
- Psychological: `stress` (0–100), `courage` (0–100), `discipline` (0–100), `leadership` (0–100).
- Technical: `marksmanship`, `medicine`, `mechanics`, `stealth` (0–100).
- State: `alive`, `downed`, `dead`, `turned`. Posture: `standing`, `crouched`, `prone` (prone comes later).
- Equipment: equipped weapon, rounds in the magazine and in reserve, weight, items.
- Squad: `squadId`, `isLeader`, current inherited order, local interruption, current target.
- Campaign: `experience`, `traits`, injuries, traumas, relationships (later).

### 7.2 Stress is not morale and is not a wound

For the MVP, use one **stress meter** for immediate behaviour and `discipline`, `courage` and `leadership` as lasting attributes. Do not add five separate meters without clear effects.

- Stress 0–24: calm; follows orders.
- 25–49: alert; aim is slightly worse.
- 50–74: shaken; slow to react, refuses some high-risk actions.
- 75–89: panic; may freeze or seek escape.
- 90–100: breakdown; abandons the order and tries to survive, with a cooldown before re-evaluation.

**Proposed update rule each second (configurable values):**

```
stressDeltaPerSecond =
    0.9 * min(visibleZombiesWithin6m, 8)
  + 3.0 * (isSurrounded ? 1 : 0)
  + 5.0 * (allyDiedRecently ? 1 : 0)
  + 1.5 * (isIsolated ? 1 : 0)
  + 2.0 * (isBittenRecently ? 1 : 0)
  - 1.2 * (inSafeArea ? 1 : 0)
  - 0.8 * (leaderNearby ? leader.leadership / 100 : 0)
  - 0.2 * (courage / 100)
```

Apply `delta = stressDeltaPerSecond * tickSeconds` and clamp to 0–100. Events such as a recent death or wound must become impulses **once per event**. Do not keep treating "recently" as true on every tick. Implement `StressImpulse` with a consumed id or an explicit timer. The formula above is conceptual. In code, separate continuous components from impulses.

Hysteresis: enter panic at stress ≥ 75 and leave only after it falls below 55 and at least 4 seconds have passed. Do not flip state every tick.

### 7.3 Autonomy and refusing orders

An order is an intention, not a guarantee. When stress is high:

- `moveFast` toward a large horde may be interrupted by `seekCover` or `flee`.
- `holdPosition` becomes extremely hard if zombies are in immediate reach.
- `fire` may be interrupted by `reload`, `retreat`, `panic` or an empty magazine.
- The leader lowers the psychological cost and can rally allies. There is no magic control.
- AI must never deliberately step into mortal danger because of a priority bug.
- A frightened soldier may stand still, but the UI must say why.

### 7.4 Survival and infection

- A zombie melee attack is mitigated by positioning, light armour, barricades and range.
- Contact can cause damage, a wound or a bite. Parameters depend on type and difficulty.
- A **bite** causes infection according to the mission configuration (by default a high probability, not 100%).
- Stages: `healthy` → `exposed` → `infected` → `critical` → `turned/dead`. Timers are staged in **campaign time**, not necessarily during the battle.
- Turning cannot happen instantly with no warning. The player must understand the risk.
- First aid treats bleeding and hit points. It does not automatically cure infection.
- MVP: infection appears in the debriefing and on the survivor's state. Turning during combat comes in a later phase, unless a mission is explicitly designed for it.

## 8. SQUADS AND ORDERS

### 8.1 Structure

- 2–6 survivors, an optional leader, a compact formation, spacing 0.8–1.5 m.
- The player selects the whole group by click, panel or hotkey.
- Each survivor picks a viable local position around the formation's central destination.
- A large distance between members marks them as separated. The leader can regroup them.
- When the leader dies, the replacement is the living member with the highest leadership. Stress is affected immediately.

### 8.2 Order catalogue

| Order | Expected action | Consequence |
|---|---|---|
| Move | coordinated movement at a normal pace | medium noise |
| Sneak | slow, quiet movement | low sound; higher attention |
| Sprint | a run with less accuracy and attention | high noise and fatigue |
| Hold | defend a perimeter; aim and fire if allowed | little movement |
| Hide | avoid unnecessary shots and try not to be detected | risk of being surrounded |
| Attack | attack a detected target or a defined area | spends ammunition and makes noise |
| Retreat | move to a priority safe point | cohesion drops if the squad is panicking |
| Interact | open a door, search an object, rescue, start extraction | exposes the team |
| Regroup | move toward the leader and re-form | reduces scatter |
| Fire Discipline | posture: `weaponsFree`, `returnFire`, `holdFire` | controls spontaneous shots |

### 8.3 Order execution machine

`queued` → `planning` → `executing` → `completed`, or `blocked` / `interrupted` / `cancelled`.

- A new order replaces the current one by default. Shift adds a waypoint (after the MVP).
- A blocked route requests a replan. After N attempts, emit `ORDER_BLOCKED`.
- Commands last until they complete or are cancelled, subject to survival interruptions.
- Emergency AI takes precedence: `avoidImmediateDeath` > `panic` > `reload/seekSafety` > `explicitOrder` > `idleBehavior`.
- While paused, the interface may accept orders, but they execute only on resume.

### 8.4 Formation and navigation

- Route planning uses **A\*** on the grid, with terrain costs and observed risk.
- The formation receives the centroid's route. Individuals follow local offsets and search for a free position.
- Replan on significant changes, not every frame.
- Do not cross walls, pass closed doors, or move faster than `speed * dt`.
- Anti-stuck: if displacement is under 0.2 m in 2 s during a movement order, recalculate or declare a block with a reason.

## 9. ZOMBIES: AI AND EMERGENT BEHAVIOUR

### 9.1 Principles

Zombies have no human morale or suppression, they do not seek ballistic cover, and they do not automatically know the player's position. They perceive **sound, sight and signals from other infected**, and they must lose interest when the stimuli disappear. Do not hide telepathy inside the AI.

### 9.2 Initial types

| Type | HP | Speed | Perception | Behaviour | Phase |
|---|---:|---:|---|---|---|
| Walker | 100 | 0.8 m/s | loud sound, short sight | patrols, reacts, slow | MVP |
| Runner | 70 | 2.4 m/s | sight and noise | fast pursuit | MVP |
| Heavy | 260 | 0.55 m/s | medium noise | damages barricades | vertical slice |
| Screamer | 65 | 1.0 m/s | sees and signals | emits an intense sound event | vertical slice |
| Crawler | 45 | 0.5 m/s | short range | hides in terrain | 1.0 |

All values are tunable by difficulty. No magical ranged attacks in the MVP.

### 9.3 Per-infected state machine

`Idle` → `Wander` → `InvestigateSound` → `PursueVisibleTarget` → `Attack` → `SearchLastKnownPosition` → `Wander`.

- `Idle`: a short wait. Do not spend pathfinding.
- `Wander`: a plausible local waypoint, deterministic for the seed.
- `InvestigateSound`: pick the perceived sound event with the highest utility, with an expiring memory.
- `PursueVisibleTarget`: requires line of sight, or recent sight that is still valid. Choose a nearby reachable target.
- `Attack`: requires distance and a cooldown.
- `SearchLastKnownPosition`: go to the last perceived place and search for a limited interval.
- On lost contact: never follow the player's exact position outside line of sight without another perception.
- If a door blocks the path: go around, push or attack it, according to type and state.
- Re-evaluate every 0.3–1 s depending on state, staggered by id and tick to spread CPU cost.

### 9.4 Sound and spatial propagation (key system)

Every sound source produces:

```ts
interface NoiseEvent {
  id: string;
  tick: number;
  position: Vec2;
  intensity: number;       // 0..100
  category: 'shot' | 'footstep' | 'glass' | 'door' | 'explosion' | 'shout' | 'alarm';
  sourceEntityId?: string;
}
```

Sound events must not be known globally by every zombie. Build an acoustic grid propagated by **intensity-budgeted Dijkstra** (a source pays to cross cells, and obstacles absorb). For weak sources, a radial approximation with line of sight or an acoustic ray is an allowed MVP optimisation. The correct default is an attenuated propagation field.

Proposed model:

```
remainingIntensity(nextTile) =
  remainingIntensity(currentTile)
  - distanceCost * attenuationBase
  - tile.soundAbsorption
  - obstaclePenalty
```

Stop when the remainder is ≤ 0. A zombie hears the sound if the remaining intensity on its cell is ≥ `hearingThreshold`, except for modifiers. To avoid thousands of events:

- footsteps are aggregated into pulses every 0.5 s per moving team;
- shots are discrete events;
- noises from the same region and time may be aggregated, keeping the source and the maximum;
- a short cache per event and tick, plus spatial buckets for listeners;
- a configurable maximum number of expansions per tick;
- sound is delayed and attenuated through walls. Never "the sum of every zombie on the map".

**Initial intensity reference** (abstract, to be calibrated): sneak 5; normal step 12; sprint 24; breaking glass 40; pistol 70; carbine 85; shotgun 90; alarm 95; explosion 100. Do not treat this scale as real decibels.

### 9.5 Hordes

- A horde is **emergent collective behaviour**, not necessarily one indivisible entity.
- A zombie can investigate a sound and draw others through collision noise, shouts or a commotion.
- Each one still has its own hit points and collisions.
- Above 150 zombies, group investigation destinations into shared flow fields, recalculated sparingly.
- Crowd interactions must stop 50 zombies from occupying exactly the same spot. Use simple local separation.
- Spawn reinforcements only from explicit spawners outside the currently visible area, with limits and a cooldown, and with a reasonable signal to the player.

### 9.6 Perceptual anti-cheat

Tests must ensure:

1. A zombie behind an opaque wall does not detect a stationary survivor from visual proximity alone.
2. A zombie outside acoustic range does not react to a shot.
3. Closing a door attenuates sound more than an open door.
4. After losing sight and sound, the pursuer searches the last position, not the current coordinate.
5. Zombies never receive the player's global position from render or UI systems.

## 10. COMBAT, WEAPONS AND RESOURCES

### 10.1 Initial weapons

| Weapon | Approximate rate | Magazine | Base damage | Noise | Useful range |
|---|---:|---:|---:|---:|---:|
| Pistol | 2 shots/s | 12 | 38 | 70 | 12 m |
| Carbine | 3 shots/s | 24 | 50 | 85 | 20 m |
| Shotgun | 0.8 shots/s | 6 | 85 up close, falls with distance | 90 | 9 m |
| Club / knife | 1 attack/s | — | 28 | 5 | 1.1 m |

Ballistics are abstract and appropriate to a game, not a real-weapons simulator. Hits use raycast or line of sight and a configurable probability.

### 10.2 Deterministic shot resolution

For each allowed attack:

1. Validate alive, weapon, ammunition, cooldown, target, distance and line of sight.
2. Compute `hitChance = clamp(baseAccuracy + skillBonus - rangePenalty - movementPenalty - stressPenalty - darknessPenalty + stanceBonus, 0.05, 0.95)`.
3. Spend exactly one round and emit sound, whether or not the shot hits.
4. Draw once with the injectable RNG and record `SHOT_FIRED` with the chance and the result.
5. On a hit, apply damage and status (for example a brief stagger on the zombie, not mental suppression).
6. If hit points are ≤ 0, remove the zombie from combat and emit `ENTITY_KILLED` only once.
7. The cooldown prevents firing more than once in the same tick.

In the MVP, projectiles must not pass through opaque walls. Friendly fire is off by default in the MVP (configurable in a later phase).

### 10.3 Melee

- The attacker must be in range, off cooldown, and have a line of contact.
- A zombie prefers a reachable target and does not attack through walls.
- A bite chance exists only when a valid contact attack hits.
- Doors and barricades absorb attacks when they close the route to the survivor.
- Player melee is quiet, but dangerous because of range and stamina cost.

### 10.4 Ammunition and reload

- Separate `magazineRounds`, `reserveRounds`, `magazineCapacity` and `reloadTicks`.
- Reload needs uninterrupted time, or an explicit interruption policy. Do not restore ammunition automatically.
- A squad on `holdFire` does not shoot on its own. The only exception is a configured `emergencySelfDefense` rule that allows melee.
- Zero ammunition must show on the HUD and must prevent the shot. It must not produce phantom noise.

## 11. MISSIONS AND CAMPAIGN

### 11.1 Mission types

1. **Reconnaissance:** reveal points of interest and return with living survivors.
2. **Rescue:** reach an NPC, free them and escort them to extraction.
3. **Supplies:** collect medicine, food, ammunition or parts without losing the team.
4. **Evacuation:** reach the point under horde pressure, activate it and hold for a limited time.
5. **Position defence:** protect civilians and barricades for a defined interval.
6. **Sector retake:** clear critical points or activate infrastructure. Avoid "kill everyone" as the default.
7. **Escort:** move fragile civilians along protected routes.

### 11.2 Strategic campaign (later phase)

- A map of connected sectors with states `unknown`, `infested`, `contested`, `secured`, `lost`.
- The central shelter has capacity, storage, an infirmary, workshops and collective morale.
- Resources: food, medicine, ammunition, fuel, parts, population.
- A discrete strategic day. Each mission spends a turn or time and advances horde migration.
- Zombies move between sectors according to noise, density and defined events.
- Survivors persist by id and stay wounded, traumatised, infected or veteran.
- Death is permanent in the standard campaign. A casual mode may allow restarting the mission.
- Supply and extraction routes influence which operations can be chosen.
- Campaign victory: evacuate a share of the population, or establish a stable network of sectors. Pick one for version 1.0.

### 11.3 Progression without an artificial RPG

Skills rise from real activity, with caps and slow progression. Do not let a soldier gain +500% damage from a level. Veterans improve perception, discipline, reaction time and efficiency, and they stay physically vulnerable.

## 12. MVP MISSION: "A ÚLTIMA FARMÁCIA"

**Map:** **Bairro da Ferrugem**, a fictional urban district, 96×96 cells; crossing streets, a market, a pharmacy, a yard, walls and alleys.

**Situation:** a team must collect essential medicine from a pharmacy and extract a civilian found there.

**Teams:**
- Alfa: leader (police officer), marksman, medic, civilian; 4 members.
- Bravo: leader (former soldier), scout, mechanic, volunteer; 4 members.

**Enemies:** 24 walkers scattered at the start and 6 runners in risk areas. Up to 30 more may enter spawn zones outside visibility if loud noise sustains reinforcement, respecting a simultaneous cap of 60.

**Required objectives:**
1. Enter the pharmacy perimeter.
2. Interact with the supply cabinet (5 protected seconds).
3. Find and rescue the civilian (a 3-second interaction).
4. Start extraction in the southern parking lot.
5. Stay in the extraction area for 20 seconds and extract at least one living member **and** the rescued civilian.

**Failure:** every member of both squads is dead or turned; the civilian is dead or not extracted; the 15-minute simulated time limit is exceeded. **Partial success:** medicine recovered without the civilian extracted. Count it in the debriefing, but the mission is not complete.

**Expected rhythm:** reconnaissance → route choice → accidental contact or stealth → pharmacy → rescue → withdrawal under horde pressure. The player can win without killing most of the zombies.

**Deterministic variation:** the map is fixed for the acceptance test. Initial placement and some patrols use a declared seed. The scenario has a canonical seed for regressions.

**Specific criteria:**
- It is possible to win with at least two plans: a stealth route through the alley, and an advance down the street that spends ammunition.
- Shots raise the activity of infected that the acoustic field actually reaches.
- At least one route can be blocked by a barricade or door and resolved by interaction or by going around.
- The rescued civilian walks as a follower, needs a route and can die. She does not teleport to extraction.
- The debriefing contains duration, extracted survivors, dead, wounded, ammunition used, total noise, supplies and the result.

## 13. UX / UI / CONTROLS

### 13.1 Desktop tactical screen

- **Centre:** 2D map, bodies, objects, interaction points and threat icons.
- **Top:** current objective, time, speed, pause, relative alarm or noise level.
- **Left:** squad list, states (calm, panic, wounded, out of ammunition), shortcuts.
- **Bottom:** members of the selected team with hit points, stress, ammunition and the current order.
- **Contextual right side:** orders and a short reason for an interruption. Show it only while something is selected.
- **Minimap:** explored area and known contacts. Do not reveal invisible zombies.

### 13.2 Controls

- Left click: select a squad, target or context. Drag: an optional selection box after the MVP.
- Right click on the ground: move (default), a radial menu with a modifier, or a long-press on future touch devices.
- Right click on a known enemy: attack, or open a context menu.
- Keys `1–4`: select squads. `Space`: pause. `Q`: sneak. `W`: move. `E`: sprint. `R`: retreat. `H`: hold. `F`: fire or fire discipline. `Tab`: toggle speed.
- Mouse-wheel zoom. Pan with WASD or the screen edge, configurable. Avoid a conflict between pan keys and commands (use the arrow keys for pan at first).
- Esc closes the menu. Pause is always available.
- Show the predicted path and the order colour or icon. Warn when an action is impossible.

### 13.3 Accessibility and comprehension

- HUD scale 100–150%.
- Colour is always paired with an icon or text, never colour alone.
- A legend for critical sounds, and an optional visual mark of the estimated origin.
- Game speed and pause have no penalty in solo play.
- Short tooltips, shown to the player in Brazilian Portuguese: "Equipe não obedece: pânico", "Rota bloqueada: porta trancada".

## 14. ART, AUDIO AND ORIGINAL IDENTITY

**Direction:** a decaying contemporary city, seen from above, a stylised realistic atmosphere, a dark palette with high readability. Distinct human and zombie silhouettes, discreet team indicators, and no reproduction of Close Combat panels, maps, fonts, logos or visual identity.

- Tiles for street, sidewalk, concrete, grass, rubble and interiors.
- Sprites with facing and animations `idle`, `walk`, `run`, `attack`, `hurt`, `die`.
- Simple night lighting with cones or polygons later.
- Effects: impact, dust, a visual noise cue, optional stylised blood with a configurable intensity.
- Original audio: footsteps per surface, shots, breaking glass, distant groans, a failing barricade, radio and ambience.
- Every important audio effect must produce a **coherent simulation sound event**. A visual effect alone cannot attract zombies.
- Early development may use licensed placeholders or assets made for the project. Do not block mechanics while waiting for final art.

## 15. RECOMMENDED ARCHITECTURE

### 15.1 Stack

- **Strict TypeScript**, Vite, Phaser 3 for the 2D scene and UI, HTML/CSS for panels and overlays.
- `@dead-sector/sim`: a pure TypeScript library, with no UI dependencies.
- `@dead-sector/game`: the Phaser layer, user input and HUD.
- `@dead-sector/content`: maps, missions, units, weapons and JSON parameters validated with Zod (or an equivalent).
- Tests: Vitest unit tests, Playwright end to end, ESLint, Prettier.
- At first, `localStorage` for options and `IndexedDB` for saves (behind a replaceable adapter). No backend is required.
- A static build compatible with simple hosting, including GitHub Pages, using a configurable base path.
- Desktop later via Tauri, reusing the web build.

### 15.2 Folder structure

```
dead-sector/
├── apps/
│   └── web/
│       ├── index.html
│       ├── src/
│       │   ├── main.ts
│       │   ├── scenes/{BootScene,MenuScene,TacticalScene,DebriefScene}.ts
│       │   ├── render/{MapRenderer,EntityRenderer,FogRenderer,EffectsRenderer}.ts
│       │   ├── input/{SelectionController,OrderController,CameraController}.ts
│       │   ├── ui/{Hud,UnitPanel,OrdersPanel,ObjectivesPanel}.ts
│       │   └── styles/
│       └── e2e/
├── packages/
│   ├── sim/
│   │   ├── src/
│   │   │   ├── engine/{GameSimulation,Clock,SeededRng,EventBus}.ts
│   │   │   ├── model/{GameState,Entity,Squad,Survivor,Zombie,Weapon,World}.ts
│   │   │   ├── systems/{Commands,Perception,Noise,Pathfinding,Movement,
│   │   │   │           ZombieAI,SurvivorAI,Psychology,Combat,Infection,
│   │   │   │           Objectives,Extraction}.ts
│   │   │   ├── spatial/{Grid,SpatialHash,Raycast,FlowField}.ts
│   │   │   ├── save/{Serializer,Migrations,Replay}.ts
│   │   │   └── index.ts
│   │   └── test/
│   └── content/
│       ├── schemas/
│       ├── weapons/
│       ├── zombies/
│       ├── survivors/
│       ├── missions/
│       └── maps/
├── docs/
│   ├── game-design/
│   ├── architecture/
│   ├── decisions/
│   └── testing/
├── scripts/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

### 15.3 Minimum interfaces

```ts
type EntityId = string;
type SquadId = string;
type Tick = number;
interface Vec2 { x: number; y: number }

type OrderType =
  | 'move' | 'sneak' | 'sprint' | 'hold' | 'hide'
  | 'attack' | 'retreat' | 'interact' | 'regroup';

interface SquadOrder {
  id: string;
  squadId: SquadId;
  type: OrderType;
  issuedAtTick: Tick;
  targetPosition?: Vec2;
  targetEntityId?: EntityId;
  status: 'queued' | 'planning' | 'executing' |
          'completed' | 'blocked' | 'interrupted' | 'cancelled';
}

interface ActorCore {
  id: EntityId;
  position: Vec2;
  velocity: Vec2;
  health: number;
  maxHealth: number;
  alive: boolean;
  collisionRadius: number;
}

interface GameCommand {
  id: string;
  scheduledTick: Tick;
  type: 'issueOrder' | 'setFirePolicy' | 'setSimulationSpeed';
  squadId?: SquadId;
  payload: unknown;
}

interface SimEvent<T = unknown> {
  id: string;
  tick: Tick;
  type: string;
  payload: T;
}

interface GameState {
  schemaVersion: number;
  tick: Tick;
  seed: number;
  missionId: string;
  actors: Record<EntityId, ActorCore>;  // the real model may use a discriminated union
  squads: Record<SquadId, { members: EntityId[]; leaderId?: EntityId }>;
  // world, orders, objectives, visibility, noise and metrics omitted here
}
```

**Caution:** the examples are guiding contracts, not the complete schema. `setSimulationSpeed` is an application-clock setting. It must not advance the tick differently or break a deterministic replay.

### 15.4 Data-driven content and validation

Define JSON assets for `zombieTypes`, `weapons`, `survivorTemplates`, `missions`, `maps` and `difficultyPresets`. Validate them at startup and fail with a descriptive error. Use SI units and consistent names. Separate logic from tuning.

Example:

```json
{
  "id": "walker",
  "displayName": "Errante",
  "maxHealth": 100,
  "moveSpeedMetersPerSecond": 0.8,
  "visionRangeMeters": 10,
  "hearingThreshold": 15,
  "attackRangeMeters": 0.9,
  "attackCooldownSeconds": 1.8,
  "attackDamage": 14,
  "biteChanceOnHit": 0.25
}
```

### 15.5 Services and events

Essential events: `ORDER_ISSUED`, `ORDER_BLOCKED`, `ENEMY_SPOTTED`, `ENEMY_LOST`, `NOISE_EMITTED`, `ZOMBIE_ALERTED`, `SHOT_FIRED`, `WEAPON_RELOADED`, `ACTOR_INJURED`, `ACTOR_KILLED`, `SURVIVOR_PANICKED`, `SURVIVOR_RALLIED`, `OBJECTIVE_COMPLETED`, `EXTRACTION_STARTED`, `MISSION_ENDED`.

The HUD, sounds and tests must be able to inspect events without changing state. Do not use an event bus to hide cyclic dependencies between systems.

### 15.6 Save, replay and observability

- Save `schemaVersion`, seed, tick, map and the full state, including the RNG and cooldowns.
- Restoring and continuing under the same orders produces the same sequence.
- Replay: initial snapshot plus commands with `scheduledTick`. Debug mode records a state hash every 100 ticks.
- Debug overlay (`?debug=1`): grid, line-of-sight raycasts, acoustic field, routes, vision, AI state, FPS, tick duration, zombie count and seed.
- Structured logs by mission and tick. Avoid a log line per entity every frame in production.

## 16. PERFORMANCE AND SCALE

### 16.1 Hardware and performance target

- A desktop with a modern browser and a recent integrated GPU, with no advanced WebGL requirement.
- MVP: 8 survivors plus up to 60 infected, a 96² map, above 45 FPS on the reference machine and no long freezes.
- Post-MVP target: up to 250 active infected at 60 FPS on a mid-range machine. Do not sacrifice the MVP to chase that target.
- Simulation p95 under 10 ms per tick on a reference CI environment still to be defined. Measure before making it a hard gate.

### 16.2 Optimisations, in order

1. A spatial hash or grid for perception and local collisions.
2. Staggered perception updates and line-of-sight optimisation.
3. A pathfinding cache with a time limit, invalidated when the map changes.
4. A shared flow for several zombies drawn to the same source.
5. Sprite instancing and batching, cheap animations, and no rendering of off-screen objects.
6. Profile before adding a web worker. Move the simulation to a worker only if needed, and keep the snapshot API.

## 17. TESTS AND ACCEPTANCE CRITERIA

### 17.1 Required unit tests

- A*: a path avoids a wall. A missing route returns `blocked` without hanging.
- Line of sight: a wall blocks; a window allows sight; a door toggles visibility with its state.
- Noise: a nearby zombie reacts; one outside the field does not; a wall reduces intensity; a fixed seed produces the same grid.
- Psychology: several zombies raise stress; a leader lowers it; panic has hysteresis; stress is clamped to 0–100.
- Combat: no ammunition means no shot; a shot spends one round; a wall blocks; damage does not repeat after death.
- Zombie: after losing line of sight it does not start following the target's secret coordinate.
- Orders: a new order replaces the current one; a block emits an event; pause does not advance the tick.
- Extraction: requires the rescued civilian, at least 1 survivor, and the full extraction time.
- Save/load: a round trip preserves state and the simulation stays deterministic.
- Boundary: the `sim` package runs in Node with no DOM and no Phaser.

### 17.2 Integration and end to end

- Load the menu → start the mission → select Alfa → move → pause → resume → fire → hear the zombie react → collect → rescue → extract → debriefing.
- An interface screenshot test at 1280×720 and 1920×1080, with no clipped controls.
- The canonical seed reproduces the same result for the same command script and tick count.
- A leader-death scenario transfers leadership, or enters a predicted `leaderless` state.
- A defeat scenario ends exactly once and blocks later combat orders.

### 17.3 Code quality and safety

- `tsc --noEmit` with no errors, the linter with no errors, and unit tests passing.
- Do not add paid APIs, trackers or telemetry without an explicit decision.
- Sanitise and validate imported JSON, saves and maps.
- Versioned saves. Migrate an incompatible version, or reject it with a clear error.
- Avoid circular imports and unjustified `any`.
- An asset-licensing file (`ASSETS.md`) with authorship, licence and provenance.

## 18. PHASED IMPLEMENTATION PLAN

### Phase 0 — Foundation (first minimal playable commit)

**Deliver:** monorepo, Vite + Phaser, a placeholder map, camera, dummy squad selection, a fixed clock, a seeded RNG, logs and tests.
**Accept:** `pnpm install && pnpm dev` shows a navigable map; `pnpm test` passes; the core runs in Node.

### Phase 1 — Tactical movement

**Deliver:** a blocking grid, squads, 8 survivors, A*, move/sneak/sprint/hold orders, formation offsets, selection, destinations and UI.
**Accept:** nobody walks through a wall; teams carry out orders; pause works; stress may still be mocked and labelled as a placeholder.

### Phase 2 — Perception and zombies

**Deliver:** line of sight, fog of war, footstep noise, a zombie state machine, wander/investigate/chase/attack, timers and an acoustic debug view.
**Accept:** the infected investigate only perceived stimuli; walls block sight; sneaking attracts fewer infected than sprinting.

### Phase 3 — Combat and psychology

**Deliver:** weapons, ammunition, reload, damage, hit points, death, zombie attacks, stress, panic, leadership and a fire policy.
**Accept:** attacks have a cooldown; deaths are recorded once; panic can interrupt an order and can eventually end.

### Phase 4 — Vertical-slice mission

**Deliver:** the pharmacy, the civilian, interactions, objectives, timed evacuation, win/loss, debriefing, menu and saves.
**Accept:** the mission is fully playable from start to finish; victory is possible by stealth and by combat; the critical-flow end-to-end test passes.

### Phase 5 — Quality and variation

**Deliver:** interactive obstacles, original audio, an accessible UI, 2 more maps, 2 more zombie types, 3 connected missions and basic persistence.
**Accept:** obstacle changes affect paths, line of sight and sound; progress and losses persist between missions.

### Phase 6 — Campaign

**Deliver:** a strategic map, shelter, inventory, resources, a strategic turn, mission choices and difficulty balance.
**Accept:** playing several operations changes the world persistently; decisions have explicit costs.

### Phase 7 — Polish and release

**Deliver:** accessibility options, optimisation, complete menus, a tutorial, licences, a web build and a desktop package.
**Accept:** a reproducible build, a full flow with no console errors, and verified performance targets.

**Rule for the agent:** do not start a new phase while the current phase's criteria are not working. Each phase must leave the `README` with how to run, what is ready, the limitations and the tests.

## 19. BACKLOG BY SYSTEM (ORDER FOR THE AGENT)

**P0 — required for the game to exist:** deterministic loop; a map with obstacles; movement; selection and commands; zombies with perception; noise; line of sight; combat; hit points and death; stress; objectives and extraction; an essential HUD.

**P1 — complete the experience:** advanced squads; resources; infection; doors and barricades; more maps; debriefing; persistence; tutorial; audio and atmosphere.

**P2 — add depth:** a sector campaign; shelter; supplies; dynamic missions; classes; weather; advanced hordes; difficulty levels.

**P3 — expand without compromising the core:** vehicles; human enemies; complete floors; multiplayer; an editor; a high-level LLM; advanced modding.

## 20. BALANCE RULES AND LOCAL TELEMETRY

- Never make the only difficulty change a higher zombie hit-point total. Vary perception, density, resources and noise tolerance.
- Local metrics per mission: ticks, time, noises emitted, zombies attracted or neutralised, shots, hit rate, wounds, panic events, time paused, distance travelled, objectives.
- A mission must support at least two viable strategies.
- Avoid an unfair invisible spawn next to the group. Spawn zones are defined and auditable in debug.
- Every failure must be explainable by visual information, sound or an event. Remove "random" deaths that have no counterplay.
- Balance changes belong in JSON, not in constants scattered through the code.

## 21. TECHNICAL RISKS AND MITIGATIONS

| Risk | Consequence | Mitigation |
|---|---|---|
| Zombie AI knows the global position | unfair behaviour | per-entity sensors and memory, anti-telepathy tests |
| The pathfinder recalculates per zombie per tick | freezes | cache, a budget, flow fields and staggered replanning |
| Crowd collision | stacked zombies | spatial hash plus local separation |
| Over-random psychology | the player loses agency | thresholds, hysteresis and visible reasons |
| Sprites and HUD tied to logic | hard to evolve | a pure domain and adapters |
| Too many features before the mission | the prototype is never playable | required phases and a vertical slice |
| Global noise attracts the whole map | artificial difficulty | propagation with attenuation and range |
| Exponential spawn growth | the game becomes unplayable | limits, and spawns outside line of sight with a cooldown |
| A partial save restores a different state | lost progress | a full snapshot of the RNG and cooldowns |
| Reuse of protected assets | legal risk | original assets and a licence audit |

## 22. MANUAL VALIDATION SCRIPT (PLAYTEST)

1. Open `http://localhost:5173` and start `A Última Farmácia`.
2. Select Alfa, issue a sneak order along a covered path, and observe lower noise.
3. Select Bravo and sprint near zombies, and observe a stronger acoustic reaction.
4. Fire once and check the noise, the spent round and a zombie alert inside the effective radius.
5. Enter an area with many infected and observe stress and possible panic.
6. Pause, issue an order, and confirm the world is stopped; resume and confirm the order.
7. Go around a wall. No entity may cross a blocked tile.
8. Interact with the cabinet, free the civilian, and lead her physically to extraction.
9. Hold the area for 20 simulated seconds and complete the objective.
10. Check the debriefing and save; reload and compare the expected state.

## 23. EXECUTION PROMPT FOR THE AGENT

> Implement the Dead Sector project from this specification in full. Start at **Phase 0** and advance incrementally through **Phase 4**, prioritising a vertical slice that is actually playable. Use TypeScript, Phaser, Vite and Vitest. Keep the tactical engine isolated from rendering, use a fixed 100 ms tick and a seeded RNG. Implement squad orders, line of sight, fog of war, an acoustic field with obstacles, the infected state machine, combat, stress, leadership, the pharmacy mission and extraction. Write tests for the fundamental rules and a smoke end-to-end test. Avoid servers and paid dependencies. Do not copy resources, maps, interface or code from existing games. Each step must include the commands to run, the tests, a verifiable visual result and real remaining work. Do not call a placeholder done. If an architectural decision becomes expensive, document a simple alternative and prioritise an executable game.

## 24. ANALYSIS REFERENCES (PUBLIC SOURCES)

These are sources for the reference mechanics. They are **not permission to reuse protected content**:

- Microsoft / Close Combat II: A Bridge Too Far — manual covering per-unit orders, movement, terrain, cover, morale and campaigns: https://manualmachine.com/gamespc/closecombatiiabridgetoofar/1118356-user-manual/
- Matrix Games / Close Combat: Gateway to Caen — manual covering individual line of sight, suppression, soldiers and combat decisions: https://manualzz.com/doc/34356817/matrix-games-close-combat--gateway-to-caen-user-manual
- Matrix Games / Close Combat: The Bloody First — official series description and the pausable tactical mode: https://www.matrixgames.com/game/close-combat-the-bloody-first

## 25. VERTICAL-SLICE DEFINITION OF DONE

The first milestone that can actually be demonstrated is done **only if**:

- The player can start and finish the mission without editing code.
- Two teams of four humans answer collective orders and do not walk through walls.
- Each survivor has hit points, ammunition, stress, perception and individual behaviour under threat.
- Zombies wander, investigate sound, pursue what they see, attack in range and lose contact correctly.
- Sound crosses the scene with attenuation and materially changes the best strategy.
- There is limited vision, fog of war and information that is not omniscient.
- Shots spend ammunition, make sound and can kill. Zombies can wound and kill.
- The team can collect medicine, rescue the civilian and complete extraction.
- There is pause and resume, a working HUD, victory, defeat, debriefing and save/load.
- The critical automated tests and the production build pass.
- Every asset is original or licensed, and the project can be run locally from clear instructions.

**Long-term vision:** the game's identity comes from the clash between human tactical reason and the emergent pressure of the hordes. The player's story is a consequence of the system.
