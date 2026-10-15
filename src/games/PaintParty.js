/* src/games/PaintParty.js */

import BaseGame from './BaseGame.js';

export default class PaintParty extends BaseGame {

    static get manifest() {
        return {
            id: 'paint-party',
            title: 'Paint Party',
            description: 'Cover the floor with your color!',
            tutorial: 'Tap to turn right. Paint the most tiles!',
            controllerType: 'CONTROLLER',
            tournamentRules: {
                winValue: 1,
                livesPerRound: 1
            }
        };
    }

    onSetup() {
        this.config.winCondition = 'TIME'; 
        this.config.roundDuration = 45000;
        this.config.livesPerRound = 1;
        this.config.eliminateOnDeath = false;
        this.config.turnBased = false; 
        this.config.showRoundResultUI = true;

        this.CELL_SIZE = 120; 
        this.GRID_COLS = Math.ceil(this.V_WIDTH / this.CELL_SIZE);
        this.GRID_ROWS = Math.ceil(this.V_HEIGHT / this.CELL_SIZE);
        this.MOVE_SPEED = 9; 
        
        this.grid = []; 
    }

    onRoundStart() {
        this.players.forEach(p => p.score = 0);
        
        this.grid = [];
        for (let x = 0; x < this.GRID_COLS; x++) {
            this.grid[x] = [];
            for (let y = 0; y < this.GRID_ROWS; y++) {
                this.grid[x][y] = -1;
            }
        }

        this.gamePlayers = this.players.map((basePlayer, index) => {
            const gx = this.p.floor(this.p.random(1, this.GRID_COLS - 1));
            const gy = this.p.floor(this.p.random(1, this.GRID_ROWS - 1));
            
            this.grid[gx][gy] = index;
            basePlayer.score = 1;

            return {
                id: basePlayer.id,
                idx: index,
                config: basePlayer,
                x: gx * this.CELL_SIZE + this.CELL_SIZE/2,
                y: gy * this.CELL_SIZE + this.CELL_SIZE/2,
                dir: index % 4,
                stunTimer: 0,
                anim: 'IDLE',
                expression: 'happy'
            };
        });
        
        this.updateUI();
    }

    onPlayerInput(player, type) {
        if (type === 'PRESS') {
            const gp = this.gamePlayers.find(p => p.id === player.id);
            if (gp && gp.stunTimer <= 0) {
                gp.dir = (gp.dir + 1) % 4;
                this.snapToGrid(gp);
            }
        }
    }

    snapToGrid(gp) {
        const gx = Math.floor(gp.x / this.CELL_SIZE);
        const gy = Math.floor(gp.y / this.CELL_SIZE);
        gp.x = gx * this.CELL_SIZE + this.CELL_SIZE / 2;
        gp.y = gy * this.CELL_SIZE + this.CELL_SIZE / 2;
    }

    runDemoAI() {
        this.gamePlayers.forEach(gp => {
            if (gp.stunTimer > 0) return;

            const lookX = Math.floor(gp.x / this.CELL_SIZE) + (gp.dir === 1 ? 1 : gp.dir === 3 ? -1 : 0);
            const lookY = Math.floor(gp.y / this.CELL_SIZE) + (gp.dir === 2 ? 1 : gp.dir === 0 ? -1 : 0);

            const hitWall = lookX < 0 || lookX >= this.GRID_COLS || lookY < 0 || lookY >= this.GRID_ROWS;
            
            if (hitWall || this.p.random() < 0.03) {
                this.simulateInput(gp.idx, 'PRESS');
            } 
        });
    }

