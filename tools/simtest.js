/* =========================================================
   simtest.js — partida simulada, sem navegador.

   Os módulos de `src/core/` são ESM puros e não tocam em DOM, então
   rodam direto no Node. Este teste joga uma partida inteira pela API
   pública e confere que o mundo se comporta: gerar, conectar, quebrar
   camadas, copiar, apagar log, desconectar, entregar, comprar,
   salvar e carregar.

   Sai com código 0 se tudo passar.

   uso: node tools/simtest.js [--verbose]
   ========================================================= */
import { Game } from '../src/core/game.js';
import { S } from '../src/core/state.js';
import { Bus, EV } from '../src/core/bus.js';
import * as Net from '../src/core/net.js';
import * as SW from '../src/core/software.js';
import * as HW from '../src/core/hardware.js';
import * as Missions from '../src/core/missions.js';
import * as Bank from '../src/core/bank.js';
import * as News from '../src/core/news.js';
import * as World from '../src/core/world.js';
import * as F from '../src/core/fmt.js';

const VERBOSE = process.argv.includes('--verbose');

let pass = 0, fail = 0;
const falhas = [];

function ok(cond, label, extra) {
  if (cond) { pass++; if (VERBOSE) console.log('  ✓ ' + label); }
  else {
    fail++; falhas.push(label + (extra ? '  →  ' + extra : ''));
    console.log('  ✗ ' + label + (extra ? '  →  ' + extra : ''));
  }
}
function secao(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 58 - t.length))); }

/* avança o laço: `segundos` de tempo real, em passos de 1/60 */
function avancar(segundos) {
  const passo = 1 / 60;
  for (let i = 0; i < Math.round(segundos / passo); i++) Game.tick(passo);
}
/* roda até uma condição virar verdadeira, ou estourar o limite */
function ate(cond, limiteSegundos, rotulo) {
  const passo = 1 / 60;
  let t = 0;
  while (!cond() && t < limiteSegundos) { Game.tick(passo); t += passo; }
  if (t >= limiteSegundos && VERBOSE) console.log('    (tempo esgotado esperando: ' + rotulo + ')');
  return cond();
}

/* conta os eventos do barramento, para provar que a simulação fala */
const eventos = {};
Bus.on('*', (nome) => { eventos[nome] = (eventos[nome] || 0) + 1; });

/* =========================================================
   1. MUNDO
   ========================================================= */
secao('mundo');
await Game.init();
Game.newGame('agente_teste');

const servidores = Object.values(S.world.servers);
ok(servidores.length > 80, 'mundo tem mais de 80 servidores', servidores.length + ' gerados');
ok(S.world.corps.length >= 20, 'corporações geradas', S.world.corps.length);
ok(S.world.people.length === 220, 'pessoas geradas', S.world.people.length);
ok(S.world.banks.length >= 5, 'bancos gerados', S.world.banks.length);
ok(S.world.socials.length === 4, 'redes sociais geradas');
ok(S.world.cctv.length >= 5, 'centrais de câmera geradas');
ok(servidores.every(s => s.ip && s.name && s.sec), 'todo servidor tem ip, nome e segurança');
ok(new Set(servidores.map(s => s.ip)).size === servidores.length, 'nenhum IP duplicado');
ok(servidores.some(s => s.lan), 'existe pelo menos uma rede interna');
ok(S.playerIP && S.playerIP !== '0.0.0.0', 'agente tem IP', S.playerIP);
ok(S.credits === 3000, 'saldo inicial de 3000c', F.credits(S.credits));
ok(S.software.length >= 6, 'kit inicial instalado', S.software.length + ' programas');
ok(S.email.length >= 2, 'correspondência de boas-vindas chegou');

/* determinismo: o mesmo seed precisa gerar o mesmo mundo */
const w1 = World.generate(999, 'x');
const w2 = World.generate(999, 'x');
ok(JSON.stringify(Object.keys(w1.servers)) === JSON.stringify(Object.keys(w2.servers)),
  'geração é determinística com a mesma semente');

/* =========================================================
   2. CONTRATOS
   ========================================================= */
secao('contratos');
const quadro = Missions.boardView();
ok(quadro.available.length > 0, 'quadro de contratos preenchido', quadro.available.length + ' ofertas');
ok(quadro.available[0].tutorial === true, 'contrato de estreia está no topo');

const estreia = quadro.available[0];
ok(estreia.steps.length >= 5, 'contrato de estreia traz o passo a passo');
const alvoEstreia = S.world.servers[estreia.targetIp];
ok(alvoEstreia.sec.firewall === 0 && alvoEstreia.sec.proxy === 0,
  'alvo de estreia não tem firewall nem proxy');

