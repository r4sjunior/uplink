/* =========================================================
   missions.js — os contratos.

   Um contrato é uma promessa verificável: um objetivo escrito em
   dados, não em texto. `check()` roda a cada tique e olha o mundo
   para decidir se a promessa foi cumprida. É por isso que o jogador
   pode cumprir um contrato "por acidente", fazendo o que ele pedia
   antes mesmo de aceitá-lo — e é por isso que trapacear editando o
   texto não adianta.

   A curva de dificuldade tem dois tetos, não um. O ORÇAMENTO limita
   a soma das camadas do alvo; o TETO POR CAMADA limita o nível de
   cada uma. Isso existe porque proxy e firewall só caem com um
   bypass de versão igual ou maior, e o preço desses programas dobra
   a cada versão: oferecer um firewall 4 a quem tem 3.000 créditos
   não é dificuldade, é parede.
   ========================================================= */
import * as D from './data.js';
import * as F from './fmt.js';
import { Bus, EV } from './bus.js';
import {
  S, R, srv, person, corp, addEmail, addPoints, addNeuro, bump,
  ratingIndex, ratingName, flag
} from './state.js';
import * as World from './world.js';
import * as Bank from './bank.js';
import * as News from './news.js';

/* Quantos contratos ficam em oferta ao mesmo tempo. */
const BOARD_SIZE = 9;
/* Quantos podem estar aceitos simultaneamente. */
export const MAX_ACTIVE = 5;

/* =========================================================
   TETOS POR RATING
   ========================================================= */
function limits() {
  const r = ratingIndex();
  return {
    /* teto de proxy e firewall */
    layer: r === 0 ? 1 : r <= 1 ? 1 : r <= 3 ? 2 : r <= 5 ? 3 : r <= 7 ? 4 : 5,
    /* o monitor anda dois degraus à frente: não barra nada, só encurta o trace */
    monitor: r <= 1 ? 3 : r <= 3 ? 4 : 5,
    /* quantos tipos de contrato estão liberados */
    types: r === 0 ? 2 : r === 1 ? 4 : r <= 3 ? 8 : r <= 5 ? 11 : 13
  };
}

function allowedTypes() {
  const r = ratingIndex();
  const lim = limits();
  return D.MISSION_TYPES.filter(t => t.minRating <= r).slice(0, lim.types);
}

/* =========================================================
   GERAÇÃO
   ========================================================= */

function employer() {
  const c = R.pick(S.world.corps.filter(x => !x.story));
  return {
    corp: c.name,
    contact: R.pick(D.FIRST) + ' ' + R.pick(D.LAST),
    intro: R.pick(D.EMPLOYER_INTRO),
    outro: R.pick(D.EMPLOYER_OUTRO)
  };
}

function reward(type, target) {
  const [lo, hi] = type.reward;
  const base = R.int(lo, hi);
  /* alvo mais duro paga mais; o calor do mundo também empurra o preço */
  const layers = target ? (target.sec.proxy + target.sec.firewall + target.sec.monitor) : 0;
  return Math.round(base * (1 + layers * 0.06) * (1 + S.heat / 300));
}

/* O prazo é generoso de propósito: o aperto do jogo é o trace, não o relógio. */
function deadline(type) {
  return S.time + R.int(3, 9) * 24 * 60;
}

