/* src/main.js */

import PlayerManager from './core/PlayerManager.js';
import InputManager from './core/InputManager.js';
import UIManager from './core/UIManager.js';
import GameRunner from './core/GameRunner.js';
import AudioManager from './core/AudioManager.js';
import AvatarSystem from './core/AvatarSystem.js';
import TournamentManager from './core/TournamentManager.js';
import NetworkManager from './core/NetworkManager.js';
import { GAME_LIST } from './GameRegistry.js';

const players = new PlayerManager();
const inputs = new InputManager(players);
const ui = new UIManager();
const audio = new AudioManager();
const runner = new GameRunner(players, inputs, ui, audio);
const tournament = new TournamentManager(runner, ui, players);
const network = new NetworkManager(players, inputs);

inputs.setNetworkManager(network);

let currentMode = 'hub';
let currentGameState = 'IDLE'; 
let currentScreenType = 'CONTROLLER';
let lobbyInstances = []; 
let demoInstances = [];
let hubObserver = null;

let lastInteractionTime = Date.now();
const IDLE_TIMEOUT = 120000;
let isAttractMode = false;
let attractInterval = null;

const hubGrid = document.getElementById('hub-grid');
const gameStage = document.getElementById('game-stage');
const backBtn = document.getElementById('back-to-hub-btn');
const setupBtn = document.getElementById('settings-btn');
const setupOverlay = document.getElementById('setup-overlay');
const savePlayersBtn = document.getElementById('save-players-btn');
const addPlayerBtn = document.getElementById('add-player-btn');
const playerConfigGrid = document.getElementById('player-config-grid');
const mainHeader = document.getElementById('main-header');
const attractLayer = document.getElementById('attract-layer');
let hostBtnRef = null;

function init() {
    console.log("[OpenTap Stadium] Engine Initialized");

    const startAudio = () => {
        audio.init();
        audio.setTrack('lobby');
        document.removeEventListener('click', startAudio);
        resetIdleTimer();
    };
    document.addEventListener('click', startAudio);

    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('touchstart', resetIdleTimer);
    window.addEventListener('mousedown', resetIdleTimer);
    
    setInterval(checkIdle, 1000);

    if (!document.getElementById('host-game-btn')) {
        const hostBtn = document.createElement('button');
        hostBtn.id = 'host-game-btn';
        hostBtn.className = 'icon-btn';
        hostBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="2"></circle>
                <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path>
            </svg>
            Host Game
        `;
        hostBtn.style.marginRight = '12px';
        hostBtn.onclick = () => {
            audio.play('click');
            hostBtn.innerText = 'Starting...';
            hostBtn.disabled = true;
            network.hostGame();
            
            network.onHostReady = (code) => {
                hostBtnRef.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"></path>
                    </svg>
                    Room: ${code}
                `;
                hostBtnRef.style.background = '#2ecc71';
                hostBtnRef.style.borderColor = '#27ae60';
                hostBtnRef.disabled = false;
                
                hostBtnRef.onclick = () => {
                    audio.play('click');
                    showQrModal(code);
                };
                
                showQrModal(code);
                renderAttractQR(code);
            };
        };
        mainHeader.insertBefore(hostBtn, setupBtn);
        hostBtnRef = hostBtn;
    }

    setupBtn.onclick = () => {
        audio.play('click');
        audio.setTrack('config'); 
        network.broadcastState('LOBBY', 'IDLE');
        renderVisualLobby();
        setupOverlay.classList.remove('hidden');
        pauseDemos();
        resetIdleTimer();
    };

    savePlayersBtn.onclick = () => {
        audio.play('click');
        audio.setTrack('lobby');
        setupOverlay.classList.add('hidden');
        cleanupLobby(); 
        renderHub();    
        resetIdleTimer();
    };

    addPlayerBtn.onclick = () => {
        audio.play('click');
        players.addPlayer('local');
        renderVisualLobby();
        resetIdleTimer();
    };

    backBtn.onclick = returnToHub;

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && currentMode === 'game') returnToHub();
    });

    window.addEventListener('player-update', () => {
        if(network.roomId && hostBtnRef) updateHostButton(network.roomId);
        if (!setupOverlay.classList.contains('hidden')) renderVisualLobby();
        if (isAttractMode) stopAttractMode();
        resetIdleTimer();
    });

    window.addEventListener('game-exit', () => {
        returnToHub();
    });

    window.addEventListener('game-selected', (e) => {
        const gameConfig = e.detail;
        currentScreenType = (gameConfig && gameConfig.controllerType) ? gameConfig.controllerType : 'CONTROLLER';
    });

    window.addEventListener('remote-command', (e) => {
        const cmd = e.detail; 
        resetIdleTimer();
        if (isAttractMode) stopAttractMode();

        if (cmd.action === 'EXIT') returnToHub();
        else if (cmd.action === 'NEXT_ROUND') {
            if (currentMode === 'game' && runner.activeGame) {
                ui.hideMessage(); 
                runner.activeGame.startNewRound();
            }
        }
        else if (cmd.action === 'PLAY_AGAIN') {
            if (currentMode === 'game' && runner.activeGame) {
                ui.hideMessage(); 
                runner.activeGame.setup(); 
            }
        }
        else if (cmd.action === 'SELECT_GAME') {
            const gameId = cmd.payload;
            const gameConfig = GAME_LIST.find(g => g.id === gameId);
            if (gameConfig && currentMode === 'hub') {
                audio.play('click');
                enterGameMode(gameConfig);
            }
        }
    });

    window.addEventListener('game-state-change', (e) => {
        currentGameState = e.detail; 
        network.broadcastState(currentScreenType, currentGameState);
    });

    renderHub(); 
    attachGlobalSoundListeners();
}

