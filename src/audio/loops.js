/* =========================================================
   loops.js — as fontes contínuas e reativas.

   Diferente de sfx.js (disparo e esquece), aqui vivem os
   emissores com estado: o pulso do trace, o loop do password
   breaker, a textura do decriptador, o scanner e a
   transferência. Todos seguem o mesmo formato:

     obj.update(dt, pct)   avança e agenda o que couber
     obj.stop(fade)        desliga com rampa
     obj.stepAt(t, pct)    agenda UM evento em `t` (determinístico)

   `stepAt` é o que permite ao audiolab renderizar exatamente a
   mesma coisa offline, sem depender do relógio.
   ========================================================= */
import { tone, nz, thump, gain, filt, noiseBuf, lfo, clamp, mulberry, midi } from './synth.js';

/* =========================================================
   TRACE — o som mais importante do jogo.

   Três coisas mudam junto com `pct` (0..100):
     1. cadência: de 1,5 s entre pulsos para 0,085 s;
     2. proximidade: o pulso perde reverberação e ganha corpo —
        começa longe e escuro, termina colado no ouvido;
     3. dissonância: um trítono entra por cima a partir de ~55%
        e uma segunda menor a partir de ~85%.

   Abaixo de tudo corre um leito de subgrave que abre com o
   progresso. Nos últimos 10 segundos entra o modo pânico:
   pulsos em tercina, deriva de afinação e um riser.
   ========================================================= */
export class TracePulse {
  constructor(ctx, graph) {
    this.ctx = ctx;
    this.g = graph;
    this.acc = 0;
    this.pct = 0;
    this.on = false;
    this.bed = null;
    this.panicArmed = false;
    this.rng = mulberry(0x7A5E);
    this.count = 0;
  }

  start(t0) {
    if (this.on) return;
    const ctx = this.ctx, t = t0 === undefined ? ctx.currentTime : t0;
    this.on = true; this.acc = 999; this.count = 0; this.panicArmed = false;

    /* leito: ruído marrom + drone batendo, tudo passa-baixa */
    const out = gain(ctx, 0);
    const lp = filt(ctx, 'lowpass', 90, 1.2);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx, 'brown', 5);
    src.loop = true;
    const ng = gain(ctx, 0.55);
    src.connect(ng); ng.connect(lp);

    const oa = ctx.createOscillator(); oa.type = 'sine'; oa.frequency.value = 41.2;
    const ob = ctx.createOscillator(); ob.type = 'sine'; ob.frequency.value = 41.9;
    const og = gain(ctx, 0.30);
    oa.connect(og); ob.connect(og); og.connect(lp);

    lp.connect(out);
    out.connect(this.g.bus.ambience);

