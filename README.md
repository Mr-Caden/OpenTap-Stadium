# OpenTap Stadium

**A Modular, Open-Source Hybrid Local/Remote Social Arcade Platform.**

OpenTap Stadium is released under the **MIT License**. It is fully open source, extensible, and designed for developers to fork, customize, and build their own living room party games.

---

## Overview

OpenTap Stadium is a high-performance, browser-based party platform designed to bridge the gap between shared displays (Desktop, Television, Projector) and mobile devices. It enables 2 to 10 players to compete in rapid-fire minigames using a central host screen and their personal smartphones as controllers.

Unlike traditional web-based party games, OpenTap Stadium features a lag-compensated input pipeline, deterministic fixed-timestep physics, and a modular architecture that keeps individual minigames completely decoupled from meta-systems like tournaments, network synchronization, and avatar rendering.

---

## Key Features

* **Zero-App Entry:** Players join in seconds by scanning a dynamically generated QR code on the TV screen. No app store downloads or user accounts required.
* **Hybrid Multiplayer:** Supports local keyboard players and remote mobile controllers simultaneously.
* **Lag Equalization:** The host engine measures network round-trip time (RTT) for every connected phone and artificially delays local keyboard inputs to match mobile latency, maintaining competitive fairness.
* **Deterministic 60Hz Physics:** A fixed-timestep accumulator decouples simulation updates from display refresh rates, guaranteeing identical game speeds across 60Hz, 120Hz, and 144Hz displays.
* **Engine-Level Rotate-Tap System:** Games requiring single-button steering can opt into built-in continuous rotation, forward boost application, and directional arrow rendering with zero duplicated code.
* **Dynamic Player Scaling:** All games automatically scale their parameters based on lobby size (2 to 10 players)—including lives, score thresholds, arena boundaries, and Sudden Death rules for large lobbies.
* **Virtualized Preview Canvases:** Both the host hub screen and mobile gallery utilize virtualized `IntersectionObserver` pipelines. Canvases and physics engines are dynamically mounted when scrolled into view and cleanly destroyed when scrolled out of view, ensuring zero browser GPU memory crashes as games are added.
* **Adaptive Score-Scaled Podium:** The post-game victory sequence features a Mario Party-style podium arena where bar heights scale directly with score in pixels, animating upward with an elastic spring reveal and ample headroom for jumping victory avatars.
* **Configurable Pointer Speed:** In-game Settings Menu on mobile devices includes a live Pointer Speed slider (0.8x to 2.5x) allowing players to fine-tune their touchpad sensitivity on the fly.
* **Memory & Context Sanitization:** Automatic lifecycle tracking disposes of P5.js sketches, Web Audio oscillators, and Matter.js worlds on teardown, preventing memory leaks during long gaming sessions.
* **Session Persistence:** Mobile players can refresh their browser or lock their phone screen and reconnect to their existing player slot without losing points.

---

## Technical Architecture

The engine is built on an event-driven Manager Pattern using vanilla ES6 JavaScript, P5.js for canvas rendering, and Matter.js for 2D rigid-body dynamics.