/* Escolhe o alvo respeitando os dois tetos. */
function targetFor(typeId, lim) {
  const base = { maxLayer: lim.layer, maxMonitor: lim.monitor };

  switch (typeId) {
    case 'steal_file':
      /* no rating 0 o kit inicial não tem Firewall_Bypass: o alvo
         não pode ter firewall, senão o contrato é impossível */
      return World.pickTarget(R, Object.assign({}, base, {
        needFiles: true, types: ['mainframe', 'files', 'public'],
        noFirewall: ratingIndex() === 0
      }));
    case 'delete_file':
    case 'destroy_system':
      return World.pickTarget(R, Object.assign({}, base, {
        needFiles: true, types: ['mainframe', 'files', 'public'],
        noProxy: ratingIndex() === 0
      }));
    case 'trace_hacker':
      return World.pickTarget(R, Object.assign({}, base, { types: ['public', 'files', 'mainframe'] }));
    case 'change_academic':
      return srv(S.world.iad);
    case 'change_criminal':
      return srv(S.world.gcd);
    case 'steal_money':
      return srv(R.pick(S.world.banks));
    case 'social_post':
    case 'social_wipe':
    case 'social_dm':
      return srv(R.pick(S.world.socials));
    case 'cam_footage':
    case 'cam_observe':
    case 'cam_loop': {
      const pool = S.world.cctv.map(ip => srv(ip))
        .filter(s => s.sec.proxy <= lim.layer && s.sec.firewall <= lim.layer);
      return pool.length ? R.pick(pool) : srv(S.world.cctv[0]);
    }
    default:
      return World.pickTarget(R, base);
  }
}

