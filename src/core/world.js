/* =========================================================
   world.js — a geração do mundo.

   Um mundo é feito uma vez, a partir de uma semente, e nunca mais
   muda de forma: os servidores, as empresas, as pessoas e os
   bancos ficam. O que muda com o tempo é o estado deles — senhas
   renovadas, segurança endurecida, arquivos apagados, dinheiro
   movido.

   Camadas do mundo, de fora para dentro:
     1. servidores fixos  — a infraestrutura pública que todo agente
        conhece: InterNIC, Uplink IS, as bases globais, os bancos.
        Segurança alta e imutável; existem para dar escala ao mapa.
     2. corporações       — o corpo do jogo. Cada uma tem servidores
        próprios, com dificuldade proporcional ao porte.
     3. pessoas           — os registros que as missões manipulam.
     4. redes sociais e   — sistemas com interface própria, tratados
        videomonitoramento   como servidores comuns por fora.
   ========================================================= */
import * as D from './data.js';
import { makeRNG } from './rng.js';
import { S, setState } from './state.js';
import { baseServer, randIP, makePassword, makeFile, seedLogs, personName } from './entities.js';
import * as People from './people.js';
import * as LAN from './lan.js';

/* =========================================================
   AUXILIARES
   ========================================================= */

/* Orçamento de segurança: quanto de camada um alvo pode carregar.
   `tier` 0..5 é o porte do alvo; o teto por camada existe porque
   um bypass de versão N custa o dobro do de versão N-1, e um alvo
   com firewall 4 é intransponível para quem tem 3 mil créditos. */
function security(rng, tier, opts) {
  opts = opts || {};
  const cap = Math.min(5, Math.max(0, tier));
  const budget = rng.int(cap, cap * 2 + 1);
  const sec = { pass: null, proxy: 0, firewall: 0, monitor: 0, admin: null, voice: 0 };

  let left = budget;
  /* o monitor anda à frente: não bloqueia nada, só encurta o trace,
     então é seguro dá-lo cedo e é ele que ensina a apagar log */
  sec.monitor = Math.min(cap + 1, 5, rng.int(0, cap + 1));
  left -= Math.floor(sec.monitor / 2);

  if (!opts.noFirewall) {
    sec.firewall = Math.min(cap, Math.max(0, rng.int(0, left)));
    left -= sec.firewall;
  }
  if (!opts.noProxy) {
    sec.proxy = Math.min(cap, Math.max(0, rng.int(0, left)));
    left -= sec.proxy;
  }

  if (opts.pass !== false) sec.pass = makePassword(rng, tier >= 3);
  if (opts.admin) sec.admin = makePassword(rng, true);
  if (opts.voice) sec.voice = rng.int(1, 2);
  return sec;
}

/* Tempo base de trace, em segundos. Alvo mais duro rastreia mais rápido. */
function traceFor(rng, tier) {
  return Math.round(rng.int(150, 240) - tier * 18);
}

function register(world, server) {
  world.servers[server.ip] = server;
  return server;
}

/* Um IP único dentro do mundo. */
function freeIP(rng, world) {
  let ip = randIP(rng);
  let guard = 0;
  while (world.servers[ip] && guard++ < 200) ip = randIP(rng);
  return ip;
}

/* =========================================================
   ARQUIVOS
   ========================================================= */
function corpFiles(rng, corp, tier, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    /* a criptografia acompanha o porte, mas fica sempre um degrau
       abaixo do teto — contratos de entrega só apontam para arquivos
       que o Decrypter do jogador consegue abrir */
    const enc = rng.chance(0.55) ? Math.min(6, rng.int(0, tier)) : 0;
    out.push(makeFile(rng, {
      enc: enc,
      size: rng.int(1, 3 + tier),
      kind: rng.pick(['doc', 'doc', 'data', 'source', 'design']),
      corp: corp.name
    }));
  }
  return out;
}

