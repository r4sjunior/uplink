/* =========================================================
   gateway.js — o equipamento e o arsenal.

   Três abas: o gateway (o que está instalado e o que a loja
   oferece), o software e a memória. É aqui que o jogador descobre
   por que a barra do Password_Breaker demora: o número da CPU e a
   velocidade da barra são a mesma coisa.
   ========================================================= */
import { Game } from '../../core/game.js';
import { Bus, EV } from '../../core/bus.js';
import * as F from '../../core/fmt.js';
import { UI } from '../toolkit.js';
import { W, Icon } from '../widgets.js';
import { Text } from '../text.js';
import { Dirty } from '../anim.js';
import { C, FONT, SPACE, METRIC, alpha } from '../theme.js';

export const id = 'gateway';
export const title = 'GATEWAY';
export const label = 'GATEWAY';
export const icon = 'chip';
export const w = 1060, h = 660;
export const minW = 760, minH = 460;

function aviso(erro, sucesso) {
  Bus.emit(EV.UI_TOAST, { text: erro || sucesso, kind: erro ? 'bad' : 'ok' });
}

export function draw(r) {
  const st = UI.state(id, () => ({ aba: 0, sel: 0, sub: 0, scroll: 0 }));
  const abaR = UI.stackTop(r, METRIC.tabH, SPACE.sm);
  const nova = W.tabs(id + ':abas', abaR, ['EQUIPAMENTO', 'SOFTWARE', 'MEMÓRIA'], st.aba);
  if (nova !== st.aba) { st.aba = nova; st.sel = 0; st.scroll = 0; Dirty.mark(); }

  if (st.aba === 0) equipamento(r, st);
  else if (st.aba === 1) software(r, st);
  else memoria(r, st);
}

/* =========================================================
   ABA 1 — EQUIPAMENTO
   ========================================================= */
