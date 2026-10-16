/* src/games/HexagonCollapse.js */

import BaseGame from "./BaseGame.js";

export default class HexagonCollapse extends BaseGame {
    static get manifest() {
        return {
            id: "hexagon-collapse",
            title: "Hexagon Collapse",
            description: "Tiles crumble when stepped on! Stay on solid ground!",
            tutorial: "Hold to boost forward! Stay on solid ground as tiles crack and drop!",
            controllerType: "CONTROLLER",
            tournamentRules: {
                winValue: 3,
                livesPerRound: 1,
            },
        };
    }

    onSetup() {
        const count = this.players.length;

        // Round-based survival rules: 1 life per round, first to winValue wins the match
        this.config.winCondition = "SCORE";
        this.config.winValue = count >= 7 ? 2 : 3;
        this.config.livesPerRound = 1;
        this.config.eliminateOnDeath = true;
        this.config.roundEndCriteria = "SURVIVAL";
        this.config.roundResetType = "RESET_ALL";

        // 3x Larger Playing Field: 91 tiles (R=6) for small lobbies, 127 tiles (R=7) for large lobbies
        this.gridRings = count >= 5 ? 7 : 6;
        this.hexRadius = count >= 5 ? 50 : 56;
        this.PLAYER_RADIUS = 34;

        // Warning duration: ~2.2 seconds (130 ticks) of cracking time
        this.CRACK_DURATION = 260;
        this.CRITICAL_DURATION = 48; // Final 0.8 seconds triggers high-intensity warning

        // Slow regeneration delay: fallen tiles return to the field after ~9.5 seconds (570 ticks)
        this.REGEN_DELAY = 48;

        // High-friction physics to ensure players decelerate cleanly without sliding off
        this.enablePhysics({
            gravity: { x: 0, y: 0 },
            engineOptions: {
                positionIterations: 8,
                velocityIterations: 8,
            },
        });

        // High-friction rotate-tap steering
        this.enableRotateTapMovement({
            boostForce: 0.068,
            rotSpeed: 0.076,
            friction: 0.088,
            reverseOnTap: false,
        });

        this.hexagons = [];
        this.fallGraceTime = 0;
    }

    initPlayerEntity(entity, player) {
        // Find outer perimeter tiles and sort them angularly around the arena center
        const outerTiles = this.hexagons.filter((h) => h.ring === (this.gridRings - 1));
        outerTiles.sort((a, b) => Math.atan2(a.y - this.CY, a.x - this.CX) - Math.atan2(b.y - this.CY, b.x - this.CX));

        // Distribute players equidistant across the arena circumference
        const count = this.players.filter((p) => !p.isPermEliminated).length;
        const targetIndex = Math.floor(entity.index * (outerTiles.length / Math.max(1, count)));
        const spawnTile = outerTiles[targetIndex] || { x: this.CX, y: this.CY };

        entity.x = spawnTile.x;
        entity.y = spawnTile.y;
        entity.angle = Math.atan2(this.CY - spawnTile.y, this.CX - spawnTile.x);
        entity.size = this.PLAYER_RADIUS * 2;
        entity.expression = "happy";
        entity.facing = 1;
        entity.isFalling = false;
        entity.fallScale = 1.0;
        entity.fallY = 0;

        // Unique AI bot traits to prevent synchronized movement patterns
        entity.aiTargetTile = null;
        entity.aiCaution = 0.35 + Math.random() * 0.25;
        entity.aiPersonalitySeed = Math.random() * 1000;

        const { Bodies } = window.Matter;
        const body = Bodies.circle(spawnTile.x, spawnTile.y, this.PLAYER_RADIUS, {
            restitution: 0.8,
            frictionAir: 0.088,
            density: 0.008,
            label: `player-${entity.id}`,
        });

        this.addPhysicsBody(body);
        entity.body = body;
    }

