/* src/core/AvatarSystem.js */

export default class AvatarSystem {
    constructor(p5) {
        this.p = p5;
    }

    static get ACCESSORIES() {
        return [
            'Bear Ears', 'Cat Ears', 'Bunny Ears', 'Devil Horns',
            'Fox Ears', 'Puppy Ears', 'Bow', 'Sprout', 'Halo', 'Headphones'
        ];
    }

    applyTransform(type, startTime = 0) {
        const p = this.p;
        const t = p.millis();

        if (type === 'IDLE') {
            const breath = p.sin(t * 0.003) * 0.03;
            p.scale(1 + breath, 1 - breath);
        }
        else if (type === 'RUN') {
            const waddleSpeed = 0.015;
            const angle = p.sin(t * waddleSpeed) * 0.15;
            const bob = p.abs(p.sin(t * waddleSpeed)) * 10;
            p.translate(0, -bob);
            p.rotate(angle);
        }
        else if (type === 'JUMP') {
            // Smooth, deterministic 750ms parabolic jump curve from start timestamp
            const jumpDuration = 750;
            const elapsed = startTime > 0 ? Math.min(jumpDuration, t - startTime) : (t % 1000);
            const progress = elapsed / jumpDuration;

            if (progress < 0.18) {
                const squash = p.map(progress, 0, 0.18, 0, 0.18);
                p.scale(1 + squash, 1 - squash);
            } else if (progress < 0.82) {
                const airProgress = p.map(progress, 0.18, 0.82, 0, p.PI);
                const height = p.sin(airProgress) * 38;
                p.translate(0, -height);
                p.scale(0.95, 1.05);
            } else {
                const squash = p.map(progress, 0.82, 1.0, 0.18, 0);
                p.scale(1 + squash, 1 - squash);
            }
        }
        else if (type === 'ATTACK') { 
            const attackDuration = 450;
            const elapsed = startTime > 0 ? Math.min(attackDuration, t - startTime) : (t % 300);
            const cycle = elapsed / attackDuration;
            let angle = 0;
            let thrust = 0;
            
            if (cycle < 0.3) {
                angle = p.map(cycle, 0, 0.3, 0, -0.28);
            } else if (cycle < 0.6) {
                angle = p.map(cycle, 0.3, 0.6, -0.28, 0.38);
                thrust = p.map(cycle, 0.3, 0.6, 0, 18);
            } else {
                angle = p.map(cycle, 0.6, 1, 0.38, 0);
                thrust = p.map(cycle, 0.6, 1, 18, 0);
            }
            
            p.translate(thrust, 0);
            p.rotate(angle);
        }
        else if (type === 'DUCK') {
            p.translate(0, 14);
            p.scale(1.22, 0.72);
        }
        else if (type === 'ROLL') {
            const rollDuration = 650;
            const elapsed = startTime > 0 ? Math.min(rollDuration, t - startTime) : t;
            const progress = elapsed / rollDuration;
            p.rotate(progress * p.TWO_PI);
        }
        else if (type === 'DIZZY') {
            p.translate(p.random(-3, 3), p.random(-3, 3));
        }
        else if (type === 'WIN') {
            const bounceHeight = p.abs(p.sin(t * 0.008)) * 24;
            p.translate(0, -bounceHeight);
            const stretch = p.map(bounceHeight, 0, 24, 0, 0.08);
            p.scale(1 - stretch, 1 + stretch);
        }
        else if (type === 'LOSE') {
            const loseDuration = 2000;
            const progress = (t % loseDuration) / loseDuration;
            const s = p.map(progress, 0, 0.8, 1, 0);
            const scaleVal = p.constrain(s, 0, 1);
            p.rotate(progress * 10);
            p.scale(scaleVal, scaleVal);
        }
    }

    draw(ctx) {
        const { p } = this;
        const { x, y, size, color, variant = 'default', accessory, expression = 'idle', facing = 1 } = ctx;
        const r = size / 2;
        const darkColor = this._shadeColor(color, -20);

        p.push();
        p.translate(x, y);

        if (facing === -1) p.scale(-1, 1);

        // 1. BACK ACCESSORY
        this._drawAccessoryBack(accessory, color, darkColor, r);

        // 2. BODY
        p.noStroke();
        p.fill(color);
        p.circle(0, 0, size);

        // 3. FACE
        this._drawFace(r, expression, variant, color);

        // 4. BLUSH
        p.fill(0, 0, 0, 15);
        p.noStroke();
        p.ellipse(-r * 0.55, r * 0.15, size * 0.1, size * 0.06);
        p.ellipse(r * 0.55, r * 0.15, size * 0.1, size * 0.06);

        // 5. FRONT ACCESSORY
        this._drawAccessoryFront(accessory, color, darkColor, r);

        p.pop();
    }

