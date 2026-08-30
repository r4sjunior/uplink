/* =========================================================
   anim.js — motor de animação e controle de redesenho.

   Duas responsabilidades:

   A) ANIMAR. Tweens com curvas de qualidade, molas críticas,
      linhas do tempo com sequência e paralelismo, atrasos.
   B) DECIDIR QUANDO REDESENHAR. Redesenhar 1920x1080 a 60 Hz custa
      caro. `Dirty` é o único juiz: enquanto houver animação viva ou
      alguém tiver marcado sujeira, a superfície é invalidada; fora
      disso o frame é pulado inteiro e a textura nem sobe para a GPU.

   Uso típico:
      Anim.to(win, 'x', 320, TIME.window, 'expo.out');
      Anim.tween(0, 1, 0.4, { ease: 'back.out', onUpdate: v => obj.k = v });
      const t = Anim.timeline().to(a,'o',1,.3).wait(.1).to(b,'o',1,.3);
   ========================================================= */

/* =========================================================
   CURVAS
   Nomes no estilo "família.direção". `Ease.get('expo.out')`
   resolve uma vez e devolve a função — sem alocar por frame.
   ========================================================= */
const pow = Math.pow, sin = Math.sin, cos = Math.cos, PI = Math.PI, sqrt = Math.sqrt;

function outOf(fn) { return t => 1 - fn(1 - t); }
function inOutOf(fn) {
  return t => t < 0.5 ? fn(t * 2) / 2 : 1 - fn((1 - t) * 2) / 2;
}

