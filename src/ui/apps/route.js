/* =========================================================
   route.js — o mapa mundial e a rota de bounce.

   A tela mais importante do jogo antes de qualquer invasão.

   O mapa aproxima e desloca: roda do mouse aproxima em torno do
   ponteiro, arrastar move, e os botões do canto dão os mesmos gestos
   para quem prefere clicar. Sem isso, os servidores das cidades
   densas ficavam a poucos pixels uns dos outros e escolher entre
   eles era loteria.

   O que a aproximação revela, em camadas:
     1x    silhueta do mundo, pontos, e rótulo só do que importa
     2x+   rótulo de todo servidor conhecido
     3,5x+ o endereço abaixo do nome
   Mostrar tudo desde o começo empilha texto sobre texto; mostrar
   por escala é o que faz o mapa continuar legível cheio.
   ========================================================= */
import { Game } from '../../core/game.js';
import { Bus, EV } from '../../core/bus.js';
import * as F from '../../core/fmt.js';
import { UI, HOVER, CLICK, HELD } from '../toolkit.js';
import { W, Icon } from '../widgets.js';
import { Text } from '../text.js';
import { Dirty, clamp } from '../anim.js';
import { C, FONT, SPACE, METRIC, alpha } from '../theme.js';
import * as Mapa from '../worldmap.js';

export const id = 'route';
export const title = 'ROTA GLOBAL';
export const label = 'ROTA';
export const icon = 'map';
export const w = 1160, h = 700;
export const minW = 820, minH = 520;

const PAINEL_W = 330;

