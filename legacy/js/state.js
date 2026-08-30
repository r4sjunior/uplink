/* =========================================================
   state.js - estado global, relogio, save/load, economia
   ========================================================= */
(function (global) {
  'use strict';

  const SAVE_KEY = 'uplink_clone_save_v1';
  /* o relogio conta minutos desde 2010-01-01 00:00 UTC; 1826 dias = 2015-01-01 */
  const START_TIME = 1826 * 24 * 60 + 8 * 60;      /* 2015-01-01 08:00 */

  const G = {
    version: 1,
    seed: 0,
    handle: '',
    time: START_TIME,
    speed: 1,
    credits: 3000,
    points: 0,
    neuroPoints: 0,
    gateway: null,
    software: [],
    memory: [],
    links: [],
    email: [],
    missions: { available: [], active: [], done: [], failed: 0 },
    bank: null,
    conn: null,
    tasks: [],
    passive: [],      /* traces passivos pendentes */
    flags: {},
    world: null,
    over: false,
    _acc: 0
  };

  /* =========================================================
     CICLO DE VIDA
     ========================================================= */
  G.newGame = function (handle) {
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    G.version = 1;
    G.seed = seed;
    G.handle = handle;
    G.time = START_TIME;
    G.speed = 1;
    G.credits = 3000;
    G.points = 0;
    G.neuroPoints = 0;
    G.over = false;
    G.flags = {};
    G.tasks = [];
    G.passive = [];
    G.memory = [];
    G.email = [];
    G.missions = { available: [], active: [], done: [], failed: 0 };

    G.world = W.generate(seed, G.time);

    /* gateway inicial */
    G.gateway = {
      id: 'gw1',
      cpus: ['cpu60'],
      mems: ['mem16'],
      modem: 'md1'
    };

    /* software inicial */
    G.software = [
      { id: 'password_breaker', v: 1 },
      { id: 'file_copier', v: 1 },
      { id: 'file_deleter', v: 1 },
      { id: 'log_deleter', v: 1 },
      { id: 'trace_tracker', v: 1 },
      { id: 'ip_lookup', v: 1 }
    ];

    /* conta bancaria do jogador */
    const bankIP = G.world.banks[0];
    const bank = G.world.servers[bankIP];
    const acc = {
      no: String(100000 + Math.floor(Math.random() * 899999)),
      owner: handle,
      pass: 'uplink',
      balance: G.credits,
      statements: [{ t: G.time, txt: 'Abertura de conta', amt: G.credits }],
      isPlayer: true
    };
    bank.accounts.push(acc);
    G.bank = { ip: bankIP, no: acc.no, pass: acc.pass };

    /* links iniciais */
    G.links = [
      G.world.special.uplinkPub,
      G.world.special.test,
      G.world.special.internic,
      bankIP,
      G.world.special.iad,
      G.world.special.gcd,
      G.world.special.ssd
    ];

    G.conn = { route: [], target: null, live: false, screen: null, trace: null, startedAt: 0 };

    Missions.refresh(true);
    G.addEmail({
      from: 'internal@uplink.net',
      subj: 'Bem-vindo a Uplink Corporation',
      body:
        'Agente ' + handle + ',\n\n' +
        'Sua inscricao foi aprovada. Voce recebeu um Gateway ALPHA, 3000 creditos\n' +
        'de credito inicial e uma conta no ' + bank.name + '.\n\n' +
        'CONTA: ' + acc.no + '   SENHA: ' + acc.pass + '\n\n' +
        'Regras da casa:\n' +
        '  1. Sempre roteie sua conexao por varios servidores antes do alvo.\n' +
        '  2. Apague os logs. Um trace passivo encontra voce horas depois.\n' +
        '  3. Se o trace ativo completar enquanto voce estiver conectado,\n' +
        '     sua licenca sera revogada e seu gateway destruido.\n\n' +
        'Comece pela Uplink Test Machine (' + G.world.special.test + ').\n' +
        'Senha: rosebud. O monitor dela esta desligado.\n\n' +
        'Depois abra UPLINK IS > CONTRATOS: separamos um trabalho de\n' +
        'estreia que o seu gateway ja da conta sozinho, sem comprar nada.\n\n' +
        '-- Uplink Internal Services'
    });
    G.save();
  };

  /* =========================================================
     RATINGS
     ========================================================= */
  G.ratingIndex = function () {
    let idx = 0;
    for (let i = 0; i < D.RATING_POINTS.length; i++) {
      if (G.points >= D.RATING_POINTS[i]) idx = i;
    }
    return idx;
  };
  G.ratingName = function () { return D.UPLINK_RATINGS[G.ratingIndex()]; };
  G.nextRatingPoints = function () {
    const i = G.ratingIndex();
    return i + 1 < D.RATING_POINTS.length ? D.RATING_POINTS[i + 1] : null;
  };
  G.neuroIndex = function () {
    const p = G.neuroPoints;
    const t = [0, 3, 8, 16, 28, 45, 70, 110];
    let idx = 0;
    for (let i = 0; i < t.length; i++) if (p >= t[i]) idx = i;
    return idx;
  };
  G.neuroName = function () { return D.NEURO_RATINGS[G.neuroIndex()]; };

  /* =========================================================
     HARDWARE DERIVADO
     ========================================================= */
  G.gw = function () { return D.GW_BY_ID[G.gateway.id]; };
  G.cpuPower = function () {
    return G.gateway.cpus.reduce((s, id) => {
      const c = D.CPUS.find(x => x.id === id);
      return s + (c ? c.power : 0);
    }, 0);
  };
  G.memTotal = function () {
    return G.gateway.mems.reduce((s, id) => {
      const m = D.MEMS.find(x => x.id === id);
      return s + (m ? m.size : 0);
    }, 0);
  };
  G.memUsed = function () {
    const sw = G.software.reduce((s, x) => s + (D.SW_BY_ID[x.id] ? D.SW_BY_ID[x.id].size : 1), 0);
    const fl = G.memory.reduce((s, f) => s + f.size, 0);
    return sw + fl;
  };
  G.memFree = function () { return G.memTotal() - G.memUsed(); };
  G.bandwidth = function () {
    const m = D.MODEMS.find(x => x.id === G.gateway.modem);
    return Math.min(m ? m.bw : 1, G.gw().bw);
  };

  G.hasSw = function (id, minv) {
    const s = G.software.find(x => x.id === id);
    if (!s) return null;
    if (minv && s.v < minv) return null;
    return s;
  };
  G.swVersion = function (id) {
    const s = G.software.find(x => x.id === id);
    return s ? s.v : 0;
  };
  G.addSw = function (id, v) {
    const ex = G.software.find(x => x.id === id);
    if (ex) { ex.v = Math.max(ex.v, v); return; }
    G.software.push({ id: id, v: v });
  };

  /* =========================================================
     ECONOMIA
     ========================================================= */
  G.playerAccount = function () {
    if (!G.bank) return null;
    const b = G.world.servers[G.bank.ip];
    if (!b || !b.accounts) return null;
    return b.accounts.find(a => a.no === G.bank.no) || null;
  };
  G.pay = function (amount, reason) {
    const acc = G.playerAccount();
    G.credits += amount;
    if (acc) {
      acc.balance += amount;
      acc.statements.unshift({ t: G.time, txt: reason || (amount > 0 ? 'Credito' : 'Debito'), amt: amount });
      if (acc.statements.length > 40) acc.statements.length = 40;
      G.credits = acc.balance;
    }
  };
  G.canAfford = function (n) { return G.credits >= n; };

  /* =========================================================
     EMAIL
     ========================================================= */
  G.addEmail = function (m) {
    G.email.unshift({
      id: 'e' + U.uid(), from: m.from, to: m.to || null,
      subj: m.subj, body: m.body, attach: m.attach || null,
      t: G.time, read: m.read !== undefined ? m.read : false,
      mission: m.mission || null, kind: m.kind || 'mail'
    });
    if (m.kind === 'sent') Snd.send(); else Snd.mail();
    if (typeof UI !== 'undefined' && UI.onEmail) UI.onEmail();
  };

  /* =========================================================
     MEMORIA DO GATEWAY
     ========================================================= */
  G.storeFile = function (file, srcIp) {
    if (G.memFree() < file.size) return false;
    G.memory.push({
      id: 'm' + U.uid(), fileId: file.id, name: file.name, size: file.size,
      enc: file.enc, kind: file.kind, body: file.body, src: srcIp
    });
    return true;
  };
  G.deleteMem = function (id) {
    const i = G.memory.findIndex(f => f.id === id);
    if (i >= 0) G.memory.splice(i, 1);
  };

  /* =========================================================
     RELOGIO / LOOP
     ========================================================= */
  let lastT = 0;
  const listeners = [];
  G.onTick = function (fn) { listeners.push(fn); };

  G.loop = function (now) {
    if (!lastT) lastT = now;
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.5) dt = 0.5;

    if (!G.over && G.speed > 0) {
      /* relogio do jogo: G.speed minutos por segundo real */
      G.time += dt * G.speed;
      /* tarefas e traces correm em tempo real (nao aceleram) */
      Soft.tick(dt);
      Net.tick(dt);
      Missions.tick(dt);
      for (const fn of listeners) fn(dt);
    }
    UI.render();
    requestAnimationFrame(G.loop);
  };

  /* =========================================================
     SAVE / LOAD
     ========================================================= */
  G.save = function () {
    try {
      const blob = {
        version: G.version, seed: G.seed, handle: G.handle, time: G.time,
        credits: G.credits, points: G.points, neuroPoints: G.neuroPoints,
        gateway: G.gateway, software: G.software, memory: G.memory,
        links: G.links, email: G.email, missions: G.missions,
        bank: G.bank, passive: G.passive, flags: G.flags, world: G.world
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
      return true;
    } catch (e) {
      console.error('save falhou', e);
      return false;
    }
  };

  G.hasSave = function () { return !!localStorage.getItem(SAVE_KEY); };

  G.load = function () {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      const b = JSON.parse(raw);
      Object.assign(G, {
        version: b.version, seed: b.seed, handle: b.handle, time: b.time,
        credits: b.credits, points: b.points, neuroPoints: b.neuroPoints || 0,
        gateway: b.gateway, software: b.software, memory: b.memory,
        links: b.links, email: b.email, missions: b.missions,
        bank: b.bank, passive: b.passive || [], flags: b.flags || {}, world: b.world
      });
      G.speed = 1; G.over = false; G.tasks = [];
      G.conn = { route: [], target: null, live: false, screen: null, trace: null, startedAt: 0 };
      /* limpa estados de sessao residuais */
      Object.values(G.world.servers).forEach(s => {
        s.st = { logged: false, admin: false, proxyDown: false, fwDown: false, monFooled: false };
      });
      return true;
    } catch (e) {
      console.error('load falhou', e);
      return false;
    }
  };

  G.wipe = function () { localStorage.removeItem(SAVE_KEY); };

  /* =========================================================
     FIM DE JOGO
     ========================================================= */
  G.gameOver = function (title, text) {
    G.over = true;
    G.speed = 0;
    G.wipe();
    UI.gameOver(title, text);
  };

  G.srv = function (ip) { return G.world.servers[ip]; };

  global.G = G;
})(window);