/* Monta o objetivo verificável e o texto que o jogador lê. */
function objective(typeId, target) {
  switch (typeId) {

    case 'steal_file': {
      const f = R.pick(target.files);
      return {
        goal: { kind: 'have_file', fileId: f.id, ip: target.ip, deliver: true },
        file: { id: f.id, name: f.name, size: f.size, enc: f.enc },
        brief: 'Existe um arquivo chamado **' + f.name + '** no servidor ' + target.name +
          ' (' + target.ip + '). Precisamos dele. Copie, descriptografe se necessário e ' +
          'envie pelo e-mail em resposta a este contrato.',
        steps: [
          'Monte uma rota de bounce com pelo menos três saltos.',
          'Conecte em ' + target.ip + ' e vença a autenticação.',
          'Use o File_Copier em ' + f.name + '.',
          f.enc ? 'Descriptografe o arquivo (nível ' + f.enc + ') na sua memória.' : null,
          'Apague o log da sua conexão antes de sair.',
          'Anexe o arquivo na resposta deste contrato.'
        ].filter(Boolean)
      };
    }

    case 'delete_file': {
      const f = R.pick(target.files);
      return {
        goal: { kind: 'file_gone', fileId: f.id, ip: target.ip },
        file: { id: f.id, name: f.name },
        brief: 'O arquivo **' + f.name + '** em ' + target.name + ' (' + target.ip + ') ' +
          'não deveria existir. Faça com que não exista mais.',
        steps: [
          'Você precisa de acesso de ESCRITA: o proxy tem que cair.',
          'Conecte em ' + target.ip + '.',
          'Use o File_Deleter em ' + f.name + '.',
          'Apague o log antes de desconectar.'
        ]
      };
    }

    case 'destroy_system':
      return {
        goal: { kind: 'system_wiped', ip: target.ip },
        brief: 'Queremos ' + target.name + ' (' + target.ip + ') fora do ar. ' +
          'Apague tudo. Não queremos que sobre nada para restaurar.',
        steps: [
          'Vença proxy e firewall — você vai precisar dos dois.',
          'Abra o console administrativo e execute "delete all".',
          'Ou apague os arquivos um a um, se preferir ser discreto.',
          'Isto é barulhento. Tenha uma rota longa e apague os logs.'
        ]
      };

    case 'trace_hacker': {
      const handle = R.pick(D.HANDLES);
      const from = World.pickTarget(R, { types: ['public', 'files'] }) || target;
      /* planta a trilha: um log apagado no alvo aponta para o servidor
         de onde o invasor veio */
      return {
        goal: { kind: 'report_ip', ip: target.ip, answer: from.ip, handle: handle },
        brief: 'Alguém que se identifica como **' + handle + '** invadiu ' + target.name +
          ' (' + target.ip + ') e apagou os registros. Recupere os logs e nos diga ' +
          'de qual endereço a conexão veio.',
        steps: [
          'Conecte em ' + target.ip + ' com acesso de leitura.',
          'Use o Log_UnDeleter para recuperar os registros apagados.',
          'Leia o log de roteamento e anote o IP de origem.',
          'Responda a este contrato informando o endereço.'
        ]
      };
    }

    case 'change_academic': {
      const p = R.pick(S.world.people);
      const degree = R.pick(D.DEGREES);
      const wipe = R.chance(0.4);
      return {
        goal: wipe
          ? { kind: 'academic_wiped', personId: p.id }
          : { kind: 'academic_has', personId: p.id, degree: degree },
        person: { id: p.id, name: p.name },
        brief: wipe
          ? 'Apague o histórico acadêmico de **' + p.name + '** na International Academic Database.'
          : 'Adicione um diploma de **' + degree + '** ao registro de **' + p.name +
            '** na International Academic Database.',
        steps: [
          'A IAD tem segurança alta e fixa: proxy, firewall e monitor.',
          'Você precisa de acesso de ESCRITA.',
          'Busque a pessoa pelo nome e edite o registro.',
          'Apague os logs. A IAD é auditada semanalmente.'
        ]
      };
    }

    case 'change_criminal': {
      const p = R.pick(S.world.people);
      const plant = R.chance(0.5);
      const crime = R.pick(D.CRIMES);
      return {
        goal: plant
          ? { kind: 'criminal_has', personId: p.id, crime: crime }
          : { kind: 'criminal_clean', personId: p.id },
        person: { id: p.id, name: p.name },
        brief: plant
          ? 'Insira uma condenação por **' + crime + '** na ficha de **' + p.name +
            '** no Global Criminal Database.'
          : 'Limpe a ficha criminal de **' + p.name + '** no Global Criminal Database.',
        steps: [
          'O GCD é o sistema mais protegido do mundo civil.',
          'Acesso de escrita é obrigatório, e o monitor está no máximo.',
          'Edite a ficha e saia rápido.',
          'Apague TODOS os logs. Este é o tipo de contrato que prende gente.'
        ]
      };
    }

    case 'steal_money': {
      /* rouba de uma conta corporativa gorda: é a que ninguém confere no dia */
      const c = R.pick(S.world.corps.filter(x => x.account));
      const bank = srv(c.account.bank);
      const amount = R.int(20000, 90000);
      return {
        goal: { kind: 'money_moved', from: c.account.no, amount: amount },
        account: { no: c.account.no, bank: bank.name, owner: c.name },
        brief: 'Transfira **' + F.credits(amount) + '** da conta ' + c.account.no +
          ' (' + c.name + ', ' + bank.name + ') para onde quiser. Metade é sua; ' +
          'o resto some. Não queremos saber como.',
        steps: [
          'Você precisa do número E da senha da conta de origem.',
          'A senha costuma estar num arquivo do servidor da própria empresa.',
          'Conecte no banco, entre na conta e transfira.',
          'Bancos guardam log dos dois lados. Apague os dois.',
          'Dinheiro sujo demais chama auditoria: considere lavar em contas de passagem.'
        ]
      };
    }

    case 'social_post': {
      const p = R.pick(S.world.people);
      const text = R.pick(D.PLANT_POSTS);
      return {
        goal: { kind: 'social_posted', personId: p.id, ip: target.ip },
        person: { id: p.id, name: p.name },
        postText: text,
        brief: 'Publique em nome de **' + p.name + '** em ' + target.name + '. ' +
          'O texto é este, palavra por palavra: "' + text + '"',
        steps: [
          'Entre no painel de moderação da plataforma.',
          'Encontre o perfil pelo nome.',
          'Publique como se fosse a pessoa.',
          'Apague o log do servidor.'
        ]
      };
    }

    case 'social_wipe': {
      const p = R.pick(S.world.people);
      return {
        goal: { kind: 'social_wiped', personId: p.id, ip: target.ip },
        person: { id: p.id, name: p.name },
        brief: 'Apague todas as publicações de **' + p.name + '** em ' + target.name + '. ' +
          'Todas mesmo. O perfil pode ficar, o rastro não.',
        steps: [
          'Acesso de escrita é obrigatório.',
          'Abra o perfil e remova as publicações uma a uma.',
          'Confira se não sobrou nada antes de sair.',
          'Apague o log.'
        ]
      };
    }

    case 'social_dm': {
      const p = R.pick(S.world.people);
      return {
        goal: { kind: 'have_dm', personId: p.id, ip: target.ip, deliver: true },
        person: { id: p.id, name: p.name },
        brief: 'Extraia as mensagens privadas de **' + p.name + '** em ' + target.name +
          ' e envie o arquivo para nós.',
        steps: [
          'Entre no painel da plataforma.',
          'Abra as mensagens privadas do perfil.',
          'Exporte a conversa para a memória do gateway.',
          'Anexe o arquivo na resposta deste contrato.'
        ]
      };
    }

    case 'cam_footage': {
      const f = R.pick(target.files);
      return {
        goal: { kind: 'have_file', fileId: f.id, ip: target.ip, deliver: true },
        file: { id: f.id, name: f.name, size: f.size, enc: f.enc },
        brief: 'Precisamos da gravação **' + f.name + '** da central de câmeras ' +
          target.name + ' (' + target.ip + '). Copie e envie.',
        steps: [
          'Conecte em ' + target.ip + '.',
          'Abra a central de vídeo e vá ao arquivo de gravações.',
          'Copie ' + f.name + ' para a memória.',
          f.enc ? 'Descriptografe antes de enviar.' : null,
          'Apague o log e responda ao contrato com o anexo.'
        ].filter(Boolean)
      };
    }

    case 'cam_observe': {
      const cam = R.pick(target.cams);
      const minutes = R.int(3, 6);
      return {
        goal: { kind: 'cam_watched', ip: target.ip, camId: cam.id, minutes: minutes },
        cam: { id: cam.id, label: cam.label },
        brief: 'Assista à câmera **' + cam.label + '** em ' + target.name +
          ' por ' + minutes + ' minutos seguidos e nos diga o que viu. ' +
          'Mantenha a conexão aberta o tempo todo.',
        steps: [
          'Conecte e abra a central de vídeo.',
          'Amplie a câmera ' + cam.label + '.',
          'Fique ' + minutes + ' minutos de jogo com ela aberta.',
          'Desconectar antes do tempo zera a contagem.',
          'Uma rota longa dá mais tempo de trace: você vai precisar.'
        ]
      };
    }

    case 'cam_loop': {
      const cam = R.pick(target.cams);
      const minutes = R.int(4, 8);
      return {
        goal: { kind: 'cam_looped', ip: target.ip, camId: cam.id, minutes: minutes },
        cam: { id: cam.id, label: cam.label },
        brief: 'Nossa equipe entra às escuras. Congele a câmera **' + cam.label +
          '** em ' + target.name + ' por ' + minutes + ' minutos. ' +
          'Se a imagem voltar antes, eles são presos.',
        steps: [
          'Acesso de escrita é obrigatório para injetar o loop.',
          'Abra a central de vídeo e ative o loop na câmera ' + cam.label + '.',
          'Mantenha a conexão viva por ' + minutes + ' minutos de jogo.',
          'Apague o log — a lacuna na gravação já é evidência suficiente.'
        ]
      };
    }

    default:
      return { goal: { kind: 'none' }, brief: 'Contrato malformado.', steps: [] };
  }
}

