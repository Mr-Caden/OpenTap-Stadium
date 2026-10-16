/* src/main.js */

import PlayerManager from "./core/PlayerManager.js";
import InputManager from "./core/InputManager.js";
import UIManager from "./core/UIManager.js";
import GameRunner from "./core/GameRunner.js";
import AudioManager from "./core/AudioManager.js";
import AvatarSystem from "./core/AvatarSystem.js";
import TournamentManager from "./core/TournamentManager.js";
import NetworkManager from "./core/NetworkManager.js";
import { GAME_LIST } from "./GameRegistry.js";

const players = new PlayerManager();
const inputs = new InputManager(players);
const ui = new UIManager();
const audio = new AudioManager();
const runner = new GameRunner(players, inputs, ui, audio);
const tournament = new TournamentManager(runner, ui, players);
const network = new NetworkManager(players, inputs);

inputs.setNetworkManager(network);

let currentMode = "hub";
let currentGameState = "IDLE";
let currentScreenType = "CONTROLLER";

// Virtualized Hub Card tracking
let hubCards = [];
let mountedHubDemos = new Map();
let hubObserver = null;

// Plaza simulation and single player editor state
let plazaP5 = null;
let editorP5 = null;
let editingPlayerId = null;

let tutorialsEnabled = localStorage.getItem("opentap_tutorials") !== "false";

let lastInteractionTime = Date.now();
const IDLE_TIMEOUT = 120000;
let isAttractMode = false;
let attractInterval = null;

const hubGrid = document.getElementById("hub-grid");
const gameStage = document.getElementById("game-stage");
const backBtn = document.getElementById("back-to-hub-btn");
const setupBtn = document.getElementById("settings-btn");
const setupOverlay = document.getElementById("setup-overlay");
const savePlayersBtn = document.getElementById("save-players-btn");
const addPlayerBtn = document.getElementById("add-player-btn");
const mainHeader = document.getElementById("main-header");
const attractLayer = document.getElementById("attract-layer");
let hostBtnRef = null;

function getHostIconSvg() {
    return `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"></path>
            <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"></path>
            <circle cx="12" cy="12" r="2"></circle>
            <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"></path>
            <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"></path>
        </svg>
    `;
}

function init() {
    console.log("[OpenTap Stadium] Engine Initialized");

    const startAudio = () => {
        audio.init();
        audio.setTrack("lobby");
        document.removeEventListener("click", startAudio);
        resetIdleTimer();
    };
    document.addEventListener("click", startAudio);

    window.addEventListener("mousemove", resetIdleTimer);
    window.addEventListener("keydown", resetIdleTimer);
    window.addEventListener("touchstart", resetIdleTimer);
    window.addEventListener("mousedown", resetIdleTimer);

    setInterval(checkIdle, 1000);

    if (!document.getElementById("host-game-btn")) {
        const hostBtn = document.createElement("button");
        hostBtn.id = "host-game-btn";
        hostBtn.className = "icon-btn";
        hostBtn.innerHTML = `${getHostIconSvg()}<span>Host Game</span>`;
        hostBtn.style.marginRight = "12px";
        hostBtn.onclick = () => {
            audio.play("click");
            hostBtn.innerHTML = `${getHostIconSvg()}<span>Starting...</span>`;
            hostBtn.disabled = true;
            network.hostGame();

            network.onHostReady = (code) => {
                hostBtnRef.innerHTML = `${getHostIconSvg()}<span>Room: ${code}</span>`;
                hostBtnRef.style.background = "#2ecc71";
                hostBtnRef.style.borderColor = "#27ae60";
                hostBtnRef.disabled = false;

                hostBtnRef.onclick = () => {
                    audio.play("click");
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
        audio.play("click");
        audio.setTrack("config");
        network.broadcastState("LOBBY", "IDLE");
        setupOverlay.classList.remove("hidden");
        renderVisualLobby();
        pauseDemos();
        resetIdleTimer();
    };

    savePlayersBtn.onclick = () => {
        audio.play("click");
        audio.setTrack("lobby");
        setupOverlay.classList.add("hidden");
        closePlayerEditor();
        cleanupLobby();
        renderHub();
        resetIdleTimer();
    };

    addPlayerBtn.onclick = () => {
        audio.play("click");
        players.addPlayer("local");
        renderVisualLobby();
        resetIdleTimer();
    };

    backBtn.onclick = returnToHub;

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const editorModal = document.getElementById("player-editor-modal");
            if (editorModal && !editorModal.classList.contains("hidden")) {
                closePlayerEditor();
                return;
            }
            if (currentMode === "game") {
                if (ui.isTutorialActive) {
                    ui.cancelTutorial();
                } else {
                    returnToHub();
                }
            }
        }
    });

    window.addEventListener("player-update", () => {
        if (network.roomId && hostBtnRef) updateHostButton(network.roomId);
        if (!setupOverlay.classList.contains("hidden")) {
            if (editorP5) editorP5.redraw();
        }
        if (isAttractMode) stopAttractMode();
        resetIdleTimer();
    });

    window.addEventListener("game-exit", () => {
        returnToHub();
    });

    window.addEventListener("game-selected", (e) => {
        const gameConfig = e.detail;
        currentScreenType =
            gameConfig && gameConfig.controllerType
                ? gameConfig.controllerType
                : "CONTROLLER";
    });

    window.addEventListener("remote-command", (e) => {
        const cmd = e.detail;
        resetIdleTimer();
        if (isAttractMode) stopAttractMode();

        if (cmd.action === "EXIT") returnToHub();
        else if (cmd.action === "NEXT_ROUND") {
            if (currentMode === "game" && runner.activeGame) {
                ui.hideMessage();
                runner.activeGame.startNewRound();
            }
        } else if (cmd.action === "PLAY_AGAIN") {
            if (currentMode === "game" && runner.activeGame) {
                ui.hideMessage();
                runner.activeGame.setup();
            }
        } else if (cmd.action === "SELECT_GAME") {
            const gameId = cmd.payload;
            const gameConfig = GAME_LIST.find((g) => g.id === gameId);
            if (gameConfig && currentMode === "hub") {
                audio.play("click");
                enterGameMode(gameConfig);
            }
        }
    });

    window.addEventListener("game-state-change", (e) => {
        currentGameState = e.detail;
        network.broadcastState(currentScreenType, currentGameState);
    });

    renderHub();
    attachGlobalSoundListeners();
    setupEditorModalBindings();
}