| Core Component | Primary Responsibility |
| :--- | :--- |
| **`GameRunner.js`** | Manages the active game container lifecycle. Tracks instances using an internal container map (`mountedInstances`), ensuring previous P5 sketches and physics worlds are destroyed before mounting new sessions. |
| **`BaseGame.js`** | The abstract parent class for all minigames. Houses the 60Hz fixed accumulator, viewport scaling (`1920x1200`), player entity pool (`this.entities`), managed Matter.js physics (`enablePhysics`), rotate-tap steering engine, particle systems, HUD timer badges, and spatial layout helpers. |
| **`NetworkManager.js`** | Coordinates WebRTC peer connections via PeerJS. Manages the heartbeat loop, RTT calculation, state broadcasts, and zombie player pruning. |
| **`InputManager.js`** | Normalizes keyboard events and WebRTC data packets into a unified stream, applying network lag compensation to local inputs. |
| **`AvatarSystem.js`** | Procedural vector avatar generation. Handles accessories, facial expressions, variant styling, and dynamic procedural animations (Run, Jump, Attack, Win, Lose, Dizzy). |
| **`TournamentManager.js`** | Manages multi-round tournament playlists, automated scoring, cumulative standings tables, and final podium sequences. |
| **`UIManager.js`** | Controls DOM-based overlays, tutorial cards, responsive scoreboards, modal dialogs, confetti particle simulations, and score-scaled podium sequences. |
| **`AudioManager.js`** | Pure Web Audio API synthesis engine. Synthesizes procedural multi-track arcade music, lofi lobby themes, and dynamic sound effects with zero audio asset downloads. |

