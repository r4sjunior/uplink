/* =========================================================
   finance.js — a conta do agente.

   Extrato, patrimônio e empréstimos. O gráfico de saldo existe por
   um motivo de jogo: dinheiro que entra em degraus grandes e
   irregulares é exatamente o que uma auditoria procura, e a curva
   deixa isso visível antes que o banco perceba.
   ========================================================= */
import { Game } from '../../core/game.js';
import { Bus, EV } from '../../core/bus.js';
import * as F from '../../core/fmt.js';
import { UI } from '../toolkit.js';
import { W, Icon } from '../widgets.js';
import { Text } from '../text.js';
import { Dirty } from '../anim.js';
import { C, FONT, SPACE, METRIC, alpha } from '../theme.js';

export const id = 'finance';
export const title = 'FINANÇAS';
export const label = 'FINANÇAS';
export const icon = 'money';
export const w = 1000, h = 620;
export const minW = 720, minH = 420;

export function draw(r) {
  const st = UI.state(id, () => ({ aba: 0, sel: 0, scroll: 0, valor: '' }));
  const conta = Game.bank.playerAccount();

  const abaR = UI.stackTop(r, METRIC.tabH, SPACE.sm);
  const nova = W.tabs(id + ':abas', abaR, ['EXTRATO', 'EMPRÉSTIMOS'], st.aba);
  if (nova !== st.aba) { st.aba = nova; st.sel = 0; Dirty.mark(); }

  if (!conta) {
    Text.center(UI.ctx, 'conta indisponível', r.x, r.y, r.w, r.h, FONT.body, C.textFaint);
    return;
  }

  if (st.aba === 0) extrato(r, st, conta);
  else emprestimos(r, st);
}

function extrato(r, st, conta) {
  const S = Game.state;
  const banco = S.world.servers[S.bank.ip];
  const mov = conta.statements || [];

  /* ---- resumo ---- */
  const topo = UI.stackTop(r, 96, SPACE.sm);
  UI.fillVGrad(topo.x, topo.y, topo.w, topo.h, C.panelTop, C.panelBottom);
  UI.frameR(topo, C.line2, 1);

  const larguraCard = Math.floor(topo.w / 4);
  const cards = [
    ['SALDO', F.credits(conta.balance), C.okBright],
    ['PATRIMÔNIO', F.credits(Game.bank.netWorth()), C.text],
    ['DÍVIDA', F.credits(Game.bank.debtTotal()), Game.bank.debtTotal() > 0 ? C.dangerBright : C.textDim],
    ['CONTRATOS', String(S.stats.missionsDone), C.cyanBright]
  ];
  cards.forEach(([rot, val, cor], i) => {
    const cr = UI.rect(topo.x + i * larguraCard, topo.y, larguraCard, topo.h);
    if (i > 0) UI.vline(cr.x, cr.y + SPACE.md, cr.h - SPACE.xxl, C.line1);
    Text.center(UI.ctx, rot, cr.x, cr.y + SPACE.md, cr.w, 18, FONT.labelSmall, C.textFaint);
    Text.center(UI.ctx, val, cr.x, cr.y + 38, cr.w, 30, FONT.dataBig, cor);
  });

  /* dados da conta */
  const linha = UI.stackTop(r, 20, SPACE.sm);
  Text.drawIn(UI.ctx, banco.name + '  ·  conta ' + conta.no,
    linha.x, linha.y, linha.h, FONT.data, C.textDim, 'left');
  Text.drawIn(UI.ctx, S.playerIP, linha.x + linha.w, linha.y, linha.h,
    FONT.dataSmall, C.textFaint, 'right');

  /* ---- gráfico de saldo ---- */
  const grafR = UI.stackTop(r, Math.min(190, Math.round(r.h * 0.34)), SPACE.sm);
  UI.fillVGrad(grafR.x, grafR.y, grafR.w, grafR.h, C.wellTop, C.wellBottom);
  UI.frameR(grafR, C.line2, 1);
  const cab = UI.cutTop(UI.copy(grafR), METRIC.headerH);
  W.sectionBar(cab, 'EVOLUÇÃO DO SALDO');

  const serie = mov.slice(0, 40).reverse().map(m => m.bal);
  if (serie.length > 1) {
    W.chartLine(UI.pad(UI.rect(grafR.x + 1, grafR.y + METRIC.headerH,
      grafR.w - 2, grafR.h - METRIC.headerH - 1), SPACE.sm, SPACE.md),
      [{ values: serie, color: C.cyanBright, fill: true }], { grid: true });
  } else {
    Text.center(UI.ctx, 'movimentação insuficiente para um gráfico',
      grafR.x, grafR.y + METRIC.headerH, grafR.w, grafR.h - METRIC.headerH,
      FONT.bodySmall, C.textFaint);
  }

  /* ---- extrato ---- */
  UI.fillVGrad(r.x, r.y, r.w, r.h, C.wellTop, C.wellBottom);
  UI.frameR(r, C.line2, 1);

  W.list(id + ':mov', UI.pad(r, 1, 1), mov.length, (i, rr) => {
    const m = mov[i];
    const entrada = m.amt >= 0;
    UI.fill(rr.x + 4, rr.y + 8, 3, rr.h - 16, entrada ? C.ok : C.danger);
    Text.draw(UI.ctx, F.fmtDate(m.t), rr.x + SPACE.md, rr.y + 21, FONT.dataSmall, C.textFaint);
    Text.drawFit(UI.ctx, m.txt, rr.x + 150, rr.y + 21, rr.w - 360, FONT.bodySmall, C.text);
    Text.draw(UI.ctx, (entrada ? '+' : '') + F.credits(m.amt),
      rr.x + rr.w - 130, rr.y + 21, FONT.dataStrong, entrada ? C.okBright : C.dangerBright, 'right');
    Text.draw(UI.ctx, F.credits(m.bal), rr.x + rr.w - SPACE.sm, rr.y + 21,
      FONT.data, C.textDim, 'right');
  }, { rowH: 34, state: st, empty: 'nenhuma movimentação' });
}