function equipamento(r, st) {
  const v = Game.hardware.view();
  const cat = Game.hardware.catalog();

  const escR = UI.cutLeft(r, Math.round(r.w * 0.40));
  UI.cutLeft(r, SPACE.sm);
  const lojaR = r;

  /* ---- o que está instalado ---- */
  UI.fillVGrad(escR.x, escR.y, escR.w, escR.h, C.panelTop, C.panelBottom);
  UI.frameR(escR, C.line2, 1);
  let c = UI.pad(UI.copy(escR), SPACE.sm, SPACE.md);

  const tit = UI.stackTop(c, 30, 2);
  Text.drawIn(UI.ctx, v.gateway.name, tit.x, tit.y, tit.h, FONT.sectionTitle, C.cyanBright, 'left');

  Text.wrap(UI.ctx, v.gateway.desc, FONT.bodySmall, c.w).forEach(q => {
    const l = UI.stackTop(c, 18, 0);
    Text.drawIn(UI.ctx, q, l.x, l.y, l.h, FONT.bodySmall, C.textDim, 'left');
  });
  UI.stackTop(c, SPACE.sm, 0);

  /* leitura em números */
  const ficha = UI.stackTop(c, 92, SPACE.md);
  UI.fill(ficha.x, ficha.y, ficha.w, ficha.h, alpha(C.wellTop, 0.7));
  UI.frameR(ficha, C.line1, 1);
  let fr = UI.pad(ficha, SPACE.xs, SPACE.sm);
  W.stat(UI.stackTop(fr, 18, 2), 'PROCESSAMENTO', v.cpu.power + ' u/s', { valueColor: C.okBright });
  W.stat(UI.stackTop(fr, 18, 2), 'MEMÓRIA', v.memory.free + ' / ' + v.memory.total + ' Gq',
    { valueColor: v.memory.free < 4 ? C.dangerBright : C.text });
  W.stat(UI.stackTop(fr, 18, 2), 'MODEM', v.modem.speed + ' Gq/s', { valueColor: C.text });
  W.stat(UI.stackTop(fr, 18, 0), 'SLOTS',
    'CPU ' + v.slots.cpu.used + '/' + v.slots.cpu.max + '   MEM ' + v.slots.mem.used + '/' + v.slots.mem.max,
    { valueColor: C.textDim });

  /* peças instaladas */
  W.sectionBar(UI.stackTop(c, METRIC.headerH, SPACE.xs), 'PROCESSADORES');
  v.cpu.items.forEach((cpu, i) => {
    const l = UI.stackTop(c, 24, 2);
    Icon.chip(UI.ctx, l.x + 8, l.y + 12, 12, C.cyan);
    Text.drawIn(UI.ctx, cpu.name, l.x + 22, l.y, l.h, FONT.bodySmall, C.text, 'left');
    Text.drawIn(UI.ctx, cpu.speed + ' GHz', l.x + l.w - 84, l.y, l.h, FONT.dataSmall, C.textDim, 'left');
    const b = UI.rect(l.x + l.w - 20, l.y + 3, 18, 18);
    if (W.iconButton(id + ':rmcpu' + i, b, 'minus', { danger: true })) {
      aviso(Game.hardware.sellCPU(cpu.id), 'Processador vendido.');
    }
  });

  UI.stackTop(c, SPACE.xs, 0);
  W.sectionBar(UI.stackTop(c, METRIC.headerH, SPACE.xs), 'MEMÓRIA');
  v.memory.items.forEach((m, i) => {
    const l = UI.stackTop(c, 24, 2);
    Icon.disk(UI.ctx, l.x + 8, l.y + 12, 12, C.cyan);
    Text.drawIn(UI.ctx, m.name, l.x + 22, l.y, l.h, FONT.bodySmall, C.text, 'left');
    const b = UI.rect(l.x + l.w - 20, l.y + 3, 18, 18);
    if (W.iconButton(id + ':rmmem' + i, b, 'minus', { danger: true })) {
      aviso(Game.hardware.sellMemory(m.id), 'Módulo vendido.');
    }
  });

  /* ---- a loja ---- */
  UI.fillVGrad(lojaR.x, lojaR.y, lojaR.w, lojaR.h, C.wellTop, C.wellBottom);
  UI.frameR(lojaR, C.line2, 1);
  let L = UI.pad(UI.copy(lojaR), SPACE.sm, SPACE.sm);

  const subR = UI.stackTop(L, METRIC.tabH, SPACE.sm);
  const sub = W.tabs(id + ':sub', subR, ['CHASSI', 'CPU', 'MEMÓRIA', 'MODEM'], st.sub, { fixed: true });
  if (sub !== st.sub) { st.sub = sub; st.sel = 0; Dirty.mark(); }

  const grupos = [cat.gateways, cat.cpus, cat.mems, cat.modems];
  const itens = grupos[st.sub];
  const compradores = [
    Game.hardware.buyGateway, Game.hardware.buyCPU,
    Game.hardware.buyMemory, Game.hardware.buyModem
  ];

  W.list(id + ':loja', L, itens.length, (i, rr) => {
    const it = itens[i];
    const possui = !!it.owned;
    const podeComprar = it.affordable && (it.canFit !== false) && !possui;

    Text.drawFit(UI.ctx, it.name, rr.x + SPACE.sm, rr.y + 20, rr.w - 210, FONT.label,
      possui ? C.ok : (podeComprar ? C.text : C.textFaint));

    const detalhe = it.cpuSlots !== undefined
      ? it.cpuSlots + ' slots de CPU  ·  ' + it.memSlots + ' de memória'
      : it.speed !== undefined ? (it.speed + (st.sub === 1 ? ' GHz' : ' Gq/s'))
      : it.size + ' Gq';
    Text.draw(UI.ctx, detalhe, rr.x + SPACE.sm, rr.y + 37, FONT.dataSmall, C.textFaint);

    if (it.desc) {
      Text.drawFit(UI.ctx, it.desc, rr.x + 250, rr.y + 37, rr.w - 360, FONT.dataSmall, C.textFaint);
    }

    Text.draw(UI.ctx, possui ? 'INSTALADO' : F.credits(it.price),
      rr.x + rr.w - 100, rr.y + 20, FONT.dataStrong,
      possui ? C.ok : (it.affordable ? C.okBright : C.dangerDim), 'right');

    if (it.tooBig) {
      Text.draw(UI.ctx, 'não cabe neste chassi', rr.x + rr.w - 100, rr.y + 37,
        FONT.dataSmall, C.warnDim, 'right');
    }

    if (!possui) {
      const b = UI.rect(rr.x + rr.w - 88, rr.y + 13, 80, 26);
      if (W.button(id + ':buy' + st.sub + i, b, 'COMPRAR',
        { primary: podeComprar, disabled: !podeComprar })) {
        aviso(compradores[st.sub](it.id), 'Instalado.');
      }
    }
  }, { rowH: 54, state: st, empty: 'nada disponível' });
}

/* =========================================================
   ABA 2 — SOFTWARE
   ========================================================= */
const KIND = {
  breaker: 'Quebra', bypass: 'Contorno', disable: 'Desativação',
  util: 'Utilitário', lan: 'Rede interna', passive: 'Passivo', weapon: 'Arma'
};

