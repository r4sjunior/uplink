/* =========================================================
   server.js — a máquina do outro lado.

   Abre sozinha quando a conexão sobe e fecha quando ela cai. O que
   aparece dentro depende do que o servidor é e de quais camadas já
   caíram: sem senha vencida não há menu; sem firewall não há lista
   de arquivos; sem proxy não há como apagar nada.

   Toda ação de risco passa por `Net`, que decide se é ilegal e se
   acorda o monitor. Esta tela não conhece as regras — ela só
   pergunta e mostra a resposta.
   ========================================================= */
import { Game } from '../../core/game.js';
import { Bus, EV } from '../../core/bus.js';
import * as F from '../../core/fmt.js';
import * as CCTV from '../../core/cctv.js';
import * as Social from '../../core/social.js';
import * as LAN from '../../core/lan.js';
import * as CamView from '../camview.js';
import * as TelaBanco from '../screens/bank.js';
import * as TelaRegistros from '../screens/records.js';
import * as TelaLAN from '../screens/lan.js';
import { UI, HOVER, CLICK } from '../toolkit.js';
import { W, Icon } from '../widgets.js';
import { Text } from '../text.js';
import { Dirty, clamp } from '../anim.js';
import { C, FONT, SPACE, METRIC, alpha } from '../theme.js';

export const id = 'server';
export const title = 'SERVIDOR REMOTO';
export const label = 'SERVIDOR';
export const icon = 'monitor';
export const w = 1120, h = 700;
export const minW = 780, minH = 500;

function aviso(erro, sucesso) {
  Bus.emit(EV.UI_TOAST, { text: erro || sucesso, kind: erro ? 'bad' : 'ok' });
}

export function draw(r) {
  const S = Game.state;
  const st = UI.state(id, () => ({
    aba: 0, sel: 0, scroll: 0, senha: '', busca: '',
    cam: null, perfil: null, cmd: '', term: [],
    /* banco */
    bconta: '', bsenha: '', bmsg: '', bdest: 0, bvalor: '',
    /* registros */
    pessoa: null,
    /* rede interna */
    lanSel: null
  }));

  if (!S.conn.live) {
    Text.center(UI.ctx, 'sem conexão ativa', r.x, r.y, r.w, r.h, FONT.body, C.textFaint);
    return;
  }
  const sv = S.world.servers[S.conn.target];
  if (!sv) return;

  /* ---------- cabeçalho do servidor ---------- */
  const cab = UI.stackTop(r, 62, SPACE.sm);
  UI.fillVGrad(cab.x, cab.y, cab.w, cab.h, C.headTop, C.headBottom);
  UI.frameR(cab, C.line3, 1);
  Text.drawFit(UI.ctx, sv.name, cab.x + SPACE.md, cab.y + 26, cab.w - 420, FONT.screenTitle, C.textStrong);
  Text.draw(UI.ctx, sv.ip + '  ·  ' + sv.city, cab.x + SPACE.md, cab.y + 47, FONT.data, C.cyanBright);

  /* estado das camadas, sempre visível */
  const camadas = [
    ['SENHA', sv.sec.pass ? 1 : 0, sv.st.logged],
    ['PROXY', sv.sec.proxy, sv.st.proxyDown],
    ['FIREWALL', sv.sec.firewall, sv.st.fwDown],
    ['MONITOR', sv.sec.monitor, sv.st.monFooled]
  ];
  let cx = cab.x + cab.w - SPACE.md;
  camadas.slice().reverse().forEach(([nome, nivel, vencida]) => {
    if (!nivel) return;
    const larg = 86;
    cx -= larg;
    const cr = UI.rect(cx, cab.y + 14, larg - 6, 34);
    UI.fill(cr.x, cr.y, cr.w, cr.h, alpha(vencida ? C.ok : C.danger, 0.18));
    UI.frameR(cr, vencida ? C.ok : C.danger, 1);
    Text.center(UI.ctx, nome, cr.x, cr.y + 2, cr.w, 14, FONT.labelSmall,
      vencida ? C.okBright : C.dangerBright);
    Text.center(UI.ctx, vencida ? 'VENCIDA' : ('NÍVEL ' + nivel), cr.x, cr.y + 17, cr.w, 14,
      FONT.dataSmall, vencida ? C.ok : C.textDim);
  });

  /* ---------- que telas este servidor oferece ---------- */
  const disponiveis = telasDe(sv, st);
  if (st.aba >= disponiveis.length) st.aba = 0;

  const abaR = UI.stackTop(r, METRIC.tabH, SPACE.sm);
  const nova = W.tabs(id + ':abas', abaR, disponiveis.map(t => t.rotulo), st.aba);
  if (nova !== st.aba) { st.aba = nova; st.sel = 0; st.scroll = 0; Dirty.mark(); }

  /* ---------- corpo ---------- */
  UI.fillVGrad(r.x, r.y, r.w, r.h, C.panelTop, C.panelBottom);
  UI.frameR(r, C.line2, 1);
  const corpo = UI.pad(r, SPACE.sm, SPACE.sm);

  const tela = disponiveis[st.aba];
  if (tela) tela.desenha(corpo, sv, st);
}

