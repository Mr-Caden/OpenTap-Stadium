/* src/games/OrbitSling.js */

import BaseGame from './BaseGame.js';

export default class OrbitSling extends BaseGame {

    static get manifest() {
        return {
            id: 'orbit-sling',
            title: 'Orbit Sling',
            description: 'Sling between gravity pylons to snatch stars!',
            tutorial: 'Tap to release tether and fling! Snatch the golden stars!',
            controllerType: 'CONTROLLER',
            tournamentRules: {
                winValue: 5,
                livesPerRound: 1
            }
        };
    }

    onSetup() {
        const playerCount = this.players.length;

        // Dynamic player count scaling
        this.config.winCondition = 'SCORE';
        this.config.winValue = playerCount >= 7 ? 4 : 5;
        this.config.livesPerRound = 1;
        this.config.eliminateOnDeath = false;
        this.config.roundEndCriteria = 'NONE';
        this.config.showRoundResultUI = false;

        // Controlled, deliberate orbital speeds
        this.LAUNCH_SPEED = 14.5;
        this.BASE_ORBIT_SPEED = 0.036;
        this.MIN_ORBIT_RADIUS = 95;
        this.MAX_ORBIT_RADIUS = 145;
        this.CAPTURE_RADIUS = 180;

        // Scale star count with player count (2 to 5 stars)
        this.MAX_STARS = Math.min(5, Math.max(2, Math.floor(playerCount * 0.5) + 1));

        // Bounding arena geometry with bumper margins
        this.ARENA_PADDING = 85;
        this.MIN_X = this.ARENA_PADDING;
        this.MAX_X = this.V_WIDTH - this.ARENA_PADDING;
        this.MIN_Y = this.ARENA_PADDING;
        this.MAX_Y = this.V_HEIGHT - this.ARENA_PADDING;

        // Five orbital gravity pylons (center plus four quadrants)
        this.pylons = [
            { x: this.CX, y: this.CY, radius: 46, pulse: 0 },
            { x: this.CX - 460, y: this.CY - 280, radius: 40, pulse: 0 },
            { x: this.CX + 460, y: this.CY - 280, radius: 40, pulse: 0 },
            { x: this.CX - 460, y: this.CY + 280, radius: 40, pulse: 0 },
            { x: this.CX + 460, y: this.CY + 280, radius: 40, pulse: 0 }
        ];

        this.stars = [];
    }

    initPlayerEntity(entity, player) {
        // Distribute players across outer orbital pylons on spawn
        const outerPylonIndices = [1, 2, 3, 4];
        const assignedPylonIdx = outerPylonIndices[entity.index % outerPylonIndices.length];
        const pylon = this.pylons[assignedPylonIdx];

        const initialAngle = (Math.PI * 2 / Math.max(1, this.players.length)) * entity.index;
        const orbitRadius = 120;

        entity.x = pylon.x + Math.cos(initialAngle) * orbitRadius;
        entity.y = pylon.y + Math.sin(initialAngle) * orbitRadius;
        entity.vx = 0;
        entity.vy = 0;
        entity.size = 85;
        entity.state = 'ORBITING';
        entity.pylonIndex = assignedPylonIdx;
        entity.orbitRadius = orbitRadius;
        entity.orbitAngle = initialAngle;
        entity.orbitSpeed = (entity.index % 2 === 0) ? this.BASE_ORBIT_SPEED : -this.BASE_ORBIT_SPEED;
        entity.pylonCooldown = 0;
        entity.trailTimer = 0;
        entity.expression = 'happy';
        entity.facing = 1;
        entity.angle = 0;
    }

    onRoundStart() {
        this.stars = [];
        for (let i = 0; i < this.MAX_STARS; i++) {
            this.spawnStar();
        }
    }

    spawnStar() {
        // Safe spawn threshold strictly outside pylon capture and orbit limits
        const MIN_DISTANCE_FROM_PYLON = this.CAPTURE_RADIUS + 75; // 255px safe clearance
        let candidateX = 0;
        let candidateY = 0;
        let valid = false;
        let attempts = 0;

        while (!valid && attempts < 100) {
            candidateX = this.MIN_X + 140 + Math.random() * (this.MAX_X - this.MIN_X - 280);
            candidateY = this.MIN_Y + 140 + Math.random() * (this.MAX_Y - this.MIN_Y - 280);

            valid = true;
            for (let i = 0; i < this.pylons.length; i++) {
                const p = this.pylons[i];
                const dx = candidateX - p.x;
                const dy = candidateY - p.y;
                if (Math.sqrt(dx * dx + dy * dy) < MIN_DISTANCE_FROM_PYLON) {
                    valid = false;
                    break;
                }
            }
            attempts++;
        }

        this.stars.push({
            x: candidateX,
            y: candidateY,
            size: 38,
            rotation: Math.random() * Math.PI,
            pulseTimer: Math.random() * 100
        });
    }

