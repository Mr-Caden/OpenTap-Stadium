/* src/games/BumperBall.js */

import BaseGame from "./BaseGame.js";

export default class BumperBall extends BaseGame {
    static get manifest() {
        return {
            id: "bumper-ball",
            title: "Bumper Ball",
            description: "Defend your net and blast the ball into rival goals!",
            tutorial: "Hold to boost forward! Defend your net and blast the ball into rival goals! Last player standing wins!",
            controllerType: "CONTROLLER",
            tournamentRules: {
                winValue: 1,
                livesPerRound: 1,
            },
        };
    }

    onSetup() {
        const count = this.players.length;

        // Single continuous elimination match: no rounds, last survivor standing wins the match
        this.config.winCondition = "SURVIVAL";
        this.config.roundResetType = "RESET_ALL";
        this.config.roundEndCriteria = "NONE";
        this.config.eliminateOnDeath = true;
        this.config.livesPerRound = 1;
        this.config.winValue = 1;
        this.config.autoLoop = false;
        this.config.showRoundResultUI = false;

        // Arena radius scales dynamically with player count (up to 10 players)
        this.ARENA_RADIUS = Math.round(450 + Math.min(10, Math.max(2, count)) * 16);
        this.BALL_RADIUS = 42;
        this.PLAYER_RADIUS = 36;
        this.POST_RADIUS = 22;

        // Standardized equal goal width across all player counts
        this.GOAL_WIDTH = 330;

        // Initialize managed physics
        this.enablePhysics({
            gravity: { x: 0, y: 0 },
            engineOptions: {
                positionIterations: 8,
                velocityIterations: 8,
            },
        });

        // Initialize engine-level rotate-tap movement (unidirectional rotation)
        this.enableRotateTapMovement({
            boostForce: 0.060,
            rotSpeed: 0.078,
            friction: 0.045,
            reverseOnTap: false,
        });

        this.goals = [];
        this.perimeterWallBodies = [];
        this.ballBody = null;
        this.kickoffTimer = 0;
        this.goalCooldown = 0;

        // Track last player who hit the ball to credit the scorer
        this.lastHitterId = null;
        this.lastHitterColor = "#FF5A36";
        this.lastHitterName = "Someone";

        // Rolling ball texture displacement
        this.ballRollX = 0;
        this.ballRollY = 0;

        // Drop-in animation state
        this.isBallDropping = false;
        this.ballDropHeight = 0;
        this.ballDropVelocity = 0;
        this.dropWaitTimer = 0;

        // Satisfying Goal Highlight State
        this.goalCelebration = null;
    }

    initPlayerEntity(entity, player) {
        const count = this.players.filter((p) => !p.isPermEliminated).length;
        const goalAngle = (Math.PI * 2 / Math.max(2, count)) * entity.index - Math.PI / 2;

        // Players spawn in front of their goal defending their net
        const spawnDist = this.ARENA_RADIUS * 0.60;
        const spawnX = this.CX + Math.cos(goalAngle) * spawnDist;
        const spawnY = this.CY + Math.sin(goalAngle) * spawnDist;

        entity.x = spawnX;
        entity.y = spawnY;
        entity.angle = goalAngle + Math.PI; // Face toward arena center
        entity.size = this.PLAYER_RADIUS * 2;
        entity.expression = "happy";
        entity.facing = 1;
        entity.goalAngle = goalAngle;

        const { Bodies } = window.Matter;
        const body = Bodies.circle(spawnX, spawnY, this.PLAYER_RADIUS, {
            restitution: 0.82,
            frictionAir: 0.045,
            density: 0.007,
            label: `player-${entity.id}`,
        });

        this.addPhysicsBody(body);
        entity.body = body;
    }

    onRoundStart() {
        this.buildArenaGoalPerimeter();
        this.isBallDropping = false;
        this.dropWaitTimer = 0;
        this.goalCelebration = null;
        this.lastHitterId = null;
        this.lastHitterColor = "#FF5A36";
        this.lastHitterName = "Someone";
        this.spawnSoccerBall();
        this.kickoffTimer = 60;
        this.goalCooldown = 0;
    }

