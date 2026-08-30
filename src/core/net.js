/* =========================================================
   net.js — a espinha dorsal do jogo.

   Rota de bounce, conexão, camadas de segurança, trace ativo e
   trace passivo. Aqui mora a única regra que realmente importa no
   Uplink: cada máquina por onde você passa grava de onde você veio,
   e alguém vai ler esses registros mais tarde.
   ========================================================= */
import * as D from './data.js';
import * as F from './fmt.js';
import { Bus, EV } from './bus.js';
import {
  S, R, srv, resetSession, addNeuro, addPoints, addEmail,
  addHeat, heatFactor, bump, gameOver, stableSeed, ratingName
} from './state.js';
import { makeLog, randIP, logHit } from './entities.js';
import { makeRNG } from './rng.js';
import * as Bank from './bank.js';
import * as News from './news.js';
import * as LAN from './lan.js';

export const MAX_HOPS = 12;

/* =========================================================
   IDENTIDADE
   ========================================================= */
export function playerIP() {
  if (!S.playerIP || S.playerIP === '0.0.0.0') {
    S.playerIP = randIP(makeRNG(stableSeed('gateway-ip')));
  }
  return S.playerIP;
}

/* =========================================================
   ROTA DE BOUNCE
   ========================================================= */
export function addHop(ip) {
  if (S.conn.live) return 'Desconecte antes de alterar a rota.';
  if (!srv(ip)) return 'IP desconhecido.';
  if (S.conn.route.includes(ip)) return 'Este servidor já está na rota.';
  if (S.conn.route.length >= MAX_HOPS) return 'Rota cheia (máximo de ' + MAX_HOPS + ' saltos).';
  S.conn.route.push(ip);
  Bus.emit(EV.ROUTE_CHANGED, routeView());
  return null;
}
export function removeHop(ip) {
  if (S.conn.live) return 'Desconecte antes de alterar a rota.';
  const i = S.conn.route.indexOf(ip);
  if (i >= 0) S.conn.route.splice(i, 1);
  Bus.emit(EV.ROUTE_CHANGED, routeView());
  return null;
}
export function clearRoute() {
  if (S.conn.live) return 'Desconecte primeiro.';
  S.conn.route = [];
  Bus.emit(EV.ROUTE_CHANGED, routeView());
  return null;
}
export function setTarget(ip) {
  if (S.conn.live) return 'Desconecte primeiro.';
  if (!srv(ip)) return 'IP desconhecido.';
  S.conn.target = ip;
  Bus.emit(EV.ROUTE_CHANGED, routeView());
  return null;
}

export function routeView() {
  return {
    route: S.conn.route.map(ip => {
      const s = srv(ip);
      return s ? { ip: ip, name: s.name, lat: s.lat, lon: s.lon, type: s.type } : { ip: ip };
    }),
    target: S.conn.target ? (() => {
      const s = srv(S.conn.target);
      return s ? { ip: s.ip, name: s.name, lat: s.lat, lon: s.lon, type: s.type } : null;
    })() : null,
    quality: routeQuality(),
    estimate: S.conn.target ? estimateTrace(S.conn.target) : 0
  };
}

/* Peso de cada salto: bancos e bases governamentais são lentos de
   quebrar, e por isso ótimos como bounce. */
const HOP_WEIGHT = {
  bank: 0.60, criminal: 0.55, academic: 0.50, social: 0.50, mainframe: 0.50,
  socialnet: 0.45, internal: 0.40, cctv: 0.30, public: 0.25, internic: 0.35,
  uplinkpub: 0.30, test: 0.15
};

export function routeQuality() {
  let q = 0;
  S.conn.route.forEach(ip => {
    const s = srv(ip);
    if (!s) return;
    let w = HOP_WEIGHT[s.type] !== undefined ? HOP_WEIGHT[s.type] : 0.35;
    /* um salto cujo log você já apagou antes é conhecido e um pouco
       menos eficaz: os investigadores já sabem olhar para ele */
    if (s.burned) w *= 0.75;
    q += w;
  });
  return q;
}

