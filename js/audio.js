/* =========================================================
   audio.js - trilha sonora do jogo (Web Audio API)

   Efeitos sao sintetizados em tempo real (osciladores, ruido
   filtrado e envelopes). A discagem e a unica excecao: usa a
   gravacao dial-up-sound_1.mp3 na raiz do projeto.
   Degrada em silencio quando nao ha AudioContext.
   ========================================================= */
(function (global) {
  'use strict';

  const Snd = {};
  const KEY = 'uplink_clone_mute';

  let ctx = null, master = null, noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { }

  /* ---------------------------------------------------------
     nucleo
     --------------------------------------------------------- */
  function ac() {
    if (ctx) return ctx;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.45;
      master.connect(ctx.destination);
      noiseBuf = makeNoiseBuffer();
    } catch (e) { ctx = null; }
    return ctx;
  }

  function makeNoiseBuffer() {
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* precisa de um gesto do usuario para sair do estado suspended */
  Snd.unlock = function () {
    const c = ac();
    if (!c) return;
    loadDialup();
    if (c.state === 'suspended') {
      const p = c.resume();
      if (p && p.then) p.then(flushPending, function () { }); else flushPending();
    } else {
      flushPending();
    }
  };

  /* cria o contexto e comeca a baixar a gravacao antes de qualquer
     gesto; o contexto nasce suspenso e so soa depois do unlock */
  Snd.preload = function () { if (ac()) loadDialup(); };

  Snd.isMuted = function () { return muted; };
  Snd.setMuted = function (v) {
    muted = !!v;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { }
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.45, ctx.currentTime, 0.02);
    if (muted) Snd.stopAll();
  };
  Snd.toggleMute = function () { Snd.setMuted(!muted); return muted; };

  /* ---------------------------------------------------------
     blocos basicos
     --------------------------------------------------------- */
  /* o = {f, f2, dur, type, gain, at, attack, release, sweep, detune} */
  function tone(o) {
    const c = ac(); if (!c || muted) return null;
    const at = c.currentTime + (o.at || 0);
    const dur = o.dur || 0.1;
    const g = c.createGain();
    const peak = o.gain === undefined ? 0.2 : o.gain;
    const atk = o.attack === undefined ? 0.005 : o.attack;
    const rel = o.release === undefined ? 0.03 : o.release;

    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + atk);
    g.gain.setValueAtTime(Math.max(peak, 0.0002), at + Math.max(atk, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    g.connect(o.bus || master);

    const freqs = o.f2 ? [o.f, o.f2] : [o.f];
    freqs.forEach(f => {
      const osc = c.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(f, at);
      if (o.sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(o.sweep, 1), at + dur);
      if (o.detune) osc.detune.setValueAtTime(o.detune, at);
      osc.connect(g);
      osc.start(at);
      osc.stop(at + dur + 0.02);
      track(osc);
    });
    return g;
  }

  /* ruido filtrado; bp = {f0, f1} varre a banda passante */
  function noise(o) {
    const c = ac(); if (!c || muted) return null;
    const at = c.currentTime + (o.at || 0);
    const dur = o.dur || 0.1;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;

    const g = c.createGain();
    const peak = o.gain === undefined ? 0.12 : o.gain;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    let node = src;
    if (o.bp) {
      const f = c.createBiquadFilter();
      f.type = o.bpType || 'bandpass';
      f.Q.value = o.q === undefined ? 6 : o.q;
      f.frequency.setValueAtTime(o.bp[0], at);
      f.frequency.exponentialRampToValueAtTime(Math.max(o.bp[1], 20), at + dur);
      node.connect(f); node = f;
    }
    node.connect(g);
    g.connect(o.bus || master);
    src.start(at);
    src.stop(at + dur + 0.02);
    track(src);
    return g;
  }

  /* Mantem referencia dos nos ainda soando para poder abortar tudo.
     A remocao e feita por onended, nunca por corte cego da lista:
     descartar referencias de nos vivos deixaria som orfao tocando
     depois de Snd.stopAll() / mudo. */
  const active = new Set();
  let created = 0;

  function track(node) {
    active.add(node);
    created++;
    node.onended = function () { active.delete(node); };
  }

  Snd.stopAll = function () {
    if (!ctx) return;
    active.forEach(n => { try { n.stop(); } catch (e) { } });
    active.clear();
    try { if (dialBus) dialBus.disconnect(); } catch (e) { }
    dialBus = null;
    dialSrc = null;
    dialPending = null;
    if (dialElTimer) { clearTimeout(dialElTimer); dialElTimer = null; }
    stopDialEl(0);
    dialupUntil = 0;
  };

  /* ---------------------------------------------------------
     DISCAGEM DIALUP
     --------------------------------------------------------- */
  let dialupUntil = 0;

  let dialBus = null;

  /* ---------------------------------------------------------
     GRAVACAO REAL DA DISCAGEM
     Tres caminhos, em ordem de preferencia:
       1. buffer decodificado  - integra ao grafo (mudo, fade, master)
       2. elemento <audio>     - unico que funciona em file://,
                                 onde fetch() e bloqueado por CORS
     --------------------------------------------------------- */
  const DIALUP_FILE = 'dial-up-sound_1.mp3';
  const DIALUP_FALLBACK_DUR = 27.1;
  /* a gravacao tem silencio no comeco; aparar faz o modem soar
     assim que o agente entra no sistema */
  const DIALUP_TRIM = 1.7;
  /* Trechos medidos por analise espectral (Goertzel) na gravacao:
       1.70-2.15s  tom de linha    350 + 440 Hz
       2.15-4.10s  digitos DTMF    pares 697-941 x 1209-1477
       4.10-6.55s  toque           440 + 480 Hz
       6.60s+      handshake       portadora 1200 / 2100 Hz
     A discagem para um alvo usa tom de linha + digitos: 2.45s a partir
     do onset. Como e relativo ao onset detectado, continua correto se
     o arquivo for recodificado com outro silencio de cabeca. */
  const DIAL_SEGMENT = 2.45;
  const DIAL_GAIN = 0.5;
  let dialOffset = 0;
  let dialElTimer = null;
  let dialBuf = null, dialBufState = 'idle';
  let dialEl = null, dialElState = 'idle';
  let dialSrc = null, dialFade = null;
  let dialSource = 'nenhum';
  let dialPlays = 0;         /* quantas vezes a gravacao comecou a tocar */
  let dialPending = null;    /* 'full' | 'short' quando pediram antes do arquivo ficar pronto */

  function loadDialup() {
    if (dialBufState !== 'idle') return;
    const c = ac(); if (!c) return;
    if (typeof fetch !== 'function') { dialBufState = 'fail'; prepareDialEl(); return; }
    dialBufState = 'loading';
    fetch(DIALUP_FILE)
      .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); })
      .then(b => c.decodeAudioData(b))
      .then(buf => {
        dialBuf = buf; dialOffset = detectOnset(buf); dialBufState = 'ok';
        flushPending();
      })
      .catch(() => { dialBufState = 'fail'; prepareDialEl(); });
  }

  /* primeiro instante com energia real, para pular o silencio inicial */
  function detectOnset(buf) {
    try {
      const d = buf.getChannelData(0);
      const sr = buf.sampleRate;
      const win = Math.floor(sr * 0.02);
      const limit = Math.min(d.length - win, Math.floor(sr * 4));
      for (let i = 0; i + win < limit; i += win) {
        let e = 0;
        for (let j = i; j < i + win; j++) e += d[j] * d[j];
        if (Math.sqrt(e / win) > 0.01) return i / sr;
      }
    } catch (e) { }
    return 0;
  }

  function prepareDialEl() {
    if (dialEl || dialElState === 'fail') return;
    if (typeof Audio !== 'function') { dialElState = 'fail'; return; }
    try {
      dialElState = 'loading';
      dialEl = new Audio(DIALUP_FILE);
      dialEl.preload = 'auto';
      dialEl.volume = 0;
      dialEl.addEventListener('error', () => { dialElState = 'fail'; dialEl = null; });
      dialEl.addEventListener('canplaythrough', () => {
        dialElState = 'ok';
        flushPending();
      });
      dialEl.load();
    } catch (e) { dialElState = 'fail'; dialEl = null; }
  }

  function elVolume() { return muted ? 0 : 0.25; }

  function stopDialEl(fade) {
    if (dialFade) { clearInterval(dialFade); dialFade = null; }
    if (!dialEl || dialEl.paused) return;
    if (!fade) {
      try { dialEl.pause(); dialEl.currentTime = DIALUP_TRIM; } catch (e) { }
      return;
    }
    const stepMs = 50;
    const dec = dialEl.volume * (stepMs / 1000) / fade;
    dialFade = setInterval(() => {
      if (!dialEl) { clearInterval(dialFade); dialFade = null; return; }
      dialEl.volume = Math.max(0, dialEl.volume - dec);
      if (dialEl.volume <= 0.002) {
        clearInterval(dialFade); dialFade = null;
        try { dialEl.pause(); dialEl.currentTime = DIALUP_TRIM; } catch (e) { }
      }
    }, stepMs);
  }

  /* --- 1. gravacao decodificada, dentro do grafo de audio --- */
  function playBuffer(mode) {
    const c = ac(); if (!c || muted || !dialBuf) return 0;
    const bus = c.createGain();
    bus.gain.value = DIAL_GAIN;
    bus.connect(master);
    dialBus = bus;

    const src = c.createBufferSource();
    src.buffer = dialBuf;
    src.connect(bus);

    const full = dialBuf.duration - dialOffset;
    const d = mode === 'short' ? Math.min(DIAL_SEGMENT, full) : full;

    if (mode === 'short') {
      src.start(0, dialOffset, d);
      /* corta o trecho com um fade curto para nao estalar */
      const end = c.currentTime + d;
      bus.gain.setValueAtTime(DIAL_GAIN, Math.max(c.currentTime, end - 0.18));
      bus.gain.linearRampToValueAtTime(0.0001, end);
    } else {
      src.start(0, dialOffset);   /* pula o silencio inicial da gravacao */
    }

    track(src);
    dialSrc = src;
    dialSource = 'buffer';
    dialPlays++;
    dialupUntil = c.currentTime + d;
    return d;
  }

  /* --- 2. elemento <audio>: unico caminho que funciona em file:// --- */
  function playElement(mode) {
    const c = ac(); if (!c || muted || !dialEl) return 0;
    try {
      if (dialFade) { clearInterval(dialFade); dialFade = null; }
      if (dialElTimer) { clearTimeout(dialElTimer); dialElTimer = null; }
      try { dialEl.currentTime = DIALUP_TRIM; } catch (e) { }
      dialEl.volume = elVolume();
      const pr = dialEl.play();
      if (pr && pr.catch) pr.catch(() => { dialSource = 'falhou'; });
      dialSource = 'elemento';
      dialPlays++;
      const full = (dialEl.duration || DIALUP_FALLBACK_DUR) - DIALUP_TRIM;
      const d = mode === 'short' ? Math.min(DIAL_SEGMENT, full) : full;
      if (mode === 'short') {
        dialElTimer = setTimeout(() => { dialElTimer = null; stopDialEl(0.18); },
          Math.max(0, d * 1000 - 180));
      }
      dialupUntil = c.currentTime + d;
      return d;
    } catch (e) { return 0; }
  }

  /* escolhe o caminho disponivel; se o arquivo ainda estiver
     carregando, a reproducao fica pendente e comeca sozinha */
  function playDial(mode) {
    const c = ac(); if (!c || muted) return 0;
    Snd.stopAll();
    loadDialup();
    if (dialBuf) return playBuffer(mode);
    if (dialEl && dialElState === 'ok') return playElement(mode);
    dialPending = mode;
    dialSource = 'aguardando';
    return mode === 'short' ? DIAL_SEGMENT : DIALUP_FALLBACK_DUR - DIALUP_TRIM;
  }

  function flushPending() {
    if (!dialPending) return;
    const m = dialPending;
    dialPending = null;
    playDial(m);
  }

  /* gravacao inteira: toca na TELA DE LOGIN */
  Snd.dialup = function () { return playDial('full'); };

  /* so os digitos: toca a cada discagem para um alvo */
  Snd.dial = function () { return playDial('short'); };


  /* silencia so a discagem, sem cortar alarme/bipes de trace */
  Snd.dialupStop = function (fade) {
    fade = fade === undefined ? 0.45 : fade;
    if (ctx && dialBus) {
      const b = dialBus;
      dialBus = null;
      try {
        b.gain.cancelScheduledValues(ctx.currentTime);
        b.gain.setValueAtTime(b.gain.value, ctx.currentTime);
        b.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
      } catch (e) { }
    }
    if (dialSrc) {
      try { dialSrc.stop(ctx.currentTime + fade + 0.02); } catch (e) { }
      dialSrc = null;
    }
    stopDialEl(fade);
    dialPending = null;
    if (dialElTimer) { clearTimeout(dialElTimer); dialElTimer = null; }
    dialupUntil = 0;
  };

  Snd.isDialing = function () {
    if (dialPending) return true;   /* pedida, esperando arquivo ou gesto */
    return !!(ctx && dialupUntil > ctx.currentTime);
  };

  /* desligar */
  Snd.hangup = function () {
    tone({ f: 620, dur: 0.10, gain: 0.11, type: 'sine' });
    tone({ f: 420, dur: 0.16, at: 0.09, gain: 0.11, type: 'sine', sweep: 180 });
    noise({ at: 0, dur: 0.05, gain: 0.05, bp: [2200, 700], q: 1.5 });
  };

  /* ---------------------------------------------------------
     TRACE: bipe que acelera conforme o tempo acaba
     pct = 0..100 do progresso do trace inimigo
     --------------------------------------------------------- */
  let trAcc = 0, trOn = false;

  Snd.traceTick = function (dt, pct) {
    const c = ac(); if (!c || muted) return;
    pct = Math.max(0, Math.min(100, pct));

    if (!trOn) {                       /* deixa o alarme terminar antes do 1o bipe */
      trOn = true; trAcc = 0;
    }

    /* intervalo cai de 1.15s para 0.10s de forma acelerada no fim */
    const k = Math.pow(pct / 100, 1.55);
    const interval = 1.15 - k * 1.05;

    trAcc += dt;
    if (trAcc < interval) return;
    trAcc = 0;

    const freq = 640 + k * 900;
    const critical = pct > 82;

    tone({
      f: freq, dur: critical ? 0.055 : 0.075, gain: 0.11 + k * 0.10,
      type: critical ? 'square' : 'triangle', attack: 0.002, release: 0.02
    });
    if (critical) {
      /* na reta final vira um bipe duplo, mais agressivo */
      tone({
        f: freq * 1.5, dur: 0.05, at: 0.075, gain: 0.10,
        type: 'square', attack: 0.002, release: 0.015
      });
    }
  };

  Snd.traceStop = function () { trOn = false; trAcc = 0; };

  /* alarme no instante em que o monitor detecta a intrusao */
  Snd.alarm = function () {
    for (let i = 0; i < 3; i++) {
      tone({ f: 1400, dur: 0.09, at: i * 0.14, gain: 0.16, type: 'square' });
      tone({ f: 930, dur: 0.09, at: i * 0.14 + 0.06, gain: 0.14, type: 'square' });
    }
  };

  /* ---------------------------------------------------------
     FERRAMENTAS
     --------------------------------------------------------- */
  /* senha quebrada: varredura ascendente + acorde de confirmacao */
  Snd.crack = function () {
    tone({ f: 300, dur: 0.28, gain: 0.09, type: 'sawtooth', sweep: 1500 });
    tone({ f: 784, dur: 0.10, at: 0.26, gain: 0.13, type: 'square' });
    tone({ f: 1175, dur: 0.16, at: 0.35, gain: 0.13, type: 'square' });
  };

  /* bypass silencioso: dois blips suaves descendentes */
  Snd.bypass = function () {
    tone({ f: 1560, dur: 0.07, gain: 0.10, type: 'sine' });
    tone({ f: 1040, dur: 0.11, at: 0.07, gain: 0.10, type: 'sine' });
  };

  /* disable barulhento: estalo eletrico + queda de tom */
  Snd.disable = function () {
    noise({ at: 0, dur: 0.09, gain: 0.13, bp: [4000, 500], q: 1.2 });
    tone({ f: 900, dur: 0.22, gain: 0.12, type: 'sawtooth', sweep: 130 });
    tone({ f: 452, dur: 0.22, at: 0.02, gain: 0.07, type: 'square', sweep: 96 });
  };

  /* inicio de transferencia de arquivo */
  Snd.copyStart = function () {
    tone({ f: 660, dur: 0.05, gain: 0.08, type: 'triangle' });
  };

  /* copia concluida: dois pulsos de dados + confirmacao */
  Snd.copy = function () {
    for (let i = 0; i < 4; i++) {
      tone({ f: 1150 + i * 210, dur: 0.032, at: i * 0.038, gain: 0.09, type: 'square', attack: 0.002, release: 0.008 });
    }
    tone({ f: 1568, dur: 0.13, at: 0.17, gain: 0.12, type: 'sine' });
  };

  /* exclusao: triturada descendente com ruido */
  Snd.del = function () {
    noise({ at: 0, dur: 0.20, gain: 0.11, bp: [2600, 180], q: 2.2 });
    tone({ f: 420, dur: 0.24, gain: 0.13, type: 'sawtooth', sweep: 62 });
    tone({ f: 210, dur: 0.26, at: 0.03, gain: 0.09, type: 'square', sweep: 44 });
  };

  /* exclusao em massa: a mesma coisa, mais longa e mais grave */
  Snd.wipe = function () {
    noise({ at: 0, dur: 0.75, gain: 0.14, bp: [3200, 90], q: 1.6 });
    tone({ f: 520, dur: 0.85, gain: 0.13, type: 'sawtooth', sweep: 40 });
    tone({ f: 260, dur: 0.85, at: 0.05, gain: 0.10, type: 'square', sweep: 30 });
    for (let i = 0; i < 5; i++) {
      tone({ f: 300 - i * 40, dur: 0.06, at: 0.15 + i * 0.12, gain: 0.10, type: 'square' });
    }
  };

  /* log reescrito: rabisco curto, mais discreto que apagar */
  Snd.modify = function () {
    for (let i = 0; i < 3; i++) {
      tone({ f: 700 + Math.random() * 500, dur: 0.035, at: i * 0.045, gain: 0.08, type: 'triangle' });
    }
  };

  /* descriptografia concluida */
  Snd.decrypt = function () {
    for (let i = 0; i < 6; i++) {
      tone({ f: 500 + i * 190, dur: 0.045, at: i * 0.05, gain: 0.09, type: 'triangle' });
    }
    tone({ f: 1760, dur: 0.18, at: 0.32, gain: 0.11, type: 'sine' });
  };

  /* ---------------------------------------------------------
     INTERFACE E EVENTOS
     --------------------------------------------------------- */
  Snd.click = function () {
    tone({ f: 1500, dur: 0.018, gain: 0.045, type: 'square', attack: 0.001, release: 0.006 });
  };

  Snd.error = function () {
    tone({ f: 220, dur: 0.13, gain: 0.13, type: 'square' });
    tone({ f: 165, dur: 0.17, at: 0.10, gain: 0.13, type: 'square' });
  };

  Snd.send = function () {
    tone({ f: 700, dur: 0.05, gain: 0.09, type: 'triangle' });
    tone({ f: 1050, dur: 0.05, at: 0.05, gain: 0.09, type: 'triangle' });
    tone({ f: 1400, dur: 0.12, at: 0.10, gain: 0.10, type: 'triangle' });
  };

  Snd.mail = function () {
    tone({ f: 1046, dur: 0.07, gain: 0.10, type: 'sine' });
    tone({ f: 1568, dur: 0.11, at: 0.08, gain: 0.10, type: 'sine' });
  };

  Snd.success = function () {
    [523, 659, 784, 1046].forEach((f, i) => {
      tone({ f: f, dur: 0.13, at: i * 0.085, gain: 0.12, type: 'triangle' });
    });
  };

  Snd.fail = function () {
    [523, 440, 349, 262].forEach((f, i) => {
      tone({ f: f, dur: 0.16, at: i * 0.11, gain: 0.12, type: 'triangle' });
    });
  };

  Snd.money = function () {
    tone({ f: 1318, dur: 0.06, gain: 0.11, type: 'square' });
    tone({ f: 1760, dur: 0.06, at: 0.06, gain: 0.11, type: 'square' });
    tone({ f: 2093, dur: 0.16, at: 0.12, gain: 0.10, type: 'square' });
  };

  /* fim de jogo: queda longa e feia */
  Snd.busted = function () {
    Snd.stopAll();
    const c = ac(); if (!c || muted) return;
    noise({ at: 0, dur: 1.6, gain: 0.12, bp: [3000, 60], q: 1.4 });
    tone({ f: 880, dur: 1.8, gain: 0.15, type: 'sawtooth', sweep: 30 });
    tone({ f: 440, dur: 1.8, at: 0.1, gain: 0.11, type: 'square', sweep: 26 });
    for (let i = 0; i < 4; i++) {
      tone({ f: 300, dur: 0.14, at: 1.9 + i * 0.34, gain: 0.14, type: 'square' });
    }
  };

  /* bipe do terminal durante o boot */
  Snd.beep = function () {
    tone({ f: 1200, dur: 0.03, gain: 0.05, type: 'square', attack: 0.001, release: 0.01 });
  };

  /* introspecao para testes: expoe o grafo interno */
  Snd._debug = function () {
    return {
      ctx: ctx, master: master, active: active.size, created: created,
      dialSource: dialSource, dialBuf: dialBufState, dialEl: dialElState,
      dialOffset: dialOffset, dialPlays: dialPlays, dialPending: dialPending
    };
  };

  global.Snd = Snd;
})(window);
