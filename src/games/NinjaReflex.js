/* src/games/NinjaReflex.js */

import BaseGame from './BaseGame.js';

export default class NinjaReflex extends BaseGame {

    static get manifest() {
        return {
            id: 'ninja-reflex',
            title: 'Ninja Reflex',
            description: 'Battle Royale quick-draw! Slowest reaction and false starts are eliminated!',
            tutorial: 'Wait for the signal, then TAP FAST! Slowest reaction and false starts are eliminated!',
            controllerType: 'CONTROLLER',
            tournamentRules: {
                winValue: 1,
                livesPerRound: 1
            }
        };
    }

    onSetup() {
        // Battle Royale elimination format: last reflex master standing takes the match
        this.config.winCondition = 'SURVIVAL';
        this.config.winValue = 1;
        this.config.roundEndCriteria = 'SURVIVAL';
        this.config.livesPerRound = 1;
        this.config.eliminateOnDeath = true;
        this.config.roundResetType = 'ELIMINATION';

        this.gameState = 'WAITING';
        this.flashTime = 0;
        this.nextFakeTime = 0;

        this.bgAlpha = 0;
        this.fakeAlpha = 0;
        this.fakeType = 0;
        this.fakeAnim = 0;

        this.skyColor = [44, 62, 80];
        this.roundWinner = null;
    }

    onRoundStart() {
        this.startNextStrike();
    }

    startNextStrike() {
        this.gameState = 'WAITING';
        this.roundWinner = null;
        this.bgAlpha = 0;
        this.fakeAlpha = 0;

        this.skyColor = this.p.random([
            [44, 62, 80],
            [255, 127, 80],
            [135, 206, 235]
        ]);

        const now = this.p.millis();
        this.flashTime = now + this.p.random(2500, 6500);

        this.scheduleNextFake(now);

        const count = this.players.length;
        const spacing = Math.min(280, Math.floor(1540 / Math.max(1, count)));
        const avatarSize = count >= 7 ? 95 : (count >= 5 ? 115 : 140);

        const positions = this.getLinearPositions(count, spacing, {
            axis: 'x',
            centerCoord: this.CX,
            fixedCoord: this.CY + 100
        });

        // Initialize or update duelist states
        this.gamePlayers = this.players.map((p, i) => {
            const isAlive = !p.isEliminated;
            return {
                id: p.id,
                idx: i,
                config: p,
                x: positions[i].x,
                y: positions[i].y,
                size: avatarSize,
                anim: isAlive ? 'IDLE' : 'LOSE',
                expression: isAlive ? 'angry' : 'stunned',
                reactionTime: null
            };
        });
    }

    scheduleNextFake(currentTime) {
        this.fakeType = Math.floor(this.p.random(0, 3));
        this.nextFakeTime = currentTime + this.p.random(1500, 2600);
    }

    onPlayerInput(player, type) {
        if (type !== 'PRESS') return;

        const gp = this.gamePlayers.find(p => p.id === player.id);
        if (!gp || this.players[gp.idx].isEliminated || gp.reactionTime !== null) return;

        if (this.gameState === 'WAITING') {
            this.handleFalseStart(gp);
        } else if (this.gameState === 'FLASH') {
            this.handlePlayerStrike(gp);
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

        // Check if only 1 survivor remains
        const survivors = this.players.filter(p => !p.isEliminated);
        if (survivors.length <= 1) {
            this.endRound(survivors[0] || null);
        } else {
            // Re-arm next draw for remaining survivors
            this.scheduleTimeout(() => {
                if (this.state.phase === 'PLAYING') this.startNextStrike();
            }, 1800);
        }
    }

    handlePlayerStrike(gp) {
        const reaction = Math.floor(this.p.millis() - this.flashTime);
        gp.reactionTime = reaction;
        gp.anim = 'ATTACK';
        gp.expression = 'happy';
        this.playSound('jump');

        this.checkStrikeCompletion();
    }

    checkStrikeCompletion() {
        const livingPlayers = this.gamePlayers.filter(gp => !this.players[gp.idx].isEliminated);
        const allStruck = livingPlayers.every(gp => gp.reactionTime !== null);

        if (allStruck) {
            this.evaluateStrikeResults();
        }
    }

    evaluateStrikeResults() {
        this.gameState = 'EVALUATING';

        const livingPlayers = this.gamePlayers.filter(gp => !this.players[gp.idx].isEliminated);
        if (livingPlayers.length <= 1) {
            this.endRound(livingPlayers[0] ? this.players[livingPlayers[0].idx] : null);
            return;
        }

        // Sort living duelists by reaction speed (fastest to slowest)
        livingPlayers.sort((a, b) => a.reactionTime - b.reactionTime);

        const fastest = livingPlayers[0];
        const slowest = livingPlayers[livingPlayers.length - 1];

        // Eliminate the slowest striker of this draw!
        this.ui.showTurnMessage(`${slowest.config.name} was too slow! (${slowest.reactionTime}ms)`, '#FF5A36');
        slowest.anim = 'LOSE';
        slowest.expression = 'stunned';
        this.eliminatePlayer(slowest.idx);

        this.scheduleTimeout(() => {
            const survivors = this.players.filter(p => !p.isEliminated);
            if (survivors.length <= 1) {
                this.endRound(survivors[0] || null);
            } else {
                this.startNextStrike();
            }
        }, 2000);
    }

    runDemoAI() {
        const t = this.p.millis();

        this.gamePlayers.forEach(gp => {
            if (this.players[gp.idx].isEliminated || gp.reactionTime !== null) return;

            if (this.gameState === 'WAITING' && this.fakeAlpha > 100 && this.p.random() < 0.08) {
                this.simulateInput(gp.idx, 'PRESS');
            }

            if (this.gameState === 'FLASH') {
                const reflex = 190 + (gp.idx * 45) + this.p.random(0, 110);
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
            } else if (t >= this.nextFakeTime && t < this.flashTime - 1000) {
                this.playSound('pop');
                this.fakeAlpha = 255;
                this.fakeAnim = 0;
                this.scheduleNextFake(t);
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

        if (this.gamePlayers) {
            this.gamePlayers.forEach(gp => {
                this.drawShadow(gp.x, gp.y + 70, 80, 20, 50);

                this.drawAvatar(gp.config, gp.x, gp.y, {
                    size: gp.size,
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
                        subtext: gp.reactionTime === "FAIL" ? "EARLY" : null,
                        subtextColor: '#FF5A36'
                    });
                }
            });
        }

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

        if (this.gameState === 'FLASH') {
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