/* Duração do trace ativo, em segundos reais. */
export function estimateTrace(targetIp) {
  const t = srv(targetIp);
  if (!t) return 0;
  const base = t.traceBase * (0.6 + routeQuality());
  return Math.max(12, Math.round(base / heatFactor()));
}

/* =========================================================
   CONECTAR
   ========================================================= */
export function connect() {
  if (S.over) return 'A partida acabou.';
  if (S.conn.live) return 'Já existe uma conexão ativa.';
  const ip = S.conn.target;
  if (!ip) return 'Nenhum alvo definido.';
  const target = srv(ip);
  if (!target) return 'IP inválido ou servidor inexistente.';
  if (S.conn.route.includes(ip)) return 'O alvo não pode estar na própria rota de bounce.';

  /* a trilha: gateway -> hop1 -> ... -> alvo. Cada máquina grava
     de onde a conexão veio. É essa cadeia que o trace passivo segue. */
  const chain = ['GATEWAY'].concat(S.conn.route).concat([ip]);
  const trail = [];
  for (let i = 1; i < chain.length; i++) {
    const here = chain[i];
    const prev = chain[i - 1];
    const s = srv(here);
    if (!s) continue;
    const fromIP = prev === 'GATEWAY' ? playerIP() : prev;
    const isTarget = (i === chain.length - 1);
    const log = makeLog(R, S.time,
      isTarget ? 'Conexão recebida de ' + fromIP
        : 'Roteamento: ' + fromIP + ' → ' + chain[i + 1],
      'route');
    log.fromIP = fromIP;
    s.logs.unshift(log);
    trail.push({ ip: here, logId: log.id });
  }

  resetSession(target);
  S.conn.live = true;
  S.conn.trail = trail;
  S.conn.illegal = false;
  S.conn.startedAt = S.time;
  S.conn.trace = null;
  S.conn.bounceIndex = 0;
  S.conn.screen = firstScreen(target);
  S.conn.lan = target.lan ? { at: target.lan.entry } : null;
  bump('hacks');

  Bus.emit(EV.CONNECT_BEGIN, {
    route: S.conn.route.slice(), targetIp: ip,
    hops: chain.slice(1).map(h => {
      const s = srv(h);
      return s ? { ip: s.ip, name: s.name, lat: s.lat, lon: s.lon } : { ip: h };
    })
  });
  /* os saltos são anunciados um a um para a UI e o mapa animarem */
  S.conn.route.forEach((hopIp, idx) => {
    const s = srv(hopIp);
    Bus.emit(EV.HOP_REACHED, {
      index: idx, ip: hopIp, name: s ? s.name : hopIp,
      lat: s ? s.lat : 0, lon: s ? s.lon : 0
    });
  });
  Bus.emit(EV.CONNECT_OPEN, { server: serverView(target) });
  Bus.emit(EV.SFX, { name: 'dial' });
  return null;
}

export function firstScreen(server) {
  if (server.sec.pass) return 'login';
  if (server.type === 'bank') return 'bank_login';
  if (server.lan) return 'lan';
  return server.screens[0];
}

/* Retrato do servidor para quem está do outro lado do barramento. */
export function serverView(server) {
  if (!server) return null;
  return {
    ip: server.ip, name: server.name, type: server.type, city: server.city,
    lat: server.lat, lon: server.lon, notes: server.notes,
    sec: { proxy: server.sec.proxy, firewall: server.sec.firewall, monitor: server.sec.monitor },
    hasLan: !!server.lan, screens: server.screens.slice()
  };
}

/* =========================================================
   DESCONECTAR
   ========================================================= */
