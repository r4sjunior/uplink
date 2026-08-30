/* =========================================================
   server_ui.js - telas do servidor remoto durante a conexao
   ========================================================= */
(function (global) {
  'use strict';

  const ServerUI = {};

  function el(t, c, x) { return U.el(t, c, x); }
  function btn(label, cls, fn, dis) {
    const b = U.el('button', 'btn ' + (cls || ''), label);
    if (dis) b.disabled = true; else b.addEventListener('click', fn);
    return b;
  }
  function table(hs) {
    const t = U.el('table', 'tbl'), th = U.el('thead'), tr = U.el('tr');
    hs.forEach(h => tr.appendChild(U.el('th', null, h)));
    th.appendChild(tr); t.appendChild(th);
    t.tbody = U.el('tbody'); t.appendChild(t.tbody);
    return t;
  }
  function trow(cells, cls, onclick) {
    const tr = U.el('tr', cls || '');
    cells.forEach(c => {
      const td = U.el('td');
      if (c instanceof Node) td.appendChild(c); else td.innerHTML = c;
      tr.appendChild(td);
    });
    if (onclick) { tr.classList.add('clickable'); tr.addEventListener('click', onclick); }
    return tr;
  }
  function inp(k, ph, val, type) {
    const i = U.el('input', 'f'); i.dataset.k = k; i.placeholder = ph || '';
    if (val !== undefined) i.value = val;
    if (type) i.type = type;
    i.spellcheck = false;
    return i;
  }
  function note(txt, cls) { return U.el('div', (cls || 'muted') + ' mt', txt); }

  /* =========================================================
     RENDER PRINCIPAL
     ========================================================= */
  ServerUI.render = function (body, rec) {
    if (!G.conn.live) {
      body.appendChild(el('div', 'mono-block', 'Conexao encerrada.'));
      return;
    }
    const s = G.srv(G.conn.target);
    if (!s) { body.appendChild(el('div', 'mono-block', 'Servidor inacessivel.')); return; }
    rec.state.st = rec.state.st || {};

    /* cabecalho */
    const head = el('div', 'srv-head');
    const l = el('div');
    l.appendChild(el('div', 'srv-name', s.name));
    l.appendChild(el('div', 'srv-ip', s.ip + '  ::  ' + s.city + '  ::  ' + s.type.toUpperCase()));
    head.appendChild(l);
    const r = el('div', 'row');
    if (G.conn.trace) {
      const v = G.swVersion('trace_tracker');
      const tr = G.conn.trace;
      const txt = v >= 3 ? 'TRACE ' + U.fmtSecs(tr.left)
        : v === 2 ? 'TRACE ' + Math.round(100 - (tr.left / tr.total) * 100) + '%'
        : 'TRACE ATIVO';
      const tag = el('div', 'pill r blink', txt);
      tag.style.padding = '5px 10px';
      r.appendChild(tag);
    }
    r.appendChild(btn('DESCONECTAR', 'btn-danger btn-mini', () => { Net.disconnect(); }));
    head.appendChild(r);
    body.appendChild(head);

    /* corpo dividido */
    const split = el('div', 'srv-split');
    const main = el('div', 'srv-main');
    main.dataset.scroll = 'main';
    split.appendChild(main);
    split.appendChild(swDock(s, rec));
    body.appendChild(split);

    /* navegacao */
    body.appendChild(nav(s, rec));

    /* tela atual */
    const screen = G.conn.screen || 'login';
    const fn = ServerUI['scr_' + screen];
    if (fn) fn(main, s, rec);
    else main.appendChild(el('div', 'mono-block', 'Tela indisponivel: ' + screen));
  };

  /* =========================================================
     NAVEGACAO
     ========================================================= */
  function nav(s, rec) {
    const n = el('div', 'srv-nav');
    const logged = !s.sec.pass || s.st.logged;
    const items = [];
    if (s.sec.pass) items.push(['login', 'LOGIN']);
    (s.screens || []).forEach(sc => {
      const labels = {
        menu: 'MENU', files: 'FILE SERVER', logs: 'LOG SERVER', console: 'CONSOLE',
        info: 'INFO', academic: 'ACADEMICO', criminal: 'CRIMINAL', social: 'SOCIAL',
        internic: 'DIRETORIO', bank_login: 'LOGIN', bank_accounts: 'CONTAS',
        socialnet: 'PLATAFORMA', cctv: 'CAMERAS'
      };
      if (s.type === 'cctv') labels.files = 'GRAVACOES';
      if (s.type === 'socialnet') labels.files = 'ARQUIVOS';
      items.push([sc, labels[sc] || sc.toUpperCase()]);
    });
    if (s.type === 'bank' && s.st.logged) items.push(['bank_accounts', 'CONTA']);

    const seen = {};
    items.forEach(([k, lab]) => {
      if (seen[k]) return; seen[k] = 1;
      const b = U.el('button', G.conn.screen === k ? 'on' : '', lab);
      const needsLogin = !['login', 'info', 'internic', 'bank_login'].includes(k);
      if (needsLogin && !logged) b.disabled = true;
      else b.addEventListener('click', () => { G.conn.screen = k; UI.dirty(); });
      n.appendChild(b);
    });
    return n;
  }

  /* =========================================================
     DOCK DE SOFTWARE
     ========================================================= */
  function swDock(s, rec) {
    const d = el('div', 'sw-dock');

    if (G.tasks.length) {
      d.appendChild(el('div', 'sw-head', 'EM EXECUCAO'));
      G.tasks.forEach(t => d.appendChild(Apps.taskBox(t)));
    }

    d.appendChild(el('div', 'sw-head', 'SEGURANCA DO ALVO'));
    const sec = el('div');
    sec.style.cssText = 'font-size:10px;line-height:1.7;padding:4px';
    sec.innerHTML =
      lineSec('PASSWORD', s.sec.pass ? (s.st.logged ? 'QUEBRADA' : 'ATIVA') : 'AUSENTE', s.st.logged || !s.sec.pass) +
      lineSec(lvl('PROXY', s.sec.proxy), s.sec.proxy ? (s.st.proxyDown ? 'VENCIDO' : 'ATIVO') : 'AUSENTE', s.st.proxyDown || !s.sec.proxy) +
      lineSec(lvl('FIREWALL', s.sec.firewall), s.sec.firewall ? (s.st.fwDown ? 'VENCIDO' : 'ATIVO') : 'AUSENTE', s.st.fwDown || !s.sec.firewall) +
      lineSec(lvl('MONITOR', s.sec.monitor), s.sec.monitor ? (s.st.monFooled ? 'ENGANADO' : 'ATIVO') : 'AUSENTE', s.st.monFooled || !s.sec.monitor);
    d.appendChild(sec);

    d.appendChild(el('div', 'sw-head', 'FERRAMENTAS'));
    const relevant = ['password_breaker', 'dictionary_hacker', 'monitor_bypass',
      'proxy_bypass', 'proxy_disable', 'firewall_bypass', 'firewall_disable',
      'log_undeleter', 'defrag'];
    let any = false;
    relevant.forEach(id => {
      const sw = G.software.find(x => x.id === id);
      if (!sw) return;
      any = true;
      const meta = D.SW_BY_ID[id];
      const it = el('div', 'sw-item' + (Soft.isRunning(id) ? ' running' : ''));
      it.appendChild(el('span', null, meta.name.replace(/_/g, ' ')));
      it.appendChild(el('span', 'muted', 'v' + sw.v));
      it.title = meta.desc;
      it.addEventListener('click', () => {
        const err = Soft.run(id, { srv: s });
        if (err) UI.toast(err, 'bad');
        UI.dirty();
      });
      d.appendChild(it);
    });
    if (s.sec.admin && !s.st.admin && G.hasSw('password_breaker')) {
      const it = el('div', 'sw-item');
      it.appendChild(el('span', null, 'BREAK ADMIN'));
      it.appendChild(el('span', 'muted', '!'));
      it.title = 'Quebrar a senha administrativa (necessario para o console).';
      it.addEventListener('click', () => {
        const err = Soft.run('password_breaker', { srv: s, admin: true });
        if (err) UI.toast(err, 'bad');
        UI.dirty();
      });
      d.appendChild(it);
    }
    if (!any) d.appendChild(el('div', 'muted', 'Nenhuma ferramenta relevante.'));
    return d;
  }

  function lvl(name, n) { return n > 0 ? name + ' ' + n : name; }

  function lineSec(name, val, ok) {
    return '<div style="display:flex;justify-content:space-between">' +
      '<span class="muted">' + name + '</span>' +
      '<span class="' + (ok ? 'ok' : 'bad') + '">' + val + '</span></div>';
  }

  /* =========================================================
     TELA: LOGIN
     ========================================================= */
  ServerUI.scr_login = function (m, s, rec) {
    m.appendChild(el('h2', 'sec', 'AUTENTICACAO NECESSARIA'));
    if (s.st.logged) {
      m.appendChild(el('div', 'mono-block ok', 'Acesso concedido.\nUse a navegacao abaixo.'));
      if (s.st.admin) m.appendChild(note('Sessao ADMINISTRATIVA ativa.', 'ok'));
      return;
    }
    m.appendChild(el('div', 'mono-block',
      'SISTEMA: ' + s.name + '\nUSUARIO: admin\n\nInforme a senha ou utilize o Password_Breaker no painel a direita.'));
    const f = U.el('div', 'row mt');
    const i = inp('pw', 'senha', '', 'password');
    i.style.width = '200px';
    i.addEventListener('keydown', e => { if (e.key === 'Enter') tryPass(); });
    f.appendChild(i);
    f.appendChild(btn('ENTRAR', 'btn-primary', tryPass));
    m.appendChild(f);

    function tryPass() {
      const v = i.value.trim();
      if (v === s.sec.pass) {
        s.st.logged = true;
        Snd.crack();
        UI.toast('Acesso concedido.', 'ok');
        G.conn.screen = s.screens[0];
      } else {
        Net.illegal(s, 1);
        UI.toast('Senha incorreta.', 'bad');
        s.logs.unshift(mkLog('Falha de autenticacao'));
      }
      UI.dirty();
    }
  };

  function mkLog(txt) {
    const l = W.makeLog(Math.random, G.time, txt, 'alert');
    l.id = 'l' + U.uid();
    return l;
  }

  /* =========================================================
     TELA: INFO / MENU
     ========================================================= */
  ServerUI.scr_info = function (m, s) {
    m.appendChild(el('h2', 'sec', s.name));
    const c = s.corp ? (G.world.corps.find(x => x.id === s.corp) || {}).name : null;
    m.appendChild(el('div', 'mono-block',
      'SERVIDOR PUBLICO\n\n' +
      (c ? 'ORGANIZACAO: ' + c + '\n' : '') +
      'LOCALIZACAO: ' + s.city + '\n' +
      'IP: ' + s.ip + '\n\n' +
      (s.notes || 'Nenhuma informacao adicional disponivel ao publico.') + '\n\n' +
      'Este servidor nao armazena dados sensiveis. E um excelente\n' +
      'ponto de bounce, no entanto.'));
  };

  ServerUI.scr_menu = function (m, s) {
    m.appendChild(el('h2', 'sec', 'MENU PRINCIPAL'));
    m.appendChild(el('div', 'mono-block',
      'Bem-vindo, admin.\n\nSistemas disponiveis:\n' +
      (s.screens.includes('files') ? '  - FILE SERVER   (' + s.files.length + ' arquivos)\n' : '') +
      (s.screens.includes('logs') ? '  - LOG SERVER    (' + s.logs.length + ' registros)\n' : '') +
      (s.screens.includes('console') ? '  - CONSOLE ADMIN (requer senha administrativa)\n' : '')));
    if (s.sec.admin && !s.st.admin) {
      m.appendChild(note('O console exige uma segunda senha (administrativa). Use BREAK ADMIN no painel lateral.', 'warn'));
    }
  };

  /* =========================================================
     TELA: FILE SERVER
     ========================================================= */
  ServerUI.scr_files = function (m, s, rec) {
    m.appendChild(el('h2', 'sec', 'FILE SERVER'));
    if (s.sec.firewall > 0 && !s.st.fwDown) {
      m.appendChild(el('div', 'mono-block bad',
        'FIREWALL ATIVO (nivel ' + s.sec.firewall + ')\n\n' +
        'A listagem de arquivos esta bloqueada.\n' +
        'Execute Firewall_Bypass v' + s.sec.firewall + ' ou superior.'));
      return;
    }
    if (!s.files.length) {
      m.appendChild(el('div', 'mono-block', 'Nenhum arquivo neste servidor.'));
      return;
    }
    const writeOk = !(s.sec.proxy > 0 && !s.st.proxyDown);
    if (!writeOk) m.appendChild(note('Proxy ativo: apenas leitura. Copiar e permitido, apagar nao.', 'warn'));

    const t = table(['ARQUIVO', 'TAM', 'CRIPTO', 'ACOES']);
    s.files.forEach(f => {
      const acts = U.el('div', 'row');
      acts.appendChild(btn('COPIAR', 'btn-mini', () => {
        const err = Soft.run('file_copier', { srv: s, file: f });
        if (err) UI.toast(err, 'bad'); UI.dirty();
      }, !G.hasSw('file_copier')));
      acts.appendChild(btn('APAGAR', 'btn-mini btn-danger', () => {
        const err = Soft.run('file_deleter', { srv: s, file: f });
        if (err) UI.toast(err, 'bad'); UI.dirty();
      }, !G.hasSw('file_deleter') || !writeOk));
      if (f.body && !f.enc) {
        acts.appendChild(btn('LER', 'btn-mini', () => {
          UI.open('reader', {
            title: 'ARQUIVO: ' + f.name, w: 520, h: 380,
            render: b => { b.appendChild(el('div', 'mono-block', f.body)); }
          });
        }));
      }
      t.tbody.appendChild(trow([
        '<span class="hi">' + U.esc(f.name) + '</span>',
        f.size + 'Gq',
        f.enc ? '<span class="bad">nivel ' + f.enc + '</span>' : '<span class="ok">nao</span>',
        acts
      ]));
    });
    m.appendChild(t);
  };

  /* =========================================================
     TELA: LOG SERVER
     ========================================================= */
  ServerUI.scr_logs = function (m, s, rec) {
    m.appendChild(el('h2', 'sec', 'LOG SERVER'));
    const writeOk = !(s.sec.proxy > 0 && !s.st.proxyDown);
    if (!writeOk) m.appendChild(note('Proxy ativo: os registros nao podem ser alterados. Vença o proxy primeiro.', 'warn'));
    else m.appendChild(note('Apague ao menos o registro da SUA conexao antes de desconectar.', 'warn'));

    const mine = (G.conn.trail || []).find(h => h.ip === s.ip);
    const t = table(['DATA', 'REGISTRO', 'ACOES']);
    Net.visibleLogs(s).forEach(lg => {
      const acts = U.el('div', 'row');
      acts.appendChild(btn('DEL', 'btn-mini btn-danger', () => {
        const err = Soft.run('log_deleter', { srv: s, log: lg });
        if (err) UI.toast(err, 'bad'); UI.dirty();
      }, !G.hasSw('log_deleter') || !writeOk || lg.deleted));
      if (G.hasSw('log_modifier')) {
        acts.appendChild(btn('MOD', 'btn-mini', () => {
          const err = Soft.run('log_modifier', { srv: s, log: lg });
          if (err) UI.toast(err, 'bad'); UI.dirty();
        }, !writeOk));
      }
      const isMine = mine && mine.logId === lg.id;
      t.tbody.appendChild(trow([
        '<span class="muted">' + U.fmtDate(lg.t) + '</span>',
        (isMine ? '<span class="bad">[VOCE] </span>' : '') +
        '<span class="' + (lg.deleted ? 'muted' : (lg.kind === 'alert' ? 'warn' : '')) + '">' +
        U.esc(lg.txt) + '</span>',
        acts
      ], isMine ? 'sel' : ''));
    });
    m.appendChild(t);
  };

  /* =========================================================
     TELA: CONSOLE
     ========================================================= */
  ServerUI.scr_console = function (m, s, rec) {
    if (s.sec.admin && !s.st.admin) {
      m.appendChild(el('h2', 'sec', 'CONSOLE ADMINISTRATIVO'));
      m.appendChild(el('div', 'mono-block bad',
        'ACESSO NEGADO\n\nEste console exige credenciais administrativas.\n' +
        'Use BREAK ADMIN no painel lateral.'));
      return;
    }
    rec.state.con = rec.state.con || [
      'Uplink Remote Shell v2.1',
      'Conectado a ' + s.name,
      'Digite "help" para a lista de comandos.',
      ''
    ];
    const box = el('div', 'console');
    const out = el('div', 'console-out', rec.state.con.join('\n'));
    out.dataset.scroll = 'con';
    out.dataset.stick = 'bottom';
    const inRow = el('div', 'console-in');
    inRow.appendChild(el('span', null, '#'));
    const i = inp('cmd', '');
    inRow.appendChild(i);
    box.appendChild(out); box.appendChild(inRow);
    m.appendChild(box);

    i.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const cmd = i.value.trim();
      i.value = '';
      rec.state.con.push('# ' + cmd);
      exec(cmd);
      UI.dirty();
    });

    function say(t) { rec.state.con.push(t); }

    function exec(cmd) {
      const parts = cmd.split(/\s+/);
      const c = (parts[0] || '').toLowerCase();
      switch (c) {
        case '':
          break;
        case 'help':
          say('Comandos:');
          say('  ls              lista arquivos');
          say('  cat <arquivo>   exibe conteudo (se nao criptografado)');
          say('  delete <arq>    apaga um arquivo');
          say('  delete all      apaga TODOS os arquivos do sistema');
          say('  users           lista contas do sistema');
          say('  shutdown        derruba o servidor');
          say('  logs            resumo do log server');
          say('  disconnect      encerra a conexao');
          break;
        case 'ls':
          if (!s.files.length) say('(vazio)');
          s.files.forEach(f => say('  ' + f.name + '  ' + f.size + 'Gq' + (f.enc ? '  [cripto ' + f.enc + ']' : '')));
          break;
        case 'cat': {
          const f = s.files.find(x => x.name.toLowerCase() === (parts[1] || '').toLowerCase());
          if (!f) { say('arquivo nao encontrado'); break; }
          if (f.enc) { say('erro: arquivo criptografado (nivel ' + f.enc + ')'); break; }
          say(f.body || '<dados binarios ilegiveis neste terminal>');
          break;
        }
        case 'delete': {
          if (s.sec.proxy > 0 && !s.st.proxyDown) { say('erro: proxy ativo, permissao negada'); break; }
          if ((parts[1] || '').toLowerCase() === 'all') {
            const n = s.files.length;
            Net.illegal(s, 4);
            Snd.wipe();
            s.files.length = 0;
            s.logs.unshift(mkLog('ALERTA CRITICO: exclusao em massa - ' + n + ' arquivos'));
            say(n + ' arquivos removidos.');
            say('AVISO: exclusao em massa registrada no log do sistema.');
            UI.toast('Sistema esvaziado (' + n + ' arquivos).', 'warn');
            break;
          }
          const idx = s.files.findIndex(x => x.name.toLowerCase() === (parts[1] || '').toLowerCase());
          if (idx < 0) { say('arquivo nao encontrado'); break; }
          Net.illegal(s, 2);
          Snd.del();
          say('removido: ' + s.files[idx].name);
          s.logs.unshift(mkLog('Arquivo removido: ' + s.files[idx].name));
          s.files.splice(idx, 1);
          break;
        }
        case 'users':
          say('  admin        (superusuario)');
          say('  backup       (servico)');
          say('  ' + (s.corp ? 'corp_sync' : 'guest') + '     (servico)');
          break;
        case 'logs':
          say(s.logs.length + ' registros. ' + s.logs.filter(l => l.deleted).length + ' apagados.');
          break;
        case 'shutdown':
          if (s.sec.proxy > 0 && !s.st.proxyDown) { say('erro: proxy ativo, permissao negada'); break; }
          Net.illegal(s, 3);
          Snd.disable();
          say('Encerrando servicos... conexao sera perdida.');
          setTimeout(() => { Net.disconnect(); }, 900);
          break;
        case 'disconnect':
          Net.disconnect();
          break;
        default:
          say('comando desconhecido: ' + c);
      }
      say('');
      if (rec.state.con.length > 300) rec.state.con.splice(0, rec.state.con.length - 300);
    }
  };

  /* =========================================================
     TELA: INTERNIC
     ========================================================= */
  ServerUI.scr_internic = function (m, s, rec) {
    m.appendChild(el('h2', 'sec', 'INTERNIC - DIRETORIO PUBLICO DE SERVIDORES'));
    m.appendChild(note('Adicione servidores aos seus links para usa-los como saltos de bounce.', 'muted'));

    const search = U.el('div', 'row mt mb');
    const f = inp('q', 'filtrar por nome...');
    f.style.width = '260px';
    f.addEventListener('input', () => { rec.state.q = f.value; UI.dirty(); });
    search.appendChild(f);
    m.appendChild(search);

    const q = (rec.state.q || '').toLowerCase();
    const all = Object.values(G.world.servers)
      .filter(x => x.publicList || x.type === 'public' || x.type === 'internal' || x.type === 'mainframe' || x.type === 'bank')
      .filter(x => !q || x.name.toLowerCase().includes(q) || x.ip.includes(q));

    const t = table(['SERVIDOR', 'IP', 'LOCAL', '']);
    all.slice(0, 140).forEach(x => {
      const has = G.links.includes(x.ip);
      const b = has ? U.el('span', 'pill g', 'NOS LINKS')
        : btn('+ LINK', 'btn-mini', () => {
          G.links.push(x.ip);
          UI.toast('Link adicionado: ' + x.name, 'ok');
          UI.dirty();
        });
      t.tbody.appendChild(trow([
        U.esc(x.name), '<span class="cy">' + x.ip + '</span>',
        '<span class="muted">' + U.esc(x.city) + '</span>', b
      ]));
    });
    m.appendChild(t);
    m.appendChild(note(all.length + ' servidores registrados.', 'muted'));
  };

  /* =========================================================
     TELA: BANCO
     ========================================================= */
  ServerUI.scr_bank_login = function (m, s, rec) {
    m.appendChild(el('h2', 'sec', 'ACESSO A CONTA'));
    if (s.st.logged && rec.state.acc) {
      G.conn.screen = 'bank_accounts';
      return;
    }
    m.appendChild(el('div', 'mono-block',
      s.name + '\n\nInforme numero da conta e senha.\n' +
      'Senhas de terceiros costumam estar guardadas nos servidores\n' +
      'Internal Services das empresas.'));
    const f = U.el('div', 'row mt');
    const a = inp('accno', 'numero da conta');
    const pw = inp('accpw', 'senha', '', 'password');
    a.style.width = '160px'; pw.style.width = '160px';
    f.appendChild(a); f.appendChild(pw);
    f.appendChild(btn('ENTRAR', 'btn-primary', () => {
      const acc = s.accounts.find(x => x.no === a.value.trim());
      if (!acc || acc.pass !== pw.value.trim()) {
        Net.illegal(s, 1);
        s.logs.unshift(mkLog('Tentativa de acesso invalida a conta ' + a.value.trim()));
        UI.toast('Conta ou senha invalida.', 'bad');
        UI.dirty();
        return;
      }
      s.st.logged = true;
      Snd.crack();
      rec.state.acc = acc.no;
      if (!acc.isPlayer) Net.illegal(s, 3);
      G.conn.screen = 'bank_accounts';
      UI.toast('Acesso a conta ' + acc.no + ' concedido.', 'ok');
      UI.dirty();
    }));
    m.appendChild(f);

    m.appendChild(el('h3', 'sub', 'CONTAS LISTADAS PUBLICAMENTE'));
    const t = table(['CONTA', 'TITULAR']);
    s.accounts.slice(0, 30).forEach(acc => {
      t.tbody.appendChild(trow([acc.no, '<span class="muted">' + U.esc(acc.owner) + '</span>']));
    });
    m.appendChild(t);
  };

  /* procura uma conta em qualquer banco do mundo */
  function findAccount(no) {
    for (const ip of G.world.banks) {
      const b = G.srv(ip);
      if (!b || !b.accounts) continue;
      const a = b.accounts.find(x => x.no === no);
      if (a) return { srv: b, acc: a };
    }
    return null;
  }

  ServerUI.scr_bank_accounts = function (m, s, rec) {
    const acc = s.accounts.find(x => x.no === rec.state.acc);
    if (!acc) { G.conn.screen = 'bank_login'; return; }
    m.appendChild(el('h2', 'sec', 'CONTA ' + acc.no));
    m.appendChild(el('div', 'mono-block',
      'TITULAR : ' + acc.owner + '\n' +
      'BANCO   : ' + s.name + '\n' +
      'SALDO   : ' + U.credits(acc.balance)));

    m.appendChild(el('h3', 'sub', 'TRANSFERENCIA'));
    const f = U.el('div', 'row wrap');
    const dest = inp('dest', 'conta destino', G.bank.no);
    const amt = inp('amt', 'valor');
    dest.style.width = '150px'; amt.style.width = '130px';
    f.appendChild(dest); f.appendChild(amt);
    f.appendChild(btn('TRANSFERIR', 'btn-primary', () => {
      const v = Math.floor(Number(amt.value));
      if (!v || v <= 0) return UI.toast('Valor invalido.', 'bad');
      if (v > acc.balance) return UI.toast('Saldo insuficiente.', 'bad');
      const hit = findAccount(dest.value.trim());
      if (!hit) return UI.toast('Conta destino nao encontrada em nenhum banco.', 'bad');
      const target = hit.acc;
      if (target === acc) return UI.toast('Origem e destino sao a mesma conta.', 'bad');
      acc.balance -= v;
      target.balance += v;
      acc.statements.unshift({ t: G.time, txt: 'Transferencia para ' + target.no, amt: -v });
      target.statements.unshift({ t: G.time, txt: 'Transferencia de ' + acc.no, amt: v });
      s.logs.unshift(mkLog('Transferencia ' + acc.no + ' -> ' + target.no + ' : ' + v + 'c'));
      if (!acc.isPlayer) Net.illegal(s, 4);
      if (target.isPlayer) {
        G.credits = target.balance;
        G.missions.active.forEach(mm => {
          if (mm.type === 'steal_money' && mm.accountNo === acc.no) {
            mm.transferred = (mm.transferred || 0) + v;
          }
        });
      }
      Snd.money();
      UI.toast('Transferido ' + U.credits(v) + ' para ' + target.no, 'ok');
      UI.dirty();
    }));
    m.appendChild(f);
    m.appendChild(note('Sua conta pessoal: ' + G.bank.no + ' (' + G.srv(G.bank.ip).name + '). Transferencias interbancarias sao aceitas.', 'muted'));

    m.appendChild(el('h3', 'sub', 'EXTRATO'));
    const t = table(['DATA', 'DESCRICAO', 'VALOR']);
    (acc.statements || []).slice(0, 20).forEach(st => {
      t.tbody.appendChild(trow([U.fmtDateShort(st.t), U.esc(st.txt),
        '<span class="' + (st.amt >= 0 ? 'ok' : 'bad') + '">' + (st.amt >= 0 ? '+' : '') + U.credits(st.amt) + '</span>']));
    });
    m.appendChild(t);

    const back = U.el('div', 'row mt');
    back.appendChild(btn('TROCAR DE CONTA', '', () => {
      rec.state.acc = null; s.st.logged = false; G.conn.screen = 'bank_login'; UI.dirty();
    }));
    m.appendChild(back);
  };

  /* =========================================================
     BASES DE DADOS: ACADEMICO / CRIMINAL / SOCIAL
     ========================================================= */
  function personSearch(m, s, rec, title, hint) {
    m.appendChild(el('h2', 'sec', title));
    const f = U.el('div', 'row mb');
    const q = inp('pq', 'nome da pessoa...', rec.state.pq || '');
    q.style.width = '240px';
    q.addEventListener('input', () => { rec.state.pq = q.value; UI.dirty(); });
    f.appendChild(q);
    m.appendChild(f);
    if (hint) m.appendChild(note(hint, 'muted'));

    const term = (rec.state.pq || '').toLowerCase();
    if (term.length < 2) {
      m.appendChild(note('Digite ao menos 2 caracteres para buscar.', 'muted'));
      return null;
    }
    const found = G.world.people.filter(p => p.name.toLowerCase().includes(term)).slice(0, 25);
    if (!found.length) { m.appendChild(note('Nenhum registro encontrado.', 'muted')); return null; }
    const t = table(['NOME', 'NASC.', '']);
    found.forEach(p => {
      const b = U.el('button', 'btn btn-mini' + (rec.state.pid === p.id ? ' btn-primary' : ''), 'ABRIR');
      b.addEventListener('click', () => { rec.state.pid = p.id; UI.dirty(); });
      t.tbody.appendChild(trow([U.esc(p.name), p.born, b]));
    });
    m.appendChild(t);
    return G.world.people.find(p => p.id === rec.state.pid) || null;
  }

  ServerUI.scr_academic = function (m, s, rec) {
    const p = personSearch(m, s, rec, 'INTERNATIONAL ACADEMIC DATABASE',
      'Alteracoes exigem acesso de escrita (proxy vencido).');
    if (!p) return;
    const writeOk = !(s.sec.proxy > 0 && !s.st.proxyDown);
    m.appendChild(el('h3', 'sub', 'REGISTRO: ' + p.name));
    const rows = [];
    if (!p.academic.wiped) {
      rows.push(p.academic.year + '  ' + p.academic.degree + ' - ' + p.academic.uni + '  [' + p.academic.grade + ']');
    }
    p.academic.extra.forEach(e => rows.push(e.year + '  ' + e.degree + ' - ' + e.uni + '  [' + e.grade + ']'));
    m.appendChild(el('div', 'mono-block', rows.length ? rows.join('\n') : '(nenhuma qualificacao registrada)'));

    m.appendChild(el('h3', 'sub', 'EDITAR'));
    const f = U.el('div', 'row wrap');
    const deg = U.el('select', 'f'); deg.dataset.k = 'deg';
    D.DEGREES.forEach(d => { const o = U.el('option', null, d); o.value = d; deg.appendChild(o); });
    const uni = U.el('select', 'f'); uni.dataset.k = 'uni';
    D.UNIS.forEach(d => { const o = U.el('option', null, d); o.value = d; uni.appendChild(o); });
    f.appendChild(deg); f.appendChild(uni);
    f.appendChild(btn('ADICIONAR DIPLOMA', 'btn-primary', () => {
      if (!writeOk) return UI.toast('Proxy ativo: escrita bloqueada.', 'bad');
      Net.illegal(s, 3);
      p.academic.extra.push({ degree: deg.value, uni: uni.value, grade: '1st Class Honours', year: 2005 });
      Snd.modify();
      s.logs.unshift(mkLog('Registro academico alterado: ' + p.name));
      UI.toast('Diploma adicionado a ' + p.name, 'ok');
      UI.dirty();
    }, !writeOk));
    f.appendChild(btn('APAGAR TUDO', 'btn-danger', () => {
      if (!writeOk) return UI.toast('Proxy ativo: escrita bloqueada.', 'bad');
      Net.illegal(s, 3);
      p.academic.wiped = true;
      p.academic.extra = [];
      Snd.del();
      s.logs.unshift(mkLog('Registro academico apagado: ' + p.name));
      UI.toast('Historico academico apagado.', 'warn');
      UI.dirty();
    }, !writeOk));
    m.appendChild(f);
  };

  ServerUI.scr_criminal = function (m, s, rec) {
    const p = personSearch(m, s, rec, 'GLOBAL CRIMINAL DATABASE',
      'Alteracoes exigem acesso de escrita (proxy vencido).');
    if (!p) return;
    const writeOk = !(s.sec.proxy > 0 && !s.st.proxyDown);
    m.appendChild(el('h3', 'sub', 'FICHA: ' + p.name));
    m.appendChild(el('div', 'mono-block',
      p.criminal.length
        ? p.criminal.map(c => c.year + '  ' + c.crime + '  [' + c.sentence + ']').join('\n')
        : '(ficha limpa)'));

    m.appendChild(el('h3', 'sub', 'EDITAR'));
    const f = U.el('div', 'row wrap');
    const crime = U.el('select', 'f'); crime.dataset.k = 'crime';
    D.CRIMES.forEach(c => { const o = U.el('option', null, c); o.value = c; crime.appendChild(o); });
    f.appendChild(crime);
    f.appendChild(btn('ADICIONAR CONDENACAO', 'btn-primary', () => {
      if (!writeOk) return UI.toast('Proxy ativo: escrita bloqueada.', 'bad');
      Net.illegal(s, 4);
      p.criminal.push({ crime: crime.value, year: U.toDate(G.time).y, sentence: '5 anos', planted: true });
      Snd.modify();
      s.logs.unshift(mkLog('Ficha criminal alterada: ' + p.name));
      UI.toast('Condenacao inserida.', 'warn');
      UI.dirty();
    }, !writeOk));
    f.appendChild(btn('LIMPAR FICHA', 'btn-danger', () => {
      if (!writeOk) return UI.toast('Proxy ativo: escrita bloqueada.', 'bad');
      Net.illegal(s, 4);
      p.criminal = [];
      Snd.del();
      s.logs.unshift(mkLog('Ficha criminal apagada: ' + p.name));
      UI.toast('Ficha limpa.', 'ok');
      UI.dirty();
    }, !writeOk));
    m.appendChild(f);
  };

  ServerUI.scr_social = function (m, s, rec) {
    const p = personSearch(m, s, rec, 'SOCIAL SECURITY DATABASE', null);
    if (!p) return;
    m.appendChild(el('h3', 'sub', 'REGISTRO SOCIAL: ' + p.name));
    m.appendChild(el('div', 'mono-block',
      'NASCIMENTO : ' + p.born + '\n' +
      'EMPREGADOR : ' + p.social.employer + '\n' +
      'SALARIO    : ' + U.credits(p.social.salary) + '\n' +
      'SITUACAO   : ' + p.social.status));
    const writeOk = !(s.sec.proxy > 0 && !s.st.proxyDown);
    const f = U.el('div', 'row mt');
    f.appendChild(btn('DEMITIR', 'btn-danger', () => {
      if (!writeOk) return UI.toast('Proxy ativo: escrita bloqueada.', 'bad');
      Net.illegal(s, 3);
      Snd.modify();
      p.social.status = 'Desempregado';
      p.social.employer = '-';
      s.logs.unshift(mkLog('Registro social alterado: ' + p.name));
      UI.toast('Vinculo empregaticio removido.', 'warn');
      UI.dirty();
    }, !writeOk));
    m.appendChild(f);
  };

  global.ServerUI = ServerUI;
})(window);