    src.start(t); oa.start(t); ob.start(t);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(0.02, t + 1.2);
    this.bed = { out, lp, src, oa, ob };
    return this;
  }

  stop(fade = 0.7) {
    this.on = false;
    this.acc = 0;
    this.pct = 0;
    if (!this.bed) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const b = this.bed; this.bed = null;
    try {
      b.out.gain.cancelScheduledValues(t);
      b.out.gain.setValueAtTime(b.out.gain.value, t);
      b.out.gain.linearRampToValueAtTime(0, t + fade);
    } catch (e) { }
    const end = t + fade + 0.05;
    for (const n of [b.src, b.oa, b.ob]) { try { n.stop(end); } catch (e) { } }
    setTimeout(() => { try { b.out.disconnect(); } catch (e) { } }, (fade + 0.2) * 1000);
  }

  /* intervalo entre pulsos para um dado progresso */
  interval(pct) {
    const k = Math.pow(clamp(pct, 0, 100) / 100, 1.55);
    return 1.5 - k * 1.415;
  }

  /* um pulso. `pct` decide tudo: cadência já é do chamador. */
  stepAt(t, pct, panic) {
    const k = Math.pow(clamp(pct, 0, 100) / 100, 1.1);
    const R = this.rng;
    const near = k;                          /* 0 = longe, 1 = colado */
    const send = 0.55 * (1 - near) + 0.03;   /* longe = molhado, perto = seco */
    const vol = 0.30 + near * 0.62;
    const out = this.g.voice('sfx', t, 0.5, { send });
    if (!out) return;

    const f = 380 + k * 900 + (panic ? R() * 40 - 20 : 0);
    const dur = 0.20 - k * 0.11;

    /* o corpo do pulso: senoide com passa-banda ressonante */
    tone(this.ctx, out, t, {
      f, f2: f * (0.82 - k * 0.12), type: near > 0.62 ? 'square' : 'triangle',
      dur, gain: 0.20 * vol, a: 0.0022, pow: 2.6 + k,
      filter: { type: 'bandpass', f: f * 1.6, q: 2.2 + k * 4 }
    });
    /* martelo de subgrave: chega antes ao corpo do que ao ouvido */
    tone(this.ctx, out, t, {
      f: 96 - k * 26, f2: 52 - k * 14, type: 'sine',
      dur: 0.19, gain: 0.20 * (0.4 + near * 0.8), a: 0.003, pow: 3
    });
    /* trítono: a partir da metade, o pulso deixa de ser "certo" */
    if (k > 0.42) {
      const d = (k - 0.42) / 0.58;
      tone(this.ctx, out, t + 0.004, {
        f: f * 1.4142, type: 'square', dur: dur * 0.8,
        gain: 0.09 * d * vol, a: 0.002, pow: 3,
        filter: { type: 'bandpass', f: f * 1.4142, q: 6 }
      });
    }
    /* segunda menor no fim: o intervalo que arranha */
    if (k > 0.8) {
      const d = (k - 0.8) / 0.2;
      tone(this.ctx, out, t + 0.006, {
        f: f * 1.0595, type: 'sawtooth', dur: dur * 0.7,
        gain: 0.06 * d * vol, a: 0.0015, pow: 3.4,
        filter: { type: 'bandpass', f: f * 2.1, q: 8 }
      });
    }
    /* transiente de proximidade */
    nz(this.ctx, out, t, {
      dur: 0.012, gain: 0.10 * near, band: [3200 + k * 3000, 1200], q: 1.2, a: 0.0006, pow: 4.5
    });

    /* pânico: eco em tercina, cada vez mais irregular */
    if (panic) {
      const o2 = this.g.voice('sfx', t + 0.055, 0.2, { send: 0.02 });
      if (o2) {
        tone(this.ctx, o2, t + 0.055, {
          f: f * 1.5, type: 'square', dur: 0.05, gain: 0.11, a: 0.001, pow: 3.6,
          filter: { type: 'bandpass', f: f * 1.5, q: 7 }
        });
        tone(this.ctx, o2, t + 0.098, {
          f: f * 1.19, type: 'square', dur: 0.045, gain: 0.08, a: 0.001, pow: 3.6,
          filter: { type: 'bandpass', f: f * 1.19, q: 7 }
        });
      }
    }
    this.count++;
  }

  /* riser: entra uma única vez quando faltam ~10 s */
  riserAt(t, dur = 9.0) {
    const out = this.g.voice('sfx', t, dur + 0.5, { send: 0.12 });
    if (!out) return;
    nz(this.ctx, out, t, {
      dur, gain: 0.075, band: [340, 7200], q: 3.2,
      a: dur * 0.75, s: 0.9, r: dur * 0.2, pow: 1.05
    });
    tone(this.ctx, out, t, {
      f: 62, f2: 240, type: 'sawtooth', dur, gain: 0.055,
      a: dur * 0.8, s: 0.9, r: dur * 0.18, pow: 1.05,
      filter: { type: 'lowpass', f: 200, f2: 1800, q: 4 }
    });
  }

  update(dt, pct, remaining) {
    if (!this.on) return;
    const ctx = this.ctx;
    this.pct = clamp(pct, 0, 100);
    const panic = (remaining !== undefined && remaining <= 10) || this.pct >= 90;

    /* abre o leito conforme aperta */
    if (this.bed) {
      const target = 0.02 + Math.pow(this.pct / 100, 1.4) * 0.16;
      const t = ctx.currentTime;
      try {
        this.bed.out.gain.setTargetAtTime(target, t, 0.35);
        this.bed.lp.frequency.setTargetAtTime(90 + this.pct * 3.4, t, 0.5);
      } catch (e) { }
    }

    if (panic && !this.panicArmed) {
      this.panicArmed = true;
      this.riserAt(ctx.currentTime, Math.max(2, Math.min(10, remaining === undefined ? 9 : remaining)));
      /* o resto do mundo abaixa: só resta o trace */
      this.g.duck('music', 0.30, 0.4, 12, 2.0);
      this.g.duck('ambience', 0.28, 0.4, 12, 2.0);
    }

    this.acc += dt;
    const iv = this.interval(this.pct);
    if (this.acc >= iv) {
      this.acc = 0;
      this.stepAt(ctx.currentTime + 0.005, this.pct, panic);
    }
  }

  /* renderização determinística de N segundos — usada pelo audiolab */
  renderBurst(t0, seconds, pct, panic) {
    const iv = this.interval(pct);
    let t = t0 + 0.01;
    let n = 0;
    while (t < t0 + seconds && n < 200) { this.stepAt(t, pct, !!panic); t += iv; n++; }
    return n;
  }
}

/* =========================================================
   FERRAMENTAS — loops que reagem ao progresso
   ========================================================= */