ok(Missions.accept(estreia.id) === null, 'contrato de estreia aceito');
ok(S.missions.active.length === 1, 'contrato entrou na lista de ativos');

/* =========================================================
   3. ROTA E CONEXÃO
   ========================================================= */
secao('rota e conexão');
const publicos = World.bounceCandidates().filter(s => s.ip !== estreia.targetIp).slice(0, 3);
publicos.forEach(s => Net.addHop(s.ip));
ok(S.conn.route.length === 3, 'rota de bounce com três saltos');

const semAlvo = Net.connect();
ok(typeof semAlvo === 'string', 'conectar sem alvo é recusado', semAlvo);

Net.setTarget(estreia.targetIp);
const erroConn = Net.connect();
ok(erroConn === null, 'discagem iniciada', erroConn || '');
ok(!!S.conn.dial, 'a discagem percorre a rota salto a salto');
/* a discagem leva tempo real: sem isso a conexão não abre */
ok(!ate(() => S.conn.live, 0.3, 'conexão instantânea'),
  'conectar NÃO é instantâneo — a rota é percorrida');
ok(ate(() => S.conn.live, 8, 'discagem'), 'conexão estabelecida ao fim da discagem');
ok(S.conn.live === true, 'conexão está viva');
ok(S.conn.trail.length === 4, 'trilha gravou um log por máquina', S.conn.trail.length + ' elos');
ok(eventos['net:connect:open'] > 0, 'evento de conexão emitido');
ok(eventos['net:hop'] >= 3, 'eventos de salto emitidos');

/* cada máquina da rota gravou de onde veio */
const primeiroSalto = S.world.servers[S.conn.route[0]];
ok(primeiroSalto.logs.some(l => l.fromIP === S.playerIP),
  'o primeiro salto gravou o IP do gateway');

/* =========================================================
   4. QUEBRA DE SENHA
   ========================================================= */
secao('ferramentas');
ok(S.conn.screen === 'login', 'caiu na tela de autenticação');
const alvo = S.world.servers[estreia.targetIp];
ok(Net.login(alvo, 'senha_errada') !== null, 'senha errada é recusada');

ok(SW.breakPassword() === null, 'Password_Breaker iniciado');
ok(S.tasks.length === 1, 'tarefa entrou na fila');
const quebrou = ate(() => alvo.st.logged, 400, 'quebra de senha');
ok(quebrou, 'senha quebrada');
ok(S.tasks.length === 0, 'tarefa saiu da fila ao terminar');
ok(eventos['sw:progress'] > 0, 'progresso da ferramenta foi emitido');
ok(eventos['net:breach'] > 0, 'evento de camada vencida emitido');

/* =========================================================
   5. CÓPIA DE ARQUIVO
   ========================================================= */
secao('cópia de arquivo');
ok(Net.canRead(alvo), 'leitura liberada (sem firewall)');
const alvoArquivo = alvo.files.find(f => f.id === estreia.extra.file.id);
ok(!!alvoArquivo, 'o arquivo pedido está no servidor');

const memAntes = S.memory.length;
ok(SW.copyFile(alvoArquivo.id) === null, 'File_Copier iniciado');
const copiou = ate(() => S.memory.length > memAntes, 400, 'cópia');
ok(copiou, 'arquivo copiado para a memória');
const naMemoria = S.memory[S.memory.length - 1];
ok(naMemoria.src === alvo.ip, 'a cópia sabe de onde veio');

/* copiar é ação ilegal: o trace ativo tem que ter começado se há monitor */
if (alvo.sec.monitor > 0) {
  ok(!!S.conn.trace, 'trace ativo disparou na ação ilegal');
} else {
  ok(S.conn.illegal === true, 'ação foi marcada como ilegal');
}

/* =========================================================
   6. APAGAR O LOG
   ========================================================= */
secao('apagar o log');
const meuLog = alvo.logs.find(l => l.fromIP && !l.deleted);
ok(!!meuLog, 'o log da minha conexão existe no alvo');
ok(SW.wipeLog(meuLog.id) === null, 'Log_Deleter iniciado');
const apagou = ate(() => { const l = alvo.logs.find(x => x.id === meuLog.id); return !l || l.deleted; }, 300, 'apagar log');
ok(apagou, 'log apagado');

/* =========================================================
   7. DESCONEXÃO E TRACE PASSIVO
   ========================================================= */