export function disconnect(silent) {
  if (!S.conn.live) return;
  const wasIllegal = S.conn.illegal;
  const hadTrace = !!S.conn.trace;
  const trail = S.conn.trail || [];
  const target = srv(S.conn.target);

  S.tasks = [];
  S.conn.live = false;
  S.conn.trace = null;
  S.conn.screen = null;
  S.conn.lan = null;
  if (target) resetSession(target);
  if (hadTrace) bump('tracesEscaped');

  /* trace passivo: só nasce se houve ação ilegal em máquina monitorada */
  if (wasIllegal && target && target.sec.monitor > 0) {
    const delayHours = 3 + R() * 9;
    S.passive.push({
      id: R.uid('pt'),
      due: S.time + delayHours * 60,
      trail: trail.map(t => ({ ip: t.ip, logId: t.logId })),
      targetIp: target.ip,
      targetName: target.name
    });
  }

  Bus.emit(EV.TRACE_END, { caught: false });
  Bus.emit(EV.CONNECT_CLOSE, { illegal: wasIllegal, escaped: hadTrace });
  if (!silent) {
    Bus.emit(EV.UI_TOAST, {
      text: hadTrace ? 'Conexão encerrada — trace cancelado.' : 'Conexão encerrada.',
      kind: wasIllegal ? 'warn' : ''
    });
  }
}

/* =========================================================
   AÇÃO ILEGAL E MONITOR
   ========================================================= */
export function illegal(server, weight) {
  if (!S.conn.live) return;
  S.conn.illegal = true;
  addNeuro(weight || 0);
  if (weight) addHeat(weight * 0.15);
  if (!server || server.sec.monitor <= 0) return;
  if (server.st.monFooled) return;
  if (S.conn.trace) return;

  const total = estimateTrace(server.ip);
  S.conn.trace = { total: total, left: total, started: S.time, source: server.ip };
  Bus.emit(EV.ALARM, { ip: server.ip, name: server.name, seconds: total });
  Bus.emit(EV.TRACE_START, { seconds: total, total: total, ip: server.ip, name: server.name });
  Bus.emit(EV.UI_TOAST, { text: 'MONITOR ATIVO DETECTOU INTRUSÃO — trace iniciado', kind: 'bad' });
}

/* =========================================================
   TICK — tempo real, nunca acelerado
   ========================================================= */
export function tick(dtReal) {
  if (S.over) return;

  if (S.conn.live && S.conn.trace) {
    const tr = S.conn.trace;
    tr.left -= dtReal;
    if (tr.left <= 0) { busted(); return; }
    Bus.emit(EV.TRACE_TICK, {
      remaining: tr.left, total: tr.total,
      pct: 100 - (tr.left / tr.total) * 100
    });
  }

  for (let i = S.passive.length - 1; i >= 0; i--) {
    const pt = S.passive[i];
    if (S.time >= pt.due) {
      S.passive.splice(i, 1);
      resolvePassive(pt);
    }
  }
}

/* =========================================================
   TRACE PASSIVO
   Percorre a trilha do alvo para trás. Um único log apagado ou
   reescrito mata a pista. Se a cadeia inteira sobreviver, chegam
   até o seu gateway — e você nem precisa estar conectado.
   ========================================================= */
