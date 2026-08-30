/* =========================================================
   cctv.js — as centrais de videomonitoramento.

   A cena de cada câmera não é vídeo: é uma simulação leve e
   determinística. Cada câmera tem figurantes com rotas próprias,
   um relógio, um contador de quadros e ruído — o suficiente para
   que olhar uma câmera por três minutos seja uma coisa que
   acontece, e não uma imagem parada.

   O módulo devolve apenas ESTADO. Quem desenha a imagem é a
   camada de interface; quem decide o que está acontecendo é aqui.
   ========================================================= */
import * as D from './data.js';
import * as F from './fmt.js';
import { Bus, EV } from './bus.js';
import { S, R, srv, storeFile, memFree } from './state.js';
import { makeRNG, hashString } from './rng.js';
import { makeFile, logHit } from './entities.js';
import * as Net from './net.js';
import * as News from './news.js';

/* =========================================================
   FIGURANTES
   A rota de cada figurante é derivada de uma semente estável, então
   a mesma câmera mostra sempre a mesma coreografia — e o jogador
   pode reconhecer "o cara do carrinho" se olhar duas vezes.
   ========================================================= */
function actorsFor(server, cam) {
  const rng = makeRNG(hashString(server.ip + ':' + cam.id) ^ (S.seed >>> 0));
  const scene = D.CAM_SCENES.find(s => s.id === cam.scene) || D.CAM_SCENES[0];
  const n = cam.night ? rng.int(0, 2) : rng.int(1, 5);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: 'a' + i,
      /* trajeto: começa e termina em pontos do enquadramento */
      x0: rng.float(0.05, 0.95), y0: rng.float(0.35, 0.9),
      x1: rng.float(0.05, 0.95), y1: rng.float(0.35, 0.9),
      /* período completo de ida e volta, em segundos */
      period: rng.float(14, 46),
      phase: rng.float(0, 1),
      /* altura aparente: quem está mais ao fundo é menor */
      scale: rng.float(0.55, 1.0),
      kind: rng.weighted([['pedestre', 6], ['guarda', 2], ['carrinho', 1], ['técnico', 1]]),
      pausa: rng.chance(0.35)
    });
  }
  return { scene: scene, atores: out, rng: rng };
}

/* Posição dos figurantes num instante. `t` em segundos. */
function poseAt(actors, t) {
  return actors.atores.map(a => {
    let u = ((t / a.period) + a.phase) % 1;
    /* vaivém: 0→1→0, com pausa nas pontas para quem tem `pausa` */
    let k = u < 0.5 ? u * 2 : (1 - u) * 2;
    if (a.pausa) k = k < 0.15 ? 0 : (k > 0.85 ? 1 : (k - 0.15) / 0.7);
    return {
      id: a.id, kind: a.kind, scale: a.scale,
      x: a.x0 + (a.x1 - a.x0) * k,
      y: a.y0 + (a.y1 - a.y0) * k,
      /* direção, para a interface poder espelhar o desenho */
      dir: a.x1 >= a.x0 ? 1 : -1
    };
  });
}

/* =========================================================
   VISTA DE UMA CÂMERA
   ========================================================= */
export function camView(server, camId) {
  const cam = (server.cams || []).find(c => c.id === camId);
  if (!cam) return null;
  const actors = actorsFor(server, cam);

  /* o tempo congela quando a câmera está em loop: é exatamente esse
     o ponto do contrato de congelamento */
  const now = cam.looped
    ? (cam.loopedAt || 0)
    : S.time * 60 + (S.conn.live ? (S.conn.frame || 0) : 0);

  return {
    id: cam.id,
    label: cam.label,
    scene: cam.scene,
    sceneName: actors.scene.name,
    night: !!cam.night,
    keypad: !!cam.keypad,
    recording: !!cam.recording,
    looped: !!cam.looped,
    /* carimbo de data e hora que a interface desenha sobre a imagem */
    stamp: F.fmtDate(cam.looped ? (cam.loopedGameTime || S.time) : S.time) + ' — ' + cam.label,
    atores: poseAt(actors, now),
    /* ruído e falha de sinal: o CFTV é velho */
    noise: cam.looped ? 0.02 : 0.06 + (server.sec.monitor > 3 ? 0 : 0.04),
    glitch: !cam.looped && R.chance(0.02)
  };
}

