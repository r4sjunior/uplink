/* =========================================================
   stage.js — o palco.

   Monta o renderer, a cena, o monitor, a sala, a luz, a câmera e o
   pós-processamento; roteia o ponteiro para a interface; e enquadra
   a tela no viewport.

   Sobre o enquadramento: a tela do CRT tem 46 cm e o jogo é de ler
   texto. A câmera se aproxima até a tela caber com uma margem que
   deixa o bisel visível — o suficiente para o jogador saber que
   está olhando um objeto, sem sacrificar a legibilidade. Em telas
   estreitas a margem encolhe; em telas largas o excedente vira sala.
   ========================================================= */
import * as THREE from 'three';
import { CFG } from '../config.js';
import { Bus, EV } from '../core/bus.js';
import { Input } from '../ui/surface.js';
import { SCREEN } from './screen.js';
import { buildMonitor } from './monitor.js';
import { buildRoom } from './room.js';
import { buildLighting } from './lighting.js';
import { buildCamera, PRESETS } from './camera.js';
import { buildEnvironment } from './env.js';
import { applyEnvironment } from './materials.js';
import { setAnisotropy } from './textures.js';
import { Post } from './post/pipeline.js';

/* Margem em volta da ÁREA DE IMAGEM, como fração dela.
   Enquadramos pela imagem e não pelo bisel: o jogo é de ler texto, e
   enquadrar pelo bisel jogava a interface para 75% da altura útil,
   encolhendo a tipografia em quase um quarto. Assim o bisel aparece
   como uma moldura fina — suficiente para lembrar que é um objeto —
   e o texto fica no tamanho em que foi desenhado. */
const MARGEM = 0.085;