const inQuad = t => t * t;
const inCubic = t => t * t * t;
const inQuart = t => t * t * t * t;
const inQuint = t => t * t * t * t * t;
const inExpo = t => t === 0 ? 0 : pow(2, 10 * t - 10);
const inCirc = t => 1 - sqrt(1 - t * t);
const inSine = t => 1 - cos((t * PI) / 2);
const inBack = t => { const c = 1.70158; return c * t * t * t - c * t * t * (1 + 0) + (1 + c) * t * t * t - c * t * t; };
const inBackReal = t => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; };
const inElastic = t => {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * PI) / 3;
  return -pow(2, 10 * t - 10) * sin((t * 10 - 10.75) * c4);
};
const outBounce = t => {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

export const Ease = {
  linear: t => t,

  'quad.in': inQuad, 'quad.out': outOf(inQuad), 'quad.inOut': inOutOf(inQuad),
  'cubic.in': inCubic, 'cubic.out': outOf(inCubic), 'cubic.inOut': inOutOf(inCubic),
  'quart.in': inQuart, 'quart.out': outOf(inQuart), 'quart.inOut': inOutOf(inQuart),
  'quint.in': inQuint, 'quint.out': outOf(inQuint), 'quint.inOut': inOutOf(inQuint),
  'expo.in': inExpo, 'expo.out': outOf(inExpo), 'expo.inOut': inOutOf(inExpo),
  'circ.in': inCirc, 'circ.out': outOf(inCirc), 'circ.inOut': inOutOf(inCirc),
  'sine.in': inSine, 'sine.out': outOf(inSine), 'sine.inOut': inOutOf(inSine),
  'back.in': inBackReal, 'back.out': outOf(inBackReal), 'back.inOut': inOutOf(inBackReal),
  'elastic.in': inElastic, 'elastic.out': outOf(inElastic), 'elastic.inOut': inOutOf(inElastic),
  'bounce.out': outBounce, 'bounce.in': outOf(outBounce),

  /* Curva do CRT: sobe rápido, desacelera com um leve overshoot contido.
     É a assinatura de movimento da interface — use nas janelas e telas. */
  crt: t => 1 - pow(1 - t, 3.2) * (1 - 0.08 * sin(t * PI)),

  get(name) {
    if (typeof name === 'function') return name;
    return Ease[name] || Ease['cubic.out'];
  }
};

/* =========================================================
   SUJEIRA / REDESENHO
   ========================================================= */
export const Dirty = {
  _flag: true,
  _surface: null,
  /* regiões pedidas neste frame (x,y,w,h achatados) — o consumidor pode
     usá-las para desenho parcial; o shell usa para saber o que mudou. */
  _rx0: Infinity, _ry0: Infinity, _rx1: -Infinity, _ry1: -Infinity,
  _hasRegion: false,

  bind(surface) { this._surface = surface; },

  /** Marca a superfície inteira como suja. */
  mark() {
    this._flag = true;
    this._hasRegion = false;
    if (this._surface) this._surface.invalidate();
  },

  /** Marca só uma região (une com as demais do frame). */
  region(x, y, w, h) {
    if (!this._hasRegion && this._flag) return;   /* já é tela cheia */
    this._hasRegion = true;
    this._flag = true;
    if (x < this._rx0) this._rx0 = x;
    if (y < this._ry0) this._ry0 = y;
    if (x + w > this._rx1) this._rx1 = x + w;
    if (y + h > this._ry1) this._ry1 = y + h;
    if (this._surface) this._surface.invalidate();
  },

  get isDirty() { return this._flag; },

  /** Chamado pelo shell no fim do desenho. */
  clear() {
    this._flag = false;
    this._hasRegion = false;
    this._rx0 = this._ry0 = Infinity;
    this._rx1 = this._ry1 = -Infinity;
  },

  /** Retângulo acumulado (ou null se for tela cheia). */
  bounds() {
    if (!this._hasRegion) return null;
    return { x: this._rx0, y: this._ry0, w: this._rx1 - this._rx0, h: this._ry1 - this._ry0 };
  }
};

/* =========================================================
   TWEEN
   ========================================================= */
class Tween {
  constructor(from, to, dur, o) {
    o = o || {};
    this.from = from; this.to = to;
    this.dur = Math.max(0.0001, dur);
    this.delay = o.delay || 0;
    this.ease = Ease.get(o.ease || 'cubic.out');
    this.onUpdate = o.onUpdate || null;
    this.onDone = o.onDone || null;
    this.target = o.target || null;   /* objeto e propriedade, alternativa a onUpdate */
    this.prop = o.prop || null;
    this.repeat = o.repeat || 0;      /* -1 = infinito */
    this.yoyo = !!o.yoyo;
    this.silent = !!o.silent;         /* não marca a superfície como suja */
    this.t = 0;
    this.dir = 1;
    this.done = false;
    this.value = from;
  }

  update(dt) {
    if (this.done) return false;
    if (this.delay > 0) {
      this.delay -= dt;
      if (this.delay > 0) return false;
      dt = -this.delay; this.delay = 0;
    }
    this.t += dt * this.dir;
    let finished = false;
    if (this.dir > 0 && this.t >= this.dur) {
      if (this.yoyo && this.repeat !== 0) { this.t = this.dur; this.dir = -1; if (this.repeat > 0) this.repeat--; }
      else if (this.repeat !== 0) { this.t -= this.dur; if (this.repeat > 0) this.repeat--; }
      else { this.t = this.dur; finished = true; }
    } else if (this.dir < 0 && this.t <= 0) {
      if (this.repeat !== 0) { this.t = 0; this.dir = 1; if (this.repeat > 0) this.repeat--; }
      else { this.t = 0; finished = true; }
    }
    const k = this.ease(this.t / this.dur);
    this.value = this.from + (this.to - this.from) * k;
    if (this.target && this.prop) this.target[this.prop] = this.value;
    if (this.onUpdate) this.onUpdate(this.value, k);
    if (finished) { this.done = true; if (this.onDone) this.onDone(); }
    return true;
  }

  cancel() { this.done = true; }
}

/* =========================================================
   MOLA — para arrasto, encaixe e reação de pressão.
   Amortecimento crítico por padrão: sem oscilação boba.
   ========================================================= */
export class Spring {
  /**
   * @param {number} value  valor inicial
   * @param {number} [stiff] rigidez (rad/s)^2 — 120..900
   * @param {number} [damp]  amortecimento; 1 = crítico
   */
  constructor(value = 0, stiff = 260, damp = 1) {
    this.value = value; this.target = value; this.v = 0;
    this.stiff = stiff; this.damp = damp;
  }
  set(v) { this.value = this.target = v; this.v = 0; }
  to(v) { this.target = v; }
  get settled() { return Math.abs(this.value - this.target) < 0.01 && Math.abs(this.v) < 0.05; }
  update(dt) {
    if (this.settled) { this.value = this.target; this.v = 0; return false; }
    /* integração semi-implícita, estável em passos grandes */
    const steps = dt > 1 / 45 ? 2 : 1;
    const h = dt / steps;
    const c = 2 * this.damp * Math.sqrt(this.stiff);
    for (let i = 0; i < steps; i++) {
      const a = (this.target - this.value) * this.stiff - this.v * c;
      this.v += a * h;
      this.value += this.v * h;
    }
    return true;
  }
}

/* =========================================================
   LINHA DO TEMPO — sequência com trilhas paralelas.
   ========================================================= */
class Timeline {
  constructor(engine) {
    this._engine = engine;
    this._steps = [];     /* {at, kind, ...} */
    this._cursor = 0;     /* posição de inserção em segundos */
    this._t = 0;
    this._max = 0;
    this._live = [];
    this.done = false;
    this.onDone = null;
  }

  /** Anima `obj[prop]` até `to`. `at` opcional força o instante de início. */
  to(obj, prop, to, dur, ease, at) {
    const start = at !== undefined ? at : this._cursor;
    this._steps.push({ at: start, kind: 'tw', obj, prop, to, dur, ease });
    this._cursor = start + dur;
    this._max = Math.max(this._max, this._cursor);
    return this;
  }

  /** Igual a `to`, mas começa junto com o passo anterior (trilha paralela). */
  with(obj, prop, to, dur, ease) {
    const prev = this._steps[this._steps.length - 1];
    const start = prev ? prev.at : 0;
    this._steps.push({ at: start, kind: 'tw', obj, prop, to, dur, ease });
    this._max = Math.max(this._max, start + dur);
    return this;
  }

  call(fn, at) {
    const start = at !== undefined ? at : this._cursor;
    this._steps.push({ at: start, kind: 'fn', fn });
    this._max = Math.max(this._max, start);
    return this;
  }

  wait(s) { this._cursor += s; this._max = Math.max(this._max, this._cursor); return this; }

  start() { this._engine._timelines.push(this); this._t = 0; this.done = false; return this; }

  update(dt) {
    if (this.done) return false;
    const prev = this._t;
    this._t += dt;
    let changed = false;
    for (let i = 0; i < this._steps.length; i++) {
      const s = this._steps[i];
      if (s._fired) continue;
      if (this._t >= s.at) {
        s._fired = true;
        if (s.kind === 'fn') { s.fn(); changed = true; }
        else {
          const tw = new Tween(s.obj[s.prop], s.to, s.dur, { target: s.obj, prop: s.prop, ease: s.ease });
          tw.update(this._t - s.at);
          this._live.push(tw);
          changed = true;
        }
      }
    }
    for (let i = this._live.length - 1; i >= 0; i--) {
      if (this._live[i].update(dt)) changed = true;
      if (this._live[i].done) this._live.splice(i, 1);
    }
    if (this._t >= this._max && !this._live.length) {
      this.done = true;
      if (this.onDone) this.onDone();
    }
    if (changed) Dirty.mark();
    return changed;
  }

  cancel() { this.done = true; this._live.length = 0; }
}

/* =========================================================
   MOTOR
   ========================================================= */
export const Anim = {
  _tweens: [],
  _springs: [],
  _timelines: [],
  _smooth: new Map(),   /* chave → valor contínuo (aproximação exponencial) */

  /** Tween cru com callback. */
  tween(from, to, dur, o) {
    const t = new Tween(from, to, dur, o);
    this._tweens.push(t);
    Dirty.mark();
    return t;
  },

  /** Anima uma propriedade de objeto. Cancela tweens anteriores da mesma chave. */
  to(obj, prop, to, dur, ease, onDone) {
    for (let i = this._tweens.length - 1; i >= 0; i--) {
      const t = this._tweens[i];
      if (t.target === obj && t.prop === prop) { t.cancel(); this._tweens.splice(i, 1); }
    }
    return this.tween(obj[prop] || 0, to, dur, { target: obj, prop, ease, onDone });
  },

  /** Executa `fn` depois de `s` segundos (ligado ao relógio da interface). */
  delay(s, fn) {
    return this.tween(0, 1, Math.max(0.0001, s), { onDone: fn, silent: true, ease: 'linear' });
  },

  spring(value, stiff, damp) {
    const s = new Spring(value, stiff, damp);
    this._springs.push(s);
    return s;
  },

  drop(spring) {
    const i = this._springs.indexOf(spring);
    if (i >= 0) this._springs.splice(i, 1);
  },

  timeline() { return new Timeline(this); },

  /**
   * Aproximação exponencial de um alvo, memorizada por chave.
   * É o mecanismo dos estados contínuos (hover, pressão, foco) no modo
   * imediato: não há objeto de widget para guardar o tween.
   * @param {string} key   identidade estável do widget + propriedade
   * @param {number} target
   * @param {number} rate  1/s — quanto maior, mais rápido
   * @param {number} dt
   */
  smooth(key, target, rate, dt) {
    let v = this._smooth.get(key);
    if (v === undefined) { this._smooth.set(key, target); return target; }
    if (Math.abs(v - target) < 0.0015) { if (v !== target) this._smooth.set(key, target); return target; }
    const k = 1 - Math.exp(-rate * dt);
    v = v + (target - v) * k;
    this._smooth.set(key, v);
    Dirty.mark();
    return v;
  },

  /** Descarta o estado contínuo de widgets que sumiram (chamado pelo toolkit). */
  /** Lê um valor suavizado sem avançá-lo. Devolve 1 se ainda não existe. */
  peek(key) {
    const v = this._smooth.get(key);
    return v === undefined ? 1 : v;
  },

  forget(prefix) {
    for (const k of this._smooth.keys()) if (k.startsWith(prefix)) this._smooth.delete(k);
  },

  /** Cancela tudo — usado em troca de tela. */
  clear() {
    this._tweens.length = 0;
    this._timelines.length = 0;
    this._smooth.clear();
  },

  /** @returns {boolean} true se algo animou (o shell repassa para Dirty) */
  update(dt) {
    let live = false;
    const tws = this._tweens;
    for (let i = tws.length - 1; i >= 0; i--) {
      const t = tws[i];
      if (t.update(dt)) { live = true; if (!t.silent) Dirty.mark(); }
      if (t.done) tws.splice(i, 1);
    }
    const sps = this._springs;
    for (let i = 0; i < sps.length; i++) if (sps[i].update(dt)) { live = true; Dirty.mark(); }
    const tls = this._timelines;
    for (let i = tls.length - 1; i >= 0; i--) {
      if (tls[i].update(dt)) live = true;
      if (tls[i].done) tls.splice(i, 1);
    }
    return live;
  },

  get busy() { return this._tweens.length > 0 || this._timelines.length > 0; }
};

/* =========================================================
   AUXILIARES NUMÉRICOS usados por toda a interface
   ========================================================= */
export const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => (b - a) === 0 ? 0 : (v - a) / (b - a);
export const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/** Ruído determinístico 1D — usado em cintilação e jitter, sem alocar. */
export function noise1(x) {
  const s = Math.sin(x * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

export default Anim;
