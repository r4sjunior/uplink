/* =========================================================
   surface.js — a "tela" lógica do jogo.

   CONTRATO CENTRAL DO PROJETO. Não mude assinaturas sem alinhar
   com todos os módulos.

   Toda a interface do jogo é desenhada em um canvas 2D de alta
   resolução (a Surface). Esse canvas vira uma textura aplicada
   na malha do monitor CRT dentro da cena 3D. Consequências:
     - o pós-processamento (bloom, distorção, aberração) age sobre
       a interface de verdade, não sobre um overlay falso;
     - o clique chega como coordenada de UV do raycast, convertida
       de volta para pixel lógico aqui.

   Sistema de coordenadas: SEMPRE em pixels lógicos (W x H).
   O oversampling (SS) é aplicado por transform no contexto — quem
   desenha nunca precisa saber que existe.
   ========================================================= */

export class Surface {
  /**
   * @param {number} w  largura lógica  (padrão 1920)
   * @param {number} h  altura lógica   (padrão 1080)
   * @param {number} ss supersampling   (1 = nativo, 2 = 4x pixels)
   */
  constructor(w = 1920, h = 1080, ss = 1.5) {
    this.W = w;
    this.H = h;
    this.ss = ss;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * ss);
    this.canvas.height = Math.round(h * ss);
    this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.ctx.textBaseline = 'alphabetic';
    this._dirty = true;
    this._version = 0;
  }

  /** Prepara o contexto para um frame: reseta transform e aplica o SS. */
  begin() {
    const c = this.ctx;
    c.setTransform(this.ss, 0, 0, this.ss, 0, 0);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    return c;
  }

  end() { this._dirty = false; this._version++; }

  /** Pede um novo desenho no próximo frame. */
  invalidate() { this._dirty = true; }
  get dirty() { return this._dirty; }
  get version() { return this._version; }

  /** UV do raycast (0..1, origem no canto inferior-esquerdo do plano) -> pixel lógico. */
  uvToPixel(u, v) { return { x: u * this.W, y: (1 - v) * this.H }; }

  /** Pixel lógico -> UV. */
  pixelToUv(x, y) { return { u: x / this.W, v: 1 - y / this.H }; }
}

/* --------------------------------------------------------
   Roteamento de entrada.
   A camada 3D (gfx/screen.js) faz o raycast e chama Input.feed().
   A UI (ui/toolkit.js) registra os handlers com Input.route().
   -------------------------------------------------------- */
export const Input = {
  /* estado atual do ponteiro em pixels lógicos */
  x: 0, y: 0, down: false, inside: false,
  _handlers: { move: [], down: [], up: [], click: [], wheel: [], key: [], leave: [] },

  route(type, fn) {
    if (!this._handlers[type]) throw new Error('Input: tipo desconhecido "' + type + '"');
    this._handlers[type].push(fn);
    return () => {
      const a = this._handlers[type];
      const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
    };
  },

  /** @param {{type:string,x?:number,y?:number,button?:number,dy?:number,key?:string,ev?:Event}} e */
  feed(e) {
    if (e.x !== undefined) { this.x = e.x; this.y = e.y; }
    if (e.type === 'down') this.down = true;
    if (e.type === 'up') this.down = false;
    if (e.type === 'leave') this.inside = false;
    if (e.type === 'move') this.inside = true;
    const hs = this._handlers[e.type];
    if (hs) for (let i = hs.length - 1; i >= 0; i--) {
      /* handlers retornam true para consumir o evento (topo da pilha ganha) */
      if (hs[i](e) === true) return true;
    }
    return false;
  },

  reset() { for (const k in this._handlers) this._handlers[k].length = 0; }
};
