/* src/core/GameRunner.js */

export default class GameRunner {
    constructor(playerManager, inputManager, uiManager, audioManager) {
        this.realPlayerManager = playerManager; 
        this.inputManager = inputManager;
        this.uiManager = uiManager; 
        this.audioManager = audioManager;
        
        this.activeGame = null;
        this.activeP5 = null;
        this.mountedInstances = new Map();
        
        this.mockUI = {
            updateScoreboard: () => {},
            showMessage: () => {},
            showTurnMessage: () => {},
            hideMessage: () => {},
            showPodium: () => {},
            showTournamentStandings: () => {}
        };

        this.context = {
            players: null, 
            input: this.inputManager,
            ui: null, 
            audio: this.audioManager,
            p5: null
        };
    }

    unmount(containerId) {
        if (this.mountedInstances.has(containerId)) {
            const entry = this.mountedInstances.get(containerId);
            if (entry.game && typeof entry.game.destroy === 'function') {
                entry.game.destroy();
            }
            if (entry.p5inst && typeof entry.p5inst.remove === 'function') {
                entry.p5inst.remove();
            }
            this.mountedInstances.delete(containerId);
        }

        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '';
        }
    }

    mount(GameClass, containerId, mode = 'active', onComplete = null, ruleOverrides = {}) {
        this.unmount(containerId);

        if (mode !== 'demo') {
            this.uiManager.hideMessage();
            if (this.activeGame && typeof this.activeGame.destroy === 'function') {
                this.activeGame.destroy();
                this.activeGame = null;
            }
            if (this.activeP5 && typeof this.activeP5.remove === 'function') {
                this.activeP5.remove();
                this.activeP5 = null;
            }
        }

        if (!GameClass) return null;

        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '';
        }

        let sessionPlayerManager;
        let sessionUI;

        if (mode === 'demo') {
            sessionUI = this.mockUI; 
            sessionPlayerManager = {
                getActivePlayers: () => [
                    { id: 0, name: 'NPC 1', color: '#FF6B6B', variant: 'default', accessory: 'Cat Ears' },
                    { id: 1, name: 'NPC 2', color: '#4D96FF', variant: 'feminine', accessory: 'Bow' },
                    { id: 2, name: 'NPC 3', color: '#6BCB77', variant: 'default', accessory: 'Headphones' }
                ],
                getPlayer: () => null
            };
        } else {
            sessionUI = this.uiManager; 
            sessionPlayerManager = this.realPlayerManager;
        }

        let mountedGame = null;

        const sketch = (p) => {
            const gameContext = { 
                ...this.context, 
                players: sessionPlayerManager,
                ui: sessionUI,
                p5: p 
            };
            
            const fullRules = { mode: mode, ...ruleOverrides };
            
            const game = new GameClass(gameContext, fullRules);
            game.onGameComplete = onComplete;
            mountedGame = game;

            this.inputManager.setGameListener((playerId, action, payload) => {
                if (mode !== 'demo' && game && game.handleInput) {
                    game.handleInput(playerId, action, payload);
                }
            });

            p.setup = () => {
                p.pixelDensity(1);
                game.setup();
                if (mode === 'demo') p.frameRate(30); 
            };

            p.draw = () => { 
                game.draw(); 
            };
            
            p.windowResized = () => {
                if (container) {
                    p.resizeCanvas(container.offsetWidth, container.offsetHeight);
                    game.calculateLayout();
                }
            };

            if (mode !== 'demo') {
                this.activeGame = game;
            }
        };

        const p5Instance = new p5(sketch, containerId);
        
        if (mode === 'active' || mode === 'tournament') {
            this.activeP5 = p5Instance;
        }

        this.mountedInstances.set(containerId, { p5inst: p5Instance, game: mountedGame });

        return p5Instance; 
    }
}