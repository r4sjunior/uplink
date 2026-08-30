/* =========================================================
   stage.js — ESQUELETO (será substituído pelo agente de render).
   Contrato público, não mude as assinaturas:
     Stage.init({surface, host})   async
     Stage.resize()
     Stage.render(dt, elapsed)
     Stage.markSurfaceUpdated()
     Stage.renderer / .scene / .camera
   ========================================================= */
import * as THREE from 'three';
import { CFG } from '../config.js';
import { Bus, EV } from '../core/bus.js';
import { Input } from '../ui/surface.js';

export const Stage = {
  renderer: null, scene: null, camera: null, screenMesh: null,
  _tex: null, _surface: null, _host: null, _ray: new THREE.Raycaster(),
  _ndc: new THREE.Vector2(),

  async init({ surface, host }) {
    this._surface = surface;
    this._host = host;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, CFG.gfx.maxPixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04070a);
    this.camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.01, 100);
    this.camera.position.set(0, 0, 1.42);

    const tex = new THREE.CanvasTexture(surface.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    this._tex = tex;

    const geo = new THREE.PlaneGeometry(1.6, 0.9, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    this.screenMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.screenMesh);

    this._wireInput();
  },

  _wireInput() {
    const dom = this.renderer.domElement;
    const toSurface = (ev) => {
      const r = dom.getBoundingClientRect();
      this._ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      this._ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      this._ray.setFromCamera(this._ndc, this.camera);
      const hit = this._ray.intersectObject(this.screenMesh, false)[0];
      if (!hit || !hit.uv) return null;
      return this._surface.uvToPixel(hit.uv.x, hit.uv.y);
    };
    dom.addEventListener('pointermove', e => {
      const p = toSurface(e);
      Input.feed(p ? { type: 'move', ...p, ev: e } : { type: 'leave' });
    });
    dom.addEventListener('pointerdown', e => {
      const p = toSurface(e); if (p) Input.feed({ type: 'down', ...p, button: e.button, ev: e });
    });
    dom.addEventListener('pointerup', e => {
      const p = toSurface(e); if (p) { Input.feed({ type: 'up', ...p, button: e.button, ev: e }); Input.feed({ type: 'click', ...p, button: e.button, ev: e }); }
    });
    dom.addEventListener('wheel', e => {
      const p = toSurface(e); if (p) { e.preventDefault(); Input.feed({ type: 'wheel', ...p, dy: e.deltaY, ev: e }); }
    }, { passive: false });
    window.addEventListener('keydown', e => Input.feed({ type: 'key', key: e.key, ev: e }));
  },

  markSurfaceUpdated() { if (this._tex) this._tex.needsUpdate = true; },

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    /* enquadra a tela do monitor no viewport */
    const dist = (0.9 / 2) / Math.tan((this.camera.fov * Math.PI / 180) / 2);
    this.camera.position.z = dist * 1.02;
  },

  render(dt, elapsed) { this.renderer.render(this.scene, this.camera); }
};