    buildArenaGoalPerimeter() {
        // Clear all previous perimeter bodies from simulation
        this.perimeterWallBodies.forEach((b) => this.removePhysicsBody(b));
        this.perimeterWallBodies = [];

        const count = this.players.filter((p) => !p.isPermEliminated).length;
        const step = (Math.PI * 2) / Math.max(2, count);
        this.goals = [];

        // Equal angular width calculated from fixed linear width
        const fixedArcSpan = Math.min(step * 0.80, this.GOAL_WIDTH / this.ARENA_RADIUS);

        const { Bodies } = window.Matter;

        for (let i = 0; i < count; i++) {
            const angle = step * i - Math.PI / 2;
            const player = this.players[i];

            // Corner bumper posts between goals
            const cornerAngle = angle + step / 2;
            const px = this.CX + Math.cos(cornerAngle) * this.ARENA_RADIUS;
            const py = this.CY + Math.sin(cornerAngle) * this.ARENA_RADIUS;

            const post = Bodies.circle(px, py, this.POST_RADIUS, {
                isStatic: true,
                restitution: 1.0,
                friction: 0.02,
                label: "corner-post",
            });
            this.addPhysicsBody(post);
            this.perimeterWallBodies.push(post);

            // Construct physical static wall segment between goal edges and corner posts
            const halfGoalArc = fixedArcSpan / 2;
            const wallStartAngle = angle + halfGoalArc;
            const wallEndAngle = (angle + step) - halfGoalArc;
            const wallMidAngle = (wallStartAngle + wallEndAngle) / 2;
            const wallSpan = wallEndAngle - wallStartAngle;

            if (wallSpan > 0.05) {
                const wx = this.CX + Math.cos(wallMidAngle) * this.ARENA_RADIUS;
                const wy = this.CY + Math.sin(wallMidAngle) * this.ARENA_RADIUS;
                const wallLen = this.ARENA_RADIUS * wallSpan + 10;

                const wallSegment = Bodies.rectangle(wx, wy, wallLen, 34, {
                    isStatic: true,
                    restitution: 0.95,
                    friction: 0.02,
                    angle: wallMidAngle + Math.PI / 2,
                    label: "perimeter-cushion",
                });
                this.addPhysicsBody(wallSegment);
                this.perimeterWallBodies.push(wallSegment);
            }

            this.goals.push({
                index: i,
                playerId: player ? player.id : i,
                angle: angle,
                arcSpan: fixedArcSpan,
                isOpen: true,
                color: player ? player.color : "#FFFFFF",
                name: player ? player.name : `P${i + 1}`,
            });
        }
    }

    spawnSoccerBall() {
        if (this.ballBody) {
            this.removePhysicsBody(this.ballBody);
            this.ballBody = null;
        }

        const { Bodies, Body } = window.Matter;
        this.ballBody = Bodies.circle(this.CX, this.CY, this.BALL_RADIUS, {
            restitution: 0.86,  // Responsive and bouncy
            frictionAir: 0.016,  // Smooth glide without feeling like lead
            density: 0.007,      // Lightened mass for crisp strikes
            label: "soccer-ball",
        });

        // Small initial kickoff nudge
        const nudgeAngle = Math.random() * Math.PI * 2;
        Body.setVelocity(this.ballBody, {
            x: Math.cos(nudgeAngle) * 2.8,
            y: Math.sin(nudgeAngle) * 2.8,
        });

        this.addPhysicsBody(this.ballBody);
    }