/* =========================================================
   1. SERVIDORES FIXOS
   ========================================================= */
function buildFixed(rng, world) {
  /* --- InterNIC: o catálogo público de endereços --- */
  world.internic = register(world, baseServer(rng, {
    ip: '128.128.128.10', name: 'InterNIC', type: 'internic',
    city: 'Genebra', traceBase: 400, publicList: true,
    screens: ['internic'], fixedSec: true,
    sec: { pass: null, proxy: 0, firewall: 0, monitor: 0 },
    notes: 'Registro público de endereços. Consulta livre, sem autenticação.'
  })).ip;
  world.servers[world.internic].fixedSec = true;

  /* --- Uplink Internal Services: contratos, software, hardware --- */
  world.uis = register(world, baseServer(rng, {
    ip: '234.773.0.666', name: 'Uplink Internal Services System', type: 'uis',
    city: 'Londres', traceBase: 500, publicList: true,
    screens: ['uis'], fixedSec: true,
    sec: { pass: null, proxy: 0, firewall: 0, monitor: 0 },
    notes: 'Sistema interno da Uplink Corporation. Acesso liberado a agentes registrados.'
  })).ip;
  world.servers[world.uis].fixedSec = true;

  /* --- Servidor público: o alvo de treino, sem segurança nenhuma --- */
  world.publicAccess = register(world, baseServer(rng, {
    ip: '234.773.0.100', name: 'Uplink Public Access Server', type: 'public',
    city: 'Londres', traceBase: 600, publicList: true,
    screens: ['menu', 'files'], fixedSec: true,
    sec: { pass: null, proxy: 0, firewall: 0, monitor: 0 },
    files: [makeFile(rng, { enc: 0, size: 1, kind: 'doc', name: 'boas_vindas.txt' })],
    notes: 'Servidor aberto de cortesia. Use-o como primeiro salto de qualquer rota.'
  })).ip;
  world.servers[world.publicAccess].fixedSec = true;

  /* --- Máquina de teste: onde se aprende a quebrar senha sem risco --- */
  world.testMachine = register(world, baseServer(rng, {
    ip: '234.773.0.101', name: 'Uplink Test Machine', type: 'test',
    city: 'Londres', traceBase: 900, publicList: true,
    screens: ['menu', 'files'], fixedSec: true,
    sec: { pass: makePassword(rng, false), proxy: 0, firewall: 0, monitor: 0 },
    files: [makeFile(rng, { enc: 0, size: 1, kind: 'doc', name: 'leiame.txt' })],
    notes: 'Máquina de treino. Nenhum log é auditado aqui — quebre a senha à vontade.'
  })).ip;
  world.servers[world.testMachine].fixedSec = true;

  /* --- As bases globais: segurança fixa e alta --- */
  const globals = [
    { key: 'iad', ip: '128.128.128.20', name: 'International Academic Database',
      type: 'academic', city: 'Boston', screens: ['academic'], tier: 4,
      notes: 'Registro internacional de formação acadêmica. Auditado semanalmente.' },
    { key: 'gcd', ip: '128.128.128.30', name: 'Global Criminal Database',
      type: 'criminal', city: 'Haia', screens: ['criminal'], tier: 5,
      notes: 'Base criminal global. Acesso restrito a autoridades credenciadas.' },
    { key: 'ssd', ip: '128.128.128.40', name: 'International Social Security Database',
      type: 'social_sec', city: 'Nova York', screens: ['socialsec'], tier: 4,
      notes: 'Cadastro de vínculo empregatício e previdência.' },
    { key: 'ismc', ip: '128.128.128.50', name: 'International Stock Market System',
      type: 'stock', city: 'Nova York', screens: ['stock'], tier: 3,
      notes: 'Pregão eletrônico internacional. Cotações em tempo real.' },
    { key: 'cmd', ip: '128.128.128.60', name: 'Central Medical Database',
      type: 'medical', city: 'Genebra', screens: ['medical'], tier: 4,
      notes: 'Prontuários e histórico clínico. Sigilo garantido por tratado.' }
  ];
  globals.forEach(g => {
    const s = register(world, baseServer(rng, {
      ip: g.ip, name: g.name, type: g.type, city: g.city,
      screens: g.screens, publicList: true,
      traceBase: traceFor(rng, g.tier),
      sec: {
        pass: makePassword(rng, true),
        proxy: Math.min(5, g.tier), firewall: Math.min(5, g.tier),
        monitor: Math.min(5, g.tier + 1),
        admin: makePassword(rng, true)
      },
      notes: g.notes
    }));
    s.fixedSec = true;
    world[g.key] = s.ip;
  });

  /* --- Bancos --- */
  world.banks = [];
  D.BANKS.forEach((bankName, i) => {
    const s = register(world, baseServer(rng, {
      ip: '129.' + (10 + i) + '.' + rng.int(1, 250) + '.' + rng.int(1, 250),
      name: bankName, type: 'bank', city: rng.pick(D.CITIES)[0],
      screens: ['bank_login', 'bank'], publicList: true,
      traceBase: traceFor(rng, 4),
      sec: {
        pass: null,                       /* banco não usa senha de sistema */
        proxy: rng.int(3, 5), firewall: rng.int(3, 5), monitor: rng.int(4, 5),
        voice: rng.chance(0.4) ? rng.int(1, 2) : 0
      },
      accounts: [],
      notes: bankName + '. Autenticação por número de conta e senha.'
    }));
    s.fixedSec = true;
    world.banks.push(s.ip);
  });
}

