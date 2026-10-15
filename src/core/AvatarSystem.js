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

    applyTransform(type) {
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
            const jumpDuration = 1000;
            const progress = (t % jumpDuration) / jumpDuration;
            if (progress < 0.2) {
                const squash = p.map(progress, 0, 0.2, 0, 0.2);
                p.scale(1 + squash, 1 - squash);
            } else if (progress < 0.8) {
                const airProgress = p.map(progress, 0.2, 0.8, 0, p.PI);
                const height = p.sin(airProgress) * 60;
                p.translate(0, -height);
                p.scale(0.9, 1.1);
            } else {
                const squash = p.map(progress, 0.8, 1.0, 0.2, 0);
                p.scale(1 + squash, 1 - squash);
            }
        }
        else if (type === 'ATTACK') { 
            // Fast chopping motion (3 times per second)
            const cycle = (t % 300) / 300; 
            let angle = 0;
            let thrust = 0;
            
            // Wind up
            if (cycle < 0.3) {
                angle = p.map(cycle, 0, 0.3, 0, -0.3); // Lean back
            } 
            // Strike
            else if (cycle < 0.6) {
                angle = p.map(cycle, 0.3, 0.6, -0.3, 0.4); // Chop forward
                thrust = p.map(cycle, 0.3, 0.6, 0, 20);
            } 
            // Return
            else {
                angle = p.map(cycle, 0.6, 1, 0.4, 0);
                thrust = p.map(cycle, 0.6, 1, 20, 0);
            }
            
            p.translate(thrust, 0);
            p.rotate(angle);
        }
        else if (type === 'DUCK') {
            const pulse = p.sin(t * 0.01) * 0.02;
            p.translate(0, 20);
            p.scale(1.3 + pulse, 0.6 - pulse);
        }
        else if (type === 'ROLL') {
            p.rotate(t * 0.01);
        }
        else if (type === 'DIZZY') {
            p.translate(p.random(-3, 3), p.random(-3, 3));
        }
        else if (type === 'WIN') {
            const bounceHeight = p.abs(p.sin(t * 0.01)) * 30;
            p.translate(0, -bounceHeight);
            const stretch = p.map(bounceHeight, 0, 30, 0, 0.1);
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

        // 1. BACK
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

        // 5. FRONT
        this._drawAccessoryFront(accessory, color, darkColor, r);

        p.pop();
    }

    _drawFace(r, exp, variant, skinColor) {
        const { p } = this;
        const size = r * 2;
        const eyeY = r * 0.05;
        const eyeX = r * 0.35;
        const eyeW = size * 0.12;
        const eyeH = size * 0.15;
        const isBlinking = (p.frameCount % 180 < 10);

        // MOUTH
        p.noFill(); p.stroke(50); p.strokeWeight(3); p.strokeCap(p.ROUND);
        const mouthY = r * 0.35;

        if (exp === 'happy') p.arc(0, mouthY, 20, 15, 0, p.PI);
        else if (exp === 'angry') p.line(-6, mouthY + 5, 6, mouthY + 5);
        else if (exp === 'sad') p.arc(0, mouthY + 8, 15, 8, p.PI, 0);
        else if (exp === 'stunned') p.ellipse(0, mouthY + 5, 8, 10);
        else p.arc(0, mouthY, 10, 6, 0, p.PI);

        // LASHES
        if (variant === 'feminine') {
            p.fill(50); p.noStroke();
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
                this._drawLashTri(-eyeX - eyeW / 2 + 1, eyeY, true, r);
                this._drawLashTri(eyeX + eyeW / 2 + 1, eyeY, false, r);
            }
        }

        // EYES
        p.noStroke(); p.fill(50);

        if (exp === 'happy') {
            p.noFill(); p.stroke(50); p.strokeWeight(5); p.strokeCap(p.ROUND); p.strokeJoin(p.MITER);
            p.beginShape(); p.vertex(-eyeX - eyeW / 2, eyeY); p.vertex(-eyeX, eyeY - eyeH / 2); p.vertex(-eyeX + eyeW / 2, eyeY); p.endShape();
            p.beginShape(); p.vertex(eyeX - eyeW / 2, eyeY); p.vertex(eyeX, eyeY - eyeH / 2); p.vertex(eyeX + eyeW / 2, eyeY); p.endShape();

            if (variant === 'feminine') {
                p.noStroke(); p.fill(50);
                this._drawLashTri(-eyeX - eyeW / 2, eyeY, true, r);
                this._drawLashTri(eyeX + eyeW / 2, eyeY, false, r);
            }
            return;
        }

        p.rectMode(p.CENTER);
        if (exp === 'stunned') {
            p.circle(-eyeX, eyeY, eyeW * 0.6); p.circle(eyeX, eyeY, eyeW * 0.6);
        } else {
            p.rect(-eyeX, eyeY, eyeW, eyeH, 4); p.rect(eyeX, eyeY, eyeW, eyeH, 4);
            if (!isBlinking) {
                p.fill(255);
                const hSize = eyeW * 0.35;
                p.rect(-eyeX - eyeW * 0.2, eyeY - eyeH * 0.2, hSize, hSize, 1);
                p.rect(eyeX - eyeW * 0.2, eyeY - eyeH * 0.2, hSize, hSize, 1);
            }
        }

        // MASKS
        p.fill(skinColor); p.noStroke();

        if (isBlinking) {
            p.rect(-eyeX, eyeY, eyeW + 2, eyeH + 2); p.rect(eyeX, eyeY, eyeW + 2, eyeH + 2);
            p.stroke(50); p.strokeWeight(4);
            p.line(-eyeX - eyeW / 2, eyeY, -eyeX + eyeW / 2, eyeY);
            p.line(eyeX - eyeW / 2, eyeY, eyeX + eyeW / 2, eyeY);
            if (variant === 'feminine') {
                p.noStroke(); p.fill(50);
                this._drawLashTri(-eyeX - eyeW / 2 + 1, eyeY, true, r);
                this._drawLashTri(eyeX + eyeW / 2 + 1, eyeY, false, r);
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
        const w = r * 0.15;
        const h = r * 0.15;
        if (isLeft) p.triangle(x + 2, y + 2, x - w, y - h, x + 6, y - 2);
        else p.triangle(x - 2, y + 2, x + w, y - h, x - 6, y - 2);
    }

    _drawAccessoryBack(type, color, darkColor, r) {
        const { p } = this;
        p.fill(color); p.stroke(darkColor); p.strokeWeight(3); p.strokeJoin(p.ROUND);
        if (type === 'Cat Ears') { p.triangle(-r * 0.9, -r * 0.3, -r * 0.4, -r * 0.9, -r * 0.9, -r * 0.95); p.triangle(r * 0.9, -r * 0.3, r * 0.4, -r * 0.9, r * 0.9, -r * 0.95); }
        else if (type === 'Bear Ears') { p.circle(-r * 0.8, -r * 0.7, r * 0.6); p.circle(r * 0.8, -r * 0.7, r * 0.6); p.noStroke(); p.fill(darkColor); p.circle(-r * 0.8, -r * 0.7, r * 0.25); p.circle(r * 0.8, -r * 0.7, r * 0.25); }
        else if (type === 'Bunny Ears') { p.push(); p.translate(0, -r * 0.3); p.rotate(-0.2); p.ellipse(-r * 0.4, -r * 0.8, r * 0.5, r * 1.4); p.rotate(0.4); p.ellipse(r * 0.4, -r * 0.8, r * 0.5, r * 1.4); p.pop(); }
        else if (type === 'Fox Ears') { p.triangle(-r * 0.8, -r * 0.4, -r * 0.3, -r * 0.8, -r * 0.9, -r * 1.2); p.triangle(r * 0.8, -r * 0.4, r * 0.3, -r * 0.8, r * 0.9, -r * 1.2); p.noStroke(); p.fill(255, 200); p.triangle(-r * 0.75, -r * 0.5, -r * 0.4, -r * 0.8, -r * 0.8, -r * 1.0); p.triangle(r * 0.75, -r * 0.5, r * 0.4, -r * 0.8, r * 0.8, -r * 1.0); }
        else if (type === 'Puppy Ears') { p.fill(color); p.stroke(darkColor); p.strokeWeight(3); p.ellipse(-r * 0.9, r * 0.1, r * 0.7, r * 1.2); p.ellipse(r * 0.9, r * 0.1, r * 0.7, r * 1.2); }
        else if (type === 'Devil Horns') { p.fill(darkColor); p.triangle(-r * 0.5, -r * 0.6, -r * 0.2, -r * 0.8, -r * 0.4, -r * 1.0); p.triangle(r * 0.5, -r * 0.6, r * 0.2, -r * 0.8, r * 0.4, -r * 1.0); }
        else if (type === 'Headphones') { p.noFill(); p.stroke(50); p.strokeWeight(8); p.arc(0, 0, r * 2.2, r * 2.2, p.PI, 0); }
    }

    _drawAccessoryFront(type, color, darkColor, r) {
        const { p } = this;
        if (type === 'Bow') { p.fill(darkColor); p.stroke(255); p.strokeWeight(2); p.push(); p.translate(0, -r * 0.95); p.triangle(0, 0, -20, -15, -20, 15); p.triangle(0, 0, 20, -15, 20, 15); p.circle(0, 0, 10); p.pop(); }
        else if (type === 'Sprout') { p.noFill(); p.stroke('#2ecc71'); p.strokeWeight(4); p.strokeCap(p.ROUND); p.line(0, -r, 0, -r - 15); p.fill('#2ecc71'); p.noStroke(); p.ellipse(10, -r - 15, 18, 10); p.ellipse(-8, -r - 12, 12, 8); }
        else if (type === 'Halo') { p.noFill(); p.stroke('#FFD700'); p.strokeWeight(5); p.ellipse(0, -r * 1.1, r * 1.2, r * 0.3); }
        else if (type === 'Headphones') { p.fill(50); p.stroke(255); p.strokeWeight(2); p.rectMode(p.CENTER); p.rect(-r, 0, r * 0.4, r * 0.8, 5); p.rect(r, 0, r * 0.4, r * 0.8, 5); p.fill(color); p.noStroke(); p.circle(-r, 0, r * 0.15); p.circle(r, 0, r * 0.15); }
    }

    _shadeColor(color, percent) {
        let R = parseInt(color.substring(1, 3), 16); let G = parseInt(color.substring(3, 5), 16); let B = parseInt(color.substring(5, 7), 16);
        R = parseInt(R * (100 + percent) / 100); G = parseInt(G * (100 + percent) / 100); B = parseInt(B * (100 + percent) / 100);
        R = (R < 255) ? R : 255; G = (G < 255) ? G : 255; B = (B < 255) ? B : 255;
        const RR = ((R.toString(16).length == 1) ? "0" + R.toString(16) : R.toString(16));
        const GG = ((G.toString(16).length == 1) ? "0" + G.toString(16) : G.toString(16));
        const BB = ((B.toString(16).length == 1) ? "0" + B.toString(16) : B.toString(16));
        return "#" + RR + GG + BB;
    }
}