export function resolvePassive(pt) {
  const trail = pt.trail || [];
  let reached = 0;
  for (let i = trail.length - 1; i >= 0; i--) {
    const hop = trail[i];
    const s = srv(hop.ip);
    if (!s) break;
    const log = s.logs.find(l => l.id === hop.logId);
    if (!log || log.deleted || log.modified) break;   /* a pista morre aqui */
    if (s.type !== 'test') s.burned = true;           /* o salto ficou marcado */
    reached++;
  }
  const full = trail.length > 0 && reached === trail.length;

  if (full) {
    S.flags.busts = (S.flags.busts || 0) + 1;
    const fine = Math.round(2000 + S.points * 60 + R.int(0, 3000));
    Bank.pay(-fine, 'Multa judicial — invasão rastreada');
    addPoints(-2, 'invasão rastreada');
    addHeat(6);
    News.report('arrest_attempt', { target: pt.targetName });
    addEmail({
      from: 'legal@uplink.net',
      subj: 'AVISO ' + S.flags.busts + '/3 — Você foi rastreado',
      kind: 'legal',
      body:
        'A invasão ao servidor ' + pt.targetName + ' foi rastreada até o seu gateway.\n' +
        'Os logs da rota permaneceram intactos e a trilha levou até você.\n\n' +
        'Multa aplicada: ' + F.credits(fine) + '\n' +
        'Rating Uplink reduzido em 2 pontos.\n\n' +
        'Apague os logs de TODOS os servidores da rota, incluindo o alvo,\n' +
        'antes de desconectar. Um único elo quebrado basta.\n\n' +
        'Aviso ' + S.flags.busts + ' de 3. Na terceira, sua licença será revogada.'
    });
    Bus.emit(EV.TRACE_PASSIVE, { caught: true, warnings: S.flags.busts, fine: fine, target: pt.targetName });
    Bus.emit(EV.UI_TOAST, { text: 'Você foi rastreado! Multa de ' + F.credits(fine), kind: 'bad' });

    if (S.flags.busts >= 3) {
      News.report('arrest', { handle: S.handle });
      gameOver('LICENÇA REVOGADA',
        'Três invasões rastreadas até o seu gateway.\n\n' +
        'A Uplink Corporation encerrou seu contrato e entregou seus dados\n' +
        'às autoridades. O hardware foi confiscado ainda de madrugada.\n\n' +
        'Handle queimado: ' + S.handle + '\n' +
        'Rating final: ' + ratingName() + '\n' +
        'Créditos: ' + F.credits(S.credits), 'revoked');
    }
  } else if (reached > 0) {
    addEmail({
      from: 'internal@uplink.net',
      subj: 'Trace passivo interrompido',
      body:
        'Um trace foi iniciado a partir de ' + pt.targetName + '.\n' +
        'A trilha morreu depois de ' + reached + ' salto(s) — os registros\n' +
        'seguintes já haviam sido apagados.\n\nVocê está limpo. Desta vez.'
    });
    Bus.emit(EV.TRACE_PASSIVE, { caught: false, reached: reached, target: pt.targetName });
  }
}

/* =========================================================
   PEGO EM FLAGRANTE
   ========================================================= */
export function busted() {
  const t = srv(S.conn.target);
  S.conn.live = false;
  S.conn.trace = null;
  S.tasks = [];
  Bus.emit(EV.TRACE_END, { caught: true });
  Bus.emit(EV.CONNECT_CLOSE, { illegal: true, escaped: false });
  News.report('arrest', { handle: S.handle });
  gameOver('TRACE COMPLETO',
    'O trace de ' + (t ? t.name : 'um alvo desconhecido') + ' chegou ao fim.\n\n' +
    'Sua localização física foi identificada em tempo real. Agentes federais\n' +
    'apreenderam o gateway antes que você conseguisse desconectar.\n\n' +
    'Handle: ' + S.handle + '\n' +
    'Rating: ' + ratingName() + ' (' + S.points + ' pts)\n' +
    'Contratos concluídos: ' + S.missions.done.length + '\n' +
    'Créditos perdidos: ' + F.credits(S.credits) + '\n\n' +
    'Regra número um: sempre saiba quanto tempo você tem.', 'busted');
}

/* =========================================================
   LOGS
   ========================================================= */
export function deleteLog(server, logId) {
  const l = server.logs.find(x => x.id === logId);
  if (!l) return false;
  if (!l.deleted && !l.recover) l.recover = l.txt;
  l.deleted = true;
  l.txt = '<registro apagado>';
  bump('logsWiped');
  Bus.emit(EV.LOG_CHANGED, { ip: server.ip, id: logId, action: 'delete' });
  return true;
}

