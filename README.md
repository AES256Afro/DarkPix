# DarkPix

DarkPix is a browser-playable, first-person pixel dungeon extraction crawler. Enter the Crypt of the Pale Toll with a persistent class, risk equipment from your stash, fight through monsters and a rival delver, loot what you can carry, and unlock a blue passage before the dark closes in.

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
| `Shift` | Sprint |
| `E` | Loot, search, rest, or hold to extract |
| `F` | Use a recovered consumable |
| `Escape` | Release the cursor and pause |

Moving the mouse vertically before a strike selects an overhead attack. Horizontal movement selects a sweep. A centered motion selects a thrust. Vanguard blocks can parry during the opening guard window. Cutpurse attacks deal extra damage against unaware targets. Hexbound casts six ranged ash bolts and restores spell memory once at the campfire.

## Extraction loop

- Choose Vanguard, Cutpurse, or Hexbound. Class XP and levels persist across every outcome.
- Pack up to two stash items. Their power applies in the raid, but they are lost if the delver dies.
- Defeat two Ossuary Wardens and take their sigils.
- Search four coffers across an interconnected dungeon while fighting monsters and one AI rival delver.
- Hold `E` at the blue passage in the southeast reliquary to bank the haul.
- Death discards all raid loot and equipped risk items. The player can always return with base class equipment.

The current vertical slice simulates the PvP side with a hostile AI rival. Networked solo, duo, and trio matchmaking, proximity voice, merchants, crafting, and additional maps are future systems, not part of this build.

## Validation

```bash
npm test
npm run build
```

The automated suite covers loot rarity, deterministic item creation, profile migration, XP persistence, stash loss on death, and successful extraction banking.

## Technology

- Three.js for the low-resolution 3D dungeon and first-person runtime
- TypeScript and Vite for the browser application
- Canvas-generated nearest-neighbor dungeon textures
- Web Audio synthesis for the dungeon drone and action feedback
- Local storage for class progression, gold, and stash persistence

The title-screen pixel illustration was generated specifically for DarkPix with OpenAI image generation. The dungeon geometry, textures, lighting, enemies, animation, combat, and interface are rendered from project code.
