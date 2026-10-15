/* src/games/BombTag.js */

import BaseGame from './BaseGame.js';

export default class BombTag extends BaseGame {

    static get manifest() {
        return {
            id: 'bomb-tag',
            title: 'Bomb Tag',
            description: 'Pass the bomb before it blows!',
            tutorial: 'Run into players to pass the bomb!',
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
        this.config.livesPerRound = 1; 
        this.config.eliminateOnDeath = true; 
        this.config.roundEndCriteria = 'NONE'; 
        
        this.ARENA_W = 1400; 
        this.ARENA_H = 900;
        this.PLAYER_SIZE = 90;
        this.BOOST_FORCE = 0.055; 
        this.FRICTION = 0.05;
        this.ROTATION_SPEED = 0.09;
        
        this.BOMB_DURATION_BASE = 15 * 60; 
        this.BOMB_SPEED = 0.022;

        const { Engine, World, Bodies, Composite, Events } = Matter;
        this.engine = Engine.create();
        this.world = this.engine.world;
        this.engine.gravity.y = 0;

        this.createWalls();

        this.bombTimer = 0;
        this.bombHolderId = null;
        this.tagCooldown = 0;
        this.neutralTarget = null;
        this.handAnim = 0; 

        this.bombBody = Bodies.circle(this.CX, this.CY, 35, {
            restitution: 1.1,
            label: 'bomb',
            friction: 0,
            frictionAir: 0.005,
            density: 0.02
        });
        Composite.add(this.world, this.bombBody);

        Events.on(this.engine, 'collisionStart', (e) => this.handleCollisions(e));
    }

    createWalls() {
        const { Bodies, Composite } = Matter;
        const wallOpts = { isStatic: true, render: { fillStyle: '#bdc3c7' }, restitution: 1.0 };
        const thick = 100;
        const cx = this.CX; const cy = this.CY;
        const w = this.ARENA_W; const h = this.ARENA_H;

        const walls = [
            Bodies.rectangle(cx, cy - h / 2 - thick / 2, w + thick * 2, thick, wallOpts), 
            Bodies.rectangle(cx, cy + h / 2 + thick / 2, w + thick * 2, thick, wallOpts), 
            Bodies.rectangle(cx - w / 2 - thick / 2, cy, thick, h, wallOpts), 
            Bodies.rectangle(cx + w / 2 + thick / 2, cy, thick, h, wallOpts) 
        ];
        Composite.add(this.world, walls);
    }

    onRoundStart() {
        this.softReset();
    }

    softReset() {
        this.bombTimer = this.BOMB_DURATION_BASE;
        this.tagCooldown = 0;
        this.bombHolderId = null;
        this.neutralTarget = null;

        const bodiesToRemove = this.world.bodies.filter(b => b.label.startsWith('player'));
        Matter.Composite.remove(this.world, bodiesToRemove);

        Matter.Body.setPosition(this.bombBody, { x: this.CX, y: this.CY });
        Matter.Body.setVelocity(this.bombBody, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(this.bombBody, 0);
        
        if (!this.world.bodies.includes(this.bombBody)) {
            Matter.Composite.add(this.world, this.bombBody);
        }

        const activePlayers = this.players.filter(p => !p.isEliminated);
        
        const spawnPoints = [
            { x: this.CX - 500, y: this.CY - 300 },
            { x: this.CX + 500, y: this.CY + 300 },
            { x: this.CX + 500, y: this.CY - 300 },
            { x: this.CX - 500, y: this.CY + 300 },
            { x: this.CX, y: this.CY - 350 },
            { x: this.CX, y: this.CY + 350 }
        ];

        this.gamePlayers = activePlayers.map((basePlayer, i) => {
            const pos = spawnPoints[i % spawnPoints.length];
            const x = pos.x + this.p.random(-20, 20);
            const y = pos.y + this.p.random(-20, 20);

            const body = Matter.Bodies.circle(x, y, this.PLAYER_SIZE / 2, {
                restitution: 0.8, 
                frictionAir: this.FRICTION, 
                label: `player-${basePlayer.id}`, 
                density: 0.005
            });

            Matter.Composite.add(this.world, body);

            return {
                id: basePlayer.id,
                idx: this.players.indexOf(basePlayer),
                body: body,
                angle: Math.atan2(this.CY - y, this.CX - x), 
                expression: 'idle',
                expressionTimer: 0,
                isBoosting: false 
            };
        });
    }

    onPlayerInput(player, type) {
        const gp = this.gamePlayers.find(p => p.id === player.id);
        if (!gp || this.players[gp.idx].isEliminated) return;

        if (type === 'PRESS') gp.isBoosting = true;
        if (type === 'RELEASE') gp.isBoosting = false;
    }

    runDemoAI() {
        const p = this.p;
        const activeBots = this.gamePlayers.filter(gp => !this.players[gp.idx].isEliminated);

        activeBots.forEach(bot => {
            const pos = bot.body.position;
            let targetPos = null;
            let mode = 'CHASE';

            const edgeMargin = 150;
            const nearLeft = pos.x < (this.CX - this.ARENA_W/2 + edgeMargin);
            const nearRight = pos.x > (this.CX + this.ARENA_W/2 - edgeMargin);
            const nearTop = pos.y < (this.CY - this.ARENA_H/2 + edgeMargin);
            const nearBottom = pos.y > (this.CY + this.ARENA_H/2 - edgeMargin);

            if (nearLeft || nearRight || nearTop || nearBottom) {
                targetPos = { x: this.CX, y: this.CY };
                mode = 'CHASE';
            } 
            else if (this.bombHolderId === null) {
                targetPos = this.bombBody.position;
                mode = 'CHASE';
            }
            else if (bot.id === this.bombHolderId) {
                let nearest = null;
                let minDist = Infinity;
                activeBots.forEach(other => {
                    if (other === bot) return;
                    const d = p.dist(pos.x, pos.y, other.body.position.x, other.body.position.y);
                    if (d < minDist) { minDist = d; nearest = other; }
                });
                if (nearest) targetPos = nearest.body.position;
                mode = 'CHASE';
            }
            else {
                const holder = activeBots.find(gp => gp.id === this.bombHolderId);
                if (holder) {
                    targetPos = holder.body.position;
                    mode = 'FLEE';
                }
            }

            if (!targetPos) return;

            const angleToTarget = Math.atan2(targetPos.y - pos.y, targetPos.x - pos.x);
            const desiredAngle = mode === 'CHASE' ? angleToTarget : angleToTarget + Math.PI;
            const diff = Math.atan2(Math.sin(desiredAngle - bot.angle), Math.cos(desiredAngle - bot.angle));

            if (Math.abs(diff) < 0.6) {
                if (!bot.isBoosting) {
                    this.simulateInput(bot.idx, 'PRESS');
                }
            } else {
                if (bot.isBoosting) {
                    this.simulateInput(bot.idx, 'RELEASE');
                }
            }
        });
    }

    onFixedUpdate(dt) {
        const p = this.p;

        if (this.bombHolderId !== null) {
            if (this.bombTimer > 0) {
                this.bombTimer--;
                if (this.bombTimer <= 0) this.explodeBomb();
                if (this.bombTimer % 60 === 0 && this.bombTimer < 300) {
                    this.playSound('click');
                }
            }
        } else {
            this.updateNeutralBomb();
        }

        if (this.tagCooldown > 0) this.tagCooldown--;

        this.gamePlayers.forEach(gp => {
            if (this.players[gp.idx].isEliminated) return;

            if (gp.isBoosting) {
                const force = p5.Vector.fromAngle(gp.angle).mult(this.BOOST_FORCE);
                Matter.Body.applyForce(gp.body, gp.body.position, { x: force.x, y: force.y });
                
                gp.expression = 'angry';
                gp.expressionTimer = 10;
                if (p.frameCount % 5 === 0) {
                    this.spawnParticles(gp.body.position.x, gp.body.position.y, { color: '#FFFFFF', count: 1, size: 8, speed: 2 });
                }
            } else {
                gp.angle += this.ROTATION_SPEED;
            }

            if (gp.id === this.bombHolderId) {
                gp.expression = 'stunned';
            } else if (gp.expressionTimer > 0) {
                gp.expressionTimer--;
                if (gp.expressionTimer <= 0) gp.expression = 'idle';
            }
        });
    }

    onDraw() {
        this.p.push();
        this.p.translate(this.CX, this.CY);
        this.p.fill('#FAF6F0'); this.p.noStroke(); 
        this.p.rectMode(this.p.CENTER); 
        this.p.rect(0, 0, this.ARENA_W, this.ARENA_H);
        
        const w = this.ARENA_W; const h = this.ARENA_H; const thick = 100;
        this.p.fill('#D8D1C7');
        this.p.rect(0, -h / 2 - thick / 2, w + thick * 2, thick);
        this.p.rect(0, h / 2 + thick / 2, w + thick * 2, thick);
        this.p.rect(-w / 2 - thick / 2, 0, thick, h);
        this.p.rect(w / 2 + thick / 2, 0, thick, h);
        this.p.pop();

        if (this.bombHolderId === null) {
            const pos = this.bombBody.position;
            this.drawBomb(pos.x, pos.y, true);
        }

        this.drawPlayers();
        this.drawParticles();
        this.drawTimerBadge(this.bombHolderId !== null ? Math.ceil(this.bombTimer / 60) : "GET BOMB!", {
            y: 80,
            width: this.bombHolderId !== null ? 140 : 220,
            criticalThreshold: 5,
            fontSize: this.bombHolderId !== null ? 46 : 24
        });
    }

    updateNeutralBomb() {
        if (this.p.frameCount % 60 === 0 || !this.neutralTarget) {
            let nearest = null;
            let minDist = 9999;

            this.gamePlayers.forEach(gp => {
                if (this.players[gp.idx].isEliminated) return;
                const d = Matter.Vector.magnitude(Matter.Vector.sub(gp.body.position, this.bombBody.position));
                if (d < minDist) {
                    minDist = d;
                    nearest = gp;
                }
            });
            this.neutralTarget = nearest;
        }

        if (this.neutralTarget) {
            const force = Matter.Vector.sub(this.neutralTarget.body.position, this.bombBody.position);
            const norm = Matter.Vector.normalise(force);
            Matter.Body.applyForce(this.bombBody, this.bombBody.position, Matter.Vector.mult(norm, this.BOMB_SPEED));
        }
    }

    handleCollisions(event) {
        if (this.tagCooldown > 0) return;

        const pairs = event.pairs;
        pairs.forEach(pair => {
            const labelA = pair.bodyA.label;
            const labelB = pair.bodyB.label;

            if (labelA.startsWith('player') && labelB.startsWith('player')) {
                const idA = parseInt(labelA.split('-')[1]);
                const idB = parseInt(labelB.split('-')[1]);

                if (idA === this.bombHolderId || idB === this.bombHolderId) {
                    const newHolder = (idA === this.bombHolderId) ? idB : idA;
                    this.bombHolderId = newHolder;
                    this.tagCooldown = 30; 
                    this.playSound('bump');
                    
                    const pos = pair.collision.supports[0] || pair.bodyA.position;
                    this.spawnParticles(pos.x, pos.y, { color: '#FFFFFF', count: 10, size: 14, speed: 5 });
                }
            }

            if (this.bombHolderId === null && (labelA === 'bomb' || labelB === 'bomb')) {
                const otherBody = labelA === 'bomb' ? pair.bodyB : pair.bodyA;
                if (!otherBody.label.startsWith('player')) return; 

                const id = parseInt(otherBody.label.split('-')[1]);
                this.bombHolderId = id;
                this.playSound('lock');
                Matter.Composite.remove(this.world, this.bombBody);
            }
        });
    }

    explodeBomb() {
        this.playSound('crash');
        this.shake(30, 40);

        const victimGP = this.gamePlayers.find(gp => gp.id === this.bombHolderId);
        if (!victimGP) return;

        const victimName = this.players[victimGP.idx].name;
        this.ui.showTurnMessage(`${victimName} Exploded!`, '#FF5A36');

        this.eliminatePlayer(victimGP.idx); 

        const pos = victimGP.body.position;
        this.spawnParticles(pos.x, pos.y, { color: '#211B18', count: 20, size: 24, speed: 7 });
        this.spawnParticles(pos.x, pos.y, { color: '#FF5A36', count: 20, size: 20, speed: 8 });
        
        Matter.Composite.remove(this.world, victimGP.body);

        this.players.forEach(p => {
            if (!p.isEliminated && p.id !== this.bombHolderId) {
                p.score++;
            }
        });
        this.updateUI();

        const survivors = this.players.filter(p => !p.isEliminated);
        
        if (survivors.length <= 1) {
            const winner = survivors[0];
            this.endRound(winner); 
        } else {
            setTimeout(() => {
                if (this.state.phase === 'PLAYING') this.softReset();
            }, 1000);
        }
    }

    drawPlayers() {
        const p = this.p;
        this.gamePlayers.forEach(gp => {
            const basePlayer = this.players[gp.idx];
            if (basePlayer.isEliminated) return;

            let animType = gp.isBoosting ? 'RUN' : 'IDLE';

            this.drawAvatar(basePlayer, gp.body.position.x, gp.body.position.y, {
                size: this.PLAYER_SIZE,
                anim: animType,
                expression: gp.expression,
                facing: Math.cos(gp.angle) > 0 ? 1 : -1
            });

            this.drawDirectionArrow(gp.body.position.x, gp.body.position.y, gp.angle, {
                distance: this.PLAYER_SIZE / 2 + 25,
                size: 10,
                color: basePlayer.color
            });

            if (gp.id === this.bombHolderId) {
                this.drawBomb(gp.body.position.x, gp.body.position.y - 70, false);
            }
        });
    }

    drawBomb(x, y, isNeutral) {
        const p = this.p;
        p.push();
        p.translate(x, y);

        const wobble = Math.sin(p.millis() * 0.01) * 0.1;
        p.rotate(wobble);

        const isCritical = !isNeutral && this.bombTimer < 180;
        const scale = 1 + Math.sin(p.millis() * (isCritical ? 0.05 : 0.01)) * 0.1;
        p.scale(scale);

        p.fill('#211B18'); p.noStroke(); p.circle(0, 0, 60);
        p.fill(255, 50); p.circle(-15, -15, 20);

        if (isNeutral) {
            p.fill('#3498db'); 
            p.circle(-12, 5, 6); p.circle(12, 5, 6);
            p.stroke(200); p.strokeWeight(3); p.noFill();
            p.arc(0, 12, 15, 10, p.PI, 0); 
            
            this.handAnim += 0.15;
            const grab = Math.sin(this.handAnim) * 8;
            
            p.noStroke(); p.fill('#211B18');
            
            p.push();
            p.translate(-35 - grab, 10);
            p.rotate(-0.5 + grab * 0.05);
            p.ellipse(0, 0, 25, 18);
            p.stroke('#211B18'); p.strokeWeight(8);
            p.line(10, -5, 25, -10);
            p.pop();
            
            p.push();
            p.translate(35 + grab, 10);
            p.rotate(0.5 - grab * 0.05);
            p.noStroke();
            p.ellipse(0, 0, 25, 18);
            p.stroke('#211B18'); p.strokeWeight(8);
            p.line(-10, -5, -25, -10);
            p.pop();

        } else {
            p.noFill(); p.stroke(255); p.strokeWeight(4);
            p.arc(-12, 0, 12, 12, p.PI, 0); 
            p.arc(12, 0, 12, 12, p.PI, 0);
            p.arc(0, 8, 12, 8, 0, p.PI); 
        }

        p.stroke('#7f8c8d'); p.strokeWeight(5); p.noFill();
        p.bezier(0, -30, 0, -50, 20, -50, 20, -60);

        const sparkColor = (p.frameCount % 10 < 5) ? '#F59E0B' : '#FF5A36';
        p.fill(sparkColor); p.noStroke(); p.circle(20, -60, 15);

        if (!isNeutral && this.bombTimer > 0) {
            p.fill('#fff'); p.textAlign(p.CENTER, p.CENTER); p.textSize(30); p.textStyle(p.BOLD);
            p.text(Math.ceil(this.bombTimer / 60), 0, -80); 
        }

        p.pop();
    }
}