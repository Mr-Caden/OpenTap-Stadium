/* src/games/BaseGame.js */

import AvatarSystem from '../core/AvatarSystem.js';

/**
 * BaseGame
 * Abstract base class providing fixed-timestep simulation, managed physics,
 * unified input normalization, entity lifecycle management, rotate-tap movement engine,
 * and shared vector rendering.
 * Defaults to 1 round and 1 life platform-wide.
 */
export default class BaseGame {
    constructor(context, rules = {}) {
        this.p = context.p5;
        this.audio = context.audio;
        this.ui = context.ui;
        this.context = context;

        // Guaranteed baseline coordinate space (1920x1200 virtual viewport)
        this.V_WIDTH = 1920;
        this.V_HEIGHT = 1200;
        this.CX = this.V_WIDTH / 2;
        this.CY = this.V_HEIGHT / 2;

        this.allPlayers = context.players.getActivePlayers();
        
        const manifest = this.constructor.manifest || {};
        this.manifest = manifest;

        this.mode = rules.mode || 'active';
        
        // Fast, high-throughput default party rules: 1 round, 1 life, sudden death
        this.config = {
            winCondition: 'SURVIVAL', 
            winValue: 1,
            roundDuration: 60000, 
            roundEndCriteria: 'SURVIVAL', 
            scoreSorting: 'DESC', 
            roundResetType: 'RESET_ALL', 
            livesPerRound: 1,
            eliminateOnDeath: true, 
            autoLoop: true,
            showRoundResultUI: true,
            turnBased: false,
            turnBasedBackgroundColor: false,
            controllerType: rules.controllerType || manifest.controllerType || 'CONTROLLER', 
            autoStart: true, 
            ...rules
        };

        // Responsive cursor speed: 15px/tick base speed allows swift arena navigation
        this.CURSOR_SPEED = 15; 

        // Centralized procedural avatar system
        this.avatars = new AvatarSystem(this.p);

        // Particle pool
        this.particles = [];

        // Managed timeouts set
        this.activeTimeouts = new Set();

        // Managed physics state
        this.physicsEnabled = false;
        this.engine = null;
        this.world = null;
        this.physicsEventHandlers = [];

        // Engine-level Rotate-Tap Movement System
        this.rotateTapEnabled = false;
        this.rotateTapConfig = null;

        // Fixed timestep accumulator settings (60Hz deterministic simulation)
        this.FIXED_DELTA_TIME = 1000 / 60;
        this.MAX_ACCUMULATED_TIME = 250;
        this.physicsAccumulator = 0;
        this.lastFrameTime = 0;

        // Core player records
        this.players = this.allPlayers.map(p => ({ 
            ...p, 
            score: 0, 
            lives: this.config.livesPerRound,
            isEliminated: false,
            isPermEliminated: false,
            wasPressed: false,
            cursorX: this.CX,
            cursorY: this.CY,
            isClicking: false,
            clickSafetyTimer: 0, 
            inputVector: { x: 0, y: 0 },
            sensitivity: p.sensitivity || 1.4
        }));

        // Standardized entity pool for gameplay entities (synced to active players)
        this.entities = [];

        this.state = {
            phase: 'SETUP',
            round: 0,
            activePlayerIndex: 0,
            winner: null,
            isRoundActive: false,
            timer: 0 
        };

        this.scaleFactor = 1;
        this.transX = 0;
        this.transY = 0;
        this.shakeTimer = 0;
        
        // Base canvas color matching OpenTap Stadium cream (#FAF6F0)
        this.bgColor = [250, 246, 240];
        this.targetBgColor = [250, 246, 240];

        this.isDestroyed = false;
        this.isFirstBoot = true; 
    }

    // --- MANAGED PHYSICS LIFECYCLE ---

    /**
     * Initializes a managed Matter.js physics engine with automatic collision
     * event delegation and cleanup.
     * @param {Object} options Physics configuration options
     */
    enablePhysics(options = {}) {
        if (!window.Matter) {
            console.error('[BaseGame] Matter.js is not loaded.');
            return;
        }

        const { Engine, Events } = window.Matter;
        this.physicsEnabled = true;

        const engineOpts = options.engineOptions || {};
        this.engine = Engine.create(engineOpts);
        this.world = this.engine.world;

        const grav = options.gravity || { x: 0, y: 0 };
        this.engine.gravity.x = grav.x;
        this.engine.gravity.y = grav.y;

        if (options.positionIterations) {
            this.engine.positionIterations = options.positionIterations;
        }
        if (options.velocityIterations) {
            this.engine.velocityIterations = options.velocityIterations;
        }

        const collisionStartHandler = (e) => this._routeCollisions('collisionStart', e);
        const collisionEndHandler = (e) => this._routeCollisions('collisionEnd', e);

        Events.on(this.engine, 'collisionStart', collisionStartHandler);
        Events.on(this.engine, 'collisionEnd', collisionEndHandler);

        this.physicsEventHandlers.push(
            { name: 'collisionStart', handler: collisionStartHandler },
            { name: 'collisionEnd', handler: collisionEndHandler }
        );
    }