function resetIdleTimer() {
    lastInteractionTime = Date.now();
    if (isAttractMode) {
        stopAttractMode();
    }
}

function checkIdle() {
    if (isAttractMode || currentMode !== 'hub') return;
    if (Date.now() - lastInteractionTime > IDLE_TIMEOUT) {
        startAttractMode();
    }
}

function startAttractMode() {
    console.log("[OpenTap Stadium] Starting Attract Mode");
    isAttractMode = true;
    attractLayer.classList.remove('hidden');
    
    pauseDemos();
    rotateAttractGame();
    attractInterval = setInterval(rotateAttractGame, 15000);
}

function stopAttractMode() {
    console.log("[OpenTap Stadium] Waking Up");
    isAttractMode = false;
    attractLayer.classList.add('hidden');
    
    if (attractInterval) clearInterval(attractInterval);
    runner.unmount('attract-canvas-container');
    resumeDemos();
}

function rotateAttractGame() {
    const randomGame = GAME_LIST[Math.floor(Math.random() * GAME_LIST.length)];
    document.getElementById('attract-game-title').innerText = randomGame.title;
    runner.mount(randomGame.class, 'attract-canvas-container', 'demo');
}

function renderAttractQR(code) {
    const baseUrl = window.location.href.split('?')[0].split('#')[0].replace(/\/$/, "");
    const joinUrl = `${baseUrl}/mobile.html?room=${code}`;
    const target = document.getElementById('attract-qr-target');
    if(target) {
        target.innerHTML = '';
        new QRCode(target, {
            text: joinUrl,
            width: 100,
            height: 100,
            colorDark : "#211B18",
            colorLight : "#FFFFFF",
            correctLevel : QRCode.CorrectLevel.L
        });
    }
}

function showQrModal(code) {
    const baseUrl = window.location.href.split('?')[0].split('#')[0].replace(/\/$/, "");
    const joinUrl = `${baseUrl}/mobile.html?room=${code}`;
    
    ui.showMessage(
        `Room Code: ${code}`, 
        `Scan to Join:<br><div id="host-qr-target" style="display:flex; justify-content:center; margin:15px auto; background:white; padding:12px; width:fit-content; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>`, 
        "OK", 
        () => ui.hideMessage()
    );

    setTimeout(() => {
        const target = document.getElementById('host-qr-target');
        if(target && window.QRCode) {
            target.innerHTML = ''; 
            new QRCode(target, {
                text: joinUrl,
                width: 256,
                height: 256,
                colorDark : "#211B18",
                colorLight : "#FFFFFF",
                correctLevel : QRCode.CorrectLevel.H
            });
        }
    }, 100);
}

