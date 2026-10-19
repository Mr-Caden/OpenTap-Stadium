/* src/core/InputManager.js */

export default class InputManager {
    constructor(playerManager) {
        this.playerManager = playerManager;
        this.activeGameListener = null; 
        this.networkManager = null; 

        window.addEventListener('keydown', (e) => this.handleKey(e, 'PRESS'));
        window.addEventListener('keyup', (e) => this.handleKey(e, 'RELEASE'));
    }

    setNetworkManager(nm) { 
        this.networkManager = nm; 
    }
    
    setGameListener(callback) { 
        this.activeGameListener = callback; 
    }

    handleKey(e, type) {
        // Prevent default browser scrolling and default button triggers on common game keys
        if (['Space', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(e.key)) {
            e.preventDefault();
        }

        let key = e.key;
        if (e.code === 'NumpadAdd' || e.code === 'Equal') key = '+';

        const players = this.playerManager.getActivePlayers();
        const player = players.find(p => p.key === key);
        if (player) {
            this.triggerInput(player.id, type, false);
        }
    }

    triggerInput(playerId, type, isNetworkInput, payload = null) {
        const dispatch = () => {
            // Broadcast standardized event so menus, overlays, and UI can accept input from any player
            window.dispatchEvent(new CustomEvent('player-input', {
                detail: { playerId, type, payload }
            }));

            if (this.activeGameListener) {
                this.activeGameListener(playerId, type, payload);
            }
        };

        if (isNetworkInput) {
            dispatch();
        } else {
            const delay = this.networkManager ? this.networkManager.systemLag : 0;
            if (delay > 0) {
                setTimeout(dispatch, delay);
            } else {
                dispatch();
            }
        }
    }
}