### Tech Stack
* **Rendering & Canvas:** [p5.js](https://p5js.org/) (LGPL-2.1)
* **2D Physics:** [Matter.js](https://brm.io/matter-js/) (MIT)
* **WebRTC Networking:** [PeerJS](https://peerjs.com/) (MIT)
* **QR Code Generation:** [QRCode.js](https://davidshimjs.github.io/qrcodejs/) (MIT)

---

## Controller Archetypes

OpenTap Stadium supports two standardized controller modes. Every minigame declares its controller requirement in its manifest:

### 1. `CONTROLLER` (One-Button Mode)
* **Mobile Screen**: Full-screen high-contrast tap button with haptic feedback.
* **Keyboard Mapping**: Each local player has an assigned key (`Shift`, `Space`, `Enter`, `Z`, `M`, etc.).
* **Mechanics**: Tap timing, charging, holding to accelerate, releasing to fling, or steering via the built-in rotate-tap engine.

### 2. `TOUCHPAD` (Virtual Pointer Mode)
* **Mobile Screen**: High-precision 8-way directional touchpad with a separate tap-to-click action zone.
* **Keyboard / Mouse Mapping**: Shared PC mouse direct-pointing and clicking for local players.
* **Mechanics**: Freeform 2D navigation, cursor aiming, grid tile selection, and turn-based targeting.

---

## Lifecycle and Simulation Pipeline

Each minigame extends `BaseGame` and adheres to a standardized lifecycle that isolates simulation from display rendering:

```
[mount()] -> onSetup() -> onRoundStart() -> [Fixed Loop: onFixedUpdate(dt)] -> [Frame Loop: onDraw()] -> onDestroy()
```

1. **`onSetup()`**: Invoked once when the game class is mounted. Configures dynamic player-count scaling, win conditions, arena boundaries, and enables optional physics or rotate-tap engines.
2. **`initPlayerEntity(entity, player)`**: Optional hook to assign spawn positions, Matter.js bodies, or custom game-specific properties to each player's standardized entity wrapper.
3. **`onRoundStart()`**: Invoked at the beginning of each round to reset entities, hazard timers, and object pools.
4. **`onFixedUpdate(dt)`**: Invoked at a constant 60 ticks per second (16.67ms delta). All body forces, velocity integrations, AI bot logic, collision processing, and timer deductions occur here.
5. **`onDraw()`**: Invoked once per display frame. Strictly reserved for background rendering, visual transforms, avatar drawing (`this.drawEntities()`), aiming arrows, and HUD badges.
6. **`onDestroy()`**: Invoked on game teardown. `BaseGame` automatically clears all managed timeouts, unbinds collision events, and cleans up Matter.js bodies and engines.

---

## Registered Minigame Roster

All minigames are self-contained classes registered in `src/GameRegistry.js`. Each game exposes a `static get manifest()` getter that defines its identity, rules, and controller requirements:

1. **Sumo Discs**: Physics-based ring battle. Rotate constantly and boost forward to knock opponents out of the dojo.
2. **Hop Hero**: Rhythm-based road and river crossing. Dodge traffic and leap across moving logs without falling behind.
3. **Bomb Tag**: Hot-potato tag. Steer with rotate-tap boost to pass the ticking explosive to rivals before detonation.
4. **Crate Stackers**: Turn-based physics tower builder. Time your drop crane releases to construct a stable stack without causing a collapse.
5. **Avatar Match**: Memory deduction game using virtual touchpad cursors on gap-free grids to flip and match character cards.
6. **Code Breaker**: Turn-based numerical deduction. Guess the secret two-digit code using higher/lower judge feedback.
7. **Red Light, Green Light**: Reaction racer. Sprint on green, freeze on red, and anticipate deceptive switch intervals.
8. **Ninja Reflex**: High-speed reaction duel. Strike instantly when the visual signal triggers; false starts result in elimination.
9. **Paint Party**: Grid territory control. Navigate your avatar to claim the largest floor area within the time limit.
10. **Orbit Sling**: Orbital momentum slingshot. Grapple into gravitational pylons and time your release to fling across the arena for golden stars.
11. **Laser Leap**: Rhythm sweeper survival. Leap over an accelerating, reversing laser beam that escalates into dual lasers during overtime.
12. **Bomb Barrage**: Kinetic hazard survival. Steer with rotate-tap boost to dodge a growing swarm of slow hugging bombs that chain-react upon detonation.

---

## Authoring New Minigames

To create a new minigame, create a single class extending `BaseGame` inside `src/games/`:

```javascript
import BaseGame from './BaseGame.js';

export default class ExampleGame extends BaseGame {
    static get manifest() {
        return {
            id: 'example-game',
            title: 'Example Game',
            description: 'Short description for the Hub card.',
            tutorial: 'Instructions shown during the live demo.',
            controllerType: 'CONTROLLER', // 'CONTROLLER' or 'TOUCHPAD'
            tournamentRules: {
                winValue: 3,
                livesPerRound: 1
            }
        };
    }

    onSetup() {
        const count = this.players.length;

        // Dynamic player-count scaling
        this.config.winCondition = 'SCORE';
        this.config.winValue = count >= 7 ? 3 : 5;
        this.config.livesPerRound = count >= 7 ? 1 : (count >= 4 ? 2 : 3);

        // Optional: Enable managed physics and rotate-tap movement
        this.enablePhysics({ gravity: { x: 0, y: 0 } });
        this.enableRotateTapMovement({ boostForce: 0.055, rotSpeed: 0.08, reverseOnTap: false });
    }

    initPlayerEntity(entity, player) {
        // Position players and attach Matter.js bodies or properties
        entity.size = 88;
    }

    onRoundStart() {
        // Reset hazard timers or round state
    }

    onFixedUpdate(dt) {
        // 60Hz deterministic game logic and bot updates
    }

    onDraw() {
        // Render graphics using BaseGame helpers:
        // this.drawRotateTapArrows();
        // this.drawEntities();
        // this.drawTimerBadge();
        // this.drawParticles();
    }

    onPlayerInput(player, type, payload, entity) {
        // Handle 'PRESS', 'RELEASE', or 'VECTOR'
    }
}
```

Add the class to `REGISTERED_GAMES` in `src/GameRegistry.js`:

```javascript
import ExampleGame from "./games/ExampleGame.js";

const REGISTERED_GAMES = [
    // ...
    ExampleGame
];
```

The engine will automatically generate its Hub preview card, route its controller layout, handle live AI tutorial demonstrations, and incorporate it into tournament drafts.

---

## License & Credits

OpenTap Stadium is open-source software licensed under the **[MIT License](LICENSE.md)**.

Third-party libraries used in this project:
* **p5.js** (LGPL-2.1)
* **Matter.js** (MIT)
* **PeerJS** (MIT)
* **QRCode.js** (MIT)

See `CREDITS.md` for complete attributions.
