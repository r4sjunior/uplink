/* =========================================================
   state.js — o estado do jogo e os acessos de baixo nível.

   Regras desta camada:
   - TUDO aqui é serializável em JSON. Nenhuma função, nenhuma
     referência circular, nenhum objeto de DOM. É por isso que as
     tarefas de software são dados puros e não closures.
   - O estado é único e vive em `S`. Os módulos importam `S` e
     enxergam sempre a versão corrente (binding vivo do ESM).
   ========================================================= */
import { attachRNG, hashString } from './rng.js';
import { Bus, EV } from './bus.js';
import * as D from './data.js';

/* O relógio conta minutos desde 2010-01-01 00:00 UTC.
   1826 dias depois = 2015-01-01 08:00, onde a partida começa. */
export const START_TIME = 1826 * 24 * 60 + 8 * 60;

export const SAVE_VERSION = 3;

/* --------- o estado, em binding vivo --------- */
export let S = emptyState();

/* fluxo aleatório de tempo de execução: o estado dele mora em S.rng,
   então o save preserva a sequência exata dos sorteios futuros */
export const R = attachRNG({ get rng() { return S.rng; }, set rng(v) { S.rng = v; } }, 'rng');

export function setState(next) { S = next; return S; }

export function emptyState() {
  return {
    version: SAVE_VERSION,
    seed: 0,
    rng: 1,
    handle: '',
    playerIP: '0.0.0.0',
    time: START_TIME,
    speed: 1,
    started: false,
    over: false,
    overInfo: null,

    credits: 0,
    points: 0,
    neuroPoints: 0,

    gateway: { id: 'gw1', cpus: ['cpu60'], mems: ['mem16'], modem: 'md1' },
    software: [],
    memory: [],
    links: [],
    email: [],
    missions: { available: [], active: [], done: [], failed: 0 },
    bank: null,
    loans: [],

    conn: newConn(),
    tasks: [],
    passive: [],
    news: [],
    newsQueue: [],
    /* conteúdo das redes sociais, gerado sob demanda e memorizado:
       só entra no save o que o jogador realmente visitou */
    social: {},
    socialDM: {},
    story: null,
    flags: {},
    stats: {
      hacks: 0, filesCopied: 0, filesDeleted: 0, logsWiped: 0,
      moneyStolen: 0, missionsDone: 0, missionsFailed: 0, tracesEscaped: 0
    },
    /* calor: o quanto o mundo está com medo de você (0..100).
       Sobe com fama e crimes; empurra a segurança dos alvos para cima. */
    heat: 0,
    world: null
  };
}

export function newConn() {
  return {
    route: [], target: null, live: false, screen: null,
    /* discagem em andamento; null quando não há */
    dial: null,
    trace: null, trail: [], illegal: false, startedAt: 0,
    bounceIndex: 0, lan: null
  };
}

/* =========================================================
   ACESSO AO MUNDO
   ========================================================= */
export function srv(ip) { return (S.world && S.world.servers[ip]) || null; }
export function servers() { return S.world ? Object.values(S.world.servers) : []; }
export function person(id) { return S.world ? S.world.people.find(p => p.id === id) : null; }
export function corp(id) { return S.world ? S.world.corps.find(c => c.id === id) : null; }
export function corpByName(name) { return S.world ? S.world.corps.find(c => c.name === name) : null; }

/* estado de sessão de um servidor: some ao desconectar */
export function resetSession(s) {
  if (!s) return;
  s.st = {
    logged: false, admin: false, proxyDown: false, fwDown: false,
    monFooled: false, voiceOk: false, loops: {}, lan: null
  };
}

/* =========================================================
   RATINGS
   ========================================================= */
export function ratingIndex() {
  let idx = 0;
  for (let i = 0; i < D.RATING_POINTS.length; i++) if (S.points >= D.RATING_POINTS[i]) idx = i;
  return idx;
}
export function ratingName() { return D.UPLINK_RATINGS[ratingIndex()]; }
export function nextRatingPoints() {
  const i = ratingIndex();
  return i + 1 < D.RATING_POINTS.length ? D.RATING_POINTS[i + 1] : null;
}
export function neuroIndex() {
  let idx = 0;
  for (let i = 0; i < D.NEURO_POINTS.length; i++) if (S.neuroPoints >= D.NEURO_POINTS[i]) idx = i;
  return idx;
}
export function neuroName() { return D.NEURO_RATINGS[neuroIndex()]; }

export function addPoints(n, reason) {
  const before = ratingIndex();
  S.points = Math.max(0, S.points + n);
  const after = ratingIndex();
  Bus.emit(EV.RATING, {
    points: S.points, index: after, name: ratingName(),
    delta: n, promoted: after > before, demoted: after < before, reason: reason || ''
  });
  if (after > before) {
    addEmail({
      from: 'internal@uplink.net',
      subj: 'Promoção de rating: ' + D.UPLINK_RATINGS[after],
      body:
        'Agente ' + S.handle + ',\n\n' +
        'Seu desempenho foi revisado. Novo rating Uplink: ' +
        D.UPLINK_RATINGS[after] + '.\n\n' +
        'Contratos de maior valor passam a aparecer no quadro. A segurança dos\n' +
        'alvos também sobe — e o pessoal do outro lado agora sabe seu nome.\n\n' +
        '— Uplink Internal Services'
    });
  }
  return S.points;
}

