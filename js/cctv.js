/* =========================================================
   cctv.js - sistemas de videomonitoramento
   geracao das cameras, o renderizador de video (canvas) e a
   tela do servidor durante a invasao
   ========================================================= */
(function (global) {
  'use strict';

  const CCTV = {};
  const FPS = 12;
  const LOOP_LEN = 6;          /* segundos que o loop injetado repete */

  function el(t, c, x) { return U.el(t, c, x); }

  /* =========================================================
     GERACAO
     ========================================================= */
  function applyScene(cam, sc, rng) {
    cam.scene = sc.id;
    cam.night = !!sc.night;
    cam.zone = rng.pick(sc.zones || D.CAM_ZONES);
    cam.keypad = !!sc.keypad;
    cam.code = sc.keypad ? String(rng.int(10000, 999999)) : null;
    return cam;
  }

  CCTV.makeCams = function (rng, n) {
    const scenes = rng.shuffle(D.CAM_SCENES);
    const cams = [];
    for (let i = 0; i < n; i++) {
      cams.push(applyScene({
        id: 'k' + i, num: i + 1, label: 'CAM ' + U.pad(i + 1), seed: rng.int(1, 999999)
      }, scenes[i % scenes.length], rng));
    }
    /* garante ao menos uma camera com teclado (alvo de vigilancia) */
    if (!cams.some(c => c.keypad)) {
      applyScene(cams[cams.length - 1], D.CAM_SCENES.find(x => x.keypad), rng);
    }
    return cams;
  };

  CCTV.makeRecordings = function (rng, cams, now) {
    const files = [];
    const n = rng.int(4, 9);
    for (let i = 0; i < n; i++) {
      const cam = rng.pick(cams);
      const t = now - rng.int(60 * 6, 60 * 24 * 60);
      const d = U.toDate(t);
      const name = 'rec-cam' + U.pad(cam.num) + '-' +
        d.y + U.pad(d.mo) + U.pad(d.d) + '-' + U.pad(d.h) + U.pad(d.mi);
      const f = W.makeFile(rng, {
        name: name, size: rng.int(3, 9), enc: rng.chance(0.25) ? rng.int(1, 3) : 0,
        kind: 'video',
        body: 'ARQUIVO DE VIDEO H.264\n\n' +
          'CAMERA : ' + cam.label + ' - ' + cam.zone + '\n' +
          'INICIO : ' + U.fmtDate(t) + '\n' +
          'DURACAO: ' + rng.int(4, 55) + ' min\n' +
          'CENA   : ' + cam.scene + '\n\n' +
          '<fluxo de video - reproduza em um decodificador externo>'
      });
      f.camId = cam.id;
      files.push(f);
    }
    return files;
  };

  /* =========================================================
     CONSULTAS
     ========================================================= */
  CCTV.servers = function () {
    return Object.values(G.world.servers).filter(s => s.type === 'cctv');
  };
  function loopMap(s) {
    if (!s.st.loops) s.st.loops = {};
    return s.st.loops;
  }
  CCTV.isLooping = function (s, cam) { return !!loopMap(s)[cam.id]; };
  CCTV.allLooping = function (s) {
    return !!(s.cams && s.cams.length) && s.cams.every(c => loopMap(s)[c.id]);
  };

  /* progresso do contrato de loop, contado em tempo real */
  CCTV.tick = function (dt) {
    const live = G.conn && G.conn.live ? G.srv(G.conn.target) : null;
    G.missions.active.forEach(m => {
      if (m.type !== 'cam_loop') return;
      const on = live && live.ip === m.targetIp && live.type === 'cctv' && CCTV.allLooping(live);
      m.loopHeld = on ? (m.loopHeld || 0) + dt : 0;
    });
  };

  /* =========================================================
     RENDERIZADOR DE VIDEO
     Cada camera tem um canvas persistente: a janela de conexao se
     redesenha varias vezes por segundo, entao o mesmo elemento e
     reanexado em vez de recriado - o video nao pisca.
     ========================================================= */
  const cache = {};
  let noiseFrames = null;

  function buildNoise() {
    noiseFrames = [];
    for (let f = 0; f < 6; f++) {
      const c = document.createElement('canvas');
      c.width = 80; c.height = 46;
      const x = c.getContext('2d');
      const img = x.createImageData(c.width, c.height);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 90 + Math.random() * 165;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      noiseFrames.push(c);
    }
  }

  CCTV.view = function (s, cam, w, h, mode) {
    if (!noiseFrames) buildNoise();
    const key = s.ip + ':' + cam.id + ':' + mode;
    let c = cache[key];
    if (!c) {
      const canvas = document.createElement('canvas');
      canvas.className = 'cam-canvas';
      const off = document.createElement('canvas');
      c = cache[key] = {
        canvas: canvas, ctx: canvas.getContext('2d'),
        off: off, offctx: off.getContext('2d'),
        srv: s, cam: cam, layout: null, freeze: null, idle: 0, last: 0
      };
    }
    c.srv = s; c.cam = cam;
    if (c.canvas.width !== w || c.canvas.height !== h) {
      c.canvas.width = w; c.canvas.height = h;
      c.off.width = Math.max(60, Math.round(w / 3));
      c.off.height = Math.max(34, Math.round(h / 3));
      c.layout = null;
    }
    return c.canvas;
  };

  /* laco proprio de animacao, independente do render da UI */
  let last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const t = ts / 1000;
    if (t - last < 1 / FPS) return;
    last = t;
    Object.keys(cache).forEach(k => {
      const c = cache[k];
      if (!c.canvas.isConnected) {
        c.idle++;
        if (c.idle > 120) delete cache[k];
        return;
      }
      c.idle = 0;
      /* o video nunca derruba o jogo; o primeiro erro de cada camera
         aparece no console para nao esconder defeito de cena */
      try { draw(c, t); }
      catch (e) {
        if (!c.errLogged) { c.errLogged = true; console.error('cctv draw', k, e); }
      }
    });
  }
  requestAnimationFrame(frame);

  /* =========================================================
     DESENHO DE UM QUADRO
     ========================================================= */
  function draw(c, t) {
    const s = c.srv, cam = c.cam;
    const W = c.off.width, H = c.off.height;
    const x = c.offctx;
    const authed = !s.sec.pass || s.st.logged;
    const blocked = (s.sec.firewall > 0 && !s.st.fwDown) || !authed;
    const ctx = c.ctx, w = c.canvas.width, h = c.canvas.height;

    if (blocked) { drawStatic(c, t); return; }

    /* loop injetado: a cena repete um trecho curto e o relogio congela */
    const looping = CCTV.isLooping(s, cam);
    if (looping && !c.freeze) c.freeze = { t0: t, clock: G.time, sec: Math.floor(t % 60) };
    if (!looping && c.freeze) c.freeze = null;
    const st = c.freeze ? c.freeze.t0 + ((t - c.freeze.t0) % LOOP_LEN) : t;

    if (!c.layout) c.layout = buildLayout(cam, W, H);

    /* --- cena --- */
    x.save();
    x.clearRect(0, 0, W, H);
    (SCENES[cam.scene] || SCENES.lobby)(x, W, H, cam, st, c.layout);
    x.restore();

    /* --- para a tela real, em baixa resolucao --- */
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(c.off, 0, 0, w, h);

    /* grao */
    ctx.globalAlpha = 0.13;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(noiseFrames[Math.floor(t * FPS) % noiseFrames.length], 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    /* tint monocromatico */
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = cam.night ? 'rgba(150,200,190,1)' : 'rgba(205,215,210,1)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    /* falha horizontal ocasional */
    const gseed = Math.sin(t * 7.13 + cam.seed) * 43758.5453;
    if ((gseed - Math.floor(gseed)) > 0.93) {
      const gy = Math.floor((gseed * 977 % 1) * h);
      const gh = Math.max(2, Math.round(h * 0.06));
      const dx = Math.round((gseed * 311 % 1) * 18 - 9);
      try { ctx.drawImage(c.canvas, 0, gy, w, gh, dx, gy, w, gh); } catch (e) { }
    }

    /* scanlines */
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let yy = 0; yy < h; yy += 3) ctx.fillRect(0, yy, w, 1);

    /* vinheta */
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    drawOsd(c, ctx, w, h, t, looping);

    /* teclado: o codigo aparece durante alguns segundos por ciclo */
    if (cam.keypad) drawKeypadZoom(c, ctx, w, h, st);
  }

  /* sem sinal: estatica pura */
  function drawStatic(c, t) {
    const ctx = c.ctx, w = c.canvas.width, h = c.canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.5;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(noiseFrames[Math.floor(t * FPS * 2) % noiseFrames.length], 0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let yy = 0; yy < h; yy += 3) ctx.fillRect(0, yy, w, 1);
    ctx.fillStyle = '#ff5b5b';
    ctx.font = 'bold ' + Math.max(9, Math.round(h * 0.09)) + 'px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SEM SINAL', w / 2, h / 2);
    ctx.font = Math.max(7, Math.round(h * 0.055)) + 'px Consolas, monospace';
    ctx.fillStyle = '#c8a24a';
    ctx.fillText('fluxo bloqueado', w / 2, h / 2 + h * 0.12);
    ctx.textAlign = 'left';
  }

  /* legendas sobre a imagem */
  function drawOsd(c, ctx, w, h, t, looping) {
    const cam = c.cam;
    const fs = Math.max(7, Math.round(h * 0.055));
    ctx.font = fs + 'px Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, w, fs + 6);
    ctx.fillRect(0, h - fs - 6, w, fs + 6);

    ctx.fillStyle = '#dff7ef';
    ctx.fillText(cam.label + '  ' + cam.zone.toUpperCase(), 5, 3);

    /* relogio: congela quando a camera esta em loop */
    const gm = c.freeze ? c.freeze.clock : G.time;
    const secs = c.freeze ? c.freeze.sec : Math.floor(t % 60);
    const d = U.toDate(gm);
    const stamp = U.pad(d.d) + '/' + U.pad(d.mo) + '/' + d.y + '  ' +
      U.pad(d.h) + ':' + U.pad(d.mi) + ':' + U.pad(secs);
    ctx.textAlign = 'right';
    ctx.fillText(stamp, w - 5, 3);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#9fd8c8';
    ctx.fillText((cam.night ? 'IR ON  ' : '') + 'CH' + U.pad(cam.num) + '  ' + (looping ? 'PB-LOOP' : 'LIVE'), 5, h - fs - 3);

    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath();
      ctx.arc(w - 9 - fs * 2.4, h - fs / 2 - 3, fs * 0.28, 0, 7);
      ctx.fill();
      ctx.fillText('REC', w - 6 - fs * 1.9, h - fs - 3);
    }
    if (looping) {
      ctx.fillStyle = 'rgba(240,176,56,0.9)';
      ctx.fillText('LOOP', w / 2 - fs, h - fs - 3);
    }
  }

  /* ciclo do funcionario no teclado do cofre */
  function keypadCycle(cam, t) {
    const period = 26;
    const p = (t + (cam.seed % 26)) % period;
    /* 0-10 vazio | 10-14 chegando | 14-21 digitando | 21-26 saindo */
    if (p < 10) return { phase: 'idle', k: 0 };
    if (p < 14) return { phase: 'walk', k: (p - 10) / 4 };
    if (p < 21) return { phase: 'type', k: (p - 14) / 7 };
    return { phase: 'leave', k: (p - 21) / 5 };
  }
  CCTV.keypadCycle = keypadCycle;

  function drawKeypadZoom(c, ctx, w, h, t) {
    const cy = keypadCycle(c.cam, t);
    if (cy.phase !== 'type') return;
    const code = c.cam.code || '000000';
    const bw = Math.min(w * 0.42, 190), bh = bw * 0.42;
    const bx = w - bw - 6, by = h - bh - Math.max(10, h * 0.12);

    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(240,176,56,0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

    ctx.fillStyle = '#f0b038';
    ctx.font = Math.max(7, Math.round(bh * 0.19)) + 'px Consolas, monospace';
    ctx.fillText('ZOOM DIGITAL x8 - TECLADO', bx + 6, by + 4);

    /* os digitos aparecem um a um */
    const shown = Math.min(code.length, Math.floor(cy.k * (code.length + 1.2)) + 1);
    ctx.fillStyle = '#dff7ef';
    ctx.font = 'bold ' + Math.round(bh * 0.46) + 'px Consolas, monospace';
    ctx.fillText(code.slice(0, shown), bx + 8, by + bh * 0.38);
  }

  /* =========================================================
     CENAS
     Tudo e desenhado em escala de cinza; o tint vem depois.
     ========================================================= */
  function buildLayout(cam, W, H) {
    const rng = U.makeRNG(cam.seed);
    const L = { cars: [], racks: [], boxes: [], people: [] };
    for (let i = 0; i < 7; i++) {
      L.cars.push({ lane: i, off: rng() * 0.6, tone: 0.35 + rng() * 0.3, skip: rng.chance(0.25) });
    }
    for (let i = 0; i < 10; i++) L.racks.push({ leds: rng.int(4, 9), seed: rng.int(1, 9999) });
    for (let i = 0; i < 8; i++) {
      L.boxes.push({ x: rng(), y: rng(), w: 0.1 + rng() * 0.16, h: 0.08 + rng() * 0.14, tone: 0.25 + rng() * 0.25 });
    }
    for (let i = 0; i < 3; i++) {
      L.people.push({ off: rng(), spd: 0.05 + rng() * 0.07, dir: rng.chance(0.5) ? 1 : -1, lane: rng() });
    }
    return L;
  }

  function g(v) { const n = Math.round(U.clamp(v, 0, 1) * 255); return 'rgb(' + n + ',' + n + ',' + n + ')'; }

  /* pessoa simplificada, do tamanho pedido */
  function person(ctx, px, py, ph, walk, tone) {
    const bw = ph * 0.30;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(px, py, bw * 0.9, bw * 0.32, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = g(tone === undefined ? 0.62 : tone);
    /* pernas */
    const sw = Math.sin(walk) * ph * 0.13;
    ctx.fillRect(px - bw * 0.34 + sw * 0.5, py - ph * 0.42, bw * 0.26, ph * 0.42);
    ctx.fillRect(px + bw * 0.08 - sw * 0.5, py - ph * 0.42, bw * 0.26, ph * 0.42);
    /* tronco */
    ctx.fillRect(px - bw / 2, py - ph * 0.80, bw, ph * 0.40);
    /* cabeca */
    ctx.beginPath();
    ctx.arc(px, py - ph * 0.88, ph * 0.11, 0, 7);
    ctx.fill();
  }

  const SCENES = {};

  /* ---------- recepcao ---------- */
  SCENES.lobby = function (x, W, H, cam, t, L) {
    x.fillStyle = g(0.16); x.fillRect(0, 0, W, H);              /* parede */
    x.fillStyle = g(0.30); x.fillRect(0, H * 0.42, W, H * 0.58); /* piso */
    /* juntas do piso em perspectiva */
    x.strokeStyle = g(0.24); x.lineWidth = 1;
    for (let i = -3; i <= 4; i++) {
      x.beginPath();
      x.moveTo(W * 0.5 + i * W * 0.06, H * 0.42);
      x.lineTo(W * 0.5 + i * W * 0.34, H);
      x.stroke();
    }
    for (let i = 1; i < 4; i++) {
      const yy = H * 0.42 + (H * 0.58) * (i / 3.4) * (i / 2.6);
      x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke();
    }
    /* portas de vidro no fundo */
    x.fillStyle = g(0.52); x.fillRect(W * 0.36, H * 0.14, W * 0.28, H * 0.28);
    x.fillStyle = g(0.20); x.fillRect(W * 0.497, H * 0.14, W * 0.006, H * 0.28);
    x.fillStyle = g(0.10); x.fillRect(W * 0.36, H * 0.40, W * 0.28, H * 0.02);
    /* balcao */
    x.fillStyle = g(0.40); x.fillRect(W * 0.62, H * 0.52, W * 0.34, H * 0.16);
    x.fillStyle = g(0.28); x.fillRect(W * 0.62, H * 0.68, W * 0.34, H * 0.06);
    /* plantas */
    x.fillStyle = g(0.22);
    x.beginPath(); x.arc(W * 0.10, H * 0.52, H * 0.09, 0, 7); x.fill();
    x.beginPath(); x.arc(W * 0.90, H * 0.40, H * 0.06, 0, 7); x.fill();
    /* luz do teto */
    x.fillStyle = 'rgba(255,255,255,0.05)';
    x.beginPath(); x.moveTo(W * 0.3, 0); x.lineTo(W * 0.7, 0); x.lineTo(W, H); x.lineTo(0, H); x.fill();
    /* pessoas atravessando */
    L.people.forEach((p, i) => {
      const u = ((t * p.spd + p.off) % 1);
      const px = p.dir > 0 ? u * W : (1 - u) * W;
      const py = H * (0.55 + p.lane * 0.35);
      const ph = H * (0.20 + p.lane * 0.22);
      person(x, px, py, ph, t * 7 + i, 0.62);
    });
  };

  /* ---------- corredor ---------- */
  SCENES.corridor = function (x, W, H, cam, t, L) {
    const vx = W * 0.52, vy = H * 0.46;
    x.fillStyle = g(0.12); x.fillRect(0, 0, W, H);
    /* fundo */
    x.fillStyle = g(0.26); x.fillRect(vx - W * 0.09, vy - H * 0.15, W * 0.18, H * 0.32);
    /* paredes e teto em perspectiva */
    x.fillStyle = g(0.19);
    x.beginPath(); x.moveTo(0, 0); x.lineTo(vx - W * 0.09, vy - H * 0.15);
    x.lineTo(vx - W * 0.09, vy + H * 0.17); x.lineTo(0, H); x.fill();
    x.fillStyle = g(0.22);
    x.beginPath(); x.moveTo(W, 0); x.lineTo(vx + W * 0.09, vy - H * 0.15);
    x.lineTo(vx + W * 0.09, vy + H * 0.17); x.lineTo(W, H); x.fill();
    x.fillStyle = g(0.31);
    x.beginPath(); x.moveTo(0, H); x.lineTo(vx - W * 0.09, vy + H * 0.17);
    x.lineTo(vx + W * 0.09, vy + H * 0.17); x.lineTo(W, H); x.fill();
    /* portas laterais */
    for (let i = 1; i <= 3; i++) {
      const k = i / 4;
      const lx = vx - W * 0.09 - (vx - W * 0.09) * (1 - k) * 1.0;
      const top = vy - H * 0.15 - (vy - H * 0.15) * (1 - k) * 0.9;
      const bot = vy + H * 0.17 + (H - (vy + H * 0.17)) * (1 - k) * 0.9;
      x.fillStyle = g(0.13);
      x.fillRect(lx, top + (bot - top) * 0.12, Math.max(2, W * 0.02), (bot - top) * 0.78);
      x.fillRect(W - lx - Math.max(2, W * 0.02), top + (bot - top) * 0.12, Math.max(2, W * 0.02), (bot - top) * 0.78);
    }
    /* luminarias */
    for (let i = 1; i <= 4; i++) {
      const k = i / 5;
      const ly = vy - H * 0.15 - (vy - H * 0.15) * (1 - k);
      const lw = W * 0.03 + W * 0.10 * (1 - k);
      x.fillStyle = 'rgba(255,255,255,0.45)';
      x.fillRect(vx - lw / 2, ly, lw, Math.max(1, H * 0.02 * (1 - k) + 1));
    }
    /* alguem vindo pelo corredor */
    const u = (t * 0.10 + (cam.seed % 100) / 100) % 1;
    const py = vy + H * 0.17 + (H - (vy + H * 0.17)) * u * u;
    const ph = H * (0.10 + 0.55 * u * u);
    person(x, vx + Math.sin(t * 0.6) * W * 0.02, py, ph, t * 6, 0.60);
  };

  /* ---------- estacionamento ---------- */
  SCENES.parking = function (x, W, H, cam, t, L) {
    x.fillStyle = g(0.08); x.fillRect(0, 0, W, H);
    x.fillStyle = g(0.14); x.fillRect(0, H * 0.30, W, H * 0.70);
    /* cones de luz */
    [0.2, 0.55, 0.85].forEach(fx => {
      const gr = x.createRadialGradient(W * fx, H * 0.34, 2, W * fx, H * 0.34, H * 0.55);
      gr.addColorStop(0, 'rgba(255,255,255,0.30)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr;
      x.fillRect(0, H * 0.25, W, H * 0.75);
    });
    /* faixas das vagas */
    x.strokeStyle = g(0.42); x.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      x.beginPath();
      x.moveTo(W * (i / 6) * 0.8 + W * 0.1, H * 0.42);
      x.lineTo(W * (i / 6) * 1.5 - W * 0.25, H);
      x.stroke();
    }
    /* carros */
    L.cars.forEach((car, i) => {
      if (car.skip) return;
      const k = i / 7;
      const cw = W * (0.10 + k * 0.06), ch = H * (0.07 + k * 0.05);
      const cx = W * (0.10 + k * 0.82 + car.off * 0.05);
      const cy = H * (0.50 + k * 0.16);
      x.fillStyle = g(car.tone);
      x.fillRect(cx - cw / 2, cy - ch / 2, cw, ch);
      x.fillStyle = g(car.tone + 0.22);
      x.fillRect(cx - cw * 0.32, cy - ch * 0.42, cw * 0.64, ch * 0.34);
      x.fillStyle = 'rgba(0,0,0,0.4)';
      x.fillRect(cx - cw / 2, cy + ch / 2, cw, ch * 0.14);
    });
    /* pilares */
    x.fillStyle = g(0.20);
    x.fillRect(W * 0.02, H * 0.20, W * 0.05, H * 0.62);
    x.fillRect(W * 0.72, H * 0.24, W * 0.06, H * 0.66);
    /* uma pessoa cruzando de vez em quando */
    const u = (t * 0.045 + (cam.seed % 50) / 50) % 1.6;
    if (u < 1) person(x, u * W, H * 0.86, H * 0.30, t * 6, 0.5);
  };

  /* ---------- antecamara do cofre ---------- */
  SCENES.vault = function (x, W, H, cam, t, L) {
    x.fillStyle = g(0.18); x.fillRect(0, 0, W, H);
    x.fillStyle = g(0.30); x.fillRect(0, H * 0.62, W, H * 0.38);   /* piso */
    x.strokeStyle = g(0.24);
    for (let i = 0; i <= 6; i++) {
      x.beginPath(); x.moveTo(W * (i / 6), H * 0.62); x.lineTo(W * (i / 6) * 1.6 - W * 0.3, H); x.stroke();
    }
    /* porta do cofre */
    const vx = W * 0.34, vy = H * 0.44, vr = H * 0.24;
    x.fillStyle = g(0.24); x.fillRect(vx - vr * 1.2, vy - vr * 1.25, vr * 2.4, vr * 2.5);
    x.fillStyle = g(0.40);
    x.beginPath(); x.arc(vx, vy, vr, 0, 7); x.fill();
    x.fillStyle = g(0.30);
    x.beginPath(); x.arc(vx, vy, vr * 0.72, 0, 7); x.fill();
    x.fillStyle = g(0.52);
    x.beginPath(); x.arc(vx, vy, vr * 0.16, 0, 7); x.fill();
    x.strokeStyle = g(0.55); x.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + Math.sin(t * 0.2) * 0.1;
      x.beginPath(); x.moveTo(vx, vy);
      x.lineTo(vx + Math.cos(a) * vr * 0.66, vy + Math.sin(a) * vr * 0.66);
      x.stroke();
    }
    /* teclado na parede */
    const kx = W * 0.70, ky = H * 0.40, kw = W * 0.10, kh = H * 0.22;
    x.fillStyle = g(0.22); x.fillRect(kx, ky, kw, kh);
    const cy = keypadCycle(cam, t);
    for (let r = 0; r < 4; r++) {
      for (let ccol = 0; ccol < 3; ccol++) {
        const lit = cy.phase === 'type' && Math.floor(t * 3 + r * 3 + ccol) % 7 === 0;
        x.fillStyle = g(lit ? 0.85 : 0.42);
        x.fillRect(kx + kw * (0.12 + ccol * 0.29), ky + kh * (0.10 + r * 0.21), kw * 0.22, kh * 0.14);
      }
    }
    /* funcionario */
    if (cy.phase !== 'idle') {
      let px;
      if (cy.phase === 'walk') px = W * (1.05 - 0.28 * cy.k);
      else if (cy.phase === 'type') px = W * 0.77;
      else px = W * (0.77 + 0.35 * cy.k);
      person(x, px, H * 0.90, H * 0.42, cy.phase === 'type' ? 0 : t * 6, 0.58);
      if (cy.phase === 'type') {
        x.fillStyle = g(0.58);
        x.fillRect(px - W * 0.06, H * 0.60, W * 0.06, H * 0.02);   /* braco esticado */
      }
    }
  };

  /* ---------- doca de carga ---------- */
  SCENES.dock = function (x, W, H, cam, t, L) {
    x.fillStyle = g(0.07); x.fillRect(0, 0, W, H);
    x.fillStyle = g(0.13); x.fillRect(0, H * 0.46, W, H * 0.54);
    /* luz alta */
    const gr = x.createRadialGradient(W * 0.5, H * 0.10, 4, W * 0.5, H * 0.10, H);
    gr.addColorStop(0, 'rgba(255,255,255,0.26)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    /* containers */
    L.boxes.forEach((b, i) => {
      const bx = b.x * W * 0.9, by = H * 0.30 + b.y * H * 0.42;
      const bw = b.w * W, bh = b.h * H;
      x.fillStyle = g(b.tone);
      x.fillRect(bx, by, bw, bh);
      x.fillStyle = g(b.tone + 0.12);
      x.fillRect(bx, by, bw, bh * 0.16);
      x.strokeStyle = g(b.tone - 0.1);
      for (let k = 1; k < 5; k++) {
        x.beginPath(); x.moveTo(bx + bw * k / 5, by); x.lineTo(bx + bw * k / 5, by + bh); x.stroke();
      }
    });
    /* portao */
    x.fillStyle = g(0.20); x.fillRect(W * 0.02, H * 0.22, W * 0.16, H * 0.34);
    /* empilhadeira indo e voltando */
    const u = (Math.sin(t * 0.25 + cam.seed) + 1) / 2;
    const fx = W * (0.15 + u * 0.7), fy = H * 0.84;
    x.fillStyle = g(0.46);
    x.fillRect(fx - W * 0.05, fy - H * 0.12, W * 0.10, H * 0.10);
    x.fillStyle = g(0.30);
    x.fillRect(fx + W * 0.04, fy - H * 0.20, W * 0.012, H * 0.20);
    x.fillStyle = g(0.20);
    x.beginPath(); x.arc(fx - W * 0.03, fy, H * 0.03, 0, 7); x.fill();
    x.beginPath(); x.arc(fx + W * 0.03, fy, H * 0.03, 0, 7); x.fill();
  };

  /* ---------- sala de servidores ---------- */
  SCENES.server = function (x, W, H, cam, t, L) {
    x.fillStyle = g(0.10); x.fillRect(0, 0, W, H);
    x.fillStyle = g(0.20); x.fillRect(0, H * 0.62, W, H * 0.38);
    /* corredor entre racks, perspectiva */
    for (let i = 0; i < 5; i++) {
      const k = i / 5;
      const rw = W * (0.10 + k * 0.10), rh = H * (0.30 + k * 0.32);
      const lx = W * (0.30 - k * 0.30), rx = W * (0.70 + k * 0.30) - rw;
      const ry = H * 0.58 - rh + H * k * 0.06;
      [lx, rx].forEach((bx, side) => {
        x.fillStyle = g(0.26 - k * 0.05);
        x.fillRect(bx, ry, rw, rh);
        x.fillStyle = g(0.14);
        x.fillRect(bx + rw * 0.1, ry + rh * 0.06, rw * 0.8, rh * 0.88);
        const rack = L.racks[(i * 2 + side) % L.racks.length];
        for (let d = 0; d < rack.leds; d++) {
          const on = Math.floor(t * 6 + d * 3 + rack.seed) % 5 !== 0;
          x.fillStyle = g(on ? 0.9 : 0.3);
          x.fillRect(bx + rw * 0.2, ry + rh * (0.12 + d * 0.09), Math.max(1, rw * 0.08), Math.max(1, rh * 0.02));
        }
      });
    }
    /* piso frio */
    x.strokeStyle = g(0.26);
    for (let i = 0; i <= 5; i++) {
      x.beginPath(); x.moveTo(W * 0.5 + (i - 2.5) * W * 0.05, H * 0.62);
      x.lineTo(W * 0.5 + (i - 2.5) * W * 0.30, H); x.stroke();
    }
    /* tecnico ocasional no fundo */
    const u = (t * 0.06 + (cam.seed % 30) / 30) % 2;
    if (u < 1) person(x, W * (0.35 + u * 0.3), H * 0.72, H * 0.24, t * 5, 0.55);
  };

  /* ---------- perimetro externo ---------- */
  SCENES.street = function (x, W, H, cam, t, L) {
    x.fillStyle = g(0.06); x.fillRect(0, 0, W, H);            /* ceu */
    x.fillStyle = g(0.11); x.fillRect(0, H * 0.34, W, H * 0.66);
    /* predio de fundo */
    x.fillStyle = g(0.15); x.fillRect(0, H * 0.10, W * 0.42, H * 0.26);
    for (let i = 0; i < 12; i++) {
      const on = Math.floor(t * 0.4 + i * 7 + cam.seed) % 4 !== 0;
      x.fillStyle = g(on ? 0.42 : 0.16);
      x.fillRect(W * 0.03 + (i % 6) * W * 0.06, H * 0.14 + Math.floor(i / 6) * H * 0.09, W * 0.035, H * 0.05);
    }
    /* calcada e rua */
    x.fillStyle = g(0.18); x.fillRect(0, H * 0.44, W, H * 0.10);
    x.fillStyle = g(0.09); x.fillRect(0, H * 0.54, W, H * 0.46);
    x.fillStyle = g(0.40);
    for (let i = 0; i < 7; i++) x.fillRect(W * (i / 7) + W * 0.02, H * 0.76, W * 0.07, Math.max(1, H * 0.015));
    /* poste */
    x.fillStyle = g(0.28); x.fillRect(W * 0.80, H * 0.10, W * 0.012, H * 0.36);
    const gr = x.createRadialGradient(W * 0.806, H * 0.12, 2, W * 0.806, H * 0.12, H * 0.7);
    gr.addColorStop(0, 'rgba(255,255,255,0.32)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    /* carro passando */
    const u = (t * 0.14 + (cam.seed % 20) / 20) % 1.4;
    if (u < 1.1) {
      const cx = W * (1.2 - u * 1.5), cy = H * 0.72;
      x.fillStyle = g(0.34);
      x.fillRect(cx, cy - H * 0.10, W * 0.22, H * 0.10);
      x.fillStyle = g(0.52);
      x.fillRect(cx + W * 0.04, cy - H * 0.15, W * 0.12, H * 0.06);
      x.fillStyle = 'rgba(255,255,255,0.75)';
      x.fillRect(cx - W * 0.01, cy - H * 0.06, W * 0.02, Math.max(1, H * 0.02));
    }
    /* pedestre */
    const v = (t * 0.05 + (cam.seed % 13) / 13) % 1.5;
    if (v < 1) person(x, W * (1 - v), H * 0.53, H * 0.16, t * 5, 0.48);
  };

  /* ---------- hall dos elevadores ---------- */
  SCENES.elevator = function (x, W, H, cam, t, L) {
    x.fillStyle = g(0.17); x.fillRect(0, 0, W, H);
    x.fillStyle = g(0.29); x.fillRect(0, H * 0.60, W, H * 0.40);
    for (let i = 0; i < 3; i++) {
      const dx = W * (0.12 + i * 0.28);
      x.fillStyle = g(0.36);
      x.fillRect(dx, H * 0.22, W * 0.20, H * 0.40);
      x.fillStyle = g(0.22);
      x.fillRect(dx + W * 0.098, H * 0.22, W * 0.005, H * 0.40);
      /* indicador de andar */
      x.fillStyle = g(0.10);
      x.fillRect(dx + W * 0.06, H * 0.16, W * 0.08, H * 0.05);
      x.fillStyle = g(0.85);
      x.font = Math.max(5, Math.round(H * 0.05)) + 'px Consolas, monospace';
      x.fillText(String(1 + (Math.floor(t * 0.4 + i * 2 + cam.seed) % 12)), dx + W * 0.085, H * 0.205);
    }
    /* faixa de rodape */
    x.fillStyle = g(0.22); x.fillRect(0, H * 0.60, W, H * 0.03);
    /* pessoas esperando */
    L.people.forEach((p, i) => {
      const idle = Math.sin(t * 0.7 + i * 2) * W * 0.01;
      person(x, W * (0.22 + i * 0.28) + idle, H * 0.86, H * 0.34, t * 1.2 + i, 0.60);
    });
  };

  /* =========================================================
     TELA DO SERVIDOR
     ========================================================= */
  ServerUI.scr_cctv = function (m, s, rec) {
    const readOk = !(s.sec.firewall > 0 && !s.st.fwDown);
    const writeOk = !(s.sec.proxy > 0 && !s.st.proxyDown);
    const cams = s.cams || [];

    const head = el('div', 'cam-bar');
    head.appendChild(el('div', 'cam-title', 'CENTRAL DE VIDEOMONITORAMENTO — ' + cams.length + ' CANAIS'));
    const acts = el('div', 'row');
    const allOn = CCTV.allLooping(s);
    const bAll = el('button', 'btn btn-mini' + (allOn ? ' btn-danger' : ''), allOn ? 'RESTAURAR TODAS' : 'LOOP EM TODAS');
    bAll.disabled = !writeOk;
    bAll.addEventListener('click', () => {
      if (!writeOk) return UI.toast('Proxy ativo: sem permissao de escrita no gravador.', 'bad');
      const lm = loopMap(s);
      if (allOn) {
        cams.forEach(c => { delete lm[c.id]; });
        logHit(s, 'Fluxo de video restaurado em todos os canais');
        UI.toast('Cameras de volta ao vivo.', 'warn');
      } else {
        Net.illegal(s, 4);
        cams.forEach(c => { lm[c.id] = true; });
        Snd.modify();
        logHit(s, 'ALERTA: injecao de loop em todos os canais de video');
        UI.toast('Loop injetado em ' + cams.length + ' cameras.', 'ok');
      }
      UI.dirty();
    });
    acts.appendChild(bAll);
    head.appendChild(acts);
    m.appendChild(head);

    if (!readOk) {
      m.appendChild(el('div', 'mono-block bad',
        'FIREWALL ATIVO (nivel ' + s.sec.firewall + ')\n\n' +
        'O fluxo de video esta bloqueado. Execute Firewall_Bypass v' +
        s.sec.firewall + ' ou superior para ver as cameras.'));
    }

    /* contrato ativo neste sistema: lembrete na tela */
    G.missions.active.forEach(mm => {
      if (mm.targetIp !== s.ip) return;
      if (mm.type === 'cam_observe') {
        m.appendChild(el('div', 'cam-job',
          'CONTRATO: observe a ' + mm.camLabel + ' (' + mm.camZone + ') e anote o codigo ' +
          'digitado no teclado. Um funcionario aparece a cada poucos minutos de ronda.'));
      } else if (mm.type === 'cam_loop') {
        const held = mm.loopHeld || 0;
        const pct = U.clamp((held / mm.loopSeconds) * 100, 0, 100);
        const box = el('div', 'cam-job');
        box.appendChild(el('div', null,
          'CONTRATO: manter TODAS as cameras em loop por ' + mm.loopSeconds + 's seguidos.'));
        const bar = el('div', 'bar' + (pct > 66 ? '' : ' amber'));
        const fill = el('i'); fill.style.width = pct + '%';
        bar.appendChild(fill);
        box.appendChild(bar);
        box.appendChild(el('div', 'muted', Math.floor(held) + 's / ' + mm.loopSeconds + 's' +
          (CCTV.allLooping(s) ? '  (contando)' : '  (parado: nem todas estao em loop)')));
        m.appendChild(box);
      }
    });

    const sel = rec.state.cam ? cams.find(c => c.id === rec.state.cam) : null;

    if (sel) {
      /* ---- camera em destaque ---- */
      const back = el('div', 'cam-back', '‹ voltar ao mosaico');
      back.addEventListener('click', () => { rec.state.cam = null; UI.dirty(); });
      m.appendChild(back);

      const big = el('div', 'cam-big');
      big.appendChild(CCTV.view(s, sel, 640, 360, 'lg'));
      m.appendChild(big);

      const info = el('div', 'row wrap mt');
      info.appendChild(el('span', 'pill', sel.label));
      info.appendChild(el('span', 'pill a', sel.zone));
      info.appendChild(el('span', 'pill', sel.night ? 'INFRAVERMELHO' : 'LUZ VISIVEL'));
      info.appendChild(el('span', 'pill' + (CCTV.isLooping(s, sel) ? ' r' : ' g'),
        CCTV.isLooping(s, sel) ? 'LOOP INJETADO' : 'AO VIVO'));
      m.appendChild(info);
      m.appendChild(camControls(s, sel, writeOk));
    } else {
      /* ---- mosaico ---- */
      const grid = el('div', 'cam-grid');
      cams.forEach(cam => {
        const tile = el('div', 'cam-tile' + (CCTV.isLooping(s, cam) ? ' looping' : ''));
        tile.appendChild(CCTV.view(s, cam, 300, 169, 'sm'));
        const cap = el('div', 'cam-cap');
        cap.appendChild(el('span', null, cam.label + ' · ' + cam.zone));
        cap.appendChild(el('span', CCTV.isLooping(s, cam) ? 'bad' : 'ok',
          CCTV.isLooping(s, cam) ? 'LOOP' : 'LIVE'));
        tile.appendChild(cap);
        tile.addEventListener('click', () => { rec.state.cam = cam.id; UI.dirty(); });
        grid.appendChild(tile);
      });
      m.appendChild(grid);
      m.appendChild(el('div', 'muted mt',
        'Clique numa camera para ampliar. As gravacoes ficam na aba GRAVACOES.'));
    }
  };

  function camControls(s, cam, writeOk) {
    const r = el('div', 'row wrap mt');
    const on = CCTV.isLooping(s, cam);
    const b = el('button', 'btn btn-mini ' + (on ? 'btn-danger' : 'btn-primary'),
      on ? 'RESTAURAR FLUXO' : 'INJETAR LOOP');
    b.disabled = !writeOk;
    b.addEventListener('click', () => {
      const lm = loopMap(s);
      if (on) {
        delete lm[cam.id];
        logHit(s, 'Fluxo restaurado no canal ' + cam.label);
        UI.toast(cam.label + ' de volta ao vivo.', 'warn');
      } else {
        Net.illegal(s, 3);
        lm[cam.id] = true;
        Snd.modify();
        logHit(s, 'Loop de video injetado no canal ' + cam.label);
        UI.toast('Loop injetado em ' + cam.label + '.', 'ok');
      }
      UI.dirty();
    });
    r.appendChild(b);
    r.appendChild(el('span', 'muted',
      'O loop repete os ultimos ' + LOOP_LEN + 's e congela o relogio da imagem. ' +
      'Quem estiver olhando a tela nao percebe de imediato.'));
    return r;
  }

  function logHit(s, txt) {
    const l = W.makeLog(Math.random, G.time, txt, 'alert');
    l.id = 'l' + U.uid();
    s.logs.unshift(l);
  }

  if (typeof G !== 'undefined' && G.onTick) G.onTick(CCTV.tick);

  global.CCTV = CCTV;
})(window);
