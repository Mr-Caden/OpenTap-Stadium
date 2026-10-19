/* src/games/CodeBreaker.js */

import BaseGame from "./BaseGame.js";

export default class CodeBreaker extends BaseGame {
    static get manifest() {
        return {
            id: "code-breaker",
            title: "Code Breaker",
            description: "Crack the secret code! Keep guessing until someone breaks it!",
            tutorial: "Pick tens then ones. Follow higher/lower clues until someone cracks the code!",
            controllerType: "CONTROLLER",
            tournamentRules: {
                winValue: 1,
                livesPerRound: 1,
            },
        };
    }

    onSetup() {
        this.config.winCondition = "SCORE";
        this.config.winValue = 1; // First player to crack the code wins immediately
        this.config.roundEndCriteria = "NONE";
        this.config.livesPerRound = 1;
        this.config.eliminateOnDeath = false;
        this.config.showRoundResultUI = false;

        this.secretNumber = 0;
        this.playerStates = [];
        this.activeJudges = [];
        this.gameState = "GUESSING";
        this.needNewSecret = true;
    }

    onRoundStart() {
        const now = this.p.millis();

        // Generate one single secret code for the entire match
        if (this.needNewSecret) {
            this.secretNumber = Math.floor(this.p.random(0, 100));
            this.needNewSecret = false;
            this.activeJudges = [];

            this.playerStates = this.players.map((p, i) => ({
                id: p.id,
                config: p,
                index: i,
                phase: "tens",
                digit: 0,
                digitTimer: now,
                tens: 0,
                ones: 0,
                guess: null,
                diff: 100,
                isClosest: false,
                lastRoundGuess: null,
                lastRoundFeedback: null,
            }));
        }

        this.gameState = "GUESSING";
    }

    onPlayerInput(player, type) {
        if (type === "PRESS" && this.gameState === "GUESSING") {
            const ps = this.playerStates.find((state) => state.id === player.id);
            if (ps) this.lockDigit(ps);
        }
    }

    runDemoAI() {
        this.playerStates.forEach((ps) => {
            if (
                ps.phase !== "locked" &&
                ps.phase !== "done" &&
                this.p.random() < 0.025
            ) {
                this.lockDigit(ps);
            }
        });
    }

    onDraw() {
        if (this.gameState === "GUESSING") {
            this.updateSpinners();
            this.checkAllLocked();
        }

        this.updateJudges();
        this.drawJudges();
        this.drawPlayerColumns();
    }

    updateSpinners() {
        const p = this.p;
        const interval = 550;

        this.playerStates.forEach((ps) => {
            if (ps.phase === "locked" || ps.phase === "done") return;
            if (p.millis() - ps.digitTimer > interval) {
                ps.digit = (ps.digit + 1) % 10;
                ps.digitTimer = p.millis();
            }
        });
    }

    lockDigit(ps) {
        if (ps.phase === "locked") return;

        this.playSound("click");

        if (ps.phase === "tens") {
            ps.tens = ps.digit;
            ps.phase = "ones";
            ps.digit = 0;
            ps.digitTimer = this.p.millis();
        } else if (ps.phase === "ones") {
            ps.ones = ps.digit;
            ps.guess = ps.tens * 10 + ps.ones;
            ps.phase = "locked";
        }
    }

    checkAllLocked() {
        const allLocked = this.playerStates.every((ps) => ps.phase === "locked");
        if (allLocked) {
            this.gameState = "REVEAL";
            this.scheduleTimeout(() => this.evaluateGuesses(), 700);
        }
    }

    evaluateGuesses() {
        this.activeJudges = [];

        let exactMatchWinner = null;
        let bestDiff = 100;

        this.playerStates.forEach((ps) => {
            const diff = ps.guess - this.secretNumber;
            ps.diff = Math.abs(diff);
            ps.lastRoundGuess = ps.guess;

            if (diff === 0) {
                ps.lastRoundFeedback = "win";
                exactMatchWinner = ps;
            } else if (diff < 0) {
                ps.lastRoundFeedback = "low";
            } else {
                ps.lastRoundFeedback = "high";
            }

            if (ps.diff < bestDiff) bestDiff = ps.diff;
            ps.phase = "done";
            ps.isClosest = false;
        });

        const availableW = this.V_WIDTH - 400;
        const colW = availableW / this.playerStates.length;
        const startX = 200;

        this.playerStates.forEach((ps) => {
            if (ps.diff === bestDiff) {
                ps.isClosest = true;
                this.activeJudges.push({
                    x: this.CX,
                    targetX: startX + colW * ps.index + colW / 2,
                    anim: 0,
                    label: exactMatchWinner ? "CRACKED!" : "CLOSEST!",
                });
            }
        });

        if (exactMatchWinner) {
            // Someone cracked the exact secret code: game over, winner crowned!
            this.playSound("win");
            const winningPlayer = this.players[exactMatchWinner.index];
            if (winningPlayer) winningPlayer.score++;
            this.updateUI();

            this.scheduleTimeout(() => {
                if (this.mode !== "demo") {
                    this.ui.showMessage(
                        `Code Cracked: ${this.secretNumber}!`,
                        `${winningPlayer.name} cracked the secret code!`,
                        "Continue",
                        () => this.finishGame()
                    );
                } else {
                    this.finishGame();
                }
            }, 1000);
        } else {
            // No exact match: play feedback bump, unlock spinners, keep the same secret code, and guess again!
            this.playSound("bump");

            this.scheduleTimeout(() => {
                const now = this.p.millis();
                this.playerStates.forEach((ps) => {
                    ps.phase = "tens";
                    ps.digit = 0;
                    ps.digitTimer = now;
                    ps.tens = 0;
                    ps.ones = 0;
                    ps.guess = null;
                });
                this.gameState = "GUESSING";
            }, 1400);
        }
    }