function resetIdleTimer() {
    lastInteractionTime = Date.now();
    if (isAttractMode) {
        stopAttractMode();
    }
}

function checkIdle() {
    if (isAttractMode || currentMode !== "hub") return;
    if (Date.now() - lastInteractionTime > IDLE_TIMEOUT) {
        startAttractMode();
    }
}

function startAttractMode() {
    console.log("[OpenTap Stadium] Starting Attract Mode");
    isAttractMode = true;
    attractLayer.classList.remove("hidden");

    pauseDemos();
    rotateAttractGame();
    attractInterval = setInterval(rotateAttractGame, 15000);
}

function stopAttractMode() {
    console.log("[OpenTap Stadium] Waking Up");
    isAttractMode = false;
    attractLayer.classList.add("hidden");

    if (attractInterval) clearInterval(attractInterval);
    runner.unmount("attract-canvas-container");
    resumeDemos();
}

function rotateAttractGame() {
    const randomGame = GAME_LIST[Math.floor(Math.random() * GAME_LIST.length)];
    document.getElementById("attract-game-title").innerText = randomGame.title;
    runner.mount(randomGame.class, "attract-canvas-container", "demo");
}

function renderAttractQR(code) {
    const url = new URL(window.location.href);
    const basePath = url.pathname.substring(
        0,
        url.pathname.lastIndexOf("/") + 1
    );
    const joinUrl = `${url.origin}${basePath}mobile.html?room=${code}`;

    const target = document.getElementById("attract-qr-target");
    if (target && window.QRCode) {
        target.innerHTML = "";
        try {
            new window.QRCode(target, {
                text: joinUrl,
                width: 100,
                height: 100,
                colorDark: "#211B18",
                colorLight: "#FFFFFF",
                correctLevel: window.QRCode.CorrectLevel.M,
            });
        } catch (e) {
            console.error("Attract QR Error:", e);
        }
    }
}

function showQrModal(code) {
    const url = new URL(window.location.href);
    const basePath = url.pathname.substring(
        0,
        url.pathname.lastIndexOf("/") + 1
    );
    const joinUrl = `${url.origin}${basePath}mobile.html?room=${code}`;

    ui.showMessage(
        `Room Code: ${code}`,
        `
        <div style="font-size:1.05rem; color:#7A6F68; margin-bottom:12px;">Scan with your phone camera to join:</div>
        <div id="host-qr-target" style="display:flex; justify-content:center; align-items:center; margin:16px auto; background:white; padding:14px; width:284px; height:284px; border-radius:16px; box-shadow:0 4px 16px rgba(0,0,0,0.12);"></div>
        `,
        "OK",
        () => ui.hideMessage()
    );

    setTimeout(() => {
        const target = document.getElementById("host-qr-target");
        if (target && window.QRCode) {
            target.innerHTML = "";
            try {
                new window.QRCode(target, {
                    text: joinUrl,
                    width: 256,
                    height: 256,
                    colorDark: "#211B18",
                    colorLight: "#FFFFFF",
                    correctLevel: window.QRCode.CorrectLevel.M,
                });
            } catch (err) {
                console.error("QR Code Error:", err);
            }
        }
    }, 80);
}

function updateHostButton(code) {
    if (!hostBtnRef) return;
    const count = players
        .getActivePlayers()
        .filter((p) => p.type === "mobile").length;
    hostBtnRef.innerHTML = `${getHostIconSvg()}<span>Room: ${code} (${count})</span>`;
}

