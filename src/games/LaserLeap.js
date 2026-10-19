/* src/games/LaserLeap.js */

import BaseGame from "./BaseGame.js";

export default class LaserLeap extends BaseGame {
    static get manifest() {
        return {
            id: "laser-leap",
            title: "Laser Leap",
            description: "Jump over the accelerating laser beams as more deploy!",
            tutorial: "Track the guide beam, then tap to JUMP when armed! Survive the escalating laser barrage!",
            controllerType: "CONTROLLER",
            tournamentRules: {
                winValue: 1,
                livesPerRound: 1,
            },
        };
    }

    onSetup() {
        const count = this.players.length;

        // Sudden Death: 1 round, 1 life, last survivor standing takes the match
        this.config.winCondition = "SURVIVAL";
        this.config.roundResetType = "RESET_ALL";
        this.config.roundEndCriteria = "SURVIVAL";
        this.config.eliminateOnDeath = true;
        this.config.livesPerRound = 1;
        this.config.winValue = 1;

        // Arena ring dimensions
        this.ARENA_RADIUS = 520;
        this.RING_RADIUS = count >= 7 ? 395 : 365;
        this.PYLON_RADIUS = 55;
        this.BEAM_LENGTH = this.ARENA_RADIUS + 20;

        // Jump physics parameters
        this.JUMP_SPEED = 0.040;
        this.MAX_ALTITUDE = 86;
        this.CLEARANCE_ALTITUDE = 18;

        // Laser rotation mechanics
        this.beamAngle = 0;
        this.beamSpeed = 0.024;
        this.baseSpeed = 0.024;
        this.direction = 1;
        this.targetSpeed = 0.024;
        this.MAX_ROTATION_SPEED = 0.115; // Raised top speed cap for near-impossible overtime

        // Warm-up tracking phase before initial lethal activation
        this.WARMUP_DURATION = 180; // 3 seconds at 60Hz
        this.warmupTimer = this.WARMUP_DURATION;
        this.isBeamArmed = false;

        this.survivalTimer = 0;
        this.nextReverseTick = 0;
        this.isReversing = false;
        this.reverseTimer = 0;

        // Multi-laser escalation stages
        this.beamCount = 1;
        this.targetBeamCount = 1;
        this.deployWarningTimer = 0;
        this.DUAL_BEAM_TICK = 660;   // 11 seconds: 2 lasers (180 deg)
        this.TRI_BEAM_TICK = 1260;   // 21 seconds: 3 lasers (120 deg)
        this.QUAD_BEAM_TICK = 1860;  // 31 seconds: 4 lasers (90 deg cross)

        this.playerStates = [];
    }

    onRoundStart() {
        const count = this.players.length;
        const positions = this.getRadialPositions(count, this.RING_RADIUS, {
            centerX: this.CX,
            centerY: this.CY,
        });

        // Initialize beam safely midway between player 0 and player 1
        const safeOffset = Math.PI / Math.max(2, count);
        this.beamAngle = (positions[0].angle + safeOffset) % (Math.PI * 2);

        this.direction = Math.random() < 0.5 ? 1 : -1;
        this.baseSpeed = 0.024;
        this.beamSpeed = this.baseSpeed * this.direction;
        this.targetSpeed = this.beamSpeed;

        // Reset warm-up and escalation state
        this.warmupTimer = this.WARMUP_DURATION;
        this.isBeamArmed = false;

        this.survivalTimer = 0;
        this.nextReverseTick = 380 + Math.floor(Math.random() * 200);
        this.isReversing = false;
        this.reverseTimer = 0;

        this.beamCount = 1;
        this.targetBeamCount = 1;
        this.deployWarningTimer = 0;

        this.playerStates = this.players.map((basePlayer, idx) => ({
            id: basePlayer.id,
            idx: idx,
            player: basePlayer,
            angle: positions[idx].angle,
            baseX: positions[idx].x,
            baseY: positions[idx].y,
            x: positions[idx].x,
            y: positions[idx].y,
            isJumping: false,
            jumpProgress: 0,
            altitude: 0,
            expression: "happy",
            hitCooldown: 0,
        }));
    }

