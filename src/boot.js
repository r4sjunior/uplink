/* =========================================================
   boot.js — orquestrador. Liga simulação, interface, gráficos
   e áudio; roda o laço principal. Não contém regra de jogo
   nem desenho: só fiação e tempo.
   ========================================================= */
import { CFG } from './config.js';
import { Bus, EV } from './core/bus.js';
import { Surface } from './ui/surface.js';
import { Stage } from './gfx/stage.js';
import { Shell } from './ui/shell.js';
import { Game } from './core/game.js';
import { Audio } from './audio/engine.js';
import { PerfHUD } from './ui/perfhud.js';

const surface = new Surface(CFG.ui.width, CFG.ui.height, CFG.ui.ss);

/* --------- métricas expostas ao harness de QA ---------
   Separadas por etapa porque as três têm custos muito diferentes e
   é fácil culpar a errada: desenhar a interface é trabalho de CPU no
   canvas 2D, enviar a textura é banda de GPU, e renderizar a cena com
   pós-processamento é preenchimento. Sem separar, otimiza-se no
   escuro. */
const perf = {
  fps: 0, ms: 0, calls: 0, tris: 0, redraws: 0,
  uiMs: 0, texMs: 0, cenaMs: 0, simMs: 0,
  _uiAcc: 0, _texAcc: 0, _cenaAcc: 0, _simAcc: 0, _n: 0
};
window.__UPLINK_STATS = () => ({
  fps: Math.round(perf.fps),
  frameMs: +perf.ms.toFixed(2),
  simMs: +perf.simMs.toFixed(2),
  uiDrawMs: +perf.uiMs.toFixed(2),
  texUploadMs: +perf.texMs.toFixed(2),
  cenaMs: +perf.cenaMs.toFixed(2),
  drawCalls: perf.calls,
  triangles: perf.tris,
  uiRedraws: perf.redraws,
  surface: surface.canvas.width + 'x' + surface.canvas.height,
  tier: CFG.tier,
  qualidade: CFG.qualidade || 'auto',
  screen: Shell.currentScreen ? Shell.currentScreen() : '?'
});
window.__UPLINK = { CFG, Bus, EV, surface, Stage, Shell, Game, Audio, PerfHUD, perf };

/* --------- laço --------- */
let last = performance.now();
let acc = 0;
let fpsAcc = 0, fpsFrames = 0;
/* o passo de redesenho é lido a cada quadro: o menu de qualidade
   muda CFG.ui.maxRedrawHz ao vivo e precisa ter efeito na hora */
let redrawAcc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const t0 = now;
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;          /* aba voltou do background */

  /* 1. simulação (tempo de jogo, tem sua própria escala interna) */
  let t = performance.now();
  Game.tick(dt);
  perf._simAcc += performance.now() - t;

  /* 2. animações de interface + redesenho controlado */
  Shell.update(dt);
  redrawAcc += dt;
  const passo = 1 / CFG.ui.maxRedrawHz;
  if (surface.dirty && redrawAcc >= passo) {
    redrawAcc = 0;
    t = performance.now();
    Shell.draw(surface);
    perf._uiAcc += performance.now() - t;
    t = performance.now();
    Stage.markSurfaceUpdated();
    perf._texAcc += performance.now() - t;
    perf.redraws++;
  }

  /* 3. áudio e 3D */
  Audio.update(dt);
  PerfHUD.update(dt);
  t = performance.now();
  Stage.render(dt, now / 1000);
  perf._cenaAcc += performance.now() - t;

  /* 4. métricas: médias sobre meio segundo, para o número não dançar */
  perf.ms = performance.now() - t0;
  perf._n++;
  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.5) {
    perf.fps = fpsFrames / fpsAcc;
    const n = Math.max(1, perf._n);
    perf.uiMs = perf._uiAcc / n;
    perf.texMs = perf._texAcc / n;
    perf.cenaMs = perf._cenaAcc / n;
    perf.simMs = perf._simAcc / n;
    perf._uiAcc = perf._texAcc = perf._cenaAcc = perf._simAcc = 0;
    perf._n = 0;
    fpsAcc = 0; fpsFrames = 0;
  }
  const info = Stage.renderer && Stage.renderer.info;
  if (info) { perf.calls = info.render.calls; perf.tris = info.render.triangles; }
}

/* --------- arranque --------- */
async function main() {
  const host = document.getElementById('stage');

  await Game.init();                       /* mundo, save, dados */
  await Stage.init({ surface, host });     /* renderer, cena, monitor */
  await Shell.init({ surface });           /* interface */
  await Audio.init();                      /* som */
  PerfHUD.init();                          /* diagnóstico e qualidade (F1) */

  window.addEventListener('resize', () => Stage.resize());
  Stage.resize();

  /* primeiro desenho garantido */
  Shell.draw(surface);
  Stage.markSurfaceUpdated();

  requestAnimationFrame(frame);

  /* o harness de QA espera por isto */
  const ready = () => {
    document.body.classList.add('ready');
    const l = document.getElementById('preload');
    if (l) l.classList.add('gone');
    window.__UPLINK_READY = true;
  };
  /* dois frames para o primeiro render de verdade sair */
  requestAnimationFrame(() => requestAnimationFrame(ready));
}

main().catch(err => {
  console.error('[boot] falha fatal:', err);
  const p = document.getElementById('preload');
  if (p) p.innerHTML = '<pre style="color:#ff5a5a;padding:2rem;white-space:pre-wrap;font:12px monospace">' +
    'FALHA NA INICIALIZAÇÃO\n\n' + (err && err.stack ? err.stack : err) + '</pre>';
  window.__UPLINK_READY = true;   /* deixa o QA capturar o erro em vez de estourar timeout */
});
