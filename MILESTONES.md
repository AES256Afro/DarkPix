# DarkPix milestone map

This map separates the playable public vertical slice from the larger online extraction game. A milestone is complete only when its code, automated checks, documentation, Git history, BigBox deployment, and public release identity are all verified.

## Current public boundary

The live build is a solo, first-person extraction crawler with an AI-controlled rival delver. The rival can use two combat archetypes, scavenge loose loot, and return stolen items when defeated. It creates PvP-like pressure, but it is not a human opponent.

Human PvP, parties, matchmaking, proximity voice, and server-authoritative combat are not implemented. The browser currently owns raid simulation and persistent profile state. Do not describe the current release as online multiplayer or server-authoritative PvPvE.

## M0: Playable extraction vertical slice

Status: Complete

- First-person movement, pixel-scaled 3D rendering, stamina-costed directional melee with recovery windows, ranged weapons, magic, guards, parries, ripostes, sidesteps, and class abilities
- Eight persistent disciplines with levels, perks, equipment, interruptible treatment remedies, throwing weapons, and local preferences
- Loot capacity, item rarity, randomized modifiers, stash risk, merchants, rotating daily commissions, reputation-gated crafting, save backup, and authoritative local raid settlement
- Closing darkness, two extraction sites, red descent, two floors, traps, second-floor ash vents, mimics, hidden room, campfire, blood reliquary, bosses, and loot-scavenging AI rival delvers that can race for extraction
- Standard, High Toll, and Iron Soul contracts with distinct loss and reward rules

Exit evidence: automated domain tests, production TypeScript build, container health, and exact public release checks.

## M1: Persistence and progression integrity

Status: Complete for local-first play

- Risked equipment leaves the stash only after a failed verdict
- Active-raid escrow settles refreshes and interrupted tabs as abandonment, and clears only after the verdict is durably saved
- Consumed packed items remain consumed after extraction or failure
- Treasure coin credit is derived from current haul contents instead of a separate mutable raid counter
- Pre-raid and verdict value ledgers derive loadout risk, fees, Iron Soul XP exposure, and net wealth change from actual contract state
- Version 13 migrates older profiles into a bounded single-day commission claim without changing prior progress
- Class XP, contracts, bestiary ledgers, survival streaks, raid history, settings, and backup import/export survive compatible profile migrations
- Iron Soul failure clears the selected discipline's XP while preserving the rest of the profile

Exit evidence: migration, settlement, escrow, economy, backup, and malformed-save tests.

## M2: Encounter readability and bounded variation

Status: Complete for the current map

- Encounter mirroring, extraction-site selection, trap formations, rival archetypes, and campfire placement produce 32 bounded raid configurations with stable `PT-00` through `PT-1F` contract seals
- Contract-critical locations remain reachable in topology tests
- Threat windups, directional pre-hit and impact markers, guard cone, chain telegraphs, safe annulus, darkness bearing, channel interruption reasons, crosshair scaling, rarity rank marks, and loose-loot silhouettes expose actionable state
- The Ash Tollkeeper begins its annulus phase at full vigor and uses a tighter second-floor cadence

Exit evidence: topology, collision, sightline, pathfinding, variation, combat-rule, and depth tests.

## M3: Public BigBox release path

Status: Complete

- Unprivileged, read-only Nginx container on the private tunnel network
- Loopback-only host health endpoint
- No inbound router ports or public origin address
- Content security, framing, MIME, referrer, permissions, opener, resource, and transport headers
- Immutable hashed assets with non-cacheable release identity and service worker
- CI-enforced compressed JavaScript, CSS, and entry-HTML performance budgets
- CI rejects high or critical dependency advisories before building the release image
- Every deploy verifies non-cacheable live health and the exact commit through both `ne-gro.com` and `www.ne-gro.com`

Exit evidence: Docker build and smoke checks in CI plus container, host, apex, and `www` gates during deployment.

## M4: Server-authoritative human PvPvE

Status: Not started

Required exit criteria:

- Match service owns player positions, health, stamina, inventory, loot ownership, AI state, zone state, combat resolution, death, and extraction
- Short-lived authenticated session identity with reconnect rules and no trust in client damage or inventory claims
- Solo, duo, and trio party formation with explicit friendly-fire behavior
- Bounded state replication and interpolation for multiple human delvers
- Server-side validation for reach, sightline, attack cadence, movement, item use, pickup, drop, and portal channels
- Disconnect, crash, and timeout settlement integrated with the raid escrow and loss model
- Load, latency, reconnect, duplicate-message, and adversarial protocol tests
- A public canary environment before the persistent profile is allowed to consume online match verdicts

## M5: Social and content expansion

Status: Planned after M4

- Party discovery and invitations
- Moderated proximity voice with mute, report, and consent controls
- Additional dungeon layouts, boss families, quests, crafting paths, and rotating merchant commissions
- Observability for matchmaking health, disconnect rate, match completion, extraction balance, and economy inflation

These items should not block continued improvements to the safe solo slice, but none should be presented as complete until its own exit evidence exists.
