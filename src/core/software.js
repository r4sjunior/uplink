/* =========================================================
   software.js — as ferramentas e a sua execução.

   Uma ferramenta em execução é uma TAREFA: um objeto de dados puro
   em `S.tasks`, nunca uma closure. É isso que permite salvar o jogo
   no meio de uma quebra de senha e retomar exatamente de onde parou.

   Todas as tarefas dividem a CPU do gateway. Rodar quatro programas
   ao mesmo tempo deixa os quatro mais lentos — a escolha de o que
   priorizar sob um trace correndo é parte do jogo.
   ========================================================= */
import * as D from './data.js';
import * as F from './fmt.js';
import { Bus, EV } from './bus.js';
import {
  S, R, srv, swVersion, hasSw, addSw, storeFile, memFree, bump, flag
} from './state.js';
import { logHit } from './entities.js';
import * as Net from './net.js';
import * as LAN from './lan.js';
import * as News from './news.js';
import * as HW from './hardware.js';
import * as Bank from './bank.js';

/* =========================================================
   TAREFAS
   ========================================================= */

/* Quanto de trabalho por segundo real o gateway entrega, somando
   todos os processadores, dividido entre as tarefas ativas. */
function cpuThroughput() {
  return HW.cpuPower() * (S.speed > 0 ? 1 : 0);
}

export function tasks() { return S.tasks; }
export function taskFor(sw) { return S.tasks.find(t => t.sw === sw) || null; }
export function busy(sw) { return !!taskFor(sw); }

function start(spec) {
  if (taskFor(spec.sw)) return 'O programa ' + spec.name + ' já está em execução.';
  const t = Object.assign({
    id: R.uid('t'),
    progress: 0,
    work: 100,
    startedAt: S.time,
    ip: S.conn.target || null
  }, spec);
  S.tasks.push(t);
  Bus.emit(EV.TOOL_RUN, { tool: t.sw, name: t.name, version: t.v, target: t.ip });
  Bus.emit(EV.SFX, { name: 'tool_start' });
  return null;
}

export function abort(id) {
  const i = S.tasks.findIndex(t => t.id === id);
  if (i < 0) return false;
  const t = S.tasks[i];
  S.tasks.splice(i, 1);
  Bus.emit(EV.TOOL_DONE, { tool: t.sw, ok: false, aborted: true });
  return true;
}

export function abortAll() {
  const had = S.tasks.length;
  S.tasks.length = 0;
  return had;
}

/* =========================================================
   O RELÓGIO DAS TAREFAS
   Chamado por game.js a cada quadro, com o delta REAL em segundos.
   ========================================================= */
export function tick(dtReal) {
  if (!S.tasks.length) return;
  const active = S.tasks.length;
  const share = cpuThroughput() / active;

  for (let i = S.tasks.length - 1; i >= 0; i--) {
    const t = S.tasks[i];
    /* uma tarefa amarrada a uma conexão morre quando ela cai */
    if (t.needsConn && !S.conn.live) {
      S.tasks.splice(i, 1);
      Bus.emit(EV.TOOL_DONE, { tool: t.sw, ok: false, reason: 'conexão perdida' });
      continue;
    }

    t.progress += (share / t.work) * 100 * dtReal;

    if (t.progress >= 100) {
      t.progress = 100;
      S.tasks.splice(i, 1);
      finish(t);
    } else {
      Bus.emit(EV.TOOL_PROGRESS, { tool: t.sw, id: t.id, pct: t.progress, name: t.name });
    }
  }
}

/* =========================================================
   CONCLUSÃO
   Cada tipo de ferramenta resolve o seu efeito aqui.
   ========================================================= */
