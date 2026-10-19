/* src/games/RedLightGreenLight.js */

import BaseGame from './BaseGame.js';

export default class RedLightGreenLight extends BaseGame {

    static get manifest() {
        return {
            id: 'red-light',
            title: 'Red Light, Green Light',
            description: 'Sudden death race! Moving on red eliminates you!',
            tutorial: 'Hold to run, release to stop! Moving on red eliminates you!',
            controllerType: 'CONTROLLER',
            tournamentRules: {
                winValue: 1,
                livesPerRound: 1
            }
        };
    }

    onSetup() {
        const count = this.players.length;

        this.config.winCondition = 'ROUNDS';
        this.config.winValue = count >= 7 ? 2 : 3;
        this.config.livesPerRound = 1;
        this.config.eliminateOnDeath = false;
        this.config.roundEndCriteria = 'NONE';

        this.TRACK_LENGTH = 1600;
        this.START_LINE_X = 200;
        this.RUN_SPEED = 2.8;
        this.GRACE_PERIOD = 200;

        this.lightState = 'RED';
        this.nextSwitchTime = 0;
        this.lastSwitchTime = 0;
        this.endTimerStart = 0;
        this.ROUND_TIME_LIMIT = 10000;

        this.robotAnim = 0;
        this.judgeColor = '#FF5A36';
        this.judgeFacing = -1;
    }

    onRoundStart() {
        this.lightState = 'RED';
        this.nextSwitchTime = this.p.millis() + 2000;
        this.finishedCount = 0;
        this.endTimerStart = 0;

        const totalCount = this.players.length;
        // Compress lane spacing dynamically (up to 10 tracks fit in the 860px vertical band)
        const laneSpacing = Math.min(150, Math.floor(860 / Math.max(1, totalCount)));
        const lanePositions = this.getLinearPositions(totalCount, laneSpacing, { axis: 'y' });

        this.gamePlayers = this.players.map((basePlayer, index) => ({
            id: basePlayer.id,
            idx: index,
            config: basePlayer,
            x: this.START_LINE_X,
            y: lanePositions[index].y,
            isEliminated: false,
            finished: false,
            finishRank: 0,
            animFrame: 0,
            expression: 'idle',
            facing: 1,
            resetTimer: 0,
            isRunning: false
        }));
    }

    onPlayerInput(player, type) {
        const gp = this.gamePlayers.find(p => p.id === player.id);
        if (!gp || gp.finished || gp.isEliminated) return;

        if (type === 'PRESS') {
            gp.isRunning = true;
        } else if (type === 'RELEASE') {
            gp.isRunning = false;
        }
    }

    runDemoAI() {
        this.gamePlayers.forEach(p => {
            if (p.finished) return;

            if (this.lightState === 'GREEN' || this.lightState === 'YELLOW') {
                p.isRunning = true;
            } else {
                p.isRunning = false;
                if (this.p.random() < 0.005) p.isRunning = true;
            }
        });
    }

    onFixedUpdate(dt) {
        const t = this.p.millis();

        if (t > this.nextSwitchTime) {
            this.switchLight();
        }

        if (this.endTimerStart > 0) {
            const timeLeft = this.ROUND_TIME_LIMIT - (t - this.endTimerStart);
            if (timeLeft <= 0) {
                const sorted = [...this.gamePlayers].sort((a, b) => {
                    if (a.finished && !b.finished) return -1;
                    if (!a.finished && b.finished) return 1;
                    return b.x - a.x;
                });
                const winner = this.players[sorted[0].idx];
                this.endRound(winner);
                return;
            }
        }

        let activeCount = 0;

        this.gamePlayers.forEach(p => {
            if (p.isEliminated || p.finished) return;
            activeCount++;

            if (p.resetTimer > 0) {
                p.resetTimer--;
                p.isRunning = false;
                return;
            }

            if (p.isRunning) {
                let currentSpeed = this.RUN_SPEED;
                if (this.lightState === 'YELLOW') currentSpeed *= 0.5;

                p.x += currentSpeed;
                p.animFrame += 0.2;

                if (this.lightState === 'RED') {
                    if (t > this.lastSwitchTime + this.GRACE_PERIOD) {
                        this.resetPlayer(p);
                    }
                }
            } else {
                p.animFrame = 0;
            }

            if (p.x >= this.TRACK_LENGTH) {
                this.handleFinish(p);
            }
        });

        if (activeCount === 0 && this.state.phase === 'PLAYING') {
            if (this.finishedCount === this.gamePlayers.length) {
                const winner = this.players[this.gamePlayers.find(p => p.finishRank === 1).idx];
                this.endRound(winner);
            }
        }
    }