function software(r, st) {
  const cat = Game.software.catalog();

  UI.fillVGrad(r.x, r.y, r.w, r.h, C.wellTop, C.wellBottom);
  UI.frameR(r, C.line2, 1);

  W.list(id + ':sw', UI.pad(r, 1, 1), cat.length, (i, rr) => {
    const s = cat[i];
    const tem = s.have > 0;

    Text.drawFit(UI.ctx, s.name, rr.x + SPACE.sm, rr.y + 19, 210, FONT.label,
      tem ? C.textStrong : C.textDim);
    if (tem) W.tag(UI.rect(rr.x + 226, rr.y + 8, 38, 15), 'v' + s.have, C.ok);
    Text.draw(UI.ctx, KIND[s.kind] || s.kind, rr.x + 276, rr.y + 19, FONT.dataSmall, C.textFaint);
    Text.draw(UI.ctx, s.size + ' Gq', rr.x + 380, rr.y + 19, FONT.dataSmall, C.textFaint);

    Text.drawFit(UI.ctx, s.desc, rr.x + SPACE.sm, rr.y + 37, rr.w - 230, FONT.dataSmall, C.textFaint);

    if (s.nextVersion) {
      const podeComprar = Game.state.credits >= s.price;
      Text.draw(UI.ctx, F.credits(s.price), rr.x + rr.w - 104, rr.y + 19, FONT.dataStrong,
        podeComprar ? C.okBright : C.dangerDim, 'right');
      Text.draw(UI.ctx, tem ? ('para a v' + s.nextVersion) : 'primeira versão',
        rr.x + rr.w - 104, rr.y + 36, FONT.dataSmall, C.textFaint, 'right');
      const b = UI.rect(rr.x + rr.w - 92, rr.y + 13, 84, 26);
      if (W.button(id + ':sw' + i, b, tem ? 'ATUALIZAR' : 'COMPRAR',
        { primary: podeComprar, disabled: !podeComprar })) {
        aviso(Game.software.buy(s.id), 'Instalado.');
      }
    } else {
      Text.draw(UI.ctx, 'VERSÃO MÁXIMA', rr.x + rr.w - SPACE.sm, rr.y + 26,
        FONT.dataSmall, C.ok, 'right');
    }
  }, { rowH: 54, state: st, empty: 'catálogo vazio' });
}

/* =========================================================
   ABA 3 — MEMÓRIA
   ========================================================= */
function memoria(r, st) {
  const S = Game.state;
  const v = Game.hardware.view();

  /* barra de ocupação */
  const barraR = UI.stackTop(r, 48, SPACE.sm);
  UI.fill(barraR.x, barraR.y, barraR.w, barraR.h, alpha(C.wellTop, 0.7));
  UI.frameR(barraR, C.line1, 1);
  const usado = v.memory.used, total = v.memory.total;
  Text.draw(UI.ctx, 'OCUPAÇÃO', barraR.x + SPACE.sm, barraR.y + 18, FONT.labelSmall, C.textFaint);
  Text.draw(UI.ctx, usado + ' / ' + total + ' Gq  ·  ' + v.memory.free + ' Gq livres',
    barraR.x + barraR.w - SPACE.sm, barraR.y + 18, FONT.dataStrong,
    v.memory.free < 4 ? C.dangerBright : C.okBright, 'right');
  W.meter(UI.rect(barraR.x + SPACE.sm, barraR.y + 27, barraR.w - SPACE.md, 10),
    (usado / Math.max(1, total)) * 100,
    usado / total > 0.85 ? C.dangerBright : C.cyanBright);

  const btsR = UI.cutBottom(r, METRIC.btnH + SPACE.sm);
  UI.fillVGrad(r.x, r.y, r.w, r.h, C.wellTop, C.wellBottom);
  UI.frameR(r, C.line2, 1);

  const arquivos = S.memory;
  W.list(id + ':mem', UI.pad(r, 1, 1), arquivos.length, (i, rr) => {
    const f = arquivos[i];
    const origem = S.world.servers[f.src];
    Icon.disk(UI.ctx, rr.x + SPACE.md, rr.y + rr.h / 2, 13, f.enc ? C.warnBright : C.cyan);
    Text.drawFit(UI.ctx, f.name, rr.x + 34, rr.y + 19, rr.w - 310, FONT.label, C.text);
    Text.drawFit(UI.ctx, 'de ' + (origem ? origem.name : f.src), rr.x + 34, rr.y + 36,
      rr.w - 310, FONT.dataSmall, C.textFaint);
    Text.draw(UI.ctx, F.size(f.size), rr.x + rr.w - 200, rr.y + 26, FONT.data, C.textDim, 'right');
    W.tag(UI.rect(rr.x + rr.w - 186, rr.y + 16, 92, 18),
      f.enc ? 'CRIPTO ' + f.enc : 'LEGÍVEL', f.enc ? C.warn : C.ok);
  }, { rowH: 52, state: st, empty: 'memória vazia — copie arquivos de um servidor invadido' });

  const sel = arquivos[st.sel];
  const b1 = UI.cutLeft(btsR, 190); UI.cutLeft(btsR, SPACE.sm);
  const b2 = UI.cutLeft(btsR, 150); UI.cutLeft(btsR, SPACE.sm);
  const b3 = UI.cutLeft(btsR, 150);
  if (W.button(id + ':dec', b1, 'DESCRIPTOGRAFAR', { primary: true, disabled: !sel || !sel.enc })) {
    aviso(Game.software.decrypt(sel.id), 'Decrypter iniciado.');
  }
  if (W.button(id + ':del', b2, 'APAGAR', { danger: true, disabled: !sel })) {
    S.memory.splice(st.sel, 1);
    Bus.emit(EV.MEM_CHANGED, {});
    Dirty.mark();
  }
  if (W.button(id + ':defrag', b3, 'DEFRAG')) {
    aviso(Game.software.defrag(), 'Defrag iniciado.');
  }
}
