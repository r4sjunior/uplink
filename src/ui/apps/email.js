/* =========================================================
   email.js — o cliente de correspondência.

   Duas colunas: a lista à esquerda, a mensagem à direita. A parte
   que importa para o jogo fica no rodapé da mensagem: quando o
   e-mail pertence a um contrato de entrega, aparece o seletor de
   anexo. Entregar é responder um e-mail com o arquivo certo — se o
   anexo estiver errado, criptografado ou vier do servidor errado, a
   entrega volta recusada e o contrato continua aberto.
   ========================================================= */
import { Game } from '../../core/game.js';
import { Bus, EV } from '../../core/bus.js';
import * as F from '../../core/fmt.js';
import { UI, HOVER, CLICK } from '../toolkit.js';
import { W, Icon } from '../widgets.js';
import { Text } from '../text.js';
import { Dirty } from '../anim.js';
import { C, FONT, SPACE, METRIC, alpha } from '../theme.js';

export const id = 'email';
export const title = 'CORRESPONDÊNCIA';
export const label = 'E-MAIL';
export const icon = 'mail';
export const w = 940, h = 600;
export const minW = 620, minH = 380;

export const badge = (hud) => hud.unread;

export function draw(r) {
  const S = Game.state;
  const st = UI.state(id, () => ({ sel: 0, anexo: -1, scroll: 0 }));
  const msgs = S.email;

  const listaR = UI.cutLeft(r, Math.max(260, Math.round(r.w * 0.34)));
  UI.cutLeft(r, SPACE.sm);
  const corpoR = r;

  /* ---------------- lista ---------------- */
  UI.fillVGrad(listaR.x, listaR.y, listaR.w, listaR.h, C.wellTop, C.wellBottom);
  UI.frameR(listaR, C.line2, 1);

  const cab = UI.cutTop(UI.copy(listaR), METRIC.headerH);
  W.sectionBar(cab, 'CAIXA DE ENTRADA  ·  ' + msgs.length);

  const corpoLista = UI.rect(listaR.x + 1, listaR.y + METRIC.headerH,
    listaR.w - 2, listaR.h - METRIC.headerH - 1);

  W.list(id + ':lista', corpoLista, msgs.length, (i, rr, hov, sel) => {
    const m = msgs[i];
    const naoLida = !m.read && m.kind !== 'sent';

    /* marcador de não lida */
    if (naoLida) UI.fill(rr.x + 5, rr.y + rr.h / 2 - 3, 6, 6, C.cyanBright);

    const x = rr.x + SPACE.md + 4;
    const larg = rr.w - SPACE.md - SPACE.lg;

    Text.drawFit(UI.ctx, m.subj, x, rr.y + 18, larg, FONT.label,
      naoLida ? C.textStrong : (sel ? C.textStrong : C.text));

    Text.drawFit(UI.ctx, m.from, x, rr.y + 34, larg - 70, FONT.dataSmall,
      sel ? C.cyanBright : C.textFaint);

    Text.draw(UI.ctx, F.fmtDateShort(m.t), rr.x + rr.w - SPACE.xs, rr.y + 34,
      FONT.dataSmall, C.textFaint, 'right');

    /* etiqueta de tipo */
    if (m.kind === 'mission') W.tag(UI.rect(rr.x + rr.w - 74, rr.y + 6, 66, 14), 'CONTRATO', C.warn);
    else if (m.kind === 'story') W.tag(UI.rect(rr.x + rr.w - 74, rr.y + 6, 66, 14), 'PESSOAL', C.special);
  }, {
    rowH: 46,
    empty: 'nenhuma mensagem',
    state: st,
    onSelect: (i) => { if (msgs[i] && !msgs[i].read) { msgs[i].read = true; Dirty.mark(); } st.anexo = -1; }
  });

  /* ---------------- mensagem ---------------- */
  UI.fillVGrad(corpoR.x, corpoR.y, corpoR.w, corpoR.h, C.panelTop, C.panelBottom);
  UI.frameR(corpoR, C.line2, 1);

  const m = msgs[st.sel];
  if (!m) {
    Text.center(UI.ctx, 'selecione uma mensagem', corpoR.x, corpoR.y,
      corpoR.w, corpoR.h, FONT.body, C.textFaint);
    return;
  }
  if (!m.read) { m.read = true; }

  let c = UI.pad(UI.copy(corpoR), SPACE.md, SPACE.lg);

  /* cabeçalho */
  const tit = UI.stackTop(c, 30, SPACE.xxs);
  Text.drawFitIn(UI.ctx, m.subj, tit.x, tit.y, tit.w, tit.h, FONT.sectionTitle, C.textStrong, 'left');

  const de = UI.stackTop(c, 20, 2);
  Text.drawIn(UI.ctx, 'de: ' + m.from, de.x, de.y, de.h, FONT.data, C.cyan, 'left');
  Text.drawIn(UI.ctx, F.fmtDate(m.t), de.x + de.w, de.y, de.h, FONT.dataSmall, C.textFaint, 'right');

  const sep = UI.stackTop(c, 10, SPACE.sm);
  W.separator(sep, C.line2);

  /* o contrato ligado a esta mensagem, se houver */
  const contrato = m.mission
    ? Game.missions.boardView().active.find(x => x.id === m.mission)
    : null;

  /* rodapé de entrega ocupa espaço: reserva antes de desenhar o corpo */
  const precisaEntrega = contrato && contrato.needsDelivery;
  const rodapeH = precisaEntrega ? 96 : 0;
  const corpoTexto = UI.rect(c.x, c.y, c.w, c.h - rodapeH);

  UI.pushClip(corpoTexto.x, corpoTexto.y, corpoTexto.w, corpoTexto.h);
  let y = corpoTexto.y + 4;
  String(m.body).split('\n').forEach(linha => {
    if (!linha.trim()) { y += 10; return; }
    /* negrito em **texto** vira destaque de cor */
    const destaque = /\*\*/.test(linha);
    const limpa = linha.replace(/\*\*/g, '');
    const quebradas = Text.wrap(UI.ctx, limpa, FONT.body, corpoTexto.w);
    quebradas.forEach(q => {
      Text.draw(UI.ctx, q, corpoTexto.x, y + 14, FONT.body,
        destaque ? C.cyanBright : (/^ {2}/.test(q) ? C.textDim : C.text));
      y += 21;
    });
  });
  UI.popClip();

  /* ---------------- entrega de arquivo ---------------- */
  if (precisaEntrega) {
    const rod = UI.rect(c.x, c.y + c.h - rodapeH, c.w, rodapeH);
    UI.hline(rod.x, rod.y, rod.w, C.line2);
    let rr = UI.pad(rod, SPACE.sm, 0);

    const lbl = UI.stackTop(rr, 18, SPACE.xxs);
    Text.drawIn(UI.ctx, 'RESPONDER COM ANEXO', lbl.x, lbl.y, lbl.h, FONT.labelSmall, C.warnBright, 'left');

    const memoria = Game.state.memory;
    const linha = UI.stackTop(rr, METRIC.fieldH, SPACE.xs);
    const seletor = UI.cutLeft(linha, linha.w - 150);
    UI.cutLeft(linha, SPACE.sm);
    const botao = linha;

    const itens = memoria.length
      ? memoria.map(f => f.name + '  (' + F.size(f.size) + (f.enc ? ', cripto ' + f.enc : '') + ')')
      : ['— memória vazia —'];
    st.anexo = W.dropdown(id + ':anexo', seletor, itens, Math.max(0, st.anexo));

    const podeEnviar = memoria.length > 0;
    if (W.button(id + ':enviar', botao, 'ENVIAR', { primary: true, disabled: !podeEnviar })) {
      const f = memoria[st.anexo];
      const erro = Game.missions.deliver(contrato.id, f.id);
      if (erro) Bus.emit(EV.UI_TOAST, { text: erro, kind: 'bad' });
    }
  }
}
