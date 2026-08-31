/* =========================================================
   screens/lan.js — a rede interna.

   Alvos avançados não são uma máquina: são uma rede que se atravessa
   a pé. Você entra pelo roteador de borda, enxerga só o que já
   mapeou, e caminha de equipamento em equipamento até o sistema
   central — que é onde os arquivos realmente estão.

   A tela é um mapa de topologia, não uma lista. O caminho percorrido
   fica aceso atrás de você; o que ainda não foi sondado aparece como
   silhueta sem identificação. É a diferença entre "há sete
   dispositivos" e "há uma tranca entre mim e o cofre".
   ========================================================= */
import { Game } from '../../core/game.js';
import { Bus, EV } from '../../core/bus.js';
import * as LAN from '../../core/lan.js';
import * as D from '../../core/data.js';
import { UI, HOVER, CLICK } from '../toolkit.js';
import { W, Icon } from '../widgets.js';
import { Text } from '../text.js';
import { Dirty } from '../anim.js';
import { C, FONT, SPACE, METRIC, alpha } from '../theme.js';

/* cor e forma por tipo de equipamento */
const ESTILO = {
  router:   { cor: '#5aa9ff', forma: 'losango' },
  hub:      { cor: '#7f8fa6', forma: 'circulo' },
  terminal: { cor: '#8cf06a', forma: 'quadrado' },
  lock:     { cor: '#ff5a5a', forma: 'losango' },
  auth:     { cor: '#ffb648', forma: 'losango' },
  isolator: { cor: '#c07fff', forma: 'triangulo' },
  logserv:  { cor: '#12c8e8', forma: 'quadrado' },
  system:   { cor: '#ff3b45', forma: 'hexagono' }
};