    onFixedUpdate(dt) {
        if (this.kickoffTimer > 0) {
            this.kickoffTimer--;
        }
        if (this.goalCooldown > 0) {
            this.goalCooldown--;
        }

        const activeEntities = this.getActiveEntities();

        // 1. Constrain player avatars inside the stadium pitch
        const maxPlayerDist = this.ARENA_RADIUS - this.PLAYER_RADIUS - 6;
        activeEntities.forEach((ent) => {
            const dist = Math.hypot(ent.x - this.CX, ent.y - this.CY);
            if (dist > maxPlayerDist) {
                const angle = Math.atan2(ent.y - this.CY, ent.x - this.CX);
                ent.x = this.CX + Math.cos(angle) * maxPlayerDist;
                ent.y = this.CY + Math.sin(angle) * maxPlayerDist;

                if (ent.body && window.Matter) {
                    window.Matter.Body.setPosition(ent.body, { x: ent.x, y: ent.y });
                    const vx = ent.body.velocity.x;
                    const vy = ent.body.velocity.y;
                    const outwardVel = vx * Math.cos(angle) + vy * Math.sin(angle);
                    if (outwardVel > 0) {
                        window.Matter.Body.setVelocity(ent.body, {
                            x: vx - outwardVel * Math.cos(angle) * 1.5,
                            y: vy - outwardVel * Math.sin(angle) * 1.5,
                        });
                    }
                }
            }
        });

        // 2. Animate and update goal highlight celebration
        if (this.goalCelebration) {
            this.goalCelebration.timer--;
            this.goalCelebration.ringRadius += 9;
            this.goalCelebration.ringAlpha = Math.max(0, this.goalCelebration.timer / this.goalCelebration.maxTimer);

            if (this.goalCelebration.timer <= 0) {
                this.goalCelebration = null;
            }
        }

        // 3. Handle center drop-in animation sequence after a goal with countdown ready window
        if (this.isBallDropping) {
            if (this.dropWaitTimer > 0) {
                this.dropWaitTimer--;
            } else {
                this.ballDropVelocity += 1.35;
                this.ballDropHeight -= this.ballDropVelocity;

                if (this.ballDropHeight <= 0) {
                    this.ballDropHeight = 0;
                    this.isBallDropping = false;

                    // Landing impact without screen shake on pitch drop
                    this.playSound("bump");
                    this.spawnParticles(this.CX, this.CY, {
                        color: "#E8E1D5",
                        count: 16,
                        size: 14,
                        speed: 5,
                    });

                    this.spawnSoccerBall();
                    this.kickoffTimer = 45;
                }
            }
            return;
        }

        // Critical guard: if ball was scored and removed, do not execute ball physics this frame
        if (!this.ballBody) return;

        // 4. Track physical rolling texture displacement
        const vx = this.ballBody.velocity.x;
        const vy = this.ballBody.velocity.y;
        this.ballRollX += vx * 0.055;
        this.ballRollY += vy * 0.055;

        // 5. Check goal breaches and watertight boundary containment
        const bx = this.ballBody.position.x;
        const by = this.ballBody.position.y;
        const distFromCenter = Math.hypot(bx - this.CX, by - this.CY);
        const ballAngle = Math.atan2(by - this.CY, bx - this.CX);

        if (this.goalCooldown <= 0 && this.kickoffTimer <= 0) {
            this.checkGoalBreaches(distFromCenter, ballAngle);
        }

        // Verify ball still exists after breach check before running perimeter failsafe
        if (!this.ballBody || this.isBallDropping) return;

        // 6. Watertight Failsafe: Ball can NEVER escape into outer space
        const maxBallPerimeter = this.ARENA_RADIUS - this.BALL_RADIUS * 0.4;
        if (distFromCenter > maxBallPerimeter) {
            let insideOpenGoal = false;
            for (let i = 0; i < this.goals.length; i++) {
                const g = this.goals[i];
                if (!g.isOpen) continue;
                const diff = Math.abs(Math.atan2(Math.sin(ballAngle - g.angle), Math.cos(ballAngle - g.angle)));
                if (diff <= g.arcSpan / 2) {
                    insideOpenGoal = true;
                    break;
                }
            }

            // If not in an open goal, clamp and reflect velocity back inward (strictly no screen shake)
            if (!insideOpenGoal) {
                const safeDist = this.ARENA_RADIUS - this.BALL_RADIUS - 4;
                const clampedX = this.CX + Math.cos(ballAngle) * safeDist;
                const clampedY = this.CY + Math.sin(ballAngle) * safeDist;

                window.Matter.Body.setPosition(this.ballBody, { x: clampedX, y: clampedY });

                const bvx = this.ballBody.velocity.x;
                const bvy = this.ballBody.velocity.y;
                const outward = bvx * Math.cos(ballAngle) + bvy * Math.sin(ballAngle);
                if (outward > 0) {
                    window.Matter.Body.setVelocity(this.ballBody, {
                        x: (bvx - outward * Math.cos(ballAngle) * 1.8),
                        y: (bvy - outward * Math.sin(ballAngle) * 1.8),
                    });
                    this.playSound("bump");
                }
            }
        }

        // Particle sparks on hard-hit ball
        const speed = this.ballBody.speed;
        if (speed > 8 && this.p.frameCount % 4 === 0) {
            this.spawnParticles(this.ballBody.position.x, this.ballBody.position.y, {
                color: "#F59E0B",
                count: 1,
                size: 7,
                speed: 1,
                gravity: 0,
            });
        }
    }