export function addNeuro(n) {
  if (!n) return;
  S.neuroPoints = Math.max(0, S.neuroPoints + n);
}

/* =========================================================
   SOFTWARE INSTALADO
   ========================================================= */
export function swVersion(id) {
  const s = S.software.find(x => x.id === id);
  return s ? s.v : 0;
}
export function hasSw(id, minv) {
  const s = S.software.find(x => x.id === id);
  if (!s) return null;
  if (minv && s.v < minv) return null;
  return s;
}
export function addSw(id, v) {
  const ex = S.software.find(x => x.id === id);
  if (ex) { ex.v = Math.max(ex.v, v); return ex; }
  const rec = { id: id, v: v };
  S.software.push(rec);
  return rec;
}
export function removeSw(id) {
  const i = S.software.findIndex(x => x.id === id);
  if (i >= 0) S.software.splice(i, 1);
}

/* =========================================================
   MEMÓRIA DO GATEWAY
   ========================================================= */
export function memTotal() {
  return S.gateway.mems.reduce((sum, id) => sum + (D.MEM_BY_ID[id] ? D.MEM_BY_ID[id].size : 0), 0);
}
export function memUsed() {
  const sw = S.software.reduce((sum, x) => sum + (D.SW_BY_ID[x.id] ? D.SW_BY_ID[x.id].size : 1), 0);
  const fl = S.memory.reduce((sum, f) => sum + f.size, 0);
  return sw + fl;
}
export function memFree() { return memTotal() - memUsed(); }

export function storeFile(file, srcIp) {
  if (memFree() < file.size) return false;
  S.memory.push({
    id: R.uid('m'), fileId: file.id, name: file.name, size: file.size,
    enc: file.enc, kind: file.kind, body: file.body || null, src: srcIp,
    takenAt: S.time
  });
  return true;
}
export function deleteMem(id) {
  const i = S.memory.findIndex(f => f.id === id);
  if (i >= 0) { S.memory.splice(i, 1); return true; }
  return false;
}
export function findMem(id) { return S.memory.find(f => f.id === id) || null; }

/* =========================================================
   E-MAIL
   ========================================================= */
export function addEmail(m) {
  const rec = {
    id: R.uid('e'),
    from: m.from, to: m.to || null,
    subj: m.subj, body: m.body,
    attach: m.attach || null,
    t: S.time,
    read: m.read !== undefined ? m.read : false,
    mission: m.mission || null,
    kind: m.kind || 'mail'
  };
  S.email.unshift(rec);
  if (S.email.length > 200) S.email.length = 200;
  Bus.emit(EV.EMAIL_NEW, rec);
  return rec;
}
export function markRead(id) {
  const e = S.email.find(x => x.id === id);
  if (e) e.read = true;
  return !!e;
}
export function unreadCount() { return S.email.filter(e => !e.read && e.kind !== 'sent').length; }

/* =========================================================
   LINKS
   ========================================================= */
export function addLink(ip) {
  if (!ip || S.links.includes(ip)) return false;
  S.links.push(ip);
  Bus.emit(EV.LINK_NEW, { ip: ip, name: srv(ip) ? srv(ip).name : ip });
  return true;
}
export function removeLink(ip) {
  const i = S.links.indexOf(ip);
  if (i >= 0) { S.links.splice(i, 1); return true; }
  return false;
}

/* =========================================================
   BANDEIRAS E ESTATÍSTICAS
   ========================================================= */
export function flag(k, v) {
  if (v === undefined) return S.flags[k];
  S.flags[k] = v;
  return v;
}
export function bump(stat, n) {
  S.stats[stat] = (S.stats[stat] || 0) + (n === undefined ? 1 : n);
  return S.stats[stat];
}

/* Calor global. Empurra a segurança do mundo e a chance de investigação. */
export function addHeat(n) {
  S.heat = Math.max(0, Math.min(100, S.heat + n));
  return S.heat;
}
export function heatFactor() { return 1 + S.heat / 140; }

/* Semente estável derivada do mundo — para coisas que precisam ser
   iguais sempre que forem recalculadas (ex.: IP do jogador). */
export function stableSeed(label) {
  return (hashString(label) ^ Math.imul(S.seed >>> 0, 0x9E3779B1)) >>> 0;
}

/* =========================================================
   FIM DE JOGO
   Fica aqui (e não em game.js) porque net.js e missions.js
   precisam encerrar a partida sem importar a fachada.
   ========================================================= */
export function gameOver(title, text, kind) {
  if (S.over) return;
  S.over = true;
  S.speed = 0;
  S.conn = newConn();
  S.tasks = [];
  S.overInfo = {
    title: title, text: text, kind: kind || 'busted',
    at: S.time, handle: S.handle,
    rating: ratingName(), points: S.points, credits: S.credits,
    missions: S.missions.done.length
  };
  Bus.emit(EV.GAME_OVER, S.overInfo);
}