    onPlayerInput(player, type) {
        if (type !== "PRESS") return;

        const ps = this.playerStates.find((p) => p.id === player.id);
        if (!ps || ps.player.isEliminated || ps.isJumping) return;

        ps.isJumping = true;
        ps.jumpProgress = 0;
        this.playSound("jump");
    }

    onFixedUpdate(dt) {
        // 1. Initial safe warm-up phase countdown
        if (!this.isBeamArmed) {
            this.warmupTimer--;

            if (this.warmupTimer % 60 === 0 && this.warmupTimer > 0) {
                this.playSound("click");
            }

            if (this.warmupTimer <= 0) {
                this.isBeamArmed = true;
                this.playSound("jump");
                this.shake(4, 12);
                this.spawnParticles(this.CX, this.CY, {
                    color: "#FF5A36",
                    count: 24,
                    size: 16,
                    speed: 6,
                });
            }
        } else {
            this.survivalTimer++;

            // Aggressive acceleration curve: speeds up continuously toward near-impossible speeds
            this.baseSpeed = Math.min(
                this.MAX_ROTATION_SPEED,
                0.024 + (this.survivalTimer / 60) * 0.0024
            );

            // 2. Escalating Multi-Beam Deployment Checks
            if (this.beamCount === 1 && this.targetBeamCount === 1 && this.survivalTimer >= this.DUAL_BEAM_TICK) {
                this.triggerBeamEscalation(2, "DUAL LASERS ACTIVATED!");
            } else if (this.beamCount === 2 && this.targetBeamCount === 2 && this.survivalTimer >= this.TRI_BEAM_TICK) {
                this.triggerBeamEscalation(3, "TRI-BEAM OVERDRIVE!");
            } else if (this.beamCount === 3 && this.targetBeamCount === 3 && this.survivalTimer >= this.QUAD_BEAM_TICK) {
                this.triggerBeamEscalation(4, "QUAD-BEAM MAYHEM!");
            }

            // Handle beam escalation warning timer
            if (this.deployWarningTimer > 0) {
                this.deployWarningTimer--;
                if (this.deployWarningTimer <= 0) {
                    this.beamCount = this.targetBeamCount;
                    this.playSound("crash");
                    this.shake(6, 16);
                    this.spawnParticles(this.CX, this.CY, {
                        color: "#FF5A36",
                        count: 28,
                        size: 18,
                        speed: 7,
                    });
                }
            }

            // 3. Direction Reversal Routine with Safe Disarm
            if (this.survivalTimer >= this.nextReverseTick && !this.isReversing && this.deployWarningTimer <= 0) {
                this.isReversing = true;
                this.reverseTimer = 65; // ~1.1s safe reversal window
                this.playSound("pop");
            }

            if (this.isReversing) {
                this.reverseTimer--;

                // Phase 1 (ticks 65 -> 32): Decelerate to 0 and disarm into safe tracking mode
                if (this.reverseTimer > 32) {
                    this.targetSpeed = 0;
                }
                // Phase 2 (at tick 32): Flip direction
                else if (this.reverseTimer === 32) {
                    this.direction *= -1;
                    this.targetSpeed = this.baseSpeed * this.direction;
                    this.playSound("click");
                }
                // Phase 3 (ticks 32 -> 0): Accelerate in reverse, still disarmed/safe
                else if (this.reverseTimer <= 0) {
                    this.isReversing = false;
                    this.nextReverseTick = this.survivalTimer + 300 + Math.floor(Math.random() * 220);
                    this.playSound("jump");
                    this.shake(3, 8);
                    this.spawnParticles(this.CX, this.CY, {
                        color: "#FF5A36",
                        count: 16,
                        size: 14,
                        speed: 5,
                    });
                }
            } else {
                this.targetSpeed = this.baseSpeed * this.direction;
            }
        }

        // Smooth beam rotation interpolation
        this.beamSpeed = this.p.lerp(this.beamSpeed, this.targetSpeed, 0.08);
        this.beamAngle = (this.beamAngle + this.beamSpeed + Math.PI * 2) % (Math.PI * 2);

        // 4. Update player jump physics and evaluate collisions against all active beams
        const activeBeamAngles = this.getActiveBeamAngles();

        this.playerStates.forEach((ps) => {
            if (ps.player.isEliminated) return;

            if (ps.hitCooldown > 0) ps.hitCooldown--;

            if (ps.isJumping) {
                ps.jumpProgress += this.JUMP_SPEED;
                ps.altitude = Math.sin(ps.jumpProgress * Math.PI) * this.MAX_ALTITUDE;
                ps.y = ps.baseY - ps.altitude;

                if (ps.jumpProgress >= 1) {
                    ps.isJumping = false;
                    ps.jumpProgress = 0;
                    ps.altitude = 0;
                    ps.y = ps.baseY;
                }
            }

            // Damage is evaluated only when the laser is armed and not during direction switches
            const canDamage = this.isBeamArmed && !this.isReversing && ps.hitCooldown <= 0;

            if (canDamage) {
                for (let i = 0; i < activeBeamAngles.length; i++) {
                    if (this.testBeamCollision(activeBeamAngles[i], ps.angle, ps.altitude)) {
                        this.zapPlayer(ps);
                        break;
                    }
                }
            }
        });
    }