// --- VIRTUALIZED HOST HUB DEMO MANAGEMENT ---

function cleanupDemos() {
    if (hubObserver) {
        hubObserver.disconnect();
        hubObserver = null;
    }

    mountedHubDemos.forEach((entry, canvasId) => {
        runner.unmount(canvasId);
    });
    mountedHubDemos.clear();
    hubCards = [];
}

function renderHub() {
    currentMode = "hub";
    currentGameState = "IDLE";

    cleanupDemos();
    hubGrid.innerHTML = "";
    createTournamentBanner();

    // 1. Render lightweight card DOM placeholders without allocating canvases upfront
    GAME_LIST.forEach((game) => createGameCard(game));
    audio.setTrack("lobby");

    network.broadcastState("LOBBY", "IDLE");

    // 2. Virtualize hub cards: only mount and animate canvases when visible in viewport
    setupHubObserver();
}

function createTournamentBanner() {
    const banner = document.createElement("div");
    banner.id = "tournament-banner";
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
    const card = document.createElement("div");
    card.className = "game-card";
    card.dataset.id = gameConfig.id;

    const canvasId = "card-" + gameConfig.id;
    card.innerHTML = `
        <div class="card-canvas-wrapper" id="${canvasId}"></div>
        <div class="card-info">
            <h3>${gameConfig.title}</h3>
            <p>${gameConfig.description}</p>
        </div>
    `;

    card.addEventListener("click", () => {
        audio.play("click");
        enterGameMode(gameConfig);
    });

    hubGrid.appendChild(card);
    hubCards.push({ gameConfig, canvasId, cardElement: card });
}

function setupHubObserver() {
    if (hubObserver) {
        hubObserver.disconnect();
        hubObserver = null;
    }

    if (!("IntersectionObserver" in window)) {
        // Fallback for browsers without IntersectionObserver
        hubCards.forEach((c) => mountHubCard(c));
        return;
    }

    hubObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                const gameId = entry.target.dataset.id;
                const matched = hubCards.find((c) => c.gameConfig.id === gameId);
                if (!matched) return;

                if (entry.isIntersecting && currentMode === "hub" && !isAttractMode) {
                    mountHubCard(matched);
                } else {
                    unmountHubCard(matched);
                }
            });
        },
        {
            root: hubGrid,
            rootMargin: "120px 0px 120px 0px", // Preload slightly before scrolling into view
            threshold: 0.05,
        }
    );

    hubCards.forEach((c) => {
        hubObserver.observe(c.cardElement);
    });
}

function mountHubCard(cardItem) {
    if (mountedHubDemos.has(cardItem.canvasId)) {
        const existing = mountedHubDemos.get(cardItem.canvasId);
        if (existing && typeof existing.loop === "function") {
            existing.loop();
        }
        return;
    }

    const p5inst = runner.mount(cardItem.gameConfig.class, cardItem.canvasId, "demo");
    if (p5inst) {
        mountedHubDemos.set(cardItem.canvasId, p5inst);
    }
}

function unmountHubCard(cardItem) {
    if (!mountedHubDemos.has(cardItem.canvasId)) return;

    runner.unmount(cardItem.canvasId);
    mountedHubDemos.delete(cardItem.canvasId);
}

function pauseDemos() {
    mountedHubDemos.forEach((p5inst) => {
        if (p5inst && typeof p5inst.noLoop === "function") {
            p5inst.noLoop();
        }
    });
}

function resumeDemos() {
    if (currentMode !== "hub" || isAttractMode) return;

    if (!hubObserver) {
        setupHubObserver();
    } else {
        mountedHubDemos.forEach((p5inst) => {
            if (p5inst && typeof p5inst.loop === "function") {
                p5inst.loop();
            }
        });
    }
}

function enterGameMode(gameConfig) {
    if (!gameConfig) {
        currentMode = "game";
        currentGameState = "PLAYING";
        gameStage.classList.remove("hidden");
        pauseDemos();
        return;
    }

    ui.showTransition(() => {
        currentMode = "game";
        currentGameState = "PLAYING";
        audio.setTrack("game");
        gameStage.classList.remove("hidden");
        pauseDemos();

        currentScreenType = gameConfig.controllerType || "CONTROLLER";

        if (!tutorialsEnabled) {
            runner.mount(gameConfig.class, "game-canvas-container", "active");
            network.broadcastState(currentScreenType, "PLAYING");
            ui.hideTransition();
            return;
        }

        const activePlayersList = players.getActivePlayers();
        network.broadcastState(currentScreenType, "TUTORIAL");

        ui.showTutorial(
            gameConfig,
            activePlayersList,
            () => {
                ui.showTransition(() => {
                    runner.unmount("tutorial-canvas-target");
                    runner.mount(
                        gameConfig.class,
                        "game-canvas-container",
                        "active"
                    );
                    network.broadcastState(currentScreenType, "PLAYING");
                    ui.hideTransition();
                });
            },
            () => {
                returnToHub();
            }
        );

        runner.mount(gameConfig.class, "tutorial-canvas-target", "demo");

        inputs.setGameListener((playerId, action) => {
            if (ui.isTutorialActive) {
                if (action === "PRESS") {
                    audio.play("click");
                    ui.playerReady(playerId);
                }
                return;
            }
            if (currentMode === "game" && runner.activeGame) {
                runner.activeGame.handleInput(playerId, action);
            }
        });

        ui.hideTransition();
    });
}