    _drawFace(r, exp, variant, skinColor) {
        const { p } = this;
        const size = r * 2;
        const s = size / 100;
        const eyeY = r * 0.05;
        const eyeX = r * 0.35;
        const eyeW = size * 0.12;
        const eyeH = size * 0.15;
        const isBlinking = (p.frameCount % 180 < 10);

        // MOUTH
        p.noFill(); 
        p.stroke(50); 
        p.strokeWeight(Math.max(1, 2.8 * s)); 
        p.strokeCap(p.ROUND);
        const mouthY = r * 0.35;

        if (exp === 'happy') p.arc(0, mouthY, 18 * s, 12 * s, 0, p.PI);
        else if (exp === 'angry') p.line(-6 * s, mouthY + 4 * s, 6 * s, mouthY + 4 * s);
        else if (exp === 'sad') p.arc(0, mouthY + 6 * s, 14 * s, 7 * s, p.PI, 0);
        else if (exp === 'stunned') p.ellipse(0, mouthY + 4 * s, 8 * s, 10 * s);
        else p.arc(0, mouthY, 10 * s, 6 * s, 0, p.PI);

        // EYELASHES (Proportionally offset)
        if (variant === 'feminine') {
            p.fill(50); 
            p.noStroke();
            if (exp === 'angry') {
                p.push(); p.translate(-eyeX, eyeY); this._drawLashTri(-eyeW / 2, -eyeH / 4, true, r); p.pop();
                p.push(); p.translate(eyeX, eyeY); this._drawLashTri(eyeW / 2, -eyeH / 4, false, r); p.pop();
            }
            else if (exp === 'sad') {
                p.push(); p.translate(-eyeX, eyeY); p.rotate(-p.PI / 6); this._drawLashTri(-eyeW / 2, 0, true, r); p.pop();
                p.push(); p.translate(eyeX, eyeY); p.rotate(p.PI / 6); this._drawLashTri(eyeW / 2, 0, false, r); p.pop();
            }
            else if (exp === 'stunned') {
                this._drawLashTri(-eyeX - eyeW * 0.3, eyeY, true, r);
                this._drawLashTri(eyeX + eyeW * 0.3, eyeY, false, r);
            }
            else {
                const lashOffset = r * 0.02;
                this._drawLashTri(-eyeX - eyeW / 2 + lashOffset, eyeY, true, r);
                this._drawLashTri(eyeX + eyeW / 2 + lashOffset, eyeY, false, r);
            }
        }

        // EYES
        p.noStroke(); 
        p.fill(50);

        if (exp === 'happy') {
            p.noFill(); 
            p.stroke(50); 
            p.strokeWeight(Math.max(1.2, 4.2 * s)); 
            p.strokeCap(p.ROUND); 
            p.strokeJoin(p.MITER);
            p.beginShape(); p.vertex(-eyeX - eyeW / 2, eyeY); p.vertex(-eyeX, eyeY - eyeH / 2); p.vertex(-eyeX + eyeW / 2, eyeY); p.endShape();
            p.beginShape(); p.vertex(eyeX - eyeW / 2, eyeY); p.vertex(eyeX, eyeY - eyeH / 2); p.vertex(eyeX + eyeW / 2, eyeY); p.endShape();

            if (variant === 'feminine') {
                p.noStroke(); 
                p.fill(50);
                this._drawLashTri(-eyeX - eyeW / 2, eyeY, true, r);
                this._drawLashTri(eyeX + eyeW / 2, eyeY, false, r);
            }
            return;
        }

        p.rectMode(p.CENTER);
        if (exp === 'stunned') {
            p.circle(-eyeX, eyeY, eyeW * 0.6); 
            p.circle(eyeX, eyeY, eyeW * 0.6);
        } else {
            p.rect(-eyeX, eyeY, eyeW, eyeH, Math.max(1, 4 * s)); 
            p.rect(eyeX, eyeY, eyeW, eyeH, Math.max(1, 4 * s));
            if (!isBlinking) {
                p.fill(255);
                const hSize = eyeW * 0.35;
                p.rect(-eyeX - eyeW * 0.2, eyeY - eyeH * 0.2, hSize, hSize, 1);
                p.rect(eyeX - eyeW * 0.2, eyeY - eyeH * 0.2, hSize, hSize, 1);
            }
        }

        // EYE MASKS & BROWS
        p.fill(skinColor); 
        p.noStroke();

        if (isBlinking) {
            p.rect(-eyeX, eyeY, eyeW + 2, eyeH + 2); 
            p.rect(eyeX, eyeY, eyeW + 2, eyeH + 2);
            p.stroke(50); 
            p.strokeWeight(Math.max(1, 3.5 * s));
            p.line(-eyeX - eyeW / 2, eyeY, -eyeX + eyeW / 2, eyeY);
            p.line(eyeX - eyeW / 2, eyeY, eyeX + eyeW / 2, eyeY);
            if (variant === 'feminine') {
                p.noStroke(); 
                p.fill(50);
                const lashOffset = r * 0.02;
                this._drawLashTri(-eyeX - eyeW / 2 + lashOffset, eyeY, true, r);
                this._drawLashTri(eyeX + eyeW / 2 + lashOffset, eyeY, false, r);
            }
            return;
        }

        if (exp === 'angry') {
            p.push(); p.translate(-eyeX, eyeY); p.rotate(p.PI / 5); p.rect(0, -eyeH * 0.8, eyeW * 1.5, eyeH); p.pop();
            p.push(); p.translate(eyeX, eyeY); p.rotate(-p.PI / 5); p.rect(0, -eyeH * 0.8, eyeW * 1.5, eyeH); p.pop();
        }
        else if (exp === 'sad') {
            p.push(); p.translate(-eyeX, eyeY); p.rotate(-p.PI / 6); p.rect(0, -eyeH * 0.8, eyeW * 1.5, eyeH); p.pop();
            p.push(); p.translate(eyeX, eyeY); p.rotate(p.PI / 6); p.rect(0, -eyeH * 0.8, eyeW * 1.5, eyeH); p.pop();
        }
    }