export function desenha(r, sv, st, id) {
  if (!sv.lan) {
    Text.center(UI.ctx, 'este alvo não tem rede interna', r.x, r.y, r.w, r.h,
      FONT.body, C.textFaint);
    return;
  }
  const ctx = UI.ctx;
  const nos = LAN.mapView(sv);
  const atual = LAN.current(sv);
  const chegou = LAN.reachedSystem(sv);

  const painelR = UI.cutRight(r, Math.min(330, Math.round(r.w * 0.32)));
  UI.cutRight(r, SPACE.md);
  const mapaR = r;

  /* ================= MAPA ================= */
  UI.fillVGrad(mapaR.x, mapaR.y, mapaR.w, mapaR.h, '#050e1e', '#02060e');
  UI.frameR(mapaR, C.line2, 1);

  if (!nos.length) {
    Text.center(ctx, 'rede não mapeada', mapaR.x, mapaR.y, mapaR.w, mapaR.h - 30,
      FONT.sectionTitle, C.textFaint);
    Text.center(ctx, 'execute o LAN_Scan em FERRAMENTAS',
      mapaR.x, mapaR.y + 30, mapaR.w, mapaR.h, FONT.bodySmall, alpha(C.textFaint, 0.7));
    return painel(painelR, sv, st, id, null, chegou, nos);
  }

  /* --- posições: gx é a profundidade, gy a posição na coluna --- */
  let gxMin = 1e9, gxMax = -1e9, gyMin = 1e9, gyMax = -1e9;
  nos.forEach(n => {
    gxMin = Math.min(gxMin, n.gx); gxMax = Math.max(gxMax, n.gx);
    gyMin = Math.min(gyMin, n.gy); gyMax = Math.max(gyMax, n.gy);
  });
  const larguraG = Math.max(1, gxMax - gxMin);
  const alturaG = Math.max(1, gyMax - gyMin);
  const margem = 62;
  const pos = {};
  nos.forEach(n => {
    pos[n.id] = {
      x: mapaR.x + margem + ((n.gx - gxMin) / larguraG) * (mapaR.w - margem * 2),
      y: mapaR.y + margem + ((n.gy - gyMin) / alturaG) * (mapaR.h - margem * 2 - 20)
    };
  });

  const porId = {};
  nos.forEach(n => { porId[n.id] = n; });
  const vizinhos = atual ? new Set(atual.links) : new Set();

  /* --- ligações --- */
  nos.forEach(n => {
    (n.links || []).forEach(l => {
      const a = pos[n.id], b = pos[l];
      if (!a || !b || !porId[l]) return;
      if (n.id > l) return;                    /* desenha cada aresta uma vez */
      const ativa = (atual && (n.id === atual.id || l === atual.id));
      ctx.strokeStyle = ativa ? alpha(C.cyanBright, 0.9) : alpha(C.cyanDim, 0.35);
      ctx.lineWidth = ativa ? 2 : 1;
      if (ativa) {
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -(UI.time * 22) % 9;
      }
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  });

  /* --- nós --- */
  let sobre = null;
  nos.forEach(n => {
    const p = pos[n.id];
    const est = ESTILO[n.kind] || ESTILO.hub;
    const aqui = n.here;
    const alcancavel = vizinhos.has(n.id);
    const fechado = !n.open;
    const escolhido = st.lanSel === n.id;

    const raio = aqui ? 21 : 17;
    const f = UI.probe(id + ':lan:' + n.id, p.x - raio - 4, p.y - raio - 4,
      (raio + 4) * 2, (raio + 4) * 2);
    const hov = (f & HOVER) !== 0;
    if (hov) sobre = n;

    /* halo de alcance: onde dá para ir a partir daqui */
    if (alcancavel && !aqui) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, raio + 9, 0, Math.PI * 2);
      ctx.fillStyle = alpha(C.cyan, 0.08);
      ctx.fill();
    }
    if (aqui) {
      const k = 0.5 + 0.5 * Math.sin(UI.time * 3);
      ctx.beginPath();
      ctx.arc(p.x, p.y, raio + 8 + k * 8, 0, Math.PI * 2);
      ctx.strokeStyle = alpha(C.cyanBright, 0.5 * (1 - k));
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const cor = fechado ? est.cor : est.cor;
    forma(ctx, est.forma, p.x, p.y, raio, cor, aqui, escolhido || hov);

    /* ícone interno */
    const ic = fechado ? 'lock' : (n.kind === 'system' ? 'disk'
      : n.kind === 'logserv' ? 'clock'
      : n.kind === 'terminal' ? 'monitor' : 'node');
    if (Icon[ic]) Icon[ic](ctx, p.x, p.y, raio * 0.62, aqui ? '#04121e' : cor);

    /* rótulo */
    const nome = n.probed ? n.name : '???';
    const larg = Text.width(ctx, nome, FONT.dataSmall);
    UI.fill(p.x - larg / 2 - 4, p.y + raio + 5, larg + 8, 15, alpha('#01060f', 0.82));
    Text.draw(ctx, nome, p.x, p.y + raio + 16, FONT.dataSmall,
      aqui ? C.cyanBright : n.probed ? C.text : C.textFaint, 'center');

    /* nível, quando sondado */
    if (n.probed && n.level) {
      Text.draw(ctx, 'nv ' + n.level, p.x, p.y + raio + 30, FONT.dataSmall,
        alpha(C.textFaint, 0.9), 'center');
    }

    /* clique: seleciona; se for vizinho, também tenta mover */
    if (f & CLICK) {
      st.lanSel = n.id;
      if (alcancavel) {
        const res = LAN.move(sv, n.id);
        if (res && res.erro) Bus.emit(EV.UI_TOAST, { text: res.erro, kind: 'bad' });
        else UI.sfx('ui_click');
      }
      Dirty.mark();
    }
  });

  /* --- legenda --- */
  const leg = mapaR.y + mapaR.h - 12;
  Text.draw(ctx, chegou
    ? 'sistema central alcançado — os arquivos estão liberados'
    : 'clique num equipamento vizinho para avançar',
    mapaR.x + SPACE.sm, leg, FONT.dataSmall,
    chegou ? C.okBright : alpha(C.textFaint, 0.85));

  /* ================= PAINEL ================= */
  painel(painelR, sv, st, id, sobre || (st.lanSel ? porId[st.lanSel] : null), chegou, nos);
}

/* --------------------------------------------------------
   FORMAS
   Cada tipo de equipamento tem silhueta própria: dá para ler a
   topologia sem ler um rótulo sequer.
   -------------------------------------------------------- */
function forma(ctx, tipo, x, y, r, cor, aqui, destaque) {
  ctx.save();
  ctx.beginPath();
  if (tipo === 'losango') {
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
  } else if (tipo === 'quadrado') {
    ctx.rect(x - r * 0.82, y - r * 0.82, r * 1.64, r * 1.64);
  } else if (tipo === 'triangulo') {
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.92, y + r * 0.72);
    ctx.lineTo(x - r * 0.92, y + r * 0.72);
  } else if (tipo === 'hexagono') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  } else {
    ctx.arc(x, y, r * 0.88, 0, Math.PI * 2);
  }
  ctx.closePath();

  const g = ctx.createLinearGradient(x, y - r, x, y + r);
  g.addColorStop(0, alpha(cor, aqui ? 0.95 : 0.30));
  g.addColorStop(1, alpha(cor, aqui ? 0.55 : 0.12));
  ctx.fillStyle = g;
  ctx.fill();

  ctx.strokeStyle = destaque ? '#ffffff' : cor;
  ctx.lineWidth = aqui ? 2.5 : destaque ? 2 : 1.4;
  ctx.stroke();
  ctx.restore();
}

/* --------------------------------------------------------
   PAINEL LATERAL
   -------------------------------------------------------- */