    onDraw() {
        this.drawEnvironment();
        this.drawRobot();
        this.drawPlayers();
        this.drawParticles();
        this.drawTrafficLightUI();
    }

    switchLight() {
        const t = this.p.millis();
        this.lastSwitchTime = t;

        if (this.lightState === 'RED') {
            this.lightState = 'GREEN';
            this.judgeColor = '#2ecc71';
            this.judgeFacing = 1;
            this.nextSwitchTime = t + this.p.random(2000, 5000);
            this.playSound('jump');

        } else if (this.lightState === 'GREEN') {
            if (this.p.random() < 0.7) {
                this.lightState = 'RED';
                this.judgeColor = '#FF5A36';
                this.judgeFacing = -1;
                this.nextSwitchTime = t + this.p.random(2000, 4000);
                this.playSound('bump');
            } else {
                this.lightState = 'YELLOW';
                this.judgeColor = '#F59E0B';
                this.judgeFacing = -1;
                this.nextSwitchTime = t + this.p.random(1500, 2500);
                this.playSound('click');
            }

        } else {
            this.lightState = 'RED';
            this.judgeColor = '#FF5A36';
            this.judgeFacing = -1;
            this.nextSwitchTime = t + this.p.random(2000, 4000);
            this.playSound('bump');
        }
    }

    resetPlayer(p) {
        this.playSound('pop');
        this.shake(5, 10);
        this.spawnParticles(p.x, p.y, { color: p.config.color, count: 10, size: 12, speed: 4 });

        p.x = this.START_LINE_X;
        p.resetTimer = 60;
        p.expression = 'stunned';
        setTimeout(() => { p.expression = 'idle'; }, 1000);
    }

    handleFinish(p) {
        p.finished = true;
        this.finishedCount++;
        p.finishRank = this.finishedCount;

        this.playSound('win');

        if (this.finishedCount === 1) {
            this.endTimerStart = this.p.millis();
        }

        let points = 0;
        if (p.finishRank === 1) points = 3;
        else if (p.finishRank === 2) points = 2;
        else if (p.finishRank === 3) points = 1;

        if (points > 0) {
            this.players[p.idx].score += points;
            this.updateUI();
        }
    }

    drawEnvironment() {
        const p = this.p;

        const trackTop = this.gamePlayers[0].y - 75;
        const trackHeight = this.gamePlayers.length * 150;

        p.fill('#E8E1D5'); p.noStroke();
        p.rect(0, trackTop, this.V_WIDTH, trackHeight);

        p.stroke(255, 100); p.strokeWeight(4);
        this.gamePlayers.forEach((gp, i) => {
            if (i > 0) {
                const ly = gp.y - 75;
                p.line(this.START_LINE_X, ly, this.TRACK_LENGTH, ly);
            }
        });

        p.stroke('#2ecc71'); p.strokeWeight(8);
        p.line(this.START_LINE_X, trackTop, this.START_LINE_X, trackTop + trackHeight);

        const checkSize = 25;
        const rows = Math.ceil(trackHeight / checkSize);

        p.noStroke();
        for (let i = 0; i < rows; i++) {
            const y = trackTop + (i * checkSize);
            p.fill((i % 2 === 0) ? '#211B18' : '#fff');
            p.rect(this.TRACK_LENGTH, y, checkSize, checkSize);
            p.fill((i % 2 === 0) ? '#fff' : '#211B18');
            p.rect(this.TRACK_LENGTH + checkSize, y, checkSize, checkSize);
        }
    }