function finish(t) {
  const server = t.ip ? srv(t.ip) : null;
  let ok = true;
  let msg = null;

  switch (t.sw) {
    case 'password_breaker':
    case 'dictionary_hacker': {
      if (!server) { ok = false; break; }
      server.st.logged = true;
      msg = 'Senha quebrada: ' + server.sec.pass;
      logHit(server, 'Autenticação bem-sucedida a partir de ' + Net.playerIP(), 'sys');
      S.conn.screen = server.lan ? 'lan' : server.screens[0];
      Bus.emit(EV.BREACH, { layer: 'password', level: 1, ip: server.ip });
      break;
    }

    case 'firewall_bypass':
      if (!server) { ok = false; break; }
      server.st.fwDown = true;
      msg = 'Firewall contornado. Leitura liberada.';
      Bus.emit(EV.BREACH, { layer: 'firewall', level: server.sec.firewall, ip: server.ip });
      break;

    case 'firewall_disable':
      if (!server) { ok = false; break; }
      server.st.fwDown = true;
      msg = 'Firewall desativado. Evidência registrada no log.';
      logHit(server, 'ALERTA: firewall desativado remotamente');
      Net.illegal(server, 1);
      Bus.emit(EV.BREACH, { layer: 'firewall', level: server.sec.firewall, ip: server.ip });
      break;

    case 'proxy_bypass':
      if (!server) { ok = false; break; }
      server.st.proxyDown = true;
      msg = 'Proxy contornado. Escrita liberada.';
      Bus.emit(EV.BREACH, { layer: 'proxy', level: server.sec.proxy, ip: server.ip });
      break;

    case 'proxy_disable':
      if (!server) { ok = false; break; }
      server.st.proxyDown = true;
      msg = 'Proxy desativado. Evidência registrada no log.';
      logHit(server, 'ALERTA: proxy desativado remotamente');
      Net.illegal(server, 1);
      Bus.emit(EV.BREACH, { layer: 'proxy', level: server.sec.proxy, ip: server.ip });
      break;

    case 'monitor_bypass':
      if (!server) { ok = false; break; }
      server.st.monFooled = true;
      msg = 'Monitor enganado. Nenhum trace ativo será disparado nesta sessão.';
      Bus.emit(EV.BREACH, { layer: 'monitor', level: server.sec.monitor, ip: server.ip });
      break;

    case 'decrypter': {
      const f = t.file;
      if (!f) { ok = false; break; }
      f.enc = 0;
      msg = 'Arquivo descriptografado: ' + f.name;
      Bus.emit(EV.MEM_CHANGED, {});
      break;
    }

    case 'file_copier': {
      if (!server || !t.file) { ok = false; break; }
      const src = server.files.find(x => x.id === t.file.id);
      if (!src) { ok = false; msg = 'O arquivo não está mais lá.'; break; }
      if (!storeFile(src, server.ip)) { ok = false; msg = 'Memória do gateway cheia.'; break; }
      Net.illegal(server, 1);
      logHit(server, 'Arquivo acessado: ' + src.name);
      bump('filesCopied');
      msg = 'Cópia concluída: ' + src.name;
      News.report('theft', { target: server.name });
      Bus.emit(EV.MEM_CHANGED, {});
      break;
    }

    case 'file_deleter': {
      if (!server || !t.file) { ok = false; break; }
      const idx = server.files.findIndex(x => x.id === t.file.id);
      if (idx < 0) { ok = false; msg = 'O arquivo não está mais lá.'; break; }
      const name = server.files[idx].name;
      Net.illegal(server, 2);
      server.files.splice(idx, 1);
      logHit(server, 'Arquivo removido: ' + name);
      bump('filesDeleted');
      msg = 'Arquivo apagado: ' + name;
      Bus.emit(EV.FILE_CHANGED, { ip: server.ip, action: 'delete' });
      break;
    }

    case 'log_deleter':
      if (!server || !t.logId) { ok = false; break; }
      ok = Net.deleteLog(server, t.logId);
      msg = ok ? 'Registro apagado.' : 'O registro não existe mais.';
      break;

    case 'log_modifier':
      if (!server || !t.logId) { ok = false; break; }
      ok = Net.modifyLog(server, t.logId);
      msg = ok ? 'Registro reescrito. Nenhuma lacuna no histórico.' : 'O registro não existe mais.';
      break;

    case 'log_undeleter':
      if (!server) { ok = false; break; }
      const n = Net.undeleteLogs(server);
      msg = n ? n + ' registros recuperados.' : 'Nenhum registro recuperável.';
      break;

    case 'ip_probe':
      if (!server) { ok = false; break; }
      server.probed = Math.max(server.probed || 0, t.v);
      msg = 'Varredura concluída em ' + server.ip + '.';
      break;

    case 'ip_lookup': {
      const s = srv(t.lookupIp);
      if (!s) { ok = false; msg = 'Nenhum servidor responde em ' + t.lookupIp + '.'; break; }
      S.links.includes(s.ip) || S.links.push(s.ip);
      Bus.emit(EV.LINK_NEW, { ip: s.ip, name: s.name });
      msg = t.lookupIp + ' → ' + s.name;
      break;
    }

    case 'voice_analyser':
      if (!server) { ok = false; break; }
      server.st.voiceOk = true;
      msg = 'Impressão vocal reconstruída. Autenticação por voz vencida.';
      break;

    case 'defrag':
      msg = 'Memória compactada. ' + F.size(memFree()) + ' livres.';
      Bus.emit(EV.MEM_CHANGED, {});
      break;

    case 'lan_scan': {
      if (!server) { ok = false; break; }
      const found = LAN.scan(server, t.v);
      msg = found + ' equipamentos visíveis na rede interna.';
      break;
    }

    case 'lan_probe': {
      if (!server) { ok = false; break; }
      const r = LAN.probe(server, t.nodeId, t.v);
      ok = !r.erro; msg = r.erro || r.texto;
      break;
    }

    case 'lan_force': {
      if (!server) { ok = false; break; }
      const r = LAN.force(server, t.nodeId, t.v);
      ok = !r.erro; msg = r.erro || r.texto;
      break;
    }

    case 'lan_spoof': {
      if (!server) { ok = false; break; }
      const r = LAN.spoof(server, t.nodeId, t.v);
      ok = !r.erro; msg = r.erro || r.texto;
      break;
    }

    case 'revelation':
    case 'faith': {
      if (!server) { ok = false; break; }
      const r = storyWeapon(t.sw, server, t.v);
      ok = r.ok; msg = r.texto;
      break;
    }

    default:
      ok = false;
      msg = 'Ferramenta desconhecida: ' + t.sw;
  }

  Bus.emit(EV.TOOL_DONE, { tool: t.sw, name: t.name, ok: ok, message: msg, ip: t.ip });
  Bus.emit(EV.SFX, { name: ok ? 'tool_ok' : 'tool_fail' });
  if (msg) Bus.emit(EV.UI_TOAST, { text: msg, kind: ok ? 'ok' : 'bad' });
}

