# ♻ Urban Scrap: Survivor

A single-player **urban mining & recycling survival sim** for the web (built for CrazyGames).
You lost everything — all you have is a leaky shelter in the Backstreets, a rickety workbench and $10.
Scavenge the city's trash, recycle it into valuable materials, craft better tools, unlock new districts
and turn a pile of junk into your own recycling company.

Pure HTML5 Canvas + vanilla JS. No build step, no dependencies, no asset files (all graphics and audio are procedural).

## Play locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Core loop

1. **Scavenge** trash bags, dumpsters, appliances, car wrecks, server racks… (press `E`)
2. **Haul** it home — your backpack has a weight limit
3. **Recycle** with machines at your base (shredder, smelter, wire stripper, e-waste bench…). Machines keep working while you explore and sleep
4. **Sell** to Rusty (prices change daily, 🔥 hot item +50%) or fulfil bulk **contracts**
5. **Craft** tools that unlock loot and districts, **build** base upgrades, **fund** life goals
6. **Survive**: hunger, thirst, energy, sickness, weather, toxic air, and stray dogs at night

## Long-term hooks

- 33-step main quest chain that doubles as the tutorial
- 5 districts gated by gear: Backstreets → Old Suburbs → Industrial (bolt cutters) → E-Waste Dump (respirator) → Old Downtown (angle grinder, headlamp)
- 12 tools/gear, 14 base structures, 9 machines with 4 upgrade levels
- 9 skill perks, level-ups
- 20 collectibles in 5 sets, each set grants a permanent bonus
- 6 life goals (phone, license, van fast-travel, workshop…) ending with founding *Urban Scrap Co.*
- Daily: market prices, hot item, 3 contracts, weather, an **Illegal Dump** loot event (★ on the map)
- Real-world **daily login streak** (up to 7 days), offline machine progress (up to 8 in-game hours)
- Night thieves raid unlocked stashes, blueprints unlock as you discover materials

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Move | WASD / Arrows | Left-side joystick |
| Interact / search | E / Enter | ✋ |
| Attack | Space / F / click | 👊 |
| Sprint | Shift | 🏃 (hold) |
| Eat / drink / bandage / energy | 1 / 2 / 3 / 4 | Quick bar |
| Bag / Skills / Journal / Map / Menu | I / K / J / M / Esc | Menu buttons |

English and Turkish (auto-detected, switchable in the menu).

## CrazyGames SDK

`js/sdk.js` wraps SDK v3:
- `loadingStart/Stop` during boot; `gameplayStart/Stop` around every menu, modal and ad (the title screen counts as a menu)
- `happytime` on new districts, level milestones and completed collection sets
- **Midgame** ads at natural breaks only: after a full night's sleep and after passing out (the SDK paces frequency)
- **Rewarded** ads, always opt-in: +50% on the next sale (once per in-game day), or keep your backpack after passing out
- Audio is muted only once an ad actually starts, and follows the platform's `muteAudio` setting, which overrides the in-game toggles
- Language follows `user.systemInfo` locale (Turkish for `tr`, English otherwise) unless the player picked one
- Saves go to the SDK data module and `localStorage`
- Without the SDK (local build, other hosts) the game runs normally and rewarded features are granted for free; on CrazyGames with a blocked SDK, rewards are not granted

Build the upload with `sh promo/build-zip.sh` → `dist/urban-scrap-crazygames.zip` (`index.html` at the zip root, ~80 KB).
Store text, covers, preview videos and screenshots are in `promo/` (regenerate with `promo/capture.js`).

## Code layout

| File | Purpose |
|---|---|
| `js/data.js` | Items, nodes, recipes, machines, districts, collectibles, perks, goals, quests |
| `js/i18n.js` | UI strings (EN / TR) |
| `js/world.js` | Procedural city generation, collision, chunked ground/building renderer |
| `js/game.js` | State, survival simulation, economy, crafting, machines, days, dogs, saving |
| `js/render.js` | Camera, entities, lighting, weather, sprites |
| `js/ui.js` | HUD, minimap, panels, modals |
| `js/input.js`, `js/audio.js`, `js/sdk.js`, `js/main.js` | Input, synthesized audio/music, SDK wrapper, boot |