    onFixedUpdate(dt) {
        const p = this.p;

        this.gamePlayers.forEach(gp => {
            if (gp.stunTimer > 0) {
                gp.stunTimer--;
                gp.anim = 'DIZZY';
                gp.expression = 'stunned';
                return;
            }

            gp.anim = 'RUN';
            gp.expression = 'happy';

            let nextX = gp.x;
            let nextY = gp.y;

            if (gp.dir === 0) nextY -= this.MOVE_SPEED;
            else if (gp.dir === 1) nextX += this.MOVE_SPEED;
            else if (gp.dir === 2) nextY += this.MOVE_SPEED;
            else if (gp.dir === 3) nextX -= this.MOVE_SPEED;

            const buffer = this.CELL_SIZE * 0.3; 
            if (nextX < buffer || nextX > this.V_WIDTH - buffer || nextY < buffer || nextY > this.V_HEIGHT - buffer) {
                this.stunPlayer(gp);
                gp.dir = (gp.dir + 2) % 4; 
                return; 
            }

            gp.x = nextX;
            gp.y = nextY;

            const gx = Math.floor(gp.x / this.CELL_SIZE);
            const gy = Math.floor(gp.y / this.CELL_SIZE);

            if (gx >= 0 && gx < this.GRID_COLS && gy >= 0 && gy < this.GRID_ROWS) {
                const currentOwner = this.grid[gx][gy];
                
                if (currentOwner !== gp.idx) {
                    if (currentOwner !== -1) {
                        this.players[currentOwner].score--;
                        if (p.frameCount % 15 === 0) this.playSound('pop');
                    }
                    
                    this.grid[gx][gy] = gp.idx;
                    this.players[gp.idx].score++;
                    
                    this.spawnParticles(gp.x, gp.y, { color: gp.config.color, count: 2, size: 20, speed: 2 });
                    this.updateUI(); 
                }
            }

            this.gamePlayers.forEach(other => {
                if (other === gp) return;
                const d = p.dist(gp.x, gp.y, other.x, other.y);
                if (d < this.CELL_SIZE * 0.6) {
                    this.playSound('bump');
                    this.stunPlayer(gp);
                    this.stunPlayer(other);
                    gp.dir = (gp.dir + 2) % 4;
                    other.dir = (other.dir + 2) % 4;
                    gp.x -= (other.x - gp.x) * 0.5;
                    gp.y -= (other.y - gp.y) * 0.5;
                }
            });
        });
    }

    onDraw() {
        this.drawFloor();
        this.drawPlayers();
        this.drawParticles();
        this.drawTimerBadge(null, { criticalThreshold: 10 });
    }

    stunPlayer(gp) {
        if (gp.stunTimer > 0) return;
        this.playSound('crash');
        this.shake(5, 10);
        gp.stunTimer = 45; 
    }

    drawFloor() {
        const p = this.p;
        p.noStroke();
        p.fill(230);
        p.rect(0, 0, this.V_WIDTH, this.V_HEIGHT);

        for (let x = 0; x < this.GRID_COLS; x++) {
            for (let y = 0; y < this.GRID_ROWS; y++) {
                const owner = this.grid[x][y];
                const cx = x * this.CELL_SIZE;
                const cy = y * this.CELL_SIZE;

                if (owner !== -1) {
                    const color = this.gamePlayers[owner].config.color;
                    p.fill(color);
                    p.rect(cx, cy, this.CELL_SIZE + 1, this.CELL_SIZE + 1);
                } else {
                    if ((x + y) % 2 === 0) {
                        p.fill(215); 
                        p.rect(cx, cy, this.CELL_SIZE, this.CELL_SIZE);
                    }
                }
            }
        }
    }

    drawPlayers() {
        const p = this.p;
        this.gamePlayers.forEach(gp => {
            const rotation = [ -p.PI/2, 0, p.PI/2, p.PI ][gp.dir];
            const bob = Math.sin(p.millis() * 0.02) * 5;

            this.drawShadow(gp.x, gp.y + 30 + bob, 60, 25);

            this.drawAvatar(gp.config, gp.x, gp.y + bob, {
                size: 90,
                anim: gp.anim,
                expression: gp.expression,
                facing: gp.dir === 3 ? -1 : 1
            });

            this.drawDirectionArrow(gp.x, gp.y + bob, rotation, {
                distance: 35,
                size: 20,
                color: 'rgba(255, 255, 255, 0.7)'
            });
        });
    }
}