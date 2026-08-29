/* =========================================================
   software.js - execucao de ferramentas como tarefas
   que dividem a CPU do gateway
   ========================================================= */
(function (global) {
  'use strict';

  const Soft = {};

  /* dificuldade base do alvo (usada por varios tools) */
  function hardness(srv) {
    return 3 + (srv.sec.monitor || 0) + (srv.sec.proxy || 0) + (srv.sec.firewall || 0);
  }

  function activeCount() {
    return G.tasks.filter(t => !t.done).length || 1;
  }

  function push(t) {
    t.id = 't' + U.uid();
    t.prog = 0;
    t.done = false;
    G.tasks.push(t);
    return t;
  }

  Soft.list = function () { return G.tasks; };
  Soft.abortAll = function () { G.tasks = []; };
  Soft.abort = function (id) {
    const i = G.tasks.findIndex(t => t.id === id);
    if (i >= 0) G.tasks.splice(i, 1);
  };
  Soft.isRunning = function (swId) {
    return G.tasks.some(t => t.sw === swId && !t.done);
  };

  Soft.tick = function (dt) {
    const n = activeCount();
    const share = G.cpuPower() / n;
    for (let i = G.tasks.length - 1; i >= 0; i--) {
      const t = G.tasks[i];
      if (t.done) continue;
      const rate = t.rate(share);
      t.prog += rate * dt;
      if (t.prog >= t.work) {
        t.done = true;
        G.tasks.splice(i, 1);
        try { t.onDone(); } catch (e) { console.error(e); }
      }
    }
  };

  Soft.pct = function (t) { return U.clamp((t.prog / t.work) * 100, 0, 100); };
  Soft.eta = function (t) {
    const share = G.cpuPower() / activeCount();
    const r = t.rate(share);
    if (r <= 0) return Infinity;
    return (t.work - t.prog) / r;
  };

  /* =========================================================
     PONTO DE ENTRADA GENERICO
     retorna string de erro ou null
     ========================================================= */
  Soft.run = function (swId, ctx) {
    const sw = G.software.find(s => s.id === swId);
    if (!sw) return 'Software nao instalado.';
    if (!Soft['do_' + swId]) return 'Ferramenta sem implementacao.';
    return Soft['do_' + swId](sw.v, ctx || {});
  };

  /* =========================================================
     PASSWORD BREAKER
     ========================================================= */
  Soft.do_password_breaker = function (v, ctx) {
    const srv = ctx.srv;
    if (!srv) return 'Nenhum servidor conectado.';
    if (!srv.sec.pass && !ctx.admin) return 'Este sistema nao pede senha.';
    if (ctx.admin && !srv.sec.admin) return 'Nao ha conta administrativa aqui.';
    if (Soft.isRunning('password_breaker')) return 'Password_Breaker ja esta rodando.';

    Net.illegal(srv, 1);
    const diff = hardness(srv) + (ctx.admin ? 6 : 0);
    push({
      sw: 'password_breaker',
      label: 'Password_Breaker v' + v + (ctx.admin ? ' [admin]' : ''),
      work: diff * 8 * 60,
      rate: (share) => share * v,
      onDone: function () {
        if (ctx.admin) {
          srv.st.admin = true; srv.st.logged = true;
          Snd.crack();
          UI.toast('Acesso ADMIN concedido: ' + srv.sec.admin, 'ok');
        } else {
          srv.st.logged = true;
          Snd.crack();
          UI.toast('Senha quebrada: ' + srv.sec.pass, 'ok');
          if (srv.type === 'bank') G.conn.screen = 'bank_accounts';
          else G.conn.screen = srv.screens[0];
        }
        UI.dirty();
      }
    });
    return null;
  };

  /* =========================================================
     DICTIONARY HACKER
     ========================================================= */
  Soft.do_dictionary_hacker = function (v, ctx) {
    const srv = ctx.srv;
    if (!srv || !srv.sec.pass) return 'Nada para atacar aqui.';
    Net.illegal(srv, 1);
    push({
      sw: 'dictionary_hacker',
      label: 'Dictionary_Hacker',
      work: 6 * 60,
      rate: (share) => share * 2,
      onDone: function () {
        if (D.COMMON_PASS.includes(srv.sec.pass)) {
          srv.st.logged = true;
          Snd.crack();
          UI.toast('Senha encontrada no dicionario: ' + srv.sec.pass, 'ok');
          G.conn.screen = srv.screens[0];
        } else {
          Snd.error();
          UI.toast('Nenhuma senha do dicionario funcionou.', 'warn');
        }
        UI.dirty();
      }
    });
    return null;
  };

  /* =========================================================
     BYPASS / DISABLE
     ========================================================= */
  function layerTool(key, label, level, srv, v, isBypass, onOk) {
    if (level <= 0) return 'Este sistema nao possui ' + label + '.';
    if (v < level) return label + ' nivel ' + level + ' exige versao ' + level + ' ou superior (voce tem v' + v + ').';
    if (Soft.isRunning(key)) return label + ': ja em execucao.';
    if (!isBypass) Net.illegal(srv, 1);
    else Net.illegal(srv, 0);
    push({
      sw: key,
      label: label + ' v' + v,
      work: level * 7 * 60,
      rate: (share) => share * (v - level + 1),
      onDone: function () { onOk(); UI.dirty(); }
    });
    return null;
  }

  Soft.do_firewall_bypass = function (v, ctx) {
    const s = ctx.srv; if (!s) return 'Sem conexao.';
    return layerTool('firewall_bypass', 'Firewall_Bypass', s.sec.firewall, s, v, true, () => {
      s.st.fwDown = true; Snd.bypass(); UI.toast('Firewall contornado.', 'ok');
    });
  };
  Soft.do_firewall_disable = function (v, ctx) {
    const s = ctx.srv; if (!s) return 'Sem conexao.';
    return layerTool('firewall_disable', 'Firewall_Disable', s.sec.firewall, s, v, false, () => {
      s.st.fwDown = true;
      s.logs.unshift(mkLog('ALERTA: firewall desativado remotamente'));
      Snd.disable();
      UI.toast('Firewall derrubado (evidencia registrada).', 'warn');
    });
  };
  Soft.do_proxy_bypass = function (v, ctx) {
    const s = ctx.srv; if (!s) return 'Sem conexao.';
    return layerTool('proxy_bypass', 'Proxy_Bypass', s.sec.proxy, s, v, true, () => {
      s.st.proxyDown = true; Snd.bypass(); UI.toast('Proxy contornado - escrita liberada.', 'ok');
    });
  };
  Soft.do_proxy_disable = function (v, ctx) {
    const s = ctx.srv; if (!s) return 'Sem conexao.';
    return layerTool('proxy_disable', 'Proxy_Disable', s.sec.proxy, s, v, false, () => {
      s.st.proxyDown = true;
      s.logs.unshift(mkLog('ALERTA: servico de proxy interrompido'));
      Snd.disable();
      UI.toast('Proxy desativado (evidencia registrada).', 'warn');
    });
  };
  Soft.do_monitor_bypass = function (v, ctx) {
    const s = ctx.srv; if (!s) return 'Sem conexao.';
    if (s.sec.monitor <= 0) return 'Este sistema nao tem monitor ativo.';
    if (v < s.sec.monitor) return 'Monitor nivel ' + s.sec.monitor + ' exige Monitor_Bypass v' + s.sec.monitor + '.';
    if (G.conn.trace) return 'Tarde demais: o trace ja comecou.';
    if (Soft.isRunning('monitor_bypass')) return 'Monitor_Bypass ja em execucao.';
    push({
      sw: 'monitor_bypass',
      label: 'Monitor_Bypass v' + v,
      work: s.sec.monitor * 6 * 60,
      rate: (share) => share * (v - s.sec.monitor + 1),
      onDone: function () {
        s.st.monFooled = true;
        Snd.bypass();
        UI.toast('Monitor enganado. Nenhum trace sera iniciado.', 'ok');
        UI.dirty();
      }
    });
    return null;
  };

  function mkLog(txt) {
    const l = W.makeLog(Math.random, G.time, txt, 'alert');
    l.id = 'l' + U.uid();
    return l;
  }

  /* =========================================================
     ARQUIVOS
     ========================================================= */
  Soft.do_file_copier = function (v, ctx) {
    const s = ctx.srv, f = ctx.file;
    if (!s || !f) return 'Selecione um arquivo.';
    if (!s.st.logged && s.sec.pass) return 'Acesso negado.';
    if (G.memFree() < f.size) return 'Memoria insuficiente (' + f.size + 'Gq necessarios).';
    if (G.tasks.some(t => t.sw === 'file_copier' && t.fileId === f.id)) return 'Ja copiando este arquivo.';
    Net.illegal(s, 1);
    const bw = G.bandwidth();
    Snd.copyStart();
    const t = push({
      sw: 'file_copier',
      fileId: f.id,
      label: 'Copiando ' + f.name,
      work: f.size * 60,
      rate: () => bw * 30,
      onDone: function () {
        if (G.storeFile(f, s.ip)) { Snd.copy(); UI.toast('Arquivo copiado: ' + f.name, 'ok'); }
        else { UI.toast('Memoria cheia - copia perdida.', 'bad'); }
        UI.dirty();
      }
    });
    return null;
  };

  Soft.do_file_deleter = function (v, ctx) {
    const s = ctx.srv, f = ctx.file;
    if (!s || !f) return 'Selecione um arquivo.';
    if (s.sec.proxy > 0 && !s.st.proxyDown) return 'Proxy ativo: escrita e delecao bloqueadas.';
    Net.illegal(s, 2);
    push({
      sw: 'file_deleter',
      label: 'Apagando ' + f.name,
      work: 2 * 60,
      rate: (share) => share * 2,
      onDone: function () {
        const i = s.files.findIndex(x => x.id === f.id);
        if (i >= 0) s.files.splice(i, 1);
        s.logs.unshift(mkLog('Arquivo removido: ' + f.name));
        Snd.del();
        UI.toast('Arquivo apagado: ' + f.name, 'warn');
        UI.dirty();
      }
    });
    return null;
  };

  Soft.do_decrypter = function (v, ctx) {
    const m = ctx.mem;
    if (!m) return 'Selecione um arquivo na memoria.';
    if (!m.enc) return 'Arquivo nao esta criptografado.';
    if (v < m.enc) return 'Criptografia nivel ' + m.enc + ' exige Decrypter v' + m.enc + '.';
    push({
      sw: 'decrypter',
      label: 'Decrypter: ' + m.name,
      work: m.enc * 6 * 60,
      rate: (share) => share * v,
      onDone: function () {
        m.enc = 0;
        Snd.decrypt();
        UI.toast('Arquivo descriptografado: ' + m.name, 'ok');
        UI.dirty();
      }
    });
    return null;
  };

  /* =========================================================
     LOGS
     ========================================================= */
  Soft.do_log_deleter = function (v, ctx) {
    const s = ctx.srv, log = ctx.log;
    if (!s || !log) return 'Selecione um registro.';
    if (s.sec.proxy > 0 && !s.st.proxyDown) return 'Proxy ativo: nao e possivel alterar logs.';
    push({
      sw: 'log_deleter',
      label: 'Log_Deleter',
      work: (4 * 60) / v,
      rate: (share) => share * 2,
      onDone: function () {
        Net.deleteLog(s, log.id);
        Snd.del();
        UI.toast('Registro apagado.', 'ok');
        UI.dirty();
      }
    });
    return null;
  };

  Soft.do_log_modifier = function (v, ctx) {
    const s = ctx.srv, log = ctx.log;
    if (!s || !log) return 'Selecione um registro.';
    if (s.sec.proxy > 0 && !s.st.proxyDown) return 'Proxy ativo: nao e possivel alterar logs.';
    push({
      sw: 'log_modifier',
      label: 'Log_Modifier',
      work: (6 * 60) / v,
      rate: (share) => share * 2,
      onDone: function () {
        Net.modifyLog(s, log.id);
        Snd.modify();
        UI.toast('Registro reescrito.', 'ok');
        UI.dirty();
      }
    });
    return null;
  };

  Soft.do_log_undeleter = function (v, ctx) {
    const s = ctx.srv;
    if (!s) return 'Sem conexao.';
    push({
      sw: 'log_undeleter',
      label: 'Log_UnDeleter',
      work: 8 * 60,
      rate: (share) => share * 2,
      onDone: function () {
        let n = 0;
        s.logs.forEach(l => {
          if (l.deleted && l.recover) { l.deleted = false; l.txt = l.recover; n++; }
        });
        UI.toast(n ? n + ' registro(s) recuperado(s).' : 'Nenhum registro recuperavel.', n ? 'ok' : 'warn');
        UI.dirty();
      }
    });
    return null;
  };

  /* =========================================================
     RECON
     ========================================================= */
  Soft.do_ip_probe = function (v, ctx) {
    const ip = ctx.ip;
    if (!ip) return 'Informe um IP.';
    const s = G.srv(ip);
    if (!s) return 'IP nao responde.';
    if (Soft.isRunning('ip_probe')) return 'IP_Probe ja em execucao.';
    push({
      sw: 'ip_probe',
      label: 'IP_Probe ' + ip,
      work: 5 * 60,
      rate: (share) => share * v,
      onDone: function () {
        s.probed = Math.max(s.probed || 0, v);
        UI.toast('Varredura concluida em ' + s.name, 'ok');
        UI.dirty();
      }
    });
    return null;
  };

  Soft.do_ip_lookup = function (v, ctx) {
    const ip = (ctx.ip || '').trim();
    if (!ip) return 'Informe um IP.';
    const s = G.srv(ip);
    if (!s) return 'IP nao registrado em nenhum servidor conhecido.';
    if (G.links.includes(ip)) return 'Este servidor ja esta nos seus links.';
    G.links.push(ip);
    UI.toast('Link adicionado: ' + s.name, 'ok');
    UI.dirty();
    return null;
  };

  Soft.do_voice_analyser = function (v, ctx) {
    return 'Nenhum sistema de autenticacao por voz nesta conexao.';
  };

  Soft.do_defrag = function (v, ctx) {
    push({
      sw: 'defrag',
      label: 'Defrag',
      work: 10 * 60,
      rate: (share) => share * 2,
      onDone: function () {
        UI.toast('Memoria compactada.', 'ok');
        UI.dirty();
      }
    });
    return null;
  };

  Soft.do_trace_tracker = function (v, ctx) {
    return 'Trace_Tracker roda de forma passiva - ele ja esta ativo.';
  };

  global.Soft = Soft;
})(window);
