/* src/games/HopHero.js */

import BaseGame from './BaseGame.js';

export default class HopHero extends BaseGame {

    static get manifest() {
        return {
            id: 'hop-hero',
            title: 'Hop Hero',
            description: 'Cross the road, dodge the cars!',
            tutorial: 'Tap to hop forward. Avoid getting squashed!',
            controllerType: 'CONTROLLER',
            tournamentRules: {
                winValue: 3,
                livesPerRound: 1
            }
        };
    }

    onSetup() {
        const count = this.players.length;

        this.config.winCondition = 'ROUNDS'; 
        this.config.winValue = count >= 7 ? 2 : 3; 
        this.config.livesPerRound = 1; 
        this.config.eliminateOnDeath = true;
        this.config.roundEndCriteria = 'ALL_DEAD'; 
        
        this.LANE_HEIGHT = 90; 
        this.PLAYER_SIZE = 70;
        this.FINISH_LANE = 100; 
        this.HOP_SPEED = 0.15;

        this.BOUNDS_LEFT = -2500;
        this.BOUNDS_RIGHT = 4500;

        this.lanes = [];
        this.camY = 0;
    }

    onPlayerInput(player, type) {
        if (type === 'PRESS') {
            const p = this.gamePlayers.find(gp => gp.id === player.id);
            if (p && !p.isHopping && !p.isEliminated) {
                this.hopPlayer(p);
            }
        }
    }

    hopPlayer(p) {
        this.playSound('jump');
        p.isHopping = true;
        p.hopProgress = 0;
        p.gridY++;
        p.hopStartY = p.visY;
        p.hopTargetY = -p.gridY * this.LANE_HEIGHT;

        this.players[p.idx].score++;
        this.updateUI(); 
    }

    onRoundStart() {
        this.generateLevel();
        this.camY = 0;

        const count = this.players.length;
        // Dynamically compress starting gap so 10 players stay centered within view
        const spacing = Math.min(100, Math.floor(1200 / Math.max(1, count - 1)));
        const totalSpan = (count - 1) * spacing;

        this.gamePlayers = this.players.map((basePlayer, index) => {
            if (basePlayer.isEliminated) return null;

            const startX = this.CX - totalSpan / 2 + (index * spacing);
            
            return {
                id: basePlayer.id,
                idx: index,
                gridY: 0,
                x: startX,
                visX: startX,
                visY: 0,
                isHopping: false,
                hopProgress: 0,
                hopStartY: 0,
                hopTargetY: 0,
                isEliminated: false
            };
        }).filter(p => p !== null);
    }

    runDemoAI() {
        this.gamePlayers.forEach(p => {
            if (p.isHopping || p.isEliminated) return;
            
            const nextLaneIdx = p.gridY + 1;
            const nextLane = this.lanes[nextLaneIdx];
            
            if (nextLane) {
                let safe = true;
                if (nextLane.type === 'road') {
                    for (let o of nextLane.obstacles) {
                        if (p.visX > o.x - 80 && p.visX < o.x + o.w + 20) safe = false;
                    }
                } else if (nextLane.type === 'water') {
                    safe = false;
                    for (let o of nextLane.obstacles) {
                        const predX = o.x + nextLane.speed * 10;
                        if (p.visX > predX + 10 && p.visX < predX + o.w - 10) safe = true;
                    }
                }

                if (safe && this.p.random() < 0.1) {
                    this.simulateInput(p.idx, 'PRESS');
                }
            }
        });
    }

