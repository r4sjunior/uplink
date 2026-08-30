/* =========================================================
   sfx.js — o catálogo de efeitos, todos por síntese.

   Cada entrada declara o barramento a que pertence, a duração
   nominal (para o pool de vozes e para o audiolab) e um `build`
   que agenda a coisa toda a partir de `t0` num nó de destino.

   Nenhum efeito conhece o AudioContext do jogo: recebe o que
   for. É isso que deixa o audiolab renderizar tudo offline.
   ========================================================= */
import {
  tone, nz, thump, dtmf, dialSequence, mulberry, rnd, clamp, midi
} from './synth.js';

/* escala menor pentatônica: usada pelos hops e pelos acertos */
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

/* --------------------------------------------------------
   teclado — o efeito que mais toca no jogo inteiro.
   Três camadas: o estalo do plástico (topo), o baque do curso
   (corpo) e a ressonância da chapa (cauda). Cada tecla sorteia
   material, altura e força; nunca soam duas iguais.
   -------------------------------------------------------- */
function keyPress(ctx, out, t0, o, R) {
  const heavy = o.heavy || 0;                    /* 0 = tecla comum, 1 = barra/enter */
  const v = 0.75 + R() * 0.5;                    /* força do toque */
  const g = (o.gain === undefined ? 0.5 : o.gain) * v;
  const body = (185 + R() * 90) * (1 - heavy * 0.42);
  const top = (3400 + R() * 2600) * (1 - heavy * 0.28);

  /* 1. estalo do topo: ruído curtíssimo, banda alta */
  nz(ctx, out, t0, {
    dur: 0.008 + R() * 0.005, gain: 0.34 * g,
    band: [top, top * 0.45], q: 0.9, a: 0.0006, pow: 4.5
  });
  /* 2. corpo: baque da tecla no fim do curso */
  nz(ctx, out, t0 + 0.0015, {
    dur: 0.026 + heavy * 0.016, gain: 0.30 * g,
    band: [900 + R() * 500, 260], q: 1.4, a: 0.0012, pow: 3.2
  });
  tone(ctx, out, t0 + 0.001, {
    f: body, f2: body * 0.72, type: 'triangle',
    dur: 0.045 + heavy * 0.03, gain: 0.26 * g, a: 0.0012, pow: 3.6
  });
  /* 3. ressonância da chapa: só às vezes, e sempre discreta */
  if (R() > 0.45 || heavy) {
    tone(ctx, out, t0 + 0.004, {
      f: 1300 + R() * 900, type: 'sine',
      dur: 0.035 + heavy * 0.02, gain: 0.06 * g, a: 0.001, pow: 4
    });
  }
  /* 4. barra de espaço tem o chacoalho do estabilizador */
  if (heavy > 0.5) {
    nz(ctx, out, t0 + 0.012 + R() * 0.008, {
      dur: 0.03, gain: 0.13 * g, band: [2200, 800], q: 2.2, a: 0.001, pow: 3
    });
  }
  /* 5. o retorno da tecla: mais agudo, mais fraco, um pouco depois */
  if (o.release !== false) {
    const rt = t0 + 0.055 + R() * 0.045 + heavy * 0.02;
    nz(ctx, out, rt, {
      dur: 0.007, gain: 0.11 * g, band: [top * 1.15, top * 0.6], q: 1.1, a: 0.0005, pow: 5
    });
  }
  return 0.13;
}

/* --------------------------------------------------------
   o catálogo
   -------------------------------------------------------- */
