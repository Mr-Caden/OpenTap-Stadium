/* src/games/CrateStackers.js */

import BaseGame from './BaseGame.js';

export default class CrateStackers extends BaseGame {

    static get manifest() {
        return {
            id: 'crate-stackers',
            title: 'Crate Stackers',
            description: 'Build one giant tower! The player who collapses it loses!',
            tutorial: 'Time your drop to place crates! Whoever causes the collapse loses!',
            controllerType: 'CONTROLLER',
            tournamentRules: {
                winValue: 1,
                livesPerRound: 1
            }
        };
    }

    onSetup() {
        const count = this.players.length;

        // Dynamic player count scaling: 7+ players enter Sudden Death immediately
        this.config.winCondition = 'SURVIVAL'; 
        this.config.roundResetType = 'ELIMINATION'; 
        this.config.roundEndCriteria = 'NONE'; 
        this.config.livesPerRound = count >= 7 ? 1 : (count >= 4 ? 2 : 3); 
        this.config.winValue = count >= 7 ? 2 : 3;
        this.config.eliminateOnDeath = true; 
        this.config.turnBased = true;
        this.config.turnBasedBackgroundColor = true;

        // Responsive crane speed keeps matches moving briskly in large lobbies
        this.CRANE_SPEED = count >= 6 ? 0.038 : 0.03;
        this.CRANE_WIDTH = 1400; 
        this.BLOCK_BASE_SIZE = 180; 

        const { Engine, World, Bodies, Composite, Events } = Matter;
        this.engine = Engine.create();
        this.world = this.engine.world;
        this.engine.positionIterations = 10;
        this.engine.velocityIterations = 10;

        this.shapes = [];
        this.ground = null;

        this.stackState = 'AIMING'; 
        this.activeBlock = null;
        this.activeBlockConfig = null;
        this.craneX = this.CX;
        this.craneAngle = 0;
        this.clawOpenAmount = 0;
        this.settleTimer = 0;
        this.camY = 0;
        this.targetCamY = 0;
        this.lastDropperIdx = -1; 

        Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach(pair => {
                if ((pair.bodyA.speed + pair.bodyB.speed) > 2) {
                    this.playSound('bump');
                }
            });
        });
    }

    onRoundStart() {
        this.lastDropperIdx = -1;
        this.softReset();
    }

    softReset() {
        Matter.Engine.clear(this.engine);
        Matter.World.clear(this.world);

        this.shapes = [];
        this.activeBlock = null;
        this.stackState = 'AIMING';
        this.camY = 0;
        this.targetCamY = 0;
        this.clawOpenAmount = 0;

        this.ground = Matter.Bodies.rectangle(this.CX, this.V_HEIGHT - 50, 900, 90, {
            isStatic: true, friction: 1.0, label: 'ground'
        });
        Matter.Composite.add(this.world, this.ground);

        this.validateTurn();
        this.spawnNextBlock();
    }

    onPlayerInput(player, type) {
        if (type === 'PRESS' && this.stackState === 'AIMING') {
            this.dropBlock();
        }
    }

    runDemoAI() {
        if (this.stackState === 'AIMING') {
            const dist = Math.abs(this.craneX - this.CX);
            if (dist < 120 && this.p.random() < 0.05) {
                const currentPlayerIdx = this.state.activePlayerIndex;
                this.simulateInput(currentPlayerIdx, 'PRESS');
            }
        }
    }

    onFixedUpdate(dt) {
        if (this.stackState === 'AIMING') {
            this.updateCrane();
        } else if (this.stackState === 'DROPPING' || this.stackState === 'SETTLING') {
            this.clawOpenAmount = this.p.lerp(this.clawOpenAmount, 1, 0.1);
            this.checkSettled();
        }

        this.checkFall();
    }

    onDraw() {
        const p = this.p;

        if (this.stackState === 'TOWER_FALLEN') {
            this.camY = p.lerp(this.camY, 0, 0.15); 
        } else {
            this.camY = p.lerp(this.camY, this.targetCamY, 0.05);
        }

        p.push();
        p.translate(0, this.camY); 

        this.drawGround();
        this.drawStack();
        this.drawParticles();

        if (this.stackState === 'AIMING') {
            this.drawCrane(false);
        } else if (this.stackState === 'DROPPING' || this.stackState === 'SETTLING') {
            this.drawCrane(true);
        }

        p.pop();
    }

    spawnNextBlock() {
        if (this.activeBlock) {
            Matter.Composite.remove(this.world, this.activeBlock);
            this.activeBlock = null;
        }

        const player = this.players[this.state.activePlayerIndex];
        if (!player || player.isEliminated) {
            this.nextTurn();
            return;
        }
        
        const type = this.p.random(['box', 'box', 'hex', 'trap']);
        const scale = this.p.random(0.9, 1.1);
        const size = this.BLOCK_BASE_SIZE * scale;

        const x = this.craneX;
        const y = 250 - this.camY; 

        const opts = {
            isStatic: true, friction: 0.9, restitution: 0.1, density: 0.005, 
            label: `block-${player.id}`
        };

        let body;
        if (type === 'box') {
            body = Matter.Bodies.rectangle(x, y, size, size, { ...opts, chamfer: { radius: 4 } });
        } else if (type === 'hex') {
            body = Matter.Bodies.polygon(x, y, 6, size / 1.7, opts);
            Matter.Body.setAngle(body, Math.PI / 6);
        } else {
            body = Matter.Bodies.trapezoid(x, y, size, size, 0.5, opts);
        }

        this.activeBlock = body;
        this.activeBlockConfig = {
            type, size, color: player.color,
            ownerIdx: player.id, variant: player.variant, accessory: player.accessory
        };

        Matter.Composite.add(this.world, body);
    }

    updateCrane() {
        this.craneAngle += this.CRANE_SPEED;
        const swingX = Math.sin(this.craneAngle) * (this.CRANE_WIDTH / 2);
        this.craneX = this.CX + swingX;

        if (this.activeBlock) {
            Matter.Body.setPosition(this.activeBlock, {
                x: this.craneX,
                y: 250 - this.camY
            });
            if (this.activeBlockConfig.type === 'hex') {
                Matter.Body.setAngle(this.activeBlock, Math.PI / 6);
            } else {
                Matter.Body.setAngle(this.activeBlock, 0);
            }
        }
    }

    dropBlock() {
        this.playSound('click');
        Matter.Body.setStatic(this.activeBlock, false);
        Matter.Body.setVelocity(this.activeBlock, { x: 0, y: 10 });

        this.shapes.push({ body: this.activeBlock, config: this.activeBlockConfig });
        this.activeBlock = null;
        
        this.lastDropperIdx = this.state.activePlayerIndex;

        this.stackState = 'DROPPING';
        this.settleTimer = this.p.millis() + 4000; 
    }

    checkSettled() {
        const p = this.p;
        const lastShape = this.shapes[this.shapes.length - 1];
        if (!lastShape) return;

        const speed = lastShape.body.speed;
        const angularSpeed = Math.abs(lastShape.body.angularVelocity);

        if ((speed < 0.15 && angularSpeed < 0.02 && p.millis() > this.settleTimer - 3000) || p.millis() > this.settleTimer) {
            this.stackState = 'AIMING';
            this.clawOpenAmount = 0;
            this.updateCameraTarget();
            
            const owner = this.players[lastShape.config.ownerIdx];
            if (owner && !owner.isEliminated) {
                this.updateUI(); 
                if (this.checkWinCondition()) return;
            }
            
            this.nextTurn();
            setTimeout(() => this.spawnNextBlock(), 50);
        }
    }

    updateCameraTarget() {
        let highestY = this.V_HEIGHT;
        this.shapes.forEach(s => {
            if (s.body.position.y < highestY) highestY = s.body.position.y;
        });
        
        if (highestY < this.V_HEIGHT / 2) {
            this.targetCamY = (this.V_HEIGHT / 2) - highestY;
        }
    }

    checkFall() {
        const deathY = this.V_HEIGHT + 300; 
        
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            const s = this.shapes[i];
            const pos = s.body.position;

            if (pos.y > deathY || pos.x < -300 || pos.x > this.V_WIDTH + 300) {
                if (this.stackState !== 'TOWER_FALLEN') {
                    this.triggerCollapse();
                }

                this.explodeBlock(s);
                Matter.Composite.remove(this.world, s.body);
                this.shapes.splice(i, 1);
            }
        }
    }

    triggerCollapse() {
        this.stackState = 'TOWER_FALLEN';
        this.targetCamY = 0; 
        
        if (this.ground) {
            Matter.Body.setStatic(this.ground, false);
        }

        const culpritIdx = (this.lastDropperIdx !== -1) ? this.lastDropperIdx : this.state.activePlayerIndex;
        
        this.players.forEach((p, idx) => {
            if (idx !== culpritIdx && !p.isEliminated) {
                p.score++;
            }
        });
        
        this.eliminatePlayer(culpritIdx);
        this.playSound('crash');
        this.shake(30, 40);

        this.scheduleTimeout(() => {
            if (this.state.phase === 'PLAYING' || this.state.phase === 'INTRO') {
                this.softReset();
            }
        }, 3500);
    }

    drawCrane(isOpen) {
        if (this.stackState === 'TOWER_FALLEN') return;

        const p = this.p;
        const x = this.craneX;
        const y = 250 - this.camY;
        
        p.push();
        p.stroke(80); p.strokeWeight(8); p.line(x, y - 2000, x, y);
        p.fill(60); p.noStroke(); p.rectMode(p.CENTER); p.rect(x, y - 30, 80, 30, 6);
        p.stroke(50); p.strokeWeight(10); p.noFill(); p.strokeJoin(p.ROUND);
        
        let gripW = this.activeBlockConfig ? this.activeBlockConfig.size / 2 + 15 : 60;
        const openOffset = this.clawOpenAmount * 60;
        const currentW = gripW + openOffset;

        p.beginShape(); p.vertex(x - 25, y - 30); p.vertex(x - currentW, y); p.vertex(x - currentW + 15, y + 60); p.endShape();
        p.beginShape(); p.vertex(x + 25, y - 30); p.vertex(x + currentW, y); p.vertex(x + currentW - 15, y + 60); p.endShape();
        
        if (this.activeBlock) { this.drawBlockVisuals(this.activeBlock, this.activeBlockConfig); }
        p.pop();
    }

    drawStack() { 
        this.shapes.forEach(s => { 
            this.drawBlockVisuals(s.body, s.config); 
        }); 
    }

    drawBlockVisuals(body, config) {
        const p = this.p;
        const pos = body.position;
        const angle = body.angle;
        p.push();
        p.translate(pos.x, pos.y);
        p.rotate(angle);
        p.fill(config.color);
        p.stroke(255); p.strokeWeight(4);
        
        if (config.type === 'box') { 
            p.rectMode(p.CENTER); p.rect(0, 0, config.size, config.size, 12); 
        }
        else if (config.type === 'hex') { 
            p.push(); p.rotate(Math.PI / 6); this.drawPolygon(0, 0, config.size / 1.7, 6); p.pop(); 
        }
        else if (config.type === 'trap') {
            const w = config.size; const h = config.size; const slope = w * 0.25;
            p.beginShape(); p.vertex(-w / 2 + slope, -h / 2); p.vertex(w / 2 - slope, -h / 2); p.vertex(w / 2, h / 2); p.vertex(-w / 2, h / 2); p.endShape(p.CLOSE);
        }

        let exp = 'idle';
        if (body.speed > 5) exp = 'stunned';
        if (this.stackState === 'AIMING' && body === this.activeBlock) exp = 'happy';
        if (this.stackState === 'TOWER_FALLEN') exp = 'stunned';
        
        this.drawAvatar(config, 0, 0, { size: config.size * 0.65, expression: exp });
        p.pop();
    }

    drawGround() {
        const p = this.p;
        if (!this.ground) return;
        p.push();
        p.translate(this.ground.position.x, this.ground.position.y);
        p.rotate(this.ground.angle);

        p.noStroke(); p.fill('#7f8c8d'); p.rectMode(p.CENTER); 
        p.rect(0, 0, 900, 90, 10);
        p.fill('#f1c40f'); 
        for (let i = -420; i < 450; i += 60) p.rect(i, 0, 30, 90);
        p.pop();
    }

    explodeBlock(shape) {
        this.playSound('pop'); 
        this.spawnParticles(shape.body.position.x, shape.body.position.y, {
            color: shape.config.color,
            count: 18,
            size: 26,
            speed: 8
        });
    }
}