export function modifyLog(server, logId) {
  const l = server.logs.find(x => x.id === logId);
  if (!l) return false;
  if (!l.recover) l.recover = l.txt;
  l.modified = true;
  l.deleted = false;
  l.txt = 'Conexão de ' + randIP(R) + ' — rotina';
  bump('logsWiped');
  Bus.emit(EV.LOG_CHANGED, { ip: server.ip, id: logId, action: 'modify' });
  return true;
}

export function undeleteLogs(server) {
  let n = 0;
  server.logs.forEach(l => {
    if ((l.deleted || l.modified) && l.recover) {
      l.deleted = false; l.modified = false; l.txt = l.recover; n++;
    }
  });
  return n;
}

export function visibleLogs(server, limit) {
  return server.logs.slice(0, limit || 40);
}

/* =========================================================
   PERMISSÕES DERIVADAS
   O firewall barra leitura, o proxy barra escrita, e uma LAN
   barra tudo enquanto você não chegar ao sistema central.
   ========================================================= */
export function canRead(server) {
  if (!server) return false;
  if (server.sec.pass && !server.st.logged) return false;
  if (server.sec.firewall > 0 && !server.st.fwDown) return false;
  if (server.lan && !LAN.reachedSystem(server)) return false;
  return true;
}
export function canWrite(server) {
  if (!server) return false;
  if (server.sec.pass && !server.st.logged) return false;
  if (server.sec.proxy > 0 && !server.st.proxyDown) return false;
  if (server.lan && !LAN.reachedSystem(server)) return false;
  return true;
}

/* Motivo legível para a interface explicar o bloqueio. */
export function readBlock(server) {
  if (!server) return 'Sem conexão.';
  if (server.sec.pass && !server.st.logged) return 'Acesso negado: faça login.';
  if (server.sec.firewall > 0 && !server.st.fwDown) return 'Firewall ativo: leitura bloqueada.';
  if (server.lan && !LAN.reachedSystem(server)) return 'Você ainda não chegou ao sistema central da rede interna.';
  return null;
}
export function writeBlock(server) {
  if (!server) return 'Sem conexão.';
  if (server.sec.pass && !server.st.logged) return 'Acesso negado: faça login.';
  if (server.sec.proxy > 0 && !server.st.proxyDown) return 'Proxy ativo: escrita e deleção bloqueadas.';
  if (server.lan && !LAN.reachedSystem(server)) return 'Você ainda não chegou ao sistema central da rede interna.';
  return null;
}

/* =========================================================
   LOGIN MANUAL (digitar a senha)
   ========================================================= */
export function login(server, password, admin) {
  if (!server) return 'Sem conexão.';
  const want = admin ? server.sec.admin : server.sec.pass;
  if (!want) return admin ? 'Não há conta administrativa aqui.' : 'Este sistema não pede senha.';
  if (String(password) !== want) {
    logHit(server, 'Falha de autenticação a partir de ' + playerIP(), 'sys');
    return 'Senha incorreta.';
  }
  server.st.logged = true;
  if (admin) server.st.admin = true;
  S.conn.screen = server.lan ? 'lan' : server.screens[0];
  Bus.emit(EV.BREACH, { layer: admin ? 'admin' : 'password', level: 1, ip: server.ip });
  return null;
}

/* =========================================================
   CONSOLE ADMINISTRATIVO
   ========================================================= */