function painel(r, sv, st, id, no, chegou, nos) {
  const ctx = UI.ctx;
  UI.fillVGrad(r.x, r.y, r.w, r.h, C.panelTop, C.panelBottom);
  UI.frameR(r, C.line2, 1);
  let c = UI.pad(UI.copy(r), SPACE.sm, SPACE.sm);

  /* progresso */
  W.sectionBar(UI.stackTop(c, METRIC.headerH, SPACE.xs), 'REDE INTERNA');
  const resumo = UI.stackTop(c, 66, SPACE.sm);
  UI.fill(resumo.x, resumo.y, resumo.w, resumo.h, alpha(C.wellTop, 0.7));
  UI.frameR(resumo, C.line1, 1);
  let rr = UI.pad(resumo, SPACE.xs, SPACE.sm);
  W.stat(UI.stackTop(rr, 18, 2), 'MAPEADOS', nos.length + ' / ' + sv.lan.nodes.length,
    { valueColor: nos.length >= sv.lan.nodes.length ? C.okBright : C.warnBright });
  W.stat(UI.stackTop(rr, 18, 2), 'PROFUNDIDADE', String(sv.lan.depth));
  W.stat(UI.stackTop(rr, 18, 0), 'NÚCLEO', chegou ? 'alcançado' : 'bloqueado',
    { valueColor: chegou ? C.okBright : C.dangerBright });

  /* equipamento em foco */
  W.sectionBar(UI.stackTop(c, METRIC.headerH, SPACE.xs), 'EQUIPAMENTO');
  const box = UI.stackTop(c, 104, SPACE.sm);
  UI.fill(box.x, box.y, box.w, box.h, alpha(C.wellTop, 0.8));
  UI.frameR(box, no ? alpha(C.cyan, 0.5) : C.line1, 1);

  if (!no) {
    Text.center(ctx, 'passe o ponteiro sobre um nó', box.x, box.y, box.w, box.h,
      FONT.bodySmall, C.textFaint);
  } else {
    let b = UI.pad(box, SPACE.xs, SPACE.sm);
    const est = ESTILO[no.kind] || ESTILO.hub;
    const l1 = UI.stackTop(b, 20, 0);
    Text.drawFit(ctx, no.probed ? no.name : 'equipamento não sondado',
      l1.x, l1.y + 15, l1.w, FONT.label, no.probed ? C.textStrong : C.textFaint);
    const l2 = UI.stackTop(b, 17, 2);
    Text.draw(ctx, no.label + (no.level ? '   ·   nível ' + no.level : ''),
      l2.x, l2.y + 13, FONT.dataSmall, est.cor);
    const l3 = UI.stackTop(b, 40, 0);
    Text.wrap(ctx, no.probed ? (no.desc || '') : 'Rode o LAN_Probe para saber o que é.',
      FONT.dataSmall, l3.w).slice(0, 3).forEach((q, i) => {
      Text.draw(ctx, q, l3.x, l3.y + 12 + i * 13, FONT.dataSmall, C.textFaint);
    });
  }

  /* ações */
  const acoes = [
    ['LAN_SCAN', 'mapeia mais equipamentos', () => Game.software.lanScan(), true],
    ['LAN_PROBE', 'revela o que o equipamento é', () => Game.software.lanTool('probe', no && no.id), !!no],
    ['LAN_FORCE', 'arromba uma tranca', () => Game.software.lanTool('force', no && no.id),
      !!no && no.kind === 'lock'],
    ['LAN_SPOOF', 'falsifica credencial de máquina',
      () => Game.software.lanTool('spoof', no && no.id), !!no && no.kind === 'auth']
  ];

  W.sectionBar(UI.stackTop(c, METRIC.headerH, SPACE.xs), 'FERRAMENTAS DE REDE');
  acoes.forEach(([rot, sub, fn, ativo], i) => {
    const l = UI.stackTop(c, 42, SPACE.xs);
    UI.fill(l.x, l.y, l.w, l.h, alpha(ativo ? C.wellTop : '#060b16', 0.7));
    UI.frameR(l, ativo ? C.line2 : C.line1, 1);
    Text.drawFit(ctx, rot, l.x + SPACE.sm, l.y + 18, l.w - 98, FONT.label, ativo ? C.text : C.textFaint);
    Text.drawFit(ctx, sub, l.x + SPACE.sm, l.y + 33, l.w - 98, FONT.dataSmall, C.textFaint);
    const b = UI.rect(l.x + l.w - 80, l.y + 8, 72, 26);
    if (W.button(id + ':lanf' + i, b, 'RODAR',
      { primary: ativo, disabled: !ativo, font: FONT.labelSmall })) {
      const e = fn();
      if (e) Bus.emit(EV.UI_TOAST, { text: e, kind: 'bad' });
    }
  });

  /* terminal: a chave que abre trancas sem barulho */
  if (no && no.kind === 'terminal' && no.here) {
    const b = UI.stackTop(c, METRIC.btnH, SPACE.xs);
    if (W.button(id + ':lanterm', b, 'USAR TERMINAL', { primary: true })) {
      const res = LAN.useTerminal(sv, no.id);
      Bus.emit(EV.UI_TOAST, {
        text: (res && res.erro) ? res.erro : (res.texto || 'Terminal usado.'),
        kind: (res && res.erro) ? 'bad' : 'ok'
      });
      Dirty.mark();
    }
  }
}
