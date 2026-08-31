/* =========================================================
   screens/records.js — as bases de registro.

   Uma tela para quatro sistemas: acadêmico, criminal, previdência e
   médico. O que muda é o corpo da ficha e o que se pode fazer nela —
   a busca, a lista e o gesto de abrir são iguais, porque do lado de
   dentro esses sistemas são todos o mesmo cadastro com outro nome.

   A ficha é apresentada como FORMULÁRIO, não como texto corrido: é
   assim que ela aparece no Uplink original, e é o formato que deixa
   óbvio o que dá para alterar. Os campos alterados ficam marcados,
   porque uma auditoria enxerga exatamente isso.
   ========================================================= */
import { Game } from '../../core/game.js';
import { Bus, EV } from '../../core/bus.js';
import * as F from '../../core/fmt.js';
import * as People from '../../core/people.js';
import * as D from '../../core/data.js';
import { UI, HOVER, CLICK } from '../toolkit.js';
import { W, Icon } from '../widgets.js';
import { Text } from '../text.js';
import { Dirty } from '../anim.js';
import { C, FONT, SPACE, METRIC, alpha } from '../theme.js';

/* Sigla, não o nome inteiro: o nome completo do sistema já está no
   cabeçalho da janela, e repetido ao lado do campo de busca ele
   invadia o campo. */
const TITULO = {
  academic: 'IAD  ·  ACADÊMICO',
  criminal: 'GCD  ·  CRIMINAL',
  social_sec: 'ISSD  ·  PREVIDÊNCIA',
  medical: 'CMD  ·  MÉDICO'
};