/* =========================================================
   O QUADRO DE OFERTAS
   ========================================================= */
export function offer() {
  const lim = limits();
  const types = allowedTypes();
  if (!types.length) return null;

  const type = R.pick(types);
  const target = targetFor(type.id, lim);
  if (!target) return null;
  if (type.id === 'steal_file' && (!target.files || !target.files.length)) return null;
  if (type.id === 'cam_observe' && (!target.cams || !target.cams.length)) return null;

  const obj = objective(type.id, target);
  if (!obj || !obj.goal) return null;

  const emp = employer();
  const m = {
    id: R.uid('m'),
    type: type.id,
    title: type.title,
    employer: emp,
    targetIp: target.ip,
    targetName: target.name,
    reward: reward(type, target),
    points: 1 + type.diff,
    neuro: type.id === 'change_criminal' || type.id === 'steal_money' ? 2 : (type.diff >= 3 ? 1 : 0),
    difficulty: type.diff,
    postedAt: S.time,
    deadline: deadline(type),
    goal: obj.goal,
    brief: obj.brief,
    steps: obj.steps,
    extra: {
      file: obj.file || null, person: obj.person || null,
      account: obj.account || null, cam: obj.cam || null,
      postText: obj.postText || null
    },
    /* progresso de objetivos que contam tempo */
    progress: 0,
    status: 'open'
  };
  return m;
}