function returnToHub() {
    audio.play("click");
    ui.showTransition(() => {
        if (ui.isTutorialActive) {
            ui.cancelTutorial();
        }
        gameStage.classList.add("hidden");
        runner.unmount("tutorial-canvas-target");
        runner.unmount("game-canvas-container");
        renderHub();
        ui.hideTransition();
    });
}

function showTournamentSetup() {
    audio.play("click");
    network.broadcastState("LOBBY", "IDLE");
    ui.centerMessage.innerHTML = `
        <div class="message-card">
            <h1>Tournament Setup</h1>
            <div class="message-content">How many rounds?</div>
            <div class="tourney-opts">
                <button class="tourney-btn" onclick="window.startTourney(3)"><span>3</span>Rounds</button>
                <button class="tourney-btn" onclick="window.startTourney(5)"><span>5</span>Rounds</button>
                <button class="tourney-btn" onclick="window.startTourney(7)"><span>7</span>Rounds</button>
            </div>
            <button id="cancel-tourney" class="secondary-btn" style="background:#211B18; color:white; border:none;">Cancel</button>
        </div>
    `;
    ui.centerMessage.classList.add("visible");
    window.startTourney = (rounds) => {
        ui.hideMessage();
        audio.play("click");
        ui.showTransition(() => {
            enterGameMode(null);
            tournament.startTournament(rounds);
            ui.hideTransition();
        });
    };
    document.getElementById("cancel-tourney").onclick = () => {
        audio.play("click");
        ui.hideMessage();
    };
}

function cleanupLobby() {
    if (plazaP5) {
        plazaP5.remove();
        plazaP5 = null;
    }
    if (editorP5) {
        editorP5.remove();
        editorP5 = null;
    }
}

/* --- WII PLAZA SIMULATION & PLAYER LOUNGE ENGINE --- */
function renderVisualLobby() {
    cleanupLobby();

    const settingsContainer = document.getElementById(
        "lobby-settings-container"
    );
    if (settingsContainer) {
        settingsContainer.innerHTML = `
            <div class="lobby-settings">
                <button id="toggle-tutorial" class="setting-toggle ${
                    tutorialsEnabled ? "active" : ""
                }">Tutorials: ${tutorialsEnabled ? "ON" : "OFF"}</button>
                <button id="toggle-music" class="setting-toggle ${
                    audio.musicEnabled ? "active" : ""
                }">Music: ${audio.musicEnabled ? "ON" : "OFF"}</button>
                <button id="toggle-sfx" class="setting-toggle ${
                    audio.sfxEnabled ? "active" : ""
                }">SFX: ${audio.sfxEnabled ? "ON" : "OFF"}</button>
            </div>
        `;

        document.getElementById("toggle-tutorial").onclick = (e) => {
            tutorialsEnabled = !tutorialsEnabled;
            localStorage.setItem("opentap_tutorials", tutorialsEnabled);
            e.target.textContent = `Tutorials: ${
                tutorialsEnabled ? "ON" : "OFF"
            }`;
            e.target.classList.toggle("active", tutorialsEnabled);
            audio.play("click");
        };

        document.getElementById("toggle-music").onclick = (e) => {
            const newState = !audio.musicEnabled;
            audio.toggleMusic(newState);
            e.target.textContent = `Music: ${newState ? "ON" : "OFF"}`;
            e.target.classList.toggle("active", newState);
            audio.play("click");
            if (newState) audio.setTrack("config");
        };

        document.getElementById("toggle-sfx").onclick = (e) => {
            const newState = !audio.sfxEnabled;
            audio.toggleSfx(newState);
            e.target.textContent = `SFX: ${newState ? "ON" : "OFF"}`;
            e.target.classList.toggle("active", newState);
            audio.play("click");
        };
    }

    setTimeout(() => {
        initPlazaP5();
    }, 20);
}

function getSpacedSpawnPoints(count, w, h) {
    const marginX = 100;
    const marginY = 80;
    const usableW = Math.max(240, w - marginX * 2);
    const usableH = Math.max(200, h - marginY * 2);

    const cols = count <= 3 ? count : count <= 6 ? 3 : 4;
    const rows = Math.ceil(count / cols);
    const cellW = usableW / cols;
    const cellH = usableH / rows;

    const cellIndices = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            cellIndices.push({ r, c });
        }
    }

    for (let i = cellIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cellIndices[i], cellIndices[j]] = [cellIndices[j], cellIndices[i]];
    }

    const points = [];
    for (let i = 0; i < count; i++) {
        const cell = cellIndices[i % cellIndices.length];
        const jitterX = (Math.random() - 0.5) * (cellW * 0.35);
        const jitterY = (Math.random() - 0.5) * (cellH * 0.35);
        points.push({
            x: marginX + cell.c * cellW + cellW / 2 + jitterX,
            y: marginY + cell.r * cellH + cellH / 2 + jitterY,
        });
    }
    return points;
}

