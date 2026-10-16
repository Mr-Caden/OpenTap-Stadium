/* src/games/AvatarMatch.js */

import BaseGame from "./BaseGame.js";
import AvatarSystem from "../core/AvatarSystem.js";

export default class AvatarMatch extends BaseGame {
    static get manifest() {
        return {
            id: "avatar-match",
            title: "Avatar Match",
            description: "Find the matching faces!",
            tutorial: "Take turns flipping cards to find matching pairs!",
            controllerType: "TOUCHPAD",
            tournamentRules: {
                winValue: 1,
                livesPerRound: 1,
            },
        };
    }

    onSetup() {
        this.config.winCondition = "CUSTOM";
        this.config.livesPerRound = 1;
        this.config.eliminateOnDeath = false;
        this.config.turnBased = true;
        this.config.turnBasedBackgroundColor = true;
        this.config.controllerType = "TOUCHPAD";

        this.CARD_SIZE = 150;
        this.GAP = 20;
        this.ANIM_SPEED = 0.15;

        this.cards = [];
        this.flippedCards = [];
        this.matchesFound = 0;
        this.totalPairs = 0;
        this.canClick = true;
    }

    onRoundStart() {
        this.cards = [];
        this.flippedCards = [];
        this.matchesFound = 0;
        this.canClick = true;
        this.generateBoard();
    }

    onPlayerInput(player, type) {
        if (!this.canClick) return;

        const activePlayer = this.players[this.state.activePlayerIndex];
        if (player.id !== activePlayer.id) return;

        if (type === "PRESS") {
            this.handleInputClick(player.cursorX, player.cursorY);
        }
    }

    onDraw() {
        const p = this.p;

        for (let i = 0; i < this.cards.length; i++) {
            this.drawCard(this.cards[i]);
        }

        // Shared local mouse support on host display
        if (this.mode !== "demo" && p.mouseIsPressed) {
            const activeP = this.players[this.state.activePlayerIndex];
            if (activeP && activeP.type === "local") {
                const vx = (p.mouseX - this.transX) / this.scaleFactor;
                const vy = (p.mouseY - this.transY) / this.scaleFactor;
                this.handleInputClick(vx, vy);
                p.mouseIsPressed = false;
            }
        }
    }

    handleInputClick(vx, vy) {
        if (!this.canClick) return;

        for (let i = this.cards.length - 1; i >= 0; i--) {
            const c = this.cards[i];
            if (c.isMatched || c.isFlipped) continue;

            const half = this.CARD_SIZE / 2 + 6;

            if (
                vx > c.x - half &&
                vx < c.x + half &&
                vy > c.y - half &&
                vy < c.y + half
            ) {
                this.flipCard(c);
                break;
            }
        }
    }

    drawCard(card) {
        const p = this.p;
        p.push();
        p.translate(card.x, card.y);

        if (card.flipState === "flipping_in") {
            card.scaleX -= this.ANIM_SPEED;
            if (card.scaleX <= 0) {
                card.scaleX = 0;
                card.isFlipped = !card.isFlipped;
                card.flipState = "flipping_out";
            }
        } else if (card.flipState === "flipping_out") {
            card.scaleX += this.ANIM_SPEED;
            if (card.scaleX >= 1) {
                card.scaleX = 1;
                card.flipState = "idle";
                if (this.flippedCards.length === 2 && card.isFlipped) {
                    this.checkMatch();
                }
            }
        }

        p.scale(card.scaleX, 1);
        p.noStroke();
        p.fill(0, 30);
        p.rectMode(p.CENTER);
        p.rect(5, 5, this.CARD_SIZE, this.CARD_SIZE, 14);

        if (!card.isFlipped && !card.isMatched) {
            p.fill("#ffffff");
            p.rect(0, 0, this.CARD_SIZE, this.CARD_SIZE, 14);
            p.fill("#f3ece1");
            p.circle(0, 0, this.CARD_SIZE * 0.62);
            p.fill("#c4bcb1");
            p.textSize(this.CARD_SIZE * 0.44);
            p.textAlign(p.CENTER, p.CENTER);
            p.textStyle(p.BOLD);
            p.text("?", 0, 4);
        } else {
            if (card.isMatched) {
                p.fill(card.matchOwner || "#ffffff");
                p.stroke(255);
                p.strokeWeight(5);
            } else {
                p.fill("#ffffff");
                p.stroke("#e8e1d5");
                p.strokeWeight(3);
            }
            p.rect(0, 0, this.CARD_SIZE, this.CARD_SIZE, 14);

            this.drawAvatar(card.data, 0, 10, {
                size: this.CARD_SIZE * 0.62,
                expression: card.isMatched ? "happy" : "idle",
            });
        }
        p.pop();
    }

