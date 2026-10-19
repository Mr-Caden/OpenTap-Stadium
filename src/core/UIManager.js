/* src/core/UIManager.js */

import AvatarSystem from './AvatarSystem.js';

export default class UIManager {
    constructor() {
        this.scoreboard = document.getElementById('ui-scoreboard');
        this.centerMessage = document.getElementById('ui-center-message');
        this.topBar = document.getElementById('ui-top-bar');
        this.modalP5Instances = [];

        this.isTutorialActive = false;
        this.readyPlayers = new Set();
        this.tutorialOnComplete = null;
        this.tutorialOnCancel = null;
        this.tutorialActivePlayers = [];
        this.tutorialAvatarSketches = new Map();

        this._autoAdvanceTimer = null;
        this._modalInputHandler = null;

        this._ensureElement('transition-curtain');
        this._ensureElement('tutorial-overlay');
        
        if (!document.getElementById('confetti-canvas')) {
            const cvs = document.createElement('canvas');
            cvs.id = 'confetti-canvas';
            document.body.appendChild(cvs);
        }

        this.transitionCurtain = document.getElementById('transition-curtain');
        this.tutorialOverlay = document.getElementById('tutorial-overlay');
        this.confettiCanvas = document.getElementById('confetti-canvas');
        this.confettiCtx = this.confettiCanvas.getContext('2d');
        this.confettiParticles = [];

        if (!document.getElementById('heart-style')) {
            const style = document.createElement('style');
            style.id = 'heart-style';
            style.innerHTML = `
                .heart-container { display: flex; align-items: center; margin-left: 6px; gap: 3px; }
                .heart-icon { display: inline-block; width: 9px; height: 9px; transform: rotate(45deg); position: relative; }
                .heart-icon:before, .heart-icon:after { content: ""; width: 9px; height: 9px; border-radius: 50%; position: absolute; }
                .heart-icon:before { top: -4.5px; left: 0; }
                .heart-icon:after { top: 0; left: -4.5px; }
                .heart-count { font-weight: 800; font-size: 1rem; margin-right: 2px; color: #2D2522; }
            `;
            document.head.appendChild(style);
        }

        this._animateConfetti = this._animateConfetti.bind(this);
        requestAnimationFrame(this._animateConfetti);
    }

    _ensureElement(id) {
        if (!document.getElementById(id)) {
            const el = document.createElement('div');
            el.id = id;
            document.body.appendChild(el);
        }
    }

    clearConfetti() {
        this.confettiParticles = [];
        if (this.confettiCtx && this.confettiCanvas) {
            this.confettiCtx.clearRect(0, 0, this.confettiCanvas.width, this.confettiCanvas.height);
        }
    }

    _cleanupModalP5() {
        this.clearConfetti();

        if (this._autoAdvanceTimer) {
            clearInterval(this._autoAdvanceTimer);
            this._autoAdvanceTimer = null;
        }

        if (this._modalInputHandler) {
            window.removeEventListener('player-input', this._modalInputHandler);
            this._modalInputHandler = null;
        }

        if (this.modalP5Instances && this.modalP5Instances.length > 0) {
            this.modalP5Instances.forEach(inst => {
                if (inst && typeof inst.remove === 'function') {
                    inst.remove();
                }
            });
            this.modalP5Instances = [];
        }
        this.tutorialAvatarSketches.clear();
    }

    fireConfetti() {
        this.confettiCanvas.width = window.innerWidth;
        this.confettiCanvas.height = window.innerHeight;
        for (let i = 0; i < 160; i++) {
            this.confettiParticles.push({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
                vx: (Math.random() - 0.5) * 22,
                vy: (Math.random() - 0.5) * 22 - 6,
                color: `hsl(${Math.random() * 360}, 100%, 50%)`,
                size: Math.random() * 10 + 5,
                rotation: Math.random() * 360,
                rspeed: (Math.random() - 0.5) * 10,
                life: 1.0
            });
        }
    }