function initPlazaP5() {
    const container = document.getElementById("plaza-canvas-container");
    if (!container) return;
    container.innerHTML = "";

    const sketch = (p) => {
        let avatars;
        let wanderers = [];
        let speechToasts = [];
        let hoveredId = null;

        p.setup = () => {
            const w = container.clientWidth || window.innerWidth * 0.85;
            const h = container.clientHeight || 520;
            p.createCanvas(w, h);
            avatars = new AvatarSystem(p);
            syncWanderers();
        };

        function getAvatarBaseSize() {
            const dimension = Math.min(p.width, p.height);
            return Math.round(p.constrain(dimension * 0.11, 52, 92));
        }

        function pickNewGoal(wObj) {
            const w = p.width || 800;
            const h = p.height || 500;
            const avatarBaseSize = getAvatarBaseSize();

            const seekFriend = Math.random() < 0.15 && wanderers.length > 1;

            if (seekFriend) {
                const candidates = wanderers.filter(
                    (other) => other.id !== wObj.id
                );
                const friend =
                    candidates[Math.floor(Math.random() * candidates.length)];
                wObj.intent = "SEEK_FRIEND";
                wObj.friendTargetId = friend.id;
                const offsetAngle = Math.random() * p.TWO_PI;
                wObj.targetX = p.constrain(
                    friend.x + Math.cos(offsetAngle) * (avatarBaseSize * 0.9),
                    70,
                    w - 70
                );
                wObj.targetY = p.constrain(
                    friend.y + Math.sin(offsetAngle) * (avatarBaseSize * 0.9),
                    70,
                    h - 70
                );
            } else {
                wObj.intent = "SOLO";
                wObj.friendTargetId = null;
                wObj.targetX = 80 + Math.random() * (w - 160);
                wObj.targetY = 80 + Math.random() * (h - 160);
            }
        }

        function syncWanderers() {
            const activeList = players.getActivePlayers();
            const w = p.width || 800;
            const h = p.height || 500;
            const spawnPoints = getSpacedSpawnPoints(activeList.length, w, h);

            wanderers = activeList.map((pl, idx) => {
                const pt = spawnPoints[idx];
                return {
                    id: pl.id,
                    x: pt.x,
                    y: pt.y,
                    targetX: pt.x + (Math.random() - 0.5) * 80,
                    targetY: pt.y + (Math.random() - 0.5) * 80,
                    speed: 0.85 + Math.random() * 0.35,
                    facing: 1,
                    anim: "IDLE",
                    state: "WANDERING",
                    intent: "SOLO",
                    friendTargetId: null,
                    stateTimer: Math.floor(Math.random() * 60),
                    expression: "idle",
                    actionStartTime: 0,
                    hoverScale: 1.0,
                    cooldownUntil: 0,
                    blinkTimer: p.millis() + 2000 + Math.random() * 3000,
                };
            });
        }

        p.draw = () => {
            p.clear();
            const now = p.millis();
            const avatarBaseSize = getAvatarBaseSize();

            p.fill(250, 246, 240);
            p.noStroke();
            p.rect(0, 0, p.width, p.height);

            p.stroke(232, 225, 213, 140);
            p.strokeWeight(2);
            for (let y = 50; y < p.height; y += 75) {
                p.line(30, y, p.width - 30, y);
            }

            hoveredId = null;
            wanderers.forEach((w) => {
                const d = p.dist(p.mouseX, p.mouseY, w.x, w.y);
                if (d < avatarBaseSize * 0.55) {
                    hoveredId = w.id;
                }
            });

            const meetupTriggerDistance = avatarBaseSize * 1.25;
            const overlapThreshold = avatarBaseSize * 1.0;

            wanderers.forEach((w) => {
                const player = players.getPlayerById(w.id);
                if (!player) return;

                const isHovered = hoveredId === w.id;
                const targetScale = isHovered ? 1.18 : 1.0;
                w.hoverScale = p.lerp(w.hoverScale || 1.0, targetScale, 0.2);

                if (w.anim === "JUMP") {
                    if (now - w.actionStartTime >= 750) {
                        w.anim = "IDLE";
                        w.expression = "idle";
                    }
                } else if (w.anim === "ATTACK") {
                    if (now - w.actionStartTime >= 450) {
                        w.anim = "IDLE";
                    }
                } else if (w.anim === "ROLL") {
                    if (now - w.actionStartTime >= 650) {
                        w.anim = "IDLE";
                    }
                } else if (w.anim === "DUCK") {
                    if (now - w.actionStartTime >= 600) {
                        w.anim = "IDLE";
                    }
                }

                if (w.state === "INTERACTING") {
                    w.anim = w.anim === "IDLE" ? "IDLE" : w.anim;
                    w.stateTimer--;

                    if (w.stateTimer <= 0) {
                        w.state = "WANDERING";
                        w.cooldownUntil = now + 4000;
                        pickNewGoal(w);
                    }
                } else if (w.state === "WANDERING") {
                    if (
                        w.intent === "SEEK_FRIEND" &&
                        w.friendTargetId !== null
                    ) {
                        const friend = wanderers.find(
                            (o) => o.id === w.friendTargetId
                        );
                        if (friend) {
                            w.targetX = friend.x;
                            w.targetY = friend.y;
                        }
                    }

                    const dx = w.targetX - w.x;
                    const dy = w.targetY - w.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    let metFriend = null;
                    if (now > w.cooldownUntil) {
                        for (let other of wanderers) {
                            if (
                                other.id === w.id ||
                                other.state === "INTERACTING" ||
                                now < other.cooldownUntil
                            )
                                continue;
                            const d = p.dist(w.x, w.y, other.x, other.y);
                            if (d < meetupTriggerDistance) {
                                metFriend = other;
                                break;
                            }
                        }
                    }

                    if (metFriend) {
                        w.state = "INTERACTING";
                        w.stateTimer = 90;
                        w.facing = metFriend.x > w.x ? 1 : -1;

                        metFriend.state = "INTERACTING";
                        metFriend.stateTimer = 90;
                        metFriend.facing = w.x > metFriend.x ? 1 : -1;

                        const interactionSeed = Math.random();
                        if (interactionSeed < 0.3) {
                            w.anim = "JUMP";
                            w.actionStartTime = now;
                            w.expression = "happy";
                            metFriend.anim = "WIN";
                            metFriend.expression = "happy";
                            speechToasts.push({
                                x: (w.x + metFriend.x) / 2,
                                y: Math.min(w.y, metFriend.y) - 60,
                                text: "High five!",
                                life: 1.0,
                            });
                        } else if (interactionSeed < 0.6) {
                            w.anim = "ATTACK";
                            w.actionStartTime = now;
                            metFriend.anim = "DUCK";
                            metFriend.actionStartTime = now;
                            metFriend.expression = "stunned";
                            speechToasts.push({
                                x: (w.x + metFriend.x) / 2,
                                y: Math.min(w.y, metFriend.y) - 60,
                                text: "Tag!",
                                life: 1.0,
                            });
                        } else if (interactionSeed < 0.85) {
                            w.anim = "ROLL";
                            w.actionStartTime = now;
                            metFriend.anim = "JUMP";
                            metFriend.actionStartTime = now;
                            speechToasts.push({
                                x: (w.x + metFriend.x) / 2,
                                y: Math.min(w.y, metFriend.y) - 60,
                                text: "Watch this!",
                                life: 1.0,
                            });
                        } else {
                            w.expression = "happy";
                            metFriend.expression = "happy";
                            speechToasts.push({
                                x: (w.x + metFriend.x) / 2,
                                y: Math.min(w.y, metFriend.y) - 60,
                                text: "Ready to play?",
                                life: 1.0,
                            });
                        }
                    } else if (dist > 8) {
                        w.x += (dx / dist) * w.speed;
                        w.y += (dy / dist) * w.speed;
                        w.facing = dx > 0 ? 1 : -1;
                        w.anim = "RUN";
                    } else {
                        w.state = "IDLING";
                        w.anim = "IDLE";
                        w.stateTimer = Math.floor(60 + Math.random() * 120);
                    }
                } else if (w.state === "IDLING") {
                    w.anim = "IDLE";
                    w.stateTimer--;

                    if (w.stateTimer <= 0) {
                        w.state = "WANDERING";
                        pickNewGoal(w);
                    }
                }

                wanderers.forEach((other) => {
                    if (other === w) return;
                    const d = p.dist(w.x, w.y, other.x, other.y);
                    if (
                        d < overlapThreshold &&
                        d > 0 &&
                        w.state !== "INTERACTING"
                    ) {
                        const push = (overlapThreshold - d) * 0.035;
                        w.x += ((w.x - other.x) / d) * push;
                        w.y += ((w.y - other.y) / d) * push;
                    }
                });

                w.x = Math.max(60, Math.min(p.width - 60, w.x));
                w.y = Math.max(60, Math.min(p.height - 60, w.y));

                if (
                    now > w.blinkTimer &&
                    !isHovered &&
                    w.state !== "INTERACTING"
                ) {
                    w.expression = "happy";
                    setTimeout(() => {
                        w.expression = "idle";
                    }, 600);
                    w.blinkTimer = now + 3000 + Math.random() * 4000;
                }
            });

            const sorted = [...wanderers].sort((a, b) => a.y - b.y);

            sorted.forEach((w) => {
                const player = players.getPlayerById(w.id);
                if (!player) return;

                const isHovered = hoveredId === w.id;
                const isCurrentEditor = editingPlayerId === player.id;
                const expression = isHovered ? "happy" : w.expression;

                p.push();
                p.translate(w.x, w.y);
                p.scale(w.hoverScale);

                if (isHovered) {
                    p.noFill();
                    p.stroke(player.color);
                    p.strokeWeight(3);
                    p.ellipse(
                        0,
                        avatarBaseSize * 0.4,
                        avatarBaseSize * 1.1,
                        avatarBaseSize * 0.38
                    );
                }

                p.noStroke();
                p.fill(0, isHovered ? 45 : 30);
                p.ellipse(
                    0,
                    avatarBaseSize * 0.4,
                    avatarBaseSize * 0.8,
                    avatarBaseSize * 0.28
                );

                avatars.applyTransform(w.anim, w.actionStartTime);
                avatars.draw({
                    x: 0,
                    y: 0,
                    size: avatarBaseSize,
                    color: player.color,
                    variant: player.variant,
                    accessory: player.accessory,
                    expression: expression,
                    facing: w.facing,
                });

                p.push();
                p.translate(0, -avatarBaseSize * 0.85);
                p.rectMode(p.CENTER);

                const badgeW = Math.max(76, player.name.length * 9 + 24);
                p.fill(isHovered ? 255 : 255, 240);
                p.stroke(
                    isCurrentEditor
                        ? "#FF5A36"
                        : isHovered
                        ? player.color
                        : "#E8E1D5"
                );
                p.strokeWeight(isHovered || isCurrentEditor ? 2.5 : 1.5);
                p.rect(0, 0, badgeW, 22, 11);

                p.noStroke();
                p.fill(player.color);
                p.circle(-badgeW / 2 + 10, 0, 7);

                p.fill("#2D2522");
                p.textAlign(p.CENTER, p.CENTER);
                p.textSize(11);
                p.textStyle(p.BOLD);
                p.text(player.name, 4, 1);

                if (isHovered) {
                    p.fill(player.type === "mobile" ? "#27AE60" : "#FF5A36");
                    p.textSize(9);
                    p.text(
                        player.type === "mobile"
                            ? "Phone Controller"
                            : "Click to Customize",
                        0,
                        -18
                    );
                }

                p.pop();
                p.pop();
            });

            for (let i = speechToasts.length - 1; i >= 0; i--) {
                const toast = speechToasts[i];
                toast.y -= 0.6;
                toast.life -= 0.02;

                if (toast.life <= 0) {
                    speechToasts.splice(i, 1);
                } else {
                    p.push();
                    p.translate(toast.x, toast.y);
                    p.fill(33, 27, 24, Math.floor(toast.life * 230));
                    p.noStroke();
                    p.rectMode(p.CENTER);
                    p.rect(0, 0, 130, 28, 14);
                    p.fill(255, Math.floor(toast.life * 255));
                    p.textSize(11);
                    p.textStyle(p.BOLD);
                    p.textAlign(p.CENTER, p.CENTER);
                    p.text(toast.text, 0, 1);
                    p.pop();
                }
            }

            p.cursor(hoveredId !== null ? "pointer" : "default");
        };

        p.mousePressed = () => {
            if (hoveredId !== null) {
                const pl = players.getPlayerById(hoveredId);
                const w = wanderers.find((item) => item.id === hoveredId);
                if (!pl || !w) return;

                if (pl.type === "mobile") {
                    audio.play("click");
                    w.anim = "JUMP";
                    w.actionStartTime = p.millis();
                    w.expression = "happy";
                    speechToasts.push({
                        x: w.x,
                        y: w.y - 65,
                        text: "Edit on phone!",
                        life: 1.0,
                    });
                } else {
                    audio.play("click");
                    openPlayerEditor(pl.id);
                }
            }
        };

        p.windowResized = () => {
            if (container) {
                p.resizeCanvas(container.clientWidth, container.clientHeight);
            }
        };
    };

    plazaP5 = new p5(sketch, "plaza-canvas-container");
}