export const CATALOG = {

  /* ---------- INTERFACE ---------- */
  click: {
    bus: 'ui', dur: 0.09, send: 0.03,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.5 : o.gain;
      /* transiente */
      nz(ctx, out, t0, { dur: 0.006, gain: 0.30 * g, band: [5200, 2400], q: 0.9, a: 0.0005, pow: 5 });
      /* corpo: é isto que separa um clique de um "tick" */
      tone(ctx, out, t0 + 0.0008, { f: 1420, f2: 880, type: 'triangle', dur: 0.055, gain: 0.30 * g, a: 0.0012, pow: 3.4 });
      tone(ctx, out, t0 + 0.0008, { f: 236, f2: 190, type: 'sine', dur: 0.07, gain: 0.24 * g, a: 0.0015, pow: 3.0 });
      nz(ctx, out, t0 + 0.006, { dur: 0.03, gain: 0.09 * g, band: [1100, 420], q: 1.6, a: 0.002, pow: 3 });
    }
  },

  hover: {
    bus: 'ui', dur: 0.05, send: 0.02,
    build(ctx, out, t0, o, R) {
      const g = (o.gain === undefined ? 0.16 : o.gain);
      nz(ctx, out, t0, { dur: 0.010, gain: 0.16 * g, band: [6800, 4200], q: 1.4, a: 0.0012, pow: 4 });
      tone(ctx, out, t0, { f: 3140, type: 'sine', dur: 0.028, gain: 0.13 * g, a: 0.002, pow: 3.4 });
    }
  },

  error: {
    bus: 'ui', dur: 0.42, send: 0.14,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.42 : o.gain;
      /* segunda menor: o intervalo que o ouvido recusa */
      tone(ctx, out, t0, { f: 233, f2: 210, type: 'sawtooth', dur: 0.20, gain: 0.20 * g, a: 0.003, pow: 2.2, filter: { type: 'lowpass', f: 2400, f2: 700, q: 3 } });
      tone(ctx, out, t0, { f: 247, f2: 222, type: 'square', dur: 0.20, gain: 0.15 * g, a: 0.003, pow: 2.2, filter: { type: 'lowpass', f: 1800, f2: 600, q: 2 } });
      tone(ctx, out, t0 + 0.15, { f: 175, f2: 138, type: 'sawtooth', dur: 0.26, gain: 0.20 * g, a: 0.004, pow: 2.4, filter: { type: 'lowpass', f: 1500, f2: 400, q: 2.5 } });
      nz(ctx, out, t0, { dur: 0.05, gain: 0.10 * g, band: [1800, 300], q: 1.2, a: 0.001, pow: 3.5 });
    }
  },

  confirm: {
    bus: 'ui', dur: 0.34, send: 0.20,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.4 : o.gain;
      tone(ctx, out, t0, { f: midi(69), type: 'triangle', dur: 0.10, gain: 0.22 * g, a: 0.003, pow: 3 });
      tone(ctx, out, t0 + 0.055, { f: midi(76), type: 'triangle', dur: 0.20, gain: 0.22 * g, a: 0.003, pow: 2.6 });
      tone(ctx, out, t0 + 0.055, { f: midi(88), type: 'sine', dur: 0.22, gain: 0.08 * g, a: 0.004, pow: 2.6 });
    }
  },

  win_open: {
    bus: 'ui', dur: 0.30, send: 0.10,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.42 : o.gain;
      nz(ctx, out, t0, { dur: 0.17, gain: 0.16 * g, band: [420, 3600], q: 1.1, a: 0.02, s: 0.7, r: 0.09, pow: 1.4 });
      tone(ctx, out, t0 + 0.02, { f: 320, f2: 760, type: 'triangle', dur: 0.13, gain: 0.13 * g, a: 0.006, pow: 2.2 });
      nz(ctx, out, t0 + 0.155, { dur: 0.02, gain: 0.20 * g, band: [3200, 1400], q: 1.0, a: 0.0008, pow: 4 });
      tone(ctx, out, t0 + 0.155, { f: 980, f2: 720, type: 'sine', dur: 0.06, gain: 0.14 * g, a: 0.001, pow: 3.4 });
    }
  },

  win_close: {
    bus: 'ui', dur: 0.26, send: 0.08,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.4 : o.gain;
      nz(ctx, out, t0, { dur: 0.13, gain: 0.15 * g, band: [3000, 380], q: 1.1, a: 0.004, pow: 2.0 });
      tone(ctx, out, t0, { f: 660, f2: 240, type: 'triangle', dur: 0.12, gain: 0.14 * g, a: 0.003, pow: 2.4 });
      thump(ctx, out, t0 + 0.11, { f: 120, dur: 0.13, gain: 0.34 * g, click: 1800 });
    }
  },

  toast: {
    bus: 'ui', dur: 0.30, send: 0.22,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.32 : o.gain;
      const bad = o.kind === 'err' || o.kind === 'fail';
      const a = bad ? midi(70) : midi(81);
      const b = bad ? midi(65) : midi(86);
      tone(ctx, out, t0, { f: a, type: 'sine', dur: 0.07, gain: 0.20 * g, a: 0.003, pow: 3 });
      tone(ctx, out, t0 + 0.075, { f: b, type: 'sine', dur: 0.16, gain: 0.18 * g, a: 0.003, pow: 2.6 });
    }
  },

  tab: {
    bus: 'ui', dur: 0.10, send: 0.05,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.4 : o.gain;
      nz(ctx, out, t0, { dur: 0.008, gain: 0.24 * g, band: [4600, 2000], q: 1.0, a: 0.0006, pow: 4.6 });
      tone(ctx, out, t0, { f: 620, f2: 940, type: 'square', dur: 0.035, gain: 0.11 * g, a: 0.0015, pow: 3.2, filter: { type: 'lowpass', f: 3200, q: 1 } });
      tone(ctx, out, t0 + 0.03, { f: 1240, type: 'sine', dur: 0.05, gain: 0.10 * g, a: 0.002, pow: 3 });
    }
  },

  /* ---------- TECLADO ---------- */
  key: { bus: 'ui', dur: 0.14, send: 0.03, build: (c, o, t, op, R) => keyPress(c, o, t, op, R) },
  key_space: { bus: 'ui', dur: 0.17, send: 0.04, build: (c, o, t, op, R) => keyPress(c, o, t, { ...op, heavy: 1, gain: (op.gain || 0.5) * 1.15 }, R) },
  key_enter: { bus: 'ui', dur: 0.20, send: 0.05, build: (c, o, t, op, R) => { keyPress(c, o, t, { ...op, heavy: 0.7, gain: (op.gain || 0.5) * 1.1 }, R); tone(c, o, t + 0.004, { f: 2450, type: 'sine', dur: 0.055, gain: 0.05 * (op.gain || 0.5), a: 0.001, pow: 4 }); } },
  key_back: { bus: 'ui', dur: 0.14, send: 0.03, build: (c, o, t, op, R) => keyPress(c, o, t, { ...op, gain: (op.gain || 0.5) * 0.92 }, R) },

  /* ---------- MODEM / DISCAGEM ---------- */
  dial: {
    bus: 'sfx', dur: 1.5, send: 0.10,
    build(ctx, out, t0, o, R) {
      dialSequence(ctx, out, t0, o.number || '5550142', { gain: (o.gain || 1) * 0.15, dialtoneDur: 0.42 });
    }
  },
  dtmf: {
    bus: 'sfx', dur: 0.1, send: 0.05,
    build(ctx, out, t0, o) { dtmf(ctx, out, t0, o.digit || '5', { gain: (o.gain || 1) * 0.16 }); }
  },
  ring: {
    bus: 'sfx', dur: 2.0, send: 0.18,
    build(ctx, out, t0, o, R) {
      const g = (o.gain === undefined ? 0.4 : o.gain);
      for (let k = 0; k < 2; k++) {
        const t = t0 + k * 1.0;
        /* toque = 440+480 Hz interrompido a 20 Hz */
        for (let i = 0; i < 8; i++) {
          tone(ctx, out, t + i * 0.05, { f: 440, type: 'sine', dur: 0.025, gain: 0.10 * g, a: 0.002, pow: 2 });
          tone(ctx, out, t + i * 0.05, { f: 480, type: 'sine', dur: 0.025, gain: 0.10 * g, a: 0.002, pow: 2 });
        }
      }
    }
  },

  /* ---------- CONEXÃO ---------- */
  connect: {
    bus: 'sfx', dur: 1.10, send: 0.28,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.5 : o.gain;
      /* varredura de subida: o link se formando */
      nz(ctx, out, t0, { dur: 0.55, gain: 0.13 * g, band: [180, 5200], q: 2.2, a: 0.09, s: 0.8, r: 0.12, pow: 1.2 });
      tone(ctx, out, t0, { f: 55, f2: 220, type: 'sawtooth', dur: 0.55, gain: 0.10 * g, a: 0.06, s: 0.75, r: 0.14, pow: 1.4, filter: { type: 'lowpass', f: 300, f2: 2600, q: 3 } });
      /* o link fecha: acorde de quinta + sub */
      const root = midi(45);
      tone(ctx, out, t0 + 0.52, { f: root, type: 'sine', dur: 0.55, gain: 0.24 * g, a: 0.004, pow: 2.4 });
      tone(ctx, out, t0 + 0.52, { f: root * 1.5, type: 'triangle', dur: 0.45, gain: 0.14 * g, a: 0.005, pow: 2.6 });
      tone(ctx, out, t0 + 0.52, { f: root * 4, type: 'sine', dur: 0.30, gain: 0.07 * g, a: 0.004, pow: 3 });
      nz(ctx, out, t0 + 0.52, { dur: 0.10, gain: 0.10 * g, band: [3800, 900], q: 1.1, a: 0.001, pow: 3.4 });
    }
  },

  /* cada salto da rota: uma nota que sobe na escala */
  hop: {
    bus: 'sfx', dur: 0.55, send: 0.34,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.45 : o.gain;
      const i = clamp(o.index === undefined ? 0 : o.index, 0, PENTA.length - 1);
      const f = midi(57 + PENTA[i]);
      tone(ctx, out, t0, { f, type: 'triangle', dur: 0.26, gain: 0.24 * g, a: 0.002, pow: 3.2, filter: { type: 'lowpass', f: 5200, f2: 1500, q: 1.2 } });
      tone(ctx, out, t0, { f: f * 2.005, type: 'sine', dur: 0.14, gain: 0.09 * g, a: 0.0015, pow: 3.6 });
      tone(ctx, out, t0 + 0.002, { f: f / 2, type: 'sine', dur: 0.20, gain: 0.11 * g, a: 0.003, pow: 3 });
      nz(ctx, out, t0, { dur: 0.012, gain: 0.11 * g, band: [5600, 2600], q: 1.0, a: 0.0006, pow: 4.5 });
    }
  },

  disconnect: {
    bus: 'sfx', dur: 0.42, send: 0.10,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.55 : o.gain;
      /* clunk seco: relé + massa, quase sem cauda */
      nz(ctx, out, t0, { dur: 0.014, gain: 0.30 * g, band: [4200, 1200], q: 0.8, a: 0.0005, pow: 5 });
      thump(ctx, out, t0 + 0.002, { f: 72, dur: 0.20, gain: 0.55 * g, click: 2200 });
      tone(ctx, out, t0 + 0.004, { f: 410, f2: 128, type: 'square', dur: 0.10, gain: 0.11 * g, a: 0.0015, pow: 3.6, filter: { type: 'lowpass', f: 2200, f2: 600, q: 1.4 } });
      nz(ctx, out, t0 + 0.055, { dur: 0.05, gain: 0.09 * g, band: [900, 200], q: 1.6, a: 0.002, pow: 3 });
    }
  },

  /* ---------- FERRAMENTAS ---------- */
  tool_start: {
    bus: 'sfx', dur: 0.30, send: 0.12,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.4 : o.gain;
      tone(ctx, out, t0, { f: 180, f2: 620, type: 'sawtooth', dur: 0.18, gain: 0.12 * g, a: 0.006, pow: 2.2, filter: { type: 'lowpass', f: 700, f2: 4200, q: 4 } });
      tone(ctx, out, t0 + 0.16, { f: 880, type: 'square', dur: 0.06, gain: 0.09 * g, a: 0.001, pow: 3.4, filter: { type: 'lowpass', f: 3000, q: 1 } });
    }
  },

  /* textura granular do decriptador */
  decrypt: {
    bus: 'sfx', dur: 0.70, send: 0.20,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.4 : o.gain;
      const n = 26;
      for (let i = 0; i < n; i++) {
        const t = t0 + i * 0.024 + R() * 0.008;
        const f = 380 + R() * 2600 * (0.4 + i / n);
        tone(ctx, out, t, { f, type: R() > 0.5 ? 'square' : 'triangle', dur: 0.018 + R() * 0.02, gain: (0.05 + R() * 0.05) * g, a: 0.001, pow: 3.6, filter: { type: 'bandpass', f, q: 6 } });
        if (R() > 0.7) nz(ctx, out, t, { dur: 0.012, gain: 0.05 * g, band: [f * 1.6, f * 0.8], q: 5, a: 0.0008, pow: 4 });
      }
      tone(ctx, out, t0 + 0.60, { f: midi(88), type: 'sine', dur: 0.14, gain: 0.10 * g, a: 0.002, pow: 3 });
    }
  },

  scan: {
    bus: 'sfx', dur: 0.80, send: 0.30,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.4 : o.gain;
      /* varredura de radar: banda estreita subindo, com ping no topo */
      nz(ctx, out, t0, { dur: 0.55, gain: 0.14 * g, band: [300, 6400], q: 9, a: 0.03, s: 0.85, r: 0.12, pow: 1.2 });
      tone(ctx, out, t0, { f: 300, f2: 1900, type: 'sine', dur: 0.55, gain: 0.07 * g, a: 0.03, s: 0.8, r: 0.12, pow: 1.2 });
      tone(ctx, out, t0 + 0.5, { f: midi(93), type: 'sine', dur: 0.28, gain: 0.13 * g, a: 0.0015, pow: 3.4 });
      tone(ctx, out, t0 + 0.5, { f: midi(93) * 1.498, type: 'sine', dur: 0.20, gain: 0.05 * g, a: 0.002, pow: 3.6 });
    }
  },

  transfer: {
    bus: 'sfx', dur: 0.45, send: 0.14,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.4 : o.gain;
      /* pacotes: blips quadrados subindo, com ruído de linha por baixo */
      nz(ctx, out, t0, { dur: 0.36, gain: 0.05 * g, band: [1400, 2600], q: 2, a: 0.01, s: 0.8, r: 0.08, pow: 1.4 });
      for (let i = 0; i < 8; i++) {
        tone(ctx, out, t0 + i * 0.038, {
          f: 900 + i * 165 + R() * 60, type: 'square', dur: 0.024,
          gain: 0.08 * g, a: 0.0012, pow: 3.4, filter: { type: 'lowpass', f: 4200, q: 1.2 }
        });
      }
      tone(ctx, out, t0 + 0.33, { f: midi(84), type: 'triangle', dur: 0.12, gain: 0.12 * g, a: 0.002, pow: 3 });
    }
  },

  /* camada de segurança derrubada: a recompensa de verdade */
  breach: {
    bus: 'sfx', dur: 0.90, send: 0.34,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.55 : o.gain;
      const lvl = clamp(o.level === undefined ? 0 : o.level, 0, 6);
      /* estilhaço */
      nz(ctx, out, t0, { dur: 0.22, gain: 0.16 * g, band: [6200, 700], q: 0.9, a: 0.0015, pow: 2.6 });
      /* queda de sub: a camada cede */
      tone(ctx, out, t0, { f: 160, f2: 44, type: 'sine', dur: 0.32, gain: 0.30 * g, a: 0.002, pow: 2.6 });
      /* e a resolução, subindo com o nível da camada */
      const root = midi(60 + PENTA[Math.min(lvl, PENTA.length - 1)]);
      tone(ctx, out, t0 + 0.16, { f: root, type: 'triangle', dur: 0.42, gain: 0.17 * g, a: 0.003, pow: 2.6 });
      tone(ctx, out, t0 + 0.20, { f: root * 1.5, type: 'triangle', dur: 0.40, gain: 0.11 * g, a: 0.004, pow: 2.6 });
      tone(ctx, out, t0 + 0.24, { f: root * 2, type: 'sine', dur: 0.44, gain: 0.08 * g, a: 0.005, pow: 2.4 });
    }
  },

  /* ---------- ALARME ---------- */
  alarm: {
    bus: 'sfx', dur: 1.30, send: 0.26,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.6 : o.gain;
      for (let i = 0; i < 3; i++) {
        const t = t0 + i * 0.40;
        /* klaxon: dente-de-serra por banda estreita, com vibrato */
        tone(ctx, out, t, {
          f: 740, f2: 700, type: 'sawtooth', dur: 0.185, gain: 0.17 * g,
          a: 0.006, pow: 1.6, fm: { f: 7.5, depth: 22 },
          filter: { type: 'bandpass', f: 1500, q: 2.4 }
        });
        tone(ctx, out, t + 0.19, {
          f: 552, f2: 528, type: 'sawtooth', dur: 0.185, gain: 0.17 * g,
          a: 0.006, pow: 1.6, fm: { f: 7.5, depth: 18 },
          filter: { type: 'bandpass', f: 1150, q: 2.4 }
        });
        /* subgrave que faz o alarme doer no peito */
        tone(ctx, out, t, { f: 62, type: 'sine', dur: 0.36, gain: 0.16 * g, a: 0.008, s: 0.5, r: 0.12, pow: 2 });
      }
    }
  },

  /* ---------- EVENTOS ---------- */
  email: {
    bus: 'ui', dur: 0.55, send: 0.30,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.4 : o.gain;
      tone(ctx, out, t0, { f: midi(84), type: 'sine', dur: 0.09, gain: 0.18 * g, a: 0.003, pow: 3 });
      tone(ctx, out, t0 + 0.09, { f: midi(91), type: 'sine', dur: 0.30, gain: 0.16 * g, a: 0.003, pow: 2.4 });
      tone(ctx, out, t0 + 0.09, { f: midi(96), type: 'sine', dur: 0.22, gain: 0.05 * g, a: 0.004, pow: 2.8 });
    }
  },

  mission_done: {
    bus: 'sfx', dur: 1.60, send: 0.40,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.5 : o.gain;
      const seq = [0, 7, 12, 19];
      for (let i = 0; i < seq.length; i++) {
        const f = midi(50 + seq[i]);
        tone(ctx, out, t0 + i * 0.13, { f, type: 'triangle', dur: 0.34 + i * 0.12, gain: 0.16 * g, a: 0.004, pow: 2.4, filter: { type: 'lowpass', f: 4200, f2: 1600, q: 1 } });
        tone(ctx, out, t0 + i * 0.13, { f: f * 2.003, type: 'sine', dur: 0.20, gain: 0.05 * g, a: 0.004, pow: 3 });
      }
      /* almofada grave sustentando o acorde */
      tone(ctx, out, t0 + 0.05, { f: midi(38), type: 'sawtooth', dur: 1.30, gain: 0.09 * g, a: 0.12, s: 0.6, r: 0.5, pow: 1.6, filter: { type: 'lowpass', f: 400, f2: 900, q: 2 } });
    }
  },

  mission_fail: {
    bus: 'sfx', dur: 1.10, send: 0.24,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.5 : o.gain;
      const seq = [0, -3, -8, -12];
      for (let i = 0; i < seq.length; i++) {
        tone(ctx, out, t0 + i * 0.16, { f: midi(53 + seq[i]), type: 'triangle', dur: 0.34, gain: 0.15 * g, a: 0.005, pow: 2.4, filter: { type: 'lowpass', f: 2600, f2: 900, q: 1.4 } });
      }
      nz(ctx, out, t0 + 0.5, { dur: 0.5, gain: 0.06 * g, band: [900, 160], q: 1.2, a: 0.04, pow: 1.8 });
    }
  },

  credits: {
    bus: 'ui', dur: 0.60, send: 0.28,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.4 : o.gain;
      const up = (o.delta === undefined ? 1 : o.delta) >= 0;
      const seq = up ? [79, 84, 88] : [79, 74, 70];
      for (let i = 0; i < seq.length; i++) {
        tone(ctx, out, t0 + i * 0.058, { f: midi(seq[i]), type: 'square', dur: 0.05, gain: 0.09 * g, a: 0.001, pow: 3.4, filter: { type: 'lowpass', f: 5200, q: 1 } });
        tone(ctx, out, t0 + i * 0.058, { f: midi(seq[i] + 12), type: 'sine', dur: 0.04, gain: 0.03 * g, a: 0.001, pow: 3.4 });
      }
      tone(ctx, out, t0 + 0.17, { f: midi(up ? 91 : 67), type: 'sine', dur: 0.34, gain: 0.11 * g, a: 0.003, pow: 2.6 });
    }
  },

  rating_up: {
    bus: 'sfx', dur: 1.00, send: 0.40,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.45 : o.gain;
      const seq = [0, 5, 7, 12, 17, 19];
      for (let i = 0; i < seq.length; i++) {
        tone(ctx, out, t0 + i * 0.062, { f: midi(60 + seq[i]), type: 'triangle', dur: 0.20, gain: 0.12 * g, a: 0.002, pow: 3, filter: { type: 'lowpass', f: 6000, f2: 2400, q: 1 } });
      }
      tone(ctx, out, t0 + 0.38, { f: midi(84), type: 'sine', dur: 0.55, gain: 0.10 * g, a: 0.006, pow: 2.2 });
      tone(ctx, out, t0 + 0.38, { f: midi(48), type: 'sine', dur: 0.55, gain: 0.10 * g, a: 0.008, pow: 2.2 });
    }
  },

  game_over: {
    bus: 'sfx', dur: 3.20, send: 0.45,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.75 : o.gain;
      /* impacto */
      nz(ctx, out, t0, { dur: 1.4, gain: 0.16 * g, band: [4200, 90], q: 0.9, a: 0.002, pow: 1.8 });
      thump(ctx, out, t0, { f: 58, dur: 0.9, gain: 0.6 * g, click: 1200 });
      /* queda: a sirene morrendo */
      tone(ctx, out, t0 + 0.02, { f: 320, f2: 33, type: 'sawtooth', dur: 2.4, gain: 0.16 * g, a: 0.01, s: 0.55, r: 0.9, pow: 1.4, filter: { type: 'lowpass', f: 2200, f2: 180, q: 3 } });
      tone(ctx, out, t0 + 0.05, { f: 214, f2: 27, type: 'square', dur: 2.4, gain: 0.09 * g, a: 0.02, s: 0.5, r: 0.9, pow: 1.4, filter: { type: 'lowpass', f: 1400, f2: 140, q: 2 } });
      /* cluster dissonante segurando o luto */
      [41, 42, 48, 49].forEach((n, i) => {
        tone(ctx, out, t0 + 0.3 + i * 0.04, { f: midi(n), type: 'sawtooth', dur: 2.4, gain: 0.05 * g, a: 0.35, s: 0.7, r: 1.1, pow: 1.3, filter: { type: 'lowpass', f: 700, f2: 260, q: 1.6 } });
      });
      /* três marteladas finais: acabou */
      for (let i = 0; i < 3; i++) {
        thump(ctx, out, t0 + 1.5 + i * 0.42, { f: 46, dur: 0.5, gain: 0.42 * g, click: 900 });
      }
    }
  },

  boot_beep: {
    bus: 'ui', dur: 0.14, send: 0.06,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.3 : o.gain;
      tone(ctx, out, t0, { f: 1046, type: 'square', dur: 0.07, gain: 0.14 * g, a: 0.001, s: 0.9, r: 0.015, pow: 2, filter: { type: 'lowpass', f: 5200, q: 1 } });
    }
  },

  /* estalo elétrico avulso — usado pelo ambiente e por VFX */
  crackle: {
    bus: 'ambience', dur: 0.14, send: 0.30,
    build(ctx, out, t0, o, R) {
      const g = o.gain === undefined ? 0.3 : o.gain;
      const n = 2 + Math.floor(R() * 4);
      for (let i = 0; i < n; i++) {
        nz(ctx, out, t0 + i * (0.004 + R() * 0.02), {
          dur: 0.003 + R() * 0.004, gain: (0.10 + R() * 0.16) * g,
          band: [2600 + R() * 6000, 1400], q: 1.6, a: 0.0004, pow: 5
        });
      }
    }
  }
};

