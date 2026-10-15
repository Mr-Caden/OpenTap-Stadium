# OpenTap Stadium

**A Modular, Open-Source Hybrid Local/Remote Social Gaming Platform.**

OpenTap Stadium is released under the **MIT License**. It is fully open source, extensible, and designed for developers to fork, customize, and build their own living room party games.

---

## Overview

OpenTap Stadium is a high-performance, browser-based party platform designed to bridge the gap between shared displays (Desktop, Television, Projector) and mobile devices. It enables 2 to 8 players to compete in rapid-fire minigames using a central host screen and their personal smartphones as controllers.

Unlike traditional web-based party games, OpenTap Stadium features a lag-compensated input pipeline, deterministic fixed-timestep physics, and a modular architecture that keeps individual minigames completely decoupled from meta-systems like tournaments, network synchronization, and avatar rendering.

---

## Key Features

* **Zero-App Entry:** Players join in seconds by scanning a dynamically generated QR code. No app store downloads or installations required.
* **Hybrid Multiplayer:** Supports local keyboard players and remote mobile controllers simultaneously.
* **Lag Equalization:** The host engine calculates network round-trip time (RTT) and artificially delays local keyboard inputs to match mobile latency, maintaining competitive fairness.
* **Deterministic 60Hz Physics:** A fixed-timestep accumulator decouples physics calculations from display refresh rates, ensuring identical game speed across 60Hz, 120Hz, and 144Hz displays.
* **Live AI Tutorial Demos:** Selecting a game immediately mounts a full-screen, 60fps AI simulation behind an instructional overlay so players see mechanics demonstrated in real time prior to match start.
* **Viewport-Aware Canvas Optimization:** Hub preview cards only execute render loops when visible within the viewport using an `IntersectionObserver`, preventing CPU and GPU context thrashing.
* **Memory & Canvas Sanitization:** Automatic lifecycle tracking disposes of P5.js instances and Matter.js worlds on teardown, preventing memory leaks during long gaming sessions.
* **Session Persistence:** Mobile players can lock their screens or refresh their browsers and automatically reconnect to their existing player slot without losing points.
* **Open & Hackable:** Write a new minigame in a single self-contained class, plug it into the registry, and the engine automatically generates cards, routes controller states, and includes it in tournaments.

---

## Technical Architecture

The engine is built on an event-driven Manager Pattern using vanilla ES6 JavaScript, P5.js for canvas rendering, and Matter.js for 2D rigid-body dynamics.

| Core Component | Primary Responsibility |
| :--- | :--- |
| **`GameRunner.js`** | Manages the active game container lifecycle. Tracks instances using an internal container map (`mountedInstances`), ensuring previous P5 sketches and physics worlds are destroyed before mounting new sessions. |
| **`BaseGame.js`** | The abstract parent class for all minigames. Houses the 60Hz fixed accumulator, viewport scaling (`1920x1200`), procedural avatar rendering, particle systems, HUD timer badges, directional indicators, and spatial layout helpers. |
| **`NetworkManager.js`** | Coordinates WebRTC peer connections via PeerJS. Manages the heartbeat loop, RTT calculation, state broadcasts, and zombie player pruning (45-second timeout). |
| **`InputManager.js`** | Normalizes keyboard events and WebRTC data packets into a unified stream, applying network lag compensation to local inputs. |
| **`AvatarSystem.js`** | Procedural vector avatar generation. Handles accessories, facial expressions, variant styling, and dynamic procedural animations (Run, Jump, Attack, Win, Lose, Dizzy). |
| **`TournamentManager.js`** | Manages multi-round tournament playlists, automated scoring, cumulative standings tables, and final podium sequences. |
| **`UIManager.js`** | Controls DOM-based overlays, tutorial cards, modal dialogs, confetti particle simulations, and scoreboard updates. |
| **`AudioManager.js`** | Pure Web Audio API synthesis engine. Synthesizes procedural multi-track arcade music, lofi lobby themes, and dynamic sound effects with zero audio asset downloads. |

