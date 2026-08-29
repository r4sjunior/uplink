/* =========================================================
   main.js - inicializacao e fiacao geral
   ========================================================= */
(function () {
  'use strict';

  const APPS = {
    email: () => Apps.email(),
    uis: () => Apps.uis(),
    missions: () => Apps.missions(),
    links: () => Apps.links(),
    map: () => Apps.map(),
    gateway: () => Apps.gateway(),
    finance: () => Apps.finance(),
    help: () => Apps.help()
  };

  function startDesktop() {
    UI.showScreen('desktop');
    /* o modem disca uma vez, quando o agente entra no sistema */
    Snd.dialup();
    UI.onEmail();
    UI.badge('uis', G.missions.available.length);
    UI.dirty();
    if (!G.flags.seenHelp) {
      G.flags.seenHelp = true;
      Apps.help();
      Apps.email();
    }
    requestAnimationFrame(G.loop);
  }

  function wire() {
    /* ---- audio ----
       navegadores so permitem tocar som apos um gesto do usuario;
       o primeiro clique ou tecla libera o AudioContext */
    const unlock = () => { Snd.unlock(); };
    document.addEventListener('mousedown', unlock);
    document.addEventListener('keydown', unlock);

    const sndBtn = U.$('#btn-sound');
    function paintSound() {
      const off = Snd.isMuted();
      sndBtn.textContent = off ? 'MUDO' : 'SOM';
      sndBtn.style.color = off ? 'var(--text-dim)' : 'var(--green)';
      sndBtn.style.borderColor = off ? 'var(--edge)' : 'var(--green-dim)';
    }
    sndBtn.addEventListener('click', () => { Snd.toggleMute(); paintSound(); });
    paintSound();

    /* clique discreto em qualquer controle da interface */
    document.addEventListener('mousedown', e => {
      if (e.target.closest('.btn,.dockbtn,.tab,.sw-item,.srv-nav button,.spd,.list-item,tr.clickable,.map-node')) {
        Snd.click();
      }
    });

    /* ---- login ---- */
    const handleF = U.$('#login-handle');
    const msg = U.$('#login-msg');

    U.$('#btn-newuser').addEventListener('click', () => {
      const h = handleF.value.trim();
      if (!h) { msg.textContent = 'Escolha um handle. Ele sera sua unica identidade.'; return; }
      if (!/^[A-Za-z0-9_\-]{2,16}$/.test(h)) {
        msg.textContent = 'Handle invalido: use 2 a 16 letras, numeros, _ ou -.';
        return;
      }
      if (G.hasSave()) {
        if (!confirm('Existe um jogo salvo. Criar um novo agente vai apaga-lo. Continuar?')) return;
        G.wipe();
      }
      msg.textContent = 'Gerando mundo... aguarde.';
      setTimeout(() => {
        G.newGame(h);
        startDesktop();
      }, 60);
    });

    U.$('#btn-loadgame').addEventListener('click', () => {
      if (!G.hasSave()) { msg.textContent = 'Nenhum jogo salvo neste navegador.'; return; }
      if (G.load()) {
        UI.toast('Sessao restaurada.', 'ok');
        startDesktop();
      } else {
        msg.textContent = 'Save corrompido. Crie um novo agente.';
      }
    });

    handleF.addEventListener('keydown', e => {
      if (e.key === 'Enter') U.$('#btn-newuser').click();
    });

    if (G.hasSave()) {
      msg.textContent = 'Sessao anterior detectada. Use CARREGAR para retomar.';
    }

    /* ---- dock ---- */
    U.$$('.dockbtn').forEach(b => {
      b.addEventListener('click', () => {
        const app = b.dataset.app;
        if (UI.isOpen(app)) { UI.close(app); b.classList.remove('on'); }
        else { APPS[app](); b.classList.add('on'); }
      });
    });

    /* ---- velocidade ---- */
    U.$$('.spd').forEach(b => {
      b.addEventListener('click', () => {
        U.$$('.spd').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        G.speed = Number(b.dataset.spd);
      });
    });

    /* ---- salvar ---- */
    U.$('#btn-save').addEventListener('click', () => {
      const ok = G.save();
      UI.toast(ok ? 'Jogo salvo.' : 'Falha ao salvar.', ok ? 'ok' : 'bad');
    });

    /* ---- restart ---- */
    U.$('#btn-restart').addEventListener('click', () => { location.reload(); });

    /* ---- atalhos ---- */
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (e.key === 'Escape' && G.conn && G.conn.live) {
        Net.disconnect();
      } else if (e.key === ' ') {
        e.preventDefault();
        const cur = G.speed;
        G.speed = cur > 0 ? 0 : 1;
        U.$$('.spd').forEach(x => x.classList.toggle('active', Number(x.dataset.spd) === G.speed));
      }
    });

    /* ---- autosave ---- */
    setInterval(() => { if (!G.over && G.world) G.save(); }, 45000);
    window.addEventListener('beforeunload', () => { if (!G.over && G.world) G.save(); });
  }

  window.addEventListener('load', () => {
    wire();
    UI.boot(() => UI.showScreen('login'));
  });
})();
