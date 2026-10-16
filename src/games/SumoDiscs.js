/* src/games/SumoDiscs.js */

import BaseGame from './BaseGame.js';

export default class SumoDiscs extends BaseGame {

    static get manifest() {
        return {
            id: 'sumo-discs',
            title: 'Sumo Discs',
            description: 'Bump friends off the dojo!',
            tutorial: 'Hold to boost forward! Knock rivals out of the ring!',
            controllerType: 'CONTROLLER',
            tournamentRules: {
                winValue: 3,
                livesPerRound: 1
            }
        };
    }

    onSetup() {
        const count = this.players.length;

        this.config.winCondition = 'SCORE';
        this.config.winValue = count >= 7 ? 3 : 5;
        this.config.roundEndCriteria = 'SURVIVAL';
        this.config.eliminateOnDeath = true;

        // Scale dojo radius dynamically from 440px up to 680px
        this.DOJO_RADIUS = Math.round(380 + Math.min(10, Math.max(2, count)) * 30);
        this.PLAYER_SIZE = 110;

        // Initialize managed physics
        this.enablePhysics({
            gravity: { x: 0, y: 0 }
        });

        // Initialize unified rotate-tap movement (constant unidirectional rotation)
        this.enableRotateTapMovement({
            boostForce: 0.05,
            rotSpeed: 0.08,
            friction: 0.04,
            reverseOnTap: false
        });
    }

    initPlayerEntity(entity, player) {
        const count = this.players.filter(p => !p.isPermEliminated).length;
        const spawnDistance = Math.round(this.DOJO_RADIUS * 0.68);
        const spawnPoints = this.getRadialPositions(count, spawnDistance);
        const spawn = spawnPoints[entity.index] || { x: this.CX, y: this.CY, angle: 0 };

        entity.x = spawn.x;
        entity.y = spawn.y;
        entity.angle = spawn.angle + Math.PI;
        entity.size = this.PLAYER_SIZE;
        entity.expression = 'idle';
        entity.expressionTimer = 0;
        entity.facing = 1;

        const { Bodies } = window.Matter;
        const body = Bodies.circle(spawn.x, spawn.y, this.PLAYER_SIZE / 2, {
            restitution: 1.1,
            frictionAir: 0.04,
            label: `player-${entity.id}`,
            density: 0.002
        });

        this.addPhysicsBody(body);
        entity.body = body;
    }

    onCollisionStart(pair, bodyA, bodyB, entityA, entityB) {
        if (entityA && entityB) {
            this.playSound('bump');
            entityA.expression = 'stunned';
            entityA.expressionTimer = 20;
            entityB.expression = 'stunned';
            entityB.expressionTimer = 20;

            const midX = (entityA.x + entityB.x) / 2;
            const midY = (entityA.y + entityB.y) / 2;
            this.spawnParticles(midX, midY, { color: '#F59E0B', count: 6, size: 8, speed: 4 });
        }
    }

    onFixedUpdate(dt) {
        const activeEntities = this.getActiveEntities();

        for (let i = 0; i < activeEntities.length; i++) {
            const ent = activeEntities[i];

            if (ent.expressionTimer > 0) {
                ent.expressionTimer--;
                if (ent.expressionTimer <= 0) ent.expression = 'idle';
            }

            if (ent.isBoosting) {
                ent.expression = 'angry';
                ent.expressionTimer = 10;
                if (this.p.frameCount % 10 === 0) this.playSound('jump');
                if (this.p.frameCount % 3 === 0) {
                    this.spawnParticles(ent.x, ent.y, { color: '#FFFFFF', count: 1, size: 12, speed: 2 });
                }
            }

            // Ring-out check
            const dist = this.p.dist(ent.x, ent.y, this.CX, this.CY);
            if (dist > this.DOJO_RADIUS + this.PLAYER_SIZE / 4) {
                this.killEntity(ent);
            }
        }
    }

    killEntity(ent) {
        if (ent.body) {
            this.removePhysicsBody(ent.body);
            ent.body = null;
        }

        this.playSound('pop');
        this.shake(10, 15);
        this.spawnParticles(ent.x, ent.y, { color: ent.player.color, count: 12, size: 18, speed: 6 });

        this.eliminatePlayer(ent.index);
    }

    runDemoAI() {
        const activeEntities = this.getActiveEntities();

        activeEntities.forEach(bot => {
            const distFromCenter = this.p.dist(bot.x, bot.y, this.CX, this.CY);

            // Turn back towards center if close to the edge
            if (distFromCenter > this.DOJO_RADIUS * 0.7) {
                const angleToCenter = Math.atan2(this.CY - bot.y, this.CX - bot.x);
                this.steerBot(bot, angleToCenter);
                return;
            }

            // Target nearest rival
            let target = null;
            let minDist = Infinity;
            activeEntities.forEach(enemy => {
                if (enemy === bot) return;
                const d = this.p.dist(bot.x, bot.y, enemy.x, enemy.y);
                if (d < minDist) {
                    minDist = d;
                    target = enemy;
                }
            });

            if (target) {
                const angleToEnemy = Math.atan2(target.y - bot.y, target.x - bot.x);
                this.steerBot(bot, angleToEnemy);
            }
        });
    }

    steerBot(bot, targetAngle) {
        let currentAngle = bot.angle % (Math.PI * 2);
        if (currentAngle < 0) currentAngle += Math.PI * 2;
        let target = targetAngle % (Math.PI * 2);
        if (target < 0) target += Math.PI * 2;
        const diff = target - currentAngle;

        if (Math.abs(diff) < 0.3 || Math.abs(diff) > 6.0) {
            if (this.p.random() < 0.25) {
                this.simulateInput(bot.id, 'PRESS');
                setTimeout(() => this.simulateInput(bot.id, 'RELEASE'), 550);
            }
        }
    }

    onDraw() {
        this.drawDojo();
        this.drawRotateTapArrows({ distance: this.PLAYER_SIZE / 2 + 28, size: 10 });
        // Avatars stay upright facing forward at all times
        this.drawEntities({ shadow: false, rotation: 0, facing: 1 });
        this.drawParticles();
    }

    drawDojo() {
        const p = this.p;
        p.push();
        p.translate(this.CX, this.CY);
        p.noStroke();
        p.fill(220);
        p.circle(0, 0, this.DOJO_RADIUS * 2 + 40);
        p.fill('#fdf6e3');
        p.stroke('#d2b48c');
        p.strokeWeight(8);
        p.circle(0, 0, this.DOJO_RADIUS * 2);
        p.noFill();
        p.stroke(255, 255, 255, 100);
        p.strokeWeight(15);
        p.circle(0, 0, this.DOJO_RADIUS * 1.6);
        p.pop();
    }
}