/* =========================================================
   QUE ABAS APARECEM
   ========================================================= */
function telasDe(sv, st) {
  const out = [];
  const logado = !sv.sec.pass || sv.st.logged;

  if (!logado) {
    out.push({ rotulo: 'AUTENTICAÇÃO', desenha: telaLogin });
    return out;
  }

  if (sv.lan) out.push({ rotulo: 'REDE INTERNA', desenha: telaLAN });

  const chegou = !sv.lan || LAN.reachedSystem(sv);
  if (chegou) {
    if (sv.type === 'cctv') out.push({ rotulo: 'CÂMERAS', desenha: telaCCTV });
    if (sv.type === 'social') out.push({ rotulo: 'MODERAÇÃO', desenha: telaSocial });
    if (sv.type === 'bank') out.push({ rotulo: 'CONTAS', desenha: telaBanco });
    if (sv.type === 'academic' || sv.type === 'criminal' || sv.type === 'social_sec' || sv.type === 'medical') {
      out.push({ rotulo: 'REGISTROS', desenha: telaRegistros });
    }
    out.push({ rotulo: 'ARQUIVOS', desenha: telaArquivos });
  }

  out.push({ rotulo: 'LOGS', desenha: telaLogs });
  if (sv.st.admin) out.push({ rotulo: 'CONSOLE', desenha: telaConsole });
  out.push({ rotulo: 'FERRAMENTAS', desenha: telaFerramentas });
  return out;
}

/* =========================================================
   AUTENTICAÇÃO
   ========================================================= */