/* O mosaico com todas as câmeras. */
export function grid(server) {
  const block = Net.readBlock(server);
  if (block) return { erro: block };
  return {
    local: server.name,
    cameras: (server.cams || []).map(c => camView(server, c.id))
  };
}

/* =========================================================
   AÇÕES
   ========================================================= */

/* Ampliar uma câmera. É isso que o contrato de vigilância conta. */
export function watch(server, camId) {
  const block = Net.readBlock(server);
  if (block) return { erro: block };
  const cam = (server.cams || []).find(c => c.id === camId);
  if (!cam) return { erro: 'Câmera não encontrada.' };
  S.conn.watching = camId;
  return { ok: true, camera: camView(server, camId) };
}

export function unwatch() { S.conn.watching = null; }

/* Injetar um loop: a gravação passa a repetir o mesmo trecho.
   Exige escrita, e é o que permite alguém entrar sem aparecer. */
export function loop(server, camId, on) {
  const block = Net.writeBlock(server);
  if (block) return { erro: block };
  const cam = (server.cams || []).find(c => c.id === camId);
  if (!cam) return { erro: 'Câmera não encontrada.' };

  if (on === false || (on === undefined && cam.looped)) {
    cam.looped = false;
    cam.loopedAt = 0;
    logHit(server, 'Sinal restaurado na câmera ' + cam.label, 'sys');
    return { ok: true, texto: 'Loop removido de ' + cam.label + '.' };
  }

  cam.looped = true;
  cam.loopedAt = S.time * 60;
  cam.loopedGameTime = S.time;
  Net.illegal(server, 3);
  logHit(server, 'ALERTA: injeção de sinal detectada na câmera ' + cam.label);
  News.report('cctv', { target: server.name });
  Bus.emit(EV.SFX, { name: 'confirm' });
  return { ok: true, texto: 'Loop ativo em ' + cam.label + '. A imagem parou no tempo.' };
}

/* Arquivo de gravações. */
export function archive(server) {
  const block = Net.readBlock(server);
  if (block) return { erro: block };
  return {
    local: server.name,
    gravacoes: (server.files || []).map(f => ({
      id: f.id, name: f.name, size: f.size, enc: f.enc,
      camera: f.camId ? (server.cams.find(c => c.id === f.camId) || {}).label : null
    }))
  };
}

/* Gravar o que está sendo visto agora para a memória do gateway.
   Alternativa ao arquivo: mais cara em memória, mas sempre limpa. */
export function record(server, camId) {
  const block = Net.readBlock(server);
  if (block) return { erro: block };
  const cam = (server.cams || []).find(c => c.id === camId);
  if (!cam) return { erro: 'Câmera não encontrada.' };

  const f = makeFile(R, {
    name: 'captura_' + F.slug(cam.label) + '_' + R.int(1000, 9999) + '.vid',
    size: R.int(3, 7), enc: 0, kind: 'video', camId: cam.id
  });
  if (memFree() < f.size) return { erro: 'Memória insuficiente: precisa de ' + F.size(f.size) + '.' };

  storeFile(f, server.ip);
  Net.illegal(server, 1);
  logHit(server, 'Captura de vídeo iniciada na câmera ' + cam.label);
  Bus.emit(EV.MEM_CHANGED, {});
  return { ok: true, texto: 'Gravação salva: ' + f.name };
}

/* Painel de controle do local: o que a interface precisa saber. */
export function control(server) {
  return {
    local: server.name,
    cidade: server.city,
    cameras: (server.cams || []).length,
    emLoop: (server.cams || []).filter(c => c.looped).length,
    gravando: (server.cams || []).filter(c => c.recording).length,
    podeEscrever: Net.canWrite(server),
    assistindo: S.conn.watching || null
  };
}
