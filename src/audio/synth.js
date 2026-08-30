/* =========================================================
   synth.js — blocos de construção de síntese.

   Tudo aqui é função pura sobre um BaseAudioContext: recebe o
   contexto e o nó de destino, agenda, devolve a duração. Isso é
   o que permite renderizar o catálogo inteiro num
   OfflineAudioContext (o audiolab) com resultado determinístico
   e, ao mesmo tempo, tocar ao vivo no AudioContext do jogo.

   Regras da casa:
   - nenhum ganho recebe atribuição direta depois de soar; tudo
     é rampa ou curva de valores (setValueCurveAtTime);
   - nenhuma envoltória termina em degrau: a última amostra da
     curva é sempre 0, então não há clique de corte;
   - nada aqui toca `ctx.destination` por conta própria.
   ========================================================= */

/* --------------------------------------------------------
   aleatoriedade determinística
   -------------------------------------------------------- */
export function mulberry(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* rng global do jogo (variação viva); o audiolab passa a sua */
let liveSeed = 0x1F35C7;
export function rnd() {
  liveSeed = (Math.imul(liveSeed ^ (liveSeed >>> 15), 1 | liveSeed) + 0x6D2B79F5) | 0;
  return ((liveSeed ^ (liveSeed >>> 14)) >>> 0) / 4294967296;
}

export const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
export const midi = n => 440 * Math.pow(2, (n - 69) / 12);
export const dB = v => Math.pow(10, v / 20);

/* --------------------------------------------------------
   buffers de ruído (cacheados por contexto)
   -------------------------------------------------------- */
const noiseCache = new WeakMap();

export function noiseBuf(ctx, kind = 'white', seconds = 3) {
  let m = noiseCache.get(ctx);
  if (!m) { m = new Map(); noiseCache.set(ctx, m); }
  const key = kind + ':' + seconds;
  const hit = m.get(key);
  if (hit) return hit;

  const n = Math.max(2, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const r = mulberry(0x5EED + ch * 7919 + seconds * 977 + kind.charCodeAt(0) * 31);
    if (kind === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = r() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.76160 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.16;
        b6 = w * 0.115926;
      }
    } else if (kind === 'brown') {
      let l = 0;
      for (let i = 0; i < n; i++) { const w = r() * 2 - 1; l = (l + 0.02 * w) / 1.02; d[i] = l * 3.2; }
    } else {
      for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    }
    /* janela cruzada nas pontas: o laço não estala */
    const fade = Math.min(1024, (n / 8) | 0);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = d[i] * k + d[n - fade + i] * (1 - k);
    }
    /* normaliza para pico 1 */
    let pk = 1e-6;
    for (let i = 0; i < n; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; }
    const g = 0.98 / pk;
    for (let i = 0; i < n; i++) d[i] *= g;
  }
  m.set(key, buf);
  return buf;
}

/* --------------------------------------------------------
   envoltórias — sempre como curva de valores
   -------------------------------------------------------- */
/* o = {a, d, s, r, pow, n}  (tempos em segundos, s em 0..1) */
export function envCurve(dur, o = {}) {
  const n = Math.max(8, Math.min(1024, o.n || Math.round(clamp(dur * 900, 48, 512))));
  let a = Math.max(0.0004, o.a === undefined ? 0.004 : o.a);
  let s = o.s === undefined ? 0 : clamp(o.s, 0, 1);
  let r = o.r === undefined ? (s > 0 ? Math.min(0.08, dur * 0.3) : 0) : o.r;
  let d = o.d === undefined ? Math.max(0.001, dur - a - r) : o.d;
  const pow = o.pow === undefined ? 2.6 : o.pow;
  /* nunca deixa os estágios ultrapassarem a duração */
  const total = a + d + r;
  if (total > dur) { const k = dur / total * 0.999; a *= k; d *= k; r *= k; }
  const sus = Math.max(0, dur - a - d - r);

  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) * dur;
    let v;
    if (t < a) v = Math.pow(t / a, 0.62);                       /* ataque levemente convexo */
    else if (t < a + d) { const x = (t - a) / d; v = s + (1 - s) * Math.pow(1 - x, pow); }
    else if (t < a + d + sus) v = s;
    else { const x = clamp((t - a - d - sus) / Math.max(r, 1e-5), 0, 1); v = s * Math.pow(1 - x, 1.8); }
    arr[i] = v;
  }
  arr[0] = 0; arr[n - 1] = 0;
  return arr;
}

