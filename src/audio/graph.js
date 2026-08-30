/* =========================================================
   graph.js — o barramento de áudio.

        vozes ──┐
   ui  ─ bus ───┤
   sfx ─ bus ───┤
   amb ─ bus ───┼─► preMaster ─► compressor ─► saturador ─► limitador ─► master ─► saída
   mus ─ bus ───┤        ▲
   voz ─ bus ───┘        │
          └─ envio ─► reverb ─┘
          └─ envio ─► delay  ─┘

   Cada sub-barramento tem ganho próprio (de CFG.audio), um nó de
   ducking independente e um envio para os efeitos. O ducking é
   manual (Web Audio não tem sidechain): quem duca pede
   `duck('music', 0.35, 0.08, 0.9)` e o barramento volta sozinho.

   Funciona igual num AudioContext ao vivo e num
   OfflineAudioContext — é isso que torna o audiolab possível.
   ========================================================= */
import { gain, filt, makeShaper, makeReverb, makeDelay, clamp } from './synth.js';

export const BUSES = ['ui', 'sfx', 'ambience', 'music', 'voice'];

/* qual volume de CFG.audio governa cada sub-barramento */
const VOL_KEY = { ui: 'sfx', sfx: 'sfx', ambience: 'ambience', music: 'music', voice: 'sfx' };

/* quanto de reverberação cada barramento manda por padrão */
const SEND_DEF = { ui: 0.05, sfx: 0.16, ambience: 0.10, music: 0.22, voice: 0.12 };

export class AudioGraph {
  constructor(ctx, opts = {}) {
    this.ctx = ctx;
    this.dest = opts.destination || ctx.destination;
    this.maxVoices = opts.maxVoices || 28;

    /* --- cadeia mestre --- */
    this.preMaster = gain(ctx, 1);

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 14;
    this.comp.ratio.value = 2.6;
    this.comp.attack.value = 0.012;
    this.comp.release.value = 0.22;

    this.sat = makeShaper(ctx, 1.35);

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2.2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.0025;
    this.limiter.release.value = 0.09;

    /* corta o infra-som que só consome headroom */
    this.dcCut = filt(ctx, 'highpass', 26, 0.6);

    this.master = gain(ctx, 0);

    this.preMaster.connect(this.comp);
    this.comp.connect(this.sat);
    this.sat.connect(this.limiter);
    this.limiter.connect(this.dcCut);
    this.dcCut.connect(this.master);
    this.master.connect(this.dest);

    /* --- efeitos de envio --- */
    this.reverb = makeReverb(ctx, { dur: 2.1, decay: 3.4, damp: 0.55, predelay: 0.021, hp: 200, gain: 0.9 });
    this.reverb.output.connect(this.preMaster);

    this.delay = makeDelay(ctx, { time: 0.26, feedback: 0.31, damp: 2400, gain: 0.55 });
    this.delay.output.connect(this.preMaster);

    /* --- sub-barramentos --- */
    this.bus = {};
    this.duckNode = {};
    this.send = {};
    this.delaySend = {};
    this._duck = {};
    for (const name of BUSES) {
      const b = gain(ctx, 1);
      const d = gain(ctx, 1);
      const s = gain(ctx, SEND_DEF[name]);
      const ds = gain(ctx, 0);
      b.connect(d);
      d.connect(this.preMaster);
      d.connect(s); s.connect(this.reverb.input);
      d.connect(ds); ds.connect(this.delay.input);
      this.bus[name] = b;
      this.duckNode[name] = d;
      this.send[name] = s;
      this.delaySend[name] = ds;
      this._duck[name] = { target: 1, until: 0, release: 0.5 };
    }

    /* --- espacialização --- */
    this._listener();

    /* --- pool de vozes --- */
    this.voices = [];
    this.stolen = 0;
    this.spawned = 0;
  }

  /* o ouvinte está sentado à mesa, olhando o monitor (-Z) */
  _listener() {
    const L = this.ctx.listener;
    try {
      if (L.positionX) {
        L.positionX.value = 0; L.positionY.value = 0; L.positionZ.value = 0;
        L.forwardX.value = 0; L.forwardY.value = 0; L.forwardZ.value = -1;
        L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
      } else if (L.setPosition) {
        L.setPosition(0, 0, 0);
        L.setOrientation(0, 0, -1, 0, 1, 0);
      }
    } catch (e) { /* implementação exótica: segue sem espacialização */ }
  }

  /* PannerNode posicionado — mantido sutil de propósito */
  panner(x, y, z, o = {}) {
    const p = this.ctx.createPanner();
    p.panningModel = o.hrtf === false ? 'equalpower' : 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = o.ref === undefined ? 1.0 : o.ref;
    p.maxDistance = 60;
    p.rolloffFactor = o.rolloff === undefined ? 0.7 : o.rolloff;
    p.coneInnerAngle = 360;
    try {
      if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
      else p.setPosition(x, y, z);
    } catch (e) { }
    return p;
  }