function telaLogin(r, sv, st) {
  const cx = r.x + r.w / 2;
  const box = UI.rect(cx - 230, r.y + Math.max(20, (r.h - 260) / 2), 460, 240);

  UI.fillVGrad(box.x, box.y, box.w, box.h, C.wellTop, C.wellBottom);
  UI.frameR(box, C.line3, 1);
  const cab = UI.cutTop(UI.copy(box), METRIC.headerH);
  W.sectionBar(cab, 'AUTORIZAÇÃO DE USUÁRIO NECESSÁRIA');

  let c = UI.pad(UI.rect(box.x, box.y + METRIC.headerH, box.w, box.h - METRIC.headerH),
    SPACE.lg, SPACE.xl);

  const l1 = UI.stackTop(c, 18, 2);
  Text.drawIn(UI.ctx, 'SENHA', l1.x, l1.y, l1.h, FONT.labelSmall, C.textFaint, 'left');
  const f1 = UI.stackTop(c, METRIC.fieldH, SPACE.md);
  W.bind(id + ':senha', f1, st, 'senha', { password: true, maxLen: 24 });

  const bts = UI.stackTop(c, METRIC.btnH, SPACE.md);
  const b1 = UI.cutLeft(bts, 130); UI.cutLeft(bts, SPACE.sm);
  const b2 = UI.cutLeft(bts, 150); UI.cutLeft(bts, SPACE.sm);
  const b3 = bts;

  if (W.button(id + ':entrar', b1, 'ENTRAR', { primary: true })) {
    const erro = Game.net.login(sv, st.senha);
    if (erro) { aviso(erro); st.senha = ''; }
    else { st.senha = ''; st.aba = 0; Dirty.mark(); }
  }
  if (W.button(id + ':quebrar', b2, 'PASSWORD_BREAKER')) {
    aviso(Game.software.breakPassword(false), 'Quebra iniciada.');
  }
  if (W.button(id + ':dic', b3, 'DICIONÁRIO')) {
    aviso(Game.software.breakPassword(true), 'Dicionário rodando.');
  }

  /* progresso da quebra, se estiver rodando */
  const tarefa = Game.state.tasks.find(t => t.sw === 'password_breaker' || t.sw === 'dictionary_hacker');
  const barra = UI.stackTop(c, 22, 0);
  if (tarefa) {
    Text.draw(UI.ctx, tarefa.name, barra.x, barra.y + 10, FONT.dataSmall, C.cyanBright);
    W.progress(UI.rect(barra.x + 150, barra.y + 4, barra.w - 150, 12), tarefa.progress,
      { color: C.cyanBright, label: true });
  } else {
    Text.center(UI.ctx, 'toda tentativa falha é registrada no log deste sistema',
      barra.x, barra.y, barra.w, barra.h, FONT.dataSmall, alpha(C.textFaint, 0.7));
  }
}

/* =========================================================
   ARQUIVOS
   ========================================================= */
function telaArquivos(r, sv, st) {
  const bloqueio = Game.net.readBlock(sv);
  if (bloqueio) return barreira(r, bloqueio, 'firewall');

  const btsR = UI.cutBottom(r, METRIC.btnH + SPACE.sm);
  UI.fill(r.x, r.y, r.w, r.h, alpha(C.wellBottom, 0.6));
  UI.frameR(r, C.line1, 1);

  W.list(id + ':arq', UI.pad(r, 1, 1), sv.files.length, (i, rr) => {
    const f = sv.files[i];
    Icon.disk(UI.ctx, rr.x + SPACE.md, rr.y + rr.h / 2, 13, f.enc ? C.warnBright : C.cyan);
    Text.drawFit(UI.ctx, f.name, rr.x + 34, rr.y + 26, rr.w - 300, FONT.body, C.text);
    Text.draw(UI.ctx, F.size(f.size), rr.x + rr.w - 190, rr.y + 26, FONT.data, C.textDim, 'right');
    if (f.enc) W.tag(UI.rect(rr.x + rr.w - 172, rr.y + 15, 84, 18), 'CRIPTO ' + f.enc, C.warn);
  }, { rowH: 42, state: st, empty: 'nenhum arquivo neste sistema' });

  const sel = sv.files[st.sel];
  const podeEscrever = Game.net.canWrite(sv);
  const b1 = UI.cutLeft(btsR, 150); UI.cutLeft(btsR, SPACE.sm);
  const b2 = UI.cutLeft(btsR, 150); UI.cutLeft(btsR, SPACE.sm);
  const b3 = UI.cutLeft(btsR, 190);

  if (W.button(id + ':copiar', b1, 'COPIAR', { primary: true, disabled: !sel })) {
    aviso(Game.software.copyFile(sel.id), 'Cópia iniciada.');
  }
  if (W.button(id + ':apagar', b2, 'APAGAR', { danger: true, disabled: !sel || !podeEscrever })) {
    aviso(Game.software.deleteFile(sel.id), 'Exclusão iniciada.');
  }
  if (W.button(id + ':apagarTudo', b3, 'APAGAR TUDO',
    { danger: true, disabled: !podeEscrever || !sv.files.length })) {
    Game.net.consoleExec(sv, 'delete all');
    Dirty.mark();
  }
}

/* =========================================================
   LOGS
   ========================================================= */
