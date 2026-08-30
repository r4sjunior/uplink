/* =========================================================
   shell.js — a casca da interface.

   Quatro telas — arranque, autenticação, área de trabalho e fim de
   jogo — e a moldura persistente que segura as janelas dos aplicativos.

   A área de trabalho segue a silhueta do Uplink original, porque é
   ela que faz o jogo ser reconhecível: barra superior com relógio,
   IP e controle de velocidade; coluna direita com o mapa e o
   Analisador de Conexão; barra de ferramentas embaixo; barra de
   trace no rodapé. O que muda é o acabamento.
   ========================================================= */
import { CFG } from '../config.js';
import { Bus, EV } from '../core/bus.js';
import { Game } from '../core/game.js';
import { UI, HOVER, CLICK } from './toolkit.js';
import { W, Icon, Toasts } from './widgets.js';
import { Text, Typewriter } from './text.js';
import { Anim, Ease, Dirty, clamp, lerp } from './anim.js';
import { Windows } from './windows.js';
import { C, FONT, SPACE, METRIC, GRID, alpha, snapGrid } from './theme.js';
import { Apps, APP_LIST } from './apps/index.js';
import * as WorldMap from './worldmap.js';

const TOPBAR_H = 44;
const DOCK_H = 76;
const SIDE_W = 336;
const TRACE_H = 30;

/* =========================================================
   TEXTO DE ARRANQUE
   Ritmo irregular de propósito: um POST real não cospe linhas em
   cadência constante. As pausas longas caem onde um computador de
   verdade demoraria — contagem de memória e varredura de barramento.
   ========================================================= */
const BOOT = [
  ['UPLINK BIOS v2.4.1  —  Uplink Corporation', 0.05],
  ['Copyright (c) 2010 Uplink Corp. Todos os direitos reservados.', 0.02],
  ['', 0.18],
  ['Processador  : detectando...', 0.30],
  ['', 0.02],
  ['Memória      : contando', 0.50],
  ['', 0.02],
  ['Barramento   : varrendo dispositivos', 0.42],
  ['  ata0  gateway storage           OK', 0.05],
  ['  net0  modem                     OK', 0.05],
  ['  crt0  tubo 21" widescreen       OK', 0.08],
  ['', 0.16],
  ['Verificando integridade do gateway...', 0.34],
  ['  particao de sistema             OK', 0.04],
  ['  chaves de autenticacao          OK', 0.04],
  ['  registro de conexoes            LIMPO', 0.10],
  ['', 0.20],
  ['Estabelecendo enlace com a Uplink Corporation', 0.55],
  ['', 0.04],
  ['ENLACE ATIVO. Bem-vindo, agente.', 0.30]
];

/* =========================================================
   ESTADO DA CASCA
   ========================================================= */