    checkGoalBreaches(distFromCenter, ballAngle) {
        if (distFromCenter >= this.ARENA_RADIUS - 10) {
            for (let i = 0; i < this.goals.length; i++) {
                const goal = this.goals[i];
                if (!goal.isOpen) continue;

                const angleDiff = Math.abs(Math.atan2(
                    Math.sin(ballAngle - goal.angle),
                    Math.cos(ballAngle - goal.angle)
                ));

                if (angleDiff <= goal.arcSpan / 2) {
                    this.scoreGoal(goal);
                    break;
                }
            }
        }
    }

    scoreGoal(goal) {
        this.goalCooldown = 90;
        this.playSound("crash");
        this.shake(16, 28); // Major screen shake exclusively on scored goals

        goal.isOpen = false;

        // Origin of explosion is the exact entry point where the ball crossed the net line
        const entryX = this.ballBody ? this.ballBody.position.x : (this.CX + Math.cos(goal.angle) * this.ARENA_RADIUS);
        const entryY = this.ballBody ? this.ballBody.position.y : (this.CY + Math.sin(goal.angle) * this.ARENA_RADIUS);

        // Explode exclusively in the color of the player who scored
        const scorerColor = this.lastHitterColor || "#FF5A36";
        const scorerName = this.lastHitterName || "Someone";

        // Trigger satisfying arcade celebration animation at the entry point
        this.goalCelebration = {
            timer: 75,
            maxTimer: 75,
            scorerName: scorerName,
            scorerColor: scorerColor,
            victimName: goal.name,
            x: entryX,
            y: entryY,
            ringRadius: 30,
            ringAlpha: 1.0,
        };

        // Burst particles exclusively in the scoring player's color at the entry coordinates
        this.spawnParticles(entryX, entryY, {
            color: scorerColor,
            count: 42,
            size: 22,
            speed: 9,
        });

        // Safely remove ball body
        if (this.ballBody) {
            this.removePhysicsBody(this.ballBody);
            this.ballBody = null;
        }

        // Close this goal with a solid static bumper barrier in Matter.js
        const gx = this.CX + Math.cos(goal.angle) * this.ARENA_RADIUS;
        const gy = this.CY + Math.sin(goal.angle) * this.ARENA_RADIUS;

        const { Bodies } = window.Matter;
        const barrier = Bodies.rectangle(
            gx,
            gy,
            this.GOAL_WIDTH * 1.05,
            44,
            {
                isStatic: true,
                restitution: 1.0,
                friction: 0.02,
                angle: goal.angle + Math.PI / 2,
                label: "closed-goal-barrier",
            }
        );
        this.addPhysicsBody(barrier);
        this.perimeterWallBodies.push(barrier);

        // Immediately eliminate and remove the player who conceded from the pitch
        const victimEntity = this.getEntity(goal.playerId);
        if (victimEntity) {
            this.spawnParticles(victimEntity.x, victimEntity.y, {
                color: goal.color,
                count: 24,
                size: 16,
                speed: 6,
            });

            if (victimEntity.body) {
                this.removePhysicsBody(victimEntity.body);
                victimEntity.body = null;
            }

            this.eliminatePlayer(victimEntity.index);
        }

        // Reset scorer attribution for next rally
        this.lastHitterId = null;
        this.lastHitterColor = "#FF5A36";
        this.lastHitterName = "Someone";

        // Check if only 1 survivor remains
        const survivors = this.players.filter((p) => !p.isEliminated);
        if (survivors.length <= 1) {
            const winner = survivors[0] || null;
            if (winner) winner.score = 1;
            this.updateUI();

            // Conclude match directly with zero multi-round loops
            this.scheduleTimeout(() => {
                this.finishGame();
            }, 1600);
        } else {
            // Drop ball back into center after a generous ready-up delay (2.5 seconds)
            this.isBallDropping = true;
            this.dropWaitTimer = 150; // 2.5s pause allows players to reposition before drop-in
            this.ballDropHeight = 460;
            this.ballDropVelocity = 0;
        }
    }

