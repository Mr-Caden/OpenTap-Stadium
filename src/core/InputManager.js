/* src/core/InputManager.js */

export default class InputManager {
    constructor(playerManager) {
        this.playerManager = playerManager;
        this.activeGameListener = null; 
        this.networkManager = null; 

        window.addEventListener('keydown', (e) => this.handleKey(e, 'PRESS'));
        window.addEventListener('keyup', (e) => this.handleKey(e, 'RELEASE'));
    }

    setNetworkManager(nm) { this.networkManager = nm; }
    setGameListener(callback) { this.activeGameListener = callback; }

    handleKey(e, type) {
        if (['Space', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
        let key = e.key;
        if (e.code === 'NumpadAdd' || e.code === 'Equal') key = '+';
        const players = this.playerManager.getActivePlayers();
        const player = players.find(p => p.key === key);
        if (player) this.triggerInput(player.id, type, false);
    }

    triggerInput(playerId, type, isNetworkInput, payload = null) {
        if (!this.activeGameListener) return;

        // If it's a VECTOR input (Joystick), we might want to store it in Player State 
        // directly for games that poll, but for now we pass it through.
        
        if (isNetworkInput) {
            this.activeGameListener(playerId, type, payload);
        } else {
            const delay = this.networkManager ? this.networkManager.systemLag : 0;
            if (delay > 0) {
                setTimeout(() => { this.activeGameListener(playerId, type, payload); }, delay);
            } else {
                this.activeGameListener(playerId, type, payload);
            }
        }
    }
}