    _animateConfetti() {
        const ctx = this.confettiCtx;
        if (this.confettiParticles.length > 0) {
            ctx.clearRect(0, 0, this.confettiCanvas.width, this.confettiCanvas.height);
            for (let i = this.confettiParticles.length - 1; i >= 0; i--) {
                let p = this.confettiParticles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.2;
                p.vx *= 0.99;
                p.rotation += p.rspeed;
                p.life -= 0.005;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.life;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();

                if (p.life <= 0 || p.y > window.innerHeight) {
                    this.confettiParticles.splice(i, 1);
                }
            }
        }
        requestAnimationFrame(this._animateConfetti);
    }

    showTransition(callback) {
        this.clearConfetti();
        this.transitionCurtain.classList.add('active');
        setTimeout(() => {
            if (callback) callback();
        }, 400);
    }

    hideTransition() {
        this.transitionCurtain.classList.remove('active');
    }

    showTutorial(gameConfig, playersList = [], onComplete = null, onCancel = null) {
        this.isTutorialActive = true;
        this.readyPlayers.clear();
        this.tutorialOnComplete = onComplete;
        this.tutorialOnCancel = onCancel;
        this.tutorialActivePlayers = playersList;
        this._cleanupModalP5();

        if (this.topBar) {
            this.topBar.style.display = 'none';
        }

        const isTouchpad = gameConfig.controllerType === 'TOUCHPAD';
        const isCompact = playersList.length > 4;

        const rosterHTML = playersList.map(p => `
            <div class="tutorial-player-chip" id="t-pchip-${p.id}">
                <div class="t-pchip-avatar-box" id="t-pavatar-${p.id}"></div>
                <div class="t-pchip-info">
                    <span class="t-pchip-name">${p.name}</span>
                    <span class="t-pchip-key">${p.type === 'mobile' ? 'Phone' : (p.label || 'Key')}</span>
                </div>
                <span class="t-pchip-status" id="t-pstatus-${p.id}">Waiting</span>
            </div>
        `).join('');

        this.tutorialOverlay.innerHTML = `
            <div class="tutorial-card">
                <div class="tutorial-left-container">
                    <div id="tutorial-canvas-target"></div>
                    <div class="tutorial-inset-controller">
                        <div class="tutorial-phone-mock">
                            ${isTouchpad ? `
                                <div class="tutorial-phone-touchpad">
                                    <div class="tutorial-touch-dot"></div>
                                    <div class="tutorial-touch-dot active">▲</div>
                                    <div class="tutorial-touch-dot"></div>
                                    <div class="tutorial-touch-dot active">◀</div>
                                    <div class="tutorial-touch-dot"></div>
                                    <div class="tutorial-touch-dot active">▶</div>
                                    <div class="tutorial-touch-dot"></div>
                                    <div class="tutorial-touch-dot active">▼</div>
                                    <div class="tutorial-touch-dot"></div>
                                </div>
                            ` : `
                                <div class="tutorial-phone-btn">
                                    <span>TAP!</span>
                                </div>
                            `}
                        </div>
                        <div class="tutorial-inset-label">
                            ${isTouchpad ? 'Touchpad Action' : 'One-Button Action'}
                        </div>
                    </div>
                </div>

                <div class="tutorial-right-container">
                    <div class="tutorial-content-top">
                        <div class="tutorial-badge">LIVE DEMO</div>
                        <div class="tutorial-title">${gameConfig.title}</div>
                        <div class="tutorial-text">${gameConfig.tutorial || "Good luck!"}</div>
                    </div>

                    <div class="tutorial-ready-section">
                        <div class="tutorial-ready-hint" id="t-ready-hint">Ready Up (0/${playersList.length} Players Ready)</div>
                        <div class="tutorial-ready-roster ${isCompact ? 'roster-compact' : ''}">
                            ${rosterHTML}
                        </div>
                    </div>

                    <div class="tutorial-actions">
                        <button id="tutorial-start-btn" class="primary-btn tutorial-start-btn" disabled>Waiting for Players...</button>
                        <button id="tutorial-exit-btn" class="small-btn tutorial-exit-btn">Exit to Hub</button>
                    </div>
                </div>
            </div>
        `;
        
        this.tutorialOverlay.classList.add('visible');

        setTimeout(() => {
            playersList.forEach(p => {
                const targetId = `t-pavatar-${p.id}`;
                const targetEl = document.getElementById(targetId);
                if (!targetEl) return;

                let currentExpression = 'idle';

                const pSketch = (sketch) => {
                    const avatars = new AvatarSystem(sketch);
                    sketch.setup = () => {
                        sketch.createCanvas(72, 72);
                        sketch.noLoop();
                    };
                    sketch.draw = () => {
                        sketch.clear();
                        sketch.push();
                        sketch.translate(36, 36);
                        avatars.draw({
                            x: 0,
                            y: 0,
                            size: 44,
                            color: p.color,
                            variant: p.variant,
                            accessory: p.accessory,
                            expression: currentExpression
                        });
                        sketch.pop();
                    };
                };

                const p5Inst = new p5(pSketch, targetId);
                this.modalP5Instances.push(p5Inst);
                this.tutorialAvatarSketches.set(p.id, {
                    inst: p5Inst,
                    setHappy: () => {
                        currentExpression = 'happy';
                        p5Inst.redraw();
                    }
                });
            });
        }, 20);

        const startBtn = document.getElementById('tutorial-start-btn');
        if (startBtn) {
            startBtn.onclick = (e) => {
                e.stopPropagation();
                if (this.readyPlayers.size >= this.tutorialActivePlayers.length) {
                    this.completeTutorial();
                }
            };
        }

        const exitBtn = document.getElementById('tutorial-exit-btn');
        if (exitBtn) {
            exitBtn.onclick = (e) => {
                e.stopPropagation();
                this.cancelTutorial();
            };
        }

        this._tutorialKeyHandler = (e) => {
            if (e.key === 'Escape') {
                this.cancelTutorial();
            }
        };
        window.addEventListener('keydown', this._tutorialKeyHandler);
    }

