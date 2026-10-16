/* src/games/BombBarrage.js */

import BaseGame from "./BaseGame.js";

export default class BombBarrage extends BaseGame {
    static get manifest() {
        return {
            id: "bomb-barrage",
            title: "Bomb Barrage",
            description: "Dodge the creeping hugging bombs as more spawn!",
            tutorial: "Hold to boost forward! Dodge the slow hugging bombs as they multiply!",
            controllerType: "CONTROLLER",
            tournamentRules: {
                winValue: 3,
                livesPerRound: 3,
            },
        };
    }

    onSetup() {
        const count = this.players.length;

        this.config.winCondition = "SURVIVAL";
        this.config.roundResetType = "RESET_ALL";
        this.config.roundEndCriteria = "SURVIVAL";
        this.config.eliminateOnDeath = true;

        // Dynamic player count scaling
        this.config.livesPerRound = count >= 7 ? 1 : (count >= 5 ? 2 : 3);
        this.config.winValue = count >= 7 ? 2 : 3;

        // Arena boundaries
        this.ARENA_W = 1460;
        this.ARENA_H = 880;
        this.PLAYER_RADIUS = 46;
        this.BOMB_RADIUS = 30; // Matches Bomb Tag neutral bomb dimensions
        
        // Slower bomb speed: approximately 1/4 of player boost speed (max ~2.3 px/frame)
        this.BOMB_SPEED = 0.0035;
        this.MAX_BOMB_SPEED = 2.3;
        this.BLAST_RADIUS = 160;

        // Initialize managed physics
        this.enablePhysics({
            gravity: { x: 0, y: 0 },
            engineOptions: {
                positionIterations: 8,
                velocityIterations: 8,
            },
        });

        // Initialize engine-level rotate-tap movement (unidirectional rotation)
        this.enableRotateTapMovement({
            boostForce: 0.055,
            rotSpeed: 0.078,
            friction: 0.04,
            reverseOnTap: false,
        });

        this.createArenaCushions();

        this.bombs = [];
        this.spawnTimer = 0;
        this.spawnInterval = 280; // Starts spawning a new bomb every 4.6 seconds
        this.hitCooldowns = {};
    }

    createArenaCushions() {
        const { Bodies } = window.Matter;
        const thick = 80;
        const wallOpts = {
            isStatic: true,
            restitution: 0.95,
            friction: 0.05,
            label: "cushion",
        };

        const halfW = this.ARENA_W / 2;
        const halfH = this.ARENA_H / 2;

        const topWall = Bodies.rectangle(this.CX, this.CY - halfH - thick / 2, this.ARENA_W + thick * 2, thick, wallOpts);
        const bottomWall = Bodies.rectangle(this.CX, this.CY + halfH + thick / 2, this.ARENA_W + thick * 2, thick, wallOpts);
        const leftWall = Bodies.rectangle(this.CX - halfW - thick / 2, this.CY, thick, this.ARENA_H, wallOpts);
        const rightWall = Bodies.rectangle(this.CX + halfW + thick / 2, this.CY, thick, this.ARENA_H, wallOpts);

        this.addPhysicsBody(topWall);
        this.addPhysicsBody(bottomWall);
        this.addPhysicsBody(leftWall);
        this.addPhysicsBody(rightWall);
    }

    initPlayerEntity(entity, player) {
        const count = this.players.length;
        const spawnDistance = Math.min(this.ARENA_H * 0.38, 360);
        const spawnPoints = this.getRadialPositions(count, spawnDistance, {
            centerX: this.CX,
            centerY: this.CY,
        });

        const spawn = spawnPoints[entity.index];
        entity.x = spawn.x;
        entity.y = spawn.y;
        entity.angle = spawn.angle + Math.PI;
        entity.size = this.PLAYER_RADIUS * 2;
        entity.expression = "happy";
        entity.facing = 1;
        entity.stunTimer = 0;

        const { Bodies } = window.Matter;
        const body = Bodies.circle(spawn.x, spawn.y, this.PLAYER_RADIUS, {
            restitution: 0.8,
            frictionAir: 0.04,
            density: 0.006,
            label: `player-${entity.id}`,
        });

        this.addPhysicsBody(body);
        entity.body = body;
    }