/* Repõe o quadro até BOARD_SIZE. */
export function refresh(force) {
  const av = S.missions.available;
  /* expira as ofertas velhas que ninguém pegou */
  for (let i = av.length - 1; i >= 0; i--) {
    if (S.time > av[i].deadline) av.splice(i, 1);
  }
  let guard = 0;
  while (av.length < BOARD_SIZE && guard++ < 60) {
    const m = offer();
    if (m && !av.some(x => x.type === m.type && x.targetIp === m.targetIp)) {
      av.push(m);
      if (!force) Bus.emit(EV.MISSION_NEW, { id: m.id, title: m.title });
    }
  }
  av.sort((a, b) => a.difficulty - b.difficulty || a.reward - b.reward);
}

/* =========================================================
   O CONTRATO DE ESTREIA
   Garantido no topo da lista, no primeiro minuto de jogo: um CFTV
   antigo com senha de fábrica, sem firewall, sem proxy, trace lento
   e arquivo pequeno sem criptografia. Serve de visita guiada.
   ========================================================= */
export function firstContract() {
  const target = srv(S.world.cctv.find(ip => srv(ip).sec.proxy === 0 && srv(ip).sec.firewall === 0))
    || srv(S.world.cctv[0]);
  const f = target.files.find(x => !x.enc) || target.files[0];

  const m = {
    id: R.uid('m'),
    type: 'cam_footage',
    title: 'Primeiro trabalho: uma gravação esquecida',
    employer: {
      corp: 'Uplink Corporation',
      contact: 'Departamento de Integração',
      intro: 'Bem-vindo. Este é o seu contrato de treinamento — o pagamento é real.',
      outro: 'Faça exatamente como está escrito e você não vai errar.'
    },
    targetIp: target.ip,
    targetName: target.name,
    reward: 2200,
    points: 2,
    neuro: 0,
    difficulty: 0,
    postedAt: S.time,
    deadline: S.time + 14 * 24 * 60,
    goal: { kind: 'have_file', fileId: f.id, ip: target.ip, deliver: true },
    brief: 'A central de câmeras do **' + target.name + '** roda um sistema antigo: ' +
      'a senha de fábrica nunca foi trocada, não há firewall e não há proxy. ' +
      'Copie a gravação **' + f.name + '** e envie para nós. ' +
      'Leia os passos abaixo com calma — eles valem para todo contrato daqui em diante.',
    steps: [
      'Abra ROTA e adicione dois ou três servidores públicos ao seu caminho. ' +
        'Cada salto aumenta o tempo que o trace leva para chegar em você.',
      'Defina ' + target.ip + ' como alvo e conecte.',
      'Na tela de login, use o Password_Breaker (ou tente "admin" — é senha de fábrica).',
      'Abra o arquivo de gravações e copie ' + f.name + ' com o File_Copier.',
      'Antes de sair, abra os LOGS do servidor e apague o registro da sua conexão. ' +
        'Este é o passo que mata iniciante.',
      'Desconecte e responda a este contrato anexando o arquivo pelo e-mail.'
    ],
    extra: { file: { id: f.id, name: f.name, size: f.size, enc: f.enc }, person: null, account: null, cam: null, postText: null },
    progress: 0,
    status: 'open',
    tutorial: true
  };
  S.missions.available.unshift(m);
  return m;
}

