/* src/games/LaserLeap.js */

import BaseGame from "./BaseGame.js";

export default class LaserLeap extends BaseGame {
    static get manifest() {
        return {
            id: "laser-leap",
            title: "Laser Leap",
            description: "Jump over the rotating laser beam!",
            tutorial: "Track the guide beam, then tap to JUMP when armed! Watch for reversals!",
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

        // Dynamic player scaling: 7+ players enter Sudden Death (1 life)
        this.config.livesPerRound = count >= 7 ? 1 : (count >= 5 ? 2 : 3);
        this.config.winValue = count >= 7 ? 2 : 3;

        // Arena ring dimensions
        this.ARENA_RADIUS = 520;
        this.RING_RADIUS = count >= 7 ? 395 : 365;
        this.PYLON_RADIUS = 55;
        this.BEAM_LENGTH = this.ARENA_RADIUS + 20;

        // Forgiving jump physics: ~25 fixed ticks (~416ms hang-time)
        this.JUMP_SPEED = 0.040;
        this.MAX_ALTITUDE = 86;
        this.CLEARANCE_ALTITUDE = 18;

        // Beam rotation mechanics
        this.beamAngle = 0;
        this.beamSpeed = 0.022;
        this.baseSpeed = 0.022;
        this.direction = 1;
        this.targetSpeed = 0.022;

        // Warm-up tracking phase before initial lethal activation
        this.WARMUP_DURATION = 180; // 3 seconds at 60Hz
        this.warmupTimer = this.WARMUP_DURATION;
        this.isBeamArmed = false;

        this.survivalTimer = 0;
        this.nextReverseTick = 0;
        this.isReversing = false;
        this.reverseTimer = 0;

        // Escalation: Dual laser mechanics for extended rounds
        this.DUAL_BEAM_TRIGGER = 960; // Deploys after 16 seconds of armed survival
        this.hasDualBeam = false;
        this.isDualBeamDeploying = false;
        this.dualBeamWarningTimer = 0;

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
        this.baseSpeed = 0.022;
        this.beamSpeed = this.baseSpeed * this.direction;
        this.targetSpeed = this.beamSpeed;

        // Start in safe warm-up phase
        this.warmupTimer = this.WARMUP_DURATION;
        this.isBeamArmed = false;

        this.survivalTimer = 0;
        this.nextReverseTick = 360 + Math.floor(Math.random() * 240);
        this.isReversing = false;
        this.reverseTimer = 0;

        // Reset dual beam escalation
        this.hasDualBeam = false;
        this.isDualBeamDeploying = false;
        this.dualBeamWarningTimer = 0;

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

            // Gentle speed acceleration curve
            this.baseSpeed = Math.min(0.062, 0.022 + (this.survivalTimer / 60) * 0.0012);

            // 2. Overtime Dual Beam Escalation
            if (!this.hasDualBeam && !this.isDualBeamDeploying && this.survivalTimer >= this.DUAL_BEAM_TRIGGER) {
                this.isDualBeamDeploying = true;
                this.dualBeamWarningTimer = 120; // 2-second telegraph warning
                this.playSound("pop");
                this.ui.showTurnMessage("OVERTIME: DUAL LASERS!", "#FF5A36");
            }

            if (this.isDualBeamDeploying) {
                this.dualBeamWarningTimer--;
                if (this.dualBeamWarningTimer <= 0) {
                    this.isDualBeamDeploying = false;
                    this.hasDualBeam = true;
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
            if (this.survivalTimer >= this.nextReverseTick && !this.isReversing) {
                this.isReversing = true;
                this.reverseTimer = 70; // Total safe reversal duration (~1.15 seconds)
                this.playSound("pop");
            }

            if (this.isReversing) {
                this.reverseTimer--;

                // Phase 1 (ticks 70 -> 35): Decelerate to 0 and disarm into safe tracking mode
                if (this.reverseTimer > 35) {
                    this.targetSpeed = 0;
                }
                // Phase 2 (at tick 35): Flip direction
                else if (this.reverseTimer === 35) {
                    this.direction *= -1;
                    this.targetSpeed = this.baseSpeed * this.direction;
                    this.playSound("click");
                }
                // Phase 3 (ticks 35 -> 0): Accelerate in reverse, still disarmed/safe
                else if (this.reverseTimer <= 0) {
                    this.isReversing = false;
                    this.nextReverseTick = this.survivalTimer + 340 + Math.floor(Math.random() * 260);
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

        // 4. Update player jump physics and evaluate collision
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

            // Collisions strictly occur when armed and NOT during direction reversals
            const canDamage = this.isBeamArmed && !this.isReversing && ps.hitCooldown <= 0;

            if (canDamage) {
                // Test primary laser beam
                const hitPrimary = this.testBeamCollision(this.beamAngle, ps.angle, ps.altitude);

                // Test secondary laser beam if overtime dual beam is active
                const hitSecondary = this.hasDualBeam && this.testBeamCollision(
                    (this.beamAngle + Math.PI) % (Math.PI * 2),
                    ps.angle,
                    ps.altitude
                );

                if (hitPrimary || hitSecondary) {
                    this.zapPlayer(ps);
                }
            }
        });
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
        ps.hitCooldown = 90; // 1.5s invulnerability window
        this.playSound("crash");
        this.shake(8, 16);

        ps.expression = "stunned";
        this.spawnParticles(ps.baseX, ps.baseY, {
            color: "#FF5A36",
            count: 14,
            size: 16,
            speed: 6,
        });

        this.eliminatePlayer(ps.idx);
    }

    runDemoAI() {
        // AI does not jump during safe warm-up or safe reversals
        if (!this.isBeamArmed || this.isReversing) return;

        this.playerStates.forEach((ps) => {
            if (ps.player.isEliminated || ps.isJumping) return;

            const shouldJumpPrimary = this.shouldJumpForBeam(this.beamAngle, ps.angle);
            const shouldJumpSecondary = this.hasDualBeam && this.shouldJumpForBeam(
                (this.beamAngle + Math.PI) % (Math.PI * 2),
                ps.angle
            );

            if (shouldJumpPrimary || shouldJumpSecondary) {
                this.simulateInput(ps.id, "PRESS");
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

        return isApproaching && Math.abs(angleDiff) > 0.14 && Math.abs(angleDiff) < 0.28;
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
        // Draw Primary Laser Beam
        const isPrimaryLethal = this.isBeamArmed && !this.isReversing;
        this.renderSingleBeam(this.beamAngle, isPrimaryLethal);

        // Draw Secondary Laser Beam (Overtime Warning or Full Active)
        if (this.hasDualBeam) {
            const isSecondaryLethal = !this.isReversing;
            this.renderSingleBeam((this.beamAngle + Math.PI) % (Math.PI * 2), isSecondaryLethal);
        } else if (this.isDualBeamDeploying) {
            // Flashing amber guide beam telegraphing incoming dual beam
            this.renderSingleBeam((this.beamAngle + Math.PI) % (Math.PI * 2), false);
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
            // Non-lethal safe tracking guide (during warm-up, direction switches, or deploy warning)
            p.stroke("#F59E0B");
            p.strokeWeight(3);
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

            // Rotating mechanical emitter
            p.rotate(this.beamAngle);
            p.fill("#211B18");
            p.rectMode(p.CENTER);
            p.rect(this.PYLON_RADIUS * 0.4, 0, 36, 20, 5);

            if (this.hasDualBeam || this.isDualBeamDeploying) {
                p.rect(-this.PYLON_RADIUS * 0.4, 0, 36, 20, 5);
            }

            p.fill("#FFFFFF");
            p.circle(this.PYLON_RADIUS * 0.6, 0, 10);
            if (this.hasDualBeam || this.isDualBeamDeploying) {
                p.circle(-this.PYLON_RADIUS * 0.6, 0, 10);
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

            // Armed rotating mechanical core emitter
            p.rotate(this.beamAngle);
            p.fill("#211B18");
            p.rectMode(p.CENTER);
            p.rect(this.PYLON_RADIUS * 0.4, 0, 36, 24, 6);

            if (this.hasDualBeam) {
                p.rect(-this.PYLON_RADIUS * 0.4, 0, 36, 24, 6);
            }

            p.fill("#FFFFFF");
            p.circle(this.PYLON_RADIUS * 0.6, 0, 14);
            if (this.hasDualBeam) {
                p.circle(-this.PYLON_RADIUS * 0.6, 0, 14);
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