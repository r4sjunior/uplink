/* =========================================================
   game.js — a fachada da simulação.

   Único ponto de entrada do núcleo. `boot.js` conhece este arquivo
   e mais nada de dentro de `core/`. A interface conversa por aqui
   ou pelo barramento de eventos — nunca mexendo no estado direto.

   O relógio tem duas escalas:
   - tempo REAL, em segundos, que move as barras de progresso das
     ferramentas e o trace ativo. Estes não aceleram com o botão de
     velocidade: seria trapaça ganhar tempo de trace acelerando.
   - tempo de JOGO, em minutos, que move contratos, notícias, juros
     e o trace passivo. Este acelera.
   ========================================================= */
import { CFG } from '../config.js';
import { Bus, EV } from './bus.js';
import * as D from './data.js';
import * as F from './fmt.js';
import {
  S, setState, emptyState, START_TIME, R, srv,
  ratingName, ratingIndex, neuroName, addEmail, memTotal, memFree
} from './state.js';
import { hashString } from './rng.js';
import * as World from './world.js';
import * as Net from './net.js';
import * as SW from './software.js';
import * as HW from './hardware.js';
import * as Missions from './missions.js';
import * as Bank from './bank.js';
import * as News from './news.js';
import * as Story from './story.js';
import * as Save from './save.js';

/* acumuladores do laço */
let minuteAcc = 0;      /* fração de minuto de jogo pendente */
let lastDay = 0;        /* último dia processado, para os juros */
let autosaveAcc = 0;

export const Game = {
  /* leitura pública do estado; a interface lê, não escreve */
  get state() { return S; },

  async init() {
    /* nada de assíncrono ainda, mas a assinatura fica pronta para
       quando houver carregamento de dados externos */
    Bus.emit(EV.BOOT_DONE, {});
  },

  hasSave() { return Save.has(); },

  /* =========================================================
     NOVA PARTIDA
     ========================================================= */
  newGame(handle) {
    const seed = (hashString(String(handle) + ':' + Date.now()) >>> 0) || 1;
    const st = emptyState();
    st.seed = seed;
    st.rng = seed;
    st.handle = String(handle).slice(0, 16);
    st.time = START_TIME;
    setState(st);

    S.world = World.generate(seed, S.handle);

    /* conta bancária do agente */
    const acc = World.bindPlayer(seed, S.handle);
    S.bank = { ip: acc.ip, no: acc.no, pass: acc.pass };
    S.credits = 3000;
    S.flags.knownAccounts = {};
    S.flags.knownAccounts[acc.no] = true;

    /* identidade de rede e kit inicial */
    Net.playerIP();
    SW.grantStarterKit();

    /* links iniciais: o mínimo para o jogador não olhar uma tela vazia */
    S.links = [
      S.world.internic, S.world.uis, S.world.publicAccess, S.world.testMachine,
      S.world.iad, S.world.gcd, acc.ip
    ].filter(Boolean);

    Story.init();
    Missions.refresh(true);
    Missions.firstContract();
    News.ambient();
    News.ambient();

    welcomeMail(acc);

    S.started = true;
    S.speed = 1;
    minuteAcc = 0;
    lastDay = Math.floor(S.time / (24 * 60));

    Bus.emit(EV.GAME_START, { handle: S.handle, seed: seed });
    Bus.emit(EV.UI_SCREEN, { name: 'desktop' });
    return S;
  },

  load() {
    if (!Save.load()) return false;
    minuteAcc = 0;
    lastDay = Math.floor(S.time / (24 * 60));
    Bus.emit(EV.UI_SCREEN, { name: S.over ? 'over' : 'desktop' });
    return true;
  },

  save() { return Save.save(); },
  wipeSave() { return Save.wipe(); },
  exportSave() { return Save.exportText(); },
  importSave(t) { return Save.importText(t); },

  /* =========================================================
     VELOCIDADE
     ========================================================= */
  setSpeed(v) {
    S.speed = Math.max(0, Number(v) || 0);
    Bus.emit(EV.TICK, { dt: 0, gameMinutes: S.time, speed: S.speed });
    return S.speed;
  },
  togglePause() { return this.setSpeed(S.speed > 0 ? 0 : 1); },

  /* =========================================================
     O LAÇO
     `dt` chega em segundos reais, de boot.js.
     ========================================================= */
  tick(dt) {
    if (!S.started || S.over) return;

    /* --- escala real: ferramentas e trace ativo --- */
    SW.tick(dt);
    Net.tick(dt);

    /* contador de quadros dentro da conexão, usado pela animação
       das câmeras para não depender do relógio de jogo */
    if (S.conn.live) S.conn.frame = (S.conn.frame || 0) + dt;

    /* --- escala de jogo: minutos --- */
    if (S.speed > 0) {
      minuteAcc += dt * S.speed * CFG.sim.minutesPerSecond;
      let guard = 0;
      while (minuteAcc >= 1 && guard++ < 600) {
        minuteAcc -= 1;
        S.time += 1;
        minute();
      }
    }

    Bus.emit(EV.TICK, { dt: dt, gameMinutes: S.time, speed: S.speed });

    /* --- salvamento automático --- */
    autosaveAcc += dt;
    if (autosaveAcc >= CFG.sim.autosaveSeconds) {
      autosaveAcc = 0;
      if (!S.over) Save.save();
    }
  },

  /* =========================================================
     RETRATO PARA A INTERFACE
     Um objeto plano, barato de montar, com tudo que a barra
     superior e o painel lateral precisam.
     ========================================================= */
  hud() {
    const conn = S.conn;
    const t = conn.trace;
    return {
      handle: S.handle,
      time: S.time,
      clock: F.fmtClock(S.time),
      date: F.fmtDateShort(S.time),
      speed: S.speed,
      credits: S.credits,
      creditsText: F.credits(S.credits),
      rating: ratingName(),
      ratingIndex: ratingIndex(),
      neuro: neuroName(),
      ip: S.playerIP,
      memory: { total: memTotal(), free: memFree() },
      cpu: Math.round(HW.cpuPower()),
      tasks: S.tasks.map(x => ({ id: x.id, name: x.name, pct: x.progress })),
      unread: S.email.filter(e => !e.read && e.kind !== 'sent').length,
      connected: conn.live,
      target: conn.live ? conn.target : null,
      targetName: conn.live && srv(conn.target) ? srv(conn.target).name : null,
      route: conn.route.slice(),
      trace: t ? { pct: t.pct, remaining: t.remaining, total: t.total } : null,
      heat: S.heat,
      over: S.over
    };
  },

  /* atalhos que a interface usa muito */
  net: Net, software: SW, hardware: HW, missions: Missions,
  bank: Bank, news: News, story: Story, world: World
};

