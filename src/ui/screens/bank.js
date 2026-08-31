/* =========================================================
   screens/bank.js — o sistema bancário.

   O banco não pergunta uma senha de máquina: ele pergunta NÚMERO DE
   CONTA e SENHA. É essa diferença que faz o dinheiro ser o alvo mais
   difícil do jogo — chegar ao servidor não serve de nada; é preciso
   ter descoberto as credenciais em outro lugar, quase sempre num
   arquivo do servidor da própria empresa.

   Três estados: autenticação, conta aberta e transferência.
   ========================================================= */
import { Game } from '../../core/game.js';
import { Bus, EV } from '../../core/bus.js';
import * as F from '../../core/fmt.js';
import * as Bank from '../../core/bank.js';
import { UI, HOVER, CLICK } from '../toolkit.js';
import { W, Icon } from '../widgets.js';
import { Text } from '../text.js';
import { Dirty } from '../anim.js';
import { C, FONT, SPACE, METRIC, alpha } from '../theme.js';

export function desenha(r, sv, st, id) {
  const bloqueio = Game.net.readBlock(sv);
  if (bloqueio) return barreira(r, bloqueio);

  const conta = Bank.openView(40);
  if (!conta) return telaLogin(r, sv, st, id);
  return telaConta(r, sv, st, id, conta);
}

/* =========================================================
   AUTENTICAÇÃO
   ========================================================= */
function telaLogin(r, sv, st, id) {
  const ctx = UI.ctx;
  const conhecidas = Bank.knownAccounts().filter(a => a.bank.ip === sv.ip);

  const listaR = UI.cutRight(r, Math.min(340, Math.round(r.w * 0.36)));
  UI.cutRight(r, SPACE.md);

  /* ---- formulário ---- */
  const cx = r.x + r.w / 2;
  const box = UI.rect(Math.round(cx - 230), r.y + Math.max(10, (r.h - 268) / 2), 460, 268);
  UI.fillVGrad(box.x, box.y, box.w, box.h, C.wellTop, C.wellBottom);
  UI.frameR(box, C.line3, 1);
  W.sectionBar(UI.rect(box.x, box.y, box.w, METRIC.headerH), 'ACESSO À CONTA');

  let c = UI.pad(UI.rect(box.x, box.y + METRIC.headerH, box.w, box.h - METRIC.headerH),
    SPACE.lg, SPACE.xl);

  Text.drawIn(ctx, sv.name, c.x, c.y, 22, FONT.label, C.cyanBright, 'left');
  UI.stackTop(c, 22, SPACE.sm);

  const l1 = UI.stackTop(c, 17, 2);
  Text.drawIn(ctx, 'NÚMERO DA CONTA', l1.x, l1.y, l1.h, FONT.labelSmall, C.textFaint, 'left');
  const f1 = UI.stackTop(c, METRIC.fieldH, SPACE.sm);
  W.bind(id + ':bconta', f1, st, 'bconta', { maxLen: 12, placeholder: '00000000', mono: true });

  const l2 = UI.stackTop(c, 17, 2);
  Text.drawIn(ctx, 'SENHA', l2.x, l2.y, l2.h, FONT.labelSmall, C.textFaint, 'left');
  const f2 = UI.stackTop(c, METRIC.fieldH, SPACE.md);
  W.bind(id + ':bsenha', f2, st, 'bsenha', { maxLen: 24, password: true });

  const bts = UI.stackTop(c, METRIC.btnH, SPACE.sm);
  if (W.button(id + ':bentrar', bts, 'ENTRAR', { primary: true, font: FONT.buttonBig })) {
    entrar(st);
  }
  const teclas = UI.takeKeys();
  if (teclas.some(k => k.key === 'Enter')) entrar(st);

  const dica = UI.stackTop(c, 34, 0);
  Text.drawFitIn(ctx,
    st.bmsg || 'As credenciais costumam estar num arquivo do servidor da própria empresa.',
    dica.x, dica.y, dica.w, dica.h, FONT.dataSmall,
    st.bmsg ? C.dangerBright : alpha(C.textFaint, 0.85), 'left');

  /* ---- contas já descobertas ---- */
  UI.fill(listaR.x, listaR.y, listaR.w, listaR.h, alpha(C.wellBottom, 0.6));
  UI.frameR(listaR, C.line1, 1);
  W.sectionBar(UI.rect(listaR.x, listaR.y, listaR.w, METRIC.headerH),
    'CREDENCIAIS CONHECIDAS  ·  ' + conhecidas.length);

  const corpo = UI.rect(listaR.x + 1, listaR.y + METRIC.headerH,
    listaR.w - 2, listaR.h - METRIC.headerH - 1);
  W.list(id + ':bconhecidas', corpo, conhecidas.length, (i, rr) => {
    const a = conhecidas[i].acc;
    Icon.money(ctx, rr.x + SPACE.md, rr.y + rr.h / 2, 12, a.isPlayer ? C.okBright : C.cyan);
    Text.draw(ctx, a.no, rr.x + 32, rr.y + 19, FONT.data, C.text);
    Text.drawFit(ctx, a.owner, rr.x + 32, rr.y + 35, rr.w - 44, FONT.dataSmall,
      a.isPlayer ? C.okBright : C.textFaint);
  }, {
    rowH: 46, state: st,
    empty: 'nenhuma credencial deste banco',
    onSelect: (i) => {
      /* clicar preenche o formulário: quem já descobriu não precisa
         digitar de novo o que o jogo já sabe */
      const a = conhecidas[i].acc;
      st.bconta = a.no;
      st.bsenha = a.pass;
      st.bmsg = '';
      Dirty.mark();
    }
  });
}

