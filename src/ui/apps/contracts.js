/* =========================================================
   contracts.js — o quadro de contratos.

   Três abas: disponíveis, aceitos e histórico. O painel da direita
   mostra o briefing e — a parte que faz diferença para quem está
   aprendendo — o passo a passo que o contrato traz. O Uplink
   original deixava o jogador descobrir sozinho; aqui o roteiro
   existe, mas nada é feito por ele.
   ========================================================= */
import { Game } from '../../core/game.js';
import { Bus, EV } from '../../core/bus.js';
import * as F from '../../core/fmt.js';
import { UI } from '../toolkit.js';
import { W, Icon } from '../widgets.js';
import { Text } from '../text.js';
import { Dirty } from '../anim.js';
import { C, FONT, SPACE, METRIC, alpha } from '../theme.js';
import { Apps } from './index.js';

export const id = 'contracts';
export const title = 'CONTRATOS';
export const label = 'CONTRATOS';
export const icon = 'disk';
export const w = 1080, h = 640;
export const minW = 760, minH = 420;

const ABAS = ['DISPONÍVEIS', 'ACEITOS', 'HISTÓRICO'];

function corDificuldade(d) {
  return d <= 1 ? C.ok : d <= 2 ? C.okBright : d <= 3 ? C.warn : d <= 4 ? C.warnBright : C.dangerBright;
}