    onCollisionStart(pair, bodyA, bodyB, entityA, entityB) {
        const isBallA = bodyA.label === "soccer-ball";
        const isBallB = bodyB.label === "soccer-ball";

        if (isBallA || isBallB) {
            // Soft audio bump without screen shake on wall/post collisions
            this.playSound("bump");

            const ball = isBallA ? bodyA : bodyB;
            const ent = entityA || entityB;

            // Credit the last player who made contact with the ball
            if (ent && ent.player) {
                this.lastHitterId = ent.player.id;
                this.lastHitterColor = ent.player.color;
                this.lastHitterName = ent.player.name;
            }

            // Responsive strike impulse
            if (ent && ent.isBoosting) {
                const boostX = Math.cos(ent.angle) * 11.5;
                const boostY = Math.sin(ent.angle) * 11.5;
                window.Matter.Body.setVelocity(ball, {
                    x: ball.velocity.x * 0.5 + boostX,
                    y: ball.velocity.y * 0.5 + boostY,
                });
                this.playSound("jump");
            }

            const midX = (bodyA.position.x + bodyB.position.x) / 2;
            const midY = (bodyA.position.y + bodyB.position.y) / 2;
            this.spawnParticles(midX, midY, {
                color: "#F59E0B",
                count: 5,
                size: 7,
                speed: 3,
            });
        } else if (entityA && entityB) {
            // Player-to-player impact without screen shake
            this.playSound("bump");
        }
    }

    runDemoAI() {
        if (!this.ballBody || this.kickoffTimer > 0 || this.isBallDropping) return;

        const activeEntities = this.getActiveEntities();
        const bx = this.ballBody.position.x;
        const by = this.ballBody.position.y;

        activeEntities.forEach((bot) => {
            const goalAngle = bot.goalAngle;

            // 1. Calculate defensive vector between ball and bot's net
            const netX = this.CX + Math.cos(goalAngle) * this.ARENA_RADIUS;
            const netY = this.CY + Math.sin(goalAngle) * this.ARENA_RADIUS;

            const distBallToNet = Math.hypot(bx - netX, by - netY);

            let targetX = bx;
            let targetY = by;

            if (distBallToNet < this.ARENA_RADIUS * 0.65) {
                // Intercept ball along the goal line
                targetX = (bx + netX) / 2;
                targetY = (by + netY) / 2;
            } else {
                // Find an active open rival goal to attack
                const openRivalGoals = this.goals.filter((g) => g.isOpen && g.playerId !== bot.id);
                if (openRivalGoals.length > 0) {
                    const targetGoal = openRivalGoals[bot.index % openRivalGoals.length];
                    const tgX = this.CX + Math.cos(targetGoal.angle) * this.ARENA_RADIUS;
                    const tgY = this.CY + Math.sin(targetGoal.angle) * this.ARENA_RADIUS;

                    // Position bot behind the ball relative to target goal
                    const attackAngle = Math.atan2(tgY - by, tgX - bx);
                    targetX = bx - Math.cos(attackAngle) * 50;
                    targetY = by - Math.sin(attackAngle) * 50;
                }
            }

            // Steer toward target position
            const desiredAngle = Math.atan2(targetY - bot.y, targetX - bot.x);
            const angleDiff = Math.atan2(Math.sin(desiredAngle - bot.angle), Math.cos(desiredAngle - bot.angle));

            if (Math.abs(angleDiff) < 0.35) {
                if (!bot.isBoosting) this.simulateInput(bot.id, "PRESS");
            } else if (bot.isBoosting && Math.abs(angleDiff) > 0.6) {
                this.simulateInput(bot.id, "RELEASE");
            }
        });
    }

    onDraw() {
        this.drawStadium();
        this.drawGoals();
        this.drawSoccerBall();
        this.drawRotateTapArrows({ distance: this.PLAYER_RADIUS + 22, size: 10 });
        this.drawPlayers();
        this.drawGoalCelebrationOverlay();
        this.drawParticles();
    }

    drawStadium() {
        const p = this.p;

        p.noStroke();
        p.fill(245, 240, 232);
        p.rect(0, 0, this.V_WIDTH, this.V_HEIGHT);

        // Circular pitch floor
        p.fill("#FAF6F0");
        p.stroke("#211B18");
        p.strokeWeight(10);
        p.circle(this.CX, this.CY, this.ARENA_RADIUS * 2);

        // Pitch center circle & kickoff dot
        p.noFill();
        p.stroke("#E8E1D5");
        p.strokeWeight(4);
        p.circle(this.CX, this.CY, 180);
        p.fill("#FF5A36");
        p.noStroke();
        p.circle(this.CX, this.CY, 14);

        // Visual Countdown & Ready indicator during the post-goal pause
        if (this.isBallDropping && this.dropWaitTimer > 0) {
            const secondsLeft = Math.max(1, Math.ceil(this.dropWaitTimer / 60));
            p.fill("#2D2522");
            p.textAlign(p.CENTER, p.CENTER);
            p.textStyle(p.BOLD);
            p.textSize(18);
            p.text("GET READY", this.CX, this.CY - 34);
            p.textSize(36);
            p.fill("#FF5A36");
            p.text(secondsLeft, this.CX, this.CY + 6);
        }
    }