    onRoundStart() {
        this.generateHexGrid();
        // Initial grace period: starting tiles do not crack for the first 2 seconds
        this.fallGraceTime = 120;

        // Sort outer tiles angularly to ensure perfectly equidistant distribution
        const outerTiles = this.hexagons.filter((h) => h.ring === (this.gridRings - 1));
        outerTiles.sort((a, b) => Math.atan2(a.y - this.CY, a.x - this.CX) - Math.atan2(b.y - this.CY, b.x - this.CX));

        const activeEntities = this.getActiveEntities();
        const count = activeEntities.length;

        activeEntities.forEach((ent, i) => {
            const targetIndex = Math.floor(i * (outerTiles.length / Math.max(1, count)));
            const tile = outerTiles[targetIndex] || { x: this.CX, y: this.CY };

            ent.x = tile.x;
            ent.y = tile.y;
            ent.angle = Math.atan2(this.CY - tile.y, this.CX - tile.x);
            ent.isFalling = false;
            ent.fallScale = 1.0;
            ent.fallY = 0;
            ent.expression = "happy";
            ent.aiTargetTile = null;

            if (ent.body && window.Matter) {
                window.Matter.Body.setPosition(ent.body, { x: tile.x, y: tile.y });
                window.Matter.Body.setVelocity(ent.body, { x: 0, y: 0 });
            }
        });
    }

    generateHexGrid() {
        this.hexagons = [];
        const R = this.hexRadius;

        // Pointy-top regular hexagonal grid generation in axial coordinates
        for (let q = -this.gridRings; q <= this.gridRings; q++) {
            const r1 = Math.max(-this.gridRings, -q - this.gridRings);
            const r2 = Math.min(this.gridRings, -q + this.gridRings);

            for (let r = r1; r <= r2; r++) {
                const ringDist = Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
                if (ringDist >= this.gridRings) continue;

                const hx = this.CX + R * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
                const hy = this.CY + R * ((3 / 2) * r);

                this.hexagons.push({
                    q: q,
                    r: r,
                    ring: ringDist,
                    x: hx,
                    y: hy,
                    state: "INTACT", // 'INTACT', 'CRACKING', 'FALLING', 'REGENERATING', 'REBUILDING'
                    crackTimer: this.CRACK_DURATION,
                    fallTimer: 24,
                    fallOffset: 0,
                    shakeOffset: { x: 0, y: 0 },
                    regenTimer: 0,
                    rebuildProgress: 0,
                });
            }
        }
    }

    /**
     * Exact mathematical point-in-hexagon test for pointy-topped regular hexagons.
     * Incorporates a 4px seam tolerance so moving across tile seams never produces false gaps.
     */
    isPointOnHex(px, py, h, R) {
        const dx = Math.abs(px - h.x);
        const dy = Math.abs(py - h.y);

        // Include a 4px seam tolerance to eliminate vertex dead-zones
        const effectiveR = R + 4;
        const inRadius = effectiveR * 0.866025; // R * sqrt(3) / 2

        // Fast bounding box rejection
        if (dx > inRadius || dy > effectiveR) return false;

        // Slanted edge half-plane equation: dx + sqrt(3) * dy <= sqrt(3) * effectiveR
        return (dx + 1.73205 * dy) <= (1.73205 * effectiveR);
    }