export function desenha(r, sv, st, id) {
  const bloqueio = Game.net.readBlock(sv);
  if (bloqueio) return barreira(r, bloqueio, 'firewall');

  const ctx = UI.ctx;
  const S = Game.state;
  const podeEscrever = Game.net.canWrite(sv);

  /* ---- busca ---- */
  const buscaR = UI.stackTop(r, METRIC.fieldH, SPACE.sm);
  const campo = UI.cutLeft(buscaR, buscaR.w - 210);
  UI.cutLeft(buscaR, SPACE.md);
  W.bind(id + ':rbusca', campo, st, 'busca',
    { placeholder: 'buscar pessoa pelo nome ou registro' });
  Text.drawIn(ctx, TITULO[sv.type] || sv.name, buscaR.x + buscaR.w, buscaR.y, buscaR.h,
    FONT.labelSmall, C.cyan, 'right');

  const q = String(st.busca || '').trim();
  const achados = q.length >= 2
    ? S.world.people.filter(p =>
        F.norm(p.name).includes(F.norm(q)) || p.ssn.startsWith(q)).slice(0, 80)
    : [];

  const listaR = UI.cutLeft(r, Math.max(280, Math.round(r.w * 0.30)));
  UI.cutLeft(r, SPACE.md);
  const fichaR = r;

  /* ---- lista ---- */
  UI.fill(listaR.x, listaR.y, listaR.w, listaR.h, alpha(C.wellBottom, 0.6));
  UI.frameR(listaR, C.line1, 1);
  W.sectionBar(UI.rect(listaR.x, listaR.y, listaR.w, METRIC.headerH),
    achados.length ? 'RESULTADOS  ·  ' + achados.length : 'BUSCA');

  const corpoLista = UI.rect(listaR.x + 1, listaR.y + METRIC.headerH,
    listaR.w - 2, listaR.h - METRIC.headerH - 1);
  W.list(id + ':rpessoas', corpoLista, achados.length, (i, rr, hov, sel) => {
    const p = achados[i];
    Text.drawFit(ctx, p.name, rr.x + SPACE.md, rr.y + 19, rr.w - SPACE.h2, FONT.label,
      sel ? C.textStrong : C.text);
    Text.draw(ctx, p.ssn + '  ·  ' + p.born, rr.x + SPACE.md, rr.y + 35,
      FONT.dataSmall, C.textFaint);
    /* marca quem já foi mexido: o jogador precisa se lembrar */
    if (p.academic.wiped || p.academic.extra.length || p._tocado) {
      W.tag(UI.rect(rr.x + rr.w - 62, rr.y + 8, 54, 15), 'ALTERADO', C.warn);
    }
  }, {
    rowH: 46, state: st,
    empty: q.length >= 2 ? 'nada encontrado' : 'digite ao menos duas letras',
    onSelect: (i) => { st.pessoa = achados[i] ? achados[i].id : null; Dirty.mark(); }
  });

  /* ---- ficha ---- */
  UI.fillVGrad(fichaR.x, fichaR.y, fichaR.w, fichaR.h, C.panelTop, C.panelBottom);
  UI.frameR(fichaR, C.line2, 1);

  const p = st.pessoa ? S.world.people.find(x => x.id === st.pessoa) : null;
  if (!p) {
    Text.center(ctx, 'selecione um registro', fichaR.x, fichaR.y, fichaR.w, fichaR.h,
      FONT.body, C.textFaint);
    return;
  }

  const btsR = UI.cutBottom(UI.copy(fichaR), METRIC.btnH + SPACE.md);
  let c = UI.pad(UI.rect(fichaR.x, fichaR.y, fichaR.w, fichaR.h - METRIC.btnH - SPACE.md),
    SPACE.md, SPACE.lg);

  /* cabeçalho: retrato e identificação */
  const cab = UI.stackTop(c, 96, SPACE.md);
  retrato(ctx, UI.rect(cab.x, cab.y, 76, 92), p);
  const infoX = cab.x + 90;
  Text.draw(ctx, p.name, infoX, cab.y + 22, FONT.sectionTitle, C.textStrong);
  Text.draw(ctx, 'REGISTRO ' + p.ssn, infoX, cab.y + 44, FONT.data, C.cyan);
  Text.draw(ctx, 'nascido em ' + p.born + '  ·  ' + p.city, infoX, cab.y + 62,
    FONT.dataSmall, C.textDim);
  Text.draw(ctx, p.social.title + (p.social.employer ? '  ·  ' + p.social.employer : ''),
    infoX, cab.y + 80, FONT.dataSmall, C.textFaint);

  W.separator(UI.stackTop(c, 10, SPACE.sm), C.line2);

  /* corpo por tipo de base */
  if (sv.type === 'criminal') fichaCriminal(c, p, st, id, podeEscrever);
  else if (sv.type === 'social_sec') fichaPrevidencia(c, p);
  else if (sv.type === 'medical') fichaMedica(c, p);
  else fichaAcademica(c, p, st, id, podeEscrever);

  /* ---- ações ---- */
  acoes(btsR, sv, p, st, id, podeEscrever);
}

/* =========================================================
   RETRATO
   Gerado do registro: mesma pessoa, mesmo rosto, sempre.
   ========================================================= */