/* =========================================================
   ACEITAR / ABANDONAR
   ========================================================= */
export function accept(id) {
  const i = S.missions.available.findIndex(m => m.id === id);
  if (i < 0) return 'Contrato não está mais disponível.';
  if (S.missions.active.length >= MAX_ACTIVE) {
    return 'Você já tem ' + MAX_ACTIVE + ' contratos aceitos. Termine ou abandone um.';
  }
  const m = S.missions.available.splice(i, 1)[0];
  m.status = 'active';
  m.acceptedAt = S.time;
  S.missions.active.push(m);

  /* O endereço do alvo vem escrito no contrato, então ele entra na
     agenda. Sem isso o jogador recebe "invada tal servidor" e não
     tem como localizá-lo no mapa — o alvo simplesmente não aparece. */
  if (m.targetIp && !S.links.includes(m.targetIp)) {
    S.links.push(m.targetIp);
    Bus.emit(EV.LINK_NEW, { ip: m.targetIp, name: m.targetName });
  }

  addEmail({
    from: m.employer.contact + ' <' + F.slug(m.employer.corp) + '.com>',
    subj: 'Contrato aceito: ' + m.title,
    body: m.employer.intro + '\n\n' + m.brief + '\n\n' +
      'PASSOS:\n' + m.steps.map((s, k) => '  ' + (k + 1) + '. ' + s).join('\n') +
      '\n\nPagamento na entrega: ' + F.credits(m.reward) + '.\n' +
      'Prazo: ' + F.fmtDate(m.deadline) + '.\n\n' + m.employer.outro,
    mission: m.id,
    kind: 'mission'
  });

  Bus.emit(EV.MISSION_TAKEN, { id: m.id, title: m.title, reward: m.reward });
  Bus.emit(EV.SFX, { name: 'mission_take' });
  return null;
}

export function abandon(id) {
  const i = S.missions.active.findIndex(m => m.id === id);
  if (i < 0) return 'Contrato não encontrado.';
  const m = S.missions.active.splice(i, 1)[0];
  S.missions.failed++;
  addPoints(-1, 'contrato abandonado');
  addEmail({
    from: m.employer.contact + ' <' + F.slug(m.employer.corp) + '.com>',
    subj: 'Contrato cancelado: ' + m.title,
    body: 'Registramos a sua desistência. Não é o fim do mundo, mas também não passa em branco: ' +
      'a Uplink foi informada.',
    kind: 'mission'
  });
  Bus.emit(EV.MISSION_FAIL, { id: m.id, title: m.title, reason: 'abandonado' });
  return null;
}

/* =========================================================
   VERIFICAÇÃO
   Roda a cada minuto de jogo sobre todos os contratos aceitos.
   ========================================================= */
