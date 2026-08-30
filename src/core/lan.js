/* =========================================================
   lan.js — redes internas.

   Alvos avançados não são uma máquina só: são uma rede com
   roteador de borda, hubs, terminais, trancas, servidores de
   autenticação e isoladores. Você entra pelo roteador, mapeia o
   que consegue enxergar e atravessa até o sistema central — que é
   onde os arquivos realmente estão.

   O que é permanente (mapa descoberto, equipamentos sondados) mora
   nos nós e vai para o save. O que é de sessão (trancas abertas,
   credenciais falsificadas, isolamento disparado) mora em
   `server.st` e some quando você desconecta.
   ========================================================= */
import * as D from './data.js';
import { S } from './state.js';
import { Bus, EV } from './bus.js';
import { logHit } from './entities.js';

/* =========================================================
   GERAÇÃO
   size 1..3 controla a profundidade e a quantidade de obstáculos.
   ========================================================= */
export function generate(rng, opts) {
  const size = opts.size || 2;
  const depth = 2 + size;                      /* níveis de profundidade */
  const nodes = [];
  let n = 0;
  const mk = (kind, level, tier) => {
    const node = {
      id: 'n' + (n++),
      kind: kind,
      level: level,
      tier: tier,
      name: nameFor(kind, rng, n),
      links: [],
      discovered: false,
      probed: false
    };
    nodes.push(node);
    return node;
  };

  const link = (a, b) => {
    if (!a.links.includes(b.id)) a.links.push(b.id);
    if (!b.links.includes(a.id)) b.links.push(a.id);
  };

  /* borda: o roteador é sempre o ponto de entrada e já vem visível */
  const router = mk('router', 1, 0);
  router.discovered = true;
  router.probed = true;

  let frontier = [router];
  for (let tier = 1; tier <= depth; tier++) {
    const width = tier === depth ? 1 : rng.int(1, tier === 1 ? 3 : 2);
    const next = [];
    for (let i = 0; i < width; i++) {
      let kind;
      if (tier === depth) kind = 'system';
      else if (tier === 1) kind = rng.weighted([['hub', 3], ['terminal', 2], ['auth', size]]);
      else kind = rng.weighted([
        ['hub', 2], ['terminal', 2], ['lock', 1 + size],
        ['auth', size], ['isolator', size - 1 + 1], ['logserv', tier === 2 ? 2 : 0]
      ]);
      const node = mk(kind, Math.min(5, Math.max(1, tier + size - 2 + rng.int(0, 1))), tier);
      link(rng.pick(frontier), node);
      next.push(node);
    }
    /* uma trança extra deixa o mapa menos linear */
    if (next.length > 1 && rng.chance(0.4)) link(next[0], next[next.length - 1]);
    frontier = next;
  }

  /* garante exatamente um servidor de logs e um sistema central */
  if (!nodes.some(x => x.kind === 'logserv')) {
    const cand = nodes.filter(x => x.kind === 'hub' || x.kind === 'terminal');
    if (cand.length) cand[cand.length - 1].kind = 'logserv';
  }
  const systems = nodes.filter(x => x.kind === 'system');
  const systemId = systems.length ? systems[systems.length - 1].id : nodes[nodes.length - 1].id;
  nodes.forEach(x => { if (x.kind === 'system' && x.id !== systemId) x.kind = 'terminal'; });

  /* posições em uma malha simples — a UI e o mapa 3D desenham com isto */
  const byTier = {};
  nodes.forEach(x => { (byTier[x.tier] = byTier[x.tier] || []).push(x); });
  Object.keys(byTier).forEach(t => {
    const list = byTier[t];
    list.forEach((x, i) => {
      x.gx = Number(t);
      x.gy = i - (list.length - 1) / 2;
    });
  });

  return {
    nodes: nodes,
    entry: router.id,
    systemId: systemId,
    depth: depth,
    scanned: false
  };
}

function nameFor(kind, rng, i) {
  const tag = String(i).padStart(2, '0');
  switch (kind) {
    case 'router': return 'ROUTER-BORDA';
    case 'hub': return 'HUB-' + tag;
    case 'terminal': return 'WS-' + tag;
    case 'lock': return 'LOCK-' + tag;
    case 'auth': return 'AUTH-' + tag;
    case 'isolator': return 'ISO-' + tag;
    case 'logserv': return 'LOGSRV-' + tag;
    case 'system': return 'CORE-SYSTEM';
    default: return 'DEV-' + tag;
  }
}