    onFixedUpdate(dt) {
        if (this.fallGraceTime > 0) {
            this.fallGraceTime--;
        }

        const activeEntities = this.getActiveEntities();

        // 1. Detect player contact with tiles using exact hexagon geometry
        activeEntities.forEach((ent) => {
            if (ent.isFalling) return;

            for (let i = 0; i < this.hexagons.length; i++) {
                const h = this.hexagons[i];
                if (h.state !== "INTACT") continue;

                if (this.isPointOnHex(ent.x, ent.y, h, this.hexRadius)) {
                    // Only start cracking after the spawn grace period expires
                    if (this.fallGraceTime <= 0) {
                        h.state = "CRACKING";
                        h.crackTimer = this.CRACK_DURATION;
                        this.playSound("click");
                    }
                    break;
                }
            }
        });

        // 2. Update hexagon crumbling, falling, and slow regeneration states
        for (let i = 0; i < this.hexagons.length; i++) {
            const h = this.hexagons[i];

            if (h.state === "CRACKING") {
                h.crackTimer--;

                // Two-stage shake intensity
                const isCritical = h.crackTimer <= this.CRITICAL_DURATION;
                const intensity = isCritical 
                    ? 3.8 + Math.sin(h.crackTimer * 0.8) * 1.5 
                    : (1 - h.crackTimer / this.CRACK_DURATION) * 2.2;

                h.shakeOffset.x = (Math.random() - 0.5) * intensity;
                h.shakeOffset.y = (Math.random() - 0.5) * intensity;

                if (h.crackTimer <= 0) {
                    h.state = "FALLING";
                    this.playSound("pop");
                    this.spawnParticles(h.x, h.y, {
                        color: "#D8D1C7",
                        count: 8,
                        size: 10,
                        speed: 3,
                    });
                }
            } else if (h.state === "FALLING") {
                h.fallTimer--;
                h.fallOffset += 4;

                if (h.fallTimer <= 0) {
                    h.state = "REGENERATING";
                    h.regenTimer = this.REGEN_DELAY;
                    h.fallOffset = 0;
                    h.shakeOffset.x = 0;
                    h.shakeOffset.y = 0;
                }
            } else if (h.state === "REGENERATING") {
                h.regenTimer--;

                if (h.regenTimer <= 0) {
                    h.state = "REBUILDING";
                    h.rebuildProgress = 0;
                }
            } else if (h.state === "REBUILDING") {
                h.rebuildProgress += 0.035;

                if (h.rebuildProgress >= 1.0) {
                    h.state = "INTACT";
                    h.crackTimer = this.CRACK_DURATION;
                    h.fallTimer = 24;
                    h.fallOffset = 0;
                    h.shakeOffset.x = 0;
                    h.shakeOffset.y = 0;
                    h.rebuildProgress = 0;

                    this.spawnParticles(h.x, h.y, {
                        color: "#F59E0B",
                        count: 6,
                        size: 8,
                        speed: 2,
                    });
                }
            }
        }

        // 3. Evaluate player ground status: fall immediately if standing over empty void
        activeEntities.forEach((ent) => {
            if (ent.isFalling) {
                // Animate player falling into the abyss
                ent.fallScale = Math.max(0, ent.fallScale - 0.06);
                ent.fallY += 7;

                if (ent.fallScale <= 0) {
                    this.eliminatePlayer(ent.index);
                    if (ent.body) {
                        this.removePhysicsBody(ent.body);
                        ent.body = null;
                    }
                }
                return;
            }

            // Test if player is supported by any intact or cracking tile
            let hasGround = false;
            for (let i = 0; i < this.hexagons.length; i++) {
                const h = this.hexagons[i];
                if (h.state !== "INTACT" && h.state !== "CRACKING") continue;

                if (this.isPointOnHex(ent.x, ent.y, h, this.hexRadius)) {
                    hasGround = true;
                    break;
                }
            }

            // Stepping into the void triggers an immediate fall without immunity
            if (!hasGround) {
                ent.isFalling = true;
                ent.anim = "LOSE";
                ent.expression = "stunned";
                this.playSound("crash");
                this.shake(6, 14);
                this.spawnParticles(ent.x, ent.y, {
                    color: ent.player.color,
                    count: 14,
                    size: 14,
                    speed: 4,
                });
            }
        });
    }

    onCollisionStart(pair, bodyA, bodyB, entityA, entityB) {
        // Player-to-player physical bump
        if (entityA && entityB) {
            this.playSound("bump");
            entityA.expression = "stunned";
            entityB.expression = "stunned";
            this.scheduleTimeout(() => {
                if (entityA) entityA.expression = "happy";
                if (entityB) entityB.expression = "happy";
            }, 600);

            const midX = (entityA.x + entityB.x) / 2;
            const midY = (entityA.y + entityB.y) / 2;
            this.spawnParticles(midX, midY, {
                color: "#F59E0B",
                count: 8,
                size: 10,
                speed: 4,
            });
        }
    }