/* apelidos: nomes que a interface e a simulação tendem a usar */
export const ALIAS = {
  button: 'click', press: 'click', beep: 'boot_beep', ok: 'confirm',
  success: 'confirm', fail: 'error', deny: 'error', keypress: 'key',
  space: 'key_space', enter: 'key_enter', backspace: 'key_back',
  open: 'win_open', close: 'win_close', window_open: 'win_open',
  window_close: 'win_close', notify: 'toast', switch: 'tab',
  link: 'connect', hangup: 'disconnect', unlink: 'disconnect',
  money: 'credits', mail: 'email', mail_new: 'email', new_mail: 'email',
  crack: 'breach', layer: 'breach', copy: 'transfer', download: 'transfer',
  upload: 'transfer', probe: 'scan', busted: 'game_over', over: 'game_over',
  dialtone: 'dial', klaxon: 'alarm', warn: 'alarm'
};

export function resolve(name) {
  if (CATALOG[name]) return name;
  const a = ALIAS[name];
  return (a && CATALOG[a]) ? a : null;
}

/* agenda um efeito. `voiceFor(bus, t0, dur, opts)` devolve o nó de
   destino — na prática o pool de vozes do grafo. */
export function schedule(ctx, voiceFor, name, t0, opts = {}) {
  const key = resolve(name);
  if (!key) return 0;
  const e = CATALOG[key];
  const R = opts.seed !== undefined ? mulberry(opts.seed) : rnd;
  const dur = e.dur;
  const out = voiceFor(e.bus, t0, dur, {
    send: opts.send === undefined ? e.send : opts.send,
    pos: opts.pos || e.pos
  });
  if (!out) return 0;
  e.build(ctx, out, t0, opts, R);
  return dur;
}

export const NAMES = Object.keys(CATALOG);
