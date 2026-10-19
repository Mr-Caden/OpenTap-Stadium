/* src/games/BombTag.js */

import BaseGame from './BaseGame.js';

export default class BombTag extends BaseGame {

    static get manifest() {
        return {
            id: 'bomb-tag',
            title: 'Bomb Tag',
            description: 'Hot potato! Pass the bomb before it blows!',
            tutorial: 'Hold to run forward! Last survivor standing wins!',
            controllerType: 'CONTROLLER',
            tournamentRules: {
                winValue: 1,
                livesPerRound: 1
            }
        };
    }

    onSetup() {
        const count = this.players.length;

        this.config.winCondition = 'SCORE'; 
        this.config.winValue = count >= 7 ? 3 : 5; 
        this.config.livesPerRound = 1; 
        this.config.eliminateOnDeath = true; 
        this.config.roundEndCriteria = 'NONE'; 
        
        this.ARENA_W = 1400; 
        this.ARENA_H = 900;
        this.PLAYER_SIZE = 90;
        
        // Detonation fuse is faster for larger lobbies (10s vs 15s)
        const seconds = count >= 6 ? 10 : 15;
        this.BOMB_DURATION_BASE = seconds * 60; 
        this.BOMB_SPEED = 0.022;

        // Initialize managed physics
        this.enablePhysics({
            gravity: { x: 0, y: 0 }
        });

        // Initialize unified rotate-tap movement (constant unidirectional rotation)
        this.enableRotateTapMovement({
            boostForce: 0.055,
            rotSpeed: 0.09,
            friction: 0.05,
            reverseOnTap: false
        });

        this.createWalls();

        this.bombTimer = 0;
        this.bombHolderId = null;
        this.tagCooldown = 0;
        this.neutralTarget = null;
        this.handAnim = 0; 

        const { Bodies } = window.Matter;
        this.bombBody = Bodies.circle(this.CX, this.CY, 35, {
            restitution: 1.1,
            label: 'bomb',
            friction: 0,
            frictionAir: 0.005,
            density: 0.02
        });
        this.addPhysicsBody(this.bombBody);
    }

    createWalls() {
        const { Bodies } = window.Matter;
        const wallOpts = { isStatic: true, restitution: 1.0, label: 'wall' };
        const thick = 100;
        const cx = this.CX; const cy = this.CY;
        const w = this.ARENA_W; const h = this.ARENA_H;

        this.addPhysicsBody(Bodies.rectangle(cx, cy - h / 2 - thick / 2, w + thick * 2, thick, wallOpts));
        this.addPhysicsBody(Bodies.rectangle(cx, cy + h / 2 + thick / 2, w + thick * 2, thick, wallOpts));
        this.addPhysicsBody(Bodies.rectangle(cx - w / 2 - thick / 2, cy, thick, h, wallOpts));
        this.addPhysicsBody(Bodies.rectangle(cx + w / 2 + thick / 2, cy, thick, h, wallOpts));
    }

    initPlayerEntity(entity, player) {
        const count = this.players.filter(p => !p.isPermEliminated).length;
        const spawnPoints = this.getRadialPositions(count, 420);
        const spawn = spawnPoints[entity.index] || { x: this.CX, y: this.CY, angle: 0 };

        entity.x = spawn.x;
        entity.y = spawn.y;
        entity.angle = Math.atan2(this.CY - spawn.y, this.CX - spawn.x);
        entity.size = this.PLAYER_SIZE;
        entity.expression = 'idle';
        entity.expressionTimer = 0;
        entity.facing = 1;

        const { Bodies } = window.Matter;
        const body = Bodies.circle(spawn.x, spawn.y, this.PLAYER_SIZE / 2, {
            restitution: 0.8,
            frictionAir: 0.05,
            label: `player-${entity.id}`,
            density: 0.005
        });

        this.addPhysicsBody(body);
        entity.body = body;
    }

