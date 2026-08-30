/* =========================================================
   route.js — o mapa mundial e a rota de bounce.

   A tela mais importante do jogo antes de qualquer invasão. Um
   mapa-múndi com todos os servidores conhecidos; clicar acrescenta
   um salto, clicar de novo remove. A linha tracejada percorre a
   rota na ordem, e o painel lateral traduz o que ela significa em
   segundos de trace — que é a única moeda que interessa aqui.
   ========================================================= */
import { Game } from '../../core/game.js';
import { Bus, EV } from '../../core/bus.js';
import * as F from '../../core/fmt.js';
import { UI, HOVER, CLICK } from '../toolkit.js';
import { W, Icon } from '../widgets.js';
import { Text } from '../text.js';
import { Dirty, clamp } from '../anim.js';
import { C, FONT, SPACE, METRIC, alpha } from '../theme.js';
import * as WorldMap from '../worldmap.js';

export const id = 'route';
export const title = 'ROTA GLOBAL';
export const label = 'ROTA';
export const icon = 'map';
export const w = 1160, h = 700;
export const minW = 800, minH = 520;

export function draw(r) {
  const st = UI.state(id, () => ({ hover: null, sel: 0, busca: '', filtro: 0 }));
  const S = Game.state;
  const rv = Game.net.routeView();
  const conectado = S.conn.live;

  const painelR = UI.cutRight(r, 320);
  UI.cutRight(r, SPACE.sm);
  const mapaR = r;

  /* ================= MAPA ================= */
  UI.frameR(mapaR, C.line2, 1);

  const ctx = UI.ctx;
  const mx = mapaR.x + 1, my = mapaR.y + 1;
  const mw = mapaR.w - 2, mh = mapaR.h - 2;
  const px = (nx) => mx + nx * mw;
  const py = (ny) => my + ny * mh;

  UI.pushClip(mx, my, mw, mh);

  /* contorno real dos continentes, rasterizado uma vez por tamanho */
  if (!WorldMap.desenha(ctx, { x: mx, y: my, w: mw, h: mh }, 'grande')) {
    UI.fillVGrad(mx, my, mw, mh, '#061530', '#020714');
    Text.center(ctx, 'carregando cartografia…', mx, my, mw, mh, FONT.bodySmall, C.textFaint);
  }

  /* --- servidores ---
     O mundo inteiro que é público aparece em ponto apagado; o que
     está nos seus links aparece aceso. Uma tela com quatro pontos não
     parece uma rede global, parece um esboço. */
  const salvos = new Set(S.links);
  const visiveis = Object.values(S.world.servers)
    .filter(sv => sv.publicList || salvos.has(sv.ip));
  const naRota = new Set(S.conn.route);
  let hovered = null;

  /* primeiro os apagados, para nunca cobrirem os acesos.
     Cada nó leva um contorno escuro: sem ele o ponto some quando cai
     sobre a massa de terra, que é justamente onde os servidores ficam. */
  visiveis.forEach(sv => {
    if (salvos.has(sv.ip)) return;
    const X = Math.round(px(sv.x)), Y = Math.round(py(sv.y));
    UI.fill(X - 2, Y - 2, 5, 5, alpha('#000000', 0.55));
    UI.fill(X - 1, Y - 1, 3, 3, alpha('#9fc6ff', 0.72));
  });

  visiveis.filter(sv => salvos.has(sv.ip)).forEach(sv => {
    const X = Math.round(px(sv.x)), Y = Math.round(py(sv.y));
    const dist = Math.hypot(UI.mx - X, UI.my - Y);
    const perto = dist < 11 && UI.inClip(UI.mx, UI.my);
    if (perto) hovered = sv;

    const alvo = S.conn.target === sv.ip;
    const salto = naRota.has(sv.ip);
    const cor = alvo ? C.dangerBright : salto ? C.cyanBright : C.accentBright;
    const tam = alvo || salto ? 7 : 5;

    if (perto || alvo || salto) {
      ctx.beginPath();
      ctx.arc(X, Y, tam + 6, 0, Math.PI * 2);
      ctx.fillStyle = alpha(cor, 0.22);
      ctx.fill();
    }
    /* quadrado branco com contorno preto, como no original: é a única
       marca que se lê tanto sobre o oceano quanto sobre o continente */
    UI.fill(X - tam / 2 - 1, Y - tam / 2 - 1, tam + 2, tam + 2, '#000000');
    UI.fill(X - tam / 2, Y - tam / 2, tam, tam, alvo || salto ? cor : '#e8f2ff');

    if (alvo || salto || perto) {
      const rot = sv.name;
      const larg = Text.width(ctx, rot, FONT.dataSmall);
      /* o rótulo vira para a esquerda quando encosta na borda direita */
      const paraEsq = X + 12 + larg > mx + mw - 6;
      const tx = paraEsq ? X - 10 - larg : X + 11;
      UI.fill(tx - 3, Y - 8, larg + 6, 15, alpha('#01060f', 0.82));
      Text.draw(ctx, rot, tx, Y + 4, FONT.dataSmall,
        alvo ? C.dangerBright : salto ? C.cyanBright : C.textStrong);
    }
  });

  /* --- a rota --- */
  const pontos = rv.route.map(h => S.world.servers[h.ip]).filter(Boolean);
  const alvoSv = rv.target ? S.world.servers[rv.target.ip] : null;
  const cadeia = pontos.concat(alvoSv ? [alvoSv] : []);

  if (cadeia.length) {
    ctx.save();
    ctx.strokeStyle = conectado ? C.dangerBright : C.cyanBright;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -(UI.time * 26) % 9;
    ctx.shadowColor = alpha(conectado ? C.glowRed : C.glowCyan, 0.9);
    ctx.shadowBlur = 8;
    ctx.beginPath();
    cadeia.forEach((sv, i) => {
      const X = px(sv.x), Y = py(sv.y);
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    });
    ctx.stroke();
    ctx.restore();

    /* número de ordem em cada salto */
    cadeia.forEach((sv, i) => {
      if (i === cadeia.length - 1 && alvoSv) return;
      const X = Math.round(px(sv.x)), Y = Math.round(py(sv.y));
      ctx.beginPath(); ctx.arc(X, Y, 9, 0, Math.PI * 2);
      ctx.fillStyle = alpha('#000000', 0.75); ctx.fill();
      ctx.strokeStyle = C.cyanBright; ctx.lineWidth = 1; ctx.stroke();
      Text.center(ctx, String(i + 1), X - 9, Y - 9, 18, 18, FONT.labelSmall, C.cyanBright);
    });
  }

  UI.popClip();

  /* clique no mapa */
  if (hovered && UI.inClip(UI.mx, UI.my)) {
    UI.probe(id + ':mapa', UI.mx - 10, UI.my - 10, 20, 20);
    if (UI.clicked) {
      if (conectado) Bus.emit(EV.UI_TOAST, { text: 'Desconecte antes de mudar a rota.', kind: 'bad' });
      else if (naRota.has(hovered.ip)) { Game.net.removeHop(hovered.ip); UI.sfx('ui_click'); }
      else { const e = Game.net.addHop(hovered.ip); if (e) Bus.emit(EV.UI_TOAST, { text: e, kind: 'bad' }); else UI.sfx('ui_click'); }
      Dirty.mark();
    }
  }

  /* legenda */
  Text.draw(ctx, 'clique num nó para adicionar ou remover da rota',
    mx + SPACE.sm, my + mh - SPACE.sm, FONT.dataSmall, alpha(C.textFaint, 0.7));

  /* ================= PAINEL ================= */
  UI.fillVGrad(painelR.x, painelR.y, painelR.w, painelR.h, C.panelTop, C.panelBottom);
  UI.frameR(painelR, C.line2, 1);
  let c = UI.pad(UI.copy(painelR), SPACE.sm, SPACE.sm);

  /* alvo */
  W.sectionBar(UI.stackTop(c, METRIC.headerH, SPACE.xs), 'ALVO');
  const alvoBox = UI.stackTop(c, 46, SPACE.sm);
  UI.fill(alvoBox.x, alvoBox.y, alvoBox.w, alvoBox.h, alpha(C.wellTop, 0.8));
  UI.frameR(alvoBox, rv.target ? alpha(C.danger, 0.6) : C.line1, 1);
  if (rv.target) {
    Text.drawFit(ctx, rv.target.name, alvoBox.x + SPACE.xs, alvoBox.y + 19, alvoBox.w - SPACE.md, FONT.label, C.dangerBright);
    Text.draw(ctx, rv.target.ip, alvoBox.x + SPACE.xs, alvoBox.y + 36, FONT.dataSmall, C.textDim);
  } else {
    Text.center(ctx, 'nenhum alvo definido', alvoBox.x, alvoBox.y, alvoBox.w, alvoBox.h, FONT.bodySmall, C.textFaint);
  }

  /* rota */
  W.sectionBar(UI.stackTop(c, METRIC.headerH, SPACE.xs), 'SALTOS  ·  ' + rv.route.length);
  const listaH = Math.min(200, Math.max(80, c.h - 250));
  const listaR = UI.stackTop(c, listaH, SPACE.sm);
  UI.fill(listaR.x, listaR.y, listaR.w, listaR.h, alpha(C.wellBottom, 0.7));
  UI.frameR(listaR, C.line1, 1);

  W.list(id + ':saltos', UI.pad(listaR, 1, 1), rv.route.length, (i, rr) => {
    const h = rv.route[i];
    Text.draw(ctx, String(i + 1), rr.x + SPACE.xs, rr.y + 18, FONT.dataStrong, C.cyanBright);
    Text.drawFit(ctx, h.name, rr.x + 26, rr.y + 18, rr.w - 60, FONT.bodySmall, C.text);
    const bx = UI.rect(rr.x + rr.w - 24, rr.y + 4, 18, 18);
    if (W.iconButton(id + ':rm' + i, bx, 'close', { danger: true })) {
      Game.net.removeHop(h.ip); Dirty.mark();
    }
  }, { rowH: 26, empty: 'rota direta — perigoso', state: st });

  /* leitura do trace */
  const est = rv.estimate;
  const ficha = UI.stackTop(c, 74, SPACE.sm);
  UI.fill(ficha.x, ficha.y, ficha.w, ficha.h, alpha(C.wellTop, 0.6));
  UI.frameR(ficha, C.line1, 1);
  let fr = UI.pad(ficha, SPACE.xs, SPACE.xs);
  W.stat(UI.stackTop(fr, 18, 2), 'QUALIDADE', rv.quality.toFixed(2),
    { valueColor: rv.quality > 1.5 ? C.okBright : rv.quality > 0.7 ? C.warnBright : C.dangerBright });
  W.stat(UI.stackTop(fr, 18, 2), 'TRACE', est ? est + 's' : '—',
    { valueColor: est > 120 ? C.okBright : est > 60 ? C.warnBright : C.dangerBright });
  W.stat(UI.stackTop(fr, 18, 0), 'SEU IP', S.playerIP, { valueColor: C.textDim });

  /* botões */
  const b1 = UI.stackTop(c, METRIC.btnH, SPACE.xs);
  if (conectado) {
    if (W.button(id + ':disc', b1, 'DESCONECTAR', { danger: true, font: FONT.buttonBig })) {
      Game.net.disconnect();
    }
  } else {
    if (W.button(id + ':conn', b1, 'CONECTAR', { primary: true, font: FONT.buttonBig, disabled: !rv.target })) {
      const erro = Game.net.connect();
      if (erro) Bus.emit(EV.UI_TOAST, { text: erro, kind: 'bad' });
    }
  }
  const b2 = UI.stackTop(c, METRIC.btnH, 0);
  if (W.button(id + ':limpar', b2, 'LIMPAR ROTA', { disabled: conectado || !rv.route.length })) {
    Game.net.clearRoute(); Dirty.mark();
  }
}