    playerReady(playerId) {
        if (!this.isTutorialActive) return;

        this.readyPlayers.add(playerId);

        const chip = document.getElementById(`t-pchip-${playerId}`);
        const status = document.getElementById(`t-pstatus-${playerId}`);
        if (chip) chip.classList.add('ready');
        if (status) status.innerText = 'Ready!';

        if (this.tutorialAvatarSketches.has(playerId)) {
            this.tutorialAvatarSketches.get(playerId).setHappy();
        }

        const totalRequired = this.tutorialActivePlayers.length;
        const hintEl = document.getElementById('t-ready-hint');
        if (hintEl) {
            hintEl.innerText = `Ready Up (${this.readyPlayers.size}/${totalRequired} Players Ready)`;
        }

        const startBtn = document.getElementById('tutorial-start-btn');
        if (totalRequired > 0 && this.readyPlayers.size >= totalRequired) {
            if (startBtn) {
                startBtn.disabled = false;
                startBtn.innerText = 'Start Match';
            }
            setTimeout(() => {
                this.completeTutorial();
            }, 350);
        }
    }

    completeTutorial() {
        if (!this.isTutorialActive) return;
        this.isTutorialActive = false;

        if (this._tutorialKeyHandler) {
            window.removeEventListener('keydown', this._tutorialKeyHandler);
            this._tutorialKeyHandler = null;
        }

        if (this.topBar) {
            this.topBar.style.display = 'flex';
        }

        this.tutorialOverlay.classList.remove('visible');

        if (this.tutorialOnComplete) {
            const cb = this.tutorialOnComplete;
            this.tutorialOnComplete = null;
            this.tutorialOnCancel = null;
            cb();
        }
    }

    cancelTutorial() {
        if (!this.isTutorialActive) return;
        this.isTutorialActive = false;

        if (this._tutorialKeyHandler) {
            window.removeEventListener('keydown', this._tutorialKeyHandler);
            this._tutorialKeyHandler = null;
        }

        if (this.topBar) {
            this.topBar.style.display = 'flex';
        }

        this.tutorialOverlay.classList.remove('visible');

        if (this.tutorialOnCancel) {
            const cancelCb = this.tutorialOnCancel;
            this.tutorialOnComplete = null;
            this.tutorialOnCancel = null;
            cancelCb();
        }
    }

