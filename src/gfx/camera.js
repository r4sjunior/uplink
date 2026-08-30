/* =========================================================
   camera.js — o rig de câmera.

   Duas exigências que puxam em direções opostas:
   - o jogo é de LER TEXTO. No estado normal a câmera precisa estar
     de frente, perto, com distorção de perspectiva mínima;
   - o jogo precisa parecer filmado. Isso pede movimento.

   A solução é separar as duas coisas. A POSE é discreta (um punhado
   de presets, com transição suave). Por cima dela roda um MICRO-
   MOVIMENTO permanente de amplitude minúscula — respiração de
   câmera na mão, quase abaixo do limiar consciente — que impede a
   imagem de parecer um render estático sem prejudicar a leitura.
   ========================================================= */
import * as THREE from 'three';
import { CFG } from '../config.js';
import { Bus, EV } from '../core/bus.js';

/* --------------------------------------------------------
   PRESETS
   `fov` menor = menos distorção de perspectiva. Na pose de trabalho
   usamos uma teleobjetiva curta: a tela fica quase ortográfica.
   -------------------------------------------------------- */
export const PRESETS = {
  /* trabalho: a tela ocupa o quadro, texto legível, sem drama */
  work:    { pos: [0, 0.010, 0.605], look: [0, 0.005, 0], fov: 30, roll: 0 },
  /* arranque: monitor apagado, visto de um pouco mais longe e de lado */
  boot:    { pos: [0.115, 0.075, 0.92], look: [0, -0.01, 0], fov: 36, roll: 0.012 },
  /* sala inteira */
  wide:    { pos: [0.52, 0.26, 1.18], look: [-0.02, -0.10, -0.1], fov: 42, roll: 0.006 },
  /* conexão: aproximação leve com inclinação quase imperceptível */
  connect: { pos: [0, 0.012, 0.565], look: [0, 0.006, 0], fov: 29, roll: -0.008 },
  /* fim de jogo: a câmera recua e a sala engole o monitor */
  over:    { pos: [0.30, 0.14, 1.35], look: [0, -0.04, -0.05], fov: 40, roll: 0.02 }
};

