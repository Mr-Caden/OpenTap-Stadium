/* src/games/SumoDiscs.js */

import BaseGame from './BaseGame.js';

export default class SumoDiscs extends BaseGame {

    static get manifest() {
        return {
            id: 'sumo-discs',
            title: 'Sumo Discs',
            description: 'Bump friends off the dojo!',
            tutorial: 'Hold button to charge. Release to bump!',
            controllerType: 'CONTROLLER',
            tournamentRules: {
                winValue: 3,
                livesPerRound: 1
            }
        };
    }

    onSetup() {
        this.config.winCondition = 'SCORE';
        this.config.winValue = 5;
        this.config.roundEndCriteria = 'SURVIVAL';
        this.config.eliminateOnDeath = true;

        this.DOJO_RADIUS = 500;
        this.PLAYER_SIZE = 110;
        this.BOOST_FORCE = 0.05;
        this.FRICTION = 0.04;

        const { Engine, World, Bodies, Composite, Events } = Matter;
        this.engine = Engine.create();
        this.world = this.engine.world;
        this.engine.gravity.y = 0;

        this.dojo = Bodies.circle(this.CX, this.CY, this.DOJO_RADIUS, {
            isStatic: true, isSensor: true, label: 'dojo'
        });
        Composite.add(this.world, this.dojo);

        Events.on(this.engine, 'collisionStart', (e) => this.handleCollisions(e));
    }