function met(m) {
  const g = m.goal;
  const t = srv(g.ip);

  switch (g.kind) {
    case 'have_file': {
      /* precisa estar na memória, vindo do servidor certo e legível */
      const f = S.memory.find(x => x.fileId === g.fileId && x.src === g.ip);
      return !!f && !f.enc;
    }
    case 'have_dm': {
      const f = S.memory.find(x => x.tag === 'dm:' + g.personId && x.src === g.ip);
      return !!f && !f.enc;
    }
    case 'file_gone':
      return !!t && !t.files.some(f => f.id === g.fileId);
    case 'system_wiped':
      return !!t && t.files.length === 0;
    case 'academic_wiped': {
      const p = person(g.personId);
      return !!p && p.academic.wiped;
    }
    case 'academic_has': {
      const p = person(g.personId);
      return !!p && (p.academic.degree === g.degree ||
        p.academic.extra.some(e => e.degree === g.degree));
    }
    case 'criminal_has': {
      const p = person(g.personId);
      return !!p && p.criminal.some(c => c.crime === g.crime);
    }
    case 'criminal_clean': {
      const p = person(g.personId);
      return !!p && p.criminal.length === 0;
    }
    case 'money_moved':
      return Bank.drainedFrom(g.from) >= g.amount;
    case 'social_posted':
      return !!(S.flags.socialPosted && S.flags.socialPosted[g.personId]);
    case 'social_wiped':
      return !!(S.flags.socialWiped && S.flags.socialWiped[g.personId]);
    case 'cam_watched':
    case 'cam_looped':
      return m.progress >= g.minutes;
    case 'report_ip':
      return m.reported === g.answer;
    default:
      return false;
  }
}

/* Contratos com objetivo de tempo acumulam progresso enquanto a
   condição estiver valendo e a conexão viva. */
function accrue(m) {
  const g = m.goal;
  if (g.kind !== 'cam_watched' && g.kind !== 'cam_looped') return;
  const live = S.conn.live && S.conn.target === g.ip;
  if (!live) { m.progress = 0; return; }

  const t = srv(g.ip);
  const cam = t && t.cams ? t.cams.find(c => c.id === g.camId) : null;
  if (!cam) { m.progress = 0; return; }

  if (g.kind === 'cam_looped') {
    if (cam.looped) m.progress += 1; else m.progress = 0;
  } else {
    if (S.conn.watching === g.camId) m.progress += 1; else m.progress = 0;
  }
}

/* Contratos de entrega só fecham quando o e-mail é respondido com
   o anexo certo. Os demais fecham sozinhos. */
export function check() {
  for (let i = S.missions.active.length - 1; i >= 0; i--) {
    const m = S.missions.active[i];
    accrue(m);

    if (S.time > m.deadline) { fail(m, 'prazo esgotado'); continue; }
    if (m.goal.deliver) continue;          /* espera a entrega por e-mail */
    if (met(m)) complete(m);
  }
}

/* Entrega por e-mail: chamada pela tela de e-mail. */
export function deliver(missionId, memId) {
  const m = S.missions.active.find(x => x.id === missionId);
  if (!m) return 'Contrato não encontrado.';
  if (!m.goal.deliver) return 'Este contrato não pede entrega de arquivo.';

  const f = S.memory.find(x => x.id === memId);
  if (!f) return 'Arquivo não está na memória do gateway.';

  const g = m.goal;
  const wantId = g.kind === 'have_dm' ? null : g.fileId;
  const okFile = g.kind === 'have_dm'
    ? f.tag === 'dm:' + g.personId
    : f.fileId === wantId;

  if (!okFile) {
    addEmail({
      from: m.employer.contact + ' <' + F.slug(m.employer.corp) + '.com>',
      subj: 'Re: ' + m.title + ' — anexo recusado',
      body: 'Isso não é o que pedimos. Confira o nome do arquivo e o servidor de origem. ' +
        'O contrato continua aberto.',
      kind: 'mission'
    });
    return 'Anexo errado. O contrato continua aberto.';
  }
  if (f.src !== g.ip) {
    return 'Este arquivo não veio de ' + g.ip + '. Precisa ser o do servidor pedido.';
  }
  if (f.enc) {
    return 'O arquivo ainda está criptografado (nível ' + f.enc + '). Descriptografe antes de enviar.';
  }

  complete(m);
  return null;
}

/* Resposta de contrato de rastreio. */
export function report(missionId, answerIp) {
  const m = S.missions.active.find(x => x.id === missionId);
  if (!m || m.goal.kind !== 'report_ip') return 'Contrato não encontrado.';
  m.reported = String(answerIp || '').trim();
  if (m.reported !== m.goal.answer) {
    addEmail({
      from: m.employer.contact + ' <' + F.slug(m.employer.corp) + '.com>',
      subj: 'Re: ' + m.title + ' — endereço incorreto',
      body: 'Esse endereço não corresponde a nada. Recupere os logs apagados e olhe de novo.',
      kind: 'mission'
    });
    return 'Endereço incorreto.';
  }
  complete(m);
  return null;
}