    updateJudges() {
        this.activeJudges.forEach((j) => {
            j.x = this.p.lerp(j.x, j.targetX, 0.06);
            j.anim += 0.1;
        });
    }

    drawJudges() {
        this.activeJudges.forEach((j) => this.drawJudge(j));
    }

    drawJudge(j) {
        const p = this.p;
        p.push();
        p.translate(j.x, 200);
        p.translate(0, Math.sin(j.anim) * 5);

        p.fill(50);
        p.noStroke();
        p.rectMode(p.CENTER);
        p.rect(0, 0, 60, 60, 8);
        p.fill(0);
        p.rect(0, -8, 45, 30);
        p.fill("#0f0");
        p.circle(-12, -8, 6);
        p.circle(12, -8, 6);
        p.fill(100);
        p.rect(0, -38, 8, 15);
        p.push();
        p.translate(0, -45);
        p.rotate(j.anim * 2);
        p.rect(0, 0, 90, 8);
        p.pop();

        if (Math.abs(j.x - j.targetX) < 10) {
            p.fill(255);
            p.noStroke();
            p.rect(0, -75, 140, 40, 8);
            p.triangle(0, -55, -8, -40, 8, -40);
            p.fill(0);
            p.textSize(18);
            p.textAlign(p.CENTER, p.CENTER);
            p.text(j.label, 0, -75);
        }
        p.pop();
    }

    drawPlayerColumns() {
        const p = this.p;
        const availableW = this.V_WIDTH - 400;
        const colW = availableW / this.playerStates.length;
        const startX = 200;

        this.playerStates.forEach((ps, i) => {
            const cx = startX + i * colW + colW / 2;
            p.push();
            p.translate(cx, 0);

            let exp = "idle";
            if (ps.lastRoundFeedback === "win") exp = "happy";
            else if (ps.isClosest) exp = "happy";

            this.drawAvatar(ps.config, 0, 350, { size: 110, expression: exp });

            if (ps.lastRoundFeedback) {
                p.push();
                p.translate(0, 600);
                if (ps.lastRoundFeedback === "win") {
                    p.fill(ps.config.color);
                    p.noStroke();
                    p.circle(0, 0, 160);
                    p.fill(255);
                    p.textSize(80);
                    p.textAlign(p.CENTER, p.CENTER);
                    p.text("★", 0, 8);
                } else {
                    p.fill(ps.config.color);
                    p.noStroke();
                    p.circle(0, 0, 140);
                    p.fill(255);
                    p.textSize(60);
                    p.textStyle(p.BOLD);
                    p.textAlign(p.CENTER, p.CENTER);
                    p.text(ps.lastRoundGuess, 0, 5);

                    const isUp = ps.lastRoundFeedback === "low";
                    const yOff = isUp ? -110 : 110;
                    p.push();
                    p.translate(0, yOff);
                    if (!isUp) p.rotate(p.PI);
                    p.fill(ps.config.color);
                    p.noStroke();
                    p.beginShape();
                    p.vertex(0, -40);
                    p.bezierVertex(20, -40, 40, 0, 40, 15);
                    p.vertex(40, 15);
                    p.vertex(20, 15);
                    p.vertex(20, 40);
                    p.vertex(-20, 40);
                    p.vertex(-20, 15);
                    p.vertex(-40, 15);
                    p.bezierVertex(-40, 0, -20, -40, 0, -40);
                    p.endShape(p.CLOSE);
                    p.pop();
                }
                p.pop();
            }

            const spinY = 900;
            p.stroke(ps.config.color);
            p.strokeWeight(6);
            p.fill(255);
            p.rectMode(p.CENTER);

            p.fill(ps.phase === "tens" ? "#fff" : "#eee");
            p.rect(-50, spinY, 90, 130, 15);

            p.fill(ps.phase === "ones" ? "#fff" : "#eee");
            p.rect(50, spinY, 90, 130, 15);

            p.fill(0);
            p.noStroke();
            p.textSize(80);
            p.textAlign(p.CENTER, p.CENTER);

            let tVal = ps.phase === "tens" ? ps.digit : ps.tens;
            let oVal =
                ps.phase === "ones"
                    ? ps.digit
                    : ps.phase === "tens"
                    ? "-"
                    : ps.ones;

            if (ps.phase === "locked" || ps.phase === "done") {
                tVal = Math.floor(ps.guess / 10);
                oVal = ps.guess % 10;
            }

            p.text(tVal, -50, spinY);
            p.text(oVal, 50, spinY);

            p.textSize(22);
            p.fill(100);
            let status = "";
            if (ps.phase === "tens") status = "PICK TENS";
            else if (ps.phase === "ones") status = "PICK ONES";
            else status = "LOCKED";
            p.text(status, 0, spinY + 100);

            p.pop();
        });
    }
}