    onRoundStart() {
        this.bombTimer = this.BOMB_DURATION_BASE;
        this.tagCooldown = 0;
        this.bombHolderId = null;
        this.neutralTarget = null;

        if (this.bombBody && window.Matter) {
            window.Matter.Body.setPosition(this.bombBody, { x: this.CX, y: this.CY });
            window.Matter.Body.setVelocity(this.bombBody, { x: 0, y: 0 });
            window.Matter.Body.setAngularVelocity(this.bombBody, 0);

            if (!this.world.bodies.includes(this.bombBody)) {
                this.addPhysicsBody(this.bombBody);
            }
        }
    }

    onCollisionStart(pair, bodyA, bodyB, entityA, entityB) {
        if (this.tagCooldown > 0) return;

        // Player to player bomb pass
        if (entityA && entityB) {
            if (entityA.id === this.bombHolderId || entityB.id === this.bombHolderId) {
                const newHolder = (entityA.id === this.bombHolderId) ? entityB.id : entityA.id;
                this.bombHolderId = newHolder;
                this.tagCooldown = 30;
                this.playSound('bump');

                const midX = (entityA.x + entityB.x) / 2;
                const midY = (entityA.y + entityB.y) / 2;
                this.spawnParticles(midX, midY, { color: '#FFFFFF', count: 10, size: 14, speed: 5 });
            }
        }

        // Neutral bomb grab
        if (this.bombHolderId === null && (bodyA.label === 'bomb' || bodyB.label === 'bomb')) {
            const playerEnt = entityA || entityB;
            if (playerEnt) {
                this.bombHolderId = playerEnt.id;
                this.playSound('jump');
                this.removePhysicsBody(this.bombBody);
            }
        }
    }

    onFixedUpdate(dt) {
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

        const activeEntities = this.getActiveEntities();
        activeEntities.forEach(ent => {
            if (ent.isBoosting) {
                ent.expression = 'angry';
                ent.expressionTimer = 10;
                if (this.p.frameCount % 5 === 0) {
                    this.spawnParticles(ent.x, ent.y, { color: '#FFFFFF', count: 1, size: 8, speed: 2 });
                }
            }

            if (ent.id === this.bombHolderId) {
                ent.expression = 'stunned';
            } else if (ent.expressionTimer > 0) {
                ent.expressionTimer--;
                if (ent.expressionTimer <= 0) ent.expression = 'idle';
            }
        });
    }