  /* ---------------- volumes ---------------- */
  /* nunca atribuição direta: tudo em rampa curta */
  ramp(param, v, tc = 0.03) {
    const t = this.ctx.currentTime;
    try {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      param.setTargetAtTime(v, t, Math.max(0.005, tc));
    } catch (e) { }
  }

  applyConfig(cfg) {
    this.cfg = cfg;
    const m = cfg.muted ? 0 : clamp(cfg.master, 0, 1.5);
    this.ramp(this.master.gain, m * 0.9, 0.05);
    for (const name of BUSES) {
      const v = clamp(cfg[VOL_KEY[name]] === undefined ? 1 : cfg[VOL_KEY[name]], 0, 1.5);
      this.ramp(this.bus[name].gain, v, 0.05);
    }
  }

  setMuted(on) {
    if (!this.cfg) return;
    this.cfg.muted = !!on;
    this.ramp(this.master.gain, on ? 0 : clamp(this.cfg.master, 0, 1.5) * 0.9, on ? 0.04 : 0.08);
  }

  /* abre o mestre do zero (usado no desbloqueio) */
  wake(seconds = 0.35) {
    if (!this.cfg) return;
    const t = this.ctx.currentTime;
    const v = this.cfg.muted ? 0 : clamp(this.cfg.master, 0, 1.5) * 0.9;
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(0.0001, t);
      this.master.gain.linearRampToValueAtTime(v, t + seconds);
    } catch (e) { }
  }

  /* ---------------- ducking ---------------- */
  duck(name, amount = 0.4, attack = 0.06, hold = 0.5, release = 0.6) {
    const d = this._duck[name];
    if (!d) return;
    const node = this.duckNode[name];
    const t = this.ctx.currentTime;
    const target = clamp(amount, 0, 1);
    if (target < d.target || t > d.until) {
      d.target = target;
      try {
        node.gain.cancelScheduledValues(t);
        node.gain.setValueAtTime(node.gain.value, t);
        node.gain.setTargetAtTime(target, t, Math.max(0.01, attack / 3));
      } catch (e) { }
    }
    d.until = Math.max(d.until, t + hold);
    d.release = release;
  }

  /* chamado a cada quadro: devolve os barramentos abaixados */
  updateDuck() {
    const t = this.ctx.currentTime;
    for (const name of BUSES) {
      const d = this._duck[name];
      if (d.target < 1 && t > d.until) {
        d.target = 1;
        const node = this.duckNode[name];
        try {
          node.gain.cancelScheduledValues(t);
          node.gain.setValueAtTime(node.gain.value, t);
          node.gain.setTargetAtTime(1, t, Math.max(0.02, d.release / 3));
        } catch (e) { }
      }
    }
  }

  /* ---------------- polifonia ---------------- */
  /* devolve um GainNode-voz já ligado ao barramento pedido.
     Estourou o teto? a voz mais antiga é roubada com fade de 12 ms. */
  voice(busName, t0, dur, opts = {}) {
    const ctx = this.ctx;
    const g = gain(ctx, 1);
    let out = g;

    if (opts.pos) {
      const p = this.panner(opts.pos[0], opts.pos[1], opts.pos[2], opts.panOpts || { hrtf: false });
      g.connect(p); out = p;
    }
    out.connect(this.bus[busName] || this.bus.sfx);

    if (opts.send !== undefined) {
      const s = gain(ctx, opts.send);
      out.connect(s); s.connect(this.reverb.input);
      g._extra = s;
    }

    const v = { g, out, end: t0 + dur + 0.06, t0, dead: false, extra: g._extra || null };
    this.voices.push(v);
    this.spawned++;

    if (this.voices.length > this.maxVoices) {
      /* rouba a mais antiga que ainda não terminou */
      let oldest = -1, best = Infinity;
      for (let i = 0; i < this.voices.length; i++) {
        const c = this.voices[i];
        if (c === v || c.dead) continue;
        if (c.t0 < best) { best = c.t0; oldest = i; }
      }
      if (oldest >= 0) this._steal(this.voices[oldest]);
    }
    return g;
  }

  _steal(v) {
    if (v.dead) return;
    v.dead = true;
    this.stolen++;
    const t = this.ctx.currentTime;
    try {
      const gp = v.g.gain;
      gp.cancelScheduledValues(t);
      gp.setValueAtTime(gp.value, t);
      gp.linearRampToValueAtTime(0, t + 0.012);
    } catch (e) { }
    v.end = Math.min(v.end, t + 0.05);
  }

  /* limpeza dos nós que já terminaram */
  reap() {
    const t = this.ctx.currentTime;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      if (t >= v.end) {
        try { v.g.disconnect(); } catch (e) { }
        try { if (v.out !== v.g) v.out.disconnect(); } catch (e) { }
        try { if (v.extra) v.extra.disconnect(); } catch (e) { }
        this.voices.splice(i, 1);
      }
    }
  }

  update() {
    this.updateDuck();
    this.reap();
  }

  stats() {
    return { voices: this.voices.length, spawned: this.spawned, stolen: this.stolen };
  }
}
