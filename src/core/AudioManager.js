export default class AudioManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;

        // SETTINGS
        this.musicEnabled = false;
        this.sfxEnabled = true;
        this.loadSettings();

        // Sequencer State
        this.currentTrackId = null;
        this.tempo = 120;
        this.nextNoteTime = 0;
        this.current16thNote = 0;
        this.scheduleAheadTime = 0.1;
        this.lookahead = 25;
        this.timerID = null;

        // --- MUSIC DATA ---
        this.songs = {
            'lobby': {
                tempo: 100,
                type: 'lofi',
                scale: [261.63, 311.13, 392.00, 493.88, 523.25],
                bass: [
                    130.81, 0, 0, 0, 196.00, 0, 0, 0, 130.81, 0, 0, 0, 196.00, 0, 164.81, 0,
                    174.61, 0, 0, 0, 220.00, 0, 0, 0, 146.83, 0, 0, 0, 196.00, 0, 0, 0
                ],
                drums: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0]
            },
            'config': { // NEW: Explicit Config Track (Calm)
                tempo: 90,
                type: 'lofi',
                scale: [329.63, 392.00, 493.88, 523.25], // E min
                bass: [164.81, 0, 0, 0, 0, 0, 0, 0, 130.81, 0, 0, 0, 0, 0, 0, 0], // Sparse bass
                drums: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]
            },
            'game': {
                tempo: 135,
                type: 'arcade',
                scale: [440, 523.25, 587.33, 659.25, 783.99],
                bass: [
                    110, 0, 110, 0, 130.8, 0, 0, 0, 110, 0, 110, 0, 164.8, 0, 146.8, 0,
                    110, 0, 110, 0, 130.8, 0, 0, 0, 87.3, 0, 87.3, 0, 98.0, 0, 0, 0
                ],
                drums: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1]
            },
            'victory': {
                tempo: 110,
                type: 'fanfare',
                scale: [523.25, 659.25, 783.99, 1046.50],
                bass: [261.63, 261.63, 261.63, 261.63, 329.63, 329.63, 329.63, 329.63, 392.00, 392.00, 392.00, 392.00, 523.25, 0, 0, 0],
                drums: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0]
            }
        };
    }

    init() {
        if (this.ctx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3;
        this.masterGain.connect(this.ctx.destination);

        this.nextNoteTime = this.ctx.currentTime;
        this.scheduler();
    }

    loadSettings() {
        const saved = localStorage.getItem('arcade_audio_settings');
        if (saved) {
            const config = JSON.parse(saved);
            this.musicEnabled = config.music;
            this.sfxEnabled = config.sfx;
        }
    }

    saveSettings() {
        localStorage.setItem('arcade_audio_settings', JSON.stringify({
            music: this.musicEnabled,
            sfx: this.sfxEnabled
        }));
    }

    toggleMusic(state) {
        this.musicEnabled = state;
        this.saveSettings();

        // Fix: Ensure context is running if we toggle ON
        if (state && this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleSfx(state) {
        this.sfxEnabled = state;
        this.saveSettings();
        if (state && this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    setTrack(name) {
        if (this.currentTrackId === name) return;
        this.currentTrackId = name;
        if (this.songs[name]) {
            this.tempo = this.songs[name].tempo;
            this.current16thNote = 0;
        }
    }

    scheduler() {
        if (this.ctx) {
            while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
                this.scheduleNote(this.current16thNote, this.nextNoteTime);
                this.nextNote();
            }
        }
        this.timerID = setTimeout(() => this.scheduler(), this.lookahead);
    }

    nextNote() {
        const secondsPerBeat = 60.0 / this.tempo;
        this.nextNoteTime += 0.25 * secondsPerBeat;
        this.current16thNote = (this.current16thNote + 1) % 32;
    }

    scheduleNote(beatNumber, time) {
        if (!this.musicEnabled || !this.currentTrackId || !this.songs[this.currentTrackId]) return;

        const song = this.songs[this.currentTrackId];
        const beatIndex = beatNumber % 32;

        // Bass (Louder in Lobby)
        const bassVol = (this.currentTrackId === 'lobby' || this.currentTrackId === 'config') ? 0.3 : 0.2;

        if (song.bass[beatIndex]) {
            this.playTone(song.bass[beatIndex], time, 'triangle', 0.2, bassVol);
        }

        const isStrongBeat = beatIndex % 4 === 0;
        const chance = isStrongBeat ? 0.6 : 0.15;

        if (this.currentTrackId !== 'victory') {
            if (Math.random() < chance) {
                const note = song.scale[Math.floor(Math.random() * song.scale.length)];
                const type = song.type === 'lofi' ? 'sine' : 'square';
                const len = isStrongBeat ? 0.3 : 0.1;
                // Lead Volume
                this.playTone(note, time, type, len, 0.15);
            }
        } else {
            const noteIdx = Math.floor(beatIndex / 2) % song.scale.length;
            if (beatIndex % 2 === 0) {
                this.playTone(song.scale[noteIdx], time, 'square', 0.2, 0.2);
            }
        }

        if (song.drums[beatIndex]) {
            this.playDrum(time);
        }
    }

    playTone(freq, time, type, duration, vol) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(this.masterGain);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.start(time);
        osc.stop(time + duration + 0.1);

        setTimeout(() => { osc.disconnect(); gain.disconnect(); }, (duration + 0.2) * 1000);
    }

    playDrum(time) {
        const bufferSize = this.ctx.sampleRate * 0.05;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2000;
        const gain = this.ctx.createGain();
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        gain.gain.setValueAtTime(0.2, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
        noise.start(time);
        setTimeout(() => { noise.disconnect(); gain.disconnect(); }, 100);
    }

    play(name) {
        if (!this.ctx || !this.sfxEnabled) return;

        const now = this.ctx.currentTime;
        const sfxGain = this.ctx.createGain();
        sfxGain.gain.value = 1.5;
        sfxGain.connect(this.masterGain);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(sfxGain);

        switch (name) {
            case 'ui-hover':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1200, now);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
                osc.start(now); osc.stop(now + 0.03);
                break;

            case 'click':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.1);
                osc.start(now); osc.stop(now + 0.1);
                break;
            case 'bump':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);
                gain.gain.setValueAtTime(0.5, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.2);
                osc.start(now); osc.stop(now + 0.2);
                break;
            case 'jump':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.linearRampToValueAtTime(450, now + 0.2);
                gain.gain.setValueAtTime(0.5, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start(now); osc.stop(now + 0.3);
                break;
            case 'crash':
            case 'pop':
                this.playDrum(now);
                const thud = this.ctx.createOscillator();
                const thudGain = this.ctx.createGain();
                thud.type = 'square';
                thud.frequency.value = 60;
                thud.connect(thudGain);
                thudGain.connect(sfxGain);
                thudGain.gain.setValueAtTime(0.5, now);
                thudGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                thud.start(now); thud.stop(now + 0.3);
                break;
            case 'win':
                this._playArpeggio([523.25, 659.25, 1046.50], now);
                break;
        }
        setTimeout(() => sfxGain.disconnect(), 1000);
    }

    _playArpeggio(notes, time) {
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(this.masterGain);
            const t = time + i * 0.05;
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
            osc.start(t);
            osc.stop(t + 0.3);
        });
    }
}