export function draw(r) {
  const st = UI.state(id, () => ({
    sel: null, scroll: 0,
    vista: Mapa.novaVista(),
    arrastando: false, ax: 0, ay: 0, moveu: 0
  }));
  const S = Game.state;
  const rv = Game.net.routeView();
  const conectado = S.conn.live;
  const ctx = UI.ctx;

  const painelR = UI.cutRight(r, PAINEL_W);
  UI.cutRight(r, SPACE.sm);
  const mapaR = r;

  /* ================= MAPA ================= */
  const caixa = { x: mapaR.x + 1, y: mapaR.y + 1, w: mapaR.w - 2, h: mapaR.h - 2 };
  if (!Mapa.desenha(ctx, caixa, st.vista)) {
    UI.fillVGrad(caixa.x, caixa.y, caixa.w, caixa.h, '#061530', '#020714');
    Text.center(ctx, 'carregando cartografia…', caixa.x, caixa.y, caixa.w, caixa.h,
      FONT.bodySmall, C.textFaint);
  }
  UI.frameR(mapaR, C.line2, 1);

  /* o QA precisa da caixa e da vista para calcular onde um servidor
     está na tela — sem isso o teste adivinha coordenada, e teste que
     adivinha coordenada testa o layout de ontem */
  if (UI._qa) UI._qaRects.set(id + ':mapa', [caixa.x, caixa.y, caixa.w, caixa.h]);

  const dentroMapa = UI.inside_(caixa.x, caixa.y, caixa.w, caixa.h) && UI.inClip(UI.mx, UI.my);
  const pos = (sv) => Mapa.paraPixel(caixa, st.vista, sv.x, sv.y);
  const zoom = Mapa.normaliza(st.vista, caixa).z;

  /* ---- aproximação pela roda, em torno do ponteiro ---- */
  if (dentroMapa && UI.wheel !== 0) {
    Mapa.aproxima(st.vista, caixa, UI.mx, UI.my, -Math.sign(UI.wheel));
    Dirty.mark();
  }

  /* ---- arrasto ---- */
  if (dentroMapa && UI.pressed) {
    st.arrastando = true; st.ax = UI.mx; st.ay = UI.my; st.moveu = 0;
  }
  if (st.arrastando) {
    if (!UI.mdown) {
      st.arrastando = false;
    } else if (UI.dragDX || UI.dragDY) {
      Mapa.desloca(st.vista, caixa, UI.dragDX, UI.dragDY);
      st.moveu += Math.abs(UI.dragDX) + Math.abs(UI.dragDY);
      Dirty.mark();
    }
  }

  UI.pushClip(caixa.x, caixa.y, caixa.w, caixa.h);

  /* ---- quais servidores aparecem ---- */
  const salvos = new Set(S.links);
  const naRota = new Set(S.conn.route);
  const visiveis = Object.values(S.world.servers).filter(sv =>
    sv.publicList || salvos.has(sv.ip) || naRota.has(sv.ip) || S.conn.target === sv.ip);

  /* ---- o nó sob o ponteiro: o MAIS PRÓXIMO, não o primeiro ---- */
  let hovered = null;
  if (dentroMapa && !st.arrastando) {
    let melhor = 1e9;
    for (const sv of visiveis) {
      const p = pos(sv);
      const d = Math.hypot(UI.mx - p.x, UI.my - p.y);
      if (d < 13 && d < melhor) { melhor = d; hovered = sv; }
    }
  }

  /* ---- a rota, por baixo dos nós ---- */
  const pontos = rv.route.map(h2 => S.world.servers[h2.ip]).filter(Boolean);
  const alvoSv = rv.target ? S.world.servers[rv.target.ip] : null;
  const cadeia = pontos.concat(alvoSv ? [alvoSv] : []);

  if (cadeia.length > 1 || (cadeia.length === 1 && alvoSv)) {
    ctx.save();
    ctx.strokeStyle = conectado ? C.dangerBright : C.cyanBright;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -(UI.time * 30) % 11;
    ctx.shadowColor = alpha(conectado ? C.glowRed : C.glowCyan, 0.9);
    ctx.shadowBlur = 9;
    ctx.beginPath();
    /* o gateway é a origem da linha: a rota sai de você */
    cadeia.forEach((sv, i) => {
      const p = pos(sv);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  /* ---- nós ---- */
  const rotulaTudo = zoom >= 2;
  const mostraIP = zoom >= 3.5;

  /* Rótulos brigam por espaço: um servidor perto do outro escreve
     nome por cima de nome e nenhum dos dois se lê. Os importantes
     (alvo, saltos, selecionado, sob o ponteiro) entram primeiro e
     nunca cedem; os demais só entram se sobrar lugar. */
  const ocupados = [];
  function livre(x, y, w2, h2) {
    for (const o of ocupados) {
      if (x < o[0] + o[2] && x + w2 > o[0] && y < o[1] + o[3] && y + h2 > o[1]) return false;
    }
    return true;
  }

  /**
   * Acha um lugar para o rótulo. Tenta quatro posições em volta do
   * nó antes de desistir — empurrar o texto para cima ou para baixo
   * resolve quase toda colisão sem tirar nenhum rótulo da tela.
   * Os prioritários entram de qualquer jeito na última tentativa.
   */
  function colocaRotulo(X, Y, w2, h2, prioritario) {
    const cand = [
      [X + 12, Y - 8],            /* direita */
      [X - 11 - w2, Y - 8],       /* esquerda */
      [X + 12, Y - 8 - h2 - 3],   /* direita acima */
      [X + 12, Y - 8 + h2 + 3],   /* direita abaixo */
      [X - 11 - w2, Y - 8 - h2 - 3],
      [X - 11 - w2, Y - 8 + h2 + 3]
    ];
    for (const [cx2, cy2] of cand) {
      if (cx2 < caixa.x + 2 || cx2 + w2 > caixa.x + caixa.w - 2) continue;
      if (livre(cx2, cy2, w2, h2)) { ocupados.push([cx2, cy2, w2, h2]); return { x: cx2, y: cy2 }; }
    }
    if (!prioritario) return null;
    const f = cand[0];
    ocupados.push([f[0], f[1], w2, h2]);
    return { x: f[0], y: f[1] };
  }

  /* apagados primeiro, para nunca cobrirem os acesos */
  visiveis.forEach(sv => {
    if (salvos.has(sv.ip) || sv === hovered || naRota.has(sv.ip) || S.conn.target === sv.ip) return;
    const p = pos(sv);
    if (p.x < caixa.x - 8 || p.x > caixa.x + caixa.w + 8) return;
    UI.fill(Math.round(p.x) - 2, Math.round(p.y) - 2, 5, 5, alpha('#000000', 0.6));
    UI.fill(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3, alpha('#9fc6ff', 0.75));
  });

  visiveis.forEach(sv => {
    const destacado = salvos.has(sv.ip) || naRota.has(sv.ip) ||
      S.conn.target === sv.ip || sv === hovered;
    if (!destacado) return;

    const p = pos(sv);
    if (p.x < caixa.x - 60 || p.x > caixa.x + caixa.w + 60) return;
    const X = Math.round(p.x), Y = Math.round(p.y);

    const ehAlvo = S.conn.target === sv.ip;
    const ehSalto = naRota.has(sv.ip);
    const escolhido = st.sel === sv.ip;
    const cor = ehAlvo ? C.dangerBright : ehSalto ? C.cyanBright
      : escolhido ? C.warnBright : C.accentBright;
    const tam = ehAlvo || ehSalto || escolhido ? 8 : 6;

    /* halo */
    if (ehAlvo || ehSalto || escolhido || sv === hovered) {
      ctx.beginPath();
      ctx.arc(X, Y, tam + 7, 0, Math.PI * 2);
      ctx.fillStyle = alpha(cor, 0.20);
      ctx.fill();
    }
    /* anel pulsante no alvo: ele é o que importa na tela */
    if (ehAlvo) {
      const k = 0.5 + 0.5 * Math.sin(UI.time * 3.2);
      ctx.beginPath();
      ctx.arc(X, Y, tam + 8 + k * 7, 0, Math.PI * 2);
      ctx.strokeStyle = alpha(C.danger, 0.55 * (1 - k));
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    /* quadrado com contorno: legível sobre oceano e sobre continente */
    UI.fill(X - tam / 2 - 1, Y - tam / 2 - 1, tam + 2, tam + 2, '#000000');
    UI.fill(X - tam / 2, Y - tam / 2, tam, tam,
      ehAlvo || ehSalto || escolhido ? cor : '#e8f2ff');

    /* número de ordem do salto */
    if (ehSalto) {
      const n = S.conn.route.indexOf(sv.ip) + 1;
      ctx.beginPath(); ctx.arc(X, Y - tam - 8, 8, 0, Math.PI * 2);
      ctx.fillStyle = alpha('#01060f', 0.88); ctx.fill();
      ctx.strokeStyle = C.cyanBright; ctx.lineWidth = 1; ctx.stroke();
      Text.center(ctx, String(n), X - 8, Y - tam - 16, 16, 16, FONT.labelSmall, C.cyanBright);
    }

    /* rótulo */
    const importante = ehAlvo || ehSalto || escolhido || sv === hovered;
    if (importante || rotulaTudo) {
      const nome = sv.name;
      const larg = Text.width(ctx, nome, FONT.dataSmall);
      const alt = mostraIP && importante ? 28 : 15;
      const p2 = colocaRotulo(X, Y, larg + 8, alt, importante);

      if (p2) {
        /* fio ligando o nó ao rótulo quando ele saiu do lugar padrão */
        if (Math.abs(p2.y - (Y - 8)) > 2) {
          ctx.strokeStyle = alpha(cor, 0.45);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(X, Y);
          ctx.lineTo(p2.x + (p2.x < X ? larg + 8 : 0), p2.y + alt / 2);
          ctx.stroke();
        }
        UI.fill(p2.x, p2.y, larg + 8, alt, alpha('#01060f', 0.88));
        UI.fill(p2.x, p2.y, 2, alt, alpha(cor, 0.9));
        Text.draw(ctx, nome, p2.x + 4, p2.y + 12, FONT.dataSmall,
          ehAlvo ? C.dangerBright : ehSalto ? C.cyanBright
            : importante ? C.textStrong : C.text);
        if (mostraIP && importante) {
          Text.draw(ctx, sv.ip, p2.x + 4, p2.y + 25, FONT.dataSmall, alpha(C.textFaint, 0.9));
        }
      }
    }
  });

  UI.popClip();

  /* ---- clique num nó: seleciona ---- */
  if (hovered && st.moveu < 6) {
    const p = pos(hovered);
    const f = UI.probe(id + ':no:' + hovered.ip, p.x - 12, p.y - 12, 24, 24);
    if (f & CLICK) { st.sel = hovered.ip; UI.sfx('ui_select'); Dirty.mark(); }
  }

  /* ---- controles de aproximação ---- */
  const ctrl = UI.rect(caixa.x + caixa.w - 40, caixa.y + SPACE.xs, 32, 108);
  const bMais = UI.rect(ctrl.x, ctrl.y, 32, 30);
  const bMenos = UI.rect(ctrl.x, ctrl.y + 34, 32, 30);
  const bTudo = UI.rect(ctrl.x, ctrl.y + 68, 32, 30);
  /* Ícones desenhados, não glifos de fonte: '+', '−' e '◻' dependem
     da fonte carregada e podem simplesmente não existir nela — foi o
     que aconteceu, e os botões saíram vazios. */
  if (W.iconButton(id + ':zmais', bMais, 'plus', { tip: 'aproximar' })) {
    Mapa.aproxima(st.vista, caixa, caixa.x + caixa.w / 2, caixa.y + caixa.h / 2, 2);
  }
  if (W.iconButton(id + ':zmenos', bMenos, 'minus', { tip: 'afastar' })) {
    Mapa.aproxima(st.vista, caixa, caixa.x + caixa.w / 2, caixa.y + caixa.h / 2, -2);
  }
  if (W.iconButton(id + ':ztudo', bTudo, 'map', { tip: 'ver o mundo inteiro' })) {
    st.vista = Mapa.novaVista();
    Dirty.mark();
  }

  /* ---- escala e legenda, em linhas separadas ---- */
  const rodape = caixa.y + caixa.h;
  UI.fillVGrad(caixa.x, rodape - 44, caixa.w, 44,
    'rgba(1,6,15,0)', 'rgba(1,6,15,0.75)');
  Text.draw(ctx, 'aproximação ' + zoom.toFixed(1) + '×',
    caixa.x + SPACE.sm, rodape - 26, FONT.dataSmall, alpha(C.text, 0.85));
  Text.draw(ctx, 'clique num servidor  ·  roda aproxima  ·  arraste move',
    caixa.x + SPACE.sm, rodape - 10, FONT.dataSmall, alpha(C.textFaint, 0.8));

  /* barra de escala geográfica: dá noção real de distância */
  const grausPorPixel = (Mapa.normaliza(st.vista, caixa).w * 360) / caixa.w;
  const kmAlvo = grausPorPixel * 111 * 120;
  const passos = [100, 250, 500, 1000, 2500, 5000, 10000];
  const km = passos.find(v => v >= kmAlvo) || 10000;
  const larguraBarra = Math.round(km / (grausPorPixel * 111));
  if (larguraBarra > 20 && larguraBarra < caixa.w * 0.4) {
    const bx = caixa.x + caixa.w - larguraBarra - SPACE.md;
    const by = rodape - 18;
    UI.fill(bx, by, larguraBarra, 2, alpha(C.text, 0.7));
    UI.fill(bx, by - 4, 1, 10, alpha(C.text, 0.7));
    UI.fill(bx + larguraBarra - 1, by - 4, 1, 10, alpha(C.text, 0.7));
    Text.draw(ctx, km >= 1000 ? (km / 1000) + ' mil km' : km + ' km',
      bx + larguraBarra / 2, by - 8, FONT.dataSmall, alpha(C.text, 0.8), 'center');
  }

  /* ================= PAINEL ================= */
  UI.fillVGrad(painelR.x, painelR.y, painelR.w, painelR.h, C.panelTop, C.panelBottom);
  UI.frameR(painelR, C.line2, 1);
  let c = UI.pad(UI.copy(painelR), SPACE.sm, SPACE.sm);

  /* ---- alvo ---- */
  W.sectionBar(UI.stackTop(c, METRIC.headerH, SPACE.xs), 'ALVO');
  const alvoBox = UI.stackTop(c, 46, SPACE.sm);
  UI.fill(alvoBox.x, alvoBox.y, alvoBox.w, alvoBox.h, alpha(C.wellTop, 0.8));
  UI.frameR(alvoBox, rv.target ? alpha(C.danger, 0.6) : C.line1, 1);
  if (rv.target) {
    Text.drawFit(ctx, rv.target.name, alvoBox.x + SPACE.xs, alvoBox.y + 19,
      alvoBox.w - SPACE.h2, FONT.label, C.dangerBright);
    Text.draw(ctx, rv.target.ip, alvoBox.x + SPACE.xs, alvoBox.y + 36, FONT.dataSmall, C.textDim);
    const bIr = UI.rect(alvoBox.x + alvoBox.w - 34, alvoBox.y + 12, 26, 22);
    if (W.button(id + ':iralvo', bIr, '◎', { font: FONT.button, tip: 'centralizar no alvo' })) {
      const sv = S.world.servers[rv.target.ip];
      if (sv) { Mapa.centraliza(st.vista, caixa, sv.x, sv.y, 3.2); Dirty.mark(); }
    }
  } else {
    Text.center(ctx, 'escolha um servidor no mapa', alvoBox.x, alvoBox.y,
      alvoBox.w, alvoBox.h, FONT.bodySmall, C.textFaint);
  }

  /* ---- servidor selecionado ---- */
  const sel = st.sel ? S.world.servers[st.sel] : null;
  W.sectionBar(UI.stackTop(c, METRIC.headerH, SPACE.xs), 'SELECIONADO');
  const selBox = UI.stackTop(c, 112, SPACE.sm);
  UI.fill(selBox.x, selBox.y, selBox.w, selBox.h, alpha(C.wellTop, 0.8));
  UI.frameR(selBox, sel ? alpha(C.warn, 0.55) : C.line1, 1);

  if (!sel) {
    Text.center(ctx, 'nenhum servidor selecionado', selBox.x, selBox.y,
      selBox.w, 44, FONT.bodySmall, C.textFaint);
    Text.center(ctx, 'clique num ponto do mapa', selBox.x, selBox.y + 28,
      selBox.w, 44, FONT.dataSmall, alpha(C.textFaint, 0.7));
  } else {
    let sb = UI.pad(selBox, SPACE.xs, SPACE.xs);
    const l1 = UI.stackTop(sb, 20, 0);
    Text.drawFit(ctx, sel.name, l1.x, l1.y + 15, l1.w - 26, FONT.label, C.warnBright);
    const bCentro = UI.rect(l1.x + l1.w - 22, l1.y, 22, 20);
    if (W.button(id + ':ircentro', bCentro, '◎', { font: FONT.labelSmall })) {
      Mapa.centraliza(st.vista, caixa, sel.x, sel.y, Math.max(3.2, st.vista.zoom));
      Dirty.mark();
    }

    const l2 = UI.stackTop(sb, 17, SPACE.xxs);
    Text.draw(ctx, sel.ip + '  ·  ' + sel.city, l2.x, l2.y + 13, FONT.dataSmall, C.textDim);

    const l3 = UI.stackTop(sb, 17, SPACE.xs);
    const visto = (sel.probed || 0) > 0;
    Text.draw(ctx, visto
      ? ('proxy ' + sel.sec.proxy + '   firewall ' + sel.sec.firewall + '   monitor ' + sel.sec.monitor)
      : 'segurança desconhecida — use VARRER em LINKS',
      l3.x, l3.y + 13, FONT.dataSmall, visto ? C.text : alpha(C.textFaint, 0.85));

    const acoes = UI.stackTop(sb, METRIC.btnH, 0);
    const aA = UI.cutLeft(acoes, Math.floor(acoes.w / 2) - 4);
    UI.cutLeft(acoes, SPACE.xs);
    const aB = acoes;

    const jaNaRota = naRota.has(sel.ip);
    const ehAlvo = S.conn.target === sel.ip;

    if (W.button(id + ':salto', aA, jaNaRota ? 'TIRAR DA ROTA' : 'SOMAR À ROTA',
      { disabled: conectado || ehAlvo, font: FONT.button })) {
      const e = jaNaRota ? Game.net.removeHop(sel.ip) : Game.net.addHop(sel.ip);
      if (e) Bus.emit(EV.UI_TOAST, { text: e, kind: 'bad' });
      Dirty.mark();
    }
    if (W.button(id + ':alvo', aB, ehAlvo ? 'É O ALVO' : 'DEFINIR ALVO',
      { primary: !ehAlvo, disabled: conectado || ehAlvo, font: FONT.button })) {
      const e = Game.net.setTarget(sel.ip);
      Bus.emit(EV.UI_TOAST, {
        text: e || ('Alvo definido: ' + sel.name),
        kind: e ? 'bad' : 'ok'
      });
      Dirty.mark();
    }
  }

  /* ---- saltos ---- */
  W.sectionBar(UI.stackTop(c, METRIC.headerH, SPACE.xs), 'SALTOS  ·  ' + rv.route.length);
  const listaH = Math.min(148, Math.max(56, c.h - 208));
  const listaR = UI.stackTop(c, listaH, SPACE.sm);
  UI.fill(listaR.x, listaR.y, listaR.w, listaR.h, alpha(C.wellBottom, 0.7));
  UI.frameR(listaR, C.line1, 1);

  W.list(id + ':saltos', UI.pad(listaR, 1, 1), rv.route.length, (i, rr) => {
    const h2 = rv.route[i];
    Text.draw(ctx, String(i + 1), rr.x + SPACE.xs, rr.y + 18, FONT.dataStrong, C.cyanBright);
    Text.drawFit(ctx, h2.name, rr.x + 26, rr.y + 18, rr.w - 58, FONT.bodySmall, C.text);
    const bx = UI.rect(rr.x + rr.w - 24, rr.y + 4, 18, 18);
    if (W.iconButton(id + ':rm' + i, bx, 'close', { danger: true, disabled: conectado })) {
      Game.net.removeHop(h2.ip); Dirty.mark();
    }
  }, { rowH: 26, empty: 'rota direta — perigoso', state: st });

  /* ---- leitura do trace ---- */
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

  /* ---- botões ---- */
  const b1 = UI.stackTop(c, METRIC.btnH, SPACE.xs);
  if (conectado || S.conn.dial) {
    if (W.button(id + ':disc', b1,
      S.conn.dial ? 'CANCELAR DISCAGEM' : 'DESCONECTAR',
      { danger: true, font: FONT.buttonBig })) {
      Game.net.disconnect();
    }
  } else {
    /* O botão nunca fica desabilitado: um botão desabilitado não
       recebe clique e portanto não explica nada. */
    const semAlvo = !rv.target;
    if (W.button(id + ':conn', b1, semAlvo ? 'DEFINA UM ALVO' : 'CONECTAR',
      { primary: !semAlvo, font: FONT.buttonBig })) {
      if (semAlvo) {
        Bus.emit(EV.UI_TOAST, {
          text: 'Escolha um servidor no mapa e use DEFINIR ALVO.', kind: 'warn'
        });
      } else {
        const erro = Game.net.connect();
        if (erro) Bus.emit(EV.UI_TOAST, { text: erro, kind: 'bad' });
      }
    }
  }
  const b2 = UI.stackTop(c, METRIC.btnH, 0);
  if (W.button(id + ':limpar', b2, 'LIMPAR ROTA',
    { disabled: conectado || !rv.route.length })) {
    Game.net.clearRoute(); Dirty.mark();
  }
}