/* =========================================================
   2. CORPORAÇÕES
   ========================================================= */
function buildCorps(rng, world) {
  world.corps = [];
  const names = rng.shuffle(D.CORPS.slice());

  names.forEach((name, i) => {
    /* porte: as primeiras da lista são as gigantes */
    const size = i < 4 ? 3 : (i < 10 ? 2 : 1);
    const city = rng.pick(D.CITIES);
    const corp = {
      id: 'c' + i,
      name: name,
      sector: rng.pick(D.SECTORS),
      city: city[0],
      size: size,
      servers: [],
      story: D.STORY_CORPS.includes(name)
    };

    /* Servidor de acesso público: a porta da frente, quase sem defesa.
       Serve de salto de rota e de pista para o resto da rede. */
    const pub = register(world, baseServer(rng, {
      ip: freeIP(rng, world),
      name: name + ' Public Access Server', type: 'public', corp: name,
      city: city[0], lat: city[1], lon: city[2],
      screens: ['menu', 'files'], publicList: true,
      traceBase: traceFor(rng, 1),
      sec: security(rng, 0, { pass: false }),
      files: corpFiles(rng, corp, 0, rng.int(1, 3)),
      notes: 'Portal público da ' + name + '.'
    }));
    corp.servers.push(pub.ip);

    /* Servidor central: onde os arquivos que interessam moram. */
    const tier = Math.min(5, size + rng.int(0, 1));
    const central = register(world, baseServer(rng, {
      ip: freeIP(rng, world),
      name: name + ' Central Mainframe', type: 'mainframe', corp: name,
      city: city[0], lat: city[1], lon: city[2],
      screens: ['menu', 'files', 'logs'],
      publicList: rng.chance(0.5),
      traceBase: traceFor(rng, tier),
      sec: security(rng, tier, { admin: tier >= 3 }),
      files: corpFiles(rng, corp, tier, rng.int(4, 9)),
      notes: 'Sistema central da ' + name + '. Uso restrito a pessoal autorizado.'
    }));
    corp.servers.push(central.ip);

    /* As grandes têm rede interna: não é uma máquina, é uma LAN. */
    if (size >= 3 && rng.chance(0.75)) {
      central.lan = LAN.generate(rng, { size: size });
      central.screens.push('lan');
      central.notes += ' Topologia interna segmentada.';
    }

    /* Servidor de arquivos secundário nas médias e grandes. */
    if (size >= 2) {
      const files = register(world, baseServer(rng, {
        ip: freeIP(rng, world),
        name: name + ' File Server', type: 'files', corp: name,
        city: city[0], lat: city[1], lon: city[2],
        screens: ['menu', 'files', 'logs'],
        traceBase: traceFor(rng, tier - 1),
        sec: security(rng, Math.max(0, tier - 1)),
        files: corpFiles(rng, corp, tier - 1, rng.int(3, 7)),
        notes: 'Armazenamento departamental da ' + name + '.'
      }));
      corp.servers.push(files.ip);
    }

    world.corps.push(corp);
  });
}

