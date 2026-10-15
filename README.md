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