/* =========================================================
   FECHAMENTO
   ========================================================= */
function complete(m) {
  const i = S.missions.active.indexOf(m);
  if (i >= 0) S.missions.active.splice(i, 1);
  m.status = 'done';
  m.doneAt = S.time;
  S.missions.done.push({ id: m.id, title: m.title, reward: m.reward, at: S.time, type: m.type });
  if (S.missions.done.length > 80) S.missions.done.shift();

  Bank.pay(m.reward, 'Contrato: ' + m.title, { taint: m.type === 'steal_money' ? 0.4 : 0 });
  addPoints(m.points, 'contrato concluído');
  if (m.neuro) addNeuro(m.neuro);
  bump('missionsDone');

  addEmail({
    from: m.employer.contact + ' <' + F.slug(m.employer.corp) + '.com>',
    subj: 'Pagamento liberado: ' + m.title,
    body: m.employer.outro + '\n\n' +
      F.credits(m.reward) + ' foram creditados na sua conta.\n' +
      'Rating: ' + ratingName() + '.\n\nNão nos procure. Nós procuramos você.',
    kind: 'mission'
  });

  Bus.emit(EV.MISSION_DONE, { id: m.id, title: m.title, reward: m.reward, points: m.points });
  Bus.emit(EV.SFX, { name: 'mission_done' });
  Bus.emit(EV.UI_TOAST, { text: 'Contrato concluído: ' + F.credits(m.reward), kind: 'ok' });
}

function fail(m, reason) {
  const i = S.missions.active.indexOf(m);
  if (i >= 0) S.missions.active.splice(i, 1);
  S.missions.failed++;
  bump('missionsFailed');
  addPoints(-2, 'contrato falhado');

  addEmail({
    from: m.employer.contact + ' <' + F.slug(m.employer.corp) + '.com>',
    subj: 'Contrato encerrado sem entrega: ' + m.title,
    body: 'O prazo venceu e o serviço não foi feito. Contratamos outra pessoa. ' +
      'A Uplink registrou a falha no seu histórico.',
    kind: 'mission'
  });

  Bus.emit(EV.MISSION_FAIL, { id: m.id, title: m.title, reason: reason });
  Bus.emit(EV.UI_TOAST, { text: 'Contrato falhado: ' + m.title, kind: 'bad' });
}

/* =========================================================
   RELÓGIO
   ========================================================= */
export function tick() {
  check();
  /* o quadro se renova devagar: uma oferta nova a cada ~2 horas de jogo */
  if (!S.flags.nextOffer || S.time >= S.flags.nextOffer) {
    S.flags.nextOffer = S.time + R.int(70, 170);
    refresh();
  }
}

/* Visão pronta para a interface. */
export function boardView() {
  return {
    available: S.missions.available.map(view),
    active: S.missions.active.map(view),
    done: S.missions.done.slice(-20).reverse(),
    failed: S.missions.failed,
    slots: { used: S.missions.active.length, max: MAX_ACTIVE }
  };
}

function view(m) {
  return {
    id: m.id, type: m.type, title: m.title,
    employer: m.employer.corp, contact: m.employer.contact,
    targetIp: m.targetIp, targetName: m.targetName,
    reward: m.reward, difficulty: m.difficulty,
    deadline: m.deadline, remaining: m.deadline - S.time,
    brief: m.brief, steps: m.steps, extra: m.extra,
    needsDelivery: !!m.goal.deliver,
    progress: m.progress || 0,
    progressOf: (m.goal.minutes || 0),
    tutorial: !!m.tutorial,
    status: m.status
  };
}