const TOOLS = {
  /* password breaker: um loop rítmico que acelera. É o som de
     uma máquina tentando combinações cada vez mais rápido. */
  breaker: {
    iv: p => 0.24 - p * 0.175,
    step(ctx, g, t, p, R, i) {
      const out = g.voice('sfx', t, 0.16, { send: 0.10 - p * 0.07 });
      if (!out) return;
      const accent = (i % 4) === 0;
      const f = 148 + p * 120 + (accent ? 40 : 0);
      tone(ctx, out, t, {
        f, f2: f * 0.7, type: 'square', dur: 0.05 + (accent ? 0.02 : 0),
        gain: (accent ? 0.17 : 0.10) * (0.6 + p * 0.5), a: 0.0012, pow: 3.4,
        filter: { type: 'lowpass', f: 900 + p * 2600, f2: 500 + p * 900, q: 5 }
      });
      nz(ctx, out, t, {
        dur: 0.022, gain: 0.055 * (0.6 + p * 0.7),
        band: [2200 + p * 3400, 900], q: 1.8, a: 0.0008, pow: 4
      });
      /* blip de tentativa aceita: pinga sozinho, cada vez mais denso */
      if (R() < 0.18 + p * 0.4) {
        tone(ctx, out, t + 0.012, {
          f: 1500 + R() * 1800 + p * 900, type: 'triangle', dur: 0.03,
          gain: 0.045, a: 0.0009, pow: 4
        });
      }
    }
  },

  /* decriptador: textura granular, densidade cresce */
  decrypter: {
    iv: p => 0.052 - p * 0.030,
    step(ctx, g, t, p, R) {
      const out = g.voice('sfx', t, 0.12, { send: 0.24 - p * 0.14 });
      if (!out) return;
      const f = 300 + R() * (900 + p * 3400);
      tone(ctx, out, t, {
        f, type: R() > 0.55 ? 'square' : 'sawtooth', dur: 0.014 + R() * 0.026,
        gain: (0.030 + R() * 0.035) * (0.7 + p * 0.6), a: 0.0012, pow: 3.2,
        filter: { type: 'bandpass', f, q: 7 + R() * 10 }
      });
      if (R() > 0.62) {
        nz(ctx, out, t + R() * 0.01, {
          dur: 0.008 + R() * 0.01, gain: 0.03 * (0.6 + p),
          band: [f * 1.8, f * 0.7], q: 6, a: 0.0006, pow: 4.5
        });
      }
    }
  },

  /* scanner: varredura periódica, o intervalo encurta pouco */
  scanner: {
    iv: p => 0.62 - p * 0.22,
    step(ctx, g, t, p, R) {
      const out = g.voice('sfx', t, 0.5, { send: 0.30 });
      if (!out) return;
      nz(ctx, out, t, {
        dur: 0.28, gain: 0.055 * (0.7 + p * 0.5), band: [420 + p * 400, 5200], q: 10,
        a: 0.02, s: 0.8, r: 0.07, pow: 1.3
      });
      tone(ctx, out, t + 0.26, {
        f: midi(81 + Math.round(p * 7)), type: 'sine', dur: 0.16,
        gain: 0.07, a: 0.0015, pow: 3.2
      });
    }
  },

  /* transferência: pacotes constantes com relatório periódico */
  transfer: {
    iv: () => 0.075,
    step(ctx, g, t, p, R, i) {
      const out = g.voice('sfx', t, 0.1, { send: 0.10 });
      if (!out) return;
      tone(ctx, out, t, {
        f: 820 + (i % 5) * 190 + p * 260, type: 'square', dur: 0.02,
        gain: 0.055, a: 0.001, pow: 3.6, filter: { type: 'lowpass', f: 4200, q: 1.2 }
      });
      if (i % 8 === 0) {
        nz(ctx, out, t, { dur: 0.05, gain: 0.035, band: [1600, 700], q: 2.4, a: 0.003, pow: 2.6 });
      }
    }
  }
};

export class ToolLoop {
  constructor(ctx, graph, kind) {
    this.ctx = ctx; this.g = graph;
    this.kind = TOOLS[kind] ? kind : 'breaker';
    this.def = TOOLS[this.kind];
    this.acc = 0; this.i = 0; this.pct = 0; this.on = false;
    this.rng = mulberry(0x3C7 + this.kind.length * 977);
  }
  start() { this.on = true; this.acc = 999; this.i = 0; return this; }
  stop() { this.on = false; }
  set(pct) { this.pct = clamp(pct, 0, 100); }
  stepAt(t, pct, i) { this.def.step(this.ctx, this.g, t, clamp(pct, 0, 100) / 100, this.rng, i || 0); }
  update(dt, pct) {
    if (!this.on) return;
    if (pct !== undefined) this.pct = clamp(pct, 0, 100);
    const p = this.pct / 100;
    this.acc += dt;
    const iv = Math.max(0.02, this.def.iv(p));
    let guard = 0;
    while (this.acc >= iv && guard++ < 8) {
      this.acc -= iv;
      this.stepAt(this.ctx.currentTime + 0.004, this.pct, this.i++);
    }
  }
  renderBurst(t0, seconds, pct) {
    const p = clamp(pct, 0, 100) / 100;
    const iv = Math.max(0.02, this.def.iv(p));
    let t = t0 + 0.01, n = 0;
    while (t < t0 + seconds && n < 400) { this.stepAt(t, pct, n); t += iv; n++; }
    return n;
  }
}

export const TOOL_KINDS = Object.keys(TOOLS);