secao('desconexão');
Net.disconnect();
ok(S.conn.live === false, 'desconectado');
ok(!S.conn.trace, 'trace ativo cancelado ao desconectar');
/* o alvo de estreia tem monitor 0 de propósito: é uma visita guiada,
   e uma visita guiada não pode gerar investigação */
ok(S.passive.length === 0, 'alvo sem monitor não gera investigação passiva');

/* =========================================================
   7b. O TRACE PASSIVO, COM UM ALVO DE VERDADE
   A regra central do Uplink: a trilha inteira intacta te entrega;
   um único elo quebrado te salva.
   ========================================================= */
secao('trace passivo');
const monitorado = Object.values(S.world.servers).find(s =>
  s.sec.monitor > 0 && s.files.length && !s.sec.firewall && !s.lan && s.ip !== estreia.targetIp);
ok(!!monitorado, 'existe um alvo monitorado sem firewall para o teste');

function invadir(apagarTrilha) {
  Net.clearRoute();
  World.bounceCandidates()
    .filter(s => s.ip !== monitorado.ip).slice(0, 2)
    .forEach(s => Net.addHop(s.ip));
  Net.setTarget(monitorado.ip);
  Net.connect({ instant: true });
  monitorado.st.logged = true;            /* atalho: a senha não é o assunto aqui */
  monitorado.st.fwDown = true;
  Net.illegal(monitorado, 2);             /* dispara o monitor */
  const trilha = S.conn.trail.slice();
  if (apagarTrilha) {
    /* quebra o elo do meio: é tudo de que se precisa */
    const meio = trilha[1];
    const s = S.world.servers[meio.ip];
    const log = s.logs.find(l => l.id === meio.logId);
    if (log) log.deleted = true;
  }
  Net.disconnect();
  return S.passive[S.passive.length - 1];
}

/* caso 1: trilha quebrada — a investigação morre no elo apagado */
const bustsA = S.flags.busts || 0;
const pt1 = invadir(true);
ok(!!pt1, 'invasão em alvo monitorado agendou a investigação');
S.time = pt1.due;
avancar(2);
ok((S.flags.busts || 0) === bustsA, 'um elo apagado interrompeu o rastreio');

/* caso 2: trilha intacta — chegam até o gateway e cobram a conta */
const bustsB = S.flags.busts || 0;
const creditosB = S.credits;
const pt2 = invadir(false);
S.time = pt2.due;
avancar(2);
ok((S.flags.busts || 0) === bustsB + 1, 'trilha intacta levou o rastreio até o gateway');
ok(S.credits < creditosB, 'multa aplicada',
  F.credits(creditosB) + ' → ' + F.credits(S.credits));

/* =========================================================
   8. ENTREGA E PAGAMENTO
   ========================================================= */
secao('entrega');
const creditosAntes = S.credits;
const contrato = S.missions.active[0];
const erroEntrega = Missions.deliver(contrato.id, naMemoria.id);
ok(erroEntrega === null, 'entrega aceita', erroEntrega || '');
ok(S.credits > creditosAntes, 'pagamento creditado',
  F.credits(creditosAntes) + ' → ' + F.credits(S.credits));
ok(S.missions.done.length === 1, 'contrato foi para o histórico');
ok(S.points > 0, 'pontos de rating ganhos', S.points + ' pontos');
ok(eventos['mis:done'] === 1, 'evento de contrato concluído emitido');

/* entregar de novo tem que falhar */
ok(typeof Missions.deliver(contrato.id, naMemoria.id) === 'string', 'não dá para entregar duas vezes');

/* =========================================================
   9. LOJA E HARDWARE
   ========================================================= */
secao('loja');
Bank.pay(60000, 'crédito de teste');
const antesCPU = Math.round(HW.cpuPower());
ok(HW.buyCPU('cpu60') === null || S.gateway.cpus.length >= HW.gateway().cpuSlots,
  'compra de CPU respeita os slots do gateway');
ok(typeof HW.buyCPU('cpu400') === 'string', 'CPU acima do teto do chassi é recusada');
ok(HW.buyGateway('gw2') === null, 'gateway BETA comprado');
ok(HW.gateway().id === 'gw2', 'gateway trocado');
ok(HW.buyCPU('cpu100') === null, 'CPU nova cabe no chassi novo');
ok(Math.round(HW.cpuPower()) > antesCPU, 'processamento aumentou',
  antesCPU + ' → ' + Math.round(HW.cpuPower()));

