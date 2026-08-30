/* =========================================================
   entities.js — fábricas de entidades simples do mundo.

   Vive à parte de world.js porque net.js, software.js, social.js
   e missions.js também precisam criar arquivos e registros de log
   em tempo de jogo. Manter as fábricas aqui evita import circular
   (world -> social -> net -> world).
   ========================================================= */
import * as D from './data.js';
import { hashString } from './rng.js';
import { S, R } from './state.js';

/* IP plausível. Recebe um rng para poder ser usado na geração
   determinística do mundo e no meio da partida. */
export function randIP(rng) {
  const g = rng || R;
  return g.int(11, 240) + '.' + g.int(0, 255) + '.' + g.int(0, 255) + '.' + g.int(1, 254);
}

export function makePassword(rng, hard) {
  if (!hard && rng.chance(0.22)) return rng.pick(D.COMMON_PASS);
  const n = rng.int(2, 3);
  let s = '';
  for (let i = 0; i < n; i++) s += rng.pick(D.SYLL);
  if (rng.chance(0.5)) s += rng.int(10, 99);
  return s;
}

export function personName(rng) {
  return rng.pick(D.FIRST) + ' ' + rng.pick(D.LAST);
}

export function fileName(rng) {
  return rng.pick(D.FILE_TOPICS) + '-' + rng.pick(D.FILE_CODES) +
    (rng.chance(0.5) ? '-v' + rng.int(1, 9) : '');
}

export function makeFile(rng, opts) {
  const g = rng || R;
  opts = opts || {};
  return {
    id: g.uid('f'),
    name: opts.name || fileName(g),
    size: opts.size || g.int(1, 8),
    enc: opts.enc !== undefined ? opts.enc : (g.chance(0.35) ? g.int(1, 4) : 0),
    kind: opts.kind || 'data',
    body: opts.body || null,
    camId: opts.camId || null,
    tag: opts.tag || null
  };
}

export function makeLog(rng, time, txt, kind) {
  const g = rng || R;
  return {
    id: g.uid('l'),
    t: time,
    txt: txt,
    kind: kind || 'sys',
    deleted: false,
    modified: false,
    recover: null,
    fromIP: null
  };
}

/* Registro de log criado durante a partida, no tempo atual. */
export function logHit(server, txt, kind) {
  if (!server) return null;
  const l = makeLog(R, S.time, txt, kind || 'alert');
  server.logs.unshift(l);
  if (server.logs.length > 120) server.logs.length = 120;
  return l;
}

/* Ruído de fundo: logs plausíveis anteriores à chegada do jogador. */
export function seedLogs(rng, server, now) {
  const n = rng.int(4, 10);
  for (let i = 0; i < n; i++) {
    const t = now - rng.int(60, 60 * 24 * 20);
    const ip = randIP(rng);
    const kinds = [
      'Conexão de ' + ip + ' — rotina',
      'Conexão de ' + ip + ' — acesso administrativo concedido',
      'Backup automático concluído',
      'Usuário ' + personName(rng).split(' ')[0].toLowerCase() + ' efetuou login',
      'Falha de autenticação a partir de ' + ip,
      'Manutenção programada finalizada',
      'Rotação de chaves do certificado interno',
      'Verificação de integridade: nenhum problema encontrado'
    ];
    server.logs.push(makeLog(rng, t, rng.pick(kinds)));
  }
  server.logs.sort((a, b) => b.t - a.t);
}

/* Esqueleto de servidor. Todo servidor do mundo passa por aqui. */
export function baseServer(rng, o) {
  const cityRec = o.city ? (D.CITY_BY_NAME[o.city] || null) : null;
  const fallback = rng.pick(D.CITIES);
  const lat = o.lat !== undefined ? o.lat : (cityRec ? cityRec.lat : fallback[1]);
  const lon = o.lon !== undefined ? o.lon : (cityRec ? cityRec.lon : fallback[2]);
  /* Deslocamento determinístico em torno da cidade.
     Vários servidores compartilham a mesma cidade — Londres sozinha
     hospeda o Uplink IS, o servidor público e a máquina de teste —
     e sem isso eles caem exatamente no mesmo pixel do mapa: ficam
     empilhados, e clicar num seleciona outro. O deslocamento vem do
     endereço, então é sempre o mesmo para o mesmo servidor. */
  const xy = D.geoToXY(lat, lon);
  const semente = hashString(o.ip || o.name || 'x');
  xy.x = Math.min(0.995, Math.max(0.005, xy.x + (((semente >>> 0) % 1000) / 1000 - 0.5) * 0.030));
  xy.y = Math.min(0.995, Math.max(0.005, xy.y + (((semente >>> 7) % 1000) / 1000 - 0.5) * 0.022));
  return {
    ip: o.ip || randIP(rng),
    name: o.name,
    type: o.type,
    corp: o.corp || null,
    city: o.city || fallback[0],
    lat: lat, lon: lon, x: xy.x, y: xy.y,
    sec: Object.assign(
      { pass: null, proxy: 0, firewall: 0, monitor: 0, admin: null, voice: 0 },
      o.sec || {}),
    st: {
      logged: false, admin: false, proxyDown: false, fwDown: false,
      monFooled: false, voiceOk: false, loops: {}, lan: null
    },
    files: o.files || [],
    logs: o.logs || [],
    accounts: o.accounts || null,
    lan: o.lan || null,
    cams: o.cams || null,
    net: o.net || null,
    traceBase: o.traceBase || 60,
    screens: o.screens || ['menu'],
    publicList: !!o.publicList,
    probed: 0,
    notes: o.notes || ''
  };
}
