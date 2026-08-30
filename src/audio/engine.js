/* =========================================================
   engine.js — a fachada do som.

   Liga o grafo (barramentos, compressor, limitador, reverb), o
   catálogo de efeitos sintetizados, as camadas de ambiente, o pulso
   do trace e os loops de ferramenta ao barramento de eventos do
   jogo. Ninguém chama áudio diretamente: tudo chega por `Bus`.

   Desbloqueio: o navegador só deixa tocar depois de um gesto. O
   contexto é criado na hora da inicialização mas fica suspenso; o
   primeiro clique ou tecla o retoma e sobe o volume mestre com
   rampa. Antes disso o jogo roda em silêncio, sem lançar exceção —
   é o que permite o QA headless capturar sem gesto nenhum.
   ========================================================= */
import { CFG } from '../config.js';
import { Bus, EV } from '../core/bus.js';
import { AudioGraph } from './graph.js';
import * as SFX from './sfx.js';
import { Ambience } from './ambience.js';
import { TracePulse, ToolLoop, TOOL_KINDS } from './loops.js';

/* Qual loop de ferramenta corresponde a qual programa. */
const LOOP_DE = {
  password_breaker: 'breaker',
  dictionary_hacker: 'breaker',
  decrypter: 'decrypt',
  file_copier: 'transfer',
  ip_probe: 'scan',
  lan_scan: 'scan',
  lan_probe: 'scan'
};

