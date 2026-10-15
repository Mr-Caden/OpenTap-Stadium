/* src/games/NinjaReflex.js */

import BaseGame from './BaseGame.js';

export default class NinjaReflex extends BaseGame {

    static get manifest() {
        return {
            id: 'ninja-reflex',
            title: 'Ninja Reflex',
            description: 'Wait for the flash... STRIKE!',
            tutorial: 'Wait for the signal... then TAP FAST!',
            controllerType: 'CONTROLLER',
            tournamentRules: {
                winValue: 3,
                livesPerRound: 1
            }
        };
    }

    onSetup() {
        this.config.winCondition = 'SCORE';
        this.config.winValue = 7;
        this.config.roundEndCriteria = 'SURVIVAL';
        this.config.livesPerRound = 1;
        this.config.eliminateOnDeath = true;
        this.config.roundResetType = 'RESET_ALL';

        this.gameState = 'WAITING';
        this.flashTime = 0;
        this.nextFakeTime = 0;

        this.bgAlpha = 0;
        this.fakeAlpha = 0;
        this.fakeType = 0;
        this.fakeAnim = 0;

        this.skyColor = [44, 62, 80];
        this.roundWinner = null;
        this.winAnimTimer = 0;
    }

    onRoundStart() {
        this.gameState = 'WAITING';
        this.roundWinner = null;
        this.bgAlpha = 0;
        this.fakeAlpha = 0;
        this.winAnimTimer = 0;

        this.skyColor = this.p.random([
            [44, 62, 80],
            [255, 127, 80],
            [135, 206, 235]
        ]);

        const now = this.p.millis();
        this.flashTime = now + this.p.random(3000, 8000);

        this.scheduleNextFake(now);

        const count = this.players.length;
        const positions = this.getLinearPositions(count, 300, {
            axis: 'x',
            centerCoord: this.CX,
            fixedCoord: this.CY + 100
        });

        this.gamePlayers = this.players.map((p, i) => ({
            id: p.id,
            idx: i,
            config: p,
            x: positions[i].x,
            y: positions[i].y,
            anim: 'IDLE',
            expression: 'angry',
            reactionTime: null
        }));
    }

    scheduleNextFake(currentTime) {
        this.fakeType = Math.floor(this.p.random(0, 3));
        this.nextFakeTime = currentTime + this.p.random(1500, 3000);
    }

    onPlayerInput(player, type) {
        if (type !== 'PRESS') return;

        const gp = this.gamePlayers.find(p => p.id === player.id);
        if (!gp || this.players[gp.idx].isEliminated || gp.reactionTime !== null) return;

        if (this.gameState === 'WAITING') {
            this.handleFalseStart(gp);
        } else if (this.gameState === 'FLASH' || this.gameState === 'END_DELAY') {
            this.handleStrike(gp);
        }
    }

    handleFalseStart(gp) {
        this.playSound('bump');
        this.shake(10, 10);

        gp.anim = 'DIZZY';
        gp.expression = 'stunned';
        gp.reactionTime = "FAIL";

        this.ui.showTurnMessage(`${gp.config.name} moved too early!`, '#FF5A36');
        this.eliminatePlayer(gp.idx);
    }

    handleStrike(gp) {
        const reaction = Math.floor(this.p.millis() - this.flashTime);
        gp.reactionTime = reaction;

        if (!this.roundWinner) {
            this.roundWinner = gp;
            this.gameState = 'END_DELAY';

            this.playSound('jump');

            gp.anim = 'ATTACK';
            gp.expression = 'angry';
            this.winAnimTimer = this.p.millis() + 600;

            this.gamePlayers.forEach(p => {
                if (p !== gp && !this.players[p.idx].isEliminated) {
                    p.anim = 'LOSE';
                    p.expression = 'stunned';
                }
            });

            this.ui.showTurnMessage(`${gp.config.name} Wins! (${reaction}ms)`, '#2ecc71');
            this.updateUI();

            setTimeout(() => {
                this.endRound(this.players[gp.idx]);
            }, 2000);

        } else {
            gp.anim = 'ATTACK';
            gp.expression = 'idle';
            this.playSound('click');
        }
    }

