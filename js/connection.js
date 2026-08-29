/* =========================================================
   connection.js - rota de bounce, conexao, trace ativo e passivo
   ========================================================= */
(function (global) {
  'use strict';

  const Net = {};

  /* =========================================================
     ROTA
     ========================================================= */
  Net.addHop = function (ip) {
    if (G.conn.live) return 'Desconecte antes de alterar a rota.';
    if (G.conn.route.includes(ip)) return 'Este servidor ja esta na rota.';
    if (G.conn.route.length >= 12) return 'Rota cheia (maximo 12 saltos).';
    G.conn.route.push(ip);
    return null;
  };
  Net.removeHop = function (ip) {
    if (G.conn.live) return 'Desconecte antes de alterar a rota.';
    const i = G.conn.route.indexOf(ip);
    if (i >= 0) G.conn.route.splice(i, 1);
    return null;
  };
  Net.clearRoute = function () {
    if (G.conn.live) return 'Desconecte primeiro.';
    G.conn.route = [];
    return null;
  };
  Net.setTarget = function (ip) {
    if (G.conn.live) return 'Desconecte primeiro.';
    G.conn.target = ip;
    return null;
  };

  /* qualidade da rota: quanto maior, mais lento o trace */
  Net.routeQuality = function () {
    let q = 0;
    G.conn.route.forEach(ip => {
      const s = G.srv(ip);
      if (!s) return;
      let w = 0.35;
      if (s.type === 'bank') w = 0.6;
      else if (s.type === 'academic' || s.type === 'social') w = 0.5;
      else if (s.type === 'criminal') w = 0.55;
      else if (s.type === 'mainframe') w = 0.5;
      else if (s.type === 'internal') w = 0.4;
      else if (s.type === 'public') w = 0.25;
      q += w;
    });
    return q;
  };

  Net.estimateTrace = function (targetIp) {
    const t = G.srv(targetIp);
    if (!t) return 0;
    return Math.round(t.traceBase * (0.6 + Net.routeQuality()));
  };

  /* =========================================================
     CONECTAR
     ========================================================= */
  Net.connect = function () {
    if (G.conn.live) return 'Ja existe uma conexao ativa.';
    const ip = G.conn.target;
    if (!ip) return 'Nenhum alvo definido.';
    const target = G.srv(ip);
    if (!target) return 'IP invalido ou servidor inexistente.';
    if (G.conn.route.includes(ip)) return 'O alvo nao pode estar na propria rota de bounce.';

    /* grava trilha de logs: gateway -> hop1 -> hop2 -> ... -> alvo */
    const chain = ['GATEWAY'].concat(G.conn.route).concat([ip]);
    const trail = [];
    for (let i = 1; i < chain.length; i++) {
      const here = chain[i];
      const prev = chain[i - 1];
      const s = G.srv(here);
      if (!s) continue;
      const fromIP = prev === 'GATEWAY' ? Net.playerIP() : prev;
      const isTarget = (i === chain.length - 1);
      const log = W.makeLog(Math.random, G.time,
        isTarget ? 'Conexao recebida de ' + fromIP
                 : 'Roteamento: ' + fromIP + ' -> ' + chain[i + 1],
        'route');
      log.id = 'l' + U.uid();
      log.fromIP = fromIP;
      s.logs.unshift(log);
      trail.push({ ip: here, logId: log.id });
    }

    target.st = { logged: false, admin: false, proxyDown: false, fwDown: false, monFooled: false };

    G.conn.live = true;
    G.conn.trail = trail;
    G.conn.illegal = false;
    G.conn.startedAt = G.time;
    G.conn.trace = null;
    G.conn.screen = Net.firstScreen(target);
    Soft.abortAll();
    UI.toast('Conexao estabelecida com ' + target.name, 'ok');
    UI.openConnection();
    return null;
  };

  Net.playerIP = function () {
    if (!G.flags.playerIP) {
      const rng = U.makeRNG(G.seed ^ 0x5f3759df);
      G.flags.playerIP = U.randIP(rng);
    }
    return G.flags.playerIP;
  };

  Net.firstScreen = function (srv) {
    if (srv.sec.pass) return 'login';
    if (srv.type === 'bank') return 'bank_login';
    return srv.screens[0];
  };

  /* =========================================================
     DESCONECTAR
     ========================================================= */
  Net.disconnect = function (silent) {
    if (!G.conn.live) return;
    const wasIllegal = G.conn.illegal;
    const trail = G.conn.trail || [];
    const target = G.srv(G.conn.target);

    Soft.abortAll();
    Snd.traceStop();
    Snd.hangup();
    G.conn.live = false;
    G.conn.trace = null;
    G.conn.screen = null;
    if (target) target.st = { logged: false, admin: false, proxyDown: false, fwDown: false, monFooled: false };

    /* agenda trace passivo se houve atividade ilegal em servidor monitorado */
    if (wasIllegal && target && target.sec.monitor > 0) {
      const delayH = 3 + Math.random() * 9;
      G.passive.push({
        id: 'pt' + U.uid(),
        due: G.time + delayH * 60,
        trail: trail.slice(),
        targetIp: target.ip,
        targetName: target.name
      });
    }
    if (!silent) UI.toast('Conexao encerrada.', wasIllegal ? 'warn' : '');
    UI.closeConnection();
  };

  /* =========================================================
     ATIVIDADE ILEGAL / MONITOR
     ========================================================= */
  Net.illegal = function (srv, weight) {
    if (!G.conn.live) return;
    G.conn.illegal = true;
    G.neuroPoints += (weight || 0);
    if (!srv || srv.sec.monitor <= 0) return;
    if (srv.st.monFooled) return;
    if (G.conn.trace) return;
    const total = Net.estimateTrace(srv.ip);
    G.conn.trace = { total: total, left: total, started: G.time };
    Snd.dialupStop();   /* o chiado nao pode abafar o alarme */
    Snd.alarm();
    UI.toast('MONITOR ATIVO DETECTOU INTRUSAO - trace iniciado', 'bad');
  };

  /* =========================================================
     TICK
     ========================================================= */
  Net.tick = function (dt) {
    /* trace ativo */
    if (G.conn.live && G.conn.trace) {
      const tr = G.conn.trace;
      tr.left -= dt;
      if (tr.left <= 0) {
        Net.busted();
        return;
      }
      /* o bipe acelera conforme o trace se aproxima do fim */
      Snd.traceTick(dt, 100 - (tr.left / tr.total) * 100);
    } else {
      Snd.traceStop();
    }
    /* traces passivos */
    for (let i = G.passive.length - 1; i >= 0; i--) {
      const pt = G.passive[i];
      if (G.time >= pt.due) {
        G.passive.splice(i, 1);
        Net.resolvePassive(pt);
      }
    }
  };

  /* =========================================================
     TRACE PASSIVO: percorre a trilha de tras para frente
     ========================================================= */
  Net.resolvePassive = function (pt) {
    const trail = pt.trail;
    let reached = 0;
    for (let i = trail.length - 1; i >= 0; i--) {
      const hop = trail[i];
      const s = G.srv(hop.ip);
      if (!s) break;
      const log = s.logs.find(l => l.id === hop.logId);
      if (!log || log.deleted) break;       /* rastro perdido */
      if (log.modified) break;              /* log falsificado: pista morre aqui */
      reached++;
    }
    const full = (reached === trail.length);

    if (full) {
      G.flags.busts = (G.flags.busts || 0) + 1;
      const fine = Math.round(2000 + G.points * 60 + Math.random() * 3000);
      G.pay(-fine, 'Multa judicial - invasao rastreada');
      G.points = Math.max(0, G.points - 2);
      G.addEmail({
        from: 'legal@uplink.net',
        subj: 'AVISO ' + G.flags.busts + '/3 - Voce foi rastreado',
        kind: 'legal',
        body:
          'A invasao ao servidor ' + pt.targetName + ' foi rastreada ate seu gateway.\n' +
          'Os logs da rota permaneceram intactos e a trilha levou ate voce.\n\n' +
          'Multa aplicada: ' + U.credits(fine) + '\n' +
          'Rating Uplink reduzido.\n\n' +
          'Apague os logs de TODOS os servidores da rota, incluindo o alvo,\n' +
          'antes de desconectar.\n\n' +
          'Aviso ' + G.flags.busts + ' de 3. Na terceira, sua licenca sera revogada.'
      });
      UI.toast('Voce foi rastreado! Multa de ' + U.credits(fine), 'bad');
      if (G.flags.busts >= 3) {
        G.gameOver('LICENCA REVOGADA',
          'Tres invasoes rastreadas ate o seu gateway.\n\n' +
          'A Uplink Corporation encerrou seu contrato e entregou seus dados\n' +
          'as autoridades. Seu hardware foi confiscado.\n\n' +
          'Handle queimado: ' + G.handle + '\n' +
          'Rating final: ' + G.ratingName() + '\n' +
          'Creditos: ' + U.credits(G.credits));
      }
    } else if (reached > 0) {
      G.addEmail({
        from: 'internal@uplink.net',
        subj: 'Trace passivo interrompido',
        body:
          'Um trace foi iniciado a partir de ' + pt.targetName + '.\n' +
          'A trilha morreu apos ' + reached + ' salto(s) - os logs seguintes\n' +
          'ja haviam sido apagados.\n\nVoce esta limpo. Desta vez.'
      });
    }
  };

  /* =========================================================
     PEGO EM FLAGRANTE
     ========================================================= */
  Net.busted = function () {
    const t = G.srv(G.conn.target);
    G.conn.live = false;
    G.conn.trace = null;
    Soft.abortAll();
    Snd.traceStop();
    UI.closeConnection();
    G.gameOver('TRACE COMPLETO',
      'O trace de ' + (t ? t.name : 'alvo desconhecido') + ' chegou ao fim.\n\n' +
      'Sua localizacao fisica foi identificada em tempo real.\n' +
      'Agentes federais apreenderam o gateway antes que voce\n' +
      'conseguisse desconectar.\n\n' +
      'Handle: ' + G.handle + '\n' +
      'Rating: ' + G.ratingName() + ' (' + G.points + ' pts)\n' +
      'Contratos concluidos: ' + G.missions.done.length + '\n' +
      'Creditos perdidos: ' + U.credits(G.credits) + '\n\n' +
      'Regra numero um: sempre saiba quanto tempo voce tem.');
  };

  /* =========================================================
     LOGS
     ========================================================= */
  Net.deleteLog = function (srv, logId) {
    const l = srv.logs.find(x => x.id === logId);
    if (!l) return false;
    if (!l.deleted && !l.recover) l.recover = l.txt;
    l.deleted = true;
    l.txt = '<registro apagado>';
    return true;
  };
  Net.modifyLog = function (srv, logId) {
    const l = srv.logs.find(x => x.id === logId);
    if (!l) return false;
    l.modified = true;
    l.deleted = false;
    l.txt = 'Conexao de ' + U.randIP(U.makeRNG((Date.now() | 0))) + ' - rotina';
    return true;
  };

  /* logs visiveis (nao apagados sao mostrados; apagados aparecem como marca) */
  Net.visibleLogs = function (srv) {
    return srv.logs.slice(0, 40);
  };

  global.Net = Net;
})(window);
