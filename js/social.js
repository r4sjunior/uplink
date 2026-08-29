/* =========================================================
   social.js - redes sociais: geracao dos perfis e a tela que
   imita o layout da plataforma invadida
   ========================================================= */
(function (global) {
  'use strict';

  const Social = {};

  function el(t, c, x) { return U.el(t, c, x); }

  /* =========================================================
     GERACAO
     ========================================================= */
  function handleBase(name, rng) {
    const p = name.toLowerCase().replace(/[^a-z ]/g, '').split(' ');
    const styles = [
      () => p[0] + '_' + p[1],
      () => p[0] + p[1],
      () => p[0][0] + p[1],
      () => p[0] + '.' + p[1],
      () => p[1] + p[0][0] + rng.int(70, 99)
    ];
    let h = rng.pick(styles)();
    if (rng.chance(0.35)) h += rng.int(2, 99);
    return h;
  }

  function makePost(rng, now, kind, opts) {
    opts = opts || {};
    const age = opts.age !== undefined ? opts.age : rng.int(60, 60 * 24 * 400);
    let txt;
    if (opts.txt) txt = opts.txt;
    else if (kind === 'photo') txt = rng.pick(D.POST_PHOTO);
    else if (kind === 'pro') txt = rng.pick(D.POST_PRO);
    else txt = rng.pick(D.POST_LINES);
    if (kind !== 'pro' && rng.chance(0.3)) txt += ' ' + rng.pick(D.POST_TAGS);
    return {
      id: 'po' + Math.floor(rng() * 1e9).toString(36),
      t: now - age,
      txt: txt,
      likes: rng.int(0, kind === 'photo' ? 900 : 240),
      shares: rng.int(0, 60),
      comments: rng.int(0, 40),
      img: kind === 'photo' ? { h: rng.int(0, 359), s: rng.int(0, 999), k: rng.int(0, 3) } : null,
      planted: !!opts.planted,
      spicy: !!opts.spicy
    };
  }

  function makeDM(rng, world, now, secret) {
    const other = rng.pick(world.people);
    const n = rng.int(3, 7);
    const msgs = [];
    let t = now - rng.int(120, 60 * 24 * 90);
    for (let i = 0; i < n; i++) {
      t += rng.int(2, 90);
      const useSecret = secret && i === Math.floor(n / 2);
      msgs.push({
        me: rng.chance(0.5),
        txt: useSecret ? rng.pick(D.DM_SECRET) : rng.pick(D.DM_LINES),
        t: t
      });
    }
    return {
      id: 'dm' + Math.floor(rng() * 1e9).toString(36),
      name: other.name,
      handle: handleBase(other.name, rng),
      msgs: msgs
    };
  }

  /* devolve { chave-da-rede: [perfis] } */
  Social.makeProfiles = function (rng, world, now) {
    const map = {};
    D.SOCIAL_NETS.forEach(n => { map[n.key] = []; });

    world.people.forEach((p, i) => {
      const nets = rng.pickMany(D.SOCIAL_NETS, rng.int(1, 2));
      nets.forEach(net => {
        const nPosts = rng.int(4, 9);
        const posts = [];
        for (let k = 0; k < nPosts; k++) posts.push(makePost(rng, now, net.kind));
        /* alguns perfis carregam publicacoes comprometedoras */
        if (rng.chance(0.3)) {
          posts.push(makePost(rng, now, net.kind, {
            txt: rng.pick(D.POST_SPICY), spicy: true, age: rng.int(60, 60 * 24 * 120)
          }));
        }
        posts.sort((a, b) => b.t - a.t);

        const dms = [];
        const nDM = rng.chance(0.55) ? rng.int(1, 3) : 0;
        for (let k = 0; k < nDM; k++) dms.push(makeDM(rng, world, now, k === 0 && rng.chance(0.5)));

        map[net.key].push({
          id: 'sp' + net.key + i,
          pid: p.id,
          name: p.name,
          handle: handleBase(p.name, rng),
          bio: rng.pick(D.SOCIAL_BIOS),
          job: p.social.employer,
          city: rng.pick(D.CITIES)[0],
          joined: rng.int(2008, 2013),
          followers: rng.chance(0.08) ? rng.int(12000, 240000) : rng.int(40, 3500),
          following: rng.int(30, 900),
          verified: rng.chance(0.12),
          posts: posts,
          dms: dms,
          wiped: false,
          locked: false,
          dumped: false
        });
      });
    });
    return map;
  };

  /* =========================================================
     CONSULTAS
     ========================================================= */
  Social.servers = function () {
    return Object.values(G.world.servers).filter(s => s.type === 'socialnet');
  };
  Social.profile = function (srv, id) {
    if (!srv || !srv.net) return null;
    return srv.net.profiles.find(p => p.id === id) || null;
  };
  Social.dumpName = function (prof) { return 'dm-dump-' + prof.handle; };
  Social.netMeta = function (srv) {
    return D.SOCIAL_NETS.find(n => n.key === (srv.net && srv.net.key)) || D.SOCIAL_NETS[0];
  };

  /* texto que vai dentro do arquivo de dump */
  Social.dumpBody = function (srv, prof) {
    const meta = Social.netMeta(srv);
    const out = [
      'DUMP DE MENSAGENS PRIVADAS',
      'PLATAFORMA : ' + meta.name + ' (' + meta.domain + ')',
      'CONTA      : @' + prof.handle + '  (' + prof.name + ')',
      'EXTRAIDO EM: ' + U.fmtDate(G.time),
      'CONVERSAS  : ' + prof.dms.length,
      ''
    ];
    if (!prof.dms.length) out.push('(nenhuma conversa armazenada nesta conta)');
    prof.dms.forEach(c => {
      out.push('---------------------------------------------');
      out.push('CONVERSA COM ' + c.name + ' (@' + c.handle + ')');
      c.msgs.forEach(msg => {
        out.push('  [' + U.fmtDateShort(msg.t) + '] ' +
          (msg.me ? '@' + prof.handle : '@' + c.handle) + ': ' + msg.txt);
      });
      out.push('');
    });
    return out.join('\n');
  };

  /* =========================================================
     APRESENTACAO
     ========================================================= */
  function ago(t) {
    const d = Math.max(0, G.time - t);
    if (d < 60) return Math.round(d) + ' min';
    if (d < 1440) return Math.round(d / 60) + ' h';
    if (d < 1440 * 30) return Math.round(d / 1440) + ' d';
    return Math.round(d / (1440 * 30)) + ' mes';
  }
  Social.ago = ago;

  function hashOf(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }

  function avatar(nameOrHandle, size) {
    const h = hashOf(nameOrHandle);
    const a = el('div', 'sn-av');
    const hue = h % 360;
    a.style.background = 'linear-gradient(140deg,hsl(' + hue + ',45%,32%),hsl(' + ((hue + 48) % 360) + ',40%,18%))';
    a.style.width = a.style.height = (size || 36) + 'px';
    a.style.fontSize = Math.round((size || 36) * 0.38) + 'px';
    const parts = nameOrHandle.replace(/[^a-zA-Z ]/g, ' ').trim().split(/\s+/);
    a.textContent = ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    return a;
  }
  Social.avatar = avatar;

  /* "foto" procedural: um gradiente com formas, o suficiente para
     o feed parecer um feed */
  function photoBox(img, h) {
    const b = el('div', 'sn-photo');
    const hue = img ? img.h : 200;
    b.style.height = (h || 150) + 'px';
    b.style.background =
      'radial-gradient(circle at ' + (20 + (img.s % 60)) + '% ' + (20 + (img.s % 47)) + '%,' +
      'hsl(' + hue + ',55%,42%),hsl(' + ((hue + 40) % 360) + ',45%,14%) 70%)';
    const shapes = ['◼', '▲', '◍', '⌂'];
    const g = el('div', 'sn-photo-g', shapes[img.k % shapes.length]);
    b.appendChild(g);
    return b;
  }

  function counter(icon, n) {
    const s = el('span', 'sn-count');
    s.innerHTML = '<b>' + icon + '</b> ' + n;
    return s;
  }

  /* card de post no estilo da plataforma */
  function postCard(meta, prof, po, opts) {
    opts = opts || {};
    const c = el('div', 'sn-post' + (po.planted ? ' planted' : '') + (po.spicy ? ' spicy' : ''));
    const head = el('div', 'sn-post-head');
    head.appendChild(avatar(prof.name, 34));
    const who = el('div', 'sn-who');
    const l1 = el('div', 'sn-name');
    l1.textContent = prof.name;
    if (prof.verified) { const v = el('span', 'sn-verif', '✔'); l1.appendChild(v); }
    who.appendChild(l1);
    who.appendChild(el('div', 'sn-handle',
      '@' + prof.handle + ' · ' + ago(po.t) + (meta.kind === 'pro' ? ' · ' + prof.job : '')));
    head.appendChild(who);
    c.appendChild(head);

    if (meta.kind === 'photo' && po.img) c.appendChild(photoBox(po.img, 160));
    const body = el('div', 'sn-text', po.txt);
    c.appendChild(body);

    const acts = el('div', 'sn-acts');
    if (meta.kind === 'micro') {
      acts.appendChild(counter('↩', po.comments));
      acts.appendChild(counter('⇄', po.shares));
      acts.appendChild(counter('♥', po.likes));
    } else if (meta.kind === 'photo') {
      acts.appendChild(counter('♥', po.likes));
      acts.appendChild(counter('✉', po.comments));
    } else if (meta.kind === 'pro') {
      acts.appendChild(counter('👍', po.likes));
      acts.appendChild(counter('✎', po.comments));
      acts.appendChild(counter('↗', po.shares));
    } else {
      acts.appendChild(counter('★', po.likes));
      acts.appendChild(counter('✉', po.comments));
      acts.appendChild(counter('↗', po.shares));
    }
    if (po.planted) acts.appendChild(el('span', 'sn-flag', 'PUBLICADO POR VOCE'));
    if (opts.onDelete) {
      const b = el('button', 'sn-del', 'apagar');
      b.addEventListener('click', opts.onDelete);
      acts.appendChild(b);
    }
    c.appendChild(acts);
    return c;
  }

  /* =========================================================
     TELA DO SERVIDOR
     ========================================================= */
  ServerUI.scr_socialnet = function (m, s, rec) {
    const meta = Social.netMeta(s);
    const readOk = !(s.sec.firewall > 0 && !s.st.fwDown);
    const writeOk = !(s.sec.proxy > 0 && !s.st.proxyDown);

    const app = el('div', 'sn-app');
    app.style.setProperty('--acc', meta.accent);
    app.style.setProperty('--acc2', meta.accent2);

    /* ---- barra superior da plataforma ---- */
    const top = el('div', 'sn-top');
    const logo = el('div', 'sn-logo');
    logo.appendChild(el('span', 'sn-glyph', meta.glyph));
    logo.appendChild(el('span', null, meta.name));
    top.appendChild(logo);
    const q = U.el('input', 'sn-search');
    q.dataset.k = 'snq';
    q.placeholder = 'buscar pessoas em ' + meta.domain;
    q.spellcheck = false;
    q.value = rec.state.snq || '';
    q.addEventListener('input', () => { rec.state.snq = q.value; rec.state.spid = null; UI.dirty(); });
    top.appendChild(q);
    top.appendChild(el('div', 'sn-session', 'root@' + meta.domain + ' · painel de moderacao'));
    app.appendChild(top);

    const bodyRow = el('div', 'sn-body');

    /* ---- coluna esquerda ---- */
    const side = el('div', 'sn-side');
    const navs = [['feed', 'FEED GLOBAL'], ['people', 'CONTAS'], ['ops', 'FERRAMENTAS ADMIN']];
    navs.forEach(([k, lab]) => {
      const b = el('div', 'sn-navi' + ((rec.state.snview || 'feed') === k ? ' on' : ''), lab);
      b.addEventListener('click', () => { rec.state.snview = k; UI.dirty(); });
      side.appendChild(b);
    });
    const tr = el('div', 'sn-trends');
    tr.appendChild(el('div', 'sn-trends-h', 'ASSUNTOS DO MOMENTO'));
    D.SOCIAL_TRENDS.slice(0, 6).forEach((t, i) => {
      const row = el('div', 'sn-trend');
      row.appendChild(el('span', null, t));
      row.appendChild(el('b', null, ((7 - i) * 3.4).toFixed(1) + 'k'));
      tr.appendChild(row);
    });
    side.appendChild(tr);
    side.appendChild(el('div', 'sn-stat',
      s.net.profiles.length + ' contas neste cluster\n' +
      'uptime 99.4%  ·  shard ' + meta.key.toUpperCase() + '-07'));
    bodyRow.appendChild(side);

    /* ---- coluna central ---- */
    const main = el('div', 'sn-main');
    main.dataset.scroll = 'snmain';

    const prof = rec.state.spid ? Social.profile(s, rec.state.spid) : null;
    if (prof) renderProfile(main, s, rec, meta, prof, readOk, writeOk);
    else if ((rec.state.snview || 'feed') === 'people' || (rec.state.snq || '').length >= 2) renderPeople(main, s, rec, meta);
    else if (rec.state.snview === 'ops') renderOps(main, s, rec, meta, readOk, writeOk);
    else renderFeed(main, s, rec, meta);

    bodyRow.appendChild(main);
    app.appendChild(bodyRow);
    m.appendChild(app);
  };

  /* ---------- feed global ---------- */
  function renderFeed(main, s, rec, meta) {
    main.appendChild(el('div', 'sn-h', 'LINHA DO TEMPO GLOBAL'));
    if (!rec.state.feed) {
      const list = [];
      const profs = s.net.profiles;
      for (let i = 0; i < profs.length && list.length < 14; i += Math.max(1, Math.floor(profs.length / 14))) {
        const p = profs[i];
        if (!p.posts.length) continue;
        list.push({ pid: p.id, poid: p.posts[0].id, t: p.posts[0].t });
      }
      list.sort((a, b) => b.t - a.t);
      rec.state.feed = list;
    }
    rec.state.feed.forEach(ent => {
      const p = Social.profile(s, ent.pid);
      if (!p) return;
      const po = p.posts.find(x => x.id === ent.poid);
      if (!po) return;
      const card = postCard(meta, p, po);
      card.classList.add('clickable');
      card.addEventListener('click', () => { rec.state.spid = p.id; rec.state.stab = 'posts'; UI.dirty(); });
      main.appendChild(card);
    });
    main.appendChild(el('div', 'sn-note',
      'Clique em qualquer publicacao para abrir a conta. Use a busca para achar um alvo especifico.'));
  }

  /* ---------- lista de contas ---------- */
  function renderPeople(main, s, rec, meta) {
    const term = (rec.state.snq || '').toLowerCase();
    main.appendChild(el('div', 'sn-h', term ? 'RESULTADOS PARA "' + term + '"' : 'CONTAS DO CLUSTER'));
    let list = s.net.profiles;
    if (term) {
      list = list.filter(p => p.name.toLowerCase().includes(term) || p.handle.toLowerCase().includes(term));
    }
    if (!list.length) { main.appendChild(el('div', 'sn-note', 'Nenhuma conta encontrada.')); return; }
    list.slice(0, 40).forEach(p => {
      const r = el('div', 'sn-prow');
      r.appendChild(avatar(p.name, 38));
      const w = el('div', 'sn-who');
      const n = el('div', 'sn-name', p.name);
      if (p.verified) n.appendChild(el('span', 'sn-verif', '✔'));
      if (p.locked) n.appendChild(el('span', 'sn-lock', 'SUSPENSA'));
      w.appendChild(n);
      w.appendChild(el('div', 'sn-handle', '@' + p.handle + ' · ' +
        p.followers.toLocaleString('pt-BR') + ' seguidores · ' + p.posts.length + ' posts'));
      r.appendChild(w);
      r.addEventListener('click', () => { rec.state.spid = p.id; rec.state.stab = 'posts'; UI.dirty(); });
      main.appendChild(r);
    });
    if (list.length > 40) main.appendChild(el('div', 'sn-note', list.length + ' contas no total. Refine a busca.'));
  }

  /* ---------- ferramentas admin ---------- */
  function renderOps(main, s, rec, meta, readOk, writeOk) {
    main.appendChild(el('div', 'sn-h', 'PAINEL DE MODERACAO'));
    const box = el('div', 'sn-adm');
    box.appendChild(el('div', 'sn-adm-h', 'SESSAO ROOT — ' + meta.srv));
    box.appendChild(el('div', 'sn-note',
      'LEITURA DE CONTEUDO PRIVADO : ' + (readOk ? 'liberada' : 'bloqueada pelo firewall') + '\n' +
      'ESCRITA / PUBLICACAO        : ' + (writeOk ? 'liberada' : 'bloqueada pelo proxy') + '\n\n' +
      'Toda acao aqui e registrada no log server da plataforma.\n' +
      'Abra uma conta pela busca ou pelo feed para agir sobre ela.'));
    main.appendChild(box);
  }

  /* ---------- perfil ---------- */
  function renderProfile(main, s, rec, meta, prof, readOk, writeOk) {
    const back = el('div', 'sn-back', '‹ voltar');
    back.addEventListener('click', () => { rec.state.spid = null; UI.dirty(); });
    main.appendChild(back);

    const cover = el('div', 'sn-cover');
    main.appendChild(cover);

    const head = el('div', 'sn-phead');
    head.appendChild(avatar(prof.name, 62));
    const w = el('div', 'sn-who');
    const n = el('div', 'sn-name big', prof.name);
    if (prof.verified) n.appendChild(el('span', 'sn-verif', '✔'));
    if (prof.locked) n.appendChild(el('span', 'sn-lock', 'SUSPENSA'));
    w.appendChild(n);
    w.appendChild(el('div', 'sn-handle', '@' + prof.handle));
    w.appendChild(el('div', 'sn-bio', prof.bio));
    w.appendChild(el('div', 'sn-meta',
      (meta.kind === 'pro' ? prof.job + ' · ' : '') + prof.city + ' · entrou em ' + prof.joined));
    const st = el('div', 'sn-stats');
    st.innerHTML =
      '<span><b>' + prof.followers.toLocaleString('pt-BR') + '</b> seguidores</span>' +
      '<span><b>' + prof.following + '</b> seguindo</span>' +
      '<span><b>' + prof.posts.length + '</b> publicacoes</span>' +
      '<span><b>' + prof.dms.length + '</b> conversas</span>';
    w.appendChild(st);
    head.appendChild(w);
    main.appendChild(head);

    const tabs = el('div', 'sn-tabs');
    [['posts', 'PUBLICACOES'], ['dm', 'MENSAGENS'], ['adm', 'ACOES ADMIN']].forEach(([k, lab]) => {
      const b = el('div', 'sn-tab' + ((rec.state.stab || 'posts') === k ? ' on' : ''), lab);
      b.addEventListener('click', () => { rec.state.stab = k; UI.dirty(); });
      tabs.appendChild(b);
    });
    main.appendChild(tabs);

    const tab = rec.state.stab || 'posts';
    if (tab === 'posts') {
      if (!prof.posts.length) {
        main.appendChild(el('div', 'sn-note', 'Esta conta nao tem nenhuma publicacao.'));
      }
      const grid = el('div', meta.kind === 'photo' ? 'sn-grid' : '');
      prof.posts.forEach(po => {
        grid.appendChild(postCard(meta, prof, po, {
          onDelete: !writeOk ? null : function () {
            Net.illegal(s, 2);
            const i = prof.posts.indexOf(po);
            if (i >= 0) prof.posts.splice(i, 1);
            Snd.del();
            logHit(s, 'Publicacao removida da conta @' + prof.handle);
            UI.dirty();
          }
        }));
      });
      main.appendChild(grid);
    } else if (tab === 'dm') {
      renderDMs(main, s, rec, meta, prof, readOk);
    } else {
      renderAdmin(main, s, rec, meta, prof, readOk, writeOk);
    }
  }

  /* ---------- mensagens privadas ---------- */
  function renderDMs(main, s, rec, meta, prof, readOk) {
    if (!readOk) {
      main.appendChild(el('div', 'sn-locked',
        'CONTEUDO PRIVADO BLOQUEADO\n\n' +
        'O firewall da plataforma (nivel ' + s.sec.firewall + ') protege a caixa de\n' +
        'mensagens. Execute Firewall_Bypass v' + s.sec.firewall + ' ou superior.'));
      return;
    }
    if (!prof.dms.length) {
      main.appendChild(el('div', 'sn-note', 'Nenhuma conversa nesta conta.'));
      return;
    }
    const wrap = el('div', 'sn-dm');
    const list = el('div', 'sn-dm-list');
    prof.dms.forEach(c => {
      const it = el('div', 'sn-dm-item' + (rec.state.sdm === c.id ? ' on' : ''));
      it.appendChild(avatar(c.name, 28));
      const w = el('div', 'sn-who');
      w.appendChild(el('div', 'sn-name', c.name));
      w.appendChild(el('div', 'sn-handle', c.msgs[c.msgs.length - 1].txt.slice(0, 26) + '...'));
      it.appendChild(w);
      it.addEventListener('click', () => { rec.state.sdm = c.id; UI.dirty(); });
      list.appendChild(it);
    });
    wrap.appendChild(list);

    const conv = prof.dms.find(c => c.id === rec.state.sdm) || prof.dms[0];
    const thread = el('div', 'sn-dm-thread');
    thread.dataset.scroll = 'sndm';
    thread.appendChild(el('div', 'sn-dm-head', 'conversa com ' + conv.name + ' (@' + conv.handle + ')'));
    conv.msgs.forEach(msg => {
      const b = el('div', 'sn-bub' + (msg.me ? ' me' : ''));
      b.appendChild(el('div', null, msg.txt));
      b.appendChild(el('div', 'sn-bub-t', U.fmtDate(msg.t)));
      thread.appendChild(b);
    });
    wrap.appendChild(thread);
    main.appendChild(wrap);
  }

  /* ---------- acoes administrativas ---------- */
  function renderAdmin(main, s, rec, meta, prof, readOk, writeOk) {
    const box = el('div', 'sn-adm');
    box.appendChild(el('div', 'sn-adm-h', 'ACOES SOBRE @' + prof.handle));

    if (!writeOk) {
      box.appendChild(el('div', 'sn-warn',
        'Proxy ativo (nivel ' + s.sec.proxy + '): publicar, apagar e suspender estao bloqueados.'));
    }

    /* publicar em nome da vitima */
    box.appendChild(el('div', 'sn-adm-lab', 'PUBLICAR COMO ESTA CONTA'));
    const ta = U.el('textarea', 'sn-ta');
    ta.dataset.k = 'sn_post_' + prof.id;
    ta.rows = 3;
    ta.spellcheck = false;
    ta.placeholder = 'texto da publicacao...';
    /* se houver contrato pedindo um texto exato, ja vem preenchido */
    const job = G.missions.active.find(mm =>
      mm.type === 'social_post' && mm.targetIp === s.ip && mm.profId === prof.id);
    if (job) ta.value = job.postText;
    box.appendChild(ta);
    const bar = el('div', 'sn-adm-row');
    const pub = el('button', 'sn-btn', 'PUBLICAR');
    if (!writeOk) pub.disabled = true;
    pub.addEventListener('click', () => {
      const txt = ta.value.trim();
      if (!txt) return UI.toast('Escreva algo antes de publicar.', 'bad');
      Net.illegal(s, 3);
      prof.posts.unshift({
        id: 'po' + U.uid(), t: G.time, txt: txt,
        likes: 0, shares: 0, comments: 0,
        img: meta.kind === 'photo' ? { h: 210, s: 42, k: 1 } : null,
        planted: true
      });
      Snd.modify();
      logHit(s, 'Nova publicacao na conta @' + prof.handle);
      UI.toast('Publicado como @' + prof.handle, 'warn');
      rec.state.stab = 'posts';
      UI.dirty();
    });
    bar.appendChild(pub);
    if (job) bar.appendChild(el('span', 'sn-hint', 'texto exigido pelo contrato ja carregado'));
    box.appendChild(bar);

    /* apagar tudo / suspender */
    box.appendChild(el('div', 'sn-adm-lab', 'MODERACAO'));
    const bar2 = el('div', 'sn-adm-row');
    const wipe = el('button', 'sn-btn danger', 'APAGAR TODAS AS PUBLICACOES');
    if (!writeOk || !prof.posts.length) wipe.disabled = true;
    wipe.addEventListener('click', () => {
      const n = prof.posts.length;
      Net.illegal(s, 3);
      prof.posts = [];
      prof.wiped = true;
      Snd.wipe();
      logHit(s, 'Purga de conteudo na conta @' + prof.handle + ' (' + n + ' itens)');
      UI.toast(n + ' publicacoes apagadas.', 'warn');
      UI.dirty();
    });
    bar2.appendChild(wipe);

    const lock = el('button', 'sn-btn danger', prof.locked ? 'REATIVAR CONTA' : 'SUSPENDER CONTA');
    if (!writeOk) lock.disabled = true;
    lock.addEventListener('click', () => {
      Net.illegal(s, 2);
      prof.locked = !prof.locked;
      Snd.modify();
      logHit(s, (prof.locked ? 'Conta suspensa: @' : 'Conta reativada: @') + prof.handle);
      UI.dirty();
    });
    bar2.appendChild(lock);
    box.appendChild(bar2);

    /* dump das mensagens */
    box.appendChild(el('div', 'sn-adm-lab', 'EXTRACAO DE DADOS'));
    const bar3 = el('div', 'sn-adm-row');
    const name = Social.dumpName(prof);
    const exists = s.files.some(f => f.name === name);
    const dump = el('button', 'sn-btn', 'GERAR DUMP DAS MENSAGENS');
    if (!readOk || exists) dump.disabled = true;
    dump.addEventListener('click', () => {
      Net.illegal(s, 3);
      const body = Social.dumpBody(s, prof);
      const f = W.makeFile(Math.random, {
        name: name,
        size: Math.max(1, Math.ceil(body.length / 900)),
        enc: 0, kind: 'text', body: body
      });
      f.id = 'f' + U.uid();
      s.files.push(f);
      prof.dumped = true;
      Snd.copy();
      logHit(s, 'Exportacao de mensagens da conta @' + prof.handle);
      UI.toast('Dump gerado: ' + name + '. Copie pelo FILE SERVER.', 'ok');
      UI.dirty();
    });
    bar3.appendChild(dump);
    bar3.appendChild(el('span', 'sn-hint', exists
      ? 'ja existe "' + name + '" no file server desta plataforma'
      : 'gera um arquivo no file server; depois copie e envie por e-mail'));
    box.appendChild(bar3);

    main.appendChild(box);
  }

  function logHit(s, txt) {
    const l = W.makeLog(Math.random, G.time, txt, 'alert');
    l.id = 'l' + U.uid();
    s.logs.unshift(l);
  }

  global.Social = Social;
})(window);