/* =========================================================
   3. REDES SOCIAIS
   ========================================================= */
function buildSocial(rng, world) {
  world.socials = [];
  D.SOCIAL_NETS.forEach(net => {
    /* a segurança das redes é fixa e declarada no catálogo: elas são
       marcos do mundo, e a progressão do jogador é medida por elas */
    const tier = Math.max(net.sec.proxy, net.sec.firewall, net.sec.monitor);
    const s = register(world, baseServer(rng, {
      ip: net.ip,
      name: net.srv, type: 'social', corp: net.name,
      city: net.city,
      screens: ['social'], publicList: true,
      traceBase: traceFor(rng, tier),
      sec: Object.assign({
        pass: makePassword(rng, tier >= 3),
        admin: makePassword(rng, true), voice: 0
      }, net.sec),
      notes: net.name + ' — ' + net.tag
    }));
    s.fixedSec = true;
    s.social = { key: net.key, kind: net.kind };
    world.socials.push(s.ip);
  });
}

/* =========================================================
   4. VIDEOMONITORAMENTO
   ========================================================= */
function buildCCTV(rng, world) {
  world.cctv = [];
  D.CCTV_SITES.forEach(site => {
    /* o marcado como `easy` é o CFTV do contrato de estreia: senha de
       fábrica, nenhuma camada, trace lento. É a visita guiada do jogo. */
    const easy = !!site.easy;
    const tier = easy ? 0 : rng.int(1, 4);
    const s = register(world, baseServer(rng, {
      ip: freeIP(rng, world),
      name: site.name, type: 'cctv', city: site.city,
      screens: ['cctv'], publicList: easy,
      traceBase: easy ? 600 : traceFor(rng, tier),
      sec: easy
        ? { pass: 'admin', proxy: 0, firewall: 0, monitor: 0, admin: null, voice: 0 }
        : security(rng, tier),
      notes: easy
        ? 'Central de câmeras antiga. A senha de fábrica nunca foi trocada.'
        : 'Circuito fechado de televisão. ' + site.name + '.'
    }));

    /* as câmeras do local */
    const n = easy ? 4 : rng.int(4, 9);
    s.cams = [];
    const scenePool = rng.shuffle(D.CAM_SCENES.slice());
    for (let k = 0; k < n; k++) {
      const scene = scenePool[k % scenePool.length];
      s.cams.push({
        id: 'cam' + k,
        label: rng.pick(scene.zones),
        scene: scene.id,
        night: !!scene.night,
        keypad: !!scene.keypad,
        looped: false,
        recording: rng.chance(0.8)
      });
    }
    /* gravações arquivadas, que os contratos pedem */
    s.files = [];
    const recs = easy ? 3 : rng.int(3, 8);
    for (let k = 0; k < recs; k++) {
      s.files.push(makeFile(rng, {
        enc: easy ? 0 : (rng.chance(0.4) ? rng.int(1, 3) : 0),
        size: rng.int(2, 6),
        kind: 'video',
        name: 'gravacao_' + rng.int(1000, 9999) + '.vid'
      }));
    }
    world.cctv.push(s.ip);
  });
}