    onFixedUpdate(dt) {
        this.lanes.forEach(lane => {
            if (lane.obstacles) {
                lane.obstacles.forEach(o => {
                    o.x += lane.speed;
                    if (lane.speed > 0 && o.x > this.BOUNDS_RIGHT) {
                        o.x = this.BOUNDS_LEFT - o.w;
                    } else if (lane.speed < 0 && o.x + o.w < this.BOUNDS_LEFT) {
                        o.x = this.BOUNDS_RIGHT;
                    }
                });
            }
        });

        let highestY = 0;

        this.gamePlayers.forEach(p => {
            if (p.isEliminated) return;

            const laneIdx = p.gridY;
            const lane = this.lanes[laneIdx];

            if (p.isHopping) {
                p.hopProgress += this.HOP_SPEED;
                if (p.hopProgress >= 1) {
                    p.isHopping = false;
                    p.visY = p.hopTargetY;
                    this.spawnParticles(p.visX, p.visY, { color: '#FFFFFF', count: 4, size: 8, speed: 2 });
                } else {
                    p.visY = this.p.lerp(p.hopStartY, p.hopTargetY, p.hopProgress);
                }
            }

            if (-p.visY > highestY) highestY = -p.visY;

            if (lane && !p.isHopping) {
                if (lane.type === 'road') {
                    for (let o of lane.obstacles) {
                        if (p.visX > o.x + 10 && p.visX < o.x + o.w - 10) {
                            this.killPlayer(p, 'hit');
                        }
                    }
                } else if (lane.type === 'water') {
                    let onLog = false;
                    for (let o of lane.obstacles) {
                        if (p.visX > o.x && p.visX < o.x + o.w) {
                            onLog = true;
                            p.visX += lane.speed; 
                        }
                    }
                    if (!onLog) this.killPlayer(p, 'drown');
                }
            }

            if (p.visX < this.BOUNDS_LEFT + 100 || p.visX > this.BOUNDS_RIGHT - 100) {
                this.killPlayer(p, 'bounds');
            }
        });

        this.camY = this.p.lerp(this.camY, highestY, 0.05);
        const deathThreshold = -(this.camY - this.V_HEIGHT * 0.6); 
        
        this.gamePlayers.forEach(p => {
            if (!p.isEliminated && p.visY > deathThreshold) {
                this.killPlayer(p, 'fall');
            }
        });
    }

    onDraw() {
        this.p.push();
        this.p.translate(0, this.camY + this.V_HEIGHT - 200); 
        this.drawLanes();
        this.drawPlayers();
        this.drawParticles();
        this.p.pop();
    }

    killPlayer(gp, reason) {
        if (gp.isEliminated) return;
        gp.isEliminated = true;

        if (reason === 'drown') {
            this.playSound('pop');
            this.spawnParticles(gp.visX, gp.visY, { color: '#FFFFFF', count: 12, size: 14, speed: 4 });
        } else {
            this.playSound('crash');
            this.spawnParticles(gp.visX, gp.visY, { color: this.players[gp.idx].color, count: 12, size: 14, speed: 5 });
        }

        this.eliminatePlayer(gp.idx);
    }

    generateLevel() {
        this.lanes = [];
        for (let i = 0; i < 3; i++) this.lanes.push({ type: 'grass' });

        for (let i = 3; i < this.FINISH_LANE; i++) {
            const r = this.p.random();
            let lane = { type: 'grass', obstacles: [] };

            if (r < 0.45) {
                lane.type = 'road';
                lane.speed = this.p.random(3, 7) * (i % 2 === 0 ? 1 : -1);
                lane.obstacles = this.generateObstacles(lane.speed, 'car');
            } else if (r < 0.75) {
                lane.type = 'water';
                lane.speed = this.p.random(2.5, 5) * (i % 2 === 0 ? 1 : -1);
                lane.obstacles = this.generateObstacles(lane.speed, 'log');
            }
            this.lanes.push(lane);
        }
    }

    generateObstacles(speed, type) {
        let obs = [];
        let x = this.BOUNDS_LEFT;
        const minGap = type === 'car' ? 300 : 200;
        const maxGap = type === 'car' ? 800 : 450;

        while (x < this.BOUNDS_RIGHT) {
            const width = type === 'car' ? this.p.random(100, 160) : this.p.random(140, 240);
            const gap = this.p.random(minGap, maxGap);

            obs.push({
                x: x,
                w: width,
                type: type,
                color: this.getRandomColor(type),
                speed: speed
            });

            x += width + gap;
        }
        return obs;
    }