    drawGoals() {
        const p = this.p;
        const R = this.ARENA_RADIUS;

        for (let i = 0; i < this.goals.length; i++) {
            const g = this.goals[i];
            const startA = g.angle - g.arcSpan / 2;
            const endA = g.angle + g.arcSpan / 2;

            if (g.isOpen) {
                // Rounded goalie box contained 100% inside the stadium
                this.drawContainedGoalieBox(g, startA, endA);

                // Open goal line arc in player's color
                p.noFill();
                p.stroke(g.color);
                p.strokeWeight(9);
                p.arc(this.CX, this.CY, R * 2, R * 2, startA, endA);

                // Goal depth pocket
                p.stroke(g.color);
                p.strokeWeight(3.5);
                p.arc(this.CX, this.CY, (R + 24) * 2, (R + 24) * 2, startA, endA);

                // Player name label in bold player color with NO outline
                const labelX = this.CX + Math.cos(g.angle) * (R + 46);
                const labelY = this.CY + Math.sin(g.angle) * (R + 46);

                p.noStroke();
                p.fill(g.color);
                p.textSize(28);
                p.textStyle(p.BOLD);
                p.textAlign(p.CENTER, p.CENTER);
                p.text(g.name, labelX, labelY);
            } else {
                // Closed barricade on eliminated player's goal
                p.noFill();
                p.stroke("#7A6F68");
                p.strokeWeight(14);
                p.arc(this.CX, this.CY, R * 2, R * 2, startA, endA);

                // Hazard warning hatch
                p.stroke("#211B18");
                p.strokeWeight(4);
                p.arc(this.CX, this.CY, (R - 6) * 2, (R - 6) * 2, startA, endA);
            }
        }

        // Corner bumper posts between goal sectors
        const count = this.goals.length;
        const step = (Math.PI * 2) / count;
        for (let i = 0; i < count; i++) {
            const cornerAngle = step * i - Math.PI / 2 + step / 2;
            const px = this.CX + Math.cos(cornerAngle) * R;
            const py = this.CY + Math.sin(cornerAngle) * R;

            p.fill("#211B18");
            p.stroke("#E8E1D5");
            p.strokeWeight(3);
            p.circle(px, py, this.POST_RADIUS * 2);

            p.fill("#FF5A36");
            p.noStroke();
            p.circle(px, py, this.POST_RADIUS * 0.8);
        }
    }

    drawContainedGoalieBox(g, startA, endA) {
        const p = this.p;
        const R = this.ARENA_RADIUS;
        const innerRadius = R - 120;
        const steps = 18;

        const col = p.color(g.color);
        p.fill(p.red(col), p.green(col), p.blue(col), 50);
        p.stroke(g.color);
        p.strokeWeight(3.5);

        p.beginShape();

        // 1. Outer arc along the stadium perimeter (never exceeds R)
        for (let s = 0; s <= steps; s++) {
            const a = p.lerp(startA, endA, s / steps);
            p.vertex(this.CX + Math.cos(a) * R, this.CY + Math.sin(a) * R);
        }

        // 2. Inner rounded arc bulging gently toward the pitch center
        for (let s = steps; s >= 0; s--) {
            const a = p.lerp(startA, endA, s / steps);
            const centerBulge = Math.sin((s / steps) * Math.PI) * 20;
            const currentR = innerRadius - centerBulge;
            p.vertex(this.CX + Math.cos(a) * currentR, this.CY + Math.sin(a) * currentR);
        }

        p.endShape(p.CLOSE);
    }

