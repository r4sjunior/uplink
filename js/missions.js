/* =========================================================
   missions.js - geracao, aceite, verificacao e falha de contratos
   ========================================================= */
(function (global) {
  'use strict';

  const Missions = {};
  let lastGen = 0;

  function rng() { return U.makeRNG((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0); }

  /* servidores invadiveis; com maxDiff, filtra por seguranca compativel
     com o rating atual para nao jogar um novato contra um mainframe */
  function hackableServers(maxDiff) {
    const all = Object.values(G.world.servers).filter(s =>
      (s.type === 'internal' || s.type === 'mainframe') && s.files && s.files.length > 0);
    if (maxDiff === undefined) return all;
    const diff = s => (s.sec.proxy || 0) + (s.sec.firewall || 0) + (s.sec.monitor || 0);
    /* comeca no teto do rating e afrouxa ate ter alvos suficientes para
       que as ofertas nao apontem todas para o mesmo servidor */
    for (let d = maxDiff; d <= 16; d++) {
      const pool = all.filter(s => diff(s) <= d);
      if (pool.length >= 8) return pool;
    }
    return all;
  }

  /* teto de seguranca aceitavel para o rating do jogador */
  function secBudget() { return 2 + G.ratingIndex() * 2; }

  function corpName(r) { return r.pick(G.world.corps).name; }

  /* =========================================================
     GERACAO
     ========================================================= */
  Missions.generate = function () {
    const r = rng();
    const rating = G.ratingIndex();
    const pool = D.MISSION_TYPES.filter(t => t.minRating <= rating);
    if (!pool.length) return null;
    const type = r.pick(pool);
    const employer = corpName(r);
    const deadlineDays = r.int(3, 9);
    const base = r.int(type.reward[0], type.reward[1]);
    const payment = Math.round(base * (1 + rating * 0.12));
    const m = {
      id: 'm' + U.uid(),
      type: type.id,
      employer: employer,
      email: 'contratos@' + employer.toLowerCase().replace(/[^a-z]/g, '') + '.net',
      payment: payment,
      points: type.diff + 1,
      neuro: type.diff,
      deadline: G.time + deadlineDays * 24 * 60,
      posted: G.time,
      accepted: false,
      status: 'open'
    };

    switch (type.id) {
      case 'steal_file': {
        const srv = r.pick(hackableServers(secBudget()));
        const f = r.pick(srv.files);
        m.targetIp = srv.ip; m.targetName = srv.name;
        m.fileName = f.name; m.fileId = f.id;
        m.title = 'Roubar "' + f.name + '"';
        m.desc =
          'Existe um arquivo chamado ' + f.name + ' no servidor\n' +
          srv.name + ' (' + srv.ip + ').\n\n' +
          '1. Copie o arquivo para a memoria do seu gateway.\n' +
          '2. Se estiver criptografado, use o Decrypter - nao aceitamos\n' +
          '   material que nao conseguimos ler.\n' +
          '3. ENVIE o arquivo por e-mail para ' + m.email + '.\n' +
          '   Abra o cliente de e-mail, clique em ENVIAR ARQUIVO,\n' +
          '   escolha o contrato e o anexo.\n\n' +
          'O pagamento so e liberado quando o anexo chegar aqui.\n' +
          'Nao apague nada no servidor. Nao queremos alertar ninguem.';
        break;
      }
      case 'delete_file': {
        const srv = r.pick(hackableServers(secBudget()));
        const f = r.pick(srv.files);
        m.targetIp = srv.ip; m.targetName = srv.name;
        m.fileName = f.name; m.fileId = f.id;
        m.title = 'Destruir "' + f.name + '"';
        m.desc =
          'O arquivo ' + f.name + ' no servidor ' + srv.name + '\n(' + srv.ip + ') precisa deixar de existir.\n\n' +
          'Voce vai precisar vencer o proxy para ter permissao de escrita.\n' +
          'Apague o arquivo e depois limpe os logs.';
        break;
      }
      case 'destroy_system': {
        const cands = hackableServers().filter(s => s.type === 'mainframe');
        const srv = r.pick(cands.length ? cands : hackableServers());
        m.targetIp = srv.ip; m.targetName = srv.name;
        m.title = 'Destruir ' + srv.name;
        m.desc =
          'Queremos ' + srv.name + ' (' + srv.ip + ') completamente vazio.\n\n' +
          'Todos os arquivos devem ser removidos. Use o console administrativo\n' +
          'com o comando "delete all" ou apague um por um.\n' +
          'Isso vai levantar muito barulho. Prepare sua rota.';
        break;
      }
      case 'change_academic': {
        const p = r.pick(G.world.people);
        m.personId = p.id; m.personName = p.name;
        m.targetIp = G.world.special.iad; m.targetName = 'International Academic Database';
        if (r.chance(0.5)) {
          m.action = 'add';
          m.degree = r.pick(D.DEGREES);
          m.uni = r.pick(D.UNIS);
          m.title = 'Forjar diploma para ' + p.name;
          m.desc =
            'Nosso candidato ' + p.name + ' precisa de credenciais.\n\n' +
            'Adicione ao registro dele na International Academic Database\n' +
            '(' + m.targetIp + ') um diploma de:\n\n' +
            '   CURSO: ' + m.degree + '\n' +
            '   INSTITUICAO: ' + m.uni + '\n\n' +
            'Use a tela ACADEMIC do banco de dados apos obter acesso admin.';
        } else {
          m.action = 'remove';
          m.title = 'Apagar historico academico de ' + p.name;
          m.desc =
            'Remova TODAS as qualificacoes de ' + p.name + ' da\n' +
            'International Academic Database (' + m.targetIp + ').\n\n' +
            'Ele nao deve conseguir provar que estudou em lugar nenhum.';
        }
        break;
      }
      case 'change_criminal': {
        const p = r.pick(G.world.people);
        m.personId = p.id; m.personName = p.name;
        m.targetIp = G.world.special.gcd; m.targetName = 'Global Criminal Database';
        if (p.criminal.length && r.chance(0.55)) {
          m.action = 'clear';
          m.title = 'Limpar ficha criminal de ' + p.name;
          m.desc =
            'Remova todas as condenacoes de ' + p.name + ' do\n' +
            'Global Criminal Database (' + m.targetIp + ').\n\n' +
            'A ficha precisa ficar limpa. Sem excecoes.';
        } else {
          m.action = 'frame';
          m.crime = r.pick(D.CRIMES);
          m.title = 'Incriminar ' + p.name;
          m.desc =
            'Adicione uma condenacao por ' + m.crime + ' ao registro de\n' +
            p.name + ' no Global Criminal Database (' + m.targetIp + ').\n\n' +
            'Ele precisa se tornar inempregavel.';
        }
        break;
      }
      case 'trace_hacker': {
        const h = r.pick(G.world.hackers);
        const srv = r.pick(hackableServers(secBudget()));
        m.hackerHandle = h.handle;
        m.answer = h.ip;
        m.targetIp = srv.ip; m.targetName = srv.name;
        /* planta o log no alvo */
        const log = W.makeLog(Math.random, G.time - r.int(120, 3000),
          'ACESSO NAO AUTORIZADO detectado - origem ' + h.ip + ' [' + h.handle + ']', 'alert');
        log.id = 'l' + U.uid();
        srv.logs.unshift(log);
        srv.logs.sort((a, b) => b.t - a.t);
        m.title = 'Rastrear o hacker ' + h.handle;
        m.desc =
          'Um hacker chamado ' + h.handle + ' invadiu ' + srv.name + '\n' +
          '(' + srv.ip + ') recentemente.\n\n' +
          'Acesse o log server da maquina, encontre o registro da invasao\n' +
          'e informe o IP de origem no painel do contrato.\n\n' +
          'Se os logs tiverem sido apagados, use Log_UnDeleter.';
        break;
      }
      case 'steal_money': {
        const bankIp = r.pick(G.world.banks);
        const bank = G.srv(bankIp);
        const cands = bank.accounts.filter(a => !a.isPlayer && a.balance > 50000);
        const acc = cands.length ? r.pick(cands) : r.pick(bank.accounts);
        m.bankIp = bankIp; m.targetIp = bankIp; m.targetName = bank.name;
        m.accountNo = acc.no;
        m.amount = Math.min(acc.balance, r.int(20000, 120000));
        m.payment = Math.round(m.amount * 0.35);
        m.title = 'Desviar ' + U.credits(m.amount) + ' de uma conta';

        /* planta as credenciais em um Internal Services Machine */
        const inters = Object.values(G.world.servers).filter(x => x.type === 'internal');
        const host = r.pick(inters);
        const cf = W.makeFile(Math.random, {
          name: 'credenciais-financeiro', size: 2, enc: 2, kind: 'text',
          body:
            'ACESSO BANCARIO CORPORATIVO - CONFIDENCIAL\n\n' +
            'BANCO : ' + bank.name + '\n' +
            'IP    : ' + bankIp + '\n' +
            'CONTA : ' + acc.no + '\n' +
            'SENHA : ' + acc.pass + '\n' +
            'TITULAR: ' + acc.owner + '\n\n' +
            'Nao imprimir. Nao encaminhar. Trocar a cada 90 dias.'
        });
        host.files.push(cf);
        m.hintIp = host.ip;

        m.desc =
          'Alvo: conta ' + acc.no + ' (' + acc.owner + ') no ' + bank.name + '\n' +
          '(' + bankIp + ').\n\n' +
          'Transfira pelo menos ' + U.credits(m.amount) + ' para a sua propria conta\n' +
          '(numero ' + G.bank.no + ').\n' +
          'Voce fica com o dinheiro transferido e ainda recebe\n' +
          U.credits(m.payment) + ' de bonus.\n\n' +
          'INTELIGENCIA: a senha da conta esta em um arquivo chamado\n' +
          '"credenciais-financeiro" no servidor\n' +
          host.name + ' (' + host.ip + ').\n' +
          'O arquivo esta criptografado em nivel 2.';
        break;
      }
    }

    m.body =
      D.EMPLOYER_INTRO[Math.floor(Math.random() * D.EMPLOYER_INTRO.length)] + '\n\n' +
      m.desc + '\n\n' +
      'PAGAMENTO: ' + U.credits(m.payment) + '\n' +
      'PRAZO: ' + U.fmtDate(m.deadline) + '\n\n' +
      D.EMPLOYER_OUTRO[Math.floor(Math.random() * D.EMPLOYER_OUTRO.length)] + '\n\n' +
      '-- ' + m.employer;

    return m;
  };

  Missions.refresh = function (initial) {
    const want = initial ? 6 : 1;
    for (let i = 0; i < want; i++) {
      const m = Missions.generate();
      if (m) G.missions.available.push(m);
    }
    /* expira ofertas antigas */
    G.missions.available = G.missions.available.filter(m => m.deadline > G.time);
    if (G.missions.available.length > 12) {
      G.missions.available.splice(0, G.missions.available.length - 12);
    }
    lastGen = G.time;
  };

  /* =========================================================
     ACEITAR / ABANDONAR
     ========================================================= */
  Missions.accept = function (id) {
    const i = G.missions.available.findIndex(m => m.id === id);
    if (i < 0) return 'Contrato indisponivel.';
    const m = G.missions.available[i];
    if (G.missions.active.length >= 5) return 'Maximo de 5 contratos ativos.';
    G.missions.available.splice(i, 1);
    m.accepted = true;
    m.status = 'active';
    G.missions.active.push(m);
    if (m.targetIp && !G.links.includes(m.targetIp)) G.links.push(m.targetIp);
    if (m.hintIp && !G.links.includes(m.hintIp)) G.links.push(m.hintIp);
    G.addEmail({
      from: m.email, subj: 'CONTRATO ACEITO: ' + m.title,
      body: m.body, mission: m.id
    });
    UI.toast('Contrato aceito. Alvo adicionado aos links.', 'ok');
    return null;
  };

  Missions.abandon = function (id) {
    const i = G.missions.active.findIndex(m => m.id === id);
    if (i < 0) return 'Contrato nao encontrado.';
    const m = G.missions.active[i];
    G.missions.active.splice(i, 1);
    G.points = Math.max(0, G.points - 1);
    G.missions.failed++;
    UI.toast('Contrato abandonado. Rating penalizado.', 'warn');
    return null;
  };

  /* =========================================================
     ENTREGA DE ARQUIVO POR E-MAIL
     O contratante so paga depois de receber o anexo.
     Retorna {erro} ou {ok:true, aceito:bool, msg}
     ========================================================= */
  Missions.deliverables = function () {
    return G.missions.active.filter(m => m.type === 'steal_file' && !m.delivered);
  };

  Missions.sendFile = function (toEmail, memId) {
    if (!toEmail) return { erro: 'Escolha o contrato de destino.' };
    const f = G.memory.find(x => x.id === memId);
    if (!f) return { erro: 'Escolha um arquivo da memoria do gateway.' };
    if (f.enc) {
      return { erro: 'Arquivo criptografado (nivel ' + f.enc + '). Rode o Decrypter antes de enviar.' };
    }

    /* o anexo precisa ser exatamente o arquivo pedido, do servidor pedido */
    const exact = G.missions.active.find(m =>
      m.type === 'steal_file' && !m.delivered && m.email === toEmail &&
      m.fileName === f.name && m.targetIp === f.src);
    const any = G.missions.active.find(m =>
      m.type === 'steal_file' && !m.delivered && m.email === toEmail);

    G.addEmail({
      from: G.handle + '@uplink.net', to: toEmail, kind: 'sent', read: true,
      subj: 'Entrega: ' + f.name,
      attach: { name: f.name, size: f.size },
      body:
        'PARA: ' + toEmail + '\n' +
        'ANEXO: ' + f.name + '  (' + f.size + 'Gq, sem criptografia)\n\n' +
        'Segue o material solicitado.\n\n-- ' + G.handle
    });

    if (exact) {
      exact.delivered = true;
      return { ok: true, aceito: true, msg: 'Anexo entregue a ' + exact.employer + '.' };
    }

    /* anexo errado: o contratante devolve e o arquivo continua com voce */
    const employer = any ? any.employer : toEmail;
    const pedido = any ? any.fileName : 'o arquivo contratado';
    G.addEmail({
      from: toEmail,
      subj: 'RE: Entrega: ' + f.name + ' - ARQUIVO INCORRETO',
      body:
        'Isso nao e o que pedimos.\n\n' +
        'Recebido : ' + f.name + '\n' +
        'Esperado : ' + pedido + '\n\n' +
        (any && f.name === any.fileName
          ? 'O nome confere, mas a origem nao: queremos a copia que veio\nde ' +
            (G.srv(any.targetIp) ? G.srv(any.targetIp).name : any.targetIp) + '.\n\n'
          : '') +
        'O contrato continua aberto. Nao envie lixo de novo.\n\n-- ' + employer
    });
    return { ok: true, aceito: false, msg: 'Arquivo enviado, mas rejeitado pelo contratante.' };
  };

  /* =========================================================
     VERIFICACAO
     ========================================================= */
  Missions.check = function (m) {
    switch (m.type) {
      case 'steal_file': {
        /* nao basta ter o arquivo: ele precisa ter sido enviado
           por e-mail ao contratante (ver Missions.sendFile) */
        return m.delivered === true;
      }
      case 'delete_file': {
        const s = G.srv(m.targetIp);
        return s && !s.files.some(f => f.id === m.fileId);
      }
      case 'destroy_system': {
        const s = G.srv(m.targetIp);
        return s && s.files.length === 0;
      }
      case 'change_academic': {
        const p = G.world.people.find(x => x.id === m.personId);
        if (!p) return false;
        if (m.action === 'add') {
          return p.academic.extra.some(e => e.degree === m.degree && e.uni === m.uni);
        }
        return p.academic.wiped === true;
      }
      case 'change_criminal': {
        const p = G.world.people.find(x => x.id === m.personId);
        if (!p) return false;
        if (m.action === 'clear') return p.criminal.length === 0;
        return p.criminal.some(c => c.crime === m.crime && c.planted);
      }
      case 'trace_hacker': {
        return m.submitted === m.answer;
      }
      case 'steal_money': {
        return (m.transferred || 0) >= m.amount;
      }
    }
    return false;
  };

  Missions.complete = function (m) {
    const i = G.missions.active.findIndex(x => x.id === m.id);
    if (i >= 0) G.missions.active.splice(i, 1);
    m.status = 'done';
    m.completedAt = G.time;
    G.missions.done.push(m);
    G.pay(m.payment, 'Pagamento: ' + m.title);
    G.points += m.points;
    G.neuroPoints += m.neuro || 0;

    /* consome o arquivo entregue */
    if (m.type === 'steal_file') {
      const idx = G.memory.findIndex(f => f.name === m.fileName && f.src === m.targetIp);
      if (idx >= 0) G.memory.splice(idx, 1);
    }

    G.addEmail({
      from: m.email,
      subj: 'PAGAMENTO LIBERADO: ' + m.title,
      body:
        'Confirmamos a conclusao do servico.\n\n' +
        U.credits(m.payment) + ' foram transferidos para sua conta.\n' +
        '+' + m.points + ' pontos de rating Uplink.\n\n' +
        'Nunca nos falamos.\n\n-- ' + m.employer
    });
    Snd.success();
    setTimeout(function () { Snd.money(); }, 420);
    UI.toast('CONTRATO CONCLUIDO: +' + U.credits(m.payment), 'ok');
    G.save();
  };

  Missions.fail = function (m, reason) {
    const i = G.missions.active.findIndex(x => x.id === m.id);
    if (i >= 0) G.missions.active.splice(i, 1);
    m.status = 'failed';
    G.missions.failed++;
    G.points = Math.max(0, G.points - 2);
    G.addEmail({
      from: m.email,
      subj: 'CONTRATO CANCELADO: ' + m.title,
      body: 'O prazo expirou. ' + (reason || 'Contratamos outra pessoa.') +
        '\n\nSeu rating foi reportado a Uplink Corporation.\n\n-- ' + m.employer
    });
    Snd.fail();
    UI.toast('Contrato falhou: prazo expirado.', 'bad');
  };

  /* =========================================================
     TICK
     ========================================================= */
  let acc = 0;
  Missions.tick = function (dt) {
    acc += dt;
    if (acc < 0.5) return;
    acc = 0;

    for (let i = G.missions.active.length - 1; i >= 0; i--) {
      const m = G.missions.active[i];
      if (Missions.check(m)) { Missions.complete(m); continue; }
      if (G.time > m.deadline) Missions.fail(m);
    }
    G.missions.available = G.missions.available.filter(m => m.deadline > G.time);

    /* novas ofertas a cada ~12h de jogo */
    if (G.time - lastGen > 12 * 60) {
      if (G.missions.available.length < 10) {
        const m = Missions.generate();
        if (m) {
          G.missions.available.push(m);
          UI.badge('uis', G.missions.available.length);
        }
      }
      lastGen = G.time;
    }
  };

  global.Missions = Missions;
})(window);