/* aplica a envoltória a um AudioParam de ganho, escalada por `peak` */
export function applyEnv(param, t0, dur, peak, o) {
  const c = envCurve(dur, o);
  const out = new Float32Array(c.length);
  for (let i = 0; i < c.length; i++) out[i] = c[i] * peak;
  try { param.setValueCurveAtTime(out, t0, dur); } catch (e) { /* contexto morto */ }
  return t0 + dur;
}

/* --------------------------------------------------------
   nós utilitários
   -------------------------------------------------------- */
export function gain(ctx, v = 0) { const g = ctx.createGain(); g.gain.value = v; return g; }

export function filt(ctx, type, f, q, g) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = clamp(f, 10, ctx.sampleRate * 0.48);
  if (q !== undefined) b.Q.value = q;
  if (g !== undefined) b.gain.value = g;
  return b;
}

/* curva de saturação suave (tanh) — cola e evita picos duros */
const shaperCache = new WeakMap();
export function shaperCurve(k = 2.2, n = 2048) {
  const c = new Float32Array(n);
  const d = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / d;
  }
  return c;
}
export function makeShaper(ctx, k = 2.2) {
  let m = shaperCache.get(ctx);
  if (!m) { m = new Map(); shaperCache.set(ctx, m); }
  let curve = m.get(k);
  if (!curve) { curve = shaperCurve(k); m.set(k, curve); }
  const w = ctx.createWaveShaper();
  w.curve = curve;
  w.oversample = '4x';
  return w;
}

/* --------------------------------------------------------
   oscilador com envoltória — o tijolo mais usado
   o = {f, f2, type, dur, gain, a, d, s, r, pow, detune, fm:{f,depth},
        filter:{type,f,f2,q}, delayStart}
   -------------------------------------------------------- */
export function tone(ctx, dest, t0, o) {
  const dur = o.dur === undefined ? 0.15 : o.dur;
  const peak = o.gain === undefined ? 0.2 : o.gain;
  if (dur <= 0 || peak <= 0) return t0;

  const g = gain(ctx, 0);
  let node = g;

  if (o.filter) {
    const f = filt(ctx, o.filter.type || 'lowpass', o.filter.f, o.filter.q);
    if (o.filter.f2 !== undefined) {
      f.frequency.setValueAtTime(clamp(o.filter.f, 10, 20000), t0);
      f.frequency.exponentialRampToValueAtTime(clamp(o.filter.f2, 10, 20000), t0 + dur);
    }
    g.connect(f); node = f;
  }
  node.connect(dest);

  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  const f0 = clamp(o.f || 440, 0.01, ctx.sampleRate * 0.47);
  osc.frequency.setValueAtTime(f0, t0);
  if (o.f2 !== undefined) {
    const f1 = clamp(o.f2, 0.01, ctx.sampleRate * 0.47);
    if (o.linSweep) osc.frequency.linearRampToValueAtTime(f1, t0 + dur);
    else osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  }
  if (o.detune) osc.detune.value = o.detune;

  let fmOsc = null, fmGain = null;
  if (o.fm) {
    fmOsc = ctx.createOscillator();
    fmOsc.type = o.fm.type || 'sine';
    fmOsc.frequency.value = clamp(o.fm.f, 0.01, 18000);
    fmGain = gain(ctx, o.fm.depth);
    if (o.fm.decay) {
      fmGain.gain.setValueAtTime(o.fm.depth, t0);
      fmGain.gain.setTargetAtTime(o.fm.depth * 0.05, t0, o.fm.decay);
    }
    fmOsc.connect(fmGain); fmGain.connect(osc.frequency);
    fmOsc.start(t0); fmOsc.stop(t0 + dur + 0.05);
  }

  osc.connect(g);
  applyEnv(g.gain, t0, dur, peak, o);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  return t0 + dur;
}

/* --------------------------------------------------------
   rajada de ruído filtrado
   o = {dur, gain, band:[f0,f1], type, q, a, d, s, r, pow, kind}
   -------------------------------------------------------- */