    onPlayerInput(player, type, payload, entity) {
        if (!entity || player.isEliminated) return;

        if (type === 'PRESS' && entity.state === 'ORBITING') {
            this.releaseTether(entity);
        }
    }

    releaseTether(entity) {
        const pylon = this.pylons[entity.pylonIndex];
        if (!pylon) return;

        // Fling offset: Rewind launch angle slightly to compensate for human reaction delay
        // This ensures the avatar flings where the player intended when deciding to press
        const reactionCompensation = entity.orbitSpeed * 3.4;
        const adjustedOrbitAngle = entity.orbitAngle - reactionCompensation;

        const tangentOffset = entity.orbitSpeed >= 0 ? Math.PI / 2 : -Math.PI / 2;
        const launchAngle = adjustedOrbitAngle + tangentOffset;

        entity.vx = Math.cos(launchAngle) * this.LAUNCH_SPEED;
        entity.vy = Math.sin(launchAngle) * this.LAUNCH_SPEED;
        entity.state = 'FLYING';
        entity.pylonCooldown = 18;
        entity.anim = 'ATTACK';
        entity.expression = 'angry';
        entity.angle = launchAngle;
        entity.facing = entity.vx >= 0 ? 1 : -1;

        this.playSound('jump');
        this.spawnParticles(entity.x, entity.y, {
            color: entity.player.color,
            count: 10,
            size: 14,
            speed: 5
        });
    }

    onFixedUpdate(dt) {
        // Animate pylon energy rings
        for (let i = 0; i < this.pylons.length; i++) {
            this.pylons[i].pulse = (this.pylons[i].pulse + 0.035) % (Math.PI * 2);
        }

        // Animate floating stars
        for (let i = 0; i < this.stars.length; i++) {
            const star = this.stars[i];
            star.rotation += 0.025;
            star.pulseTimer += 0.04;
        }

        const activeEntities = this.getActiveEntities();

        for (let i = 0; i < activeEntities.length; i++) {
            const ent = activeEntities[i];

            if (ent.state === 'ORBITING') {
                this.updateOrbitingEntity(ent);
            } else if (ent.state === 'FLYING') {
                this.updateFlyingEntity(ent);
            }

            this.checkStarCollisions(ent);
        }

        // Check mid-air player bumps
        for (let i = 0; i < activeEntities.length; i++) {
            for (let j = i + 1; j < activeEntities.length; j++) {
                this.checkPlayerBump(activeEntities[i], activeEntities[j]);
            }
        }
    }

    updateOrbitingEntity(ent) {
        const pylon = this.pylons[ent.pylonIndex];
        if (!pylon) return;

        ent.orbitAngle += ent.orbitSpeed;
        ent.x = pylon.x + Math.cos(ent.orbitAngle) * ent.orbitRadius;
        ent.y = pylon.y + Math.sin(ent.orbitAngle) * ent.orbitRadius;
        ent.anim = 'RUN';

        // Avatar always faces forward in the direction of its orbital movement (no moonwalking)
        const tangentVx = -Math.sin(ent.orbitAngle) * ent.orbitSpeed;
        ent.facing = tangentVx >= 0 ? 1 : -1;
        ent.angle = 0; // Keep avatar naturally upright while running on orbit

        if (ent.pylonCooldown > 0) {
            ent.pylonCooldown--;
        }
    }