    _routeCollisions(type, event) {
        if (this.isDestroyed || !event.pairs) return;

        for (let i = 0; i < event.pairs.length; i++) {
            const pair = event.pairs[i];
            const entityA = this.getEntityByBody(pair.bodyA);
            const entityB = this.getEntityByBody(pair.bodyB);

            if (type === 'collisionStart') {
                this.onCollisionStart(pair, pair.bodyA, pair.bodyB, entityA, entityB);
            } else if (type === 'collisionEnd') {
                this.onCollisionEnd(pair, pair.bodyA, pair.bodyB, entityA, entityB);
            }
        }
    }

    addPhysicsBody(body) {
        if (this.world && window.Matter) {
            window.Matter.Composite.add(this.world, body);
        }
        return body;
    }

    removePhysicsBody(body) {
        if (this.world && window.Matter && body) {
            window.Matter.Composite.remove(this.world, body);
        }
    }

    getEntityByBody(body) {
        if (!body) return null;
        return this.entities.find(e => e.body === body) || null;
    }

    // --- ENGINE-LEVEL ROTATE-TAP MOVEMENT SYSTEM ---

    /**
     * Enables automatic rotate-tap steering across all active entities.
     * Rotates continuously in one direction; holding button engages forward thrust.
     * @param {Object} options Configuration parameters
     */
    enableRotateTapMovement(options = {}) {
        this.rotateTapEnabled = true;
        this.rotateTapConfig = {
            rotSpeed: options.rotSpeed || 0.08,
            boostForce: options.boostForce || 0.055,
            friction: options.friction || 0.04,
            reverseOnTap: options.reverseOnTap === true,
            ...options
        };
    }

    updateRotateTapMovement(dt) {
        const activeEntities = this.getActiveEntities();

        for (let i = 0; i < activeEntities.length; i++) {
            const ent = activeEntities[i];

            if (ent.isBoosting) {
                const forceMag = ent.boostForce || this.rotateTapConfig.boostForce;
                const fx = Math.cos(ent.angle) * forceMag;
                const fy = Math.sin(ent.angle) * forceMag;

                if (ent.body && window.Matter) {
                    window.Matter.Body.applyForce(ent.body, ent.body.position, { x: fx, y: fy });
                } else {
                    ent.vx = (ent.vx || 0) + fx * 15;
                    ent.vy = (ent.vy || 0) + fy * 15;
                }

                ent.anim = 'RUN';
            } else {
                const speed = ent.rotSpeed || this.rotateTapConfig.rotSpeed;
                ent.angle += speed * (ent.rotDir || 1);
                if (ent.anim === 'RUN') ent.anim = 'IDLE';
            }

            // Kinematic integration for entities without rigid bodies
            if (!ent.body) {
                const friction = this.rotateTapConfig.friction || 0.04;
                ent.vx = (ent.vx || 0) * (1 - friction);
                ent.vy = (ent.vy || 0) * (1 - friction);
                ent.x += ent.vx;
                ent.y += ent.vy;
            }
        }
    }

    drawRotateTapArrows(options = {}) {
        const activeEntities = this.getActiveEntities();
        for (let i = 0; i < activeEntities.length; i++) {
            const ent = activeEntities[i];
            this.drawDirectionArrow(ent.x, ent.y, ent.angle, {
                distance: options.distance || (ent.size / 2 + 28),
                size: options.size || 10,
                color: ent.player.color,
                strokeColor: '#FFFFFF',
                strokeWeight: 2,
                ...options
            });
        }
    }

    // --- TIMEOUT MANAGEMENT ---

    scheduleTimeout(callback, delayMs) {
        if (this.isDestroyed) return null;
        const timerId = setTimeout(() => {
            this.activeTimeouts.delete(timerId);
            if (!this.isDestroyed) {
                callback();
            }
        }, delayMs);
        this.activeTimeouts.add(timerId);
        return timerId;
    }

    clearAllTimeouts() {
        this.activeTimeouts.forEach(id => clearTimeout(id));
        this.activeTimeouts.clear();
    }