function updateHostButton(code) {
    if(!hostBtnRef) return;
    const count = players.getActivePlayers().filter(p => p.type === 'mobile').length;
    hostBtnRef.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"></path>
        </svg>
        Room: ${code} (${count})
    `;
}

function cleanupDemos() {
    if (hubObserver) {
        hubObserver.disconnect();
        hubObserver = null;
    }
    demoInstances.forEach(item => {
        if (item.canvasId) {
            runner.unmount(item.canvasId);
        }
    });
    demoInstances = [];
}

function renderHub() {
    currentMode = 'hub';
    currentGameState = 'IDLE';
    
    cleanupDemos();
    hubGrid.innerHTML = '';
    createTournamentBanner();
    GAME_LIST.forEach(game => createGameCard(game));
    audio.setTrack('lobby');
    
    const gameNames = GAME_LIST.map(g => ({ id: g.id, title: g.title }));
    network.broadcastState('LOBBY', 'IDLE', { gameList: gameNames });

    setupHubObserver();
}

function createTournamentBanner() {
    const banner = document.createElement('div');
    banner.id = 'tournament-banner';
    banner.innerHTML = `
        <div class="banner-content">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                <path d="M4 22h16"></path>
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
            </svg>
            <div class="banner-text">
                <h3>TOURNAMENT ARENA</h3>
                <p>Play a series of party rounds to crown the stadium champion!</p>
            </div>
            <button class="banner-btn">START</button>
        </div>
    `;
    banner.onclick = () => showTournamentSetup();
    hubGrid.appendChild(banner);
}

function createGameCard(gameConfig) {
    const card = document.createElement('div');
    card.className = 'game-card';
    const canvasId = 'card-' + gameConfig.id;
    card.innerHTML = `<div class="card-canvas-wrapper" id="${canvasId}"></div><div class="card-info"><h3>${gameConfig.title}</h3><p>${gameConfig.description}</p></div>`;
    card.addEventListener('click', () => {
        audio.play('click');
        enterGameMode(gameConfig);
    });
    hubGrid.appendChild(card);
    
    const p5inst = runner.mount(gameConfig.class, canvasId, 'demo');
    if (p5inst) {
        p5inst.noLoop();
        demoInstances.push({ canvasId, cardElement: card, p5inst });
    }
}

function setupHubObserver() {
    if (hubObserver) {
        hubObserver.disconnect();
        hubObserver = null;
    }

    if (!('IntersectionObserver' in window)) {
        demoInstances.forEach(d => {
            if (d.p5inst) d.p5inst.loop();
        });
        return;
    }

    hubObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const matched = demoInstances.find(d => d.cardElement === entry.target);
            if (!matched || !matched.p5inst) return;

            if (entry.isIntersecting && currentMode === 'hub' && !isAttractMode) {
                matched.p5inst.loop();
            } else {
                matched.p5inst.noLoop();
            }
        });
    }, {
        root: hubGrid,
        threshold: 0.1
    });

    demoInstances.forEach(d => {
        hubObserver.observe(d.cardElement);
    });
}

function enterGameMode(gameConfig) {
    if (!gameConfig) {
        currentMode = 'game';
        currentGameState = 'PLAYING';
        gameStage.classList.remove('hidden');
        pauseDemos();
        return;
    }

    ui.showTransition(() => {
        currentMode = 'game';
        currentGameState = 'PLAYING';
        audio.setTrack('game');
        gameStage.classList.remove('hidden');
        pauseDemos();

        currentScreenType = gameConfig.controllerType || 'CONTROLLER';
        network.broadcastState(currentScreenType, 'PLAYING');

        // Mount full-screen live AI demo during the tutorial display
        runner.mount(gameConfig.class, 'game-canvas-container', 'demo');
        ui.hideTransition();

        // Show tutorial dialog overlaid on the active simulation
        ui.showTutorial(gameConfig, 4500, () => {
            ui.showTransition(() => {
                // Mount live active match with real players
                runner.mount(gameConfig.class, 'game-canvas-container', 'active');
                network.broadcastState(currentScreenType, 'PLAYING');
                ui.hideTransition();
            });
        });
    });
}

function returnToHub() {
    audio.play('click');
    ui.showTransition(() => {
        gameStage.classList.add('hidden');
        runner.unmount('game-canvas-container');
        renderHub();
        ui.hideTransition();
    });
}

function pauseDemos() { 
    demoInstances.forEach(d => {
        if (d.p5inst) d.p5inst.noLoop();
    }); 
}

function resumeDemos() { 
    if (currentMode !== 'hub' || isAttractMode) return;
    
    if (!hubObserver) {
        setupHubObserver();
    } else {
        demoInstances.forEach(d => {
            const rect = d.cardElement.getBoundingClientRect();
            const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
            if (isVisible) {
                d.p5inst.loop();
            } else {
                d.p5inst.noLoop();
            }
        });
    }
}

function showTournamentSetup() {
    audio.play('click');
    network.broadcastState('LOBBY', 'IDLE'); 
    ui.centerMessage.innerHTML = `
        <div class="message-card">
            <h1>Tournament Setup</h1>
            <p>How many rounds?</p>
            <div class="tourney-opts">
                <button class="tourney-btn" onclick="window.startTourney(3)"><span>3</span>Rounds</button>
                <button class="tourney-btn" onclick="window.startTourney(5)"><span>5</span>Rounds</button>
                <button class="tourney-btn" onclick="window.startTourney(7)"><span>7</span>Rounds</button>
            </div>
            <button id="cancel-tourney" class="secondary-btn" style="background:#211B18; color:white; border:none;">Cancel</button>
        </div>
    `;
    ui.centerMessage.classList.add('visible');
    window.startTourney = (rounds) => {
        ui.hideMessage();
        audio.play('click');
        ui.showTransition(() => {
            enterGameMode(null); 
            tournament.startTournament(rounds);
            ui.hideTransition();
        });
    };
    document.getElementById('cancel-tourney').onclick = () => { audio.play('click'); ui.hideMessage(); };
}

function cleanupLobby() { 
    lobbyInstances.forEach(p => p.remove()); 
    lobbyInstances = []; 
}

function renderVisualLobby() {
    cleanupLobby();
    const controls = document.querySelector('.lobby-controls');
    const existingSettings = document.querySelector('.lobby-settings');
    if (existingSettings) existingSettings.remove();
    
    const settingsDiv = document.createElement('div');
    settingsDiv.className = 'lobby-settings';
    settingsDiv.innerHTML = `<button id="toggle-music" class="setting-toggle ${audio.musicEnabled ? 'active' : ''}">Music: ${audio.musicEnabled ? 'ON' : 'OFF'}</button><button id="toggle-sfx" class="setting-toggle ${audio.sfxEnabled ? 'active' : ''}">SFX: ${audio.sfxEnabled ? 'ON' : 'OFF'}</button>`;
    controls.insertBefore(settingsDiv, controls.firstChild);
    document.getElementById('toggle-music').onclick = (e) => { const newState = !audio.musicEnabled; audio.toggleMusic(newState); e.target.textContent = `Music: ${newState ? 'ON' : 'OFF'}`; e.target.classList.toggle('active', newState); audio.play('click'); if (newState) audio.setTrack('config'); };
    document.getElementById('toggle-sfx').onclick = (e) => { const newState = !audio.sfxEnabled; audio.toggleSfx(newState); e.target.textContent = `SFX: ${newState ? 'ON' : 'OFF'}`; e.target.classList.toggle('active', newState); audio.play('click'); };
    
    playerConfigGrid.innerHTML = '';
    const activePlayers = players.getActivePlayers();
    activePlayers.forEach((p, index) => {
        const card = document.createElement('div');
        card.className = 'player-setup-card';
        if(p.type === 'mobile') card.style.border = "2px solid #FF5A36";
        const previewId = `preview-${index}`;
        const inputDisabled = p.type === 'mobile' ? 'disabled title="Edit on Phone"' : '';
        const badge = p.type === 'mobile' ? '<span style="background:#FF5A36; color:white; padding:2px 8px; border-radius:12px; font-size:0.75em; font-weight:bold;">MOBILE</span>' : '';
        const showRemove = activePlayers.length > 2;
        card.innerHTML = `<div class="setup-preview" id="${previewId}"></div><div class="setup-inputs"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">${badge}</div><input type="text" value="${p.name}" class="name-input" data-idx="${index}" ${inputDisabled}><input type="range" min="0" max="360" value="${getHueFromHex(p.color)}" class="hue-slider" data-idx="${index}" ${inputDisabled}></div><div class="setup-opts"><button class="setup-btn var-btn" data-idx="${index}" ${inputDisabled}>${p.variant === 'default' ? 'Boy' : 'Girl'}</button><button class="setup-btn acc-btn" data-idx="${index}" ${inputDisabled}>${p.accessory}</button></div>${showRemove ? `<button class="del-btn" data-idx="${index}">Remove</button>` : ''}${p.type === 'mobile' ? `<div style="text-align:center; font-size:0.8em; color:#7A6F68; margin-top:5px;">Connected</div>` : ''}`;
        playerConfigGrid.appendChild(card);
        const sketch = (sketchP) => {
            const avatars = new AvatarSystem(sketchP);
            let expression = 'idle'; let nextBlink = 0;
            sketchP.setup = () => { sketchP.createCanvas(200, 200); };
            sketchP.draw = () => {
                sketchP.clear(); sketchP.push(); sketchP.translate(100, 100);
                const t = sketchP.millis(); const breath = sketchP.sin(t * 0.003) * 0.03; sketchP.scale(1 + breath, 1 - breath);
                if (t > nextBlink) { expression = sketchP.random(['idle', 'happy', 'stunned']); nextBlink = t + sketchP.random(2000, 5000); setTimeout(() => expression = 'idle', 1000); }
                const currP = players.getPlayer(index);
                if (currP) avatars.draw({ x: 0, y: 0, size: 90, color: currP.color, variant: currP.variant, accessory: currP.accessory, expression: expression });
                sketchP.pop();
            };
        };
        lobbyInstances.push(new p5(sketch, previewId));
    });
    bindLobbyInputs();
}

