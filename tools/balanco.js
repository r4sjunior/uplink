/* =========================================================
   balanco.js — o quadro de contratos é cumprível?

   Roda partidas simuladas e, a cada degrau de progresso, confere que
   TODO contrato oferecido pode ser cumprido com o arsenal que o
   agente tem na mão. Um contrato que exige uma ferramenta que não se
   possui não é dificuldade: é parede, e o jogador não tem como saber
   disso antes de aceitar.

   Regras verificadas, por tipo de contrato:
     - ler a lista de arquivos exige vencer o FIREWALL
     - escrever (apagar, alterar, transferir) exige vencer o PROXY
     - APAGAR O LOG é escrita, logo todo contrato precisa do proxy
     - a versão da ferramenta precisa ser >= ao nível da camada

   uso: node tools/balanco.js [--verbose]
   ========================================================= */
import { Game } from '../src/core/game.js';
import { S } from '../src/core/state.js';
import * as D from '../src/core/data.js';
import * as SW from '../src/core/software.js';
import * as HW from '../src/core/hardware.js';

const VERBOSE = process.argv.includes('--verbose');

/* o que cada tipo exige */
const EXIGE = {
  steal_file: { ler: 1, escrever: 0 }, delete_file: { ler: 1, escrever: 1 },
  destroy_system: { ler: 1, escrever: 1 }, trace_hacker: { ler: 1, escrever: 0 },
  change_academic: { ler: 1, escrever: 1 }, change_criminal: { ler: 1, escrever: 1 },
  steal_money: { ler: 1, escrever: 1 }, social_post: { ler: 1, escrever: 1 },
  social_wipe: { ler: 1, escrever: 1 }, social_dm: { ler: 1, escrever: 0 },
  cam_footage: { ler: 1, escrever: 0 }, cam_observe: { ler: 1, escrever: 0 },
  cam_loop: { ler: 1, escrever: 1 }
};

function v(id) { const s = S.software.find(x => x.id === id); return s ? s.v : 0; }

/* Diagnóstico honesto: só o que está instalado conta. */
function problemas(m) {
  const t = S.world.servers[m.targetIp];
  if (!t) return ['alvo não existe'];
  const req = EXIGE[m.type] || { ler: 1, escrever: 0 };
  const fw = Math.max(v('firewall_bypass'), v('firewall_disable'));
  const px = Math.max(v('proxy_bypass'), v('proxy_disable'));
  const senha = Math.max(v('password_breaker'), v('dictionary_hacker'));
  const out = [];

  if (t.sec.pass && senha < 1) out.push('senha sem quebrador');
  if (req.ler && t.sec.firewall > fw) {
    out.push('firewall ' + t.sec.firewall + ' > bypass ' + fw);
  }
  /* apagar o log é escrita: vale para TODO contrato, não só os de escrita */
  if (t.sec.proxy > px) {
    out.push('proxy ' + t.sec.proxy + ' > bypass ' + px +
      (req.escrever ? ' (bloqueia o objetivo)' : ' (impede apagar o log)'));
  }
  return out;
}

let falhas = 0, checados = 0;
const relatorio = [];

function auditaQuadro(rotulo) {
  const ruins = [];
  S.missions.available.forEach(m => {
    checados++;
    const p = problemas(m);
    if (p.length) { ruins.push({ m, p }); falhas++; }
  });
  const linha = rotulo.padEnd(42) +
    String(S.missions.available.length).padStart(3) + ' ofertas   ' +
    (ruins.length ? 'IMPOSSÍVEIS: ' + ruins.length : 'todas cumpríveis');
  relatorio.push(linha);
  if (ruins.length || VERBOSE) {
    ruins.forEach(({ m, p }) => {
      const t = S.world.servers[m.targetIp];
      relatorio.push('      ' + m.type.padEnd(16) + t.name.slice(0, 34).padEnd(36) +
        'P' + t.sec.proxy + ' F' + t.sec.firewall + ' M' + t.sec.monitor + '   ' + p.join('; '));
    });
  }
  return ruins.length;
}

/* Percurso de progressão: joga como um jogador jogaria, comprando o
   que faz sentido a cada degrau, e audita o quadro em cada parada. */
for (const seed of ['alfa', 'beta', 'gama']) {
  await Game.init();
  Game.newGame(seed);
  relatorio.push('\n== partida "' + seed + '" ==');

  auditaQuadro('rating 0, kit inicial');

  /* ganha reputação e compra na ordem natural */
  const compras = [
    ['firewall_bypass', 'compra Firewall_Bypass v1'],
    ['proxy_bypass', 'compra Proxy_Bypass v1'],
    ['monitor_bypass', 'compra Monitor_Bypass v1'],
    ['firewall_bypass', 'sobe Firewall_Bypass v2'],
    ['proxy_bypass', 'sobe Proxy_Bypass v2'],
    ['firewall_bypass', 'sobe Firewall_Bypass v3'],
    ['proxy_bypass', 'sobe Proxy_Bypass v3']
  ];
  let pontos = 0;
  for (const [id, rotulo] of compras) {
    /* simula o pagamento dos contratos cumpridos */
    S.credits += 40000;
    pontos += 8;
    S.points = pontos;
    const erro = SW.buy(id);
    S.missions.available.length = 0;
    Game.missions.refresh(true);
    auditaQuadro('rating ' + S.points + 'pt, ' + rotulo + (erro ? ' [' + erro + ']' : ''));
  }
}

/* ===== longo prazo: o mundo endurece, mas os contratos JA ACEITOS
   precisam continuar possiveis ===== */
relatorio.push(String.fromCharCode(10) + '== longo prazo, com o mundo esquentando ==');
await Game.init();
Game.newGame('longo');
S.credits += 200000;
['firewall_bypass', 'proxy_bypass', 'monitor_bypass'].forEach(id => { SW.buy(id); SW.buy(id); });
S.points = 40;
S.missions.available.length = 0;
Game.missions.refresh(true);

const paraAceitar = S.missions.available.slice(0, 5).map(m => m.id);
paraAceitar.forEach(id => Game.missions.accept(id));
const aceitos = S.missions.active.map(m => ({ id: m.id, ip: m.targetIp }));

/* castiga o mundo inteiro: quarenta repercussoes e dez dias */
S.heat = 90;
const todos = Object.values(S.world.servers);
for (let i = 0; i < 40; i++) {
  const a2 = todos[(i * 7) % todos.length];
  Game.news.report('theft', { target: a2.name });
  Game.news.report('destroy', { target: a2.name });
}
S.time += 60 * 24 * 10;
for (let i = 0; i < 600; i++) Game.tick(1 / 60);

let quebrados = 0;
aceitos.forEach(a => {
  const m = S.missions.active.find(x => x.id === a.id);
  if (!m) return;
  checados++;
  const p = problemas(m);
  if (p.length) {
    quebrados++; falhas++;
    const t = S.world.servers[m.targetIp];
    relatorio.push('      CONTRATO ACEITO VIROU PAREDE: ' + m.type + ' em ' + t.name +
      '  P' + t.sec.proxy + ' F' + t.sec.firewall + '   ' + p.join('; '));
  }
});
relatorio.push('  contratos aceitos apos o mundo esquentar: ' +
  aceitos.length + ' auditados, ' + quebrados + ' quebrados');

S.missions.available.length = 0;
Game.missions.refresh(true);
auditaQuadro('  quadro novo com calor 90');

console.log(relatorio.join('\n'));
console.log('\n' + '='.repeat(78));
console.log('  contratos auditados: ' + checados + '   impossíveis: ' + falhas);
console.log('='.repeat(78));
process.exit(falhas ? 1 : 0);
