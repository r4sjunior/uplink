/* =========================================================
   widgets.js — biblioteca de controles.

   Todo widget segue a mesma forma:

       W.algo(id, rect, dados, opts?) -> resultado

   • `id`    identidade textual estável (o mesmo id no mesmo lugar
             lógico em todos os frames). É a chave do estado retido,
             do hover e do foco.
   • `rect`  retângulo do pool do toolkit (UI.rect / UI.cutTop / ...).
   • `opts`  objeto opcional. Prefira hoistar objetos de opções
             constantes para fora do laço de desenho.

   Estados obrigatórios em todos os controles: normal, hover, ativo
   (pressionado), desabilitado e — quando faz sentido — perigo.
   As transições são contínuas via `UI.fade()`.

   A gramática visual vem de assets/ref: retângulos duros, molduras de
   1px, cabeçalho em barra de gradiente cobalto com título ciano
   espacejado, poços escuros para dados, nada de canto arredondado
   grande, nada de sombra difusa dentro do conteúdo.
   ========================================================= */

import { UI, HOVER, PRESSED, CLICK, HELD, hoverFade, pressFade } from './toolkit.js';
import { C, FONT, SPACE, METRIC, SHADOW, GLOW, TIME, RATE, alpha, mix, shade } from './theme.js';
import { Text } from './text.js';
import { Anim, Dirty, clamp, lerp } from './anim.js';

/* =========================================================
   ÍCONES VETORIAIS
   Cada função desenha centrada em (cx,cy) numa caixa de lado `s`.
   Traço fino, silhueta legível a 24px — o dock do Uplink é assim.
   ========================================================= */
function strokeSetup(ctx, color, w) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
}

export const Icon = {
  monitor(ctx, cx, cy, s, col) {
    const w = s * 0.86, h = s * 0.64, x = cx - w / 2, y = cy - h / 2 - s * 0.08;
    strokeSetup(ctx, col, Math.max(1, s * 0.075));
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = alpha(col, 0.22); ctx.fillRect(x + s * 0.09, y + s * 0.09, w - s * 0.18, h - s * 0.18);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.22, y + h + s * 0.16); ctx.lineTo(cx + s * 0.22, y + h + s * 0.16);
    ctx.moveTo(cx, y + h); ctx.lineTo(cx, y + h + s * 0.16);
    ctx.stroke();
  },
  mail(ctx, cx, cy, s, col) {
    const w = s * 0.88, h = s * 0.62, x = cx - w / 2, y = cy - h / 2;
    strokeSetup(ctx, col, Math.max(1, s * 0.075));
    ctx.strokeRect(x, y, w, h);
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(cx, cy + h * 0.16); ctx.lineTo(x + w, y);
    ctx.stroke();
  },
  disk(ctx, cx, cy, s, col) {
    const w = s * 0.78, x = cx - w / 2, y = cy - w / 2;
    strokeSetup(ctx, col, Math.max(1, s * 0.075));
    ctx.strokeRect(x, y, w, w);
    ctx.fillStyle = alpha(col, 0.7);
    ctx.fillRect(x + w * 0.24, y + w * 0.06, w * 0.52, w * 0.3);
    ctx.strokeRect(x + w * 0.16, y + w * 0.56, w * 0.68, w * 0.38);
  },
  people(ctx, cx, cy, s, col) {
    strokeSetup(ctx, col, Math.max(1, s * 0.075));
    ctx.beginPath(); ctx.arc(cx - s * 0.16, cy - s * 0.16, s * 0.15, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + s * 0.2, cy - s * 0.08, s * 0.11, 0, 6.2832); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.4, cy + s * 0.34); ctx.quadraticCurveTo(cx - s * 0.16, cy + s * 0.02, cx + s * 0.08, cy + s * 0.34);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.04, cy + s * 0.34); ctx.quadraticCurveTo(cx + s * 0.2, cy + s * 0.12, cx + s * 0.4, cy + s * 0.34);
    ctx.stroke();
  },
  money(ctx, cx, cy, s, col) {
    Text.draw(ctx, 'c', cx, cy + s * 0.3, FONT.dataBig, col, 'center');
    strokeSetup(ctx, col, Math.max(1, s * 0.07));
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.42); ctx.lineTo(cx, cy + s * 0.42); ctx.stroke();
  },
  map(ctx, cx, cy, s, col) {
    strokeSetup(ctx, col, Math.max(1, s * 0.07));
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.4, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.16, s * 0.4, 0, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - s * 0.4, cy); ctx.lineTo(cx + s * 0.4, cy); ctx.stroke();
  },
  chip(ctx, cx, cy, s, col) {
    const w = s * 0.56, x = cx - w / 2, y = cy - w / 2;
    strokeSetup(ctx, col, Math.max(1, s * 0.075));
    ctx.strokeRect(x, y, w, w);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const p = y + w * (0.22 + i * 0.28);
      ctx.moveTo(x - s * 0.14, p); ctx.lineTo(x, p);
      ctx.moveTo(x + w, p); ctx.lineTo(x + w + s * 0.14, p);
      const q = x + w * (0.22 + i * 0.28);
      ctx.moveTo(q, y - s * 0.14); ctx.lineTo(q, y);
      ctx.moveTo(q, y + w); ctx.lineTo(q, y + w + s * 0.14);
    }
    ctx.stroke();
  },
  lock(ctx, cx, cy, s, col) {
    strokeSetup(ctx, col, Math.max(1, s * 0.08));
    ctx.beginPath(); ctx.arc(cx, cy - s * 0.1, s * 0.2, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = col;
    ctx.fillRect(cx - s * 0.28, cy - s * 0.08, s * 0.56, s * 0.42);
  },
  node(ctx, cx, cy, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.44); ctx.lineTo(cx + s * 0.44, cy);
    ctx.lineTo(cx, cy + s * 0.44); ctx.lineTo(cx - s * 0.44, cy);
    ctx.closePath(); ctx.fill();
  },
  clock(ctx, cx, cy, s, col) {
    strokeSetup(ctx, col, Math.max(1, s * 0.08));
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.4, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.22); ctx.lineTo(cx, cy); ctx.lineTo(cx + s * 0.18, cy + s * 0.1); ctx.stroke();
  },
  alert(ctx, cx, cy, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.42); ctx.lineTo(cx + s * 0.46, cy + s * 0.36); ctx.lineTo(cx - s * 0.46, cy + s * 0.36);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.textOnAcc;
    ctx.fillRect(cx - s * 0.05, cy - s * 0.16, s * 0.1, s * 0.3);
    ctx.fillRect(cx - s * 0.05, cy + s * 0.22, s * 0.1, s * 0.08);
  },
  check(ctx, cx, cy, s, col) {
    strokeSetup(ctx, col, Math.max(1.5, s * 0.14));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.3, cy + s * 0.02);
    ctx.lineTo(cx - s * 0.06, cy + s * 0.26);
    ctx.lineTo(cx + s * 0.32, cy - s * 0.28);
    ctx.stroke();
    ctx.lineCap = 'butt';
  },
  close(ctx, cx, cy, s, col) {
    strokeSetup(ctx, col, Math.max(1.5, s * 0.12));
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.26, cy - s * 0.26); ctx.lineTo(cx + s * 0.26, cy + s * 0.26);
    ctx.moveTo(cx + s * 0.26, cy - s * 0.26); ctx.lineTo(cx - s * 0.26, cy + s * 0.26);
    ctx.stroke();
  },
  minus(ctx, cx, cy, s, col) {
    ctx.fillStyle = col;
    ctx.fillRect(cx - s * 0.28, cy - Math.max(1, s * 0.06), s * 0.56, Math.max(2, s * 0.12));
  },
  chevron(ctx, cx, cy, s, col, dir) {
    strokeSetup(ctx, col, Math.max(1.5, s * 0.12));
    const d = dir === 'up' ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.26, cy - s * 0.12 * d);
    ctx.lineTo(cx, cy + s * 0.16 * d);
    ctx.lineTo(cx + s * 0.26, cy - s * 0.12 * d);
    ctx.stroke();
  },
  play(ctx, cx, cy, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, cy - s * 0.3); ctx.lineTo(cx + s * 0.3, cy); ctx.lineTo(cx - s * 0.2, cy + s * 0.3);
    ctx.closePath(); ctx.fill();
  },
  pause(ctx, cx, cy, s, col) {
    ctx.fillStyle = col;
    ctx.fillRect(cx - s * 0.22, cy - s * 0.28, s * 0.16, s * 0.56);
    ctx.fillRect(cx + s * 0.06, cy - s * 0.28, s * 0.16, s * 0.56);
  },
  ffwd(ctx, cx, cy, s, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.32, cy - s * 0.26); ctx.lineTo(cx - s * 0.02, cy); ctx.lineTo(cx - s * 0.32, cy + s * 0.26);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.02, cy - s * 0.26); ctx.lineTo(cx + s * 0.32, cy); ctx.lineTo(cx + s * 0.02, cy + s * 0.26);
    ctx.closePath(); ctx.fill();
  },
  ffwd2(ctx, cx, cy, s, col) {
    Icon.ffwd(ctx, cx - s * 0.16, cy, s * 0.8, col);
    Icon.ffwd(ctx, cx + s * 0.26, cy, s * 0.8, col);
  },
  logo(ctx, cx, cy, s, col) {
    /* a marca do Uplink: um "U" estilizado em perspectiva */
    strokeSetup(ctx, col, Math.max(1.5, s * 0.055));
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.34, cy - s * 0.36);
    ctx.lineTo(cx - s * 0.34, cy + s * 0.18);
    ctx.quadraticCurveTo(cx - s * 0.34, cy + s * 0.38, cx - s * 0.06, cy + s * 0.38);
    ctx.lineTo(cx + s * 0.36, cy + s * 0.38);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.1, cy - s * 0.36);
    ctx.lineTo(cx + s * 0.1, cy + s * 0.1);
    ctx.stroke();
    ctx.fillStyle = alpha(col, 0.18);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.3, cy - s * 0.32); ctx.lineTo(cx + s * 0.06, cy - s * 0.32);
    ctx.lineTo(cx + s * 0.06, cy + s * 0.1); ctx.lineTo(cx - s * 0.3, cy + s * 0.1);
    ctx.closePath(); ctx.fill();
  }
};