    updateScoreboard(players) {
        if (!this.scoreboard || !players) return;
        this.scoreboard.innerHTML = '';

        const isCrowded = players.length > 5;

        players.forEach(p => {
            const badge = document.createElement('div');
            badge.className = `player-badge ${isCrowded ? 'compact' : ''}`;
            badge.style.borderBottom = `3px solid ${p.color}`;
            if (p.isEliminated) badge.style.opacity = '0.45';

            let statusHTML = '';
            if (p.statusType === 'hearts') {
                const lives = parseInt(p.customStatus) || 0;
                if (lives > 0 && lives <= 3) {
                    statusHTML = `<div class="heart-container">`;
                    for (let i = 0; i < lives; i++) statusHTML += `<div class="heart-icon" style="background:${p.color}"><style>.heart-icon[style*="${p.color}"]:before, .heart-icon[style*="${p.color}"]:after { background: ${p.color}; }</style></div>`;
                    statusHTML += `</div>`;
                } else {
                    statusHTML = `<div class="heart-container"><span class="heart-count">${lives}</span><div class="heart-icon" style="background:${p.color}"><style>.heart-icon[style*="${p.color}"]:before, .heart-icon[style*="${p.color}"]:after { background: ${p.color}; }</style></div></div>`;
                }
            } else {
                statusHTML = `<span class="p-score">${p.customStatus !== undefined ? p.customStatus : (p.score || 0)}</span>`;
            }

            badge.innerHTML = `<span class="p-dot" style="background:${p.color}"></span><span class="p-name">${p.name}</span>${statusHTML}`;
            this.scoreboard.appendChild(badge);
        });
    }

    showMessage(title, subtitle, buttonText = null, onButtonClick = null) {
        if (!this.centerMessage) return;
        this._cleanupModalP5();

        this.centerMessage.innerHTML = `
            <div class="message-card">
                <h1>${title}</h1>
                <div class="message-content">${subtitle}</div>
                ${buttonText ? `<button id="msg-btn" class="primary-btn" style="margin-top:16px;">${buttonText}</button>` : ''}
            </div>
        `;
        this.centerMessage.classList.add('visible');
        if (buttonText && onButtonClick) this._bindButton('msg-btn', onButtonClick);
    }

    /**
     * Upgraded round winner celebration screen featuring the winning player's animated avatar,
     * vibrant player color styling, and an automatic countdown (strictly without full-match confetti shower).
     */
    showRoundWinner(winner, subtitle, onNext, autoAdvanceSeconds = 4) {
        if (!this.centerMessage) return;
        this._cleanupModalP5();

        const hasWinner = winner !== null && winner !== undefined;
        const winnerColor = hasWinner ? winner.color : "#FF5A36";
        const winnerName = hasWinner ? winner.name : "Draw";
        const titleText = hasWinner ? `${winnerName} Wins the Round!` : "Round Draw!";
        const descText = subtitle || "Get ready for the next round!";
        let secondsRemaining = autoAdvanceSeconds;

        this.centerMessage.innerHTML = `
            <div class="message-card round-winner-card" style="border-top: 6px solid ${winnerColor};">
                <div class="round-winner-badge" style="background: ${winnerColor};">ROUND WINNER</div>
                <div class="round-winner-avatar-box" id="round-winner-av"></div>
                <h1 class="round-winner-title">${titleText}</h1>
                <div class="message-content round-winner-subtitle">${descText}</div>
                <button id="round-next-btn" class="primary-btn round-next-btn" style="background: ${winnerColor};">
                    Next Round (<span id="round-timer-val">${secondsRemaining}</span>s)
                </button>
            </div>
        `;

        this.centerMessage.classList.add('visible');

        // Mount animated winning avatar performing the victory jump
        if (hasWinner) {
            setTimeout(() => {
                const target = document.getElementById('round-winner-av');
                if (!target) return;

                const sketch = (p) => {
                    const avatars = new AvatarSystem(p);
                    p.setup = () => {
                        p.createCanvas(120, 130);
                        p.loop();
                    };
                    p.draw = () => {
                        p.clear();
                        p.push();
                        p.translate(60, 92);
                        avatars.applyTransform('WIN');
                        avatars.draw({
                            x: 0,
                            y: 0,
                            size: 64,
                            color: winner.color,
                            variant: winner.variant,
                            accessory: winner.accessory,
                            expression: 'happy'
                        });
                        p.pop();
                    };
                };

                const p5Inst = new p5(sketch, 'round-winner-av');
                this.modalP5Instances.push(p5Inst);
            }, 30);
        }

        const advanceCallback = () => {
            if (this._autoAdvanceTimer) {
                clearInterval(this._autoAdvanceTimer);
                this._autoAdvanceTimer = null;
            }
            this.hideMessage();
            if (onNext) onNext();
        };

        this._bindButton('round-next-btn', advanceCallback);

        // Automatic countdown advances smoothly
        this._autoAdvanceTimer = setInterval(() => {
            secondsRemaining--;
            const timerLabel = document.getElementById('round-timer-val');
            if (timerLabel) {
                timerLabel.innerText = secondsRemaining;
            }

            if (secondsRemaining <= 0) {
                advanceCallback();
            }
        }, 1000);
    }

