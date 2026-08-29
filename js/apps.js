/* =========================================================
   apps.js - aplicativos do desktop
   ========================================================= */
(function (global) {
  'use strict';

  const Apps = {};

  /* ---------- helpers de DOM ---------- */
  function btn(label, cls, fn, disabled) {
    const b = U.el('button', 'btn ' + (cls || ''), label);
    if (disabled) b.disabled = true;
    else b.addEventListener('click', fn);
    return b;
  }
  function row(cls) { return U.el('div', 'row ' + (cls || '')); }
  function h2(t) { return U.el('h2', 'sec', t); }
  function h3(t) { return U.el('h3', 'sub', t); }
  function p(t, cls) { return U.el('div', cls || '', t); }
  function input(key, ph, val, type) {
    const i = U.el('input', 'f');
    i.dataset.k = key; i.placeholder = ph || '';
    if (val !== undefined) i.value = val;
    if (type) i.type = type;
    i.spellcheck = false;
    return i;
  }
  function table(headers) {
    const t = U.el('table', 'tbl');
    const thead = U.el('thead'), tr = U.el('tr');
    headers.forEach(h => tr.appendChild(U.el('th', null, h)));
    thead.appendChild(tr); t.appendChild(thead);
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

  Apps.btn = btn;

  /* =========================================================
     E-MAIL
     ========================================================= */
  Apps.email = function () {
    const w = UI.open('email', {
      title: 'CLIENTE DE E-MAIL', w: 760, h: 520,
      render: function (body, rec) {
        if (!rec.state.sel && G.email.length) rec.state.sel = G.email[0].id;

        /* ---- barra de acoes + composicao ---- */
        const top = U.el('div', 'mb');
        const bar = row();
        const pend = Missions.deliverables();
        bar.appendChild(btn(rec.state.compose ? 'FECHAR ENVIO' : 'ENVIAR ARQUIVO',
          rec.state.compose ? '' : 'btn-primary', () => {
            rec.state.compose = !rec.state.compose;
            UI.dirty();
          }));
        if (pend.length) {
          bar.appendChild(p(pend.length + ' contrato(s) aguardando entrega de arquivo.', 'warn'));
        }
        top.appendChild(bar);
        if (rec.state.compose) top.appendChild(composer(rec, pend));
        body.appendChild(top);

        const wrap = U.el('div', 'row');
        wrap.style.height = 'calc(100% - ' + (rec.state.compose ? 190 : 46) + 'px)';
        wrap.style.alignItems = 'stretch';

        const left = U.el('div', 'list');
        left.style.width = '260px';
        left.style.overflow = 'auto';
        left.style.flex = 'none';
        G.email.forEach(m => {
          const sent = m.kind === 'sent';
          const it = U.el('div', 'list-item' + (m.read ? '' : ' unread') + (rec.state.sel === m.id ? ' sel' : ''));
          const l = U.el('div');
          l.appendChild(U.el('div', m.read ? 'muted' : 'hi',
            (sent ? '→ ' : '') + m.subj.slice(0, 32)));
          l.appendChild(U.el('div', 'muted',
            (sent ? 'para ' + (m.to || '?') : m.from).slice(0, 28)));
          it.appendChild(l);
          it.appendChild(U.el('div', 'muted', U.fmtDateShort(m.t)));
          it.addEventListener('click', () => {
            rec.state.sel = m.id; m.read = true; UI.onEmail(); UI.dirty();
          });
          left.appendChild(it);
        });
        if (!G.email.length) left.appendChild(p('Caixa vazia.', 'muted center mt'));

        const right = U.el('div', 'grow');
        right.style.overflow = 'auto';
        right.style.paddingLeft = '10px';
        const m = G.email.find(x => x.id === rec.state.sel);
        if (m) {
          right.appendChild(h2(m.subj));
          const meta = U.el('div', 'muted mb');
          meta.innerHTML =
            (m.kind === 'sent'
              ? 'PARA: <span class="cy">' + U.esc(m.to) + '</span>'
              : 'DE: <span class="cy">' + U.esc(m.from) + '</span>') +
            '<br>DATA: ' + U.fmtDate(m.t) +
            (m.attach ? '<br>ANEXO: <span class="ok">' + U.esc(m.attach.name) +
              ' (' + m.attach.size + 'Gq)</span>' : '');
          right.appendChild(meta);
          right.appendChild(U.el('div', 'mono-block', m.body));
          if (m.mission) {
            const mi = G.missions.active.find(x => x.id === m.mission) ||
              G.missions.done.find(x => x.id === m.mission);
            if (mi && mi.status === 'active') {
              const r = row('mt');
              r.appendChild(btn('ABRIR CONTRATO', '', () => { Apps.missions(); }));
              r.appendChild(btn('CONECTAR AO ALVO', 'btn-primary', () => {
                Net.setTarget(mi.targetIp); Apps.map();
                UI.toast('Alvo definido. Monte a rota e conecte.', 'ok');
              }));
              right.appendChild(r);
            }
          }
          const del = row('mt');
          del.appendChild(btn('APAGAR', 'btn-danger btn-mini', () => {
            const i = G.email.findIndex(x => x.id === m.id);
            if (i >= 0) G.email.splice(i, 1);
            rec.state.sel = G.email.length ? G.email[0].id : null;
            UI.onEmail(); UI.dirty();
          }));
          right.appendChild(del);
        } else {
          right.appendChild(p('Selecione uma mensagem.', 'muted'));
        }

        wrap.appendChild(left); wrap.appendChild(right);
        body.appendChild(wrap);
      }
    });
    UI.onEmail();
    return w;
  };

  /* ---------- painel de composicao: entrega de arquivo ao contratante ---------- */
  function composer(rec, pend) {
    const box = U.el('div', 'mono-block mt');
    box.style.padding = '10px';

    if (!pend.length) {
      box.appendChild(p('Nenhum contrato aguardando entrega de arquivo.', 'muted'));
      box.appendChild(p('Contratos de roubo exigem que voce envie o arquivo por aqui.', 'muted'));
      return box;
    }

    const l1 = row('mb');
    l1.appendChild(U.el('span', 'muted', 'PARA'));
    const to = U.el('select', 'f grow');
    to.dataset.k = 'mail_to';
    pend.forEach(m => {
      const o = U.el('option', null, m.employer + '  <' + m.email + '>  -  ' + m.fileName);
      o.value = m.email;
      to.appendChild(o);
    });
    if (rec.state.to) to.value = rec.state.to;
    to.addEventListener('change', () => { rec.state.to = to.value; });
    l1.appendChild(to);
    box.appendChild(l1);

    const l2 = row('mb');
    l2.appendChild(U.el('span', 'muted', 'ANEXO'));
    const att = U.el('select', 'f grow');
    att.dataset.k = 'mail_att';
    if (!G.memory.length) {
      const o = U.el('option', null, '(memoria do gateway vazia)');
      o.value = ''; att.appendChild(o);
    }
    G.memory.forEach(f => {
      const src = G.srv(f.src);
      const o = U.el('option', null,
        f.name + '  (' + f.size + 'Gq)' +
        (f.enc ? '  [CRIPTOGRAFADO ' + f.enc + ']' : '') +
        (src ? '  de ' + shortName(src) : ''));
      o.value = f.id;
      att.appendChild(o);
    });
    if (rec.state.att) att.value = rec.state.att;
    att.addEventListener('change', () => { rec.state.att = att.value; });
    l2.appendChild(att);
    box.appendChild(l2);

    const acts = row();
    acts.appendChild(btn('ENVIAR', 'btn-primary', () => {
      const r = Missions.sendFile(to.value, att.value);
      if (r.erro) { UI.toast(r.erro, 'bad'); UI.dirty(); return; }
      UI.toast(r.msg, r.aceito ? 'ok' : 'warn');
      rec.state.compose = false;
      rec.state.sel = G.email.length ? G.email[0].id : null;
      UI.dirty();
    }, !G.memory.length));
    acts.appendChild(p('O anexo precisa ser o arquivo exato do contrato e estar descriptografado.', 'muted'));
    box.appendChild(acts);
    return box;
  }

  /* =========================================================
     UPLINK INTERNAL SERVICES
     ========================================================= */
  Apps.uis = function () {
    UI.open('uis', {
      title: 'UPLINK INTERNAL SERVICES', w: 780, h: 520,
      render: function (body, rec) {
        rec.state.tab = rec.state.tab || 'missions';
        const tabs = U.el('div', 'tabs');
        [['missions', 'CONTRATOS'], ['software', 'SOFTWARE'], ['hardware', 'HARDWARE'], ['status', 'STATUS']]
          .forEach(([k, l]) => {
            const t = U.el('div', 'tab' + (rec.state.tab === k ? ' on' : ''), l);
            t.addEventListener('click', () => { rec.state.tab = k; UI.dirty(); });
            tabs.appendChild(t);
          });
        body.appendChild(tabs);

        if (rec.state.tab === 'missions') uisMissions(body, rec);
        else if (rec.state.tab === 'software') uisSoftware(body, rec);
        else if (rec.state.tab === 'hardware') uisHardware(body, rec);
        else uisStatus(body, rec);
      }
    });
    UI.badge('uis', 0);
  };

  function uisMissions(body, rec) {
    body.appendChild(h2('QUADRO DE CONTRATOS DISPONIVEIS'));
    body.appendChild(p('Rating atual: ' + G.ratingName() + '. Contratos mais dificeis aparecem conforme voce sobe.', 'muted mb'));
    if (!G.missions.available.length) {
      body.appendChild(p('Nenhuma oferta no momento. Novas ofertas chegam a cada poucas horas.', 'muted'));
      return;
    }
    const t = table(['CONTRATO', 'EMPREGADOR', 'ALVO', 'PAGAMENTO', 'PRAZO', '']);
    G.missions.available.forEach(m => {
      const b = btn('ACEITAR', 'btn-mini btn-primary', () => {
        const err = Missions.accept(m.id);
        if (err) UI.toast(err, 'bad');
        UI.dirty();
      });
      const days = Math.max(0, (m.deadline - G.time) / 1440);
      t.tbody.appendChild(trow([
        '<span class="hi">' + U.esc(m.title) + '</span>',
        U.esc(m.employer),
        '<span class="muted">' + U.esc(m.targetName || '-') + '</span>',
        '<span class="ok">' + U.credits(m.payment) + '</span>',
        days.toFixed(1) + 'd',
        b
      ]));
    });
    body.appendChild(t);
  }

  function uisSoftware(body, rec) {
    body.appendChild(h2('LOJA DE SOFTWARE'));
    body.appendChild(p('Memoria livre: ' + G.memFree() + 'Gq de ' + G.memTotal() + 'Gq  |  Creditos: ' + U.credits(G.credits), 'muted mb'));
    const t = table(['SOFTWARE', 'SUA', 'PROXIMA', 'TAM', 'PRECO', '']);
    D.SOFTWARE.forEach(sw => {
      const have = G.swVersion(sw.id);
      const next = have + 1;
      const maxed = have >= sw.maxv;
      const price = maxed ? 0 : D.swPrice(sw, next);
      const canBuy = !maxed && G.credits >= price && (have > 0 || G.memFree() >= sw.size);
      const b = maxed
        ? U.el('span', 'pill g', 'MAX')
        : btn('COMPRAR', 'btn-mini' + (canBuy ? ' btn-primary' : ''), () => {
          if (G.credits < price) return UI.toast('Creditos insuficientes.', 'bad');
          if (have === 0 && G.memFree() < sw.size) return UI.toast('Memoria insuficiente.', 'bad');
          G.pay(-price, 'Compra: ' + sw.name + ' v' + next);
          G.addSw(sw.id, next);
          UI.toast(sw.name + ' v' + next + ' instalado.', 'ok');
          G.save(); UI.dirty();
        }, !canBuy);
      const tr = trow([
        '<span class="hi">' + sw.name + '</span><div class="muted" style="font-size:10px">' + U.esc(sw.desc) + '</div>',
        have ? 'v' + have : '<span class="muted">-</span>',
        maxed ? '-' : 'v' + next,
        sw.size + 'Gq',
        maxed ? '-' : U.credits(price),
        b
      ]);
      t.tbody.appendChild(tr);
    });
    body.appendChild(t);
  }

  function uisHardware(body, rec) {
    body.appendChild(h2('LOJA DE HARDWARE'));
    const gw = G.gw();
    const info = U.el('div', 'mono-block mb');
    info.textContent =
      'GATEWAY : ' + gw.name + '\n' +
      'CPU     : ' + G.cpuPower() + ' GHz  (' + G.gateway.cpus.length + '/' + gw.cpuSlots + ' slots)\n' +
      'MEMORIA : ' + G.memUsed() + '/' + G.memTotal() + ' Gq  (' + G.gateway.mems.length + '/' + gw.memSlots + ' slots)\n' +
      'BANDA   : ' + G.bandwidth() + ' Gq/s';
    body.appendChild(info);

    body.appendChild(h3('GATEWAYS'));
    const gt = table(['MODELO', 'CPU', 'MEM', 'BANDA', 'PRECO', '']);
    D.GATEWAYS.forEach(g => {
      const cur = g.id === G.gateway.id;
      const b = cur ? U.el('span', 'pill g', 'ATUAL')
        : btn('TROCAR', 'btn-mini', () => {
          if (G.credits < g.price) return UI.toast('Creditos insuficientes.', 'bad');
          G.pay(-g.price, 'Upgrade de gateway: ' + g.name);
          G.gateway.id = g.id;
          G.gateway.cpus = G.gateway.cpus.slice(0, g.cpuSlots);
          G.gateway.mems = G.gateway.mems.slice(0, g.memSlots);
          UI.toast('Gateway substituido por ' + g.name, 'ok');
          G.save(); UI.dirty();
        }, G.credits < g.price);
      gt.tbody.appendChild(trow([
        '<span class="hi">' + g.name + '</span><div class="muted" style="font-size:10px">' + U.esc(g.desc) + '</div>',
        g.cpuSlots + ' slots', g.memSlots + ' slots', g.bw + 'Gq/s', U.credits(g.price), b
      ]));
    });
    body.appendChild(gt);

    body.appendChild(h3('CPU  (slots usados: ' + G.gateway.cpus.length + '/' + gw.cpuSlots + ')'));
    const ct = table(['PECA', 'POTENCIA', 'PRECO', '']);
    D.CPUS.forEach(c => {
      const b = btn('INSTALAR', 'btn-mini', () => {
        if (G.gateway.cpus.length >= gw.cpuSlots) return UI.toast('Sem slots de CPU livres.', 'bad');
        if (c.power > gw.maxCPU) return UI.toast('Este gateway nao suporta esta CPU.', 'bad');
        if (G.credits < c.price) return UI.toast('Creditos insuficientes.', 'bad');
        G.pay(-c.price, 'Compra: ' + c.name);
        G.gateway.cpus.push(c.id);
        UI.toast(c.name + ' instalada.', 'ok'); G.save(); UI.dirty();
      });
      ct.tbody.appendChild(trow([c.name, c.power + ' GHz', U.credits(c.price), b]));
    });
    const cRem = row('mt');
    if (G.gateway.cpus.length > 1) {
      cRem.appendChild(btn('REMOVER ULTIMA CPU', 'btn-mini btn-danger', () => {
        G.gateway.cpus.pop(); UI.dirty();
      }));
    }
    body.appendChild(ct); body.appendChild(cRem);

    body.appendChild(h3('MEMORIA  (slots usados: ' + G.gateway.mems.length + '/' + gw.memSlots + ')'));
    const mt = table(['PECA', 'TAMANHO', 'PRECO', '']);
    D.MEMS.forEach(m => {
      const b = btn('INSTALAR', 'btn-mini', () => {
        if (G.gateway.mems.length >= gw.memSlots) return UI.toast('Sem slots de memoria livres.', 'bad');
        if (G.credits < m.price) return UI.toast('Creditos insuficientes.', 'bad');
        G.pay(-m.price, 'Compra: ' + m.name);
        G.gateway.mems.push(m.id);
        UI.toast(m.name + ' instalado.', 'ok'); G.save(); UI.dirty();
      });
      mt.tbody.appendChild(trow([m.name, m.size + ' Gq', U.credits(m.price), b]));
    });
    body.appendChild(mt);

    body.appendChild(h3('MODEM'));
    const dt = table(['PECA', 'BANDA', 'PRECO', '']);
    D.MODEMS.forEach(md => {
      const cur = md.id === G.gateway.modem;
      const b = cur ? U.el('span', 'pill g', 'ATUAL')
        : btn('INSTALAR', 'btn-mini', () => {
          if (G.credits < md.price) return UI.toast('Creditos insuficientes.', 'bad');
          G.pay(-md.price, 'Compra: ' + md.name);
          G.gateway.modem = md.id;
          UI.toast(md.name + ' instalado.', 'ok'); G.save(); UI.dirty();
        }, G.credits < md.price);
      dt.tbody.appendChild(trow([md.name, md.bw + ' Gq/s', U.credits(md.price), b]));
    });
    body.appendChild(dt);
  }

  function uisStatus(body) {
    body.appendChild(h2('STATUS DO AGENTE'));
    const nxt = G.nextRatingPoints();
    const blk = U.el('div', 'mono-block');
    blk.textContent =
      'HANDLE            : ' + G.handle + '\n' +
      'IP DO GATEWAY     : ' + Net.playerIP() + '\n' +
      'RATING UPLINK     : ' + G.ratingName() + '  (' + G.points + ' pts)\n' +
      'PROXIMO NIVEL     : ' + (nxt === null ? 'MAXIMO ATINGIDO' : nxt + ' pts') + '\n' +
      'RATING NEUROMANCER: ' + G.neuroName() + '\n' +
      'CREDITOS          : ' + U.credits(G.credits) + '\n' +
      'CONTRATOS OK      : ' + G.missions.done.length + '\n' +
      'CONTRATOS FALHOS  : ' + G.missions.failed + '\n' +
      'AVISOS LEGAIS     : ' + (G.flags.busts || 0) + ' / 3\n' +
      'DATA              : ' + U.fmtDate(G.time);
    body.appendChild(blk);

    if (nxt !== null) {
      const cur = D.RATING_POINTS[G.ratingIndex()];
      const pct = ((G.points - cur) / (nxt - cur)) * 100;
      const bar = U.el('div', 'bar mt');
      const i = U.el('i'); i.style.width = U.clamp(pct, 0, 100) + '%';
      bar.appendChild(i); body.appendChild(bar);
    }

    body.appendChild(h3('HISTORICO'));
    if (!G.missions.done.length) body.appendChild(p('Nenhum contrato concluido ainda.', 'muted'));
    else {
      const t = table(['CONTRATO', 'EMPREGADOR', 'PAGAMENTO', 'DATA']);
      G.missions.done.slice().reverse().slice(0, 30).forEach(m => {
        t.tbody.appendChild(trow([U.esc(m.title), U.esc(m.employer),
          '<span class="ok">' + U.credits(m.payment) + '</span>', U.fmtDateShort(m.completedAt || m.posted)]));
      });
      body.appendChild(t);
    }
  }

  /* =========================================================
     CONTRATOS ATIVOS
     ========================================================= */
  Apps.missions = function () {
    UI.open('missions', {
      title: 'CONTRATOS ATIVOS', w: 700, h: 480, live: true,
      render: function (body, rec) {
        body.appendChild(h2('CONTRATOS EM ANDAMENTO (' + G.missions.active.length + '/5)'));
        if (!G.missions.active.length) {
          body.appendChild(p('Nenhum contrato ativo. Va ate Uplink Internal Services > Contratos.', 'muted'));
          return;
        }
        G.missions.active.forEach(m => {
          const box = U.el('div', 'mono-block mb');
          const left = Math.max(0, (m.deadline - G.time) / 1440);
          const head = U.el('div');
          head.innerHTML = '<span class="hi">' + U.esc(m.title) + '</span>  ' +
            '<span class="pill ' + (left < 1 ? 'r' : 'a') + '">' + left.toFixed(2) + ' dias</span>  ' +
            '<span class="pill g">' + U.credits(m.payment) + '</span>';
          box.appendChild(head);
          const d = U.el('div', 'muted mt'); d.textContent = m.desc; box.appendChild(d);

          const acts = row('mt wrap');
          if (m.targetIp) {
            acts.appendChild(btn('DEFINIR COMO ALVO', 'btn-mini btn-primary', () => {
              Net.setTarget(m.targetIp);
              if (!G.links.includes(m.targetIp)) G.links.push(m.targetIp);
              UI.toast('Alvo: ' + m.targetName, 'ok'); Apps.map();
            }));
          }
          if (m.type === 'steal_file') {
            /* estado da entrega, para o jogador saber o que falta */
            const mem = G.memory.find(f => f.name === m.fileName && f.src === m.targetIp);
            let st, cls;
            if (m.delivered) { st = 'ARQUIVO ENTREGUE - aguardando pagamento'; cls = 'ok'; }
            else if (!mem) { st = 'FALTA COPIAR o arquivo do servidor'; cls = 'warn'; }
            else if (mem.enc) { st = 'ARQUIVO CRIPTOGRAFADO (nivel ' + mem.enc + ') - use o Decrypter'; cls = 'bad'; }
            else { st = 'PRONTO PARA ENVIAR por e-mail'; cls = 'ok'; }
            box.appendChild(U.el('div', cls + ' mt', '>> ' + st));

            acts.appendChild(btn('ENTREGAR POR E-MAIL', 'btn-mini btn-primary', () => {
              const w = Apps.email();
              w.state.compose = true;
              w.state.to = m.email;
              if (mem) w.state.att = mem.id;
              UI.focus('email');
              UI.dirty();
            }, !mem || !!mem.enc || !!m.delivered));
          }
          if (m.type === 'trace_hacker') {
            const ipf = input('ans_' + m.id, 'IP do hacker', m.submitted || '');
            ipf.style.width = '160px';
            acts.appendChild(ipf);
            acts.appendChild(btn('ENVIAR IP', 'btn-mini', () => {
              m.submitted = ipf.value.trim();
              if (m.submitted === m.answer) UI.toast('IP confirmado!', 'ok');
              else UI.toast('IP incorreto. O empregador nao ficou feliz.', 'bad');
              UI.dirty();
            }));
          }
          acts.appendChild(btn('ABANDONAR', 'btn-mini btn-danger', () => {
            Missions.abandon(m.id); UI.dirty();
          }));
          box.appendChild(acts);
          body.appendChild(box);
        });
      }
    });
  };

  /* =========================================================
     LINKS
     ========================================================= */
  Apps.links = function () {
    UI.open('links', {
      title: 'LINKS CONHECIDOS', w: 760, h: 460,
      render: function (body, rec) {
        body.appendChild(h2('SERVIDORES CONHECIDOS (' + G.links.length + ')'));
        const bar = row('mb');
        const f = input('ipadd', 'IP para resolver (IP_Lookup)');
        f.style.width = '220px';
        bar.appendChild(f);
        bar.appendChild(btn('IP_LOOKUP', 'btn-mini', () => {
          const err = Soft.run('ip_lookup', { ip: f.value.trim() });
          if (err) UI.toast(err, 'bad');
          UI.dirty();
        }));
        bar.appendChild(btn('IP_PROBE', 'btn-mini', () => {
          const err = Soft.run('ip_probe', { ip: f.value.trim() });
          if (err) UI.toast(err, 'bad');
        }));
        body.appendChild(bar);

        const t = table(['SERVIDOR', 'IP', 'TIPO', 'SEGURANCA', 'ACOES']);
        G.links.forEach(ip => {
          const s = G.srv(ip);
          if (!s) return;
          const inRoute = G.conn.route.includes(ip);
          const isTarget = G.conn.target === ip;
          const acts = row();
          acts.appendChild(btn(isTarget ? 'ALVO ✓' : 'ALVO', 'btn-mini' + (isTarget ? ' btn-primary' : ''), () => {
            const e = Net.setTarget(ip); if (e) UI.toast(e, 'bad'); UI.dirty();
          }));
          acts.appendChild(btn(inRoute ? 'NA ROTA ✓' : '+ ROTA', 'btn-mini' + (inRoute ? ' btn-primary' : ''), () => {
            const e = inRoute ? Net.removeHop(ip) : Net.addHop(ip);
            if (e) UI.toast(e, 'bad'); UI.dirty();
          }));
          acts.appendChild(btn('X', 'btn-mini btn-danger', () => {
            const i = G.links.indexOf(ip); if (i >= 0) G.links.splice(i, 1); UI.dirty();
          }));
          let sec = '<span class="muted">desconhecida</span>';
          if (s.probed) {
            sec = secPills(s);
          }
          t.tbody.appendChild(trow([
            '<span class="hi">' + U.esc(s.name) + '</span>',
            '<span class="cy">' + s.ip + '</span>',
            '<span class="muted">' + s.type + '</span>',
            sec, acts
          ]));
        });
        body.appendChild(t);
      }
    });
  };

  function secPills(s) {
    const out = [];
    if (s.sec.pass) out.push('<span class="pill a">PASS</span>');
    if (s.sec.proxy) out.push('<span class="pill a">PROXY ' + s.sec.proxy + '</span>');
    if (s.sec.firewall) out.push('<span class="pill a">FW ' + s.sec.firewall + '</span>');
    if (s.sec.monitor) out.push('<span class="pill r">MON ' + s.sec.monitor + '</span>');
    if (!out.length) out.push('<span class="pill g">ABERTO</span>');
    return out.join(' ');
  }
  Apps.secPills = secPills;

  /* nome curto de servidor, sem o sufixo institucional */
  function shortName(s) {
    const n = s.name.replace(
      / (Internal Services Machine|Central Mainframe|Public Access Server|File Server)$/, '');
    return n.length > 20 ? n.slice(0, 19) + '.' : n;
  }
  Apps.shortName = shortName;

  /* =========================================================
     MAPA / ROTA
     ========================================================= */
  Apps.map = function () {
    UI.open('map', {
      title: 'ANALISE DE CONEXAO', w: 980, h: 620,
      render: function (body, rec) {
        const wrap = U.el('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;height:100%';

        /* topo: rota atual */
        const top = U.el('div', 'mb');
        const tgt = G.conn.target ? G.srv(G.conn.target) : null;
        const chain = ['VOCE'].concat(G.conn.route.map(ip => {
          const s = G.srv(ip); return s ? shortName(s) : ip;
        })).concat([tgt ? shortName(tgt) : '???']);
        const line = U.el('div', 'mono-block');
        line.innerHTML = chain.map((c, i) =>
          '<span class="' + (i === 0 ? 'ok' : (i === chain.length - 1 ? 'bad' : 'cy')) + '">' + U.esc(c) + '</span>'
        ).join('<span class="muted"> -> </span>');
        top.appendChild(line);

        const est = tgt ? Net.estimateTrace(tgt.ip) : 0;
        const estTxt = !tgt ? '--:--' : (est > 3600 ? 'SEM MONITOR' : U.fmtSecs(est));
        const estCls = !tgt ? 'muted' : (est > 3600 || est > 120 ? 'ok' : est > 60 ? 'warn' : 'bad');
        const stat = U.el('div', 'row between mt');
        stat.innerHTML =
          '<span class="muted">SALTOS: <b class="hi">' + G.conn.route.length + '</b>' +
          '   TEMPO DE TRACE ESTIMADO: <b class="' + estCls + '">' + estTxt + '</b></span>';
        top.appendChild(stat);

        const acts = row('mt wrap');
        acts.appendChild(btn(G.conn.live ? 'DESCONECTAR' : 'CONECTAR',
          G.conn.live ? 'btn-danger' : 'btn-primary', () => {
            if (G.conn.live) { Net.disconnect(); }
            else { const e = Net.connect(); if (e) UI.toast(e, 'bad'); }
            UI.dirty();
          }, !G.conn.live && !G.conn.target));
        acts.appendChild(btn('LIMPAR ROTA', '', () => { const e = Net.clearRoute(); if (e) UI.toast(e, 'bad'); UI.dirty(); }));
        acts.appendChild(btn('ROTA AUTOMATICA', '', () => {
          const e = Net.clearRoute(); if (e) return UI.toast(e, 'bad');
          const cands = G.links.filter(ip => ip !== G.conn.target);
          const shuffled = cands.sort(() => Math.random() - 0.5).slice(0, Math.min(6, cands.length));
          shuffled.forEach(ip => Net.addHop(ip));
          UI.toast('Rota gerada com ' + G.conn.route.length + ' saltos.', 'ok');
          UI.dirty();
        }));
        top.appendChild(acts);
        top.appendChild(p('Clique num no para adicionar/remover da rota. Shift+clique define o alvo.', 'muted mt'));
        wrap.appendChild(top);

        /* mapa svg */
        const holder = U.el('div', 'grow');
        holder.style.cssText = 'border:1px solid var(--edge);overflow:hidden;position:relative';
        holder.appendChild(buildMap());
        wrap.appendChild(holder);
        body.appendChild(wrap);
      }
    });
  };

  /* silhuetas simplificadas dos continentes, em coordenadas 0-1000 x 0-520 */
  const CONTINENTS = [
    /* America do Norte */
    '80,120 150,95 235,88 300,100 292,140 262,150 268,178 240,205 225,255 195,240 170,205 150,165 110,150',
    /* America Central + do Sul */
    '215,262 245,258 262,285 300,300 322,345 330,400 305,455 275,470 252,430 240,370 225,320',
    /* Europa */
    '430,105 470,92 520,100 545,118 530,145 495,160 462,155 440,135',
    /* Africa */
    '452,185 520,175 565,190 578,240 560,300 528,360 495,392 470,355 458,290 448,235',
    /* Asia */
    '548,95 640,72 730,70 820,88 880,110 862,152 800,168 742,160 700,185 655,190 612,170 570,150 552,125',
    /* India */
    '648,192 700,190 706,225 678,270 655,235',
    /* Sudeste asiatico */
    '740,190 790,196 800,230 772,262 742,240',
    /* Indonesia */
    '760,286 815,282 838,300 800,315 762,308',
    /* Australia */
    '822,352 890,345 912,382 890,428 838,432 812,396',
    /* Japao */
    '882,120 900,112 906,142 890,158',
    /* Groenlandia */
    '330,42 392,38 402,72 362,92 332,70',
    /* Reino Unido / Escandinavia */
    '408,88 428,80 432,106 412,112'
  ];

  function buildMap() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('id', 'mapsvg');
    svg.setAttribute('viewBox', '0 0 1000 520');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    /* grade de fundo (latitude / longitude) */
    for (let x = 0; x <= 1000; x += 50) {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', x); l.setAttribute('y1', 0);
      l.setAttribute('x2', x); l.setAttribute('y2', 520);
      l.setAttribute('stroke', '#0d2028'); l.setAttribute('stroke-width', '1');
      svg.appendChild(l);
    }
    for (let y = 0; y <= 520; y += 40) {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', 0); l.setAttribute('y1', y);
      l.setAttribute('x2', 1000); l.setAttribute('y2', y);
      l.setAttribute('stroke', '#0d2028'); l.setAttribute('stroke-width', '1');
      svg.appendChild(l);
    }

    /* continentes */
    CONTINENTS.forEach(pts => {
      const poly = document.createElementNS(NS, 'polygon');
      poly.setAttribute('points', pts);
      poly.setAttribute('class', 'map-coast');
      svg.appendChild(poly);
    });

    const pos = ip => {
      const s = G.srv(ip);
      return s ? { x: (s.x / 100) * 1000, y: (s.y / 100) * 520 } : null;
    };

    /* linhas da rota */
    const chain = G.conn.route.concat(G.conn.target ? [G.conn.target] : []);
    for (let i = 0; i < chain.length - 1; i++) {
      const a = pos(chain[i]), b = pos(chain[i + 1]);
      if (!a || !b) continue;
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', a.x); l.setAttribute('y1', a.y);
      l.setAttribute('x2', b.x); l.setAttribute('y2', b.y);
      l.setAttribute('class', 'map-link');
      svg.appendChild(l);
    }

    /* nos */
    G.links.forEach(ip => {
      const s = G.srv(ip);
      if (!s) return;
      const pt = pos(ip);
      const g = document.createElementNS(NS, 'g');
      let cls = 'map-node';
      if (G.conn.target === ip) cls += ' target';
      else if (G.conn.route.includes(ip)) cls += ' in-route';
      g.setAttribute('class', cls);
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y); c.setAttribute('r', 7);
      const tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', pt.x + 11); tx.setAttribute('y', pt.y + 4);
      tx.textContent = s.name.length > 26 ? s.name.slice(0, 24) + '..' : s.name;
      g.appendChild(c); g.appendChild(tx);
      g.addEventListener('click', (e) => {
        let err;
        if (e.shiftKey) err = Net.setTarget(ip);
        else if (G.conn.route.includes(ip)) err = Net.removeHop(ip);
        else err = Net.addHop(ip);
        if (err) UI.toast(err, 'bad');
        UI.dirty();
      });
      const title = document.createElementNS(NS, 'title');
      title.textContent = s.name + '\n' + s.ip + '\n' + s.city;
      g.appendChild(title);
      svg.appendChild(g);
    });
    return svg;
  }

  /* =========================================================
     GATEWAY (memoria + software)
     ========================================================= */
  Apps.gateway = function () {
    UI.open('gateway', {
      title: 'GATEWAY', w: 720, h: 500, live: true,
      render: function (body, rec) {
        const gw = G.gw();
        body.appendChild(h2('HARDWARE'));
        const blk = U.el('div', 'mono-block');
        blk.textContent =
          gw.name + '\n' +
          'CPU     : ' + G.cpuPower() + ' GHz (' + G.gateway.cpus.length + ' modulo(s))\n' +
          'MEMORIA : ' + G.memUsed() + ' / ' + G.memTotal() + ' Gq\n' +
          'BANDA   : ' + G.bandwidth() + ' Gq/s';
        body.appendChild(blk);
        const bar = U.el('div', 'bar mt' + (G.memFree() < 4 ? ' red' : ''));
        const bi = U.el('i'); bi.style.width = U.clamp((G.memUsed() / G.memTotal()) * 100, 0, 100) + '%';
        bar.appendChild(bi); body.appendChild(bar);

        body.appendChild(h3('SOFTWARE INSTALADO'));
        const st = table(['PROGRAMA', 'VER', 'TAM', '']);
        G.software.forEach(s => {
          const sw = D.SW_BY_ID[s.id];
          if (!sw) return;
          const useBtn = btn('EXECUTAR', 'btn-mini', () => {
            const ctx = { srv: G.conn.live ? G.srv(G.conn.target) : null };
            const err = Soft.run(s.id, ctx);
            if (err) UI.toast(err, 'bad');
            UI.dirty();
          });
          st.tbody.appendChild(trow([sw.name, 'v' + s.v, sw.size + 'Gq', useBtn]));
        });
        body.appendChild(st);

        body.appendChild(h3('MEMORIA - ARQUIVOS'));
        if (!G.memory.length) body.appendChild(p('Nenhum arquivo armazenado.', 'muted'));
        else {
          const ft = table(['ARQUIVO', 'TAM', 'ORIGEM', 'CRIPTO', '']);
          G.memory.forEach(f => {
            const acts = row();
            if (f.enc) {
              acts.appendChild(btn('DECRYPT', 'btn-mini', () => {
                const err = Soft.run('decrypter', { mem: f });
                if (err) UI.toast(err, 'bad'); UI.dirty();
              }));
            }
            if (f.body) {
              acts.appendChild(btn('LER', 'btn-mini', () => {
                if (f.enc) return UI.toast('Arquivo criptografado.', 'bad');
                UI.open('reader', {
                  title: 'ARQUIVO: ' + f.name, w: 520, h: 380,
                  render: b => { b.appendChild(U.el('div', 'mono-block', f.body)); }
                });
              }));
            }
            acts.appendChild(btn('X', 'btn-mini btn-danger', () => { G.deleteMem(f.id); UI.dirty(); }));
            const src = G.srv(f.src);
            ft.tbody.appendChild(trow([
              '<span class="hi">' + U.esc(f.name) + '</span>', f.size + 'Gq',
              '<span class="muted">' + U.esc(src ? src.name : f.src || '-') + '</span>',
              f.enc ? '<span class="bad">nivel ' + f.enc + '</span>' : '<span class="ok">nao</span>',
              acts
            ]));
          });
          body.appendChild(ft);
        }

        if (G.tasks.length) {
          body.appendChild(h3('TAREFAS EM EXECUCAO'));
          G.tasks.forEach(t => body.appendChild(taskBox(t)));
        }
      }
    });
  };

  function taskBox(t) {
    const box = U.el('div', 'task');
    const head = U.el('div', 't-name');
    const eta = Soft.eta(t);
    head.innerHTML = '<span>' + U.esc(t.label) + '</span><span>' +
      (isFinite(eta) ? U.fmtSecs(eta) : '--:--') + '</span>';
    box.appendChild(head);
    const bar = U.el('div', 'bar amber mt');
    const i = U.el('i'); i.style.width = Soft.pct(t) + '%';
    bar.appendChild(i); box.appendChild(bar);
    const ab = U.el('button', 'btn btn-mini mt', 'ABORTAR');
    ab.addEventListener('click', () => { Soft.abort(t.id); UI.dirty(); });
    box.appendChild(ab);
    return box;
  }
  Apps.taskBox = taskBox;

  /* =========================================================
     FINANCAS
     ========================================================= */
  Apps.finance = function () {
    UI.open('finance', {
      title: 'FINANCAS', w: 680, h: 460,
      render: function (body, rec) {
        const acc = G.playerAccount();
        const bank = G.srv(G.bank.ip);
        body.appendChild(h2('CONTA PESSOAL'));
        const blk = U.el('div', 'mono-block');
        blk.textContent =
          'BANCO   : ' + bank.name + '\n' +
          'IP      : ' + bank.ip + '\n' +
          'CONTA   : ' + G.bank.no + '\n' +
          'SENHA   : ' + G.bank.pass + '\n' +
          'SALDO   : ' + U.credits(acc ? acc.balance : G.credits);
        body.appendChild(blk);

        body.appendChild(h3('EXTRATO'));
        if (!acc || !acc.statements.length) body.appendChild(p('Sem movimentacoes.', 'muted'));
        else {
          const t = table(['DATA', 'DESCRICAO', 'VALOR']);
          acc.statements.slice(0, 30).forEach(s => {
            t.tbody.appendChild(trow([
              U.fmtDateShort(s.t), U.esc(s.txt),
              '<span class="' + (s.amt >= 0 ? 'ok' : 'bad') + '">' +
              (s.amt >= 0 ? '+' : '') + U.credits(s.amt) + '</span>'
            ]));
          });
          body.appendChild(t);
        }
      }
    });
  };

  /* =========================================================
     MANUAL
     ========================================================= */
  Apps.help = function () {
    UI.open('help', {
      title: 'MANUAL DO AGENTE', w: 760, h: 540,
      render: function (body) {
        body.appendChild(h2('MANUAL DE OPERACOES UPLINK'));
        const txt = U.el('div', 'mono-block');
        txt.textContent =
'1. O CICLO BASICO\n' +
'   Uplink Internal Services -> aceite um contrato -> monte a rota\n' +
'   -> conecte -> quebre a seguranca -> execute -> APAGUE OS LOGS\n' +
'   -> desconecte.\n\n' +
'   CONTRATOS DE ROUBO DE ARQUIVO tem um passo a mais: copiar nao\n' +
'   basta. Depois de sair do servidor, abra o CLIENTE DE E-MAIL,\n' +
'   clique em ENVIAR ARQUIVO, escolha o contrato e o anexo, e envie.\n' +
'   O contratante so libera o pagamento quando recebe o arquivo -\n' +
'   e ele precisa estar descriptografado. Anexo errado volta com\n' +
'   uma recusa e o contrato continua aberto.\n' +
'   Os outros tipos de contrato sao verificados automaticamente.\n\n' +
'2. ROTA DE BOUNCE (janela ROTA)\n' +
'   Nunca conecte direto. Cada servidor intermediario multiplica o tempo\n' +
'   que o trace leva para chegar ate voce. Bancos e bases governamentais\n' +
'   sao os melhores saltos. Use "ROTA AUTOMATICA" se estiver com pressa.\n\n' +
'3. CAMADAS DE SEGURANCA\n' +
'   PASSWORD  - Password_Breaker (ou Dictionary_Hacker em alvos fracos)\n' +
'   PROXY     - bloqueia ESCRITA: apagar arquivos e apagar logs\n' +
'   FIREWALL  - bloqueia LEITURA: listar e copiar arquivos\n' +
'   MONITOR   - dispara o trace ativo quando detecta acao ilegal\n' +
'   Versao do software precisa ser >= ao nivel da camada.\n' +
'   BYPASS e silencioso, DISABLE e mais barato mas registra alerta.\n\n' +
'4. TRACE ATIVO (barra vermelha)\n' +
'   Comeca na primeira acao ilegal em servidor monitorado.\n' +
'   Se completar enquanto voce estiver conectado: FIM DE JOGO.\n' +
'   Desconectar cancela o trace ativo imediatamente.\n' +
'   Trace_Tracker v3+ mostra o tempo exato restante.\n' +
'   Monitor_Bypass, se rodado ANTES da primeira acao ilegal, impede o trace.\n\n' +
'5. TRACE PASSIVO (o que mais mata iniciante)\n' +
'   Ao conectar, cada maquina da rota grava um log com o IP anterior.\n' +
'   Horas depois, investigadores seguem essa trilha de tras para frente.\n' +
'   Se TODOS os logs estiverem intactos, eles chegam ate voce: multa e\n' +
'   perda de rating. Tres avisos = licenca revogada.\n' +
'   Basta quebrar UM elo: apague o log do alvo antes de sair.\n' +
'   Log_Modifier e melhor que Log_Deleter (log apagado levanta suspeita).\n\n' +
'6. VELOCIDADE DO TEMPO\n' +
'   Os botoes 1x/5x/20x aceleram apenas o RELOGIO do jogo (prazos,\n' +
'   traces passivos, novas ofertas). Hacks e traces ativos correm sempre\n' +
'   em tempo real. Pause com "||" quando precisar pensar.\n\n' +
'7. HARDWARE\n' +
'   CPU acelera todas as ferramentas (dividida entre tarefas simultaneas).\n' +
'   MEMORIA guarda software e arquivos roubados.\n' +
'   MODEM define a velocidade de copia de arquivos.\n\n' +
'8. SOM\n' +
'   O botao SOM na barra superior liga e desliga o audio.\n' +
'   O modem disca quando voce entra no sistema - so uma vez por sessao.\n' +
'   Aprenda a jogar de ouvido: o bipe do trace acelera conforme o tempo\n' +
'   acaba. Quando ele virar um bipe duplo rapido, voce tem poucos segundos.\n' +
'   Cada ferramenta tem um som proprio, entao da para saber o que terminou\n' +
'   sem tirar os olhos da tela do servidor.\n\n' +
'9. DICAS\n' +
'   - Treine na Uplink Test Machine: senha rosebud, sem monitor.\n' +
'   - IP_Probe revela a seguranca do alvo ANTES de conectar.\n' +
'   - Senhas de contas bancarias ficam guardadas nos servidores\n' +
'     Internal Services das empresas e dos titulares.\n' +
'   - Rode o console admin do mainframe com "delete all" para\n' +
'     destruir um sistema inteiro de uma vez.\n' +
'   - Arquivos criptografados nao contam como entregues: use Decrypter.';
        body.appendChild(txt);
      }
    });
  };

  global.Apps = Apps;
})(window);