    // --- ENTITY MANAGEMENT ---

    /**
     * Rebuilds the entity roster for all active players at the start of a round.
     */
    initEntities() {
        this.entities = [];
        const activePlayers = this.players.filter(p => !p.isPermEliminated);

        activePlayers.forEach((player, index) => {
            const entity = {
                id: player.id,
                index: index,
                player: player,
                x: this.CX,
                y: this.CY,
                vx: 0,
                vy: 0,
                angle: 0,
                rotDir: 1,
                rotSpeed: this.rotateTapConfig ? this.rotateTapConfig.rotSpeed : 0.08,
                boostForce: this.rotateTapConfig ? this.rotateTapConfig.boostForce : 0.055,
                isBoosting: false,
                size: 90,
                anim: 'IDLE',
                expression: 'idle',
                facing: 1,
                isPressing: false,
                inputVector: { x: 0, y: 0 },
                body: null,
                data: {}
            };

            this.initPlayerEntity(entity, player);
            this.entities.push(entity);
        });
    }

    getEntity(playerOrId) {
        const id = typeof playerOrId === 'object' ? playerOrId.id : playerOrId;
        return this.entities.find(e => e.id === id) || null;
    }

    getActiveEntities() {
        return this.entities.filter(e => !e.player.isEliminated && !e.player.isPermEliminated);
    }

    // --- SETUP & GAME LOOP ---

    setup() {
        if (this.isDestroyed) return;

        const parent = this.p.canvas.parentElement;
        this.p.createCanvas(parent.clientWidth, parent.clientHeight);
        this.calculateLayout();

        this.state.round = 0;
        this.state.winner = null;
        this.state.phase = 'SETUP';
        this.physicsAccumulator = 0;
        this.lastFrameTime = 0;
        
        // Execute minigame setup first so dynamic player scaling rules apply immediately
        this.onSetup();

        // Apply calibrated configuration to player structures
        this.players.forEach(p => {
            p.score = 0;
            p.isEliminated = false;
            p.isPermEliminated = false;
            p.lives = this.config.livesPerRound;
            p.statusType = (this.config.livesPerRound > 1) ? 'hearts' : 'score';
            p.customStatus = (this.config.livesPerRound > 1) ? p.lives : undefined;
            p.cursorX = this.CX;
            p.cursorY = this.CY;
            p.inputVector = { x: 0, y: 0 };
        });

        if (this.audio && this.mode !== 'demo') this.audio.setTrack('game');

        this.updateUI(); 
        this.startNewRound();
    }

    beginGameplay() {
        if (this.state.phase === 'TUTORIAL') {
            this.state.phase = 'PLAYING';
            this.lastFrameTime = this.p.millis();
            this.physicsAccumulator = 0;
            window.dispatchEvent(new CustomEvent('game-state-change', { detail: 'PLAYING' }));
        }
    }

    draw() {
        if (this.isDestroyed) return;
        const p = this.p;
        const now = p.millis();

        if (this.lastFrameTime === 0) {
            this.lastFrameTime = now;
        }

        let frameDelta = now - this.lastFrameTime;
        this.lastFrameTime = now;

        if (frameDelta > this.MAX_ACCUMULATED_TIME) {
            frameDelta = this.MAX_ACCUMULATED_TIME;
        }

        if (this.state.phase === 'PLAYING' && this.config.winCondition === 'TIME') {
            this.state.timer -= frameDelta;
            if (this.state.timer <= 0) {
                this.state.timer = 0;
                this.handleTimeUp();
            }
        }

        this.physicsAccumulator += frameDelta;
        while (this.physicsAccumulator >= this.FIXED_DELTA_TIME) {
            this.fixedUpdate(this.FIXED_DELTA_TIME);
            this.physicsAccumulator -= this.FIXED_DELTA_TIME;
        }

        // Touchpad cursor handling factoring in player sensitivity
        this.players.forEach(pl => {
            if (this.config.controllerType === 'TOUCHPAD') {
                if (pl.inputVector.x !== 0 || pl.inputVector.y !== 0) {
                    const sens = pl.sensitivity || 1.4;
                    const moveSpeed = this.CURSOR_SPEED * sens;
                    pl.cursorX += pl.inputVector.x * moveSpeed;
                    pl.cursorY += pl.inputVector.y * moveSpeed;
                    pl.cursorX = Math.max(0, Math.min(this.V_WIDTH, pl.cursorX));
                    pl.cursorY = Math.max(0, Math.min(this.V_HEIGHT, pl.cursorY));
                }
            }
            if (pl.isClicking) {
                pl.clickSafetyTimer += frameDelta;
                if (pl.clickSafetyTimer > 2000) { 
                    pl.isClicking = false;
                    pl.clickSafetyTimer = 0;
                }
            } else {
                pl.clickSafetyTimer = 0;
            }
        });

        if (this.config.turnBasedBackgroundColor && this.mode !== 'demo') {
            this.bgColor[0] = p.lerp(this.bgColor[0], this.targetBgColor[0], 0.05);
            this.bgColor[1] = p.lerp(this.bgColor[1], this.targetBgColor[1], 0.05);
            this.bgColor[2] = p.lerp(this.bgColor[2], this.targetBgColor[2], 0.05);
            p.background(this.bgColor);
        } else {
            p.background(this.getBgColor());
        }

        p.push();
        let sx = 0, sy = 0;
        if (this.shakeTimer > 0) {
            this.shakeTimer--;
            const damp = this.shakeTimer / 20;
            sx = p.random(-1, 1) * 20 * damp;
            sy = p.random(-1, 1) * 20 * damp;
        }
        p.translate(this.transX + sx, this.transY + sy);
        p.scale(this.scaleFactor);

        this.onDraw();
        
        if (this.mode !== 'demo' && this.config.controllerType === 'TOUCHPAD') {
            this.drawCursors();
        }

        p.pop();
    }

