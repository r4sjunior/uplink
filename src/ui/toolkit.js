/* =========================================================
   toolkit.js — o núcleo da interface.

   MODELO ESCOLHIDO: **modo imediato com estado retido por identidade.**

   Toda a árvore de interface é reconstruída a cada desenho. Não existe
   objeto de widget vivo: existe um `id` textual estável e um mapa de
   estado (`UI.state(id)`) para o que precisa sobreviver ao frame —
   rolagem, cursor de texto, ordenação de tabela.

   Por que imediato: a interface do jogo muda o tempo todo (relógio,
   trace, progresso de ferramenta) e é redesenhada inteira numa textura.
   Um grafo retido só acrescentaria sincronização entre dois estados.

   O preço do modo imediato é o hit-testing: um widget desenhado cedo
   não sabe que outro vai cobri-lo depois. A solução é a clássica: o
   frame N registra quem estava sob o cursor (o ÚLTIMO desenhado ganha,
   que é exatamente a ordem de pintura), e o frame N+1 usa esse `id`
   como "quente". Um frame de latência, ordem z sempre correta.

   ------------------------------------------------------------------
   CICLO DE UM FRAME
   ------------------------------------------------------------------
      UI.install(surface)      uma vez, em Shell.init
      ...
      UI.begin(ctx, dt)        drena a fila de entrada, resolve o quente
        ... desenhe ...
      UI.flushOverlay()        popups, tooltips, tudo que fica por cima
      UI.end()                 limpa flags de frame

   ------------------------------------------------------------------
   NITIDEZ
   ------------------------------------------------------------------
   A superfície tem supersampling fracionário (1, 1.5 ou 2). Nenhuma
   linha é desenhada com `stroke`: linhas e molduras saem de `fillRect`
   com bordas alinhadas ao pixel do DISPOSITIVO (`UI.px()`), o único
   jeito de garantir aresta dura em qualquer ss. `stroke` fica reservado
   a curvas (gráficos, ícones), onde o antialias é desejado.
   ========================================================= */

import { Input } from './surface.js';
import { Bus, EV } from '../core/bus.js';
import { C, FONT, SPACE, METRIC, SHADOW, GLOW, RATE, alpha, mix } from './theme.js';
import { Text } from './text.js';
import { Anim, Dirty, clamp } from './anim.js';

/* bandeiras devolvidas por UI.probe() — inteiro, para não alocar */
export const HOVER = 1;
export const PRESSED = 2;     /* botão do mouse desceu neste frame sobre o widget */
export const CLICK = 4;       /* clique completo sobre o widget */
export const HELD = 8;        /* botão mantido pressionado com o widget ativo */
export const RELEASE = 16;

/* ---------------------------------------------------------
   Pool de retângulos: layout sem alocar dentro do laço.
   --------------------------------------------------------- */
const POOL_MAX = 512;
const _pool = new Array(POOL_MAX);
for (let i = 0; i < POOL_MAX; i++) _pool[i] = { x: 0, y: 0, w: 0, h: 0 };
let _poolI = 0;