export const Audio = {
  ctx: null,
  graph: null,
  amb: null,
  trace: null,
  loops: {},
  ready: false,
  desbloqueado: false,
  _dial: null,
  _dialBuf: null,
  _pendentes: [],

  /* =========================================================
     ARRANQUE
     ========================================================= */
  async init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { console.warn('[audio] Web Audio indisponível; o jogo roda mudo.'); return; }

    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch (e) {
      console.warn('[audio] não foi possível criar o contexto:', e.message);
      return;
    }

    this.graph = new AudioGraph(this.ctx, { maxVoices: 28 });
    this.graph.applyConfig(CFG.audio);
    this.amb = new Ambience(this.ctx, this.graph);
    this.trace = new TracePulse(this.ctx, this.graph);
    TOOL_KINDS.forEach(k => { this.loops[k] = new ToolLoop(this.ctx, this.graph, k); });

    this._carregaDialup();
    this._ouve();
    this._instalaDesbloqueio();

    this.ready = true;
  },

  /* O contexto nasce suspenso. Qualquer gesto o acorda. */
  _instalaDesbloqueio() {
    const acorda = () => {
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => this._aoDesbloquear()).catch(() => {});
      } else {
        this._aoDesbloquear();
      }
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => {
      window.addEventListener(ev, acorda, { passive: true });
    });
    /* alguns navegadores já entregam o contexto rodando */
    if (this.ctx.state === 'running') this._aoDesbloquear();
  },

  _aoDesbloquear() {
    if (this.desbloqueado) return;
    this.desbloqueado = true;
    this.graph.wake(0.4);
    this.amb.start('idle');
    /* o que tentou tocar antes do gesto sai agora, de uma vez */
    const fila = this._pendentes.splice(0, 6);
    fila.forEach((n, i) => this.play(n, { delay: i * 0.05 }));
  },

  /* =========================================================
     A GRAVAÇÃO DO MODEM
     O único som que não é sintetizado: existe um arquivo real no
     repositório e ele é bom demais para ser imitado.
     ========================================================= */
  _carregaDialup() {
    fetch('assets/dial-up-sound_1.mp3')
      .then(r => r.arrayBuffer())
      .then(b => this.ctx.decodeAudioData(b))
      .then(buf => { this._dialBuf = buf; })
      .catch(e => console.warn('[audio] gravação do modem indisponível:', e.message));
  },

  dialup(segundos = 7.5) {
    if (!this._dialBuf || !this.desbloqueado) return;
    this.stopDialup(0.25);
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.02;
    const src = ctx.createBufferSource();
    src.buffer = this._dialBuf;
    /* entra a partir do handshake, não do tom de discagem */
    const inicio = Math.min(2.0, this._dialBuf.duration * 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.55, t0 + 0.35);
    g.gain.setValueAtTime(0.55, t0 + segundos - 0.9);
    g.gain.linearRampToValueAtTime(0, t0 + segundos);
    src.connect(g);
    g.connect(this.graph.bus.sfx);
    src.start(t0, inicio, segundos + 0.2);
    src.stop(t0 + segundos + 0.05);
    this._dial = { src, g };
    /* o modem toma a frente: o ambiente abaixa enquanto ele fala */
    this.graph.duck('ambience', 0.45, 0.2, segundos - 1, 1.2);
  },

  stopDialup(fade = 0.4) {
    if (!this._dial) return;
    const { src, g } = this._dial;
    this._dial = null;
    try {
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + fade);
      src.stop(t + fade + 0.02);
    } catch (e) { /* já parou */ }
  },

  /* =========================================================
     TOCAR UM EFEITO
     ========================================================= */
  play(name, opts) {
    if (!this.ready || !this.ctx) return 0;
    if (!this.desbloqueado) {
      /* guarda pouca coisa: uma fila longa vira cacofonia no gesto */
      if (this._pendentes.length < 6) this._pendentes.push(name);
      return 0;
    }
    if (CFG.audio.muted) return 0;

    const o = opts || {};
    const t0 = this.ctx.currentTime + (o.delay || 0) + 0.005;
    try {
      return SFX.schedule(
        this.ctx,
        (bus, t, dur, vo) => this.graph.voice(bus, t, dur, vo),
        name, t0, o
      );
    } catch (e) {
      console.warn('[audio] falha ao tocar "' + name + '":', e.message);
      return 0;
    }
  },

  /* =========================================================
     LIGAÇÕES COM O JOGO
     ========================================================= */
  _ouve() {
    /* --- efeitos avulsos --- */
    Bus.on(EV.SFX, p => {
      if (!p || !p.name) return;
      if (p.name === 'dial') { this.dialup(); return; }
      this.play(p.name, p);
    });

    /* --- conexão --- */
    Bus.on(EV.CONNECT_BEGIN, () => { this.amb.setScene('connecting'); });
    Bus.on(EV.HOP_REACHED, ({ index }) => {
      /* uma nota por salto, subindo em escala: a rota vira música */
      this.play('hop', { delay: 0.12 * index, step: index });
    });
    Bus.on(EV.CONNECT_OPEN, () => {
      this.play('connect_ok', { delay: 0.1 });
      this.amb.setScene('connected');
    });
    Bus.on(EV.CONNECT_CLOSE, () => {
      this.play('disconnect');
      this.stopDialup(0.3);
      this.trace.stop(0.5);
      Object.values(this.loops).forEach(l => l.stop());
      this.amb.setScene('idle');
    });

    /* --- trace: o som mais importante do jogo --- */
    Bus.on(EV.TRACE_START, () => {
      this.trace.start(this.ctx.currentTime);
      this.graph.duck('ambience', 0.6, 0.3, 1e9, 1.5);
    });
    Bus.on(EV.TRACE_END, () => {
      this.trace.stop(0.8);
      this.graph.duck('ambience', 1.0, 0.5, 0, 1.5);
    });
    Bus.on(EV.ALARM, () => this.play('alarm'));

    /* --- ferramentas --- */
    Bus.on(EV.TOOL_RUN, ({ tool }) => {
      const k = LOOP_DE[tool];
      if (k && this.loops[k]) this.loops[k].start();
      this.play('tool_start');
    });
    Bus.on(EV.TOOL_PROGRESS, ({ tool, pct }) => {
      const k = LOOP_DE[tool];
      if (k && this.loops[k]) this.loops[k].set(pct);
    });
    Bus.on(EV.TOOL_DONE, ({ tool, ok }) => {
      const k = LOOP_DE[tool];
      if (k && this.loops[k]) this.loops[k].stop();
      this.play(ok ? 'tool_ok' : 'tool_fail');
    });
    Bus.on(EV.BREACH, () => this.play('breach'));

    /* --- economia e correspondência --- */
    Bus.on(EV.EMAIL_NEW, () => this.play('mail'));
    Bus.on(EV.MISSION_DONE, () => this.play('mission_done'));
    Bus.on(EV.MISSION_FAIL, () => this.play('error'));
    Bus.on(EV.CREDITS, ({ delta }) => {
      if (delta > 0) this.play('credit');
    });
    Bus.on(EV.NEWS_NEW, ({ reactive }) => { if (reactive) this.play('notify'); });

    /* --- ciclo de vida --- */
    Bus.on(EV.GAME_START, () => { this.dialup(6); this.amb.setScene('idle'); });
    Bus.on(EV.GAME_OVER, () => {
      this.trace.stop(0.2);
      Object.values(this.loops).forEach(l => l.stop());
      this.amb.setScene('over');
      this.play('game_over');
    });
    Bus.on(EV.UI_SCREEN, ({ name }) => {
      if (name === 'desktop') this.amb.setScene('idle');
    });
  },

  /* =========================================================
     RELÓGIO
     ========================================================= */
  update(dt) {
    if (!this.ready || !this.desbloqueado) return;
    try {
      this.graph.update();
      this.graph.updateDuck();
      this.graph.reap();
      this.amb.update(dt);
      /* o pulso do trace lê o progresso direto do estado da barra */
      const t = this._traceEstado;
      this.trace.update(dt, t ? t.pct : 0, t ? t.remaining : 0);
      for (const k in this.loops) this.loops[k].update(dt, this.loops[k].pct || 0);
    } catch (e) {
      /* som nunca pode derrubar o jogo */
      console.warn('[audio] erro no laço:', e.message);
    }
  },

  /* =========================================================
     CONTROLE
     ========================================================= */
  setMuted(on) {
    CFG.audio.muted = !!on;
    if (this.graph) this.graph.setMuted(CFG.audio.muted);
    try { localStorage.setItem('uplink3d.mudo', CFG.audio.muted ? '1' : '0'); } catch (e) {}
    return CFG.audio.muted;
  },
  toggleMute() { return this.setMuted(!CFG.audio.muted); },
  isMuted() { return !!CFG.audio.muted; },

  setVolume(bus, v) {
    CFG.audio[bus] = Math.max(0, Math.min(1, v));
    if (this.graph) this.graph.applyConfig(CFG.audio);
  },

  stats() {
    if (!this.graph) return { pronto: false };
    return Object.assign({ pronto: this.ready, desbloqueado: this.desbloqueado },
      this.graph.stats());
  }
};

/* o estado do trace chega por evento e fica guardado para o laço */
Bus.on(EV.TRACE_TICK, p => { Audio._traceEstado = p; });
Bus.on(EV.TRACE_END, () => { Audio._traceEstado = null; });

/* preferência de mudo persiste entre sessões */
try {
  if (localStorage.getItem('uplink3d.mudo') === '1') CFG.audio.muted = true;
} catch (e) { /* armazenamento bloqueado */ }

export default Audio;