    runDemoAI() {
        const p = this.p;
        const activeBots = this.gamePlayers.filter(gp => !gp.isDead && !this.players[gp.idx].isEliminated);

        activeBots.forEach(bot => {
            const botPos = bot.body.position;
            const distFromCenter = p.dist(botPos.x, botPos.y, this.CX, this.CY);
            if (distFromCenter > this.DOJO_RADIUS * 0.7) {
                const angleToCenter = Math.atan2(this.CY - botPos.y, this.CX - botPos.x);
                this.steerBot(bot, angleToCenter);
                return;
            }

            let target = null;
            let minDist = 9999;
            activeBots.forEach(enemy => {
                if (enemy === bot) return;
                const d = p.dist(botPos.x, botPos.y, enemy.body.position.x, enemy.body.position.y);
                if (d < minDist) {
                    minDist = d;
                    target = enemy;
                }
            });

            if (target) {
                const angleToEnemy = Math.atan2(target.body.position.y - botPos.y, target.body.position.x - botPos.x);
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
            if (this.p.random() < 0.2) {
                this.simulateInput(bot.idx, 'PRESS');
                setTimeout(() => this.simulateInput(bot.idx, 'RELEASE'), 600);
            }
        }
    }

    onPlayerInput(player, type) {
        if (!this.gamePlayers) return;
        const gp = this.gamePlayers.find(p => p.id === player.id);
        if (!gp || gp.isDead) return;

        if (type === 'PRESS') gp.isBoosting = true;
        if (type === 'RELEASE') gp.isBoosting = false;
    }

    onRoundStart() {
        Matter.Composite.clear(this.world, false, true);
        Matter.Composite.add(this.world, this.dojo);

        const activeCount = this.players.filter(p => !p.isEliminated).length;
        const spawnPoints = this.getRadialPositions(activeCount, 350);
        let spawnIndex = 0;

        this.gamePlayers = this.players.map((pState, index) => {
            if (pState.isEliminated) return null;

            const spawn = spawnPoints[spawnIndex++];
            const body = Matter.Bodies.circle(
                spawn.x,
                spawn.y,
                this.PLAYER_SIZE / 2,
                {
                    restitution: 1.1,
                    frictionAir: this.FRICTION,
                    label: `player-${index}`,
                    density: 0.002
                }
            );
            Matter.Composite.add(this.world, body);

            return {
                id: pState.id,
                idx: index,
                body: body,
                angle: spawn.angle + this.p.PI,
                expression: 'idle',
                expressionTimer: 0,
                config: pState,
                isBoosting: false,
                isDead: false
            };
        }).filter(p => p !== null);
    }

    onFixedUpdate(dt) {
        const p = this.p;
        if (!this.gamePlayers) return;

        this.gamePlayers.forEach(gp => {
            if (gp.isDead) return;
            const basePlayer = this.players[gp.idx];
            if (!basePlayer || basePlayer.isEliminated) return;

            if (gp.isBoosting) {
                const force = p5.Vector.fromAngle(gp.angle).mult(this.BOOST_FORCE);
                Matter.Body.applyForce(gp.body, gp.body.position, { x: force.x, y: force.y });

                gp.expression = 'angry';
                gp.expressionTimer = 10;

                if (p.frameCount % 10 === 0) this.playSound('jump');
                if (p.frameCount % 3 === 0) {
                    this.spawnParticles(gp.body.position.x, gp.body.position.y, { color: '#FFFFFF', count: 1, size: 12, speed: 2 });
                }
            } else {
                gp.angle += 0.08;
            }

            const dist = p.dist(gp.body.position.x, gp.body.position.y, this.CX, this.CY);
            if (dist > this.DOJO_RADIUS + this.PLAYER_SIZE / 4) {
                this.killPlayer(gp);
            }

            if (gp.expressionTimer > 0) {
                gp.expressionTimer--;
                if (gp.expressionTimer <= 0) gp.expression = 'idle';
            }
        });
    }

    onDraw() {
        this.drawDojo();

        if (this.gamePlayers) {
            this.gamePlayers.forEach(gp => {
                if (gp.isDead) return;
                const basePlayer = this.players[gp.idx];
                if (!basePlayer || basePlayer.isEliminated) return;

                this.drawDirectionArrow(gp.body.position.x, gp.body.position.y, gp.angle, {
                    distance: this.PLAYER_SIZE / 2 + 30,
                    size: 10,
                    color: gp.config.color,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 2
                });

                let anim = 'IDLE';
                if (gp.isBoosting) anim = 'RUN';
                if (gp.expression === 'stunned') anim = 'DIZZY';

                this.drawAvatar(gp, gp.body.position.x, gp.body.position.y, {
                    size: this.PLAYER_SIZE,
                    anim: anim,
                    expression: gp.expression,
                    facing: Math.cos(gp.angle) > 0 ? 1 : -1
                });
            });
        }

        this.drawParticles();
    }

    killPlayer(gp) {
        if (gp.isDead) return;
        gp.isDead = true;

        Matter.Composite.remove(this.world, gp.body);
        this.playSound('pop');
        this.shake(10, 15);
        this.spawnParticles(gp.body.position.x, gp.body.position.y, { color: gp.config.color, count: 12, size: 18, speed: 6 });

        this.eliminatePlayer(gp.idx);
    }

    handleCollisions(event) {
        const pairs = event.pairs;
        pairs.forEach(pair => {
            if (pair.bodyA.label.startsWith('player') && pair.bodyB.label.startsWith('player')) {
                this.playSound('bump');
                const midX = (pair.bodyA.position.x + pair.bodyB.position.x) / 2;
                const midY = (pair.bodyA.position.y + pair.bodyB.position.y) / 2;
                this.spawnParticles(midX, midY, { color: '#F59E0B', count: 6, size: 8, speed: 4 });

                if (!this.gamePlayers) return;
                const pA = this.gamePlayers.find(p => p.body === pair.bodyA);
                const pB = this.gamePlayers.find(p => p.body === pair.bodyB);
                if (pA && !pA.isDead) { pA.expression = 'stunned'; pA.expressionTimer = 20; }
                if (pB && !pB.isDead) { pB.expression = 'stunned'; pB.expressionTimer = 20; }
            }
        });
    }

    drawDojo() {
        const p = this.p;
        p.push();
        p.translate(this.CX, this.CY);
        p.noStroke(); p.fill(220); p.circle(0, 0, this.DOJO_RADIUS * 2 + 40);
        p.fill('#fdf6e3'); p.stroke('#d2b48c'); p.strokeWeight(8);
        p.circle(0, 0, this.DOJO_RADIUS * 2);
        p.noFill(); p.stroke(255, 255, 255, 100); p.strokeWeight(15);
        p.circle(0, 0, this.DOJO_RADIUS * 1.6);
        p.pop();
    }
}