export function nz(ctx, dest, t0, o) {
  const dur = o.dur === undefined ? 0.1 : o.dur;
  const peak = o.gain === undefined ? 0.12 : o.gain;
  if (dur <= 0 || peak <= 0) return t0;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuf(ctx, o.kind || 'white', 3);
  src.loop = true;
  src.loopEnd = src.buffer.duration;
  /* ponto de partida variável: duas rajadas nunca são idênticas */
  const off = (o.offset === undefined ? rnd() : o.offset) * (src.buffer.duration - dur - 0.05);
  if (o.rate) src.playbackRate.value = o.rate;

  const g = gain(ctx, 0);
  let head = g;

  if (o.band) {
    const f = filt(ctx, o.type || 'bandpass', o.band[0], o.q === undefined ? 3 : o.q);
    if (o.band[1] !== undefined && o.band[1] !== o.band[0]) {
      f.frequency.setValueAtTime(clamp(o.band[0], 10, 20000), t0);
      f.frequency.exponentialRampToValueAtTime(clamp(o.band[1], 10, 20000), t0 + dur);
    }
    src.connect(f); f.connect(g);
    if (o.band2) {
      const f2 = filt(ctx, o.type2 || 'highpass', o.band2, 0.7);
      g.disconnect(); g.connect(f2); head = f2;
    }
  } else {
    src.connect(g);
  }

  head.connect(dest);
  applyEnv(g.gain, t0, dur, peak, o);
  src.start(t0, Math.max(0, off));
  src.stop(t0 + dur + 0.02);
  return t0 + dur;
}

/* --------------------------------------------------------
   reverberação: resposta ao impulso gerada em código
   -------------------------------------------------------- */
const irCache = new WeakMap();
export function impulseResponse(ctx, o = {}) {
  const dur = o.dur || 1.6;
  const decay = o.decay || 3.0;
  const damp = o.damp === undefined ? 0.42 : o.damp;   /* 0 = brilhante, 1 = escuro */
  const key = dur + ':' + decay + ':' + damp;
  let m = irCache.get(ctx);
  if (!m) { m = new Map(); irCache.set(ctx, m); }
  if (m.has(key)) return m.get(key);

  const sr = ctx.sampleRate;
  const n = Math.max(8, Math.floor(sr * dur));
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const r = mulberry(0xBEEF + ch * 3571 + Math.floor(dur * 1000));
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      /* o filtro passa-baixa fecha com o tempo: cauda escurece */
      const coef = 1 - damp * Math.pow(t, 0.45) * 0.92;
      lp += ((r() * 2 - 1) - lp) * clamp(coef, 0.02, 1);
      d[i] = lp * Math.pow(1 - t, decay);
    }
    /* reflexões iniciais discretas dão espaço e tamanho à sala */
    const early = [0.011, 0.019, 0.027, 0.041, 0.058, 0.079];
    for (let k = 0; k < early.length; k++) {
      const idx = Math.floor((early[k] + (ch ? 0.0031 : 0)) * sr);
      if (idx < n) d[idx] += (0.7 - k * 0.09) * (r() > 0.5 ? 1 : -1);
    }
    /* fade final garantido */
    const f = Math.min(512, n >> 2);
    for (let i = 0; i < f; i++) d[n - f + i] *= 1 - i / f;
    d[0] = 0;
  }
  m.set(key, buf);
  return buf;
}

export function makeReverb(ctx, o = {}) {
  const input = gain(ctx, 1);
  const pre = ctx.createDelay(0.5);
  pre.delayTime.value = o.predelay === undefined ? 0.018 : o.predelay;
  const hp = filt(ctx, 'highpass', o.hp || 180, 0.7);
  const conv = ctx.createConvolver();
  conv.normalize = true;
  conv.buffer = impulseResponse(ctx, o);
  const out = gain(ctx, o.gain === undefined ? 1 : o.gain);
  input.connect(pre); pre.connect(hp); hp.connect(conv); conv.connect(out);
  return { input, output: out, conv };
}

/* --------------------------------------------------------
   delay com realimentação amortecida
   -------------------------------------------------------- */