export const UI = {
  /* --- contexto e superfície --- */
  ctx: null, surface: null, W: 1920, H: 1080, ss: 1,
  dt: 0, time: 0, frameNo: 0,

  /* --- ponteiro --- */
  mx: -1e5, my: -1e5, mdown: false, inside: false,
  pressed: false, released: false, clicked: false, wheel: 0,
  dragDX: 0, dragDY: 0, _lastMX: 0, _lastMY: 0,

  /* --- identidades --- */
  hotId: null, _hotNext: null, activeId: null, focusId: null,
  _lockLayer: 0, _hotLayer: -1, _layer: 0,

  /* --- teclado --- */
  keys: [], _keyQueue: [], _focusClaimed: false,

  /* --- interno --- */
  _state: new Map(),
  _seen: new Set(),
  _clip: [0, 0, 1920, 1080],
  _clipStack: [],
  _overlay: [],
  _grads: new Map(),
  _layers: new Map(),
  _installed: false,
  _pointerEvents: [],
  _sfxOn: true,

  /* =======================================================
     INSTALAÇÃO
     ======================================================= */
  install(surface) {
    this.surface = surface;
    this.W = surface.W; this.H = surface.H; this.ss = surface.ss;
    Text.setSupersample(surface.ss);
    Dirty.bind(surface);
    if (this._installed) return;
    this._installed = true;

    Input.route('move', e => { this._pointerEvents.push(0, e.x, e.y); Dirty.mark(); return false; });
    Input.route('down', e => { this._pointerEvents.push(1, e.x, e.y); Dirty.mark(); return true; });
    Input.route('up', e => { this._pointerEvents.push(2, e.x, e.y); Dirty.mark(); return true; });
    Input.route('click', e => { this._pointerEvents.push(3, e.x, e.y); Dirty.mark(); return true; });
    Input.route('wheel', e => { this._pointerEvents.push(4, e.x, e.y, e.dy); Dirty.mark(); return true; });
    Input.route('leave', () => { this._pointerEvents.push(5, -1e5, -1e5); Dirty.mark(); return false; });
    Input.route('key', e => {
      const ev = e.ev;
      this._keyQueue.push({
        key: e.key,
        ctrl: !!(ev && (ev.ctrlKey || ev.metaKey)),
        shift: !!(ev && ev.shiftKey),
        alt: !!(ev && ev.altKey),
        ev
      });
      Dirty.mark();
      return true;
    });
  },

  /* =======================================================
     FRAME
     ======================================================= */
  begin(ctx, dt) {
    this.ctx = ctx;
    this.dt = dt;
    this.time += dt;
    this.frameNo++;
    _poolI = 0;

    /* --- drena a entrada acumulada desde o último desenho --- */
    this.pressed = this.released = this.clicked = false;
    this.wheel = 0;
    const q = this._pointerEvents;
    for (let i = 0; i < q.length;) {
      const t = q[i];
      if (t === 4) { this.wheel += q[i + 3]; this.mx = q[i + 1]; this.my = q[i + 2]; i += 4; continue; }
      const x = q[i + 1], y = q[i + 2];
      this.mx = x; this.my = y;
      if (t === 0) this.inside = true;
      else if (t === 1) { this.mdown = true; this.pressed = true; this.inside = true; }
      else if (t === 2) { this.mdown = false; this.released = true; }
      else if (t === 3) this.clicked = true;
      else if (t === 5) { this.inside = false; }
      i += 3;
    }
    q.length = 0;

    this.dragDX = this.mx - this._lastMX;
    this.dragDY = this.my - this._lastMY;
    this._lastMX = this.mx; this._lastMY = this.my;

    /* --- teclado --- */
    this.keys = this._keyQueue;
    this._keyQueue = [];

    /* --- quente resolvido a partir do frame anterior --- */
    this.hotId = this._hotNext;
    this._hotNext = null;
    this._hotLayer = -1;
    this._layer = 0;
    if (!this.mdown) this.activeId = null;

    this._clip[0] = 0; this._clip[1] = 0; this._clip[2] = this.W; this._clip[3] = this.H;
    this._clipStack.length = 0;
    this._overlay.length = 0;
    this._seen.clear();
    this._focusClaimed = false;
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'miter';
  },

  /** Desenha o que foi adiado (menus abertos, dicas, brindes). */
  flushOverlay() {
    const ov = this._overlay;
    for (let i = 0; i < ov.length; i++) { this._layer = 100 + i; ov[i](); }
    ov.length = 0;
    this._layer = 0;
  },

  end() {
    /* um clique no vazio tira o foco de quem estava editando */
    if (this.pressed && !this._focusClaimed && this.focusId !== null) this.focusId = null;
    /* poda o estado de widgets que não apareceram por muitos frames */
    if ((this.frameNo & 255) === 0) {
      for (const [k, v] of this._state) {
        if (this.frameNo - v._seenAt > 900) this._state.delete(k);
      }
    }
    this.ctx = null;
  },

  /** Adia um desenho para depois de todo o resto (ganha o hit-test). */
  defer(fn) { this._overlay.push(fn); },

  /* =======================================================
     ESTADO RETIDO
     ======================================================= */
  /** Estado persistente de um widget. `init` só é chamado na primeira vez. */
  state(id, init) {
    let s = this._state.get(id);
    if (s === undefined) {
      s = init ? init() : {};
      s._seenAt = this.frameNo;
      this._state.set(id, s);
      return s;
    }
    s._seenAt = this.frameNo;
    return s;
  },

  forget(id) { this._state.delete(id); Anim.forget(id); },

  /* =======================================================
     ENTRADA / HIT-TESTING
     ======================================================= */
  /** Ponto dentro do recorte atual? */
  inClip(x, y) {
    const c = this._clip;
    return x >= c[0] && x < c[2] && y >= c[1] && y < c[3];
  },

  /**
   * Testa um retângulo e devolve as bandeiras HOVER|PRESSED|CLICK|HELD.
   * Registra o widget como candidato a "quente" do próximo frame.
   */
  probe(id, x, y, w, h) {
    let f = 0;
    const mx = this.mx, my = this.my;
    const over = this.inside && mx >= x && mx < x + w && my >= y && my < y + h && this.inClip(mx, my);
    if (over && this._layer >= this._hotLayer) { this._hotNext = id; this._hotLayer = this._layer; }
    const hot = this.hotId === id;
    if (hot) {
      f |= HOVER;
      if (this.pressed) { f |= PRESSED; this.activeId = id; }
      if (this.clicked) f |= CLICK;
      if (this.released) f |= RELEASE;
    }
    if (this.activeId === id && this.mdown) f |= HELD;
    return f;
  },

  /** Só o teste geométrico, sem virar quente (fundos, áreas mortas). */
  inside_(x, y, w, h) {
    const mx = this.mx, my = this.my;
    return this.inside && mx >= x && mx < x + w && my >= y && my < y + h;
  },

  /** Marca uma região como "capturadora": impede que o fundo receba o clique. */
  block(id, x, y, w, h) { this.probe(id, x, y, w, h); },

  /** Valor contínuo 0..1 de um estado (hover, pressão, foco). */
  fade(key, on, rate) { return Anim.smooth(key, on ? 1 : 0, rate || RATE.hover, this.dt); },

  setFocus(id) { this._focusClaimed = true; if (this.focusId !== id) { this.focusId = id; Dirty.mark(); } },
  keepFocus() { this._focusClaimed = true; },
  hasFocus(id) { return this.focusId === id; },

  /** Consome a fila de teclado (só o widget focado deve chamar). */
  takeKeys() { const k = this.keys; this.keys = []; return k; },

  sfx(name) { if (this._sfxOn) Bus.emit(EV.SFX, { name }); },

  /* =======================================================
     RECORTE
     ======================================================= */
  pushClip(x, y, w, h) {
    const c = this._clip;
    this._clipStack.push(c[0], c[1], c[2], c[3]);
    const x0 = Math.max(c[0], x), y0 = Math.max(c[1], y);
    const x1 = Math.min(c[2], x + w), y1 = Math.min(c[3], y + h);
    c[0] = x0; c[1] = y0; c[2] = Math.max(x0, x1); c[3] = Math.max(y0, y1);
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, c[2] - x0, c[3] - y0);
    ctx.clip();
  },

  popClip() {
    const st = this._clipStack, c = this._clip;
    c[3] = st.pop(); c[2] = st.pop(); c[1] = st.pop(); c[0] = st.pop();
    this.ctx.restore();
  },

  /* =======================================================
     LAYOUT — "corte de retângulo". Cada corte devolve a fatia
     e encolhe o retângulo original. Zero alocação: pool.
     ======================================================= */
  rect(x, y, w, h) {
    const r = _pool[_poolI++ & (POOL_MAX - 1)];
    r.x = x; r.y = y; r.w = w; r.h = h;
    return r;
  },
  copy(r) { return this.rect(r.x, r.y, r.w, r.h); },

  cutTop(r, h)    { const o = this.rect(r.x, r.y, r.w, h); r.y += h; r.h -= h; return o; },
  cutBottom(r, h) { r.h -= h; return this.rect(r.x, r.y + r.h, r.w, h); },
  cutLeft(r, w)   { const o = this.rect(r.x, r.y, w, r.h); r.x += w; r.w -= w; return o; },
  cutRight(r, w)  { r.w -= w; return this.rect(r.x + r.w, r.y, w, r.h); },

  /** Corta e ainda pula `gap` — o padrão para pilhas verticais. */
  stackTop(r, h, gap)  { const o = this.cutTop(r, h); r.y += gap; r.h -= gap; return o; },
  stackLeft(r, w, gap) { const o = this.cutLeft(r, w); r.x += gap; r.w -= gap; return o; },

  /** Encolhe por dentro (padding). Um a quatro valores, como no CSS. */
  pad(r, t, rr, b, l) {
    if (rr === undefined) { rr = b = l = t; }
    else if (b === undefined) { b = t; l = rr; }
    else if (l === undefined) { l = rr; }
    return this.rect(r.x + l, r.y + t, Math.max(0, r.w - l - rr), Math.max(0, r.h - t - b));
  },

  /** i-ésima de `n` colunas iguais com `gap` entre elas. */
  col(r, n, i, gap) {
    gap = gap || 0;
    const w = (r.w - gap * (n - 1)) / n;
    return this.rect(r.x + i * (w + gap), r.y, w, r.h);
  },
  /** i-ésima de `n` linhas iguais. */
  row(r, n, i, gap) {
    gap = gap || 0;
    const h = (r.h - gap * (n - 1)) / n;
    return this.rect(r.x, r.y + i * (h + gap), r.w, h);
  },
  /** Célula (cx,cy) de uma grade cols×rows. */
  cell(r, cols, rows, cx, cy, gap) {
    gap = gap || 0;
    const w = (r.w - gap * (cols - 1)) / cols, h = (r.h - gap * (rows - 1)) / rows;
    return this.rect(r.x + cx * (w + gap), r.y + cy * (h + gap), w, h);
  },
  /** Centraliza uma caixa w×h dentro de r. */
  centerBox(r, w, h) {
    return this.rect(r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h);
  },

  hitRect(id, r) { return this.probe(id, r.x, r.y, r.w, r.h); },

  /* =======================================================
     PRIMITIVAS DE DESENHO — todas alinhadas ao dispositivo
     ======================================================= */
  /** Alinha uma coordenada lógica ao pixel do dispositivo. */
  px(v) { const s = this.ss; return Math.round(v * s) / s; },
  /** Espessura mínima visível: 1 pixel lógico, nunca menos que 1 do dispositivo. */
  hairW() { return Math.max(1 / this.ss, this.px(1)); },

  /** Retângulo preenchido com arestas duras. */
  fill(x, y, w, h, color) {
    const ctx = this.ctx, s = this.ss;
    const x0 = Math.round(x * s) / s, y0 = Math.round(y * s) / s;
    const x1 = Math.round((x + w) * s) / s, y1 = Math.round((y + h) * s) / s;
    ctx.fillStyle = color;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  },
  fillR(r, color) { this.fill(r.x, r.y, r.w, r.h, color); },

  /** Linha horizontal de 1px lógico, cravada no pixel. */
  hline(x, y, w, color, thick) {
    this.fill(x, y, w, thick || 1, color);
  },
  vline(x, y, h, color, thick) {
    this.fill(x, y, thick || 1, h, color);
  },

  /** Moldura de espessura `t` desenhada por dentro do retângulo. */
  frame(x, y, w, h, color, t) {
    t = t || 1;
    this.fill(x, y, w, t, color);
    this.fill(x, y + h - t, w, t, color);
    this.fill(x, y + t, t, h - t * 2, color);
    this.fill(x + w - t, y + t, t, h - t * 2, color);
  },
  frameR(r, color, t) { this.frame(r.x, r.y, r.w, r.h, color, t); },

  /** Moldura tracejada (usada no realce de alvo do Connection Analyser). */
  dashFrame(x, y, w, h, color, dash, t) {
    t = t || 2; dash = dash || 8;
    const step = dash * 2;
    for (let i = 0; i < w; i += step) this.fill(x + i, y, Math.min(dash, w - i), t, color);
    for (let i = 0; i < w; i += step) this.fill(x + i, y + h - t, Math.min(dash, w - i), t, color);
    for (let i = 0; i < h; i += step) this.fill(x, y + i, t, Math.min(dash, h - i), color);
    for (let i = 0; i < h; i += step) this.fill(x + w - t, y + i, t, Math.min(dash, h - i), color);
  },

  /* --- gradientes memoizados: criar CanvasGradient por frame é caro --- */
  vGrad(y0, y1, c0, c1) {
    const key = 'v' + Math.round(y0) + ':' + Math.round(y1) + ':' + c0 + ':' + c1;
    let g = this._grads.get(key);
    if (!g) {
      g = this.ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      if (this._grads.size > 700) this._grads.clear();
      this._grads.set(key, g);
    }
    return g;
  },
  hGrad(x0, x1, c0, c1) {
    const key = 'h' + Math.round(x0) + ':' + Math.round(x1) + ':' + c0 + ':' + c1;
    let g = this._grads.get(key);
    if (!g) {
      g = this.ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      if (this._grads.size > 700) this._grads.clear();
      this._grads.set(key, g);
    }
    return g;
  },
  radGrad(cx, cy, r, c0, c1) {
    const key = 'r' + Math.round(cx) + ':' + Math.round(cy) + ':' + Math.round(r) + ':' + c0 + ':' + c1;
    let g = this._grads.get(key);
    if (!g) {
      g = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      if (this._grads.size > 700) this._grads.clear();
      this._grads.set(key, g);
    }
    return g;
  },

  /** Fundo de painel: gradiente vertical + leve brilho no topo esquerdo. */
  fillVGrad(x, y, w, h, c0, c1) {
    const ctx = this.ctx, s = this.ss;
    ctx.fillStyle = this.vGrad(y, y + h, c0, c1);
    const x0 = Math.round(x * s) / s, y0 = Math.round(y * s) / s;
    ctx.fillRect(x0, y0, Math.round((x + w) * s) / s - x0, Math.round((y + h) * s) / s - y0);
  },

  /* --- caminho arredondado (raro no Uplink, mas útil em brindes) --- */
  pathRound(x, y, w, h, r) {
    const ctx = this.ctx;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (r <= 0) { ctx.rect(x, y, w, h); return; }
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  },

  /* --- sombra e brilho por preset --- */
  shadowOn(p) {
    const ctx = this.ctx;
    ctx.shadowColor = p.color; ctx.shadowBlur = p.blur;
    ctx.shadowOffsetX = p.x || 0; ctx.shadowOffsetY = p.y || 0;
  },
  glowOn(p, scale) {
    const ctx = this.ctx;
    ctx.shadowColor = p.color; ctx.shadowBlur = p.blur * (scale === undefined ? 1 : scale);
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  },
  shadowOff() {
    const ctx = this.ctx;
    ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  },

  /* =======================================================
     CAMADAS EM CACHE
     Para o que é caro e quase estático: moldura do desktop,
     mapa-múndi, fundo com ruído. Só redesenha quando a
     assinatura muda.
     ======================================================= */
  /**
   * @param {string} key   identidade da camada
   * @param {number} w,h   tamanho em pixels lógicos
   * @param {string|number} sig  assinatura: muda ⇒ redesenha
   * @param {(lctx:CanvasRenderingContext2D, w:number, h:number)=>void} draw
   * @returns {HTMLCanvasElement}
   */
  layer(key, w, h, sig, draw) {
    let L = this._layers.get(key);
    const ss = this.ss;
    if (!L) {
      L = { cv: document.createElement('canvas'), sig: null, w: 0, h: 0 };
      this._layers.set(key, L);
    }
    const pw = Math.max(1, Math.round(w * ss)), ph = Math.max(1, Math.round(h * ss));
    if (L.sig !== sig || L.cv.width !== pw || L.cv.height !== ph) {
      L.cv.width = pw; L.cv.height = ph;
      const lc = L.cv.getContext('2d');
      lc.setTransform(ss, 0, 0, ss, 0, 0);
      lc.clearRect(0, 0, w, h);
      lc.textBaseline = 'alphabetic';
      const prev = this.ctx;
      this.ctx = lc;                       /* primitivas da toolkit valem dentro da camada */
      draw(lc, w, h);
      this.ctx = prev;
      L.sig = sig; L.w = w; L.h = h;
    }
    return L.cv;
  },

  /** Desenha uma camada em cache na posição (x,y). */
  blit(cv, x, y, w, h, alphaV) {
    const ctx = this.ctx;
    if (alphaV !== undefined && alphaV < 1) { ctx.save(); ctx.globalAlpha = alphaV; }
    ctx.drawImage(cv, this.px(x), this.px(y), w, h);
    if (alphaV !== undefined && alphaV < 1) ctx.restore();
  },

  dropLayer(key) { this._layers.delete(key); },

  /* =======================================================
     ATALHOS DE TEXTO (reexportados para não importar Text em todo lugar)
     ======================================================= */
  text(str, x, y, role, color, align) { Text.draw(this.ctx, str, x, y, role, color, align); },
  textIn(str, r, role, color, align, padX) {
    const p = padX === undefined ? SPACE.sm : padX;
    const x = align === 'center' ? r.x + r.w / 2 : (align === 'right' ? r.x + r.w - p : r.x + p);
    Text.drawFitIn(this.ctx, str, x, r.y, r.w - p * 2, r.h, role, color, align || 'left');
  },
  measure(str, role) { return Text.width(this.ctx, str, role); }
};

/* Helper de conveniência: quantidade de hover suavizada por id. */
export function hoverFade(id, flags, rate) {
  return UI.fade(id + '#h', (flags & HOVER) !== 0, rate || RATE.hover);
}
export function pressFade(id, flags, rate) {
  return UI.fade(id + '#p', (flags & HELD) !== 0, rate || RATE.press);
}

export { clamp };
export default UI;
