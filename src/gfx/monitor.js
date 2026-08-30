/* =========================================================
   monitor.js — o objeto físico que segura a tela.

   Bisel extrudado com chanfro (nada de caixa crua), carcaça
   varrida a partir de uma superelipse que afina para trás como um
   CRT de verdade, grade de ventilação no topo, painel de botões,
   LED de energia e um pé com articulação de inclinação.

   Devolve âncoras (`anchors`) para os outros módulos: onde o LED
   fica, por onde o cabo sai, onde a luz da tela nasce.
   ========================================================= */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG } from '../config.js';
import { Mat } from './materials.js';
import { SCREEN, buildScreen } from './screen.js';

const HI = () => CFG.tier === 'high';
const LOW = () => CFG.tier === 'low';

/* --------------------------------------------------------
   formas auxiliares
   -------------------------------------------------------- */

/** Retângulo de cantos arredondados como THREE.Shape (ou Path, para furos). */
function roundedRect(w, h, r, Ctor = THREE.Shape) {
  const s = new Ctor();
  const x = w / 2, y = h / 2;
  r = Math.min(r, x, y);
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
}

/** Ponto de uma superelipse (cantos arredondados controlados por `p`). */
function superPoint(t, a, b, p) {
  const c = Math.cos(t), s = Math.sin(t);
  const e = 2 / p;
  return [
    a * Math.sign(c) * Math.pow(Math.abs(c), e),
    b * Math.sign(s) * Math.pow(Math.abs(s), e)
  ];
}