export function makeDelay(ctx, o = {}) {
  const input = gain(ctx, 1);
  const d = ctx.createDelay(2.0);
  d.delayTime.value = o.time === undefined ? 0.24 : o.time;
  const fb = gain(ctx, o.feedback === undefined ? 0.34 : o.feedback);
  const damp = filt(ctx, 'lowpass', o.damp || 2600, 0.7);
  const out = gain(ctx, o.gain === undefined ? 1 : o.gain);
  input.connect(d); d.connect(damp); damp.connect(fb); fb.connect(d);
  d.connect(out);
  return { input, output: out, delay: d, feedback: fb };
}

/* --------------------------------------------------------
   LFO ligado a um AudioParam
   -------------------------------------------------------- */
export function lfo(ctx, param, o = {}) {
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.value = o.f === undefined ? 0.2 : o.f;
  const g = gain(ctx, o.depth === undefined ? 1 : o.depth);
  osc.connect(g); g.connect(param);
  osc.start(o.t0 || 0);
  return { osc, gain: g, stop(t) { try { osc.stop(t); } catch (e) { } } };
}

/* --------------------------------------------------------
   DTMF — os tons reais da discagem por tom
   -------------------------------------------------------- */
const DTMF_LOW = [697, 770, 852, 941];
const DTMF_HIGH = [1209, 1336, 1477, 1633];
const DTMF_MAP = {
  '1': [0, 0], '2': [0, 1], '3': [0, 2], 'A': [0, 3],
  '4': [1, 0], '5': [1, 1], '6': [1, 2], 'B': [1, 3],
  '7': [2, 0], '8': [2, 1], '9': [2, 2], 'C': [2, 3],
  '*': [3, 0], '0': [3, 1], '#': [3, 2], 'D': [3, 3]
};

export function dtmf(ctx, dest, t0, digit, o = {}) {
  const p = DTMF_MAP[String(digit).toUpperCase()];
  if (!p) return t0;
  const dur = o.dur === undefined ? 0.075 : o.dur;
  const g = o.gain === undefined ? 0.16 : o.gain;
  const env = { a: 0.0025, d: 0.004, s: 1, r: 0.006, pow: 1 };
  tone(ctx, dest, t0, { f: DTMF_LOW[p[0]], type: 'sine', dur, gain: g, ...env });
  tone(ctx, dest, t0, { f: DTMF_HIGH[p[1]], type: 'sine', dur, gain: g * 0.86, ...env });
  return t0 + dur;
}

/* sequência completa: tom de linha, dígitos, chamada */
export function dialSequence(ctx, dest, t0, number, o = {}) {
  const gap = o.gap === undefined ? 0.055 : o.gap;
  let t = t0;
  /* tom de linha 350 + 440 Hz */
  if (o.dialtone !== false) {
    const dt = o.dialtoneDur === undefined ? 0.5 : o.dialtoneDur;
    tone(ctx, dest, t, { f: 350, type: 'sine', dur: dt, gain: 0.09, a: 0.02, d: 0.01, s: 1, r: 0.05, pow: 1 });
    tone(ctx, dest, t, { f: 440, type: 'sine', dur: dt, gain: 0.09, a: 0.02, d: 0.01, s: 1, r: 0.05, pow: 1 });
    t += dt + 0.08;
  }
  const digits = String(number || '5550142');
  for (let i = 0; i < digits.length; i++) {
    dtmf(ctx, dest, t, digits[i], { dur: o.dur || 0.072, gain: o.gain });
    t += (o.dur || 0.072) + gap;
  }
  return t;
}

/* --------------------------------------------------------
   corpo percussivo reutilizável: um "clunk" com massa
   -------------------------------------------------------- */
export function thump(ctx, dest, t0, o = {}) {
  const f = o.f || 90;
  const dur = o.dur || 0.22;
  tone(ctx, dest, t0, {
    f: f * 2.6, f2: f * 0.62, type: 'sine', dur, gain: (o.gain || 0.5),
    a: 0.0018, d: dur * 0.8, pow: 3.4
  });
  nz(ctx, dest, t0, {
    dur: Math.min(0.05, dur * 0.4), gain: (o.gain || 0.5) * 0.35,
    band: [o.click || 2600, 500], q: 0.9, a: 0.0008, pow: 4
  });
  return t0 + dur;
}
