/* =========================================================
   social.js — as quatro plataformas fictícias.

   Por fora são servidores como qualquer outro: senha, proxy,
   firewall, monitor. Por dentro, em vez de um prompt, você cai no
   painel de moderação com a cara da própria plataforma. O conteúdo
   é gerado sob demanda e memorizado, para que o mesmo perfil
   mostre sempre as mesmas publicações.
   ========================================================= */
import * as D from './data.js';
import * as F from './fmt.js';
import { Bus, EV } from './bus.js';
import { S, R, srv, person, storeFile, memFree, flag } from './state.js';
import { makeRNG, hashString } from './rng.js';
import { makeFile, logHit } from './entities.js';
import * as Net from './net.js';
import * as News from './news.js';

/* =========================================================
   GERAÇÃO PREGUIÇOSA DE CONTEÚDO
   O feed de uma pessoa é derivado de uma semente estável, então é
   sempre igual sem precisar ocupar espaço no save.
   ========================================================= */
function seedFor(netKey, personId) {
  return (hashString(netKey + ':' + personId) ^ Math.imul(S.seed >>> 0, 0x85EBCA6B)) >>> 0;
}

function bodyFor(kind, rng) {
  switch (kind) {
    case 'photo': return rng.pick(D.POST_PHOTO);
    case 'pro':   return rng.pick(D.POST_PRO);
    default:      return rng.chance(0.18) ? rng.pick(D.POST_SPICY) : rng.pick(D.POST_LINES);
  }
}

/* Publicações de um perfil numa plataforma. */
export function postsOf(netKey, personId) {
  S.social = S.social || {};
  const key = netKey + ':' + personId;
  if (S.social[key]) return S.social[key];

  const p = person(personId);
  const rng = makeRNG(seedFor(netKey, personId));
  const net = D.SOCIAL_NETS.find(n => n.key === netKey);
  const n = rng.int(6, 18);
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push({
      id: 'sp' + i,
      text: bodyFor(net ? net.kind : 'micro', rng),
      tags: rng.chance(0.5) ? rng.pickMany(D.POST_TAGS, rng.int(1, 3)) : [],
      likes: rng.int(0, 2400),
      reposts: rng.int(0, 380),
      t: S.time - rng.int(60, 300000),
      planted: false,
      deleted: false
    });
  }
  list.sort((a, b) => b.t - a.t);
  S.social[key] = list;
  return list;
}

/* Mensagens privadas: mais curtas, mais comprometedoras. */
export function dmsOf(netKey, personId) {
  S.socialDM = S.socialDM || {};
  const key = netKey + ':' + personId;
  if (S.socialDM[key]) return S.socialDM[key];

  const rng = makeRNG(seedFor(netKey, personId) ^ 0x1b873593);
  const n = rng.int(5, 14);
  const list = [];
  for (let i = 0; i < n; i++) {
    const secret = rng.chance(0.3);
    list.push({
      id: 'dm' + i,
      with: rng.pick(D.FIRST) + ' ' + rng.pick(D.LAST),
      text: secret ? rng.pick(D.DM_SECRET) : rng.pick(D.DM_LINES),
      secret: secret,
      t: S.time - rng.int(60, 120000)
    });
  }
  list.sort((a, b) => b.t - a.t);
  S.socialDM[key] = list;
  return list;
}

/* =========================================================
   PAINEL
   ========================================================= */
export function netOf(server) {
  if (!server || !server.social) return null;
  return D.SOCIAL_NETS.find(n => n.key === server.social.key) || null;
}

/* Estado inicial do painel ao entrar na plataforma. */
export function panel(server) {
  const net = netOf(server);
  if (!net) return null;
  return {
    key: net.key, name: net.name, tag: net.tag, kind: net.kind,
    domain: net.domain, glyph: net.glyph,
    accent: net.accent, accent2: net.accent2,
    trends: R.pickMany(D.SOCIAL_TRENDS, 6),
    users: S.world.people.length,
    canWrite: Net.canWrite(server),
    canRead: Net.canRead(server)
  };
}

/* Busca de perfis pelo nome. */
export function search(server, query) {
  const block = Net.readBlock(server);
  if (block) return { erro: block };
  const q = F.norm(query || '');
  if (q.length < 2) return { itens: [] };
  const hits = S.world.people
    .filter(p => F.norm(p.name).includes(q))
    .slice(0, 24)
    .map(p => profileCard(server, p));
  return { itens: hits };
}

function profileCard(server, p) {
  const net = netOf(server);
  const posts = postsOf(net.key, p.id).filter(x => !x.deleted);
  const rng = makeRNG(seedFor(net.key, p.id) ^ 0x27d4eb2f);
  return {
    id: p.id,
    name: p.name,
    handle: '@' + F.slug(p.name).replace(/-/g, '') + rng.int(1, 99),
    bio: rng.pick(D.SOCIAL_BIOS),
    followers: rng.int(12, 48000),
    following: rng.int(8, 1200),
    posts: posts.length,
    city: p.city,
    employer: p.social.employer || '—',
    title: p.social.title
  };
}

