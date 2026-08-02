# DarkPix milestone map

This map separates the playable public vertical slice from the larger online extraction game. A milestone is complete only when its code, automated checks, documentation, Git history, BigBox deployment, and public release identity are all verified.

## Current public boundary

The live build is a solo, first-person extraction crawler with an AI-controlled rival delver. The rival can use two combat archetypes, scavenge loose loot, and return stolen items when defeated. It creates PvP-like pressure, but it is not a human opponent.

Human PvP, parties, matchmaking, proximity voice, and server-authoritative combat are not implemented. The browser currently owns raid simulation and persistent profile state. Do not describe the current release as online multiplayer or server-authoritative PvPvE.

## M0: Playable extraction vertical slice

Status: Complete

- First-person movement, crouch stealth, pixel-scaled 3D rendering, confirmed and timeout-bounded pointer-lock resume, stamina-costed direction-locked strikes that resolve at visible mid-swing, collision-swept travel-time arrows, spells, and finite throwing weapons, shared occupied-hand recovery rules, guards, parries, ripostes, sidesteps, class abilities, and an exact paused-raid readiness ledger
- Eight persistent disciplines with levels, perks, equipment, interruptible treatment remedies, throwing weapons, and local preferences
- Loot capacity, item rarity, randomized modifiers, stash risk, dependable light provisions, merchants, one-time stealth bounty, rotating daily commissions, reputation-gated crafting, structurally validated save backup, corrupt-profile recovery export, startup storage readiness, and authoritative local raid settlement
- Closing darkness with an independent damage pulse, finite hoodable torch fuel, two extraction sites, red descent, two floors, traps, second-floor ash vents, mimics, hidden room, campfire, blood reliquary, bosses, and loot-scavenging AI rival delvers that can fight crypt threats or race for extraction
- Standard, High Toll, and Iron Soul contracts with distinct loss and reward rules
- Raid teardown owns and cancels delayed audio and transient visual callbacks before renderer disposal, while a terminal verdict hands off in a microtask before background timer suspension can expose it as abandonment
- Offline fallbacks and runtime writes stay inside the active release's bounded shell and hashed-asset paths, quoted build imports and CSS asset URLs are walked recursively, cache-write failure preserves valid network responses, incomplete install graphs are rejected and cleaned, and the worker script bypasses runtime caching
- Every HTML shell identifies its build; workers reject a mismatched install shell and never overwrite an intact older offline fallback with newer navigation HTML before activation

Exit evidence: automated domain tests, production TypeScript build, container health, and exact public release checks.

## M1: Persistence and progression integrity

Status: Complete for local-first play