    generateBoard() {
        const pCount = this.players.length;
        let cols, rows;

        // Gap-free grid geometry tailored to exact player tiers
        if (pCount <= 2) {
            cols = 5;
            rows = 4; // 20 cards = 10 pairs (5x4 full grid)
            this.CARD_SIZE = 160;
            this.GAP = 22;
        } else if (pCount <= 4) {
            cols = 6;
            rows = 5; // 30 cards = 15 pairs (6x5 full grid)
            this.CARD_SIZE = 145;
            this.GAP = 18;
        } else if (pCount <= 6) {
            cols = 6;
            rows = 6; // 36 cards = 18 pairs (6x6 full grid)
            this.CARD_SIZE = 135;
            this.GAP = 16;
        } else {
            cols = 8;
            rows = 6; // 48 cards = 24 pairs (8x6 full grid)
            this.CARD_SIZE = 125;
            this.GAP = 14;
        }

        this.totalPairs = (cols * rows) / 2;

        const pairs = [];
        const usedConfigs = new Set();
        for (let i = 0; i < this.totalPairs; i++) {
            let config;
            let hash;
            let attempts = 0;
            do {
                config = this.generateRandomConfig(i);
                hash = `${config.color}-${config.accessory}-${config.variant}`;
                attempts++;
            } while (usedConfigs.has(hash) && attempts < 200);

            usedConfigs.add(hash);
            pairs.push({ ...config });
            pairs.push({ ...config });
        }

        this.shuffle(pairs);

        const totalW = cols * this.CARD_SIZE + (cols - 1) * this.GAP;
        const totalH = rows * this.CARD_SIZE + (rows - 1) * this.GAP;
        const startX = (this.V_WIDTH - totalW) / 2 + this.CARD_SIZE / 2;
        const startY = (this.V_HEIGHT - totalH) / 2 + this.CARD_SIZE / 2;

        let idx = 0;
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                if (idx >= pairs.length) break;
                this.cards.push({
                    x: startX + x * (this.CARD_SIZE + this.GAP),
                    y: startY + y * (this.CARD_SIZE + this.GAP),
                    data: pairs[idx],
                    isFlipped: false,
                    isMatched: false,
                    matchOwner: null,
                    scaleX: 1,
                    flipState: "back",
                });
                idx++;
            }
        }
    }

    generateRandomConfig(id) {
        const colors = [
            "#FF6B6B",
            "#4D96FF",
            "#FFD93D",
            "#6BCB77",
            "#A66CFF",
            "#FF9F43",
            "#54A0FF",
            "#1ABC9C",
            "#E84393"
        ];
        const accs = AvatarSystem.ACCESSORIES;
        return {
            color: this.p.random(colors),
            accessory: this.p.random(accs),
            variant: this.p.random(["default", "feminine"]),
            id: id,
        };
    }

    flipCard(card) {
        this.playSound("click");
        if (this.flippedCards.length >= 2) return;
        card.flipState = "flipping_in";
        this.flippedCards.push(card);
    }

    checkMatch() {
        const c1 = this.flippedCards[0];
        const c2 = this.flippedCards[1];
        if (c1.data.id === c2.data.id) {
            this.canClick = false;
            setTimeout(() => {
                const player = this.players[this.state.activePlayerIndex];
                c1.isMatched = true;
                c2.isMatched = true;
                c1.matchOwner = player.color;
                c2.matchOwner = player.color;
                this.playSound("win");
                player.score++;
                this.updateUI();
                this.flippedCards = [];
                this.matchesFound++;
                this.canClick = true;
                if (this.matchesFound === this.totalPairs) this.finishGame();
            }, 400);
        } else {
            this.canClick = false;
            setTimeout(() => {
                this.playSound("bump");
                c1.flipState = "flipping_in";
                c2.flipState = "flipping_in";
                this.flippedCards = [];
                this.nextTurn();
                this.canClick = true;
            }, 800);
        }
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    runDemoAI() {
        if (this.p.frameCount % 60 === 0 && this.flippedCards.length < 2) {
            const available = this.cards.filter(
                (c) => !c.isMatched && !c.isFlipped
            );
            if (available.length > 0) {
                const pick = this.p.random(available);
                this.flipCard(pick);
            }
        }
    }
}