/** Interpola um perfil [[t, sx, sy], ...] com suavização de Catmull-Rom em 1D. */
function profileAt(profile, t) {
  let i = 0;
  while (i < profile.length - 2 && profile[i + 1][0] < t) i++;
  const a = profile[i], b = profile[i + 1];
  const k = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
  const s = k * k * (3 - 2 * k);
  return [a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
}

/**
 * Carcaça: varre uma superelipse ao longo de z seguindo um perfil de escala.
 * Gera UVs (u ao redor, v ao longo) e tampas nas duas pontas.
 */
function sweptShell({ a, b, zFront, zBack, profile, radial = 40, sections = 22, power = 4.6 }) {
  const cols = radial + 1;               /* coluna extra para fechar a UV */
  const rows = sections + 1;
  const pos = [], nor = [], uv = [], idx = [];

  for (let j = 0; j < rows; j++) {
    const t = j / sections;
    const z = zFront + (zBack - zFront) * t;
    const [sxk, syk] = profileAt(profile, t);
    for (let i = 0; i < cols; i++) {
      const ang = (i / radial) * Math.PI * 2;
      const [x, y] = superPoint(ang, a * sxk, b * syk, power);
      pos.push(x, y, z);
      nor.push(0, 0, 0);
      uv.push(i / radial, t);
    }
  }
  for (let j = 0; j < sections; j++) {
    for (let i = 0; i < radial; i++) {
      const p0 = j * cols + i, p1 = p0 + 1, p2 = p0 + cols, p3 = p2 + 1;
      idx.push(p0, p2, p1, p1, p2, p3);
    }
  }

  /* tampas */
  const cap = (row, z, flip) => {
    const base = pos.length / 3;
    pos.push(0, 0, z); nor.push(0, 0, 0); uv.push(0.5, 0.5);
    for (let i = 0; i < cols; i++) {
      const k = (row * cols + i) * 3;
      pos.push(pos[k], pos[k + 1], z);
      nor.push(0, 0, 0);
      uv.push(0.5 + pos[k] / (a * 4), 0.5 + pos[k + 1] / (b * 4));
    }
    for (let i = 0; i < radial; i++) {
      if (flip) idx.push(base, base + 1 + i, base + 2 + i);
      else idx.push(base, base + 2 + i, base + 1 + i);
    }
  };
  cap(0, zFront, true);
  cap(sections, zBack, false);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Altura da superfície superior da carcaça em um dado z. */
function shellTopY(b, profile, zFront, zBack, z) {
  const t = Math.min(1, Math.max(0, (z - zFront) / (zBack - zFront)));
  return b * profileAt(profile, t)[1];
}

/* --------------------------------------------------------
   construção
   -------------------------------------------------------- */
export function buildMonitor({ surface, renderer }) {
  const group = new THREE.Group();
  group.name = 'monitor';

  const screen = buildScreen({ surface, renderer });
  group.add(screen.group);

  const bevelSeg = HI() ? 3 : 1;
  const radial = HI() ? 48 : (LOW() ? 22 : 34);
  const sections = HI() ? 20 : (LOW() ? 9 : 14);

  /* ---------- bisel ---------- */
  const shape = roundedRect(SCREEN.BEZEL_W, SCREEN.BEZEL_H, 0.020);
  shape.holes.push(roundedRect(SCREEN.OPEN_W, SCREEN.OPEN_H, 0.014, THREE.Path));

  const bezDepth = 0.052, bevT = 0.0035, bevS = 0.0045;
  const bezelGeo = new THREE.ExtrudeGeometry(shape, {
    depth: bezDepth,
    bevelEnabled: true,
    bevelThickness: bevT,
    bevelSize: bevS,
    bevelOffset: 0,
    bevelSegments: bevelSeg,
    curveSegments: HI() ? 10 : 5,
    steps: 1
  });
  bezelGeo.computeVertexNormals();
  const bezel = new THREE.Mesh(bezelGeo, Mat.bezel());
  bezel.name = 'bezel';
  bezel.position.z = SCREEN.FRONT_Z - bezDepth - bevT;
  bezel.castShadow = true;
  bezel.receiveShadow = true;
  group.add(bezel);

  /* ---------- carcaça ---------- */
  const zF = SCREEN.FRONT_Z - 0.050;
  const zB = -0.372;
  /* [t, escala horizontal, escala vertical] — ombro curto e depois o funil */
  const profile = [
    [0.00, 1.000, 1.000],
    [0.09, 0.995, 0.994],
    [0.26, 0.940, 0.930],
    [0.48, 0.828, 0.806],
    [0.70, 0.700, 0.672],
    [0.87, 0.596, 0.566],
    [1.00, 0.540, 0.508]
  ];
  const A = SCREEN.BEZEL_W / 2 - 0.0015, B = SCREEN.BEZEL_H / 2 - 0.0015;
  const shellGeo = sweptShell({ a: A, b: B, zFront: zF, zBack: zB, profile, radial, sections });
  const shell = new THREE.Mesh(shellGeo, Mat.casing());
  shell.name = 'casing';
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);

  /* ---------- grade de ventilação no topo ---------- */
  {
    const slots = [];
    const n = LOW() ? 7 : 13;
    for (let i = 0; i < n; i++) {
      const z = -0.075 - i * 0.0175;
      const topY = shellTopY(B, profile, zF, zB, z);
      const t = Math.min(1, Math.max(0, (z - zF) / (zB - zF)));
      const w = SCREEN.BEZEL_W * profileAt(profile, t)[0] * 0.42;
      const g = new THREE.BoxGeometry(w, 0.005, 0.0075);
      g.translate(0, topY - 0.0022, z);
      slots.push(g);
    }
    const vents = new THREE.Mesh(mergeGeometries(slots, false), Mat.darkMetal());
    vents.name = 'vents';
    vents.castShadow = false;
    vents.receiveShadow = true;
    group.add(vents);
    slots.forEach(g => g.dispose());
  }

  /* ---------- painel de botões ---------- */
  const controls = new THREE.Group();
  controls.name = 'controls';
  {
    const by = -SCREEN.OPEN_H / 2 - 0.0090;   /* meio da faixa de bisel abaixo do vão */
    const bz = SCREEN.FRONT_Z + 0.0005;
    const btnGeo = new RoundedBoxGeometry(0.0135, 0.0058, 0.004, 2, 0.0018);
    const mat = Mat.button();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(btnGeo, mat);
      m.position.set(0.130 + i * 0.0175, by, bz);
      m.castShadow = false;
      controls.add(m);
    }
    /* botão de energia, maior e um pouco afastado */
    const pow = new THREE.Mesh(new RoundedBoxGeometry(0.0155, 0.0085, 0.0055, 2, 0.0024), mat);
    pow.position.set(0.2075, by, bz);
    controls.add(pow);

    /* plaqueta de marca em alumínio escovado, levemente torta */
    const plate = new THREE.Mesh(new RoundedBoxGeometry(0.052, 0.0072, 0.0016, 2, 0.0006), Mat.brushedMetal(0x74797f));
    plate.position.set(-0.176, by - 0.0006, bz - 0.0004);
    plate.rotation.z = 0.006;
    controls.add(plate);

    /* LED de energia + halo */
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 12), Mat.led(0x62ffb4, 3.2));
    led.position.set(0.2280, by, bz + 0.0012);
    controls.add(led);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.030, 0.030), Mat.ledHalo('#62ffb4'));
    halo.position.copy(led.position).setZ(led.position.z + 0.0006);
    halo.material.opacity = 0.55;
    controls.add(halo);
    controls.userData.ledPos = led.position.clone();
  }
  group.add(controls);

  /* ---------- pé e articulação ---------- */
  const stand = new THREE.Group();
  stand.name = 'stand';
  {
    const deskY = -0.245;
    const bottomY = -SCREEN.BEZEL_H / 2 - 0.0125;

    /* base: perfil torneado, cantos suaves */
    const prof = [];
    const R = 0.098, Hh = 0.0165;
    prof.push(new THREE.Vector2(0.001, 0));
    prof.push(new THREE.Vector2(R - 0.010, 0));
    prof.push(new THREE.Vector2(R, 0.006));
    prof.push(new THREE.Vector2(R - 0.004, Hh * 0.72));
    prof.push(new THREE.Vector2(R * 0.72, Hh));
    prof.push(new THREE.Vector2(0.030, Hh));
    const baseGeo = new THREE.LatheGeometry(prof, LOW() ? 20 : 40);
    baseGeo.scale(1, 1, 0.82);          /* base oval, mais rasa em profundidade */
    const base = new THREE.Mesh(baseGeo, Mat.casing());
    base.position.set(0, deskY + 0.0005, -0.145);
    base.castShadow = true;
    base.receiveShadow = true;
    stand.add(base);

    /* coluna */
    const colH = bottomY - (deskY + Hh) + 0.010;
    const col = new THREE.Mesh(
      new RoundedBoxGeometry(0.072, colH, 0.052, 2, 0.012),
      Mat.casing()
    );
    col.position.set(0, deskY + Hh + colH / 2 - 0.004, -0.145);
    col.castShadow = true;
    col.receiveShadow = true;
    stand.add(col);

    /* articulação: cilindro de metal escuro atravessando a coluna */
    const pivot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0125, 0.0125, 0.080, LOW() ? 10 : 20),
      Mat.darkMetal()
    );
    pivot.rotation.z = Math.PI / 2;
    pivot.position.set(0, bottomY + 0.004, -0.145);
    pivot.castShadow = true;
    stand.add(pivot);
  }
  group.add(stand);

  /* O monitor inteiro inclina 2° para trás e está 1.1° torto na mesa —
     nada nesta sala foi alinhado com esquadro. */
  group.rotation.x = -0.020;
  group.rotation.y = 0.0;

  return {
    group, screen, bezel, shell, controls, stand,
    anchors: {
      /* de onde a luz da tela nasce */
      screenCenter: new THREE.Vector3(0, 0, SCREEN.SAG * 0.5),
      led: controls.userData.ledPos.clone(),
      /* saída de cabo, na parte de baixo de trás da carcaça */
      cableExit: new THREE.Vector3(-0.045, shellTopY(B, profile, zF, zB, zB) * -0.78, zB + 0.004)
    },
    dispose() {
      bezelGeo.dispose(); shellGeo.dispose(); screen.dispose();
    }
  };
}