    fixedUpdate(dt) {
        if (this.isDestroyed || this.state.phase !== 'PLAYING') return;

        // Process engine-level rotate-tap steering updates
        if (this.rotateTapEnabled) {
            this.updateRotateTapMovement(dt);
        }

        // Supports both managed physics and legacy manual engine instances
        if (this.engine && window.Matter) {
            window.Matter.Engine.update(this.engine, dt);

            // Synchronize entity coordinates with rigid bodies if assigned
            for (let i = 0; i < this.entities.length; i++) {
                const entity = this.entities[i];
                if (entity.body) {
                    entity.x = entity.body.position.x;
                    entity.y = entity.body.position.y;
                }
            }
        }

        if (this.mode === 'demo') {
            this.runDemoAI();
        }

        this.onFixedUpdate(dt);
    }

    drawCursors() {
        const p = this.p;
        this.players.forEach(pl => {
            if (pl.isEliminated || pl.type === 'local') return;

            p.push();
            p.translate(pl.cursorX, pl.cursorY);
            p.fill(pl.color);
            p.stroke(255); p.strokeWeight(3);
            
            p.beginShape();
            p.vertex(0, 0); p.vertex(0, 35); p.vertex(10, 25);
            p.vertex(20, 38); p.vertex(26, 32); p.vertex(16, 20); p.vertex(28, 20);
            p.endShape(p.CLOSE);
            
            if (pl.isClicking) {
                p.noFill(); p.stroke(pl.color); p.strokeWeight(3);
                p.circle(5, 5, 60); 
            }
            p.pop();
        });
    }

    // --- REUSABLE RENDERING UTILITIES ---

    drawAvatar(playerData, x, y, options = {}) {
        const p = this.p;
        const config = playerData.config || playerData.player || playerData;
        const size = options.size || 90;
        const expression = options.expression || 'idle';
        const anim = options.anim || null;
        const facing = options.facing !== undefined ? options.facing : 1;
        const rotation = options.rotation || 0;

        if (options.shadow) {
            const shadowW = options.shadowWidth || size * 0.75;
            const shadowH = options.shadowHeight || size * 0.22;
            const shadowOffset = options.shadowOffsetY !== undefined ? options.shadowOffsetY : size * 0.45;
            this.drawShadow(x, y + shadowOffset, shadowW, shadowH);
        }

        p.push();
        p.translate(x, y);
        if (rotation) p.rotate(rotation);
        if (anim) this.avatars.applyTransform(anim);
        
        this.avatars.draw({
            x: 0,
            y: 0,
            size: size,
            color: config.color,
            variant: config.variant,
            accessory: config.accessory,
            expression: expression,
            facing: facing
        });
        p.pop();
    }

    drawEntities(options = {}) {
        const activeEntities = this.getActiveEntities();
        for (let i = 0; i < activeEntities.length; i++) {
            const ent = activeEntities[i];
            this.drawAvatar(ent.player, ent.x, ent.y, {
                size: ent.size,
                anim: ent.anim,
                expression: ent.expression,
                facing: options.facing !== undefined ? options.facing : 1,
                rotation: options.rotation !== undefined ? options.rotation : 0,
                shadow: options.shadow !== false,
                ...options
            });
        }
    }