- Risked equipment leaves the stash only after a failed verdict
- Active-raid escrow checkpoints the layout seal, depth, unseen marks, and bounded total and per-threat kills, settles refreshes and interrupted tabs as abandonment, and clears only after the verdict and its idempotency marker are durably saved
- Malformed or future active-raid journals stay quarantined behind raw download and explicit two-step discard instead of silently bypassing the raid's risk
- A 12-second page-owner lease heartbeats every three seconds, preventing another tab from treating a live raid as an interruption or overwriting its escrow
- Initial page-owner claims are read-back verified, renewals refuse to overwrite another owner, and a losing concurrent descent destroys only its local simulation before entering the non-destructive foreign-raid lock
- Live cancellation and terminal settlement recheck their owner immediately before profile persistence, while owned removal refuses to clear a replacement journal from another tab
- Already-open idle tabs observe the shared journal, invalidate pending lobby imports, and enter the same non-destructive lock as soon as another tab begins a leased raid
- A quarantined idle tab reloads into the durable profile as soon as the owning tab safely removes its settled journal
- Idle tabs adopt durable profile writes from one another, discard stale sale intent, and keep only packed selections that still exist in the refreshed stash
- Durable preferences also refresh across tabs only while the lobby is visible, leaving active raids, verdicts, and recovery screens undisturbed
- An unsecured live or recovered verdict locks mutable lobby state behind a storage retry, while the settled-journal high-water mark prevents an exact or older retained escrow from being applied twice
- Retained settled journals reconcile before their stale page-owner leases are considered, so a durable verdict cannot leave another lobby quarantined
- A journal that appears in the final pre-descent race window is also checked against the durable settlement marker before it can block or be overwritten by the new raid
- Active-journal loading represents loaded, missing, damaged, and unavailable states as disjoint results, preventing callers from treating a loaded journal as if its escrow were optional
- A future-dated heartbeat is trusted only within one 12-second lease window, preventing malformed or clock-shifted journals from indefinitely locking other tabs
- Each new journal receives a marker beyond the last settled raid even when the system clock repeats a millisecond
- An exhausted safe-integer settlement marker blocks descent instead of creating a lower journal that could be mistaken for an already-settled raid
- Active journals without a positive safe-integer start marker are quarantined instead of being repeatedly settled without an idempotency key
- Journal markers beyond the bounded clock-skew window are quarantined, and a future durable high-water marker blocks descent before it can create an unrecoverable raid
- Failed live checkpoints retry every three active seconds, expose a storage-only pause action, and announce durable recovery
- The live HUD exposes checkpoint storage failure instead of silently leaving refresh recovery stale
- Paid-contract entry is single-flight, snapshots its launch state, retries a rejected renderer download, and reconciles the authoritative before/after gold balance when interrupted between storage writes
- A rejected raid-entry profile write stops the loading lease before saving its refund marker and clearing escrow, so a heartbeat cannot recreate a canceled journal
- Consumed packed items remain consumed after extraction or failure
- Treasure coin credit is derived from current haul contents instead of a separate mutable raid counter
- Generated loot, sigils, purchases, and crafted outputs remain identity-distinct even under same-millisecond and repeated-random inputs
- Boss victories, Ashen depth, and their rewards require a typed boss kill within the bounded total-kill ledger
- Malformed runtime class, mode, outcome, or inventory identity fails closed to the saved class, Standard abandonment, and a validated haul bounded to the eight-item raid capacity
- Pre-raid and verdict value ledgers derive loadout risk, fees, Iron Soul XP exposure, and net wealth change from actual contract state
- Verdicts itemize the bounded per-threat kill evidence used by bestiary, commission, and boss settlement
- Future-dated verdicts cannot pre-claim a later daily commission or poison the contract journal clock
- The exact floor deadline and first lethal source stop the terminal simulation frame before later systems can mutate a captured verdict
- Malformed, non-positive, and excessively delayed frame-clock samples fail closed before entering the raid simulation
- Version 15 migrates older profiles into the Quiet Knives contract and settled-journal marker without changing prior progress
- Future profile schemas and backup imports are preserved or rejected instead of being destructively downgraded
- Class XP, contracts, bestiary ledgers, survival streaks, raid history, settings, and backup import/export survive compatible profile migrations
- Save import is single-flight, bound to its originating idle lobby, and must durably store the profile before replacing in-memory state
- Iron Soul failure clears the selected discipline's XP while preserving the rest of the profile

Exit evidence: migration, settlement, escrow, economy, backup, and malformed-save tests.

## M2: Encounter readability and bounded variation

Status: Complete for the current map