/* As duas armas do arco narrativo. */
function storyWeapon(id, server, v) {
  if (id === 'revelation') {
    Net.illegal(server, 5);
    server.files.length = 0;
    server.infected = { by: 'revelation', at: S.time, v: v };
    logHit(server, 'ALERTA CRÍTICO: código autorreplicante detectado — sistema comprometido');
    News.report('destroy', { target: server.name });
    bump('filesDeleted', 1);
    return { ok: true, texto: 'Revelation liberado em ' + server.name + '. O sistema está sendo consumido.' };
  }
  if (!server.infected) return { ok: false, texto: 'Não há infecção ativa neste sistema.' };
  if (v < server.infected.v) {
    return { ok: false, texto: 'Faith v' + v + ' não alcança uma cepa v' + server.infected.v + '.' };
  }
  server.infected = null;
  logHit(server, 'Contramedida aplicada: sistema restaurado', 'sys');
  return { ok: true, texto: 'Faith neutralizou a infecção em ' + server.name + '.' };
}

/* =========================================================
   LANÇADORES
   A interface chama estes. Todos devolvem null quando deu certo,
   ou uma string com o motivo da recusa.
   ========================================================= */

function need(id, minv) {
  const s = hasSw(id, minv);
  if (!s) {
    const cat = D.SW_BY_ID[id];
    return minv
      ? 'Você precisa de ' + cat.name + ' v' + minv + ' ou superior.'
      : 'Você não tem ' + cat.name + '.';
  }
  return null;
}

/* Trabalho (em unidades de CPU-segundo) para cada operação. A regra:
   quanto maior a camada, mais caro; quanto maior a versão da sua
   ferramenta, mais barato. */
function workFor(layerLevel, toolVersion, base) {
  const gap = Math.max(0, layerLevel - toolVersion);
  return Math.round((base || 40) * Math.pow(2.0, layerLevel) * Math.pow(1.6, gap) / Math.max(1, toolVersion));
}