function retrato(ctx, r, p) {
  const seed = Number(p.ssn) || 1;
  const rnd = (n) => {
    const x = Math.sin((seed + n * 37) * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  const pele = ['#8d6e5a', '#b28b6e', '#6a4c3a', '#c9a189', '#7d5a45'][Math.floor(rnd(1) * 5)];
  const cabelo = ['#2b211b', '#4a3527', '#6b5140', '#1a1512', '#8a7460'][Math.floor(rnd(2) * 5)];
  const fundo = ['#28405c', '#2b4a4a', '#3a3450', '#40382c'][Math.floor(rnd(3) * 4)];

  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();

  const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  g.addColorStop(0, fundo);
  g.addColorStop(1, alpha('#000000', 0.6));
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);

  const cx = r.x + r.w / 2;
  const ombroY = r.y + r.h * 0.80;

  /* ombros */
  ctx.fillStyle = ['#22303f', '#3a2f28', '#2a3a2c', '#332a3a'][Math.floor(rnd(4) * 4)];
  ctx.beginPath();
  ctx.ellipse(cx, ombroY + r.h * 0.28, r.w * 0.52, r.h * 0.30, 0, Math.PI, 0);
  ctx.fill();

  /* pescoço */
  ctx.fillStyle = pele;
  ctx.fillRect(cx - r.w * 0.11, r.y + r.h * 0.56, r.w * 0.22, r.h * 0.26);

  /* cabeça */
  ctx.beginPath();
  ctx.ellipse(cx, r.y + r.h * 0.44, r.w * 0.26, r.h * 0.20, 0, 0, Math.PI * 2);
  ctx.fill();

  /* cabelo */
  ctx.fillStyle = cabelo;
  ctx.beginPath();
  const calvo = rnd(5) > 0.82;
  ctx.ellipse(cx, r.y + r.h * (calvo ? 0.33 : 0.35), r.w * 0.27, r.h * (calvo ? 0.08 : 0.14),
    0, Math.PI, 0);
  ctx.fill();

  /* olhos e boca: dois traços e uma linha bastam para dar rosto */
  ctx.fillStyle = alpha('#000000', 0.65);
  const olhoY = r.y + r.h * 0.43;
  ctx.fillRect(cx - r.w * 0.13, olhoY, r.w * 0.07, Math.max(1, r.h * 0.018));
  ctx.fillRect(cx + r.w * 0.06, olhoY, r.w * 0.07, Math.max(1, r.h * 0.018));
  ctx.fillRect(cx - r.w * 0.05, r.y + r.h * 0.52, r.w * 0.10, Math.max(1, r.h * 0.014));

  /* linhas de digitalização: é uma foto de cadastro, não um retrato */
  ctx.fillStyle = alpha('#000000', 0.18);
  for (let y = r.y; y < r.y + r.h; y += 3) ctx.fillRect(r.x, y, r.w, 1);

  ctx.restore();
  UI.frameR(r, C.line3, 1);
}

/* =========================================================
   CORPOS DE FICHA
   ========================================================= */
function linhaCampo(c, rot, val, cor, alterado) {
  const l = UI.stackTop(c, 26, 2);
  UI.fill(l.x, l.y, l.w, l.h, alpha(C.wellTop, 0.5));
  UI.frameR(l, alterado ? alpha(C.warn, 0.6) : C.line1, 1);
  Text.drawIn(UI.ctx, rot, l.x + SPACE.sm, l.y, l.h, FONT.labelSmall, C.textFaint, 'left');
  Text.drawFitIn(UI.ctx, String(val), l.x + l.w - SPACE.sm, l.y, l.w - 160, l.h,
    FONT.data, cor || C.text, 'right');
  if (alterado) {
    W.tag(UI.rect(l.x + 130, l.y + 5, 62, 16), 'INSERIDO', C.warn);
  }
  return l;
}

function fichaAcademica(c, p, st, id, podeEscrever) {
  W.sectionBar(UI.stackTop(c, METRIC.headerH, SPACE.xs), 'QUALIFICAÇÕES');

  if (p.academic.wiped) {
    const l = UI.stackTop(c, 44, SPACE.sm);
    UI.fill(l.x, l.y, l.w, l.h, alpha(C.danger, 0.10));
    UI.frameR(l, alpha(C.danger, 0.5), 1);
    Text.center(UI.ctx, 'NENHUMA QUALIFICAÇÃO REGISTRADA', l.x, l.y, l.w, l.h,
      FONT.label, C.dangerBright);
  } else {
    linhaCampo(c, 'CURSO', p.academic.degree);
    linhaCampo(c, 'INSTITUIÇÃO', p.academic.uni);
    linhaCampo(c, 'CONCLUSÃO', p.academic.year);
    linhaCampo(c, 'RESULTADO', p.academic.grade, C.cyanBright);
  }

  if (p.academic.extra.length) {
    UI.stackTop(c, SPACE.xs, 0);
    W.sectionBar(UI.stackTop(c, METRIC.headerH, SPACE.xs), 'REGISTROS ADICIONAIS');
    p.academic.extra.forEach(e => {
      linhaCampo(c, e.uni.toUpperCase(), e.degree + '  ·  ' + e.year, C.warnBright, true);
    });
  }
}

function fichaCriminal(c, p, st, id, podeEscrever) {
  W.sectionBar(UI.stackTop(c, METRIC.headerH, SPACE.xs),
    'CONDENAÇÕES  ·  ' + p.criminal.length);

  if (!p.criminal.length) {
    const l = UI.stackTop(c, 44, SPACE.sm);
    UI.fill(l.x, l.y, l.w, l.h, alpha(C.ok, 0.10));
    UI.frameR(l, alpha(C.ok, 0.5), 1);
    Text.center(UI.ctx, 'FICHA LIMPA', l.x, l.y, l.w, l.h, FONT.label, C.okBright);
  }
  p.criminal.forEach(cr => {
    const l = UI.stackTop(c, 30, 2);
    UI.fill(l.x, l.y, l.w, l.h, alpha(cr.planted ? C.warn : C.danger, 0.10));
    UI.frameR(l, alpha(cr.planted ? C.warn : C.danger, 0.45), 1);
    Text.draw(UI.ctx, String(cr.year), l.x + SPACE.sm, l.y + 20, FONT.dataStrong, C.textDim);
    Text.drawFit(UI.ctx, cr.crime, l.x + 60, l.y + 20, l.w - 220, FONT.body,
      cr.planted ? C.warnBright : C.dangerBright);
    Text.draw(UI.ctx, cr.sentence, l.x + l.w - SPACE.sm, l.y + 20, FONT.data, C.text, 'right');
    if (cr.planted) W.tag(UI.rect(l.x + l.w - 150, l.y + 7, 62, 16), 'INSERIDO', C.warn);
  });
}

function fichaPrevidencia(c, p) {
  W.sectionBar(UI.stackTop(c, METRIC.headerH, SPACE.xs), 'VÍNCULO EMPREGATÍCIO');
  linhaCampo(c, 'EMPREGADOR', p.social.employer || 'Desempregado',
    p.social.employer ? C.text : C.warnBright);
  linhaCampo(c, 'CARGO', p.social.title);
  linhaCampo(c, 'DESDE', p.social.since);
  linhaCampo(c, 'SALÁRIO ANUAL', F.credits(p.social.salary), C.okBright);
  linhaCampo(c, 'SITUAÇÃO', p.social.status);
  UI.stackTop(c, SPACE.xs, 0);
  W.sectionBar(UI.stackTop(c, METRIC.headerH, SPACE.xs), 'CRÉDITO');
  linhaCampo(c, 'PONTUAÇÃO', p.financial.creditScore + ' pontos',
    p.financial.creditScore > 700 ? C.okBright : C.warnBright);
}

function fichaMedica(c, p) {
  W.sectionBar(UI.stackTop(c, METRIC.headerH, SPACE.xs), 'PRONTUÁRIO');
  const seed = Number(p.ssn) || 1;
  const tipos = ['O+', 'A+', 'B+', 'AB+', 'O−', 'A−'];
  linhaCampo(c, 'TIPO SANGUÍNEO', tipos[seed % tipos.length]);
  linhaCampo(c, 'ALERGIAS', (seed % 3 === 0) ? 'Penicilina' : 'Nenhuma registrada');
  linhaCampo(c, 'ÚLTIMA CONSULTA', (2010 + (seed % 5)));
  linhaCampo(c, 'PLANO', (seed % 2) ? 'Cobertura integral' : 'Cobertura básica');
  const l = UI.stackTop(c, 40, SPACE.sm);
  Text.drawFitIn(UI.ctx, 'Prontuário protegido por tratado. O acesso já foi registrado.',
    l.x, l.y, l.w, l.h, FONT.dataSmall, alpha(C.warnBright, 0.85), 'left');
}

/* =========================================================
   AÇÕES
   ========================================================= */
function acoes(r, sv, p, st, id, podeEscrever) {
  const ctx = UI.ctx;
  let bts = UI.pad(r, SPACE.sm, 0);

  if (!podeEscrever) {
    Text.drawIn(ctx, 'Somente leitura — vença o proxy para alterar este registro.',
      bts.x, bts.y, bts.h, FONT.bodySmall, alpha(C.warnBright, 0.9), 'left');
    return;
  }

  if (sv.type === 'academic') {
    const b1 = UI.cutLeft(bts, 210); UI.cutLeft(bts, SPACE.sm);
    const b2 = UI.cutLeft(bts, 190); UI.cutLeft(bts, SPACE.sm);
    const b3 = UI.cutLeft(bts, 200);

    /* o curso a inserir vem do contrato aberto, quando houver */
    const contrato = Game.state.missions.active.find(m =>
      m.goal.kind === 'academic_has' && m.goal.personId === p.id);
    const curso = contrato ? contrato.goal.degree : D.DEGREES[0];

    if (W.button(id + ':racad', b1, 'INSERIR QUALIFICAÇÃO', { primary: true })) {
      const res = People.addDegree(p.id, curso, D.UNIS[(Number(p.ssn) || 0) % D.UNIS.length]);
      Game.net.illegal(sv, 3);
      Bus.emit(EV.UI_TOAST, {
        text: (res && res.erro) ? res.erro : 'Inserido: ' + curso,
        kind: (res && res.erro) ? 'bad' : 'ok'
      });
      Dirty.mark();
    }
    if (W.button(id + ':rwipe', b2, 'APAGAR HISTÓRICO', { danger: true })) {
      const res = People.wipeAcademic(p.id);
      Game.net.illegal(sv, 3);
      Bus.emit(EV.UI_TOAST, {
        text: (res && res.erro) ? res.erro : 'Histórico acadêmico apagado.',
        kind: (res && res.erro) ? 'bad' : 'warn'
      });
      Dirty.mark();
    }
    Text.drawIn(ctx, contrato ? 'contrato pede: ' + curso : 'nenhum contrato ativo para este registro',
      b3.x, b3.y, b3.h, FONT.dataSmall,
      contrato ? C.warnBright : alpha(C.textFaint, 0.8), 'left');

  } else if (sv.type === 'criminal') {
    const b1 = UI.cutLeft(bts, 210); UI.cutLeft(bts, SPACE.sm);
    const b2 = UI.cutLeft(bts, 190); UI.cutLeft(bts, SPACE.sm);
    const b3 = UI.cutLeft(bts, 200);

    const contrato = Game.state.missions.active.find(m =>
      (m.goal.kind === 'criminal_has' || m.goal.kind === 'criminal_clean') &&
      m.goal.personId === p.id);
    const crime = (contrato && contrato.goal.crime) || D.CRIMES[0];

    if (W.button(id + ':rplant', b1, 'INSERIR CONDENAÇÃO', { primary: true })) {
      const res = People.plantConviction(p.id, crime);
      Game.net.illegal(sv, 4);
      Bus.emit(EV.UI_TOAST, {
        text: (res && res.erro) ? res.erro : 'Condenação inserida: ' + crime,
        kind: (res && res.erro) ? 'bad' : 'ok'
      });
      Dirty.mark();
    }
    if (W.button(id + ':rclear', b2, 'LIMPAR FICHA', { danger: true })) {
      const res = People.clearCriminal(p.id);
      Game.net.illegal(sv, 4);
      Bus.emit(EV.UI_TOAST, {
        text: (res && res.erro) ? res.erro : 'Ficha criminal limpa.',
        kind: (res && res.erro) ? 'bad' : 'warn'
      });
      Dirty.mark();
    }
    Text.drawIn(ctx, contrato
      ? (contrato.goal.kind === 'criminal_clean' ? 'contrato pede: limpar a ficha'
        : 'contrato pede: ' + crime)
      : 'nenhum contrato ativo para este registro',
      b3.x, b3.y, b3.h, FONT.dataSmall,
      contrato ? C.warnBright : alpha(C.textFaint, 0.8), 'left');

  } else {
    Text.drawIn(ctx, 'Este sistema não aceita alteração remota de registro.',
      bts.x, bts.y, bts.h, FONT.bodySmall, alpha(C.textFaint, 0.9), 'left');
  }
}

function barreira(r, texto) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  Icon.lock(UI.ctx, cx, cy - 40, 44, alpha(C.danger, 0.8));
  Text.center(UI.ctx, texto, r.x, cy, r.w, 30, FONT.sectionTitle, C.dangerBright);
  Text.center(UI.ctx, 'vá em FERRAMENTAS e execute o Firewall_Bypass',
    r.x, cy + 34, r.w, 24, FONT.bodySmall, C.textFaint);
}