function telaLogs(r, sv, st) {
  const btsR = UI.cutBottom(r, METRIC.btnH + SPACE.sm);
  const dica = UI.cutBottom(r, 22);

  UI.fill(r.x, r.y, r.w, r.h, alpha(C.wellBottom, 0.6));
  UI.frameR(r, C.line1, 1);

  const logs = Game.net.visibleLogs(sv, 200);
  W.list(id + ':logs', UI.pad(r, 1, 1), logs.length, (i, rr) => {
    const l = logs[i];
    const meu = l.fromIP === Game.state.playerIP;
    if (meu) UI.fill(rr.x + 3, rr.y + 5, 3, rr.h - 10, C.dangerBright);
    Text.draw(UI.ctx, F.fmtDate(l.t), rr.x + SPACE.md, rr.y + 20, FONT.dataSmall,
      l.deleted ? C.textFaint : C.textDim);
    Text.drawFit(UI.ctx, l.text, rr.x + 148, rr.y + 20, rr.w - 260, FONT.data,
      l.deleted ? C.textFaint : (meu ? C.dangerBright : C.text));
    if (l.deleted) W.tag(UI.rect(rr.x + rr.w - 96, rr.y + 8, 88, 16), 'APAGADO', C.textFaint);
    else if (l.modified) W.tag(UI.rect(rr.x + rr.w - 96, rr.y + 8, 88, 16), 'REESCRITO', C.ok);
    else if (meu) W.tag(UI.rect(rr.x + rr.w - 96, rr.y + 8, 88, 16), 'VOCÊ', C.danger);
  }, { rowH: 30, state: st, empty: 'log vazio' });

  Text.drawIn(UI.ctx,
    'as linhas em vermelho apontam para o seu endereço — são elas que a investigação segue',
    dica.x + SPACE.xs, dica.y, dica.h, FONT.dataSmall, alpha(C.warnBright, 0.8), 'left');

  const sel = logs[st.sel];
  const podeEscrever = Game.net.canWrite(sv);
  const b1 = UI.cutLeft(btsR, 170); UI.cutLeft(btsR, SPACE.sm);
  const b2 = UI.cutLeft(btsR, 190); UI.cutLeft(btsR, SPACE.sm);
  const b3 = UI.cutLeft(btsR, 190);

  if (W.button(id + ':logdel', b1, 'APAGAR REGISTRO',
    { primary: true, disabled: !sel || !podeEscrever })) {
    aviso(Game.software.wipeLog(sel.id, false), 'Log_Deleter rodando.');
  }
  if (W.button(id + ':logmod', b2, 'REESCREVER REGISTRO',
    { disabled: !sel || !podeEscrever })) {
    aviso(Game.software.wipeLog(sel.id, true), 'Log_Modifier rodando.');
  }
  if (W.button(id + ':logundel', b3, 'RECUPERAR APAGADOS')) {
    aviso(Game.software.undeleteLogs(), 'Log_UnDeleter rodando.');
  }
}

/* =========================================================
   FERRAMENTAS
   ========================================================= */