/* --- FOCUSED SINGLE PLAYER DRESSING ROOM CONTROLLER --- */
function openPlayerEditor(playerId) {
    editingPlayerId = playerId;
    const player = players.getPlayerById(playerId);
    if (!player) return;

    const modal = document.getElementById("player-editor-modal");
    if (!modal) return;
    modal.classList.remove("hidden");

    document.getElementById(
        "editor-title"
    ).innerText = `Customize ${player.name}`;
    document.getElementById("editor-name-input").value = player.name;
    document.getElementById("editor-hue-slider").value = getHueFromHex(
        player.color
    );
    document.getElementById("editor-style-btn").innerText =
        player.variant === "default" ? "Boy" : "Girl";
    document.getElementById("editor-acc-btn").innerText = player.accessory;

    const delBtn = document.getElementById("editor-del-btn");
    if (delBtn) {
        if (players.getActivePlayers().length > 2 && player.type === "local") {
            delBtn.classList.remove("hidden");
        } else {
            delBtn.classList.add("hidden");
        }
    }

    initEditorPreviewP5(player);
}

function closePlayerEditor() {
    editingPlayerId = null;
    const modal = document.getElementById("player-editor-modal");
    if (modal) modal.classList.add("hidden");
    if (editorP5) {
        editorP5.remove();
        editorP5 = null;
    }
}

