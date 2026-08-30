/* =========================================================
   news.js — o noticiário.

   Metade ambiente, metade consequência. Quando uma manchete cita um
   alvo que você invadiu, ela é um aviso: alguém descobriu, o calor
   subiu e aquele servidor acabou de ficar mais difícil. O painel
   lateral mostra o calor global — o número que empurra a segurança
   do mundo inteiro para cima conforme você fica conhecido.
   ========================================================= */
import { Game } from '../../core/game.js';
import * as F from '../../core/fmt.js';
import { UI } from '../toolkit.js';
import { W, Icon } from '../widgets.js';
import { Text } from '../text.js';
import { Dirty } from '../anim.js';
import { C, FONT, SPACE, METRIC, alpha } from '../theme.js';

export const id = 'news';
export const title = 'NOTICIÁRIO';
export const label = 'NOTÍCIAS';
export const icon = 'people';
export const w = 940, h = 580;
export const minW = 640, minH = 380;

export const badge = () => Game.news.unreadCount();

export function draw(r) {
  const st = UI.state(id, () => ({ sel: 0, scroll: 0, materia: { scroll: 0 } }));
  const feed = Game.news.feed();
  const S = Game.state;

  const listaR = UI.cutLeft(r, Math.max(300, Math.round(r.w * 0.40)));
  UI.cutLeft(r, SPACE.sm);
  const corpoR = r;

  /* ---- feed ---- */
  UI.fillVGrad(listaR.x, listaR.y, listaR.w, listaR.h, C.wellTop, C.wellBottom);
  UI.frameR(listaR, C.line2, 1);
  const cab = UI.cutTop(UI.copy(listaR), METRIC.headerH);
  W.sectionBar(cab, 'ÚLTIMAS  ·  ' + feed.length);

  const corpo = UI.rect(listaR.x + 1, listaR.y + METRIC.headerH,
    listaR.w - 2, listaR.h - METRIC.headerH - 1);

  W.list(id + ':lista', corpo, feed.length, (i, rr, hov, sel) => {
    const n = feed[i];
    if (!n.seen) UI.fill(rr.x + 5, rr.y + rr.h / 2 - 3, 6, 6, C.cyanBright);
    if (n.reactive) UI.fill(rr.x + rr.w - 3, rr.y + 6, 3, rr.h - 12, alpha(C.warnBright, 0.9));

    Text.wrap(UI.ctx, n.head, FONT.label, rr.w - 40).slice(0, 2).forEach((q, k) => {
      Text.draw(UI.ctx, q, rr.x + SPACE.md, rr.y + 18 + k * 17, FONT.label,
        n.seen ? C.text : C.textStrong);
    });
    Text.draw(UI.ctx, n.source + '  ·  ' + F.fmtDateShort(n.t),
      rr.x + SPACE.md, rr.y + 54, FONT.dataSmall, C.textFaint);
  }, {
    rowH: 66, state: st, empty: 'nada no noticiário ainda',
    onSelect: (i) => { if (feed[i]) { Game.news.markSeen(feed[i].id); Dirty.mark(); } st.materia.scroll = 0; }
  });

  /* ---- matéria + calor ---- */
  UI.fillVGrad(corpoR.x, corpoR.y, corpoR.w, corpoR.h, C.panelTop, C.panelBottom);
  UI.frameR(corpoR, C.line2, 1);

  /* medidor de calor no rodapé do painel */
  const calorR = UI.cutBottom(UI.copy(corpoR), 78);
  let c = UI.pad(UI.rect(corpoR.x, corpoR.y, corpoR.w, corpoR.h - 78), SPACE.md, SPACE.lg);

  const n = feed[st.sel];
  if (n) {
    Game.news.markSeen(n.id);
    Text.wrap(UI.ctx, n.head, FONT.sectionTitle, c.w).forEach(q => {
      const l = UI.stackTop(c, 28, 0);
      Text.drawIn(UI.ctx, q, l.x, l.y, l.h, FONT.sectionTitle, C.textStrong, 'left');
    });
    const meta = UI.stackTop(c, 20, SPACE.sm);
    Text.drawIn(UI.ctx, n.source + '  ·  ' + F.fmtDate(n.t), meta.x, meta.y, meta.h,
      FONT.dataSmall, C.cyan, 'left');
    if (n.reactive) W.tag(UI.rect(meta.x + meta.w - 96, meta.y + 2, 96, 16), 'REPERCUSSÃO', C.warn);

    W.separator(UI.stackTop(c, 10, SPACE.sm), C.line2);

    /* a matéria rola: manchete longa mais corpo passava da caixa */
    W.textBlock(id + ':materia:' + n.id, c,
      [{ t: n.body, font: FONT.body, color: C.text }],
      { state: st.materia });
  } else {
    Text.center(UI.ctx, 'selecione uma manchete', c.x, c.y, c.w, 60, FONT.body, C.textFaint);
  }

  /* calor */
  UI.hline(calorR.x, calorR.y, calorR.w, C.line2);
  let cr = UI.pad(calorR, SPACE.sm, SPACE.lg);
  const l1 = UI.stackTop(cr, 18, 2);
  Text.drawIn(UI.ctx, 'ATENÇÃO DAS CORPORAÇÕES', l1.x, l1.y, l1.h, FONT.labelSmall, C.textFaint, 'left');
  const calor = S.heat;
  const cor = calor > 66 ? C.dangerBright : calor > 33 ? C.warnBright : C.ok;
  Text.drawIn(UI.ctx, Math.round(calor) + ' / 100', l1.x + l1.w, l1.y, l1.h,
    FONT.dataStrong, cor, 'right');
  W.meter(UI.stackTop(cr, 12, SPACE.xs), calor, cor);
  const l3 = UI.stackTop(cr, 18, 0);
  const texto = calor > 66
    ? 'você virou assunto: alvos endurecem e as investigações começam mais cedo'
    : calor > 33
      ? 'já perceberam que alguém está trabalhando; alvos recentes reforçaram a segurança'
      : 'ninguém está olhando para você — é o melhor momento para trabalhar';
  Text.drawFitIn(UI.ctx, texto, l3.x, l3.y, l3.w, l3.h, FONT.dataSmall, C.textFaint, 'left');
}
