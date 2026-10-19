/* src/core/TournamentManager.js */

import { GAME_LIST } from '../GameRegistry.js';

export default class TournamentManager {
    constructor(gameRunner, uiManager, playerManager, onExitCallback) {
        this.runner = gameRunner;
        this.ui = uiManager;
        this.players = playerManager;
        this.onExitCallback = onExitCallback;

        this.isActive = false;
        this.roundsTotal = 0;
        this.currentRoundIdx = 0;
        this.gameQueue = [];
        this.standings = [];
    }

    startTournament(numberOfGames) {
        this.isActive = true;
        this.roundsTotal = numberOfGames;
        this.currentRoundIdx = 0;

        this.standings = this.players.getActivePlayers().map(p => ({
            id: p.id,
            points: 0
        }));

        this.draftGames(numberOfGames);
        this.showTournamentStartScreen();
    }

    draftGames(count) {
        let pool = [...GAME_LIST];
        this.gameQueue = [];
        for (let i = 0; i < count; i++) {
            if (pool.length === 0) pool = [...GAME_LIST];
            const idx = Math.floor(Math.random() * pool.length);
            this.gameQueue.push(pool[idx]);
            pool.splice(idx, 1);
        }
    }

    showTournamentStartScreen() {
        const nextGame = this.gameQueue[this.currentRoundIdx];
        const title = `Tournament Starting!`;
        const subtitle = `Game 1 of ${this.roundsTotal} — Next Up: ${nextGame.title}`;

        this.runner.audioManager.setTrack('lobby');

        const displayData = this.standings.map(s => ({
            id: s.id,
            oldPoints: s.points,
            newPoints: s.points
        }));

        // Display single initial preview with a 5-second auto-advance timer
        this.ui.showTournamentStandings(displayData, this.players.getActivePlayers(), title, subtitle, () => {
            this.runner.audioManager.setTrack('game');
            this.launchGame(nextGame);
        }, this.roundsTotal * 3, 5);
    }

    launchGame(gameConfig) {
        const defaultRules = {
            winValue: 3, 
            livesPerRound: 1
        };

        const rules = {
            ...defaultRules,
            ...(gameConfig.tournamentRules || {})
        };

        window.dispatchEvent(new CustomEvent('game-selected', { detail: gameConfig }));

        const tutorialsEnabled = localStorage.getItem('opentap_tutorials') !== 'false';
        const controllerType = gameConfig.controllerType || 'CONTROLLER';

        this.ui.showTransition(() => {
            // Direct launch if tutorials are toggled off
            if (!tutorialsEnabled) {
                this.runner.mount(
                    gameConfig.class,
                    'game-canvas-container',
                    'tournament',
                    (results) => this.handleGameComplete(results),
                    rules
                );
                if (this.runner.inputManager && this.runner.inputManager.networkManager) {
                    this.runner.inputManager.networkManager.broadcastState(controllerType, 'PLAYING');
                }
                this.ui.hideTransition();
                return;
            }

            const activePlayersList = this.players.getActivePlayers();

            // Broadcast TUTORIAL state so phone controllers switch to the ready-up view
            if (this.runner.inputManager && this.runner.inputManager.networkManager) {
                this.runner.inputManager.networkManager.broadcastState(controllerType, 'TUTORIAL');
            }

            // Show interactive ready-up tutorial overlay
            this.ui.showTutorial(
                gameConfig,
                activePlayersList,
                () => {
                    // All players ready: launch active tournament round
                    this.ui.showTransition(() => {
                        this.runner.unmount('tutorial-canvas-target');
                        this.runner.mount(
                            gameConfig.class,
                            'game-canvas-container',
                            'tournament',
                            (results) => this.handleGameComplete(results),
                            rules
                        );
                        if (this.runner.inputManager && this.runner.inputManager.networkManager) {
                            this.runner.inputManager.networkManager.broadcastState(controllerType, 'PLAYING');
                        }
                        this.ui.hideTransition();
                    });
                },
                () => {
                    // Early exit from tutorial: return to hub
                    window.dispatchEvent(new CustomEvent('game-exit'));
                }
            );

            // Mount the live demo AI preview into the tutorial card
            this.runner.mount(gameConfig.class, 'tutorial-canvas-target', 'demo');

            // Attach input listener so keyboard and phone button taps advance tutorial readiness
            this.runner.inputManager.setGameListener((playerId, action) => {
                if (this.ui.isTutorialActive) {
                    if (action === "PRESS") {
                        this.runner.audioManager.play("click");
                        this.ui.playerReady(playerId);
                    }
                    return;
                }
                if (this.runner.activeGame) {
                    this.runner.activeGame.handleInput(playerId, action);
                }
            });

            this.ui.hideTransition();
        });
    }

    handleGameComplete(gameResults) {
        const sorted = [...gameResults].sort((a, b) => b.score - a.score);
        
        const pointsAdded = {};
        sorted.forEach((p, index) => {
            let pts = 0;
            if (index === 0) pts = 3;
            else if (index === 1) pts = 2;
            else if (index === 2) pts = 1;
            pointsAdded[p.id] = pts;
        });

        const displayData = this.standings.map(s => {
            const added = pointsAdded[s.id] || 0;
            const old = s.points;
            s.points += added; 
            return {
                id: s.id,
                oldPoints: old,
                newPoints: s.points
            };
        });

        this.currentRoundIdx++;
        const isTournamentOver = this.currentRoundIdx >= this.roundsTotal;

        if (isTournamentOver) {
            // Tournament is over: display final standings with automatic transition to podium
            const title = "Tournament Complete!";
            const subtitle = "Final Standings";
            this.runner.audioManager.setTrack('lobby');

            this.ui.showTournamentStandings(displayData, this.players.getActivePlayers(), title, subtitle, () => {
                this.endTournament();
            }, this.roundsTotal * 3, 5);
        } else {
            // Single between-round screen: displays results, previews next game, and auto-advances
            const nextGame = this.gameQueue[this.currentRoundIdx];
            const title = `Round ${this.currentRoundIdx} Complete`;
            const subtitle = `Game ${this.currentRoundIdx + 1} of ${this.roundsTotal} — Next Up: ${nextGame.title}`;

            this.runner.audioManager.setTrack('lobby');

            this.ui.showTournamentStandings(displayData, this.players.getActivePlayers(), title, subtitle, () => {
                this.runner.audioManager.setTrack('game');
                this.launchGame(nextGame);
            }, this.roundsTotal * 3, 5);
        }
    }

    endTournament() {
        this.isActive = false;
        const finalResults = this.players.getActivePlayers().map(p => {
            const s = this.standings.find(stat => stat.id === p.id);
            return { ...p, score: s.points };
        });

        this.runner.audioManager.setTrack('victory');

        this.ui.showPodium(finalResults, "Back to Hub", () => {
            if (this.onExitCallback) {
                this.onExitCallback();
            }
        });
    }
}