export function draw(r) {
  const st = UI.state(id, () => ({ aba: 0, sel: 0, scroll: 0, scrollBrief: 0 }));
  const quadro = Game.missions.boardView();

  /* ---- abas ---- */
  const abaR = UI.stackTop(r, METRIC.tabH, SPACE.sm);
  const rotulos = [
    ABAS[0] + '  ' + quadro.available.length,
    ABAS[1] + '  ' + quadro.active.length + '/' + quadro.slots.max,
    ABAS[2] + '  ' + quadro.done.length
  ];
  const novaAba = W.tabs(id + ':abas', abaR, rotulos, st.aba);
  if (novaAba !== st.aba) { st.aba = novaAba; st.sel = 0; Dirty.mark(); }

  const lista = st.aba === 0 ? quadro.available : st.aba === 1 ? quadro.active : quadro.done;

  /* ---- duas colunas ---- */
  const escolhaR = UI.cutLeft(r, Math.max(380, Math.round(r.w * 0.44)));
  UI.cutLeft(r, SPACE.sm);
  const briefR = r;

  /* ================= coluna esquerda ================= */
  UI.fillVGrad(escolhaR.x, escolhaR.y, escolhaR.w, escolhaR.h, C.wellTop, C.wellBottom);
  UI.frameR(escolhaR, C.line2, 1);
  const corpo = UI.rect(escolhaR.x + 1, escolhaR.y + 1, escolhaR.w - 2, escolhaR.h - 2);

  if (st.aba === 2) {
    W.list(id + ':hist', corpo, lista.length, (i, rr) => {
      const m = lista[i];
      Text.drawFit(UI.ctx, m.title, rr.x + SPACE.sm, rr.y + 20, rr.w - 130, FONT.label, C.text);
      Text.draw(UI.ctx, F.credits(m.reward), rr.x + rr.w - SPACE.sm, rr.y + 20,
        FONT.dataStrong, C.okBright, 'right');
      Text.draw(UI.ctx, F.fmtDateShort(m.at), rr.x + SPACE.sm, rr.y + 36, FONT.dataSmall, C.textFaint);
    }, { rowH: 46, empty: 'nenhum contrato concluído ainda', state: st });
  } else {
    W.list(id + ':lista', corpo, lista.length, (i, rr, hov, sel) => {
      const m = lista[i];

      /* barra de dificuldade à esquerda */
      const cd = corDificuldade(m.difficulty);
      UI.fill(rr.x + 4, rr.y + 8, 3, rr.h - 16, alpha(cd, 0.9));

      const x = rr.x + SPACE.md;
      const larg = rr.w - SPACE.md - 110;

      Text.drawFit(UI.ctx, m.title, x, rr.y + 19, larg, FONT.label,
        sel ? C.textStrong : C.text);
      Text.drawFit(UI.ctx, m.employer, x, rr.y + 35, larg, FONT.dataSmall,
        sel ? C.cyanBright : C.textFaint);

      Text.draw(UI.ctx, F.credits(m.reward), rr.x + rr.w - SPACE.sm, rr.y + 19,
        FONT.dataStrong, C.okBright, 'right');

      /* prazo, ou progresso quando o objetivo conta tempo */
      if (m.progressOf > 0 && st.aba === 1) {
        const bar = UI.rect(rr.x + rr.w - 104, rr.y + 30, 88, 8);
        W.progress(bar, (m.progress / m.progressOf) * 100, { color: C.cyanBright });
      } else {
        const dias = Math.floor(m.remaining / (24 * 60));
        const urgente = dias < 1;
        Text.draw(UI.ctx, dias >= 1 ? dias + ' dias' : F.fmtSecs(m.remaining * 60 / 60) + ' restantes',
          rr.x + rr.w - SPACE.sm, rr.y + 35, FONT.dataSmall,
          urgente ? C.dangerBright : C.textFaint, 'right');
      }

      if (m.tutorial) W.tag(UI.rect(x, rr.y + 42, 74, 14), 'TREINAMENTO', C.cyan);
    }, {
      rowH: 62, state: st, empty: st.aba === 0
        ? 'nenhuma oferta no momento — o quadro se repõe sozinho'
        : 'você não aceitou nenhum contrato'
    });
  }

  /* ================= coluna direita ================= */
  const m = lista[st.sel];
  UI.fillVGrad(briefR.x, briefR.y, briefR.w, briefR.h, C.panelTop, C.panelBottom);
  UI.frameR(briefR, C.line2, 1);

  if (!m) {
    Text.center(UI.ctx, 'selecione um contrato', briefR.x, briefR.y, briefR.w, briefR.h,
      FONT.body, C.textFaint);
    return;
  }
  if (st.aba === 2) {
    Text.center(UI.ctx, 'contrato concluído', briefR.x, briefR.y, briefR.w, 80, FONT.body, C.ok);
    return;
  }

  let c = UI.pad(UI.copy(briefR), SPACE.md, SPACE.lg);

  const tit = UI.stackTop(c, 28, 2);
  Text.drawFitIn(UI.ctx, m.title, tit.x, tit.y, tit.w, tit.h, FONT.sectionTitle, C.textStrong, 'left');

  const sub = UI.stackTop(c, 18, SPACE.sm);
  Text.drawIn(UI.ctx, m.employer + '  ·  ' + m.contact, sub.x, sub.y, sub.h,
    FONT.dataSmall, C.cyan, 'left');

  /* ficha de dados */
  const ficha = UI.stackTop(c, 84, SPACE.sm);
  UI.fill(ficha.x, ficha.y, ficha.w, ficha.h, alpha(C.wellTop, 0.7));
  UI.frameR(ficha, C.line1, 1);
  let fr = UI.pad(ficha, SPACE.xs, SPACE.sm);
  W.stat(UI.stackTop(fr, 18, 2), 'ALVO', m.targetName, { valueColor: C.warnBright });
  W.stat(UI.stackTop(fr, 18, 2), 'ENDEREÇO', m.targetIp, { valueColor: C.text });
  W.stat(UI.stackTop(fr, 18, 2), 'PAGAMENTO', F.credits(m.reward), { valueColor: C.okBright });
  W.stat(UI.stackTop(fr, 18, 0), 'PRAZO', F.fmtDate(m.deadline), { valueColor: C.text });

  /* botões */
  const bts = UI.stackTop(c, METRIC.btnH, SPACE.sm);
  if (st.aba === 0) {
    const b1 = UI.cutLeft(bts, 150);
    UI.cutLeft(bts, SPACE.sm);
    const b2 = UI.cutLeft(bts, 150);
    const cheio = Game.state.missions.active.length >= quadro.slots.max;
    if (W.button(id + ':aceitar', b1, 'ACEITAR', { primary: true, disabled: cheio })) {
      const erro = Game.missions.accept(m.id);
      if (erro) Bus.emit(EV.UI_TOAST, { text: erro, kind: 'bad' });
      else { st.sel = 0; Dirty.mark(); }
    }
    if (W.button(id + ':rota1', b2, 'DEFINIR COMO ALVO')) {
      Game.net.setTarget(m.targetIp);
      Apps.open('route');
    }
  } else {
    const b1 = UI.cutLeft(bts, 150);
    UI.cutLeft(bts, SPACE.sm);
    const b2 = UI.cutLeft(bts, 150);
    UI.cutLeft(bts, SPACE.sm);
    const b3 = UI.cutLeft(bts, 140);
    if (W.button(id + ':rota2', b1, 'DEFINIR COMO ALVO', { primary: true })) {
      Game.net.setTarget(m.targetIp);
      Apps.open('route');
    }
    if (m.needsDelivery && W.button(id + ':entregar', b2, 'ENTREGAR')) {
      Apps.open('email');
    }
    if (W.button(id + ':abandonar', b3, 'ABANDONAR', { danger: true })) {
      Game.missions.abandon(m.id);
      st.sel = 0; Dirty.mark();
    }
  }

  /* briefing e passos, com rolagem */
  UI.pushClip(c.x, c.y, c.w, c.h);
  let y = c.y + 6;

  Text.draw(UI.ctx, 'BRIEFING', c.x, y + 12, FONT.labelSmall, C.warnBright);
  y += 26;
  Text.wrap(UI.ctx, m.brief.replace(/\*\*/g, ''), FONT.body, c.w).forEach(q => {
    Text.draw(UI.ctx, q, c.x, y + 14, FONT.body, C.text);
    y += 21;
  });

  y += SPACE.md;
  Text.draw(UI.ctx, 'COMO FAZER', c.x, y + 12, FONT.labelSmall, C.cyanBright);
  y += 26;
  m.steps.forEach((passo, i) => {
    const num = String(i + 1) + '.';
    Text.draw(UI.ctx, num, c.x + 2, y + 14, FONT.dataStrong, C.cyan);
    Text.wrap(UI.ctx, passo, FONT.bodySmall, c.w - 26).forEach((q, k) => {
      Text.draw(UI.ctx, q, c.x + 26, y + 14, FONT.bodySmall, C.textDim);
      y += 19;
    });
    y += 6;
  });
  UI.popClip();
}