function telaFerramentas(r, sv, st) {
  const acoes = [
    { rot: 'Firewall_Bypass', sub: 'contorna o firewall em silêncio', on: () => Game.software.breakLayer('firewall', false), ativo: sv.sec.firewall > 0 && !sv.st.fwDown },
    { rot: 'Firewall_Disable', sub: 'mais rápido, deixa registro', on: () => Game.software.breakLayer('firewall', true), ativo: sv.sec.firewall > 0 && !sv.st.fwDown },
    { rot: 'Proxy_Bypass', sub: 'libera escrita em silêncio', on: () => Game.software.breakLayer('proxy', false), ativo: sv.sec.proxy > 0 && !sv.st.proxyDown },
    { rot: 'Proxy_Disable', sub: 'mais rápido, deixa registro', on: () => Game.software.breakLayer('proxy', true), ativo: sv.sec.proxy > 0 && !sv.st.proxyDown },
    { rot: 'Monitor_Bypass', sub: 'engana o monitor — use ANTES da primeira ação ilegal', on: () => Game.software.breakLayer('monitor', false), ativo: sv.sec.monitor > 0 && !sv.st.monFooled },
    { rot: 'Voice_Analyser', sub: 'vence autenticação por voz', on: () => Game.software.analyseVoice(), ativo: sv.sec.voice > 0 && !sv.st.voiceOk },
    { rot: 'LAN_Scan', sub: 'mapeia a rede interna', on: () => Game.software.lanScan(), ativo: !!sv.lan }
  ];

  const listaR = UI.cutLeft(r, Math.round(r.w * 0.55));
  UI.cutLeft(r, SPACE.sm);
  const tarefasR = r;

  UI.fill(listaR.x, listaR.y, listaR.w, listaR.h, alpha(C.wellBottom, 0.6));
  UI.frameR(listaR, C.line1, 1);
  let c = UI.pad(listaR, SPACE.xs, SPACE.xs);

  acoes.forEach((a, i) => {
    const l = UI.stackTop(c, 44, 4);
    const rodando = Game.state.tasks.some(t => t.name === a.rot);
    UI.fill(l.x, l.y, l.w, l.h, alpha(a.ativo ? C.wellTop : '#060b16', 0.7));
    UI.frameR(l, a.ativo ? C.line2 : C.line1, 1);
    Text.draw(UI.ctx, a.rot, l.x + SPACE.sm, l.y + 19, FONT.label,
      a.ativo ? C.text : C.textFaint);
    Text.drawFit(UI.ctx, a.sub, l.x + SPACE.sm, l.y + 34, l.w - 130, FONT.dataSmall, C.textFaint);
    const b = UI.rect(l.x + l.w - 104, l.y + 9, 96, 26);
    if (W.button(id + ':fer' + i, b, rodando ? 'RODANDO' : 'EXECUTAR',
      { primary: a.ativo && !rodando, disabled: !a.ativo || rodando })) {
      aviso(a.on(), 'Iniciado.');
    }
  });

  /* tarefas em execução */
  UI.fill(tarefasR.x, tarefasR.y, tarefasR.w, tarefasR.h, alpha(C.wellBottom, 0.6));
  UI.frameR(tarefasR, C.line1, 1);
  const cab = UI.cutTop(UI.copy(tarefasR), METRIC.headerH);
  W.sectionBar(cab, 'EM EXECUÇÃO');
  let t = UI.pad(UI.rect(tarefasR.x, tarefasR.y + METRIC.headerH, tarefasR.w,
    tarefasR.h - METRIC.headerH), SPACE.sm, SPACE.sm);

  const tarefas = Game.state.tasks;
  if (!tarefas.length) {
    Text.center(UI.ctx, 'nada rodando', t.x, t.y, t.w, 60, FONT.bodySmall, C.textFaint);
  }
  tarefas.forEach((tk, i) => {
    const l = UI.stackTop(t, 40, SPACE.xs);
    Text.draw(UI.ctx, tk.name, l.x, l.y + 14, FONT.label, C.text);
    Text.draw(UI.ctx, Math.round(tk.progress) + '%', l.x + l.w, l.y + 14,
      FONT.dataStrong, C.cyanBright, 'right');
    W.progress(UI.rect(l.x, l.y + 22, l.w - 30, 10), tk.progress, { color: C.cyanBright });
    const b = UI.rect(l.x + l.w - 22, l.y + 18, 18, 18);
    if (W.iconButton(id + ':abort' + i, b, 'close', { danger: true })) {
      Game.software.abort(tk.id);
    }
  });
}

/* =========================================================
   CONSOLE
   ========================================================= */
function telaConsole(r, sv, st) {
  const entradaR = UI.cutBottom(r, METRIC.fieldH + SPACE.sm);
  W.terminal(id + ':term', r, st.term, { prompt: '> ' });

  const campo = UI.cutLeft(entradaR, entradaR.w - 110);
  UI.cutLeft(entradaR, SPACE.sm);
  W.bind(id + ':cmd', campo, st, 'cmd', { placeholder: 'digite um comando — "help" lista tudo', mono: true });
  if (W.button(id + ':exec', entradaR, 'EXECUTAR', { primary: true })) {
    executa(sv, st);
  }
  const teclas = UI.takeKeys();
  if (teclas.some(k => k.key === 'Enter')) executa(sv, st);
}