    showPodium(players, buttonText, onButtonClick) {
        if (!this.centerMessage || !players || players.length === 0) return;
        this._cleanupModalP5();
        this.fireConfetti();

        // Robust score normalization supporting custom status or standard score fields
        const normalized = players.map(p => ({
            ...p,
            finalScore: typeof p.score === 'number' && !isNaN(p.score) 
                ? p.score 
                : (parseInt(p.customStatus) || 0)
        }));

        const sorted = [...normalized].sort((a, b) => b.finalScore - a.finalScore);
        const maxScore = sorted[0]?.finalScore || 0;
        const minScore = sorted[sorted.length - 1]?.finalScore || 0;
        const totalPlayers = sorted.length;

        // Dynamic responsive dimensions supporting up to 10 players
        const isLargeLobby = totalPlayers > 5;
        const canvasW = isLargeLobby ? 80 : 106;
        const canvasH = isLargeLobby ? 148 : 170;
        const avatarSize = isLargeLobby ? 48 : 64;
        
        // Baseline positioned to guarantee full headroom during victory jumps with accessories
        const baselineY = isLargeLobby ? 104 : 122;

        const maxBarPx = isLargeLobby ? 175 : 210;
        const minBarPx = 44;

        let podiumHTML = `<div class="podium-container ${isLargeLobby ? 'large-lobby' : ''}">`;
        
        sorted.forEach((p, index) => {
            // Pixel-based podium height calculation directly proportional to relative score
            let calculatedBarHeight = minBarPx;
            if (maxScore > 0) {
                const ratio = Math.max(0, p.finalScore) / maxScore;
                calculatedBarHeight = Math.round(minBarPx + ratio * (maxBarPx - minBarPx));
            }

            const isWinner = p.finalScore === maxScore && maxScore > 0;
            const rankTier = index === 0 && isWinner ? 'rank-1' : (index === 1 ? 'rank-2' : (index === 2 ? 'rank-3' : 'rank-other'));
            const canvasId = `podium-av-${index}`;

            podiumHTML += `
                <div class="podium-column">
                    <div class="podium-canvas-wrapper" id="${canvasId}" style="width:${canvasW}px; height:${canvasH}px;"></div>
                    <div class="podium-bar ${rankTier}" data-target-height="${calculatedBarHeight}" style="height: 0px;">
                        <span class="podium-rank">#${index + 1}</span>
                        <span class="podium-points">${p.finalScore} PTS</span>
                    </div>
                    <div class="podium-name">${p.name}</div>
                </div>
            `;
        });
        podiumHTML += '</div>';

        this.centerMessage.innerHTML = `
            <div class="message-card podium-card">
                <h1>Match Complete!</h1>
                ${podiumHTML}
                <div style="display:flex; flex-direction:column; gap:10px; align-items:center; margin-top:16px;">
                    <button id="podium-btn" class="primary-btn">${buttonText || "Play Again"}</button>
                    <button id="podium-exit-btn" class="secondary-btn" style="background:rgba(33,27,24,0.08); color:#2D2522; border-color:#D8D1C7; margin:0;">Back to Hub</button>
                </div>
            </div>
        `;

        this.centerMessage.classList.add('visible');
        this._bindButton('podium-btn', onButtonClick);
        
        const exitBtn = document.getElementById('podium-exit-btn');
        if (exitBtn) {
            exitBtn.addEventListener('click', () => {
                this.hideMessage();
                window.dispatchEvent(new CustomEvent('game-exit'));
            });
        }

        // Trigger spring animation for podium bars to rise up into their score-scaled heights
        setTimeout(() => {
            const bars = this.centerMessage.querySelectorAll('.podium-bar');
            bars.forEach(bar => {
                const targetH = bar.getAttribute('data-target-height');
                if (targetH) {
                    bar.style.height = `${targetH}px`;
                }
            });
        }, 50);

        // Mount lightweight non-clipping p5 avatar sketches on top of each podium column
        setTimeout(() => {
            sorted.forEach((p, index) => {
                const canvasId = `podium-av-${index}`;
                const isWinner = p.finalScore === maxScore && maxScore > 0;
                const isLast = (p.finalScore === minScore) && !isWinner;
                
                let anim = 'IDLE'; 
                let exp = 'idle';

                if (isWinner) { 
                    anim = 'WIN'; 
                    exp = 'happy'; 
                } else if (index === 1 && !isLast) { 
                    anim = 'IDLE'; 
                    exp = 'happy'; 
                } else if (isLast) { 
                    if (totalPlayers >= 4) { 
                        anim = 'DIZZY'; 
                        exp = 'stunned'; 
                    } else { 
                        anim = 'IDLE'; 
                        exp = 'sad'; 
                    } 
                } else { 
                    anim = 'IDLE'; 
                    exp = 'sad'; 
                }

                if (maxScore === 0) { 
                    anim = 'IDLE'; 
                    exp = 'idle'; 
                }

                const inst = new p5((sketch) => {
                    const avatars = new AvatarSystem(sketch);
                    sketch.setup = () => { 
                        sketch.createCanvas(canvasW, canvasH); 
                        sketch.loop(); 
                    };
                    sketch.draw = () => {
                        sketch.clear(); 
                        sketch.push(); 
                        sketch.translate(canvasW / 2, baselineY);
                        avatars.applyTransform(anim);
                        avatars.draw({ 
                            x: 0, 
                            y: 0, 
                            size: avatarSize, 
                            color: p.color, 
                            variant: p.variant, 
                            accessory: p.accessory, 
                            expression: exp 
                        });
                        sketch.pop();
                    };
                }, canvasId);
                this.modalP5Instances.push(inst);
            });
        }, 80);
    }

