/* =========================================================
   news.js — o mundo comenta o que você faz.

   Duas fontes alimentam o feed:
   - ambiente: manchetes de fundo, geradas em ritmo lento, que
     existem só para o mundo parecer maior que o jogador;
   - reativas: consequência direta de uma ação sua. Estas chegam
     com atraso (uma empresa leva horas para descobrir o roubo),
     e são elas que fazem o calor subir e a segurança endurecer.

   Uma notícia reativa sobre um alvo que você invadiu é também um
   aviso: alguém já sabe que aconteceu, e o trace passivo pode
   estar a caminho.
   ========================================================= */
import * as D from './data.js';
import { Bus, EV } from './bus.js';
import { S, R, addHeat, srv } from './state.js';

const MAX_ITEMS = 60;

/* Atraso, em minutos de jogo, entre a ação e a repercussão.
   Roubo silencioso demora; sistema destruído aparece quase na hora. */
const DELAY = {
  theft:     [180, 900],
  destroy:   [20, 120],
  bank:      [90, 480],
  social:    [30, 240],
  cctv:      [240, 1200],
  criminal:  [600, 2400],
  academic:  [600, 2400],
  arrest:    [0, 0],
  arrest_attempt: [0, 0],
  heat:      [0, 0]
};

/* Quanto cada repercussão esquenta o mundo. */
const HEAT = {
  theft: 1.5, destroy: 6, bank: 8, social: 1, cctv: 2,
  criminal: 4, academic: 2, arrest: 0, arrest_attempt: 0, heat: 0
};

function fill(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

function push(item) {
  S.news.unshift(item);
  if (S.news.length > MAX_ITEMS) S.news.length = MAX_ITEMS;
  Bus.emit(EV.NEWS_NEW, item);
  return item;
}

/* Contexto textual: preenche as variáveis que os moldes usam. */
function context(extra) {
  const corp = S.world && S.world.corps.length ? R.pick(S.world.corps) : null;
  const city = R.pick(D.CITIES)[0];
  return Object.assign({
    corp: corp ? corp.name : 'Sistemas Meridiano',
    sector: corp ? corp.sector : R.pick(D.SECTORS),
    city: city,
    handle: S.handle || 'desconhecido'
  }, extra || {});
}

/* =========================================================
   REPERCUSSÃO DE UMA AÇÃO
   Chamada por net.js, missions.js, bank.js, social.js, cctv.js.
   ========================================================= */
export function report(kind, vars) {
  const tpl = D.NEWS_REACTIVE[kind];
  if (!tpl) return null;

  const d = DELAY[kind] || [60, 300];
  const at = S.time + R.int(d[0], d[1]);
  const ctx = context(vars);

  /* fica na fila até a hora de sair; o feed só mostra o que já saiu */
  const item = {
    id: R.uid('n'),
    kind: kind,
    source: R.pick(D.NEWS_SOURCES),
    head: fill(tpl.head, ctx),
    body: fill(tpl.body, ctx),
    t: at,
    published: at <= S.time,
    reactive: true,
    target: vars && vars.target ? vars.target : null
  };

  if (item.published) publish(item);
  else S.newsQueue.push(item);
  return item;
}

function publish(item) {
  item.published = true;
  item.t = S.time;
  push(item);
  const h = HEAT[item.kind] || 0;
  if (h) addHeat(h);
  /* a empresa citada reforça a própria segurança depois do susto */
  if (item.target) hardenTarget(item.target);
}

/* Um alvo que apanhou fica mais difícil: sobe uma camada até o teto
   e renova a senha. É a razão de não se voltar duas vezes ao mesmo poço.

   Duas exceções, ambas por justiça com o jogador:
   - servidor que é alvo de contrato ACEITO não endurece. Quem pegou
     o trabalho tem direito a que ele continue possível; endurecer no
     meio transforma um contrato aceito numa parede sem aviso;
   - o endurecimento tem teto próprio (+2 sobre o original), senão
     um mundo muito quente empurra tudo para o máximo e o jogo
     estanca. */
function hardenTarget(name) {
  const list = S.world ? Object.values(S.world.servers) : [];
  const contratados = new Set((S.missions.active || []).map(m => m.targetIp));
  const hit = list.filter(s => s.name === name || (s.corp && s.corp === name));
  hit.forEach(s => {
    if (s.fixedSec) return;
    if (contratados.has(s.ip)) return;
    if ((s.hardened || 0) >= 2) return;
    if (s.sec.monitor < 5 && R.chance(0.7)) s.sec.monitor++;
    else if (s.sec.firewall < 5 && R.chance(0.5)) s.sec.firewall++;
    else if (s.sec.proxy < 5 && R.chance(0.5)) s.sec.proxy++;
    if (s.sec.pass && R.chance(0.6)) s.sec.pass = null;   /* será regerado ao conectar */
    s.hardened = (s.hardened || 0) + 1;
  });
}

/* =========================================================
   MANCHETE DE AMBIENTE
   ========================================================= */
export function ambient() {
  const tpl = R.pick(D.NEWS_AMBIENT);
  const ctx = context();
  return push({
    id: R.uid('n'),
    kind: 'ambient',
    source: R.pick(D.NEWS_SOURCES),
    head: fill(tpl.head, ctx),
    body: fill(tpl.body, ctx),
    t: S.time,
    published: true,
    reactive: false,
    target: null
  });
}

/* =========================================================
   RELÓGIO
   Chamado uma vez por minuto de jogo por game.js.
   ========================================================= */
export function tick() {
  /* solta o que estava na fila e já venceu */
  for (let i = S.newsQueue.length - 1; i >= 0; i--) {
    if (S.newsQueue[i].t <= S.time) publish(S.newsQueue.splice(i, 1)[0]);
  }

  /* manchete de ambiente a cada ~5 horas de jogo, com variação */
  if (!S.flags.nextAmbient || S.time >= S.flags.nextAmbient) {
    if (S.flags.nextAmbient) ambient();
    S.flags.nextAmbient = S.time + R.int(200, 460);
  }

  /* com o mundo muito quente, sai uma matéria sobre o aumento de gasto
     com segurança — o aviso de que a curva está subindo */
  if (S.heat > 55 && R.chance(0.0008)) report('heat', {});
}

/* Feed pronto para a interface: só o que já foi publicado. */
export function feed(limit) {
  const out = S.news.filter(n => n.published);
  return limit ? out.slice(0, limit) : out;
}

export function unreadCount() {
  return S.news.filter(n => n.published && !n.seen).length;
}

export function markSeen(id) {
  const n = S.news.find(x => x.id === id);
  if (n) n.seen = true;
  return !!n;
}

export function markAllSeen() { S.news.forEach(n => { n.seen = true; }); }
