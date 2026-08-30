/* =========================================================
   story.js — o arco narrativo.

   Duas corporações querem a mesma coisa por motivos opostos.
   A Andromeda Research construiu um verme, o Revelation, capaz de
   consumir qualquer sistema conectado; a Arunmor construiu a
   contramedida, o Faith. As duas precisam de um agente externo, e
   as duas vão procurar você.

   O arco só começa quando o jogador tem competência para percebê-lo
   (rating suficiente e algum tempo de mundo). A partir da escolha,
   os caminhos são mutuamente exclusivos: aceitar um lado fecha o
   outro para sempre, e cada um termina de um jeito.

   Cada fase é um dado: gatilho, e-mail, e o que ela desbloqueia.
   Nada aqui é texto solto — é tudo verificável, como um contrato.
   ========================================================= */
import * as D from './data.js';
import * as F from './fmt.js';
import { Bus, EV } from './bus.js';
import {
  S, R, srv, addEmail, addSw, addPoints, ratingIndex, gameOver, flag
} from './state.js';
import * as World from './world.js';

const ANDROMEDA = 'Andromeda Research';
const ARUNMOR = 'Arunmor';

function corpServer(name) {
  const c = S.world.corps.find(x => x.name === name);
  if (!c) return null;
  return srv(c.servers[c.servers.length - 1]);
}

/* =========================================================
   ESTADO DO ARCO
   ========================================================= */
export function init() {
  if (S.story) return S.story;
  S.story = {
    phase: 0,          /* 0 = dormindo */
    side: null,        /* 'andromeda' | 'arunmor' */
    started: false,
    finished: false,
    ending: null,
    nextAt: 0,
    log: []
  };
  return S.story;
}

export function view() {
  const st = S.story || init();
  return {
    ativo: st.started && !st.finished,
    fase: st.phase,
    lado: st.side,
    terminado: st.finished,
    final: st.ending,
    registro: st.log.slice()
  };
}

function beat(title, text) {
  S.story.log.push({ t: S.time, title: title, text: text });
  Bus.emit(EV.STORY, { phase: S.story.phase, side: S.story.side, title: title });
}

/* =========================================================
   FASE 1 — O CONVITE
   Chega quando o agente tem rating suficiente para ser notado.
   ========================================================= */
function invite() {
  const st = S.story;
  st.started = true;
  st.phase = 1;
  st.nextAt = S.time + 60 * 24;

  addEmail({
    from: 'recrutamento@andromeda-research.com',
    subj: 'Uma proposta que não passa pela Uplink',
    body:
      'Acompanhamos o seu trabalho há algumas semanas.\n\n' +
      'A Andromeda Research está terminando um projeto que vai tornar obsoleta a ideia ' +
      'de sistema seguro. Precisamos de alguém de fora da folha de pagamento para as ' +
      'partes que não podem ter nosso nome.\n\n' +
      'Paga-se muito bem. Responda aceitando e mandamos o primeiro passo.\n\n' +
      '— R. Vasconcelos, Diretoria de Projetos Especiais',
    kind: 'story'
  });

  addEmail({
    from: 'seguranca@arunmor.com',
    subj: 'Antes de você responder a eles',
    body:
      'Sabemos que a Andromeda entrou em contato. Sabemos porque monitoramos o que eles fazem.\n\n' +
      'O que eles estão construindo se chama Revelation. É um verme autorreplicante. ' +
      'Uma vez solto numa rede pública, não há como recolher.\n\n' +
      'A Arunmor está construindo a contramedida. Ela se chama Faith, e ainda não está pronta.\n\n' +
      'Não vamos pagar mais que eles. Vamos pagar o suficiente.\n\n' +
      '— M. Oyelaran, Arunmor',
    kind: 'story'
  });

  beat('O convite', 'Andromeda e Arunmor procuraram você no mesmo dia.');
  Bus.emit(EV.UI_TOAST, { text: 'Duas mensagens fora do circuito da Uplink chegaram.', kind: 'warn' });
}

/* =========================================================
   ESCOLHA DE LADO
   ========================================================= */