function executa(sv, st) {
  const cmd = String(st.cmd || '').trim();
  if (!cmd) return;
  st.term.push({ t: '> ' + cmd, c: C.cyanBright });
  Game.net.consoleExec(sv, cmd).forEach(linha => st.term.push({ t: linha, c: C.text }));
  if (st.term.length > 400) st.term.splice(0, st.term.length - 400);
  st.cmd = '';
  Dirty.mark();
}

/* =========================================================
   CÂMERAS
   ========================================================= */
function telaCCTV(r, sv, st) {
  /* a imagem se mexe: sem isto ela congela entre um clique e outro */
  Dirty.mark();
  const grade = CCTV.grid(sv);
  if (grade.erro) return barreira(r, grade.erro, 'firewall');

  const btsR = UI.cutBottom(r, METRIC.btnH + SPACE.sm);

  if (st.cam) {
    const v = CCTV.camView(sv, st.cam);
    desenhaCamera(r, v, true);
  } else {
    /* mosaico */
    const cams = grade.cameras;
    const cols = cams.length <= 4 ? 2 : 3;
    const rows = Math.ceil(cams.length / cols);
    cams.forEach((v, i) => {
      const cell = UI.cell(UI.copy(r), cols, rows, i % cols, Math.floor(i / cols), SPACE.xs);
      desenhaCamera(cell, v, false);
      const f = UI.hitRect(id + ':cam' + i, cell);
      if ((f & HOVER)) UI.frameR(cell, C.cyanBright, 1);
      if (f & CLICK) { const res = CCTV.watch(sv, v.id); if (!res.erro) { st.cam = v.id; Dirty.mark(); } }
    });
  }

  const b1 = UI.cutLeft(btsR, 150); UI.cutLeft(btsR, SPACE.sm);
  const b2 = UI.cutLeft(btsR, 170); UI.cutLeft(btsR, SPACE.sm);
  const b3 = UI.cutLeft(btsR, 170);

  if (W.button(id + ':voltar', b1, st.cam ? 'VER MOSAICO' : 'MOSAICO', { disabled: !st.cam })) {
    st.cam = null; CCTV.unwatch(); Dirty.mark();
  }
  const podeEscrever = Game.net.canWrite(sv);
  const cam = st.cam ? sv.cams.find(c => c.id === st.cam) : null;
  if (W.button(id + ':loop', b2, cam && cam.looped ? 'REMOVER LOOP' : 'CONGELAR IMAGEM',
    { danger: true, disabled: !st.cam || !podeEscrever })) {
    const res = CCTV.loop(sv, st.cam);
    aviso(res.erro, res.texto);
  }
  if (W.button(id + ':gravar', b3, 'GRAVAR PARA MEMÓRIA', { disabled: !st.cam })) {
    const res = CCTV.record(sv, st.cam);
    aviso(res.erro, res.texto);
  }
}

/* A imagem da câmera vive em ui/camview.js: é uma cena em
   perspectiva, com mobília por local, pessoas com passada e sombra,
   e o comportamento do sensor por cima (vinheta, ruído,
   entrelaçamento, erro de compressão, visão noturna). */
function desenhaCamera(r, v, grande) {
  if (!v) return;
  CamView.desenha(UI.ctx, r, v, { grande: grande });
  UI.frameR(r, grande ? C.line3 : C.line2, 1);
}

/* =========================================================
   MODERAÇÃO DE REDE SOCIAL
   ========================================================= */