### Tech Stack
* **Rendering & Canvas:** [p5.js](https://p5js.org/) (LGPL-2.1)
* **2D Physics:** [Matter.js](https://brm.io/matter-js/) (MIT)
* **WebRTC Networking:** [PeerJS](https://peerjs.com/) (MIT)
* **QR Code Generation:** [QRCode.js](https://davidshimjs.github.io/qrcodejs/) (MIT)

---

## Lifecycle and Simulation Pipeline

Each minigame extends `BaseGame` and adheres to a standardized lifecycle that isolates simulation from display rendering:

```
[mount()] -> onSetup() -> onRoundStart() -> [Fixed Loop: onFixedUpdate(dt)] -> [Frame Loop: onDraw()] -> onDestroy()
```

1. **`onSetup()`**: Invoked once when the game class is mounted. Configures win conditions, arena boundaries, and rigid bodies.
2. **`onRoundStart()`**: Invoked at the beginning of each round to position entities, reset player states, and schedule timers.
3. **`onFixedUpdate(dt)`**: Invoked at a constant 60 ticks per second (16.67ms delta). All body forces, velocity integrations, AI bot logic, collision processing, and timer deductions occur here.
4. **`onDraw()`**: Invoked once per display frame. Strictly reserved for background rendering, visual transforms, avatar drawing, and HUD badges.
5. **`onDestroy()`**: Invoked on game teardown to clean up custom listeners or timeouts before `BaseGame` disposes of the physics world.

---

## Design Philosophy

### I. The Core Experience
| Principle | Implementation |
| :--- | :--- |
| **Accessibility First** | Games utilize either One-Button input (timing, charging, tapping) or Virtual Touchpad input (directional cursor navigation). Complex inputs are forbidden. |
| **Persistent Identity** | Each player is permanently associated with their chosen color and procedural avatar across the Lobby, Mobile Controller, Arena, and Scoreboards. |
| **Zero Setup Friction** | No native apps, user accounts, or passwords. Any smartphone with a camera and modern browser functions as a controller. |
| **Generational Balance** | Mechanics prioritize timing, chaos, and spatial awareness over complicated inputs, allowing children and adults to compete on equal footing. |

### II. Visual Identity: Sunset Boardwalk
The interface uses a warm retro-modern aesthetic designed for visibility on television screens:
* **Canvas Base:** Warm milk-cream (`#FAF6F0`) providing low eye strain and high contrast.
* **Headers & Framing:** Deep espresso (`#211B18`) providing clean visual anchor lines.
* **Accents:** Sunset coral (`#FF5A36`) and warm amber (`#F59E0B`) for callouts, buttons, and progress indicators.
* **Vector Pop:** Pure procedural vector graphics with clean outlines. Zero raster bitmaps or external sprite assets.

---

## Game Registry

All minigames are self-contained classes registered in `src/GameRegistry.js`. Each game exposes a `static get manifest()` getter that defines its identity, rules, and controller requirements:

1. **Sumo Discs:** Physics-based ring battle. Charge boost energy to knock opponents out of the dojo.
2. **Hop Hero:** Rhythm-based road and river crossing. Dodge traffic and leap across moving logs.
3. **Bomb Tag:** Hot-potato survival. Pass the ticking explosive to rivals before detonation.
4. **Crate Stackers:** Turn-based physics tower builder. Time your drop crane releases to construct a stable stack.
5. **Avatar Match:** Memory deduction game using virtual touchpad cursors to flip and match character cards.
6. **Code Breaker:** Turn-based numerical deduction. Guess the secret two-digit code using higher/lower judge feedback.
7. **Red Light, Green Light:** Reaction racer. Sprint on green, freeze on red, and anticipate deceptive switch intervals.
8. **Ninja Reflex:** High-speed reaction duel. Strike instantly when the visual signal triggers; false starts result in elimination.
9. **Paint Party:** Grid territory control. Navigate your avatar to claim the largest floor area within 45 seconds.

---

## Authoring New Minigames

To create a new minigame, create a class extending `BaseGame` inside `src/games/`:

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
        this.config.winCondition = 'SCORE';
        this.config.winValue = 5;
    }

    onRoundStart() {
        // Spawn players or reset positions
    }

    onFixedUpdate(dt) {
        // Step game logic at a deterministic 60Hz
    }

    onDraw() {
        // Render graphics using BaseGame helpers:
        // this.drawAvatar(player, x, y, { size, expression, anim, shadow: true });
        // this.drawTimerBadge();
        // this.drawParticles();
    }

    onPlayerInput(player, type, payload) {
        // Handle 'PRESS', 'RELEASE', or 'VECTOR'
    }
}
```

Add the class to `REGISTERED_GAMES` in `src/GameRegistry.js`:

```javascript
const REGISTERED_GAMES = [
    SumoDiscs,
    HopHero,
    // ...
    ExampleGame
];
```

The engine will automatically generate its Hub card, route its controller type, handle live demo tutorials, and incorporate it into Tournament drafts.

---

## License & Credits

OpenTap Stadium is open-source software licensed under the **[MIT License](LICENSE)**.

Third-party libraries used in this project:
* **p5.js** (LGPL-2.1)
* **Matter.js** (MIT)
* **PeerJS** (MIT)
* **QRCode.js** (MIT)

See `CREDITS.md` for complete attributions.