- Encounter mirroring, extraction-site selection, trap formations, rival archetypes, and campfire placement produce 32 bounded raid configurations with stable `PT-00` through `PT-1F` contract seals
- Contract-critical locations remain reachable in topology tests
- The hidden reliquary stone blocks AI routing, perception, footsteps, melee sight, and every projectile until its channel completes
- Facing-locked threat windups with cover, evasion, and range verdicts, directional pre-hit and impact markers, guard cone, pre-action strike stamina cost, readable crouch and sprint noise, crosshair awareness and unique unseen marks, chain telegraphs, safe annulus, darkness bearing, channel interruption reasons, crosshair scaling, rarity rank marks, and loose-loot silhouettes expose actionable state
- Nearby loot, coffers, rests, shrines, and passages require an unobstructed dungeon sightline, while the false-stone seam remains intentionally usable as the wall target itself
- Discarded haul and relics recovered from defeated rivals search backward from their desired landing points and stay on the delver's side of walls, pillars, and the sealed false stone
- Held passage channels expose semantic progress and keep their blue return, Ashen return, or red floor-2 destination explicit until completion
- Held progress stays bound to the portal, campfire, or false stone that began it; looking onto another ritual target breaks the channel instead of transferring progress
- Released rival knives and Tollkeeper chains use swept travel-time collision, stop at stone, and resolve guard or parry only at physical impact
- Hostile missile warnings persist with directional shape, text, and release tone through the full dodge window
- Pausing freezes and itemizes every hostile knife, chain, or dart volley still in flight before cursor rebind
- Wall-port volleys physically traverse the full telegraphed lane, use swept first-contact ordering, and can be evaded or intercepted after release
- Player missiles resolve the earliest swept target and the earliest body or head volume instead of array order
- Projectile masonry checks include both frame endpoints and the swept path, including malformed-coordinate rejection
- Projectile impacts order masonry, the delver, and every living threat by first swept contact within the same frame
- Projectile flight reuses caller-owned position records, while swept body and head contacts use scalar math instead of allocating temporary segment records per missile and target
- Masonry impacts replace stale flight warnings with explicit weapon-specific safe verdicts and place break feedback at the first physical contact instead of behind the wall
- Intervening living threats screen hostile missiles through first-contact crossfire without player kill credit or source self-hits
- Overlapping ordinary impacts share one acceptance gate, preventing a rejected wound from silently draining guard stamina
- Non-finite or negative damage components fail closed before combat math, and zero or malformed impacts cannot poison a threat's vigor state
- Hostile missile animation rejects malformed elapsed time or duration before the knife arc can introduce a non-finite world coordinate
- Distance-driven footsteps and AI acquisition distinguish stillness, crouch, steady movement, sprint, and packed armor without changing cadence with frame rate
- Enemy footstep tracking mutates its stored coordinates in place and selects the nearest audible cadence with scalars instead of replacing per-threat objects every frame
- Occluded moving threats emit range-attenuated class-specific footsteps and a separate directional accessibility cue without replacing combat markers
- Critical vigor, stamina, spell memory, and torch fuel can redirect the wayfinder to an unused campfire
- Ordinary movement and class-specific dodges derive capped collision substeps from their actual travel distance instead of relying on a fixed sample count
- Frame-hot darkness rendering uses cached shell and HUD nodes instead of repeating DOM selector walks throughout a raid
- Frame-hot clock, objective, inventory, ritual, stealth, direction, and wayfinder copy skips unchanged text and ritual prompts commit only one final message per frame
- Digital movement normalization writes into the raid's shared direction scratch record instead of constructing a Three.js vector every simulation frame
- Interaction sight and facing scans reuse raid-owned vectors and coordinate records rather than allocating a vector, closure, origin, facing, and target records every active frame
- Remedy and throwing-weapon HUD summaries scan recovered and packed items into caller-owned records instead of rebuilding and filtering quick-slot arrays every frame
- Immutable weapon and armor power are calculated once per raid instead of rescanning packed gear on every enemy awareness check, footstep, or projectile impact
- Wall-flame animation walks a fixed torch registry instead of traversing the full dungeon scene graph every rendered frame
- Sight and projectile sampling reuse the immutable wall and pillar registries directly instead of rebuilding geometry arrays and point records for every sample
- Repeated threat, rival, ability, attack, and stealth sight checks write through two raid-owned coordinate records instead of creating caller-side point pairs
- Repeated melee and ranged attack acquisition reuses raid-owned Three.js vectors instead of cloning the camera and allocating target vectors per living threat
- Thrown-weapon acquisition shares the same raid-owned facing and target vectors, including head and body aim selection, instead of allocating vectors for every living threat
- Migrating darkness updates one raid-owned zone record, measures player distance once, and reuses the direction scratch record only when the delver is outside safety
- Player and threat collision plus floor and dart-trap scans use early-exit loops and squared scalar overlap math instead of frame-hot square roots, callbacks, and coordinate pairs
- Combat and hazard simulation remain frame-rate driven while inventory summaries, wayfinding, bars, countdown text, and transient visibility refresh at a bounded 20 Hz
- Projectile flight keeps first-contact progress in scalars and reuses target and impact records instead of constructing collision-result objects while missiles cross a frame
- Projectile sweeps, masonry samples, ash-vent range checks, and movement cadence use direct finite-number guards instead of temporary validation arrays
- Passive enemy awareness and spawn-grace state are derived once per simulation frame, not once per living enemy
- Loose-loot animation uses a direct loop without constructing a per-frame array callback
- Delver footstep cadence, camera bob, and passive movement noise follow collision-resolved travel rather than requested speed against blocked stone
- Threat awareness reuses targeting vectors, and Warden guidance finds the nearest living target in one allocation-free scan instead of filtering and sorting every frame
- Smoke Step, Sanctuary, and Rousing Discord use squared range checks and direct threat scans without temporary target arrays
- Player and hostile missiles reuse contact vectors, while player shots find the first living impact in one ordered scan instead of allocating and sorting threat arrays every frame
- Projectile launch offsets, impact guard-facing checks, melee guard-facing checks, chain-ring defense, and dropped-haul placement reuse owned flight or raid scratch vectors instead of disposable Three.js vectors
- Reduced motion suppresses decorative loading, camera, enemy-step, loot, flame, and portal loops while retaining functional combat telegraphs; pause sleeps continuous rendering and cancels queued audio feedback before it can replay in a later raid state
- Pause, teardown, and failed audio-context resume also stop and disconnect every active transient tone, preventing suspended combat audio from replaying after a later cursor rebind
- High contrast strengthens darkness and checkpoint state, navigation, combat warnings, threat vitals, resources, and interaction panels; lobby selection semantics, keyboard focus, and forced-color outlines do not rely on hover or color alone
- Lobby rebuilds restore the logical keyboard control across class, contract, stash, merchant, crafting, settings, and idle cross-tab refreshes without forcing the viewport to jump
- Terminal raid verdicts move focus to their labeled outcome heading, and a secured return places keyboard focus on the next-descent control
- Initial entry, voluntary unlock, cursor rejection, focus loss, and renderer recovery keep keyboard focus on the visible Resume action while simulation remains paused
- Settled and superseded cursor-binding requests cancel their owned deadline immediately instead of retaining stale lifecycle callbacks
- The full-screen raid pause is exposed as a labeled modal, and cursor-binding work shares one semantic busy state with the disabled Resume action
- Incompatible-profile, unsecured-verdict, damaged-journal, and foreign-raid locks move focus to their first safe recovery action without selecting a destructive choice
- The persistent raid control strip names the class ability binding, and held Space cannot leak repeated scroll input while sidestep remains single-fire
- The Ash Tollkeeper begins its annulus phase at full vigor and uses a tighter second-floor cadence