    triggerBeamEscalation(nextCount, announcement) {
        this.targetBeamCount = nextCount;
        this.deployWarningTimer = 90; // 1.5s telegraph warning before new beams arm
        this.playSound("pop");
        this.ui.showTurnMessage(announcement, "#FF5A36");
    }

    getActiveBeamAngles() {
        const angles = [];
        const step = (Math.PI * 2) / this.beamCount;
        for (let i = 0; i < this.beamCount; i++) {
            angles.push((this.beamAngle + i * step) % (Math.PI * 2));
        }
        return angles;
    }

    getWarningBeamAngles() {
        if (this.deployWarningTimer <= 0) return [];
        const angles = [];
        const step = (Math.PI * 2) / this.targetBeamCount;
        for (let i = 0; i < this.targetBeamCount; i++) {
            angles.push((this.beamAngle + i * step) % (Math.PI * 2));
        }
        return angles;
    }

    testBeamCollision(beamAngle, playerAngle, altitude) {
        if (altitude >= this.CLEARANCE_ALTITUDE) return false;

        const angleDiff = Math.atan2(
            Math.sin(beamAngle - playerAngle),
            Math.cos(beamAngle - playerAngle)
        );

        return Math.abs(angleDiff) < 0.085;
    }

    zapPlayer(ps) {
        ps.hitCooldown = 90;
        this.playSound("crash");
        this.shake(8, 16);

        ps.expression = "stunned";
        this.spawnParticles(ps.baseX, ps.baseY, {
            color: "#FF5A36",
            count: 16,
            size: 16,
            speed: 6,
        });

        this.eliminatePlayer(ps.idx);
    }

    runDemoAI() {
        if (!this.isBeamArmed || this.isReversing) return;

        const activeBeams = this.getActiveBeamAngles();

        this.playerStates.forEach((ps) => {
            if (ps.player.isEliminated || ps.isJumping) return;

            for (let i = 0; i < activeBeams.length; i++) {
                if (this.shouldJumpForBeam(activeBeams[i], ps.angle)) {
                    this.simulateInput(ps.id, "PRESS");
                    break;
                }
            }
        });
    }

