/* =========================================================
   windows.js — o gerenciador de janelas.

   Modelo retido sobre um toolkit de modo imediato: a LISTA de
   janelas e as suas caixas são estado; o desenho e o hit-test são
   refeitos a cada quadro. Isso dá arrasto e redimensionamento
   fluidos sem inventar um sistema de eventos paralelo.

   Empilhamento: a ordem do array é a ordem de desenho. Focar =
   mover para o fim. O hit-test corre ao contrário (de cima para
   baixo) e para na primeira janela atingida, para o clique nunca
   atravessar uma janela de cima.
   ========================================================= */
import { UI, HOVER, PRESSED, CLICK, HELD } from './toolkit.js';
import { W, Icon } from './widgets.js';
import { Text } from './text.js';
import { Anim, Ease, Dirty } from './anim.js';
import { C, FONT, SPACE, METRIC, GRID, alpha, snapGrid, TIME } from './theme.js';
import { Bus, EV } from '../core/bus.js';

const TITLE_H = 30;
const BORDER = 6;              /* zona sensível de redimensionamento */
const MIN_W = 320, MIN_H = 200;

let seq = 0;

export const Windows = {
  list: [],
  area: { x: 0, y: 0, w: 1920, h: 1080 },
  _drag: null,                 /* {id, mode, ox, oy, x0, y0, w0, h0} */

  /* =========================================================
     CICLO DE VIDA
     ========================================================= */

  /**
   * Abre (ou foca) uma janela.
   * @param {string} id     identidade estável — reabrir preserva a posição
   * @param {object} spec   {title, w, h, x, y, draw(rect, win), min, resizable, onClose}
   */
  open(id, spec) {
    const ja = this.get(id);
    if (ja) { this.focus(id); return ja; }

    const w = Math.max(MIN_W, spec.w || 720);
    const h = Math.max(MIN_H, spec.h || 480);

    /* posição: a lembrada, a pedida, ou em cascata a partir do centro */
    const mem = this._memory && this._memory[id];
    const n = this.list.length;
    const win = {
      id,
      title: spec.title || id,
      x: mem ? mem.x : (spec.x !== undefined ? spec.x
        : snapGrid(this.area.x + (this.area.w - w) / 2 + (n % 6) * 28 - 70)),
      y: mem ? mem.y : (spec.y !== undefined ? spec.y
        : snapGrid(this.area.y + (this.area.h - h) / 2 + (n % 6) * 24 - 60)),
      w: mem ? mem.w : w,
      h: mem ? mem.h : h,
      minW: spec.minW || MIN_W,
      minH: spec.minH || MIN_H,
      resizable: spec.resizable !== false,
      draw: spec.draw,
      onClose: spec.onClose || null,
      icon: spec.icon || null,
      app: spec.app || id,
      z: ++seq,
      born: UI.time,
      closing: 0
    };
    this.clampInside(win);
    this.list.push(win);
    Anim.forget('win:' + id + ':open');
    Bus.emit(EV.UI_OPEN, { app: win.app, id });
    Dirty.mark();
    return win;
  },

  close(id) {
    const w = this.get(id);
    if (!w || w.closing) return;
    w.closing = 0.0001;                 /* começa a animação de saída */
    this.remember(w);
    if (w.onClose) w.onClose();
    Bus.emit(EV.UI_CLOSE, { app: w.app, id });
    Dirty.mark();
  },

  closeAll() { this.list.slice().forEach(w => this.close(w.id)); },

  get(id) { return this.list.find(w => w.id === id) || null; },
  isOpen(id) { return !!this.get(id) && !this.get(id).closing; },
  top() { return this.list.length ? this.list[this.list.length - 1] : null; },
  isFocused(id) { const t = this.top(); return !!t && t.id === id; },

  focus(id) {
    const i = this.list.findIndex(w => w.id === id);
    if (i < 0 || i === this.list.length - 1) return;
    const [w] = this.list.splice(i, 1);
    w.z = ++seq;
    this.list.push(w);
    Bus.emit(EV.UI_FOCUS, { app: w.app, id });
    Dirty.mark();
  },

  /* posição e tamanho sobrevivem a fechar e reabrir */
  _memory: {},
  remember(w) {
    this._memory[w.id] = { x: w.x, y: w.y, w: w.w, h: w.h };
  },

  clampInside(w) {
    const a = this.area;
    w.w = Math.min(w.w, a.w - GRID * 2);
    w.h = Math.min(w.h, a.h - GRID * 2);
    /* deixa sempre a barra de título alcançável */
    w.x = Math.max(a.x - w.w + 120, Math.min(w.x, a.x + a.w - 120));
    w.y = Math.max(a.y, Math.min(w.y, a.y + a.h - TITLE_H));
  },

  /* =========================================================
     ARRASTO E REDIMENSIONAMENTO
     ========================================================= */
  _hitBorder(w, x, y) {
    if (!w.resizable) return null;
    const L = x >= w.x - BORDER && x <= w.x + BORDER;
    const R = x >= w.x + w.w - BORDER && x <= w.x + w.w + BORDER;
    const T = y >= w.y - BORDER && y <= w.y + BORDER;
    const B = y >= w.y + w.h - BORDER && y <= w.y + w.h + BORDER;
    const dentroX = x >= w.x - BORDER && x <= w.x + w.w + BORDER;
    const dentroY = y >= w.y - BORDER && y <= w.y + w.h + BORDER;
    if (!dentroX || !dentroY) return null;
    if (B && R) return 'se';
    if (B && L) return 'sw';
    if (T && R) return 'ne';
    if (T && L) return 'nw';
    if (B) return 's';
    if (T) return 'n';
    if (L) return 'w';
    if (R) return 'e';
    return null;
  },

  _updateDrag() {
    const d = this._drag;
    if (!d) return;
    const w = this.get(d.id);
    if (!w || !UI.mdown) { this._drag = null; if (w) this.remember(w); return; }

    const dx = UI.mx - d.ox;
    const dy = UI.my - d.oy;

    if (d.mode === 'move') {
      w.x = snapGrid(d.x0 + dx);
      w.y = snapGrid(d.y0 + dy);
    } else {
      const m = d.mode;
      if (m.includes('e')) w.w = Math.max(w.minW, snapGrid(d.w0 + dx));
      if (m.includes('s')) w.h = Math.max(w.minH, snapGrid(d.h0 + dy));
      if (m.includes('w')) {
        const nw = Math.max(w.minW, snapGrid(d.w0 - dx));
        w.x = snapGrid(d.x0 + (d.w0 - nw));
        w.w = nw;
      }
      if (m.includes('n')) {
        const nh = Math.max(w.minH, snapGrid(d.h0 - dy));
        w.y = snapGrid(d.y0 + (d.h0 - nh));
        w.h = nh;
      }
    }
    this.clampInside(w);
    Dirty.mark();
  },

  /* =========================================================
     DESENHO
     ========================================================= */
  draw(area, dt) {
    this.area = area;
    this._updateDrag();

    /* --- entrada: só a janela do topo sob o ponteiro reage --- */
    let capturada = null;
    if (!this._drag && UI.inside) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const w = this.list[i];
        if (w.closing) continue;
        const borda = this._hitBorder(w, UI.mx, UI.my);
        const dentro = UI.mx >= w.x && UI.mx <= w.x + w.w &&
                       UI.my >= w.y && UI.my <= w.y + w.h;
        if (borda || dentro) { capturada = { w, borda }; break; }
      }
    }

    /* clique inicia arrasto ou foco */
    if (capturada && UI.pressed) {
      const { w, borda } = capturada;
      this.focus(w.id);
      const naBarra = UI.my >= w.y && UI.my <= w.y + TITLE_H;
      if (borda) {
        this._drag = { id: w.id, mode: borda, ox: UI.mx, oy: UI.my, x0: w.x, y0: w.y, w0: w.w, h0: w.h };
      } else if (naBarra) {
        this._drag = { id: w.id, mode: 'move', ox: UI.mx, oy: UI.my, x0: w.x, y0: w.y, w0: w.w, h0: w.h };
      }
    }

    /* --- oclusão ---
       Uma janela completamente coberta por outra acima dela não
       precisa ser desenhada. Com meia dúzia de janelas empilhadas
       isso é a diferença entre 23 ms e 4 ms por quadro, e o teste
       custa quatro comparações por par. Só vale para janelas
       assentadas: uma em animação ainda é translúcida. */
    const oculta = new Array(this.list.length).fill(false);
    for (let i = 0; i < this.list.length - 1; i++) {
      const a = this.list[i];
      if (a.closing) continue;
      for (let j = i + 1; j < this.list.length; j++) {
        const b = this.list[j];
        if (b.closing) continue;
        if (Anim.peek('win:' + b.id + ':open') < 0.999) continue;
        if (b.x <= a.x && b.y <= a.y &&
            b.x + b.w >= a.x + a.w && b.y + b.h >= a.y + a.h) {
          oculta[i] = true;
          break;
        }
      }
    }

    /* --- desenho, de baixo para cima --- */
    for (let i = 0; i < this.list.length; i++) {
      const w = this.list[i];
      const focada = (i === this.list.length - 1) && !w.closing;
      if (oculta[i]) continue;

      /* animação de abrir e fechar */
      let k;
      if (w.closing) {
        w.closing += dt / 0.16;
        k = 1 - Math.min(1, w.closing);
        if (w.closing >= 1) { this.list.splice(i, 1); i--; Dirty.mark(); continue; }
        k = Ease.get('quad.in')(k);
      } else {
        k = Anim.smooth('win:' + w.id + ':open', 1, 22, dt);
      }
      if (k < 0.999) Dirty.mark();

      const escala = 0.965 + k * 0.035;
      const cx = w.x + w.w / 2, cy = w.y + w.h / 2;

      UI.ctx.save();
      UI.ctx.globalAlpha = Math.max(0, Math.min(1, k));
      UI.ctx.translate(cx, cy);
      UI.ctx.scale(escala, escala);
      UI.ctx.translate(-cx, -cy);

      this._frame(w, focada, dt);

      UI.ctx.restore();
    }

    /* cursor de redimensionamento como dica visual */
    if (capturada && capturada.borda && !this._drag) {
      this._resizeHint = capturada.borda;
    } else if (!this._drag) {
      this._resizeHint = null;
    }
  },

  _frame(w, focada, dt) {
    const r = UI.rect(w.x, w.y, w.w, w.h);

    /* --- sombra projetada --- */
    UI.shadowOn({ color: C.shadow, blur: focada ? 34 : 18, y: focada ? 10 : 5 });
    UI.fill(r.x, r.y, r.w, r.h, C.panelBottom);
    UI.shadowOff();

    /* --- corpo --- */
    UI.fillVGrad(r.x, r.y, r.w, r.h, C.panelTop, C.panelBottom);

    /* --- barra de título --- */
    const bar = UI.rect(r.x, r.y, r.w, TITLE_H);
    UI.fillVGrad(bar.x, bar.y, bar.w, bar.h,
      focada ? C.headTop : C.accentDim,
      focada ? C.headBottom : C.panelTop);
    /* filete superior: o brilho que dá volume à barra */
    UI.hline(bar.x + 1, bar.y + 1, bar.w - 2, alpha('#ffffff', focada ? 0.14 : 0.06));

    /* ícone */
    let tx = bar.x + SPACE.sm;
    if (w.icon && Icon[w.icon]) {
      Icon[w.icon](UI.ctx, tx + 7, bar.y + TITLE_H / 2, 14,
        focada ? C.cyanBright : C.textDim);
      tx += 24;
    }

    Text.drawIn(UI.ctx, w.title, tx, bar.y, TITLE_H, FONT.winTitle,
      focada ? C.textStrong : C.textDim, 'left');

    /* botão de fechar */
    const cb = UI.rect(bar.x + bar.w - TITLE_H, bar.y, TITLE_H, TITLE_H);
    const cf = UI.hitRect('win:' + w.id + ':x', cb);
    const chov = UI.fade('win:' + w.id + ':xh', (cf & HOVER) !== 0);
    if (chov > 0.01) UI.fill(cb.x + 1, cb.y + 1, cb.w - 2, cb.h - 2, alpha(C.danger, 0.30 * chov));
    Icon.close(UI.ctx, cb.x + cb.w / 2, cb.y + cb.h / 2, 9,
      chov > 0.5 ? C.dangerBright : (focada ? C.textDim : C.textFaint));
    if (cf & CLICK) { UI.sfx('window_close'); this.close(w.id); }

    /* --- moldura --- */
    UI.frameR(r, focada ? C.line3 : C.line2, 1);
    if (focada) {
      /* filete ciano no topo: marca a janela ativa sem gritar */
      UI.hline(r.x + 1, r.y, r.w - 2, alpha(C.lineHi, 0.55));
    }

    /* --- conteúdo --- */
    const inner = UI.rect(r.x + 1, r.y + TITLE_H, r.w - 2, r.h - TITLE_H - 1);
    UI.hline(inner.x, inner.y, inner.w, alpha('#000000', 0.5));

    UI.pushClip(inner.x, inner.y, inner.w, inner.h);
    try {
      if (w.draw) w.draw(UI.pad(inner, SPACE.sm, SPACE.sm), w);
    } catch (e) {
      /* uma tela quebrada não pode derrubar o jogo inteiro */
      Text.draw(UI.ctx, 'falha ao desenhar esta janela', inner.x + SPACE.sm,
        inner.y + SPACE.xl, FONT.bodySmall, C.danger);
      Text.draw(UI.ctx, String(e.message || e), inner.x + SPACE.sm,
        inner.y + SPACE.xl + 18, FONT.dataSmall, C.textFaint);
      if (!w._erroLogado) { w._erroLogado = true; console.error('[janela ' + w.id + ']', e); }
    }
    UI.popClip();

    /* --- alça de redimensionamento --- */
    if (w.resizable && focada) {
      const gx = r.x + r.w - 3, gy = r.y + r.h - 3;
      for (let i = 0; i < 3; i++) {
        UI.fill(gx - i * 4, gy - 1, 3, 1, alpha(C.line3, 0.8 - i * 0.2));
        UI.fill(gx - 1, gy - i * 4, 1, 3, alpha(C.line3, 0.8 - i * 0.2));
      }
    }
  },

  /* Bloqueia a entrada abaixo das janelas: o desktop não recebe
     clique que pertenceu a uma janela. */
  blockBelow() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i];
      if (w.closing) continue;
      UI.block('win:' + w.id + ':body', w.x - BORDER, w.y - BORDER,
        w.w + BORDER * 2, w.h + BORDER * 2);
    }
  },

  reset() {
    this.list.length = 0;
    this._drag = null;
    this._memory = {};
  }
};

export default Windows;