/* =========================================================
   5. CONTAS BANCÁRIAS
   ========================================================= */
function buildAccounts(rng, world) {
  const bankIPs = world.banks;

  /* uma conta para cada pessoa relevante, distribuída entre os bancos */
  world.people.forEach((p, i) => {
    const bank = world.servers[bankIPs[i % bankIPs.length]];
    /* distribuição de cauda longa: quase todo mundo tem pouco, e uns
       poucos têm muito — é o que torna uma conta gorda um achado */
    const rich = p.social && p.social.salary > 150000;
    const balance = Math.round(Math.pow(10, rng() * 2.6 + 2.4)) * (rich ? 12 : 1);
    const acc = {
      no: String(rng.int(10000000, 99999999)),
      owner: p.name,
      personId: p.id,
      pass: makePassword(rng, false),
      balance: balance,
      statements: [],
      isPlayer: false
    };
    bank.accounts.push(acc);
    p.account = { bank: bank.ip, no: acc.no };
    if (p.financial) p.financial.accounts = [{ bank: bank.name, no: acc.no, balance: balance }];
  });

  /* contas corporativas, gordas, que os contratos de desvio miram */
  world.corps.forEach((c, i) => {
    const bank = world.servers[bankIPs[(i + 1) % bankIPs.length]];
    const acc = {
      no: String(rng.int(10000000, 99999999)),
      owner: c.name,
      corpId: c.id,
      pass: makePassword(rng, true),
      balance: rng.int(60000, 900000) * c.size,
      statements: [],
      isPlayer: false
    };
    bank.accounts.push(acc);
    c.account = { bank: bank.ip, no: acc.no };
  });
}

/* A conta do jogador: aberta no banco mais barato, saldo inicial magro. */
function openPlayerAccount(rng, world, handle) {
  const bank = world.servers[world.banks[0]];
  const acc = {
    no: String(rng.int(10000000, 99999999)),
    owner: handle,
    pass: makePassword(rng, false),
    balance: 3000,
    /* o campo é `statements`: é assim que bank.js grava, e usar o
       singular aqui fazia o extrato do agente nascer vazio */
    statements: [{
      t: S.time, amt: 3000, bal: 3000,
      txt: 'Depósito inicial — Uplink Corporation'
    }],
    isPlayer: true
  };
  bank.accounts.push(acc);
  return { ip: bank.ip, no: acc.no, pass: acc.pass, bankName: bank.name };
}

/* =========================================================
   SEPARAÇÃO NO MAPA
   O deslocamento por endereço já espalha servidores da mesma cidade,
   mas com 116 deles em cerca de trinta cidades ainda sobram pares
   quase colados — e dois pontos a meio pixel um do outro são um só
   ponto para quem clica.

   Esta passagem afasta quem estiver perto demais, com um limite de
   quanto cada um pode andar: o servidor continua na região certa do
   mundo, só não em cima do vizinho.
   ========================================================= */
const SEP_MIN = 0.016;          /* ~19 px num mapa de 1200 px */
const DESVIO_MAX = 0.045;       /* o quanto pode se afastar da cidade */

function separaNoMapa(world) {
  const lista = Object.values(world.servers);
  /* guarda a posição de origem para não deixar ninguém migrar de país */
  lista.forEach(s => { s._x0 = s.x; s._y0 = s.y; });

  for (let passe = 0; passe < 24; passe++) {
    let moveu = 0;
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const a = lista[i], b = lista[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= SEP_MIN) continue;
        if (d < 1e-6) { dx = (i % 2 ? 1 : -1) * 1e-3; dy = 1e-3; d = Math.hypot(dx, dy); }
        const empurra = (SEP_MIN - d) / 2;
        const ux = dx / d, uy = dy / d;
        a.x -= ux * empurra; a.y -= uy * empurra;
        b.x += ux * empurra; b.y += uy * empurra;
        moveu++;
      }
    }
    /* prende cada um perto da cidade de origem e dentro do mapa */
    lista.forEach(s => {
      const dx = s.x - s._x0, dy = s.y - s._y0;
      const d = Math.hypot(dx, dy);
      if (d > DESVIO_MAX) {
        s.x = s._x0 + (dx / d) * DESVIO_MAX;
        s.y = s._y0 + (dy / d) * DESVIO_MAX;
      }
      s.x = Math.min(0.985, Math.max(0.015, s.x));
      s.y = Math.min(0.975, Math.max(0.025, s.y));
    });
    if (!moveu) break;
  }
  lista.forEach(s => { delete s._x0; delete s._y0; });
}