    onRoundStart() {
        // Clear all existing bombs from physics world
        this.bombs.forEach((bomb) => {
            if (bomb.body) this.removePhysicsBody(bomb.body);
        });
        this.bombs = [];

        this.spawnTimer = 0;
        this.spawnInterval = 280;
        this.hitCooldowns = {};

        // Spawn 1 initial creeping bomb safely away from players
        this.spawnSafeHuggingBomb();
    }

    spawnSafeHuggingBomb() {
        const halfW = this.ARENA_W / 2 - 120;
        const halfH = this.ARENA_H / 2 - 120;
        const activeEntities = this.getActiveEntities();

        let bestX = this.CX;
        let bestY = this.CY;
        let maxMinDist = 0;

        // Sample positions and choose the spot furthest from all active players
        for (let attempt = 0; attempt < 35; attempt++) {
            const candidateX = this.CX + (Math.random() - 0.5) * (halfW * 2);
            const candidateY = this.CY + (Math.random() - 0.5) * (halfH * 2);

            let closestDist = Infinity;
            for (let i = 0; i < activeEntities.length; i++) {
                const ent = activeEntities[i];
                const d = Math.hypot(ent.x - candidateX, ent.y - candidateY);
                if (d < closestDist) {
                    closestDist = d;
                }
            }

            if (closestDist > maxMinDist) {
                maxMinDist = closestDist;
                bestX = candidateX;
                bestY = candidateY;
            }

            // Guaranteed safe clearance threshold
            if (closestDist > 320) {
                bestX = candidateX;
                bestY = candidateY;
                break;
            }
        }

        const { Bodies } = window.Matter;
        const body = Bodies.circle(bestX, bestY, this.BOMB_RADIUS, {
            restitution: 0.85,
            frictionAir: 0.038,
            density: 0.005,
            label: "hugging-bomb",
        });

        this.addPhysicsBody(body);

        this.bombs.push({
            body: body,
            x: bestX,
            y: bestY,
            handAnim: Math.random() * Math.PI * 2,
            targetEntity: null,
            isExploded: false,
        });

        this.playSound("pop");
        this.spawnParticles(bestX, bestY, {
            color: "#FF5A36",
            count: 10,
            size: 12,
            speed: 3,
        });
    }

    onFixedUpdate(dt) {
        // Slowly spawn more and more hugging bombs over time
        this.spawnTimer++;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0;
            this.spawnSafeHuggingBomb();

            // Gradually accelerate spawn intervals down to a 2.0-second floor
            this.spawnInterval = Math.max(120, this.spawnInterval - 10);
        }

        const activeEntities = this.getActiveEntities();

        // Update player stun states and hit cooldowns
        activeEntities.forEach((ent) => {
            if (ent.stunTimer > 0) {
                ent.stunTimer--;
                ent.anim = "DIZZY";
                ent.expression = "stunned";
            } else if (ent.anim === "DIZZY") {
                ent.anim = "IDLE";
                ent.expression = "happy";
            }

            if (this.hitCooldowns[ent.id] > 0) {
                this.hitCooldowns[ent.id]--;
            }
        });

