/* =========================================================
   flat.js — apresentação direta, sem tubo.

   Implementa o mesmo contrato de `stage.js`, mas sem WebGL nenhum:
   o canvas da interface entra direto no documento e o navegador o
   compõe. O custo por quadro cai a praticamente zero.

   Por que isso é tão mais barato que o caminho 3D:
     - não há envio de textura para a GPU. No modo CRT, cada
       redesenho copiava o canvas inteiro para uma textura;
     - não há cena, sombra ou mapa de ambiente para renderizar;
     - não há passagens de tela cheia de pós-processamento;
     - a superfície é dimensionada em 1:1 com a janela, então o
       texto cai exatamente sobre os pixels do monitor — fica mais
       nítido do que era dentro do tubo, e não mais borrado.

   O sabor de CRT continua disponível, mas por CSS: linhas de
   varredura, vinheta e um brilho de vidro desenhados uma vez pelo
   compositor do navegador, sem custo por quadro.
   ========================================================= */
import { CFG } from '../config.js';
import { Bus, EV } from '../core/bus.js';
import { Input } from '../ui/surface.js';

/* Teto de pixels da superfície. Acima disso o desenho da interface
   (que é trabalho de CPU no canvas 2D) começa a pesar mais que
   qualquer coisa que a tela ganhe em nitidez. */
const MAX_PIXELS = 3.4e6;

export const Stage = {
  renderer: null, scene: null, camera: null,
  _surface: null, _host: null, _pronto: false,
  modo: 'plano',

  async init({ surface, host }) {
    this._surface = surface;
    this._host = host;

    const c = surface.canvas;
    c.id = 'tela';
    host.appendChild(c);

    this._aplicaTamanho();
    this._wireInput();
    this._pronto = true;

    Bus.emit(EV.BOOT_DONE, {});
  },

  /* =========================================================
     TAMANHO
     A superfície acompanha a janela em 1:1 (respeitado o teto).
     ========================================================= */
  _aplicaTamanho() {
    const w = Math.max(320, innerWidth);
    const h = Math.max(240, innerHeight);

    /* densidade: o mínimo entre a do dispositivo, o teto de
       qualidade e o que cabe no orçamento de pixels */
    let d = Math.min(devicePixelRatio || 1, CFG.gfx.maxPixelRatio);
    if (w * h * d * d > MAX_PIXELS) d = Math.sqrt(MAX_PIXELS / (w * h));
    d = Math.max(0.75, d);

    const mudou = this._surface.setSize(w, h, d);
    /* CSS em pixels lógicos; o canvas em pixels do dispositivo */
    const c = this._surface.canvas;
    c.style.width = w + 'px';
    c.style.height = h + 'px';

    if (mudou) {
      Bus.emit(EV.UI_RESIZE, { w, h, ss: d });
      this._surface.invalidate();
    }
    return mudou;
  },

  /* =========================================================
     ENTRADA
     Sem raycast: a coordenada do ponteiro JÁ é a coordenada da
     interface. É por isso que o modo plano também responde melhor.
     ========================================================= */
  _wireInput() {
    const c = this._surface.canvas;
    c.style.touchAction = 'none';

    const ponto = (ev) => {
      const r = c.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };

    c.addEventListener('pointermove', e => {
      const p = ponto(e);
      Input.feed({ type: 'move', x: p.x, y: p.y, ev: e });
    });
    c.addEventListener('pointerdown', e => {
      const p = ponto(e);
      c.setPointerCapture(e.pointerId);
      Input.feed({ type: 'down', x: p.x, y: p.y, button: e.button, ev: e });
    });
    c.addEventListener('pointerup', e => {
      const p = ponto(e);
      Input.feed({ type: 'up', x: p.x, y: p.y, button: e.button, ev: e });
      Input.feed({ type: 'click', x: p.x, y: p.y, button: e.button, ev: e });
      try { c.releasePointerCapture(e.pointerId); } catch (err) { /* já solto */ }
    });
    c.addEventListener('pointerleave', () => Input.feed({ type: 'leave' }));
    c.addEventListener('wheel', e => {
      const p = ponto(e);
      e.preventDefault();
      Input.feed({ type: 'wheel', x: p.x, y: p.y, dy: e.deltaY, ev: e });
    }, { passive: false });
    c.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('keydown', e => {
      const consumiu = Input.feed({ type: 'key', key: e.key, ev: e });
      if (consumiu || ['Tab', ' ', 'Backspace', "'", '/'].includes(e.key)) e.preventDefault();
    });
  },

  /* O canvas está no documento: o navegador compõe sozinho.
     Não há nada a enviar para lugar nenhum. */
  markSurfaceUpdated() { },

  resize() { this._aplicaTamanho(); },

  /* Nada por quadro. Este é o ponto. */
  render() { },

  dispose() {
    const c = this._surface && this._surface.canvas;
    if (c && c.parentNode) c.parentNode.removeChild(c);
  }
};

export default Stage;