    showTournamentStandings(stats, players, title, subtitle, onNext, maxScoreOverride = null, autoAdvanceSeconds = 5) {
        if (!this.centerMessage || !stats) return;
        this._cleanupModalP5();

        const sortedStats = [...stats].sort((a, b) => b.newPoints - a.newPoints);
        const maxPoints = maxScoreOverride || Math.max(1, sortedStats[0]?.newPoints || 1);

        let rowsHTML = '<div class="standings-table">';
        sortedStats.forEach((stat, idx) => {
            const p = players.find(pl => pl.id === stat.id);
            if (!p) return;
            const isLeader = idx === 0;
            const canvasId = `stand-av-${idx}`;
            const startPercent = Math.min(100, (stat.oldPoints / maxPoints) * 100);

            rowsHTML += `
                <div class="standing-row ${isLeader ? 'leader' : ''}">
                    <span class="st-rank">#${idx + 1}</span>
                    <div class="st-avatar-wrapper" id="${canvasId}"></div>
                    <div class="st-info">
                        <div class="st-name">${p.name}</div>
                        <div class="st-bar-bg">
                            <div class="st-bar-fill" id="bar-${idx}" style="width:${startPercent}%; background:${p.color}"></div>
                        </div>
                    </div>
                    <span class="st-points">${stat.newPoints}</span>
                </div>
            `;
        });
        rowsHTML += '</div>';

        let secondsRemaining = autoAdvanceSeconds;

        this.centerMessage.innerHTML = `
            <div class="message-card standings-card">
                <h1>${title}</h1>
                <div class="message-content">${subtitle}</div>
                ${rowsHTML}
                <button id="tourney-next-btn" class="primary-btn tourney-next-btn" style="margin-top:16px;">
                    Next Game (<span id="tourney-timer-val">${secondsRemaining}</span>s)
                </button>
            </div>
        `;

        this.centerMessage.classList.add('visible');

        const advanceCallback = () => {
            if (this._autoAdvanceTimer) {
                clearInterval(this._autoAdvanceTimer);
                this._autoAdvanceTimer = null;
            }
            if (this._modalInputHandler) {
                window.removeEventListener('player-input', this._modalInputHandler);
                this._modalInputHandler = null;
            }
            this.hideMessage();
            if (onNext) onNext();
        };

        this._bindButton('tourney-next-btn', advanceCallback);

        // Automated countdown timer to advance smoothly without requiring manual clicks
        this._autoAdvanceTimer = setInterval(() => {
            secondsRemaining--;
            const timerLabel = document.getElementById('tourney-timer-val');
            if (timerLabel) {
                timerLabel.innerText = secondsRemaining;
            }

            if (secondsRemaining <= 0) {
                advanceCallback();
            }
        }, 1000);

        setTimeout(() => {
            sortedStats.forEach((stat, idx) => {
                const bar = document.getElementById(`bar-${idx}`);
                const endPercent = Math.min(100, (stat.newPoints / maxPoints) * 100);
                if (bar) bar.style.width = `${endPercent}%`;

                const p = players.find(pl => pl.id === stat.id);
                if (!p) return;
                const canvasId = `stand-av-${idx}`;

                const inst = new p5((sketch) => {
                    const avatars = new AvatarSystem(sketch);
                    sketch.setup = () => { 
                        sketch.createCanvas(56, 56); 
                        sketch.loop(); 
                    };
                    sketch.draw = () => {
                        sketch.clear(); 
                        sketch.push(); 
                        sketch.translate(28, 30);
                        avatars.draw({ 
                            x: 0, 
                            y: 0, 
                            size: 44, 
                            color: p.color, 
                            variant: p.variant, 
                            accessory: p.accessory, 
                            expression: idx === 0 ? 'happy' : 'idle' 
                        });
                        sketch.pop();
                    };
                }, canvasId);
                this.modalP5Instances.push(inst);
            });
        }, 80);
    }