    drawLanes() {
        const p = this.p;
        p.noStroke();

        const bottomIndex = Math.max(0, Math.floor((this.camY - 600) / this.LANE_HEIGHT));
        const topIndex = Math.min(this.lanes.length, bottomIndex + 20);

        const DRAW_X = this.BOUNDS_LEFT;
        const DRAW_W = this.BOUNDS_RIGHT - this.BOUNDS_LEFT;

        for (let i = bottomIndex; i < topIndex; i++) {
            const lane = this.lanes[i];
            const y = -i * this.LANE_HEIGHT;

            if (lane.type === 'grass') p.fill('#55efc4');
            else if (lane.type === 'road') p.fill('#2d3436');
            else if (lane.type === 'water') p.fill('#74b9ff');

            p.rect(DRAW_X, y - this.LANE_HEIGHT / 2, DRAW_W, this.LANE_HEIGHT);

            if (lane.type === 'road') {
                p.fill(255);
                p.rect(DRAW_X, y + this.LANE_HEIGHT / 2 - 5, DRAW_W, 4); 
                p.rect(DRAW_X, y - this.LANE_HEIGHT / 2 + 5, DRAW_W, 4); 
                for (let d = DRAW_X; d < this.BOUNDS_RIGHT; d += 150) p.rect(d, y, 60, 4);
                lane.obstacles.forEach(o => this.drawCar(o.x, y, o.w, o.color, o.speed));
            }
            else if (lane.type === 'water') {
                p.fill(255, 50);
                p.rect(DRAW_X, y - this.LANE_HEIGHT / 2, DRAW_W, 10); 
                lane.obstacles.forEach(o => this.drawLog(o.x, y, o.w));
            }
        }
    }

    drawCar(x, y, w, c, speed) {
        const p = this.p;
        if (x > this.BOUNDS_RIGHT || x + w < this.BOUNDS_LEFT) return;

        p.push();
        p.translate(x + w / 2, y);
        if (speed < 0) p.scale(-1, 1);
        p.translate(-w / 2, 0);

        p.fill(0, 0, 0, 50); p.noStroke(); p.rect(5, -20, w, 50, 12);
        p.fill(c); p.stroke(0, 0, 0, 50); p.strokeWeight(2); p.rect(0, -25, w, 50, 12);
        p.fill(0, 0, 0, 60); p.noStroke(); p.rect(10, -20, w - 20, 35, 6);
        p.fill(c); p.rect(25, -15, w - 50, 25, 4); 
        
        p.fill('#f1c40f'); p.rect(w - 5, -20, 5, 12, 2); p.rect(w - 5, 8, 5, 12, 2);
        p.fill('#e74c3c'); p.rect(0, -20, 5, 12, 2); p.rect(0, 8, 5, 12, 2);
        p.pop();
    }

    drawLog(x, y, w) {
        const p = this.p;
        if (x > this.BOUNDS_RIGHT || x + w < this.BOUNDS_LEFT) return;

        p.fill('#795548'); p.stroke('#3E2723'); p.strokeWeight(4); 
        p.rect(x, y - 25, w, 50, 25);
        p.noStroke(); p.fill('#5D4037'); 
        p.rect(x + 30, y - 10, w - 60, 8, 4); 
        p.rect(x + 50, y + 10, w - 100, 8, 4);
    }

    drawPlayers() {
        const p = this.p;
        const sorted = [...this.gamePlayers].sort((a, b) => b.visY - a.visY);

        sorted.forEach(player => {
            if (player.isEliminated) return;

            const config = this.players[player.idx]; 
            let anim = player.isHopping ? 'JUMP' : 'IDLE';
            let jumpY = player.isHopping ? -Math.sin(player.hopProgress * p.PI) * 80 : 0;

            this.drawAvatar(config, player.visX, player.visY + jumpY, {
                size: this.PLAYER_SIZE,
                anim: anim,
                expression: player.isHopping ? 'happy' : 'idle',
                facing: 1
            });

            if (player.isHopping) {
                p.fill(0, 40); p.noStroke();
                const s = 1 - Math.sin(player.hopProgress * p.PI) * 0.5;
                p.ellipse(player.visX, player.visY + 30, 50 * s, 20 * s);
            }
        });
    }

    getRandomColor(type) {
        if (type === 'car') {
            const colors = ['#e74c3c', '#f1c40f', '#8e44ad', '#2980b9', '#d35400'];
            return this.p.random(colors);
        }
        return '#8B4513';
    }
}