export function profile(server, personId) {
  const block = Net.readBlock(server);
  if (block) return { erro: block };
  const p = person(personId);
  if (!p) return { erro: 'Perfil não encontrado.' };
  const net = netOf(server);
  return {
    perfil: profileCard(server, p),
    publicacoes: postsOf(net.key, p.id).filter(x => !x.deleted)
  };
}

export function dms(server, personId) {
  const block = Net.readBlock(server);
  if (block) return { erro: block };
  const p = person(personId);
  if (!p) return { erro: 'Perfil não encontrado.' };
  const net = netOf(server);
  Net.illegal(server, 2);
  logHit(server, 'Acesso a mensagens privadas: ' + p.name);
  return { pessoa: p.name, mensagens: dmsOf(net.key, p.id) };
}

/* =========================================================
   AÇÕES
   ========================================================= */

/* Publicar em nome de alguém. */
export function post(server, personId, text) {
  const block = Net.writeBlock(server);
  if (block) return { erro: block };
  const p = person(personId);
  if (!p) return { erro: 'Perfil não encontrado.' };
  const net = netOf(server);

  const list = postsOf(net.key, p.id);
  list.unshift({
    id: 'sp' + R.uid(''), text: String(text || '').slice(0, 240),
    tags: [], likes: 0, reposts: 0, t: S.time, planted: true, deleted: false
  });

  Net.illegal(server, 3);
  logHit(server, 'Publicação criada em nome de ' + p.name);
  S.flags.socialPosted = S.flags.socialPosted || {};
  S.flags.socialPosted[p.id] = true;
  News.report('social', { victim: p.name, target: server.name });
  Bus.emit(EV.SFX, { name: 'confirm' });
  return { ok: true, texto: 'Publicado como ' + p.name + '.' };
}

/* Apagar uma publicação. */
export function removePost(server, personId, postId) {
  const block = Net.writeBlock(server);
  if (block) return { erro: block };
  const net = netOf(server);
  const list = postsOf(net.key, personId);
  const it = list.find(x => x.id === postId);
  if (!it) return { erro: 'Publicação não encontrada.' };
  it.deleted = true;

  Net.illegal(server, 1);
  const restantes = list.filter(x => !x.deleted).length;
  if (restantes === 0) {
    S.flags.socialWiped = S.flags.socialWiped || {};
    S.flags.socialWiped[personId] = true;
    const p = person(personId);
    logHit(server, 'Perfil esvaziado: ' + (p ? p.name : personId));
    News.report('social', { victim: p ? p.name : 'usuário', target: server.name });
  }
  return { ok: true, restantes: restantes };
}

/* Apagar tudo de uma vez. */
export function wipe(server, personId) {
  const block = Net.writeBlock(server);
  if (block) return { erro: block };
  const net = netOf(server);
  const list = postsOf(net.key, personId);
  const n = list.filter(x => !x.deleted).length;
  list.forEach(x => { x.deleted = true; });

  Net.illegal(server, 3);
  const p = person(personId);
  logHit(server, 'ALERTA: remoção em massa no perfil de ' + (p ? p.name : personId));
  S.flags.socialWiped = S.flags.socialWiped || {};
  S.flags.socialWiped[personId] = true;
  News.report('social', { victim: p ? p.name : 'usuário', target: server.name });
  return { ok: true, texto: n + ' publicações removidas.' };
}

/* Exportar as mensagens privadas para a memória do gateway. */
export function exportDMs(server, personId) {
  const block = Net.readBlock(server);
  if (block) return { erro: block };
  const p = person(personId);
  if (!p) return { erro: 'Perfil não encontrado.' };
  const net = netOf(server);
  const list = dmsOf(net.key, p.id);

  const body = list.map(m =>
    '[' + F.fmtDate(m.t) + '] ' + m.with + ': ' + m.text).join('\n');

  const f = makeFile(R, {
    name: 'dm_' + F.slug(p.name) + '_' + net.key + '.txt',
    size: Math.max(1, Math.ceil(list.length / 3)),
    enc: 0, kind: 'doc', body: body, tag: 'dm:' + p.id
  });

  if (memFree() < f.size) return { erro: 'Memória do gateway cheia.' };
  storeFile(f, server.ip);
  /* storeFile não carrega a etiqueta: aplica aqui, é ela que o
     contrato de extração verifica */
  const rec = S.memory[S.memory.length - 1];
  rec.tag = f.tag;
  rec.body = body;

  Net.illegal(server, 3);
  logHit(server, 'Exportação de mensagens privadas: ' + p.name);
  Bus.emit(EV.MEM_CHANGED, {});
  return { ok: true, texto: 'Conversa exportada: ' + f.name };
}

/* Assuntos do momento, para dar vida ao painel. */
export function trends() {
  return R.pickMany(D.SOCIAL_TRENDS, 6).map(t => ({
    tag: t, posts: R.int(400, 99000)
  }));
}