    shouldJumpForBeam(beamAngle, playerAngle) {
        const angleDiff = Math.atan2(
            Math.sin(beamAngle - playerAngle),
            Math.cos(beamAngle - playerAngle)
        );

        const isApproaching =
            (this.beamSpeed > 0 && angleDiff < 0) ||
            (this.beamSpeed < 0 && angleDiff > 0);

        return isApproaching && Math.abs(angleDiff) > 0.12 && Math.abs(angleDiff) < 0.28;
    }

    onDraw() {
        this.drawArena();
        this.drawLaserBeams();
        this.drawPylon();
        this.drawPlayers();
        this.drawParticles();
    }

    drawArena() {
        const p = this.p;

        p.noStroke();
        p.fill(245, 240, 232);
        p.rect(0, 0, this.V_WIDTH, this.V_HEIGHT);

        // Circular stadium floor
        p.fill("#FAF6F0");
        p.stroke("#E8E1D5");
        p.strokeWeight(12);
        p.circle(this.CX, this.CY, this.ARENA_RADIUS * 2);

        // Concentric running lane rings
        p.noFill();
        p.stroke(232, 225, 213, 140);
        p.strokeWeight(3);
        p.circle(this.CX, this.CY, this.RING_RADIUS * 2);
        p.circle(this.CX, this.CY, this.RING_RADIUS * 2 + 80);
        p.circle(this.CX, this.CY, this.RING_RADIUS * 2 - 80);

        // Radial perimeter ticks
        p.stroke(232, 225, 213, 180);
        p.strokeWeight(2);
        for (let a = 0; a < p.TWO_PI; a += p.TWO_PI / 24) {
            const x1 = this.CX + Math.cos(a) * (this.ARENA_RADIUS - 30);
            const y1 = this.CY + Math.sin(a) * (this.ARENA_RADIUS - 30);
            const x2 = this.CX + Math.cos(a) * this.ARENA_RADIUS;
            const y2 = this.CY + Math.sin(a) * this.ARENA_RADIUS;
            p.line(x1, y1, x2, y2);
        }
    }

    drawLaserBeams() {
        const isLethal = this.isBeamArmed && !this.isReversing;
        const activeAngles = this.getActiveBeamAngles();

        // 1. Draw all currently active beams
        for (let i = 0; i < activeAngles.length; i++) {
            this.renderSingleBeam(activeAngles[i], isLethal);
        }

        // 2. Draw upcoming beams in warning guide mode during deployment alerts
        if (this.deployWarningTimer > 0) {
            const warningAngles = this.getWarningBeamAngles();
            for (let i = 0; i < warningAngles.length; i++) {
                this.renderSingleBeam(warningAngles[i], false);
            }
        }
    }

    renderSingleBeam(angle, isLethal) {
        const p = this.p;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const tipX = this.CX + cosA * this.BEAM_LENGTH;
        const tipY = this.CY + sinA * this.BEAM_LENGTH;

        p.push();

        if (!isLethal) {
            // Non-lethal safe tracking guide (during warm-up, reversals, or deploy warning)
            p.stroke("#F59E0B");
            p.strokeWeight(3.5);
            p.strokeCap(p.ROUND);

            const segments = 28;
            for (let i = 0; i < segments; i += 2) {
                const startRatio = i / segments;
                const endRatio = (i + 1) / segments;
                p.line(
                    this.CX + cosA * (this.BEAM_LENGTH * startRatio),
                    this.CY + sinA * (this.BEAM_LENGTH * startRatio),
                    this.CX + cosA * (this.BEAM_LENGTH * endRatio),
                    this.CY + sinA * (this.BEAM_LENGTH * endRatio)
                );
            }

            p.noFill();
            p.stroke("#F59E0B");
            p.strokeWeight(2);
            p.circle(tipX, tipY, 14);
        } else {
            // Full lethal energized laser beam
            p.stroke("#FF5A36");
            p.strokeWeight(13);
            p.strokeCap(p.ROUND);
            p.line(this.CX, this.CY, tipX, tipY);

            p.stroke("#FFFFFF");
            p.strokeWeight(4);
            p.line(this.CX, this.CY, tipX, tipY);

            p.noStroke();
            p.fill("#FF5A36");
            p.circle(tipX, tipY, 18);
            p.fill("#FFFFFF");
            p.circle(tipX, tipY, 8);
        }

        p.pop();
    }