/* =========================================================
   SUPERFÍCIES E MOLDURAS
   ========================================================= */
export const W = {

  /** Poço: fundo afundado para dados, listas e campos. */
  well(r, opts) {
    UI.fillVGrad(r.x, r.y, r.w, r.h, C.wellTop, C.wellBottom);
    UI.frameR(r, (opts && opts.border) || C.line1, 1);
    return UI.pad(r, 1);
  },

  /** Placa: superfície elevada neutra (corpo de janela). */
  plate(r, opts) {
    UI.fillVGrad(r.x, r.y, r.w, r.h, C.panelTop, C.panelBottom);
    UI.frameR(r, (opts && opts.border) || C.line2, 1);
    return UI.pad(r, 1);
  },

  /**
   * Painel no estilo Uplink: cabeçalho em barra de gradiente com título
   * ciano espacejado e corpo em gradiente cobalto.
   * @returns {{x,y,w,h}} retângulo do conteúdo (já com respiro interno)
   */
  panel(r, title, opts) {
    opts = opts || {};
    const headH = opts.headH || METRIC.headerH;
    UI.fillVGrad(r.x, r.y, r.w, r.h, C.panelTop, C.panelBottom);
    UI.frameR(r, opts.border || C.line2, 1);

    if (title) {
      UI.fillVGrad(r.x + 1, r.y + 1, r.w - 2, headH, opts.headTop || C.headTop, opts.headBottom || C.headBottom);
      UI.hline(r.x + 1, r.y + 1 + headH, r.w - 2, alpha(C.lineHi, 0.5));
      UI.hline(r.x + 1, r.y + 1, r.w - 2, alpha('#ffffff', 0.10));
      Text.center(UI.ctx, title, r.x + 1, r.y + 1, r.w - 2, headH, FONT.panelTitle, opts.titleColor || C.textStrong);
      const inner = UI.rect(r.x + 1, r.y + headH + 2, r.w - 2, r.h - headH - 3);
      return UI.pad(inner, opts.padY === undefined ? SPACE.sm : opts.padY,
        opts.padX === undefined ? SPACE.sm : opts.padX);
    }
    return UI.pad(r, opts.padY === undefined ? SPACE.sm : opts.padY,
      opts.padX === undefined ? SPACE.sm : opts.padX);
  },

  /** Cabeçalho solto (barra de seção dentro de um painel). */
  sectionBar(r, title, opts) {
    opts = opts || {};
    UI.fillVGrad(r.x, r.y, r.w, r.h, opts.top || C.headTop, opts.bottom || C.headBottom);
    UI.frameR(r, alpha(C.line3, 0.6), 1);
    Text.center(UI.ctx, title, r.x, r.y, r.w, r.h, FONT.label, opts.color || C.textStrong);
  },

  /** Divisória de 1px com respiro; use no lugar de espaços vazios ambíguos. */
  separator(r, color) {
    UI.hline(r.x, r.y + Math.floor(r.h / 2), r.w, color || C.line1);
  },
  vSeparator(r, color) {
    UI.vline(r.x + Math.floor(r.w / 2), r.y, r.h, color || C.line1);
  },

  /* =======================================================
     BOTÕES
     ======================================================= */
  /**
   * @param {object} [o] {disabled, danger, primary, font, align, icon, badge, tip}
   * @returns {boolean} clicado neste frame
   */
  button(id, r, label, o) {
    o = o || {};
    const dis = !!o.disabled;
    const f = dis ? 0 : UI.hitRect(id, r);
    const hv = UI.fade(id + '#h', !dis && (f & HOVER) !== 0, RATE.hover);
    const pr = UI.fade(id + '#p', (f & HELD) !== 0, RATE.press);
    const dy = pr * 1;

    let faceA, faceB, edge, txt;
    if (dis) { faceA = C.btnDisFace; faceB = C.btnDisFace; edge = C.btnDisEdge; txt = C.btnDisText; }
    else if (o.danger) {
      faceA = mix('#2a0a0a', C.dangerDim, hv * 0.9); faceB = mix('#160406', '#5a0f0f', hv);
      edge = mix(C.dangerDim, C.dangerBright, hv); txt = mix('#ffb8b0', '#ffffff', hv);
    } else if (o.primary) {
      faceA = mix(C.cobalt ? C.cobalt : C.accentDim, C.cyanDim, hv * 0.8);
      faceA = mix('#0d3a86', '#0a7fa8', hv);
      faceB = mix('#061c4a', '#053a54', hv);
      edge = mix(C.line3, C.cyan, hv); txt = mix(C.textStrong, '#ffffff', hv);
    } else {
      faceA = mix(C.btnFace, C.btnFaceHover, hv); faceB = mix('#050d24', '#0a1c4e', hv);
      edge = mix(C.btnEdge, C.btnEdgeHover, hv); txt = mix(C.btnText, C.btnTextHover, hv);
    }
    faceA = mix(faceA, '#000000', pr * 0.22); faceB = mix(faceB, '#000000', pr * 0.22);

    const y = r.y + dy;
    UI.fillVGrad(r.x, y, r.w, r.h, faceA, faceB);
    /* filete superior: dá volume sem sombra difusa */
    UI.hline(r.x + 1, y + 1, r.w - 2, alpha('#ffffff', 0.10 + hv * 0.10));
    UI.frame(r.x, y, r.w, r.h, edge, 1);
    if (hv > 0.02 && !dis) {
      UI.ctx.save();
      UI.glowOn(o.danger ? GLOW.danger : GLOW.cyan, hv * 0.9);
      UI.frame(r.x, y, r.w, r.h, alpha(edge, 0.9), 1);
      UI.ctx.restore();
    }

    const font = o.font || FONT.button;
    let tx = r.x + r.w / 2, align = 'center';
    let avail = r.w - SPACE.lg;
    if (o.icon) {
      const s = Math.min(r.h * 0.5, 20);
      o.icon(UI.ctx, r.x + SPACE.sm + s / 2, y + r.h / 2, s, txt);
      tx = r.x + SPACE.sm + s + SPACE.xs; align = 'left';
      avail = r.w - (tx - r.x) - SPACE.sm;
    }
    Text.drawFitIn(UI.ctx, label, tx, y, avail, r.h, font, txt, align);

    if (o.tip && (f & HOVER)) W.tooltip(o.tip, r.x + r.w / 2, r.y - SPACE.xs);
    if ((f & CLICK) && !dis) { UI.sfx(o.danger ? 'ui_click_alt' : 'ui_click'); return true; }
    return false;
  },

  /** Botão só de ícone (dock, barra de título, controles de velocidade). */
  iconButton(id, r, icon, o) {
    o = o || {};
    /* aceita tanto a função de desenho quanto o NOME do ícone: o resto
       do jogo guarda ícones por nome (a barra de ferramentas, as
       janelas), e obrigar o chamador a resolver era só uma armadilha */
    if (typeof icon === 'string') icon = Icon[icon];
    if (typeof icon !== 'function') icon = Icon.close;
    const dis = !!o.disabled;
    const f = dis ? 0 : UI.hitRect(id, r);
    const hv = UI.fade(id + '#h', !dis && (f & HOVER) !== 0, RATE.hover);
    const pr = UI.fade(id + '#p', (f & HELD) !== 0, RATE.press);
    const on = !!o.active;

    const faceA = dis ? C.btnDisFace : mix(on ? '#0c2a72' : C.btnFace, on ? '#14419e' : C.btnFaceHover, hv);
    const faceB = dis ? C.btnDisFace : mix(on ? '#061640' : '#050d24', '#0a1c4e', hv);
    const edge = dis ? C.btnDisEdge : mix(on ? C.line3 : C.btnEdge, C.btnEdgeHover, hv);
    const col = dis ? C.btnDisText : mix(on ? C.cyanBright : C.text, '#ffffff', hv * 0.7);

    const y = r.y + pr;
    UI.fillVGrad(r.x, y, r.w, r.h, mix(faceA, '#000', pr * 0.2), mix(faceB, '#000', pr * 0.2));
    UI.frame(r.x, y, r.w, r.h, edge, 1);
    if (on) UI.hline(r.x + 1, y + r.h - 3, r.w - 2, C.cyan, 2);
    const s = o.size || Math.min(r.w, r.h) * 0.56;
    icon(UI.ctx, r.x + r.w / 2, y + r.h / 2, s, col);

    if (o.badge > 0) W.badge(r.x + r.w - SPACE.xxs, y + SPACE.xxs, o.badge, o.badgeColor || C.danger);
    if (o.tip && (f & HOVER)) W.tooltip(o.tip, r.x + r.w / 2, r.y - SPACE.xxs);
    if ((f & CLICK) && !dis) { UI.sfx('ui_click'); return true; }
    return false;
  },

  /** Botão de alternância; devolve o novo valor. */
  toggle(id, r, label, on, o) {
    o = o || {};
    o.active = on;
    const clicked = W.button(id, r, label, {
      disabled: o.disabled,
      primary: on,
      font: o.font,
      icon: o.icon,
      tip: o.tip
    });
    return clicked ? !on : on;
  },

  /* =======================================================
     BADGE, ETIQUETA, DICA
     ======================================================= */
  badge(x, y, value, color) {
    const txt = value > 99 ? '99+' : String(value);
    const w = Math.max(20, UI.measure(txt, FONT.labelSmall) + SPACE.sm);
    const h = 18;
    UI.fill(x - w, y, w, h, color || C.danger);
    UI.frame(x - w, y, w, h, alpha('#ffffff', 0.35), 1);
    Text.center(UI.ctx, txt, x - w, y, w, h, FONT.labelSmall, '#ffffff');
  },

  /** Etiqueta de status: retângulo colorido com texto curto em maiúsculas. */
  tag(r, label, color, opts) {
    const c = color || C.accent;
    UI.fillR(r, alpha(c, (opts && opts.solid) ? 0.9 : 0.16));
    UI.frameR(r, alpha(c, 0.85), 1);
    Text.center(UI.ctx, label, r.x, r.y, r.w, r.h, FONT.labelSmall,
      (opts && opts.solid) ? C.textOnAcc : mix(c, '#ffffff', 0.35));
  },

  /** Dica flutuante. É adiada para o fim do frame: nunca fica por baixo. */
  tooltip(txt, cx, bottomY) {
    UI.defer(() => {
      const pad = SPACE.xs;
      const w = UI.measure(txt, FONT.bodySmall) + pad * 2 + SPACE.xxs;
      const h = 28;
      let x = clamp(cx - w / 2, SPACE.xs, UI.W - w - SPACE.xs);
      let y = bottomY - h - SPACE.xxs;
      if (y < SPACE.xs) y = bottomY + SPACE.lg;
      UI.ctx.save();
      UI.shadowOn(SHADOW.popup);
      UI.fill(x, y, w, h, '#071026');
      UI.ctx.restore();
      UI.frame(x, y, w, h, C.line3, 1);
      UI.hline(x + 1, y + 1, w - 2, alpha(C.cyan, 0.4));
      Text.center(UI.ctx, txt, x, y, w, h, FONT.bodySmall, C.text);
    });
  },

  /* =======================================================
     CAMPO DE TEXTO
     ======================================================= */
  /**
   * @param {{value:string,caret:number,sel:number,scroll:number}} st  estado mutável do chamador
   * @param {object} [o] {password, placeholder, maxLen, font, onSubmit, filter, align, disabled}
   * @returns {'none'|'edit'|'submit'|'tab'}
   */
  /**
   * Campo ligado a uma PROPRIEDADE de outro objeto.
   *
   * `field` guarda o próprio estado de edição (cursor, seleção,
   * rolagem), o que é o certo — mas quase toda tela quer apenas
   * "edite `st.busca`". Este adaptador mantém o estado de edição
   * escondido em `UI.state` e sincroniza o valor nos dois sentidos.
   *
   * @returns {'none'|'edit'|'submit'|'tab'}
   */
  bind(id, r, obj, prop, o) {
    const fs = UI.state(id + '#bind', () => ({ value: '', caret: 0, sel: 0, scroll: 0 }));
    const externo = obj[prop] === undefined || obj[prop] === null ? '' : String(obj[prop]);
    /* mudou por fora (reset, carregamento de save): reposiciona o cursor */
    if (fs.value !== externo && fs._ultimo !== externo) {
      fs.value = externo;
      fs.caret = fs.sel = externo.length;
    }
    const res = W.field(id, r, fs, o);
    obj[prop] = fs.value;
    fs._ultimo = fs.value;
    return res;
  },

  field(id, r, st, o) {
    o = o || {};
    if (st.caret === undefined) st.caret = st.value.length;
    if (st.sel === undefined) st.sel = st.caret;
    if (st.scroll === undefined) st.scroll = 0;

    const dis = !!o.disabled;
    const f = dis ? 0 : UI.hitRect(id, r);
    const focused = UI.hasFocus(id);
    if ((f & PRESSED) && !dis) UI.setFocus(id);
    else if (focused) UI.keepFocus();

    const hv = UI.fade(id + '#h', (f & HOVER) !== 0, RATE.hover);
    const fc = UI.fade(id + '#f', focused, RATE.focus);
    const font = o.font || FONT.data;
    const padX = SPACE.sm;

    /* --- fundo --- */
    UI.fillVGrad(r.x, r.y, r.w, r.h, dis ? '#070c16' : C.wellTop, dis ? '#04070f' : C.wellBottom);
    const edge = dis ? C.btnDisEdge : mix(mix(C.line2, C.line3, hv), C.cyan, fc);
    UI.frameR(r, edge, 1);
    if (fc > 0.02) {
      UI.ctx.save(); UI.glowOn(GLOW.cyan, fc * 0.8);
      UI.frameR(r, alpha(C.cyan, 0.85), 1);
      UI.ctx.restore();
    }
    /* sombra interna no topo: reforça a sensação de poço */
    UI.hline(r.x + 1, r.y + 1, r.w - 2, alpha('#000000', 0.6));

    const shown = o.password ? '•'.repeat(st.value.length) : st.value;
    const ctx = UI.ctx;
    const innerW = r.w - padX * 2;

    /* --- teclado --- */
    let result = 'none';
    if (focused && !dis) {
      const keys = UI.takeKeys();
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const key = k.key;
        if (k.ev && k.ev.preventDefault && key !== 'F5' && key !== 'F12') k.ev.preventDefault();
        if (key === 'Enter') { result = 'submit'; if (o.onSubmit) o.onSubmit(st.value); }
        else if (key === 'Tab') { result = 'tab'; }
        else if (key === 'Backspace') {
          if (st.sel !== st.caret) { deleteSel(st); }
          else if (st.caret > 0) { st.value = st.value.slice(0, st.caret - 1) + st.value.slice(st.caret); st.caret--; st.sel = st.caret; }
          result = result === 'none' ? 'edit' : result;
          UI.sfx('key_back');
        }
        else if (key === 'Delete') {
          if (st.sel !== st.caret) deleteSel(st);
          else st.value = st.value.slice(0, st.caret) + st.value.slice(st.caret + 1);
          result = 'edit';
        }
        else if (key === 'ArrowLeft') { st.caret = Math.max(0, st.caret - 1); if (!k.shift) st.sel = st.caret; }
        else if (key === 'ArrowRight') { st.caret = Math.min(st.value.length, st.caret + 1); if (!k.shift) st.sel = st.caret; }
        else if (key === 'Home') { st.caret = 0; if (!k.shift) st.sel = 0; }
        else if (key === 'End') { st.caret = st.value.length; if (!k.shift) st.sel = st.caret; }
        else if (k.ctrl && (key === 'a' || key === 'A')) { st.sel = 0; st.caret = st.value.length; }
        else if (key && key.length === 1 && !k.ctrl && !k.alt) {
          let ch = key;
          if (o.filter && !o.filter(ch)) continue;
          if (st.sel !== st.caret) deleteSel(st);
          if (!o.maxLen || st.value.length < o.maxLen) {
            st.value = st.value.slice(0, st.caret) + ch + st.value.slice(st.caret);
            st.caret++; st.sel = st.caret;
            UI.sfx('key_press');
          }
          result = 'edit';
        }
      }
    }

    /* --- posição do cursor a partir do clique --- */
    const textX = r.x + padX - st.scroll;
    if ((f & PRESSED) && !dis) {
      st.caret = caretFromX(ctx, shown, font, textX, UI.mx);
      st.sel = st.caret;
    } else if ((f & HELD) && !dis && focused) {
      st.caret = caretFromX(ctx, shown, font, textX, UI.mx);
    }

    /* --- rolagem horizontal para manter o cursor visível --- */
    const caretW = Text.width(ctx, shown.slice(0, st.caret), font);
    if (caretW - st.scroll > innerW - 4) st.scroll = caretW - innerW + 4;
    if (caretW - st.scroll < 0) st.scroll = caretW;
    if (Text.width(ctx, shown, font) < innerW) st.scroll = 0;
    st.scroll = Math.max(0, st.scroll);

    /* --- conteúdo --- */
    UI.pushClip(r.x + 2, r.y + 1, r.w - 4, r.h - 2);
    const tx = r.x + padX - st.scroll;
    if (!shown.length && o.placeholder) {
      Text.drawIn(ctx, o.placeholder, tx, r.y, r.h, font, C.textFaint, 'left');
    } else {
      if (st.sel !== st.caret) {
        const a = Math.min(st.sel, st.caret), b = Math.max(st.sel, st.caret);
        const x0 = tx + Text.width(ctx, shown.slice(0, a), font);
        const x1 = tx + Text.width(ctx, shown.slice(0, b), font);
        UI.fill(x0, r.y + 5, x1 - x0, r.h - 10, alpha(C.cyan, 0.30));
      }
      Text.drawIn(ctx, shown, tx, r.y, r.h, font, dis ? C.btnDisText : C.textStrong, 'left');
    }

    /* --- cursor piscando --- */
    if (focused && !dis) {
      const phase = (UI.time * 1.7) % 1;
      const on = phase < 0.58;
      const blinkSt = UI.state(id + '#blink', () => ({ on: true }));
      if (blinkSt.on !== on) { blinkSt.on = on; Dirty.mark(); }
      if (on) {
        const cx = tx + caretW;
        UI.fill(cx, r.y + 5, 2, r.h - 10, C.cyanBright);
      }
    }
    UI.popClip();

    if (o.label) {
      Text.draw(ctx, o.label, r.x, r.y - SPACE.xs, FONT.label, focused ? C.cyan : C.textDim, 'left');
    }
    return result;
  },

  /* =======================================================
     CAIXAS DE MARCAÇÃO
     ======================================================= */
  checkbox(id, r, label, checked, o) {
    o = o || {};
    const dis = !!o.disabled;
    const f = dis ? 0 : UI.hitRect(id, r);
    const hv = UI.fade(id + '#h', (f & HOVER) !== 0, RATE.hover);
    const on = UI.fade(id + '#c', checked, RATE.press);
    const s = METRIC.checkbox;
    const bx = r.x, by = r.y + (r.h - s) / 2;

    UI.fillVGrad(bx, by, s, s, C.wellTop, C.wellBottom);
    UI.frame(bx, by, s, s, dis ? C.btnDisEdge : mix(C.line2, C.cyan, Math.max(hv * 0.6, on)), 1);
    if (on > 0.02) {
      UI.ctx.save(); UI.ctx.globalAlpha = on;
      Icon.check(UI.ctx, bx + s / 2, by + s / 2, s * 0.95, dis ? C.btnDisText : C.cyanBright);
      UI.ctx.restore();
    }
    if (label) Text.drawIn(UI.ctx, label, bx + s + SPACE.xs, r.y, r.h, FONT.bodySmall,
      dis ? C.btnDisText : mix(C.text, C.textStrong, hv), 'left');
    if ((f & CLICK) && !dis) { UI.sfx('ui_tick'); return !checked; }
    return checked;
  },

  radio(id, r, label, on, o) {
    o = o || {};
    const dis = !!o.disabled;
    const f = dis ? 0 : UI.hitRect(id, r);
    const hv = UI.fade(id + '#h', (f & HOVER) !== 0, RATE.hover);
    const k = UI.fade(id + '#c', on, RATE.press);
    const s = METRIC.checkbox;
    const cx = r.x + s / 2, cy = r.y + r.h / 2;
    const ctx = UI.ctx;
    ctx.beginPath(); ctx.arc(cx, cy, s / 2, 0, 6.2832);
    ctx.fillStyle = C.wellBottom; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = dis ? C.btnDisEdge : mix(C.line2, C.cyan, Math.max(hv * 0.6, k));
    ctx.stroke();
    if (k > 0.02) {
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.26 * k, 0, 6.2832);
      ctx.fillStyle = dis ? C.btnDisText : C.cyanBright; ctx.fill();
    }
    if (label) Text.drawIn(ctx, label, r.x + s + SPACE.xs, r.y, r.h, FONT.bodySmall,
      dis ? C.btnDisText : mix(C.text, C.textStrong, hv), 'left');
    if ((f & CLICK) && !dis && !on) { UI.sfx('ui_tick'); return true; }
    return on;
  },

  /* =======================================================
     DESLIZADOR
     ======================================================= */
  slider(id, r, value, min, max, o) {
    o = o || {};
    const dis = !!o.disabled;
    const f = dis ? 0 : UI.hitRect(id, r);
    const hv = UI.fade(id + '#h', (f & HOVER) !== 0, RATE.hover);
    const t = METRIC.sliderTrack, k = METRIC.sliderKnob;
    const trackY = r.y + (r.h - t) / 2;
    const x0 = r.x + k / 2, x1 = r.x + r.w - k / 2;
    let v = value;

    if ((f & HELD) && !dis) {
      v = min + (max - min) * clamp((UI.mx - x0) / (x1 - x0), 0, 1);
      if (o.step) v = Math.round(v / o.step) * o.step;
      if (v !== value) { Dirty.mark(); }
    }
    const p = clamp((v - min) / (max - min || 1), 0, 1);
    const kx = x0 + (x1 - x0) * p;

    UI.fill(r.x, trackY, r.w, t, C.wellBottom);
    UI.frame(r.x, trackY, r.w, t, C.line1, 1);
    UI.fill(r.x + 1, trackY + 1, Math.max(0, kx - r.x - 1), t - 2,
      dis ? C.btnDisEdge : UI.hGrad(r.x, kx, C.accentDim, mix(C.cyan, C.cyanBright, hv)));

    const ky = r.y + r.h / 2;
    UI.fill(kx - k / 2, ky - k / 2, k, k, dis ? C.btnDisFace : mix('#0e2670', '#1a41c4', hv));
    UI.frame(kx - k / 2, ky - k / 2, k, k, dis ? C.btnDisEdge : mix(C.line3, C.cyanBright, hv), 1);
    return v;
  },

  /* =======================================================
     BARRA DE PROGRESSO
     ======================================================= */
  /** @param {number} pct 0..1 */
  progress(r, pct, o) {
    o = o || {};
    pct = clamp(pct, 0, 1);
    const col = o.color || C.cyan;
    UI.fillVGrad(r.x, r.y, r.w, r.h, C.wellTop, C.wellBottom);
    UI.frameR(r, o.border || C.line2, 1);
    const iw = Math.floor((r.w - 2) * pct);
    if (iw > 0) {
      UI.fillVGrad(r.x + 1, r.y + 1, iw, r.h - 2, mix(col, '#ffffff', 0.22), mix(col, '#000000', 0.42));
      UI.hline(r.x + 1, r.y + 1, iw, alpha('#ffffff', 0.35));
    }
    /* marcas de escala a cada 10% — detalhe do original */
    if (o.ticks !== false) {
      for (let i = 1; i < 10; i++) {
        const x = r.x + 1 + (r.w - 2) * (i / 10);
        UI.vline(x, r.y + 1, r.h - 2, alpha('#000000', 0.35));
      }
    }
    if (o.label) {
      Text.center(UI.ctx, o.label, r.x, r.y, r.w, r.h, o.font || FONT.labelSmall,
        pct > 0.55 ? C.textOnAcc : C.text);
    }
  },

  /** Barra fina de medidor (CPU, banda, integridade). */
  meter(r, pct, color) {
    pct = clamp(pct, 0, 1);
    UI.fillR(r, C.wellBottom);
    const n = Math.max(1, Math.floor(r.w / 5));
    const lit = Math.round(n * pct);
    for (let i = 0; i < n; i++) {
      const x = r.x + i * 5;
      UI.fill(x, r.y, 3, r.h, i < lit ? (color || C.cyan) : alpha(C.line1, 0.7));
    }
  },

  /* =======================================================
     BARRA DE ROLAGEM
     ======================================================= */
  /**
   * @returns {number} novo deslocamento
   */
  scrollbarV(id, r, contentH, viewH, offset, o) {
    o = o || {};
    if (contentH <= viewH) return 0;
    const maxOff = contentH - viewH;
    let off = clamp(offset, 0, maxOff);

    UI.fillR(r, alpha('#000000', 0.5));
    UI.vline(r.x, r.y, r.h, C.line1);

    const minTh = 28;
    const th = Math.max(minTh, r.h * (viewH / contentH));
    const ty = r.y + (r.h - th) * (off / maxOff);
    const thumb = UI.rect(r.x + 2, ty, r.w - 3, th);
    const f = UI.hitRect(id, thumb);
    const hv = UI.fade(id + '#h', (f & HOVER) !== 0 || (f & HELD) !== 0, RATE.hover);

    const st = UI.state(id, () => ({ grab: 0 }));
    if (f & PRESSED) st.grab = UI.my - ty;
    if (f & HELD) {
      const p = clamp((UI.my - st.grab - r.y) / Math.max(1, r.h - th), 0, 1);
      off = p * maxOff;
      Dirty.mark();
    } else {
      /* clique na pista salta uma página */
      const ftrack = UI.probe(id + '#t', r.x, r.y, r.w, r.h);
      if (ftrack & PRESSED) off = clamp(off + (UI.my < ty ? -viewH : viewH), 0, maxOff);
    }

    UI.fillVGrad(thumb.x, thumb.y, thumb.w, thumb.h,
      mix(C.line2, C.line3, hv), mix('#0b1d3a', '#153563', hv));
    UI.frameR(thumb, mix(C.line3, C.cyan, hv), 1);
    /* três estrias no meio: afordância clássica */
    const my = thumb.y + thumb.h / 2;
    for (let i = -1; i <= 1; i++) UI.hline(thumb.x + 3, my + i * 3, thumb.w - 6, alpha('#000', 0.4));
    return off;
  },

  /* =======================================================
     LISTA VIRTUALIZADA
     Só desenha as linhas visíveis: aguenta dezenas de milhares.
     ======================================================= */
  /**
   * @param {object} st  {scroll, sel}  — estado mantido pelo chamador ou por UI.state
   * @param {(i:number, rect:object, hovered:boolean, selected:boolean)=>void} renderRow
   * @param {object} [o] {rowH, stripes, onActivate, empty}
   * @returns {object} st
   */
  list(id, r, count, renderRow, o) {
    o = o || {};
    const rowH = o.rowH || METRIC.rowH;
    const st = o.state || UI.state(id, () => ({ scroll: 0, sel: -1 }));
    if (st.scroll === undefined) st.scroll = 0;

    const contentH = count * rowH;
    const needBar = contentH > r.h;
    const barW = needBar ? METRIC.scrollW : 0;
    const view = UI.rect(r.x, r.y, r.w - barW, r.h);

    /* roda do mouse */
    if (UI.inside_(r.x, r.y, r.w, r.h) && UI.wheel !== 0 && UI.inClip(UI.mx, UI.my)) {
      st.scroll = clamp(st.scroll + UI.wheel * 0.6, 0, Math.max(0, contentH - r.h));
      Dirty.mark();
    }
    st.scroll = clamp(st.scroll, 0, Math.max(0, contentH - r.h));

    UI.pushClip(view.x, view.y, view.w, view.h);
    if (count === 0 && o.empty) {
      Text.center(UI.ctx, o.empty, view.x, view.y, view.w, Math.min(view.h, 80), FONT.bodySmall, C.textFaint);
    }
    const first = Math.max(0, Math.floor(st.scroll / rowH));
    const last = Math.min(count - 1, Math.ceil((st.scroll + view.h) / rowH));
    for (let i = first; i <= last; i++) {
      const ry = Math.round(view.y + i * rowH - st.scroll);
      const rr = UI.rect(view.x, ry, view.w, rowH);
      const f = UI.probe(id + ':' + i, rr.x, rr.y, rr.w, rr.h);
      const hovered = (f & HOVER) !== 0;
      const selected = st.sel === i;
      if (o.stripes !== false && (i & 1)) UI.fillR(rr, alpha('#0a1730', 0.45));
      if (selected) {
        UI.fillVGrad(rr.x, rr.y, rr.w, rr.h, '#123a86', '#0a2050');
        UI.vline(rr.x, rr.y, rr.h, C.cyanBright, 3);
      } else if (hovered) {
        UI.fillR(rr, alpha(C.accent, 0.16));
        UI.vline(rr.x, rr.y, rr.h, alpha(C.cyan, 0.7), 2);
      }
      renderRow(i, rr, hovered, selected);
      UI.hline(rr.x, rr.y + rowH - 1, rr.w, alpha(C.line1, 0.55));
      if (f & CLICK) {
        if (st.sel !== i) { st.sel = i; UI.sfx('ui_select'); }
        else if (o.onActivate) o.onActivate(i);
        if (o.onSelect) o.onSelect(i);
        Dirty.mark();
      }
    }
    UI.popClip();

    if (needBar) {
      st.scroll = W.scrollbarV(id + '#sb', UI.rect(r.x + r.w - barW, r.y, barW, r.h), contentH, r.h, st.scroll);
    }
    return st;
  },

  /* =======================================================
     TABELA COM COLUNAS E ORDENAÇÃO
     ======================================================= */
  /**
   * @param {Array<{key:string,label:string,w:number,align?:string,fmt?:Function,color?:Function}>} cols
   *        `w` é peso relativo (fração da largura).
   * @param {Array<object>} rows
   * @param {object} [o] {rowH, headH, onActivate, empty, state}
   * @returns {{sortKey:string,sortDir:number,sel:number}}
   */
  table(id, r, cols, rows, o) {
    o = o || {};
    const st = o.state || UI.state(id, () => ({ scroll: 0, sel: -1, sortKey: null, sortDir: 1 }));
    const headH = o.headH || METRIC.headerH;
    const body = UI.copy(r);
    const head = UI.cutTop(body, headH);

    /* --- cabeçalho --- */
    UI.fillVGrad(head.x, head.y, head.w, head.h, C.headTop, C.headBottom);
    UI.hline(head.x, head.y + head.h - 1, head.w, alpha(C.lineHi, 0.45));
    let totalW = 0;
    for (let i = 0; i < cols.length; i++) totalW += cols[i].w;
    const barW = (rows.length * (o.rowH || METRIC.rowH)) > body.h ? METRIC.scrollW : 0;
    const usable = head.w - barW;

    let cx = head.x;
    for (let i = 0; i < cols.length; i++) {
      const cw = Math.round(usable * (cols[i].w / totalW));
      const ch = UI.rect(cx, head.y, cw, head.h);
      const f = UI.hitRect(id + '#h' + i, ch);
      const hv = UI.fade(id + '#h' + i + 'f', (f & HOVER) !== 0, RATE.hover);
      if (hv > 0.02) UI.fillR(ch, alpha(C.cyan, 0.12 * hv));
      const active = st.sortKey === cols[i].key;
      const lbl = cols[i].label;
      const al = cols[i].align || 'left';
      const tx = al === 'right' ? ch.x + cw - SPACE.xs : (al === 'center' ? ch.x + cw / 2 : ch.x + SPACE.xs);
      Text.drawFitIn(UI.ctx, lbl, tx, ch.y, cw - SPACE.md, ch.h, FONT.label,
        active ? C.cyanBright : mix(C.text, C.textStrong, hv), al);
      if (active) {
        const aw = 10;
        Icon.chevron(UI.ctx, ch.x + cw - SPACE.xxs - aw / 2, ch.y + ch.h / 2, aw,
          C.cyanBright, st.sortDir > 0 ? 'down' : 'up');
      }
      if (i > 0) UI.vline(ch.x, head.y + 4, head.h - 8, alpha('#000', 0.5));
      if ((f & CLICK) && cols[i].key) {
        if (st.sortKey === cols[i].key) st.sortDir = -st.sortDir;
        else { st.sortKey = cols[i].key; st.sortDir = 1; }
        UI.sfx('ui_click');
        Dirty.mark();
      }
      cx += cw;
    }

    /* --- ordenação (estável) --- */
    let view = rows;
    if (st.sortKey) {
      const cache = UI.state(id + '#sorted', () => ({ src: null, key: null, dir: 0, out: null }));
      if (cache.src !== rows || cache.key !== st.sortKey || cache.dir !== st.sortDir) {
        const k = st.sortKey, d = st.sortDir;
        cache.out = rows.slice().sort((a, b) => {
          const va = a[k], vb = b[k];
          if (va === vb) return 0;
          if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * d;
          return String(va).localeCompare(String(vb), 'pt-BR') * d;
        });
        cache.src = rows; cache.key = k; cache.dir = d;
      }
      view = cache.out;
    }

    /* --- corpo --- */
    W.list(id + '#body', body, view.length, (i, rr) => {
      let x = rr.x;
      for (let c = 0; c < cols.length; c++) {
        const col = cols[c];
        const cw = Math.round((rr.w) * (col.w / totalW));
        const raw = view[i][col.key];
        const txt = col.fmt ? col.fmt(raw, view[i]) : (raw === undefined || raw === null ? '—' : String(raw));
        const al = col.align || 'left';
        const tx = al === 'right' ? x + cw - SPACE.xs : (al === 'center' ? x + cw / 2 : x + SPACE.xs);
        Text.drawFitIn(UI.ctx, txt, tx, rr.y, cw - SPACE.md, rr.h,
          col.font || FONT.bodySmall,
          col.color ? col.color(raw, view[i]) : C.text, al);
        x += cw;
      }
    }, { rowH: o.rowH, state: st, onActivate: o.onActivate ? (i) => o.onActivate(view[i], i) : null, empty: o.empty });

    st.rows = view;
    return st;
  },

  /* =======================================================
     ABAS
     ======================================================= */
  /**
   * @param {string[]} labels
   * @returns {number} índice ativo
   */
  tabs(id, r, labels, active, o) {
    o = o || {};
    const n = labels.length;
    let out = active;
    UI.hline(r.x, r.y + r.h - 1, r.w, C.line2);
    let x = r.x;
    for (let i = 0; i < n; i++) {
      const tw = o.fixed ? Math.floor(r.w / n)
        : Math.round(UI.measure(labels[i], FONT.label) + SPACE.xxl);
      const tr = UI.rect(x, r.y, tw, r.h);
      const f = UI.hitRect(id + ':' + i, tr);
      const hv = UI.fade(id + ':' + i + '#h', (f & HOVER) !== 0, RATE.hover);
      const on = i === active;
      const sel = UI.fade(id + ':' + i + '#s', on, RATE.focus);

      UI.fillVGrad(tr.x, tr.y, tr.w, tr.h,
        mix(on ? '#0f2e78' : '#0a142c', '#14357f', hv * 0.6),
        mix(on ? '#071a48' : '#050b1c', '#0a1f52', hv * 0.6));
      UI.frameR(tr, on ? C.line3 : C.line1, 1);
      if (sel > 0.02) UI.hline(tr.x + 1, tr.y + tr.h - 3, tr.w - 2, alpha(C.cyanBright, sel), 3);
      Text.center(UI.ctx, labels[i], tr.x, tr.y, tr.w, tr.h, FONT.label,
        on ? C.textStrong : mix(C.textDim, C.text, hv));
      if (f & CLICK) { out = i; UI.sfx('ui_click'); }
      x += tw;
    }
    return out;
  },

  /* =======================================================
     LISTA SUSPENSA
     ======================================================= */
  /**
   * @returns {number} índice selecionado
   */
  dropdown(id, r, items, index, o) {
    o = o || {};
    const st = UI.state(id, () => ({ open: false }));
    const f = UI.hitRect(id, r);
    const hv = UI.fade(id + '#h', (f & HOVER) !== 0, RATE.hover);
    let out = index;

    UI.fillVGrad(r.x, r.y, r.w, r.h, mix(C.btnFace, C.btnFaceHover, hv), mix('#050d24', '#0a1c4e', hv));
    UI.frameR(r, mix(C.btnEdge, C.btnEdgeHover, Math.max(hv, st.open ? 1 : 0)), 1);
    Text.drawFitIn(UI.ctx, items[index] !== undefined ? items[index] : '—',
      r.x + SPACE.sm, r.y, r.w - SPACE.h1, r.h, FONT.bodySmall, C.text, 'left');
    Icon.chevron(UI.ctx, r.x + r.w - SPACE.md, r.y + r.h / 2, 14,
      mix(C.textDim, C.cyanBright, hv), st.open ? 'up' : 'down');
    if (f & CLICK) { st.open = !st.open; UI.sfx('ui_click'); Dirty.mark(); }

    if (st.open) {
      const rowH = METRIC.rowH;
      const listH = Math.min(items.length * rowH, 8 * rowH) + 2;
      const lx = r.x, ly = r.y + r.h;
      UI.defer(() => {
        UI.ctx.save(); UI.shadowOn(SHADOW.popup);
        UI.fill(lx, ly, r.w, listH, '#050e22');
        UI.ctx.restore();
        UI.frame(lx, ly, r.w, listH, C.line3, 1);
        const inner = UI.rect(lx + 1, ly + 1, r.w - 2, listH - 2);
        W.list(id + '#list', inner, items.length, (i, rr, hov) => {
          Text.drawFitIn(UI.ctx, items[i], rr.x + SPACE.sm, rr.y, rr.w - SPACE.lg, rr.h,
            FONT.bodySmall, i === index ? C.cyanBright : C.text, 'left');
        }, {
          rowH, stripes: false,
          onSelect: (i) => { out = i; st.open = false; Dirty.mark(); }
        });
        /* clique fora fecha */
        if (UI.pressed && !UI.inside_(lx, ly, r.w, listH) && !UI.inside_(r.x, r.y, r.w, r.h)) {
          st.open = false; Dirty.mark();
        }
      });
    }
    return out;
  },

  /* =======================================================
     LINHA CHAVE→VALOR (o "statline" do Uplink)
     ======================================================= */
  stat(r, label, value, o) {
    o = o || {};
    const lw = o.labelW || Math.round(r.w * 0.42);
    Text.drawFitIn(UI.ctx, label, r.x, r.y, lw, r.h, o.labelFont || FONT.label, o.labelColor || C.textDim, 'left');
    /* pontilhado de ligação: detalhe tipográfico que amarra as colunas */
    if (o.dots !== false) {
      const y = r.y + Math.round(r.h / 2);
      const x0 = r.x + Math.min(lw, UI.measure(label, o.labelFont || FONT.label) + SPACE.xs);
      const vw = UI.measure(String(value), o.valueFont || FONT.dataStrong);
      const x1 = r.x + r.w - vw - SPACE.xs;
      for (let x = x0; x < x1; x += 6) UI.fill(x, y, 2, 1, alpha(C.line2, 0.8));
    }
    Text.drawFitIn(UI.ctx, String(value), r.x + r.w, r.y, r.w - lw, r.h,
      o.valueFont || FONT.dataStrong, o.valueColor || C.textStrong, 'right');
  },

  /* =======================================================
     BLOCO DE TEXTO ROLÁVEL
     ======================================================= */
  /**
   * Texto longo dentro de uma caixa, com rolagem por roda e barra.
   *
   * Existe porque desenhar texto com `pushClip` e um `y +=` corta o
   * que não cabe e não oferece jeito de ver o resto — foi o que
   * acontecia com o corpo do e-mail, o briefing do contrato, o
   * capítulo do manual e a matéria do noticiário.
   *
   * @param {Array<string|{t:string,font?:object,color?:string,gap?:number,lead?:number}>} blocos
   * @param {object} [o] {pad, state, fade}
   * @returns {{scroll:number, altura:number}}
   */
  textBlock(id, r, blocos, o) {
    o = o || {};
    const st = o.state || UI.state(id, () => ({ scroll: 0 }));
    /* o bloco não sonda nada (não é clicável), mas o QA precisa saber
       onde ele está para poder mirar a roda do mouse */
    if (UI._qa) UI._qaRects.set(id, [r.x, r.y, r.w, r.h]);
    if (st.scroll === undefined) st.scroll = 0;
    const padX = o.pad === undefined ? 0 : o.pad;

    /* --- quebra de linha, memorizada ---
       Reprocessar a quebra a cada quadro custaria uma medição de
       texto por palavra. A chave do cache é a largura mais uma
       assinatura barata do conteúdo. */
    let assinatura = '' + Math.round(r.w) + '|' + blocos.length;
    for (let i = 0; i < blocos.length; i++) {
      const b = blocos[i];
      const t = typeof b === 'string' ? b : (b.t || '');
      assinatura += '|' + t.length + (t.length > 8 ? t.charCodeAt(0) + '' + t.charCodeAt(t.length - 1) : t);
    }

    const cache = UI.state(id + '#wrap', () => ({ chave: null, linhas: null, altura: 0 }));
    if (cache.chave !== assinatura) {
      const larg = r.w - padX * 2 - METRIC.scrollW - SPACE.xs;
      const out = [];
      let y = 0;
      for (const b of blocos) {
        const txt = typeof b === 'string' ? b : (b.t || '');
        const font = (typeof b === 'object' && b.font) || FONT.body;
        const cor = (typeof b === 'object' && b.color) || C.text;
        const lead = (typeof b === 'object' && b.lead) || Math.round(font.size * 1.45);
        const gap = (typeof b === 'object' && b.gap !== undefined) ? b.gap : 0;
        const recuo = (typeof b === 'object' && b.recuo) || 0;

        if (!txt) { y += lead * 0.5 + gap; continue; }
        const partes = Text.wrap(UI.ctx, txt, font, larg - recuo);
        for (const q of partes) {
          out.push({ t: q, font, cor, y, recuo });
          y += lead;
        }
        y += gap;
      }
      cache.chave = assinatura;
      cache.linhas = out;
      cache.altura = y;
    }

    const linhas = cache.linhas;
    const alturaTotal = cache.altura;
    const precisaBarra = alturaTotal > r.h;
    const larguraBarra = precisaBarra ? METRIC.scrollW : 0;
    const vista = UI.rect(r.x, r.y, r.w - larguraBarra, r.h);

    /* --- roda --- */
    if (precisaBarra && UI.inside_(r.x, r.y, r.w, r.h) && UI.wheel !== 0 && UI.inClip(UI.mx, UI.my)) {
      st.scroll = clamp(st.scroll + UI.wheel * 0.6, 0, alturaTotal - r.h);
      Dirty.mark();
    }
    st.scroll = clamp(st.scroll, 0, Math.max(0, alturaTotal - r.h));

    /* --- desenho: só as linhas visíveis --- */
    UI.pushClip(vista.x, vista.y, vista.w, vista.h);
    const topo = st.scroll;
    const base = st.scroll + vista.h;
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      if (l.y + 24 < topo) continue;
      if (l.y > base) break;
      Text.draw(UI.ctx, l.t, vista.x + padX + l.recuo,
        Math.round(vista.y + l.y - topo + l.font.size), l.font, l.cor);
    }
    UI.popClip();

    /* --- pistas de que há mais texto ---
       Sem elas o corte parece fim de conteúdo, e o jogador não
       procura a rolagem que existe. */
    if (o.fade !== false && precisaBarra) {
      if (topo > 2) {
        const g = UI.vGrad(vista.y, vista.y + 18, alpha(C.panelBottom, 0.95), alpha(C.panelBottom, 0));
        UI.ctx.fillStyle = g;
        UI.ctx.fillRect(vista.x, vista.y, vista.w, 18);
      }
      if (base < alturaTotal - 2) {
        const g = UI.vGrad(vista.y + vista.h - 22, vista.y + vista.h,
          alpha(C.panelBottom, 0), alpha(C.panelBottom, 0.95));
        UI.ctx.fillStyle = g;
        UI.ctx.fillRect(vista.x, vista.y + vista.h - 22, vista.w, 22);
      }
    }

    if (precisaBarra) {
      st.scroll = W.scrollbarV(id + '#sb',
        UI.rect(r.x + r.w - larguraBarra, r.y, larguraBarra, r.h),
        alturaTotal, r.h, st.scroll);
    }

    return { scroll: st.scroll, altura: alturaTotal };
  },

  /* =======================================================
     TERMINAL COM SCROLLBACK
     ======================================================= */
  /**
   * @param {Array<{t:string,c?:string}|string>} lines  histórico (o mais antigo primeiro)
   * @param {object} [o] {lineH, font, prompt, follow, maxCols}
   */
  terminal(id, r, lines, o) {
    o = o || {};
    const st = UI.state(id, () => ({ scroll: 0, follow: true }));
    const font = o.font || FONT.term;
    const lineH = o.lineH || 24;
    const padX = SPACE.sm, padY = SPACE.xs;

    UI.fillVGrad(r.x, r.y, r.w, r.h, '#020610', '#01040a');
    UI.frameR(r, C.line2, 1);
    /* leve varredura de fósforo: 2px escuros a cada 4 — some no bloom */
    const ctx = UI.ctx;
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); ctx.clip();

    const inner = UI.pad(r, padY + 1, padX + 1);
    const viewLines = Math.floor(inner.h / lineH);
    const total = lines.length;
    const maxScroll = Math.max(0, total - viewLines);

    if (UI.inside_(r.x, r.y, r.w, r.h) && UI.wheel !== 0) {
      st.scroll = clamp(st.scroll - Math.sign(UI.wheel) * 3, 0, maxScroll);
      st.follow = st.scroll >= maxScroll;
      Dirty.mark();
    }
    if (st.follow) st.scroll = maxScroll;
    st.scroll = clamp(st.scroll, 0, maxScroll);

    const first = st.scroll;
    for (let i = 0; i < viewLines; i++) {
      const li = first + i;
      if (li >= total) break;
      const raw = lines[li];
      const txt = typeof raw === 'string' ? raw : raw.t;
      const col = typeof raw === 'string' ? (o.color || C.text) : (raw.c || o.color || C.text);
      Text.drawFit(ctx, txt, inner.x, inner.y + i * lineH + lineH * 0.72, inner.w, font, col, 'left');
    }

    /* cursor de bloco no fim, se estiver colado no rodapé */
    if (o.cursor !== false && st.follow) {
      const li = Math.min(viewLines - 1, total - first - 1);
      if (li >= 0) {
        const raw = lines[total - 1];
        const txt = typeof raw === 'string' ? raw : raw.t;
        const w = Math.min(inner.w, Text.width(ctx, txt, font));
        const blink = (UI.time * 1.9) % 1 < 0.55;
        const bs = UI.state(id + '#bl', () => ({ on: true }));
        if (bs.on !== blink) { bs.on = blink; Dirty.mark(); }
        if (blink) UI.fill(inner.x + w + 2, inner.y + li * lineH + 4, 9, lineH - 9, alpha(C.cyanBright, 0.85));
      }
    }
    ctx.restore();

    if (maxScroll > 0) {
      const sb = UI.rect(r.x + r.w - METRIC.scrollW - 1, r.y + 1, METRIC.scrollW, r.h - 2);
      const nv = W.scrollbarV(id + '#sb', sb, total * lineH, viewLines * lineH, st.scroll * lineH);
      const ns = Math.round(nv / lineH);
      if (ns !== st.scroll) { st.scroll = ns; st.follow = ns >= maxScroll; }
    }
    return st;
  },

  /* =======================================================
     GRÁFICOS
     ======================================================= */
  /**
   * Gráfico de linha. `series` = [{data:number[], color, fill?}]
   * @param {object} [o] {min, max, xLabels, yLabels, grid, title}
   */
  chartLine(r, series, o) {
    o = o || {};
    const ctx = UI.ctx;
    const padL = o.padL === undefined ? SPACE.h2 : o.padL;
    const padB = o.padB === undefined ? SPACE.xl : o.padB;
    const plot = UI.rect(r.x + padL, r.y + SPACE.xs, r.w - padL - SPACE.sm, r.h - padB - SPACE.xs);

    UI.fillVGrad(r.x, r.y, r.w, r.h, '#030a18', '#01050e');
    UI.frameR(r, C.line2, 1);

    let mn = o.min, mx = o.max;
    if (mn === undefined || mx === undefined) {
      mn = Infinity; mx = -Infinity;
      for (const s of series) for (const v of s.data) { if (v < mn) mn = v; if (v > mx) mx = v; }
      if (!isFinite(mn)) { mn = 0; mx = 1; }
      const pad = (mx - mn) * 0.12 || 1;
      mn -= pad; mx += pad;
    }
    const span = (mx - mn) || 1;

    /* grade */
    const rows = o.rows || 4;
    for (let i = 0; i <= rows; i++) {
      const y = Math.round(plot.y + plot.h * (i / rows));
      UI.hline(plot.x, y, plot.w, i === rows ? C.line2 : alpha(C.line1, 0.75));
      const v = mx - span * (i / rows);
      Text.draw(ctx, o.fmtY ? o.fmtY(v) : String(Math.round(v)),
        plot.x - SPACE.xs, y + 5, FONT.dataSmall, C.textFaint, 'right');
    }
    const colsN = o.cols || 6;
    for (let i = 0; i <= colsN; i++) {
      const x = Math.round(plot.x + plot.w * (i / colsN));
      UI.vline(x, plot.y, plot.h, i === 0 ? C.line2 : alpha(C.line1, 0.5));
    }

    for (let s = 0; s < series.length; s++) {
      const ser = series[s];
      const d = ser.data;
      if (!d || d.length < 2) continue;
      const col = ser.color || C.cyan;
      const stepX = plot.w / (d.length - 1);

      if (ser.fill !== false) {
        ctx.beginPath();
        ctx.moveTo(plot.x, plot.y + plot.h);
        for (let i = 0; i < d.length; i++)
          ctx.lineTo(plot.x + i * stepX, plot.y + plot.h * (1 - (d[i] - mn) / span));
        ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
        ctx.closePath();
        ctx.fillStyle = UI.vGrad(plot.y, plot.y + plot.h, alpha(col, 0.30), alpha(col, 0.02));
        ctx.fill();
      }

      ctx.save();
      ctx.shadowColor = alpha(col, 0.6); ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < d.length; i++) {
        const x = plot.x + i * stepX, y = plot.y + plot.h * (1 - (d[i] - mn) / span);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.restore();

      if (ser.dots !== false && d.length <= 40) {
        for (let i = 0; i < d.length; i++) {
          const x = plot.x + i * stepX, y = plot.y + plot.h * (1 - (d[i] - mn) / span);
          UI.fill(x - 2, y - 2, 4, 4, mix(col, '#ffffff', 0.4));
        }
      }
    }

    if (o.xLabels) {
      const n = o.xLabels.length;
      for (let i = 0; i < n; i++) {
        const x = plot.x + plot.w * (n === 1 ? 0.5 : i / (n - 1));
        Text.draw(ctx, o.xLabels[i], x, r.y + r.h - SPACE.xs, FONT.dataSmall, C.textFaint, 'center');
      }
    }
    if (o.title) Text.draw(ctx, o.title, r.x + SPACE.sm, r.y + SPACE.lg, FONT.label, C.textDim, 'left');
  },

  /** Gráfico de barras. `values` = number[]; `labels` opcional. */
  chartBar(r, values, o) {
    o = o || {};
    const ctx = UI.ctx;
    const padL = o.padL === undefined ? SPACE.h2 : o.padL;
    const padB = o.padB === undefined ? SPACE.xl : o.padB;
    const plot = UI.rect(r.x + padL, r.y + SPACE.xs, r.w - padL - SPACE.sm, r.h - padB - SPACE.xs);

    UI.fillVGrad(r.x, r.y, r.w, r.h, '#030a18', '#01050e');
    UI.frameR(r, C.line2, 1);

    let mx = o.max;
    if (mx === undefined) { mx = 0; for (const v of values) if (v > mx) mx = v; }
    if (mx <= 0) mx = 1;

    const rows = o.rows || 4;
    for (let i = 0; i <= rows; i++) {
      const y = Math.round(plot.y + plot.h * (i / rows));
      UI.hline(plot.x, y, plot.w, i === rows ? C.line2 : alpha(C.line1, 0.75));
      Text.draw(ctx, o.fmtY ? o.fmtY(mx * (1 - i / rows)) : String(Math.round(mx * (1 - i / rows))),
        plot.x - SPACE.xs, y + 5, FONT.dataSmall, C.textFaint, 'right');
    }

    const n = values.length || 1;
    const gap = Math.max(2, Math.min(SPACE.xs, plot.w / n * 0.25));
    const bw = Math.max(2, (plot.w - gap * (n - 1)) / n);
    for (let i = 0; i < n; i++) {
      const h = Math.max(1, plot.h * clamp(values[i] / mx, 0, 1));
      const x = plot.x + i * (bw + gap);
      const y = plot.y + plot.h - h;
      const col = (o.colors && o.colors[i]) || o.color || C.accent;
      UI.fillVGrad(x, y, bw, h, mix(col, '#ffffff', 0.30), mix(col, '#000000', 0.35));
      UI.hline(x, y, bw, mix(col, '#ffffff', 0.55));
      UI.frame(x, y, bw, h, alpha(mix(col, '#ffffff', 0.4), 0.5), 1);
      if (o.labels && o.labels[i] !== undefined) {
        Text.drawFit(ctx, o.labels[i], x + bw / 2, r.y + r.h - SPACE.xs, bw + gap,
          FONT.dataSmall, C.textFaint, 'center');
      }
    }
    if (o.title) Text.draw(ctx, o.title, r.x + SPACE.sm, r.y + SPACE.lg, FONT.label, C.textDim, 'left');
  }
};