/* Easing: rápido no início, assentando no fim. */
function easeInOutQuint(t) {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

export function buildCamera({ aspect }) {
  const cam = new THREE.PerspectiveCamera(PRESETS.work.fov, aspect, 0.01, 60);

  const atual = {
    pos: new THREE.Vector3().fromArray(PRESETS.work.pos),
    look: new THREE.Vector3().fromArray(PRESETS.work.look),
    fov: PRESETS.work.fov,
    roll: PRESETS.work.roll
  };
  const de = { pos: atual.pos.clone(), look: atual.look.clone(), fov: atual.fov, roll: atual.roll };
  const para = { pos: atual.pos.clone(), look: atual.look.clone(), fov: atual.fov, roll: atual.roll };

  let t = 1, dur = 1, presetAtual = 'work';

  /* --- tremor: impacto de alarme, game over --- */
  let shake = 0, shakeDecay = 1;

  /* --- respiração permanente --- */
  const semente = Math.random() * 1000;

  /* --- paralaxe pelo ponteiro: a cabeça do jogador se mexe ---
     Amplitude minúscula, e some quando a câmera está em transição. */
  let mx = 0, my = 0, mxAlvo = 0, myAlvo = 0;

  const api = {
    camera: cam,

    get preset() { return presetAtual; },

    /** Move para um preset. `duration` em segundos; 0 = corte seco. */
    go(nome, duration) {
      const p = PRESETS[nome];
      if (!p) return;
      presetAtual = nome;
      de.pos.copy(atual.pos); de.look.copy(atual.look);
      de.fov = atual.fov; de.roll = atual.roll;
      para.pos.fromArray(p.pos); para.look.fromArray(p.look);
      para.fov = p.fov; para.roll = p.roll;
      dur = Math.max(0.0001, duration === undefined ? 1.1 : duration);
      t = 0;
      if (dur <= 0.001) t = 1;
    },

    shake(power, duration) {
      shake = Math.max(shake, power || 0.5);
      shakeDecay = 1 / Math.max(0.1, duration || 0.6);
    },

    /** Ponteiro em coordenadas normalizadas (-1..1). */
    pointer(x, y) { mxAlvo = x; myAlvo = y; },

    setAspect(a) { cam.aspect = a; cam.updateProjectionMatrix(); },

    update(dt, elapsed) {
      /* --- interpolação entre presets --- */
      if (t < 1) {
        t = Math.min(1, t + dt / dur);
        const k = easeInOutQuint(t);
        atual.pos.lerpVectors(de.pos, para.pos, k);
        atual.look.lerpVectors(de.look, para.look, k);
        atual.fov = de.fov + (para.fov - de.fov) * k;
        atual.roll = de.roll + (para.roll - de.roll) * k;
      }

      /* --- respiração ---
         Três senoides incomensuráveis: nunca repete de forma audível. */
      const b = elapsed + semente;
      const respX = Math.sin(b * 0.37) * 0.0016 + Math.sin(b * 0.83) * 0.0007;
      const respY = Math.sin(b * 0.29 + 1.7) * 0.0013 + Math.sin(b * 0.71 + 0.4) * 0.0006;
      const respZ = Math.sin(b * 0.23 + 3.1) * 0.0011;

      /* --- paralaxe suavizada --- */
      const kp = 1 - Math.pow(0.004, dt);
      mx += (mxAlvo - mx) * kp;
      my += (myAlvo - my) * kp;
      const paraX = mx * 0.0125 * (t >= 1 ? 1 : 0.25);
      const paraY = my * 0.0080 * (t >= 1 ? 1 : 0.25);

      /* --- tremor --- */
      let shX = 0, shY = 0, shR = 0;
      if (shake > 0.001) {
        shake = Math.max(0, shake - dt * shakeDecay);
        const s = shake * shake;             /* decai mais rápido no fim */
        shX = (Math.random() - 0.5) * 0.010 * s;
        shY = (Math.random() - 0.5) * 0.010 * s;
        shR = (Math.random() - 0.5) * 0.020 * s;
      }

      cam.position.set(
        atual.pos.x + respX + paraX + shX,
        atual.pos.y + respY + paraY + shY,
        atual.pos.z + respZ
      );
      cam.lookAt(
        atual.look.x - paraX * 0.35,
        atual.look.y - paraY * 0.35,
        atual.look.z
      );
      /* o roll entra depois do lookAt, senão o lookAt o apaga */
      cam.rotateZ(atual.roll + shR);

      if (Math.abs(cam.fov - atual.fov) > 0.001) {
        cam.fov = atual.fov;
        cam.updateProjectionMatrix();
      }
    }
  };

  /* --------------------------------------------------------
     REAÇÃO AOS EVENTOS DO JOGO
     -------------------------------------------------------- */
  Bus.on(EV.CAM_MOVE, ({ preset, duration }) => api.go(preset, duration));
  Bus.on(EV.CAM_SHAKE, ({ power, duration }) => api.shake(power, duration));

  Bus.on(EV.UI_SCREEN, ({ name }) => {
    if (name === 'boot') api.go('boot', 0.001);
    else if (name === 'login') api.go('work', 2.6);
    else if (name === 'desktop') api.go('work', 1.2);
    else if (name === 'over') api.go('over', 3.4);
  });

  Bus.on(EV.CONNECT_OPEN, () => api.go('connect', 1.4));
  Bus.on(EV.CONNECT_CLOSE, () => api.go('work', 1.0));
  Bus.on(EV.ALARM, () => api.shake(0.5, 0.55));
  Bus.on(EV.GAME_OVER, () => { api.shake(1.0, 1.4); api.go('over', 3.4); });

  return api;
}
