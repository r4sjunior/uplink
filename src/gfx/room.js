/* =========================================================
   room.js — a sala.

   Nada aqui é protagonista. A sala existe para dar contexto ao
   monitor: uma borda de mesa embaixo, um teclado meio visível, o
   brilho da tela morrendo numa parede a dois metros, um cabo caindo
   por trás. Se o jogador reparar na sala, ela está errada.

   Duas obsessões de acabamento:
   - nada está alinhado com esquadro. Teclado torto, caneca fora do
     porta-copo, papel desencontrado. Simetria perfeita é o que mais
     denuncia cenário sintético;
   - o cabo é uma catenária calculada, não um cilindro reto.
   ========================================================= */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CFG } from '../config.js';
import { Mat } from './materials.js';
import { Tex } from './textures.js';
import { rng } from './textures.js';

const HI = () => CFG.tier === 'high';
const LOW = () => CFG.tier === 'low';

const DESK_Y = -0.325;          /* altura do tampo */
const DESK_FRONT = 0.62;        /* onde a mesa termina, perto do jogador */

/* =========================================================
   CATENÁRIA
   Um cabo pendurado entre dois pontos assume esta curva. Usar uma
   reta ou uma bézier arbitrária aqui é a diferença entre "cabo" e
   "cilindro cinza".
   ========================================================= */
function catenary(a, b, folga, segmentos) {
  const pts = [];
  const dist = a.distanceTo(b);
  const c = Math.max(0.02, dist / (2 * Math.asinh(dist / (2 * folga))));
  for (let i = 0; i <= segmentos; i++) {
    const t = i / segmentos;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    /* deslocamento vertical da curva em relação à corda */
    const x = (t - 0.5) * dist;
    const y = c * Math.cosh(x / c) - c * Math.cosh(dist / (2 * c));
    p.y += y;
    pts.push(p);
  }
  return new THREE.CatmullRomCurve3(pts);
}

function cable(a, b, folga, raio, mat) {
  const curva = catenary(a, b, folga, LOW() ? 10 : 24);
  const geo = new THREE.TubeGeometry(curva, LOW() ? 20 : 48, raio, LOW() ? 5 : 8, false);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = !LOW();
  return m;
}

/* =========================================================
   TECLADO
   ========================================================= */
function buildKeyboard(r) {
  const g = new THREE.Group();
  g.name = 'keyboard';

  const W = 0.365, D = 0.132, H = 0.019;
  const corpo = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 2, 0.004), Mat.keyboardBody());
  corpo.castShadow = true;
  corpo.receiveShadow = true;
  /* inclinação para trás, como todo teclado com o pezinho aberto */
  corpo.rotation.x = -0.055;
  g.add(corpo);

  /* --- teclas ---
     Uma malha instanciada: 100 teclas com 100 draw calls seria
     desperdício num objeto que ocupa 8% da tela. */
  const cols = 15, rows = 5;
  const kw = 0.0205, kd = 0.0205, kh = 0.0055;
  const total = cols * rows;
  const keyGeo = new RoundedBoxGeometry(kw, kh, kd, 1, 0.0012);
  const keys = new THREE.InstancedMesh(keyGeo, Mat.keycap(), total);
  keys.castShadow = false;
  keys.receiveShadow = true;
  keys.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  let n = 0;
  const x0 = -W / 2 + 0.020;
  const z0 = -D / 2 + 0.020;
  for (let ry = 0; ry < rows; ry++) {
    for (let cx = 0; cx < cols; cx++) {
      /* a barra de espaço ocupa o lugar de várias teclas */
      if (ry === rows - 1 && cx > 3 && cx < 10) { if (cx !== 4) { n++; continue; } }
      const larga = (ry === rows - 1 && cx === 4);
      const px = x0 + cx * 0.0233 + (ry * 0.004);        /* escalonamento por fileira */
      const pz = z0 + ry * 0.0225;
      s.set(larga ? 6.4 : 1, 1, 1);
      q.setFromEuler(new THREE.Euler(-0.055, 0, 0));
      m.compose(
        new THREE.Vector3(px + (larga ? 0.062 : 0), H / 2 + kh / 2 - 0.0015 + pz * 0.055, pz),
        q, s
      );
      keys.setMatrixAt(n++, m);
    }
  }
  keys.count = n;
  keys.instanceMatrix.needsUpdate = true;
  keys.rotation.x = -0.055;
  g.add(keys);

  /* torto: ninguém alinha teclado com a mesa */
  g.rotation.y = r.range(-0.055, 0.048);
  return g;
}