    runDemoAI() {
        const activeEntities = this.getActiveEntities();

        activeEntities.forEach((bot) => {
            if (bot.isFalling) return;

            // 1. Identify current tile beneath bot using exact geometry
            let currentTile = null;
            for (let i = 0; i < this.hexagons.length; i++) {
                const h = this.hexagons[i];
                if (h.state !== "INTACT" && h.state !== "CRACKING") continue;
                if (this.isPointOnHex(bot.x, bot.y, h, this.hexRadius)) {
                    currentTile = h;
                    break;
                }
            }

            // Decide if the bot needs to plan an escape
            const isCracking = currentTile && currentTile.state === "CRACKING";
            const isCritical = currentTile && currentTile.crackTimer <= 65;
            const needsMove = isCracking || !currentTile;

            // 2. Select a target safe tile autonomously without copying rivals
            if (needsMove || !bot.aiTargetTile || bot.aiTargetTile.state !== "INTACT") {
                let bestTile = null;
                let bestScore = -Infinity;

                for (let i = 0; i < this.hexagons.length; i++) {
                    const h = this.hexagons[i];
                    if (h === currentTile || h.state !== "INTACT") continue;

                    const d = Math.hypot(bot.x - h.x, bot.y - h.y);
                    // Search within 1 to 2 tile hops
                    if (d > this.hexRadius * 0.6 && d < this.hexRadius * 2.6) {
                        // Count surrounding intact neighbors (avoids dead-end islands)
                        let intactNeighbors = 0;
                        for (let j = 0; j < this.hexagons.length; j++) {
                            const nh = this.hexagons[j];
                            if (nh !== h && nh.state === "INTACT" && Math.hypot(h.x - nh.x, h.y - nh.y) < this.hexRadius * 2.1) {
                                intactNeighbors++;
                            }
                        }

                        // Avoid tiles occupied by other rivals
                        let rivalPenalty = 0;
                        for (let k = 0; k < activeEntities.length; k++) {
                            const rival = activeEntities[k];
                            if (rival !== bot && Math.hypot(rival.x - h.x, rival.y - h.y) < this.hexRadius * 1.2) {
                                rivalPenalty += 240;
                            }
                        }

                        // Prefer balanced center positioning
                        const distToCenter = Math.hypot(this.CX - h.x, this.CY - h.y);

                        // Calculate angular alignment convenience with bot's current rotating arrow
                        const angleToTile = Math.atan2(h.y - bot.y, h.x - bot.x);
                        const angleDiff = Math.abs(Math.atan2(
                            Math.sin(angleToTile - bot.angle),
                            Math.cos(angleToTile - bot.angle)
                        ));
                        const sweepBonus = (1 - (angleDiff / Math.PI)) * 140;

                        // Personality jitter ensures bots never pick the exact same tile
                        const personalJitter = (Math.sin(bot.aiPersonalitySeed + h.q * 3 + h.r * 5) * 60);

                        const score = (intactNeighbors * 80) + sweepBonus - (distToCenter * 0.35) - (d * 0.5) - rivalPenalty + personalJitter;

                        if (score > bestScore) {
                            bestScore = score;
                            bestTile = h;
                        }
                    }
                }

                bot.aiTargetTile = bestTile;
            }

            // 3. Steer and boost towards chosen target tile
            if (bot.aiTargetTile && (isCritical || needsMove)) {
                const angleToTarget = Math.atan2(bot.aiTargetTile.y - bot.y, bot.aiTargetTile.x - bot.x);
                const angleDiff = Math.atan2(
                    Math.sin(angleToTarget - bot.angle),
                    Math.cos(angleToTarget - bot.angle)
                );

                // Burst when arrow aligns within tolerance
                if (Math.abs(angleDiff) < 0.35) {
                    if (!bot.isBoosting) this.simulateInput(bot.id, "PRESS");
                } else if (bot.isBoosting && Math.abs(angleDiff) > 0.65) {
                    this.simulateInput(bot.id, "RELEASE");
                }
            } else if (bot.isBoosting) {
                // High friction stops the bot cleanly once safe
                this.simulateInput(bot.id, "RELEASE");
            }
        });
    }

    onDraw() {
        this.drawAbyss();
        this.drawHexagons();
        this.drawRotateTapArrows({ distance: this.PLAYER_RADIUS + 22, size: 11 });
        this.drawPlayers();
        this.drawParticles();
    }

    drawAbyss() {
        const p = this.p;

        p.noStroke();
        // Clean, minimal, high-contrast deep espresso background
        p.fill("#181412");
        p.rect(0, 0, this.V_WIDTH, this.V_HEIGHT);
    }