/* =========================================================
   ESTADO DE SESSÃO
   ========================================================= */
export function session(server) {
  if (!server.st.lan) {
    server.st.lan = { at: server.lan ? server.lan.entry : null, open: {}, spoofed: {}, iso: {}, reached: false };
  }
  return server.st.lan;
}

export function node(server, id) {
  if (!server.lan) return null;
  return server.lan.nodes.find(x => x.id === id) || null;
}

export function current(server) {
  const ses = session(server);
  return node(server, ses.at);
}

export function reachedSystem(server) {
  if (!server.lan) return true;             /* sem LAN, acesso direto */
  return session(server).reached === true;
}

/* =========================================================
   VARREDURA
   Revela os vizinhos do nó atual (e mais um anel a cada versão).
   ========================================================= */
export function scan(server, version) {
  if (!server.lan) return { erro: 'Este alvo não tem rede interna.' };
  const ses = session(server);
  const start = node(server, ses.at);
  if (!start) return { erro: 'Nenhum equipamento sob controle.' };

  const rings = Math.max(1, version || 1);
  let frontier = [start];
  const seen = new Set([start.id]);
  const found = [];
  for (let r = 0; r < rings; r++) {
    const next = [];
    for (const nd of frontier) {
      for (const id of nd.links) {
        if (seen.has(id)) continue;
        seen.add(id);
        const target = node(server, id);
        if (!target) continue;
        if (!target.discovered) { target.discovered = true; found.push(target); }
        next.push(target);
      }
    }
    frontier = next;
  }
  server.lan.scanned = true;
  Bus.emit(EV.LAN_SCAN, { ip: server.ip, found: found.length, nodes: mapView(server) });
  return { ok: true, found: found.length };
}

/* Sonda um equipamento: revela função e nível. */
export function probe(server, nodeId, version) {
  const nd = node(server, nodeId);
  if (!nd) return { erro: 'Equipamento desconhecido.' };
  if (!nd.discovered) return { erro: 'Este equipamento ainda não foi mapeado.' };
  if (version < Math.ceil(nd.level / 2)) {
    return { erro: 'LAN_Probe v' + Math.ceil(nd.level / 2) + ' ou superior para sondar ' + nd.name + '.' };
  }
  nd.probed = true;
  Bus.emit(EV.LAN_PROBE, { ip: server.ip, node: viewOf(nd) });
  return { ok: true, node: viewOf(nd) };
}

/* =========================================================
   MOVIMENTAÇÃO
   ========================================================= */
export function canEnter(server, nd) {
  const ses = session(server);
  if (nd.kind === 'lock' && !ses.open[nd.id]) {
    return 'A tranca ' + nd.name + ' está fechada. Use LAN_Force ou a chave de um terminal.';
  }
  if (nd.kind === 'auth' && !ses.spoofed[nd.id]) {
    return 'O servidor ' + nd.name + ' exige credencial de máquina. Use LAN_Spoof.';
  }
  if (ses.iso[nd.id] && ses.iso[nd.id] > S.time) {
    return nd.name + ' está isolado da rede por mais alguns minutos.';
  }
  return null;
}

export function move(server, nodeId) {
  if (!server.lan) return { erro: 'Este alvo não tem rede interna.' };
  const ses = session(server);
  const from = node(server, ses.at);
  const to = node(server, nodeId);
  if (!to) return { erro: 'Equipamento desconhecido.' };
  if (!to.discovered) return { erro: 'Equipamento ainda não mapeado. Rode LAN_Scan.' };
  if (from && !from.links.includes(to.id)) {
    return { erro: 'Não há caminho direto de ' + from.name + ' para ' + to.name + '.' };
  }
  const block = canEnter(server, to);
  if (block) return { erro: block };

  ses.at = to.id;
  if (to.kind === 'hub') logHit(server, 'Tráfego anômalo ecoado pelo ' + to.name, 'alert');
  if (to.id === server.lan.systemId) {
    ses.reached = true;
    logHit(server, 'Sessão administrativa aberta no ' + to.name, 'alert');
  }
  Bus.emit(EV.LAN_MOVE, { ip: server.ip, node: viewOf(to), reached: ses.reached });
  return { ok: true, node: viewOf(to), reached: ses.reached };
}