    updateNeutralBomb() {
        if (this.p.frameCount % 60 === 0 || !this.neutralTarget) {
            let nearest = null;
            let minDist = Infinity;

            const activeEntities = this.getActiveEntities();
            activeEntities.forEach(ent => {
                const d = this.p.dist(ent.x, ent.y, this.bombBody.position.x, this.bombBody.position.y);
                if (d < minDist) {
                    minDist = d;
                    nearest = ent;
                }
            });
            this.neutralTarget = nearest;
        }

        if (this.neutralTarget && this.bombBody && window.Matter) {
            const dx = this.neutralTarget.x - this.bombBody.position.x;
            const dy = this.neutralTarget.y - this.bombBody.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0.001) {
                window.Matter.Body.applyForce(this.bombBody, this.bombBody.position, {
                    x: (dx / dist) * this.BOMB_SPEED,
                    y: (dy / dist) * this.BOMB_SPEED
                });
            }
        }
    }

    explodeBomb() {
        this.playSound('crash');
        this.shake(30, 40);

        const victim = this.getEntity(this.bombHolderId);
        if (!victim) return;

        this.ui.showTurnMessage(`${victim.player.name} Exploded!`, '#FF5A36');

        if (victim.body) {
            this.removePhysicsBody(victim.body);
            victim.body = null;
        }

        this.spawnParticles(victim.x, victim.y, { color: '#211B18', count: 20, size: 24, speed: 7 });
        this.spawnParticles(victim.x, victim.y, { color: '#FF5A36', count: 20, size: 20, speed: 8 });

        this.eliminatePlayer(victim.index);

        // Award points to all surviving players
        this.players.forEach(p => {
            if (!p.isEliminated && p.id !== this.bombHolderId) {
                p.score++;
            }
        });
        this.updateUI();

        const survivors = this.players.filter(p => !p.isEliminated);
        if (survivors.length <= 1) {
            this.endRound(survivors[0] || null);
        } else {
            this.scheduleTimeout(() => {
                if (this.state.phase === 'PLAYING') this.startNewRound();
            }, 1000);
        }
    }

    runDemoAI() {
        const activeEntities = this.getActiveEntities();

        activeEntities.forEach(bot => {
            let targetPos = null;
            let mode = 'CHASE';

            const edgeMargin = 150;
            const nearLeft = bot.x < (this.CX - this.ARENA_W/2 + edgeMargin);
            const nearRight = bot.x > (this.CX + this.ARENA_W/2 - edgeMargin);
            const nearTop = bot.y < (this.CY - this.ARENA_H/2 + edgeMargin);
            const nearBottom = bot.y > (this.CY + this.ARENA_H/2 - edgeMargin);

            if (nearLeft || nearRight || nearTop || nearBottom) {
                targetPos = { x: this.CX, y: this.CY };
                mode = 'CHASE';
            } else if (this.bombHolderId === null && this.bombBody) {
                targetPos = this.bombBody.position;
                mode = 'CHASE';
            } else if (bot.id === this.bombHolderId) {
                let nearest = null;
                let minDist = Infinity;
                activeEntities.forEach(other => {
                    if (other === bot) return;
                    const d = this.p.dist(bot.x, bot.y, other.x, other.y);
                    if (d < minDist) { minDist = d; nearest = other; }
                });
                if (nearest) targetPos = { x: nearest.x, y: nearest.y };
                mode = 'CHASE';
            } else {
                const holder = this.getEntity(this.bombHolderId);
                if (holder) {
                    targetPos = { x: holder.x, y: holder.y };
                    mode = 'FLEE';
                }
            }

            if (!targetPos) return;

            const angleToTarget = Math.atan2(targetPos.y - bot.y, targetPos.x - bot.x);
            const desiredAngle = mode === 'CHASE' ? angleToTarget : angleToTarget + Math.PI;
            const diff = Math.atan2(Math.sin(desiredAngle - bot.angle), Math.cos(desiredAngle - bot.angle));

            if (Math.abs(diff) < 0.6) {
                if (!bot.isBoosting) this.simulateInput(bot.id, 'PRESS');
            } else {
                if (bot.isBoosting) this.simulateInput(bot.id, 'RELEASE');
            }
        });
    }

    onDraw() {
        this.p.push();
        this.p.translate(this.CX, this.CY);
        this.p.fill('#FAF6F0');
        this.p.noStroke(); 
        this.p.rectMode(this.p.CENTER); 
        this.p.rect(0, 0, this.ARENA_W, this.ARENA_H);
        
        const w = this.ARENA_W; const h = this.ARENA_H; const thick = 100;
        this.p.fill('#D8D1C7');
        this.p.rect(0, -h / 2 - thick / 2, w + thick * 2, thick);
        this.p.rect(0, h / 2 + thick / 2, w + thick * 2, thick);
        this.p.rect(-w / 2 - thick / 2, 0, thick, h);
        this.p.rect(w / 2 + thick / 2, 0, thick, h);
        this.p.pop();

        if (this.bombHolderId === null && this.bombBody) {
            this.drawBomb(this.bombBody.position.x, this.bombBody.position.y, true);
        }

        this.drawRotateTapArrows({ distance: this.PLAYER_SIZE / 2 + 25, size: 10 });
        // Avatars stay upright facing forward at all times
        this.drawEntities({ shadow: false, rotation: 0, facing: 1 });

        // Draw bomb above the current holder
        if (this.bombHolderId !== null) {
            const holder = this.getEntity(this.bombHolderId);
            if (holder) {
                this.drawBomb(holder.x, holder.y - 70, false);
            }
        }

        this.drawParticles();
        this.drawTimerBadge(this.bombHolderId !== null ? Math.ceil(this.bombTimer / 60) : "GET BOMB!", {
            y: 80,
            width: this.bombHolderId !== null ? 140 : 220,
            criticalThreshold: 5,
            fontSize: this.bombHolderId !== null ? 46 : 24
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