/* =========================================================
   A SALA
   ========================================================= */
export function buildRoom({ scene, monitor }) {
  const r = (() => {
    const f = rng(20260830);
    f.range = (a, b) => a + f() * (b - a);
    return f;
  })();

  const group = new THREE.Group();
  group.name = 'room';

  /* ---------------------------------------------------
     TAMPO DA MESA
     --------------------------------------------------- */
  const deskGeo = new THREE.BoxGeometry(2.4, 0.032, 1.15);
  const desk = new THREE.Mesh(deskGeo, Mat.desk());
  desk.position.set(0, DESK_Y - 0.016, -0.05);
  desk.receiveShadow = true;
  desk.castShadow = true;
  group.add(desk);

  /* ---------------------------------------------------
     PAREDE E CHÃO
     Longe o suficiente para a luz da tela morrer antes de chegar.
     --------------------------------------------------- */
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 3.4), Mat.wall());
  wall.position.set(0, 0.55, -1.35);
  wall.receiveShadow = true;
  group.add(wall);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 5), Mat.floor());
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -1.05, 0.3);
  floor.receiveShadow = true;
  group.add(floor);

  /* ---------------------------------------------------
     JANELA
     A luz fria que separa o monitor do fundo.
     --------------------------------------------------- */
  const janela = new THREE.Group();
  const vidro = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.86), Mat.windowPane());
  janela.add(vidro);
  /* moldura em quatro barras finas */
  const barraMat = Mat.darkMetal();
  [[0, 0.44, 1.2, 0.022], [0, -0.44, 1.2, 0.022],
   [-0.585, 0, 0.022, 0.9], [0.585, 0, 0.022, 0.9],
   [0, 0, 0.016, 0.88]].forEach(([x, y, w, h]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.026), barraMat);
    b.position.set(x, y, 0.004);
    janela.add(b);
  });
  janela.position.set(-1.62, 0.42, -1.33);
  janela.rotation.y = 0.02;
  group.add(janela);

  /* ---------------------------------------------------
     MOUSEPAD E MOUSE
     --------------------------------------------------- */
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.21), Mat.mousepad());
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0.315, DESK_Y + 0.0012, 0.30);
  pad.rotation.z = r.range(-0.09, 0.06);
  pad.receiveShadow = true;
  group.add(pad);

  const mouse = new THREE.Mesh(new RoundedBoxGeometry(0.058, 0.028, 0.098, 4, 0.020), Mat.mouse());
  mouse.position.set(0.322, DESK_Y + 0.015, 0.295);
  mouse.rotation.y = r.range(-0.22, 0.10);
  mouse.castShadow = true;
  mouse.receiveShadow = true;
  group.add(mouse);

  /* ---------------------------------------------------
     TECLADO
     --------------------------------------------------- */
  const kb = buildKeyboard(r);
  kb.position.set(-0.020, DESK_Y + 0.010, 0.315);
  group.add(kb);

  /* ---------------------------------------------------
     CANECA E PAPÉIS
     --------------------------------------------------- */
  const caneca = new THREE.Group();
  const corpo = new THREE.Mesh(
    new THREE.CylinderGeometry(0.041, 0.036, 0.095, LOW() ? 14 : 30, 1, true),
    Mat.ceramic()
  );
  corpo.castShadow = true;
  corpo.receiveShadow = true;
  caneca.add(corpo);
  const fundo = new THREE.Mesh(new THREE.CircleGeometry(0.036, LOW() ? 14 : 30), Mat.ceramic());
  fundo.rotation.x = -Math.PI / 2;
  fundo.position.y = -0.0475;
  caneca.add(fundo);
  /* café pela metade, refletindo a tela */
  const cafe = new THREE.Mesh(new THREE.CircleGeometry(0.0385, LOW() ? 14 : 30), Mat.coffee());
  cafe.rotation.x = -Math.PI / 2;
  cafe.position.y = 0.008;
  caneca.add(cafe);
  /* asa */
  const asa = new THREE.Mesh(
    new THREE.TorusGeometry(0.026, 0.0058, LOW() ? 6 : 10, LOW() ? 12 : 24, Math.PI * 1.25),
    Mat.ceramic()
  );
  asa.rotation.y = Math.PI / 2;
  asa.rotation.z = -0.35;
  asa.position.set(0.040, 0.004, 0);
  asa.castShadow = true;
  caneca.add(asa);
  caneca.position.set(-0.385, DESK_Y + 0.0475, 0.185);
  caneca.rotation.y = r.range(-0.6, 0.6);
  group.add(caneca);

  /* papéis: duas folhas desencontradas, meio sob o teclado */
  for (let i = 0; i < 2; i++) {
    const folha = new THREE.Mesh(new THREE.PlaneGeometry(0.148, 0.205), Mat.paper());
    folha.rotation.x = -Math.PI / 2;
    folha.rotation.z = r.range(-0.5, 0.5);
    folha.position.set(0.48 + r.range(-0.03, 0.03), DESK_Y + 0.0015 + i * 0.0007, 0.10 + i * 0.02);
    folha.receiveShadow = true;
    group.add(folha);
  }

  /* ---------------------------------------------------
     CABOS
     Do monitor para trás da mesa; do teclado para o mesmo lugar.
     --------------------------------------------------- */
  const cabMat = Mat.cable();
  const saida = monitor && monitor.anchors
    ? monitor.anchors.cableExit.clone()
    : new THREE.Vector3(-0.045, -0.20, -0.37);

  group.add(cable(
    saida,
    new THREE.Vector3(-0.30, DESK_Y - 0.10, -0.52),
    0.085, 0.0055, cabMat
  ));
  group.add(cable(
    new THREE.Vector3(-0.19, DESK_Y + 0.012, 0.258),
    new THREE.Vector3(-0.34, DESK_Y + 0.004, -0.16),
    0.030, 0.0034, cabMat
  ));
  group.add(cable(
    new THREE.Vector3(0.335, DESK_Y + 0.012, 0.245),
    new THREE.Vector3(0.44, DESK_Y + 0.004, -0.10),
    0.026, 0.0030, cabMat
  ));

  /* ---------------------------------------------------
     EQUIPAMENTO DE FUNDO
     Silhuetas com LED no canto da mesa: dão profundidade e alimentam
     os reflexos sem custar quase nada.
     --------------------------------------------------- */
  const rack = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const cx = new THREE.Mesh(
      new RoundedBoxGeometry(0.20, 0.042, 0.16, 2, 0.004),
      Mat.casing()
    );
    cx.position.set(0.80, DESK_Y + 0.022 + i * 0.045, -0.28);
    cx.rotation.y = r.range(-0.05, 0.05);
    cx.castShadow = true;
    cx.receiveShadow = true;
    rack.add(cx);

    /* LED de atividade, piscando fora de fase */
    const cor = i === 1 ? '#ff4d5e' : '#39ff9e';
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.0016, 8), Mat.led(i === 1 ? 0xff4d5e : 0x39ff9e, 3.0));
    led.position.set(0.705, DESK_Y + 0.022 + i * 0.045, -0.201);
    led.rotation.y = -Math.PI / 2;
    led.userData.fase = r() * Math.PI * 2;
    led.userData.vel = 1.4 + r() * 3.2;
    rack.add(led);
  }
  group.add(rack);

  scene.add(group);

  /* piscar dos LEDs de atividade */
  const leds = [];
  rack.traverse(o => { if (o.userData && o.userData.vel) leds.push(o); });

  return {
    group, desk, keyboard: kb, deskY: DESK_Y,

    update(dt, t) {
      for (let i = 0; i < leds.length; i++) {
        const l = leds[i];
        const v = 0.5 + 0.5 * Math.sin(t * l.userData.vel + l.userData.fase);
        l.material.opacity = 0.35 + v * 0.65;
      }
    },

    dispose() {
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
      });
    }
  };
}