    drawHexagons() {
        const p = this.p;
        const R = this.hexRadius;

        for (let i = 0; i < this.hexagons.length; i++) {
            const h = this.hexagons[i];
            if (h.state === "REGENERATING") continue;

            p.push();
            p.translate(h.x + h.shakeOffset.x, h.y + h.shakeOffset.y + h.fallOffset);

            if (h.state === "FALLING") {
                const s = Math.max(0, h.fallTimer / 24);
                p.scale(s);
            } else if (h.state === "REBUILDING") {
                const s = Math.min(1.0, h.rebuildProgress);
                p.scale(s);
            }

            // Hexagon drop shadow
            p.noStroke();
            p.fill(0, 45);
            this.drawHexPolygon(0, 6, R - 2);

            // Hexagon body coloring based on status
            if (h.state === "INTACT") {
                p.fill("#FAF6F0");
                p.stroke("#E8E1D5");
                p.strokeWeight(3.5);
            } else if (h.state === "CRACKING") {
                // Distinct 2-stage visual warning (Amber -> Critical Coral)
                const isCritical = h.crackTimer <= this.CRITICAL_DURATION;
                if (isCritical) {
                    p.fill(Math.floor(p.frameCount / 4) % 2 === 0 ? "#FF5A36" : "#E84520");
                    p.stroke("#211B18");
                    p.strokeWeight(4.5);
                } else {
                    const ratio = 1 - (h.crackTimer / this.CRACK_DURATION);
                    const rCol = p.lerpColor(p.color("#FAF6F0"), p.color("#F59E0B"), Math.min(1, ratio * 1.5));
                    p.fill(rCol);
                    p.stroke("#D97706");
                    p.strokeWeight(3.5);
                }
            } else if (h.state === "REBUILDING") {
                // Ghostly holographic preview rising from the abyss
                p.fill(245, 158, 11, 45);
                p.stroke("#F59E0B");
                p.strokeWeight(2.5);
            } else {
                p.fill("#7A6F68");
                p.stroke("#211B18");
                p.strokeWeight(3);
            }

            this.drawHexPolygon(0, 0, R - 2);

            // Inner bevel accent
            if (h.state === "INTACT" || h.state === "CRACKING") {
                p.noFill();
                p.stroke(255, h.state === "INTACT" ? 180 : 90);
                p.strokeWeight(2);
                this.drawHexPolygon(0, 0, R * 0.76);
            }

            // Visible crack lines on crumbling tiles
            if (h.state === "CRACKING") {
                const isCritical = h.crackTimer <= this.CRITICAL_DURATION;
                p.stroke(isCritical ? "#FFFFFF" : "#211B18");
                p.strokeWeight(isCritical ? 3.5 : 2.5);

                p.line(-R * 0.35, -R * 0.2, 0, 0);
                p.line(0, 0, R * 0.4, -R * 0.3);
                p.line(0, 0, R * 0.2, R * 0.4);
                p.line(0, 0, -R * 0.3, R * 0.35);

                if (isCritical) {
                    p.line(-R * 0.5, 0, 0, 0);
                    p.line(0, 0, R * 0.45, R * 0.25);
                }
            }

            p.pop();
        }
    }

    drawHexPolygon(x, y, radius) {
        const p = this.p;
        p.beginShape();
        for (let i = 0; i < 6; i++) {
            // Pointy-top vertices at 30, 90, 150, 210, 270, 330 degrees
            const a = Math.PI / 6 + (i * Math.PI) / 3;
            p.vertex(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
        }
        p.endShape(p.CLOSE);
    }

    drawPlayers() {
        const activeEntities = this.getActiveEntities();

        activeEntities.forEach((ent) => {
            if (ent.isFalling) {
                // Animate player shrinking as they drop into the abyss
                this.drawAvatar(ent.player, ent.x, ent.y + ent.fallY, {
                    size: ent.size * ent.fallScale,
                    anim: "LOSE",
                    expression: "stunned",
                    facing: 1,
                    rotation: 0,
                    shadow: false,
                });
                return;
            }

            // Ground shadow
            this.drawShadow(ent.x, ent.y + 14, this.PLAYER_RADIUS * 2, this.PLAYER_RADIUS * 1.3, 35);

            // Avatar stays upright facing forward/upwards
            this.drawAvatar(ent.player, ent.x, ent.y, {
                size: ent.size,
                anim: ent.anim,
                expression: ent.expression,
                facing: 1,
                rotation: 0,
                shadow: false,
            });
        });
    }
}