    drawRobot() {
        const p = this.p;
        const x = this.TRACK_LENGTH + 200;

        const minY = this.gamePlayers[0].y;
        const maxY = this.gamePlayers[this.gamePlayers.length - 1].y;
        const centerY = (minY + maxY) / 2 - 100;

        this.robotAnim += 0.05;
        const hover = Math.sin(this.robotAnim) * 15;

        p.push();
        p.translate(x, centerY + hover);

        this.drawShadow(0, 200 - hover, 200, 50, 30);

        p.fill(50);
        p.rectMode(p.CENTER);
        p.rect(0, 0, 160, 200, 30);

        p.stroke(50); p.strokeWeight(10);
        p.line(0, -100, 0, -150);
        p.fill(this.judgeColor); p.noStroke();
        p.circle(0, -150, 30);

        p.fill(20);
        p.circle(0, -20, 120);

        p.drawingContext.shadowBlur = 50;
        p.drawingContext.shadowColor = this.judgeColor;
        p.fill(this.judgeColor);
        p.circle(0, -20, 90);
        p.drawingContext.shadowBlur = 0;

        p.fill(0, 100);
        if (this.lightState === 'RED') {
            p.rect(0, -20, 60, 20);
        } else if (this.lightState === 'YELLOW') {
            p.rect(0, -20, 60, 10);
        } else {
            p.arc(0, -20, 60, 60, 0, p.PI);
        }

        if (this.lightState === 'RED') {
            p.stroke(50); p.strokeWeight(20);
            p.line(-80, 0, -140, -40);
            p.line(80, 0, 140, -40);
            p.fill('#FF5A36'); p.noStroke();
            p.circle(-140, -40, 30);
            p.circle(140, -40, 30);
        } else {
            p.stroke(50); p.strokeWeight(20);
            p.line(-80, 0, -100, 60);
            p.line(80, 0, 100, 60);
        }

        p.pop();
    }

    drawPlayers() {
        const p = this.p;
        const sorted = [...this.gamePlayers].sort((a, b) => a.y - b.y);

        sorted.forEach(player => {
            let bounce = player.animFrame > 0 ? Math.abs(Math.sin(player.animFrame)) * 15 : 0;

            let exp = player.expression;
            if (player.finished) exp = 'happy';
            else if (this.lightState === 'RED' && player.animFrame > 0) exp = 'stunned';
            else if (this.lightState === 'YELLOW') exp = 'angry';

            if (player.resetTimer > 0) {
                player.resetTimer--;
                exp = 'stunned';
            }

            let anim = 'IDLE';
            if (player.resetTimer > 0) anim = 'LOSE';
            else if (player.animFrame > 0) anim = 'RUN';

            this.drawAvatar(player.config, player.x, player.y - bounce, {
                size: 90,
                anim: anim,
                expression: exp,
                facing: 1
            });

            if (player.animFrame > 0 && p.frameCount % 5 === 0) {
                this.spawnParticles(player.x - 40, player.y + 40, { color: '#E8E1D5', count: 1, size: 8, speed: 1 });
            }
        });
    }

    drawTrafficLightUI() {
        const p = this.p;
        const w = 240;
        const h = 90;
        const x = this.CX;

        const trackTop = this.gamePlayers[0].y - 75;
        const uiY = trackTop - 100;

        if (this.endTimerStart > 0) {
            const timeLeft = Math.ceil((this.ROUND_TIME_LIMIT - (p.millis() - this.endTimerStart)) / 1000);
            this.drawTimerBadge(timeLeft, {
                x: x,
                y: uiY + 80,
                criticalThreshold: 5,
                subtext: "HURRY UP!"
            });
        }

        p.push();
        p.translate(x, uiY);
        p.fill(30); p.noStroke();
        p.rectMode(p.CENTER);
        p.rect(0, 0, w, h, 40);

        p.noStroke();

        if (this.lightState === 'RED') {
            p.fill('#ff0000');
            p.drawingContext.shadowBlur = 30; p.drawingContext.shadowColor = '#ff0000';
            p.circle(-70, 0, 60);
        } else {
            p.fill('#550000'); p.drawingContext.shadowBlur = 0;
            p.circle(-70, 0, 50);
        }

        if (this.lightState === 'YELLOW') {
            p.fill('#ffff00');
            p.drawingContext.shadowBlur = 30; p.drawingContext.shadowColor = '#ffff00';
            p.circle(0, 0, 60);
        } else {
            p.fill('#555500'); p.drawingContext.shadowBlur = 0;
            p.circle(0, 0, 50);
        }

        if (this.lightState === 'GREEN') {
            p.fill('#00ff00');
            p.drawingContext.shadowBlur = 30; p.drawingContext.shadowColor = '#00ff00';
            p.circle(70, 0, 60);
        } else {
            p.fill('#005500'); p.drawingContext.shadowBlur = 0;
            p.circle(70, 0, 50);
        }

        p.drawingContext.shadowBlur = 0;
        p.pop();
    }
}