function telaSocial(r, sv, st) {
  const p = Social.panel(sv);
  if (!p) return;

  const buscaR = UI.stackTop(r, METRIC.fieldH, SPACE.sm);
  const campo = UI.cutLeft(buscaR, buscaR.w - 200);
  UI.cutLeft(buscaR, SPACE.sm);
  W.bind(id + ':sbusca', campo, st, 'busca', { placeholder: 'buscar perfil pelo nome' });
  Text.drawIn(UI.ctx, p.name + '  ·  ' + p.domain, buscaR.x + buscaR.w, buscaR.y, buscaR.h,
    FONT.data, p.accent, 'right');

  const res = Social.search(sv, st.busca);
  if (res.erro) return barreira(r, res.erro, 'firewall');

  const listaR = UI.cutLeft(r, Math.round(r.w * 0.34));
  UI.cutLeft(r, SPACE.sm);
  const feedR = r;

  UI.fill(listaR.x, listaR.y, listaR.w, listaR.h, alpha(C.wellBottom, 0.6));
  UI.frameR(listaR, C.line1, 1);
  const perfis = res.itens || [];
  W.list(id + ':perfis', UI.pad(listaR, 1, 1), perfis.length, (i, rr, hov, sel) => {
    const u = perfis[i];
    /* avatar: inicial num quadrado com a cor da plataforma */
    UI.fill(rr.x + SPACE.xs, rr.y + 8, 30, 30, alpha(p.accent2, 0.9));
    Text.center(UI.ctx, u.name[0], rr.x + SPACE.xs, rr.y + 8, 30, 30, FONT.label, p.accent);
    Text.drawFit(UI.ctx, u.name, rr.x + 48, rr.y + 20, rr.w - 60, FONT.label,
      sel ? C.textStrong : C.text);
    Text.drawFit(UI.ctx, u.handle, rr.x + 48, rr.y + 36, rr.w - 60, FONT.dataSmall, C.textFaint);
  }, {
    rowH: 46, state: st,
    empty: st.busca.length < 2 ? 'digite ao menos duas letras' : 'nenhum perfil encontrado',
    onSelect: (i) => { st.perfil = perfis[i] ? perfis[i].id : null; Dirty.mark(); }
  });

  UI.fill(feedR.x, feedR.y, feedR.w, feedR.h, alpha(C.wellBottom, 0.5));
  UI.frameR(feedR, C.line1, 1);

  if (!st.perfil) {
    /* assuntos do momento, quando não há perfil aberto */
    let t = UI.pad(feedR, SPACE.md, SPACE.md);
    W.sectionBar(UI.stackTop(t, METRIC.headerH, SPACE.sm), 'ASSUNTOS DO MOMENTO');
    Social.trends().forEach(tr => {
      const l = UI.stackTop(t, 30, 2);
      Text.drawIn(UI.ctx, tr.tag, l.x + SPACE.xs, l.y, l.h, FONT.label, p.accent, 'left');
      Text.drawIn(UI.ctx, tr.posts.toLocaleString('pt-BR') + ' publicações',
        l.x + l.w, l.y, l.h, FONT.dataSmall, C.textFaint, 'right');
    });
    return;
  }

  const perfil = Social.profile(sv, st.perfil);
  if (perfil.erro) return barreira(feedR, perfil.erro, 'firewall');

  const btsR = UI.cutBottom(feedR, METRIC.btnH + SPACE.sm);
  const capaR = UI.cutTop(feedR, 76);
  UI.fillVGrad(capaR.x, capaR.y, capaR.w, capaR.h, alpha(p.accent2, 0.85), alpha(p.accent2, 0.2));
  UI.fill(capaR.x + SPACE.md, capaR.y + 14, 48, 48, alpha(p.accent2, 1));
  Text.center(UI.ctx, perfil.perfil.name[0], capaR.x + SPACE.md, capaR.y + 14, 48, 48,
    FONT.sectionTitle, p.accent);
  Text.draw(UI.ctx, perfil.perfil.name, capaR.x + 76, capaR.y + 30, FONT.sectionTitle, C.textStrong);
  Text.draw(UI.ctx, perfil.perfil.handle + '  ·  ' +
    perfil.perfil.followers.toLocaleString('pt-BR') + ' seguidores',
    capaR.x + 76, capaR.y + 50, FONT.dataSmall, alpha(C.text, 0.8));

  const posts = perfil.publicacoes;
  W.list(id + ':posts', UI.pad(feedR, SPACE.xs, SPACE.xs), posts.length, (i, rr) => {
    const po = posts[i];
    if (po.planted) UI.fill(rr.x, rr.y + 4, 3, rr.h - 8, C.warnBright);
    Text.wrap(UI.ctx, po.text, FONT.bodySmall, rr.w - 130).slice(0, 2).forEach((q, k) => {
      Text.draw(UI.ctx, q, rr.x + SPACE.md, rr.y + 18 + k * 17, FONT.bodySmall, C.text);
    });
    Text.draw(UI.ctx, F.fmtDateShort(po.t), rr.x + SPACE.md, rr.y + 54, FONT.dataSmall, C.textFaint);
    Text.draw(UI.ctx, po.likes + ' ♥   ' + po.reposts + ' ⟳', rr.x + rr.w - SPACE.md,
      rr.y + 26, FONT.dataSmall, alpha(p.accent, 0.9), 'right');
  }, { rowH: 66, state: st, empty: 'nenhuma publicação' });

  const podeEscrever = Game.net.canWrite(sv);
  const b1 = UI.cutLeft(btsR, 150); UI.cutLeft(btsR, SPACE.sm);
  const b2 = UI.cutLeft(btsR, 170); UI.cutLeft(btsR, SPACE.sm);
  const b3 = UI.cutLeft(btsR, 230);

  if (W.button(id + ':spost', b1, 'PUBLICAR', { primary: true, disabled: !podeEscrever })) {
    const contrato = Game.state.missions.active.find(m =>
      m.goal.kind === 'social_posted' && m.goal.personId === st.perfil);
    const texto = contrato ? contrato.extra.postText : 'Publicação inserida.';
    const res = Social.post(sv, st.perfil, texto);
    aviso(res.erro, res.texto);
  }
  if (W.button(id + ':swipe', b2, 'APAGAR TUDO', { danger: true, disabled: !podeEscrever })) {
    const res = Social.wipe(sv, st.perfil);
    aviso(res.erro, res.texto);
  }
  if (W.button(id + ':sdm', b3, 'EXPORTAR CONVERSAS')) {
    const res = Social.exportDMs(sv, st.perfil);
    aviso(res.erro, res.texto);
  }
}

