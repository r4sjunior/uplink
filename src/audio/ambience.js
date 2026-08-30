/* =========================================================
   ambience.js — as camadas de fundo da sala.

   Nenhuma delas chama atenção sozinha; juntas fazem o silêncio
   parar de soar como "áudio desligado". Cada camada é
   independente, entra e sai com rampa e tem posição no espaço:

     crt      15,7 kHz do flyback — a assinatura de um CRT ligado.
              Fica MUITO baixo de propósito: é para ser sentido,
              não ouvido, e ouvido nenhum deve sofrer com isso.
     hum      60 Hz da rede com os harmônicos ímpares, à frente.
     fan      ventoinha: ruído marrom passa-baixa, à direita.
     street   rua além da janela: ruído rosa abafado, à esquerda,
              com passagens de carro esporádicas.
     crackle  estalos elétricos ocasionais (agendados no update).
   ========================================================= */
import { gain, filt, noiseBuf, lfo, clamp, mulberry, nz, tone } from './synth.js';

const POS = {
  crt: [0.0, 0.06, -0.72],
  hum: [0.0, -0.32, -0.45],
  fan: [0.68, -0.22, 0.40],
  street: [-2.30, 0.55, 0.95]
};

/* nível de cada camada quando ligada (antes do barramento) */
const LEVEL = {
  crt: 0.0052,
  hum: 0.026,
  fan: 0.070,
  street: 0.048
};

export class Ambience {
  constructor(ctx, graph) {
    this.ctx = ctx;
    this.g = graph;
    this.layers = {};
    this.want = {};
    this.rng = mulberry(0x0A11CE);
    this.crackAcc = 0;
    this.crackNext = 6 + this.rng() * 14;
    this.carAcc = 0;
    this.carNext = 9 + this.rng() * 16;
    this.started = false;
  }

  /* ---------- construção das camadas ---------- */
  _bus(name, hrtf = true) {
    const out = gain(this.ctx, 0);
    const p = POS[name];
    if (p) {
      const pan = this.g.panner(p[0], p[1], p[2], { hrtf, ref: 1.0, rolloff: 0.5 });
      out.connect(pan);
      pan.connect(this.g.bus.ambience);
      return { out, tail: pan };
    }
    out.connect(this.g.bus.ambience);
    return { out, tail: out };
  }

  _make(name, t0) {
    const ctx = this.ctx;
    const t = t0 === undefined ? ctx.currentTime : t0;
    const nodes = [];
    const b = this._bus(name);

    if (name === 'crt') {
      /* o apito do flyback: 15734 Hz (NTSC). Um par levemente
         desafinado dá o batimento vivo que um oscilador só não tem. */
      const a = ctx.createOscillator(); a.type = 'sine'; a.frequency.value = 15734;
      const c = ctx.createOscillator(); c.type = 'sine'; c.frequency.value = 15741;
      const hp = filt(ctx, 'highpass', 9000, 0.7);
      const mix = gain(ctx, 0.5);
      a.connect(mix); c.connect(mix); mix.connect(hp); hp.connect(b.out);
      /* chiado eletrostático por cima, quase inaudível */
      const hs = ctx.createBufferSource(); hs.buffer = noiseBuf(ctx, 'white', 5); hs.loop = true;
      const hbp = filt(ctx, 'bandpass', 6400, 1.1);
      const hg = gain(ctx, 0.22);
      hs.connect(hbp); hbp.connect(hg); hg.connect(b.out);
      /* respiração lenta da fonte */
      const l = lfo(ctx, mix.gain, { f: 0.13, depth: 0.14, t0: t });
      a.start(t); c.start(t); hs.start(t);
      nodes.push(a, c, hs, l.osc);

    } else if (name === 'hum') {
      /* 60 Hz + harmônicos ímpares, como um transformador */
      const lp = filt(ctx, 'lowpass', 420, 0.9);
      [[60, 1.0], [120, 0.42], [180, 0.30], [300, 0.12]].forEach(([f, a2]) => {
        const o = ctx.createOscillator();
        o.type = f === 60 ? 'sine' : 'triangle';
        o.frequency.value = f;
        const og = gain(ctx, a2 * 0.55);
        o.connect(og); og.connect(lp);
        o.start(t); nodes.push(o);
      });
      lp.connect(b.out);
      const l = lfo(ctx, lp.frequency, { f: 0.07, depth: 40, t0: t });
      nodes.push(l.osc);

    } else if (name === 'fan') {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf(ctx, 'brown', 5); src.loop = true;
      const lp = filt(ctx, 'lowpass', 340, 1.6);
      const hp = filt(ctx, 'highpass', 55, 0.7);
      /* ressonância da carcaça: dá "motor" ao ruído */
      const res = filt(ctx, 'peaking', 168, 3.5, 7);
      src.connect(hp); hp.connect(lp); lp.connect(res); res.connect(b.out);
      const l = lfo(ctx, lp.frequency, { f: 0.09, depth: 55, t0: t });
      /* passagem das pás: 41 Hz muito baixo */
      const blade = ctx.createOscillator(); blade.type = 'sine'; blade.frequency.value = 41.5;
      const bg = gain(ctx, 0.05); blade.connect(bg); bg.connect(b.out);
      src.start(t); blade.start(t);
      nodes.push(src, blade, l.osc);

    } else if (name === 'street') {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf(ctx, 'pink', 5); src.loop = true;
      /* a rua chega abafada pelo vidro: passa-baixa forte */
      const glass = filt(ctx, 'lowpass', 620, 0.8);
      const bp = filt(ctx, 'bandpass', 340, 0.6);
      const swell = gain(ctx, 0.7);
      src.connect(bp); bp.connect(glass); glass.connect(swell); swell.connect(b.out);
      const l1 = lfo(ctx, swell.gain, { f: 0.041, depth: 0.28, t0: t });
      const l2 = lfo(ctx, glass.frequency, { f: 0.023, depth: 190, t0: t });
      src.start(t);
      nodes.push(src, l1.osc, l2.osc);
    }

    const layer = { name, out: b.out, tail: b.tail, nodes, level: LEVEL[name] || 0.03, on: false };
    this.layers[name] = layer;
    return layer;
  }