export const Stage = {
  renderer: null, scene: null, camera: null, rig: null,
  monitor: null, screenMesh: null, room: null, lights: null, post: null,
  _surface: null, _host: null,
  _ray: new THREE.Raycaster(), _ndc: new THREE.Vector2(),
  _elapsed: 0, _pronto: false,

  /* =========================================================
     ARRANQUE
     ========================================================= */
  async init({ surface, host }) {
    this._surface = surface;
    this._host = host;

    /* ---------- renderer ---------- */
    const renderer = new THREE.WebGLRenderer({
      antialias: !CFG.post.enabled,      /* com composer, o AA é um passe */
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      depth: true,
      /* o amostrador de cor da interface lê pixels do canvas */
      preserveDrawingBuffer: false
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, CFG.gfx.maxPixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = CFG.gfx.shadows;
    renderer.shadowMap.type = CFG.tier === 'high'
      ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.info.autoReset = true;
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    setAnisotropy(renderer.capabilities.getMaxAnisotropy());

    /* ---------- cena ---------- */
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060a);
    /* névoa levíssima: separa a parede do primeiro plano */
    scene.fog = new THREE.FogExp2(0x04060a, 0.34);
    this.scene = scene;

    /* ---------- ambiente ---------- */
    const envMap = buildEnvironment(renderer);
    scene.environment = envMap;
    this._envMap = envMap;

    /* ---------- monitor (constrói a tela por dentro) ---------- */
    this.monitor = buildMonitor({ surface, renderer });
    scene.add(this.monitor.group);
    this.screenMesh = this.monitor.screen.image;

    /* ---------- sala ---------- */
    this.room = buildRoom({ scene, monitor: this.monitor });

    /* ---------- luz ---------- */
    this.lights = buildLighting({ scene, monitor: this.monitor });

    applyEnvironment(scene, envMap, 1.0);

    /* ---------- câmera ---------- */
    const aspect = (innerWidth || 1600) / (innerHeight || 900);
    this.rig = buildCamera({ aspect });
    this.camera = this.rig.camera;
    /* a câmera precisa enxergar as duas camadas: a comum e a que
       recebe a luz da tela (ver lighting.js) */
    this.camera.layers.enable(1);
    scene.add(this.camera);

    /* ---------- pós-processamento ---------- */
    this.post = await Post.build({
      renderer, scene, camera: this.camera,
      width: innerWidth, height: innerHeight
    });

    this._wireInput();
    this.resize();
    this._pronto = true;
  },

  /* =========================================================
     ENTRADA
     O raycast bate na malha CURVA da imagem. Como os UVs dela são
     uniformes (ver screen.js), a UV devolvida mapeia direto para o
     pixel lógico da Surface — a curvatura não desalinha o clique.
     ========================================================= */
  _wireInput() {
    const dom = this.renderer.domElement;
    dom.style.touchAction = 'none';

    const paraSurface = (ev) => {
      const r = dom.getBoundingClientRect();
      const nx = ((ev.clientX - r.left) / r.width) * 2 - 1;
      const ny = -((ev.clientY - r.top) / r.height) * 2 + 1;
      this._ndc.set(nx, ny);
      /* alimenta a paralaxe da câmera com a posição do ponteiro */
      this.rig.pointer(nx, ny);

      this._ray.setFromCamera(this._ndc, this.camera);
      const hit = this._ray.intersectObject(this.screenMesh, false)[0];
      if (!hit || !hit.uv) return null;
      return this._surface.uvToPixel(hit.uv.x, hit.uv.y);
    };

    dom.addEventListener('pointermove', e => {
      const p = paraSurface(e);
      Input.feed(p ? { type: 'move', x: p.x, y: p.y, ev: e } : { type: 'leave' });
      dom.style.cursor = p ? 'none' : 'default';   /* dentro da tela, o cursor é desenhado pela UI */
    });

    dom.addEventListener('pointerdown', e => {
      const p = paraSurface(e);
      if (p) { dom.setPointerCapture(e.pointerId); Input.feed({ type: 'down', x: p.x, y: p.y, button: e.button, ev: e }); }
    });

    dom.addEventListener('pointerup', e => {
      const p = paraSurface(e);
      if (p) {
        Input.feed({ type: 'up', x: p.x, y: p.y, button: e.button, ev: e });
        Input.feed({ type: 'click', x: p.x, y: p.y, button: e.button, ev: e });
      }
      try { dom.releasePointerCapture(e.pointerId); } catch (err) { /* já solto */ }
    });

    dom.addEventListener('pointerleave', () => Input.feed({ type: 'leave' }));

    dom.addEventListener('wheel', e => {
      const p = paraSurface(e);
      if (p) { e.preventDefault(); Input.feed({ type: 'wheel', x: p.x, y: p.y, dy: e.deltaY, ev: e }); }
    }, { passive: false });

    dom.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('keydown', e => {
      const consumiu = Input.feed({ type: 'key', key: e.key, ev: e });
      /* teclas que o navegador rouba e o jogo precisa */
      if (consumiu || ['Tab', ' ', 'Backspace', "'", '/'].includes(e.key)) e.preventDefault();
    });
  },

  /** A textura da interface mudou. */
  markSurfaceUpdated() {
    if (this.monitor) this.monitor.screen.markUpdated();
  },

  /* =========================================================
     ENQUADRAMENTO
     ========================================================= */
  resize() {
    if (!this.renderer) return;
    const w = Math.max(1, innerWidth);
    const h = Math.max(1, innerHeight);

    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, CFG.gfx.maxPixelRatio));
    this.renderer.setSize(w, h, false);
    this.rig.setAspect(w / h);
    if (this.post) this.post.setSize(w, h);

    /* Distância que faz o bisel caber no viewport, considerando os
       dois eixos: quem for mais apertado manda. */
    const cam = this.camera;
    const vfov = (cam.fov * Math.PI) / 180;
    const alvoH = SCREEN.IMG_H * (1 + MARGEM * 2);
    const alvoW = SCREEN.IMG_W * (1 + MARGEM * 2);
    const distH = (alvoH / 2) / Math.tan(vfov / 2);
    const distW = (alvoW / 2) / Math.tan(vfov / 2) / cam.aspect;
    const dist = Math.max(distH, distW);

    /* atualiza os presets frontais para a distância calculada;
       os cinematográficos ficam como estão */
    const frontais = ['work', 'connect'];
    frontais.forEach(nome => {
      const p = PRESETS[nome];
      if (p) p.pos[2] = dist * (nome === 'connect' ? 0.955 : 1.0) + SCREEN.FRONT_Z;
    });
    /* se já estamos num preset frontal, aplica sem transição */
    if (frontais.includes(this.rig.preset)) this.rig.go(this.rig.preset, 0.001);
  },

  /* =========================================================
     QUADRO
     ========================================================= */
  render(dt, elapsed) {
    if (!this._pronto) return;
    this._elapsed = elapsed;

    this.rig.update(dt, elapsed);
    this.lights.update(dt, this.monitor.screen);
    this.room.update(dt, elapsed);

    if (this.post && this.post.enabled) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);
  },

  dispose() {
    if (this.post) this.post.dispose();
    if (this.lights) this.lights.dispose();
    if (this.room) this.room.dispose();
    if (this.monitor) this.monitor.dispose();
    if (this._envMap) this._envMap.dispose();
    if (this.renderer) this.renderer.dispose();
  }
};
