/* ============================================================
   EGGHEAD: STAY UNSTABLE — procedural audio engine
   Everything is synthesised at runtime with the Web Audio API.
   No audio files, no network, no random playback: every sound is
   triggered by a real gameplay event.
   ============================================================ */
(function (global) {
  'use strict';

  var NOTE = function (semi) { return 440 * Math.pow(2, semi / 12); };

  var Engine = {
    ctx: null,
    master: null,
    musicBus: null,
    sfxBus: null,
    ready: false,
    musicOn: true,
    sfxOn: true,

    /* ---- persistent state ---- */
    _dangerOsc: null,
    _dangerGain: null,
    _dangerFilter: null,
    _dangerTarget: 0,
    _dangerLevel: 0,
    _windGain: null,
    _windSrc: null,

    /* ---- sequencer ---- */
    _timer: null,
    _step: 0,
    _nextNoteTime: 0,
    _intensity: 0,
    _playing: false,
    _bpm: 116,
    _mood: 'play',
    _maxIntensity: 6,

    init: function () {
      if (this.ready) return;
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { return; }

      var ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;

      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 22;
      comp.ratio.value = 8;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.42 : 0;
      // sidechain pump: the kick briefly dips the whole music bed
      this._musPump = ctx.createGain();
      this._musPump.gain.value = 1;

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.sfxOn ? 0.72 : 0;

      // plate-style reverb send (procedural impulse response, no files)
      this.revBus = ctx.createGain();
      this.revBus.gain.value = 0.9;
      var conv = ctx.createConvolver();
      conv.buffer = this._makeIR(1.7, 2.6);
      this.revBus.connect(conv);
      conv.connect(comp);

      this.musicBus.connect(this._musPump);
      this._musPump.connect(comp);
      this.sfxBus.connect(comp);
      comp.connect(this.master);
      this.master.connect(ctx.destination);

      this._buildDangerTone();
      this._buildWind();
      this.ready = true;
    },

    /* ---------------------------------------------------------
       procedural impulse response: stereo noise with an
       exponential decay — a small, bright plate reverb
       --------------------------------------------------------- */
    _makeIR: function (seconds, decay) {
      var ctx = this.ctx;
      var len = Math.floor(ctx.sampleRate * seconds);
      var buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (var ch = 0; ch < 2; ch++) {
        var d = buf.getChannelData(ch);
        for (var i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
      }
      return buf;
    },

    /* smooth parameter fade (no clicks when toggling music) */
    _fade: function (param, target, sec) {
      var t = this.ctx.currentTime;
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      param.linearRampToValueAtTime(target, t + sec);
    },

    unlock: function () {
      if (!this.ready) this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    /* ---------------------------------------------------------
       shared noise buffer
       --------------------------------------------------------- */
    _noiseBuffer: null,
    _noise: function () {
      if (this._noiseBuffer) return this._noiseBuffer;
      var ctx = this.ctx, len = Math.floor(ctx.sampleRate * 1.4);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuffer = buf;
      return buf;
    },

    /* ---------------------------------------------------------
       low level voices
       --------------------------------------------------------- */
    _tone: function (o) {
      if (!this.ready) return;
      var ctx = this.ctx, t0 = ctx.currentTime + (o.delay || 0);
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f0, t0);
      if (o.f1 != null) {
        if (o.exp) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);
        else osc.frequency.linearRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);
      }
      var peak = (o.gain == null ? 0.35 : o.gain);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + (o.atk || 0.008));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

      var node = osc;
      if (o.filter) {
        var f = ctx.createBiquadFilter();
        f.type = o.filter;
        f.frequency.setValueAtTime(o.fc || 900, t0);
        if (o.fc1) f.frequency.exponentialRampToValueAtTime(o.fc1, t0 + o.dur);
        f.Q.value = o.q || 1;
        node.connect(f); node = f;
      }
      node.connect(g);
      g.connect(o.bus === 'music' ? this.musicBus : this.sfxBus);
      if (o.rev) {
        var rs = ctx.createGain();
        rs.gain.value = o.rev;
        g.connect(rs);
        rs.connect(this.revBus);
      }
      osc.start(t0);
      osc.stop(t0 + o.dur + 0.03);
    },

    _noiseHit: function (o) {
      if (!this.ready) return;
      var ctx = this.ctx, t0 = ctx.currentTime + (o.delay || 0);
      var src = ctx.createBufferSource();
      src.buffer = this._noise();
      src.loop = true;
      src.playbackRate.value = o.rate || 1;
      var f = ctx.createBiquadFilter();
      f.type = o.filter || 'bandpass';
      f.frequency.setValueAtTime(o.fc || 1600, t0);
      if (o.fc1) f.frequency.exponentialRampToValueAtTime(o.fc1, t0 + o.dur);
      f.Q.value = o.q || 1.2;
      var g = ctx.createGain();
      var peak = (o.gain == null ? 0.3 : o.gain);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + (o.atk || 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      src.connect(f); f.connect(g);
      g.connect(o.bus === 'music' ? this.musicBus : this.sfxBus);
      if (o.rev) {
        var rs = ctx.createGain();
        rs.gain.value = o.rev;
        g.connect(rs);
        rs.connect(this.revBus);
      }
      src.start(t0);
      src.stop(t0 + o.dur + 0.02);
    },

    /* ---------------------------------------------------------
       continuous danger tone  (rises as the egg tips over)
       --------------------------------------------------------- */
    _buildDangerTone: function () {
      var ctx = this.ctx;
      this._dangerOsc = ctx.createOscillator();
      this._dangerOsc.type = 'triangle';
      this._dangerOsc.frequency.value = 220;

      var wob = ctx.createOscillator();
      wob.type = 'sine'; wob.frequency.value = 5.6;
      var wobGain = ctx.createGain(); wobGain.gain.value = 16;
      wob.connect(wobGain); wobGain.connect(this._dangerOsc.frequency);

      this._dangerFilter = ctx.createBiquadFilter();
      this._dangerFilter.type = 'lowpass';
      this._dangerFilter.frequency.value = 1400;
      this._dangerFilter.Q.value = 3;

      this._dangerGain = ctx.createGain();
      this._dangerGain.gain.value = 0.0001;

      this._dangerOsc.connect(this._dangerFilter);
      this._dangerFilter.connect(this._dangerGain);
      this._dangerGain.connect(this.sfxBus);
      this._dangerOsc.start();
      wob.start();
    },

    /* v: 0..1 balance danger */
    setDanger: function (v) {
      if (!this.ready) return;
      this._dangerTarget = Math.max(0, Math.min(1, v));
    },

    _updateDanger: function () {
      if (!this.ready) return;
      var t = this._dangerTarget;
      // only audible in the top half of the danger range
      var lvl = Math.max(0, (t - 0.34) / 0.66);
      this._dangerLevel += (lvl - this._dangerLevel) * 0.18;
      var f = 200 + this._dangerLevel * 780;
      this._dangerOsc.frequency.value = f;
      this._dangerFilter.frequency.value = 900 + this._dangerLevel * 3200;
      var g = this._dangerLevel * this._dangerLevel * 0.16;
      this._dangerGain.gain.value = Math.max(0.0001, g);
    },

    /* ---------------------------------------------------------
       fan wind (looping filtered noise)
       --------------------------------------------------------- */
    _buildWind: function () {
      var ctx = this.ctx;
      this._windSrc = ctx.createBufferSource();
      this._windSrc.buffer = this._noise();
      this._windSrc.loop = true;
      var f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 620; f.Q.value = 0.8;
      this._windGain = ctx.createGain();
      this._windGain.gain.value = 0.0001;
      this._windSrc.connect(f); f.connect(this._windGain);
      this._windGain.connect(this.sfxBus);
      this._windSrc.start();
    },
    setWind: function (v) {
      if (!this.ready) return;
      this._windGain.gain.value = Math.max(0.0001, Math.min(0.14, v * 0.14));
    },

    /* ---------------------------------------------------------
       one-shot sound effects
       --------------------------------------------------------- */
    sfx: function (name, opt) {
      if (!this.ready || !this.sfxOn) return;
      opt = opt || {};
      switch (name) {
        case 'click':
          this._tone({ type: 'square', f0: 700, f1: 980, dur: 0.07, gain: 0.16 });
          break;
        case 'back':
          this._tone({ type: 'square', f0: 620, f1: 400, dur: 0.08, gain: 0.14 });
          break;
        case 'start':
          this._tone({ type: 'triangle', f0: NOTE(-5), dur: 0.14, gain: 0.3, rev: 0.25 });
          this._tone({ type: 'triangle', f0: NOTE(2), dur: 0.16, gain: 0.28, delay: 0.09, rev: 0.25 });
          this._tone({ type: 'triangle', f0: NOTE(7), dur: 0.3, gain: 0.26, delay: 0.18, rev: 0.3 });
          break;
        case 'save': {
          var base = opt.pitch || 0;
          this._tone({ type: 'triangle', f0: NOTE(base), f1: NOTE(base), dur: 0.10, gain: 0.3, rev: 0.25 });
          this._tone({ type: 'triangle', f0: NOTE(base + 4), dur: 0.10, gain: 0.3, delay: 0.07, rev: 0.25 });
          this._tone({ type: 'triangle', f0: NOTE(base + 9), dur: 0.16, gain: 0.32, delay: 0.14, rev: 0.3 });
          this._tone({ type: 'sawtooth', f0: NOTE(base + 12), f1: NOTE(base + 16), dur: 0.3, gain: 0.12, delay: 0.14, filter: 'bandpass', fc: 2200, q: 2, rev: 0.35 });
          this._noiseHit({ filter: 'highpass', fc: 900, fc1: 5200, dur: 0.22, gain: 0.14 });
          break;
        }
        case 'fail':
          this._tone({ type: 'sawtooth', f0: 190, f1: 38, dur: 0.9, gain: 0.4, filter: 'lowpass', fc: 900, fc1: 160, q: 4, rev: 0.3 });
          this._tone({ type: 'sine', f0: 120, f1: 30, dur: 1.05, gain: 0.42 });
          this._noiseHit({ filter: 'lowpass', fc: 900, fc1: 120, dur: 0.5, gain: 0.26, rev: 0.25 });
          this._tone({ type: 'square', f0: 420, f1: 90, dur: 0.32, gain: 0.1, delay: 0.34 });
          break;
        case 'bounce':
          this._tone({ type: 'sine', f0: 420, f1: 720, dur: 0.1, gain: 0.26 });
          this._tone({ type: 'sine', f0: 700, f1: 250, dur: 0.34, gain: 0.22, delay: 0.06 });
          this._noiseHit({ filter: 'bandpass', fc: 1500, fc1: 300, dur: 0.12, gain: 0.12 });
          break;
        case 'thud':
          this._tone({ type: 'sine', f0: 180, f1: 60, dur: 0.24, gain: 0.3 });
          this._noiseHit({ filter: 'lowpass', fc: 500, dur: 0.16, gain: 0.2 });
          break;
        case 'slip':
          this._tone({ type: 'sawtooth', f0: 900, f1: 1500, dur: 0.3, gain: 0.1, filter: 'bandpass', fc: 1800, q: 6 });
          this._tone({ type: 'square', f0: 1400, f1: 700, dur: 0.22, gain: 0.07, delay: 0.06 });
          break;
        case 'fan':
          this._noiseHit({ filter: 'bandpass', fc: 700, fc1: 2400, dur: 0.6, gain: 0.2, q: 0.7 });
          this._tone({ type: 'square', f0: 300, f1: 380, dur: 0.4, gain: 0.06, filter: 'lowpass', fc: 900 });
          break;
        case 'unlock':
          [0, 4, 7, 12, 16].forEach(function (s, i) {
            this._tone({ type: 'triangle', f0: NOTE(s + 3), dur: 0.2, gain: 0.26, delay: i * 0.075, rev: 0.35 });
          }, this);
          this._noiseHit({ filter: 'highpass', fc: 2500, dur: 0.5, gain: 0.1, rev: 0.3 });
          break;
        case 'milestone':
          this._tone({ type: 'triangle', f0: NOTE(12), dur: 0.1, gain: 0.22, rev: 0.3 });
          this._tone({ type: 'triangle', f0: NOTE(19), dur: 0.18, gain: 0.2, delay: 0.08, rev: 0.3 });
          break;
        case 'record':
          [12, 16, 19, 24].forEach(function (s, i) {
            this._tone({ type: 'square', f0: NOTE(s), dur: 0.16, gain: 0.16, delay: i * 0.08, rev: 0.3 });
          }, this);
          break;
        case 'tick':
          this._tone({ type: 'square', f0: 1200, dur: 0.035, gain: 0.07 });
          break;
      }
    },

    /* ---------------------------------------------------------
       music — a layered groove: bass + sub, hats, kick, clap,
       pad chords, melody hook and synth stabs. Intensity layers
       elements in; mood swaps tempo and caps intensity.
       --------------------------------------------------------- */
    setMood: function (m) {
      if (m === this._mood) return;
      this._mood = m;
      if (m === 'menu') { this._bpm = 96; this._maxIntensity = 2; }
      else { this._bpm = 118; this._maxIntensity = 6; }
      this._intensity = Math.min(this._intensity, this._maxIntensity);
    },

    setIntensity: function (v) {
      this._intensity = Math.max(0, Math.min(this._maxIntensity, Math.round(v)));
    },

    startMusic: function () {
      if (!this.ready) return;
      if (!this.musicOn) return;
      this._playing = true;
      this._step = 0;
      this._nextNoteTime = this.ctx.currentTime + 0.08;
      this._fade(this.musicBus.gain, 0.42, 0.6);
      if (this._timer) clearInterval(this._timer);
      var self = this;
      this._timer = setInterval(function () { self._scheduler(); }, 25);
    },

    stopMusic: function () {
      this._playing = false;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      if (this.ready) this._fade(this.musicBus.gain, 0.0001, 0.4);
    },

    setMusicOn: function (on) {
      this.musicOn = !!on;
      if (!this.ready) return;
      if (this.musicOn) {
        if (this._playing) this._fade(this.musicBus.gain, 0.42, 0.3);
      } else {
        this._fade(this.musicBus.gain, 0.0001, 0.25);
      }
    },

    setSfxOn: function (on) {
      this.sfxOn = !!on;
      if (!this.ready) return;
      this.sfxBus.gain.value = this.sfxOn ? 0.72 : 0.0001;
      if (!this.sfxOn) { this.setWind(0); this.setDanger(0); }
    },

    _scheduler: function () {
      if (!this._playing) return;
      var ctx = this.ctx;
      var stepDur = 60 / this._bpm / 4; // 16th notes
      while (this._nextNoteTime < ctx.currentTime + 0.12) {
        this._playStep(this._step, this._nextNoteTime);
        this._nextNoteTime += stepDur;
        this._step = (this._step + 1) % 32;
      }
    },

    _m: function (o) { o.bus = 'music'; return o; },

    _playStep: function (step, t) {
      var I = this._intensity;
      var s16 = step % 16;
      var bar = Math.floor(step / 16);
      var delay = t - this.ctx.currentTime;
      if (delay < -0.05) return;

      // roots / bassline (always present)
      var roots = [0, 0, -5, -5, -3, -3, -7, -7];
      var ri = (bar * 2 + Math.floor(s16 / 4)) % roots.length;
      var root = roots[ri];
      if (s16 % 4 === 0 || (I >= 2 && s16 % 4 === 2)) {
        this._tone(this._m({
          type: 'triangle', f0: NOTE(root + 12), f1: NOTE(root + 12),
          dur: 0.22, gain: 0.30, delay: delay
        }));
      }
      // sub bass: warm low foundation once the groove kicks in
      if (I >= 2 && (s16 === 0 || s16 === 8)) {
        this._tone(this._m({ type: 'sine', f0: NOTE(root), dur: 0.5, gain: 0.20, delay: delay }));
      }
      if (I >= 1 && s16 % 4 === 2) {
        this._tone(this._m({ type: 'sine', f0: NOTE(root + 24), dur: 0.14, gain: 0.16, delay: delay }));
      }

      // hi-hat on eighths
      if (I >= 0 && s16 % 2 === 0) {
        this._noiseHit(this._m({
          filter: 'highpass', fc: 7000, dur: 0.045, gain: s16 % 4 === 2 ? 0.10 : 0.05,
          delay: delay, rate: 1.4
        }));
      }
      // kick (also pumps the whole music bed, sidechain-style)
      if (I >= 1 && (s16 === 0 || s16 === 6 || s16 === 10)) {
        this._tone(this._m({ type: 'sine', f0: 130, f1: 42, dur: 0.18, gain: 0.4, delay: delay }));
        var pg = this._musPump.gain;
        pg.cancelScheduledValues(t);
        pg.setValueAtTime(0.76, t);
        pg.linearRampToValueAtTime(1, t + 0.16);
      }
      // clap / snare
      if (I >= 2 && (s16 === 4 || s16 === 12)) {
        this._noiseHit(this._m({ filter: 'bandpass', fc: 1900, q: 0.9, dur: 0.13, gain: 0.16, delay: delay, rev: 0.18 }));
      }
      // pad chords: minor triad, slow attack, drenched in reverb
      if (I >= 1 && (s16 === 0 || s16 === 8)) {
        var proot = roots[(bar * 2 + (s16 >= 8 ? 1 : 0)) % roots.length];
        var chord = [0, 3, 7];
        for (var ci = 0; ci < chord.length; ci++) {
          this._tone(this._m({
            type: 'sawtooth', f0: NOTE(proot + chord[ci] + 12), dur: 1.0,
            gain: 0.05 + I * 0.011, atk: 0.34, delay: delay,
            filter: 'lowpass', fc: 680 + I * 240, q: 0.8, rev: 0.5
          }));
        }
      }
      // melody hook: pentatonic motif, echo tail at higher intensity
      if (I >= 3 && (s16 === 2 || s16 === 5 || s16 === 8 || s16 === 11 || s16 === 14)) {
        var pent = [0, 3, 5, 7, 10];
        var mi = (step * 5 + bar * 3) % 5;
        var mn = root + pent[mi] + 24;
        this._tone(this._m({
          type: 'triangle', f0: NOTE(mn), dur: 0.12, gain: 0.085, delay: delay,
          filter: 'lowpass', fc: 5200, rev: 0.45
        }));
        if (I >= 4) {
          this._tone(this._m({
            type: 'triangle', f0: NOTE(mn), dur: 0.10, gain: 0.034, delay: delay + 60 / this._bpm / 4,
            filter: 'lowpass', fc: 3200, rev: 0.5
          }));
        }
      }
      // absurd synth stabs at high intensity
      if (I >= 3 && (s16 === 3 || s16 === 11)) {
        this._tone(this._m({
          type: 'sawtooth', f0: NOTE(root + 19 + (I >= 4 ? 3 : 0)), f1: NOTE(root + 26),
          dur: 0.22, gain: 0.10, delay: delay, filter: 'bandpass', fc: 1800, fc1: 5200, q: 3, rev: 0.3
        }));
      }
      if (I >= 4 && s16 === 15) {
        this._tone(this._m({ type: 'square', f0: NOTE(root + 31), f1: NOTE(root + 24), dur: 0.1, gain: 0.07, delay: delay, rev: 0.25 }));
      }
      if (I >= 5 && s16 === 7) {
        this._noiseHit(this._m({ filter: 'bandpass', fc: 4000, fc1: 900, dur: 0.3, gain: 0.1, delay: delay, rev: 0.3 }));
      }
    },

    /* called from the game loop */
    update: function () {
      this._updateDanger();
    },

    duck: function (v) {
      if (!this.ready) return;
      this.master.gain.value = v;
    },

    silence: function () {
      if (!this.ready) return;
      this.setDanger(0);
      this.setWind(0);
    }
  };

  global.EggAudio = Engine;
})(window);