  /* ---------- controle ---------- */
  enter(name, fade = 2.0, mul = 1) {
    if (!POS[name] && name !== 'crackle') return;
    if (name === 'crackle') { this.want.crackle = true; return; }
    const l = this.layers[name] || this._make(name);
    l.on = true;
    const t = this.ctx.currentTime;
    try {
      l.out.gain.cancelScheduledValues(t);
      l.out.gain.setValueAtTime(Math.max(l.out.gain.value, 0.00001), t);
      l.out.gain.linearRampToValueAtTime(l.level * mul, t + Math.max(0.05, fade));
    } catch (e) { }
  }

  exit(name, fade = 1.6) {
    if (name === 'crackle') { this.want.crackle = false; return; }
    const l = this.layers[name];
    if (!l || !l.on) return;
    l.on = false;
    const t = this.ctx.currentTime;
    try {
      l.out.gain.cancelScheduledValues(t);
      l.out.gain.setValueAtTime(l.out.gain.value, t);
      l.out.gain.linearRampToValueAtTime(0, t + Math.max(0.05, fade));
    } catch (e) { }
  }

  /* cenas prontas */
  setScene(scene, fade = 2.2) {
    const want = {
      boot: ['crt', 'hum'],
      idle: ['crt', 'hum', 'fan', 'street', 'crackle'],
      connected: ['crt', 'hum', 'fan', 'crackle'],
      over: ['hum'],
      off: []
    }[scene] || ['crt', 'hum', 'fan', 'street', 'crackle'];

    const set = new Set(want);
    for (const n of ['crt', 'hum', 'fan', 'street', 'crackle']) {
      if (set.has(n)) this.enter(n, fade, n === 'fan' && scene === 'connected' ? 1.25 : 1);
      else this.exit(n, fade * 0.8);
    }
    this.scene = scene;
  }

  start(scene = 'idle') {
    if (this.started) { this.setScene(scene); return; }
    this.started = true;
    this.setScene(scene, 3.0);
  }

  stopAll(fade = 1.0) {
    for (const n of Object.keys(this.layers)) this.exit(n, fade);
    this.want.crackle = false;
  }

  /* ---------- eventos esporádicos ---------- */
  crackleNow(t) {
    const R = this.rng;
    const out = this.g.voice('ambience', t, 0.2, { send: 0.34, pos: [0.35, 0.1, -0.5], panOpts: { hrtf: false } });
    if (!out) return;
    const n = 2 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) {
      nz(this.ctx, out, t + i * (0.004 + R() * 0.022), {
        dur: 0.0025 + R() * 0.004, gain: (0.020 + R() * 0.035),
        band: [2800 + R() * 6500, 1500], q: 1.6, a: 0.0004, pow: 5
      });
    }
  }

  carNow(t) {
    const R = this.rng;
    const dur = 2.4 + R() * 2.2;
    const out = this.g.voice('ambience', t, dur + 0.4, { send: 0.28, pos: [-2.6, 0.3, 0.6], panOpts: { hrtf: false } });
    if (!out) return;
    nz(this.ctx, out, t, {
      dur, gain: 0.030 + R() * 0.018, kind: 'pink',
      band: [180, 520], q: 0.7, a: dur * 0.45, s: 0.75, r: dur * 0.5, pow: 1.1
    });
    tone(this.ctx, out, t, {
      f: 64 + R() * 30, f2: 44 + R() * 16, type: 'sawtooth', dur,
      gain: 0.014, a: dur * 0.4, s: 0.7, r: dur * 0.55, pow: 1.1,
      filter: { type: 'lowpass', f: 300, f2: 140, q: 1.2 }
    });
  }

  update(dt) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    if (this.want.crackle) {
      this.crackAcc += dt;
      if (this.crackAcc >= this.crackNext) {
        this.crackAcc = 0;
        this.crackNext = 7 + this.rng() * 20;
        this.crackleNow(t + 0.02);
      }
    }
    if (this.layers.street && this.layers.street.on) {
      this.carAcc += dt;
      if (this.carAcc >= this.carNext) {
        this.carAcc = 0;
        this.carNext = 11 + this.rng() * 22;
        this.carNow(t + 0.02);
      }
    }
  }

  /* renderização offline de uma camada isolada — audiolab */
  renderLayer(name, t0, seconds) {
    if (name === 'crackle') {
      let t = t0 + 0.05, n = 0;
      while (t < t0 + seconds && n < 40) { this.crackleNow(t); t += 0.35 + this.rng() * 0.5; n++; }
      return;
    }
    if (name === 'car') { this.carNow(t0 + 0.05); return; }
    const l = this._make(name, t0);
    try {
      l.out.gain.setValueAtTime(0.0001, t0);
      l.out.gain.linearRampToValueAtTime(l.level, t0 + 0.25);
    } catch (e) { }
    l.on = true;
  }
}

export const AMB_LAYERS = ['crt', 'hum', 'fan', 'street', 'crackle'];