export function consoleExec(server, cmd) {
  const out = [];
  const say = t => out.push(t);
  const parts = String(cmd || '').trim().split(/\s+/);
  const c = (parts[0] || '').toLowerCase();

  switch (c) {
    case '': break;
    case 'help':
      say('Comandos disponíveis:');
      say('  ls              lista os arquivos do sistema');
      say('  cat <arquivo>   exibe o conteúdo (se não estiver criptografado)');
      say('  delete <arq>    apaga um arquivo');
      say('  delete all      apaga TODOS os arquivos do sistema');
      say('  users           lista as contas do sistema');
      say('  logs            resumo do log server');
      say('  shutdown        derruba o servidor');
      break;
    case 'ls':
      if (!server.files.length) say('(vazio)');
      server.files.forEach(f => say('  ' + f.name + '  ' + F.size(f.size) +
        (f.enc ? '  [cripto ' + f.enc + ']' : '')));
      break;
    case 'cat': {
      const f = server.files.find(x => x.name.toLowerCase() === (parts[1] || '').toLowerCase());
      if (!f) { say('arquivo não encontrado'); break; }
      if (f.enc) { say('erro: arquivo criptografado (nível ' + f.enc + ')'); break; }
      say(f.body || '<dados binários ilegíveis neste terminal>');
      break;
    }
    case 'delete': {
      const block = writeBlock(server);
      if (block) { say('erro: ' + block.toLowerCase()); break; }
      if ((parts[1] || '').toLowerCase() === 'all') {
        const n = server.files.length;
        illegal(server, 4);
        server.files.length = 0;
        logHit(server, 'ALERTA CRÍTICO: exclusão em massa — ' + n + ' arquivos');
        bump('filesDeleted', n);
        say(n + ' arquivos removidos.');
        say('AVISO: exclusão em massa registrada no log do sistema.');
        News.report('destroy', { target: server.name });
        Bus.emit(EV.FILE_CHANGED, { ip: server.ip, action: 'wipe', count: n });
        break;
      }
      const idx = server.files.findIndex(x => x.name.toLowerCase() === (parts[1] || '').toLowerCase());
      if (idx < 0) { say('arquivo não encontrado'); break; }
      illegal(server, 2);
      say('removido: ' + server.files[idx].name);
      logHit(server, 'Arquivo removido: ' + server.files[idx].name);
      server.files.splice(idx, 1);
      bump('filesDeleted');
      Bus.emit(EV.FILE_CHANGED, { ip: server.ip, action: 'delete' });
      break;
    }
    case 'users':
      say('  root          (bloqueado)');
      say('  admin         último acesso: ' + F.fmtDate(S.time - R.int(60, 4000)));
      say('  operador      último acesso: ' + F.fmtDate(S.time - R.int(60, 20000)));
      say('  backup        conta de serviço');
      break;
    case 'logs':
      say('  registros armazenados: ' + server.logs.length);
      say('  apagados            : ' + server.logs.filter(l => l.deleted).length);
      say('  reescritos          : ' + server.logs.filter(l => l.modified).length);
      break;
    case 'shutdown': {
      const block = writeBlock(server);
      if (block) { say('erro: ' + block.toLowerCase()); break; }
      illegal(server, 4);
      logHit(server, 'ALERTA CRÍTICO: desligamento remoto solicitado');
      say('sistema entrando em desligamento... conexão perdida.');
      News.report('destroy', { target: server.name });
      disconnect(true);
      break;
    }
    default:
      say('comando desconhecido: ' + c + '  (tente "help")');
  }
  return out;
}

/* =========================================================
   VARREDURA REMOTA (IP_Probe)
   ========================================================= */
export function probeView(server) {
  if (!server) return null;
  const lvl = server.probed || 0;
  if (!lvl) return null;
  const view = {
    ip: server.ip, name: server.name,
    proxy: server.sec.proxy, firewall: server.sec.firewall, monitor: server.sec.monitor,
    hasPassword: !!server.sec.pass, hasLan: !!server.lan
  };
  if (lvl >= 2) view.traceEstimate = estimateTrace(server.ip);
  if (lvl >= 3) view.files = server.files.length;
  return view;
}

/* Diretório público do InterNIC. */
export function directory() {
  return Object.values(S.world.servers)
    .filter(s => s.publicList)
    .map(s => ({ ip: s.ip, name: s.name, type: s.type, city: s.city }));
}
