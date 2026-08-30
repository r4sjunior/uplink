/* =========================================================
   perfhud.js — diagnóstico e qualidade.

   Fica fora do canvas da interface de propósito: é uma camada HTML
   por cima da cena. Se ele fosse desenhado na Surface, medir o
   desempenho mudaria o desempenho — o painel forçaria um redesenho
   a cada quadro, que é exatamente o custo que ele existe para medir.

   F1 abre e fecha. A escolha de qualidade fica salva.
   ========================================================= */
import { CFG, aplicaQualidade } from '../config.js';

const NIVEIS = [
  ['baixa', 'BAIXA', 'sem sombra, sem grão, metade da resolução'],
  ['media', 'MÉDIA', 'sombras e grão, resolução moderada'],
  ['alta', 'ALTA', 'tudo ligado, resolução cheia']
];

export const PerfHUD = {
  el: null,
  visivel: false,
  _t: 0,

  init() {
    const el = document.createElement('div');
    el.id = 'perfhud';
    el.innerHTML = `
      <div class="ph-linha ph-fps"><b id="ph-fps">—</b><span>fps</span></div>
      <table id="ph-tab"></table>
      <div class="ph-sep"></div>
      <div class="ph-tit">QUALIDADE</div>
      <div class="ph-btns">${NIVEIS.map(([id, rot]) =>
        `<button data-q="${id}">${rot}</button>`).join('')}</div>
      <div class="ph-dica" id="ph-dica"></div>
      <div class="ph-sep"></div>
      <div class="ph-tit">APRESENTAÇÃO</div>
      <div class="ph-btns">
        <button data-modo="plano">PLANO</button>
        <button data-modo="plano-crt">PLANO + CRT</button>
        <button data-modo="crt">TUBO 3D</button>
      </div>
      <div class="ph-dica" id="ph-dica-modo"></div>
      <div class="ph-sep"></div>
      <div class="ph-tit">SOM</div>
      <div class="ph-btns"><button data-som="toggle">MUDO</button></div>
      <div class="ph-rodape">F1 fecha este painel</div>`;
    document.body.appendChild(el);
    this.el = el;

    el.addEventListener('click', e => {
      const q = e.target.getAttribute && e.target.getAttribute('data-q');
      if (q) {
        aplicaQualidade(q);
        try { localStorage.setItem('uplink3d.qualidade', q); } catch (err) {}
        this._marcaAtivo();
        this._aplica();
      }
      const m = e.target.getAttribute && e.target.getAttribute('data-modo');
      if (m) {
        const leve = m === 'plano-crt';
        const alvo = m === 'crt' ? 'crt' : 'plano';
        document.body.classList.toggle('crt-leve', leve);
        try {
          localStorage.setItem('uplink3d.modo', alvo);
          localStorage.setItem('uplink3d.crtleve', leve ? '1' : '0');
        } catch (err) {}
        this._marcaModo();
        /* trocar para o tubo 3D exige recarregar: o three.js e a
           cadeia de pós-processamento nem foram baixados no modo plano */
        if (alvo !== CFG.render.modo) location.reload();
      }

      if (e.target.getAttribute && e.target.getAttribute('data-som')) {
        const A = window.__UPLINK && window.__UPLINK.Audio;
        if (A && A.toggleMute) {
          const mudo = A.toggleMute();
          e.target.textContent = mudo ? 'SEM SOM' : 'MUDO';
          e.target.classList.toggle('on', mudo);
        }
      }
    });

    window.addEventListener('keydown', e => {
      if (e.key === 'F1') { e.preventDefault(); this.alterna(); }
    });

    this._marcaAtivo();
    this._marcaModo();
    this.mostra(false);
  },

  _marcaModo() {
    if (!this.el) return;
    let leve = false;
    try { leve = localStorage.getItem('uplink3d.crtleve') === '1'; } catch (e) {}
    const atual = CFG.render.modo === 'crt' ? 'crt' : (leve ? 'plano-crt' : 'plano');
    this.el.querySelectorAll('[data-modo]').forEach(b => {
      b.classList.toggle('on', b.getAttribute('data-modo') === atual);
    });
    const d = this.el.querySelector('#ph-dica-modo');
    d.textContent = atual === 'crt'
      ? 'monitor 3D com pós-processamento — o mais caro'
      : atual === 'plano-crt'
        ? 'linhas de varredura e vinheta por CSS, sem custo por quadro'
        : 'interface direta, sem WebGL — o mais rápido';
  },

  /* Propaga a mudança de perfil para quem guarda estado derivado:
     a superfície (tamanho do canvas), o toolkit e o medidor de texto
     (fator de supersampling) e o palco (teto de resolução). */
  _aplica() {
    const U = window.__UPLINK;
    if (!U) return;
    if (U.surface && U.surface.setSupersample(CFG.ui.ss)) {
      Promise.all([import('./toolkit.js'), import('./text.js')]).then(([tk, tx]) => {
        tk.UI.ss = U.surface.ss;
        tx.Text.setSupersample(U.surface.ss);
        U.surface.invalidate();
      });
    }
    if (U.Stage) U.Stage.resize();
    if (U.surface) U.surface.invalidate();
  },

  _marcaAtivo() {
    if (!this.el) return;
    const atual = CFG.qualidade || 'auto';
    this.el.querySelectorAll('[data-q]').forEach(b => {
      b.classList.toggle('on', b.getAttribute('data-q') === atual);
    });
    const dica = this.el.querySelector('#ph-dica');
    const n = NIVEIS.find(x => x[0] === atual);
    dica.textContent = n ? n[2] : 'detectado automaticamente: ' + CFG.tier;
  },

  alterna() { this.mostra(!this.visivel); },

  mostra(on) {
    this.visivel = on;
    if (this.el) this.el.classList.toggle('aberto', on);
  },

  /** Chamado pelo laço principal. Só atualiza o texto quando aberto. */
  update(dt) {
    if (!this.visivel || !this.el) return;
    this._t += dt;
    if (this._t < 0.25) return;
    this._t = 0;

    const s = window.__UPLINK_STATS ? window.__UPLINK_STATS() : null;
    if (!s) return;

    const fps = this.el.querySelector('#ph-fps');
    fps.textContent = s.fps;
    fps.className = s.fps >= 50 ? 'bom' : s.fps >= 30 ? 'medio' : 'ruim';

    const linhas = [
      ['quadro', s.frameMs + ' ms'],
      ['  simulação', s.simMs + ' ms'],
      ['  interface', s.uiDrawMs + ' ms'],
      ['  textura', s.texUploadMs + ' ms'],
      ['  cena + pós', s.cenaMs + ' ms'],
      ['chamadas', s.drawCalls],
      ['triângulos', s.triangles.toLocaleString('pt-BR')],
      ['redesenhos', s.uiRedraws],
      ['superfície', s.surface],
      ['tier', s.tier]
    ];
    this.el.querySelector('#ph-tab').innerHTML =
      linhas.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  }
};

export default PerfHUD;