export function choose(side) {
  const st = S.story || init();
  if (!st.started) return 'Ninguém fez nenhum convite ainda.';
  if (st.side) return 'Você já escolheu um lado. Não há volta.';
  if (side !== 'andromeda' && side !== 'arunmor') return 'Lado desconhecido.';

  st.side = side;
  st.phase = 2;
  st.nextAt = S.time + 60 * 12;

  if (side === 'andromeda') {
    addEmail({
      from: 'r.vasconcelos@andromeda-research.com',
      subj: 'Primeiro passo',
      body:
        'Boa escolha.\n\n' +
        'O Revelation existe, mas está incompleto. Falta o módulo de propagação, e ele está ' +
        'guardado num sistema que não é nosso — precisamos que você o traga.\n\n' +
        'Quando tivermos o verme pronto, você vai soltá-lo. Não em teste. De verdade.\n\n' +
        'A partir daqui não existe desistir no meio.',
      kind: 'story'
    });
    beat('Lado escolhido: Andromeda', 'Você vai ajudar a terminar o Revelation.');
  } else {
    addEmail({
      from: 'm.oyelaran@arunmor.com',
      subj: 'Obrigada',
      body:
        'Você acabou de virar alvo da Andromeda. Eles vão descobrir, e eles não são gentis.\n\n' +
        'O Faith precisa de amostras do verme para aprender a neutralizá-lo. ' +
        'Isso significa que você vai ter que entrar nos sistemas deles e sair vivo.\n\n' +
        'Vamos te dar as ferramentas. O resto é com você.',
      kind: 'story'
    });
    beat('Lado escolhido: Arunmor', 'Você vai ajudar a terminar o Faith.');
  }

  Bus.emit(EV.STORY, { phase: st.phase, side: st.side, title: 'escolha' });
  return null;
}

/* =========================================================
   AS FASES SEGUINTES
   Cada uma entrega uma ferramenta ou um alvo, e move o arco.
   ========================================================= */
const PHASES = {
  andromeda: [
    {
      n: 3, wait: 60 * 18,
      run() {
        const t = corpServer(ARUNMOR);
        addEmail({
          from: 'r.vasconcelos@andromeda-research.com',
          subj: 'Alvo: Arunmor',
          body: 'A Arunmor guarda o esboço do Faith em ' + (t ? t.name + ' (' + t.ip + ')' : 'um sistema deles') +
            '. Copie o que houver e apague o original. Sem o esboço, eles voltam meses.',
          kind: 'story'
        });
        beat('Sabotagem', 'A Andromeda quer o esboço do Faith destruído.');
      }
    },
    {
      n: 4, wait: 60 * 30,
      run() {
        addSw('revelation', 1);
        addEmail({
          from: 'r.vasconcelos@andromeda-research.com',
          subj: 'Revelation v1 — instalado no seu gateway',
          body: 'Está no seu gateway. Escolha um sistema grande e solte.\n\n' +
            'Você vai entender por que o nome é esse.',
          kind: 'story'
        });
        beat('Revelation entregue', 'A arma está no seu gateway.');
        Bus.emit(EV.UI_TOAST, { text: 'Revelation v1 instalado no gateway.', kind: 'warn' });
      }
    },
    {
      n: 5, wait: 60 * 40,
      run() {
        addSw('revelation', 3);
        addEmail({
          from: 'r.vasconcelos@andromeda-research.com',
          subj: 'A última entrega',
          body: 'Revelation v3. Esta cepa não tem contramedida conhecida.\n\n' +
            'Solte-a numa das bases globais. Depois disso, desapareça — inclusive de nós.',
          kind: 'story'
        });
        beat('Revelation v3', 'A cepa final, sem contramedida.');
      }
    }
  ],

  arunmor: [
    {
      n: 3, wait: 60 * 18,
      run() {
        const t = corpServer(ANDROMEDA);
        addEmail({
          from: 'm.oyelaran@arunmor.com',
          subj: 'Precisamos de uma amostra',
          body: 'O código do Revelation está em ' + (t ? t.name + ' (' + t.ip + ')' : 'um sistema da Andromeda') +
            '. Copie — não apague. Se apagar, eles sabem que estivemos lá e aceleram o lançamento.',
          kind: 'story'
        });
        beat('Amostra', 'A Arunmor precisa do código do verme.');
      }
    },
    {
      n: 4, wait: 60 * 30,
      run() {
        addSw('faith', 1);
        addEmail({
          from: 'm.oyelaran@arunmor.com',
          subj: 'Faith v1',
          body: 'A primeira versão está no seu gateway. Ela neutraliza cepas v1.\n\n' +
            'Vai começar. Quando começar, sistemas infectados vão aparecer no noticiário. ' +
            'Cada um que você limpar é gente que não perde tudo.',
          kind: 'story'
        });
        beat('Faith entregue', 'A contramedida está no seu gateway.');
        Bus.emit(EV.UI_TOAST, { text: 'Faith v1 instalado no gateway.', kind: 'ok' });
      }
    },
    {
      n: 5, wait: 60 * 40,
      run() {
        addSw('faith', 3);
        addEmail({
          from: 'm.oyelaran@arunmor.com',
          subj: 'Faith v3 — e o pedido final',
          body: 'Faith v3 alcança qualquer cepa conhecida.\n\n' +
            'A Andromeda vai lançar de dentro do próprio sistema central. ' +
            'Entre lá e limpe na origem. É o único jeito de acabar.',
          kind: 'story'
        });
        beat('Faith v3', 'A versão final da contramedida.');
      }
    }
  ]
};

