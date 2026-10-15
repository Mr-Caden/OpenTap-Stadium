export default class TurnManager {
    constructor(players, uiManager, onTurnChange) {
        this.players = players;
        this.ui = uiManager;
        this.onTurnChange = onTurnChange;

        this.currentIndex = 0;
        this.turnOrder = [];

        // Background Transition State
        this.targetColor = null;
        this.currentColor = [240, 234, 214];
        this.isTransitioning = false;
    }

    init(startRandom = true) {
        this.turnOrder = this.players.map((p, i) => i);

        if (startRandom) {
            // Safety: Ensure we don't pick an eliminated player
            let loops = 0;
            do {
                this.currentIndex = Math.floor(Math.random() * this.turnOrder.length);
                loops++;
            } while (this.getCurrentPlayer().isEliminated && loops < 50);
        } else {
            this.currentIndex = 0;
            if (this.getCurrentPlayer().isEliminated) {
                this.nextTurn();
                return;
            }
        }

        this.startTurn();
    }

    getCurrentPlayer() {
        return this.players[this.turnOrder[this.currentIndex]];
    }

    nextTurn() {
        let attempts = 0;
        do {
            this.currentIndex = (this.currentIndex + 1) % this.turnOrder.length;
            attempts++;
        } while (this.getCurrentPlayer().isEliminated && attempts < this.turnOrder.length);

        this.startTurn();
    }

    startTurn() {
        const player = this.getCurrentPlayer();
        if (player.isEliminated) return;

        this.ui.showTurnMessage(`${player.name}'s Turn!`, player.color);

        this.targetColor = this.hexToRgb(player.color);
        this.isTransitioning = true;

        if (this.onTurnChange) this.onTurnChange(player);
    }

    update(p5) {
        if (this.isTransitioning && this.targetColor) {
            this.currentColor[0] = p5.lerp(this.currentColor[0], this.targetColor[0], 0.05);
            this.currentColor[1] = p5.lerp(this.currentColor[1], this.targetColor[1], 0.05);
            this.currentColor[2] = p5.lerp(this.currentColor[2], this.targetColor[2], 0.05);

            if (Math.abs(this.currentColor[0] - this.targetColor[0]) < 1) {
                this.isTransitioning = false;
            }
        }
        return this.currentColor;
    }

    hexToRgb(hex) {
        const bigint = parseInt(hex.replace('#', ''), 16);
        return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
    }
}