    _drawLashTri(x, y, isLeft, r) {
        const { p } = this;
        // Fully normalized triangle geometry matching head radius
        const w = r * 0.16;
        const h = r * 0.16;
        const dx1 = r * 0.04;
        const dy1 = r * 0.04;
        const dx2 = r * 0.12;
        const dy2 = r * 0.04;

        if (isLeft) {
            p.triangle(x + dx1, y + dy1, x - w, y - h, x + dx2, y - dy2);
        } else {
            p.triangle(x - dx1, y + dy1, x + w, y - h, x - dx2, y - dy2);
        }
    }

    _drawAccessoryBack(type, color, darkColor, r) {
        const { p } = this;
        const s = (r * 2) / 100;
        p.fill(color); 
        p.stroke(darkColor); 
        p.strokeWeight(Math.max(1, 2.5 * s)); 
        p.strokeJoin(p.ROUND);

        if (type === 'Cat Ears') { 
            p.triangle(-r * 0.9, -r * 0.3, -r * 0.4, -r * 0.9, -r * 0.9, -r * 0.95); 
            p.triangle(r * 0.9, -r * 0.3, r * 0.4, -r * 0.9, r * 0.9, -r * 0.95); 
        }
        else if (type === 'Bear Ears') { 
            p.circle(-r * 0.8, -r * 0.7, r * 0.6); 
            p.circle(r * 0.8, -r * 0.7, r * 0.6); 
            p.noStroke(); 
            p.fill(darkColor); 
            p.circle(-r * 0.8, -r * 0.7, r * 0.25); 
            p.circle(r * 0.8, -r * 0.7, r * 0.25); 
        }
        else if (type === 'Bunny Ears') { 
            p.push(); 
            p.translate(0, -r * 0.3); 
            p.rotate(-0.2); 
            p.ellipse(-r * 0.4, -r * 0.8, r * 0.5, r * 1.4); 
            p.rotate(0.4); 
            p.ellipse(r * 0.4, -r * 0.8, r * 0.5, r * 1.4); 
            p.pop(); 
        }
        else if (type === 'Fox Ears') { 
            p.triangle(-r * 0.8, -r * 0.4, -r * 0.3, -r * 0.8, -r * 0.9, -r * 1.2); 
            p.triangle(r * 0.8, -r * 0.4, r * 0.3, -r * 0.8, r * 0.9, -r * 1.2); 
            p.noStroke(); 
            p.fill(255, 200); 
            p.triangle(-r * 0.75, -r * 0.5, -r * 0.4, -r * 0.8, -r * 0.8, -r * 1.0); 
            p.triangle(r * 0.75, -r * 0.5, r * 0.4, -r * 0.8, r * 0.8, -r * 1.0); 
        }
        else if (type === 'Puppy Ears') { 
            p.fill(color); 
            p.stroke(darkColor); 
            p.strokeWeight(Math.max(1, 2.5 * s)); 
            p.ellipse(-r * 0.9, r * 0.1, r * 0.7, r * 1.2); 
            p.ellipse(r * 0.9, r * 0.1, r * 0.7, r * 1.2); 
        }
        else if (type === 'Devil Horns') { 
            p.fill(darkColor); 
            p.triangle(-r * 0.5, -r * 0.6, -r * 0.2, -r * 0.8, -r * 0.4, -r * 1.0); 
            p.triangle(r * 0.5, -r * 0.6, r * 0.2, -r * 0.8, r * 0.4, -r * 1.0); 
        }
        else if (type === 'Headphones') { 
            p.noFill(); 
            p.stroke(50); 
            p.strokeWeight(Math.max(1.8, 6.5 * s)); 
            p.arc(0, 0, r * 2.2, r * 2.2, p.PI, 0); 
        }
    }