    drawSoccerBall() {
        const p = this.p;
        const r = this.BALL_RADIUS;

        // 1. Draw dropping ball sequence
        if (this.isBallDropping) {
            if (this.dropWaitTimer > 0) return;

            const progress = Math.max(0, this.ballDropHeight / 460);
            const scale = 1.0 + progress * 1.5;
            const shadowScale = Math.max(0.2, 1.0 - progress * 0.8);

            // Ground shadow expands as the ball descends
            this.drawShadow(this.CX, this.CY + 8, r * 2 * shadowScale, r * 1.3 * shadowScale, 40);

            p.push();
            p.translate(this.CX, this.CY - this.ballDropHeight);
            p.scale(scale);
            this.renderRollingBallTexture(r, 0, 0);
            p.pop();
            return;
        }

        if (!this.ballBody) return;

        // 2. Draw active rolling soccer ball
        const bx = this.ballBody.position.x;
        const by = this.ballBody.position.y;

        // Ground shadow
        this.drawShadow(bx, by + 8, r * 2, r * 1.3, 35);

        p.push();
        p.translate(bx, by);
        p.rotate(this.ballBody.angle);
        this.renderRollingBallTexture(r, this.ballRollX, this.ballRollY);
        p.pop();
    }

    renderRollingBallTexture(r, rollX, rollY) {
        const p = this.p;

        // Ball leather base
        p.fill("#FFFFFF");
        p.stroke("#211B18");
        p.strokeWeight(3.5);
        p.circle(0, 0, r * 2);

        // Clip rolling surface texture inside the sphere boundary
        p.push();
        p.drawingContext.save();
        p.drawingContext.beginPath();
        p.drawingContext.arc(0, 0, r - 2, 0, Math.PI * 2);
        p.drawingContext.clip();

        // 3D rolling texture patches moving across the sphere surface
        const offsetX = (rollX * 35) % 48;
        const offsetY = (rollY * 35) % 48;

        p.noStroke();
        p.fill("#211B18");

        for (let x = -r - 48; x <= r + 48; x += 44) {
            for (let y = -r - 48; y <= r + 48; y += 44) {
                const px = x + offsetX;
                const py = y + offsetY;
                p.circle(px, py, 13);
            }
        }

        // Rolling curved latitude & longitude seam ribs
        p.noFill();
        p.stroke("#D8D1C7");
        p.strokeWeight(2.5);
        p.ellipse(offsetX * 0.5, 0, r * 1.4, r * 1.8);
        p.ellipse(0, offsetY * 0.5, r * 1.8, r * 1.4);

        // Fixed spherical shading & specular lighting for a tactile 3D finish
        p.noStroke();
        p.fill(33, 27, 24, 45);
        p.circle(r * 0.2, r * 0.2, r * 1.85);

        p.fill(255, 255, 255, 140);
        p.circle(-r * 0.35, -r * 0.35, r * 0.75);

        p.drawingContext.restore();
        p.pop();
    }

    drawGoalCelebrationOverlay() {
        if (!this.goalCelebration) return;
        const p = this.p;
        const c = this.goalCelebration;

        p.push();

        // 1. Expanding shockwave ring at exact ball breach location in scorer's color
        p.noFill();
        const shockColor = p.color(c.scorerColor);
        p.stroke(p.red(shockColor), p.green(shockColor), p.blue(shockColor), Math.round(c.ringAlpha * 220));
        p.strokeWeight(6);
        p.circle(c.x, c.y, c.ringRadius * 2);

        // 2. High-energy arcade "GOAL!" typography in stadium center (no dark box plate)
        p.translate(this.CX, this.CY);
        const progress = 1 - (c.timer / c.maxTimer);
        const bannerScale = progress < 0.2 ? p.map(progress, 0, 0.2, 2.2, 1.0) : 1.0;
        p.scale(bannerScale);

        p.noStroke();
        p.textAlign(p.CENTER, p.CENTER);
        p.textStyle(p.BOLD);

        // Clean typography floating with contrast directly above the field
        p.fill(c.scorerColor);
        p.textSize(64);
        p.text("GOAL!", 0, -18);

        p.fill("#211B18");
        p.textSize(24);
        p.text(`${c.victimName.toUpperCase()} ELIMINATED!`, 0, 28);

        p.pop();
    }

    drawPlayers() {
        const p = this.p;
        // Only draw currently living players on the pitch
        const activeEntities = this.getActiveEntities();

        activeEntities.forEach((ent) => {
            // Clean, soft transparent shadow
            this.drawShadow(ent.x, ent.y + 24, 60, 22, 35);

            // Avatar stays upright facing forward/upwards at all times
            this.drawAvatar(ent.player, ent.x, ent.y, {
                size: 88,
                anim: ent.anim,
                expression: ent.expression,
                facing: 1,
                rotation: 0,
                shadow: false,
            });
        });
    }
}