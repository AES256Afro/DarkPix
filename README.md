# DarkPix

DarkPix is a browser-playable, first-person pixel dungeon extraction crawler. Enter the Crypt of the Pale Toll with a persistent class, risk equipment from your stash, fight through monsters and a rival delver, loot what you can carry, and unlock a blue passage before the dark closes in.

Play the current BigBox build at [ne-gro.com](https://ne-gro.com/).

## Play the slice

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:4173` on a desktop browser. Click **Enter the Crypt** to bind the mouse.

### Controls

| Input | Action |
| --- | --- |
| `W A S D` | Move |
| Mouse | Look and set attack direction |
| Left mouse | Strike or cast |
| Right mouse | Guard or raise a ward |
| `Q` | Use the class active ability |
| `Shift` | Sprint |
| `E` | Loot, search, rest, or hold to extract |
| `F` | Use the first carried consumable that can help |
| `G` | Drop the least valuable unsecured haul item |
| `R` | Hold at an awakened passage to descend red |
| `T` | Hood or unhood the torch |
| `Escape` | Release the cursor and pause |

Right-click guarding suppresses the browser context menu while the raid canvas is active. Inputs pressed on the pause overlay are discarded until the cursor is rebound. The pause overlay also offers a two-step abandon action; confirming it counts as a death and forfeits equipped gear and unsecured loot.

Moving the mouse vertically before a melee strike selects an overhead attack. Horizontal movement selects a sweep. A centered motion selects a thrust. Headshots amplify damage; non-magical sweep hits trade damage for a permanent cripple against non-boss threats. Enemies visibly draw back before committing to a strike, so sidestepping and last-moment guards matter. A struck threat briefly reveals its vigor and combat state above the crosshair. Sustained guards drain stamina and break at zero; they protect only the forward guard cone, so flanking attacks bypass them. The Vanguard can rally vigor and stamina, the Cutpurse can break distant pursuit with Smoke Step, the Hexbound can trade vigor for spell memory, the Reaver can sacrifice vigor for a six-second Blood Rage, and the Ranger can enter a seven-second Quickdraw. Every active has a visible cooldown. Resting requires an uninterrupted hold and alerts nearby threats.

Light is tactical. Hooding the torch shortens passive enemy detection range, while unhooding it restores the player spotlight. Walls block passive acquisition and attacks, but alerted enemies route through the dungeon to pursue prey they can no longer see. Threats have physical spacing and slide along corners instead of stacking into one hitbox. Four pressure-plate spike traps punish careless routes, interrupt threats, and can award normal kill drops when enemies are baited across them. The Tollkeeper takes reduced trap damage.

Mouse sensitivity, 60 to 95 degree field of view, crypt brightness, audio, reduced camera motion, and stash order can be adjusted from the lobby. Progress and preferences stay local to the browser, with a versioned JSON export/import backup in the settings panel. Each raid begins with an eight-second warding veil so the player can orient before passive enemies acquire them. Attacking during the veil still alerts the target. Pausing suspends the dungeon drone, and an unavailable or rejected pointer lock leaves the raid safely paused instead of consuming inputs.

## Extraction loop

- Choose Vanguard, Cutpurse, Hexbound, Reaver, or Ranger. Class XP and levels persist across every outcome.
- Escape once to unlock the High Toll contract. Its 50g fee is consumed on entry, threats gain health, damage, and speed, loot rolls gain a substantial depth bonus, and all class XP is multiplied by 1.35. Death still removes carried gear, never the persistent character.
- The first successful High Toll extraction records a persistent Deeper Wager victory and pays a one-time 200g contract bounty. Standard escapes and failed High Toll runs never advance it.
- Pack up to two stash items. One weapon and one armor piece can contribute power; consumables occupy any open slot. Armor power adds vigor but imposes up to 18% encumbrance, offset by movement enchantments, and the lobby previews the final pace. Packed items are lost if the delver dies.
- Defeat two Ossuary Wardens and take their sigils.
- Follow the contract wayfinder toward the nearest living Warden, loose sigil, or unlocked blue passage.
- Search four coffers across an interconnected dungeon while fighting monsters and one AI rival delver. One deep coffer carries subtle teeth and wakes as a mimic instead of surrendering loot; killing it produces a depth-weighted drop.
- Carry up to eight ordinary haul items. Contract sigils stay in a separate pouch; when the haul is full, `G` drops the least valuable unsecured item so a better find can take its place.
- Break the AI rival's sightline or react to its telegraphed throwing knife; a fresh guard can parry the projectile. While unaware of you, the rival can scavenge up to two loose non-sigil items. Its visible satchel and every stolen relic spill back into the dungeon if it is killed.
- Find the unmarked blood reliquary in the southwest dead chamber, if the extra loot is worth 18 vigor and the noise it makes.
- Survive the Tollkeeper in the extraction chamber. Its heavy attacks cannot be parried, it telegraphs a mid-range chain lash that can be guarded or broken by cover and distance, it enrages below half vigor, and it always drops a named Rare-or-better chain trophy.
- Killing the first Tollkeeper awakens a red breach in the extraction arch. Hold `E` to bank the run or hold `R` to abandon the safe exit and enter the Ashen Depth: a 135-second second floor with no resource reset, fresh wardens, stronger threats, a new closing darkness, +0.16 loot depth, and extra class XP even if the deeper run fails.
- Hold `E` while facing the blue passage in the southeast reliquary to bank the haul. Looking away or taking damage breaks the extraction channel.
- Read the shrinking safe reach in the raid HUD. Its center migrates southeast so the final refuge includes the extraction chamber.
- Death discards all raid loot and equipped risk items. The player can always return with base class equipment.
- Spend gold at the Ironmonger on consumables and gear. Successful extracts unlock Uncommon stock and, after three returns, a Rare weapon. Draughts and bandages restore vigor, smoked roots also restore stamina, bluewax candles can rekindle a hooded torch, and camp embers restore stamina plus Hexbound spell memory. Packed remedies are consumed when used, and a full stash sends extraction overflow to the porter for an automatic half-value sale.
- Rare-or-better, crafted, and currently packed items require a second explicit confirmation before they can be sold from the stash.
- Rolled and merchant gear modifiers directly affect edge damage, armor mitigation, maximum vigor, movement, interaction speed, or damage against undead threats. Persisted modifiers, item power, item value, progression counters, and coin totals are bounded before they affect runtime stats or the economy.
- Forge a recovered Tollkeeper chain into the Epic Chainbreaker's ward, a Saint's broken seal into the Rare Saintless edge, or a Sepulcher ruby into the Epic Ruby cantor. Every recipe replaces its material in place, so it remains safe at the stash limit.
- The first successful extraction pays a one-time 100g contract bounty. The first raid that kills the Tollkeeper and still extracts pays a separate 150g bounty and records a persistent boss victory. Class levels grant bounded veterancy bonuses through level seven plus discipline-specific perks at levels 2, 4, and 6.

The current vertical slice simulates the PvP side with a hostile AI rival. Networked solo, duo, and trio matchmaking, proximity voice, merchant reputation, crafting, and additional maps are future systems, not part of this build.

## Validation

```bash
npm test
npm run build
```

The automated suite covers loot rarity, deterministic item creation, profile migration, XP persistence, stash loss on death, authoritative extraction settlement, consumed-item slot recovery, merchant guardrails, persisted-text encoding, preference normalization, deliberate interaction targeting, collision integrity, sightlines, wayfinding, migrating darkness, pursuit routes around walls, pathfinding from the player start to every contract-critical location, and deduplicated GPU resource cleanup between raids.

## Production deployment

The repository includes a hardened Docker and Nginx deployment for BigBox. It binds only to `127.0.0.1:8092`, joins the existing private Cloudflare Tunnel network without copying or exposing the tunnel token, and requires the public version endpoint to match the deployed commit. See [DEPLOY_BIGBOX.md](./DEPLOY_BIGBOX.md) for health checks, Cloudflare routes, updates, and rollback.

## Technology

- Three.js for the low-resolution 3D dungeon and first-person runtime
- TypeScript and Vite for the browser application
- Lazy-loaded, separately cached 3D runtime so the lobby arrives before the dungeon engine
- Bounded adaptive internal resolution that responds gradually to sustained GPU frame pressure
- Year-long immutable caching for every content-hashed production asset
- Canvas-generated nearest-neighbor dungeon textures
- Web Audio synthesis for the dungeon drone and action feedback
- Local storage for class progression, gold, and stash persistence
- Safe WebGL context-loss pause and click-to-resume recovery during a raid
- Focus-loss input clearing and allocation-light enemy steering for steadier repeated play

The title-screen pixel illustration was generated specifically for DarkPix with OpenAI image generation. The dungeon geometry, textures, lighting, enemies, animation, combat, and interface are rendered from project code.