export function breakPassword(useDictionary) {
  const server = srv(S.conn.target);
  if (!S.conn.live || !server) return 'Sem conexão.';
  if (!server.sec.pass) return 'Este sistema não pede senha.';
  if (server.st.logged) return 'Você já está autenticado.';

  if (useDictionary) {
    const err = need('dictionary_hacker'); if (err) return err;
    /* o dicionário só vence senha fraca — e a senha fraca é justamente
       a que está na lista de senhas comuns */
    if (!D.COMMON_PASS.includes(server.sec.pass)) {
      Bus.emit(EV.UI_TOAST, { text: 'O dicionário não encontrou a senha deste sistema.', kind: 'bad' });
      return null;
    }
    return start({ sw: 'dictionary_hacker', name: 'Dictionary_Hacker', v: 1, work: 25, needsConn: true });
  }

  const err = need('password_breaker'); if (err) return err;
  const v = swVersion('password_breaker');
  return start({
    sw: 'password_breaker', name: 'Password_Breaker', v: v,
    work: Math.round(220 / v) * (server.sec.pass.length > 6 ? 2 : 1),
    needsConn: true
  });
}

export function breakLayer(layer, disable) {
  const server = srv(S.conn.target);
  if (!S.conn.live || !server) return 'Sem conexão.';

  const level = server.sec[layer] || 0;
  if (!level) return 'Este sistema não tem ' + layer + '.';
  if ((layer === 'firewall' && server.st.fwDown) ||
      (layer === 'proxy' && server.st.proxyDown) ||
      (layer === 'monitor' && server.st.monFooled)) return 'Camada já vencida.';

  const id = layer + '_' + (disable ? 'disable' : 'bypass');
  if (layer === 'monitor' && disable) return 'O monitor só pode ser enganado, não desativado.';

  const err = need(id, level);
  if (err) return err;
  const v = swVersion(id);
  return start({
    sw: id, name: D.SW_BY_ID[id].name, v: v,
    work: workFor(level, v, disable ? 26 : 40),
    needsConn: true
  });
}

export function decrypt(memId) {
  const f = S.memory.find(x => x.id === memId);
  if (!f) return 'Arquivo não encontrado na memória.';
  if (!f.enc) return 'Este arquivo não está criptografado.';
  const err = need('decrypter', f.enc);
  if (err) return err + ' (o arquivo está em nível ' + f.enc + ')';
  const v = swVersion('decrypter');
  return start({ sw: 'decrypter', name: 'Decrypter', v: v, file: f, work: 30 * Math.pow(1.9, f.enc) / v });
}

export function copyFile(fileId) {
  const server = srv(S.conn.target);
  if (!S.conn.live || !server) return 'Sem conexão.';
  const block = Net.readBlock(server); if (block) return block;
  const f = server.files.find(x => x.id === fileId);
  if (!f) return 'Arquivo não encontrado.';
  if (memFree() < f.size) return 'Memória insuficiente: precisa de ' + F.size(f.size) + '.';
  const err = need('file_copier'); if (err) return err;
  /* o modem manda no tempo de transferência */
  return start({
    sw: 'file_copier', name: 'File_Copier', v: 1, file: f,
    work: Math.max(6, (f.size * 90) / HW.modemSpeed()), needsConn: true
  });
}

export function deleteFile(fileId) {
  const server = srv(S.conn.target);
  if (!S.conn.live || !server) return 'Sem conexão.';
  const block = Net.writeBlock(server); if (block) return block;
  const f = server.files.find(x => x.id === fileId);
  if (!f) return 'Arquivo não encontrado.';
  const err = need('file_deleter'); if (err) return err;
  return start({ sw: 'file_deleter', name: 'File_Deleter', v: 1, file: f, work: 14, needsConn: true });
}

export function wipeLog(logId, modify) {
  const server = srv(S.conn.target);
  if (!S.conn.live || !server) return 'Sem conexão.';
  const block = Net.writeBlock(server); if (block) return block;
  const id = modify ? 'log_modifier' : 'log_deleter';
  const err = need(id); if (err) return err;
  return start({
    sw: id, name: D.SW_BY_ID[id].name, v: swVersion(id), logId: logId,
    work: modify ? 24 : 12, needsConn: true
  });
}

export function undeleteLogs() {
  const server = srv(S.conn.target);
  if (!S.conn.live || !server) return 'Sem conexão.';
  const block = Net.readBlock(server); if (block) return block;
  const err = need('log_undeleter'); if (err) return err;
  return start({ sw: 'log_undeleter', name: 'Log_UnDeleter', v: 1, work: 40, needsConn: true });
}