function emprestimos(r, st) {
  const S = Game.state;
  const capacidade = Game.bank.loanCapacity();

  const topo = UI.stackTop(r, 128, SPACE.sm);
  UI.fillVGrad(topo.x, topo.y, topo.w, topo.h, C.panelTop, C.panelBottom);
  UI.frameR(topo, C.line2, 1);
  let c = UI.pad(topo, SPACE.md, SPACE.lg);

  Text.drawIn(UI.ctx, 'CRÉDITO DISPONÍVEL', c.x, c.y, 20, FONT.labelSmall, C.textFaint, 'left');
  UI.stackTop(c, 22, 0);
  const val = UI.stackTop(c, 32, SPACE.xs);
  Text.drawIn(UI.ctx, F.credits(capacidade), val.x, val.y, val.h, FONT.dataBig,
    capacidade > 0 ? C.okBright : C.textDim, 'left');
  Text.drawIn(UI.ctx, 'a Uplink avalia o seu rating, não o seu saldo',
    val.x + 200, val.y, val.h, FONT.bodySmall, C.textFaint, 'left');

  const linha = UI.stackTop(c, METRIC.fieldH, 0);
  const campo = UI.cutLeft(linha, 220);
  UI.cutLeft(linha, SPACE.sm);
  const botao = UI.cutLeft(linha, 170);
  W.bind(id + ':valor', campo, st, 'valor', { placeholder: 'valor em créditos', numeric: true });
  if (W.button(id + ':tomar', botao, 'TOMAR EMPRÉSTIMO',
    { primary: true, disabled: capacidade <= 0 })) {
    const n = parseInt(String(st.valor).replace(/\D/g, ''), 10);
    const erro = Game.bank.takeLoan(n);
    Bus.emit(EV.UI_TOAST, {
      text: (erro && erro.erro) ? erro.erro : 'Empréstimo aprovado: ' + F.credits(n),
      kind: (erro && erro.erro) ? 'bad' : 'ok'
    });
    if (!erro || !erro.erro) { st.valor = ''; Dirty.mark(); }
  }

  /* lista de dívidas */
  UI.fillVGrad(r.x, r.y, r.w, r.h, C.wellTop, C.wellBottom);
  UI.frameR(r, C.line2, 1);
  const cab = UI.cutTop(UI.copy(r), METRIC.headerH);
  W.sectionBar(cab, 'DÍVIDAS ATIVAS  ·  ' + S.loans.length);

  const corpo = UI.rect(r.x + 1, r.y + METRIC.headerH, r.w - 2, r.h - METRIC.headerH - 1);
  W.list(id + ':loans', corpo, S.loans.length, (i, rr) => {
    const l = S.loans[i];
    Text.draw(UI.ctx, F.credits(l.amount), rr.x + SPACE.md, rr.y + 20, FONT.dataStrong, C.text);
    Text.draw(UI.ctx, 'juros ' + (l.rate * 100).toFixed(1) + '% ao dia',
      rr.x + 160, rr.y + 20, FONT.dataSmall, C.warnBright);
    Text.draw(UI.ctx, 'devido: ' + F.credits(l.owed), rr.x + 330, rr.y + 20,
      FONT.dataStrong, C.dangerBright);
    Text.draw(UI.ctx, 'desde ' + F.fmtDateShort(l.t), rr.x + 520, rr.y + 20,
      FONT.dataSmall, C.textFaint);
    const b = UI.rect(rr.x + rr.w - 110, rr.y + 6, 100, 26);
    if (W.button(id + ':pay' + i, b, 'QUITAR', { disabled: S.credits < l.owed })) {
      const e = Game.bank.repayLoan(l.id, l.owed);
      Bus.emit(EV.UI_TOAST, {
        text: (e && e.erro) ? e.erro : 'Dívida quitada.',
        kind: (e && e.erro) ? 'bad' : 'ok'
      });
    }
  }, { rowH: 38, state: st, empty: 'nenhuma dívida — mantenha assim' });
}