    updateFlyingEntity(ent) {
        ent.x += ent.vx;
        ent.y += ent.vy;

        // Facing matches horizontal trajectory
        if (Math.abs(ent.vx) > 0.1) {
            ent.facing = ent.vx >= 0 ? 1 : -1;
        }

        // Particle trail
        ent.trailTimer++;
        if (ent.trailTimer % 3 === 0) {
            this.spawnParticles(ent.x, ent.y, {
                color: ent.player.color,
                count: 1,
                size: 10,
                speed: 1,
                gravity: 0
            });
        }

        if (ent.pylonCooldown > 0) {
            ent.pylonCooldown--;
        }

        // Arena perimeter bumper bounce
        const bumperElasticity = 0.95;
        let bounced = false;

        if (ent.x <= this.MIN_X + ent.size / 2) {
            ent.x = this.MIN_X + ent.size / 2;
            ent.vx = Math.abs(ent.vx) * bumperElasticity;
            bounced = true;
        } else if (ent.x >= this.MAX_X - ent.size / 2) {
            ent.x = this.MAX_X - ent.size / 2;
            ent.vx = -Math.abs(ent.vx) * bumperElasticity;
            bounced = true;
        }

        if (ent.y <= this.MIN_Y + ent.size / 2) {
            ent.y = this.MIN_Y + ent.size / 2;
            ent.vy = Math.abs(ent.vy) * bumperElasticity;
            bounced = true;
        } else if (ent.y >= this.MAX_Y - ent.size / 2) {
            ent.y = this.MAX_Y - ent.size / 2;
            ent.vy = -Math.abs(ent.vy) * bumperElasticity;
            bounced = true;
        }

        if (bounced) {
            this.playSound('bump');
            this.shake(4, 8);
            this.spawnParticles(ent.x, ent.y, {
                color: '#FF5A36',
                count: 6,
                size: 12,
                speed: 4
            });
        }

        // Test capture by any orbital pylon
        if (ent.pylonCooldown <= 0) {
            for (let pIdx = 0; pIdx < this.pylons.length; pIdx++) {
                const pylon = this.pylons[pIdx];
                const dx = ent.x - pylon.x;
                const dy = ent.y - pylon.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= this.CAPTURE_RADIUS) {
                    const cross = dx * ent.vy - dy * ent.vx;
                    const orbitDir = cross >= 0 ? 1 : -1;

                    ent.state = 'ORBITING';
                    ent.pylonIndex = pIdx;
                    ent.orbitRadius = Math.max(this.MIN_ORBIT_RADIUS, Math.min(this.MAX_ORBIT_RADIUS, dist));
                    ent.orbitAngle = Math.atan2(dy, dx);
                    ent.orbitSpeed = this.BASE_ORBIT_SPEED * orbitDir;
                    ent.vx = 0;
                    ent.vy = 0;
                    ent.anim = 'IDLE';
                    ent.expression = 'happy';

                    this.playSound('pop');
                    this.spawnParticles(ent.x, ent.y, {
                        color: '#F59E0B',
                        count: 8,
                        size: 12,
                        speed: 3
                    });
                    break;
                }
            }
        }
    }

    checkStarCollisions(ent) {
        for (let i = this.stars.length - 1; i >= 0; i--) {
            const star = this.stars[i];
            const dx = ent.x - star.x;
            const dy = ent.y - star.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < (ent.size / 2 + star.size / 2)) {
                this.stars.splice(i, 1);
                ent.player.score++;
                this.updateUI();

                this.playSound('win');
                this.spawnParticles(star.x, star.y, {
                    color: '#F59E0B',
                    count: 18,
                    size: 18,
                    speed: 7
                });

                this.spawnStar();

                if (ent.player.score >= this.config.winValue) {
                    this.endRound(ent.player);
                    return;
                }
            }
        }
    }

    checkPlayerBump(entA, entB) {
        if (entA.state !== 'FLYING' && entB.state !== 'FLYING') return;

        const dx = entB.x - entA.x;
        const dy = entB.y - entA.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = (entA.size + entB.size) * 0.45;

        if (dist < minDist && dist > 0.001) {
            const nx = dx / dist;
            const ny = dy / dist;

            entA.vx = -nx * this.LAUNCH_SPEED * 0.8;
            entA.vy = -ny * this.LAUNCH_SPEED * 0.8;
            entB.vx = nx * this.LAUNCH_SPEED * 0.8;
            entB.vy = ny * this.LAUNCH_SPEED * 0.8;

            entA.state = 'FLYING';
            entB.state = 'FLYING';
            entA.pylonCooldown = 12;
            entB.pylonCooldown = 12;

            entA.expression = 'stunned';
            entB.expression = 'stunned';

            this.playSound('crash');
            this.shake(6, 10);
            this.spawnParticles((entA.x + entB.x) / 2, (entA.y + entB.y) / 2, {
                color: '#FFFFFF',
                count: 12,
                size: 14,
                speed: 5
            });
        }
    }

    runDemoAI() {
        const activeEntities = this.getActiveEntities();
        if (this.stars.length === 0) return;

        for (let i = 0; i < activeEntities.length; i++) {
            const ent = activeEntities[i];
            if (ent.state !== 'ORBITING') continue;

            const pylon = this.pylons[ent.pylonIndex];
            if (!pylon) continue;

            // Find closest target star
            let closestStar = null;
            let minDist = Infinity;
            for (let s = 0; s < this.stars.length; s++) {
                const st = this.stars[s];
                const d = Math.hypot(st.x - ent.x, st.y - ent.y);
                if (d < minDist) {
                    minDist = d;
                    closestStar = st;
                }
            }

            if (!closestStar) continue;

            // Check if current release tangent aims directly at the star
            const reactionCompensation = ent.orbitSpeed * 3.4;
            const adjustedAngle = ent.orbitAngle - reactionCompensation;
            const tangentOffset = ent.orbitSpeed >= 0 ? Math.PI / 2 : -Math.PI / 2;
            const launchAngle = adjustedAngle + tangentOffset;
            const angleToStar = Math.atan2(closestStar.y - ent.y, closestStar.x - ent.x);

            const diff = Math.atan2(Math.sin(launchAngle - angleToStar), Math.cos(launchAngle - angleToStar));

            if (Math.abs(diff) < 0.25) {
                this.simulateInput(ent.id, 'PRESS');
            }
        }
    }

    onDraw() {
        this.drawArenaBackdrop();
        this.drawPylons();
        this.drawStars();
        this.drawTethers();
        this.drawEntities();
        this.drawParticles();
    }

    drawArenaBackdrop() {
        const p = this.p;

        p.noStroke();
        p.fill(245, 240, 232);
        p.rect(0, 0, this.V_WIDTH, this.V_HEIGHT);

        // Neon border bumpers
        p.stroke('#211B18');
        p.strokeWeight(12);
        p.noFill();
        p.rect(
            this.MIN_X,
            this.MIN_Y,
            this.MAX_X - this.MIN_X,
            this.MAX_Y - this.MIN_Y,
            32
        );

        p.fill('#FF5A36');
        p.noStroke();
        p.circle(this.MIN_X + 16, this.MIN_Y + 16, 18);
        p.circle(this.MAX_X - 16, this.MIN_Y + 16, 18);
        p.circle(this.MIN_X + 16, this.MAX_Y - 16, 18);
        p.circle(this.MAX_X - 16, this.MAX_Y - 16, 18);
    }

    drawPylons() {
        const p = this.p;

        for (let i = 0; i < this.pylons.length; i++) {
            const pylon = this.pylons[i];

            // Outer gravitational boundary
            p.noFill();
            p.stroke(232, 225, 213, 160);
            p.strokeWeight(2);
            p.circle(pylon.x, pylon.y, this.CAPTURE_RADIUS * 2);

            // Pulsing energy wave
            const pulseSize = pylon.radius + Math.sin(pylon.pulse) * 14 + 16;
            p.stroke(255, 90, 54, 75);
            p.strokeWeight(3);
            p.circle(pylon.x, pylon.y, pulseSize * 2);

            // Pylon core
            p.noStroke();
            p.fill(33, 27, 24);
            p.circle(pylon.x, pylon.y, pylon.radius * 2);

            p.fill('#FF5A36');
            p.circle(pylon.x, pylon.y, pylon.radius * 0.9);

            p.fill(255);
            p.circle(pylon.x, pylon.y, pylon.radius * 0.35);
        }
    }

    drawTethers() {
        const p = this.p;
        const activeEntities = this.getActiveEntities();

        for (let i = 0; i < activeEntities.length; i++) {
            const ent = activeEntities[i];
            if (ent.state === 'ORBITING') {
                const pylon = this.pylons[ent.pylonIndex];
                if (!pylon) continue;

                p.stroke(ent.player.color);
                p.strokeWeight(5);
                p.line(pylon.x, pylon.y, ent.x, ent.y);

                p.stroke(255, 220);
                p.strokeWeight(2);
                p.line(pylon.x, pylon.y, ent.x, ent.y);
            }
        }
    }

    drawStars() {
        const p = this.p;

        for (let i = 0; i < this.stars.length; i++) {
            const star = this.stars[i];
            const pulse = 1 + Math.sin(star.pulseTimer) * 0.12;

            p.push();
            p.translate(star.x, star.y);
            p.rotate(star.rotation);
            p.scale(pulse);

            p.noStroke();
            p.fill(245, 158, 11, 60);
            p.circle(0, 0, star.size * 2);

            p.fill('#F59E0B');
            p.stroke('#211B18');
            p.strokeWeight(3);
            p.beginShape();
            for (let a = 0; a < p.TWO_PI; a += p.TWO_PI / 10) {
                const r = (a % (p.TWO_PI / 5) === 0) ? star.size : star.size * 0.45;
                p.vertex(Math.cos(a) * r, Math.sin(a) * r);
            }
            p.endShape(p.CLOSE);

            p.fill(255);
            p.noStroke();
            p.circle(-star.size * 0.25, -star.size * 0.25, star.size * 0.25);

            p.pop();
        }
    }
}