    drawPylon() {
        const p = this.p;

        p.push();
        p.translate(this.CX, this.CY);

        // Pylon metallic base
        p.noStroke();
        p.fill("#211B18");
        p.circle(0, 0, this.PYLON_RADIUS * 2);

        const isArmedAndActive = this.isBeamArmed && !this.isReversing;

        if (!isArmedAndActive) {
            // Warm-up or Safe Reversal indicator
            p.fill("#F59E0B");
            p.circle(0, 0, this.PYLON_RADIUS * 1.5);

            // Draw rotating mechanical nozzles for all active/target beams
            const displayCount = Math.max(this.beamCount, this.targetBeamCount);
            const step = p.TWO_PI / displayCount;

            p.rotate(this.beamAngle);
            p.fill("#211B18");
            p.rectMode(p.CENTER);

            for (let i = 0; i < displayCount; i++) {
                p.push();
                p.rotate(i * step);
                p.rect(this.PYLON_RADIUS * 0.4, 0, 36, 18, 5);
                p.fill("#FFFFFF");
                p.circle(this.PYLON_RADIUS * 0.6, 0, 10);
                p.pop();
            }

            p.rotate(-this.beamAngle);

            if (!this.isBeamArmed) {
                const secondsLeft = Math.max(1, Math.ceil(this.warmupTimer / 60));
                p.fill("#211B18");
                p.textAlign(p.CENTER, p.CENTER);
                p.textSize(26);
                p.textStyle(p.BOLD);
                p.text(secondsLeft, 0, 1);
            } else {
                p.fill("#211B18");
                p.textAlign(p.CENTER, p.CENTER);
                p.textSize(18);
                p.textStyle(p.BOLD);
                p.text("REV", 0, 1);
            }
        } else {
            p.fill("#FF5A36");
            p.circle(0, 0, this.PYLON_RADIUS * 1.5);

            // Armed rotating mechanical nozzles matching active beam count
            const step = p.TWO_PI / this.beamCount;

            p.rotate(this.beamAngle);
            p.fill("#211B18");
            p.rectMode(p.CENTER);

            for (let i = 0; i < this.beamCount; i++) {
                p.push();
                p.rotate(i * step);
                p.rect(this.PYLON_RADIUS * 0.4, 0, 36, 22, 6);
                p.fill("#FFFFFF");
                p.circle(this.PYLON_RADIUS * 0.6, 0, 14);
                p.pop();
            }
        }

        p.pop();
    }

    drawPlayers() {
        const p = this.p;
        const sorted = [...this.playerStates].sort((a, b) => a.baseY - b.baseY);

        sorted.forEach((ps) => {
            if (ps.player.isEliminated) return;

            // Flashing invulnerability opacity after taking damage
            if (ps.hitCooldown > 0 && Math.floor(p.frameCount / 4) % 2 === 0) {
                return;
            }

            // Ground shadow shrinks as player leaps higher
            const shadowScale = Math.max(0.35, 1 - ps.altitude / (this.MAX_ALTITUDE * 1.2));
            this.drawShadow(
                ps.baseX,
                ps.baseY + 36,
                64 * shadowScale,
                22 * shadowScale,
                Math.round(40 * shadowScale)
            );

            this.drawAvatar(ps.player, ps.x, ps.y, {
                size: 88,
                anim: ps.isJumping ? "JUMP" : "IDLE",
                expression: ps.expression,
                facing: Math.cos(ps.angle) >= 0 ? 1 : -1,
                shadow: false,
            });
        });
    }
}