export const Shell = {
  _screen: 'boot',
  _prev: null,
  _fade: 0,
  _t: 0,
  _surface: null,
  _boot: null,
  _bootLinha: 0,
  _bootEspera: 0,
  _bootProntoEm: 0,
  _login: { handle: '', pass: '', msg: '', erro: false },
  _hud: null,
  _hudT: 0,
  _over: null,
  _traceUI: { pct: 0, remaining: 0, total: 0, ativo: false },
  _connAnim: 0,

  currentScreen() { return this._screen; },

  /* =========================================================
     ARRANQUE
     ========================================================= */
  async init({ surface }) {
    this._surface = surface;
    UI.install(surface);

    /* as fontes precisam estar prontas antes do primeiro desenho,
       senão o primeiro quadro sai com a fonte de fallback */
    await Text.load();
    /* o contorno do mundo é assíncrono; pedir agora evita o primeiro
       quadro do mapa aparecer vazio */
    WorldMap.carrega();

    this._boot = new Typewriter({ speed: 190, lineGap: 0.012 });
    BOOT.forEach(([linha, pausa]) => this._boot.push(linha, pausa));

    this._login.msg = Game.hasSave()
      ? 'Sessão anterior detectada neste terminal.'
      : 'Identifique-se, agente.';

    this._wire();
    Bus.emit(EV.UI_SCREEN, { name: 'boot' });
    return this;
  },

  _wire() {
    Bus.on(EV.UI_TOAST, ({ text, kind }) => Toasts.push(text, kind));
    Bus.on(EV.UI_SCREEN, ({ name }) => this.go(name));
    Bus.on(EV.GAME_OVER, info => { this._over = info; this.go('over'); });

    Bus.on(EV.TRACE_START, ({ total }) => {
      this._traceUI = { pct: 0, remaining: total, total, ativo: true };
      Dirty.mark();
    });
    Bus.on(EV.TRACE_TICK, ({ pct, remaining, total }) => {
      this._traceUI.pct = pct;
      this._traceUI.remaining = remaining;
      this._traceUI.total = total;
      this._traceUI.ativo = true;
      Dirty.mark();
    });
    Bus.on(EV.TRACE_END, () => { this._traceUI.ativo = false; Dirty.mark(); });
    Bus.on(EV.CONNECT_CLOSE, () => { this._traceUI.ativo = false; Dirty.mark(); });

    Bus.on(EV.UI_OPEN, () => Dirty.mark());
    Bus.on(EV.MISSION_DONE, () => Dirty.mark());
    Bus.on(EV.EMAIL_NEW, () => Dirty.mark());

    /* atalhos globais */
    Bus.on(EV.CONNECT_OPEN, () => { this._connAnim = 0; Dirty.mark(); });

    /* Uma área de trabalho vazia não parece um sistema, parece um
       protótipo. Toda partida abre com o que o agente precisa ver
       primeiro: a correspondência e o quadro de contratos. */
    Bus.on(EV.GAME_START, () => {
      Anim.delay(0.35, () => this._arranjoInicial());
    });
    Bus.on(EV.GAME_LOAD, () => {
      Anim.delay(0.35, () => this._arranjoInicial());
    });
  },

  /* A área útil não tem tamanho fixo: a superfície acompanha a janela.
     O arranjo inicial é calculado em proporção, não em pixels. */
  _arranjoInicial() {
    const s = this._surface;
    const area = {
      x: 0, y: TOPBAR_H,
      w: s.W - SIDE_W,
      h: s.H - TOPBAR_H - DOCK_H
    };
    const larg = Math.min(1040, Math.round(area.w * 0.94));
    const alt = Math.min(660, Math.round(area.h * 0.90));

    Apps.open('contracts');
    Apps.open('email');
    const c = Windows.get('contracts');
    const e = Windows.get('email');
    if (c) {
      c.w = larg; c.h = alt;
      c.x = area.x + Math.round((area.w - larg) / 2);
      c.y = area.y + Math.round((area.h - alt) / 2) - 8;
    }
    if (e) {
      /* atrás e deslocada: dá para ver que existe sem atrapalhar */
      e.w = larg; e.h = alt;
      e.x = c ? c.x + 26 : area.x + 26;
      e.y = c ? c.y + 26 : area.y + 26;
    }
    Windows.focus('contracts');
    Dirty.mark();
  },

  go(name) {
    if (this._screen === name) return;
    this._prev = this._screen;
    this._screen = name;
    this._fade = 0;
    if (name === 'desktop') Windows.reset();
    Dirty.mark();
  },

  /* =========================================================
     ATUALIZAÇÃO — só relógio e animação, nunca desenho
     ========================================================= */
  update(dt) {
    this._t += dt;
    this._dtAcumulado = (this._dtAcumulado || 0) + dt;
    Anim.update(dt);
    Toasts.update(dt);

    if (this._fade < 1) { this._fade = Math.min(1, this._fade + dt / 0.42); Dirty.mark(); }

    if (this._screen === 'boot') {
      this._boot.update(dt);
      Dirty.mark();
      if (this._boot.done) {
        this._bootProntoEm += dt;
        if (this._bootProntoEm > 0.75) { Bus.emit(EV.BOOT_DONE, {}); this.go('login'); }
      }
    }

    if (this._screen === 'desktop') {
      /* o HUD é remontado a 10 Hz: reconstruir o retrato do jogo a
         cada quadro é desperdício, e o relógio só muda por minuto */
      this._hudT += dt;
      if (!this._hud || this._hudT > 0.1) {
        this._hudT = 0;
        const antes = this._hud;
        this._hud = Game.hud();
        if (!antes || antes.clock !== this._hud.clock ||
            antes.credits !== this._hud.credits ||
            antes.connected !== this._hud.connected ||
            antes.tasks.length !== this._hud.tasks.length) Dirty.mark();
        if (this._hud.tasks.length) Dirty.mark();     /* barras em movimento */
      }
      this._connAnim = Math.min(1, this._connAnim + dt * 0.9);
    }

    if (this._traceUI.ativo) Dirty.mark();
  },

  /* =========================================================
     DESENHO
     ========================================================= */
  draw(surface, dt) {
    const ctx = surface.begin();
    /* o dt REAL entre desenhos, não um valor fixo: as animações de
       janela e as suavizações de hover dependem dele para durarem o
       que foram calibradas para durar */
    UI.begin(ctx, Math.max(0.0001, Math.min(0.1, dt || this._dtAcumulado || 1 / 30)));
    this._dtAcumulado = 0;

    /* fundo comum */
    ctx.fillStyle = C.surf0;
    ctx.fillRect(0, 0, surface.W, surface.H);

    switch (this._screen) {
      case 'boot':    this._drawBoot(surface); break;
      case 'login':   this._drawLogin(surface); break;
      case 'desktop': this._drawDesktop(surface); break;
      case 'over':    this._drawOver(surface); break;
    }

    /* toasts e sobreposições ficam acima de tudo */
    UI.flushOverlay();
    /* a faixa dos avisos acompanha a largura da tela: com 460 fixos
       a mensagem saía cortada com reticências justamente quando ela
       era a única coisa dizendo ao jogador o que fazer */
    const larguraAviso = Math.min(620, Math.max(380, Math.round(surface.W * 0.36)));
    Toasts.draw(UI.rect(surface.W - larguraAviso - SPACE.xl, TOPBAR_H + SPACE.md,
      larguraAviso, 400));

    /* O cursor NÃO é desenhado aqui de propósito. Desenhá-lo na
       superfície obrigava um redesenho completo a cada pixel de
       movimento do mouse — a causa principal de travamento. O cursor
       do sistema fica visível e cai exatamente sobre o elemento que o
       raycast atinge, porque os dois partem do mesmo ponto. */

    /* cortina de transição entre telas */
    if (this._fade < 1) {
      ctx.fillStyle = alpha('#000000', (1 - Ease.get('cubic.out')(this._fade)) * 0.9);
      ctx.fillRect(0, 0, surface.W, surface.H);
    }

    UI.end();
    Dirty.clear();
    surface.end();
  },

  _drawCursor() {
    const ctx = UI.ctx;
    const x = Math.round(UI.mx), y = Math.round(UI.my);
    ctx.save();
    /* seta simples, com contorno escuro para nunca sumir no fundo */
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 17);
    ctx.lineTo(x + 4.5, y + 12.8);
    ctx.lineTo(x + 7.6, y + 19.2);
    ctx.lineTo(x + 10.2, y + 18);
    ctx.lineTo(x + 7.1, y + 11.7);
    ctx.lineTo(x + 12.4, y + 11.4);
    ctx.closePath();
    ctx.fillStyle = C.textStrong;
    ctx.strokeStyle = alpha('#000000', 0.85);
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  },

  /* =========================================================
     TELA 1 — ARRANQUE
     ========================================================= */
  _drawBoot(s) {
    const ctx = UI.ctx;
    const x = SPACE.h3;
    let y = SPACE.h3 + 20;
    const lh = 26;

    const linhas = this._boot.lines;
    /* rolagem quando passa do fim da tela */
    const maxLinhas = Math.floor((s.H - SPACE.h3 * 2) / lh);
    const inicio = Math.max(0, linhas.length - maxLinhas);

    for (let i = inicio; i < linhas.length; i++) {
      const txt = linhas[i];
      const ultima = i === linhas.length - 1;
      let cor = C.ok;
      if (/OK$|LIMPO$|ATIVO/.test(txt)) cor = C.okBright;
      else if (/^UPLINK BIOS/.test(txt)) cor = C.cyanBright;
      else if (/^Copyright/.test(txt)) cor = C.textFaint;
      else if (/^ {2}/.test(txt)) cor = C.textDim;

      Text.draw(ctx, txt, x, y, FONT.boot, cor);

      /* cursor de bloco piscando no fim da última linha */
      if (ultima && !this._boot.done) {
        const w = Text.width(ctx, txt, FONT.boot);
        if ((this._t * 2.2) % 1 < 0.62) {
          UI.fill(x + w + 3, y - 12, 9, 15, C.okBright);
        }
      }
      y += lh;
    }

    /* detalhes que aparecem em momentos específicos do POST */
    const n = linhas.length;
    if (n > 5 && n < 8) {
      const mb = Math.min(65536, Math.floor((this._t % 3) * 46000) + 12000);
      Text.draw(ctx, mb.toLocaleString('pt-BR') + ' KB', x + 300, y - lh, FONT.boot, C.okBright);
    }

    /* rodapé */
    Text.draw(ctx, 'pressione qualquer tecla para pular',
      s.W / 2, s.H - SPACE.h2, FONT.dataSmall, alpha(C.textFaint, 0.55), 'center');

    /* pular */
    if (UI.pressed || UI.takeKeys().length) {
      this._boot.skip();
    }
  },

  /* =========================================================
     TELA 2 — AUTENTICAÇÃO
     ========================================================= */
  _drawLogin(s) {
    const ctx = UI.ctx;
    const st = this._login;

    /* --- fundo: grade em perspectiva, discreta --- */
    this._gradeFundo(s, 0.5);

    /* --- marca --- */
    const cx = s.W / 2;
    const topo = s.H * 0.185;

    const pulso = 0.5 + 0.5 * Math.sin(this._t * 1.1);
    Text.glow(ctx, 'UPLINK', cx, topo, FONT.hero, C.textStrong,
      alpha(C.glowCyan, 0.35 + pulso * 0.25), 26, 'center');
    Text.draw(ctx, 'C O R P O R A T I O N', cx, topo + 34, FONT.label, C.cyan, 'center');
    Text.draw(ctx, '" Trust Is A Weakness "', cx, topo + 62, FONT.bodySmall,
      alpha(C.textFaint, 0.8), 'center');

    /* --- caixa de autenticação --- */
    const cw = 520, ch = 300;
    const box = UI.rect(snapGrid(cx - cw / 2), snapGrid(topo + 108), cw, ch);

    UI.shadowOn({ color: C.shadow, blur: 40, y: 14 });
    UI.fillVGrad(box.x, box.y, box.w, box.h, C.panelTop, C.panelBottom);
    UI.shadowOff();
    UI.frameR(box, C.line2, 1);
    UI.hline(box.x + 1, box.y, box.w - 2, alpha(C.lineHi, 0.5));

    const head = UI.rect(box.x + 1, box.y + 1, box.w - 2, METRIC.headerH);
    UI.fillVGrad(head.x, head.y, head.w, head.h, C.headTop, C.headBottom);
    Text.center(ctx, 'AUTENTICAÇÃO NECESSÁRIA', head.x, head.y, head.w, head.h,
      FONT.panelTitle, C.textStrong);

    let r = UI.pad(UI.rect(box.x, box.y + METRIC.headerH + 2, box.w, box.h - METRIC.headerH - 2),
      SPACE.lg, SPACE.xl);

    /* mensagem de estado */
    const msgR = UI.stackTop(r, 34, SPACE.xs);
    Text.drawIn(ctx, st.msg, msgR.x, msgR.y, msgR.h, FONT.bodySmall,
      st.erro ? C.dangerBright : C.textDim, 'left');

    /* campo: handle */
    const l1 = UI.stackTop(r, 18, 2);
    Text.drawIn(ctx, 'IDENTIFICAÇÃO', l1.x, l1.y, l1.h, FONT.labelSmall, C.textFaint, 'left');
    const f1 = UI.stackTop(r, METRIC.fieldH, SPACE.sm);
    W.bind('login:handle', f1, st, 'handle', { maxLen: 16, placeholder: 'ex: ghost_in_wire' });

    /* campo: senha */
    const l2 = UI.stackTop(r, 18, 2);
    Text.drawIn(ctx, 'SENHA', l2.x, l2.y, l2.h, FONT.labelSmall, C.textFaint, 'left');
    const f2 = UI.stackTop(r, METRIC.fieldH, SPACE.lg);
    W.bind('login:pass', f2, st, 'pass', { maxLen: 24, password: true, placeholder: '••••••••' });

    /* botões */
    const bts = UI.stackTop(r, METRIC.btnH, 0);
    const b1 = UI.cutLeft(bts, Math.floor(bts.w / 2) - SPACE.xs);
    UI.cutLeft(bts, SPACE.md);
    const b2 = bts;

    if (W.button('login:novo', b1, 'NOVO AGENTE', { primary: true, font: FONT.buttonBig })) {
      this._novoAgente();
    }
    if (W.button('login:carregar', b2, 'CARREGAR', {
      font: FONT.buttonBig, disabled: !Game.hasSave()
    })) {
      this._carregar();
    }

    /* Enter em qualquer campo confirma */
    const teclas = UI.takeKeys();
    if (teclas.some(k => k.key === 'Enter')) this._novoAgente();

    /* --- rodapé --- */
    Text.draw(ctx, 'TODAS AS AÇÕES SÃO REGISTRADAS',
      cx, box.y + box.h + SPACE.xxl, FONT.labelSmall, alpha(C.textFaint, 0.6), 'center');
  },

  _novoAgente() {
    const st = this._login;
    const h = st.handle.trim();
    if (!h) { st.msg = 'Escolha uma identificação. Ela será a sua única identidade.'; st.erro = true; Dirty.mark(); return; }
    if (!/^[A-Za-z0-9_-]{2,16}$/.test(h)) {
      st.msg = 'Use de 2 a 16 caracteres: letras, números, _ ou -.';
      st.erro = true; Dirty.mark(); return;
    }
    st.msg = 'Gerando mundo...'; st.erro = false;
    Dirty.mark();
    /* deixa o quadro sair antes de travar gerando o mundo */
    Anim.delay(0.05, () => {
      Game.newGame(h);
      Bus.emit(EV.SFX, { name: 'connect' });
    });
  },

  _carregar() {
    if (Game.load()) Bus.emit(EV.UI_TOAST, { text: 'Sessão restaurada.', kind: 'ok' });
    else { this._login.msg = 'Save corrompido. Crie um novo agente.'; this._login.erro = true; Dirty.mark(); }
  },

  /* =========================================================
     TELA 3 — ÁREA DE TRABALHO
     ========================================================= */
  _drawDesktop(s) {
    const hud = this._hud || (this._hud = Game.hud());
    const ctx = UI.ctx;

    let tela = UI.rect(0, 0, s.W, s.H);
    const topo = UI.cutTop(tela, TOPBAR_H);
    const rodape = UI.cutBottom(tela, DOCK_H);
    const traceR = this._traceUI.ativo ? UI.cutBottom(tela, TRACE_H) : null;
    const lateral = UI.cutRight(tela, SIDE_W);
    const area = tela;                       /* onde as janelas vivem */

    /* --- papel de parede --- */
    this._papelDeParede(area, hud);

    /* --- janelas ---
       Nada de bloquear o que está por baixo: no toolkit o último
       `probe` do quadro vence, e a área de trabalho é desenhada ANTES
       das janelas. O bloqueio rodava depois delas e roubava o alvo de
       todo botão dentro de toda janela — nada era clicável. */
    Windows.draw(UI.pad(area, SPACE.sm, SPACE.sm), UI.dt);

    /* --- moldura --- */
    this._barraSuperior(topo, hud);
    this._colunaLateral(lateral, hud);
    this._dock(rodape, hud);
    if (traceR) this._barraTrace(traceR);

    /* --- atalhos --- */
    const teclas = UI.takeKeys();
    for (const k of teclas) {
      if (k.key === 'Escape' && hud.connected) Game.net.disconnect();
      else if (k.key === ' ') Game.togglePause();
    }
  },

  _papelDeParede(r, hud) {
    const ctx = UI.ctx;
    UI.fill(r.x, r.y, r.w, r.h, C.surf0);
    this._gradeFundo({ W: r.w, H: r.h, x: r.x, y: r.y }, 0.28, r);

    if (!Windows.list.length) {
      /* marca d'água central, só quando não há janela aberta */
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      Icon.logo(ctx, cx, cy - 40, 120, alpha(C.accent, 0.16));
      Text.draw(ctx, 'GATEWAY ONLINE', cx, cy + 68, FONT.sectionTitle,
        alpha(C.textFaint, 0.5), 'center');
      Text.draw(ctx, hud.ip, cx, cy + 96, FONT.data, alpha(C.textFaint, 0.4), 'center');
      Text.draw(ctx, 'abra um aplicativo na barra inferior para começar',
        cx, cy + 128, FONT.bodySmall, alpha(C.textFaint, 0.35), 'center');
    }
  },

  /* grade em perspectiva do fundo — a assinatura visual do Uplink */
  _gradeFundo(s, forca, rect) {
    const ctx = UI.ctx;
    const x0 = rect ? rect.x : 0, y0 = rect ? rect.y : 0;
    const w = rect ? rect.w : s.W, h = rect ? rect.h : s.H;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();

    /* brilho radial no centro */
    const g = ctx.createRadialGradient(x0 + w / 2, y0 + h * 0.42, 0, x0 + w / 2, y0 + h * 0.42, w * 0.62);
    g.addColorStop(0, alpha(C.accentDim, 0.30 * forca));
    g.addColorStop(0.55, alpha(C.panelBottom, 0.14 * forca));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);

    /* malha */
    ctx.strokeStyle = alpha(C.accent, 0.085 * forca);
    ctx.lineWidth = 1;
    const passo = 48;
    ctx.beginPath();
    for (let x = x0 + (w % passo) / 2; x < x0 + w; x += passo) {
      ctx.moveTo(Math.round(x) + 0.5, y0);
      ctx.lineTo(Math.round(x) + 0.5, y0 + h);
    }
    for (let y = y0 + (h % passo) / 2; y < y0 + h; y += passo) {
      ctx.moveTo(x0, Math.round(y) + 0.5);
      ctx.lineTo(x0 + w, Math.round(y) + 0.5);
    }
    ctx.stroke();

    ctx.restore();
  },

  /* ---------------------------------------------------------
     BARRA SUPERIOR
     --------------------------------------------------------- */
  _barraSuperior(r, hud) {
    const ctx = UI.ctx;
    UI.fillVGrad(r.x, r.y, r.w, r.h, C.surf1, C.panelBottom);
    UI.hline(r.x, r.y + r.h - 1, r.w, C.line2);
    UI.hline(r.x, r.y, r.w, alpha('#ffffff', 0.06));

    let x = SPACE.md;

    /* marca */
    Icon.logo(ctx, x + 14, r.y + r.h / 2, 24, C.cyan);
    x += 38;
    Text.drawIn(ctx, 'UPLINK', x, r.y, r.h, FONT.panelTitle, C.textStrong, 'left');
    x += 76;

    UI.vline(x, r.y + 9, r.h - 18, C.line2); x += SPACE.md;

    /* agente */
    Text.drawIn(ctx, hud.handle, x, r.y, r.h, FONT.dataStrong, C.cyanBright, 'left');
    x += Text.width(ctx, hud.handle, FONT.dataStrong) + SPACE.md;
    UI.vline(x, r.y + 9, r.h - 18, C.line2); x += SPACE.md;

    /* relógio: o campo mais lido da tela, então em mono e tabular */
    const relogio = hud.clock + '  ' + hud.date;
    Text.drawIn(ctx, relogio, x, r.y, r.h, FONT.data, C.text, 'left');
    x += Text.width(ctx, relogio, FONT.data) + SPACE.lg;

    /* --- indicadores, à direita --- */
    let rx = r.x + r.w - SPACE.md;

    /* controle de velocidade */
    const velW = 132;
    rx -= velW;
    this._controleVelocidade(UI.rect(rx, r.y + 8, velW, r.h - 16), hud);
    rx -= SPACE.md;
    UI.vline(rx, r.y + 9, r.h - 18, C.line2); rx -= SPACE.md;

    /* trio de números */
    const campos = [
      ['NEURO', hud.neuro, C.special],
      ['RATING', hud.rating, C.warnBright],
      ['CRÉDITOS', hud.creditsText, C.okBright]
    ];
    for (const [rot, val, cor] of campos) {
      const wv = Math.max(Text.width(ctx, val, FONT.dataStrong),
                          Text.width(ctx, rot, FONT.labelSmall));
      rx -= wv;
      Text.draw(ctx, rot, rx, r.y + 17, FONT.labelSmall, C.textFaint);
      Text.draw(ctx, val, rx, r.y + 33, FONT.dataStrong, cor);
      rx -= SPACE.lg;
    }
  },

  _controleVelocidade(r, hud) {
    const vels = [
      [0, 'pause'], [1, 'play'], [5, 'ffwd'], [20, 'ffwd']
    ];
    const bw = Math.floor(r.w / vels.length);
    vels.forEach(([v, ico], i) => {
      const b = UI.rect(r.x + i * bw, r.y, bw - 2, r.h);
      const ativo = hud.speed === v;
      const f = UI.hitRect('spd:' + v, b);
      const hv = UI.fade('spd:' + v + ':h', (f & HOVER) !== 0);

      UI.fill(b.x, b.y, b.w, b.h, ativo ? C.accent : alpha(C.btnFace, 0.6 + hv * 0.4));
      UI.frameR(b, ativo ? C.cyanBright : alpha(C.btnEdge, 0.7), 1);

      const cor = ativo ? C.textStrong : (hv > 0.4 ? C.btnTextHover : C.textDim);
      if (v === 20) {
        /* dois chevrons para o 20x, distinguindo do 5x */
        Icon.ffwd(UI.ctx, b.x + b.w / 2 - 4, b.y + b.h / 2, 8, cor);
        Icon.ffwd(UI.ctx, b.x + b.w / 2 + 5, b.y + b.h / 2, 8, cor);
      } else {
        Icon[ico](UI.ctx, b.x + b.w / 2, b.y + b.h / 2, 9, cor);
      }
      if (f & CLICK) { Game.setSpeed(v); UI.sfx('click'); }
    });
  },

  /* ---------------------------------------------------------
     COLUNA LATERAL — mapa e analisador de conexão
     --------------------------------------------------------- */
  _colunaLateral(r, hud) {
    UI.fill(r.x, r.y, r.w, r.h, C.surf1);
    UI.vline(r.x, r.y, r.h, C.line2);

    let col = UI.pad(r, SPACE.sm, SPACE.sm);

    /* --- mapa --- */
    const mapaH = 186;
    const mapaR = UI.stackTop(col, mapaH, SPACE.sm);
    this._miniMapa(mapaR, hud);

    /* --- botão de desconectar --- */
    const btnR = UI.stackTop(col, METRIC.btnH, SPACE.sm);
    if (hud.connected) {
      if (W.button('side:disc', btnR, 'DESCONECTAR', { danger: true, font: FONT.button })) {
        Game.net.disconnect();
      }
    } else {
      UI.fill(btnR.x, btnR.y, btnR.w, btnR.h, alpha(C.btnDisFace, 0.7));
      UI.frameR(btnR, C.btnDisEdge, 1);
      Text.center(UI.ctx, 'DESCONECTADO', btnR.x, btnR.y, btnR.w, btnR.h,
        FONT.button, C.btnDisText);
    }

    /* --- analisador de conexão --- */
    this._analisador(col, hud);
  },

  _miniMapa(r, hud) {
    const ctx = UI.ctx;
    if (!WorldMap.desenha(ctx, r, 'mini')) {
      UI.fillVGrad(r.x, r.y, r.w, r.h, '#071634', '#030a1c');
    }
    UI.frameR(r, C.line2, 1);

    /* a rota desenhada inclui o alvo como último ponto */
    const rv = Game.net.routeView();
    const world = Game.state.world;
    const rota = (rv.route || [])
      .concat(rv.target ? [rv.target] : [])
      .map(h => (world && world.servers[h.ip]) || null)
      .filter(Boolean);

    /* silhueta dos continentes: pontos numa grade, o jeito do original */
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); ctx.clip();

    if (world) {
      const salvos = new Set(Game.state.links);
      const servs = Object.values(world.servers);
      for (let i = 0; i < servs.length; i++) {
        const sv = servs[i];
        if (!sv.publicList && !salvos.has(sv.ip)) continue;
        const px = r.x + 2 + sv.x * (r.w - 4);
        const py = r.y + 2 + sv.y * (r.h - 4);
        const meu = salvos.has(sv.ip);
        UI.fill(Math.round(px), Math.round(py), meu ? 3 : 2, meu ? 3 : 2,
          alpha(meu ? C.cyanBright : C.accentBright, meu ? 0.85 : 0.32));
      }
    }

    /* a rota, ligando os saltos */
    if (rota.length) {
      ctx.strokeStyle = alpha(C.cyanBright, 0.85);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.lineDashOffset = -(this._t * 14) % 6;
      ctx.beginPath();
      rota.forEach((h, i) => {
        const px = r.x + 2 + h.x * (r.w - 4);
        const py = r.y + 2 + h.y * (r.h - 4);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      rota.forEach((h, i) => {
        const px = r.x + 2 + h.x * (r.w - 4);
        const py = r.y + 2 + h.y * (r.h - 4);
        const ultimo = i === rota.length - 1;
        UI.fill(Math.round(px) - 2, Math.round(py) - 2, 5, 5,
          ultimo ? C.dangerBright : C.cyanBright);
      });
    }
    ctx.restore();

    Text.draw(ctx, 'ROTA GLOBAL', r.x + SPACE.xs, r.y + 16, FONT.labelSmall,
      alpha(C.textFaint, 0.7));
  },

  _analisador(r, hud) {
    const ctx = UI.ctx;
    const inner = W.panel(r, 'ANALISADOR DE CONEXÃO', { padX: SPACE.sm, padY: SPACE.sm });

    if (!hud.connected) {
      Text.center(ctx, 'sem conexão ativa', inner.x, inner.y, inner.w, 60,
        FONT.bodySmall, C.textFaint);
      Text.center(ctx, 'monte uma rota em ROTA e conecte',
        inner.x, inner.y + 28, inner.w, 60, FONT.dataSmall, alpha(C.textFaint, 0.6));
      return;
    }

    /* topologia vertical: gateway → saltos → camadas → alvo */
    const nós = [];
    nós.push({ tipo: 'host', nome: 'Localhost', sub: hud.ip });
    (hud.route || []).forEach((ip, i) => {
      const sv = Game.state.world.servers[ip];
      nós.push({ tipo: 'hop', nome: 'Salto ' + (i + 1), sub: sv ? sv.name : ip });
    });

    const alvo = Game.state.world.servers[hud.target];
    if (alvo) {
      if (alvo.sec.proxy > 0) nós.push({ tipo: 'lock', nome: 'Proxy', nivel: alvo.sec.proxy, caiu: alvo.st.proxyDown });
      if (alvo.sec.firewall > 0) nós.push({ tipo: 'lock', nome: 'Firewall', nivel: alvo.sec.firewall, caiu: alvo.st.fwDown });
      if (alvo.sec.monitor > 0) nós.push({ tipo: 'lock', nome: 'Monitor', nivel: alvo.sec.monitor, caiu: alvo.st.monFooled });
      nós.push({ tipo: 'host', nome: alvo.name, sub: alvo.ip, alvo: true });
    }

    const passo = Math.min(56, Math.floor((inner.h - 10) / Math.max(1, nós.length)));
    let y = inner.y + 4;
    const cx = inner.x + 34;

    nós.forEach((nó, i) => {
      const revelado = clamp((this._connAnim * nós.length) - i, 0, 1);
      if (revelado <= 0) return;
      ctx.save();
      ctx.globalAlpha = revelado;

      /* linha pontilhada até o próximo */
      if (i < nós.length - 1) {
        ctx.strokeStyle = alpha(C.cyanDim, 0.7);
        ctx.setLineDash([2, 4]);
        ctx.lineDashOffset = -(this._t * 18) % 6;
        ctx.beginPath();
        ctx.moveTo(cx, y + 22);
        ctx.lineTo(cx, y + passo);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const cor = nó.alvo ? C.dangerBright
        : nó.tipo === 'lock' ? (nó.caiu ? C.ok : C.warnBright)
        : C.cyanBright;

      if (nó.tipo === 'lock') {
        /* losango, como no original */
        ctx.beginPath();
        ctx.moveTo(cx, y + 4); ctx.lineTo(cx + 11, y + 15);
        ctx.lineTo(cx, y + 26); ctx.lineTo(cx - 11, y + 15);
        ctx.closePath();
        ctx.fillStyle = alpha(cor, 0.22); ctx.fill();
        ctx.strokeStyle = cor; ctx.lineWidth = 1; ctx.stroke();
        Icon.lock(ctx, cx, y + 15, 8, cor);
        if (!nó.caiu) {
          /* moldura vermelha tracejada: barreira ativa */
          UI.dashFrame(cx - 16, y - 1, 32, 32, alpha(C.danger, 0.8), 3, 1);
        }
      } else {
        Icon.monitor(ctx, cx, y + 15, 15, cor);
      }

      const tx = cx + 24;
      Text.draw(ctx, nó.nome, tx, y + 13, FONT.label, nó.alvo ? C.dangerBright : C.text);
      const sub = nó.tipo === 'lock' ? ('nível ' + nó.nivel + (nó.caiu ? ' — vencido' : '')) : nó.sub;
      Text.drawFit(ctx, sub, tx, y + 26, inner.w - 24 - 34, FONT.dataSmall,
        nó.caiu ? C.ok : C.textFaint);

      ctx.restore();
      y += passo;
    });
  },

  /* ---------------------------------------------------------
     BARRA DE FERRAMENTAS
     --------------------------------------------------------- */
  _dock(r, hud) {
    const ctx = UI.ctx;
    UI.fillVGrad(r.x, r.y, r.w, r.h, C.surf1, C.surf0);
    UI.hline(r.x, r.y, r.w, C.line2);
    UI.hline(r.x, r.y + 1, r.w, alpha('#ffffff', 0.05));

    const bw = 92, gap = SPACE.xs;
    const total = APP_LIST.length * (bw + gap) - gap;
    let x = SPACE.lg;

    APP_LIST.forEach(app => {
      const b = UI.rect(x, r.y + 8, bw, r.h - 16);
      const aberto = Windows.isOpen(app.id);
      const f = UI.hitRect('dock:' + app.id, b);
      const hv = UI.fade('dock:' + app.id + ':h', (f & HOVER) !== 0);

      if (aberto || hv > 0.01) {
        UI.fill(b.x, b.y, b.w, b.h, alpha(aberto ? C.accent : C.btnFaceHover, aberto ? 0.34 : 0.22 * hv));
        UI.frameR(b, alpha(aberto ? C.cyan : C.btnEdgeHover, aberto ? 0.9 : 0.5 * hv), 1);
      }
      /* marcador de aplicativo aberto */
      if (aberto) UI.fill(b.x + b.w / 2 - 10, b.y + b.h - 3, 20, 2, C.cyanBright);

      const cor = aberto ? C.cyanBright : (hv > 0.4 ? C.textStrong : C.textDim);
      if (Icon[app.icon]) Icon[app.icon](ctx, b.x + b.w / 2, b.y + 22, 20, cor);
      Text.center(ctx, app.label, b.x, b.y + 36, b.w, 20, FONT.labelSmall, cor);

      /* contador de não lidos */
      if (app.badge) {
        const n = app.badge(hud);
        if (n > 0) W.badge(b.x + b.w - 14, b.y + 12, n, C.danger);
      }

      if (f & CLICK) {
        UI.sfx('click');
        if (!aberto) Apps.open(app.id);
        else if (Windows.isFocused(app.id)) Windows.close(app.id);
        else Windows.focus(app.id);
      }
      x += bw + gap;
    });

    /* --- lado direito: tarefas em execução --- */
    const tarefas = hud.tasks || [];
    if (tarefas.length) {
      const tw = 210;
      let tx = r.x + r.w - SPACE.lg - tw;
      const alturaLinha = 20;
      const topo = r.y + (r.h - Math.min(3, tarefas.length) * alturaLinha) / 2;
      tarefas.slice(0, 3).forEach((t, i) => {
        const ty = topo + i * alturaLinha;
        Text.draw(ctx, t.name, tx, ty + 12, FONT.dataSmall, C.textDim);
        const bar = UI.rect(tx + 118, ty + 5, 92, 8);
        W.progress(bar, t.pct, { color: C.cyanBright });
      });
      if (tarefas.length > 3) {
        Text.draw(ctx, '+' + (tarefas.length - 3) + ' em execução',
          tx, topo + 3 * alturaLinha + 12, FONT.dataSmall, C.textFaint);
      }
    } else {
      /* estado do gateway, quando não há nada rodando */
      const tx = r.x + r.w - SPACE.lg;
      Text.draw(ctx, 'CPU ' + hud.cpu + '  ·  MEM ' + hud.memory.free + '/' + hud.memory.total + ' Gq',
        tx, r.y + r.h / 2 + 4, FONT.dataSmall, C.textFaint, 'right');
    }
  },

  /* ---------------------------------------------------------
     BARRA DE TRACE
     A coisa mais importante da tela quando está visível.
     --------------------------------------------------------- */
  _barraTrace(r) {
    const ctx = UI.ctx;
    const t = this._traceUI;
    const p = clamp(t.pct / 100, 0, 1);

    /* o fundo pulsa mais rápido conforme o trace se aproxima */
    const freq = 1.6 + p * 7;
    const pulso = 0.5 + 0.5 * Math.sin(this._t * freq * Math.PI);
    const urgencia = p * p;

    UI.fillVGrad(r.x, r.y, r.w, r.h,
      alpha(C.danger, 0.16 + urgencia * 0.30 * (0.6 + pulso * 0.4)),
      alpha('#000000', 0.9));
    UI.hline(r.x, r.y, r.w, alpha(C.danger, 0.5 + urgencia * 0.5));

    const rot = 'TRACE ATIVO';
    Text.drawIn(ctx, rot, r.x + SPACE.md, r.y, r.h, FONT.label,
      p > 0.7 ? C.dangerBright : C.danger, 'left');
    const rotW = Text.width(ctx, rot, FONT.label);

    /* trilho */
    const trilho = UI.rect(r.x + SPACE.md + rotW + SPACE.md, r.y + 10,
      r.w - (SPACE.md * 3 + rotW) - 150, r.h - 20);
    UI.fill(trilho.x, trilho.y, trilho.w, trilho.h, alpha('#000000', 0.7));
    UI.frameR(trilho, alpha(C.danger, 0.6), 1);

    const cheio = Math.round((trilho.w - 2) * p);
    if (cheio > 0) {
      UI.fillVGrad(trilho.x + 1, trilho.y + 1, cheio, trilho.h - 2,
        C.dangerBright, C.dangerDim);
      /* cabeça luminosa da barra */
      UI.fill(trilho.x + cheio - 1, trilho.y + 1, 2, trilho.h - 2, '#ffffff');
    }

    /* marcas de 25% */
    for (let i = 1; i < 4; i++) {
      const mx = trilho.x + (trilho.w * i) / 4;
      UI.vline(Math.round(mx), trilho.y + 2, trilho.h - 4, alpha('#000000', 0.5));
    }

    /* tempo restante — só com Trace_Tracker v3+ mostra o número exato */
    const temTracker = Game.state.software.some(s => s.id === 'trace_tracker' && s.v >= 3);
    const texto = temTracker
      ? Math.ceil(t.remaining) + 's'
      : (p < 0.4 ? 'distante' : p < 0.75 ? 'aproximando' : 'IMINENTE');
    Text.drawIn(ctx, texto, r.x + r.w - SPACE.md, r.y, r.h, FONT.dataStrong,
      p > 0.7 ? C.dangerBright : C.warnBright, 'right');
  },

  /* =========================================================
     TELA 4 — FIM DE JOGO
     ========================================================= */
  _drawOver(s) {
    const ctx = UI.ctx;
    const o = this._over || { title: 'CONEXÃO ENCERRADA', text: '', kind: 'busted' };

    UI.fill(0, 0, s.W, s.H, C.surf0);
    this._gradeFundo(s, 0.35);

    const vitoria = /ending/.test(o.kind || '');
    const cor = vitoria ? C.cyanBright : C.dangerBright;

    const cx = s.W / 2;
    let y = s.H * 0.22;

    Text.glow(ctx, o.title, cx, y, FONT.hero, cor, alpha(vitoria ? C.glowCyan : C.glowRed, 0.5), 30, 'center');
    y += 56;
    UI.fill(cx - 180, y, 360, 1, alpha(cor, 0.5));
    y += SPACE.h2;

    /* corpo */
    const larg = Math.min(760, s.W * 0.6);
    const linhas = String(o.text || '').split('\n');
    linhas.forEach(linha => {
      if (!linha.trim()) { y += 16; return; }
      const quebradas = Text.wrap(ctx, linha, FONT.body, larg);
      quebradas.forEach(q => {
        Text.draw(ctx, q, cx, y, FONT.body, C.text, 'center');
        y += 26;
      });
    });

    y += SPACE.h2;

    /* ficha final */
    if (o.handle) {
      const fichas = [
        ['AGENTE', o.handle],
        ['RATING', o.rating || '—'],
        ['CONTRATOS', String(o.missions || 0)],
        ['CRÉDITOS', (o.credits || 0).toLocaleString('pt-BR') + 'c']
      ];
      const fw = 150;
      let fx = cx - (fichas.length * fw) / 2;
      fichas.forEach(([rot, val]) => {
        Text.draw(ctx, rot, fx + fw / 2, y, FONT.labelSmall, C.textFaint, 'center');
        Text.draw(ctx, val, fx + fw / 2, y + 24, FONT.dataBig, C.textStrong, 'center');
        fx += fw;
      });
      y += 64;
    }

    const b = UI.rect(cx - 110, y + SPACE.lg, 220, METRIC.btnH);
    if (W.button('over:restart', b, 'NOVA PARTIDA', { primary: true, font: FONT.buttonBig })) {
      Game.wipeSave();
      location.reload();
    }
  }
};

export default Shell;