const antesVersao = S.software.find(s => s.id === 'password_breaker').v;
ok(SW.buy('password_breaker') === null, 'atualização de software comprada');
ok(S.software.find(s => s.id === 'password_breaker').v === antesVersao + 1, 'versão subiu');
ok(typeof SW.buy('nao_existe') === 'string', 'item inexistente é recusado');

/* =========================================================
   10. BANCO
   ========================================================= */
secao('banco');
const minha = Bank.playerAccount();
ok(!!minha, 'conta do agente existe');
ok(minha.balance === S.credits, 'saldo da conta bate com os créditos');
const alvoConta = S.world.corps.find(c => c.account);
const bancoAlvo = S.world.servers[alvoConta.account.bank];
const contaAlvo = bancoAlvo.accounts.find(a => a.no === alvoConta.account.no);
const saldoAlvoAntes = contaAlvo.balance;
Bank.learnAccount(contaAlvo.no, contaAlvo.pass);
const errTransf = Bank.transfer(contaAlvo.no, minha.no, 5000);
ok(!errTransf || !errTransf.erro, 'transferência entre contas executada',
  errTransf && errTransf.erro ? errTransf.erro : '');
ok(contaAlvo.balance === saldoAlvoAntes - 5000, 'saldo de origem foi debitado');
ok(Bank.drainedFrom(contaAlvo.no) >= 5000, 'o desvio ficou registrado');

/* =========================================================
   11. NOTÍCIAS E MUNDO REATIVO
   ========================================================= */
secao('mundo reativo');
const noticiasAntes = News.feed().length;
News.report('theft', { target: alvo.name });
S.time += 2000;
avancar(1);
ok(News.feed().length > noticiasAntes, 'a repercussão saiu no noticiário depois do atraso');
ok(S.heat > 0, 'o calor global subiu', S.heat.toFixed(1));

/* =========================================================
   12. SALVAR E CARREGAR
   ========================================================= */
secao('persistência');
const antes = {
  credits: S.credits, time: S.time, points: S.points,
  handle: S.handle, servidores: Object.keys(S.world.servers).length,
  memoria: S.memory.length, software: S.software.length,
  gateway: S.gateway.id, feitos: S.missions.done.length
};
ok(Game.save() === true, 'jogo salvo');
ok(Game.hasSave() === true, 'save detectado');

/* embaralha o estado para provar que o load realmente restaura */
S.credits = 1; S.points = 0; S.time = 0;
ok(Game.load() === true, 'jogo carregado');
ok(S.credits === antes.credits, 'créditos restaurados');
ok(S.time === antes.time, 'relógio restaurado');
ok(S.points === antes.points, 'pontos restaurados');
ok(S.handle === antes.handle, 'handle restaurado');
ok(Object.keys(S.world.servers).length === antes.servidores, 'mundo restaurado inteiro');
ok(S.memory.length === antes.memoria, 'memória do gateway restaurada');
ok(S.gateway.id === antes.gateway, 'hardware restaurado');
ok(S.missions.done.length === antes.feitos, 'histórico de contratos restaurado');

/* o save é JSON puro: nada de função, nada de ciclo */
let serializavel = true, erroSer = '';
try { JSON.parse(JSON.stringify(S)); } catch (e) { serializavel = false; erroSer = e.message; }
ok(serializavel, 'estado é JSON puro sem ciclos', erroSer);

/* =========================================================
   13. RESISTÊNCIA
   ========================================================= */
secao('resistência');
let explodiu = null;
try {
  Game.setSpeed(20);
  avancar(120);                      /* dois minutos reais a 20x = 40 min de jogo */
} catch (e) { explodiu = e.message + '\n' + e.stack; }
ok(!explodiu, 'duas horas de jogo aceleradas sem exceção', explodiu || '');
ok(S.missions.available.length > 0, 'o quadro continua se repondo sozinho');
ok(S.news.length > 0, 'o noticiário continua produzindo');
ok(S.email.length < 200, 'a caixa de entrada não cresce sem limite', S.email.length + ' mensagens');

/* =========================================================
   RESUMO
   ========================================================= */
console.log('\n' + '═'.repeat(62));
console.log('  ' + pass + ' passaram, ' + fail + ' falharam');
if (fail) {
  console.log('\n  falhas:');
  falhas.forEach(f => console.log('    · ' + f));
}
console.log('\n  eventos observados no barramento:');
Object.keys(eventos).sort().forEach(k => console.log('    ' + k.padEnd(24) + eventos[k]));
console.log('═'.repeat(62));

process.exit(fail ? 1 : 0);