/* =========================================================
   BANCO, REGISTROS E REDE INTERNA
   Cada uma vive no próprio módulo em ui/screens/: são telas com
   fluxo próprio (autenticação de conta, formulário de ficha, mapa de
   topologia) e não cabiam como funções soltas aqui dentro.
   ========================================================= */
function telaBanco(r, sv, st) { TelaBanco.desenha(r, sv, st, id); }
function telaRegistros(r, sv, st) { TelaRegistros.desenha(r, sv, st, id); }
function telaLAN(r, sv, st) { TelaLAN.desenha(r, sv, st, id); }

/* =========================================================
   BARREIRA
   Quando uma camada bloqueia a tela, explica o que fazer.
   ========================================================= */
function barreira(r, texto, tipo) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  Icon.lock(UI.ctx, cx, cy - 40, 44, alpha(C.danger, 0.8));
  Text.center(UI.ctx, texto, r.x, cy, r.w, 30, FONT.sectionTitle, C.dangerBright);
  const dica = tipo === 'firewall'
    ? 'vá em FERRAMENTAS e execute o Firewall_Bypass para liberar a leitura'
    : 'vá em FERRAMENTAS e execute o Proxy_Bypass para liberar a escrita';
  Text.center(UI.ctx, dica, r.x, cy + 34, r.w, 24, FONT.bodySmall, C.textFaint);
}

/* =========================================================
   ABERTURA E FECHAMENTO AUTOMÁTICOS
   ========================================================= */
Bus.on(EV.CONNECT_OPEN, () => {
  import('./index.js').then(m => m.Apps.open(id));
});
Bus.on(EV.CONNECT_CLOSE, () => {
  import('../windows.js').then(m => m.Windows.close(id));
});