        // Update each hugging bomb: animate reaching hands and slowly home in on nearest player
        for (let i = this.bombs.length - 1; i >= 0; i--) {
            const bomb = this.bombs[i];
            if (bomb.isExploded) continue;

            if (bomb.body) {
                bomb.x = bomb.body.position.x;
                bomb.y = bomb.body.position.y;

                // Enforce maximum drift speed (strictly 1/4 of player velocity)
                const vx = bomb.body.velocity.x;
                const vy = bomb.body.velocity.y;
                const currentSpeed = Math.hypot(vx, vy);
                if (currentSpeed > this.MAX_BOMB_SPEED) {
                    const ratio = this.MAX_BOMB_SPEED / currentSpeed;
                    window.Matter.Body.setVelocity(bomb.body, {
                        x: vx * ratio,
                        y: vy * ratio,
                    });
                }
            }

            // Animate reaching hugging arms
            bomb.handAnim += 0.12;

            // Find nearest player to track
            let nearest = null;
            let minDist = Infinity;

            for (let e = 0; e < activeEntities.length; e++) {
                const ent = activeEntities[e];
                const d = Math.hypot(ent.x - bomb.x, ent.y - bomb.y);
                if (d < minDist) {
                    minDist = d;
                    nearest = ent;
                }
            }

            bomb.targetEntity = nearest;

            // Apply slow, floaty homing force toward nearest player
            if (nearest && bomb.body && window.Matter) {
                const dx = nearest.x - bomb.x;
                const dy = nearest.y - bomb.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > 0.001) {
                    window.Matter.Body.applyForce(bomb.body, bomb.body.position, {
                        x: (dx / dist) * this.BOMB_SPEED,
                        y: (dy / dist) * this.BOMB_SPEED,
                    });
                }
            }
        }
    }

    onCollisionStart(pair, bodyA, bodyB, entityA, entityB) {
        const isBombA = bodyA.label === "hugging-bomb";
        const isBombB = bodyB.label === "hugging-bomb";

        // If a hugging bomb touches a player: detonation!
        if ((entityA && isBombB) || (entityB && isBombA)) {
            const playerEnt = entityA || entityB;
            const bombBody = isBombA ? bodyA : bodyB;

            const bombIndex = this.bombs.findIndex((b) => b.body === bombBody);
            if (bombIndex !== -1) {
                this.detonateBomb(this.bombs[bombIndex], bombIndex, playerEnt);
            }
        } else if (isBombA && isBombB) {
            // Bomb-to-bomb collision bounce
            this.playSound("bump");
        } else if (entityA && entityB) {
            // Player-to-player collision
            this.playSound("bump");
            this.shake(3, 8);
        }
    }

    detonateBomb(bomb, bombIndex, caughtPlayer) {
        if (bomb.isExploded) return;
        bomb.isExploded = true;

        this.playSound("crash");
        this.shake(9, 20);

        // Explosion blast particles
        this.spawnParticles(bomb.x, bomb.y, {
            color: "#FF5A36",
            count: 24,
            size: 20,
            speed: 8,
        });
        this.spawnParticles(bomb.x, bomb.y, {
            color: "#211B18",
            count: 16,
            size: 16,
            speed: 6,
        });

        // 1. Damage any player caught in the blast radius
        const activeEntities = this.getActiveEntities();
        activeEntities.forEach((ent) => {
            const d = Math.hypot(ent.x - bomb.x, ent.y - bomb.y);

            if (d <= this.BLAST_RADIUS) {
                const cd = this.hitCooldowns[ent.id] || 0;
                if (cd <= 0) {
                    this.hitCooldowns[ent.id] = 75;
                    ent.stunTimer = 45;

                    // Knock player outward from blast center
                    if (ent.body) {
                        const nx = (ent.x - bomb.x) / Math.max(1, d);
                        const ny = (ent.y - bomb.y) / Math.max(1, d);
                        window.Matter.Body.setVelocity(ent.body, {
                            x: nx * 14,
                            y: ny * 14,
                        });
                    }

                    this.eliminatePlayer(ent.index);

                    if (ent.player.isEliminated && ent.body) {
                        this.removePhysicsBody(ent.body);
                        ent.body = null;
                    }
                }
            }
        });

        // 2. Clear field: Explode other nearby bombs in a cascading chain reaction
        const chainedBombs = [];
        for (let i = 0; i < this.bombs.length; i++) {
            const other = this.bombs[i];
            if (other === bomb || other.isExploded) continue;
            const dist = Math.hypot(other.x - bomb.x, other.y - bomb.y);
            if (dist <= this.BLAST_RADIUS) {
                chainedBombs.push(other);
            }
        }

        // Remove the primary exploded bomb from the simulation
        if (bomb.body) {
            this.removePhysicsBody(bomb.body);
            bomb.body = null;
        }

        const currentIdx = this.bombs.indexOf(bomb);
        if (currentIdx !== -1) {
            this.bombs.splice(currentIdx, 1);
        }

        // Staggered chain reaction cleans up clusters and relieves pressure
        chainedBombs.forEach((chainedBomb, i) => {
            this.scheduleTimeout(() => {
                const idx = this.bombs.indexOf(chainedBomb);
                if (idx !== -1 && !chainedBomb.isExploded) {
                    this.detonateBomb(chainedBomb, idx, null);
                }
            }, (i + 1) * 75);
        });
    }

    runDemoAI() {
        const activeEntities = this.getActiveEntities();
        const halfW = this.ARENA_W / 2;
        const halfH = this.ARENA_H / 2;

        activeEntities.forEach((bot) => {
            if (bot.stunTimer > 0) return;

            // Potential-Field Vector: Combine bomb repulsion, mutual player spacing, and wall avoidance
            let forceX = 0;
            let forceY = 0;

            // 1. Gentle center guidance only if drifting far toward the edges
            const toCenterX = this.CX - bot.x;
            const toCenterY = this.CY - bot.y;
            const distToCenter = Math.hypot(toCenterX, toCenterY);
            if (distToCenter > 380) {
                forceX += (toCenterX / distToCenter) * 0.35;
                forceY += (toCenterY / distToCenter) * 0.35;
            }

            // 2. Mutual Player Repulsion (keeps bots from clumping in the center)
            const PLAYER_PERSONAL_SPACE = 260;
            activeEntities.forEach((other) => {
                if (other === bot) return;
                const pdx = bot.x - other.x;
                const pdy = bot.y - other.y;
                const pdist = Math.hypot(pdx, pdy);

                if (pdist < PLAYER_PERSONAL_SPACE && pdist > 0.001) {
                    const intensity = Math.pow((PLAYER_PERSONAL_SPACE - pdist) / PLAYER_PERSONAL_SPACE, 2) * 3.4;
                    forceX += (pdx / pdist) * intensity;
                    forceY += (pdy / pdist) * intensity;
                }
            });

            // 3. Strong cushion/wall repulsion
            const distLeft = bot.x - (this.CX - halfW);
            const distRight = (this.CX + halfW) - bot.x;
            const distTop = bot.y - (this.CY - halfH);
            const distBottom = (this.CY + halfH) - bot.y;
            const WALL_MARGIN = 200;

            if (distLeft < WALL_MARGIN) forceX += Math.pow((WALL_MARGIN - distLeft) / WALL_MARGIN, 2) * 3.8;
            if (distRight < WALL_MARGIN) forceX -= Math.pow((WALL_MARGIN - distRight) / WALL_MARGIN, 2) * 3.8;
            if (distTop < WALL_MARGIN) forceY += Math.pow((WALL_MARGIN - distTop) / WALL_MARGIN, 2) * 3.8;
            if (distBottom < WALL_MARGIN) forceY -= Math.pow((WALL_MARGIN - distBottom) / WALL_MARGIN, 2) * 3.8;

            // 4. Heavy bomb repulsion (highest threat priority)
            let threatCount = 0;
            const DANGER_ZONE = 340;

            for (let i = 0; i < this.bombs.length; i++) {
                const b = this.bombs[i];
                if (b.isExploded) continue;

                const dx = bot.x - b.x;
                const dy = bot.y - b.y;
                const d = Math.hypot(dx, dy);

                if (d < DANGER_ZONE && d > 0.001) {
                    threatCount++;
                    const intensity = Math.pow((DANGER_ZONE - d) / DANGER_ZONE, 2) * 4.8;
                    forceX += (dx / d) * intensity;
                    forceY += (dy / d) * intensity;
                }
            }

            // Determine optimal safe escape heading
            const desiredHeading = Math.atan2(forceY, forceX);

            // Compare with the bot's rotating aim arrow
            const angleDiff = Math.atan2(
                Math.sin(desiredHeading - bot.angle),
                Math.cos(desiredHeading - bot.angle)
            );

            // Boost when aligned with the safe escape vector
            const isFacingSafeDirection = Math.abs(angleDiff) < 0.38;

            if (threatCount > 0) {
                // In danger: burst forward whenever arrow points to safety
                if (isFacingSafeDirection) {
                    if (!bot.isBoosting) this.simulateInput(bot.id, "PRESS");
                } else if (bot.isBoosting && Math.abs(angleDiff) > 0.7) {
                    this.simulateInput(bot.id, "RELEASE");
                }
            } else {
                // Free navigation: steer away from other players without rushing into walls
                if (isFacingSafeDirection && distToCenter > 180) {
                    if (!bot.isBoosting) this.simulateInput(bot.id, "PRESS");
                } else if (bot.isBoosting) {
                    this.simulateInput(bot.id, "RELEASE");
                }
            }
        });
    }

    onDraw() {
        this.drawArena();
        this.drawHuggingBombs();
        this.drawRotateTapArrows({ distance: this.PLAYER_RADIUS + 20, size: 11 });
        this.drawPlayers();
        this.drawParticles();
    }

    drawArena() {
        const p = this.p;

        p.noStroke();
        p.fill(245, 240, 232);
        p.rect(0, 0, this.V_WIDTH, this.V_HEIGHT);

        const halfW = this.ARENA_W / 2;
        const halfH = this.ARENA_H / 2;

        // Outer wooden boundary
        p.fill("#211B18");
        p.rectMode(p.CENTER);
        p.rect(this.CX, this.CY, this.ARENA_W + 36, this.ARENA_H + 36, 28);

        // Smooth arena floor
        p.fill("#FAF6F0");
        p.rect(this.CX, this.CY, this.ARENA_W, this.ARENA_H, 16);

        // Floor warning markings
        p.stroke("#E8E1D5");
        p.strokeWeight(3);
        p.noFill();
        p.circle(this.CX, this.CY, 420);
        p.line(this.CX, this.CY - halfH, this.CX, this.CY + halfH);
        p.circle(this.CX, this.CY, 16);

        // Corner bumper caps
        p.noStroke();
        p.fill("#FF5A36");
        p.circle(this.CX - halfW + 18, this.CY - halfH + 18, 20);
        p.circle(this.CX + halfW - 18, this.CY - halfH + 18, 20);
        p.circle(this.CX - halfW + 18, this.CY + halfH - 18, 20);
        p.circle(this.CX + halfW - 18, this.CY + halfH - 18, 20);
    }

    drawHuggingBombs() {
        const p = this.p;

        this.bombs.forEach((bomb) => {
            if (bomb.isExploded) return;

            // Soft shadow under bomb
            this.drawShadow(bomb.x, bomb.y + 12, 60, 24, 30);

            p.push();
            p.translate(bomb.x, bomb.y);

            // Gentle floating wobble
            const wobble = Math.sin(p.millis() * 0.008) * 0.08;
            p.rotate(wobble);

            // Bomb main body
            p.fill("#211B18");
            p.noStroke();
            p.circle(0, 0, 60);

            // Specular reflection
            p.fill(255, 50);
            p.circle(-15, -15, 20);

            // Cute blue eyes (matching Bomb Tag neutral bomb)
            p.fill("#3498db");
            p.circle(-12, 5, 6);
            p.circle(12, 5, 6);

            // Smile
            p.stroke(200);
            p.strokeWeight(3);
            p.noFill();
            p.arc(0, 12, 15, 10, p.PI, 0);

            // Animated reaching hugging arms
            const grab = Math.sin(bomb.handAnim) * 8;

            p.noStroke();
            p.fill("#211B18");

            // Left reaching arm
            p.push();
            p.translate(-35 - grab, 10);
            p.rotate(-0.5 + grab * 0.05);
            p.ellipse(0, 0, 25, 18);
            p.stroke("#211B18");
            p.strokeWeight(8);
            p.line(10, -5, 25, -10);
            p.pop();

            // Right reaching arm
            p.push();
            p.translate(35 + grab, 10);
            p.rotate(0.5 - grab * 0.05);
            p.noStroke();
            p.ellipse(0, 0, 25, 18);
            p.stroke("#211B18");
            p.strokeWeight(8);
            p.line(-10, -5, -25, -10);
            p.pop();

            // Fuse at top
            p.stroke("#7f8c8d");
            p.strokeWeight(5);
            p.noFill();
            p.bezier(0, -30, 0, -50, 20, -50, 20, -60);

            // Burning fuse spark
            const sparkColor = Math.floor(p.frameCount / 5) % 2 === 0 ? "#F59E0B" : "#FF5A36";
            p.fill(sparkColor);
            p.noStroke();
            p.circle(20, -60, 14);

            p.pop();
        });
    }

    drawPlayers() {
        const p = this.p;
        const activeEntities = this.getActiveEntities();

        activeEntities.forEach((ent) => {
            // Flash on invulnerability window
            if (this.hitCooldowns[ent.id] > 0 && Math.floor(p.frameCount / 4) % 2 === 0) {
                return;
            }

            // Clean, soft transparent shadow (zero dark black ring)
            this.drawShadow(ent.x, ent.y + 24, 60, 22, 35);

            // Avatar stays upright facing forward/upwards at all times
            this.drawAvatar(ent.player, ent.x, ent.y, {
                size: 88,
                anim: ent.anim,
                expression: ent.expression,
                facing: 1,
                rotation: 0,
                shadow: false,
            });
        });
    }
}