/* =========================================================
   AUXILIARES DO CAMPO DE TEXTO
   ========================================================= */
function deleteSel(st) {
  const a = Math.min(st.sel, st.caret), b = Math.max(st.sel, st.caret);
  st.value = st.value.slice(0, a) + st.value.slice(b);
  st.caret = a; st.sel = a;
}

function caretFromX(ctx, shown, font, textX, mx) {
  const rel = mx - textX;
  if (rel <= 0) return 0;
  let lo = 0, hi = shown.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (Text.width(ctx, shown.slice(0, mid), font) <= rel) lo = mid; else hi = mid - 1;
  }
  /* aproxima do caractere mais próximo, não do anterior */
  if (lo < shown.length) {
    const a = Text.width(ctx, shown.slice(0, lo), font);
    const b = Text.width(ctx, shown.slice(0, lo + 1), font);
    if (rel - a > (b - a) * 0.5) lo++;
  }
  return lo;
}

/* =========================================================
   TOASTS
   Pilha de avisos no canto inferior esquerdo da área de janelas:
   longe do mapa (superior direito), do analisador (direito) e da
   barra de trace (inferior direito).
   ========================================================= */
const TOAST_KIND = {
  info:    { color: C.cyan,   icon: Icon.chevron },
  ok:      { color: C.ok,     icon: Icon.check },
  warn:    { color: C.warn,   icon: Icon.alert },
  bad:     { color: C.danger, icon: Icon.alert },
  mail:    { color: C.accentBright, icon: Icon.mail }
};