Exit evidence: topology, collision, sightline, pathfinding, variation, combat-rule, and depth tests.

## M3: Public BigBox release path

Status: Complete

- Unprivileged, read-only Nginx container on the private tunnel network with digest-pinned build and runtime images
- Process creation capped at 64 PIDs alongside explicit memory and CPU ceilings
- A server-wide read-only method gate rejects writes even on synthetic health and release routes
- Loopback-only host health endpoint
- Bounded service-local access logs that cannot grow without rotation under public traffic
- No inbound router ports or public origin address
- Content security, framing, MIME, referrer, permissions, opener, resource, and transport headers
- Immutable hashed assets with non-cacheable release identity and service worker
- The root and explicit index shell remain browser-revalidatable and carry a Cloudflare no-store override, with edge HIT rejection in every rollout
- Release-isolated worker caches recover old hashed chunks from real asset 404s instead of accepting the HTML shell
- Worker activation retains only two prior release caches so an older claimed lobby can still lazy-load its valid hashed game chunk, while stale caches and every prior HTML shell remain outside fallback resolution
- A complete current worker still claims clients when obsolete-cache enumeration or deletion is unavailable; cleanup failure cannot invalidate its staged shell
- Install and runtime cache writes reject response types that do not match their navigation, script, style, image, font, or manifest key, including every fixed shell entry staged by `addAll`
- Runtime executable and style requests fail closed to a valid cached response or a network error when an upstream `200` carries the wrong content type, rather than returning an HTML fallback downstream
- Runtime manifest, icon, and title requests canonicalize to one current-release key, preventing arbitrary query variants from multiplying fixed-shell cache entries
- The public manifest is served as JSON, while the unversioned app icon and title image revalidate instead of inheriting a stale edge or one-year immutable response
- CI-enforced compressed JavaScript, CSS, and entry-HTML performance budgets
- Compressed-asset budgets use an explicit gzip level instead of platform defaults, keeping local and Linux CI measurements comparable without raising their ceilings
- CI rejects high or critical dependency advisories before building the release image
- CI executes official checkout and Node setup actions by immutable commit identity while retaining their audited major-version annotations
- CI and production image dependency installation suppress third-party package lifecycle scripts before tests and compilation
- CI scans interface copy, source, dependency metadata, documentation, configuration, and tests for the project's prohibited U+2014 character before building, while binary artwork is excluded from text decoding
- Every deploy rejects a dirty source tree, snapshots the prior image, inspects effective runtime hardening, verifies Cloudflare-uncached live health and release identity, real missing-asset 404s, executable MIME types and immutable caching for every HTML-referenced build asset, and the exact commit through both `ne-gro.com` and `www.ne-gro.com`; rollback must prove the restored constraints, read-only method gate, version, HTML release marker, and both public routes before discarding its snapshot
- Rollout and rollback hash the unversioned public service worker against the running container, preventing a stale but correctly headed worker from passing either route gate
- Public write-method rejection is enforced by both curl and wget deployment-verification paths, including rollback recovery
- The release script rejects any environment override that differs from the checked-out Git commit, preventing a clean image from carrying a false version marker
- CI and every public rollout require the HTML build marker to equal the image and `/version.txt` release identity before accepting its asset graph

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