    drawShadow(x, y, width = 60, height = 20, alpha = 35) {
        const p = this.p;
        p.push();
        p.noStroke();
        p.fill(0, alpha);
        p.ellipse(x, y, width, height);
        p.pop();
    }

    drawDirectionArrow(x, y, angle, options = {}) {
        const p = this.p;
        const distance = options.distance !== undefined ? options.distance : 60;
        const size = options.size || 14;
        const color = options.color || '#FFFFFF';

        p.push();
        p.translate(x, y);
        p.rotate(angle);
        p.translate(distance, 0);
        p.fill(color);
        if (options.strokeColor) {
            p.stroke(options.strokeColor);
            p.strokeWeight(options.strokeWeight || 2);
        } else {
            p.noStroke();
        }
        p.triangle(size, 0, -size * 0.6, -size * 0.6, -size * 0.6, size * 0.6);
        p.pop();
    }

    drawTimerBadge(value = null, options = {}) {
        const p = this.p;
        const displayVal = value !== null ? value : Math.max(0, Math.ceil(this.state.timer / 1000));
        const x = options.x !== undefined ? options.x : this.CX;
        const y = options.y !== undefined ? options.y : 70;
        const w = options.width || 140;
        const h = options.height || 75;
        const threshold = options.criticalThreshold !== undefined ? options.criticalThreshold : 10;
        const isCritical = typeof displayVal === 'number' && displayVal <= threshold;
        const textColor = isCritical ? (options.criticalColor || '#FF5A36') : (options.normalColor || '#211B18');

        p.push();
        p.translate(x, y);

        let scale = 1;
        if (isCritical) {
            scale = 1 + Math.sin(p.millis() * 0.015) * 0.06;
            p.scale(scale);
        }

        p.fill(255);
        p.stroke(0, 40);
        p.strokeWeight(4);
        p.rectMode(p.CENTER);
        p.rect(0, 0, w, h, 22);

        p.fill(textColor);
        p.noStroke();
        p.textSize(options.fontSize || 46);
        p.textAlign(p.CENTER, p.CENTER);
        p.textStyle(p.BOLD);
        p.text(displayVal, 0, options.subtext ? -6 : 3);

        if (options.subtext) {
            p.textSize(14);
            p.fill(isCritical ? textColor : '#7A6F68');
            p.text(options.subtext, 0, 22);
        }

        p.pop();
    }

    drawSpeechBubble(x, y, text, options = {}) {
        const p = this.p;
        const w = options.width || 120;
        const h = options.height || 50;
        const radius = options.radius || 10;
        const bgColor = options.bgColor || 'rgba(0, 0, 0, 0.7)';
        const textColor = options.textColor || '#FFFFFF';
        const pointerDir = options.pointerDir || 'down';

        p.push();
        p.translate(x, y);

        p.fill(bgColor);
        p.noStroke();
        p.rectMode(p.CENTER);
        p.rect(0, 0, w, h, radius);

        if (pointerDir === 'down') {
            p.triangle(-10, h / 2, 10, h / 2, 0, h / 2 + 10);
        } else if (pointerDir === 'up') {
            p.triangle(-10, -h / 2, 10, -h / 2, 0, -h / 2 - 10);
        }

        p.fill(textColor);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(options.fontSize || 26);
        p.textStyle(p.BOLD);
        p.text(text, 0, options.subtext ? -6 : 1);

        if (options.subtext) {
            p.textSize(14);
            p.fill(options.subtextColor || '#F59E0B');
            p.text(options.subtext, 0, 16);
        }

        p.pop();
    }

    drawPolygon(x, y, radius, sides) {
        const p = this.p;
        const angle = p.TWO_PI / sides;
        p.beginShape();
        for (let a = 0; a < p.TWO_PI; a += angle) {
            const sx = x + p.cos(a) * radius;
            const sy = y + p.sin(a) * radius;
            p.vertex(sx, sy);
        }
        p.endShape(p.CLOSE);
    }

    // --- SPATIAL LAYOUT HELPERS ---

    getRadialPositions(count, radius, options = {}) {
        const cx = options.centerX !== undefined ? options.centerX : this.CX;
        const cy = options.centerY !== undefined ? options.centerY : this.CY;
        const startAngle = options.startAngle !== undefined ? options.startAngle : 0;
        const positions = [];

        for (let i = 0; i < count; i++) {
            const angle = startAngle + (this.p.TWO_PI / count) * i;
            positions.push({
                x: cx + Math.cos(angle) * radius,
                y: cy + Math.sin(angle) * radius,
                angle: angle
            });
        }
        return positions;
    }