export const Toasts = {
  items: [],
  max: 5,

  push(text, kind) {
    const k = TOAST_KIND[kind] ? kind : 'info';
    const it = { text: String(text), kind: k, life: 0, ttl: 4.6, y: 0, yTarget: 0, a: 0, dying: false };
    this.items.push(it);
    while (this.items.length > this.max) this.items.shift();
    Dirty.mark();
    return it;
  },

  clear() { this.items.length = 0; Dirty.mark(); },

  update(dt) {
    const it = this.items;
    let live = false;
    for (let i = it.length - 1; i >= 0; i--) {
      const t = it[i];
      t.life += dt;
      const inA = clamp(t.life / 0.22, 0, 1);
      const outA = t.life > t.ttl ? clamp(1 - (t.life - t.ttl) / 0.35, 0, 1) : 1;
      const na = Math.min(inA, outA);
      if (na !== t.a) { t.a = na; live = true; }
      if (t.life > t.ttl + 0.4) { it.splice(i, 1); live = true; }
      else live = true;
    }
    if (live && it.length) Dirty.mark();
    return it.length > 0;
  },

  /** Desenha a pilha ancorada no canto inferior esquerdo de `area`. */
  draw(area) {
    const it = this.items;
    if (!it.length) return;
    const h = 52, gap = SPACE.xs, w = 460;
    let y = area.y + area.h - h;
    for (let i = it.length - 1; i >= 0; i--) {
      const t = it[i];
      const meta = TOAST_KIND[t.kind];
      const ease = 1 - Math.pow(1 - t.a, 3);
      const x = area.x + SPACE.lg - (1 - ease) * SPACE.h2;
      const ctx = UI.ctx;
      ctx.save();
      ctx.globalAlpha = t.a;
      UI.shadowOn(SHADOW.toast);
      UI.fill(x, y, w, h, '#061024');
      UI.shadowOff();
      UI.fillVGrad(x, y, w, h, '#0a1a3c', '#050c1e');
      UI.frame(x, y, w, h, alpha(meta.color, 0.75), 1);
      UI.fill(x, y, 4, h, meta.color);
      UI.hline(x + 4, y + 1, w - 5, alpha('#ffffff', 0.10));
      meta.icon(ctx, x + SPACE.xxl, y + h / 2, 22, meta.color);
      Text.drawFitIn(ctx, t.text, x + SPACE.h2 + SPACE.xs, y, w - SPACE.h2 - SPACE.xl, h,
        FONT.bodySmall, C.textStrong, 'left');
      /* barra de vida */
      const p = clamp(1 - t.life / t.ttl, 0, 1);
      UI.fill(x + 4, y + h - 2, (w - 4) * p, 2, alpha(meta.color, 0.85));
      ctx.restore();
      y -= h + gap;
    }
  }
};

export { HOVER, PRESSED, CLICK, HELD };
export default W;