    _drawAccessoryFront(type, color, darkColor, r) {
        const { p } = this;
        const s = (r * 2) / 100;

        if (type === 'Bow') { 
            p.fill(darkColor); 
            p.stroke(255); 
            p.strokeWeight(Math.max(1, 1.8 * s)); 
            p.push(); 
            p.translate(0, -r * 0.95); 
            p.triangle(0, 0, -20 * s, -15 * s, -20 * s, 15 * s); 
            p.triangle(0, 0, 20 * s, -15 * s, 20 * s, 15 * s); 
            p.circle(0, 0, 10 * s); 
            p.pop(); 
        }
        else if (type === 'Sprout') { 
            p.noFill(); 
            p.stroke('#2ecc71'); 
            p.strokeWeight(Math.max(1, 3.2 * s)); 
            p.strokeCap(p.ROUND); 
            p.line(0, -r, 0, -r - 15 * s); 
            p.fill('#2ecc71'); 
            p.noStroke(); 
            p.ellipse(10 * s, -r - 15 * s, 18 * s, 10 * s); 
            p.ellipse(-8 * s, -r - 12 * s, 12 * s, 8 * s); 
        }
        else if (type === 'Halo') { 
            p.noFill(); 
            p.stroke('#FFD700'); 
            p.strokeWeight(Math.max(1.5, 4.2 * s)); 
            p.ellipse(0, -r * 1.1, r * 1.2, r * 0.35); 
        }
        else if (type === 'Headphones') { 
            p.fill(50); 
            p.stroke(255); 
            p.strokeWeight(Math.max(1, 1.8 * s)); 
            p.rectMode(p.CENTER); 
            p.rect(-r, 0, r * 0.4, r * 0.8, Math.max(1, 4 * s)); 
            p.rect(r, 0, r * 0.4, r * 0.8, Math.max(1, 4 * s)); 
            p.fill(color); 
            p.noStroke(); 
            p.circle(-r, 0, r * 0.15); 
            p.circle(r, 0, r * 0.15); 
        }
    }

    _shadeColor(color, percent) {
        let R = parseInt(color.substring(1, 3), 16); 
        let G = parseInt(color.substring(3, 5), 16); 
        let B = parseInt(color.substring(5, 7), 16);
        R = parseInt(R * (100 + percent) / 100); 
        G = parseInt(G * (100 + percent) / 100); 
        B = parseInt(B * (100 + percent) / 100);
        R = (R < 255) ? R : 255; 
        G = (G < 255) ? G : 255; 
        B = (B < 255) ? B : 255;
        const RR = ((R.toString(16).length === 1) ? "0" + R.toString(16) : R.toString(16));
        const GG = ((G.toString(16).length === 1) ? "0" + G.toString(16) : G.toString(16));
        const BB = ((B.toString(16).length === 1) ? "0" + B.toString(16) : B.toString(16));
        return "#" + RR + GG + BB;
    }
}