function entrar(st) {
  const res = Bank.openAccount(String(st.bconta || '').trim(), String(st.bsenha || ''));
  if (res.erro) {
    st.bmsg = res.erro;
    Bus.emit(EV.SFX, { name: 'error' });
  } else {
    st.bmsg = '';
    st.bsenha = '';
    Bus.emit(EV.SFX, { name: 'confirm' });
  }
  Dirty.mark();
}

/* =========================================================
   CONTA ABERTA
   ========================================================= */
function telaConta(r, sv, st, id, conta) {
  const ctx = UI.ctx;
  const S = Game.state;

  /* ---- cabeçalho da conta ---- */
  const topo = UI.stackTop(r, 92, SPACE.sm);
  UI.fillVGrad(topo.x, topo.y, topo.w, topo.h, C.panelTop, C.panelBottom);
  UI.frameR(topo, conta.isPlayer ? alpha(C.ok, 0.5) : C.line2, 1);
  let t = UI.pad(topo, SPACE.sm, SPACE.md);

  const l1 = UI.stackTop(t, 24, 2);
  Text.drawFit(ctx, conta.owner, l1.x, l1.y + 18, l1.w - 260, FONT.sectionTitle,
    conta.isPlayer ? C.okBright : C.textStrong);
  Text.draw(ctx, F.credits(conta.balance), l1.x + l1.w, l1.y + 18, FONT.dataBig,
    conta.balance > 0 ? C.okBright : C.textDim, 'right');

  const l2 = UI.stackTop(t, 18, SPACE.xs);
  Text.draw(ctx, 'conta ' + conta.no + '  ·  ' + conta.bank, l2.x, l2.y + 13,
    FONT.data, C.textDim);
  Text.draw(ctx, 'SALDO DISPONÍVEL', l2.x + l2.w, l2.y + 13, FONT.labelSmall,
    C.textFaint, 'right');

  /* mancha: dinheiro que chegou sujo demais chama auditoria */
  const l3 = UI.stackTop(t, 16, 0);
  if (conta.taint > 0.02) {
    const nivel = conta.taint > 0.7 ? 'ALTO' : conta.taint > 0.35 ? 'MÉDIO' : 'BAIXO';
    const cor = conta.taint > 0.7 ? C.dangerBright : conta.taint > 0.35 ? C.warnBright : C.warn;
    Text.draw(ctx, 'RISCO DE AUDITORIA: ' + nivel, l3.x, l3.y + 12, FONT.labelSmall, cor);
    W.meter(UI.rect(l3.x + 180, l3.y + 4, 140, 8), conta.taint * 100, cor);
  } else {
    Text.draw(ctx, 'movimentação sem irregularidades apontadas',
      l3.x, l3.y + 12, FONT.dataSmall, alpha(C.textFaint, 0.8));
  }

  /* ---- transferência ---- */
  const podeEscrever = Game.net.canWrite(sv);
  const transfR = UI.cutRight(r, Math.min(360, Math.round(r.w * 0.38)));
  UI.cutRight(r, SPACE.md);

  UI.fillVGrad(transfR.x, transfR.y, transfR.w, transfR.h, C.wellTop, C.wellBottom);
  UI.frameR(transfR, C.line2, 1);
  W.sectionBar(UI.rect(transfR.x, transfR.y, transfR.w, METRIC.headerH), 'TRANSFERÊNCIA');

  let tr = UI.pad(UI.rect(transfR.x, transfR.y + METRIC.headerH,
    transfR.w, transfR.h - METRIC.headerH), SPACE.md, SPACE.md);

  if (!podeEscrever) {
    Text.drawFitIn(ctx, Game.net.writeBlock(sv), tr.x, tr.y, tr.w, 40,
      FONT.bodySmall, C.dangerBright, 'left');
    Text.drawFitIn(ctx, 'mover dinheiro é escrita: o proxy precisa cair',
      tr.x, tr.y + 26, tr.w, 40, FONT.dataSmall, C.textFaint, 'left');
  } else {
    /* destino: qualquer conta cuja senha o agente conheça */
    const destinos = Bank.knownAccounts().filter(a => a.acc.no !== conta.no);
    const rotulos = destinos.length
      ? destinos.map(a => a.acc.no + '  ' + a.acc.owner.slice(0, 22) +
          (a.acc.isPlayer ? '  (sua)' : ''))
      : ['— nenhuma outra conta conhecida —'];

    const ld = UI.stackTop(tr, 17, 2);
    Text.drawIn(ctx, 'DESTINO', ld.x, ld.y, ld.h, FONT.labelSmall, C.textFaint, 'left');
    const fd = UI.stackTop(tr, METRIC.fieldH, SPACE.sm);
    st.bdest = W.dropdown(id + ':bdest', fd, rotulos, Math.min(st.bdest || 0, rotulos.length - 1));

    const lv = UI.stackTop(tr, 17, 2);
    Text.drawIn(ctx, 'VALOR', lv.x, lv.y, lv.h, FONT.labelSmall, C.textFaint, 'left');
    const fv = UI.stackTop(tr, METRIC.fieldH, SPACE.xs);
    W.bind(id + ':bvalor', fv, st, 'bvalor', { maxLen: 12, placeholder: '0', mono: true });

    /* atalhos de valor: contar zero é onde se erra */
    const atalhos = UI.stackTop(tr, 26, SPACE.md);
    const fatias = [
      ['25%', Math.floor(conta.balance * 0.25)],
      ['50%', Math.floor(conta.balance * 0.5)],
      ['TUDO', conta.balance]
    ];
    let ax = atalhos.x;
    const aw = Math.floor((atalhos.w - SPACE.xs * 2) / 3);
    fatias.forEach(([rot, valor], i) => {
      const b = UI.rect(ax, atalhos.y, aw, 26);
      if (W.button(id + ':bfat' + i, b, rot, { font: FONT.labelSmall })) {
        st.bvalor = String(valor); Dirty.mark();
      }
      ax += aw + SPACE.xs;
    });

    const bt = UI.stackTop(tr, METRIC.btnH, SPACE.sm);
    const valor = parseInt(String(st.bvalor || '').replace(/\D/g, ''), 10) || 0;
    const destino = destinos[st.bdest];
    if (W.button(id + ':btransf', bt, 'TRANSFERIR',
      { primary: true, font: FONT.buttonBig, disabled: !destino || valor <= 0 })) {
      const res = Bank.transfer(conta.no, destino.acc.no, valor);
      Bus.emit(EV.UI_TOAST, {
        text: (res && res.erro) ? res.erro
          : 'Transferidos ' + F.credits(valor) + ' para ' + destino.acc.owner + '.',
        kind: (res && res.erro) ? 'bad' : 'ok'
      });
      if (!res || !res.erro) { st.bvalor = ''; }
      Dirty.mark();
    }

    const aviso = UI.stackTop(tr, 46, 0);
    Text.wrap(ctx,
      'A transferência deixa registro nos DOIS bancos. Apagar o log de um só não adianta.',
      FONT.dataSmall, aviso.w).forEach((q, i) => {
      Text.draw(ctx, q, aviso.x, aviso.y + 12 + i * 14, FONT.dataSmall, alpha(C.warnBright, 0.85));
    });
  }

  /* ---- extrato ---- */
  const btsR = UI.cutBottom(r, METRIC.btnH + SPACE.sm);
  UI.fillVGrad(r.x, r.y, r.w, r.h, C.wellTop, C.wellBottom);
  UI.frameR(r, C.line2, 1);
  W.sectionBar(UI.rect(r.x, r.y, r.w, METRIC.headerH),
    'EXTRATO  ·  ' + conta.statements.length + ' movimentações');

  const ext = UI.rect(r.x + 1, r.y + METRIC.headerH, r.w - 2, r.h - METRIC.headerH - 1);
  W.list(id + ':bext', ext, conta.statements.length, (i, rr) => {
    const m = conta.statements[i];
    const entrada = m.amt >= 0;
    UI.fill(rr.x + 4, rr.y + 6, 3, rr.h - 12, entrada ? C.ok : C.danger);
    Text.draw(ctx, F.fmtDate(m.t), rr.x + SPACE.md, rr.y + 20, FONT.dataSmall, C.textFaint);
    Text.drawFit(ctx, m.txt, rr.x + 152, rr.y + 20, rr.w - 152 - 260, FONT.bodySmall, C.text);
    Text.draw(ctx, (entrada ? '+' : '') + F.credits(m.amt), rr.x + rr.w - 132, rr.y + 20,
      FONT.dataStrong, entrada ? C.okBright : C.dangerBright, 'right');
    Text.draw(ctx, F.credits(m.bal), rr.x + rr.w - SPACE.sm, rr.y + 20,
      FONT.data, C.textDim, 'right');
  }, { rowH: 32, state: st, empty: 'nenhuma movimentação registrada' });

  /* ---- ações ---- */
  const b1 = UI.cutLeft(btsR, 170); UI.cutLeft(btsR, SPACE.sm);
  const b2 = UI.cutLeft(btsR, 200);
  if (W.button(id + ':bsair', b1, 'SAIR DA CONTA')) {
    Bank.closeAccount(); st.bconta = ''; st.bsenha = ''; Dirty.mark();
  }
  if (W.button(id + ':blimpar', b2, 'APAGAR EXTRATO',
    { danger: true, disabled: !podeEscrever })) {
    /* apagar o extrato é encobrir a própria transferência */
    const alvo = Bank.findAccount(conta.no);
    if (alvo) {
      const n = (alvo.acc.statements || []).length;
      alvo.acc.statements = [];
      Game.net.illegal(sv, 3);
      Bus.emit(EV.UI_TOAST, {
        text: n + ' movimentações apagadas. O log do banco ainda registra o acesso.',
        kind: 'warn'
      });
      Dirty.mark();
    }
  }
}

function barreira(r, texto) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  Icon.lock(UI.ctx, cx, cy - 40, 44, alpha(C.danger, 0.8));
  Text.center(UI.ctx, texto, r.x, cy, r.w, 30, FONT.sectionTitle, C.dangerBright);
  Text.center(UI.ctx, 'vá em FERRAMENTAS e vença a camada que bloqueia',
    r.x, cy + 34, r.w, 24, FONT.bodySmall, C.textFaint);
}