function bindLobbyInputs() {
    const accessories = AvatarSystem.ACCESSORIES;

    document.querySelectorAll('.name-input').forEach(el => {
        el.addEventListener('input', (e) => {
            if(e.target.disabled) return;
            const idx = parseInt(e.target.dataset.idx);
            const p = players.getPlayer(idx);
            players.updatePlayer(p.id, { name: e.target.value });
        });
    });

    document.querySelectorAll('.hue-slider').forEach(el => {
        el.addEventListener('input', (e) => {
            if(e.target.disabled) return;
            const idx = parseInt(e.target.dataset.idx);
            const p = players.getPlayer(idx);
            const hue = parseInt(e.target.value);
            const color = hslToHex(hue, 85, 60);
            players.updatePlayer(p.id, { color: color });
        });
    });

    document.querySelectorAll('.var-btn').forEach(el => {
        el.addEventListener('click', (e) => {
            if(e.target.disabled) return;
            const idx = parseInt(e.target.dataset.idx);
            const p = players.getPlayer(idx);
            const newVar = p.variant === 'default' ? 'feminine' : 'default';
            players.updatePlayer(p.id, { variant: newVar });
            e.target.textContent = newVar === 'default' ? 'Boy' : 'Girl';
            audio.play('click');
        });
    });

    document.querySelectorAll('.acc-btn').forEach(el => {
        el.addEventListener('click', (e) => {
            if(e.target.disabled) return;
            const idx = parseInt(e.target.dataset.idx);
            const p = players.getPlayer(idx);
            let currIdx = accessories.indexOf(p.accessory);
            if (currIdx === -1) currIdx = 0;
            let nextAcc = accessories[(currIdx + 1) % accessories.length];
            players.updatePlayer(p.id, { accessory: nextAcc });
            e.target.textContent = nextAcc;
            audio.play('click');
        });
    });

    document.querySelectorAll('.del-btn').forEach(el => {
        el.addEventListener('click', (e) => {
            audio.play('click');
            players.removePlayer(e.target.dataset.idx);
            renderVisualLobby();
        });
    });
}

function hslToHex(h, s, l) {
    l /= 100; const a = s * Math.min(l, 1 - l) / 100;
    const f = n => { const k = (n + h / 30) % 12; const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); return Math.round(255 * color).toString(16).padStart(2, '0'); };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function getHueFromHex(hex) {
    let r = parseInt(hex.substring(1, 3), 16) / 255; let g = parseInt(hex.substring(3, 5), 16) / 255; let b = parseInt(hex.substring(5, 7), 16) / 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b); let h, s, l = (max + min) / 2;
    if (max == min) { h = s = 0; } else { let d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min); switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; case b: h = (r - g) / d + 4; break; } h /= 6; }
    return h * 360;
}

function attachGlobalSoundListeners() { 
    document.body.addEventListener('mouseover', (e) => { 
        if (e.target.matches('button, .game-card, input, .banner-btn, .icon-btn')) { 
            audio.play('ui-hover'); 
        } 
    }); 
    document.body.addEventListener('click', (e) => { 
        if (e.target.matches('button, .game-card, .banner-btn, .icon-btn')) { 
            audio.play('click'); 
        } 
    }); 
}

init();