/* =========================================================
   ARROMBAMENTO E FALSIFICAÇÃO
   ========================================================= */
export function force(server, nodeId, version) {
  const nd = node(server, nodeId);
  const ses = session(server);
  if (!nd) return { erro: 'Equipamento desconhecido.' };
  if (nd.kind !== 'lock') return { erro: nd.name + ' não é uma tranca.' };
  if (version < nd.level) {
    return { erro: 'Tranca nível ' + nd.level + ' exige LAN_Force v' + nd.level + '.' };
  }
  ses.open[nd.id] = true;
  logHit(server, 'ALERTA: arrombamento detectado em ' + nd.name, 'alert');

  /* barulho: todo isolador vizinho dispara e corta a subrede por 4 min */
  let isolated = 0;
  for (const id of nd.links) {
    const nb = node(server, id);
    if (nb && nb.kind === 'isolator') {
      ses.iso[nb.id] = S.time + 4;
      isolated++;
    }
  }
  if (isolated) {
    Bus.emit(EV.LAN_ISOLATE, { ip: server.ip, count: isolated });
    logHit(server, 'Isolamento automático acionado em ' + isolated + ' segmento(s)', 'alert');
  }
  Bus.emit(EV.LAN_FORCE, { ip: server.ip, node: viewOf(nd), isolated: isolated });
  return { ok: true, isolated: isolated };
}

export function spoof(server, nodeId, version) {
  const nd = node(server, nodeId);
  const ses = session(server);
  if (!nd) return { erro: 'Equipamento desconhecido.' };
  if (nd.kind !== 'auth') return { erro: nd.name + ' não faz autenticação de máquina.' };
  if (version < nd.level) {
    return { erro: 'Autenticação nível ' + nd.level + ' exige LAN_Spoof v' + nd.level + '.' };
  }
  ses.spoofed[nd.id] = true;
  Bus.emit(EV.LAN_SPOOF, { ip: server.ip, node: viewOf(nd) });
  return { ok: true };
}

/* Um terminal sondado entrega a chave das trancas vizinhas: o caminho
   silencioso, para quem prefere não acordar os isoladores. */
export function useTerminal(server, nodeId) {
  const nd = node(server, nodeId);
  const ses = session(server);
  if (!nd) return { erro: 'Equipamento desconhecido.' };
  if (nd.kind !== 'terminal') return { erro: nd.name + ' não é uma estação de trabalho.' };
  if (ses.at !== nd.id) return { erro: 'Você precisa estar em ' + nd.name + ' para usá-lo.' };
  let opened = 0;
  for (const id of nd.links) {
    const nb = node(server, id);
    if (nb && nb.kind === 'lock' && !ses.open[nb.id]) { ses.open[nb.id] = true; opened++; }
    if (nb && nb.kind === 'isolator') ses.iso[nb.id] = 0;
  }
  if (!opened) return { erro: 'Nenhuma tranca vizinha responde a este terminal.' };
  logHit(server, 'Abertura autorizada pelo terminal ' + nd.name, 'sys');
  return { ok: true, opened: opened };
}

/* =========================================================
   VISÃO PARA A INTERFACE
   ========================================================= */
export function viewOf(nd) {
  return {
    id: nd.id, kind: nd.kind, name: nd.name,
    level: nd.probed ? nd.level : null,
    label: D.LAN_KINDS[nd.kind] ? D.LAN_KINDS[nd.kind].name : nd.kind,
    desc: nd.probed && D.LAN_KINDS[nd.kind] ? D.LAN_KINDS[nd.kind].desc : '',
    probed: nd.probed, gx: nd.gx, gy: nd.gy, links: nd.links.slice()
  };
}

export function mapView(server) {
  if (!server.lan) return [];
  const ses = session(server);
  return server.lan.nodes.filter(n => n.discovered).map(n => {
    const v = viewOf(n);
    v.here = ses.at === n.id;
    v.open = !!ses.open[n.id] || (n.kind !== 'lock' && n.kind !== 'auth') || !!ses.spoofed[n.id];
    return v;
  });
}