    showTurnMessage(text, color) {
        let toast = document.getElementById('ui-turn-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'ui-turn-toast';
            document.body.appendChild(toast);
        }
        toast.style.background = color;
        toast.innerHTML = text;
        toast.className = 'visible';
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => { toast.className = ''; }, 2000);
    }

    hideMessage() {
        this._cleanupModalP5();
        if (!this.centerMessage) return;
        this.centerMessage.classList.remove('visible');
        this.centerMessage.innerHTML = '';
        if (this._boundKeyHandler) {
            window.removeEventListener('keydown', this._boundKeyHandler);
            this._boundKeyHandler = null;
        }
    }

    _bindButton(id, callback) {
        const btn = document.getElementById(id);
        if (!btn) return;

        // Clean up any existing player input listener
        if (this._modalInputHandler) {
            window.removeEventListener('player-input', this._modalInputHandler);
            this._modalInputHandler = null;
        }

        const triggerAdvance = () => {
            if (this._modalInputHandler) {
                window.removeEventListener('player-input', this._modalInputHandler);
                this._modalInputHandler = null;
            }
            this.hideMessage();
            callback();
        };

        // Direct mouse click on button
        btn.addEventListener('click', triggerAdvance, { once: true });

        // Accept input from ANY player (local keyboard key or remote phone button PRESS)
        this._modalInputHandler = (e) => {
            if (e.detail && e.detail.type === 'PRESS') {
                triggerAdvance();
            }
        };
        window.addEventListener('player-input', this._modalInputHandler);
    }
}