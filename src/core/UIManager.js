/* src/core/UIManager.js */

import AvatarSystem from './AvatarSystem.js';

export default class UIManager {
    constructor() {
        this.scoreboard = document.getElementById('ui-scoreboard');
        this.centerMessage = document.getElementById('ui-center-message');
        this.modalP5Instances = [];

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
                .heart-container { display: flex; align-items: center; margin-left: 8px; gap: 4px; }
                .heart-icon { display: inline-block; width: 10px; height: 10px; transform: rotate(45deg); position: relative; }
                .heart-icon:before, .heart-icon:after { content: ""; width: 10px; height: 10px; border-radius: 50%; position: absolute; }
                .heart-icon:before { top: -5px; left: 0; }
                .heart-icon:after { top: 0; left: -5px; }
                .heart-count { font-weight: 800; font-size: 1.1rem; margin-right: 2px; color: #2D2522; }
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

    _cleanupModalP5() {
        if (this.modalP5Instances && this.modalP5Instances.length > 0) {
            this.modalP5Instances.forEach(inst => {
                if (inst && typeof inst.remove === 'function') {
                    inst.remove();
                }
            });
            this.modalP5Instances = [];
        }
    }

    fireConfetti() {
        this.confettiCanvas.width = window.innerWidth;
        this.confettiCanvas.height = window.innerHeight;
        for (let i = 0; i < 150; i++) {
            this.confettiParticles.push({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
                vx: (Math.random() - 0.5) * 20,
                vy: (Math.random() - 0.5) * 20 - 5,
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
        this.transitionCurtain.classList.add('active');
        setTimeout(() => {
            if (callback) callback();
        }, 500);
    }

    hideTransition() {
        this.transitionCurtain.classList.remove('active');
    }

    showTutorial(gameConfig, duration = 4500, onComplete) {
        let isDone = false;
        let timerId = null;

        const completeTutorial = () => {
            if (isDone) return;
            isDone = true;
            if (timerId) clearTimeout(timerId);
            window.removeEventListener('keydown', keySkipHandler);
            this.tutorialOverlay.classList.remove('visible');
            if (onComplete) onComplete();
        };

        const keySkipHandler = (e) => {
            if (['Space', 'Enter', 'Escape', ' '].includes(e.key)) {
                completeTutorial();
            }
        };

        this.tutorialOverlay.innerHTML = `
            <div class="tutorial-badge">LIVE DEMO</div>
            <div class="tutorial-title">${gameConfig.title}</div>
            <div class="tutorial-text">${gameConfig.tutorial || "Good luck!"}</div>
            <div class="tutorial-progress"><div class="tutorial-bar"></div></div>
            <button id="tutorial-skip-btn" class="tutorial-skip-btn">Skip Tutorial</button>
        `;
        
        this.tutorialOverlay.classList.add('visible');

        const skipBtn = document.getElementById('tutorial-skip-btn');
        if (skipBtn) {
            skipBtn.onclick = (e) => {
                e.stopPropagation();
                completeTutorial();
            };
        }

        window.addEventListener('keydown', keySkipHandler);

        setTimeout(() => {
            const bar = this.tutorialOverlay.querySelector('.tutorial-bar');
            if (bar) {
                bar.style.transition = `width ${duration}ms linear`;
                bar.style.width = '100%';
            }
        }, 50);

        timerId = setTimeout(() => {
            completeTutorial();
        }, duration);
    }

    updateScoreboard(players) {
        if (!this.scoreboard) return;
        this.scoreboard.innerHTML = '';

        players.forEach(p => {
            const badge = document.createElement('div');
            badge.className = 'player-badge';
            badge.style.borderBottom = `3px solid ${p.color}`;
            if (p.isEliminated) badge.style.opacity = '0.5';

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
                <h1>${title}</h1><p>${subtitle}</p>
                ${buttonText ? `<button id="msg-btn" class="primary-btn">${buttonText}</button>` : ''}
            </div>
        `;
        this.centerMessage.classList.add('visible');
        if (buttonText && onButtonClick) this._bindButton('msg-btn', onButtonClick);
    }

    showPodium(players, buttonText, onButtonClick) {
        if (!this.centerMessage) return;
        this._cleanupModalP5();
        this.fireConfetti();

        const sorted = [...players].sort((a, b) => b.score - a.score);
        const maxScore = sorted[0].score;
        const minScore = sorted[sorted.length - 1].score;
        const totalPlayers = sorted.length;

        let podiumHTML = '<div class="podium-container">';
        sorted.forEach((p, index) => {
            const heightPerc = maxScore > 0 ? Math.max(20, (p.score / maxScore) * 100) : 20;
            const isWinner = p.score === maxScore && maxScore > 0;
            const barClass = isWinner ? 'podium-bar winner' : 'podium-bar';
            const canvasId = `podium-av-${index}`;

            podiumHTML += `<div class="podium-column"><div class="podium-canvas-wrapper" id="${canvasId}"></div><div class="${barClass}" style="height: ${heightPerc}px;"><span class="podium-rank">${p.score}</span></div><div class="podium-name">${p.name}</div></div>`;
        });
        podiumHTML += '</div>';

        this.centerMessage.innerHTML = `
            <div class="message-card">
                <h1>Match Complete!</h1>
                ${podiumHTML}
                <div style="display:flex; flex-direction:column; gap:10px; align-items:center;">
                    <button id="podium-btn" class="primary-btn">${buttonText}</button>
                    <button id="podium-exit-btn" class="secondary-btn" style="background:rgba(33,27,24,0.08); color:#2D2522; border-color:#D8D1C7; margin:0;">Back to Hub</button>
                </div>
            </div>
        `;

        this.centerMessage.classList.add('visible');
        this._bindButton('podium-btn', onButtonClick);
        
        const exitBtn = document.getElementById('podium-exit-btn');
        if(exitBtn) {
            exitBtn.addEventListener('click', () => {
                this.hideMessage();
                window.dispatchEvent(new CustomEvent('game-exit'));
            });
        }

        setTimeout(() => {
            sorted.forEach((p, index) => {
                const canvasId = `podium-av-${index}`;
                const isWinner = p.score === maxScore && maxScore > 0;
                const isLast = (p.score === minScore) && !isWinner;
                let anim = 'IDLE'; let exp = 'idle';
                if (isWinner) { anim = 'WIN'; exp = 'happy'; }
                else if (index === 1 && !isLast) { anim = 'IDLE'; exp = 'happy'; }
                else if (isLast) { if (totalPlayers >= 4) { anim = 'DIZZY'; exp = 'stunned'; } else { anim = 'IDLE'; exp = 'sad'; } }
                else { anim = 'IDLE'; exp = 'sad'; }
                if (maxScore === 0) { anim = 'IDLE'; exp = 'idle'; }

                const inst = new p5((sketch) => {
                    const avatars = new AvatarSystem(sketch);
                    sketch.setup = () => { sketch.createCanvas(120, 140); sketch.loop(); };
                    sketch.draw = () => {
                        sketch.clear(); sketch.push(); sketch.translate(60, 90);
                        avatars.applyTransform(anim);
                        avatars.draw({ x: 0, y: 0, size: 70, color: p.color, variant: p.variant, accessory: p.accessory, expression: exp });
                        sketch.pop();
                    };
                }, canvasId);
                this.modalP5Instances.push(inst);
            });
        }, 50);
    }

    showTournamentStandings(stats, players, title, subtitle, onNext, maxScoreOverride = null) {
        if (!this.centerMessage) return;
        this._cleanupModalP5();

        const sortedStats = [...stats].sort((a, b) => b.newPoints - a.newPoints);
        const maxPoints = maxScoreOverride || Math.max(1, sortedStats[0].newPoints);

        let rowsHTML = '<div class="standings-table">';
        sortedStats.forEach((stat, idx) => {
            const p = players.find(pl => pl.id === stat.id);
            const isLeader = idx === 0;
            const canvasId = `stand-av-${idx}`;
            
            const startPercent = (stat.oldPoints / maxPoints) * 100;

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

        this.centerMessage.innerHTML = `
            <div class="message-card" style="min-width: 500px;">
                <h1>${title}</h1>
                <p>${subtitle}</p>
                ${rowsHTML}
                <button id="tourney-next-btn" class="primary-btn">Start Next Game</button>
            </div>
        `;

        this.centerMessage.classList.add('visible');
        this._bindButton('tourney-next-btn', onNext);

        setTimeout(() => {
            sortedStats.forEach((stat, idx) => {
                const bar = document.getElementById(`bar-${idx}`);
                const endPercent = (stat.newPoints / maxPoints) * 100;
                if(bar) bar.style.width = `${endPercent}%`;

                const p = players.find(pl => pl.id === stat.id);
                const canvasId = `stand-av-${idx}`;
                const inst = new p5((sketch) => {
                    const avatars = new AvatarSystem(sketch);
                    sketch.setup = () => { sketch.createCanvas(60, 60); sketch.loop(); };
                    sketch.draw = () => {
                        sketch.clear(); sketch.push(); sketch.translate(30, 30);
                        avatars.draw({ x: 0, y: 0, size: 50, color: p.color, variant: p.variant, accessory: p.accessory, expression: idx === 0 ? 'happy' : 'idle' });
                        sketch.pop();
                    };
                }, canvasId);
                this.modalP5Instances.push(inst);
            });
        }, 100);
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
        if (btn) {
            btn.addEventListener('click', () => {
                this.hideMessage();
                callback();
            });
        }
        if (this._boundKeyHandler) window.removeEventListener('keydown', this._boundKeyHandler);
        this._boundKeyHandler = (e) => {
            if (e.key === 'Enter') {
                this.hideMessage();
                window.removeEventListener('keydown', this._boundKeyHandler);
                this._boundKeyHandler = null;
                callback();
            }
        };
        window.addEventListener('keydown', this._boundKeyHandler);
    }
}