    getLinearPositions(count, spacing, options = {}) {
        const axis = options.axis || 'x';
        const totalSpan = (count - 1) * spacing;
        const positions = [];

        if (axis === 'x') {
            const startX = (options.centerCoord !== undefined ? options.centerCoord : this.CX) - totalSpan / 2;
            const y = options.fixedCoord !== undefined ? options.fixedCoord : this.CY;
            for (let i = 0; i < count; i++) {
                positions.push({ x: startX + i * spacing, y });
            }
        } else {
            const startY = (options.centerCoord !== undefined ? options.centerCoord : this.CY) - totalSpan / 2;
            const x = options.fixedCoord !== undefined ? options.fixedCoord : this.CX;
            for (let i = 0; i < count; i++) {
                positions.push({ x, y: startY + i * spacing });
            }
        }
        return positions;
    }

    // --- PARTICLE SYSTEM UTILITIES ---

    spawnParticles(x, y, options = {}) {
        const count = options.count || 10;
        const color = options.color || '#FFFFFF';
        const speed = options.speed || 5;
        const size = options.size || 15;
        const gravity = options.gravity !== undefined ? options.gravity : 0.2;
        const lifeDecay = options.lifeDecay || 0.04;

        for (let i = 0; i < count; i++) {
            this.particles.push({
                x,
                y,
                vx: (Math.random() - 0.5) * speed * 2,
                vy: (Math.random() - 0.5) * speed * 2,
                color,
                size: typeof size === 'function' ? size() : (size * (0.8 + Math.random() * 0.4)),
                life: 1.0,
                gravity,
                lifeDecay
            });
        }
    }