    runDemoAI() {
        const t = this.p.millis();

        this.gamePlayers.forEach(gp => {
            if (this.players[gp.idx].isEliminated || gp.reactionTime !== null) return;

            if (this.gameState === 'WAITING' && this.fakeAlpha > 100 && this.p.random() < 0.1) {
                this.simulateInput(gp.idx, 'PRESS');
            }

            if (this.gameState === 'FLASH' || this.gameState === 'END_DELAY') {
                const reflex = 200 + (gp.idx * 50) + this.p.random(0, 150);
                if (t > this.flashTime + reflex) {
                    this.simulateInput(gp.idx, 'PRESS');
                }
            }
        });
    }

    onDraw() {
        const p = this.p;
        const t = p.millis();

        if (this.gameState === 'WAITING') {
            if (t >= this.flashTime) {
                this.gameState = 'FLASH';
                this.playSound('click');
                this.bgAlpha = 255;
            }
            else if (t >= this.nextFakeTime && t < this.flashTime - 1000) {
                this.playSound('pop');
                this.fakeAlpha = 255;
                this.fakeAnim = 0;
                this.scheduleNextFake(t);
            }
        }

        if (this.gameState === 'END_DELAY' && this.roundWinner) {
            if (t > this.winAnimTimer && this.roundWinner.anim === 'ATTACK') {
                this.roundWinner.anim = 'WIN';
                this.roundWinner.expression = 'happy';
            }
        }

        p.background(this.skyColor);
        p.noStroke();
        p.fill(255, 255, 255, 50);
        p.circle(this.CX, this.CY - 200, 400);

        p.fill('#f6e58d');
        p.rect(-5000, this.CY + 100, 10000, this.V_HEIGHT);

        p.stroke('#bcaaa4'); p.strokeWeight(8);
        for (let x = -2000; x < 4000; x += 300) {
            p.line(x, this.CY + 100, x, this.V_HEIGHT);
        }

        p.noStroke();
        p.fill('#211B18');
        p.rect(-5000, this.CY + 80, 10000, 40);

        this.gamePlayers.forEach(gp => {
            this.drawShadow(gp.x, gp.y + 70, 80, 20, 50);

            this.drawAvatar(gp.config, gp.x, gp.y, {
                size: 140,
                anim: gp.anim,
                expression: gp.expression,
                facing: 1
            });

            if (gp.reactionTime !== null) {
                const timeStr = gp.reactionTime === "FAIL" ? "X" : `${gp.reactionTime}ms`;
                this.drawSpeechBubble(gp.x, gp.y - 120, timeStr, {
                    width: 130,
                    height: 52,
                    bgColor: 'rgba(33, 27, 24, 0.85)',
                    subtext: gp === this.roundWinner ? "WIN" : null,
                    subtextColor: '#F59E0B'
                });
            }
        });

        if (this.fakeAlpha > 0) {
            this.fakeAlpha -= 6;
            this.fakeAnim += 0.1;

            p.fill(0, 0, 0, this.fakeAlpha * 0.3);
            p.rect(-5000, -5000, 10000, 10000);

            p.push();
            p.translate(this.CX, this.CY - 150);

            const scale = 1 + Math.sin(this.fakeAnim) * 0.2;
            p.scale(scale);

            p.textSize(150);
            p.textAlign(p.CENTER, p.CENTER);
            p.textStyle(p.BOLD);
            p.noStroke();

            if (this.fakeType === 0) {
                p.fill('#F59E0B');
                p.text("?", 0, 0);
            } else if (this.fakeType === 1) {
                p.fill('#9b59b6');
                p.text("!", 0, 0);
            } else {
                p.fill('#95a5a6');
                p.textSize(120);
                p.text("Zzz", 0, 0);
            }
            p.pop();
        }

        if (this.bgAlpha > 0) {
            p.fill(255, 255, 255, this.bgAlpha);
            p.rect(-5000, -5000, 10000, 10000);
            this.bgAlpha -= 15;
        }

        if (this.gameState === 'FLASH' || this.gameState === 'END_DELAY') {
            p.push();
            p.translate(this.CX, this.CY - 150);
            p.scale(1 + Math.sin(t * 0.05) * 0.1);

            p.fill('#FF5A36');
            p.noStroke();
            p.rectMode(p.CENTER);
            p.rect(0, -20, 40, 100, 10);
            p.circle(0, 60, 40);

            p.pop();
        }
    }
}