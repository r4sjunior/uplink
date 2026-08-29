/* =========================================================
   world.js - geracao procedural do mundo
   ========================================================= */
(function (global) {
  'use strict';

  const W = {};

  function makePassword(rng, hard) {
    if (!hard && rng.chance(0.22)) return rng.pick(D.COMMON_PASS);
    let n = rng.int(2, 3), s = '';
    for (let i = 0; i < n; i++) s += rng.pick(D.SYLL);
    if (rng.chance(0.5)) s += rng.int(10, 99);
    return s;
  }

  function personName(rng) {
    return rng.pick(D.FIRST) + ' ' + rng.pick(D.LAST);
  }

  function fileName(rng) {
    return rng.pick(D.FILE_TOPICS) + '-' + rng.pick(D.FILE_CODES) +
      (rng.chance(0.5) ? '-v' + rng.int(1, 9) : '');
  }

  function makeFile(rng, opts) {
    opts = opts || {};
    return {
      id: 'f' + Math.floor(rng() * 1e9).toString(36),
      name: opts.name || fileName(rng),
      size: opts.size || rng.int(1, 8),
      enc: opts.enc !== undefined ? opts.enc : (rng.chance(0.35) ? rng.int(1, 4) : 0),
      kind: opts.kind || 'data',
      body: opts.body || null
    };
  }

  function makeLog(rng, time, txt, kind) {
    return { id: 'l' + Math.floor(rng() * 1e9).toString(36), t: time, txt: txt, kind: kind || 'sys', deleted: false, modified: false };
  }

  /* logs de fundo plausiveis */
  function seedLogs(rng, srv, now) {
    const n = rng.int(4, 10);
    for (let i = 0; i < n; i++) {
      const t = now - rng.int(60, 60 * 24 * 20);
      const ip = U.randIP(rng);
      const kinds = [
        'Conexao de ' + ip + ' - rotina',
        'Conexao de ' + ip + ' - acesso admin concedido',
        'Backup automatico concluido',
        'Usuario ' + personName(rng).split(' ')[0].toLowerCase() + ' efetuou login',
        'Falha de autenticacao a partir de ' + ip,
        'Manutencao programada finalizada'
      ];
      srv.logs.push(makeLog(rng, t, rng.pick(kinds)));
    }
    srv.logs.sort((a, b) => b.t - a.t);
  }

  function baseServer(rng, o) {
    const city = rng.pick(D.CITIES);
    return {
      ip: o.ip || U.randIP(rng),
      name: o.name,
      type: o.type,
      corp: o.corp || null,
      city: o.city || city[0],
      x: o.x !== undefined ? o.x : city[1],
      y: o.y !== undefined ? o.y : city[2],
      sec: Object.assign({ pass: null, proxy: 0, firewall: 0, monitor: 0, admin: null }, o.sec || {}),
      /* estado de sessao - resetado ao desconectar */
      st: { logged: false, admin: false, proxyDown: false, fwDown: false, monFooled: false },
      files: o.files || [],
      logs: o.logs || [],
      accounts: o.accounts || null,
      records: o.records || null,
      traceBase: o.traceBase || 60,
      screens: o.screens || ['menu'],
      publicList: !!o.publicList,
      notes: o.notes || ''
    };
  }

  /* =========================================================
     GERACAO
     ========================================================= */
  W.generate = function (seed, now) {
    const rng = U.makeRNG(seed);
    const world = { servers: {}, corps: [], people: [], banks: [], order: [] };

    function add(srv) { world.servers[srv.ip] = srv; world.order.push(srv.ip); return srv; }

    /* --- pessoas --- */
    const nPeople = 90;
    for (let i = 0; i < nPeople; i++) {
      const p = {
        id: 'p' + i,
        name: personName(rng),
        born: rng.int(1955, 1992),
        academic: {
          uni: rng.pick(D.UNIS),
          degree: rng.pick(D.DEGREES),
          grade: rng.pick(D.CLASSES),
          year: rng.int(1978, 2008),
          extra: []
        },
        criminal: [],
        social: { employer: null, salary: rng.int(18000, 190000), status: 'Ativo' }
      };
      if (rng.chance(0.28)) {
        const nc = rng.int(1, 2);
        for (let c = 0; c < nc; c++) {
          p.criminal.push({
            crime: rng.pick(D.CRIMES),
            year: rng.int(1995, 2009),
            sentence: rng.pick(['Multa', '6 meses', '2 anos', '5 anos', 'Condicional'])
          });
        }
      }
      world.people.push(p);
    }

    /* --- corporacoes e seus servidores --- */
    const corpNames = rng.shuffle(D.CORPS);
    corpNames.forEach((cn, idx) => {
      const city = rng.pick(D.CITIES);
      const size = rng.int(1, 3);          /* 1=pequena 3=grande */
      const corp = { id: 'c' + idx, name: cn, size: size, city: city[0], servers: [] };

      /* servidor publico */
      const pub = add(baseServer(rng, {
        name: cn + ' Public Access Server',
        type: 'public', corp: corp.id, city: city[0], x: city[1], y: city[2],
        traceBase: 300, screens: ['info'], publicList: true,
        notes: 'Servidor institucional. Sem dados sensiveis.'
      }));
      corp.servers.push(pub.ip);

      /* internal services */
      const nfiles = rng.int(3, 7) + size * 2;
      const files = [];
      for (let i = 0; i < nfiles; i++) files.push(makeFile(rng));
      const ism = add(baseServer(rng, {
        name: cn + ' Internal Services Machine',
        type: 'internal', corp: corp.id, city: city[0],
        x: city[1] + rng.int(-2, 2), y: city[2] + rng.int(-2, 2),
        sec: {
          pass: makePassword(rng, size >= 2),
          proxy: rng.int(0, size + 1),
          firewall: rng.int(0, size),
          monitor: rng.int(1, size + 2)
        },
        files: files,
        traceBase: 120 - size * 15 + rng.int(-10, 15),
        screens: ['menu', 'files', 'logs']
      }));
      seedLogs(rng, ism, now);
      corp.servers.push(ism.ip);

      /* mainframe apenas para corporacoes grandes */
      if (size >= 2) {
        const mfFiles = [];
        for (let i = 0; i < rng.int(5, 12); i++) mfFiles.push(makeFile(rng, { enc: rng.int(1, 6) }));
        const mf = add(baseServer(rng, {
          name: cn + ' Central Mainframe',
          type: 'mainframe', corp: corp.id, city: city[0],
          x: city[1] + rng.int(-3, 3), y: city[2] + rng.int(-3, 3),
          sec: {
            pass: makePassword(rng, true),
            proxy: rng.int(2, 5), firewall: rng.int(2, 5), monitor: rng.int(3, 5),
            admin: makePassword(rng, true)
          },
          files: mfFiles,
          traceBase: 70 - size * 5 + rng.int(-8, 8),
          screens: ['menu', 'files', 'logs', 'console']
        }));
        seedLogs(rng, mf, now);
        corp.servers.push(mf.ip);
      }
      world.corps.push(corp);
    });

    /* --- empregadores das pessoas --- */
    world.people.forEach(p => {
      p.social.employer = rng.pick(world.corps).name;
    });

    /* --- bancos --- */
    D.BANKS.forEach((bn, i) => {
      const city = rng.pick(D.CITIES);
      const accounts = [];
      const nacc = rng.int(14, 22);
      for (let a = 0; a < nacc; a++) {
        const owner = rng.chance(0.55) ? rng.pick(world.people).name : rng.pick(world.corps).name;
        accounts.push({
          no: String(rng.int(10000000, 99999999)),
          owner: owner,
          pass: makePassword(rng, true),
          balance: rng.chance(0.2) ? rng.int(200000, 3000000) : rng.int(2000, 90000),
          statements: []
        });
      }
      const b = add(baseServer(rng, {
        name: bn, type: 'bank', city: city[0], x: city[1], y: city[2],
        sec: { pass: null, proxy: rng.int(3, 5), firewall: rng.int(2, 4), monitor: rng.int(4, 5) },
        accounts: accounts,
        traceBase: 45 + rng.int(-8, 10),
        screens: ['bank_login', 'logs']
      }));
      seedLogs(rng, b, now);
      world.banks.push(b.ip);
    });

    /* --- servidores globais --- */
    const iad = add(baseServer(rng, {
      ip: '128.128.128.10', name: 'International Academic Database', type: 'academic',
      city: 'Geneva', x: 48, y: 30,
      sec: { pass: makePassword(rng, true), proxy: 3, firewall: 3, monitor: 4 },
      traceBase: 80, screens: ['academic', 'logs'], publicList: true
    }));
    seedLogs(rng, iad, now);

    const gcd = add(baseServer(rng, {
      ip: '128.128.128.20', name: 'Global Criminal Database', type: 'criminal',
      city: 'Den Haag', x: 47, y: 27,
      sec: { pass: makePassword(rng, true), proxy: 4, firewall: 4, monitor: 5 },
      traceBase: 55, screens: ['criminal', 'logs'], publicList: true
    }));
    seedLogs(rng, gcd, now);

    const ssd = add(baseServer(rng, {
      ip: '128.128.128.30', name: 'Social Security Database', type: 'social',
      city: 'Washington', x: 25, y: 37,
      sec: { pass: makePassword(rng, true), proxy: 3, firewall: 3, monitor: 4 },
      traceBase: 70, screens: ['social', 'logs'], publicList: true
    }));
    seedLogs(rng, ssd, now);

    const internic = add(baseServer(rng, {
      ip: '192.168.0.1', name: 'InterNIC', type: 'internic',
      city: 'Reston', x: 25, y: 38,
      traceBase: 600, screens: ['internic'], publicList: true,
      notes: 'Diretorio publico de servidores registrados.'
    }));

    const uplinkPub = add(baseServer(rng, {
      ip: '234.773.0.666', name: 'Uplink Public Access Server', type: 'uplinkpub',
      city: 'Undisclosed', x: 41, y: 21,
      traceBase: 900, screens: ['info'], publicList: true,
      notes: 'Trust Is A Weakness.'
    }));

    const uplinkTest = add(baseServer(rng, {
      ip: '234.773.0.1', name: 'Uplink Test Machine', type: 'test',
      city: 'Undisclosed', x: 38, y: 15,
      sec: { pass: 'rosebud', proxy: 0, firewall: 0, monitor: 0 },
      files: [makeFile(rng, { name: 'README-treinamento', size: 1, enc: 0, kind: 'text',
        body: 'Maquina de treino da Uplink Corporation.\n\nUse-a para testar softwares novos sem risco.\nO monitor esta desligado: nenhum trace sera iniciado aqui.' })],
      traceBase: 9999, screens: ['menu', 'files', 'logs'],
      publicList: true, notes: 'Sem proxy, sem firewall e sem monitor. Seguro para praticar.'
    }));
    seedLogs(rng, uplinkTest, now);

    /* --- hackers rivais (alvos de missao trace_hacker) --- */
    world.hackers = rng.pickMany(D.HANDLES, 12).map((h, i) => ({
      id: 'h' + i, handle: h, ip: U.randIP(rng), rating: rng.int(1, 9)
    }));

    world.special = {
      iad: iad.ip, gcd: gcd.ip, ssd: ssd.ip,
      internic: internic.ip, uplinkPub: uplinkPub.ip, test: uplinkTest.ip
    };

    return world;
  };

  /* utilitarios usados fora */
  W.makeFile = makeFile;
  W.makeLog = makeLog;
  W.makePassword = makePassword;
  W.personName = personName;
  W.fileName = fileName;

  global.W = W;
})(window);