function initEditorPreviewP5(initialPlayer) {
    if (editorP5) {
        editorP5.remove();
        editorP5 = null;
    }

    const container = document.getElementById("editor-preview-target");
    if (!container) return;
    container.innerHTML = "";

    const sketch = (p) => {
        let avatars;
        let expression = "idle";
        let blinkTimer = 0;

        p.setup = () => {
            p.createCanvas(190, 190);
            avatars = new AvatarSystem(p);
        };

        p.draw = () => {
            p.clear();
            const curr = players.getPlayerById(initialPlayer.id);
            if (!curr) return;

            const t = p.millis();
            const breath = p.sin(t * 0.003) * 0.03;

            p.push();
            p.translate(95, 105);
            p.scale(1 + breath, 1 - breath);

            if (t > blinkTimer) {
                expression = "happy";
                blinkTimer = t + 2500 + Math.random() * 2500;
                setTimeout(() => {
                    expression = "idle";
                }, 600);
            }

            avatars.draw({
                x: 0,
                y: 0,
                size: 96,
                color: curr.color,
                variant: curr.variant,
                accessory: curr.accessory,
                expression: expression,
            });
            p.pop();
        };
    };

    editorP5 = new p5(sketch, "editor-preview-target");
}

function setupEditorModalBindings() {
    const accessories = AvatarSystem.ACCESSORIES;

    document.getElementById("close-editor-btn").onclick = () => {
        audio.play("click");
        closePlayerEditor();
    };

    document.getElementById("editor-done-btn").onclick = () => {
        audio.play("click");
        closePlayerEditor();
    };

    document
        .getElementById("editor-name-input")
        .addEventListener("input", (e) => {
            if (editingPlayerId !== null) {
                players.updatePlayer(editingPlayerId, { name: e.target.value });
            }
        });

    document
        .getElementById("editor-hue-slider")
        .addEventListener("input", (e) => {
            if (editingPlayerId !== null) {
                const hue = parseInt(e.target.value);
                const color = hslToHex(hue, 85, 60);
                players.updatePlayer(editingPlayerId, { color: color });
            }
        });

    document.getElementById("editor-style-btn").onclick = () => {
        if (editingPlayerId !== null) {
            const curr = players.getPlayerById(editingPlayerId);
            if (!curr) return;
            const newVar = curr.variant === "default" ? "feminine" : "default";
            players.updatePlayer(editingPlayerId, { variant: newVar });
            document.getElementById("editor-style-btn").innerText =
                newVar === "default" ? "Boy" : "Girl";
            audio.play("click");
        }
    };

    document.getElementById("editor-acc-btn").onclick = () => {
        if (editingPlayerId !== null) {
            const curr = players.getPlayerById(editingPlayerId);
            if (!curr) return;
            let idx = accessories.indexOf(curr.accessory);
            if (idx === -1) idx = 0;
            const nextAcc = accessories[(idx + 1) % accessories.length];
            players.updatePlayer(editingPlayerId, { accessory: nextAcc });
            document.getElementById("editor-acc-btn").innerText = nextAcc;
            audio.play("click");
        }
    };

    document.getElementById("editor-del-btn").onclick = () => {
        if (editingPlayerId !== null) {
            audio.play("click");
            const idToRemove = editingPlayerId;
            closePlayerEditor();
            players.removePlayerById(idToRemove);
            renderVisualLobby();
        }
    };
}

function hslToHex(h, s, l) {
    l /= 100;
    const a = (s * Math.min(l, 1 - l)) / 100;
    const f = (n) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color)
            .toString(16)
            .padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function getHueFromHex(hex) {
    let r = parseInt(hex.substring(1, 3), 16) / 255;
    let g = parseInt(hex.substring(3, 5), 16) / 255;
    let b = parseInt(hex.substring(5, 7), 16) / 255;
    let max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    let h,
        s,
        l = (max + min) / 2;
    if (max == min) {
        h = s = 0;
    } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }
    return h * 360;
}

function attachGlobalSoundListeners() {
    document.body.addEventListener("mouseover", (e) => {
        if (
            e.target.matches(
                "button, .game-card, input, .banner-btn, .icon-btn"
            )
        ) {
            audio.play("ui-hover");
        }
    });
    document.body.addEventListener("click", (e) => {
        if (e.target.matches("button, .game-card, .banner-btn, .icon-btn")) {
            audio.play("click");
        }
    });
}

init();