    drawParticles() {
        const p = this.p;
        p.push();
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const part = this.particles[i];
            part.x += part.vx;
            part.y += part.vy;
            part.vy += part.gravity;
            part.life -= part.lifeDecay;

            if (part.life <= 0) {
                this.particles.splice(i, 1);
            } else {
                p.noStroke();
                p.fill(part.color);
                p.circle(part.x, part.y, Math.max(0, part.size * part.life));
            }
        }
        p.pop();
    }

    clearParticles() {
        this.particles = [];
    }

    updateUI() {
        if (!this.isDestroyed && this.ui) {
            this.ui.updateScoreboard(this.players);
        }
    }

    // --- UNIFIED INPUT PIPELINE ---

    handleInput(playerId, type, payload) {
        if (this.isDestroyed || this.state.phase !== 'PLAYING') return;

        const p = this.players.find(pl => pl.id === playerId);
        if (!p || p.isEliminated || p.isPermEliminated) return;
        
        if (this.config.turnBased) {
            const activeP = this.players[this.state.activePlayerIndex];
            if (activeP && activeP.id !== playerId) return;
        }

        const entity = this.getEntity(playerId);

        // Core Rotate-Tap Input Integration
        if (this.rotateTapEnabled && entity) {
            if (type === 'PRESS') {
                if (this.rotateTapConfig.reverseOnTap) {
                    entity.rotDir = (entity.rotDir === 1 ? -1 : 1);
                }
                entity.isBoosting = true;
            } else if (type === 'RELEASE') {
                entity.isBoosting = false;
            }
        }

        if (type === 'VECTOR' && payload) {
            p.inputVector = payload; 
            if (entity) entity.inputVector = payload;
        }
        else if (type === 'PRESS') {
            p.isClicking = true;
            p.clickSafetyTimer = 0;
            if (entity) entity.isPressing = true;
        }
        else if (type === 'RELEASE') {
            p.isClicking = false;
            if (entity) entity.isPressing = false;
        }

        this.onPlayerInput(p, type, payload, entity); 
    }

    simulateInput(playerIdentifier, action, payload = null) {
        let targetId = null;
        if (typeof playerIdentifier === 'number') {
            const byIdx = this.players[playerIdentifier];
            targetId = byIdx ? byIdx.id : playerIdentifier;
        } else if (typeof playerIdentifier === 'object' && playerIdentifier !== null) {
            targetId = playerIdentifier.id;
        } else {
            targetId = playerIdentifier;
        }

        this.handleInput(targetId, action, payload);
    }
    
    runDemoAI() {}

    // --- ROUND PROGRESSION ---

    startNewRound() {
        if (this.isDestroyed) return;

        this.clearAllTimeouts();
        this.state.phase = 'INTRO';
        
        if (this.mode === 'active' || this.mode === 'tournament') {
            this.state.round++;
        }
        
        this.state.isRoundActive = true;
        this.state.timer = this.config.roundDuration; 
        this.physicsAccumulator = 0;
        this.lastFrameTime = this.p.millis();
        this.clearParticles();
        
        this.players.forEach(p => {
            if (this.config.roundResetType === 'ELIMINATION' && p.isPermEliminated) {
                p.isEliminated = true;
                return;
            }
            p.lives = this.config.livesPerRound;
            p.isEliminated = false;
            p.statusType = (this.config.livesPerRound > 1) ? 'hearts' : 'score';
            p.customStatus = (this.config.livesPerRound > 1) ? p.lives : undefined;
            p.isClicking = false;
            p.inputVector = { x: 0, y: 0 };
        });

        // Initialize standardized player entity pool
        this.initEntities();

        if (this.config.turnBased) {
            this.validateTurn(true); 
        }

        if (this.config.roundResetType === 'ELIMINATION') {
            const survivors = this.players.filter(p => !p.isPermEliminated);
            if (survivors.length <= 1) {
                this.finishGame(); 
                return;
            }
        }
        
        this.updateUI();
        this.onRoundStart();

        if (this.mode !== 'demo') {
            const shouldWait = !this.config.autoStart && this.isFirstBoot;

            if (shouldWait) {
                this.state.phase = 'TUTORIAL';
                this.isFirstBoot = false;
            } else {
                window.dispatchEvent(new CustomEvent('game-state-change', { detail: 'PLAYING' }));
                const delay = 800;
                this.scheduleTimeout(() => {
                    this.state.phase = 'PLAYING';
                    this.lastFrameTime = this.p.millis();
                    this.physicsAccumulator = 0;
                }, delay);
            }
        } else {
            this.scheduleTimeout(() => {
                this.state.phase = 'PLAYING';
                this.lastFrameTime = this.p.millis();
                this.physicsAccumulator = 0;
            }, 100);
        }
    }

    nextTurn() {
        if (!this.config.turnBased || this.isDestroyed) return;
        let attempts = 0;
        const total = this.players.length;
        do {
            this.state.activePlayerIndex = (this.state.activePlayerIndex + 1) % total;
            attempts++;
        } while (
            (this.players[this.state.activePlayerIndex].isEliminated || 
             this.players[this.state.activePlayerIndex].isPermEliminated) && 
            attempts < total
        );
        this.updateTurnVisuals();
    }

    validateTurn(randomize = false) {
        const activePlayers = this.players.filter(p => !p.isEliminated && !p.isPermEliminated);
        if (activePlayers.length === 0) return;
        const current = this.players[this.state.activePlayerIndex];
        if (randomize || current.isEliminated || current.isPermEliminated) {
            const nextP = activePlayers[Math.floor(Math.random() * activePlayers.length)];
            this.state.activePlayerIndex = this.players.indexOf(nextP);
            this.updateTurnVisuals();
        }
    }

    updateTurnVisuals() {
        if (this.isDestroyed) return;
        const current = this.players[this.state.activePlayerIndex];
        if (!current) return;
        if (this.mode !== 'demo') this.ui.showTurnMessage(`${current.name}'s Turn!`, current.color);
        if (this.config.turnBasedBackgroundColor) this.targetBgColor = this.hexToRgb(current.color);
    }

    eliminatePlayer(playerIdx) {
        if (!this.state.isRoundActive || this.state.phase !== 'PLAYING' || this.isDestroyed) return;
        const p = this.players[playerIdx];
        if (!p || p.isEliminated) return;
        p.lives--;
        if (this.config.livesPerRound > 1) {
            p.customStatus = p.lives; 
            this.updateUI();
        }
        if (p.lives <= 0) {
            if (this.config.eliminateOnDeath) {
                p.isEliminated = true;
                if (this.config.roundResetType === 'ELIMINATION') {
                    p.isPermEliminated = true;
                    if (this.checkWinCondition()) {
                        this.scheduleTimeout(() => this.finishGame(), 1000);
                        return;
                    }
                }
                this.onPlayerEliminated(p);
            }
            this.checkRoundEnd();
        }
    }

    handleTimeUp() {
        const sorted = [...this.players].sort((a, b) => b.score - a.score);
        this.endRound(sorted[0]);
    }

    checkRoundEnd() {
        if (this.isDestroyed) return;
        const active = this.players.filter(p => !p.isEliminated);
        
        if (this.config.roundEndCriteria === 'SURVIVAL' && active.length <= 1) {
            this.endRound(active.length === 1 ? active[0] : null);
        } else if (this.config.roundEndCriteria === 'ALL_DEAD' && active.length === 0) {
            const sorted = [...this.players].sort((a, b) => b.score - a.score);
            this.endRound(sorted[0]); 
        }
    }

    endRound(roundWinner) {
        if (!this.state.isRoundActive || this.isDestroyed) return;
        this.state.isRoundActive = false;
        this.state.phase = 'ROUND_OVER';
        
        if (this.mode !== 'demo') {
            window.dispatchEvent(new CustomEvent('game-state-change', { detail: 'ROUND_OVER' }));
        }
        
        if (roundWinner && this.mode !== 'demo') {
            if (this.config.roundEndCriteria === 'SURVIVAL') {
                roundWinner.score++;
            }
            this.playSound('win');
        }

        this.updateUI();
        this.onRoundEnd(); 

        this.scheduleTimeout(() => {
            if (this.isDestroyed) return;
            
            if (this.checkWinCondition()) {
                this.finishGame();
            } else if (this.config.autoLoop) {
                if (this.mode !== 'demo' && this.config.showRoundResultUI) {
                    const title = roundWinner ? `${roundWinner.name} Wins!` : "Draw";
                    this.ui.showMessage(title, "Next Round", "Next", () => this.startNewRound());
                } else {
                    this.scheduleTimeout(() => this.startNewRound(), 2000);
                }
            }
        }, 500);
    }

    checkWinCondition() {
        if (this.mode === 'demo') return false; 
        const sorted = [...this.players].sort((a, b) => {
            return this.config.scoreSorting === 'ASC' ? a.score - b.score : b.score - a.score;
        });
        const leader = sorted[0];
        if (this.config.winCondition === 'SCORE' && leader.score >= this.config.winValue) {
            this.state.winner = leader;
            return true;
        }
        if (this.config.winCondition === 'ROUNDS' && this.state.round >= this.config.winValue) {
            this.state.winner = leader;
            return true;
        }
        if (this.config.winCondition === 'SURVIVAL') {
            const survivors = this.players.filter(p => !p.isPermEliminated);
            if (survivors.length <= 1) {
                this.state.winner = survivors[0] || leader;
                return true;
            }
        }
        if (this.config.winCondition === 'TIME') return true; 
        return false;
    }

    finishGame() {
        if (this.isDestroyed) return;
        this.state.phase = 'GAME_OVER';
        
        if (this.mode !== 'demo') {
            window.dispatchEvent(new CustomEvent('game-state-change', { detail: 'GAME_OVER' }));
        }

        if (this.audio && this.mode !== 'demo') this.audio.setTrack('victory');
        
        if (this.mode === 'tournament' && this.onGameComplete) {
            this.onGameComplete(this.players); 
        } else if (this.mode === 'active') {
            this.ui.showPodium(this.players, "Play Again", () => this.setup());
        } else {
            this.setup();
        }
    }

    destroy() {
        this.isDestroyed = true;
        this.clearAllTimeouts();
        this.onDestroy();

        // Safely cleans up both managed physics and legacy manual engine instances
        if (window.Matter && this.engine) {
            if (this.physicsEventHandlers.length > 0) {
                this.physicsEventHandlers.forEach(entry => {
                    window.Matter.Events.off(this.engine, entry.name, entry.handler);
                });
                this.physicsEventHandlers = [];
            }

            if (this.world) {
                window.Matter.Composite.clear(this.world, false, true);
            }
            window.Matter.Engine.clear(this.engine);
            this.engine = null;
            this.world = null;
        }
    }

    calculateLayout() {
        const w = this.p.width;
        const h = this.p.height;
        this.scaleFactor = Math.min(w / this.V_WIDTH, h / this.V_HEIGHT);
        this.transX = (w - (this.V_WIDTH * this.scaleFactor)) / 2;
        this.transY = (h - (this.V_HEIGHT * this.scaleFactor)) / 2;
    }

    hexToRgb(hex) {
        const bigint = parseInt(hex.replace('#', ''), 16);
        return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
    }

    shake(intensity, duration = 20) { this.shakeTimer = duration; }
    playSound(name) { if (this.audio && this.mode !== 'demo') this.audio.play(name); }

    // --- OVERRIDABLE LIFECYCLE HOOKS ---

    onSetup() {}
    initPlayerEntity(entity, player) {}
    onRoundStart() {}
    onFixedUpdate(dt) {}
    onRoundEnd() {}
    onPlayerEliminated(player) {}
    onPlayerInput(player, type, payload, entity) {} 
    onCollisionStart(pair, bodyA, bodyB, entityA, entityB) {}
    onCollisionEnd(pair, bodyA, bodyB, entityA, entityB) {}
    onDraw() {}
    onDestroy() {}
    getBgColor() { return '#FAF6F0'; }
}