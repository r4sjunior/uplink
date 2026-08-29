/* =========================================================
   ui.js - boot, login, gerenciador de janelas, toasts, topbar
   ========================================================= */
(function (global) {
  'use strict';

  const UI = {};
  const wins = {};          /* id -> {el, body, render, title} */
  let zTop = 10;
  let _dirty = true;
  let lastRender = 0;
  let focusedId = null;

  UI.dirty = function () { _dirty = true; };

  /* =========================================================
     VIEWPORT
     Esta condicao e a MESMA do bloco de tela cheia em main.css: onde
     o CSS estica a janela para a tela inteira, arrastar e redimensionar
     deixam de fazer sentido. Se um dos dois mudar, o outro tem que
     acompanhar.
     ========================================================= */
  const mqMobile = window.matchMedia(
    '(max-width:820px), (max-height:560px) and (max-width:1000px)');
  UI.isMobile = function () { return mqMobile.matches; };

  /* area util onde as janelas vivem (#windows ocupa todo o #desktop) */
  function deskSize() {
    const d = U.$('#desktop');
    if (d && d.clientWidth) return { w: d.clientWidth, h: d.clientHeight };
    return { w: window.innerWidth, h: Math.max(200, window.innerHeight - 90) };
  }

  /* =========================================================
     TELAS
     ========================================================= */
  UI.showScreen = function (id) {
    U.$$('.screen').forEach(s => s.classList.remove('active'));
    U.$('#screen-' + id).classList.add('active');
  };

  /* =========================================================
     BOOT
     ========================================================= */
  const BOOT_LINES = [
    'UPLINK OS v1.44 - (c) Uplink Corporation',
    '',
    'Verificando integridade do gateway ......... OK',
    'CPU 60GHz .................................. OK',
    'Memoria 8Gq ................................ OK',
    'Modem 1Gq/s ................................ OK',
    'Carregando pilha TCP/IP .................... OK',
    'Montando /dev/uplink0 ...................... OK',
    'Verificando assinaturas de software ........ OK',
    'Estabelecendo tunel seguro ................. OK',
    'Limpando cache de conexoes anteriores ...... OK',
    '',
    'AVISO: toda a atividade neste terminal e monitorada',
    '       pela Uplink Corporation para fins contratuais.',
    '',
    'Pressione qualquer tecla para continuar_'
  ];

  UI.boot = function (done) {
    const out = U.$('#boot-text');
    out.textContent = '';
    let li = 0, ci = 0, fired = false, timer = null;

    /* uma tecla ou clique pula o boot a qualquer momento; o guarda
       impede que o timeout final reabra o login depois */
    const finish = () => {
      if (fired) return;
      fired = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('keydown', finish);
      document.removeEventListener('click', finish);
      out.textContent = BOOT_LINES.join('\n');
      done();
    };
    document.addEventListener('keydown', finish);
    document.addEventListener('click', finish);

    function step() {
      if (li >= BOOT_LINES.length) { timer = setTimeout(finish, 4000); return; }
      const line = BOOT_LINES[li];
      if (ci <= line.length) {
        out.textContent = BOOT_LINES.slice(0, li).join('\n') + (li ? '\n' : '') + line.slice(0, ci);
        ci++;
        timer = setTimeout(step, line.length > 40 ? 4 : 12);
      } else {
        out.textContent += '\n';
        li++; ci = 0;
        timer = setTimeout(step, 45);
      }
    }
    step();
  };

  /* =========================================================
     TOASTS
     ========================================================= */
  UI.toast = function (msg, kind) {
    if (kind === 'bad') Snd.error();
    const box = U.$('#toasts');
    const t = U.el('div', 'toast ' + (kind || ''), msg);
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; }, 3400);
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 3900);
    while (box.children.length > 4) box.removeChild(box.firstChild);
  };

  UI.badge = function (app, n) {
    const b = U.$('#badge-' + app);
    if (!b) return;
    if (n > 0) { b.textContent = n > 99 ? '99+' : n; b.classList.add('show'); }
    else b.classList.remove('show');
  };

  UI.onEmail = function () {
    UI.badge('email', G.email.filter(e => !e.read).length);
    UI.dirty();
  };

  /* =========================================================
     JANELAS
     ========================================================= */
  UI.open = function (id, opts) {
    if (wins[id]) { UI.focus(id); UI.dirty(); return wins[id]; }
    opts = opts || {};
    const host = U.$('#windows');
    const el = U.el('div', 'win' + (opts.cls ? ' ' + opts.cls : ''));
    /* nunca nasce maior que a area disponivel; no mobile o CSS ainda
       forca tela cheia, mas os valores ficam prontos caso o aparelho
       gire para paisagem e volte ao modo desktop */
    const D = deskSize();
    const w = Math.min(opts.w || 640, D.w - 16);
    const h = Math.min(opts.h || 440, D.h - 16);
    const n = Object.keys(wins).length;
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.left = U.clamp((D.w - w) / 2 + (n % 5) * 26 - 60, 8, Math.max(8, D.w - w - 8)) + 'px';
    el.style.top = U.clamp(8 + (n % 5) * 24, 8, Math.max(8, D.h - h - 8)) + 'px';

    const bar = U.el('div', 'win-title');
    const tt = U.el('span', null, opts.title || id);
    const btns = U.el('div', 'win-btns');
    const close = U.el('button', null, 'X');
    close.title = 'Fechar';
    btns.appendChild(close);
    bar.appendChild(tt); bar.appendChild(btns);

    const body = U.el('div', 'win-body');
    const grip = U.el('div', 'win-resize');

    el.appendChild(bar); el.appendChild(body); el.appendChild(grip);
    host.appendChild(el);

    const rec = {
      id: id, el: el, body: body, titleEl: tt,
      render: opts.render, onClose: opts.onClose,
      live: !!opts.live,      /* redesenha sozinha (progresso, contagem regressiva) */
      state: {}
    };
    wins[id] = rec;

    close.addEventListener('click', (e) => { e.stopPropagation(); UI.close(id); });
    el.addEventListener('pointerdown', () => UI.focus(id));
    makeDrag(el, bar);
    makeResize(el, grip);
    UI.focus(id);
    U.$$('.dockbtn').forEach(b => { if (b.dataset.app === id) b.classList.add('on'); });
    UI.dirty();
    return rec;
  };

  UI.close = function (id) {
    const rec = wins[id];
    if (!rec) return;
    if (rec.onClose) { try { rec.onClose(); } catch (e) { } }
    rec.el.parentNode.removeChild(rec.el);
    delete wins[id];
    U.$$('.dockbtn').forEach(b => {
      if (b.dataset.app === id) b.classList.remove('on');
    });
    UI.dirty();
  };

  UI.isOpen = function (id) { return !!wins[id]; };
  UI.isFocused = function (id) { return focusedId === id; };
  UI.win = function (id) { return wins[id]; };

  UI.focus = function (id) {
    const rec = wins[id];
    if (!rec) return;
    focusedId = id;
    zTop++;
    rec.el.style.zIndex = zTop;
    Object.values(wins).forEach(w => w.el.classList.toggle('focused', w.id === id));
  };

  UI.setTitle = function (id, txt) {
    if (wins[id]) wins[id].titleEl.textContent = txt;
  };

  /* Pointer Events cobrem mouse, caneta e toque num caminho so.
     setPointerCapture mantem o gesto vivo mesmo se o dedo sair do
     elemento; touch-action:none no CSS impede o navegador de rolar. */
  function dragger(handle, onStart, onMove) {
    let pid = null, sx = 0, sy = 0, ctx = null;
    handle.addEventListener('pointerdown', e => {
      if (e.button) return;
      if (e.target.tagName === 'BUTTON') return;
      if (UI.isMobile()) return;   /* janela ocupa a tela toda: nada a mover */
      ctx = onStart();
      pid = e.pointerId; sx = e.clientX; sy = e.clientY;
      try { handle.setPointerCapture(pid); } catch (err) { }
      e.preventDefault(); e.stopPropagation();
    });
    handle.addEventListener('pointermove', e => {
      if (pid === null || e.pointerId !== pid) return;
      onMove(e.clientX - sx, e.clientY - sy, ctx);
    });
    const end = e => {
      if (pid === null || (e && e.pointerId !== pid)) return;
      try { handle.releasePointerCapture(pid); } catch (err) { }
      pid = null; ctx = null;
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function makeDrag(el, handle) {
    dragger(handle,
      () => ({ x: el.offsetLeft, y: el.offsetTop }),
      (dx, dy, c) => {
        const D = deskSize();
        el.style.left = U.clamp(c.x + dx, -el.offsetWidth + 80, D.w - 80) + 'px';
        el.style.top = U.clamp(c.y + dy, 0, Math.max(0, D.h - 34)) + 'px';
      });
  }

  function makeResize(el, grip) {
    dragger(grip,
      () => ({ w: el.offsetWidth, h: el.offsetHeight }),
      (dx, dy, c) => {
        const D = deskSize();
        el.style.width = U.clamp(c.w + dx, 300, D.w - el.offsetLeft) + 'px';
        el.style.height = U.clamp(c.h + dy, 180, D.h - el.offsetTop) + 'px';
        UI.dirty();
      });
  }

  /* =========================================================
     REAJUSTE AO REDIMENSIONAR / GIRAR O APARELHO
     Janelas abertas antes do giro nao podem ficar fora da area util.
     ========================================================= */
  function fitWindows() {
    if (UI.isMobile()) return;   /* tela cheia via CSS, nada a recalcular */
    const D = deskSize();
    Object.values(wins).forEach(rec => {
      const el = rec.el;
      const w = Math.min(el.offsetWidth, D.w - 16);
      const h = Math.min(el.offsetHeight, D.h - 16);
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      el.style.left = U.clamp(el.offsetLeft, 0, Math.max(0, D.w - w)) + 'px';
      el.style.top = U.clamp(el.offsetTop, 0, Math.max(0, D.h - h)) + 'px';
    });
  }

  let fitTimer = null;
  function scheduleFit() {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => { fitWindows(); UI.dirty(); }, 120);
  }
  window.addEventListener('resize', scheduleFit);
  window.addEventListener('orientationchange', scheduleFit);
  if (mqMobile.addEventListener) mqMobile.addEventListener('change', scheduleFit);

  /* =========================================================
     RENDER
     ========================================================= */
  function captureForm(rec) {
    const st = {};
    U.$$('[data-k]', rec.body).forEach(i => {
      if (i.tagName === 'INPUT' || i.tagName === 'SELECT' || i.tagName === 'TEXTAREA') st[i.dataset.k] = i.value;
    });
    const act = document.activeElement;
    const key = act && rec.body.contains(act) && act.dataset ? act.dataset.k : null;
    const sel = key && act.selectionStart !== undefined ? [act.selectionStart, act.selectionEnd] : null;
    return { vals: st, focus: key, sel: sel };
  }
  function restoreForm(rec, snap) {
    U.$$('[data-k]', rec.body).forEach(i => {
      if (snap.vals[i.dataset.k] !== undefined && (i.tagName === 'INPUT' || i.tagName === 'SELECT' || i.tagName === 'TEXTAREA')) {
        i.value = snap.vals[i.dataset.k];
      }
    });
    if (snap.focus) {
      const t = U.$('[data-k="' + snap.focus + '"]', rec.body);
      if (t) {
        t.focus();
        if (snap.sel && t.setSelectionRange) { try { t.setSelectionRange(snap.sel[0], snap.sel[1]); } catch (e) { } }
      }
    }
  }

  /* preserva a posicao de rolagem de qualquer elemento com data-scroll */
  function captureScroll(rec) {
    const map = { _body: rec.body.scrollTop };
    U.$$('[data-scroll]', rec.body).forEach(e => { map[e.dataset.scroll] = e.scrollTop; });
    return map;
  }
  function restoreScroll(rec, map) {
    rec.body.scrollTop = map._body;
    U.$$('[data-scroll]', rec.body).forEach(e => {
      if (e.dataset.stick === 'bottom' && map['_stick_' + e.dataset.scroll]) {
        e.scrollTop = e.scrollHeight;
      } else if (map[e.dataset.scroll] !== undefined) {
        e.scrollTop = map[e.dataset.scroll];
      } else {
        e.scrollTop = e.scrollHeight;
      }
    });
  }

  /* =========================================================
     PROTECAO DE CLIQUE
     Um "click" so dispara se o mousedown e o mouseup cairem no MESMO
     elemento. Como as janelas se redesenham sozinhas (progresso de
     tarefa, trace, relogio), um redesenho no meio do clique destruia
     o botao e o clique era engolido. Enquanto o botao do mouse estiver
     pressionado, nenhum redesenho acontece; o que ficou pendente e
     aplicado logo depois do mouseup.
     ========================================================= */
  let pointerDown = false;
  let renderPending = false;

  document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
  const releasePointer = function () {
    if (!pointerDown) return;
    pointerDown = false;
    if (renderPending) {
      renderPending = false;
      /* deixa o handler de click rodar antes de reconstruir o DOM */
      setTimeout(() => { _dirty = true; }, 0);
    }
  };
  document.addEventListener('pointerup', releasePointer, true);
  document.addEventListener('pointercancel', releasePointer, true);
  window.addEventListener('blur', releasePointer);

  function renderWindows() {
    Object.values(wins).forEach(rec => {
      if (!rec.render) return;
      const snap = captureForm(rec);
      const scr = captureScroll(rec);
      /* marca elementos que estavam no fim para continuarem colados no fim */
      U.$$('[data-scroll][data-stick="bottom"]', rec.body).forEach(e => {
        scr['_stick_' + e.dataset.scroll] = (e.scrollHeight - e.scrollTop - e.clientHeight) < 24;
      });
      U.clear(rec.body);
      try { rec.render(rec.body, rec); }
      catch (e) { console.error('render ' + rec.id, e); rec.body.textContent = 'Erro de render: ' + e.message; }
      restoreForm(rec, snap);
      restoreScroll(rec, scr);
    });
  }

  function updateTopbar() {
    U.$('#tb-handle').textContent = G.handle || '—';
    U.$('#tb-credits').textContent = U.credits(G.credits);
    U.$('#tb-rating').textContent = G.ratingName();
    U.$('#tb-neuro').textContent = G.neuroName();
    U.$('#tb-clock').textContent = U.fmtDate(G.time);
    const cs = U.$('#conn-status');
    if (G.conn && G.conn.live) {
      const t = G.srv(G.conn.target);
      cs.textContent = 'CONECTADO :: ' + (t ? t.ip : '?');
      cs.className = G.conn.trace ? 'conn-hot' : 'conn-live';
    } else {
      cs.textContent = 'DESCONECTADO';
      cs.className = 'conn-idle';
    }
  }

  function updateTrace() {
    const bar = U.$('#tracebar');
    if (!G.conn || !G.conn.live || !G.conn.trace) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    const tr = G.conn.trace;
    const pct = U.clamp(100 - (tr.left / tr.total) * 100, 0, 100);
    U.$('#tr-fill').style.width = pct + '%';
    const v = G.swVersion('trace_tracker');
    let txt;
    if (v >= 3) txt = U.fmtSecs(tr.left);
    else if (v === 2) txt = Math.round(pct) + '%';
    else if (v === 1) txt = pct > 66 ? 'CRITICO' : (pct > 33 ? 'ATIVO' : 'INICIADO');
    else txt = '???';
    U.$('#tr-time').textContent = txt;
  }

  UI.render = function () {
    const now = performance.now();
    /* a topbar e a barra de trace nao sao redesenhadas: so tem texto
       atualizado, entao podem correr sempre sem risco para os cliques */
    updateTopbar();
    updateTrace();

    /* so as janelas marcadas como "live" precisam de refresh continuo */
    const anyLive = Object.values(wins).some(w => w.live);
    const wantRender = _dirty || (anyLive && G.speed > 0 && now - lastRender > 200);
    if (!wantRender) return;

    if (pointerDown) {          /* nunca redesenhar durante um clique */
      renderPending = true;
      return;
    }
    _dirty = false;
    lastRender = now;
    renderWindows();
  };

  /* =========================================================
     CONEXAO
     ========================================================= */
  UI.openConnection = function () {
    UI.open('conn', {
      title: 'CONEXAO',
      w: 860, h: 560,
      cls: 'conn-win',
      live: true,
      render: ServerUI.render,
      onClose: function () { if (G.conn.live) Net.disconnect(true); }
    });
    UI.dirty();
  };
  UI.closeConnection = function () {
    if (wins['conn']) {
      const rec = wins['conn'];
      rec.onClose = null;
      UI.close('conn');
    }
    UI.dirty();
  };

  /* =========================================================
     GAME OVER
     ========================================================= */
  UI.gameOver = function (title, text) {
    Snd.busted();
    U.$('#over-title').textContent = title;
    U.$('#over-text').textContent = text;
    UI.showScreen('over');
  };

  global.UI = UI;
})(window);