/* =========================================================
   ENTRADA PÚBLICA
   ========================================================= */
export function generate(seed, handle) {
  const rng = makeRNG(seed);
  const world = { servers: {}, corps: [], people: [], banks: [], socials: [], cctv: [] };

  buildFixed(rng, world);
  buildCorps(rng, world);
  buildSocial(rng, world);
  buildCCTV(rng, world);

  world.people = People.generate(rng, 220);
  buildAccounts(rng, world);

  separaNoMapa(world);

  /* logs de fundo em tudo: uma máquina sem histórico denuncia o truque */
  Object.values(world.servers).forEach(s => {
    if (!s.logs.length) seedLogs(rng, s, S.time);
  });

  return world;
}

/* Chamado por game.js depois que S.world já existe. */
export function bindPlayer(seed, handle) {
  const rng = makeRNG(seed ^ 0x5bf03635);
  return openPlayerAccount(rng, S.world, handle);
}

/* =========================================================
   CONSULTAS DE MUNDO
   ========================================================= */

/* Servidores que o InterNIC lista publicamente. */
export function publicServers() {
  return Object.values(S.world.servers).filter(s => s.publicList);
}

/* Candidatos a salto de rota: qualquer coisa pública e de baixo risco. */
export function bounceCandidates() {
  return Object.values(S.world.servers)
    .filter(s => s.publicList && s.type !== 'uis')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function byType(type) {
  return Object.values(S.world.servers).filter(s => s.type === type);
}

export function findByName(q) {
  const n = String(q || '').toLowerCase();
  return Object.values(S.world.servers).filter(s => s.name.toLowerCase().includes(n));
}

/* Um alvo de missão do porte pedido, evitando repetição recente. */
export function pickTarget(rng, opts) {
  opts = opts || {};
  const used = S.flags.recentTargets || [];
  let pool = Object.values(S.world.servers).filter(s => {
    if (s.fixedSec && !opts.allowFixed) return false;
    if (opts.type && s.type !== opts.type) return false;
    if (opts.types && !opts.types.includes(s.type)) return false;
    if (opts.needFiles && (!s.files || !s.files.length)) return false;
    /* tetos separados: firewall barra leitura, proxy barra escrita, e
       um agente pode ter ferramenta para um e não para o outro */
    if (opts.maxFirewall !== undefined && s.sec.firewall > opts.maxFirewall) return false;
    if (opts.maxProxy !== undefined && s.sec.proxy > opts.maxProxy) return false;
    if (opts.maxLayer !== undefined) {
      if (s.sec.proxy > opts.maxLayer || s.sec.firewall > opts.maxLayer) return false;
    }
    if (opts.noFirewall && s.sec.firewall > 0) return false;
    if (opts.noProxy && s.sec.proxy > 0) return false;
    if (opts.maxMonitor !== undefined && s.sec.monitor > opts.maxMonitor) return false;
    return true;
  });
  if (!pool.length) return null;
  const fresh = pool.filter(s => !used.includes(s.ip));
  if (fresh.length) pool = fresh;
  const hit = rng.pick(pool);

  S.flags.recentTargets = used.concat([hit.ip]).slice(-12);
  return hit;
}