export function probe(ip) {
  const err = need('ip_probe'); if (err) return err;
  const s = srv(ip || S.conn.target);
  if (!s) return 'IP inválido.';
  return start({ sw: 'ip_probe', name: 'IP_Probe', v: swVersion('ip_probe'), ip: s.ip, work: 45 });
}

export function lookup(ip) {
  const err = need('ip_lookup'); if (err) return err;
  return start({ sw: 'ip_lookup', name: 'IP_Lookup', v: 1, lookupIp: String(ip), work: 20 });
}

export function analyseVoice() {
  const server = srv(S.conn.target);
  if (!S.conn.live || !server) return 'Sem conexão.';
  if (!server.sec.voice) return 'Este sistema não usa autenticação por voz.';
  const err = need('voice_analyser', server.sec.voice); if (err) return err;
  return start({
    sw: 'voice_analyser', name: 'Voice_Analyser', v: swVersion('voice_analyser'),
    work: 70, needsConn: true
  });
}

export function defrag() {
  const err = need('defrag'); if (err) return err;
  return start({ sw: 'defrag', name: 'Defrag', v: 1, work: 30 });
}

export function lanScan() {
  const server = srv(S.conn.target);
  if (!S.conn.live || !server || !server.lan) return 'Não há rede interna aqui.';
  const err = need('lan_scan'); if (err) return err;
  return start({ sw: 'lan_scan', name: 'LAN_Scan', v: swVersion('lan_scan'), work: 55, needsConn: true });
}

export function lanTool(kind, nodeId) {
  const server = srv(S.conn.target);
  if (!S.conn.live || !server || !server.lan) return 'Não há rede interna aqui.';
  const id = 'lan_' + kind;
  const nd = LAN.node(server, nodeId);
  if (!nd) return 'Equipamento desconhecido.';
  const err = need(id, nd.level); if (err) return err;
  const v = swVersion(id);
  return start({
    sw: id, name: D.SW_BY_ID[id].name, v: v, nodeId: nodeId,
    work: workFor(nd.level, v, kind === 'force' ? 50 : 34), needsConn: true
  });
}

export function runWeapon(id) {
  const server = srv(S.conn.target);
  if (!S.conn.live || !server) return 'Sem conexão.';
  const err = need(id); if (err) return err;
  return start({
    sw: id, name: D.SW_BY_ID[id].name, v: swVersion(id),
    work: 130, needsConn: true
  });
}

/* =========================================================
   LOJA
   ========================================================= */
export function catalog() {
  return D.SOFTWARE.filter(s => !s.story).map(s => {
    const have = swVersion(s.id);
    const next = have + 1;
    return {
      id: s.id, name: s.name, desc: s.desc, kind: s.kind, size: s.size,
      have: have, maxv: s.maxv,
      nextVersion: next <= s.maxv ? next : null,
      price: next <= s.maxv ? D.swPrice(s, next) : null
    };
  });
}

export function buy(id) {
  const cat = D.SW_BY_ID[id];
  if (!cat || cat.story) return 'Item indisponível.';
  const have = swVersion(id);
  const next = have + 1;
  if (next > cat.maxv) return 'Você já tem a versão máxima de ' + cat.name + '.';
  const price = D.swPrice(cat, next);
  if (S.credits < price) return 'Créditos insuficientes: faltam ' + F.credits(price - S.credits) + '.';

  /* espaço em memória: só cobra a diferença numa atualização */
  const cost = have ? 0 : cat.size;
  if (memFree() < cost) return 'Sem espaço na memória do gateway.';

  Bank.pay(-price, 'Compra: ' + cat.name + ' v' + next);
  addSw(id, next);
  Bus.emit(EV.UI_TOAST, { text: cat.name + ' v' + next + ' instalado.', kind: 'ok' });
  Bus.emit(EV.SFX, { name: 'purchase' });
  return null;
}

/* Kit inicial: o suficiente para o contrato de estreia e nada mais. */
export function grantStarterKit() {
  addSw('password_breaker', 1);
  addSw('file_copier', 1);
  addSw('file_deleter', 1);
  addSw('log_deleter', 1);
  addSw('trace_tracker', 1);
  addSw('ip_lookup', 1);
  addSw('decrypter', 1);
}