/* =========================================================
   UM MINUTO DE JOGO
   ========================================================= */
function minute() {
  Missions.tick();
  News.tick();
  Story.tick();

  const day = Math.floor(S.time / (24 * 60));
  if (day !== lastDay) {
    lastDay = day;
    Bank.dailyTick();
  }
}

/* =========================================================
   CORRESPONDÊNCIA DE BOAS-VINDAS
   ========================================================= */
function welcomeMail(acc) {
  addEmail({
    from: 'admin@uplink.net',
    subj: 'Bem-vindo à Uplink Corporation',
    body:
      'Agente ' + S.handle + ',\n\n' +
      'Sua inscrição foi aceita. O gateway está online e o seu endereço é ' + S.playerIP + '.\n\n' +
      'CONTA BANCÁRIA\n' +
      '  Banco: ' + acc.bankName + '\n' +
      '  Número: ' + acc.no + '\n' +
      '  Senha: ' + acc.pass + '\n' +
      '  Saldo inicial: ' + F.credits(3000) + '\n\n' +
      'REGRAS QUE VALEM A PENA DECORAR\n' +
      '  1. Nunca conecte direto. Monte uma rota de bounce: cada salto ' +
      'multiplica o tempo que o trace leva para chegar até você.\n' +
      '  2. Toda máquina por onde você passa grava de onde você veio. ' +
      'Apagar o log do alvo não basta se a trilha continua inteira — mas ' +
      'basta quebrar um elo dela.\n' +
      '  3. O trace ativo mata na hora. O trace passivo mata dias depois, ' +
      'e é ele que pega quem se acha esperto.\n' +
      '  4. Três avisos e sua licença é revogada.\n\n' +
      'Há um contrato de treinamento esperando por você no sistema interno. ' +
      'Ele paga de verdade.\n\n' +
      '— Uplink Corporation\n  "Trust Is A Weakness"',
    kind: 'system'
  });

  addEmail({
    from: 'internal@uplink.net',
    subj: 'Seu equipamento',
    body:
      'Gateway ' + HW.gateway().name + '.\n' +
      '  Processamento: ' + Math.round(HW.cpuPower()) + ' unidades por segundo\n' +
      '  Memória: ' + F.size(memTotal()) + '\n' +
      '  Modem: ' + HW.modem().bw + ' Gq/s\n\n' +
      'É um equipamento de entrada e vai ficar apertado rápido. ' +
      'Quando as ferramentas começarem a demorar mais do que o trace permite, ' +
      'é sinal de que chegou a hora de trocar de chassi — não só de comprar mais CPU.\n\n' +
      'Software instalado: ' + S.software.map(s => D.SW_BY_ID[s.id].name + ' v' + s.v).join(', ') + '.',
    kind: 'system'
  });
}

export default Game;