/* =========================================================
   FINAIS
   ========================================================= */
function ending(kind) {
  const st = S.story;
  st.finished = true;
  st.ending = kind;

  if (kind === 'revelation') {
    addPoints(20, 'arco concluído');
    gameOver(
      'REVELATION',
      'O verme atravessou as bases globais em onze minutos.\n\n' +
      'Bancos pararam. Prontuários sumiram. Fichas criminais foram zeradas, ' +
      'inclusive a sua, porque não sobrou banco de dados para guardá-la.\n\n' +
      'A Andromeda pagou o combinado. O dinheiro está numa conta de um banco ' +
      'que não existe mais.\n\n' +
      'Você venceu. Não sobrou nada para ganhar.',
      'ending_revelation'
    );
  } else {
    addPoints(20, 'arco concluído');
    gameOver(
      'FAITH',
      'A cepa foi neutralizada na origem, dentro do sistema que a criou.\n\n' +
      'Não houve notícia. Não houve crédito. Três engenheiros da Andromeda foram ' +
      'presos por algo menor, e o nome Revelation nunca apareceu num jornal.\n\n' +
      'A Arunmor pagou o combinado e apagou o seu registro do sistema deles.\n\n' +
      'Ninguém vai saber. É esse o trabalho.',
      'ending_faith'
    );
  }
}

/* =========================================================
   RELÓGIO
   ========================================================= */
export function tick() {
  const st = S.story || init();
  if (st.finished) return;

  /* despertar: rating razoável e algum tempo de mundo rodado */
  if (!st.started) {
    if (ratingIndex() >= 4 && S.stats.missionsDone >= 6) invite();
    return;
  }

  if (!st.side) return;                    /* esperando a escolha */
  if (S.time < st.nextAt) return;

  const list = PHASES[st.side];
  const next = list.find(p => p.n === st.phase + 1);
  if (!next) { checkEnding(); return; }

  st.phase = next.n;
  st.nextAt = S.time + next.wait;
  next.run();
}

/* O final dispara quando a última arma é usada no alvo certo. */
function checkEnding() {
  const st = S.story;
  if (st.phase < 5) return;

  if (st.side === 'andromeda') {
    const globals = [S.world.iad, S.world.gcd, S.world.ssd, S.world.cmd].map(ip => srv(ip));
    if (globals.some(s => s && s.infected && s.infected.v >= 3)) ending('revelation');
  } else {
    const t = corpServer(ANDROMEDA);
    if (t && !t.infected && S.flags.faithUsedOnAndromeda) ending('faith');
  }
}

/* Chamado por software.js quando o Faith limpa um sistema da Andromeda. */
export function noteFaithUse(server) {
  if (server && server.corp === ANDROMEDA) {
    S.flags.faithUsedOnAndromeda = true;
    checkEnding();
  }
}
