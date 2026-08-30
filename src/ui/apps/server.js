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
    cam: null, perfil: null, cmd: '', term: []
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

/* A imagem da câmera: a cena é desenhada, não é vídeo. */
function desenhaCamera(r, v, grande) {
  if (!v) return;
  const ctx = UI.ctx;
  UI.fill(r.x, r.y, r.w, r.h, v.night ? '#04060a' : '#0a0f14');
  UI.frameR(r, C.line2, 1);

  ctx.save();
  ctx.beginPath(); ctx.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); ctx.clip();

  /* chão em perspectiva */
  const horizonte = r.y + r.h * 0.34;
  const g = ctx.createLinearGradient(0, horizonte, 0, r.y + r.h);
  g.addColorStop(0, v.night ? '#0b1118' : '#141c24');
  g.addColorStop(1, v.night ? '#05080c' : '#0a0e13');
  ctx.fillStyle = g;
  ctx.fillRect(r.x, horizonte, r.w, r.h - (horizonte - r.y));

  /* parede ao fundo */
  ctx.fillStyle = v.night ? '#080c12' : '#101820';
  ctx.fillRect(r.x, r.y, r.w, horizonte - r.y);
  UI.hline(r.x, horizonte, r.w, alpha('#3d5670', 0.5));

  /* linhas de fuga */
  ctx.strokeStyle = alpha('#3d5670', 0.22);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -2; i <= 6; i++) {
    ctx.moveTo(r.x + r.w * (0.5 + i * 0.06), horizonte);
    ctx.lineTo(r.x + r.w * (0.5 + i * 0.42), r.y + r.h);
  }
  ctx.stroke();

  /* figurantes */
  (v.atores || []).forEach(a => {
    const X = r.x + a.x * r.w;
    const base = horizonte + (r.h - (horizonte - r.y)) * a.y;
    const alt = (r.h * 0.20) * a.scale;
    const larg = alt * 0.30;
    ctx.fillStyle = a.kind === 'guarda' ? alpha('#7fa8d8', 0.85)
      : a.kind === 'carrinho' ? alpha('#c8a25a', 0.8)
      : alpha('#93a6bb', 0.75);
    /* corpo */
    ctx.fillRect(X - larg / 2, base - alt, larg, alt * 0.72);
    /* cabeça */
    ctx.beginPath();
    ctx.arc(X, base - alt - larg * 0.42, larg * 0.36, 0, Math.PI * 2);
    ctx.fill();
    /* sombra */
    ctx.fillStyle = alpha('#000000', 0.4);
    ctx.beginPath();
    ctx.ellipse(X, base, larg * 0.7, larg * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  /* ruído de vídeo */
  const n = Math.round(r.w * r.h * v.noise * 0.006);
  ctx.fillStyle = alpha('#ffffff', 0.10);
  for (let i = 0; i < n; i++) {
    ctx.fillRect(r.x + Math.random() * r.w, r.y + Math.random() * r.h, 1, 1);
  }
  if (v.glitch) {
    const gy = r.y + Math.random() * r.h;
    ctx.fillStyle = alpha('#ffffff', 0.13);
    ctx.fillRect(r.x, gy, r.w, 2 + Math.random() * 5);
  }

  /* linhas de varredura */
  ctx.fillStyle = alpha('#000000', 0.20);
  for (let y = r.y; y < r.y + r.h; y += 3) ctx.fillRect(r.x, y, r.w, 1);

  ctx.restore();

  /* carimbo */
  Text.draw(ctx, v.stamp, r.x + SPACE.xs, r.y + 16, FONT.dataSmall, alpha('#d8e6f4', 0.9));
  if (v.recording) {
    const pisca = (UI.time * 1.4) % 1 < 0.6;
    if (pisca) {
      ctx.beginPath();
      ctx.arc(r.x + r.w - 26, r.y + 12, 4, 0, Math.PI * 2);
      ctx.fillStyle = C.dangerBright; ctx.fill();
    }
    Text.draw(ctx, 'REC', r.x + r.w - 18, r.y + 16, FONT.dataSmall, C.dangerBright);
  }
  if (v.looped) {
    UI.frameR(r, C.warnBright, 2);
    Text.center(ctx, 'SINAL EM LOOP', r.x, r.y + r.h - 26, r.w, 20, FONT.label, C.warnBright);
  }
  if (!grande) {
    Text.draw(ctx, v.label, r.x + SPACE.xs, r.y + r.h - 8, FONT.dataSmall, alpha('#d8e6f4', 0.75));
  }
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
  const b3 = UI.cutLeft(btsR, 190);

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
  if (W.button(id + ':sdm', b3, 'EXPORTAR MENSAGENS')) {
    const res = Social.exportDMs(sv, st.perfil);
    aviso(res.erro, res.texto);
  }
}

/* =========================================================
   BANCO E REGISTROS — versões enxutas mas funcionais
   ========================================================= */
function telaBanco(r, sv, st) {
  const bloqueio = Game.net.readBlock(sv);
  if (bloqueio) return barreira(r, bloqueio, 'firewall');

  const conhecidas = Game.bank.knownAccounts().filter(a => a.bank.ip === sv.ip);
  const btsR = UI.cutBottom(r, METRIC.btnH + SPACE.sm);

  UI.fill(r.x, r.y, r.w, r.h, alpha(C.wellBottom, 0.6));
  UI.frameR(r, C.line1, 1);
  W.list(id + ':contas', UI.pad(r, 1, 1), conhecidas.length, (i, rr) => {
    const a = conhecidas[i].acc;
    Icon.money(UI.ctx, rr.x + SPACE.md, rr.y + rr.h / 2, 13, a.isPlayer ? C.okBright : C.cyan);
    Text.draw(UI.ctx, a.no, rr.x + 34, rr.y + 22, FONT.data, C.text);
    Text.drawFit(UI.ctx, a.owner, rr.x + 160, rr.y + 22, rr.w - 340, FONT.body,
      a.isPlayer ? C.okBright : C.text);
    Text.draw(UI.ctx, F.credits(a.balance), rr.x + rr.w - SPACE.md, rr.y + 22,
      FONT.dataStrong, C.okBright, 'right');
  }, { rowH: 38, state: st, empty: 'nenhuma conta conhecida neste banco — descubra número e senha primeiro' });

  const b1 = UI.cutLeft(btsR, 190);
  if (W.button(id + ':transf', b1, 'TRANSFERIR FUNDOS', { primary: true, disabled: conhecidas.length < 2 })) {
    Bus.emit(EV.UI_TOAST, {
      text: 'Selecione origem e destino: a transferência deixa rastro nos dois bancos.',
      kind: 'warn'
    });
  }
}

function telaRegistros(r, sv, st) {
  const bloqueio = Game.net.readBlock(sv);
  if (bloqueio) return barreira(r, bloqueio, 'firewall');

  const buscaR = UI.stackTop(r, METRIC.fieldH, SPACE.sm);
  W.bind(id + ':rbusca', buscaR, st, 'busca', { placeholder: 'buscar pessoa pelo nome' });

  const q = String(st.busca || '').trim();
  const achados = q.length >= 2
    ? Game.state.world.people.filter(p => F.norm(p.name).includes(F.norm(q))).slice(0, 60)
    : [];

  UI.fill(r.x, r.y, r.w, r.h, alpha(C.wellBottom, 0.6));
  UI.frameR(r, C.line1, 1);
  W.list(id + ':pessoas', UI.pad(r, 1, 1), achados.length, (i, rr) => {
    const p = achados[i];
    Text.drawFit(UI.ctx, p.name, rr.x + SPACE.md, rr.y + 22, 260, FONT.body, C.text);
    Text.draw(UI.ctx, String(p.born), rr.x + 300, rr.y + 22, FONT.data, C.textDim);
    Text.drawFit(UI.ctx, p.city, rr.x + 370, rr.y + 22, 160, FONT.bodySmall, C.textFaint);
    if (sv.type === 'criminal') {
      Text.draw(UI.ctx, p.criminal.length + ' registro(s)', rr.x + rr.w - SPACE.md, rr.y + 22,
        FONT.dataSmall, p.criminal.length ? C.dangerBright : C.ok, 'right');
    } else if (sv.type === 'academic') {
      Text.drawFit(UI.ctx, p.academic.wiped ? 'histórico apagado' : p.academic.degree,
        rr.x + 540, rr.y + 22, rr.w - 560, FONT.bodySmall,
        p.academic.wiped ? C.warnBright : C.textDim);
    }
  }, { rowH: 36, state: st, empty: q.length >= 2 ? 'nada encontrado' : 'digite ao menos duas letras' });
}

/* =========================================================
   REDE INTERNA
   ========================================================= */
function telaLAN(r, sv, st) {
  const mapa = LAN.mapView(sv);
  const btsR = UI.cutBottom(r, METRIC.btnH + SPACE.sm);

  UI.fillVGrad(r.x, r.y, r.w, r.h, '#050e1e', '#02060e');
  UI.frameR(r, C.line2, 1);

  const nos = mapa.nodes || [];
  if (!nos.length) {
    Text.center(UI.ctx, 'rede não mapeada — execute o LAN_Scan',
      r.x, r.y, r.w, r.h, FONT.body, C.textFaint);
  } else {
    /* dispõe por camada (tier), da entrada até o sistema central */
    const camadas = {};
    nos.forEach(n => { (camadas[n.tier] = camadas[n.tier] || []).push(n); });
    const chaves = Object.keys(camadas).map(Number).sort((a, b) => a - b);
    const passoY = r.h / (chaves.length + 1);

    const pos = {};
    chaves.forEach((k, ci) => {
      const linha = camadas[k];
      const passoX = r.w / (linha.length + 1);
      linha.forEach((n, i) => {
        pos[n.id] = { x: r.x + passoX * (i + 1), y: r.y + passoY * (ci + 1) };
      });
    });

    /* ligações */
    UI.ctx.strokeStyle = alpha(C.cyanDim, 0.55);
    UI.ctx.lineWidth = 1;
    nos.forEach(n => {
      (n.links || []).forEach(l => {
        if (!pos[n.id] || !pos[l]) return;
        UI.ctx.beginPath();
        UI.ctx.moveTo(pos[n.id].x, pos[n.id].y);
        UI.ctx.lineTo(pos[l].x, pos[l].y);
        UI.ctx.stroke();
      });
    });

    /* nós */
    nos.forEach((n, i) => {
      const p = pos[n.id];
      if (!p) return;
      const atual = n.id === mapa.at;
      const cor = n.kind === 'system' ? C.dangerBright
        : n.kind === 'lock' ? C.warnBright
        : atual ? C.cyanBright : C.accentBright;
      const cell = UI.rect(p.x - 34, p.y - 20, 68, 40);
      UI.fill(cell.x, cell.y, cell.w, cell.h, alpha(cor, atual ? 0.25 : 0.12));
      UI.frameR(cell, cor, atual ? 2 : 1);
      Text.center(UI.ctx, n.name, cell.x, cell.y + 4, cell.w, 14, FONT.labelSmall, cor);
      Text.center(UI.ctx, n.kind, cell.x, cell.y + 20, cell.w, 14, FONT.dataSmall, C.textFaint);
      const f = UI.hitRect(id + ':lan' + i, cell);
      if (f & CLICK) {
        const res = LAN.move(sv, n.id);
        aviso(res && res.erro, 'Movido para ' + n.name);
        Dirty.mark();
      }
    });
  }

  const b1 = UI.cutLeft(btsR, 150); UI.cutLeft(btsR, SPACE.sm);
  const b2 = UI.cutLeft(btsR, 150); UI.cutLeft(btsR, SPACE.sm);
  const b3 = UI.cutLeft(btsR, 150);
  if (W.button(id + ':lscan', b1, 'LAN_SCAN', { primary: true })) aviso(Game.software.lanScan(), 'Varredura iniciada.');
  if (W.button(id + ':lforce', b2, 'LAN_FORCE', { danger: true })) aviso(Game.software.lanTool('force', mapa.at), 'Arrombamento iniciado.');
  if (W.button(id + ':lspoof', b3, 'LAN_SPOOF')) aviso(Game.software.lanTool('spoof', mapa.at), 'Falsificação iniciada.');
}

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
