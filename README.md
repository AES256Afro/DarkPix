# DarkPix

DarkPix is a browser-playable, first-person pixel dungeon extraction crawler. Enter the Crypt of the Pale Toll with a persistent class, risk equipment from your stash, fight through monsters and a rival delver, loot what you can carry, and unlock a blue passage before the dark closes in.

Play the current BigBox build at [ne-gro.com](https://ne-gro.com/).

See [MILESTONES.md](MILESTONES.md) for the verified public-slice status, completed exit criteria, and the explicit boundary between the current AI rival and future server-authoritative human PvPvE.

The production build is installable as a standalone web app. After one complete online visit, its lobby and loaded game assets can reopen offline. Commit-scoped worker URLs and origin CDN controls prevent stale update scripts. Each release is staged in its own cache, so a partial install leaves the prior offline shell intact. Updates wait for player consent and refuse to reload while a raid is active.

## Play the slice

```bash
npm install
npm run dev
```

The release gate uses `npm test`, `npm run build`, and `npm run test:budget`. The budget caps total compressed JavaScript at 185 KiB, compressed CSS at 12 KiB, and entry HTML at 5 KiB.

Open `http://127.0.0.1:4173` on a desktop browser. Click **Enter the Crypt** to bind the mouse.

### Controls

| Input | Action |
| --- | --- |
| `W A S D` | Move |
| Mouse | Look and set attack direction |
| Left mouse | Strike or cast |
| Right mouse | Guard or raise a ward |
| `Q` | Use the class active ability |
| `1 / 2` | Select Ash Bolt or Frost Hex as Hexbound |
| `Shift` | Sprint |
| `Control` | Hold to crouch, move quietly, and reduce passive detection |
| `Space` | Stamina-costed sidestep in the held movement direction, or backward while stationary |
| `E` | Loot, search, rest, or hold to extract |
| `F` | Begin using the selected recovered or packed consumable |
| `C` | Cycle the selected consumable |
| `V` | Throw the selected recovered or packed throwing weapon |
| `B` | Cycle the selected throwing weapon |
| `G` | Drop the least valuable unsecured haul item |
| `R` | Hold at an awakened passage to descend red |
| `T` | Hood or unhood the torch |
| `Escape` | Release the cursor and pause |

Right-click guarding suppresses the browser context menu while the raid canvas is active. Inputs pressed on the pause overlay are discarded until the cursor is rebound. The pause overlay itemizes exact vigor, stamina, spell memory, torch fuel, passage state, campfire availability, packed risk, unsecured haul, reserves, total haul value, and the item `G` would discard. It also offers a two-step abandon action; confirming it counts as a death and forfeits equipped gear and unsecured loot.

Moving the mouse vertically before a melee strike selects an overhead attack. Horizontal movement selects a sweep. A centered motion selects a thrust. The combat HUD shows the selected strike's exact stamina cost before input and changes to a danger-state `NEED` warning when the current reserve cannot pay it. Headshots amplify damage; non-magical sweep hits trade damage for a permanent cripple against non-boss threats. Strikes consume class-weighted stamina, with overheads costing melee disciplines more than thrusts, so an exhausted delver cannot attack through an incoming punish. Stamina does not regenerate during attack or sidestep recovery and returns more slowly while walking than while standing. Enemies visibly draw back before committing to a strike, so a short, collision-checked sidestep or a last-moment guard matters. Sidesteps have no invulnerability, consume class-weighted stamina, and cannot cancel attack recovery. A fresh forward guard parries non-boss attacks; melee disciplines then have 1.5 seconds to spend a single +25% riposte, while bows, spells, and thrown weapons cannot use the bonus. A struck threat briefly reveals its vigor and combat state above the crosshair, while incoming physical damage marks its direction relative to the player's facing. Sustained guards drain stamina and protect only the forward guard cone, so flanking attacks bypass them. A guard depleted to zero now causes a visible class-tuned stagger that prevents guarding, attacking, sidestepping, channeling, and stamina recovery while movement is slowed. The Vanguard recovers its footing fastest, while the Hexbound is punished longest. Remedies take 0.75 to 1.35 seconds to apply, slow movement, occupy combat and interaction inputs, pause natural stamina recovery, and are interrupted by damage without spending the item. Their effect and packed-item consumption occur only after treatment completes. The Vanguard can rally vigor and stamina, the Cutpurse can break distant pursuit with Smoke Step, the Hexbound can trade vigor for spell memory, the Reaver can sacrifice vigor for a six-second Blood Rage, the Ranger can enter a seven-second Quickdraw, the Cleric can invoke Sanctuary to recover while searing nearby crypt threats, the Shapeshifter can gain eight seconds of feral damage, cadence, and movement, and the Minstrel can recover stamina while staggering visible nearby threats with Rousing Discord. Hexbound players can switch between full-damage Ash Bolt and a weaker Frost Hex that cripples non-boss threats; both consume the shared memory pool. Every active has a visible cooldown. Resting, opening hidden stone, descending, and extracting require an uninterrupted stationary hold. Movement, guard, attack recovery, guard-break recovery, damage, losing the target, or releasing the key resets the channel with an explicit reason.

Light is tactical. The delver torch begins with 90 seconds of fuel and burns only while unhooded. Hooding it preserves fuel and shortens passive enemy detection range; unhooding restores the player spotlight while fuel remains. Holding `Control` lowers the viewpoint, prevents sprinting, slows movement, and reduces passive detection another 34%, creating a deliberate route to the Cutpurse's unalerted ambush bonus. A bluewax candle adds 45 seconds, and the one-use campfire completely refuels and relights it. Fuel does not reset on red descent. Walls block passive acquisition and attacks, but alerted enemies route through the dungeon to pursue prey they can no longer see. Threats have physical spacing and slide along corners instead of stacking into one hitbox. Each raid chooses one of two safe trap formations: four pressure-plate spike traps punish careless routes, while two wall ports glow before firing across marked lanes. Both trap families can interrupt threats and award normal kill drops when enemies are baited through them. A forward guard can blunt a dart, and the Tollkeeper takes reduced trap damage.

The one-use campfire alternates between the northwest and northeast refuge rooms as part of the bounded raid seed. Resting still restores vigor, stamina, and spell memory while alerting every nearby threat. Before extraction opens, the compass temporarily points to that fire when a Hexbound exhausts spell memory or any delver reaches critical vigor or stamina; loose sigils and an open passage retain priority.

Mouse sensitivity, inverted vertical look, 60 to 95 degree field of view, crosshair size, crypt brightness, master volume, audio mute, reduced camera motion, reduced flashes, high-contrast HUD, and stash order can be adjusted from the lobby. On a first visit with no saved settings, the game honors operating-system reduced-motion and high-contrast signals; reduced motion also defaults reduced flashes on. Explicit stored and imported choices remain authoritative afterward. Progress and preferences stay local to the browser, with a versioned JSON export/import backup in the settings panel. Rarity never depends on color alone: stash, merchant, and verdict rows use ordered `I` through `VI` rank marks, while Uncommon through Legendary loose loot uses distinct 3D silhouettes. Attack windups, missiles, chain lashes, dart lanes, and landed impacts use directional shape-plus-text HUD cues in an assistive live region, so their warning does not depend on audio alone. Each raid begins with an eight-second warding veil so the player can orient before passive enemies acquire them. Attacking during the veil still alerts the target. Pausing suspends the dungeon drone, and an unavailable or rejected pointer lock leaves the raid safely paused instead of consuming inputs.

## Extraction loop

- Choose Vanguard, Cutpurse, Hexbound, Reaver, Ranger, Cleric, Shapeshifter, or Minstrel. Class XP and levels persist across every outcome outside the optional Iron Soul contract.
- Escape once to unlock the High Toll contract. Its 50g fee is consumed on entry, threats gain health, damage, and speed, loot rolls gain a substantial depth bonus, and all class XP is multiplied by 1.35. Death still removes carried gear, never the persistent character.
- Complete one Ashen Return to unlock Iron Soul. Its 100g entry fee, stronger threats, +0.20 loot depth, and +75% XP trade against true hardcore stakes: any death or abandonment resets the selected discipline's class XP to zero in addition to losing gear and haul.
- The first successful High Toll extraction records a persistent Deeper Wager victory and pays a one-time 200g contract bounty. Standard escapes and failed High Toll runs never advance it.
- Three consecutive successful returns complete the Ironmonger's survival oath and pay a one-time 300g bounty. Any death, darkness loss, or abandonment breaks the current chain before the next extraction.
- Pack up to two stash items. One weapon and one armor piece can contribute power; consumables and throwing weapons occupy any open slot. Armor power adds vigor but imposes up to 18% encumbrance, offset by movement enchantments, and the lobby previews the final pace. Packed items are lost if the delver dies.
- Defeat two Ossuary Wardens and take their sigils.
- Follow the contract wayfinder toward the nearest living Warden, loose sigil, or unlocked blue passage.
- Search four coffers across an interconnected dungeon while fighting monsters and one AI rival delver. Each raid mirrors the coffer and threat formation between two path-validated orientations, so memorized masonry does not reveal every encounter. One deep coffer carries subtle teeth and wakes as a mimic instead of surrendering loot; killing it produces a depth-weighted drop.
- Carry up to eight ordinary haul items. Contract sigils stay in a separate pouch; when the haul is full, `G` drops the least valuable unsecured item so a better find can take its place.
- Read each targeted pickup against the packed weapon or armor slot before taking it; remedies and throwables show their exact effect, while treasure shows its settlement value.
- Each raid seeds a guildless rival as either a knife skirmisher that retreats to throwing range or a shielded marauder with more vigor and heavier close blows. The second floor uses the opposite archetype. Break the skirmisher's sightline or parry its telegraphed knife; make the marauder commit before counterattacking. An unengaged rival can approach and clash with nearby non-boss crypt threats; dungeon-caused defeats drop loot without crediting the player's kills, XP, bestiary, or escrow. While unaware of you, either rival can scavenge up to two loose non-sigil items. Its visible satchel and every stolen relic spill back into the dungeon if it is killed. Once a passage opens, a loaded rival abandons combat to path toward it and visibly channels a 1.6-second extraction. Damage resets that channel; failure to stop it removes the rival and its stolen satchel without awarding a kill.
- Trace the subtle mortar seam in the southwest dead chamber to open a false wall. The hidden blood reliquary beyond trades 18 vigor and a great deal of noise for extra loot.
- Survive the Tollkeeper in the extraction chamber. Its heavy attacks cannot be parried, it telegraphs a mid-range chain lash that can be guarded or broken by cover and distance, and it always drops a named Rare-or-better chain trophy. Below half vigor, its marked chain ring leaves safe ground only close to the keeper or beyond the outer edge; a forward guard can absorb the ring at a heavy stamina cost.
- Killing the first Tollkeeper awakens a red breach in the extraction arch. Hold `E` to bank the run or hold `R` to abandon the safe exit and enter the Ashen Depth: a 135-second second floor with no resource reset, three fresh ash coffers including a mimic, a new rival scavenger, stronger threats, a new closing darkness, +0.16 loot depth, and extra class XP even if the deeper run fails. Four staggered ash vents mark their blast rings for 0.9 seconds before erupting; fire ignores armor, interrupts channels, and can also scorch monsters or the rival. The Ash Tollkeeper uses its marked chain annulus from full vigor, repeats it faster than the first keeper, and tightens the cadence again below half vigor. The first successful return from that floor records a persistent Ashen Return and pays a one-time 250g contract bounty.
- Hold `E` while facing the blue passage at one of two southern reliquary sites to bank the haul. The chosen site changes each raid; looking away or taking damage breaks the extraction channel.
- The southwest blood reliquary offers one single-use bargain. Press `E` to pay 18 vigor for two strong relic rolls and alert nearby threats, or press `R` to burn the least valuable ordinary piece of unsecured haul for one deeper roll. Contract sigils can never be sacrificed.
- Read the shrinking safe reach and passage wayfinder in the raid HUD. The wayfinder prioritizes loose sigils and an open passage, then points to an unused campfire when vigor, stamina, spell memory, or torch fuel becomes critical. When the dark catches you, the contract panel reports excess distance plus a world-compass bearing back to safety. The darkness center migrates toward that raid's chosen extraction chamber so its final refuge remains barely viable.
- Death discards all raid loot and equipped risk items. The player can always return with base class equipment.
- The lobby prices packed items, entry fees, and any Iron Soul class XP before descent. Every verdict then itemizes returned, consumed, banked, porter-sold, or lost items; breaks credited kills down by threat type; explains presence, kill, extraction, depth, and contract XP; compares the loadout value placed at risk with the final net wealth change after fees and supplies; and suggests the next sensible loadout decision. Boss and Ashen claims require bounded typed boss-kill evidence before they can change rewards, veterancy, or journal depth.
- Every randomized raid receives a compact `PT-00` through `PT-1F` contract seal. The live HUD, pause ledger, verdict, and persistent journal preserve that seal so a specific one of the 32 bounded layouts can be identified in a bug report. The lobby preserves the ten most recent contract verdicts with class, mode, floor, outcome, time, kills, gold, XP, lost gear, Tollkeeper status, and any recorded seal. Older entries roll off without bloating the exported save.
- Starting a raid writes a local escrow journal before charging the profile, then checkpoints it after kills and red descent. The live contract panel reports whether that journal is secure and keeps a visible `do not refresh` warning if browser storage rejects an update. The journal preserves the layout seed plus both total and per-threat kills, so interrupted raids retain their contract seal, earned XP, bestiary pages, and guild-ledger progress. Paid-contract escrow records the authoritative before/after balance, so a refresh between those storage writes still reconciles the entry fee exactly once. Closing or refreshing the page before a verdict settles that journal as an abandonment on the next load, so reloads cannot bypass gear loss or Iron Soul consequences. A failed renderer start refunds and saves the fee before clearing escrow. A completed, refunded, or recovered verdict is saved before its escrow is cleared; failed browser storage leaves the journal intact for retry. Settlement maps malformed class, mode, or outcome identity to the saved class, Standard rules, and abandonment; rejects non-array loot claims; caps packed risk at two unique item IDs; accepts consumed IDs only from that packed set; and recalculates coin from normalized extracted treasure instead of trusting a result claim.
- Spend gold at the Ironmonger on consumables, throwing knives, and gear. A 20g bluewax candle is always available, so torch preparation does not depend on a random dungeon roll. Reputation is derived from successful returns: Known standing unlocks Uncommon stock and the Saintless edge recipe at one extraction, Trusted unlocks a Rare weapon and the Chainbreaker's ward recipe at three, and Sworn unlocks Epic stock plus the Ruby cantor recipe at six. Recipe locks are enforced by the profile service as well as the lobby. The lobby shows exact progress to the next stock tier. Draughts and bandages restore vigor, smoked roots also restore stamina, bluewax candles restore torch fuel, and camp embers restore stamina plus Hexbound spell memory. Recovered or packed throwing weapons are finite, and a miss still consumes one. Packed remedies and knives are consumed when used, while a full stash sends extraction overflow to the porter for an automatic half-value sale. Treasure coin credit is derived from the current unsecured haul, so dropping or exchanging a relic removes its credit automatically.
- Rare-or-better, crafted, and currently packed items require a second explicit confirmation before they can be sold from the stash.
- Rolled and merchant gear modifiers directly affect edge damage, armor mitigation, maximum vigor, movement, interaction speed, or damage against undead threats. Persisted modifiers, item power, item value, progression counters, and coin totals are bounded before they affect runtime stats or the economy.
- Forge a recovered Tollkeeper chain into the Epic Chainbreaker's ward, a Saint's broken seal into the Rare Saintless edge, or a Sepulcher ruby into the Epic Ruby cantor. Every recipe replaces its material in place, so it remains safe at the stash limit.
- The first successful extraction pays a one-time 100g contract bounty. The first raid that kills the Tollkeeper and still extracts pays a separate 150g bounty and records a persistent boss victory. The contract journal derives lifetime raid count, extraction rate, the current survival streak, and the best gold return among its last ten entries. The survival-oath bounty is settled from that same newest-first journal. Class levels grant bounded veterancy bonuses through level seven plus discipline-specific perks at levels 2, 4, and 6.
- The Ironmonger posts one UTC-day commission at a time. Its deterministic target rotates among skeletons, crawlers, wardens, mimics, and rival delvers; meeting the target in one raid pays only on extraction and only once for that day.
- The bestiary persists bounded kills by threat type across every outcome. Twelve cryptborn kills and three rival-delver kills complete separate guild ledgers, each paid once on a later successful extraction.
- Defeating a threat once reveals its name, persistent kill count, and a tactical note in the lobby bestiary; undiscovered pages remain obscured.

The current vertical slice simulates the PvP side with a hostile AI rival. Server-authoritative solo, duo, and trio matchmaking, proximity voice, and additional maps are future systems, not part of this build.

## Validation

```bash
npm test
npm run build
```

The automated release gate covers dependency advisories, loot rarity, deterministic item creation, profile migration, XP persistence, stash loss on death, authoritative extraction settlement, consumed-item slot recovery, merchant guardrails, persisted-text encoding, preference normalization, deliberate interaction targeting, collision integrity, sightlines, wayfinding, migrating darkness, pursuit routes around walls, pathfinding from the player start to every contract-critical location, build-size budgets, and deduplicated GPU resource cleanup between raids.

## Production deployment

The repository includes a hardened Docker and Nginx deployment for BigBox. It binds only to `127.0.0.1:8092`, joins the existing private Cloudflare Tunnel network without copying or exposing the tunnel token, and requires each public route to expose non-cacheable live health plus a version endpoint matching the deployed commit. Host-scoped one-year HSTS enforces HTTPS without making assumptions about unrelated subdomains, and both CI and the release script verify the header. See [DEPLOY_BIGBOX.md](./DEPLOY_BIGBOX.md) for health checks, Cloudflare routes, updates, and rollback.

## Technology

- Three.js for the low-resolution 3D dungeon and first-person runtime
- TypeScript and Vite for the browser application
- Lazy-loaded, separately cached 3D runtime so the lobby arrives before the dungeon engine
- Bounded adaptive internal resolution that responds gradually to sustained GPU frame pressure
- Year-long immutable caching for every content-hashed production asset
- Canvas-generated nearest-neighbor dungeon textures
- Web Audio synthesis for the dungeon drone and action feedback
- Consent-driven service-worker updates and a network-first offline shell
- Local storage for class progression, gold, and stash persistence
- Safe WebGL context-loss pause and click-to-resume recovery during a raid
- Focus-loss input clearing and allocation-light enemy steering for steadier repeated play

The title-screen pixel illustration was generated specifically for DarkPix with OpenAI image generation. The dungeon geometry, textures, lighting, enemies, animation, combat, and interface are rendered from project code.
